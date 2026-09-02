import { beforeEach, describe, expect, it } from 'vitest';
import {
    getCachedPausedChunkStatus,
    isPausedChunkStatus,
    reconcilePausedChunkStatus,
    syncPausedChunkStatusCache,
} from '../utils/chunkStatusCache';

const PAUSED = {
    pending_user_action_count: 1,
    in_flight_count: 4,
    paused_chunks: [{ reason_code: 'empty_pantry', days_offset: 3, days_count: 3 }],
};

describe('[P1-PAUSED-BANNER-NO-FLASH] snapshot pausado por plan', () => {
    beforeEach(() => localStorage.clear());

    it('persiste y recupera el último estado pausado del mismo plan', () => {
        syncPausedChunkStatusCache('plan-a', PAUSED);
        expect(getCachedPausedChunkStatus('plan-a')).toEqual(PAUSED);
    });

    it('nunca filtra el aviso de un plan anterior', () => {
        syncPausedChunkStatusCache('plan-a', PAUSED);
        expect(getCachedPausedChunkStatus('plan-b')).toBeNull();
    });

    it('una respuesta fresca sin pausa elimina el snapshot', () => {
        syncPausedChunkStatusCache('plan-a', PAUSED);
        syncPausedChunkStatusCache('plan-a', {
            pending_user_action_count: 0,
            paused_chunks: [],
        });
        expect(getCachedPausedChunkStatus('plan-a')).toBeNull();
    });

    it('exige contador y detalle pausado para no fabricar advertencias', () => {
        expect(isPausedChunkStatus({ pending_user_action_count: 1, paused_chunks: [] })).toBe(false);
        expect(isPausedChunkStatus({ pending_user_action_count: 0, paused_chunks: [{}] })).toBe(false);
    });

    it('ni muchas lecturas intermedias eliminan el aviso durante los ciclos de recovery', () => {
        const retrying = {
            status: 'complete_partial',
            pending_user_action_count: 0,
            paused_chunks: [],
            in_flight_count: 0,
        };
        let state = { status: PAUSED, cleanReads: 0 };
        for (let i = 0; i < 10; i++) {
            state = reconcilePausedChunkStatus(state.status, retrying, state.cleanReads);
        }
        expect(state).toEqual({ status: PAUSED, cleanReads: 0 });
    });

    it('una lectura complete entre reintentos no retira el aviso si el bloque aún falta', () => {
        const complete = {
            status: 'complete',
            pending_user_action_count: 0,
            paused_chunks: [],
            in_flight_count: 0,
        };
        expect(reconcilePausedChunkStatus(PAUSED, complete, 0))
            .toEqual({ status: PAUSED, cleanReads: 0 });
    });

    it('retira el aviso cuando el endpoint está terminal y el bloque ya existe en el plan', () => {
        const complete = {
            status: 'complete',
            pending_user_action_count: 0,
            paused_chunks: [],
            in_flight_count: 0,
        };
        expect(reconcilePausedChunkStatus(PAUSED, complete, 0, { generatedDays: 6 }))
            .toEqual({ status: complete, cleanReads: 0 });
    });
});
