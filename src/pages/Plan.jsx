import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Navigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, Sparkles, Flame, Zap, Droplet, ChefHat } from 'lucide-react';
import PropTypes from 'prop-types';

import { generateAIPlan } from '../services/PlanGenerator';
import { useAssessment } from '../context/AssessmentContext';

const Plan = () => {
    // 1. HOOKS PRIMERO
    const { formData, saveGeneratedPlan } = useAssessment();
    const [status, setStatus] = useState('analyzing');
    const [planData, setPlanData] = useState(null);
    const navigate = useNavigate();

    // --- CANDADO DE SEGURIDAD ---
    // Usamos useRef para rastrear si ya llamamos a la API.
    // A diferencia de useState, cambiar esto no provoca re-renderizados.
    const hasCalledAPI = useRef(false);

    // 2. USEEFFECT
    useEffect(() => {
        // Validación de seguridad: Si no hay datos, no hacemos nada (el return de abajo redirige)
        if (!formData.age || !formData.mainGoal) return;

        // --- BLOQUEO DE DOBLE EJECUCIÓN ---
        // Si ya se llamó a la API en esta montura, detenemos aquí.
        if (hasCalledAPI.current) return;

        // Marcamos inmediatamente como "Llamado"
        hasCalledAPI.current = true;

        window.scrollTo(0, 0);

        const processPlan = async () => {
            try {
                // FASE 1: UI de "Analizando" (Para dar sensación de procesamiento)
                setStatus('analyzing');
                await new Promise(r => setTimeout(r, 2000));

                // FASE 2: Llamada a la IA
                setStatus('generating');

                // --- INTEGRACIÓN DE MEMORIA (SUPABASE) ---
                // 1. Recuperamos el ID único que generamos en el Context
                const userId = localStorage.getItem('mealfit_user_id');

                // 2. Empaquetamos los datos del usuario + su ID
                const dataToSend = {
                    ...formData,
                    user_id: userId // <--- Esta es la clave para la memoria
                };

                console.log("🧠 Enviando solicitud al cerebro IA para usuario:", userId);

                // 3. Enviamos al backend
                const generatedPlan = await generateAIPlan(dataToSend);

                // 4. Guardamos el resultado en el contexto global
                saveGeneratedPlan(generatedPlan);
                setPlanData(generatedPlan);

                // REDIRECT AUTO - SKIP SUCCESS SCREEN
                navigate('/dashboard');
            } catch (error) {
                console.error("❌ Error generando el plan:", error);
                // Si falla la API (y el fallback también), podríamos manejarlo aquí.
                // Por ahora asumimos que generateAIPlan siempre devuelve algo (aunque sea el fallback).
                setStatus('ready');
            }
        };

        processPlan();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 3. RENDERIZADO CONDICIONAL

    // Si el usuario intenta entrar directo a /plan sin llenar el formulario
    if (!formData.age || !formData.mainGoal) {
        return <Navigate to="/assessment" />;
    }

    // Pantalla de Carga (Analizando o Generando)
    if (status !== 'ready' || !planData) {
        return <LoadingScreen status={status} />;
    }

    // Vista de Éxito
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            /* Premium Gradient Background */
            backgroundColor: '#f3f4f6',
            backgroundImage: `
                radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 0%, rgba(139, 92, 246, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.1) 0px, transparent 50%),
                radial-gradient(at 0% 100%, rgba(236, 72, 153, 0.1) 0px, transparent 50%)
            `,
            backgroundAttachment: 'fixed',
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{ maxWidth: '800px', width: '100%', textAlign: 'center' }}
            >
                <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}
                    style={{
                        width: 90, height: 90,
                        background: '#DCFCE7', color: '#166534',
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 2rem',
                        boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.2)'
                    }}
                >
                    <CheckCircle size={48} strokeWidth={2.5} />
                </motion.div>

                <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1rem', lineHeight: 1.1, color: '#111827', letterSpacing: '-0.025em' }}>
                    ¡Tu Estrategia Nutricional<br />está Lista!
                </h1>
                <p style={{ color: '#4B5563', fontSize: '1.25rem', marginBottom: '3rem', maxWidth: '600px', marginInline: 'auto' }}>
                    Hemos diseñado un plan 100% personalizado basado en tu biometría y preferencias dominicanas.
                </p>

                {/* Staggered Grid for Macros */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '1.5rem', marginBottom: '3rem'
                }}>
                    <SummaryCard
                        label="Calorías"
                        value={planData.calories}
                        icon={Flame}
                        color="#F59E0B"
                        bgColor="#FFFBEB"
                        delay={0.3}
                    />
                    <SummaryCard
                        label="Proteína"
                        value={planData.macros.protein}
                        icon={Zap}
                        color="#3B82F6"
                        bgColor="#EFF6FF"
                        delay={0.4}
                    />
                    <SummaryCard
                        label="Carbs"
                        value={planData.macros.carbs}
                        icon={ChefHat}
                        color="#10B981"
                        bgColor="#ECFDF5"
                        delay={0.5}
                    />
                    <SummaryCard
                        label="Grasas"
                        value={planData.macros.fats}
                        icon={Droplet}
                        color="#EC4899"
                        bgColor="#FDF2F8"
                        delay={0.6}
                    />
                </div>

                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    style={{
                        background: 'rgba(255, 255, 255, 0.7)',
                        backdropFilter: 'blur(12px)',
                        padding: '2.5rem',
                        borderRadius: '2rem',
                        border: '1px solid rgba(255, 255, 255, 0.5)',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05)'
                    }}
                >
                    <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 700, color: '#1F2937' }}>Siguiente Paso:</h3>
                    <button
                        onClick={() => navigate('/dashboard')}
                        style={{
                            width: '100%',
                            padding: '1.25rem',
                            background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '1rem',
                            fontSize: '1.1rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                            boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.4), 0 4px 6px -2px rgba(37, 99, 235, 0.1)',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(37, 99, 235, 0.5)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(37, 99, 235, 0.4)';
                        }}
                    >
                        Entrar a mi Panel y Ver Menú <ArrowRight size={22} strokeWidth={2.5} />
                    </button>
                    <p style={{ marginTop: '1.5rem', fontSize: '0.95rem', color: '#6B7280' }}>
                        Accede a tu menú detallado, lista de compras y consejos.
                    </p>
                </motion.div>

            </motion.div>
        </div>
    );
};

// --- Componentes Internos de UI ---

const LoadingScreen = ({ status }) => {
    // Mensajes dinámicos
    const messages = [
        "Analizando tu tasa metabólica basal...",
        "Calculando requerimientos calóricos...",
        "Optimizando distribución de macros...",
        "Seleccionando ingredientes locales...",
        "Buscando ofertas en supermercados...",
        "Diseñando recetas dominicanas...",
        "Ajustando por preferencias y alergias...",
        "Verificando balance nutricional...",
        "Finalizando detalles del plan...",
    ];

    const [msgIndex, setMsgIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setMsgIndex((prev) => (prev + 1) % messages.length);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '2rem',
            /* Premium Gradient Background */
            backgroundColor: '#f3f4f6',
            backgroundImage: `
                radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 0%, rgba(139, 92, 246, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.1) 0px, transparent 50%),
                radial-gradient(at 0% 100%, rgba(236, 72, 153, 0.1) 0px, transparent 50%)
            `,
            backgroundAttachment: 'fixed',
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(12px)',
                    padding: '3rem',
                    borderRadius: '2rem',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.01)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    maxWidth: '450px',
                    width: '100%'
                }}
            >
                {/* IMPROVED DUAL SPINNER */}
                <div style={{ position: 'relative', width: 80, height: 80, marginBottom: '2rem' }}>
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            borderRadius: '50%',
                            border: '4px solid rgba(37, 99, 235, 0.1)',
                            borderTopColor: '#3B82F6',
                        }}
                    />
                    <motion.div
                        animate={{ rotate: -360 }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        style={{
                            position: 'absolute', top: '15%', left: '15%', width: '70%', height: '70%',
                            borderRadius: '50%',
                            border: '4px solid rgba(16, 185, 129, 0.1)',
                            borderTopColor: '#10B981',
                        }}
                    />
                </div>

                <h2 style={{ fontSize: '1.75rem', marginBottom: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    Diseñando tu Plan con IA...
                </h2>

                {/* DYNAMIC TEXT AREA */}
                <div style={{ height: '3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                    <AnimatePresence mode='wait'>
                        <motion.div
                            key={msgIndex}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.5 }}
                        >
                            {messages[msgIndex]}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* AI Badge */}
                <div style={{
                    marginTop: '2rem',
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: '#2563EB',
                    padding: '0.5rem 1rem',
                    borderRadius: '1rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    letterSpacing: '0.05em'
                }}>
                    <Sparkles size={14} /> MEALFIT INTELLIGENCE ENGINE
                </div>
            </motion.div>
        </div>
    );
};

const SummaryCard = ({ label, value, icon: Icon, color, bgColor, delay }) => (
    <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: delay || 0 }}
        style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '1.25rem',
            border: '1px solid rgba(255,255,255,0.5)',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem'
        }}
    >
        <div style={{
            background: bgColor, color: color,
            padding: '0.75rem', borderRadius: '50%',
            marginBottom: '0.25rem'
        }}>
            {Icon && <Icon size={24} />}
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>{value}</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
    </motion.div>
);

LoadingScreen.propTypes = { status: PropTypes.string };
SummaryCard.propTypes = {
    label: PropTypes.string,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    icon: PropTypes.elementType,
    color: PropTypes.string,
    bgColor: PropTypes.string,
    delay: PropTypes.number
};

export default Plan;