/**
 * [BB-024 / P1-CALORIE-BAR-GOAL-SEMANTICS] Estado calórico diario respecto a la meta.
 *
 * Banda de éxito ('green') relativa al objetivo principal:
 * - Pérdida de grasa (lose_fat): [80 %, 105 %] (déficit moderado sano sin premiar < 80 %, techo estricto)
 * - Ganancia muscular (gain_muscle): [90 %, 115 %]
 * - Mantenimiento / rendimiento / sin objetivo conocido: [90 %, 110 %]
 * Debajo de `lo`: 'under' (ámbar). Encima de `hi`: 'over' (coral).
 */
export const STRONG_DEFICIT_THRESHOLD = 0.70;

const _isMuscle = (raw) =>
    raw.includes('muscle') || raw.includes('músculo') || raw.includes('musculo') || raw.includes('bulk');

const _isLoseFat = (raw) =>
    raw.includes('lose') || raw.includes('fat') || raw.includes('weight_loss')
    || raw.includes('perder') || raw.includes('pérdida') || raw.includes('perdida')
    || raw.includes('grasa') || raw.includes('deficit') || raw.includes('déficit');

export function resolveMainGoal({ mainGoal, referenceProfile, formData, planData } = {}) {
    return String(
        mainGoal
        || referenceProfile?.mainGoal
        || formData?.mainGoal
        || planData?.userParams?.mainGoal
        || planData?.mainGoal
        || planData?.goal
        || ''
    ).trim().toLowerCase();
}

export function getCalorieGoalBand(mainGoal = '') {
    const raw = String(mainGoal || '').trim().toLowerCase();
    if (_isMuscle(raw)) return { lo: 0.90, hi: 1.15 };
    if (_isLoseFat(raw)) return { lo: 0.80, hi: 1.05 };
    return { lo: 0.90, hi: 1.10 };
}

export function isStrongDeficit(calories, targetCalories, mainGoal = '') {
    const goal = Number(targetCalories) || 0;
    if (goal <= 0) return false;
    const raw = String(mainGoal || '').trim().toLowerCase();
    if (!_isLoseFat(raw)) return false;
    const ratio = (Number(calories) || 0) / goal;
    return ratio > 0 && ratio < STRONG_DEFICIT_THRESHOLD;
}

export function getCalorieGoalState(calories, targetCalories, mainGoal = '') {
    const goal = Number(targetCalories) || 0;
    if (goal <= 0) return 'under';
    const ratio = (Number(calories) || 0) / goal;
    const { lo, hi } = getCalorieGoalBand(mainGoal);
    if (ratio > hi) return 'over';
    if (ratio >= lo) return 'green';
    return 'under';
}
