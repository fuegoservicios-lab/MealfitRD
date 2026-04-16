import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { CheckCircle, Loader2, Server, Activity, PieChart, Utensils, UtensilsCrossed, ChefHat, ShoppingCart, ShieldCheck } from 'lucide-react';

import PropTypes from 'prop-types';

import { supabase } from '../supabase';
import { useAssessment } from '../context/AssessmentContext';
import { fetchWithAuth } from '../config/api';

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

const generateAIPlanStream = async (formData, onProgress) => {
    if (globalGenerationPromise) {
        console.warn("⚠️ Reutilizando promesa de generación en curso (React StrictMode)...");
        return globalGenerationPromise;
    }

    const STREAM_URL = '/api/analyze/stream';
    const FALLBACK_URL = '/api/analyze';

    globalGenerationPromise = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 480000);

        try {
            // Intentar endpoint SSE streaming
            const response = await fetchWithRetry(STREAM_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
                signal: controller.signal
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

            if (error.name === 'AbortError') {
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

const Plan = () => {
    // 1. HOOKS
    const { formData, saveGeneratedPlan, setCurrentStep } = useAssessment();
    const [status, setStatus] = useState('analyzing');
    const [planData, setPlanData] = useState(null);
    const [streamPhase, setStreamPhase] = useState(null); // Fase actual del pipeline SSE
    const [daysCompleted, setDaysCompleted] = useState([]); // Días ya generados [1, 2, 3]
    const navigate = useNavigate();
    const location = useLocation();
    const previousMeals = location.state?.previous_meals || location.state?.previousMeals || [];
    const currentIngredients = location.state?.current_pantry_ingredients || location.state?.currentIngredients || [];

    // 2. USEEFFECT
    useEffect(() => {
        // Validación de seguridad: Si no hay datos, no hacemos nada (el return de abajo redirige)
        if (!formData.age || !formData.mainGoal) return;

        let ignore = false;

        window.scrollTo(0, 0);

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

                const dataToSend = {
                    ...formData,
                    user_id: userId,
                    session_id: userId || guestSessionId,
                    previous_meals: previousMeals,
                    current_pantry_ingredients: currentIngredients
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
                } else {
                    generatedPlan.grocery_start_date = new Date().toISOString();
                }

                saveGeneratedPlan(generatedPlan);
                setPlanData(generatedPlan);

                // FASE 3: Éxito, llenado de barra al 100% y Redirección al Dashboard
                setStatus('ready');
                setTimeout(() => {
                    setCurrentStep(0);
                    navigate('/dashboard', { replace: true });
                }, 800);

            } catch (error) {
                console.error("❌ Error generando el plan:", error);
                if (!ignore) setStatus('ready');
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

    // Pantalla de Carga (única vista del componente mientras se genera)
    return <LoadingScreen status={status} streamPhase={streamPhase} daysCompleted={daysCompleted} />;
};

// --- PANTALLA DE CARGA PREMIUM CON PROGRESO REAL ---
const LoadingScreen = ({ status, streamPhase, daysCompleted = [] }) => {
    const [progress, setProgress] = useState(0);
    const displayProgress = status === 'ready' ? 100 : progress;
    const [tipIndex, setTipIndex] = useState(0);

    const steps = [
        { text: "Estableciendo conexión segura", icon: Server, pct: 5, phase: null },
        { text: "Procesando perfil biométrico", icon: Activity, pct: 12, phase: 'analyzing' },
        { text: "Estructurando esquema de macronutrientes", icon: PieChart, pct: 25, phase: 'skeleton' },
        { text: "Formulando Alternativa Nutricional 1", icon: Utensils, pct: 45, phase: 'day_1', dayCheck: 1 },
        { text: "Formulando Alternativa Nutricional 2", icon: UtensilsCrossed, pct: 60, phase: 'day_2', dayCheck: 2 },
        { text: "Formulando Alternativa Nutricional 3", icon: ChefHat, pct: 75, phase: 'day_3', dayCheck: 3 },
        { text: "Consolidando plan y lista de compras", icon: ShoppingCart, pct: 85, phase: 'assembly' },
        { text: "Auditoría nutricional final", icon: ShieldCheck, pct: 93, phase: 'review' },
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

            </motion.div>
        </div>
    );
};

LoadingScreen.propTypes = { status: PropTypes.string, streamPhase: PropTypes.string, daysCompleted: PropTypes.array };

export default Plan;