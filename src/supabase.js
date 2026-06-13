// [P1-NEON-AUTH-MIGRATION · 2026-06-13] Cliente de auth = Neon Auth (Better Auth)
// via el SDK @neondatabase/neon-js con `SupabaseAuthAdapter` (API compatible con
// supabase-js). Reemplaza @supabase/supabase-js por completo.
//
// Por qué drop-in: el adapter expone los MISMOS métodos que el frontend ya usa
// (`signInWithPassword`, `signUp`, `signInWithOAuth`, `getSession`, `getUser`,
// `signOut`, `onAuthStateChange`, `updateUser`, `resetPasswordForEmail`), así
// que conservamos el nombre `supabase` y el resto del código no cambia sus
// llamadas `supabase.auth.X`.
//
// Datos: el frontend NO habla con ninguna DB directamente — usa el backend
// FastAPI via `fetchWithAuth` (config/api.js). El backend valida el JWT EdDSA
// de Neon Auth contra el JWKS (backend/neon_auth.py). Por eso NO usamos la
// Data API de Neon; `createClient` la exige en su config pero su URL nunca se
// invoca (no llamamos `.from()`).
//
// Anchor: P1-NEON-AUTH-MIGRATION
// Tests: frontend/src/__tests__/supabase_env_vars.test.js

import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';

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

const _client = createClient({
    auth: { url: neonAuthUrl, adapter: SupabaseAuthAdapter() },
    dataApi: { url: _dataApiUrl },
});

// [P1-NEON-AUTH-OAUTH-FIX · 2026-06-13] El `SupabaseAuthAdapter` de
// @neondatabase/neon-js@0.6.2-beta implementa `signInWithPassword` pero NO
// `signInWithOAuth` (Google) — el botón de Google quedaba sin handler real
// (y un bundle viejo cacheado caía al OAuth del Supabase eliminado). Lo
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
        const a = _client.auth;
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

// Inyecta signInWithOAuth en el adapter si falta (preserva `this` del cliente).
try {
    if (_client?.auth && typeof _client.auth.signInWithOAuth !== 'function') {
        _client.auth.signInWithOAuth = _signInWithOAuth;
    }
} catch (e) {
    // auth inmutable: improbable; el botón mostraría el error de su try/catch.
    console.error('[P1-NEON-AUTH-OAUTH-FIX] no se pudo inyectar signInWithOAuth:', e);
}

// Drop-in: el resto del frontend usa `supabase.auth.X` sin cambios.
export const supabase = _client;

// [P1-NEON-AUTH] Token EdDSA para autenticar contra el backend. El backend
// (neon_auth.verify_neon_jwt) valida este JWT contra el JWKS de Neon Auth.
// Estrategia robusta: preferimos el accesor explícito `getJWTToken()`; si no
// está disponible o no devuelve un JWT, caemos a `session.access_token` (que
// bajo el adapter Supabase-compat también es el JWT). Retorna null si no hay
// sesión — el caller maneja el 401.
export async function getBackendToken() {
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
// (reemplaza el cliente Supabase efímero de AccountSettings). Hace un sign-in
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
