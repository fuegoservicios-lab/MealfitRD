import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { CheckCircle, Loader2, Server, Activity, PieChart, Utensils, UtensilsCrossed, ChefHat, ShoppingCart, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';

import PropTypes from 'prop-types';

import { supabase } from '../supabase';
import { useAssessment } from '../context/AssessmentContext';
import { fetchWithAuth, getPlanChunkStatus, retryPlanChunk } from '../config/api';
import { findFirstIncompleteField, FIELD_LABELS } from '../config/formValidation';
import { trackEvent } from '../utils/analytics';

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
// El backend tiene `MEALFIT_GLOBAL_PIPELINE_TIMEOUT_S` (default 600s) +
// validación pantry post-pipeline (~60s en peor caso, P0-2) + persistencia
// + RTT SSE. Antes el cliente abortaba a 480s y el servidor seguía hasta
// 600s+, persistiendo un plan que el usuario nunca veía → "plan duplicado"
// en la próxima sesión + costo LLM perdido. Ahora el cliente espera
// `server_timeout + 90s` por defecto. Override vía `VITE_PIPELINE_TIMEOUT_MS`
// si el deploy aumenta `MEALFIT_GLOBAL_PIPELINE_TIMEOUT_S`.
const PIPELINE_TIMEOUT_MS = (() => {
    const raw = import.meta.env.VITE_PIPELINE_TIMEOUT_MS;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 690000;
})();

// --- GENERACIÓN DE PLAN CON STREAMING SSE ---
let globalGenerationPromise = null;
let globalAbortController = null;

export const cancelGeneration = () => {
    if (globalAbortController) {
        globalAbortController.abort("UserCancelled");
        globalAbortController = null;
    }
};

const generateAIPlanStream = async (formData, onProgress) => {
    if (globalGenerationPromise) {
        console.warn("⚠️ Reutilizando promesa de generación en curso (React StrictMode)...");
        return globalGenerationPromise;
    }

    const STREAM_URL = '/api/plans/analyze/stream';
    const FALLBACK_URL = '/api/plans/analyze';

    globalGenerationPromise = (async () => {
        globalAbortController = new AbortController();
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
                        if (parseErr.message?.includes('Error del servidor')) throw parseErr;
                        // Error de parsing JSON, ignorar línea malformada
                    }
                }
            }

            if (finalResult) return finalResult;

            // Si no recibió complete event, error
            throw new Error('Stream cerrado sin resultado completo');

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError' || error === 'UserCancelled') {
                if (globalAbortController && globalAbortController.signal.reason === 'UserCancelled') {
                    console.warn("🚫 Generación cancelada por el usuario.");
                    throw new Error("UserCancelled"); // Salir inmediatamente sin fallback
                }
                console.error("⏳ Error Fatal: Timeout total excedido.");
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
                    const data = await response2.json();
                    return (Array.isArray(data) && data.length > 0) ? data[0] : data;
                } catch (fallbackErr) {
                    console.error('❌ Fallback síncrono también falló:', fallbackErr);
                    // Si fue 503 de LLM, propagar el code para el caller
                    if (fallbackErr.code === 'llm_unavailable') throw fallbackErr;
                    // [P1-B10] 429 desde el fallback síncrono también propaga.
                    if (fallbackErr.code === 'rate_limited') throw fallbackErr;
                }
            }

            // Plan de respaldo offline
            console.warn("⚠️ Activando Plan de Respaldo (Modo Offline)...");
            return {
                calories: 2000,
                macros: { protein: "150g", carbs: "200g", fats: "60g" },
                insights: [
                    "⚠️ MODO OFFLINE: El servidor de IA no respondió.",
                    "Este es un plan generado localmente con 3 opciones para que no pierdas el ritmo."
                ],
                days: [
                    {
                        day: 1,
                        meals: [
                            { meal: "Desayuno", time: "8:00 AM", name: "Mangú con Huevo", desc: "Puré de plátano verde con huevo hervido.", cals: 450 },
                            { meal: "Almuerzo", time: "1:00 PM", name: "La Bandera (Versión Fit)", desc: "Arroz, habichuelas y pollo guisado.", cals: 600 },
                            { meal: "Merienda", time: "4:00 PM", name: "Guineo Maduro", desc: "Una unidad mediana.", cals: 200 },
                            { meal: "Cena", time: "8:00 PM", name: "Pescado al Papillote", desc: "Filete de pescado con vegetales.", cals: 450 }
                        ]
                    },
                    {
                        day: 2,
                        meals: [
                            { meal: "Desayuno", time: "8:00 AM", name: "Avena con Frutas", desc: "Avena cocida con leche de almendras y frutas frescas.", cals: 400 },
                            { meal: "Almuerzo", time: "1:00 PM", name: "Pechuga a la Plancha", desc: "Pechuga macerada con limón, acompañada de ensalada y batata.", cals: 550 },
                            { meal: "Merienda", time: "4:00 PM", name: "Yogur Griego", desc: "Yogur sin azúcar con nueces.", cals: 250 },
                            { meal: "Cena", time: "8:00 PM", name: "Ensalada de Atún", desc: "Atún en agua con lechuga, tomate y aguacate.", cals: 400 }
                        ]
                    },
                    {
                        day: 3,
                        meals: [
                            { meal: "Desayuno", time: "8:00 AM", name: "Huevos Revueltos con Espinaca", desc: "Huevos revueltos acompañados de espinaca y tostada integral.", cals: 380 },
                            { meal: "Almuerzo", time: "1:00 PM", name: "Sancocho Ligero", desc: "Sancocho con viandas y pollo, bajo en grasa.", cals: 650 },
                            { meal: "Merienda", time: "4:00 PM", name: "Manzana con Mantequilla de Maní", desc: "Rodajas de manzana fresca con una cucharada de mantequilla de maní.", cals: 250 },
                            { meal: "Cena", time: "8:00 PM", name: "Pollo Desmenuzado", desc: "Pechuga de pollo desmenuzada con pimientos y cebolla.", cals: 420 }
                        ]
                    }
                ]
            };
        } finally {
            globalGenerationPromise = null;
            globalAbortController = null;
        }
    })();

    return globalGenerationPromise;
};

// --- GUARDAR PLAN EN HISTORIAL (SUPABASE) ---
const savePlanToHistory = async (finalPlan) => {
    if (!finalPlan || (!finalPlan.perfectDay && !finalPlan.meals && !finalPlan.days)) {
        console.warn("⚠️ Intento de guardar un plan vacío o inválido.");
        return;
    }
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {

            return;
        }

        const { data: recentPlans } = await supabase
            .from('meal_plans')
            .select('created_at')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (recentPlans && recentPlans.length > 0) {
            const diffSeconds = (Date.now() - new Date(recentPlans[0].created_at).getTime()) / 1000;
            if (diffSeconds < 60) {

                return;
            }
        }

        const calories = parseInt(finalPlan.calories || finalPlan.estimated_calories) || 0;
        const macros = finalPlan.macros || {};
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const planName = `Plan del ${new Date().toLocaleDateString('es-DO', dateOptions)}`;

        const { error: saveError } = await supabase.from('meal_plans').insert({
            user_id: session.user.id,
            plan_data: finalPlan,
            name: planName,
            calories: calories,
            macros: macros,
            created_at: new Date().toISOString()
        });

        if (saveError) {
            console.error("❌ Error guardando historial:", saveError.message);
        } else {

        }
    } catch (dbError) {
        console.error("⚠️ Error crítico al intentar guardar historial:", dbError);
    }
};

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
    const { formData, saveGeneratedPlan, restorePlan, setCurrentStep, userProfile } = useAssessment();
    const [status, setStatus] = useState('analyzing'); // analyzing, generating, preview, ready
    const [planData, setPlanData] = useState(null);
    const [tempPlan, setTempPlan] = useState(null); // Nuevo estado para GAP 14
    const [oldPlan, setOldPlan] = useState(null); // Estado para el plan viejo
    const [streamPhase, setStreamPhase] = useState(null); // Fase actual del pipeline SSE
    const [daysCompleted, setDaysCompleted] = useState([]); // Días ya generados [1, 2, 3]
    const navigate = useNavigate();
    const location = useLocation();
    const previousMeals = location.state?.previous_meals || location.state?.previousMeals || [];
    const currentIngredients = location.state?.current_pantry_ingredients || location.state?.currentIngredients || [];
    const updateReason = location.state?.update_reason || null;

    // 2. USEEFFECT
    useEffect(() => {
        // [P1-B6] Validación pre-fetch alineada con el backend. Antes este
        // check solo verificaba `age && mainGoal` (2 de 6 requeridos), así que
        // un usuario con `gender=""` o `weight=""` quemaba el check de cuota
        // y recibía un 422 genérico tras 1.5s de "Analizando...". Ahora
        // detectamos cualquier campo faltante antes y dejamos que el render
        // condicional de abajo redirija a /assessment.
        if (findFirstIncompleteField(formData)) return;

        let ignore = false;

        window.scrollTo(0, 0);

        // Pre-cargar el plan antiguo para el Preview
        const oldPlanStr = localStorage.getItem('mealfit_plan');
        if (oldPlanStr) {
            try { setOldPlan(JSON.parse(oldPlanStr)); } catch (e) { }
        }

        const processPlan = async () => {
            try {
                if (ignore) return;

                // FASE 1: UI de "Analizando"
                setStatus('analyzing');
                await new Promise(r => setTimeout(r, 1500));

                if (ignore) return;

                // FASE 2: Llamada a la IA con Streaming SSE
                setStatus('generating');

                let userId = localStorage.getItem('mealfit_user_id');
                if (userId === 'guest') userId = null;

                let guestSessionId = localStorage.getItem('mealfit_guest_session_id');
                if (!userId && !guestSessionId) {
                    guestSessionId = crypto.randomUUID();
                    localStorage.setItem('mealfit_guest_session_id', guestSessionId);
                }

                const totalDays = getTotalDaysByGroceryDuration(formData?.groceryDuration);
                const dataToSend = {
                    ...formData,
                    user_id: userId,
                    session_id: userId || guestSessionId,
                    previous_meals: previousMeals,
                    current_pantry_ingredients: currentIngredients,
                    update_reason: updateReason,
                    totalDays,
                    tzOffset: new Date().getTimezoneOffset(),
                    is_plan_expired: location.state?.is_plan_expired || location.state?.isPlanExpired || false,
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

                const generatedPlan = await generateAIPlanStream(dataToSend, handleProgress);

                if (ignore) return;

                // Lógica de fechas para compras (Grocery Cycle)
                const oldPlanStr = localStorage.getItem('mealfit_plan');
                const oldPlan = oldPlanStr ? JSON.parse(oldPlanStr) : {};

                if (previousMeals && previousMeals.length > 0) {
                    generatedPlan.grocery_start_date = oldPlan.grocery_start_date || oldPlan.created_at || new Date().toISOString();
                    generatedPlan.cycle_start_date = oldPlan.cycle_start_date || generatedPlan.grocery_start_date;
                } else {
                    const now = new Date().toISOString();
                    generatedPlan.grocery_start_date = now;
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

                // FASE 3: GAP 14 - Vista Previa en vez de autoguardar
                setTempPlan(generatedPlan);
                setStatus('preview');

            } catch (error) {
                if (error.message === 'UserCancelled') {
                    console.log("Generación cancelada. Volviendo al dashboard...");
                    navigate('/dashboard', { replace: true });
                    return;
                }
                console.error("❌ Error generando el plan:", error);
                if (!ignore) {
                    // IA upstream caída (504 Gemini / circuit breaker): no navegar al
                    // dashboard, mostrar toast con Reintentar para que el usuario
                    // pueda volver a disparar el plan sin perder el contexto.
                    if (error.code === 'llm_unavailable') {
                        import('sonner').then(({ toast }) => {
                            toast.error("La IA está saturada", {
                                description: error.message || "Intenta de nuevo en 1-2 minutos.",
                                duration: Infinity,
                                action: {
                                    label: "Reintentar",
                                    onClick: () => { processPlan(); },
                                },
                            });
                        });
                        return;
                    }
                    // [P1-B10] Rate limit del backend (`_PLAN_GEN_LIMITER`,
                    // 3/60s per user|ip): toast con countdown que actualiza
                    // cada segundo y habilita el botón "Reintentar" cuando
                    // expira la ventana. Antes el usuario veía "Error al
                    // generar el plan" sin saber que era cool-down ni cuánto
                    // esperar — confundía con "IA caída" y reintentaba en
                    // bucle (agravando el rate limit).
                    if (error.code === 'rate_limited') {
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
                                    toast.error('Listo para reintentar', {
                                        id: toastId,
                                        description: 'La ventana de espera terminó. Puedes regenerar.',
                                        duration: Infinity,
                                        action: {
                                            label: 'Reintentar',
                                            onClick: () => { toast.dismiss(toastId); processPlan(); },
                                        },
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
                        return;
                    }
                    import('sonner').then(({ toast }) => {
                        toast.error("Error al generar el plan", { description: "Por favor, intenta nuevamente más tarde." });
                    });
                    navigate('/dashboard', { replace: true });
                }
            }
        };

        processPlan();

        return () => {
            ignore = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 3. RENDERIZADO CONDICIONAL

    // [P1-B6] Si falta cualquier campo requerido por el backend, redirigir a
    // /assessment con un toast accionable que explica qué falta — antes este
    // check solo cubría `age && mainGoal` y un usuario podía colarse al fetch
    // con `gender`/`weight`/`height`/`activityLevel` vacíos y recibir 422.
    {
        const missing = findFirstIncompleteField(formData);
        if (missing) {
            const label = FIELD_LABELS[missing] || missing;
            // Toast diferido para que se muestre tras la navegación (Navigate
            // remonta /assessment inmediatamente; sonner sobrevive al unmount).
            setTimeout(() => {
                import('sonner').then(({ toast }) => {
                    toast.info(`Falta completar: ${label}`, {
                        description: 'Te llevamos al cuestionario.',
                        duration: 4000,
                    });
                });
            }, 0);
            return <Navigate to="/assessment" />;
        }
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

    useEffect(() => {
        if (!newPlan?.id || newPlan?.generation_status !== 'partial') return;

        let previousDays = newPlan?.days?.length || 0;

        const intervalId = setInterval(async () => {
            try {
                const res = await getPlanChunkStatus(newPlan.id);
                if (!res.ok) return;
                const data = await res.json();
                
                if (data.failed_chunks && data.failed_chunks.length > 0) {
                    setFailedChunks(data.failed_chunks);
                }

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
                console.error('Error polling chunk status:', error);
            }
        }, 5000);

        return () => clearInterval(intervalId);
    }, [newPlan?.id, newPlan?.generation_status, isRetrying]);

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
                            <a
                                href="/pantry"
                                style={{
                                    flex: '1 1 140px', padding: '0.75rem 1rem', background: 'transparent', color: '#F59E0B',
                                    borderRadius: '0.5rem', border: '1px solid rgba(245, 158, 11, 0.5)', fontWeight: 600,
                                    fontSize: '0.9rem', textAlign: 'center', textDecoration: 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                                }}
                            >
                                <ShoppingCart size={16} /> Actualizar nevera
                            </a>
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

// --- PANTALLA DE CARGA PREMIUM CON PROGRESO REAL ---
const LoadingScreen = ({ status, streamPhase, daysCompleted = [], onCancel }) => {
    const [progress, setProgress] = useState(0);
    const displayProgress = status === 'ready' ? 100 : progress;
    const [tipIndex, setTipIndex] = useState(0);

    const steps = [
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

    const tips = [
        "💡 Beber agua antes de cada comida ayuda a controlar el apetito",
        "💡 Las proteínas aceleran tu metabolismo hasta un 30%",
        "💡 Comer despacio mejora la digestión y saciedad",
        "💡 El sueño es clave: sin él, las hormonas del hambre se descontrolan",
        "💡 Una comida balanceada tiene proteína, carbohidrato y grasa saludable",
    ];

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

    // Determinar qué pasos ya se completaron (basado en progreso + días completados)
    const activeStepIndex = steps.findIndex(s => {
        // Si el step tiene dayCheck, verificar si ese día ya se completó
        if (s.dayCheck && daysCompleted.includes(s.dayCheck)) return false; // ya completado
        return displayProgress < s.pct;
    });
    const currentStep = activeStepIndex === -1 ? steps.length - 1 : Math.max(0, activeStepIndex - 1);

    return (
        <div style={{
            minHeight: 'calc(100dvh - 70px)', // Adjust for header
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '2rem 1.5rem',
            background: 'linear-gradient(135deg, #0f0c29 0%, #1a1a3e 40%, #24243e 100%)',
            position: 'relative', overflow: 'hidden',
        }}>
            {/* Animated background orbs */}
            <style>{`
                @keyframes float1 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(30px, -40px) scale(1.1); } }
                @keyframes float2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-20px, 30px) scale(1.05); } }
                @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.3); } 50% { box-shadow: 0 0 80px rgba(99, 102, 241, 0.6); } }
                @keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes spinReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
                @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
                .loading-orb1 { animation: float1 8s ease-in-out infinite; }
                .loading-orb2 { animation: float2 10s ease-in-out infinite; }
                .pulse-ring { animation: pulseGlow 2.5s ease-in-out infinite; }
                .orbit-ring { animation: spinSlow 6s linear infinite; }
                .orbit-ring-reverse { animation: spinReverse 8s linear infinite; }
                .shimmer-bar { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); background-size: 200% 100%; animation: shimmer 2s infinite; }
            `}</style>

            {/* Background floating orbs */}
            <div className="loading-orb1" style={{
                position: 'absolute', width: '300px', height: '300px', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
                top: '10%', left: '5%', pointerEvents: 'none',
            }} />
            <div className="loading-orb2" style={{
                position: 'absolute', width: '250px', height: '250px', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 70%)',
                bottom: '10%', right: '10%', pointerEvents: 'none',
            }} />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                style={{ width: '100%', maxWidth: '440px', textAlign: 'center', position: 'relative', zIndex: 2 }}
            >
                {/* === ANIMATED SPINNER === */}
                <div style={{
                    width: 90, height: 90, margin: '0 auto 1.5rem',
                    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {/* Outer ring */}
                    <div className="orbit-ring" style={{
                        position: 'absolute', inset: 0, borderRadius: '50%',
                        border: '2px solid transparent', borderTopColor: 'rgba(99, 102, 241, 0.8)',
                        borderRightColor: 'rgba(99, 102, 241, 0.3)',
                    }} />
                    {/* Inner ring */}
                    <div className="orbit-ring-reverse" style={{
                        position: 'absolute', inset: '12px', borderRadius: '50%',
                        border: '2px solid transparent', borderBottomColor: 'rgba(16, 185, 129, 0.7)',
                        borderLeftColor: 'rgba(16, 185, 129, 0.25)',
                    }} />
                    {/* Center icon */}
                    <div className="pulse-ring" style={{
                        width: 50, height: 50, borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(16, 185, 129, 0.15))',
                        backdropFilter: 'blur(10px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.5rem',
                    }}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={steps[currentStep]?.text}
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ duration: 0.3 }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                {steps[currentStep]?.icon && 
                                  function() { 
                                      const StepIcon = steps[currentStep].icon; 
                                      return <StepIcon size={24} color="#ffffff" strokeWidth={1.5} />;
                                  }()
                                }
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>

                {/* === TITLE === */}
                <h2 style={{
                    fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem',
                    background: 'linear-gradient(135deg, #ffffff, #c7d2fe)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                }}>
                    Diseñando tu Estrategia
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', marginBottom: '1.5rem', fontWeight: 500 }}>
                    Nuestra IA está creando tu plan perfecto
                </p>

                {/* === STEP CHECKLIST === */}
                <div style={{
                    background: 'rgba(255,255,255,0.04)', borderRadius: '1rem',
                    padding: '1rem 1.25rem', marginBottom: '1.5rem',
                    border: '1px solid rgba(255,255,255,0.06)',
                    textAlign: 'left',
                }}>
                    {steps.map((step, i) => {
                    const isDone = displayProgress >= step.pct || (step.dayCheck && daysCompleted.includes(step.dayCheck));
                        const isCurrent = i === currentStep && !isDone;
                        return (
                            <motion.div
                                key={step.text}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.08, duration: 0.3 }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.5rem 0',
                                    borderBottom: i < steps.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                }}
                            >
                                {/* Step indicator */}
                                <div style={{
                                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.4s ease',
                                    ...(isDone ? {
                                        background: 'linear-gradient(135deg, #10B981, #059669)',
                                        color: 'white',
                                    } : isCurrent ? {
                                        background: 'rgba(99, 102, 241, 0.2)',
                                        border: '2px solid rgba(99, 102, 241, 0.6)',
                                        color: '#818cf8',
                                    } : {
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'rgba(255,255,255,0.2)',
                                    }),
                                }}>
                                    {isDone ? '✓' : i + 1}
                                </div>

                                {/* Step text */}
                                <span style={{
                                    fontSize: '0.85rem', fontWeight: isDone || isCurrent ? 600 : 400,
                                    transition: 'all 0.3s ease',
                                    color: isDone ? 'rgba(16, 185, 129, 0.9)' : isCurrent ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)',
                                }}>
                                    {step.text}
                                </span>

                                {/* Current step spinner */}
                                {isCurrent && (
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                                        style={{ marginLeft: 'auto', flexShrink: 0 }}
                                    >
                                        <Loader2 size={14} color="#818cf8" />
                                    </motion.div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>

                {/* === PROGRESS BAR === */}
                <div style={{
                    width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)',
                    borderRadius: '10px', overflow: 'hidden', position: 'relative',
                    marginBottom: '0.75rem',
                }}>
                    <motion.div
                        style={{
                            height: '100%',
                            background: 'linear-gradient(90deg, #6366f1 0%, #10B981 60%, #34d399 100%)',
                            borderRadius: '10px',
                            position: 'relative',
                        }}
                        animate={{ width: `${displayProgress}%` }}
                        transition={{ type: 'spring', stiffness: 40, damping: 20 }}
                    />
                    {/* Shimmer overlay */}
                    <div className="shimmer-bar" style={{
                        position: 'absolute', inset: 0, borderRadius: '10px', pointerEvents: 'none',
                    }} />
                </div>

                <div style={{
                    display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: '1rem',
                }}>
                    <span>{steps[currentStep]?.text || 'Procesando...'}</span>
                    <span style={{ color: '#818cf8', fontWeight: 700 }}>{Math.round(displayProgress)}%</span>
                </div>

                {/* === TIP CAROUSEL === */}
                <div style={{
                    minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <AnimatePresence mode="wait">
                        <motion.p
                            key={tipIndex}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.4 }}
                            style={{
                                color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem',
                                fontWeight: 500, fontStyle: 'italic', lineHeight: '1.4',
                                textAlign: 'center',
                            }}
                        >
                            {tips[tipIndex]}
                        </motion.p>
                    </AnimatePresence>
                </div>

                {/* === CANCEL BUTTON === */}
                {onCancel && status !== 'ready' && status !== 'preview' && (
                    <div style={{ marginTop: '1.5rem' }}>
                        <button 
                            onClick={() => {
                                if (window.confirm("¿Seguro que deseas cancelar la generación?")) {
                                    onCancel();
                                }
                            }}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                color: 'rgba(239, 68, 68, 0.8)',
                                padding: '0.6rem 1.5rem',
                                borderRadius: '2rem',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                e.currentTarget.style.color = '#ef4444';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'rgba(239, 68, 68, 0.8)';
                            }}
                        >
                            Cancelar Generación
                        </button>
                    </div>
                )}

            </motion.div>
        </div>
    );
};

LoadingScreen.propTypes = { status: PropTypes.string, streamPhase: PropTypes.string, daysCompleted: PropTypes.array, onCancel: PropTypes.func };

export default Plan;