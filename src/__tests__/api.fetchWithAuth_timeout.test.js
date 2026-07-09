/**
 * [P1-5 · request timeout en fetchWithAuth] Tests del timeout a nivel de request.
 *
 * Bug vivo (es-DO móvil): `fetchWithAuth` solo tenía timeout del lookup de token,
 * NO del request. En una conexión colgada-pero-abierta, los callers sin blindar
 * (Recipes expand/consume, useRegeneratePlan, SupermarketPage) quedaban en
 * `loading=true` PARA SIEMPRE — sin error, sin retry.
 *
 * Contrato post-fix:
 *   - Timeout default (knob `VITE_FETCH_TIMEOUT_MS`, default 60s) que aborta el
 *     request y rechaza con `err.code === 'request_timeout'` → el caller apaga
 *     el spinner y ofrece reintentar, en vez de colgarse.
 *   - EXENTO el pipeline de generación (`/plans/analyze[/stream]`) que corre
 *     minutos con su propio `PIPELINE_TIMEOUT_MS` — jamás debe ser abortado por
 *     el default. La exención vive en api.js (Plan.jsx no se toca).
 *   - Override per-caller vía `options.timeout` (0 = desactiva; N = ms custom).
 *   - Backward-compat: `options.signal` del caller se sigue respetando (compuesto).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mockeamos authClient para que getBackendToken resuelva inmediato (sin cargar
// el cliente real de Neon, que throwea sin VITE_NEON_AUTH_URL).
vi.mock('../authClient', () => ({
    getBackendToken: vi.fn().mockResolvedValue('test-token'),
}));

import { fetchWithAuth, resolveRequestTimeout, DEFAULT_REQUEST_TIMEOUT_MS } from '../config/api';

describe('resolveRequestTimeout · resolución pura (default / exención / override)', () => {
    it('endpoint normal → timeout default', () => {
        expect(resolveRequestTimeout('/api/plans/history-list')).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    });

    it('pipeline de generación stream → EXENTO (0)', () => {
        expect(resolveRequestTimeout('/api/plans/analyze/stream')).toBe(0);
    });

    it('pipeline de generación síncrono (fallback) → EXENTO (0)', () => {
        expect(resolveRequestTimeout('/api/plans/analyze')).toBe(0);
    });

    it('override del caller timeout:0 → desactiva (0), incluso en endpoint normal', () => {
        expect(resolveRequestTimeout('/api/plans/history-list', { timeout: 0 })).toBe(0);
    });

    it('override del caller timeout:N → usa N', () => {
        expect(resolveRequestTimeout('/api/x', { timeout: 5000 })).toBe(5000);
    });
});

describe('fetchWithAuth · abort por timeout (fake timers)', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('request que excede el timeout → rechaza con code request_timeout', async () => {
        // fetch que solo se resuelve/rechaza cuando su signal aborta (simula
        // conexión colgada que responde a AbortController).
        const fetchMock = vi.fn((_url, opts) => new Promise((_resolve, reject) => {
            opts.signal?.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
        }));
        vi.stubGlobal('fetch', fetchMock);

        const promise = fetchWithAuth('/api/slow', { timeout: 5000 });
        const expectation = expect(promise).rejects.toMatchObject({ code: 'request_timeout' });
        await vi.advanceTimersByTimeAsync(5000);
        await expectation;
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('timeout:0 (opt-out estilo SSE) → NO aborta aunque pase el tiempo', async () => {
        let aborted = false;
        const fetchMock = vi.fn((_url, opts) => new Promise((resolve) => {
            opts.signal?.addEventListener('abort', () => { aborted = true; });
            // resuelve rápido: no depende del timer
            resolve(new Response('ok'));
        }));
        vi.stubGlobal('fetch', fetchMock);

        const res = await fetchWithAuth('/api/stream', { timeout: 0 });
        await vi.advanceTimersByTimeAsync(120000);
        expect(aborted).toBe(false);
        expect(res).toBeInstanceOf(Response);
    });
});

describe('fetchWithAuth · request rápido resuelve normal', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('respuesta rápida → retorna la Response, sin rechazo', async () => {
        const fetchMock = vi.fn(() => Promise.resolve(new Response('{"ok":true}', { status: 200 })));
        vi.stubGlobal('fetch', fetchMock);

        const res = await fetchWithAuth('/api/fast', { timeout: 5000 });
        expect(res.status).toBe(200);
    });
});
