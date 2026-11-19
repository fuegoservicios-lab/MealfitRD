// [P1-UNIDADES-FLEXIBLES · 2026-11-18] Selector de unidades naturales en la ficha de comida.
//
// El motor interno sigue calculando en gramos (SSOT exacto para macros y Nevera), pero el
// usuario puede editar en la unidad que usa en su cocina: unidades/ruedas/rebanadas, cdta,
// cda, taza, ml, oz, porción (×) o g. Si el renglón ya menciona una unidad natural junto a
// los gramos (ej. «Huevos enteros (≈100 g; 2 unidades)»), arranca directamente en esa unidad.

const GRAMOS_MIN = 5;
const GRAMOS_MAX = 1500;
const OZ_EN_GRAMOS = 28.3495;

const _norm = (s) => String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const _RE_UNIDAD_EN_PAREN = /\((?:[^)]*?)[;,]\s*(\d+(?:[.,]\d+)?)\s*(unidades?|uds?\.?|piezas?|huevos?|ruedas?|rodajas?|rebanadas?|lonjas?|tazas?|cucharadas?|cdas?\.?|cucharaditas?|cdtas?\.?|vasos?|porciones?)\b[^)]*\)/i;

const _RE_GRASA = /\b(aceite|manteca|mantequilla|ghee|margarina|mayonesa|aderezo|vinagreta|crema de mani|mantequilla de mani|tahini)\b/i;
const _RE_LIQUIDO = /\b(leche|jugo|zumo|batido|smoothie|yogur|yogurt|kefir|caldo|sopa|agua|cafe|te|refresco|bebida|avena liquida)\b/i;
const _RE_HUEVO = /\b(huevos?|claras?)\b/i;
const _RE_SALAMI = /\b(salami|salchicha|longaniza|jamon|queso|tocino|bacon|pepperoni)\b/i;
const _RE_PAN = /\b(pan|tostada|galleta|tortilla|arepa|casabe|empanada|pancake|waffle|panecillo)\b/i;
const _RE_FRUTA_PIEZA = /\b(guineo|banana|platano|manzana|naranja|pera|mango|aguacate|mandarina|kiwi|durazno|melocoton)\b/i;
const _RE_BASE_TAZA = /\b(mangu|arroz|habichuela|frijol|lenteja|garbanzo|avena|pasta|espagueti|quinoa|quinua|cuscus|yuca|papa|batata|ensalada|vegetales|verduras|brocoli|pollo|pechuga|carne|cerdo|res|atun|pescado|granola|cereal)\b/i;
const _RE_CARNE_TAZA = /\b(pollo|pechuga|carne|cerdo|res|atun|pescado|pavo|ensalada|brocoli|espinaca)\b/i;

function _etiquetaCortaUnidad(raw, t) {
    const u = _norm(raw).replace(/\.$/, '');
    if (u.startsWith('unidad') || u === 'ud' || u === 'uds' || u.startsWith('pieza') || u.startsWith('huevo')) return t('uds');
    if (u.startsWith('rueda') || u.startsWith('rodaja')) return t('ruedas');
    if (u.startsWith('rebanada') || u.startsWith('lonja')) return t('reb.');
    if (u.startsWith('cucharadita') || u === 'cdta' || u === 'cdtas') return t('cdta');
    if (u.startsWith('cucharada') || u === 'cda' || u === 'cdas') return t('cda');
    if (u.startsWith('taza')) return t('taza');
    if (u.startsWith('vaso')) return t('vaso');
    if (u.startsWith('porcion')) return t('porción');
    return raw;
}

/**
 * Extrae una unidad natural secundaria del paréntesis (ej. «(≈100 g; 2 unidades)» → { count: 2, raw: 'unidades' }).
 */
export function detectarUnidadSecundaria(texto) {
    const m = _RE_UNIDAD_EN_PAREN.exec(String(texto || ''));
    if (!m) return null;
    const count = Number(String(m[1]).replace(',', '.'));
    if (!Number.isFinite(count) || count <= 0) return null;
    return { count, raw: m[2] };
}

/**
 * Redondea un valor en la unidad elegida de forma limpia para mostrar en UI.
 */
export function redondearEnUnidad(valor, opcion) {
    if (!Number.isFinite(valor)) return 0;
    if (opcion.id === 'g' || opcion.id === 'ml') return Math.round(valor);
    if (opcion.paso === 0.25) return Math.round(valor * 4) / 4;
    if (opcion.paso === 0.5) return Math.round(valor * 2) / 2;
    if (opcion.paso >= 1) {
        const r4 = Math.round(valor * 4) / 4;
        return Math.abs(r4 - Math.round(r4)) < 0.01 ? Math.round(r4) : r4;
    }
    return Math.round(valor * 10) / 10;
}

/**
 * Convierte gramos actuales al valor numérico en la unidad dada.
 */
export function gramosAUnidad(gramos, opcion) {
    if (!Number.isFinite(gramos) || !opcion || !opcion.gramosPorUnidad) return 0;
    return redondearEnUnidad(gramos / opcion.gramosPorUnidad, opcion);
}

/**
 * Convierte un valor escrito/incrementado en la unidad dada a gramos enteros dentro de [5, 1500].
 */
export function unidadAGramos(valor, opcion) {
    if (!Number.isFinite(valor) || !opcion || !opcion.gramosPorUnidad) return null;
    const g = Math.round(valor * opcion.gramosPorUnidad);
    if (!Number.isFinite(g) || g < GRAMOS_MIN) return null;
    return Math.min(GRAMOS_MAX, g);
}

/**
 * Devuelve las unidades con sentido para este ingrediente y cuál debe ser la predeterminada.
 * - Si el texto ya declara una unidad secundaria junto a los gramos («(≈100 g; 2 unidades)»),
 *   arranca en esa unidad natural.
 * - Si el texto solo trae gramos, arranca en `g` (preserva comportamiento base y tests existentes)
 *   y ofrece las 2-4 unidades más útiles para ese alimento a un toque.
 */
export function unidadesParaIngrediente(texto, gramosActuales, gramosBase, t = (s) => s) {
    const base = Number.isFinite(gramosBase) && gramosBase > 0 ? gramosBase : gramosActuales;
    const plano = _norm(texto);
    const opciones = [];
    const seen = new Set();

    const add = (op) => {
        if (!op || seen.has(op.id)) return;
        seen.add(op.id);
        opciones.push(op);
    };

    const sec = detectarUnidadSecundaria(texto);
    let predeterminada = 'g';

    if (sec && Number.isFinite(gramosActuales) && gramosActuales > 0) {
        const gPorUd = gramosActuales / sec.count;
        if (gPorUd >= 1 && gPorUd <= 1000) {
            const label = _etiquetaCortaUnidad(sec.raw, t);
            const esMedia = /^(taza|cdta|cda|vaso)$/i.test(label);
            add({
                id: 'natural',
                etiqueta: label,
                gramosPorUnidad: gPorUd,
                paso: esMedia ? 0.5 : 1,
                min: esMedia ? 0.25 : 0.5,
                max: 30,
            });
            predeterminada = 'natural';
        }
    }

    // Gramos siempre disponible (SSOT)
    const pasoG = (g) => (g < 20 ? 1 : g < 100 ? 5 : 10);
    add({
        id: 'g',
        etiqueta: 'g',
        gramosPorUnidad: 1,
        paso: pasoG(gramosActuales),
        min: GRAMOS_MIN,
        max: GRAMOS_MAX,
    });

    // Unidades contextuales por familia de alimento
    if (_RE_GRASA.test(plano)) {
        add({ id: 'cdta', etiqueta: t('cdta'), gramosPorUnidad: 5, paso: 0.5, min: 0.5, max: 30 });
        add({ id: 'cda', etiqueta: t('cda'), gramosPorUnidad: 15, paso: 0.5, min: 0.25, max: 20 });
    } else if (_RE_LIQUIDO.test(plano)) {
        add({ id: 'ml', etiqueta: 'ml', gramosPorUnidad: 1, paso: gramosActuales < 50 ? 5 : 25, min: 5, max: 1500 });
        add({ id: 'taza', etiqueta: t('taza'), gramosPorUnidad: 240, paso: 0.25, min: 0.25, max: 10 });
        add({ id: 'cda', etiqueta: t('cda'), gramosPorUnidad: 15, paso: 1, min: 0.5, max: 30 });
    } else {
        if (!seen.has('natural')) {
            if (_RE_HUEVO.test(plano)) {
                add({ id: 'uds', etiqueta: t('uds'), gramosPorUnidad: 50, paso: 1, min: 0.5, max: 12 });
            } else if (_RE_SALAMI.test(plano)) {
                add({ id: 'ruedas', etiqueta: t('ruedas'), gramosPorUnidad: 20, paso: 1, min: 0.5, max: 20 });
            } else if (_RE_PAN.test(plano)) {
                add({ id: 'reb', etiqueta: t('reb.'), gramosPorUnidad: 30, paso: 1, min: 0.5, max: 12 });
            } else if (_RE_FRUTA_PIEZA.test(plano)) {
                add({ id: 'uds', etiqueta: t('uds'), gramosPorUnidad: 120, paso: 0.5, min: 0.25, max: 10 });
            }
        }
        if (_RE_BASE_TAZA.test(plano)) {
            const gTaza = _RE_CARNE_TAZA.test(plano) ? 140 : 180;
            add({ id: 'taza', etiqueta: t('taza'), gramosPorUnidad: gTaza, paso: 0.25, min: 0.25, max: 8 });
        }
    }

    // Onzas (muy común en RD/US para proteínas, guarniciones y grasas)
    add({ id: 'oz', etiqueta: 'oz', gramosPorUnidad: OZ_EN_GRAMOS, paso: 0.5, min: 0.25, max: 50 });

    // Porción relativa (0.5×, 1×, 1.5×, 2× respecto al plato original)
    if (base >= GRAMOS_MIN) {
        add({
            id: 'porcion',
            etiqueta: t('porción'),
            sufijo: '×',
            gramosPorUnidad: base,
            paso: 0.25,
            min: 0.25,
            max: 5,
        });
    }

    return { predeterminada, opciones };
}

/**
 * 4 atajos rápidos (1 toque) adaptados a la unidad elegida dentro del editor de cantidad.
 */
export function atajosParaUnidad(opcion, baseGramos = 100) {
    if (!opcion) return [];
    const { id, min = 0.25, max = 1500 } = opcion;
    let candidatos;
    if (id === 'porcion') {
        candidatos = [0.5, 1, 1.5, 2];
    } else if (id === 'natural' || id === 'uds' || id === 'ruedas' || id === 'reb') {
        candidatos = [1, 2, 3, 4];
    } else if (id === 'cdta' || id === 'cda' || id === 'taza') {
        candidatos = [0.5, 1, 1.5, 2];
    } else if (id === 'oz') {
        candidatos = [1, 2, 4, 6];
    } else {
        // g / ml: múltiplos útiles del tamaño original (o saltos limpios para cantidades pequeñas)
        const base = Number.isFinite(baseGramos) && baseGramos >= GRAMOS_MIN ? baseGramos : 100;
        if (base <= 15) {
            candidatos = [5, 10, 15, 20];
        } else {
            const pasoRedondeo = base >= 100 ? 5 : 1;
            candidatos = [0.5, 1, 1.5, 2].map((m) => Math.max(GRAMOS_MIN, Math.round((base * m) / pasoRedondeo) * pasoRedondeo));
        }
    }
    const vistos = new Set();
    const out = [];
    for (const v of candidatos) {
        if (v < min || v > max) continue;
        const g = unidadAGramos(v, opcion);
        if (g === null || g < GRAMOS_MIN || g > GRAMOS_MAX) continue;
        if (vistos.has(v)) continue;
        vistos.add(v);
        out.push(v);
    }
    return out.slice(0, 4);
}
