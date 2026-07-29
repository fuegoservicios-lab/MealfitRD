/**
 * [P1-PLAN-POLL-BOUNDED · 2026-07-29] Tests funcionales (fake timers, sin waits
 * reales) del bucle de polling acotado. Cubren los 6 escenarios pedidos por el
 * brief: caso A (activo, promptitud + sobrevive hasta que llega contenido),
 * caso B (dormante, NO se pollea rápido), caso C (nunca progresa, se rinde
 * dentro de la cota), backoff crece/resetea, dedupe de wake (ver
 * dedupeInFlight.test.js — el "no multiplica requests" vive ahí, es una unidad
 * más pequeña y determinística que montar el provider entero), y el incidente
 * exacto (0 días, nunca cambia, incluso con el discriminador fail-open).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlanPollLoop } from '../hooks/usePlanPollLoop';

describe('[P1-PLAN-POLL-BOUNDED] usePlanPollLoop', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('caso A: plan activo — pollea de inmediato, sobrevive, y detecta cuando llega contenido', async () => {
        let daysCount = 0;
        const tick = vi.fn(async () => ({
            daysCount,
            generationStatus: 'partial',
            chunkStatus: { in_flight_count: 1, next_chunk_eta: null },
        }));

        renderHook(() => usePlanPollLoop({
            enabled: true, tick, fastMs: 1000, nearTermMs: 900000, giveUpMs: 60000,
        }));

        // Promptitud: el primer tick no espera al primer intervalo.
        await vi.advanceTimersByTimeAsync(0);
        expect(tick).toHaveBeenCalledTimes(1);

        // Sobrevive varios ciclos SIN contenido nuevo (bien por debajo del give-up).
        await vi.advanceTimersByTimeAsync(20000);
        const callsBeforeContent = tick.mock.calls.length;
        expect(callsBeforeContent).toBeGreaterThan(1);

        // El contenido llega.
        daysCount = 3;
        await vi.advanceTimersByTimeAsync(20000);
        expect(tick.mock.calls.length).toBeGreaterThan(callsBeforeContent);

        // Y sigue vivo DESPUÉS de detectarlo — no se apaga solo porque hubo progreso.
        const callsAfterContent = tick.mock.calls.length;
        await vi.advanceTimersByTimeAsync(20000);
        expect(tick.mock.calls.length).toBeGreaterThan(callsAfterContent);
    });

    it('caso B: semana 1 lista + próximo chunk días afuera → NO se pollea rápido (un solo tick)', async () => {
        const tick = vi.fn(async () => ({
            daysCount: 3,
            generationStatus: 'partial',
            chunkStatus: {
                in_flight_count: 0,
                next_chunk_eta: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            },
        }));

        renderHook(() => usePlanPollLoop({
            enabled: true, tick, fastMs: 1000, nearTermMs: 900000, giveUpMs: 60000,
        }));

        await vi.advanceTimersByTimeAsync(0);
        expect(tick).toHaveBeenCalledTimes(1);

        // 10 minutos virtuales — un plan "dormante" real (medido en vivo: next_chunk_eta
        // días afuera) no debería generar NI UN tick más.
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        expect(tick).toHaveBeenCalledTimes(1);
    });

    it('caso C: nunca progresa (activo para siempre) → se rinde dentro de la cota y DEJA de pollear', async () => {
        const tick = vi.fn(async () => ({
            daysCount: 0,
            generationStatus: 'partial',
            chunkStatus: { in_flight_count: 1, next_chunk_eta: null }, // "activo" siempre
        }));
        const onGiveUpChange = vi.fn();

        renderHook(() => usePlanPollLoop({
            enabled: true, tick, onGiveUpChange, fastMs: 1000, nearTermMs: 900000, giveUpMs: 5000,
        }));

        await vi.advanceTimersByTimeAsync(0);
        expect(tick.mock.calls.length).toBeGreaterThan(0);
        expect(onGiveUpChange).not.toHaveBeenCalledWith(true); // no se rinde al primer intento

        await vi.advanceTimersByTimeAsync(60000); // bien por encima del give-up (5s)
        expect(onGiveUpChange).toHaveBeenCalledWith(true);
        const callsAtGiveup = tick.mock.calls.length;
        expect(callsAtGiveup).toBeGreaterThan(1); // le dio VARIAS oportunidades, no una sola

        // Sigue "para siempre" (en tiempo virtual) sin volver a llamar a tick — terminal.
        await vi.advanceTimersByTimeAsync(300000);
        expect(tick.mock.calls.length).toBe(callsAtGiveup);
    });

    it('caso D (el incidente exacto): partial, 0 días, contenido que NUNCA cambia → acotado, no infinito', async () => {
        // Peor caso a propósito: chunk-status inalcanzable (fail-open del
        // discriminador → "activo" SIEMPRE). Si el give-up no fuera un tope
        // INDEPENDIENTE del discriminador, esto pollearía para siempre — el modo
        // de fallo real del incidente (la fila mala se borró; nunca sabremos qué
        // devolvía su chunk-status, así que probamos el peor escenario posible).
        const tick = vi.fn(async () => ({ daysCount: 0, generationStatus: 'partial', chunkStatus: null }));
        const onGiveUpChange = vi.fn();

        renderHook(() => usePlanPollLoop({
            enabled: true, tick, onGiveUpChange, fastMs: 1000, nearTermMs: 900000, giveUpMs: 5000,
        }));

        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(300000); // 5 minutos virtuales — muy por encima del give-up.

        expect(onGiveUpChange).toHaveBeenCalledWith(true);
        const callsAtBound = tick.mock.calls.length;
        expect(callsAtBound).toBeGreaterThan(0);
        // Acotado: un loop infinito a fastMs=1000 habría hecho ~300 llamadas en
        // esta ventana; el give-up debe cortar muy por debajo de eso.
        expect(callsAtBound).toBeLessThan(50);

        await vi.advanceTimersByTimeAsync(300000); // otros 5 minutos: nada nuevo.
        expect(tick.mock.calls.length).toBe(callsAtBound);
    });

    it('el backoff crece con cada tick sin cambio y RESETEA a fastMs en cuanto hay progreso', async () => {
        const FAST = 1000;
        let daysCount = 0;
        const callTimes = [];
        const tick = vi.fn(async () => {
            callTimes.push(Date.now());
            return {
                daysCount,
                generationStatus: 'partial',
                chunkStatus: { in_flight_count: 1, next_chunk_eta: null },
            };
        });

        renderHook(() => usePlanPollLoop({
            enabled: true, tick, fastMs: FAST, nearTermMs: 900000, giveUpMs: 10 * 60 * 1000,
        }));

        // Corre varios ciclos SIN cambio — tiempo de sobra para que el backoff
        // (multiplier 1.5 default) crezca varias veces.
        await vi.advanceTimersByTimeAsync(30000);
        expect(callTimes.length).toBeGreaterThanOrEqual(4);

        const deltas = [];
        for (let i = 1; i < callTimes.length; i++) deltas.push(callTimes[i] - callTimes[i - 1]);
        for (let i = 1; i < deltas.length; i++) {
            expect(deltas[i]).toBeGreaterThanOrEqual(deltas[i - 1]); // nunca decrece sin progreso
        }
        expect(deltas[deltas.length - 1]).toBeGreaterThan(FAST); // creció más allá del piso

        // El contenido progresa.
        const callsBeforeProgress = callTimes.length;
        daysCount = 1;
        await vi.advanceTimersByTimeAsync(120000);
        expect(callTimes.length).toBeGreaterThan(callsBeforeProgress + 1);
        const tProgressTick = callTimes[callsBeforeProgress]; // primer tick que ve daysCount=1

        // El tick INMEDIATAMENTE posterior al progreso llega a fastMs EXACTO — es
        // un reset, no una continuación del backoff acumulado.
        const resetDelta = callTimes[callsBeforeProgress + 1] - tProgressTick;
        expect(resetDelta).toBe(FAST);
    });

    it('give-up se limpia si `enabled` pasa a false (el plan salió del set activo)', async () => {
        const tick = vi.fn(async () => ({
            daysCount: 0, generationStatus: 'partial', chunkStatus: { in_flight_count: 1, next_chunk_eta: null },
        }));
        const onGiveUpChange = vi.fn();

        const { rerender } = renderHook(
            ({ enabled }) => usePlanPollLoop({
                enabled, tick, onGiveUpChange, fastMs: 1000, nearTermMs: 900000, giveUpMs: 3000,
            }),
            { initialProps: { enabled: true } },
        );

        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(20000);
        expect(onGiveUpChange).toHaveBeenLastCalledWith(true);

        rerender({ enabled: false });
        expect(onGiveUpChange).toHaveBeenLastCalledWith(false);
    });

    it('`resetKey` distinto reinicia el loop (paridad con "re-armar al cambiar de plan")', async () => {
        const tick = vi.fn(async () => ({
            daysCount: 0, generationStatus: 'partial', chunkStatus: { in_flight_count: 1, next_chunk_eta: null },
        }));

        const { rerender } = renderHook(
            ({ resetKey }) => usePlanPollLoop({
                enabled: true, resetKey, tick, fastMs: 1000, nearTermMs: 900000, giveUpMs: 60000,
            }),
            { initialProps: { resetKey: 'plan-a' } },
        );

        await vi.advanceTimersByTimeAsync(0);
        const callsBefore = tick.mock.calls.length;
        expect(callsBefore).toBeGreaterThan(0);

        // Un plan NUEVO (id distinto) reinicia el loop — dispara un tick inmediato
        // propio en vez de esperar al delay acumulado del plan anterior.
        rerender({ resetKey: 'plan-b' });
        await vi.advanceTimersByTimeAsync(0);
        expect(tick.mock.calls.length).toBeGreaterThan(callsBefore);
    });
});
