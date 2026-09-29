/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] Apagar «Alertas Inteligentes» en la app nativa apaga TAMBIÉN la push del servidor.
 *
 * EL DEFECTO: `desactivarAvisos()` solo cancelaba los recordatorios LOCALES. El token de FCM/APNs seguía registrado
 * en el servidor —plan listo, coach, Nevera seguían llegando— y `registrarSiHayPermiso()` lo volvía a registrar en
 * cada regreso a la app. Ahora apagar borra el token (DELETE /api/notifications/device-token) y deja una marca por
 * cuenta que impide re-registrarlo mientras siga apagado; encender la quita.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pedidos = [];
let deleteFalla = false;
const PN = {
    checkPermissions: vi.fn(async () => ({ receive: 'granted' })),
    register: vi.fn(async () => {}),
    createChannel: vi.fn(async () => {}),
    addListener: vi.fn(async () => {}),
};
const LN = {
    checkPermissions: vi.fn(async () => ({ display: 'granted' })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' })),
    cancel: vi.fn(async () => {}),
    schedule: vi.fn(async () => {}),
    createChannel: vi.fn(async () => {}),
    checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'granted' })),
    addListener: vi.fn(async () => ({ remove: async () => {} })),
};

vi.mock('../config/platform', () => ({
    isNativeApp: () => true,
    nativePluginAvailable: () => true,
    nativePlatform: () => 'android',
}));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: PN }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }));
vi.mock('../config/api', () => ({
    api: (p) => p,
    fetchWithAuth: vi.fn(async (url, opts = {}) => {
        pedidos.push({ url, method: opts.method || 'GET', body: opts.body });
        if (url === '/api/notifications/device-token' && opts.method === 'DELETE' && deleteFalla) throw new Error('sin red');
        if (url.startsWith('/api/notifications/meal-reminders')) {
            return { ok: true, status: 200, json: async () => ({ enabled: true, reminders: [] }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
    }),
}));

import {
    pushNativaApagada, apagarPushNativa, permitirPushNativa, registrarSiHayPermiso, enviarToken,
    olvidarTokenAlCerrarSesion, pushNativaActiva, CLAVE_TOKEN, CLAVE_ENVIADO, CLAVE_APAGADA,
} from '../native/pushNativa';
import { activarAvisos, desactivarAvisos, apagarAvisosAlCerrarSesion, CLAVE_AVISOS_LOCALES } from '../utils/avisosDeComida';

const TOKEN = 'f'.repeat(40);
const deletes = () => pedidos.filter((p) => p.url === '/api/notifications/device-token' && p.method === 'DELETE');
const posts = () => pedidos.filter((p) => p.url === '/api/notifications/device-token' && p.method === 'POST');

beforeEach(() => {
    window.localStorage.clear();
    pedidos.length = 0;
    deleteFalla = false;
    vi.clearAllMocks();
    window.localStorage.setItem('mealfit_user_id', 'u1');
    window.localStorage.setItem(CLAVE_TOKEN, TOKEN);
    window.localStorage.setItem(CLAVE_ENVIADO, JSON.stringify({ user: 'u1', token: TOKEN, at: Date.now() }));
    window.localStorage.setItem(CLAVE_AVISOS_LOCALES, '1');
});

describe('[718] apagar las alertas apaga la push nativa', () => {
    it('desactivarAvisos borra el token en el servidor y deja la marca de «apagada»', async () => {
        const r = await desactivarAvisos();
        expect(r).toEqual({ ok: true, canal: 'local' });   // el contrato del interruptor no cambia
        expect(deletes(), 'apagar no borró el token de FCM del servidor').toHaveLength(1);
        expect(JSON.parse(deletes()[0].body)).toEqual({ token: TOKEN, platform: 'android' });
        expect(pushNativaApagada()).toBe(true);
        expect(pushNativaActiva()).toBe(false);
        expect(window.localStorage.getItem(CLAVE_ENVIADO)).toBeNull();
    });

    it('mientras siga apagada, volver a la app NO vuelve a registrar el token', async () => {
        await desactivarAvisos();
        expect(await registrarSiHayPermiso()).toBe(false);
        expect(PN.register).not.toHaveBeenCalled();
        expect(await enviarToken()).toBe(false);
        expect(posts()).toHaveLength(0);
    });

    it('la marca es de la CUENTA: otra cuenta en el mismo teléfono se registra normal', async () => {
        await apagarPushNativa();
        window.localStorage.setItem('mealfit_user_id', 'u2');
        expect(pushNativaApagada()).toBe(false);
        expect(await registrarSiHayPermiso()).toBe(true);
    });

    it('sin red al apagar, el borrado queda pendiente y el cierre de sesión lo reintenta', async () => {
        deleteFalla = true;
        expect(await apagarPushNativa()).toBe(false);
        expect(JSON.parse(window.localStorage.getItem(CLAVE_APAGADA))).toEqual({ user: 'u1', pendiente: true });
        deleteFalla = false;
        pedidos.length = 0;
        await olvidarTokenAlCerrarSesion();
        expect(deletes()).toHaveLength(1);
        expect(JSON.parse(window.localStorage.getItem(CLAVE_APAGADA))).toEqual({ user: 'u1', pendiente: false });
    });
});

describe('[718] encender vuelve a permitirla', () => {
    it('activarAvisos quita la marca y el token vuelve al servidor', async () => {
        await desactivarAvisos();
        pedidos.length = 0;
        const r = await activarAvisos();
        expect(r.ok).toBe(true);
        await vi.waitFor(() => expect(posts(), 'encender no volvió a registrar el token').toHaveLength(1));
        expect(pushNativaApagada()).toBe(false);
        expect(PN.register).toHaveBeenCalled();
    });

    it('permitirPushNativa, suelta: quita la marca, registra y envía', async () => {
        await apagarPushNativa();
        pedidos.length = 0;
        expect(await permitirPushNativa()).toBe(true);
        expect(window.localStorage.getItem(CLAVE_APAGADA)).toBeNull();
        expect(posts()).toHaveLength(1);
    });
});

describe('[718] cerrar sesión no es «apagar»', () => {
    it('el cierre de sesión borra el token pero NO deja la marca (al volver a entrar se registra solo)', async () => {
        await apagarAvisosAlCerrarSesion();
        expect(deletes()).toHaveLength(1);
        expect(window.localStorage.getItem(CLAVE_APAGADA)).toBeNull();
    });

    it('sin nada registrado para la cuenta, no hay DELETE (tras borrar la cuenta respondía 401)', async () => {
        window.localStorage.removeItem(CLAVE_ENVIADO);
        await olvidarTokenAlCerrarSesion();
        expect(deletes()).toHaveLength(0);
    });
});
