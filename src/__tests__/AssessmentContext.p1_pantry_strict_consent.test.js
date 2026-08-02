// [P1-PANTRY-STRICT-CONSENT · 2026-08-02] `regenerateSingleMeal` (AssessmentContext.jsx)
// gana un parámetro `allowNewIngredients` (consentimiento explícito del usuario) y detecta
// la respuesta soft `needs_new_ingredients` del backend ANTES del check `swap_failed`
// existente — retorna un objeto `{ needsConsent, missing, message }` en vez de null/string
// para que el caller (Dashboard.jsx) distinga "hay que preguntar" de "éxito"/"fallo genérico".
//
// Test parser-based (mismo patrón que los demás tests de este archivo cuando existen —
// AssessmentContext.jsx es demasiado pesado para importar/renderizar en un test unitario).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _src = readFileSync(join(__dirname, '..', 'context', 'AssessmentContext.jsx'), 'utf-8');

function _sliceFrom(marker, len = 4000) {
    const i = _src.indexOf(marker);
    expect(i, `marcador no encontrado: ${marker}`).toBeGreaterThan(-1);
    return _src.slice(i, i + len);
}

describe('P1-PANTRY-STRICT-CONSENT (AssessmentContext.regenerateSingleMeal)', () => {
    it('regenerateSingleMeal acepta allowNewIngredients (default null) como 7º parámetro', () => {
        expect(_src).toContain(
            "const regenerateSingleMeal = async (dayIndex, mealIndex, mealType, currentName, "
            + "swapReason = 'dislike', liveInventory = null, allowNewIngredients = null) => {"
        );
    });

    it('el body del POST solo incluye allow_new_ingredients cuando hay contenido real', () => {
        const win = _sliceFrom("const API_SWAP_URL = '/api/plans/swap-meal'", 2600);
        expect(win).toContain('...(Array.isArray(allowNewIngredients) && allowNewIngredients.length > 0');
        expect(win).toContain('{ allow_new_ingredients: allowNewIngredients }');
    });

    it('needs_new_ingredients se chequea ANTES que swap_failed y retorna un objeto de consentimiento', () => {
        const win = _sliceFrom('const newMealData = await response.json();', 1800);
        const iNeeds = win.indexOf("newMealData?.needs_new_ingredients === true");
        const iFailed = win.indexOf("newMealData?.swap_failed === true");
        expect(iNeeds).toBeGreaterThan(-1);
        expect(iFailed).toBeGreaterThan(iNeeds);
        const needsWin = win.slice(iNeeds, iFailed);
        expect(needsWin).toContain('needsConsent: true');
        expect(needsWin).toContain('missing: newMealData.missing_ingredients || []');
        expect(needsWin).toContain('message: newMealData.message');
    });

    it('marker anchor presente', () => {
        expect(_src).toContain('P1-PANTRY-STRICT-CONSENT');
    });
});
