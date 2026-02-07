import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Navigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, Flame, Zap, Droplet, ChefHat, Loader2 } from 'lucide-react';
import PropTypes from 'prop-types';

import { generateAIPlan } from '../services/PlanGenerator';
import { useAssessment } from '../context/AssessmentContext';

const Plan = () => {
    // 1. HOOKS
    const { formData, saveGeneratedPlan } = useAssessment();
    const [status, setStatus] = useState('analyzing');
    const [planData, setPlanData] = useState(null);
    const navigate = useNavigate();

    // --- CANDADO DE SEGURIDAD ---
    // Usamos useRef para rastrear si ya llamamos a la API.
    const hasCalledAPI = useRef(false);

    // 2. USEEFFECT
    useEffect(() => {
        // Validación de seguridad: Si no hay datos, no hacemos nada (el return de abajo redirige)
        if (!formData.age || !formData.mainGoal) return;

        // --- BLOQUEO DE DOBLE EJECUCIÓN ---
        if (hasCalledAPI.current) return;
        hasCalledAPI.current = true;

        window.scrollTo(0, 0);

        const processPlan = async () => {
            try {
                // FASE 1: UI de "Analizando"
                setStatus('analyzing');
                // Pequeña espera para que el usuario vea la animación de inicio
                await new Promise(r => setTimeout(r, 1500));

                // FASE 2: Llamada a la IA
                setStatus('generating');

                // --- INTEGRACIÓN DE MEMORIA (SUPABASE) ---
                const userId = localStorage.getItem('mealfit_user_id');

                const dataToSend = {
                    ...formData,
                    user_id: userId // Clave para el historial
                };

                console.log("🧠 Enviando solicitud al cerebro IA para usuario:", userId);

                // Enviamos al backend
                const generatedPlan = await generateAIPlan(dataToSend);

                // Guardamos el resultado en el contexto global
                saveGeneratedPlan(generatedPlan);
                setPlanData(generatedPlan);

                // FASE 3: Éxito y Redirección
                // Damos un segundo para que la barra llegue al 100% visualmente
                setStatus('ready');
                setTimeout(() => {
                    navigate('/dashboard');
                }, 1000);

            } catch (error) {
                console.error("❌ Error generando el plan:", error);
                // En caso de error, podríamos redirigir al dashboard con el plan offline (fallback)
                // O mostrar un error. Por ahora asumimos que el fallback del servicio funciona.
                setStatus('ready');
            }
        };

        processPlan();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 3. RENDERIZADO CONDICIONAL

    // Si el usuario intenta entrar directo sin llenar el formulario
    if (!formData.age || !formData.mainGoal) {
        return <Navigate to="/assessment" />;
    }

    // Pantalla de Carga (Analizando o Generando)
    if (status !== 'ready' || !planData) {
        return <LoadingScreen status={status} />;
    }

    // Vista de Éxito (Transición rápida antes de redirigir)
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            backgroundColor: '#f3f4f6',
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ textAlign: 'center' }}
            >
                <div style={{
                    width: 90, height: 90,
                    background: '#DCFCE7', color: '#166534',
                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 2rem',
                    boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.2)'
                }}>
                    <CheckCircle size={48} strokeWidth={2.5} />
                </div>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#111827' }}>
                    ¡Plan Listo!
                </h1>
                <p style={{ color: '#4B5563', marginTop: '1rem' }}>Entrando a tu panel...</p>
            </motion.div>
        </div>
    );
};

// --- NUEVA PANTALLA DE CARGA "CIENTÍFICA" ---
const LoadingScreen = ({ status }) => {
    // Simulamos pasos de carga para dar feedback visual
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setProgress((oldProgress) => {
                // Si el status sigue siendo 'analyzing' o 'generating', avanzamos lento
                // Si el status cambia a 'ready' (manejado arriba), esto se desmontará
                if (oldProgress >= 95) return 95; // Espera a la API
                const diff = Math.random() * 8; // Avance aleatorio
                return Math.min(oldProgress + diff, 95);
            });
        }, 600);

        return () => clearInterval(timer);
    }, [status]);

    // Mensajes basados en el porcentaje de progreso simulado
    const steps = [
        { text: "Conectando con servidor seguro...", pct: 5 },
        { text: "Analizando tasa metabólica basal...", pct: 20 },
        { text: "Consultando ingredientes locales...", pct: 40 },
        { text: "Optimizando distribución de macros...", pct: 60 },
        { text: "Generando recetas criollas...", pct: 80 },
        { text: "Finalizando estrategia...", pct: 90 },
    ];

    // Encuentra el texto actual basado en el progreso
    const currentStepText = steps.reverse().find(s => progress >= s.pct)?.text || "Iniciando motores...";

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '2rem',
            background: '#F8FAFC',
            backgroundImage: `radial-gradient(at 50% 50%, rgba(59, 130, 246, 0.05) 0px, transparent 50%)`
        }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}
            >
                {/* Icono animado central */}
                <div style={{
                    width: 80, height: 80, margin: '0 auto 2rem',
                    background: 'white', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 40px rgba(79, 70, 229, 0.15)',
                    position: 'relative'
                }}>
                    <Loader2 className="spin-slow" size={40} color="var(--primary)" />

                    {/* Estilo local para la animación */}
                    <style>{`
                        .spin-slow { animation: spin 3s linear infinite; }
                        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    `}</style>

                    {/* Badge de IA */}
                    <div style={{
                        position: 'absolute', bottom: -10,
                        background: 'var(--text-main)', color: 'white',
                        fontSize: '0.65rem', fontWeight: 700,
                        padding: '0.2rem 0.5rem', borderRadius: '1rem',
                        display: 'flex', alignItems: 'center', gap: '0.25rem'
                    }}>
                        🍎 AI
                    </div>
                </div>

                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                    Diseñando tu Estrategia
                </h2>

                {/* Área de texto dinámico con altura fija para evitar saltos */}
                <div style={{ height: '24px', marginBottom: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <AnimatePresence mode='wait'>
                        <motion.p
                            key={currentStepText}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}
                        >
                            {currentStepText}
                        </motion.p>
                    </AnimatePresence>
                </div>

                {/* Barra de Progreso */}
                <div style={{
                    width: '100%', height: '8px', background: '#E2E8F0',
                    borderRadius: '10px', overflow: 'hidden', position: 'relative'
                }}>
                    <motion.div
                        style={{
                            height: '100%',
                            background: 'linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)',
                            width: `${progress}%`,
                            borderRadius: '10px'
                        }}
                        // Animación suave del progreso
                        animate={{ width: `${progress}%` }}
                        transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', fontSize: '0.8rem', color: '#94A3B8', fontWeight: 600 }}>
                    <span>Procesando datos...</span>
                    <span>{Math.round(progress)}%</span>
                </div>

            </motion.div>
        </div>
    );
};

LoadingScreen.propTypes = { status: PropTypes.string };

export default Plan;