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
import { mealDisplay, mealDisplayName, mealSlotLabel, mealDifficultyLabel, planInsightsDisplay } from '../utils/displayMeal';

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
// [P1-PLAN-DISPLAY-I18N · fase 1c] `mealSlotLabel` — helper de DISPLAY puro
// del SLOT ("Desayuno"/"Almuerzo"/"Merienda"/"Cena"/"Snack"). A diferencia de
// `mealDisplay`, NUNCA lee `meal._display` (el slot es identificador de
// posición, no contenido del LLM) — es un mapeo directo canónico → t(clave).
// ---------------------------------------------------------------------------

// `t` de prueba: espeja el catálogo real (en-US.json) para las 5 claves.
const _fakeT = (key) => ({
    Desayuno: 'Breakfast',
    Almuerzo: 'Lunch',
    Merienda: 'Snack',
    Cena: 'Dinner',
    Snack: 'Snack',
}[key] ?? key);

describe('mealSlotLabel — canónico exacto', () => {
    it('traduce las 5 claves canónicas', () => {
        expect(mealSlotLabel('Desayuno', _fakeT)).toBe('Breakfast');
        expect(mealSlotLabel('Almuerzo', _fakeT)).toBe('Lunch');
        expect(mealSlotLabel('Merienda', _fakeT)).toBe('Snack');
        expect(mealSlotLabel('Cena', _fakeT)).toBe('Dinner');
        expect(mealSlotLabel('Snack', _fakeT)).toBe('Snack');
    });

    it('case/acento-insensible', () => {
        expect(mealSlotLabel('DESAYUNO', _fakeT)).toBe('Breakfast');
        expect(mealSlotLabel('cena', _fakeT)).toBe('Dinner');
        expect(mealSlotLabel('almuerzo', _fakeT)).toBe('Lunch');
    });
});

describe('mealSlotLabel — variantes por prefijo', () => {
    it('"Merienda AM"/"Merienda PM"/"Merienda Nocturna" traducen SOLO el prefijo', () => {
        expect(mealSlotLabel('Merienda AM', _fakeT)).toBe('Snack AM');
        expect(mealSlotLabel('Merienda PM', _fakeT)).toBe('Snack PM');
        expect(mealSlotLabel('Merienda Nocturna', _fakeT)).toBe('Snack Nocturna');
    });

    it('"Merienda 1"/"Merienda 2" preservan el numeral', () => {
        expect(mealSlotLabel('Merienda 1', _fakeT)).toBe('Snack 1');
        expect(mealSlotLabel('Merienda 2', _fakeT)).toBe('Snack 2');
    });
});

describe('mealSlotLabel — desconocido y bordes', () => {
    it('slot desconocido -> el original TAL CUAL, nunca inventa traducción', () => {
        expect(mealSlotLabel('Postre Especial', _fakeT)).toBe('Postre Especial');
    });

    it('valores no-string/vacíos -> el original tal cual, no lanza', () => {
        expect(mealSlotLabel(null, _fakeT)).toBe(null);
        expect(mealSlotLabel(undefined, _fakeT)).toBe(undefined);
        expect(mealSlotLabel('', _fakeT)).toBe('');
        expect(mealSlotLabel('   ', _fakeT)).toBe('   ');
    });

    it('sin `t` (no-función) -> fallback identidad, no lanza', () => {
        expect(() => mealSlotLabel('Desayuno', undefined)).not.toThrow();
        expect(mealSlotLabel('Desayuno', undefined)).toBe('Desayuno');
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

    // [P1-PLAN-DISPLAY-I18N · fase 1c] Dashboard.jsx consume `mealSlotLabel` para
    // el rótulo del slot ("Desayuno"/"Almuerzo"/...) — antes se renderizaba
    // `meal.meal` crudo (siempre español, sin importar el idioma del dashboard).
    it('Dashboard.jsx importa y usa mealSlotLabel para el rótulo del slot', () => {
        const src = _readSrc('pages/Dashboard.jsx');
        expect(src).toMatch(/\bmealSlotLabel\b/);
        expect(src).toMatch(/mealSlotLabel\(meal\.meal, t\)/);
    });

    it('History.jsx importa mealDisplay/mealSlotLabel desde utils/displayMeal', () => {
        const src = _readSrc('pages/History.jsx');
        expect(src).toMatch(/from ['"]\.\.\/utils\/displayMeal['"]/);
        expect(/\bmealDisplay\(/.test(src)).toBe(true);
        expect(/\bmealSlotLabel\(/.test(src)).toBe(true);
    });

    it('History.jsx nunca lee `._display[` directo (fuera del import)', () => {
        const src = _readSrc('pages/History.jsx');
        expect(src).not.toMatch(/\._display\[/);
    });

    it('HistoryDesktopPanel.jsx / HistoryMobilePanel.jsx (cards del listado) tampoco leen `_display` directo', () => {
        const desktop = _readSrc('components/history/HistoryDesktopPanel.jsx');
        const mobile = _readSrc('components/history/HistoryMobilePanel.jsx');
        expect(desktop).not.toMatch(/\._display\[/);
        expect(mobile).not.toMatch(/\._display\[/);
    });
});

/* [P1-RECIPES-SLOT-I18N · 2026-08-20] Recetas era la única pantalla que pintaba el
 * SLOT en crudo: con la app en inglés decía DESAYUNO / ALMUERZO / MERIENDA / CENA
 * mientras Dashboard e Historial ya pasaban ese mismo campo por `mealSlotLabel`.
 * Otra vez «no faltaba maquinaria, faltaba pedirla».
 *
 * La dificultad es su hermana y necesitaba helper propio. `meal.difficulty` lo
 * escribe el LLM, pero NO es contenido creativo: `schemas.py` fija por defecto
 * «Fácil» y describe el vocabulario, y en producción SOLO existen dos valores
 * (361 «Fácil», 135 «Intermedio»). Es un enum disfrazado de texto libre.
 *
 * La regla que separa esto de los nombres de alimento —que JAMÁS se traducen— no
 * es «lo que escribe el LLM no se toca», es «lo que el motor usa como
 * IDENTIFICADOR no se toca». `pantry_names_match`, el guard de coherencia y el
 * backstop de alergias resuelven por el nombre del alimento; por la dificultad no
 * resuelve nadie.
 */
describe('[P1-RECIPES-SLOT-I18N] mealDifficultyLabel', () => {
    const T = { 'Fácil': 'Easy', 'Intermedio': 'Intermediate', 'Difícil': 'Hard' };
    const t = (k) => T[k] ?? k;

    it('traduce los tres valores canónicos', () => {
        expect(mealDifficultyLabel('Fácil', t)).toBe('Easy');
        expect(mealDifficultyLabel('Intermedio', t)).toBe('Intermediate');
        expect(mealDifficultyLabel('Difícil', t)).toBe('Hard');
    });

    it('tolera acentos y mayúsculas como el hermano de slots', () => {
        expect(mealDifficultyLabel('FACIL', t)).toBe('Easy');
        expect(mealDifficultyLabel('  difícil  ', t)).toBe('Hard');
    });

    it('un valor DESCONOCIDO cae al original, no a un hueco', () => {
        // Fail-open: si el modelo inventa un cuarto nivel, el usuario ve lo que
        // el modelo dijo — no una cadena vacía ni la clave cruda.
        expect(mealDifficultyLabel('Extremo', t)).toBe('Extremo');
    });

    it('sin `t` devuelve el español, nunca revienta', () => {
        expect(mealDifficultyLabel('Fácil')).toBe('Fácil');
        expect(mealDifficultyLabel(null)).toBe(null);
        expect(mealDifficultyLabel('')).toBe('');
    });

    it('los literales viven DENTRO de una función, no en ámbito de módulo', () => {
        // Dos guards en uno. (a) `i18n:check` da por huérfana toda clave que no
        // aparezca como literal en un `t()`: pasarlas por variable las vuelve
        // invisibles y apaga el aviso de «cambiaron el copy y la traducción quedó
        // atrás». (b) Un mapa a nivel de módulo se evalúa al importar, antes de que
        // el catálogo exista, y queda congelado en español para siempre.
        const src = readFileSync(join(__dirname, '..', 'utils', 'displayMeal.js'), 'utf-8');
        expect(src).toMatch(/function _etiquetasDificultad\(t\)/);
        expect(src).toMatch(/t\('Fácil'\)/);
        expect(src).toMatch(/t\('Difícil'\)/);
        expect(src, 'el mapa no puede ser una constante de módulo')
            .not.toMatch(/^const\s+\w*[Dd]ificultad\w*\s*=\s*\{/m);
    });
});

/* [P1-RECIPES-SLOT-I18N · 2026-08-20] El guard que faltaba.
 *
 * Los tests de arriba prueban el HELPER; ninguno probaba que las pantallas lo
 * USARAN. Lo descubrí con una mutación: revertir `mealSlotLabel(m.meal, t)` a
 * `{m.meal}` en RecipesView dejaba los 51 tests en verde — o sea que el bug
 * reportado podía volver sin que nada chistara.
 *
 * Es exactamente el modo de fallo de este P-fix: el helper llevaba meses correcto
 * y bien probado, y Recetas simplemente no lo llamaba. Un helper con tests no es
 * una garantía de nada si sus call sites no están anclados.
 */
describe('[P1-RECIPES-SLOT-I18N] las pantallas de Recetas USAN los helpers', () => {
    const PANTALLAS = [
        'components/recipes/RecipesView.jsx',
        'components/recipes/MobileRecipes.jsx',
    ];

    it.each(PANTALLAS)('%s pinta el slot traducido, no el campo crudo', (rel) => {
        const src = _readSrc(rel);
        expect(src, 'el slot vuelve a salir en español con la app en inglés')
            .not.toMatch(/mealType[^>]*>\{\s*m\.meal\s*\}/);
        expect(src).toMatch(/mealType[^>]*>\{\s*mealSlotLabel\(\s*m\.meal\s*,\s*t\s*\)\s*\}/);
    });

    it.each(PANTALLAS)('%s pinta la dificultad traducida', (rel) => {
        const src = _readSrc(rel);
        expect(src).not.toMatch(/\{\s*meal\.difficulty\s*\}/);
        expect(src).toMatch(/mealDifficultyLabel\(\s*meal\.difficulty\s*,\s*t\s*\)/);
    });

    it('el PDF exporta lo mismo que se ve en pantalla', () => {
        // Un PDF en español desde una pantalla en inglés es la misma incoherencia,
        // solo que en un archivo que el usuario guarda y comparte.
        const src = _readSrc('pages/Recipes.jsx');
        expect(src).toMatch(/mealSlotLabel\(\s*meal\.meal\s*,\s*t\s*\)/);
        expect(src).toMatch(/mealDifficultyLabel\(\s*meal\.difficulty\s*,\s*t\s*\)/);
    });
});

/* [P1-INSIGHTS-I18N · 2026-08-20] El panel de Razonamiento seguía en español.
 *
 * Los TÍTULOS («Diagnóstico», «Plan de Acción», «Tip del Chef») ya pasaban por `t()`;
 * el CUERPO lo escribe el LLM y nadie lo pasaba por `_display`. Con la app en inglés
 * quedaba una tarjeta con cabeceras en inglés y prosa en español.
 *
 * Se traduce por el criterio de la jornada: no es «lo que escribe el LLM no se toca»,
 * es «lo que el motor usa como IDENTIFICADOR no se toca». Por el razonamiento no
 * resuelve nadie — es prosa para el usuario.
 *
 * FALLBACK POR BLOQUE, NO POR ÍNDICE, y es lo que este test protege. El panel rotula
 * cada entrada por POSICIÓN (0=Diagnóstico, 1=Plan de Acción, 2=Tip del Chef), así que
 * mezclar traducidas y originales no daría «texto peor»: pondría el consejo del chef
 * bajo el título de diagnóstico. Ante cualquier duda, español entero.
 */
describe('[P1-INSIGHTS-I18N] planInsightsDisplay', () => {
    const ES = ['Diagnóstico: uno', 'Estrategia: dos', 'Chef: tres'];
    const EN = ['Diagnosis: one', 'Strategy: two', 'Chef: three'];
    const plan = (extra) => ({ insights: ES, ...extra });

    it('devuelve la traducción cuando está completa', () => {
        const p = plan({ _display: { 'en-US': { insights: EN } } });
        expect(planInsightsDisplay(p, 'en-US')).toEqual(EN);
    });

    it('sin `_display` devuelve el español', () => {
        expect(planInsightsDisplay(plan(), 'en-US')).toEqual(ES);
    });

    it('con OTRA longitud cae al español ENTERO, no mezcla', () => {
        // El caso que justifica el fallback por bloque: con 2 de 3, el tercer título
        // («Tip del Chef») rotularía el segundo texto.
        const p = plan({ _display: { 'en-US': { insights: EN.slice(0, 2) } } });
        expect(planInsightsDisplay(p, 'en-US')).toEqual(ES);
    });

    it('con una entrada vacía cae al español entero', () => {
        const p = plan({ _display: { 'en-US': { insights: ['ok', '   ', 'ok'] } } });
        expect(planInsightsDisplay(p, 'en-US')).toEqual(ES);
    });

    it('es-DO (sin catálogo) devuelve el español sin tocar nada', () => {
        expect(planInsightsDisplay(plan(), 'es-DO')).toEqual(ES);
    });

    it('tolera plan vacío, nulo o sin insights', () => {
        expect(planInsightsDisplay(null, 'en-US')).toEqual([]);
        expect(planInsightsDisplay({}, 'en-US')).toEqual([]);
        expect(planInsightsDisplay({ insights: [] }, 'en-US')).toEqual([]);
    });

    it('las superficies NO leen `_display` directo: usan el helper', () => {
        // Mismo contrato que `mealDisplay`. Si cada pantalla se lo lee por su cuenta, un
        // cambio de forma en la capa las rompe todas y hay que encontrarlas una a una.
        const src = _readSrc('pages/Dashboard.jsx');
        expect(src).toMatch(/planInsightsDisplay\(planData, _dashLocale\)/);
        expect(src, 'volvió el acceso crudo a planData.insights en el render')
            .not.toMatch(/\)\s*:\s*planData\.insights\.map\(/);
    });
});
