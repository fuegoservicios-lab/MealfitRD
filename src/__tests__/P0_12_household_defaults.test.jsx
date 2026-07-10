/**
 * Tests P0-12 (revisado 2026-05-30): contrato de `householdSize` / `groceryDuration`.
 *
 * DECISIÓN DE PRODUCTO 2026-05-30:
 *   Se eliminó el selector de tamaño de hogar. `householdSize` queda FIJO en 1
 *   (el producto escala por persona). El wizard solo exige `groceryDuration`.
 *
 * Historia previa (P0-12 original, 2026-05-07 — ahora REVERTIDO por producto):
 *   La versión vieja del fix hacía `householdSize: null` + un selector de
 *   personas en QHousehold con guard `!formData.householdSize`. Eso se
 *   descartó: el producto decidió hogar = 1 persona sin selector. Estos tests
 *   ahora anclan el contrato NUEVO y fallan si alguien re-introduce un selector
 *   de hogar (que requeriría revertir la decisión de producto primero).
 *
 * Contrato vigente:
 *   - `initialFormData`: `householdSize: 1` (fijo), `groceryDuration: ''`.
 *   - QHousehold: NO renderiza selector de personas; su "Siguiente" gatea SOLO
 *     `groceryDuration`.
 *   - `householdSize` sigue en REQUIRED_FORM_FIELDS por paridad con el backend
 *     (`test_p0_form_6_required_fields_sync`), pero el default 1 (truthy)
 *     siempre lo satisface → `findFirstIncompleteField` nunca lo flaggea.
 */
import { describe, it, expect } from 'vitest';
import { findFirstIncompleteField, REQUIRED_FORM_FIELDS } from '../config/formValidation';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

const _readFile = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');


describe('P0-12 — findFirstIncompleteField con el contrato nuevo (household fijo en 1)', () => {
    const buildFilledForm = (overrides = {}) => ({
        gender: 'male', age: 30, height: 175, weight: 75, weightUnit: 'kg',
        activityLevel: 'moderate', scheduleType: '9to5', sleepHours: 8,
        stressLevel: 'low', cookingTime: 'medium', budget: 'medium',
        householdSize: 1, groceryDuration: 'biweekly',
        dietType: 'balanced', allergies: ['Ninguna'], dislikes: ['Ninguno'],
        medicalConditions: ['Ninguna'], mainGoal: 'lose', struggles: ['Ninguno'],
        motivation: 'salud',
        ...overrides,
    });

    it('householdSize=1 (default) satisface el required → NO se flaggea', () => {
        // El default 1 es truthy; el wizard nunca debe bloquear por hogar.
        const form = buildFilledForm({ householdSize: 1 });
        expect(findFirstIncompleteField(form)).toBe(null);
    });

    it('retorna "groceryDuration" cuando groceryDuration es vacío', () => {
        const form = buildFilledForm({ groceryDuration: '' });
        expect(findFirstIncompleteField(form)).toBe('groceryDuration');
    });

    it('retorna null cuando todos los requeridos están llenos', () => {
        expect(findFirstIncompleteField(buildFilledForm())).toBe(null);
    });

    it('householdSize sigue en REQUIRED_FORM_FIELDS (paridad con backend)', () => {
        expect(REQUIRED_FORM_FIELDS).toContain('householdSize');
    });
});


describe('P0-12 — initialFormData fija householdSize en 1 (decisión de producto)', () => {
    const src = _readFile('context/AssessmentContext.jsx');
    const initialFormDataMatch = src.match(/const\s+initialFormData\s*=\s*\{([\s\S]*?)\n\s*\};/);
    const rawInitialBlock = initialFormDataMatch ? initialFormDataMatch[1] : '';
    // Solo el código (ignora líneas que son comentarios).
    const codeOnlyBlock = rawInitialBlock
        .split('\n')
        .filter((ln) => !ln.trim().startsWith('//'))
        .join('\n');

    it('Bloque initialFormData fue extraído correctamente del source', () => {
        expect(rawInitialBlock).toBeTruthy();
        expect(codeOnlyBlock.length).toBeGreaterThan(50);
    });

    it('initialFormData (código activo) fija "householdSize: 1"', () => {
        expect(codeOnlyBlock).toMatch(/householdSize:\s*1\b/);
        // Y NO arranca en null (el contrato viejo, ya revertido).
        expect(codeOnlyBlock).not.toMatch(/householdSize:\s*null/);
    });

    it('initialFormData (código activo) NO asigna "groceryDuration: \'weekly\'"', () => {
        expect(codeOnlyBlock).not.toMatch(/groceryDuration:\s*['"]weekly['"]/);
        expect(codeOnlyBlock).toMatch(/groceryDuration:\s*['"]['"]/);
    });

    it('Comentario [P0-12] documenta el rationale en initialFormData', () => {
        expect(rawInitialBlock).toMatch(/\[P0-12/);
    });
});


describe('P0-12 — QHousehold NO debe tener selector de personas (decisión de producto)', () => {
    // [P2-4 · 2026-07-09] QHousehold vive en su propio archivo tras el split
    // mecánico de InteractiveQuestions.jsx (barrel). El componente es la única
    // declaración del archivo, así que el extractor matchea hasta EOF.
    const src = _readFile('components/assessment/questions/QHousehold.jsx');
    const qhouseholdMatch = src.match(/export const QHousehold[\s\S]*/);
    const qBody = qhouseholdMatch ? qhouseholdMatch[0] : '';

    it('QHousehold fue extraído del source', () => {
        expect(qBody).toBeTruthy();
    });

    it('NO contiene un handler/selector de tamaño de hogar', () => {
        // Si alguien re-introduce el selector, debe revertir primero la
        // decisión de producto 2026-05-30 (y actualizar estos tests).
        expect(qBody).not.toMatch(/handlePersonSelect/);
        expect(qBody).not.toMatch(/updateData\(\s*['"]householdSize['"]/);
    });

    it('NextButton de QHousehold gatea SOLO groceryDuration', () => {
        // Patrón canónico nuevo: el único gate es groceryDuration.
        expect(qBody).toMatch(/disabled=\{!formData\.groceryDuration\}/);
        // Y NO el guard viejo de hogar.
        expect(qBody).not.toMatch(/!formData\.householdSize/);
    });
});
