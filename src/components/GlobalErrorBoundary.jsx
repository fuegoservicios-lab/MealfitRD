import React from 'react';
// [P1-ERROR-BOUNDARY-SENTRY-CAPTURE · 2026-05-24] Named import vs star-import.
// @sentry/react NO auto-captura errores swalloweados por error boundaries —
// solo ve `window.onerror` / unhandled promise rejections. Sin esta llamada
// explícita, cualquier crash de render que cae al boundary es invisible para
// SRE post-incidente: el user ve el copy "Actualizando App..." pero Sentry
// no recibe el stack. Pérdida total de observabilidad.
//
// Tree-shake (P2-SENTRY-TREESHAKE 2026-05-23): named import preserva el
// patrón ya establecido en main.jsx y AgentPage.jsx.
import { captureException } from '@sentry/react';

export class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isChunkLoadError: false };
  }

  static getDerivedStateFromError(error) {
    // Pre-clasificar para que render decida copy sin re-evaluar message.
    const errMessage = error?.message?.toLowerCase() || "";
    const isChunkLoadError =
      errMessage.includes("dynamically imported module") ||
      errMessage.includes("valid javascript mime type") ||
      errMessage.includes("importing a module script failed") ||
      errMessage.includes("unexpected token '<'") ||
      errMessage.includes("loading chunk");
    return { hasError: true, isChunkLoadError };
  }

  componentDidCatch(error, errorInfo) {
    // [P3-NEW-CONSOLE-ERROR-SENTRY · 2026-05-15] esbuild solo stripea
    // log/warn/info/debug en prod build (vite.config.js terserOptions);
    // `console.error` se preserva. Sin gate, en prod el usuario ve el
    // stack trace + componentStack en DevTools — minor info leak +
    // ruido visual ante usuarios técnicos que abren consola buscando
    // diagnóstico. El log local es solo para dev workflow. Anchor:
    // P3-NEW-CONSOLE-ERROR-SENTRY.
    if (import.meta.env.DEV) {
      console.error("Caught error in GlobalErrorBoundary:", error, errorInfo);
    }

    // Auto-reload the page if it's a chunk loading error.
    // Common symptoms of new deployment missing old chunks:
    // "Failed to fetch dynamically imported module" (404)
    // "text/html is not a valid JavaScript MIME type" (200 with fallback index.html)
    // "Unexpected token '<'" (200 with fallback index.html)
    // "Importing a module script failed" (Safari)
    const isChunkLoadError = this.state.isChunkLoadError;

    if (isChunkLoadError) {
      // Chunk-load errors NO se reportan a Sentry: son consecuencia esperada
      // de un deploy nuevo invalidando chunks viejos en el browser del user;
      // el reload los resuelve. Reportarlos satura cuota con falsos positivos.
      // Small timeout to avoid rapid reload loops in worst case scenarios,
      // but reload to get the new index.html and fresh chunk names.
      setTimeout(() => {
        window.location.reload(true);
      }, 500);
      return;
    }

    // [P1-ERROR-BOUNDARY-SENTRY-CAPTURE · 2026-05-24] Crash genuino de render:
    // reportar a Sentry con el componentStack (info que window.onerror NO
    // tiene). Best-effort try/catch — un fallo del SDK Sentry NO debe
    // tumbar el render del fallback UI.
    try {
      captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo?.componentStack,
          },
        },
        tags: {
          error_boundary: "global",
        },
      });
    } catch (_sentryErr) {
      // Silencioso: si Sentry SDK explota, no hay nada que el user pueda hacer
      // y el fallback UI ya está siendo renderizado por el state hasError.
    }
  }

  render() {
    if (this.state.hasError) {
      // [P1-ERROR-BOUNDARY-SENTRY-CAPTURE · 2026-05-24] Copy diferenciado:
      //   - Chunk-load → "Actualizando App..." (transient, auto-recargará).
      //   - Crash genuino → "Algo salió mal" con CTA explícito de recargar
      //     (no auto-reload — el error puede repetirse y entrar en loop).
      if (this.state.isChunkLoadError) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center p-6 bg-white rounded-2xl shadow-xl max-w-sm w-full border border-slate-100">
              <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                 <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                 </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Actualizando App...</h2>
              <p className="text-slate-500 text-sm">Se detectó una nueva versión. Recargando para aplicar los cambios más recientes.</p>
              <div className="mt-6 flex justify-center">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              </div>
            </div>
          </div>
        );
      }

      // Crash genuino: copy honesto + CTA explícito de recargar.
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center p-6 bg-white rounded-2xl shadow-xl max-w-sm w-full border border-slate-100">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Algo salió mal</h2>
            <p className="text-slate-500 text-sm mb-5">Ocurrió un error inesperado. Recargar la página suele resolverlo.</p>
            <button
              type="button"
              onClick={() => window.location.reload(true)}
              className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
