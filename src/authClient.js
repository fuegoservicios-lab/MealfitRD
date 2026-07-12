// [P1-NEON-AUTH-MIGRATION · 2026-06-13] Cliente de auth = Neon Auth (Better Auth)
// via el SDK @neondatabase/neon-js (adapter compat, API drop-in). Reemplaza
// el SDK de auth anterior por completo.
//
// Por qué drop-in: el adapter expone los MISMOS métodos que el frontend ya usa
// (`signInWithPassword`, `signUp`, `signInWithOAuth`, `getSession`, `getUser`,
// `signOut`, `onAuthStateChange`, `updateUser`, `resetPasswordForEmail`), así
// que el resto del código llama `authClient.auth.X` sin necesidad de cambiar
// la lógica de negocio.
//
// Datos: el frontend NO habla con ninguna DB directamente — usa el backend
// FastAPI via `fetchWithAuth` (config/api.js). El backend valida el JWT EdDSA
// de Neon Auth contra el JWKS (backend/neon_auth.py). Por eso NO usamos la
// Data API de Neon; `createClient` la exige en su config pero su URL nunca se
// invoca (no llamamos `.from()`).
//
// Anchor: P1-NEON-AUTH
// Tests: frontend/src/__tests__/authclient_env_vars.test.js

// [P2-NEON-LAZY · 2026-07-12] El SDK (~89KB gzip) se carga vía dynamic import()
// dentro de `_getClient()`, NO estático top-level. Antes viajaba EAGER en el entry
// (con modulepreload) porque AssessmentContext —eager— importa este módulo. Ahora
// el SDK cae en un chunk async on-demand: la primera llamada a cualquier método de
// `authClient.auth.*` (o getBackendToken) lo descarga; la landing de marketing y
// las rutas públicas ya no lo pagan. Ver también vite.config (vendor-neon-auth
// removido de manualChunks — un chunk nombrado recibe modulepreload eager igual).

const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL;

if (!neonAuthUrl) {
    throw new Error(
        '[P1-NEON-AUTH] VITE_NEON_AUTH_URL es obligatoria. Setearla en .env ' +
        '(Auth Base URL de Neon Auth, p.ej. https://ep-xxx.neonauth.../neondb/auth). ' +
        'Ver frontend/.env.example.'
    );
}

// `dataApi.url` es requerido por el tipo de createClient pero NUNCA se llama
// (el frontend no usa `.from()` — todo dato va por el backend). Derivado del
// auth URL para que sea un URL válido sintácticamente.
const _dataApiUrl = neonAuthUrl.replace(/\/auth\/?$/, '') + '/rest/v1';

// [P1-NEON-AUTH-OAUTH-FIX · 2026-06-13] El `AuthAdapter` de
// @neondatabase/neon-js@0.6.2-beta implementa `signInWithPassword` pero NO
// `signInWithOAuth` (Google) — el botón de Google quedaba sin handler real
// (y un bundle viejo cacheado caía al OAuth eliminado). Lo
// implementamos nosotros sobre el endpoint social de Better Auth:
//   POST <base>/sign-in/social {provider, callbackURL} -> {url, redirect:true}
// y redirigimos a `url`. Preferimos el método nativo `auth.signIn.social` si el
// SDK lo expone; si no, caemos al REST. Verificado: el endpoint devuelve la
// `url` de init con sólo el header Origin (mealfitrd.com es trusted_origin).
async function _signInWithOAuth({ provider = 'google', options } = {}) {
    const callbackURL = options?.redirectTo
        || (typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : '/dashboard');
    // 1) Método nativo del SDK (Better Auth) si está disponible.
    try {
        const c = await _getClient();
        const a = c.auth;
        if (a?.signIn && typeof a.signIn.social === 'function') {
            const r = await a.signIn.social({ provider, callbackURL });
            const url = r?.data?.url || r?.url;
            if (url && typeof window !== 'undefined') window.location.href = url;
            return { data: r?.data ?? null, error: r?.error ?? null };
        }
    } catch {
        // fallthrough al REST
    }
    // 2) Fallback REST a Better Auth.
    try {
        const res = await fetch(`${neonAuthUrl}/sign-in/social`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // guarda la cookie de state para el callback
            body: JSON.stringify({ provider, callbackURL }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { data: null, error: { message: data?.message || `OAuth init falló (HTTP ${res.status})` } };
        }
        if (data?.url && typeof window !== 'undefined') {
            window.location.href = data.url;
            return { data, error: null };
        }
        return { data: null, error: { message: 'Neon Auth no devolvió URL de OAuth de Google.' } };
    } catch (e) {
        return { data: null, error: { message: e?.message || 'Error iniciando el login con Google.' } };
    }
}

// [P2-NEON-LAZY · 2026-07-12] Singleton lazy del cliente SDK. La primera llamada a
// cualquier método de la facade dispara el dynamic import del SDK (~89KB) UNA vez;
// las siguientes reutilizan la promesa cacheada. La inyección de signInWithOAuth
// (P1-NEON-AUTH-OAUTH-FIX) se hace aquí, tras createClient.
let _clientPromise = null;
function _getClient() {
    if (!_clientPromise) {
        _clientPromise = import('@neondatabase/neon-js').then(({ createClient, SupabaseAuthAdapter }) => {
            const c = createClient({
                auth: { url: neonAuthUrl, adapter: SupabaseAuthAdapter() },
                dataApi: { url: _dataApiUrl },
            });
            try {
                if (c?.auth && typeof c.auth.signInWithOAuth !== 'function') {
                    c.auth.signInWithOAuth = _signInWithOAuth;
                }
            } catch (e) {
                console.error('[P1-NEON-AUTH-OAUTH-FIX] no se pudo inyectar signInWithOAuth:', e);
            }
            return c;
        });
    }
    return _clientPromise;
}

// [P2-NEON-LAZY] Facade estática con el shape que el frontend ya usa
// (`authClient.auth.X`). Cada método resuelve el cliente lazy y delega. Excepción:
// onAuthStateChange DEBE devolver SÍNCRONO `{data:{subscription:{unsubscribe}}}`
// (AssessmentContext lo destructura al instante y hace unsubscribe en cleanup) →
// registra el listener real cuando la promesa resuelve; si el effect se desmonta
// antes, `cancelled` evita un listener huérfano. El estado inicial de sesión NO
// depende de este listener (el boot usa getSession por separado).
export const authClient = {
    auth: {
        getSession: (...a) => _getClient().then((c) => c.auth.getSession(...a)),
        signOut: (...a) => _getClient().then((c) => c.auth.signOut(...a)),
        signUp: (...a) => _getClient().then((c) => c.auth.signUp(...a)),
        signInWithPassword: (...a) => _getClient().then((c) => c.auth.signInWithPassword(...a)),
        updateUser: (...a) => _getClient().then((c) => c.auth.updateUser(...a)),
        signInWithOAuth: (...a) => _getClient().then((c) => c.auth.signInWithOAuth(...a)),
        getBetterAuthInstance: async () => {
            const c = await _getClient();
            return typeof c.auth.getBetterAuthInstance === 'function' ? c.auth.getBetterAuthInstance() : null;
        },
        onAuthStateChange: (cb) => {
            let realSub = null;
            let cancelled = false;
            _getClient()
                .then((c) => {
                    if (cancelled) return;
                    realSub = c.auth.onAuthStateChange(cb)?.data?.subscription ?? null;
                })
                .catch(() => { /* sin SDK no hay listener; el getSession del boot cubre el estado inicial */ });
            return { data: { subscription: { unsubscribe() { cancelled = true; realSub?.unsubscribe?.(); } } } };
        },
    },
};

// [P1-NEON-AUTH] Token EdDSA para autenticar contra el backend. El backend
// (neon_auth.verify_neon_jwt) valida este JWT contra el JWKS de Neon Auth.
// Estrategia robusta: preferimos el accesor explícito `getJWTToken()`; si no
// está disponible o no devuelve un JWT, caemos a `session.access_token` (que
// bajo el adapter de Neon Auth también es el JWT). Retorna null si no hay
// sesión — el caller maneja el 401.
export async function getBackendToken() {
    // [P2-NEON-LAZY] Resolver el cliente lazy (primer fetch autenticado descarga el
    // SDK; config/api.ts ya envuelve esto en Promise.race 10s→null→401).
    const _client = await _getClient();
    try {
        if (typeof _client.auth.getJWTToken === 'function') {
            const r = await _client.auth.getJWTToken();
            const tok = r?.data?.token || r?.token || (typeof r === 'string' ? r : null);
            if (tok && tok.split('.').length === 3) return tok;
        }
    } catch {
        // fallthrough al fallback de sesión
    }
    try {
        const { data: { session } = {} } = await _client.auth.getSession();
        const at = session?.access_token;
        if (at && at.split('.').length === 3) return at;
    } catch {
        // sin sesión válida
    }
    return null;
}

// [P1-NEON-AUTH] Verifica la contraseña ACTUAL sin tocar la sesión principal
// (reemplaza el cliente efímero de AccountSettings). Hace un sign-in
// throwaway contra el endpoint de Neon Auth: si las credenciales son válidas
// retorna true. No persiste la sesión resultante en el cliente principal.
// Retorna false ante credenciales inválidas o error de red.
export async function verifyCurrentPassword(email, password) {
    try {
        const res = await fetch(`${neonAuthUrl}/sign-in/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'omit', // no escribir cookie de sesión
        });
        return res.ok;
    } catch {
        return false;
    }
}

// [P1-EMAIL-OTP · 2026-06-21] Login SIN contraseña: código de un solo uso al
// correo (como OpenAI/Anthropic). El adapter beta de @neondatabase/neon-js NO
// expone los métodos emailOtp, así que vamos directo a los endpoints REST de
// Better Auth — verificados EN VIVO contra esta instancia de Neon (ambos
// responden 400-validación, no 404). El primer código de un correo nuevo
// AUTO-CREA la cuenta (Better Auth `disableSignUp=false`, y Neon no expone forma
// de apagarlo) → por eso NO hace falta página de registro: este flujo registra
// e inicia sesión en un solo paso.
//   POST <base>/email-otp/send-verification-otp  {email, type:"sign-in"}
//   POST <base>/sign-in/email-otp                {email, otp}
// `/sign-in/email-otp` setea la cookie de sesión de Neon (credentials:include),
// IGUAL que signInWithPassword → un full reload propaga la sesión (getSession +
// mint first-party), sin tocar el resto de la plomería de auth.

// Paso 1 — pide el código al correo. type "sign-in" sirve para nuevos y existentes.
export async function sendEmailOtp(email) {
    const clean = (email || '').trim();
    try {
        const res = await fetch(`${neonAuthUrl}/email-otp/send-verification-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: clean, type: 'sign-in' }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return { error: { message: data?.message || `No se pudo enviar el código (HTTP ${res.status})`, status: res.status } };
        }
        return { error: null };
    } catch (e) {
        return { error: { message: e?.message || 'Error de red enviando el código.' } };
    }
}

// Paso 2 — verifica el código e inicia sesión (auto-registra si es nuevo).
export async function signInWithEmailOtp(email, otp) {
    const clean = (email || '').trim();
    const code = (otp || '').trim();
    try {
        const res = await fetch(`${neonAuthUrl}/sign-in/email-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // setea la cookie de sesión de Neon
            body: JSON.stringify({ email: clean, otp: code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { data: null, error: { message: data?.message || 'Código inválido o expirado.', status: res.status } };
        }
        return { data, error: null };
    } catch (e) {
        return { data: null, error: { message: e?.message || 'Error de red verificando el código.' } };
    }
}
