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
import { render, screen, act, fireEvent, waitFor, within } from './utils/test-utils';
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
    await _esperaTexto(/comidas? registradas? hoy/);
}

// Misma llamada que usa el código de producción (Dashboard.jsx) — así la
// aserción no depende de qué locale ICU tenga el runtime que corre el test
// (Node small-icu formatea distinto a un browser con full-icu).
/**
 * [P2-FLAKE-PLAZO . 2026-08-18] Espera a un re-render disparado por un EVENTO.
 *
 * `findByText` reintenta 1.000 ms por defecto, y eso basta cuando este fichero
 * corre solo. Con la suite entera en paralelo no: el gate del deploy tumbo aqui
 * un test que pasa aislado, tras rendirse a los 1.585 ms. No habia defecto de
 * producto — habia un plazo calibrado para una maquina ociosa.
 *
 * Ocho esperas de este fichero usaban el plazo por defecto y ninguna lo
 * declaraba, asi que el flake no era de un test: era del fichero.
 *
 * Subir el plazo NO enmascara nada. Lo que se espera es un re-render que sigue a
 * un evento ya despachado: si de verdad no llega, el test sigue fallando, solo
 * que por la razon correcta y no por lo cargada que estuviera la maquina.
 */
const _esperaTexto = (texto) => screen.findByText(texto, {}, { timeout: 5000 });

const _fmtKcal = (n) => n.toLocaleString('es-DO');

describe('P1-TODAY-REMAINING — "Tu Menú" atenúa lo ya comido hoy (derivado, nunca persistido)', () => {
    beforeEach(() => {
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        vi.mocked(useRegeneratePlan).mockReturnValue({ regeneratePlan: vi.fn() });
        vi.mocked(fetchWithAuth).mockResolvedValue(_emptyDiaryResponse());
        window.scrollTo = vi.fn();
    });

    it('dims the eaten slot with its chip, names the LOGGED item (not the planned dish) in the tooltip, leaves other slots untouched, and shows the remaining-kcal line', async () => {
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });

        await _esperaTexto('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();

        // Antes de cualquier registro: nada atenuado, ninguna línea "Te quedan".
        expect(screen.queryByText('Ya registraste tu desayuno')).not.toBeInTheDocument();
        expect(screen.queryByText(/Te quedan/)).not.toBeInTheDocument();

        // [P1-EATEN-SLOT-COPY · 2026-07-28] Nombre logueado DELIBERADAMENTE
        // distinto del plato del plan ("Mangú con los tres golpes") — mismo
        // caso real que reportó el owner (plan: "Tostadas Francesas...",
        // diario: "Mangú con Los Tres Golpes"). Si el tooltip regresa a leer
        // `meal.name` del plan en vez del diario, las aserciones de abajo
        // sobre `cardTitle` se ponen rojas.
        _dispatchTodaysConsumed([{ meal_type: 'desayuno', meal_name: 'Huevos revueltos con salami', calories: 500 }]);

        // Match inequívoco (un solo slot 'Desayuno' hoy) → esa card se atenúa.
        const desayunoName = await _esperaTexto('Mangú con los tres golpes');
        const desayunoCard = desayunoName.closest('.meal-card');
        expect(desayunoCard).toHaveStyle({ opacity: '0.55' });
        // Dim, NUNCA hide — el nombre sigue en el DOM, solo tachado.
        expect(desayunoName).toHaveStyle({ textDecoration: 'line-through' });

        // El chip SOLO nombra el slot — nunca "esto", nunca un plato.
        expect(screen.getByText('Ya registraste tu desayuno')).toBeInTheDocument();
        expect(within(desayunoCard).queryByText(/esto/i)).not.toBeInTheDocument();

        // El detalle (nombre REAL logueado + kcal + slot) vive en el
        // `title` — nunca el nombre del plato del plan.
        const cardTitle = desayunoCard.getAttribute('title');
        expect(cardTitle).toContain('Huevos revueltos con salami');
        expect(cardTitle).not.toContain('Mangú con los tres golpes');
        expect(cardTitle).toContain('~500 kcal');
        expect(cardTitle).toContain('desayuno');

        // [P1-EATEN-SLOT-COPY · 2026-07-28] kcal removido del chip VISIBLE —
        // vivía al lado del propio "500 kcal" de la card (dos números
        // discutiendo en el mismo lugar). El agregado real sigue viviendo en
        // la línea "Te quedan" (chequeada abajo).
        expect(screen.queryByText(/~500 kcal/)).not.toBeInTheDocument();

        // Los otros 3 slots de hoy NO se tocan.
        for (const otherName of ['Arroz con pollo guisado', 'Yogur con fruta', 'Pescado a la plancha']) {
            const card = screen.getByText(otherName).closest('.meal-card');
            expect(card).not.toHaveAttribute('title');
        }

        // [P1-REMAINING-LINE-HONEST · 2026-07-28] target 2000, consumido 500
        // (solo lo registrado, SIN depender de la atribución) → presupuesto
        // restante 1500; comidas restantes = 4 - 1 (desayuno, match
        // inequívoco) = Almuerzo(700) + Merienda(250) + Cena(550) = 1500
        // planificadas. Presupuesto == planificado (caso límite "cabe") →
        // frase sin alarma, las 2 cifras EXPLÍCITAS (no una sola fundida).
        const expectedKcal = _fmtKcal(1500);
        expect(screen.getByText(
            new RegExp(`Te quedan.*${expectedKcal.replace('.', '\\.')} kcal estimadas de presupuesto para.*3 comidas del plan.*${expectedKcal.replace('.', '\\.')} kcal`)
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
        await _esperaTexto('Mangú de hoy');
        await _waitForTrackingProgressSettled();

        _dispatchTodaysConsumed([{ meal_type: 'desayuno', calories: 500 }]);
        const hoyCard = await _esperaTexto('Mangú de hoy');
        // El fallback sin `meal_name` ("algo") sigue nombrando el slot y NO
        // dice "esto" — ver todayRemaining.test.js para el caso con nombre.
        expect(hoyCard.closest('.meal-card')).toHaveAttribute('title', expect.stringContaining('desayuno'));

        // Cambiar al tab "Mañana" — el mismo evento sigue en memoria, pero
        // `isTodayTabActive` debe ser false ahí: cero atenuación.
        fireEvent.click(screen.getByText('Mañana'));
        const mananaName = await _esperaTexto('Mangú de mañana');
        const mananaCard = mananaName.closest('.meal-card');
        // Card no-hoy: SIN title en absoluto (solo los slots `isEatenToday`
        // reciben `eatenClaim`; los demás pasan `undefined` explícito).
        expect(mananaCard).not.toHaveAttribute('title');
        expect(screen.queryByText(/^Ya registraste tu/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Te quedan/)).not.toBeInTheDocument();
    });

    it('AMBIGUITY RULE: two meriendas today + one diary row → attributes nothing (neither dims)', async () => {
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FIVE_MEALS_TWO_MERIENDAS }]) },
        });

        await _esperaTexto('Yogur');
        await _waitForTrackingProgressSettled();

        // Una sola fila 'merienda' — no hay forma de saber si fue la AM o la PM.
        _dispatchTodaysConsumed([{ meal_type: 'merienda', calories: 150 }]);

        // Esperar a que el efecto del listener re-renderice (buscamos algo
        // que solo aparece tras el update: la línea de restantes).
        await _esperaTexto(/Te quedan/);

        for (const name of ['Yogur', 'Batido de proteína']) {
            const card = screen.getByText(name).closest('.meal-card');
            expect(card).not.toHaveAttribute('title');
        }
        expect(screen.queryByText(/^Ya registraste tu/)).not.toBeInTheDocument();

        // Ninguna de las 5 comidas se remueve — "5 comidas" restantes.
        expect(screen.getByText(/5 comidas del plan/)).toBeInTheDocument();
    });

    it('does not disturb the meal index the swap handler receives when a card is locked (P2-SWAP-INDEX-COUPLING)', async () => {
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });

        await _esperaTexto('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();
        // Bloquea el primer slot (Desayuno, index 0).
        _dispatchTodaysConsumed([{ meal_type: 'desayuno', calories: 500 }]);
        await _esperaTexto('Ya registraste tu desayuno');

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

        // Orden fijo dentro de "BUTTONS GROUP": [Ver Receta, Cambiar Plato, Me gusta].
        const desayunoCard = screen.getByText('Mangú con los tres golpes').closest('.meal-card');
        const almuerzoCard = screen.getByText('Arroz con pollo guisado').closest('.meal-card');
        const [, lockedSwapBtn] = within(desayunoCard).getAllByRole('button');
        const [, unlockedSwapBtn] = within(almuerzoCard).getAllByRole('button');

        // El swap del card BLOQUEADO (index 0) es inert de verdad — P1-EATEN-SLOT-POLISH.
        // El modal no debe abrir en absoluto.
        fireEvent.click(lockedSwapBtn);
        expect(screen.queryByText('Plato a cambiar')).not.toBeInTheDocument();

        // El swap del card NO bloqueado (Almuerzo, index 1) sigue intacto — el
        // `index` real que llega al handler no se corrió por la presencia de
        // un slot bloqueado antes en el mismo `.map()` (P2-SWAP-INDEX-COUPLING).
        fireEvent.click(unlockedSwapBtn);
        await waitFor(() => {
            expect(_swapModalContextLabel().startsWith('Arroz con pollo guisado')).toBe(true);
        });
    });

    // [P1-EATEN-SLOT-POLISH · 2026-07-28] La dimmed card pre-fix seguía
    // siendo 100% interactiva — Cambiar Plato costaba un crédito real y Me
    // gusta grababa una preferencia sobre un plato que el usuario NO comió
    // (el owner reportó "me deja interactuar y no debería"). Ahora las
    // acciones mutantes se bloquean de verdad (atributo `disabled` nativo),
    // Ver Receta se mantiene activo porque abre la LECTURA de la receta, que
    // nunca se gatea (ojo: desde P1-EATEN-RECIPE-LOCK, Recetas sí bloquea su
    // PDF y sus checkboxes — ya no es una página "de solo lectura"), y cada
    // control bloqueado explica por qué + cómo
    // deshacerlo (borrar la fila en "Progreso en Tiempo Real").
    it('an eaten slot genuinely disables Cambiar Plato and Me gusta — no click, no keyboard activation reaches their handlers', async () => {
        const toggleMealLike = vi.fn();
        render(<Dashboard />, {
            customContext: { ..._baseContext, toggleMealLike, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });

        await _esperaTexto('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();
        _dispatchTodaysConsumed([{ meal_type: 'desayuno', calories: 500 }]);
        await _esperaTexto('Ya registraste tu desayuno');

        const eatenCard = screen.getByText('Mangú con los tres golpes').closest('.meal-card');
        const [, swapBtn, likeBtn] = within(eatenCard).getAllByRole('button');

        // [P1-SWAP-LOCK-EXPLAINS · 2026-08-11] LOS DOS BOTONES YA NO SE BLOQUEAN IGUAL,
        // y la diferencia es deliberada.
        //
        // "Me gusta" sigue con el atributo `disabled` real: no hay nada que preguntar,
        // el chip de arriba ya dice que el slot está registrado.
        //
        // "Cambiar Plato" pasó a `aria-disabled`. Un botón `disabled` NO EMITE CLICK, y
        // el dueño pidió que al pulsarlo se explique por qué está bloqueado. En un
        // teléfono el `title` no existe (no hay puntero que se pose) y el `aria-label`
        // solo lo oye un lector de pantalla: sin click, el bloqueo era mudo. Ahora se
        // anuncia igual como no disponible, pero se puede preguntar.
        //
        // Lo que NO cambia —y es lo que este caso protege— es que la acción siga sin
        // ocurrir: ni modal, ni crédito. Eso se afirma abajo, contra el resultado.
        expect(likeBtn).toBeDisabled();
        expect(swapBtn).not.toBeDisabled();
        expect(swapBtn).toHaveAttribute('aria-disabled', 'true');

        // Cada uno explica el POR QUÉ y el CÓMO deshacerlo (accesible vía
        // title/aria-label, es-DO, corto).
        expect(swapBtn).toHaveAttribute('title', expect.stringContaining('Progreso en Tiempo Real'));
        expect(likeBtn).toHaveAttribute('title', expect.stringContaining('Progreso en Tiempo Real'));
        expect(swapBtn.getAttribute('aria-label') || swapBtn.getAttribute('title')).toMatch(/Progreso en Tiempo Real/);
        expect(likeBtn.getAttribute('aria-label') || likeBtn.getAttribute('title')).toMatch(/Progreso en Tiempo Real/);

        // [P1-EATEN-SLOT-COPY · 2026-07-28] El "por qué" NUNCA puede ser
        // "comiste esto" (el plato mostrado, "Mangú con los tres golpes",
        // es el del PLAN — el matcher es por slot, no por nombre) — debe
        // nombrar el SLOT en su lugar.
        expect(swapBtn.getAttribute('title')).not.toMatch(/esto/i);
        expect(likeBtn.getAttribute('title')).not.toMatch(/esto/i);
        expect(swapBtn.getAttribute('title')).toContain('desayuno');
        expect(likeBtn.getAttribute('title')).toContain('desayuno');
        // Los 2 botones y el chip comparten EXACTAMENTE la misma frase
        // (SSOT — `eatenClaim` calculado una vez por comida en Dashboard.jsx).
        expect(swapBtn.getAttribute('title')).toBe(likeBtn.getAttribute('title'));
        expect(swapBtn.getAttribute('title')).toBe(eatenCard.getAttribute('title'));

        // Ni click...
        fireEvent.click(swapBtn);
        fireEvent.click(likeBtn);
        expect(toggleMealLike).not.toHaveBeenCalled();
        expect(screen.queryByText('Plato a cambiar')).not.toBeInTheDocument();

        // ...ni teclado. "Me gusta", por ser `disabled` de verdad, ni siquiera puede
        // recibir foco (por eso Enter/Espacio no llegan a activarlo).
        likeBtn.focus();
        expect(likeBtn).not.toHaveFocus();

        // [P1-SWAP-LOCK-EXPLAINS] "Cambiar Plato" SÍ recibe foco, y eso es el arreglo,
        // no un descuido: un control que no se puede alcanzar tampoco se puede
        // preguntar, y quien navega con teclado se quedaría sin saber por qué está
        // bloqueado. Lo que importa es que alcanzarlo NO dispare la acción.
        swapBtn.focus();
        expect(swapBtn).toHaveFocus();
        // Defensa en profundidad: aunque algo despachara el evento igual
        // (p.ej. un dispatchEvent sintético que ignore `disabled`), el
        // handler interno también debe abstenerse.
        fireEvent.keyDown(swapBtn, { key: 'Enter', code: 'Enter' });
        fireEvent.keyDown(likeBtn, { key: 'Enter', code: 'Enter' });
        expect(toggleMealLike).not.toHaveBeenCalled();
        expect(screen.queryByText('Plato a cambiar')).not.toBeInTheDocument();
    });

    it('Ver Receta stays enabled on an eaten slot — read-only, answers "qué me tocaba comer"', async () => {
        const navigateMock = vi.fn();
        vi.mocked(router.useNavigate).mockReturnValue(navigateMock);
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });

        await _esperaTexto('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();
        _dispatchTodaysConsumed([{ meal_type: 'desayuno', calories: 500 }]);
        await _esperaTexto('Ya registraste tu desayuno');

        const eatenCard = screen.getByText('Mangú con los tres golpes').closest('.meal-card');
        const [recipeBtn] = within(eatenCard).getAllByRole('button');

        expect(recipeBtn).not.toBeDisabled();
        fireEvent.click(recipeBtn);
        expect(navigateMock).toHaveBeenCalledWith('/dashboard/recipes');
    });

    // [P1-EATEN-SLOT-POLISH · 2026-07-28] Pre-fix la línea era un componente
    // de info-alert genérico (fondo degradado azul, borde 1px, radius 12px,
    // ícono) — chocaba con el cuaderno de "Tu Menú" (owner: "choca con el
    // diseño del cuaderno"). Ahora debe leerse como algo ESCRITO en la
    // página: sin caja, alineada a la columna de texto de las comidas,
    // separada del primer plato con la MISMA línea rayada que usa el
    // cuaderno entre comidas (2px rgba(147, 197, 253, 0.3)), no con
    // whitespace de margen. Assertion NEGATIVA a propósito — si alguien
    // vuelve a ponerle una caja azul "para que resalte", este test debe
    // volverse rojo.
    it('the remaining-budget line reads as part of the notebook — no box, ruled-line separator, no icon', async () => {
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });

        await _esperaTexto('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();
        _dispatchTodaysConsumed([{ meal_type: 'desayuno', calories: 500 }]);

        const line = await _esperaTexto(/Te quedan/);

        // No fill, no border(-radius) — no es un chip/alert flotante.
        expect(line.style.background).toBe('');
        expect(line.style.backgroundColor).toBe('');
        expect(line.style.border).toBe('');
        expect(line.style.borderRadius).toBe('');
        // El ícono era "el accesorio a quitar" — la frase ya lo dice sola.
        expect(line.querySelector('svg')).toBeNull();

        // La separación del primer plato es la línea rayada del cuaderno
        // (misma regla que `.meal-card:not(:last-of-type)::after`), no
        // whitespace de margen.
        expect(line.style.borderBottom).toContain('rgba(147, 197, 253, 0.3)');

        // A prueba del trap P3-DASH-LAST-SEPARATOR-FIX: `.meal-card:not(:last-of-type)::after`
        // solo cuenta DIVs hermanos DENTRO del wrapper de comidas. Esta
        // línea no es descendiente de ese wrapper → nunca puede convertirse
        // en un phantom last-of-type sibling sin importar cómo cambie el map.
        const mealsWrapper = screen.getByText('Mangú con los tres golpes').closest('.meal-card').parentElement;
        expect(mealsWrapper.contains(line)).toBe(false);
    });

    it('a non-eaten slot on the same day stays fully interactive — the lock is per-slot, not per-day', async () => {
        const toggleMealLike = vi.fn();
        render(<Dashboard />, {
            customContext: { ..._baseContext, toggleMealLike, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }]) },
        });

        await _esperaTexto('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();
        _dispatchTodaysConsumed([{ meal_type: 'desayuno', calories: 500 }]);
        await _esperaTexto('Ya registraste tu desayuno');

        const almuerzoCard = screen.getByText('Arroz con pollo guisado').closest('.meal-card');
        const [recipeBtn, swapBtn, likeBtn] = within(almuerzoCard).getAllByRole('button');

        expect(recipeBtn).not.toBeDisabled();
        expect(swapBtn).not.toBeDisabled();
        expect(likeBtn).not.toBeDisabled();

        fireEvent.click(likeBtn);
        expect(toggleMealLike).toHaveBeenCalledWith('Arroz con pollo guisado', 'Almuerzo');
    });
});

// [P1-REMAINING-LINE-HONEST · 2026-07-28] La línea "Te quedan…" fundía DOS
// cantidades independientes en una sola frase — "~460 kcal estimadas EN 2
// comidas del plan" leía como si esas 2 comidas SUMARAN 460 kcal, cuando en
// realidad suman 1.284. El owner: "creo que el texto donde dice 460 kcal es
// incorrecto ya que faltan más no?". Estos tests pinean la ARITMÉTICA de las
// 3 cifras (presupuesto, planificado, exceso), no solo la presencia de un
// string.
describe('P1-REMAINING-LINE-HONEST — "Te quedan" reporta presupuesto Y planificado por separado', () => {
    beforeEach(() => {
        vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
        vi.mocked(useRegeneratePlan).mockReturnValue({ regeneratePlan: vi.fn() });
        vi.mocked(fetchWithAuth).mockResolvedValue(_emptyDiaryResponse());
        window.scrollTo = vi.fn();
    });

    it('EXACT PRODUCTION CASE: target 2050, logged 1590 (750+840), remaining meals 813+471 → reports 460 budget, 1.284 planned, ~824 over', async () => {
        const meals = [
            { meal: 'Desayuno', name: 'Tostadas Francesas', cals: 500, desc: 'x' },
            { meal: 'Almuerzo', name: 'Arroz con pollo', cals: 813, desc: 'x' },
            { meal: 'Merienda', name: 'Batido', cals: 471, desc: 'x' },
            { meal: 'Cena', name: 'Pescado', cals: 500, desc: 'x' },
        ];
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals }], 2050) },
        });

        await _esperaTexto('Tostadas Francesas');
        await _waitForTrackingProgressSettled();

        // Desayuno y Cena registrados (matches inequívocos) → 1.590 kcal
        // consumidas. Almuerzo (813) y Merienda (471) quedan sin registrar.
        _dispatchTodaysConsumed([
            { meal_type: 'desayuno', meal_name: 'Mangú con los tres golpes', calories: 750 },
            { meal_type: 'cena', meal_name: 'Tres Golpes Nocturno', calories: 840 },
        ]);

        const line = await _esperaTexto(/Te quedan/);
        // Presupuesto: 2050 - 1590 = 460.
        expect(line.textContent).toContain(`~${_fmtKcal(460)} kcal`);
        // Planificado: 813 + 471 = 1.284 (NO 460 — el bug original).
        expect(line.textContent).toContain(`~${_fmtKcal(1284)} kcal`);
        expect(line.textContent).not.toContain(`~${_fmtKcal(460)} kcal estimadas en 2 comidas`);
        // Exceso: 1.284 - 460 = 824.
        expect(line.textContent).toContain(`~${_fmtKcal(824)} kcal`);
        expect(line.textContent).toContain('2 comidas del plan');

        // El caso "excede el presupuesto" lleva algo MÁS de énfasis
        // tipográfico que la anotación base — pero sigue sin caja/fill/
        // borde/radius/ícono (mismo test negativo que el design test de
        // arriba, no repetido aquí por brevedad).
        expect(line.style.background).toBe('');
        expect(line.style.border).toBe('');
        expect(line.style.borderRadius).toBe('');
    });

    it('fitting case (planned clearly under budget) reads without alarm — no bold, no warning color', async () => {
        render(<Dashboard />, {
            // target 3000, muy por encima de lo que puede sumar el plan de 4 comidas.
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }], 3000) },
        });

        await _esperaTexto('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();
        // Desayuno (500) registrado → presupuesto restante 3000-500=2500;
        // planificado restante = Almuerzo(700)+Merienda(250)+Cena(550)=1500.
        _dispatchTodaysConsumed([{ meal_type: 'desayuno', calories: 500 }]);

        const line = await _esperaTexto(/Te quedan/);
        expect(line.textContent).toContain(`~${_fmtKcal(2500)} kcal`);
        expect(line.textContent).toContain(`~${_fmtKcal(1500)} kcal`);
        expect(line.textContent).not.toMatch(/por encima|superaste/);
        // Sin realce — la anotación por defecto (peso 500, color muted).
        expect(line).toHaveStyle({ fontWeight: '500' });
        expect(line.style.color).toBe('var(--text-muted)');
    });

    it('already-over case (consumed > target) reports the overshoot instead of clamping to "0"', async () => {
        render(<Dashboard />, {
            customContext: { ..._baseContext, planData: _plan([{ day: 1, day_name: 'Hoy', meals: _FOUR_MEALS_TODAY }], 2000) },
        });

        await _esperaTexto('Mangú con los tres golpes');
        await _waitForTrackingProgressSettled();
        // 2.200 registradas en desayuno solo (foto sobreestimada, plausible)
        // contra meta 2000 → presupuesto -200, NUNCA "0 kcal".
        _dispatchTodaysConsumed([{ meal_type: 'desayuno', calories: 2200 }]);

        const line = await _esperaTexto(/Te quedan|superaste/);
        expect(line.textContent).toMatch(/superaste/i);
        expect(line.textContent).toContain(`~${_fmtKcal(200)} kcal`);
        expect(line.textContent).not.toContain('~0 kcal');
        // Las 3 comidas restantes (Almuerzo+Merienda+Cena) siguen mencionadas.
        expect(line.textContent).toContain('3 comidas del plan');

        // Realce tipográfico: negrita + color de warning (sigue sin caja).
        expect(line).toHaveStyle({ fontWeight: '700' });
        expect(line.style.color).toBe('var(--warning-text)');
        expect(line.style.background).toBe('');
        expect(line.style.border).toBe('');
    });
});
