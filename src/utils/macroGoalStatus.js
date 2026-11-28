/**
 * [P1-MACRO-BARS-SEMAFORO · 2026-11-26] Estado de una barra de macro: el COLOR dice cómo vas, no qué nutriente es.
 *
 *   progress → aún no llegas (gris neutro: no es un error ir a mitad del día)
 *   done     → meta cumplida: desde el 90 % de la meta y sin pasar el límite máximo (verde)
 *   over     → pasaste el límite máximo (AMDR) — o, si el perfil no tiene límite, más del 120 % de la meta (rojo)
 *
 * Antes cada macro tenía su color fijo (azul/verde/rosa): cuatro colores que no decían nada y un verde de
 * carbohidratos que se confundía con «cumplido». Las calorías usan la banda por objetivo de calorieGoalStatus.js
 * y se traducen a estos mismos tres estados en TrackingProgress.
 */
export const MACRO_DONE_FROM = 0.9;
export const MACRO_OVER_WITHOUT_LIMIT = 1.2;

export function getMacroGoalState(consumed, goal, reference) {
    const g = Number(goal) || 0;
    const c = Number(consumed) || 0;
    if (g <= 0 || c <= 0) return 'progress';
    const ref = Number(reference) || 0;
    if (ref > 0 ? c > ref : c / g > MACRO_OVER_WITHOUT_LIMIT) return 'over';
    if (c / g >= MACRO_DONE_FROM) return 'done';
    return 'progress';
}

/** La banda calórica por objetivo ('under' | 'green' | 'over') al vocabulario común de las barras. */
export function calorieStateToBarState(calorieState) {
    if (calorieState === 'green') return 'done';
    if (calorieState === 'over') return 'over';
    return 'progress';
}
