import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
import { fetchWithAuth } from '../config/api';
const response = (status) => ({ ok: true, json: async () => ({ status }) });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

describe('pending plan status on foreground', () => {
    beforeEach(() => { vi.resetModules(); fetchWithAuth.mockReset(); localStorage.clear(); });
    afterEach(() => vi.restoreAllMocks());
    it('shares simultaneous page/recovery requests but always refreshes settled status', async () => {
        const pending = deferred();
        fetchWithAuth.mockReturnValueOnce(pending.promise).mockResolvedValue(response('complete'));
        const { readPendingPlanStatus } = await import('../utils/pendingPlanStatus');
        const page = readPendingPlanStatus();
        expect(readPendingPlanStatus()).toBe(page);
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        pending.resolve(response('generating'));
        expect(await page).toEqual({ status: 'generating' });
        expect(await readPendingPlanStatus()).toEqual({ status: 'complete' });
        expect(fetchWithAuth).toHaveBeenCalledTimes(2);
    });
    it('does not reuse a request frozen in the background or clear its newer replacement', async () => {
        let now = 0; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const old = deferred(); const fresh = deferred();
        fetchWithAuth.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
        const { readPendingPlanStatus } = await import('../utils/pendingPlanStatus');
        const first = readPendingPlanStatus(); now = 2000;
        const second = readPendingPlanStatus(); expect(second).not.toBe(first);
        old.resolve(response('generating')); await first;
        expect(readPendingPlanStatus()).toBe(second);
        fresh.resolve(response('complete')); expect(await second).toEqual({ status: 'complete' });
    });
    it('isolates account/session changes and encodes the guest session', async () => {
        fetchWithAuth.mockImplementation(() => new Promise(() => {}));
        const { readPendingPlanStatus } = await import('../utils/pendingPlanStatus');
        localStorage.setItem('mealfit_user_id', 'one'); const one = readPendingPlanStatus();
        localStorage.setItem('mealfit_user_id', 'two'); expect(readPendingPlanStatus()).not.toBe(one);
        localStorage.setItem('mealfit_guest_session_id', 'guest /x'); readPendingPlanStatus();
        expect(fetchWithAuth).toHaveBeenLastCalledWith('/api/plans/pending-status?session_id=guest%20%2Fx', { method: 'GET' });
    });
    it('retries after a failed request', async () => {
        fetchWithAuth.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response('complete'));
        const { readPendingPlanStatus } = await import('../utils/pendingPlanStatus');
        expect(await readPendingPlanStatus()).toBeNull();
        expect(await readPendingPlanStatus()).toEqual({ status: 'complete' });
    });
});
