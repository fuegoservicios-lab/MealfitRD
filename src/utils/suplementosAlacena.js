// [P1-PLAN-LOTE-290 · 2026-09-25] Los suplementos en la Alacena: los potes (filas `kind = 'supplement'` de
// /api/inventory) y lo que el plan de hoy pide sin pote. Puro: la pantalla y la prueba lo miran igual.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Mismo suplemento si un nombre contiene al otro («Proteína Whey» ↔ «Proteína Whey Optimum»).
const mismoSuplemento = (a, b) => {
    const x = norm(a);
    const y = norm(b);
    return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

/** Las filas de alimentos (una fila sin `kind`, de una caché anterior, es alimento). */
export const sinSuplementos = (filas) => (filas || []).filter((f) => f && f.kind !== 'supplement');

export function agrupar(filas, suplementosDelPlan = []) {
    const potes = (filas || []).filter((f) => f && f.kind === 'supplement').map((f) => ({
        id: f.id,
        nombre: f.ingredient_name,
        marca: f.brand || null,
        porciones: Number(f.quantity) || 0,
        unidad: f.serving_unit || f.unit || 'porcion',
        etiqueta: f.serving_label || null,
        fuente: f.label_source || null,
    }));
    const soloDelPlan = [];
    for (const s of suplementosDelPlan || []) {
        if (!s?.name) continue;
        const pote = potes.find((p) => mismoSuplemento(p.nombre, s.name));
        if (pote) pote.delPlan = { dose: s.dose, timing: s.timing };
        else soloDelPlan.push(s);
    }
    return { potes, soloDelPlan };
}

/** La unidad en palabras, singular o plural (cada rama con su `t()` literal: el extractor de i18n las ve). */
export function unidadTexto(unidad, n, t) {
    const uno = n === 1;
    switch (unidad) {
        case 'scoop': return uno ? t('scoop') : t('scoops');
        case 'capsula': return uno ? t('cápsula') : t('cápsulas');
        case 'g': return 'g';
        default: return uno ? t('porción') : t('porciones');
    }
}

export function lineaEtiqueta(e, unidad, t) {
    if (!e) return t('Sin etiqueta — pídesela al coach');
    const gramos = e.serving_g ? ` (${Math.round(e.serving_g)} g)` : '';
    return t('1 {unidad}{gramos} · {kcal} kcal · {prot} g proteína', {
        unidad: unidadTexto(unidad, 1, t), gramos, kcal: Math.round(e.kcal || 0), prot: Math.round(e.protein_g || 0),
    });
}
