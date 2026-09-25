// [P1-PLAN-LOTE-292 · 2026-09-25] Espejo EXACTO de backend/suplementos.normalizar_suplementos (paridad en
// src/__tests__/lote292.test.jsx y tests/test_p1_plan_lote_292.py). Formulario nuevo: `currentSupplements` (lo que toma)
// + `recommendSupplements`. Formulario viejo: `includeSupplements` + `selectedSupplements` (lo elegido era «lo quiero»;
// el interruptor sin elección, «recomiéndame»).
export function normalizarSuplementos(fd) {
    const f = fd && typeof fd === 'object' ? fd : {};
    if (Array.isArray(f.currentSupplements)) {
        return { toma: f.currentSupplements.filter((s) => typeof s === 'string'), recomendar: !!f.recommendSupplements };
    }
    if (!f.includeSupplements) return { toma: [], recomendar: false };
    const sel = (f.selectedSupplements || []).filter((s) => typeof s === 'string');
    if (sel.length) return { toma: sel, recomendar: false };
    return { toma: [], recomendar: true };
}

/**
 * [P1-PLAN-LOTE-292] Lo que el usuario marcó en «¿Tomas algún suplemento?» → su Alacena (sin etiqueta: el coach la
 * completa con la foto del pote). Fire-and-forget: un fallo aquí nunca bloquea generar el plan ni cerrar el formulario.
 */
export async function guardarSuplementosEnAlacena(fd, fetcher) {
    const { toma } = normalizarSuplementos(fd);
    if (!toma.length || typeof fetcher !== 'function') return false;
    try {
        const r = await fetcher('/api/inventory/supplements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claves: toma }),
        });
        return !!(r && r.ok);
    } catch {
        return false;
    }
}
