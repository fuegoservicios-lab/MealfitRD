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
    sumPlannedRemainingCalories,
    eatenKcalForSlot,
    eatenNamesForSlot,
    joinNamesEsDo,
    eatenChipLabel,
    eatenClaimForSlot,
    todayRemainingLine,
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

// [P1-REMAINING-LINE-HONEST · 2026-07-28] La tercera cantidad que la línea
// "Te quedan…" necesitaba: cuánto suman en kcal los slots del plan de HOY
// que TODAVÍA no se registraron. Antes de este fix la línea solo tenía el
// presupuesto (`remainingKcal`) y el CONTEO de comidas (`remainingCount`) —
// leyendo la frase como si el conteo llevara las kcal del presupuesto.
describe('sumPlannedRemainingCalories', () => {
    const FOUR_MEALS = [
        { meal: 'Desayuno', cals: 500 },
        { meal: 'Almuerzo', cals: 813 },
        { meal: 'Merienda', cals: 471 },
        { meal: 'Cena', cals: 500 },
    ];

    it('sums only the meals whose index is NOT in eatenIndices (production case: 813+471=1284)', () => {
        const eaten = new Set([0, 3]); // Desayuno y Cena ya registrados.
        expect(sumPlannedRemainingCalories(FOUR_MEALS, eaten)).toBe(1284);
    });

    it('sums everything when nothing was eaten (empty Set)', () => {
        expect(sumPlannedRemainingCalories(FOUR_MEALS, new Set())).toBe(500 + 813 + 471 + 500);
    });

    it('excludes supplement entries from the sum, same rule as the neighboring remainingCount', () => {
        const withSupplement = [
            ...FOUR_MEALS,
            { meal: 'Suplemento', cals: 9999 },
        ];
        expect(sumPlannedRemainingCalories(withSupplement, new Set())).toBe(500 + 813 + 471 + 500);
        // Sabotage check (documented, not executed): dropping the
        // `.toLowerCase().includes('suplemento')` guard would make this sum
        // 9999 kcal higher — this assertion is the one that would fire.
    });

    it('AMBIGUITY RULE parity: when getEatenSlotIndices attributes nothing, the planned sum still makes sense (= full sum)', () => {
        const twoMeriendas = [
            { meal: 'Desayuno', cals: 400 },
            { meal: 'Almuerzo', cals: 700 },
            { meal: 'Merienda AM', cals: 150 },
            { meal: 'Merienda PM', cals: 200 },
            { meal: 'Cena', cals: 550 },
        ];
        // Una sola fila 'merienda' con 2 slots candidatos → ambigua, nada se atribuye.
        const eaten = getEatenSlotIndices(twoMeriendas, [{ meal_type: 'merienda', calories: 150 }]);
        expect(eaten.size).toBe(0);
        expect(sumPlannedRemainingCalories(twoMeriendas, eaten)).toBe(400 + 700 + 150 + 200 + 550);
    });

    it('a meal with missing/NaN cals contributes 0, never poisons the sum with NaN', () => {
        const dirty = [
            { meal: 'Desayuno', cals: 500 },
            { meal: 'Almuerzo', cals: undefined },
            { meal: 'Merienda' /* sin cals */ },
            { meal: 'Cena', cals: 'no-es-un-numero' },
        ];
        const total = sumPlannedRemainingCalories(dirty, new Set());
        expect(total).toBe(500);
        expect(Number.isNaN(total)).toBe(false);
    });

    it('fail-open on garbage inputs', () => {
        expect(sumPlannedRemainingCalories([], new Set())).toBe(0);
        expect(sumPlannedRemainingCalories(null, new Set())).toBe(0);
        expect(sumPlannedRemainingCalories(FOUR_MEALS, null)).toBe(500 + 813 + 471 + 500);
    });
});

// Misma llamada que usa `todayRemainingLine` internamente — así la
// aserción no depende de qué locale ICU tenga el runtime que corre el test
// (Node small-icu formatea "1,284" en vez de "1.284"; un browser con
// full-icu sí da "1.284" — mismo gotcha documentado en
// Dashboard.today_remaining.test.jsx::_fmtKcal).
const _fmt = (n) => Math.round(n).toLocaleString('es-DO');

// [P1-REMAINING-LINE-HONEST · 2026-07-28] La copia de la línea "Te
// quedan…" — pinea la ARITMÉTICA además del texto, así una regresión que
// vuelva a fundir presupuesto y planificado en una sola cifra se detecta
// aquí, no solo en el DOM del Dashboard.
describe('todayRemainingLine', () => {
    it('EXACT PRODUCTION CASE: 460 budget, 1.284 planned → reports both AND the ~824 overshoot', () => {
        const line = todayRemainingLine({ remainingKcal: 460, plannedKcal: 1284, remainingCount: 2 });
        expect(line).toContain(_fmt(460));
        expect(line).toContain(_fmt(1284));
        expect(line).toContain(_fmt(824)); // 1284 - 460
        expect(line).toContain('2 comidas del plan');
        // La frase vieja fundía las dos cifras con "en" — no debe reaparecer.
        expect(line).not.toMatch(new RegExp(`${_fmt(460)} kcal estimadas en 2 comidas`));
    });

    it('fitting case (planned <= budget) reads without alarm — no "por encima"/"superaste"', () => {
        const line = todayRemainingLine({ remainingKcal: 2500, plannedKcal: 1500, remainingCount: 3 });
        expect(line).toContain(_fmt(2500));
        expect(line).toContain(_fmt(1500));
        expect(line).toContain('3 comidas del plan');
        expect(line).not.toMatch(/por encima|superaste/);
    });

    it('exact-fit boundary (planned === budget) counts as "fits", not "exceeds"', () => {
        const line = todayRemainingLine({ remainingKcal: 1500, plannedKcal: 1500, remainingCount: 3 });
        expect(line).not.toMatch(/por encima|superaste/);
        expect(line).toContain(_fmt(1500));
    });

    it('already-over case (negative remainingKcal) reports the overshoot, never "0 kcal"', () => {
        const line = todayRemainingLine({ remainingKcal: -200, plannedKcal: 1500, remainingCount: 3 });
        expect(line).toMatch(/superaste/i);
        expect(line).toContain(_fmt(200)); // -(-200)
        // El clamp `Math.max(0, …)` pre-fix habría dejado `remainingKcal=0`
        // aquí — este es el string literal que produciría, no debe aparecer.
        expect(line).not.toMatch(/~0 kcal estimadas de presupuesto/);
        expect(line).toContain('3 comidas del plan');
    });

    it('remainingKcal null (plan sin calories numérico) reports only what is planned, no comparison', () => {
        const line = todayRemainingLine({ remainingKcal: null, plannedKcal: 1284, remainingCount: 2 });
        expect(line).toContain(_fmt(1284));
        expect(line).toContain('2 comidas del plan');
        expect(line).not.toMatch(/por encima|superaste/);
    });

    it('singular "1 comida" / "suma" agreement (not "1 comidas" / "suman")', () => {
        const line = todayRemainingLine({ remainingKcal: 500, plannedKcal: 300, remainingCount: 1 });
        expect(line).toContain('1 comida del plan');
        expect(line).not.toContain('1 comidas');
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
