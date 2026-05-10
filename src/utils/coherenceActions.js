// [P2-HIST-AUDIT-13 · 2026-05-09] SSOT del set de `action_taken`
// que cuentan como AJUSTES anomalous del guard de coherencia
// recetas↔lista (chip "X ajustes" del Historial).
//
// Mirror del backend: `backend/constants.py::COHERENCE_ANOMALOUS_ACTIONS`.
// Drift detection cross-archivo (Python + JS) verifica que ambos sets
// son idénticos en `tests/test_p2_hist_audit_13_coherence_anomalous_ssot.py`
// (Python parsea este archivo + el de constants.py).
//
// Antes (audit Historial 2026-05-09):
//   `History.jsx:getCoherenceAdjustsCount` tenía 4 string literals
//   inline encadenados con OR (`action === 'degrade' || action === ...`).
//   Cuando el cron P3-B añadía un nuevo bucket, había que actualizar
//   ambos sites manualmente.
//
// Ahora cualquier consumidor JS importa `COHERENCE_ANOMALOUS_ACTIONS`
// (Set) o el helper `isAnomalousCoherenceAction(action)`.
//
// Catálogo (decisión documentada del audit 2026-05-08 → P3-NEW-C):
//
//   ANOMALOUS (cuentan al chip — el sistema corrigió drift recetas↔lista):
//     - degrade: el guard mode=block degradó el plan (kill switch knob
//       MEALFIT_SHOPPING_COHERENCE_BLOCK_ACTION='degrade').
//     - reject_minor / reject_high: el guard rechazó el plan; review
//       node retorna severity minor/high según knob.
//     - hydration_error: bug del consumer (block_set=True pero
//       action_taken quedó None hasta que el fallback defensivo lo
//       hidrató). Cuenta como anomalous porque indica un fallo del
//       contrato P2-2.
//
//   NO ANOMALOUS (NO cuentan al chip):
//     - not_applicable: warn-only, block_set=False (info pura).
//     - post_swap_revalidation (P2-B): observability tras swap; el cron
//       P3-B lo trata como bucket dedicado, NO anomalous.
//     - null: invariante violado (combinación reservada error).

export const COHERENCE_ANOMALOUS_ACTIONS = new Set([
    'degrade',
    'reject_minor',
    'reject_high',
    'hydration_error',
]);

// Helper canónico para clasificar un action_taken. Defensivo contra
// non-string inputs.
export const isAnomalousCoherenceAction = (action) => {
    if (typeof action !== 'string') return false;
    return COHERENCE_ANOMALOUS_ACTIONS.has(action);
};
