// [P1-CHAT-NARRATION-KEPT · 2026-07-28] SSOT compartida por AgentPage.jsx
// para (a) el strip de tags silenciosos `[UI_ACTION: <NAME>]` y (b) la
// reconciliación del payload `done` del SSE contra lo que el usuario YA
// está leyendo en pantalla.
//
// Por qué existe este módulo:
//   El backend (`chat_with_agent_stream`, agent.py) streamea la narración
//   del modelo como eventos `chunk` en tiempo real. Cuando el modelo narra-
//   y-actúa (content + tool_calls en el mismo completion), el grafo vuelve
//   a `call_model` tras ejecutar la tool y produce una SEGUNDA AIMessage —
//   ambas pasadas se streamean como chunks consecutivos, así que lo que el
//   usuario YA ve en pantalla es la concatenación de ambas.
//
//   El evento final `done` trae `response` (P1-CHAT-NARRATION-KEPT en el
//   backend lo arma uniendo TODAS las AIMessage del turno). Antes del fix
//   backend, `done.response` era solo la ÚLTIMA AIMessage — un blind-replace
//   (`fullText = dataObj.response`) hacía que el texto que el usuario leía
//   "desapareciera" y fuera sustituido por una versión más corta.
//
//   `reconcileFinalChatText` es la defensa-en-profundidad del lado cliente:
//   si el payload final EXTIENDE lo ya mostrado (el caso sano post-fix
//   backend), solo anexa el delta — nunca provoca un parpadeo visual. Si el
//   payload final NO extiende lo mostrado (backend viejo/degradado, o
//   cualquier divergencia), reemplaza por completo — nunca concatena texto
//   no relacionado (eso produciría texto duplicado/basura, peor que el
//   blind-replace original).

/**
 * Aplica el strip de los 3 tags silenciosos `[UI_ACTION: <NAME>]` sobre
 * `text`, invocando el handler correspondiente cuando el tag está presente.
 * Idéntico en ambos call-sites (chunk streaming + evento `done`) — extraído
 * a un solo lugar para que un fix futuro no tenga que aplicarse dos veces.
 *
 * @param {string} text
 * @param {{onRefreshPlan?: () => void, onRefreshHydration?: () => void, onRefreshInventory?: () => void}} handlers
 * @returns {string} texto sin los tags detectados
 */
export function stripUiActionTags(text, handlers = {}) {
    if (!text) return text || '';
    let out = text;

    if (out.includes('[UI_ACTION: REFRESH_PLAN]')) {
        out = out.replace(/\[UI_ACTION:\s*REFRESH_PLAN\]/g, '');
        if (typeof handlers.onRefreshPlan === 'function') {
            handlers.onRefreshPlan();
        }
    }
    if (out.includes('[UI_ACTION: REFRESH_HYDRATION]')) {
        out = out.replace(/\[UI_ACTION:\s*REFRESH_HYDRATION\]/g, '');
        if (typeof handlers.onRefreshHydration === 'function') {
            handlers.onRefreshHydration();
        }
    }
    if (out.includes('[UI_ACTION: REFRESH_INVENTORY]')) {
        out = out.replace(/\[UI_ACTION:\s*REFRESH_INVENTORY\]/g, '');
        if (typeof handlers.onRefreshInventory === 'function') {
            handlers.onRefreshInventory();
        }
    }

    return out;
}

/**
 * Reconcilia el texto final del turno (`done.response`, ya limpio de tags
 * UI_ACTION) contra lo que ya está en pantalla (acumulado de eventos
 * `chunk`, también ya limpio de tags).
 *
 * - Si `finalText` EXTIENDE `displayedText` (empieza con él) → anexa solo
 *   el delta. Resultado idéntico a `finalText`, pero expresado como
 *   "displayed + delta" para dejar explícito que NO se descartó nada de
 *   lo ya mostrado.
 * - Si NO lo extiende → reemplaza por completo con `finalText`. Nunca
 *   concatena texto no relacionado (evita basura/duplicados).
 *
 * @param {string} displayedText
 * @param {string} finalText
 * @returns {string}
 */
export function reconcileFinalChatText(displayedText, finalText) {
    const displayed = displayedText || '';
    const final = finalText || '';

    if (final.startsWith(displayed)) {
        return displayed + final.slice(displayed.length);
    }
    return final;
}
