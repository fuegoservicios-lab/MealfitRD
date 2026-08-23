// [P1-COUNTRY-SYSTEM-F1 · 2026-08-16] `currencyOptionsForCountry` decide qué monedas
// ofrece el toggle de QBudget; `effectiveBudgetCurrency` (fix-round 1, review) decide
// qué moneda está REALMENTE vigente para todo lo demás (símbolo, placeholder,
// aria-label, y — vía InteractiveAssessmentFlow.jsx/useBudgetFloor.js — el piso mismo).
// Ambas son PURAS (sin AssessmentContext/fetch/i18n), así que se testean directo sin
// montar ningún componente — mismo patrón que `sanitizeBudgetAmount`
// (budget_input_harden.test.jsx). Viven en config/formValidation.js (no en QBudget.jsx):
// InteractiveAssessmentFlow.jsx y useBudgetFloor.js también las consumen, y ambos ya
// importan de formValidation — importar un helper de moneda desde un componente de
// wizard hacia un hook/orquestador es la dirección de dependencia equivocada.
//
// [fix-round 1 · review] El bug real que esto cierra: budgetCurrency='EUR' puede
// persistir en formData (localStorage) con la bandera COUNTRY_SYSTEM_UI encendida, y
// luego la bandera puede apagarse (rollback) sin que budgetCurrency se limpie. Antes
// del fix, `currencySymbol` ya gateaba correctamente (recomputaba `betaCurrency` cada
// vez), pero `placeholder`/`aria-label` y los pisos de InteractiveAssessmentFlow.jsx/
// useBudgetFloor.js leían `budgetCurrency` crudo — con la bandera apagada seguían
// mostrando/comparando en EUR. `effectiveBudgetCurrency` es la ÚNICA puerta correcta.
import { describe, it, expect } from 'vitest';
import { currencyOptionsForCountry, BETA_CURRENCY_BY_COUNTRY, effectiveBudgetCurrency } from '../config/formValidation';

const DOP_USD = [
    { value: 'DOP', label: 'RD$' },
    { value: 'USD', label: 'US$' },
];

describe('P1-COUNTRY-SYSTEM-F1 · currencyOptionsForCountry', () => {
    it('dark (countrySystemUI=false) ⇒ EXACTAMENTE [DOP, USD] sin importar el país', () => {
        for (const country of ['DO', 'ES', 'US', 'MX', 'PR', 'CO', 'basura', undefined]) {
            const r = currencyOptionsForCountry(country, false);
            expect(r.betaCurrency).toBeUndefined();
            expect(r.options).toEqual(DOP_USD);
        }
    });

    it('lit + país beta con moneda propia ⇒ 3ª opción con el código de esa moneda', () => {
        expect(currencyOptionsForCountry('ES', true)).toEqual({
            betaCurrency: 'EUR',
            options: [...DOP_USD, { value: 'EUR', label: 'EUR' }],
        });
        expect(currencyOptionsForCountry('MX', true)).toEqual({
            betaCurrency: 'MXN',
            options: [...DOP_USD, { value: 'MXN', label: 'MXN' }],
        });
        expect(currencyOptionsForCountry('CO', true)).toEqual({
            betaCurrency: 'COP',
            options: [...DOP_USD, { value: 'COP', label: 'COP' }],
        });
    });

    it('lit + DO (nativo) ⇒ sigue siendo [DOP, USD] — DOP ya es su moneda', () => {
        const r = currencyOptionsForCountry('DO', true);
        expect(r.betaCurrency).toBeUndefined();
        expect(r.options).toEqual(DOP_USD);
    });

    it('lit + US/PR (ya usan USD) ⇒ sigue siendo [DOP, USD], SIN duplicar USD', () => {
        for (const country of ['US', 'PR']) {
            const r = currencyOptionsForCountry(country, true);
            expect(r.betaCurrency).toBeUndefined();
            expect(r.options).toEqual(DOP_USD);
            expect(r.options.filter((o) => o.value === 'USD')).toHaveLength(1);
        }
    });

    it('lit + país desconocido/ausente ⇒ coerceCountry cae a DO ⇒ [DOP, USD]', () => {
        for (const country of ['basura', undefined, null, '']) {
            const r = currencyOptionsForCountry(country, true);
            expect(r.betaCurrency).toBeUndefined();
            expect(r.options).toEqual(DOP_USD);
        }
    });

    it('minúsculas/espacios se normalizan igual que coerceCountry (case-insensitive)', () => {
        const r = currencyOptionsForCountry(' es ', true);
        expect(r.betaCurrency).toBe('EUR');
    });

    it('BETA_CURRENCY_BY_COUNTRY es EXACTAMENTE {ES:EUR, MX:MXN, CO:COP}', () => {
        expect(BETA_CURRENCY_BY_COUNTRY).toEqual({ ES: 'EUR', MX: 'MXN', CO: 'COP' });
    });
});

describe('P1-COUNTRY-SYSTEM-F1 · effectiveBudgetCurrency (fix-round 1)', () => {
    it('DOP/USD siempre pasan tal cual, sin importar país/bandera', () => {
        expect(effectiveBudgetCurrency('ES', 'DOP', true)).toBe('DOP');
        expect(effectiveBudgetCurrency('ES', 'USD', true)).toBe('USD');
        expect(effectiveBudgetCurrency(undefined, 'USD', false)).toBe('USD');
    });

    it('lit + país beta + moneda propia ⇒ la moneda pasa tal cual', () => {
        expect(effectiveBudgetCurrency('ES', 'EUR', true)).toBe('EUR');
        expect(effectiveBudgetCurrency('MX', 'MXN', true)).toBe('MXN');
        expect(effectiveBudgetCurrency('CO', 'COP', true)).toBe('COP');
    });

    it('[ESCENARIO DE ROLLBACK] EUR persistido en formData + bandera apagada ⇒ DOP', () => {
        // Reproduce el bug del review: el usuario eligió EUR con la bandera encendida,
        // budgetCurrency='EUR' sobrevive en formData/localStorage, la bandera vuelve a
        // apagarse (rollback) SIN que nadie limpie budgetCurrency.
        expect(effectiveBudgetCurrency('ES', 'EUR', false)).toBe('DOP');
        expect(effectiveBudgetCurrency('MX', 'MXN', false)).toBe('DOP');
        expect(effectiveBudgetCurrency('CO', 'COP', false)).toBe('DOP');
    });

    it('[P1-COUNTRY-BUDGET-CURRENCY-DEFAULT] moneda stale de otro país ⇒ default del país actual', () => {
        expect(effectiveBudgetCurrency('ES', 'MXN', true)).toBe('EUR');
        expect(effectiveBudgetCurrency('MX', 'COP', true)).toBe('MXN');
    });

    it('[P1-COUNTRY-BUDGET-CURRENCY-DEFAULT] moneda ajena ⇒ default de DO/US/PR', () => {
        expect(effectiveBudgetCurrency('DO', 'EUR', true)).toBe('DOP');
        expect(effectiveBudgetCurrency('US', 'EUR', true)).toBe('USD');
        expect(effectiveBudgetCurrency('PR', 'COP', true)).toBe('USD');
    });

    it('[P1-COUNTRY-BUDGET-CURRENCY-DEFAULT] moneda basura/ausente ⇒ default del país', () => {
        expect(effectiveBudgetCurrency('ES', 'XYZ', true)).toBe('EUR');
        expect(effectiveBudgetCurrency('ES', undefined, true)).toBe('EUR');
        expect(effectiveBudgetCurrency('CO', '', true)).toBe('COP');
    });

    it('país basura/ausente ⇒ coerceCountry cae a DO ⇒ DOP', () => {
        expect(effectiveBudgetCurrency('basura', 'EUR', true)).toBe('DOP');
        expect(effectiveBudgetCurrency(undefined, 'EUR', true)).toBe('DOP');
    });

    it('el 3er parámetro (countrySystemUI) es OPCIONAL — sin pasarlo, usa la bandera real del build (false en test)', () => {
        // El punto: los call sites de producción llaman con 2 argumentos
        // (país, budgetCurrency) — el 3ro es solo para tests.
        expect(effectiveBudgetCurrency('ES', 'EUR')).toBe('DOP');
        expect(effectiveBudgetCurrency('ES', 'DOP')).toBe('DOP');
    });
});
