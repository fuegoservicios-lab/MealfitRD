/**
 * [P2-I18N-PLAN-TOASTS-ERROR-MESSAGE · 2026-08-23] Los 8 avisos de la pantalla de
 * generación pintaban español del servidor bajo un título traducido: cada rama de error
 * de `Plan.jsx` hacía `new Error(body.detail || t('…'))`, y el `detail` del backend —siempre
 * en español— GANABA al fallback traducido. La toast después pinta `error.message`.
 *
 * Ahora las 8 ramas pasan por `mensajeDeError(body, fallbackTraducido, t)`: copy por código
 * si lo hay, si no el fallback traducido; el crudo se loggea y nunca se pinta. Y el código
 * `too_many_medical_conditions` gana su copy, que necesita un DATO del servidor (`max`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadLocale, t } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';
import { mensajeDeError, CODIGOS_CON_COPY } from '../utils/errorCopy';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('[P2-I18N-PLAN-TOASTS-ERROR-MESSAGE] mensajeDeError con el detail de la generación', () => {
    beforeEach(async () => { await loadLocale('fr-FR'); vi.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(async () => { await loadLocale(DEFAULT_LOCALE); vi.restoreAllMocks(); });

    it('EL CASO: un 422 de condiciones médicas sale en francés con el cap interpolado, no el español del servidor', () => {
        const body = { detail: { code: 'too_many_medical_conditions', max: 3,
            message: 'Para garantizar la calidad clínica del plan, selecciona máximo 3 condiciones prioritarias.' } };
        const out = mensajeDeError(body, t('Revisa los datos del formulario.'), t);
        expect(out).toContain('3 conditions prioritaires');
        expect(out).not.toContain('Para garantizar');
        expect(out).not.toContain('{max}');
    });

    it('el cap viene del servidor: con max=5 dice 5, y sin max cae a 3', () => {
        expect(mensajeDeError({ detail: { code: 'too_many_medical_conditions', max: 5 } }, 'x', t)).toContain('5 conditions');
        expect(mensajeDeError({ detail: { code: 'too_many_medical_conditions' } }, 'x', t)).toContain('3 conditions');
    });

    it('un detail STRING español sin código (rechazo crítico) no llega al usuario: gana el fallback traducido', () => {
        const body = { detail: 'Rechazado: el plan incluye Pollo y declaraste alergia.' };
        const out = mensajeDeError(body, t('Revisa tus restricciones declaradas.'), t);
        expect(out).toBe(t('Revisa tus restricciones declaradas.'));
        expect(out).not.toContain('Rechazado');
        expect(console.error).toHaveBeenCalled(); // el crudo queda en consola para el desarrollador
    });

    it('un detail dict con message español y código sin copy (pipeline_already_running) cae al fallback traducido', () => {
        const body = { detail: { code: 'pipeline_already_running', message: 'Ya hay un plan generándose.', started_at: 'x' } };
        expect(mensajeDeError(body, t('Ya hay un plan generándose.'), t)).toBe('Un plan est déjà en cours de génération.');
    });

    it('las 12 entradas previas siguen funcionando con el contrato ampliado (t, detail)', () => {
        for (const code of CODIGOS_CON_COPY) {
            const out = mensajeDeError({ error_code: code }, 'fallback', t);
            expect(typeof out).toBe('string');
            expect(out.length).toBeGreaterThan(5);
            expect(out).not.toBe('fallback');
        }
    });

    it('las 8 ramas de Plan.jsx construyen el Error con mensajeDeError — ninguna con `detail ||`', () => {
        const src = readFileSync(resolve(__dirname, '../pages/Plan.jsx'), 'utf8');
        // La forma del defecto: el detail del servidor como primer operando de un `||`.
        expect(src).not.toMatch(/new Error\(\s*body\??\.detail\s*\|\|/);
        expect(src).not.toMatch(/new Error\(\s*detail\s*\|\|/);
        expect(src).not.toMatch(/_detail\.message\s*\|\|\s*t\(/);
        expect(src).not.toMatch(/body\.detail\.message\)\s*\|\|\s*t\(/);
        expect(src).not.toMatch(/typeof parsedDetail === 'string' \? parsedDetail/);
        const usos = (src.match(/new Error\(mensajeDeError\(/g) || []).length
            + (src.match(/_msg = mensajeDeError\(/g) || []).length
            + (src.match(/const msg = mensajeDeError\(/g) || []).length;
        expect(usos, 'las 8 ramas pasan por mensajeDeError').toBeGreaterThanOrEqual(8);
    });
});
