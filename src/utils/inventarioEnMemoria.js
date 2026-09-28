// [P1-PLAN-LOTE-742 · 2026-09-28] El estado del inventario de la Nevera en memoria, y su borrado SÍNCRONO.
//
// Vive aparte de `pantryCache.js` para que el JS de arranque no cargue la caché entera: AssessmentContext sólo necesita
// borrar el inventario al cambiar de usuario (P1-XTAB-CACHE-LEAK: la copia del usuario anterior no sobrevive un tick).
// `pantryCache` lee y escribe `INVENTARIO.entrada`; los dos ven el mismo objeto.
import { safeLocalStorageRemove } from './safeLocalStorage';

export const INVENTORY_LS_KEY = 'mealfit_pantry_inventory_cache_v1';

/** `{ entrada: {value, expiresAt} | null }`: un objeto para que el módulo que lo importa pueda reasignar la entrada. */
export const INVENTARIO = { entrada: null };

export const borrarCacheDeInventario = () => {
    INVENTARIO.entrada = null;
    safeLocalStorageRemove(INVENTORY_LS_KEY);
};
