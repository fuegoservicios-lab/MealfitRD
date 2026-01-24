import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import {
    Zap, Droplet, Flame, ArrowRight, CheckCircle,
    RefreshCw, ShoppingCart, ChefHat, Heart
} from 'lucide-react';
import PropTypes from 'prop-types';

const Dashboard = () => {
    // 1. Obtenemos estado y funciones del Contexto Global
    // likedMeals: Objeto con los likes guardados { "Mangú": true }
    // toggleMealLike: Función para dar/quitar like y guardar en API/LocalStorage
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
                        background: 'var(--primary)', color: 'white',
                        padding: '0.75rem 1.5rem', borderRadius: '0.75rem',
                        border: 'none', fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        boxShadow: 'var(--shadow-glow)', transition: 'transform 0.2s'
                    }}
                >
                    <RefreshCw size={18} /> Generar Nuevo
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
                            // Verificamos si este plato tiene like en el estado global (Contexto)
                            // Esto asegura que el corazón se mantenga rojo al recargar
                            const isLiked = !!likedMeals[meal.name];

                            return (
                                <div key={index} style={{
                                    background: 'white',
                                    padding: '1.5rem',
                                    borderRadius: '1rem',
                                    border: '1px solid var(--border)',
                                    display: 'grid',
                                    gridTemplateColumns: '1fr auto',
                                    gap: '1.5rem',
                                    alignItems: 'center',
                                    boxShadow: 'var(--shadow-sm)',
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

                                        {/* LIKE BUTTON (Conectado al Contexto Global) */}
                                        <button
                                            onClick={() => toggleMealLike(meal.name, meal.meal)}
                                            style={{
                                                background: isLiked ? '#FEE2E2' : '#F8FAFC', // Rojo suave vs Gris muy claro
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
                                                color={isLiked ? '#EF4444' : '#94A3B8'} // Rojo fuerte vs Gris
                                                fill={isLiked ? '#EF4444' : 'none'}     // Relleno rojo si like
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

                    {/* AI Insights Card */}
                    <div style={{
                        background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
                        padding: '1.5rem',
                        borderRadius: '1rem',
                        border: '1px solid #BBF7D0',
                        marginBottom: '2rem'
                    }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#14532D', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Zap size={18} fill="#14532D" /> Estrategia IA
                        </h3>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {planData.insights?.map((insight, i) => (
                                <li key={i} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem', color: '#15803D', lineHeight: 1.5 }}>
                                    <CheckCircle size={18} style={{ minWidth: '18px', marginTop: '2px', opacity: 0.8 }} />
                                    <span>{insight}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Shopping List Preview */}
                    <div style={{
                        background: 'white',
                        padding: '1.5rem',
                        borderRadius: '1rem',
                        border: '1px solid var(--border)',
                        boxShadow: 'var(--shadow-sm)'
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
                                    : planData.shoppingList?.weekly || []
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
            background: 'white',
            padding: '1.5rem',
            borderRadius: '1rem',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: 'var(--shadow-sm)'
        }}>
            <div style={{
                width: 50, height: 50,
                borderRadius: '1rem',
                background: bgColor,
                color: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <Icon size={24} />
            </div>
            <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
                    {value} <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>{unit}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '0.25rem' }}>
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