// [P1-EAT-PLAN-MEAL-TRUTH · 2026-09-04] Ventanas horarias por slot y umbral de cobertura de la
// Nevera para «Me lo comí». El botón daba por cierto lo que le decías sin contrastarlo con lo que
// la app ya sabe: un almuerzo registrado a las 9:04 y un desayuno «cocinado» con la Nevera vacía
// entraban igual. Esto NO bloquea: decide cuándo hay que hacer UNA pregunta (¿cuándo? / ¿qué pasó?).
//
// Los slots son los identificadores del motor (español, SSOT del plan: `meal.meal`), no el texto
// traducido. Las horas son locales del dispositivo: la persona registra donde come.

export const MEAL_WINDOWS = Object.freeze({
    desayuno: { start: 5, end: 11 },
    almuerzo: { start: 11, end: 16 },
    merienda: { start: 14, end: 20 },
    cena: { start: 17, end: 24 },
});

/** Umbral por debajo del cual la Nevera «no explica» el plato (fracción de ingredientes presentes). */
export const PANTRY_COVERAGE_MIN = 0.5;

export function normalizeSlot(slot) {
    const s = String(slot || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    if (!s) return null;
    if (s.startsWith('desay') || s === 'breakfast') return 'desayuno';
    if (s.startsWith('almu') || s === 'lunch') return 'almuerzo';
    if (s.startsWith('meri') || s === 'snack') return 'merienda';
    if (s.startsWith('cen') || s === 'dinner') return 'cena';
    return null;
}

/**
 * ¿Es demasiado temprano para este slot? Devuelve `{ slot, start }` si la hora local está ANTES
 * de la ventana (almuerzo a las 9), o `null`. Registrar tarde (desayuno a las 15) no pregunta:
 * es «hoy» y es verosímil; registrar por adelantado es lo que rompe el diario y el aprendizaje.
 */
export function mealTimingIssue(slot, now = new Date()) {
    const key = normalizeSlot(slot);
    if (!key) return null;
    const w = MEAL_WINDOWS[key];
    const h = now.getHours() + now.getMinutes() / 60;
    return h < w.start ? { slot: key, start: w.start } : null;
}

/**
 * ¿La Nevera explica el plato? `preview` es la respuesta de `/consumed-from-plan/preview`
 * (`total`, `present`, `coverage`). Devuelve `{ present, total }` cuando la cobertura queda por
 * debajo del umbral y el plato tiene ingredientes; `null` si cubre o si no hay vista previa.
 */
export function pantryCoverageIssue(preview) {
    if (!preview || typeof preview !== 'object') return null;
    const total = Number(preview.total) || 0;
    if (total <= 0) return null;
    const present = Array.isArray(preview.present) ? preview.present.length : Number(preview.present) || 0;
    const coverage = typeof preview.coverage === 'number' ? preview.coverage : present / total;
    return coverage < PANTRY_COVERAGE_MIN ? { present, total } : null;
}
