// [P1-PLAN-LOTE-656 · 2026-09-27] (G82) Un solo símbolo para la moneda del presupuesto, en cualquier idioma.
//
// El formulario (QBudget) resolvía el símbolo con `Intl` del idioma activo y el Dashboard con `budgetCurrencySymbol`,
// ciego al idioma: en inglés el mismo peso dominicano salía «DOP» en un sitio y «RD$» en el otro. Ahora hay UN
// resolvedor: RD$ y US$ fijos (son los rótulos que el producto usa en todos los idiomas) y las monedas beta con el
// símbolo de `Intl` del idioma activo («€», «MX$»…), nunca el código pelado si el idioma tiene símbolo.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLocale } from '../i18n';
import { budgetCurrencySymbol } from '../config/formValidation';

afterEach(async () => { await loadLocale('es-DO'); });

describe('[656] el símbolo de la moneda del presupuesto', () => {
    it('RD$ y US$ en todos los idiomas', async () => {
        for (const loc of ['es-DO', 'en-US', 'fr-FR', 'pt-BR', 'it-IT']) {
            await loadLocale(loc);
            expect(budgetCurrencySymbol('DOP')).toBe('RD$');
            expect(budgetCurrencySymbol('USD')).toBe('US$');
        }
    });

    it('el euro con su símbolo en inglés y francés', async () => {
        await loadLocale('en-US');
        expect(budgetCurrencySymbol('EUR')).toBe('€');
        await loadLocale('fr-FR');
        expect(budgetCurrencySymbol('EUR')).toBe('€');
    });

    it('el formulario usa el MISMO resolvedor que el Dashboard', () => {
        const q = readFileSync(resolve(__dirname, '../components/assessment/questions/QBudget.jsx'), 'utf8');
        expect(q).toContain('budgetCurrencySymbol(effectiveCurrency)');
        expect(q).not.toContain('currencySymbolFor(effectiveCurrency)');
    });
});
