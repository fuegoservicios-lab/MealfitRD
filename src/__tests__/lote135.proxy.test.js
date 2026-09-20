// [P1-PLAN-LOTE-135 · 2026-09-20] «Es que ni se inmuta, no se puede encender» — el interruptor de «Alertas Inteligentes»
// en el binario que YA trae el plugin (build 19).
//
// La causa: la fachada devolvía el plugin de Capacitor desde una función `async`. Al devolver un valor, una función async
// le pregunta si es una promesa (lee `.then`); el plugin es un Proxy que responde a CUALQUIER propiedad con una función
// que llama al lado nativo, así que `.then(resolve, reject)` se convierte en una llamada nativa «then» que no existe y
// que jamás invoca a `resolve`: la promesa no se resuelve NUNCA. `estadoDeAvisos()` se quedaba colgada, el canal en
// `null`, y el interruptor deshabilitado para siempre. En los binarios SIN el plugin se salía antes por otra rama
// («Actualiza la app…»), y las pruebas del lote 133 simulaban el plugin con un objeto normal: nadie lo vio.
//
// Este doble imita al Proxy real: toda propiedad desconocida es una función cuya promesa no se resuelve.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const colgada = () => new Promise(() => {});
const llamadas = [];
let permiso = 'prompt';
const metodos = {
    checkPermissions: async () => ({ display: permiso }),
    requestPermissions: async () => { permiso = 'granted'; return { display: permiso }; },
    cancel: async () => {},
    schedule: async (o) => { llamadas.push(['schedule', o.notifications.length]); },
    addListener: async () => ({ remove: async () => {} }),
};
vi.mock('@capacitor/local-notifications', () => ({
    LocalNotifications: new Proxy({}, { get: (_t, prop) => metodos[prop] || (() => colgada()) }),
}));
vi.mock('../config/platform', () => ({ isNativeApp: () => true, nativePluginAvailable: () => true }));
vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(async () => ({
        ok: true,
        json: async () => ({ enabled: true, reminders: [{ meal: 'cena', hour: 23, minute: 59, title: 'Bioboros', body: '¿Ya cenaste?' }] }),
    })),
}));

import { estadoDeAvisos, activarAvisos, desactivarAvisos } from '../utils/avisosDeComida';

const oColgado = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r('COLGADO'), 800))]);

beforeEach(() => { localStorage.clear(); llamadas.length = 0; permiso = 'prompt'; });

describe('lote 135 · el plugin de Capacitor no se devuelve desde una función async', () => {
    it('el estado se resuelve (canal local, sin permiso todavía): el interruptor deja de nacer muerto', async () => {
        const r = await oColgado(estadoDeAvisos());
        expect(r).not.toBe('COLGADO');
        expect(r).toEqual({ canal: 'local', activo: false, bloqueado: false });
    });

    it('encender pide permiso, programa y no se cuelga; apagar tampoco', async () => {
        const on = await oColgado(activarAvisos());
        expect(on).not.toBe('COLGADO');
        expect(on.ok).toBe(true);
        expect(on.canal).toBe('local');
        expect(llamadas.some(([m]) => m === 'schedule')).toBe(true);
        const off = await oColgado(desactivarAvisos());
        expect(off).toEqual({ ok: true, canal: 'local' });
    });
});
