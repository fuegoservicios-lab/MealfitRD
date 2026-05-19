// [P3-PANTRY-CACHE · 2026-05-19] Cache singleton de los dos datasets que
// `Pantry.jsx` descarga al mount: `user_inventory` (varía con cada
// add/delete/increment/restock) y `master_ingredients` (cuasi-inmutable,
// catálogo del producto).
//
// Por qué: al entrar a /dashboard/pantry el componente bloquea el render
// con skeleton hasta que las 2 queries Supabase resuelvan. En local con
// auth.getSession cold puede tomar 800ms-2s. Stale-while-revalidate hace
// el segundo entry instantáneo y mantiene la lista actualizada via fetch
// background.
//
// TTL:
//   - inventory: 30s. Corto porque muta vía delete/increment/restock y
//     un realtime channel suscrito en Pantry.jsx ya empuja updates al
//     state local. Si el cache se queda stale 30s vs realtime, peor
//     caso el user ve qty viejo brevemente y luego salta al correcto.
//   - masterList: 24h. Casi inmutable — el catálogo de ingredientes lo
//     edita el equipo, no el user. Cache agresivo OK.
//
// Patrón simétrico a `historyCaches.js` (P3-HIST-LIST-CACHE). NO usa
// localStorage porque inventory contiene PII parcial (qué tiene el user
// en la nevera) y prefiero in-memory.

let _inventoryEntry = null;
let _masterListEntry = null;

const _INVENTORY_TTL_MS = 30 * 1000;
const _MASTER_LIST_TTL_MS = 24 * 60 * 60 * 1000;

export const getCachedInventory = () => {
    if (!_inventoryEntry) return undefined;
    if (typeof _inventoryEntry.expiresAt === 'number'
        && Date.now() > _inventoryEntry.expiresAt) {
        _inventoryEntry = null;
        return undefined;
    }
    return _inventoryEntry.value;
};

export const setCachedInventory = (rows, ttlMs = _INVENTORY_TTL_MS) => {
    if (!Array.isArray(rows)) return;
    _inventoryEntry = {
        value: rows,
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    };
};

export const invalidateInventoryCache = () => {
    _inventoryEntry = null;
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

export const _resetPantryCacheForTests = () => {
    _inventoryEntry = null;
    _masterListEntry = null;
};
