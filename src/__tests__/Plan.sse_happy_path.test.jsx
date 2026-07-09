/**
 * [P1-9 · SSE happy-path de generateAIPlanStream] El flujo cliente MÁS crítico
 * (parse del plan en streaming, onProgress por día, ensamblado final) tenía 0
 * cobertura de EJECUCIÓN — los ~7 tests de Plan.* solo tocaban ramas de error.
 * Este characterization test ejercita el parser SSE real sobre un stream mockeado
 * (incl. un frame partido entre reads, para el buffer de líneas incompletas). Sin
 * backend. Es la red que hace seguro refactorizar Plan.jsx / AgentPage (P3-7).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
    getPlanChunkStatus: vi.fn(),
    retryPlanChunk: vi.fn(),
}));

vi.mock('../authClient', () => ({
    authClient: {
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
        from: vi.fn(),
    },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

import { fetchWithAuth } from '../config/api';
import { generateAIPlanStream } from '../pages/Plan';

// Response-like SSE: un reader que emite los chunks dados como Uint8Array y luego done.
function makeSSEResponse(chunks) {
    let i = 0;
    return {
        ok: true,
        status: 200,
        headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
        body: {
            getReader: () => ({
                read: async () =>
                    i < chunks.length
                        ? { done: false, value: new TextEncoder().encode(chunks[i++]) }
                        : { done: true, value: undefined },
            }),
        },
    };
}

describe('P1-9 · generateAIPlanStream happy-path (SSE)', () => {
    beforeEach(() => { vi.mocked(fetchWithAuth).mockReset(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('parsea frames (incl. uno partido), emite onProgress por día y resuelve el plan del complete', async () => {
        // El 3er frame (complete) está PARTIDO entre dos reads → ejercita el buffer
        // de líneas incompletas del parser (buffer = lines.pop()).
        const chunks = [
            'data: {"event":"progress","day":1}\n',
            'data: {"event":"progress","day":2}\ndata: {"event":"comp',
            'lete","data":{"days":[{"day":1,"meals":[]},{"day":2,"meals":[]}],"name":"Plan de prueba"}}\n',
        ];
        vi.mocked(fetchWithAuth).mockResolvedValue(makeSSEResponse(chunks));
        const onProgress = vi.fn();

        const result = await generateAIPlanStream({ foo: 'bar' }, onProgress);

        expect(result).toMatchObject({ name: 'Plan de prueba' });
        expect(result.days).toHaveLength(2);
        expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ event: 'progress', day: 1 }));
        expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ event: 'progress', day: 2 }));
        expect(onProgress).toHaveBeenCalledWith({ event: 'complete' });
    });

    it('ignora heartbeats y resuelve igual en el complete', async () => {
        const chunks = [
            'data: {"event":"heartbeat"}\n',
            'data: {"event":"complete","data":{"days":[{"day":1,"meals":[]}],"name":"X"}}\n',
        ];
        vi.mocked(fetchWithAuth).mockResolvedValue(makeSSEResponse(chunks));
        const onProgress = vi.fn();

        const result = await generateAIPlanStream({}, onProgress);

        expect(result.name).toBe('X');
        expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'heartbeat' }));
    });
});
