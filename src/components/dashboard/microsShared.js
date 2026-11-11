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
    if (cantidadMicro(value) === null) return { ...(c || {}), known: 0, total: coverage?.total || 0, status: 'none' };
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
    const origen = origenPorNutriente(lista);
    return {
        micros: Object.fromEntries(keys.map((k) => [k, tot[k] === null ? null : Math.round(tot[k] * 1000) / 1000])),
        coverage: { con_datos: conDatos, total: lista.length, by_nutrient: Object.fromEntries(keys.map((k) => {
            const c = evidence[k];
            return [k, { known: c.known, total: c.total, status: !c.known ? 'none' : c.complete === c.total ? 'complete' : 'partial', sources: c.sources, ...origen[k] }];
        })), catalog_version: 'diary-micros-2026-10-10-v1' },
    };
};

const TOP_FUENTES = 5;
const MAX_FALTANTES = 6;

/** [MICROS-ORIGEN · 2026-11-11] Espejo de `diary_micros.origen_por_nutriente`: por nutriente, qué alimentos
 *  aportaron más (`top`), el resto agrupado (`others`) y qué comidas/alimentos no tienen dato (`missing`). */
export const origenPorNutriente = (meals) => {
    const lista = Array.isArray(meals) ? meals : [];
    const keys = filasMicros((s) => s).map((f) => f.key);
    return Object.fromEntries(keys.map((k) => {
        const aportes = [];
        const faltan = [];
        lista.forEach((m, i) => {
            const comida = String(m?.meal_name || m?.meal_type || '').trim().slice(0, 80);
            const mi = m?.micros;
            const valorComida = mi ? cantidadMicro(mi?.values?.[k]) : null;
            if (valorComida === null) { faltan.push({ meal: comida, meal_type: m?.meal_type ?? null, foods: [], whole_meal: true }); return; }
            const items = Array.isArray(mi.items) ? mi.items : [];
            if (!items.length) { aportes.push({ food: comida, meal: comida, meal_type: m?.meal_type ?? null, value: valorComida, _i: i }); return; }
            const sinDato = [];
            items.forEach((it) => {
                if (!it || typeof it !== 'object') return;
                const v = cantidadMicro(it.values?.[k]);
                if (v === null) { if (it.label) sinDato.push(String(it.label)); } else if (v > 0) aportes.push({ food: String(it.label || comida), meal: comida, meal_type: m?.meal_type ?? null, value: v, _i: i });
            });
            if (sinDato.length) faltan.push({ meal: comida, meal_type: m?.meal_type ?? null, foods: sinDato.slice(0, MAX_FALTANTES), whole_meal: false });
        });
        aportes.sort((a, b) => b.value - a.value || a._i - b._i);
        const limpio = aportes.map(({ _i, ...a }) => a);
        const resto = limpio.slice(TOP_FUENTES);
        return [k, { top: limpio.slice(0, TOP_FUENTES), others: { count: resto.length, value: Math.round(resto.reduce((s, a) => s + a.value, 0) * 1000) / 1000 }, missing: faltan.slice(0, MAX_FALTANTES) }];
    }));
};

/** Nombre legible de la fuente de composición (el catálogo guarda códigos como «usda» o «manual»). */
export const nombreFuente = (source, t) => {
    const s = String(source?.source || '').toLowerCase();
    if (s === 'usda' || s.startsWith('usda')) return 'USDA FoodData Central';
    if (s === 'manual') return t('Catálogo revisado a mano');
    if (s === 'legacy' || !s) return t('Catálogo anterior');
    if (s === 'etiqueta del producto' || s === 'food_label') return t('Etiqueta del producto');
    return String(source.source);
};

/** Fuentes agrupadas por nombre con su cantidad: «USDA FoodData Central (6) · Etiqueta del producto (1)». */
export const fuentesAgrupadas = (sources, t) => {
    const grupos = new Map();
    (Array.isArray(sources) ? sources : []).forEach((src) => {
        const nombre = nombreFuente(src, t);
        const g = grupos.get(nombre) || { nombre, n: 0, url: null };
        g.n += 1;
        if (!g.url && src?.url) g.url = src.url;
        grupos.set(nombre, g);
    });
    return [...grupos.values()].sort((a, b) => b.n - a.n);
};

/** El subtítulo honesto de la cobertura. `null` = todavía cargando. */
export const useMicrosSubtitulo = () => {
    const t = useT();
    const tn = useTn();
    return (coverage) => {
        if (!coverage) return t('Cargando registros...');
        if (coverage.total === 0) return t('Registra una comida y aquí verás sus micros.');
        if (coverage.con_datos === 0) return t('Faltan datos de micronutrientes. Añade la etiqueta del alimento en el chat.');
        return tn(coverage.con_datos, 'Con datos de {n} de {total} comidas', 'Con datos de {n} de {total} comidas', { n: coverage.con_datos, total: coverage.total });
    };
};

