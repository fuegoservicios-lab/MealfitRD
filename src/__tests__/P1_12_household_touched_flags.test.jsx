/**
 * Tests P1-12 (revisado 2026-05-30): touched-flag `_groceryDurationTouched`
 * preserva la edición del usuario contra Realtime UPDATEs y fetchProfile.
 *
 * DECISIÓN DE PRODUCTO 2026-05-30:
 *   Se eliminó el selector de tamaño de hogar y el flag `_householdSizeTouched`
 *   (householdSize es fijo en 1, no hay edición de hogar que preservar). Este
 *   test ahora ancla SOLO el flag de `groceryDuration` (que sí es editable
 *   desde QHousehold) + la simetría con `weightUnit`, y verifica que el flag
 *   de hogar fue removido (lock contra re-introducción accidental).
 *
 * Patrón (P1-FORM-3 / P1-12): `_xxxTouched=true` persistido → un useEffect
 * mount-only re-arma `editedFieldsRef` con 'xxx' para que `fetchProfile` /
 * `secureLoadFormData` lo excluyan del overlay con valores stale del DB.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CTX_PATH = path.resolve(__dirname, '..', 'context', 'AssessmentContext.jsx');
// [P2-4 · 2026-07-09] QHousehold vive en su propio archivo tras el split
// mecánico de InteractiveQuestions.jsx (que quedó como barrel de re-export).
const QSRC_PATH = path.resolve(__dirname, '..', 'components', 'assessment', 'questions', 'QHousehold.jsx');

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


describe('P1-12 — initialFormData declara _groceryDurationTouched (y NO el de hogar)', () => {
    const blockMatch = ctxCode.match(
        /const\s+initialFormData\s*=\s*\{([\s\S]*?)\n\s*\};/
    );
    const initialBlock = blockMatch ? blockMatch[1] : '';

    it('initialFormData contiene `_groceryDurationTouched: false`', () => {
        expect(initialBlock).toMatch(/_groceryDurationTouched:\s*false/);
    });

    it('initialFormData YA NO contiene `_householdSizeTouched` (flag removido)', () => {
        expect(initialBlock).not.toMatch(/_householdSizeTouched/);
    });

    it('Comentario [P1-12] documenta el rationale en initialFormData', () => {
        expect(ctxSrc).toMatch(/\[P1-12/);
    });
});


describe('P1-12 — handleDurationSelect setea el touched-flag a true', () => {
    it('handleDurationSelect llama updateData(\'_groceryDurationTouched\', true)', () => {
        const handlerMatch = qCode.match(/handleDurationSelect\s*=\s*\(\s*val\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\};/);
        expect(handlerMatch).toBeTruthy();
        const body = handlerMatch[1];
        expect(body).toMatch(/updateData\(\s*['"]_groceryDurationTouched['"]\s*,\s*true\s*\)/);
    });

    it('NO existe un handler de selección de hogar (handlePersonSelect)', () => {
        expect(qCode).not.toMatch(/handlePersonSelect/);
    });
});


describe('P1-12 — useEffect mount-only re-arma editedFieldsRef', () => {
    it('Re-arma `groceryDuration` cuando _groceryDurationTouched=true', () => {
        const pattern = /if\s*\(\s*formData\?\._groceryDurationTouched\s*===\s*true\s*\)\s*\{[^}]*editedFieldsRef\.current\.add\(\s*['"]groceryDuration['"]\s*\)/s;
        expect(ctxCode).toMatch(pattern);
    });

    it('NO re-arma `householdSize` (flag removido)', () => {
        expect(ctxCode).not.toMatch(/editedFieldsRef\.current\.add\(\s*['"]householdSize['"]\s*\)/);
    });

    it('Mantiene el re-armado existente (weightUnit)', () => {
        expect(ctxCode).toMatch(/editedFieldsRef\.current\.add\(\s*['"]weightUnit['"]\s*\)/);
    });
});
