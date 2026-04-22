export const trackEvent = (eventName, data = {}) => {
    // Console log para debugging local
    if (process.env.NODE_ENV !== 'production') {
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
