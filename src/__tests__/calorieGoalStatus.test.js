import { describe, it, expect } from 'vitest';
import {
    getCalorieGoalBand,
    getCalorieGoalState,
    isStrongDeficit,
    resolveMainGoal,
} from '../utils/calorieGoalStatus';

describe('calorieGoalStatus — bandas relativas al objetivo', () => {
    it('resuelve el objetivo sin forzar lose_fat cuando falta', () => {
        expect(resolveMainGoal()).toBe('');
        expect(resolveMainGoal({})).toBe('');
        expect(resolveMainGoal({ mainGoal: 'Gain_Muscle' })).toBe('gain_muscle');
        expect(resolveMainGoal({ referenceProfile: { mainGoal: 'lose_fat' } })).toBe('lose_fat');
        expect(resolveMainGoal({ planData: { goal: 'maintenance' } })).toBe('maintenance');
    });

    it('lose_fat usa banda [80 %, 105 %]', () => {
        expect(getCalorieGoalBand('lose_fat')).toEqual({ lo: 0.80, hi: 1.05 });
        expect(getCalorieGoalBand('perder grasa')).toEqual({ lo: 0.80, hi: 1.05 });
        expect(getCalorieGoalState(790, 1000, 'lose_fat')).toBe('under');   // 79 %
        expect(getCalorieGoalState(800, 1000, 'lose_fat')).toBe('green');   // 80 %
        expect(getCalorieGoalState(880, 1000, 'lose_fat')).toBe('green');   // 88 % (déficit sano)
        expect(getCalorieGoalState(1050, 1000, 'lose_fat')).toBe('green');  // 105 %
        expect(getCalorieGoalState(1060, 1000, 'lose_fat')).toBe('over');   // 106 %
    });

    it('gain_muscle usa banda [90 %, 115 %]', () => {
        expect(getCalorieGoalBand('gain_muscle')).toEqual({ lo: 0.90, hi: 1.15 });
        expect(getCalorieGoalBand('ganar músculo')).toEqual({ lo: 0.90, hi: 1.15 });
        expect(getCalorieGoalState(890, 1000, 'gain_muscle')).toBe('under');   // 89 %
        expect(getCalorieGoalState(900, 1000, 'gain_muscle')).toBe('green');   // 90 %
        expect(getCalorieGoalState(3082, 3350, 'gain_muscle')).toBe('green');  // 92 % (jueves real)
        expect(getCalorieGoalState(1150, 1000, 'gain_muscle')).toBe('green');  // 115 %
        expect(getCalorieGoalState(1160, 1000, 'gain_muscle')).toBe('over');   // 116 %
    });

    it('maintenance, performance y objetivo desconocido usan banda neutra [90 %, 110 %]', () => {
        for (const goal of ['maintenance', 'performance', '', null, undefined]) {
            expect(getCalorieGoalBand(goal)).toEqual({ lo: 0.90, hi: 1.10 });
            expect(getCalorieGoalState(890, 1000, goal)).toBe('under');
            expect(getCalorieGoalState(900, 1000, goal)).toBe('green');
            expect(getCalorieGoalState(1100, 1000, goal)).toBe('green');
            expect(getCalorieGoalState(1110, 1000, goal)).toBe('over');
        }
    });

    it('detecta déficit fuerte solo en lose_fat cuando queda entre >0 y <70 %', () => {
        expect(isStrongDeficit(1200, 2050, 'lose_fat')).toBe(true);   // 58.5 %
        expect(isStrongDeficit(1399, 2000, 'lose_fat')).toBe(true);   // 69.95 %
        expect(isStrongDeficit(1400, 2000, 'lose_fat')).toBe(false);  // 70 % exacto
        expect(isStrongDeficit(0, 2000, 'lose_fat')).toBe(false);     // día sin comidas
        expect(isStrongDeficit(1200, 2000, 'maintenance')).toBe(false);
        expect(isStrongDeficit(1200, 2000, 'gain_muscle')).toBe(false);
        expect(isStrongDeficit(1200, 2000, '')).toBe(false);
    });
});
