import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { CheckCircle, Loader2 } from 'lucide-react';
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
        if (retries > 1) {
            console.warn(`⚠️ Intento fallido. Reintentando en ${backoff / 1000}s... (${retries - 1} intentos restantes)`);
            await new Promise(r => setTimeout(r, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
        } else {
            throw err;
        }
    }
}

// --- GENERACIÓN DE PLAN (CONEXIÓN CON IA) ---
let globalGenerationPromise = null;

const generateAIPlan = async (formData) => {
    if (globalGenerationPromise) {
        console.warn("⚠️ Reutilizando promesa de generación en curso (React StrictMode)...");
        return globalGenerationPromise;
    }

    const API_URL = '/api/analyze';
    console.log("🚀 Iniciando generación a:", API_URL);

    globalGenerationPromise = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 360000); // 6 minutos para permitir el bucle de revisión médica (Intento #2)

        try {
            const response = await fetchWithRetry(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
                signal: controller.signal
            }, 3);

            clearTimeout(timeoutId);
            const data = await response.json();
            console.log("✅ Respuesta IA recibida:", data);
            return (Array.isArray(data) && data.length > 0) ? data[0] : data;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error("⏳ Error Fatal: Timeout total excedido.");
            } else {
                console.error("❌ Fallaron todos los intentos de conexión:", error);
            }
            console.warn("⚠️ Activando Plan de Respaldo (Modo Offline)...");
            // Fallback plan básico
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
                ],
                shoppingList: { daily: ["Plátanos", "Huevos", "Pollo", "Vegetales Variados", "Arroz", "Habichuelas", "Avena", "Frutas", "Atún", "Aguacate", "Batata"] }
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
            console.log("ℹ️ Usuario invitado. El plan no se guardará en el historial permanente.");
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
                console.log(`✅ Plan duplicado detectado (hace ${Math.round(diffSeconds)}s). Guardado omitido.`);
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
            console.log("💾 Plan guardado exitosamente en el historial.");
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
    const navigate = useNavigate();
    const location = useLocation();
    const previousMeals = location.state?.previousMeals || [];

    // 2. USEEFFECT
    useEffect(() => {
        // Validación de seguridad: Si no hay datos, no hacemos nada (el return de abajo redirige)
        if (!formData.age || !formData.mainGoal) return;

        // --- BLOQUEO DE DOBLE EJECUCIÓN (INTENTO 2: Cleanup Flag) ---
        // Esto protege contra el "StrictMode" en desarrollo que monta/desmonta/monta rápido
        let ignore = false;

        window.scrollTo(0, 0);

        const processPlan = async () => {
            try {
                if (ignore) return;

                // FASE 1: UI de "Analizando"
                setStatus('analyzing');
                // Pequeña espera para que el usuario vea la animación de inicio
                await new Promise(r => setTimeout(r, 1500));

                if (ignore) return;

                // FASE 2: Llamada a la IA
                setStatus('generating');

                // --- INTEGRACIÓN DE MEMORIA (SUPABASE) ---
                let userId = localStorage.getItem('mealfit_user_id');
                // IMPORTANTE: Evitar cadena "guest" literal que rompe UUID en Postgres
                if (userId === 'guest') userId = null;

                let guestSessionId = localStorage.getItem('mealfit_guest_session_id');
                if (!userId && !guestSessionId) {
                    guestSessionId = crypto.randomUUID();
                    localStorage.setItem('mealfit_guest_session_id', guestSessionId);
                }

                // AQUÍ ESTÁ EL CAMBIO APLICADO: Agregamos session_id validos y previousMeals
                const dataToSend = {
                    ...formData,
                    user_id: userId, // Siempre es un UUID válido o null
                    session_id: userId || guestSessionId, // Siempre es un UUID válido
                    previous_meals: previousMeals
                };

                console.log("🧠 Enviando solicitud al cerebro IA para usuario:", userId);

                // Enviamos al backend (Nota: generateAIPlan YA NO inserta en DB automáticamente)
                const generatedPlan = await generateAIPlan(dataToSend);

                // SI EL COMPONENTE SE DESMONTÓ, DETENEMOS AQUÍ (NO GUARDAMOS EN DB)
                if (ignore) {
                    console.log("🛑 Componente desmontado, cancelando guardado en DB.");
                    return;
                }

                // Lógica de fechas para las compras (Grocery Cycle)
                const oldPlanStr = localStorage.getItem('mealfit_plan');
                const oldPlan = oldPlanStr ? JSON.parse(oldPlanStr) : {};
                
                if (previousMeals && previousMeals.length > 0) {
                    // Si estamos "Actualizando Platos" (menú rotativo), mantenemos la fecha original
                    generatedPlan.grocery_start_date = oldPlan.grocery_start_date || oldPlan.created_at || new Date().toISOString();
                } else {
                    // Si es un "Ciclo Renovado" (plan nuevo desde cero), empezamos a contar desde hoy
                    generatedPlan.grocery_start_date = new Date().toISOString();
                }

                // El backend ya guarda el plan en _save_plan_and_track_background (con título IA, frecuencias, etc.)
                // NO guardamos aquí para evitar duplicados en el historial.

                // Guardamos el resultado en el contexto global
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
                // En caso de error, podríamos redirigir al dashboard con el plan offline (fallback)
                // O mostrar un error. Por ahora asumimos que el fallback del servicio funciona.
                if (!ignore) setStatus('ready');
            }
        };

        processPlan();

        // CLEANUP FUNCTION: Se ejecuta si el componente se desmonta
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
    return <LoadingScreen status={status} />;
};

// --- PANTALLA DE CARGA PREMIUM ---
const LoadingScreen = ({ status }) => {
    const [progress, setProgress] = useState(0);
    const [tipIndex, setTipIndex] = useState(0);

    const steps = [
        { text: "Conectando con servidor seguro", icon: "🔐", pct: 5 },
        { text: "Analizando tu metabolismo basal", icon: "🧬", pct: 18 },
        { text: "Calculando distribución de macros", icon: "⚡", pct: 35 },
        { text: "Seleccionando ingredientes locales", icon: "🥑", pct: 50 },
        { text: "Generando recetas personalizadas", icon: "👨‍🍳", pct: 68 },
        { text: "Optimizando tu plan semanal", icon: "📊", pct: 82 },
        { text: "Finalizando estrategia", icon: "✨", pct: 93 },
    ];

    const tips = [
        "💡 Beber agua antes de cada comida ayuda a controlar el apetito",
        "💡 Las proteínas aceleran tu metabolismo hasta un 30%",
        "💡 Comer despacio mejora la digestión y saciedad",
        "💡 El sueño es clave: sin él, las hormonas del hambre se descontrolan",
        "💡 Una comida balanceada tiene proteína, carbohidrato y grasa saludable",
    ];

    useEffect(() => {
        if (status === 'ready') {
            setProgress(100);
            return;
        }

        // Intervalo de 500ms (2 actualizaciones por segundo)
        const timer = setInterval(() => {
            setProgress((old) => {
                if (old >= 99) return 99;
                
                // La generación toma ~60 a 67 segundos.
                // Escalamos los incrementos para que alcance el 95% en unos 60-65 segundos.
                let diff;
                if (old < 20) {
                    // 0 a 20%: Primeros ~5 segundos (avg 2% por tick)
                    diff = Math.random() * 2 + 1; // 1 a 3
                } else if (old < 50) {
                    // 20 a 50%: Siguientes ~15 segundos (avg 1% por tick)
                    diff = Math.random() * 1 + 0.5; // 0.5 a 1.5
                } else if (old < 80) {
                    // 50 a 80%: Siguientes ~25 segundos (avg 0.6% por tick)
                    diff = Math.random() * 0.8 + 0.2; // 0.2 a 1.0
                } else if (old < 95) {
                    // 80 a 95%: Siguientes ~20 segundos (avg 0.35% por tick)
                    diff = Math.random() * 0.5 + 0.1; // 0.1 a 0.6
                } else {
                    // 95 a 99%: Súper lento si se demora más de 65s (avg 0.12% por tick)
                    diff = Math.random() * 0.15 + 0.05; // 0.05 a 0.2
                }
                
                return Math.min(old + diff, 99);
            });
        }, 500);
        return () => clearInterval(timer);
    }, [status]);

    useEffect(() => {
        const tipTimer = setInterval(() => {
            setTipIndex((old) => (old + 1) % tips.length);
        }, 4500);
        return () => clearInterval(tipTimer);
    }, [tips.length]);

    // Determinar qué pasos ya se completaron
    const activeStepIndex = steps.findIndex(s => progress < s.pct);
    const currentStep = activeStepIndex === -1 ? steps.length - 1 : Math.max(0, activeStepIndex - 1);

    return (
        <div style={{
            minHeight: '100dvh', // Use dvh to fix mobile Safari bottom bar overlap
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
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
                            <motion.span
                                key={steps[currentStep]?.icon}
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ duration: 0.3 }}
                            >
                                {steps[currentStep]?.icon || '🍎'}
                            </motion.span>
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
                        const isDone = progress >= step.pct;
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
                        animate={{ width: `${progress}%` }}
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
                    <span style={{ color: '#818cf8', fontWeight: 700 }}>{Math.round(progress)}%</span>
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

LoadingScreen.propTypes = { status: PropTypes.string };

export default Plan;