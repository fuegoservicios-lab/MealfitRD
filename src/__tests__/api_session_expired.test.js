import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// [P2-401-CENTRAL · 2026-07-12] fetchWithAuth emite `mealfit:session-expired` ante un
// 401 en una ruta autenticada (no de auth). El listener global (AssessmentContext)
// hace toast + teardown UNA vez, en vez del manejo per-caller inconsistente.

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

import { fetchWithAuth } from '../config/api';

const _resp = (status) => ({ status, ok: status >= 200 && status < 300, json: async () => ({}) });

describe('[P2-401-CENTRAL] señal global de sesión expirada', () => {
    let dispatchSpy;
    beforeEach(() => {
        dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        vi.stubGlobal('fetch', vi.fn());
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    const _expiredEvents = () =>
        dispatchSpy.mock.calls
            .map((c) => c[0])
            .filter((e) => e && e.type === 'mealfit:session-expired');

    it('emite mealfit:session-expired ante 401 en ruta autenticada', async () => {
        fetch.mockResolvedValue(_resp(401));
        await fetchWithAuth('/api/inventory/increment', { method: 'POST' });
        expect(_expiredEvents().length).toBe(1);
        expect(_expiredEvents()[0].detail?.url).toBe('/api/inventory/increment');
    });

    it('NO emite en respuestas OK (200)', async () => {
        fetch.mockResolvedValue(_resp(200));
        await fetchWithAuth('/api/plans/history-list');
        expect(_expiredEvents().length).toBe(0);
    });

    it('NO emite para rutas de auth (evita bucle en el chequeo de sesión)', async () => {
        fetch.mockResolvedValue(_resp(401));
        await fetchWithAuth('/api/auth/session');
        expect(_expiredEvents().length).toBe(0);
    });
});
