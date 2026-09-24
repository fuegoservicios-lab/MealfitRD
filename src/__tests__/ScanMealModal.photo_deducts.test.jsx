// [P1-PHOTO-DEDUCTS · 2026-08-07] Escanear comida ya descuenta la Nevera.
//
// Era la unica de las tres superficies de consumo que no la tocaba, y no por
// falta de datos: al modelo YA se le pedia el inventario de componentes del
// plato, pero en texto libre. El backend ahora los emite estructurados
// (P1-VISION-PLATO-ITEMS) y acepta los que el usuario confirme.
//
// Lo que este archivo protege:
//
//   1. Los componentes se muestran para CONFIRMAR, no se descuentan solos. La
//      cantidad la estimo un modelo mirando una foto; moverla Nevera sin que el
//      usuario lo vea repetiria el pecado que P1-PANTRY-NAME-RESOLUTION cerro.
//   2. Solo viajan los MARCADOS, con el formato que `_parse_quantity` entiende.
//   3. Lo que no bajo de la Nevera se DICE.
//   4. Un plato sin componentes detectados sigue registrando macros — el bloque
//      simplemente no aparece.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, mockAssessmentContext } from './utils/test-utils';
import * as assessmentModule from '../context/AssessmentContext';
import ScanMealModal from '../components/dashboard/ScanMealModal';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

vi.mock('sonner', async () => {
    const actual = await vi.importActual('sonner');
    const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() });
    return { ...actual, toast: fn, Toaster: () => null };
});

const _UID = 'user-1';

const _uploadResponse = (items) => ({
    ok: true,
    json: async () => ({
        success: true,
        is_food: true,
        photo_kind: 'plato',
        analysis_failed: false,
        busy: false,
        meal_name: 'Mangú con los tres golpes',
        description: 'mangu, huevo, queso frito',
        macros: { calories: 750, protein: 35, carbs: 80, healthy_fats: 30 },
        items,
    }),
});

const _consumedResponse = (over = {}) => ({
    ok: true,
    json: async () => ({
        success: true, message: 'ok', already_logged: false,
        deducted: ['2 unidad de huevo'], inferred: [],
        not_in_pantry: [], failed_to_deduct: [], ...over,
    }),
});

const _ITEMS = [
    { name: 'huevo', quantity: 2, unit: 'unidad' },
    { name: 'queso frito', quantity: 2, unit: 'lasca' },
];

function _routeFetch({ items = _ITEMS, consumed = _consumedResponse() } = {}) {
    return vi.fn(async (url) => {
        if (typeof url === 'string' && url.includes('/api/diary/upload')) return _uploadResponse(items);
        if (typeof url === 'string' && url.includes('/api/diary/consumed')) return consumed;
        return { ok: true, json: async () => ({}) };
    });
}

/** Sube una foto y espera a que el modal entre en fase de revision. `customContext` pasa por al `render` de
 * test-utils (P1-NEVERA-OPCIONAL · 2026-09-23): sin él, `userProfile` es `undefined` y la Nevera queda activa
 * (la conducta de siempre para estos tests). */
async function _scan(customContext) {
    render(<ScanMealModal isOpen onClose={vi.fn()} userId={_UID} />, { customContext });
    const file = new File([new Uint8Array([1, 2, 3])], 'plato.jpg', { type: 'image/jpeg' });
    // El input de galeria es el que existe en cualquier pointer (el de camara
    // solo se monta en pointer:coarse — P2-SCAN-NO-WEBCAM-ON-DESKTOP).
    const inputs = document.querySelectorAll('input[type="file"]');
    expect(inputs.length).toBeGreaterThan(0);
    fireEvent.change(inputs[inputs.length - 1], { target: { files: [file] } });
    await screen.findByText(/Registrar comida/i);
}

function _consumedBody(mock) {
    const call = mock.mock.calls.find(
        ([url]) => typeof url === 'string' && url.includes('/api/diary/consumed'));
    expect(call, 'no se hizo POST a /api/diary/consumed').toBeTruthy();
    return JSON.parse(call[1].body);
}

// [P1-MEAL-SCAN-GEMMA] El modal reescala con `new Image()` antes de subir. En
// jsdom la imagen no carga NI dispara onerror, asi que la promesa de
// `_downscaleToJpegFile` nunca resuelve y el modal se queda en "Analizando…"
// para siempre. Mismo `FakeImage` que usa PantryScanButton.p1_pantry_camera_scan
// (patron ya establecido en el repo, no uno nuevo).
class FakeImage {
    constructor() { this.width = 1920; this.height = 1080; this._src = ''; }
    set src(v) { this._src = v; queueMicrotask(() => { if (this.onload) this.onload(); }); }
    get src() { return this._src; }
}

describe('P1-PHOTO-DEDUCTS — el escaner descuenta lo que el usuario confirma', () => {
    let originalImage;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchWithAuth).mockImplementation(_routeFetch());
        originalImage = global.Image;
        global.Image = FakeImage;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(cb, type) {
            cb(new Blob(['fake-bytes'], { type: type || 'image/jpeg' }));
        });
        // jsdom no implementa createObjectURL/revokeObjectURL.
        global.URL.createObjectURL = vi.fn(() => 'blob:preview');
        global.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        global.Image = originalImage;
    });

    it('muestra los componentes detectados para confirmar, no los descuenta solos', async () => {
        await _scan();
        expect(screen.getByText(/Descontar de tu Nevera/i)).toBeInTheDocument();
        // Nacen marcados (el caso comun es que la deteccion sea correcta)...
        const chkHuevo = screen.getByLabelText(/Descontar huevo de tu Nevera/i);
        expect(chkHuevo).toBeChecked();
        // ...pero nada se descuenta hasta que el usuario confirma el registro.
        const calls = vi.mocked(fetchWithAuth).mock.calls
            .filter(([u]) => typeof u === 'string' && u.includes('/api/diary/consumed'));
        expect(calls).toHaveLength(0);
    });

    it('solo manda los componentes MARCADOS, con el formato que el backend parsea', async () => {
        await _scan();
        fireEvent.click(screen.getByLabelText(/Descontar queso frito de tu Nevera/i));
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/i }));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        const body = _consumedBody(vi.mocked(fetchWithAuth));
        // "<qty> <unit> de <nombre>" es lo que `_parse_quantity` entiende.
        expect(body.ingredients).toEqual(['2 unidad de huevo']);
        expect(body.ingredients).not.toContain('2 lasca de queso frito');
    });

    it('respeta la cantidad corregida a mano', async () => {
        await _scan();
        fireEvent.change(screen.getByLabelText(/Cantidad de huevo/i), { target: { value: '3' } });
        fireEvent.click(screen.getByLabelText(/Descontar queso frito de tu Nevera/i));
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/i }));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(_consumedBody(vi.mocked(fetchWithAuth)).ingredients).toEqual(['3 unidad de huevo']);
    });

    it('una cantidad invalida excluye la fila en vez de mandar basura', async () => {
        await _scan();
        fireEvent.change(screen.getByLabelText(/Cantidad de huevo/i), { target: { value: '0' } });
        fireEvent.click(screen.getByLabelText(/Descontar queso frito de tu Nevera/i));
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/i }));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(_consumedBody(vi.mocked(fetchWithAuth)).ingredients).toEqual([]);
    });

    it('dice QUE no estaba en la Nevera en vez de dejar creer que bajo todo', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(_routeFetch({
            consumed: _consumedResponse({
                deducted: ['2 unidad de huevo'],
                not_in_pantry: ['2 lasca de queso frito'],
            }),
        }));
        await _scan();
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/i }));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        const desc = vi.mocked(toast.success).mock.calls[0][1]?.description || '';
        expect(desc).toMatch(/no estaban registrados/i);
        expect(desc).toContain('2 lasca de queso frito');
    });

    it('cuando todo bajo, no inventa un aviso de ausentes', async () => {
        await _scan();
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/i }));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        const desc = vi.mocked(toast.success).mock.calls[0][1]?.description || '';
        expect(desc).toMatch(/Descontamos 1 ingrediente/i);
        expect(desc).not.toMatch(/no estaban registrados/i);
    });

    it('un plato sin componentes detectados sigue registrando macros', async () => {
        // Anti-regresion del comportamiento historico: platos dificiles de
        // desglosar no deben perder el registro calorico, ni mostrar un bloque
        // vacio que sugiera que el escaner fallo.
        vi.mocked(fetchWithAuth).mockImplementation(_routeFetch({ items: [] }));
        await _scan();
        expect(screen.queryByText(/Descontar de tu Nevera/i)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/i }));
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        const body = _consumedBody(vi.mocked(fetchWithAuth));
        expect(body.ingredients).toEqual([]);
        expect(body.calories).toBe(750);
    });

    // [P1-NEVERA-OPCIONAL · 2026-09-23] Con la Nevera apagada (modo contador), el escáner nace ya sabiendo que
    // no hay inventario que consultar: no pregunta al servidor y no habla de "descontar de la Nevera".
    // [Final fix wave] Los perfiles llevan `plan_mode: 'tracking'`: fuera del modo contador la Nevera está SIEMPRE
    // activa (`neveraActiva`), también para el cliente.
    describe('con la Nevera apagada', () => {
        const APAGADA = { userProfile: { plan_mode: 'tracking', nevera_activa: false } };
        const ENCENDIDA = { userProfile: { plan_mode: 'tracking', nevera_activa: true } };
        const llamadasInventario = () => vi.mocked(fetchWithAuth).mock.calls
            .filter(([u]) => typeof u === 'string' && u.includes('/api/inventory'));
        /** El modal vive SIEMPRE montado en el panel y el perfil cambia debajo de él (el refresco al volver a la app
         * tras el apagado automático, o apagarla en Configuración). Escanea y devuelve `cambiarPerfil(ctx)`: cambia lo
         * que devuelve `useAssessment` y vuelve a pintar el MISMO modal (mismo árbol: el estado se conserva), como
         * haría el provider. Con un elemento NUEVO en cada pintado: el espía no es un contexto de verdad, y con el
         * mismo objeto de props React se salta el re-render y el modal jamás vuelve a leer el perfil. */
        const escanearMontado = async (ctx) => {
            const onClose = vi.fn();
            const modal = () => <ScanMealModal isOpen onClose={onClose} userId={_UID} />;
            const { rerender } = render(modal(), { customContext: ctx });
            const file = new File([new Uint8Array([1, 2, 3])], 'plato.jpg', { type: 'image/jpeg' });
            const inputs = document.querySelectorAll('input[type="file"]');
            fireEvent.change(inputs[inputs.length - 1], { target: { files: [file] } });
            await screen.findByText(/Registrar comida/i);
            return (nuevo) => {
                vi.spyOn(assessmentModule, 'useAssessment').mockReturnValue({ ...mockAssessmentContext, ...nuevo });
                rerender(modal());
            };
        };

        it('si el perfil la apaga con el escáner montado, «Descontar de tu Nevera» y sus interruptores se van; y vuelven', async () => {
            const cambiarPerfil = await escanearMontado(ENCENDIDA);
            expect(screen.getByText('Descontar de tu Nevera')).toBeInTheDocument();
            expect(screen.getByLabelText('Descontar huevo de tu Nevera')).toBeInTheDocument();

            cambiarPerfil(APAGADA);
            expect(screen.getByText('Ingredientes que detectamos')).toBeInTheDocument();
            expect(screen.queryByText(/Descontar de tu Nevera/i)).not.toBeInTheDocument();
            expect(screen.queryByLabelText(/Descontar .* de tu Nevera/i)).not.toBeInTheDocument();
            expect(screen.getByLabelText('Incluir huevo')).toBeInTheDocument();

            cambiarPerfil(ENCENDIDA);
            expect(screen.getByText('Descontar de tu Nevera')).toBeInTheDocument();
            expect(screen.getByLabelText('Descontar huevo de tu Nevera')).toBeInTheDocument();
        });

        it('montado con la Nevera apagada no pide el inventario; al encenderla, lo pide y lo usa', async () => {
            const base = _routeFetch({ consumed: _consumedResponse({ deducted: [], not_in_pantry: ['2 unidad de huevo'] }) });
            vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => (
                typeof url === 'string' && url.includes('/api/inventory')
                    ? { ok: true, json: async () => ({ items: [{ name: 'Leche', quantity: 1 }] }) }
                    : base(url, opts)));
            const cambiarPerfil = await escanearMontado(APAGADA);
            expect(screen.getByText('Ingredientes que detectamos')).toBeInTheDocument();
            expect(llamadasInventario()).toHaveLength(0);

            cambiarPerfil(ENCENDIDA);
            await waitFor(() => expect(llamadasInventario()).toHaveLength(1));
            expect(screen.getByText('Descontar de tu Nevera')).toBeInTheDocument();
            // lo leído SÍ se usa: la Nevera tiene cosas, así que el aviso nombra lo que no estaba en ella
            fireEvent.click(screen.getByRole('button', { name: /Registrar comida/i }));
            await waitFor(() => expect(toast.success).toHaveBeenCalled());
            expect(vi.mocked(toast.success).mock.calls[0][1]?.description || '').toMatch(/no estaban registrados/i);
        });

        it('no consulta /api/inventory y llama a los componentes "Ingredientes que detectamos"', async () => {
            await _scan(APAGADA);
            expect(screen.getByText('Ingredientes que detectamos')).toBeInTheDocument();
            expect(screen.queryByText(/Descontar de tu Nevera/i)).not.toBeInTheDocument();
            expect(llamadasInventario()).toHaveLength(0);
        });

        it('el aviso de "esto es una compra" ya no manda a "Escanear mi nevera"', async () => {
            vi.mocked(fetchWithAuth).mockImplementation(async (url) => {
                if (typeof url === 'string' && url.includes('/api/diary/upload')) {
                    return {
                        ok: true,
                        json: async () => ({
                            success: true, is_food: true, photo_kind: 'items',
                            analysis_failed: false, busy: false, items: [],
                        }),
                    };
                }
                return { ok: true, json: async () => ({}) };
            });
            render(<ScanMealModal isOpen onClose={vi.fn()} userId={_UID} />, { customContext: APAGADA });
            const file = new File([new Uint8Array([1, 2, 3])], 'compra.jpg', { type: 'image/jpeg' });
            const inputs = document.querySelectorAll('input[type="file"]');
            fireEvent.change(inputs[inputs.length - 1], { target: { files: [file] } });
            await waitFor(() => expect(
                screen.getByText('Esto parece una compra o alimentos sueltos, no un plato servido. Fotografía el plato ya servido para registrarlo.')
            ).toBeInTheDocument());
            expect(screen.queryByText(/Escanear mi nevera/i)).not.toBeInTheDocument();
        });
    });
});
