/** [P1-COUNTRY-SYSTEM-F0] El SSOT frontend de países espeja al backend.
 *  El `code` es el dato del motor; `labelKey` es texto español que i18n traduce. */
import { describe, it, expect } from 'vitest';
import { COUNTRIES, DEFAULT_COUNTRY, coerceCountry, COUNTRY_SYSTEM_UI } from '../config/countries';

describe('countries SSOT', () => {
    it('seis países, DO primero y no-beta, resto beta', () => {
        expect(COUNTRIES.map((c) => c.code)).toEqual(['DO', 'ES', 'US', 'MX', 'PR', 'CO']);
        expect(COUNTRIES[0].beta).toBe(false);
        for (const c of COUNTRIES.slice(1)) expect(c.beta).toBe(true);
    });
    it('coerce: desconocido/ausente cae a DO', () => {
        expect(DEFAULT_COUNTRY).toBe('DO');
        for (const raw of [null, undefined, '', 'xx', 'República Dominicana', 42]) {
            expect(coerceCountry(raw)).toBe('DO');
        }
        expect(coerceCountry('es')).toBe('ES');
        expect(coerceCountry('PR')).toBe('PR');
    });
    it('los labels son claves de texto, jamás el dato', () => {
        for (const c of COUNTRIES) {
            expect(c.code).toMatch(/^[A-Z]{2}$/);
            expect(c.labelKey.length).toBeGreaterThan(3);
        }
    });
    it('la bandera de UI nace apagada sin la env', () => {
        // En el runner vitest VITE_COUNTRY_SYSTEM no está definida.
        expect(COUNTRY_SYSTEM_UI).toBe(false);
    });
});
