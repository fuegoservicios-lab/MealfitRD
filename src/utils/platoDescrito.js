// [P1-PLAN-LOTE-348 · 2026-09-26] «Descríbelo y lo calculo»: las partes que devuelve `/consumed/estimate-plate`,
// convertidas en líneas del componedor. Un PLATO del catálogo entra como plato (en gramos, con la misma vista previa
// que si se hubiera buscado); lo demás, como línea estimada editable con sus gramos para mostrarlos. Si el cliente
// no conoce el plato (catálogo viejo en caché), entra como estimado con las macros que calculó el servidor.
import { t } from '../i18n';

const _n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : 0;
};

let secuencia = 0;

export function lineasDelPlatoDescrito(lineasApi, dishes) {
    const porSlug = new Map((dishes || []).map((d) => [d.slug, d]));
    return (Array.isArray(lineasApi) ? lineasApi : []).flatMap((l) => {
        if (!l || typeof l !== 'object') return [];
        const id = `descrito-${++secuencia}`;
        const m = l.macros || {};
        const macros = { kcal: _n(m.kcal), protein: _n(m.protein), carbs: _n(m.carbs), fats: _n(m.fats) };
        const ref = String(l.ref || '');
        if (ref.startsWith('dish:')) {
            const d = porSlug.get(ref.slice(5));
            if (d && _n(l.qty) > 0) {
                return [{
                    id, ref,
                    entry: { kind: 'dish', ref, label: d.label, sub: t('Plato criollo · ración {g} g', { g: Math.round(d.finished_g) }), item: d },
                    qty: Math.round(_n(l.qty)), unit: 'g',
                }];
            }
        }
        const nombre = String(l.name || '').trim().slice(0, 120);
        if (!nombre) return [];
        return [{ id, ref: 'custom', name: nombre, macros, estimated: true, grams: _n(l.grams) || null }];
    });
}
