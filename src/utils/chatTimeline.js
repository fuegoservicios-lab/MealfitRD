// [P2-CHAT-TIMELINE · 2026-09-03] Fecha y hora en el hilo del coach. Antes ningún mensaje llevaba
// marca de tiempo ni había separadores de día: en una charla de semanas no sabías cuándo dijiste
// algo. Funciones puras (reciben `t` y `formatDate`) para que el separador se calcule igual en el
// render simple y en el virtualizado, y se pueda probar sin React.

/** Fecha del mensaje: `created_at` (ISO del backend o del cliente) o `welcomeAt` (ms) del saludo. */
export function messageDate(msg) {
    const raw = msg?.created_at ?? msg?.welcomeAt ?? null;
    if (raw === null || raw === undefined || raw === '') return null;
    const d = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Etiqueta del separador de día que va ENCIMA de `msg`, o `null` si no toca (mismo día que el
 * mensaje anterior, o sin fecha). «Hoy» / «Ayer» / «lunes, 24 de agosto» / «24 de agosto de 2025».
 */
export function daySeparatorLabel(msg, prevMsg, { t, formatDate, now = new Date() } = {}) {
    const d = messageDate(msg);
    if (!d) return null;
    const p = prevMsg ? messageDate(prevMsg) : null;
    if (p && dayKey(p) === dayKey(d)) return null;
    const key = dayKey(d);
    if (key === dayKey(now)) return t('Hoy');
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === dayKey(yesterday)) return t('Ayer');
    const sameYear = d.getFullYear() === now.getFullYear();
    return formatDate(d, sameYear
        ? { weekday: 'long', day: 'numeric', month: 'long' }
        : { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Último mensaje ANTERIOR a `index` que tenga fecha. Las burbujas locales de error («⏹ Detenido»,
 * «la respuesta no llegó») no llevan fecha: si se tomara el inmediato anterior, el mensaje
 * siguiente volvería a pintar «Hoy» (visto el 2026-09-03: dos «HOY» en el mismo hilo).
 */
export function previousDatedMessage(messages, index) {
    for (let i = index - 1; i >= 0; i -= 1) {
        if (messageDate(messages[i])) return messages[i];
    }
    return null;
}

/** «14:32» en el locale activo, o '' si el mensaje no trae fecha. */
export function timeLabel(msg, formatDate) {
    const d = messageDate(msg);
    return d ? formatDate(d, { hour: '2-digit', minute: '2-digit' }) : '';
}
