import { useState, useEffect } from 'react';
import { Flame, Dumbbell, Wheat, Droplet, Activity } from 'lucide-react';
import PropTypes from 'prop-types';
import { useAssessment } from '../../context/AssessmentContext';
import { fetchWithAuth } from '../../config/api';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import ProteinIcon from '../icons/ProteinIcon';
import styles from './TrackingProgress.module.css';

// [P1-TRACKING-CACHE-CONSUMED · 2026-05-20] Cache local del card
// "Progreso en Tiempo Real" para arranque instantáneo al re-mount.
//
// Bug observado: cuando el user navega Dashboard → Nevera/Plan → Dashboard,
// el componente se desmonta (React Router) y re-monta con
// `consumed={calories:0, protein:0, carbs:0, fats:0}` → flash visible
// de macros en 0 durante los ~200-500ms del fetch. Reportado 2026-05-20:
// "cada vez que cambio de aparto y vuelvo aparecen las macros vacías".
//
// Fix: persistir `consumed` en localStorage con sessionId del user + fecha.
// Initializer del useState lee cache si match (user + fecha de hoy) →
// arranca con datos reales → refetch silencioso en background.
//
// Clave compuesta por user+date evita servir datos stale de OTRO user
// (logout/login) o de OTRO día (rollover medianoche). TTL implícito
// 24h porque la key tiene la fecha de hoy.
//
// Tooltip-anchor: P1-TRACKING-CACHE-CONSUMED.
const _CONSUMED_CACHE_KEY_PREFIX = 'mealfit_tracking_consumed_';
const _CONSUMED_DEFAULT = { calories: 0, protein: 0, carbs: 0, fats: 0, meals: [] };

const _getConsumedCacheKey = (userId) => {
    if (!userId) return null;
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return `${_CONSUMED_CACHE_KEY_PREFIX}${userId}_${dateStr}`;
};

const TrackingProgress = ({ planData, userId }) => {
    const { userProfile } = useAssessment();

    const [consumed, setConsumed] = useState(() => {
        // [P1-TRACKING-CACHE-CONSUMED · 2026-05-20] Hidratar desde localStorage
        // si hay cache válido para este user+fecha. Sin esto, el initial state
        // es {0,0,0,0} y el user ve flash de macros vacías cada vez que
        // re-monta el componente (navegación entre tabs del dashboard).
        try {
            const key = _getConsumedCacheKey(userId);
            if (key) {
                const raw = safeLocalStorageGet(key, null);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed.calories === 'number') {
                        return parsed;
                    }
                }
            }
        } catch (_e) { /* fail-open al default */ }
        return _CONSUMED_DEFAULT;
    });
    // Loading inicial false si hidratamos del cache (no mostrar spinner si
    // ya hay datos visibles); true solo si arrancamos con default vacío.
    const [loading, setLoading] = useState(() => {
        try {
            const key = _getConsumedCacheKey(userId);
            if (key) {
                const raw = safeLocalStorageGet(key, null);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed.calories === 'number') return false;
                }
            }
        } catch (_e) { /* ignore */ }
        return true;
    });

    // [P1-TRACKING-CACHE-CONSUMED · 2026-05-20] Persist consumed al change.
    useEffect(() => {
        const key = _getConsumedCacheKey(userId);
        if (!key) return;
        // No persistir el default vacío — bloquearía la hidratación de un
        // próximo mount con datos frescos del servidor.
        if (!consumed || (consumed.calories === 0 && consumed.protein === 0 && consumed.carbs === 0 && consumed.fats === 0)) return;
        try {
            safeLocalStorageSet(key, JSON.stringify(consumed));
        } catch (_e) { /* ignore */ }
    }, [consumed, userId]);

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

        // [P1-TRACKING-POLLING-REMOVED · 2026-05-20] Polling cada 15s
        // eliminado. Causa documentada del bug "se la pasa refrescándose":
        // cada setConsumed({...}) crea un objeto nuevo → React rerender
        // del card, aunque los 4 valores numéricos sean iguales. Resultado
        // visible: flicker sutil cada 15s sin razón aparente, molestia UX
        // reportada 2026-05-20.
        //
        // Reemplazo: 2 triggers reactivos (sin polling):
        //   - `mealfit:refresh-inventory` custom event que AgentPage dispara
        //     cuando el LLM emite `[UI_ACTION: REFRESH_INVENTORY]` tras
        //     log_consumed_meal/modify_pantry_inventory/mark_shopping_list_purchased.
        //     Cubre el caso "user registra comida desde el chat" (~99% del uso).
        //   - `visibilitychange` cuando el tab vuelve a ser visible. Cubre
        //     mutaciones cross-tab/cross-device (user logueó comida desde
        //     otro browser, o desde el endpoint /api/diary/consumed directo).
        //
        // Mismo patrón que `WaterTracker.jsx` (P3-WATER-TRACKER).
        const onAgentRefreshInventory = () => {
            if (isMounted) fetchConsumed();
        };
        const onVisibilityChange = () => {
            if (isMounted && document.visibilityState === 'visible') {
                fetchConsumed();
            }
        };
        window.addEventListener('mealfit:refresh-inventory', onAgentRefreshInventory);
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            isMounted = false;
            window.removeEventListener('mealfit:refresh-inventory', onAgentRefreshInventory);
            document.removeEventListener('visibilitychange', onVisibilityChange);
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
                    label="Calorías"
                    consumed={consumed.calories} goal={goalCal} unit="kcal"
                    perc={percCal} icon={Flame} color="#F59E0B" gradient="linear-gradient(90deg, #FCD34D 0%, #F59E0B 100%)"
                    large
                />

                <div className={styles.macroGrid}>
                    {/* Proteína */}
                    <ProgressBar
                        label="Proteína"
                        consumed={consumed.protein} goal={goalPro} unit="g"
                        perc={percPro} icon={ProteinIcon} color="#3B82F6" gradient="linear-gradient(90deg, #93C5FD 0%, #3B82F6 100%)"
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
    const isEmpty = perc === 0;
    const isComplete = perc >= 100;

    return (
        <div className={large ? styles.barLarge : styles.barSmall}>
            <div className={styles.barHeader}>
                <div className={styles.barLabelGroup}>
                    <div
                        className={styles.barIcon}
                        style={{
                            width: large ? 38 : 32,
                            height: large ? 38 : 32,
                            background: `linear-gradient(135deg, ${color}1A 0%, ${color}26 100%)`,
                            color: color,
                            boxShadow: `inset 0 0 0 1px ${color}26`
                        }}
                    >
                        <Icon 
                            size={large ? 19 : 16} 
                            strokeWidth={2.5} 
                        />
                    </div>
                    <span
                        className={styles.barLabel}
                        style={{ fontSize: large ? '1.05rem' : '0.92rem' }}
                    >
                        {label}
                    </span>
                </div>
                <div className={styles.barValues}>
                    <span
                        className={styles.barConsumed}
                        style={{
                            fontSize: large ? '1.5rem' : '1.2rem',
                            color: isEmpty ? '#CBD5E1' : '#0F172A'
                        }}
                    >
                        {consumed}
                    </span>
                    <span
                        className={styles.barGoal}
                        style={{ fontSize: large ? '0.9rem' : '0.8rem' }}
                    >
                        / {goal} {unit}
                    </span>
                </div>
            </div>

            <div
                className={styles.track}
                style={{
                    height: large ? 12 : 10,
                    background: '#E2E8F0'
                }}
            >
                <div
                    className={styles.fill}
                    style={{
                        width: `${perc}%`,
                        background: gradient,
                        boxShadow: isComplete ? `0 0 12px ${color}66` : 'none'
                    }}
                >
                    {/* [P3-TRACKING-BAR-INLINE-PERC · 2026-05-20] % blanco dentro
                        del fill (estilo carga de batería). Mobile-only via CSS
                        — desktop sigue usando la pill `.percRow` debajo. */}
                    {!isEmpty && (
                        <span className={styles.fillPerc}>{perc}%</span>
                    )}
                </div>
            </div>

            {!isEmpty && (
                <div className={styles.percRow}>
                    <span
                        className={styles.percChip}
                        style={{
                            color: color,
                            background: `${color}14`
                        }}
                    >
                        {perc}%
                    </span>
                </div>
            )}
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
