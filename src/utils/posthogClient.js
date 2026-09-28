// [POSTHOG-ANALYTICS · 2026-07-12] Analítica de producto (usuarios activos, embudo
// registro→plan→pago, retención) vía PostHog. Complementa a Sentry (errores):
// Sentry responde "¿algo falló?", PostHog responde "¿cuántos usan la app / pagan?".
//
// Todo gated por VITE_POSTHOG_KEY: SIN la key el módulo es no-op TOTAL — no carga el
// SDK, no crea window.posthog, no envía nada. Respeta el opt-out de privacidad
// (isAnalyticsOptedOut, P2-PRIVACY-SETTINGS). El SDK (~50KB) se carga vía dynamic
// import() en idle (fuera del critical path, mismo patrón que las integraciones
// diferidas de Sentry en main.jsx). Al inicializar expone `window.posthog`, así el
// `trackEvent` de analytics.js —que ya llama window.posthog.capture— enruta solo.
// [P1-LANDING-OBS-PAPER · 2026-08-14] `autocapture` deja de decidirse aquí: en el
// apex significaba capturar cada click y cada campo de un visitante SIN CUENTA
// que sólo está leyendo marketing. La política vive en `observabilityScope.js`,
// que lo conserva encendido dentro de la app y preserva `capture_pageview` /
// `capture_pageleave` en ambos hosts — el embudo de POSTHOG-ANALYTICS nace en la
// portada y sin sus pageviews se queda sin primer escalón.
//
// [P1-PLAN-LOTE-794 · 2026-09-28] (G28) SIN COOKIES Y SIN BANNER — decisión del dueño.
// En España la analítica que guarda un identificador en el dispositivo exige
// consentimiento PREVIO (banner). La salida elegida es no guardar nada:
// `cookieless_mode: 'always'` — ni cookie, ni `localStorage`, ni `sessionStorage`; la
// identidad del visitante la calcula PostHog en su servidor. Leyendo posthog-js 1.399.2
// (`lib/src/posthog-core.js`) ese modo cambia TRES cosas de las que dependía este código:
//   1. `opt_out_capturing()` / `opt_in_capturing()` pasan a ser NO-OP (avisan y salen).
//      El interruptor de Configuración quedaría muerto → el corte vive en `before_send`,
//      que consulta la bandera en CADA evento (también los internos del SDK: pageview,
//      pageleave, autocapture, que no pasan por `trackEvent`).
//   2. Nada persiste entre cargas: `identify()` hay que repetirlo en CADA carga. Y la
//      sesión se conoce casi siempre ANTES de que este import diferido termine, así que
//      la identidad se guarda aquí y se aplica al inicializar (`_usuario`).
//   3. La persistencia deshabilitada BORRA al arrancar la entrada de su almacén. Por eso
//      `persistence` sigue en 'localStorage+cookie' aunque no se use: es el almacén donde
//      los visitantes de antes tienen el identificador, y así se les limpia la cookie y
//      el `localStorage`. Con 'memory' esa cookie viviría un año más. [ronda 1] Además se
//      borran a mano antes de arrancar (`_borrarRestosDelModoConCookies`), también a quien
//      tiene la analítica apagada, al que el SDK no llega a arrancar.
// ⚠️ BLOQUEANTE DE DESPLIEGUE: PostHog DESCARTA todos los eventos cookieless si el proyecto
// no tiene activado «Cookieless server hash mode» (Project Settings → Web analytics). Se
// activa ANTES de desplegar este frontend, no después (lo dice la documentación del tipo
// `cookieless_mode`).
// LO QUE ESTE MODO QUITA [ronda 1]: el SDK no crea el grabador de sesiones ni el
// `SessionIdManager` (session-recording / posthog-core en 1.399.2): sin replay de PostHog y
// sin `$session_id` de cliente — las sesiones las calcula el servidor. El error de la app
// sigue en Sentry.
// DECISIÓN ABIERTA DEL DUEÑO [ronda 1]: PostHog aconseja NO llamar a `identify()` en este
// modo («a persistent distinct ID is considered Personal Data under GDPR… which undoes the
// privacy benefit of this mode»). Aquí se identifica en cada carga con sesión (analítica por
// cuenta, bajo el interés legítimo de §7/§13); la alternativa es `person_profiles: 'never'`
// y no identificar. Sin banner se cumple ePrivacy (nada en el dispositivo); lo otro es RGPD.
// DECISIÓN ABIERTA DEL DUEÑO [ronda 2]: el autocapture (encendido en la app,
// observabilityScope.js) manda el TEXTO VISIBLE de lo que se pulsa, y los chips del formulario
// (`ChipOption`, div role="button" con cursor: pointer) lo cumplen: pulsar «Diabetes T2» llega a
// PostHog, unido a la cuenta tras `identify` — un dato de salud (art. 9 RGPD) bajo interés
// legítimo y sin banner. Hoy la Política de Privacidad §7/§8 y Protección de Datos §5 lo DECLARAN,
// igual que el landing (rama ia6d-legal). La alternativa es no mandarlo: `ph-no-capture` en los
// chips de salud, alergias y medicamentos (o `mask_all_text: true`), y entonces las dos copias de
// la política retiran el aviso a la vez.
// Ancla: src/__tests__/lote794.test.js (con el SDK real, no con un mock de `init`).
import { isAnalyticsOptedOut } from './analytics';
import { posthogCaptureOptions } from './observabilityScope';
import { safeLocalStorageRemove } from './safeLocalStorage';
import { SITE_DOMAIN, isSiteHost } from '../config/site';

let _initialized = false;

// [P1-PLAN-LOTE-794] La identidad de ESTA carga. En memoria y en ningún otro sitio: es
// justo lo que el modo sin cookies no deja guardar en el dispositivo.
let _usuario = null;

// [P1-PLAN-LOTE-794 · ronda 1] Con la analítica apagada NO se identifica. `before_send`
// sólo filtra EVENTOS, y `identify()` además recarga los flags: un POST a /flags con el
// `distinct_id` de la cuenta que no es un evento y que nada cortaba (apagar → cerrar
// sesión → entrar con otra cuenta en la misma carga mandaba el id NUEVO). `_usuario` se
// conserva igual: si el usuario vuelve a encender, `reaplicarIdentidadPostHog` lo usa.
const _aplicarIdentidad = () => {
    try {
        if (isAnalyticsOptedOut()) return;
        if (typeof window !== 'undefined' && window.posthog && _usuario) {
            window.posthog.identify(_usuario.id, _usuario.props);
        }
    } catch { /* noop */ }
};

// [P1-PLAN-LOTE-794 · ronda 1] Restos del modo con cookies, borrados A MANO y ANTES de
// mirar el opt-out:
//   · `__ph_opt_in_out_<token>`: la clave de consentimiento que escribían el
//     `opt_in_capturing()` Y el `opt_out_capturing()` de antes. Vive fuera de la
//     persistencia, así que `disable_persistence` no la toca y sobrevivía al arranque,
//     contra el «sin guardar nada en su dispositivo» de la Política de Privacidad. Ni
//     `clear_opt_in_out_capturing()` basta: la borra del `localStorage` pero deja la copia en
//     cookie (medido con el SDK real: su almacén ya quedó fijado durante `init`).
//   · `ph_<token>_posthog`: la persistencia vieja (cookie + `localStorage`). El SDK la
//     limpia al arrancar (cabecera, punto 3), pero sólo a quien lo arranca.
// Quien más probablemente tiene la clave es quien APAGÓ la analítica, y a ese usuario
// `initPostHog` no le arranca el SDK: por eso la limpieza no depende del SDK ni del opt-out.
// Cookie en los dos ámbitos: la del host y la de `.bioboros.com` (el SDK de antes usaba
// `cross_subdomain_cookie`).
const _borrarRestosDelModoConCookies = (token) => {
    for (const clave of [`__ph_opt_in_out_${token}`, `ph_${token}_posthog`]) {
        safeLocalStorageRemove(clave);
        try {
            const caduca = `${clave}=; Max-Age=0; path=/`;
            document.cookie = caduca;                                   // cookie del host
            if (isSiteHost(window.location.hostname)) {
                document.cookie = `${caduca}; domain=.${SITE_DOMAIN}`;  // cookie de dominio
            }
        } catch { /* noop */ }
    }
};

// [P1-PLAN-LOTE-794] El corte del opt-out, evento a evento. Devolver null descarta.
const _descartarSiOptOut = (evento) => (isAnalyticsOptedOut() ? null : evento);

export async function initPostHog() {
    if (_initialized) return;
    if (typeof window === 'undefined') return;
    const key = import.meta.env.VITE_POSTHOG_KEY;
    if (!key) return;                    // gated OFF sin key → no-op total
    _borrarRestosDelModoConCookies(key); // [P1-PLAN-LOTE-794 · ronda 1] también con opt-out
    if (isAnalyticsOptedOut()) return;   // respeta el opt-out del usuario
    try {
        const { default: posthog } = await import('posthog-js');
        posthog.init(key, {
            api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
            ...posthogCaptureOptions(),
            // Solo crea "person profile" tras identify (usuario logueado): ahorra
            // cuota y evita perfiles de visitantes anónimos. Los pageviews anónimos
            // IGUAL cuentan para usuarios activos (distinct_id anónimo).
            person_profiles: 'identified_only',
            // [P1-PLAN-LOTE-794] Sin cookies ni almacenamiento (ver cabecera, punto 3,
            // para por qué `persistence` no es 'memory').
            cookieless_mode: 'always',
            disable_persistence: true,
            persistence: 'localStorage+cookie',
            // Encuestas, tours de producto y conversaciones escriben su propio `localStorage`
            // fuera de la persistencia; se encienden desde el panel de PostHog, no desde aquí.
            // [P1-PLAN-LOTE-794 · ronda 1] Conversaciones faltaba: su carga no se bloquea en
            // modo `always` (posthog-conversations.js).
            disable_surveys: true,
            disable_product_tours: true,
            disable_conversations: true,
            // [P1-PLAN-LOTE-794 · ronda 2] Sin /flags (ni remote config). `before_send` sólo ve
            // EVENTOS, y /flags no lo es: con la analítica apagada, el `reset(true)` de apagar
            // en caliente y el refresco de cada 5 min (remote-config.js) seguían mandando a
            // PostHog la URL, el referrer y —si se apagó desde otra pestaña— el `distinct_id`
            // de la cuenta. La app no usa feature flags (su única llamada al SDK es `capture`).
            // Lo que se pierde: los ajustes que el panel de PostHog empuja por remote config
            // (heatmaps, web vitals, dead clicks); el autocapture sigue, decidido aquí.
            advanced_disable_flags: true,
            before_send: _descartarSiOptOut,
        });
        window.posthog = posthog;
        _initialized = true;
        _aplicarIdentidad();
    } catch (e) {
        // Analítica best-effort: jamás romper la app por PostHog.
        console.error('[PostHog] init falló', e);
    }
}

// Asocia los eventos siguientes a un usuario concreto (post-login). id-only por
// privacidad (sin email/PII en el tercero); el owner correlaciona por user_id.
// [P1-PLAN-LOTE-794] Se llama en CADA carga con sesión (AssessmentContext →
// handleAuthChange); si el SDK aún no llegó, se aplica al inicializar.
export function identifyPostHog(userId, props) {
    if (!userId) return;
    _usuario = { id: String(userId), props: props || {} };
    _aplicarIdentidad();
}

// [P1-PLAN-LOTE-794 · ronda 1] Al volver a ENCENDER la analítica en Configuración. Apagar
// hace `reset(true)` (la sesión pasa al centinela anónimo) y sin persistencia nada la
// devolvía hasta la próxima carga. La llama Configuración y no `analytics.js` porque
// este módulo importa de allí: el import de vuelta cerraría el ciclo.
export function reaplicarIdentidadPostHog() {
    _aplicarIdentidad();
}

// Desasocia (logout): los eventos siguientes vuelven a ser anónimos.
// [P1-PLAN-LOTE-794] Sin persistencia no hay nada que soltar si en esta carga no se
// identificó a nadie: el `reset` sólo corre cuando había un usuario.
export function resetPostHog() {
    const habiaUsuario = _usuario !== null;
    _usuario = null;
    if (!habiaUsuario) return;
    try {
        if (typeof window !== 'undefined') window.posthog?.reset?.();
    } catch { /* noop */ }
}
