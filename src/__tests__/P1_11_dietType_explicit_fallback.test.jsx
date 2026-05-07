/**
 * Tests P1-11: `dietType` siempre se envía con valor explícito al backend.
 *
 * Bug original (audit P1-11):
 *   El frontend gatea `dietType` como required (`REQUIRED_FORM_FIELDS` en
 *   `formValidation.js`), pero el backend lo deja FUERA de
 *   `_REQUIRED_FORM_FIELDS` deliberadamente para preservar rehidratación
 *   de perfiles legacy con variantes ES (`"Omnívora"`/`"vegetariana"`).
 *   Drift documentado pero NO protegido por test.
 *
 *   Si el frontend gating se evade (cliente no oficial, hidratación rota,
 *   plan saved donde el legacy `dietTypes:[]` viene del schema en lugar
 *   de `dietType: ''`), el backend defaultea internamente a catálogo
 *   completo "balanced" — un usuario vegano podría recibir un plan
 *   balanced silenciosamente sin disparar 422.
 *
 * Fix:
 *   `Plan.jsx` envía explícitamente `dietType: formData.dietType || 'balanced'`
 *   en `dataToSend`. Esto:
 *     1. Garantiza que el backend NUNCA reciba `''`/`null`/`undefined` para
 *        `dietType` desde el cliente oficial.
 *     2. Hace el contrato auditable end-to-end: si dietType es 'balanced'
 *        en el payload, sabemos que el frontend no lo perdió.
 *     3. Compatible con el LLM downstream: 'balanced' es el valor por
 *        default del catálogo, equivalente a no especificar dietType.
 *
 * NOTA: este fix NO cambia el contrato del backend (dietType sigue OUT
 * de `_REQUIRED_FORM_FIELDS` por compat legacy). Solo blinda el path del
 * cliente oficial contra evasión silenciosa del gating.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PLAN_PATH = path.resolve(__dirname, '..', 'pages', 'Plan.jsx');
const src = fs.readFileSync(PLAN_PATH, 'utf-8');
const codeOnly = src
    .split('\n')
    .filter((ln) => !ln.trim().startsWith('//'))
    .join('\n');

const VALIDATION_PATH = path.resolve(__dirname, '..', 'config', 'formValidation.js');
const validationSrc = fs.readFileSync(VALIDATION_PATH, 'utf-8');


describe('P1-11 — Plan.jsx explicita el fallback de dietType en dataToSend', () => {
    it('Plan.jsx contiene `dietType: ... || \'balanced\'` en dataToSend', () => {
        // Patrón canónico: `dietType: <something>.dietType || 'balanced'`.
        const fallbackPattern = /dietType\s*:\s*[A-Za-z_$][\w$]*\.dietType\s*\|\|\s*['"]balanced['"]/;
        expect(codeOnly).toMatch(fallbackPattern);
    });

    it('Comentario [P1-11] documenta el rationale del drift frontend↔backend', () => {
        expect(src).toMatch(/\[P1-11\]/);
    });

    it('NO existe un envío crudo de `dietType: formData.dietType` sin fallback', () => {
        // Defensa contra reintroducir el patrón roto. El patrón roto es
        // `dietType: formData.dietType` o `dietType: _safeForm.dietType`
        // sin el `|| 'balanced'` adicional.
        // Buscamos cualquier asignación de dietType en el JSX/dataToSend que
        // NO tenga el fallback.
        // Aceptamos solo la presencia del fallback (regex anterior).
        // Aquí confirmamos que NO existe el patrón sin fallback como
        // value-only en una object property.
        const badPattern = /dietType\s*:\s*[A-Za-z_$][\w$]*\.dietType\s*,/;
        expect(codeOnly).not.toMatch(badPattern);
    });
});


describe('P1-11 — Frontend valida dietType como required (no cambia)', () => {
    it('formValidation.js mantiene `dietType` en REQUIRED_FORM_FIELDS', () => {
        // El frontend SÍ exige dietType — el drift con backend es intencional
        // (compat legacy ES) y la defensa P1-11 vive en Plan.jsx, no aquí.
        expect(validationSrc).toMatch(/['"]dietType['"]/);
    });

    it('formValidation.js comenta que dietType queda fuera del backend', () => {
        // El comentario explicativo del drift debe seguir presente como
        // documentación viva del contrato.
        expect(validationSrc).toMatch(/dietType[^a-zA-Z0-9].*?fuera del backend|backend.*?dietType/s);
    });
});


describe('P1-11 — Plan.jsx no envía dietType vacío al backend', () => {
    // Test funcional indirecto: simulamos el snippet del fallback.
    const _applyFallback = (formData) => {
        return {
            ...formData,
            dietType: (formData && formData.dietType) || 'balanced',
        };
    };

    it('Si formData.dietType está presente, se preserva tal cual', () => {
        const out = _applyFallback({ dietType: 'vegan', age: 30 });
        expect(out.dietType).toBe('vegan');
    });

    it('Si formData.dietType es "" → default a "balanced"', () => {
        const out = _applyFallback({ dietType: '', age: 30 });
        expect(out.dietType).toBe('balanced');
    });

    it('Si formData.dietType es null/undefined → default a "balanced"', () => {
        expect(_applyFallback({ dietType: null }).dietType).toBe('balanced');
        expect(_applyFallback({ dietType: undefined }).dietType).toBe('balanced');
        expect(_applyFallback({}).dietType).toBe('balanced');
    });

    it('Variantes legacy ES ("Omnívora", "vegetariana") se preservan', () => {
        // El contrato del backend acepta estas variantes vía
        // `_DIET_TYPE_LEGACY_ACCEPTED`. El fallback NO las sobreescribe.
        expect(_applyFallback({ dietType: 'Omnívora' }).dietType).toBe('Omnívora');
        expect(_applyFallback({ dietType: 'vegetariana' }).dietType).toBe('vegetariana');
    });
});
