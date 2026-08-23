/**
 * [P3-I18N-MONEDA-COMPUESTA-A-MANO-EN-EL-PRESUPUESTO · 2026-08-23] El formulario componía el
 * símbolo a mano (`USD → 'US$'`, `DOP → 'RD$'`, lo demás `CODE + ' '`): para EUR/MXN/COP el
 * «símbolo» era el código ISO y los avisos decían «EUR 1.200» donde el francés escribe
 * «1 200 €». Ahora los importes pasan por `formatCurrency` y el adorno del input por
 * `currencySymbol`, los dos con el locale activo.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatCurrency, currencySymbol, loadLocale } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';

describe('[P3-I18N-MONEDA-COMPUESTA-A-MANO-EN-EL-PRESUPUESTO]', () => {
    afterEach(async () => { await loadLocale(DEFAULT_LOCALE); });

    it('EL CASO: 1200 EUR en francés es «1 200 €», no «EUR 1.200»', async () => {
        await loadLocale('fr-FR');
        const out = formatCurrency(1200, 'EUR', { maximumFractionDigits: 0 });
        expect(out).toMatch(/^1[\u00a0\u202f ]200[\u00a0\u202f ]€$/);
        expect(out).not.toContain('EUR');
        expect(currencySymbol('EUR')).toBe('€');
    });

    it('lo de siempre no cambia: RD$ y US$ en es-DO, $ en en-US', async () => {
        expect(formatCurrency(1200, 'DOP', { maximumFractionDigits: 0 })).toBe('RD$1,200');
        expect(formatCurrency(1200, 'USD', { maximumFractionDigits: 0 })).toBe('US$1,200');
        expect(currencySymbol('DOP')).toBe('RD$');
        expect(currencySymbol('USD')).toBe('US$');
        await loadLocale('en-US');
        expect(formatCurrency(1200, 'USD', { maximumFractionDigits: 0 })).toBe('$1,200');
        expect(currencySymbol('USD')).toBe('$');
    });

    it('un código desconocido degrada al código, no revienta', () => {
        expect(currencySymbol('XXX')).toBeTruthy();
        expect(formatCurrency('abc', 'EUR')).toBe('');
    });

    it('QBudget ya no compone el símbolo a mano ni interpola {simbolo}{monto}', () => {
        const src = readFileSync(resolve(__dirname, '../components/assessment/questions/QBudget.jsx'), 'utf8');
        expect(src).not.toMatch(/\{simbolo\}\{monto\}/);
        expect(src).not.toMatch(/effectiveCurrency === 'USD' \? 'US\$'/);
        expect(src).toMatch(/currencySymbolFor\(effectiveCurrency\)/);
        expect(src).toMatch(/formatCurrency\(v, effectiveCurrency/);
    });
});
