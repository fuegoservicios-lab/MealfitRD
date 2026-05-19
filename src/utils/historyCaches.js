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

// [P3-HIST-LIST-CACHE · 2026-05-19] Singleton del LISTADO completo del
// Historial (no por-plan, una sola entry por sesión). Patrón
// stale-while-revalidate: al re-montar <History>, si hay cache válido
// se renderiza INSTANTÁNEO + fetch refresca en background. Pre-fix cada
// entrada a /history disparaba un round-trip backend (~300-800ms con
// auth.get_user contra Supabase cloud) → "varios segundos" de skeleton
// que reportó el usuario en sesión de UX 2026-05-19.
//
// TTL: 60s. Suficientemente corto para que un swap/restore/delete que
// se haga desde otra pestaña no quede stale >1min; suficientemente
// largo para cubrir la navegación típica entre apartados.
// Invalidación explícita en restore/delete asegura cero stale visible
// en la pestaña activa.
//
// Shape: `{ value: Array<Plan>, expiresAt: number }`. Singleton via
// `let` module-scope (cero deps externas).
let _historyListEntry = null;
const _HISTORY_LIST_TTL_MS = 60 * 1000;

// [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] Hidrata el singleton desde
// localStorage al boot del módulo. Permite que la primera entrada de la
// sesión (incluso tras refresh / cierre de tab / cold boot) renderice
// instantáneo con la última lista conocida, y el fetch background
// refresque silencioso. La key incluye un version stamp para invalidar
// cuando cambia el shape del payload.
const _HISTORY_LIST_LS_KEY = 'mealfit_history_list_cache_v1';
try {
    if (typeof localStorage !== 'undefined') {
        const _raw = localStorage.getItem(_HISTORY_LIST_LS_KEY);
        if (_raw) {
            const _parsed = JSON.parse(_raw);
            if (_parsed && Array.isArray(_parsed.value)) {
                // Hidratamos al singleton con `expiresAt` original. Si ya
                // está stale (>60s) los lectores con `allowStale=true`
                // siguen viéndolo; `getCachedHistoryList()` lo dropea pero
                // como `getCachedHistoryListStale()` lo respeta, el render
                // instantáneo funciona.
                _historyListEntry = _parsed;
            }
        }
    }
} catch (_e) {
    // localStorage puede fallar (private mode, quota, JSON parse) — no
    // crítico, simplemente arrancamos sin cache.
}
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

// [P3-HIST-LIST-CACHE · 2026-05-19] Lee el listado cacheado si está
// vigente. Devuelve `undefined` si no hay cache o expiró (deja al caller
// decidir si dispara fetch). Side-effect: borra entry expirada.
export const getCachedHistoryList = () => {
    if (!_historyListEntry) return undefined;
    if (typeof _historyListEntry.expiresAt === 'number'
        && Date.now() > _historyListEntry.expiresAt) {
        // Solo borrar la versión memory — NO tocar localStorage; los
        // lectores `Stale` siguen leyendo desde memory hasta que el
        // próximo fetch pisa con datos frescos.
        return undefined;
    }
    return _historyListEntry.value;
};

// [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] Versión "stale-tolerant":
// retorna el último valor conocido AUNQUE haya expirado. Usado por el
// render inicial para que la lista aparezca INSTANTÁNEA aunque pasaron
// >60s desde el último fetch. El componente DEBE disparar fetch en el
// useEffect mount para refrescar — la "frescura" se asegura via
// stale-while-revalidate, no via cache miss.
export const getCachedHistoryListStale = () => {
    if (!_historyListEntry || !Array.isArray(_historyListEntry.value)) return undefined;
    return _historyListEntry.value;
};

// [P3-HIST-LIST-CACHE · 2026-05-19] Persiste el listado tras un
// fetchHistory exitoso. Solo guarda arrays — un fetch fallido (que
// devuelve undefined o lanza) NO debe pisar el cache vigente.
// [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] Espeja a localStorage para
// que sobreviva refresh / cierre de tab. La key incluye version stamp.
export const setCachedHistoryList = (plans, ttlMs = _HISTORY_LIST_TTL_MS) => {
    if (!Array.isArray(plans)) return;
    _historyListEntry = {
        value: plans,
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    };
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(_HISTORY_LIST_LS_KEY, JSON.stringify(_historyListEntry));
        }
    } catch (_e) {
        // Quota exceeded / disabled / private mode — no crítico.
    }
};

// [P3-HIST-LIST-CACHE · 2026-05-19] Invalidación explícita post-mutación
// (delete/restore). Rename muta el listado también (cambia el `name` del
// plan) — el caller lo invoca tras un PATCH exitoso del rename.
// [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] También borra localStorage
// para que el próximo refresh no resucite datos stale invalidados.
export const invalidateHistoryListCache = () => {
    _historyListEntry = null;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(_HISTORY_LIST_LS_KEY);
        }
    } catch (_e) { /* no-op */ }
};

// [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] Prefetch del listado on
// hover/touchstart del NavItem "Historial". Dispara `getHistoryList()`
// best-effort y pisa el cache cuando resuelve. Idempotente via
// `_prefetchInFlight` — si ya hay una request en vuelo, no dispara otra.
//
// Usado desde el sidebar y BottomTabBar (cableado en componentes con
// onMouseEnter / onTouchStart). Para el momento que el dedo llega al
// click, el cache suele estar caliente → entry al apartado instantáneo
// con datos frescos (no stale).
//
// Dynamic import de `../config/api` evita import cycle (api.js importa
// supabase.js; historyCaches.js es util pura).
let _prefetchInFlight = null;
export const prefetchHistoryList = () => {
    if (_prefetchInFlight) return _prefetchInFlight;
    _prefetchInFlight = (async () => {
        try {
            const { getHistoryList } = await import('../config/api');
            const response = await getHistoryList();
            if (!response.ok) return;
            const body = await response.json().catch(() => ({}));
            const plans = Array.isArray(body && body.plans) ? body.plans : null;
            if (plans) setCachedHistoryList(plans);
        } catch (_e) {
            // Best-effort. Si falla, el componente al montar disparará
            // su propio fetch.
        } finally {
            _prefetchInFlight = null;
        }
    })();
    return _prefetchInFlight;
};

// Helper de testing: limpia todos los caches. NO usar en código de
// producción — el cleanup automático es vía TTL.
export const _resetAllCachesForTests = () => {
    _lessonsDetail.clear();
    _coherenceHistory.clear();
    _blockedReasons.clear();
    _chunkMetrics.clear();
    _lifetimeLessons.clear();
    _historyListEntry = null;
};
