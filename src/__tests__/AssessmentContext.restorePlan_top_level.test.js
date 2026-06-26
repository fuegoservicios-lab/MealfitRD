// [P0-HIST-2 · 2026-05-09] Tests estáticos del legacy `restorePlan` en
// AssessmentContext.jsx — debe derivar `name/calories/macros` desde
// `pastPlanData` y mandarlas al request body del endpoint `/restore-local`
// (P1-OPEN-1 · migración Neon), no solo `plan_data`.
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
//   El request body coalesce `name/calories/macros` desde `pastPlanData`
//   cuando son derivables de forma segura (string no-vacío / number
//   finite / object no-array). El flujo desde Historial usa el
//   endpoint atómico (P0-HIST-1) que cubre las 6 columnas + cancel
//   chunks; este path legacy es para Plan.jsx (revertir regen) y
//   Recipes.jsx (sync defensivo) donde no hay `id` ni chunks
//   pendientes a cancelar.
//
// Cobertura (regex sobre el source):
//   - El write (POST /restore-local) construye un `restoreBody` object (no literal directo).
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
    // [signature drift · migración Neon] La firma pasó a
    // `const restorePlan = async (pastPlanData, expectedUserId = null)` (guard
    // de ownership P1-NEW-4), así que buscamos el prefijo sin el paréntesis de
    // cierre para no acoplarnos a la lista de parámetros.
    const startIdx = src.indexOf('const restorePlan = async (pastPlanData');
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

    it('construye un objeto `restoreBody` mutable (no body literal {plan_data: ...})', () => {
        // El bug original era literal `update({ plan_data: pastPlanData })`.
        // Post P1-OPEN-1 (+migración Neon) el write es el endpoint backend
        // `/api/plans/{plan_id}/restore-local`; el fix construye un objeto
        // mutable `restoreBody` (init `{ plan_data: pastPlanData }`) que
        // recolecta columnas top-level y se envía como `JSON.stringify(restoreBody)`.
        // Si alguien revierte al patrón literal (solo plan_data), este test falla.
        expect(body).toMatch(/const\s+restoreBody\s*=\s*\{\s*plan_data\s*:\s*pastPlanData\s*\}/);
        expect(body).not.toMatch(/JSON\.stringify\s*\(\s*\{\s*plan_data\s*:\s*pastPlanData\s*\}\s*\)/);
        expect(body).toMatch(/restore-local/);
        expect(body).toMatch(/body:\s*JSON\.stringify\s*\(\s*restoreBody\s*\)/);
    });

    it('agrega `name` solo si pastPlanData.name es string no-vacío', () => {
        expect(body).toMatch(
            /typeof\s+pastPlanData\?\.name\s*===\s*['"]string['"]/
        );
        expect(body).toMatch(/pastPlanData\.name\.trim\(\)/);
        expect(body).toMatch(/restoreBody\.name\s*=\s*pastPlanData\.name/);
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
        expect(body).toMatch(/restoreBody\.calories\s*=\s*_calories/);
    });

    it('agrega `macros` solo si es objeto plain (no array, no null)', () => {
        // typeof null === 'object' en JS, así que el check explícito
        // contra null + Array.isArray es necesario.
        expect(body).toMatch(/pastPlanData\?\.macros\s*&&/);
        expect(body).toMatch(/typeof\s+pastPlanData\.macros\s*===\s*['"]object['"]/);
        expect(body).toMatch(/!\s*Array\.isArray\(\s*pastPlanData\.macros\s*\)/);
        expect(body).toMatch(/restoreBody\.macros\s*=\s*pastPlanData\.macros/);
    });

    it('NO toca meal_names/ingredients/techniques (server-derived)', () => {
        // Esas 3 columnas las popula el backend en
        // _save_plan_and_track_background a partir del plan completo.
        // Reconstruirlas client-side dejaría drift; este path legacy
        // las omite intencionalmente y deja que el próximo save las
        // converja. Si un futuro contributor agrega `updates.meal_names`
        // este test alerta para que justifique la decisión.
        expect(body).not.toMatch(/restoreBody\.meal_names\s*=/);
        expect(body).not.toMatch(/restoreBody\.ingredients\s*=/);
        expect(body).not.toMatch(/restoreBody\.techniques\s*=/);
    });

    it('comenta que el flujo Historial debe usar restorePlanFromHistory', () => {
        // Anchor pedagógico para que un futuro reader entienda por qué
        // este path NO cubre las 6 columnas (la variante atómica sí).
        expect(body).toMatch(/restorePlanFromHistory/);
        expect(body).toMatch(/P0-HIST-1/);
    });
});
