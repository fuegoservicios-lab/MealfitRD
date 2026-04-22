import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { CheckCircle, Loader2, Server, Activity, PieChart, Utensils, UtensilsCrossed, ChefHat, ShoppingCart, ShieldCheck } from 'lucide-react';

import PropTypes from 'prop-types';

import { supabase } from '../supabase';
import { useAssessment } from '../context/AssessmentContext';
import { fetchWithAuth, getPlanChunkStatus, retryPlanChunk } from '../config/api';
import { trackEvent } from '../utils/analytics';

// --- FUNCIÓN HELPER: RETRY LOGIC ---
async function fetchWithRetry(url, options, retries = 3, backoff = 2000) {
    try {
        const response = await fetchWithAuth(url, options);
        if (response.status >= 500) throw new Error(`Server Error ${response.status}`);
        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Error ${response.status}: ${txt}`);
        }
        return response;
    } catch (err) {
        // NUNCA reintentar si fue un abort (timeout) — reenviaría todo el pipeline
        if (err.name === 'AbortError') throw err;
        
        if (retries > 1) {
            console.warn(`⚠️ Intento fallido. Reintentando en ${backoff / 1000}s... (${retries - 1} intentos restantes)`);
            await new Promise(r => setTimeout(r, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
        } else {
            throw err;
        }
    }
}

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
        }, 480000);

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
                            throw new Error(eventData.data?.message || 'Error del servidor');
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
            } else {
                console.warn(`⚠️ SSE falló (${error.message}), intentando endpoint síncrono...`);

                // Fallback al endpoint síncrono
                try {
                    const controller2 = new AbortController();
                    const timeoutId2 = setTimeout(() => controller2.abort(), 480000);

                    const response2 = await fetchWithRetry(FALLBACK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData),
                        signal: controller2.signal
                    }, 2);

                    clearTimeout(timeoutId2);
                    const data = await response2.json();
                    return (Array.isArray(data) && data.length > 0) ? data[0] : data;
                } catch (fallbackErr) {
                    console.error('❌ Fallback síncrono también falló:', fallbackErr);
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
    const [streamingText, setStreamingText] = useState({}); // Text streaming de los LLM
    const navigate = useNavigate();
    const location = useLocation();
    const previousMeals = location.state?.previous_meals || location.state?.previousMeals || [];
    const currentIngredients = location.state?.current_pantry_ingredients || location.state?.currentIngredients || [];
    const updateReason = location.state?.update_reason || null;

    // 2. USEEFFECT
    useEffect(() => {
        // Validación de seguridad: Si no hay datos, no hacemos nada (el return de abajo redirige)
        if (!formData.age || !formData.mainGoal) return;

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
                    } else if (evType === 'token') {
                        if (evData?.day && evData?.chunk) {
                            setStreamingText(prev => {
                                const currentText = (prev[evData.day] || '') + evData.chunk;
                                return {
                                    ...prev,
                                    [evData.day]: currentText.slice(-300) // Solo mantenemos la cola
                                };
                            });
                        }
                    } else if (evType === 'tool_call') {
                        if (evData?.day && evData?.tool) {
                            setStreamingText(prev => {
                                const currentText = (prev[evData.day] || '') + `\n\n[SISTEMA]: Activando red neuronal '${evData.tool}' para verificación de macros...\n\n`;
                                return {
                                    ...prev,
                                    [evData.day]: currentText.slice(-300)
                                };
                            });
                        }
                    }
                };

                const generatedPlan = await generateAIPlanStream(dataToSend, handleProgress);

                if (ignore) return;

                // Lógica de fechas para compras (Grocery Cycle)
                const oldPlanStr = localStorage.getItem('mealfit_plan');
                const oldPlan = oldPlanStr ? JSON.parse(oldPlanStr) : {};

                if (previousMeals && previousMeals.length > 0) {
                    generatedPlan.grocery_start_date = oldPlan.grocery_start_date || oldPlan.created_at || new Date().toISOString();
                } else {
                    generatedPlan.grocery_start_date = new Date().toISOString();
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

    // Si el usuario intenta entrar directo sin llenar el formulario
    if (!formData.age || !formData.mainGoal) {
        return <Navigate to="/assessment" />;
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
            />
        );
    }

    // Pantalla de Carga (única vista del componente mientras se genera)
    return <LoadingScreen 
        status={status} 
        streamPhase={streamPhase} 
        daysCompleted={daysCompleted} 
        streamingText={streamingText} 
        onCancel={cancelGeneration}
    />;
};

// --- GAP 14: PANTALLA DE VISTA PREVIA (COMPARACIÓN) ---
const PreviewScreen = ({ oldPlan, newPlan, onAccept, onReject }) => {
    const [failedChunks, setFailedChunks] = useState([]);
    const [isRetrying, setIsRetrying] = useState(false);

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
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem', textAlign: 'center' }}>
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
PreviewScreen.propTypes = { oldPlan: PropTypes.object, newPlan: PropTypes.object, onAccept: PropTypes.func, onReject: PropTypes.func };

// --- PANTALLA DE CARGA PREMIUM CON PROGRESO REAL ---
const LoadingScreen = ({ status, streamPhase, daysCompleted = [], streamingText = {}, onCancel }) => {
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
        const phaseMinProgress = {
            'analyzing': 12,
            'skeleton': 25,
            'day_1': 35,
            'day_2': 50,
            'day_3': 60,
            'parallel_generation': 35,
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

                {/* === LIVE PREVIEW (SSE STREAMING) === */}
                {Object.keys(streamingText).length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.3 }}
                        style={{
                            background: '#0d1117',
                            borderRadius: '0.75rem',
                            padding: '0.75rem',
                            marginBottom: '1.5rem',
                            border: '1px solid rgba(255,255,255,0.1)',
                            textAlign: 'left',
                            fontSize: '0.65rem',
                            fontFamily: 'monospace',
                            color: '#10B981',
                            maxHeight: '120px',
                            overflow: 'hidden',
                            position: 'relative'
                        }}
                    >
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '24px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', padding: '0 0.5rem', color: '#818cf8', fontWeight: 'bold' }}>
                            <Activity size={12} style={{ marginRight: '6px' }}/> IA Neural Feed
                        </div>
                        <div style={{ marginTop: '20px', display: 'flex', gap: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', opacity: 0.8 }}>
                            {Object.entries(streamingText).map(([day, text]) => (
                                <div key={day} style={{ flex: 1, minWidth: 0, borderRight: day !== Object.keys(streamingText).pop() ? '1px solid rgba(255,255,255,0.1)' : 'none', paddingRight: '0.5rem' }}>
                                    <div style={{ color: '#fff', fontSize: '0.6rem', marginBottom: '4px', opacity: 0.5 }}>WORKER DÍA {day}</div>
                                    <div>{text}</div>
                                </div>
                            ))}
                        </div>
                        {/* Gradient overlay to fade bottom text */}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30px', background: 'linear-gradient(transparent, #0d1117)' }} />
                    </motion.div>
                )}

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

LoadingScreen.propTypes = { status: PropTypes.string, streamPhase: PropTypes.string, daysCompleted: PropTypes.array, streamingText: PropTypes.object, onCancel: PropTypes.func };

export default Plan;