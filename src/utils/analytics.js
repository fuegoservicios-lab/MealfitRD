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

    // Sentry Breadcrumbs
    if (typeof window !== 'undefined' && window.Sentry) {
        window.Sentry.addBreadcrumb({
            category: 'analytics',
            message: eventName,
            level: 'info',
            data: data
        });
    }

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
