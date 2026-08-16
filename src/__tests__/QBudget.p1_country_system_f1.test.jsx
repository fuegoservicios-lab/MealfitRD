// [P1-COUNTRY-SYSTEM-F1 · 2026-08-16] `currencyOptionsForCountry` decide qué monedas
// ofrece el toggle de QBudget: PURA (sin AssessmentContext/fetch/i18n), así que se
// testea directo sin montar el componente — mismo patrón que `sanitizeBudgetAmount`
// (budget_input_harden.test.jsx importa el helper puro desde el barrel en vez de montar
// el step completo, porque QBudget depende de AssessmentContext/useBudgetFloor/useT).
//
// Ancla el contrato "dark ⇒ exactamente [DOP, USD]" del brief de Task 6 sin necesitar
// VITE_COUNTRY_SYSTEM en el entorno de test: `countrySystemUI` se pasa como argumento
// explícito, no se lee de `import.meta.env` dentro del helper.
import { describe, it, expect } from 'vitest';
import { currencyOptionsForCountry, BETA_CURRENCY_BY_COUNTRY } from '../components/assessment/questions/QBudget';

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
