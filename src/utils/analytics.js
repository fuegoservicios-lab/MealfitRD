// [P3-SENTRY-BREADCRUMB-DEAD · 2026-05-30] Import nombrado de Sentry para el
// breadcrumb de abajo. Pre-fix el código gateaba en `window.Sentry`, que NUNCA
// se asigna (main.jsx usa imports nombrados de @sentry/react) → breadcrumb
// muerto → el trail de acciones del usuario no llegaba a los reportes de error.
// `addBreadcrumb` es no-op si Sentry no está inicializado (seguro sin guard).
// [P1-APEX-ENTRY-DIET · 2026-08-14] Ahora vía la fachada. `analytics.js` lo
// importa media app —incluido el chrome eager—, así que era una de las cuatro
// puertas por las que `@sentry/*` entraba al entry síncrono. Con la fachada el
// breadcrumb se ENCOLA si el SDK aún no arrancó, en vez de perderse: mejor que
// el no-op que este comentario daba por bueno.
import { addBreadcrumb } from './observability';
import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';
import { SITE_DOMAIN, isSiteHost } from '../config/site';

// [P2-PRIVACY-SETTINGS · 2026-07-04] Opt-out de analytics (Configuración →
// Privacidad → toggle "Ayuda a mejorar Bioboros"). Flag por dispositivo:
// '1' = no emitir NINGÚN evento de uso (Sentry breadcrumbs, PostHog, GA, GTM).
// Los errores (Sentry captureException) NO se gatean — son operacionales,
// no analítica de producto.
export const ANALYTICS_OPT_OUT_KEY = 'mealfit_analytics_opt_out';

// [P1-LANDING-OBS-PAPER · 2026-08-14] El opt-out necesitaba un segundo soporte.
//
// EL BUG: `localStorage` es POR ORIGEN. El interruptor vive en Configuración,
// que sólo existe en app.bioboros.com; el landing vive en el apex. Así que un
// usuario que YA había desactivado la analítica seguía siendo rastreado en cada
// visita a la portada, porque el apex no puede leer el `localStorage` del
// subdominio. No era una política incompleta: era una decisión que el usuario ya
// había tomado y que el código no cumplía.
//
// Una cookie sobre `.bioboros.com` la ven AMBOS hosts. Se conserva la escritura
// en localStorage porque es la que ya existía y la que sobrevive a un borrado de
// cookies; se leen las dos, y basta con que una diga que no.
export const ANALYTICS_OPT_OUT_COOKIE = 'mf_analytics_opt_out';

// El atributo `domain` sólo se añade cuando el host es realmente nuestro. En
// localhost (dev y jsdom) un `domain=.bioboros.com` haría que el navegador
// DESCARTE la cookie en silencio — el modo de fallo clásico de «lo implementé y
// no hace nada».
const _cookieDomainAttr = () => {
    try {
        return isSiteHost(window.location.hostname) ? `; domain=.${SITE_DOMAIN}` : '';
    } catch {
        return '';
    }
};

const _cookieSaysOptedOut = () => {
    try {
        return document.cookie
            .split(';')
            .some((trozo) => trozo.trim() === `${ANALYTICS_OPT_OUT_COOKIE}=1`);
    } catch {
        return false;
    }
};

const _localStorageSaysOptedOut = () => {
    try {
        return safeLocalStorageGet(ANALYTICS_OPT_OUT_KEY, null) === '1';
    } catch {
        // Safari privado / ITP / algunos webviews lanzan al LEER. Que reviente
        // aquí dejaría la cookie sin consultar, que es justo el caso que este
        // segundo soporte existe para cubrir.
        return false;
    }
};

export const isAnalyticsOptedOut = () =>
    _localStorageSaysOptedOut() || _cookieSaysOptedOut();

/**
 * SSOT de la escritura del opt-out: deja los dos soportes coherentes.
 *
 * Existe como función y no como dos líneas en Configuración porque el fallo que
 * cierra es precisamente el de escribir en un solo sitio. Si mañana aparece un
 * tercer soporte, el sitio donde añadirlo es éste.
 */
export const persistAnalyticsOptOut = (optedOut) => {
    safeLocalStorageSet(ANALYTICS_OPT_OUT_KEY, optedOut ? '1' : '0');
    try {
        const base = `${ANALYTICS_OPT_OUT_COOKIE}=1; path=/${_cookieDomainAttr()}; SameSite=Lax`;
        document.cookie = optedOut
            // 1 año: es una preferencia, no una sesión.
            ? `${base}; Max-Age=${365 * 24 * 60 * 60}`
            : `${base}; Max-Age=0`;
    } catch {
        // Sin cookies el opt-out sigue vivo en localStorage para ESTE origen.
    }
};

// [P0-FRONTEND-ANALYTICS · 2026-05-12] `process.env.NODE_ENV` rompe en runtime
// browser: Vite NO inyecta `process` en el bundle del cliente, así que cada
// llamada a `trackEvent()` lanzaba `ReferenceError: process is not defined`
// en producción → toda la analítica (Sentry breadcrumbs / PostHog / GA / GTM)
// caía silenciosa y `GlobalErrorBoundary` capturaba el error ofuscando los
// reales. Vite expone `import.meta.env.MODE` (string: 'development' /
// 'production' / 'test') con la misma semántica. Anchor: P0-FRONTEND-ANALYTICS.
export const trackEvent = (eventName, data = {}) => {
    // [P2-PRIVACY-SETTINGS · 2026-07-04] Respeta el opt-out del usuario.
    if (isAnalyticsOptedOut()) return;

    // Console log para debugging local
    if (import.meta.env.MODE !== 'production') {
        console.log(`[Analytics] ${eventName}`, data);
    }

    // Sentry Breadcrumbs (ver nota del import arriba — P3-SENTRY-BREADCRUMB-DEAD)
    try {
        addBreadcrumb({
            category: 'analytics',
            message: eventName,
            level: 'info',
            data: data
        });
    } catch { /* Sentry no inicializado — no-op */ }

    // PostHog
    if (typeof window !== 'undefined' && window.posthog) {
        window.posthog.capture(eventName, data);
    }

    // [P2-DEAD-GTAG · 2026-08-15] Aquí había una rama `if (window.gtag)`. Nunca
    // pudo ejecutarse: no hay Google Analytics ni GTM en el proyecto — cero
    // `googletagmanager`, cero `gtag.js`, cero `dataLayer` en `src/` y en
    // `index.html`. `window.gtag` no se asigna jamás, así que la condición era
    // constantemente falsa.
    //
    // No era inofensiva: es la razón por la que la CSP llevaba
    // `https://www.googletagmanager.com` y `https://www.google-analytics.com` en
    // `script-src` y `connect-src`. Un permiso de CSP que no sirve a nadie sigue
    // siendo una puerta abierta, y esta estaba abierta para respaldar código
    // muerto. Los dos orígenes salen del allowlist en el mismo pase (P2-CSP-*).

    // GTM (dataLayer)
    if (typeof window !== 'undefined' && window.dataLayer) {
        window.dataLayer.push({ event: eventName, ...data });
    }
};
