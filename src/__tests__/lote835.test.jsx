/**
 * [P1-PLAN-LOTE-835 · 2026-09-29] Cuenta de prueba, LO QUE VE Y HACE LA PERSONA (spec 2026-09-29, §5).
 *
 * Marcar a alguien como cuenta de prueba abre su contenido al equipo, así que la propia persona tiene que enterarse
 * DENTRO de la app —esa es la notificación que sustituye al correo (§6, «Publicación»)— y poder salir cuando quiera:
 *
 *  - El aviso sale una vez (hasta que se anota `aviso_visto`): «Entendido» lo anota, «Salir del modo de prueba» sale.
 *    Ni Escape ni el fondo lo cierran: la decisión es explícita. Si el servidor no anota la respuesta, la hoja sigue con
 *    el motivo Y con «Ahora no» (solo en ese estado): pospone SIN llamar al servidor y el aviso vuelve en la próxima
 *    carga. Un defecto del backend no puede dejar a nadie atrapado (ronda 1).
 *  - Escape lo traga la hoja (captura en `window`, como la del permiso de la IA) para que no llegue al modal de debajo.
 *  - Configuración → Privacidad lleva un bloque fijo con la misma explicación y «Salir…» CON confirmación; tras salir
 *    dice que el equipo ya no ve la actividad.
 *  - La explicación nombra las FOTOS de las conversaciones (decisión del controlador, ronda 1: el aviso es la única
 *    notificación que recibe la persona y la política publicada las lista).
 *  - Los textos van en los 5 idiomas; nada nuevo entra en AssessmentContext.jsx (tope documentado: 4.700 líneas).
 *
 * Las pruebas negativas («no sale sin marca») se aparean con una positiva del mismo montaje: la hoja va por un portal a
 * <body>, así que mirar `container` da vacío aunque el componente esté roto (lección del lote 415).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../utils/confirmToast', () => ({ confirmToast: vi.fn() }));
let ctx = {};
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => ctx }));

import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import { confirmToast } from '../utils/confirmToast';
import AvisoCuentaPrueba from '../components/dashboard/AvisoCuentaPrueba';
import BloqueCuentaPrueba from '../components/settings/BloqueCuentaPrueba';
import * as cuentaUtil from '../utils/cuentaDePrueba';
import { textosCuentaDePrueba } from '../utils/cuentaDePrueba';

const fuente = (ruta) => readFileSync(resolve(process.cwd(), ruta), 'utf8');
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const CATALOGOS = ['en-US', 'pt-BR', 'fr-FR', 'it-IT'];
const catalogo = (codigo) => JSON.parse(fuente(`src/i18n/locales/${codigo}.json`));

const UID = 'aaaaaaaa-1111-2222-3333-444444444444';
const MARCA = { desde: '2026-09-29T15:00:00+00:00', aviso_visto: false };
const contexto = (over = {}) => ({
    session: { user: { id: UID } },
    userProfile: { id: UID, cuenta_de_prueba: MARCA },
    refreshProfileAndPlan: vi.fn(async () => {}),
    ...over,
});
const llamadasDePrueba = () => fetchWithAuth.mock.calls.filter(([url]) => String(url).startsWith('/api/profile/prueba/'));
const hoja = (baseElement) => baseElement.querySelector('[role="dialog"]');

// El texto del spec §5 con UNA inserción, por decisión del controlador (ronda 1): «…con el coach con sus fotos, también las…».
const EXPLICACION = 'El equipo de Bioboros puede ver lo que haces en la app —tu formulario, tus comidas, tus planes y tus conversaciones con el coach con sus fotos, también las anteriores— para probarla y mejorarla. Puedes salir cuando quieras en Configuración → Privacidad';
const YA_NO_ES = 'Ya no es una cuenta de prueba: el equipo ya no ve tu actividad';

beforeEach(() => {
    ctx = contexto();
    fetchWithAuth.mockReset();
    fetchWithAuth.mockResolvedValue(respuesta({ ok: true, salio: true }));
    confirmToast.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    document.body.style.overflow = '';
});
afterEach(() => cleanup());

describe('[835] el aviso a la persona (una vez)', () => {
    it('sale con el título y la explicación (la del spec §5 más «con sus fotos»), y los dos botones', () => {
        const { baseElement } = render(<AvisoCuentaPrueba />);
        const dialogo = screen.getByRole('dialog', { name: 'Esta es una cuenta de prueba' });
        expect(dialogo).toHaveAttribute('aria-modal', 'true');
        expect(dialogo).toHaveTextContent(EXPLICACION);
        expect(screen.getByRole('button', { name: 'Entendido' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Salir del modo de prueba' })).toBeEnabled();
        // la analítica no graba lo que se toca aquí, y no hereda la clase de ningún contenedor (va a <body>)
        expect(baseElement.querySelector('.ph-no-capture')).not.toBeNull();
    });

    it('va por un portal a <body>: fuera de cualquier contenedor con will-change o backdrop-filter (lote 415)', () => {
        const { container, baseElement } = render(<AvisoCuentaPrueba />);
        const dialogo = hoja(baseElement);
        expect(dialogo).not.toBeNull();               // baseElement, no container: el portal deja el contenedor vacío
        expect(container.contains(dialogo)).toBe(false);
        expect(Array.from(document.body.children).some((n) => n.contains(dialogo))).toBe(true);
        expect(container.innerHTML).toBe('');
    });

    it('sin marca no sale (nulo, ausente o con el aviso ya visto)', () => {
        for (const perfil of [
            { id: UID, cuenta_de_prueba: null },
            { id: UID },
            { id: UID, cuenta_de_prueba: { desde: MARCA.desde, aviso_visto: true } },
        ]) {
            ctx = contexto({ userProfile: perfil });
            const { baseElement, unmount } = render(<AvisoCuentaPrueba />);
            expect(hoja(baseElement)).toBeNull();
            unmount();
        }
        // control: con el mismo montaje y la marca sin ver, SÍ sale (si no, lo de arriba pasaría por vacío)
        ctx = contexto();
        const { baseElement } = render(<AvisoCuentaPrueba />);
        expect(hoja(baseElement)).not.toBeNull();
    });

    it('sin perfil cargado no sale, y el perfil de OTRA cuenta tampoco', () => {
        ctx = contexto({ userProfile: null });
        const a = render(<AvisoCuentaPrueba />);
        expect(hoja(a.baseElement)).toBeNull();
        a.unmount();
        ctx = contexto({ userProfile: { id: 'otra-cuenta', cuenta_de_prueba: MARCA } });
        const b = render(<AvisoCuentaPrueba />);
        expect(hoja(b.baseElement)).toBeNull();
    });

    it('«Entendido» anota el aviso (POST) una sola vez, cierra y refresca el perfil', async () => {
        const { baseElement } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        const llamadas = llamadasDePrueba();
        expect(llamadas).toHaveLength(1);
        expect(llamadas[0][0]).toBe('/api/profile/prueba/aviso-visto');
        expect(llamadas[0][1].method).toBe('POST');
        expect(llamadas[0][1].body).toBe('{}');         // como los demás POST sin datos: vale con o sin modelo en el endpoint
        expect(llamadas[0][1].headers['Content-Type']).toBe('application/json');
        expect(ctx.refreshProfileAndPlan).toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();   // entender no es salir: nada que celebrar
    });

    it('una vez contestado, un perfil viejo (aviso_visto aún false) que llega después no lo reabre', async () => {
        const { baseElement, rerender } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        ctx = contexto();   // el poll del perfil trae una copia anterior a la anotación
        rerender(<AvisoCuentaPrueba />);
        expect(hoja(baseElement)).toBeNull();
        expect(llamadasDePrueba()).toHaveLength(1);
    });

    it('una marca NUEVA (el equipo la quitó y la volvió a poner: otra fecha) sale otra vez, y se puede contestar de nuevo', async () => {
        const { baseElement, rerender } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        ctx = contexto({ userProfile: { id: UID, cuenta_de_prueba: { desde: '2026-10-05T09:00:00+00:00', aviso_visto: false } } });
        rerender(<AvisoCuentaPrueba />);
        expect(hoja(baseElement)).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        expect(llamadasDePrueba().map(([url]) => url)).toEqual([
            '/api/profile/prueba/aviso-visto', '/api/profile/prueba/aviso-visto',
        ]);
    });

    it('«Salir del modo de prueba» llama a salir (no a aviso-visto), cierra y lo dice', async () => {
        const { baseElement } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        const llamadas = llamadasDePrueba();
        expect(llamadas.map(([url]) => url)).toEqual(['/api/profile/prueba/salir']);
        expect(llamadas[0][1].method).toBe('POST');
        expect(toast.success).toHaveBeenCalledWith(YA_NO_ES);
        expect(ctx.refreshProfileAndPlan).toHaveBeenCalled();
    });

    it('si el servidor dice `salio: false` (el equipo ya la había quitado), para la persona es lo mismo: sale y lo dice', async () => {
        fetchWithAuth.mockResolvedValue(respuesta({ ok: true, salio: false }));
        const { baseElement } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        expect(toast.success).toHaveBeenCalledWith(YA_NO_ES);
    });

    it('si el servidor NO anota la respuesta, la hoja sigue abierta con el motivo y se puede reintentar', async () => {
        fetchWithAuth.mockResolvedValueOnce(respuesta({}, false, 500));
        const { baseElement } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        const alerta = await screen.findByRole('alert');
        expect(alerta).toHaveTextContent('No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.');
        expect(hoja(baseElement)).not.toBeNull();
        for (const nombre of ['Entendido', 'Salir del modo de prueba']) {
            expect(screen.getByRole('button', { name: nombre })).not.toHaveAttribute('aria-disabled', 'true');
        }
        // el reintento, esta vez bien, la cierra
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        expect(llamadasDePrueba()).toHaveLength(2);
    });

    it('una red caída al salir tampoco la cierra ni lanza', async () => {
        fetchWithAuth.mockRejectedValueOnce(new Error('sin red'));
        const { baseElement } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
        const alerta = await screen.findByRole('alert');
        expect(alerta).toHaveTextContent('No pudimos sacar tu cuenta del modo de prueba. Revisa tu conexión e inténtalo de nuevo.');
        expect(hoja(baseElement)).not.toBeNull();
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('mientras guarda no admite un segundo clic (una sola petición)', async () => {
        let soltar;
        fetchWithAuth.mockReturnValueOnce(new Promise((r) => { soltar = r; }));
        const { baseElement } = render(<AvisoCuentaPrueba />);
        const entendido = screen.getByRole('button', { name: 'Entendido' });
        fireEvent.click(entendido);
        fireEvent.click(entendido);
        fireEvent.click(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
        expect(llamadasDePrueba()).toHaveLength(1);
        soltar(respuesta({ ok: true }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        expect(llamadasDePrueba()).toHaveLength(1);
    });

    it('mientras guarda el botón queda «ocupado» sin perder el foco (aria-disabled, no disabled), y el rótulo lo dice', async () => {
        let soltar;
        fetchWithAuth.mockReturnValueOnce(new Promise((r) => { soltar = r; }));
        const { baseElement } = render(<AvisoCuentaPrueba />);
        // al abrir, el hook de accesibilidad enfoca la hoja (a los 10 ms): se espera a eso antes de mover el foco a mano
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog')));
        const entendido = screen.getByRole('button', { name: 'Entendido' });
        entendido.focus();
        fireEvent.click(entendido);
        const ocupado = await screen.findByRole('button', { name: 'Guardando…' });
        expect(ocupado).toBe(entendido);                                   // el mismo nodo: no se remontó
        expect(ocupado).toHaveAttribute('aria-disabled', 'true');
        expect(ocupado).not.toBeDisabled();                                // un `disabled` soltaría el foco al <body>
        expect(document.activeElement).toBe(ocupado);
        expect(screen.getByRole('button', { name: 'Salir del modo de prueba' })).toHaveAttribute('aria-disabled', 'true');
        soltar(respuesta({ ok: true }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
    });

    it('al salir, el rótulo pasa a «Saliendo…» hasta que el servidor contesta', async () => {
        let soltar;
        fetchWithAuth.mockReturnValueOnce(new Promise((r) => { soltar = r; }));
        const { baseElement } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
        expect(await screen.findByRole('button', { name: 'Saliendo…' })).toHaveAttribute('aria-disabled', 'true');
        soltar(respuesta({ ok: true, salio: true }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
    });

    it('Escape no lo cierra (la decisión es explícita) y el foco queda atrapado en la hoja', () => {
        const { baseElement } = render(<AvisoCuentaPrueba />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(hoja(baseElement)).not.toBeNull();
        expect(llamadasDePrueba()).toHaveLength(0);
        const salir = screen.getByRole('button', { name: 'Salir del modo de prueba' });
        const entendido = screen.getByRole('button', { name: 'Entendido' });
        entendido.focus();
        fireEvent.keyDown(document, { key: 'Tab' });    // desde el último vuelve al primero
        expect(document.activeElement).toBe(salir);
    });

    it('el fondo tampoco cierra', () => {
        const { baseElement } = render(<AvisoCuentaPrueba />);
        const fondo = baseElement.querySelector('[aria-hidden="true"]');
        if (fondo) fireEvent.click(fondo);
        expect(hoja(baseElement)).not.toBeNull();
        expect(llamadasDePrueba()).toHaveLength(0);
    });
});

describe('[835 ronda 1] la hoja nunca deja a la persona atrapada: si el servidor falla, «Ahora no»', () => {
    // Antes, con un 5xx/422/429 persistente los dos botones fallaban y la hoja bloqueaba TODO el dashboard: si el
    // backend se rompe con todas las cuentas marcadas, nadie podía usar la app.
    const AHORA_NO = { name: 'Ahora no' };
    const botones = () => screen.getAllByRole('button').map((b) => b.textContent);

    it('sin fallo no hay «Ahora no»: mientras el servidor no haya fallado, la decisión sigue siendo explícita', () => {
        render(<AvisoCuentaPrueba />);
        expect(screen.queryByRole('button', AHORA_NO)).toBeNull();
        expect(botones()).toEqual(['Salir del modo de prueba', 'Entendido']);
    });

    it('tras un fallo aparece «Ahora no» como tercer botón; pulsarlo cierra la hoja SIN llamar al servidor', async () => {
        fetchWithAuth.mockResolvedValueOnce(respuesta({}, false, 503));
        const { baseElement } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await screen.findByRole('alert');
        expect(botones()).toEqual(['Salir del modo de prueba', 'Entendido', 'Ahora no']);
        expect(llamadasDePrueba()).toHaveLength(1);        // el intento que falló
        fireEvent.click(screen.getByRole('button', AHORA_NO));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        expect(llamadasDePrueba()).toHaveLength(1);        // …y ninguna más: posponer no habla con el servidor
        expect(toast.success).not.toHaveBeenCalled();
        expect(ctx.refreshProfileAndPlan).not.toHaveBeenCalled();
    });

    it('posponer no es contestar: en la próxima carga (otro montaje) el aviso vuelve, sin el error ni «Ahora no»', async () => {
        fetchWithAuth.mockResolvedValueOnce(respuesta({}, false, 500));
        const primera = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button', AHORA_NO));
        await waitFor(() => expect(hoja(primera.baseElement)).toBeNull());
        primera.unmount();
        // la próxima carga: el servidor sigue diciendo aviso_visto = false
        const segunda = render(<AvisoCuentaPrueba />);
        expect(hoja(segunda.baseElement)).not.toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.queryByRole('button', AHORA_NO)).toBeNull();
    });

    it('lo mismo tras fallar «Salir del modo de prueba» (red caída)', async () => {
        fetchWithAuth.mockRejectedValueOnce(new Error('sin red'));
        const { baseElement } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button', AHORA_NO));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        expect(llamadasDePrueba().map(([url]) => url)).toEqual(['/api/profile/prueba/salir']);   // solo el que falló
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('mientras se reintenta «Ahora no» se retira (el estado de error terminó); un reintento bueno cierra la hoja de verdad', async () => {
        fetchWithAuth.mockResolvedValueOnce(respuesta({}, false, 500));
        const { baseElement } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await screen.findByRole('alert');
        let soltar;
        fetchWithAuth.mockReturnValueOnce(new Promise((r) => { soltar = r; }));
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await screen.findByRole('button', { name: 'Guardando…' });
        expect(screen.queryByRole('button', AHORA_NO)).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
        soltar(respuesta({ ok: true }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        expect(llamadasDePrueba()).toHaveLength(2);
    });

    it('si el reintento vuelve a fallar, «Ahora no» reaparece', async () => {
        fetchWithAuth.mockResolvedValueOnce(respuesta({}, false, 500)).mockResolvedValueOnce(respuesta({}, false, 429));
        render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await waitFor(() => expect(llamadasDePrueba()).toHaveLength(2));
        await screen.findByRole('alert');
        expect(screen.getByRole('button', AHORA_NO)).toBeTruthy();
    });

    it('un perfil viejo tras «Ahora no» no la reabre en esta carga; una marca NUEVA sí, sin el error de la anterior', async () => {
        fetchWithAuth.mockResolvedValueOnce(respuesta({}, false, 500));
        const { baseElement, rerender } = render(<AvisoCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button', AHORA_NO));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        ctx = contexto();   // el poll del perfil trae la misma marca, aún sin ver
        rerender(<AvisoCuentaPrueba />);
        expect(hoja(baseElement)).toBeNull();
        ctx = contexto({ userProfile: { id: UID, cuenta_de_prueba: { desde: '2026-10-05T09:00:00+00:00', aviso_visto: false } } });
        rerender(<AvisoCuentaPrueba />);
        expect(hoja(baseElement)).not.toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.queryByRole('button', AHORA_NO)).toBeNull();
    });

    it('lo inesperado (una excepción al contestar) se trata como un fallo: no queda atascada, ofrece «Ahora no» y se puede reintentar', async () => {
        const espia = vi.spyOn(cuentaUtil, 'anotarAvisoVisto').mockRejectedValueOnce(new Error('boom'));
        try {
            const { baseElement } = render(<AvisoCuentaPrueba />);
            fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
            const alerta = await screen.findByRole('alert');
            expect(alerta).toHaveTextContent('No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.');
            for (const nombre of ['Entendido', 'Salir del modo de prueba']) {
                expect(screen.getByRole('button', { name: nombre })).not.toHaveAttribute('aria-disabled', 'true');   // sin cerrojo puesto
            }
            expect(screen.getByRole('button', AHORA_NO)).toBeTruthy();
            fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));   // el reintento (el espía era de una sola vez): bien
            await waitFor(() => expect(hoja(baseElement)).toBeNull());
        } finally {
            espia.mockRestore();
        }
    });

    it('el foco sigue atrapado con el tercer botón: Tab desde «Ahora no» vuelve al primero', async () => {
        fetchWithAuth.mockResolvedValueOnce(respuesta({}, false, 500));
        render(<AvisoCuentaPrueba />);
        // al abrir, el hook de accesibilidad enfoca la hoja (a los 10 ms): se espera a eso antes de mover el foco a mano
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog')));
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await screen.findByRole('alert');
        screen.getByRole('button', AHORA_NO).focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
    });

    it('«Ahora no» usa una clave que YA existía y está traducida en los 4 catálogos', () => {
        const tx = textosCuentaDePrueba((k) => k);
        expect(tx.ahoraNo).toBe('Ahora no');
        for (const codigo of CATALOGOS) {
            const v = catalogo(codigo)['Ahora no'];
            expect(typeof v === 'string' && v.trim() !== '', codigo).toBe(true);
        }
    });
});

describe('[835 ronda 1] Escape no atraviesa la hoja (el modal de debajo no se cierra)', () => {
    // `common/Modal.jsx` cierra con un listener de `document`; la hoja lo traga con uno de captura en `window`
    // (el patrón de la hoja del permiso de la IA), SIN acción de cerrar: la decisión sigue siendo explícita.
    let teclas;
    let escuchar;
    beforeEach(() => {
        teclas = [];
        escuchar = (e) => { teclas.push(e.key); };
        document.addEventListener('keydown', escuchar);
    });
    afterEach(() => document.removeEventListener('keydown', escuchar));
    const pulsar = (objetivo, key) => {
        const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        objetivo.dispatchEvent(ev);
        return ev;
    };

    it('con la hoja abierta, Escape no llega al modal de debajo (ni desde el body ni desde el documento), se cancela y no cierra nada', () => {
        const { baseElement } = render(<AvisoCuentaPrueba />);
        const desdeElBody = pulsar(document.body, 'Escape');
        const desdeElDocumento = pulsar(document, 'Escape');
        expect(teclas).not.toContain('Escape');
        expect(desdeElBody.defaultPrevented).toBe(true);
        expect(desdeElDocumento.defaultPrevented).toBe(true);
        expect(hoja(baseElement)).not.toBeNull();
        expect(llamadasDePrueba()).toHaveLength(0);
    });

    it('solo se traga Escape: las demás teclas siguen su camino', () => {
        render(<AvisoCuentaPrueba />);
        const flecha = pulsar(document.body, 'ArrowDown');
        pulsar(document.body, 'Enter');
        expect(teclas).toEqual(['ArrowDown', 'Enter']);
        expect(flecha.defaultPrevented).toBe(false);
    });

    it('el silencio es solo mientras la hoja está abierta: sin marca, o ya contestada, Escape llega al modal de debajo', async () => {
        ctx = contexto({ userProfile: { id: UID, cuenta_de_prueba: null } });
        const sinMarca = render(<AvisoCuentaPrueba />);
        pulsar(document.body, 'Escape');
        expect(teclas).toEqual(['Escape']);                // sin marca no hay hoja: nadie lo traga
        sinMarca.unmount();
        teclas.length = 0;

        ctx = contexto();
        const { baseElement } = render(<AvisoCuentaPrueba />);
        pulsar(document.body, 'Escape');
        expect(teclas).toEqual([]);                        // abierta: lo traga
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        await waitFor(() => expect(hoja(baseElement)).toBeNull());
        const libre = pulsar(document.body, 'Escape');
        expect(teclas).toEqual(['Escape']);                // contestada: vuelve a pasar
        expect(libre.defaultPrevented).toBe(false);
    });

    it('ancla: captura en window + stopPropagation (el patrón de consent/ConsentimientoIASheet.jsx)', () => {
        const aviso = fuente('src/components/dashboard/AvisoCuentaPrueba.jsx');
        expect(aviso).toContain("window.addEventListener('keydown', tragarEscape, true)");
        expect(aviso).toContain("window.removeEventListener('keydown', tragarEscape, true)");
        expect(aviso).toContain('e.stopPropagation()');
        expect(fuente('src/consent/ConsentimientoIASheet.jsx')).toContain("window.addEventListener('keydown', alPulsar, true)");
    });
});

describe('[835] Configuración → Privacidad: el bloque fijo', () => {
    it('sin marca no pinta nada; con marca, título, la misma explicación y el botón', () => {
        ctx = contexto({ userProfile: { id: UID, cuenta_de_prueba: null } });
        const a = render(<BloqueCuentaPrueba />);
        expect(a.container.innerHTML).toBe('');
        a.unmount();

        ctx = contexto();
        render(<BloqueCuentaPrueba />);
        expect(screen.getByRole('heading', { name: 'Cuenta de prueba' })).toBeTruthy();
        const bloque = screen.getByTestId('bloque-cuenta-de-prueba');
        expect(bloque).toHaveTextContent(EXPLICACION);
        expect(bloque.className).toContain('ph-no-capture');
        expect(screen.getByRole('button', { name: 'Salir del modo de prueba' })).toBeEnabled();
        // el bloque no repite el aviso: solo la explicación y la salida
        expect(screen.queryByRole('button', { name: 'Entendido' })).toBeNull();
    });

    it('salir pide confirmación; si se cancela no se llama a nada', async () => {
        confirmToast.mockResolvedValue(false);
        render(<BloqueCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
        await waitFor(() => expect(confirmToast).toHaveBeenCalledTimes(1));
        expect(confirmToast.mock.calls[0][0]).toBe('¿Salir del modo de prueba?');
        expect(confirmToast.mock.calls[0][1]).toMatchObject({
            description: 'El equipo de Bioboros dejará de ver tu formulario, tus comidas, tus planes y tus conversaciones con el coach.',
            confirmLabel: 'Salir del modo de prueba',
            cancelLabel: 'Cancelar',
        });
        expect(llamadasDePrueba()).toHaveLength(0);
        expect(screen.getByRole('button', { name: 'Salir del modo de prueba' })).toBeEnabled();
    });

    it('confirmado: POST salir; queda «Ya no es una cuenta de prueba…», sin botón, y se refresca el perfil', async () => {
        confirmToast.mockResolvedValue(true);
        render(<BloqueCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
        await waitFor(() => expect(screen.getByText(YA_NO_ES)).toBeTruthy());
        const llamadas = llamadasDePrueba();
        expect(llamadas.map(([url]) => url)).toEqual(['/api/profile/prueba/salir']);
        expect(llamadas[0][1].method).toBe('POST');
        expect(screen.queryByRole('button', { name: 'Salir del modo de prueba' })).toBeNull();
        expect(toast.success).toHaveBeenCalledWith(YA_NO_ES);
        expect(ctx.refreshProfileAndPlan).toHaveBeenCalled();
        // el botón que tenía el foco desaparece: el foco pasa al mensaje (no se pierde en el <body>)
        expect(document.activeElement).toBe(screen.getByText(YA_NO_ES));
    });

    it('tras refrescar el perfil (ya sin marca) el bloque conserva el mensaje de que salió', async () => {
        confirmToast.mockResolvedValue(true);
        const { rerender } = render(<BloqueCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
        await waitFor(() => expect(screen.getByText(YA_NO_ES)).toBeTruthy());
        ctx = contexto({ userProfile: { id: UID, cuenta_de_prueba: null } });
        rerender(<BloqueCuentaPrueba />);
        expect(screen.getByText(YA_NO_ES)).toBeTruthy();
    });

    it('si el equipo la vuelve a marcar (otra fecha), el bloque vuelve a ofrecer la salida', async () => {
        confirmToast.mockResolvedValue(true);
        const { rerender } = render(<BloqueCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
        await waitFor(() => expect(screen.getByText(YA_NO_ES)).toBeTruthy());
        ctx = contexto({ userProfile: { id: UID, cuenta_de_prueba: { desde: '2026-10-05T09:00:00+00:00', aviso_visto: false } } });
        rerender(<BloqueCuentaPrueba />);
        expect(screen.queryByText(YA_NO_ES)).toBeNull();
        expect(screen.getByRole('button', { name: 'Salir del modo de prueba' })).toBeEnabled();
        expect(screen.getByTestId('bloque-cuenta-de-prueba')).toHaveTextContent(EXPLICACION);
    });

    it('si el servidor no lo anota, avisa y deja el botón para reintentar', async () => {
        confirmToast.mockResolvedValue(true);
        fetchWithAuth.mockResolvedValueOnce(respuesta({}, false, 503));
        render(<BloqueCuentaPrueba />);
        fireEvent.click(screen.getByRole('button', { name: 'Salir del modo de prueba' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
            'No pudimos sacar tu cuenta del modo de prueba. Revisa tu conexión e inténtalo de nuevo.',
        ));
        expect(screen.queryByText(YA_NO_ES)).toBeNull();
        expect(screen.getByRole('button', { name: 'Salir del modo de prueba' })).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('mientras sale, el botón queda «ocupado» sin perder el foco y sin admitir un segundo clic', async () => {
        confirmToast.mockResolvedValue(true);
        let soltar;
        fetchWithAuth.mockReturnValueOnce(new Promise((r) => { soltar = r; }));
        render(<BloqueCuentaPrueba />);
        const boton = screen.getByRole('button', { name: 'Salir del modo de prueba' });
        boton.focus();
        fireEvent.click(boton);
        const ocupado = await screen.findByRole('button', { name: 'Saliendo…' });
        expect(ocupado).toBe(boton);                                   // el mismo nodo: no se remontó
        expect(ocupado).toHaveAttribute('aria-disabled', 'true');
        expect(ocupado).not.toBeDisabled();                            // un `disabled` soltaría el foco al <body>
        expect(document.activeElement).toBe(ocupado);
        fireEvent.click(ocupado);
        expect(confirmToast).toHaveBeenCalledTimes(1);                 // el segundo clic no abre otra confirmación
        soltar(respuesta({ ok: true, salio: true }));
        await waitFor(() => expect(screen.getByText(YA_NO_ES)).toBeTruthy());
        expect(llamadasDePrueba()).toHaveLength(1);
    });
});

describe('[835] los textos: una sola fuente, y en los 5 idiomas', () => {
    const tFalso = (k, v = {}) => k.replace(/\{(\w+)\}/g, (_, x) => String(v[x]));

    it('textosCuentaDePrueba: la explicación (spec §5 + «con sus fotos»), tal cual', () => {
        const tx = textosCuentaDePrueba(tFalso);
        expect(tx.titulo).toBe('Esta es una cuenta de prueba');
        expect(tx.explicacion).toBe(EXPLICACION);
        expect(tx.entendido).toBe('Entendido');
        expect(tx.salir).toBe('Salir del modo de prueba');
        expect(tx.bloque).toBe('Cuenta de prueba');
        expect(tx.salio).toBe(YA_NO_ES);
    });

    it('cada texto nuevo existe en en-US, pt-BR, fr-FR e it-IT, con su {app}', () => {
        const tx = textosCuentaDePrueba((k) => k);   // la clave ES el español
        const claves = [
            tx.titulo, tx.explicacion, tx.entendido, tx.salir, tx.saliendo, tx.bloque, tx.salio,
            tx.confirmar, tx.confirmarDetalle, tx.errorSalir, tx.errorGuardar, tx.ahoraNo,
        ];
        for (const codigo of CATALOGOS) {
            const cat = catalogo(codigo);
            for (const clave of claves) {
                const v = cat[clave];
                expect(typeof v === 'string' && v.trim() !== '', `${codigo}: falta «${clave}»`).toBe(true);
                expect((clave.match(/\{app\}/g) || []).length, `${codigo}: {app} de «${clave}»`)
                    .toBe((v.match(/\{app\}/g) || []).length);
            }
        }
    });

    it('la ruta que nombra el texto es la de la interfaz de CADA idioma (Configuración → Privacidad)', () => {
        const tx = textosCuentaDePrueba((k) => k);
        const ruta = { 'en-US': 'Settings → Privacy', 'pt-BR': 'Configurações → Privacidade', 'fr-FR': 'Réglages → Confidentialité', 'it-IT': 'Impostazioni → Privacy' };
        for (const codigo of CATALOGOS) {
            expect(catalogo(codigo)[tx.explicacion], codigo).toContain(ruta[codigo]);
        }
    });

    it('en francés, la tipografía del repo: NBSP antes de «:» y fino irrompible antes de «?»', () => {
        // Los caracteres se construyen por código: un NBSP escrito en el fuente es invisible (y `no-irregular-whitespace`).
        const NBSP = String.fromCharCode(0xa0);
        const FINO = String.fromCharCode(0x202f);
        const fr = catalogo('fr-FR');
        expect(fr[YA_NO_ES]).toContain(`${NBSP}: `);
        expect(fr[YA_NO_ES]).not.toContain(' : ');
        expect(fr['¿Salir del modo de prueba?']).toMatch(new RegExp(`${FINO}[?]$`));
        expect(fr['¿Salir del modo de prueba?']).not.toContain(' ?');
    });
});

describe('[835] el montaje y los topes (anclas del código)', () => {
    it('DashboardLayout monta el aviso y el reporte de ajustes junto a AvisoRegalos, solo con cuenta', () => {
        const layout = fuente('src/components/dashboard/DashboardLayout.jsx');
        const i = layout.indexOf('{!isGuest && <AvisoRegalos />}');
        expect(i).toBeGreaterThan(-1);
        expect(layout).toContain("import AvisoCuentaPrueba from './AvisoCuentaPrueba';");
        expect(layout).toContain("import ReporteAjustesDispositivo from './ReporteAjustesDispositivo';");
        const despues = layout.slice(i, i + 900);
        expect(despues).toContain('{!isGuest && <AvisoCuentaPrueba />}');
        expect(despues).toContain('{!isGuest && <ReporteAjustesDispositivo />}');
    });

    it('Configuración monta el bloque entre «IA de terceros» y «Preferencias»', () => {
        const settings = fuente('src/pages/Settings.jsx');
        const privacidad = settings.slice(settings.indexOf("activeSection === 'privacy' && ("), settings.indexOf("activeSection === 'plan' && ("));
        const ia = privacidad.indexOf('<BloqueIADeTerceros />');
        const prueba = privacidad.indexOf('<BloqueCuentaPrueba />');
        const preferencias = privacidad.indexOf("{t('Preferencias')}");
        expect(ia).toBeGreaterThan(-1);
        expect(prueba).toBeGreaterThan(ia);
        expect(preferencias).toBeGreaterThan(prueba);
        expect(settings).toContain("import BloqueCuentaPrueba from '../components/settings/BloqueCuentaPrueba';");
    });

    it('la hoja usa el hook de accesibilidad y el portal a <body>; no toca el contexto de la app', () => {
        const aviso = fuente('src/components/dashboard/AvisoCuentaPrueba.jsx');
        expect(aviso).toContain('useModalAccessibility');
        expect(aviso).toContain('createPortal(hoja, document.body)');
        expect(aviso).toContain('role="dialog"');
        expect(aviso).toContain('aria-modal="true"');
        expect(aviso).toContain('ph-no-capture');
    });

    it('AssessmentContext.jsx respeta su tope documentado: 4.700 líneas (wc -l)', () => {
        const lineas = (fuente('src/context/AssessmentContext.jsx').match(/\n/g) || []).length;
        expect(lineas).toBeLessThanOrEqual(4700);
    });
});
