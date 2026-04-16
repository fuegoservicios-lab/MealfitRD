import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Dumbbell, Wheat, Droplet, Activity, Lock } from 'lucide-react';
import PropTypes from 'prop-types';
import { useAssessment } from '../../context/AssessmentContext';
import { fetchWithAuth } from '../../config/api';
import styles from './TrackingProgress.module.css';

const TrackingProgress = ({ planData, userId, isLocked }) => {
    const { userProfile } = useAssessment();
    const navigate = useNavigate();

    const [consumed, setConsumed] = useState({
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        meals: []
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        
        const fetchConsumed = async () => {
            if (!userId || userId === 'guest') {
                if (isMounted) setLoading(false);
                return;
            }
            try {
                // Calculate local date and timezone offset
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                const tzOffset = now.getTimezoneOffset();

                const res = await fetchWithAuth(`/api/diary/consumed/${userId}?date=${dateStr}&tzOffset=${tzOffset}`);
                const data = await res.json();
                
                if (isMounted && data.totals) {
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
                if (isMounted) setLoading(false);
            }
        };

        // Fetch immediately on mount
        fetchConsumed();
        
        // Polling para "Tiempo Real" cada 15 segundos
        const intervalId = setInterval(fetchConsumed, 15000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
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
        <div className={styles.card}>
            {/* Overlay para Plan Gratis */}
            {isLocked && (
                <div className={styles.premiumOverlay}>
                    <div className={styles.premiumBox}>
                        <Lock size={32} color="#94A3B8" style={{ marginBottom: '1rem' }} />
                        <h3 style={{ margin: 0, color: '#334155', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Seguimiento de Progreso Interactivo</h3>
                        <p style={{ margin: 0, color: '#64748B', fontSize: '0.9rem', lineHeight: '1.5' }}>
                            Actualiza a <strong>Básico</strong> o superior para desbloquear el análisis inteligente de macros en tiempo real.
                        </p>
                        <button 
                            onClick={() => {
                                navigate('/');
                                setTimeout(() => {
                                    const element = document.getElementById('pricing');
                                    if (element) {
                                        const yOffset = -20; 
                                        const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
                                        window.scrollTo({ top: y, behavior: 'smooth' });
                                    }
                                }, 350);
                            }}
                            style={{
                                background: 'white',
                                border: '1px solid #CBD5E1',
                                padding: '0.5rem 1.5rem',
                                borderRadius: '8px',
                                fontWeight: '600',
                                color: '#0F172A',
                                cursor: 'pointer',
                                marginTop: '1rem',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                        >
                            Ver Planes
                        </button>
                    </div>
                </div>
            )}

            {/* Header Sector */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <div className={styles.headerIcon}>
                        <Activity size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h2 className={styles.title}>Progreso en Tiempo Real</h2>
                        <p className={styles.subtitle}>
                            {loading ? 'Cargando registros...' : `${consumed.meals.length} ${consumed.meals.length === 1 ? 'comida registrada' : 'comidas registradas'} hoy`}
                        </p>
                    </div>
                </div>
                
                {(!userId || userId === 'guest') && (
                    <div className={styles.guestBadge}>
                        Inicia sesión para registrar comidas
                    </div>
                )}
            </div>

            <div className={styles.content}>
                {/* Calorías (Main Bar) */}
                <ProgressBar 
                    label="Calorías Consumidas"
                    consumed={consumed.calories} goal={goalCal} unit="kcal"
                    perc={percCal} icon={Flame} color="#F59E0B" gradient="linear-gradient(90deg, #FCD34D 0%, #F59E0B 100%)"
                    large
                />

                <div className={styles.macroGrid}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 'max-content' }}>
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
                background: '#E2E8F0', 
                borderRadius: '99px',
                boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.08)',
                overflow: 'hidden'
            }}>
                <div style={{
                    height: '100%',
                    width: `${perc}%`,
                    background: gradient,
                    borderRadius: '99px',
                    boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.1)',
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
