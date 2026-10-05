import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
vi.mock('../authClient', () => ({
    authClient: { auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        signOut: vi.fn().mockResolvedValue({ error: null }),
    } }, getBackendToken: vi.fn().mockResolvedValue(null), verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));
vi.mock('../utils/firstPartySession', () => ({
    checkFirstPartySession: vi.fn().mockResolvedValue(null), mintFirstPartySession: vi.fn().mockResolvedValue(null),
    logoutFirstPartySession: vi.fn().mockResolvedValue(undefined), adoptOAuthVerifierFirstParty: vi.fn().mockResolvedValue(false),
    FORM_KEY_READY_EVENT: 'mealfit-form-key-ready',
}));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn(), restorePlanFromHistory: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
import { fetchWithAuth } from '../config/api';
import { AssessmentProvider, useAssessment } from '../context/AssessmentContext';
const wrapper = ({ children }) => <AssessmentProvider>{children}</AssessmentProvider>;

describe('completed generation sets dashboard mode without waiting for another profile fetch', () => {
    beforeEach(() => {
        localStorage.clear(); fetchWithAuth.mockReset();
        fetchWithAuth.mockImplementation(async (url) => {
            if (url === '/api/profile') return { ok: true, json: async () => ({ profile: { plan_mode: 'tracking' } }) };
            if (String(url).startsWith('/api/plans-data/latest')) return { ok: true, json: async () => ({ plan: {
                id: 'generated', plan_data: { generation_status: 'complete', days: [{ day: 1, meals: [] }] },
            } }) };
            return { ok: false, status: 401, json: async () => ({}) };
        });
    });
    it.each([true, false])('only a confirmed completion enables plan mode (explicit %s)', async (explicit) => {
        const { result } = renderHook(() => useAssessment(), { wrapper });
        await waitFor(() => expect(result.current.loadingAuth).toBe(false));
        localStorage.setItem('mealfit_user_id', 'test-user');
        await act(async () => { await result.current.refreshProfileAndPlan(); });
        expect(result.current.userProfile.plan_mode).toBe('tracking');
        const calls = fetchWithAuth.mock.calls.filter(([url]) => url === '/api/profile').length;
        await act(async () => { await result.current.hydrateLatestPlan({ force: true, ...(explicit ? { expectPlanId: 'generated', src: 'recovery' } : {}) }); });
        expect(result.current.planData.id).toBe('generated');
        expect(result.current.userProfile.plan_mode).toBe(explicit ? 'plan' : 'tracking');
        if (explicit) expect(localStorage.getItem('mealfit_plan_mode')).toBe('plan');
        expect(fetchWithAuth.mock.calls.filter(([url]) => url === '/api/profile')).toHaveLength(calls);
    });
});
