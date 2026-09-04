// [P1-COACH-QUOTA-METER · 2026-09-02 · extraído 2026-09-04] Estado de la cuota mensual del coach
// a partir de `{used, limit, remaining}`: 'healthy' | 'low' (≥ 80 %) | 'depleted'. SSOT compartido
// por el medidor (CoachQuotaMeter) y sus tests.
export function coachQuotaState(quota) {
    if (!quota || typeof quota.limit !== 'number' || quota.limit <= 0) return null;
    const used = Math.max(0, Number(quota.used) || 0);
    const remaining = typeof quota.remaining === 'number'
        ? Math.max(0, quota.remaining)
        : Math.max(0, quota.limit - used);
    const state = remaining <= 0 ? 'depleted' : (used / quota.limit >= 0.8 ? 'low' : 'healthy');
    return { used, remaining, limit: quota.limit, state };
}
