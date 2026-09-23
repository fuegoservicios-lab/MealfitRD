// [P1-PLAN-LOTE-105 · 2026-09-18] Lo que comparten la tarjeta de hoy y el diario de días anteriores sobre los micros,
// fuera de `MicrosList.jsx` porque no son componentes (react-refresh solo recarga en caliente ficheros de componentes).
import { formatNumber, useT, useTn } from '../../i18n';

/** mg/mcg enteros; gramos y valores pequeños con un decimal (la tarjeta, el diario y lo que se comparte). */
export const formatoMicro = (v, unit) => {
    const n = Number(v) || 0;
    if (unit === 'g' || n < 10) return formatNumber(Math.round(n * 10) / 10);
    return formatNumber(Math.round(n));
};

/** Los OCHO micros (fibra, sodio, potasio, calcio, hierro, vitamina C, A, D) en orden = backend diary_micros.MICROS_CONTADOR.
 *  Función, no constante: un t() en ámbito de módulo se congela en español. */
export const filasMicros = (t) => [
    { key: 'fiber_g', label: t('Fibra'), unit: 'g' },
    { key: 'sodium_mg', label: t('Sodio'), unit: 'mg' },
    { key: 'potassium_mg', label: t('Potasio'), unit: 'mg' },
    { key: 'calcium_mg', label: t('Calcio'), unit: 'mg' },
    { key: 'iron_mg', label: t('Hierro'), unit: 'mg' },
    { key: 'vit_c_mg', label: t('Vitamina C'), unit: 'mg' },
    { key: 'vit_a_mcg', label: t('Vitamina A'), unit: 'mcg' },
    { key: 'vit_d_mcg', label: t('Vitamina D'), unit: 'mcg' },
];

/** Los totales de micros de un conjunto de comidas, con la misma aritmética que `diary_micros.resumen_micros`:
 *  el cliente la necesita para recalcular sin esperar al servidor cuando borra una comida (mismo criterio que
 *  las macros en `TrackingProgress`). Devuelve `{ micros, coverage }`; `micros` es null si ninguna aporta. */
export const resumirMicros = (meals) => {
    const lista = Array.isArray(meals) ? meals : [];
    const tot = {};
    let conDatos = 0;
    lista.forEach((m) => {
        const vals = m?.micros?.values;
        if (!vals || typeof vals !== 'object') return;
        conDatos += 1;
        Object.entries(vals).forEach(([k, v]) => { tot[k] = (tot[k] || 0) + (Number(v) || 0); });
    });
    return {
        micros: conDatos > 0 ? tot : null,
        coverage: { con_datos: conDatos, total: lista.length },
    };
};

/** El subtítulo honesto de la cobertura. `null` = todavía cargando. */
export const useMicrosSubtitulo = () => {
    const t = useT();
    const tn = useTn();
    return (coverage) => {
        if (!coverage) return t('Cargando registros...');
        if (coverage.total === 0) return t('Registra una comida y aquí verás sus micros.');
        if (coverage.con_datos === 0) return t('Ninguna de estas comidas trae micros (foto o macros propias).');
        return tn(coverage.con_datos, 'Con datos de {n} de {total} comidas', 'Con datos de {n} de {total} comidas', { n: coverage.con_datos, total: coverage.total });
    };
};

