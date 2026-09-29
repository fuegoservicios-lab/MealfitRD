// [P1-PLAN-LOTE-844 · 2026-09-29] La cabecera del permiso del INVITADO. `fetchWithAuth` (config/api.ts) la pide solo
// para las peticiones SIN sesión, e importa este módulo al hacer falta: el arranque tiene un techo de 148 kB gz
// (`scripts/presupuestos.mjs`) y nada del permiso hace falta antes de pintar.
import { safeLocalStorageGet, safeLocalStorageRemove } from '../utils/safeLocalStorage';
import { AI_CONSENT_HEADER, AI_CONSENT_STORAGE_KEY, AI_CONSENT_VERSION } from './version';

/** Quién usa el dispositivo AHORA, con la forma de `quien`: 'cuenta:<uid>', 'invitado:<session_id>' o null.
 *  El permiso es de una persona: el de un invitado no vale para una cuenta (ni al revés), y tampoco para el siguiente
 *  «Probar sin cuenta», que es otra sesión. */
export function titularDelDispositivo() {
    const uid = safeLocalStorageGet('mealfit_user_id', null);
    if (uid && uid !== 'guest') return `cuenta:${uid}`;
    const sid = safeLocalStorageGet('mealfit_guest_session_id', null);
    return sid ? `invitado:${sid}` : null;
}

/** El permiso del INVITADO que usa el dispositivo ahora, si es de la versión vigente; si no, null. Una cuenta nunca
 *  tiene uno (su permiso manda en el servidor). Uno de OTRA versión, o de otra sesión de invitado, se borra al leerlo. */
export function permisoLocalVigente() {
    const crudo = safeLocalStorageGet(AI_CONSENT_STORAGE_KEY, null);
    if (!crudo) return null;
    let r = null;
    try {
        r = JSON.parse(crudo);
    } catch {
        r = null;
    }
    if (!r || typeof r !== 'object' || r.v !== AI_CONSENT_VERSION || typeof r.quien !== 'string' || !r.quien.startsWith('invitado:')) {
        safeLocalStorageRemove(AI_CONSENT_STORAGE_KEY);
        return null;
    }
    const titular = titularDelDispositivo();
    if (r.quien === titular) return r;
    // [ronda 1] Otro invitado usa el dispositivo (un «Probar sin cuenta» nuevo): el permiso del anterior no es suyo y
    // no debe quedar a mano. Con una cuenta se deja: su `session_id` todavía puede hacer falta para la adopción.
    if (titular && titular.startsWith('invitado:')) safeLocalStorageRemove(AI_CONSENT_STORAGE_KEY);
    return null;
}

/** `[nombre, valor]` de la cabecera si el invitado que usa el dispositivo tiene permiso vigente; si no, null. Solo se
 *  pregunta para peticiones SIN sesión: una cuenta nunca la manda. */
export function cabeceraDelInvitado() {
    return permisoLocalVigente() ? [AI_CONSENT_HEADER, AI_CONSENT_VERSION] : null;
}
