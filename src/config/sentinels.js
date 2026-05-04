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
