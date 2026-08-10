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

// [P1-AUTH-TIMEOUT · 2026-08-10] Plazo en las 4 llamadas de sesion: sin el, una
// conexion colgada dejaba «Verificando…» eterno tras teclear el codigo.
import { fetchWithTimeout, AUTH_BEST_EFFORT_TIMEOUT_MS } from './fetchWithTimeout';
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
    // [NO-401-NOISE · 2026-06-23] Sin token first-party en localStorage NO hay sesión
    // que restaurar → no pegamos a /api/auth/me. El token se guarda SIEMPRE al mint
    // (cookie + localStorage en sync), así que su ausencia ⇒ visitante no logueado.
    // Evita el 401 rojo y ruidoso en consola (p.ej. al abrir la Política desde el
    // link del login sin sesión). Caso raro cookie-sin-localStorage: el usuario
    // simplemente vuelve a iniciar sesión (sin pérdida de datos).
    if (!tok) return null;
    try {
        const headers = {};
        if (tok) headers['X-MF-Session'] = tok;
        const res = await fetchWithTimeout(api('/api/auth/me'), {
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

// [P1-OTP-FIRST-PARTY · 2026-07-03] Verifica el código OTP vía NUESTRO backend
// (que lo valida contra Neon server-side) y adopta la sesión first-party que
// este emite (cookie __Host-mf_session + token→localStorage + form_key). El
// fetch directo del navegador a Neon seteaba una cookie third-party vía XHR que
// los navegadores móviles bloquean → "pongo el código y no entro". Same-origin
// aquí ⇒ la cookie SIEMPRE pega; el provider resuelve vía _resolveViaFirstParty.
export async function verifyEmailOtpFirstParty(email, otp) {
    try {
        const res = await fetchWithTimeout(api('/api/auth/email-otp/verify'), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: (email || '').trim(), otp: (otp || '').trim() }),
        });
        if (!res.ok) {
            const msg = res.status === 401
                ? 'Código inválido o expirado.'
                : `No se pudo verificar el código (HTTP ${res.status}).`;
            return { error: { message: msg, status: res.status } };
        }
        const data = await res.json().catch(() => null);
        if (!data || !data.ok || !data.user_id) {
            return { error: { message: 'Código inválido o expirado.' } };
        }
        if (data.token) _storeToken(data.token);
        _applyFormKey(data);
        return { data, error: null };
    } catch (e) {
        return { error: { message: e?.message || 'Error de red verificando el código.', code: e?.code, name: e?.name } };
    }
}

// [P1-OAUTH-CHALLENGE-COOKIE · 2026-08-10] EL CANJE VUELVE AL NAVEGADOR.
//
// LA VERSIÓN ANTERIOR NO PODÍA FUNCIONAR, Y LOS LOGS LO GRITABAN: 24 intentos,
// 0 éxitos, todos HTTP 400, desde el 11 de julio. Mandaba el verifier a NUESTRO
// backend para que lo canjeara server-side; medido contra Neon, ese canje
// responde:
//     {"code":"SESSION_CHALLENGE_COOKIE_NOT_FOUND"}
// El verifier NO es autosuficiente: va emparejado a una cookie
// `__Secure-neon-auth.session_challange` que Neon deja EN EL NAVEGADOR y en SU
// dominio. Un servidor nunca la tendrá — ni reintentando, ni con más plazo.
// Comprobado con la misma petición y el mismo verifier inválido: sin la cookie
// da SESSION_CHALLENGE_COOKIE_NOT_FOUND; con ella, VERIFICATION_NOT_FOUND (o
// sea, ya pasó ese control y solo se queja del verifier de prueba).
//
// Por eso el canje se hace aquí, donde la cookie vive. Lo que SÍ se conserva del
// diseño anterior es lo importante: el backend sigue siendo quien decide. No
// confiamos en lo que diga el cliente — le mandamos el token y él lo valida
// contra el JWKS de Neon antes de emitir `__Host-mf_session`.
//
// FAIL-OPEN EN CADA PASO: si el canje falla, si no hay token, o si el backend lo
// rechaza, devolvemos false y el flujo cae al camino de siempre (el SDK con sus
// reintentos). Este arreglo no puede dejar a nadie peor de lo que ya estaba.
const _neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL;

/** Extrae el JWT de las formas plausibles con las que Neon devuelve la sesión. */
function _tokenDeSesion(data) {
    const t = data?.session?.token
        || data?.session?.access_token
        || data?.token
        || data?.access_token
        || null;
    // Solo sirve si ES un JWT: el backend lo valida contra el JWKS. Un token
    // opaco lo rechazaría, así que preferimos caer al Bearer del SDK.
    return (typeof t === 'string' && t.split('.').length === 3) ? t : null;
}

export async function adoptOAuthVerifierFirstParty(verifier) {
    const v = (verifier || '').trim();
    if (!v || !_neonAuthUrl) return false;

    // ── PASO 1: canjear el verifier CONTRA NEON, desde el navegador ──────────
    // `credentials: 'include'` es lo que hace viajar la cookie de challenge; es
    // el único motivo por el que esta petición sale de aquí y no del servidor.
    let tokenNeon = null;
    try {
        const url = `${_neonAuthUrl}/get-session?neon_auth_session_verifier=${encodeURIComponent(v)}`;
        const r = await fetchWithTimeout(url, { method: 'GET', credentials: 'include' });
        if (r.ok) {
            tokenNeon = _tokenDeSesion(await r.json().catch(() => null));
        }
    } catch {
        /* fail-open: seguimos al paso 2 por si el SDK ya tiene sesión */
    }

    // ── PASO 2: que NUESTRO backend emita la sesión de primera parte ─────────
    // Con el token recién canjeado si lo tenemos (no depende del SDK, que puede
    // no haberse enterado del canje); si no, con el Bearer que el SDK resuelva
    // —tras el paso 1 la cookie de sesión de Neon ya existe, así que suele poder—.
    // Se usa `/oauth/adopt` y no `/session` (que hace lo mismo) para conservar el
    // CONTADOR POR FLUJO: es el único log que dice si un retorno de Google acabó
    // en sesión. Ese contador llevaba 0 éxitos de 24 sin que nadie lo mirara.
    try {
        const res = tokenNeon
            ? await fetchWithTimeout(api('/api/auth/oauth/adopt'), {
                method: 'POST',
                credentials: 'include',
                headers: { Authorization: `Bearer ${tokenNeon}`, 'Content-Type': 'application/json' },
                body: '{}',
            })
            : await fetchWithAuth('/api/auth/oauth/adopt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            });
        if (!res || !res.ok) return false;
        const data = await res.json().catch(() => null);
        if (!data || !data.ok) return false;
        if (data.token) _storeToken(data.token);
        _applyFormKey(data);
        return true;
    } catch {
        return false;
    }
}

// Cierra la sesión first-party: borra el token local + la cookie del servidor.
export async function logoutFirstPartySession() {
    clearStoredMfSession();
    // [P1-FORM-KEY · 2026-06-21] Olvidar la llave estable del usuario que sale (per-user;
    // el próximo login setea la suya). Defensa: no dejar la llave de A en memoria para B.
    setFormCryptoSecret(null);
    try {
        await fetchWithTimeout(api('/api/auth/logout'), { method: 'POST', credentials: 'include' }, AUTH_BEST_EFFORT_TIMEOUT_MS);
    } catch {
        /* best-effort: el teardown local ya basta */
    }
}
