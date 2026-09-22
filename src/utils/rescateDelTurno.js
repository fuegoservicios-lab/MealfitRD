// [P1-PLAN-LOTE-156 · 2026-09-22] ¿Hay un turno que rescatar del servidor?
//
// El chat ya sabía rescatar un turno huérfano: sondea `/api/chat/history` y, si el servidor
// va por delante, adopta la respuesta. Lo que decidía CUÁNDO arrancar era una línea suelta
// dentro del efecto — «el último mensaje es del usuario» — y eso solo ocurre tras un refresh,
// porque el estado local muere con la página.
//
// El caso de móvil no entraba: si el stream se corta EN VIVO (el tester cambia de app 20 s y
// el sistema mata el `fetch`), el `catch` deja una burbuja de error, así que el último mensaje
// ya no es del usuario. Mientras tanto el backend TERMINA el turno y GUARDA la respuesta — el
// `done` del generador persiste aunque el cliente se haya ido. La respuesta existía, estaba
// pagada, y el usuario veía «Sin conexión»; si pulsaba Reintentar, se cobraba otro mensaje de
// su cuota y al recargar aparecían las dos respuestas.
//
// La decisión vive aquí, como función pura, por la misma razón que `decidirArrastreConTeclado`
// o `decidirAvisoNativo`: un predicado con cinco casos dentro de un `useEffect` no se puede
// probar, y este tiene que decir que NO en cuatro de ellos.

/** Estados HTTP que significan «se cortó la conexión», los únicos en los que el servidor pudo
 *  haber terminado igual: 0 = fallo de red del `fetch`; 502 = el stream murió sin su `done`.
 *  Un 402 de cuota o un 413 nunca llegaron al modelo: no hay nada que rescatar. */
export const ESTADOS_DE_CORTE = [0, 502];

/**
 * @param {object[]} mensajes            la conversación tal como se ve
 * @param {boolean}  ocupado             hay un turno en vuelo (`isLoading`)
 * @param {boolean}  cargandoHistorial   se está repintando desde el servidor
 * @param {boolean}  enLinea             `navigator.onLine`; sin red el sondeo tampoco llegaría
 *                                       y la burbuja de «sin conexión» ya dice la verdad
 * @returns {boolean} true si merece la pena preguntarle al servidor por la respuesta
 */
export function hayTurnoQueRescatar({ mensajes, ocupado, cargandoHistorial, enLinea = true }) {
    if (ocupado || cargandoHistorial) return false;
    const lista = Array.isArray(mensajes) ? mensajes : [];
    const ultimo = lista[lista.length - 1];
    if (!ultimo) return false;

    // Los «reales» son los que cuentan como conversación: fuera el saludo de bienvenida, las
    // burbujas de error y las de un turno detenido a mano.
    const reales = lista.filter((m) => m && !m.isWelcome && !m._isErrorBubble && !m._stoppedByUser);
    const ultimoReal = reales[reales.length - 1];
    if (!ultimoReal || ultimoReal.role !== 'user') return false;

    // El caso de siempre: el mensaje del usuario es lo último que hay (refresh a media
    // respuesta). Se compara por IDENTIDAD, no por rol: si detrás hay una burbuja de STOP, el
    // usuario ya dijo que no quería la respuesta.
    if (ultimo === ultimoReal) return true;

    // El caso nuevo: lo último es una burbuja de error de CONEXIÓN sobre ese mensaje.
    return Boolean(
        ultimo._isErrorBubble
        && ESTADOS_DE_CORTE.includes(ultimo.errorStatus)
        && enLinea !== false,
    );
}
