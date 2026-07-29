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
    eatenNamesForSlot,
    joinNamesEsDo,
    eatenChipLabel,
    eatenClaimForSlot,
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

// [P1-EATEN-SLOT-COPY · 2026-07-28] "visualmente no debería decir que ya
// comí esto, ya que en realidad comí otra cosa" (owner). El matcher empareja
// por SLOT (`meal_type`), nunca por nombre de plato — la COPIA no puede
// afirmar más de lo que el sistema sabe. Estos tests anclan el contrato
// NUEVO; cada uno se pondría rojo si alguien revirtiera a la frase vieja
// ("Ya comiste esto" / kcal en el chip / nombre del plan en el tooltip).
describe('eatenChipLabel — el chip SOLO nombra el slot, nunca un plato', () => {
    it('never says "esto" — la copia vieja apuntaba al plato mostrado', () => {
        for (const slot of ['Desayuno', 'Almuerzo', 'Cena', 'Merienda AM']) {
            expect(eatenChipLabel(slot)).not.toMatch(/esto/i);
        }
    });

    it('names the canonical slot noun', () => {
        expect(eatenChipLabel('Desayuno')).toBe('Ya registraste tu desayuno');
        expect(eatenChipLabel('Almuerzo')).toBe('Ya registraste tu almuerzo');
        expect(eatenChipLabel('Cena')).toBe('Ya registraste tu cena');
        expect(eatenChipLabel('Merienda PM')).toBe('Ya registraste tu merienda');
    });

    it('falls back to "comida" for an unrecognized slot label (fail-open, never crashes)', () => {
        expect(eatenChipLabel('Suplemento')).toBe('Ya registraste tu comida');
    });
});

describe('eatenNamesForSlot / joinNamesEsDo — el nombre viene SIEMPRE del diario, nunca del plan', () => {
    it('returns the meal_name of the single matching diary row', () => {
        const consumed = [{ meal_type: 'desayuno', meal_name: 'Mangú con Los Tres Golpes', calories: 750 }];
        expect(eatenNamesForSlot(consumed, 'Desayuno')).toEqual(['Mangú con Los Tres Golpes']);
    });

    it('joins multiple matched rows (double-logging) en vez de elegir una a ciegas', () => {
        const consumed = [
            { meal_type: 'desayuno', meal_name: 'Mangú', calories: 300 },
            { meal_type: 'desayuno', meal_name: 'Huevos fritos', calories: 200 },
        ];
        expect(eatenNamesForSlot(consumed, 'Desayuno')).toEqual(['Mangú', 'Huevos fritos']);
        expect(joinNamesEsDo(['Mangú', 'Huevos fritos'])).toBe('Mangú y Huevos fritos');
        expect(joinNamesEsDo(['A', 'B', 'C'])).toBe('A, B y C');
        expect(joinNamesEsDo(['A'])).toBe('A');
        expect(joinNamesEsDo([])).toBe('');
    });

    it('ignores blank/missing meal_name (fail-open)', () => {
        expect(eatenNamesForSlot([{ meal_type: 'desayuno', calories: 300 }], 'Desayuno')).toEqual([]);
        expect(eatenNamesForSlot([{ meal_type: 'desayuno', meal_name: '  ', calories: 300 }], 'Desayuno')).toEqual([]);
    });
});

describe('eatenClaimForSlot — caso real del owner: el plan prescribe una cosa, el diario registra otra', () => {
    // Plan: "Tostadas Francesas con Mantequilla de Maní y Lechosa" (slot
    // Desayuno). Diario: "Mangú con Los Tres Golpes" en ESE MISMO slot. El
    // tooltip debe nombrar lo que el diario trae, JAMÁS el plato del plan —
    // si alguien vuelve a leer `meal.name` en vez del diario, este test se
    // pone rojo.
    const _PLANNED_DISH_NAME = 'Tostadas Francesas con Mantequilla de Maní y Lechosa';
    const _LOGGED = [{ meal_type: 'desayuno', meal_name: 'Mangú con Los Tres Golpes', calories: 750 }];

    it('names the LOGGED item, never the planned dish name', () => {
        const claim = eatenClaimForSlot(_LOGGED, 'Desayuno', 'unlock');
        expect(claim).toContain('Mangú con Los Tres Golpes');
        expect(claim).not.toContain(_PLANNED_DISH_NAME);
    });

    it('names the slot and frames kcal as an estimate (~)', () => {
        const claim = eatenClaimForSlot(_LOGGED, 'Desayuno', 'unlock');
        expect(claim).toContain('desayuno');
        expect(claim).toContain('~750 kcal');
    });

    it('never contains "esto", regardless of cta variant', () => {
        expect(eatenClaimForSlot(_LOGGED, 'Desayuno', 'unlock')).not.toMatch(/esto/i);
        expect(eatenClaimForSlot(_LOGGED, 'Desayuno', 'info')).not.toMatch(/esto/i);
    });

    it('cta="unlock" (Dashboard: controles REALMENTE deshabilitados) lleva el escape hatch y "desbloquear"', () => {
        const claim = eatenClaimForSlot(_LOGGED, 'Desayuno', 'unlock');
        expect(claim).toContain('Progreso en Tiempo Real');
        expect(claim).toMatch(/desbloquear/i);
    });

    it('cta="info" (Recetas: solo lectura) lleva el mismo escape hatch SIN afirmar que algo está bloqueado', () => {
        const claim = eatenClaimForSlot(_LOGGED, 'Desayuno', 'info');
        expect(claim).toContain('Progreso en Tiempo Real');
        expect(claim).not.toMatch(/desbloquear/i);
    });

    it('cta="none" devuelve la frase sola, sin CTA', () => {
        const claim = eatenClaimForSlot(_LOGGED, 'Desayuno', 'none');
        expect(claim).not.toContain('Progreso en Tiempo Real');
    });

    it('cae a "algo" cuando la fila del diario no trae nombre (nunca inventa uno, nunca revienta)', () => {
        const claim = eatenClaimForSlot([{ meal_type: 'desayuno', calories: 500 }], 'Desayuno', 'unlock');
        expect(claim).toContain('algo');
        expect(claim).toContain('~500 kcal');
    });

    it('omite el paréntesis de kcal cuando kcal es 0 (nunca afirma "~0 kcal")', () => {
        const claim = eatenClaimForSlot([{ meal_type: 'desayuno', meal_name: 'Café solo', calories: 0 }], 'Desayuno', 'unlock');
        expect(claim).not.toMatch(/~0 kcal/);
        expect(claim).toContain('Café solo');
    });
});
