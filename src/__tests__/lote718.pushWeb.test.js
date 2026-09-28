/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] Web Push: cerrar el diálogo de permiso NO es bloquearlo, y el plazo del Service
 * Worker no llega a la pantalla como texto en inglés.
 *
 *   · `requestNotificationPermission` devolvía un booleano: 'denied' y 'default' (diálogo cerrado sin elegir) eran el
 *     mismo `false`, y Configuración mandaba a desbloquear en los ajustes del navegador algo que no estaba bloqueado.
 *   · El `reject(new Error("Service Worker timeout"))` llegaba como `error` y se pintaba tal cual, en inglés.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config/platform', () => ({
    isNativeApp: () => false,
    nativePluginAvailable: () => false,
    nativePlatform: () => 'web',
}));
vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    api: (p) => p,
}));

import { pedirPermisoDeNotificaciones, requestNotificationPermission, subscribeToPushNotifications } from '../utils/pushNotifications';
import { activarAvisos } from '../utils/avisosDeComida';

let permisoDelNavegador = 'default';
let respuestaDelDialogo = 'default';

function conWebPush({ registro = null, ready = new Promise(() => {}) } = {}) {
    Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { getRegistration: vi.fn(async () => registro), ready, addEventListener: vi.fn() },
    });
    window.PushManager = function PushManager() {};
}

beforeEach(() => {
    permisoDelNavegador = 'default';
    respuestaDelDialogo = 'default';
    window.Notification = {
        get permission() { return permisoDelNavegador; },
        requestPermission: vi.fn(async () => { permisoDelNavegador = respuestaDelDialogo; return respuestaDelDialogo; }),
    };
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U');
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    delete window.PushManager;
    delete navigator.serviceWorker;
});

describe('[718] el permiso devuelve su ESTADO', () => {
    it('granted / denied / default (cerrado sin elegir) / unsupported', async () => {
        respuestaDelDialogo = 'granted';
        expect(await pedirPermisoDeNotificaciones()).toBe('granted');
        respuestaDelDialogo = 'denied';
        expect(await pedirPermisoDeNotificaciones()).toBe('denied');
        respuestaDelDialogo = 'default';
        expect(await pedirPermisoDeNotificaciones()).toBe('default');
        const guardado = window.Notification;
        delete window.Notification;
        expect(await pedirPermisoDeNotificaciones()).toBe('unsupported');
        window.Notification = guardado;
    });

    it('el booleano de siempre sigue funcionando para quien lo use', async () => {
        respuestaDelDialogo = 'granted';
        expect(await requestNotificationPermission()).toBe(true);
        respuestaDelDialogo = 'default';
        expect(await requestNotificationPermission()).toBe(false);
    });
});

describe('[718] activarAvisos distingue «cerrado» de «bloqueado»', () => {
    it('diálogo cerrado sin elegir ⇒ reason: dismissed (NO es un bloqueo)', async () => {
        conWebPush();
        respuestaDelDialogo = 'default';
        const r = await activarAvisos();
        expect(r).toEqual({ ok: false, canal: 'web-push', code: 'permiso_denegado', reason: 'dismissed' });
    });

    it('bloqueado ⇒ reason: denied', async () => {
        conWebPush();
        respuestaDelDialogo = 'denied';
        const r = await activarAvisos();
        expect(r).toEqual({ ok: false, canal: 'web-push', code: 'permiso_denegado', reason: 'denied' });
    });
});

describe('[718] los fallos de la suscripción son CÓDIGOS', () => {
    it('el plazo del Service Worker sale como `sw_missing`, nunca «Service Worker timeout»', async () => {
        vi.useFakeTimers();
        conWebPush({ registro: null, ready: new Promise(() => {}) });
        const pendiente = subscribeToPushNotifications();
        await vi.advanceTimersByTimeAsync(3100);
        const r = await pendiente;
        expect(r.success).toBe(false);
        expect(r.code).toBe('sw_missing');
        expect(r.error ?? null, 'el texto en inglés volvió a la pantalla').toBeNull();
        expect(JSON.stringify(r)).not.toMatch(/timeout/i);
    });

    it('permiso retirado entre pedirlo y suscribirse (NotAllowedError) ⇒ permiso_denegado / denied', async () => {
        const error = Object.assign(new Error('Registration failed - permission denied'), { name: 'NotAllowedError' });
        const registro = { pushManager: { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => { throw error; }) } };
        conWebPush({ registro });
        const r = await subscribeToPushNotifications();
        expect(r).toEqual({ success: false, code: 'permiso_denegado', reason: 'denied' });
    });
});
