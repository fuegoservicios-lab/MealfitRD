// [P1-PLAN-LOTE-847 · 2026-09-29] La configuración de PostHog, fuera del arranque. Con el permiso previo casi nadie la
// necesita al abrir la app (PostHog arranca cuando llega el permiso), y el objeto viajaba en el entry de todos. Llega
// con el SDK, en el mismo import perezoso de `posthogClient.js`, que es quien llama a `init` (lote842.eventos.test.js).
// La historia de cada opción sigue en la cabecera de `posthogClient.js`; ancla: src/__tests__/lote794.test.js.
import posthog from 'posthog-js';
import { posthogCaptureOptions } from './observabilityScope';

export { posthog };

/** Opciones de `posthog.init`. `before_send` es el corte del permiso, evento a evento (posthogClient.js). */
export const configPostHog = (before_send) => ({
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
    // Encuestas, tours de producto y conversaciones escriben su propio `localStorage`
    // fuera de la persistencia; se encienden desde el panel de PostHog, no desde aquí.
    // [P1-PLAN-LOTE-794 · ronda 1] Conversaciones faltaba: su carga no se bloquea en
    // modo `always` (posthog-conversations.js).
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    // [P1-PLAN-LOTE-794 · ronda 2] Sin /flags (ni remote config). `before_send` sólo ve
    // EVENTOS, y /flags no lo es: con la analítica apagada, el `reset(true)` de apagar
    // en caliente y el refresco de cada 5 min (remote-config.js) seguían mandando a
    // PostHog la URL, el referrer y —si se apagó desde otra pestaña— el `distinct_id`
    // de la cuenta. La app no usa feature flags (su única llamada al SDK es `capture`).
    // Lo que se pierde: los ajustes que el panel de PostHog empuja por remote config
    // (heatmaps, web vitals, dead clicks); el autocapture sigue, decidido aquí.
    advanced_disable_flags: true,
    before_send,
});
