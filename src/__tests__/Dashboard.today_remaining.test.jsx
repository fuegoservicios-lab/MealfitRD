// [P1-TODAY-REMAINING · 2026-07-28] "Comí el desayuno y renové el plan — el
// desayuno de ayer no debería reaparecer" (owner). Recortar el slot del
// `plan_data` rompe el piso de proteína por-día y la lista de compras
// (promedio-de-día × 7) — la solución correcta es DERIVAR del diario en
// cada render, nunca persistir. Este test cubre la mitad frontend: "Tu
// Menú" del Dashboard atenúa (nunca oculta) la card cuyo slot ya se comió
// hoy, y muestra cuánto queda del día.
//
// Fuente de datos: la card "Progreso en Tiempo Real" (TrackingProgress.jsx)
// ya es dueña del fetch a `GET /api/diary/consumed/{userId}`; en vez de un
// segundo fetch, emite `mealfit:today-consumed-updated` (CustomEvent) con
// cada cambio de su estado, y el Menú escucha ese evento. Estos tests
// simulan ese evento directamente — no re-testean el fetch de
// TrackingProgress (ya cubierto por TrackingProgress.diary_editable.test.jsx).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from './utils/test-utils';
import Dashboard from '../pages/Dashboard';
import * as router from 'react-router-dom';
import { useRegeneratePlan } from '../hooks/useRegeneratePlan';
import { fetchWithAuth } from '../config/api';

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

// TrackingProgress (rendered inside Dashboard) fetches
// `/api/diary/consumed/{userId}` on mount. Resolve it to an empty diary so
// it doesn't dispatch anything before our tests fire their own
// `mealfit:today-consumed-updated` event with controlled data.
vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
}));

vi.mock('../components/dashboard/ScanMealModal', () => ({
    default: () => null,
}));

const _emptyDiaryResponse = () => ({
    ok: true,
    json: async () => ({ totals: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 }, meals: [] }),
});

const _todayIso = () => new Date().toISOString();

function _plan(days, calories = 2000) {
    return {
        calories,
        macros: { protein: 150, carbs: 200, fats: 60 },
        // [Dashboard.jsx daysSinceCreation] arrancar el ciclo HOY → day index 0
        // = "hoy" (mismo patrón que Dashboard.test.jsx usa para 'created_at').
        grocery_start_date: _todayIso(),
        created_at: _todayIso(),
        duration: 'weekly',
        days,
    };
}

const _FOUR_MEALS_TODAY = [
    { meal: 'Desayuno', name: 'Mangú con los tres golpes', cals: 500, desc: 'x' },
    { meal: 'Almuerzo', name: 'Arroz con pollo guisado', cals: 700, desc: 'x' },
    { meal: 'Merienda', name: 'Yogur con fruta', cals: 250, desc: 'x' },
    { meal: 'Cena', name: 'Pescado a la plancha', cals: 550, desc: 'x' },
];

const _FIVE_MEALS_TWO_MERIENDAS = [
    { meal: 'Desayuno', name: 'Avena con fruta', cals: 400, desc: 'x' },
    { meal: 'Almuerzo', name: 'Arroz con habichuela y pollo', cals: 700, desc: 'x' },
    { meal: 'Merienda AM', name: 'Yogur', cals: 150, desc: 'x' },
    { meal: 'Merienda PM', name: 'Batido de proteína', cals: 200, desc: 'x' },
    { meal: 'Cena', name: 'Pescado con vegetales', cals: 550, desc: 'x' },
];

// `mockAssessmentContext` (test-utils.jsx) no incluye `likedMeals`/
// `toggleMealLike` — Dashboard.test.jsx nunca los necesitó porque sus
// fixtures usan `days: [{ meals: [] }]` (el .map nunca ejecuta su body).
// Nuestros tests SÍ populan `meals`, así que hace falta un default seguro.
const _baseContext = { likedMeals: {}, toggleMealLike: vi.fn() };

function _dispatchTodaysConsumed(meals) {
    act(() => {
        window.dispatchEvent(new CustomEvent('mealfit:today-consumed-updated', { detail: { meals } }));
    });
}

// TrackingProgress (mounted as a sibling inside Dashboard) fetches on mount
// and, once its OWN fetch resolves, dispatches `mealfit:today-consumed-updated`
// itself (with our mocked empty diary → `meals: []`). If our test's manual
// dispatch races ahead of that async resolution, TrackingProgress's later
// dispatch clobbers our controlled payload back to `[]` — a pure test-timing
// race, not a production concern (a real fetch always resolves once, well
// before any follow-up event). Waiting for TrackingProgress's own settled
// text ("N comidas registradas hoy") guarantees its dispatch already fired,
// so our manual dispatch afterward is the LAST word.
async function _waitForTrackingProgressSettled() {
    await screen.findByText(/comidas? registradas? hoy/);
}

// Misma llamada que usa el código de producción (Dashboard.jsx) — así la
// aserción no depende de qué locale ICU tenga el runtime que corre el test
// (Node small-icu formatea distinto a un browser con full-icu).
const _fmtKcal = (n) => n.toLocaleString('es-DO');

describe('P1-TODAY-REMAINING — "Tu Menú" atenúa lo ya comido hoy (derivado, nunca persistido)', () => {
    beforeEach(() => {
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        vi.mocked(useRegeneratePlan).mockReturnValue({ regeneratePlan: vi.fn() });
        vi.mocked(fetchWithAuth).mockResolvedValue(_emptyDiaryResponse());
        window.scrollTo = vi.fn();
    });

    it('dims the eaten slot with its chip, leaves other slots untouched, and shows the remaining-kcal line', async () => {
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });

        await screen.findByText('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();

        // Antes de cualquier registro: nada atenuado, ninguna línea "Te quedan".
        expect(screen.queryByText(/Ya comiste esto/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Te quedan/)).not.toBeInTheDocument();

        _dispatchTodaysConsumed([{ meal_type: 'desayuno', meal_name: 'Mangú', calories: 500 }]);

        // Match inequívoco (un solo slot 'Desayuno' hoy) → esa card se atenúa.
        const desayunoName = await screen.findByText('Mangú con los tres golpes');
        const desayunoCard = desayunoName.closest('.meal-card');
        expect(desayunoCard).toHaveAttribute('title', 'Ya registraste esto en tu diario de hoy');
        expect(desayunoCard).toHaveStyle({ opacity: '0.55' });
        // Dim, NUNCA hide — el nombre sigue en el DOM, solo tachado.
        expect(desayunoName).toHaveStyle({ textDecoration: 'line-through' });
        expect(screen.getByText(/Ya comiste esto/)).toBeInTheDocument();
        expect(screen.getByText(/~500 kcal/)).toBeInTheDocument();

        // Los otros 3 slots de hoy NO se tocan.
        for (const otherName of ['Arroz con pollo guisado', 'Yogur con fruta', 'Pescado a la plancha']) {
            const card = screen.getByText(otherName).closest('.meal-card');
            expect(card).not.toHaveAttribute('title', 'Ya registraste esto en tu diario de hoy');
        }

        // "Te quedan ~1.500 kcal estimadas en 3 comidas del plan." — target
        // 2000, consumido 500 (solo lo registrado, SIN depender de la
        // atribución) → restante 1500; comidas restantes = 4 - 1 (desayuno,
        // match inequívoco) = 3.
        const expectedKcal = _fmtKcal(1500);
        expect(screen.getByText(
            new RegExp(`Te quedan.*${expectedKcal.replace('.', '\\.')} kcal estimadas en.*3 comidas del plan`)
        )).toBeInTheDocument();
    });

    it('leaves a non-today tab completely untouched even with the same eaten data', async () => {
        // Plan de 2 días arrancando HOY (day index 0 = hoy) + MAÑANA (index 1).
        // [planWindow.js P3-DASH-WINDOW-FROM-TODAY] La ventana rolling ARRANCA
        // en hoy y avanza — nunca retrocede a mostrar tabs de días YA
        // pasados (esos ni siquiera aparecen en la barra de tabs). Por eso
        // este test usa "mañana" como el día "no-hoy": el mecanismo que se
        // prueba (`isTodayTabActive = activeDayIndex === todayPlanDayIndex`)
        // es simétrico — no importa si el otro día es pasado o futuro.
        const plan = _plan([
            { day: 1, day_name: 'Hoy', meals: [
                { meal: 'Desayuno', name: 'Mangú de hoy', cals: 500, desc: 'x' },
            ] },
            { day: 2, day_name: 'Mañana', meals: [
                { meal: 'Desayuno', name: 'Mangú de mañana', cals: 500, desc: 'x' },
            ] },
        ]);

        render(<Dashboard />, { customContext: { ..._baseContext, planData: plan } });

        // Auto-select debe aterrizar en "Hoy" (día 1, index 0).
        await screen.findByText('Mangú de hoy');
        await _waitForTrackingProgressSettled();

        _dispatchTodaysConsumed([{ meal_type: 'desayuno', calories: 500 }]);
        const hoyCard = await screen.findByText('Mangú de hoy');
        expect(hoyCard.closest('.meal-card')).toHaveAttribute('title', 'Ya registraste esto en tu diario de hoy');

        // Cambiar al tab "Mañana" — el mismo evento sigue en memoria, pero
        // `isTodayTabActive` debe ser false ahí: cero atenuación.
        fireEvent.click(screen.getByText('Mañana'));
        const mananaName = await screen.findByText('Mangú de mañana');
        const mananaCard = mananaName.closest('.meal-card');
        expect(mananaCard).not.toHaveAttribute('title', 'Ya registraste esto en tu diario de hoy');
        expect(screen.queryByText(/Ya comiste esto/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Te quedan/)).not.toBeInTheDocument();
    });

    it('AMBIGUITY RULE: two meriendas today + one diary row → attributes nothing (neither dims)', async () => {
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FIVE_MEALS_TWO_MERIENDAS }]) },
        });

        await screen.findByText('Yogur');
        await _waitForTrackingProgressSettled();

        // Una sola fila 'merienda' — no hay forma de saber si fue la AM o la PM.
        _dispatchTodaysConsumed([{ meal_type: 'merienda', calories: 150 }]);

        // Esperar a que el efecto del listener re-renderice (buscamos algo
        // que solo aparece tras el update: la línea de restantes).
        await screen.findByText(/Te quedan/);

        for (const name of ['Yogur', 'Batido de proteína']) {
            const card = screen.getByText(name).closest('.meal-card');
            expect(card).not.toHaveAttribute('title', 'Ya registraste esto en tu diario de hoy');
        }
        expect(screen.queryByText(/Ya comiste esto/)).not.toBeInTheDocument();

        // Ninguna de las 5 comidas se remueve — "5 comidas" restantes.
        expect(screen.getByText(/5 comidas del plan/)).toBeInTheDocument();
    });

    it('does not disturb the meal index the swap handler receives when a card is dimmed', async () => {
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });

        await screen.findByText('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();
        // Dimm el primer slot (Desayuno, index 0).
        _dispatchTodaysConsumed([{ meal_type: 'desayuno', calories: 500 }]);
        await screen.findByText(/Ya comiste esto/);

        const swapButtons = screen.getAllByTitle('Cambiar con IA');
        expect(swapButtons.length).toBe(4);

        // El modal muestra `contextLabel` (= meal.name del swapModal state)
        // justo después de la etiqueta "Plato a cambiar"
        // (MotivoActualizarModal.jsx ~:748-751). El nombre del plato queda
        // duplicado en el DOM (card + modal), así que en vez de `getByText`
        // (revienta con "multiple elements" ante el duplicado esperado) se
        // extrae lo que sigue a esa etiqueta del `textContent` completo.
        const _swapModalContextLabel = () => {
            const after = document.body.textContent.split('Plato a cambiar')[1];
            return (after || '').trim();
        };

        // Click en el swap del card DIMMED (index 0) — el modal debe abrir
        // con el nombre de ESE plato, no otro (P2-SWAP-INDEX-COUPLING: el
        // `index` del map no debe correrse por el filtro de dimming).
        fireEvent.click(swapButtons[0]);
        await waitFor(() => {
            expect(_swapModalContextLabel().startsWith('Mangú con los tres golpes')).toBe(true);
        });

        // Click en el swap del SEGUNDO card (Almuerzo, index 1, NO atenuado)
        // — el modal debe reflejar ESE nombre, no el del primero.
        fireEvent.click(swapButtons[1]);
        await waitFor(() => {
            expect(_swapModalContextLabel().startsWith('Arroz con pollo guisado')).toBe(true);
        });
    });
});
