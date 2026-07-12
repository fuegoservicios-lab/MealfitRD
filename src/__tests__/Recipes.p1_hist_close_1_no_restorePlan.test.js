// [P1-HIST-CLOSE-1 · 2026-05-10] Recipes.jsx NO debe usar `restorePlan`
// del AssessmentContext para persistir mutaciones de plan desde el cliente.
//
// Historia:
//   - Bug original (audit Historial 2026-05-09): `handleCookClick` llamaba
//     `restorePlan(planData)` tras recibir `expanded_recipe`, duplicando el
//     write server-side de `/api/plans/recipe/expand` y arrastrando
//     name/calories/macros stale del cliente (drift plan_data ↔ columnas
//     top-level, mismo modo de fallo que P0-HIST-2 cerró en Historial).
//     El fix P1-HIST-CLOSE-1 dropeó la llamada: server-side persist = SSOT.
//   - [P-RECIPES-COOK-REMOVED · 2026-07-12] El flujo "Cocinar" COMPLETO se
//     retiró del producto (botón, CookingModeOverlay, expansión LLM y
//     registro de consumo). Recipes.jsx quedó read-only sobre el plan: su
//     única acción es generar el PDF localmente. Este test se actualizó de
//     "no duplicar el write del expand" a la invariante más fuerte:
//     Recipes.jsx no tiene NINGÚN write path (ni restorePlan, ni fetch
//     mutante, ni localStorage del plan) y las vistas no reintroducen el
//     botón "Cocinar".
//
// Si un futuro cambio reintroduce el patrón, este test falla y bloquea el
// merge — leer la memoria del cierre antes de relajarlo.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _RECIPES_PATH = join(__dirname, '..', 'pages', 'Recipes.jsx');
const _VIEW_PATH = join(__dirname, '..', 'components', 'recipes', 'RecipesView.jsx');
const _MOBILE_PATH = join(__dirname, '..', 'components', 'recipes', 'MobileRecipes.jsx');

const src = readFileSync(_RECIPES_PATH, 'utf8');
const viewSrc = readFileSync(_VIEW_PATH, 'utf8');
const mobileSrc = readFileSync(_MOBILE_PATH, 'utf8');

// Los comentarios narran la historia (mencionan restorePlan, el endpoint
// expand, etc.) — se excluyen antes de matchear código.
const stripComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')           // /* ... */
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');      // // ... (preserva URLs)

const codeOnly = stripComments(src);

describe('[P1-HIST-CLOSE-1] Recipes.jsx no usa restorePlan (server-side SSOT)', () => {
    it('marca el bloque con los anchors [P1-HIST-CLOSE-1 · 2026-05-10] y [P-RECIPES-COOK-REMOVED · 2026-07-12]', () => {
        expect(src).toMatch(/\[P1-HIST-CLOSE-1\s*·\s*2026-05-10\]/);
        expect(src).toMatch(/\[P-RECIPES-COOK-REMOVED\s*·\s*2026-07-12\]/);
    });

    it('NO destructura `restorePlan` del useAssessment()', () => {
        const _destructureWithRestorePlan =
            /const\s*\{[^}]*\brestorePlan\b[^}]*\}\s*=\s*useAssessment\s*\(\s*\)/;
        expect(src).not.toMatch(_destructureWithRestorePlan);
    });

    it('NO invoca `restorePlan(...)` en ningún call site', () => {
        expect(codeOnly).not.toMatch(/\brestorePlan\s*\(/);
    });

    it('NO importa `restorePlan` desde context ni config/api', () => {
        expect(src).not.toMatch(
            /import\s*\{[^}]*\brestorePlan\b[^}]*\}\s*from\s*['"][^'"]*context\/AssessmentContext/
        );
        expect(src).not.toMatch(
            /import\s*\{[^}]*\brestorePlan\b[^}]*\}\s*from\s*['"][^'"]*config\/api/
        );
    });
});

describe('[P-RECIPES-COOK-REMOVED] Recipes.jsx es read-only sobre el plan', () => {
    it('NO importa fetchWithAuth (cero requests mutantes desde esta página)', () => {
        expect(codeOnly).not.toMatch(/\bfetchWithAuth\b/);
    });

    it('NO invoca el endpoint de expansión /api/plans/recipe/expand en código', () => {
        expect(codeOnly).not.toMatch(/\/api\/plans\/recipe\/expand/);
    });

    it('NO persiste el plan a localStorage (safeLocalStorageSet/setItem de mealfit_plan)', () => {
        expect(codeOnly).not.toMatch(/safeLocalStorageSet\s*\(\s*['"]mealfit_plan['"]/);
        expect(codeOnly).not.toMatch(/localStorage\.setItem\s*\(\s*['"]mealfit_plan['"]/);
    });

    it('comenta que el persist server-side era el SSOT (anchor pedagógico)', () => {
        expect(src).toMatch(/\/api\/plans\/recipe\/expand/); // en la narrativa del comment
        expect(src).toMatch(/server-side/);
    });
});

describe('[P-RECIPES-COOK-REMOVED] las vistas no reintroducen el botón "Cocinar"', () => {
    it.each([
        ['RecipesView.jsx', viewSrc],
        ['MobileRecipes.jsx', mobileSrc],
    ])('%s no renderiza "Cocinar" ni consume onCook/isExpanding', (_name, s) => {
        const code = stripComments(s);
        expect(code).not.toMatch(/Cocinar/);
        expect(code).not.toMatch(/\bonCook\b/);
        expect(code).not.toMatch(/\bisExpanding\b/);
    });

    it.each([
        ['RecipesView.jsx', viewSrc],
        ['MobileRecipes.jsx', mobileSrc],
    ])('%s conserva la acción de PDF (onPDF)', (_name, s) => {
        expect(stripComments(s)).toMatch(/\bonPDF\b/);
    });
});
