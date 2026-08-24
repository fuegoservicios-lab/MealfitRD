import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
// [P2-CHAT-TEXTAREA-AUTOSIZE · 2026-07-24] SSOT del alto del textarea.
import { useAutosizeTextarea, CHAT_TEXTAREA_MAX_HEIGHT_PX } from '../utils/autosizeTextarea';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAssessment } from '../context/AssessmentContext';
// [P1-AGENT-WELCOME-TRACKING · 2026-08-14] SSOT del modo (perfil → espejo local).
import { isTrackingMode, navItemsFor } from '../config/dashboardNav';
import { Send, Bot, Loader2, Paperclip, X, Image as ImageIcon, Plus, MessageSquare, History, Menu, Apple, Dumbbell, Utensils, Camera, Sparkles, Trash2, Check, Mic, PhoneCall, ArrowUp, ArrowDown, Square, ThumbsUp, ThumbsDown, RefreshCw, Copy, MoreVertical, LayoutDashboard, Clock, Settings, Edit2, Ghost, Refrigerator } from 'lucide-react';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
// [P3-LAZY-MARKDOWN · 2026-05-12] import de `react-markdown` eliminado:
// no se usa en este archivo. Pre-fix bundle includuía `react-markdown` +
// deps remark/mdast (~60KB gzip) en el chunk AgentPage por un import
// muerto. El uso real vive en MessageBubble + ChatWidget vía LazyMarkdown
// wrapper que mueve la lib a un chunk async separado.
import { MemoizedMessageBubble } from '../components/agent/MessageBubble';
// [P2-14 · 2026-07-09] Hook SSOT de viewport (antes useState + resize listener).
import { useMediaQuery } from '../hooks/useMediaQuery';
// [P3-BOT-AVATAR-3D · 2026-06-19] Avatar del agente = orbe 3D glossy de alto contraste.
import BotAvatar from '../components/agent/BotAvatar';
// [P1-CHAT-VIRTUALIZE · 2026-05-19] Lista virtualizada para sesiones
// >VIRTUALIZE_THRESHOLD mensajes (default 100).
// [P2-AGENT-VIRTUOSO-LAZY · 2026-05-31] El threshold se lee desde su módulo
// liviano y el componente pesado (arrastra react-virtuoso ~28KB gzip) se carga
// via lazy() SOLO cuando se cruza el umbral — fuera del chunk de AgentPage, que
// se monta keep-alive para todos los que abren el chat. Espejo de LazyMarkdown.
import { VIRTUALIZE_THRESHOLD } from '../components/agent/virtualizeThreshold';
const VirtualizedMessageList = lazy(() => import('../components/agent/VirtualizedMessageList'));
import { SidebarRecientes } from '../components/agent/SidebarRecientes';
import { safeJSONParse } from '../utils/safeJSONParse';
// [P2-NEW-LOCALSTORAGE-MIGRATION-DEBT · 2026-05-15] Ver ChatWidget.jsx para
// rationale (QuotaExceededError silente). Migración del setItem raw al
// helper P2-AUDIT-3 que atrapa errores y devuelve boolean.
import { safeLocalStorageSet, safeLocalStorageGet, safeLocalStorageRemove } from '../utils/safeLocalStorage';
import { resolverSesionDelDia, marcarActividad } from '../utils/chatSessionDay';
// [P2-CHAT-CACHE-XUSER · 2026-05-31] Keys del chat desde el módulo SSOT (mismas
// que _clearUserScopedCaches borra en logout/user-switch). Los aliases `_CHAT_*`
// viven a scope de MÓDULO (no de componente) a propósito: un const de componente
// asignado a un import lo trata react-hooks/exhaustive-deps como dependencia
// inestable; a scope de módulo es estable y no ensucia los deps arrays.
import { CHAT_MESSAGES_CACHE_KEY, CHAT_SESSIONS_CACHE_KEY } from '../utils/chatCacheKeys';
const _CHAT_SESSIONS_CACHE_KEY = CHAT_SESSIONS_CACHE_KEY;
const _CHAT_CACHE_KEY = CHAT_MESSAGES_CACHE_KEY;
import { emitCoherenceToast } from '../utils/renderCoherenceWarnings';
// [P1-CHAT-NARRATION-KEPT · 2026-07-28] Strip de tags UI_ACTION (SSOT
// compartida chunk/done) + reconciliación del payload `done` contra lo ya
// mostrado, en vez de blind-replace. Ver el módulo para el rationale completo.
import { stripUiActionTags, reconcileFinalChatText } from '../utils/chatStreamReconcile';
// [P3-AGENT-PREFILL · 2026-06-15] Pregunta pre-cargada desde el dashboard
// (p.ej. tocar un micronutriente → "¿cómo subo mi fibra?").
import { consumeAgentPrefill, AGENT_PREFILL_EVENT } from '../utils/agentPrefill';
// [P2-AGENTPAGE-ERROR-SENTRY · 2026-05-15] Capture estructurada de los catch
// blocks del agent page. ANTES: solo `console.error(...)` — esbuild conserva
// el call pero el output queda en DevTools del cliente, NO en Sentry; los
// crashes mid-chat (network, token expiry, server 5xx) eran invisibles en
// observabilidad backend. Best-effort try/catch para que un Sentry KO no
// rompa el caller.
// [P2-SENTRY-TREESHAKE · 2026-05-23] Named imports vs `import * as Sentry`.
// AgentPage solo usa `captureException` + `addBreadcrumb`; el star-import
// bloqueaba tree-shaking de los ~12 símbolos restantes del SDK.
// [P1-APEX-ENTRY-DIET · 2026-08-14] Vía la fachada. AgentPage es lazy, así que
// aquí no había peso en el entry — pero sí un hueco: con el `init` diferido, un
// `captureException` directo antes del arranque del SDK se perdía en silencio.
// La fachada lo encola. Además deja UNA sola puerta a `@sentry/*` en todo el
// árbol (`utils/sentryBoot.js`), que es lo que hace verificable la propiedad.
import { captureException, addBreadcrumb } from '../utils/observability';
import { medirTecladoDeVentana, insetEstabilizado, resolverPosicionTeclado } from '../utils/keyboardViewport';
import { useChatAttachments } from '../hooks/useChatAttachments';
import { useStableCallback } from '../hooks/useStableCallback';
import { CHAT_IMAGE_MAX_COUNT, mapWithConcurrency } from '../utils/chatImageProcessing';
import { isNativeApp } from '../config/platform';
import {
    chooseNativeChatImages,
    isNativePickerCancellation,
    takeNativeChatPhoto,
} from '../utils/nativeChatImagePicker';
import { AttachmentSourceSheet } from '../components/agent/AttachmentSourceSheet';
import { deleteChatDraft, loadChatDraft, saveChatDraft } from '../utils/chatDraftStore';
import { triggerMobileHaptic } from '../utils/mobileHaptics';
import Wordmark from '../components/common/Wordmark';
// [P1-I18N-DASHBOARD · 2026-08-15] `t` de módulo para los helpers que viven fuera
// de React (`_buildAgentErrorMessage`, `menuItemsDelAgente`); dentro del componente
// se usa `useT()`, que además suscribe al cambio de idioma.
import { t, useT } from '../i18n';

// [P3-I18N-MARCA-HORNEADA-EN-26-CLAVES] la marca entra como variable, no horneada en la clave.
import { BRAND } from '../data/routeMeta';
const _captureAgentPageException = (err, tags) => {
    try {
        captureException(err, {
            tags: { component: 'AgentPage', ...(tags || {}) },
        });
    } catch (_e) { /* swallow */ }
};

// [P3-CHAT-FOCUS-TELEM · 2026-05-19] Telemetría client-side de latencia
// del chat stream. Cierre del P3 pendiente del audit prod-readiness del
// Agente (2026-05-19): pre-fix el backend ciega ante UX real
// (latencia visible al usuario, retry count, errores de red). Acá
// emitimos como Sentry breadcrumb (NO captureMessage — saturaría cuota)
// + console.info estructurado para debug local.
//
// Métricas:
//   - ttfb_ms: time-to-first-chunk (latencia "el LLM empezó a responder")
//   - stream_total_ms: del fetch al `done` event
//   - chunk_count: total chunks SSE recibidos
//   - is_call_mode: feature flag (modo voz tiene budget de latencia distinto)
//   - session_id: bucket para análisis post-hoc en Sentry
//
// El breadcrumb aparece en próximo error de Sentry capturado, dando
// contexto sobre el último stream antes del fallo — útil para
// diagnosticar "el usuario reportó lentitud antes del crash".
const _emitChatPerfTelemetry = ({ ttfbMs, streamTotalMs, chunkCount, isCallMode, sessionId }) => {
    try {
        addBreadcrumb({
            category: 'chat',
            message: 'stream_completed',
            level: 'info',
            data: {
                ttfb_ms: typeof ttfbMs === 'number' ? Math.round(ttfbMs) : null,
                stream_total_ms: typeof streamTotalMs === 'number' ? Math.round(streamTotalMs) : null,
                chunk_count: chunkCount,
                is_call_mode: !!isCallMode,
                session_id: sessionId,
            },
        });
    } catch (_e) { /* swallow */ }
     
    console.info('[CHAT-PERF]', {
        ttfb_ms: typeof ttfbMs === 'number' ? Math.round(ttfbMs) : null,
        stream_total_ms: typeof streamTotalMs === 'number' ? Math.round(streamTotalMs) : null,
        chunk_count: chunkCount,
        is_call_mode: !!isCallMode,
        session_id: sessionId,
    });
};

// [P1-CHAT-ERROR-DIFF · 2026-05-19] Mapea status HTTP del backend a copy
// es-DO específico + flag retryable. Cierra el gap del audit 2026-05-19:
// pre-fix todos los fallos mostraban "❌ Error al comunicarse con la IA"
// sin distinguir entre timeout LLM (504 P0-CHAT-LLM-TIMEOUT, retryable
// inmediato), circuit breaker abierto (503 P1-CHAT-CB, retryable tras
// espera), quota mensual (402, NO retryable), auth (401/403, NO retryable)
// y network/offline (status=0, retryable). El frontend NO reintenta auto
// — preserva la decisión explícita del backend de "no amplificar la
// condición" (ver comentarios en routers/chat.py:631-654). El botón en
// MessageBubble da control al usuario.
//
// Telemetría: cada error pasa por _captureAgentPageException con tag
// `chat_error_status` para correlación Sentry. NO se loguea `detail` raw
// (puede incluir info sensible del backend); el copy mostrado al usuario
// es siempre el canónico es-DO.
// [P1-I18N-DASHBOARD · 2026-08-15] FUNCIÓN, no constante: un objeto de copy en
// ámbito de módulo se evalúa al importar — antes de que el catálogo cargue — y
// queda congelado en español para siempre (y en es-DO se ve bien, así que nadie
// lo nota). Se llama en cada `_buildAgentErrorMessage`.
const _agentErrorCopy = () => ({
    413: {
        icon: '📦',
        text: t('El mensaje o sus imágenes superan el límite. Acórtalo o quita una foto antes de enviarlo.'),
        retryable: false,
    },
    415: {
        icon: '🖼️',
        text: t('Una imagen no tiene un formato compatible. Quítala y elige otra foto.'),
        retryable: false,
    },
    504: {
        icon: '⏱',
        text: t('El asistente tardó más de la cuenta en responder. Puedes reintentar ahora.'),
        retryable: true,
    },
    503: {
        icon: '🚦',
        text: t('El asistente está temporalmente saturado. Espera unos segundos y reintenta.'),
        retryable: true,
    },
    429: {
        icon: '🚦',
        text: t('Demasiadas solicitudes seguidas. Espera un momento y reintenta.'),
        retryable: true,
    },
    402: {
        icon: '🔒',
        text: t('Llegaste al límite mensual de tu plan. Actualiza para seguir conversando.'),
        retryable: false,
    },
    401: {
        icon: '🔐',
        text: t('Tu sesión expiró. Vuelve a iniciar sesión para continuar.'),
        retryable: false,
    },
    403: {
        icon: '🔐',
        text: t('Tu sesión expiró. Vuelve a iniciar sesión para continuar.'),
        retryable: false,
    },
    0: {
        icon: '📡',
        text: t('Sin conexión al servidor. Verifica tu internet y reintenta.'),
        retryable: true,
    },
});

const _buildAgentErrorMessage = ({
    status,
    retryPrompt,
    retryImageUrl,
    retryAttachments,
    retryWithCurrentAttachments = false,
    retryTruncateIndex,
    clientMessageId,
    isAgentError,
    userMessage,
}) => {
    let entry = _agentErrorCopy()[status];
    if (!entry) {
        // 500/502/otros — copy genérico retryable. Server problem.
        entry = {
            icon: '⚠',
            text: isAgentError
                ? t('El asistente tuvo un problema procesando tu mensaje. Puedes reintentar.')
                : t('El servidor tuvo un problema inesperado. Puedes reintentar en un momento.'),
            retryable: true,
        };
    }
    _captureAgentPageException(new Error(`chat_error_status_${status}`), {
        chat_error_status: String(status),
        chat_error_kind: isAgentError ? 'agent_stream' : 'http',
    });
    if (userMessage) entry = { ...entry, text: userMessage };
    const canRetry = entry.retryable && Boolean(
        retryPrompt || retryImageUrl || retryAttachments?.length || retryWithCurrentAttachments
    );
    return {
        role: 'model',
        content: `${entry.icon} ${entry.text}`,
        errorType: status === 0 ? 'network' : `http_${status}`,
        errorStatus: status,
        retryable: canRetry,
        retryPrompt: canRetry ? retryPrompt : null,
        retryImageUrl: canRetry ? retryImageUrl : null,
        retryAttachments: canRetry ? retryAttachments : null,
        retryWithCurrentAttachments: canRetry && retryWithCurrentAttachments,
        retryTruncateIndex: canRetry ? retryTruncateIndex : undefined,
        clientMessageId: canRetry ? clientMessageId : undefined,
        _isErrorBubble: true,
    };
};

const _durableRetryAttachments = (items) => (items || []).map((item) => ({
    id: item.attachment_id || item.id,
    attachment_id: item.attachment_id,
    url: item.url || item.image_url,
    image_url: item.image_url,
    description: item.description,
    kind: item.kind,
    content_type: item.content_type || item.file?.type,
    name: item.name || item.file?.name || item.sourceFile?.name,
    status: 'ready',
})).filter((item) => item.url || item.attachment_id);

// [P2-FETCH-RETRY-ADAPTIVE · 2026-05-19] Política de reintento por tipo
// de error para `fetchSessionMessages`. Pre-fix: hardcoded `retryCount < 2`
// con delays fijos (800ms para 4xx, 600ms para network) sin diferenciar
// entre token-hydration (401/403, retryable), errores transitorios del
// server (5xx, retryable), rate-limit (429, retryable con baseDelay
// alto), y 4xx genuinos (404, 400, etc — NO retryable, son bugs).
//
// Backoff exponencial con jitter ±10% evita thundering herd cuando
// múltiples clientes recargan tras un downtime del backend.
//
// maxRetries por bucket:
//   - network (fetch fail / offline): 3 — la conexión puede estabilizarse
//   - 401/403 (token hydration): 2 — suficiente para que el Authorization
//     header se actualice tras login fresco
//   - 5xx (server error): 3 — transitorio, ej. cold-start del backend
//   - 429 (rate-limit): 2 — baseDelay alto (2s) respeta el rate-limit
//   - 4xx restantes: 0 — son bugs del cliente, reintentar no resuelve.
const _classifyFetchSessionRetry = (status, isNetworkError) => {
    if (isNetworkError) return { retryable: true, maxRetries: 3, baseDelayMs: 500 };
    if (status === 401 || status === 403) return { retryable: true, maxRetries: 2, baseDelayMs: 600 };
    if (typeof status === 'number' && status >= 500 && status < 600) {
        return { retryable: true, maxRetries: 3, baseDelayMs: 800 };
    }
    if (status === 429) return { retryable: true, maxRetries: 2, baseDelayMs: 2000 };
    return { retryable: false, maxRetries: 0, baseDelayMs: 0 };
};

const _computeFetchBackoffMs = (baseDelayMs, attempt) => {
    // Exponencial: base * 2^attempt + jitter ±10%
    const exp = baseDelayMs * Math.pow(2, attempt);
    const jitter = exp * (Math.random() * 0.2 - 0.1);
    return Math.max(100, Math.round(exp + jitter));
};

/**
 * [P1-AGENT-MENU-SSOT · 2026-08-14] Los destinos del menú de 3 puntos, derivados
 * de la MISMA SSOT que la nav del dashboard.
 *
 * Aquí vivía un array literal con «Plan» y «Recetas» fijos, así que en modo
 * contador ofrecía dos salidas que la nav real oculta a propósito. En el teléfono
 * este menú ES la navegación del Agente, y `/dashboard/recipes` no tiene guard de
 * modo propio (solo `ProtectedRoute`): la ruta carga igual. Era la vía de entrada.
 *
 * La SSOT decide qué entradas existen y cómo se rotulan; aquí solo se aplican las
 * dos diferencias de ESTA superficie: fuera «Agente» (es la página actual) y
 * dentro «Configuración», que no navega sino que abre ventana (P1-SETTINGS-DIALOG)
 * para que la conversación siga detrás y no se desmonte.
 */
export const menuItemsDelAgente = (enModoContador) => {
    const iconoPorKey = {
        plan: LayoutDashboard,
        pantry: Refrigerator,
        recipes: Utensils,
        history: Clock,
    };
    return [
        ...navItemsFor({ trackingMode: enModoContador })
            .filter((i) => i.key !== 'agent')
            .map((i) => ({ icon: iconoPorKey[i.key], label: i.label, path: i.path })),
        { icon: Settings, label: t('Configuración'), path: '/dashboard/settings', asDialog: true },
    ];
};

// [P1-AGENT-WELCOME-TRACKING · 2026-08-14] Exportada con nombre para poder
// testear el gate del modo sin montar el componente entero (~3.800 líneas).
export const generateIntelligentWelcome = (userProfile, formData, planData) => {
    const nameStr = formData?.name || userProfile?.name || userProfile?.first_name || '';
    const nameParts = nameStr.split(' ');
    const firstName = nameParts[0] ? ' ' + nameParts[0] : '';

    const now = new Date();
    const hour = now.getHours();

    // [P2-AGENT-WELCOME-I18N · 2026-08-19] El welcome es INTERFAZ templada client-side,
    // no prosa del LLM — se traduce con t() como el resto del dashboard (el usuario
    // reportó el saludo automático en español con la app en inglés). Los NOMBRES de
    // platos ({plato}) siguen en español: son identificadores del sistema, la misma
    // frontera dura del coach (Addendum §2).
    let timeGreeting = t('¡Hola');
    if (hour >= 0 && hour < 5) timeGreeting = t('¡Buenas madrugadas');
    else if (hour >= 5 && hour < 12) timeGreeting = t('¡Buenos días');
    else if (hour >= 12 && hour < 19) timeGreeting = t('¡Buenas tardes');
    else timeGreeting = t('¡Buenas noches');

    let mealContext = '';

    // Cycle and exact meal logic safely
    let rawStartDate = planData?.grocery_start_date || planData?.created_at;
    let cycleDayNum = 1;
    let exactMealName = '';
    let isPlanExpired = false;

    if (planData && rawStartDate) {
        // iOS Safari Safe Date Parsing replacing space with T
        const safeDateStr = typeof rawStartDate === 'string' ? rawStartDate.replace(' ', 'T') : rawStartDate;
        const startMidnight = new Date(safeDateStr);

        if (!isNaN(startMidnight.getTime())) {
            startMidnight.setHours(0, 0, 0, 0);
            const todayMidnight = new Date();
            todayMidnight.setHours(0, 0, 0, 0);
            const diff = Math.round((todayMidnight - startMidnight) / (1000 * 60 * 60 * 24));

            const groceryDuration = formData?.groceryDuration || 'weekly';
            let maxDays = 7;
            if (groceryDuration === 'weekly') maxDays = 7;
            else if (groceryDuration === 'biweekly') maxDays = 15;
            else if (groceryDuration === 'monthly') maxDays = 30;

            if (diff >= maxDays) isPlanExpired = true;
            cycleDayNum = Math.min(Math.max(1, diff + 1), maxDays);
        }
    }

    // Explicit logical meal intervals
    let mealKeyword = '';
    if (hour >= 0 && hour < 5) mealKeyword = 'madrugada';
    else if (hour >= 5 && hour < 11) mealKeyword = 'desayuno';
    else if (hour >= 11 && hour < 12) mealKeyword = 'snack';
    else if (hour >= 12 && hour < 15) mealKeyword = 'almuerzo';
    else if (hour >= 15 && hour < 19) mealKeyword = 'snack';
    else mealKeyword = 'cena';

    // [P1-AGENT-WELCOME-TRACKING · 2026-08-14] En modo CONTADOR el saludo no
    // recita el plan. La pausa CONSERVA `plan_data` a propósito (es lo que
    // permite «Reanudar» sin regenerar), así que para este gate un plan pausado
    // y uno activo eran indistinguibles: con la generación desactivada, el
    // agente abría con «De cena para hoy tienes: …» — la comida de un plan que
    // el usuario pausó, presentada como si gobernara el día. Contradice
    // P1-TRACKING-WINS (la elección explícita de tracking gana).
    //
    // Se consulta el MISMO SSOT que la nav del dashboard (`isTrackingMode`,
    // config/dashboardNav.js) — perfil primero, espejo de localStorage después —
    // en vez de reimplementar el modo aquí, que es como nacen las 4ªs tablas.
    // Con `exactMealName` vacío, cada franja cae a sus variantes genéricas
    // («¿Ya sabes qué vas a cenar?»): coaching de contador, que ya existía.
    const enModoContador = isTrackingMode(userProfile, planData);

    if (planData && !isPlanExpired && !enModoContador && mealKeyword !== 'madrugada') {
        const planDays = planData?.days || [{ day: 1, meals: planData?.meals || planData?.perfectDay || [] }];
        if (planDays.length > 0 && !isNaN(cycleDayNum)) {
            const activeDayIndex = (cycleDayNum - 1) % planDays.length;
            const currentDayMeals = planDays[activeDayIndex]?.meals || [];

            // Search by m.meal field (type: "Desayuno") NOT by m.name (dish: "Mangú con Huevo")
            let exactMeal = null;
            if (mealKeyword === 'desayuno') {
                exactMeal = currentDayMeals.find(m => m?.meal?.toLowerCase().includes('desayuno'));
            } else if (mealKeyword === 'almuerzo') {
                exactMeal = currentDayMeals.find(m => m?.meal?.toLowerCase().includes('almuerzo'));
            } else if (mealKeyword === 'cena') {
                exactMeal = currentDayMeals.find(m => m?.meal?.toLowerCase().includes('cena'));
            } else {
                exactMeal = currentDayMeals.find(m => m?.meal?.toLowerCase().includes('snack') || m?.meal?.toLowerCase().includes('merienda'));
            }

            if (exactMeal && exactMeal.name) {
                exactMealName = exactMeal.name.trim();
            }
        }
    }

    if (mealKeyword === 'madrugada') {
        const variants = [
            t('Veo que sigues despierto, ¡recuerda que el buen descanso es clave para tu progreso! Si necesitas ayuda con algo, aquí estoy.'),
            t('A esta hora lo ideal es descansar, así que no te recomendaré comidas pesadas. ¡Cuéntame si puedo ayudarte en algo más!'),
            t('¿Despierto hasta tarde? Si de verdad tienes hambre y necesitas algo súper ligero, pregúntame para no alterar tu meta.')
        ];
        mealContext = variants[Math.floor(Math.random() * variants.length)];
    } else if (mealKeyword === 'desayuno') {
        const variants = exactMealName ? [
            t('Según tu plan, hoy te toca **{plato}** de desayuno, ¿tienes los ingredientes listos o armamos una alternativa rápida?', { plato: exactMealName }),
            t('Para desayunar hoy tienes marcado **{plato}**. ¡Cuéntame si ya lo preparaste o si quieres cambiar algo!', { plato: exactMealName }),
            t('Tu desayuno sugerido de hoy es **{plato}**. ¿Preparado para arrancar el día con energía?', { plato: exactMealName })
        ] : [
            t('¿Listo para tu desayuno o necesitas una idea rápida?'),
            t('¡Es hora de desayunar! ¿Ya sabes qué vas a preparar?'),
            t('¿Qué tienes pensado para el desayuno de hoy? Si no sabes, ¡te ayudo!')
        ];
        mealContext = variants[Math.floor(Math.random() * variants.length)];
    } else if (mealKeyword === 'almuerzo') {
        const variants = exactMealName ? [
            t('Hoy de almuerzo tienes marcado **{plato}**. ¿Ya lo preparaste o necesitas cambiar algo con los ingredientes que tienes?', { plato: exactMealName }),
            t('Es la hora del almuerzo y te toca **{plato}**. ¿Te ayudo con la receta o tienes un plan distinto?', { plato: exactMealName }),
            t('Para tu almuerzo de hoy está planeado **{plato}**. ¡Avisa si necesitas reemplazar algún ingrediente!', { plato: exactMealName })
        ] : [
            t('¿Preparando ya el almuerzo o necesitas una receta rápida?'),
            t('¡Llegó la hora de almorzar! ¿Qué vas a preparar?'),
            t('¿Necesitas ideas para tu comida del mediodía? Dime qué hay en tu nevera.')
        ];
        mealContext = variants[Math.floor(Math.random() * variants.length)];
    } else if (mealKeyword === 'cena') {
        const variants = exactMealName ? [
            t('De cena para hoy tienes: **{plato}**. ¿Quieres que te pase las instrucciones paso a paso o prefieres otra cosa?', { plato: exactMealName }),
            t('Para cerrar el día, tu cena sugerida es **{plato}**. ¿Qué te parece?', { plato: exactMealName }),
            t('Tu cena de hoy será **{plato}**. ¡Si necesitas hacerlo más fácil o cambiar ingredientes, estoy aquí!', { plato: exactMealName })
        ] : [
            t('¿Buscando algo ligero antes de dormir o tu cena completa?'),
            t('¡Es hora de cenar! ¿Ya sabes qué harás?'),
            t('¿Qué cenaremos hoy? Dime tus opciones y te recomiendo algo rápido.')
        ];
        mealContext = variants[Math.floor(Math.random() * variants.length)];
    } else {
        // snack
        const variants = exactMealName ? [
            t('Es hora de tu snack o merienda: **{plato}**. Si no lo tienes, dime qué hay en tu refri y lo resolvemos.', { plato: exactMealName }),
            t('Para tu merienda te toca **{plato}**. ¿Listo para disfrutarla?', { plato: exactMealName }),
            t('Tu snack sugerido es **{plato}**. ¡Cuéntame si prefieres otra opción dulce o salada!', { plato: exactMealName })
        ] : [
            t('¿Necesitas un buen snack para calmar el hambre?'),
            t('¡Hora de una merienda rápida! ¿Quieres ideas?'),
            t('¿Qué te provoca de snack ahora mismo? Tengo varias opciones.')
        ];
        mealContext = variants[Math.floor(Math.random() * variants.length)];
    }

    let goalContext = '';
    // Schema field is "main_goal", with fallbacks for legacy data
    const goalField = planData?.main_goal || planData?.goal || planData?.objective || '';
    if (goalField) {
        const lowerGoal = goalField.toLowerCase();
        let goalText = '';
        if (lowerGoal.includes('pérdida') || lowerGoal.includes('peso') || lowerGoal.includes('déficit') || lowerGoal.includes('bajar')) goalText = t('bajar de peso');
        else if (lowerGoal.includes('músculo') || lowerGoal.includes('masa') || lowerGoal.includes('ganar')) goalText = t('ganar masa muscular');
        else if (lowerGoal.includes('mantenimiento') || lowerGoal.includes('mantener')) goalText = t('mantenerte en forma');
        else if (lowerGoal.includes('recomp')) goalText = t('recomponer tu cuerpo');

        if (goalText) {
            goalContext = t('Seguimos enfocados en tu meta de {meta}. ', { meta: goalText });
        }
    }

    // [P1-AGENT-WELCOME-NO-TIME · 2026-05-20] Removida la hora literal
    // ("Son las 04:29 a. m..") del welcome. Razón UX: el welcome se
    // regenera cada 30min (no en cada navegación), por lo que la hora
    // mostrada podría desfasarse ±30min de la hora real y se ve raro
    // ("dice 04:29 pero son las 04:55"). El `timeGreeting` ya da
    // contexto temporal grueso ("Buenas madrugadas/días/tardes/noches")
    // sin precisión innecesaria.
    return `${timeGreeting}${firstName}! ${goalContext}${mealContext}`.trim().replace(/\s+/g, ' ');
};

const AgentPage = () => {
    // [P1-I18N-DASHBOARD · 2026-08-15] El hook (y no el `t` de módulo importado
    // arriba) es lo que suscribe a este componente al cambio de idioma.
    const t = useT();
    const { session, planData, formData, updateData, saveGeneratedPlan, userProfile, checkPlanLimit, restoreSessionData } = useAssessment();
    // [P1-AGENT-MENU-SSOT · 2026-08-14] El modo, en el scope del COMPONENTE. El
    // saludo tiene su propio cálculo porque es una función pura fuera de React;
    // el menú se pinta aquí dentro y necesita el suyo. Mismo SSOT, dos ámbitos.
    const enModoContador = isTrackingMode(userProfile, planData);
    const navigate = useNavigate();
    // [P1-SETTINGS-DIALOG · 2026-08-10] Ubicación de fondo para abrir la
    // configuración como ventana sin desmontar la conversación.
    const location = useLocation();
    const isAgentRouteActive = location.pathname.startsWith('/dashboard/agent');
    const [titlePollCount, setTitlePollCount] = useState(0);
    const [showNavMenu, setShowNavMenu] = useState(false);
    const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine !== false);
    const navMenuRef = useRef(null);
    const navMenuTriggerRef = useRef(null);
    const inputWrapperRef = useRef(null);
    const scrollToBottomRef = useRef(null);
    // [P1-CHAT-KB-SCROLL-QUIETO · 2026-08-23] Estado de la histéresis del inset: qué se
    // aplicó y si el teclado estaba abierto. En refs y no en estado de React porque los
    // lee un handler de visualViewport que no debe provocar renders.
    const insetAplicadoRef = useRef(null);
    const tecladoAbiertoRef = useRef(false);
    // Un toque iniciado dentro del compositor no puede activar el cierre por blur
    // antes de que termine el click: movería el botón bajo el dedo y Safari lo cancela.
    const composerPointerDownRef = useRef(false);
    // [P1-KB-CERROJO-DE-CIERRE] Activo desde que el campo pierde el foco hasta que la
    // geometria confirma que el teclado se fue. Ver el porque, medido, en el handler.
    const cerrandoRef = useRef(false);

    // IsMobile detection para asegurar sobrescritura inline a prueba de fallos de iOS
    // [P2-14 · 2026-07-09] Hook SSOT (antes useState + resize listener local).
    // 1024px es el breakpoint deliberado de esta página (colapso del sidebar).
    const isMobile = useMediaQuery('(max-width: 1024px)');

    useEffect(() => {
        const markOnline = () => setIsOnline(true);
        const markOffline = () => setIsOnline(false);
        window.addEventListener('online', markOnline);
        window.addEventListener('offline', markOffline);
        return () => {
            window.removeEventListener('online', markOnline);
            window.removeEventListener('offline', markOffline);
        };
    }, []);

    // Close nav menu on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (navMenuRef.current && !navMenuRef.current.contains(e.target)) {
                setShowNavMenu(false);
            }
        };
        if (showNavMenu) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showNavMenu]);

    useEffect(() => {
        if (!showNavMenu) return undefined;
        const items = () => Array.from(navMenuRef.current?.querySelectorAll('[role="menuitem"]') || []);
        const frame = requestAnimationFrame(() => items()[0]?.focus());
        const handleMenuKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setShowNavMenu(false);
                navMenuTriggerRef.current?.focus();
                return;
            }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            const options = items();
            if (!options.length) return;
            event.preventDefault();
            const current = Math.max(0, options.indexOf(document.activeElement));
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            options[(current + direction + options.length) % options.length].focus();
        };
        document.addEventListener('keydown', handleMenuKeyDown);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('keydown', handleMenuKeyDown);
        };
    }, [showNavMenu]);

    // [MOBILE-KEYBOARD-LIFT] Eleva el input wrapper sobre el teclado iOS.
    // Sin esto, el `position: sticky` no responde al keyboard porque iOS Safari
    // mueve el "visual viewport" (donde el usuario VE) pero no el "layout
    // viewport" (donde CSS posiciona). Solución: listen a window.visualViewport
    // y aplicar transform: translateY(-offset) al wrapper, replicando el
    // patrón de Gemini/ChatGPT/Claude en mobile.
    useEffect(() => {
        const root = typeof document !== 'undefined' ? document.documentElement : null;
        const resetViewportState = () => {
            root?.removeAttribute('data-kb-open');
            const contenedor = inputWrapperRef.current?.closest('.agent-container');
            if (contenedor) contenedor.style.setProperty('--kb-inset', '0px');
            if (inputWrapperRef.current) inputWrapperRef.current.style.transform = '';
            insetAplicadoRef.current = 0;
            tecladoAbiertoRef.current = false;
            cerrandoRef.current = false;
        };

        // AgentPage queda montado con display:none entre rutas. Sus listeners y atributos
        // globales, en cambio, seguirian activos si no los acotamos a la ruta visible.
        if (!isAgentRouteActive) {
            resetViewportState();
            return undefined;
        }
        if (typeof window === 'undefined' || !window.visualViewport) {
            resetViewportState();
            return undefined;
        }
        const vv = window.visualViewport;

        const updateInputPosition = (forzarMedicion = false) => {
            const wrapper = inputWrapperRef.current;
            if (!wrapper) return;
            const contenedor = wrapper.closest('.agent-container');
            // [P1-KB-VIEWPORT-MATH · 2026-08-23] DOS números, no uno. `kb` (alto real del
            // teclado, independiente del paneo de iOS) responde «¿hay teclado?»; `layoutInset`
            // (kb - paneo) responde «cuánto encoger este contenedor, que está anclado al
            // layout viewport». Antes era UN escalar `H - vv.height - vv.offsetTop` haciendo
            // las dos cosas: correcto como longitud, y 0 como predicado justo cuando iOS
            // había panéado del todo — o sea «no hay teclado» con el teclado en pantalla.
            // Y esta ruta FABRICA ese caso: es la única del dashboard que bloquea el scroll
            // del documento, y sin recorrido iOS no puede hacer otra cosa que panear.
            // La aritmética y sus casos viven en utils/keyboardViewport.js (+ su test).
            const { layoutInset, abierto: abiertoMedido, documentoEncoge } = medirTecladoDeVentana(window);
            // [P1-KB-CERROJO-DE-CIERRE · 2026-08-23] MEDIDO con la sonda en el iPhone del
            // dueño (8:11). Al cerrar, la secuencia real es:
            //     blur    kb=337  cont=366   ← suelta el campo
            //     scroll  kb=337  cont=699   ← el blur ya restauró el contenedor
            //     resize  kb=0    cont=362   ← ¡ESTE lo vuelve a encoger!
            //     scroll  kb=0    cont=699   ← y sólo aquí queda bien
            // El evento que llega DURANTE la animación trae la geometría vieja (kb=337, el
            // teclado todavía en pantalla), así que `abierto` sigue siendo cierto y el
            // contenedor se encoge otra vez. Ese ida y vuelta ES el retraso que se ve.
            //
            // El cerrojo: desde el `blur` y hasta que la geometría confirme el cierre, el
            // teclado se considera cerrado pase lo que pase. No es «ignorar medidas»: es
            // que el foco ya respondió a la pregunta y la geometría todavía está llegando.
            // Se libera sola cuando `kb` baja del umbral, así que un teclado que NO se
            // cierre (cambio de campo) no queda atrapado en el estado equivocado.
            if (cerrandoRef.current && !abiertoMedido) cerrandoRef.current = false;
            const abierto = cerrandoRef.current ? false : abiertoMedido;
            // [P2-CHAT-TEXTAREA-AUTOSIZE · 2026-07-24] Este handler escribe SOLO
            // `transform` — propiedad que React NO declara en el prop `style` del
            // wrapper, así que no hay dos dueños.
            //
            // Antes también hacía `paddingBottom='0.5rem'` con el teclado abierto y
            // `paddingBottom=''` al cerrarlo. Ese "restaurar" era falso: React pone
            // el padding con el SHORTHAND (`padding: 1.5rem 3rem …`), y limpiar el
            // longhand no devuelve el valor del shorthand — lo ELIMINA (verificado:
            // 24px → 0px). Como el handler corre también al montar, el wrapper se
            // quedaba sin padding-bottom en desktop (rompía en silencio el centrado
            // de P3-AGENT-INPUT-CENTER) y sólo volvía cuando React reescribía el
            // shorthand por un flip de `isCentered`/`isMobile` — hasta el siguiente
            // evento de visualViewport. Misma clase de fallo que el alto del
            // textarea: inline style imperativo peleando con el que React posee.
            //
            // El colapso del padding con teclado abierto lo cubre CSS sin tocar el
            // inline: `html[data-kb-open] .input-wrapper` en el bloque
            // `@media (max-width: 1024px)`.
            //
            // [P1-CHAT-FOCO-NO-MUEVE · 2026-08-23] Antes ese colapso colgaba de
            // `:focus-within`, y eso era una SUPOSICIÓN disfrazada de mecanismo: «el
            // teclado sólo se abre con el foco dentro del wrapper» es cierto al revés
            // — hay foco SIN teclado (escritorio estrechado por debajo de 1024, la vista
            // de móvil de las DevTools, un iPad con teclado físico). En esos casos la
            // caja soltaba sus 64 px de reserva y la barra de pestañas, que sólo se
            // esconde con teclado DE VERDAD, seguía ahí: medido, el borde inferior de
            // la caja pasaba de 851 a 915 con la barra en 868, o sea DEBAJO de ella.
            // Ahora las dos cosas cuelgan de la misma señal y se mueven juntas o no se
            // mueve ninguna.
            // [P1-CHAT-KEYBOARD-FIT · 2026-08-10] Antes esto desplazaba el wrapper con
            // un transform vertical: subía la caja de escribir por encima
            // del teclado, pero el CONTENEDOR seguía midiendo 100dvh —y `dvh` en iOS
            // no encoge con el teclado—, así que el input tapaba los últimos mensajes
            // en vez de dejarles sitio. Se movía dónde se escribe, no dónde se lee.
            //
            // Ahora el contenedor RESTA el alto del teclado y todo lo de dentro
            // (lista + input) se recoloca solo. La variable se escribe en el propio
            // contenedor y no en :root porque esta página sobrevive oculta con
            // display:none al navegar (P1-AGENT-KEEP-ALIVE): escribir una variable
            // global desde un componente invisible contaminaría el alto de las demás
            // rutas del dashboard.
            // [P1-CHAT-KB-SCROLL-QUIETO · 2026-08-23] El inset pasa por la histéresis del
            // SSOT: durante el scroll con teclado abierto iOS panea, `layoutInset` cambia
            // en cada fotograma y la caja se despegaba del teclado y volvía. Ver
            // `insetEstabilizado` para el porqué de no eliminar la compensación.
            if (contenedor) {
                // [P1-KB-PWA-COMPOSER-LIFT · 2026-08-24] En la PWA `100dvh` ya
                // descontó el teclado principal, pero el Form Assistant queda encima del
                // compositor. El resolvedor da un solo dueño: PWA mueve directamente la
                // caja; Safari encoge el contenedor con su layoutInset. Nunca ambos.
                const posicion = resolverPosicionTeclado(window, {
                    abierto,
                    layoutInset,
                });
                // [P1-KB-RESIZES-CONTENT] Si el NAVEGADOR redimensiona el layout viewport
                // (`interactive-widget=resizes-content`, o la PWA instalada), el alto ya lo
                // resuelve `100dvh` con la animacion del sistema: el objetivo es 0 y hay que
                // aplicarlo YA. Pasarlo por la histeresis solo podria retrasarlo, y ese
                // retraso es justo lo que el dueno ve al cerrar el teclado.
                const aplicado = insetEstabilizado(insetAplicadoRef.current, posicion.containerInset, {
                    abierto,
                    estabaAbierto: tecladoAbiertoRef.current,
                    forzar: forzarMedicion || documentoEncoge,
                });
                insetAplicadoRef.current = aplicado;
                tecladoAbiertoRef.current = abierto;
                contenedor.style.setProperty('--kb-inset', `${aplicado}px`);
                wrapper.style.transform = posicion.composerLift > 0
                    ? `translateY(-${posicion.composerLift}px)`
                    : '';
            }
            // [P1-CHAT-KEYBOARD-TABBAR · 2026-08-23] Con teclado abierto la barra de pestañas
            // (fixed) la recoloca iOS justo encima del teclado y tapa la caja de escribir,
            // que reserva sus 64 px por dentro. Señal en <html>: la barra se esconde y la
            // caja suelta la reserva (CSS en BottomTabBar.module.css y en este <style>).
            root.toggleAttribute('data-kb-open', abierto);
            // Al abrirse el teclado el área visible se reduce: sin esto, el último
            // mensaje queda fuera de cuadro justo cuando el usuario va a responder.
            // [P1-KB-VIEWPORT-MATH] Traer la cola a cuadro al abrirse el teclado, pero NO
            // si el usuario está leyendo más arriba: arrastrarlo al último mensaje por
            // haber tocado la caja rompe el contrato de P2-CHAT-SCROLL-RACE
            // (`userScrolledUpRef`, ver scrollToBottom). `scrollIntoView` y no
            // `scrollTop`: en sesiones largas la lista está virtualizada y el contenedor
            // es `overflow: hidden` — escribirle scrollTop no hace nada.
            if (abierto && !userScrolledUpRef.current) scrollToBottomRef.current?.(false, 'auto');
        };

        // [P2-CHAT-KB-ASIENTO · 2026-08-23] Una medición MÁS, cuando el teclado ya paró.
        //
        // iOS emite `resize`/`scroll` del visual viewport DURANTE la animación de apertura
        // (~250 ms), y el último evento puede llegar ANTES de que la geometría quede
        // firme. Si eso pasa, `--kb-inset` y `data-kb-open` se quedan con el valor de un
        // fotograma intermedio y NADA vuelve a corregirlos: no hay más eventos hasta que
        // el usuario cierre el teclado. Ese es el modo de fallo que el dueño describe como
        // «a veces se abre mal» — intermitente porque depende de dónde caiga el último
        // evento, no de lo que haga el usuario.
        //
        // El asiento es una re-medición en la cola tras 350 ms de silencio. Es idempotente
        // (si la geometría ya era la buena, no cambia nada) y barata (un timer, no un
        // sondeo). NO sustituye a los eventos: los complementa.
        let asiento = null;
        const alEvento = () => {
            updateInputPosition();
            if (asiento) clearTimeout(asiento);
            // [P1-KB-RESIZES-CONTENT · 2026-08-23] El asiento existe para la geometria que
            // el JS persigue. Cuando el navegador redimensiona el layout por su cuenta no
            // hay nada que perseguir: el contenedor ya vale lo que debe en el mismo frame,
            // y una re-medicion 350 ms despues solo puede llegar tarde y mover algo que ya
            // estaba quieto. Se programa SOLO en el camino antiguo (iOS que panea).
            asiento = setTimeout(() => { asiento = null; updateInputPosition(true); }, 350);
        };

        // [P1-KB-CIERRE-SIN-ESPERA · 2026-08-23] «Cuando lo cierro es lento.»
        //
        // El estado «hay teclado» se decide por GEOMETRÍA (`kb >= 120`), y al cerrarse iOS
        // recorre la animación entera pasando por altos intermedios: 508 → 600 → 700 → 844.
        // Hasta el último fotograma `kb` sigue por encima del umbral, así que la barra de
        // pestañas y el relleno de la caja se restauran AL FINAL — se ve como un retraso.
        //
        // El foco lo sabe antes: sin un campo editable enfocado NO hay teclado virtual.
        // Ojo, es la CONTRAPOSITIVA, y sólo ella: P1-CHAT-FOCO-NO-MUEVE prohíbe lo
        // contrario —deducir que HAY teclado porque hay foco— porque eso sí es falso
        // (escritorio estrechado, DevTools, iPad con teclado físico). «Sin foco ⇒ sin
        // teclado» no tiene contraejemplo.
        //
        // Si el foco salta de un campo a otro el teclado NO se va: ahí no se toca nada.
        // Y si algo raro pasara, el siguiente evento del viewport lo corrige solo, porque
        // `updateInputPosition` reescribe el atributo con lo que mida.
        const alPerderElFoco = (e) => {
            const destino = e.relatedTarget;
            // [P0-CHAT-COMPOSER-TAP · 2026-08-24] En iOS, pointerdown sobre +/Enviar
            // puede desenfocar el textarea antes del click. Si restauramos aquí el
            // transform, el compositor baja 100 px entre pointerdown y pointerup y el
            // navegador cancela el click. El viewport confirmará después si el teclado
            // realmente se cerró; durante el gesto la posición debe permanecer quieta.
            if (composerPointerDownRef.current || (destino && inputWrapperRef.current?.contains(destino))) {
                return;
            }
            if (destino && (destino.tagName === 'TEXTAREA' || destino.tagName === 'INPUT' || destino.isContentEditable)) {
                return; // cambia de campo: el teclado sigue
            }
            cerrandoRef.current = true;
            root?.removeAttribute('data-kb-open');
            insetAplicadoRef.current = 0;
            tecladoAbiertoRef.current = false;
            const contenedor = inputWrapperRef.current?.closest('.agent-container');
            if (contenedor) contenedor.style.setProperty('--kb-inset', '0px');
            if (inputWrapperRef.current) inputWrapperRef.current.style.transform = '';
        };

        vv.addEventListener('resize', alEvento);
        vv.addEventListener('scroll', alEvento);
        document.addEventListener('focusout', alPerderElFoco);
        updateInputPosition();
        return () => {
            document.removeEventListener('focusout', alPerderElFoco);
            if (asiento) clearTimeout(asiento);
            vv.removeEventListener('resize', alEvento);
            vv.removeEventListener('scroll', alEvento);
            // Cambiar de ruta con el teclado abierto no debe dejar la barra escondida.
            resetViewportState();
        };
    }, [isAgentRouteActive]);

    const [localSessionId, setLocalSessionId] = useState(() => {
        // [P1-AGENT-LAZY-INIT-PRIVATE-MODE · 2026-05-24] safeLocalStorageGet
        // vs raw localStorage.getItem. En iOS Private Mode el getter lanza
        // SecurityError durante mount → throw en lazy init → AgentPage entero
        // no rendea → cae al GlobalErrorBoundary. Mismo modo de fallo que
        // P1-PROD-FINAL-1 cerró en Settings/Dashboard lazy initializers;
        // AgentPage quedó fuera del scope original. El sibling `guestSessionIds`
        // abajo también se migró a safeLocalStorageGet (2026-06-01): su try/catch
        // P2-B solo cubría JSON.parse, NO el SecurityError del propio getItem.
        const saved = safeLocalStorageGet('mealfit_guest_session', null);
        if (saved) return saved;
        const newId = crypto.randomUUID();
        safeLocalStorageSet('mealfit_guest_session', newId);
        return newId;
    });

    // `_guestSessionIds` (prefijo _): el valor no se lee, pero el lazy initializer
    // siembra `mealfit_guest_sessions_list` y el setter mantiene la lista viva
    // (handleNewChat/handleSend). Mismo patrón que ChatWidget.jsx.
    const [_guestSessionIds, setGuestSessionIds] = useState(() => {
        // [P2-B] try/catch defensivo + validación de tipo: si `mealfit_guest_sessions_list`
        // se corrompe, el throw aquí rompe el render de AgentPage entero. Tras el
        // catch caemos al "initialList" como si nunca hubiera habido storage previo.
        // [P1-AGENT-LAZY-INIT-PRIVATE-MODE · 2026-06-01] El getter crudo lanzaba
        // SecurityError en iOS Private Mode ANTES de llegar al try/catch (que solo
        // envuelve JSON.parse, no el getItem) → throw en este lazy init → AgentPage
        // entero no rendea → cae al GlobalErrorBoundary. Mismo modo de fallo que el
        // sibling `localSessionId` arriba; migrado a `safeLocalStorageGet` (atrapa el
        // throw y retorna el fallback null → degrada a sesión en memoria).
        const savedList = safeLocalStorageGet('mealfit_guest_sessions_list', null);
        let list = null;
        if (savedList) {
            try {
                const parsed = JSON.parse(savedList);
                if (Array.isArray(parsed)) list = parsed;
            } catch { /* corrupt; reset */ }
        }
        if (Array.isArray(list)) {
            if (!list.includes(localSessionId)) {
                list.unshift(localSessionId);
                list = list.slice(0, 40);
                safeLocalStorageSet('mealfit_guest_sessions_list', JSON.stringify(list));
            }
            return list;
        }
        const initialList = [localSessionId];
        safeLocalStorageSet('mealfit_guest_sessions_list', JSON.stringify(initialList));
        return initialList;
    });

    const [currentSessionId, _setCurrentSessionId] = useState(() => {
        // [P1-AGENT-PERSIST-SESSION · 2026-05-20] Leer la sesión activa de
        // localStorage ANTES de generar UUID nuevo. Pre-fix: cada vez que el
        // user navegaba Nevera/Plan/Recetas → Agente, el componente re-montaba,
        // este useState ejecutaba el initializer, creaba un UUID nuevo, lo
        // persistía sobrescribiendo la sesión activa, y mostraba un chat
        // vacío con welcome screen. El user reportó "se refresca y molesta"
        // (2026-05-20) — perdía el chat en curso al volver.
        //
        // [P1-AGENT-SESSION-DAY · 2026-08-14] Aquella persistencia era ABSOLUTA
        // y por eso el mismo owner pidió después lo contrario: al entrar le
        // resucitaba un chat de trece días atrás. No son peticiones opuestas
        // sino los dos extremos del mismo eje sin frontera; la frontera es el
        // DÍA. La regla vive en `utils/chatSessionDay` con sus propios tests.
        return resolverSesionDelDia().sessionId;
    });
    const setCurrentSessionId = (id) => {
        // Elegir una sesión a mano (crear una nueva, o abrir otra de
        // «Recientes») cuenta como actividad de HOY: es tu chat del día.
        marcarActividad(id);
        _setCurrentSessionId(id);
    };
    // [P5-SPEED-SESSION-REFETCH · 2026-06-01] Ref espejo de currentSessionId para que
    // fetchChatSessions NO lo liste en sus deps. Sin esto, cambiar de sesión recreaba la
    // identidad de fetchChatSessions → el effect de mount `[fetchChatSessions]` re-corría
    // (re-GET de TODA la lista de sesiones, que no cambió por el switch) y el title-poll
    // recreaba su setInterval. currentSessionId solo se usa dentro de fetchChatSessions
    // como fallback default del safeJSONParse de guests; leerlo por ref elimina ese
    // refetch redundante en cada selección de sesión sin perder el valor fresco.
    const currentSessionIdRef = useRef(currentSessionId);
    useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

    // Escuchar el logout para limpiar el estado interno
    useEffect(() => {
        if (!session?.user?.id && !userProfile?.id) {
            // [P4-LOCALSTORAGE-LAZY-INIT] getItem crudo en cuerpo de effect →
            // SecurityError (iOS Private Mode) propaga al GlobalErrorBoundary.
            // safeLocalStorageGet degrada a null → rama de regen corre normal.
            const currentGuestSession = safeLocalStorageGet('mealfit_guest_session', null);
            if (!currentGuestSession) {
                const newId = crypto.randomUUID();
                safeLocalStorageSet('mealfit_guest_session', newId);
                setLocalSessionId(newId);
                setCurrentSessionId(newId);
                setMessages([{ role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true, welcomeAt: Date.now() }]);
                setChatSessions([]);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id, userProfile?.id]);

    // [P1-AGENT-CACHE-SIDEBAR · 2026-05-20] Cache local de la sidebar de
    // sesiones recientes. Síntoma cerrado: "el historial aparece cargando"
    // cada vez que el user navegaba Nevera/Plan → Agente. Pre-fix:
    // `chatSessions=[]` inicial + `isLoadingSessions=true` mostraban
    // skeleton/spinner durante los ~200-500ms del fetchChatSessions, flash
    // visible reportado 2026-05-20.
    //
    // Fix: persistir array de sessions en localStorage; al mount, leer
    // como initial state → sidebar arranca con datos del cache, refetch
    // en background sin spinner visible. TTL 24h. isLoadingSessions
    // inicializa en false cuando hay cache (no mostrar spinner).
    // [2026-05-29] Bump v1→v2: invalida cualquier cache stale existente (que
    // causaba el flash de historial viejo al refrescar) desde el primer load.
    // [P2-CHAT-CACHE-XUSER · 2026-05-31] `_CHAT_SESSIONS_CACHE_KEY` ahora es un
    // alias module-scope del SSOT chatCacheKeys (ver tope del archivo).
    const _SESSIONS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

    const [chatSessions, setChatSessions] = useState(() => {
        try {
            const rawCache = safeLocalStorageGet(_CHAT_SESSIONS_CACHE_KEY, null);
            if (rawCache) {
                const cache = JSON.parse(rawCache);
                const fresh = (Date.now() - (cache.cachedAt || 0)) < _SESSIONS_CACHE_TTL_MS;
                if (cache && Array.isArray(cache.sessions) && cache.sessions.length > 0 && fresh) {
                    return cache.sessions;
                }
            }
        } catch (_e) {
            // ignore — fail-open al array vacío
        }
        return [];
    });
    // isLoadingSessions arranca false si hay cache (no mostrar spinner) —
    // el refetch en background actualiza sin flash. Si no hay cache, true
    // para mostrar loading state inicial natural.
    const [isLoadingSessions, setIsLoadingSessions] = useState(() => {
        try {
            const rawCache = safeLocalStorageGet(_CHAT_SESSIONS_CACHE_KEY, null);
            if (rawCache) {
                const cache = JSON.parse(rawCache);
                if (cache && Array.isArray(cache.sessions) && cache.sessions.length > 0) {
                    return false;
                }
            }
        } catch (_e) { /* ignore */ }
        return true;
    });
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [showSidebar, setShowSidebar] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 768 : true);
    const sidebarRef = useRef(null);
    const sidebarTriggerRef = useRef(null);

    useEffect(() => {
        if (!isMobile || !showSidebar) return undefined;
        const drawer = sidebarRef.current;
        const returnFocus = sidebarTriggerRef.current;
        const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusFrame = requestAnimationFrame(() => drawer?.querySelector(focusableSelector)?.focus());
        const handleDrawerKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setShowSidebar(false);
                return;
            }
            if (event.key !== 'Tab' || !drawer) return;
            const focusable = Array.from(drawer.querySelectorAll(focusableSelector));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleDrawerKeyDown);
        return () => {
            cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', handleDrawerKeyDown);
            returnFocus?.focus?.();
        };
    }, [isMobile, showSidebar]);

    // [P1-AGENT-CACHE-SIDEBAR · 2026-05-20] Persistir chatSessions al change.
    // Misma estrategia que el cache de messages (P1-AGENT-CACHE-MESSAGES).
    useEffect(() => {
        try {
            // [2026-05-29] Cuando NO hay sesiones, LIMPIAR el cache (antes hacía
            // `return` y dejaba el cache stale → al refrescar y entrar al Agente
            // aparecía un historial viejo por unos ms y desaparecía cuando el
            // fetch confirmaba que está vacío). Limpiando, el próximo refresh
            // arranca vacío sin ese flash.
            if (!Array.isArray(chatSessions) || chatSessions.length === 0) {
                safeLocalStorageRemove(_CHAT_SESSIONS_CACHE_KEY);
                return;
            }
            safeLocalStorageSet(_CHAT_SESSIONS_CACHE_KEY, JSON.stringify({
                sessions: chatSessions,
                cachedAt: Date.now(),
            }));
        } catch (_e) { /* ignore */ }
    }, [chatSessions]);

    // [P1-AGENT-CACHE-MESSAGES · 2026-05-20] Cache local de los messages
    // de la sesión activa. Cierra el "flash" molesto del welcome screen
    // durante los ~200-500ms del refetch al re-mount (al navegar Nevera →
    // Agente). Pre-fix #9 (P1-AGENT-PERSIST-SESSION) preservaba el
    // currentSessionId pero el `messages` state iniciaba con `[welcome]`
    // y el user veía esa transición visible.
    //
    // Diseño: single key `mealfit_chat_messages_cache_v1` con shape
    // `{sessionId, messages, cachedAt}`. Al mount:
    //   - Si `cache.sessionId === currentSessionId` y `cachedAt < 24h`,
    //     usar `cache.messages` como initial state (arranque instantáneo).
    //   - Si no, usar welcome screen (chat nuevo o session distinta).
    // Refresh en background corre normal — si los messages cambiaron
    // server-side (e.g., summarize_and_prune corrió en otra tab),
    // setMessages los reemplaza sin flash perceptible (mismo tamaño,
    // mismo orden mayormente).
    //
    // Cap defensivo: max 50 messages persistidos para no saturar
    // localStorage. Los chats activos típicos rondan 10-30 messages.
    // [P2-CHAT-CACHE-XUSER · 2026-05-31] `_CHAT_CACHE_KEY` ahora es alias
    // module-scope del SSOT chatCacheKeys (ver tope del archivo).
    const _CHAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const _CHAT_CACHE_MAX_MSGS = 50;

    const [messages, setMessages] = useState(() => {
        try {
            const rawCache = safeLocalStorageGet(_CHAT_CACHE_KEY, null);
            if (rawCache) {
                const cache = JSON.parse(rawCache);
                const fresh = (Date.now() - (cache.cachedAt || 0)) < _CHAT_CACHE_TTL_MS;
                if (
                    cache
                    && cache.sessionId === currentSessionId
                    && Array.isArray(cache.messages)
                    && cache.messages.length > 0
                    && fresh
                ) {
                    return cache.messages;
                }
            }
        } catch (_e) {
            // safeLocalStorageGet retorna fallback en error, pero JSON.parse
            // puede tirar — fail-open al welcome screen.
        }
        return [{ role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true, welcomeAt: Date.now() }];
    });
    const messagesRef = useRef(messages);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // [P1-AGENT-CACHE-MESSAGES · 2026-05-20] Persist messages en cada change.
    // Best-effort: safeLocalStorageSet swallow errores de cuota.
    useEffect(() => {
        if (!currentSessionId) return;
        // No persistir el welcome screen vacío — el flag isWelcome indica
        // "primera vez, sin conversación real" y queremos que el initializer
        // del próximo mount NO encuentre cache (fallback al welcome regenerado
        // con datos frescos del profile).
        if (messages.length === 1 && messages[0]?.isWelcome) return;
        // [P3-CHAT-CACHE-STREAM-SKIP · 2026-05-31] No persistir mientras el
        // último mensaje está en streaming. El handler SSE hace setMessages por
        // cada chunk (~por token) → sin este guard el effect corría
        // JSON.stringify(≤50 msgs) + localStorage.setItem síncrono por chunk,
        // re-serializando la burbuja que crece en cada token (solo el valor
        // final importa). La rama `done` setea isStreaming:false y re-dispara el
        // effect → persiste el valor final UNA vez. Cero cambio al contrato de
        // cache; elimina el trabajo redundante en el hot path del streaming.
        if (messages[messages.length - 1]?.isStreaming) return;
        // [P1-AGENT-SESSION-DAY · 2026-08-14] Actividad real ⇒ esta sesión es
        // la de HOY. Va aquí y no en el envío del mensaje porque este effect ya
        // filtra justo lo que cuenta: ni la pantalla de bienvenida (que se
        // descarta arriba) ni los chunks del streaming. Abrir el Agente y no
        // escribir nada NO reclama el día: mañana seguirás empezando fresco.
        marcarActividad(currentSessionId);
        try {
            const capped = messages.length > _CHAT_CACHE_MAX_MSGS
                ? messages.slice(-_CHAT_CACHE_MAX_MSGS)
                : messages;
            safeLocalStorageSet(_CHAT_CACHE_KEY, JSON.stringify({
                sessionId: currentSessionId,
                messages: capped,
                cachedAt: Date.now(),
            }));
        } catch (_e) {
            // ignore — cache es best-effort, no afecta funcionalidad
        }
    }, [messages, currentSessionId]);

    // Re-generate welcome when planData/formData become available (they load async)
    const hasHydratedWelcome = useRef(false);
    useEffect(() => {
        if (hasHydratedWelcome.current) return;
        // Only regenerate if we actually have plan data now AND the current messages are just the initial welcome
        if ((planData || formData?.name) && messages.length === 1 && messages[0]?.isWelcome) {
            hasHydratedWelcome.current = true;
            setMessages([{ role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true, welcomeAt: Date.now() }]);
        }
    }, [planData, formData, userProfile, messages]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // [P1-CHAT-TURN-ACTIVE · 2026-08-10] `isLoading` NO significa «hay un turno en
    // vuelo»: significa «se está pensando». Deja de ser cierto en el PRIMER token
    // (`setIsLoading(false)` en la rama del primer chunk), que es cuando arranca la
    // fase más larga del turno — escribir la respuesta.
    //
    // Como `isLoading` gobernaba además el guard de entrada de `handleSend`, el
    // `disabled` del botón de enviar y el gate del botón Detener, en el instante en
    // que empezaba a verse texto quedaba TODO reabierto: se podía lanzar un segundo
    // stream SSE que escribe sobre la MISMA burbuja que el primero sigue llenando —
    // conversación corrupta, sin aviso — y el botón Detener desaparecía justo
    // cuando el usuario más quiere usarlo.
    //
    // `isTurnActive` es el estado que faltaba: se enciende al entrar en handleSend y
    // se apaga SOLO en el `finally` (cubre done, error, abort y excepción). El ref
    // espejo existe porque el guard de entrada tiene que ser SÍNCRONO: dos toques
    // dentro del mismo frame de React verían ambos el state viejo (misma lección que
    // P1-FORM-4 en el formulario).
    const [isTurnActive, setIsTurnActive] = useState(false);
    const isTurnActiveRef = useRef(false);
    const _setTurnActive = useCallback((v) => {
        isTurnActiveRef.current = v;
        setIsTurnActive(v);
    }, []);
    // [P2-CHAT-HISTORY-CLEAN · 2026-07-12] El guard del refetch usa el
    // isLoadingRef pre-existente (declarado más abajo junto a los refs del
    // stream) — NO redeclarar aquí.
    const [streamingStatus, setStreamingStatus] = useState(null);
    const [abortController, setAbortController] = useState(null);
    const abortControllerRef = useRef(null);
    // [P3-AUDIT-2] Feedback no bloqueante: los rechazos del nuevo pipeline
    // múltiple conservan `toast.error` y nunca vuelven al alert nativo.
    const handleAttachmentReject = useCallback((code) => {
        const copy = {
            IMAGE_COUNT_LIMIT: t('Puedes adjuntar hasta {count} imágenes por mensaje.', { count: CHAT_IMAGE_MAX_COUNT }),
            IMAGE_TYPE_INVALID: t('Formato no soportado. Por favor sube una imagen válida.'),
            IMAGE_TOO_LARGE: t('Una de las fotos pesa demasiado. El máximo es 15 MB por imagen.'),
            IMAGE_TOTAL_TOO_LARGE: t('Las fotos juntas pesan demasiado. Reduce la selección e inténtalo de nuevo.'),
        }[code] || t('No pudimos preparar una de las imágenes.');
        triggerMobileHaptic('error');
        toast.error(copy);
    }, [t]);
    const {
        attachments,
        addFiles,
        restorePreparedFiles,
        removeAttachment,
        clearAttachments,
        waitUntilSettled,
        hasPreparing: attachmentsPreparing,
        hasErrors: attachmentsHaveErrors,
    } = useChatAttachments({ onReject: handleAttachmentReject, concurrency: 2 });
    const attachmentUploadCacheRef = useRef(new Map());
    const [draftReadySession, setDraftReadySession] = useState(null);
    const draftSnapshotRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        setDraftReadySession(null);
        setInput('');
        clearAttachments();
        attachmentUploadCacheRef.current.clear();
        loadChatDraft(currentSessionId)
            .then((draft) => {
                if (cancelled) return;
                if (draft && Date.now() - Number(draft.updatedAt || 0) < 30 * 24 * 3600 * 1000) {
                    setInput(draft.text || '');
                    restorePreparedFiles(draft.files || []);
                }
                setDraftReadySession(currentSessionId);
            })
            .catch((error) => {
                if (!cancelled) {
                    _captureAgentPageException(error, { action: 'load_chat_draft' });
                    setDraftReadySession(currentSessionId);
                }
            });
        return () => { cancelled = true; };
    }, [currentSessionId, clearAttachments, restorePreparedFiles]);

    useEffect(() => {
        draftSnapshotRef.current = {
            sessionId: currentSessionId,
            ready: draftReadySession === currentSessionId,
            text: input,
            files: attachments.filter((item) => item.status === 'ready').map((item) => item.file),
        };
    }, [currentSessionId, draftReadySession, input, attachments]);

    useEffect(() => {
        if (draftReadySession !== currentSessionId) return undefined;
        const timer = setTimeout(() => {
            saveChatDraft(currentSessionId, {
                text: input,
                files: attachments.filter((item) => item.status === 'ready').map((item) => item.file),
            }).catch((error) => _captureAgentPageException(error, { action: 'save_chat_draft' }));
        }, 350);
        return () => clearTimeout(timer);
    }, [currentSessionId, draftReadySession, input, attachments]);

    useEffect(() => {
        const sessionAtEffect = currentSessionId;
        return () => {
            const snapshot = draftSnapshotRef.current;
            if (snapshot?.ready && snapshot.sessionId === sessionAtEffect) {
                saveChatDraft(sessionAtEffect, snapshot).catch(() => {});
            }
        };
    }, [currentSessionId]);

    useEffect(() => {
        const persistWhenBackgrounded = () => {
            if (document.visibilityState !== 'hidden') return;
            const snapshot = draftSnapshotRef.current;
            if (snapshot?.ready) saveChatDraft(snapshot.sessionId, snapshot).catch(() => {});
        };
        document.addEventListener('visibilitychange', persistWhenBackgrounded);
        return () => document.removeEventListener('visibilitychange', persistWhenBackgrounded);
    }, []);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const attachmentTriggerRef = useRef(null);
    const attachmentPickerOpeningRef = useRef(false);
    const attachmentPickerHadKeyboardRef = useRef(false);
    const [showAttachmentSource, setShowAttachmentSource] = useState(false);
    // [P3-CHAT-FOCUS-TELEM · 2026-05-19] Ref al textarea para refocus
    // post-send (solo cuando tenía focus pre-send — preserva mobile UX
    // donde tap del botón send NO debe abrir keyboard).
    const chatInputRef = useRef(null);

    // [P1-CHAT-PICKER-DESPUES-DEL-TECLADO · 2026-08-24] En iOS no basta con mover
    // el DOM antes de abrir el input: el menú nativo usa el visual viewport REAL del
    // instante. Iniciamos el cierre en pointerdown y esperamos a que el viewport lleve
    // 120 ms sin eventos y ya no mida teclado. WebKit conserva la activación transitoria
    // varios segundos, muy por encima del cierre normal (~250-500 ms).
    const prepareAttachmentPickerGesture = useCallback(() => {
        const abierto = tecladoAbiertoRef.current || medirTecladoDeVentana(window).abierto;
        attachmentPickerHadKeyboardRef.current = abierto;
        if (abierto) chatInputRef.current?.blur();
    }, []);

    const waitForAttachmentKeyboardClose = useCallback((shouldWait) => {
        if (!shouldWait || typeof window === 'undefined' || !window.visualViewport) {
            return Promise.resolve();
        }

        const vv = window.visualViewport;
        return new Promise((resolve) => {
            let finished = false;
            let quietTimer = null;
            let hardTimer = null;

            const cleanup = () => {
                vv.removeEventListener('resize', check);
                vv.removeEventListener('scroll', check);
                if (quietTimer) clearTimeout(quietTimer);
                if (hardTimer) clearTimeout(hardTimer);
            };
            const finish = () => {
                if (finished) return;
                finished = true;
                cleanup();
                // Dos frames garantizan que sticky + barra inferior ya usen el viewport
                // cerrado antes de que WebKit calcule dónde dibujar su menú.
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            };
            const check = () => {
                if (finished) return;
                if (quietTimer) clearTimeout(quietTimer);
                if (medirTecladoDeVentana(window).abierto) return;
                quietTimer = setTimeout(finish, 120);
            };

            vv.addEventListener('resize', check);
            vv.addEventListener('scroll', check);
            hardTimer = setTimeout(finish, 1500);
            chatInputRef.current?.blur();
            check();
        });
    }, []);

    // [P2-CHAT-TEXTAREA-AUTOSIZE · 2026-07-24] El alto del textarea es FUNCIÓN
    // del estado, no efecto colateral del evento `onInput`.
    //
    // Bug cerrado (reportado 2026-07-24): "el chat se pone ancho a veces y hay
    // que refrescar la página". El `onInput` escribía `style.height` a mano;
    // React no es dueño de ese inline style (no viaja en el prop `style`), así
    // que NO lo revertía al re-renderizar. Todo cambio de `input` que no venía
    // de una tecla dejaba pegado el alto del mensaje anterior:
    //   handleSend → setInput('')      (el caso del screenshot: caja inflada
    //                                   MOSTRANDO el placeholder)
    //   handleNewChat → setInput('')
    //   pill de sugerencia → setInput(texto)
    // Y como AgentPage es keep-alive (App.jsx lo oculta con display:none en
    // vez de desmontarlo), el alto stale sobrevivía a la navegación — solo un
    // reload lo reseteaba, que es exactamente lo que el usuario tenía que hacer.
    //
    // La firma incluye lo que cambia el ANCHO disponible (isMobile, sidebar,
    // preview de imagen): el mismo texto ocupa distintas líneas según el ancho.
    useAutosizeTextarea(chatInputRef, `${input}|${isMobile}|${showSidebar}|${attachments.length}`);

    // [P3-AGENT-PREFILL · 2026-06-15] Consumir una pregunta pre-cargada desde
    // otra parte del dashboard (p.ej. tocar un micronutriente en
    // MicronutrientPanel). Keep-alive-safe: se aplica al MONTAR (primera visita,
    // recoge la pendiente dejada justo antes de navegar) y vía EVENTO (ya
    // montado). Pre-carga el textarea + lo enfoca; NO auto-envía (el usuario
    // revisa/edita y pulsa enviar).
    useEffect(() => {
        const apply = () => {
            const text = consumeAgentPrefill();
            if (!text) return;
            setInput(text);
            setTimeout(() => {
                try {
                    const el = chatInputRef.current;
                    if (!el) return;
                    el.focus();
                    // [P2-CHAT-TEXTAREA-AUTOSIZE · 2026-07-24] El resize ya lo
                    // hizo el layout effect del hook al commitear setInput(text).
                    el.setSelectionRange(text.length, text.length);
                } catch { /* noop */ }
            }, 120);
        };
        apply();
        window.addEventListener(AGENT_PREFILL_EVENT, apply);
        return () => window.removeEventListener(AGENT_PREFILL_EVENT, apply);
         
    }, []);
    // [P2-CHAT-SCROLL-RACE · 2026-05-19] Refs del scroll-race guard.
    //
    // Pre-fix: `useEffect(() => scrollToBottom(), [messages])` saltaba
    // al fondo en CADA cambio del array de messages — incluyendo cada
    // chunk SSE del LLM streaming. Si el user scrolleaba arriba para
    // releer un mensaje pasado mientras el bot streameaba la respuesta,
    // cada chunk lo arrojaba al fondo → imposible leer historial mid-stream.
    //
    // Fix:
    //   - `messagesContainerRef` apunta al `<div className="messages-container">`
    //     (elemento scrollable, NO al messagesEndRef que es solo el target).
    //   - `userScrolledUpRef` es un ref (NO state) para evitar re-renders
    //     en cada scroll tick. Lo lee `scrollToBottom` para decidir si
    //     hacer no-op.
    //   - `handleMessagesScroll` se monta como `onScroll` del container y
    //     actualiza el ref con un umbral 120px desde el bottom — cubre
    //     overshoot por scroll momentum en mobile.
    //   - El send-handler resetea `userScrolledUpRef.current = false`
    //     cuando el user manda un mensaje (acción afirmativa = quiere ver
    //     la respuesta abajo).
    //
    // Tooltip-anchor: P2-CHAT-SCROLL-RACE.
    const messagesContainerRef = useRef(null);
    const userScrolledUpRef = useRef(false);
    const virtualizedListRef = useRef(null);
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);

    // Setters/refs del dictado eliminados junto con toggleDictation (dead code
    // post P1-DEADCODE-TTS). Los valores siguen leyéndose en la UI (placeholder
    // del textarea, gate del botón enviar) con su estado inicial constante.
    const [isListening] = useState(false);
    const [micErrorMsg] = useState(null);
    const recognitionRef = useRef(null);

    // Para Drag & Drop de Imágenes
    const [isDragging, setIsDragging] = useState(false);

    const latestInputRef = useRef(input);

    useEffect(() => {
        latestInputRef.current = input;
    }, [input]);

    const handleSendRef = useRef(null);

    // --- Lógica de Modo Llamada (Voz Nativa) ---
    // (setter eliminado con toggleCallMode — dead code post P1-DEADCODE-TTS)
    const [isCallModeActive] = useState(false);
    const callModeRef = useRef(false);
    useEffect(() => { callModeRef.current = isCallModeActive; }, [isCallModeActive]);

    const [isSpeaking, setIsSpeaking] = useState(false);
    const isSpeakingRef = useRef(false);
    useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

    const isLoadingRef = useRef(isLoading);
    useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

    // --- NATIVE TTS AUDIO ENGINE (ELEVENLABS) ---
    const ttsQueue = useRef([]);
    const isPlayingAudio = useRef(false);
    const audioPlayerRef = useRef(null);

    // [P2-AGENT-UNMOUNT-CLEANUP · 2026-05-30] Al desmontar AgentPage (cambio de
    // ruta SPA hacia Nevera/Plan/Dashboard, cerrar el chat) abortar el stream
    // SSE en vuelo + parar el reconocimiento de voz + pausar el audio TTS.
    // Pre-fix NO existía cleanup de unmount (todos los `.abort()` vivían en
    // handlers interactivos: barge-in, botón stop, toggle de dictado). El
    // `while (reader.read())` de handleSend seguía corriendo tras el unmount →
    // setState sobre un componente desmontado + stream backend abierto hasta
    // completar + micrófono caliente en background. El billing ya es idempotente
    // (P2-AUDIT-NEW-2) → esto es fuga de recursos/mic, no doble cobro. Solo
    // corre en teardown (deps []), sin cambio de comportamiento en montaje.
    useEffect(() => () => {
        try { abortControllerRef.current?.abort(); } catch (_e) { /* noop */ }
        try { recognitionRef.current?.stop(); } catch (_e) { /* noop */ }
        try { audioPlayerRef.current?.pause(); } catch (_e) { /* noop */ }
    }, []);

    const processTTSQueue = async () => {
        // [P1-DEADCODE-TTS · 2026-05-31] VOZ DESACTIVADA TEMPORALMENTE (Plan
        // Gratuito ElevenLabs). Vaciamos la cola para no reproducir ni llamar a
        // la API. El bloque de reproducción (fetch /api/chat/tts + audio playback
        // + handleEnded) se eliminó por ser código muerto tras el `return`
        // (lint no-unreachable). Recuperable desde git history si se reactiva TTS.
        if (isPlayingAudio.current || ttsQueue.current.length === 0) return;
        ttsQueue.current = [];
    };

    const queueTTS = useCallback((text) => {
        const cleanText = text.replace(/[*_#[\]]/g, '').trim();
        if (!cleanText) return;
        ttsQueue.current.push(cleanText);
        processTTSQueue();
    }, []);

    // [P1-DEADCODE-TTS · seguimiento] `toggleCallMode` y `toggleDictation`
    // eliminados como dead code (0 callers tras desactivar la VOZ — ver marker
    // P1-DEADCODE-TTS arriba). Recuperables desde git history si se reactiva
    // el Modo Llamada/dictado.

    // Función para manejar la interrupción táctil (Barge-In interactivo) para evitar la limitante de iOS
    const handleInterruptBargeIn = () => {
        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            audioPlayerRef.current.currentTime = 0;
        }
        ttsQueue.current = [];
        isPlayingAudio.current = false;
        isSpeakingRef.current = false;
        if (abortControllerRef.current) abortControllerRef.current.abort();
        setIsSpeaking(false);
        setIsLoading(false);
        setStreamingStatus(null);
        setTimeout(() => {
            if (callModeRef.current) {
                try { recognitionRef.current?.start(); } catch (e) { }
            }
        }, 100);
    };
    // -------------------------------------------

    const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);
    const loadingPhrases = [
        t("Revisando tus preferencias y contexto..."),
        t("Evaluando tu perfil y macros..."),
        t("Analizando tu objetivo con Inteligencia Nutricional..."),
        t("Alineando tu genética con el plan..."),
        t("Calculando la mejor respuesta metabólica...")
    ];

    useEffect(() => {
        let interval;
        if (isLoading) {
            interval = setInterval(() => {
                setLoadingPhraseIdx(prev => (prev + 1) % loadingPhrases.length);
            }, 2500); // Rotar cada 2.5s
        } else {
            setLoadingPhraseIdx(0);
        }
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading]);

    const handleFileSelect = (e) => {
        addFiles(e.target.files);
    };

    const runNativeImagePicker = async (source) => {
        const remaining = Math.max(1, CHAT_IMAGE_MAX_COUNT - attachments.length);
        setShowAttachmentSource(false);
        try {
            const files = source === 'camera'
                ? await takeNativeChatPhoto()
                : await chooseNativeChatImages(remaining);
            if (files?.length) addFiles(files);
        } catch (error) {
            if (!isNativePickerCancellation(error)) {
                _captureAgentPageException(error, { action: `native_${source}_picker` });
                triggerMobileHaptic('error');
                toast.error(t('No pudimos abrir tus fotos. Revisa los permisos e inténtalo de nuevo.'));
            }
        }
    };

    const openAttachmentPicker = async () => {
        if (isTurnActive || attachments.length >= CHAT_IMAGE_MAX_COUNT) return;
        if (attachmentPickerOpeningRef.current) return;
        if (isNativeApp()) {
            attachmentPickerHadKeyboardRef.current = false;
            setShowAttachmentSource(true);
            return;
        }

        const fileInput = fileInputRef.current;
        if (!fileInput) return;
        const shouldWait = attachmentPickerHadKeyboardRef.current
            || tecladoAbiertoRef.current
            || medirTecladoDeVentana(window).abierto;
        attachmentPickerHadKeyboardRef.current = false;
        attachmentPickerOpeningRef.current = true;
        try {
            await waitForAttachmentKeyboardClose(shouldWait);
            fileInput.value = '';
            if (typeof fileInput.showPicker === 'function') {
                try {
                    fileInput.showPicker();
                    return;
                } catch (_pickerError) {
                    // Safari anterior / política particular: el click conserva el
                    // fallback histórico dentro de la misma activación transitoria.
                }
            }
            fileInput.click();
        } finally {
            attachmentPickerOpeningRef.current = false;
        }
    };

    const clearSelectedFile = (options) => {
        clearAttachments(options);
        attachmentUploadCacheRef.current.clear();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeSelectedAttachment = (id) => {
        triggerMobileHaptic('light');
        attachmentUploadCacheRef.current.delete(id);
        removeAttachment(id);
    };

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const imageFiles = Array.from(items)
            .filter((item) => item.type.startsWith('image/'))
            .map((item) => item.getAsFile())
            .filter(Boolean);
        if (imageFiles.length) {
            e.preventDefault();
            addFiles(imageFiles);
        }
    };

    // --- Drag and Drop Handlers ---
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        addFiles(e.dataTransfer.files);
    };

    // [P2-CHAT-SCROLL-RACE · 2026-05-19] Auto-scroll respeta el intent
    // del usuario. Si el user scrolleó arriba (userScrolledUpRef = true),
    // skip silencioso — confía en que el user verá los chunks nuevos
    // cuando regrese al fondo manualmente. `force=true` ignora el ref
    // (caso: el user acaba de enviar un mensaje, queremos que vea su
    // mensaje + la respuesta entrando).
    // Tooltip-anchor: P2-CHAT-SCROLL-RACE.
    // [P6-SPEED-CHAT-SCROLL · 2026-06-01] Coalesce a un solo scroll por frame.
    // El handler SSE hace setMessages por cada chunk (~por token, decenas/seg) y
    // este effect corría scrollToBottom en cada uno → cada chunk lanzaba un
    // scrollIntoView({smooth}) que el siguiente cancelaba y reiniciaba: la
    // animación nunca asentaba (auto-scroll con jank durante el momento más
    // observado de la app, la respuesta entrando). Fix: 1 rAF por frame +
    // 'auto' (instantáneo) mientras el último mensaje stremea; 'smooth' solo en
    // el update final/no-streaming. Sin reflow read en código de app.
    const scrollRafRef = useRef(null);
    const scrollToBottom = (force = false, behaviorOverride = null) => {
        if (userScrolledUpRef.current && !force) return;
        if (scrollRafRef.current) return; // ya hay un scroll agendado este frame
        scrollRafRef.current = requestAnimationFrame(() => {
            scrollRafRef.current = null;
            const msgs = messagesRef.current;
            const last = Array.isArray(msgs) && msgs.length ? msgs[msgs.length - 1] : null;
            const behavior = behaviorOverride || (last?.isStreaming ? 'auto' : 'smooth');
            if (msgs.length > VIRTUALIZE_THRESHOLD) {
                virtualizedListRef.current?.scrollToBottom({ behavior });
            } else {
                messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
            }
            if (force) {
                userScrolledUpRef.current = false;
                setShowJumpToLatest(false);
            }
        });
    };
    scrollToBottomRef.current = scrollToBottom;

    // [P2-CHAT-SCROLL-RACE · 2026-05-19] Listener montado en el container
    // scrollable. Umbral 120px desde el bottom: cubre el overshoot natural
    // por scroll momentum en mobile + zona neutral donde un microscroll
    // accidental no marca "scrolled up". Cálculo: si distanceFromBottom
    // > 120, el user está claramente leyendo historial; <= 120 cuenta
    // como "engaged con el fondo" (auto-scroll seguro).
    const handleMessagesScroll = useCallback(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        try {
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            const scrolledUp = distanceFromBottom > 120;
            userScrolledUpRef.current = scrolledUp;
            setShowJumpToLatest(scrolledUp);
        } catch (_e) {
            // Defensivo contra browsers raros que devuelvan NaN o lancen
            // en getters. NO afecta el flow del chat.
        }
    }, []);

    const handleVirtualizedAtBottomChange = useCallback((atBottom) => {
        const scrolledUp = !atBottom;
        userScrolledUpRef.current = scrolledUp;
        setShowJumpToLatest(scrolledUp);
    }, []);

    const fetchChatSessions = useCallback(async () => {
        try {
            const userId = session?.user?.id || userProfile?.id || localSessionId;
            if (!userId) return;

            const isGuest = !session?.user?.id && !userProfile?.id;
            let url = `/api/chat/sessions/${userId}`;

            if (isGuest) {
                // Para invitados, enviamos la lista de IDs guardada en localStorage.
                // [P2-A · 2026-05-08] safeJSONParse defiende contra storage corrupto:
                // antes el throw del JSON.parse propagaba al catch del wrapper async
                // y bloqueaba el load de history para todos los guests con storage
                // corrupto, sin self-heal. `.slice(0, 40)` solo se aplica a arrays
                // válidos; el validator garantiza el shape.
                const savedListStr = safeLocalStorageGet('mealfit_guest_sessions_list', null);
                const parsedList = safeJSONParse(savedListStr, [currentSessionIdRef.current], {
                    validator: Array.isArray,
                    storageKey: 'mealfit_guest_sessions_list',
                });
                const latestSessionIds = parsedList.slice(0, 40);
                const sessionIdsParam = latestSessionIds.join(',');
                url += `?session_ids=${sessionIdsParam}`;
            }
            // Si no es guest, el backend buscará por user_id directamente en la BD (Multi-dispositivo)

            const response = await fetchWithAuth(url);
            if (response.ok) {
                const data = await response.json();
                setChatSessions(prev => {
                    const newSessions = data.sessions || [];
                    const generating = prev.filter(s => s.title === 'Generando título...');
                    const merged = [...newSessions];

                    generating.forEach(gen => {
                        const existingIdx = merged.findIndex(s => s.id === gen.id);
                        if (existingIdx === -1) {
                            merged.unshift(gen);
                        } else {
                            // Si el servidor solo tiene el fallback snippet del mensaje y no el title real,
                            // o si viene vacío, preservamos el placeholder visual:
                            if (merged[existingIdx].is_fallback !== false && gen.title === 'Generando título...') {
                                merged[existingIdx].title = 'Generando título...';
                            }
                        }
                    });
                    return merged;
                });
            }
        } catch (error) {
            console.error("Error fetching sessions:", error);
            _captureAgentPageException(error, { action: 'fetchSessions' });
        } finally {
            setIsLoadingSessions(false);
        }
        // [P5-SPEED-SESSION-REFETCH · 2026-06-01] currentSessionId removido de deps
        // (se lee por currentSessionIdRef.current arriba) → la identidad de este
        // callback ya no cambia al cambiar de sesión, evitando el re-GET de toda la
        // lista en el effect de mount y la recreación del interval del title-poll.
    }, [session?.user?.id, userProfile?.id, localSessionId]);

    // [P1-AGENT-WELCOME-STABLE · 2026-05-20 · refined: regenerar c/30min]
    // Helper que setea/refresca el welcome screen sin causar el bug
    // "se refresca varias veces" reportado 2026-05-20.
    //
    // Trade-off resuelto:
    //   - Fijar welcome PARA SIEMPRE (P1-AGENT-WELCOME-STABLE original) →
    //     el saludo "Buenas madrugadas" queda obsoleto si el user
    //     deja el tab abierto al amanecer ("Buenos días" sería correcto).
    //   - Regenerar en cada re-render (pre-fix) → user veía la hora
    //     literal cambiando ("04:25 → 04:26 → ...") como flash visible.
    //
    // Solución: regenerar cada 30 minutos (suficiente para que el
    // greeting siga el reloj sin spam visible) Y removida la hora
    // literal de `generateIntelligentWelcome` (P1-AGENT-WELCOME-NO-TIME).
    //
    // Si `prev[0].welcomeAt` es <30min, mantener `prev` (misma ref →
    // React skip rerender). Si es >=30min (o no existe), regenerar.
    //
    // Tooltip-anchor: P1-AGENT-WELCOME-STABLE.
    const _WELCOME_REFRESH_MS = 30 * 60 * 1000;
    const _setWelcomeIfAbsent = useCallback(() => {
        setMessages(prev => {
            // [P1-CHAT-PHOTO-UX · 2026-07-12] Guard CRÍTICO: si hay CUALQUIER
            // mensaje real (no-welcome), NO tocar el estado. Pre-fix el
            // fall-through devolvía [{welcome}] y BORRABA la conversación:
            // con [welcome, msg-del-user] (foto recién enviada, aún no
            // persistida al server porque el análisis gemma tarda 30-90s),
            // cualquier invocación en esa ventana pisaba el mensaje del user
            // — vivo: la burbuja con la foto desaparecía dejando solo el
            // saludo. Antes (visión cloud ~3s) la ventana era invisible.
            if (Array.isArray(prev) && prev.some(m => !m.isWelcome)) {
                return prev;
            }
            if (Array.isArray(prev) && prev.length === 1 && prev[0]?.isWelcome) {
                const ageMs = Date.now() - (prev[0]?.welcomeAt || 0);
                if (ageMs < _WELCOME_REFRESH_MS) {
                    return prev; // welcome fresco (<30min) — mantener referencia → no rerender
                }
            }
            return [{
                role: 'model',
                content: generateIntelligentWelcome(userProfile, formData, planData),
                isWelcome: true,
                welcomeAt: Date.now(),
            }];
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setMessages, userProfile, formData, planData]);

    // [P1-CHAT-STOP-POWER v2 · 2026-07-12] Firma del huérfano sobre los
    // mensajes REALES (sin welcome/burbujas de error/stop): estable ante
    // refetches que quitan burbujas locales. El descarte se PERSISTE en
    // localStorage — pre-fix vivía en un ref y un refresh lo resucitaba
    // ("cuando la detengo y refresco vuelve a estar igual"). Definidos ANTES
    // de fetchSessionMessages, que los usa para reconstruir la burbuja ⏹.
    const _orphanSig = useCallback((msgs) => {
        const real = (msgs || []).filter(m => m && !m.isWelcome && !m._isErrorBubble && !m._stoppedByUser);
        const lastReal = real[real.length - 1];
        return `${real.length}:${String(lastReal?.content || '').slice(0, 48)}`;
    }, []);
    const _orphanDismissKey = useCallback(
        (sid) => `mealfit_orphan_dismissed_${sid}`,
        []
    );

    const fetchSessionMessages = useCallback(async (sessionId, retryCount = 0) => {
        // [P1-AGENT-LOADING-SKIP-IF-FRESH · 2026-05-20] Solo mostrar
        // loading si NO hay NADA en memoria. Pre-fix: cada vez que el
        // callback se invocaba (incluso por re-disparo del useEffect
        // cuando _setWelcomeIfAbsent cambia ref), seteaba
        // `isLoadingHistory=true` → spinner visible. User reportó
        // 2026-05-20 "sigue cargando y no debería" tras keep-alive.
        //
        // Regla: si ya hay ALGÚN content visible (welcome o mensajes
        // reales), el refetch corre SILENCIOSO en background. Si la
        // response trae mensajes nuevos, setMessages actualiza sin que
        // el user vea spinner intermedio.
        const _hasAnyContent = Array.isArray(messagesRef.current)
            && messagesRef.current.length > 0;
        if (!_hasAnyContent) {
            setIsLoadingHistory(true);
        }
        // [P2-CHAT-HISTORY-CLEAN · 2026-07-12] Con un turno EN VUELO el estado
        // local va adelante del server (el mensaje se persiste recién al
        // /stream). Sobrescribir aquí pisaba la burbuja de la foto recién
        // enviada con el prompt enriquecido crudo persistido — vivo: la imagen
        // "aparecía unos segundos y al cargar la respuesta se volvía texto".
        if (isLoadingRef.current) {
            return;
        }
        let response;
        try {
            response = await fetchWithAuth(`/api/chat/history/${sessionId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.messages && data.messages.length > 0) {
                    // Filtrar los mensajes de sistema/bienvenida: detectar por flag o por patrones conocidos
                    const filteredMessages = data.messages.filter(m => {
                        const hasStructuredAttachments = Array.isArray(m.attachments)
                            ? m.attachments.length > 0
                            : (typeof m.attachments === 'string' && m.attachments !== '[]');
                        if (!m.content && !hasStructuredAttachments) return false;
                        // Filtrar mensajes de bienvenida viejos y nuevos por patrones estables (no time-dependent)
                        if (m.content === '¡Hola! Soy tu agente conversacional de nutrición IA. ¿En qué te puedo ayudar con tu plan alimenticio de hoy?') return false;
                        if (m.role === 'model' && m.content.includes('Son las ') && (m.content.includes('de tu súper)') || m.content.includes('especialista para guiarte') || m.content.includes('enfocados en tu meta'))) return false;
                        return true;
                    });
                    // [P2-CHAT-HISTORY-CLEAN · 2026-07-12] Miniaturas locales:
                    // el server NO persiste la imagen (sin object storage) —
                    // si el estado local actual tiene el thumb dataURL del
                    // n-ésimo mensaje de usuario, conservarlo al rehidratar.
                    // Solo si los conteos coinciden (alineación segura).
                    const _localUsers = (Array.isArray(messagesRef.current) ? messagesRef.current : [])
                        .filter(x => x.role === 'user');
                    const _serverUserCount = filteredMessages.filter(x => x.role === 'user').length;
                    const _canMergeThumbs = _localUsers.length === _serverUserCount;
                    let _userOrdinal = 0;

                    const _mappedMsgs = filteredMessages.map(m => {
                        let content = String(m.content || '');
                        let messageAttachments = Array.isArray(m.attachments)
                            ? m.attachments.map((item) => ({
                                ...item,
                                id: item.attachment_id || item.id,
                                url: item.url || item.image_url,
                            })).filter((item) => item.url)
                            : [];

                        // Compatibilidad con mensajes anteriores a attachments JSONB.
                        const legacyUrls = Array.from(content.matchAll(/\[IMAGE:\s*(.+?)\]/g), (match) => match[1]);
                        if (!messageAttachments.length && legacyUrls.length) {
                            messageAttachments = legacyUrls.map((url, index) => ({ id: `legacy-${index}`, url }));
                        }
                        content = content.replace(/\[IMAGE:\s*.+?\]\n?/g, '');
                        let isImage = messageAttachments.length > 0;
                        let imageUrl = messageAttachments[0]?.url || null;

                        // [P2-CHAT-HISTORY-CLEAN] Limpiar el andamiaje interno del
                        // prompt enriquecido. El historial persiste el prompt
                        // COMPLETO (el LLM necesita el análisis en turnos futuros),
                        // pero el usuario solo debe VER su propio texto. Un solo
                        // detector cubre TODAS las variantes de wrapper (plato,
                        // items, otro, analizador caído) — pre-fix solo 2 variantes
                        // viejas matcheaban y las nuevas mostraban el prompt crudo.
                        if (m.role === 'user') {
                            const _hadPhotoWrapper = /\[(?:Sistema: )?El usuario (?:acaba de subir|subió) (?:una imagen|una foto)/i.test(content);
                            const userMsgMatch = content.match(/Mensaje del usuario:\s*([\s\S]*)$/);
                            if (userMsgMatch) {
                                content = userMsgMatch[1].trim();
                            } else if (_hadPhotoWrapper) {
                                // Envío solo-foto: todo el contenido es andamiaje.
                                content = '';
                            }
                            content = content
                                .replace(/\[?\(Hora actual del usuario:.*?\)\]?\n?/gi, '')
                                .replace(/Instrucción:[\s\S]*$/i, '')
                                .replace(/Mensaje del usuario:\s*/gi, '')
                                .replace(/<dietary_context>[\s\S]*?<\/dietary_context>/, '')
                                .trim();
                            isImage = isImage || _hadPhotoWrapper;
                        }

                        // Si el bot genera el system title, lo ocultamos
                        if (m.role === 'model' && content.startsWith('[SYSTEM_TITLE]')) {
                            return null;
                        }

                        if (m.role === 'user') {
                            const _ord = _userOrdinal++;
                            if (isImage && !imageUrl && _canMergeThumbs) {
                                const _localAttachments = _localUsers[_ord]?.attachments;
                                const _localImg = _localAttachments?.[0]?.url || _localUsers[_ord]?.imageUrl;
                                if (_localImg && !String(_localImg).startsWith('blob:')) {
                                    messageAttachments = _localAttachments || [{ id: `local-${_ord}`, url: _localImg }];
                                    imageUrl = _localImg;
                                }
                            }
                        }

                        return {
                            role: m.role,
                            content: content || '',
                            isImage,
                            imageUrl,
                            attachments: messageAttachments,
                            clientMessageId: m.client_message_id || undefined,
                        };
                    }).filter(Boolean);
                    // [P1-CHAT-STOP-POWER v3 · 2026-07-12] Reconstruir la burbuja
                    // "⏹ Detenido" tras rehidratar del server: es CLIENT-ONLY (el
                    // server nunca la tuvo) y el replace la borraba — vivo: "el
                    // mensaje de que está detenido desapareció". La fuente de
                    // verdad es el marcador persistente de descarte: si el último
                    // mensaje real es del user Y su firma coincide con el descarte
                    // guardado, el turno fue detenido por el usuario → re-anexar.
                    const _lastMapped = _mappedMsgs[_mappedMsgs.length - 1];
                    if (
                        _lastMapped && _lastMapped.role === 'user'
                        && safeLocalStorageGet(_orphanDismissKey(sessionId), null) === _orphanSig(_mappedMsgs)
                    ) {
                        _mappedMsgs.push({
                            role: 'model',
                            content: t('⏹ Detenido. Cuando quieras, vuelve a enviar tu mensaje.'),
                            _stoppedByUser: true,
                            _isErrorBubble: true,
                            retryable: false,
                        });
                    }
                    setMessages(_mappedMsgs);
                } else {
                    // [P1-AGENT-WELCOME-STABLE · 2026-05-20] Preservar welcome
                    // existente — evita regenerar la hora visible.
                    _setWelcomeIfAbsent();
                }
            } else {
                // [P2-FETCH-RETRY-ADAPTIVE · 2026-05-19] Clasificación
                // por status: 401/403 (token hydration), 5xx (server
                // transitorio), 429 (rate-limit), default 4xx (no
                // retryable — bug del cliente, e.g. 404). Backoff
                // exponencial con jitter — ver _classifyFetchSessionRetry.
                const policy = _classifyFetchSessionRetry(response.status, false);
                if (policy.retryable && retryCount < policy.maxRetries) {
                    const delayMs = _computeFetchBackoffMs(policy.baseDelayMs, retryCount);
                    console.warn(`⏳ [fetchSessionMessages] retry ${retryCount + 1}/${policy.maxRetries} en ${delayMs}ms (status=${response.status} session=${sessionId})`);
                    setTimeout(() => fetchSessionMessages(sessionId, retryCount + 1), delayMs);
                    return;
                }
                if (policy.retryable) {
                    console.warn(`⚠️ No se pudo cargar historial de ${sessionId} tras ${policy.maxRetries} intentos (${response.status}).`);
                }
                // [P1-AGENT-WELCOME-STABLE · 2026-05-20]
                _setWelcomeIfAbsent();
            }
        } catch (error) {
            // [P2-FETCH-RETRY-ADAPTIVE · 2026-05-19] Network error (fetch
            // failure / offline / DNS). Política propia: 3 retries con
            // baseDelay 500ms — la conexión puede estabilizarse.
            console.error("Error fetching session messages:", error);
            const policy = _classifyFetchSessionRetry(null, true);
            if (policy.retryable && retryCount < policy.maxRetries) {
                const delayMs = _computeFetchBackoffMs(policy.baseDelayMs, retryCount);
                console.warn(`⏳ [fetchSessionMessages] retry network ${retryCount + 1}/${policy.maxRetries} en ${delayMs}ms`);
                setTimeout(() => fetchSessionMessages(sessionId, retryCount + 1), delayMs);
                return;
            }
            _captureAgentPageException(error, { action: 'fetchSessionMessages', retried: 'true' });
            // [P1-AGENT-WELCOME-STABLE · 2026-05-20]
            _setWelcomeIfAbsent();
        } finally {
            // [P2-FETCH-RETRY-ADAPTIVE · 2026-05-19] Cierra el loader si
            // (a) éxito, o (b) llegamos al cap máximo de cualquier bucket
            // (3, según el clasificador). NO cierra si vamos a reintentar.
            const _MAX_RETRIES_GLOBAL = 3;
            if (retryCount >= _MAX_RETRIES_GLOBAL || (response && response.ok)) {
                setIsLoadingHistory(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setMessages, setIsLoadingHistory, _setWelcomeIfAbsent]);

    const handleDeleteChat = async (sessionIdToDelete, e) => {
        if (e) e.stopPropagation();
        try {
            const response = await fetchWithAuth(`/api/chat/session/${sessionIdToDelete}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setChatSessions(prev => prev.filter(s => s.id !== sessionIdToDelete));
                deleteChatDraft(sessionIdToDelete).catch(() => {});

                // Si borramos el chat actual activo, redirigimos a un chat nuevo.
                // [P1-AGENT-SESSION-DAY · 2026-08-14] Sin escribir la clave a
                // mano: `setCurrentSessionId` ya persiste sesión Y día. El
                // `safeLocalStorageSet` que había aquí guardaba la sesión sin su
                // marca de día — dos escritores de la misma clave, y uno de
                // ellos dejándola a medias.
                if (currentSessionId === sessionIdToDelete) {
                    setCurrentSessionId(crypto.randomUUID());
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error("Error al eliminar el chat devuelto por el servidor:", errorData);
                // [P1-CHAT-DELETE-TOUCH · 2026-08-10] Las dos ramas de fallo solo
                // hacían console.error: la conversación seguía en la lista y el
                // usuario no tenía forma de saber si había borrado o no. En consola
                // no mira nadie, y menos desde un teléfono.
                toast.error(t('No pudimos eliminar la conversación. Inténtalo de nuevo.'));
            }
        } catch (error) {
            console.error("Excepción eliminando chat:", error);
            toast.error(t('No pudimos eliminar la conversación. Revisa tu conexión.'));
            _captureAgentPageException(error, { action: 'deleteChat' });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Cargar sesiones al abrir la pagina (para todos los usuarios)
    useEffect(() => {
        fetchChatSessions();
    }, [fetchChatSessions]);

    // Polling moderado (2500ms) para actualizar el título dinámico, con tope de 8 intentos (~20s)
    useEffect(() => {
        const isGenerating = chatSessions.some(s => s.title === 'Generando título...');
        if (!isGenerating) {
            setTitlePollCount(0);
            return;
        }
        if (titlePollCount >= 8) return; // Tope: evitar polling infinito

        const intervalId = setInterval(() => {
            // [P4-TITLE-POLL-VISIBILITY] no consumir red ni avanzar el cap en background tab.
            if (typeof document !== 'undefined' && document.hidden) return;
            setTitlePollCount(prev => prev + 1);
            fetchChatSessions();
        }, 2500);

        return () => clearInterval(intervalId);
    }, [chatSessions, fetchChatSessions, titlePollCount]);

    // Cargar historial de mensajes de forma segura (evitar 403 prematuro)
    useEffect(() => {
        // SIEMPRE esperar a que la sesión de el backend anterior esté hidratada antes de hacer peticiones autenticadas
        if (!session?.user?.id) return;
        if (!currentSessionId) return;

        fetchSessionMessages(currentSessionId);
    }, [currentSessionId, fetchSessionMessages, session?.user?.id]);

    // [P1-CHAT-REFRESH-RECOVER · 2026-07-12] Turno huérfano tras un refresh:
    // el usuario envió, recargó a mitad de la respuesta y el estado del turno
    // murió con la página — su mensaje quedaba MUDO para siempre (sin
    // indicador "pensando", sin respuesta, sin retry). Al detectar "último
    // mensaje = user y nada en vuelo": mostramos el indicador, sondeamos el
    // historial (si el server alcanzó a completar y persistir, la respuesta
    // aparece) y si tras ~26s no llegó, dejamos una burbuja retryable. Mismo
    // espíritu que el spinner del swap que sobrevive refresh (P1-SWAP-REGEN-
    // RESUME). El sondeo es CONSERVADOR: solo rehidrata del server cuando este
    // va igual o adelante del estado local (no pierde la burbuja huérfana).
    const [recoveringTurn, setRecoveringTurn] = useState(false);
    const _recoveryRef = useRef({ active: false, attempts: 0, timer: null });

    useEffect(() => () => {
        const st = _recoveryRef.current;
        if (st.timer) { clearTimeout(st.timer); st.timer = null; }
        st.active = false;
    }, []);

    useEffect(() => {
        const last = messages[messages.length - 1];
        const orphan = Boolean(
            last && last.role === 'user' && !isLoading && !isLoadingHistory
        );
        const st = _recoveryRef.current;
        if (!orphan) {
            if (st.active) {
                st.active = false;
                st.attempts = 0;
                if (st.timer) { clearTimeout(st.timer); st.timer = null; }
                setRecoveringTurn(false);
            }
            return;
        }
        if (st.active) return; // ya sondeando este huérfano

        // [P1-CHAT-STOP-POWER · 2026-07-12] Firma del episodio: mismo huérfano
        // = mismos intentos (sin resets infinitos), y un huérfano descartado
        // con el botón Stop (doneSig) no relanza el episodio. Pre-fix, una
        // rehidratación prematura reiniciaba attempts=0 en bucle → el
        // "Recuperando tu respuesta…" quedaba TRABADO para siempre.
        const _sig = _orphanSig(messages);
        if (st.doneSig === _sig) return;
        // [P1-CHAT-STOP-POWER v2] Descarte persistente: si este huérfano fue
        // detenido/agotado en una sesión anterior de la página, no relanzar.
        if (safeLocalStorageGet(_orphanDismissKey(currentSessionId), null) === _sig) {
            st.doneSig = _sig;
            return;
        }
        if (st.sig !== _sig) {
            st.sig = _sig;
            st.attempts = 0;
        }
        if (st.attempts > 30) return; // episodio ya agotado para este huérfano

        st.active = true;
        setRecoveringTurn(true);

        const _poll = async () => {
            const cur = _recoveryRef.current;
            if (!cur.active) return;
            cur.attempts += 1;
            if (cur.attempts > 30) {
                cur.active = false;
                cur.doneSig = cur.sig; // episodio agotado — no relanzar este huérfano
                // [P1-CHAT-STOP-POWER v2] Persistir el agotamiento: sin esto un
                // refresh re-sondeaba 26s más por el mismo huérfano.
                safeLocalStorageSet(_orphanDismissKey(currentSessionId), cur.sig);
                setRecoveringTurn(false);
                setMessages(prev => {
                    const lastPrev = prev[prev.length - 1];
                    if (!lastPrev || lastPrev.role !== 'user') return prev;
                    const canRetry = Boolean((lastPrev.content || '').trim()) && !lastPrev.isImage;
                    return [...prev, {
                        role: 'model',
                        content: canRetry
                            ? t('⚠ La página se recargó antes de que llegara la respuesta. Puedes reintentar.')
                            : t('⚠ La página se recargó antes de que llegara la respuesta. Vuelve a enviar tu mensaje (o la foto).'),
                        errorType: 'refresh_orphan',
                        retryable: canRetry,
                        retryPrompt: canRetry ? lastPrev.content : null,
                        retryImageUrl: null,
                        _isErrorBubble: true,
                    }];
                });
                return;
            }
            try {
                const res = await fetchWithAuth(`/api/chat/history/${currentSessionId}`);
                if (res.ok) {
                    const data = await res.json();
                    // [P1-CHAT-STOP-POWER] Filtrar como el display (fuera títulos
                    // de sistema y vacíos) y exigir que el ÚLTIMO sea del modelo:
                    // "hay respuesta nueva de verdad". Pre-fix contaba filas de
                    // sistema → rehidratación prematura sin respuesta → el
                    // huérfano renacía y el episodio se reiniciaba en bucle.
                    const srv = (data?.messages || []).filter(m => (
                        m && m.content
                        && !(m.role === 'model' && String(m.content).startsWith('[SYSTEM_TITLE]'))
                    ));
                    const srvLast = srv[srv.length - 1];
                    const localCount = (messagesRef.current || [])
                        .filter(m => !m.isWelcome && !m._isErrorBubble).length;
                    if (srv.length >= localCount + 1 && srvLast && srvLast.role === 'model') {
                        cur.active = false;
                        cur.doneSig = cur.sig; // respuesta encontrada — episodio cerrado
                        setRecoveringTurn(false);
                        fetchSessionMessages(currentSessionId);
                        return;
                    }
                }
            } catch { /* red inestable — seguir sondeando */ }
            cur.timer = setTimeout(_poll, 8000);
        };
        st.timer = setTimeout(_poll, 2500);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, isLoading, isLoadingHistory, currentSessionId]);

    const handleNewChat = () => {
        // [P1-CHAT-TURN-ACTIVE · 2026-08-10] Era el único camino sin guard: tocar
        // «Nuevo chat» a mitad de una respuesta dejaba el stream anterior vivo
        // escribiendo sobre el estado de la conversación NUEVA. Se corta el turno en
        // vez de bloquear el toque — bloquearlo en silencio es peor: el usuario
        // toca, no pasa nada y no sabe por qué.
        if (isTurnActiveRef.current) {
            try { abortControllerRef.current?.abort(); } catch { /* ya cerrado */ }
            abortControllerRef.current = null;
            setAbortController(null);
            _setTurnActive(false);
            setIsLoading(false);
            setStreamingStatus(null);
        }
        const newId = crypto.randomUUID();
        setGuestSessionIds(prev => {
            const newList = [newId, ...prev].slice(0, 40);
            safeLocalStorageSet('mealfit_guest_sessions_list', JSON.stringify(newList));
            return newList;
        });
        setCurrentSessionId(newId);
        setMessages([{ role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true, welcomeAt: Date.now() }]);
        setInput('');
        clearSelectedFile();
        attachmentUploadCacheRef.current.clear();
        fetchChatSessions();
        if (window.innerWidth <= 768) {
            setShowSidebar(false);
        }
    };

    const handleSend = async (overrideInput = null, options = {}) => {
        triggerMobileHaptic('medium');
        const textToSend = typeof overrideInput === 'string' ? overrideInput : input;
        if (!isOnline) {
            triggerMobileHaptic('warning');
            toast.error(t('Estás sin conexión. Tu borrador está guardado y podrás enviarlo al volver.'));
            return;
        }

        // [P1-CHAT-TURN-ACTIVE · 2026-08-10] El guard mira el turno, no el «pensando»:
        // con `isLoading` quedaba abierto desde el primer token y se podían solapar
        // dos streams sobre la misma burbuja. Y lee el REF, no el state: dos toques
        // en el mismo frame de React ven ambos el valor viejo.
        const overrideAttachments = Array.isArray(options.overrideAttachments)
            ? options.overrideAttachments
            : (options.overrideImageUrl ? [{ id: `legacy-${Date.now()}`, url: options.overrideImageUrl, status: 'ready' }] : []);
        if ((!textToSend.trim() && attachments.length === 0 && overrideAttachments.length === 0) || isTurnActiveRef.current) return;

        // El lock nace antes de esperar la preparación: dos taps mientras un HEIC se
        // decodifica no pueden abrir dos turnos con snapshots distintos.
        _setTurnActive(true);
        const clientMessageId = options.clientMessageId || crypto.randomUUID();
        let currentAttachments = overrideAttachments;
        if (!currentAttachments.length) {
            try {
                currentAttachments = await waitUntilSettled();
            } catch (error) {
                _setTurnActive(false);
                handleAttachmentReject(error?.code || 'IMAGE_PREP_FAILED');
                return;
            }
        }
        // El usuario puede detener/cambiar de chat mientras una foto termina de
        // prepararse. La preparación puede acabar, pero ese turno ya no tiene permiso
        // para crear una burbuja ni abrir una petición con la sesión anterior.
        if (!isTurnActiveRef.current || (!textToSend.trim() && currentAttachments.length === 0)) {
            _setTurnActive(false);
            return;
        }

        if (isListening) {
            recognitionRef.current?.stop();
        }

        // Asegurar que el currentSessionId esté en la lista de localStorage.
        // [P2-A · 2026-05-08] safeJSONParse + self-heal: corrupto → fallback []
        // y storage reescrito; el flujo siguiente añade currentSessionId arriba.
        // [P4-LOCALSTORAGE-LAZY-INIT] getItem crudo al tope de handleSend (antes
        // del try en ~1584) → SecurityError abortaría el envío en silencio.
        const savedListStr = safeLocalStorageGet('mealfit_guest_sessions_list', null);
        let currentList = safeJSONParse(savedListStr, [], {
            validator: Array.isArray,
            storageKey: 'mealfit_guest_sessions_list',
        });
        if (!currentList.includes(currentSessionId)) {
            currentList.unshift(currentSessionId);
            currentList = currentList.slice(0, 40);
            safeLocalStorageSet('mealfit_guest_sessions_list', JSON.stringify(currentList));
            setGuestSessionIds(currentList);
        }

        const userMsg = textToSend.trim();
        // [P3-CHAT-FOCUS-TELEM · 2026-05-19] Capturar si el textarea tenía
        // focus ANTES del setInput. Si sí (keyboard send con Enter), tras
        // limpiar input restauramos focus — typing flow continuo. Si NO
        // (tap del botón send en mobile), no refocus — abrir keyboard
        // post-tap es UX agresiva. Heurística usa document.activeElement
        // que es cross-browser.
        const _hadFocusPreSend = (
            typeof document !== 'undefined'
            && chatInputRef.current
            && document.activeElement === chatInputRef.current
        );

        setInput('');
        setIsLoading(true);

        // [P2-CHAT-SCROLL-RACE · 2026-05-19] Reset del guard: el user
        // acaba de mandar un mensaje, es señal afirmativa de que quiere
        // ver la respuesta entrando al fondo. Si había scrolleado arriba
        // para releer historial antes de mandar, ese intent ya quedó
        // cumplido — ahora queremos auto-scroll en la respuesta del bot.
        userScrolledUpRef.current = false;

        // [P3-CHAT-FOCUS-TELEM · 2026-05-19] Restore focus async para que
        // React termine el render del setInput('') antes — sino el focus
        // se pierde con el re-render del textarea. NO restaurar si modo
        // llamada (el voice flow no escribe).
        if (_hadFocusPreSend && !callModeRef.current) {
            setTimeout(() => {
                try { chatInputRef.current?.focus(); } catch (_e) { /* swallow */ }
            }, 0);
        }

        // [P1-CHAT-PHOTO-UX · 2026-07-12] El saludo automático se retira EN el
        // envío (no después del análisis/stream como hacía el shift tardío):
        // el usuario escribió — el welcome ya cumplió. El filter también evita
        // mutar con .shift() el mismo array que ya es state.
        const newMessages = (options.truncateIndex !== undefined
            ? messages.slice(0, options.truncateIndex)
            : [...messages]
        ).filter(m => !m.isWelcome);

        const originalUserMessageIndex = newMessages.length;
        const bubbleAttachments = currentAttachments.map((item) => ({
            id: item.attachment_id || item.id,
            url: item.url || item.image_url || item.thumbDataUrl || item.previewUrl,
            name: item.name || item.file?.name || item.sourceFile?.name,
            status: item.status || 'ready',
        })).filter((item) => item.url);
        if (bubbleAttachments.length) {
            newMessages.push({
                role: 'user',
                content: userMsg || '',
                isImage: true,
                imageUrl: bubbleAttachments[0]?.url || null,
                attachments: bubbleAttachments,
                clientMessageId,
            });
        } else {
            newMessages.push({ role: 'user', content: userMsg, clientMessageId });
        }

        setMessages(newMessages);

        // [P1-CHAT-ERROR-DIFF · 2026-05-19] Declarados arriba del try para que
        // el catch outer (network error) pueda referenciarlos al construir el
        // mensaje retryable.
        let uploadedImageUrl = null;
        let uploadedAttachments = overrideAttachments;

        try {
            // [P1-CHAT-STOP-POWER · 2026-07-12] El AbortController nace ANTES
            // del análisis de foto: el botón Detener cancela también la fase
            // "Analizando tu foto…" (gemma 30-90s), no solo el stream.
            const controller = new AbortController();
            setAbortController(controller);
            abortControllerRef.current = controller;

            const localAttachments = currentAttachments.filter((item) => item.file instanceof Blob);
            if (localAttachments.length) {
                setStreamingStatus(t('Analizando tus fotos… puede tardar un minuto'));
                const currentTzOffset = new Date().getTimezoneOffset();
                const uploadOne = async (item) => {
                    const cached = attachmentUploadCacheRef.current.get(item.id);
                    if (cached) return cached;
                    const uploadForm = new FormData();
                    uploadForm.append('file', item.file);
                    uploadForm.append('user_id', session?.user?.id || userProfile?.id || localSessionId);
                    uploadForm.append('session_id', currentSessionId);
                    uploadForm.append('purpose', 'chat');
                    uploadForm.append('tz_offset_mins', currentTzOffset.toString());
                    const response = await fetchWithAuth('/api/diary/upload', {
                        method: 'POST', body: uploadForm, signal: controller.signal,
                    });
                    if (!response.ok) {
                        const error = new Error('IMAGE_UPLOAD_FAILED');
                        error.status = response.status;
                        error.userMessage = {
                            413: t('Una de las fotos pesa demasiado. Prueba con una más liviana.'),
                            415: t('Una de las fotos no se pudo leer. Usa JPG, PNG o HEIC.'),
                            429: t('Vas muy rápido escaneando fotos. Espera unos segundos y reintenta.'),
                        }[response.status];
                        throw error;
                    }
                    const data = await response.json();
                    const uploaded = {
                        ...item,
                        attachment_id: data.attachment_id || item.id,
                        url: data.image_url || item.thumbDataUrl,
                        image_url: data.image_url || '',
                        description: data.analysis_failed ? null : data.description,
                        kind: data.photo_kind || 'plato',
                        analysis_failed: Boolean(data.analysis_failed),
                        busy: Boolean(data.busy),
                    };
                    attachmentUploadCacheRef.current.set(item.id, uploaded);
                    return uploaded;
                };
                try {
                    const uploadedById = new Map(
                        (await mapWithConcurrency(localAttachments, 2, uploadOne)).map((item) => [item.id, item]),
                    );
                    uploadedAttachments = currentAttachments.map((item) => uploadedById.get(item.id) || item);
                } catch (uploadError) {
                    if (uploadError?.name === 'AbortError') throw uploadError;
                    controller.abort();
                    setMessages((prev) => [...prev, _buildAgentErrorMessage({
                        status: uploadError?.status || 0,
                        userMessage: uploadError?.userMessage,
                        retryPrompt: userMsg,
                        retryAttachments: [],
                        retryWithCurrentAttachments: true,
                        retryTruncateIndex: originalUserMessageIndex,
                        clientMessageId,
                    })]);
                    return; // conserva el rail de adjuntos para reintentar sin volver a elegir
                }

                uploadedImageUrl = uploadedAttachments.find((item) => item.image_url)?.image_url || null;
                setMessages((prev) => prev.map((message, index) => {
                    if (index !== prev.length - 1 || message.role !== 'user' || !message.isImage) return message;
                    const remote = uploadedAttachments.map((item) => ({
                        id: item.attachment_id || item.id,
                        url: item.url || item.thumbDataUrl,
                        name: item.file?.name || item.sourceFile?.name,
                        description: item.description,
                        kind: item.kind,
                        image_url: item.image_url,
                    })).filter((item) => item.url);
                    return { ...message, attachments: remote, imageUrl: remote[0]?.url || message.imageUrl };
                }));
                clearSelectedFile();
                attachmentUploadCacheRef.current.clear();
            }

            // Interactuar por el chat normal SIEMPRE (incluso si solo hay imagen)
            if (userMsg || currentAttachments.length) {
                // Incorporate image URL into promptToSend so it's persisted in DB
                let promptToSend = userMsg || "";
                // Los adjuntos nuevos viven en la columna estructurada y renuevan su URL
                // al leer historial. No persistimos su firma temporal dentro del texto;
                // [IMAGE:] queda únicamente como compatibilidad para uploads legacy.
                const durableUrls = uploadedAttachments
                    .filter((item) => !item.attachment_id)
                    .map((item) => item.image_url || item.url)
                    .filter((url) => typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:'));
                if (durableUrls.length) {
                    promptToSend = `${durableUrls.map((url) => `[IMAGE: ${url}]`).join('\n')}\n${promptToSend}`;
                }

                // [P3-I18N-PROMPT-VISION-CLIENTE-ESPANOL · 2026-08-23] El contexto de la foto va
                // ESTRUCTURADO al servidor, que compone el bloque y lo pone en el SYSTEM prompt.
                // Hasta hoy este cliente metía cuatro bloques «[Sistema: …] Instrucción: …» en
                // español DENTRO del turno del usuario: el modelo los leía como si el usuario
                // hablara español — la señal más fuerte hacia el español, justo la que la
                // directiva de idioma del servidor intenta vencer. La hora tampoco viaja: el
                // servidor ya la pone (`build_temporal_context`, con `local_date`/`tz_offset`).
                // El turno del usuario vuelve a ser SOLO lo suyo (más el `[IMAGE: url]`).
                const visionItems = uploadedAttachments.map((item) => ({
                    attachment_id: item.attachment_id || item.id,
                    kind: item.description
                        ? (item.kind === 'otro' ? 'otro' : (item.kind === 'items' ? 'items' : 'plato'))
                        : 'unavailable',
                    description: item.description || undefined,
                    reason: item.reason || (item.busy ? 'busy' : (item.description ? undefined : 'down')),
                }));
                const visionPayload = visionItems.length
                    ? { kind: 'multi', items: visionItems, has_text: !!userMsg }
                    : null;
                const enrichedPrompt = promptToSend;

                setStreamingStatus(t('Conectando...'));
                // [P1-CHAT-PHOTO-UX] El welcome ya se filtró al construir
                // newMessages en el send — el shift tardío (que además mutaba
                // el array-state en sitio) se eliminó.

                setChatSessions((prev) => {
                    const exists = prev.some(s => s.id === currentSessionId);
                    if (!exists) {
                        // [I18N-EXEMPT: CENTINELA que el backend reconoce para saber que el titulo aun no existe (P1-I18N-CHAT-TITULOS-SERVIDOR)]
                        return [{ id: currentSessionId, title: 'Generando título...', created_at: new Date().toISOString() }, ...prev];
                    }
                    return prev;
                });

                const now = new Date();
                const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                // [P1-CHAT-STOP-POWER · 2026-07-12] El controller ya nació al
                // inicio del try (cubre también el análisis de foto).

                // [P3-CHAT-FOCUS-TELEM · 2026-05-19] Performance markers
                // del stream. `_streamStartedAt` baseline para TTFB +
                // total duration; `_firstChunkAt` se setea con el primer
                // dataObj.type === 'chunk' recibido.
                const _streamStartedAt = (typeof performance !== 'undefined' && performance.now)
                    ? performance.now()
                    : Date.now();
                let _firstChunkAt = null;
                let _chunkCount = 0;

                const response = await fetchWithAuth('/api/chat/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                        session_id: currentSessionId,
                        user_id: session?.user?.id || userProfile?.id || localSessionId,
                        prompt: enrichedPrompt,
                        vision: visionPayload,
                        attachments: uploadedAttachments.filter((item) => item.attachment_id).map((item, index) => ({
                            attachment_id: item.attachment_id,
                            position: index,
                            name: item.name || item.file?.name || item.sourceFile?.name,
                            content_type: item.file?.type || item.content_type,
                        })),
                        client_message_id: clientMessageId,
                        current_plan: planData,
                        form_data: formData,
                        local_date: localDateStr,
                        tz_offset: now.getTimezoneOffset(),
                        is_call_mode: !!callModeRef.current
                    })
                });

                if (response.ok) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder("utf-8");
                    let fullText = "";
                    let isMessageCreated = false;
                    let buffer = "";
                    let lastSpokenIndex = 0;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');

                        // Guardar la última línea incompleta en el buffer
                        buffer = lines.pop() || "";

                        for (const line of lines) {
                            if (line.trim().startsWith('data: ')) {
                                try {
                                    const dataObj = JSON.parse(line.trim().substring(6));

                                    if (dataObj.type === 'progress') {
                                        setStreamingStatus(dataObj.message);
                                        // [P1-CHAT-NARRATION-KEPT-REVIEW-1 · 2026-07-28]
                                        // El backend une pasadas narrate-then-act con
                                        // '\n\n' en `done.response`
                                        // (`_build_final_content_from_messages`,
                                        // agent.py `"\n\n".join(parts)`), pero el stream
                                        // de chunks crudo NUNCA insertaba ese separador
                                        // — cada `progress` (post-narración, pre-tool_call)
                                        // es la única señal de que una NUEVA pasada está
                                        // por comenzar (ver el fallback genérico en
                                        // agent.py que garantiza un `progress` por CADA
                                        // tool_call, no solo las 5-6 nombradas). Insertar
                                        // el mismo separador acá hace que `fullText`
                                        // acumulado en vivo coincida con `done.response`
                                        // byte a byte → `reconcileFinalChatText` detecta
                                        // el caso 'extend' real (sin esto, SIEMPRE caía a
                                        // 'replace' — reflow visible al final del turno).
                                        // El primer `progress` ('analizando', antes de
                                        // cualquier chunk) es un no-op acá porque
                                        // `fullText` todavía está vacío.
                                        if (fullText && !fullText.endsWith('\n\n')) {
                                            fullText += '\n\n';
                                        }
                                    } else if (dataObj.type === 'chunk') {
                                        // [P3-CHAT-FOCUS-TELEM · 2026-05-19]
                                        // Marcar TTFB la primera vez que
                                        // llega un chunk. Subsiguientes
                                        // increment count para emitir en done.
                                        if (_firstChunkAt === null) {
                                            _firstChunkAt = (typeof performance !== 'undefined' && performance.now)
                                                ? performance.now()
                                                : Date.now();
                                        }
                                        _chunkCount += 1;
                                        fullText += dataObj.text;

                                        let displayContent = fullText;
                                        // Detectar y procesar los tags silenciosos UI_ACTION.
                                        // [P1-CHAT-NARRATION-KEPT · 2026-07-28] SSOT compartida con
                                        // el path `done` vía `stripUiActionTags` — antes eran 3
                                        // bloques if duplicados que podían divergir entre paths.
                                        fullText = stripUiActionTags(fullText, {
                                            onRefreshPlan: () => {
                                                if (session?.user?.id) {
                                                    restoreSessionData(session.user.id);
                                                }
                                            },
                                            // [P3-WATER-TRACKER · 2026-05-16] REFRESH_HYDRATION: el
                                            // agente mutó el conteo de vasos via log_water_glass →
                                            // notificar al WaterTracker para que refetchee. Custom
                                            // event en lugar de restoreSessionData (el card vive
                                            // independiente del session).
                                            onRefreshHydration: () => {
                                                window.dispatchEvent(new CustomEvent('mealfit:refresh-hydration'));
                                            },
                                            // [P1-CHAT-UI-ACTION-INVENTORY · 2026-05-20] REFRESH_INVENTORY:
                                            // el agente mutó consumed_meals (log_consumed_meal) o
                                            // user_inventory (modify_pantry_inventory /
                                            // mark_shopping_list_purchased) → notificar al card de
                                            // Progreso (TrackingProgress, lee consumed_meals) y al
                                            // refresh de inventory del Dashboard. Sin esto, el tag se
                                            // renderiza tal cual al user (bug visible reportado
                                            // 2026-05-20) + nadie refetchea hasta el próximo polling
                                            // de 15s. Custom event análogo a refresh-hydration.
                                            onRefreshInventory: () => {
                                                window.dispatchEvent(new CustomEvent('mealfit:refresh-inventory'));
                                            },
                                        });
                                        // Ocultar fragmento incompleto del token temporalmente en la UI
                                        // (idempotente — si ya fue procesado arriba, no queda nada que ocultar).
                                        displayContent = fullText.replace(/\[UI_ACT[^\]]*$/g, '');

                                        // Extraer oraciones completas para TTS en Modo Llamada
                                        if (callModeRef.current) {
                                            const textSoFar = fullText.substring(lastSpokenIndex);
                                            const match = textSoFar.match(/.*?[.!?\n](?=\s|$)/);
                                            if (match) {
                                                const sentenceToSpeak = match[0].trim();
                                                lastSpokenIndex += match[0].length;
                                                if (sentenceToSpeak) {
                                                    queueTTS(sentenceToSpeak);
                                                }
                                            }
                                        }

                                        if (!isMessageCreated) {
                                            isMessageCreated = true;
                                            setIsLoading(false);
                                            setStreamingStatus(null);
                                            setMessages(prev => [...prev, { role: 'model', content: displayContent, isStreaming: true }]);
                                        } else {
                                            setMessages(prev => {
                                                const updated = [...prev];
                                                if (updated.length > 0 && updated[updated.length - 1].isStreaming) {
                                                    updated[updated.length - 1] = { ...updated[updated.length - 1], content: displayContent };
                                                }
                                                return updated;
                                            });
                                        }
                                    } else if (dataObj.type === 'done') {
                                        // [P3-CHAT-FOCUS-TELEM · 2026-05-19]
                                        // Emitir telemetría de latencia +
                                        // chunk count. Sentry breadcrumb +
                                        // console.info estructurado.
                                        const _doneAt = (typeof performance !== 'undefined' && performance.now)
                                            ? performance.now()
                                            : Date.now();
                                        _emitChatPerfTelemetry({
                                            ttfbMs: _firstChunkAt !== null ? _firstChunkAt - _streamStartedAt : null,
                                            streamTotalMs: _doneAt - _streamStartedAt,
                                            chunkCount: _chunkCount,
                                            isCallMode: !!callModeRef.current,
                                            sessionId: currentSessionId,
                                        });
                                        setIsLoading(false);
                                        setStreamingStatus(null);

                                        // [P1-CHAT-NARRATION-KEPT · 2026-07-28] Reconciliar en vez de
                                        // reemplazo ciego. `fullText` en este punto es lo que el usuario
                                        // YA está leyendo (acumulado de eventos `chunk`, tags UI_ACTION
                                        // ya limpios). El backend arma `done.response` uniendo TODAS las
                                        // AIMessage del turno (ver agent.py `_build_final_content_from_messages`),
                                        // así que en el caso sano `done.response` EXTIENDE lo ya mostrado
                                        // — antes un blind-replace lo sustituía por una versión más corta,
                                        // el usuario veía el texto que leía "desaparecer".
                                        // Defense-in-depth: si por lo que sea el payload final NO extiende
                                        // lo mostrado, reemplaza por completo (nunca concatena texto no
                                        // relacionado).
                                        const _displayedBeforeDone = fullText;
                                        // Limpieza de seguridad al final por si el chunk llegó mal cortado
                                        // (misma SSOT `stripUiActionTags` que el path de chunk streaming).
                                        const _finalResponse = stripUiActionTags(dataObj.response, {
                                            onRefreshPlan: () => {
                                                if (session?.user?.id) {
                                                    restoreSessionData(session.user.id);
                                                }
                                            },
                                            // [P3-WATER-TRACKER · 2026-05-16] Misma limpieza para REFRESH_HYDRATION.
                                            onRefreshHydration: () => {
                                                window.dispatchEvent(new CustomEvent('mealfit:refresh-hydration'));
                                            },
                                            // [P1-CHAT-UI-ACTION-INVENTORY · 2026-05-20] Misma limpieza
                                            // final para REFRESH_INVENTORY. Defense-in-depth: si el chunk
                                            // streaming no contenía el tag completo (race), el evento `done`
                                            // trae el response completo donde sí está.
                                            onRefreshInventory: () => {
                                                window.dispatchEvent(new CustomEvent('mealfit:refresh-inventory'));
                                            },
                                        });
                                        fullText = reconcileFinalChatText(_displayedBeforeDone, _finalResponse);

                                        if (callModeRef.current) {
                                            const remainingText = fullText.substring(lastSpokenIndex).trim();
                                            if (remainingText) {
                                                queueTTS(remainingText);
                                            }
                                        }

                                        if (!isMessageCreated) {
                                            isMessageCreated = true;
                                            setMessages(prev => [...prev, { role: 'model', content: fullText }]);
                                        } else {
                                            setMessages(prev => {
                                                const updated = [...prev];
                                                if (updated.length > 0 && updated[updated.length - 1].isStreaming) {
                                                    updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullText, isStreaming: false };
                                                }
                                                return updated;
                                            });
                                        }

                                        // Acciones post-respuesta
                                        fetchChatSessions();
                                        if (messages.length === 0) {
                                            setTimeout(fetchChatSessions, 4000);
                                            setTimeout(fetchChatSessions, 8000);
                                        }

                                        if (dataObj.updated_fields && Object.keys(dataObj.updated_fields).length > 0) {
                                            Object.entries(dataObj.updated_fields).forEach(([field, val]) => {
                                                if (updateData) updateData(field, val);
                                            });
                                        }
                                        // Si el agente generó un plan nuevo, actualizarlo
                                        if (dataObj.new_plan) {
                                            saveGeneratedPlan(dataObj.new_plan);
                                        }

                                        // [P2-AUDIT-NEW-1 · 2026-05-12] Consumir
                                        // `coherence_warnings` propagados desde
                                        // el state del LangGraph (acumulados
                                        // por `execute_tools` cuando
                                        // `modify_single_meal` retorna
                                        // `_coherence_warnings` del guard
                                        // P2-COHERENCE-1). Toast no-bloqueante
                                        // — silencio si lista vacía o ausente.
                                        emitCoherenceToast(toast, dataObj.coherence_warnings);

                                        // [P3-PANTRY-INVALIDATE-FROM-CHAT · 2026-05-22]
                                        // Si el backend marcó que una tool del agente
                                        // mutó `user_inventory` (modify_pantry_inventory
                                        // o log_consumed_meal con ingredients), setear
                                        // la key localStorage que Pantry.jsx escucha
                                        // para invalidar su cache TTL=30s al próximo
                                        // mount o storage event. Defensa en profundidad
                                        // sobre el canal Realtime (puede tener lag o
                                        // estar cerrado si el user navega entre tabs
                                        // durante la conversación con el agente).
                                        if (dataObj.pantry_modified_at) {
                                            try {
                                                safeLocalStorageSet(
                                                    'mealfit_pantry_dirty_at',
                                                    String(dataObj.pantry_modified_at)
                                                );
                                            } catch (_lsErr) {
                                                // QuotaExceeded / private mode — silencioso.
                                            }
                                            // [P3-PANTRY-INVALIDATE-MISMO-TAB · 2026-05-22]
                                            // El `storage` event NO se dispara en el
                                            // mismo tab que escribió la key — solo cross-tab.
                                            // Si el user tiene Pantry montado en el mismo
                                            // tab (SPA navigation, modal del chat, widget),
                                            // el listener storage de Pantry.jsx no se
                                            // entera. Disparamos también un CustomEvent
                                            // intra-tab que Pantry.jsx escucha y refetchea.
                                            try {
                                                window.dispatchEvent(new CustomEvent(
                                                    'mealfit:pantry-dirty',
                                                    { detail: { at: dataObj.pantry_modified_at } }
                                                ));
                                            } catch (_evtErr) { /* CustomEvent unsupported edge — skip */ }
                                        }

                                        // [P3-AGENT-DEPLETE · 2026-05-22 · simplified
                                        // P3-DEPLETED-BD · 2026-05-22] Cuando el agente
                                        // marca items como AGOTADOS, el backend YA los
                                        // persiste en la tabla BD `user_depleted_items`
                                        // (tool helper `add_depleted_item`). El realtime
                                        // channel de Pantry.jsx sincroniza cross-device.
                                        // Solo mantenemos un best-effort merge al cache
                                        // localStorage (sin dedupe complejo) para que
                                        // mismo-tab pre-realtime-sync vea el cambio al
                                        // navegar a /pantry. El fetch desde BD en el
                                        // mount de Pantry pisa el cache stale.
                                        if (Array.isArray(dataObj.pantry_depleted_items) && dataObj.pantry_depleted_items.length > 0) {
                                            try {
                                                const raw = window.localStorage.getItem('mealfit_depleted_items');
                                                const current = raw ? (JSON.parse(raw) || []) : [];
                                                const keyOf = (e) => String(
                                                    e?.master_ingredient_id ||
                                                    (e?.ingredient_name || '').toString().trim().toLowerCase()
                                                );
                                                const incomingKeys = new Set(
                                                    dataObj.pantry_depleted_items.map(keyOf)
                                                );
                                                const merged = [
                                                    ...(Array.isArray(current) ? current : []).filter(e => !incomingKeys.has(keyOf(e))),
                                                    ...dataObj.pantry_depleted_items,
                                                ];
                                                safeLocalStorageSet(
                                                    'mealfit_depleted_items',
                                                    JSON.stringify(merged)
                                                );
                                            } catch (_lsErr) {
                                                // QuotaExceeded / private mode / parse fail — silencioso.
                                            }
                                        }

                                        // Actualizar contador de créditos en tiempo real
                                        setTimeout(async () => {
                                            await checkPlanLimit(session?.user?.id || userProfile?.id || localSessionId);
                                        }, 1000);

                                    } else if (dataObj.type === 'error') {
                                        // [P1-CHAT-ERROR-DIFF · 2026-05-19]
                                        // Error emitido por el LangGraph mid-stream
                                        // (tool falló, exception interna). Retryable.
                                        setIsLoading(false);
                                        setStreamingStatus(null);
                                        setMessages(prev => [...prev, _buildAgentErrorMessage({
                                            status: 500,
                                            retryPrompt: userMsg,
                                            retryImageUrl: uploadedImageUrl,
                                            retryAttachments: _durableRetryAttachments(uploadedAttachments),
                                            retryTruncateIndex: originalUserMessageIndex,
                                            clientMessageId,
                                            isAgentError: true,
                                        })]);
                                    }
                                } catch (e) {
                                    // Ignorar lineas JSON rotas temporalmente
                                }
                            }
                        }
                    }
                } else {
                    // [P1-CHAT-ERROR-DIFF · 2026-05-19] Diferenciación de status
                    // del backend: 504 (timeout LLM, P0-CHAT-LLM-TIMEOUT) y 503
                    // (circuit breaker abierto, P1-CHAT-CB) merecen copy
                    // específico — el usuario debe saber si el problema es
                    // transitorio (reintentar pronto) o necesita esperar más
                    // (saturación). Quota/auth NO son retryables.
                    setMessages(prev => [...prev, _buildAgentErrorMessage({
                        status: response.status,
                        retryPrompt: userMsg,
                        retryImageUrl: uploadedImageUrl,
                        retryAttachments: _durableRetryAttachments(uploadedAttachments),
                        retryTruncateIndex: originalUserMessageIndex,
                        clientMessageId,
                    })]);
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {

                return;
            }
            console.error("Chat Error:", error);
            // [P1-CHAT-ERROR-DIFF · 2026-05-19] Network errors (fetch failure,
            // DNS, offline) llegan acá como TypeError; status=0 dispara el
            // copy "Sin conexión" + botón Reintentar.
            setMessages(prev => [...prev, _buildAgentErrorMessage({
                status: 0,
                retryPrompt: userMsg,
                retryImageUrl: uploadedImageUrl,
                retryAttachments: _durableRetryAttachments(uploadedAttachments),
                retryTruncateIndex: originalUserMessageIndex,
                clientMessageId,
            })]);
        } finally {
            setIsLoading(false);
            // [P1-CHAT-TURN-ACTIVE] ÚNICO punto autoritativo de apagado: el `finally`
            // cubre las cuatro salidas (done, error del stream, abort y excepción).
            // Apagarlo en cualquier rama concreta reabre el hueco por otra puerta.
            _setTurnActive(false);
            setStreamingStatus(null);
            setAbortController(null);
        }
    };

    useEffect(() => {
        handleSendRef.current = handleSend;
    }); // cada commit conserva la clausura más reciente sin una lista manual incompleta

    const handleStopGeneration = () => {
        if (abortController) {
            abortController.abort();
            setAbortController(null);
            abortControllerRef.current = null;
            setIsLoading(false);
            // [P1-CHAT-TURN-ACTIVE] Apagado eager para que la UI responda al toque sin
            // esperar al `finally` del fetch abortado (que también lo apagará).
            _setTurnActive(false);
            setStreamingStatus(null);
            // Si se detuvo A MITAD del stream, la burbuja se quedaba con
            // `isStreaming: true` para siempre: sin Copiar ni Regenerar sobre lo que
            // sí llegó, y el efecto de caché saltándose la persistencia. Detener es
            // terminar el turno, no dejarlo colgado.
            setMessages(prev => {
                if (!prev.length) return prev;
                const last = prev[prev.length - 1];
                if (!last || !last.isStreaming) return prev;
                return [...prev.slice(0, -1), { ...last, isStreaming: false }];
            });
        }
        if (isTurnActiveRef.current) {
            _setTurnActive(false);
            setIsLoading(false);
            setStreamingStatus(null);
        }
        // [P1-CHAT-STOP-POWER · 2026-07-12] El stop también cancela la
        // recuperación de un turno huérfano ("Recuperando tu respuesta…"):
        // marca el huérfano como descartado (doneSig + localStorage — el ref
        // muere con el refresh y la recuperación resucitaba), limpia timers,
        // libera la UI y deja constancia VISIBLE de que el usuario detuvo.
        const _st = _recoveryRef.current;
        const _wasRecovering = _st.active || recoveringTurn;
        if (_wasRecovering) {
            _st.active = false;
            if (_st.timer) { clearTimeout(_st.timer); _st.timer = null; }
            setRecoveringTurn(false);
        }
        // Firma calculada ANTES de añadir la burbuja (sobre mensajes reales).
        const _sig = _orphanSig(messagesRef.current);
        _st.doneSig = _sig;
        safeLocalStorageSet(_orphanDismissKey(currentSessionId), _sig);
        // [P1-CHAT-STOP-POWER v2] Feedback visible del stop (pedido del owner).
        setMessages(prev => {
            const lastPrev = prev[prev.length - 1];
            if (lastPrev && lastPrev._stoppedByUser) return prev; // sin duplicar
            return [...prev, {
                role: 'model',
                content: t('⏹ Detenido. Cuando quieras, vuelve a enviar tu mensaje.'),
                _stoppedByUser: true,
                _isErrorBubble: true,
                retryable: false,
            }];
        });
    };

    const retryErrorMessage = useStableCallback((message) => {
        if (!message?.retryable) return;
        const useCurrentAttachments = Boolean(message.retryWithCurrentAttachments);
        if (
            !message.retryPrompt
            && !message.retryImageUrl
            && !message.retryAttachments?.length
            && !useCurrentAttachments
        ) return;
        handleSend(message.retryPrompt || '', {
            ...(useCurrentAttachments ? {} : {
                overrideAttachments: message.retryAttachments || (message.retryImageUrl
                    ? [{ id: 'legacy-retry', url: message.retryImageUrl, status: 'ready' }]
                    : []),
            }),
            truncateIndex: message.retryTruncateIndex,
            clientMessageId: message.clientMessageId,
        });
    });

    const handleRegenerate = useStableCallback((modelMsgIndex) => {
        if (isTurnActiveRef.current) return;   // [P1-CHAT-TURN-ACTIVE] regenerar durante un turno abria un 2o stream

        const targetMsg = messagesRef.current[modelMsgIndex];

        // 1. Mensaje de bienvenida autónomo (se reemplaza en el mismo lugar)
        if (targetMsg?.isWelcome) {
            setMessages(prev => {
                const updated = [...prev];
                updated[modelMsgIndex] = {
                    role: 'model',
                    content: generateIntelligentWelcome(userProfile, formData, planData),
                    isWelcome: true,
                    welcomeAt: Date.now()
                };
                return updated;
            });
            return;
        }

        // 2. Mensaje normal de chat
        let lastUserMsgIdx = -1;
        for (let i = modelMsgIndex - 1; i >= 0; i--) {
            if (messagesRef.current[i].role === 'user') {
                lastUserMsgIdx = i;
                break;
            }
        }

        if (lastUserMsgIdx !== -1) {
            const lastUserMsg = messagesRef.current[lastUserMsgIdx];
            handleSend(lastUserMsg.content, {
                truncateIndex: lastUserMsgIdx,
                overrideAttachments: lastUserMsg.attachments || (lastUserMsg.imageUrl
                    ? [{ id: `legacy-${lastUserMsgIdx}`, url: lastUserMsg.imageUrl }]
                    : []),
                clientMessageId: lastUserMsg.clientMessageId,
            });
        }
    });

    const handleKeyDown = (e) => {
        // [P1-CHAT-MOBILE-ENTER · 2026-08-10] En un teclado táctil NO existe
        // Shift+Enter, así que «Enter envía salvo con Shift» dejaba imposible
        // escribir una segunda línea desde el teléfono — pese a que el textarea
        // crece hasta 120px justo para eso. El razonamiento era de escritorio
        // aplicado a móvil. En móvil manda el botón de enviar, que está al lado.
        if (isMobile) return;
        // Mientras se compone un carácter (acentos, dictado, teclados IME) el
        // navegador emite Enter con keyCode 229: enviar ahí corta la palabra a
        // medias y manda un mensaje que el usuario no había terminado.
        if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const renderInputArea = (isCentered = false) => (
        <div
            className="input-wrapper"
            ref={inputWrapperRef}
            onPointerDownCapture={() => { composerPointerDownRef.current = true; }}
            onPointerUpCapture={() => {
                setTimeout(() => { composerPointerDownRef.current = false; }, 0);
            }}
            onPointerCancelCapture={() => { composerPointerDownRef.current = false; }}
            style={{
            // [P3-AGENT-INPUT-CENTER · 2026-05-19] Lift del input desktop
            // para que no toque el borde inferior del card.
            // Pre-fix: `bottom: 0` pegaba el wrapper al fondo del scroll
            // container — combinado con el border-radius bottom del card
            // (1.5rem) producía la sensación visual de "input sobresale
            // del card" en desktop (el wrapper ocupaba la zona del radius
            // y se veía recortado/desbordado).
            // Fix: `bottom: 1.25rem` en desktop deja 20px de respiración
            // entre el input box y el borde inferior del card; padding
            // top/bottom balanceado a 1.5rem cada lado para que el input
            // esté centralizado dentro de su wrapper. Mobile intacto:
            // sticky bottom 0 es crítico para el cooperativo con el
            // visualViewport handler que levanta el wrapper con el
            // teclado virtual iOS.
            // Histórico relacionado: P3-AGENT-INPUT-BOTTOM-PAD,
            // P3-AGENT-DESKTOP-CLIP (mismo día).
            padding: isMobile
                ? (isCentered ? '1.5rem 1.25rem 2.5rem 1.25rem' : '1.25rem 2rem 1.75rem 2rem')
                : (isCentered ? '2rem 3rem 3rem 3rem' : '1.5rem 3rem 1.5rem 3rem'),
            background: isCentered ? 'var(--bg-card)' : 'var(--bg-card)',
            backdropFilter: isCentered ? 'none' : 'blur(12px)',
            borderTopLeftRadius: isCentered ? '2rem' : '0',
            borderTopRightRadius: isCentered ? '2rem' : '0',
            borderBottomLeftRadius: isMobile ? '0' : '1.5rem',
            borderBottomRightRadius: isMobile ? '0' : '1.5rem',
            borderTop: isCentered ? 'none' : '1px solid var(--border)',
            boxShadow: isCentered ? '0 -2px 20px rgba(0,0,0,0.04)' : 'none',
            position: isCentered ? 'absolute' : 'sticky',
            bottom: isCentered ? 0 : (isMobile ? 0 : '1.25rem'),
            left: 0,
            right: 0,
            width: '100%',
            zIndex: 10,
            // [MOBILE-KEYBOARD-LIFT] transition para que el translateY del
            // visualViewport handler sea suave en lugar de saltar abrupto.
            transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'transform',
            }}
        >
            {!isOnline && (
                <div className="chat-offline-status" role="status" aria-live="polite">
                    {t('Sin conexión · borrador guardado')}
                </div>
            )}
            <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', minWidth: 0, position: 'relative' }}>

                {isSpeaking && (
                    <div style={{
                        position: 'absolute',
                        top: '-50px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 20,
                        animation: 'fadeInUp 0.3s ease-out'
                    }}>
                        <button
                            onClick={handleInterruptBargeIn}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '30px',
                                border: '1px solid var(--border)',
                                background: 'var(--bg-card)',
                                color: '#ef4444',
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                            }}
                        >
                            <span style={{ fontSize: '1.1rem' }}>✋</span> {t('Detener')}
                        </button>
                    </div>
                )}

                {isCentered && (
                    <div style={{
                        display: 'none'
                    }}>
                        {/* Removido temporalmente para evitar redundancia con el placeholder */}
                    </div>
                )}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: isCentered ? 'var(--bg-muted)' : 'var(--bg-muted)',
                    borderRadius: isCentered ? '2rem' : (attachments.length ? '1rem' : '2rem'),
                    padding: isCentered ? '0.5rem 0.5rem 0.5rem 1rem' : (attachments.length ? '0.5rem' : '0.5rem 0.5rem 0.5rem 1rem'),
                    boxShadow: 'none',
                    border: isCentered ? '1px solid var(--border)' : '1px solid var(--border)',
                    transition: 'all 0.2s ease',
                    minWidth: 0,
                    maxWidth: '100%'
                }}>
                    {attachments.length > 0 && (
                        <div
                            className="attachment-rail"
                            role="list"
                            aria-label={t('Imágenes adjuntas')}
                            aria-busy={attachmentsPreparing}
                        >
                            {attachments.map((item, index) => (
                                <div className={`attachment-preview ${item.status}`} role="listitem" key={item.id}>
                                    {item.status === 'ready' ? (
                                        <img
                                            src={item.thumbDataUrl || item.previewUrl}
                                            alt={t('Imagen adjunta {number}', { number: index + 1 })}
                                        />
                                    ) : (
                                        <div className="attachment-placeholder" aria-hidden="true"><ImageIcon size={22} /></div>
                                    )}
                                    {item.status === 'preparing' && <Loader2 className="attachment-spinner spin-fast" size={18} />}
                                    {item.status === 'error' && <span className="attachment-error" aria-label={t('Error preparando imagen')}>!</span>}
                                    <button
                                        type="button"
                                        aria-label={t('Quitar imagen {number}', { number: index + 1 })}
                                        onClick={() => removeSelectedAttachment(item.id)}
                                        disabled={isTurnActive}
                                        className="attachment-remove"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'nowrap',
                        width: '100%',
                        minWidth: 0,
                        maxWidth: '100%'
                    }}>
                        {/* [P1-CHAT-PICKER-ANCLADO · 2026-08-23] El input va DENTRO de este
                            contenedor y superpuesto al clip, no en `display: none`.
                            Razón: iOS ancla el menú nativo («Fototeca / Tomar foto /
                            Seleccionar archivo») al rectángulo del input que lo disparó.
                            Un input sin caja no tiene rectángulo, así que el menú salía
                            flotando a media pantalla, despegado del control que el
                            usuario acababa de tocar (captura del dueño, 2026-08-23 5:50).
                            `opacity: 0` y no `display: none` / `visibility: hidden`: las
                            dos últimas también borran la caja. `pointer-events: none`
                            para que el toque siga siendo del botón (el click al input lo
                            dispara el onClick de abajo), y `aria-hidden` porque quien
                            anuncia el control es el botón. */}
                        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                            <input
                                type="file"
                                // [P1-CHAT-ADJUNTAR-MAS · 2026-08-23] "image/*" y no la lista de
                                // extensiones: con la lista, el menu de iOS ofrece
                                // igualmente «Explorar» y deja elegir un fichero que luego
                                // rechazamos. El comodin alinea lo que el menu ofrece con
                                // lo que el chat acepta de verdad, y de paso hace que iOS
                                // priorice camara y fototeca.
                                accept="image/*"
                                multiple
                                ref={fileInputRef}
                                aria-hidden="true"
                                tabIndex={-1}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    opacity: 0,
                                    pointerEvents: 'none',
                                }}
                                onChange={handleFileSelect}
                            />

                            <button
                                ref={attachmentTriggerRef}
                                type="button"
                                aria-label={t('Adjuntar imagen')}
                                className={`attachment-btn ${(isTurnActive || attachments.length >= CHAT_IMAGE_MAX_COUNT) ? 'disabled' : ''}`}
                                disabled={isTurnActive || attachments.length >= CHAT_IMAGE_MAX_COUNT}
                                onPointerDown={prepareAttachmentPickerGesture}
                                onClick={() => { void openAttachmentPicker(); }}
                                title={t('Adjuntar imagen')}
                            >
                                {/* [P1-CHAT-ADJUNTAR-MAS · 2026-08-23] `+` y no el clip: el
                                    clip dice «adjuntar un fichero» —vocabulario de correo—
                                    y lo que abre es cámara/fototeca. El `+` es el gesto que
                                    ya usan ChatGPT y Gemini para lo mismo y no promete un
                                    tipo concreto de contenido. */}
                                <Plus size={22} strokeWidth={2.2} />
                            </button>
                        </span>

                        {/* Convertido de <input type="text"> a <textarea> para
                            que iOS Safari NO active el "Form Assistant" (la barra
                            con flechas ↑↓ + checkmark que aparecía encima del
                            teclado). Los textareas no disparan ese accessory bar.
                            rows={1} + style line-height + auto-resize mantienen
                            look single-line; Shift+Enter = newline (handleKeyDown
                            ya respeta esto). */}
                        <textarea
                            ref={chatInputRef}
                            rows={1}
                            value={input}
                            // [P2-AGENT-413-NO-RETRY · 2026-05-30] Cap cliente
                            // alineado al server (P0-CHAT-PROMPT-MAXLEN, 8192).
                            // Evita que el usuario escriba más allá del límite
                            // (caso común); el caso raro de overflow por el
                            // wrapper enriquecido ([IMAGE:]/contexto temporal) lo
                            // maneja con gracia el copy 413. 8192 chars ≈ texto
                            // muy por encima de cualquier input de chat normal.
                            maxLength={8192}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            placeholder={micErrorMsg || t("Pregúntale a {app}", { app: BRAND })}
                            onFocus={() => setTimeout(scrollToBottom, 300)}
                            // [P2-CHAT-TEXTAREA-AUTOSIZE · 2026-07-24] El
                            // auto-resize NO vive aquí: `onInput` solo se
                            // dispara al teclear, así que no veía los cambios
                            // programáticos de `input` (enviar, chat nuevo,
                            // pill, prefill) y la caja quedaba inflada con el
                            // placeholder visible hasta refrescar la página.
                            // Ahora lo hace `useAutosizeTextarea` (arriba),
                            // que corre en CADA commit donde cambia el valor
                            // o el ancho disponible.
                            enterKeyHint={isMobile ? "enter" : "send"}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                padding: '0.4rem 0.5rem',
                                borderRadius: '0',
                                fontSize: '1rem',
                                lineHeight: '1.4',
                                outline: 'none',
                                color: 'var(--text-main)',
                                fontFamily: 'inherit',
                                minWidth: 0,
                                maxWidth: '100%',
                                resize: 'none',
                                overflow: 'auto',
                                maxHeight: `${CHAT_TEXTAREA_MAX_HEIGHT_PX}px`,
                                overflowWrap: 'break-word',
                                wordBreak: 'break-word'
                            }}
                        />
                        {(isTurnActive || recoveringTurn) ? (
                            <button
                                type="button"
                                aria-label={t('Detener generación')}
                                onClick={handleStopGeneration}
                                title={t('Detener generación')}
                                style={{
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '44px',
                                    height: '44px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    marginLeft: 'auto',
                                    marginRight: '2px',
                                    boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
                                }}
                            >
                                <Square size={16} fill="white" />
                            </button>
                        ) : (
                            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
                                {(!input.trim() || isListening || isCallModeActive) && (
                                    <>
                                        {/* FUNCIONALIDAD DE VOZ (LLAMADA/MIC) DESACTIVADA TEMPORALMENTE */}
                                    </>
                                )}
                                {(input.trim() || attachments.length > 0) && (
                                    <button
                                        type="button"
                                        aria-label={t('Enviar')}
                                        className="touch-scale"
                                        onClick={handleSend}
                                        disabled={isTurnActive || attachmentsHaveErrors}
                                        style={{
                                            background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '44px',
                                            height: '44px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: isTurnActive ? 'default' : 'pointer',
                                            flexShrink: 0,
                                            marginRight: '2px'
                                        }}
                                    >
                                        <ArrowUp size={22} strokeWidth={2.5} />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Reproductor Nativo Montado en el DOM para Evitar Bloqueos de iOS Safari */}
            <audio ref={audioPlayerRef} playsInline style={{ display: 'none' }} id="tts-audio-player" />
        </div>
    );


    // --- Standard Viewport Sizing ---
    // [P3-AGENT-DESKTOP-CLIP · 2026-05-19] En desktop (> 1024px), el container
    // del AgentPage se renderiza DENTRO de `DashboardLayout.mainContent` que
    // ya aplica `padding: 2.5rem` arriba y abajo, y además el container suma
    // `margin: '2.25rem auto 0'` (línea ~1792). Pre-fix el cálculo era
    // `calc(100dvh - 4rem)` — restaba solo 64px sin contabilizar el padding
    // del parent ni el margin-top propio, así que el container desbordaba
    // el viewport por (40 + 36 + 40 - 64) = 52px → el padding inferior del
    // `input-wrapper` (sticky bottom: 0) quedaba fuera del área visible y
    // el usuario veía el chat "cortado" en la parte inferior.
    //
    // Cálculo correcto: `100dvh - (padding-top mainContent + margin-top
    // AgentPage + padding-bottom mainContent) = 100dvh - (2.5 + 2.25 + 2.5)
    // = 100dvh - 7.25rem`. Esto deja el bottom del card visible con ~40px
    // de breathing room (el padding-bottom del mainContent).
    useEffect(() => {
        const root = document.documentElement;
        const handleResize = () => {
            if (window.innerWidth > 1024) {
                root.style.setProperty('--app-height', 'calc(100dvh - 7.25rem)');
            } else {
                root.style.removeProperty('--app-height');
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            root.style.removeProperty('--app-height');
        };
    }, []);

    // --- Swipe gestures for mobile sidebar ---
    const touchGestureRef = useRef(null);

    const handleTouchStart = (event) => {
        if (!isMobile || event.touches.length !== 1) return;
        const touch = event.touches[0];
        const drawerWidth = Math.min(320, window.innerWidth * 0.85);
        const eligible = showSidebar ? touch.clientX <= drawerWidth + 12 : touch.clientX <= 24;
        touchGestureRef.current = eligible ? {
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY,
            axis: null,
        } : null;
    };

    const handleTouchMove = (event) => {
        const gesture = touchGestureRef.current;
        if (!gesture || event.touches.length !== 1) return;
        const touch = event.touches[0];
        gesture.lastX = touch.clientX;
        gesture.lastY = touch.clientY;
        const deltaX = Math.abs(gesture.lastX - gesture.startX);
        const deltaY = Math.abs(gesture.lastY - gesture.startY);
        if (!gesture.axis && Math.max(deltaX, deltaY) >= 10) {
            gesture.axis = deltaX > deltaY * 1.25 ? 'x' : 'y';
        }
    };

    const handleTouchEnd = () => {
        const gesture = touchGestureRef.current;
        touchGestureRef.current = null;
        if (!gesture || gesture.axis !== 'x') return;
        const deltaX = gesture.lastX - gesture.startX;
        const deltaY = Math.abs(gesture.lastY - gesture.startY);
        if (Math.abs(deltaX) < 64 || Math.abs(deltaX) < deltaY * 1.5) return;
        if (deltaX > 0 && !showSidebar) setShowSidebar(true);
        if (deltaX < 0 && showSidebar) setShowSidebar(false);
    };

    const handleTouchCancel = () => {
        touchGestureRef.current = null;
    };

    // [P2-AGENT-GROUPED-SESSIONS-MEMO · 2026-06-01] useMemo([chatSessions]). Antes
    // `getGroupedSessions()` corría en CADA render — y AgentPage re-renderiza por
    // keystroke del textarea y por cada chunk SSE durante el streaming → iterar las
    // sesiones (cap 40) con `new Date()` por sesión + 3 arrays nuevos, decenas de
    // veces por segundo, alimentando la sidebar no-memoizada. chatSessions es estable
    // durante el stream (setChatSessions corre 1× antes del loop de chunks), así que
    // el memo skippea todo el streaming. Puro sobre chatSessions (el `new Date()` de
    // 'hoy' solo importa al cruzar medianoche; la sidebar se refetchea en cada `done`).
    const groupedSessions = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lastMonth = new Date(today);
        lastMonth.setDate(lastMonth.getDate() - 30);

        const groups = {
            'Hoy': [],
            'Últimos 30 días': [],
            'Más antiguos': []
        };

        chatSessions.forEach(s => {
            const dateStr = s.last_activity || s.created_at;
            let d;
            if (dateStr) {
                d = new Date(dateStr);
            }
            if (!d || isNaN(d.getTime())) {
                groups['Más antiguos'].push(s);
                return;
            }

            if (d >= today) {
                groups['Hoy'].push(s);
            } else if (d >= lastMonth) {
                groups['Últimos 30 días'].push(s);
            } else {
                groups['Más antiguos'].push(s);
            }
        });

        // [P2-I18N-MEMOS-CONGELADOS · 2026-08-21] El memo devuelve los grupos SIN
        // etiqueta. Antes las traducia aqui dentro, y como `useT()` devuelve la funcion
        // de MODULO —cuya identidad nunca cambia— ponerla en las deps es un no-op para
        // un cambio de idioma: las etiquetas se congelaban en el idioma anterior hasta
        // recargar.
        //
        // Anadir `locale` a las deps tampoco vale: el cuerpo no lo nombra, asi que
        // `exhaustive-deps` lo declara innecesario y el aviso se reporta en la linea del
        // `useMemo`, donde una directiva de escape queda huerfana.
        //
        // La salida es sacar el rotulado FUERA. Lo caro es agrupar N sesiones por fecha;
        // rotular son tres cadenas por render, y asi siguen SIEMPRE al idioma vivo sin
        // pelearse con el linter.
        return [
            { id: 'hoy', items: groups['Hoy'] },
            { id: '30dias', items: groups['Últimos 30 días'] },
            { id: 'antiguos', items: groups['Más antiguos'] }
        ].filter(g => g.items.length > 0);
        // `t` ya no se usa aqui dentro; `chatSessions` es la unica entrada real.
    }, [chatSessions]);

    // Rotulado fuera del memo: barato y siempre en el idioma activo.
    const ETIQUETA_GRUPO = { hoy: t('Hoy'), '30dias': '', antiguos: t('Más antiguos') };
    const gruposConEtiqueta = groupedSessions.map(
        (g) => ({ ...g, label: ETIQUETA_GRUPO[g.id] ?? '' })
    );
    return (
        <>
            <style>{`
                /* [P1-CHAT-DELETE-TOUCH · 2026-08-10] La papelera de cada conversación
                   se revelaba SOLO con :hover, y en un teléfono no hay hover: desde el
                   móvil no se podía borrar NINGUNA conversación. Con el tope de 40
                   sesiones, la lista solo crecía.

                   Se añade visibility y no solo opacity: opacity 0 + pointer-events none
                   deja el botón en el orden de tabulación, así que con teclado o VoiceOver
                   se podía activar a ciegas un borrado que no se ve.
                   (Sin acentos graves aquí dentro: este CSS vive en un template literal
                   de JS y un backtick lo cierra y rompe el build.) */
                .chat-session-btn .chat-actions-hover {
                    opacity: 0;
                    visibility: hidden;
                    pointer-events: none;
                }
                .chat-session-btn:hover .chat-actions-hover,
                .chat-session-btn:focus-within .chat-actions-hover {
                    opacity: 1;
                    visibility: visible;
                    pointer-events: auto;
                }
                /* Donde no hay puntero fino (teléfono, tablet) la acción es visible
                   siempre: es la única forma de alcanzarla. */
                @media (hover: none) {
                    .chat-session-btn .chat-actions-hover {
                        opacity: 1;
                        visibility: visible;
                        pointer-events: auto;
                    }
                }

                .attachment-btn {
                    background: transparent;
                    color: var(--text-muted);
                    border: none;
                    border-radius: 50%;
                    width: 44px;
                    height: 44px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
                    flex-shrink: 0;
                    outline: none;
                    -webkit-tap-highlight-color: transparent;
                }
                .chat-offline-status {
                    width: fit-content;
                    max-width: 100%;
                    margin: 0 auto 0.45rem;
                    padding: 0.3rem 0.7rem;
                    border-radius: 999px;
                    background: color-mix(in srgb, #f59e0b 14%, var(--bg-card));
                    color: var(--text-main);
                    font-size: 0.78rem;
                    font-weight: 650;
                    text-align: center;
                }
                .attachment-btn:not(.disabled):hover {
                    color: #3b82f6;
                    background: var(--bg-muted);
                }
                .attachment-btn:not(.disabled):active {
                    transform: scale(0.85);
                    background: var(--bg-muted);
                }
                .attachment-btn.disabled {
                    opacity: 0.5;
                    cursor: default;
                }
                .attachment-rail {
                    display: flex;
                    gap: 0.65rem;
                    overflow-x: auto;
                    overscroll-behavior-x: contain;
                    scrollbar-width: none;
                    padding: 0.35rem 0.4rem 0.55rem 3rem;
                    scroll-snap-type: x proximity;
                }
                .attachment-rail::-webkit-scrollbar { display: none; }
                .attachment-preview {
                    position: relative;
                    flex: 0 0 64px;
                    width: 64px;
                    height: 64px;
                    padding: 3px;
                    border-radius: 12px;
                    border: 1px solid var(--border);
                    background: var(--bg-card);
                    scroll-snap-align: start;
                }
                .attachment-preview > img {
                    width: 100%;
                    height: 100%;
                    display: block;
                    border-radius: 9px;
                    object-fit: cover;
                }
                .attachment-placeholder {
                    width: 100%;
                    height: 100%;
                    display: grid;
                    place-items: center;
                    border-radius: 9px;
                    background: var(--bg-muted);
                    color: var(--text-muted);
                }
                .attachment-preview.preparing > img { opacity: 0.55; }
                .attachment-spinner,
                .attachment-error {
                    position: absolute;
                    inset: 0;
                    margin: auto;
                    color: white;
                    filter: drop-shadow(0 1px 3px rgba(0,0,0,.65));
                }
                .attachment-error {
                    width: 24px;
                    height: 24px;
                    display: grid;
                    place-items: center;
                    border-radius: 999px;
                    background: #dc2626;
                    font-weight: 800;
                    filter: none;
                }
                .attachment-remove {
                    position: absolute;
                    top: -14px;
                    right: -14px;
                    width: 44px;
                    height: 44px;
                    display: grid;
                    place-items: center;
                    border: 3px solid var(--bg-muted);
                    border-radius: 999px;
                    background: #dc2626;
                    color: white;
                    cursor: pointer;
                    -webkit-tap-highlight-color: transparent;
                }
            `}</style>
            <div className="agent-container"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    // [P1-CHAT-KEYBOARD-FIT · 2026-08-10] En móvil el alto RESTA lo que
                    // ocupa el teclado. Antes era 100dvh fijo: `dvh` en iOS NO encoge
                    // al abrirse el teclado, así que el contenedor seguía midiendo la
                    // pantalla entera y el final de la conversación quedaba detrás del
                    // teclado. El handler de `visualViewport` solo subía el input con
                    // `transform` — movía la caja de escribir, no el sitio donde se lee.
                    // `--kb-inset` lo escribe ese mismo handler SOBRE ESTE ELEMENTO (no
                    // en :root) porque esta página sobrevive oculta con display:none al
                    // navegar (P1-AGENT-KEEP-ALIVE): una variable global escrita desde un
                    // componente invisible contaminaría el alto de las demás rutas.
                    height: isMobile
                        ? 'calc(var(--app-height, 100dvh) - var(--kb-inset, 0px))'
                        : 'var(--app-height, calc(100dvh - 7.25rem))',  // [P3-AGENT-DESKTOP-CLIP · 2026-05-19] ver useEffect arriba
                    // [P1-KB-BAJADA-FLUIDA · 2026-08-23] El alto cambiaba de golpe: con el
                    // cerrojo de cierre eso pasa a ocurrir en el `blur` —o sea, JUSTO cuando
                    // iOS empieza a bajar el teclado— así que un salto seco se ve como un
                    // parpadeo por delante de la animación del sistema. Con la curva y la
                    // duración del teclado de iOS (~0,25 s, `cubic-bezier(.32,.72,0,1)`) el
                    // chat baja ACOMPAÑANDO al teclado en vez de adelantarse.
                    // Sólo en móvil: en escritorio el alto no se mueve y una transición ahí
                    // sólo podría retrasar un cambio de layout legítimo.
                    transition: isMobile ? 'height 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : undefined,
                    background: 'var(--bg-card)',
                    borderRadius: isMobile ? '0' : '1.5rem',
                    boxShadow: isMobile ? 'none' : '0 10px 40px -10px rgba(0,0,0,0.08)',
                    border: isMobile ? 'none' : '1px solid var(--border)',
                    overflow: 'hidden',
                    margin: isMobile ? '0' : '2.25rem auto 0',
                    maxWidth: isMobile ? '100vw' : '1200px',
                    width: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    position: 'relative'
                }}>
                {/* Overlay Drag & Drop */}
                {isDragging && (
                    <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(255, 255, 255, 0.85)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '4px dashed #3b82f6',
                        borderRadius: isMobile ? '0' : '1.5rem',
                        transition: 'all 0.2s ease',
                        pointerEvents: 'none'
                    }}>
                        <div style={{
                            background: 'var(--bg-card)',
                            padding: '2rem 3rem',
                            borderRadius: '1.25rem',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '1rem',
                            animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                        }}>
                            <ImageIcon size={48} color="#3b82f6" strokeWidth={1.5} />
                            <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.5rem', fontWeight: 600 }}>
                                {t('Suelta tu imagen aquí')}
                            </h2>
                            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                                {t('La subiremos optimizada para responderte.')}
                            </p>
                        </div>
                    </div>
                )}
                {/* Overlay para móvil */}
                {showSidebar && isMobile && (
                    <button
                        type="button"
                        className="sidebar-overlay"
                        onClick={() => setShowSidebar(false)}
                        aria-label={t('Cerrar historial de chats')}
                    />
                )}

                {/* Sidebar Historial */}
                <SidebarRecientes
                    showSidebar={showSidebar}
                    setShowSidebar={setShowSidebar}
                    handleNewChat={handleNewChat}
                    isLoadingSessions={isLoadingSessions}
                    chatSessions={chatSessions}
                    groupedSessions={gruposConEtiqueta}
                    currentSessionId={currentSessionId}
                    setCurrentSessionId={setCurrentSessionId}
                    handleDeleteChat={handleDeleteChat}
                    isLoading={isTurnActive}
                    isMobile={isMobile}
                    sidebarRef={sidebarRef}
                />

                {/* Chat Area container */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0, // previene overflow en flex
                    maxWidth: '100%',
                    position: 'relative',
                    background: 'var(--bg-card)',
                    overflow: 'hidden'
                }}>
                    {/* Chat Header */}
                    <div className="mobile-chat-header" style={{
                        padding: '0.75rem 1.25rem',
                        paddingTop: isMobile ? 'calc(0.75rem + max(env(safe-area-inset-top), 24px))' : '0.75rem',
                        background: messages.length === 0 ? 'var(--bg-card)' : 'var(--bg-card)',
                        backdropFilter: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        position: 'absolute',
                        top: 0,
                        width: '100%',
                        zIndex: 10,
                        borderBottom: messages.length === 0 ? 'none' : '1px solid var(--border)'
                    }}>
                        {/* Left: Menu */}
                        <button
                            ref={sidebarTriggerRef}
                            onClick={() => setShowSidebar(!showSidebar)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-main)',
                                // [P1-CHAT-TOUCH-TARGETS · 2026-08-10] 24px de icono +
                                // 2×6,4 de relleno daban 36,8px: por debajo de los 44 de
                                // Apple y de los 44 que este mismo repo se impuso por
                                // escrito en BottomTabBar.module.css. El margen negativo
                                // crece con el relleno para que la alineación óptica con
                                // el borde no se mueva — solo crece la zona sensible.
                                padding: '0.625rem',
                                borderRadius: '50%',
                                transition: 'all 0.15s',
                                marginLeft: '-0.625rem'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            aria-label={t('Ver historial de chats')}
                            aria-controls="agent-history-drawer"
                            aria-expanded={showSidebar}
                        >
                            <History size={24} strokeWidth={1.5} />
                        </button>

                        {/* Center: Title */}
                        {/* [P3-AGENT-HEADER-TITLE · 2026-05-19 · P2-WORDMARK-BIOBOROS 2026-07-30]
                            Título del header del chat: wordmark + versión visible al
                            usuario. Antes decía "Mealfit V1.0" HARDCODEADO — sobrevivió
                            al rebrand porque no era "MealfitRD" sino "Mealfit" suelto,
                            que no se podía reemplazar en bloque (también es nombre de
                            clase CSS y de variable en otros archivos). Ahora usa
                            `<Wordmark/>`, así que ninguna renombrada futura puede
                            dejarlo atrás.
                            La versión va en cifra desnuda ("1", no "V1.0"): el usuario
                            no necesita el patch, y el prefijo "V" es jerga de release. */}
                        <span className="agent-header-title" style={{
                            fontSize: '1.25rem',
                            fontWeight: 400,
                            color: 'var(--text-main)',
                            position: 'absolute',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            letterSpacing: '-0.02em'
                        }}>
                            <Wordmark /> <span style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', letterSpacing: 'normal', color: 'var(--text-muted)', fontSize: '0.8em' }}>1</span>
                        </span>

                        {/* Right: 3-dot nav menu (mobile) */}
                        <div ref={navMenuRef} className="nav-menu-wrapper" style={{ position: 'relative', marginRight: '-0.4rem' }}>
                            <button
                                ref={navMenuTriggerRef}
                                onClick={() => setShowNavMenu(!showNavMenu)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-main)',
                                    // [P1-CHAT-TOUCH-TARGETS · 2026-08-10] Ver el botón de
                                    // historial: mismo cálculo, 36,8 → 44px.
                                    padding: '0.625rem',
                                    borderRadius: '50%',
                                    transition: 'all 0.15s'
                                }}
                                aria-label={t('Abrir menú de navegación')}
                                aria-haspopup="menu"
                                aria-expanded={showNavMenu}
                            >
                                <Menu size={24} strokeWidth={2} />
                            </button>
                            {showNavMenu && (
                                <div className="nav-dropdown" role="menu" aria-label={t('Navegación')} style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '0.5rem',
                                    background: 'var(--bg-card)',
                                    backdropFilter: 'blur(20px)',
                                    WebkitBackdropFilter: 'blur(20px)',
                                    borderRadius: '1rem',
                                    boxShadow: '0 10px 40px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
                                    padding: '0.5rem',
                                    minWidth: '200px',
                                    zIndex: 100,
                                    animation: 'fadeSlideDown 0.2s ease'
                                }}>
                                    {menuItemsDelAgente(enModoContador).map((item) => (
                                        <button
                                            role="menuitem"
                                            key={item.path}
                                            onClick={() => {
                                                navigate(item.path, item.asDialog ? { state: { backgroundLocation: location } } : undefined);
                                                setShowNavMenu(false);
                                            }}
                                            className="nav-dropdown-item"
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                padding: '0.75rem 1rem',
                                                background: 'transparent',
                                                border: 'none',
                                                borderRadius: '0.65rem',
                                                color: 'var(--text-main)',
                                                fontSize: '0.95rem',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                                textAlign: 'left'
                                            }}
                                            onTouchStart={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                            onTouchEnd={e => e.currentTarget.style.background = 'transparent'}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <item.icon size={20} strokeWidth={1.8} style={{ color: 'var(--text-muted)' }} />
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Mensajes o Pantalla Principal (Gemini Style) */}
                    {/* [P1-CHAT-VIRTUALIZE · 2026-05-19] Cuando virtualizado
                        cedemos el scroll a Virtuoso (overflowY:hidden en el
                        padre) — Virtuoso maneja viewport internamente. Path
                        simple preserva overflowY:auto para sesiones <= 100. */}
                    {/* [P2-CHAT-SCROLL-RACE · 2026-05-19] ref + onScroll
                        activan el guard que respeta el intent del user
                        cuando scrollea arriba durante el streaming. Tooltip-anchor:
                        P2-CHAT-SCROLL-RACE. */}
                    <div
                        className="messages-container"
                        ref={messagesContainerRef}
                        onScroll={handleMessagesScroll}
                        style={{
                            flex: 1,
                            padding: messages.length === 0 ? 'calc(4.5rem + max(env(safe-area-inset-top), 24px)) 1.5rem 0 1.5rem' : 'calc(4.5rem + max(env(safe-area-inset-top), 24px)) 2rem 0.5rem 2rem',
                            overflowY: messages.length > VIRTUALIZE_THRESHOLD ? 'hidden' : 'auto',
                            minHeight: 0,
                            minWidth: 0,
                            maxWidth: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-start',
                            alignItems: messages.length === 0 ? 'flex-start' : 'center',
                            background: messages.length === 0 ? 'var(--bg-card)' : 'var(--bg-card)',
                            scrollBehavior: 'smooth'
                        }}
                    >
                        {messages.length === 0 && !isLoadingHistory ? (
                            <div className="empty-state-wrapper" style={{ width: '100%', maxWidth: '850px', display: 'flex', flexDirection: 'column' }}>
                                <div style={{
                                    animation: 'fadeInUp 0.6s ease-out forwards',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.2rem',
                                    marginBottom: '1.25rem',
                                    marginTop: '1.5rem',
                                    alignItems: 'flex-start'
                                }}>
                                    <h1 className="welcome-heading" style={{
                                        fontSize: '2rem',
                                        fontWeight: 500,
                                        color: 'var(--text-main)',
                                        margin: 0,
                                        letterSpacing: '-0.01em',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.6rem'
                                    }}>
                                        <BotAvatar size={54} float style={{ flexShrink: 0 }} />
                                        {t('Hola, {nombre}', { nombre: userProfile?.full_name?.split(' ')[0] || formData?.name || t('amigo') })}
                                    </h1>
                                    <h2 className="welcome-sub" style={{
                                        fontSize: '2.5rem',
                                        fontWeight: 400,
                                        color: 'var(--text-muted)',
                                        margin: 0,
                                        letterSpacing: '-0.03em',
                                        lineHeight: 1.2
                                    }}>
                                        {t('¿Por dónde empezamos?')}
                                    </h2>
                                </div>

                                <div className="empty-state-pills" style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.6rem',
                                    alignItems: 'flex-start',
                                    marginTop: '0.5rem'
                                }}>
                                    {[
                                        { icon: '🖼️', text: t('Analizar mi comida') },
                                        { icon: '💪', text: t('Dieta para ganar volumen') },
                                        { icon: '✨', text: t('Plan de pérdida de peso') },
                                        { icon: '🍳', text: t('Receta alta en proteína') }
                                    ].map((suggestion, idx) => (
                                        <button
                                            key={idx}
                                            className="suggestion-pill"
                                            onClick={() => idx === 0 ? openAttachmentPicker() : setInput(suggestion.text)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.6rem',
                                                padding: '0.75rem 1.25rem',
                                                background: 'var(--bg-card)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '2rem',
                                                color: 'var(--text-main)',
                                                fontSize: '0.95rem',
                                                fontWeight: 400,
                                                cursor: 'pointer',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                                                transition: 'all 0.2s ease',
                                                width: 'fit-content'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
                                        >
                                            <span className="suggestion-pill-icon" style={{ fontSize: '1.2rem', lineHeight: 1 }}>{suggestion.icon}</span>
                                            {suggestion.text}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            // [P1-CHAT-A11Y-LIVE · 2026-05-19] role="log" +
                            // aria-live="polite" hace que screen readers
                            // anuncien mensajes nuevos del asistente sin
                            // interrumpir. aria-relevant="additions text"
                            // captura tanto inserts de bubbles nuevos como
                            // updates de texto durante streaming (el bubble
                            // streaming usa aria-busy=true mientras llega
                            // el chunk para suprimir announcements parciales,
                            // y aria-busy=false al final dispara el anuncio
                            // del mensaje completo). Cierre P1 pendiente del
                            // audit prod-readiness del Agente (2026-05-19).
                            //
                            // [P1-CHAT-VIRTUALIZE · 2026-05-19] Cuando
                            // messages.length > VIRTUALIZE_THRESHOLD (100)
                            // delegamos render a <VirtualizedMessageList>
                            // (react-virtuoso) — mide alturas con
                            // ResizeObserver y follow-tail nativo. Path
                            // simple preservado para sesiones cortas (99%
                            // del uso) — cero overhead Virtuoso, cero
                            // riesgo de regresión visual.
                            messages.length > VIRTUALIZE_THRESHOLD && !isLoadingHistory ? (
                                <div
                                    role="log"
                                    aria-live="polite"
                                    aria-relevant="additions text"
                                    aria-label={t('Historial de conversación con el asistente')}
                                    style={{
                                        maxWidth: '800px',
                                        width: '100%',
                                        flex: 1,
                                        minHeight: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                    }}
                                >
                                    {/* [P2-AGENT-VIRTUOSO-LAZY · 2026-05-31]
                                        Suspense para el chunk lazy de
                                        react-virtuoso. Fallback: spinner
                                        centrado (solo visible la primera vez
                                        que una sesión cruza 100 msgs, luego
                                        cacheado). */}
                                    <Suspense fallback={
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Loader2 className="animate-spin" size={24} aria-label={t('Cargando mensajes')} />
                                        </div>
                                    }>
                                        <VirtualizedMessageList
                                            ref={virtualizedListRef}
                                            messages={messages}
                                            currentSessionId={currentSessionId}
                                            onRegenerate={handleRegenerate}
                                            onErrorRetry={retryErrorMessage}
                                            isLoading={isLoading}
                                            streamingStatus={streamingStatus}
                                            loadingPhrases={loadingPhrases}
                                            loadingPhraseIdx={loadingPhraseIdx}
                                            onAtBottomChange={handleVirtualizedAtBottomChange}
                                        />
                                    </Suspense>
                                </div>
                            ) : (
                            <div
                                role="log"
                                aria-live="polite"
                                aria-relevant="additions text"
                                aria-label={t('Historial de conversación con el asistente')}
                                style={{
                                    maxWidth: '800px',
                                    width: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2rem',
                                    paddingBottom: '0.5rem'
                                }}
                                className="msg-log"
                            >
                                {isLoadingHistory ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem', color: 'var(--text-muted)', gap: '0.5rem' }}>
                                        <Loader2 className="spin-fast" size={20} /> {t('Cargando mensajes...')}
                                    </div>
                                ) : (
                                    messages.map((msg, i) => (
                                        <MemoizedMessageBubble
                                            key={i}
                                            msg={msg}
                                            index={i}
                                            currentSessionId={currentSessionId}
                                            onRegenerate={handleRegenerate}
                                            onErrorRetry={retryErrorMessage}
                                        />
                                    ))
                                )}
                                {(isLoading || recoveringTurn) && (
                                    <div style={{
                                        display: 'flex',
                                        gap: '0.75rem',
                                        alignItems: 'center',
                                        color: 'var(--text-muted)',
                                        padding: '0.5rem 0 0.5rem 1.5rem',
                                        // [P1-CHAT-MOBILE-FIT · 2026-08-10] Eran 3,5rem
                                        // (56px) sin razón escrita, y esta fila es el
                                        // ÚLTIMO elemento antes del final del scroll: caían
                                        // justo en el tramo vacío de la captura. Con la
                                        // lista ya anclada abajo, este margen pasa de ser
                                        // parte del hueco a ser el único separador visible
                                        // — por eso se reduce, no se elimina.
                                        marginBottom: '1rem',
                                        fontSize: '0.95rem',
                                        fontWeight: 500
                                    }}>
                                        {/* [P3-BOT-AVATAR-3D · 2026-06-19 v2] Avatar "pensando":
                                            antena con glow pulsante + pupilas mirando alrededor +
                                            cabeceo. Reemplaza el pulse de opacidad del row (mudaba
                                            la animación del avatar). */}
                                        <BotAvatar size={34} thinking style={{ flexShrink: 0 }} />
                                        <div className="typing-dots-container" style={{ display: 'none' }}>
                                            <div className="typing-dot" style={{ animation: 'typingBounce 1.4s ease-in-out infinite' }} />
                                            <div className="typing-dot" style={{ animation: 'typingBounce 1.4s ease-in-out 0.2s infinite' }} />
                                            <div className="typing-dot" style={{ animation: 'typingBounce 1.4s ease-in-out 0.4s infinite' }} />
                                        </div>
                                        <span className="loading-text-desktop" style={{
                                            background: 'linear-gradient(90deg, #475569 0%, #94a3b8 50%, #475569 100%)',
                                            backgroundSize: '200% auto',
                                            color: 'transparent',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            animation: 'shimmer 2s linear infinite',
                                            transition: 'opacity 0.3s ease-in-out'
                                        }}>{recoveringTurn && !isLoading
                                            ? t('Recuperando tu respuesta…')
                                            /* [P1-I18N-DASHBOARD · 2026-08-15] El estado de la foto se
                                               reconoce comparándolo con su PROPIA traducción, no con el
                                               prefijo español: al traducirse el texto que escribe
                                               `setStreamingStatus`, un `startsWith('Analizando tu foto')`
                                               dejaría de casar en cualquier idioma que no sea es-DO y el
                                               aviso caería a las frases genéricas justo donde más importa
                                               (el análisis tarda hasta un minuto). Es el único
                                               `streamingStatus` que se PINTA; los demás solo se usan como
                                               señal de «hay algo en curso». */
                                            : (streamingStatus || loadingPhrases[loadingPhraseIdx] || t('Pensando...'))}</span>
                                    </div>
                                )}
                                {/* El sentinel no es un mensaje: cancela el gap de 2rem que
                                    Flex añadiría después del último turno real. */}
                                <div ref={messagesEndRef} className="messages-end-sentinel" />
                            </div>
                            )
                        )}
                    </div>

                    {showJumpToLatest && messages.length > 0 && (
                        <button
                            type="button"
                            className="jump-to-latest"
                            aria-label={t('Ir al mensaje más reciente')}
                            title={t('Ir al mensaje más reciente')}
                            onClick={() => scrollToBottom(true, 'smooth')}
                        >
                            <ArrowDown size={20} strokeWidth={2.4} />
                        </button>
                    )}

                    {/* Area condicional para input */}
                    {/* Input Area (Pinned to bottom if messages exist) */}
                    {messages.length > 0 && renderInputArea(false)}
                    {/* Overlay Input Area for Empty State */}
                    {messages.length === 0 && renderInputArea(true)}

                </div> {/* End of Chat Area Container */}
            </div>

            <AttachmentSourceSheet
                open={showAttachmentSource}
                onClose={() => {
                    setShowAttachmentSource(false);
                }}
                onGallery={() => runNativeImagePicker('gallery')}
                onCamera={() => runNativeImagePicker('camera')}
                triggerRef={attachmentTriggerRef}
            />

            <style>{`
                .markdown-chat { font-size: 0.95rem; line-height: 1.6; max-width: 100%; overflow-wrap: break-word; word-break: break-word; }
                .markdown-chat p { margin-top: 0; margin-bottom: 0.75rem; max-width: 100%; overflow-wrap: break-word; word-break: break-word; }
                .markdown-chat p:last-child { margin-bottom: 0; }
                .markdown-chat ul, .markdown-chat ol { margin-top: 0; margin-bottom: 0.75rem; padding-left: 1.5rem; max-width: 100%; }
                .markdown-chat ul:last-child, .markdown-chat ol:last-child { margin-bottom: 0; }
                .markdown-chat li { margin-bottom: 0.25rem; max-width: 100%; overflow-wrap: break-word; word-break: break-word; }
                .markdown-chat strong { font-weight: 700; color: inherit; }
                .markdown-chat pre { max-width: 100%; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
                .markdown-chat code { max-width: 100%; overflow-wrap: break-word; word-break: break-word; }
                .markdown-chat table { max-width: 100%; display: block; overflow-x: auto; }
                .markdown-chat img { max-width: 100%; height: auto; }

                .spin-fast { animation: spin 1s linear infinite; }
                .spin-slow { animation: spin 4s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
                @keyframes pulse-mic { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: 0.7; } 100% { transform: scale(1); opacity: 1; } }
                .pulse-anim-mic { animation: pulse-mic 1.5s infinite ease-in-out; }
                @keyframes shimmer { to { background-position: 200% center; } }
                @keyframes cyberSweep { 0% { left: -50%; } 100% { left: 100%; } }
                @keyframes fadeSlideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
                .wave-anim { animation: wave 2.5s infinite; transform-origin: 70% 70%; }
                @keyframes wave {
                    0% { transform: rotate(0deg); }
                    10% { transform: rotate(14deg); }
                    20% { transform: rotate(-8deg); }
                    30% { transform: rotate(14deg); }
                    40% { transform: rotate(-4deg); }
                    50% { transform: rotate(10deg); }
                    60% { transform: rotate(0deg); }
                    100% { transform: rotate(0deg); }
                }

                /* --- Custom Scrollbar (Sidebar & PC Chat) --- */
                .sidebar-scrollable, .messages-container {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(203, 213, 225, 0.4) transparent;
                }
                .sidebar-scrollable::-webkit-scrollbar, .messages-container::-webkit-scrollbar {
                    width: 6px;
                }
                .sidebar-scrollable::-webkit-scrollbar-track, .messages-container::-webkit-scrollbar-track {
                    background: transparent;
                }
                .sidebar-scrollable::-webkit-scrollbar-thumb, .messages-container::-webkit-scrollbar-thumb {
                    background-color: rgba(203, 213, 225, 0.4);
                    border-radius: 10px;
                }
                .sidebar-scrollable:hover::-webkit-scrollbar-thumb, .messages-container:hover::-webkit-scrollbar-thumb {
                    background-color: rgba(148, 163, 184, 0.6);
                }

                /* ====== MOBILE REDESIGN ====== */
                @media (max-width: 1024px) {
                    /* [P1-KB-HUECO-SIN-PINTAR · 2026-08-23] EL glitch del cierre, visto en la
                       captura del dueño de un fotograma intermedio (8:51): mientras el teclado
                       baja, el contenedor del chat todavía no ha crecido y bajo la barra de
                       pestañas asoma una franja MÁS OSCURA. No era un salto de posición: era
                       el body, que usa --bg-page (#0B1120) mientras el chat usa --bg-card
                       (#111827). Cualquier píxel que el chat no cubra durante la animación
                       delata ese cambio de tono, y eso es lo que se ve como parpadeo.
                       Mientras el chat esté en pantalla, el fondo de la página ES el suyo: da
                       igual quién llegue primero, porque debajo hay el mismo color.
                       :has() acota la regla a esta ruta (mismo patrón que Login.css) — sin
                       él, el resto del dashboard cambiaría de fondo. */
                    html:has(.agent-route-active),
                    body:has(.agent-route-active) {
                        background-color: var(--bg-card) !important;
                    }
                    .agent-container {
                        border-radius: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                        margin: 0 !important;
                        max-width: none !important;
                        width: 100% !important;
                        flex: 1 !important;
                        background: var(--bg-card) !important;
                    }
                    /* --- Header glassmorphism --- */
                    .mobile-chat-header {
                        background: var(--bg-card) !important;
                        backdrop-filter: none !important;
                        -webkit-backdrop-filter: none !important;
                        border-bottom: 1px solid var(--border) !important;
                        padding: 0.75rem 1.25rem !important;
                        padding-left: max(1.25rem, env(safe-area-inset-left, 0px)) !important;
                        padding-right: max(1.25rem, env(safe-area-inset-right, 0px)) !important;
                        padding-top: calc(0.75rem + max(env(safe-area-inset-top), 24px)) !important;
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        right: 0 !important;
                        z-index: 20 !important;
                    }
                    /* --- Sidebar top safe-area --- */
                    .sidebar-header-padding {
                        padding-top: calc(1.25rem + max(env(safe-area-inset-top), 24px)) !important;
                    }
                    .agent-header-title {
                        font-size: 1.1rem !important;
                        font-weight: 700 !important;
                        letter-spacing: -0.03em !important;
                    }
                    /* --- Messages area --- */
                    .messages-container {
                        padding-left: max(1rem, env(safe-area-inset-left, 0px)) !important;
                        padding-right: max(1rem, env(safe-area-inset-right, 0px)) !important;
                        padding-top: calc(4.5rem + max(env(safe-area-inset-top), 24px)) !important;
                        padding-bottom: 0.5rem !important;
                        background: var(--bg-card) !important;
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                    .messages-container::-webkit-scrollbar { display: none; }
                    /* [P1-CHAT-MOBILE-FIT · 2026-08-10] Los mensajes se apilan desde ABAJO,
                       pegados a la caja de escribir. Antes el contenedor repartía todo el
                       alto sobrante ARRIBA del input: con un solo turno quedaban ~700px de
                       vacío entre lo último dicho y donde se escribe — el hueco enorme de
                       la captura del dueño.

                       El margen automático va en el HIJO, no un justify-content flex-end en
                       el contenedor: con flex-end, en cuanto el contenido desborda, el
                       principio del scroll queda inalcanzable en varios motores. El margen
                       automático se resuelve a 0 solo cuando hay desbordamiento — que es
                       exactamente el comportamiento que se quiere.

                       Va dentro del @media a propósito: en escritorio el contenedor centra
                       y ancla arriba (bloque de min-width 1025px), y ahí no hay queja.
                       (Sin acentos graves en este comentario: vive dentro de un template
                       literal de JS y un backtick aquí cierra el literal y rompe el build.) */
                    .msg-log { margin-top: auto !important; }
                    /* [P1-CHAT-HEADER-GAP · 2026-08-24] El gap de 2rem del log también
                       se aplicaba entre el último mensaje y el sentinel invisible. Ese
                       hueco desperdiciado abajo empujaba el primer turno bajo el header
                       al anclar la conversación al final. Se cancela solo para el sentinel;
                       la separación entre mensajes permanece intacta. */
                    .messages-end-sentinel {
                        margin-top: -2rem;
                    }
                    /* [P2-CHAT-WELCOME-UP · 2026-08-24] Solo la bienvenida se eleva
                       visualmente 24 px. El transform no ocupa espacio de layout y no
                       toca el compositor, el scroll ni las mediciones del teclado. */
                    .message-row-welcome {
                        transform: translateY(-1.5rem);
                    }
                    /* Con el teclado visible necesita un poco más de aire sobre el
                       compositor: 64 px totales, sin animación ni cambio de layout. */
                    html[data-kb-open] .message-row-welcome {
                        transform: translateY(-4rem);
                    }
                    /* --- User bubble ---
                       [P1-CHAT-MOBILE-CONTRAST · 2026-08-10] El defecto que reportó el
                       dueño: su propio mensaje se leía CASI INVISIBLE en el teléfono.

                       Esta regla fijaba el FONDO con !important y NO el color. El color
                       lo pone el inline de MessageBubble ('var(--text-main)'), que en tema
                       oscuro es #F1F5F9 — casi blanco sobre lavanda casi blanco: **1,0:1**,
                       cuando WCAG pide 4,5:1. No es que se leyera mal: no se leía.

                       Y solo pasaba en el móvil porque '.msg-bubble-user' NO EXISTE fuera
                       de este @media (max-width: 1024px) — es el único sitio del archivo
                       donde se declara. El escritorio nunca vio el defecto.

                       LA LECCIÓN, que es la que se guarda: color y fondo son un PAR. Fijar
                       uno con !important y dejar que el otro lo herede del tema es fabricar
                       una combinación que nadie eligió. Por eso el color viaja ahora en la
                       misma regla, y el tema oscuro lleva su propia pareja completa. */
                    .msg-bubble-user {
                        background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%) !important;
                        color: #1E1B4B !important;
                        border: none !important;
                        border-radius: 1.25rem 1.25rem 0.3rem 1.25rem !important;
                        padding: 0.8rem 1.1rem !important;
                        box-shadow: 0 2px 8px rgba(79,70,229,0.08) !important;
                        max-width: 85% !important;
                        font-size: 0.95rem !important;
                    }
                    /* En oscuro la burbuja es oscura: una pastilla lavanda clara dentro de
                       un chat negro no solo desentona, obliga a invertir el texto y a
                       mantener dos parejas de color en la cabeza. 12,5:1 medido. */
                    html[data-theme="dark"] .msg-bubble-user {
                        background: linear-gradient(135deg, #1E293B 0%, #312E5B 100%) !important;
                        color: var(--text-main) !important;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.35) !important;
                    }
                    /* El texto del usuario hereda; los hijos con color propio (enlaces,
                       código inline dentro del mensaje) no, y ahí volvería el mismo par
                       roto por otra puerta. */
                    .msg-bubble-user * {
                        color: inherit !important;
                    }
                    /* --- Bot bubble --- */
                    .msg-bubble-bot {
                        background: transparent !important;
                        border-left: 3px solid rgba(79,70,229,0.25) !important;
                        border-radius: 0 !important;
                        padding: 0.9rem 0 0.6rem 0.9rem !important;
                        font-size: 0.93rem !important;
                    }
                    /* El filete indigo del bot compone a ~1,2:1 sobre el fondo oscuro:
                       invisible. '--primary' en oscuro (#818CF8) da 6,9:1 y cumple el 3:1
                       que WCAG 1.4.11 pide a un elemento no textual que porta significado
                       (aquí distingue quién habla). */
                    html[data-theme="dark"] .msg-bubble-bot {
                        border-left-color: var(--primary) !important;
                    }
                    /* --- Bot avatar --- */
                    .bot-avatar-mobile {
                        background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%) !important;
                        box-shadow: 0 2px 12px rgba(79,70,229,0.3) !important;
                        width: 28px !important; height: 28px !important;
                        font-size: 0.95rem !important;
                    }
                    /* --- Input bar floating --- */
                    .input-wrapper {
                        position: relative !important;
                        bottom: auto !important;
                        /* [P1-CHAT-TABBAR-BACK · 2026-08-10] El chat reserva por dentro el
                           alto de la barra de pestañas que vuelve a esta ruta: 64px de
                           'min-height' + el 'env(safe-area-inset-bottom)' que la barra ya
                           añade por su cuenta. Se reserva AQUÍ y no en el 'mainContent'
                           porque '.noPaddingMobile' anula el 'padding-bottom' del layout
                           — esa fue justamente la razón por la que la barra se quitó en
                           vez de acomodarla.

                           Los 2,5rem que había eran aire muerto: en Safari vertical
                           'env(safe-area-inset-bottom)' vale 0 (el scroll de la página
                           está bloqueado, así que la barra del navegador no se repliega) y
                           el relleno quedaba en 40px de nada bajo la caja de escribir.
                           Ahora ese espacio lo ocupa navegación de verdad.

                           ⚠ Ese «vale 0» es SOLO de Safari vertical. En la PWA instalada y
                           en el WebView nativo, con viewport-fit=cover, vale el alto del
                           indicador de inicio (~34px). No recalibres esta reserva contra el
                           número de Safari. Con teclado abierto no se suma: ver la regla
                           html[data-kb-open] .input-wrapper de abajo. */
                        /* [P1-CHAT-AIRE-INFERIOR · 2026-08-23] El aire propio de la caja
                           pasa de 0.8rem a 1.4rem: los 64px de la reserva son la barra de
                           pestañas, no aire — la caja quedaba pegada a su borde superior
                           (captura del dueño, 2026-08-23 5:50). */
                        padding: 0.8rem 1.25rem calc(1.4rem + 64px + env(safe-area-inset-bottom, 0px)) 1.25rem !important;
                        padding-left: max(1.25rem, env(safe-area-inset-left, 0px)) !important;
                        padding-right: max(1.25rem, env(safe-area-inset-right, 0px)) !important;
                        background: var(--bg-card) !important;
                        /* [P1-KB-SIN-DESENFOQUE · 2026-08-23] EL glitch del cierre. Habia
                           un blur(20px) de fondo AQUI, y el fondo de esta caja es OPACO
                           (--bg-card): no habia nada translucido que desenfocar, asi que el
                           desenfoque no aportaba un solo pixel visible. Lo que si hacia era
                           obligar a Safari a recomponer una capa de desenfoque en CADA
                           fotograma mientras el contenedor cambia de alto, y eso en iOS se ve
                           como la caja a medio pintar y translucida — que es exactamente lo
                           que el dueno fotografio a mitad del cierre (8:51). En reposo no
                           cambia NADA; lo que desaparece es la clase entera de artefactos. */
                        border-top: none !important;
                        box-shadow: 0 -4px 30px rgba(0,0,0,0.06) !important;
                        /* [P1-KB-SIN-GLITCH · 2026-08-23] Era 0.2s ease-out: una curva y
                           una duracion DISTINTAS de las del contenedor del chat y de las de la
                           barra de pestanas. Tres piezas de la misma escena con tres tiempos es
                           exactamente lo que se ve como glitch al bajar. Ahora las tres usan la
                           curva y la duracion del teclado de iOS. */
                        transition: padding-bottom 0.25s cubic-bezier(0.32, 0.72, 0, 1) !important;
                        border-radius: 0 !important;
                    }
                    .jump-to-latest {
                        position: absolute;
                        right: max(1rem, env(safe-area-inset-right, 0px));
                        bottom: calc(6.8rem + 64px + env(safe-area-inset-bottom, 0px));
                        z-index: 18;
                        width: 44px;
                        height: 44px;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 999px;
                        border: 1px solid var(--border);
                        background: var(--bg-card);
                        color: var(--text-main);
                        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
                        cursor: pointer;
                    }
                    html[data-kb-open] .jump-to-latest {
                        bottom: 6.25rem;
                    }
                    /* [P1-CHAT-KEYBOARD-TABBAR · 2026-08-23 · corregido el 23] Con teclado no
                       hay barra de pestañas (ver BottomTabBar.module.css): la caja suelta la
                       reserva y queda pegada al teclado, que es donde se escribe.
                       La primera version de esta regla se comio la llave de cierre de
                       .input-wrapper y se llevo dentro sus seis declaraciones de aspecto
                       (blur, borde, sombra, radio): el composer perdía su acabado con el
                       teclado CERRADO, que es el 99% del tiempo. Aqui va SOLO el relleno. */
                    html[data-kb-open] .input-wrapper {
                        /* [P1-CHAT-AIRE-INFERIOR · 2026-08-23] 0.8rem → 1.1rem: con el
                           teclado abierto la caja quedaba lamiendo su borde superior. */
                        padding-bottom: 1.1rem !important;
                    }
                    /* --- Welcome screen --- */
                    .welcome-heading {
                        font-size: 1.6rem !important;
                    }
                    .welcome-sub {
                        font-size: 1.8rem !important;
                        background: linear-gradient(135deg, #64748b 0%, #94a3b8 50%, #4F46E5 100%) !important;
                        -webkit-background-clip: text !important;
                        -webkit-text-fill-color: transparent !important;
                        background-clip: text !important;
                    }
                    .empty-state-pills {
                        display: grid !important;
                        grid-template-columns: 1fr 1fr !important;
                        gap: 0.6rem !important;
                        width: 100% !important;
                    }
                    .suggestion-pill {
                        width: 100% !important;
                        padding: 0.85rem 0.75rem !important;
                        border-radius: 1rem !important;
                        font-size: 0.85rem !important;
                        flex-direction: column !important;
                        gap: 0.35rem !important;
                        text-align: center !important;
                        background: var(--bg-card) !important;
                        border: 1px solid var(--border) !important;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.04) !important;
                        transition: transform 0.15s ease, box-shadow 0.15s ease !important;
                    }
                    .suggestion-pill:active {
                        transform: scale(0.97) !important;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.08) !important;
                    }
                    .suggestion-pill-icon {
                        font-size: 1.5rem !important;
                    }
                    /* --- Loading typing dots --- */
                    .typing-dots-container {
                        display: flex !important;
                        gap: 0.3rem;
                        align-items: center;
                        padding: 0.5rem 0;
                    }
                    .typing-dot {
                        width: 8px; height: 8px;
                        border-radius: 50%;
                        background: #94a3b8;
                    }
                    .loading-text-desktop {
                        display: none !important;
                    }
                    /* --- Sidebar --- */
                    .agent-sidebar {
                        position: absolute;
                        top: 0; left: 0; height: 100%;
                        z-index: 30;
                        box-shadow: 4px 0 24px rgba(0,0,0,0.12);
                        border-radius: 0;
                        /* [P1-CHAT-TABBAR-BACK · 2026-08-10] El cajón llega hasta el borde
                           inferior, donde ahora vive la barra de pestañas: sin esta reserva
                           las últimas conversaciones de la lista quedan debajo de ella y no
                           se pueden tocar. Mismo cálculo que '.input-wrapper'. */
                        padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
                        box-sizing: border-box;
                    }
                    .sidebar-overlay {
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.5);
                        z-index: 25;
                        backdrop-filter: blur(3px);
                        -webkit-backdrop-filter: blur(3px);
                        border: 0;
                        padding: 0;
                    }
                }
                @media (min-width: 1025px) {
                    .sidebar-overlay { display: none; }
                    .messages-container {
                        justify-content: flex-start !important;
                        align-items: center !important;
                    }
                    .empty-state-wrapper {
                        margin-top: 10vh !important;
                        margin-bottom: auto !important;
                        max-width: 800px !important;
                        align-items: center !important;
                        text-align: center;
                    }
                    .welcome-heading {
                        justify-content: center !important;
                        width: 100%;
                    }
                    .empty-state-pills {
                        flex-direction: row !important;
                        flex-wrap: wrap !important;
                        align-items: center !important;
                        justify-content: center !important;
                    }
                    .nav-menu-wrapper {
                        display: none !important;
                    }
                    .mobile-only-btn {
                        display: none !important;
                    }
                }
            `}</style>
        </>
    );
};
export default AgentPage;
