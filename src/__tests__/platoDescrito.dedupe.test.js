/**
 * Regresión de deduplicación al recalcular "Descríbelo y lo calculo" en LogMealModal
 * (caso vivo roselin3113@gmail.com: arroz, habichuela y pescado calculado 2 veces).
 */
import { describe, it, expect } from 'vitest';
import { fusionarLineasEstimadas, lineasDelPlatoDescrito } from '../utils/platoDescrito';

const DISHES = [
    { slug: 'arroz-blanco', label: 'Arroz blanco', finished_g: 150 },
    { slug: 'habichuelas-guisadas', label: 'Habichuelas guisadas', finished_g: 150 },
];

describe('fusionarLineasEstimadas', () => {
    it('reemplaza el cálculo previo si vuelve a calcular el mismo plato (incluso si varía el nombre del pescado)', () => {
        const primera = lineasDelPlatoDescrito([
            { ref: 'dish:arroz-blanco', qty: 150 },
            { ref: 'dish:habichuelas-guisadas', qty: 120 },
            { ref: 'custom', name: 'Pescado (filete blanco cocido)', grams: 150, macros: { kcal: 190, protein: 39, carbs: 0, fats: 3 } },
        ], DISHES);

        const segunda = lineasDelPlatoDescrito([
            { ref: 'dish:arroz-blanco', qty: 150 },
            { ref: 'dish:habichuelas-guisadas', qty: 120 },
            { ref: 'custom', name: 'Pescado cocido', grams: 150, macros: { kcal: 190, protein: 39, carbs: 0, fats: 3 } },
        ], DISHES);

        const fusion = fusionarLineasEstimadas(primera, segunda);
        expect(fusion).toHaveLength(3);
        expect(fusion.map((l) => l.name || l.entry?.label)).toEqual([
            'Arroz blanco',
            'Habichuelas guisadas',
            'Pescado cocido',
        ]);
    });

    it('conserva líneas añadidas manualmente al recalcular una estimación', () => {
        const manual = [{ id: 'man-1', ref: 'custom', name: 'Aguacate', macros: { kcal: 120, protein: 1, carbs: 6, fats: 11 } }];
        const est1 = lineasDelPlatoDescrito([
            { ref: 'custom', name: 'Pescado (filete blanco cocido)', grams: 150, macros: { kcal: 190, protein: 39, carbs: 0, fats: 3 } },
        ], DISHES);
        const est2 = lineasDelPlatoDescrito([
            { ref: 'custom', name: 'Pescado cocido', grams: 120, macros: { kcal: 155, protein: 31, carbs: 0, fats: 2 } },
        ], DISHES);

        const res = fusionarLineasEstimadas([...manual, ...est1], est2);
        expect(res).toHaveLength(2);
        expect(res.map((l) => l.name)).toEqual(['Aguacate', 'Pescado cocido']);
    });

    it('añade sin borrar cuando la segunda descripción es de un alimento distinto', () => {
        const est1 = lineasDelPlatoDescrito([
            { ref: 'dish:arroz-blanco', qty: 150 },
        ], DISHES);
        const est2 = lineasDelPlatoDescrito([
            { ref: 'custom', name: 'Jugo de chinola natural', grams: 250, macros: { kcal: 90, protein: 1, carbs: 22, fats: 0 } },
        ], DISHES);

        const res = fusionarLineasEstimadas(est1, est2);
        expect(res).toHaveLength(2);
    });
});
