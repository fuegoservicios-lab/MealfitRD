/**
 * Tests P0-12: defaults silenciosos `householdSize=1` / `groceryDuration='weekly'`
 * NO deben evadir el gating del wizard.
 *
 * Bug original (audit P0-12):
 *   `initialFormData` en `AssessmentContext.jsx` arrancaba con
 *   `householdSize: 1` y `groceryDuration: 'weekly'`. `QHousehold` además
 *   forzaba `householdSize=1` en mount vía `useEffect`. El "Siguiente" del
 *   step quedaba HABILITADO desde el primer render aunque el usuario no
 *   tocara nada. `findFirstIncompleteField` nunca los flagueaba (valor
 *   truthy). Para una familia de 4 con compras quincenales que avanzaba
 *   pasivo, el plan se generaba escalado para 1 persona/semanal — lista
 *   de compras subdimensionada (faltante crítico de comida) y macros para
 *   1 plato cuando hay 4 comensales.
 *
 * Fix:
 *   - `initialFormData`: `householdSize: null`, `groceryDuration: ''`.
 *   - QHousehold: eliminado el `useEffect` que seteaba `householdSize=1`.
 *   - QHousehold chips: eliminado el fallback `|| 1` para que ningún chip
 *     aparezca pre-seleccionado al primer render.
 *   - El botón "Siguiente" usa `disabled={!formData.householdSize ||
 *     !formData.groceryDuration}` que ahora bloquea correctamente con los
 *     nuevos defaults falsy.
 */
import { describe, it, expect } from 'vitest';
import { findFirstIncompleteField, REQUIRED_FORM_FIELDS } from '../config/formValidation';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

const _readFile = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');


describe('P0-12 — findFirstIncompleteField detecta los nuevos defaults', () => {
    // Plantilla con todos los campos previos a `householdSize` rellenos para
    // aislar el chequeo a `householdSize` y `groceryDuration`.
    const buildFilledFormUpTo = (excludeField) => {
        const baseValid = {
            gender: 'male', age: 30, height: 175, weight: 75, weightUnit: 'kg',
            activityLevel: 'moderate', scheduleType: '9to5', sleepHours: 8,
            stressLevel: 'low', cookingTime: 'medium', budget: 'medium',
            householdSize: 4, groceryDuration: 'biweekly',
            dietType: 'balanced', allergies: ['Ninguna'], dislikes: ['Ninguno'],
            medicalConditions: ['Ninguna'], mainGoal: 'lose', struggles: ['Ninguno'],
            motivation: 'salud',
        };
        if (excludeField) delete baseValid[excludeField];
        return baseValid;
    };

    it('retorna "householdSize" cuando householdSize es null', () => {
        const form = { ...buildFilledFormUpTo(), householdSize: null };
        expect(findFirstIncompleteField(form)).toBe('householdSize');
    });

    it('retorna "groceryDuration" cuando groceryDuration es vacío', () => {
        const form = { ...buildFilledFormUpTo(), groceryDuration: '' };
        expect(findFirstIncompleteField(form)).toBe('groceryDuration');
    });

    it('retorna "householdSize" antes que "groceryDuration" si ambos faltan (orden del array)', () => {
        const form = { ...buildFilledFormUpTo(), householdSize: null, groceryDuration: '' };
        // REQUIRED_FORM_FIELDS lista householdSize antes que groceryDuration.
        expect(REQUIRED_FORM_FIELDS.indexOf('householdSize'))
            .toBeLessThan(REQUIRED_FORM_FIELDS.indexOf('groceryDuration'));
        expect(findFirstIncompleteField(form)).toBe('householdSize');
    });

    it('retorna null cuando todos los requeridos están llenos', () => {
        const form = buildFilledFormUpTo();
        expect(findFirstIncompleteField(form)).toBe(null);
    });
});


describe('P0-12 — initialFormData NO debe contener defaults silenciosos', () => {
    const src = _readFile('context/AssessmentContext.jsx');
    const initialFormDataMatch = src.match(/const\s+initialFormData\s*=\s*\{([\s\S]*?)\n\s*\};/);
    const rawInitialBlock = initialFormDataMatch ? initialFormDataMatch[1] : '';
    // Filtramos líneas que son SOLO comentarios (`// ...`). Los comentarios
    // explicativos que documentan el bug literal `householdSize: 1` no
    // deben hacer fail el test — el riesgo real es la asignación activa.
    const codeOnlyBlock = rawInitialBlock
        .split('\n')
        .filter((ln) => !ln.trim().startsWith('//'))
        .join('\n');

    it('Bloque initialFormData fue extraído correctamente del source', () => {
        expect(rawInitialBlock).toBeTruthy();
        expect(codeOnlyBlock.length).toBeGreaterThan(50);
    });

    it('initialFormData (código activo) NO asigna "householdSize: 1"', () => {
        expect(codeOnlyBlock).not.toMatch(/householdSize:\s*1\b/);
        expect(codeOnlyBlock).toMatch(/householdSize:\s*null/);
    });

    it('initialFormData (código activo) NO asigna "groceryDuration: \'weekly\'"', () => {
        expect(codeOnlyBlock).not.toMatch(/groceryDuration:\s*['"]weekly['"]/);
        expect(codeOnlyBlock).toMatch(/groceryDuration:\s*['"]['"]/);
    });

    it('Comentario [P0-12] documenta el rationale en initialFormData', () => {
        // Si alguien re-introduce los defaults, debe ver primero el aviso.
        expect(rawInitialBlock).toMatch(/\[P0-12\]/);
    });
});


describe('P0-12 — QHousehold NO debe forzar householdSize=1 en mount', () => {
    const src = _readFile('components/assessment/questions/InteractiveQuestions.jsx');

    it('NO contiene useEffect que setea householdSize=1', () => {
        // Patrón roto exacto del bug: `if (!formData.householdSize) updateData('householdSize', 1)`.
        const badPattern = /if\s*\(\s*!formData\.householdSize\s*\)\s*updateData\(\s*['"]householdSize['"]\s*,\s*1\s*\)/;
        expect(src).not.toMatch(badPattern);
    });

    it('NO usa fallback `|| 1` al renderizar chip seleccionado', () => {
        // El chip "1" ya no debe aparecer pre-seleccionado al primer render
        // si el usuario no eligió nada.
        const badPattern = /\(formData\.householdSize\s*\|\|\s*1\)\s*===\s*num/;
        expect(src).not.toMatch(badPattern);
        // El patrón nuevo es comparación directa.
        expect(src).toMatch(/formData\.householdSize\s*===\s*num/);
    });

    it('Comentario [P0-12] documenta el rationale en QHousehold', () => {
        // Defensa contra reintroducir el useEffect "default visual 1".
        const qhouseholdMatch = src.match(/export const QHousehold[\s\S]*?(?=\nexport const |\nfunction )/);
        expect(qhouseholdMatch).toBeTruthy();
        expect(qhouseholdMatch[0]).toMatch(/\[P0-12\]/);
    });
});


describe('P0-12 — Botón "Siguiente" del wizard queda disabled con defaults nuevos', () => {
    // El NextButton ya tiene `disabled={!formData.householdSize || !formData.groceryDuration}`
    // — verificamos vía source que no se haya cambiado a un patrón que ignore null/falsy.
    const src = _readFile('components/assessment/questions/InteractiveQuestions.jsx');

    it('NextButton de QHousehold sigue gateando ambos campos', () => {
        // El patrón canónico que protege es `!formData.householdSize || !formData.groceryDuration`.
        const guardPattern = /disabled=\{!formData\.householdSize\s*\|\|\s*!formData\.groceryDuration\}/;
        expect(src).toMatch(guardPattern);
    });
});
