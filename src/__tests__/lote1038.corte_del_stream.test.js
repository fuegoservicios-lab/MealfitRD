// [P1-PLAN-LOTE-1038 · A-23 · 2026-11-16] El corte del stream visto desde el teléfono y el reintento del mismo mensaje.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildStreamCutPayload, sendStreamCutTelemetry, RESULTADOS_DE_CORTE } from '../utils/chatPerf';
import { ESTADOS_DE_CORTE } from '../utils/rescateDelTurno';

const agente = readFileSync(resolve(__dirname, '../pages/AgentPage.jsx'), 'utf8');

describe('[P1-PLAN-LOTE-1038] telemetría del corte del stream', () => {
    it('arma el evento sin texto del usuario y acota los valores', () => {
        expect(buildStreamCutPayload({ sessionId: 's-1', outcome: 'rescued', attempts: 3.4, waitedMs: 4200.7, platform: 'ios' })).toEqual({
            event: 'stream_cut', session_id: 's-1', outcome: 'rescued', attempts: 3, waited_ms: 4201, platform: 'ios',
        });
        const raro = buildStreamCutPayload({ sessionId: 's-1', outcome: 'dead', attempts: 9999, waitedMs: -5, platform: 'web' });
        expect(raro.attempts).toBe(100);
        expect(raro.waited_ms).toBe(0);
    });

    it('sin sesión o con un resultado desconocido no manda nada', async () => {
        expect(buildStreamCutPayload({ outcome: 'rescued' })).toBeNull();
        expect(buildStreamCutPayload({ sessionId: 's-1', outcome: 'otra-cosa' })).toBeNull();
        const fetcher = vi.fn();
        expect(await sendStreamCutTelemetry({ sessionId: 's-1', outcome: 'x' }, { fetcher })).toBe(false);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('lo manda al mismo endpoint que el rendimiento y nunca rompe el chat', async () => {
        const fetcher = vi.fn().mockResolvedValue({ ok: true });
        expect(await sendStreamCutTelemetry({ sessionId: 's-1', outcome: 'exhausted', attempts: 31, waitedMs: 90000, platform: 'web' }, { fetcher })).toBe(true);
        const [url, opciones] = fetcher.mock.calls[0];
        expect(url).toBe('/api/chat/client-metrics');
        expect(JSON.parse(opciones.body)).toMatchObject({ event: 'stream_cut', outcome: 'exhausted', attempts: 31 });
        expect(await sendStreamCutTelemetry({ sessionId: 's-1', outcome: 'dead' }, { fetcher: vi.fn().mockRejectedValue(new Error('red')) })).toBe(false);
        expect(await sendStreamCutTelemetry({ sessionId: 's-1', outcome: 'dead' }, { fetcher: () => { throw new Error('x'); } })).toBe(false);
    });

    it('el rescate avisa en sus tres salidas: recuperó, se rindió, el turno murió', () => {
        expect(RESULTADOS_DE_CORTE).toEqual(['rescued', 'exhausted', 'dead']);
        expect(agente).toContain("sendStreamCutTelemetry({ sessionId: currentSessionId, outcome: 'rescued',");
        expect(agente).toContain('sendStreamCutTelemetry({ sessionId: currentSessionId, outcome: motivo,');
        expect(agente).toMatch(/_abandon\('exhausted'\)/);
        expect(agente).toMatch(/_abandon\('dead'\)/);
        expect(agente).toContain('st.startedAt = Date.now();');
    });
});

describe('[P1-PLAN-LOTE-1038] reintento del mismo mensaje con el turno aún vivo', () => {
    it('`turn_in_progress` se trata como un corte: el rescate adopta la respuesta cuando llegue', () => {
        const desde = agente.indexOf('const ESTADO_POR_CODIGO_DE_ERROR = {');
        const bloque = agente.slice(desde, agente.indexOf('};', desde));
        const m = bloque.match(/turn_in_progress:\s*(\d+)/);
        expect(m).not.toBeNull();
        expect(ESTADOS_DE_CORTE).toContain(Number(m[1]));
    });

    it('el reintento reutiliza el identificador del mensaje (lo que permite al servidor no repetir el turno)', () => {
        expect(agente).toContain('const clientMessageId = options.clientMessageId || crypto.randomUUID();');
        expect(agente).toContain('clientMessageId: canRetry ? clientMessageId : undefined,');
    });
});
