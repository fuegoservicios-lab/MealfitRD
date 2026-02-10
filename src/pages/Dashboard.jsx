import { useState } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import {
    Zap, Droplet, Flame, ArrowRight, CheckCircle,
    RefreshCw, ChefHat, Heart,
    Brain, Wallet, AlertCircle, Dumbbell, Wheat,
    Lightbulb, Wand2, Clock, BookOpen, Loader2
} from 'lucide-react';
import PropTypes from 'prop-types';
import { toast } from 'sonner';

const Dashboard = () => {
    // 1. Obtenemos estado y funciones del Contexto Global
    const {
        planData,
        likedMeals,
        toggleMealLike,
        regenerateSingleMeal, // Ahora esta función es ASYNC (llama a la IA)
        formData,
        // Valores para el sistema de créditos y suscripción
        planCount,
        PLAN_LIMIT,
        remainingCredits,
        isPlus,
        userProfile,
        loadingData
    } = useAssessment();

    const navigate = useNavigate();

    // Estado local para saber qué tarjeta se está regenerando (loading spinner específico)
    const [regeneratingId, setRegeneratingId] = useState(null);

    // 2. ESTADO DE CARGA: Si estamos recuperando datos de la DB, mostramos loader
    if (loadingData) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '1rem',
                color: '#64748B',
                background: '#F8FAFC'
            }}>
                <Loader2 className="spin-fast" size={48} color="var(--primary)" />
                <p style={{ fontWeight: 600 }}>Sincronizando tu plan...</p>
                <style>{`
                    .spin-fast { animation: spin 1s linear infinite; } 
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    // 3. Protección de Ruta: Si terminó de cargar y NO hay plan, mandar al inicio
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    const handleNewPlan = () => {
        navigate('/assessment');
    };

    // Cálculos para la UI de límites
    const isLimitReached = !isPlus && planCount >= PLAN_LIMIT;

    return (
        <DashboardLayout>

            {/* --- HEADER PREMIUM --- */}
            <header style={{
                marginBottom: '3rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
                gap: '1.5rem',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.5) 100%)',
                backdropFilter: 'blur(12px)',
                padding: '2rem',
                borderRadius: '2rem',
                border: '1px solid rgba(255,255,255,0.6)',
                boxShadow: '0 20px 40px -10px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

                    {/* PLAN TIER BADGE */}
                    <div style={{ marginBottom: '0.25rem' }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.65rem',
                            fontWeight: '800',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            background: isPlus ? 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' : '#F8FAFC',
                            color: isPlus ? '#B45309' : '#64748B',
                            border: `1px solid ${isPlus ? '#FCD34D' : '#E2E8F0'}`,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}>
                            {isPlus ? 'PLUS MEMBER 🌟' : 'PLAN GRATUITO'}
                        </span>
                    </div>

                    <h1 style={{
                        fontSize: '2.5rem',
                        fontWeight: 800,
                        lineHeight: 1.1,
                        letterSpacing: '-0.03em',
                        marginBottom: '0.25rem',
                        color: '#1E293B'
                    }}>
                        Hola, <span style={{
                            background: 'linear-gradient(to right, #3B82F6, #8B5CF6)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>
                            {userProfile?.full_name?.split(' ')[0] || formData?.name || 'Nutrifit'}
                        </span>
                    </h1>
                    <p style={{ color: '#64748B', fontSize: '1.1rem', fontWeight: 500 }}>
                        Aquí tienes tu estrategia nutricional de hoy.
                    </p>
                </div>

                {/* --- ACTIONS GROUP --- */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>

                    {/* VISUALIZADOR DE CRÉDITOS (Solo Free) */}
                    {!isPlus && (
                        <div style={{
                            background: 'white',
                            padding: '0.6rem 1rem',
                            borderRadius: '1rem',
                            border: '1px solid #F1F5F9',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.875rem',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
                        }}>
                            <div style={{
                                width: 36, height: 36,
                                background: isLimitReached ? '#FEF2F2' : '#EFF6FF',
                                color: isLimitReached ? '#EF4444' : '#3B82F6',
                                borderRadius: '0.75rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Zap size={18} fill={isLimitReached ? '#EF4444' : '#3B82F6'} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
                                    Créditos
                                </span>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                    {remainingCredits} <span style={{ color: '#CBD5E1' }}>/ {PLAN_LIMIT}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* BOTÓN GENERAR NUEVO PLAN */}
                    <button
                        onClick={handleNewPlan}
                        disabled={isLimitReached}
                        style={{
                            background: isLimitReached
                                ? '#E2E8F0'
                                : 'linear-gradient(135deg, #0F172A 0%, #334155 100%)',
                            color: isLimitReached ? '#94A3B8' : 'white',
                            padding: '0.85rem 1.75rem',
                            borderRadius: '1rem',
                            border: 'none',
                            fontWeight: 700,
                            cursor: isLimitReached ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            boxShadow: isLimitReached ? 'none' : '0 10px 20px -5px rgba(15, 23, 42, 0.3)',
                            transition: 'all 0.3s ease',
                            fontSize: '0.95rem',
                        }}
                    >
                        {isLimitReached ? <AlertCircle size={20} /> : <Wand2 size={20} />}
                        <span>{isLimitReached ? 'Límite Alcanzado' : 'Generar Nuevo Día'}</span>
                    </button>
                </div>
            </header>

            {/* --- MACROS & CALORIES GRID --- */}
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '1.5rem' }}>
                Tus Objetivos Técnicos
            </h2>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1.5rem',
                marginBottom: '2.5rem'
            }}>
                <StatCard label="Calorías Totales" value={planData.calories} unit="kcal" icon={Flame} color="#F59E0B" bgColor="#FFFBEB" />
                <StatCard label="Proteína (Target)" value={planData.macros?.protein || "0g"} unit="" icon={Dumbbell} color="#3B82F6" bgColor="#EFF6FF" />
                <StatCard label="Carbohidratos" value={planData.macros?.carbs || "0g"} unit="" icon={Wheat} color="#10B981" bgColor="#ECFDF5" />
                <StatCard label="Grasas Saludables" value={planData.macros?.fats || "0g"} unit="" icon={Droplet} color="#EC4899" bgColor="#FDF2F8" />
            </div>

            {/* --- MAIN CONTENT COLUMNS --- */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2.5rem' }}>

                {/* Left Column: MEALS TIMELINE */}
                <div style={{ flex: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Menú Ejecutivo del Día
                        </h2>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {formData?.skipLunch ? '3 Comidas Planificadas' : '4 Comidas Completas'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {(() => {
                            // Copia segura de platos
                            let displayMeals = [...(planData.perfectDay || [])];

                            // Inyectar almuerzo familiar visual si aplica
                            if (formData?.skipLunch) {
                                const hasLunch = displayMeals.some(m => m.meal.toLowerCase().includes('almuerzo'));
                                if (!hasLunch) {
                                    displayMeals.splice(1, 0, {
                                        meal: 'Almuerzo',
                                        name: 'Almuerzo Familiar',
                                        isSkipped: true
                                    });
                                }
                            }

                            return displayMeals.map((meal, index) => {
                                const isSkippedLunch = meal.isSkipped;
                                const isLiked = meal.name ? !!likedMeals[meal.name] : false;

                                if (isSkippedLunch) {
                                    return (
                                        <div key={index} style={{
                                            background: 'rgba(239, 246, 255, 0.6)',
                                            padding: '1.5rem',
                                            borderRadius: '1rem',
                                            border: '1px dashed #3B82F6',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            color: '#1E40AF'
                                        }}>
                                            <div style={{
                                                background: '#3B82F6', color: 'white',
                                                borderRadius: '50%', width: 40, height: 40,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <ChefHat size={20} />
                                            </div>
                                            <div>
                                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                                                    Almuerzo Familiar / Libre
                                                </h3>
                                                <p style={{ fontSize: '0.85rem', margin: 0, opacity: 0.8 }}>
                                                    Reserva calórica aplicada. Come con moderación lo que haya en casa.
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={index} style={{
                                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.75) 100%)',
                                        backdropFilter: 'blur(16px)',
                                        padding: '1.75rem',
                                        borderRadius: '2rem',
                                        border: '1px solid white',
                                        display: 'grid',
                                        gridTemplateColumns: '1fr auto',
                                        gap: '1.5rem',
                                        alignItems: 'center',
                                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        position: 'relative'
                                    }}>

                                        {/* Meal Info */}
                                        <div>
                                            <div style={{
                                                textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 800,
                                                color: 'var(--primary)', letterSpacing: '0.05em', marginBottom: '0.25rem'
                                            }}>
                                                {meal.meal}
                                            </div>

                                            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                                                {meal.name}
                                            </h3>

                                            {/* TIEMPO DE PREPARACIÓN */}
                                            {meal.prep_time && (
                                                <div style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    fontSize: '0.75rem', color: '#64748B', background: '#F1F5F9',
                                                    padding: '2px 8px', borderRadius: '4px', marginBottom: '0.75rem', fontWeight: 600,
                                                    border: '1px solid #E2E8F0'
                                                }}>
                                                    <Clock size={12} /> {meal.prep_time}
                                                </div>
                                            )}

                                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                                                {meal.desc}
                                            </p>
                                        </div>

                                        {/* Right Side: Calories + Buttons */}
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1rem' }}>

                                            {/* Calories Badge */}
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                    {meal.cals}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>kcal</div>
                                            </div>

                                            {/* BUTTONS GROUP */}
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>

                                                {/* VER RECETA */}
                                                <button
                                                    onClick={() => navigate('/dashboard/recipes')}
                                                    style={{
                                                        background: '#F1F5F9',
                                                        border: 'none',
                                                        borderRadius: '50%',
                                                        width: 40, height: 40,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    title="Ver paso a paso"
                                                >
                                                    <BookOpen size={18} color="#64748B" />
                                                </button>

                                                {/* REGENERATE BUTTON (AI SWAP) */}
                                                <button
                                                    onClick={async () => {
                                                        // 1. Evitar doble clic
                                                        if (regeneratingId === index) return;

                                                        // 2. Estado Visual de Carga
                                                        setRegeneratingId(index);
                                                        
                                                        // 3. Notificación Inicial (Toast de Carga)
                                                        const toastId = toast.loading('Consultando al Chef IA...', {
                                                            description: 'Buscando una alternativa deliciosa...',
                                                        });

                                                        try {
                                                            // 4. Llamada ASYNC a n8n
                                                            const newName = await regenerateSingleMeal(index, meal.meal, meal.name);
                                                            
                                                            // 5. Éxito
                                                            toast.dismiss(toastId);
                                                            toast.success('¡Menú Actualizado!', {
                                                                description: `Cambiado por: ${newName}`,
                                                                icon: '👨‍🍳'
                                                            });
                                                        } catch (error) {
                                                            console.error("Error al regenerar:", error);
                                                            // 6. Error (probablemente usa el fallback)
                                                            toast.dismiss(toastId);
                                                            toast.error('No se pudo conectar con la IA', {
                                                                description: 'Se usó una receta alternativa local.'
                                                            });
                                                        } finally {
                                                            // 7. Liberar botón
                                                            setRegeneratingId(null);
                                                        }
                                                    }}
                                                    disabled={regeneratingId === index}
                                                    style={{
                                                        background: '#F1F5F9',
                                                        border: 'none',
                                                        borderRadius: '50%',
                                                        width: 40, height: 40,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: regeneratingId === index ? 'wait' : 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    title="No me gusta (Cambiar con IA)"
                                                >
                                                    <RefreshCw
                                                        size={18}
                                                        color="#64748B"
                                                        className={regeneratingId === index ? "spin-fast" : ""}
                                                    />
                                                </button>

                                                {/* LIKE BUTTON */}
                                                <button
                                                    onClick={() => {
                                                        const currentlyLiked = !!likedMeals[meal.name];
                                                        toggleMealLike(meal.name, meal.meal);
                                                        if (!currentlyLiked) {
                                                            toast.success('¡Anotado!', { description: `Aprenderemos que te gusta: ${meal.name}`, icon: '❤️' });
                                                        } else {
                                                            toast('Like removido');
                                                        }
                                                    }}
                                                    style={{
                                                        background: isLiked ? '#FEE2E2' : '#F8FAFC',
                                                        border: 'none',
                                                        borderRadius: '50%',
                                                        width: 40, height: 40,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        boxShadow: isLiked ? '0 2px 5px rgba(239, 68, 68, 0.2)' : 'none'
                                                    }}
                                                    title="Me gusta"
                                                >
                                                    <Heart size={18} color={isLiked ? '#EF4444' : '#94A3B8'} fill={isLiked ? '#EF4444' : 'none'} />
                                                </button>
                                            </div>
                                        </div>

                                        <style>{`
                                            .spin-fast { animation: spin 1s linear infinite; }
                                            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                                        `}</style>
                                    </div>
                                );
                            })
                        })()}
                    </div>
                </div>

                {/* Right Column: INSIGHTS & SHOPPING */}
                <div style={{ flex: 1, minWidth: '300px' }}>

                    {/* Insights Card */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.5) 100%)',
                        backdropFilter: 'blur(12px)',
                        padding: '1.75rem',
                        borderRadius: '2rem',
                        border: '1px solid white',
                        marginBottom: '2rem',
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02)'
                    }}>
                        <h3 style={{
                            fontSize: '1.2rem', fontWeight: 800, color: '#0F172A',
                            marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem'
                        }}>
                            <div style={{ background: '#F0F9FF', padding: '0.4rem', borderRadius: '0.75rem', color: '#0284C7' }}>
                                <Lightbulb size={22} strokeWidth={2.5} />
                            </div>
                            Estrategia Inteligente
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {planData.insights?.map((insight, i) => {
                                let icon = <CheckCircle size={20} />;
                                let title = "Nota:";
                                let color = "#0F172A";
                                let bgColor = "#F1F5F9";

                                if (insight.toLowerCase().includes('diagnóstico') || i === 0) {
                                    icon = <Brain size={20} />;
                                    title = "Diagnóstico";
                                    color = "#7C3AED"; // Violet
                                    bgColor = "#F5F3FF";
                                }
                                if (insight.toLowerCase().includes('estrategia') || i === 1) {
                                    icon = <Wallet size={20} />;
                                    title = "Estrategia";
                                    color = "#059669"; // Emerald
                                    bgColor = "#ECFDF5";
                                }
                                if (insight.toLowerCase().includes('chef') || i === 2) {
                                    icon = <Flame size={20} />;
                                    title = "Tip del Chef";
                                    color = "#EA580C"; // Orange
                                    bgColor = "#NFF2F7";
                                }

                                const cleanText = insight.includes(':') ? insight.split(':')[1].trim() : insight;

                                return (
                                    <div key={i} style={{
                                        display: 'flex', gap: '1rem',
                                        paddingBottom: i < planData.insights.length - 1 ? '1.25rem' : '0',
                                        borderBottom: i < planData.insights.length - 1 ? '1px solid #F1F5F9' : 'none'
                                    }}>
                                        <div style={{
                                            color: color, background: bgColor,
                                            minWidth: '42px', height: '42px',
                                            borderRadius: '12px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            {icon}
                                        </div>
                                        <div>
                                            <h4 style={{
                                                margin: '0 0 0.35rem 0',
                                                fontSize: '0.9rem', fontWeight: 700,
                                                color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em'
                                            }}>
                                                {title}
                                            </h4>
                                            <p style={{ margin: 0, fontSize: '0.95rem', color: '#64748B', lineHeight: 1.6 }}>
                                                {cleanText}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Recipe Preview */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.5) 100%)',
                        backdropFilter: 'blur(12px)',
                        padding: '1.75rem',
                        borderRadius: '2rem',
                        border: '1px solid white',
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{
                                fontSize: '1.2rem', fontWeight: 800, color: '#0F172A',
                                display: 'flex', alignItems: 'center', gap: '0.75rem'
                            }}>
                                <div style={{ background: '#FFF7ED', padding: '0.4rem', borderRadius: '0.75rem', color: '#EA580C' }}>
                                    <ChefHat size={22} strokeWidth={2.5} />
                                </div>
                                Recetas del Día
                            </h3>
                            <Link to="/dashboard/recipes" style={{ textDecoration: 'none' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#EA580C', background: '#FFF7ED', padding: '0.25rem 0.75rem', borderRadius: '99px', cursor: 'pointer' }}>
                                    Ver Todo
                                </span>
                            </Link>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                            {planData?.perfectDay?.slice(0, 3).map((meal, i) => (
                                <Link to="/dashboard/recipes" key={i} style={{ textDecoration: 'none' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '1rem',
                                        padding: '0.75rem', borderRadius: '1rem',
                                        background: 'white', border: '1px solid #F1F5F9',
                                        transition: 'all 0.2s',
                                        cursor: 'pointer'
                                    }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                                    >
                                        <div style={{
                                            width: 40, height: 40, borderRadius: '0.75rem',
                                            background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#64748B', flexShrink: 0
                                        }}>
                                            <ChefHat size={20} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {meal.name}
                                            </h4>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem' }}>
                                                <Flame size={14} /> {meal.cals} kcal
                                            </div>
                                        </div>
                                        <div style={{ color: '#CBD5E1' }}>
                                            <ArrowRight size={18} />
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        <Link to="/dashboard/recipes" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            textDecoration: 'none', color: 'white',
                            background: 'var(--text-main)',
                            fontWeight: 600, padding: '1rem', borderRadius: '1rem',
                            fontSize: '0.95rem', transition: 'all 0.2s',
                            boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.1)'
                        }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(15, 23, 42, 0.15)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(15, 23, 42, 0.1)'; }}
                        >
                            Ver Recetas Completas <ArrowRight size={18} />
                        </Link>
                    </div>

                </div>
            </div>
        </DashboardLayout>
    );
};

// --- Componente interno para las tarjetas de estadísticas ---
const StatCard = ({ label, value, unit, icon, color, bgColor }) => {
    const Icon = icon;

    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(10px)',
            padding: '1.5rem',
            borderRadius: '1.25rem',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '1.25rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'default',
            position: 'relative',
            overflow: 'hidden'
        }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
            <div style={{
                position: 'absolute', top: 0, right: 0, width: '6rem', height: '6rem',
                background: bgColor, filter: 'blur(40px)', opacity: 0.5, borderRadius: '50%',
                transform: 'translate(30%, -30%)'
            }} />

            <div style={{
                width: 56, height: 56,
                borderRadius: '1rem',
                background: bgColor,
                color: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
                boxShadow: `0 2px 8px ${color}33`
            }}>
                <Icon size={26} strokeWidth={2} fill={color} fillOpacity={0.2} />
            </div>

            <div style={{ position: 'relative' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1, letterSpacing: '-0.02em' }}>
                    {value} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600, marginLeft: '2px' }}>{unit}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '0.25rem' }}>
                    {label}
                </div>
            </div>
        </div>
    );
};

StatCard.propTypes = {
    label: PropTypes.string,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    unit: PropTypes.string,
    icon: PropTypes.elementType,
    color: PropTypes.string,
    bgColor: PropTypes.string
};

export default Dashboard;