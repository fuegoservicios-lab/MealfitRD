// [P1-PLAN-DISPLAY-I18N · 2026-08-19] Capa de lectura del plan en el idioma
// del usuario. El motor SIEMPRE genera y persiste `plan_data` en español
// canónico (backend/plan_display_i18n.py; contrato completo en
// docs/superpowers/specs/2026-08-19-plan-display-i18n-design.md) — los
// nombres de alimentos son identificadores del sistema (pantry_names_match,
// coherence guard, backstop de alergias), así que NUNCA se traducen ahí.
// Lo que el backend añade es un campo paralelo de solo-lectura
// `meal._display[locale] = {name, description, recipe, ingredients}`.
//
// Este módulo es la ÚNICA superficie frontend que sabe leer `_display`. El
// resto del código (Dashboard, Recipes) llama a `mealDisplay`/`mealDisplayName`
// y nunca toca `meal._display` directo — lo enforza el test parser-based en
// __tests__/displayMeal.test.js.
//
// Regla de fallback (spec, sección "Frontend (fase 1)"): CAMPO A CAMPO al
// original. Si falta el meal entero, el locale no tiene entrada (es-DO NUNCA
// la tiene), o un campo puntual está ausente/vacío, ese campo cae al
// español. Los arrays (`recipe`/`ingredients`) llevan además el check de
// longitud: el motor los genera alineados por índice con el original, así
// que una longitud distinta es la señal de un lote inválido — ese array
// entero cae al original (nunca se intenta "parchear" por índice).
//
// JAMÁS muta `meal`: el mismo objeto puede leerse para varios locales en la
// misma sesión (cambio de idioma en Configuración) y una mutación in-place
// lo corrompería para el próximo lector.
//
// Nota de campo real: los meals persistidos usan la clave `desc` para la
// descripción (P1-DESC-KEY-DEAD — NO `description`), mientras que
// `_display[locale]` (contrato del motor) sí usa `description`. El helper
// normaliza la asimetría: la salida SIEMPRE expone `description`, leyendo el
// original de `meal.desc` (con `meal.description` como respaldo, por si
// algún caller futuro lo puebla con esa clave).

const EMPTY_DISPLAY = Object.freeze({
    name: '',
    description: '',
    recipe: Object.freeze([]),
    ingredients: Object.freeze([]),
});

function _isNonEmptyString(v) {
    return typeof v === 'string' && v.trim() !== '';
}

function _originalDescription(meal) {
    // [Ola final · FF-4] TAL CUAL, sin normalizar: `desc` si el meal la trae (aunque
    // sea `''`), si no `description`, y solo `''` cuando ninguna de las dos existe —
    // así el fallback devuelve exactamente lo que el call site leía antes del helper.
    if (meal.desc !== undefined && meal.desc !== null) return meal.desc;
    if (meal.description !== undefined && meal.description !== null) return meal.description;
    return '';
}

/**
 * `mealDisplay(meal, locale) -> {name, description, recipe, ingredients}`
 *
 * Null-safe: `meal` ausente/no-objeto devuelve el objeto de vacíos seguros
 * (nunca `undefined`/`null`, así los call sites pueden desestructurar sin
 * guardas propias). Nunca muta `meal`.
 */
export function mealDisplay(meal, locale) {
    if (!meal || typeof meal !== 'object') return EMPTY_DISPLAY;

    // [Ola final · FF-4] El FALLBACK devuelve el valor ORIGINAL TAL CUAL — la
    // normalización a array es SOLO del camino `_display` (donde sirve para el
    // length-match por índice). La v1 normalizaba también el fallback y eso DESARMÓ
    // una defensa viva: `recipe` puede ser un string legacy (P2-RECIPE-DISCLAIMER-LIST:
    // planes viejos, disclaimer de macro-balancing pre-fix), `toRecipeSteps` en
    // Recipes.jsx existe justo para coercerlo a `[string]`, y al colapsarlo a `[]`
    // ANTES el usuario perdía la receta ENTERA — en todos los locales, es-DO incluido
    // (la única rotura real de la promesa de byte-identidad). Regla: este helper decide
    // QUÉ valor mostrar, nunca cambia la FORMA de lo que el meal ya traía.
    const originalName = meal.name ?? '';
    const originalDescription = _originalDescription(meal);
    const originalRecipe = meal.recipe ?? [];
    const originalIngredients = meal.ingredients ?? [];
    // Solo para el check de longitud del camino `_display` (un no-array no tiene
    // longitud comparable ⇒ el array traducido nunca gana sobre una forma legacy).
    const recipeArr = Array.isArray(originalRecipe) ? originalRecipe : null;
    const ingredientsArr = Array.isArray(originalIngredients) ? originalIngredients : null;

    // es-DO (o cualquier meal sin `_display`, o sin entrada para este locale)
    // resuelve directo a los originales — no hay nada más que consultar.
    const displayMap = meal._display;
    const entry = displayMap && typeof displayMap === 'object' ? displayMap[locale] : null;

    if (!entry || typeof entry !== 'object') {
        return {
            name: originalName,
            description: originalDescription,
            recipe: originalRecipe,
            ingredients: originalIngredients,
        };
    }

    const name = _isNonEmptyString(entry.name) ? entry.name : originalName;
    const description = _isNonEmptyString(entry.description) ? entry.description : originalDescription;
    const recipe = recipeArr && Array.isArray(entry.recipe) && entry.recipe.length === recipeArr.length
        ? entry.recipe
        : originalRecipe;
    const ingredients = ingredientsArr && Array.isArray(entry.ingredients)
        && entry.ingredients.length === ingredientsArr.length
        ? entry.ingredients
        : originalIngredients;

    return { name, description, recipe, ingredients };
}

/** Atajo: solo el nombre a mostrar (evita desestructurar en el call site). */
export function mealDisplayName(meal, locale) {
    return mealDisplay(meal, locale).name;
}
