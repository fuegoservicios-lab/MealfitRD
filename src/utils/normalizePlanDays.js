// [P1-2 · normalizePlanDays · 2026-07-09] SSOT del coalescing de los 3 shapes
// historicos de plan_data ({days}|{meals}|{perfectDay}) + adaptadores para los
// alias de calorias (cals/kcal/calories) y macros (p/c/g vs protein/carbs/fats).
//
// Motivacion: el coalescing estaba copiado verbatim en 10+ call sites
// (AssessmentContext.jsx:2299, shoppingHelpers, Recipes.jsx, useRegeneratePlan,
// History panels...). Un branch olvidado renderiza un MENU EN BLANCO sin error
// (History.jsx ya cargaba un [P4-HIST-ARRAY-GUARD] ad-hoc para esto). Centralizar
// aqui convierte esa clase de corrupcion silenciosa en un solo punto testeado.
//
// Decision de comportamiento: `days` cuenta como "presente" solo si es un array
// NO vacio (matchea los guards `_hasDays`/`_hasRecipes` en AssessmentContext.jsx:
// 1305/1350). Un `days: []` cae al fallback de meals/perfectDay — mas defensivo
// que el `days || [...]` crudo de line 2299 (que devolveria [] y pintaria vacio).

/**
 * @param {import('../types/plan').PlanData | null | undefined} planData
 * @returns {import('../types/plan').Day[]}
 */
export function normalizePlanDays(planData) {
    if (!planData || typeof planData !== 'object') return [];
    if (Array.isArray(planData.days) && planData.days.length > 0) {
        return planData.days;
    }
    const meals = Array.isArray(planData.meals)
        ? planData.meals
        : Array.isArray(planData.perfectDay)
            ? planData.perfectDay
            : [];
    return [{ day: 1, meals }];
}

/**
 * Meals del primer dia (usado por las cards/paneles del Historial que solo
 * muestran el dia 1). DRY sobre normalizePlanDays.
 * @param {import('../types/plan').PlanData | null | undefined} planData
 * @returns {import('../types/plan').Meal[]}
 */
export function firstDayMeals(planData) {
    const days = normalizePlanDays(planData);
    const first = days[0];
    return first && Array.isArray(first.meals) ? first.meals : [];
}

/**
 * Calorias canonicas de una comida absorbiendo los alias del generador.
 * Precedencia: calories > kcal > cals. Coerce strings; respeta 0 explicito.
 * @param {import('../types/plan').Meal | null | undefined} meal
 * @returns {number}
 */
export function mealCalories(meal) {
    if (!meal || typeof meal !== 'object') return 0;
    for (const key of ['calories', 'kcal', 'cals']) {
        const v = meal[key];
        if (v !== undefined && v !== null) {
            const n = Number(v);
            if (Number.isFinite(n)) return n;
        }
    }
    return 0;
}

/**
 * Macros canonicas {protein,carbs,fats} absorbiendo los alias abreviados p/c/g.
 * Precedencia por macro: nombre completo > abreviado. Faltantes → 0.
 * @param {import('../types/plan').Meal | null | undefined} meal
 * @returns {{protein: number, carbs: number, fats: number}}
 */
export function mealMacros(meal) {
    const pick = (full, abbr) => {
        for (const key of [full, abbr]) {
            const v = meal?.[key];
            if (v !== undefined && v !== null) {
                const n = Number(v);
                if (Number.isFinite(n)) return n;
            }
        }
        return 0;
    };
    if (!meal || typeof meal !== 'object') return { protein: 0, carbs: 0, fats: 0 };
    return {
        protein: pick('protein', 'p'),
        carbs: pick('carbs', 'c'),
        fats: pick('fats', 'g'),
    };
}
