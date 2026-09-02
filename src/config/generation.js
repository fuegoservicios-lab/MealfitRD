// [P1-ARQ25-F1-LIFECYCLE · 2026-09-02] Interruptor del Bloque 1 vía cola (roadmap 2.5, Fase 1).
//
// Con `VITE_INITIAL_VIA_QUEUE=true` el formulario crea un run durable
// (`POST /api/plans/generation-runs`) y tailea `GET .../{run_id}/events`; el backend
// tiene su propio knob (`MEALFIT_INITIAL_VIA_QUEUE`) y responde 404 si está apagado,
// en cuyo caso `generateAIPlanStream` cae al SSE legacy. Los dos flags se encienden
// juntos en el canary; el del backend manda (sin él no hay cola que consumir).
//
// Env explícita, no derivada de nada: es la misma forma que `VITE_AUTH_APPLE_ENABLED`
// (platform.js). Los invitados NUNCA van por la cola (el backend los rechaza con 400).
export function initialViaQueueEnabled() {
    return String(import.meta.env.VITE_INITIAL_VIA_QUEUE ?? '').toLowerCase() === 'true';
}

const IDEM_KEY = 'mealfit_run_idempotency';

// Clave de idempotencia (I9): la misma para el mismo formulario mientras dure la sesión
// de la pestaña, así un reintento tras perder la respuesta REPRODUCE el run en vez de
// crear otro plan. Cambia el formulario ⇒ cambia la clave. `clearIdempotencyKey` al
// terminar (éxito o cancelación explícita).
export function idempotencyKeyFor(formData) {
    let fp = '';
    try {
        const { idempotency_key, session_id, tzOffset, ...rest } = formData || {};
        fp = JSON.stringify(rest, Object.keys(rest).sort());
    } catch { fp = String(Date.now()); }
    try {
        const raw = sessionStorage.getItem(IDEM_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            if (saved && saved.fp === fp && typeof saved.key === 'string') return saved.key;
        }
    } catch { /* sessionStorage no disponible */ }
    const key = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    try { sessionStorage.setItem(IDEM_KEY, JSON.stringify({ fp, key })); } catch { /* noop */ }
    return key;
}

export function clearIdempotencyKey() {
    try { sessionStorage.removeItem(IDEM_KEY); } catch { /* noop */ }
}
