import { useState } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import {
    Zap, Droplet, Flame, ArrowRight, CheckCircle,
    RefreshCw, ChefHat, Heart, Pill,
    Brain, Wallet, AlertCircle, Dumbbell, Wheat,
    Lightbulb, Wand2, Clock, BookOpen, Loader2, Target
} from 'lucide-react';
import PropTypes from 'prop-types';
import { toast } from 'sonner';
import TrackingProgress from '../components/dashboard/TrackingProgress';

const Dashboard = () => {
    // 1. Obtenemos estado y funciones del Contexto Global
    const {
        planData,
        likedMeals,
        toggleMealLike,
        regenerateSingleMeal, // Ahora esta función es ASYNC (llama a la IA)
        formData,
        planCount,
        PLAN_LIMIT,
        userPlanLimit,
        remainingCredits,
        isPlus,
        userProfile,
        loadingData,
        setCurrentStep
    } = useAssessment();

    const navigate = useNavigate();

    // Estado local para saber qué tarjeta se está regenerando (loading spinner específico)
    const [regeneratingId, setRegeneratingId] = useState(null);

    // Estado local para la navegación por pestañas (Días)
    const [activeDayIndex, setActiveDayIndex] = useState(0);

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

    // Cálculos para la UI de límites
    const isLimitReached = typeof userPlanLimit === 'number' && planCount >= userPlanLimit;

    // Calcular si el periodo de compras expiró para sugerir "Actualizar Plan" en lugar de "Platos"
    const groceryDuration = formData?.groceryDuration || 'weekly';
    const planCreatedAt = planData?.created_at ? new Date(planData.created_at) : new Date();
    const daysSinceCreation = Math.floor((new Date() - planCreatedAt) / (1000 * 60 * 60 * 24));
    
    let isPlanExpired = false;
    let maxDays = 7;
    if (groceryDuration === 'weekly') { maxDays = 7; if (daysSinceCreation >= 7) isPlanExpired = true; }
    if (groceryDuration === 'biweekly') { maxDays = 15; if (daysSinceCreation >= 15) isPlanExpired = true; }
    if (groceryDuration === 'monthly') { maxDays = 30; if (daysSinceCreation >= 30) isPlanExpired = true; }
    
    const daysLeft = Math.max(0, maxDays - daysSinceCreation);

    const handleNewPlan = () => {
        if (formData && formData.age && formData.mainGoal) {
            let previousMeals = [];
            
            // Si NO ha expirado el plan (Actualizar Platos), enviamos las comidas previas 
            // para que la IA mantenga la lista de compras y solo rote las preparaciones.
            // Si SÍ expiró el plan (Actualizar Plan), enviamos el arreglo vacío para que
            // la IA genere recomendaciones y una lista de compras totalmente nueva.
            if (planData && !isPlanExpired) {
                const planDaysToCheck = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
                planDaysToCheck.forEach(day => {
                    day.meals.forEach(meal => {
                        if (meal && meal.name) previousMeals.push(meal.name);
                    });
                });
                
                toast('Rotando Menú', {
                    description: 'Diseñando nuevos platos con tus ingredientes actuales...',
                    icon: '🍲',
                });
            } else {
                toast('Ciclo Renovado', {
                    description: 'Generando nueva lista de compras y menú desde cero...',
                    icon: '🛒',
                });
            }
            navigate('/plan', { state: { previousMeals } });
        } else {
            setCurrentStep(0);
            navigate('/assessment');
        }
    };

    // Retrocompatibilidad y extracción de días
    const planDays = planData?.days || [{ day: 1, meals: planData?.meals || planData?.perfectDay || [] }];
    const currentDayMeals = planDays[activeDayIndex]?.meals || [];
    const currentDaySupplements = planDays[activeDayIndex]?.supplements || [];

    return (
        <DashboardLayout>

            {/* Mobile Responsive Styles */}
            <style>{`
                .dashboard-header {
                    margin-bottom: 3rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    flex-wrap: wrap;
                    gap: 1.5rem;
                    background: linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.5) 100%);
                    backdrop-filter: blur(12px);
                    padding: 2rem;
                    border-radius: 2rem;
                    border: 1px solid rgba(255,255,255,0.6);
                    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.05);
                }
                .dashboard-title {
                    font-size: 2.5rem;
                    font-weight: 800;
                    line-height: 1.1;
                    letter-spacing: -0.03em;
                    margin-bottom: 0.25rem;
                    color: #1E293B;
                }
                .dashboard-subtitle {
                    color: #64748B;
                    font-size: 1.1rem;
                    font-weight: 500;
                }
                .macros-grid {
                    background: white;
                    border-radius: 1.25rem;
                    border: 1px solid #E2E8F0;
                    box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.03);
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    overflow: hidden;
                }
                .stat-item {
                    padding: 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    background: white;
                    border-right: 1px solid #F1F5F9;
                }
                .stat-item:last-child {
                    border-right: none;
                }
                .menu-section-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 1.5rem;
                }
                .menu-section-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--text-main);
                    margin: 0;
                }
                .menu-section-count {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                }
                .option-buttons {
                    display: flex;
                    gap: 1rem;
                    margin-bottom: 2rem;
                    justify-content: center;
                    background: #F8FAFC;
                    padding: 0.75rem;
                    border-radius: 1rem;
                    border: 1px solid #E2E8F0;
                    box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.02);
                }
                .option-btn {
                    flex: 1;
                    padding: 1rem;
                    border-radius: 0.75rem;
                    font-weight: 800;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-size: 1rem;
                }
                .meal-card {
                    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.75) 100%);
                    backdrop-filter: blur(16px);
                    padding: 1.75rem;
                    border-radius: 2rem;
                    border: 1px solid white;
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: 1.5rem;
                    align-items: center;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                }
                .main-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 2.5rem;
                }
                .actions-group {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .new-plan-btn {
                    padding: 0.85rem 1.75rem;
                    border-radius: 1rem;
                    border: none;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    transition: all 0.3s ease;
                    font-size: 0.95rem;
                    cursor: pointer;
                }

                @media (max-width: 768px) {
                    .dashboard-header {
                        padding: 1.25rem;
                        margin-bottom: 1.5rem;
                        border-radius: 1.25rem;
                        gap: 1rem;
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .dashboard-title {
                        font-size: 1.65rem;
                    }
                    .dashboard-subtitle {
                        font-size: 0.9rem;
                    }
                    .macros-grid {
                        grid-template-columns: repeat(2, 1fr);
                        border-radius: 1rem;
                    }
                    .stat-item {
                        padding: 1rem 1.15rem;
                        gap: 0.65rem;
                        border-right: none;
                        border-bottom: 1px solid #F1F5F9;
                    }
                    .stat-item:nth-child(odd) {
                        border-right: 1px solid #F1F5F9;
                    }
                    .stat-item:nth-child(n+3) {
                        border-bottom: none;
                    }
                    .stat-item .stat-icon {
                        width: 38px;
                        height: 38px;
                        border-radius: 10px;
                    }
                    .stat-item .stat-value {
                        font-size: 1.25rem;
                    }
                    .stat-item .stat-label {
                        font-size: 0.7rem;
                    }
                    .menu-section-header {
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        gap: 0.25rem;
                        margin-bottom: 1rem;
                    }
                    .option-buttons {
                        gap: 0.5rem;
                        padding: 0.5rem;
                        margin-bottom: 1.25rem;
                    }
                    .option-btn {
                        padding: 0.7rem 0.5rem;
                        font-size: 0.85rem;
                        border-radius: 0.6rem;
                    }
                    .meal-card {
                        padding: 1.25rem;
                        border-radius: 1.25rem;
                        grid-template-columns: 1fr;
                        gap: 1rem;
                    }
                    .meal-right-side {
                        flex-direction: row !important;
                        align-items: center !important;
                        justify-content: space-between;
                        width: 100%;
                        border-top: 1px solid #F1F5F9;
                        padding-top: 0.75rem;
                    }
                    .meal-right-side > div:first-child {
                        text-align: left !important;
                    }
                    .main-grid {
                        grid-template-columns: 1fr;
                        gap: 1.5rem;
                    }
                    .actions-group {
                        width: 100%;
                    }
                    .new-plan-btn {
                        width: 100%;
                        justify-content: center;
                        padding: 0.75rem 1.25rem;
                        font-size: 0.88rem;
                    }
                    .credits-badge {
                        flex: 1;
                    }
                }

                @media (max-width: 480px) {
                    .dashboard-header {
                        padding: 1rem;
                        margin-bottom: 1.25rem;
                        border-radius: 1rem;
                    }
                    .dashboard-title {
                        font-size: 1.45rem;
                    }
                    .stat-item {
                        padding: 0.85rem 0.7rem;
                    }
                    .meal-card {
                        padding: 1rem;
                        border-radius: 1rem;
                    }
                }
            `}</style>

            {/* --- HEADER PREMIUM --- */}
            <header className="dashboard-header">
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
                            {isPlus ? (userProfile?.plan_tier === 'ultra' ? 'MIEMBRO ULTRA' : userProfile?.plan_tier === 'basic' ? 'MIEMBRO BÁSICO' : 'MIEMBRO PLUS') : 'PLAN GRATUITO'}
                        </span>
                    </div>

                    <h1 className="dashboard-title">
                        Hola, <span style={{
                            background: 'linear-gradient(to right, #3B82F6, #8B5CF6)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>
                            {userProfile?.full_name?.split(' ')[0] || formData?.name || 'Nutrifit'}
                        </span>
                    </h1>
                    <p className="dashboard-subtitle">
                        Aquí tienes tu estrategia nutricional de hoy.
                    </p>
                </div>

                {/* --- ACTIONS GROUP --- */}
                <div className="actions-group">

                    {/* VISUALIZADOR DE CRÉDITOS */}
                    <div className="credits-badge" style={{
                        background: '#FFFFFF',
                        padding: '0.6rem 1rem',
                        borderRadius: '1rem',
                        border: '2px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.875rem',
                        boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.08)',
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
                                {remainingCredits} {userPlanLimit !== 'Ilimitado' && <span style={{ color: '#94A3B8' }}>/ {userPlanLimit}</span>}
                            </div>
                        </div>
                    </div>

                    {/* REGENERACIÓN DE MENÚ: BOTÓN Y TEXTO AUXILIAR */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'center' }}>
                        <button
                            onClick={handleNewPlan}
                            disabled={isLimitReached}
                            className="new-plan-btn"
                            style={{
                                background: isLimitReached
                                    ? '#E2E8F0'
                                    : 'linear-gradient(135deg, #0F172A 0%, #334155 100%)',
                                color: isLimitReached ? '#94A3B8' : 'white',
                                cursor: isLimitReached ? 'not-allowed' : 'pointer',
                                boxShadow: isLimitReached ? 'none' : '0 10px 20px -5px rgba(15, 23, 42, 0.3)',
                            }}
                        >
                            {isLimitReached ? <AlertCircle size={20} /> : <Wand2 size={20} />}
                            <span>{isLimitReached ? 'Límite Alcanzado' : (isPlanExpired ? 'Actualizar Plan' : 'Actualizar Platos')}</span>
                        </button>
                        
                        {/* Indicador de vigencia de la lista de compras */}
                        {!isLimitReached && (
                            <span style={{ 
                                fontSize: '0.7rem', 
                                color: isPlanExpired ? '#EF4444' : '#64748B', 
                                fontWeight: 600,
                                background: isPlanExpired ? '#FEF2F2' : 'transparent',
                                padding: isPlanExpired ? '0.15rem 0.6rem' : '0',
                                borderRadius: '1rem',
                                transition: 'all 0.3s ease'
                            }}>
                                {isPlanExpired 
                                    ? "⏳ Lista vencida. Renovación sugerida" 
                                    : `🛒 Faltan ${daysLeft} día${daysLeft !== 1 ? 's' : ''} de súper`}
                            </span>
                        )}
                    </div>
                </div>
            </header>

            {/* --- MACROS & CALORIES SUMMARY ROW --- */}
            <div style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ background: '#EFF6FF', color: '#3B82F6', padding: '0.4rem', borderRadius: '0.5rem', display: 'flex' }}>
                        <Target size={20} strokeWidth={2.5} />
                    </div>
                    Objetivo del Día
                </h2>
                
                <div className="macros-grid">
                    <StatItem label="Calorías Totales" value={planData.calories} unit="kcal" icon={Flame} color="#F59E0B" bgColor="#FFFBEB" isFirst={true} />
                    <StatItem label="Proteína" value={planData.macros?.protein || "0g"} unit="" icon={Dumbbell} color="#3B82F6" bgColor="#EFF6FF" />
                    <StatItem label="Carbohidratos" value={planData.macros?.carbs || "0g"} unit="" icon={Wheat} color="#10B981" bgColor="#ECFDF5" />
                    <StatItem label="Grasas" value={planData.macros?.fats || "0g"} unit="" icon={Droplet} color="#EC4899" bgColor="#FDF2F8" />
                </div>
            </div>

            {/* --- DAILY TRACKER UI --- */}
            <TrackingProgress 
                planData={planData} 
                userId={userProfile?.id || formData?.session_id || 'guest'} 
            />

            {/* --- MAIN CONTENT COLUMNS --- */}
            <div className="main-grid">

                {/* Left Column: MEALS TIMELINE */}
                <div style={{ flex: 2 }}>
                    <div className="menu-section-header">
                        <h2 className="menu-section-title">
                            Tu Menú de Hoy
                        </h2>
                        <span className="menu-section-count">
                            {formData?.skipLunch ? '3 Comidas Planificadas' : '4 Comidas Completas'}
                        </span>
                    </div>

                    {/* BOTONES NAVEGACIÓN DÍAS (OPCIONES) */}
                    {planDays.length > 1 && (
                        <div className="option-buttons">
                            {planDays.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setActiveDayIndex(idx)}
                                    className="option-btn"
                                    style={{
                                        border: activeDayIndex === idx ? 'none' : '1px solid #CBD5E1',
                                        background: activeDayIndex === idx ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' : 'white',
                                        color: activeDayIndex === idx ? 'white' : '#475569',
                                        boxShadow: activeDayIndex === idx ? '0 10px 15px -3px rgba(59, 130, 246, 0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
                                        transform: activeDayIndex === idx ? 'translateY(-2px)' : 'translateY(0)'
                                    }}
                                >
                                    Opción {String.fromCharCode(65 + idx)}
                                </button>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {(() => {
                            // Copia segura de platos usando el día activo (filtrar suplementos que tienen su propia sección)
                            let displayMeals = [...currentDayMeals].filter(m => !m.meal?.toLowerCase().includes('suplemento'));

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
                                    if (isPlus) {
                                        return (
                                            <div key={index} style={{
                                                background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.8), rgba(219, 234, 254, 0.5))',
                                                padding: '1.5rem',
                                                borderRadius: '1.5rem',
                                                border: '2px dashed #93C5FD',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '1.5rem',
                                                color: '#1E40AF',
                                                boxShadow: '0 4px 15px -5px rgba(59, 130, 246, 0.1)',
                                                flexWrap: 'wrap'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <div style={{
                                                        background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', 
                                                        color: 'white',
                                                        borderRadius: '12px', width: 48, height: 48,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)'
                                                    }}>
                                                        <ChefHat size={24} />
                                                    </div>
                                                    <div>
                                                        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.25rem', color: '#1E3A8A' }}>
                                                            Cupo Vacío para Almuerzo
                                                        </h3>
                                                        <p style={{ fontSize: '0.9rem', margin: 0, color: '#3B82F6', fontWeight: 500 }}>
                                                            Dile a tu Agente IA qué vas a almorzar hoy.
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        window.scrollTo(0, 0);
                                                        navigate('/dashboard/agent');
                                                    }}
                                                    style={{
                                                        background: 'white',
                                                        color: '#2563EB',
                                                        border: '2px solid #BFDBFE',
                                                        borderRadius: '1rem',
                                                        padding: '0.75rem 1.25rem',
                                                        fontWeight: 700,
                                                        fontSize: '0.9rem',
                                                        cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                        transition: 'all 0.2s',
                                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                                        e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(59, 130, 246, 0.15)';
                                                        e.currentTarget.style.borderColor = '#93C5FD';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)';
                                                        e.currentTarget.style.borderColor = '#BFDBFE';
                                                    }}
                                                >
                                                    <Wand2 size={18} /> Registrar con IA
                                                </button>
                                            </div>
                                        );
                                    }

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
                                    <div key={index} className="meal-card">

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
                                        <div className="meal-right-side" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1rem' }}>

                                            {/* Calories Badge */}
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                    {meal.cals}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '4px' }}>kcal</div>
                                            </div>

                                            {/* BUTTONS GROUP */}
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>

                                                {/* VER RECETA */}
                                                <button
                                                    onClick={() => navigate('/dashboard/recipes')}
                                                    style={{
                                                        background: '#EFF6FF',
                                                        border: '1.5px solid #BFDBFE',
                                                        borderRadius: '50%',
                                                        width: 44, height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    title="Ver paso a paso"
                                                >
                                                    <BookOpen size={20} color="#3B82F6" />
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
                                                            // 4. Llamada ASYNC al modelo local
                                                            const newName = await regenerateSingleMeal(activeDayIndex, index, meal.meal, meal.name);

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
                                                        background: '#FFF7ED',
                                                        border: '1.5px solid #FED7AA',
                                                        borderRadius: '50%',
                                                        width: 44, height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: regeneratingId === index ? 'wait' : 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    title="No me gusta (Cambiar con IA)"
                                                >
                                                    <RefreshCw
                                                        size={20}
                                                        color="#EA580C"
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
                                                        background: isLiked ? '#FEE2E2' : '#FDF2F8',
                                                        border: isLiked ? '1.5px solid #FECACA' : '1.5px solid #FBCFE8',
                                                        borderRadius: '50%',
                                                        width: 44, height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        boxShadow: isLiked ? '0 2px 5px rgba(239, 68, 68, 0.2)' : 'none'
                                                    }}
                                                    title="Me gusta"
                                                >
                                                    <Heart size={20} color={isLiked ? '#EF4444' : '#EC4899'} fill={isLiked ? '#EF4444' : 'none'} />
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

                    {/* SUPPLEMENTS SECTION */}
                    {currentDaySupplements.length > 0 && (
                        <div style={{
                            marginTop: '1.5rem',
                            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(168, 85, 247, 0.08) 100%)',
                            borderRadius: '1.5rem',
                            border: '1px solid rgba(139, 92, 246, 0.15)',
                            padding: '1.5rem',
                            boxShadow: '0 4px 15px -5px rgba(139, 92, 246, 0.1)'
                        }}>
                            <h3 style={{
                                fontSize: '1rem', fontWeight: 800, color: '#6D28D9',
                                marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}>
                                <div style={{
                                    background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
                                    color: 'white', borderRadius: '10px',
                                    width: 32, height: 32,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Pill size={16} />
                                </div>
                                Suplementos del Día
                                <span style={{
                                    marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600,
                                    background: '#EDE9FE', color: '#7C3AED',
                                    padding: '0.2rem 0.6rem', borderRadius: '9999px'
                                }}>
                                    {currentDaySupplements.length}
                                </span>
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {currentDaySupplements.map((supp, i) => (
                                    <div key={i} style={{
                                        background: 'white',
                                        borderRadius: '1rem',
                                        padding: '1rem 1.25rem',
                                        border: '1px solid rgba(139, 92, 246, 0.1)',
                                        display: 'flex', flexDirection: 'column', gap: '0.35rem'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.95rem' }}>
                                                💊 {supp.name}
                                            </span>
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 700,
                                                background: '#F5F3FF', color: '#7C3AED',
                                                padding: '0.15rem 0.5rem', borderRadius: '6px'
                                            }}>
                                                {supp.timing}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                            Dosis: {supp.dose}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748B', lineHeight: 1.4 }}>
                                            {supp.reason}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
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
                            Estrategia Nutricional
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
                                    title = "Plan de Acción";
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
                                Recetas
                            </h3>
                            <Link to="/dashboard/recipes" onClick={() => window.scrollTo(0, 0)} style={{ textDecoration: 'none' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#EA580C', background: '#FFF7ED', padding: '0.25rem 0.75rem', borderRadius: '99px', cursor: 'pointer' }}>
                                    Ver Todo
                                </span>
                            </Link>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                            {currentDayMeals.slice(0, 3).map((meal, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                    padding: '0.75rem', borderRadius: '1rem',
                                    background: 'white', border: '1px solid #F1F5F9'
                                }}>
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
                            ))}
                        </div>

                        <Link to="/dashboard/recipes" 
                            onClick={() => window.scrollTo(0, 0)}
                            style={{
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

// --- Componente interno para las métricas (Items del KPI Board) ---
const StatItem = ({ label, value, unit, icon, color, bgColor, isFirst }) => {
    const Icon = icon;

    return (
        <div className="stat-item">
            <div className="stat-icon" style={{
                width: 48, height: 48,
                borderRadius: '12px',
                background: bgColor,
                color: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
            }}>
                <Icon size={24} strokeWidth={2.5} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <div className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', lineHeight: 1, letterSpacing: '-0.02em' }}>
                        {value}
                    </div>
                    {unit && (
                        <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, paddingLeft: '5px' }}>
                            {unit}
                        </div>
                    )}
                </div>
                <div className="stat-label" style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {label}
                </div>
            </div>
        </div>
    );
};

StatItem.propTypes = {
    label: PropTypes.string,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    unit: PropTypes.string,
    icon: PropTypes.elementType,
    color: PropTypes.string,
    bgColor: PropTypes.string,
    isFirst: PropTypes.bool
};

export default Dashboard;