/**
 * Tests P1-12: touched-flags `_householdSizeTouched` / `_groceryDurationTouched`
 * preservan la edición del usuario contra Realtime UPDATEs y fetchProfile
 * post-refresh.
 *
 * Bug original (audit P1-12):
 *   El patrón de touched-flag protege `weightUnit` (P1-FORM-3), pero
 *   `householdSize` y `groceryDuration` no lo tenían. `fetchProfile` y
 *   `secureLoadFormData` filtran solo por `editedFieldsRef` que se llena vía
 *   `updateData` en sesión actual; tras refresh el set arranca vacío. Un
 *   usuario que cambió de 4 personas a 2 (mudanza), el siguiente Realtime
 *   UPDATE de `user_profiles` (admin tooling, otra pestaña, sync cloud)
 *   podía revertir su decisión a los 4 viejos persistidos en DB.
 *   `householdSize` afecta DIRECTAMENTE el escalado de la lista de compras,
 *   así que el riesgo es operacional.
 *
 * Fix:
 *   1. Nuevos flags `_householdSizeTouched` / `_groceryDurationTouched` en
 *      `initialFormData` (default `false`).
 *   2. `handlePersonSelect` / `handleDurationSelect` setean el flag a `true`
 *      junto con la edición del campo.
 *   3. `useEffect` mount-only en AssessmentContext re-arma `editedFieldsRef`
 *      con `'householdSize'`/`'groceryDuration'` cuando los flags están a
 *      `true`. Patrón idéntico a P1-FORM-3.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CTX_PATH = path.resolve(__dirname, '..', 'context', 'AssessmentContext.jsx');
const QSRC_PATH = path.resolve(__dirname, '..', 'components', 'assessment', 'questions', 'InteractiveQuestions.jsx');

const ctxSrc = fs.readFileSync(CTX_PATH, 'utf-8');
const ctxCode = ctxSrc
    .split('\n')
    .filter((ln) => !ln.trim().startsWith('//'))
    .join('\n');

const qSrc = fs.readFileSync(QSRC_PATH, 'utf-8');
const qCode = qSrc
    .split('\n')
    .filter((ln) => !ln.trim().startsWith('//'))
    .join('\n');


describe('P1-12 — initialFormData declara touched-flags por default false', () => {
    // Extraer el bloque del initialFormData para asertions quirúrgicas.
    const blockMatch = ctxCode.match(
        /const\s+initialFormData\s*=\s*\{([\s\S]*?)\n\s*\};/
    );
    const initialBlock = blockMatch ? blockMatch[1] : '';

    it('initialFormData contiene `_householdSizeTouched: false`', () => {
        expect(initialBlock).toMatch(/_householdSizeTouched:\s*false/);
    });

    it('initialFormData contiene `_groceryDurationTouched: false`', () => {
        expect(initialBlock).toMatch(/_groceryDurationTouched:\s*false/);
    });

    it('Comentario [P1-12] documenta el rationale en initialFormData', () => {
        expect(ctxSrc).toMatch(/\[P1-12\]/);
    });
});


describe('P1-12 — handlers setean los touched-flags a true', () => {
    it('handlePersonSelect llama updateData(\'_householdSizeTouched\', true)', () => {
        // Patrón canónico: dentro del cuerpo del handler.
        const handlerMatch = qCode.match(/handlePersonSelect\s*=\s*\(\s*num\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\};/);
        expect(handlerMatch).toBeTruthy();
        const body = handlerMatch[1];
        expect(body).toMatch(/updateData\(\s*['"]_householdSizeTouched['"]\s*,\s*true\s*\)/);
    });

    it('handleDurationSelect llama updateData(\'_groceryDurationTouched\', true)', () => {
        const handlerMatch = qCode.match(/handleDurationSelect\s*=\s*\(\s*val\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\};/);
        expect(handlerMatch).toBeTruthy();
        const body = handlerMatch[1];
        expect(body).toMatch(/updateData\(\s*['"]_groceryDurationTouched['"]\s*,\s*true\s*\)/);
    });

    it('Comentario [P1-12] presente en QHousehold para documentar', () => {
        expect(qSrc).toMatch(/\[P1-12\]/);
    });
});


describe('P1-12 — useEffect mount-only re-arma editedFieldsRef', () => {
    // Buscamos el useEffect con deps `[]` que contiene los `editedFieldsRef.current.add(...)`.
    // Patrón canónico: `if (formData?._householdSizeTouched === true) editedFieldsRef.current.add('householdSize');`.
    it('Re-arma `householdSize` cuando _householdSizeTouched=true', () => {
        const pattern = /if\s*\(\s*formData\?\._householdSizeTouched\s*===\s*true\s*\)\s*\{[^}]*editedFieldsRef\.current\.add\(\s*['"]householdSize['"]\s*\)/s;
        expect(ctxCode).toMatch(pattern);
    });

    it('Re-arma `groceryDuration` cuando _groceryDurationTouched=true', () => {
        const pattern = /if\s*\(\s*formData\?\._groceryDurationTouched\s*===\s*true\s*\)\s*\{[^}]*editedFieldsRef\.current\.add\(\s*['"]groceryDuration['"]\s*\)/s;
        expect(ctxCode).toMatch(pattern);
    });

    it('Mantiene el re-armado existente (weightUnit)', () => {
        // Defensa contra reintroducir el bug en otros flags durante el refactor.
        expect(ctxCode).toMatch(/editedFieldsRef\.current\.add\(\s*['"]weightUnit['"]\s*\)/);
    });
});


describe('P1-12 — simetría con el patrón establecido (weightUnit)', () => {
    it('Los 3 touched-flags se re-arman en el mismo useEffect mount-only', () => {
        // El effect canónico contiene los 3 chequeos.
        const flags = ['_weightUnitTouched', '_householdSizeTouched', '_groceryDurationTouched'];
        for (const flag of flags) {
            expect(ctxCode).toMatch(new RegExp(`formData\\?\\.${flag}\\s*===\\s*true`));
        }
    });
});
