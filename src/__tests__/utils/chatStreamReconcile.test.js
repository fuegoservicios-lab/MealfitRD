/**
 * [P1-CHAT-NARRATION-KEPT · 2026-07-28] Tests del helper compartido de
 * AgentPage.jsx: strip de tags UI_ACTION + reconciliación del payload
 * `done` del SSE contra lo que el usuario ya está leyendo en pantalla.
 *
 * Bug original: `fullText = dataObj.response;` (blind-replace) al recibir
 * el evento `done`. El backend (pre-fix) armaba `done.response` con SOLO la
 * última AIMessage del turno — cuando el modelo narraba-y-actuaba (content +
 * tool_calls en la misma completion), la narración YA streameada al cliente
 * como chunks quedaba reemplazada por una versión más corta: el usuario veía
 * el texto que leía "desaparecer".
 *
 * Fix backend (agent.py `_build_final_content_from_messages`): `done.response`
 * ahora une TODAS las AIMessage del turno — en el caso sano, EXTIENDE lo que
 * el cliente ya acumuló de los chunks. `reconcileFinalChatText` es la defensa
 * cliente: si el final extiende lo mostrado, anexa el delta; si no, reemplaza
 * por completo (nunca concatena texto no relacionado).
 */
import { describe, it, expect, vi } from 'vitest';
import { stripUiActionTags, reconcileFinalChatText } from '../../utils/chatStreamReconcile';

describe('reconcileFinalChatText', () => {
    it('caso sano: el final EXTIENDE lo mostrado → anexa solo el delta', () => {
        const displayed = 'Lo anoto...';
        const final = 'Lo anoto...\n\nListo, quedó anotado.';
        const result = reconcileFinalChatText(displayed, final);
        expect(result).toBe(final);
        // Explícitamente: el prefijo mostrado se preserva byte a byte.
        expect(result.startsWith(displayed)).toBe(true);
    });

    it('caso degradado: el final NO extiende lo mostrado → reemplaza por completo', () => {
        // Ej: backend viejo/degradado que solo manda la última AIMessage,
        // que diverge de lo que el usuario ya leyó en los chunks.
        const displayed = 'Lo anoto...\n\nListo, quedó anotado.';
        const final = 'Solo la confirmación final.';
        const result = reconcileFinalChatText(displayed, final);
        expect(result).toBe(final);
    });

    it('caso idéntico: el final es EXACTAMENTE lo mostrado → no-op', () => {
        const displayed = 'Todo bien por aquí.';
        const result = reconcileFinalChatText(displayed, displayed);
        expect(result).toBe(displayed);
    });

    it('displayed vacío (primer chunk aún no llegó) → usa el final completo', () => {
        const result = reconcileFinalChatText('', 'Respuesta completa del turno.');
        expect(result).toBe('Respuesta completa del turno.');
    });

    it('final vacío/undefined → nunca lanza, retorna string vacío', () => {
        expect(reconcileFinalChatText('algo mostrado', '')).toBe('');
        expect(reconcileFinalChatText('algo mostrado', undefined)).toBe('');
        expect(reconcileFinalChatText(undefined, undefined)).toBe('');
    });

    it('extensión con contenido divergente al final (no solo apéndice limpio)', () => {
        const displayed = 'Prefijo';
        const final = 'PrefijoXYZ';
        const result = reconcileFinalChatText(displayed, final);
        expect(result).toBe('PrefijoXYZ');
    });
});

describe('reconcileFinalChatText · fixture realista de acumulación SSE en vivo', () => {
    // [P1-CHAT-NARRATION-KEPT-REVIEW-1 · 2026-07-28] La fixture original de
    // 'caso sano' usaba `displayed = 'Lo anoto...'` — SOLO la primera pasada,
    // como si el evento `done` llegara antes de que el cliente terminara de
    // acumular los chunks de la SEGUNDA pasada. Eso NUNCA pasa en runtime: por
    // definición `done` es el ÚLTIMO evento del stream, así que para cuando
    // llega, AgentPage.jsx/ChatWidget.jsx ya acumularon TODOS los chunks de
    // AMBAS pasadas via `fullText += dataObj.text` — sin separador entre
    // ellas (agent.py solo emite `type:'chunk'` para contenido crudo). El
    // backend en cambio arma `done.response` con
    // `_build_final_content_from_messages` (`"\n\n".join(parts)`, agent.py
    // ~4117), que SÍ inserta '\n\n' entre pasadas. Por eso el `startsWith`
    // crudo divergía SIEMPRE en runtime, aunque el test unitario (fixture
    // irreal) pasaba.
    //
    // Fix (P1-CHAT-NARRATION-KEPT-REVIEW-1): AgentPage.jsx/ChatWidget.jsx
    // ahora insertan el MISMO separador '\n\n' en `fullText` al recibir un
    // evento `progress` que señala el inicio de una nueva pasada (tool_call)
    // — backend con fallback genérico (agent.py) garantiza un `progress` por
    // CADA tool_call, no solo las 5-6 nombradas. Esta fixture reproduce esa
    // acumulación real: chunks pass 1 → progress (separador insertado) →
    // chunks pass 2 → done.
    it('reproduce la acumulación real: chunks pass1 + separador de progress + chunks pass2 == displayed EXTIENDE final', () => {
        // Simula exactamente lo que el loop de streaming hace:
        let displayed = '';
        // Pasada 1: chunks de narración cruda.
        for (const tok of ['Lo ', 'anoto', '...']) displayed += tok;
        // Evento `progress` (tool_call boundary) → separador insertado.
        if (displayed && !displayed.endsWith('\n\n')) displayed += '\n\n';
        // Pasada 2: chunks de confirmación cruda.
        for (const tok of ['Listo, ', 'quedó anotado.']) displayed += tok;

        // Lo que el backend persiste vía _build_final_content_from_messages:
        // mismas dos pasadas unidas con '\n\n' — AHORA coincide byte a byte.
        const final = 'Lo anoto...\n\nListo, quedó anotado.';

        expect(displayed).toBe(final);

        const result = reconcileFinalChatText(displayed, final);
        expect(result).toBe(final);
        // La propiedad que el docstring reclama para el 'caso sano' ahora
        // SÍ se cumple con una fixture que refleja la acumulación real.
        expect(final.startsWith(displayed)).toBe(true);
    });

    it('sin el fix del separador (regresión hipotética): chunks pegados sin separador → cae a replace, contenido igual pero sin match de prefijo', () => {
        // Reproduce el comportamiento PRE-fix (P1-CHAT-NARRATION-KEPT-REVIEW-1
        // aún no aplicado): las dos pasadas se pegan directo, sin separador.
        const displayedPreFix = 'Lo anoto...' + 'Listo, quedó anotado.';
        const final = 'Lo anoto...\n\nListo, quedó anotado.';

        // El prefijo crudo NO matchea — la rama 'replace' se activa.
        expect(final.startsWith(displayedPreFix)).toBe(false);

        // El resultado sigue siendo CORRECTO (sin pérdida de datos) — el
        // defense-in-depth de `reconcileFinalChatText` ya cubría esto — pero
        // documenta por qué el hallazgo de review es válido: displayed
        // "des-sincronizado" del separador real SIEMPRE cae a replace.
        const result = reconcileFinalChatText(displayedPreFix, final);
        expect(result).toBe(final);
    });
});

describe('stripUiActionTags', () => {
    it('sin tags → retorna el texto intacto, sin invocar handlers', () => {
        const onRefreshPlan = vi.fn();
        const result = stripUiActionTags('Hola, ¿en qué te ayudo?', { onRefreshPlan });
        expect(result).toBe('Hola, ¿en qué te ayudo?');
        expect(onRefreshPlan).not.toHaveBeenCalled();
    });

    it('REFRESH_PLAN: strip + invoca el handler', () => {
        const onRefreshPlan = vi.fn();
        const result = stripUiActionTags(
            'Actualicé tu almuerzo. [UI_ACTION: REFRESH_PLAN]',
            { onRefreshPlan }
        );
        expect(result).toBe('Actualicé tu almuerzo. ');
        expect(onRefreshPlan).toHaveBeenCalledTimes(1);
    });

    it('REFRESH_HYDRATION: strip + invoca el handler', () => {
        const onRefreshHydration = vi.fn();
        const result = stripUiActionTags(
            'Anotado el vaso de agua. [UI_ACTION: REFRESH_HYDRATION]',
            { onRefreshHydration }
        );
        expect(result).toBe('Anotado el vaso de agua. ');
        expect(onRefreshHydration).toHaveBeenCalledTimes(1);
    });

    it('REFRESH_INVENTORY: strip + invoca el handler', () => {
        const onRefreshInventory = vi.fn();
        const result = stripUiActionTags(
            'Listo, lo registré. [UI_ACTION: REFRESH_INVENTORY]',
            { onRefreshInventory }
        );
        expect(result).toBe('Listo, lo registré. ');
        expect(onRefreshInventory).toHaveBeenCalledTimes(1);
    });

    it('los 3 tags a la vez → strip de los 3 + los 3 handlers invocados', () => {
        const onRefreshPlan = vi.fn();
        const onRefreshHydration = vi.fn();
        const onRefreshInventory = vi.fn();
        const result = stripUiActionTags(
            'Todo actualizado. [UI_ACTION: REFRESH_PLAN][UI_ACTION: REFRESH_HYDRATION][UI_ACTION: REFRESH_INVENTORY]',
            { onRefreshPlan, onRefreshHydration, onRefreshInventory }
        );
        expect(result).toBe('Todo actualizado. ');
        expect(onRefreshPlan).toHaveBeenCalledTimes(1);
        expect(onRefreshHydration).toHaveBeenCalledTimes(1);
        expect(onRefreshInventory).toHaveBeenCalledTimes(1);
    });

    it('sin handlers pasados → no lanza (los tags igual se quitan)', () => {
        expect(() => stripUiActionTags('x [UI_ACTION: REFRESH_PLAN]')).not.toThrow();
        expect(stripUiActionTags('x [UI_ACTION: REFRESH_PLAN]')).toBe('x ');
    });

    it('texto vacío/undefined → retorna string vacío, sin invocar handlers', () => {
        // Normaliza a '' (nunca undefined) — el caller siempre puede
        // concatenar/comparar el resultado sin un guard extra.
        const onRefreshPlan = vi.fn();
        expect(stripUiActionTags('', { onRefreshPlan })).toBe('');
        expect(stripUiActionTags(undefined, { onRefreshPlan })).toBe('');
        expect(onRefreshPlan).not.toHaveBeenCalled();
    });
});

describe('integración: strip + reconcile (flujo real del evento done)', () => {
    it('narración con tag REFRESH_INVENTORY que llega solo en el done (chunk cortado)', () => {
        // Lo que el cliente ya mostró (acumulado de chunks, tag YA completo
        // y limpio porque llegó a tiempo en un chunk previo).
        const displayed = 'Lo anoto...';
        // El payload final del backend (P1-CHAT-NARRATION-KEPT: une ambas
        // AIMessage) trae el tag de nuevo al final de la segunda pasada.
        const rawFinal = 'Lo anoto...\n\nListo, quedó anotado. [UI_ACTION: REFRESH_INVENTORY]';

        const onRefreshInventory = vi.fn();
        const stripped = stripUiActionTags(rawFinal, { onRefreshInventory });
        const result = reconcileFinalChatText(displayed, stripped);

        expect(onRefreshInventory).toHaveBeenCalledTimes(1);
        expect(result).toBe('Lo anoto...\n\nListo, quedó anotado. ');
        expect(result).not.toContain('[UI_ACTION');
    });
});
