import { useState } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import {
    Zap, Droplet, Flame, ArrowRight, CheckCircle,
    RefreshCw, ShoppingCart, ChefHat, Heart,
    Sparkles, Brain, Wallet, AlertCircle, Dumbbell, Wheat, Crown, Lightbulb, Wand2
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
        isPlus, // Obtenemos el estado de suscripción
        userProfile
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
            {/* --- HEADER PREMIUM --- */}
            <header style={{
                marginBottom: '3rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
                gap: '1.5rem',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 100%)',
                backdropFilter: 'blur(10px)',
                padding: '2rem',
                borderRadius: '2rem',
                border: '1px solid rgba(255,255,255,0.5)',
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
                            {isPlus ? 'PLUS MEMBER' : 'FREE PLAN'}
                        </span>
                    </div>

                    <h1 style={{
                        fontSize: '3rem',
                        fontWeight: 800,
                        lineHeight: 1.1,
                        letterSpacing: '-0.04em',
                        marginBottom: '0.25rem'
                    }}>
                        <span style={{ color: '#1E293B' }}>Hola, </span>
                        <span style={{
                            background: 'linear-gradient(to right, #3B82F6, #8B5CF6, #EC4899)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>
                            {userProfile?.full_name?.split(' ')[0] || formData?.name || 'Nutrifit'}
                        </span>
                    </h1>
                    <p style={{ color: '#64748B', fontSize: '1.1rem', fontWeight: 500 }}>
                        ¿Qué vamos a comer hoy?
                    </p>
                </div>

                {/* --- ACTIONS GROUP --- */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>

                    {/* VISUALIZADOR DE CRÉDITOS */}
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

                    {/* BOTÓN GENERAR */}
                    <button
                        onClick={handleNewPlan}
                        disabled={isLimitReached}
                        style={{
                            background: isLimitReached
                                ? '#E2E8F0'
                                : 'linear-gradient(135deg, #0F172A 0%, #334155 100%)', // Dark premium button
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
                        {isLimitReached ? <AlertCircle size={20} /> : <Wand2 size={20} fill="white" />}
                        <span>{isLimitReached ? 'Límite' : 'Generar Nuevo'}</span>
                    </button>
                </div>
            </header>

            {/* --- MACROS & CALORIES GRID --- */}
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '1.5rem' }}>
                Tus Objetivos Diarios
            </h2>
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
                            {formData?.skipLunch ? '3 Comidas + 1 Libre' : '4 Comidas'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {(() => {
                            // Crear copia de los platos para no mutar el original
                            let displayMeals = [...(planData.perfectDay || [])];

                            // Si se saltó el almuerzo, lo inyectamos visualmente en la posición 1 (después del desayuno)
                            if (formData?.skipLunch) {
                                // Aseguramos no duplicarlo si ya existe por alguna razón
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
                                            background: 'rgba(239, 246, 255, 0.6)', // Light blue tint
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
                                                    Almuerzo Familiar / Ya resuelto
                                                </h3>
                                                <p style={{ fontSize: '0.85rem', margin: 0, opacity: 0.8 }}>
                                                    Has marcado esta comida como libre o familiar.
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }

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
                            })
                        })()}
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
                {/* Agregamos fill para que el ícono se vea sólido (más "emoji" like) */}
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