import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { CheckCircle, Loader2, Server, Activity, PieChart, Utensils, UtensilsCrossed, ChefHat, ShoppingCart, ShieldCheck, AlertTriangle, RefreshCw, X } from 'lucide-react';

import PropTypes from 'prop-types';

import { useAssessment } from '../context/AssessmentContext';
import { fetchWithAuth, getPlanChunkStatus, retryPlanChunk } from '../config/api';
import { findFirstIncompleteField, FIELD_LABELS } from '../config/formValidation';
import { stripInternalFlags } from '../config/secureFormStorage';
import { trackEvent } from '../utils/analytics';
import { safeJSONParseObject } from '../utils/safeJSONParse';
// [P1-PROD-FINAL-3 · 2026-05-24] safeLocalStorage SSOT — el guest session
// id se persiste en setup del flow de plan; raw setItem rompe golden path
// guest en iOS Private Mode.
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';

// [P1-B10] Default conservador para countdown de 429 cuando el backend no
// envía `Retry-After`. El RateLimiter del backend usa period=60s con
// max_calls=3 por usuario/IP, así que 60s es la peor cota antes de que la
// ventana se libere por completo.
const DEFAULT_RATE_LIMIT_RETRY_AFTER_S = 60;

const _parseRetryAfter = (response) => {
    // El header `Retry-After` puede ser un número de segundos o una HTTP-date.
    // Aceptamos solo el formato numérico (más común para rate limits API).
    const raw = response.headers?.get?.('Retry-After');
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return DEFAULT_RATE_LIMIT_RETRY_AFTER_S;
};

// --- FUNCIÓN HELPER: RETRY LOGIC ---
async function fetchWithRetry(url, options, retries = 3, backoff = 2000) {
    try {
        const response = await fetchWithAuth(url, options);
        // [P1-B10] 429 NO se reintenta: el backend nos pidió explícitamente
        // backoff y reintentar inmediatamente solo agrava el rate limit.
        // Propagamos el error con `code='rate_limited'` y el retry_after en
        // segundos para que el caller muestre countdown al usuario.
        if (response.status === 429) {
            const retryAfter = _parseRetryAfter(response);
            let detail = '';
            try {
                const body = await response.json();
                detail = body?.detail || '';
            } catch { /* el body puede no ser JSON */ }
            const err = new Error(detail || 'Demasiadas solicitudes. Intenta de nuevo más tarde.');
            err.code = 'rate_limited';
            err.retryAfter = retryAfter;
            throw err;
        }
        // [P3-409-PIPELINE-RUNNING · 2026-05-16] 409 con body
        // `{detail: {code: 'pipeline_already_running', ...}}` significa que el
        // guardrail del backend (P1-DEEP-SEARCH-PIPELINE) detectó un pipeline
        // activo previo del MISMO user. NO reintentar — el guardrail no se va
        // a resolver en 2s. Propagar el code para que el caller redirija al
        // dashboard y el recovery polling recoja el plan en progreso cuando
        // termine.
        if (response.status === 409) {
            let parsedDetail = null;
            let startedAt = null;
            try {
                const body = await response.json();
                parsedDetail = body?.detail;
                if (parsedDetail && typeof parsedDetail === 'object') {
                    startedAt = parsedDetail.started_at || null;
                }
            } catch { /* body puede no ser JSON */ }
            const msg = (parsedDetail && typeof parsedDetail === 'object' && parsedDetail.message)
                ? parsedDetail.message
                : (typeof parsedDetail === 'string' ? parsedDetail : 'Ya hay un plan generándose.');
            const err = new Error(msg);
            err.code = (parsedDetail && parsedDetail.code) || 'pipeline_already_running';
            err.startedAt = startedAt;
            throw err;
        }
        // [P1-QUOTA-402-UX · 2026-05-30] 402 = paywall del backend
        // (`verify_api_quota`, auth.py:167) cuando el usuario agotó sus
        // créditos mensuales (gratis=15/basic=50/plus=200). Sin esta rama el
        // 402 caía al genérico `!response.ok` (sin `.code`) → el outer catch
        // disparaba el fallback síncrono (MISMO paywall) y terminaba emitiendo
        // `offline_unavailable` → el usuario sin créditos veía "Sin conexión
        // con la IA" (mentira) + loop a /assessment, SIN ver el CTA de mejora.
        // Propagamos `code='quota_exceeded'` para que el caller muestre el
        // upgrade CTA en el momento de intención (conversión). NO reintentar.
        if (response.status === 402) {
            let detail = '';
            try {
                const body = await response.json();
                detail = body?.detail || '';
            } catch { /* el body puede no ser JSON */ }
            const err = new Error(detail || 'Has alcanzado el límite de créditos de tu plan.');
            err.code = 'quota_exceeded';
            throw err;
        }
        // [P1-BUDGET-422-CODE-LOST · 2026-06-22] 422 = validación/gate pre-gen del backend
        // (presupuesto insuficiente para las metas, datos del form inválidos, o restricción
        // crítica desde el endpoint síncrono). El body trae `detail` como DICT
        // {code, error_code, message, ...} o como STRING. SIN esta rama el 422 caía al throw
        // genérico de abajo SIN `.code` → el caller no distinguía "presupuesto insuficiente"
        // de "sin conexión", mostraba "No pudimos conectarnos a la IA" (mentira), y encima lo
        // RE-INTENTABA (retries>1) desperdiciando el cálculo de macros. Propagamos el code real
        // + `terminal=true` para que Plan.jsx muestre el toast accionable (Ajusta tu presupuesto/
        // metas) y NO reintente. Espejo de las ramas 429/409/402 de arriba.
        if (response.status === 422) {
            let _detail = null;
            try { _detail = (await response.json())?.detail; } catch { /* body no-JSON */ }
            let _code, _msg;
            if (_detail && typeof _detail === 'object') {
                _code = _detail.code || _detail.error_code || 'form_invalid';
                _msg = _detail.message || 'Revisa los datos del formulario.';
            } else if (typeof _detail === 'string') {
                _code = 'critical_restriction';
                _msg = _detail;
            } else {
                _code = 'form_invalid';
                _msg = 'Revisa los datos del formulario.';
            }
            const err = new Error(_msg);
            err.code = _code;
            err.terminal = true;
            throw err;
        }
        if (response.status >= 500) throw new Error(`Server Error ${response.status}`);
        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Error ${response.status}: ${txt}`);
        }
        return response;
    } catch (err) {
        // NUNCA reintentar si fue un abort (timeout) — reenviaría todo el pipeline
        if (err.name === 'AbortError') throw err;
        // [P1-B10] No reintentar 429 — backoff lo maneja el caller con countdown.
        if (err.code === 'rate_limited') throw err;
        // [P3-409-PIPELINE-RUNNING] No reintentar 409 — guardrail no se resuelve con backoff.
        if (err.code === 'pipeline_already_running') throw err;
        // [P1-QUOTA-402-UX · 2026-05-30] No reintentar 402 — el cap mensual no
        // se resuelve con backoff; reintentar solo desperdicia round-trips.
        if (err.code === 'quota_exceeded') throw err;
        // [P1-BUDGET-422-CODE-LOST] No reintentar 422 — es validación/gate determinista
        // (no se resuelve con backoff; reintentar re-corre el cálculo de macros en vano).
        if (err.terminal) throw err;

        if (retries > 1) {
            console.warn(`⚠️ Intento fallido. Reintentando en ${backoff / 1000}s... (${retries - 1} intentos restantes)`);
            await new Promise(r => setTimeout(r, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
        } else {
            throw err;
        }
    }
}

// [P0-3] Timeout sincronizado con el servidor.
// El backend tiene `MEALFIT_GLOBAL_PIPELINE_TIMEOUT_S` (default 720s).
// Cliente debe esperar `server_timeout + 90s` por defecto (90s = pantry
// post-validation + persistencia + RTT SSE buffer).
//
// [P2-PIPELINE-TIMEOUT-FRONTEND-RAISE · 2026-05-16] Subido default
// 690000→990000ms (11.5min→16.5min). Razón: bug observado 2026-05-16
// donde el pipeline backend tarda ~640-690s post P2-PIPELINE-TIMEOUT-RAISE
// (.env=900s permite retry post-review-fail). El default frontend 690000ms
// era demasiado conservador — abortaba justo cuando el pipeline estaba
// terminando, frontend mostraba "Error Fatal: Timeout total excedido" →
// caía a fallback síncrono (también fail) → "No pudimos conectarnos con
// la IA" + redirect a /assessment ANTES de que el plan se aprobara.
// Usuario veía error cuando en realidad el plan se generó OK (rescatable
// vía /pending-status recovery, pero la UX es confusa).
// Nuevo default 990000ms = 900s backend + 90s buffer.
// Override en producción con VITE_PIPELINE_TIMEOUT_MS si el backend
// se configura con timeout distinto.
const PIPELINE_TIMEOUT_MS = (() => {
    const raw = import.meta.env.VITE_PIPELINE_TIMEOUT_MS;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 990000;
})();

// --- GENERACIÓN DE PLAN CON STREAMING SSE ---
let globalGenerationPromise = null;
let globalAbortController = null;
// [P1-16] Session_id de la generación en vuelo. `cancelGeneration` lo lee
// para enviar el POST a `/api/plans/cancel?session_id=X` y propagar el
// cancel al backend. Sin esto, el SSE se aborta del lado cliente pero el
// pipeline LLM seguía corriendo hasta terminar el día actual y persistía
// el plan en DB; el usuario veía el plan aparecer 30s después vía
// Realtime UPDATE (cuota de LLM consumida + UX confuso).
let globalCancelSessionId = null;

export const cancelGeneration = () => {
    // [P1-16] Best-effort POST al backend ANTES de abortar el SSE local.
    // Si la red está lenta o el endpoint no responde, NO bloqueamos el
    // abort del SSE — el cancel cooperativo del backend es bonus, no
    // requerido. Usamos `fetch` directo (no `fetchWithAuth`) porque el
    // endpoint es público (key por session_id, no requiere auth) y
    // queremos cancelar antes de que el backend procese cualquier auth.
    const sessionToCancel = globalCancelSessionId;
    if (sessionToCancel) {
        try {
            fetch('/api/plans/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionToCancel }),
                // No esperamos la respuesta; fire-and-forget.
                keepalive: true,
            }).catch(() => { /* fire-and-forget; el abort SSE local cubre el peor caso */ });
        } catch {
            /* defensivo: nunca bloquear el cancel local por fallos del POST */
        }
    }
    if (globalAbortController) {
        globalAbortController.abort("UserCancelled");
        globalAbortController = null;
    }
    globalCancelSessionId = null;
    // [P3-CANCEL-CLEAR-FLAG · 2026-05-16] Limpiar el flag del recovery para
    // que `<PendingPipelineRecovery />` NO intente recuperar un plan que el
    // user canceló intencionalmente. Sin este clear, al recargar la página
    // el recovery polearia el KV y mostraría toast "Tu plan está listo" si
    // el backend alcanzó a completar antes del cancel cooperativo.
    try { localStorage.removeItem('mealfit_plan_in_progress'); } catch { /* noop */ }
};

// Exportada para tests de regresión (P0-1): verificar que cuando SSE y el
// endpoint síncrono fallan, la función rechaza con `code='offline_unavailable'`
// en lugar de retornar un plan hardcoded con alérgenos comunes.
export const generateAIPlanStream = async (formData, onProgress) => {
    if (globalGenerationPromise) {
        console.warn("⚠️ Reutilizando promesa de generación en curso (React StrictMode)...");
        return globalGenerationPromise;
    }

    const STREAM_URL = '/api/plans/analyze/stream';
    const FALLBACK_URL = '/api/plans/analyze';

    globalGenerationPromise = (async () => {
        globalAbortController = new AbortController();
        // [P6-CANCEL-CTRL-CAPTURE] Captura local del controller. `cancelGeneration`
        // setea `globalAbortController = null` INMEDIATAMENTE tras `.abort()` —
        // si el catch chequea `globalAbortController.signal.reason` después del
        // cancel, el ref ya es null → check falla → cae al fallback síncrono
        // → user ve "No pudimos conectarnos con la IA" cuando en realidad
        // CANCELÓ. Mantener referencia local sobrevive al null del global.
        const localAbortController = globalAbortController;
        const timeoutId = setTimeout(() => {
            if (globalAbortController) globalAbortController.abort();
        }, PIPELINE_TIMEOUT_MS);

        try {
            // Intentar endpoint SSE streaming
            const response = await fetchWithRetry(STREAM_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
                signal: globalAbortController.signal
            }, 1); // Solo 1 intento para SSE, fallback si falla

            clearTimeout(timeoutId);

            // [P2-BUDGET-FLOOR · 2026-06-21] El backend rechaza con 4xx ANTES del stream cuando la
            // validación del form falla (presupuesto insuficiente para las metas, biométricos fuera
            // de rango, campos faltantes). Eso NO es event-stream ni un plan. Detectarlo y propagar
            // el mensaje accionable como error TERMINAL (sin caer al fallback síncrono, que daría el
            // mismo 4xx). clone() evita consumir el body si no aplica.
            if (!response.ok && response.status >= 400 && response.status < 500) {
                let _detail = null;
                try { _detail = (await response.clone().json())?.detail; } catch { /* body no-JSON */ }
                if (_detail && typeof _detail === 'object' && (_detail.message || _detail.code)) {
                    const eForm = new Error(_detail.message || 'Revisa los datos del formulario.');
                    eForm.code = _detail.code || 'form_invalid';
                    eForm.terminal = true;
                    throw eForm;
                }
            }

            // Si el servidor no soporta streaming, caer al endpoint síncrono
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/event-stream')) {
                console.warn('⚠️ Servidor no soportó SSE, parseando como JSON...');
                const data = await response.json();
                return (Array.isArray(data) && data.length > 0) ? data[0] : data;
            }

            // Consumir el stream SSE
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalResult = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parsear líneas SSE completas
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Mantener línea incompleta en buffer

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;

                    try {
                        const eventData = JSON.parse(line.slice(6));
                        const eventType = eventData.event;

                        if (eventType === 'heartbeat') continue;

                        if (eventType === 'complete') {
                            finalResult = eventData.data;
                            if (onProgress) onProgress({ event: 'complete' });
                            continue;
                        }

                        if (eventType === 'error') {
                            console.error('❌ [SSE] Error del servidor:', eventData.data?.message);
                            const err = new Error(eventData.data?.message || 'Error del servidor');
                            // Propagar el código del backend para que el caller pueda
                            // distinguir errores transitorios de IA (mostrar Retry) vs
                            // errores genéricos (navegar a dashboard).
                            if (eventData.data?.code) err.code = eventData.data.code;
                            throw err;
                        }

                        // Emitir evento de progreso al componente
                        if (onProgress) {
                            onProgress(eventData);
                        }
                    } catch (parseErr) {
                        // [SSE-ERROR-PROPAGATION] Solo silenciar errores de parsing
                        // JSON (líneas SSE malformadas). Cualquier otro error — incluyendo
                        // los `throw err` con code='llm_unavailable'/'cancelled' del
                        // bloque eventType==='error' arriba — DEBE propagar al catch
                        // externo. Antes el filtro `message?.includes('Error del
                        // servidor')` solo capturaba el default genérico; el mensaje
                        // del backend "La IA está temporalmente saturada..." NO lo
                        // incluía → quedaba silenciado → reader continuaba hasta
                        // EOF → lanzaba "Stream cerrado sin resultado completo" →
                        // fallback síncrono → 503 → cascada de errores.
                        if (parseErr instanceof SyntaxError) {
                            // JSON.parse falló: línea SSE malformada, ignorar.
                            continue;
                        }
                        throw parseErr;
                    }
                }
            }

            if (finalResult) return finalResult;

            // Si no recibió complete event, error
            throw new Error('Stream cerrado sin resultado completo');

        } catch (error) {
            clearTimeout(timeoutId);

            // [P6-CANCEL-SIGNAL-CHECK] FIRST PRIORITY: si el signal está
            // abortado por el usuario, NO importa qué error se haya levantado
            // (AbortError, "Stream cerrado sin resultado completo", etc.).
            // Bug observable corrida 01:00: SSE se cerró por cancel → reader
            // throwed `Error("Stream cerrado sin resultado completo")` (NO
            // AbortError) → catch caía al `else` → disparó fallback al
            // endpoint síncrono → backend inició OTRO pipeline completo (Día
            // 2 generó 85s) que después también fue cancelado. Resultado:
            // 1.5 min de cuota LLM gastada por una generación que el user
            // canceló. Fix: chequear signal.aborted ANTES de cualquier otra
            // rama; si está abortado por user, salir sin fallback.
            if (
                localAbortController &&
                localAbortController.signal.aborted &&
                localAbortController.signal.reason === 'UserCancelled'
            ) {
                console.warn("🚫 Generación cancelada por el usuario (signal abortado).");
                throw new Error("UserCancelled");
            }

            if (error.name === 'AbortError' || error === 'UserCancelled') {
                // [P6-CANCEL-CTRL-CAPTURE] Usar `localAbortController` (capturado
                // al inicio) en vez de `globalAbortController` (que `cancelGeneration`
                // ya seteó a null). El signal del local sigue teniendo `reason`.
                if (localAbortController && localAbortController.signal.reason === 'UserCancelled') {
                    console.warn("🚫 Generación cancelada por el usuario.");
                    throw new Error("UserCancelled"); // Salir inmediatamente sin fallback
                }
                console.error("⏳ Error Fatal: Timeout total excedido.");
            } else if (
                // [P6-CANCEL-SSE-FIX] El backend puede emitir SSE event=error
                // con `message="Generación cancelada por el usuario"` ANTES
                // de que llegue el AbortError local (race condition: el cancel
                // POST llega al backend, el backend cierra la stream con
                // mensaje, frontend recibe el mensaje antes que el abort
                // local dispare). Sin esta rama, el catch caía al fallback
                // síncrono que también fallaba → user veía "No pudimos
                // conectarnos con la IA" cuando en realidad CANCELÓ. Ahora
                // detectamos el mensaje O el code del backend y propagamos
                // limpio como UserCancelled.
                error.code === 'cancelled' ||
                /cancelad[oa] por el usuario/i.test(error.message || '')
            ) {
                console.warn("🚫 Generación cancelada por el usuario (vía SSE).");
                throw new Error("UserCancelled");
            } else if (error.terminal || error.code === 'budget_insufficient' || error.code === 'budget_below_goal_floor' || error.code === 'form_invalid') {
                // [P2-BUDGET-FLOOR · 2026-06-21] Validación de form terminal (presupuesto/datos)
                // detectada pre-stream. El endpoint síncrono daría el MISMO 4xx → propagar el
                // mensaje accionable sin caer al fallback.
                console.warn(`🛑 Validación de form terminal (${error.code}) — propagando sin fallback.`);
                throw error;
            } else if (error.code === 'pipeline_already_running') {
                // [P3-409-PIPELINE-RUNNING · 2026-05-16] El guardrail del backend
                // detectó otro pipeline activo del mismo user. El fallback
                // síncrono recibiría el MISMO 409 (mismo guardrail) → saltarlo
                // y propagar para que el caller redirija al dashboard. El
                // <PendingPipelineRecovery /> polea el KV y recogerá el plan
                // cuando termine.
                console.warn("🟡 Pipeline ya activo — propagando para recovery via dashboard.");
                throw error;
            } else if (error.code === 'critical_restriction') {
                // [P2-CRITICAL-REJECTION-CODE · 2026-06-18] Rechazo crítico (alergia/condición
                // declarada que la IA no logró satisfacer). Reintentar NO ayuda (restricción fija) →
                // NO intentar el endpoint síncrono; propagar para que el caller muestre la guía correcta.
                console.warn("🛑 Rechazo crítico de restricción declarada — propagando (no reintentar).");
                throw error;
            } else if (error.code === 'llm_unavailable') {
                // El backend YA decidió que la IA no está disponible (504 de Gemini,
                // circuit breaker abierto, etc.). El endpoint síncrono devolverá el
                // mismo 503 — saltarlo y propagar al caller para mostrar Retry.
                console.warn("🚨 IA upstream no disponible — propagando para retry manual.");
                throw error;
            } else if (error.code === 'rate_limited') {
                // [P1-B10] El backend nos pidió backoff. NO intentamos el endpoint
                // síncrono — el mismo limiter cubre ambas rutas (`/analyze` y
                // `/analyze/stream` comparten `_PLAN_GEN_LIMITER`), así que
                // seguro recibiríamos otro 429. Propagamos al caller para que
                // muestre countdown.
                console.warn(`⏳ Rate limited — propagando para countdown UX (retry_after=${error.retryAfter}s).`);
                throw error;
            } else if (error.code === 'quota_exceeded') {
                // [P1-QUOTA-402-UX · 2026-05-30] Cap mensual de créditos
                // alcanzado. El fallback síncrono (`/analyze`) recibiría el
                // MISMO 402 (mismo `verify_api_quota`) → saltarlo y propagar
                // para que el caller muestre el CTA de mejora de plan.
                console.warn("💳 Límite de créditos alcanzado — propagando para upgrade CTA.");
                throw error;
            } else {
                console.warn(`⚠️ SSE falló (${error.message}), intentando endpoint síncrono...`);

                // Fallback al endpoint síncrono
                try {
                    const controller2 = new AbortController();
                    const timeoutId2 = setTimeout(() => controller2.abort(), PIPELINE_TIMEOUT_MS);

                    const response2 = await fetchWithRetry(FALLBACK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData),
                        signal: controller2.signal
                    }, 2);

                    clearTimeout(timeoutId2);
                    // 503 explícito del backend (LLM no disponible) → propagar para Retry.
                    if (response2.status === 503) {
                        const body = await response2.json().catch(() => ({}));
                        const e503 = new Error(body?.detail || 'La IA no está disponible.');
                        e503.code = 'llm_unavailable';
                        throw e503;
                    }
                    // [P2-CRITICAL-REJECTION-CODE · 2026-06-18] 422 con detail STRING = rechazo crítico de
                    // restricción declarada (alergia/condición). Los errores de VALIDACIÓN del endpoint
                    // (missing_required_fields / invalid_total_days / invalid_biometric_range) también devuelven
                    // 422 pero con detail tipo DICT → NO los tratamos como critical_restriction (caerían al
                    // handler genérico con su mensaje propio). Gate por typeof string para no mislabelar.
                    if (response2.status === 422) {
                        const body = await response2.json().catch(() => ({}));
                        if (typeof body?.detail === 'string') {
                            const e422 = new Error(body.detail || 'Revisa tus restricciones declaradas.');
                            e422.code = 'critical_restriction';
                            throw e422;
                        }
                        // 422 de validación (detail dict): propagar como error genérico (no critical).
                        const eVal = new Error(
                            (body?.detail && body.detail.message) || 'Revisa los datos del formulario.');
                        throw eVal;
                    }
                    const data = await response2.json();
                    return (Array.isArray(data) && data.length > 0) ? data[0] : data;
                } catch (fallbackErr) {
                    console.error('❌ Fallback síncrono también falló:', fallbackErr);
                    // Si fue 503 de LLM, propagar el code para el caller
                    if (fallbackErr.code === 'llm_unavailable') throw fallbackErr;
                    // [P2-CRITICAL-REJECTION-CODE] 422 rechazo crítico también propaga (no reintentar).
                    if (fallbackErr.code === 'critical_restriction') throw fallbackErr;
                    // [P1-B10] 429 desde el fallback síncrono también propaga.
                    if (fallbackErr.code === 'rate_limited') throw fallbackErr;
                    // [P1-BUDGET-422-CODE-LOST · 2026-06-22] Errores terminales (422: presupuesto
                    // insuficiente / form inválido) DEBEN propagar con su code accionable — NO caer
                    // al `offline_unavailable` genérico ("No pudimos conectarnos a la IA"), que es
                    // engañoso (el problema es el presupuesto, no la conexión).
                    if (fallbackErr.terminal || fallbackErr.code === 'budget_insufficient'
                        || fallbackErr.code === 'budget_below_goal_floor' || fallbackErr.code === 'form_invalid') {
                        throw fallbackErr;
                    }
                }
            }

            // [P0-1] Antes este path retornaba un plan hardcoded con maní,
            // pescado, lácteos, gluten y arroz/habichuelas. Si el usuario era
            // alérgico/vegano/celíaco/diabético, el plan de respaldo offline
            // no consultaba `formData.allergies`/`dietType`/`medicalConditions`
            // y entregaba comida contraindicada — luego `setTempPlan` lo
            // mostraba en preview y `saveGeneratedPlan` lo persistía si el
            // usuario clicaba "Aceptar". Riesgo de safety médica directa que
            // invalidaba toda la cadena de validación P0-FORM-1/P1-1 upstream.
            //
            // Ahora propagamos un error con `code='offline_unavailable'`
            // (mismo patrón que `llm_unavailable`/`rate_limited`); el caller
            // muestra toast con botón "Reintentar" sin navegar al dashboard.
            console.warn("⚠️ SSE y endpoint síncrono fallaron — propagando offline_unavailable.");
            const offlineErr = new Error("No pudimos conectarnos con la IA. Por favor, verifica tu conexión y reintenta.");
            offlineErr.code = 'offline_unavailable';
            throw offlineErr;
        } finally {
            globalGenerationPromise = null;
            globalAbortController = null;
            // [P1-16] Limpiar session_id de cancelación al completar
            // (success/error). Sin esto, un cancelGeneration posterior
            // intentaría cancelar una session ya completada.
            globalCancelSessionId = null;
        }
    })();

    return globalGenerationPromise;
};

// [P3-DOC-1 · 2026-05-11] `savePlanToHistory` eliminado.
// ────────────────────────────────────────────────────────────────────────────
// La función vivía aquí desde antes del audit 2026-05-11 con un INSERT directo
// a `el cliente de DB anterior` — única excepción restante a la
// invariante I6 ("toda mutación de meal_plans pasa por backend"). Audit
// cross-codebase (`grep -r savePlanToHistory frontend/src`) confirmó CERO
// callsites. La persistencia del plan post-SSE ya la hace el backend en
// `services._save_plan_and_track_background` (comentario explícito en
// `AssessmentContext.jsx:1467`). Mantener la función como dead code era una
// trampa: cualquier desarrollador futuro podía reactivarla sin saber que
// reabriría I6 + lost-update vs `_chunk_worker`.
//
// La señal `mealfit_history_dirty_at` (que History.jsx lee en su listener
// `visibilitychange` para bypassear su threshold de 60s post-mutación) se
// movió a `AssessmentContext.jsx:saveGeneratedPlan` — el callsite real
// post-SSE-success que sustituye al INSERT eliminado. P0-HIST-NEW-2 sigue
// vivo: el contrato cross-tab se preserva, sólo cambió quién lo emite.
//
// Si en el futuro se necesita un fallback frontend-side (e.g., backend
// persist falló silente y queremos persistir desde el cliente), crear
// endpoint backend `POST /api/plans/persist-from-stream` con auth + dedupe
// + INSERT atómico + `acquire_meal_plan_advisory_lock(purpose='general')`
// (mismas garantías que `swap-meal/persist`/`restore-local`). NO restaurar
// el patrón directo `el cliente de DB anterior`.
//
// Tooltip-anchor: P3-DOC-1-DEAD-CODE-REMOVED

// Duración total del plan según frecuencia de compras del hogar.
// El backend genera solo 3 días iniciales (PLAN_CHUNK_SIZE) y encola los demás
// con delay just-in-time para que la IA aprenda de cada bloque anterior.
function getTotalDaysByGroceryDuration(groceryDuration) {
    if (groceryDuration === 'monthly')   return 30;
    if (groceryDuration === 'biweekly')  return 15;
    return 7; // weekly (default)
}

const Plan = () => {
    // 1. HOOKS
    const { formData, saveGeneratedPlan, restorePlan, setCurrentStep, loadingSensitive,
        // [P1-GUEST-MODE · 2026-06-15] Créditos del invitado: consumir 1 al
        // generar; bloquear nueva generación si ya no quedan.
        isGuest, consumeGuestCredit, remainingCredits } = useAssessment();
    const [status, setStatus] = useState('analyzing'); // analyzing, generating, preview, ready
    const [tempPlan, setTempPlan] = useState(null); // Nuevo estado para GAP 14
    const [oldPlan, setOldPlan] = useState(null); // Estado para el plan viejo
    const [streamPhase, setStreamPhase] = useState(null); // Fase actual del pipeline SSE
    const [daysCompleted, setDaysCompleted] = useState([]); // Días ya generados [1, 2, 3]
    // [P0-13] Dedupea el toast "Falta completar X" para que NO se emita más
    // de una vez por mount, incluso bajo StrictMode o re-renders provocados
    // por cambios de `loadingSensitive`/`formData`. Antes el side-effect vivía
    // en render con `setTimeout(0) + <Navigate>`, lo cual programaba toasts
    // múltiples y rebote `/plan↔/assessment` cuando `loadingSensitive`
    // flickeaba durante la hidratación post-login.
    const incompleteToastShownRef = useRef(false);
    const navigate = useNavigate();
    const location = useLocation();
    const previousMeals = location.state?.previous_meals || location.state?.previousMeals || [];
    const currentIngredients = location.state?.current_pantry_ingredients || location.state?.currentIngredients || [];
    const updateReason = location.state?.update_reason || null;

    // 2. USEEFFECT
    useEffect(() => {
        // [P1-3] Si el descifrado del sensitive cifrado todavía está en
        // vuelo (50-200ms post-login), NO disparamos `processPlan` — campos
        // sensibles vacíos (allergies=[], motivation="") sesgarían
        // `findFirstIncompleteField` hacia un falso positivo y el render
        // condicional de abajo nos rebotaría a /assessment con un toast
        // engañoso. Esperamos a que `loadingSensitive` baje a false; la
        // dependencia explícita en el deps array re-dispara el effect en ese
        // momento.
        if (loadingSensitive) return;

        // [P3-RECOVERY-BYPASS-FORM-CHECK · 2026-05-16] Si hay un pipeline
        // pendiente del backend (flag `mealfit_plan_in_progress` en localStorage),
        // BYPASS la validación de form incompleto. Razón:
        //   - El user generó plan → cerró tab → reabre → flag sigue ahí.
        //   - PendingPipelineRecovery navega a /plan correctamente.
        //   - Pero formData hidrata async desde localStorage; durante el
        //     primer render puede estar vacío → findFirstIncompleteField
        //     retorna truthy → otro useEffect navega a /assessment → user
        //     queda fuera de la pantalla de carga aunque el plan se está
        //     generando.
        //   - La validación de form existe para evitar disparar SSE con
        //     datos vacíos. En recovery mode NO disparamos SSE (el backend
        //     ya está generando) → la validación NO aplica.
        // Sync read porque tanto este useEffect como el useEffect del navigate
        // necesitan la misma decisión sin race.
        const _hasInProgressFlag = (() => {
            try { return !!localStorage.getItem('mealfit_plan_in_progress'); }
            catch { return false; }
        })();

        // [P1-B6] Validación pre-fetch alineada con el backend. Antes este
        // check solo verificaba `age && mainGoal` (2 de 6 requeridos), así que
        // un usuario con `gender=""` o `weight=""` quemaba el check de cuota
        // y recibía un 422 genérico tras 1.5s de "Analizando...". Ahora
        // detectamos cualquier campo faltante antes y dejamos que el render
        // condicional de abajo redirija a /assessment.
        if (!_hasInProgressFlag && findFirstIncompleteField(formData)) return;

        let ignore = false;

        window.scrollTo(0, 0);

        // Pre-cargar el plan antiguo para el Preview.
        // [P2-A · 2026-05-08] SSOT migration de try/catch ad-hoc.
        // Si parse falla, `oldPlan` queda en su estado previo (no degradamos).
        // [P4-LOCALSTORAGE-LAZY-INIT] getItem crudo en cuerpo de effect (antes del
        // try de processPlan) → SecurityError colgaría la pantalla de generación.
        const oldPlanStr = safeLocalStorageGet('mealfit_plan', null);
        if (oldPlanStr) {
            const parsed = safeJSONParseObject(oldPlanStr);
            // Solo setear si efectivamente parseó algo no-trivial; el fallback
            // `{}` representa "corrupto" para este caller.
            if (Object.keys(parsed).length > 0) setOldPlan(parsed);
        }

        const processPlan = async () => {
            try {
                if (ignore) return;

                // [P3-PLAN-RECOVERY-LOADING · 2026-05-16] Pre-flight check:
                // ¿hay ya un pipeline `status='generating'` en backend para este
                // user? Si sí, NO disparar SSE — entrar en MODO RECOVERY.
                //
                // Escenario: user generó plan, cerró laptop / cerró tab, vuelve
                // a abrir la web. El P1-DEEP-SEARCH-PIPELINE mantiene el
                // pipeline corriendo en backend. PendingPipelineRecovery (App.jsx)
                // detecta el flag local y redirige a /plan. Pero antes de este
                // fix, Plan.jsx disparaba un NUEVO SSE → 409 pipeline_already_running
                // → catch redirigía a /dashboard → loop. Ahora detectamos pending
                // ANTES del SSE y solo mostramos loading.
                //
                // Cuando el pipeline termine, PendingPipelineRecovery hace el
                // toast + redirige a /dashboard. Plan.jsx solo necesita mostrar
                // la pantalla de loading mientras tanto.
                try {
                    const pendingRes = await fetchWithAuth('/api/plans/pending-status');
                    if (pendingRes.ok) {
                        const pendingData = await pendingRes.json();
                        if (pendingData?.status === 'generating') {
                            // Asegurar flag local seteado (por si llegó vía
                            // navigate desde recovery sin pasar por el set
                            // pre-SSE más abajo).
                            try {
                                const _existingFlag = localStorage.getItem('mealfit_plan_in_progress');
                                if (!_existingFlag) {
                                    localStorage.setItem('mealfit_plan_in_progress', JSON.stringify({
                                        user_id: localStorage.getItem('mealfit_user_id') || null,
                                        started_at: pendingData.started_at || new Date().toISOString(),
                                    }));
                                }
                            } catch { /* localStorage best-effort */ }
                            // Mostrar pantalla de loading; PendingPipelineRecovery
                            // hará el polling y redirigirá cuando complete.
                            setStatus('generating');
                            // Hint visual: estamos en fase post-skeleton para
                            // que LoadingScreen no muestre "analizando" 1.5s.
                            setStreamPhase('recovery_mode');
                            return;
                        }
                    }
                } catch {
                    // Endpoint no disponible / red — caer al flujo SSE normal.
                }

                // [P1-GUEST-MODE · 2026-06-15] Invitado sin créditos → no iniciar
                // otra generación; invitarlo a crear cuenta. La 1ª generación SÍ
                // pasa (arranca con GUEST_PLAN_CREDITS disponibles).
                if (isGuest && typeof remainingCredits === 'number' && remainingCredits <= 0) {
                    import('sonner').then(({ toast }) => {
                        toast.info('Crea tu cuenta para generar más planes', {
                            description: 'Ya usaste tu plan de prueba gratis. Regístrate para obtener los créditos del plan gratuito (15/mes).',
                            duration: 9000,
                        });
                    });
                    navigate('/dashboard', { replace: true });
                    return;
                }

                // FASE 1: UI de "Analizando"
                setStatus('analyzing');
                await new Promise(r => setTimeout(r, 1500));

                if (ignore) return;

                // FASE 2: Llamada a la IA con Streaming SSE
                setStatus('generating');

                // [P1-PROD-FINAL-3 · 2026-05-24] safeLocalStorage SSOT — raw
                // setItem del guest session id rompía golden path guest en iOS
                // Private Mode (uncaught SecurityError → handler abortaba,
                // SSE nunca empezaba). Lectura también vía wrapper para
                // simetría y SSR-safety.
                let userId = safeLocalStorageGet('mealfit_user_id', null);
                if (userId === 'guest') userId = null;

                let guestSessionId = safeLocalStorageGet('mealfit_guest_session_id', null);
                if (!userId && !guestSessionId) {
                    guestSessionId = crypto.randomUUID();
                    safeLocalStorageSet('mealfit_guest_session_id', guestSessionId);
                }

                const totalDays = getTotalDaysByGroceryDuration(formData?.groceryDuration);
                // [P1-8] Filtrar las keys internas del wizard (`_weightUnitTouched`,
                // `_householdSizeTouched`, cualquier futura `_*`) ANTES del spread.
                // Sin este filtro, el endpoint `/api/plans/analyze/stream` recibía
                // los flags de UI; el backend los strippea con `_strip_untrusted_internal_keys`,
                // pero el JSON dump del prompt al LLM podía incluirlas como ruido
                // informacional. Centralizado en `stripInternalFlags` para que el
                // invariante sea testeable y consistente con
                // `buildHealthProfilePayload` (persistencia DB).
                const _safeForm = stripInternalFlags(formData);
                // [P1-16] Registrar el session_id activo para que
                // `cancelGeneration` pueda hacer POST al backend si el
                // usuario clickea "Cancelar". Reset a null en el `finally`
                // del wrapper de generateAIPlanStream o cuando termine
                // exitosamente.
                const _activeSessionId = userId || guestSessionId;
                globalCancelSessionId = _activeSessionId;
                const dataToSend = {
                    ..._safeForm,
                    user_id: userId,
                    session_id: _activeSessionId,
                    previous_meals: previousMeals,
                    current_pantry_ingredients: currentIngredients,
                    update_reason: updateReason,
                    totalDays,
                    tzOffset: new Date().getTimezoneOffset(),
                    is_plan_expired: location.state?.is_plan_expired || location.state?.isPlanExpired || false,
                    // [P1-11] Defensa contra drift frontend↔backend: el frontend
                    // gatea `dietType` como required (`REQUIRED_FORM_FIELDS` en
                    // `formValidation.js`), pero el backend lo deja OUT de
                    // `_REQUIRED_FORM_FIELDS` deliberadamente para preservar
                    // rehidratación de perfiles legacy con variantes ES
                    // ("Omnívora"/"vegetariana"). Si el frontend gating se
                    // evade (cliente no oficial, hidratación rota, plan saved
                    // donde el legacy `dietTypes:[]` viene del schema en lugar
                    // de `dietType: ''`), el backend defaultea internamente a
                    // catálogo completo "balanced" — un usuario vegano podría
                    // recibir un plan balanced silenciosamente. Aquí
                    // explicitamos el default a "balanced" para que el contrato
                    // sea auditable end-to-end y NO se propague `''` al backend
                    // ni al LLM.
                    dietType: _safeForm.dietType || 'balanced',
                };

                // Callback de progreso SSE
                const handleProgress = (eventData) => {
                    if (ignore) return;
                    const evType = eventData.event;
                    const evData = eventData.data;

                    if (evType === 'phase') {
                        setStreamPhase(evData?.phase || null);
                    } else if (evType === 'day_complete') {
                        setDaysCompleted(prev => [...new Set([...prev, evData?.day])]);
                    } else if (evType === 'day_started') {
                        setStreamPhase(`day_${evData?.day}`);
                    }
                };

                // [P1-DEEP-SEARCH-PIPELINE · 2026-05-15] Persistir flag de "plan
                // en progreso" en localStorage ANTES de empezar el stream. Si el
                // usuario cierra la pestaña, el boot hook (App.jsx) detectará el
                // flag al volver, consultará /api/plans/pending-status, y
                // redirigirá al dashboard si el plan ya está listo.
                try {
                    localStorage.setItem('mealfit_plan_in_progress', JSON.stringify({
                        user_id: userId || null,
                        started_at: new Date().toISOString(),
                    }));
                } catch (_lsErr) { /* localStorage full / disabled — best-effort */ }

                const generatedPlan = await generateAIPlanStream(dataToSend, handleProgress);

                if (ignore) return;

                // Lógica de fechas para compras (Grocery Cycle)
                // [P2-A · 2026-05-08] safeJSONParseObject defiende contra
                // storage corrupto: antes el throw aquí abortaba la generación
                // del plan recién creado. Sin storageKey: NO sobrescribimos el
                // plan local cacheado a `{}` (destruiría datos legítimos del
                // usuario); el fallback `{}` solo afecta esta lectura local
                // de `oldPlan` para preservar fechas de ciclo previas.
                const oldPlanStr = localStorage.getItem('mealfit_plan');
                const oldPlan = safeJSONParseObject(oldPlanStr);

                // [GROCERY-START-DATE-FIX 2026-05-06] grocery_start_date SIEMPRE es ahora.
                // Antes, en flujos con `previousMeals` (renewal/regeneración con historial)
                // heredábamos `oldPlan.grocery_start_date` para "preservar el ciclo". Bug
                // observado: si el oldPlan era de ayer (e.g. plan creado mar 5-may 16:00)
                // y el usuario regeneraba hoy (mié), el nuevo plan llevaba la fecha de
                // ayer → Dashboard calculaba `daysSinceCreation=1` → disparaba shift-plan
                // → recortaba el día 1 del plan recién generado, dejándolo con 2 días en
                // vez de 3. Resultado: el viernes "desaparecía" sin que el usuario hiciera
                // nada. `grocery_start_date` debe reflejar **cuándo se generó este plan**.
                // `cycle_start_date` sí preservamos del oldPlan en renewal porque marca
                // el inicio del ciclo de 30 días (no se resetea por regeneración intra-ciclo).
                const now = new Date().toISOString();
                generatedPlan.grocery_start_date = now;
                if (previousMeals && previousMeals.length > 0) {
                    generatedPlan.cycle_start_date = oldPlan.cycle_start_date || now;
                } else {
                    generatedPlan.cycle_start_date = now;
                }

                // --- Analítica enviada en éxito del endpoint ---
                trackEvent('plan_regeneration_triggered', {
                    reason: updateReason || 'manual_refresh',
                    source: location.state?.entry_point || 'dashboard',
                    is_expired: location.state?.is_plan_expired || false,
                    has_pantry: currentIngredients && currentIngredients.length > 0,
                    type: 'full_plan'
                });

                // [P3-PLAN-SKIP-PREVIEW-ALWAYS · 2026-05-16] Skip pantalla
                // intermedia PreviewScreen INCONDICIONALMENTE. Las observaciones
                // (critical_rejection, review_failed_but_delivered, pantry_degraded,
                // initial_chunk_pantry_degraded) se surfacean en el dashboard via
                // toast persistente — el usuario NO necesita una pantalla
                // intermedia con "Aceptar y Aplicar Nuevo Plan" (el plan ya está
                // aplicado por saveGeneratedPlan; la pantalla intermedia era
                // fricción adicional).
                //
                // Pre-fix: setStatus('preview') cuando _hasObservations → user
                // veía una pantalla con banners ámbar/rojo + botones "Regenerar".
                // Post-fix: navigate inmediato al dashboard + toast informativo
                // con los mismos disclaimers + botón de acción si aplica.
                //
                // Razonamiento UX: el plan SE GENERÓ exitosamente, las
                // observaciones son AVISOS post-hoc, no bloqueos. El user
                // tomará decisión informada desde el dashboard donde ya puede
                // ver el plan completo.
                const _hasObservations = !!(
                    generatedPlan?._critical_rejection
                    || generatedPlan?._review_failed_but_delivered
                    || generatedPlan?._pantry_degraded_summary?.degraded
                    || generatedPlan?._initial_chunk_pantry_degraded
                );

                // Guardar + redirigir SIEMPRE. Sin branching por _hasObservations.
                saveGeneratedPlan(generatedPlan);
                // [P1-GUEST-MODE · 2026-06-15] Consumir 1 crédito de invitado por
                // generación exitosa (el meter del dashboard pasa 1→0 y bloquea
                // regeneraciones hasta crear cuenta).
                if (isGuest) consumeGuestCredit();
                setCurrentStep(0);
                navigate('/dashboard', { replace: true });

                // Surfacear observaciones via toast persistente en el dashboard.
                if (_hasObservations) {
                    import('sonner').then(({ toast }) => {
                        if (generatedPlan?._critical_rejection) {
                            toast.error("Plan ajustado por seguridad médica", {
                                description: generatedPlan?._review_disclaimer
                                    || "El plan se ajustó para cumplir tus condiciones médicas. Considera regenerarlo o revisarlo con tu nutricionista.",
                                duration: 12000,
                            });
                        } else if (generatedPlan?._review_failed_but_delivered) {
                            const _issues = Array.isArray(generatedPlan?._review_issues)
                                ? generatedPlan._review_issues.slice(0, 2).map(String).join(' · ')
                                : '';
                            toast.warning("Plan generado con observaciones", {
                                description: _issues
                                    || generatedPlan?._review_disclaimer
                                    || "Observaciones no-críticas. Puedes regenerarlo si prefieres.",
                                duration: 10000,
                            });
                        } else if (
                            generatedPlan?._pantry_degraded_summary?.degraded
                            || generatedPlan?._initial_chunk_pantry_degraded
                        ) {
                            toast.info("Algunos ingredientes faltan en tu nevera", {
                                description: "Revisa la lista de compras antes de cocinar — algunos meals usan alternativas.",
                                duration: 8000,
                            });
                        }
                    }).catch(() => { /* toast best-effort */ });
                }

            } catch (error) {
                if (error.message === 'UserCancelled') {
                    // [P3-CANCEL-REDIRECT-ASSESSMENT · 2026-05-16] Pre-fix
                    // redirigía a /dashboard tras cancelar. UX feedback: el
                    // user que cancela voluntariamente quiere AJUSTAR el
                    // formulario antes de regenerar (cambiar preferencias,
                    // alergias, household size, etc.), no volver al dashboard
                    // donde ya está el plan ANTERIOR. /assessment es el
                    // siguiente paso natural del intent de cancel.
                    console.log("Generación cancelada. Volviendo al formulario...");
                    navigate('/assessment', { replace: true });
                    return;
                }
                console.error("❌ Error generando el plan:", error);
                if (!ignore) {
                    // [P3-409-PIPELINE-RUNNING · 2026-05-16] El user disparó un
                    // segundo plan mientras uno previo seguía generando en el
                    // backend (P1-DEEP-SEARCH-PIPELINE guardrail, max_age=15min).
                    // NO mostrar error, NO clearear el flag — el pipeline
                    // existente terminará y el <PendingPipelineRecovery />
                    // recogerá el resultado. Toast informativo + redirect.
                    if (error.code === 'pipeline_already_running') {
                        // Asegurar que el flag local esté seteado para que el
                        // recovery polee (el user pudo llegar aquí desde un
                        // refresh donde el flag se perdió).
                        try {
                            const _existingFlag = localStorage.getItem('mealfit_plan_in_progress');
                            if (!_existingFlag) {
                                localStorage.setItem('mealfit_plan_in_progress', JSON.stringify({
                                    user_id: null,
                                    started_at: error.startedAt || new Date().toISOString(),
                                }));
                            }
                        } catch { /* localStorage best-effort */ }
                        import('sonner').then(({ toast }) => {
                            toast.info("Tu plan se está generando", {
                                description: "Ya tienes uno en curso. Te avisamos cuando esté listo.",
                                duration: 6000,
                            });
                        });
                        navigate('/dashboard', { replace: true });
                        return;
                    }
                    // [P3-ERROR-REDIRECT-ASSESSMENT · 2026-05-16] IA upstream
                    // caída (504 Gemini / circuit breaker). Pre-fix dejaba la
                    // pantalla de carga renderizada con toast persistente
                    // "Reintentar". UX feedback: la pantalla de loading
                    // congelada confunde — el user prefiere volver al formulario
                    // y reintentar desde ahí. Toast sigue visible en el
                    // formulario; el botón de generar relanza el plan.
                    if (error.code === 'critical_restriction') {
                        // [P2-CRITICAL-REJECTION-CODE · 2026-06-18] Rechazo crítico: la IA no logró un
                        // plan que respete una restricción declarada (alergia/condición). Mensaje accionable
                        // ("revisa tus restricciones"), NO "IA saturada" — reintentar a ciegas no ayuda.
                        try { localStorage.removeItem('mealfit_plan_in_progress'); } catch { /* noop */ }
                        import('sonner').then(({ toast }) => {
                            toast.error("Revisa tus restricciones", {
                                description: error.message || "No pudimos generar un plan que respete tus restricciones declaradas. Ajústalas e intenta de nuevo.",
                                duration: 10000,
                            });
                        });
                        navigate('/assessment', { replace: true });
                        return;
                    }
                    if (error.code === 'budget_insufficient' || error.code === 'budget_below_goal_floor' || error.code === 'form_invalid') {
                        // [P2-BUDGET-FLOOR · 2026-06-21] El presupuesto declarado no alcanza las metas
                        // (o un dato del form es inválido). Mensaje accionable + volver al formulario
                        // para ajustar presupuesto/metas. Reintentar a ciegas no ayuda.
                        try { localStorage.removeItem('mealfit_plan_in_progress'); } catch { /* noop */ }
                        import('sonner').then(({ toast }) => {
                            toast.error("Ajusta tu presupuesto o tus metas", {
                                description: error.message || "Tu presupuesto no alcanza para tus metas. Súbelo o reduce los días, las personas o tu meta calórica.",
                                duration: 12000,
                            });
                        });
                        navigate('/assessment', { replace: true });
                        return;
                    }
                    if (error.code === 'llm_unavailable') {
                        // [P3-CLEAR-FLAG-ON-FATAL · 2026-05-16] Limpiar flag:
                        // el backend rechazó ANTES de iniciar pipeline (CB abierto).
                        // Sin clear, <PendingPipelineRecovery /> poleará un row
                        // stale del KV y redirigirá al user a /plan cuando el
                        // backend vuelva → ilusión de "regeneración automática".
                        try { localStorage.removeItem('mealfit_plan_in_progress'); } catch { /* noop */ }
                        import('sonner').then(({ toast }) => {
                            toast.error("La IA está saturada", {
                                description: error.message || "Intenta de nuevo en 1-2 minutos.",
                                duration: 8000,
                            });
                        });
                        navigate('/assessment', { replace: true });
                        return;
                    }
                    // [P1-QUOTA-402-UX · 2026-05-30] Cap mensual de créditos
                    // alcanzado (gratis=15/basic=50/plus=200). El backend ya
                    // rechazó con 402 ANTES de iniciar pipeline → limpiar el
                    // flag para que <PendingPipelineRecovery /> no poolee un KV
                    // stale. Mostramos el mensaje real del backend ("Mejora tu
                    // plan para continuar") con CTA directo a /dashboard/upgrade
                    // — la conversión en el momento de intención. NO mostrar
                    // "Sin conexión con la IA" (mentira que mandaba al user a un
                    // loop en /assessment sin ver el paywall).
                    if (error.code === 'quota_exceeded') {
                        try { localStorage.removeItem('mealfit_plan_in_progress'); } catch { /* noop */ }
                        import('sonner').then(({ toast }) => {
                            toast.error("Límite de créditos alcanzado", {
                                description: error.message || "Mejora tu plan para seguir generando.",
                                action: {
                                    label: "Mejorar plan",
                                    onClick: () => navigate('/dashboard/upgrade'),
                                },
                                duration: 10000,
                            });
                        });
                        navigate('/dashboard/upgrade', { replace: true });
                        return;
                    }
                    // [P3-ERROR-REDIRECT-ASSESSMENT · 2026-05-16] SSE + endpoint
                    // síncrono fallaron (red caída, backend inalcanzable, DNS).
                    // Pre-fix: toast persistente + loading congelado. Post-fix:
                    // toast + redirect al formulario para que el user vea el
                    // contexto completo y pueda reintentar (incluyendo refrescar
                    // su perfil si suspendió la PC y la sesión expiró).
                    if (error.code === 'offline_unavailable') {
                        // [P3-CLEAR-FLAG-ON-FATAL · 2026-05-16] Backend down /
                        // ERR_CONNECTION_REFUSED. NO hay pipeline procesando
                        // (todo el backend está caído). Sin clear, al volver el
                        // backend, el flag local hace que <PendingPipelineRecovery />
                        // polee un KV row stale del intento anterior y
                        // redirija al user a /plan SIN que él haya clickeado nada.
                        try { localStorage.removeItem('mealfit_plan_in_progress'); } catch { /* noop */ }
                        import('sonner').then(({ toast }) => {
                            toast.error("Sin conexión con la IA", {
                                description: error.message || "Verifica tu conexión y reintenta.",
                                duration: 8000,
                            });
                        });
                        navigate('/assessment', { replace: true });
                        return;
                    }
                    // [P1-B10] Rate limit del backend (`_PLAN_GEN_LIMITER`,
                    // 3/60s per user|ip): toast con countdown que actualiza
                    // cada segundo y habilita el botón "Reintentar" cuando
                    // expira la ventana. Antes el usuario veía "Error al
                    // generar el plan" sin saber que era cool-down ni cuánto
                    // esperar — confundía con "IA caída" y reintentaba en
                    // bucle (agravando el rate limit).
                    // [P3-ERROR-REDIRECT-ASSESSMENT · 2026-05-16] Rate limit
                    // del backend. Pre-fix: countdown en toast persistente +
                    // loading congelado. Post-fix: toast con countdown sigue
                    // pero la pantalla cambia a /assessment para que el user
                    // vea su formulario mientras espera.
                    if (error.code === 'rate_limited') {
                        // [P3-CLEAR-FLAG-ON-FATAL · 2026-05-16] El backend
                        // rechazó ANTES de iniciar pipeline (429). Sin clear,
                        // el flag stale dispararía recovery espurio.
                        try { localStorage.removeItem('mealfit_plan_in_progress'); } catch { /* noop */ }
                        import('sonner').then(({ toast }) => {
                            const toastId = 'rate-limit-toast';
                            const startedAt = Date.now();
                            const totalSeconds = Math.max(1, Number(error.retryAfter) || DEFAULT_RATE_LIMIT_RETRY_AFTER_S);
                            const showWithCountdown = (remaining) => {
                                if (remaining > 0) {
                                    toast.error('Demasiadas solicitudes', {
                                        id: toastId,
                                        description: `Espera ${remaining}s antes de regenerar — el sistema te limitó por seguridad.`,
                                        duration: Infinity,
                                    });
                                } else {
                                    toast.success('Listo para reintentar', {
                                        id: toastId,
                                        description: 'La ventana de espera terminó. Puedes regenerar desde el formulario.',
                                        duration: 6000,
                                    });
                                }
                            };
                            showWithCountdown(totalSeconds);
                            const intervalId = setInterval(() => {
                                if (ignore) {
                                    clearInterval(intervalId);
                                    toast.dismiss(toastId);
                                    return;
                                }
                                const elapsed = Math.floor((Date.now() - startedAt) / 1000);
                                const remaining = Math.max(0, totalSeconds - elapsed);
                                showWithCountdown(remaining);
                                if (remaining <= 0) clearInterval(intervalId);
                            }, 1000);
                        });
                        navigate('/assessment', { replace: true });
                        return;
                    }
                    // [P1-RECOVERY-SUSPEND-FIX · 2026-05-16] Si hay un flag
                    // `mealfit_plan_in_progress` activo, el SSE pudo haberse
                    // roto por suspend/sleep/network blip — NO es "error de
                    // generación". El backend sigue procesando en background
                    // (P1-DEEP-SEARCH-PIPELINE) y `<PendingPipelineRecovery />`
                    // recogerá el plan cuando esté listo. Mostrar toast suave
                    // que comunique este comportamiento en lugar del "Error
                    // al generar el plan" engañoso.
                    let _hasInProgressFlag = false;
                    try {
                        const _flagRaw = localStorage.getItem('mealfit_plan_in_progress');
                        _hasInProgressFlag = !!_flagRaw;
                    } catch { /* localStorage best-effort */ }

                    if (_hasInProgressFlag) {
                        import('sonner').then(({ toast }) => {
                            toast.info("Conexión interrumpida", {
                                description: "Tu plan se sigue generando en segundo plano. Te avisamos cuando esté listo.",
                                duration: 6000,
                            });
                        });
                        // NO clear del flag — el recovery component lo manejará
                        // cuando detecte status='complete' en el KV.
                        navigate('/dashboard', { replace: true });
                        return;
                    }

                    // [P3-ERROR-REDIRECT-ASSESSMENT · 2026-05-16] Catch genérico:
                    // pre-fix navegaba a /dashboard. Post-fix navega al
                    // formulario para que el user pueda ajustar y reintentar
                    // sin tener que volver desde el dashboard.
                    // [P3-CLEAR-FLAG-ON-FATAL · 2026-05-16] Clear del flag para
                    // que el recovery NO redirija al user a /plan automáticamente
                    // al volver el backend (KV row stale del intento fallido).
                    try { localStorage.removeItem('mealfit_plan_in_progress'); } catch { /* noop */ }
                    import('sonner').then(({ toast }) => {
                        toast.error("Error al generar el plan", { description: "Por favor, intenta nuevamente más tarde." });
                    });
                    navigate('/assessment', { replace: true });
                }
            }
        };

        processPlan();

        return () => {
            ignore = true;
        };
        // [P1-3] `loadingSensitive` en deps para re-disparar el effect cuando
        // termine la hidratación post-login. Las demás capturas (formData,
        // location, etc.) siguen siendo stale-by-design — el effect solo debe
        // correr una vez por mount efectivo, no por cada keystroke del form.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadingSensitive]);

    // [P3-BEFOREUNLOAD-NO-CANCEL · 2026-05-16] El handler `beforeunload` que
    // disparaba `cancelGeneration()` al cerrar la tab fue REMOVIDO porque
    // contradecía directamente P1-DEEP-SEARCH-PIPELINE (2026-05-15).
    //
    // Historia:
    //   - P2-NEW-15 (2026-05-11): añadió beforeunload→cancel para evitar
    //     "quemar cuota LLM con un user que ya se fue".
    //   - P1-DEEP-SEARCH-PIPELINE (2026-05-15): cambió el paradigma — el
    //     pipeline SIGUE corriendo cuando el SSE muere, y el user recupera
    //     el plan al volver via /pending-status.
    //   - Las 2 features coexistieron sin reconciliar. Resultado observado
    //     2026-05-16: user cerró tab → beforeunload disparó cancel → KV
    //     clear + pipeline aborted → PendingPipelineRecovery no encuentra
    //     nada que recuperar → user ve el formulario al volver.
    //
    // Fix: NO cancelar en beforeunload. El backend completa el plan; KV
    // mantiene `status='generating'` → recovery navega a /plan al volver.
    //
    // El botón "Cancelar" explícito (onCancel={cancelGeneration} en
    // LoadingScreen y otros) SIGUE funcionando — solo eliminamos el
    // cancel AUTOMÁTICO en tab-close. La intent del user es distinta:
    // cerrar tab = "me voy un rato, vuelvo después"; click cancel =
    // "no quiero este plan, descártalo".
    //
    // Trade-offs aceptados:
    //   - Memleak del SSE reader: trivial; el browser GC lo limpia
    //     cuando la tab se cierra (el JS heap se libera).
    //   - "Cuota LLM quemada": ya NO aplica — el user vuelve y el
    //     plan se le entrega. La cuota se "consume" como cualquier
    //     plan exitoso.

    // [P0-13] Side-effect de "campo faltante → toast + navigate a /assessment".
    // ANTES vivía inline en render con `setTimeout(0)` + `<Navigate>`, lo cual:
    //   1. Programaba toasts múltiples bajo StrictMode (que invoca render 2x).
    //   2. En cualquier re-render mientras `missing` siguiera truthy
    //      (loadingSensitive flickeando true→false→true durante token refresh
    //      o hidratación), schedulaba otro toast.
    //   3. Renderizaba `<Navigate>` durante el primer render incluso si los
    //      datos sensibles estaban a punto de hidratarse → rebote
    //      `/plan ↔ /assessment` con toasts duplicados.
    // AHORA es un useEffect que:
    //   - Solo evalúa cuando `loadingSensitive=false` (hidratación terminada).
    //   - Dedupea el toast vía `incompleteToastShownRef` (1 por mount).
    //   - Navega vía `navigate(replace:true)` (no `<Navigate>` en render).
    //
    // El render de abajo retorna `<LoadingScreen>` mientras el effect
    // ejecuta el navigate — UX equivalente al estado "analyzing" inicial.
    useEffect(() => {
        if (loadingSensitive) return;
        const missing = findFirstIncompleteField(formData);
        if (!missing) return;
        // [P3-RECOVERY-BYPASS-FORM-CHECK · 2026-05-16] Mirror del bypass
        // de processPlan: si hay pending pipeline en backend, NO navegar
        // al cuestionario aunque formData esté incompleto — el user vino
        // a recuperar su plan en curso, no a re-llenar el form.
        try {
            if (localStorage.getItem('mealfit_plan_in_progress')) return;
        } catch { /* localStorage best-effort */ }
        if (!incompleteToastShownRef.current) {
            incompleteToastShownRef.current = true;
            const label = FIELD_LABELS[missing] || missing;
            import('sonner').then(({ toast }) => {
                toast.info(`Falta completar: ${label}`, {
                    description: 'Te llevamos al cuestionario.',
                    duration: 4000,
                });
            });
        }
        navigate('/assessment', { replace: true });
    }, [loadingSensitive, formData, navigate]);

    // 3. RENDERIZADO CONDICIONAL

    // [P0-13] Si falta un campo requerido y la hidratación terminó, el effect
    // arriba dispara la navegación; mientras el navigate se efectúa,
    // mostramos LoadingScreen para evitar el flicker del Plan completo.
    // Mientras `loadingSensitive=true`, también caemos al LoadingScreen
    // (UX equivalente al estado "analyzing" inicial; sin riesgo de rebote
    // porque NO disparamos navigate hasta que la hidratación complete).
    if (!loadingSensitive && findFirstIncompleteField(formData)) {
        return <LoadingScreen
            status={status}
            streamPhase={streamPhase}
            daysCompleted={daysCompleted}
            onCancel={cancelGeneration}
        />;
    }

    if (status === 'preview') {
        return (
            <PreviewScreen
                oldPlan={oldPlan}
                newPlan={tempPlan}
                onAccept={() => {
                    saveGeneratedPlan(tempPlan);
                    setCurrentStep(0);
                    navigate('/dashboard', { replace: true });
                }}
                onReject={async () => {
                    if (oldPlan) {
                        await restorePlan(oldPlan);
                    }
                    navigate('/dashboard', { replace: true });
                }}
                // [P1-3] Regenerar = re-disparar el flujo de generación con la
                // misma `formData`. Hacemos `window.location.reload()` (mismo
                // patrón que `handleRetry` en el manejo de chunks fallidos:
                // línea ~557): conserva localStorage + re-monta `Plan.jsx`,
                // así `useEffect(() => processPlan())` se re-dispara con los
                // mismos inputs. El plan rechazado nunca se persistió porque
                // el usuario no clicó "Aceptar" — `oldPlan` permanece intacto
                // en localStorage.
                onRegenerate={() => { window.location.reload(); }}
            />
        );
    }

    // Pantalla de Carga (única vista del componente mientras se genera)
    return <LoadingScreen 
        status={status} 
        streamPhase={streamPhase} 
        daysCompleted={daysCompleted} 
                onCancel={cancelGeneration}
    />;
};

// --- GAP 14: PANTALLA DE VISTA PREVIA (COMPARACIÓN) ---
const PreviewScreen = ({ oldPlan, newPlan, onAccept, onReject, onRegenerate }) => {
    const [failedChunks, setFailedChunks] = useState([]);
    const [isRetrying, setIsRetrying] = useState(false);
    // [P1-ζ] Banner persistente cuando un chunk dead-letearó. El backend expone
    // `user_action_required` (payload preformateado) y `recovery_exhausted_chunks`
    // (lista de chunks afectados) vía /chunk-status. Mostramos el banner mientras
    // el usuario no haya forzado la regeneración simplificada.
    const [userActionRequired, setUserActionRequired] = useState(null);
    const [recoveryExhausted, setRecoveryExhausted] = useState([]);
    const [simplifyingChunkId, setSimplifyingChunkId] = useState(null);

    // [P1-3] Flags de transparencia que el orquestador adjunta al plan cuando
    // detecta degradación parcial. El sync ya los exponía vía body + headers
    // HTTP; el SSE los expone ahora vía `_pantry_degraded_summary` (P1-2). El
    // frontend antes IGNORABA estos flags — el usuario aceptaba un plan sin
    // saber que tenía ingredientes fuera de su nevera o que no había superado
    // la verificación médica. Aquí leemos cada flag y renderizamos un banner
    // claramente visible con CTA de regeneración.
    //
    // Nota: NO mostramos banner para `_is_fallback` plain — ese caso ya se
    // intercepta en `generateAIPlanStream` con un toast de "IA saturada" + CTA
    // de retry (línea ~417). Aquí solo cubrimos planes que SÍ se entregaron al
    // cliente pero con disclaimers de calidad.
    const pantrySummary = newPlan?._pantry_degraded_summary;
    const showPantryBanner = !!(
        pantrySummary?.degraded
        || newPlan?._initial_chunk_pantry_degraded
    );
    // El orquestador descarta planes con rechazo CRÍTICO (alergias / condiciones
    // médicas) entregando fallback matemático con `_critical_rejection=true`.
    // En severidad no-crítica, entrega el plan marcado con
    // `_review_failed_but_delivered=true` para que el cliente decida regenerar.
    const showReviewCriticalBanner = !!newPlan?._critical_rejection;
    const showReviewWarningBanner = !!(
        newPlan?._review_failed_but_delivered && !showReviewCriticalBanner
    );

    // [P3-PLAN-AUTO-APPLY-CLEAN · 2026-05-15] Auto-apply + skip al dashboard
    // cuando el plan se aprobó LIMPIAMENTE (sin observaciones que requieran
    // decisión del usuario). Razón: la pantalla intermedia "Compara los cambios"
    // es valiosa SOLO cuando hay algo que el usuario necesita revisar (banners
    // médicos, pantry degradada, regenerate). En el happy path es fricción
    // innecesaria — el usuario inició la generación porque quiere el plan.
    //
    // Casos en que NO skipeamos (preservamos la pantalla):
    //   - `showReviewCriticalBanner`: rechazo médico crítico → usuario DEBE
    //     ver el banner rojo + opción de regenerar (legal/safety).
    //   - `showReviewWarningBanner`: observaciones no-críticas → usuario DEBE
    //     poder leer y decidir aceptar o regenerar.
    //   - `showPantryBanner`: despensa degradada → usuario DEBE saber que
    //     faltan ingredientes.
    //
    // Kill switch sin redeploy: `VITE_PLAN_AUTO_APPLY_ON_CLEAN_REVIEW=false`
    // en `.env.local`. Por default `true`.
    //
    // No incluimos `userActionRequired`/`failedChunks`/`recoveryExhausted` en
    // el check porque al mount son vacíos (vienen del polling de chunk-status
    // que solo dispara para planes partial). Si aparecen después, el usuario
    // ya está en el dashboard, que tiene su propio surface para esos eventos.
    const autoApplyEnabled = (
        import.meta.env.VITE_PLAN_AUTO_APPLY_ON_CLEAN_REVIEW ?? 'true'
    ).toString().toLowerCase() !== 'false';
    const _hasReviewableObservations = (
        showPantryBanner || showReviewCriticalBanner || showReviewWarningBanner
    );
    useEffect(() => {
        if (!autoApplyEnabled) return;
        if (_hasReviewableObservations) return;
        if (!newPlan) return;
        // Happy path: plan aprobado limpio → ir directo al dashboard.
        onAccept();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // [P1-PLAN-CHUNK-POLL-ABORT · 2026-05-24] AbortController component-scoped.
    // Pre-fix el polling cada 5s NO usaba AbortController: el cleanup solo
    // limpiaba `clearInterval`, pero la fetch en-vuelo al desmontar seguía
    // ejecutando + llamaba `setFailedChunks`/`setUserActionRequired`/
    // `setRecoveryExhausted` sobre componente desmontado → warning React +
    // memory retention. Mismo bug exacto que P1-PROD-FINAL-1 cerró en
    // Dashboard.jsx y P1-HISTORY-ABORT en History.jsx — Plan.jsx era el
    // último polling sin abort.
    useEffect(() => {
        if (!newPlan?.id || newPlan?.generation_status !== 'partial') return;

        let previousDays = newPlan?.days?.length || 0;
        const controller = new AbortController();
        const signal = controller.signal;

        const intervalId = setInterval(async () => {
            if (signal.aborted) return;
            // [P1-PLAN-POLL-VISIBILITY · 2026-05-31] no sondear con pestaña oculta (ahorra red/batería).
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            try {
                const res = await getPlanChunkStatus(newPlan.id, { signal });
                if (signal.aborted) return;
                if (!res.ok) return;
                const data = await res.json();
                if (signal.aborted) return;

                if (data.failed_chunks && data.failed_chunks.length > 0) {
                    setFailedChunks(data.failed_chunks);
                }

                // [P1-ζ] Sincronizar estado del banner dead-lettered.
                setUserActionRequired(data.user_action_required || null);
                setRecoveryExhausted(Array.isArray(data.recovery_exhausted_chunks) ? data.recovery_exhausted_chunks : []);

                if (data.days_generated > previousDays) {
                    const newWeeks = Math.floor(data.days_generated / 7);
                    const oldWeeks = Math.floor(previousDays / 7);
                    if (newWeeks > oldWeeks) {
                        import('sonner').then(({ toast }) => {
                            toast.success(`¡Semana ${newWeeks} completada en background! 🚀`, {
                                description: 'Tus nuevas comidas ya están listas.'
                            });
                        });
                    }
                    previousDays = data.days_generated;
                }

                if (data.status === 'complete') {
                    import('sonner').then(({ toast }) => {
                        toast.success('¡Todas las semanas han sido generadas exitosamente! 🎉');
                    });
                    clearInterval(intervalId);
                } else if (data.status === 'failed') {
                    import('sonner').then(({ toast }) => {
                        toast.error('Hubo un problema generando las próximas semanas.');
                    });
                    clearInterval(intervalId);
                }
            } catch (error) {
                // AbortError silencioso: cleanup esperado, no es bug real.
                if (error?.name === 'AbortError' || signal.aborted) return;
                console.error('Error polling chunk status:', error);
            }
        }, 5000);

        return () => {
            controller.abort();
            clearInterval(intervalId);
        };
    }, [newPlan?.id, newPlan?.generation_status, isRetrying]);

    // [P1-ζ] Forzar regeneración de un chunk dead-lettered en flexible_mode +
    // advisory_only. Es el último escalón cuando la cascada de recovery agotó
    // sus reintentos automáticos: el usuario acepta una versión simplificada
    // antes que esperar intervención manual.
    const handleSimplifyChunk = async (chunkId) => {
        setSimplifyingChunkId(chunkId);
        try {
            const { regenerateChunkSimplified } = await import('../config/api');
            const res = await regenerateChunkSimplified(newPlan.id, chunkId);
            if (res.ok) {
                import('sonner').then(({ toast }) => {
                    toast.success('Generando versión simplificada', {
                        description: 'Tus próximos días aparecerán en breve. Algunos ingredientes pueden ser sugerencias generales.',
                    });
                });
                setRecoveryExhausted(prev => prev.filter(c => c.chunk_id !== chunkId && c.id !== chunkId));
                setUserActionRequired(null);
            } else {
                const err = await res.json().catch(() => ({}));
                import('sonner').then(({ toast }) => {
                    toast.error('No se pudo iniciar la regeneración simplificada', {
                        description: err.detail || 'Inténtalo de nuevo en unos segundos.',
                    });
                });
            }
        } catch (e) {
            console.error('[P1-ζ] handleSimplifyChunk:', e);
            import('sonner').then(({ toast }) => toast.error('Error al iniciar la regeneración simplificada'));
        } finally {
            setSimplifyingChunkId(null);
        }
    };

    const handleRetry = async (chunkId) => {
        setIsRetrying(true);
        try {
            const res = await retryPlanChunk(newPlan.id, chunkId);
            if (res.ok) {
                import('sonner').then(({ toast }) => {
                    toast.success('Reintento iniciado', { description: 'Generando la semana nuevamente...' });
                });
                setFailedChunks(prev => prev.filter(c => c.id !== chunkId));
                // Refrescar página o reactivar polling
                window.location.reload();
            } else {
                import('sonner').then(({ toast }) => toast.error('Error al iniciar el reintento'));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsRetrying(false);
        }
    };

    return (
        <div style={{
            minHeight: 'calc(100dvh - 70px)',
            display: 'flex', flexDirection: 'column',
            padding: '2rem 1.5rem',
            background: 'linear-gradient(135deg, #0f0c29 0%, #1a1a3e 40%, #24243e 100%)',
            color: 'white',
        }}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem', textAlign: 'center', color: 'white' }}>
                    ¡Plan Generado!
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: '2rem' }}>
                    Compara los cambios antes de aplicar tu nueva estrategia nutricional.
                </p>

                <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column', marginBottom: '2rem' }}>
                    {oldPlan && (
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'rgba(255,255,255,0.5)' }}>Plan Anterior</h3>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                                <span>Calorías Diarias:</span>
                                <strong>{oldPlan.calories || oldPlan.estimated_calories} kcal</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                                <span>Días Programados:</span>
                                <strong>{oldPlan.total_days_requested || (oldPlan.days ? oldPlan.days.length : 0)} días</strong>
                            </div>
                            {oldPlan.macros && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span>Macros (P/C/G):</span>
                                    <strong>{oldPlan.macros.protein} / {oldPlan.macros.carbs} / {oldPlan.macros.fats}</strong>
                                </div>
                            )}
                        </div>
                    )}
                    
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#10B981' }}>Nuevo Plan</h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                            <span>Calorías Diarias:</span>
                            <strong style={{ color: '#10B981' }}>{newPlan.calories || newPlan.estimated_calories} kcal</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                            <span>Días Programados:</span>
                            <strong style={{ color: '#10B981' }}>{newPlan.total_days_requested || (newPlan.days ? newPlan.days.length : 0)} días</strong>
                        </div>
                        {newPlan.macros && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <span>Macros (P/C/G):</span>
                                <strong style={{ color: '#10B981' }}>{newPlan.macros.protein} / {newPlan.macros.carbs} / {newPlan.macros.fats}</strong>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                    <button 
                        onClick={onAccept}
                        style={{
                            padding: '1rem', background: '#10B981', color: 'white', borderRadius: '0.75rem',
                            border: 'none', fontWeight: 600, fontSize: '1rem', cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
                        }}
                    >
                        Aceptar y Aplicar Nuevo Plan
                    </button>
                    {oldPlan && (
                        <button 
                            onClick={onReject}
                            style={{
                                padding: '1rem', background: 'transparent', color: 'rgba(255,255,255,0.7)', 
                                borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.2)', 
                                fontWeight: 600, fontSize: '1rem', cursor: 'pointer'
                            }}
                        >
                            Mantener Plan Anterior
                        </button>
                    )}
                </div>

                {/* [P1-3] Banner: rechazo médico CRÍTICO (alergia/condición comprometida).
                    El plan fue reemplazado por fallback matemático del orquestador para
                    proteger al usuario. Severidad alta — usar tono rojo. */}
                {showReviewCriticalBanner && (
                    <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(239, 68, 68, 0.12)', borderRadius: '1rem', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                        <h3 style={{ fontSize: '1.05rem', marginBottom: '0.75rem', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertTriangle size={20} /> Plan reemplazado por seguridad
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)', marginBottom: '1rem', lineHeight: 1.5 }}>
                            {newPlan?._review_disclaimer
                                || 'El plan generado violaba alguna restricción crítica (alergia o condición médica declarada). Por seguridad, te servimos un plan de contingencia matemático. Regenera para intentar de nuevo o revisa tus restricciones en el formulario.'}
                        </p>
                        <button
                            onClick={onRegenerate}
                            style={{
                                width: '100%', padding: '0.75rem 1rem', background: '#EF4444', color: 'white', borderRadius: '0.5rem',
                                border: 'none', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                            }}
                        >
                            <RefreshCw size={16} /> Regenerar plan
                        </button>
                    </div>
                )}

                {/* [P1-3] Banner: revisión médica fallida pero NO crítica.
                    El plan se entrega marcado para visibilidad. Tono ámbar. */}
                {showReviewWarningBanner && (
                    <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(245, 158, 11, 0.12)', borderRadius: '1rem', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                        <h3 style={{ fontSize: '1.05rem', marginBottom: '0.75rem', color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ShieldCheck size={20} /> Verificación médica con observaciones
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                            {newPlan?._review_disclaimer
                                || 'Este plan no superó completamente la verificación médica automática. Las observaciones encontradas son no-críticas, pero te recomendamos regenerarlo o revisarlo con tu nutricionista.'}
                        </p>
                        {Array.isArray(newPlan?._review_issues) && newPlan._review_issues.length > 0 && (
                            <ul style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', paddingLeft: '1.25rem' }}>
                                {newPlan._review_issues.slice(0, 4).map((issue, idx) => (
                                    <li key={idx} style={{ marginBottom: '0.25rem' }}>{String(issue)}</li>
                                ))}
                            </ul>
                        )}
                        <button
                            onClick={onRegenerate}
                            style={{
                                width: '100%', padding: '0.75rem 1rem', background: '#F59E0B', color: 'white', borderRadius: '0.5rem',
                                border: 'none', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                            }}
                        >
                            <RefreshCw size={16} /> Regenerar plan
                        </button>
                    </div>
                )}

                {/* [P1-3] Banner: pantry degradada (ingredientes generados que el usuario
                    no tiene en nevera). Tono ámbar — no es crítico, pero rompe la promesa
                    central del producto. CTA dual: actualizar nevera (ruta más útil) o
                    regenerar directo. */}
                {showPantryBanner && (
                    <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(245, 158, 11, 0.12)', borderRadius: '1rem', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                        <h3 style={{ fontSize: '1.05rem', marginBottom: '0.75rem', color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ShoppingCart size={20} /> Algunos ingredientes no están en tu nevera
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                            Detectamos platos con ingredientes fuera de tu inventario actual. Puedes
                            actualizar tu nevera para que el próximo plan los considere, o regenerar
                            ahora con lo que tienes.
                        </p>
                        {Array.isArray(pantrySummary?.degraded_days) && pantrySummary.degraded_days.length > 0 && (
                            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.75rem' }}>
                                Días afectados: {pantrySummary.degraded_days.map(d => `Día ${d}`).join(', ')}
                            </p>
                        )}
                        {newPlan?._initial_chunk_pantry_violation && (
                            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic', marginBottom: '1rem' }}>
                                {String(newPlan._initial_chunk_pantry_violation).slice(0, 240)}
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {/* [P4-PLAN-SPA-NAV] <Link> en vez de <a href> evita full page reload
                                (re-descarga del bundle + pérdida de estado de PreviewScreen). */}
                            <Link
                                to="/pantry"
                                style={{
                                    flex: '1 1 140px', padding: '0.75rem 1rem', background: 'transparent', color: '#F59E0B',
                                    borderRadius: '0.5rem', border: '1px solid rgba(245, 158, 11, 0.5)', fontWeight: 600,
                                    fontSize: '0.9rem', textAlign: 'center', textDecoration: 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                                }}
                            >
                                <ShoppingCart size={16} /> Actualizar nevera
                            </Link>
                            <button
                                onClick={onRegenerate}
                                style={{
                                    flex: '1 1 140px', padding: '0.75rem 1rem', background: '#F59E0B', color: 'white', borderRadius: '0.5rem',
                                    border: 'none', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                                }}
                            >
                                <RefreshCw size={16} /> Regenerar
                            </button>
                        </div>
                    </div>
                )}

                {/* [P1-ζ] Banner dead-lettered con CTA "Generar versión simplificada".
                    Cubre el último escalón cuando recovery automático agotó reintentos.
                    `userActionRequired` viene preformateado del backend; `recoveryExhausted`
                    lista los chunks específicos que el usuario puede simplificar uno a uno. */}
                {(userActionRequired || recoveryExhausted.length > 0) && (
                    <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '1rem', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Activity size={20} /> {userActionRequired?.title || 'Tu plan necesita una decisión'}
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)', marginBottom: '1rem' }}>
                            {userActionRequired?.body || (
                                'Algunas semanas no se pudieron generar tras varios intentos automáticos. ' +
                                'Puedes generar una versión simplificada (con ingredientes generales) para no perder tus próximos días.'
                            )}
                        </p>
                        {recoveryExhausted.length > 0 && recoveryExhausted.map((chunk) => {
                            const cid = chunk.chunk_id || chunk.id;
                            const wk = chunk.week_number || chunk.week || '?';
                            return (
                                <div key={cid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span>Semana {wk}</span>
                                    <button
                                        onClick={() => handleSimplifyChunk(cid)}
                                        disabled={simplifyingChunkId === cid}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            background: '#F59E0B',
                                            color: 'white',
                                            borderRadius: '0.5rem',
                                            border: 'none',
                                            fontWeight: 600,
                                            fontSize: '0.9rem',
                                            cursor: simplifyingChunkId === cid ? 'not-allowed' : 'pointer',
                                            opacity: simplifyingChunkId === cid ? 0.7 : 1,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                        }}
                                    >
                                        {simplifyingChunkId === cid
                                            ? <Loader2 size={16} className="animate-spin" />
                                            : 'Generar versión simplificada'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {failedChunks.length > 0 && (
                    <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '1rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Activity size={20} /> Problema al generar más semanas
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', marginBottom: '1rem' }}>
                            No te preocupes, tus primeros días ya están listos. Sin embargo, nuestro agente encontró problemas generando algunas semanas futuras de tu plan.
                        </p>
                        {failedChunks.map(chunk => (
                            <div key={chunk.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                                <span>Semana {chunk.week_number}</span>
                                <button 
                                    onClick={() => handleRetry(chunk.id)}
                                    disabled={isRetrying}
                                    style={{
                                        padding: '0.5rem 1rem', background: '#EF4444', color: 'white', borderRadius: '0.5rem',
                                        border: 'none', fontWeight: 600, fontSize: '0.9rem', cursor: isRetrying ? 'not-allowed' : 'pointer',
                                        opacity: isRetrying ? 0.7 : 1
                                    }}
                                >
                                    {isRetrying ? <Loader2 size={16} className="animate-spin" /> : 'Reintentar Semana'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    );
};
PreviewScreen.propTypes = { oldPlan: PropTypes.object, newPlan: PropTypes.object, onAccept: PropTypes.func, onReject: PropTypes.func, onRegenerate: PropTypes.func };

// [P5-SPEED-LOADINGSCREEN-HOIST · 2026-06-01] `steps` (10 objetos con refs a íconos
// lucide module-level) y `tips` (5 strings) izados a module-scope. Antes vivían DENTRO
// de LoadingScreen → se reconstruían en cada render, y LoadingScreen re-renderiza a
// sub-segundo durante ~4-5 min (la barra de progreso + contador de tiempo + rotación
// de tips). Dependen solo de imports module-level → se alocan una vez aquí.
const LOADING_STEPS = [
    { text: "Iniciando motor de Inteligencia Artificial", icon: Server, pct: 5, phase: null },
    { text: "Analizando perfil biométrico y metabólico", icon: Activity, pct: 12, phase: 'analyzing' },
    { text: "Calculando arquitectura de macronutrientes", icon: PieChart, pct: 25, phase: 'skeleton' },
    { text: "Seleccionando ingredientes de alta biodisponibilidad", icon: Utensils, pct: 45, phase: 'day_1', dayCheck: 1 },
    { text: "Optimizando sinergias metabólicas", icon: UtensilsCrossed, pct: 60, phase: 'day_2', dayCheck: 2 },
    { text: "Estructurando patrones de alimentación", icon: ChefHat, pct: 75, phase: 'day_3', dayCheck: 3 },
    // P1-B: el orquestador emite `phase=adversarial_judging` y `phase=critique`
    // entre la generación paralela y `assembly`. Sin estas dos entradas, la
    // barra se queda pegada en ~78% durante 30–90 s y el usuario percibe el
    // app como colgado.
    { text: "Comparando candidatos y eligiendo el mejor plan", icon: Activity, pct: 79, phase: 'adversarial_judging' },
    { text: "Refinando coherencia y diversidad de platos", icon: ChefHat, pct: 81, phase: 'critique' },
    { text: "Consolidando despensa y optimizando compras", icon: ShoppingCart, pct: 85, phase: 'assembly' },
    { text: "Auditoría médica y calibración final", icon: ShieldCheck, pct: 93, phase: 'review' },
];

const LOADING_TIPS = [
    "💡 Beber agua antes de cada comida ayuda a controlar el apetito",
    "💡 Las proteínas aceleran tu metabolismo hasta un 30%",
    "💡 Comer despacio mejora la digestión y saciedad",
    "💡 El sueño es clave: sin él, las hormonas del hambre se descontrolan",
    "💡 Una comida balanceada tiene proteína, carbohidrato y grasa saludable",
];

// --- PANTALLA DE CARGA PREMIUM CON PROGRESO REAL ---
const LoadingScreen = ({ status, streamPhase, daysCompleted = [], onCancel }) => {
    const [progress, setProgress] = useState(0);
    const displayProgress = status === 'ready' ? 100 : progress;
    const [tipIndex, setTipIndex] = useState(0);

    // [P3-LOADING-TIME-ESTIMATE · 2026-05-16] Contador de tiempo transcurrido
    // + copy dinámico de estimado. Pre-fix: usuario veía solo "Diseñando tu
    // plan" sin idea de cuánto duraría → ansiedad + intentos de cancelar
    // prematuros.
    //
    // Calibración real (logs prod 2026-06-17, era DeepSeek V4): el pipeline
    // completo tarda ~3-5 min (skeleton ~22s + day_gen paralelo ~30s +
    // self-critique ~2min + reviewer + assembly). MUCHO más rápido que los
    // 12-13 min de la era Gemini (free-tier que saturaba pool). Rango honesto
    // = 4-5 min. Copy adapta:
    //   - <30s:    "Esto suele tomar entre 4 y 5 minutos."
    //   - 30s-6m:  "Transcurrido X:XX · estimado 4-5 minutos"
    //   - 6-10m:   "Transcurrido X:XX · ya casi terminamos, espera un poco más"
    //   - >10m:    "Transcurrido X:XX · gracias por tu paciencia · cerca del final"
    // El startTimeRef se inicializa UNA VEZ al mount (useRef no re-init en
    // re-renders) — incluso si el componente re-renderea por cambios de
    // status/streamPhase, el contador es continuo desde el primer mount.
    const startTimeRef = useRef(Date.now());
    const [elapsedSec, setElapsedSec] = useState(0);
    // [P3-CANCEL-FORCE-NAVIGATE · 2026-05-16] Hook local del navigate para
    // forzar el redirect al /assessment ANTES de que el SSE catch propague el
    // UserCancelled. Sin esto, si el reader está bloqueado en `await
    // reader.read()` o el catch no detecta el cancel correctamente, el
    // LoadingScreen se queda renderizado infinitamente. Garantizamos el
    // redirect desde el handler del botón sin depender del catch.
    const navigateCancel = useNavigate();

    // [P5-SPEED-LOADINGSCREEN-HOIST · 2026-06-01] Alias a las constantes module-scope
    // (LOADING_STEPS / LOADING_TIPS) — los arrays se alocan una vez, no en cada render.
    const steps = LOADING_STEPS;
    const tips = LOADING_TIPS;

    // Progreso basado en eventos SSE reales
    useEffect(() => {
        if (status === 'ready') return;

        // Mapear fases SSE a porcentaje mínimo de progreso
        // P1-B: añadidas `adversarial_judging` y `critique` — el orquestador
        // las emite entre `parallel_generation` (35%) y `assembly` (82%) y sin
        // ellas la barra parecía congelada por la duración combinada de ambos
        // nodos (típicamente 30–90 s).
        const phaseMinProgress = {
            'analyzing': 12,
            'skeleton': 25,
            'day_1': 35,
            'day_2': 50,
            'day_3': 60,
            'parallel_generation': 35,
            'adversarial_judging': 79,
            'critique': 81,
            'assembly': 82,
            'review': 93,
        };

        if (streamPhase && phaseMinProgress[streamPhase]) {
            setProgress(prev => Math.max(prev, phaseMinProgress[streamPhase]));
        }

        // Cuando un día se completa, incrementar el progreso según qué día sea
        if (daysCompleted.length > 0) {
            const dayProgress = { 1: 50, 2: 65, 3: 78 };
            const maxDayProgress = Math.max(...daysCompleted.map(d => dayProgress[d] || 0));
            setProgress(prev => Math.max(prev, maxDayProgress));
        }
    }, [streamPhase, daysCompleted, status]);

    useEffect(() => {
        if (status === 'ready') return;

        // Timer de respaldo: incrementa lentamente si SSE no envía eventos
        const timer = setInterval(() => {
            setProgress((old) => {
                if (old >= 99) return 99;

                let diff;
                if (old < 20) {
                    diff = Math.random() * 1.5 + 0.5;
                } else if (old < 50) {
                    diff = Math.random() * 0.8 + 0.2;
                } else if (old < 80) {
                    diff = Math.random() * 0.5 + 0.1;
                } else if (old < 95) {
                    diff = Math.random() * 0.3 + 0.05;
                } else {
                    diff = Math.random() * 0.1 + 0.02;
                }

                return Math.min(old + diff, 99);
            });
        }, 800);
        return () => clearInterval(timer);
    }, [status]);

    useEffect(() => {
        const tipTimer = setInterval(() => {
            setTipIndex((old) => (old + 1) % tips.length);
        }, 4500);
        return () => clearInterval(tipTimer);
    }, [tips.length]);

    // [P3-LOADING-TIME-ESTIMATE · 2026-05-16] Timer 1s para elapsed counter.
    // Pausa al alcanzar `status === 'ready'` (el plan terminó).
    useEffect(() => {
        if (status === 'ready') return undefined;
        const t = setInterval(() => {
            setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);
        return () => clearInterval(t);
    }, [status]);

    // Helper local: 125 → "2:05". Soporta horas si elapsed > 1h (edge case
    // de planes muy lentos por retries o Pro escalation).
    const formatElapsed = (sec) => {
        const totalSec = Math.max(0, sec);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
        const ss = String(s).padStart(2, '0');
        return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    };

    // Copy adaptativo: ofrece estimate inicial, luego switchea a elapsed
    // tracking, y reconoce explícitamente cuando se pasa del rango típico
    // para evitar que el usuario asuma "se colgó".
    const timeMessage = (() => {
        const transcurrido = formatElapsed(elapsedSec);
        if (elapsedSec < 30) {
            return 'Esto suele tomar entre 4 y 5 minutos.';
        }
        if (elapsedSec < 6 * 60) {
            return `Transcurrido ${transcurrido} · estimado 4-5 minutos`;
        }
        if (elapsedSec < 10 * 60) {
            return `Transcurrido ${transcurrido} · ya casi terminamos, espera un poco más`;
        }
        return `Transcurrido ${transcurrido} · gracias por tu paciencia · cerca del final`;
    })();

    // Determinar qué pasos ya se completaron (basado en progreso + días completados)
    const activeStepIndex = steps.findIndex(s => {
        // Si el step tiene dayCheck, verificar si ese día ya se completó
        if (s.dayCheck && daysCompleted.includes(s.dayCheck)) return false; // ya completado
        return displayProgress < s.pct;
    });
    const currentStep = activeStepIndex === -1 ? steps.length - 1 : Math.max(0, activeStepIndex - 1);

    return (
        <div className="mf-loading-bg" style={{
            minHeight: 'calc(100dvh - 70px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '3rem 1.5rem',
            // [P3-LOADING-PALETTE-ALIGN · 2026-05-16] El fondo se define en el bloque
            // <style> de abajo (clase .mf-loading-bg) — NO inline — para que pueda
            // variar por tema sin que la especificidad del estilo inline lo gane.
            //   · Claro (legacy premium): radial slate #1E293B→#0F172A, intacto.
            // [LOADING-DARK-BG · 2026-05-31] En oscuro adopta el MISMO fondo ambiental
            // que el Dashboard y el Formulario (P3-DARK-BG-STRIPES): rayas 45° 1px@4%
            // cada 52px + glows indigo/púrpura sobre #0B1120 → consistencia visual del
            // modo oscuro en todo el producto. El texto blanco sigue legible porque
            // ambos temas del loading son oscuros.
            position: 'relative', overflow: 'hidden',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        }}>
            {/* [P3-LOADING-PREMIUM-REDESIGN · 2026-05-15] Minimalist premium loading:
                Solo un pulse sutil + fade-in. Sin orbs, sin shimmer, sin 2 rings.
                Acorde a la identidad MealfitRD (rojo + azul + blanco). */}
            <style>{`
                @keyframes mfPulse { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.04); } }
                @keyframes mfSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .mf-pulse { animation: mfPulse 2.4s ease-in-out infinite; }
                .mf-spin { animation: mfSpin 1.6s linear infinite; }
                /* [LOADING-DARK-BG · 2026-05-31 · sin-rayas 2026-06-22] Fondo del loading.
                   Claro: radial slate premium (#1E293B→#0F172A). Oscuro: glows indigo/
                   púrpura sobre #0B1120. Se QUITARON las rayas diagonales blancas
                   (repeating-linear-gradient, P3-DARK-BG-STRIPES) por pedido del owner —
                   igual que en el formulario; quedan solo los glows ambientales. */
                .mf-loading-bg { background: radial-gradient(ellipse at center, #1E293B 0%, #0F172A 70%); }
                html[data-theme="dark"] .mf-loading-bg {
                    background-color: #0B1120;
                    background-image:
                        radial-gradient(ellipse 70% 55% at 8% -10%, rgba(99,102,241,0.28) 0%, transparent 55%),
                        radial-gradient(ellipse 58% 50% at 100% 2%, rgba(129,140,248,0.20) 0%, transparent 52%),
                        radial-gradient(ellipse 55% 50% at 90% 96%, rgba(139,92,246,0.14) 0%, transparent 55%),
                        radial-gradient(ellipse 75% 55% at 28% 108%, rgba(79,70,229,0.18) 0%, transparent 55%);
                    background-size: cover, cover, cover, cover;
                    background-repeat: no-repeat, no-repeat, no-repeat, no-repeat;
                }
            `}</style>

            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
                style={{ width: '100%', maxWidth: '380px', textAlign: 'center', position: 'relative', zIndex: 2 }}
            >
                {/* === DOT INDICATOR MINIMALIST === */}
                {/* [P3-LOADING-PREMIUM-REDESIGN] Reemplaza el spinner doble-ring +
                    iconos rotando por UN solo punto con pulse sutil + un ring
                    delgado girando. Premium = menos. */}
                <div style={{
                    width: 64, height: 64, margin: '0 auto 2.5rem',
                    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div className="mf-spin" style={{
                        position: 'absolute', inset: 0, borderRadius: '50%',
                        border: '1.5px solid rgba(255,255,255,0.06)',
                        borderTopColor: 'rgba(255,255,255,0.55)',
                    }} />
                    <div className="mf-pulse" style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.85)',
                    }} />
                </div>

                {/* === TITLE === */}
                <h2 style={{
                    fontSize: '1.75rem', fontWeight: 600, marginBottom: '0.5rem',
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                }}>
                    Diseñando tu plan
                </h2>
                <p style={{
                    color: 'rgba(255,255,255,0.45)',
                    fontSize: '0.95rem', marginBottom: '2rem',
                    fontWeight: 400, letterSpacing: '0.005em',
                }}>
                    {steps[currentStep]?.text || 'Procesando...'}
                </p>

                {/* [P3-LOADING-TIME-ESTIMATE · 2026-05-16] Time estimate
                    + elapsed counter. Copy evoluciona según elapsedSec:
                    <30s estimate puro, 30s-5min tracking, 5-10min warning
                    suave, >10min mensaje de paciencia. Mostrado en una
                    fila monoespaciada sutil — informativo sin gritar.
                    Sin esto el usuario no sabe cuánto va a esperar y
                    asume que está colgado tras 1-2 min. */}
                <div
                    aria-live="polite"
                    style={{
                        color: 'rgba(255,255,255,0.62)',
                        fontSize: '0.82rem', marginBottom: '0.75rem',
                        fontWeight: 500, letterSpacing: '0.01em',
                        fontVariantNumeric: 'tabular-nums',
                        textAlign: 'center', maxWidth: '320px',
                        margin: '0 auto 0.75rem',
                    }}
                >
                    {timeMessage}
                </div>

                {/* [P3-PLAN-FLOW-MINIMALIST · 2026-05-15] Mensaje informativo
                    sobre el comportamiento deep-search (P1-DEEP-SEARCH-PIPELINE).
                    Comunica al usuario que puede cerrar la app y volver — el
                    plan se generará en background y aparecerá listo. Sin esto,
                    el usuario asume que necesita esperar 8-10 min mirando la
                    pantalla. */}
                <p style={{
                    color: 'rgba(255,255,255,0.55)',
                    fontSize: '0.85rem', marginBottom: '3rem',
                    fontWeight: 400, letterSpacing: '0.005em',
                    lineHeight: 1.55, maxWidth: '320px', margin: '0 auto 3rem',
                }}>
                    Puedes salir si quieres. Te avisamos cuando tu plan esté listo.
                </p>

                {/* === TIP — sutil, sin emoji === */}
                <div style={{
                    minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '0.5rem',
                }}>
                    <AnimatePresence mode="wait">
                        <motion.p
                            key={tipIndex}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.6 }}
                            style={{
                                color: 'rgba(255,255,255,0.32)', fontSize: '0.78rem',
                                fontWeight: 400, lineHeight: '1.5',
                                textAlign: 'center', maxWidth: '320px',
                            }}
                        >
                            {tips[tipIndex].replace(/^💡\s*/, '')}
                        </motion.p>
                    </AnimatePresence>
                </div>

                {/* === CANCEL BUTTON (single-click action) === */}
                {/* [P3-CANCEL-ONE-CLICK · 2026-05-16] Antes había un modal
                 * inline confirm "¿Cancelar la generación? Perderás el
                 * progreso actual." con botones Continuar/Sí cancelar.
                 * UX feedback: doble paso era fricción innecesaria — el
                 * botón cancelar está deliberadamente DISCRETO (texto-only,
                 * opacity 35%) y el user ya hizo el commit mental al
                 * clickearlo. Eliminado el modal: click directo dispara
                 * onCancel() + navigate. */}
                {onCancel && status !== 'ready' && status !== 'preview' && (
                    <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center' }}>
                        <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.15 }}
                            onClick={() => {
                                // [P3-CANCEL-FORCE-NAVIGATE] onCancel() aborta SSE + POST
                                // cancel backend + clear flag LS; navigate fuerza el redirect
                                // sin esperar al catch del SSE reader (que puede tardar si
                                // está bloqueado en reader.read()).
                                onCancel();
                                navigateCancel('/assessment', { replace: true });
                            }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'rgba(255,255,255,0.35)',
                                padding: '0.5rem 1rem',
                                fontSize: '0.78rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'color 0.2s',
                                letterSpacing: '0.01em',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
                            }}
                        >
                            Cancelar
                        </motion.button>
                    </div>
                )}

            </motion.div>
        </div>
    );
};

LoadingScreen.propTypes = { status: PropTypes.string, streamPhase: PropTypes.string, daysCompleted: PropTypes.array, onCancel: PropTypes.func };

export default Plan;