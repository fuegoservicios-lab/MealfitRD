// [P1-PLAN-LOTE-112 · 2026-09-19] Las metas del contador, recordadas.
//
// EL DEFECTO. `DashboardTracking` nace con `targets = null` y pide `/api/nutrition/targets` en CADA montaje: salir de
// «Progreso» y volver enseñaba «Calculando tus metas…» otra vez (el dueño: «eso molesta… si es mejor ninguna»). Las
// metas cambian cuando cambia el perfil —casi nunca—, no cuando se cambia de pestaña.
//
// CÓMO. Última respuesta BUENA (`ok: true`) en memoria y en localStorage, por usuario. La pantalla pinta con ella al
// instante y vuelve a pedir por detrás (stale-while-revalidate): si el servidor trae otra cosa, se actualiza sin
// aviso. El aviso solo queda para la primerísima vez en un dispositivo. Una respuesta mala NUNCA pisa una buena
// recordada: un fallo de red no convierte «tus metas» en «no pudimos calcularlas».
//
// Por usuario y borrada en `_clearUserScopedCaches` (AssessmentContext): es PII nutricional, misma clase que
// P1-XTAB-CACHE-LEAK.
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './safeLocalStorage';

export const TARGETS_CACHE_KEY = 'mf_targets_cache';
let _memoria = null; // { userId, targets }

export function readTargetsCache(userId) {
    if (!userId) return null;
    if (_memoria?.userId === userId) return _memoria.targets;
    try {
        const raw = safeLocalStorageGet(TARGETS_CACHE_KEY, null);
        const guardado = raw ? JSON.parse(raw) : null;
        if (guardado?.userId === userId && guardado.targets?.ok === true) {
            _memoria = { userId, targets: guardado.targets };
            return guardado.targets;
        }
    } catch { /* caché corrupta = sin caché */ }
    return null;
}

export function writeTargetsCache(userId, targets) {
    if (!userId || targets?.ok !== true) return;
    _memoria = { userId, targets };
    try { safeLocalStorageSet(TARGETS_CACHE_KEY, JSON.stringify({ userId, targets })); } catch { /* best-effort */ }
}

export function clearTargetsCache() {
    _memoria = null;
    safeLocalStorageRemove(TARGETS_CACHE_KEY);
}
