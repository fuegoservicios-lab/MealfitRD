// [P2-3 · quota→TanStack · 2026-07-09] Cache del planCount (gate soft de
// regeneración) sobre el queryClient. Reemplaza a `window.__cachedQuota` /
// `window.__lastQuotaCheckTime` — globals mutables SIN user_id duplicados en
// 3 archivos (Dashboard TTL 120s, useRegeneratePlan 5s, Settings 5s) que
// requerían purga manual en logout (P2-QUOTA-CACHE-XUSER).
//
// Con fetchQuery: (a) key ['plan-quota', userId] → el user-switch es
// estructuralmente seguro (clearUserQueryCache() lo evicta con todo lo demás);
// (b) dedup de requests in-flight gratis (dos gates simultáneos = 1 fetch);
// (c) el TTL se expresa por callsite vía staleTime (semántica preservada:
// Dashboard tolera 120s, los gates de regeneración exigen ≤5s).
//
// El quota REAL se enforza server-side (verify_api_quota → 402); esto es solo
// la UX del gate — por eso fail-open queda en manos del caller (mismo
// comportamiento que los globals).
import { queryClient } from '../queryClient';

/**
 * @param {string|undefined} userId  id del usuario autenticado.
 * @param {(userId: string|undefined) => Promise<number>} checkPlanLimit  fetch real del conteo.
 * @param {{ttlMs?: number}} [opts]  frescura máxima aceptada (default 5s).
 * @returns {Promise<number>} planCount del mes.
 */
export function getFreshPlanCount(userId, checkPlanLimit, { ttlMs = 5000 } = {}) {
    return queryClient.fetchQuery({
        queryKey: ['plan-quota', userId ?? 'anon'],
        queryFn: () => checkPlanLimit(userId),
        staleTime: ttlMs,
        retry: false,
    });
}

/** Invalidación explícita (p.ej. tras consumir un crédito con éxito). */
export function invalidatePlanCountCache(userId) {
    queryClient.removeQueries({ queryKey: ['plan-quota', userId ?? 'anon'] });
}
