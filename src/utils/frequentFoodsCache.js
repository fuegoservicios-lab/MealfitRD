// [P1-PLAN-LOTE-124 · 2026-09-19] «Lo que más registras», recordado.
//
// EL DEFECTO (el dueño: «dura 1 segundo más o menos para aparecer cada vez que salgo y entro»). «Registrar comida» se
// monta al abrirse y nace con `frequent = []`: la lista llegaba con el fetch, así que cada apertura enseñaba la hoja
// sin ella y un segundo después la empujaba dentro. Es la misma clase que «Calculando tus metas…» (lote 112): un dato
// que casi no cambia, pedido desde cero en cada montaje.
//
// CÓMO. La última lista buena, en memoria y en localStorage, por usuario. La hoja pinta con ella AL INSTANTE y vuelve
// a pedir por detrás; si el servidor trae otra cosa, se sustituye (y si trae lo mismo, ni se toca el estado: la lista
// no parpadea bajo el dedo). Una respuesta mala nunca pisa una buena. Es el diario del usuario: por usuario, y se
// borra en `_clearUserScopedCaches` (AssessmentContext), como `targetsCache`.
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './safeLocalStorage';

export const FREQUENT_FOODS_CACHE_KEY = 'mf_frequent_foods_cache';
let _memoria = null; // { userId, items }

export function readFrequentFoodsCache(userId) {
    if (!userId) return null;
    if (_memoria?.userId === userId) return _memoria.items;
    try {
        const raw = safeLocalStorageGet(FREQUENT_FOODS_CACHE_KEY, null);
        const guardado = raw ? JSON.parse(raw) : null;
        if (guardado?.userId === userId && Array.isArray(guardado.items)) {
            _memoria = { userId, items: guardado.items };
            return guardado.items;
        }
    } catch { /* caché corrupta = sin caché */ }
    return null;
}

export function writeFrequentFoodsCache(userId, items) {
    if (!userId || !Array.isArray(items)) return;
    _memoria = { userId, items };
    try { safeLocalStorageSet(FREQUENT_FOODS_CACHE_KEY, JSON.stringify({ userId, items })); } catch { /* best-effort */ }
}

export function clearFrequentFoodsCache() {
    _memoria = null;
    safeLocalStorageRemove(FREQUENT_FOODS_CACHE_KEY);
}

/** ¿La lista nueva dice lo mismo que la pintada? (para no re-pintar —ni mover nada bajo el dedo— por una respuesta idéntica) */
export function mismaListaFrecuente(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => x?.last_meal_id === b[i]?.last_meal_id && x?.meal_name === b[i]?.meal_name
        && x?.veces === b[i]?.veces && x?.kcal === b[i]?.kcal);
}
