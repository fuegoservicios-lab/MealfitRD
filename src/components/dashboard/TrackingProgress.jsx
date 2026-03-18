import { useState, useEffect } from 'react';
import { Flame, Dumbbell, Wheat, Droplet, Activity, Lock } from 'lucide-react';
import PropTypes from 'prop-types';
import { useAssessment } from '../../context/AssessmentContext';
import { fetchWithAuth } from '../../config/api';

const TrackingProgress = ({ planData, userId }) => {
    const { isPlus } = useAssessment();
    const [consumed, setConsumed] = useState({
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        meals: []
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchConsumed = async () => {
            if (!userId || userId === 'guest') {
                setLoading(false);
                return;
            }
            try {
                // Remove env API_URL to use the Vite Proxy directly
                const res = await fetchWithAuth(`/api/diary/consumed/${userId}`);
                const data = await res.json();
                if (data.totals) {
                    setConsumed({
                        calories: data.totals.calories || 0,
                        protein: data.totals.protein || 0,
                        carbs: data.totals.carbs || 0,
                        fats: data.totals.healthy_fats || 0,
                        meals: data.meals || []
                    });
                }
            } catch (err) {
                console.error("Error fetching consumed meals:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchConsumed();
    }, [userId]);

    // Funciones Helper para calcular Progreso
    const goalCal = parseInt(planData?.calories) || 2000;
    const goalPro = parseInt(planData?.macros?.protein) || 150;
    const goalCarb = parseInt(planData?.macros?.carbs) || 200;
    const goalFat = parseInt(planData?.macros?.fats) || 60;

    const calcPerc = (val, max) => Math.min(Math.round((val / max) * 100) || 0, 100);

    const percCal = calcPerc(consumed.calories, goalCal);
    const percPro = calcPerc(consumed.protein, goalPro);
    const percCarb = calcPerc(consumed.carbs, goalCarb);
    const percFat = calcPerc(consumed.fats, goalFat);

    return (
        <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '1.25rem',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 10px rgba(15, 23, 42, 0.03), 0 1px 3px rgba(15, 23, 42, 0.02)',
            marginBottom: '2.5rem',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Ovelay para Plan Gratis */}
            {!isPlus && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255, 255, 255, 0.65)', // Slightly more transparent too
                    backdropFilter: 'blur(3px)',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    padding: '1rem', // Reduced for mobile
                    textAlign: 'center'
                }}>
                    <div style={{
                        background: 'white',
                        padding: '1.5rem', // Reduced for mobile
                        borderRadius: '1.25rem',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                        border: '1px solid #F1F5F9',
                        width: '100%',
                        maxWidth: '320px'
                    }}>
                        <div style={{
                            background: '#FEF2F2', color: '#EF4444', height: 48, width: 48, // Slightly smaller icon wrapper
                            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 1rem'
                        }}>
                            <Lock size={24} strokeWidth={2.5} />
                        </div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.5rem', marginTop: 0 }}>Función Premium</h3>
                        <p style={{ fontSize: '0.9rem', color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                            El Progreso en Tiempo Real y Analizador de Macros exige suscripción Plus. ¡Mejora tu plan!
                        </p>
                    </div>
                </div>
            )}

            {/* Header Sector */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '12px',
                        background: '#F8FAFC',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F172A',
                        border: '1px solid #E2E8F0'
                    }}>
                        <Activity size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>Progreso en Tiempo Real</h2>
                        <p style={{ margin: 0, color: '#64748B', fontSize: '0.9rem', fontWeight: 500, marginTop: '0.15rem' }}>
                            {loading ? 'Cargando registros...' : `${consumed.meals.length} ${consumed.meals.length === 1 ? 'comida registrada' : 'comidas registradas'} hoy`}
                        </p>
                    </div>
                </div>
                
                {(!userId || userId === 'guest') && (
                    <div style={{ fontSize: '0.8rem', color: '#B45309', background: '#FFFBEB', padding: '0.6rem 1.2rem', borderRadius: '8px', fontWeight: 600, border: '1px solid #FEF3C7' }}>
                        Inicia sesión para registrar comidas
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                {/* Calorías (Main Bar) */}
                <ProgressBar 
                    label="Calorías Consumidas"
                    consumed={consumed.calories} goal={goalCal} unit="kcal"
                    perc={percCal} icon={Flame} color="#F59E0B" gradient="linear-gradient(90deg, #FCD34D 0%, #F59E0B 100%)"
                    large
                />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem', paddingTop: '0.5rem' }}>
                    {/* Proteína */}
                    <ProgressBar 
                        label="Proteína"
                        consumed={consumed.protein} goal={goalPro} unit="g"
                        perc={percPro} icon={Dumbbell} color="#3B82F6" gradient="linear-gradient(90deg, #93C5FD 0%, #3B82F6 100%)"
                    />
                    {/* Carbohidratos */}
                    <ProgressBar 
                        label="Carbohidratos"
                        consumed={consumed.carbs} goal={goalCarb} unit="g"
                        perc={percCarb} icon={Wheat} color="#10B981" gradient="linear-gradient(90deg, #6EE7B7 0%, #10B981 100%)"
                    />
                    {/* Grasas */}
                    <ProgressBar 
                        label="Grasas"
                        consumed={consumed.fats} goal={goalFat} unit="g"
                        perc={percFat} icon={Droplet} color="#EC4899" gradient="linear-gradient(90deg, #F9A8D4 0%, #EC4899 100%)"
                    />
                </div>
            </div>
        </div>
    );
};

TrackingProgress.propTypes = {
    planData: PropTypes.object.isRequired,
    userId: PropTypes.string
};

// --- Componente Interno para Barra Individual ---
const ProgressBar = ({ label, consumed, goal, unit, perc, icon: Icon, color, gradient, large }) => {
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: large ? 32 : 28, height: large ? 32 : 28, borderRadius: '6px',
                        background: `${color}15`, color: color
                    }}>
                         <Icon size={large ? 18 : 16} strokeWidth={2.5} />
                    </div>
                    <span style={{ fontSize: large ? '1.05rem' : '0.95rem', fontWeight: 700, color: '#334155' }}>{label}</span>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: large ? '1.35rem' : '1.15rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
                        {consumed}
                    </span>
                    <span style={{ fontSize: large ? '0.95rem' : '0.85rem', fontWeight: 600, color: '#94A3B8' }}>
                        / {goal} {unit}
                    </span>
                </div>
            </div>
            
            <div style={{ 
                height: large ? 14 : 10, 
                width: '100%', 
                background: '#F1F5F9', 
                borderRadius: '99px',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)', // Inner shadow for structure
                overflow: 'hidden'
            }}>
                <div style={{
                    height: '100%',
                    width: `${perc}%`,
                    background: gradient,
                    borderRadius: '99px',
                    boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.1)', // 3D bevel effect instead of animations
                    transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }} />
            </div>
        </div>
    );
};

ProgressBar.propTypes = {
    label: PropTypes.string,
    consumed: PropTypes.number,
    goal: PropTypes.number,
    unit: PropTypes.string,
    perc: PropTypes.number,
    icon: PropTypes.elementType,
    color: PropTypes.string,
    gradient: PropTypes.string,
    large: PropTypes.bool
};

export default TrackingProgress;
