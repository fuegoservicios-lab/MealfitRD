import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from "@sentry/react";
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// Register Service Worker
registerSW({ immediate: true })

// [P1-SENTRY-SAMPLE-COST · 2026-05-12] `tracesSampleRate` driven from env
// var con default seguro 0.1 (10%). Pre-fix `tracesSampleRate: 1.0` capturaba
// el 100% de transacciones — a escala satura la cuota Sentry y los errores
// genuinos empiezan a ser dropeados por throttling. Clamp [0.0, 1.0]; valores
// fuera de rango caen al default. Tooltip-anchor: P1-SENTRY-SAMPLE-COST.
const _parseSentrySampleRate = (raw, fallback) => {
  const v = parseFloat(raw);
  if (Number.isFinite(v) && v >= 0.0 && v <= 1.0) return v;
  return fallback;
};
const SENTRY_TRACES_SAMPLE_RATE = _parseSentrySampleRate(
  import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
  0.1,
);

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';

// [P2-STRICT-MODE-ENABLE · 2026-05-12] StrictMode re-habilitado tras audit
// 2026-05-12. Pre-fix estaba comentado por bugs antiguos de double-invoke
// (toasts duplicados, doble-fetch en Plan.jsx). Esos casos ya están
// guard-eados con `useRef` + sentinels (ver Plan.jsx:131, 411, 710, 739)
// + AssessmentContext.jsx P1-NEW-4 guards. StrictMode en dev/test detecta
// nuevas side-effects en effects/state updates ANTES de que entren a prod
// (en prod StrictMode es no-op, no afecta runtime). Latent bugs sin
// detección era el costo real de mantenerlo deshabilitado. Anchor:
// P2-STRICT-MODE-ENABLE.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
)

// Remove the PWA splash screen smoothly once React has hydrated
const splash = document.getElementById('pwa-splash');
if (splash) {
  setTimeout(() => {
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.remove();
    }, 500); // Wait for CSS transition to finish
  }, 100); // Brief delay to ensure React has fully painted
}