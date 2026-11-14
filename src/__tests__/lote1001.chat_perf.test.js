// [P1-PLAN-LOTE-1001 · G-01 · 2026-11-14] Tests de telemetría real de cliente (chatPerf + AgentPage)
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    detectClientPlatform,
    buildClientPerfPayload,
    sendClientPerfTelemetry,
} from '../utils/chatPerf';

describe('chatPerf (G-01)', () => {
    it('buildClientPerfPayload normaliza tiempos, corr y rechaza sesión vacía', () => {
        expect(buildClientPerfPayload({ firstChunkMs: 120 })).toBeNull();

        const payload = buildClientPerfPayload({
            corr: '  corr_abc_123  ',
            sessionId: 'sess-1',
            firstChunkMs: 842.6,
            firstPaintMs: 910.4,
            streamTotalMs: 2450.2,
            chunkCount: 9,
            isCallMode: true,
            platform: 'web',
        });

        expect(payload).toEqual({
            corr: 'corr_abc_123',
            session_id: 'sess-1',
            first_chunk_ms: 843,
            first_paint_ms: 910,
            stream_total_ms: 2450,
            chunk_count: 9,
            is_call_mode: true,
            platform: 'web',
        });
    });

    it('detectClientPlatform devuelve web por defecto', () => {
        expect(detectClientPlatform()).toBe('web');
    });

    it('sendClientPerfTelemetry envía POST a /api/chat/client-metrics y es fail-open', async () => {
        const mockFetch = vi.fn().mockResolvedValue({ ok: true });
        const ok = await sendClientPerfTelemetry(
            {
                corr: 'c1',
                sessionId: 'sess-2',
                firstChunkMs: 500,
                firstPaintMs: 520,
                streamTotalMs: 1200,
                chunkCount: 4,
            },
            { fetcher: mockFetch },
        );

        expect(ok).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe('/api/chat/client-metrics');
        expect(opts.method).toBe('POST');
        expect(opts.keepalive).toBe(true);
        const body = JSON.parse(opts.body);
        expect(body.corr).toBe('c1');
        expect(body.first_paint_ms).toBe(520);

        const failFetch = vi.fn().mockRejectedValue(new Error('network down'));
        const okOnErr = await sendClientPerfTelemetry(
            { sessionId: 'sess-2', firstChunkMs: 400 },
            { fetcher: failFetch },
        );
        expect(okOnErr).toBe(false);
    });

    it('AgentPage conecta _firstPaintedAt, dataObj.corr y sendClientPerfTelemetry', () => {
        const src = fs.readFileSync(
            path.resolve(__dirname, '../pages/AgentPage.jsx'),
            'utf8',
        );
        expect(src).toContain("import { sendClientPerfTelemetry } from '../utils/chatPerf';");
        expect(src).toContain('let _firstPaintedAt = null;');
        expect(src).toContain('corr: dataObj.corr || null');
        expect(src).toContain('sendClientPerfTelemetry({');
    });
});
