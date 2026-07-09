/**
 * [P1-2 · normalizePlanDays + adaptadores de meal] SSOT para el coalescing de
 * los 3 shapes historicos de plan_data ({days}|{meals}|{perfectDay}) y para leer
 * los alias de calorias (cals/kcal/calories) y macros (p/c/g vs protein/carbs/
 * fats). Antes cada call site copiaba el coalescing verbatim y un branch olvidado
 * renderizaba menu en blanco SIN error (History.jsx ya cargaba un guard ad-hoc).
 */
import { describe, it, expect } from 'vitest';
import {
    normalizePlanDays,
    firstDayMeals,
    mealCalories,
    mealMacros,
} from '../../utils/normalizePlanDays';

describe('normalizePlanDays', () => {
    it('shape moderno {days:[...]} → devuelve days tal cual', () => {
        const pd = { days: [{ day: 1, meals: [{ name: 'A' }] }, { day: 2, meals: [] }] };
        expect(normalizePlanDays(pd)).toEqual(pd.days);
    });

    it('legacy {meals:[...]} → [{day:1, meals}]', () => {
        const pd = { meals: [{ name: 'X' }] };
        expect(normalizePlanDays(pd)).toEqual([{ day: 1, meals: [{ name: 'X' }] }]);
    });

    it('legacy {perfectDay:[...]} → [{day:1, meals: perfectDay}]', () => {
        const pd = { perfectDay: [{ name: 'Y' }] };
        expect(normalizePlanDays(pd)).toEqual([{ day: 1, meals: [{ name: 'Y' }] }]);
    });

    it('days:[] vacio → cae al fallback de meals (defensivo, matchea _hasDays)', () => {
        const pd = { days: [], meals: [{ name: 'Z' }] };
        expect(normalizePlanDays(pd)).toEqual([{ day: 1, meals: [{ name: 'Z' }] }]);
    });

    it('days no-vacio tiene precedencia sobre meals', () => {
        const pd = { days: [{ day: 1, meals: [{ name: 'fromDays' }] }], meals: [{ name: 'fromMeals' }] };
        expect(normalizePlanDays(pd)[0].meals[0].name).toBe('fromDays');
    });

    it('null/undefined/no-objeto → []', () => {
        expect(normalizePlanDays(null)).toEqual([]);
        expect(normalizePlanDays(undefined)).toEqual([]);
        expect(normalizePlanDays('x')).toEqual([]);
    });

    it('sin days/meals/perfectDay → [{day:1, meals:[]}]', () => {
        expect(normalizePlanDays({ name: 'plan' })).toEqual([{ day: 1, meals: [] }]);
    });
});

describe('firstDayMeals', () => {
    it('{days:[{meals:[a,b]}]} → [a,b]', () => {
        expect(firstDayMeals({ days: [{ day: 1, meals: [{ n: 'a' }, { n: 'b' }] }] }))
            .toEqual([{ n: 'a' }, { n: 'b' }]);
    });
    it('legacy {meals} → meals', () => {
        expect(firstDayMeals({ meals: [{ n: 'm' }] })).toEqual([{ n: 'm' }]);
    });
    it('legacy {perfectDay} → perfectDay', () => {
        expect(firstDayMeals({ perfectDay: [{ n: 'p' }] })).toEqual([{ n: 'p' }]);
    });
    it('null → []', () => {
        expect(firstDayMeals(null)).toEqual([]);
    });
});

describe('mealCalories · alias cals/kcal/calories', () => {
    it('calories poblado → calories', () => {
        expect(mealCalories({ calories: 500 })).toBe(500);
    });
    it('cals poblado (sin calories) → cals', () => {
        expect(mealCalories({ cals: 420 })).toBe(420);
    });
    it('kcal poblado (sin calories/cals) → kcal', () => {
        expect(mealCalories({ kcal: 300 })).toBe(300);
    });
    it('string numerico → coerce', () => {
        expect(mealCalories({ calories: '250' })).toBe(250);
    });
    it('respeta 0 explicito', () => {
        expect(mealCalories({ calories: 0 })).toBe(0);
    });
    it('ninguno / no-objeto → 0', () => {
        expect(mealCalories({})).toBe(0);
        expect(mealCalories(null)).toBe(0);
    });
});

describe('mealMacros · alias p/c/g ↔ protein/carbs/fats', () => {
    it('nombres completos', () => {
        expect(mealMacros({ protein: 30, carbs: 40, fats: 10 }))
            .toEqual({ protein: 30, carbs: 40, fats: 10 });
    });
    it('alias abreviados p/c/g → remap', () => {
        expect(mealMacros({ p: 30, c: 40, g: 10 }))
            .toEqual({ protein: 30, carbs: 40, fats: 10 });
    });
    it('nombre completo tiene precedencia sobre abreviado', () => {
        expect(mealMacros({ protein: 30, p: 99 }).protein).toBe(30);
    });
    it('faltantes → 0', () => {
        expect(mealMacros({ protein: 25 })).toEqual({ protein: 25, carbs: 0, fats: 0 });
        expect(mealMacros(null)).toEqual({ protein: 0, carbs: 0, fats: 0 });
    });
});
