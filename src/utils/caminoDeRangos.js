// [P1-PLAN-LOTE-1157 · 2026-11-21] «Cómo llegar» al siguiente rango: cuántas semanas a cada ritmo que da estrellas
// (7 días en meta → 3 ★, 5 → 2 ★, 3 → 1 ★). Puro; «a tu ritmo» solo se enseña si no pasa de un año.
export const RITMOS = [{ dias: 7, estrellas: 3 }, { dias: 5, estrellas: 2 }, { dias: 3, estrellas: 1 }];
export const RITMO_PROPIO_MAX_SEMANAS = 52;

export function semanasPorRitmo(faltan) {
    if (!(faltan > 0)) return [];
    return RITMOS.map((r) => ({ ...r, semanas: Math.ceil(faltan / r.estrellas) }));
}
