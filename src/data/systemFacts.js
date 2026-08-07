// [P1-LANDING-BENCH-1 · 2026-08-07] SSOT de los HECHOS ESTRUCTURALES del sistema
// que el landing afirma en prosa y stats.
//
// POR QUÉ EXISTE. El audit del 2026-08-07 encontró los mismos números escritos a
// mano por todo el marketing: «17 micronutrientes» en 7 sitios, el catálogo dicho
// de 4 formas («200+», «+200», «más de 200») mientras el conteo real era 252, y
// «10 planes al mes» duplicado sin importar `TIER_CREDITS`. Es la misma clase de
// drift que `data/benchmark.js` cerró para las cifras MEDIDAS — este fichero la
// cierra para las cifras CONTABLES.
//
// DE DÓNDE SALEN LOS NÚMEROS. Del benchmark estructural del backend:
//   python scripts/landing_benchmark.py structural
// (deriva micros de `micronutrients.dri_targets`, reglas clínicas de los
// registries, y cuenta el catálogo en DB). Al refrescar un valor aquí, citar la
// corrida en el comentario. Guard-test: sección de-drift de
// `backend/tests/test_p1_landing_bench_1_anchors.py`.
//
// QUÉ NO VIVE AQUÍ: cifras MEDIDAS (MAPE, en-banda, versus) → `data/benchmark.js`;
// créditos por tier → `config/plans.js` (TIER_CREDITS, ya SSOT).
//
// Tooltip-anchor: P1-LANDING-BENCH-1

/* Micronutrientes comparados contra DRI. Derivado: len(dri_targets()) == 17
   (corrida structural 2026-08-07). */
export const MICROS_TRACKED = 17;

/* Catálogo de alimentos verificados. El conteo medido era 252 (2026-07-02,
   master_ingredients); el label público redondea hacia abajo a la centena para
   no tener que tocarlo con cada alta. */
export const VERIFIED_FOODS_LABEL = '200+';

/* Variables de entrada del formulario (21 pasos del wizard). */
export const INPUT_VARIABLES_LABEL = '20+';

/* Modelos IA orquestados por el motor (identidad confidencial — P1-AI-CONFIDENTIAL). */
export const AI_MODELS_LABEL = '3+';

/* Ciclos de recálculo que ofrece el formulario (groceryDuration: 7/15/30 días). */
export const CYCLE_DAYS = [7, 15, 30];
export const CYCLE_DAYS_LABEL = CYCLE_DAYS.join('/');

/* Comidas por día que entrega un plan: 3 base, hasta 5-6 en hipoglucemia,
   insulina o cirugía bariátrica. El benchmark live lo verifica con
   `safety.min_meals_compliance_pct` (perfiles 9 y 15 de la matriz). */
export const MEALS_PER_DAY = { min: 3, max: 6 };
export const MEALS_PER_DAY_LABEL = `${MEALS_PER_DAY.min}-${MEALS_PER_DAY.max}`;
