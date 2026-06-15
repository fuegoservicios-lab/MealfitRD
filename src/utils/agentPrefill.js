// [P3-AGENT-PREFILL · 2026-06-15] Canal liviano para "pre-cargar" una pregunta
// en el chat del Agente desde otra parte del dashboard (p.ej. tocar un
// micronutriente en MicronutrientPanel → "¿cómo subo mi fibra?").
//
// Por qué un módulo + evento (y NO navigation-state ni URL param): AgentPage es
// KEEP-ALIVE (P1-AGENT-KEEP-ALIVE) — se monta una sola vez y se oculta con
// display:none al navegar fuera, así que no re-monta ni re-lee location.state.
// Una variable module-level (misma pestaña/sesión) + un CustomEvent cubren los
// dos casos: (a) ya montado → el listener dispara el consumo al instante;
// (b) primera visita a /agent → AgentPage consume la pendiente en su mount.

let _pending = null;

export const AGENT_PREFILL_EVENT = 'mealfit-agent-prefill';

/** Deja una pregunta pendiente y avisa al Agente (si ya está montado). El caller
 *  navega a /dashboard/agent justo después. */
export function requestAgentPrefill(text) {
    if (typeof text !== 'string' || !text.trim()) return;
    _pending = text.trim();
    try {
        window.dispatchEvent(new Event(AGENT_PREFILL_EVENT));
    } catch {
        /* SSR / entorno sin window: el consumo on-mount lo recoge igual */
    }
}

/** Devuelve y limpia la pregunta pendiente (one-shot). null si no hay. */
export function consumeAgentPrefill() {
    const t = _pending;
    _pending = null;
    return t;
}
