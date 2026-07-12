import { getBackendToken } from '../authClient';
import { safeLocalStorageGet } from '../utils/safeLocalStorage';

// Central API configuration
// En desarrollo, apuntamos directamente al servidor Python local.
// En producción, `VITE_API_BASE_URL` define dónde vive el backend.
//
// [P2-API-BASE-CONTRACT · 2026-05-30] Contrato de `VITE_API_BASE_URL`:
//   - VACÍO/ausente  → API_BASE='' → llamadas same-origin (`/api/...`).
//     Correcto SOLO si el SPA y FastAPI comparten origen (reverse-proxy,
//     nginx en el VPS Oracle sirviendo ambos).
//   - URL del backend → deploy cross-origin (un host estático sirve el SPA en
//     mealfitrd.com, FastAPI vive en otro host). En este caso DEBE estar
//     seteada al build (build-time inlining de Vite).
//
//   Modo de fallo (P2-API-BASE-CONTRACT): si en un build cross-origin falta
//   la var, API_BASE='' → `/api/...` sería servido como el HTML shell por el
//   fallback SPA (200-HTML → crash silente en `.json()`). La config de nginx
//   enruta `/api/` al backend (no lo captura el fallback SPA) para que ese
//   misconfig falle ALTO (404) en vez de degradar a HTML silencioso.
//   Está documentada en `.env.example`; no la hard-throweamos porque '' es
//   una config legítima para deploys same-origin.
export const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:3001' : (import.meta.env.VITE_API_BASE_URL || '');

// Helper to build API URLs
export const api = (path) => `${API_BASE}${path}`;

// [P0-FETCH-AUTH-TIMEOUT · 2026-05-09] Promise.race protege contra el caso
// donde el lookup de token/sesión cuelga (refresh token expirado + network
// slow). Si tarda >5s, seguimos sin token: el endpoint devolverá 401 y el
// caller decide (empty state, redir a login) — mejor que pegarse en spinner.
const _AUTH_SESSION_TIMEOUT_MS = 10000;  // [P1-NEON-AUTH-MIGRATION 2026-06-13] 5s→10s: margen para el fetch cross-origin a Neon Auth en redes lentas

// [P1-NEON-AUTH-MIGRATION · 2026-06-13] Custom fetch wrapper que adjunta el
// JWT EdDSA de Neon Auth. `getBackendToken()` prefiere el accesor explícito
// `getJWTToken()` y cae a `session.access_token` — ambos son el JWT que el
// backend valida contra el JWKS. Envuelto en el mismo timeout de 5s (P0-FETCH-
// AUTH-TIMEOUT) para no colgar el fetch si el lookup de sesión se atasca.
const _getTokenWithTimeout = async () => {
    try {
        return await Promise.race([
            getBackendToken(),
            new Promise((_, reject) => setTimeout(
                () => reject(new Error('AUTH_SESSION_TIMEOUT')),
                _AUTH_SESSION_TIMEOUT_MS,
            )),
        ]);
    } catch (e) {
        if (e && e.message === 'AUTH_SESSION_TIMEOUT') {
            console.warn(`⚠️ getBackendToken() timeout (${_AUTH_SESSION_TIMEOUT_MS}ms). Proceeding without token; expect 401.`);
        } else {
            console.error('Error getting auth token for fetch:', e);
        }
        return null;
    }
};

// [P1-5 · REQUEST-TIMEOUT · 2026-07-09] Timeout a nivel de REQUEST (distinto del
// timeout del lookup de token de arriba). Sin esto, en una conexión colgada-
// pero-abierta (típico en móvil es-DO), los callers sin blindar (Recipes
// expand/consume, useRegeneratePlan, SupermarketPage) quedaban en spinner
// INFINITO porque `fetch` nunca resuelve ni rechaza. Ahora un AbortController
// con timeout aborta el request y el caller recibe un rechazo con
// `err.code === 'request_timeout'` → apaga el spinner y ofrece reintentar.
//
// Knob `VITE_FETCH_TIMEOUT_MS` (default 60000; 0 desactiva globalmente sin
// redeploy — kill switch si abortara requests legítimos lentos). Default
// generoso (60s) a propósito: el modo de fallo real es "para siempre" (una
// conexión colgada nunca completa), así que 60s vs 30s solo cambia cuánto tarda
// en aparecer el retry; un default corto arriesga abortar un LLM legítimamente
// lento (recipe expand ~30-45s). 60s minimiza falsos positivos.
const _resolveDefaultRequestTimeout = () => {
    const raw = import.meta.env.VITE_FETCH_TIMEOUT_MS;
    if (raw === undefined || raw === null || raw === '') return 60000;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 60000;
};
export const DEFAULT_REQUEST_TIMEOUT_MS = _resolveDefaultRequestTimeout();

// [P1-5] Endpoints EXENTOS del timeout default: corren el pipeline de generación
// completo (minutos) con su propio `PIPELINE_TIMEOUT_MS` + AbortController en
// `Plan.jsx::generateAIPlanStream`. Abortarlos con el default rompería la
// generación de planes. La exención vive AQUÍ (no en Plan.jsx) para contener el
// cambio en un solo archivo. Match por substring sobre el path relativo.
export const REQUEST_TIMEOUT_EXEMPT_PATTERNS = ['/plans/analyze'];

// [P2-6 · 2026-07-09] Options aceptado por fetchWithAuth: el RequestInit estándar
// de fetch + `timeout` opcional (knob per-call de P1-5).
export type ApiRequestOptions = RequestInit & { timeout?: number };

// [P1-5] Resolución PURA del timeout de un request (ms; 0 = sin timeout).
// Precedencia: override explícito del caller > exención por URL > default.
export const resolveRequestTimeout = (url: string, options: { timeout?: number } = {}) => {
    if (options && options.timeout !== undefined) {
        const n = Number(options.timeout);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }
    if (typeof url === 'string' && REQUEST_TIMEOUT_EXEMPT_PATTERNS.some((p) => url.includes(p))) {
        return 0;
    }
    return DEFAULT_REQUEST_TIMEOUT_MS;
};

// [P1-5] Compone el signal del caller con el del timeout. Usa `AbortSignal.any`
// donde exista (Node 22, browsers modernos); fallback manual para navegadores
// viejos del mercado es-DO.
const _composeAbortSignals = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        return AbortSignal.any([a, b]);
    }
    const ctrl = new AbortController();
    const forward = (src) => {
        if (src.aborted) { ctrl.abort(src.reason); return; }
        src.addEventListener('abort', () => ctrl.abort(src.reason), { once: true });
    };
    forward(a);
    forward(b);
    return ctrl.signal;
};

// [P2-401-CENTRAL · 2026-07-12] Señal global de sesión expirada. Un 401 en una ruta
// autenticada (no de auth) emite `mealfit:session-expired`; el listener global
// (AssessmentContext) hace toast + teardown UNA vez, en vez del manejo per-caller
// inconsistente (unos mostraban "Error al actualizar…", otros quedaban mudos). NO
// cambia el valor de retorno — los callers conservan su manejo local (no-breaking).
const _signalIfSessionExpired = (res: Response, url: string): Response => {
    try {
        if (res && res.status === 401 && typeof window !== 'undefined' && !/\/auth(\/|$)/.test(url)) {
            window.dispatchEvent(new CustomEvent('mealfit:session-expired', { detail: { url } }));
        }
    } catch { /* dispatch best-effort; nunca romper el fetch */ }
    return res;
};

// Custom fetch wrapper that includes Neon Auth JWT
export const fetchWithAuth = async (url: string, options: ApiRequestOptions = {}) => {
    const token = await _getTokenWithTimeout();

    const headers = new Headers(options.headers || {});
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    // [P1-FIRST-PARTY-SESSION · 2026-06-16] Token de sesión first-party guardado
    // en localStorage → header X-MF-Session. Hace que las requests autenticadas
    // funcionen al reabrir el PWA de iOS (donde la cookie no persiste pero
    // localStorage sí, y la sesión de Neon ya expiró). El backend lo verifica
    // (HS256) como fallback del Bearer de Neon. Inofensivo en navegador (ahí
    // gana el Bearer/cookie). NO se setea si no hay token.
    const _mfSession = safeLocalStorageGet('mealfit_mf_session', null);
    if (_mfSession) {
        headers.set('X-MF-Session', _mfSession);
    }

    // Envolvemos cualquier ruta relativa (ej. "/api/analyze") con API_BASE
    const finalUrl = url.startsWith('http') ? url : api(url);

    // [P1-5] Timeout a nivel de request (ver bloque arriba). `rest` = options sin
    // `timeout`/`signal` (no son init válidos de fetch salvo signal, re-agregado).
    const callerSignal = options.signal;
    const timeoutMs = resolveRequestTimeout(url, options);
    const rest = { ...options };
    delete rest.timeout;
    delete rest.signal;

    if (!timeoutMs) {
        // Exento / desactivado → comportamiento legacy (respeta el signal del caller).
        // await para poder inspeccionar el status (401); resuelve en headers → no
        // rompe streaming SSE (el body sigue siendo un stream leído aparte).
        return _signalIfSessionExpired(await fetch(finalUrl, { ...rest, headers, signal: callerSignal }), url);
    }

    const timeoutController = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
    }, timeoutMs);
    const signal = _composeAbortSignals(callerSignal, timeoutController.signal);

    try {
        return _signalIfSessionExpired(await fetch(finalUrl, { ...rest, headers, signal }), url);
    } catch (err) {
        // Solo re-etiquetamos como request_timeout si el abort fue NUESTRO timer
        // (no un abort legítimo del caller, que debe propagarse tal cual).
        if (timedOut && !(callerSignal && callerSignal.aborted)) {
            const e = new Error(`Request timeout tras ${timeoutMs}ms: ${finalUrl}`) as Error & { code?: string; url?: string };
            e.code = 'request_timeout';
            e.url = finalUrl;
            throw e;
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

// [P1-DASHBOARD-POLLING-ABORT · 2026-05-23] options se forwardea a fetchWithAuth
// → permite pasar `{ signal }` desde Dashboard.jsx para cancelar la fetch
// in-flight cuando el usuario navega fuera del Dashboard mid-poll (el
// setInterval cleanup ya hacía clearInterval, pero los fetches lanzados
// segundos antes seguían vivos y disparaban setState-on-unmounted).
// Backward-compat: callsites legacy sin options siguen funcionando.
export const getPlanChunkStatus = (planId, options = {}) => fetchWithAuth(`/api/plans/${planId}/chunk-status`, options);
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
// esta función en lugar del UPDATE directo del cliente legacy cuando el
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
// chunk_lesson_telemetry y chunk_deferrals. Reemplaza el DELETE directo
// del cliente legacy del frontend que dejaba locks
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
// mínima. Reemplaza el `el SELECT directo del cliente anterior` del
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
