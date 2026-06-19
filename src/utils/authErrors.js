// [LOGIN-100-AUTH-ERRORS · 2026-06-18] Traduce errores crudos de auth (Better Auth /
// red) a mensajes es-DO accionables. Antes Login/Register hacían setError(err.message)
// para el fallback → un usuario es-DO veía "Failed to fetch" / "NetworkError" en inglés
// ante una caída de red. Helper compartido por Login/Register/ResetPassword.
export function humanizeAuthError(err) {
    const raw = (err && err.message) || (typeof err === 'string' ? err : '') || '';
    const lower = raw.toLowerCase();

    // Red caída / fetch fallido → mensaje claro de conexión.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return 'No pudimos conectar. Revisa tu conexión a internet e inténtalo de nuevo.';
    }
    if (/failed to fetch|networkerror|network error|load failed|fetch failed|network request failed/.test(lower)) {
        return 'No pudimos conectar. Revisa tu conexión a internet e inténtalo de nuevo.';
    }

    // Credenciales inválidas (sin filtrar si el correo existe — anti user-enumeration).
    if (/invalid login credentials|invalid email or password|invalid credentials|incorrect (email|password)/.test(lower)) {
        return 'Correo o contraseña incorrectos.';
    }

    // Rate limit.
    if (/rate limit|too many|demasiad/.test(lower)) {
        return 'Demasiados intentos. Por favor, espera un momento e inténtalo de nuevo.';
    }

    return raw || 'Ocurrió un error. Inténtalo de nuevo.';
}
