// [P1-PLAN-LOTE-383 · 2026-09-26] La Nevera del componedor dice la verdad.
//
// Auditoría de «Registrar comida»: el interruptor «Descontar de mi Nevera — Resta estos alimentos» salía aunque TODAS
// las líneas fueran `custom` («Descríbelo», «Macros a mano», «Lo que más registras»), que nunca descontaban. Ahora las
// partes con gramos de «Descríbelo» viajan con sus gramos y sí descuentan (como en el escáner), y el interruptor solo se
// ofrece si hay algo que restar (una línea del catálogo o una parte con gramos).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lineaDescontable } from '../components/dashboard/mealLogShared';

const leer = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('[383] qué línea baja de la Nevera', () => {
    it('del catálogo sí; una parte con gramos sí; «Macros a mano» sin gramos no', () => {
        expect(lineaDescontable({ ref: 'food:arroz', qty: 100 })).toBe(true);
        expect(lineaDescontable({ ref: 'custom', name: 'Lechosa', grams: 150 })).toBe(true);
        expect(lineaDescontable({ ref: 'custom', name: 'Batida de lechosa' })).toBe(false);
        expect(lineaDescontable({ ref: 'custom', name: 'x', grams: 0 })).toBe(false);
    });

    it('el componedor manda los gramos y solo ofrece el interruptor si hay algo que restar', () => {
        const src = leer('components/dashboard/LogMealModal.jsx');
        expect(src).toContain("...(Number(l.grams) > 0 ? { grams: Number(l.grams) } : {})");
        expect(src).toContain('const hayQueDescontar = lines.some(lineaDescontable);');
        expect(src).toContain('deduct_pantry: neveraOn && deductPantry && hayQueDescontar,');
        expect(src).toContain('{neveraOn && hayQueDescontar && (');
    });
});
