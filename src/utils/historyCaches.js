// [P2-HIST-AUDIT-11 · 2026-05-09] Singleton de caches del modal del
// Historial. Persiste cross-mount del componente <History> para que
// un usuario que navega entre History ↔ Dashboard ↔ History no
// dispare N requests por modal abierto (caso típico tier ultra con
// muchos planes archivados).
//
// Bug original (audit Historial 2026-05-09):
//   Los 4 caches del modal (lessonsDetailCache, coherenceHistoryCache,
//   blockedReasonsCache, chunkMetricsCache) viven en useState locales
//   del componente. Cuando el usuario sale de /history, el componente
//   se desmonta y los caches se pierden — al volver y abrir el mismo
//   plan, todos los lazy-fetches se repiten desde cero. Tier ultra
//   con 50 planes archivados y navegación frecuente: O(N) requests
//   redundantes por sesión.
//
// Diseño:
//   Map global JS (singleton del módulo) por tipo de cache. Las
//   entries son `{value, expiresAt}` con TTL configurable.
//   `useState` lazy-init en <History> reconstruye el dict desde el
//   singleton al montar. Helpers `_ensure*` escriben tanto al
//   useState (re-render) como al singleton (persistencia).
//
//   Solo persistimos VALORES (arrays con data); sentinels
//   'loading'/'error' NO van al singleton — un remount tras un fetch
//   pendiente o fallido debe poder reintentar limpio.
//
// TTL:
//   Default 30 min. Planes archivados son inmutables (ningún
//   endpoint del Historial muta sus datos relevantes a estas
//   caches), así que TTL agresivo está bien. Si el usuario
//   `restorePlanFromHistory`, los chunks/lessons/coherence del
//   plan archivado se cancelan o copian al target — la cache del
//   source ya no será relevante porque el modal del Historial no
//   se reabriría sobre el source post-restore (queda al final de la
//   lista). Para `delete`, el cache queda huérfano pero TTL lo
//   limpia.
//
// Trade-off: NO persistimos a `sessionStorage` — eso añadiría
// serialización jsonb voluminoso (chunk_metrics puede tener
// learning_metrics rico) por escritura. Cross-tab no es caso de
// uso típico. La persistencia in-memory cubre el patrón observado
// (navegación entre páginas dentro de la misma tab).

const _lessonsDetail = new Map();
const _coherenceHistory = new Map();
const _blockedReasons = new Map();
const _chunkMetrics = new Map();
// [P1-HIST-LIFETIME-LESSONS · 2026-05-09] Cache singleton del payload
// de lifetime-lessons (summary + history + critical_permanent). Mismo
// patrón que los 4 caches existentes — TTL 30 min, persistencia
// in-memory cross-mount, NO sentinels. Diferencia: la entry NO es un
// array sino un objeto compuesto `{summary, history, critical_permanent,
// counts}`. Por eso un nuevo helper-pair (`setLifetimeEntry` /
// `hydrateLifetimeDict`) — los existentes asumían `Array.isArray`.
const _lifetimeLessons = new Map();

const _DEFAULT_TTL_MS = 30 * 60 * 1000;

export const historyCaches = {
    lessonsDetail: _lessonsDetail,
    coherenceHistory: _coherenceHistory,
    blockedReasons: _blockedReasons,
    chunkMetrics: _chunkMetrics,
    lifetimeLessons: _lifetimeLessons,
};

// Lee un entry del cache si está vigente (no expirado). Si expiró,
// lo borra y devuelve undefined — el caller dispara fetch limpio.
export const getCachedEntry = (cache, planId) => {
    if (!cache || !planId) return undefined;
    const entry = cache.get(planId);
    if (!entry) return undefined;
    if (typeof entry.expiresAt === 'number' && Date.now() > entry.expiresAt) {
        cache.delete(planId);
        return undefined;
    }
    return entry.value;
};

// Persiste solo arrays válidos (los caches del modal usan arrays
// como shape canónico). Sentinels 'loading'/'error' se ignoran —
// no deben sobrevivir cross-mount (un fetch pendiente o fallido
// se debe poder reintentar limpio).
export const setCachedEntry = (cache, planId, value, ttlMs = _DEFAULT_TTL_MS) => {
    if (!cache || !planId) return;
    if (!Array.isArray(value)) return;
    cache.set(planId, {
        value,
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    });
};

// Reconstruye un dict `{plan_id: array}` desde el cache singleton,
// filtrando entries expiradas. Usado por `useState` lazy-init en el
// componente <History> al montar. Si un plan tiene un entry expirado
// se borra del singleton aquí mismo (limpieza pasiva — no necesitamos
// un sweep timer).
export const hydrateCacheDict = (cache) => {
    const out = {};
    if (!cache) return out;
    const now = Date.now();
    const _expired = [];
    for (const [pid, entry] of cache.entries()) {
        if (!entry || !Array.isArray(entry.value)) continue;
        if (typeof entry.expiresAt === 'number' && now > entry.expiresAt) {
            _expired.push(pid);
            continue;
        }
        out[pid] = entry.value;
    }
    for (const pid of _expired) cache.delete(pid);
    return out;
};

// [P1-HIST-LIFETIME-LESSONS · 2026-05-09] Persistencia / hidratación
// del cache `lifetimeLessons`. Versión "objeto compuesto" de
// `setCachedEntry` / `hydrateCacheDict` que aceptan dicts en lugar de
// arrays. Sentinels ('loading'/'error') NO se persisten — un re-mount
// tras un fetch pendiente o fallido debe poder reintentar limpio.
export const setCachedLifetimeEntry = (planId, value, ttlMs = _DEFAULT_TTL_MS) => {
    if (!planId) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    _lifetimeLessons.set(planId, {
        value,
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    });
};

export const hydrateLifetimeDict = () => {
    const out = {};
    const now = Date.now();
    const _expired = [];
    for (const [pid, entry] of _lifetimeLessons.entries()) {
        if (!entry || !entry.value || typeof entry.value !== 'object'
            || Array.isArray(entry.value)) continue;
        if (typeof entry.expiresAt === 'number' && now > entry.expiresAt) {
            _expired.push(pid);
            continue;
        }
        out[pid] = entry.value;
    }
    for (const pid of _expired) _lifetimeLessons.delete(pid);
    return out;
};

// [P0-HIST-CACHE-INVALIDATION · 2026-05-09] Invalida los 4 caches
// para un plan específico. Llamado tras mutaciones que invalidan los
// datos cacheados:
//   - delete: limpieza de huérfanos (sino TTL los recoge igual).
//   - restore: el plan source post-restore tiene chunks cancelados;
//     blockedReasons / chunkMetrics quedan stale.
//   - visibilitychange tras inactividad: si el cron del backend
//     transicionó chunks (pending_user_action → completed) mientras
//     la pestaña estaba dormida, el cache devuelve estado obsoleto.
//
// rename NO invalida — solo cambia `name`, los datos lazy-loaded
// (lessons/coherence/blocked/metrics) son inmutables al rename.
//
// No-op silencioso si planId es falsy o el cache no tiene la entry
// (evita crashear desde call sites con datos parciales).
export const invalidateCachesForPlan = (planId) => {
    if (!planId) return;
    _lessonsDetail.delete(planId);
    _coherenceHistory.delete(planId);
    _blockedReasons.delete(planId);
    _chunkMetrics.delete(planId);
    _lifetimeLessons.delete(planId);
};

// Helper de testing: limpia todos los caches. NO usar en código de
// producción — el cleanup automático es vía TTL.
export const _resetAllCachesForTests = () => {
    _lessonsDetail.clear();
    _coherenceHistory.clear();
    _blockedReasons.clear();
    _chunkMetrics.clear();
    _lifetimeLessons.clear();
};
