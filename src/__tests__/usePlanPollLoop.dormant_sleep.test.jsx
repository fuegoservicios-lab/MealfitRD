// [P2-PLAN-POLL-DORMANT-SLEEP · 2026-09-04] El banner «Dejamos de revisar si llegaron tus próximas
// semanas…» salía en cada plan SANO cuyo siguiente bloque estaba programado para más adelante, cada
// vez que el dueño dejaba la pestaña un rato, y solo se iba refrescando la página. Dormido no es
// rendido: latido largo, despertar al volver a la pestaña, give-up solo para la pantalla muda (0 días),
// y «Revisar ahora» reinicia el loop de verdad.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { usePlanPollLoop } from '../hooks/usePlanPollLoop';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const dormant = (daysCount) => async () => ({
    daysCount,
    generationStatus: 'partial',
    chunkStatus: { in_flight_count: 0, next_chunk_eta: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() },
});

describe('[P2-PLAN-POLL-DORMANT-SLEEP] dormido no es rendido', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('plan sano dormido: NO avisa give-up, late cada dormantMs, y despierta al volver a la pestaña', async () => {
        const tick = vi.fn(dormant(3));
        const onGiveUpChange = vi.fn();
        renderHook(() => usePlanPollLoop({
            enabled: true, tick, onGiveUpChange, fastMs: 1000, nearTermMs: 900000, giveUpMs: 60000, dormantMs: 5 * 60 * 1000,
        }));
        await vi.advanceTimersByTimeAsync(0);
        expect(tick).toHaveBeenCalledTimes(1);
        expect(onGiveUpChange).not.toHaveBeenCalledWith(true);
        // latido largo: a los 4 min nada, a los 5 otro tick
        await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
        expect(tick).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(60 * 1000 + 10);
        expect(tick).toHaveBeenCalledTimes(2);
        // el reloj de give-up no corre dormido: 60 s de giveUpMs, 5 min dormido, sigue sin rendirse
        expect(onGiveUpChange).not.toHaveBeenCalledWith(true);
        // volver a la pestaña despierta de inmediato
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
        expect(tick).toHaveBeenCalledTimes(3);
    });

    it('pantalla muda (0 días) dormida: SÍ avisa give-up (se conserva la señal de P1-PLAN-POLL-DORMANT-GIVEUP-SIGNAL)', async () => {
        const tick = vi.fn(dormant(0));
        const onGiveUpChange = vi.fn();
        renderHook(() => usePlanPollLoop({ enabled: true, tick, onGiveUpChange, fastMs: 1000, nearTermMs: 900000, giveUpMs: 60000 }));
        await vi.advanceTimersByTimeAsync(0);
        expect(onGiveUpChange).toHaveBeenCalledWith(true);
    });

    it('«Revisar ahora» reinicia el loop: resetKey distinto → give-up limpio y nuevo tick', async () => {
        const tick = vi.fn(dormant(0));
        const onGiveUpChange = vi.fn();
        let resetKey = 'plan#0';
        const { rerender } = renderHook(() => usePlanPollLoop({ enabled: true, resetKey, tick, onGiveUpChange, fastMs: 1000, nearTermMs: 900000, giveUpMs: 60000 }));
        await vi.advanceTimersByTimeAsync(0);
        expect(onGiveUpChange).toHaveBeenLastCalledWith(true);
        resetKey = 'plan#1';
        rerender();
        expect(onGiveUpChange).toHaveBeenLastCalledWith(false);
        await vi.advanceTimersByTimeAsync(0);
        expect(tick).toHaveBeenCalledTimes(2);
    });

    it('el cableado: el contexto expone restartPlanPoll y el CTA del banner lo llama', () => {
        const ctx = read('src/context/AssessmentContext.jsx');
        expect(ctx).toContain('const restartPlanPoll = useCallback(() => {');
        expect(ctx).toContain("resetKey: `${planData?.id ?? ''}#${pollRestartNonce}`,");
        const dash = read('src/pages/Dashboard.jsx');
        expect(dash).toContain("hydrateLatestPlan?.({ force: true, src: 'give-up-retry' }); restartPlanPoll?.();");
    });
});
