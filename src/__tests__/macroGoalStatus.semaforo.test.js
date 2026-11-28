// [P1-MACRO-BARS-SEMAFORO · 2026-11-26] El color de la barra es su estado: gris en curso, verde cumplida, rojo pasada.
import { describe, expect, it } from 'vitest';
import { getMacroGoalState, calorieStateToBarState } from '../utils/macroGoalStatus';

describe('getMacroGoalState', () => {
    it.each([
        [0, 134, 179, 'progress'],      // día vacío
        [55, 134, 179, 'progress'],     // 41 %: en curso, NO rojo a media tarde
        [121, 134, 179, 'done'],        // 90 %: cuenta como cumplida
        [160, 134, 179, 'done'],        // sobre la meta pero bajo el límite AMDR
        [179, 134, 179, 'done'],        // justo en el límite
        [180, 134, 179, 'over'],        // pasó el límite
        [160, 134, undefined, 'done'],  // sin límite: hasta 120 % de la meta
        [161, 134, undefined, 'over'],  // sin límite: más de 120 % es exceso
        [10, 0, undefined, 'progress'], // sin meta no hay juicio
    ])('%i g de %i (límite %s) → %s', (consumed, goal, ref, expected) => {
        expect(getMacroGoalState(consumed, goal, ref)).toBe(expected);
    });

    it('traduce la banda calórica por objetivo al mismo vocabulario', () => {
        expect(calorieStateToBarState('under')).toBe('progress');
        expect(calorieStateToBarState('green')).toBe('done');
        expect(calorieStateToBarState('over')).toBe('over');
    });
});
