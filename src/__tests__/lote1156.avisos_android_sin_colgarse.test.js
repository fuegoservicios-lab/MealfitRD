// [P1-PLAN-LOTE-1156 · 2026-11-21] «Activando…» para siempre en Android (captura del dueño: un usuario «no lo siente
// tan bien»). Activar encadenaba llamadas nativas y una al servidor SIN tope: si una no contestaba, el botón giraba sin
// fin. El doble imita al Proxy real de Capacitor (lo desconocido no contesta nunca) y aquí también lo conocido puede
// quedarse colgado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const colgada = () => new Promise(() => {});
let permiso = 'prompt';
const metodos = {};
const reset = () => {
    permiso = 'prompt';
    Object.assign(metodos, {
        checkPermissions: async () => ({ display: permiso }),
        requestPermissions: async () => { permiso = 'granted'; return { display: permiso }; },
        cancel: async () => {},
        schedule: async () => {},
    });
};
vi.mock('@capacitor/local-notifications', () => ({
    LocalNotifications: new Proxy({}, { get: (_t, prop) => metodos[prop] || (() => colgada()) }),
}));
vi.mock('../config/platform', () => ({ isNativeApp: () => true, nativePluginAvailable: () => true, nativePlatform: () => 'android' }));
const api = vi.hoisted(() => ({ ok: true }));
vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(async () => (api.ok
        ? { ok: true, json: async () => ({ enabled: true, reminders: [{ meal: 'cena', hour: 23, minute: 59, title: 'Bioboros', body: '¿Ya cenaste?' }] }) }
        : { ok: false, status: 503, json: async () => ({}) })),
}));

// módulo nuevo en cada prueba: una sincronización colgada de la prueba anterior no debe contaminar la siguiente
let activarAvisos;
let CLAVE_AVISOS_LOCALES;
beforeEach(async () => {
    localStorage.clear(); reset(); api.ok = true;
    vi.resetModules();
    ({ activarAvisos, CLAVE_AVISOS_LOCALES } = await import('../utils/avisosDeComida'));
});

describe('lote 1156 · encender los avisos en Android nunca se queda girando', () => {
    it('el diálogo de permiso que vuelve a la app sin contestar: se mira el permiso al volver', async () => {
        metodos.requestPermissions = () => colgada();
        const t0 = Date.now();
        const p = activarAvisos();
        await new Promise((r) => setTimeout(r, 50));
        permiso = 'granted';                       // la persona tocó «Permitir» en el diálogo del sistema
        document.dispatchEvent(new Event('visibilitychange'));
        const r = await p;
        expect(r.ok).toBe(true);
        expect(Date.now() - t0).toBeLessThan(4000);
        expect(localStorage.getItem(CLAVE_AVISOS_LOCALES)).toBe('1');
    });

    it('si al volver el permiso quedó denegado, lo dice (no se queda esperando)', async () => {
        metodos.requestPermissions = () => colgada();
        const p = activarAvisos();
        await new Promise((r) => setTimeout(r, 50));
        permiso = 'denied';
        document.dispatchEvent(new Event('visibilitychange'));
        expect(await p).toMatchObject({ ok: false, code: 'permiso_denegado', reason: 'denied' });
    });

    it('una primera programación que no termina no bloquea: encendido, y sigue en segundo plano', async () => {
        permiso = 'granted';
        metodos.schedule = () => colgada();
        const t0 = Date.now();
        const r = await activarAvisos();
        expect(r).toMatchObject({ ok: true, pendiente: 'tarda' });
        expect(Date.now() - t0).toBeLessThan(7000);
        expect(localStorage.getItem(CLAVE_AVISOS_LOCALES)).toBe('1');
    }, 10000);

    it('el servidor caído no apaga lo que la persona acaba de encender', async () => {
        permiso = 'granted';
        api.ok = false;
        const r = await activarAvisos();
        expect(r).toMatchObject({ ok: true, pendiente: 'servidor' });
        expect(localStorage.getItem(CLAVE_AVISOS_LOCALES)).toBe('1');
    });

    it('un checkPermissions que no contesta cuenta como «sin decidir» y se pide el permiso', async () => {
        let pedido = false;
        metodos.checkPermissions = () => (pedido ? Promise.resolve({ display: 'granted' }) : colgada());
        metodos.requestPermissions = async () => { pedido = true; return { display: 'granted' }; };
        const r = await activarAvisos();
        expect(pedido).toBe(true);
        expect(r.ok).toBe(true);
    }, 10000);
});
