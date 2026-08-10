// [P1-GUEST-MODE · 2026-06-15] Modo invitado: permite a un cliente potencial
// probar el funnel del plan gratuito (formulario → generar → dashboard) SIN
// crear cuenta. Los créditos están limitados; al agotarse, se invita a crear
// cuenta para obtener el resto.
//
// La identidad del invitado es EFÍMERA (localStorage + un session_id), sin
// persistencia en DB. Esto es seguro: el backend ya trata al invitado como
// `verified_user_id = None` (auth.py) y bloquea los endpoints sensibles
// (despensa, historial, like, etc.), así que abrir el funnel en el frontend NO
// expone datos de otros usuarios — sólo habilita la generación efímera vía
// `session_id` que el backend ya soporta (routers/plans.py::analyze/stream,
// capada a 3 días para invitados).
//
// El gate de créditos es localStorage-side (primera línea anti-abuso); el
// backend ya capa a 3 días y no persiste. Un endurecimiento server-side por
// session_id/IP queda como follow-up.

import {
    safeLocalStorageGet,
    safeLocalStorageSet,
    safeLocalStorageRemove,
} from './safeLocalStorage';

// Créditos (= generaciones de plan) que recibe un invitado: 1 — SOLO la primera
// generación (el plan de muestra). Después debe crear cuenta o iniciar sesión en
// una cuenta SIN plan para acceso completo; ese plan de muestra se adopta a la
// cuenta vía el endpoint /api/plans/adopt-guest-plan (P1-GUEST-ADOPT-1).
// [P1-GUEST-CREDITS-1 · 2026-06-21]
export const GUEST_PLAN_CREDITS = 1;

const K_MODE = 'mealfit_guest_mode';
const K_USER = 'mealfit_user_id';
const K_SESSION = 'mealfit_guest_session_id';
const K_CREDITS_USED = 'mealfit_guest_credits_used';

// [P1-GUEST-SESSION-PERSIST · 2026-06-21] Marcador de SESIÓN DE TAB (sessionStorage,
// NO localStorage). sessionStorage sobrevive un refresh/F5 dentro de la misma
// pestaña, pero se BORRA al cerrar la pestaña y volver a abrir (o en pestaña nueva).
// Distingue "refresh" (preservar el plan de invitado) de "salí y volví = sesión
// nueva" (limpiar plan + cuenta de invitado).
const SS_TAB_ALIVE = 'mealfit_guest_tab_alive';

function genId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch {
        /* crypto ausente en contextos no-seguros: fallback abajo */
    }
    return `guest_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** True si el flag de modo invitado está activo en localStorage. */
export function isGuestModeActive() {
    return safeLocalStorageGet(K_MODE, null) === '1';
}

// [P1-GUEST-SESSION-PERSIST · 2026-06-21] Helpers del marcador de sesión de tab.
/** ¿sessionStorage es usable (write+read+remove)? Algunos entornos lo bloquean
 *  independientemente de localStorage — modo privado, particionado ITP, ciertas
 *  extensiones/webviews — a veces LANZANDO, a veces como no-op silencioso (set
 *  no persiste). El probe detecta AMBOS casos sin asumir cuál. */
function sessionStorageUsable() {
    try {
        const k = '__mf_ss_probe__';
        sessionStorage.setItem(k, '1');
        const ok = sessionStorage.getItem(k) === '1';
        sessionStorage.removeItem(k);
        return ok;
    } catch {
        return false;
    }
}

/** Marca esta SESIÓN DE TAB como viva. Se llama al activar el modo invitado;
 *  sobrevive un refresh, NO sobrevive cerrar+reabrir la pestaña. */
export function markGuestTabAlive() {
    try { sessionStorage.setItem(SS_TAB_ALIVE, '1'); } catch { /* no usable: no-op */ }
}
/** ¿La sesión de tab del invitado sigue viva (= fue un refresh, no una pestaña
 *  nueva)? Tres estados:
 *   • sessionStorage usable + marcador presente → true  (refresh → PRESERVAR).
 *   • sessionStorage usable + marcador ausente  → false (pestaña nueva → limpiar).
 *   • sessionStorage NO usable (no se puede determinar) → true (PRESERVAR).
 *  El fail-safe va hacia PRESERVAR a propósito: el objetivo del feature es "un
 *  refresh NUNCA borra el plan de invitado". Si no podemos saber si fue refresh o
 *  pestaña nueva por un fallo de storage, NO destruimos el plan. Trade-off: en ese
 *  entorno el plan no se auto-limpia en pestaña nueva (persiste hasta registro/
 *  logout, o hasta que el navegador limpie su storage al cerrar). */
export function isGuestTabAlive() {
    if (!sessionStorageUsable()) return true; // indeterminable → preservar
    return sessionStorage.getItem(SS_TAB_ALIVE) === '1';
}
function clearGuestTabAlive() {
    try { sessionStorage.removeItem(SS_TAB_ALIVE); } catch { /* noop */ }
}

/* [P1-GUEST-SIBLING-TAB · 2026-08-09] LATIDO COMPARTIDO ENTRE PESTAÑAS.
 *
 * EL BUG QUE CIERRA (reproducido en producción): `isGuestTabAlive()` vive en
 * sessionStorage, que es POR PESTAÑA, pero la limpieza que dispara
 * (`clearGuestModeStorage`) escribe en localStorage, que se COMPARTE. Una
 * segunda pestaña del mismo invitado arranca legítimamente sin marcador, se
 * declara "sesión nueva" y BORRA la identidad de la primera — que sigue
 * abierta y con el formulario a medio llenar. Al refrescar, la primera ya no
 * es invitado: sale a /login, el usuario vuelve por «Probar sin cuenta», eso
 * arranca un invitado NUEVO (que limpia los sensibles a propósito), y aparece
 * con los pasos normales intactos y el paso médico vacío. Exactamente el
 * síntoma reportado: «cuando actualizo la página se ve vacío».
 *
 * El chequeo confundía dos preguntas distintas: «¿esta PESTAÑA es nueva?» y
 * «¿la SESIÓN del invitado terminó?». Solo la segunda justifica borrar, y no
 * se puede responder desde sessionStorage — porque la respuesta depende de las
 * pestañas HERMANAS, y sessionStorage no las ve. Por eso el latido vive en
 * localStorage: la señal tiene que estar donde están los hermanos.
 *
 * TRADE-OFF, explícito: cerrar TODAS las pestañas y volver dentro de la
 * ventana de frescura se lee como "sigue vivo" y preserva. Es una relajación
 * deliberada y pequeña de la ventana de privacidad, a cambio de dejar de
 * destruir la sesión de una pestaña ACTIVA — que es un daño seguro y presente
 * frente a uno hipotético. El intento original protege contra "otra persona
 * abre el navegador MÁS TARDE", y eso lo sigue cubriendo.
 */
const K_HEARTBEAT = 'mealfit_guest_last_seen';
const HEARTBEAT_STALE_MS = 15000;
const HEARTBEAT_INTERVAL_MS = 5000;
let _heartbeatTimer = null;

/** Sella "hay una pestaña de invitado viva AHORA" en storage compartido. */
export function touchGuestHeartbeat() {
    safeLocalStorageSet(K_HEARTBEAT, String(Date.now()));
}

/** ¿Otra pestaña del mismo invitado sigue viva? Se consulta SOLO cuando esta
 *  pestaña no tiene marcador propio (pestaña nueva): si alguien late, esto es
 *  una hermana y adopta la sesión en vez de destruirla.
 *  Fail-safe hacia PRESERVAR, igual que `isGuestTabAlive` — un reloj torcido o
 *  un storage que no lee no deben poder borrar datos. */
export function isGuestSessionAliveElsewhere() {
    const raw = safeLocalStorageGet(K_HEARTBEAT, null);
    if (!raw) return false;            // nunca latió → no hay hermana
    const t = parseInt(raw, 10);
    if (!Number.isFinite(t)) return true;   // ilegible → preservar
    const age = Date.now() - t;
    if (age < 0) return true;          // reloj hacia atrás → preservar
    return age < HEARTBEAT_STALE_MS;
}

/** Arranca el latido periódico de ESTA pestaña. Idempotente. */
export function startGuestHeartbeat() {
    touchGuestHeartbeat();
    if (_heartbeatTimer != null) return;
    try {
        _heartbeatTimer = setInterval(touchGuestHeartbeat, HEARTBEAT_INTERVAL_MS);
        // Un intervalo no corre con la pestaña en segundo plano en móvil; al
        // volver al primer plano se sella de inmediato para no parecer muerta.
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) touchGuestHeartbeat();
        });
    } catch { /* entorno sin timers/document → sin latido, fail-safe preserva */ }
}

function stopGuestHeartbeat() {
    try { if (_heartbeatTimer != null) clearInterval(_heartbeatTimer); } catch { /* noop */ }
    _heartbeatTimer = null;
    try { localStorage.removeItem(K_HEARTBEAT); } catch { /* noop */ }
}

/** Devuelve (creando si hace falta) el session_id efímero del invitado. */
export function getGuestSessionId() {
    let sid = safeLocalStorageGet(K_SESSION, null);
    if (!sid) {
        sid = genId();
        safeLocalStorageSet(K_SESSION, sid);
    }
    return sid;
}

/** Activa modo invitado arrancando una sesión NUEVA y limpia: flag +
 *  user_id='guest' + session_id FRESCO + créditos reseteados. Cada
 *  "Probar sin cuenta" debe ser una cuenta de invitado nueva (no reusar la
 *  anterior), así que rotamos el session_id y el contador en vez de reusarlos.
 *  Devuelve el nuevo session_id. (La limpieza del formulario/plan en
 *  localStorage + state de React la hace el wrapper del AssessmentContext.) */
export function activateGuestMode() {
    safeLocalStorageSet(K_MODE, '1');
    safeLocalStorageSet(K_USER, 'guest');
    const sid = genId();
    safeLocalStorageSet(K_SESSION, sid);
    safeLocalStorageSet(K_CREDITS_USED, '0');
    markGuestTabAlive(); // [P1-GUEST-SESSION-PERSIST] esta tab queda "viva" para el invitado
    startGuestHeartbeat(); // [P1-GUEST-SIBLING-TAB] …y empieza a latir para sus hermanas
    return sid;
}

/** Créditos ya consumidos por el invitado (>= 0). */
export function getGuestCreditsUsed() {
    const raw = safeLocalStorageGet(K_CREDITS_USED, '0');
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Suma 1 al contador de créditos consumidos; devuelve el nuevo total. */
export function incrementGuestCreditsUsed() {
    const next = getGuestCreditsUsed() + 1;
    safeLocalStorageSet(K_CREDITS_USED, String(next));
    return next;
}

/** Desactiva modo invitado (al hacer login real). NO toca el session_id ni
 *  el user_id — el login real reescribe user_id; el session_id puede reusarse
 *  para correlación si hiciera falta. */
export function exitGuestMode() {
    safeLocalStorageRemove(K_MODE);
    safeLocalStorageRemove(K_CREDITS_USED);
    // [P1-GUEST-SESSION-PERSIST · 2026-06-21] TODO path de salida del invitado limpia
    // el marcador de sesión de tab, no solo clearGuestModeStorage (paridad: así
    // exitGuestSession no deja garbage stale en sessionStorage).
    clearGuestTabAlive();
}

// [P1-GUEST-KEY-HYGIENE · 2026-06-15] SSOT de las keys de localStorage de ESTA
// feature (modo invitado de PLAN). OJO: NO confundir con las del CHAT-agente
// (`mealfit_guest_session` / `mealfit_guest_sessions_list`, en AgentPage/
// ChatWidget) — son keys distintas con cleanup propio. Mantener esta lista como
// única fuente para que todo path de salida (logout real, SIGNED_OUT, login-tras-
// invitado, exitGuestSession) limpie EXACTAMENTE el mismo conjunto.
export const GUEST_PLAN_LOCALSTORAGE_KEYS = [K_MODE, K_SESSION, K_CREDITS_USED];

/** Borra TODAS las keys del modo invitado de plan (flag + session_id + créditos).
 *  Para usar en logout real / SIGNED_OUT / login-tras-invitado, dejando el
 *  dispositivo sin rastro de la identidad efímera del invitado. */
export function clearGuestModeStorage() {
    GUEST_PLAN_LOCALSTORAGE_KEYS.forEach((k) => safeLocalStorageRemove(k));
    clearGuestTabAlive(); // [P1-GUEST-SESSION-PERSIST] también el marcador de sesión de tab
    // [P1-GUEST-SIBLING-TAB · 2026-08-09] Y el latido compartido: si sobreviviera,
    // la próxima pestaña vería una hermana que ya no existe y adoptaría una
    // sesión muerta.
    stopGuestHeartbeat();
}
