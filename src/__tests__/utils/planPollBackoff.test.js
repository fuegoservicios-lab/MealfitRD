/**
 * [P1-PLAN-POLL-BOUNDED · 2026-07-29] Tests puros del discriminador + backoff +
 * give-up que acotan el poll de "nuevas semanas del plan". Ver
 * utils/planPollBackoff.js para la medición completa (distribución real de
 * duración de chunk, cifras del incidente) que justifica cada default.
 */
import { describe, it, expect } from 'vitest';
import {
    PLAN_POLL_FAST_MS,
    PLAN_POLL_NEAR_TERM_ETA_MS,
    PLAN_POLL_BACKOFF_MULTIPLIER,
    PLAN_POLL_BACKOFF_MAX_MS,
    PLAN_POLL_GIVEUP_MS,
    isPlanActiveForFastPoll,
    isPlanInFlight,
    growPollDelay,
    hasContentProgressed,
    hasPollGivenUp,
} from '../../utils/planPollBackoff';

describe('[P1-PLAN-POLL-BOUNDED] defaults medidos', () => {
    it('cadencia rápida = 25s (paridad con el setInterval pre-fix)', () => {
        expect(PLAN_POLL_FAST_MS).toBe(25000);
    });

    it('ventana near-term = 15min (por encima del p95 de duración, 12.7min)', () => {
        expect(PLAN_POLL_NEAR_TERM_ETA_MS).toBe(15 * 60 * 1000);
    });

    it('give-up = 30min: > 1.5x el máximo medido (19.9min) y > 2x el p95 (12.7min)', () => {
        const measuredMaxMs = 1192.5 * 1000; // 19.9min, n=319 últimos 30 días, con reintentos
        const measuredP95Ms = 763.4 * 1000; // 12.7min
        expect(PLAN_POLL_GIVEUP_MS).toBeGreaterThan(measuredMaxMs);
        expect(PLAN_POLL_GIVEUP_MS).toBeGreaterThan(measuredP95Ms * 2);
        expect(PLAN_POLL_GIVEUP_MS).toBe(30 * 60 * 1000);
    });

    it('backoff cap >= cadencia rápida (nunca crece por debajo del piso)', () => {
        expect(PLAN_POLL_BACKOFF_MAX_MS).toBeGreaterThanOrEqual(PLAN_POLL_FAST_MS);
    });
});

describe('[P1-PLAN-POLL-BOUNDED] isPlanActiveForFastPoll · discriminador', () => {
    it('fail-open: chunkStatus null/undefined → activo (nunca demorar caso A por falta de dato)', () => {
        expect(isPlanActiveForFastPoll(null, Date.now())).toBe(true);
        expect(isPlanActiveForFastPoll(undefined, Date.now())).toBe(true);
    });

    it('in_flight_count > 0 → activo, sin importar next_chunk_eta', () => {
        expect(isPlanActiveForFastPoll({ in_flight_count: 1, next_chunk_eta: null }, Date.now())).toBe(true);
    });

    it('in_flight_count === 0 y next_chunk_eta lejano (días) → dormante', () => {
        const now = Date.now();
        const farEta = new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 días
        expect(isPlanActiveForFastPoll({ in_flight_count: 0, next_chunk_eta: farEta }, now)).toBe(false);
    });

    it('in_flight_count === 0 y next_chunk_eta null → dormante', () => {
        expect(isPlanActiveForFastPoll({ in_flight_count: 0, next_chunk_eta: null }, Date.now())).toBe(false);
    });

    it('in_flight_count === 0 pero next_chunk_eta DENTRO de la ventana near-term → activo', () => {
        const now = Date.now();
        const soonEta = new Date(now + 5 * 60 * 1000).toISOString(); // 5min
        expect(isPlanActiveForFastPoll({ in_flight_count: 0, next_chunk_eta: soonEta }, now)).toBe(true);
    });

    it('el borde exacto de la ventana near-term cuenta como activo (<=)', () => {
        const now = 1000000;
        const eta = new Date(now + 900000).toISOString(); // exactamente nearTermMs=900000
        expect(isPlanActiveForFastPoll({ in_flight_count: 0, next_chunk_eta: eta }, now, 900000)).toBe(true);
        const etaJustOver = new Date(now + 900001).toISOString();
        expect(isPlanActiveForFastPoll({ in_flight_count: 0, next_chunk_eta: etaJustOver }, now, 900000)).toBe(false);
    });

    it('next_chunk_eta con formato inválido → tratado como ausente (dormante si in_flight=0)', () => {
        expect(isPlanActiveForFastPoll({ in_flight_count: 0, next_chunk_eta: 'not-a-date' }, Date.now())).toBe(false);
    });

    it('6 planes reales medidos en vivo (next_chunk_eta 2-27 días out) → dormantes', () => {
        const now = Date.now();
        const daysOut = [2, 5, 9, 14, 20, 27];
        for (const d of daysOut) {
            const eta = new Date(now + d * 24 * 60 * 60 * 1000).toISOString();
            expect(isPlanActiveForFastPoll({ in_flight_count: 0, next_chunk_eta: eta }, now)).toBe(false);
        }
    });
});

describe('[P1-PLAN-POLL-INFLIGHT-NO-BACKOFF · 2026-07-29] isPlanInFlight · sub-señal "cocinando ahora mismo"', () => {
    it('in_flight_count > 0 → true', () => {
        expect(isPlanInFlight({ in_flight_count: 1, next_chunk_eta: null })).toBe(true);
        expect(isPlanInFlight({ in_flight_count: 3, next_chunk_eta: null })).toBe(true);
    });

    it('in_flight_count === 0 → false, aunque next_chunk_eta esté DENTRO de la ventana near-term', () => {
        // Distingue de `isPlanActiveForFastPoll`: ese discriminador dice "activo" (seguir
        // pollenado) para el caso "nada corriendo aún, pero se espera pronto" — pero ESE
        // sub-caso sí debe poder pagar backoff (no hay trabajo real en curso todavía).
        const soonEta = new Date(Date.now() + 60 * 1000).toISOString();
        expect(isPlanInFlight({ in_flight_count: 0, next_chunk_eta: soonEta })).toBe(false);
    });

    it('in_flight_count ausente/no numérico → false', () => {
        expect(isPlanInFlight({ next_chunk_eta: null })).toBe(false);
        expect(isPlanInFlight({ in_flight_count: 'nope', next_chunk_eta: null })).toBe(false);
    });

    it('fail-CLOSED (false) cuando chunkStatus es null/undefined — a diferencia de isPlanActiveForFastPoll', () => {
        // No autoriza asumir "cocinando ahora mismo" solo porque el dato falta — eso
        // congelaría el backoff en fastMs indefinidamente para el caso benigno "el fetch
        // de /chunk-status falló pero el plan real está dormido". El fail-OPEN de "seguir
        // pollenado en vez de detenerse" ya lo cubre isPlanActiveForFastPoll por separado.
        expect(isPlanInFlight(null)).toBe(false);
        expect(isPlanInFlight(undefined)).toBe(false);
        expect(isPlanActiveForFastPoll(null, Date.now())).toBe(true); // contraste explícito
    });
});

describe('[P1-PLAN-POLL-BOUNDED] growPollDelay · backoff geométrico', () => {
    it('crece por el multiplier configurado', () => {
        const d1 = growPollDelay(PLAN_POLL_FAST_MS);
        expect(d1).toBe(Math.round(PLAN_POLL_FAST_MS * PLAN_POLL_BACKOFF_MULTIPLIER));
    });

    it('sigue creciendo tick a tick', () => {
        let d = PLAN_POLL_FAST_MS;
        const seen = [d];
        for (let i = 0; i < 5; i++) {
            d = growPollDelay(d);
            seen.push(d);
        }
        for (let i = 1; i < seen.length; i++) {
            expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
        }
    });

    it('nunca excede el cap configurado', () => {
        let d = PLAN_POLL_FAST_MS;
        for (let i = 0; i < 20; i++) d = growPollDelay(d);
        expect(d).toBeLessThanOrEqual(PLAN_POLL_BACKOFF_MAX_MS);
        expect(d).toBe(PLAN_POLL_BACKOFF_MAX_MS);
    });

    it('delay actual inválido (0/NaN/undefined) → usa fastMs como base', () => {
        expect(growPollDelay(0)).toBe(Math.round(PLAN_POLL_FAST_MS * PLAN_POLL_BACKOFF_MULTIPLIER));
        expect(growPollDelay(NaN)).toBe(Math.round(PLAN_POLL_FAST_MS * PLAN_POLL_BACKOFF_MULTIPLIER));
        expect(growPollDelay(undefined)).toBe(Math.round(PLAN_POLL_FAST_MS * PLAN_POLL_BACKOFF_MULTIPLIER));
    });

    it('overrides explícitos (fastMs/multiplier/maxMs) se respetan', () => {
        expect(growPollDelay(1000, { fastMs: 1000, multiplier: 2, maxMs: 5000 })).toBe(2000);
        expect(growPollDelay(4000, { fastMs: 1000, multiplier: 2, maxMs: 5000 })).toBe(5000); // clamp
    });
});

describe('[P1-PLAN-POLL-BOUNDED] hasContentProgressed · señal de reset', () => {
    it('primer snapshot (prev=null) siempre cuenta como progreso', () => {
        expect(hasContentProgressed(null, { daysCount: 0, generationStatus: 'partial' })).toBe(true);
    });

    it('mismo daysCount + mismo status → sin progreso', () => {
        const a = { daysCount: 3, generationStatus: 'partial' };
        const b = { daysCount: 3, generationStatus: 'partial' };
        expect(hasContentProgressed(a, b)).toBe(false);
    });

    it('daysCount creció → progreso', () => {
        expect(hasContentProgressed({ daysCount: 3, generationStatus: 'partial' }, { daysCount: 6, generationStatus: 'partial' })).toBe(true);
    });

    it('generation_status cambió (p.ej. partial→complete) → progreso, aunque daysCount no cambie', () => {
        expect(hasContentProgressed({ daysCount: 3, generationStatus: 'partial' }, { daysCount: 3, generationStatus: 'complete' })).toBe(true);
    });

    it('el incidente exacto: daysCount=0 constante, status constante → NUNCA progresa', () => {
        const snap = { daysCount: 0, generationStatus: 'partial' };
        expect(hasContentProgressed(snap, { ...snap })).toBe(false);
    });
});

describe('[P1-PLAN-POLL-BOUNDED] hasPollGivenUp · tope duro', () => {
    it('elapsed < giveUpMs → no se rinde', () => {
        expect(hasPollGivenUp(0, PLAN_POLL_GIVEUP_MS - 1, PLAN_POLL_GIVEUP_MS)).toBe(false);
    });

    it('elapsed === giveUpMs → se rinde (inclusive)', () => {
        expect(hasPollGivenUp(0, PLAN_POLL_GIVEUP_MS, PLAN_POLL_GIVEUP_MS)).toBe(true);
    });

    it('elapsed > giveUpMs → se rinde', () => {
        expect(hasPollGivenUp(0, PLAN_POLL_GIVEUP_MS + 1, PLAN_POLL_GIVEUP_MS)).toBe(true);
    });

    it('activeSinceMs no numérico → nunca se rinde (fail-safe: no abandonar sin reloj)', () => {
        expect(hasPollGivenUp(null, Date.now(), PLAN_POLL_GIVEUP_MS)).toBe(false);
        expect(hasPollGivenUp(undefined, Date.now(), PLAN_POLL_GIVEUP_MS)).toBe(false);
        expect(hasPollGivenUp(NaN, Date.now(), PLAN_POLL_GIVEUP_MS)).toBe(false);
    });
});
