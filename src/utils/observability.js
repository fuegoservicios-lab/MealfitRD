// [P1-APEX-ENTRY-DIET · 2026-08-14] Fachada de observabilidad. Su razón de ser es
// NO tener `@sentry/*` en su grafo de imports.
//
// EL PROBLEMA QUE CIERRA. Medido sobre `dist/assets/index-Cw0WwdBG.js.map` el
// 2026-08-14: el entry síncrono son 1.146.913 B de fuente y `@sentry/*` es
// **427.010 B = 37,2%** de eso. El entry es el recurso #1 del critical path del
// apex (258.293 B / 86,5 kB gz de un total de 244,9 kB gz). O sea: más de un
// tercio del primer JS que descarga alguien que sólo está leyendo una página de
// marketing es el SDK de errores.
//
// P1-PERF-SENTRY-DEFER (2026-05-31) ya había sacado las integraciones pesadas al
// idle, y era la mitad correcta del trabajo. Lo que quedó dentro fue el `init`, y
// con él todo `@sentry/core`. No bastaba con diferir `main.jsx:18`: había CUATRO
// puertas más por las que `@sentry/react` entraba al grafo eager —
// `GlobalErrorBoundary`, `RouteErrorBoundary`, `analytics.js` y `AgentPage` —, y
// mientras una sola siguiera abierta el chunk no se movía ni un byte. Ese es el
// motivo de que esto sea una fachada y no un `await import()` suelto en main.
//
// ⚠️ EL RIESGO REAL, Y CÓMO SE PAGA. Diferir el `init` abre una ventana en la que
// Sentry no existe todavía — y el arranque es justo donde se rompen las cosas.
// Diferir sin encolar no es una optimización: es ceguera. Por eso este módulo:
//
//   1. Instala `error` y `unhandledrejection` propios de forma SÍNCRONA, al
//      evaluarse, antes de que nada más pueda lanzar.
//   2. Encola lo que llegue (tope duro, sin crecimiento no acotado).
//   3. **Arranca Sentry en cuanto entra el primer error**, sin esperar al idle.
//      Un error es exactamente la señal de que el SDK hace falta AHORA. Si no
//      pasa nada, el arranque espera al idle y no compite con el primer paint;
//      si algo falla, el retraso es un turno de event loop.
//   4. Al registrar Sentry, retira sus propios handlers para no duplicar (el
//      `globalHandlersIntegration` del SDK instala los suyos) y drena la cola.
//
// La dirección del fallo es «duplicar», nunca «perder»: si la retirada de los
// handlers propios y la instalación de los del SDK se cruzaran, el evento se
// reporta dos veces y `dedupeIntegration` (default del SDK) lo colapsa.
//
// Guard: src/__tests__/Observability.p1_apex_entry_diet.test.js

/** Tope de la cola. Un arranque que falla en bucle no puede comerse la memoria. */
const MAX_EN_COLA = 25;

/** El módulo de Sentry, una vez cargado. `null` mientras no lo esté. */
let _sentry = null;

/** Cola de eventos previos al init. Se vacía al registrar Sentry. */
let _cola = [];

/** Retira los handlers tempranos. `null` si no están instalados. */
let _desinstalarHandlers = null;

/** Lo llama `main.jsx` para arrancar el SDK. Se inyecta para no importarlo aquí. */
let _arrancarSentry = null;

/** Evita disparar el arranque temprano más de una vez. */
let _arranqueSolicitado = false;

const _encolar = (item) => {
    if (_cola.length < MAX_EN_COLA) _cola.push(item);
    // Un error es la señal de que el SDK hace falta ya: no esperamos al idle.
    if (item.tipo === 'error') _pedirArranqueInmediato();
};

const _pedirArranqueInmediato = () => {
    if (_sentry || _arranqueSolicitado || !_arrancarSentry) return;
    _arranqueSolicitado = true;
    // `setTimeout(0)` y no llamada directa: no queremos ejecutar una carga de
    // módulo dentro del handler de error de otra cosa.
    setTimeout(() => { try { _arrancarSentry(); } catch { /* best-effort */ } }, 0);
};

/**
 * Declara cómo arrancar Sentry. La inyecta `main.jsx`, que es quien tiene la
 * configuración (dsn, release, beforeSend…). Así este módulo no importa el SDK ni
 * conoce sus opciones: sólo sabe *que* hay algo que arrancar.
 */
export const registrarArranqueSentry = (fn) => {
    _arrancarSentry = fn;
    // Si ya se encoló un error mientras nadie sabía arrancar, arranca ahora.
    if (_cola.some((i) => i.tipo === 'error')) _pedirArranqueInmediato();
};

/**
 * Registra el módulo de Sentry ya inicializado, retira los handlers propios y
 * drena la cola. Idempotente.
 */
export const registrarSentry = (mod) => {
    if (_sentry || !mod) return;
    _sentry = mod;

    // Primero desinstalar los nuestros: a partir de aquí los del SDK mandan.
    try { _desinstalarHandlers?.(); } catch { /* noop */ }
    _desinstalarHandlers = null;

    const pendientes = _cola;
    _cola = [];
    for (const item of pendientes) {
        try {
            if (item.tipo === 'error') _sentry.captureException?.(item.error, item.ctx);
            else _sentry.addBreadcrumb?.(item.crumb);
        } catch { /* la telemetría jamás rompe la app */ }
    }
};

/** Reporta un error. Encola si Sentry aún no está. */
export const captureException = (error, ctx) => {
    if (_sentry) {
        try { _sentry.captureException(error, ctx); } catch { /* noop */ }
        return;
    }
    _encolar({ tipo: 'error', error, ctx });
};

/** Añade un breadcrumb. Encola si Sentry aún no está. */
export const addBreadcrumb = (crumb) => {
    if (_sentry) {
        try { _sentry.addBreadcrumb(crumb); } catch { /* noop */ }
        return;
    }
    _encolar({ tipo: 'crumb', crumb });
};

/**
 * Handlers globales tempranos. Cubren el hueco entre el primer byte y el init.
 *
 * Se instalan al EVALUAR el módulo, no en un efecto: un efecto de React ya
 * llegaría tarde para un fallo de arranque, que es justo el caso que más duele
 * perder (P2-CHUNK-RELOAD-GUARD documenta esa clase de fallo en este repo).
 */
const _instalarHandlersTempranos = () => {
    if (typeof window === 'undefined' || _desinstalarHandlers) return;

    const alError = (event) => {
        const err = event?.error instanceof Error
            ? event.error
            : new Error(String(event?.message || 'error temprano sin objeto Error'));
        _encolar({ tipo: 'error', error: err, ctx: { tags: { fase: 'pre-sentry-init', via: 'window.error' } } });
    };
    const alRechazo = (event) => {
        const motivo = event?.reason;
        const err = motivo instanceof Error ? motivo : new Error(String(motivo));
        _encolar({ tipo: 'error', error: err, ctx: { tags: { fase: 'pre-sentry-init', via: 'unhandledrejection' } } });
    };

    window.addEventListener('error', alError);
    window.addEventListener('unhandledrejection', alRechazo);
    _desinstalarHandlers = () => {
        window.removeEventListener('error', alError);
        window.removeEventListener('unhandledrejection', alRechazo);
    };
};

_instalarHandlersTempranos();

/** Sólo para tests: devuelve el tamaño de la cola sin exponerla. */
export const _tamanoColaParaTests = () => _cola.length;

/** Sólo para tests: vuelve al estado inicial. */
export const _reiniciarParaTests = () => {
    try { _desinstalarHandlers?.(); } catch { /* noop */ }
    _desinstalarHandlers = null;
    _sentry = null;
    _cola = [];
    _arrancarSentry = null;
    _arranqueSolicitado = false;
    _instalarHandlersTempranos();
};
