// [P0-HIST-FIX-5 · 2026-05-09] Map status del backend (snake_case)
// → label es-DO breve para chips/meta del modal del Historial.
//
// Los statuses canónicos vienen de `plan_chunk_queue.status` enum
// (CHECK constraint enforzado por la migración P1-AUDIT-HIST-3 —
// ver `migrations/p1_audit_hist_3_plan_chunk_queue_status_check.sql`):
//   - completed: chunk generó días, en plan_data.days.
//   - pending: chunk en cola esperando pickup.
//   - processing: chunk siendo procesado por worker.
//   - stale: marcado tras crash del worker, espera retry.
//   - failed: chunk dead-lettered (con dead_letter_reason si terminal).
//   - pending_user_action: pausado esperando acción (pantry, tz, etc.).
//   - cancelled: chunk superseded — restore reactiva un plan archivado
//     (cancelando los chunks vivos de source+target con dead_letter_reason
//     'restore_overwrite' / 'restore_source_archived' — routers/plans.py:
//     4133, 4175), o un cleanup cron lo marca como inválido. NO es
//     failure: el chunk fue invalidado por decisión administrativa,
//     no por un bug del pipeline.
//
// Para el modal del Historial, los nombres internos son ruidosos —
// el operator power-user los conoce pero el user normal ve
// `pending` y se pregunta "¿pendiente de qué?". Los labels es-DO
// dan contexto sin necesidad de tooltip.

const CHUNK_STATUS_LABELS = {
    completed: 'Completado',
    pending: 'En cola',
    processing: 'Procesando',
    stale: 'Reanudando',
    failed: 'Falló',
    pending_user_action: 'Esperando acción',
    // [P0-HIST-LEARN-3 · 2026-05-09] Antes ausente del map → el chip
    // mostraba el snake_case crudo `cancelled` cuando el user abría el
    // modal de un plan que tuvo restore (los chunks del source quedan
    // con este estado). Bug visible para cualquier user que restauró
    // ≥1 plan archivado.
    cancelled: 'Cancelado',
};

// Severity por status — usado para colorear el meta del chunk.
// Útil para que el operator escanee la lista visualmente.
const CHUNK_STATUS_SEVERITY = {
    completed: 'ok',     // verde / neutral
    pending: 'info',     // azul tenue
    processing: 'info',
    stale: 'warn',       // amber, requiere atención del cron
    failed: 'bad',       // rojo
    pending_user_action: 'warn',
    // [P0-HIST-LEARN-3 · 2026-05-09] Severity neutral — no es failure
    // ni acción pendiente del user. El chunk fue invalidado por
    // restore/cleanup; el chip solo informa que ese chunk no llegó a
    // contribuir al plan vivo.
    cancelled: 'neutral',
};

/**
 * Devuelve label es-DO para un status. Fallback al code crudo
 * cuando no está mapeado (mejor mostrar `mystery_status` que
 * silenciar la señal).
 *
 * @param {string|null|undefined} status
 * @returns {string} label o el code original si no mapea.
 */
export const getChunkStatusLabel = (status) => {
    if (typeof status !== 'string') return '';
    const _trimmed = status.trim();
    if (!_trimmed) return '';
    return CHUNK_STATUS_LABELS[_trimmed] || _trimmed;
};

/**
 * Severity bucket para colorear el meta line.
 * @param {string|null|undefined} status
 * @returns {'ok'|'info'|'warn'|'bad'|'neutral'}
 */
export const getChunkStatusSeverity = (status) => {
    if (typeof status !== 'string') return 'neutral';
    return CHUNK_STATUS_SEVERITY[status.trim()] || 'neutral';
};

// Export del map crudo para tests de paridad / drift detection.
// El test backend `test_p0_hist_learn_3_status_cancelled_mapped.py`
// parsea este archivo y exige paridad con `_CANONICAL_STATES` del
// SSOT (`tests/test_p1_audit_hist_3_status_check_constraint.py`).
// Si el DB enum gana un estado nuevo sin actualizar este map, el
// test falla loud — el chip caería al snake_case crudo.
export const _CHUNK_STATUS_LABELS_MAP = CHUNK_STATUS_LABELS;
export const _CHUNK_STATUS_SEVERITY_MAP = CHUNK_STATUS_SEVERITY;
