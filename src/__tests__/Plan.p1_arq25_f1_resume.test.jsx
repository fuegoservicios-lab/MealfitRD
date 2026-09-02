/**
 * [P1-ARQ25-F1-CLOSE · 2026-09-02] Reanudar un run de la cola por su estado.
 *
 * Vivo (kill test 1, 11:14 UTC): SIGKILL al backend a mitad del LLM cortó el tail de
 * eventos; el catch trataba la caída como "SSE roto" → endpoint síncrono (en la cola es
 * OTRO plan, I19) → "Sin conexión con la IA" → el usuario de vuelta al formulario, con el
 * run vivo y el zombie rescue a punto de terminarlo.
 *
 * Funcional sobre `resumeQueueRunUntilReady` con `fetch` mockeado, y de fuente sobre el
 * orden de las ramas del catch (la reanudación va ANTES del fallback síncrono).
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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(_dir, '../pages/Plan.jsx'), 'utf8');

const jsonResp = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    clone() { return this; },
});

describe('P1-ARQ25-F1-CLOSE · resumeQueueRunUntilReady', () => {
    beforeEach(() => {
        vi.mocked(fetchWithAuth).mockReset();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('sigue esperando mientras el run corre, tolera la red caída y devuelve el plan en PLAN_READY', async () => {
        const plan = { id: 'p1', days: [{ day: 1, meals: [{ name: 'x' }] }], revision: 3 };
        const responses = [
            () => { throw new TypeError('Failed to fetch'); },           // backend reiniciando
            () => jsonResp({ status: 'RUNNING', availability: 'NONE' }),
            () => jsonResp({ status: 'RUNNING', availability: 'NONE', plan: { days: [] } }),
            () => jsonResp({ status: 'COMPLETED', availability: 'PLAN_READY', plan }),
        ];
        vi.mocked(fetchWithAuth).mockImplementation(async () => responses.shift()());
        const { resumeQueueRunUntilReady } = await import('../pages/Plan.jsx');
        const onProgress = vi.fn();
        const promise = resumeQueueRunUntilReady('run-1', { onProgress });
        for (let i = 0; i < 4; i += 1) {
            await vi.advanceTimersByTimeAsync(10_000);
        }
        const result = await promise;
        expect(result).toEqual(plan);
        expect(onProgress).toHaveBeenCalledWith({ event: 'complete' });
        expect(onProgress.mock.calls.some(([ev]) => ev.event === 'phase' && ev.data.phase === 'recovering')).toBe(true);
    });

    it('run FAILED ⇒ error con el código del run; run CANCELLED ⇒ UserCancelled', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(async () => jsonResp({ status: 'FAILED', error_code: 'pipeline_error', error_message: 'boom' }));
        const { resumeQueueRunUntilReady } = await import('../pages/Plan.jsx');
        await expect(resumeQueueRunUntilReady('run-2')).rejects.toMatchObject({ code: 'pipeline_error', message: 'boom' });
        vi.mocked(fetchWithAuth).mockImplementation(async () => jsonResp({ status: 'CANCELLED' }));
        await expect(resumeQueueRunUntilReady('run-3')).rejects.toThrow('UserCancelled');
    });

    it('PLAN_READY sin días reales NO se acepta (H5): sigue esperando', async () => {
        const calls = [
            () => jsonResp({ status: 'COMPLETED', availability: 'PLAN_READY', plan: { days: [] } }),
            () => jsonResp({ status: 'COMPLETED', availability: 'PLAN_READY', plan: { days: [{ day: 1 }] } }),
        ];
        vi.mocked(fetchWithAuth).mockImplementation(async () => calls.shift()());
        const { resumeQueueRunUntilReady } = await import('../pages/Plan.jsx');
        const promise = resumeQueueRunUntilReady('run-4');
        await vi.advanceTimersByTimeAsync(10_000);
        await vi.advanceTimersByTimeAsync(10_000);
        expect((await promise).days).toHaveLength(1);
    });
});

describe('P1-ARQ25-F1-CLOSE · el catch reanuda por run antes de cualquier fallback', () => {
    it('la rama de reanudación va después de las terminales y ANTES de llm_unavailable / síncrono', () => {
        const resume = src.indexOf("} else if (queueRunId && error.code !== 'quota_exceeded' && error.code !== 'rate_limited') {");
        const critical = src.indexOf("} else if (error.code === 'critical_restriction') {");
        const llm = src.indexOf("} else if (error.code === 'llm_unavailable') {");
        const sync = src.indexOf('intentando endpoint síncrono');
        expect(resume).toBeGreaterThan(critical);
        expect(resume).toBeLessThan(llm);
        expect(llm).toBeLessThan(sync);
        expect(src.slice(resume, resume + 900)).toContain('return await resumeQueueRunUntilReady(queueRunId');
    });

    it('el watchdog de inactividad también reanuda por run en vez de tirar sse_idle', () => {
        const idle = src.indexOf('watchdog de inactividad');
        const win = src.slice(idle, idle + 700);
        expect(win).toContain('if (queueRunId) {');
        expect(win.indexOf('resumeQueueRunUntilReady')).toBeLessThan(win.indexOf("idleErr.code = 'sse_idle'"));
    });

    it('queueRunId se fija al crear el run y solo ahí', () => {
        expect(src).toContain('queueRunId = run.run_id;');
        expect(src.match(/queueRunId = run\.run_id;/g)).toHaveLength(1);
        expect(src.match(/let queueRunId = null;/g)).toHaveLength(1);
    });
});
