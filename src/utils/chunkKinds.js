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
// [P1-I18N-UTILS-ETIQUETAS-INERTE · 2026-08-22] `t` entra como `_t` y NO se invoca en
// ámbito de módulo: es sólo el default de `getChunkKindLabel`. El alias con guion bajo lo
// deja además fuera del extractor textual de claves, que sólo debe recoger los literales
// de `_etiquetasTraducidas`.
import { t as _t } from '../i18n';

// Este mapa se queda EXACTAMENTE como está: lo parsea el test de paridad backend
// (`test_p2_hist_new_4_chunk_kind_parity*.py`) y es el fallback es-DO. Meterle la llamada
// de traducción DENTRO lo convertiría en ámbito de módulo, congelado al importar.
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
/**
 * [P1-I18N-UTILS-ETIQUETAS-INERTE · 2026-08-22] Las mismas etiquetas, traducibles.
 *
 * Este fichero estaba en la lista de `P1-I18N-UTILS-ETIQUETAS` y no recibió NADA — ni
 * import ni comentario. Se ve junto a su gemelo `chunkStatus.js` en la MISMA línea del
 * MISMO chip del Historial (`History.jsx:4044`), así que un usuario en inglés leía
 * literalmente «Completado · Inicial»: dos utils distintos, el mismo español, un solo
 * renglón.
 *
 * FUNCIÓN de `t`, no constante: un `t('…')` de módulo se congela en el idioma de arranque.
 * Literales a la vista porque el extractor del gate es textual.
 */
const _etiquetasTraducidas = (t) => ({
    initial_plan: t('Inicial'),
    first_chunk: t('Inicial'),
    rolling_refill: t('Refill'),
    catchup: t('Recuperación'),
});

/**
 * Etiqueta del tipo de bloque en el idioma activo.
 *
 * `tFn` opcional, con la `t` de módulo como default. Se conserva el contrato de devolver
 * `null` para un code desconocido: el call site pinta entonces el snake_case crudo, que
 * es información real, en vez de inventar copy.
 */
export const getChunkKindLabel = (code, tFn) => {
    if (typeof code !== 'string') return null;
    const _trimmed = code.trim();
    if (!_trimmed) return null;
    if (!CHUNK_KIND_LABELS[_trimmed]) return null;
    const _t_ = typeof tFn === 'function' ? tFn : _t;
    let _traducida;
    try {
        _traducida = _etiquetasTraducidas(_t_)[_trimmed];
    } catch {
        _traducida = undefined;
    }
    return _traducida || CHUNK_KIND_LABELS[_trimmed];
};

// Export del map crudo para tests de paridad backend↔frontend.
export const _CHUNK_KIND_LABELS_MAP = CHUNK_KIND_LABELS;
