// [P3-DASH-CROSSFADE-PRELOAD · 2026-05-19] Preload de chunks lazy del dashboard
// al hover / touchstart / focus del Link en sidebar y BottomTabBar.
//
// Por qué: cada apartado del dashboard (Plan/Agente/Nevera/Recetas/Ajustes/
// Historial) está code-split via `lazy(() => import(...))` en App.jsx. En el
// PRIMER click sobre un tab que aún no se ha visitado, el browser descarga
// + parsea el chunk JS antes de poder montar el componente → el Suspense
// `PageLoader` se asoma 100-400ms y la transición se siente brusca.
//
// Con preload anticipado, cuando el usuario pasa el mouse sobre el icono
// (desktop) o lo toca (mobile), el chunk comienza a descargarse en background.
// Para cuando el click sucede, el chunk ya está en cache de módulos → el
// fade-in crossfade del nuevo apartado se ve INSTANTÁNEO porque no hay
// roundtrip de red ni parse pending.
//
// El registry centraliza los paths del dashboard que importan los pages
// vía dynamic import. Vite dedupea por path (módulo único) — el `lazy(...)`
// en App.jsx resuelve a la misma instancia que el preload, por lo que el
// chunk solo se descarga UNA VEZ.
//
// `_prefetched` deduplica por path para evitar disparar 60 promesas si el
// usuario barre el cursor por el sidebar. Si la promesa falla (network
// flake), se remueve del set para permitir retry en el próximo hover.

const preloaders = {
    '/dashboard': () => import('../pages/Dashboard'),
    '/dashboard/agent': () => import('../pages/AgentPage'),
    '/dashboard/pantry': () => import('../pages/Pantry'),
    '/dashboard/recipes': () => import('../pages/Recipes'),
    '/dashboard/settings': () => import('../pages/Settings'),
    '/history': () => import('../pages/History'),
};

const _prefetched = new Set();

/**
 * Dispara el dynamic import del page asociado a `path` si no se ha
 * preloadeado aún. Idempotente — llamadas repetidas no re-descargan.
 *
 * @param {string} path  Path del react-router (ej. '/history').
 */
export function prefetchRoute(path) {
    if (_prefetched.has(path)) return;
    const fn = preloaders[path];
    if (!fn) return;
    _prefetched.add(path);
    Promise.resolve()
        .then(fn)
        .catch(() => {
            // Permite retry en el siguiente hover si el chunk falló por
            // network flake. NO logueamos: es best-effort silencioso.
            _prefetched.delete(path);
        });
}
