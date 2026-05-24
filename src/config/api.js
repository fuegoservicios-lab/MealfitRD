import { supabase } from '../supabase';

// Central API configuration
// En desarrollo, apuntamos directamente al servidor Python local.
// En producción (Vercel), utilizamos la variable de entorno para saber dónde está alojado el backend.
export const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:3001' : (import.meta.env.VITE_API_BASE_URL || '');

// Helper to build API URLs
export const api = (path) => `${API_BASE}${path}`;

// [P0-FETCH-AUTH-TIMEOUT · 2026-05-09] Promise.race protege contra el caso
// donde `supabase.auth.getSession()` cuelga (refresh token expirado +
// network slow, observado intermitente en local). Antes el `await raw`
// podía bloquear FOREVER (no rechaza, no resuelve) → cualquier consumidor
// que esperara la promesa quedaba pegado (síntoma: páginas en skeleton
// infinito). Si el lookup tarda >5s, seguimos sin token: el endpoint
// devolverá 401 y el caller decide qué hacer (mostrar empty state, redir
// a login, etc.) — mucho mejor que pegarse en spinner.
const _AUTH_SESSION_TIMEOUT_MS = 5000;
const _getSessionWithTimeout = async () => {
    try {
        const { data: { session } } = await Promise.race([
            supabase.auth.getSession(),
            new Promise((_, reject) => setTimeout(
                () => reject(new Error('AUTH_SESSION_TIMEOUT')),
                _AUTH_SESSION_TIMEOUT_MS,
            )),
        ]);
        return session;
    } catch (e) {
        if (e && e.message === 'AUTH_SESSION_TIMEOUT') {
            console.warn(`⚠️ supabase.auth.getSession() timeout (${_AUTH_SESSION_TIMEOUT_MS}ms). Proceeding without token; expect 401.`);
        } else {
            console.error('Error getting auth session for fetch:', e);
        }
        return null;
    }
};

// Custom fetch wrapper that includes Supabase auth token
export const fetchWithAuth = async (url, options = {}) => {
    const session = await _getSessionWithTimeout();
    const token = session?.access_token || null;

    const headers = new Headers(options.headers || {});
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    // Envolvemos cualquier ruta relativa (ej. "/api/analyze") con API_BASE
    const finalUrl = url.startsWith('http') ? url : api(url);

    return fetch(finalUrl, {
        ...options,
        headers
    });
};

export const getPlanChunkStatus = (planId) => fetchWithAuth(`/api/plans/${planId}/chunk-status`);
export const retryPlanChunk = (planId, chunkId) => fetchWithAuth(`/api/plans/${planId}/retry-chunk/${chunkId}`, { method: 'POST' });
// [P1-ζ] Re-encola un chunk dead-lettered forzando flexible_mode + advisory_only.
// Cubre el último escalón cuando la cascada de recovery agotó sus reintentos
// automáticos y el banner del frontend ofrece "Generar versión simplificada".
export const regenerateChunkSimplified = (planId, chunkId) =>
    fetchWithAuth(`/api/plans/${planId}/chunks/${chunkId}/regenerate-simplified`, { method: 'POST' });

// [P0-HIST-1 · 2026-05-09] Restauración atómica de un plan archivado desde
// Historial. El backend cancela chunks pending/processing del target,
// libera chunk_user_locks asociados, y sobrescribe plan_data + columnas
// top-level (name/calories/macros/meal_names/ingredients/techniques) en
// una sola transacción. El consumidor en AssessmentContext debe usar
// esta función en lugar del UPDATE directo via supabase client cuando el
// origen sea un plan archivado del historial.
export const restorePlanFromHistory = (sourcePlanId) =>
    fetchWithAuth('/api/plans/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_plan_id: sourcePlanId }),
    });

// [P0-HIST-3 · 2026-05-09] Eliminación atómica de un plan archivado
// desde Historial. El backend libera chunk_user_locks asociados antes
// del DELETE (chunk_user_locks no tiene FK a meal_plans, así que el
// CASCADE no los limpia). El DELETE cascadea plan_chunk_queue y, post
// migración SSOT p0_hist_3_telemetry_orphan_fk, hace SET NULL en
// chunk_lesson_telemetry y chunk_deferrals. Reemplaza el direct
// supabase.from('meal_plans').delete() del frontend que dejaba locks
// zombi y telemetría huérfana.
export const deletePlanFromHistory = (planId) =>
    fetchWithAuth(`/api/plans/${planId}`, { method: 'DELETE' });

// [P1-HIST-3 · 2026-05-09] Single-roundtrip para el conteo de lecciones
// (chunk_lesson_telemetry) por plan del usuario. El History page
// llama esto una vez al montarse en lugar de N queries por card.
// Response shape: `{ counts: { "<plan_id>": <count>, ... } }`.
// Planes sin entradas no aparecen en el dict — el frontend trata
// "sin entrada" como cero.
// [P1-HISTORY-ABORT · 2026-05-23] options se forwardea a fetchWithAuth →
// permite pasar `{ signal }` desde History.jsx para cancelar in-flight
// requests on unmount. Backward-compat: getLessonsCounts() sigue funcionando.
export const getLessonsCounts = (options = {}) =>
    fetchWithAuth('/api/plans/lessons-counts', options);

// [P1-HIST-5 · 2026-05-09] Renombrado atómico de un plan archivado.
// El backend actualiza la columna top-level `name` Y `plan_data.name`
// (jsonb_set) en el mismo UPDATE — antes el flujo legacy de
// History.jsx::handleEditSave hacía solo el UPDATE de la columna y
// dejaba `plan_data.name` stale, que luego se propagaba a otros
// contextos via swap/shift_plan/restore copiando plan_data.
export const renamePlan = (planId, newName) =>
    fetchWithAuth(`/api/plans/${planId}/name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
    });

// [P1-HIST-AUDIT-4 · 2026-05-09] Listado del Historial con projection
// mínima. Reemplaza el `supabase.from('meal_plans').select('*')` del
// frontend que descargaba el `plan_data` jsonb completo (30-80KB por
// plan). El endpoint extrae solo los keys que la card consume vía
// operadores jsonb (`->`, `->>`, `jsonb_array_length`) y devuelve
// `{plans: [...]}`.
//
// El modal del Historial sigue necesitando `plan_data.days/meals`
// para el menú; eso lo carga lazy `getPlanFullData(planId)` cuando
// el usuario abre la card — concentra el bandwidth pesado en el
// plan que sí se mira.
//
// Response shape: ver docstring de `api_plans_history_list` en
// `backend/routers/plans.py` (~línea 4140).
// [P1-HISTORY-ABORT · 2026-05-23] options forwardea a fetchWithAuth (signal).
export const getHistoryList = (options = {}) =>
    fetchWithAuth('/api/plans/history-list', options);

// [P2-HIST-AUDIT-2 · 2026-05-09] Detalle por-plan de lecciones del
// aprendizaje continuo (`chunk_lesson_telemetry`). Complementa
// `/lessons-counts` (conteo agregado) — el modal del Historial usa
// este endpoint en el tab "Lecciones" para expandir las filas
// individuales del plan abierto.
//
// Misma whitelist de events que el conteo (P1-HIST-AUDIT-5) →
// drift cero entre el chip y el detalle.
export const getPlanLessonsDetail = (planId) =>
    fetchWithAuth(`/api/plans/${planId}/lessons`);

// [P2-HIST-AUDIT-2 · 2026-05-09] Detalle por-plan del historial de
// ajustes de coherencia recetas↔lista (P3-NEW-C, append-only cap 20).
// Complementa el chip "X ajustes" — el modal del Historial usa este
// endpoint en el tab "Ajustes".
export const getPlanCoherenceHistory = (planId) =>
    fetchWithAuth(`/api/plans/${planId}/coherence-history`);

// [P0-AUDIT-HIST-2 · 2026-05-09] Resumen agregado de estados de
// `plan_chunk_queue` por plan del usuario (single roundtrip, GROUP BY
// meal_plan_id). El Historial lo usa para reconciliar el bucket de
// la card cuando `plan_data._user_action_required` está null pero la
// queue tiene chunks `pending_user_action` o `failed` — drift que
// ocurre porque solo `_escalate_unrecoverable_chunk` actualiza el
// jsonb mientras 6+ rutas setean `pending_user_action`.
//
// Response: `{ summary: { "<plan_id>": { pending_user_action_count,
// failed_count, in_flight_count, completed_count, total } } }`.
// Planes sin chunks no aparecen en el dict — el frontend los trata
// como "sin info de queue, confiar en plan_data".
// [P1-HISTORY-ABORT · 2026-05-23] options forwardea a fetchWithAuth (signal).
export const getHistoryStatusSummary = (options = {}) =>
    fetchWithAuth('/api/plans/history-status-summary', options);

// [P2-HIST-AUDIT-9 · 2026-05-09] Reasons per-chunk de un plan (lazy
// fetch al abrir el modal del Historial). Llama al endpoint existente
// `/blocked_reasons` con `include_failed=true` para que cubra:
//   - chunks `pending_user_action` (pause pantry/tz/missing_lessons).
//   - chunks `failed` con dead_letter_reason poblado (recovery
//     exhausted, unrecoverable_*, etc.).
//
// [P1-HIST-BLOCKED-STUCK · 2026-05-09] Sumamos `include_stuck=true`
// para que el modal también muestre chunks atascados en `processing`
// o `stale` con lag > `MEALFIT_BLOCKED_REASONS_STUCK_LAG_HOURS`
// (default 3h). Antes esos chunks eran invisibles al usuario hasta
// que el cron los escalaba a `failed` (a veces ≥1h más). Cierre
// del gap P1-3 del audit Historial 2026-05-09. Reason codes nuevos:
//   - stuck_processing: chunk con worker activo pero sin avanzar.
//   - stuck_stale: chunk marcado stale tras crash del worker.
//
// Response: `{ plan_id, blocked, reasons: [{chunk_id, week_number,
// reason_code, status, dead_letter_reason, paused_seconds,
// lag_seconds, title, body, cta, url, ...}] }`.
export const getPlanBlockedReasons = (planId) =>
    fetchWithAuth(
        `/api/plans/${planId}/blocked_reasons?include_failed=true&include_stuck=true`
    );

// [P2-HIST-AUDIT-10 · 2026-05-09] Detalle por-chunk de métricas
// operacionales y `learning_metrics`. Combina `plan_chunk_queue`
// (estado vivo: status, quality_tier, attempts, chunk_kind,
// lag_seconds_at_pickup, escalated_at, learning_persisted_at,
// dead_letter_reason, learning_metrics jsonb) con
// `plan_chunk_metrics` (snapshot al completar: duration_ms,
// was_degraded, retries, lag_seconds, learning_repeat_pct,
// rejection_violations, allergy_violations,
// pantry_snapshot_age_hours, error_message). Modal del Historial
// usa este endpoint en el tab "Métricas".
//
// Response: `{ plan_id, chunks: [{chunk_id, week_number, ...,
// learning_metrics: <obj|null>, metrics: <obj|null>}, ...] }`.
export const getPlanChunkMetrics = (planId) =>
    fetchWithAuth(`/api/plans/${planId}/chunk-metrics`);

// [P1-HIST-LIFETIME-LESSONS · 2026-05-09] Surface del aprendizaje
// continuo lifetime. Antes el tab "Lecciones" solo mostraba
// telemetría (chunk_lesson_telemetry events whitelisted) — eso es
// señal sobre el aprendizaje, NO el aprendizaje en sí. Las 3
// estructuras reales (`_lifetime_lessons_summary`,
// `_lifetime_lessons_history`, `_critical_lessons_permanent`) viven
// en `meal_plans.plan_data` y son lo que el sistema realmente aprendió
// de las comidas/rechazos/alergias del usuario. Este endpoint las
// surface en una sola request con caps defensivos (history y
// critical_permanent ≤50; summary completo).
//
// Response shape: ver docstring de `api_plan_lifetime_lessons` en
// `backend/routers/plans.py:~4640`.
export const getPlanLifetimeLessons = (planId) =>
    fetchWithAuth(`/api/plans/${planId}/lifetime-lessons`);
