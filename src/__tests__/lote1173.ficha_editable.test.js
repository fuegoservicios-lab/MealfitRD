// [P1-PLAN-LOTE-1173 · 2026-11-27] «solo me deja cambiar el guineo»: los renglones en ml se editan en ml.
import { describe, expect, it } from 'vitest';
import { unidadesParaIngrediente } from '../utils/unidadesDeIngrediente';

describe('lote 1173: la leche en ml se edita en ml', () => {
    it('un líquido en ml abre en ml', () => {
        const cfg = unidadesParaIngrediente('Leche entera (≈240 ml)', 240, 240);
        expect(cfg.predeterminada).toBe('ml');
        expect(cfg.opciones.find((o) => o.id === 'ml')).toBeTruthy();
    });
    it('un líquido en gramos sigue en gramos, y un sólido no cambia', () => {
        expect(unidadesParaIngrediente('Leche entera (≈240 g)', 240, 240).predeterminada).toBe('g');
        expect(unidadesParaIngrediente('Azúcar (≈10 g)', 10, 10).predeterminada).toBe('g');
    });
});
