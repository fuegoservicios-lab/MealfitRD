/**
 * [P1-AGENT-WELCOME-TRACKING · 2026-08-14] El saludo del agente no recita un
 * plan que el usuario PAUSÓ.
 *
 * EL BUG, reportado con captura: con la generación de planes desactivada (modo
 * contador), el agente abría con «De cena para hoy tienes: **Pasta Integral
 * Salteada…** ¿Quieres que te pase las instrucciones paso a paso?» — la comida
 * del plan pausado, presentada como lo que gobierna el día.
 *
 * LA CADENA. `generateIntelligentWelcome` gatea en `planData && !isPlanExpired`,
 * y la pausa CONSERVA `plan_data` a propósito (es lo que permite «Reanudar» sin
 * regenerar — snapshot `_paused_prev_generation_status`, guard I8). Así que para
 * el saludo un plan pausado y uno activo eran indistinguibles. Es la clase de
 * bug que P0-CHAT-ALLERGY-SSOT dejó nombrada: *una defensa que vive en un CAMINO
 * y no en el DATO desaparece al abrir un camino nuevo* — el modo contador gateó
 * el dashboard y el chunk worker, y nadie auditó al agente.
 *
 * LA SALIDA NO ES INVENTAR COPY NUEVO: cada franja ya tiene variantes genéricas
 * («¿Ya sabes qué vas a cenar?») para cuando no hay comida del plan. En modo
 * contador se usan esas — coaching de contador, sin plan.
 *
 * P1-TRACKING-WINS es el contrato de fondo: la elección explícita de tracking
 * gana incluso con un plan pausado presente. El saludo es un consumidor más de
 * ese contrato, vía el MISMO SSOT (`isTrackingMode`, config/dashboardNav.js) —
 * no una reimplementación local del modo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateIntelligentWelcome } from '../pages/AgentPage';

// Un plan de HOY con cena reconocible: `grocery_start_date` de hoy ⇒ día 1 del
// ciclo, así el lookup del saludo encuentra la comida sin depender de la fecha
// del reloj de la máquina de CI.
const hoyISO = new Date().toISOString().slice(0, 10);
const PLAN = {
    grocery_start_date: hoyISO,
    calc_grocery_duration: 'weekly',
    days: [{
        day: 1,
        meals: [
            { meal: 'Desayuno', name: 'Mangú con Huevo' },
            { meal: 'Almuerzo', name: 'Arroz con Habichuelas' },
            { meal: 'Cena', name: 'Pasta Integral Salteada con Queso Fresco' },
            { meal: 'Merienda', name: 'Yogur con Avena' },
        ],
    }],
};

const PERFIL_TRACKING = { id: 'u1', plan_mode: 'tracking' };
const PERFIL_PLAN = { id: 'u1', plan_mode: 'plan' };
const FORM = { name: 'Angelo' };

/** Todos los nombres de plato del plan de prueba. */
const PLATOS = PLAN.days[0].meals.map((m) => m.name);

beforeEach(() => {
    // `isTrackingMode` mira también el espejo de localStorage: se limpia para que
    // cada caso dependa SOLO del perfil que se le pasa.
    window.localStorage.clear();
});

describe('[P1-AGENT-WELCOME-TRACKING] el saludo respeta la pausa', () => {
    // [P1-WELCOME-TEST-CLOCK · 2026-08-15] El reloj se FIJA, y no es cosmética.
    //
    // `generateIntelligentWelcome` lee `new Date().getHours()`, y `AgentPage.jsx:344`
    // ya excluye la franja `madrugada` (00:00–05:00) de nombrar la comida del plan,
    // ANTES de mirar el modo contador. Así que entre medianoche y las 5 de la
    // mañana el primer test de este fichero pasaba **por la razón equivocada**: el
    // saludo no nombraba platos porque era de madrugada, no porque el gate del modo
    // contador funcionara. El guard del P-fix quedaba inerte 5 horas al día sin que
    // nadie lo notara — *un veredicto que no puede fallar no informa*.
    //
    // Y a las 01:0x del 2026-08-15 se volvió visible por el otro lado: el tercer
    // test («en modo PLAN el saludo SÍ recita la comida») FALLÓ, porque de
    // madrugada tampoco la recita. Un test dependiente del reloj no es sólo
    // flaky: es verde o rojo por motivos que no son el que se quiso probar.
    //
    // 13:00 pone la franja en una donde el saludo SÍ nombraría la comida, que es
    // exactamente donde el gate del modo contador tiene algo que hacer. Se conserva
    // el DÍA de `hoyISO` para que el plan siga siendo «el de hoy».
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(`${hoyISO}T13:00:00`));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('en modo CONTADOR no nombra ningún plato del plan pausado', () => {
        const saludo = generateIntelligentWelcome(PERFIL_TRACKING, FORM, PLAN);
        for (const plato of PLATOS) {
            expect(saludo).not.toContain(plato);
        }
    });

    it('en modo contador el saludo sigue siendo útil (pregunta, no silencio)', () => {
        // La salida son las variantes genéricas que ya existían: el agente
        // pregunta qué vas a comer, como contador. Un saludo vacío o mudo sería
        // arreglar el bug rompiendo la bienvenida.
        const saludo = generateIntelligentWelcome(PERFIL_TRACKING, FORM, PLAN);
        expect(saludo.length).toBeGreaterThan(20);
        expect(saludo).toMatch(/\?/);
    });

    it('en modo PLAN el saludo SÍ puede recitar la comida que toca', () => {
        // El contrato de siempre no se toca: con el plan activo, nombrar el plato
        // del día es la función del saludo. Si esta aserción cae, el gate se
        // pasó de frenada y mató el caso bueno.
        const saludo = generateIntelligentWelcome(PERFIL_PLAN, FORM, PLAN);
        expect(PLATOS.some((p) => saludo.includes(p))).toBe(true);
    });

    it('el espejo de localStorage también manda cuando el perfil aún no hidrata', () => {
        // `isTrackingMode` lee perfil PRIMERO y espejo después — el mismo orden
        // que la nav del dashboard. En el arranque frío el perfil puede llegar
        // tarde; el espejo evita que el primer saludo recite el plan.
        window.localStorage.setItem('mealfit_plan_mode', 'tracking');
        const saludo = generateIntelligentWelcome({ id: 'u1' }, FORM, PLAN);
        for (const plato of PLATOS) {
            expect(saludo).not.toContain(plato);
        }
    });
});
