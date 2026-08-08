// [P1-DASH-CORRUPTED-VS-PAUSED · 2026-08-08] El banner "Tu plan quedó incompleto"
// no puede acusar mientras la cola server-side siga viva.
//
// Incidente real (plan f380821a, 2026-08-08): la ventana rolling archivó el
// último día vivo (days=[], status `partial`) mientras el refill estaba PAUSADO
// en `pending_user_action:pantry_violation_after_retries` (TTL 12h → el recovery
// lo genera solo). El Dashboard mostró el banner rojo de plan corrupto con CTA
// "Generar Nuevo Plan" — que cancela la cola entera y quema un crédito — y el
// día vacío ofrecía el MISMO CTA trampa. El plan no estaba roto: estaba pausado.
//
// La regla que este test ancla: `partial` + 0 días solo es corrupción cuando
// /chunk-status CONFIRMÓ la cola muerta (0 en vuelo, 0 pausados). Sin respuesta
// del poll (null) NO se acusa — preferimos un banner tardío a uno falso, la
// misma lección de P1-PLAN-HYDRATE-ON-COMPLETE y de los avisos-que-acusaban-
// sin-base del 2026-08-05.
//
// Test de RENDER y no parser-based, por la misma razón que el gate del poll
// (P2-CHUNK-OVERDUE-SIGNAL): lo que hay que anclar es la DECISIÓN visible.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen } from './utils/test-utils';
import Dashboard from '../pages/Dashboard';
import * as router from 'react-router-dom';
import { useRegeneratePlan } from '../hooks/useRegeneratePlan';
import { fetchWithAuth, getPlanChunkStatus } from '../config/api';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: vi.fn() };
});

vi.mock('../hooks/useRegeneratePlan', () => ({
    useRegeneratePlan: vi.fn(),
}));

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock('../config/api', () => ({
    API_BASE: 'http://test',
    fetchWithAuth: vi.fn(),
    getPlanChunkStatus: vi.fn(),
    retryPlanChunk: vi.fn(),
}));

vi.mock('../components/dashboard/ScanMealModal', () => ({
    default: () => null,
}));

const _todayIso = () => new Date().toISOString();

// La forma EXACTA del incidente: partial, 0 días vivos, plan con 2 días de vida
// (sin flag client-side de pipeline — no hay SSE reciente que lo cubra).
function _planVaciadoPorElShift() {
    return {
        id: 'plan-f380821a',
        calories: 2000,
        macros: { protein: 150, carbs: 200, fats: 60 },
        grocery_start_date: _todayIso(),
        created_at: '2026-08-06T00:42:59Z',
        duration: 'monthly',
        generation_status: 'partial',
        total_days_requested: 30,
        days: [],
    };
}

const _baseContext = { likedMeals: {}, toggleMealLike: vi.fn() };

const _emptyDiaryResponse = () => ({
    ok: true,
    json: async () => ({ totals: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 }, meals: [] }),
});

function _mockChunkStatus(body) {
    vi.mocked(getPlanChunkStatus).mockReset().mockResolvedValue({
        ok: true,
        json: async () => body,
    });
}

const _BANNER = /Tu plan quedó incompleto/i;

describe('[P1-DASH-CORRUPTED-VS-PAUSED] banner de corrupción vs cola viva', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        vi.mocked(useRegeneratePlan).mockReturnValue({ regeneratePlan: vi.fn() });
        vi.mocked(fetchWithAuth).mockReset().mockImplementation(() => Promise.resolve(_emptyDiaryResponse()));
        window.scrollTo = vi.fn();
    });

    it('cola con chunks PAUSADOS ⇒ nada de banner rojo; el día vacío explica la pausa con CTA a la nevera', async () => {
        _mockChunkStatus({
            in_flight_count: 0,
            pending_user_action_count: 2,
            upcoming_chunks: [],
            overdue: false,
        });
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _planVaciadoPorElShift() } });

        await waitFor(() => {
            expect(vi.mocked(getPlanChunkStatus)).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(screen.getByText(/Tus próximos días están en pausa/i)).toBeInTheDocument();
        });
        expect(screen.queryByText(_BANNER)).not.toBeInTheDocument();
        // El CTA trampa ("Generar nuevo plan" cancela la cola) no se ofrece pausado.
        expect(screen.queryByText(/Generar nuevo plan/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Revisar mi nevera/i)).toBeInTheDocument();
    });

    it('cola con chunks EN VUELO ⇒ nada de banner; el día vacío dice "en camino" sin CTA trampa', async () => {
        _mockChunkStatus({
            in_flight_count: 3,
            pending_user_action_count: 0,
            upcoming_chunks: [],
            overdue: false,
        });
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _planVaciadoPorElShift() } });

        await waitFor(() => {
            expect(screen.getByText(/Tus próximos días vienen en camino/i)).toBeInTheDocument();
        });
        expect(screen.queryByText(_BANNER)).not.toBeInTheDocument();
        expect(screen.queryByText(/Generar nuevo plan/i)).not.toBeInTheDocument();
    });

    it('cola CONFIRMADA muerta ⇒ el banner SÍ acusa (la detección real de corrupción sigue viva)', async () => {
        _mockChunkStatus({
            in_flight_count: 0,
            pending_user_action_count: 0,
            upcoming_chunks: [],
            overdue: false,
        });
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _planVaciadoPorElShift() } });

        await waitFor(() => {
            expect(screen.getByText(_BANNER)).toBeInTheDocument();
        });
    });

    it('poll SIN respuesta aún (null) ⇒ no se acusa: banner tardío antes que banner falso', async () => {
        vi.mocked(getPlanChunkStatus).mockReset().mockReturnValue(new Promise(() => { /* nunca resuelve */ }));
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _planVaciadoPorElShift() } });

        await waitFor(() => {
            expect(vi.mocked(fetchWithAuth)).toHaveBeenCalled();
        });
        expect(screen.queryByText(_BANNER)).not.toBeInTheDocument();
    });

    it('`failed` es veredicto del backend: banner SIEMPRE, con o sin cola', async () => {
        _mockChunkStatus({
            in_flight_count: 1,
            pending_user_action_count: 1,
            upcoming_chunks: [],
            overdue: false,
        });
        const plan = { ..._planVaciadoPorElShift(), generation_status: 'failed' };
        render(<Dashboard />, { customContext: { ..._baseContext, planData: plan } });

        await waitFor(() => {
            expect(screen.getByText(_BANNER)).toBeInTheDocument();
        });
    });
});
