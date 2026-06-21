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

/** Créditos que le quedan al invitado. */
export function getGuestCreditsRemaining() {
    return Math.max(0, GUEST_PLAN_CREDITS - getGuestCreditsUsed());
}

/** Desactiva modo invitado (al hacer login real). NO toca el session_id ni
 *  el user_id — el login real reescribe user_id; el session_id puede reusarse
 *  para correlación si hiciera falta. */
export function exitGuestMode() {
    safeLocalStorageRemove(K_MODE);
    safeLocalStorageRemove(K_CREDITS_USED);
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
}
