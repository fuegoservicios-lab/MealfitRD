// [P1-HIST-CLOSE-1 · 2026-05-10] Recipes.jsx NO debe usar `restorePlan`
// del AssessmentContext para persistir una receta expandida.
//
// Bug original (audit Historial 2026-05-09 follow-up):
//   `handleCookClick` llamaba `restorePlan(planData)` tras recibir la
//   `expanded_recipe` del server. Ese path legacy hacía
//   `update({ plan_data, name, calories, macros }).eq('id', latest)`
//   directo desde el cliente — duplicando el write que el server YA
//   había hecho en `/api/plans/recipe/expand` (plans.py:2860 →
//   update_meal_plan_data) y arrastrando `name/calories/macros` desde
//   el `planData` en memoria del cliente.
//
//   Síntoma: si un chunk worker recalculaba kcal/macros server-side
//   entre el page-load y el cook-click (e.g., al expandir el plan con
//   un nuevo bloque de días), el snapshot del cliente quedaba stale.
//   El write redundante pisaba los valores frescos del server con los
//   stale del cliente → drift `plan_data` ↔ columnas top-level idéntico
//   al que `P0-HIST-2` cerró para el path Historial.
//
//   Fix: droppear la llamada. El server-side persist es SSOT.
//   localStorage update se preserva (consistencia inmediata UI).
//
// Cobertura del test (parser estático sobre Recipes.jsx):
//   1. NO importa `restorePlan` del AssessmentContext.
//   2. NO destructura `restorePlan` del `useAssessment()`.
//   3. NO invoca `restorePlan(...)` en ningún call site.
//   4. SÍ preserva el `localStorage.setItem('mealfit_plan', …)` (el
//      cliente sigue cacheando el plan mutado en LS para que la
//      navegación inmediata a /plan vea la receta expandida sin
//      esperar al refetch del server).
//   5. Marker textual `[P1-HIST-CLOSE-1 · 2026-05-10]` presente como
//      anchor para que un futuro grep desde MEMORY.md encuentre el
//      cierre.
//
// Si Recipes.jsx (o cualquier otro consumidor del flujo de expansión)
// re-introduce el patrón, este test falla y bloquea el merge.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _RECIPES_PATH = join(__dirname, '..', 'pages', 'Recipes.jsx');

const src = readFileSync(_RECIPES_PATH, 'utf8');

describe('[P1-HIST-CLOSE-1] Recipes.jsx no usa restorePlan (server-side SSOT)', () => {
    it('marca el bloque con el anchor [P1-HIST-CLOSE-1 · 2026-05-10]', () => {
        // Anchor visible en el source para que el grep desde memory/
        // MEMORY.md encuentre el cierre. Si alguien revierte el fix, el
        // anchor probablemente desaparece junto al comentario y este
        // test falla por la rama del marker antes que por las otras.
        expect(src).toMatch(/\[P1-HIST-CLOSE-1\s*·\s*2026-05-10\]/);
    });

    it('NO destructura `restorePlan` del useAssessment()', () => {
        // Pre-fix:  `const { planData, formData, restorePlan } = useAssessment();`
        // Post-fix: `const { planData, formData } = useAssessment();`
        // El regex matchea el destructure del context con `restorePlan`
        // en la lista de keys, sin importar el orden.
        const _destructureWithRestorePlan =
            /const\s*\{[^}]*\brestorePlan\b[^}]*\}\s*=\s*useAssessment\s*\(\s*\)/;
        expect(src).not.toMatch(_destructureWithRestorePlan);
    });

    it('NO invoca `restorePlan(...)` en ningún call site', () => {
        // Cualquier `restorePlan(<args>)` en el source es regresión.
        // Excluimos el comment block que MENCIONA `restorePlan` en
        // texto explicativo: removemos comments antes de matchear.
        const _stripped = src
            .replace(/\/\*[\s\S]*?\*\//g, '')           // /* ... */
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1');      // // ...
        expect(_stripped).not.toMatch(/\brestorePlan\s*\(/);
    });

    it('NO importa `restorePlan` desde ../config/api o context', () => {
        // Defensa-en-profundidad: aunque el API actual lo expone vía
        // useAssessment, asegura que un import named directo tampoco
        // se introduzca.
        expect(src).not.toMatch(
            /import\s*\{[^}]*\brestorePlan\b[^}]*\}\s*from\s*['"][^'"]*context\/AssessmentContext/
        );
        expect(src).not.toMatch(
            /import\s*\{[^}]*\brestorePlan\b[^}]*\}\s*from\s*['"][^'"]*config\/api/
        );
    });

    it('preserva el guardado de "mealfit_plan" (safeLocalStorageSet) tras expansión', () => {
        // [P3-RECIPE-SAFE-LS · 2026-05-30] El raw
        // `localStorage.setItem('mealfit_plan', JSON.stringify(planData))` se
        // migró al helper SSOT no-throw `safeLocalStorageSet('mealfit_plan',
        // planData)` (serializa internamente). El localStorage update sigue
        // dentro de `handleCookClick` para que la navegación inmediata a /plan
        // vea la receta expandida sin esperar al refetch del server. Si un
        // revert quita ESTO junto con el restorePlan, el usuario perdería la
        // consistencia inmediata — alertar al reviewer con un test específico.
        expect(src).toMatch(
            /safeLocalStorageSet\s*\(\s*['"]mealfit_plan['"]\s*,\s*planData\s*\)/
        );
    });

    it('comenta que el persist server-side es SSOT (anchor pedagógico)', () => {
        // Verifica que el comentario explicativo apunte al endpoint
        // backend que ya hace el write. Esto previene que un futuro
        // contributor "limpie" el comment sin entender el porqué del
        // path single-write.
        expect(src).toMatch(/\/api\/plans\/recipe\/expand/);
        expect(src).toMatch(/update_meal_plan_data|server-side/);
    });
});
