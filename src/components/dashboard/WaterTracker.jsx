// [P3-WATER-TRACKER · 2026-05-16 · P3-WATER-HALF-GLASS · 2026-06-24] Tracker
// diario de hidratacion, rediseñado como "HydrationCard".
//
// Diseño: vaso animado (olas) con % · vasos · litros; vasos tactiles (clic llena
// hasta ahi, clic en el ultimo lleno baja uno); atajos Sorbo (½ vaso) / Vaso /
// Botella; stepper de ½; reiniciar; racha de dias. Soporta MEDIOS VASOS (0.5).
//
// Capa de datos (conservada del tracker original):
//   - Toggle desde Preferencias (`water_tracker_enabled`): si false → null.
//   - Meta diaria PERSONALIZADA: el backend deriva el goal desde
//     `health_profile.weight + activityLevel` (35ml/kg + bonus). Rango [6,14].
//   - Persistencia: endpoints backend `/api/plans/water-intake` (GET mount,
//     POST tras cada cambio). Optimistic UI + coalescing de taps rapidos.
//   - Reset a medianoche local (cliente envia fecha local YYYY-MM-DD).
//   - Cross-tab: visibilitychange + storage + evento `mealfit:refresh-hydration`.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import styles from './WaterTracker.module.css';

const DEFAULT_GOAL = 8;
const GOAL_MIN = 6;
const GOAL_MAX = 14;
const ML_PER_GLASS_FALLBACK = 240; // espeja backend _WATER_ML_PER_GLASS
const LS_ENABLED_KEY = 'mealfit_water_tracker_enabled';
const LS_WATER_CACHE_PREFIX = 'mealfit_water_state_';

const _waterCacheKey = (userId, dateStr) =>
    userId ? `${LS_WATER_CACHE_PREFIX}${userId}_${dateStr}` : null;

// Fecha local YYYY-MM-DD (NO UTC). Evita off-by-one cerca de medianoche.
const getLocalDateString = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// Sanea el goal del backend: solo enteros en [GOAL_MIN, GOAL_MAX].
const sanitizeGoal = (raw) => {
    if (!Number.isInteger(raw)) return DEFAULT_GOAL;
    if (raw < GOAL_MIN || raw > GOAL_MAX) return DEFAULT_GOAL;
    return raw;
};

const readEnabledFromCache = () => {
    try {
        const cached = localStorage.getItem(LS_ENABLED_KEY);
        if (cached === null) return true;
        return cached === 'true';
    } catch {
        return true;
    }
};

const readWaterStateFromCache = (userId) => {
    try {
        const key = _waterCacheKey(userId, getLocalDateString());
        if (!key) return null;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.glasses !== 'number' || typeof parsed.goal !== 'number') return null;
        return parsed;
    } catch {
        return null;
    }
};

const WaterTracker = ({ userId }) => {
    const [enabled, setEnabled] = useState(readEnabledFromCache);
    const _cachedState = useMemo(() => readWaterStateFromCache(userId), [userId]);
    const [glasses, setGlasses] = useState(() => _cachedState?.glasses ?? 0);
    const [goal, setGoal] = useState(() => _cachedState?.goal ?? DEFAULT_GOAL);
    const [goalBasis, setGoalBasis] = useState(() => _cachedState?.goalBasis ?? null);
    const [streak, setStreak] = useState(() => _cachedState?.streak ?? 0);
    const [loading, setLoading] = useState(() => _cachedState === null);
    const [currentDate, setCurrentDate] = useState(getLocalDateString());

    const inFlightRef = useRef(false);
    const pendingTargetRef = useRef(null);
    // Valores autoritativos (refs) para sumas rapidas sin esperar el re-render
    // y para revertir al ultimo valor confirmado por el servidor.
    const glassesRef = useRef(_cachedState?.glasses ?? 0);
    const lastSavedRef = useRef(_cachedState?.glasses ?? 0);
    const goalRef = useRef(_cachedState?.goal ?? DEFAULT_GOAL);
    useEffect(() => { goalRef.current = goal; }, [goal]);

    // Persistir state al cache (key con fecha → TTL implícito 24h + rollover).
    useEffect(() => {
        try {
            const key = _waterCacheKey(userId, currentDate);
            if (!key) return;
            localStorage.setItem(key, JSON.stringify({ glasses, goal, goalBasis, streak }));
        } catch { /* QuotaExceeded — fail-open */ }
    }, [glasses, goal, goalBasis, streak, currentDate, userId]);

    // Cargar conteo + goal + streak + enabled del backend (1 reintento en 5xx/net).
    const loadIntake = useCallback(async (dateStr) => {
        const url = `/api/plans/water-intake?date=${encodeURIComponent(dateStr)}`;
        const attemptOnce = async () => {
            try { return { res: await fetchWithAuth(url), networkError: null }; }
            catch (e) { return { res: null, networkError: e }; }
        };
        let { res, networkError } = await attemptOnce();
        if (networkError || (res && res.status >= 500)) {
            await new Promise((r) => setTimeout(r, 500));
            ({ res, networkError } = await attemptOnce());
        }
        try {
            if (networkError || !res.ok) {
                if (res && res.status !== 401) console.error('[WaterTracker] GET failed', res.status);
                setGlasses(0); glassesRef.current = 0; lastSavedRef.current = 0;
                setGoal(DEFAULT_GOAL); setGoalBasis(null); setStreak(0);
                return;
            }
            const data = await res.json();
            // [P3-WATER-HALF-GLASS] glasses puede ser fraccionario (0.5).
            const g = typeof data?.glasses === 'number' ? data.glasses : 0;
            setGlasses(g); glassesRef.current = g; lastSavedRef.current = g;
            setGoal(sanitizeGoal(data?.goal));
            setGoalBasis(data?.goal_basis || null);
            if (typeof data?.streak === 'number') setStreak(data.streak);
            if (typeof data?.enabled === 'boolean') {
                setEnabled(data.enabled);
                try { localStorage.setItem(LS_ENABLED_KEY, String(data.enabled)); } catch { /* no critico */ }
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!enabled) { setLoading(false); return; }
        loadIntake(currentDate);
    }, [currentDate, loadIntake, enabled, userId]);

    // Watcher de rollover de medianoche (60s, pausado en background).
    useEffect(() => {
        if (!enabled) return undefined;
        const interval = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            const today = getLocalDateString();
            if (today !== currentDate) setCurrentDate(today);
        }, 60 * 1000);
        return () => clearInterval(interval);
    }, [currentDate, enabled]);

    // Cross-tab: re-GET al volver al tab + toggle de Settings + refresh del agente.
    useEffect(() => {
        const onVisibility = () => { if (document.visibilityState === 'visible' && enabled) loadIntake(getLocalDateString()); };
        const onStorage = (e) => { if (e.key === LS_ENABLED_KEY) setEnabled(e.newValue === 'true'); };
        const onAgentRefresh = () => { if (enabled) loadIntake(getLocalDateString()); };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('storage', onStorage);
        window.addEventListener('mealfit:refresh-hydration', onAgentRefresh);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('mealfit:refresh-hydration', onAgentRefresh);
        };
    }, [enabled, loadIntake]);

    // POST con reintento. Coalesce: si llega un cambio mientras hay POST en
    // vuelo, guardamos el ultimo target y lo enviamos al terminar (taps rapidos
    // no se pierden). Revert al ultimo valor confirmado si el POST falla.
    const flushPersist = useCallback(async (target) => {
        inFlightRef.current = true;
        const prevSaved = lastSavedRef.current;
        const body = JSON.stringify({ date: currentDate, glasses: target });
        const attemptOnce = async () => {
            try {
                const res = await fetchWithAuth('/api/plans/water-intake', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
                });
                return { res, networkError: null };
            } catch (e) { return { res: null, networkError: e }; }
        };
        try {
            let { res, networkError } = await attemptOnce();
            if (networkError || (res && res.status >= 500)) {
                await new Promise((r) => setTimeout(r, 500));
                ({ res, networkError } = await attemptOnce());
            }
            if (networkError) {
                setGlasses(prevSaved); glassesRef.current = prevSaved;
                toast.error('Sin conexión. Intenta de nuevo.');
                return;
            }
            if (!res.ok) {
                setGlasses(prevSaved); glassesRef.current = prevSaved;
                toast.error(res.status === 401 ? 'Inicia sesión para guardar tu hidratación.' : 'No pudimos guardar. Intenta de nuevo.');
                return;
            }
            const data = await res.json().catch(() => null);
            lastSavedRef.current = target;
            if (data) {
                if (Number.isInteger(data.goal)) setGoal(sanitizeGoal(data.goal));
                if (data.goal_basis) setGoalBasis(data.goal_basis);
            }
            if (target >= goalRef.current && prevSaved < goalRef.current) {
                toast.success('¡Meta de hidratación alcanzada!');
            }
        } finally {
            inFlightRef.current = false;
            if (pendingTargetRef.current !== null) {
                const next = pendingTargetRef.current;
                pendingTargetRef.current = null;
                if (next !== target) flushPersist(next);
            }
        }
    }, [currentDate]);

    // Setea un valor absoluto (clamp [0, goal]) optimista + persiste coalescido.
    const persist = useCallback((rawTarget) => {
        const target = Math.max(0, Math.min(goalRef.current, rawTarget));
        glassesRef.current = target;
        setGlasses(target);
        if (inFlightRef.current) { pendingTargetRef.current = target; return; }
        flushPersist(target);
    }, [flushPersist]);

    const add = useCallback((n) => { if (!loading) persist(glassesRef.current + n); }, [persist, loading]);
    const setTo = useCallback((n) => { if (!loading) persist(n); }, [persist, loading]);

    // Layout responsivo de los vasos: hasta 8 → 1 fila; 9-14 → 2 filas.
    const columnsPerRow = useMemo(() => (goal <= 8 ? goal : Math.ceil(goal / 2)), [goal]);

    const mlPerGlass = useMemo(() => {
        const computed = goalBasis?.computed_ml;
        if (typeof computed === 'number' && computed > 0 && goal > 0) return Math.round(computed / goal);
        return ML_PER_GLASS_FALLBACK;
    }, [goalBasis, goal]);
    const goalMl = mlPerGlass * goal;

    const pct = goal > 0 ? Math.min(100, Math.round((glasses / goal) * 100)) : 0;
    const complete = glasses >= goal;
    const liters = (ml) =>
        (ml / 1000).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' L';
    const fmtGlasses = glasses % 1 ? glasses.toString().replace('.', ',') : String(glasses);

    // Subtítulo: menciona el peso cuando la meta viene de la fórmula personalizada.
    const isPersonalized = !!(goalBasis && !goalBasis.default && goalBasis.weight_kg);

    if (!enabled) return null;

    return (
        <section className={`${styles.card} ${complete ? styles.complete : ''}`} aria-label="Hidratación">
            <div className={styles.inner}>
                {/* Vaso animado */}
                <div className={styles.vessel}>
                    <div className={styles.glass}>
                        <div className={styles.water} style={{ height: `${pct}%` }}>
                            <div className={styles.waveWrap} aria-hidden="true">
                                <svg viewBox="0 0 120 15" preserveAspectRatio="none">
                                    <path className={styles.wave1} d="M0 8 Q15 0 30 8 T60 8 T90 8 T120 8 V15 H0 Z" />
                                    <path className={styles.wave2} d="M0 9 Q15 2 30 9 T60 9 T90 9 T120 9 V15 H0 Z" />
                                </svg>
                            </div>
                        </div>
                        <div className={styles.glassCenter}>
                            <span className={styles.pct}>{pct}%</span>
                            <span className={styles.pctSub}>{fmtGlasses} / {goal}</span>
                        </div>
                    </div>
                    <p className={styles.meta}>
                        <b>{liters(glasses * mlPerGlass)}</b> de {liters(goalMl)}
                    </p>
                </div>

                {/* Controles */}
                <div className={styles.body}>
                    <header className={styles.head}>
                        <span className={styles.badge} aria-hidden="true"><CupIcon /></span>
                        <div>
                            <h3 className={styles.title}>Hidratación</h3>
                            <p className={styles.sub}>
                                {isPersonalized ? (
                                    <>Meta personalizada para <b>{Number(goalBasis.weight_kg).toLocaleString('es-DO')} kg</b> · ~{mlPerGlass} ml por vaso</>
                                ) : (
                                    <>Meta diaria de <b>{goal} vasos</b> · ~{mlPerGlass} ml por vaso</>
                                )}
                            </p>
                        </div>
                    </header>

                    <div className={styles.cups} role="group" aria-label="Vasos de agua" style={{ '--cols': columnsPerRow }}>
                        {Array.from({ length: goal }, (_, i) => {
                            const fill = Math.max(0, Math.min(1, glasses - i));
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    className={`${styles.cup} ${fill >= 1 ? styles.cupFull : ''}`}
                                    aria-label={`Vaso ${i + 1}`}
                                    aria-pressed={fill >= 1}
                                    disabled={loading}
                                    onClick={() => setTo(glasses === i + 1 ? i : i + 1)}
                                >
                                    <span className={styles.cupWater} style={{ height: `${fill * 100}%` }} />
                                </button>
                            );
                        })}
                    </div>

                    <div className={styles.actions}>
                        <QuickAdd label="Sorbo" ml={Math.round(mlPerGlass / 2)} onClick={() => add(0.5)} disabled={loading || glasses >= goal} />
                        <QuickAdd label="Vaso" ml={mlPerGlass} onClick={() => add(1)} disabled={loading || glasses >= goal} />
                        <QuickAdd label="Botella" ml={mlPerGlass * 2} onClick={() => add(2)} disabled={loading || glasses >= goal} />
                        <div className={styles.stepper}>
                            <button type="button" onClick={() => add(-0.5)} disabled={loading || glasses <= 0} aria-label="Quitar medio vaso">
                                <MinusIcon />
                            </button>
                            <button type="button" onClick={() => add(0.5)} disabled={loading || glasses >= goal} aria-label="Agregar medio vaso">
                                <PlusIcon />
                            </button>
                        </div>
                    </div>

                    {complete ? (
                        <div className={styles.done}>
                            <CheckIcon /> ¡Meta cumplida! Excelente hidratación hoy.
                        </div>
                    ) : (
                        <div className={styles.foot}>
                            {streak > 0 ? (
                                <span className={styles.streak}>
                                    <DropIcon /> Racha de {streak} {streak === 1 ? 'día' : 'días'}
                                </span>
                            ) : <span />}
                            <button type="button" className={styles.reset} onClick={() => setTo(0)} disabled={loading || glasses <= 0}>
                                <ResetIcon /> Reiniciar
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

function QuickAdd({ label, ml, onClick, disabled }) {
    return (
        <button type="button" className={styles.chip} onClick={onClick} disabled={disabled}>
            <PlusIcon /> {label} <small>{ml} ml</small>
        </button>
    );
}

/* — Iconos (línea, currentColor) — */
const CupIcon = () => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h12l-1.2 16.2A2 2 0 0 1 14.8 21H9.2a2 2 0 0 1-2-1.8L6 3Z" />
        <path d="M6.4 8.5h11.2" />
        <path d="M9.5 13.2c1.2 0 1.2 1.2 2.5 1.2s1.3-1.2 2.5-1.2" />
    </svg>
);
const PlusIcon = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
);
const MinusIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>
);
const CheckIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const DropIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2.5S5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5Z" /></svg>
);
const ResetIcon = () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" /></svg>
);

export default WaterTracker;
