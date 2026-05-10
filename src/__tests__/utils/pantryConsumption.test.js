/**
 * [P3-C · 2026-05-08] Tests del helper `getEstimatedDailyConsumption`.
 *
 * Fija el contrato cosmético del badge "~X g/día" en la nevera (Pantry.jsx).
 * Cero dependencia con el rate dinámico real (P2-2 en backend) — este helper
 * es heurístico por categoría, mirror de `db_inventory.py:417-428`.
 *
 * Si un futuro PR ajusta los rates, este test es la fuente de verdad de qué
 * se mostrará al usuario en la UI; el cambio es intencional cuando el test
 * se actualiza junto con el helper.
 */
import { describe, it, expect } from 'vitest';
import { getEstimatedDailyConsumption } from '../../utils/pantryConsumption';

describe('P3-C — getEstimatedDailyConsumption', () => {
    // --------------------------------------------------------------------
    // 1. Categorías estimables — mapping categoría → rate
    // --------------------------------------------------------------------
    describe('categorías core estimables', () => {
        it('huevos → 1 unid/día (independiente del unit)', () => {
            expect(getEstimatedDailyConsumption('HUEVOS', 'unidad')).toEqual({ rate: 1, unit: 'unid' });
            expect(getEstimatedDailyConsumption('Huevos', 'g')).toEqual({ rate: 1, unit: 'unid' });
        });

        it('frutas con unidad discreta → 1 unid/día', () => {
            expect(getEstimatedDailyConsumption('FRUTAS', 'unidad')).toEqual({ rate: 1, unit: 'unid' });
            expect(getEstimatedDailyConsumption('FRUTAS', 'pieza')).toEqual({ rate: 1, unit: 'unid' });
        });

        it('frutas con unidad de peso → 150 g/día', () => {
            expect(getEstimatedDailyConsumption('FRUTAS', 'g')).toEqual({ rate: 150, unit: 'g' });
            expect(getEstimatedDailyConsumption('FRUTAS', 'kg')).toEqual({ rate: 150, unit: 'g' });
        });

        it('proteínas (carne, pollo, pescado, mariscos) → 150 g/día', () => {
            expect(getEstimatedDailyConsumption('PROTEÍNAS', 'g')).toEqual({ rate: 150, unit: 'g' });
            expect(getEstimatedDailyConsumption('CARNES', 'g')).toEqual({ rate: 150, unit: 'g' });
            expect(getEstimatedDailyConsumption('POLLO', 'g')).toEqual({ rate: 150, unit: 'g' });
            expect(getEstimatedDailyConsumption('PESCADOS', 'g')).toEqual({ rate: 150, unit: 'g' });
            expect(getEstimatedDailyConsumption('MARISCOS', 'g')).toEqual({ rate: 150, unit: 'g' });
            expect(getEstimatedDailyConsumption('AVES', 'g')).toEqual({ rate: 150, unit: 'g' });
        });

        it('carbohidratos / granos / legumbres / víveres → 100 g/día', () => {
            expect(getEstimatedDailyConsumption('CEREALES Y GRANOS', 'g')).toEqual({ rate: 100, unit: 'g' });
            expect(getEstimatedDailyConsumption('LEGUMBRES', 'g')).toEqual({ rate: 100, unit: 'g' });
            expect(getEstimatedDailyConsumption('DESPENSA Y GRANOS', 'g')).toEqual({ rate: 100, unit: 'g' });
            expect(getEstimatedDailyConsumption('VÍVERES', 'g')).toEqual({ rate: 100, unit: 'g' });
            expect(getEstimatedDailyConsumption('VIVERES', 'g')).toEqual({ rate: 100, unit: 'g' });
        });

        it('vegetales / verduras / hortalizas → 80 g/día', () => {
            expect(getEstimatedDailyConsumption('VEGETALES', 'g')).toEqual({ rate: 80, unit: 'g' });
            expect(getEstimatedDailyConsumption('VERDURAS', 'g')).toEqual({ rate: 80, unit: 'g' });
            expect(getEstimatedDailyConsumption('HORTALIZAS', 'g')).toEqual({ rate: 80, unit: 'g' });
        });

        it('lácteos → 200 g/día (o ml si unit=ml)', () => {
            expect(getEstimatedDailyConsumption('LÁCTEOS', 'g')).toEqual({ rate: 200, unit: 'g' });
            expect(getEstimatedDailyConsumption('LECHE', 'ml')).toEqual({ rate: 200, unit: 'ml' });
            expect(getEstimatedDailyConsumption('QUESOS', 'g')).toEqual({ rate: 200, unit: 'g' });
        });
    });

    // --------------------------------------------------------------------
    // 2. Categorías NO estimables → null (badge se oculta)
    // --------------------------------------------------------------------
    describe('categorías no estimables retornan null', () => {
        it.each([
            ['ESPECIAS'],
            ['CONDIMENTOS'],
            ['HIERBAS'],
            ['GRASAS'],
            ['ACEITES'],
            ['DULCES'],
            ['AZÚCARES'],
            ['BEBIDAS'],
            ['PANADERÍA'],
            ['FRUTOS SECOS'],
            ['OTROS'],
            ['DESCONOCIDA_X'],
        ])('%s → null', (cat) => {
            expect(getEstimatedDailyConsumption(cat, 'g')).toBeNull();
        });
    });

    // --------------------------------------------------------------------
    // 3. Defensivo: inputs degenerados
    // --------------------------------------------------------------------
    describe('inputs degenerados', () => {
        it.each([
            [null, 'g'],
            [undefined, 'g'],
            ['', 'g'],
        ])('category=%s no debe lanzar y retorna null', (cat, unit) => {
            expect(getEstimatedDailyConsumption(cat, unit)).toBeNull();
        });

        it('unit null/undefined no rompe el helper (categoría sigue resolviendo)', () => {
            expect(getEstimatedDailyConsumption('HUEVOS', null)).toEqual({ rate: 1, unit: 'unid' });
            expect(getEstimatedDailyConsumption('PROTEÍNAS', undefined)).toEqual({ rate: 150, unit: 'g' });
        });

        it('case-insensitive: matching no depende de mayúsculas/minúsculas', () => {
            expect(getEstimatedDailyConsumption('proteínas', 'g')).toEqual({ rate: 150, unit: 'g' });
            expect(getEstimatedDailyConsumption('Vegetales', 'g')).toEqual({ rate: 80, unit: 'g' });
            expect(getEstimatedDailyConsumption('  PROTEÍNAS  ', 'g')).toEqual({ rate: 150, unit: 'g' });
        });
    });
});
