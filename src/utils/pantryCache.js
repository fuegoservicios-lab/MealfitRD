// [P3-PANTRY-CACHE · 2026-05-19] Cache singleton de los dos datasets que
// `Pantry.jsx` descarga al mount: `user_inventory` (varía con cada
// add/delete/increment/restock) y `master_ingredients` (cuasi-inmutable,
// catálogo del producto).
//
// Por qué: al entrar a /dashboard/pantry el componente bloquea el render
// con skeleton hasta que las 2 queries el backend anterior resuelvan. En local con
// auth.getSession cold puede tomar 800ms-2s. Stale-while-revalidate hace
// el segundo entry instantáneo y mantiene la lista actualizada via fetch
// background.
//
// TTL:
//   - inventory: 10 min. [P1-PANTRY-TTL-BUMP · 2026-05-20] Pre-fix era 30s.
//     User reportó "el apartado de Nevera cada cierto tiempo dura un
//     poquito más de lo normal" — pasaba el TTL en una tab por >30s
//     (chateando, navegando, etc.) y volvía a Nevera → cache expirado →
//     fetch fresh a el backend anterior ~500-1500ms con spinner visible.
//
//     El realtime channel (`pantry-realtime` suscrito en Pantry.jsx:414)
//     YA empuja UPDATE/INSERT/DELETE al state local sin importar el
//     TTL del cache. Si el user agrega item desde otro device, el evento
//     llega vía WebSocket al state, no via refetch. Por eso el cache
//     puede ser generoso — no es la única fuente de truth, es un buffer
//     para el primer paint.
//
//     10 min cubre sesiones típicas de uso (user pasa 5-10 min en otras
//     tabs antes de volver). Mutaciones del propio user via UI también
//     llaman `invalidateInventoryCache()` explícito (ver handleDelete,
//     handleIncrement, etc), así que la stale-ness real es <30s en uso
//     activo.
//
//   - masterList: 24h. Casi inmutable — el catálogo de ingredientes lo
//     edita el equipo, no el user. Cache agresivo OK.
//
// Patrón simétrico a `historyCaches.js` (P3-HIST-LIST-CACHE).
//
// [P1-PANTRY-CACHE-LOCALSTORAGE · 2026-05-20] Cache híbrido: in-memory
// (fast path runtime) + localStorage (sobrevive page reload). Pre-fix
// era solo in-memory citando "privacy del inventory". Riesgo real:
// MUY bajo — el inventory de comida (Pollo, Arroz, Tomate, etc.) NO
// es PII sensible (médica/financiera) y ya vive en `mealfit_plan` de
// localStorage (que contiene los ingredientes del plan). Beneficio UX:
// al refresh de la página (F5), el primer acceso a Nevera/Dashboard
// arranca con datos cached → cero spinner.
//
// Lectura: in-memory primero (más rápido, no requiere parse JSON);
// fallback a localStorage si no hay in-memory. Escritura: ambos
// simultáneamente. Invalidación: ambos.

let _inventoryEntry = null;
let _masterListEntry = null;

const _INVENTORY_TTL_MS = 10 * 60 * 1000; // 10 min (era 30s)
const _MASTER_LIST_TTL_MS = 24 * 60 * 60 * 1000;

// [P1-PANTRY-CACHE-LOCALSTORAGE · 2026-05-20] Keys de localStorage.
const _INVENTORY_LS_KEY = 'mealfit_pantry_inventory_cache_v1';

const _safeLsRemove = (key) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
};

export const getCachedInventory = () => {
    // Fast path: in-memory.
    if (_inventoryEntry) {
        if (typeof _inventoryEntry.expiresAt === 'number'
            && Date.now() > _inventoryEntry.expiresAt) {
            _inventoryEntry = null;
            _safeLsRemove(_INVENTORY_LS_KEY);
            return undefined;
        }
        return _inventoryEntry.value;
    }
    // [P1-PANTRY-CACHE-LOCALSTORAGE · 2026-05-20] Slow path: localStorage
    // fallback. Cubre el caso post page reload donde el módulo se
    // re-evaluó y `_inventoryEntry` arrancó null.
    try {
        const raw = localStorage.getItem(_INVENTORY_LS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.value)) {
                if (typeof parsed.expiresAt === 'number'
                    && Date.now() > parsed.expiresAt) {
                    _safeLsRemove(_INVENTORY_LS_KEY);
                    return undefined;
                }
                // Hidratar in-memory para próximas llamadas (fast path).
                _inventoryEntry = parsed;
                return parsed.value;
            }
        }
    } catch { /* JSON parse / quota error — fail-open */ }
    return undefined;
};

export const setCachedInventory = (rows, ttlMs = _INVENTORY_TTL_MS) => {
    if (!Array.isArray(rows)) return;
    const entry = {
        value: rows,
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    };
    _inventoryEntry = entry;
    // [P1-PANTRY-CACHE-LOCALSTORAGE · 2026-05-20] Persist also to
    // localStorage para sobrevivir page reload. Best-effort: QuotaExceeded
    // en iOS Private Mode se ignora — el in-memory sigue activo.
    try {
        localStorage.setItem(_INVENTORY_LS_KEY, JSON.stringify(entry));
    } catch { /* ignore */ }
};

export const invalidateInventoryCache = () => {
    _inventoryEntry = null;
    _safeLsRemove(_INVENTORY_LS_KEY);
};

export const getCachedMasterList = () => {
    if (!_masterListEntry) return undefined;
    if (typeof _masterListEntry.expiresAt === 'number'
        && Date.now() > _masterListEntry.expiresAt) {
        _masterListEntry = null;
        return undefined;
    }
    return _masterListEntry.value;
};

export const setCachedMasterList = (rows, ttlMs = _MASTER_LIST_TTL_MS) => {
    if (!Array.isArray(rows)) return;
    _masterListEntry = {
        value: rows,
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    };
};

export const invalidateMasterListCache = () => {
    _masterListEntry = null;
};

// [P1-MANUAL-FOOD-LOG · 2026-08-11] Los 60 platos criollos de /api/catalog/dishes.
// Mismo carácter que el masterList (cuasi-inmutable, lo edita el equipo) ⇒ mismo TTL
// de 24 h y mismo patrón. Solo in-memory: ~4 KB que el primer open del componedor
// trae en un fetch — no ameritan una key más de localStorage.
let _dishesEntry = null;

export const getCachedDishes = () => {
    if (!_dishesEntry) return undefined;
    if (typeof _dishesEntry.expiresAt === 'number'
        && Date.now() > _dishesEntry.expiresAt) {
        _dishesEntry = null;
        return undefined;
    }
    return _dishesEntry.value;
};

export const setCachedDishes = (rows, ttlMs = _MASTER_LIST_TTL_MS) => {
    if (!Array.isArray(rows)) return;
    _dishesEntry = {
        value: rows,
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    };
};

// [P1-BRAND-CHIP-PERSIST · 2026-08-14] Las marcas del súper por alimento (el
// mapa que alimenta el chip «Genérico» de cada fila). Tercer dataset con el
// mismo carácter que el masterList: el catálogo del súper lo edita el equipo,
// no cambia entre dos refrescos del usuario ⇒ TTL de 24 h.
//
// Por qué SÍ va a localStorage (y los platos criollos no): sin persistir, cada
// F5 arrancaba con `{}` y la fila resolvía «todavía no sé qué marcas hay» como
// «no hay marcas» ⇒ el chip no se pintaba y aparecía de golpe al volver el
// POST en lote. El dueño lo reportó como «los menús desaparecen unos
// milisegundos al refrescar». Con el mapa en disco, el chip está en el primer
// frame. Beneficio extra: el prefetch filtra por lo ya cacheado, así que
// también deja de repetir el POST completo en cada carga.
//
// Devuelve `undefined` cuando no hay nada — NO `{}`: un mapa vacío afirmaría
// «ningún alimento tiene marcas», que es justo la confusión que originó el bug.
let _brandsEntry = null;
const _BRANDS_LS_KEY = 'mealfit_pantry_brands_cache_v1';

export const getCachedBrands = () => {
    if (_brandsEntry) {
        if (typeof _brandsEntry.expiresAt === 'number'
            && Date.now() > _brandsEntry.expiresAt) {
            _brandsEntry = null;
            _safeLsRemove(_BRANDS_LS_KEY);
            return undefined;
        }
        return _brandsEntry.value;
    }
    try {
        const raw = localStorage.getItem(_BRANDS_LS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const v = parsed && parsed.value;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                if (typeof parsed.expiresAt === 'number' && Date.now() > parsed.expiresAt) {
                    _safeLsRemove(_BRANDS_LS_KEY);
                    return undefined;
                }
                _brandsEntry = parsed;
                return v;
            }
        }
    } catch { /* JSON parse / quota — fail-open */ }
    return undefined;
};

export const setCachedBrands = (map, ttlMs = _MASTER_LIST_TTL_MS) => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    const entry = { value: map, expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null };
    _brandsEntry = entry;
    try {
        localStorage.setItem(_BRANDS_LS_KEY, JSON.stringify(entry));
    } catch { /* QuotaExceeded (iOS Private) — el in-memory sigue activo */ }
};

export const invalidateBrandsCache = () => {
    _brandsEntry = null;
    _safeLsRemove(_BRANDS_LS_KEY);
};

export const _resetPantryCacheForTests = () => {
    _inventoryEntry = null;
    _masterListEntry = null;
    _dishesEntry = null;
    _brandsEntry = null;
    _safeLsRemove(_INVENTORY_LS_KEY);
    _safeLsRemove(_BRANDS_LS_KEY);
};
