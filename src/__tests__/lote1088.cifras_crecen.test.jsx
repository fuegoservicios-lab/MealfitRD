// [P1-PLAN-LOTE-1088 · 2026-11-18] «Lo de pellizcar sigue igual»: las cifras solo podían crecer ~10 % (ya ocupaban casi
// todo el ancho). Ahora crecen hasta ESCALA_TOPE aunque pasen del ancho, y se arrastran de lado sin dejar hueco.
import { describe, it, expect } from 'vitest';
import { cajaDeCifras, LIMITES_CIFRAS, ESTILOS } from '../utils/historiaConFoto';
import { BLOQUE_INICIAL, ESCALA_TOPE, escalaMax, moverBloque, acotarBloque, cajaTransformada } from '../utils/bloqueDeCifras';

const R = { calorias: { valor: 2308, meta: 2050, pct: 113 }, macros: [] };

describe('[1088] las cifras crecen de verdad', () => {
    it('en cada estilo el tope pasa de 1,4× (antes ~1,1×) y a lo alto siguen dentro de la zona segura', () => {
        for (const estilo of ESTILOS) {
            const caja = cajaDeCifras(R, estilo);
            const tope = escalaMax(caja, LIMITES_CIFRAS);
            expect(tope).toBeGreaterThan(1.4);
            expect(tope).toBeLessThanOrEqual(ESCALA_TOPE);
            const c = cajaTransformada(caja, acotarBloque({ escala: tope }, caja, LIMITES_CIFRAS));
            expect(c.y).toBeGreaterThanOrEqual(LIMITES_CIFRAS.y0 - 0.01);
            expect(c.y + c.h).toBeLessThanOrEqual(LIMITES_CIFRAS.y1 + 0.01);
        }
    });

    it('pellizcar al doble las agranda (antes se quedaban en ~1,1)', () => {
        const caja = cajaDeCifras(R, 'titular');
        expect(moverBloque(BLOQUE_INICIAL, caja, LIMITES_CIFRAS, { factor: 1.5 }).escala).toBeCloseTo(1.5);
    });

    it('más anchas que la historia: se mueven de lado pero siempre la cubren (sin hueco)', () => {
        const caja = cajaDeCifras(R, 'titular');
        for (const dx of [-99999, 0, 99999]) {
            const b = moverBloque({ escala: 1.6 }, caja, LIMITES_CIFRAS, { dx });
            const c = cajaTransformada(caja, b);
            expect(c.x).toBeLessThanOrEqual(LIMITES_CIFRAS.x0 + 0.01);
            expect(c.x + c.w).toBeGreaterThanOrEqual(LIMITES_CIFRAS.x1 - 0.01);
        }
        const izq = moverBloque({ escala: 1.6 }, caja, LIMITES_CIFRAS, { dx: 99999 });
        const der = moverBloque({ escala: 1.6 }, caja, LIMITES_CIFRAS, { dx: -99999 });
        expect(izq.dx).toBeGreaterThan(der.dx);
    });
});
