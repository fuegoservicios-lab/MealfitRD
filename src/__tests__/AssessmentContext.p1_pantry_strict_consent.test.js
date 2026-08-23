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
        // [P1-STAPLE-FOODS · 2026-08-02] ventana ampliada 2600→2900: se insertó el campo
        // `staple_foods` (básicos del usuario) entre `dislikes` y `liked_meals` del mismo body.
        const win = _sliceFrom("const API_SWAP_URL = '/api/plans/swap-meal'", 2900);
        expect(win).toContain('...(Array.isArray(allowNewIngredients) && allowNewIngredients.length > 0');
        expect(win).toContain('{ allow_new_ingredients: allowNewIngredients }');
    });

    it('needs_new_ingredients se chequea ANTES que swap_failed y retorna un objeto de consentimiento', () => {
        // [P1-I18N-CONSENT-MODAL-SERVIDOR-GANA · 2026-08-23] Acotado por ESTRUCTURA (de
        // un `if` al siguiente), no por un presupuesto de 1.800 caracteres que el comentario
        // del arreglo desbordaba. Y `message` se ancla por PROPIEDAD —que venga resuelto por
        // `mensajeDeError`, o sea por CÓDIGO y traducido— en vez de clavar la grafía
        // `message: newMealData.message`, que era exactamente el defecto: el español del
        // servidor ganando sobre un fallback que además no pasaba por `t()`.
        const iNeeds = _src.indexOf("newMealData?.needs_new_ingredients === true");
        const iFailed = _src.indexOf("newMealData?.swap_failed === true");
        expect(iNeeds).toBeGreaterThan(-1);
        expect(iFailed).toBeGreaterThan(iNeeds);
        const needsWin = _src.slice(iNeeds, iFailed);
        expect(needsWin).toContain('needsConsent: true');
        expect(needsWin).toContain('missing: newMealData.missing_ingredients || []');
        expect(needsWin).toMatch(/message:\s*mensajeDeError\(newMealData,/);
    });

    it('marker anchor presente', () => {
        expect(_src).toContain('P1-PANTRY-STRICT-CONSENT');
    });
});
