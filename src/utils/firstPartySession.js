// [P1-FIRST-PARTY-SESSION · 2026-06-16] Sesión first-party que emite NUESTRO
// backend (mealfitrd.com) para que iOS PWA conserve la sesión al cerrar la app.
//
// Neon Auth sirve su cookie de sesión en su PROPIO dominio (third-party); iOS la
// borra al cerrar la app. Esta capa emite, en nuestro backend, un token de
// sesión propio (JWT HS256 verificado server-side). Persistencia:
//   - cookie `__Host-mf_session` (funciona en navegador), Y
//   - **localStorage `mealfit_mf_session`** → enviado por el header `X-MF-Session`.
// localStorage es lo único que los PWA standalone de iOS persisten de forma
// confiable entre lanzamientos (sus cookies NO se conservan). El header solo lo
// añade JS (el browser no lo manda solo) → inmune a CSRF.

import { api, fetchWithAuth } from '../config/api';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './safeLocalStorage';
// [P1-FORM-KEY · 2026-06-21] La llave estable de cifrado del form viaja en las
// respuestas de /api/auth/session y /me; la empujamos al storage seguro.
import { setFormCryptoSecret } from '../config/secureFormStorage';

const MF_SESSION_KEY = 'mealfit_mf_session';

// [P1-FORM-KEY · 2026-06-21] Evento que avisa que llegó la llave estable (async,
// del backend) → AssessmentContext re-hidrata el form sensible con ella. Necesario
// en el path de Neon (donde el mint es fire-and-forget y puede llegar DESPUÉS de
// la primera hidratación). En el path first-party la llave llega antes (en /me).
export const FORM_KEY_READY_EVENT = 'mealfit:form-key-ready';

function _applyFormKey(data) {
    const key = (data && data.form_key) || null;
    const changed = setFormCryptoSecret(key);
    if (changed && key && typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent(FORM_KEY_READY_EVENT)); } catch { /* SSR */ }
    }
}

export function getStoredMfSession() {
    return safeLocalStorageGet(MF_SESSION_KEY, null);
}

function _storeToken(token) {
    if (token) safeLocalStorageSet(MF_SESSION_KEY, token);
}

export function clearStoredMfSession() {
    safeLocalStorageRemove(MF_SESSION_KEY);
}

// Tras un login REAL de Neon (Bearer vivo): emite la cookie + guarda el token en
// localStorage. fetchWithAuth adjunta el Bearer EdDSA que el backend exige.
export async function mintFirstPartySession() {
    try {
        const res = await fetchWithAuth('/api/auth/session', { method: 'POST' });
        if (!res || !res.ok) return false;
        const data = await res.json().catch(() => null);
        if (data && data.token) _storeToken(data.token);
        _applyFormKey(data);
        return !!(data && data.ok);
    } catch {
        return false;
    }
}

// Estado de la sesión first-party (al reabrir, cuando Neon ya no tiene sesión).
// Manda el token de localStorage por X-MF-Session (la cookie del PWA iOS no
// persiste). Devuelve { user_id, ... } o null. Re-guarda el token re-emitido.
export async function checkFirstPartySession() {
    const tok = getStoredMfSession();
    try {
        const headers = {};
        if (tok) headers['X-MF-Session'] = tok;
        const res = await fetch(api('/api/auth/me'), {
            method: 'GET',
            credentials: 'include',
            headers,
        });
        if (!res || !res.ok) {
            // 401 → token/cookie inválidos o expirados: limpiar el stale.
            if (res && res.status === 401) clearStoredMfSession();
            return null;
        }
        const data = await res.json().catch(() => null);
        if (!data || !data.user_id) return null;
        if (data.token) _storeToken(data.token); // sliding refresh
        _applyFormKey(data);
        return data;
    } catch {
        return null;
    }
}

// Cierra la sesión first-party: borra el token local + la cookie del servidor.
export async function logoutFirstPartySession() {
    clearStoredMfSession();
    // [P1-FORM-KEY · 2026-06-21] Olvidar la llave estable del usuario que sale (per-user;
    // el próximo login setea la suya). Defensa: no dejar la llave de A en memoria para B.
    setFormCryptoSecret(null);
    try {
        await fetch(api('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    } catch {
        /* best-effort: el teardown local ya basta */
    }
}
