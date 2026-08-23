/**
 * [P3-I18N-3C-CLAVADO · 2026-08-23] `t('3°C · Frío Max')` salía «3°C · Max Cold» a un
 * público imperial. La escala es una UNIDAD, no copy: la decide el usuario (su `weightUnit`,
 * la señal imperial que el formulario ya tiene) y, si no eligió, el idioma (en-US).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatTemperature, loadLocale } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';

describe('[P3-I18N-3C-CLAVADO] formatTemperature', () => {
    afterEach(async () => { await loadLocale(DEFAULT_LOCALE); });

    it('un usuario en libras ve Fahrenheit, sea cual sea el idioma', async () => {
        await loadLocale('fr-FR');
        expect(formatTemperature(3, { weightUnit: 'lb' })).toBe('37°F');
    });

    it('un usuario en kilos ve Celsius, incluso en inglés', async () => {
        await loadLocale('en-US');
        expect(formatTemperature(3, { weightUnit: 'kg' })).toBe('3°C');
    });

    it('sin elección: en-US cae a Fahrenheit y el resto a Celsius', async () => {
        await loadLocale('en-US');
        expect(formatTemperature(3)).toBe('37°F');
        for (const loc of [DEFAULT_LOCALE, 'fr-FR', 'pt-BR', 'it-IT']) {
            await loadLocale(loc);
            expect(formatTemperature(3), loc).toBe('3°C');
        }
        expect(formatTemperature('x')).toBe('');
    });

    it('la Nevera pasa la temperatura por el helper y la clave ya no lleva el grado clavado', () => {
        const src = readFileSync(resolve(__dirname, '../pages/Pantry.jsx'), 'utf8');
        expect(src).not.toMatch(/t\('3°C · Frío Max'\)/);
        expect((src.match(/formatTemperature\(3, \{ weightUnit: formData\?\.weightUnit \}\)/g) || []).length).toBe(2);
    });
});
