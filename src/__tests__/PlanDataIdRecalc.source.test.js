// [P1-PLANDATA-ID-RECALC · 2026-09-02] Ningún sitio persiste `plan_data` crudo de una
// respuesta (sin `id`) en estado ni en `mealfit_plan`. Medido en prod: 24 × 409 de
// adopt-guest-plan en un día, uno por carga, porque el recalc al cargar dejaba la copia
// local sin id y el backstop la tomaba por plan de invitado.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Pantry.jsx queda fuera del blanket: cura el id ANTES de adoptar (guard propio con
// `_serverKnownPlanId`, más fuerte que conservarPlanId); abajo se ancla ese guard.
const FILES = ['src/pages/Dashboard.jsx', 'src/context/AssessmentContext.jsx'];
const RAW = [
    /setPlanData\((result|rd)\.plan_data\)/,
    /safeLocalStorageSet\('mealfit_plan', JSON\.stringify\((result|rd)\.plan_data\)\)/,
    /safeLocalStorageSet\('mealfit_plan', (result|rd)\.plan_data\)/,
];

describe('P1-PLANDATA-ID-RECALC: plan_data de respuesta nunca se adopta crudo', () => {
    for (const f of FILES) {
        it(`${f} conserva el id al adoptar plan_data`, () => {
            const src = readFileSync(resolve(process.cwd(), f), 'utf8');
            for (const re of RAW) {
                const m = src.match(re);
                expect(m, `${f}: forma cruda «${m && m[0]}» — envuelve con conservarPlanId(...)`).toBeNull();
            }
        });
    }
    it('Pantry.jsx cura el id del recalc antes de adoptarlo', () => {
        const src = readFileSync(resolve(process.cwd(), 'src/pages/Pantry.jsx'), 'utf8');
        expect(src).toMatch(/if \(result\.plan_data\.id == null\) \{\s*const _healId = planData\?\.id \?\? _serverKnownPlanId;/);
    });
    it('conservarPlanId hereda el id del plan previo cuando la respuesta no lo trae', async () => {
        const { conservarPlanId } = await import('../context/AssessmentContext.jsx');
        expect(conservarPlanId({ days: [] }, { id: 'abc' }).id).toBe('abc');
        expect(conservarPlanId({ days: [], id: 'x' }, { id: 'abc' }).id).toBe('x');
        expect(conservarPlanId({ days: [] }, null).id).toBeUndefined();
    });
});
