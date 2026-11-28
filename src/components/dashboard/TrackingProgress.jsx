import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Activity, Flag, Trash2, Loader2, Plus, FlaskConical, Share, ChevronRight, Info, Utensils, CupSoda, Check, AlertCircle, CalendarDays, RotateCcw } from 'lucide-react';
import PropTypes from 'prop-types';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useNumeroAnimado } from '../../hooks/useNumeroAnimado';
// [P1-DIARY-HISTORY · 2026-07-31] Esta card es SOLO hoy; el coach registra
// hacia atras con `days_ago`. Sin esta puerta, una comida bien registrada
// en otro dia no tiene NINGUNA superficie donde verse.
import DiaryHistory, { DiaryHistoryTrigger } from './DiaryHistory';
import SemanaEnProgreso from './SemanaEnProgreso';
import { getCachedMasterList, setCachedMasterList, getCachedDishes, setCachedDishes } from '../../utils/pantryCache';
import { readFrequentFoodsCache, writeFrequentFoodsCache } from '../../utils/frequentFoodsCache';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../../utils/safeLocalStorage';
import { CHAT_MESSAGES_CACHE_KEY } from '../../utils/chatCacheKeys';
import { consumirAbrirDiasAnteriores } from '../../utils/diasAnteriores';
import { confirmToast } from '../../utils/confirmToast';
import ProteinIcon from '../icons/ProteinIcon';
import WheatFilledIcon from '../icons/WheatFilledIcon';
import FlameMacroIcon from '../icons/FlameMacroIcon';
import FatDropIcon from '../icons/FatDropIcon';
import { isDarkActive } from '../../utils/theme';
// [P2-DIARY-SCAN-MACROS · 2026-05-30] Modal "Escanear comida → registrar macros".
// [P1-PLAN-LOTE-224 · 2026-09-24] Perezoso y montado al abrir, como «Compartir mi día»: el escáner reconstruido (varios
// platos, la cantidad con −/+) no cabía en este trozo, que `precache-guard` limita a 30 KiB gz y ya estaba en 30,3.
// Solo se descarga cuando alguien lo abre.
const ScanMealModal = lazy(() => import('./ScanMealModal'));
// [P1-MANUAL-FOOD-LOG · 2026-08-11] El componedor manual: registrar sin foto.
import LogMealModal from './LogMealModal';
// [P1-PLAN-LOTE-105 · 2026-09-18] Los micros viven en ESTA tarjeta (antes «Micros de hoy» aparte): un solo fetch
// del día alimenta macros y micros, y el diario de días anteriores pinta la misma lista.
import MicrosList from './MicrosList';
import HealthSources from '../common/HealthSources';
import { resumirMicros, useMicrosSubtitulo } from './microsShared';
import { formatDate, formatNumber, formatPercent, useT, useTn } from '../../i18n';
import { nombreDeRegistro, nombreDeFila } from '../../utils/nombreDeRegistro';
import { macroReferences } from '../../utils/macroReferences';
import { getCalorieGoalState, resolveMainGoal } from '../../utils/calorieGoalStatus';
import { getMacroGoalState, calorieStateToBarState } from '../../utils/macroGoalStatus';
// [P1-PLAN-LOTE-721 · 2026-09-28] La fila abre la ficha del plato; la foto del escáner (solo en este dispositivo) sale
// en miniatura. El almacén de fotos se importa dinámico dentro del hook: este trozo está en el techo de precache-guard.
import { useIdsConFoto, useEnlazarFotosDelChat, borrarFotoDeComidaEnSegundoPlano } from '../../hooks/useFotosDeComidas';
import MiniaturaDeComida from './MiniaturaDeComida';
import { getBiologicalDateStr } from '../../utils/diaBiologico';
import styles from './TrackingProgress.module.css';

// [P1-COMPARTIR-DIA · 2026-09-23] La hoja se carga al abrirla: canvas + textos no pesan en el panel.
const ShareDaySheet = lazy(() => import('./ShareDaySheet'));
// [P1-PLAN-LOTE-721] La ficha de un plato registrado, igual: se carga al abrirla.
const FichaDeComida = lazy(() => import('./FichaDeComida'));

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
const _CONSUMED_DEFAULT = { calories: 0, protein: 0, carbs: 0, fats: 0, meals: [], micros: null, microsCoverage: null };

// [P1-DIARY-EDITABLE · 2026-07-28] Lista de comidas registradas hoy dentro de
// la card. Antes esta card solo exponía `consumed.meals.length` (el conteo);
// el diario era de facto write-only — el usuario no podía ver QUÉ registró
// ni deshacer un tap equivocado. `meal_type` viaja como uno de los 5 valores
// que emite el backend (`tools.py::_normalize_meal_type` + `ScanMealModal`
// `_MEAL_TYPES`) — fallback capitalizado defensivo por si un valor legacy
// distinto se cuela.
// [P1-I18N-DASHBOARD · 2026-08-15] Función y no constante: una tabla de copy en
// ámbito de módulo se congela en español al importar. Las claves son los valores
// de `meal_type` del backend y NO se traducen.
const _getMealTypeLabels = (t) => ({
    desayuno: t('Desayuno'),
    almuerzo: t('Almuerzo'),
    cena: t('Cena'),
    merienda: t('Merienda'),
    snack: t('Snack'),
    suplemento: t('Suplemento'),
    // [BB-025 / P1-DIARY-COMPLEMENTS-SECTION · 2026-11-03]
    complemento: t('Complemento'),
    // [P1-PLAN-LOTE-721] el default del componedor; sin entrada salía «Extra» capitalizado a mano en todos los idiomas
    extra: t('Extra'),
});

const _mealTypeLabel = (mealType, t) => {
    if (!mealType) return t('Comida');
    return _getMealTypeLabels(t)[mealType] || (mealType.charAt(0).toUpperCase() + mealType.slice(1));
};

const _horaDeComida = (raw) => {
    if (!raw) return '';
    const txt = String(raw);
    if (!txt.includes('T') && !/\d:\d/.test(txt)) return '';
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '' : formatDate(d, { timeStyle: 'short' });
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
    const dateStr = getBiologicalDateStr();
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
// [P1-PLAN-LOTE-105] Los micros van en el MISMO snapshot que las macros: cada comida trae `micros` (o null) y
// el total se recalcula aquí (`resumirMicros`, la aritmética de `diary_micros.resumen_micros`), así el borrado
// optimista deja macros y micros coherentes sin esperar al servidor.
const _buildConsumedSnapshot = ({ meals, totals, cacheKey }) => {
    if (!Array.isArray(meals)) {
        return {
            calories: _macroNumber(totals?.calories),
            protein: _macroNumber(totals?.protein),
            carbs: _macroNumber(totals?.carbs),
            fats: _macroNumber(totals?.healthy_fats ?? totals?.fats),
            meals: [],
            micros: totals?.micros || null,
            microsCoverage: totals?.micros_coverage || { con_datos: 0, total: 0 },
            _fetched: true,
            _cacheKey: cacheKey,
        };
    }

    const { micros, coverage } = resumirMicros(meals);
    return {
        calories: Math.round(meals.reduce((sum, meal) => sum + _macroNumber(meal?.calories), 0)),
        protein: Math.round(meals.reduce((sum, meal) => sum + _macroNumber(meal?.protein), 0)),
        carbs: Math.round(meals.reduce((sum, meal) => sum + _macroNumber(meal?.carbs), 0)),
        fats: Math.round(meals.reduce((sum, meal) => sum + _macroNumber(meal?.healthy_fats ?? meal?.fats), 0)),
        meals,
        micros,
        microsCoverage: coverage,
        _fetched: true,
        _cacheKey: cacheKey,
    };
};

const TrackingProgress = ({ planData, userId, flatOnMobile = false, microTargets = null, referenceProfile = null }) => {
    const t = useT();
    const tn = useTn();
    const subtituloMicros = useMicrosSubtitulo();

    // [P2-DIARY-SCAN-MACROS · 2026-05-30] Estado del modal de escaneo. Al
    // registrar una comida el modal dispara `mealfit:refresh-inventory`, que
    // el effect de abajo ya escucha → las barras se actualizan solas.
    const [scanOpen, setScanOpen] = useState(false);
    const [logOpen, setLogOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
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
    // [P1-PLAN-LOTE-1152] registrada la foto, si el componedor tenía un plato a medias se vuelve a él: no se pierde
    const handleScanClose = useCallback(() => {
        setScanOpen(false);
        if (scanOpen?.borrador?.lines?.length) setLogOpen(scanOpen);
    }, [scanOpen]);
    const handleLogClose = useCallback(() => setLogOpen(false), []);
    const handleShareClose = useCallback(() => setShareOpen(false), []);
    // [P1-DIARY-FREETEXT-ESTIMATE] «Foto» desde el componedor: cierra el composedor y abre el escáner
    // [P1-PLAN-LOTE-382] …con la comida y el día del componedor
    const handleLogToScan = useCallback((d) => { setLogOpen(false); setScanOpen(d || true); }, []);
    // [P1-PLAN-LOTE-1151] la X del escáner vuelve al componedor, con la comida y el día que tenía
    const handleScanBack = useCallback(() => {
        setScanOpen(false);
        setLogOpen(scanOpen && typeof scanOpen === 'object' ? scanOpen : true);
    }, [scanOpen]);

    // [P1-DIARY-EDITABLE · 2026-07-28] Estado de la lista de comidas de hoy.
    // `mealsExpanded` levanta el cap de `_MEALS_VISIBLE_CAP` filas visibles.
    // `deletingMealId` deshabilita el botón de LA fila en vuelo (no todas)
    // para que un doble-tap no dispare dos DELETE del mismo id.
    const [mealsExpanded, setMealsExpanded] = useState(false);
    const [deletingMealId, setDeletingMealId] = useState(null);
    const deletingIdsRef = useRef(new Set());
    const deletedIdsRef = useRef(new Set());
    const [selectedDay, setSelectedDay] = useState(null);
    const [selectedDayState, setSelectedDayState] = useState({ iso: null, meals: [], loading: false });
    // [P1-DIA-EN-EL-CONTADOR · 2026-11-27] el día llega con sus cifras (las del anillo): se adopta tal cual
    const handleDiaSeleccionado = useCallback((dia) => { setSelectedDay(dia || null); }, []);
    // «Volver a hoy» desde el contador: la semana suelta el día (señal) y el contador vuelve a hoy al instante
    const [limpiarSemana, setLimpiarSemana] = useState(0);
    const volverAHoy = useCallback(() => {
        setLimpiarSemana((n) => n + 1);
        setSelectedDay(null);
    }, []);
    // [P1-DIA-UNIFICADO · 2026-11-26] El día tocado en «Tu semana» manda sobre comidas y micros SOLO con la semana al lado
    // (PC, ≥910 px de tarjeta). En el teléfono la semana va DEBAJO: cambiar una tarjeta que está fuera de la vista dejaba
    // «Comidas del martes» bajo las macros de hoy. Allí el detalle del día vive en la propia semana. Sin ResizeObserver
    // (tests, navegadores viejos) se conserva la conducta de siempre.
    const hostRef = useRef(null);
    const [semanaAlLado, setSemanaAlLado] = useState(true);
    useEffect(() => {
        const el = hostRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver((entries) => {
            const w = entries?.[0]?.contentRect?.width || 0;
            if (w > 0) setSemanaAlLado(w >= 910);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    // [P1-DIA-EN-EL-CONTADOR · 2026-11-27] El día tocado manda sobre TODO el contador (macros, micros y comidas), en PC
    // y en el teléfono: la tarjetita de resumen bajo la semana repetía las cifras en pequeño (el dueño: «se ve mediocre»).
    // En el teléfono la semana va bajo las macros, así que al tocar un día la vista sube al contador.
    const viewingPastDay = Boolean(selectedDay?.iso && !selectedDay.esHoy);
    const pastIso = viewingPastDay ? selectedDay.iso : null;
    useEffect(() => {
        if (!pastIso || semanaAlLado) return;
        const el = hostRef.current;
        if (!el || typeof el.scrollIntoView !== 'function') return;
        if (el.getBoundingClientRect().top > 56) return;
        let quieto = false;
        try { quieto = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch (_e) { /* sin matchMedia */ }
        el.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' });
    }, [pastIso, semanaAlLado]);
    // [P1-PLAN-LOTE-721] La comida cuya ficha está abierta (la fila tal cual llegó del día), o null.
    const [fichaMeal, setFichaMeal] = useState(null);
    const handleFichaClose = useCallback(() => setFichaMeal(null), []);
    const idsConFoto = useIdsConFoto(userId);
    // [P1-PLAN-LOTE-727] la foto que mandaste al chat llega a la ficha aunque salieras antes de que el coach terminara
    useEnlazarFotosDelChat(userId);

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
                // Calculate local biological date and timezone offset
                const now = new Date();
                const dateStr = getBiologicalDateStr(now);
                const tzOffset = now.getTimezoneOffset();

                const res = await fetchWithAuth(`/api/diary/consumed/${userId}?date=${dateStr}&tzOffset=${tzOffset}`);
                const data = await res.json();
                
                if (isMounted && data.totals) {
                    const filtradas = Array.isArray(data.meals)
                        ? data.meals.filter((m) => !deletedIdsRef.current.has(m?.id))
                        : data.meals;
                    // [P1-TRACKING-NEW-PLAN-ZERO · 2026-07-12 · revertido
                    // P1-DAILY-NOT-CYCLE · 2026-07-28] El endpoint YA acota a
                    // "hoy" (ver docstring de `_buildConsumedSnapshot`) — no
                    // hay nada adicional que filtrar por plan aquí.
                    const nextSnapshot = _buildConsumedSnapshot({
                        meals: filtradas,
                        totals: data.totals,
                        cacheKey: consumedCacheKey,
                    });
                    setConsumed((prev) => (
                        prev && JSON.stringify(prev) === JSON.stringify(nextSnapshot) ? prev : nextSnapshot
                    ));
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
        const onAgentRefreshInventory = (e) => {
            if (!isMounted) return;
            const optMeal = e?.detail?.optimisticMeal;
            if (optMeal && optMeal.id) {
                setConsumed((prev) => {
                    const existing = Array.isArray(prev?.meals) ? prev.meals : [];
                    if (existing.some((m) => m?.id === optMeal.id)) return prev;
                    return _buildConsumedSnapshot({
                        meals: [optMeal, ...existing],
                        cacheKey: consumedCacheKey,
                    });
                });
            }
            fetchConsumed();
        };
        const onVisibilityChange = () => {
            if (isMounted && document.visibilityState === 'visible') {
                fetchConsumed();
            }
        };
        // [P1-PLAN-LOTE-105] El diario de días anteriores también borra (cualquier día, hoy incluido) y avisa
        // con `mealfit:diary-changed`; el borrado PROPIO de esta tarjeta lleva `source` y ya actualizó el estado.
        const onDiaryChanged = (e) => {
            if (isMounted && e?.detail?.source !== 'tracking-progress' && e?.detail?.deletedMeal?.id) {
                const deletedId = e.detail.deletedMeal.id;
                deletingIdsRef.current.add(deletedId);
                deletedIdsRef.current.add(deletedId);
                setConsumed((prev) => _buildConsumedSnapshot({
                    meals: (prev?.meals || []).filter((m) => m.id !== deletedId),
                    cacheKey: consumedCacheKey,
                }));
            }
            if (isMounted && e?.detail?.source !== 'tracking-progress') fetchConsumed();
        };
        window.addEventListener('mealfit:refresh-inventory', onAgentRefreshInventory);
        // [P1-PLAN-LOTE-688] …y al acabar CADA turno del coach: si el modelo anota sin la etiqueta de refresco, el
        // contador no se enteraba hasta volver a la pestaña. Con el modo voz minimizado se mira en directo.
        window.addEventListener('mealfit:chat-turn-done', onAgentRefreshInventory);
        window.addEventListener('mealfit:diary-changed', onDiaryChanged);
        document.addEventListener('visibilitychange', onVisibilityChange);

        const timer = window.setTimeout(() => {
            if (!isMounted) return;
            const jobs = [];
            if (!getCachedMasterList()) {
                jobs.push(
                    fetchWithAuth('/api/catalog')
                        .then((r) => (r.ok ? r.json() : null))
                        .then((d) => { if (isMounted && Array.isArray(d?.items)) setCachedMasterList(d.items); })
                        .catch(() => {})
                );
            }
            if (!getCachedDishes()) {
                jobs.push(
                    fetchWithAuth('/api/catalog/dishes')
                        .then((r) => (r.ok ? r.json() : null))
                        .then((d) => { if (isMounted && Array.isArray(d?.items)) setCachedDishes(d.items); })
                        .catch(() => {})
                );
            }
            if (!readFrequentFoodsCache(userId)) {
                jobs.push(
                    fetchWithAuth('/api/diary/foods/frequent?limit=6')
                        .then((r) => (r.ok ? r.json() : null))
                        .then((d) => { if (isMounted && Array.isArray(d?.items)) writeFrequentFoodsCache(userId, d.items); })
                        .catch(() => {})
                );
            }
            void jobs;
        }, 1200);

        return () => {
            isMounted = false;
            window.clearTimeout(timer);
            window.removeEventListener('mealfit:refresh-inventory', onAgentRefreshInventory);
            window.removeEventListener('mealfit:chat-turn-done', onAgentRefreshInventory);
            window.removeEventListener('mealfit:diary-changed', onDiaryChanged);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [userId, consumedCacheKey]);

    // [SEMANA-EN-PROGRESO · 2026-11-26] Al tocar un día anterior en la tira semanal, la lista de comidas de abajo
    // debe mostrar ESE día (y nunca dejar visible la lista de hoy bajo la cabecera del día elegido).
    useEffect(() => {
        setMealsExpanded(false);
        const targetIso = viewingPastDay ? selectedDay?.iso : null;
        if (!targetIso || !userId || userId === 'guest') {
            setSelectedDayState({ iso: null, meals: [], loading: false });
            return undefined;
        }
        let isMounted = true;
        const fetchSelectedDay = async (showSpinner = false) => {
            if (showSpinner) {
                setSelectedDayState({ iso: targetIso, meals: [], loading: true });
            }
            try {
                const tzOffset = new Date().getTimezoneOffset();
                const res = await fetchWithAuth(`/api/diary/consumed/${userId}?date=${targetIso}&tzOffset=${tzOffset}`);
                const data = await res.json();
                if (!isMounted) return;
                const meals = Array.isArray(data?.meals)
                    ? data.meals.filter((m) => !deletedIdsRef.current.has(m?.id))
                    : [];
                setSelectedDayState({ iso: targetIso, meals, loading: false });
            } catch (_err) {
                if (isMounted) setSelectedDayState((prev) => ({ ...prev, iso: targetIso, loading: false }));
            }
        };
        fetchSelectedDay(true);
        const onPastRefresh = (e) => {
            if (isMounted && e?.detail?.source !== 'tracking-progress') fetchSelectedDay(false);
        };
        window.addEventListener('mealfit:diary-changed', onPastRefresh);
        window.addEventListener('mealfit:refresh-inventory', onPastRefresh);
        return () => {
            isMounted = false;
            window.removeEventListener('mealfit:diary-changed', onPastRefresh);
            window.removeEventListener('mealfit:refresh-inventory', onPastRefresh);
        };
    }, [viewingPastDay, selectedDay?.iso, userId]);

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
    // [P1-PLAN-LOTE-721] Devuelve true si se borró (la ficha se cierra entonces) y borra también la foto del dispositivo.
    const handleDeleteMeal = useCallback(async (meal) => {
        if (!meal?.id || deletingMealId || deletingIdsRef.current.has(meal.id)) return false;
        deletingIdsRef.current.add(meal.id);

        const ok = await confirmToast(
            t('¿Eliminar "{nombre}" del diario? Esta acción no se puede deshacer.', { nombre: meal.meal_name }),
            { confirmLabel: t('Eliminar'), cancelLabel: t('Cancelar'), danger: true }
        );
        if (!ok) {
            deletingIdsRef.current.delete(meal.id);
            return false;
        }

        const isPastMeal = Boolean(viewingPastDay && selectedDayState.meals.some((m) => m.id === meal.id));
        setDeletingMealId(meal.id);
        try {
            const sid = safeLocalStorageGet('mealfit_current_session', null);
            const delUrl = sid
                ? `/api/diary/consumed/${meal.id}?session_id=${encodeURIComponent(sid)}`
                : `/api/diary/consumed/${meal.id}`;
            const res = await fetchWithAuth(delUrl, { method: 'DELETE' });
            const alreadyGone = res.status === 404;
            const data = await res.json().catch(() => ({}));
            if (!alreadyGone && (!res.ok || !data?.success)) {
                throw new Error(data?.detail || data?.message || t('No se pudo eliminar la comida.'));
            }
            deletedIdsRef.current.add(meal.id);

            // Recalcula totales/count con la fila ya fuera — mismo builder
            // que usa el fetch inicial, así el resultado es idéntico al que
            // devolvería un refetch (sin esperar el roundtrip).
            // [P1-PLAN-LOTE-103] «Micros de hoy» y el dashboard del plan (useTodaysConsumedMeals) vuelven a pedir el día.
            try { window.dispatchEvent(new CustomEvent('mealfit:diary-changed', { detail: { source: 'tracking-progress', userId, isPastDay: isPastMeal, deletedMeal: { id: meal.id, name: meal.meal_name } } })); } catch { /* best-effort */ }
            safeLocalStorageRemove(CHAT_MESSAGES_CACHE_KEY);
            window.dispatchEvent(new Event('mealfit:refresh-chat'));
            if (isPastMeal) {
                setSelectedDayState((prev) => ({
                    ...prev,
                    meals: (prev?.meals || []).filter((m) => m.id !== meal.id),
                }));
            } else {
                setConsumed((prev) => _buildConsumedSnapshot({
                    meals: (prev?.meals || []).filter((m) => m.id !== meal.id),
                    cacheKey: consumedCacheKey,
                }));
            }
            setFichaMeal((cur) => (cur?.id === meal.id ? null : cur));
            borrarFotoDeComidaEnSegundoPlano(userId, meal.id);
            void alreadyGone; // [P1-PLAN-LOTE-1183] sin aviso: el cambio ya se ve en pantalla (regla de P1-PLAN-LOTE-1181)
            return true;
        } catch (err) {
            deletingIdsRef.current.delete(meal.id);
            console.error('Error eliminando comida del diario:', err);
            toast.error(t('No se pudo eliminar la comida. Intenta de nuevo.'));
            return false;
        } finally {
            setDeletingMealId(null);
        }
    }, [deletingMealId, consumedCacheKey, t, userId, viewingPastDay, selectedDayState.meals]);

    // Funciones Helper para calcular Progreso
    // [P1-DIARY-HISTORY · 2026-07-31]
    const [historyOpen, setHistoryOpen] = useState(false);
    // [SEMANA-EN-PROGRESO] el día con el que abre el cajón (null = hoy): lo fija el día tocado en «Tu semana»
    const [historyDia, setHistoryDia] = useState(null);
    // [P1-PLAN-LOTE-162] Si se llega desde «Ver mis días anteriores» del Historial, el cajón se abre al montar.
    useEffect(() => { if (consumirAbrirDiasAnteriores()) setHistoryOpen(true); }, []);

    const goalCal = parseInt(planData?.calories) || 2000;
    const references = macroReferences(planData, referenceProfile);
    const goalPro = parseInt(planData?.macros?.protein) || 150;
    const goalCarb = parseInt(planData?.macros?.carbs) || 200;
    const goalFat = parseInt(planData?.macros?.fats) || 60;
    const displayedConsumed = consumed?._cacheKey === consumedCacheKey
        ? consumed
        : { ..._CONSUMED_DEFAULT, _cacheKey: consumedCacheKey };

    // [P1-DIARY-EDITABLE · 2026-07-28] Filas visibles de la lista de comidas
    // — cap `_MEALS_VISIBLE_CAP` salvo que el usuario pulse "Ver más".
    // [BB-025 / P1-DIARY-COMPLEMENTS-SECTION · 2026-11-03] Separar comidas reales de complementos/bebidas ligeras.
    const _todaysMeals = displayedConsumed.meals || [];
    const _isLightDrinkName = (name) => {
        if (!name) return false;
        const n = String(name).toLowerCase();
        return /t[eé]|infusi[oó]n|caf[eé]\s+(negro|solo)|agua\s+con\s+lim[oó]n|caldo\s+ligero/i.test(n);
    };
    const _esComplemento = (m) => {
        const mt = String(m?.meal_type || '').toLowerCase();
        if (mt === 'complemento' || mt === 'suplemento') return true;
        if ((Number(m?.calories) || 0) <= 50 && _isLightDrinkName(m?.meal_name)) {
            return true;
        }
        return false;
    };
    const _mainMeals = _todaysMeals.filter((m) => !_esComplemento(m));
    const _complements = _todaysMeals.filter(_esComplemento);
    const _listMeals = viewingPastDay
        ? (selectedDayState.iso === selectedDay?.iso ? selectedDayState.meals : [])
        : _todaysMeals;
    const _listMainMeals = _listMeals.filter((m) => !_esComplemento(m));
    const _listComplements = _listMeals.filter(_esComplemento);

    const visibleMeals = mealsExpanded ? _listMainMeals : _listMainMeals.slice(0, _MEALS_VISIBLE_CAP);
    const hiddenMealsCount = _listMainMeals.length - visibleMeals.length;
    // [P1-PLAN-LOTE-105] cobertura de micros del día (un snapshot cacheado de antes del lote no la trae: se deriva)
    const coberturaMicros = displayedConsumed.microsCoverage || { con_datos: 0, total: _todaysMeals.length };
    // [P1-DIA-UNIFICADO] los micros del día que se mira: hoy, del snapshot; un día pasado, sumados de sus comidas
    const microsDelDia = viewingPastDay
        ? resumirMicros(_listMeals)
        : { micros: displayedConsumed.micros, coverage: coberturaMicros };
    const microsCargando = viewingPastDay ? selectedDayState.loading : loading;
    const kcalDelDia = Math.round(_listMeals.reduce((acc, m) => acc + (Number(m?.calories) || 0), 0));

    // Keep the real percentage above the plan goal; only the visual width is capped.
    const calcPerc = (val, max) => Math.round((val / max) * 100) || 0;

    // [P1-DIA-EN-EL-CONTADOR] lo que pintan las barras: hoy en vivo, o el día pasado tocado con SUS metas
    const diaPasado = viewingPastDay ? selectedDay : null;
    const metaDelDia = (v, hoyV) => (Number(v) > 0 ? Number(v) : hoyV);
    const verConsumo = diaPasado
        ? { calories: Number(diaPasado.calories) || 0, protein: Number(diaPasado.protein) || 0, carbs: Number(diaPasado.carbs) || 0, fats: Number(diaPasado.fats) || 0 }
        : displayedConsumed;
    const verMetaCal = diaPasado ? metaDelDia(diaPasado.target, goalCal) : goalCal;
    const verMetaPro = diaPasado ? metaDelDia(diaPasado.targetMacros?.protein, goalPro) : goalPro;
    const verMetaCarb = diaPasado ? metaDelDia(diaPasado.targetMacros?.carbs, goalCarb) : goalCarb;
    const verMetaFat = diaPasado ? metaDelDia(diaPasado.targetMacros?.fats, goalFat) : goalFat;
    const percCal = calcPerc(verConsumo.calories, verMetaCal);
    const percPro = calcPerc(verConsumo.protein, verMetaPro);
    const percCarb = calcPerc(verConsumo.carbs, verMetaCarb);
    const percFat = calcPerc(verConsumo.fats, verMetaFat);

    // [BB-024 / P1-CALORIE-BAR-GOAL-SEMANTICS · 2026-11-03]
    // Semántica de la Barra Verde Esmeralda según el objetivo del usuario (SSOT: calorieGoalStatus.js):
    // pierde grasa [80%, 105%], ganancia muscular [90%, 115%], mantenimiento/neutro [90%, 110%].
    // Si supera el techo, pasa de verde a tono naranja cálido (#F97316).
    const resolvedMainGoal = resolveMainGoal({ referenceProfile, planData });
    // [SEMANA-EN-PROGRESO] lo de hoy, en vivo, para el anillo de hoy de «Tu semana»
    const hoyParaLaSemana = {
        calories: Number(displayedConsumed.calories) || 0,
        protein: Number(displayedConsumed.protein) || 0,
        carbs: Number(displayedConsumed.carbs) || 0,
        fats: Number(displayedConsumed.fats) || 0,
        micros: displayedConsumed.micros || null,
        mealsCount: _todaysMeals.length,
    };
    const metasMacrosDeHoy = { protein: goalPro, carbs: goalCarb, fats: goalFat };
    const calorieState = getCalorieGoalState(displayedConsumed.calories, goalCal, resolvedMainGoal);
    // [P1-MACRO-BARS-SEMAFORO · 2026-11-26] Las cuatro barras hablan el mismo idioma: gris en curso, verde cumplida,
    // rojo pasada. Las calorías conservan su banda por objetivo (BB-024); los macros, meta ≥90 % y límite AMDR.
    // un día CERRADO que no llegó ya no está «en curso»: se quedó corto (rojo, como su anillo con ↓ en la semana)
    const cerrarEstado = (e) => (diaPasado && e === 'progress' ? 'short' : e);
    const calState = cerrarEstado(calorieStateToBarState(diaPasado
        ? getCalorieGoalState(verConsumo.calories, verMetaCal, resolvedMainGoal)
        : calorieState));
    const calStatusOverride = calState === 'done' ? (diaPasado ? t('Meta cumplida') : t('Meta del día alcanzada')) : null;
    const proState = cerrarEstado(getMacroGoalState(verConsumo.protein, verMetaPro, references.protein));
    const carbState = cerrarEstado(getMacroGoalState(verConsumo.carbs, verMetaCarb, references.carbs));
    const fatState = cerrarEstado(getMacroGoalState(verConsumo.fats, verMetaFat, references.fats));

    return (
        // [P1-PLAN-LOTE-88 · 2026-09-17] `flatOnMobile`: en ≤480px la sección pierde el marco de tarjeta
        // (borde, fondo, sombra y relleno) y usa el ancho entero. Lo pide el padre; hoy solo el contador.
        <div className={styles.cardHost} ref={hostRef}>
        <div className={flatOnMobile ? `${styles.card} ${styles.flatMobile}` : styles.card}>
            {/* [P1-PLAN-LOTE-1164] En PC ancho (la tarjeta ≥ 880 px) dos columnas: a la izquierda el día (registrar, tu
                semana y las comidas), a la derecha los números (calorías, macros y micros). En el teléfono esta capa no
                existe (`display: contents`): el orden y el aspecto del móvil no cambian. */}
            <div className={styles.disposicion}>
            {/* Header Sector */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <div className={styles.headerIcon}>
                        <Activity size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        {/* [P1-DIA-EN-EL-CONTADOR] «micros» sobraba en el título: los micros tienen su propio apartado abajo */}
                        <h2 className={styles.title}>{t('Tus macros')}</h2>
                        {diaPasado ? (
                            <p className={`${styles.subtitle} ${styles.subtitlePasado}`}>
                                <CalendarDays size={14} strokeWidth={2.4} aria-hidden="true" />
                                <span>
                                    {diaPasado.etiqueta}
                                    {diaPasado.estado !== 'vacio' && Number(diaPasado.mealsCount) > 0
                                        ? ` · ${tn(Number(diaPasado.mealsCount), '{n} comida', '{n} comidas', { n: Number(diaPasado.mealsCount) })}`
                                        : ''}
                                </span>
                            </p>
                        ) : (
                        <p className={styles.subtitle}>
                            {loading
                                ? t('Cargando registros...')
                                : _complements.length > 0
                                ? (_mainMeals.length === 0
                                    ? tn(_complements.length, '{n} complemento', '{n} complementos', { n: _complements.length })
                                    : `${tn(_mainMeals.length, '{n} comida', '{n} comidas', { n: _mainMeals.length })} · ${tn(_complements.length, '{n} complemento', '{n} complementos', { n: _complements.length })}`)
                                : tn(
                                    _mainMeals.length,
                                    // [P1-PLAN-LOTE-104] sin «hoy»: el título ya lo dice (el dueño: «no quiero que se repita»)
                                    '{n} comida registrada',
                                    '{n} comidas registradas',
                                    { n: _mainMeals.length }
                                )}
                        </p>
                        )}
                        {/* [P1-MACRO-ROW-MOBILE · 2026-08-11] La nota de la meta (P1-GOAL-ETA)
                            vivía aquí y se fue AL PIE de la tarjeta — busca `styles.etaChip`
                            más abajo. Ocupaba dos líneas de ancho completo ANTES del primer
                            número: la meta es contexto de largo plazo y los números de hoy
                            son el motivo por el que abres la tarjeta, así que encabezar con
                            ella empujaba el dato hacia abajo justo en la pantalla donde menos
                            sitio hay. */}
                    </div>
                </div>
                
                {isLoggedIn && diaPasado ? (
                    // [P1-DIA-EN-EL-CONTADOR] mirando un día pasado, la acción es volver: registrar anota en HOY
                    <div className={styles.headerActions}>
                        <button type="button" className={styles.volverHoyBtn} onClick={volverAHoy}>
                            <RotateCcw size={16} strokeWidth={2.5} aria-hidden="true" />
                            {t('Volver a hoy')}
                        </button>
                    </div>
                ) : isLoggedIn ? (
                    // [P1-MANUAL-FOOD-LOG · 2026-08-11] Dos vías de registrar: el componedor
                    // (buscar y anotar, la vía de los 15 segundos) y el escáner de siempre.
                    // [P1-PLAN-LOTE-85 · 2026-09-17] UN solo botón en la tarjeta; las dos vías
                    // viven DENTRO del componedor como un selector de dos opciones (el dueño:
                    // «desde afuera las dos opciones se ve un poco raro»). El escáner se abre
                    // desde ahí (`handleLogToScan`).
                    <div className={styles.headerActions}>
                      <div className={styles.logButtons}>
                        {!loading && _todaysMeals.length > 0 && (
                            <button
                                type="button"
                                className={styles.shareBtn}
                                aria-label={t('Compartir mi día')}
                                title={t('Compartir mi día')}
                                onClick={() => setShareOpen(true)}
                            >
                                <Share size={20} strokeWidth={2.25} aria-hidden="true" />
                            </button>
                        )}
                        <button
                            className={styles.scanBtn}
                            onClick={() => setLogOpen(true)}
                            type="button"
                        >
                            <Plus size={18} strokeWidth={2.5} />
                            {t('Registrar comida')}
                        </button>
                      </div>
                    </div>
                ) : (
                    <div className={styles.guestBadge}>
                        {t('Inicia sesión para registrar comidas')}
                    </div>
                )}
            </div>

            <div className={styles.macrosCard}>
            <div className={styles.content}>
                {/* Calorías (Main Bar) */}
                <ProgressBar
                    label={t('Calorías')}
                    consumed={verConsumo.calories} goal={verMetaCal} unit="kcal"
                    perc={percCal} icon={FlameMacroIcon} darkIcon={FlameMacroIcon}
                    state={calState} statusOverride={calStatusOverride} cerrado={Boolean(diaPasado)}
                    fillIcon
                    large
                />

                <div className={styles.macroGrid}>
                    {/* Proteína */}
                    {/* [ICONOS-FAMILIA · 2026-11-14] Los cuatro macros usan la misma familia de glifos (contorno + velo
                        + un acento) en claro y en oscuro; antes en claro eran lucide a trazo y en oscuro sólidos. */}
                    <ProgressBar
                        label={t('Proteína')}
                        consumed={verConsumo.protein} goal={verMetaPro} unit="g"
                        reference={references.protein}
                        perc={percPro} icon={ProteinIcon} darkIcon={ProteinIcon}
                        state={proState} cerrado={Boolean(diaPasado)}
                    />
                    {/* Carbohidratos */}
                    <ProgressBar
                        label={t('Carbohidratos')}
                        consumed={verConsumo.carbs} goal={verMetaCarb} unit="g"
                        reference={references.carbs}
                        perc={percCarb} icon={WheatFilledIcon} darkIcon={WheatFilledIcon}
                        state={carbState} cerrado={Boolean(diaPasado)}
                        fillWhiteStroke
                    />
                    {/* Grasas */}
                    <ProgressBar
                        label={t('Grasas')}
                        consumed={verConsumo.fats} goal={verMetaFat} unit="g"
                        reference={references.fats}
                        perc={percFat} icon={FatDropIcon} darkIcon={FatDropIcon}
                        state={fatState} cerrado={Boolean(diaPasado)}
                        fillIcon
                    />
                </div>
            </div>

            <details className={styles.targetHelp}>
                <summary>
                    <Info size={14} aria-hidden="true" />
                    <span>{t('Sobre tus metas')}</span>
                    <ChevronRight size={14} className={styles.targetHelpChevron} aria-hidden="true" />
                </summary>
                <p>{t('Tu meta (100%) es el objetivo diario de tu plan. El porcentaje de la barra muestra tu consumo real frente a esa meta.')}</p>
                <p>{t('El límite máximo marca el tope diario que conviene no superar (extremo superior del rango AMDR para adultos: proteína 35%, carbohidratos 65% y grasas 35% de la energía). Los gramos se calculan con las calorías de tu plan.')}</p>
                <p>{t('No es un diagnóstico médico ni una cantidad extra que debas comer; te ayuda a evitar excesos en un solo macro. Si tu perfil requiere una pauta individual o faltan datos, mostramos solo tu meta.')}</p>
            </details>
            </div>

            {/* [P1-SEMANA-BAJO-MACROS · 2026-11-27] «Tu semana» justo bajo las macros: los puntos premian lo que acabas
                de ver (calorías y macros), y al fondo nadie los veía. Su detalle «Cómo sumar puntos hoy» va plegado en el
                teléfono para no empujar las comidas. En PC cada pieza tiene su celda fija en la rejilla: el orden del DOM
                no la mueve del riel derecho. */}
            {/* [SEMANA-EN-PROGRESO · 2026-11-15] El progreso de los días, a la vista: anillos por día, racha y el
                resumen del día tocado. La puerta al calendario completo vive en su cabecera (antes era un botón
                ancho bajo «Registrar comida»). Fuera del ternario vacío/no-vacío: con el día en cero también está. */}
            {isLoggedIn && (
                <div className={styles.semanaSlot}>
                    <SemanaEnProgreso
                        userId={userId}
                        hoy={loading ? null : hoyParaLaSemana}
                        targetCalories={goalCal}
                        targetMacros={metasMacrosDeHoy}
                        targetMicros={microTargets}
                        mainGoal={resolvedMainGoal}
                        onAbrirDia={(iso) => { setHistoryDia(iso); setHistoryOpen(true); }}
                        onDiaSeleccionado={handleDiaSeleccionado}
                        detalleCompacto
                        limpiarSeleccion={limpiarSemana}
                        calendario={(
                            <DiaryHistoryTrigger compacto onClick={() => { setHistoryDia(null); setHistoryOpen(true); }} />
                        )}
                    />
                </div>
            )}

            {/* [P1-DIA-UNIFICADO · 2026-11-26] Comidas y micros en UNA pieza: las comidas son el origen de los micros, y
                separadas por las macros se leían como dos tarjetas sin relación. En PC es una tarjeta; en el teléfono, un
                bloque continuo bajo las macros. Si se mira un día pasado (PC), comidas Y micros son de ese día. */}
            {isLoggedIn && (
            <section className={styles.diaCard} aria-label={viewingPastDay ? t('Comidas de {dia}', { dia: selectedDay.etiqueta }) : t('Comidas de hoy')}>
                {/* [P1-DIARY-EDITABLE · 2026-07-28] Lista de comidas registradas —
                    si hay un día pasado seleccionado en SemanaEnProgreso, muestra ESE día (nunca el de hoy). */}
                {(!loading && _todaysMeals.length > 0 || viewingPastDay) && (
                    <div className={styles.mealsSection}>
                        {/* [P1-DIA-UNIFICADO] misma cabecera que «Micros»: icono, título y una línea de contexto */}
                        <div className={styles.microsHead}>
                            <span className={styles.microsIcon} aria-hidden="true"><Utensils size={16} strokeWidth={2.4} /></span>
                            <div>
                                <h3 className={styles.microsTitle}>
                                    {viewingPastDay
                                        ? t('Comidas de {dia}', { dia: selectedDay.etiqueta })
                                        : t('Comidas de hoy')}
                                </h3>
                                {/* hoy el conteo ya está en la cabecera y las kcal en su barra: solo un día pasado lo necesita */}
                                {viewingPastDay && _listMeals.length > 0 && !selectedDayState.loading && (
                                    <p className={styles.microsSub}>
                                        {tn(_listMeals.length, '{n} comida', '{n} comidas', { n: _listMeals.length })} · {formatNumber(kcalDelDia)} kcal
                                    </p>
                                )}
                            </div>
                        </div>
                        {viewingPastDay && selectedDayState.loading ? (
                            <p className={styles.mealsEmptyDay}>{t('Cargando comidas...')}</p>
                        ) : viewingPastDay && _listMeals.length === 0 ? (
                            <p className={styles.mealsEmptyDay}>{t('Sin comidas registradas este día')}</p>
                        ) : (
                        <>
                                <ul className={styles.mealsList}>
                                    {visibleMeals.map((meal, idx) => {
                                        const horaTxt = _horaDeComida(meal.consumed_at);
                                        return (
                                        <li
                                            key={meal.id || `${meal.meal_name}-${meal.consumed_at || idx}`}
                                            className={styles.mealRow}
                                        >
                                            {/* [P1-PLAN-LOTE-721] la fila abre la ficha del plato (sin id —una fila vieja en caché— no) */}
                                            <button
                                                type="button"
                                                className={styles.mealOpen}
                                                onClick={() => setFichaMeal(meal)}
                                                disabled={!meal.id}
                                            >
                                                {meal.id && idsConFoto.has(meal.id) && (
                                                    <MiniaturaDeComida userId={userId} mealId={meal.id} className={styles.mealThumb} />
                                                )}
                                                {/* Sin foto, un hueco del mismo tamaño: los nombres arrancan todos en la misma columna. */}
                                                {!(meal.id && idsConFoto.has(meal.id)) && (
                                                    <span className={styles.mealThumbEmpty} aria-hidden="true"><Utensils size={17} strokeWidth={2.2} /></span>
                                                )}
                                                <span className={styles.mealInfo}>
                                                    {/* [P1-PLAN-LOTE-225] el nombre en el idioma del usuario (el dato no cambia) */}
                                                    <span className={styles.mealName}>{nombreDeFila(meal, planData, t)}</span>
                                                    <span className={styles.mealMeta}>
                                                        {_mealTypeLabel(meal.meal_type, t)} · {Math.round(meal.calories) || 0} kcal{horaTxt ? ` · ${horaTxt}` : ''}
                                                    </span>
                                                </span>
                                                {meal.id && <ChevronRight size={16} strokeWidth={2.4} className={styles.mealChevron} aria-hidden="true" />}
                                            </button>
                                            {meal.id && (
                                                <button
                                                    type="button"
                                                    className={styles.mealDeleteBtn}
                                                    aria-label={t('Eliminar {nombre} del diario', { nombre: nombreDeRegistro(meal.meal_name, planData, t) })}
                                                    onClick={() => handleDeleteMeal(meal)}
                                                    disabled={deletingMealId === meal.id}
                                                >
                                                    {deletingMealId === meal.id
                                                        ? <Loader2 size={16} className="spin-animation" aria-hidden="true" />
                                                        : <Trash2 size={16} strokeWidth={2.5} aria-hidden="true" />}
                                                </button>
                                            )}
                                        </li>
                                        );
                                    })}
                                </ul>
                                {hiddenMealsCount > 0 && (
                                    <button
                                        type="button"
                                        className={styles.mealsShowMore}
                                        onClick={() => setMealsExpanded(true)}
                                    >
                                        {t('Ver {n} más', { n: hiddenMealsCount })}
                                    </button>
                                )}
                                {mealsExpanded && _listMainMeals.length > _MEALS_VISIBLE_CAP && (
                                    <button
                                        type="button"
                                        className={styles.mealsShowMore}
                                        onClick={() => setMealsExpanded(false)}
                                    >
                                        {t('Ver menos')}
                                    </button>
                                )}

                                {/* [BB-025 / P1-DIARY-COMPLEMENTS-SECTION · 2026-11-03]
                                    Apartado separado para Bebidas Ligeras y Complementos (té, infusiones, suplementos) */}
                                {_listComplements.length > 0 && (
                                    <>
                                        <div className={styles.complementsDivider}>
                                            <span>{t('Complementos y bebidas')} ({_listComplements.length})</span>
                                            <div className={styles.complementsDividerLine} aria-hidden="true" />
                                        </div>
                                        <ul className={styles.complementsList}>
                                            {_listComplements.map((comp, idx) => {
                                                const horaTxt = _horaDeComida(comp.consumed_at);
                                                return (
                                                <li
                                                    key={comp.id || `${comp.meal_name}-${comp.consumed_at || idx}`}
                                                    className={`${styles.mealRow} ${styles.complementRow}`}
                                                >
                                                    <button
                                                        type="button"
                                                        className={styles.mealOpen}
                                                        onClick={() => setFichaMeal(comp)}
                                                        disabled={!comp.id}
                                                    >
                                                        {comp.id && idsConFoto.has(comp.id) && (
                                                            <MiniaturaDeComida userId={userId} mealId={comp.id} className={styles.mealThumb} />
                                                        )}
                                                        {!(comp.id && idsConFoto.has(comp.id)) && (
                                                            <span className={styles.mealThumbEmpty} aria-hidden="true"><CupSoda size={17} strokeWidth={2.2} /></span>
                                                        )}
                                                        <span className={styles.mealInfo}>
                                                            <span className={styles.mealName}>{nombreDeRegistro(comp.meal_name, planData, t)}</span>
                                                            <span className={styles.mealMeta}>
                                                                {_mealTypeLabel(comp.meal_type === 'suplemento' ? 'suplemento' : 'complemento', t)} · {Math.round(comp.calories) || 0} kcal{horaTxt ? ` · ${horaTxt}` : ''}
                                                            </span>
                                                        </span>
                                                        {comp.id && <ChevronRight size={16} strokeWidth={2.4} className={styles.mealChevron} aria-hidden="true" />}
                                                    </button>
                                                    {comp.id && (
                                                        <button
                                                            type="button"
                                                            className={styles.mealDeleteBtn}
                                                            aria-label={t('Eliminar {nombre} del diario', { nombre: nombreDeRegistro(comp.meal_name, planData, t) })}
                                                            onClick={() => handleDeleteMeal(comp)}
                                                            disabled={deletingMealId === comp.id}
                                                        >
                                                            {deletingMealId === comp.id
                                                                ? <Loader2 size={16} className="spin-animation" aria-hidden="true" />
                                                                : <Trash2 size={16} strokeWidth={2.5} aria-hidden="true" />}
                                                        </button>
                                                    )}
                                                </li>
                                                );
                                            })}
                                        </ul>
                                    </>
                                )}
                        </>
                        )}
                    </div>
                )}
                {/* [P1-PLAN-LOTE-105 · 2026-09-18] Los micros, misma lista que el diario de días anteriores.
                    [P1-DIA-UNIFICADO] Bajo las comidas que los produjeron, en la misma pieza; del día que se mira. */}
                <div className={styles.microsSection}>
                    <div className={styles.microsHead}>
                        <span className={styles.microsIcon} aria-hidden="true"><FlaskConical size={16} strokeWidth={2.4} /></span>
                        <div>
                            <h3 className={styles.microsTitle}>{t('Micros')}</h3>
                            <p className={styles.microsSub}>
                                {microsCargando ? t('Cargando registros...') : subtituloMicros(microsDelDia.coverage)}
                            </p>
                        </div>
                    </div>
                    <MicrosList
                        micros={microsDelDia.micros}
                        coverage={microsCargando ? null : microsDelDia.coverage}
                        metas={microTargets}
                        sourcesContext="tracking"
                    />
                </div>

            </section>
            )}


            {!isLoggedIn && <HealthSources context="tracking" />}

            {/* [P1-GOAL-ETA · 2026-07-03] Plazo estimado hasta la meta de peso —
                plan_data.goal_eta lo calcula el backend con el déficit REAL entregado
                (post ritmo + pisos clínicos). Solo aparece si el usuario dio meta
                cuantificada (planes viejos/invitados: oculto). El title lleva la nota de
                honestidad (estimación energética).

                [P1-MACRO-ROW-MOBILE · 2026-08-11] Bajado desde la cabecera. Fuera del
                bloque `isLoggedIn && !loading` a propósito: su condición propia
                (`goal_eta`) ya lo restringe a quien tiene meta cuantificada, y meterlo
                dentro lo haría parpadear en cada recarga del diario. */}
            {/* [P1-PLAN-LOTE-165 · 2026-09-22] El ritmo y la nota llegan del servidor en español: el código del ritmo
                («moderado») se pintaba crudo entre paréntesis y la nota de honestidad salía en español en el tooltip.
                Ahora el ritmo usa la etiqueta del formulario y la nota su traducción. */}
            {planData?.goal_eta?.weeks_estimate ? (
                <div className={styles.etaChip} title={t('Estimación energética (~7,700 kcal ≈ 1 kg): el ritmo real varía con la adherencia, la retención de agua y la adaptación metabólica.')}>
                    <Flag size={13} strokeWidth={2.5} aria-hidden="true" />
                    {/* [P1-PLAN-LOTE-167] con plural: salía «~1 semanas» */}
                    {tn(planData.goal_eta.weeks_estimate,
                        'Meta: {peso} · ~{semanas} semana a tu ritmo',
                        'Meta: {peso} · ~{semanas} semanas a tu ritmo', {
                            peso: planData.goal_eta.target_weight_display,
                            semanas: planData.goal_eta.weeks_estimate,
                        })}{(() => {
                        const ritmo = { gradual: t('Gradual'), moderado: t('Moderado'), decidido: t('Decidido') }[planData.goal_eta.pace];
                        return ritmo ? ` (${ritmo})` : '';
                    })()}
                </div>
            ) : null}

            </div>

            {/* [P1-DIARY-HISTORY · 2026-07-31] */}
            {isLoggedIn && (
                <DiaryHistory
                    open={historyOpen}
                    onClose={() => setHistoryOpen(false)}
                    userId={userId}
                    targetCalories={goalCal}
                    targetMacros={{ protein: goalPro, carbs: goalCarb, fats: goalFat }}
                    targetMicros={microTargets}
                    mainGoal={resolvedMainGoal}
                    diaInicial={historyDia}
                />
            )}

            {/* [P2-DIARY-SCAN-MACROS · 2026-05-30] Modal de escaneo. Solo se
                renderiza para usuarios logueados (el botón no aparece para
                invitados). */}
            {isLoggedIn && (
                <>
                    {/* [P1-MANUAL-FOOD-LOG · 2026-08-11] El componedor manual, hermano
                        del escáner. Montaje condicional (no isOpen-interno) porque el
                        modal hace fetch del catálogo al montar: montarlo cerrado sería
                        pagar ese fetch en cada visita al dashboard. */}
                    {logOpen && (
                        <LogMealModal onClose={handleLogClose} onScan={handleLogToScan} initialMealType={logOpen?.mealType || null} initialDaysAgo={logOpen?.daysAgo || 0} initialBorrador={logOpen?.borrador || null} />
                    )}
                    {fichaMeal && (
                        <Suspense fallback={null}>
                            <FichaDeComida
                                key={fichaMeal.id}
                                meal={fichaMeal}
                                userId={userId}
                                metas={{ calories: goalCal, protein: goalPro, carbs: goalCarb, fats: goalFat }}
                                microMetas={microTargets}
                                onClose={handleFichaClose}
                                onEliminar={handleDeleteMeal}
                            />
                        </Suspense>
                    )}
                    {shareOpen && (
                        <Suspense fallback={null}>
                            <ShareDaySheet
                                onClose={handleShareClose}
                                consumed={displayedConsumed}
                                metas={{ calories: goalCal, protein: goalPro, carbs: goalCarb, fats: goalFat }}
                                microMetas={microTargets}
                            />
                        </Suspense>
                    )}
                    {scanOpen && (
                        <Suspense fallback={null}>
                            <ScanMealModal
                                isOpen={!!scanOpen}
                                onClose={handleScanClose}
                                onBack={handleScanBack}
                                userId={userId}
                                initialMealType={scanOpen?.mealType}
                                initialDaysAgo={scanOpen?.daysAgo || 0}
                            />
                        </Suspense>
                    )}
                </>
            )}
        </div>
        </div>
    );
};

TrackingProgress.propTypes = {
    planData: PropTypes.object.isRequired,
    userId: PropTypes.string,
    flatOnMobile: PropTypes.bool,
    // [P1-PLAN-LOTE-105] metas de los ocho micros (`/api/nutrition/targets.micros`); null = sin barra
    microTargets: PropTypes.object,
    referenceProfile: PropTypes.object,
};

// --- Componente Interno para Barra Individual ---
// [P1-MACRO-BARS-SEMAFORO · 2026-11-26] Una sola tinta por estado (CSS: `.state_progress/done/over`, con tokens
// `--success*`/`--danger*`, iguales en claro y oscuro). El nutriente se reconoce por su icono y su nombre; el color
// queda libre para decir lo único que importa al mirar de lejos: en curso, cumplida o pasada.
const _STATE_CLASS = { progress: 'state_progress', done: 'state_done', over: 'state_over', short: 'state_short' };

const ProgressBar = ({
    label,
    consumed: consumedReal,
    goal,
    reference,
    unit,
    perc,
    icon: Icon,
    darkIcon: DarkIcon,
    state = 'progress',
    large,
    fillIcon,
    fillWhiteStroke,
    statusOverride,
    cerrado = false,
}) => {
    const t = useT();
    const isEmpty = perc === 0;
    // [P1-PLAN-LOTE-688] el número SUBE a la vista cuando el coach anota (la barra ya crecía con transición). Se sigue
    // llamando `consumed`: `formatNumber(consumed)` es el ancla de test_p3_i18n_metrica_coma_clavada.
    const consumed = useNumeroAnimado(consumedReal);
    const isDark = isDarkActive();
    const doFillSolid = fillIcon && isDark;
    const doFillWhite = fillWhiteStroke && isDark;
    const referencePerc = reference ? reference / goal * 100 : null;
    const scaleMax = referencePerc ? referencePerc * 1.08 : 100;
    const goalPosition = 100 / scaleMax * 100;
    const referencePosition = referencePerc ? referencePerc / scaleMax * 100 : null;
    // With reference ticks, geometry must remain proportional. Only the text
    // badge has a minimum position so small values stay readable.
    const proportionalWidth = Math.min(100, Math.max(0, perc / scaleMax * 100));
    const fillWidth = referencePerc ? proportionalWidth : perc <= 0 ? 0 : Math.max(proportionalWidth, 18);
    const badgePosition = Math.max(fillWidth, 18);
    // [P1-MACRO-BARS-SEMAFORO] El texto mira a la meta mientras no llegas y al límite solo cuando ya la pasaste:
    // «A 124 g del límite» con 55 g comidos respondía una pregunta que nadie se estaba haciendo.
    const toGoal = goal - consumedReal;
    const toLimit = reference ? reference - consumedReal : null;
    const fmt = (n) => formatNumber(Math.abs(n), { maximumFractionDigits: 0 });
    let defaultStatusText;
    if (reference && toGoal <= 0) {
        defaultStatusText = toLimit > 0 ? t('A {n} g del límite', { n: fmt(toLimit) })
            : toLimit < 0 ? t('{n} g sobre el límite', { n: fmt(toLimit) }) : t('En el límite máximo');
    } else {
        defaultStatusText = toGoal > 0
            ? (cerrado ? t('Faltaron {n} {unit} para la meta', { n: fmt(toGoal), unit }) : t('Faltan {n} {unit} para la meta', { n: fmt(toGoal), unit }))
            : toGoal < 0 ? t('{n} {unit} sobre la meta', { n: fmt(toGoal), unit }) : t('Meta alcanzada');
    }
    // un día cerrado en verde (≥90 %) ya cumplió: «Faltaron 9 g» bajo un ✓ verde se contradecía
    if (cerrado && state === 'done' && toGoal > 0) defaultStatusText = t('Meta cumplida');
    const statusText = statusOverride || defaultStatusText;
    const stateClass = styles[_STATE_CLASS[state] || _STATE_CLASS.progress];

    const iconSize = large ? 24 : 20;
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
        <div className={`${large ? styles.barLarge : styles.barSmall} ${stateClass}`} data-state={state}>
            <div className={styles.barHeader}>
                <div className={styles.barLabelGroup}>
                    <div className={styles.barIcon}>
                        {renderedIcon}
                    </div>
                    <span className={styles.barLabel}>
                        {label}
                    </span>
                </div>
                <div className={styles.barValues}>
                    <span className={isEmpty ? `${styles.barConsumed} ${styles.barConsumedEmpty}` : styles.barConsumed}>
                        {formatNumber(consumed)}
                    </span>
                    <span className={styles.barGoal}>
                        / {formatNumber(goal)} {unit}
                    </span>
                </div>
            </div>

            <div
                className={styles.track}
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={scaleMax}
                aria-valuenow={Math.min(scaleMax, Math.max(0, perc))}
                aria-valuetext={`${formatNumber(consumedReal)} / ${formatNumber(goal)} ${unit} (${formatPercent(perc)}). ${statusText}`}
            >
                <div
                    className={styles.fill}
                    data-state={state}
                    style={{ width: `${fillWidth}%` }}
                />
                {reference && <>
                    <span className={styles.goalMarker} style={{ left: `${goalPosition}%` }} aria-hidden="true" />
                    <span className={styles.referenceMarker} style={{ left: `${referencePosition}%` }} aria-hidden="true" />
                </>}
                {/* [P3-TRACKING-PERC-INSIDE-ALWAYS · 2026-05-22] % real (uncapped) dentro del relleno, estilo batería. */}
                {!isEmpty && (
                    <span
                        className={styles.fillPerc}
                        style={{ left: `${badgePosition}%` }}
                    >
                        {formatPercent(perc)}
                    </span>
                )}
            </div>

            {/* Pie: a la izquierda el estado (lo que se lee), a la derecha la leyenda de las marcas (lo que se consulta). */}
            <div className={styles.barFoot}>
                <p className={styles.barRemaining}>
                    {state === 'done' && <Check size={13} strokeWidth={3} className={styles.statusIcon} aria-hidden="true" />}
                    {(state === 'over' || state === 'short') && <AlertCircle size={13} strokeWidth={2.6} className={styles.statusIcon} aria-hidden="true" />}
                    <span>{statusText}</span>
                </p>
                {/* Sin referencia la barra no lleva marcas: una leyenda «Meta 100%» sola no señala nada. */}
                <div className={reference ? styles.barGuide : `${styles.barGuide} ${styles.barGuideSolo}`}>
                    <span><i className={styles.goalKey} aria-hidden="true" />{t('Meta')} {formatPercent(100)}</span>
                    {reference && <span title={`${t('Límite máximo diario recomendado, calculado con las calorías de tu plan')} · ${formatNumber(reference, { maximumFractionDigits: 0 })} g`}>
                        <i className={styles.referenceKey} aria-hidden="true" />{t('Límite máximo')} {formatPercent(referencePerc)}
                    </span>}
                </div>
            </div>

            {/* [P3-TRACKING-PERC-DESKTOP] pill retirada a la vista (`.percRow { display: none }`), conservada como ancla. */}
            {!isEmpty && (
                <div className={styles.percRow}>
                    <span className={styles.percChip}>
                        {formatPercent(perc)}
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
    reference: PropTypes.number,
    unit: PropTypes.string,
    perc: PropTypes.number,
    icon: PropTypes.elementType,
    darkIcon: PropTypes.elementType,
    state: PropTypes.oneOf(['progress', 'done', 'over', 'short']),
    large: PropTypes.bool,
    fillIcon: PropTypes.bool,
    fillWhiteStroke: PropTypes.bool,
    statusOverride: PropTypes.string,
    cerrado: PropTypes.bool,
};

export default TrackingProgress;
