// [P1-PLAN-LOTE-1157 · 2026-11-21] «Cómo llegar» al siguiente rango: cuántas semanas a cada ritmo que da estrellas
// (7 días en meta → 3 ★, 5 → 2 ★, 3 → 1 ★). Puro; «a tu ritmo» solo se enseña si no pasa de un año.
// [P1-PLAN-LOTE-1158] Aquí vive también la escalera (umbrales del servidor `progreso_semanas.RANGOS`) y sus cuentas:
// exportarlas desde el componente de la hoja contaba en `lint:count` (react-refresh/only-export-components).

export const ESCALERA = [
    { clave: 'bronce', desde: 0 },
    { clave: 'plata', desde: 10 },
    { clave: 'oro', desde: 25 },
    { clave: 'platino', desde: 50 },
    { clave: 'diamante', desde: 100 },
];
const ESTRELLAS_POR_SEMANA_MAX = 3;

/** Dónde estás en la escalera: rango actual, siguiente y avance (0-1) dentro del tramo. Puro, para el test. */
export function posicionEnLaEscalera(estrellas) {
    const total = Math.max(0, Number(estrellas) || 0);
    let i = 0;
    for (let k = 0; k < ESCALERA.length; k++) if (total >= ESCALERA[k].desde) i = k;
    const actual = ESCALERA[i];
    const siguiente = ESCALERA[i + 1] || null;
    const faltan = siguiente ? siguiente.desde - total : 0;
    const avance = siguiente ? (total - actual.desde) / (siguiente.desde - actual.desde) : 1;
    return { indice: i, actual, siguiente, faltan, avance: Math.min(1, Math.max(0, avance)), total };
}

/** Semanas para juntar `faltan` estrellas: con semanas perfectas y a tu ritmo (estrellas por semana cerrada). */
export function semanasHasta(faltan, { estrellas = 0, semanasCerradas = 0 } = {}) {
    if (!(faltan > 0)) return { perfectas: 0, aTuRitmo: null };
    const perfectas = Math.ceil(faltan / ESTRELLAS_POR_SEMANA_MAX);
    const ritmo = semanasCerradas > 0 ? estrellas / semanasCerradas : 0;
    return { perfectas, aTuRitmo: ritmo > 0 ? Math.ceil(faltan / ritmo) : null };
}
export const RITMOS = [{ dias: 7, estrellas: 3 }, { dias: 5, estrellas: 2 }, { dias: 3, estrellas: 1 }];
export const RITMO_PROPIO_MAX_SEMANAS = 52;

export function semanasPorRitmo(faltan) {
    if (!(faltan > 0)) return [];
    return RITMOS.map((r) => ({ ...r, semanas: Math.ceil(faltan / r.estrellas) }));
}
