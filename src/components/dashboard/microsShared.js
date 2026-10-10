// [P1-PLAN-LOTE-105 · 2026-09-18] Lo que comparten la tarjeta de hoy y el diario de días anteriores sobre los micros,
// fuera de `MicrosList.jsx` porque no son componentes (react-refresh solo recarga en caliente ficheros de componentes).
import { formatNumber, useT, useTn } from '../../i18n';

/** mg/mcg enteros; gramos y valores pequeños con un decimal (la tarjeta, el diario y lo que se comparte). */
export const formatoMicro = (v, unit) => {
    const n = cantidadMicro(v);
    if (n === null) return '—';
    if (n > 0 && n < 1) return formatNumber(Math.round(n * 1000) / 1000);
    if (unit === 'g' || n < 10) return formatNumber(Math.round(n * 10) / 10);
    return formatNumber(Math.round(n));
};

/** The 17 daily indicators in the same order as backend diary_nutrients.NUTRIENTS.
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
    { key: 'magnesium_mg', label: t('Magnesio'), unit: 'mg' },
    { key: 'zinc_mg', label: t('Zinc'), unit: 'mg' },
    { key: 'b12_mcg', label: t('Vitamina B12'), unit: 'mcg' },
    { key: 'folate_mcg', label: t('Folato (B9)'), unit: 'mcg DFE' },
    { key: 'vit_e_mg', label: t('Vitamina E'), unit: 'mg' },
    { key: 'vit_k_mcg', label: t('Vitamina K'), unit: 'mcg' },
    { key: 'selenium_mcg', label: t('Selenio'), unit: 'mcg' },
    { key: 'vit_b6_mg', label: t('Vitamina B6'), unit: 'mg' },
    { key: 'iodine_mcg', label: t('Yodo'), unit: 'mcg' },
];

export const cantidadMicro = (value) => {
    if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

export const coberturaMicro = (key, value, coverage) => {
    const c = coverage?.by_nutrient?.[key] || coverage?.[key];
    if (cantidadMicro(value) === null) return { known: 0, total: coverage?.total || 0, status: 'none' };
    return c || { known: coverage?.con_datos || 0, total: coverage?.total || 0, status: 'partial' };
};

/** Los totales de micros de un conjunto de comidas, con la misma aritmética que `diary_micros.resumen_micros`:
 *  el cliente la necesita para recalcular sin esperar al servidor cuando borra una comida (mismo criterio que
 *  las macros en `TrackingProgress`). Ausencia por nutriente = null, cero documentado = 0. */
export const resumirMicros = (meals) => {
    const lista = Array.isArray(meals) ? meals : [];
    const keys = filasMicros((s) => s).map((f) => f.key);
    const tot = Object.fromEntries(keys.map((k) => [k, null]));
    const evidence = Object.fromEntries(keys.map((k) => [k, { known: 0, total: lista.length, complete: 0, sources: [] }]));
    let conDatos = 0;
    lista.forEach((m) => {
        const vals = m?.micros?.values;
        if (!vals || typeof vals !== 'object') return;
        if (Object.values(vals).some((v) => cantidadMicro(v) !== null)) conDatos += 1;
        keys.forEach((k) => {
            const v = cantidadMicro(vals[k]);
            if (v === null) return;
            tot[k] = (tot[k] || 0) + v;
            evidence[k].known += 1;
            (m.micros.provenance?.[k] || []).forEach((source) => {
                if (!evidence[k].sources.some((s) => JSON.stringify(s) === JSON.stringify(source))) evidence[k].sources.push(source);
            });
            if (m.micros.coverage?.[k]?.status === 'complete') evidence[k].complete += 1;
        });
    });
    return {
        micros: Object.fromEntries(keys.map((k) => [k, tot[k] === null ? null : Math.round(tot[k] * 1000) / 1000])),
        coverage: { con_datos: conDatos, total: lista.length, by_nutrient: Object.fromEntries(keys.map((k) => {
            const c = evidence[k];
            return [k, { known: c.known, total: c.total, status: !c.known ? 'none' : c.complete === c.total ? 'complete' : 'partial', sources: c.sources }];
        })), catalog_version: 'diary-micros-2026-10-10-v1' },
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

