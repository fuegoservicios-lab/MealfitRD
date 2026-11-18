// [P1-PLAN-LOTE-1097 · 2026-11-18] «El sombreado del resumen choca» y «no me deja moverlo al 100 %, al estilo de
// Instagram»: la franja oscura de lado a lado es una sombra redonda alrededor del resumen, y el resumen (y los textos)
// van a donde los lleves; solo su centro se queda dentro de la imagen.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIMITES_CIFRAS, cajaDeCifras, ANCHO, ALTO } from '../utils/historiaConFoto';
import { moverBloque, cajaTransformada, escalaMax, ESCALA_TOPE, BLOQUE_INICIAL } from '../utils/bloqueDeCifras';

const R = { calorias: { valor: 1800, meta: 2000, pct: 90, etiqueta: 'Calorías' }, macros: [] };

describe('[1097] mover libre', () => {
    it('los límites son la imagen entera', () => {
        expect(LIMITES_CIFRAS).toMatchObject({ x0: 0, x1: ANCHO, y0: 0, y1: ALTO, libre: true });
    });
    it('el resumen sube por encima de la cabecera y baja sobre lo que tapa Instagram', () => {
        const caja = cajaDeCifras(R, 'titular');
        const arriba = cajaTransformada(caja, moverBloque(BLOQUE_INICIAL, caja, LIMITES_CIFRAS, { dy: -99999 }));
        expect(arriba.y).toBeLessThan(0);                       // medio fuera, como un sticker
        expect(arriba.y + arriba.h / 2).toBeCloseTo(0);
        const abajo = cajaTransformada(caja, moverBloque(BLOQUE_INICIAL, caja, LIMITES_CIFRAS, { dy: 99999 }));
        expect(abajo.y + abajo.h / 2).toBeCloseTo(ALTO);
    });
    it('crece hasta el tope', () => {
        expect(escalaMax(cajaDeCifras(R, 'titular'), LIMITES_CIFRAS)).toBe(ESCALA_TOPE);
    });
});

describe('[1097] la sombra del resumen', () => {
    it('es redonda (degradado radial), no una franja de lado a lado', () => {
        const src = readFileSync(resolve(__dirname, '..', 'utils', 'historiaConFoto.js'), 'utf8');
        const cuerpo = src.slice(src.indexOf('const _veloDelBloque'), src.indexOf('/** Solo en la vista previa'));
        expect(cuerpo).toMatch(/createRadialGradient/);
        expect(cuerpo).not.toMatch(/fillRect\(0, desde, ANCHO/);
    });
});
