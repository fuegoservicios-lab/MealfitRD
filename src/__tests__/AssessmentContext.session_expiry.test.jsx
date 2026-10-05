import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
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
import { AssessmentProvider, useAssessment } from '../context/AssessmentContext';
const wrapper = ({ children }) => <AssessmentProvider>{children}</AssessmentProvider>;

import { toast } from 'sonner';
import { logoutFirstPartySession } from '../utils/firstPartySession';

describe('session expiry after intentional logout', () => {
    beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
    afterEach(() => localStorage.clear());
    it('ignores a late expiry event when the user has already signed out', async () => {
        const { result } = renderHook(() => useAssessment(), { wrapper });
        await waitFor(() => expect(result.current.loadingAuth).toBe(false));
        await act(async () => { window.dispatchEvent(new CustomEvent('mealfit:session-expired')); });
        expect(toast.error).not.toHaveBeenCalled();
        expect(logoutFirstPartySession).not.toHaveBeenCalled();
    });
    it('still reports expiration when an authenticated session is present', async () => {
        const { result } = renderHook(() => useAssessment(), { wrapper });
        await waitFor(() => expect(result.current.loadingAuth).toBe(false));
        localStorage.setItem('mealfit_mf_session', 'expired-session');
        await act(async () => { window.dispatchEvent(new CustomEvent('mealfit:session-expired')); });
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Tu sesión expiró', expect.any(Object)));
        expect(logoutFirstPartySession).toHaveBeenCalledTimes(1);
    });
});
