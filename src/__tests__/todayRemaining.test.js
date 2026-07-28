// [P1-TODAY-REMAINING · 2026-07-28] Unit tests del núcleo puro que decide
// qué slot de HOY se atenúa en "Tu Menú" — espejo JS de
// backend/constants.py::canonical_slot_key + backend/agent.py's
// _build_today_remaining_context (misma regla de match + regla de
// ambigüedad, ver docstring de utils/todayRemaining.js).
import { describe, it, expect } from 'vitest';
import {
    canonicalSlotKey,
    getEatenSlotIndices,
    sumConsumedCalories,
    eatenKcalForSlot,
} from '../utils/todayRemaining';

describe('canonicalSlotKey', () => {
    it('normalizes known es-DO slot labels', () => {
        expect(canonicalSlotKey('Desayuno')).toBe('desayuno');
        expect(canonicalSlotKey('breakfast')).toBe('desayuno');
        expect(canonicalSlotKey('Almuerzo')).toBe('almuerzo');
        expect(canonicalSlotKey('comida')).toBe('almuerzo');
        expect(canonicalSlotKey('Cena')).toBe('cena');
        expect(canonicalSlotKey('dinner')).toBe('cena');
    });

    it('collapses every merienda variant (including snack) to "merienda"', () => {
        for (const v of ['Merienda', 'snack', 'Merienda AM', 'Merienda PM', 'media manana', 'media tarde',
            'Merienda Matutina', 'Merienda Vespertina']) {
            expect(canonicalSlotKey(v)).toBe('merienda');
        }
    });

    it('is accent- and case-insensitive', () => {
        expect(canonicalSlotKey('MERIENDA')).toBe('merienda');
        expect(canonicalSlotKey('  Almuerzo  ')).toBe('almuerzo');
    });

    it('returns null for unrecognized or empty input', () => {
        expect(canonicalSlotKey('Suplemento')).toBeNull();
        expect(canonicalSlotKey('')).toBeNull();
        expect(canonicalSlotKey(null)).toBeNull();
        expect(canonicalSlotKey(undefined)).toBeNull();
    });
});

describe('getEatenSlotIndices — REGLA DE MATCH', () => {
    const FOUR_MEALS = [
        { meal: 'Desayuno' }, { meal: 'Almuerzo' }, { meal: 'Merienda' }, { meal: 'Cena' },
    ];

    it('marks the single unambiguous match', () => {
        const idx = getEatenSlotIndices(FOUR_MEALS, [{ meal_type: 'desayuno', calories: 500 }]);
        expect([...idx]).toEqual([0]);
    });

    it('marks multiple unambiguous matches independently', () => {
        const idx = getEatenSlotIndices(FOUR_MEALS, [
            { meal_type: 'desayuno', calories: 500 },
            { meal_type: 'cena', calories: 550 },
        ]);
        expect([...idx].sort()).toEqual([0, 3]);
    });

    it('does not mark anything for an unplanned slot (0 matches)', () => {
        const threeMeals = [{ meal: 'Desayuno' }, { meal: 'Almuerzo' }, { meal: 'Cena' }];
        const idx = getEatenSlotIndices(threeMeals, [{ meal_type: 'merienda', calories: 200 }]);
        expect(idx.size).toBe(0);
    });

    it('returns empty for empty/garbage inputs (fail-open)', () => {
        expect(getEatenSlotIndices([], [{ meal_type: 'desayuno', calories: 1 }]).size).toBe(0);
        expect(getEatenSlotIndices(FOUR_MEALS, []).size).toBe(0);
        expect(getEatenSlotIndices(null, null).size).toBe(0);
        expect(getEatenSlotIndices(FOUR_MEALS, [{ meal_type: 'bogus', calories: 1 }]).size).toBe(0);
    });
});

describe('getEatenSlotIndices — REGLA DE AMBIGÜEDAD (el corazón del fix)', () => {
    const TWO_MERIENDAS = [
        { meal: 'Desayuno' }, { meal: 'Almuerzo' }, { meal: 'Merienda AM' }, { meal: 'Merienda PM' }, { meal: 'Cena' },
    ];

    it('attributes nothing when 2 slots share a canonical key and only 1 diary row matches', () => {
        const idx = getEatenSlotIndices(TWO_MERIENDAS, [{ meal_type: 'merienda', calories: 150 }]);
        expect(idx.size).toBe(0);
    });

    it('ambiguity on merienda does not block an unambiguous match on desayuno in the SAME day', () => {
        const idx = getEatenSlotIndices(TWO_MERIENDAS, [
            { meal_type: 'desayuno', calories: 400 },
            { meal_type: 'merienda', calories: 150 },
        ]);
        expect([...idx]).toEqual([0]);
    });

    it('3 meriendas (6-meal plan), 1 diary row → still attributes nothing', () => {
        const threeMeriendas = [
            { meal: 'Desayuno' }, { meal: 'Merienda AM' }, { meal: 'Almuerzo' },
            { meal: 'Merienda PM' }, { meal: 'Cena' }, { meal: 'Merienda Nocturna' },
        ];
        // 'merienda nocturna' NO está en el mapa canónico de constants.py
        // (a propósito — ver constants.py::_SLOT_CANON_MAP) así que solo AM/PM
        // colisionan en la key 'merienda'; igual es ambiguo (2, no 1).
        const idx = getEatenSlotIndices(threeMeriendas, [{ meal_type: 'merienda', calories: 150 }]);
        expect(idx.size).toBe(0);
    });
});

describe('sumConsumedCalories — nunca depende de la atribución', () => {
    it('sums raw diary calories regardless of ambiguity', () => {
        expect(sumConsumedCalories([{ calories: 150 }, { calories: 400 }])).toBe(550);
    });

    it('treats missing/non-numeric calories as 0 (fail-open)', () => {
        expect(sumConsumedCalories([{ calories: null }, { calories: 'x' }, {}])).toBe(0);
        expect(sumConsumedCalories(null)).toBe(0);
        expect(sumConsumedCalories(undefined)).toBe(0);
    });
});

describe('eatenKcalForSlot', () => {
    it('sums only the rows matching the slot key (handles double-logging)', () => {
        const consumed = [
            { meal_type: 'desayuno', calories: 300 },
            { meal_type: 'desayuno', calories: 200 }, // corrección/duplicado del mismo slot
            { meal_type: 'almuerzo', calories: 700 },
        ];
        expect(eatenKcalForSlot(consumed, 'Desayuno')).toBe(500);
        expect(eatenKcalForSlot(consumed, 'Almuerzo')).toBe(700);
        expect(eatenKcalForSlot(consumed, 'Cena')).toBe(0);
    });

    it('returns 0 for an unrecognized slot label', () => {
        expect(eatenKcalForSlot([{ meal_type: 'desayuno', calories: 300 }], 'Suplemento')).toBe(0);
    });
});
