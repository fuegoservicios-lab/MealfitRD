import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), hydrate: vi.fn(), preload: vi.fn(), fetch: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate, useLocation: () => ({ pathname: '/plan' }) }));
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => ({ hydrateLatestPlan: mocks.hydrate }) }));
vi.mock('../config/api', () => ({ fetchWithAuth: mocks.fetch }));
vi.mock('../utils/precargaDePaginas', () => ({ precargarLlegadaAlPanel: mocks.preload }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import PendingPipelineRecovery from '../components/PendingPipelineRecovery';

describe('ready plan arrival does not wait for acknowledgement', () => {
    beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
    it.each([false, true])('adopts before clearing/navigating, even with ack still pending (local flag %s)', async (flag) => {
        if (flag) localStorage.setItem('mealfit_plan_in_progress', JSON.stringify({ started_at: new Date().toISOString() }));
        let finishHydration;
        mocks.hydrate.mockImplementation(() => new Promise((resolve) => { finishHydration = resolve; }));
        mocks.fetch.mockImplementation((url) => String(url).includes('/ack')
            ? new Promise(() => {})
            : Promise.resolve({ ok: true, json: async () => ({ status: 'complete', plan_id_final: 'ready-plan' }) }));
        render(<PendingPipelineRecovery />);
        await waitFor(() => expect(mocks.hydrate).toHaveBeenCalledWith({ force: true, expectPlanId: 'ready-plan', src: 'recovery' }));
        expect(mocks.navigate).not.toHaveBeenCalled();
        expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes('/ack'))).toBe(false);
        if (flag) expect(localStorage.getItem('mealfit_plan_in_progress')).not.toBeNull();
        expect(mocks.preload).toHaveBeenCalledWith({ inmediata: true });
        await act(async () => finishHydration(true));
        await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
        expect(localStorage.getItem('mealfit_plan_in_progress')).toBeNull();
        expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes('/ack'))).toBe(true);
    });
});
