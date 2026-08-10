// [LOGIN-100-AUTH-ERRORS · 2026-06-18] Traduce errores crudos de auth (Better Auth /
// red) a mensajes es-DO accionables. Antes Login/Register hacían setError(err.message)
// para el fallback → un usuario es-DO veía "Failed to fetch" / "NetworkError" en inglés
// ante una caída de red. Helper compartido por Login/Register/ResetPassword.
export function humanizeAuthError(err) {
    const raw = (err && err.message) || (typeof err === 'string' ? err : '') || '';
    const lower = raw.toLowerCase();

    // [P1-AUTH-TIMEOUT · 2026-08-10] Venció el plazo de la petición. Va ANTES del
    // chequeo de red porque `navigator.onLine` dice `true` en el caso que nos ocupa:
    // el móvil está conectado a una red que no transporta (portal cautivo, celda
    // saturada). Decirle «revisa tu conexión» a quien ve todas las rayas de señal no
    // ayuda; lo accionable es que reintente.
    if (err?.code === 'request_timeout' || err?.name === 'TimeoutError') {
        return 'La conexión tardó demasiado. Inténtalo de nuevo.';
    }

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

    // [P1-AUTH-ERRORS-ES · 2026-08-10] El último recurso YA NO devuelve el mensaje crudo.
    //
    // `return raw` dejaba pasar a la pantalla cualquier texto del proveedor —en inglés—
    // a un usuario dominicano: «Failed to fetch», «Invalid session», o un volcado con el
    // código HTTP interpolado. Un mensaje que el usuario no entiende no es un mensaje: es
    // ruido que además da sensación de app rota justo en la primera pantalla.
    //
    // Se clasifica por FAMILIA (lo que el usuario puede hacer al respecto) y el crudo va
    // a la consola, donde Sentry lo recoge: la información de diagnóstico no se pierde,
    // simplemente deja de mostrarse a quien no puede usarla.
    if (raw) {
        try { console.error('[auth] error crudo:', raw); } catch { /* noop */ }
    }

    // Pero un mensaje que YA viene en español y ya es accionable se respeta tal cual.
    // Nuestro propio backend envía copy bueno («Código inválido o expirado.») y
    // sustituirlo por un genérico sería una pérdida de información para el usuario:
    // el objetivo de esta rama es frenar el inglés y los volcados técnicos, no
    // uniformar todo hacia abajo. Se detecta por marcas inequívocas del español y por
    // la ausencia de la jerga que sí queremos ocultar.
    const pareceEspanol = /[áéíóúüñ¿¡]/i.test(raw)
        || /\b(no|se|de|el|la|los|las|tu|tus|por|para|con|inténtalo|intenta|revisa|correo|código|contraseña|sesión|cuenta)\b/i.test(raw);
    const pareceTecnico = /https?:\/\/|\bhttp \d{3}\b|\{|\}|stack|undefined|null|exception|error:/i.test(raw);
    if (raw && pareceEspanol && !pareceTecnico && raw.length <= 160) {
        return raw;
    }
    if (/5\d\d|server error|internal/.test(lower)) {
        return 'Nuestro servidor tuvo un problema. Inténtalo de nuevo en un momento.';
    }
    if (/401|403|unauthor|forbidden|invalid session|session expired/.test(lower)) {
        return 'Tu sesión no es válida. Vuelve a empezar el inicio de sesión.';
    }
    if (/400|invalid|malformed|bad request/.test(lower)) {
        return 'Revisa los datos e inténtalo de nuevo.';
    }
    return 'Ocurrió un error. Inténtalo de nuevo.';
}
