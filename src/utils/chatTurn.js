// [P2-CHAT-FRONT-AUDIT · 2026-09-14] Lógica pura del turno del coach (AgentPage.jsx),
// extraída para poder probarla sin montar la página de 5.000 líneas.
//
// Cuatro piezas, cada una cierra un hallazgo verificado de la auditoría del chat:
//   1. `closeStreamingBubbles` / `normalizeHydratedMessages` — una burbuja no puede
//      quedarse en `isStreaming: true` para siempre (stream cerrado sin `done`, error
//      a mitad, red caída, o caché de localStorage escrita en ese estado).
//   2. `createTurnGate` — el candado del turno era un booleano: un turno viejo que
//      despertaba tras Detener/«Nuevo chat» veía el `true` del turno NUEVO y seguía,
//      y su `finally` apagaba el candado del nuevo. Ahora cada turno tiene un id.
//   3. `scheduleTurnEndRefresh` — el medidor de cuota se refrescaba con el primer
//      token, antes de que el backend cobrara (lo hace al cerrar el generador).
//   4. `mergeClinicalList` / `valueForUpdatedField` — [P0-CHAT-ALLERGY-FRONTEND-UNION ·
//      2026-09-14] alergias y condiciones médicas se UNEN, jamás se reemplazan.

import { SENTINEL_VALUES } from '../config/sentinels';

// ---------------------------------------------------------------------------
// 1. Burbujas en streaming
// ---------------------------------------------------------------------------

const _hasText = (content) => typeof content === 'string' && content.trim().length > 0;

/**
 * Cierra toda burbuja en `isStreaming: true`.
 *  - Con texto: se conserva (lo que el usuario ya leyó no desaparece), con
 *    `isStreaming: false` y `_incomplete: true` si `markIncomplete`.
 *  - Vacía: se elimina (una burbuja vacía no aporta nada y bloquearía la caché).
 * Devuelve el MISMO array si no había nada que cerrar (no provoca re-render).
 */
export function closeStreamingBubbles(messages, { markIncomplete = true } = {}) {
    if (!Array.isArray(messages) || !messages.some((m) => m && m.isStreaming)) return messages;
    const out = [];
    for (const m of messages) {
        if (!m || !m.isStreaming) { out.push(m); continue; }
        if (!_hasText(m.content)) continue;
        const closed = { ...m, isStreaming: false };
        if (markIncomplete) closed._incomplete = true;
        out.push(closed);
    }
    return out;
}

/** Al hidratar desde localStorage ningún mensaje puede seguir «escribiéndose». */
export function normalizeHydratedMessages(messages) {
    return closeStreamingBubbles(messages, { markIncomplete: true });
}

// ---------------------------------------------------------------------------
// 2. Identidad del turno
// ---------------------------------------------------------------------------

/**
 * Contador de turnos. `begin()` abre un turno y devuelve su id; `invalidate()`
 * (Detener, «Nuevo chat») hace que el turno en curso deje de ser el vigente sin
 * abrir otro. Un turno solo puede tocar el estado compartido (candado, controller,
 * burbujas) mientras `isCurrent(id)`.
 */
export function createTurnGate() {
    let current = 0;
    return {
        begin() { current += 1; return current; },
        invalidate() { current += 1; },
        isCurrent(id) { return id === current; },
        get current() { return current; },
    };
}

// ---------------------------------------------------------------------------
// 3. Refresco del medidor de cuota al terminar el turno
// ---------------------------------------------------------------------------

/**
 * El backend cobra el mensaje en el `finally` de su generador, que puede correr
 * un instante DESPUÉS de que el cliente vea cerrarse el stream. Dos lecturas
 * (una pronta y otra de respaldo) dan tiempo al cobro sin un bucle de sondeo.
 */
export const TURN_END_REFRESH_DELAYS_MS = Object.freeze([900, 3500]);

export function scheduleTurnEndRefresh(refresh, { delays = TURN_END_REFRESH_DELAYS_MS, schedule = setTimeout } = {}) {
    if (typeof refresh !== 'function') return [];
    return delays.map((ms) => schedule(() => {
        try {
            const r = refresh();
            if (r && typeof r.catch === 'function') r.catch(() => { /* medidor informativo */ });
        } catch { /* medidor informativo */ }
    }, ms));
}

// ---------------------------------------------------------------------------
// 4. [P0-CHAT-ALLERGY-FRONTEND-UNION · 2026-09-14] Unión de listas clínicas
// ---------------------------------------------------------------------------

/**
 * Campos que el frontend NUNCA reemplaza con lo que devuelve el coach. La
 * herramienta del backend ya FUSIONA en la base; si aquí se reemplazaba la lista,
 * la sincronización del Dashboard (PATCH del formulario entero, merge superficial)
 * borraba en la base las alergias previas. Perder una alergia es un riesgo clínico.
 */
export const CLINICAL_UNION_FIELDS = Object.freeze(['allergies', 'medicalConditions']);

const _clinicalKey = (s) => String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const _SENTINEL_KEYS = new Set([...SENTINEL_VALUES, 'Nada', 'Ninguno', 'Ninguna'].map(_clinicalKey));

const _toList = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',');
    return [];
};

/**
 * Une `current` e `incoming` sin duplicados (sin distinguir mayúsculas ni
 * acentos), conservando el orden y la grafía de lo que ya estaba. El sentinel
 * «Ninguna» se descarta en cuanto hay un elemento real: `["Ninguna","Maní"]` es
 * una contradicción de seguridad (P0-FORM-1).
 */
export function mergeClinicalList(current, incoming) {
    const seen = new Set();
    const merged = [];
    for (const raw of [..._toList(current), ..._toList(incoming)]) {
        if (typeof raw !== 'string') continue;
        const item = raw.trim();
        if (!item) continue;
        const key = _clinicalKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
    }
    const real = merged.filter((item) => !_SENTINEL_KEYS.has(_clinicalKey(item)));
    if (real.length) return real;
    return merged.slice(0, 1);
}

/** Valor que debe llegar a `updateData(field, …)` para un `updated_fields` del coach. */
export function valueForUpdatedField(field, incoming, formData) {
    if (CLINICAL_UNION_FIELDS.includes(field)) {
        return mergeClinicalList(formData?.[field], incoming);
    }
    return incoming;
}
