// [P1-UNIT-MISMATCH-NO-ES-FALTANTE · 2026-08-05] «No puedo comparar» no es «falta comida».
//
// CASO REAL. El owner vio «Lista revisada — 1 item puede necesitar ajuste manual: Ajo
// (Compra menor que la receta, 78% de diferencia)» sobre una lista donde el ajo estaba
// comprado. Las recetas lo pedían en `diente` (7) + `g` (10); la lista lo traía en
// `paquete (4 uds.)` (1) + `g` (23,33). Al comparar la casilla `diente`, el guard veía 7
// esperados y 0 comprados.
//
// El backend YA detectaba el caso y marcaba la fila con `unit_mismatch: true`
// (shopping_calculator.py: `act_qty == 0 and any(v > 0 for v in act_units.values())`),
// pero la emitía igual y el surface la mostraba como faltante.

import { describe, it, expect } from 'vitest';
import { buildCoherenceToast } from '../utils/renderCoherenceWarnings';

const ajo = (extra = {}) => ({
    food: 'Ajo',
    unit: 'diente',
    expected_qty: 7,
    actual_qty: 0,
    delta_pct: 0.78,
    hypothesis: 'magnitude_undersupply',
    ...extra,
});

describe('[P1-UNIT-MISMATCH-NO-ES-FALTANTE]', () => {
    it('EL CASO DEL OWNER: unit_mismatch no genera aviso', () => {
        expect(buildCoherenceToast([ajo({ unit_mismatch: true })])).toBeNull();
    });

    it('una divergencia REAL sigue avisando', () => {
        const r = buildCoherenceToast([ajo({ unit_mismatch: false })]);
        expect(r).not.toBeNull();
        expect(JSON.stringify(r)).toContain('Ajo');
    });

    it('sin el campo (planes viejos) se comporta como antes', () => {
        expect(buildCoherenceToast([ajo()])).not.toBeNull();
    });

    it('no silencia el resto: solo cae la fila incomparable', () => {
        const r = buildCoherenceToast([
            ajo({ unit_mismatch: true }),
            { food: 'Pollo', unit: 'g', expected_qty: 800, actual_qty: 300,
              delta_pct: 0.62, hypothesis: 'magnitude_undersupply' },
        ]);
        expect(r).not.toBeNull();
        const s = JSON.stringify(r);
        expect(s).toContain('Pollo');
        expect(s).not.toContain('Ajo');
    });

    it('⚠️ "no se compro nada" NO se silencia', () => {
        // Ahi el backend pone unit_mismatch=false (no hay compra en ninguna unidad),
        // asi que el aviso debe seguir saliendo: es un faltante de verdad.
        const r = buildCoherenceToast([
            { food: 'Salmón', unit: 'g', expected_qty: 400, actual_qty: 0,
              delta_pct: 1.0, hypothesis: 'magnitude_undersupply', unit_mismatch: false },
        ]);
        expect(r).not.toBeNull();
        expect(JSON.stringify(r)).toContain('Salmón');
    });
});
