/**
 * [P1-PLAN-POLL-BOUNDED · 2026-07-29] `createInFlightDedupe` — cierra "alt-
 * tabbing repetido multiplica requests": AssessmentContext lo usa para que el
 * wake/focus (unconditional, dispara en CADA tab-switch) no apile un fetch
 * sobre un poll de 25s ya en curso.
 */
import { describe, it, expect, vi } from 'vitest';
import { createInFlightDedupe } from '../../utils/dedupeInFlight';

function deferred() {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
}

describe('[P1-PLAN-POLL-BOUNDED] createInFlightDedupe', () => {
    it('llamadas concurrentes mientras la primera sigue en vuelo → UN SOLO fetch real', async () => {
        const d = deferred();
        const fn = vi.fn(() => d.promise);
        const wrapped = createInFlightDedupe(fn);

        // Simula 5 eventos de foco en ráfaga (alt-tabbing) mientras el primer
        // fetch todavía no resolvió.
        const p1 = wrapped();
        const p2 = wrapped();
        const p3 = wrapped();
        const p4 = wrapped();
        const p5 = wrapped();

        expect(fn).toHaveBeenCalledTimes(1); // NO 5 — el requisito exacto del test.

        d.resolve('plan-data');
        const results = await Promise.all([p1, p2, p3, p4, p5]);
        expect(results).toEqual(['plan-data', 'plan-data', 'plan-data', 'plan-data', 'plan-data']);
    });

    it('tras resolver, una llamada NUEVA sí dispara otro fetch (no queda pegado en dedupe)', async () => {
        const fn = vi.fn()
            .mockResolvedValueOnce('first')
            .mockResolvedValueOnce('second');
        const wrapped = createInFlightDedupe(fn);

        const r1 = await wrapped();
        expect(r1).toBe('first');
        expect(fn).toHaveBeenCalledTimes(1);

        const r2 = await wrapped();
        expect(r2).toBe('second');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('un rechazo libera el slot: la siguiente llamada dispara un fetch nuevo, no queda trabado', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('network blip'))
            .mockResolvedValueOnce('recovered');
        const wrapped = createInFlightDedupe(fn);

        await expect(wrapped()).rejects.toThrow('network blip');
        expect(fn).toHaveBeenCalledTimes(1);

        const r2 = await wrapped();
        expect(r2).toBe('recovered');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('llamadas con argumentos DISTINTOS mientras hay una en vuelo igual comparten la promesa (no distingue args)', async () => {
        const d = deferred();
        const fn = vi.fn(() => d.promise);
        const wrapped = createInFlightDedupe(fn);

        wrapped({ src: 'poll' });
        wrapped({ src: 'wake' });

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith({ src: 'poll' }); // solo la PRIMERA llamada real
        d.resolve(true);
    });
});
