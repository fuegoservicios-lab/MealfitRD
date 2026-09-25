/**
 * [P1-PLAN-LOTE-280 · 2026-09-25] Push NATIVA con Firebase Cloud Messaging (Android).
 *
 * El dueño creó el proyecto `bioboros-9e71d`: lo que decide el servidor (plan listo, coach, Nevera, pausas) llega a la
 * app cerrada. Aquí: el registro del token (sin diálogos al arrancar), su reenvío por cuenta, el borrado al cerrar
 * sesión, el eco en primer plano, y que el vigía del plan no duplique el aviso cuando ya hay push nativa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pedidos = [];
const listeners = {};
const PN = {
    checkPermissions: vi.fn(async () => ({ receive: 'granted' })),
    register: vi.fn(async () => {}),
    createChannel: vi.fn(async () => {}),
    addListener: vi.fn(async (ev, cb) => { listeners[ev] = cb; }),
};
const locales = [];

vi.mock('../config/platform', () => ({
    isNativeApp: () => true,
    nativePluginAvailable: () => true,
    nativePlatform: () => 'android',
}));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: PN }));
vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(async (url, opts) => { pedidos.push({ url, ...opts }); return { ok: true, json: async () => ({}) }; }),
}));
vi.mock('../utils/avisosDeComida', () => ({
    programarAvisoLocal: vi.fn(async (n) => { locales.push(n); return true; }),
}));

import {
    hayQueEnviar, enviarToken, iniciarPushNativa, olvidarTokenAlCerrarSesion, pushNativaActiva,
    CLAVE_TOKEN, CLAVE_ENVIADO, REENVIO_MS,
} from '../native/pushNativa';

const SRC = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const TOKEN = 'f'.repeat(40);

beforeEach(() => {
    window.localStorage.clear();
    pedidos.length = 0;
    locales.length = 0;
});

describe('[280] reglas del reenvío', () => {
    it('se envía si no se envió, si cambió la cuenta o el token, o pasó un día', () => {
        const ahora = 1_000_000_000_000;
        expect(hayQueEnviar({ token: TOKEN, usuario: 'u1', enviado: null, ahora })).toBe(true);
        expect(hayQueEnviar({ token: TOKEN, usuario: 'u2', enviado: { user: 'u1', token: TOKEN, at: ahora }, ahora })).toBe(true);
        expect(hayQueEnviar({ token: 'x'.repeat(40), usuario: 'u1', enviado: { user: 'u1', token: TOKEN, at: ahora }, ahora })).toBe(true);
        expect(hayQueEnviar({ token: TOKEN, usuario: 'u1', enviado: { user: 'u1', token: TOKEN, at: ahora }, ahora })).toBe(false);
        expect(hayQueEnviar({ token: TOKEN, usuario: 'u1', enviado: { user: 'u1', token: TOKEN, at: ahora - REENVIO_MS - 1 }, ahora })).toBe(true);
        expect(hayQueEnviar({ token: TOKEN, usuario: null, enviado: null, ahora })).toBe(false);   // sin sesión, no
    });
});

describe('[280] registro y ciclo de vida', () => {
    it('al arrancar: canal propio, registro SIN pedir permiso, y el token va al servidor de la cuenta', async () => {
        window.localStorage.setItem('mealfit_user_id', 'u1');
        await iniciarPushNativa();
        expect(PN.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'bioboros-avisos', importance: 4 }));
        await vi.waitFor(() => expect(PN.register).toHaveBeenCalled());
        expect(PN).not.toHaveProperty('requestPermissions');   // nunca un diálogo al arrancar
        await listeners.registration({ value: TOKEN });
        await vi.waitFor(() => expect(pedidos.some((p) => p.url === '/api/notifications/device-token' && p.method === 'POST')).toBe(true));
        const post = pedidos.find((p) => p.method === 'POST');
        expect(JSON.parse(post.body)).toEqual({ token: TOKEN, platform: 'android' });
        await vi.waitFor(() => expect(pushNativaActiva()).toBe(true));
        pedidos.length = 0;
        expect(await enviarToken()).toBe(false);   // al día: no repite
        expect(pedidos).toHaveLength(0);
    });

    it('en primer plano: el plan listo (solo_si_no_mira) no se repite; lo demás sale como aviso local', async () => {
        await listeners.pushNotificationReceived({ title: 'Tu plan está listo 🎉', body: 'Toca para verlo.', data: { solo_si_no_mira: '1' } });
        expect(locales).toHaveLength(0);
        await listeners.pushNotificationReceived({ title: 'Tu coach', body: 'Hola', data: { url: '/dashboard/agent' } });
        expect(locales[0]).toMatchObject({ title: 'Tu coach', url: '/dashboard/agent' });
    });

    it('tocar la push abre su ruta', async () => {
        await listeners.pushNotificationActionPerformed({ notification: { data: { url: '/dashboard' } } });
        expect(window.location.pathname).toBe('/dashboard');
    });

    it('al cerrar sesión borra el token de ESTA cuenta en el servidor y olvida el envío', async () => {
        window.localStorage.setItem(CLAVE_TOKEN, TOKEN);
        window.localStorage.setItem(CLAVE_ENVIADO, JSON.stringify({ user: 'u1', token: TOKEN, at: Date.now() }));
        await olvidarTokenAlCerrarSesion();
        expect(pedidos.find((p) => p.method === 'DELETE')?.url).toBe('/api/notifications/device-token');
        expect(window.localStorage.getItem(CLAVE_ENVIADO)).toBeNull();
    });
});

describe('[280] cableado', () => {
    it('arranca en la app nativa, se registra al dar el permiso y se olvida en el logout', () => {
        expect(SRC('main.jsx')).toContain('m.iniciarPushNativa()');
        const av = SRC('utils/avisosDeComida.js');
        expect(av).toContain("import('../native/pushNativa').then((m) => m.registrarSiHayPermiso())");
        expect(av).toContain('olvidarTokenAlCerrarSesion()');
        expect(SRC('utils/avisoPlanListo.js')).toContain('if (pushNativaActiva()) return;');
    });

    it('el google-services.json es del proyecto y del paquete de la app', () => {
        const gs = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'android', 'app', 'google-services.json'), 'utf8'));
        expect(gs.project_info.project_id).toBe('bioboros-9e71d');
        expect(gs.client.map((c) => c.client_info.android_client_info.package_name)).toContain('com.bioboros.app');
    });
});
