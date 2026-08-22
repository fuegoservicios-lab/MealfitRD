// [P1-APEX-ENTRY-DIET · 2026-08-14] El único sitio del árbol que importa `init`
// de Sentry, y existe para que ese import sea DINÁMICO sin perder tree-shaking.
//
// POR QUÉ UN MÓDULO Y NO UN `import('@sentry/react')` EN main.jsx. Un import
// dinámico de un paquete devuelve su NAMESPACE completo, y Rollup no puede
// sacudir lo que no se usa de un namespace: el chunk resultante traería también
// `replayIntegration`, `feedbackIntegration` y `replay-canvas` — 357.767 B /
// ~118 kB gz medidos el 2026-08-14. En el apex eso desharía P1-LANDING-OBS-PAPER,
// que acababa de sacarlos de ahí.
//
// Con un módulo intermedio, `main.jsx` hace `import('./utils/sentryBoot')` y AQUÍ
// dentro el import es estático y NOMBRADO. Rollup sí sacude un import nombrado,
// así que el chunk lleva el cierre de `init` y nada más. Es la misma lección de
// P2-SENTRY-TREESHAKE (2026-05-23), que ya había cambiado un `import * as Sentry`
// por imports nombrados por este mismo motivo — sólo que ahora aplicada a la
// frontera dinámica.
//
// Guard: src/__tests__/Observability.p1_apex_entry_diet.test.js
// ⚠️ NOMBRADOS, nunca `import * as`. Un star-import reintroduce el namespace
// entero dentro de ESTE chunk y anula justo el tree-shaking que el módulo existe
// para conservar — es literalmente el bug que cerró P2-SENTRY-TREESHAKE.
import { init, captureException, addBreadcrumb, setTag } from '@sentry/react';

/**
 * Inicializa Sentry y devuelve la superficie que la fachada necesita.
 *
 * Devuelve `captureException`/`addBreadcrumb` en vez de que la fachada los
 * importe: así `utils/observability.js` —que SÍ es eager, lo importan los error
 * boundaries y `analytics.js`— no tiene una sola arista hacia `@sentry/*`. Esa
 * es la propiedad que hace que el entry adelgace; si alguien la rompe, los
 * 427.010 B vuelven al critical path sin que ningún test de comportamiento falle.
 *
 * @param {object} config Opciones de `Sentry.init`, compuestas en main.jsx.
 * @returns {Promise<{captureException: Function, addBreadcrumb: Function, setTag: Function}>}
 */
export async function arrancarSentry(config) {
    init(config);
    return { captureException, addBreadcrumb, setTag };
}
