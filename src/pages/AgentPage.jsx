import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssessment } from '../context/AssessmentContext';
import { Send, Bot, Loader2, Paperclip, X, Image as ImageIcon, Plus, MessageSquare, History, Menu, Apple, Dumbbell, Utensils, Camera, Sparkles, Trash2, Check, Mic, PhoneCall, ArrowUp, Square, ThumbsUp, ThumbsDown, RefreshCw, Copy, MoreVertical, LayoutDashboard, Clock, Settings, Edit2, Ghost, Refrigerator } from 'lucide-react';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
// [P3-LAZY-MARKDOWN · 2026-05-12] import de `react-markdown` eliminado:
// no se usa en este archivo. Pre-fix bundle includuía `react-markdown` +
// deps remark/mdast (~60KB gzip) en el chunk AgentPage por un import
// muerto. El uso real vive en MessageBubble + ChatWidget vía LazyMarkdown
// wrapper que mueve la lib a un chunk async separado.
import { MemoizedMessageBubble } from '../components/agent/MessageBubble';
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
// [P2-CHAT-CACHE-XUSER · 2026-05-31] Keys del chat desde el módulo SSOT (mismas
// que _clearUserScopedCaches borra en logout/user-switch). Los aliases `_CHAT_*`
// viven a scope de MÓDULO (no de componente) a propósito: un const de componente
// asignado a un import lo trata react-hooks/exhaustive-deps como dependencia
// inestable; a scope de módulo es estable y no ensucia los deps arrays.
import { CHAT_MESSAGES_CACHE_KEY, CHAT_SESSIONS_CACHE_KEY } from '../utils/chatCacheKeys';
const _CHAT_SESSIONS_CACHE_KEY = CHAT_SESSIONS_CACHE_KEY;
const _CHAT_CACHE_KEY = CHAT_MESSAGES_CACHE_KEY;
import { emitCoherenceToast } from '../utils/renderCoherenceWarnings';
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
import { captureException, addBreadcrumb } from '@sentry/react';

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
    // eslint-disable-next-line no-console
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
const _AGENT_ERROR_COPY = {
    504: {
        icon: '⏱',
        text: 'El asistente tardó más de la cuenta en responder. Puedes reintentar ahora.',
        retryable: true,
    },
    503: {
        icon: '🚦',
        text: 'El asistente está temporalmente saturado. Espera unos segundos y reintenta.',
        retryable: true,
    },
    429: {
        icon: '🚦',
        text: 'Demasiadas solicitudes seguidas. Espera un momento y reintenta.',
        retryable: true,
    },
    402: {
        icon: '🔒',
        text: 'Llegaste al límite mensual de tu plan. Actualiza para seguir conversando.',
        retryable: false,
    },
    // [P2-AGENT-413-NO-RETRY · 2026-05-30] El backend rechaza prompts > cap
    // (8192 chars, P0-CHAT-PROMPT-MAXLEN) con HTTP 413. Sin esta entrada caía
    // al genérico `retryable: true` → el botón "Reintentar" reenviaba el mismo
    // mensaje demasiado largo → loop 413 permanente, y el usuario nunca sabía
    // que su mensaje excedía el límite. `retryable: false` + copy claro.
    413: {
        icon: '✂',
        text: 'Tu mensaje es demasiado largo. Acórtalo y vuelve a enviarlo.',
        retryable: false,
    },
    401: {
        icon: '🔐',
        text: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.',
        retryable: false,
    },
    403: {
        icon: '🔐',
        text: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.',
        retryable: false,
    },
    0: {
        icon: '📡',
        text: 'Sin conexión al servidor. Verifica tu internet y reintenta.',
        retryable: true,
    },
};

const _buildAgentErrorMessage = ({ status, detail, retryPrompt, retryImageUrl, isAgentError }) => {
    let entry = _AGENT_ERROR_COPY[status];
    if (!entry) {
        // 500/502/otros — copy genérico retryable. Server problem.
        entry = {
            icon: '⚠',
            text: isAgentError
                ? 'El asistente tuvo un problema procesando tu mensaje. Puedes reintentar.'
                : 'El servidor tuvo un problema inesperado. Puedes reintentar en un momento.',
            retryable: true,
        };
    }
    _captureAgentPageException(new Error(`chat_error_status_${status}`), {
        chat_error_status: String(status),
        chat_error_kind: isAgentError ? 'agent_stream' : 'http',
    });
    const canRetry = entry.retryable && Boolean(retryPrompt || retryImageUrl);
    return {
        role: 'model',
        content: `${entry.icon} ${entry.text}`,
        errorType: status === 0 ? 'network' : `http_${status}`,
        errorStatus: status,
        retryable: canRetry,
        retryPrompt: canRetry ? retryPrompt : null,
        retryImageUrl: canRetry ? retryImageUrl : null,
        _isErrorBubble: true,
    };
};

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

const generateIntelligentWelcome = (userProfile, formData, planData) => {
    const nameStr = formData?.name || userProfile?.name || userProfile?.first_name || '';
    const nameParts = nameStr.split(' ');
    const firstName = nameParts[0] ? ' ' + nameParts[0] : '';

    const now = new Date();
    const hour = now.getHours();

    let timeGreeting = '¡Hola';
    if (hour >= 0 && hour < 5) timeGreeting = '¡Buenas madrugadas';
    else if (hour >= 5 && hour < 12) timeGreeting = '¡Buenos días';
    else if (hour >= 12 && hour < 19) timeGreeting = '¡Buenas tardes';
    else timeGreeting = '¡Buenas noches';

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

    if (planData && !isPlanExpired && mealKeyword !== 'madrugada') {
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
            'Veo que sigues despierto, ¡recuerda que el buen descanso es clave para tu progreso! Si necesitas ayuda con algo, aquí estoy.',
            'A esta hora lo ideal es descansar, así que no te recomendaré comidas pesadas. ¡Cuéntame si puedo ayudarte en algo más!',
            '¿Despierto hasta tarde? Si de verdad tienes hambre y necesitas algo súper ligero, pregúntame para no alterar tu meta.'
        ];
        mealContext = variants[Math.floor(Math.random() * variants.length)];
    } else if (mealKeyword === 'desayuno') {
        const variants = exactMealName ? [
            `Según tu plan, hoy te toca **${exactMealName}** de desayuno, ¿tienes los ingredientes listos o armamos una alternativa rápida?`,
            `Para desayunar hoy tienes marcado **${exactMealName}**. ¡Cuéntame si ya lo preparaste o si quieres cambiar algo!`,
            `Tu desayuno sugerido de hoy es **${exactMealName}**. ¿Preparado para arrancar el día con energía?`
        ] : [
            '¿Listo para tu desayuno o necesitas una idea rápida?',
            '¡Es hora de desayunar! ¿Ya sabes qué vas a preparar?',
            '¿Qué tienes pensado para el desayuno de hoy? Si no sabes, ¡te ayudo!'
        ];
        mealContext = variants[Math.floor(Math.random() * variants.length)];
    } else if (mealKeyword === 'almuerzo') {
        const variants = exactMealName ? [
            `Hoy de almuerzo tienes marcado **${exactMealName}**. ¿Ya lo preparaste o necesitas cambiar algo con los ingredientes que tienes?`,
            `Es la hora del almuerzo y te toca **${exactMealName}**. ¿Te ayudo con la receta o tienes un plan distinto?`,
            `Para tu almuerzo de hoy está planeado **${exactMealName}**. ¡Avisa si necesitas reemplazar algún ingrediente!`
        ] : [
            '¿Preparando ya el almuerzo o necesitas una receta rápida?',
            '¡Llegó la hora de almorzar! ¿Qué vas a preparar?',
            '¿Necesitas ideas para tu comida del mediodía? Dime qué hay en tu nevera.'
        ];
        mealContext = variants[Math.floor(Math.random() * variants.length)];
    } else if (mealKeyword === 'cena') {
        const variants = exactMealName ? [
            `De cena para hoy tienes: **${exactMealName}**. ¿Quieres que te pase las instrucciones paso a paso o prefieres otra cosa?`,
            `Para cerrar el día, tu cena sugerida es **${exactMealName}**. ¿Qué te parece?`,
            `Tu cena de hoy será **${exactMealName}**. ¡Si necesitas hacerlo más fácil o cambiar ingredientes, estoy aquí!`
        ] : [
            '¿Buscando algo ligero antes de dormir o tu cena completa?',
            '¡Es hora de cenar! ¿Ya sabes qué harás?',
            '¿Qué cenaremos hoy? Dime tus opciones y te recomiendo algo rápido.'
        ];
        mealContext = variants[Math.floor(Math.random() * variants.length)];
    } else {
        // snack
        const variants = exactMealName ? [
            `Es hora de tu snack o merienda: **${exactMealName}**. Si no lo tienes, dime qué hay en tu refri y lo resolvemos.`,
            `Para tu merienda te toca **${exactMealName}**. ¿Listo para disfrutarla?`,
            `Tu snack sugerido es **${exactMealName}**. ¡Cuéntame si prefieres otra opción dulce o salada!`
        ] : [
            '¿Necesitas un buen snack para calmar el hambre?',
            '¡Hora de una merienda rápida! ¿Quieres ideas?',
            '¿Qué te provoca de snack ahora mismo? Tengo varias opciones.'
        ];
        mealContext = variants[Math.floor(Math.random() * variants.length)];
    }

    let goalContext = '';
    // Schema field is "main_goal", with fallbacks for legacy data
    const goalField = planData?.main_goal || planData?.goal || planData?.objective || '';
    if (goalField) {
        const lowerGoal = goalField.toLowerCase();
        let goalText = '';
        if (lowerGoal.includes('pérdida') || lowerGoal.includes('peso') || lowerGoal.includes('déficit') || lowerGoal.includes('bajar')) goalText = 'bajar de peso';
        else if (lowerGoal.includes('músculo') || lowerGoal.includes('masa') || lowerGoal.includes('ganar')) goalText = 'ganar masa muscular';
        else if (lowerGoal.includes('mantenimiento') || lowerGoal.includes('mantener')) goalText = 'mantenerte en forma';
        else if (lowerGoal.includes('recomp')) goalText = 'recomponer tu cuerpo';

        if (goalText) {
            goalContext = `Seguimos enfocados en tu meta de ${goalText}. `;
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

const compressImageFile = (file, maxWidth = 1200, quality = 0.8) => {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.src = objectUrl;
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        resolve(file); // fallback
                        return;
                    }
                    const newFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });
                    resolve(newFile);
                },
                'image/jpeg',
                quality
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(file); // fallback
        };
    });
};

const AgentPage = () => {
    const { session, planData, formData, updateData, saveGeneratedPlan, userProfile, isPremium, checkPlanLimit, restoreSessionData } = useAssessment();
    const navigate = useNavigate();
    const [titlePollCount, setTitlePollCount] = useState(0);
    const [showNavMenu, setShowNavMenu] = useState(false);
    const navMenuRef = useRef(null);
    const inputWrapperRef = useRef(null);

    // IsMobile detection para asegurar sobrescritura inline a prueba de fallos de iOS
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 1024 : false);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
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

    // [MOBILE-KEYBOARD-LIFT] Eleva el input wrapper sobre el teclado iOS.
    // Sin esto, el `position: sticky` no responde al keyboard porque iOS Safari
    // mueve el "visual viewport" (donde el usuario VE) pero no el "layout
    // viewport" (donde CSS posiciona). Solución: listen a window.visualViewport
    // y aplicar transform: translateY(-offset) al wrapper, replicando el
    // patrón de Gemini/ChatGPT/Claude en mobile.
    useEffect(() => {
        if (typeof window === 'undefined' || !window.visualViewport) return undefined;
        const vv = window.visualViewport;

        const updateInputPosition = () => {
            const wrapper = inputWrapperRef.current;
            if (!wrapper) return;
            // offsetBottom > 0 cuando el teclado está abierto (visual viewport
            // más pequeño que window.innerHeight). vv.offsetTop captura el caso
            // de scroll dentro del visual viewport (raro pero defensivo).
            const offsetBottom = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
            if (offsetBottom > 0) {
                // Keyboard abierto: elevar Y colapsar el padding-bottom para
                // que el input quede pegado al accessory bar (sin gap visual).
                wrapper.style.transform = `translateY(-${offsetBottom}px)`;
                wrapper.style.paddingBottom = '0.5rem';
            } else {
                // Keyboard cerrado: restaurar a los valores definidos en style inline.
                wrapper.style.transform = '';
                wrapper.style.paddingBottom = '';
            }
        };

        vv.addEventListener('resize', updateInputPosition);
        vv.addEventListener('scroll', updateInputPosition);
        updateInputPosition();
        return () => {
            vv.removeEventListener('resize', updateInputPosition);
            vv.removeEventListener('scroll', updateInputPosition);
        };
    }, []);

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

    const [guestSessionIds, setGuestSessionIds] = useState(() => {
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
        // Fix: leer `mealfit_current_session` primero. Validación mínima
        // (string no-vacío con shape de UUID v4). Solo crear nuevo si no hay
        // sesión válida persistida.
        const stored = safeLocalStorageGet('mealfit_current_session', null);
        if (stored && typeof stored === 'string' && /^[0-9a-f-]{30,}$/i.test(stored)) {
            return stored;
        }
        const newId = crypto.randomUUID();
        safeLocalStorageSet('mealfit_current_session', newId);
        return newId;
    });
    const setCurrentSessionId = (id) => {
        safeLocalStorageSet('mealfit_current_session', id);
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
    }, [planData, formData, userProfile]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingStatus, setStreamingStatus] = useState(null);
    const [abortController, setAbortController] = useState(null);
    const abortControllerRef = useRef(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [editingSessionId, setEditingSessionId] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [previewUrl, setPreviewUrl] = useState(null);
    // [P3-CHAT-OBJECTURL-LEAK · 2026-06-01] Ref espejo de previewUrl para que el
    // teardown de unmount (effect deps []) pueda revocar el blob staged sin
    // capturarlo en stale-closure. clearSelectedFile cubre cancel/swap; este ref
    // cubre el camino imagen-staged-pero-no-enviada → navegar fuera (unmount SPA).
    const previewUrlRef = useRef(null);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    // [P3-CHAT-FOCUS-TELEM · 2026-05-19] Ref al textarea para refocus
    // post-send (solo cuando tenía focus pre-send — preserva mobile UX
    // donde tap del botón send NO debe abrir keyboard).
    const chatInputRef = useRef(null);

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
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                    el.setSelectionRange(text.length, text.length);
                } catch { /* noop */ }
            }, 120);
        };
        apply();
        window.addEventListener(AGENT_PREFILL_EVENT, apply);
        return () => window.removeEventListener(AGENT_PREFILL_EVENT, apply);
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const [isListening, setIsListening] = useState(false);
    const [micErrorMsg, setMicErrorMsg] = useState(null);
    const recognitionRef = useRef(null);
    const originalInputRef = useRef('');
    const silenceTimerRef = useRef(null);

    // Para Drag & Drop de Imágenes
    const [isDragging, setIsDragging] = useState(false);

    const latestInputRef = useRef(input);

    useEffect(() => {
        latestInputRef.current = input;
    }, [input]);

    const handleSendRef = useRef(null);

    // --- Lógica de Modo Llamada (Voz Nativa) ---
    const [isCallModeActive, setIsCallModeActive] = useState(false);
    const callModeRef = useRef(false);
    useEffect(() => { callModeRef.current = isCallModeActive; }, [isCallModeActive]);

    const [isSpeaking, setIsSpeaking] = useState(false);
    const isSpeakingRef = useRef(false);
    useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

    const isLoadingRef = useRef(isLoading);
    useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

    // [P3-CHAT-OBJECTURL-LEAK · 2026-06-01] Mantener previewUrlRef fresco para el
    // teardown de unmount de abajo.
    useEffect(() => { previewUrlRef.current = previewUrl; }, [previewUrl]);

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
        // [P3-CHAT-OBJECTURL-LEAK · 2026-06-01] Revocar el blob de preview staged si
        // el user navega fuera con una imagen adjunta sin enviar (guard blob: evita
        // revocar URLs de servidor).
        try {
            const _pv = previewUrlRef.current;
            if (_pv && _pv.startsWith('blob:')) URL.revokeObjectURL(_pv);
        } catch (_e) { /* noop */ }
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
        const cleanText = text.replace(/[*_#\[\]]/g, '').trim();
        if (!cleanText) return;
        ttsQueue.current.push(cleanText);
        processTTSQueue();
    }, []);

    const toggleCallMode = () => {
        if (isCallModeActive) {
            setIsCallModeActive(false);
            callModeRef.current = false;
            if (audioPlayerRef.current) {
                audioPlayerRef.current.pause();
                audioPlayerRef.current.currentTime = 0;
            }
            ttsQueue.current = [];
            isPlayingAudio.current = false;
            isSpeakingRef.current = false;
            setIsSpeaking(false);
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) { }
            }
        } else {
            setIsCallModeActive(true);
            callModeRef.current = true;

            // Hack para iOS/Móvil: Desbloquear el player único para todo el ciclo de vida de la página
            try {
                audioPlayerRef.current.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
                audioPlayerRef.current.volume = 0.01;
                audioPlayerRef.current.play().catch(() => { });
            } catch (e) { }

            if (!isListening) {
                toggleDictation();
            }
        }
    };

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

    const toggleDictation = () => {
        if (isListening) {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (e) { }
            }
            setIsListening(false);
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setMicErrorMsg('Micrófono no soportado en este navegador');
            setTimeout(() => setMicErrorMsg(null), 3500);
            return;
        }

        const recognition = new SpeechRecognition();
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        recognition.continuous = !isIOS; // iOS no soporta continuous=true
        recognition.interimResults = true;
        recognition.lang = 'es-DO';

        let finalTranscript = '';

        recognition.onstart = () => {
            setIsListening(true);
            finalTranscript = '';
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let newTextChunk = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const chunk = event.results[i][0].transcript;
                newTextChunk += chunk;
                if (event.results[i].isFinal) {
                    finalTranscript += chunk + ' ';
                } else {
                    interimTranscript += chunk;
                }
            }

            // --- BARGE-IN (Interrupción por voz) ---
            const hasRealLetters = newTextChunk.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '').length > 0;
            const isTTSActive = isSpeakingRef.current || ttsQueue.current.length > 0 || isPlayingAudio.current;

            if (callModeRef.current && isTTSActive && hasRealLetters) {
                // Si estábamos hablando y escuchamos al usuario decir una palabra real, callar IA y cancelar stream actual
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
            }
            // ---------------------------------------

            const newText = (originalInputRef.current + ' ' + finalTranscript + interimTranscript).replace(/\s+/g, ' ').trim();
            setInput(newText);

            if (callModeRef.current) {
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = setTimeout(() => {
                    // Detenemos manualmente para forzar onend inmediatamente después de 3s de silencio
                    if (recognitionRef.current) {
                        try { recognitionRef.current.stop(); } catch (e) { }
                    }
                }, 3000);
            }
        };

        recognition.onerror = (event) => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            console.error("Speech recognition error", event.error);
            setIsListening(false);
            if (event.error === 'not-allowed') {
                setMicErrorMsg('Micrófono inactivo o bloqueado');
            } else if (event.error === 'network') {
                setMicErrorMsg('Dictado no compatible en este navegador');
            } else {
                setMicErrorMsg('Error al conectar el micrófono');
            }
            setTimeout(() => setMicErrorMsg(null), 3500);
        };

        recognition.onend = () => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            setIsListening(false);
            if (callModeRef.current) {
                const currentText = latestInputRef.current.trim();
                if (currentText && !isSpeakingRef.current && !isLoadingRef.current) {
                    if (handleSendRef.current) {
                        originalInputRef.current = ''; // Reset buffer on send
                        handleSendRef.current(currentText);
                    }
                } else {
                    // Mantenemos el ciclo activo para seguir escuchando interrupciones/nuevo texto
                    originalInputRef.current = latestInputRef.current;
                    setTimeout(() => {
                        try { recognitionRef.current?.start(); } catch (e) { }
                    }, 50);
                }
            }
        };

        recognitionRef.current = recognition;
        originalInputRef.current = latestInputRef.current;

        try {
            recognition.start();
        } catch (e) {
            console.error("Error starting mic", e);
            setIsListening(false);
        }
    };

    const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);
    const loadingPhrases = [
        "Revisando tus preferencias y contexto...",
        "Evaluando tu perfil y macros...",
        "Analizando tu objetivo con Inteligencia Nutricional...",
        "Alineando tu genética con el plan...",
        "Calculando la mejor respuesta metabólica..."
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

    const processSelectedFile = async (file) => {
        if (!file.type.startsWith('image/')) {
            // [P3-AUDIT-2 · 2026-05-15] `alert()` nativo reemplazado por
            // `toast.error` (sonner). El resto de la app usa sonner
            // consistentemente; `alert()` bloquea el thread y rompe la UX
            // mobile (modal-blocking dialog que no respeta el theme dark).
            toast.error('Formato no soportado. Por favor sube una imagen válida.');
            return;
        }

        // Generar preview local INMEDIATAMENTE para anular percepción de lag
        setPreviewUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
        });

        // Guardar original temporalmente
        setSelectedFile(file);

        try {
            // Comprimir imagen asincrónicamente
            const compressedFile = await compressImageFile(file);
            setSelectedFile(compressedFile);
        } catch (err) {
            console.error("No se pudo comprimir la imagen:", err);
            // Si falla, el archivo original ya quedó configurado como fallback
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            processSelectedFile(file);
        }
    };

    const clearSelectedFile = ({ revoke = true } = {}) => {
        // [P3-CHAT-OBJECTURL-LEAK · 2026-05-31] Revocar el blob URL del preview
        // al limpiarlo (cancel / "Quitar imagen") para liberar memoria. En el
        // send path se pasa {revoke:false}: el blob sigue mostrándose en el
        // mensaje recién enviado hasta que la URL del servidor lo reemplaza, y
        // ahí se revoca explícitamente (ver handleSend). Sin esto, cada imagen
        // enviada/cancelada orfanaba un object URL hasta el page-unload.
        setPreviewUrl(prev => {
            if (revoke && prev) {
                try { URL.revokeObjectURL(prev); } catch { /* noop */ }
            }
            return null;
        });
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    processSelectedFile(file);
                }
                break;
            }
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
        const file = e.dataTransfer.files?.[0];
        if (file) {
            processSelectedFile(file);
        }
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
    const scrollToBottom = (force = false) => {
        if (userScrolledUpRef.current && !force) return;
        if (scrollRafRef.current) return; // ya hay un scroll agendado este frame
        scrollRafRef.current = requestAnimationFrame(() => {
            scrollRafRef.current = null;
            const msgs = messagesRef.current;
            const last = Array.isArray(msgs) && msgs.length ? msgs[msgs.length - 1] : null;
            messagesEndRef.current?.scrollIntoView({ behavior: last?.isStreaming ? 'auto' : 'smooth' });
        });
    };

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
            userScrolledUpRef.current = distanceFromBottom > 120;
        } catch (_e) {
            // Defensivo contra browsers raros que devuelvan NaN o lancen
            // en getters. NO afecta el flow del chat.
        }
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
                const savedListStr = localStorage.getItem('mealfit_guest_sessions_list');
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
        let response;
        try {
            response = await fetchWithAuth(`/api/chat/history/${sessionId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.messages && data.messages.length > 0) {
                    // Filtrar los mensajes de sistema/bienvenida: detectar por flag o por patrones conocidos
                    const filteredMessages = data.messages.filter(m => {
                        if (!m.content) return false;
                        // Filtrar mensajes de bienvenida viejos y nuevos por patrones estables (no time-dependent)
                        if (m.content === '¡Hola! Soy tu agente conversacional de nutrición IA. ¿En qué te puedo ayudar con tu plan alimenticio de hoy?') return false;
                        if (m.role === 'model' && m.content.includes('Son las ') && (m.content.includes('de tu súper)') || m.content.includes('especialista para guiarte') || m.content.includes('enfocados en tu meta'))) return false;
                        return true;
                    });
                    setMessages(filteredMessages.map(m => {
                        let content = m.content;
                        let isImage = false;
                        let imageUrl = null;

                        // Extract [IMAGE: url]
                        const imgMatch = content.match(/\[IMAGE:\s*(.+?)\]/);
                        if (imgMatch) {
                            isImage = true;
                            imageUrl = imgMatch[1];
                            content = content.replace(/\[IMAGE:\s*.+?\]\n?/, '');
                        }

                        // Limpiar prefijo de visión y contexto enriquecido del historial
                        if (m.role === 'user') {
                            // Limpiar hora del usuario
                            content = content.replace(/\[\(Hora actual del usuario:.*?\)\]\n?/gi, '');

                            if (content.includes('[El usuario subió una imagen.')) {
                                const userMsgMatch = content.match(/Mensaje del usuario:\s*(.+)$/s);
                                if (userMsgMatch) {
                                    content = userMsgMatch[1].trim();
                                } else {
                                    content = content.replace(/\[El usuario subió una imagen\..+?\]\n\n?/s, '');
                                }
                            } else if (content.includes('[Sistema: El usuario acaba de subir una imagen')) {
                                // En este caso NO HAY mensaje del usuario original, todo era un prompt de sistema
                                content = '';
                            }

                            // Limpiar "Mensaje del usuario:" que inyecta el backend para darle contexto al LLM
                            content = content.replace(/Mensaje del usuario:\s*/gi, '');

                            // Remover la sección de <dietary_context>
                            content = content.replace(/<dietary_context>[\s\S]*?<\/dietary_context>/, '').trim();
                        }

                        // Si el bot genera el system title, lo ocultamos
                        if (m.role === 'model' && content.startsWith('[SYSTEM_TITLE]')) {
                            return null;
                        }

                        return {
                            role: m.role,
                            content: content || '',
                            isImage: isImage || (m.role === 'user' && (m.content || '').includes('[El usuario subió una imagen.') || (m.content || '').includes('[Sistema: El usuario acaba de subir una imagen')),
                            imageUrl: imageUrl
                        };
                    }));
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

                // Si borramos el chat actual activo, redirigimos a un chat nuevo
                if (currentSessionId === sessionIdToDelete) {
                    const newId = crypto.randomUUID();
                    safeLocalStorageSet('mealfit_current_session', newId);
                    setCurrentSessionId(newId);
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error("Error al eliminar el chat devuelto por el servidor:", errorData);
            }
        } catch (error) {
            console.error("Excepción eliminando chat:", error);
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

    const handleNewChat = () => {
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
        fetchChatSessions();
        if (window.innerWidth <= 768) {
            setShowSidebar(false);
        }
    };


    useEffect(() => {
        handleSendRef.current = handleSend;
    }, [input, selectedFile, previewUrl, messages, currentSessionId, isLoading, isListening]); // ensure dependencies for fresh closure

    const handleSend = async (overrideInput = null, options = {}) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(40); // Haptic feedback on send
        }
        const textToSend = typeof overrideInput === 'string' ? overrideInput : input;

        if ((!textToSend.trim() && !selectedFile && !options.overrideImageUrl) || isLoading) return;

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
        const currentFile = selectedFile;
        const currentPreview = previewUrl;

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
        // [P3-CHAT-OBJECTURL-LEAK · 2026-05-31] revoke:false — el blob de
        // `currentPreview` sigue vivo en el mensaje recién enviado; se revoca
        // tras el swap a la URL del servidor (más abajo).
        clearSelectedFile({ revoke: false });
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

        const newMessages = options.truncateIndex !== undefined
            ? messages.slice(0, options.truncateIndex)
            : [...messages];

        // Agregar mensaje visual si hay imagen
        if (currentFile) {
            newMessages.push({ role: 'user', content: userMsg || '', isImage: true, imageUrl: currentPreview });
        } else if (options.overrideImageUrl) {
            newMessages.push({ role: 'user', content: userMsg || '', isImage: true, imageUrl: options.overrideImageUrl });
        } else {
            newMessages.push({ role: 'user', content: userMsg });
        }

        setMessages(newMessages);

        // [P1-CHAT-ERROR-DIFF · 2026-05-19] Declarados arriba del try para que
        // el catch outer (network error) pueda referenciarlos al construir el
        // mensaje retryable.
        let uploadedImageUrl = null;

        try {
            let visionDescription = null;

            // Manejar subida de imagen si existe
            if (currentFile) {
                const formData = new FormData();
                formData.append('file', currentFile);
                formData.append('user_id', session?.user?.id || userProfile?.id || localSessionId);
                formData.append('session_id', currentSessionId);
                const currentTzOffset = new Date().getTimezoneOffset();
                formData.append('tz_offset_mins', currentTzOffset.toString());

                const uploadRes = await fetchWithAuth('/api/diary/upload', {
                    method: 'POST',
                    body: formData
                });

                const uploadData = await uploadRes.json();

                if (uploadData.success && uploadData.description) {
                    visionDescription = uploadData.description;
                    uploadedImageUrl = uploadData.image_url;
                }

                // Update temporary local preview URL to actual server URL
                setMessages(prev => {
                    const updated = [...prev];
                    let lastUserMsgIdx = -1;
                    for (let i = updated.length - 1; i >= 0; i--) {
                        if (updated[i].role === 'user') {
                            lastUserMsgIdx = i;
                            break;
                        }
                    }
                    if (lastUserMsgIdx !== -1 && updated[lastUserMsgIdx].isImage) {
                        // [P2-CHAT-IMG-SWAP-RERENDER · 2026-06-01] Objeto NUEVO (no
                        // mutación in-place): conserva la misma ref si mutamos en sitio
                        // → React.memo de MessageBubble hace skip → el <img> sigue
                        // apuntando al blob que revocamos abajo (imagen rota). El spread
                        // rompe la igualdad referencial y el comparator (que ahora compara
                        // imageUrl) re-renderiza la burbuja a la URL del servidor ANTES
                        // del revoke.
                        updated[lastUserMsgIdx] = {
                            ...updated[lastUserMsgIdx],
                            imageUrl: uploadedImageUrl || updated[lastUserMsgIdx].imageUrl,
                        };
                    }
                    return updated;
                });

                // [P3-CHAT-OBJECTURL-LEAK · 2026-05-31] El blob de preview ya
                // fue reemplazado por la URL del servidor en el mensaje →
                // revocarlo para liberar memoria. Solo si hubo swap real (si el
                // upload no devolvió URL, el blob sigue en uso como fallback).
                if (uploadedImageUrl && typeof currentPreview === 'string' && currentPreview.startsWith('blob:')) {
                    try { URL.revokeObjectURL(currentPreview); } catch { /* noop */ }
                }
            }

            // Interactuar por el chat normal SIEMPRE (incluso si solo hay imagen)
            if (userMsg || currentFile || options.overrideImageUrl) {
                // Incorporate image URL into promptToSend so it's persisted in DB
                let promptToSend = userMsg || "";
                if (currentFile && uploadedImageUrl) {
                    promptToSend = `[IMAGE: ${uploadedImageUrl}]\n${promptToSend}`;
                } else if (options.overrideImageUrl) {
                    promptToSend = `[IMAGE: ${options.overrideImageUrl}]\n${promptToSend}`;
                }

                // Obtener hora actual local formateada
                const currentTime = new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true });
                const timeContext = `(Hora actual del usuario: ${currentTime})`;

                // Si hay una descripción de visión, enriquecer el prompt con contexto de tiempo
                let enrichedPrompt = promptToSend;
                if (!userMsg && currentFile) {
                    enrichedPrompt = `${promptToSend}\n[Sistema: El usuario acaba de subir una imagen de comida. Análisis de la imagen: "${visionDescription}"]\n\n${timeContext}\nInstrucción: Actúa proactivamente. Menciona amigablemente lo que ves en la foto. REGLA VISUAL DE FORMATO: Usa SIEMPRE una lista con viñetas para desglosar sus macros y usa **negritas** para resaltarlos. Revisa detalladamente tu 'DIARIO DE HOY' en el system prompt: SI el usuario YA tiene registrada la comida principal de esta hora (ej: si ya cenó), NO le preguntes si esto es su cena, asume que es un snack extra o pregúntale por qué está comiendo algo adicional; si NO tiene nada registrado para esta hora, entonces SÍ pregúntale brevemente si esta foto corresponde a su comida del momento (ej: su cena). No pongas el prefijo [Sistema]. Sólo responde directo y conversacional.`;
                } else if (visionDescription) {
                    enrichedPrompt = `[El usuario subió una imagen. Análisis de la imagen: "${visionDescription}"]\n\n${timeContext}\nMensaje del usuario: ${promptToSend}`;
                } else {
                    enrichedPrompt = `[${timeContext}]\nMensaje del usuario: ${promptToSend}`;
                }

                setStreamingStatus('Conectando...');

                // Limpiar mensaje de bienvenida si es el primero del usuario
                if (newMessages.length > 0 && newMessages[0].isWelcome) {
                    newMessages.shift();
                }

                setChatSessions((prev) => {
                    const exists = prev.some(s => s.id === currentSessionId);
                    if (!exists) {
                        return [{ id: currentSessionId, title: 'Generando título...', created_at: new Date().toISOString() }, ...prev];
                    }
                    return prev;
                });

                const now = new Date();
                const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                const controller = new AbortController();
                setAbortController(controller);
                abortControllerRef.current = controller;

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
                                        // Detectar y procesar evento silencioso REFRESH_PLAN
                                        if (fullText.includes('[UI_ACTION: REFRESH_PLAN]')) {
                                            fullText = fullText.replace(/\[UI_ACTION:\s*REFRESH_PLAN\]/g, '');
                                            if (session?.user?.id) {
                                                restoreSessionData(session.user.id);
                                            }
                                        }
                                        // [P3-WATER-TRACKER · 2026-05-16] REFRESH_HYDRATION: el agente
                                        // mutó el conteo de vasos via log_water_glass → notificar al
                                        // WaterTracker para que refetchee. Custom event en lugar de
                                        // restoreSessionData (el card vive independiente del session).
                                        if (fullText.includes('[UI_ACTION: REFRESH_HYDRATION]')) {
                                            fullText = fullText.replace(/\[UI_ACTION:\s*REFRESH_HYDRATION\]/g, '');
                                            window.dispatchEvent(new CustomEvent('mealfit:refresh-hydration'));
                                        }
                                        // [P1-CHAT-UI-ACTION-INVENTORY · 2026-05-20] REFRESH_INVENTORY:
                                        // el agente mutó consumed_meals (log_consumed_meal) o user_inventory
                                        // (modify_pantry_inventory / mark_shopping_list_purchased) → notificar
                                        // al card de Progreso (TrackingProgress, lee consumed_meals) y al
                                        // refresh de inventory del Dashboard. Sin esto, el tag se renderiza
                                        // tal cual al user (bug visible reportado 2026-05-20) + nadie refetchea
                                        // hasta el próximo polling de 15s. Custom event análogo a refresh-hydration.
                                        if (fullText.includes('[UI_ACTION: REFRESH_INVENTORY]')) {
                                            fullText = fullText.replace(/\[UI_ACTION:\s*REFRESH_INVENTORY\]/g, '');
                                            window.dispatchEvent(new CustomEvent('mealfit:refresh-inventory'));
                                        }
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
                                        fullText = dataObj.response;

                                        // Limpieza de seguridad al final por si el chunk llegó mal cortado
                                        if (fullText.includes('[UI_ACTION: REFRESH_PLAN]')) {
                                            fullText = fullText.replace(/\[UI_ACTION:\s*REFRESH_PLAN\]/g, '');
                                            if (session?.user?.id) {
                                                restoreSessionData(session.user.id);
                                            }
                                        }
                                        // [P3-WATER-TRACKER · 2026-05-16] Misma limpieza para REFRESH_HYDRATION.
                                        if (fullText.includes('[UI_ACTION: REFRESH_HYDRATION]')) {
                                            fullText = fullText.replace(/\[UI_ACTION:\s*REFRESH_HYDRATION\]/g, '');
                                            window.dispatchEvent(new CustomEvent('mealfit:refresh-hydration'));
                                        }
                                        // [P1-CHAT-UI-ACTION-INVENTORY · 2026-05-20] Misma limpieza
                                        // final para REFRESH_INVENTORY. Defense-in-depth: si el chunk
                                        // streaming no contenía el tag completo (race), el evento `done`
                                        // trae el response completo donde sí está.
                                        if (fullText.includes('[UI_ACTION: REFRESH_INVENTORY]')) {
                                            fullText = fullText.replace(/\[UI_ACTION:\s*REFRESH_INVENTORY\]/g, '');
                                            window.dispatchEvent(new CustomEvent('mealfit:refresh-inventory'));
                                        }

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
                                            detail: dataObj.message,
                                            retryPrompt: userMsg,
                                            retryImageUrl: uploadedImageUrl,
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
                    let errData = {};
                    try { errData = await response.json(); } catch (e) { /* ignore */ }
                    setMessages(prev => [...prev, _buildAgentErrorMessage({
                        status: response.status,
                        detail: errData?.detail,
                        retryPrompt: userMsg,
                        retryImageUrl: uploadedImageUrl,
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
                detail: error?.message,
                retryPrompt: userMsg,
                retryImageUrl: uploadedImageUrl,
            })]);
        } finally {
            setIsLoading(false);
            setStreamingStatus(null);
            setAbortController(null);
        }
    };

    const handleStopGeneration = () => {
        if (abortController) {
            abortController.abort();
            setAbortController(null);
            abortControllerRef.current = null;
            setIsLoading(false);
            setStreamingStatus(null);
        }
    };

    const handleRegenerate = (modelMsgIndex) => {
        if (isLoading) return;

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
                overrideImageUrl: lastUserMsg.imageUrl
            });
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const renderInputArea = (isCentered = false) => (
        <div className="input-wrapper" ref={inputWrapperRef} style={{
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
        }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', position: 'relative' }}>

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
                            <span style={{ fontSize: '1.1rem' }}>✋</span> Detener
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
                    borderRadius: isCentered ? '2rem' : (previewUrl ? '1rem' : '2rem'),
                    padding: isCentered ? '0.5rem 0.5rem 0.5rem 1rem' : (previewUrl ? '0.5rem' : '0.5rem 0.5rem 0.5rem 1rem'),
                    boxShadow: 'none',
                    border: isCentered ? '1px solid var(--border)' : '1px solid var(--border)',
                    transition: 'all 0.2s ease',
                }}>
                    {/* Image Preview Area - Integrated inside the input container */}
                    {previewUrl && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginLeft: '3rem',
                            marginBottom: '0.5rem',
                            marginRight: '0.5rem'
                        }}>
                            <div style={{
                                display: 'inline-block',
                                position: 'relative',
                                padding: '4px',
                                background: 'var(--bg-card)',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}>
                                <img src={previewUrl} alt="Preview" style={{ width: '48px', height: '48px', borderRadius: '6px', opacity: isLoading ? 0.5 : 1, objectFit: 'cover' }} />
                                <button
                                    type="button"
                                    aria-label="Quitar imagen"
                                    onClick={() => clearSelectedFile()}
                                    disabled={isLoading}
                                    style={{
                                        position: 'absolute', top: '-6px', right: '-6px',
                                        background: '#ef4444', color: 'white', border: 'none',
                                        borderRadius: '50%', width: '18px', height: '18px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                    }}
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'nowrap',
                        width: '100%'
                    }}>
                        <input
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp, image/heic"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                        />

                        <button
                            type="button"
                            aria-label="Adjuntar imagen"
                            className={`attachment-btn ${isLoading ? 'disabled' : ''}`}
                            disabled={isLoading}
                            onClick={() => {
                                if (fileInputRef.current) {
                                    fileInputRef.current.value = '';
                                    fileInputRef.current.click();
                                }
                            }}
                            title="Adjuntar imagen"
                        >
                            <Paperclip size={20} strokeWidth={2} />
                        </button>

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
                            placeholder={micErrorMsg || "Pregúntale a MealfitRD"}
                            onFocus={() => setTimeout(scrollToBottom, 300)}
                            onInput={(e) => {
                                // Auto-resize hasta 120px (≈5 líneas), después scroll interno
                                e.target.style.height = 'auto';
                                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                            }}
                            enterKeyHint="send"
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
                                resize: 'none',
                                overflow: 'auto',
                                maxHeight: '120px'
                            }}
                        />
                        {isLoading ? (
                            <button
                                type="button"
                                aria-label="Detener generación"
                                onClick={handleStopGeneration}
                                title="Detener generación"
                                style={{
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '40px',
                                    height: '40px',
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
                                {(input.trim() || selectedFile) && (
                                    <button
                                        type="button"
                                        aria-label="Enviar"
                                        className="touch-scale"
                                        onClick={handleSend}
                                        disabled={isLoading}
                                        style={{
                                            background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '40px',
                                            height: '40px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: isLoading ? 'default' : 'pointer',
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
    const touchStartRef = useRef(null);
    const touchEndRef = useRef(null);

    const handleTouchStart = (e) => {
        touchEndRef.current = null;
        touchStartRef.current = e.targetTouches[0].clientX;
    };

    const handleTouchMove = (e) => {
        touchEndRef.current = e.targetTouches[0].clientX;
    };

    const handleTouchEnd = () => {
        if (!touchStartRef.current || !touchEndRef.current) return;
        const distance = touchStartRef.current - touchEndRef.current;
        if (distance < -60 && !showSidebar) {
            setShowSidebar(true);
        } else if (distance > 60 && showSidebar) {
            setShowSidebar(false);
        }
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

        return [
            { id: 'hoy', label: 'Hoy', items: groups['Hoy'] },
            { id: '30dias', label: '', items: groups['Últimos 30 días'] },
            { id: 'antiguos', label: 'Más antiguos', items: groups['Más antiguos'] }
        ].filter(g => g.items.length > 0);
    }, [chatSessions]);
    return (
        <>
            <style>{`
                .chat-session-btn .chat-actions-hover {
                    opacity: 0;
                    pointer-events: none;
                }
                .chat-session-btn:hover .chat-actions-hover {
                    opacity: 1;
                    pointer-events: auto;
                }

                .attachment-btn {
                    background: transparent;
                    color: var(--text-muted);
                    border: none;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
                    flex-shrink: 0;
                    outline: none;
                    -webkit-tap-highlight-color: transparent;
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
            `}</style>
            <div className="agent-container"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    height: isMobile ? 'var(--app-height, 100dvh)' : 'var(--app-height, calc(100dvh - 7.25rem))',  // [P3-AGENT-DESKTOP-CLIP · 2026-05-19] ver useEffect arriba
                    background: 'var(--bg-card)',
                    borderRadius: isMobile ? '0' : '1.5rem',
                    boxShadow: isMobile ? 'none' : '0 10px 40px -10px rgba(0,0,0,0.08)',
                    border: isMobile ? 'none' : '1px solid var(--border)',
                    overflow: 'hidden',
                    margin: isMobile ? '0' : '2.25rem auto 0',
                    maxWidth: isMobile ? '100vw' : '1200px',
                    width: '100%',
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
                                Suelta tu imagen aquí
                            </h2>
                            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                                La subiremos optimizada para responderte.
                            </p>
                        </div>
                    </div>
                )}
                {/* Overlay para móvil */}
                {showSidebar && (
                    <div
                        className="sidebar-overlay"
                        onClick={() => setShowSidebar(false)}
                    />
                )}

                {/* Sidebar Historial */}
                <SidebarRecientes
                    showSidebar={showSidebar}
                    setShowSidebar={setShowSidebar}
                    handleNewChat={handleNewChat}
                    isLoadingSessions={isLoadingSessions}
                    chatSessions={chatSessions}
                    groupedSessions={groupedSessions}
                    currentSessionId={currentSessionId}
                    setCurrentSessionId={setCurrentSessionId}
                    handleDeleteChat={handleDeleteChat}
                    isLoading={isLoading}
                />

                {/* Chat Area container */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0, // previene overflow en flex
                    position: 'relative',
                    background: 'var(--bg-card)'
                }}>
                    {/* Chat Header */}
                    <div className="mobile-chat-header" style={{
                        padding: '0.75rem 1.25rem',
                        paddingTop: isMobile ? 'calc(0.75rem + max(env(safe-area-inset-top), 24px))' : '0.75rem',
                        background: messages.length === 0 ? 'var(--bg-card)' : 'var(--bg-card)',
                        backdropFilter: messages.length === 0 ? 'none' : 'blur(8px)',
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
                            onClick={() => setShowSidebar(!showSidebar)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-main)',
                                padding: '0.4rem',
                                borderRadius: '50%',
                                transition: 'all 0.15s',
                                marginLeft: '-0.4rem'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            <History size={24} strokeWidth={1.5} />
                        </button>

                        {/* Center: Title */}
                        {/* [P3-AGENT-HEADER-TITLE · 2026-05-19] Título del header
                            del chat. Cambio de marca interna "MealfitRD" → "Mealfit V1.0"
                            (versioning visible al usuario; pre-fix solo el marketing
                            site lo nombraba así). Mantenido independiente del sidebar logo
                            del DashboardLayout que conserva el branding completo
                            "MealfitRD" con gradient en el "RD". */}
                        <span className="agent-header-title" style={{
                            fontSize: '1.25rem',
                            fontWeight: 400,
                            color: 'var(--text-main)',
                            position: 'absolute',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            letterSpacing: '-0.02em'
                        }}>
                            Mealfit <span style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', letterSpacing: 'normal' }}>V1.0</span>
                        </span>

                        {/* Right: 3-dot nav menu (mobile) */}
                        <div ref={navMenuRef} className="nav-menu-wrapper" style={{ position: 'relative', marginRight: '-0.4rem' }}>
                            <button
                                onClick={() => setShowNavMenu(!showNavMenu)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-main)',
                                    padding: '0.4rem',
                                    borderRadius: '50%',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <Menu size={24} strokeWidth={2} />
                            </button>
                            {showNavMenu && (
                                <div className="nav-dropdown" style={{
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
                                    {[
                                        { icon: LayoutDashboard, label: 'Plan', path: '/dashboard' },
                                        { icon: Utensils, label: 'Recetas', path: '/dashboard/recipes' },
                                        { icon: Refrigerator, label: 'Nevera', path: '/dashboard/pantry' },
                                        { icon: Clock, label: 'Historial', path: '/history' },
                                        { icon: Settings, label: 'Configuración', path: '/dashboard/settings' }
                                    ].map((item) => (
                                        <button
                                            key={item.path}
                                            onClick={() => { navigate(item.path); setShowNavMenu(false); }}
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
                                        Hola, {userProfile?.full_name?.split(' ')[0] || formData?.name || 'amigo'}
                                    </h1>
                                    <h2 className="welcome-sub" style={{
                                        fontSize: '2.5rem',
                                        fontWeight: 400,
                                        color: 'var(--text-muted)',
                                        margin: 0,
                                        letterSpacing: '-0.03em',
                                        lineHeight: 1.2
                                    }}>
                                        ¿Por dónde empezamos?
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
                                        { icon: '🖼️', text: 'Analizar mi comida' },
                                        { icon: '💪', text: 'Dieta para ganar volumen' },
                                        { icon: '✨', text: 'Plan de pérdida de peso' },
                                        { icon: '🍳', text: 'Receta alta en proteína' }
                                    ].map((suggestion, idx) => (
                                        <button
                                            key={idx}
                                            className="suggestion-pill"
                                            onClick={() => setInput(suggestion.text)}
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
                                    aria-label="Historial de conversación con el asistente"
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
                                            <Loader2 className="animate-spin" size={24} aria-label="Cargando mensajes" />
                                        </div>
                                    }>
                                        <VirtualizedMessageList
                                            messages={messages}
                                            currentSessionId={currentSessionId}
                                            onRegenerate={handleRegenerate}
                                            onErrorRetry={(msg) => {
                                                // [P1-CHAT-ERROR-DIFF · 2026-05-19]
                                                // El virtualizer pasa el msg al
                                                // handler — re-emit del prompt.
                                                if (!msg?.retryPrompt && !msg?.retryImageUrl) return;
                                                handleSend(msg.retryPrompt || '', { overrideImageUrl: msg.retryImageUrl || undefined });
                                            }}
                                            isLoading={isLoading}
                                            streamingStatus={streamingStatus}
                                            loadingPhrases={loadingPhrases}
                                            loadingPhraseIdx={loadingPhraseIdx}
                                        />
                                    </Suspense>
                                </div>
                            ) : (
                            <div
                                role="log"
                                aria-live="polite"
                                aria-relevant="additions text"
                                aria-label="Historial de conversación con el asistente"
                                style={{
                                    maxWidth: '800px',
                                    width: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2rem',
                                    paddingBottom: '0.5rem'
                                }}
                            >
                                {isLoadingHistory ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem', color: 'var(--text-muted)', gap: '0.5rem' }}>
                                        <Loader2 className="spin-fast" size={20} /> Cargando mensajes...
                                    </div>
                                ) : (
                                    messages.map((msg, i) => (
                                        <MemoizedMessageBubble
                                            key={i}
                                            msg={msg}
                                            index={i}
                                            currentSessionId={currentSessionId}
                                            onRegenerate={handleRegenerate}
                                            onErrorRetry={() => {
                                                // [P1-CHAT-ERROR-DIFF · 2026-05-19]
                                                // Re-emite el prompt original
                                                // como si el user lo enviara de
                                                // nuevo. handleSend re-construye
                                                // enriquecedor + setea Conectando.
                                                if (!msg.retryPrompt && !msg.retryImageUrl) return;
                                                handleSend(msg.retryPrompt || '', { overrideImageUrl: msg.retryImageUrl || undefined });
                                            }}
                                        />
                                    ))
                                )}
                                {isLoading && (
                                    <div style={{
                                        display: 'flex',
                                        gap: '0.75rem',
                                        alignItems: 'center',
                                        color: 'var(--text-muted)',
                                        padding: '0.5rem 0 0.5rem 1.5rem',
                                        marginBottom: '3.5rem',
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
                                        }}>{streamingStatus ? loadingPhrases[loadingPhraseIdx] : 'Pensando...'}</span>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                            )
                        )}
                    </div>

                    {/* Area condicional para input */}
                    {/* Input Area (Pinned to bottom if messages exist) */}
                    {messages.length > 0 && renderInputArea(false)}
                    {/* Overlay Input Area for Empty State */}
                    {messages.length === 0 && renderInputArea(true)}

                </div> {/* End of Chat Area Container */}
            </div>

            <style>{`
                .markdown-chat { font-size: 0.95rem; line-height: 1.6; }
                .markdown-chat p { margin-top: 0; margin-bottom: 0.75rem; }
                .markdown-chat p:last-child { margin-bottom: 0; }
                .markdown-chat ul, .markdown-chat ol { margin-top: 0; margin-bottom: 0.75rem; padding-left: 1.5rem; }
                .markdown-chat ul:last-child, .markdown-chat ol:last-child { margin-bottom: 0; }
                .markdown-chat li { margin-bottom: 0.25rem; }
                .markdown-chat strong { font-weight: 700; color: inherit; }

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
                        backdrop-filter: blur(20px) saturate(180%) !important;
                        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
                        border-bottom: 1px solid var(--border) !important;
                        padding: 0.75rem 1.25rem !important;
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
                        padding-left: 1rem !important;
                        padding-right: 1rem !important;
                        padding-top: calc(4.5rem + max(env(safe-area-inset-top), 24px)) !important;
                        padding-bottom: 0.5rem !important;
                        background: var(--bg-card) !important;
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                    .messages-container::-webkit-scrollbar { display: none; }
                    /* --- User bubble --- */
                    .msg-bubble-user {
                        background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%) !important;
                        border: none !important;
                        border-radius: 1.25rem 1.25rem 0.3rem 1.25rem !important;
                        padding: 0.8rem 1.1rem !important;
                        box-shadow: 0 2px 8px rgba(79,70,229,0.08) !important;
                        max-width: 85% !important;
                        font-size: 0.95rem !important;
                    }
                    /* --- Bot bubble --- */
                    .msg-bubble-bot {
                        background: transparent !important;
                        border-left: 3px solid rgba(79,70,229,0.25) !important;
                        border-radius: 0 !important;
                        padding: 0.9rem 0 0.6rem 0.9rem !important;
                        font-size: 0.93rem !important;
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
                        padding: 0.8rem 1.25rem calc(2.5rem + env(safe-area-inset-bottom)) 1.25rem !important;
                        background: var(--bg-card) !important;
                        backdrop-filter: blur(20px) !important;
                        -webkit-backdrop-filter: blur(20px) !important;
                        border-top: none !important;
                        box-shadow: 0 -4px 30px rgba(0,0,0,0.06) !important;
                        transition: padding-bottom 0.2s ease-out !important;
                        border-radius: 0 !important;
                    }
                    .input-wrapper:focus-within {
                        padding-bottom: 0.8rem !important;
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
                    }
                    .sidebar-overlay {
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.5);
                        z-index: 25;
                        backdrop-filter: blur(3px);
                        -webkit-backdrop-filter: blur(3px);
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
