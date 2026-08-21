// [LOGIN-100-AUTH-ERRORS · 2026-06-18] Traduce errores crudos de auth (Better Auth /
// red) a mensajes accionables. Antes Login/Register hacían setError(err.message)
// para el fallback → un usuario es-DO veía "Failed to fetch" / "NetworkError" en inglés
// ante una caída de red. Helper compartido por Login/Register/ResetPassword.
//
// [P1-I18N-AUTH-COPY · 2026-08-21] Y ahora en los cinco idiomas.
//
// Este fichero tenía CERO imports y nueve `return` de literal español, en un formulario
// cuyos 27 textos restantes ya pasaban por `t()`. Era el único trozo en español de esa
// pantalla y aparecía justo cuando algo va mal: la primera impresión de un usuario
// anglófono que se equivoca de contraseña era un mensaje que no entiende.
//
// La función de traducción es OPCIONAL, mismo contrato que `config/plans.js`: sin ella
// esto se comporta exactamente como antes (útil para tests y para código no-React). Las
// llamadas van con la cadena española LITERAL aquí dentro para que el extractor de
// `i18n-check` las vea; no es ámbito de módulo —están dentro de la función— así que no
// aplica la trampa del congelado.
//
// Ojo al escribir comentarios en este fichero: el extractor de claves NO filtra
// comentarios, y lo hace a propósito (vaciarlos antes de extraer volvería huérfana una
// clave citada sólo en prosa). Así que citar una llamada de ejemplo con una cadena
// dentro la REGISTRA como clave viva y rompe el gate. Pasó al escribir este mismo
// bloque: el ejemplo que ilustraba la regla inventó la clave `...`.
export function humanizeAuthError(err, traducir, locale) {
    const raw = (err && err.message) || (typeof err === 'string' ? err : '') || '';
    const lower = raw.toLowerCase();
    // El alias se llama `t` A PROPOSITO, no `tr`: el extractor de i18n-check busca
    // literalmente `t(` para recolectar claves vivas. Con cualquier otro nombre las
    // dieciseis cadenas de este fichero entrarian en los catalogos como HUERFANAS —
    // medido: eso fue exactamente lo que paso en el primer intento.
    const t = typeof traducir === 'function' ? traducir : (s) => s;

    // [P1-AUTH-TIMEOUT · 2026-08-10] Venció el plazo de la petición. Va ANTES del
    // chequeo de red porque `navigator.onLine` dice `true` en el caso que nos ocupa:
    // el móvil está conectado a una red que no transporta (portal cautivo, celda
    // saturada). Decirle «revisa tu conexión» a quien ve todas las rayas de señal no
    // ayuda; lo accionable es que reintente.
    if (err?.code === 'request_timeout' || err?.name === 'TimeoutError') {
        return t('La conexión tardó demasiado. Inténtalo de nuevo.');
    }

    // Red caída / fetch fallido → mensaje claro de conexión.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return t('No pudimos conectar. Revisa tu conexión a internet e inténtalo de nuevo.');
    }
    if (/failed to fetch|networkerror|network error|load failed|fetch failed|network request failed/.test(lower)) {
        return t('No pudimos conectar. Revisa tu conexión a internet e inténtalo de nuevo.');
    }

    // Credenciales inválidas (sin filtrar si el correo existe — anti user-enumeration).
    if (/invalid login credentials|invalid email or password|invalid credentials|incorrect (email|password)/.test(lower)) {
        return t('Correo o contraseña incorrectos.');
    }

    // Rate limit.
    if (/rate limit|too many|demasiad/.test(lower)) {
        return t('Demasiados intentos. Por favor, espera un momento e inténtalo de nuevo.');
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

    // Un mensaje NUESTRO se respeta tal cual: nuestro propio copy es bueno y accionable
    // («Código inválido o expirado.»), y sustituirlo por un genérico sería perder
    // información que el usuario sí puede usar.
    //
    // [P1-I18N-AUTH-COPY · 2026-08-21] Antes esto se decidía OLFATEANDO el idioma del
    // mensaje: si «parecía español», pasaba. Ese heurístico tenía dos problemas al
    // encender los idiomas. Uno, nuestros propios emisores (`authClient.js`,
    // `firstPartySession.js`) ahora mandan el texto YA traducido, así que en francés
    // dejaban de «parecer español» y degradaban a genérico — perdiendo justo la
    // precisión que la rama existe para conservar. Y dos, un mensaje español del
    // servidor mostrado a alguien que lee francés reproduce el bug que esta función
    // se escribió para cerrar.
    //
    // Se sustituye por un CONTRATO: quien emite el mensaje declara que es suyo con
    // `mfCopy`. Es la misma lección que P1-DIET-CANON-SSOT deja escrita — una
    // propiedad del dato es más fiable que adivinarla mirándolo.
    if (err?.mfCopy && raw) {
        return raw;
    }

    // El heurístico se conserva SOLO para locale español, y solo como red para los
    // emisores que aún no declaran `mfCopy`. En cualquier otro idioma un texto español
    // suelto no es un mensaje: es ruido, y se clasifica como el resto.
    const esEspanol = !locale || String(locale).toLowerCase().startsWith('es');
    if (esEspanol) {
        const pareceEspanol = /[áéíóúüñ¿¡]/i.test(raw)
            || /\b(no|se|de|el|la|los|las|tu|tus|por|para|con|inténtalo|intenta|revisa|correo|código|contraseña|sesión|cuenta)\b/i.test(raw);
        const pareceTecnico = /https?:\/\/|\bhttp \d{3}\b|\{|\}|stack|undefined|null|exception|error:/i.test(raw);
        if (raw && pareceEspanol && !pareceTecnico && raw.length <= 160) {
            return raw;
        }
    }

    if (/5\d\d|server error|internal/.test(lower)) {
        return t('Nuestro servidor tuvo un problema. Inténtalo de nuevo en un momento.');
    }
    if (/401|403|unauthor|forbidden|invalid session|session expired/.test(lower)) {
        return t('Tu sesión no es válida. Vuelve a empezar el inicio de sesión.');
    }
    if (/400|invalid|malformed|bad request/.test(lower)) {
        return t('Revisa los datos e inténtalo de nuevo.');
    }
    return t('Ocurrió un error. Inténtalo de nuevo.');
}
