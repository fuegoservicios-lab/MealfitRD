/**
 * [P2-3 · quota→TanStack] getFreshPlanCount reemplaza a window.__cachedQuota:
 * key por usuario + TTL por callsite + dedup, y se evicta con
 * clearUserQueryCache() (logout) — la clase de fuga cross-user queda
 * estructuralmente cerrada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFreshPlanCount, invalidatePlanCountCache } from '../../utils/quotaCache';
import { queryClient, clearUserQueryCache } from '../../queryClient';

describe('quotaCache (P2-3)', () => {
    beforeEach(() => {
        queryClient.clear();
    });

    it('cachea dentro del TTL (segunda llamada NO refetchea)', async () => {
        const fetcher = vi.fn().mockResolvedValue(3);
        expect(await getFreshPlanCount('u1', fetcher, { ttlMs: 60_000 })).toBe(3);
        expect(await getFreshPlanCount('u1', fetcher, { ttlMs: 60_000 })).toBe(3);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('keys separadas por usuario (sin fuga cross-user)', async () => {
        const fetcherA = vi.fn().mockResolvedValue(5);
        const fetcherB = vi.fn().mockResolvedValue(0);
        expect(await getFreshPlanCount('userA', fetcherA, { ttlMs: 60_000 })).toBe(5);
        expect(await getFreshPlanCount('userB', fetcherB, { ttlMs: 60_000 })).toBe(0);
        expect(fetcherB).toHaveBeenCalledTimes(1);
    });

    it('clearUserQueryCache() evicta el conteo (teardown de logout)', async () => {
        const fetcher = vi.fn().mockResolvedValue(7);
        await getFreshPlanCount('u1', fetcher, { ttlMs: 60_000 });
        clearUserQueryCache();
        await getFreshPlanCount('u1', fetcher, { ttlMs: 60_000 });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('invalidatePlanCountCache fuerza refetch del usuario', async () => {
        const fetcher = vi.fn().mockResolvedValue(1);
        await getFreshPlanCount('u1', fetcher, { ttlMs: 60_000 });
        invalidatePlanCountCache('u1');
        await getFreshPlanCount('u1', fetcher, { ttlMs: 60_000 });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('propaga el error del fetcher (fail-open decide el caller)', async () => {
        const fetcher = vi.fn().mockRejectedValue(new Error('network'));
        await expect(getFreshPlanCount('u1', fetcher, { ttlMs: 1000 })).rejects.toThrow('network');
    });
});
