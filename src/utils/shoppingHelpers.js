// ============================================================
// [P0-2] Parser robusto de `market_qty` para items del shopping list.
// ------------------------------------------------------------
// El backend (`apply_smart_market_units` en `shopping_calculator.py`) puede
// asignar a `market_qty` un string fraccional ("1 1/2", "3/4", "1/2") cuando
// el bloque de pesos dominicanos (BLOQUE 3) o el bloque de unidades híbridas
// (BLOQUE 2 con `is_native_weighable`) producen fracciones de libra.
//
// El consumer original hacía `parseFloat(item.market_qty)`, que en JS:
//   parseFloat("1 1/2") → 1   (pierde la fracción)
//   parseFloat("1/2")   → 0   (cae a "Al gusto" por <=0)
//   parseFloat("3/4")   → 3   (catastrófico — multiplica el delta por ~4)
//
// Resultado: el delta lista↔nevera quedaba subdimensionado y el usuario
// compraba MENOS de lo necesario (riesgo: faltante de comida con plan ya
// pagado), o el item desaparecía completamente.
//
// FIX (P0-2): el backend ahora expone también `market_qty_numeric: float`
// con el valor real post-MARKET_MINIMUMS. Este helper:
//   1. Prefiere `market_qty_numeric` cuando está presente (planes nuevos).
//   2. Si solo hay `market_qty` legacy (planes pre-fix persistidos), parsea
//      fracciones tipo "a", "a/b", "a b/c" antes de degradar a 0.
//   3. Acepta `null`/`undefined`/objetos no-numéricos sin lanzar.
//
// Es la versión espejo del `_parse_market_qty` interno del backend, para
// que la deducción de inventario tenga semántica idéntica en ambos lados.
// ============================================================

/**
 * Convierte `market_qty` (numérico o fraccional como string) a float.
 * Equivalente al `_parse_market_qty` interno de `apply_smart_market_units`.
 * @param {number|string|null|undefined} mq
 * @returns {number} 0 si no se puede parsear (NUNCA NaN ni Infinity).
 */
export const parseMarketQty = (mq) => {
    if (mq === null || mq === undefined) return 0;
    if (typeof mq === 'number') {
        return Number.isFinite(mq) ? mq : 0;
    }
    if (typeof mq !== 'string') {
        const n = Number(mq);
        return Number.isFinite(n) ? n : 0;
    }
    const trimmed = mq.trim();
    if (!trimmed) return 0;
    if (trimmed.includes('/')) {
        const parts = trimmed.split(/\s+/);
        try {
            if (parts.length === 2 && parts[1].includes('/')) {
                const [n, d] = parts[1].split('/');
                const whole = parseFloat(parts[0]);
                const num = parseFloat(n);
                const den = parseFloat(d);
                if (!Number.isFinite(whole) || !Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
                return whole + num / den;
            }
            if (parts.length === 1 && parts[0].includes('/')) {
                const [n, d] = parts[0].split('/');
                const num = parseFloat(n);
                const den = parseFloat(d);
                if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
                return num / den;
            }
        } catch {
            return 0;
        }
    }
    const f = parseFloat(trimmed);
    return Number.isFinite(f) ? f : 0;
};

/**
 * Selecciona el valor numérico autoritativo de un item de shopping list,
 * prefiriendo el `market_qty_numeric` poblado por el backend (P0-2) y
 * cayendo a un parseo robusto del `market_qty` legacy.
 * @param {{market_qty_numeric?: number, market_qty?: number|string, quantity?: number|string}} item
 * @returns {number}
 */
export const resolveShopQty = (item) => {
    if (!item || typeof item !== 'object') return 0;
    const numeric = item.market_qty_numeric;
    if (typeof numeric === 'number' && Number.isFinite(numeric)) return numeric;
    const parsed = parseMarketQty(item.market_qty);
    if (parsed > 0) return parsed;
    if (item.quantity !== undefined && item.quantity !== null) {
        const q = parseMarketQty(item.quantity);
        if (q > 0) return q;
    }
    return 0;
};

// ============================================================
// [P1-1] Helper de escape HTML para valores interpolados en el PDF de la
// lista de compras.
// ------------------------------------------------------------
// El generador de PDF del Dashboard construye un `htmlContent` template-
// literal y lo asigna a `element.innerHTML` antes de pasar a `html2pdf`.
// Los valores dinámicos vienen de tres fuentes NO-confiables:
//   1. LLM (Gemini): nombres de ingredientes, descripciones, categorías.
//   2. Usuario (formulario): `_pantry_supplement_required` (urgent_items),
//      `otherAllergies`, `otherDislikes`, etc.
//   3. Supabase: `ingredient_name` de `user_inventory` (el usuario los tipeó
//      al hacer Restock manual o el LLM los persistió).
//
// Antes del fix P1-1, las interpolaciones eran directas (`${cat}`,
// `${display}`, `${displayQty}`, `${item._inventoryNote}`). Un valor como
// `</li><img src=x onerror=...>` o cualquier markup desbalanceado:
//   - NO ejecuta JS (html2canvas serializa, no eval), pero
//   - Rompe la estructura del DOM del PDF (categorías/items duplicados,
//     listado truncado).
//   - El header/footer se desfasan.
//   - La descarga puede fallar o producir un PDF malformado.
//
// Este helper escapa los 5 metacaracteres HTML (`& < > " '`) — suficiente
// para neutralizar inyección dentro de cualquier contexto HTML de texto.
// `&` se escapa PRIMERO para no doble-escapar entidades introducidas por
// los reemplazos posteriores.
//
// Convenciones:
//   - Acepta `null`/`undefined`/non-string sin lanzar (retorna '' o
//     `String(value)` escapado).
//   - Mantiene caracteres Unicode (ej. "¼", "½", "🥩") intactos — no son
//     metacaracteres HTML y son legítimos en nombres dominicanos.
//   - Es una función pura para fácil testeo.
// ============================================================

/**
 * Escapa los 5 metacaracteres HTML para prevenir markup roto en el PDF.
 * @param {string|number|null|undefined} value
 * @returns {string} Texto seguro para interpolar dentro de innerHTML.
 */
export const escapeHtml = (value) => {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'string' ? value : String(value);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

export const getActiveShoppingList = (planData, duration) => {
    if (!planData || !duration) return null;
    const keyMap = {
        'weekly': 'aggregated_shopping_list_weekly',
        'biweekly': 'aggregated_shopping_list_biweekly',
        'monthly': 'aggregated_shopping_list_monthly'
    };
    const key = keyMap[duration];
    if (key && Array.isArray(planData[key]) && planData[key].length > 0) return planData[key];
    if (Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0) return planData.aggregated_shopping_list;
    return null;
};

export const calculateAllPlanIngredients = (planData, isPlanExpired, liveInventory) => {
    if (!planData || isPlanExpired) return [];

    const currentIngredientsMap = new Map();

    // 1. Agregar Inventario Físico (user_inventory) - Lo que ya tiene en casa
    if (liveInventory && Array.isArray(liveInventory) && liveInventory.length > 0) {
        liveInventory.forEach(item => {
            const qty = parseFloat(item.quantity) || 0;
            const unit = item.unit || 'unidad';
            const name = item.ingredient_name || item.master_ingredients?.name || 'Ingrediente';
            const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1).replace(/\.0$/, '');

            let displayQty = '';
            if (qty > 0) {
                if (unit === 'unidad') {
                    displayQty = qty === 1 ? '1 Ud.' : `${qtyStr} Uds.`;
                } else {
                    displayQty = `${qtyStr} ${unit}`;
                }
            }

            // id_string compatible con backend _parse_quantity
            const idString = unit === 'unidad'
                ? `${qtyStr} ${name}`
                : `${qtyStr} ${unit} de ${name}`;

            currentIngredientsMap.set(name.toLowerCase().trim(), {
                id_string: idString,
                quantity: displayQty,
                name: name
            });
        });
    }

    // 2. Agregar Lista de Compras (lo nuevo) - Debe sobreescribir para reflejar cantidades escaladas
    if (planData.aggregated_shopping_list && Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0) {
        planData.aggregated_shopping_list.forEach(ing => {
            if (typeof ing === 'object' && ing !== null) {
                const idString = ing.display_string || ing.name || String(ing);
                const qty = ing.display_qty || '';
                const name = ing.name || ing.display_name || ing.display_string || 'Ingrediente';

                // Siempre sobreescribimos para asegurar que el UI refleje el nuevo tamaño del hogar
                currentIngredientsMap.set(name.toLowerCase().trim(), {
                    id_string: idString,
                    quantity: qty,
                    name: name
                });
                
                return;
            }

            // Fallback directo sin Regex para strings legacy
            const str_ing = String(ing).trim();
            currentIngredientsMap.set(str_ing.toLowerCase(), {
                id_string: str_ing,
                quantity: 'Al gusto',
                name: str_ing
            });
        });
    } else {
        // 3. Fallback Legacy si no hay aggregated_shopping_list
        const planDaysToCheck = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
        planDaysToCheck.forEach(day => {
            day.meals.forEach(meal => {
                if (meal && meal.ingredients && Array.isArray(meal.ingredients)) {
                    meal.ingredients.forEach(ing => {
                        let qty = 'Al gusto';
                        let name = 'Desconocido';
                        let id_string = '';

                        if (typeof ing === 'object' && ing !== null) {
                            name = ing.name || ing.display_name || ing.display_string || String(ing);
                            qty = ing.display_qty || (ing.market_qty && ing.market_unit ? `${ing.market_qty} ${ing.market_unit}` : 'Al gusto');
                            id_string = ing.display_string || name;
                        } else {
                            name = String(ing).trim();
                            id_string = name;
                        }

                        if (name.length > 2 && !currentIngredientsMap.has(name.toLowerCase().trim())) {
                            currentIngredientsMap.set(name.toLowerCase().trim(), { id_string: id_string, quantity: qty, name: name });
                        }
                    });
                }
            });
        });
    }

    return Array.from(currentIngredientsMap.values()).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
};

// ============================================================
// [P1-PDF-1] Fetch de inventario fresco con timeout para el PDF
// ------------------------------------------------------------
// El generador de lista de compras del Dashboard necesita inventario LIVE
// (no `liveInventory` cacheado en estado) para calcular el delta antes de
// renderizar el PDF — sin esto, un restock previo cuyo response falló pero
// que sí persistió en BD genera una lista con items duplicados.
//
// Antes el código hacía un `await supabase.from('user_inventory').select(...)`
// envuelto en `try/catch` con fallback silencioso. Si Supabase tardaba o
// fallaba, `liveInventory` (potencialmente stale) se usaba para el delta sin
// señalización al usuario → items que ya están en la nevera reaparecían en el
// PDF → usuario compra duplicado.
//
// Este helper:
//   1. Carrera (`Promise.race`) entre el fetch y un timeout configurable
//      (default 2000ms — más allá de eso es mejor degradar a caché que dejar
//      al usuario esperando un PDF).
//   2. Devuelve `{ data, stale, reason }` con semántica explícita:
//      - `stale=false` → fetch retornó datos válidos.
//      - `stale=true` con `reason ∈ {timeout, error, empty_response}` → caller
//        debe usar `liveInventory` cacheado Y mostrar banner "lista basada
//        en datos en caché".
//   3. NUNCA lanza — todo fallo se traduce a `{stale: true, reason}` para
//      simplificar el call site (un solo path de éxito + un solo path de
//      degradación, sin try/catch redundante).
//
// `timeoutMs` puede subirse si el SLA del producto exige delta-fresh
// garantizado (e.g., 5000); bajarse si la latencia tail es prioridad.
// ============================================================

/**
 * @param {() => Promise<{data: any, error?: any}>} fetchFn — closure que dispara
 *   el query de Supabase. Se invoca dentro del race; si timeout gana, el query
 *   sigue corriendo en background pero su resultado se descarta.
 * @param {number} [timeoutMs=2000] — cap blando antes de degradar a caché.
 * @returns {Promise<{data: any[]|null, stale: boolean, reason: string|null}>}
 */
export const fetchFreshInventoryWithTimeout = async (fetchFn, timeoutMs = 2000) => {
    if (typeof fetchFn !== 'function') {
        return { data: null, stale: true, reason: 'invalid_fetch_fn' };
    }

    const TIMEOUT_SENTINEL = Symbol('timeout');
    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutMs);
    });

    try {
        const result = await Promise.race([fetchFn(), timeoutPromise]);
        clearTimeout(timeoutId);

        if (result === TIMEOUT_SENTINEL) {
            return { data: null, stale: true, reason: 'timeout' };
        }

        // Supabase responses: `{ data, error }`. Si error está poblado, se
        // trata como fallo de red/permiso → stale.
        if (result && result.error) {
            return { data: null, stale: true, reason: 'error' };
        }

        const data = result?.data;
        if (!Array.isArray(data)) {
            // null/undefined data sin error explícito (caso patológico de
            // Supabase con RLS denegando silenciosamente) → degradar a caché.
            return { data: null, stale: true, reason: 'empty_response' };
        }

        return { data, stale: false, reason: null };
    } catch {
        clearTimeout(timeoutId);
        return { data: null, stale: true, reason: 'error' };
    }
};

// ============================================================
// [P1-PDF-3] Decisión de densidad y layout para el PDF de la lista de compras
// ------------------------------------------------------------
// ANTES, `Dashboard.jsx` aplicaba la heurística inline:
//     const isUltraDense = totalItems >= 38;
//     const isDense = totalItems >= 26 || isUltraDense;
// Con `pagebreak: { mode: ['avoid-all'] }` html2pdf evita romper DENTRO de
// elementos pero ENTRE elementos sí permite saltos. Para listas mensuales
// con 60+ items + `_inventoryNote` + 3 columnas, el contenido podía:
//   1. Cortarse a media tarjeta de categoría (avoid-all evita esto a costa
//      de comprimir todo).
//   2. Empujar un footer fantasma a una segunda página por margen residual.
//   3. Renderizar items con font/padding ya inviables tras `isUltraDense`.
//
// AHORA esta función pura decide:
//   - `isDense` / `isUltraDense`: comportamiento existente preservado.
//   - `isHyperDense`: nuevo nivel para 60+ items (4 columnas, padding 1px,
//     font ~6.5px, oculta `_inventoryNote` para liberar verticales).
//   - `multiPage`: a partir de 80 items, deja que html2pdf paginee
//     formalmente (cambia el `pagebreak.mode` en el caller). Sin esto, el
//     contenido seguía el path "avoid-all + ultra-dense" y a veces se
//     desbordaba con tipografía no leible.
//   - `columnCount`: 3 hasta hyper-dense, 4 a partir de ahí.
//   - `showInventoryNotes`: false en hyper-dense (gana espacio vertical).
//   - `density`: tier discreto para telemetría/tests.
//
// Thresholds elegidos a partir del análisis del audit P1-PDF-3:
//   * 26 (isDense): comprimir padding sin reducir font drásticamente.
//   * 38 (isUltraDense): font 9px, padding 2px — última oportunidad 1-página.
//   * 60 (isHyperDense): NUEVO — 4 cols + ocultar notas mantienen 1 página
//     viable hasta ~75 items.
//   * 80 (multiPage): NUEVO — más allá de aquí ningún ajuste de densidad
//     mantiene legibilidad. Mejor paginear y ofrecer pages 2,3 que un
//     PDF ilegible.
//
// El caller debe usar `multiPage` para flipear `pagebreak.mode` de
// `avoid-all` a la combinación CSS+legacy que respeta `page-break-after`.
// ============================================================

export const PDF_LAYOUT_THRESHOLDS = Object.freeze({
    DENSE: 26,
    ULTRA_DENSE: 38,
    HYPER_DENSE: 60,
    MULTI_PAGE: 80,
});

/**
 * Decide la densidad y estrategia de paginación del PDF de la lista de
 * compras según la cantidad total de items (perecederos + estables).
 *
 * Función pura — sin side effects, fácil de testear.
 *
 * @param {number} totalItems — count agregado de items renderizados.
 * @returns {{
 *   totalItems: number,
 *   density: 'normal'|'dense'|'ultra'|'hyper',
 *   isDense: boolean,
 *   isUltraDense: boolean,
 *   isHyperDense: boolean,
 *   multiPage: boolean,
 *   columnCount: 3|4,
 *   showInventoryNotes: boolean,
 * }}
 */
export const computePdfLayoutDensity = (totalItems) => {
    const n = Number.isFinite(totalItems) && totalItems >= 0 ? Math.floor(totalItems) : 0;
    const isHyperDense = n >= PDF_LAYOUT_THRESHOLDS.HYPER_DENSE;
    const isUltraDense = n >= PDF_LAYOUT_THRESHOLDS.ULTRA_DENSE;
    const isDense = n >= PDF_LAYOUT_THRESHOLDS.DENSE;
    const multiPage = n >= PDF_LAYOUT_THRESHOLDS.MULTI_PAGE;

    let density = 'normal';
    if (isHyperDense) density = 'hyper';
    else if (isUltraDense) density = 'ultra';
    else if (isDense) density = 'dense';

    return {
        totalItems: n,
        density,
        isDense,
        isUltraDense,
        isHyperDense,
        multiPage,
        // 4 columnas en hyper-dense para empacar más items por página vertical.
        columnCount: isHyperDense ? 4 : 3,
        // En hyper-dense ocultamos `_inventoryNote` para liberar 1 línea por
        // item (~10-12px) — el inventario se ve en el banner global del PDF
        // y en el modal de Restock; no perdemos información crítica.
        showInventoryNotes: !isHyperDense,
    };
};
