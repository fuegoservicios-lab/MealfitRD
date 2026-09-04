// [P2-SW-APPLY-RESPECTS-INFLIGHT · 2026-09-04] La versión nueva del frontend se auto-aplica solo con la
// pestaña oculta y «sin generación en vuelo». Un swap y un «actualizar día» también son operaciones
// en vuelo: en prod la recarga automática cortó un swap a los 9 s (nginx 499) cuando el dueño
// cambió de ventana. El resume lo salvó, pero recargar a mitad de operación es lo que 'prompt' evita.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/main.jsx'), 'utf8').split(String.fromCharCode(13)).join('');

describe('auto-aplicación del service worker', () => {
    it('_safeToApply frena con un swap o un día en vuelo, con las mismas ventanas que los resumes', () => {
        const i = SRC.indexOf('const _safeToApply = () => {');
        expect(i).toBeGreaterThan(0);
        const body = SRC.slice(i, SRC.indexOf('const _applyIfSafe', i));
        expect(body).toContain("document.visibilityState !== 'hidden'");
        expect(body).toContain("safeLocalStorageGet('mealfit_plan_in_progress', null)");
        expect(body).toContain("['mealfit_meal_regen_inflight', 6 * 60 * 1000]");
        expect(body).toContain("['mealfit_day_regen_inflight', 9 * 60 * 1000]");
        expect(body).toContain('if (startedOp && Date.now() - startedOp < maxAgeMs) return false;');
        // las tres guardas van ANTES del `return true`
        expect(body.indexOf('mealfit_day_regen_inflight')).toBeLessThan(body.indexOf('return true;'));
    });
});
