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
// [P1-PERF-SENTRY-DEFER · 2026-05-31] SOLO `init` se importa eager. Las
// integraciones pesadas (browserTracing + replay, ~120KB) se cargan vía
// dynamic import() en idle post-render (abajo) → salen del critical-path entry
// chunk. El core init + beforeSend (scrubbing PII) + la captura de errores vía
// window.onerror/unhandledrejection quedan activos desde el primer momento, así
// que NO se pierde ningún error temprano; solo el video de replay y las trazas
// se adjuntan unos cientos de ms después del primer paint.
import { init as sentryInit } from "@sentry/react";
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import './index.css'
import App from './App.jsx'

// [P1-OAUTH-FIRST-PARTY · 2026-07-03] Captura el `neon_auth_session_verifier` (retorno del
// OAuth de Google) ANTES de que React monte. La ruta '/' del app-host hace
// <Navigate to="/dashboard" replace/> que DESCARTA el query string — y los efectos de los
// hijos (Navigate) corren ANTES que el del provider → cuando el adopt leía la URL, el
// verifier single-use ya no estaba (Neon aterriza en '/' en el primer login OAuth, la
// redirectTo no siempre se honra). El stash en sessionStorage sobrevive cualquier replace
// del router; el provider lo consume (URL primero, stash como fallback).
try {
  const _vv = new URLSearchParams(window.location.search).get('neon_auth_session_verifier')
  if (_vv) sessionStorage.setItem('mf_oauth_verifier', _vv)
} catch { /* noop: sin storage seguimos con el param de la URL si sobrevive */ }

// Register Service Worker
// [P2-PWA-SKIPWAITING · 2026-05-30] Flujo "prompt" (registerType:'prompt' en
// vite.config). Cuando hay un SW nuevo en 'waiting', `onNeedRefresh` muestra un
// toast NO disruptivo; al aceptar, `updateSW(true)` postea SKIP_WAITING al SW
// (custom-sw.js lo escucha) y recarga de forma controlada tras tomar control.
// Antes (`autoUpdate` sin skipWaiting) el SW nuevo nunca activaba mientras
// hubiera una pestaña abierta → bundle viejo servido por días tras un deploy.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast('Nueva versión disponible', {
      description: 'Recarga para obtener las últimas mejoras.',
      duration: Infinity,
      action: {
        label: 'Actualizar',
        onClick: () => updateSW(true),
      },
    })
  },
  // [P2-PWA-UPDATE-POLL · 2026-06-18] Chequeo PROACTIVO de actualizaciones.
  // El SW solo se revisa al registrar (page load); si el usuario mantiene la
  // PWA abierta o la REABRE sin recarga completa (caso típico iOS standalone),
  // el navegador nunca re-fetcha el SW nuevo → el toast 'Nueva versión' no
  // aparece y el usuario corre un bundle viejo hasta limpiar cache a mano.
  // Forzamos registration.update() al volver el foco / reabrir la app (alto
  // valor, costo casi cero porque solo dispara cuando el usuario regresa) + un
  // backstop periódico para pestañas abiertas por horas. El SW nuevo auto-activa
  // (skipWaiting + clients.claim en custom-sw.js, P3-PWA-SKIPWAITING-AUTO) y la
  // navegación network-first+no-store sirve el bundle fresco en la próxima
  // recarga; este poll cierra el último hueco: DETECTAR el SW nuevo sin que el
  // usuario tenga que recargar/limpiar cache a mano.
  onRegisteredSW(swUrl, registration) {
    if (!registration) return
    const UPDATE_INTERVAL_MS = 5 * 60 * 1000 // backstop para sesiones largas
    const checkForUpdate = () => {
      // Solo si la pestaña está visible y online → ahorra datos (es-DO mobile-first).
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      registration.update().catch(() => {})
    }
    setInterval(checkForUpdate, UPDATE_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    })
    window.addEventListener('focus', checkForUpdate)
  },
})

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
  // [P1-PERF-SENTRY-DEFER · 2026-05-31] integrations vacío al boot. browserTracing
  // + replay se adjuntan en idle (ver _attachSentryIntegrations abajo) para no
  // arrastrar ~120KB al entry chunk síncrono. Trade-off aceptado: la transacción
  // de pageload inicial y el buffer de replay arrancan unos cientos de ms tarde;
  // los errores tempranos igual se capturan (init + beforeSend ya activos).
  integrations: [],
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  replaysSessionSampleRate: SENTRY_REPLAYS_SESSION_RATE,
  replaysOnErrorSampleRate: SENTRY_REPLAYS_ON_ERROR_RATE,
  beforeSend: _sentryBeforeSend,
  beforeBreadcrumb: _sentryBeforeBreadcrumb,
});

// [P1-PERF-SENTRY-DEFER · 2026-05-31] Adjunta tracing + replay tras el primer
// paint. El dynamic import() aísla browserTracingIntegration + replayIntegration
// (y replay es el output más pesado del SDK) en un chunk async separado del
// entry. Si falla, la captura de errores sigue viva vía el core init de arriba.
const _attachSentryIntegrations = async () => {
  try {
    const { browserTracingIntegration, replayIntegration, addIntegration } =
      await import('@sentry/react');
    addIntegration(browserTracingIntegration());
    addIntegration(replayIntegration({ maskAllText: true, blockAllMedia: true }));
  } catch (e) {
    console.error('[Sentry] no se pudieron adjuntar integraciones diferidas', e);
  }
};
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(_attachSentryIntegrations, { timeout: 4000 });
  } else {
    setTimeout(_attachSentryIntegrations, 2000);
  }
}

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

// [APPEARANCE-THEME · 2026-05-29] Descarte del splash tied-to-readiness para
// máxima fluidez: en vez de un timer fijo (que ocultaba el splash antes de que
// el contenido real estuviera listo → posible hueco), esperamos el evento
// `mealfit:app-ready` que la app emite cuando la auth inicial resolvió y el
// shell puede pintar. Fallback de 2.5s para que NUNCA se quede colgado.
// Doble rAF antes de iniciar el fade → garantiza que el contenido ya pintó
// debajo, así el cross-fade es perfecto.
const splash = document.getElementById('pwa-splash');
if (splash) {
  let dismissed = false;
  const hideSplash = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(fallbackTimer);
    window.removeEventListener('mealfit:app-ready', onReady);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      splash.style.opacity = '0';
      setTimeout(() => splash.remove(), 500); // espera el fin de la transición CSS
    }));
  };
  const onReady = () => hideSplash();
  window.addEventListener('mealfit:app-ready', onReady, { once: true });
  const fallbackTimer = setTimeout(hideSplash, 2500);
}