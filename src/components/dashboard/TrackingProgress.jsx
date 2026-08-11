import { useState, useEffect, useCallback, useMemo } from 'react';
import { Flame, Dumbbell, Wheat, Droplet, Activity, Camera, Flag, Trash2, Loader2 } from 'lucide-react';
import PropTypes from 'prop-types';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
// [P1-DIARY-HISTORY · 2026-07-31] Esta card es SOLO hoy; el coach registra
// hacia atras con `days_ago`. Sin esta puerta, una comida bien registrada
// en otro dia no tiene NINGUNA superficie donde verse.
import DiaryHistory, { DiaryHistoryTrigger } from './DiaryHistory';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import { confirmToast } from '../../utils/confirmToast';
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

// [P1-DIARY-EDITABLE · 2026-07-28] Lista de comidas registradas hoy dentro de
// la card. Antes esta card solo exponía `consumed.meals.length` (el conteo);
// el diario era de facto write-only — el usuario no podía ver QUÉ registró
// ni deshacer un tap equivocado. `meal_type` viaja como uno de los 5 valores
// que emite el backend (`tools.py::_normalize_meal_type` + `ScanMealModal`
// `_MEAL_TYPES`) — fallback capitalizado defensivo por si un valor legacy
// distinto se cuela.
const _MEAL_TYPE_LABELS = {
    desayuno: 'Desayuno',
    almuerzo: 'Almuerzo',
    cena: 'Cena',
    merienda: 'Merienda',
    snack: 'Snack',
};

const _mealTypeLabel = (mealType) => {
    if (!mealType) return 'Comida';
    return _MEAL_TYPE_LABELS[mealType] || (mealType.charAt(0).toUpperCase() + mealType.slice(1));
};

// Cap de filas visibles antes de requerir "Ver más" — evita que la card
// crezca sin límite en un día con muchas comidas/snacks registrados.
const _MEALS_VISIBLE_CAP = 4;

// [P1-DAILY-NOT-CYCLE · 2026-07-28] La key ya NO lleva un segmento de ciclo de
// plan. `_getPlanTrackingStartIso` (el helper que lo producía) fue eliminado —
// era el mismo error de fondo que el filtro de abajo: una frontera de CICLO
// DE PLAN usada para acotar algo que es de DÍA. Restaura, en vez de debilita,
// la protección anti-flash de P1-TRACKING-CACHE-CONSUMED: antes cada
// renovación minteaba una key nunca antes vista (el segmento cambiaba) →
// cache miss garantizado → el flash de macros en 0 que ese fix existía para
// prevenir. Ver TrackingProgress.daily_not_cycle.test.jsx para el caso de
// producción (17:44 UTC / renovación 18:41 UTC, mismo día local).
const _getConsumedCacheKey = (userId) => {
    if (!userId) return null;
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return `${_CONSUMED_CACHE_KEY_PREFIX}${userId}_${dateStr}`;
};

const _readConsumedCache = (key) => {
    if (!key) return null;
    const raw = safeLocalStorageGet(key, null);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.calories !== 'number') return null;
    return { ...parsed, _cacheKey: key };
};

const _macroNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

// [P1-DAILY-NOT-CYCLE · 2026-07-28] Ya NO filtra por `cycle_start_date`. El
// backend (`GET /api/diary/consumed/{user_id}` → `db_facts.get_consumed_meals_today`)
// ya acota a `consumed_at >= <inicio del día local> AND < <fin del día local>`
// (ver `db_facts.py`) — lo que llega en `meals` YA es "hoy", punto. Un filtro
// adicional por ciclo de plan aquí solo podía RESTAR filas de un conjunto ya
// correcto: nunca agrega nada que no debiera estar. Pre-fix, ese filtro extra
// escondía comidas reales del día (una renovación de plan movía
// `cycle_start_date` a un instante posterior al de una comida ya registrada
// hoy → "0 comidas registradas hoy" con la fila viva en la DB, inalcanzable
// desde el botón de borrar de P1-DIARY-EDITABLE porque éste solo puede
// apuntar a filas que la card renderiza).
const _buildConsumedSnapshot = ({ meals, totals, cacheKey }) => {
    if (!Array.isArray(meals)) {
        return {
            calories: _macroNumber(totals?.calories),
            protein: _macroNumber(totals?.protein),
            carbs: _macroNumber(totals?.carbs),
            fats: _macroNumber(totals?.healthy_fats ?? totals?.fats),
            meals: [],
            _fetched: true,
            _cacheKey: cacheKey,
        };
    }

    return {
        calories: Math.round(meals.reduce((sum, meal) => sum + _macroNumber(meal?.calories), 0)),
        protein: Math.round(meals.reduce((sum, meal) => sum + _macroNumber(meal?.protein), 0)),
        carbs: Math.round(meals.reduce((sum, meal) => sum + _macroNumber(meal?.carbs), 0)),
        fats: Math.round(meals.reduce((sum, meal) => sum + _macroNumber(meal?.healthy_fats ?? meal?.fats), 0)),
        meals,
        _fetched: true,
        _cacheKey: cacheKey,
    };
};

const TrackingProgress = ({ planData, userId }) => {

    // [P2-DIARY-SCAN-MACROS · 2026-05-30] Estado del modal de escaneo. Al
    // registrar una comida el modal dispara `mealfit:refresh-inventory`, que
    // el effect de abajo ya escucha → las barras se actualizan solas.
    const [scanOpen, setScanOpen] = useState(false);
    const isLoggedIn = !!userId && userId !== 'guest';
    // [P1-DAILY-NOT-CYCLE · 2026-07-28] La key ya no depende de `planData` en
    // absoluto (era el único consumidor de `_getPlanTrackingStartIso`, ahora
    // eliminado) — solo de `userId` + fecha de hoy.
    const consumedCacheKey = useMemo(() => _getConsumedCacheKey(userId), [userId]);

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

    // [P1-DIARY-EDITABLE · 2026-07-28] Estado de la lista de comidas de hoy.
    // `mealsExpanded` levanta el cap de `_MEALS_VISIBLE_CAP` filas visibles.
    // `deletingMealId` deshabilita el botón de LA fila en vuelo (no todas)
    // para que un doble-tap no dispare dos DELETE del mismo id.
    const [mealsExpanded, setMealsExpanded] = useState(false);
    const [deletingMealId, setDeletingMealId] = useState(null);

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
            const cached = _readConsumedCache(consumedCacheKey);
            if (cached) return cached;
        } catch (_e) { /* fail-open al default */ }
        return { ..._CONSUMED_DEFAULT, _cacheKey: consumedCacheKey };
    });
    // Loading inicial false si hidratamos del cache (no mostrar spinner si
    // ya hay datos visibles); true solo si arrancamos con default vacío.
    // [P3-TRACKING-CACHE-EMPTY-FETCH · 2026-05-27] Chequea `_fetched` flag —
    // así un cache con macros=0 pero _fetched=true cuenta como "ya sé que es 0
    // para hoy, no muestro loading".
    const [loading, setLoading] = useState(() => {
        try {
            const cached = _readConsumedCache(consumedCacheKey);
            if (cached?._fetched) return false;
        } catch (_e) { /* ignore */ }
        return true;
    });

    useEffect(() => {
        try {
            const cached = _readConsumedCache(consumedCacheKey);
            if (cached) {
                setConsumed(cached);
                setLoading(!cached._fetched);
                return;
            }
        } catch (_e) { /* ignore */ }
        setConsumed({ ..._CONSUMED_DEFAULT, _cacheKey: consumedCacheKey });
        setLoading(true);
    }, [consumedCacheKey]);

    // [P1-TRACKING-CACHE-CONSUMED · 2026-05-20]
    // [P3-TRACKING-CACHE-EMPTY-FETCH · 2026-05-27]
    // Persist consumed al change. Persistimos SIEMPRE cuando el objeto tiene
    // el flag `_fetched: true` (post-fetch del server). El default initial
    // state NO tiene ese flag → no se persiste → no se sobreescribe el cache
    // real con un placeholder vacío.
    useEffect(() => {
        const key = consumedCacheKey;
        if (!key) return;
        if (!consumed || !consumed._fetched) return;
        if (consumed._cacheKey !== key) return;
        try {
            safeLocalStorageSet(key, JSON.stringify(consumed));
        } catch (_e) { /* ignore */ }
    }, [consumed, consumedCacheKey]);

    // [P1-TODAY-REMAINING · 2026-07-28] Notifica el snapshot de HOY vía
    // CustomEvent — "Tu Menú" (Dashboard.jsx) necesita la MISMA lista de
    // comidas registradas hoy para atenuar la card cuyo slot ya se comió,
    // pero esta card ya es dueña del fetch + cache + delete de
    // `consumed_meals`. En vez de que el Menú pegue una SEGUNDA vez a
    // `GET /api/diary/consumed/{userId}` (fetch duplicado, dos fuentes de
    // verdad que pueden divergir tras un delete), el Menú escucha este
    // evento. Se dispara con CADA cambio de `consumed` — fetch inicial,
    // refetch por `mealfit:refresh-inventory`/visibilitychange, Y delete
    // optimista — así el Menú siempre ve la misma verdad que esta card.
    useEffect(() => {
        if (!consumed?._fetched) return;
        try {
            window.dispatchEvent(new CustomEvent('mealfit:today-consumed-updated', {
                detail: { meals: consumed.meals || [] },
            }));
        } catch (_e) { /* best-effort */ }
    }, [consumed]);

    // [P1-DAILY-NOT-CYCLE · 2026-07-28] Sweep one-shot de keys huérfanas.
    // Antes de este fix la key llevaba un segmento de ciclo de plan — cada
    // renovación minteaba una key nueva que nunca se borraba, acumulando
    // contra la cuota de localStorage del origin indefinidamente. La key ya
    // no varía con el plan, así que esto deja de crecer desde ahora, pero las
    // keys viejas ya escritas siguen ahí — se barren una vez al montar.
    // `safeLocalStorage.js` no expone un enumerador, así que leemos
    // `window.localStorage` crudo, con try/catch defensivo (mismo patrón que
    // el resto del módulo).
    useEffect(() => {
        if (!consumedCacheKey) return;
        try {
            const stale = [];
            for (let i = 0; i < window.localStorage.length; i++) {
                const k = window.localStorage.key(i);
                if (k && k.startsWith(_CONSUMED_CACHE_KEY_PREFIX) && k !== consumedCacheKey) {
                    stale.push(k);
                }
            }
            stale.forEach((k) => window.localStorage.removeItem(k));
        } catch (_e) { /* best-effort, storage puede no estar disponible */ }
    }, [consumedCacheKey]);

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
                    // [P1-TRACKING-NEW-PLAN-ZERO · 2026-07-12 · revertido
                    // P1-DAILY-NOT-CYCLE · 2026-07-28] El endpoint YA acota a
                    // "hoy" (ver docstring de `_buildConsumedSnapshot`) — no
                    // hay nada adicional que filtrar por plan aquí.
                    setConsumed(_buildConsumedSnapshot({
                        meals: data.meals,
                        totals: data.totals,
                        cacheKey: consumedCacheKey,
                    }));
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
    }, [userId, consumedCacheKey]);

    // [P1-DIARY-EDITABLE · 2026-07-28] "Deshacer registro" — borra una fila
    // de `consumed_meals` mal tapeada. `consumed_meals` era append-only
    // (ver docstring de `db_facts.delete_consumed_meal`); un 1.030 kcal
    // logueado por error vivía para siempre.
    //
    // Contrato con el cache local (P1-TRACKING-CACHE-CONSUMED): actualizamos
    // `consumed` vía `setConsumed` (no un state paralelo), así que el efecto
    // que persiste a localStorage (arriba, "Persist consumed al change") se
    // dispara solo y escribe la lista YA sin la fila borrada. Sin pasar por
    // ahí, el próximo mount hidrataría del cache viejo y "resucitaría" la
    // comida que el usuario acaba de borrar — el mismo bug que
    // P1-TRACKING-CACHE-CONSUMED documenta para el flash de zeros, en
    // reversa.
    const handleDeleteMeal = useCallback(async (meal) => {
        if (!meal?.id || deletingMealId) return;

        const ok = await confirmToast(
            `¿Eliminar "${meal.meal_name}" del diario? Esta acción no se puede deshacer.`,
            { confirmLabel: 'Eliminar', cancelLabel: 'Cancelar' }
        );
        if (!ok) return;

        setDeletingMealId(meal.id);
        try {
            const res = await fetchWithAuth(`/api/diary/consumed/${meal.id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.success) {
                throw new Error(data?.detail || data?.message || 'No se pudo eliminar la comida.');
            }

            // Recalcula totales/count con la fila ya fuera — mismo builder
            // que usa el fetch inicial, así el resultado es idéntico al que
            // devolvería un refetch (sin esperar el roundtrip).
            setConsumed((prev) => _buildConsumedSnapshot({
                meals: (prev?.meals || []).filter((m) => m.id !== meal.id),
                cacheKey: consumedCacheKey,
            }));
            toast.success(`"${meal.meal_name}" eliminada del diario.`);
        } catch (err) {
            console.error('Error eliminando comida del diario:', err);
            toast.error('No se pudo eliminar la comida. Intenta de nuevo.');
        } finally {
            setDeletingMealId(null);
        }
    }, [deletingMealId, consumedCacheKey]);

    // Funciones Helper para calcular Progreso
    // [P1-DIARY-HISTORY · 2026-07-31]
    const [historyOpen, setHistoryOpen] = useState(false);

    const goalCal = parseInt(planData?.calories) || 2000;
    const goalPro = parseInt(planData?.macros?.protein) || 150;
    const goalCarb = parseInt(planData?.macros?.carbs) || 200;
    const goalFat = parseInt(planData?.macros?.fats) || 60;
    const displayedConsumed = consumed?._cacheKey === consumedCacheKey
        ? consumed
        : { ..._CONSUMED_DEFAULT, _cacheKey: consumedCacheKey };

    // [P1-DIARY-EDITABLE · 2026-07-28] Filas visibles de la lista de comidas
    // — cap `_MEALS_VISIBLE_CAP` salvo que el usuario pulse "Ver más".
    const _todaysMeals = displayedConsumed.meals || [];
    const visibleMeals = mealsExpanded ? _todaysMeals : _todaysMeals.slice(0, _MEALS_VISIBLE_CAP);
    const hiddenMealsCount = _todaysMeals.length - visibleMeals.length;

    // [P3-TRACKING-OVER-LIMIT · 2026-05-20] Pre-fix `calcPerc` capeaba al 100%
    // con `Math.min(..., 100)` — ocultaba visualmente cuando el usuario excedía
    // la meta. Ahora retornamos el % real (sin cap); el ProgressBar internamente
    // recorta el ancho del fill a 100% pero usa el % real para signaling de
    // exceso (gradient rojo + número rojo + badge "+excess unit").
    const calcPerc = (val, max) => Math.round((val / max) * 100) || 0;

    const percCal = calcPerc(displayedConsumed.calories, goalCal);
    const percPro = calcPerc(displayedConsumed.protein, goalPro);
    const percCarb = calcPerc(displayedConsumed.carbs, goalCarb);
    const percFat = calcPerc(displayedConsumed.fats, goalFat);

    return (
        // [P1-PLAN-FLAT-MOBILE · 2026-08-11 · REVERTIDO AQUÍ POR EL DUEÑO] Esta tarjeta
        // se QUEDA en el teléfono. Llevó `mf-flat-mobile` unas horas y el dueño pidió
        // devolverla, junto con Razonamiento e Hidratación. El aplanado sigue vivo para
        // el saludo/créditos, micronutrientes y el cuaderno del plan — la mezcla es
        // deliberada, no una unificación a medio hacer. Lo afirma
        // `P1_plan_flat_mobile.test.js`, que lista las que sí y las que no.
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
                            {loading ? 'Cargando registros...' : `${displayedConsumed.meals.length} ${displayedConsumed.meals.length === 1 ? 'comida registrada' : 'comidas registradas'} hoy`}
                        </p>
                        {/* [P1-MACRO-ROW-MOBILE · 2026-08-11] La nota de la meta (P1-GOAL-ETA)
                            vivía aquí y se fue AL PIE de la tarjeta — busca `styles.etaChip`
                            más abajo. Ocupaba dos líneas de ancho completo ANTES del primer
                            número: la meta es contexto de largo plazo y los números de hoy
                            son el motivo por el que abres la tarjeta, así que encabezar con
                            ella empujaba el dato hacia abajo justo en la pantalla donde menos
                            sitio hay. Al pie convive con «Ver días anteriores», que es el
                            otro elemento de contexto y no de dato. */}
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
                    consumed={displayedConsumed.calories} goal={goalCal} unit="kcal"
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
                        consumed={displayedConsumed.protein} goal={goalPro} unit="g"
                        perc={percPro} icon={Dumbbell} darkIcon={ProteinIcon}
                        color="#3B82F6" lightColor="#93C5FD" gradient="linear-gradient(90deg, #93C5FD 0%, #3B82F6 100%)"
                    />
                    {/* Carbohidratos */}
                    <ProgressBar
                        label="Carbohidratos"
                        shortLabel="Carbos"
                        consumed={displayedConsumed.carbs} goal={goalCarb} unit="g"
                        perc={percCarb} icon={Wheat} color="#10B981" lightColor="#6EE7B7" gradient="linear-gradient(90deg, #6EE7B7 0%, #10B981 100%)"
                        fillWhiteStroke
                    />
                    {/* Grasas */}
                    <ProgressBar
                        label="Grasas"
                        consumed={displayedConsumed.fats} goal={goalFat} unit="g"
                        perc={percFat} icon={Droplet} darkIcon={FatDropIcon}
                        color="#EC4899" lightColor="#F9A8D4" gradient="linear-gradient(90deg, #F9A8D4 0%, #EC4899 100%)"
                        fillIcon
                    />
                </div>
            </div>

            {/* [P1-DIARY-EDITABLE · 2026-07-28] Lista de comidas registradas
                hoy — antes esta card solo exponía el CONTEO (subtitle arriba);
                el diario era write-only (registrabas pero nunca veías/corregías
                qué quedó guardado). Solo para logueados: para invitados
                `displayedConsumed.meals` siempre es [] (no hay fetch, ver el
                guard `!userId || userId === 'guest'` en fetchConsumed) y el
                guestBadge de arriba ya cubre el CTA de login. */}
            {isLoggedIn && !loading && (
                <div className={styles.mealsSection}>
                    {_todaysMeals.length === 0 ? (
                        <p className={styles.mealsEmpty}>
                            Aún no registras comidas hoy. Usa "Escanear comida" o cuéntaselo a tu coach en el chat.
                        </p>
                    ) : (
                        <>
                            <ul className={styles.mealsList}>
                                {visibleMeals.map((meal, idx) => (
                                    <li
                                        key={meal.id || `${meal.meal_name}-${meal.consumed_at || idx}`}
                                        className={styles.mealRow}
                                    >
                                        <div className={styles.mealInfo}>
                                            <span className={styles.mealName}>{meal.meal_name}</span>
                                            <span className={styles.mealMeta}>
                                                {_mealTypeLabel(meal.meal_type)} · {Math.round(meal.calories) || 0} kcal
                                            </span>
                                        </div>
                                        {meal.id && (
                                            <button
                                                type="button"
                                                className={styles.mealDeleteBtn}
                                                aria-label={`Eliminar ${meal.meal_name} del diario`}
                                                onClick={() => handleDeleteMeal(meal)}
                                                disabled={deletingMealId === meal.id}
                                            >
                                                {deletingMealId === meal.id
                                                    ? <Loader2 size={16} className="spin-animation" aria-hidden="true" />
                                                    : <Trash2 size={16} strokeWidth={2.5} aria-hidden="true" />}
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {hiddenMealsCount > 0 && (
                                <button
                                    type="button"
                                    className={styles.mealsShowMore}
                                    onClick={() => setMealsExpanded(true)}
                                >
                                    Ver {hiddenMealsCount} más
                                </button>
                            )}
                            {mealsExpanded && _todaysMeals.length > _MEALS_VISIBLE_CAP && (
                                <button
                                    type="button"
                                    className={styles.mealsShowMore}
                                    onClick={() => setMealsExpanded(false)}
                                >
                                    Ver menos
                                </button>
                            )}
                        </>
                    )}
                    {/* [P1-DIARY-HISTORY · 2026-07-31] FUERA del ternario a
                        proposito: el dia vacio es precisamente cuando hace falta
                        poder mirar atras (el caso reportado fue un panel en cero
                        con la comida registrada en ayer). */}
                    <DiaryHistoryTrigger onClick={() => setHistoryOpen(true)} />
                </div>
            )}

            {/* [P1-GOAL-ETA · 2026-07-03] Plazo estimado hasta la meta de peso —
                plan_data.goal_eta lo calcula el backend con el déficit REAL entregado
                (post ritmo + pisos clínicos). Solo aparece si el usuario dio meta
                cuantificada (planes viejos/invitados: oculto). El title lleva la nota de
                honestidad (estimación energética).

                [P1-MACRO-ROW-MOBILE · 2026-08-11] Bajado desde la cabecera. Fuera del
                bloque `isLoggedIn && !loading` a propósito: su condición propia
                (`goal_eta`) ya lo restringe a quien tiene meta cuantificada, y meterlo
                dentro lo haría parpadear en cada recarga del diario. */}
            {planData?.goal_eta?.weeks_estimate ? (
                <div className={styles.etaChip} title={planData.goal_eta.note}>
                    <Flag size={13} strokeWidth={2.5} aria-hidden="true" />
                    Meta: {planData.goal_eta.target_weight_display} · ~{planData.goal_eta.weeks_estimate} semanas a tu ritmo{planData.goal_eta.pace ? ` (${planData.goal_eta.pace})` : ''}
                </div>
            ) : null}

            {/* [P1-DIARY-HISTORY · 2026-07-31] */}
            {isLoggedIn && (
                <DiaryHistory
                    open={historyOpen}
                    onClose={() => setHistoryOpen(false)}
                    userId={userId}
                    targetCalories={goalCal}
                    targetMacros={{ protein: goalPro, carbs: goalCarb, fats: goalFat }}
                />
            )}

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
const ProgressBar = ({ label, shortLabel, consumed, goal, unit, perc, icon: Icon, darkIcon: DarkIcon, color, lightColor, gradient, large, fillIcon, fillWhiteStroke }) => {
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
                    {/* [P1-MACRO-ROW-MOBILE · 2026-08-11] Rótulo largo y corto, y lo
                        elige el CSS, no JS. Los tres macros pasan a compartir una fila
                        en el teléfono (la jerarquía que el escritorio ya tenía), y en
                        una columna de ~100px «Carbohidratos» no cabe: medido en Chrome,
                        pide 90px de texto para 48 de hueco, así que se cortaba y se
                        metía en la columna de al lado.

                        Dos <span> con `display:none` alterno en vez de un ternario sobre
                        un media query en JS: el que no se muestra tampoco existe para el
                        lector de pantalla (`display:none` lo saca del árbol de
                        accesibilidad), así que no se lee dos veces, y al no depender de
                        un hook no hay un primer render con la medida equivocada. */}
                    <span
                        className={`${styles.barLabel} ${shortLabel ? styles.hasShort : ''}`}
                        style={{ fontSize: large ? '1.05rem' : '0.92rem' }}
                    >
                        <span className={styles.labelFull}>{label}</span>
                        {shortLabel ? <span className={styles.labelShort}>{shortLabel}</span> : null}
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
    // Opcional: solo lo necesita el macro cuyo nombre no cabe en una columna del
    // teléfono. Sin él se muestra `label` en todas las anchuras.
    shortLabel: PropTypes.string,
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
