import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// [P2-SENTRY-TREESHAKE · 2026-05-23] Named imports vs `import * as Sentry`.
// El star-import bloqueaba tree-shaking — esbuild conservaba TODO `@sentry/react`
// (profiling, feedback, captureFeedback, etc.) en bundle aunque solo usemos
// init + 2 integrations. Símbolos usados acá:
//   - init: bootstrap del SDK
//   - browserTracingIntegration: integration de trazas browser
//   - replayIntegration: session replay con masking
// `captureException` se importa solo en AgentPage.jsx donde se usa de verdad.
import {
    init as sentryInit,
    browserTracingIntegration,
    replayIntegration,
} from "@sentry/react";
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// Register Service Worker
registerSW({ immediate: true })

// [P3-AUDIT-4 · 2026-05-15] Listener para `pushsubscriptionchange` postMessage
// desde el SW. Cuando el browser rota credentials FCM/push, el SW dispara el
// evento + postMessage; el cliente recibe el message acá y reposta la nueva
// subscription al backend con auth (SW no tiene access_token). Sin esto, las
// subscriptions zombie viven en BD hasta el próximo bootstrap del cliente.
// Idempotente: registra el handler una sola vez.
import { registerPushSubscriptionChangeListener } from './utils/pushNotifications';
registerPushSubscriptionChangeListener();

// [P1-SENTRY-SAMPLE-COST · 2026-05-12] `tracesSampleRate` driven from env
// var con default seguro 0.1 (10%). Pre-fix `tracesSampleRate: 1.0` capturaba
// el 100% de transacciones — a escala satura la cuota Sentry y los errores
// genuinos empiezan a ser dropeados por throttling. Clamp [0.0, 1.0]; valores
// fuera de rango caen al default. Tooltip-anchor: P1-SENTRY-SAMPLE-COST.
//
// [P2-AUDIT-5 · 2026-05-15] Extended a `replaysSessionSampleRate` y
// `replaysOnErrorSampleRate`. Pre-fix esos dos quedaron hardcoded — replays
// son el output más caro de Sentry (vídeo de sesión completo) y un default
// hardcoded sin escape hatch impide a SRE bajar el sample rate sin redeploy
// si la cuota empieza a saturarse. Mismo helper `_parseSentrySampleRate` con
// clamp [0.0, 1.0] reusado para los 3 sample rates.
const _parseSentrySampleRate = (raw, fallback) => {
  const v = parseFloat(raw);
  if (Number.isFinite(v) && v >= 0.0 && v <= 1.0) return v;
  return fallback;
};
const SENTRY_TRACES_SAMPLE_RATE = _parseSentrySampleRate(
  import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
  0.1,
);
const SENTRY_REPLAYS_SESSION_RATE = _parseSentrySampleRate(
  import.meta.env.VITE_SENTRY_REPLAYS_SESSION_RATE,
  0.1,
);
const SENTRY_REPLAYS_ON_ERROR_RATE = _parseSentrySampleRate(
  import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_RATE,
  1.0,
);

// [P2-SENTRY-PII-SCRUBBING-FRONTEND · 2026-05-15] `beforeSend` +
// `beforeBreadcrumb` que redactan PII (email, health_profile, tokens,
// Authorization headers, query strings con token/secret) antes de enviar
// el event a Sentry.
//
// Pre-fix: `replayIntegration({ maskAllText: true })` cubría el video DOM
// de replays — pero error events normales (`Sentry.captureException(err,
// { extra: { body } })`) llegaban con request body/headers/extras sin
// redacción. Verificado: `grep beforeSend` → 0 matches. GDPR-relevant para
// PII y risk de leak de tokens si Sentry se ve comprometido.
//
// Mirror del backend `_sentry_redact_pii` (backend/app.py). Fail-open:
// si el filtro lanza, el event sigue (preferimos PII filtrada
// incorrectamente que perder un error genuino).
//
// Tooltip-anchor: P2-SENTRY-PII-SCRUBBING-FRONTEND.
const SENTRY_SENSITIVE_KEY_SUBSTRINGS = [
  'password', 'secret', 'token', 'authorization', 'cookie',
  'email', 'phone', 'health_profile', 'plan_data', 'access_key',
  'api_key', 'refresh_token', 'credit_card', 'card_number',
];

const _isSensitiveKey = (key) => {
  const k = String(key || '').toLowerCase();
  return SENTRY_SENSITIVE_KEY_SUBSTRINGS.some((s) => k.includes(s));
};

const _redactInPlace = (obj, depth = 0) => {
  if (depth > 3 || !obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === 'object') _redactInPlace(item, depth + 1);
    }
    return;
  }
  for (const k of Object.keys(obj)) {
    if (_isSensitiveKey(k)) {
      obj[k] = '[Filtered]';
    } else if (obj[k] && typeof obj[k] === 'object') {
      _redactInPlace(obj[k], depth + 1);
    }
  }
};

const _sentryBeforeSend = (event) => {
  try {
    if (!event || typeof event !== 'object') return event;
    const req = event.request;
    if (req && typeof req === 'object') {
      for (const subKey of ['data', 'headers', 'cookies']) {
        if (req[subKey] && typeof req[subKey] === 'object') {
          _redactInPlace(req[subKey]);
        }
      }
      if (
        typeof req.query_string === 'string' &&
        /token=|secret=|password=|key=/i.test(req.query_string)
      ) {
        req.query_string = '[Filtered]';
      }
    }
    if (event.extra && typeof event.extra === 'object') _redactInPlace(event.extra);
    if (event.contexts && typeof event.contexts === 'object') _redactInPlace(event.contexts);
    if (event.user && typeof event.user === 'object') {
      for (const k of ['email', 'username', 'ip_address']) {
        if (k in event.user) event.user[k] = '[Filtered]';
      }
    }
  } catch {
    // fail-open
  }
  return event;
};

const _sentryBeforeBreadcrumb = (crumb) => {
  try {
    if (!crumb || typeof crumb !== 'object') return crumb;
    if (crumb.data && typeof crumb.data === 'object') _redactInPlace(crumb.data);
    if (typeof crumb.message === 'string' && crumb.message.includes('?')) {
      if (/token=|secret=|password=|key=/i.test(crumb.message)) {
        crumb.message = crumb.message.split('?')[0] + '?[Filtered]';
      }
    }
  } catch {
    // fail-open
  }
  return crumb;
};

sentryInit({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    browserTracingIntegration(),
    replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  replaysSessionSampleRate: SENTRY_REPLAYS_SESSION_RATE,
  replaysOnErrorSampleRate: SENTRY_REPLAYS_ON_ERROR_RATE,
  beforeSend: _sentryBeforeSend,
  beforeBreadcrumb: _sentryBeforeBreadcrumb,
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