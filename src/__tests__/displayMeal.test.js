// [P1-PLAN-DISPLAY-I18N · 2026-08-19] Unit tests del helper SSOT de la capa
// de display i18n del plan (frontend/src/utils/displayMeal.js) + parser
// blanket de que las superficies Plan (Dashboard.jsx) y Recetas
// (Recipes.jsx) consumen el helper en vez de leer `_display` directo — ver
// docs/superpowers/specs/2026-08-19-plan-display-i18n-design.md, sección
// "Frontend (fase 1)".
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mealDisplay, mealDisplayName } from '../utils/displayMeal';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_MEAL = Object.freeze({
    meal: 'Desayuno',
    name: 'Mangú con salami',
    desc: 'Plátano verde majado con salami frito.',
    cals: 450,
    recipe: ['Hervir el plátano.', 'Majar con mantequilla.', 'Freír el salami.'],
    ingredients: ['3 plátanos verdes', '100 g salami', '1 cda mantequilla'],
});

describe('mealDisplay — null-safety', () => {
    it('meal null/undefined -> objeto de vacíos seguros', () => {
        expect(mealDisplay(null, 'en-US')).toEqual({
            name: '', description: '', recipe: [], ingredients: [],
        });
        expect(mealDisplay(undefined, 'en-US')).toEqual({
            name: '', description: '', recipe: [], ingredients: [],
        });
    });

    it('meal no-objeto (string/number) -> vacíos seguros, no lanza', () => {
        expect(() => mealDisplay('no-un-meal', 'en-US')).not.toThrow();
        expect(mealDisplay(42, 'en-US')).toEqual({
            name: '', description: '', recipe: [], ingredients: [],
        });
    });

    it('locale ausente/undefined no lanza y cae a los originales', () => {
        expect(mealDisplay(BASE_MEAL, undefined)).toEqual({
            name: BASE_MEAL.name,
            description: BASE_MEAL.desc,
            recipe: BASE_MEAL.recipe,
            ingredients: BASE_MEAL.ingredients,
        });
    });
});

describe('mealDisplay — es-DO / sin _display', () => {
    it('meal sin `_display` en absoluto -> devuelve los originales', () => {
        expect(mealDisplay(BASE_MEAL, 'en-US')).toEqual({
            name: BASE_MEAL.name,
            description: BASE_MEAL.desc,
            recipe: BASE_MEAL.recipe,
            ingredients: BASE_MEAL.ingredients,
        });
    });

    it('locale es-DO nunca consulta `_display` aunque exista para otro locale', () => {
        const meal = {
            ...BASE_MEAL,
            _display: {
                'en-US': {
                    name: 'Mangú with salami',
                    description: 'Mashed green plantain with fried salami.',
                    recipe: ['Boil the plantain.', 'Mash with butter.', 'Fry the salami.'],
                    ingredients: ['3 green plantains', '100 g salami (salami)', '1 tbsp butter'],
                },
            },
        };
        expect(mealDisplay(meal, 'es-DO')).toEqual({
            name: BASE_MEAL.name,
            description: BASE_MEAL.desc,
            recipe: BASE_MEAL.recipe,
            ingredients: BASE_MEAL.ingredients,
        });
    });

    it('`_display` presente pero sin entrada para el locale pedido -> originales', () => {
        const meal = {
            ...BASE_MEAL,
            _display: { 'fr-FR': { name: 'x', description: 'y', recipe: BASE_MEAL.recipe, ingredients: BASE_MEAL.ingredients } },
        };
        expect(mealDisplay(meal, 'en-US').name).toBe(BASE_MEAL.name);
    });
});

describe('mealDisplay — fallback total (todos los campos traducidos y válidos)', () => {
    const EN = {
        name: 'Mangú with salami',
        description: 'Mashed green plantain with fried salami.',
        recipe: ['Boil the plantain.', 'Mash with butter.', 'Fry the salami.'],
        ingredients: ['3 green plantains (plátanos verdes)', '100 g salami (salami)', '1 tbsp butter (mantequilla)'],
    };
    const meal = { ...BASE_MEAL, _display: { 'en-US': EN } };

    it('devuelve TODOS los campos traducidos', () => {
        expect(mealDisplay(meal, 'en-US')).toEqual(EN);
    });

    it('mealDisplayName es el atajo del campo name', () => {
        expect(mealDisplayName(meal, 'en-US')).toBe(EN.name);
    });
});

describe('mealDisplay — fallback parcial por campo', () => {
    it('name traducido, description ausente -> description cae a `meal.desc`', () => {
        const meal = {
            ...BASE_MEAL,
            _display: {
                'en-US': {
                    name: 'Mangú with salami',
                    recipe: BASE_MEAL.recipe,
                    ingredients: BASE_MEAL.ingredients,
                    // description ausente a propósito
                },
            },
        };
        const d = mealDisplay(meal, 'en-US');
        expect(d.name).toBe('Mangú with salami');
        expect(d.description).toBe(BASE_MEAL.desc);
    });

    it('description vacía ("") se trata como ausente -> cae al original', () => {
        const meal = {
            ...BASE_MEAL,
            _display: {
                'en-US': {
                    name: 'Mangú with salami',
                    description: '   ',
                    recipe: BASE_MEAL.recipe,
                    ingredients: BASE_MEAL.ingredients,
                },
            },
        };
        expect(mealDisplay(meal, 'en-US').description).toBe(BASE_MEAL.desc);
    });

    it('name ausente/vacío -> name cae al original mientras description sí se traduce', () => {
        const meal = {
            ...BASE_MEAL,
            _display: {
                'en-US': {
                    name: '',
                    description: 'Mashed green plantain with fried salami.',
                    recipe: BASE_MEAL.recipe,
                    ingredients: BASE_MEAL.ingredients,
                },
            },
        };
        const d = mealDisplay(meal, 'en-US');
        expect(d.name).toBe(BASE_MEAL.name);
        expect(d.description).toBe('Mashed green plantain with fried salami.');
    });
});

describe('mealDisplay — arrays: length-mismatch descarta el array entero al original', () => {
    it('recipe con longitud distinta a la original -> recipe ENTERO cae al original', () => {
        const meal = {
            ...BASE_MEAL,
            _display: {
                'en-US': {
                    name: 'Mangú with salami',
                    description: 'Mashed green plantain with fried salami.',
                    recipe: ['Boil the plantain.', 'Mash with butter.'], // 2, original tiene 3
                    ingredients: ['3 green plantains (plátanos verdes)', '100 g salami (salami)', '1 tbsp butter (mantequilla)'],
                },
            },
        };
        const d = mealDisplay(meal, 'en-US');
        expect(d.recipe).toEqual(BASE_MEAL.recipe);
        // ingredients (longitud correcta) sí se traduce — el descarte es POR CAMPO.
        expect(d.ingredients).not.toEqual(BASE_MEAL.ingredients);
    });

    it('ingredients con longitud distinta -> ingredients ENTERO cae al original', () => {
        const meal = {
            ...BASE_MEAL,
            _display: {
                'en-US': {
                    name: 'Mangú with salami',
                    description: 'Mashed green plantain with fried salami.',
                    recipe: ['Boil the plantain.', 'Mash with butter.', 'Fry the salami.'],
                    ingredients: ['3 green plantains (plátanos verdes)'], // 1, original tiene 3
                },
            },
        };
        const d = mealDisplay(meal, 'en-US');
        expect(d.ingredients).toEqual(BASE_MEAL.ingredients);
        expect(d.recipe).not.toEqual(BASE_MEAL.recipe);
    });

    it('recipe/ingredients no-array en `_display` -> cae al original (defensa de tipo)', () => {
        const meal = {
            ...BASE_MEAL,
            _display: {
                'en-US': {
                    name: 'Mangú with salami',
                    description: 'Mashed green plantain with fried salami.',
                    recipe: 'not-an-array',
                    ingredients: null,
                },
            },
        };
        const d = mealDisplay(meal, 'en-US');
        expect(d.recipe).toEqual(BASE_MEAL.recipe);
        expect(d.ingredients).toEqual(BASE_MEAL.ingredients);
    });

    it('arrays vacíos en ambos lados (original y traducido) -> longitud 0 === 0 es válida', () => {
        const meal = {
            meal: 'Merienda',
            name: 'Batido',
            desc: 'Batido de frutas.',
            recipe: [],
            ingredients: [],
            _display: {
                'en-US': {
                    name: 'Smoothie',
                    description: 'Fruit smoothie.',
                    recipe: [],
                    ingredients: [],
                },
            },
        };
        const d = mealDisplay(meal, 'en-US');
        expect(d.recipe).toEqual([]);
        expect(d.ingredients).toEqual([]);
        expect(d.name).toBe('Smoothie');
    });
});

describe('mealDisplay — no-mutación', () => {
    it('un meal congelado (Object.freeze) sobrevive intacto a mealDisplay', () => {
        const frozenMeal = Object.freeze({
            ...BASE_MEAL,
            _display: Object.freeze({
                'en-US': Object.freeze({
                    name: 'Mangú with salami',
                    description: 'Mashed green plantain with fried salami.',
                    recipe: Object.freeze(['Boil the plantain.', 'Mash with butter.', 'Fry the salami.']),
                    ingredients: Object.freeze(['3 green plantains (plátanos verdes)', '100 g salami (salami)', '1 tbsp butter (mantequilla)']),
                }),
            }),
        });
        expect(() => mealDisplay(frozenMeal, 'en-US')).not.toThrow();
        const before = JSON.stringify(frozenMeal);
        mealDisplay(frozenMeal, 'en-US');
        mealDisplay(frozenMeal, 'es-DO');
        mealDisplay(frozenMeal, 'fr-FR');
        expect(JSON.stringify(frozenMeal)).toBe(before);
    });

    it('el objeto devuelto NO es el mismo objeto `meal` ni su `_display`', () => {
        const meal = { ...BASE_MEAL, _display: { 'en-US': { name: 'X', description: 'Y', recipe: BASE_MEAL.recipe, ingredients: BASE_MEAL.ingredients } } };
        const d = mealDisplay(meal, 'en-US');
        expect(d).not.toBe(meal);
        expect(d).not.toBe(meal._display['en-US']);
    });

    it('llamar mealDisplay con distintos locales sobre el MISMO meal no se contamina entre llamadas', () => {
        const meal = {
            ...BASE_MEAL,
            _display: {
                'en-US': { name: 'EN name', description: 'EN desc', recipe: BASE_MEAL.recipe, ingredients: BASE_MEAL.ingredients },
                'fr-FR': { name: 'FR name', description: 'FR desc', recipe: BASE_MEAL.recipe, ingredients: BASE_MEAL.ingredients },
            },
        };
        expect(mealDisplay(meal, 'en-US').name).toBe('EN name');
        expect(mealDisplay(meal, 'fr-FR').name).toBe('FR name');
        expect(mealDisplay(meal, 'es-DO').name).toBe(BASE_MEAL.name);
        // Repetir en-US tras haber leído otros locales: sigue estable.
        expect(mealDisplay(meal, 'en-US').name).toBe('EN name');
    });
});

// ---------------------------------------------------------------------------
// OLA FINAL · FF-4 — el FALLBACK devuelve el valor ORIGINAL TAL CUAL.
//
// La v1 normalizaba también el camino de fallback (`Array.isArray(meal.recipe) ?
// meal.recipe : []`) y eso DESARMÓ una defensa viva: `recipe` puede ser un string
// legacy (P2-RECIPE-DISCLAIMER-LIST — planes viejos, disclaimer de macro-balancing
// pre-fix), `toRecipeSteps` en Recipes.jsx existe justo para coercerlo a `[string]`,
// y al colapsarlo a `[]` ANTES el usuario perdía la receta ENTERA. Medido por el
// reviewer de fase: ANTES `["Hervir el plátano y majarlo."]`, DESPUÉS `[]` — en
// TODOS los locales, es-DO incluido (la única rotura real de la byte-identidad).
//
// Regla anclada aquí: este helper decide QUÉ valor mostrar, jamás cambia la FORMA
// de lo que el meal ya traía. La normalización es exclusiva del camino `_display`.
// ---------------------------------------------------------------------------

// Copia EXACTA de la coerción de Recipes.jsx (`toRecipeSteps`) — el consumidor real
// del `recipe` que devuelve el helper. Su presencia allí la ancla el parser de abajo.
const _toRecipeSteps = (r) =>
    Array.isArray(r) ? r : (typeof r === 'string' && r.trim() ? [r] : []);

describe('mealDisplay — FF-4: el fallback no normaliza la forma del original', () => {
    const LEGACY_MEAL = Object.freeze({
        meal: 'Desayuno',
        name: 'Mangú',
        desc: 'Plátano verde majado.',
        recipe: 'Hervir el plátano y majarlo.', // string legacy, NO array
        ingredients: ['3 plátanos verdes'],
    });

    it('recipe string legacy sobrevive TAL CUAL en es-DO (no se colapsa a [])', () => {
        const d = mealDisplay(LEGACY_MEAL, 'es-DO');
        expect(d.recipe).toBe('Hervir el plátano y majarlo.');
        expect(d.recipe).not.toEqual([]);
    });

    it('la probe del reviewer: tras `toRecipeSteps` el usuario recupera su paso', () => {
        expect(_toRecipeSteps(mealDisplay(LEGACY_MEAL, 'es-DO').recipe))
            .toEqual(['Hervir el plátano y majarlo.']);
        expect(_toRecipeSteps(mealDisplay(LEGACY_MEAL, 'en-US').recipe))
            .toEqual(['Hervir el plátano y majarlo.']);
    });

    it('un `_display` con recipe array NO puede ganarle a un original string legacy', () => {
        const meal = {
            ...LEGACY_MEAL,
            _display: {
                'en-US': {
                    name: 'Mashed plantain',
                    description: 'Mashed green plantain.',
                    recipe: ['Boil the plantain and mash it.'], // longitud incomparable
                    ingredients: ['3 green plantains (plátanos verdes)'],
                },
            },
        };
        const d = mealDisplay(meal, 'en-US');
        expect(d.recipe).toBe('Hervir el plátano y majarlo.');
        // El resto de campos SÍ se traduce: el descarte sigue siendo POR CAMPO.
        expect(d.name).toBe('Mashed plantain');
        expect(d.ingredients).toEqual(['3 green plantains (plátanos verdes)']);
    });

    it('ingredients no-array legacy también sobrevive TAL CUAL', () => {
        const meal = { name: 'X', desc: 'Y', recipe: [], ingredients: '100 g salami' };
        expect(mealDisplay(meal, 'es-DO').ingredients).toBe('100 g salami');
        expect(mealDisplay(meal, 'en-US').ingredients).toBe('100 g salami');
    });

    it('campos AUSENTES siguen cayendo a vacíos seguros (contrato de desestructuración)', () => {
        const d = mealDisplay({ meal: 'Cena' }, 'en-US');
        expect(d).toEqual({ name: '', description: '', recipe: [], ingredients: [] });
    });

    it('`description` como respaldo de `desc` sigue vivo', () => {
        const d = mealDisplay({ name: 'X', description: 'desde description' }, 'en-US');
        expect(d.description).toBe('desde description');
    });
});

// ---------------------------------------------------------------------------
// Parser blanket: las superficies Plan (Dashboard.jsx) y Recetas (Recipes.jsx)
// consumen el helper — NUNCA acceden a `_display` directo. Mismo patrón que
// otros tests parser-based del repo (tooltip-anchor: si el nombre del import
// o el patrón `_display[` cambian de forma, este test debe fallar ANTES de
// que el acceso directo llegue a producción).
// ---------------------------------------------------------------------------
function _readSrc(relPath) {
    return readFileSync(join(__dirname, '..', relPath), 'utf-8');
}

describe('Plan/Recetas consumen mealDisplay — NO acceso directo a `_display`', () => {
    it('Dashboard.jsx importa mealDisplay/mealDisplayName desde utils/displayMeal', () => {
        const src = _readSrc('pages/Dashboard.jsx');
        expect(src).toMatch(/from ['"]\.\.\/utils\/displayMeal['"]/);
        expect(/\bmealDisplay(Name)?\(/.test(src)).toBe(true);
    });

    it('Dashboard.jsx nunca lee `._display[` directo (fuera del import)', () => {
        const src = _readSrc('pages/Dashboard.jsx');
        expect(src).not.toMatch(/\._display\[/);
    });

    it('Recipes.jsx importa mealDisplay/mealDisplayName desde utils/displayMeal', () => {
        const src = _readSrc('pages/Recipes.jsx');
        expect(src).toMatch(/from ['"]\.\.\/utils\/displayMeal['"]/);
        expect(/\bmealDisplay(Name)?\(/.test(src)).toBe(true);
    });

    it('Recipes.jsx nunca lee `._display[` directo (fuera del import)', () => {
        const src = _readSrc('pages/Recipes.jsx');
        expect(src).not.toMatch(/\._display\[/);
    });

    it('FF-4: Recipes.jsx conserva la coerción `toRecipeSteps` sobre lo que devuelve el helper', () => {
        const src = _readSrc('pages/Recipes.jsx');
        // La defensa de P2-RECIPE-DISCLAIMER-LIST es la que convierte el string legacy que
        // el helper devuelve TAL CUAL en `[string]`. Si alguien la borra creyendo que el
        // helper ya normaliza, vuelve el crash de `.map` sobre un String.
        expect(src).toMatch(/const toRecipeSteps = \(r\) =>/);
        expect(src).toMatch(/toRecipeSteps\(_activeDisplay\.recipe\)/);
    });

    it('RecipesView.jsx y MobileRecipes.jsx (vistas presentacionales) tampoco leen `_display` directo', () => {
        const rv = _readSrc('components/recipes/RecipesView.jsx');
        const mr = _readSrc('components/recipes/MobileRecipes.jsx');
        expect(rv).not.toMatch(/\._display\[/);
        expect(mr).not.toMatch(/\._display\[/);
    });
});
