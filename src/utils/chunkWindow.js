// [P-RECIPES-CHUNK-WINDOW] Helpers chunk-aware para limitar selectores de
// día al chunk activo (3 ó 4 días según `split_with_absorb` del backend).
//
// Sincronizado con:
//   - backend/constants.py:961  (`split_with_absorb`)
//   - frontend/src/pages/Dashboard.jsx ~480 (`_parseStartLocal`)
//
// Cualquier cambio en `split_with_absorb` del backend debe reflejarse aquí
// o el frontend mostrará chunks distintos a los reales generados por el
// orchestrator.

/**
 * Parsea la fecha de inicio del plan (`grocery_start_date` o `created_at`)
 * a midnight LOCAL.
 *
 * Importante: el backend persiste fechas YYYY-MM-DD como date-only sin TZ
 * (ver `_ensure_grocery_start_date` en `db_plans.py`). JavaScript parsea
 * "YYYY-MM-DD" como UTC-midnight, lo que produce un shift de un día en
 * timezones detrás de UTC. Detectamos el formato puro YYYY-MM-DD y
 * construimos el Date con `(y, m-1, d)` para forzar local-midnight.
 */
export const parseStartLocal = (s) => {
    if (!s) {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        return t;
    }
    if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    const dt = new Date(s);
    dt.setHours(0, 0, 0, 0);
    return dt;
};

/**
 * Mirror de `split_with_absorb(total_days, base=3)` en backend/constants.py.
 *
 * Invariantes garantizados:
 *   - sum(result) === totalDays
 *   - todos los elementos >= base (o === totalDays si totalDays <= base+1)
 *
 * Ejemplos canónicos (mismos que el docstring del backend):
 *    7d → [3, 4]                       (caso especial)
 *    9d → [3, 3, 3]                    (n_full < umbral, sin cambio)
 *   14d → [3, 3, 4, 4]                 (rem!=0, lógica original)
 *   15d → [3, 4, 4, 4]                 (P1-A: prefiere chunks de 4)
 *   18d → [3, 4, 4, 4, 3]              (P1-A)
 *   21d → [3, 4, 4, 4, 6]              (P1-A: leftover absorbido)
 *   30d → [3, 4, 4, 4, 4, 4, 4, 3]     (P1-A)
 *
 * @param {number} totalDays — total de días del plan.
 * @param {number} [base=3] — tamaño base del chunk.
 * @returns {number[]} array con tamaños de cada chunk en orden.
 */
export const splitWithAbsorb = (totalDays, base = 3) => {
    if (totalDays === 7 && base === 3) return [3, 4];
    if (totalDays <= base + 1) return [totalDays];
    const nFull = Math.floor(totalDays / base);
    const rem = totalDays % base;
    const _LONG_THRESHOLD = 5;
    if (rem === 0 && nFull >= _LONG_THRESHOLD) {
        const target = base + 1; // 4
        const rest = totalDays - base;
        const nTarget = Math.floor(rest / target);
        const leftover = rest % target;
        if (leftover === 0) return [base, ...Array(nTarget).fill(target)];
        if (leftover >= base) return [base, ...Array(nTarget).fill(target), leftover];
        return [base, ...Array(nTarget - 1).fill(target), target + leftover];
    }
    if (rem === 0) return Array(nFull).fill(base);
    if (nFull === 1) return [totalDays];
    const nBase = nFull - rem;
    return [...Array(nBase).fill(base), ...Array(rem).fill(base + 1)];
};

/**
 * Encuentra el chunk que contiene `dayIndex` y devuelve `{start, size}`.
 *
 * @param {number} totalDays — total de días del plan.
 * @param {number} dayIndex — índice global del día (0-indexed).
 * @param {number} [base=3] — tamaño base del chunk.
 * @returns {{start: number, size: number}} índice de inicio del chunk y su tamaño.
 *   Si `dayIndex` está fuera de rango, devuelve el último chunk como fallback.
 */
export const findChunkContaining = (totalDays, dayIndex, base = 3) => {
    if (totalDays <= 0) return { start: 0, size: 0 };
    const chunks = splitWithAbsorb(totalDays, base);
    let start = 0;
    for (const size of chunks) {
        if (dayIndex < start + size) return { start, size };
        start += size;
    }
    // Defensive: dayIndex fuera de rango → último chunk.
    const last = chunks[chunks.length - 1] || totalDays;
    return { start: Math.max(0, totalDays - last), size: last };
};
