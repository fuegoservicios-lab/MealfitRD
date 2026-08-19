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
    if (typeof meal.desc === 'string') return meal.desc;
    if (typeof meal.description === 'string') return meal.description;
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

    const originalName = typeof meal.name === 'string' ? meal.name : '';
    const originalDescription = _originalDescription(meal);
    const originalRecipe = Array.isArray(meal.recipe) ? meal.recipe : [];
    const originalIngredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];

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
    const recipe = Array.isArray(entry.recipe) && entry.recipe.length === originalRecipe.length
        ? entry.recipe
        : originalRecipe;
    const ingredients = Array.isArray(entry.ingredients) && entry.ingredients.length === originalIngredients.length
        ? entry.ingredients
        : originalIngredients;

    return { name, description, recipe, ingredients };
}

/** Atajo: solo el nombre a mostrar (evita desestructurar en el call site). */
export function mealDisplayName(meal, locale) {
    return mealDisplay(meal, locale).name;
}
