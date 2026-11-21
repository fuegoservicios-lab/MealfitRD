// [P1-PLAN-LOTE-1147 · 2026-11-21] La parte pura de la hoja «Registrar comida» rehecha.
import { describe, it, expect } from 'vitest';
import { comidaPorHora, pareceFrase, pasoDeCantidad } from '../utils/registroRapido';

const a = (h, m = 0) => new Date(2026, 10, 21, h, m);

describe('[1147] la comida por la hora', () => {
    it('desayuno, almuerzo, merienda, cena; de madrugada nada (Extra)', () => {
        expect(comidaPorHora(a(8))).toBe('desayuno');
        expect(comidaPorHora(a(13, 30))).toBe('almuerzo');
        expect(comidaPorHora(a(17))).toBe('merienda');
        expect(comidaPorHora(a(20))).toBe('cena');
        expect(comidaPorHora(a(2))).toBeNull();
    });
});

describe('[1147] ¿frase o alimento suelto?', () => {
    it('un alimento no es frase; un plato sí', () => {
        expect(pareceFrase('arroz')).toBe(false);
        expect(pareceFrase('pollo guisado')).toBe(false);
        expect(pareceFrase('arroz con pollo')).toBe(true);
        expect(pareceFrase('arroz, pollo')).toBe(true);
        expect(pareceFrase('mangú queso salami frito')).toBe(true);
    });
});

describe('[1147] los botones − / +', () => {
    it('en gramos de 25 en 25, sin bajar de 5', () => {
        expect(pasoDeCantidad('g', 100, -1)).toBe(75);
        expect(pasoDeCantidad('g', 110, 1)).toBe(125);
        expect(pasoDeCantidad('g', 10, -1)).toBe(5);
    });
    it('en piezas de ½ en ½ hasta 2 y luego de 1 en 1, sin bajar de ½', () => {
        expect(pasoDeCantidad('unidad', 1, -1)).toBe(0.5);
        expect(pasoDeCantidad('unidad', 0.5, -1)).toBe(0.5);
        expect(pasoDeCantidad('unidad', 1.5, 1)).toBe(2);
        expect(pasoDeCantidad('unidad', 2, 1)).toBe(3);
        expect(pasoDeCantidad('taza', 3, -1)).toBe(2);
        expect(pasoDeCantidad('taza', 2, -1)).toBe(1.5);
    });
});
