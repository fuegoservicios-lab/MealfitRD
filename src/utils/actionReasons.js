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
//
// [P1-I18N-DASHBOARD] El catálogo es una FUNCIÓN que recibe el traductor,
// no una constante de módulo. Una tabla de rótulos traducidos declarada a
// nivel de fichero se evalúa al importar, antes de que el catálogo de idioma
// exista, y se queda congelada en español para siempre — y en es-DO parece
// correcta, así que sobrevive a cualquier revisión visual.
const actionReasonLabels = (t) => ({
    // Pause reasons (chunks pending_user_action por gates del
    // pipeline LangGraph).
    learning_zero_logs: t('Registra tu día'),
    stale_snapshot: t('Validando nevera'),
    stale_snapshot_live_unreachable: t('Refresca nevera'),
    empty_pantry: t('Nevera vacía'),
    tz_unresolved: t('Zona horaria'),
    missing_prior_lessons: t('Reconstruyendo'),
    missing_start_date_no_anchor: t('Falta fecha'),

    // Dead-letter reasons (chunks failed con dead_letter_reason).
    recovery_exhausted: t('No recuperable'),
    unrecoverable_missing_anchor: t('Anchor irresoluble'),
    unrecoverable_corrupted_date: t('Fecha inválida'),
    missing_prior_lessons_unrecoverable: t('Lecciones perdidas'),
    restore_overwrite: t('Cancelado por restore'),
    restore_source_archived: t('Cancelado al archivar'),

    // Stuck reasons (P1-HIST-BLOCKED-STUCK — chunks processing/stale
    // con lag alto). Se sufijan así para que un chip muestre solo
    // el indicador "tardando".
    stuck_processing: t('Procesando lento'),
    stuck_stale: t('Reanudando'),
});

/** Identidad: devuelve el español tal cual. Es el fallback cuando el caller
 *  todavía no pasa traductor, y lo que produce el snapshot es-DO de abajo. */
const _sinTraducir = (s) => s;

/**
 * Devuelve la etiqueta breve para un reason_code, o null si el code no está
 * en el catálogo. El frontend cae al texto crudo ("acción") cuando null para
 * no inventar copy.
 *
 * El traductor es OPCIONAL: sin él devuelve el español, que es exactamente lo
 * que hacía antes de existir el motor de idioma.
 *
 * @param {string|null|undefined} code
 * @param {Function} [traducir] el `t` del motor de idioma
 * @returns {string|null}
 */
export const getActionReasonLabel = (code, traducir) => {
    if (typeof code !== 'string') return null;
    const _trimmed = code.trim();
    if (!_trimmed) return null;
    const t = typeof traducir === 'function' ? traducir : _sinTraducir;
    return actionReasonLabels(t)[_trimmed] || null;
};

// Export del map crudo (es-DO) para tests de paridad backend↔frontend.
export const _ACTION_REASON_LABELS_MAP = actionReasonLabels(_sinTraducir);
