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
const _EATEN_CLAIM = 'Registraste «Mangú (registrado hoy)» (~500 kcal) como tu desayuno de hoy. Bórralo en «Progreso en Tiempo Real» para desbloquear.';

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

// Enrutado por MÉTODO+URL. El ÚNICO manejo especial es el GET/DELETE real de
// `/api/diary/consumed/*` que TrackingProgress dispara de verdad; cualquier
// otro `fetchWithAuth` (inventario, etc.) recibe el mismo shape "diario
// vacío" que Dashboard.today_remaining.test.jsx ya usa como blanket mock —
// probado inofensivo para el resto del árbol de Dashboard.
function _makeFetchWithAuthMock({ deleteOk }) {
    return vi.fn((url, options) => {
        const isDiaryEndpoint = typeof url === 'string' && url.startsWith('/api/diary/consumed/');
        if (isDiaryEndpoint && options?.method === 'DELETE') {
            return Promise.resolve(deleteOk
                ? _jsonResponse({ success: true, message: 'Comida eliminada del diario.' })
                : _jsonResponse({ detail: 'No se pudo eliminar la comida.' }, false));
        }
        if (isDiaryEndpoint) {
            return Promise.resolve(_jsonResponse({
                totals: _diaryTotals([_DIARY_MEAL_TODAY]),
                meals: [_DIARY_MEAL_TODAY],
            }));
        }
        return Promise.resolve(_jsonResponse({ totals: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 }, meals: [] }));
    });
}

// Espera a que el fetch REAL de montaje de TrackingProgress resuelva Y
// despache `mealfit:today-consumed-updated` con el desayuno de hoy — nunca
// disparamos ese evento a mano en este archivo.
async function _waitForTrackingProgressSettledWithMeal() {
    await screen.findByText('1 comida registrada hoy');
}

describe('P1-EATEN-SLOT-UNLOCK — round trip real: borrar en "Progreso en Tiempo Real" desbloquea "Tu Menú"', () => {
    beforeEach(() => {
        // [P1-TRACKING-CACHE-CONSUMED] TrackingProgress hidrata `consumed`
        // desde localStorage (keyed por user+fecha de HOY) en el initializer
        // de su `useState` — sin limpiar, el snapshot que un test anterior
        // dejó (mismo `userId` de prueba 'test-user', misma fecha) hidrataría
        // el siguiente test ANTES de que su propio fetch mockeado resuelva.
        // Mismo guard que TrackingProgress.diary_editable.test.jsx.
        localStorage.clear();
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        vi.mocked(useRegeneratePlan).mockReturnValue({ regeneratePlan: vi.fn() });
        vi.mocked(confirmToast).mockReset().mockResolvedValue(true);
        vi.mocked(toast.success).mockClear();
        vi.mocked(toast.error).mockClear();
        window.scrollTo = vi.fn();
    });

    it('click en Eliminar → DELETE resuelve OK → el card del menú se desbloquea sin dispatch manual', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(_makeFetchWithAuthMock({ deleteOk: true }));

        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });

        await _waitForTrackingProgressSettledWithMeal();

        // El diario YA traía el desayuno de hoy antes del primer render útil
        // → el card matching arranca bloqueado (match inequívoco: un solo
        // slot "Desayuno" hoy).
        const menuName = await screen.findByText('Mangú con los tres golpes');
        const menuCard = menuName.closest('.meal-card');
        expect(menuCard).toHaveAttribute('title', _EATEN_CLAIM);
        const [, swapBtn, likeBtn] = within(menuCard).getAllByRole('button');
        expect(swapBtn).toBeDisabled();
        expect(likeBtn).toBeDisabled();

        // [P1-EATEN-SLOT-COPY · 2026-07-28] El chip SOLO nombra el slot
        // ("Ya registraste tu desayuno") — nunca dice "esto" (la copia
        // vieja apuntaba al plato MOSTRADO, "Mangú con los tres golpes",
        // que el usuario NO comió — comió "Mangú (registrado hoy)").
        expect(screen.getByText('Ya registraste tu desayuno')).toBeInTheDocument();
        expect(within(menuCard).queryByText(/esto/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Te quedan/)).toBeInTheDocument();

        // Los 2 botones bloqueados llevan la MISMA frase honesta — nombra lo
        // que el diario registró, jamás "Mangú con los tres golpes" (el
        // plato del PLAN que decora esta card).
        expect(swapBtn).toHaveAttribute('title', _EATEN_CLAIM);
        expect(likeBtn).toHaveAttribute('title', _EATEN_CLAIM);
        expect(swapBtn).toHaveAttribute('aria-label', _EATEN_CLAIM);
        expect(likeBtn).toHaveAttribute('aria-label', _EATEN_CLAIM);
        expect(_EATEN_CLAIM).toContain('Mangú (registrado hoy)');
        expect(_EATEN_CLAIM).not.toContain('con los tres golpes');

        // El control de borrado vive en "Progreso en Tiempo Real" — su
        // accessible name usa el nombre del RENGLÓN DEL DIARIO, nunca el del
        // plato del menú.
        const deleteBtn = screen.getByRole('button', { name: 'Eliminar Mangú (registrado hoy) del diario' });
        fireEvent.click(deleteBtn);

        // `confirmToast` (mockeado a resolver `true`) + el DELETE real son
        // async — esperar el toast de éxito de TrackingProgress antes de
        // asertar el efecto río abajo en el menú.
        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledTimes(1);
        });

        // El card del menú se desbloquea: sin title de bloqueo, botones
        // habilitados, chip fuera, línea "Te quedan" fuera (0 comidas hoy).
        await waitFor(() => {
            expect(menuCard).not.toHaveAttribute('title');
        });
        expect(swapBtn).not.toBeDisabled();
        expect(likeBtn).not.toBeDisabled();
        expect(screen.queryByText('Ya registraste tu desayuno')).not.toBeInTheDocument();
        expect(screen.queryByText(/Te quedan/)).not.toBeInTheDocument();

        // El renglón también desapareció de "Progreso en Tiempo Real" — la
        // misma verdad en ambos lugares, sin segundo fetch.
        expect(screen.queryByText('Mangú (registrado hoy)')).not.toBeInTheDocument();
        expect(screen.getByText('0 comidas registradas hoy')).toBeInTheDocument();
    });

    it('si el DELETE falla, el card del menú se queda bloqueado — un unlock visual sería mentirle al usuario', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(_makeFetchWithAuthMock({ deleteOk: false }));

        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });

        await _waitForTrackingProgressSettledWithMeal();
        const menuName = await screen.findByText('Mangú con los tres golpes');
        const menuCard = menuName.closest('.meal-card');
        expect(menuCard).toHaveAttribute('title', _EATEN_CLAIM);

        const deleteBtn = screen.getByRole('button', { name: 'Eliminar Mangú (registrado hoy) del diario' });
        fireEvent.click(deleteBtn);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledTimes(1);
        });

        // Sigue bloqueado: title, botones deshabilitados, chip, renglón del
        // diario y "Te quedan" intactos — el fallo del DELETE no debe
        // parecer un éxito.
        expect(menuCard).toHaveAttribute('title', _EATEN_CLAIM);
        const [, swapBtn, likeBtn] = within(menuCard).getAllByRole('button');
        expect(swapBtn).toBeDisabled();
        expect(likeBtn).toBeDisabled();
        expect(screen.getByText('Ya registraste tu desayuno')).toBeInTheDocument();
        expect(within(menuCard).queryByText(/esto/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Te quedan/)).toBeInTheDocument();
        expect(screen.getByText('Mangú (registrado hoy)')).toBeInTheDocument();
        expect(screen.getByText('1 comida registrada hoy')).toBeInTheDocument();
    });
});
