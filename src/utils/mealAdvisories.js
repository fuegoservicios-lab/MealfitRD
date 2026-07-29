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
export function getMealAdvisories(meal) {
  if (!meal || typeof meal !== 'object') return [];
  const out = [];
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
      out.push({ key: 'dish_quality', label: 'Cantidad de un ingrediente estimada — puede variar' });
    } else {
      out.push({ key: 'dish_quality', label: 'Receta básica — regenera para más detalle' });
    }
  }
  if (meal._slot_advisory) {
    out.push({ key: 'slot', label: 'Horario inusual para este plato' });
  }
  if (meal._appetibility_combo_warning) {
    out.push({ key: 'combo', label: 'Combinación inusual (fruta dulce + salado)' });
  }
  if (meal._macro_band_low) {
    out.push({ key: 'macro_band', label: 'Macros algo fuera de la banda objetivo' });
  }
  if (meal._name_honesty_degraded) {
    out.push({ key: 'name_honesty', label: 'El nombre puede no reflejar la proteína real' });
  }
  if (meal._recipe_contract_advisory) {
    out.push({ key: 'recipe_contract', label: 'Receta con pasos incompletos — regenera para detalle' });
  }
  if (meal._cross_week_repeat) {
    out.push({ key: 'cross_week_repeat', label: 'Se repite de una semana anterior — cámbialo si quieres variedad' });
  }
  return out;
}
