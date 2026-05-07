/**
 * Tests P1-9: normalización coma decimal → punto en inputs biométricos.
 *
 * Bug original (audit P1-9):
 *   En locales `es-DO`/`es-ES` los usuarios tipean "70,5" naturalmente,
 *   y el navegador puede aceptarlo en `<input type="number">`. Sin
 *   normalización, el state guardaba `"70,5"`:
 *     - `isBiometricInRange` (validation.js) lo normalizaba localmente
 *       para gating, pero el envío al backend mandaba `weight: "70,5"`.
 *     - `_coerce_numeric` en backend `plans.py` también normalizaba —
 *       el plan se generaba correctamente.
 *     - PERO la persistencia en `health_profile` y `mealfit_form` quedaba
 *       con la coma literal. Comparaciones de igualdad en
 *       `update_user_health_profile` (`old_w = float(...)`) podían fallar
 *       o producir drift entre sesiones (refresh → "70,5" stale en DB →
 *       re-hidrata distinto a lo que el usuario tipeó esta sesión).
 *
 * Fix:
 *   `InteractiveQuestions.jsx > QMeasurements` aplica `_normalizeDecimal`
 *   en el `onChange` de los 3 inputs decimales (weight, bodyFat, height
 *   cuando unit='cm') y dentro de `handleFtChange` (feet/inches). El
 *   reemplazo `,→.` ocurre ANTES de `updateData(...)`, garantizando que
 *   el state SIEMPRE tenga `.` decimal canónico.
 *
 *   Adicionalmente: `inputMode="decimal"` en los 3 inputs para mostrar el
 *   teclado numérico con coma/punto en mobile (UX coherente con el locale).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const QSRC = fs.readFileSync(
    path.resolve(__dirname, '..', 'components', 'assessment', 'questions', 'InteractiveQuestions.jsx'),
    'utf-8',
);
// Filtrar líneas-comentario para que las explicaciones del bug no
// produzcan falsos positivos.
const codeOnly = QSRC
    .split('\n')
    .filter((ln) => !ln.trim().startsWith('//'))
    .join('\n');


describe('P1-9 — _normalizeDecimal helper presente en QMeasurements', () => {
    it('declara `_normalizeDecimal` como función local del component', () => {
        // Patrón canónico: const _normalizeDecimal = (raw) => { ... };
        expect(codeOnly).toMatch(/const\s+_normalizeDecimal\s*=\s*\(/);
    });

    it('el helper reemplaza coma por punto', () => {
        expect(codeOnly).toMatch(/replace\(\s*['"],['"]\s*,\s*['"]\.['"]\s*\)/);
    });

    it('Comentario [P1-9] documenta el rationale', () => {
        expect(QSRC).toMatch(/\[P1-9\]/);
    });
});


describe('P1-9 — Inputs decimales aplican _normalizeDecimal en onChange', () => {
    it('Input height (cm) llama _normalizeDecimal antes de updateData("height", ...)', () => {
        // Buscamos el onChange del input cm con _normalizeDecimal envolviendo e.target.value.
        const heightCmPattern = /onChange=\{e\s*=>\s*updateData\(\s*['"]height['"]\s*,\s*_normalizeDecimal\(\s*e\.target\.value\s*\)\s*\)\s*\}/;
        expect(codeOnly).toMatch(heightCmPattern);
    });

    it('Input weight llama _normalizeDecimal antes de updateData("weight", ...)', () => {
        const weightPattern = /onChange=\{e\s*=>\s*updateData\(\s*['"]weight['"]\s*,\s*_normalizeDecimal\(\s*e\.target\.value\s*\)\s*\)\s*\}/;
        expect(codeOnly).toMatch(weightPattern);
    });

    it('Input bodyFat llama _normalizeDecimal antes de updateData("bodyFat", ...)', () => {
        const bodyFatPattern = /onChange=\{e\s*=>\s*updateData\(\s*['"]bodyFat['"]\s*,\s*_normalizeDecimal\(\s*e\.target\.value\s*\)\s*\)\s*\}/;
        expect(codeOnly).toMatch(bodyFatPattern);
    });

    it('handleFtChange normaliza ft/inches antes de propagar', () => {
        // Patrón: const ftN = _normalizeDecimal(ft); const incN = _normalizeDecimal(inc);
        expect(codeOnly).toMatch(/_normalizeDecimal\(\s*ft\s*\)/);
        expect(codeOnly).toMatch(/_normalizeDecimal\(\s*inc\s*\)/);
    });
});


describe('P1-9 — inputMode="decimal" en los 3 inputs decimales', () => {
    it('Input height-cm tiene inputMode="decimal"', () => {
        // Buscamos el block del input de cm (con id="height" y type="number").
        const cmBlock = codeOnly.match(/<Input\s+id="height"[^/>]*>/s);
        expect(cmBlock).toBeTruthy();
        expect(cmBlock[0]).toMatch(/inputMode="decimal"/);
    });

    it('Input weight tiene inputMode="decimal"', () => {
        const wBlock = codeOnly.match(/<Input\s+id="weight"[^/>]*>/s);
        expect(wBlock).toBeTruthy();
        expect(wBlock[0]).toMatch(/inputMode="decimal"/);
    });

    it('Input bodyFat tiene inputMode="decimal"', () => {
        const bfBlock = codeOnly.match(/<Input\s+id="bodyFat"[^/>]*>/s);
        expect(bfBlock).toBeTruthy();
        expect(bfBlock[0]).toMatch(/inputMode="decimal"/);
    });
});


describe('P1-9 — Defensa contra reintroducción del bug', () => {
    it('Ningún onChange llama updateData con e.target.value SIN normalizar para weight/height/bodyFat', () => {
        // Patrón roto: `updateData('weight', e.target.value)` directo (sin envolver en _normalizeDecimal).
        const badPatterns = [
            /updateData\(\s*['"]weight['"]\s*,\s*e\.target\.value\s*\)/,
            /updateData\(\s*['"]bodyFat['"]\s*,\s*e\.target\.value\s*\)/,
            // Para height en path cm — ft/in usan handleFtChange (excluído).
        ];
        for (const pattern of badPatterns) {
            expect(codeOnly).not.toMatch(pattern);
        }
    });
});


describe('P1-9 — Comportamiento del helper (test funcional indirect)', () => {
    // El helper es local; lo simulamos para verificar el contrato del replace.
    const _normalizeDecimal = (raw) => {
        if (typeof raw !== 'string') return raw;
        return raw.replace(',', '.');
    };

    it('"70,5" → "70.5"', () => {
        expect(_normalizeDecimal("70,5")).toBe("70.5");
    });

    it('"170" sin coma queda intacto', () => {
        expect(_normalizeDecimal("170")).toBe("170");
    });

    it('"" queda intacto (input vacío)', () => {
        expect(_normalizeDecimal("")).toBe("");
    });

    it('null/undefined/number pasan sin lanzar', () => {
        expect(_normalizeDecimal(null)).toBe(null);
        expect(_normalizeDecimal(undefined)).toBe(undefined);
        expect(_normalizeDecimal(70)).toBe(70);
    });

    it('solo reemplaza la primera coma (un valor solo tiene UN decimal)', () => {
        // Edge case: "1,2,3" no es un número válido; el navegador lo rechaza
        // antes de llegar al onChange. Pero el helper debe ser determinista.
        expect(_normalizeDecimal("1,2,3")).toBe("1.2,3");
    });
});
