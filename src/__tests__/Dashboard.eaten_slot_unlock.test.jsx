// [P1-EATEN-SLOT-UNLOCK · 2026-07-28] La única razón por la que bloquear un
// meal-card ya comido es aceptable es la escotilla de escape escrita en el
// propio `title` de "Cambiar Plato"/"Me gusta": "Bórralo en 'Progreso en
// Tiempo Real' para desbloquear." Dos suites cubren cada mitad por separado:
//   - TrackingProgress.diary_editable.test.jsx prueba que el DELETE funciona
//     y actualiza ESA card (nunca monta "Tu Menú").
//   - Dashboard.today_remaining.test.jsx prueba que DESPACHAR el evento a
//     mano desbloquea el card del menú (nunca hace un DELETE real).
// Que las dos mitades pasen NO prueba la unión: usuario hace click en borrar
// → el DELETE resuelve → TrackingProgress despacha `mealfit:today-consumed-
// -updated` DESDE SU PROPIO efecto (keyed a `[consumed]`, dispara en CUALQUIER
// cambio, no solo el fetch inicial) → Dashboard escucha y re-deriva el set
// bloqueado. Un refactor que mueva el dispatch fuera de ese efecto, o que
// haga el delete no-optimista, puede romper esa unión sin que NINGUNA de las
// dos suites existentes se ponga roja.
//
// Este test monta el `<Dashboard />` REAL — TrackingProgress y "Tu Menú" se
// renderizan como hermanos exactamente como en producción (Dashboard.jsx,
// `<TrackingProgress planData={planData} userId={...} />` justo antes del
// WaterTracker mobile) — y NUNCA despacha el CustomEvent a mano. Si lo
// hiciera, solo re-probaría la mitad que Dashboard.today_remaining.test.jsx
// ya cubre.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from './utils/test-utils';
import Dashboard from '../pages/Dashboard';
import * as router from 'react-router-dom';
import { useRegeneratePlan } from '../hooks/useRegeneratePlan';
import { fetchWithAuth } from '../config/api';
import { confirmToast } from '../utils/confirmToast';
import { toast } from 'sonner';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: vi.fn(),
    };
});

vi.mock('../hooks/useRegeneratePlan', () => ({
    useRegeneratePlan: vi.fn(),
}));

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

// TrackingProgress (rendered inside Dashboard) owns the ONLY fetch/delete to
// `/api/diary/consumed/*` — see `_makeFetchWithAuthMock` below for the
// routing by method+url.
vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
}));

vi.mock('../components/dashboard/ScanMealModal', () => ({
    default: () => null,
}));

// La confirmación nativa del navegador no existe en jsdom del mismo modo que
// en el browser real — mockeada para resolver `true` (usuario confirma) o
// para inspeccionar que SÍ se pidió. Mismo mock que
// TrackingProgress.diary_editable.test.jsx.
vi.mock('../utils/confirmToast', () => ({
    confirmToast: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const _MEAL_ID = 'diary-desayuno-1';

// Nombre DISTINTO al del plato del plan, a propósito: el matching de
// P1-TODAY-REMAINING (`getEatenSlotIndices`) es por `meal_type`, NUNCA por
// nombre — así el texto del renglón del diario ("Mangú (registrado hoy)")
// jamás colisiona con el texto del card del menú ("Mangú con los tres
// golpes") y `screen.getByText`/`getByRole` pueden apuntar a uno u otro sin
// "multiple elements" ambiguo.
const _DIARY_MEAL_TODAY = {
    id: _MEAL_ID,
    meal_name: 'Mangú (registrado hoy)',
    calories: 500,
    protein: 20,
    carbs: 60,
    healthy_fats: 10,
    meal_type: 'desayuno',
    consumed_at: new Date().toISOString(),
};

const _FOUR_MEALS_TODAY = [
    { meal: 'Desayuno', name: 'Mangú con los tres golpes', cals: 500, desc: 'x' },
    { meal: 'Almuerzo', name: 'Arroz con pollo guisado', cals: 700, desc: 'x' },
    { meal: 'Merienda', name: 'Yogur con fruta', cals: 250, desc: 'x' },
    { meal: 'Cena', name: 'Pescado a la plancha', cals: 550, desc: 'x' },
];

// [P1-EATEN-SLOT-COPY · 2026-07-28] Texto honesto esperado — nombra lo que
// el DIARIO registró (`_DIARY_MEAL_TODAY.meal_name`), NUNCA el plato del
// plan (`_FOUR_MEALS_TODAY[0].name` = "Mangú con los tres golpes"). Mismo
// string en la card, el chip y los 2 botones bloqueados (SSOT real —
// `eatenClaimForSlot(consumedTodayMeals, meal.meal, 'unlock')`).
const _EATEN_CLAIM = 'Registraste «Mangú (registrado hoy)» (~500 kcal) como tu desayuno de hoy. Bórralo en «Tus macros de hoy» para desbloquear.';

const _todayIso = () => new Date().toISOString();

function _plan(days, calories = 2000) {
    return {
        calories,
        macros: { protein: 150, carbs: 200, fats: 60 },
        grocery_start_date: _todayIso(),
        created_at: _todayIso(),
        duration: 'weekly',
        days,
    };
}

// `mockAssessmentContext` no incluye `likedMeals`/`toggleMealLike` — mismo
// default que Dashboard.today_remaining.test.jsx.
const _baseContext = { likedMeals: {}, toggleMealLike: vi.fn() };

const _diaryTotals = (meals) => ({
    calories: meals.reduce((s, m) => s + m.calories, 0),
    protein: meals.reduce((s, m) => s + m.protein, 0),
    carbs: meals.reduce((s, m) => s + m.carbs, 0),
    healthy_fats: meals.reduce((s, m) => s + m.healthy_fats, 0),
});

const _jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

// [P1-PLAN-LOTE-103 · 2026-09-18] La unión cambió de forma: «Tus macros de hoy» (con su botón de borrar) vive
// ahora en la pestaña «Progreso», y el dashboard del plan sabe qué se comió hoy por `useTodaysConsumedMeals`, que
// pide el diario él mismo y adopta el evento del contador si conviven. El round trip real pasa a ser: borrar en
// «Progreso» → volver al dashboard (se vuelve a montar) → el hook pide el diario → el menú se desbloquea. Y, sin
// cambiar de pantalla, la señal `mealfit:diary-changed` (la emite TrackingProgress al borrar) hace que el hook
// vuelva a pedir. Este archivo prueba esas dos uniones sin despachar `mealfit:today-consumed-updated` a mano.

let _diarioActual = [];

function _makeFetchWithAuthMock() {
    return vi.fn((url) => {
        const isDiaryEndpoint = typeof url === 'string' && url.startsWith('/api/diary/consumed/');
        if (isDiaryEndpoint) {
            return Promise.resolve(_jsonResponse({ totals: _diaryTotals(_diarioActual), meals: [..._diarioActual] }));
        }
        return Promise.resolve(_jsonResponse({ totals: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 }, meals: [] }));
    });
}


async function _cardBloqueado() {
    const menuName = await screen.findByText('Mangú con los tres golpes');
    const menuCard = menuName.closest('.meal-card');
    await waitFor(() => expect(menuCard).toHaveAttribute('title', _EATEN_CLAIM));
    return menuCard;
}

describe('P1-EATEN-SLOT-UNLOCK — round trip real: borrar en «Tus macros de hoy» (pestaña Progreso) desbloquea "Tu Menú"', () => {
    beforeEach(() => {
        localStorage.clear();
        _diarioActual = [_DIARY_MEAL_TODAY];
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        vi.mocked(useRegeneratePlan).mockReturnValue({ regeneratePlan: vi.fn() });
        vi.mocked(confirmToast).mockReset().mockResolvedValue(true);
        vi.mocked(toast.success).mockClear();
        vi.mocked(toast.error).mockClear();
        window.scrollTo = vi.fn();
        vi.mocked(fetchWithAuth).mockImplementation(_makeFetchWithAuthMock());
    });

    it('con el desayuno en el diario el card arranca bloqueado, con la frase honesta y la escotilla a «Tus macros de hoy»', async () => {
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });
        const menuCard = await _cardBloqueado();
        const [, swapBtn, likeBtn] = within(menuCard).getAllByRole('button');
        expect(likeBtn).toBeDisabled();
        expect(swapBtn).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByText('Ya registraste tu desayuno')).toBeInTheDocument();
        expect(screen.getByText(/Te quedan/)).toBeInTheDocument();
        expect(swapBtn).toHaveAttribute('title', _EATEN_CLAIM);
        expect(likeBtn).toHaveAttribute('title', _EATEN_CLAIM);
        expect(_EATEN_CLAIM).toContain('Tus macros de hoy');
        expect(_EATEN_CLAIM).toContain('Mangú (registrado hoy)');
        expect(_EATEN_CLAIM).not.toContain('con los tres golpes');
        // el contador ya no vive aquí: ni su botón de borrar ni su subtítulo
        expect(screen.queryByRole('button', { name: /del diario$/ })).not.toBeInTheDocument();
        expect(screen.queryByText(/comidas? registradas? hoy/)).not.toBeInTheDocument();
    });

    it('borrar en «Progreso» y volver: el dashboard se vuelve a montar, pide el diario y desbloquea', async () => {
        const primera = render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });
        await _cardBloqueado();
        primera.unmount();

        _diarioActual = []; // lo que queda tras el DELETE en la pestaña «Progreso»
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });
        const menuName = await screen.findByText('Mangú con los tres golpes');
        const menuCard = menuName.closest('.meal-card');
        await waitFor(() => expect(menuCard).not.toHaveAttribute('title'));
        const [, swapBtn, likeBtn] = within(menuCard).getAllByRole('button');
        expect(swapBtn).not.toHaveAttribute('aria-disabled', 'true');
        expect(likeBtn).not.toBeDisabled();
        expect(screen.queryByText('Ya registraste tu desayuno')).not.toBeInTheDocument();
        expect(screen.queryByText(/Te quedan/)).not.toBeInTheDocument();
    });

    it('sin cambiar de pantalla, `mealfit:diary-changed` hace que vuelva a pedir el diario: desbloquea si ya no está, sigue bloqueado si sigue', async () => {
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });
        const menuCard = await _cardBloqueado();

        // el DELETE falló en otra superficie: el diario sigue igual → sigue bloqueado
        window.dispatchEvent(new Event('mealfit:diary-changed'));
        await new Promise((r) => setTimeout(r, 30));
        expect(menuCard).toHaveAttribute('title', _EATEN_CLAIM);

        _diarioActual = [];
        window.dispatchEvent(new Event('mealfit:diary-changed'));
        await waitFor(() => expect(menuCard).not.toHaveAttribute('title'));
        expect(screen.queryByText('Ya registraste tu desayuno')).not.toBeInTheDocument();
    });
});
