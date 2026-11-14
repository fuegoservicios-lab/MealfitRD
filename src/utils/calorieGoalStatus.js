/**
 * [BB-024 / P1-CALORIE-BAR-GOAL-SEMANTICS] Estado calórico diario respecto a la meta.
 *
 * Banda de éxito ('green'): [90 %, 110 %] para déficit o mantenimiento, y
 * [90 %, 115 %] cuando el objetivo principal es ganancia muscular.
 * Debajo del 90 %: 'under' (en curso, ámbar).
 * Por encima del techo: 'over' (exceso, naranja cálido).
 */
export function resolveMainGoal({ mainGoal, referenceProfile, formData, planData } = {}) {
    return String(
        mainGoal
        || referenceProfile?.mainGoal
        || formData?.mainGoal
        || planData?.userParams?.mainGoal
        || planData?.mainGoal
        || planData?.goal
        || 'lose_fat'
    ).toLowerCase();
}

export function getCalorieGoalState(calories, targetCalories, mainGoal = 'lose_fat') {
    const goal = Number(targetCalories) || 0;
    if (goal <= 0) return 'under';
    const ratio = (Number(calories) || 0) / goal;
    const raw = String(mainGoal || 'lose_fat').toLowerCase();
    const isMuscle = raw.includes('muscle') || raw.includes('músculo') || raw.includes('musculo');
    const upper = isMuscle ? 1.15 : 1.10;
    if (ratio > upper) return 'over';
    if (ratio >= 0.90) return 'green';
    return 'under';
}
