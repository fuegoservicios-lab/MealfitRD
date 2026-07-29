// [P1-EATEN-RECIPE-DONE · 2026-07-28] El owner, mirando Recetas con el
// desayuno ya registrado: "me gustaría que visualmente se bloqueara lo que
// es la receta completa del día del desayuno, ya que solo está bloqueado
// una parte" — el riel ya se atenuaba (P1-EATEN-SLOT-RECIPES) pero el pane
// de detalle (título, dona, ingredientes, pasos) se pintaba idéntico a
// cualquier otra receta. Este archivo cubre la parte NUEVA (el pane
// completo se archiva visualmente) — Recipes.eaten_slot.test.jsx sigue
// cubriendo el chip/riel preexistentes, sin duplicar.
//
// Reglas duras que estos tests protegen:
//   - El modificador SOLO aparece cuando el slot mostrado está comido Y el
//     día mostrado es HOY (`meal._isEatenToday` ya llega gateado a ambas
//     condiciones desde Recipes.jsx — un solo flag, ver comentario largo en
//     RecipesView.jsx/MobileRecipes.jsx).
//   - Desktop (RecipesView) y mobile (MobileRecipes) — parity es el punto
//     del pedido; `window.matchMedia` se flipea a mobile SOLO donde se
//     necesita, y se restaura después (el resto de la suite depende del
//     stub global de setupTests.js, que siempre reporta desktop).
//   - El mecanismo (`filter: grayscale` en vez de ocultar/blur/gate) nunca
//     debe llegar al PDF: `handleDownloadPDF` arma un string HTML
//     independiente (generateRecipeHTML) que jamás referencia
//     `styles.detail`/`styles.eaten` — se prueba EJECUTANDO el flujo real de
//     descarga (con html2pdf.js mockeado) y capturando el string que recibe
//     `.from(...)`, no solo leyendo el código.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './utils/test-utils';
import Recipes from '../pages/Recipes';
import * as router from 'react-router-dom';
import { fetchWithAuth } from '../config/api';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: vi.fn() };
});

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
}));

// [P1-EATEN-RECIPE-DONE] Mock de html2pdf.js — captura EXACTAMENTE el string
// que `handleDownloadPDF` le entrega a `.from(...)`, que es lo único que
// html2canvas termina viendo. `instance` es el MISMO objeto en cada llamada
// a `html2pdf()` (patrón chainable real: `.set().from().save()`), así el
// test puede inspeccionar `instance.from.mock.calls` después del click.
const _html2pdfInstance = {
    set: vi.fn(function () { return this; }),
    from: vi.fn(function () { return this; }),
    save: vi.fn(() => Promise.resolve()),
};
vi.mock('html2pdf.js', () => ({
    default: vi.fn(() => _html2pdfInstance),
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
        grocery_start_date: _todayIso(),
        created_at: _todayIso(),
        duration: 'weekly',
        days,
    };
}

const _FOUR_MEALS_TODAY = [
    { meal: 'Desayuno', name: 'Mangú con los tres golpes', cals: 500, protein: 10, carbs: 60, fats: 8, desc: 'x', ingredients: ['Plátano'], recipe: ['Paso uno'] },
    { meal: 'Almuerzo', name: 'Arroz con pollo guisado', cals: 700, protein: 30, carbs: 80, fats: 15, desc: 'x', ingredients: ['Arroz'], recipe: ['Paso uno'] },
    { meal: 'Merienda', name: 'Yogur con fruta', cals: 250, protein: 8, carbs: 30, fats: 5, desc: 'x', ingredients: ['Fruta'], recipe: ['Paso uno'] },
    { meal: 'Cena', name: 'Pescado a la plancha', cals: 550, protein: 35, carbs: 20, fats: 12, desc: 'x', ingredients: ['Pescado'], recipe: ['Paso uno'] },
];

// [P1-EATEN-RECIPE-DONE] flipea `useIsMobile()` (hooks/useMediaQuery.js) a
// true SOLO dentro del test que la invoca — setupTests.js stubea
// `matchMedia` a `matches:false` globalmente (por eso toda la suite
// existente de Recetas prueba, sin saberlo, solo el camino desktop).
function _useMobileMatchMedia() {
    const _orig = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
    return () => { window.matchMedia = _orig; };
}

// Recorre desde el heading del título hasta el ancestro con la clase
// `.detail` del CSS module (ambos módulos preservan el nombre original en
// el identificador escaneable — mismo patrón que usa
// Hero.p1_orb_autoplay_mobile.test.jsx con `orbBreath`).
function _detailRootFor(mealName) {
    const heading = screen.getByText(mealName, { selector: 'h2' });
    return heading.closest('[class*="detail"]');
}

describe('P1-EATEN-RECIPE-DONE — el pane de detalle completo se "archiva" (desatura), nunca se oculta/bloquea', () => {
    beforeEach(() => {
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        window.scrollTo = vi.fn();
        vi.mocked(fetchWithAuth).mockReset();
        _html2pdfInstance.set.mockClear();
        _html2pdfInstance.from.mockClear();
        _html2pdfInstance.save.mockClear();
    });

    it('DESKTOP: el root del detalle carga el modificador cuando el slot está comido Y el día mostrado es hoy', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', meal_name: 'Avena con canela', calories: 500 }])
        );
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
        });

        await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno')).toHaveLength(2));

        const detailRoot = _detailRootFor('Mangú con los tres golpes');
        expect(detailRoot).toBeTruthy();
        expect(detailRoot.className).toMatch(/eaten/);
    });

    it('DESKTOP: NO carga el modificador para un slot no comido (mismo día)', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', calories: 500 }])
        );
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
        });

        await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno')).toHaveLength(2));

        // Navegar al Almuerzo (NO comido) — el detalle que se pinta ahora es
        // el suyo, y no debe cargar la clase.
        fireEvent.click(screen.getByText('Arroz con pollo guisado').closest('button'));
        await waitFor(() => {
            const root = _detailRootFor('Arroz con pollo guisado');
            expect(root).toBeTruthy();
            expect(root.className).not.toMatch(/eaten/);
        });
    });

    it('DESKTOP: NO carga el modificador cuando el slot comido está en un día que NO es hoy', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', calories: 500 }])
        );
        const plan = _plan([
            { day: 1, meals: [{ meal: 'Desayuno', name: 'Mangú de hoy', cals: 500, protein: 10, carbs: 60, fats: 8, desc: 'x', ingredients: [], recipe: [] }] },
            { day: 2, meals: [{ meal: 'Desayuno', name: 'Mangú de mañana', cals: 500, protein: 10, carbs: 60, fats: 8, desc: 'x', ingredients: [], recipe: [] }] },
        ]);
        render(<Recipes />, { customContext: { ..._baseContext, planData: plan } });

        // Tab "hoy" (day index 0, auto-seleccionado): SÍ carga el modificador.
        await waitFor(() => {
            const root = _detailRootFor('Mangú de hoy');
            expect(root.className).toMatch(/eaten/);
        });

        // Cambiar al tab de MAÑANA: mismo `meal.meal` ('Desayuno'), pero el
        // día mostrado ya no es hoy → sin modificador, aunque el diario del
        // día actual siga en memoria.
        const tabs = screen.getAllByRole('tab');
        fireEvent.click(tabs[1]);
        await waitFor(() => {
            const root = _detailRootFor('Mangú de mañana');
            expect(root).toBeTruthy();
            expect(root.className).not.toMatch(/eaten/);
        });
    });

    it('MOBILE: mismo contrato — el root del detalle carga el modificador para el slot comido de hoy y no para los demás', async () => {
        const _restoreMatchMedia = _useMobileMatchMedia();
        try {
            vi.mocked(fetchWithAuth).mockResolvedValue(
                _diaryResponse([{ meal_type: 'desayuno', meal_name: 'Avena con canela', calories: 500 }])
            );
            render(<Recipes />, {
                customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
            });

            await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno').length).toBeGreaterThan(0));

            const detailRoot = _detailRootFor('Mangú con los tres golpes');
            expect(detailRoot).toBeTruthy();
            expect(detailRoot.className).toMatch(/eaten/);

            // Slot no comido: sin modificador. El riel de MobileRecipes NO
            // pinta `m.name` (solo `m.meal`+kcal, ver MobileRecipes.jsx) —
            // se selecciona por el label del slot, no por el nombre del plato.
            fireEvent.click(screen.getByText('Almuerzo').closest('button'));
            await waitFor(() => {
                const root = _detailRootFor('Arroz con pollo guisado');
                expect(root.className).not.toMatch(/eaten/);
            });
        } finally {
            _restoreMatchMedia();
        }
    });

    it('nada se deshabilita bajo el modificador: checkboxes de ingredientes, toggle de pasos y el botón de PDF siguen funcionales', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', calories: 500 }])
        );
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
        });
        await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno')).toHaveLength(2));

        const detailRoot = _detailRootFor('Mangú con los tres golpes');
        expect(detailRoot.className).toMatch(/eaten/);

        // El checkbox de ingrediente sigue siendo un role=checkbox clickeable
        // (P1-6 a11y) — no `aria-disabled`, no listener removido.
        const ingCheckbox = screen.getByText('Plátano').closest('[role="checkbox"]');
        expect(ingCheckbox).not.toHaveAttribute('aria-disabled', 'true');
        expect(ingCheckbox.getAttribute('aria-checked')).toBe('false');
        fireEvent.click(ingCheckbox);
        expect(ingCheckbox.getAttribute('aria-checked')).toBe('true');

        const pdfBtn = screen.getByText(/Descargar PDF/).closest('button');
        expect(pdfBtn).not.toBeDisabled();
    });

    it('PDF: el string capturado por html2pdf.js NO lleva filter/grayscale ni referencia a la clase del modificador — el pane gris en pantalla no filtra al documento', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', calories: 500 }])
        );
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
        });
        await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno')).toHaveLength(2));

        // Confirma la premisa antes de descargar: el pane EN PANTALLA sí
        // lleva el modificador para este slot (si no, la aserción de abajo
        // sería trivialmente cierta por no ejercitar el caso real).
        const detailRoot = _detailRootFor('Mangú con los tres golpes');
        expect(detailRoot.className).toMatch(/eaten/);

        const pdfBtn = screen.getByText(/Descargar PDF/).closest('button');
        fireEvent.click(pdfBtn);

        await waitFor(() => expect(_html2pdfInstance.from).toHaveBeenCalled());
        const [capturedHtml, capturedType] = _html2pdfInstance.from.mock.calls[0];

        // `.from(htmlString, 'string')` — nunca un nodo del DOM vivo.
        expect(capturedType).toBe('string');
        expect(typeof capturedHtml).toBe('string');
        // Nada de lo que arma la desaturación en pantalla viaja al string.
        expect(capturedHtml).not.toMatch(/filter\s*:/i);
        expect(capturedHtml).not.toMatch(/grayscale/i);
        expect(capturedHtml).not.toMatch(/class=/i); // generateRecipeHTML es 100% inline, sin className/class alguno.
        // El contenido real del plato SÍ llega (mismo string, receta completa).
        expect(capturedHtml).toContain('Mangú con los tres golpes');
        expect(capturedHtml).toContain('Plátano');
    });
});
