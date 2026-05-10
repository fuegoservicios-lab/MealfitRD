// [P2-HIST-NEW-4 · 2026-05-09] Map chunk_kind (snake_case del backend)
// → label es-DO breve para chips de UI.
//
// Mirror del enum efectivo en `backend/cron_tasks.py::_enqueue_plan_chunk`
// + `routers/plans.py` donde se construye chunk_kind. Un test backend
// (`test_p2_hist_new_4_chunk_kind_parity*.py`) parsea el código de
// producción y exige paridad — si alguien introduce un kind nuevo
// sin actualizar este map, el test falla loud.
//
// Diferencia intencional con _TIER_LABELS (History.jsx:1978):
//   _TIER_LABELS está inline porque tiers son cosméticos del modal
//   solo (rotation: llm/shuffle/edge/emergency/...). chunk_kind se
//   usa en Dashboard, Recipes, Métricas, future surfaces — vale la
//   pena el SSOT compartido.
const CHUNK_KIND_LABELS = {
    // Plan creation paths.
    initial_plan: 'Inicial',
    // [P0-HIST-FIX-5 · 2026-05-09] `first_chunk` es alias de
    // `initial_plan` que el backend usa en algunos paths (visible
    // en plans.py al encolar el primer chunk del plan). Mismo
    // significado para el user.
    first_chunk: 'Inicial',
    // Rolling refill: chunks generados rolling tras el inicial.
    rolling_refill: 'Refill',
    // Catchup: chunks re-encolados para alcanzar días remanentes
    // tras un fallo o pausa larga (cron_tasks.py:7823+).
    catchup: 'Recuperación',
};

/**
 * Devuelve la etiqueta es-DO breve para un chunk_kind, o null si
 * el code no está en el catálogo. Frontend cae al code crudo (con
 * snake_case) cuando null para no inventar copy — mejor mostrar
 * `· rolling_refill_v2` que silenciar el chunk.
 *
 * @param {string|null|undefined} code
 * @returns {string|null}
 */
export const getChunkKindLabel = (code) => {
    if (typeof code !== 'string') return null;
    const _trimmed = code.trim();
    if (!_trimmed) return null;
    return CHUNK_KIND_LABELS[_trimmed] || null;
};

// Export del map crudo para tests de paridad backend↔frontend.
export const _CHUNK_KIND_LABELS_MAP = CHUNK_KIND_LABELS;
