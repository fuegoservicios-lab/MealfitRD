/**
 * [P1-10 · characterization de AssessmentContext] Monta el provider REAL (3315
 * líneas) vía renderHook y ancla el invariante de seguridad más importante: el
 * GUARD I3 de ownership en restorePlan (AssessmentContext.jsx:2813, P1-NEW-4).
 *
 * Antes de este test AssessmentContext solo se aseveraba con regex sobre el
 * source; los component tests mockean useAssessment ENTERO, así que el provider
 * real podía romperse sin que nada fallara. Este es la RED que hace seguro
 * memoizar (P1-8) y luego dividir (P3-6) el provider.
 *
 * Guard I3: restorePlan(plan, expectedUserId) NO debe pisar planData local si el
 * usuario actual (session.user.id || localStorage 'mealfit_user_id') difiere de
 * expectedUserId — defensa client-side contra pintar un plan ajeno (IDOR read-only).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mocks para que el provider monte limpio en estado "sin sesión".
vi.mock('../authClient', () => ({
    authClient: {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
            getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
            signOut: vi.fn().mockResolvedValue({ error: null }),
        },
    },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock('../utils/firstPartySession', () => ({
    checkFirstPartySession: vi.fn().mockResolvedValue(null),
    mintFirstPartySession: vi.fn().mockResolvedValue(null),
    logoutFirstPartySession: vi.fn().mockResolvedValue(undefined),
    adoptOAuthVerifierFirstParty: vi.fn().mockResolvedValue(false),
    FORM_KEY_READY_EVENT: 'mealfit-form-key-ready',
}));

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    restorePlanFromHistory: vi.fn().mockResolvedValue({ ok: false }),
}));

// vi.hoisted: vi.mock se iza al tope del archivo; sin esto `toastError` no existe aún.
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { AssessmentProvider, useAssessment } from '../context/AssessmentContext';

const wrapper = ({ children }) => <AssessmentProvider>{children}</AssessmentProvider>;

const PLAN = { days: [{ day: 1, meals: [] }], name: 'PlanRestaurado', _test: true };

async function mountSettled() {
    const hook = renderHook(() => useAssessment(), { wrapper });
    await waitFor(() => expect(hook.result.current.loadingAuth).toBe(false));
    return hook;
}

describe('AssessmentContext · guard I3 de restorePlan (P1-10)', () => {
    beforeEach(() => {
        localStorage.clear();
        toastError.mockClear();
    });
    afterEach(() => { vi.clearAllTimers?.(); });

    it('MISMATCH: restorePlan(plan, otroUser) NO pisa planData local + avisa', async () => {
        const { result } = await mountSettled();
        // El uid se setea DESPUÉS del montaje: handleAuthChange(null) del mount lo
        // limpia como parte del teardown, así que setearlo antes sería inútil.
        localStorage.setItem('mealfit_user_id', 'userA');

        const before = result.current.planData;
        await act(async () => {
            await result.current.restorePlan(PLAN, 'userB'); // expectedUserId != userA
        });

        expect(result.current.planData).toBe(before); // sin cambios
        expect(result.current.planData).not.toMatchObject({ _test: true });
        expect(toastError).toHaveBeenCalled();
    });

    it('MATCH: restorePlan(plan, mismoUser) SÍ actualiza planData', async () => {
        const { result } = await mountSettled();
        localStorage.setItem('mealfit_user_id', 'userA');

        await act(async () => {
            await result.current.restorePlan(PLAN, 'userA'); // expectedUserId == userA
        });

        expect(result.current.planData).toMatchObject({ name: 'PlanRestaurado', _test: true });
    });

    it('SIN expectedUserId: no aplica el guard (restaura)', async () => {
        localStorage.setItem('mealfit_user_id', 'userA');
        const { result } = await mountSettled();

        await act(async () => {
            await result.current.restorePlan(PLAN); // sin expectedUserId → guard no corre
        });

        expect(result.current.planData).toMatchObject({ _test: true });
    });
});

// ---------------------------------------------------------------------------
// [P1-8] El value está memoizado (useMemo) con las 13 funciones plain
// estabilizadas (useStableCallback). Estos tests anclan las 2 propiedades que
// P1-8 debe garantizar: (1) identidad estable de las funciones across re-renders
// (el win de perf), (2) el value SIGUE reflejando cambios de estado (guard contra
// un dep-array incompleto → valor stale).
// ---------------------------------------------------------------------------
describe('AssessmentContext · value memoizado (P1-8)', () => {
    beforeEach(() => { localStorage.clear(); });

    it('las funciones expuestas tienen identidad ESTABLE across re-renders', async () => {
        const { result } = await mountSettled();
        const updateData1 = result.current.updateData;
        const nextStep1 = result.current.nextStep;
        const restorePlan1 = result.current.restorePlan;

        // Forzar re-render del provider vía un cambio de estado.
        await act(async () => { result.current.setCurrentStep((s) => s + 1); });

        expect(result.current.updateData).toBe(updateData1);
        expect(result.current.nextStep).toBe(nextStep1);
        expect(result.current.restorePlan).toBe(restorePlan1);
    });

    it('el value SIGUE reflejando cambios de estado (currentStep) — dep-array completo', async () => {
        const { result } = await mountSettled();
        const step0 = result.current.currentStep;

        await act(async () => { result.current.setCurrentStep(step0 + 3); });

        expect(result.current.currentStep).toBe(step0 + 3);
    });

    it('las funciones estabilizadas ejecutan estado FRESCO (updateData tras cambios)', async () => {
        const { result } = await mountSettled();
        const updateDataRef = result.current.updateData;

        await act(async () => { result.current.setCurrentStep(5); });
        // misma identidad pero debe operar sobre el formData actual
        await act(async () => { updateDataRef('weight', 80); });

        expect(result.current.formData.weight).toBe(80);
    });
});
