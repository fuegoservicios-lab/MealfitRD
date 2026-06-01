import { useState, useEffect, useCallback } from 'react';
import { Flame, Dumbbell, Wheat, Droplet, Activity, Camera } from 'lucide-react';
import PropTypes from 'prop-types';
import { useAssessment } from '../../context/AssessmentContext';
import { fetchWithAuth } from '../../config/api';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import ProteinIcon from '../icons/ProteinIcon';
import WheatFilledIcon from '../icons/WheatFilledIcon';
import FlameMacroIcon from '../icons/FlameMacroIcon';
import FatDropIcon from '../icons/FatDropIcon';
import { isDarkActive } from '../../utils/theme';
// [P2-DIARY-SCAN-MACROS · 2026-05-30] Modal "Escanear comida → registrar macros".
import ScanMealModal from './ScanMealModal';
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

    // [P2-DIARY-SCAN-MACROS · 2026-05-30] Estado del modal de escaneo. Al
    // registrar una comida el modal dispara `mealfit:refresh-inventory`, que
    // el effect de abajo ya escucha → las barras se actualizan solas.
    const [scanOpen, setScanOpen] = useState(false);
    const isLoggedIn = !!userId && userId !== 'guest';

    // [P2-DASH-SCAN-ONCLOSE-MEMO · 2026-05-30] `onClose` memoizado. Pre-fix se
    // pasaba un arrow inline `() => setScanOpen(false)` a <ScanMealModal>, que
    // crea una identidad nueva en CADA render de TrackingProgress. El hook
    // useModalAccessibility tiene `onClose` en sus deps (useModalAccessibility.js)
    // → mientras el modal está abierto y el usuario edita las macros, cualquier
    // re-render del padre (visibilitychange/`mealfit:refresh-inventory`→fetchConsumed,
    // o un re-render de Dashboard) re-ejecutaba el effect del hook: re-armaba el
    // focusTimeout que hace containerRef.focus() → ROBABA el foco del input a media
    // escritura. Misma clase que P2-HIST-MODALS-A11Y (onClose memoizado con useCallback).
    const handleScanClose = useCallback(() => setScanOpen(false), []);

    const [consumed, setConsumed] = useState(() => {
        // [P1-TRACKING-CACHE-CONSUMED · 2026-05-20]
        // [P3-TRACKING-CACHE-EMPTY-FETCH · 2026-05-27]
        // Hidratar desde localStorage si hay cache válido para este user+fecha.
        // Antes solo se persistía cuando había macros >0 — caso "user sin
        // comidas hoy" volvía a mostrar "Cargando registros..." cada vez que
        // navegaba entre tabs porque el cache nunca existía. Ahora persistimos
        // SIEMPRE tras un fetch exitoso (incluso si macros=0), usando un flag
        // `_fetched` para distinguir "datos fetcheados que dan 0" vs "default
        // initial state pre-fetch".
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
    // [P3-TRACKING-CACHE-EMPTY-FETCH · 2026-05-27] Chequea `_fetched` flag —
    // así un cache con macros=0 pero _fetched=true cuenta como "ya sé que es 0
    // para hoy, no muestro loading".
    const [loading, setLoading] = useState(() => {
        try {
            const key = _getConsumedCacheKey(userId);
            if (key) {
                const raw = safeLocalStorageGet(key, null);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed._fetched) return false;
                }
            }
        } catch (_e) { /* ignore */ }
        return true;
    });

    // [P1-TRACKING-CACHE-CONSUMED · 2026-05-20]
    // [P3-TRACKING-CACHE-EMPTY-FETCH · 2026-05-27]
    // Persist consumed al change. Persistimos SIEMPRE cuando el objeto tiene
    // el flag `_fetched: true` (post-fetch del server). El default initial
    // state NO tiene ese flag → no se persiste → no se sobreescribe el cache
    // real con un placeholder vacío.
    useEffect(() => {
        const key = _getConsumedCacheKey(userId);
        if (!key) return;
        if (!consumed || !consumed._fetched) return;
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
                        meals: data.meals || [],
                        // [P3-TRACKING-CACHE-EMPTY-FETCH · 2026-05-27] Marker
                        // que distingue "datos fetcheados (aunque sean 0)" del
                        // default initial state. El persist effect lo respeta.
                        _fetched: true,
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

    // [P3-TRACKING-OVER-LIMIT · 2026-05-20] Pre-fix `calcPerc` capeaba al 100%
    // con `Math.min(..., 100)` — ocultaba visualmente cuando el usuario excedía
    // la meta. Ahora retornamos el % real (sin cap); el ProgressBar internamente
    // recorta el ancho del fill a 100% pero usa el % real para signaling de
    // exceso (gradient rojo + número rojo + badge "+excess unit").
    const calcPerc = (val, max) => Math.round((val / max) * 100) || 0;

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
                
                {isLoggedIn ? (
                    // [P2-DIARY-SCAN-MACROS · 2026-05-30] Botón de escaneo.
                    <button
                        className={styles.scanBtn}
                        onClick={() => setScanOpen(true)}
                        type="button"
                    >
                        <Camera size={18} strokeWidth={2.5} />
                        Escanear comida
                    </button>
                ) : (
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
                    perc={percCal} icon={Flame} darkIcon={FlameMacroIcon}
                    color="#F59E0B" lightColor="#FCD34D" gradient="linear-gradient(90deg, #FCD34D 0%, #F59E0B 100%)"
                    fillIcon
                    large
                />

                <div className={styles.macroGrid}>
                    {/* Proteína */}
                    {/* [APPEARANCE-THEME · 2026-05-29] Mismo patrón que Calorías/Grasas:
                        en modo CLARO el glifo es el lucide `Dumbbell` (outline, consistente
                        con Flame/Wheat/Droplet outline); en OSCURO el `ProteinIcon`
                        (mancuerna sólida custom). Pre-fix usaba `icon={ProteinIcon}` sin
                        darkIcon → la mancuerna sólida se mostraba TAMBIÉN en claro,
                        desentonando con los demás macros outline. */}
                    <ProgressBar
                        label="Proteína"
                        consumed={consumed.protein} goal={goalPro} unit="g"
                        perc={percPro} icon={Dumbbell} darkIcon={ProteinIcon}
                        color="#3B82F6" lightColor="#93C5FD" gradient="linear-gradient(90deg, #93C5FD 0%, #3B82F6 100%)"
                    />
                    {/* Carbohidratos */}
                    <ProgressBar
                        label="Carbohidratos"
                        consumed={consumed.carbs} goal={goalCarb} unit="g"
                        perc={percCarb} icon={Wheat} color="#10B981" lightColor="#6EE7B7" gradient="linear-gradient(90deg, #6EE7B7 0%, #10B981 100%)"
                        fillWhiteStroke
                    />
                    {/* Grasas */}
                    <ProgressBar
                        label="Grasas"
                        consumed={consumed.fats} goal={goalFat} unit="g"
                        perc={percFat} icon={Droplet} darkIcon={FatDropIcon}
                        color="#EC4899" lightColor="#F9A8D4" gradient="linear-gradient(90deg, #F9A8D4 0%, #EC4899 100%)"
                        fillIcon
                    />
                </div>
            </div>

            {/* [P2-DIARY-SCAN-MACROS · 2026-05-30] Modal de escaneo. Solo se
                renderiza para usuarios logueados (el botón no aparece para
                invitados). */}
            {isLoggedIn && (
                <ScanMealModal
                    isOpen={scanOpen}
                    onClose={handleScanClose}
                    userId={userId}
                />
            )}
        </div>
    );
};

TrackingProgress.propTypes = {
    planData: PropTypes.object.isRequired,
    userId: PropTypes.string
};

// --- Componente Interno para Barra Individual ---
const ProgressBar = ({ label, consumed, goal, unit, perc, icon: Icon, darkIcon: DarkIcon, color, lightColor, gradient, large, fillIcon, fillWhiteStroke }) => {
    const isEmpty = perc === 0;
    // [APPEARANCE-THEME · 2026-05-29] Los rellenos de iconos (llama/gota sólidos,
    // trigo verde-con-líneas-blancas) son SOLO para modo oscuro. En claro se
    // conserva el diseño anterior (iconos outline). El toggle vive en Settings
    // (otra ruta) y el Dashboard re-monta al volver → snapshot siempre fresco.
    const isDark = isDarkActive();
    const doFillSolid = fillIcon && isDark;
    const doFillWhite = fillWhiteStroke && isDark;
    // [P3-TRACKING-OVER-LIMIT · 2026-05-20 · badge removido P3-TRACKING-OVER-NO-BADGE]
    // `isOver` (perc > 100, user excedió la meta) y `isComplete` (perc >= 100,
    // llegó o pasó) son conceptos separados. `isComplete` activa el glow
    // celebración a 100% exactos. `isOver` switche a gradient rojo + número rojo
    // + % uncapped dentro del fill. El badge inline "+exceso unit" del cierre
    // original fue removido por feedback del user el mismo día: el color +
    // el % uncapped (e.g., "107%") ya comunican el exceso sin texto adicional.
    const isOver = perc > 100;
    const isComplete = perc >= 100;
    // [P3-TRACKING-FILL-MIN-VISUAL · 2026-05-22] Piso visual del fillWidth.
    // Pre-fix: `Math.min(perc, 100)` mapeaba 1:1 entre % y ancho del fill.
    // Cuando perc era bajo (proteína 7% inicio del día), el fill mide ~7% del
    // track (~25-30px en desktop) y el badge "7%" no cabía cómodo aunque el
    // texto se desbordara hacia el track con text-shadow doble layer
    // (P3-TRACKING-PERC-INSIDE-ALWAYS) — el user reportó que aún se veía mal.
    //
    // Fix: si el % real es > 0 pero el fillWidth proporcional es menor a
    // `_FILL_VISUAL_MIN` (18%), el fill se renderea con 18% visual width —
    // suficiente para que el badge `{perc}%` quepa dentro cómodo. El número
    // mostrado SIGUE siendo el real (e.g., "7%"), no la magnitud falseada.
    //
    // Trade-off: visual deja de ser 1:1 entre % y ancho. Aceptable porque:
    //   (a) El número numérico ("11 / 158 g") muestra la magnitud real cruda.
    //   (b) El badge "7%" dentro del fill comunica el % real con precisión.
    //   (c) El user explícitamente pidió esta solución: "subir la barra de
    //       los números mínimos para que se pueda visualizar".
    const _FILL_VISUAL_MIN = 18;
    const _percCapped = Math.min(perc, 100);
    const fillWidth = perc <= 0 ? 0 : Math.max(_percCapped, _FILL_VISUAL_MIN);

    // Paleta rojo (Tailwind red-300/600) sobre meta excedida.
    const OVER_GRADIENT = 'linear-gradient(90deg, #FCA5A5 0%, #DC2626 100%)';
    const OVER_COLOR = '#DC2626';
    const effectiveGradient = isOver ? OVER_GRADIENT : gradient;
    const effectiveGlowColor = isOver ? OVER_COLOR : color;
    const consumedTextColor = isOver
        ? OVER_COLOR
        // [APPEARANCE-THEME · 2026-05-29] En oscuro, el "0" vacío en text-light
        // (#64748B) quedaba muy apagado → text-muted (#94A3B8) se lee mejor sin
        // perder el matiz de "sin progreso". En claro se mantiene text-light.
        : (isEmpty ? (isDark ? 'var(--text-muted)' : 'var(--text-light)') : 'var(--text-main)');

    // [APPEARANCE-THEME · 2026-05-29] Selección del glifo (extraída a variable
    // por legibilidad y para evitar el falso positivo de jsx-uses-vars con
    // ternario anidado). Modos:
    //   · doFillWhite (trigo, solo dark) → WheatFilledIcon two-tone.
    //   · darkIcon (llama/gota, solo dark) → glifo custom de dos tonos glossy.
    //   · default / modo claro → icono lucide outline original.
    // [APPEARANCE-THEME · 2026-05-29] Tamaño ÚNICO para todos los glifos (todos
    // los íconos custom llenan el viewBox 24×24, así que un mismo `size` los
    // hace lucir del mismo tamaño). large = barra principal de Calorías.
    const iconSize = large ? 22 : 18;
    let renderedIcon;
    if (doFillWhite) {
        renderedIcon = <WheatFilledIcon size={iconSize} />;
    } else if (isDark && DarkIcon) {
        renderedIcon = <DarkIcon size={iconSize} />;
    } else {
        renderedIcon = (
            <Icon
                size={iconSize}
                strokeWidth={2.5}
                fill={doFillSolid ? 'currentColor' : 'none'}
            />
        );
    }

    return (
        <div className={large ? styles.barLarge : styles.barSmall}>
            <div className={styles.barHeader}>
                <div className={styles.barLabelGroup}>
                    <div
                        className={styles.barIcon}
                        style={{
                            width: large ? 38 : 32,
                            height: large ? 38 : 32,
                            // [APPEARANCE-THEME · 2026-05-29] Chip más vibrante en
                            // oscuro: gradiente con más saturación (20→30% vs 10→15%)
                            // + ring/glow del color → resalta sobre el fondo slate.
                            // En claro se conserva el tinte sutil original.
                            background: isDark
                                ? `linear-gradient(135deg, ${color}33 0%, ${color}4D 100%)`
                                : `linear-gradient(135deg, ${color}1A 0%, ${color}26 100%)`,
                            // En oscuro el icono usa el tono CLARO del macro → más
                            // brillo y contraste contra el chip. En claro, el color base.
                            color: (isDark && lightColor) ? lightColor : color,
                            boxShadow: isDark
                                ? `inset 0 0 0 1px ${color}66, 0 3px 12px -3px ${color}80`
                                : `inset 0 0 0 1px ${color}26`,
                        }}
                    >
                        {renderedIcon}
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
                            color: consumedTextColor
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
                    background: 'var(--bg-muted)',
                    // [P3-TRACKING-OVER-LIMIT · 2026-05-20] Ring rojo sutil
                    // alrededor del track cuando over — refuerza el signaling
                    // sin sobrecargar la card con un border permanente.
                    borderColor: isOver ? 'rgba(220, 38, 38, 0.35)' : undefined,
                }}
            >
                <div
                    className={styles.fill}
                    style={{
                        width: `${fillWidth}%`,
                        background: effectiveGradient,
                        boxShadow: isOver
                            ? `0 0 14px rgba(220, 38, 38, 0.45)`
                            : (isComplete ? `0 0 12px ${effectiveGlowColor}66` : 'none')
                    }}
                />
                {/* [P3-TRACKING-BAR-INLINE-PERC · 2026-05-20] % blanco dentro
                    del fill (estilo carga de batería). Aplicado universalmente
                    (desktop + mobile) tras P3-TRACKING-PERC-DESKTOP.
                    [P3-TRACKING-OVER-LIMIT · 2026-05-20] El % mostrado es el
                    real (uncapped) — ej. "107%" cuando se excedió.
                    [P3-TRACKING-PERC-INSIDE-ALWAYS · 2026-05-22] El badge se
                    mantiene como sibling del `.fill` (dentro del `.track` con
                    overflow hidden), posicionado absoluto con `left: ${fillWidth}%`
                    + `transform: translateX(-100%)` que ALINEA su borde derecho
                    al borde derecho del fill. Cuando el fill es estrecho
                    (proteína 7% inicio del día), el texto desborda hacia la
                    IZQUIERDA del fill quedando parcialmente sobre el track
                    gris — un text-shadow fuerte (doble layer dark) garantiza
                    contraste sobre el track gris claro (#E2E8F0) y sobre los 4
                    gradients del fill. Eliminada la variante outside que el
                    user rechazó visualmente — battery style consistente. */}
                {!isEmpty && (
                    <span
                        className={styles.fillPerc}
                        style={{ left: `${fillWidth}%` }}
                    >
                        {perc}%
                    </span>
                )}
            </div>

            {!isEmpty && (
                <div className={styles.percRow}>
                    <span
                        className={styles.percChip}
                        style={{
                            color: effectiveGlowColor,
                            background: isOver
                                ? 'rgba(220, 38, 38, 0.10)'
                                : `${color}14`
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
    darkIcon: PropTypes.elementType,
    color: PropTypes.string,
    lightColor: PropTypes.string,
    gradient: PropTypes.string,
    large: PropTypes.bool,
    fillIcon: PropTypes.bool,
    fillWhiteStroke: PropTypes.bool
};

export default TrackingProgress;
