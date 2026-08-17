/** [P1-COUNTRY-SYSTEM-F2 · 2026-08-17] Task 2 — preselección por zona IANA (Addendum §4
 *  del dueño, spec 2026-08-16-sistema-paises-design.md). `countryFromTimeZone` traduce el
 *  NOMBRE de la zona horaria del navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
 *  a un país — JAMÁS el offset: RD y Puerto Rico comparten -240 los 365 días del año, así
 *  que un mapeo por offset los confundiría por diseño (la razón exacta que el Addendum cita
 *  para prohibirlo). SIEMPRE devuelve un código — 'DO' fail-safe para lo desconocido/ausente,
 *  mismo espíritu que `coerceCountry`.
 */
import { describe, it, expect } from 'vitest';
import { countryFromTimeZone, DEFAULT_COUNTRY } from '../config/countries';

describe('countryFromTimeZone — Addendum §4 (preselección IANA)', () => {
    it('zonas exactas de un solo país (DO/PR/ES/CO)', () => {
        const casos = {
            'America/Santo_Domingo': 'DO',
            'America/Puerto_Rico': 'PR',
            'Europe/Madrid': 'ES',
            'Atlantic/Canary': 'ES',
            'America/Bogota': 'CO',
        };
        for (const [tz, code] of Object.entries(casos)) {
            expect(countryFromTimeZone(tz)).toBe(code);
        }
    });

    it('las 11 zonas mexicanas del contrato ⇒ MX', () => {
        const mx = [
            'America/Mexico_City', 'America/Cancun', 'America/Merida',
            'America/Monterrey', 'America/Tijuana', 'America/Chihuahua',
            'America/Hermosillo', 'America/Mazatlan', 'America/Matamoros',
            'America/Ojinaga', 'America/Bahia_Banderas',
        ];
        for (const tz of mx) expect(countryFromTimeZone(tz)).toBe('MX');
    });

    it('las zonas continentales de EE.UU. + Alaska/Hawái ⇒ US', () => {
        const us = [
            'America/New_York', 'America/Chicago', 'America/Denver',
            'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage',
            'Pacific/Honolulu', 'America/Detroit', 'America/Boise',
        ];
        for (const tz of us) expect(countryFromTimeZone(tz)).toBe('US');
    });

    it('America/Indiana/* y America/Kentucky/* resuelven US por PREFIJO (no hay un nombre único)', () => {
        // Los condados de Indiana/Kentucky con historial de DST no uniforme no tienen
        // una zona IANA "canónica" única — el contrato pide prefix-match, no exact-match.
        for (const tz of [
            'America/Indiana/Indianapolis', 'America/Indiana/Knox', 'America/Indiana/Marengo',
            'America/Kentucky/Louisville', 'America/Kentucky/Monticello',
        ]) {
            expect(countryFromTimeZone(tz)).toBe('US');
        }
    });

    it('zona desconocida, basura, ausente o vacía ⇒ DO (fail-safe, mismo espíritu que coerceCountry)', () => {
        expect(DEFAULT_COUNTRY).toBe('DO');
        for (const tz of [
            'Asia/Tokyo', 'Europe/Paris', 'Europe/London', 'America/Sao_Paulo',
            'garbage', '', null, undefined,
            'America/Indiana', // el prefijo exige la barra final; el nombre "pelado" no es zona real
        ]) {
            expect(countryFromTimeZone(tz)).toBe('DO');
        }
    });

    it('JAMÁS por offset: la firma toma un NOMBRE de zona (string), un offset numérico u offset-like nunca resuelve a un país real', () => {
        // Alimentar exactamente lo que el Addendum prohíbe usar como entrada (minutos/horas
        // de offset, con o sin signo, como número o como string) debe caer al default — la
        // función no tiene NINGUNA rama que interprete un offset, así que ninguno de estos
        // puede accidentalmente "colisionar" con una zona real.
        for (const offsetish of ['-240', '240', '+240', 240, -240, 0, 'UTC-4', 'GMT-04:00', 'UTC+1']) {
            expect(countryFromTimeZone(offsetish)).toBe('DO');
        }
    });
});
