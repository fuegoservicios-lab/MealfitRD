// [P1-LANDING-OBS-PAPER · 2026-08-14] Qué observabilidad corre según DÓNDE está
// el visitante. Un solo sitio, y puro, para que se pueda testear sin arrancar la
// app entera: una decisión de privacidad que sólo se verifica a ojo no se
// verifica.
//
// POR QUÉ EXISTE. El apex (bioboros.com) es marketing y nada más: no hay sesión
// —`AssessmentContext` corta en seco con `isApexHost()` (P3-APEX-NO-SESSION)— ni
// hay app, porque cualquier ruta de producto se redirige a app.* (P3-APP-
// SUBDOMAIN-ROUTING). Aun así el visitante anónimo de la portada cargaba la
// observabilidad completa del producto:
//
//   · El `await import('@sentry/react')` de `_attachSentryIntegrations` trae el
//     namespace ENTERO (browserTracing + replay + feedback + replay-canvas):
//     357.767 B / ~118 kB gzip medidos el 2026-08-14, y encima adjuntaba
//     `replayIntegration()` para grabar la sesión de alguien que está leyendo
//     una página estática.
//   · PostHog con `autocapture: true`, o sea cada click y cada campo de una
//     página pública, sobre alguien que no tiene cuenta.
//
// ⚠️ LA TRAMPA DE ESTE ARREGLO. Poner `VITE_SENTRY_REPLAYS_SESSION_RATE=0` NO
// ahorra un solo byte. El knob existe (P2-AUDIT-5) y regula la INGESTA, pero
// `_attachSentryIntegrations` llamaba `replayIntegration()` incondicionalmente,
// así que el chunk se descargaba igual y sólo dejaba de grabar. Los bytes se van
// únicamente si no se hace el import — por eso la decisión vive aquí, antes de
// llamarlo, y no en un sample rate.
//
// LO QUE NO HACE: apagar PostHog en el apex. El embudo que POSTHOG-ANALYTICS
// declara (visita → registro → plan → pago) NACE en la portada; sin sus
// pageviews se queda sin primer escalón. Se conservan `capture_pageview` y
// `capture_pageleave`, y se retira sólo el autocapture.
//
// Guard: src/__tests__/ObservabilityScope.p1_landing_obs_paper.test.js
import { isApexHost } from '../config/site';

/**
 * ¿Esta visita es la landing de marketing?
 *
 * El corte es por HOST y no por ruta a propósito. La superficie papel
 * (`paperSurface.js`) incluye rutas como `/precios`, que existen TAMBIÉN en
 * app.bioboros.com, donde sí hay un usuario con sesión al que un replay sirve
 * para depurar su checkout. Cortar por ruta apagaría el replay a ese usuario, y
 * además dejaría el alcance dependiendo de una navegación SPA posterior. El host
 * no cambia a mitad de sesión; la ruta sí.
 */
export const isMarketingVisit = (hostname) => isApexHost(hostname);

/** El replay y el tracing de Sentry sólo dentro de la app. */
export const shouldAttachSentryReplay = (hostname) => !isMarketingVisit(hostname);

/** Opciones de captura de PostHog según el alcance de la visita. */
export const posthogCaptureOptions = (hostname) => ({
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: !isMarketingVisit(hostname),
});
