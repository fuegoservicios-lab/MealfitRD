// [P1-MANUAL-FOOD-LOG · 2026-08-11] El buscador del componedor: LISTA en el cliente,
// [P2-I18N-FOODSEARCH · 2026-08-22] `t` de módulo, invocada al construir el resultado.
import { t } from '../i18n';
// ARITMÉTICA en el servidor.
//
// La lista (filtro + ranking + alias) corre aquí sobre el catálogo que el cliente ya
// cachea 24 h (~27 KB gzip con macros y porciones). Un type-ahead server-side serían
// 45-60 peticiones al día por usuario para contestar lo que este archivo contesta
// gratis. La aritmética de verdad —unidad→gramos, expansión de constituyentes, macros
// finales— corre UNA vez, al enviar, en `food_search.py` del backend: el cliente manda
// referencias, nunca números.
//
// EL RANKING es la escalera de QStapleFoods, y la lección de P1-STAPLE-SEARCH-RANK es
// su regla de oro: exacto=0 / empieza-por=1 / palabra-interior=2 / contiene=3, y se
// ORDENA SIEMPRE ANTES DE CORTAR. El bug real de aquel P-fix no era el substring: era
// cortar a N resultados antes de ordenar, con lo que «pollo» podía quedarse fuera de
// su propia búsqueda si 20 «repollos» llegaban antes en orden alfabético.
//
// POR QUÉ el peligro de subcadena NO aplica aquí: las 16 lecciones del repo
// («sal»⊆«salami», «pollo»⊆«repollo») son sobre resolución SILENCIOSA de identidad.
// Esto es un SELECTOR VISIBLE: el usuario ve la lista y elige. La resolución de
// identidad real (nombre → fila de la Nevera) sigue server-side en
// `constants.pantry_names_match`, que no se toca.

const _sinAcentos = (s) => String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const _norm = (s) => _sinAcentos(s).trim().toLowerCase();

/** La escalera. Menor = mejor. Infinity = no matchea. */
export const rankOf = (haystackNorm, qNorm) => {
    if (!qNorm) return Infinity;
    if (haystackNorm === qNorm) return 0;
    if (haystackNorm.startsWith(qNorm)) return 1;
    if (haystackNorm.includes(` ${qNorm}`)) return 2;
    if (haystackNorm.includes(qNorm)) return 3;
    return Infinity;
};

/**
 * Búsqueda unificada sobre alimentos (catálogo) y platos criollos curados.
 *
 * @param {string} query
 * @param {Array}  foods  filas de /api/catalog (con `aliases` y `portions`)
 * @param {Array}  dishes filas de /api/catalog/dishes
 * @param {number} max
 * @returns lista mixta ordenada: {kind:'dish'|'food', ref, label, sub, item, rank}
 */
export function searchFoods(query, foods, dishes, max = 12) {
    const q = _norm(query);
    if (q.length < 2) return [];

    const resultados = [];

    for (const d of dishes || []) {
        const r = rankOf(_norm(d.label), q);
        if (r < Infinity) {
            resultados.push({
                kind: 'dish',
                ref: `dish:${d.slug}`,
                label: d.label,
                // [P2-I18N-FOODSEARCH · 2026-08-22] El subtítulo lo LEE el usuario al
                // buscar qué comió. El `label` del plato NO se traduce: es el identificador
                // con el que el motor resuelve.
                sub: t('Plato criollo · ración {g} g', { g: Math.round(d.finished_g) }),
                item: d,
                // Un plato completo responde mejor a «qué me comí» que un ingrediente
                // crudo del mismo rango: a rango igual, el plato va primero.
                rank: r - 0.1,
            });
        }
    }

    for (const f of foods || []) {
        let r = rankOf(_norm(f.name), q);
        // Los 825 alias curados del catálogo. Solo el buscador de la Nevera los
        // miraba; aquí valen lo mismo: «guineo» tiene que encontrar el banano.
        if (r === Infinity && Array.isArray(f.aliases)) {
            for (const a of f.aliases) {
                const ra = rankOf(_norm(a), q);
                if (ra < r) r = ra;
            }
            if (r < Infinity) r += 0.5; // el nombre propio gana al alias en empate
        }
        if (r < Infinity) {
            const porcionDefault = (f.portions || []).find((p) => p.default) || null;
            resultados.push({
                kind: 'food',
                ref: `food:${f.id}`,
                label: f.name,
                sub: porcionDefault && porcionDefault.unit !== 'g'
                    ? `Alimento · ${porcionDefault.label} ${Math.round(porcionDefault.grams_per_qty)} g`
                    : 'Alimento · por gramos',
                item: f,
                rank: r,
            });
        }
    }

    // ORDENAR ANTES DE CORTAR — la regla de oro de P1-STAPLE-SEARCH-RANK.
    resultados.sort((a, b) => a.rank - b.rank || _norm(a.label).localeCompare(_norm(b.label)));
    return resultados.slice(0, max);
}

/** Macros de una línea para la VISTA PREVIA. El servidor recalcula al enviar; esto
 *  existe solo para que el usuario vea los mismos números antes de tocar Registrar. */
export function previewLine(entry, qty, unit) {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return { grams: 0, kcal: 0, protein: 0, carbs: 0, fats: 0 };

    if (entry.kind === 'dish') {
        const d = entry.item;
        const grams = unit === 'g' ? n : n * (d.finished_g || 100);
        const f = grams / 100;
        const per = d.per_100g || {};
        return {
            grams,
            kcal: (per.kcal || 0) * f,
            protein: (per.protein || 0) * f,
            carbs: (per.carbs || 0) * f,
            fats: (per.fats || 0) * f,
        };
    }

    const food = entry.item;
    const p = (food.portions || []).find((x) => x.unit === unit);
    const grams = n * (p ? p.grams_per_qty : 1);
    const f = grams / 100;
    return {
        grams,
        kcal: (food.kcal_per_100g || 0) * f,
        protein: (food.protein_g_per_100g || 0) * f,
        carbs: (food.carbs_g_per_100g || 0) * f,
        fats: (food.fats_g_per_100g || 0) * f,
    };
}

/** Unidades ofrecibles para una entrada, derivadas de los datos — nunca inventadas. */
export function unitsFor(entry) {
    if (entry.kind === 'dish') {
        return [
            { unit: 'racion', label: t('ración') },
            { unit: 'g', label: 'g' },
        ];
    }
    return (entry.item.portions || [{ unit: 'g', grams_per_qty: 1, label: 'g' }])
        .map((p) => ({ unit: p.unit, label: p.label }));
}

/** La unidad con la que una entrada nace en el plato. */
export function defaultUnitFor(entry) {
    if (entry.kind === 'dish') return 'racion';
    const d = (entry.item.portions || []).find((p) => p.default);
    return d ? d.unit : 'g';
}

export function defaultQtyFor(entry, unit) {
    return unit === 'g' ? 100 : 1;
}
