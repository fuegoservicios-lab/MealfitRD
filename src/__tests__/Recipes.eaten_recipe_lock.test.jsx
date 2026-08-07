// [P1-EATEN-RECIPE-LOCK · 2026-07-28] El owner, dos veces: "deberías bloquear
// lo de descargar PDF, y lo de anotar o confirmar los alimentos. Quiero un
// bloqueo absoluto y no simplemente visual" — REVERSA la decisión previa
// ("Recetas es solo lectura, NUNCA lock", ver `Recipes.eaten_slot.test.jsx` y
// `Recipes.eaten_recipe_done.test.jsx`, cuyos tests conflictivos fueron
// INVERTIDOS, no borrados, en el mismo commit que este archivo).
//
// Sibling dedicado (en vez de seguir inflando `Recipes.eaten_recipe_done.
// test.jsx`) para la cobertura EXHAUSTIVA del bloqueo real:
//   - "Descargar PDF" — `aria-disabled` + early-return en el handler (NUNCA
//     `disabled` nativo — sacaría el botón del tab order, ver corrección
//     de revisión de código más abajo), click no dispara `onPDF`.
//   - Checkboxes de ingredientes (`role="checkbox"`) — click Y el camino
//     Enter/Space de `onKeyDown` quedan inertes.
//   - Toggle de pasos — click no marca el paso como hecho.
//   - Parity desktop (RecipesView) / mobile (MobileRecipes).
//   - El día NO-hoy nunca bloquea (mismo gate que ya prueba
//     Recipes.eaten_recipe_done.test.jsx para el archivado visual).
//   - Accesibilidad: la razón del bloqueo llega a un lector de pantalla vía
//     `aria-describedby` (un `title` NO basta), y NINGÚN control gana
//     `aria-label` que reemplace su nombre accesible existente. El botón de
//     PDF además prueba que `.focus()` SÍ aterriza en él (no `disabled`
//     nativo) — sin eso, `aria-describedby` describe un nodo que ningún
//     camino de teclado alcanza jamás.
//   - El "unlock round-trip": Recipes.jsx NO escucha
//     `mealfit:today-consumed-updated` (a diferencia de Dashboard.jsx/
//     TrackingProgress.jsx) — ver su propio comentario ("Esa card NO está
//     montada en Recetas… no hay evento del que colgarse"). El round-trip
//     real de ESTA página es el fetch-once-per-mount: salir y volver a
//     /dashboard/recipes (remount de React Router, SPA, sin reload de
//     browser) dispara un fetch fresco. Se simula acá desmontando y
//     volviendo a montar con una respuesta de diario distinta.
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// Mismo mock chainable que Recipes.eaten_recipe_done.test.jsx — instancia
// única reutilizada entre llamadas a `html2pdf()`.
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
    { meal: 'Desayuno', name: 'Mangú con los tres golpes', cals: 500, protein: 10, carbs: 60, fats: 8, desc: 'x', ingredients: ['Plátano', 'Queso frito'], recipe: ['Paso uno', 'Paso dos'] },
    { meal: 'Almuerzo', name: 'Arroz con pollo guisado', cals: 700, protein: 30, carbs: 80, fats: 15, desc: 'x', ingredients: ['Arroz'], recipe: ['Paso uno'] },
    { meal: 'Merienda', name: 'Yogur con fruta', cals: 250, protein: 8, carbs: 30, fats: 5, desc: 'x', ingredients: ['Fruta'], recipe: ['Paso uno'] },
    { meal: 'Cena', name: 'Pescado a la plancha', cals: 550, protein: 35, carbs: 20, fats: 12, desc: 'x', ingredients: ['Pescado'], recipe: ['Paso uno'] },
];

// Flipea `useIsMobile()` a true SOLO dentro del test que la invoca — mismo
// helper que Recipes.eaten_recipe_done.test.jsx (setupTests.js stubea
// `matchMedia` a desktop globalmente).
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

describe('P1-EATEN-RECIPE-LOCK — bloqueo REAL (no solo visual) de PDF/checkboxes/pasos sobre un slot ya comido hoy', () => {
    beforeEach(() => {
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        window.scrollTo = vi.fn();
        vi.mocked(fetchWithAuth).mockReset();
        _html2pdfInstance.set.mockClear();
        _html2pdfInstance.from.mockClear();
        _html2pdfInstance.save.mockClear();
    });

    it('DESKTOP — PDF: disabled + el click NO invoca el handler real sobre el slot comido; SÍ lo invoca sobre uno no comido', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', meal_name: 'Avena con canela', calories: 500 }])
        );
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
        });
        await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno')).toHaveLength(2));

        // Desayuno (activo por default) está comido.
        // [P1-EATEN-RECIPE-LOCK · 2026-07-28 · corregido en revisión de
        // código el mismo día] `aria-disabled`, NUNCA `disabled` nativo — un
        // `disabled` nativo saca el botón del tab order y con él el
        // `aria-describedby` que apunta a la razón del bloqueo deja de ser
        // alcanzable por teclado (hallazgo de la revisión). El botón sigue
        // siendo focosable (ver el test de a11y más abajo para la prueba
        // directa de foco) — el bloqueo real vive en el early-return del
        // handler, no en sacar el control del árbol de interacción.
        const pdfBtn = screen.getByText(/Descargar PDF/).closest('button');
        expect(pdfBtn).not.toBeDisabled();
        expect(pdfBtn).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(pdfBtn);
        expect(_html2pdfInstance.from).not.toHaveBeenCalled();

        // Navegar al Almuerzo (NO comido): el botón vuelve a estar habilitado
        // y el click SÍ dispara la descarga real.
        fireEvent.click(screen.getByText('Arroz con pollo guisado').closest('button'));
        const pdfBtn2 = await screen.findByText(/Descargar PDF/);
        expect(pdfBtn2.closest('button')).not.toHaveAttribute('aria-disabled');
        fireEvent.click(pdfBtn2.closest('button'));
        await waitFor(() => expect(_html2pdfInstance.from).toHaveBeenCalledTimes(1));
    });

    it('DESKTOP — checkbox de ingrediente: click Y teclado (Enter/Space) NO togglean sobre el slot comido; SÍ togglean sobre uno no comido', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', calories: 500 }])
        );
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
        });
        await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno')).toHaveLength(2));

        const box = screen.getByText('Plátano').closest('[role="checkbox"]');
        expect(box.getAttribute('aria-checked')).toBe('false');

        fireEvent.click(box);
        expect(box.getAttribute('aria-checked')).toBe('false');

        fireEvent.keyDown(box, { key: 'Enter' });
        expect(box.getAttribute('aria-checked')).toBe('false');

        fireEvent.keyDown(box, { key: ' ' });
        expect(box.getAttribute('aria-checked')).toBe('false');

        // Slot no comido: los 3 caminos togglean con normalidad.
        fireEvent.click(screen.getByText('Arroz con pollo guisado').closest('button'));
        const box2 = await screen.findByText('Arroz');
        const ingBox2 = box2.closest('[role="checkbox"]');
        expect(ingBox2.getAttribute('aria-checked')).toBe('false');
        fireEvent.click(ingBox2);
        expect(ingBox2.getAttribute('aria-checked')).toBe('true');
        fireEvent.keyDown(ingBox2, { key: 'Enter' });
        expect(ingBox2.getAttribute('aria-checked')).toBe('false');
        fireEvent.keyDown(ingBox2, { key: ' ' });
        expect(ingBox2.getAttribute('aria-checked')).toBe('true');
    });

    it('DESKTOP — toggle de paso: click NO marca el paso como hecho sobre el slot comido; SÍ lo marca sobre uno no comido', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', calories: 500 }])
        );
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
        });
        await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno')).toHaveLength(2));

        // El nodo `.step` (el que gana `done`) es el ÚNICO con el custom
        // property `--stone` inline — `.stepText`/`.stepCard` también matchean
        // `[class*="step"]` por nombre (falso positivo verificado al escribir
        // este test: `.closest('[class*="step"]')` desde el texto devolvía
        // `.stepText` a sí mismo, nunca su ancestro real).
        const step = screen.getByText('Paso uno').closest('[style*="--stone"]');
        expect(step.className).not.toMatch(/done/);
        fireEvent.click(step);
        expect(step.className).not.toMatch(/done/);

        // Slot no comido: el toggle SÍ marca el paso.
        fireEvent.click(screen.getByText('Arroz con pollo guisado').closest('button'));
        const step2 = await screen.findByText('Paso uno');
        const stepRoot2 = step2.closest('[style*="--stone"]');
        expect(stepRoot2.className).not.toMatch(/done/);
        fireEvent.click(stepRoot2);
        expect(stepRoot2.className).toMatch(/done/);
    });

    it('el día que NO es hoy nunca bloquea, aunque el mismo slot esté comido en el diario de HOY', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', calories: 500 }])
        );
        const plan = _plan([
            { day: 1, meals: [{ meal: 'Desayuno', name: 'Mangú de hoy', cals: 500, desc: 'x', ingredients: ['Plátano'], recipe: ['Paso uno'] }] },
            { day: 2, meals: [{ meal: 'Desayuno', name: 'Mangú de mañana', cals: 500, desc: 'x', ingredients: ['Plátano'], recipe: ['Paso uno'] }] },
        ]);
        render(<Recipes />, { customContext: { ..._baseContext, planData: plan } });

        // Tab hoy: bloqueado.
        await waitFor(() => expect(screen.getByText(/Descargar PDF/).closest('button')).toHaveAttribute('aria-disabled', 'true'));

        // Tab de mañana: PDF/checkbox/paso 100% funcionales.
        const tabs = screen.getAllByRole('tab');
        fireEvent.click(tabs[1]);
        await waitFor(() => expect(screen.getByText('Mangú de mañana', { selector: 'h2' })).toBeInTheDocument());

        const pdfBtn = screen.getByText(/Descargar PDF/).closest('button');
        expect(pdfBtn).not.toHaveAttribute('aria-disabled');
        fireEvent.click(pdfBtn);
        await waitFor(() => expect(_html2pdfInstance.from).toHaveBeenCalledTimes(1));

        const box = screen.getByText('Plátano').closest('[role="checkbox"]');
        expect(box).not.toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(box);
        expect(box.getAttribute('aria-checked')).toBe('true');
    });

    it('MOBILE — misma paridad: PDF disabled + inerte, checkbox inerte (click y teclado), paso inerte sobre el slot comido', async () => {
        const _restore = _useMobileMatchMedia();
        try {
            vi.mocked(fetchWithAuth).mockResolvedValue(
                _diaryResponse([{ meal_type: 'desayuno', calories: 500 }])
            );
            render(<Recipes />, {
                customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
            });
            await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno').length).toBeGreaterThan(0));

            const pdfBtn = screen.getByText(/Descargar PDF/).closest('button');
            expect(pdfBtn).not.toBeDisabled();
            expect(pdfBtn).toHaveAttribute('aria-disabled', 'true');
            fireEvent.click(pdfBtn);
            expect(_html2pdfInstance.from).not.toHaveBeenCalled();

            const box = screen.getByText('Plátano').closest('[role="checkbox"]');
            expect(box).toHaveAttribute('aria-disabled', 'true');
            fireEvent.click(box);
            expect(box.getAttribute('aria-checked')).toBe('false');
            fireEvent.keyDown(box, { key: 'Enter' });
            expect(box.getAttribute('aria-checked')).toBe('false');

            const step = screen.getByText('Paso uno').closest('[style*="--stone"]');
            fireEvent.click(step);
            expect(step.className).not.toMatch(/done/);

            // Slot no comido en mobile (riel selecciona por label, no por
            // nombre de plato — ver Recipes.eaten_recipe_done.test.jsx).
            fireEvent.click(screen.getByText('Almuerzo').closest('button'));
            const pdfBtn2 = await screen.findByText(/Descargar PDF/);
            expect(pdfBtn2.closest('button')).not.toHaveAttribute('aria-disabled');
            fireEvent.click(pdfBtn2.closest('button'));
            await waitFor(() => expect(_html2pdfInstance.from).toHaveBeenCalledTimes(1));
        } finally {
            _restore();
        }
    });

    it('a11y: cada control bloqueado expone la razón a un lector de pantalla (aria-describedby → nodo real, nunca solo `title`) y NINGUNO gana aria-label que reemplace su nombre', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            _diaryResponse([{ meal_type: 'desayuno', meal_name: 'Avena con canela', calories: 500 }])
        );
        render(<Recipes />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]) },
        });
        await waitFor(() => expect(screen.getAllByText('Ya registraste tu desayuno')).toHaveLength(2));

        const _expectedFragment = 'Bórralo en «Progreso en Tiempo Real» para desbloquear.';

        const pdfBtn = screen.getByText(/Descargar PDF/).closest('button');
        const pdfDescId = pdfBtn.getAttribute('aria-describedby');
        expect(pdfDescId).toBeTruthy();
        expect(document.getElementById(pdfDescId).textContent).toContain(_expectedFragment);
        // El texto visible del botón NUNCA se reemplaza — sigue diciendo
        // "Descargar PDF" (name-from-content intacto, sin aria-label).
        expect(pdfBtn).not.toHaveAttribute('aria-label');
        expect(pdfBtn).toHaveTextContent('Descargar PDF');
        // [P1-EATEN-RECIPE-LOCK · 2026-07-28 · corregido en revisión de
        // código el mismo día] El hallazgo original: `disabled` nativo saca
        // el botón del tab order, así que `aria-describedby` nunca se
        // dispara para un usuario de teclado — el DOM podía tener el nodo de
        // la razón sin que NINGÚN camino de interacción llegara a él. Esta
        // aserción prueba el camino real, no solo la presencia del nodo:
        // `disabled` nativo hace que `.focus()` sea un no-op (el elemento
        // nunca se vuelve `document.activeElement`); con `aria-disabled` el
        // foco programático (equivalente a Tab) SÍ aterriza en el botón.
        expect(pdfBtn).not.toHaveAttribute('disabled');
        pdfBtn.focus();
        expect(document.activeElement).toBe(pdfBtn);

        const box = screen.getByText('Plátano').closest('[role="checkbox"]');
        expect(box).toHaveAttribute('aria-disabled', 'true');
        const boxDescId = box.getAttribute('aria-describedby');
        expect(boxDescId).toBeTruthy();
        expect(document.getElementById(boxDescId).textContent).toContain(_expectedFragment);
        // El nombre accesible del checkbox viene del texto del ingrediente —
        // un aria-label lo reemplazaría y el usuario perdería QUÉ ingrediente es.
        expect(box).not.toHaveAttribute('aria-label');
        expect(box).toHaveTextContent('Plátano');
        // Se mantiene focusable a propósito — ver comentario largo en
        // RecipesView.jsx sobre por qué (descubribilidad vs. sacarlo del tab order).
        expect(box).toHaveAttribute('tabIndex', '0');

        const step = screen.getByText('Paso uno').closest('[aria-disabled]');
        expect(step).toBeTruthy();
        const stepDescId = step.getAttribute('aria-describedby');
        expect(stepDescId).toBeTruthy();
        expect(document.getElementById(stepDescId).textContent).toContain(_expectedFragment);
    });

    it('unlock round-trip: al desmontar y remontar (equivalente a salir y volver a Recetas) con el registro ya borrado del diario, los 3 controles se re-habilitan sin que cambie una sola línea del plan', async () => {
        // 1ª "visita": el desayuno está comido → todo bloqueado.
        vi.mocked(fetchWithAuth).mockResolvedValueOnce(
            _diaryResponse([{ meal_type: 'desayuno', calories: 500 }])
        );
        const plan = _plan([{ day: 1, meals: _FOUR_MEALS_TODAY }]);
        const { unmount } = render(<Recipes />, {
            customContext: { ..._baseContext, planData: plan },
        });
        await waitFor(() => expect(screen.getByText(/Descargar PDF/).closest('button')).toHaveAttribute('aria-disabled', 'true'));
        const box = screen.getByText('Plátano').closest('[role="checkbox"]');
        expect(box).toHaveAttribute('aria-disabled', 'true');

        // El usuario borra la comida en "Progreso en Tiempo Real" (Dashboard,
        // fuera de esta página) y vuelve a Recetas — SPA, sin reload del
        // browser. Simulado acá desmontando (Recipes.jsx no persiste el
        // diario fuera de su propio `useState`) y montando de nuevo con el
        // diario YA sin el registro de desayuno.
        unmount();
        vi.mocked(fetchWithAuth).mockResolvedValueOnce(_diaryResponse([]));
        render(<Recipes />, { customContext: { ..._baseContext, planData: plan } });

        await waitFor(() => expect(screen.queryByText('Ya registraste tu desayuno')).not.toBeInTheDocument());
        const pdfBtn = screen.getByText(/Descargar PDF/).closest('button');
        expect(pdfBtn).not.toHaveAttribute('aria-disabled');
        fireEvent.click(pdfBtn);
        await waitFor(() => expect(_html2pdfInstance.from).toHaveBeenCalledTimes(1));

        const box2 = screen.getByText('Plátano').closest('[role="checkbox"]');
        expect(box2).not.toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(box2);
        expect(box2.getAttribute('aria-checked')).toBe('true');
    });
});
