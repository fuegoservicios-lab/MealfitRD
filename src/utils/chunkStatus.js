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

// [P1-I18N-UTILS-ETIQUETAS · 2026-08-21] `t` entra como `_t` y NO se invoca en
// ámbito de módulo: es solo el valor por defecto de `getChunkStatusLabel`, para
// que un call site que aún no pasa su propia función de traducción lea el
// catálogo ACTIVO en vez de quedarse clavado en español. El alias con guion bajo
// lo deja además fuera del extractor textual de claves.
//
// [P1-I18N-UTILS-ETIQUETAS-INERTE · 2026-08-22] …y durante un día esto fue TODO lo que
// hubo. El commit que dice haber convertido cinco utils dejó aquí exactamente dos cosas:
// este import y un comentario que prometía «la tabla traducida de más abajo». Esa tabla
// no existía: el fichero terminaba en los dos mapas españoles, `getChunkStatusLabel` no
// recibía `t`, `_t` no se invocaba nunca, y 6 de las 7 etiquetas ni siquiera estaban en
// los catálogos. Medido con el catálogo en-US CARGADO y `t('Guardar') === 'Save'`:
// `getChunkStatusLabel('completed')` seguía devolviendo «Completado».
//
// Los otros cuatro utils de aquel commit sí se convirtieron de verdad. O sea que esto no
// era «falta un arreglo», era un arreglo que PARECÍA hecho — y de los dos, el segundo es
// peor: nadie vuelve a mirar lo que ya tiene su marcador puesto.
import { t as _t } from '../i18n';

// Este mapa se queda EXACTAMENTE como está: es el SSOT que parsean
// `test_p0_hist_learn_3_status_cancelled_mapped.py` (exige la fila
// `cancelled: 'Cancelado'` textual) y `test_p0_hist_fix_5_metrics_humanized.py`
// (exige cada `<status>:`), y es el fallback en español cuando el catálogo no
// cubre un code. Meterle la llamada de traducción DENTRO lo convertiría en
// ámbito de módulo — evaluado al importar, congelado en español para siempre.
// Sigue apareciendo en el detector de español sin envolver, y es correcto que
// aparezca: son literales españoles sin envolver. Lo que se PINTA sale de
// `_etiquetasTraducidas`, justo debajo.
// [I18N-EXEMPT: SSOT canonico de estados; lo que se PINTA sale de _etiquetasTraducidas, debajo]
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
/**
 * [P1-I18N-UTILS-ETIQUETAS-INERTE · 2026-08-22] Las mismas etiquetas, traducibles.
 *
 * Es una FUNCIÓN de `t` y no una constante, por la razón de siempre en este repo: un
 * `t('…')` en ámbito de módulo se evalúa AL IMPORTAR —antes de que exista catálogo— y se
 * congela en español para siempre. Y en es-DO parece correcto, así que sobrevive a
 * cualquier revisión visual.
 *
 * Los literales van ENTEROS y a la vista: el extractor de `i18n-check` es textual y sólo
 * reconoce una llamada con la cadena escrita dentro. (Y ojo con escribir el ejemplo
 * literalmente en un comentario: el extractor NO distingue prosa de código, así que la
 * cadena de ejemplo entra como clave viva y el gate pide traducirla — pasó al escribir
 * este mismo bloque.) Pasar `CHUNK_STATUS_LABELS[k]` por variable funcionaría en
 * runtime —la clave del catálogo ES el texto español— pero sería una clave DINÁMICA,
 * invisible para el gate: nunca entraría en los catálogos y estas siete se quedarían en
 * español para siempre sin que nada avisara. Es el fallo silencioso que el validador
 * existe para impedir, y la misma razón por la que `getFieldLabels` duplica sus valores.
 */
const _etiquetasTraducidas = (t) => ({
    completed: t('Completado'),
    pending: t('En cola'),
    processing: t('Procesando'),
    stale: t('Reanudando'),
    failed: t('Falló'),
    pending_user_action: t('Esperando acción'),
    cancelled: t('Cancelado'),
});

/**
 * Etiqueta del estado en el idioma activo.
 *
 * `tFn` es opcional y su default es la `t` de módulo (no invocada aquí arriba, ver el
 * import): así un call site que todavía no pasa su propia función lee igualmente el
 * catálogo ACTIVO en vez de quedarse clavado en español. Si el catálogo no cubre el code
 * —o `tFn` no es función— cae al mapa es-DO, y de ahí al code crudo: mejor enseñar
 * `mystery_status` que silenciar la señal.
 */
export const getChunkStatusLabel = (status, tFn) => {
    if (typeof status !== 'string') return '';
    const _trimmed = status.trim();
    if (!_trimmed) return '';
    const _t_ = typeof tFn === 'function' ? tFn : _t;
    let _traducida;
    try {
        _traducida = _etiquetasTraducidas(_t_)[_trimmed];
    } catch {
        _traducida = undefined;  // una `t` rota no puede tumbar el chip
    }
    return _traducida || CHUNK_STATUS_LABELS[_trimmed] || _trimmed;
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
