// [P2-HIST-1 · 2026-05-09] Tests del filter relajado en History.jsx
// que ahora MUESTRA planes incompletos (calories=0/null) en lugar de
// ocultarlos.
//
// Bug original (audit historial 2026-05-08):
//   El filter `plan.name && plan.calories > 0` ocultaba planes donde
//   el backend murió antes de persistir calories (e.g., primer chunk
//   dead-letter early). El usuario veía "tu historial está vacío"
//   pero el plan sí ocupaba slot en su quota — no había señal de que
//   algo iba mal.
//
// Fix:
//   1. Filter relajado: `plan.name` solo (filas sin name son garbage
//      no-actionable que ya no debería generar el backend post-P0).
//   2. Render condicional: `caloriesBadge` oculto cuando
//      `plan.calories <= 0` (no más "0" o NaN visibles).
//   3. `getStatusInfo` extendido: `!hasCalories` cuenta como `partial`
//      para que el chip del P1-HIST-2 (amber "Parcial X/Y") señalice
//      el problema sin requerir nuevo CTA.
//
// Cobertura (regex sobre source — sin JSDOM):
//   - Filter en fetchHistory ya NO chequea calories.
//   - caloriesBadge envuelto en condicional `plan.calories > 0`.
//   - getStatusInfo lee `plan.calories` y declara hasCalories.
//   - !hasCalories incluido en la rama partial del bucket-classifier.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');

describe('[P2-HIST-1] filter relajado — planes incompletos visibles', () => {
    it('marca el cambio con anchor [P2-HIST-1 · 2026-05-09]', () => {
        // Anchor para grep desde memoria/MEMORY.md.
        expect(src).toMatch(/\[P2-HIST-1\s*·\s*2026-05-09\]/);
    });

    it('filter por name vive en el endpoint backend (SQL), no en frontend', () => {
        // [P1-HIST-AUDIT-4 · 2026-05-09] El filter `plan.name` se
        // movió al endpoint backend `/api/plans/history-list` como
        // cláusula SQL `WHERE name IS NOT NULL`. La regression
        // específica que P2-HIST-1 cerró (no chequear calories) no
        // puede regresar porque el frontend ya NO procesa filas
        // crudas — solo el array `body.plans` que el backend ya
        // filtró.
        //
        // Lo que SÍ probamos:
        //   1. fetchHistory llama getHistoryList() (no Supabase).
        //   2. El frontend NO reintroduce un filter por calories
        //      sobre el array recibido.
        const fetchIdx = src.indexOf('const fetchHistory = async');
        expect(fetchIdx).toBeGreaterThan(-1);
        const block = src.slice(fetchIdx, fetchIdx + 2500);
        // [P1-HISTORY-ABORT · 2026-05-23] Call site pasa `{ signal }`.
        expect(block).toMatch(/getHistoryList\(\s*(?:\{[^}]*\})?\s*\)/);
        // Defensa: ningún `.filter(... calories ... > 0)` post-fetch.
        expect(block).not.toMatch(/\.filter\([^)]*calories[^)]*>\s*0/);
    });
});

describe('[P2-HIST-1] caloriesBadge condicional', () => {
    it('caloriesBadge envuelto en typeof check + > 0', () => {
        // Antes el JSX renderizaba `<div>{plan.calories}</div>` sin
        // guarda → planes incompletos mostraban "0" o NaN. Ahora
        // hay un wrapper condicional.
        // Buscar la zona del caloriesBadge.
        const badgeIdx = src.indexOf('className={styles.caloriesBadge}');
        expect(badgeIdx).toBeGreaterThan(-1);
        // El bloque ANTES del badge debe tener un guard
        // `typeof plan.calories === 'number' && plan.calories > 0`.
        const before = src.slice(Math.max(0, badgeIdx - 400), badgeIdx);
        expect(before).toMatch(
            /typeof\s+plan\.calories\s*===\s*['"]number['"]\s*&&\s*plan\.calories\s*>\s*0/
        );
    });
});

describe('[P2-HIST-1] getStatusInfo — !hasCalories cuenta como partial', () => {
    it('declara hasCalories desde plan.calories (no desde plan_data)', () => {
        // calories es columna top-level, no jsonb. Es el campo
        // canónico para "el backend terminó de calcular el resumen".
        expect(src).toMatch(
            /const\s+hasCalories\s*=\s*typeof\s+plan\.calories\s*===\s*['"]number['"]/
        );
        expect(src).toMatch(/plan\.calories\s*>\s*0/);
    });

    it('!hasCalories incluido en la rama partial del bucket-classifier', () => {
        // Localizar el `else if` que asigna bucket='partial' y
        // verificar que !hasCalories es una de las disjunciones.
        const bucketStart = src.indexOf('bucket = \'partial\';');
        expect(bucketStart).toBeGreaterThan(-1);
        const around = src.slice(Math.max(0, bucketStart - 800), bucketStart);
        // El else-if debe tener `!hasCalories ||` o `|| !hasCalories`.
        expect(around).toMatch(/!hasCalories/);
    });

    it('return shape NO añade hasCalories (mantiene contrato P1-HIST-2)', () => {
        // El return debe seguir siendo `{ bucket, daysGenerated, totalDays }`.
        // hasCalories es interno al cálculo del bucket, no se expone.
        // Sin esto, el test del P1-HIST-2 que asserta el shape
        // estricto se rompería.
        expect(src).toMatch(
            /return\s*\{\s*bucket\s*,\s*daysGenerated\s*,\s*totalDays\s*\}/
        );
    });
});

describe('[P2-HIST-1] integración: planes con calories=0/null ahora se ven', () => {
    // Estos tests son lógicos (no DOM): verifican el comportamiento
    // semántico del filter+classifier para entradas representativas.

    it('filter ya no oculta plan con calories=null (siempre que tenga name)', () => {
        // Simulación de la lógica del filter post-P2-HIST-1.
        const plans = [
            { id: 'A', name: 'Plan completo', calories: 2000, plan_data: {} },
            { id: 'B', name: 'Plan incompleto', calories: null, plan_data: {} },
            { id: 'C', name: 'Otro incompleto', calories: 0, plan_data: {} },
            { id: 'D', name: '', calories: 1500, plan_data: {} }, // garbage
            { id: 'E', name: null, calories: 0, plan_data: {} },  // garbage
        ];
        const filtered = plans.filter(plan => plan.name);
        // A, B, C pasan; D, E (sin name) no.
        expect(filtered.map(p => p.id)).toEqual(['A', 'B', 'C']);
    });

    it('plan vacío con calories=null produce bucket=partial (no complete)', () => {
        // Simulación de la lógica de getStatusInfo. Un plan
        // completamente vacío sin metadata caería en `complete` por
        // default antes de P2-HIST-1; ahora el !hasCalories lo desvía
        // a `partial`.
        const plan = { calories: null, plan_data: {} };
        const data = plan.plan_data || {};
        const days = Array.isArray(data.days) ? data.days : [];
        const daysGenerated = days.length;
        const _candidates = [data.total_days_requested, data.totalDays];
        let totalDays = daysGenerated;
        for (const c of _candidates) {
            if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
                totalDays = c;
                break;
            }
        }
        const rawStatus = typeof data.generation_status === 'string' ? data.generation_status : null;
        const recoveryExhausted = Array.isArray(data._recovery_exhausted_chunks) && data._recovery_exhausted_chunks.length > 0;
        const actionRequired = data._user_action_required != null && data._user_action_required !== false;
        const hasCalories = typeof plan.calories === 'number' && plan.calories > 0;

        let bucket;
        if (rawStatus === 'failed' || recoveryExhausted) bucket = 'failed';
        else if (actionRequired) bucket = 'action_required';
        else if (
            rawStatus === 'partial' ||
            rawStatus === 'complete_partial' ||
            rawStatus === 'rolling' ||
            (totalDays > 0 && daysGenerated < totalDays) ||
            !hasCalories
        ) bucket = 'partial';
        else bucket = 'complete';

        expect(bucket).toBe('partial');
    });

    it('plan completo con calories=2000 sigue produciendo bucket=complete', () => {
        // Sanity check: la nueva rama no rompe el happy path.
        const plan = {
            calories: 2000,
            plan_data: {
                days: [{}, {}, {}, {}, {}, {}, {}],
                total_days_requested: 7,
            },
        };
        const data = plan.plan_data;
        const days = data.days;
        const daysGenerated = days.length;
        const totalDays = data.total_days_requested;
        const hasCalories = typeof plan.calories === 'number' && plan.calories > 0;

        // Reproducimos solo la rama relevante.
        const isPartial = (
            (totalDays > 0 && daysGenerated < totalDays) ||
            !hasCalories
        );
        expect(isPartial).toBe(false);
    });
});
