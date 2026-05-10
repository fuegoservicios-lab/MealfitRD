// [P2-HIST-NEW-1 · 2026-05-09] Map reason_code → label es-DO breve
// para chips de UI (card del Historial, slots Dashboard).
//
// Mirror del catálogo en `backend/routers/plans.py::api_blocked_reasons`
// (~3670+) con dos diferencias intencionales:
//   1. Labels más cortos — los del backend son títulos de banner (1
//      párrafo); aquí son etiquetas de chip (≤20 chars).
//   2. Sin CTA / URL — el chip solo informa; la acción concreta
//      está en el modal del Historial vía /blocked_reasons.
//
// Cuando el backend agrega un nuevo reason_code en /blocked_reasons,
// agregar la entrada aquí también. El test
// `actionReasons.test.js` parsea el backend y exige paridad.
const ACTION_REASON_LABELS = {
    // Pause reasons (chunks pending_user_action por gates del
    // pipeline LangGraph).
    learning_zero_logs: 'Registra tu día',
    stale_snapshot: 'Validando nevera',
    stale_snapshot_live_unreachable: 'Refresca nevera',
    empty_pantry: 'Nevera vacía',
    tz_unresolved: 'Zona horaria',
    missing_prior_lessons: 'Reconstruyendo',
    missing_start_date_no_anchor: 'Falta fecha',

    // Dead-letter reasons (chunks failed con dead_letter_reason).
    recovery_exhausted: 'No recuperable',
    unrecoverable_missing_anchor: 'Anchor irresoluble',
    unrecoverable_corrupted_date: 'Fecha inválida',
    missing_prior_lessons_unrecoverable: 'Lecciones perdidas',
    restore_overwrite: 'Cancelado por restore',
    restore_source_archived: 'Cancelado al archivar',

    // Stuck reasons (P1-HIST-BLOCKED-STUCK — chunks processing/stale
    // con lag alto). Se sufijan así para que un chip muestre solo
    // el indicador "tardando".
    stuck_processing: 'Procesando lento',
    stuck_stale: 'Reanudando',
};

/**
 * Devuelve la etiqueta es-DO breve para un reason_code, o null si
 * el code no está en el catálogo. El frontend cae al texto crudo
 * ("acción") cuando null para no inventar copy.
 *
 * @param {string|null|undefined} code
 * @returns {string|null}
 */
export const getActionReasonLabel = (code) => {
    if (typeof code !== 'string') return null;
    const _trimmed = code.trim();
    if (!_trimmed) return null;
    return ACTION_REASON_LABELS[_trimmed] || null;
};

// Export del map crudo para tests de paridad backend↔frontend.
export const _ACTION_REASON_LABELS_MAP = ACTION_REASON_LABELS;
