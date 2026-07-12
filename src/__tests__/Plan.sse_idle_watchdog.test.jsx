import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// [P1-SSE-IDLE-WATCHDOG · 2026-07-12] El SSE de generación puede morir en SILENCIO
// en desktop (proxy idle-timeout, cambio de red sin RST): el `await reader.read()`
// queda colgado sin rechazar. Antes NO había timeout durante la lectura del stream
// (el timeoutId de conexión se limpia al llegar los headers), así que el spinner
// "Diseñando tu plan" vivía hasta PIPELINE_TIMEOUT_MS (~16min). El watchdog de
// INACTIVIDAD aborta el reader tras SSE_IDLE_TIMEOUT_MS sin bytes y propaga
// code='sse_idle' para que el caller reconcilie vía pending-status.

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

const enc = (s) => new TextEncoder().encode(s);

describe('[P1-SSE-IDLE-WATCHDOG] watchdog de inactividad del SSE', () => {
    beforeEach(() => {
        vi.mocked(fetchWithAuth).mockReset();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('aborta el reader colgado y rechaza con code="sse_idle" tras el timeout de inactividad', async () => {
        let capturedSignal = null;
        let reads = 0;

        // Response SSE que emite 1 heartbeat y luego se queda MUDA (el 2º read
        // solo resuelve/rechaza si el signal se aborta). Simula el SSE que muere
        // en silencio: sin el watchdog, este read colgaría indefinidamente.
        vi.mocked(fetchWithAuth).mockImplementation(async (_url, opts) => {
            capturedSignal = opts?.signal || null;
            return {
                ok: true,
                status: 200,
                headers: { get: (h) => (h === 'content-type' ? 'text/event-stream' : '') },
                body: {
                    getReader: () => ({
                        read: () => {
                            reads += 1;
                            if (reads === 1) {
                                // primer frame: heartbeat (señal de vida) → re-arma el watchdog
                                return Promise.resolve({ done: false, value: enc('data: {"event":"heartbeat"}\n\n') });
                            }
                            // 2º read: silencio. Solo rechaza si el watchdog aborta el signal.
                            return new Promise((_resolve, reject) => {
                                if (capturedSignal) {
                                    capturedSignal.addEventListener('abort', () => {
                                        const e = new Error('aborted');
                                        e.name = 'AbortError';
                                        reject(e);
                                    });
                                }
                            });
                        },
                    }),
                },
            };
        });

        const promise = generateAIPlanStream({});
        // Adjuntar un catch temprano evita "unhandled rejection" mientras avanzamos timers.
        const settled = promise.then(
            (v) => ({ ok: true, v }),
            (e) => ({ ok: false, e })
        );

        // Deja correr el primer read + el arm del watchdog.
        await vi.advanceTimersByTimeAsync(0);
        // El signal aún no está abortado (heartbeat mantiene vivo el timer).
        expect(capturedSignal?.aborted).toBe(false);

        // Avanza más allá del umbral de inactividad (default 75s) sin más bytes.
        await vi.advanceTimersByTimeAsync(76000);

        const result = await settled;
        expect(result.ok).toBe(false);
        expect(result.e).toMatchObject({ code: 'sse_idle' });
        expect(capturedSignal?.aborted).toBe(true);
    });
});
