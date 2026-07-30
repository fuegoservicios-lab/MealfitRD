/**
 * [P1-SWAP-PANTRY-GATE · 2026-07-30] Umbrales de Nevera y gate de los botones
 * de regeneración. Lógica PURA (sin React, sin fetch) para que sea testeable de
 * verdad.
 *
 * Por qué vive fuera de `Dashboard.jsx`: ese archivo pasa de 8.700 líneas y sus
 * tests son parser-based (importarlo arrastra un árbol de dependencias enorme).
 * Un test parser-based **no ejecuta nada** — verifica que un texto está escrito,
 * no que la función haga lo correcto, y el fail-open de aquí abajo es justo la
 * clase de regla que un `toContain` no puede proteger. Mismo patrón y misma
 * razón que `utils/planWindow.js` (P3-DASH-WINDOW-TEST).
 *
 * Estas constantes NO son knobs operacionales: viven en el bundle del cliente,
 * así que ni siquiera un `VITE_*` las haría cambiables sin rebuild. Se dejan
 * como constantes explícitas para no prometer una palanca que no existe.
 */

/**
 * Mínimo de alimentos en la Nevera para "Actualizar platos" (día COMPLETO).
 *
 * [P3-UPDATE-PLATOS-REQUIRES-PANTRY · 2026-05-17] nació en 3. [P1-SWAP-PANTRY-GATE
 * · 2026-07-30] sube a 10: regenerar un día son 4 platos que además reservan
 * inventario entre sí (`pantry_override`, P2-REGEN-DAY-PANTRY-OVERRIDE), y 4
 * platos desde 3 ingredientes no es un día. 10 es el mismo valor que el backend
 * ya usa como "nevera real" (`PANTRY_GUARD_MIN_ITEMS`).
 *
 * ⚠️ Cambio de comportamiento declarado: quien tenga entre 3 y 9 ítems pierde el
 * botón que antes tenía. Es intencional.
 */
export const PANTRY_MIN_ITEMS_FOR_UPDATE = 10;

/**
 * Mínimo para "Cambiar Plato" (swap INDIVIDUAL).
 *
 * Un plato necesita proteína + carbohidrato + 1-2 vegetales + grasa (≈4-5
 * ítems), más holgura para que el plato nuevo salga DISTINTO del que se rechaza.
 *
 * Por qué no 30 (propuesta inicial del owner, medida antes de descartarla):
 * bloquearía al 100% de los usuarios actuales; el catálogo maestro entero son
 * 204 alimentos, así que 30 exige ~15% de todo lo que el sistema conoce para
 * cambiar UN plato; y el backend ya trata 5/10/12 como "nevera con la que se
 * puede trabajar" — un gate de UI en 30 contradiría a los tres. No hay
 * distribución real contra la que calibrar (los usuarios en DB son un seed con
 * la misma lista de 10 ítems), así que se elige el valor defendible, no el
 * agresivo.
 *
 * El conteo bruto es la métrica imperfecta (30 frascos de especias no cocinan
 * nada; 8 ítems que cubran los 4 grupos sí). La regla por composición queda
 * pendiente: hoy `user_inventory.category` y `master_ingredient_id` están vacíos
 * en TODAS las filas, así que exigiría matching difuso por nombre contra
 * `master_ingredients` — el mismo que en este repo ya produjo incidentes de
 * subcadena repetidos.
 */
export const PANTRY_MIN_ITEMS_FOR_SWAP = 6;

/**
 * Motivos de swap que consumen la Nevera como fuente EXCLUSIVA de ingredientes.
 * Solo estos se bloquean cuando la nevera está por debajo del mínimo.
 *
 * [P3-SWAP-PANTRY-DEFAULT · 2026-05-22] fijó strict-pantry como default para
 * TODOS los motivos excepto `cravings` y `weekend`, que existen precisamente
 * para salirse de la nevera. `dislike` tampoco entra: no genera nada, registra
 * una preferencia ("la IA evitará sugerirlo"), y esa señal sigue siendo válida
 * — y valiosa — con la nevera vacía.
 *
 * Bloquear el botón ENTERO en vez de por motivo revertiría en silencio esa
 * decisión de producto. Es el error que este array existe para hacer imposible.
 */
export const SWAP_REASONS_REQUIRING_PANTRY = ['variety', 'time', 'similar'];

/**
 * ¿Hay que bloquear por Nevera insuficiente?
 *
 * FAIL-OPEN: solo bloquea cuando SABEMOS que hay menos del mínimo. Si el
 * inventario no cargó todavía o el fetch falló (`null`/`undefined`), no bloquea
 * — un fallo de red no puede leerse como "tu nevera está vacía" y quitarle el
 * botón a alguien que sí tiene comida. Misma semántica que el gate del día
 * (P3-UPDATE-PLATOS-REQUIRES-PANTRY) y que P3-PLAN-BTN-STABLE.
 *
 * La resolución es por `typeof === 'number'`, NUNCA por truthiness: `0` es una
 * nevera vacía —el caso original del bug— y además es falsy, así que un
 * `if (!count)` lo confundiría con "no cargado" y haría fail-open justo en el
 * escenario que este gate existe para cerrar.
 *
 * @param {number|null|undefined} pantryItemCount filas con quantity > 0
 * @param {number} minItems umbral aplicable
 * @returns {boolean} true = bloquear
 */
export function computePantryGate(pantryItemCount, minItems) {
    if (typeof pantryItemCount !== 'number' || Number.isNaN(pantryItemCount)) return false;
    return pantryItemCount < minItems;
}
