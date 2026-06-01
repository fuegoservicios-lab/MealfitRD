// [P3-SENTRY-BREADCRUMB-DEAD · 2026-05-30] Import nombrado de Sentry para el
// breadcrumb de abajo. Pre-fix el código gateaba en `window.Sentry`, que NUNCA
// se asigna (main.jsx usa imports nombrados de @sentry/react) → breadcrumb
// muerto → el trail de acciones del usuario no llegaba a los reportes de error.
// `addBreadcrumb` es no-op si Sentry no está inicializado (seguro sin guard).
import { addBreadcrumb } from '@sentry/react';

// [P0-FRONTEND-ANALYTICS · 2026-05-12] `process.env.NODE_ENV` rompe en runtime
// browser: Vite NO inyecta `process` en el bundle del cliente, así que cada
// llamada a `trackEvent()` lanzaba `ReferenceError: process is not defined`
// en producción → toda la analítica (Sentry breadcrumbs / PostHog / GA / GTM)
// caía silenciosa y `GlobalErrorBoundary` capturaba el error ofuscando los
// reales. Vite expone `import.meta.env.MODE` (string: 'development' /
// 'production' / 'test') con la misma semántica. Anchor: P0-FRONTEND-ANALYTICS.
export const trackEvent = (eventName, data = {}) => {
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
