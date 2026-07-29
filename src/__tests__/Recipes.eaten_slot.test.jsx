// [P1-EATEN-SLOT-RECIPES · 2026-07-28 · reversado parcialmente por
// P1-EATEN-RECIPE-LOCK · 2026-07-28] Extiende a /dashboard/recipes la misma
// anotación "ya comiste esto hoy" que P1-TODAY-REMAINING trajo a "Tu Menú"
// del Dashboard — el owner: "es inútil si solo existe en un lugar, y tiene
// razón". Este archivo sigue cubriendo la ANOTACIÓN (dim + chip, riel Y
// detalle) — el riel de comidas NUNCA bloquea, sigue siendo navegación pura.
// La decisión original de este comentario ("Recetas es solo lectura, nunca
// se deshabilita nada") quedó SUPERSEDIDA: el owner pidió, dos veces, un
// bloqueo REAL de "Descargar PDF" + checkboxes de ingredientes + pasos — ver
// `Recipes.eaten_recipe_lock.test.jsx` para esa cobertura (no duplicada acá).
//
// SSOT del matcher: utils/todayRemaining.js (getEatenSlotIndices/
// eatenKcalForSlot) — el MISMO módulo que usa Dashboard.jsx, importado (NO
// reimplementado) — incluye la regla de ambigüedad (2+ meriendas hoy + 1 sola
// fila del diario ⇒ no se atenúa ninguna).
//
// "Hoy" en esta página: Recipes.jsx YA computaba `todayPlanDayIndex` para el
// clamp de la ventana del chunk (P-RECIPES-CHUNK-WINDOW) — se reutiliza tal
// cual, no se inventa una segunda noción de "hoy".
//
// Diario: TrackingProgress.jsx (Dashboard) no está montado en esta página, así
// que no hay `mealfit:today-consumed-updated` del que colgarse — Recipes.jsx
// pega directo a `GET /api/diary/consumed/{userId}` (mismo endpoint + mismo
// cálculo local de date/tzOffset), UNA vez por mount y SOLO si el tab activo
// es HOY.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor, within } from './utils/test-utils';
import Recipes from '../pages/Recipes';
import * as router from 'react-router-dom';
import { fetchWithAuth } from '../config/api';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: vi.fn(),
    };
});

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
}));

const _diaryResponse = (meals) => ({
    ok: true,
    json: async () => ({ totals: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 }, meals }),
});

const _todayIso = () => new Date().toISOString();

const _baseContext = { userProfile: { id: 'test-user' } };

function _plan(days, calories = 2000) {
    return {
        id: 'plan-1',
        calories,
        macros: { protein: 150, carbs: 200, fats: 60 },
        // Arrancar el ciclo HOY → day index 0 = "hoy" (mismo patrón que
        // Dashboard.today_remaining.test.jsx).
        grocery_start_date: _todayIso(),
        created_at: _todayIso(),
        duration: 'weekly',
        days,
    };
}

const _FOUR_MEALS_TODAY = [
    { meal: 'Desayuno', name: 'Mangú con los tres golpes', cals: 500, desc: 'x', ingredients: ['Plátano'], recipe: ['Paso uno'] },
    { meal: 'Almuerzo', name: 'Arroz con pollo guisado', cals: 700, desc: 'x', ingredients: ['Arroz'], recipe: ['Paso uno'] },
    { meal: 'Merienda', name: 'Yogur con fruta', cals: 250, desc: 'x', ingredients: ['Fruta'], recipe: ['Paso uno'] },
    { meal: 'Cena', name: 'Pescado a la plancha', cals: 550, desc: 'x', ingredients: ['Pescado'], recipe: ['Paso uno'] },
];

// [Regla de ambigüedad] Dos meriendas hoy (AM/PM) canonicalizan a la MISMA key
// 'merienda'. Se incluye además una fila de 'cena' (inequívoca, y NO es la
// comida activa por default) como testigo positivo — prueba que el fetch +
// setState del diario ya asentaron, sin depender de un `setTimeout` a ciegas.
const _FIVE_MEALS_TWO_MERIENDAS = [
    { meal: 'Desayuno', name: 'Avena con fruta', cals: 400, desc: 'x', ingredients: ['Avena'], recipe: ['Paso uno'] },
    { meal: 'Almuerzo', name: 'Habichuela con arroz', cals: 700, desc: 'x', ingredients: ['Habichuela'], recipe: ['Paso uno'] },
    { meal: 'Merienda AM', name: 'Yogur solo', cals: 150, desc: 'x', ingredients: ['Leche'], recipe: ['Paso uno'] },
    { meal: 'Merienda PM', name: 'Batido de proteína', cals: 200, desc: 'x', ingredients: ['Suero'], recipe: ['Paso uno'] },
    { meal: 'Cena', name: 'Pescado con vegetales', cals: 550, desc: 'x', ingredients: ['Vegetales'], recipe: ['Paso uno'] },
];

describe('P1-EATEN-SLOT-RECIPES — Recetas anota el slot ya comido hoy (el riel nunca bloquea; ver Recipes.eaten_recipe_lock.test.jsx para lo que SÍ bloquea)', () => {
    beforeEach(() => {
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        window.scrollTo = vi.fn();
        vi.mocked(fetchWithAuth).mockReset();
    });

    it('anota (dim + chip, riel Y detalle) el slot ya comido hoy, nombra lo REGISTRADO (no el plato del plan) en el tooltip, y deja los demás intactos', async () => {
        // [P1-EATEN-SLOT-COPY · 2026-07-28] `meal_name` DELIBERADAMENTE
        // distinto del plato del plan ("Mangú con los tres golpes") — mismo
        // caso real que reportó el owner (plan: "Tostadas Francesas...",
        // diario: "Mangú con Los Tres Golpes"): el matcher es por SLOT
        // (`meal_type`), nunca por nombre.
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', meal_name: 'Avena con canela', calories: 500 }])
        );
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
        });

        // El slot comido (Desayuno, activeMealIndex=0 por default) es a la vez
        // el nombre del riel Y el título del detalle → 2 anotaciones cuando
        // asienta el fetch. El chip SOLO nombra el slot — nunca "esto", nunca
        // un plato.
        const chipEls = await screen.findAllByText('Ya registraste tu desayuno');
        expect(chipEls).toHaveLength(2);
        expect(screen.queryByText(/esto/i)).not.toBeInTheDocument();

        // [P1-EATEN-SLOT-COPY · 2026-07-28] kcal removido del chip VISIBLE —
        // discutía con el chip `{meal.cals} kcal` vecino en el detalle (dos
        // números en la misma fila). El detalle real (nombre logueado + kcal
        // estimada, nunca el plato del plan) vive en el `title` (y, desde
        // [P1-EATEN-RECIPE-LOCK · 2026-07-28], TAMBIÉN en un nodo `.srOnly`
        // para el bloqueo real — por eso esta aserción se restringe al propio
        // chip en vez de buscar en TODA la página: el `.srOnly` sí lleva el
        // kcal, a propósito, para el lector de pantalla).
        for (const el of chipEls) {
            expect(el.textContent).not.toMatch(/~500 kcal/);
        }
        const titleOf = (el) => el.getAttribute('title') || el.closest('[title]')?.getAttribute('title');
        for (const el of chipEls) {
            const t = titleOf(el);
            expect(t).toBeTruthy();
            expect(t).toContain('Avena con canela');
            expect(t).not.toContain('Mangú con los tres golpes'); // el plato del PLAN — nunca afirmado
            expect(t).toContain('~500 kcal');
            // [P1-EATEN-RECIPE-LOCK · 2026-07-28] Antes 'info' ("Corrígelo…",
            // sin "desbloquear" — Recetas era solo lectura). Ahora 'unlock':
            // el PDF/checkboxes/pasos SÍ están bloqueados de verdad, así que
            // el mismo texto que usa Dashboard.jsx es el honesto acá también.
            expect(t).toMatch(/desbloquear/i);
            expect(t).toContain('Bórralo en «Progreso en Tiempo Real»');
        }

        const railTitle = screen.getAllByText('Mangú con los tres golpes').find((el) => el.closest('button'));
        expect(railTitle).toBeTruthy();
        const railBtn = railTitle.closest('button');
        expect(within(railBtn).getByText('Ya registraste tu desayuno')).toBeInTheDocument();

        // Los otros 3 slots del riel NO llevan la anotación.
        for (const otherName of ['Arroz con pollo guisado', 'Yogur con fruta', 'Pescado a la plancha']) {
            const otherBtn = screen.getByText(otherName).closest('button');
            expect(within(otherBtn).queryByText('Ya registraste tu desayuno')).not.toBeInTheDocument();
        }
    });

    it('el mismo slot en el tab de OTRO día no lleva anotación, y el diario se fetchea una sola vez', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', calories: 500 }])
        );
        const plan = _plan([
            { day: 1, meals: [{ meal: 'Desayuno', name: 'Mangú de hoy', cals: 500, desc: 'x', ingredients: [], recipe: [] }] },
            { day: 2, meals: [{ meal: 'Desayuno', name: 'Mangú de mañana', cals: 500, desc: 'x', ingredients: [], recipe: [] }] },
        ]);
        render(<Recipes />, { customContext: { ..._baseContext, planData: plan } });

        // Tab "hoy" (auto-seleccionado, day index 0): riel + detalle anotados.
        await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno')).toHaveLength(2));
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);

        const tabs = screen.getAllByRole('tab');
        expect(tabs).toHaveLength(2);

        // Cambiar al tab del otro día: cero anotación, aunque el diario
        // (`todaysConsumedMeals`) siga en memoria.
        fireEvent.click(tabs[1]);
        await waitFor(() => expect(screen.getAllByText('Mangú de mañana').length).toBeGreaterThan(0));
        expect(screen.queryByText('Ya registraste tu desayuno')).not.toBeInTheDocument();

        // Volver al tab de hoy no dispara un SEGUNDO fetch (una sola vez por mount).
        fireEvent.click(tabs[0]);
        await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno')).toHaveLength(2));
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    });

    it('REGLA DE AMBIGÜEDAD: dos meriendas hoy + una sola fila del diario ⇒ no anota ninguna', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'merienda', calories: 150 }, { meal_type: 'cena', calories: 550 }])
        );
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FIVE_MEALS_TWO_MERIENDAS }]) },
        });

        // Testigo positivo: la fila 'cena' SÍ es inequívoca (un solo slot Cena)
        // y NO es la comida activa por default (Desayuno/Avena lo es) → 1 sola
        // anotación (riel). Prueba que el fetch + setState ya asentaron sin
        // recurrir a un `setTimeout` ciego.
        await waitFor(() => expect(screen.getAllByText('Ya registraste tu cena')).toHaveLength(1));
        const cenaBtn = screen.getByText('Pescado con vegetales').closest('button');
        expect(within(cenaBtn).getByText('Ya registraste tu cena')).toBeInTheDocument();

        // Las DOS meriendas (AM y PM) — la key ambigua — no llevan nada.
        for (const name of ['Yogur solo', 'Batido de proteína']) {
            const btn = screen.getByText(name).closest('button');
            expect(within(btn).queryByText(/^Ya registraste tu/)).not.toBeInTheDocument();
        }
    });

    it('el RIEL de comidas nunca se deshabilita — sigue totalmente navegable y la receta comida sigue legible (el bloqueo de PDF/checkboxes/pasos vive en Recipes.eaten_recipe_lock.test.jsx)', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', calories: 500 }])
        );
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
        });

        await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno')).toHaveLength(2));

        // Todos los botones del riel de comidas siguen habilitados (incluido el comido).
        const rail = screen.getByLabelText('Comidas del día');
        within(rail).getAllByRole('button').forEach((b) => expect(b).not.toBeDisabled());

        // Navegar a OTRA comida sigue funcionando con normalidad...
        fireEvent.click(screen.getByText('Arroz con pollo guisado').closest('button'));
        await waitFor(() => expect(screen.getByText('Arroz')).toBeInTheDocument());

        // ...y volver al slot YA COMIDO también: 100% clickeable, receta legible.
        fireEvent.click(screen.getByText('Mangú con los tres golpes').closest('button'));
        expect(await screen.findByText('Plátano')).toBeInTheDocument();

        // [P1-EATEN-RECIPE-LOCK · 2026-07-28] El botón de descargar PDF SÍ
        // queda deshabilitado sobre un slot ya comido — decisión revertida
        // (antes esta misma línea afirmaba lo contrario). Cobertura completa
        // del bloqueo (click/teclado/checkboxes/pasos/a11y/unlock) vive en
        // Recipes.eaten_recipe_lock.test.jsx.
        const pdfBtn = screen.getByText(/Descargar PDF/).closest('button');
        expect(pdfBtn).toBeDisabled();
    });

    it('sin registros en el diario de hoy, no aparece ninguna anotación', async () => {
        const diaryPromise = Promise.resolve(_diaryResponse([]));
        vi.mocked(fetchWithAuth).mockReturnValue(diaryPromise);
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
        });

        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        // Asienta la cadena de promesas propia del efecto (fetch → .json() →
        // setState) de forma determinística, sin `setTimeout` a ciegas.
        await act(async () => {
            await diaryPromise;
            await diaryPromise.then((r) => r.json());
        });

        expect(screen.queryByText(/^Ya registraste tu/)).not.toBeInTheDocument();
    });
});
