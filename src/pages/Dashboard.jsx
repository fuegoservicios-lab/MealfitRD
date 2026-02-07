import { useState } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import {
    Zap, Droplet, Flame, ArrowRight, CheckCircle,
    RefreshCw, ShoppingCart, ChefHat, Heart,
    Sparkles, Brain, Wallet, AlertCircle, Dumbbell, Wheat, Crown, Lightbulb
} from 'lucide-react';
import PropTypes from 'prop-types';
import { toast } from 'sonner';

const Dashboard = () => {
    // 1. Obtenemos estado y funciones del Contexto Global
    const {
        planData,
        likedMeals,
        toggleMealLike,
        regenerateSingleMeal,
        formData,
        // Nuevos valores para el sistema de créditos
        planCount,
        PLAN_LIMIT,
        remainingCredits,
        isPlus // Obtenemos el estado de suscripción
    } = useAssessment();

    const navigate = useNavigate();

    // Estado local para saber qué tarjeta se está regenerando (loading spinner)
    const [regeneratingId, setRegeneratingId] = useState(null);

    // 2. Protección de Ruta: Si no hay plan, mandar al inicio
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    const handleNewPlan = () => {
        navigate('/assessment');
    };

    // Cálculos para la UI de límites
    // Si es Plus, nunca alcanza el límite
    const isLimitReached = !isPlus && planCount >= PLAN_LIMIT;
    const progressPercentage = isPlus ? 100 : Math.min(100, (planCount / PLAN_LIMIT) * 100);

    return (
        <DashboardLayout>

            {/* --- HEADER --- */}
            <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div>
                        <span style={{
                            display: 'inline-block', padding: '0.25rem 0.75rem',
                            background: '#DCFCE7', color: '#166534', borderRadius: '2rem',
                            fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem'
                        }}>
                            PLAN ACTIVO
                        </span>
                        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
                            Tu Panel Nutricional
                        </h1>
                        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            Diseñado por IA específicamente para tu metabolismo y objetivos.
                        </p>
                    </div>

                    {/* --- VISUALIZADOR DE CRÉDITOS --- */}
                    <div style={{
                        marginTop: '0.5rem',
                        background: isPlus ? 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' : 'rgba(255, 255, 255, 0.9)',
                        backdropFilter: 'blur(8px)',
                        padding: '0.6rem 1rem',
                        borderRadius: '1rem',
                        border: isPlus ? '1px solid #FCD34D' : '1px solid rgba(226, 232, 240, 0.8)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.875rem',
                        boxShadow: isPlus ? '0 4px 6px -1px rgba(245, 158, 11, 0.1)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        width: 'fit-content'
                    }}>
                        {/* Icono */}
                        <div style={{
                            background: isLimitReached ? '#FEF2F2' : (isPlus ? '#FDE68A' : '#EFF6FF'),
                            color: isLimitReached ? '#EF4444' : (isPlus ? '#B45309' : '#3B82F6'),
                            padding: '0.5rem',
                            borderRadius: '0.75rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            {isPlus ? <Crown size={18} fill="#B45309" /> : <Zap size={18} fill={isLimitReached ? '#EF4444' : '#3B82F6'} />}
                        </div>

                        {/* Texto */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: isPlus ? '#92400E' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {isPlus ? 'Membresía' : 'Créditos'}
                            </span>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: isPlus ? '#B45309' : 'var(--text-main)', lineHeight: 1.2 }}>
                                {isPlus ? "Plus Activo" : (
                                    <>
                                        {remainingCredits} <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: 600 }}>/ {PLAN_LIMIT}</span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Separator & Progress Bar (ONLY FOR FREE PLAN) */}
                        {!isPlus && (
                            <>
                                <div style={{ width: '1px', height: '24px', background: '#E2E8F0', margin: '0 0.25rem' }} />
                                <div style={{ width: '60px', height: '4px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${progressPercentage}%`,
                                        background: isLimitReached ? '#EF4444' : '#3B82F6',
                                        borderRadius: '4px',
                                        transition: 'width 0.5s ease'
                                    }} />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* BOTÓN GENERAR NUEVO (Con lógica de bloqueo) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    <button
                        onClick={handleNewPlan}
                        disabled={isLimitReached}
                        style={{
                            background: isLimitReached
                                ? '#E2E8F0' // Gris deshabilitado
                                : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                            color: isLimitReached ? '#94A3B8' : 'white',
                            padding: '0.85rem 2rem',
                            borderRadius: '1rem',
                            border: isLimitReached ? '1px solid #CBD5E1' : '1px solid rgba(255,255,255,0.1)',
                            fontWeight: 700,
                            cursor: isLimitReached ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            boxShadow: isLimitReached ? 'none' : '0 10px 15px -3px rgba(37, 99, 235, 0.35), 0 4px 6px -2px rgba(37, 99, 235, 0.1)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            fontSize: '1rem',
                            letterSpacing: '0.025em',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        {isLimitReached ? <AlertCircle size={22} /> : <RefreshCw size={22} strokeWidth={2.5} />}
                        <span>{isLimitReached ? 'Límite Alcanzado' : 'Generar Nuevo'}</span>

                        {!isLimitReached && (
                            <div style={{
                                position: 'absolute', top: 0, left: '-100%',
                                width: '50%', height: '100%',
                                background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)',
                                transform: 'skewX(-25deg)',
                                transition: 'left 0.5s',
                                pointerEvents: 'none'
                            }} className="shine-effect" />
                        )}
                        <style>{`button:hover .shine-effect { left: 200%; transition: left 0.7s; }`}</style>
                    </button>

                    {isLimitReached && (
                        <span style={{ fontSize: '0.75rem', color: '#EF4444', fontWeight: 600 }}>
                            Has alcanzado el límite de tu plan.
                        </span>
                    )}
                </div>
            </header>

            {/* --- MACROS & CALORIES GRID --- */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1.5rem',
                marginBottom: '2.5rem'
            }}>
                <StatCard label="Calorías Diarias" value={planData.calories} unit="kcal" icon={Flame} color="#F59E0B" bgColor="#FFFBEB" />
                <StatCard label="Proteína" value={planData.macros?.protein || "0g"} unit="" icon={Dumbbell} color="#3B82F6" bgColor="#EFF6FF" />
                <StatCard label="Carbohidratos" value={planData.macros?.carbs || "0g"} unit="" icon={Wheat} color="#10B981" bgColor="#ECFDF5" />
                <StatCard label="Grasas" value={planData.macros?.fats || "0g"} unit="" icon={Droplet} color="#EC4899" bgColor="#FDF2F8" />
            </div>

            {/* --- MAIN CONTENT COLUMNS --- */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2.5rem' }}>

                {/* Left Column: MEALS TIMELINE */}
                <div style={{ flex: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Menú de Hoy
                        </h2>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {formData?.skipLunch ? '3 Comidas' : '4 Comidas'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {planData.perfectDay?.filter(meal => {
                            if (formData?.skipLunch) {
                                const isLunch = meal.meal.toLowerCase().includes('almuerzo') || meal.name.toLowerCase().includes('lunch');
                                return !isLunch;
                            }
                            return true;
                        }).map((meal, index) => {
                            const isLiked = !!likedMeals[meal.name];

                            return (
                                <div key={index} style={{
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    backdropFilter: 'blur(12px)',
                                    padding: '1.5rem',
                                    borderRadius: '1rem',
                                    border: '1px solid rgba(255, 255, 255, 0.6)',
                                    display: 'grid',
                                    gridTemplateColumns: '1fr auto',
                                    gap: '1.5rem',
                                    alignItems: 'center',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    position: 'relative'
                                }}>

                                    {/* Meal Info */}
                                    <div>
                                        <div style={{
                                            textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 700,
                                            color: 'var(--primary)', letterSpacing: '0.05em', marginBottom: '0.25rem'
                                        }}>
                                            {meal.meal}
                                        </div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                                            {meal.name}
                                        </h3>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                            {meal.desc || "Plato balanceado seleccionado para tu objetivo."}
                                        </p>
                                    </div>

                                    {/* Right Side: Calories + Buttons */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1rem' }}>

                                        {/* Calories */}
                                        <div style={{ textAlign: 'right', minWidth: '60px' }}>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                                {meal.cals}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>kcal</div>
                                        </div>

                                        {/* BUTTONS GROUP */}
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>

                                            {/* REGENERATE BUTTON */}
                                            <button
                                                onClick={() => {
                                                    setRegeneratingId(index); // Activa spinner
                                                    // Pequeño delay para UX
                                                    setTimeout(() => {
                                                        const newName = regenerateSingleMeal(index, meal.meal, meal.name);
                                                        setRegeneratingId(null);
                                                        toast.success('Menú actualizado', {
                                                            description: `Cambiado a: ${newName}`,
                                                            icon: '🔄'
                                                        });
                                                    }, 500);
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
                                                title="Cambiar este plato por otro"
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
                                                        toast.success('¡Anotado!', {
                                                            description: `Aprenderemos que te gusta: ${meal.name}`,
                                                            duration: 2000,
                                                            icon: '❤️'
                                                        });
                                                    } else {
                                                        toast('Like removido', {
                                                            description: 'No priorizaremos este plato.',
                                                            duration: 1500
                                                        });
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
                                                title={isLiked ? "Quitar me gusta" : "¡Me gusta! (La IA aprenderá de esto)"}
                                            >
                                                <Heart
                                                    size={20}
                                                    color={isLiked ? '#EF4444' : '#94A3B8'}
                                                    fill={isLiked ? '#EF4444' : 'none'}
                                                />
                                            </button>
                                        </div>

                                    </div>

                                    {/* Estilo para la animación de rotación */}
                                    <style>{`
                                        .spin-fast { animation: spin 1s linear infinite; }
                                        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                                    `}</style>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right Column: INSIGHTS & SHOPPING */}
                <div style={{ flex: 1, minWidth: '300px' }}>

                    {/* Insights Card */}
                    <div style={{
                        background: 'rgba(240, 253, 244, 0.8)',
                        backdropFilter: 'blur(12px)',
                        padding: '1.5rem',
                        borderRadius: '1.5rem',
                        border: '1px solid rgba(187, 247, 208, 0.6)',
                        marginBottom: '2rem',
                        boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.1)'
                    }}>
                        <h3 style={{
                            fontSize: '1.1rem', fontWeight: 800, color: '#14532D',
                            marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}>
                            <Lightbulb size={20} fill="#14532D" /> Estrategia Inteligente
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {planData.insights?.map((insight, i) => {
                                let icon = <CheckCircle size={20} />;
                                let title = "Análisis";
                                let color = "#15803D";

                                if (i === 0) { icon = <Brain size={20} />; title = "La Ciencia:"; }
                                if (i === 1) { icon = <Wallet size={20} />; title = "Tu Bolsillo:"; }
                                if (i === 2) { icon = <Flame size={20} />; title = "Tip Mealfit:"; }

                                const cleanText = insight.includes(':') ? insight.split(':')[1].trim() : insight;

                                return (
                                    <div key={i} style={{
                                        display: 'flex', gap: '1rem',
                                        background: 'rgba(255,255,255,0.6)',
                                        padding: '1rem', borderRadius: '1rem'
                                    }}>
                                        <div style={{
                                            color: color, background: '#DCFCE7',
                                            padding: '0.5rem', borderRadius: '50%', height: 'fit-content'
                                        }}>
                                            {icon}
                                        </div>
                                        <div>
                                            <strong style={{ display: 'block', color: '#14532D', fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                                                {title}
                                            </strong>
                                            <p style={{ margin: 0, fontSize: '0.95rem', color: '#166534', lineHeight: 1.5 }}>
                                                {cleanText}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Shopping List Preview */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.8)',
                        backdropFilter: 'blur(12px)',
                        padding: '1.5rem',
                        borderRadius: '1rem',
                        border: '1px solid rgba(255, 255, 255, 0.6)',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Compras</h3>
                            <ShoppingCart size={20} color="var(--primary)" />
                        </div>

                        <div style={{
                            background: 'var(--bg-page)',
                            borderRadius: '0.75rem',
                            padding: '1rem',
                            marginBottom: '1.5rem'
                        }}>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {(Array.isArray(planData.shoppingList)
                                    ? planData.shoppingList
                                    : planData.shoppingList?.daily || []
                                ).slice(0, 5).map((item, i) => (
                                    <li key={i} style={{
                                        padding: '0.5rem 0',
                                        borderBottom: i < 4 ? '1px solid #E2E8F0' : 'none',
                                        fontSize: '0.9rem',
                                        color: 'var(--text-main)',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--secondary)' }} />
                                        {item}
                                    </li>
                                ))}
                                {(!planData.shoppingList?.daily || planData.shoppingList.daily.length === 0) && (
                                    <li style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                        Lista disponible en detalle.
                                    </li>
                                )}
                            </ul>
                        </div>

                        <Link to="/dashboard/shopping" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            textDecoration: 'none', color: 'white', background: 'var(--text-main)',
                            fontWeight: 600, padding: '0.75rem', borderRadius: '0.75rem',
                            fontSize: '0.9rem', transition: 'opacity 0.2s'
                        }}>
                            Ver Lista Completa <ArrowRight size={16} />
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
            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'default',
            position: 'relative',
            overflow: 'hidden'
        }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';
            }}
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
                <Icon size={26} strokeWidth={2.5} />
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