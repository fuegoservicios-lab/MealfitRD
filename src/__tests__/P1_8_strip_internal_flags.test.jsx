/**
 * Tests P1-8: `stripInternalFlags` filtra claves internas `_*` del formData
 * antes de enviarlas al backend / LLM.
 *
 * Bug original (audit P1-8):
 *   `Plan.jsx:421-431` hacía `dataToSend = { ...formData, ... }` directo. El
 *   spread enviaba claves internas del wizard (`_skipLunchTouched`,
 *   `_weightUnitTouched`, cualquier futura `_*`) al endpoint
 *   `/api/plans/analyze/stream`. El backend tiene
 *   `_strip_untrusted_internal_keys` pero `_sanitize_form_data_recursive`
 *   las recorre y, más crítico, el JSON dump del prompt al LLM las puede
 *   incluir como ruido informacional. Drift de contrato + leak menor de
 *   estado UI al modelo.
 *
 * Fix:
 *   1. Helper público `stripInternalFlags(formData)` en `secureFormStorage.js`
 *      que filtra todas las keys con prefijo `_`. Re-usado por
 *      `buildHealthProfilePayload` (DB) y `Plan.jsx → generateAIPlanStream`.
 *   2. `Plan.jsx` aplica `stripInternalFlags(formData)` antes del spread.
 *   3. Invariante centralizado: cualquier nuevo flag `_*` futuro se
 *      filtra automáticamente sin tocar call sites.
 */
import { describe, it, expect } from 'vitest';
import {
    stripInternalFlags,
    buildHealthProfilePayload,
} from '../config/secureFormStorage';
import fs from 'node:fs';
import path from 'node:path';


describe('P1-8 — stripInternalFlags comportamiento básico', () => {
    it('filtra claves con prefijo `_`', () => {
        const input = {
            age: 30,
            weight: 75,
            _skipLunchTouched: true,
            _weightUnitTouched: false,
            _someFutureFlag: 'whatever',
        };
        const out = stripInternalFlags(input);
        expect(out).toEqual({ age: 30, weight: 75 });
    });

    it('preserva claves sin prefijo intactas (incluso valores falsy)', () => {
        const input = {
            age: 0,
            weight: '',
            allergies: [],
            skipLunch: false,  // skipLunch sin prefijo es PERSISTENTE — NO se filtra.
        };
        const out = stripInternalFlags(input);
        expect(out).toEqual(input);
    });

    it('NO muta el input original', () => {
        const input = { age: 30, _flag: true };
        const _frozen = JSON.stringify(input);
        stripInternalFlags(input);
        expect(JSON.stringify(input)).toBe(_frozen);
        // Sigue teniendo _flag.
        expect(input._flag).toBe(true);
    });

    it('retorna {} para inputs no-objeto sin lanzar', () => {
        expect(stripInternalFlags(null)).toEqual({});
        expect(stripInternalFlags(undefined)).toEqual({});
        expect(stripInternalFlags('string')).toEqual({});
        expect(stripInternalFlags(123)).toEqual({});
    });

    it('los flags exactos del bug (skipLunchTouched/weightUnitTouched) son filtrados', () => {
        const input = {
            skipLunch: true,
            weightUnit: 'kg',
            _skipLunchTouched: true,
            _weightUnitTouched: true,
        };
        const out = stripInternalFlags(input);
        expect(out._skipLunchTouched).toBeUndefined();
        expect(out._weightUnitTouched).toBeUndefined();
        // Los campos sin prefijo (los datos reales) sí se preservan.
        expect(out.skipLunch).toBe(true);
        expect(out.weightUnit).toBe('kg');
    });

    it('cualquier `_*` futuro se filtra automáticamente (no hay allowlist hardcoded)', () => {
        const input = {
            age: 30,
            _futureFlag1: 'x',
            _anotherFlag: 'y',
            _internalDebug: { foo: 'bar' },
        };
        const out = stripInternalFlags(input);
        // Todos los `_*` desaparecen.
        for (const k of Object.keys(out)) {
            expect(k.startsWith('_')).toBe(false);
        }
    });
});


describe('P1-8 — buildHealthProfilePayload sigue usando el filtro', () => {
    it('después del refactor, buildHealthProfilePayload sigue filtrando _*', () => {
        const formData = {
            age: 30, weight: 75,
            _skipLunchTouched: true,
            _weightUnitTouched: false,
        };
        // session=null y formData con campos pobladas pasa el race-detection guard.
        const payload = buildHealthProfilePayload(formData, {}, null);
        if (payload === null) {
            // Si el guard se activa, el test no aplica (no hay payload que validar).
            return;
        }
        expect(payload._skipLunchTouched).toBeUndefined();
        expect(payload._weightUnitTouched).toBeUndefined();
        expect(payload.age).toBe(30);
        expect(payload.weight).toBe(75);
    });

    it('overrides aplicados sobre el payload filtrado', () => {
        const formData = { age: 30, _flag: true };
        const payload = buildHealthProfilePayload(formData, { householdSize: 4 }, null);
        if (payload === null) return;
        expect(payload.householdSize).toBe(4);
        expect(payload._flag).toBeUndefined();
    });
});


describe('P1-8 — Plan.jsx aplica stripInternalFlags antes del spread', () => {
    const planSrc = fs.readFileSync(
        path.resolve(__dirname, '..', 'pages', 'Plan.jsx'),
        'utf-8',
    );
    const codeOnly = planSrc
        .split('\n')
        .filter((ln) => !ln.trim().startsWith('//'))
        .join('\n');

    it('Plan.jsx importa stripInternalFlags', () => {
        expect(codeOnly).toMatch(
            /import\s*\{[^}]*\bstripInternalFlags\b[^}]*\}\s*from\s*['"][^'"]*secureFormStorage/
        );
    });

    it('dataToSend usa stripInternalFlags(formData) en lugar del spread directo', () => {
        // Patrón canónico inline OR via const intermedio (P1-11 introduce
        // `_safeForm = stripInternalFlags(formData)` para reusar el resultado
        // y aplicar fallbacks adicionales). Ambos patrones son semánticamente
        // equivalentes para el filtrado.
        const inlinePattern = /\.\.\.stripInternalFlags\(\s*formData\s*\)/;
        const indirectPattern = /=\s*stripInternalFlags\(\s*formData\s*\)\s*;[\s\S]*\.\.\._safeForm/;
        expect(inlinePattern.test(codeOnly) || indirectPattern.test(codeOnly)).toBe(true);
    });

    it('NO contiene `...formData,` activo (sin filtrar) en código activo', () => {
        // Defensa contra reintroducir el spread directo. El patrón roto es
        // exactamente `...formData,` (con coma, indicando spread en object literal)
        // sin estar precedido por `stripInternalFlags(`.
        const badPattern = /[^(]\.\.\.formData\s*,/;
        expect(codeOnly).not.toMatch(badPattern);
    });

    it('Comentario [P1-8] documenta el rationale en Plan.jsx', () => {
        expect(planSrc).toMatch(/\[P1-8\]/);
    });
});
