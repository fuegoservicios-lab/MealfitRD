// [P1-BUDGET-INPUT-HARDEN · 2026-07-09] El monto custom del step de presupuesto (QBudget) usa
// `type=number`, que acepta `e`/`+`/`-`/`.` y valores absurdos por teclado o paste. `sanitizeBudgetAmount`
// lo blinda a un ENTERO de dígitos capeado, para que el backend nunca reciba un budgetAmount inválido y el
// gate de piso (validateExtra) compare contra un número limpio.
import { describe, it, expect } from 'vitest';
import { sanitizeBudgetAmount, BUDGET_AMOUNT_MAX } from '../components/assessment/questions/InteractiveQuestions';

describe('sanitizeBudgetAmount', () => {
    it('conserva enteros planos', () => {
        expect(sanitizeBudgetAmount('5000')).toBe('5000');
        expect(sanitizeBudgetAmount('20800')).toBe('20800');
    });

    it('quita separadores de miles pegados (caso paste de la referencia "20,800")', () => {
        expect(sanitizeBudgetAmount('20,800')).toBe('20800');
        expect(sanitizeBudgetAmount('5,000')).toBe('5000');
    });

    it('descarta signos/exponentes/símbolos de moneda/letras', () => {
        expect(sanitizeBudgetAmount('-5000')).toBe('5000');
        expect(sanitizeBudgetAmount('+5000')).toBe('5000');
        expect(sanitizeBudgetAmount('RD$5000')).toBe('5000');
        expect(sanitizeBudgetAmount('abc')).toBe('');
    });

    it('quita ceros a la izquierda pero conserva un 0 solo', () => {
        expect(sanitizeBudgetAmount('007')).toBe('7');
        expect(sanitizeBudgetAmount('0')).toBe('0');
    });

    it('vacío/nullish → string vacío (no NaN, no null)', () => {
        expect(sanitizeBudgetAmount('')).toBe('');
        expect(sanitizeBudgetAmount(null)).toBe('');
        expect(sanitizeBudgetAmount(undefined)).toBe('');
    });

    it('capea valores absurdos a BUDGET_AMOUNT_MAX (anti fat-finger/overflow)', () => {
        const capped = sanitizeBudgetAmount('999999999999');
        expect(Number(capped)).toBe(BUDGET_AMOUNT_MAX);
        expect(Number(capped)).toBeLessThanOrEqual(BUDGET_AMOUNT_MAX);
    });

    it('el resultado SIEMPRE es un entero válido o vacío (contrato para Number())', () => {
        for (const raw of ['5000', '20,800', '-3', 'abc', '1e5', '', '007', '99999999999999']) {
            const out = sanitizeBudgetAmount(raw);
            expect(out === '' || /^\d+$/.test(out)).toBe(true);
            if (out !== '') expect(Number.isFinite(Number(out))).toBe(true);
        }
    });
});
