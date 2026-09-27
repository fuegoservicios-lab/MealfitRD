// [P1-PLAN-LOTE-430 · 2026-09-27] ¿Se usa la meta de peso con este objetivo?
//
// Solo perder grasa y ganar músculo: el backend la lee para el plazo estimado (nutrition_calculator, `targetWeight` con
// lose_fat/gain_muscle) y nada más. Con «mantenimiento» o «rendimiento» nadie la lee, así que no se pregunta. Sin
// objetivo aún (el paso de objetivo va antes), se pregunta: no se decide por un vacío.
export const metaDePesoAplica = (mainGoal) => mainGoal !== 'maintenance' && mainGoal !== 'performance';
