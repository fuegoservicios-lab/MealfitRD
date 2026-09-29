// frontend/src/__tests__/lote776.creditos_del_servidor.test.jsx
// [P1-PLAN-LOTE-776 · revisión final · 2026-09-28] Los créditos que dice el servidor (usados, tope real y regalos
// recientes) viven en `useCreditosDelServidor`, fuera de AssessmentContext (techo de líneas congelado:
// test_p3_shopping_projection_pkg), y se reinician en CADA cierre o cambio de cuenta. Antes, la cuenta B en la misma
// pestaña veía el tope de A y se le anunciaban los regalos de A (P1-XTAB-CACHE-LEAK): la rama SIGNED_OUT, la sesión
// expirada y el cambio de usuario reiniciaban el perfil pero no esto.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

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
    fetchWithAuth: vi.fn(),
    restorePlanFromHistory: vi.fn().mockResolvedValue({ ok: false }),
    getPlanChunkStatus: vi.fn().mockResolvedValue(null),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { fetchWithAuth } from '../config/api';
import { authClient } from '../authClient';
import { useCreditosDelServidor } from '../hooks/useCreditosDelServidor';
import { AssessmentProvider, useAssessment } from '../context/AssessmentContext';

const REGALO_A = { id: 'gA', tipo: 'creditos_generacion', cantidad: 20, plan: null, hasta: '2026-10-01T00:00:00+00:00' };
const CREDITOS_A = { credits: 7, limit: 30, bonus: 20, bonus_hasta: '2026-10-01T00:00:00+00:00', regalos_recientes: [REGALO_A] };
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });

/** Solo responde bien `/api/user/credits/{uid}` de las cuentas dadas; todo lo demás, 500. */
function servidor(creditosPorCuenta) {
    fetchWithAuth.mockImplementation(async (url) => {
        const m = /^\/api\/user\/credits\/(.+)$/.exec(String(url));
        if (m && creditosPorCuenta[m[1]]) return respuesta(creditosPorCuenta[m[1]]);
        return respuesta({ detail: 'no' }, false, 500);
    });
}

describe('[776] useCreditosDelServidor', () => {
    beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

    it('lee de GET /api/user/credits los usados, el tope real y los regalos recientes', async () => {
        servidor({ userA: CREDITOS_A });
        const { result } = renderHook(() => useCreditosDelServidor());
        let usados;
        await act(async () => { usados = await result.current.consultar('userA'); });
        expect(usados).toBe(7);
        expect(fetchWithAuth).toHaveBeenCalledWith('/api/user/credits/userA');
        expect(result.current.planCount).toBe(7);
        expect(result.current.creditosServidor).toEqual({ limit: 30, bonus: 20, bonusHasta: '2026-10-01T00:00:00+00:00' });
        expect(result.current.regalosRecientes).toEqual([REGALO_A]);
    });

    it('sin tope del servidor queda null (manda config/plans.js); si la consulta falla no toca lo que había', async () => {
        servidor({ userA: { credits: 3 } });
        const { result } = renderHook(() => useCreditosDelServidor());
        await act(async () => { await result.current.consultar('userA'); });
        expect(result.current).toMatchObject({ planCount: 3, creditosServidor: null, regalosRecientes: [] });
        let usados;
        await act(async () => { usados = await result.current.consultar('userB'); });   // 500
        expect(usados).toBe(0);
        expect(result.current.planCount).toBe(3);
    });

    it('invitado o sin cuenta: reinicia sin consultar; reiniciar() lo deja todo en cero', async () => {
        servidor({ userA: CREDITOS_A });
        const { result } = renderHook(() => useCreditosDelServidor());
        await act(async () => { await result.current.consultar('userA'); });
        await act(async () => { await result.current.consultar('guest'); });
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        expect(result.current).toMatchObject({ planCount: 0, creditosServidor: null, regalosRecientes: [] });
        await act(async () => { await result.current.consultar('userA'); });
        act(() => { result.current.reiniciar(); });
        expect(result.current).toMatchObject({ planCount: 0, creditosServidor: null, regalosRecientes: [] });
    });
});

const wrapper = ({ children }) => <AssessmentProvider>{children}</AssessmentProvider>;

/** Provider real con la cuenta A cargada: usados 7, 20 de regalo y un regalo por anunciar. */
async function montarConLosCreditosDeA() {
    servidor({ userA: CREDITOS_A });
    const hook = renderHook(() => useAssessment(), { wrapper });
    await waitFor(() => expect(hook.result.current.loadingAuth).toBe(false));
    localStorage.setItem('mealfit_user_id', 'userA');     // tras montar: el teardown del montaje lo borra
    await act(async () => { await hook.result.current.checkPlanLimit(); });
    expect(hook.result.current).toMatchObject({ planCount: 7, creditosRegalo: 20, regalosRecientes: [REGALO_A] });
    return hook;
}

const alCambiarLaSesion = () => authClient.auth.onAuthStateChange.mock.calls.at(-1)[0];

function nadaDeA(ctx) {
    expect(ctx.regalosRecientes).toEqual([]);
    expect(ctx.creditosRegalo).toBe(0);
    expect(ctx.planCount).toBe(0);
}

describe('[776] AssessmentContext: los créditos de una cuenta no pasan a la siguiente', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('sesión expirada', async () => {
        const { result } = await montarConLosCreditosDeA();
        await act(async () => { window.dispatchEvent(new Event('mealfit:session-expired')); });
        nadaDeA(result.current);
    });

    it('SIGNED_OUT (el proveedor o el cierre desde otra pestaña)', async () => {
        const { result } = await montarConLosCreditosDeA();
        await act(async () => { await alCambiarLaSesion()('SIGNED_OUT', null); });
        nadaDeA(result.current);
    });

    it('otra cuenta en la misma pestaña, aunque la consulta de la nueva falle', async () => {
        const { result } = await montarConLosCreditosDeA();
        localStorage.setItem('mealfit_last_form_owner', 'userA');
        await act(async () => {
            await alCambiarLaSesion()('SIGNED_IN', { user: { id: 'userB', email: 'b@correo.com' }, access_token: 'tok-b' });
        });
        await waitFor(() => expect(result.current.loadingProfile).toBe(false));
        expect(fetchWithAuth).toHaveBeenCalledWith('/api/user/credits/userB');
        nadaDeA(result.current);
    });
});

describe('[776] el contexto delega los créditos en su hook (anclas del código)', () => {
    const ctx = fs.readFileSync(path.resolve(__dirname, '../context/AssessmentContext.jsx'), 'utf-8');

    it('el hook es el único que escribe ese estado', () => {
        expect(ctx).toContain('useCreditosDelServidor()');
        for (const setter of ['setPlanCount(', 'setCreditosServidor(', 'setRegalosRecientes(']) expect(ctx).not.toContain(setter);
    });

    it('cada sitio que vacía el perfil reinicia también los créditos', () => {
        const lineas = ctx.split('\n');
        const sitios = lineas.flatMap((l, i) => (l.includes('setUserProfile(null)') ? [i] : []));
        expect(sitios.length).toBeGreaterThanOrEqual(4);   // resetApp, salir del invitado, SIGNED_OUT, sesión expirada
        for (const i of sitios) expect(lineas.slice(i, i + 3).join('\n'), `línea ${i + 1}`).toContain('reiniciarCreditos()');
        const cambio = ctx.slice(ctx.indexOf("if (lastOwner && lastOwner !== 'guest' && lastOwner !== userId) {"),
            ctx.indexOf("safeLocalStorageSet('mealfit_last_form_owner', userId);"));
        expect(cambio).toContain('reiniciarCreditos()');
    });
});
