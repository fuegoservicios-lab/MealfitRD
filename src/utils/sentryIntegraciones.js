// [P1-PLAN-LOTE-847 · 2026-09-29] Las integraciones diferidas de Sentry: el tracing, y el replay SOLO con el permiso de
// analítica (App Review 5.1.1(ii), RGPD).
//
// Antes `main.jsx` adjuntaba `replayIntegration()` en el idle a todo el que abría la app —en nativo también—, sin
// mirar el opt-out al arrancar: apagar «Ayuda a mejorar» lo paraba en esa sesión y al reabrir volvía a grabar. Ahora
// el replay se enciende cuando `analiticaPermitida()` pasa a `true` (utils/analytics.js avisa a main.jsx), y retirar
// el permiso lo para `detenerReplaySentry()` por la fachada. Los ERRORES no dependen de nada de esto.
//
// Módulo perezoso con imports NOMBRADOS (la lección de sentryBoot.js): antes era un `import('@sentry/react')` suelto en
// main.jsx, y el andamiaje de cada import dinámico viaja en el arranque; así hay uno solo y más pequeño.
import { addIntegration, browserTracingIntegration, getClient, getReplay, replayIntegration } from '@sentry/react';
import { analiticaPermitida } from './analytics';

/** El tracing, en el idle y con o sin permiso (rendimiento, no seguimiento de la persona). */
export function adjuntarTracingSentry() {
    addIntegration(browserTracingIntegration());
}

/**
 * Enciende el replay si hay permiso. La primera vez lo adjunta (sus tasas salen de `Sentry.init`). Si ya estaba
 * adjunto y se paró al retirar el permiso, lo reanuda con esas mismas tasas: `start()` a secas grabaría el 100 % de
 * las sesiones. Devuelve si quedó encendido.
 */
export function encenderReplaySentry() {
    // Se vuelve a mirar AQUÍ: el permiso pudo retirarse mientras este trozo viajaba por la red.
    if (!analiticaPermitida()) return false;
    const replay = getReplay();
    if (!replay) {
        addIntegration(replayIntegration({ maskAllText: true, blockAllMedia: true }));
        return true;
    }
    const opciones = getClient()?.getOptions?.() || {};
    if (Math.random() < (opciones.replaysSessionSampleRate || 0)) replay.start();
    else if ((opciones.replaysOnErrorSampleRate || 0) > 0) replay.startBuffering();
    return true;
}
