// [P1-CLINICAL-FAIL-CLOSED · 2026-08-11] El perfil clínico se podía borrar solo.
//
// EL DEFECTO, que era el único de los tres paneles de Ajustes sin cerrar. `load()`
// hacía `if (res.ok)` SIN `else`: ante un 4xx/5xx la función salía por el `finally`
// sin tocar el estado, sin toast y sin bloquear nada. El `catch` no lo veía porque
// solo atrapa fallos de RED — y un 500 no es un fallo de red, es una respuesta.
//
// Lo que veía el usuario: su perfil clínico VACÍO —laboratorios en blanco, síntomas
// desmarcados, texto libre borrado— con «Guardar perfil clínico» tan activo como
// siempre. Un clic escribía ese vacío encima de sus datos reales.
//
// Es exactamente el defecto que ya ocurrió en Súper Personalización en julio
// (P2-SUPERPERS-FAIL-CLOSED) y que allí se cerró. Aquí seguía abierto.
//
// POR QUÉ AHORA: con el autoguardado no hay botón que bloquear. Bastaría con rozar un
// chip para perder el perfil, y sin que medie ninguna acción que el usuario reconozca
// como «guardar». Por eso este cierre es prerequisito y no una mejora suelta.
//
// Se prueba el COMPORTAMIENTO, no el texto de las declaraciones: se monta el panel con
// el servidor caído y se comprueba que no hay formulario que rellenar y que jamás sale
// un PUT. Un guard que solo leyera el fuente pasaría con un `loadFailed` declarado y
// nunca consultado.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import ClinicalProfilePanel from '../components/settings/ClinicalProfilePanel';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ENDPOINT = '/api/user/preferences/clinical-profile';
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

/** El panel reintenta una vez a los 800ms antes de rendirse, así que hay que darle
 *  margen o el test mide el estado intermedio y no el final. */
const ESPERA = { timeout: 4000 };

const PERFIL_REAL = {
    clinical_profile: {
        labs: { hba1c: '5.4' },
        giSymptoms: ['reflujo'],
        training: { type: 'fuerza', timeOfDay: 'noche', daysPerWeek: 4 },
        freeText: 'Me quitaron la vesícula en 2024.',
    },
};

describe('[P1-CLINICAL-FAIL-CLOSED] un servidor caído no puede vaciarte el perfil', () => {
    beforeEach(() => vi.clearAllMocks());

    it('con la carga OK, el formulario se pinta con TUS datos (control)', async () => {
        // Sin este control, los casos de abajo pasarían aunque el panel no renderizara
        // nunca nada: «no hay formulario» sería cierto por vacío.
        fetchWithAuth.mockResolvedValue(respuesta(PERFIL_REAL));
        render(<ClinicalProfilePanel />, { customContext: { updateData: vi.fn() } });

        expect(await screen.findByText(/Guardar perfil clínico/i)).toBeInTheDocument();
        expect(screen.getByDisplayValue('5.4')).toBeInTheDocument();
        expect(screen.getByDisplayValue(/vesícula/i)).toBeInTheDocument();
    });

    it('un 500 bloquea el panel: ni formulario vacío ni botón de guardar', async () => {
        // EL CASO. Antes: `res.ok === false` no hacía nada, el panel quedaba en EMPTY
        // y el botón activo. Ahora: pantalla de reintento.
        fetchWithAuth.mockResolvedValue(respuesta({ detail: 'boom' }, false, 500));
        render(<ClinicalProfilePanel />, { customContext: { updateData: vi.fn() } });

        expect(await screen.findByText(/No pudimos cargar tu perfil clínico/i, {}, ESPERA))
            .toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
        expect(
            screen.queryByText(/Guardar perfil clínico/i),
            'el botón de guardar sigue vivo sobre un panel vacío: un clic borra el perfil',
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText(/Digestión/i),
            'se está pintando el formulario vacío y editable, que es justo lo que no debe pasar',
        ).not.toBeInTheDocument();
    });

    it('mientras está bloqueado NO sale ningún PUT', async () => {
        // La afirmación que de verdad protege el dato. Cubre también al autoguardado:
        // pase lo que pase en la interfaz, no puede haber escritura sin lectura previa.
        fetchWithAuth.mockResolvedValue(respuesta({ detail: 'boom' }, false, 503));
        render(<ClinicalProfilePanel />, { customContext: { updateData: vi.fn() } });

        await screen.findByText(/No pudimos cargar tu perfil clínico/i, {}, ESPERA);
        const escrituras = fetchWithAuth.mock.calls.filter(
            ([, opciones]) => opciones && opciones.method && opciones.method !== 'GET',
        );
        expect(escrituras, `salieron ${escrituras.length} escrituras con el panel sin cargar`).toEqual([]);
    });

    it('un fallo de RED también bloquea, no solo un error del servidor', async () => {
        // El `catch` ya cubría esto antes del arreglo; se ancla para que al reescribir
        // el manejo de errores no se pierda la mitad que sí funcionaba.
        fetchWithAuth.mockRejectedValue(new Error('network'));
        render(<ClinicalProfilePanel />, { customContext: { updateData: vi.fn() } });

        expect(await screen.findByText(/No pudimos cargar tu perfil clínico/i, {}, ESPERA))
            .toBeInTheDocument();
    });

    it('«Reintentar» recupera el panel cuando el servidor vuelve', async () => {
        // Bloquear sin salida sería cambiar un defecto por otro.
        let caido = true;
        fetchWithAuth.mockImplementation(async (url) => {
            if (url === ENDPOINT && caido) return respuesta({ detail: 'boom' }, false, 500);
            return respuesta(PERFIL_REAL);
        });
        render(<ClinicalProfilePanel />, { customContext: { updateData: vi.fn() } });

        const reintentar = await screen.findByRole('button', { name: /Reintentar/i }, ESPERA);
        caido = false;
        await userEvent.click(reintentar);

        await waitFor(() => expect(screen.getByDisplayValue('5.4')).toBeInTheDocument(), ESPERA);
        expect(screen.getByText(/Guardar perfil clínico/i)).toBeInTheDocument();
    });
});
