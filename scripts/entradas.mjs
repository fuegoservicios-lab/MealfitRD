// [P3-I18N-ENTRADAS-DUPLICADAS · 2026-08-22] Las entradas del grafo de módulos, UNA vez.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO ES UN FICHERO Y NO DOS CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════
//
// `huerfanos.mjs` y `i18n-alcance.mjs` recorren el MISMO grafo desde las MISMAS raíces, y
// cada uno tenía su propia copia de la lista. Es el patrón que este repo ya pagó caro con
// `P1-DIET-CANON-SSOT` —tres tablas de dieta que drifearon y a una se le olvidó
// `'vegetariana'`, así que el sistema servía Pollo a vegetarianas— y con
// `constants.canonicalize_country`.
//
// LO QUE HACE ESTE CASO PEOR QUE UN DRIFT NORMAL: las dos copias fallan DISTINTO.
//
//   · Si a `huerfanos.mjs` le falta una entrada, todo lo que cuelga de ella aparece como
//     huérfano y el script grita: una lista de ficheros «sin usar» que sí se usan. Molesto,
//     pero imposible de ignorar.
//
//   · Si le falta a `i18n-alcance.mjs`, el alcance COLAPSA en silencio. Los ficheros que
//     colgaban de esa entrada dejan de estar «dentro», así que sus cadenas sin traducir
//     dejan de contarse y el trinquete BAJA. Un número que mejora solo es la última cosa
//     que alguien va a investigar — y desde `P2-I18N-ESCANER-RECALL` ese trinquete está en
//     cero, o sea que el margen para que una bajada pase por buena es máximo.
//
// Añadir una entrada nueva (un worker, un segundo `main`) es tocar este fichero y ya.

/**
 * Raíces del grafo de módulos de `src/`, relativas a `src/`.
 *
 * `main.jsx` es la entrada de la app. `custom-sw.js` NO cuelga de ella: lo compila Vite
 * como service worker aparte, así que sin declararlo aquí su subárbol entero queda fuera
 * del alcance —y es donde vive el copy de las notificaciones push.
 */
export const ENTRADAS = ['main.jsx', 'custom-sw.js'];
