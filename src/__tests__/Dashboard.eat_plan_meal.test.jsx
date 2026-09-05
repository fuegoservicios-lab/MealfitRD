// [P1-EAT-PLAN-MEAL · 2026-08-07] "Me lo comí" — el camino de consumo MÁS
// preciso del sistema y el único sin adivinanza.
//
// Los otros dos surfaces adivinan: el chat depende de que la LLM acierte la
// lista de ingredientes desde texto libre, y la foto hoy ni siquiera manda
// ingredientes (no toca la Nevera). El plato del plan YA trae su lista con
// cantidades, así que descontar es aritmética sobre datos que el backend
// escribió.
//
// Lo que este archivo protege:
//
//   1. El cliente manda COORDENADAS (plan_id + índices), nunca el contenido.
//      Si el body llevara `ingredients`, un cliente podría descontar de la
//      Nevera lo que quisiera. El backend relee `plan_data` filtrando por dueño
//      (test_p1_eat_plan_meal.py cubre ese lado).
//
//   2. El índice enviado es el índice REAL dentro del día — el mismo que
//      protege P2-SWAP-INDEX-COUPLING. Mandar el índice de una lista filtrada
//      registraría el plato equivocado.
//
//   3. Los ingredientes que NO estaban en la Nevera se DICEN. Callarlos
//      dejaría al usuario creyendo que todo bajó — la misma mentira que
//      P1-PANTRY-NAME-RESOLUTION eliminó del lado del chat.
//
//   4. El botón sólo existe en la pestaña de HOY: en un día archivado las
//      coordenadas no apuntan a `plan_data.days`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, within, fireEvent } from './utils/test-utils';
import Dashboard from '../pages/Dashboard';
import * as router from 'react-router-dom';
import { useRegeneratePlan } from '../hooks/useRegeneratePlan';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: vi.fn() };
});

vi.mock('../hooks/useRegeneratePlan', () => ({ useRegeneratePlan: vi.fn() }));

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

vi.mock('../components/dashboard/ScanMealModal', () => ({ default: () => null }));

vi.mock('sonner', async () => {
    const actual = await vi.importActual('sonner');
    const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() });
    return { ...actual, toast: fn, Toaster: () => null };
});

const _todayIso = () => new Date().toISOString();
const _PLAN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const _MEALS = [
    { meal: 'Desayuno', name: 'Mangú con los tres golpes', cals: 500, desc: 'x' },
    { meal: 'Almuerzo', name: 'Arroz con pollo guisado', cals: 700, desc: 'x' },
    { meal: 'Cena', name: 'Pescado a la plancha', cals: 550, desc: 'x' },
];

function _plan(meals = _MEALS) {
    return {
        id: _PLAN_ID,
        calories: 2000,
        macros: { protein: 150, carbs: 200, fats: 60 },
        grocery_start_date: _todayIso(),
        created_at: _todayIso(),
        duration: 'weekly',
        days: [{ day: 1, day_name: 'Hoy', meals }],
    };
}

const _baseContext = { likedMeals: {}, toggleMealLike: vi.fn() };

const _emptyDiary = () => ({
    ok: true,
    json: async () => ({ totals: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 }, meals: [] }),
});

/** Respuesta del endpoint. `notInPantry` = lo que no bajó de la Nevera. */
const _eatOk = ({ mealName = 'Mangú con los tres golpes', deducted = ['2 huevos'],
                  notInPantry = [], alreadyLogged = false } = {}) => ({
    ok: true,
    json: async () => ({
        success: true,
        already_logged: alreadyLogged,
        meal_name: mealName,
        meal_type: 'desayuno',
        calories: 500,
        deducted,
        inferred: [],
        not_in_pantry: notInPantry,
        failed_to_deduct: [],
    }),
});

/** Enruta por URL: el diario de TrackingProgress vs nuestro POST. */
function _routeFetch(eatResponse = _eatOk()) {
    return vi.fn(async (url) => {
        if (typeof url === 'string' && url.includes('/api/diary/consumed-from-plan')) {
            return eatResponse;
        }
        return _emptyDiary();
    });
}

async function _waitForTrackingProgressSettled() {
    await screen.findByText(/comidas? registradas? hoy/);
}

function _eatButtonFor(dishName) {
    const card = screen.getByText(dishName).closest('.meal-card');
    return within(card).getByLabelText(new RegExp(`Registrar que te comiste ${dishName}`, 'i'));
}

function _postBody(fetchMock) {
    // [P1-EAT-PLAN-MEAL-TRUTH] antes del registro va la vista previa (/preview): el cuerpo que
    // importa es el del registro real
    const call = fetchMock.mock.calls.find(
        ([url]) => typeof url === 'string' && url.includes('/api/diary/consumed-from-plan') && !url.includes('/preview'));
    expect(call, 'no se hizo POST a /api/diary/consumed-from-plan').toBeTruthy();
    return JSON.parse(call[1].body);
}

describe('P1-EAT-PLAN-MEAL — "Me lo comí" registra el plato del plan y descuenta la Nevera', () => {
    beforeEach(() => {
        // [P1-EAT-PLAN-MEAL-TRUTH · 2026-09-05] El botón ya contrasta la HORA LOCAL con la ventana
        // del slot (config/mealWindows.js): un desayuno antes de las 05:00 abre la hoja «¿cuándo?»
        // en vez de registrar, y estos tests hacían clic en un desayuno a la hora que fuera. Con
        // el runner entre medianoche y las 05:00 (UTC en Actions) los 6 caían: ni una llamada al
        // registro. Se fija SOLO `Date` (los timers siguen reales para waitFor/findBy) al mediodía
        // de HOY, dentro de las cuatro ventanas y con la misma fecha que `_todayIso()`.
        const mediodia = new Date(); mediodia.setHours(12, 0, 0, 0);
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(mediodia);
        vi.clearAllMocks();
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        vi.mocked(useRegeneratePlan).mockReturnValue({ regeneratePlan: vi.fn() });
        vi.mocked(fetchWithAuth).mockImplementation(_routeFetch());
        window.scrollTo = vi.fn();
    });
    afterEach(() => { vi.useRealTimers(); });

    it('manda SOLO coordenadas — nunca ingredientes ni macros', async () => {
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _plan() } });
        await screen.findByText('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();

        fireEvent.click(_eatButtonFor('Mangú con los tres golpes'));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        const body = _postBody(vi.mocked(fetchWithAuth));

        // El contrato: coordenadas y nada más. [P1-EAT-PLAN-MEAL-TRUTH] `days_ago` es un backdate
        // (0 = hoy, 1 = «fue ayer»), no contenido: el servidor sigue sacando todo del plan.
        expect(Object.keys(body).sort()).toEqual(['day_index', 'days_ago', 'meal_index', 'plan_id']);
        expect(body.days_ago).toBe(0);
        expect(body.plan_id).toBe(_PLAN_ID);
        // Si el cliente pudiera declarar esto, descontaría de la Nevera a placer.
        expect(body).not.toHaveProperty('ingredients');
        expect(body).not.toHaveProperty('calories');
        expect(body).not.toHaveProperty('meal_name');
    });

    it('manda el índice REAL del plato dentro del día, no el de una lista filtrada', async () => {
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _plan() } });
        await screen.findByText('Pescado a la plancha');
        await _waitForTrackingProgressSettled();

        // La cena es el índice 2 del día. Mandar otro registraría el plato
        // equivocado y descontaría los ingredientes equivocados.
        fireEvent.click(_eatButtonFor('Pescado a la plancha'));

        // [P1-EAT-PLAN-MEAL-TRUTH] es la CENA: si el test corre antes de las 17 h locales, la hoja
        // «¿cuándo?» aparece y hay que confirmar «Lo comí ahora»; después de las 17 h registra directo.
        await waitFor(() => {
            const ahora = screen.queryByText('Lo comí ahora');
            if (ahora) fireEvent.click(ahora);
            expect(toast.success).toHaveBeenCalled();
        });
        const body = _postBody(vi.mocked(fetchWithAuth));
        expect(body.meal_index).toBe(2);
        expect(body.day_index).toBe(0);
    });

    it('dice QUÉ no estaba en la Nevera en vez de dejar creer que todo bajó', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(_routeFetch(_eatOk({
            deducted: ['2 huevos'],
            notInPantry: ['2 lascas de queso frito', '1 platano verde'],
        })));
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _plan() } });
        await screen.findByText('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();

        fireEvent.click(_eatButtonFor('Mangú con los tres golpes'));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        const desc = vi.mocked(toast.success).mock.calls[0][1].description;
        expect(desc).toMatch(/no estaban registrados/i);
        expect(desc).toContain('2 lascas de queso frito');
    });

    it('cuando todo bajó, no inventa un aviso de ausentes', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(_routeFetch(_eatOk({
            deducted: ['2 huevos', '1 platano'], notInPantry: [],
        })));
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _plan() } });
        await screen.findByText('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();

        fireEvent.click(_eatButtonFor('Mangú con los tres golpes'));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        const desc = vi.mocked(toast.success).mock.calls[0][1].description;
        expect(desc).toMatch(/Descontamos 2 ingredientes/i);
        expect(desc).not.toMatch(/no estaban registrados/i);
    });

    it('pide a TrackingProgress refrescar para que la card se atenúe sola', async () => {
        // El Dashboard NO re-deriva por su cuenta: TrackingProgress escucha
        // `refresh-inventory` → refetch → despacha `today-consumed-updated`.
        // Si este dispatch se pierde, el usuario registra y no ve nada cambiar.
        const spy = vi.fn();
        window.addEventListener('mealfit:refresh-inventory', spy);
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _plan() } });
        await screen.findByText('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();

        fireEvent.click(_eatButtonFor('Mangú con los tres golpes'));

        await waitFor(() => expect(spy).toHaveBeenCalled());
        window.removeEventListener('mealfit:refresh-inventory', spy);
    });

    it('un doble-tap dentro de la ventana de dedup no se anuncia como registro nuevo', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(_routeFetch(_eatOk({ alreadyLogged: true })));
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _plan() } });
        await screen.findByText('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();

        fireEvent.click(_eatButtonFor('Mangú con los tres golpes'));

        await waitFor(() => expect(toast).toHaveBeenCalled());
        expect(toast.success).not.toHaveBeenCalled();
        expect(vi.mocked(toast).mock.calls[0][0]).toMatch(/ya lo tenías registrado/i);
    });

    it('el botón desaparece cuando el slot ya está registrado', async () => {
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _plan() } });
        await screen.findByText('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();

        expect(_eatButtonFor('Mangú con los tres golpes')).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(new CustomEvent('mealfit:today-consumed-updated', {
                detail: { meals: [{ meal_type: 'desayuno', meal_name: 'Huevos', calories: 500 }] },
            }));
        });

        await waitFor(() => {
            const card = screen.getByText('Mangú con los tres golpes').closest('.meal-card');
            expect(within(card).queryByLabelText(/Registrar que te comiste/i)).not.toBeInTheDocument();
        });
        // Las otras cards conservan el suyo.
        expect(_eatButtonFor('Arroz con pollo guisado')).toBeInTheDocument();
    });

    it('un fallo del backend no se anuncia como éxito', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(vi.fn(async (url) => {
            if (typeof url === 'string' && url.includes('/api/diary/consumed-from-plan')) {
                return { ok: false, json: async () => ({ detail: 'Plan no encontrado.' }) };
            }
            return _emptyDiary();
        }));
        render(<Dashboard />, { customContext: { ..._baseContext, planData: _plan() } });
        await screen.findByText('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();

        fireEvent.click(_eatButtonFor('Mangú con los tres golpes'));

        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(toast.success).not.toHaveBeenCalled();
    });
});
