/* [P0-FE-CI-RED · 2026-09-04] Estado puro del medidor de cuota del coach, fuera del fichero del
   componente: `react-refresh/only-export-components` exige que un fichero con componentes NO
   exporte también funciones (rompe el refresco en caliente). Misma lógica que antes; ver el
   comentario de diseño en CoachQuotaMeter.jsx. `quota` = {used, limit, remaining, resets_at}. */
export function coachQuotaState(quota) {
    if (!quota || typeof quota.limit !== 'number' || quota.limit <= 0) return null;
    const used = Math.max(0, Number(quota.used) || 0);
    const remaining = typeof quota.remaining === 'number'
        ? Math.max(0, quota.remaining)
        : Math.max(0, quota.limit - used);
    const state = remaining <= 0 ? 'depleted' : (used / quota.limit >= 0.8 ? 'low' : 'healthy');
    return { used, remaining, limit: quota.limit, state };
}
