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
//   3. el backend anterior: `ingredient_name` de `user_inventory` (el usuario los tipeó
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
const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};
const HTML_RE = /[&<>"']/g;

export const escapeHtml = (value) => {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'string' ? value : String(value);
    // [⚡ Bolt] O(N) un solo pass reemplazando las secuencias concatenadas O(M*N)
    return str.replace(HTML_RE, (match) => HTML_ENTITIES[match]);
};

export const getActiveShoppingList = (planData, duration) => {
    if (!planData || !duration) return null;
    // [P3-NEW-1 · 2026-05-10] Defense-in-depth contra
    // `_shopping_coherence_block` no consumido. Contrato del backend
    // (`review_plan_node` en graph_orchestrator.py:7704): si el guard
    // de coherencia recetas↔lista bloqueó el plan, el flag debe estar
    // POPED post-review (degrade) o el plan debe estar rechazado (no
    // llegar al frontend con la lista). Si el flag aún viene en planData
    // al render time, es una violación del contrato — log defensivo +
    // SEGUIR renderizando (no degradamos UX por un flag posiblemente
    // stale; el backend es source-of-truth de qué planes son visibles).
    if (Array.isArray(planData._shopping_coherence_block) && planData._shopping_coherence_block.length > 0) {
        try {
            // eslint-disable-next-line no-console
            console.warn(
                '[P3-NEW-1/PDF-RENDER] Plan llegó al frontend con ' +
                '`_shopping_coherence_block` no vacío — contrato roto entre ' +
                'backend (review_plan_node debió popearlo) y persistencia. ' +
                `Entries: ${planData._shopping_coherence_block.length}. Render continúa.`
            );
        } catch { /* console.warn falló — best-effort */ }
        // [P3-PDF-OBS-FU-A · 2026-05-14] Telemetría complementaria al
        // `console.warn` previo, que en producción se elimina por esbuild
        // (`pure: ['console.warn']` en vite.config.js). Sin esto, una
        // regresión en `review_plan_node` (backend) que dejase de popear
        // `_shopping_coherence_block` pasaría inadvertida en prod: el plan
        // se renderiza igual (defense-in-depth correcto) pero operadores
        // no saben que el contrato está roto. Lazy import del trackEvent
        // (dynamic) para mantener `shoppingHelpers.js` libre de carga
        // estática del módulo de analytics — usuarios cuyo plan NO viola
        // el contrato no pagan el costo del fetch.
        try {
            // eslint-disable-next-line no-unused-expressions
            import('./analytics.js')
                .then(({ trackEvent }) => {
                    try {
                        trackEvent('pdf_render_coherence_block_leak', {
                            plan_id: planData?.id,
                            entries_count: planData._shopping_coherence_block.length,
                        });
                    } catch { /* analytics SDK best-effort */ }
                })
                .catch(() => { /* import falló — no romper render */ });
        } catch { /* dynamic import sync-error — no-op defensivo */ }
    }
    const keyMap = {
        'weekly': 'aggregated_shopping_list_weekly',
        'biweekly': 'aggregated_shopping_list_biweekly',
        'monthly': 'aggregated_shopping_list_monthly'
    };
    const key = keyMap[duration];
    if (key && Array.isArray(planData[key]) && planData[key].length > 0) return planData[key];
    if (Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0) return planData.aggregated_shopping_list;
    // [P5-EMPTY-ACTIVE-LIST-FALLBACK · 2026-06-23] Las listas de ciclo (biweekly/monthly) y la
    // canónica pueden quedar VACÍAS cuando el usuario está restocked: `_build_hybrid` (RIESGO-1)
    // SUPRIME los perecederos comprados dentro del ciclo. Eso NO es un plan roto — la lista
    // SEMANAL canónica (`aggregated_shopping_list_weekly`, nunca restock-deducida) SÍ existe.
    // Caer a ella evita el falso "tu plan no tiene lista de compras todavía" y desbloquea el
    // PDF/restock; la deducción real contra la Nevera se hace at-render-time en
    // buildDeltaShoppingList (si está todo restocked, el delta saldrá vacío = "ya tienes todo").
    if (Array.isArray(planData.aggregated_shopping_list_weekly) && planData.aggregated_shopping_list_weekly.length > 0) return planData.aggregated_shopping_list_weekly;
    return null;
};

// [P5-PRESENCE-SHOPPING-LIST · 2026-06-23] Set CANÓNICO COMPLETO de ingredientes del plan
// (membresía). La lista `weekly` es la ÚNICA nunca restock-suprimida (las de ciclo
// biweekly/monthly pueden quedar recortadas por `_build_hybrid` cuando el usuario está restocked
// → un ítem agotado que solo vive en `weekly` jamás se chequearía). Esta es la fuente de
// MEMBRESÍA para el delta de presencia; las CANTIDADES siguen viniendo de la lista del ciclo.
export const getCanonicalIngredientSet = (planData) => {
    if (!planData) return null;
    if (Array.isArray(planData.aggregated_shopping_list_weekly) && planData.aggregated_shopping_list_weekly.length > 0) return planData.aggregated_shopping_list_weekly;
    if (Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0) return planData.aggregated_shopping_list;
    return null;
};

const _deltaKey = (it) => (typeof it === 'object' && it ? (it.name || '') : String(it || '')).toLowerCase().split('(')[0].trim();

// [P5-PRESENCE-SHOPPING-LIST · 2026-06-23] Fuente del delta de la lista: parte de la lista del
// CICLO (cantidades ya escaladas → planes nuevos quedan correctos) y UNE los ingredientes del set
// canónico que el ciclo recortó (restock-supresión) pero que SIGUEN siendo del plan. Así un
// perecedero agotado que el backend quitó de la lista de ciclo se vuelve a chequear contra la
// Nevera y reaparece si está ausente. Dedupe por nombre normalizado (sin duplicar filas en
// PDF/restock). Para un plan NUEVO (ciclo no recortado) la unión no agrega nada → idéntico al previo.
export const getDeltaSourceList = (planData, duration) => {
    // Preserva `null` (no `[]`) cuando NO hay lista — el guard del PDF lo usa para detectar
    // "plan sin lista de compras".
    const durationList = getActiveShoppingList(planData, duration);
    const canonical = getCanonicalIngredientSet(planData);
    if (!Array.isArray(canonical) || canonical.length === 0) return durationList;
    const base = Array.isArray(durationList) ? durationList : [];
    const present = new Set(base.map(_deltaKey).filter(Boolean));
    const recovered = canonical.filter((it) => {
        const k = _deltaKey(it);
        return k && !present.has(k);
    });
    if (recovered.length === 0) return durationList;
    return [...base, ...recovered];
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
            // [P2-CALC-INGREDIENTS-MEALS-GUARD · 2026-05-30] Guard simétrico al
            // backend (graph_orchestrator: `if not isinstance(day_meals, list):
            // continue`). Este fallback legacy corre cuando aggregated_shopping_list
            // está vacío/ausente — exactamente el estado de un plan parcial/chunked
            // (graph_orchestrator setea aggregated_shopping_list=[] en el except
            // dejando days poblado). Un día sin `meals` array hacía
            // `day.meals.forEach` lanzar TypeError → el useMemo del Dashboard
            // reventaba el render entero (recuperable vía ErrorBoundary, pero
            // loop crash-on-load hasta que el plan rote). Lista de compras
            // display-only: un fallo de cálculo no debe tumbar el Dashboard.
            const _meals = (day && Array.isArray(day.meals)) ? day.meals : [];
            _meals.forEach(meal => {
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
// Antes el código hacía un `await (cliente anterior).select(...)`
// envuelto en `try/catch` con fallback silencioso. Si el backend anterior tardaba o
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
 *   el query de el backend anterior. Se invoca dentro del race; si timeout gana, el query
 *   sigue corriendo en background pero su resultado se descarta.
 * @param {number} [timeoutMs=2000] — cap blando antes de degradar a caché.
 * @returns {Promise<{data: any[]|null, stale: boolean, reason: string|null}>}
 */
// ============================================================
// [P2-PDF-INV-TIMEOUT-KNOB · 2026-05-14] Knob para el timeout de
// `fetchFreshInventoryWithTimeout`.
// ------------------------------------------------------------
// Antes del P-fix, los 4 callsites de Dashboard.jsx (mount, focus,
// PDF download, restock) pasaban literal `2000` ms al helper. Si
// el backend anterior entra en degradación tail-latency (incidente regional,
// pool exhausted, network blip), no había forma de subir el timeout
// sin redeploy del frontend (rebuild). El cron P2-SHOPPING-3
// (`_alert_pdf_stale_inventory_fallback_burst`) detectaría el burst
// pero la mitigación requería rebuild.
//
// Este helper lee `VITE_INVENTORY_FETCH_TIMEOUT_MS` desde el env
// (sustituido en build-time por Vite/esbuild) con clamp defensivo:
//   - Default: 2000ms (comportamiento pre-knob preservado).
//   - Mínimo: 500ms (debajo de eso casi todos los fetches caerían
//     a stale fallback — peor UX que esperar 500ms).
//   - Máximo: 10000ms (sobre 10s el usuario asume que el PDF/restock
//     se colgó; html2pdf render timeout es 60s pero el inventory
//     fetch es solo un prefetch — sobre 10s es worse-than-stale).
//   - Valores no-numéricos (NaN, undefined, string vacío): fallback al
//     default 2000.
//
// Symmetric counterpart to `VITE_PDF_RENDER_TIMEOUT_MS` (P2-PDF-OBS-2)
// que cubre el timeout del render html2pdf. Ambos knobs permiten al
// SRE bumpearlos sin redeploy si el backend anterior/render latencia tail crece.
// ============================================================

/**
 * Retorna el timeout (ms) para `fetchFreshInventoryWithTimeout` leído
 * desde el env knob con clamp defensivo.
 * @returns {number} clamp [500, 10000], default 2000.
 */
export const getInventoryFetchTimeoutMs = () => {
    const raw = parseInt(import.meta.env?.VITE_INVENTORY_FETCH_TIMEOUT_MS, 10);
    let ms = Number.isFinite(raw) ? raw : 2000;
    if (ms < 500) ms = 500;
    if (ms > 10000) ms = 10000;
    return ms;
};

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

        // el backend anterior responses: `{ data, error }`. Si error está poblado, se
        // trata como fallo de red/permiso → stale.
        if (result && result.error) {
            return { data: null, stale: true, reason: 'error' };
        }

        const data = result?.data;
        if (!Array.isArray(data)) {
            // null/undefined data sin error explícito (caso patológico de
            // el backend anterior con RLS denegando silenciosamente) → degradar a caché.
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
