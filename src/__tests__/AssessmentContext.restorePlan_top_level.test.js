// [P0-HIST-2 · 2026-05-09] Tests estáticos del legacy `restorePlan` en
// AssessmentContext.jsx — debe derivar `name/calories/macros` desde
// `pastPlanData` y mandarlas al UPDATE de Supabase, no solo `plan_data`.
//
// Bug original (audit historial 2026-05-08):
//   La función legacy hacía `update({ plan_data: pastPlanData })` y nada
//   más. Las columnas top-level (`name`, `calories`, `macros`,
//   `meal_names`, `ingredients`, `techniques`) que el Dashboard.jsx lee
//   directo de la fila quedaban con la metadata del plan rechazado.
//   Síntoma visible: tras "Reject regen" en Plan.jsx, el header del
//   Dashboard mostraba el nombre/kcal del plan rechazado pero los días
//   eran del plan anterior → drift visible.
//
// Fix:
//   El UPDATE coalesce `name/calories/macros` desde `pastPlanData`
//   cuando son derivables de forma segura (string no-vacío / number
//   finite / object no-array). El flujo desde Historial usa el
//   endpoint atómico (P0-HIST-1) que cubre las 6 columnas + cancel
//   chunks; este path legacy es para Plan.jsx (revertir regen) y
//   Recipes.jsx (sync defensivo) donde no hay `id` ni chunks
//   pendientes a cancelar.
//
// Cobertura (regex sobre el source):
//   - El UPDATE construye un `updates` object (no literal directo).
//   - Cada una de las 3 columnas se incluye condicionalmente.
//   - `calories` cae a `totalCalories` si la primera no existe.
//   - Validación de tipos (no-Array para macros, finite para calories).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _CONTEXT_PATH = join(
    __dirname, '..', 'context', 'AssessmentContext.jsx'
);

const src = readFileSync(_CONTEXT_PATH, 'utf8');

// Aislar el cuerpo de `restorePlan` (legacy, NO `restorePlanFromHistory`)
// para que los tests no matcheen accidentalmente fragments de la
// variante atómica.
function _extractLegacyRestoreBody() {
    const startIdx = src.indexOf('const restorePlan = async (pastPlanData)');
    expect(startIdx).toBeGreaterThan(-1);
    // El body legacy termina antes del comentario del nuevo helper.
    const endMarker = '// [P0-HIST-1 · 2026-05-09] Restauración atómica desde Historial';
    const endIdx = src.indexOf(endMarker, startIdx);
    expect(endIdx).toBeGreaterThan(startIdx);
    return src.slice(startIdx, endIdx);
}

describe('[P0-HIST-2] legacy restorePlan — top-level columns derivadas', () => {
    const body = _extractLegacyRestoreBody();

    it('marca el bloque con el anchor [P0-HIST-2 · 2026-05-09]', () => {
        // Anchor visible en el código fuente para que el grep desde
        // memoria/CLAUDE.md encuentre el cierre.
        expect(body).toMatch(/\[P0-HIST-2\s*·\s*2026-05-09\]/);
    });

    it('construye un objeto `updates` (no literal {plan_data: ...})', () => {
        // El bug original era literal `update({ plan_data: pastPlanData })`.
        // El fix construye un objeto mutable que recolecta columnas
        // top-level. Si alguien revierte al patrón literal, este test falla.
        expect(body).toMatch(/const\s+updates\s*=\s*\{\s*plan_data\s*:\s*pastPlanData\s*\}/);
        expect(body).not.toMatch(/\.update\(\s*\{\s*plan_data\s*:\s*pastPlanData\s*\}\s*\)/);
        expect(body).toMatch(/\.update\(\s*updates\s*\)/);
    });

    it('agrega `name` solo si pastPlanData.name es string no-vacío', () => {
        expect(body).toMatch(
            /typeof\s+pastPlanData\?\.name\s*===\s*['"]string['"]/
        );
        expect(body).toMatch(/pastPlanData\.name\.trim\(\)/);
        expect(body).toMatch(/updates\.name\s*=\s*pastPlanData\.name/);
    });

    it('deriva `calories` con fallback a totalCalories y validación finita', () => {
        // Coalesce explícito `?? totalCalories` para que un plan_data
        // que use cualquiera de las dos formas funcione.
        expect(body).toMatch(
            /pastPlanData\?\.calories\s*\?\?\s*pastPlanData\?\.totalCalories/
        );
        // Number.isFinite descarta NaN/Infinity (un cron mal-implementado
        // podría haber persistido valores no-finitos).
        expect(body).toMatch(/Number\.isFinite\(\s*_calories\s*\)/);
        expect(body).toMatch(/updates\.calories\s*=\s*_calories/);
    });

    it('agrega `macros` solo si es objeto plain (no array, no null)', () => {
        // typeof null === 'object' en JS, así que el check explícito
        // contra null + Array.isArray es necesario.
        expect(body).toMatch(/pastPlanData\?\.macros\s*&&/);
        expect(body).toMatch(/typeof\s+pastPlanData\.macros\s*===\s*['"]object['"]/);
        expect(body).toMatch(/!\s*Array\.isArray\(\s*pastPlanData\.macros\s*\)/);
        expect(body).toMatch(/updates\.macros\s*=\s*pastPlanData\.macros/);
    });

    it('NO toca meal_names/ingredients/techniques (server-derived)', () => {
        // Esas 3 columnas las popula el backend en
        // _save_plan_and_track_background a partir del plan completo.
        // Reconstruirlas client-side dejaría drift; este path legacy
        // las omite intencionalmente y deja que el próximo save las
        // converja. Si un futuro contributor agrega `updates.meal_names`
        // este test alerta para que justifique la decisión.
        expect(body).not.toMatch(/updates\.meal_names\s*=/);
        expect(body).not.toMatch(/updates\.ingredients\s*=/);
        expect(body).not.toMatch(/updates\.techniques\s*=/);
    });

    it('comenta que el flujo Historial debe usar restorePlanFromHistory', () => {
        // Anchor pedagógico para que un futuro reader entienda por qué
        // este path NO cubre las 6 columnas (la variante atómica sí).
        expect(body).toMatch(/restorePlanFromHistory/);
        expect(body).toMatch(/P0-HIST-1/);
    });
});
