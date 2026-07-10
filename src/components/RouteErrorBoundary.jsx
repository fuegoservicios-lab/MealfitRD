import React from 'react';
// [P1-7 · ERROR-BOUNDARY-POR-RUTA · 2026-07-09] Boundary SCOPED (complementa el
// GlobalErrorBoundary root, que recarga toda la app). Contiene un crash de render
// a la seccion — el shell (tab bar) y el estado keep-alive de otras rutas
// sobreviven — y ofrece "Reintentar" (key-bump remonta la seccion, SIN recarga).
// Los chunk-load errors (deploy nuevo invalidando chunks viejos) SI delegan al
// reload global, que es su recovery correcta.
//
// Named import (P2-SENTRY-TREESHAKE) + captura explicita con tag de ruta: sin la
// llamada, @sentry/react no ve los errores swalloweados por un boundary.
import { captureException } from '@sentry/react';
// [P2-CHUNK-RELOAD-GUARD · 2026-07-09] Anti-loop del auto-reload (ver util).
import { shouldAutoReloadForChunkError } from '../utils/chunkReloadGuard';

const _isChunkLoadError = (error) => {
  const m = error?.message?.toLowerCase() || '';
  return (
    m.includes('dynamically imported module') ||
    m.includes('valid javascript mime type') ||
    m.includes('importing a module script failed') ||
    m.includes("unexpected token '<'") ||
    // [P2-CHUNK-RELOAD-GUARD · 2026-07-09] CSS de un chunk stale tras deploy:
    // Vite lanza "Unable to preload CSS for /assets/…" — sin este matcher la
    // UI quedaba rota sin auto-reload y "Reintentar" era irrecuperable.
    m.includes('unable to preload css') ||
    m.includes('loading chunk')
  );
};

export class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isChunk: false, resetKey: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, isChunk: _isChunkLoadError(error) };
  }

  componentDidCatch(error, errorInfo) {
    // Chunk-load: es transient (deploy nuevo). Delegamos al reload global — NO se
    // reporta a Sentry (falsos positivos que saturan cuota, misma politica que
    // GlobalErrorBoundary).
    if (this.state.isChunk || _isChunkLoadError(error)) {
      // [P2-CHUNK-RELOAD-GUARD · 2026-07-09] Si ya recargamos hace <60s y el
      // error persiste, NO es el transient post-deploy: index.html stale en un
      // cache intermedio. Ese caso SI se reporta y cae al fallback con CTA.
      if (shouldAutoReloadForChunkError()) {
        setTimeout(() => window.location.reload(true), 500);
        return;
      }
      try {
        captureException(error, {
          tags: { error_boundary: 'route', route: this.props.routeName || 'unknown', chunk_reload_loop: 'true' },
        });
      } catch { /* noop */ }
      this.setState({ isChunk: false });
      return;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error(`[RouteErrorBoundary:${this.props.routeName || 'unknown'}]`, error, errorInfo);
    }
    try {
      captureException(error, {
        contexts: { react: { componentStack: errorInfo?.componentStack } },
        tags: { error_boundary: 'route', route: this.props.routeName || 'unknown' },
      });
    } catch {
      // Silencioso: si el SDK Sentry explota, el fallback UI ya se esta renderizando.
    }
  }

  handleRetry = () => {
    // Key-bump: remonta el subtree de children (reset limpio) en vez de recargar.
    this.setState((s) => ({ hasError: false, isChunk: false, resetKey: s.resetKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      if (this.state.isChunk) {
        // El reload global esta en camino (500ms); loader mientras tanto.
        return (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>
            Actualizando…
          </div>
        );
      }
      return (
        <div
          role="alert"
          style={{
            padding: '2rem 1.25rem',
            textAlign: 'center',
            maxWidth: '28rem',
            margin: '2rem auto',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: '1rem',
            background: 'var(--surface, #fff)',
          }}
        >
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 .4rem' }}>
            Algo salió mal en esta sección
          </h2>
          <p style={{ fontSize: '.85rem', opacity: 0.7, margin: '0 0 1rem' }}>
            El resto de la app sigue funcionando. Puedes reintentar sin recargar todo.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '.55rem 1.25rem',
              fontSize: '.85rem',
              fontWeight: 600,
              color: '#fff',
              background: 'var(--primary, #4f46e5)',
              border: 'none',
              borderRadius: '.65rem',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }

    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}
