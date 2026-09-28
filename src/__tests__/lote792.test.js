// [P1-PLAN-LOTE-792 · 2026-09-28] (G13) Pisos con fuente (Banco Mundial, CoHD_LCU) y el aviso-en-vez-de-bloqueo
// decidido por el PAÍS DE MERCADO, no por la moneda. Espejo del backend (test_p1_plan_lote_792.py).
import { describe, expect, it } from 'vitest';
import { pisoSoloOrienta } from '../config/countries';
import { effectiveBudgetCurrency, minBudgetFor } from '../config/formValidation';

describe('lote 792 · el piso orienta en mercado beta, bloquea en mercado con precios', () => {
    it('US y PR (beta, lista sin precios) sólo orientan', () => {
        expect(pisoSoloOrienta('US', true)).toBe(true);
        expect(pisoSoloOrienta('PR', true)).toBe(true);
        expect(pisoSoloOrienta('CO', true)).toBe(true);
    });

    it('RD, o sin país (mercado DO), bloquea: el visitante de EE. UU. en RD incluido', () => {
        expect(pisoSoloOrienta('DO', true)).toBe(false);
        expect(pisoSoloOrienta(undefined, true)).toBe(false);
        expect(pisoSoloOrienta('ZZ', true)).toBe(false);
    });

    it('con el sistema de países apagado nada cambia: el mercado es DO', () => {
        expect(pisoSoloOrienta('US', false)).toBe(false);
        expect(pisoSoloOrienta('CO', false)).toBe(false);
    });
});

describe('lote 792 · los pisos del método (×7 × 4,286; ×1,75 a 15 d y ×3,25 a 30 d)', () => {
    it.each([
        ['EUR', 75, 131, 244],
        ['MXN', 1500, 2625, 4875],
        ['COP', 240000, 420000, 780000],
        ['USD', 80, 140, 260],
        ['DOP', 4000, 7000, 13000],
    ])('%s', (moneda, semana, quincena, mes) => {
        expect(minBudgetFor(moneda, 'weekly')).toBe(semana);
        expect(minBudgetFor(moneda, 'biweekly')).toBe(quincena);
        expect(minBudgetFor(moneda, 'monthly')).toBe(mes);
    });
});

// [P1-PLAN-LOTE-792 · ronda 1 de revisión] La moneda VIGENTE la resuelven los dos lados con la MISMA regla. El backend
// (`constants.effective_budget_currency`) se la aplicaba al 422 con el crudo: quien pasaba de CO a DO en
// Configuración veía RD$200.000 aquí y recibía allí «mínimo ~COP 252,000». Esta tabla es la del backend
// (test_p1_plan_lote_792.py::_TABLA_MONEDA) y el backend exige que coincidan fila por fila.
// (sistema de países, país, budgetCurrency crudo, moneda vigente)
const TABLA_MONEDA = [
    [true, 'DO', 'COP', 'DOP'], [true, 'DO', 'USD', 'USD'], [true, 'DO', 'DOP', 'DOP'], [true, 'DO', '', 'DOP'],
    [true, 'CO', 'COP', 'COP'], [true, 'CO', 'EUR', 'COP'], [true, 'CO', 'DOP', 'DOP'], [true, 'CO', null, 'COP'],
    [true, 'ES', '', 'EUR'], [true, 'MX', 'EUR', 'MXN'], [true, 'US', 'EUR', 'USD'], [true, 'PR', 'COP', 'USD'],
    [true, null, 'EUR', 'DOP'], [true, 'ZZ', 'MXN', 'DOP'],
    [false, 'ES', 'EUR', 'DOP'], [false, 'CO', 'COP', 'DOP'], [false, 'US', 'USD', 'USD'], [false, 'ES', '', 'DOP'],
];

describe('lote 792 · la moneda vigente es la misma que resuelve el backend', () => {
    it.each(TABLA_MONEDA)('sistema=%s país=%s crudo=%s → %s', (sistema, pais, crudo, vigente) => {
        expect(effectiveBudgetCurrency(pais ?? undefined, crudo ?? undefined, sistema)).toBe(vigente);
    });
});
