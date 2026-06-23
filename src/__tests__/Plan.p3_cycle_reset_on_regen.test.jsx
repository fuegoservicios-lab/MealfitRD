import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// [P3-CYCLE-RESET-ON-REGEN · 2026-06-23] El badge del ciclo del Dashboard ("7d semanal • Nd")
// usa plan_data.cycle_start_date. Antes, al REGENERAR (renewal con previousMeals), Plan.jsx
// heredaba `oldPlan.cycle_start_date` → el contador se quedaba clavado en el día del plan
// anterior (visto en vivo: "6d" tras renovar). Ahora una generación COMPLETA reinicia
// cycle_start_date a `now` SIEMPRE (menú nuevo = lista nueva = ciclo nuevo). grocery_start_date
// también es now (intacto, no afecta shift-plan).

const _dir = dirname(fileURLToPath(import.meta.url));
const PLAN_SRC = readFileSync(join(_dir, '..', 'pages', 'Plan.jsx'), 'utf-8');

describe('P3-CYCLE-RESET-ON-REGEN', () => {
    it('marca el fix con su tooltip-anchor', () => {
        expect(PLAN_SRC).toContain('P3-CYCLE-RESET-ON-REGEN');
    });

    it('cycle_start_date se reinicia a now (no hereda el del oldPlan)', () => {
        expect(PLAN_SRC).toContain('generatedPlan.cycle_start_date = now;');
        // El patrón viejo (heredar el ciclo del plan anterior) ya no debe existir.
        expect(PLAN_SRC).not.toContain('generatedPlan.cycle_start_date = oldPlan.cycle_start_date');
    });

    it('grocery_start_date sigue siendo now (no se rompe el shift-plan)', () => {
        expect(PLAN_SRC).toContain('generatedPlan.grocery_start_date = now;');
    });
});
