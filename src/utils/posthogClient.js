// [POSTHOG-ANALYTICS · 2026-07-12] Analítica de producto (usuarios activos, embudo
// registro→plan→pago, retención) vía PostHog. Complementa a Sentry (errores):
// Sentry responde "¿algo falló?", PostHog responde "¿cuántos usan la app / pagan?".
//
// Todo gated por VITE_POSTHOG_KEY: SIN la key el módulo es no-op TOTAL — no carga el
// SDK, no crea window.posthog, no envía nada. Respeta el opt-out de privacidad
// (isAnalyticsOptedOut, P2-PRIVACY-SETTINGS). El SDK (~50KB) se carga vía dynamic
// import() en idle (fuera del critical path, mismo patrón que las integraciones
// diferidas de Sentry en main.jsx). Al inicializar expone `window.posthog`, así el
// `trackEvent` de analytics.js —que ya llama window.posthog.capture— enruta solo.
// [P1-LANDING-OBS-PAPER · 2026-08-14] `autocapture` deja de decidirse aquí: en el
// apex significaba capturar cada click y cada campo de un visitante SIN CUENTA
// que sólo está leyendo marketing. La política vive en `observabilityScope.js`,
// que lo conserva encendido dentro de la app y preserva `capture_pageview` /
// `capture_pageleave` en ambos hosts — el embudo de POSTHOG-ANALYTICS nace en la
// portada y sin sus pageviews se queda sin primer escalón.
import { isAnalyticsOptedOut } from './analytics';
import { posthogCaptureOptions } from './observabilityScope';

let _initialized = false;

export async function initPostHog() {
    if (_initialized) return;
    if (typeof window === 'undefined') return;
    const key = import.meta.env.VITE_POSTHOG_KEY;
    if (!key) return;                    // gated OFF sin key → no-op total
    if (isAnalyticsOptedOut()) return;   // respeta el opt-out del usuario
    try {
        const { default: posthog } = await import('posthog-js');
        posthog.init(key, {
            api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
            ...posthogCaptureOptions(),
            // Solo crea "person profile" tras identify (usuario logueado): ahorra
            // cuota y evita perfiles de visitantes anónimos. Los pageviews anónimos
            // IGUAL cuentan para usuarios activos (distinct_id anónimo).
            person_profiles: 'identified_only',
            persistence: 'localStorage+cookie',
        });
        window.posthog = posthog;
        _initialized = true;
    } catch (e) {
        // Analítica best-effort: jamás romper la app por PostHog.
        console.error('[PostHog] init falló', e);
    }
}

// Asocia los eventos siguientes a un usuario concreto (post-login). id-only por
// privacidad (sin email/PII en el tercero); el owner correlaciona por user_id.
export function identifyPostHog(userId, props) {
    try {
        if (typeof window !== 'undefined' && window.posthog && userId) {
            window.posthog.identify(String(userId), props || {});
        }
    } catch { /* noop */ }
}

// Desasocia (logout): los eventos siguientes vuelven a ser anónimos.
export function resetPostHog() {
    try {
        if (typeof window !== 'undefined') window.posthog?.reset?.();
    } catch { /* noop */ }
}
