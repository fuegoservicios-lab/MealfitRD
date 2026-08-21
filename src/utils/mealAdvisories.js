/**
 * [P2-DISHQUAL-SURFACE-UPDATES · 2026-06-29] (re-audit objetivo · P2 XCUT-DISHQUAL-NOT-SURFACED)
 *
 * Surfacing user-facing de los flags ADVISORY per-comida que el backend setea en el finalizer
 * (`finalize_single_meal_recipe_coherence`) y en swap/chat-modify, y persiste en `plan_data.days[].meals[]`:
 *   - `_dish_quality_degraded`      → la receta quedó placeholder/básica (backstop de 3 pilares) —
 *                                     [P1-SWAP-PROSE-HONEST · 2026-07-29] O una CANTIDAD se estimó
 *                                     (`_dish_quality_reason === 'portion_estimate'`), que no es lo
 *                                     mismo: la receta puede estar completa. El label/aviso difiere
 *                                     según `_dish_quality_reason` (ver abajo).
 *   - `_slot_advisory`              → el plato quedó fuera de su horario (arroz de noche, etc.).
 *   - `_appetibility_combo_warning` → combinación inusual (fruta dulce + base salada).
 *   - `_macro_band_low`             → el plato editado quedó fuera de la banda del macro objetivo (>15%).
 *   - `_name_honesty_degraded`      → [P2-AUDIT-V6-BATCH · 2026-07-03] el nombre lidera con una
 *                                     proteína que el plato no trae y no hubo reemplazo honesto.
 *   - `_recipe_contract_advisory`   → [P2-AUDIT-V6-BATCH · 2026-07-03] pasos de receta incompletos
 *                                     (prefijos/orden/tiempo) tras los backstops.
 *   - `_cross_week_repeat`          → [P2-AUDIT-V7-BATCH · 2026-07-04] (P2-6) el plato repite el
 *                                     mismo slot de una semana previa del plan (check determinista
 *                                     del merge de chunks; la palanca es "Cambiar Plato").
 *
 * NINGUNO bloquea — son informativos (el usuario puede regenerar/cambiar el plato). Pre-fix el backend
 * los calculaba y persistía pero el frontend NUNCA los mostraba, mientras que señales hermanas (banner de
 * coherencia, day_quality_warning) SÍ se renderean. Este helper los traduce a chips es-DO. Devuelve `[]`
 * cuando no hay advisories → el caller no renderea nada.
 */
// [P1-MACRO-BADGE-DIA-EN-BANDA · 2026-08-05] Banda del backend
// (`MEALFIT_BAND_SCORE_LOWER` / `_UPPER`). Se replican aquí porque el cliente NO recibe el
// `band_score` por día — solo las comidas y los objetivos del plan. Si el backend mueve su
// banda, esto queda desalineado: la consecuencia sería mostrar u ocultar un chip
// informativo, nunca un error de datos.
const BANDA_BAJA = 0.9;
const BANDA_ALTA = 1.12;

const _num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * ¿Los macros del DÍA caen dentro de la banda objetivo del plan?
 *
 * Suma las comidas del día y compara los cuatro ejes contra los objetivos del plan. Ante
 * cualquier dato ausente devuelve `false` — «no sé» no es «está en banda», y equivocarse
 * hacia mostrar el aviso es el lado seguro (se pierde silencio, no información).
 *
 * @param {Array} comidas comidas del día
 * @param {object} objetivos `{protein, carbs, fats}` del plan (acepta "123g")
 * @param {number|string} kcalObjetivo calorías objetivo del plan
 */
export function diaEnBandaObjetivo(comidas, objetivos, kcalObjetivo) {
  if (!Array.isArray(comidas) || comidas.length === 0 || !objetivos) return false;
  const metas = {
    protein: _num(objetivos.protein),
    carbs: _num(objetivos.carbs),
    fats: _num(objetivos.fats),
    calories: _num(kcalObjetivo),
  };
  const suma = { protein: 0, carbs: 0, fats: 0, calories: 0 };
  for (const c of comidas) {
    if (!c || typeof c !== 'object') continue;
    suma.protein += _num(c.protein);
    suma.carbs += _num(c.carbs);
    suma.fats += _num(c.fats);
    suma.calories += _num(c.calories ?? c.cals);
  }
  const ejes = ['protein', 'carbs', 'fats', 'calories'];
  if (ejes.some((k) => metas[k] <= 0 || suma[k] <= 0)) return false;
  return ejes.every((k) => {
    const r = suma[k] / metas[k];
    return r >= BANDA_BAJA && r <= BANDA_ALTA;
  });
}

/**
 * @param {object} meal la comida del plan con sus flags advisory
 * @param {object} [opciones] `{diaEnBanda}` — contexto del día
 * @param {Function} [traducir] el `t` del motor de idioma. OPCIONAL: sin él los
 *   chips salen en español, exactamente igual que antes de existir el motor.
 *   Se recibe con otro nombre y se le pone de alias `t` porque el extractor de
 *   claves de `npm run i18n:check` es textual y solo reconoce ese identificador.
 */
export function getMealAdvisories(meal, opciones, traducir) {
  if (!meal || typeof meal !== 'object') return [];
  const t = typeof traducir === 'function' ? traducir : (s) => s;
  const out = [];
  // [P1-MACRO-BADGE-DIA-EN-BANDA · 2026-08-05] ¿El DÍA de este plato cierra en banda?
  // Ver el gate de `_macro_band_low` más abajo para por qué importa.
  const diaEnBanda = opciones && opciones.diaEnBanda === true;
  if (meal._dish_quality_degraded) {
    // [P1-SWAP-PROSE-HONEST · 2026-07-29] `_dish_quality_degraded` lo setean 5 backstops
    // distintos del backend; solo ALGUNOS significan "receta básica" (evidencia viva
    // deefa5f0-51c6-40ba-9579-c9fc660cb4c4: el flag venía de una CANTIDAD estimada por el
    // solver, no de falta de detalle — el plato tenía 3 pasos completos). Mostrar el mismo
    // "regenera para más detalle" ahí es doblemente falso: describe mal el problema Y empuja
    // a gastar un crédito mensual (verify_api_quota en /regenerate-day) para "arreglar" algo
    // que regenerar no cambia (el detalle ya está completo). `_dish_quality_reason` (backend,
    // mismo P-fix) distingue las causas; sin el campo (planes viejos persistidos antes de este
    // fix) se conserva el label histórico como fallback seguro.
    if (meal._dish_quality_reason === 'portion_estimate') {
      out.push({ key: 'dish_quality', label: t('Cantidad de un ingrediente estimada — puede variar') });
    } else {
      out.push({ key: 'dish_quality', label: t('Receta básica — regenera para más detalle') });
    }
  }
  if (meal._slot_advisory) {
    out.push({ key: 'slot', label: t('Horario inusual para este plato') });
  }
  if (meal._appetibility_combo_warning) {
    out.push({ key: 'combo', label: t('Combinación inusual (fruta dulce + salado)') });
  }
  if (meal._macro_band_low && !diaEnBanda) {
    // [2026-08-05] Copy en llano a pedido del dueño: «banda objetivo» es
    // jerga interna (la banda ±15% del validador) que a un usuario normal no
    // le dice nada. La key NO cambia — tests y estilos cuelgan de ella.
    //
    // ⚠️ [P1-MACRO-BADGE-DIA-EN-BANDA · 2026-08-05] Y no se muestra si el DÍA cierra en
    // banda. El flag lo pone el backend cuando la proteína de UNA comida se aleja >15% del
    // objetivo de SU slot — pero las comidas se compensan entre sí, y la unidad que cuenta
    // nutricionalmente es el día: nadie se come un slot aislado.
    //
    // Caso real (owner, 2026-08-05): un día con `band_score=1.0` y los CUATRO macros en
    // banda mostraba «este plato se desvía de tus macros». El aviso contradecía al propio
    // sistema y no era accionable — cambiar ese plato habría empeorado un día que ya estaba
    // exacto. Mismo criterio que P1-COHERENCE-BANNER-NOISE: surface solo lo accionable.
    //
    // La telemetría per-comida NO se toca (sigue en el log y en el flag persistido): lo que
    // deja de existir es la etiqueta visible cuando el día ya está donde debe.
    out.push({ key: 'macro_band', label: t('Este plato se desvía un poco de tus macros') });
  }
  if (meal._name_honesty_degraded) {
    out.push({ key: 'name_honesty', label: t('El nombre puede no reflejar la proteína real') });
  }
  if (meal._recipe_contract_advisory) {
    out.push({ key: 'recipe_contract', label: t('Receta con pasos incompletos — regenera para detalle') });
  }
  if (meal._cross_week_repeat) {
    out.push({ key: 'cross_week_repeat', label: t('Se repite de una semana anterior — cámbialo si quieres variedad') });
  }
  return out;
}
