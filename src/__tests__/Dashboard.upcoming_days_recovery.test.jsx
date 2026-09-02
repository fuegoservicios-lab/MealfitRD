// [P2-CHUNK-OVERDUE-SIGNAL · 2026-08-04] Las dos mitades del estado `atrasado`
// que solo son verificables montando el Dashboard REAL: a dónde va el CTA, y si
// el aviso al que la pestaña remite existe.
//
// 1) EL CTA. La primera versión llamaba a `/retry-chunk` con el `chunk_id` del
//    próximo chunk. Era inerte al 100%, por construcción del backend:
//      · `upcoming_chunks` filtra `status IN ('pending','processing')`
//      · `in_flight_count` cuenta `('pending','processing','stale')`
//      · `compute_chunk_overdue` devuelve `(False, None)` si `in_flight > 0`
//    ⇒ `overdue === true` implica cola vacía ⇒ no hay `chunk_id`. El usuario
//    tocaba «Reintentar» y SIEMPRE recibía «no hay nada que reintentar».
//    La vía real es `POST /api/plans/shift-plan`, cuya rama
//    `not is_partial and needs_fill` (catch-up P0-5, `api_shift_plan`) encola
//    chunks para todos los días faltantes y solo se salta la semana si ya hay
//    un chunk vivo — o sea, encola precisamente cuando la cola está vacía.
//    Este test ancla el DESTINO de la llamada: si alguien vuelve a cablear el
//    botón a `/retry-chunk`, se pone rojo.
//
// 2) EL AVISO. La pestaña de un día pausado dice «⏸ pausado» y su tooltip
//    remite al banner de arriba. Ese banner conservaba su propia copia del
//    temporal-gate V3 (`daysSinceCreation < planData.days.length → null`), que
//    lo ocultaba justo mientras el usuario consumía días del chunk actual — es
//    decir, casi siempre. La reversión del spec ("los días futuros se ven
//    siempre") alcanza también al banner; sin esto la instrucción apuntaría a
//    un aviso invisible.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from './utils/test-utils';
import Dashboard from '../pages/Dashboard';
import * as router from 'react-router-dom';
import { useRegeneratePlan } from '../hooks/useRegeneratePlan';
import { fetchWithAuth, getPlanChunkStatus } from '../config/api';
import { syncPausedChunkStatusCache } from '../utils/chunkStatusCache';

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
}));

vi.mock('../components/dashboard/ScanMealModal', () => ({
    default: () => null,
}));

const _MEALS = [
    { meal: 'Desayuno', name: 'Mangú con los tres golpes', cals: 500, desc: 'x' },
    { meal: 'Almuerzo', name: 'Arroz con pollo guisado', cals: 700, desc: 'x' },
];

const _todayIso = () => new Date().toISOString();
// `userProfile` sale del AssessmentContext y el handler del CTA (igual que el
// `triggerShift` automático y el botón [P2-δ]) hace early-return sin `id` — sin
// esto el click sería un no-op y el test pasaría/fallaría por la razón
// equivocada.
const _baseContext = {
    likedMeals: {},
    toggleMealLike: vi.fn(),
    userProfile: { id: 'test-user', health_profile: {} },
};

// Plan rolling a medias: 3 días vivos de 30 pedidos. `grocery_start_date` = hoy
// ⇒ `daysSinceCreation === 0 < days.length === 3`, que es exactamente la
// condición con la que el temporal-gate V3 ocultaba el banner.
function _planRolling() {
    return {
        id: 'plan-rolling',
        calories: 2000,
        macros: { protein: 150, carbs: 200, fats: 60 },
        grocery_start_date: _todayIso(),
        created_at: _todayIso(),
        duration: 'weekly',
        generation_status: 'complete_partial',
        total_days_requested: 30,
        days: [
            { day: 1, day_name: 'Hoy', date: '2026-08-02', meals: _MEALS },
            { day: 2, day_name: 'Mañana', date: '2026-08-03', meals: _MEALS },
            { day: 3, day_name: 'Pasado', date: '2026-08-04', meals: _MEALS },
        ],
    };
}

const _emptyDiary = () => ({
    ok: true,
    json: async () => ({ totals: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 }, meals: [] }),
});

const _chunkStatus = (extra = {}) => ({
    ok: true,
    json: async () => ({
        in_flight_count: 0,
        pending_user_action_count: 0,
        paused_chunks: [],
        upcoming_chunks: [],
        overdue: false,
        overdue_since: null,
        ...extra,
    }),
});

describe('[P2-CHUNK-OVERDUE-SIGNAL] recuperación de días atrasados desde el Dashboard', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        vi.mocked(useRegeneratePlan).mockReturnValue({ regeneratePlan: vi.fn() });
        vi.mocked(fetchWithAuth).mockReset().mockImplementation(() => Promise.resolve(_emptyDiary()));
        vi.mocked(getPlanChunkStatus).mockReset();
        window.scrollTo = vi.fn();
    });

    it('la fila de días NO ofrece ningún control que dispare /shift-plan', async () => {
        vi.mocked(getPlanChunkStatus).mockResolvedValue(_chunkStatus({
            overdue: true,
            overdue_since: '2026-08-04',
            upcoming_chunks: [],   // la cola vacía es lo que HACE que sea overdue
        }));

        const { container } = render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _planRolling() },
        });

        // El chip atrasado SÍ está: la señal se muestra, solo que no se acciona.
        await waitFor(() => {
            expect(screen.getAllByText(/atrasado/i).length).toBeGreaterThan(0);
        });
        // [P1-DASH-WEEK-NAV] El nombre buscado es el de un CONTROL de reintento.
        // `atrasado` salió de este regex: ahora es la etiqueta de ESTADO de una
        // celda de día, que además va `disabled`. Confundir "aparece la palabra"
        // con "hay un botón que reintenta" haría fallar el test por la razón
        // equivocada. La protección de verdad es el click sobre TODO, más abajo.
        expect(screen.queryByRole('button', { name: /reintentar/i })).toBeNull();

        // El `triggerShift` automático ya llamó a shift-plan al montar — ESE es
        // el reintento real, y es justamente por lo que un botón aquí sobra.
        // Contamos desde este punto para atribuir cualquier llamada nueva a los
        // clicks de abajo, no al montaje.
        const shiftCalls = () => vi.mocked(fetchWithAuth).mock.calls
            .filter(([url]) => typeof url === 'string' && url.includes('/api/plans/shift-plan')).length;
        const before = shiftCalls();

        // Clickeamos TODO lo clickeable de la fila de días (pestañas reales,
        // fantasmas y el toggle del popover). Ninguno puede lanzar un shift.
        // [P1-DASH-WEEK-NAV · 2026-08-04] La fila puede ser la navegación por
        // semanas o, en planes legacy sin fechas, la fila de siempre. El
        // contrato es el mismo en ambas: ningún control dispara un shift.
        const fila = container.querySelector('.plan-week-nav, .days-navigation-container');
        expect(fila).not.toBeNull();
        const botones = fila.querySelectorAll('button');
        expect(botones.length).toBeGreaterThan(0);
        botones.forEach((b) => fireEvent.click(b));

        await waitFor(() => {
            expect(vi.mocked(getPlanChunkStatus)).toHaveBeenCalled();
        });
        expect(shiftCalls()).toBe(before);
        // Y jamás por la vía inerte (`/retry-chunk` con la cola vacía).
        expect(vi.mocked(fetchWithAuth).mock.calls
            .filter(([url]) => typeof url === 'string' && url.includes('/retry-chunk'))).toHaveLength(0);
    });

    it('el banner de chunks pausados se ve aunque el usuario siga consumiendo el chunk actual (V3 SUPERSEDED)', async () => {
        vi.mocked(getPlanChunkStatus).mockResolvedValue(_chunkStatus({
            pending_user_action_count: 1,
            in_flight_count: 0,
            paused_chunks: [{ reason_code: 'empty_pantry' }],
        }));

        render(<Dashboard />, { customContext: { ..._baseContext, planData: _planRolling() } });

        // `daysSinceCreation === 0 < days.length === 3`: con el temporal-gate V3
        // vivo este banner devolvía null y la pestaña «⏸ pausado · revisa el
        // aviso de arriba» remitía a la nada.
        expect(await screen.findByText(/Tu próximo bloque está pausado/i)).toBeInTheDocument();
        expect(screen.getByText(/Tu nevera está vacía/i)).toBeInTheDocument();
    });

    it('el banner pausado está en el primer render tras refrescar, antes de que responda /chunk-status', () => {
        syncPausedChunkStatusCache('plan-rolling', {
            pending_user_action_count: 1,
            in_flight_count: 0,
            paused_chunks: [{ reason_code: 'unknown_reason' }],
        });
        // La petición queda pendiente a propósito: si el render dependiera de
        // ella, el aviso no existiría durante este assert síncrono.
        vi.mocked(getPlanChunkStatus).mockReturnValue(new Promise(() => {}));

        const { unmount } = render(<Dashboard />, { customContext: { ..._baseContext, planData: _planRolling() } });

        expect(screen.getByText(/Tu próximo bloque está pausado/i)).toBeInTheDocument();
        expect(screen.getByText(/El sistema espera tu acción para continuar/i)).toBeInTheDocument();
        unmount();
    });

    // [Ronda extra] El gate del banner exigía además `in_flight_count === 0`,
    // asumiendo que una pausa deja la cola quieta. El payload real de
    // producción desmiente esa premisa: un chunk pausado convive con 8
    // pendientes. Con el gate viejo el banner no se pintaba, y la pestaña
    // fantasma del día pausado —que dice «revisa el aviso de arriba»— remitía a
    // un aviso invisible: el mismo defecto que ya cerramos al quitar el gate V3.
    it('el banner se ve aunque haya chunks en vuelo (la pausa convive con pendientes)', async () => {
        vi.mocked(getPlanChunkStatus).mockResolvedValue(_chunkStatus({
            pending_user_action_count: 1,
            in_flight_count: 8,
            paused_chunks: [{ reason_code: 'learning_zero_logs', days_offset: 3, days_count: 3 }],
            upcoming_chunks: [{ days_offset: 6, days_count: 3, status: 'pending', execute_after: '2026-08-09T09:00:00Z' }],
        }));

        render(<Dashboard />, { customContext: { ..._baseContext, planData: _planRolling() } });

        expect(await screen.findByText(/Registra tus comidas para continuar/i)).toBeInTheDocument();
    });
});
