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
import { beginAccountDeletion } from '../utils/accountDeletionSession';

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

    it.each([0, 60000])('no confunde un 401 durante el borrado con expiración (timeout %s)', async (timeout) => {
        const end = beginAccountDeletion();
        try {
            fetch.mockResolvedValue(_resp(401));
            const res = await fetchWithAuth('/api/profile', { timeout });
            expect(res.status).toBe(401);
            expect(_expiredEvents()).toHaveLength(0);
            await fetchWithAuth('/api/account/delete', { method: 'POST', timeout });
            expect(_expiredEvents()).toHaveLength(1);
        } finally { end(); }
    });

    it.each(['before', 'during'])('ignora respuestas tardías de peticiones iniciadas %s el borrado', async (when) => {
        let respond;
        fetch.mockImplementationOnce(() => new Promise((resolve) => { respond = resolve; }));
        const end = when === 'during' ? beginAccountDeletion() : null;
        const pending = fetchWithAuth('/api/profile');
        await vi.waitFor(() => expect(respond).toBeTypeOf('function'));
        (end || beginAccountDeletion())();
        respond(_resp(401));
        expect((await pending).status).toBe(401);
        expect(_expiredEvents()).toHaveLength(0);
        // Un intento nuevo tras terminar (o fallar) el borrado sigue protegido.
        fetch.mockResolvedValue(_resp(401));
        await fetchWithAuth('/api/profile');
        expect(_expiredEvents()).toHaveLength(1);
    });
});
