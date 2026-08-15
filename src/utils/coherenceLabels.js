// [P1-3 · 2026-05-10] Maps es-DO para los códigos del guard de coherencia
// recetas↔lista que se renderizan en la UI del Historial (tab "Ajustes").
//
// Por qué este helper:
//   El backend emite codes en snake_case (`cap_swallowed_modifier`,
//   `reject_minor`, etc.). Sin map, la UI los muestra crudos al usuario,
//   ininteligible. P1-3 cierra ese drift con dos catálogos:
//
//   1. ACTION_LABELS — `action_taken` del entry de
//      `_shopping_coherence_block_history`. Catálogo SSOT en backend:
//        - graph_orchestrator.py::review_plan_node ("degrade", "reject_minor",
//          "reject_high", "hydration_error")
//        - graph_orchestrator.py::assemble_plan_node ("not_applicable")
//        - graph_orchestrator.py::_recompute_aggregates_after_swap
//          ("post_swap_revalidation")
//
//   2. HYPOTHESIS_LABELS — `hypothesis` de cada divergencia detectada por
//      `_classify_divergence_hypothesis` en shopping_calculator.py:
//        - "cap_swallowed_modifier" / "unit_mismatch" / "yield_uncovered" /
//          "pantry_overdeduct" / "magnitude_undersupply" /
//          "recipe_unquantified" / "unknown".
//
// Cuando el backend agrega un nuevo code, agregar la entrada aquí también.
// El test `tests/test_p1_3_coherence_labels_cross_language.py` parsea las 3
// fuentes Python + este archivo y exige paridad.
//
// Mirror del patrón de `actionReasons.js` y `coherenceActions.js`.

// ---------------------------------------------------------------------------
// 1. Acciones del review/orchestrator (action_taken).
// ---------------------------------------------------------------------------
const COHERENCE_ACTION_LABELS = {
    // Estados normales (no anomalous): plan limpio o re-validación post-swap.
    not_applicable: 'Sin ajuste',
    post_swap_revalidation: 'Revalidación post-swap',

    // Acciones anómalas (cuentan al chip "X ajustes" — el sistema corrigió
    // drift recetas↔lista). Ver `coherenceActions.js::COHERENCE_ANOMALOUS_ACTIONS`.
    degrade: 'Plan degradado',
    reject_minor: 'Rechazo leve',
    reject_high: 'Rechazo alto',

    // Bug del consumer (block_set=True pero action_taken quedó None — fallback
    // defensivo P2-2 lo hidrató). Cuenta como anomalous.
    hydration_error: 'Error de hidratación',
};

/**
 * Devuelve la etiqueta es-DO breve para un `action_taken`, o null si el code
 * no está en el catálogo. El caller debería caer al code crudo cuando null
 * (no inventar copy).
 *
 * @param {string|null|undefined} code
 * @returns {string|null}
 */
export const getCoherenceActionLabel = (code) => {
    if (typeof code !== 'string') return null;
    const _t = code.trim();
    if (!_t) return null;
    return COHERENCE_ACTION_LABELS[_t] || null;
};

// ---------------------------------------------------------------------------
// 2. Hipótesis de divergencia (hypothesis).
// ---------------------------------------------------------------------------
const COHERENCE_HYPOTHESIS_LABELS = {
    // Food en receta TOTALMENTE ausente en lista. Causa típica: el cap
    // exact-match del aggregator engulló un modificador que hace que el
    // food no matchee la canónica del set. Documentado:
    // `caps_asymmetry_known_issue.md` + extendido en P1-1 (plurales,
    // modificadores triviales).
    cap_swallowed_modifier: 'Falta en la lista',

    // El food sí aparece en aggregated, pero la unit específica de la receta
    // no matcheaba. Típico: receta en `cda`, lista convertida a `g` por SKU
    // mapping; o cap exact-match engulló el modificador.
    unit_mismatch: 'Unidad distinta',

    // Yield no aplicado: ratio típico de proteína cocida (1.30-1.40×) o
    // legumbre cocida (0.30-0.40×) que el aggregator no convirtió a peso
    // crudo equivalente.
    yield_uncovered: 'Yield no aplicado',

    // Inventario / consumed dedujo de más: actual < expected/2 sin caer en
    // los rangos de yield ni en zero (que quedan cubiertos por las hipótesis
    // anteriores).
    pantry_overdeduct: 'Nevera dedujo de más',

    // [P2-GUARD-UNDERSUPPLY-CANONICAL · 2026-08-03] La MISMA magnitud que
    // `pantry_overdeduct` (actual < expected/2) pero sobre una lista que no
    // dedujo nevera: ahí no hay nevera a la que culpar, la lista sencillamente
    // compra menos de lo que las recetas piden. Antes se etiquetaba
    // `pantry_overdeduct` y le echaba la culpa a un inventario que ni
    // participó — y de paso heredaba su exención de escalada en el backend.
    magnitude_undersupply: 'Compra menor que la receta',

    // [P1-COHERENCE-MILD-SHORT · 2026-08-05] El hueco entre el sub-suministro
    // severo (<50% de lo que piden las recetas) y la tolerancia (~90%): compra
    // por debajo, pero dentro del ruido de envase y redondeo. Nada lo nombraba,
    // así que caía en `unknown` — el 28,2% de TODAS las hipótesis sobre 25
    // planes, y el 98,5% de esas incógnitas eran exactamente esta banda.
    // NO es accionable (no entra en `_ACTIONABLE_HYPOTHESES`): se etiqueta para
    // que las métricas de coherencia signifiquen algo, no para avisar al usuario.
    magnitude_mild_short: 'Compra algo por debajo de la receta',

    // [P1-COHERENCE-UNQUANTIFIED-LABEL · 2026-07-26] El alimento está en la
    // lista pero las recetas no le ponen cantidad: es el condimento, que la
    // receta escribe como "Sal al gusto" y parsea a `0.0 pizca`. No es una
    // falta ni un sobrante — no hay nada que comparar. Antes caía a `unknown`
    // ("Causa indeterminada"), que le decía al usuario que algo iba mal
    // cuando el plan estaba bien.
    recipe_unquantified: 'Sin cantidad en la receta',

    // Fallback cuando ninguna hipótesis específica clasifica.
    unknown: 'Causa indeterminada',
};

/**
 * Devuelve la etiqueta es-DO breve para una `hypothesis`, o null si el code
 * no está en el catálogo. El caller debería caer al code crudo cuando null.
 *
 * @param {string|null|undefined} code
 * @returns {string|null}
 */
export const getCoherenceHypothesisLabel = (code) => {
    if (typeof code !== 'string') return null;
    const _t = code.trim();
    if (!_t) return null;
    return COHERENCE_HYPOTHESIS_LABELS[_t] || null;
};

// ---------------------------------------------------------------------------
// 3. [P1-I18N-DASHBOARD · 2026-08-15] Las mismas etiquetas, traducibles.
// ---------------------------------------------------------------------------
// Los dos mapas de arriba se quedan EXACTAMENTE como están: son el SSOT y
// `test_p1_3_coherence_labels_cross_language.py` los parsea para exigir paridad
// con las tres fuentes Python del backend. Meterles `t()` dentro además los
// convertiría en llamadas en ámbito de módulo — evaluadas al importar, antes de
// que exista catálogo, congeladas en español para siempre.
//
// Estas tablas duplican los valores a propósito. La alternativa,
// `t(COHERENCE_HYPOTHESIS_LABELS[code])`, funcionaría en runtime —la clave del
// catálogo ES el texto español— pero sería una clave DINÁMICA e invisible para
// `npm run i18n:check`: nunca entraría en los catálogos y estas etiquetas se
// quedarían en español en los otros 4 idiomas sin que nada avisara.
//
// Si el backend añade un code y solo se actualiza el SSOT, el `??` de abajo lo
// pinta en español. Degrada; no inventa copy ni miente.

const _translatedActionLabels = (t) => ({
    not_applicable: t('Sin ajuste'),
    post_swap_revalidation: t('Revalidación post-swap'),
    degrade: t('Plan degradado'),
    reject_minor: t('Rechazo leve'),
    reject_high: t('Rechazo alto'),
    hydration_error: t('Error de hidratación'),
});

const _translatedHypothesisLabels = (t) => ({
    cap_swallowed_modifier: t('Falta en la lista'),
    unit_mismatch: t('Unidad distinta'),
    yield_uncovered: t('Yield no aplicado'),
    pantry_overdeduct: t('Nevera dedujo de más'),
    magnitude_undersupply: t('Compra menor que la receta'),
    magnitude_mild_short: t('Compra algo por debajo de la receta'),
    recipe_unquantified: t('Sin cantidad en la receta'),
    unknown: t('Causa indeterminada'),
});

/** Como `getCoherenceActionLabel`, traducida. `null` si el code no existe. */
export const getCoherenceActionLabelI18n = (code, t) => {
    const es = getCoherenceActionLabel(code);
    if (es === null) return null;
    if (typeof t !== 'function') return es;
    return _translatedActionLabels(t)[code.trim()] ?? es;
};

/** Como `getCoherenceHypothesisLabel`, traducida. `null` si el code no existe. */
export const getCoherenceHypothesisLabelI18n = (code, t) => {
    const es = getCoherenceHypothesisLabel(code);
    if (es === null) return null;
    if (typeof t !== 'function') return es;
    return _translatedHypothesisLabels(t)[code.trim()] ?? es;
};

// ---------------------------------------------------------------------------
// Exports raw para tests de paridad backend↔frontend (parser estático).
// ---------------------------------------------------------------------------
export const _COHERENCE_ACTION_LABELS_MAP = COHERENCE_ACTION_LABELS;
export const _COHERENCE_HYPOTHESIS_LABELS_MAP = COHERENCE_HYPOTHESIS_LABELS;
