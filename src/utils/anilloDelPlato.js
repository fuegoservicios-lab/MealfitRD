// [P1-PLAN-LOTE-1154] Los tramos del anillo de «Total del plato» (puro; fuera del componente por `lint:count`).
export const R = 30;
export const LARGO = 2 * Math.PI * R;

/** Pura. Los tramos del anillo: kcal de cada macro (4/4/9) repartidas sobre la circunferencia. */
export function tramosDelAnillo({ protein = 0, carbs = 0, healthy_fats = 0 } = {}) {
    const partes = [['p', Math.max(0, protein) * 4], ['c', Math.max(0, carbs) * 4], ['g', Math.max(0, healthy_fats) * 9]];
    const suma = partes.reduce((s, [, v]) => s + v, 0);
    if (suma <= 0) return [];
    let desde = 0;
    return partes.filter(([, v]) => v > 0).map(([k, v]) => {
        const tramo = { k, desde, largo: (v / suma) * LARGO };
        desde += tramo.largo;
        return tramo;
    });
}
