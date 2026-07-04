// [P3-SENTRY-BREADCRUMB-DEAD · 2026-05-30] Import nombrado de Sentry para el
// breadcrumb de abajo. Pre-fix el código gateaba en `window.Sentry`, que NUNCA
// se asigna (main.jsx usa imports nombrados de @sentry/react) → breadcrumb
// muerto → el trail de acciones del usuario no llegaba a los reportes de error.
// `addBreadcrumb` es no-op si Sentry no está inicializado (seguro sin guard).
import { addBreadcrumb } from '@sentry/react';
import { safeLocalStorageGet } from './safeLocalStorage';

// [P2-PRIVACY-SETTINGS · 2026-07-04] Opt-out de analytics (Configuración →
// Privacidad → toggle "Ayuda a mejorar MealfitRD"). Flag por dispositivo:
// '1' = no emitir NINGÚN evento de uso (Sentry breadcrumbs, PostHog, GA, GTM).
// Los errores (Sentry captureException) NO se gatean — son operacionales,
// no analítica de producto.
export const ANALYTICS_OPT_OUT_KEY = 'mealfit_analytics_opt_out';
export const isAnalyticsOptedOut = () =>
    safeLocalStorageGet(ANALYTICS_OPT_OUT_KEY, null) === '1';

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

    // Google Analytics (gtag)
    if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', eventName, data);
    }

    // GTM (dataLayer)
    if (typeof window !== 'undefined' && window.dataLayer) {
        window.dataLayer.push({ event: eventName, ...data });
    }
};
