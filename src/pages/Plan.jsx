import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Navigate } from 'react-router-dom';
import { CheckCircle, ArrowRight } from 'lucide-react';
import PropTypes from 'prop-types';

import { generateAIPlan } from '../services/PlanGenerator';
import { useAssessment } from '../context/AssessmentContext';

const Plan = () => {
    // 1. HOOKS PRIMERO
    const { formData, saveGeneratedPlan } = useAssessment();
    const [status, setStatus] = useState('analyzing'); 
    const [planData, setPlanData] = useState(null);
    const navigate = useNavigate();

    // 2. USEEFFECT
    useEffect(() => {
        // Validación de seguridad: Si no hay datos, no hacemos nada (el return de abajo redirige)
        if (!formData.age || !formData.mainGoal) return;

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

                setStatus('ready');
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
        <div className="container" style={{ padding: '4rem 1rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
            >
                <div style={{ 
                    width: 80, height: 80, 
                    background: '#DCFCE7', color: '#166534', 
                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 2rem'
                }}>
                    <CheckCircle size={40} />
                </div>

                <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem', lineHeight: 1.1 }}>
                    ¡Tu Estrategia Nutricional<br />está Lista!
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '3rem' }}>
                    Hemos diseñado un plan 100% personalizado basado en tu biometría y preferencias dominicanas.
                </p>

                <div style={{ 
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                    gap: '1rem', marginBottom: '3rem' 
                }}>
                    <SummaryCard label="Calorías" value={planData.calories} />
                    <SummaryCard label="Proteína" value={planData.macros.protein} />
                    <SummaryCard label="Carbs" value={planData.macros.carbs} />
                    <SummaryCard label="Grasas" value={planData.macros.fats} />
                </div>

                <div style={{ background: 'white', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Siguiente Paso:</h3>
                    <button
                        onClick={() => navigate('/dashboard')}
                        style={{
                            width: '100%',
                            padding: '1.25rem',
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.75rem',
                            fontSize: '1.1rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                            boxShadow: 'var(--shadow-glow)',
                            transition: 'transform 0.2s'
                        }}
                    >
                        Entrar a mi Panel y Ver Menú <ArrowRight size={20} />
                    </button>
                    <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Accede a tu menú detallado, lista de compras y consejos.
                    </p>
                </div>

            </motion.div>
        </div>
    );
};

// --- Componentes Internos de UI ---

const LoadingScreen = ({ status }) => (
    <div style={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '2rem'
    }}>
        <motion.div
            animate={{
                rotate: 360,
                scale: [1, 1.1, 1],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            style={{
                width: 70, height: 70,
                borderRadius: '50%',
                border: '4px solid rgba(37, 99, 235, 0.1)',
                borderTopColor: 'var(--primary)',
                marginBottom: '2rem',
            }}
        />
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 700 }}>
            {status === 'analyzing' ? 'Analizando Metabolismo...' : 'Diseñando tu Plan con IA...'}
        </h2>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '350px' }}>
            {status === 'analyzing'
                ? 'Calculando TDEE, revisando alergias y ajustando macronutrientes...'
                : 'Consultando precios locales, seleccionando recetas y optimizando presupuesto...'}
        </div>
    </div>
);

const SummaryCard = ({ label, value }) => (
    <div style={{ 
        background: 'var(--bg-page)', 
        padding: '1rem', 
        borderRadius: '0.75rem',
        border: '1px solid var(--border)' 
    }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>{value}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</div>
    </div>
);

LoadingScreen.propTypes = { status: PropTypes.string };
SummaryCard.propTypes = { label: PropTypes.string, value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]) };

export default Plan;