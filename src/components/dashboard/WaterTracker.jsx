// [P3-WATER-TRACKER · 2026-05-16] Tracker diario de hidratacion.
//
// Comportamiento:
//   - Toggle desde Preferencias: si `water_tracker_enabled === false`, el
//     componente retorna null (no se renderiza). Cache en localStorage
//     `mealfit_water_tracker_enabled` para pre-render sin flash.
//   - Meta diaria PERSONALIZADA: el backend deriva el goal desde
//     `health_profile.weight + activityLevel` (formula 35ml/kg + bonus
//     actividad). Rango [6, 14] vasos. Fallback a 8 si peso no esta cargado.
//   - Persistencia: Supabase via endpoints backend `/api/plans/water-intake`
//     (GET en mount, POST tras cada click).
//   - Reset a medianoche local: cliente envia fecha local YYYY-MM-DD; el
//     reset emerge del rollover. Watcher `setInterval(60s)` rehidrata cuando
//     cambia la fecha.
//   - Cross-tab refresh (Fix 3): listener `visibilitychange` re-GET al
//     volver al tab; `storage` event reacciona al toggle del Settings
//     activado en otra tab.
//   - Optimistic UI: click pinta el vaso al instante; revert+toast si POST
//     falla.
//   - Grid responsivo: hasta 8 vasos en 1 fila; 9-14 → 2 filas balanceadas
//     `Math.ceil(goal/2)` columnas.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassWater, Check } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';

const DEFAULT_GOAL = 8;
const GOAL_MIN = 6;
const GOAL_MAX = 14;
const LS_ENABLED_KEY = 'mealfit_water_tracker_enabled';

// Fecha local YYYY-MM-DD (NO UTC). Evita off-by-one cerca de medianoche
// en timezones con offset > 0.
const getLocalDateString = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// Sanea valores del backend: aceptamos solo enteros en [GOAL_MIN, GOAL_MAX].
const sanitizeGoal = (raw) => {
    if (!Number.isInteger(raw)) return DEFAULT_GOAL;
    if (raw < GOAL_MIN || raw > GOAL_MAX) return DEFAULT_GOAL;
    return raw;
};

// Lee el flag enabled desde localStorage (cache del PATCH desde Settings).
// Default TRUE si el cache esta vacio o corrupto.
const readEnabledFromCache = () => {
    try {
        const cached = localStorage.getItem(LS_ENABLED_KEY);
        if (cached === null) return true;
        return cached === 'true';
    } catch {
        return true;
    }
};

const WaterTracker = () => {
    // [Fix 3] Pre-render basado en cache local. Si el usuario desactivo el
    // tracker en Settings, el state inicial ya es false → no flash.
    const [enabled, setEnabled] = useState(readEnabledFromCache);
    const [glasses, setGlasses] = useState(0);
    const [goal, setGoal] = useState(DEFAULT_GOAL);
    const [goalBasis, setGoalBasis] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(getLocalDateString());
    const inFlightRef = useRef(false);

    // Cargar conteo + goal + enabled del backend.
    //
    // [P3-SUPABASE-TRANSIENT-RETRY · 2026-05-16] Reintento silencioso 1 vez
    // ante 5xx / network error. Razon: el listener visibilitychange dispara
    // este GET cada vez que el usuario vuelve al tab; si la pestaña estuvo
    // en background el suficiente tiempo, la primera request puede toparse
    // con una conexion HTTPS idle muerta del lado del browser O del backend
    // → 500/503/network error. Un reintento tras 500ms casi siempre exitoso
    // (la nueva conexion es fresca). Errores 4xx (auth, validacion) NO
    // reintentan — esos son determinísticos.
    const loadIntake = useCallback(async (dateStr) => {
        const url = `/api/plans/water-intake?date=${encodeURIComponent(dateStr)}`;
        const attemptOnce = async () => {
            try {
                const res = await fetchWithAuth(url);
                return { res, networkError: null };
            } catch (e) {
                return { res: null, networkError: e };
            }
        };

        let { res, networkError } = await attemptOnce();
        const isTransient = networkError || (res && res.status >= 500);
        if (isTransient) {
            await new Promise((r) => setTimeout(r, 500));
            ({ res, networkError } = await attemptOnce());
        }

        try {
            if (networkError) {
                console.error('[WaterTracker] GET network error tras reintento', networkError);
                setGlasses(0);
                setGoal(DEFAULT_GOAL);
                setGoalBasis(null);
                return;
            }
            if (!res.ok) {
                if (res.status !== 401) {
                    console.error('[WaterTracker] GET failed', res.status);
                }
                setGlasses(0);
                setGoal(DEFAULT_GOAL);
                setGoalBasis(null);
                return;
            }
            const data = await res.json();
            setGlasses(Number.isInteger(data?.glasses) ? data.glasses : 0);
            setGoal(sanitizeGoal(data?.goal));
            setGoalBasis(data?.goal_basis || null);
            // El endpoint /water-intake incluye `enabled` desde 2026-05-16.
            if (typeof data?.enabled === 'boolean') {
                setEnabled(data.enabled);
                try { localStorage.setItem(LS_ENABLED_KEY, String(data.enabled)); }
                catch { /* localStorage no critico */ }
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }
        loadIntake(currentDate);
    }, [currentDate, loadIntake, enabled]);

    // Watcher de rollover de medianoche (60s).
    useEffect(() => {
        if (!enabled) return undefined;
        const interval = setInterval(() => {
            const today = getLocalDateString();
            if (today !== currentDate) {
                setCurrentDate(today);
            }
        }, 60 * 1000);
        return () => clearInterval(interval);
    }, [currentDate, enabled]);

    // [Fix 3] Cross-tab: re-GET cuando el tab vuelve a ser visible
    // (cubre cambios de peso en otra tab + cambios del toggle del Settings)
    // + listener de storage event para reaccionar al toggle inmediatamente.
    // + listener de custom event `mealfit:refresh-hydration` que el chat
    //   agent dispara tras log_water_glass (refresca el card sin nav).
    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === 'visible' && enabled) {
                loadIntake(getLocalDateString());
            }
        };
        const onStorage = (e) => {
            if (e.key === LS_ENABLED_KEY) {
                const newVal = e.newValue === 'true';
                setEnabled(newVal);
            }
        };
        const onAgentRefresh = () => {
            if (enabled) {
                loadIntake(getLocalDateString());
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('storage', onStorage);
        window.addEventListener('mealfit:refresh-hydration', onAgentRefresh);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('mealfit:refresh-hydration', onAgentRefresh);
        };
    }, [enabled, loadIntake]);

    const persistGlasses = useCallback(async (newCount) => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        const prev = glasses;
        setGlasses(newCount);
        // [P3-SUPABASE-TRANSIENT-RETRY · 2026-05-16] POST es idempotente
        // (backend hace upsert sobre PK `(user_id, log_date)`). Reintento
        // silencioso 1 vez tras 500ms en 5xx/network error evita el toast
        // "No pudimos guardar" en blips transient. 4xx (401/400) NO se
        // reintentan — son determinísticos.
        const body = JSON.stringify({ date: currentDate, glasses: newCount });
        const attemptOnce = async () => {
            try {
                const res = await fetchWithAuth('/api/plans/water-intake', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                });
                return { res, networkError: null };
            } catch (e) {
                return { res: null, networkError: e };
            }
        };
        try {
            let { res, networkError } = await attemptOnce();
            const isTransient = networkError || (res && res.status >= 500);
            if (isTransient) {
                await new Promise((r) => setTimeout(r, 500));
                ({ res, networkError } = await attemptOnce());
            }

            if (networkError) {
                console.error('[WaterTracker] POST network error tras reintento', networkError);
                setGlasses(prev);
                toast.error('Sin conexion. Intenta de nuevo.');
                return;
            }
            if (!res.ok) {
                setGlasses(prev);
                if (res.status === 401) {
                    toast.error('Inicia sesion para guardar tu hidratacion.');
                } else {
                    toast.error('No pudimos guardar. Intenta de nuevo.');
                }
                return;
            }
            const data = await res.json().catch(() => null);
            if (data) {
                if (Number.isInteger(data.goal)) setGoal(sanitizeGoal(data.goal));
                if (data.goal_basis) setGoalBasis(data.goal_basis);
            }
            if (newCount >= goal && prev < goal) {
                toast.success('Meta de hidratacion alcanzada.');
            }
        } finally {
            inFlightRef.current = false;
        }
    }, [glasses, currentDate, goal]);

    const handleGlassClick = useCallback((index) => {
        if (loading) return;
        const target = index + 1;
        if (glasses === target) {
            persistGlasses(index);
        } else {
            persistGlasses(target);
        }
    }, [glasses, loading, persistGlasses]);

    // Layout responsivo: hasta 8 vasos → 1 fila; 9-14 → 2 filas balanceadas.
    const columnsPerRow = useMemo(
        () => (goal <= 8 ? goal : Math.ceil(goal / 2)),
        [goal],
    );

    const percentage = Math.min(100, Math.round((glasses / goal) * 100));
    const reachedGoal = glasses >= goal;

    // [Fix 1] Subtitulo dinamico — copy mas afirmativo para que el usuario
    // SEPA que su meta es personalizada (especialmente cuando coincide con
    // 8 por casualidad). Muestra peso + nivel de actividad si disponibles.
    const subtitle = useMemo(() => {
        const isPersonalized = goalBasis && !goalBasis.default && goalBasis.weight_kg;
        if (reachedGoal) {
            if (isPersonalized) {
                const w = goalBasis.weight_kg;
                const wStr = Number.isInteger(w) ? String(w) : w.toFixed(1).replace(/\.0$/, '');
                return `Meta alcanzada · personalizada para ${wStr} kg`;
            }
            return 'Meta del dia alcanzada';
        }
        const base = `${glasses} de ${goal} vasos hoy`;
        if (isPersonalized) {
            const w = goalBasis.weight_kg;
            const wStr = Number.isInteger(w) ? String(w) : w.toFixed(1).replace(/\.0$/, '');
            return `${base} · personalizado para ${wStr} kg`;
        }
        return base;
    }, [glasses, goal, goalBasis, reachedGoal]);

    // [Fix 3] Gate por toggle del Settings. Si el usuario desactivo el
    // tracker, no renderizamos nada (ni siquiera placeholder).
    if (!enabled) return null;

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.5) 100%)',
            backdropFilter: 'blur(12px)',
            padding: '1.75rem',
            borderRadius: '2rem',
            border: '1.5px solid rgba(203, 213, 225, 0.8)',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08), 0 0 0 1px rgba(148, 163, 184, 0.05)',
            marginBottom: '2rem',
            width: '100%',
            boxSizing: 'border-box'
        }}>
            <h3 style={{
                fontSize: '1.2rem', fontWeight: 800, color: '#0F172A',
                marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem'
            }}>
                <div style={{ background: '#EFF6FF', padding: '0.4rem', borderRadius: '0.75rem', color: '#2563EB' }}>
                    <GlassWater size={22} strokeWidth={2.5} />
                </div>
                Hidratacion
            </h3>
            <p style={{
                fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)',
                marginBottom: '1.25rem', lineHeight: 1.4, textAlign: 'center',
                paddingLeft: '0.5rem', paddingRight: '0.5rem'
            }}>
                {subtitle}
            </p>

            <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
                gap: '0.5rem',
                justifyItems: 'center',
                alignItems: 'center',
                maxWidth: '420px',
                margin: '0 auto'
            }}>
                {Array.from({ length: goal }).map((_, i) => {
                    const isFilled = i < glasses;
                    return (
                        <motion.button
                            key={i}
                            whileHover={{ scale: 1.08 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleGlassClick(i)}
                            disabled={loading}
                            aria-label={isFilled ? `Vaso ${i + 1} lleno. Toca para vaciar.` : `Vaso ${i + 1} vacio. Toca para llenar.`}
                            style={{
                                background: isFilled
                                    ? 'linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%)'
                                    : '#F1F5F9',
                                border: isFilled ? '1.5px solid #2563EB' : '1.5px solid #CBD5E1',
                                borderRadius: '0.85rem',
                                width: '100%',
                                aspectRatio: '1 / 1.15',
                                maxWidth: '44px',
                                cursor: loading ? 'progress' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                                transition: 'background 0.25s ease, border 0.25s ease',
                                padding: 0,
                                boxShadow: isFilled ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'inset 0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <GlassWater
                                size={20}
                                strokeWidth={2.2}
                                color={isFilled ? '#FFFFFF' : '#94A3B8'}
                            />
                            <AnimatePresence>
                                {reachedGoal && i === goal - 1 && (
                                    <motion.div
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0, opacity: 0 }}
                                        style={{
                                            position: 'absolute',
                                            top: '-6px',
                                            right: '-6px',
                                            background: '#10B981',
                                            borderRadius: '999px',
                                            padding: '2px',
                                            display: 'flex',
                                            border: '2px solid #FFFFFF'
                                        }}
                                    >
                                        <Check size={10} color="#FFFFFF" strokeWidth={3} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.button>
                    );
                })}
            </div>

            <div style={{
                marginTop: '1.25rem',
                width: '100%',
                maxWidth: '420px',
                margin: '1.25rem auto 0',
                height: '4px',
                background: '#E2E8F0',
                borderRadius: '999px',
                overflow: 'hidden'
            }}>
                <motion.div
                    initial={false}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    style={{
                        height: '100%',
                        background: reachedGoal
                            ? 'linear-gradient(90deg, #10B981 0%, #06B6D4 100%)'
                            : 'linear-gradient(90deg, #3B82F6 0%, #06B6D4 100%)',
                        borderRadius: '999px'
                    }}
                />
            </div>
        </div>
    );
};

export default WaterTracker;
