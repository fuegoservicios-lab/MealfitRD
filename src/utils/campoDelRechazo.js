// [CI-LINT-2026-11-14] Sale de Plan.jsx: un fichero de componentes que exporta funciones sueltas
// rompe el refresco en caliente (react-refresh/only-export-components). Misma función, sin cambios.
/**
 * [P1-PLAN-LOTE-164 · 2026-09-22] ¿Qué campo rechazó el servidor? Para volver al formulario EN ese paso y no en el
 * primero. Formas reales del backend (`routers/plans.py`): `invalid_biometric_range` trae `errors[].field`,
 * `missing_required_fields` trae `missing_fields[]`, y el alcance clínico no trae campo pero siempre es el de
 * condiciones médicas. Sin pista, `undefined`: el formulario abre donde estaba.
 */
export function campoDelRechazo(detail, code) {
    if (!detail || typeof detail !== 'object') return undefined;
    const primero = Array.isArray(detail.errors) ? detail.errors[0] : null;
    if (primero && typeof primero.field === 'string') return primero.field;
    if (Array.isArray(detail.missing_fields) && typeof detail.missing_fields[0] === 'string') return detail.missing_fields[0];
    if (typeof detail.field === 'string') return detail.field;
    if (code === 'clinical_scope_exceeded' || code === 'too_many_medical_conditions') return 'medicalConditions';
    return undefined;
}
