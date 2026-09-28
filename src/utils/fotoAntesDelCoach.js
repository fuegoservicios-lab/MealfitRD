// [P1-PLAN-LOTE-690 · 2026-09-28] Las dudas de la foto se contestan ANTES de que hable el coach.
//
// El dueño mandó «Mi cena» con la foto y el coach contestó enseguida, sin las respuestas (le propuso OTRA cena); al tocar
// «2 huevos · Maduro» el segundo turno ya no veía la foto («¿Ya te los comiste?»). Dos mensajes del cupo y nada en el
// contador. Ahora, si la foto trae dudas, el chat las enseña primero y manda UN turno con la foto, el texto y las
// respuestas (`vision.respuestas` + `vision.ajuste`, que el servidor aplica a la estimación: backend/respuestas_de_la_foto.py).
// Puro: la página decide cuándo, esto dice qué.
import { mensajeDeRespuestas } from './dudasDeLaFoto';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from './safeLocalStorage';

const MACROS = ['calories', 'protein', 'carbs', 'healthy_fats'];

/** Cuánto cambia el plato entero con las opciones elegidas (suma de sus ajustes; la supuesta vale 0). */
export function ajusteDeRespuestas(dudas, elegidas) {
    const total = { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 };
    (Array.isArray(dudas) ? dudas : []).forEach((d, i) => {
        const o = d?.opciones?.[elegidas?.[i]];
        MACROS.forEach((k) => {
            const v = Number(o?.ajuste?.[k]);
            if (Number.isFinite(v)) total[k] += v;
        });
    });
    return total;
}

/** Las opciones que supuso la IA («Omitir» = quedarse con lo supuesto): índice por duda, la primera si ninguna lo es. */
export function eleccionesSupuestas(dudas) {
    const out = {};
    (Array.isArray(dudas) ? dudas : []).forEach((d, i) => {
        const j = (d?.opciones || []).findIndex((o) => o?.supuesta);
        out[i] = j >= 0 ? j : 0;
    });
    return out;
}

/** Las respuestas de un toque, listas para el turno: `{ texto, ajuste }`. */
export function respuestasElegidas(dudas, elegidas) {
    return { texto: mensajeDeRespuestas(dudas, elegidas), ajuste: ajusteDeRespuestas(dudas, elegidas) };
}

/**
 * [P1-PLAN-LOTE-763] Con respuestas ESCRITAS («Otra…» dentro del panel): cada duda aporta lo tocado o lo escrito, en su
 * orden. Lo escrito no trae ajuste, así que con UNA escrita el ajuste es null y el servidor pide recalcular
 * (backend/respuestas_de_la_foto.py): sumar solo lo tocado registraría el plato sin lo que el usuario escribió.
 */
export function respuestasConEscritas(dudas, elegidas, escritas) {
    const lista = Array.isArray(dudas) ? dudas : [];
    const escrito = (i) => String(escritas?.[i] || '').trim();
    if (!lista.some((_, i) => escrito(i))) return respuestasElegidas(lista, elegidas);
    const texto = lista
        .map((d, i) => {
            if (escrito(i)) return escrito(i);
            const o = d?.opciones?.[elegidas?.[i]];
            return o?.texto_mostrar || o?.texto;
        })
        .filter(Boolean)
        .join(' · ');
    return { texto, ajuste: null };
}

/** Lo que dice la burbuja del usuario (y se guarda) al contestar: su texto y, debajo, las respuestas. */
export function textoDelTurno(pie, respuestas) {
    return [String(pie || '').trim(), String(respuestas || '').trim()].filter(Boolean).join('\n');
}

/**
 * ¿Este envío tiene que esperar a las respuestas? Solo el turno de la foto (no la reanudación) y solo con dudas.
 * @param {object[]} dudas        las de las fotos del turno (`dudasDeLasFotos`)
 * @param {boolean}  reanudando   el envío ES la reanudación con las respuestas
 * @param {boolean}  [activo]     knob `VITE_CHAT_DUDAS_ANTES` (por defecto encendido)
 */
export function hayQueEsperarRespuestas({ dudas, reanudando, activo = true }) {
    return Boolean(activo && !reanudando && Array.isArray(dudas) && dudas.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// [P1-PLAN-LOTE-695 · 2026-09-28] La foto que espera sus respuestas sobrevive a salir del chat.
//
// El turno pausado del 690 vivía solo en memoria: ir a la Nevera y volver (el chat se desmonta) o cerrar la app
// perdía la tarjeta Y la foto — la burbuja es del cliente hasta que el turno llega al servidor, y la recarga del
// historial la borraba. Mismo patrón que la burbuja «Detenido» (P1-CHAT-STOP-POWER v3): un marcador persistente por
// chat y, al rehidratar, la burbuja vuelve al final si el servidor todavía no la tiene.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PREFIJO = 'mealfit_foto_pendiente:';
export const VIGENCIA_FOTO_PENDIENTE_MS = 12 * 60 * 60 * 1000;
export const claveFotoPendiente = (sessionId) => `${PREFIJO}${sessionId}`;

/** Guarda la foto pendiente de su chat (sin los `blob:` locales, que no sobreviven a una recarga). */
export function guardarFotoPendiente(p, ahora = Date.now()) {
    if (!p?.sessionId || !p?.clientMessageId) return;
    try {
        safeLocalStorageSet(claveFotoPendiente(p.sessionId), JSON.stringify({ ...p, guardadaEn: ahora }));
    } catch { /* best-effort: sin almacenamiento la foto solo vive mientras el chat está abierto */ }
}

export function borrarFotoPendiente(sessionId) {
    if (sessionId) safeLocalStorageRemove(claveFotoPendiente(sessionId));
}

/** La foto pendiente de ESE chat, o null (inexistente, ilegible o de hace más de 12 h: se borra). */
export function leerFotoPendiente(sessionId, ahora = Date.now()) {
    if (!sessionId) return null;
    let p = null;
    try {
        p = JSON.parse(safeLocalStorageGet(claveFotoPendiente(sessionId), 'null'));
    } catch {
        p = null;
    }
    const valida = p && typeof p === 'object' && p.sessionId === sessionId && p.clientMessageId
        && Array.isArray(p.dudas) && p.dudas.length > 0 && p.burbuja && typeof p.burbuja === 'object';
    if (!valida || !(ahora - Number(p.guardadaEn || 0) < VIGENCIA_FOTO_PENDIENTE_MS)) {
        if (p) borrarFotoPendiente(sessionId);
        return null;
    }
    return p;
}

/**
 * Tras rehidratar del servidor: la burbuja de la foto pendiente al final si el servidor no la tiene; si ya la tiene
 * (el turno se mandó), la foto deja de estar pendiente. Pura.
 * @returns {{ mensajes: object[], enviada: boolean }}
 */
export function conFotoPendiente(mensajes, p) {
    const lista = Array.isArray(mensajes) ? mensajes : [];
    if (!p) return { mensajes: lista, enviada: false };
    if (lista.some((m) => m && m.clientMessageId === p.clientMessageId)) return { mensajes: lista, enviada: true };
    return { mensajes: [...lista, { ...p.burbuja, clientMessageId: p.clientMessageId, _esperaDudas: true }], enviada: false };
}

/** Lo escrito con la foto pendiente, junto a lo ya tocado en la tarjeta («2 huevos» tocado + «maduro» escrito). */
export function respuestaEscrita(parcial, escrito) {
    return [String(parcial || '').trim(), String(escrito || '').trim()].filter(Boolean).join(' · ');
}
