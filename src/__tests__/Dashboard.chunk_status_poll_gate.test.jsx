// [P2-CHUNK-OVERDUE-SIGNAL · 2026-08-04] El gate que decide si el Dashboard le
// pregunta a la cola por el estado de los chunks (`_isActiveForChunkPoll`).
//
// POR QUÉ ESTE TEST EXISTE. `UpcomingDayTabs` (los días futuros del plan) y el
// banner de chunks pausados se alimentan los DOS de `chunkStatusInfo`, que solo
// se llena si este gate deja pasar el `generation_status` del plan. El gate
// nació cubriendo `partial|generating|generating_next|rolling` — y le faltaba
// `complete_partial`.
//
// No es un hueco teórico. Medición read-only sobre los 24 planes vivos de
// producción (2026-08-04):
//
//     status              planes   con días faltantes
//     complete_partial        20                   20
//     partial                  3                    3
//     complete                 1                    0
//
// `complete_partial` (plan servido pero con días completados vía Smart Shuffle
// / chunks aún por generar) es la población DOMINANTE — 20 de 24 — y los 20
// tienen días sin generar, que es exactamente la forma que el predicado
// `overdue` del backend existe para detectar. Con el gate viejo, esos 20 planes
// nunca pedían `/chunk-status`, `chunkStatusInfo` se quedaba en `null` y
// `UpcomingDayTabs` devolvía `null`: la feature habría nacido INERTE en su caso
// estrella, con todos sus tests unitarios en verde.
//
// Por eso este test es de RENDER y no parser-based: lo que hay que anclar es
// que la petición SE HACE, no que cierto texto aparece en el fuente. Un test
// que lee `Dashboard.jsx` con un regex certifica el TEXTO del gate, no su
// DECISIÓN — y esta es precisamente la clase de bug (código presente pero
// inerte) que ese estilo de test no atrapa.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from './utils/test-utils';
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

// A diferencia de los tests hermanos (que solo necesitan `fetchWithAuth`), aquí
// el sujeto ES `getPlanChunkStatus`: tiene que ser un mock inspeccionable que
// devuelva algo thenable, porque el efecto le encadena `.then(...)`.
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

const _MEALS = [
    { meal: 'Desayuno', name: 'Mangú con los tres golpes', cals: 500, desc: 'x' },
    { meal: 'Almuerzo', name: 'Arroz con pollo guisado', cals: 700, desc: 'x' },
];

// 3 días vivos contra 30 pedidos ⇒ "con días faltantes", la forma medida en los
// 20 planes `complete_partial` de producción.
function _planConDiasFaltantes(status) {
    return {
        id: `plan-${status}`,
        calories: 2000,
        macros: { protein: 150, carbs: 200, fats: 60 },
        grocery_start_date: _todayIso(),
        created_at: _todayIso(),
        duration: 'weekly',
        generation_status: status,
        total_days_requested: 30,
        days: [
            { day: 1, day_name: 'Hoy', date: '2026-08-02', meals: _MEALS },
            { day: 2, day_name: 'Mañana', date: '2026-08-03', meals: _MEALS },
            { day: 3, day_name: 'Pasado', date: '2026-08-04', meals: _MEALS },
        ],
    };
}

// `mockAssessmentContext` (test-utils) no incluye `likedMeals`/`toggleMealLike`
// — mismo default que Dashboard.today_remaining / eaten_slot_unlock.
const _baseContext = { likedMeals: {}, toggleMealLike: vi.fn() };

const _emptyDiaryResponse = () => ({
    ok: true,
    json: async () => ({ totals: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 }, meals: [] }),
});

describe('[P2-CHUNK-OVERDUE-SIGNAL] gate del fetch a /chunk-status', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        vi.mocked(useRegeneratePlan).mockReturnValue({ regeneratePlan: vi.fn() });
        vi.mocked(fetchWithAuth).mockReset().mockImplementation(() => Promise.resolve(_emptyDiaryResponse()));
        vi.mocked(getPlanChunkStatus).mockReset().mockResolvedValue({
            ok: true,
            json: async () => ({
                in_flight_count: 0,
                pending_user_action_count: 0,
                upcoming_chunks: [],
                overdue: false,
                overdue_since: null,
            }),
        });
        window.scrollTo = vi.fn();
    });

    it('un plan `complete_partial` con días faltantes SÍ pide /chunk-status (20 de 24 planes vivos)', async () => {
        const plan = _planConDiasFaltantes('complete_partial');
        render(<Dashboard />, { customContext: { ..._baseContext, planData: plan } });

        await waitFor(() => {
            expect(vi.mocked(getPlanChunkStatus)).toHaveBeenCalled();
        });
        expect(vi.mocked(getPlanChunkStatus).mock.calls[0][0]).toBe(plan.id);
    });

    it('un plan `complete` sin días faltantes NO pide /chunk-status (no reactivar planes terminados)', async () => {
        const plan = {
            ..._planConDiasFaltantes('complete'),
            id: 'plan-terminado',
            total_days_requested: 3,
        };
        render(<Dashboard />, { customContext: { ..._baseContext, planData: plan } });

        // Ventana suficiente para que el efecto de montaje corriera: si el gate
        // dejara pasar `complete`, ya habría llamado.
        await waitFor(() => {
            expect(vi.mocked(fetchWithAuth)).toHaveBeenCalled();
        });
        expect(vi.mocked(getPlanChunkStatus)).not.toHaveBeenCalled();
    });

    it('`partial` sigue pasando (no se rompió el gate previo)', async () => {
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _planConDiasFaltantes('partial') } });
        await waitFor(() => {
            expect(vi.mocked(getPlanChunkStatus)).toHaveBeenCalled();
        });
    });
});
