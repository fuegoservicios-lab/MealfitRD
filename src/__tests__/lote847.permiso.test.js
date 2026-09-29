/**
 * [P1-PLAN-LOTE-847 · 2026-09-29] La analítica y el replay de Sentry, con PERMISO PREVIO (App Review 5.1.1(ii), RGPD).
 *
 * La regla es UNA (`analiticaPermitida`, utils/analytics.js) y la leen PostHog y Sentry:
 *  - permiso ANOTADO: `analytics_consent` true en la cuenta, o `analytics: true` en el registro local del invitado;
 *  - una cuenta vieja con `analytics_consent` NULL NO tiene permiso (antes: sin opt-out, todo encendido);
 *  - un «no» del dispositivo (`mealfit_analytics_opt_out` = '1') manda sobre el permiso de la cuenta;
 *  - conceder arranca PostHog SIN recargar; retirar lo corta YA (reset + `before_send`) y para el replay.
 *
 * PostHog va con un SDK falso (`posthog-js` sustituido): aquí importa QUIÉN arranca y cuándo, no el SDK (lo prueba
 * lote794.test.js con el real).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn(), API_BASE: '', fijarGanchosIA: vi.fn() }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const UID = '11111111-2222-3333-4444-555555555555';
const SID = 'sesion-invitado-847';
const TOKEN = 'phc_test_lote847';

let sdk;
const nuevoSdk = () => ({
    init: vi.fn(function init(_key, config) { this.config = config; }),
    identify: vi.fn(),
    reset: vi.fn(),
    capture: vi.fn(),
    opt_out_capturing: vi.fn(),
});

const tic = () => new Promise((r) => setTimeout(r, 0));

async function cargar() {
    vi.resetModules();
    sdk = nuevoSdk();
    vi.doMock('posthog-js', () => ({ default: sdk }));
    const analytics = await import('../utils/analytics');
    const cliente = await import('../utils/posthogClient');
    const permiso = await import('../consent/consentimientoIA');
    const { AI_CONSENT_STORAGE_KEY, AI_CONSENT_VERSION } = await import('../consent/version');
    return { analytics, cliente, permiso, AI_CONSENT_STORAGE_KEY, AI_CONSENT_VERSION };
}

const perfil = (analytics) => ({
    version: 'x', vigente: true, ai_consent_version: 'x', ai_consent_at: '2026-09-29T15:00:00+00:00',
    ai_cn_transfer_at: null, ai_consent_revoked_at: null, analytics,
});

beforeEach(() => {
    localStorage.clear();
    document.cookie = 'mf_analytics_opt_out=1; Max-Age=0; path=/';
    delete window.posthog;
    vi.stubEnv('VITE_POSTHOG_KEY', TOKEN);
});

afterEach(async () => {
    // Un arranque de PostHog en vuelo de ESTE test no puede aterrizar en el siguiente (resetModules no lo cancela).
    await new Promise((r) => setTimeout(r, 20));
    delete window.posthog;
    vi.unstubAllEnvs();
    vi.doUnmock('posthog-js');
});

describe('[P1-PLAN-LOTE-847] la regla única', () => {
    beforeEach(() => vi.stubEnv('VITE_POSTHOG_KEY', ''));   // aquí solo la regla: sin SDK de por medio

    it('sin permiso anotado NO hay analítica, aunque nadie la haya apagado (antes: encendida por defecto)', async () => {
        const { analytics } = await cargar();
        expect(analytics.isAnalyticsOptedOut()).toBe(false);
        expect(analytics.analiticaPermitida()).toBe(false);
    });

    it('solo `true` es permiso: NULL (cuenta vieja) y false no lo son', async () => {
        const { analytics } = await cargar();
        for (const valor of [null, undefined, false, 'true', 1]) {
            analytics.fijarPermisoAnalitica(valor);
            expect(analytics.analiticaPermitida()).toBe(false);
        }
        analytics.fijarPermisoAnalitica(true);
        expect(analytics.analiticaPermitida()).toBe(true);
    });

    it('un «no» del dispositivo manda sobre el permiso de la cuenta', async () => {
        const { analytics } = await cargar();
        analytics.fijarPermisoAnalitica(true);
        analytics.persistAnalyticsOptOut(true);
        expect(analytics.analiticaPermitida()).toBe(false);
    });

    it('sin permiso, trackEvent no emite nada', async () => {
        const { analytics } = await cargar();
        window.posthog = { capture: vi.fn() };
        analytics.trackEvent('plan_generated', { days: 7 });
        expect(window.posthog.capture).not.toHaveBeenCalled();
        analytics.fijarPermisoAnalitica(true);
        analytics.trackEvent('plan_generated', { days: 7 });
        expect(window.posthog.capture).toHaveBeenCalledWith('plan_generated', { days: 7 });
    });
});

describe('[P1-PLAN-LOTE-847] PostHog: sin permiso no arranca; con él sí, sin recargar', () => {
    it('sin permiso: initPostHog no carga el SDK, no llama a init ni a identify', async () => {
        const { cliente } = await cargar();
        cliente.identifyPostHog(UID);
        await cliente.initPostHog();
        await tic();
        expect(sdk.init).not.toHaveBeenCalled();
        expect(sdk.identify).not.toHaveBeenCalled();
        expect(window.posthog).toBeUndefined();
    });

    it('cuenta vieja (analytics_consent NULL): el perfil llega y PostHog sigue sin arrancar', async () => {
        const { cliente, permiso } = await cargar();
        localStorage.setItem('mealfit_user_id', UID);
        await cliente.initPostHog();
        permiso.fijarTitularConsentimientoIA({ uid: UID });
        permiso.sincronizarConsentimientoIADesdePerfil(UID, perfil(null));
        await tic();
        expect(sdk.init).not.toHaveBeenCalled();
        expect(window.posthog).toBeUndefined();
    });

    it('cuenta con analytics_consent true: el perfil llega DESPUÉS del idle y PostHog arranca e identifica', async () => {
        const { cliente, permiso } = await cargar();
        localStorage.setItem('mealfit_user_id', UID);
        cliente.identifyPostHog(UID);
        await cliente.initPostHog();              // el idle: aún sin permiso
        expect(sdk.init).not.toHaveBeenCalled();
        permiso.fijarTitularConsentimientoIA({ uid: UID });
        permiso.sincronizarConsentimientoIADesdePerfil(UID, perfil(true));
        await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
        expect(sdk.init.mock.calls[0][0]).toBe(TOKEN);
        expect(window.posthog).toBe(sdk);
        expect(sdk.identify).toHaveBeenCalledWith(UID, {});
    });

    it('invitado: manda su registro local del permiso (analytics true arranca; null no)', async () => {
        const { cliente, permiso, AI_CONSENT_STORAGE_KEY, AI_CONSENT_VERSION } = await cargar();
        localStorage.setItem('mealfit_user_id', 'guest');
        localStorage.setItem('mealfit_guest_session_id', SID);
        const registro = (analytics) => JSON.stringify({ v: AI_CONSENT_VERSION, at: 'x', quien: `invitado:${SID}`, analytics });

        localStorage.setItem(AI_CONSENT_STORAGE_KEY, registro(null));
        permiso.fijarTitularConsentimientoIA({ invitado: true });
        await cliente.initPostHog();
        await tic();
        expect(sdk.init).not.toHaveBeenCalled();

        localStorage.setItem(AI_CONSENT_STORAGE_KEY, registro(true));
        expect(permiso.anotarAnaliticaDelPermiso(true)).toBe(true);
        await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    });

    it('un invitado SIN registro del permiso no puede encenderla desde Configuración: se le abre la hoja', async () => {
        const { analytics, permiso } = await cargar();
        localStorage.setItem('mealfit_user_id', 'guest');
        localStorage.setItem('mealfit_guest_session_id', SID);
        permiso.fijarTitularConsentimientoIA({ invitado: true });
        expect(permiso.anotarAnaliticaDelPermiso(true)).toBe(false);
        expect(analytics.analiticaPermitida()).toBe(false);
    });

    it('retirar el permiso corta YA: reset, before_send descarta, y volver a darlo reanuda sin recargar', async () => {
        const { analytics, cliente, permiso } = await cargar();
        localStorage.setItem('mealfit_user_id', UID);
        cliente.identifyPostHog(UID);
        permiso.fijarTitularConsentimientoIA({ uid: UID });
        permiso.sincronizarConsentimientoIADesdePerfil(UID, perfil(true));
        await vi.waitFor(() => expect(sdk.init).toHaveBeenCalled());
        const beforeSend = sdk.init.mock.calls[0][1].before_send;
        expect(beforeSend({ event: 'x' })).toEqual({ event: 'x' });

        // Configuración → «Ayuda a mejorar» apagado (el mismo camino que usa Settings.jsx).
        permiso.anotarAnaliticaDelPermiso(false);
        analytics.persistAnalyticsOptOut(true);
        expect(analytics.analiticaPermitida()).toBe(false);
        expect(sdk.reset).toHaveBeenCalledWith(true);
        expect(beforeSend({ event: 'x' })).toBeNull();
        // No-op con cookieless_mode 'always' (PrivacidadAnalitica.p1.test.js): el corte real es before_send + reset.
        expect(sdk.opt_out_capturing).not.toHaveBeenCalled();

        sdk.identify.mockClear();
        permiso.anotarAnaliticaDelPermiso(true);
        analytics.persistAnalyticsOptOut(false);
        expect(beforeSend({ event: 'x' })).toEqual({ event: 'x' });
        expect(sdk.identify).toHaveBeenCalledWith(UID, {});
        expect(sdk.init).toHaveBeenCalledTimes(1);   // no se reinicia el SDK
    });

    it('el permiso retirado en el SERVIDOR (otro dispositivo) también corta al llegar', async () => {
        const { analytics, cliente, permiso } = await cargar();
        localStorage.setItem('mealfit_user_id', UID);
        await cliente.initPostHog();
        permiso.fijarTitularConsentimientoIA({ uid: UID });
        permiso.sincronizarConsentimientoIADesdePerfil(UID, perfil(true));
        await vi.waitFor(() => expect(sdk.init).toHaveBeenCalled());
        permiso.sincronizarConsentimientoIADesdePerfil(UID, { ...perfil(false), ai_consent_at: '2026-09-30T15:00:00+00:00' });
        expect(analytics.analiticaPermitida()).toBe(false);
        expect(sdk.reset).toHaveBeenCalledWith(true);
    });

    it('cerrar sesión deja sin titular: sin permiso anotado, la analítica se apaga', async () => {
        const { analytics, permiso } = await cargar();
        localStorage.setItem('mealfit_user_id', UID);
        permiso.fijarTitularConsentimientoIA({ uid: UID });
        permiso.sincronizarConsentimientoIADesdePerfil(UID, perfil(true));
        expect(analytics.analiticaPermitida()).toBe(true);
        permiso.fijarTitularConsentimientoIA({});
        expect(analytics.analiticaPermitida()).toBe(false);
    });
});

describe('[P1-PLAN-LOTE-847] Configuración enseña la regla, no el opt-out', () => {
    it('«Ayuda a mejorar» arranca y se relee con analiticaPermitida, y el interruptor anota en el permiso', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const src = fs.readFileSync(path.resolve(__dirname, '../pages/Settings.jsx'), 'utf8');
        expect(src).toContain('useState(() => analiticaPermitida())');
        const i = src.indexOf('const handleToggleAnalytics = () => {');
        const cuerpo = src.slice(i, src.indexOf('\n    };', i));
        expect(cuerpo).toContain('if (!anotarAnaliticaDelPermiso(!analyticsEnabled)) { void pedirHojaConsentimientoIA(); return; }');
    });
});
