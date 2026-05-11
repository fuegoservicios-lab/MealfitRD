// [P1-FORM-2] Sentinels exclusivos del wizard de assessment.
// ============================================================
// Antes, cada componente Q* (QAllergies, QDislikes, QMedical, QStruggles)
// declaraba su `const SENTINEL = "Ninguna"` o `"Ninguno"` localmente y
// hardcodeaba el label. Si un translator o un futuro refactor cambiaba
// "Ninguna" por "Sin alergia" en QAllergies pero olvidaba actualizar QMedical,
// la detección de exclusividad se rompía silenciosamente y el backend
// `_merge_other_text_fields` (graph_orchestrator.py:_SENTINEL_NONE_VALUES)
// tampoco lo reconocía → reaparecía la contradicción de P0-FORM-1
// (`allergies=["Sin alergia", "Maní"]` llegando al LLM como ambos verdaderos).
//
// Ahora la fuente única de verdad vive aquí: cada Q* importa SENTINELS.<field>
// y deriva su label del mismo valor. Cambiar el sentinel en UN solo lugar
// propaga la actualización a los 4 componentes.
//
// CONTRATO CON BACKEND:
// - El backend (`graph_orchestrator.py:_SENTINEL_NONE_VALUES`) compara
//   contra la versión `.lower()` de estos valores.
// - Si se añade un nuevo sentinel acá (o se cambia el texto), DEBE
//   reflejarse en `_SENTINEL_NONE_VALUES` (frozenset Python). El backend
//   incluye un comentario que cita este archivo como SSOT.
// - Convención: usar la misma forma gramatical que el sustantivo del campo.
//   Femenino → "Ninguna" (alergia, condición). Masculino → "Ninguno"
//   (rechazo/dislike, obstáculo/struggle).
//
// [P1-FORM-13] GATE DE DRIFT EN CI:
// `backend/test_p1_form_13_sentinel_drift.py` parsea este archivo en
// runtime, extrae los valores de SENTINELS, y verifica que cada uno
// (lowercased) esté en `_SENTINEL_NONE_VALUES`. Si renombras un sentinel
// aquí (ej. "Ninguna" → "Sin alergia") sin actualizar el backend, el
// test falla con un mensaje accionable que indica EXACTAMENTE qué
// añadir al frozenset Python. Sin este test, la divergencia rompía
// silenciosamente la detección de exclusividad y reaparecía la
// contradicción de seguridad médica de P0-FORM-1.
// ============================================================

/**
 * Mapeo `formField → sentinel` para los 4 multi-select del wizard.
 * Importado por cada Q* en InteractiveQuestions.jsx.
 */
export const SENTINELS = Object.freeze({
    allergies: 'Ninguna',
    medicalConditions: 'Ninguna',
    dislikes: 'Ninguno',
    struggles: 'Ninguno',
});

/**
 * Set único de strings sentinel (deduplicado). Útil para validación
 * cross-field (ej. detectar si un valor cualquiera es un sentinel sin
 * saber a qué field pertenece). Las comparaciones deben ser case-sensitive
 * en frontend (el chip label se renderiza tal cual); el backend hace
 * case-insensitive match con `.lower()`.
 */
export const SENTINEL_VALUES = Object.freeze(
    Array.from(new Set(Object.values(SENTINELS)))
);

/**
 * Devuelve true si `value` es uno de los sentinels (case-sensitive).
 * Helper conveniente para lógica que opera sin contexto de field.
 */
export const isSentinelValue = (value) =>
    typeof value === 'string' && SENTINEL_VALUES.includes(value);

// [P3-NEW-2 · 2026-05-11] Review tracker. Cuando un sentinel se renombra,
// añade fecha + razón aquí. Permite a un futuro auditor confirmar que
// `Ninguna`/`Ninguno` siguen siendo los valores activos sin parsear git log.
//
// Última review confirmada: 2026-05-11
//   - 4 sentinels activos (allergies/medicalConditions/dislikes/struggles).
//   - Gender agreement preservado (Ninguna fem / Ninguno masc).
//   - 0 P0-FORM-1 reincidencias desde la introducción de SENTINELS SSOT.
//   - Test backend `test_p1_form_13_sentinel_drift.py` enforza paridad
//     con `_SENTINEL_NONE_VALUES` (graph_orchestrator.py).
//   - Test anchor `test_p3_new_2_sentinels_review.py` añadido en P3-NEW-2.
//
// Si añades un nuevo sentinel (ej. `cravings: 'Ningún antojo'`), añadir aquí
// + actualizar el backend frozenset + el test backend P1-FORM-13.
