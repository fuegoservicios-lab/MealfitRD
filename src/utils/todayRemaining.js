/**
 * [P1-TODAY-REMAINING · 2026-07-28] "Ya comiste esto hoy" — derivado del
 * diario en cada render, NUNCA persistido en `plan_data` (invariante I6,
 * lifecycle de `plan_id`, CLAUDE.md). El owner pidió recortar el slot
 * comido del plan; hacerlo literal rompe el piso de proteína por-día
 * (hard-gate <0.90x target) y la lista de compras (promedio-de-día × 7).
 * Este módulo solo CALCULA qué mostrar — nunca escribe nada.
 *
 * Espejo JS de `backend/constants.py::canonical_slot_key` (`_SLOT_CANON_MAP`)
 * y de `backend/agent.py::_build_today_remaining_context` (misma regla de
 * match + misma regla de ambigüedad) — SSOT por lenguaje, no por import
 * (no hay bundling cross-repo backend↔frontend). Si la tabla de
 * `constants.py` cambia, actualizar `_SLOT_CANON_MAP` aquí también (tabla
 * estática, cambia raro).
 *
 * REGLA DE MATCH: un slot del plan de HOY (`meal.meal`, ej. "Desayuno")
 * cuenta como "ya comido" cuando una fila del diario de HOY
 * (`/api/diary/consumed/{userId}`, campo `meal_type`) canonicaliza a la
 * MISMA key.
 *
 * REGLA DE AMBIGÜEDAD: si ≥2 slots del plan de HOY canonicalizan a la
 * MISMA key (planes de 5-6 comidas con 2-3 meriendas) y el diario solo
 * trae UNA fila de esa key, NO hay forma de saber cuál merienda fue —
 * marcar la incorrecta es peor que no marcar ninguna. En ese caso NINGÚN
 * meal de esa key se atenúa (las kcal siguen contando en el total vía
 * `sumConsumedCalories`, que nunca depende de la atribución).
 *
 * [P1-EATEN-SLOT-COPY · 2026-07-28] El match de arriba es por SLOT
 * (`meal_type`), NUNCA por nombre de plato — así que el chip NO puede
 * afirmar "ya comiste esto" (esto = `meal.name` del PLAN, la card que el
 * chip decora). Caso real del owner: plan prescribía "Tostadas Francesas
 * con Mantequilla de Maní y Lechosa", el diario registró "Mangú con Los
 * Tres Golpes" en el slot Desayuno — el chip viejo apuntaba al toast
 * francés y decía que el usuario se lo comió. Falso. Lo único cierto es
 * que el SLOT de hoy ya tiene un registro. `eatenChipLabel` dice eso y
 * solo eso; `eatenClaimForSlot` (para el tooltip/aria-label, donde SÍ cabe
 * el detalle) nombra lo que el diario realmente registró — nunca
 * `meal.name` del plan. Kcal se removió del chip visible: quedaba al lado
 * del propio `meal.cals` de la card, dos números distintos discutiendo en
 * el mismo lugar (el agregado real vive en la línea "Te quedan ~X kcal").
 *
 * tooltip-anchor: P1-TODAY-REMAINING
 */

const _SLOT_CANON_MAP = {
  desayuno: 'desayuno', breakfast: 'desayuno',
  almuerzo: 'almuerzo', comida: 'almuerzo', lunch: 'almuerzo',
  cena: 'cena', dinner: 'cena',
  merienda: 'merienda', snack: 'merienda', 'merienda am': 'merienda',
  'merienda pm': 'merienda', 'media manana': 'merienda', 'media tarde': 'merienda',
  'merienda matutina': 'merienda', 'merienda vespertina': 'merienda',
};

const _COMBINING_DIACRITICS_RE = /[\u0300-\u036f]/g;

function _stripAccents(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(_COMBINING_DIACRITICS_RE, '');
}

/** Normaliza un `meal_type`/`meal` es-DO a su key canónica, o `null` si no
 * se reconoce. Mismo comportamiento que `constants.py::canonical_slot_key`. */
export function canonicalSlotKey(mealType) {
  const norm = _stripAccents(String(mealType == null ? '' : mealType).toLowerCase()).trim();
  return _SLOT_CANON_MAP[norm] || null;
}

/**
 * Índices (dentro de `dayMeals`, SIN filtrar — los mismos índices que usa
 * el swap, ver marker P2-SWAP-INDEX-COUPLING en Dashboard.jsx) de los
 * slots que cuentan como "ya comidos hoy", honrando la REGLA DE
 * AMBIGÜEDAD de arriba.
 *
 * @param {Array} dayMeals - `planData.days[i].meals` (día activo).
 * @param {Array} consumedTodayMeals - filas del diario de hoy (`meal_type`).
 * @returns {Set<number>} índices atenuables.
 */
export function getEatenSlotIndices(dayMeals, consumedTodayMeals) {
  const eatenIndices = new Set();
  if (!Array.isArray(dayMeals) || dayMeals.length === 0) return eatenIndices;

  const eatenKeys = new Set();
  (Array.isArray(consumedTodayMeals) ? consumedTodayMeals : []).forEach((row) => {
    const key = canonicalSlotKey(row && row.meal_type);
    if (key) eatenKeys.add(key);
  });
  if (eatenKeys.size === 0) return eatenIndices;

  const groups = new Map();
  dayMeals.forEach((meal, index) => {
    const key = canonicalSlotKey(meal && meal.meal);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });

  eatenKeys.forEach((key) => {
    const indices = groups.get(key) || [];
    if (indices.length === 1) {
      // Match inequívoco: exactamente un slot de hoy tiene esta key.
      eatenIndices.add(indices[0]);
    }
    // 0 matches (snack no planificado) o >1 (AMBIGUO — ej. 2 meriendas hoy)
    // → no se atenúa nada para esa key.
  });
  return eatenIndices;
}

/** Suma cruda de kcal del diario de hoy. SIEMPRE incluye lo comido,
 * independiente de si pudo atribuirse a un slot específico del plan — la
 * ambigüedad solo afecta la atribución por nombre, nunca el conteo de
 * kcal (misma decisión que `agent.py::_build_today_remaining_context`). */
export function sumConsumedCalories(consumedTodayMeals) {
  return (Array.isArray(consumedTodayMeals) ? consumedTodayMeals : []).reduce(
    (sum, row) => sum + (Number(row && row.calories) || 0), 0,
  );
}

/** kcal estimadas atribuibles a UN slot específico ya comido — suma las
 * filas del diario de hoy cuya key canónica matchea la del slot (cubre el
 * caso de 2 registros para el mismo slot, ej. corrección/doble registro). */
export function eatenKcalForSlot(consumedTodayMeals, slotMealType) {
  const targetKey = canonicalSlotKey(slotMealType);
  if (!targetKey) return 0;
  return (Array.isArray(consumedTodayMeals) ? consumedTodayMeals : [])
    .filter((row) => canonicalSlotKey(row && row.meal_type) === targetKey)
    .reduce((sum, row) => sum + (Number(row && row.calories) || 0), 0);
}

/**
 * [P1-EATEN-SLOT-COPY · 2026-07-28] Nombres (`meal_name`) de las filas del
 * diario de hoy atribuidas a un slot — mismo match que `eatenKcalForSlot`.
 * El nombre real de lo comido vive en el DIARIO, nunca en `meal.name` del
 * plan (ver docstring del módulo). Si ≥2 filas matchean el mismo slot
 * (corrección/doble registro), se devuelven TODAS — nombrar solo la
 * primera escondería la segunda comida real.
 */
export function eatenNamesForSlot(consumedTodayMeals, slotMealType) {
  const targetKey = canonicalSlotKey(slotMealType);
  if (!targetKey) return [];
  return (Array.isArray(consumedTodayMeals) ? consumedTodayMeals : [])
    .filter((row) => canonicalSlotKey(row && row.meal_type) === targetKey)
    .map((row) => String((row && row.meal_name) || '').trim())
    .filter(Boolean);
}

/** Junta nombres al estilo es-DO: "A", "A y B", "A, B y C". */
export function joinNamesEsDo(names) {
  const clean = (Array.isArray(names) ? names : []).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(', ')} y ${clean[clean.length - 1]}`;
}

/**
 * [P1-EATEN-SLOT-COPY · 2026-07-28] Texto del chip — SOLO afirma lo que el
 * sistema sabe con certeza: el SLOT de hoy ya tiene un registro. Nunca
 * nombra un plato (ni el del plan, ni el del diario) y nunca dice "esto".
 */
export function eatenChipLabel(slotMealType) {
  return `Ya registraste tu ${canonicalSlotKey(slotMealType) || 'comida'}`;
}

/**
 * [P1-EATEN-SLOT-COPY · 2026-07-28] Frase honesta para tooltip/aria-label —
 * el detalle que el chip ya no lleva (nombre real + kcal estimada), para
 * que el usuario detecte a simple vista un match de slot equivocado. SIEMPRE
 * usa el/los nombre(s) del DIARIO (`eatenNamesForSlot`), nunca `meal.name`
 * del plan. kcal enmarcada como estimado (`~`) porque buena parte del dato
 * nace de una foto analizada por un modelo de visión.
 *
 * `cta`:
 *  - 'unlock' (default) — superficie con controles REALMENTE deshabilitados
 *    (Dashboard: Cambiar Plato/Me gusta están `disabled` de verdad). Mismo
 *    string en el chip Y en los dos botones bloqueados — una sola fuente
 *    para las 3 apariciones de esta página, cero drift entre ellas.
 *  - 'info' — superficie de solo lectura (Recetas: nada que desbloquear),
 *    pero el usuario igual necesita el mismo escape hatch si el match de
 *    slot fue incorrecto.
 *  - 'none' — la frase sola, sin CTA.
 */
export function eatenClaimForSlot(consumedTodayMeals, slotMealType, cta = 'unlock') {
  const slotNoun = canonicalSlotKey(slotMealType) || 'comida';
  const names = eatenNamesForSlot(consumedTodayMeals, slotMealType);
  const kcal = Math.round(eatenKcalForSlot(consumedTodayMeals, slotMealType));
  const namesLabel = names.length > 0 ? `«${joinNamesEsDo(names)}»` : 'algo';
  const kcalPart = kcal > 0 ? ` (~${kcal} kcal)` : '';
  const base = `Registraste ${namesLabel}${kcalPart} como tu ${slotNoun} de hoy.`;
  if (cta === 'none') return base;
  const suffix = cta === 'info'
    ? ' Corrígelo en «Progreso en Tiempo Real» si no es lo que comiste.'
    : ' Bórralo en «Progreso en Tiempo Real» para desbloquear.';
  return `${base}${suffix}`;
}
