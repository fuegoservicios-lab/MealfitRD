import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import {
    Zap, Droplet, Flame, ArrowRight, CheckCircle,
    RefreshCw, ShoppingCart, ChefHat, Heart,
    Sparkles, Brain, Wallet // Iconos nuevos importados
} from 'lucide-react';
import PropTypes from 'prop-types';

const Dashboard = () => {
    // 1. Obtenemos estado y funciones del Contexto Global
    const { planData, likedMeals, toggleMealLike } = useAssessment();
    const navigate = useNavigate();

    // 2. Protección de Ruta: Si no hay plan, mandar al inicio
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    const handleNewPlan = () => {
        navigate('/assessment');
    };

    return (
        <DashboardLayout>

            {/* --- HEADER --- */}
            <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
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
                <button
                    onClick={handleNewPlan}
                    style={{
                        background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                        color: 'white',
                        padding: '0.85rem 2rem',
                        borderRadius: '1rem',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.35), 0 4px 6px -2px rgba(37, 99, 235, 0.1)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        fontSize: '1rem',
                        letterSpacing: '0.025em',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(37, 99, 235, 0.5), 0 10px 10px -5px rgba(37, 99, 235, 0.2)';
                        e.currentTarget.style.filter = 'brightness(1.1)';
                        // Icon rotation
                        const icon = e.currentTarget.querySelector('svg');
                        if (icon) icon.style.transform = 'rotate(180deg)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(37, 99, 235, 0.35), 0 4px 6px -2px rgba(37, 99, 235, 0.1)';
                        e.currentTarget.style.filter = 'brightness(1)';
                        // Reset icon rotation
                        const icon = e.currentTarget.querySelector('svg');
                        if (icon) icon.style.transform = 'rotate(0deg)';
                    }}
                >
                    <RefreshCw size={22} strokeWidth={2.5} style={{ transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                    <span>Generar Nuevo</span>
                    {/* Shine Effect Element */}
                    <div style={{
                        position: 'absolute',
                        top: 0, left: '-100%',
                        width: '50%', height: '100%',
                        background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)',
                        transform: 'skewX(-25deg)',
                        transition: 'left 0.5s',
                        pointerEvents: 'none'
                    }}
                        className="shine-effect"
                    />
                    <style>{`
                        button:hover .shine-effect {
                            left: 200%;
                            transition: left 0.7s;
                        }
                    `}</style>
                </button>
            </header>

            {/* --- MACROS & CALORIES GRID --- */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1.5rem',
                marginBottom: '2.5rem'
            }}>
                <StatCard label="Calorías Diarias" value={planData.calories} unit="kcal" icon={Flame} color="#F59E0B" bgColor="#FFFBEB" />
                <StatCard label="Proteína" value={planData.macros?.protein || "0g"} unit="" icon={Zap} color="#3B82F6" bgColor="#EFF6FF" />
                <StatCard label="Carbohidratos" value={planData.macros?.carbs || "0g"} unit="" icon={ChefHat} color="#10B981" bgColor="#ECFDF5" />
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
                            4 Comidas
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {planData.perfectDay?.map((meal, index) => {
                            // Verificamos si este plato tiene like en el estado global
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

                                    {/* Right Side: Calories + Like Button */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1rem' }}>

                                        {/* Calories */}
                                        <div style={{ textAlign: 'right', minWidth: '60px' }}>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                                {meal.cals}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>kcal</div>
                                        </div>

                                        {/* LIKE BUTTON */}
                                        <button
                                            onClick={() => toggleMealLike(meal.name, meal.meal)}
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
                            );
                        })}
                    </div>
                </div>

                {/* Right Column: INSIGHTS & SHOPPING */}
                <div style={{ flex: 1, minWidth: '300px' }}>

                    {/* --- NUEVO DISEÑO: Tarjeta de Estrategia IA Mejorada --- */}
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
                            <Sparkles size={20} fill="#14532D" /> Estrategia Inteligente
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {planData.insights?.map((insight, i) => {
                                // Asignamos iconos y títulos según el índice
                                let icon = <CheckCircle size={20} />;
                                let title = "Análisis";
                                let color = "#15803D";

                                if (i === 0) { icon = <Brain size={20} />; title = "La Ciencia:"; }
                                if (i === 1) { icon = <Wallet size={20} />; title = "Tu Bolsillo:"; }
                                if (i === 2) { icon = <Flame size={20} />; title = "Tip Mealfit:"; }

                                // Limpiamos el texto si viene con prefijos como "Análisis:"
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
                                {/* CORRECCIÓN: Usamos .daily en lugar de .weekly */}
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
                                {/* Mensaje si está vacío (por seguridad) */}
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
            {/* Background decoration */}
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
                boxShadow: `0 2px 8px ${color}33` // Subtle colored shadow matching icon
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