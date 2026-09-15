// [P2-CHAT-FRONT-AUDIT · 2026-09-14] Auditoría del chat del coach (AgentPage) y del help bot.
// La lógica del turno vive en `utils/chatTurn.js` (pura, probada aquí de verdad); los
// cableados en AgentPage/HelpChatWidget se anclan por fuente, porque montar la página
// entera exige medio contexto de la app.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    closeStreamingBubbles,
    normalizeHydratedMessages,
    createTurnGate,
    scheduleTurnEndRefresh,
    TURN_END_REFRESH_DELAYS_MS,
    mergeClinicalList,
    valueForUpdatedField,
} from '../utils/chatTurn';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const AP = read('src/pages/AgentPage.jsx');
const HELP = read('src/components/dashboard/HelpChatWidget.jsx');

describe('[1] una burbuja nunca se queda en isStreaming:true', () => {
    it('cierra la parcial con texto: la conserva y la marca incompleta', () => {
        const prev = [
            { role: 'user', content: 'hola' },
            { role: 'model', content: 'Te propongo', isStreaming: true },
        ];
        const out = closeStreamingBubbles(prev);
        expect(out).toHaveLength(2);
        expect(out[1]).toEqual({ role: 'model', content: 'Te propongo', isStreaming: false, _incomplete: true });
        expect(prev[1].isStreaming).toBe(true); // no muta el estado previo
    });

    it('elimina la parcial vacía', () => {
        const out = closeStreamingBubbles([
            { role: 'user', content: 'hola' },
            { role: 'model', content: '   ', isStreaming: true },
        ]);
        expect(out).toEqual([{ role: 'user', content: 'hola' }]);
    });

    it('sin nada que cerrar devuelve el MISMO array (sin re-render)', () => {
        const prev = [{ role: 'model', content: 'listo' }];
        expect(closeStreamingBubbles(prev)).toBe(prev);
    });

    it('al hidratar la caché, ningún mensaje sigue «escribiéndose»', () => {
        const cached = [
            { role: 'user', content: 'a' },
            { role: 'model', content: 'parcial', isStreaming: true },
        ];
        const out = normalizeHydratedMessages(cached);
        expect(out.some((m) => m.isStreaming)).toBe(false);
        expect(out[1]._incomplete).toBe(true);
    });

    it('AgentPage: hidratación normalizada, cierre tras el bucle sin `done`, y en error/red', () => {
        expect(AP).toContain('return normalizeHydratedMessages(cache.messages);');
        expect(AP).toMatch(/if \(!_sawDone && _isCurrentTurn\(\)\) \{[\s\S]{0,200}closeStreamingBubbles\(prev\)/);
        // Toda burbuja de error del turno pasa por el helper que cierra la parcial.
        expect(AP).toContain('setMessages(prev => [...closeStreamingBubbles(prev), _buildAgentErrorMessage({');
        const i = AP.indexOf('const handleSend = async');
        const j = AP.indexOf('const handleStopGeneration');
        const body = AP.slice(i, j);
        expect(body).not.toContain('setMessages(prev => [...prev, _buildAgentErrorMessage(');
        expect(body).not.toContain('setMessages((prev) => [...prev, _buildAgentErrorMessage(');
    });
});

describe('[2] un solo mensaje de error por turno', () => {
    it('el helper del turno lleva un cerrojo de «ya mostrado»', () => {
        expect(AP).toMatch(/if \(!_isCurrentTurn\(\) \|\| _turnErrorShown\) return;/);
        expect(AP).toContain('_turnErrorShown = true;');
    });
});

describe('[3] el medidor de cuota se refresca al TERMINAR el turno', () => {
    afterEach(() => vi.useRealTimers());

    it('no llama al instante; llama tras cada retardo y traga los rechazos', async () => {
        vi.useFakeTimers();
        const refresh = vi.fn(() => Promise.reject(new Error('red')));
        scheduleTurnEndRefresh(refresh);
        expect(refresh).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(TURN_END_REFRESH_DELAYS_MS[0]);
        expect(refresh).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(TURN_END_REFRESH_DELAYS_MS[1]);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('AgentPage: ya no cuelga de isLoading; lo agenda el finally de handleSend', () => {
        expect(AP).not.toMatch(/if \(!isLoading\) refreshCoachQuota\(\)/);
        const i = AP.indexOf('const handleSend = async');
        const fin = AP.indexOf('} finally {', i);
        const end = AP.indexOf('const handleStopGeneration', fin);
        expect(AP.slice(fin, end)).toContain('scheduleTurnEndRefresh(refreshCoachQuota);');
    });
});

describe('[4] el candado del turno tiene identidad', () => {
    it('un turno viejo deja de ser el vigente tras Detener o un turno nuevo', () => {
        const gate = createTurnGate();
        const a = gate.begin();
        expect(gate.isCurrent(a)).toBe(true);
        gate.invalidate();            // Detener / «Nuevo chat»
        expect(gate.isCurrent(a)).toBe(false);
        const b = gate.begin();       // el usuario vuelve a enviar
        expect(gate.isCurrent(b)).toBe(true);
        expect(gate.isCurrent(a)).toBe(false); // el `finally` de A no toca el candado de B
    });

    it('simulación: el finally del turno viejo no apaga el candado del nuevo', () => {
        const gate = createTurnGate();
        let lockOn = false;
        const finallyOf = (id) => { if (gate.isCurrent(id)) lockOn = false; };
        const a = gate.begin(); lockOn = true;
        gate.invalidate(); lockOn = false;   // Detener
        const b = gate.begin(); lockOn = true;
        finallyOf(a);                         // A despierta tarde (HEIC)
        expect(lockOn).toBe(true);
        finallyOf(b);
        expect(lockOn).toBe(false);
    });

    it('AgentPage: begin en handleSend, invalidate en Detener y «Nuevo chat», finally condicionado', () => {
        expect(AP).toContain('const turnId = turnGateRef.current.begin();');
        expect(AP).toContain('if (!_isCurrentTurn() || !isTurnActiveRef.current) return;');
        const i = AP.indexOf('const handleSend = async');
        const fin = AP.indexOf('} finally {', i);
        expect(AP.slice(fin, fin + 120)).toContain('if (turnGateRef.current.isCurrent(turnId)) {');
        const stop = AP.slice(AP.indexOf('const handleStopGeneration'), AP.indexOf('const handleStopGeneration') + 700);
        expect(stop).toContain('abortControllerRef.current || abortController');
        expect(stop).toContain('turnGateRef.current.invalidate()');
        const nc = AP.slice(AP.indexOf('const handleNewChat'), AP.indexOf('const handleNewChat') + 900);
        expect(nc).toContain('turnGateRef.current.invalidate()');
    });
});

describe('[5] reintentar una regeneración sigue siendo regeneración', () => {
    it('la burbuja de error guarda el contexto y el reintento lo reenvía', () => {
        expect(AP).toContain('retryRegenerateMessageId: canRetry ? (regenerateMessageId || undefined) : undefined,');
        expect(AP).toContain('regenerateMessageId: message.retryRegenerateMessageId,');
        expect(AP).toContain('regenerateResponseContent: message.retryRegenerateResponseContent,');
        expect(AP).toContain('regenerateMessageId: options.regenerateMessageId,');
    });
});

describe('[6] 409 con copy propio y botón de recargar', () => {
    const KEY = 'Esa respuesta cambió mientras tanto. Recarga la conversación para ver la versión actual.';
    it('entrada 409 en el mapa de copy, recarga en vez de reintentar', () => {
        expect(AP).toMatch(/409: \{\s*icon: '🔄',\s*text: t\('Esa respuesta cambió mientras tanto\./);
        expect(AP).toContain('if (message.reloadHistory) {');
        expect(AP).toContain('fetchSessionMessages(currentSessionId);');
        const mb = read('src/components/agent/MessageBubble.jsx');
        expect(mb).toContain('reload={msg.reloadHistory === true}');
    });
    it('traducciones en los 4 catálogos', () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            expect(cat[KEY], loc).toBeTruthy();
            expect(cat['Recargar conversación'], loc).toBeTruthy();
            expect(cat['Respuesta incompleta'], loc).toBeTruthy();
        }
    });
});

describe('[7] los efectos del `done` no se tragan en silencio', () => {
    it('sin catch vacío; cada efecto aislado', () => {
        expect(AP).not.toContain('// Ignorar lineas JSON rotas temporalmente');
        expect(AP).toContain("_runDoneHandler('saveGeneratedPlan', () => saveGeneratedPlan(dataObj.new_plan));");
        expect(AP).toContain("_runDoneHandler('coherence_warnings'");
        expect(AP).toMatch(/catch \(handlerError\) \{[\s\S]{0,200}console\.error\(/);
    });
});

describe('[8] P0 · alergias y condiciones se UNEN, nunca se reemplazan', () => {
    it('une sin duplicar (mayúsculas y acentos) y conserva lo previo', () => {
        expect(mergeClinicalList(['Maní', 'Lactosa'], ['mani', 'Mariscos'])).toEqual(['Maní', 'Lactosa', 'Mariscos']);
        expect(mergeClinicalList(['Gluten'], [])).toEqual(['Gluten']);
        expect(mergeClinicalList(['Gluten'], 'Soya, gluten')).toEqual(['Gluten', 'Soya']);
    });

    it('el sentinel «Ninguna» cae en cuanto hay un elemento real', () => {
        expect(mergeClinicalList(['Ninguna'], ['Maní'])).toEqual(['Maní']);
        expect(mergeClinicalList(['Ninguna'], ['ninguna'])).toEqual(['Ninguna']);
        expect(mergeClinicalList([], [])).toEqual([]);
    });

    it('solo allergies/medicalConditions se unen; el resto se reemplaza como antes', () => {
        const form = { allergies: ['Maní'], medicalConditions: ['Diabetes tipo 2'], weight: 80 };
        expect(valueForUpdatedField('allergies', ['Mariscos'], form)).toEqual(['Maní', 'Mariscos']);
        expect(valueForUpdatedField('medicalConditions', ['Hipertensión'], form)).toEqual(['Diabetes tipo 2', 'Hipertensión']);
        expect(valueForUpdatedField('weight', 78, form)).toBe(78);
        expect(valueForUpdatedField('allergies', ['Maní'], undefined)).toEqual(['Maní']);
    });

    it('AgentPage aplica updated_fields con la unión contra el formData VIGENTE', () => {
        expect(AP).toContain('[P0-CHAT-ALLERGY-FRONTEND-UNION · 2026-09-14]');
        expect(AP).toContain('updateData(field, valueForUpdatedField(field, val, formDataRef.current));');
        expect(AP).not.toContain('if (updateData) updateData(field, val);');
    });
});

describe('[9] help bot: candado síncrono y abort al desmontar', () => {
    it('usa ref (no el state) como candado y aborta la petición al cerrar', () => {
        expect(HELP).toContain('if (!clean || sendingRef.current) return;');
        expect(HELP).not.toContain('if (!clean || isLoading) return;');
        expect(HELP).toContain('signal: controller.signal,');
        expect(HELP).toMatch(/return \(\) => \{[\s\S]{0,120}abortRef\.current\?\.abort\(\)/);
        expect(HELP).toContain("if (error?.name === 'AbortError' || !mountedRef.current) return;");
    });
});
