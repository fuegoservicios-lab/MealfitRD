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
//
// [P1-APEX-ENTRY-DIET · 2026-08-14] Y el `init` TAMBIÉN sale del entry. El
// import estático de arriba se ha ido: `@sentry/*` eran 427.010 B = 37,2% de la
// fuente del entry síncrono, el recurso #1 del critical path del apex. Diferir
// las integraciones fue la mitad del trabajo; el core se quedó.
//
// El hueco que abre —no hay SDK entre el primer byte y el arranque— lo cubre
// `utils/observability.js`, que instala handlers propios al evaluarse, encola, y
// **arranca Sentry en cuanto entra el primer error** en vez de esperar al idle.
// Ver ahí el razonamiento completo; aquí sólo vive la configuración.
import { registrarSentry, registrarArranqueSentry } from './utils/observability'
import { registerSW } from 'virtual:pwa-register'
import { isApexHost } from './config/site'
import { isNativeApp } from './config/platform'

// [P3-SW-NO-APEX · 2026-08-18] En el APEX no se registra service worker: es
// HTML estatico y la PWA es del producto, que vive en app.bioboros.com. Sin
// este guard el retiro del SW legado era IMPOSIBLE de completar — React lo
// re-registraba en bucle sobre el propio interruptor de apagado. La historia
// completa, con los numeros de los logs, en el repo del landing:
// bioboros-cinematic/bioboros/custom-sw.js. Mismo criterio que
// P3-APEX-NO-SESSION (App.jsx, AssessmentContext).
const _enApex = typeof window !== 'undefined' && isApexHost();
// [P1-IOS-CODEMAGIC · 2026-08-22] En la app nativa tampoco: WebKit no registra
// service workers en capacitor:// y el intento acaba como error en consola (y en
// Sentry). Los recursos ya viven en el binario; no hay nada que precachear.
const _sinSW = _enApex || isNativeApp();
const _noop = () => {};

import { toast } from 'sonner'
import './index.css'
import App from './App.jsx'
// [P2-CHUNK-RELOAD-GUARD · 2026-07-09] Anti-loop compartido con los boundaries.
import { shouldAutoReloadForChunkError } from './utils/chunkReloadGuard'
// [POSTHOG-ANALYTICS · 2026-07-12] Analítica de producto (gated por VITE_POSTHOG_KEY).
import { initPostHog } from './utils/posthogClient'
// [P1-LANDING-OBS-PAPER · 2026-08-14] Qué observabilidad corre según el host.
import { shouldAttachSentryReplay, isMarketingVisit } from './utils/observabilityScope'
import { safeLocalStorageGet } from './utils/safeLocalStorage';
// [P2-I18N-PWA-UPDATE-TOAST · 2026-08-22] `t` de MODULO, invocada dentro del callback
// del service worker: se resuelve al mostrar el aviso, no al importar.
import { t } from './i18n';

// [P2-CHUNK-RELOAD-GUARD · 2026-07-09] Listener CANONICO de Vite para fallos de
// preload de chunks/CSS tras un deploy (cubre cualquier formato futuro del
// mensaje sin depender de substrings). Complementa los matchers de los error
// boundaries: el evento dispara ANTES de que el error llegue a React (p.ej.
// modulepreload de un asset con hash viejo). preventDefault evita el throw;
// recargamos para traer el index.html fresco — con guard anti-loop.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    if (shouldAutoReloadForChunkError()) {
      event.preventDefault()
      window.location.reload()
    }
    // Si NO recargamos (2º fallo en <60s), dejamos que el error se propague:
    // los boundaries lo capturan, lo reportan y muestran el CTA manual.
  })
}

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

// [P1-VIEWPORT-ZOOM-LOCK · 2026-07-09] Preventer de gestos de PINCH-ZOOM para iOS Safari, que IGNORA
// `user-scalable=no`/`maximum-scale` del viewport (Apple lo deshabilitó por a11y desde iOS 10). En el PWA
// standalone el flag se respeta más, pero para blindar el bloqueo del zoom accidental (pinch de 2 dedos al
// scrollear carruseles horizontales) capturamos y cancelamos los eventos `gesturestart/change/end`
// PROPIETARIOS de Safari. El doble-tap-zoom lo mata `touch-action: manipulation` (index.css) y el auto-zoom
// al enfocar un input lo evita `maximum-scale=1`. Idempotente (corre una vez al boot). passive:false porque
// necesitamos preventDefault. En navegadores sin estos eventos (Android/desktop) los listeners nunca
// disparan → inofensivo. Reversión de P2-A11Y-VIEWPORT-ZOOM confirmada con el dueño (ver index.html).
if (typeof document !== 'undefined') {
  for (const _evt of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(_evt, (e) => { e.preventDefault() }, { passive: false })
  }
}

// Register Service Worker
// [P2-PWA-SKIPWAITING · 2026-05-30] Flujo "prompt" (registerType:'prompt' en
// vite.config). Cuando hay un SW nuevo en 'waiting', `onNeedRefresh` muestra un
// toast NO disruptivo; al aceptar, `updateSW(true)` postea SKIP_WAITING al SW
// (custom-sw.js lo escucha) y recarga de forma controlada tras tomar control.
// Antes (`autoUpdate` sin skipWaiting) el SW nuevo nunca activaba mientras
// hubiera una pestaña abierta → bundle viejo servido por días tras un deploy.
// [P1-LANDING-SW-DEFER · 2026-08-14] Aquí vivía `immediate: true`. En
// workbox-window ese flag significa literalmente «no esperes a `window.load`»
// (`Workbox.ts`: `if (!immediate && readyState !== 'complete') await
// addEventListener('load', ...)`), y su propio JSDoc lo marca «(not
// recommended)». El efecto en el landing era medible: el install arrancaba al
// EVALUAR este chunk de entrada, es decir mientras el navegador todavía estaba
// pidiendo el chunk del hero, y disparaba 73 fetches paralelos ≈ 988 KiB por la
// misma conexión. Un visitante del apex que llega desde WhatsApp y quizá no
// vuelve nunca pagaba ~1 MB de datos móviles compitiendo contra su propio LCP.
//
// Con el default el precache empieza tras `load` y NO se pierde una sola
// garantía: los tres markers de abajo (P2-PWA-SKIPWAITING, P1-SW-AUTO-APPLY-SAFE,
// P2-PWA-UPDATE-POLL) operan sobre callbacks POSTERIORES al registro, así que
// siguen aplicando el deploy exactamente igual, un `load` más tarde.
// No lo re-añadas: el guard es backend/tests/test_p1_landing_sw_defer.py.
const updateSW = _sinSW ? _noop : registerSW({
  onNeedRefresh() {
    // [P1-SW-AUTO-APPLY-SAFE · 2026-07-25] El toast por sí solo NO basta: si el usuario no lo
    // pulsa, sigue con el bundle viejo INDEFINIDAMENTE. Medido en vivo el 25/07: el navegador
    // pidió TRES hashes distintos de `Plan-*.js` en dos horas y sólo uno existía en el servidor
    // — los otros los servía el SW desde caché. Consecuencia real: tres arreglos del bug
    // "tengo que refrescar el dashboard" estaban desplegados y NINGUNO llegó al navegador,
    // así que para el usuario el bug seguía intacto y con razón.
    //
    // Ahora se auto-aplica cuando es SEGURO hacerlo, y sólo entonces: pestaña oculta (nadie
    // está mirando) y sin generación en vuelo (no interrumpimos un plan a medias). Si no es
    // seguro, se mantiene el toast de siempre y se reintenta al ocultar la pestaña. Eso
    // preserva la razón por la que se eligió 'prompt' (no recargar a mitad de un formulario
    // largo) sin pagar su coste (quedarse en una versión vieja para siempre).
    const _safeToApply = () => {
      try {
        if (document.visibilityState !== 'hidden') return false;
        // El flag de generación en vuelo vive en localStorage (utils/pendingPipelineFlag).
        const raw = safeLocalStorageGet('mealfit_plan_in_progress', null);
        if (raw) {
          const started = Number(JSON.parse(raw)?.startedAt || 0);
          // Sólo bloquea si la generación es RECIENTE (< 30 min); un flag viejo es basura.
          if (started && Date.now() - started < 30 * 60 * 1000) return false;
        }
        return true;
      } catch { return false; }
    };
    const _applyIfSafe = () => {
      if (_safeToApply()) {
        document.removeEventListener('visibilitychange', _applyIfSafe);
        updateSW(true);
      }
    };
    if (_safeToApply()) { updateSW(true); return; }
    document.addEventListener('visibilitychange', _applyIfSafe);
    // [P2-I18N-PWA-UPDATE-TOAST · 2026-08-22] Sale en CADA despliegue y con
    // `duration: Infinity` no caduca, así que es de los avisos que más se ven — y era de
    // los pocos que quedaban íntegramente en español en los cinco idiomas.
    //
    // Se llama `t()` aquí dentro y no en ámbito de módulo: esto corre cuando el service
    // worker anuncia versión nueva, mucho después del arranque, así que lee el catálogo
    // ACTIVO. Un `const` con `t()` arriba se congelaría en el idioma de carga.
    toast(t('Nueva versión disponible'), {
      description: t('Recarga para obtener las últimas mejoras.'),
      duration: Infinity,
      action: {
        label: t('Actualizar'),
        onClick: () => { document.removeEventListener('visibilitychange', _applyIfSafe); updateSW(true); },
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
// [P2-LANDING-ENTRY-APP-CODE · 2026-08-14] El listener de rotacion de
// credenciales push solo tiene sentido donde puede haber una suscripcion, o sea
// fuera del apex. El import estatico ataba el modulo al chunk de entrada que
// descarga tambien el visitante del landing, que nunca podra tener una.
if (!isMarketingVisit()) {
  import('./utils/pushNotifications')
    .then((m) => m.registerPushSubscriptionChangeListener())
    .catch(() => { /* sin listener las notificaciones se recuperan en el proximo boot */ });
}

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

// [P1-APEX-ENTRY-DIET · 2026-08-14] La configuración, separada del arranque.
// Es un objeto plano: no arrastra nada de `@sentry/*` al entry.
const _configSentry = () => ({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  // [P2-SENTRY-RELEASE-ENV · 2026-07-09] Sin `release` los stacks minificados
  // no se pueden asociar a una versión (ni a source maps si se suben después)
  // y no hay tracking de regresiones; sin `environment`, eventos dev/preview y
  // prod caen mezclados en el mismo stream.
  // [BIOBOROS-SENTRY-RELEASE · 2026-07-30] Inyectado por `define` en
  // vite.config.js (= `bioboros@<version de package.json>`). Antes se componía
  // aquí con un template literal que NO se plegaba en el bundle, y el deploy
  // subía los sourcemaps bajo otro nombre de release: no casaban y ningún
  // stack se des-minificaba. Ahora el deploy lee este mismo literal del `dist/`.
  release: __APP_RELEASE__,
  environment: import.meta.env.MODE,
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

// [P1-APEX-ENTRY-DIET · 2026-08-14] Arranque del SDK, fuera del entry.
//
// `import('./utils/sentryBoot')` y NO `import('@sentry/react')` directo: un
// import dinámico del paquete devuelve el NAMESPACE entero, así que Rollup no
// puede sacudir nada y el apex acabaría bajando también replay/feedback —
// exactamente lo que P1-LANDING-OBS-PAPER quitó. El módulo intermedio importa
// `init` por nombre, y ahí el tree-shaking sí funciona.
//
// Idempotente por `registrarSentry`: da igual cuántas veces se llame (idle,
// error temprano, ambos).
const _arrancarSentry = async () => {
  try {
    const { arrancarSentry } = await import('./utils/sentryBoot');
    registrarSentry(await arrancarSentry(_configSentry()));
  } catch (e) {
    console.error('[Sentry] no se pudo arrancar el SDK', e);
  }
};

// La fachada necesita saber CÓMO arrancar para poder hacerlo ante el primer
// error, sin esperar al idle. Registrarlo antes de programar el idle no es
// cosmético: un error entre este punto y el idle dispara el arranque él solo.
registrarArranqueSentry(_arrancarSentry);

if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(_arrancarSentry, { timeout: 4000 });
  } else {
    setTimeout(_arrancarSentry, 2000);
  }
}

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
// [P1-LANDING-OBS-PAPER · 2026-08-14] El landing del apex NO paga este chunk.
//
// `await import('@sentry/react')` trae el namespace ENTERO —browserTracing +
// replay + feedback + replay-canvas—: 357.767 B / ~118 kB gzip medidos. En el
// apex no hay sesión (P3-APEX-NO-SESSION) ni app (P3-APP-SUBDOMAIN-ROUTING), así
// que era el vídeo de la sesión de alguien leyendo una página estática, cobrado
// en datos móviles de prepago. Los errores del landing SIGUEN capturándose: el
// arranque de arriba corre en los dos hosts y no depende de esto.
//
// ⚠️ Este gate NO se sustituye con `VITE_SENTRY_REPLAYS_SESSION_RATE=0`: ese knob
// (P2-AUDIT-5) regula la INGESTA, y el chunk se descargaría igual.
//
// El orden importa: las integraciones se adjuntan DESPUÉS del arranque porque
// `addIntegration` necesita un cliente vivo. Se programan en el mismo idle, y el
// `await` de `_arrancarSentry` dentro de `_attachSentryIntegrations` garantiza
// la secuencia aunque los dos callbacks se ejecuten en el mismo turno.
if (typeof window !== 'undefined' && shouldAttachSentryReplay()) {
  const _adjuntarTrasArranque = async () => {
    await _arrancarSentry();
    await _attachSentryIntegrations();
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(_adjuntarTrasArranque, { timeout: 4000 });
  } else {
    setTimeout(_adjuntarTrasArranque, 2000);
  }
}

// [POSTHOG-ANALYTICS · 2026-07-12] Init de PostHog en idle, mismo patrón diferido que
// Sentry arriba (fuera del critical-path entry). No-op total sin VITE_POSTHOG_KEY.
// Al inicializar expone window.posthog → trackEvent (analytics.js) enruta solo, y
// autocapture da usuarios activos / pageviews / retención sin más código.
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => initPostHog(), { timeout: 4000 });
  } else {
    setTimeout(() => initPostHog(), 2000);
  }
}

import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';
// [P1-KB-SONDA] Sólo DEV y sólo con ?kbprobe=1: números del teclado en el dispositivo real.
import { iniciarSondaTeclado } from './utils/keyboardProbe';
iniciarSondaTeclado(); // gateada por dentro: DEV libre, produccion solo con ?kbprobe=1

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
// [P1-LANDING-HEAD-PRELOAD · 2026-08-14] En la PORTADA del apex la señal es otra.
// `mealfit:app-ready` se emite cuando la sesión resuelve, y en el apex eso es
// síncrono (P3-APEX-NO-SESSION): el splash se iba mientras el chunk de Home aún
// venía por la red, dejando splash → hueco vacío → contenido. Ahí esperamos a
// `mealfit:landing-ready`, que Home emite ya montada.
// Se acota a `/` a propósito: las demás rutas de papel (precios, legales,
// novedades…) no emiten esa señal, y esperarla ahí colgaría su splash hasta el
// fallback. El fallback de 2,5 s se conserva intacto como techo en todos los casos.
const splash = document.getElementById('pwa-splash');
if (splash) {
  const esPortadaDelApex = isMarketingVisit() && window.location.pathname === '/';
  const eventoDeListo = esPortadaDelApex ? 'mealfit:landing-ready' : 'mealfit:app-ready';
  let dismissed = false;
  const hideSplash = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(fallbackTimer);
    window.removeEventListener(eventoDeListo, onReady);
    // [P0-1-SPLASH-POINTER-RELEASE] Liberar la captura de toques/clics INMEDIATAMENTE
    // para que el usuario pueda hacer clic en los CTA del Hero sin esperar los 500ms
    // de la transición de opacidad del splash.
    splash.style.pointerEvents = 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      splash.style.opacity = '0';
      setTimeout(() => splash.remove(), 500); // espera el fin de la transición CSS
    }));
  };
  const onReady = () => hideSplash();
  window.addEventListener(eventoDeListo, onReady, { once: true });
  const fallbackTimer = setTimeout(hideSplash, 2500);
}