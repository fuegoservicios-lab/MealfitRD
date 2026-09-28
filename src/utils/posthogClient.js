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
//
// [P1-PLAN-LOTE-794 · 2026-09-28] (G28) SIN COOKIES Y SIN BANNER — decisión del dueño.
// En España la analítica que guarda un identificador en el dispositivo exige
// consentimiento PREVIO (banner). La salida elegida es no guardar nada:
// `cookieless_mode: 'always'` — ni cookie, ni `localStorage`, ni `sessionStorage`; la
// identidad del visitante la calcula PostHog en su servidor. Leyendo posthog-js 1.399.2
// (`lib/src/posthog-core.js`) ese modo cambia TRES cosas de las que dependía este código:
//   1. `opt_out_capturing()` / `opt_in_capturing()` pasan a ser NO-OP (avisan y salen).
//      El interruptor de Configuración quedaría muerto → el corte vive en `before_send`,
//      que consulta la bandera en CADA evento (también los internos del SDK: pageview,
//      pageleave, autocapture, que no pasan por `trackEvent`).
//   2. Nada persiste entre cargas: `identify()` hay que repetirlo en CADA carga. Y la
//      sesión se conoce casi siempre ANTES de que este import diferido termine, así que
//      la identidad se guarda aquí y se aplica al inicializar (`_usuario`).
//   3. La persistencia deshabilitada BORRA al arrancar la entrada de su almacén. Por eso
//      `persistence` sigue en 'localStorage+cookie' aunque no se use: es el almacén donde
//      los visitantes de antes tienen el identificador, y así se les limpia la cookie y
//      el `localStorage`. Con 'memory' esa cookie viviría un año más.
// ⚠️ PostHog IGNORA los eventos cookieless si el proyecto no tiene activado el modo sin
// cookies en sus ajustes (lo dice su propia documentación del tipo `cookieless_mode`).
// Ancla: src/__tests__/lote794.test.js (con el SDK real, no con un mock de `init`).
import { isAnalyticsOptedOut } from './analytics';
import { posthogCaptureOptions } from './observabilityScope';

let _initialized = false;

// [P1-PLAN-LOTE-794] La identidad de ESTA carga. En memoria y en ningún otro sitio: es
// justo lo que el modo sin cookies no deja guardar en el dispositivo.
let _usuario = null;

const _aplicarIdentidad = () => {
    try {
        if (typeof window !== 'undefined' && window.posthog && _usuario) {
            window.posthog.identify(_usuario.id, _usuario.props);
        }
    } catch { /* noop */ }
};

// [P1-PLAN-LOTE-794] El corte del opt-out, evento a evento. Devolver null descarta.
const _descartarSiOptOut = (evento) => (isAnalyticsOptedOut() ? null : evento);

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
            // [P1-PLAN-LOTE-794] Sin cookies ni almacenamiento (ver cabecera, punto 3,
            // para por qué `persistence` no es 'memory').
            cookieless_mode: 'always',
            disable_persistence: true,
            persistence: 'localStorage+cookie',
            // Encuestas y tours de producto escriben su propio `localStorage` fuera de la
            // persistencia; se encienden desde el panel de PostHog, no desde aquí.
            disable_surveys: true,
            disable_product_tours: true,
            before_send: _descartarSiOptOut,
        });
        window.posthog = posthog;
        _initialized = true;
        _aplicarIdentidad();
    } catch (e) {
        // Analítica best-effort: jamás romper la app por PostHog.
        console.error('[PostHog] init falló', e);
    }
}

// Asocia los eventos siguientes a un usuario concreto (post-login). id-only por
// privacidad (sin email/PII en el tercero); el owner correlaciona por user_id.
// [P1-PLAN-LOTE-794] Se llama en CADA carga con sesión (AssessmentContext →
// handleAuthChange); si el SDK aún no llegó, se aplica al inicializar.
export function identifyPostHog(userId, props) {
    if (!userId) return;
    _usuario = { id: String(userId), props: props || {} };
    _aplicarIdentidad();
}

// Desasocia (logout): los eventos siguientes vuelven a ser anónimos.
// [P1-PLAN-LOTE-794] Sin persistencia no hay nada que soltar si en esta carga no se
// identificó a nadie: el `reset` sólo corre cuando había un usuario.
export function resetPostHog() {
    const habiaUsuario = _usuario !== null;
    _usuario = null;
    if (!habiaUsuario) return;
    try {
        if (typeof window !== 'undefined') window.posthog?.reset?.();
    } catch { /* noop */ }
}
