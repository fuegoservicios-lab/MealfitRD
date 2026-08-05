// [P1-COHERENCE-DELTA-SIGN · 2026-08-05] El toast de coherencia no puede
// contradecirse a sí mismo.
//
// El owner reportó desde producción: «Ajo (Compra menor que la receta, +88%)».
// Dice "menor" y muestra "+". La causa es un desajuste de contrato: el backend
// emite `delta_pct = abs(act_qty - exp_qty) / exp_qty` (shopping_calculator.py),
// una MAGNITUD siempre ≥ 0, mientras el renderer la trataba como delta con signo
// y le anteponía "+" cuando era > 0 — o sea SIEMPRE.
//
// Nada cubría esto: el bug se desplegó sin un solo test sobre `delta_pct`.
import { describe, it, expect } from 'vitest';
import { buildCoherenceToast } from '../utils/renderCoherenceWarnings';

const item = (over) => ({
    food: 'Ajo',
    hypothesis: 'magnitude_undersupply',
    side: 'left',
    magnitude: true,
    ...over,
});

describe('[P1-COHERENCE-DELTA-SIGN] magnitud del toast de coherencia', () => {
    it('NUNCA antepone "+" a la magnitud', () => {
        const out = buildCoherenceToast([item({ delta_pct: 0.88 })]);
        const texto = JSON.stringify(out);
        expect(texto).not.toMatch(/\+\d+%/);
    });

    it('el caso reportado por el owner ya no se contradice', () => {
        const out = buildCoherenceToast([item({ delta_pct: 0.88 })]);
        const texto = JSON.stringify(out);
        expect(texto).toMatch(/Compra menor que la receta/);
        expect(texto).toMatch(/88% de diferencia/);
        // La contradicción exacta que el owner vio en pantalla.
        expect(texto).not.toMatch(/menor que la receta, \+/);
    });

    it('una magnitud negativa se muestra en valor absoluto, no como "-"', () => {
        // Defensa por si alguna superficie llegara a emitir un signo: el numero
        // que se enseña es CUANTO se separa, y la direccion la da la etiqueta.
        const out = buildCoherenceToast([item({ delta_pct: -0.45 })]);
        expect(JSON.stringify(out)).toMatch(/45% de diferencia/);
    });

    it('por debajo del umbral no se anexa magnitud', () => {
        const out = buildCoherenceToast([item({ delta_pct: 0.05 })]);
        expect(JSON.stringify(out)).not.toMatch(/diferencia/);
    });
});
