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

// ============================================================
// [P2-I18N-LANG-POR-PARTE · 2026-08-21] En qué IDIOMA está cada trozo
// ============================================================
//
// MEDIDO antes de esto: **un solo** `lang=` en todo `frontend/src`, y es el de los
// nombres nativos del selector de idioma. CERO en cualquier CONTENIDO. Así que bajo
// `<html lang="fr-FR">` un lector de pantalla sintetiza «Pollo guisado con arroz blanco»
// con fonética francesa — no es que suene raro: es ininteligible. WCAG 3.1.2 (Language
// of Parts) existe exactamente para esto, y axe no puede detectarlo: no hay forma
// automática de saber que un texto no está en el idioma que declara su ancestro.
//
// EL MATIZ ES LOAD-BEARING: se marca POR PARTE, no en bloque. Un `lang="es"` de bloque
// sería INCORRECTO en la lista de compras, donde la cadena es bilingüe por diseño
// («Black beans (Habichuelas negras)»): marcarla entera como española haría pronunciar
// «Black beans» a la española, que es el mismo defecto del revés.
//
// Y sólo se marca lo que HACE FALTA. Cuando el campo sí viene traducido, heredar
// `<html lang>` es lo correcto y añadir un `lang` redundante es ruido que además se
// queda obsoleto en cuanto cambie la traducción.

/** El idioma base del contenido del plan: lo escribe el LLM en español canónico. */
const _IDIOMA_DEL_PLAN = 'es';

/**
 * ¿Con qué `lang` hay que marcar este campo, o `null` si no hace falta?
 *
 * Devuelve `'es'` sólo cuando el campo se está pintando en español DENTRO de una
 * interfaz que no lo está — que es el único caso en que la marca añade información.
 *
 * @param {object} meal   el meal crudo (con su `_display`, si lo tiene)
 * @param {'name'|'description'|'recipe'|'ingredients'} campo
 * @param {string} locale el locale ACTIVO de la interfaz
 * @returns {'es'|null}
 */
export function langDeCampo(meal, campo, locale) {
    // En español la interfaz y el contenido coinciden: marcar no aporta nada.
    if (!locale || locale.startsWith('es')) return null;

    const entry = meal && typeof meal._display === 'object' && meal._display
        ? meal._display[locale]
        : null;
    if (!entry || typeof entry !== 'object') return _IDIOMA_DEL_PLAN;

    // La MISMA regla de aceptación que usa `mealDisplay` arriba, campo a campo. Si
    // divergiera, el `lang` diría una cosa y el texto pintado sería otra — y eso es
    // peor que no marcar, porque el lector de pantalla obedece la marca.
    if (campo === 'name') return _isNonEmptyString(entry.name) ? null : _IDIOMA_DEL_PLAN;
    if (campo === 'description') {
        return _isNonEmptyString(entry.description) ? null : _IDIOMA_DEL_PLAN;
    }
    const original = Array.isArray(meal?.[campo === 'recipe' ? 'recipe' : 'ingredients'])
        ? meal[campo === 'recipe' ? 'recipe' : 'ingredients']
        : null;
    const traducido = entry[campo];
    const vale = original && Array.isArray(traducido) && traducido.length === original.length;
    return vale ? null : _IDIOMA_DEL_PLAN;
}

// [P2-I18N-LANG-POR-PARTE · 2026-08-21] AQUÍ IBA `partesDeLineaDeCompra`, y se retiró
// antes de nacer. El plan pedía marcar POR PARTE la línea bilingüe de la lista de compras
// («Black beans (Habichuelas negras)»), y tenía razón en el principio: un `lang="es"` de
// bloque ahí haría pronunciar «Black beans» a la española, que es el mismo defecto del
// revés.
//
// Pero MEDIDO: esa línea tiene UN solo consumidor en todo el frontend
// (`Dashboard.jsx`, la llamada a `glossShoppingItemName`) y está dentro del generador de
// HTML del **PDF**. `html2pdf` rasteriza con html2canvas y embebe una imagen: no hay capa
// de texto ni árbol de accesibilidad, así que un `lang` ahí no lo lee nadie. En PANTALLA
// la lista bilingüe no se pinta hoy.
//
// Un helper sin consumidores es peor que el hueco: parece cubrir el caso y nadie lo
// llama. Queda anotado en su lugar — **el día que la lista bilingüe se pinte en pantalla,
// hay que partir la línea en DOS nodos** y marcar solo el paréntesis, no el contenedor.

/** Atajo: solo el nombre a mostrar (evita desestructurar en el call site). */
export function mealDisplayName(meal, locale) {
    return mealDisplay(meal, locale).name;
}

// ============================================================
// [P1-PLAN-DISPLAY-I18N · fase 1c] Etiqueta de SLOT ("Desayuno"/"Almuerzo"/
// "Merienda"/"Cena"/"Snack") — a diferencia de `mealDisplay`, esto NO lee
// `meal._display` (el slot es un valor CANÓNICO del dato, nunca se traduce
// en el plan_data — es identificador de posición, no contenido del LLM). Es
// un helper de DISPLAY puro: mapea el string español fijo a `t(<clave>)`.
//
// `meal.meal` real trae variantes ("Merienda AM"/"Merienda PM"/"Merienda
// Nocturna"/"Merienda 1"/"Merienda 2" — ver nutrition_calculator.py:420-421,
// graph_orchestrator.py:45678+, mismo universo que `mealEmojiFor` resuelve
// por substring). Este helper traduce SOLO el prefijo reconocido y preserva
// el resto TAL CUAL (" AM"/" PM"/" Nocturna"/" 1"...) — no hay clave i18n
// para "Nocturna" ni tiene sentido traducir un numeral.
// ============================================================

const _SLOT_BASE_KEYS = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena', 'Snack'];

function _stripAccentsForSlot(s) {
    return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * `mealSlotLabel(slot, t) -> string`
 *
 * `t` es la función de traducción (`useT()`/`t` de `../i18n`). Case/acento-
 * insensible contra las 5 claves canónicas. Fallback: si `slot` no matchea
 * ninguna (ni exacto ni por prefijo), devuelve el valor ORIGINAL tal cual —
 * nunca `undefined`/vacío para un slot desconocido.
 */
export function mealSlotLabel(slot, t) {
    if (typeof slot !== 'string' || !slot.trim()) return slot;
    const raw = slot.trim();
    const normalized = _stripAccentsForSlot(raw).toLowerCase();
    const translate = typeof t === 'function' ? t : (s) => s;

    // 1. Match exacto (cubre "Desayuno"/"Almuerzo"/"Merienda"/"Cena"/"Snack" y
    //    variantes de case/acento como "DESAYUNO"/"cena").
    for (const key of _SLOT_BASE_KEYS) {
        if (normalized === _stripAccentsForSlot(key).toLowerCase()) {
            return translate(key);
        }
    }

    // 2. Match por prefijo ("Merienda AM", "Merienda 1", "Merienda Nocturna"...):
    //    traduce SOLO la palabra base, preserva el resto de la cadena tal cual.
    for (const key of _SLOT_BASE_KEYS) {
        const keyNorm = _stripAccentsForSlot(key).toLowerCase();
        if (normalized.startsWith(keyNorm)) {
            const suffix = raw.slice(key.length);
            return `${translate(key)}${suffix}`;
        }
    }

    // 3. Desconocido: el original tal cual (nunca inventar traducción).
    return raw;
}

// [P1-RECIPES-SLOT-I18N · 2026-08-20] Etiqueta de DIFICULTAD, hermana de
// `mealSlotLabel` y por la misma razón.
//
// `meal.difficulty` lo escribe el LLM, pero NO es contenido creativo: es un
// vocabulario cerrado de tres valores que el schema fija por defecto
// (`schemas.py`: «Fácil», «Intermedio», «Difícil»). Medido en producción: 361
// «Fácil» y 135 «Intermedio», nada más. Un enum disfrazado de texto libre.
//
// Por eso se traduce y los NOMBRES DE ALIMENTO no: la dificultad no la resuelve
// nadie por su cadena. `pantry_names_match`, el guard de coherencia y el backstop
// de alergias sí resuelven por el nombre del alimento, y traducirlo rompe las tres
// —dos en silencio—. La regla no es «lo que escribe el LLM no se toca», es «lo que
// el motor usa como IDENTIFICADOR no se toca».
//
// Desconocido ⇒ se devuelve tal cual (fail-open): si el modelo inventa un cuarto
// valor, el usuario ve el original en vez de un hueco.
// Los tres literales van EXPLÍCITOS dentro de una función, y las dos cosas
// importan. Explícitos porque `npm run i18n:check` marca como huérfana toda clave
// que no aparezca como literal en una llamada a `t()`: pasarlas por una variable
// (`translate(key)`) las vuelve invisibles para el checker, y una clave huérfana
// es la señal de «alguien cambió el copy y dejó la traducción atrás» — apagarla
// con falsos positivos desarma el guard. Y dentro de una FUNCIÓN porque un
// `const X = { 'Fácil': t('Fácil') }` a nivel de módulo se evalúa al importar,
// antes de que el catálogo exista, y se queda congelado en español para siempre.
function _etiquetasDificultad(t) {
    return {
        facil: t('Fácil'),
        intermedio: t('Intermedio'),
        dificil: t('Difícil'),
    };
}

export function mealDifficultyLabel(difficulty, t) {
    if (typeof difficulty !== 'string' || !difficulty.trim()) return difficulty;
    const raw = difficulty.trim();
    const norm = _stripAccentsForSlot(raw).toLowerCase();
    const traducir = typeof t === 'function' ? t : (s) => s;
    const etiquetas = _etiquetasDificultad(traducir);
    return Object.prototype.hasOwnProperty.call(etiquetas, norm) ? etiquetas[norm] : raw;
}

// [P1-INSIGHTS-I18N · 2026-08-20] El RAZONAMIENTO del plan traducido.
//
// Hermano de `mealDisplay`: el ÚNICO lector autorizado de
// `plan_data._display[locale].insights`. Las superficies NO leen `_display` directo
// (contrato de P1-PLAN-DISPLAY-I18N, enforzado por `displayMeal.test.js`) — si cada
// pantalla se lo lee por su cuenta, un cambio de forma en la capa las rompe todas y
// hay que encontrarlas una a una.
//
// FALLBACK POR ÍNDICE, no por bloque. Si la traducción falta o llega con otra
// longitud, cae al español ENTERO: el panel rotula cada entrada por POSICIÓN
// (0=Diagnóstico, 1=Plan de Acción, 2=Tip del Chef), así que mezclar traducidas y
// originales no daría «texto peor» — pondría el consejo del chef bajo el título de
// diagnóstico. El backend valida lo mismo antes de persistir; esto es la segunda
// mitad del mismo contrato, aquí porque un plan viejo puede traer cualquier cosa.
export function planInsightsDisplay(planData, locale) {
    const original = Array.isArray(planData?.insights)
        ? planData.insights.filter(Boolean)
        : [];
    if (!original.length || !locale) return original;
    const entrada = planData?._display?.[locale];
    const traducidas = Array.isArray(entrada?.insights) ? entrada.insights : null;
    if (!traducidas || traducidas.length !== original.length) return original;
    if (!traducidas.every((x) => typeof x === 'string' && x.trim())) return original;
    return traducidas;
}
