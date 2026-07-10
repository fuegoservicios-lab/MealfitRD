// [P2-CHUNK-RELOAD-GUARD · 2026-07-09] Anti-loop del auto-reload por
// chunk-error. El auto-reload (GlobalErrorBoundary + listener
// vite:preloadError) asume que el fallo es transient post-deploy: recargar
// trae el index.html nuevo con hashes frescos. PERO si el index.html mismo
// está stale en un cache intermedio (SW roto, proxy, heurística del browser),
// la recarga reproduce el mismo error → bucle infinito de recargas, invisible
// para Sentry (los chunk-errors no se reportan por política).
//
// Contrato: la PRIMERA llamada dentro de la ventana devuelve true (recargar);
// las siguientes devuelven false (mostrar CTA manual y ESE caso sí reportarlo
// — un segundo fallo ya no es el transient esperado).
const _KEY = 'mf_chunk_reload_at';
const _WINDOW_MS = 60_000;

export function shouldAutoReloadForChunkError() {
    try {
        const last = Number(sessionStorage.getItem(_KEY) || 0);
        if (Number.isFinite(last) && last > 0 && (Date.now() - last) < _WINDOW_MS) {
            return false;
        }
        sessionStorage.setItem(_KEY, String(Date.now()));
        return true;
    } catch {
        // Sin sessionStorage no podemos trackear: preferimos permitir el reload
        // (el caso común es transient real) a dejar la pantalla rota.
        return true;
    }
}
