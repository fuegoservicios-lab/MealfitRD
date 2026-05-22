import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import { useRegeneratePlan } from '../hooks/useRegeneratePlan';
import { motion, AnimatePresence } from 'framer-motion';
import { requestNotificationPermission, subscribeToPushNotifications, isPushSupported } from '../utils/pushNotifications';

import { useNavigate, Navigate, Link } from 'react-router-dom';
import {
    Zap, Flame, ArrowRight, CheckCircle,
    RefreshCw, ChefHat, Heart, Pill, Lock,
    Brain, Wallet, AlertCircle, Dumbbell,
    Lightbulb, Wand2, Clock, BookOpen, Loader2, Target, ShoppingCart, ChevronDown,
    ThumbsDown, Shuffle, X, Utensils, Copy, Infinity as InfinityIcon
} from 'lucide-react';
import { toast } from 'sonner';
import TrackingProgress from '../components/dashboard/TrackingProgress';
// [P3-WATER-TRACKER · 2026-05-16] Tracker de hidratacion (8 vasos diarios)
// reemplaza el card "Mi Nevera" que duplicaba la pagina Pantry.
import WaterTracker from '../components/dashboard/WaterTracker';
import Modal from '../components/common/Modal';
import OptionPickerModal from '../components/common/OptionPickerModal';
import EmptyState from '../components/common/EmptyState';
import { supabase } from '../supabase';
// [P2-LAZY-PDF · 2026-05-13] html2pdf.js (976 KB) se importa dinámico
// dentro del handler de descarga — ver `await import('html2pdf.js')` más
// abajo. Pre-fix era import estático top-level: el chunk se fetch eager
// al entrar al Dashboard, 100% de usuarios pagan el costo aunque jamás
// descarguen PDF. Tooltip-anchor: P2-LAZY-PDF.
import { API_BASE, fetchWithAuth, getPlanChunkStatus } from '../config/api';
import { trackEvent } from '../utils/analytics';
// [P3-RESTOCK-FLOW-SPEED · 2026-05-20] Cache compartido de inventory. Tras
// el restock, Dashboard populá este singleton de modo que Pantry.jsx monta
// con `inventory = getCachedInventory()` ya poblado → cero skeleton + cero
// fetch dup. Pre-fix Pantry hacía su propio fetch al mount (~300-800ms)
// pese a que Dashboard ya había hecho refetch para `setLiveInventory`.
import { getCachedInventory, setCachedInventory, invalidateInventoryCache } from '../utils/pantryCache';
import { safeJSONParse } from '../utils/safeJSONParse';
import { getActiveShoppingList, calculateAllPlanIngredients, fetchFreshInventoryWithTimeout, getInventoryFetchTimeoutMs, computePdfLayoutDensity, PDF_LAYOUT_THRESHOLDS, parseMarketQty, resolveShopQty, escapeHtml } from '../utils/shoppingHelpers';
import { emitCoherenceToast, emitHistoricalCoherenceToast } from '../utils/renderCoherenceWarnings';
// [P1-FORM-9] Helper que filtra flags internos `_*` y bloquea cuando la
// hidratación cifrada del formData (post-login) parece estar en curso —
// evita que el spread `{...formData}` envíe campos sensibles vacíos a DB,
// pisando datos médicos previos. Ver `secureFormStorage.js` para el
// rationale completo.
import { buildHealthProfilePayload } from '../config/secureFormStorage';

// ⚡ BOLT OPTIMIZATION: Hoisted stop words and pre-compiled regex for normalizeNameAlt
// Replicating exactly backend's (shopping_calculator.py line 103) stop words.
const INGREDIENT_STOP_WORDS = ['picada', 'picado', 'en tiras', 'en cubos', 'rallado', 'rallada',
    'magra', 'magro', 'para rebozar', 'en hojuelas', 'hervida', 'desmenuzada',
    'fresco', 'fresca', 'cocido', 'cocida', 'pelada', 'pelado', 'en dados',
    'al gusto', 'en aros', 'en trozos', 'en rodajas', 'en porciones',
    'sin piel', 'sin hueso', 'crudo', 'cruda', 'asado', 'asada',
    'entero', 'entera', 'fina', 'finas', 'gruesa', 'gruesas',
    'horneado', 'grandes', 'firme'];

const STOP_WORDS_REGEX = new RegExp('\\b(' + INGREDIENT_STOP_WORDS.join('|') + ')\\b', 'gi');

// [P3-UPDATE-PLATOS-REQUIRES-PANTRY · 2026-05-17] Mínimo de alimentos en la
// Nevera para desbloquear "Actualizar platos". Con menos ítems el LLM no
// puede regenerar platos significativos (regeneración usa el inventory real
// como ingredient pool). UX decision: usuario reportó que el botón se podía
// clickear con nevera vacía → modal abría → flujo sin sentido. Threshold de
// 3 permite construir 1-2 platos variados sin ser restrictivo.
const PANTRY_MIN_ITEMS_FOR_UPDATE = 3;

const Dashboard = () => {
    // 1. Obtenemos estado y funciones del Contexto Global
    const {
        planData,
        likedMeals,
        toggleMealLike,
        regenerateSingleMeal, // Ahora esta función es ASYNC (llama a la IA)
        formData,
        planCount,
        PLAN_LIMIT,
        userPlanLimit,
        remainingCredits,
        isPremium,
        userProfile,
        loadingData,
        setCurrentStep,
        updateData,
        refreshProfileAndPlan,
        restoreSessionData,
        setPlanData,
        setRecalcLock,
        withRecalcLock,
        updateUserProfile,
        saveGeneratedPlan,
        checkPlanLimit,
        // [P1-FORM-9] `session` requerido por `buildHealthProfilePayload` para
        // detectar race de hidratación cifrada. Si está ausente (guest), el
        // helper desactiva el gate y deja pasar el update.
        session
    } = useAssessment();

    const { regeneratePlan } = useRegeneratePlan();

    const navigate = useNavigate();

    // Estado local para saber qué tarjeta se está regenerando (loading spinner específico)
    const [regeneratingId, setRegeneratingId] = useState(null);
    // Background Chunking: controlar visibilidad del banner de generación
    const [showChunkBanner, setShowChunkBanner] = useState(
        () => planData?.generation_status === 'partial'
    );
    // [P0-DASH-CHIP-HONESTY · 2026-05-09] Snapshot del /chunk-status
    // del plan ACTIVO. Permite que el slot de día faltante distinga
    // "en camino" (in_flight > 0) de "pausado" (pending_user_action > 0)
    // sin depender solo de plan_data.generation_status, que puede
    // declarar "generating_next" mientras la queue tiene chunks
    // pausados por nevera vacía u otra causa. Polling reuse del mismo
    // useEffect que ya refresca el plan cada 30s en estado 'partial'.
    // Shape: { in_flight_count, pending_user_action_count, failed_count,
    //          completed_count, paused_chunks: [{reason_code, ...}] } | null.
    const [chunkStatusInfo, setChunkStatusInfo] = useState(null);
    // Estado para el modal de razón de cambio de plato
    const [swapModal, setSwapModal] = useState(null); // { dayIndex, mealIndex, mealType, mealName }
    const [swapDislikeConfirm, setSwapDislikeConfirm] = useState(null); // { dayIndex, mealIndex, mealType, mealName }
    const [showUpdatePlanModal, setShowUpdatePlanModal] = useState(false);
    const [showDislikeConfirmModal, setShowDislikeConfirmModal] = useState(false);
    const [sessionRestocked, setSessionRestocked] = useState(false);
    const [showDespensaDropdown, setShowDespensaDropdown] = useState(false);
    const despensaDropdownRef = useRef(null);

    // Cierra los dropdowns custom si el usuario hace clic fuera de ellos
    useEffect(() => {
        function handleClickOutside(event) {
            if (despensaDropdownRef.current && !despensaDropdownRef.current.contains(event.target)) {
                setShowDespensaDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Estado local para la navegación por pestañas (Días)
    const [activeDayIndex, setActiveDayIndex] = useState(0);
    const [isRecalculating, setIsRecalculating] = useState(false);

    // [P3-WATER-TRACKER · 2026-05-16] Detector de viewport mobile (≤768px,
    // mismo breakpoint que el resto de las media queries del Dashboard).
    // Determina si <WaterTracker /> se renderiza ENCIMA del menu de comidas
    // (mobile) o dentro de la columna derecha junto a Insights (desktop).
    // Una sola instancia activa a la vez evita doble fetch + state divergente.
    const [isMobileViewport, setIsMobileViewport] = useState(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false;
        return window.matchMedia('(max-width: 768px)').matches;
    });
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined;
        const mq = window.matchMedia('(max-width: 768px)');
        const handler = (e) => setIsMobileViewport(e.matches);
        // Safari < 14 usa addListener/removeListener. Probamos ambas APIs.
        if (mq.addEventListener) {
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }
        mq.addListener(handler);
        return () => mq.removeListener(handler);
    }, []);

    // Estado para "Nevera Virtual" - ingredientes temporalmente marcados como agotados
    // Persistido en localStorage para sobrevivir recargas de página y navegación
    const [disabledIngredients, setDisabledIngredients] = useState(() => {
        // [P2-A · 2026-05-08] SSOT migration de try/catch ad-hoc a safeJSONParse.
        // Validator estricto: array DE STRINGS (regresión histórica: si entró algún
        // payload con shape incorrecto, el `every(i => typeof i === 'string')`
        // lo filtraba; preservamos esa garantía explícitamente).
        const saved = localStorage.getItem('mealfit_disabled_ingredients');
        return safeJSONParse(saved, [], {
            validator: (v) => Array.isArray(v) && v.every(i => typeof i === 'string'),
        });
    });

    // Estados para Compras con 1 clic
    const [showRestockModal, setShowRestockModal] = useState(false);
    const [isRestocking, setIsRestocking] = useState(false);
    // [P3-RESTOCK-NO-BAR · 2026-05-20] State acoplado a la barra REMOVIDO:
    // contador rAF de progreso, trigger fast-finish, constantes de duración,
    // useEffect rAF driver, useEffect watcher modal-close. Decisión de
    // producto: el modal ahora muestra solo icon spinner + título +
    // descripción; cierra directamente post-response success. Bundle
    // Dashboard.jsx bajó ~8KB. Tooltip-anchor: P3-RESTOCK-NO-BAR.

    // Estados para GAP 8 (Bandas informativas de modales)
    const [hoveredUpdateOption, setHoveredUpdateOption] = useState(null);
    const [hoveredSwapOption, setHoveredSwapOption] = useState(null);

    // Estados para GAP 9 (Carga inline tras el clic)
    const [isNavigatingOption, setIsNavigatingOption] = useState(null);

    // Helper: Resetear/restaurar estado de restock según la configuración
    // Si el usuario vuelve a los mismos valores con los que registró compras,
    // la nevera ya tiene esas cantidades → no mostrar botón de nuevo.

    // Estado para el modal de Onboarding de Alertas Inteligentes
    const [showPushOnboarding, setShowPushOnboarding] = useState(false);
    const [isPushEnabling, setIsPushEnabling] = useState(false);

    // Guard contra race condition: evita que la rotación automática dispare handleNewPlan()
    // al mismo tiempo que una acción manual del usuario (movido a useRegeneratePlan)

    // GAP 5: Helper asíncrono para validar créditos usando estado fresco del backend
    //
    // [P1-CREDITS-CHECK-TTL · 2026-05-20] TTL subido 5s → 120s. El bug del
    // delay al clickear "Actualizar platos" reportado 2026-05-20 venía de
    // este fetch de ~200-500ms al backend `/api/user/credits/<id>`. El cache
    // de 5s era demasiado corto — cada interacción del user con el botón
    // pagaba fetch fresco. El `planCount` solo cambia al regenerar plan
    // (mutación que invalida el cache manualmente vía `checkPlanLimit`
    // post-success) o al month rollover (que pasa una vez/mes, no en
    // sesión activa). 120s captura clicks rápidos sin perder correctness.
    //
    // [P1-CREDITS-OPTIMISTIC · 2026-05-20] El check optimista lee primero
    // del `planCount` del context (que se hidrata al login del context y
    // se mantiene fresh por mutaciones explícitas). Solo si el cache local
    // de quota expiró Y el context no tiene valor confiable, hace fetch
    // bloqueante. Resultado: 99% de los clicks son síncronos, modal abre
    // instantáneo.
    const validateCreditsAsync = async () => {
        try {
            const now = Date.now();
            // Fast path: context tiene planCount fresco (cargado al login).
            // userPlanLimit '∞' o 'Ilimitado' → siempre dejar pasar.
            if (userPlanLimit === '∞' || userPlanLimit === 'Ilimitado' || typeof userPlanLimit !== 'number') {
                return true;
            }
            // Si el cache local está vigente (<120s), validar SIN fetch.
            let freshPlanCount = window.__cachedQuota;
            const _CACHE_TTL_MS = 120 * 1000; // 2 min (era 5s)
            if (typeof freshPlanCount !== 'number' || now - (window.__lastQuotaCheckTime || 0) > _CACHE_TTL_MS) {
                freshPlanCount = await checkPlanLimit(userProfile?.id);
                window.__cachedQuota = freshPlanCount;
                window.__lastQuotaCheckTime = now;
            }

            if (freshPlanCount >= userPlanLimit) {
                toast.error('Sin créditos', { description: 'No tienes créditos de regeneración disponibles.' });
                return false;
            }
            return true;
        } catch (error) {
            console.error("Error validating credits:", error);
            return true; // Si hay error, dejamos pasar para que falle en el hook principal
        }
    };
    
    // Inventario real (user_inventory en DB) — sincronizado con la Nevera física
    //
    // [P1-DASHBOARD-CACHE-INVENTORY · 2026-05-20] Lazy initializer lee del
    // cache singleton de Pantry. Pre-fix: `useState(null)` arrancaba sin
    // datos → spinner visible cada vez que el user navegaba Plan/Agente →
    // Dashboard. El cache `pantryCache.js` ya almacenaba el inventory tras
    // cada visita a Nevera (P3-PANTRY-CACHE) PERO Dashboard NO lo leía al
    // mount — Dashboard solo guardaba (setCachedInventory) sin leer.
    //
    // Fix: hidratar desde el cache singleton. Si Pantry tiene cache fresco
    // (<10min tras P1-PANTRY-TTL-BUMP), arranca con datos → cero flash.
    // Si no, queda en null y el fetchInventory normal lo popula.
    const _cachedInv = getCachedInventory();
    const [liveInventory, setLiveInventory] = useState(_cachedInv || null);
    const [isLoadingInventory, setIsLoadingInventory] = useState(!_cachedInv);

    // [P3-PLAN-BTN-STABLE · 2026-05-19] Cache del último conteo conocido del
    // inventario en localStorage, keyed por user_id. Bootstrap del primer paint
    // del botón "Llena tu Nevera"/"Actualizar platos" para que coincida con su
    // estado final post-fetch. Pre-fix: al volver al apartado Plan, el primer
    // paint asumía "Actualizar platos" (verde) por `isLoadingInventory=true`,
    // y cuando el fetch resolvía ms después con <PANTRY_MIN_ITEMS_FOR_UPDATE
    // items, flippeaba a "Llena tu Nevera" (gris) → flash visible. P3-PLAN-BTN-
    // NO-FLASH del mismo día solo acotó el `transition` CSS; este fix cierra
    // el caso real (cambio de render-state, no de CSS). Los otros botones
    // ("Ya compré todo", "PDF") no flashean porque no dependen del fetch async.
    const _pantryCountCacheKey = userProfile?.id ? `mealfit_pantry_count_${userProfile.id}` : null;
    // Lazy initializer: `useState(fn)` solo ejecuta la lectura en el primer
    // render, no en cada keystroke / state change posterior.
    const [cachedPantryCount, setCachedPantryCount] = useState(() => {
        try {
            // Si userProfile.id aún no está disponible en el primer render,
            // intentamos un read "anon" — el effect de abajo re-lee cuando
            // _pantryCountCacheKey aparezca.
            const initialUid = userProfile?.id;
            if (!initialUid) return null;
            const v = localStorage.getItem(`mealfit_pantry_count_${initialUid}`);
            const n = v == null ? null : parseInt(v, 10);
            return Number.isFinite(n) && n >= 0 ? n : null;
        } catch { return null; }
    });
    // Si userProfile.id se resuelve tarde (auth context cargando), re-leemos
    // el cache. No-op si ya cargamos en el lazy initializer.
    useEffect(() => {
        if (!_pantryCountCacheKey) return;
        try {
            const v = localStorage.getItem(_pantryCountCacheKey);
            const n = v == null ? null : parseInt(v, 10);
            if (Number.isFinite(n) && n >= 0) setCachedPantryCount(n);
        } catch { /* private mode / quota */ }
    }, [_pantryCountCacheKey]);
    // [P1-5] Indicador persistente de "Nevera potencialmente desactualizada".
    // Antes este estado solo vivía como variable local dentro de
    // `handleDownloadShoppingList` y era visible solo DENTRO del PDF generado.
    // Si el usuario nunca generaba PDF (workflow rápido en móvil → click directo
    // en Restock), la advertencia "verifica antes de comprar" jamás llegaba.
    //
    // Ahora el flag es estado del Dashboard, alimentado por:
    //   - Initial mount fetch (`fetchFreshInventoryWithTimeout`) — true si timeout/error.
    //   - Visibility/focus refresh — idem.
    //   - Realtime postgres_changes callback — false al recibir push del server
    //     (la data acaba de venir directo desde Supabase, es fresca por definición).
    //   - `handleDownloadShoppingList` (PDF) — actualiza tras el fresh fetch.
    //   - `handleRestock` (P1-1) — actualiza tras el fresh fetch.
    //
    // Render: chip ámbar encima de la fila de botones (Update/Restock/PDF) cuando
    // está activo. Cierra el gap UX donde el usuario actuaba con caché stale sin
    // saberlo. El banner del PDF (P1-PDF-1) sigue existiendo como segunda capa
    // dentro del documento — el chip in-app es la primera línea.
    const [inventoryStale, setInventoryStale] = useState(false);

    // Tick que se actualiza a medianoche para que daysLeft y daysSinceCreation se recalculen
    const [todayDate, setTodayDate] = useState(() => {
        const d = new Date(); d.setHours(0, 0, 0, 0); return d;
    });
    useEffect(() => {
        const scheduleNextMidnight = () => {
            const now = new Date();
            const nextMidnight = new Date(now);
            nextMidnight.setDate(nextMidnight.getDate() + 1);
            nextMidnight.setHours(0, 0, 0, 0);
            const msUntilMidnight = nextMidnight - now;
            return setTimeout(() => {
                const d = new Date(); d.setHours(0, 0, 0, 0);
                setTodayDate(d);
                scheduleNextMidnight();
            }, msUntilMidnight);
        };
        const timer = scheduleNextMidnight();
        return () => clearTimeout(timer);
    }, []);

    const restockLock = useRef(false);
    // [P1-6] Candado síncrono para `handleDownloadShoppingList`. Mismo patrón
    // que `restockLock`: previene doble-disparo cuando el usuario hace
    // doble-click en el botón PDF antes de que `isRecalculating`/loading
    // toast estabilicen su estado en React. Sin este lock, dos llamadas
    // concurrentes a `fetchFreshInventoryWithTimeout` competían por
    // `setLiveInventory`/`setInventoryStale` y se descargaban dos PDFs
    // idénticos con telemetría duplicada (`pdf_stale_inventory_fallback`).
    const pdfLock = useRef(false);
    const disabledSyncTimer = useRef(null);
    const formDataRef = useRef(formData);
    useEffect(() => { formDataRef.current = formData; }, [formData]);

    // [P1-FORM-9] Wrapper que centraliza el patrón seguro de actualización de
    // `health_profile`. Reemplaza los 4 spread directos `{...formData}` que
    // existían (ver call-sites más abajo). Beneficios:
    //   1. Filtra flags internos `_*` (`_weightUnitTouched`, `_householdSizeTouched`,
    //      cualquier `_keyOtra`) — espejo del strip backend, evita ruido en DB.
    //   2. Detecta race de hidratación cifrada post-login: si el blob existe
    //      pero los arrays sensibles requeridos están vacíos, asume que la
    //      decodificación está in-flight, aborta el update y avisa al usuario.
    //      Sin este guard, un click muy rápido tras login podía sobrescribir
    //      `medicalConditions`/`allergies` con `[]` en DB, perdiendo datos
    //      médicos previos.
    //   3. Usa `formDataRef.current` para que el setTimeout debouncado de
    //      `disabledIngredients` (línea ~210) lea el snapshot MÁS RECIENTE
    //      cuando dispara, no el del momento en que se programó el timer.
    const safeUpdateHealthProfile = useCallback((overrides) => {
        if (!userProfile || typeof updateUserProfile !== 'function') return false;
        const payload = buildHealthProfilePayload(formDataRef.current, overrides, session);
        if (!payload) {
            toast.warning('Tu perfil aún se está cargando. Inténtalo en un momento.', {
                duration: 3500,
            });
            return false;
        }
        updateUserProfile({ health_profile: payload });
        return true;
    // formDataRef.current se lee desde el ref (siempre latest) → sin dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateUserProfile, userProfile, session]);

    // Hydrate disabledIngredients from DB on first load (merges with localStorage)
    useEffect(() => {
        if (!userProfile?.id || !userProfile.health_profile) return;
        const dbDisabled = userProfile.health_profile.disabled_ingredients;
        if (Array.isArray(dbDisabled) && dbDisabled.length > 0) {
            setDisabledIngredients(prev => [...new Set([...dbDisabled, ...prev])]);
        }
    }, [userProfile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync disabledIngredients → localStorage + Supabase (debounced) on every change
    useEffect(() => {
        try {
            if (disabledIngredients.length > 0) {
                localStorage.setItem('mealfit_disabled_ingredients', JSON.stringify(disabledIngredients));
            } else {
                localStorage.removeItem('mealfit_disabled_ingredients');
            }
        } catch (e) { /* quota exceeded or private mode */ }

        if (!userProfile?.id) return;
        clearTimeout(disabledSyncTimer.current);
        disabledSyncTimer.current = setTimeout(() => {
            // [P1-FORM-9] safeUpdateHealthProfile lee `formDataRef.current` →
            // siempre snapshot más reciente, equivalente al spread anterior.
            safeUpdateHealthProfile({ disabled_ingredients: disabledIngredients });
        }, 800);
    }, [disabledIngredients]); // eslint-disable-line react-hooks/exhaustive-deps

    // [P3-PLAN-BTN-STABLE · 2026-05-19] Sync del cache localStorage cada vez que
    // `liveInventory` cambia (cubre fetch inicial + realtime postgres_changes +
    // restock). Centralizar acá evita duplicar la escritura del cache en cada
    // callsite de `setLiveInventory`. SSOT: liveInventory.length → cache.
    useEffect(() => {
        if (!_pantryCountCacheKey || !Array.isArray(liveInventory)) return;
        const count = liveInventory.length;
        setCachedPantryCount(count);
        try { localStorage.setItem(_pantryCountCacheKey, String(count)); } catch { /* quota / private mode */ }
    }, [liveInventory, _pantryCountCacheKey]);

    // Fetch inventario real desde user_inventory (refleja consumos y ediciones de la Nevera)
    // [P1-5] Usa `fetchFreshInventoryWithTimeout` (cap 2000ms) y alimenta
    // `inventoryStale`. Si Supabase tarda o falla en el mount inicial, el
    // Dashboard arranca con `inventoryStale=true` y el chip ámbar se muestra
    // sobre los botones — el usuario sabe ANTES de actuar que su Nevera puede
    // estar desactualizada. Si la fetch funciona, baja el flag a false.
    useEffect(() => {
        if (!userProfile?.id) {
            setIsLoadingInventory(false);
            return;
        }
        const fetchLiveInventory = async () => {
            setIsLoadingInventory(true);
            const result = await fetchFreshInventoryWithTimeout(
                () => supabase
                    .from('user_inventory')
                    .select('ingredient_name, quantity, unit, created_at, master_ingredients(name, category, shelf_life_days)')
                    .eq('user_id', userProfile.id)
                    .gt('quantity', 0)
                    .order('ingredient_name', { ascending: true }),
                getInventoryFetchTimeoutMs(),
            );
            if (!result.stale) {
                setLiveInventory(result.data);
                setInventoryStale(false);
            } else {
                // Timeout/error/empty_response: no sobreescribimos liveInventory
                // (puede ser null en mount inicial; el delta degrada graceful con
                // null y el chip avisa al usuario).
                setInventoryStale(true);
                trackEvent('dashboard_initial_inventory_stale', {
                    reason: result.reason,
                    user_id: userProfile?.id,
                });
            }
            setIsLoadingInventory(false);
        };
        fetchLiveInventory();
    }, [userProfile?.id, planData]);

    // Real-time sync: si la Nevera o el chat-agent modifican el inventario, el Dashboard se actualiza solo
    useEffect(() => {
        if (!userProfile?.id) return;
        const channel = supabase
            .channel('dashboard-inventory-sync')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user_inventory',
                filter: `user_id=eq.${userProfile.id}`
            }, async () => {
                try {
                    const { data } = await supabase
                        .from('user_inventory')
                        .select('ingredient_name, quantity, unit, created_at, master_ingredients(name, category, shelf_life_days)')
                        .eq('user_id', userProfile.id)
                        .gt('quantity', 0)
                        .order('ingredient_name', { ascending: true });
                    if (data) {
                        setLiveInventory(data);
                        // [P1-5] El callback de postgres_changes solo dispara cuando
                        // Supabase pusheó un cambio: la siguiente lectura es fresca
                        // por definición. Bajamos el flag stale aunque hubiéramos
                        // arrancado en true por timeout del mount inicial.
                        setInventoryStale(false);
                    }
                } catch (e) { /* non-blocking */ }
            })
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR') {
                    // [P3-CONSOLE-DEMOTE · 2026-05-16] Degradado de warn→log.
                    // CHANNEL_ERROR es genérico (throttle, inventory vacío del
                    // user, RLS sin filas para subscribir). El feature funciona
                    // sin realtime (fallback al fetch REST). El amarillo ⚠ en
                    // dev confundía: no es un fallo accionable, es estado normal
                    // cuando no hay nada que sincronizar.
                    console.log('[MealfitRD] Realtime inventory sync no disponible (fallback a polling REST).');
                }
            });
        return () => supabase.removeChannel(channel);
    }, [userProfile?.id]);

    // Fallback de sincronización: refrescar inventario cuando el usuario vuelve al tab
    // (cubre el caso donde Realtime falla o el usuario navegó a Pantry y vació la nevera)
    // [P1-5] Usa `fetchFreshInventoryWithTimeout` y mantiene `inventoryStale` en sync:
    // si el refresh-on-focus falla/timeoutea, el chip se enciende para avisar.
    // Si succeed, lo bajamos.
    useEffect(() => {
        if (!userProfile?.id) return;
        const refreshInventoryOnFocus = async () => {
            const result = await fetchFreshInventoryWithTimeout(
                () => supabase
                    .from('user_inventory')
                    .select('ingredient_name, quantity, unit, created_at, master_ingredients(name, category, shelf_life_days)')
                    .eq('user_id', userProfile.id)
                    .gt('quantity', 0)
                    .order('ingredient_name', { ascending: true }),
                getInventoryFetchTimeoutMs(),
            );
            if (!result.stale) {
                setLiveInventory(result.data);
                setInventoryStale(false);
            } else {
                setInventoryStale(true);
            }
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshInventoryOnFocus();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', refreshInventoryOnFocus);
        // [P1-CHAT-UI-ACTION-INVENTORY · 2026-05-20] Listener del custom event
        // que AgentPage dispara cuando el LLM emite `[UI_ACTION: REFRESH_INVENTORY]`
        // tras `log_consumed_meal`/`modify_pantry_inventory`/`mark_shopping_list_purchased`.
        // Refetch instantáneo del `liveInventory` evita stale visual de la Nevera
        // mientras el user sigue mirando el Dashboard sin navegar a Pantry.
        // Análogo al patrón `mealfit:refresh-hydration` del WaterTracker.
        window.addEventListener('mealfit:refresh-inventory', refreshInventoryOnFocus);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', refreshInventoryOnFocus);
            window.removeEventListener('mealfit:refresh-inventory', refreshInventoryOnFocus);
        };
    }, [userProfile?.id]);

    // Background Chunking: mostrar/ocultar banner y hacer POLLING
    // [GAP 7] Reconocer los 4 estados de generation_status:
    //   'partial'          → generando en background, seguir polling
    //   'complete'         → todo ok, ocultar banner
    //   'complete_partial' → plan completo pero algunos dias via Smart Shuffle (degraded)
    //   'failed'           → generacion abortada permanentemente
    useEffect(() => {
        const status = planData?.generation_status;
        let pollInterval;

        // [P0-DASH-CHIP-HONESTY · 2026-05-09] Estados activos en los
        // que la queue puede tener chunks moviéndose o pausados.
        // 'rolling' incluido porque rolling_refill chunks viven aquí
        // post-first-chunk-completed. Sin esto, un plan en
        // 'generating_next' con todos los chunks pausados se quedaba
        // sin polling de chunkStatusInfo (chip seguía mintiendo).
        const _isActiveForChunkPoll = (
            status === 'partial'
            || status === 'generating'
            || status === 'generating_next'
            || status === 'rolling'
        );

        if (_isActiveForChunkPoll && planData?.id) {
            // Fetch inicial y también a través del polling normal de
            // 30s que ya refresca el plan. El response es chico
            // (counters + paused_chunks resumido), no requiere su
            // propio interval — piggyback al refresh del plan.
            getPlanChunkStatus(planData.id)
                .then(async (r) => {
                    if (!r || !r.ok) return;
                    const body = await r.json().catch(() => null);
                    if (body && typeof body === 'object') setChunkStatusInfo(body);
                })
                .catch(() => { /* best-effort: el chip cae al fallback plan_data-only */ });
        } else if (chunkStatusInfo !== null && status === 'complete') {
            // Plan completado: limpiar el snapshot stale para que el
            // render no muestre paused chunks viejos.
            setChunkStatusInfo(null);
        }

        if (status === 'partial') {
            setShowChunkBanner(true);
            pollInterval = setInterval(() => {
                refreshProfileAndPlan();
                if (planData?.id) {
                    getPlanChunkStatus(planData.id)
                        .then(async (r) => {
                            if (!r || !r.ok) return;
                            const body = await r.json().catch(() => null);
                            if (body && typeof body === 'object') setChunkStatusInfo(body);
                        })
                        .catch(() => {});
                }
            }, 30000);
        } else if (status === 'complete' && showChunkBanner) {
            setShowChunkBanner(false);
            const totalDays = planData?.total_days_requested || planData?.days?.length || 0;
            const groceryDur = formData?.groceryDuration || 'weekly';
            const coverDays = groceryDur === 'monthly' ? 30 : groceryDur === 'biweekly' ? 15 : 7;
            const repeats = totalDays > 0 && totalDays < coverDays;
            toast.success(`¡Tu menú de ${totalDays} días ya está listo! 🎉`, {
                description: repeats
                    ? `Se repetirá automáticamente para cubrir tus ${coverDays} días de compras.`
                    : 'Todas las semanas están listas en tu calendario.',
                duration: 6000,
            });
        } else if (status === 'complete_partial' && showChunkBanner) {
            setShowChunkBanner(false);
            toast.warning('Tu plan está listo (con respaldo) ⚠️', {
                description: 'Algunos días se completaron con comidas de tu perfil favorito porque la IA tuvo dificultades. Puedes regenerarlos cuando quieras.',
                duration: 8000,
            });
        } else if (status === 'failed' && showChunkBanner) {
            setShowChunkBanner(false);
            toast.error('Hubo un problema generando las próximas semanas', {
                description: 'Tus días actuales están intactos. Intenta generar un nuevo plan pronto.',
                duration: 10000,
            });
        }

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData?.generation_status, refreshProfileAndPlan]);

    // 2. ESTADO DE CARGA: Si estamos recuperando datos de la DB, mostramos loader
    if (loadingData) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '1rem',
                color: '#64748B',
                background: '#F8FAFC'
            }}>
                <Loader2 className="spin-fast" size={48} color="var(--primary)" />
                <p style={{ fontWeight: 600 }}>Sincronizando tu plan...</p>
                <style>{`
                    .spin-fast { animation: spin 1s linear infinite; } 
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    // 3. Protección de Ruta: Si terminó de cargar y NO hay plan, mandar al formulario de evaluación
    if (!planData) {
        return <Navigate to="/assessment" replace />;
    }

    // Cálculos para la UI de límites
    const isLimitReached = typeof userPlanLimit === 'number' && planCount >= userPlanLimit;

    // [P3-UPDATE-PLATOS-REQUIRES-PANTRY · 2026-05-17] Gate "Actualizar platos"
    // contra Nevera vacía. `pantryItemCount`:
    //   - `null`  → inventario no cargado aún o fetch falló (no bloquear)
    //   - número  → conteo de filas con quantity > 0 (filtro ya aplicado en la
    //               query supabase de `fetchLiveInventory`)
    // `isPantryTooEmpty` solo es true cuando SABEMOS que hay menos del mínimo
    // (fail-open mientras `isLoadingInventory` o el fetch falla).
    //
    // [P3-PLAN-BTN-STABLE · 2026-05-19] Fallback al `cachedPantryCount` cuando
    // el fetch aún no resolvió. Esto hace que el primer paint del botón coincida
    // con el estado final, evitando el flash verde→gris. Se removió el gate
    // `!isLoadingInventory` porque ya no es necesario: si tenemos cache, lo
    // usamos; si no, `pantryItemCount` queda null → `isPantryTooEmpty=false`
    // (fail-open preservado para usuarios sin historial cacheado).
    const _liveCount = Array.isArray(liveInventory) ? liveInventory.length : null;
    const pantryItemCount = _liveCount !== null ? _liveCount : cachedPantryCount;
    const isPantryTooEmpty = pantryItemCount !== null
        && pantryItemCount < PANTRY_MIN_ITEMS_FOR_UPDATE;

    // Calcular si el periodo de compras expiró para sugerir "Actualizar Plan" en lugar de "Platos"
    const groceryDuration = formData?.groceryDuration || 'weekly';

    // Normalizar fechas a medianoche — usa todayDate (state) para que se recalcule automáticamente a las 12AM
    const todayMidnight = todayDate;

    // [GROCERY-START-DATE-LOCAL-PARSE 2026-05-06] Parser local-aware.
    //
    // Bug: el backend persiste `grocery_start_date` como "YYYY-MM-DD" (date-only,
    // sin TZ — ver `_ensure_grocery_start_date` en `db_plans.py`). JavaScript
    // interpreta `new Date("2026-05-06")` como UTC midnight → en TZ -4 cae
    // en local 2026-05-05T20:00 → setHours(0,0,0,0) → local 5-may 00:00.
    // Si hoy es local 6-may, daysSinceCreation = 1 → shift-plan dispara →
    // pierde el primer día del plan recién generado.
    //
    // Fix: si la fecha es solo "YYYY-MM-DD", parsear como local midnight
    // directamente. Si es ISO timestamp completo, mantener parse + setHours
    // (el setHours convierte el timestamp local a local midnight, OK).
    const _parseStartLocal = (raw) => {
        if (!raw) return new Date();
        if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            const [y, m, d] = raw.split('-').map(Number);
            return new Date(y, m - 1, d); // Local midnight
        }
        const dt = new Date(raw);
        dt.setHours(0, 0, 0, 0);
        return dt;
    };

    const rawStartDate = planData?.grocery_start_date || planData?.created_at;
    const startMidnight = _parseStartLocal(rawStartDate);

    const daysSinceCreation = Math.round((todayMidnight - startMidnight) / (1000 * 60 * 60 * 24));

    // cycle_start_date: fecha inmutable de inicio del ciclo (no la rota el backend).
    // Se usa solo para el contador "daysLeft" del badge; daysSinceCreation se mantiene
    // basado en grocery_start_date porque el resto del Dashboard (rolling window, índice
    // de día actual en planDays, etc.) depende de ese desplazamiento.
    const rawCycleStart = planData?.cycle_start_date || rawStartDate;
    const cycleStartMidnight = _parseStartLocal(rawCycleStart);
    const daysSinceCycleStart = Math.round((todayMidnight - cycleStartMidnight) / (1000 * 60 * 60 * 24));

    let isPlanExpired = false;
    let maxDays = 7;
    if (groceryDuration === 'weekly') { maxDays = 7; }
    if (groceryDuration === 'biweekly') { maxDays = 15; }
    if (groceryDuration === 'monthly') { maxDays = 30; }

    const generated_days = planData?.days?.length || 0;
    
    // GAP 8: Expiración de plan no considera tiempo de generación
    // Fix: extender expiry por (requested_days - generated_days)
    const expiryExtension = Math.max(0, maxDays - generated_days);
    const totalAllowedDays = maxDays + expiryExtension;

    // Expiración basada en el ciclo inmutable (cycle_start_date), no en el rolling
    // grocery_start_date — sino el plan nunca expira.
    if (daysSinceCycleStart >= totalAllowedDays) isPlanExpired = true;

    // daysLeft: días reales restantes del ciclo, calculado contra cycle_start_date
    // (inmutable) para que decremente naturalmente sin importar los rollings del backend
    // sobre grocery_start_date. totalAllowedDays solo extiende la ventana de expiración
    // para planes aún generándose, pero no debe inflar el contador visible al usuario.
    const daysLeft = Math.max(0, maxDays - daysSinceCycleStart);



    // Pre-calcular ingredientes de la despensa para mostrarlos en UI
    // Prioridad unificada: Mostrar una fusión (UNION) entre el Inventario Físico Real y la Lista de Compras del Ciclo.
    const allPlanIngredients = useMemo(() => {
        return calculateAllPlanIngredients(planData, isPlanExpired, liveInventory);
    }, [planData, isPlanExpired, liveInventory]);

    // 🔄 DELTA SHOPPING: Lista de compras inteligente que resta lo que ya hay en la Nevera.
    // Si el usuario tiene 5 lb de pollo en inventario, el PDF/restock no mostrará pollo (o mostrará la diferencia).
    const buildDeltaShoppingList = useCallback((shoppingList, inventoryOverride = null) => {
        if (!shoppingList || !Array.isArray(shoppingList) || shoppingList.length === 0) return shoppingList || [];
        // [P3-DEDUP-EXPLICIT-OVERRIDE · 2026-05-18] Distinguir "no override
        // pasado" vs "override = []" usando undefined check (no `||`). Esto
        // permite que el caller pase explícitamente [] para significar
        // "pantry vacía confirmada vía fresh fetch — NO dedup". Antes
        // `[] || liveInventory` retornaba [] correctamente (porque [] es
        // truthy), pero hacerlo explícito documenta el contrato y es
        // robusto contra refactors futuros.
        const inventoryToUse = (inventoryOverride !== null && inventoryOverride !== undefined)
            ? inventoryOverride
            : liveInventory;
        if (!inventoryToUse || !Array.isArray(inventoryToUse) || inventoryToUse.length === 0) {
            // Tag de diagnóstico — el caller que vea esto en DevTools confirma
            // que la versión nueva del bundle está cargada (post-2026-05-18).
            try { console.log('[P3-DEDUP-EXPLICIT-OVERRIDE] inventory empty/null → returning full shoppingList (' + shoppingList.length + ' items)'); } catch(_e) {}
            return shoppingList;
        }

        // 🔄 ROTACIÓN POST-RESTOCK: Solo suprimir ítems parciales/nuevos cuando el usuario
        // YA registró sus compras (is_restocked=true) y luego rotó platos.
        // Para planes NUEVOS, is_restocked es undefined → delta normal con todos los faltantes.
        //
        // [P3-RESTOCK-STALE-DEDUP · 2026-05-17] Defense-in-depth contra `is_restocked`
        // stale en plan_data. Si el usuario vació la nevera (delete all en Pantry, RPC
        // del agente, FK CASCADE) y `plan_data.is_restocked` quedó true en DB por la
        // ventana frontend-helper-no-persiste-a-DB, este bloque ignoraría TODOS los
        // items y el PDF/lista mostraría "Lista Vacía" pese a nevera real vacía.
        // Heurística: si el inventario actual cubre <50% del `restocked_items` dict,
        // el dedup es claramente obsoleto → forzamos modo normal (no-rotation).
        // El backend self-heal de /restock cierra la raíz; este guard cubre la
        // ventana antes del próximo /restock + cualquier ruta que vacíe pantry
        // skip del helper SSOT (Pantry.jsx::_recalcShoppingListAfterPantryChange).
        const _restockedItemsObj = planData?.restocked_items;
        const _restockedCount = (_restockedItemsObj && typeof _restockedItemsObj === 'object')
            ? Object.keys(_restockedItemsObj).length
            : 0;
        const _inventoryCount = inventoryToUse.length;
        const _staleDedup = (
            !!planData?.is_restocked &&
            _restockedCount > 0 &&
            _inventoryCount < Math.max(3, Math.floor(_restockedCount * 0.5))
        );
        const isPostRestockRotation = !!planData?.is_restocked && !_staleDedup;

        const MASS_TO_G = { 'g': 1, 'gr': 1, 'gramos': 1, 'kg': 1000, 'lb': 453.592, 'lbs': 453.592, 'oz': 28.3495, 'onza': 28.3495, 'onzas': 28.3495 };
        const VOL_TO_ML = { 'ml': 1, 'l': 1000, 'taza': 240, 'tazas': 240, 'cda': 15, 'cdta': 5 };

        const toBaseUnit = (qty, unit) => {
            let u = unit.toLowerCase().trim().replace(/\.$/, ''); // remove trailing dot from 'ud.'
            if (MASS_TO_G[u]) return { value: qty * MASS_TO_G[u], type: 'mass', ratio: MASS_TO_G[u] };
            if (VOL_TO_ML[u]) return { value: qty * VOL_TO_ML[u], type: 'volume', ratio: VOL_TO_ML[u] };
            
            // Map count units to a single type
            if (['ud', 'unidad', 'unidades', 'pz', 'pza', 'pieza', 'piezas', 'cabeza', 'cabezas'].includes(u)) {
                return { value: qty, type: 'unit', ratio: 1 };
            }
            // Map package units to a single type
            if (['pq', 'paq', 'paquete', 'paquetes', 'funda', 'fundita', 'fundas', 'sobre', 'sobres'].includes(u)) {
                return { value: qty, type: 'pkg', ratio: 1 };
            }
            if (['lata', 'latas'].includes(u)) {
                return { value: qty, type: 'can', ratio: 1 };
            }

            return { value: qty, type: u, ratio: 1 }; // generic fallback
        };

        const normalizeName = (name) => {
            if (!name) return '';
            let n = name.toLowerCase().trim();
            n = n.split('(')[0].trim();
            n = n.split(',')[0].trim();
            return n.split(/\s+/).map(w => {
                 if (w.length <= 3) return w;
                 if (w.endsWith('s') && !w.endsWith('is')) return w.slice(0, -1);
                 return w;
            }).join(' ');
        };

        const normalizeNameAlt = (name) => {
            if (!name) return '';
            let n = name.toLowerCase().trim();
            n = n.split('(')[0].trim();
            n = n.split(',')[0].trim();
            
            // Replicar el comportamiento del backend (db_inventory.py / shopping_calculator.py)
            // para que "chuleta de cerdo" haga match con el master ingredient "cerdo" guardado.
            n = n.replace(/^(pechuga|filete|muslo|trozo|chuleta|pieza|corte|ración|racion|porción|porcion|filetico|medallón|medallones|carne)s?\s+(de|del)\s+/i, '').trim();

            // Stop words: réplica exacta del backend (shopping_calculator.py línea 103)
            // Elimina descriptores que no forman parte del nombre base del ingrediente.
            // ⚡ BOLT OPTIMIZATION: Using pre-compiled STOP_WORDS_REGEX instead of O(N) loop
            n = n.replace(STOP_WORDS_REGEX, '');
            n = n.replace(/,/g, '').replace(/\s+/g, ' ').trim();

            return n.split(/\s+/).map(w => {
                 const irregulars = {
                     'nueces': 'nuez',
                     'aves': 'ave',
                     'maices': 'maiz',
                     'arroces': 'arroz',
                     'peces': 'pez',
                     'carnes': 'carne',
                     'tomates': 'tomate'
                 };
                 if (irregulars[w]) return irregulars[w];
                 
                 if (w.length <= 4) {
                     if (w.endsWith('s') && !w.endsWith('es') && !w.endsWith('is')) return w.slice(0, -1);
                     return w;
                 }
                 
                 if (w.endsWith('es') && !w.endsWith('res') && !w.endsWith('nes')) return w.slice(0, -2);
                 if (w.endsWith('nes') && !w.endsWith('ones')) return w.slice(0, -2);
                 if (w.endsWith('s') && !w.endsWith('is')) return w.slice(0, -1);
                 return w;
            }).join(' ');
        };

        const PANTRY_STAPLES_DELTA = new Set([
            'sal y ajo en polvo', 'aceite de oliva', 'aceite de coco',
            'aceite de sésamo o maní', 'salsa de soya', 'orégano',
            'canela', 'pimienta', 'sal', 'vinagre', 'ajo en polvo'
        ]);

        const inferShelfLifeDays = (name, category) => {
            const n = (name || '').toLowerCase();
            const c = (category || '').toLowerCase();
            const DRY_GOODS = ['arroz', 'pasta', 'fideo', 'espagueti', 'macarrón', 'macarron', 'lenteja', 'habichuela', 'frijol', 'garbanzo', 'gandul', 'moro', 'avena', 'quinoa', 'cuscús', 'cuscus', 'bulgur', 'cebada', 'harina', 'azúcar', 'azucar', 'sal', 'bicarbonato', 'levadura', 'cacao', 'café', 'cafe', 'infusión', 'especia', 'condimento', 'maíz seco', 'maiz seco', 'palomita', 'cereal'];
            if (DRY_GOODS.some(k => n.includes(k))) return 180;
            if (n.includes('congelado') || c.includes('congelad') || c.includes('frozen')) return 60;
            if (c.includes('hoja') || n.includes('lechuga') || n.includes('espinaca') || n.includes('cilantro')) return 5;
            if (c.includes('proteína') || c.includes('proteina') || c.includes('carne') || c.includes('pollo') || c.includes('pescado') || c.includes('mariscos')) return 5;
            if (c.includes('fruta')) return 7;
            if (c.includes('lácteo') || c.includes('lacteo') || c.includes('leche') || c.includes('queso') || c.includes('yogurt')) return 14;
            if (c.includes('tubérculo') || c.includes('tuberculo') || n.includes('papa') || n.includes('batata') || n.includes('yuca') || n.includes('ñame')) return 21;
            if (c.includes('vegetal') || c.includes('verdura')) return 10;
            if (n.includes('huevo')) return 21;
            if (n.includes('enlatado') || c.includes('enlatad') || c.includes('lata')) return 365;
            return 14;
        };

        const inventoryMap = new Map();
        inventoryToUse.forEach(item => {
            const name = (item.ingredient_name || '').toLowerCase().trim();
            if (!name) return;

            // Exclude expired items so they don't suppress the shopping list delta
            if (!PANTRY_STAPLES_DELTA.has(name) && item.created_at) {
                const category = (item.master_ingredients?.category || '').toLowerCase();
                const shelfLife = item.master_ingredients?.shelf_life_days || inferShelfLifeDays(name, category);
                const daysOld = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86400000);
                if (daysOld > shelfLife) return;
            }

            const normName1 = normalizeName(name);
            const normName2 = normalizeNameAlt(name);
            const qty = parseFloat(item.quantity) || 0;
            const unit = (item.unit || 'unidad').toLowerCase().trim();

            const existing = inventoryMap.get(normName1) || inventoryMap.get(normName2);
            if (existing) {
                // Si hay múltiples rows, unificar valores respetando las unidades reales
                const existingBase = toBaseUnit(existing.quantity, existing.unit);
                const newBase = toBaseUnit(qty, unit);
                
                if (existingBase.type === newBase.type) {
                    const totalBaseValue = existingBase.value + newBase.value;
                    const reverseRatio = toBaseUnit(1, existing.unit).ratio || 1;
                    existing.quantity = totalBaseValue / reverseRatio;
                }
            } else {
                const dataToStore = { quantity: qty, unit: unit, rawName: name };
                inventoryMap.set(normName1, dataToStore);
                if (normName1 !== normName2) {
                    inventoryMap.set(normName2, dataToStore);
                }
            }
        });

        const deltaList = [];
        let itemsRemoved = 0;

        shoppingList.forEach(item => {
            if (typeof item !== 'object' || !item || !item.name) {
                deltaList.push(item); // strings legacy: pasar sin filtrar
                return;
            }

            const nameKey1 = normalizeName(item.name);
            const nameKey2 = normalizeNameAlt(item.name);
            const invItem = inventoryMap.get(nameKey1) || inventoryMap.get(nameKey2);

            // ESCALADO POR DEGRADACIÓN (Opción 1)
            // Degradamos la cantidad proyectada basándonos en cuánto tiempo le queda realmente al ciclo.
            // Si va por el día 10 de 15, no le pedimos comprar comida para 15 días, solo para los 5 restantes.
            // P0-3: Si queda la mitad o menos del ciclo, asumimos compras para el próximo ciclo completo.
            let degradationRatio = 1;
            if (maxDays > 0 && daysLeft > (maxDays * 0.5)) {
                degradationRatio = Math.max(0.1, daysLeft / maxDays);
            }
            // [P0-2] Antes: `parseFloat(item.market_qty)` truncaba "1 1/2"→1
            // y "1/2"→0, subdimensionando el delta lista↔nevera. El helper
            // `resolveShopQty` prefiere `market_qty_numeric` (poblado siempre
            // por backend ahora) y cae a un parser fraccional para items
            // legacy persistidos antes del fix.
            const rawShopQty = resolveShopQty(item);
            const shopUnit = (item.market_unit || item.unit || 'unidad').toLowerCase().trim();

            if (rawShopQty <= 0) {
                deltaList.push(item); // "Al gusto" items: pasar sin filtrar
                return;
            }

            const shopQty = degradationRatio === 1 ? rawShopQty : (rawShopQty * degradationRatio);
            
            const formatQty = (q) => {
                return q < 1 ? q.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') : (Number.isInteger(q) ? String(q) : q.toFixed(1).replace(/\.0$/, ''));
            };

            const degradedQtyStr = formatQty(shopQty);

            if (!invItem || invItem.quantity <= 0) {
                // No está en la Nevera → incluir aplicando degradación
                // PERO: si es una rotación post-restock, NO debería haber ingredientes nuevos
                // que no estén en la nevera. Si aparece uno, es un error de la IA → ignorar.
                if (isPostRestockRotation) {
                    itemsRemoved++;
                    return;
                }
                deltaList.push({
                    ...item,
                    market_qty: shopQty,
                    display_qty: item.display_qty != null ? `${degradedQtyStr} ${shopUnit}` : undefined,
                    display_string: item.display_string != null ? `${degradedQtyStr} ${shopUnit} de ${item.name}` : undefined
                });
                return;
            }

            const shopBase = toBaseUnit(shopQty, shopUnit);
            const invBase = toBaseUnit(invItem.quantity, invItem.unit);

            // Solo restar si las unidades son del mismo tipo (masa-masa, vol-vol, unidad-unidad)
            if (shopBase.type !== invBase.type) {
                // Unidades incompatibles: si es rotación post-restock, ignorar
                if (isPostRestockRotation) {
                    itemsRemoved++;
                    return;
                }
                deltaList.push({
                    ...item,
                    market_qty: shopQty,
                    display_qty: item.display_qty != null ? `${degradedQtyStr} ${shopUnit}` : undefined,
                    display_string: item.display_string != null ? `${degradedQtyStr} ${shopUnit} de ${item.name}` : undefined,
                    _hasPartialInventory: true,
                    _inventoryNote: `Ya tienes ${invItem.quantity} ${invItem.unit} en tu Nevera`
                });
                return;
            }

            const remaining = shopBase.value - invBase.value;

            if (remaining <= 0) {
                // El usuario ya tiene SUFICIENTE para los días que restan → excluir del shopping list
                itemsRemoved++;
                return;
            }

            // Tiene algo pero no suficiente
            // Si es rotación post-restock: la IA debería haber respetado cantidades → ignorar el faltante
            if (isPostRestockRotation) {
                itemsRemoved++;
                return;
            }

            // Tiene algo pero no suficiente → mostrar lo restante
            const ratio = remaining / shopBase.value;
            const adjustedQty = shopQty * ratio;
            const displayAdjusted = formatQty(adjustedQty);

            deltaList.push({
                ...item,
                market_qty: adjustedQty,
                display_qty: item.display_qty != null ? `${displayAdjusted} ${shopUnit}` : undefined,
                display_string: item.display_string != null ? `${displayAdjusted} ${shopUnit} de ${item.name}` : undefined,
                _adjustedFromInventory: true,
                _inventoryNote: `Tienes ${invItem.quantity} ${invItem.unit} — comprar ${displayAdjusted} ${shopUnit}`
            });
        });

        // Metadata para UI
        deltaList._itemsRemoved = itemsRemoved;
        deltaList._isAdjusted = itemsRemoved > 0 || deltaList.some(i => i?._adjustedFromInventory);

        return deltaList;
    }, [liveInventory, planData]);

    // Calcular si la delta list de esta sesión actual todavia requiere compras
    // GUARD: No calcular hasta que liveInventory se haya cargado (evita flash del botón).
    const computedHasPendingShoppingItems = useMemo(() => {
        if (liveInventory !== null && planData && (planData.aggregated_shopping_list || allPlanIngredients)) {
            const duration = formData?.groceryDuration || 'weekly';
            const rawList = getActiveShoppingList(planData, duration) || allPlanIngredients || [];

            const currentDelta = buildDeltaShoppingList(rawList);
            return currentDelta.length > 0;
        }
        return null;  // null = "no sabemos aún" (vs false = "sabemos que NO hay items")
    }, [liveInventory, planData, formData?.groceryDuration, allPlanIngredients, buildDeltaShoppingList]);

    // [P3-RESTOCK-BTN-STABLE · 2026-05-19] Cache localStorage del último valor
    // conocido de `hasPendingShoppingItems` para bootstrap del primer paint del
    // botón "Ya compré todo". Pre-fix: P3-RESTOCK-BTN-NO-FLASH (2026-05-18)
    // gateaba el render hasta `liveInventory !== null`, pero igual había flash
    // "desaparece y aparece" porque entre mount y fetch-resolve, el botón
    // simplemente NO renderizaba (false && ...). Ahora el primer paint usa el
    // cache; cuando el fetch resuelve, si difiere, hay un flash legítimo (raro).
    const _restockBtnCacheKey = userProfile?.id ? `mealfit_restock_btn_${userProfile.id}` : null;
    const [cachedHasPendingShoppingItems, setCachedHasPendingShoppingItems] = useState(() => {
        try {
            const initialUid = userProfile?.id;
            if (!initialUid) return null;
            const v = localStorage.getItem(`mealfit_restock_btn_${initialUid}`);
            if (v === '1') return true;
            if (v === '0') return false;
            return null;
        } catch { return null; }
    });
    // Re-leer cache si userProfile.id se resuelve tarde.
    useEffect(() => {
        if (!_restockBtnCacheKey) return;
        try {
            const v = localStorage.getItem(_restockBtnCacheKey);
            if (v === '1') setCachedHasPendingShoppingItems(true);
            else if (v === '0') setCachedHasPendingShoppingItems(false);
        } catch { /* private mode */ }
    }, [_restockBtnCacheKey]);
    // Sincronizar cache cuando el useMemo computa un valor real (no-null).
    useEffect(() => {
        if (!_restockBtnCacheKey || computedHasPendingShoppingItems === null) return;
        setCachedHasPendingShoppingItems(computedHasPendingShoppingItems);
        try { localStorage.setItem(_restockBtnCacheKey, computedHasPendingShoppingItems ? '1' : '0'); }
        catch { /* quota */ }
    }, [computedHasPendingShoppingItems, _restockBtnCacheKey]);

    // SSOT: si el computed ya resolvió, usar ese valor (fresh); si no, usar
    // el cache (estable). Si ni cache ni computed, false (no renderizar).
    const hasPendingShoppingItems = computedHasPendingShoppingItems !== null
        ? computedHasPendingShoppingItems
        : (cachedHasPendingShoppingItems === true);


    // Stale check: shopping quantities were calculated for a different household size
    const isShoppingListStale = !!(
        planData?.calc_household_size != null &&
        planData.calc_household_size !== (formData?.householdSize || 1)
    );

    const handleNewPlan = async (reason = null, toastId = null, entry_point = 'dashboard_refresh') => {
        await regeneratePlan({
            reason,
            liveInventory,
            disabledIngredients,
            allPlanIngredients,
            isPlanExpired,
            toastId,
            entry_point
        });
    };

    // --- NUEVO: ONBOARDING DE ALERTAS INTELIGENTES (WEB PUSH) ---
    useEffect(() => {
        if (!loadingData && userProfile && isPushSupported() && 'Notification' in window) {
            // Evaluamos si es un usuario recién registrado basándonos en la fecha de creación
            // Consideramos "nuevo" si su cuenta se creó hace menos de unas 2-24 horas, o simplemente
            // miramos el planCount === 1 (es su primer plan generado)
            // Por ejemplo, aquí usamos planCount === 1 como proxy de "usuario nuevo", 
            // ya que está entrando por primera vez con su primer plan.
            const isNewUser = formData?.isNewUser || planCount === 1;

            const hasSeenOnboarding = localStorage.getItem('mealfit_push_onboarding_seen');

            if (isNewUser && !hasSeenOnboarding && Notification.permission === 'default') {
                // Pequeño retraso para que la interfaz se asiente primero antes de mostrar el modal
                const timer = setTimeout(() => {
                    setShowPushOnboarding(true);
                }, 2000);
                return () => clearTimeout(timer);
            }
        }
    }, [loadingData, userProfile, planCount, formData]);

    const handleEnablePush = async () => {
        setIsPushEnabling(true);
        try {
            const permission = await requestNotificationPermission();
            if (permission) {
                await subscribeToPushNotifications(userProfile.id);
                toast.success("¡Alertas Inteligentes activadas!", {
                    description: "Te avisaremos si olvidas registrar una comida.",
                    icon: '🧠'
                });
            } else {
                toast.info("Notificaciones omitidas", {
                    description: "Puedes activarlas más adelante desde Ajustes."
                });
            }
        } catch (error) {
            console.error("Error activando notificaciones:", error);
        } finally {
            setIsPushEnabling(false);
            setShowPushOnboarding(false);
            localStorage.setItem('mealfit_push_onboarding_seen', 'true');
        }
    };

    const handleDismissPushOnboarding = () => {
        setShowPushOnboarding(false);
        localStorage.setItem('mealfit_push_onboarding_seen', 'true');
    };

    const handleDownloadShoppingList = async () => {
        // [P1-6] Early return si ya hay una descarga en vuelo. `disabled` del
        // botón depende de `isRecalculating` que no cubre el periodo del
        // handler PDF (fetch fresh inventory + html2pdf render); este ref
        // sí. Mismo patrón que `restockLock`.
        if (pdfLock.current) return;
        pdfLock.current = true;
        try {
            const loadingToast = toast.loading('Generando lista de compras...', { position: 'top-center' });

            // Obtener duración actual desde el formulario para cambiar la cantidad en el PDF sobre la marcha
            const duration = formData?.groceryDuration || 'weekly';

            // [P2-NEW-14 · 2026-05-11] Pre-PDF drift detection del plan.
            // Espejo del patrón P2-NEW-4 (Pantry recalc): si chunk worker
            // recalculó `aggregated_shopping_list*` en background mientras
            // user estaba en Dashboard, `planData` local está stale. Sin
            // este prefetch, el PDF se genera con lista vieja.
            //
            // Comportamiento:
            //   - Lectura SELECT estrecho (id+updated_at+plan_data) del plan
            //     actual filtrando por user_id (ownership).
            //   - Si `_plan_modified_at` en DB difiere del local → sync
            //     localStorage + setPlanData + usar fresh para el PDF.
            //   - Best-effort: cualquier fallo cae al planData en memoria
            //     (mejor PDF "potencialmente stale" que abortar el download).
            //   - `effectivePlanData` es la versión que `getActiveShoppingList`
            //     consume; si no hubo drift, es idéntico a `planData`.
            let effectivePlanData = planData;
            try {
                if (planData?.id && session?.user?.id) {
                    const { data: latestRow, error: latestErr } = await supabase
                        .from('meal_plans')
                        .select('id, updated_at, plan_data')
                        .eq('id', planData.id)
                        .eq('user_id', session.user.id)
                        .maybeSingle();
                    if (!latestErr && latestRow?.plan_data) {
                        // [P3-PDF-ALWAYS-SYNC · 2026-05-18] Para el flujo del
                        // PDF, SIEMPRE sincronizamos desde DB (sin comparar
                        // timestamps). Razón: timestamp-based drift detection
                        // tenía falsos negativos cuando localStorage y DB
                        // tenían el mismo `_plan_modified_at` pero contenido
                        // diferente en `aggregated_shopping_list_weekly` (por
                        // ejemplo, un recalc intermedio que mutó la lista pero
                        // no bumpeó el marker hasta P3-PLAN-MODIFIED-AT-RECALC).
                        //
                        // El costo es minimal: un SELECT + setPlanData. Mejor
                        // pagar este overhead que arriesgar un PDF con lista
                        // stale. El SELECT ya se hace de todas formas para
                        // detectar drift; lo único que cambia es aplicar la
                        // sync incondicionalmente.
                        const latestModified = latestRow.plan_data._plan_modified_at;
                        const localModified = planData._plan_modified_at;
                        if (true) {  // Siempre sincronizar.
                            // [P3-CONSOLE-DEMOTE · 2026-05-16] Degradado de warn→log.
                            // El drift detectado se resuelve EXITOSAMENTE en las 4
                            // líneas siguientes (sync localStorage + state + setea
                            // effectivePlanData fresh). El amarillo ⚠ en dev sugería
                            // un fallo accionable pero es flujo de éxito de P2-NEW-14.
                            console.log(
                                '[P2-NEW-14] PDF drift detected: ' +
                                `local=${localModified}, latest=${latestModified}. ` +
                                'Sincronizando localStorage + state antes del PDF.'
                            );
                            const fresh = {
                                ...latestRow.plan_data,
                                id: latestRow.id,
                                updated_at: latestRow.updated_at,
                            };
                            try {
                                localStorage.setItem('mealfit_plan', JSON.stringify(fresh));
                            } catch (_lsErr) { /* localStorage best-effort */ }
                            try { setPlanData(fresh); } catch (_setErr) { /* setter best-effort */ }
                            effectivePlanData = fresh;
                            // [P2-PDF-OBS-1 · 2026-05-14] Telemetría del drift
                            // corregido. El `console.warn` arriba es stripped
                            // por esbuild en producción (vite.config.js declara
                            // `pure: ['console.warn', ...]`) → operadores no
                            // pueden medir cuántas veces el prefetch evita un
                            // PDF stale. `trackEvent` sobrevive el strip
                            // (Sentry/PostHog/GA/GTM). Best-effort: cualquier
                            // fallo de analytics SDK NO debe romper el PDF.
                            try {
                                trackEvent('pdf_prefetch_drift_corrected', {
                                    user_id: userProfile?.id,
                                    plan_id: planData?.id,
                                    local_modified_at: typeof localModified === 'string' ? localModified.slice(0, 32) : null,
                                    latest_modified_at: typeof latestModified === 'string' ? latestModified.slice(0, 32) : null,
                                });
                            } catch (_telDriftErr) {
                                // No-op: telemetría best-effort.
                            }
                        }
                    }
                }
            } catch (driftErr) {
                console.warn('[P2-NEW-14] PDF prefetch drift falló (best-effort):', driftErr);
            }

            // [P2-SHOPPING-1 · 2026-05-14] Telemetría visible al usuario del
            // historial de revisiones automáticas del plan. Las superficies
            // que persisten `_shopping_coherence_block_history` (chunk worker
            // T2, recalc, agent_tool, cron diario, /recipe/expand) NO emiten
            // toast — y el handler PDF se invoca directo (sin recalc previo),
            // por lo que el usuario que descarga PDF nunca veía la telemetría.
            // Best-effort: cualquier fallo se loguea y sigue al PDF (no
            // bloquear descarga por un toast).
            try {
                emitHistoricalCoherenceToast(
                    toast,
                    effectivePlanData?._shopping_coherence_block_history,
                );
            } catch (_histToastErr) {
                console.warn('[P2-SHOPPING-1] emitHistoricalCoherenceToast falló (best-effort):', _histToastErr);
            }

            // Usar la lista consolidada correcta según el ciclo seleccionado
            const rawSourceIngredients = getActiveShoppingList(effectivePlanData, duration) || allPlanIngredients || [];

            // [P1-PDF-1] Fetch de inventario fresco con timeout + degradación
            // visible. Antes el bloque era un `try/catch` silencioso: si Supabase
            // tardaba o fallaba, `liveInventory` (potencialmente stale tras un
            // restock cuyo response falló pero sí persistió en BD) se usaba sin
            // alerta → items que ya están en la nevera reaparecían en el PDF →
            // usuario compraba duplicado. Ahora:
            //   1. `fetchFreshInventoryWithTimeout` carrera contra 2000ms.
            //   2. Si timeout/error/empty_response: usa `liveInventory` cacheado
            //      Y se sella `freshInventoryStale=true` para que el banner del
            //      PDF avise al usuario "verifica tu Nevera antes de comprar".
            //   3. trackEvent emite `pdf_stale_inventory_fallback` con el reason
            //      → operadores pueden medir frecuencia y escalar a P0 si crece.
            // [P3-RESTOCK-STALE-FALLBACK-EMPTY · 2026-05-18] Mismo fix que en
            // restock: cuando el fresh fetch falla, fallback a [] (no
            // liveInventory cacheado). Razón: post-Borrar-Todos, liveInventory
            // de Dashboard puede estar stale (35 items pre-delete) mientras
            // la DB ya tiene user_inventory=[]. El dedup contra liveInventory
            // stale removía 27 de 35 items del PDF, dejando solo 8.
            let freshInventoryForPdf = liveInventory;
            let freshInventoryStale = false;
            const _freshFetchResult = await fetchFreshInventoryWithTimeout(
                () => supabase
                    .from('user_inventory')
                    .select('ingredient_name, quantity, unit, created_at, master_ingredients(name, category, shelf_life_days)')
                    .eq('user_id', userProfile.id)
                    .gt('quantity', 0)
                    .order('ingredient_name', { ascending: true }),
                getInventoryFetchTimeoutMs(),
            );
            if (!_freshFetchResult.stale) {
                freshInventoryForPdf = _freshFetchResult.data;
                setLiveInventory(_freshFetchResult.data); // Actualizar estado global también
                // [P1-5] El fetch fresco confirmó datos vivos → bajamos el chip
                // ámbar in-app si estaba activo desde el mount o focus anterior.
                setInventoryStale(false);
            } else {
                // [P3-RESTOCK-STALE-FALLBACK-EMPTY] Fallback seguro: [] sin stale data.
                // buildDeltaShoppingList early-return cuando inventory.length===0
                // → la lista completa pasa al PDF y la DB es la fuente de verdad.
                freshInventoryForPdf = [];
                freshInventoryStale = true;
                // [P1-5] Promovemos la señal al estado global del Dashboard:
                // el chip ámbar permanecerá visible hasta que un fetch fresco
                // (mount, focus, Realtime, otra acción) confirme datos vivos.
                setInventoryStale(true);
                trackEvent('pdf_stale_inventory_fallback', {
                    reason: _freshFetchResult.reason,
                    user_id: userProfile?.id,
                    fallback_inventory_size: Array.isArray(liveInventory) ? liveInventory.length : 0,
                });
                // [P2-SHOPPING-3 · 2026-05-14] Sink backend para que el cron
                // `_alert_pdf_stale_inventory_fallback_burst` cuente eventos
                // y emita `system_alerts.pdf_stale_inventory_fallback_burst`
                // cuando supere umbral. `trackEvent` ya envía a Sentry/PostHog/
                // GA/GTM, pero el backend no observa esos canales — sin este
                // POST el cron leería 0 filas y nunca alertaría.
                // Fire-and-forget: si el endpoint falla, telemetría perdida es
                // preferible a abortar el PDF (que ya está en flight).
                try {
                    fetchWithAuth('/api/plans/telemetry/pdf-stale-fallback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            reason: _freshFetchResult.reason,
                            fallback_inventory_size: Array.isArray(liveInventory) ? liveInventory.length : 0,
                        }),
                    }).catch((_postErr) => {
                        // Silent fail por diseño — telemetría best-effort.
                    });
                } catch (_telemetryErr) {
                    // No-op: defense-en-profundidad por si fetchWithAuth no
                    // está disponible en algún edge state del bundle.
                }
            }

            // 🔄 Delta Shopping: restar lo que ya hay en la Nevera (con inventario FRESCO)
            const sourceIngredients = buildDeltaShoppingList(rawSourceIngredients, freshInventoryForPdf);
            const deltaItemsRemoved = sourceIngredients._itemsRemoved || 0;
            const deltaIsAdjusted = sourceIngredients._isAdjusted || false;

            let isEmptyList = false;
            let emptyMessageTitle = '';
            let emptyMessageDesc = '';

            if (sourceIngredients.length === 0) {
                if (deltaItemsRemoved > 0) {
                    isEmptyList = true;
                    emptyMessageTitle = '¡Felicidades, Lista Vacía!';
                    emptyMessageDesc = 'La Nevera Inteligente detectó que ya tienes en casa los ingredientes necesarios. Te has ahorrado hacer compras para este ciclo.';
                    toast.success('¡Ya tienes todo en tu Nevera!', { icon: '✅' });
                } else {
                    toast.dismiss(loadingToast);
                    toast.error('No se encontró una lista de despensa activa.');
                    return;
                }
            }

            const consData = {};
            sourceIngredients.forEach((item, index) => {
                let name = '';
                let cat = '🛒 OTROS';
                let qtyStr = 'Al gusto';

                if (typeof item === 'object' && item !== null) {
                    // Nivel 3: Consumir display_category del backend (Single Source of Truth)
                    name = item.name || item.display_name || item.item_name || 'Desconocido';
                    cat = item.display_category || item.category || '🛒 OTROS';

                    if (item.display_qty) {
                        // Nivel 3: display_qty ya viene con pluralización correcta del backend
                        qtyStr = item.display_qty;
                    } else if (item.market_qty !== undefined && item.market_unit !== undefined && item.market_qty !== '') {
                        qtyStr = `${item.market_qty} ${item.market_unit}`;
                    } else if (item.display_string) {
                        const parts = item.display_string.split(name);
                        if (parts.length > 0 && parts[0].trim().length > 0) {
                            qtyStr = parts[0].trim();
                        } else {
                            qtyStr = item.display_string;
                        }
                    }
                } else {
                    // Fallback directo sin Regex para strings legacy (si llegara a ocurrir)
                    const itemStr = String(item).trim();
                    name = itemStr.charAt(0).toUpperCase() + itemStr.slice(1).toLowerCase();
                    qtyStr = 'Al gusto';
                }

                consData[index] = {
                    name: name,
                    display_name: name,
                    category: cat,
                    item_ref: item,
                    qty_base: qtyStr || 'Al gusto',
                    _inventoryNote: item._inventoryNote || ''
                };
            });

            // [P1-PDF-2] SSOT del backend: cada item en `aggregated_shopping_list`
            // ahora trae `is_perishable: bool` calculado en `shopping_calculator.is_perishable_category`.
            // El frontend prefiere ese flag y deja la heurística de substring SOLO
            // como fallback defensivo para planes legacy persistidos antes del fix
            // (ver `backend/shopping_calculator.py:PERISHABLE_CATEGORY_PREFIXES`).
            const PERISHABLE_PREFIXES = ['proteína', 'lácteo', 'vegetal', 'fruta', 'urgente'];
            const inferIsPerishable = (item) => {
                // Prioridad 1: flag SSOT del backend (post P1-PDF-2).
                const refFlag = item.item_ref?.is_perishable;
                if (typeof refFlag === 'boolean') return refFlag;
                // Prioridad 2: shelf_life_days (mismo umbral que backend).
                const shelfLife = item.item_ref?.shelf_life_days;
                if (shelfLife !== undefined && shelfLife !== null) {
                    return Number(shelfLife) <= 7;
                }
                // Fallback legacy: substring match contra la categoría.
                const cat = (item.category || '').toLowerCase();
                return PERISHABLE_PREFIXES.some(p => cat.includes(p));
            };

            const perishables = {};
            const stables = {};
            Object.values(consData).forEach(item => {
                const cat = item.category;
                if (inferIsPerishable(item)) {
                    if (!perishables[cat]) perishables[cat] = [];
                    perishables[cat].push(item);
                } else {
                    if (!stables[cat]) stables[cat] = [];
                    stables[cat].push(item);
                }
            });

            // ── Dedup: Consolidar categorías duplicadas entre secciones ──
            // Si una categoría aparece en AMBAS secciones, hay 2 posibles causas:
            //   (a) Items legacy sin `is_perishable` flag — entonces el fallback
            //       de substring decide y conviene consolidar a un lado.
            //   (b) Items NUEVOS donde DENTRO de una misma categoría conviven
            //       perecederos y estables legítimamente (caso real: "Proteínas"
            //       con pollo+tofu perecederos + huevo estable [shelf_life=14d]).
            //
            // [2026-05-06 fix] Solo consolidamos si TODOS los items duplicados
            // son legacy (sin flag SSOT). Si AL MENOS UNO tiene el flag del
            // backend, respetamos la separación — es la información autoritativa.
            // Antes la consolidación arrastraba el huevo (estable) a perecederos
            // por el substring "proteína", invalidando el cap shelf_life backend.
            const duplicatedCats = Object.keys(perishables).filter(c => stables[c]);
            duplicatedCats.forEach(cat => {
                const allItemsInCat = [...perishables[cat], ...stables[cat]];
                const anyHasBackendFlag = allItemsInCat.some(
                    it => typeof it.item_ref?.is_perishable === 'boolean'
                );
                if (anyHasBackendFlag) {
                    // Caso (b): backend ya clasificó. NO consolidar — respetar SSOT.
                    return;
                }
                // Caso (a): solo legacy → consolidar por substring de categoría.
                const lowerCat = (cat || '').toLowerCase();
                const belongsToPerishable = PERISHABLE_PREFIXES.some(p => lowerCat.includes(p));
                if (belongsToPerishable) {
                    perishables[cat] = [...perishables[cat], ...stables[cat]];
                    delete stables[cat];
                } else {
                    stables[cat] = [...stables[cat], ...perishables[cat]];
                    delete perishables[cat];
                }
            });

            // [P1-PDF-3] Decisión centralizada de densidad y paginación.
            // El helper devuelve `isHyperDense` (≥60 items) y `multiPage` (≥80
            // items), añadidos por encima de los niveles existentes
            // `isDense`/`isUltraDense`. La función pura permite tests unitarios
            // de la decisión sin renderizar HTML real.
            const totalItems = Object.values(consData).length;
            const layout = computePdfLayoutDensity(totalItems);
            const { isDense, isUltraDense, isHyperDense, multiPage, columnCount, showInventoryNotes } = layout;

            // [P1-PDF-3] Telemetría operacional: el sweet-spot de la heurística
            // es 1 página hasta ~38, 1 página comprimido hasta ~75, multipage
            // 80+. Si vemos muchos hits con `multiPage=true` en producción,
            // hay que considerar un modo "página resumen" o paginar por
            // categoría. Solo logueamos si el usuario realmente cae en
            // hyper-dense (>=60) — debajo de eso es ruido.
            if (totalItems >= PDF_LAYOUT_THRESHOLDS.HYPER_DENSE) {
                console.info('[PDF density]', {
                    totalItems,
                    density: layout.density,
                    columnCount,
                    multiPage,
                });
            }

            const rootPadding = isHyperDense ? '4px' : isUltraDense ? '6px' : (isDense ? '10px' : '20px');
            const headerPadding = isHyperDense ? '4px 8px' : isUltraDense ? '6px 10px' : (isDense ? '10px 14px' : '16px 20px');
            const headerMargin = isHyperDense ? '4px' : isUltraDense ? '6px' : (isDense ? '10px' : '20px');
            const disclaimerPadding = isHyperDense ? '3px 6px' : isUltraDense ? '4px 8px' : '10px 14px';
            const disclaimerMargin = isHyperDense ? '4px' : isUltraDense ? '6px' : '12px';
            const catMargin = isHyperDense ? '5px' : isUltraDense ? '8px' : '16px';
            const ulPadding = isHyperDense ? '1px 3px' : isUltraDense ? '2px 4px' : (isDense ? '4px 8px' : '6px 12px');

            // Obtener duración actual (ya declarada arriba)
            let durationText = '7 Días';
            if (duration === 'biweekly') { durationText = '15 Días'; }
            if (duration === 'monthly') { durationText = '30 Días'; }

            // [P2-SHOPPING-TOTALS · 2026-05-16] Conteo de items por sección
            // para mostrar en header + section labels. Beneficio UX: el
            // usuario sabe a primera vista cuánto va a tomar comprar (e.g.
            // 25 items = 1 trip; 60 items = 2 trips o online).
            // Pre-fix: no había total visible, el usuario tenía que contar
            // mentalmente o asumir. Con totalItems (declarado arriba) ya
            // tenemos el global; aquí derivamos los de cada sección desde
            // los dicts `perishables` y `stables`.
            const perishableItemCount = Object.values(perishables).reduce(
                (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0,
            );
            const stableItemCount = Object.values(stables).reduce(
                (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0,
            );
            // Helper para pluralizar: "1 item" vs "5 items".
            const _fmtItems = (n) => `${n} ${n === 1 ? 'ítem' : 'ítems'}`;

            // Generar contenido HTML estilizado para el PDF
            const element = document.createElement('div');

            let htmlContent = `
            <div style="font-family: 'Inter', system-ui, sans-serif; padding: ${rootPadding}; color: #1f2937; background-color: #ffffff;">
                <!-- Header Box -->
                <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: ${headerPadding}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); display: flex; align-items: center; justify-content: space-between; margin-bottom: ${headerMargin}; border-top: 5px solid #10b981;">
                    <div>
                        <h1 style="margin: 0 0 8px 0; color: #111827; font-size: 20px; font-weight: 800; letter-spacing: -0.025em;">Lista de Compras</h1>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <span style="background-color: #ecfdf5; color: #065f46; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; border: 1px solid #10b98140;">Ciclo: ${escapeHtml(durationText)}</span>
                            <span style="background-color: #f3f4f6; color: #4b5563; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600;">Generado: ${escapeHtml(new Date().toLocaleDateString('es-DO'))}</span>
                            <!-- [P2-SHOPPING-TOTALS · 2026-05-16] Total chip. -->
                            <span style="background-color: #eff6ff; color: #1e40af; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; border: 1px solid #3b82f640;">Total: ${escapeHtml(_fmtItems(totalItems))}</span>
                        </div>
                    </div>
                    <img src="/favicon-transparent.png" alt="MealfitRD Logo" style="height: 40px;" />
                </div>

                
                <!-- Disclaimer de Cantidades -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #3b82f6; padding: ${disclaimerPadding}; border-radius: 6px; margin-bottom: ${disclaimerMargin}; display: flex; align-items: flex-start; gap: 8px;">
                    <svg style="flex-shrink: 0; width: 14px; height: 14px; color: #3b82f6; margin-top: 1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p style="margin: 0; font-size: ${isUltraDense ? '9px' : '10px'}; color: #334155; line-height: 1.25;">
                        <!-- [P3-DISCLAIMER-CONDENSE · 2026-05-17] Texto condensado
                             ~40% para evitar overflow a 2da página en planes de
                             tamaño normal. Preserva keywords ancla de tests:
                             '~', 'conversión aproximada', 'realismo de
                             almacenamiento' (P3-SHOPPING-DISCLAIMER-EXPAND),
                             'Estables (aceite, vinagre, miel, especias)' +
                             '1 botella o sobre rinde' (P3-STABLES-NO-SCALE-UX). -->
                        <strong>Smart Engine:</strong> Cantidades <strong>calculadas de manera exacta</strong> según empaques del mercado local. Ajusta a tu inventario. <strong>"Ud." significa "Unidad"</strong>.
                        ${isUltraDense ? '' : `
                        <span style="display: block; margin-top: 2px; color: #475569;">
                            <strong>"~"</strong> = conversión aproximada (ej.: <em>2 Cabezas ≈ 2.2 lbs</em>). Algunas se ajustan por <strong>realismo de almacenamiento</strong> (hierbas frescas, lácteos perecederos, cítricos).
                        </span>
                        <span style="display: block; margin-top: 2px; color: #475569;">
                            <strong>Estables (aceite, vinagre, miel, especias):</strong> 1 botella o sobre rinde varias semanas — misma cantidad entre ciclos 7d/15d/30d.
                        </span>
                        `}
                    </p>
                </div>

                ${freshInventoryStale ? `
                <!-- [P1-PDF-1] Stale Inventory Banner: el fetch fresco falló o
                     timeoutó; usamos liveInventory cacheado y avisamos al usuario.
                     Color amber/warning (no rojo) para diferenciarlo de error duro. -->
                <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 3px solid #f59e0b; padding: ${disclaimerPadding}; border-radius: 6px; margin-bottom: ${disclaimerMargin}; display: flex; align-items: flex-start; gap: 8px;">
                    <svg style="flex-shrink: 0; width: 14px; height: 14px; color: #f59e0b; margin-top: 1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p style="margin: 0; font-size: ${isUltraDense ? '9.5px' : '11px'}; color: #78350f; line-height: 1.3;">
                        <strong>Aviso:</strong> Esta lista usa datos en caché de tu Nevera (no pudimos validar el inventario en vivo). <strong>Verifica antes de comprar</strong> para evitar duplicados.
                    </p>
                </div>
                ` : ''}

                ${isPlanExpired ? `
                <!-- [P2-SHOPPING-2 · 2026-05-14] Banner plan vencido. El botón de
                     descargar PDF NO chequea isPlanExpired (decisión UX: permitir
                     re-descarga de lista histórica), pero advertimos al usuario
                     en el PDF mismo para que no compre ingredientes sin
                     regenerar el plan. Color rojo prominente (vs ámbar del stale
                     inventory): es señal "acción requerida", no "información de
                     contexto". El usuario puede ignorar y comprar igual — es su
                     decisión informada. -->
                <div style="background-color: #fef2f2; border: 1px solid #fca5a5; border-left: 3px solid #dc2626; padding: ${disclaimerPadding}; border-radius: 6px; margin-bottom: ${disclaimerMargin}; display: flex; align-items: flex-start; gap: 8px;">
                    <svg style="flex-shrink: 0; width: 14px; height: 14px; color: #dc2626; margin-top: 1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p style="margin: 0; font-size: ${isUltraDense ? '9.5px' : '11px'}; color: #991b1b; line-height: 1.3;">
                        <strong>Plan vencido:</strong> Tu ciclo de compras ya expiró. Esta lista refleja el plan anterior. <strong>Regenera tu plan</strong> antes de comprar para que coincida con tus próximas comidas.
                    </p>
                </div>
                ` : ''}

                ${deltaIsAdjusted ? `
                <!-- Delta Shopping Banner -->
                <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-left: 3px solid #10b981; padding: ${disclaimerPadding}; border-radius: 6px; margin-bottom: ${disclaimerMargin}; display: flex; align-items: flex-start; gap: 8px;">
                    <svg style="flex-shrink: 0; width: 14px; height: 14px; color: #10b981; margin-top: 1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <p style="margin: 0; font-size: ${isUltraDense ? '9.5px' : '11px'}; color: #065f46; line-height: 1.3;">
                        <strong>Nevera Inteligente:</strong> Esta lista fue ${deltaItemsRemoved > 0 ? `<strong>ajustada automáticamente</strong> — ${escapeHtml(deltaItemsRemoved)} ingrediente${deltaItemsRemoved > 1 ? 's' : ''} ya está${deltaItemsRemoved > 1 ? 'n' : ''} en tu Nevera y ${deltaItemsRemoved > 1 ? 'fueron excluidos' : 'fue excluido'}` : '<strong>ajustada</strong> según lo que ya tienes en tu Nevera'}.
                    </p>
                </div>
                ` : ''}

            `;

            if (isEmptyList) {
                htmlContent += `
                <div style="text-align: center; padding: 40px 20px; background-color: #f0fdf4; border: 2px dashed #4ade80; border-radius: 12px; margin: 30px 0;">
                    <div style="font-size: 56px; margin-bottom: 12px;">🎉</div>
                    <h2 style="color: #166534; font-size: 24px; margin: 0 0 12px 0; font-weight: 800; letter-spacing: -0.02em;">${escapeHtml(emptyMessageTitle)}</h2>
                    <p style="color: #15803d; margin: 0; font-size: 14px; line-height: 1.5; font-weight: 500;">${escapeHtml(emptyMessageDesc)}</p>
                </div>
                `;
            }

            const generateBlocks = (groupObj, isPerishable) => {
                let innerHtml = '';
                const sortedKeys = Object.keys(groupObj).sort((a, b) => {
                    if (a.includes('ESTIMADO TOTAL')) return 1;
                    if (b.includes('ESTIMADO TOTAL')) return -1;
                    return a.localeCompare(b);
                });

                sortedKeys.forEach(cat => {
                    const icon = `<span style="background-color: #10b981; color: white; border-radius: 4px; padding: 3px; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px;"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg></span>`;
                    // [P1-PDF-3] Padding del header de cada tarjeta de categoría.
                    const catHeaderPadding = isHyperDense ? '3px 6px' : isUltraDense ? '4px 8px' : (isDense ? '6px 10px' : '8px 12px');
                    const catTitleFont = isHyperDense ? '8px' : isUltraDense ? '9.5px' : '11px';
                    innerHtml += `
                    <div style="background-color: #ffffff; border: 1px solid #f3f4f6; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); break-inside: avoid-column; page-break-inside: avoid; margin-bottom: ${catMargin}; display: table; width: 100%;">
                        <div style="background-color: #f8fafc; padding: ${catHeaderPadding}; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 6px;">
                            ${icon}
                            <h3 style="margin: 0; font-size: ${catTitleFont}; font-weight: 800; color: #1f2937; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(cat)}</h3>
                        </div>
                        <ul style="list-style: none; padding: 0; margin: 0;">
                    `;
                    groupObj[cat].forEach((item, index) => {
                        const isLast = index === groupObj[cat].length - 1;
                        const borderBottom = isLast ? '' : 'border-bottom: 1px solid #f3f4f6;';

                        let displayQty = item.qty_base || '';
                        let display = item.display_name || item.name || item.item_name;

                        if (typeof display === 'string' && display.trim().startsWith('{')) {
                            try {
                                const parsed = JSON.parse(display);
                                display = parsed.display_name || parsed.name || parsed.item_name || display;
                            } catch (e) { }
                        } else if (typeof display === 'object' && display !== null) {
                            display = display.display_name || display.name || display.item_name || JSON.stringify(display);
                        }

                        // Color del chip alineado con la durabilidad real del item:
                        // verde = dura el ciclo completo (estables), ámbar = consumir
                        // en ~7-14 días (perecederos). Antes el color codificaba la
                        // confianza del match al catálogo (dato técnico interno) — info
                        // que el usuario no puede accionar. Ahora el chip refuerza la
                        // misma señal que la sección donde aparece.
                        const conf = (item.item_ref && item.item_ref.confidence_score) ? item.item_ref.confidence_score : 1.0;
                        const tagBg = isPerishable ? '#fff7ed' : '#ecfdf5';
                        const tagColor = isPerishable ? '#ea580c' : '#059669';
                        const tagBorder = isPerishable ? '#ea580c30' : '#10b98130';
                        // [P3-PDF-LOWCONF-WARN-FIX · 2026-05-16] Pre-fix mostraba
                        // ⚠️ inline cuando conf<0.7 confiando en el tooltip
                        // `title="Match al catálogo dudoso"`. PERO el PDF es print
                        // estático: el tooltip NUNCA es visible al usuario que ve
                        // el PDF descargado o impreso → el ⚠ huérfano confundía
                        // (¿caducidad? ¿alérgeno? ¿error de cantidad?). Caso
                        // observado 2026-05-15: Ajo y Huevo flageados conf<0.7
                        // simplemente porque el embedding-2 RPM estaba saturado
                        // y caímos al regex fast-path (penaliza confidence).
                        // Post-fix: mostrar etiqueta de texto "verifica" pequeña
                        // y discreta SOLO cuando conf<0.5 (umbral más estricto
                        // — los matches 0.5-0.7 del fast-path son típicamente
                        // canónicos comunes). En el Dashboard UI (interactiva)
                        // se preserva el render rico con tooltip — eso vive en
                        // otro path de renderizado, no en este HTML.
                        const lowConfWarn = conf < 0.5
                            ? `<span style="margin-left: 6px; font-size: ${isHyperDense ? '6.5px' : '8px'}; color: #b45309; background-color: #fef3c7; padding: 0px 4px; border-radius: 3px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;">verifica</span>`
                            : '';

                        // [P1-PDF-3] Font size escalado: 6.5px en hyper-dense
                        // sigue legible en print pero abre paso a 4 columnas + 60+ items.
                        const qtyFont = isHyperDense ? '6.5px' : isUltraDense ? '7.5px' : (isDense ? '8.5px' : '9.5px');
                        const qtyPad = isHyperDense ? '0px 2px' : isUltraDense ? '1px 3px' : '1.5px 4px';
                        const itemFont = isHyperDense ? '7.5px' : isUltraDense ? '9px' : (isDense ? '10px' : '11px');
                        const checkboxSize = isHyperDense ? '8px' : isUltraDense ? '10px' : (isDense ? '12px' : '14px');
                        const checkboxMarginRight = isHyperDense ? '4px' : isDense ? '6px' : '10px';

                        // [P1-1] `displayQty`, `display`, `_inventoryNote` vienen
                        // del LLM, del user_inventory de Supabase o del formulario.
                        // Escapamos los 5 metacaracteres HTML antes de interpolar
                        // para evitar markup roto en el PDF (categorías duplicadas,
                        // listado truncado, descarga malformada).
                        const qtyStr = displayQty && String(displayQty).trim() !== 'None' ? `<span style="font-weight: 700; color: ${tagColor}; font-size: ${qtyFont}; background-color: ${tagBg}; border: 1px solid ${tagBorder}; padding: ${qtyPad}; border-radius: 4px; margin-left: 4px; white-space: nowrap; align-self: flex-start;">${escapeHtml(displayQty)}</span>` : '';

                        // [P1-PDF-3] En hyper-dense, ocultamos `_inventoryNote`
                        // (libera ~10-12px verticales por item). El info no se
                        // pierde — sigue visible en la UI del Dashboard y en el
                        // banner global del PDF.
                        const noteHTML = (showInventoryNotes && item._inventoryNote)
                            ? `<div style="font-size: ${isUltraDense ? '7.5px' : (isDense ? '8.5px' : '9.5px')}; color: #059669; margin-top: 1px; font-weight: 500; line-height: 1.1;">💡 ${escapeHtml(item._inventoryNote)}</div>`
                            : '';

                        innerHtml += `
                            <li style="display: flex; align-items: flex-start; padding: ${ulPadding}; ${borderBottom} page-break-inside: avoid;">
                                <div style="width: ${checkboxSize}; height: ${checkboxSize}; border: 1.5px solid #d1d5db; border-radius: ${isDense ? '3px' : '4px'}; margin-right: ${checkboxMarginRight}; flex-shrink: 0; background-color: #ffffff; margin-top: 2px;"></div>
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                                    <div style="display: flex; flex-direction: column;">
                                        <span style="font-size: ${itemFont}; font-weight: 600; color: #374151; line-height: 1.2;">${escapeHtml(display)}${lowConfWarn}</span>
                                        ${noteHTML}
                                    </div>
                                    ${qtyStr}
                                </div>
                            </li>
                        `;
                    });
                    innerHtml += `</ul></div>`;
                });
                return innerHtml;
            };

            // [P1-PDF-3] `columnCount` viene del helper: 3 columnas hasta
            // ultra-dense, 4 en hyper-dense (≥60 items) para empacar más sin
            // perder legibilidad. column-gap también se reduce en hyper-dense.
            const columnGap = isHyperDense ? '8px' : isUltraDense ? '12px' : '16px';
            const sectionLabelFont = isHyperDense ? '8.5px' : isUltraDense ? '9.5px' : '11px';
            const sectionDescFont = isHyperDense ? '7px' : isUltraDense ? '7.5px' : '9px';

            // [VISIÓN-C] Etiquetas dinámicas según duración seleccionada.
            // El backend en `_build_hybrid_shopping_list` ya recortó las cantidades:
            //   - Perecederos: cantidad para 1 semana (compra recurrente).
            //   - Estables: cantidad para todo el periodo (compra única).
            const isWeekly = duration === 'weekly';
            const perishableLabel = isWeekly
                ? 'COMPRA ESTA SEMANA — PERECEDEROS'
                : 'COMPRA ESTA SEMANA — PERECEDEROS (REPITE CADA 7 DÍAS)';
            const perishableDesc = isWeekly
                ? 'Carnes, lácteos, frutas y vegetales frescos. Consume o refrigera pronto.'
                : 'Estos se dañan rápido, por eso aparecen solo para 7 días aunque tu plan sea más largo. Vuelve a comprar cada semana.';
            const stableLabel = duration === 'monthly'
                ? 'DESPENSA DEL MES — ESTABLES (COMPRA UNA SOLA VEZ)'
                : duration === 'biweekly'
                    ? 'DESPENSA PARA 15 DÍAS — ESTABLES (COMPRA UNA SOLA VEZ)'
                    : 'DESPENSA — ESTABLES (+7 DÍAS)';
            const stableDesc = isWeekly
                ? 'Granos, enlatados, especias y víveres secos. Tienen larga caducidad.'
                : 'Granos, enlatados, especias y víveres secos. Cantidad calculada para todo el periodo: cómpralos una sola vez.';

            if (Object.keys(perishables).length > 0) {
                htmlContent += `
                <!-- Prioridad Alta -->
                <div style="background-color: #fef2f2; border: 1px solid #fca5a5; padding: ${disclaimerPadding}; border-radius: 6px; margin-bottom: ${disclaimerMargin}; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span style="font-size: ${sectionLabelFont}; font-weight: 800; color: #991b1b; letter-spacing: 0.05em;">${perishableLabel}<span style="font-weight: 600; color: #b91c1c; margin-left: 6px;">· ${escapeHtml(_fmtItems(perishableItemCount))}</span></span>
                    </div>
                    <div style="font-size: ${sectionDescFont}; color: #b91c1c; padding-left: 18px; line-height: 1.2;">
                        ${perishableDesc}
                    </div>
                </div>
                <div style="column-count: ${columnCount}; column-gap: ${columnGap};">
                `;
                htmlContent += generateBlocks(perishables, true);
                htmlContent += `</div> <!-- End Columns -->`;
            }

            if (Object.keys(stables).length > 0) {
                htmlContent += `
                <!-- Estables -->
                <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: ${disclaimerPadding}; border-radius: 6px; margin-top: 2px; margin-bottom: ${disclaimerMargin}; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2.5"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/></svg>
                        <span style="font-size: ${sectionLabelFont}; font-weight: 800; color: #166534; letter-spacing: 0.05em;">${stableLabel}<span style="font-weight: 600; color: #15803d; margin-left: 6px;">· ${escapeHtml(_fmtItems(stableItemCount))}</span></span>
                    </div>
                    <div style="font-size: ${sectionDescFont}; color: #15803d; padding-left: 18px; line-height: 1.2;">
                       ${stableDesc}
                    </div>
                </div>
                <div style="column-count: ${columnCount}; column-gap: ${columnGap};">
                `;
                htmlContent += generateBlocks(stables, false);
                htmlContent += `</div> <!-- End Columns -->`;
            }


            htmlContent += `
                <!-- Footer -->
                <div style="margin-top: 15px; text-align: center; color: #9ca3af; font-size: 10px; border-top: 2px dashed #e5e7eb; padding-top: 10px;">
                    <p style="margin: 0; font-weight: 700; color: #6b7280; letter-spacing: 1px;">PROCESADO POR MEALFITRD IA - NUTRICIÓN INTELIGENTE</p>
                </div>
            </div>
            `;

            // [P1-PDF-XSS-AUDITED: htmlContent compuesto con escapeHtml() en
            // toda interpolación user-controlled (display_name, category,
            // displayQty, _inventoryNote, durationText, banners). El render
            // se hace en un div detached que se pasa a html2pdf — no se
            // inyecta al DOM live. Auditoría P1-1 + P1-PDF-XSS-BLANKET.]
            element.innerHTML = htmlContent;

            // [P1-PDF-3] Configuración de paginación según densidad.
            // - 1 página (default): `avoid-all` evita cortes dentro de tarjetas
            //   pero también dentro del bloque entero — comprime cuando hay
            //   espacio suficiente.
            // - multi-página (≥80 items): cambia a estrategia CSS+legacy que
            //   respeta `page-break-inside: avoid` por elemento individual,
            //   permitiendo que html2pdf paginee formalmente sin truncar.
            const pagebreakMode = multiPage ? ['css', 'legacy'] : ['avoid-all'];
            // [P3-SHOPPING-1 · 2026-05-14] Nombre PDF con discriminador único:
            // fecha (YYYY-MM-DD) + prefix corto del plan_id. Antes el filename
            // era `Lista_de_compras_7_Días.pdf` y descargar 2 PDFs con la
            // misma duración producía colisión (`(1).pdf` según browser, o
            // sobrescribía silenciosamente). El prefix de plan_id discrimina
            // entre planes distintos del mismo ciclo; la fecha discrimina
            // re-descargas del mismo plan en días diferentes.
            const _planIdPrefix = (effectivePlanData?.id || '').toString().slice(0, 8) || 'noid';
            const _today = new Date().toISOString().slice(0, 10);
            const opt = {
                margin: multiPage ? [6, 4, 8, 4] : [4, 0, 0, 0],
                filename: `Lista_de_compras_${durationText.replace(/ /g, '_')}_${_today}_${_planIdPrefix}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, windowWidth: 800 },
                pagebreak: { mode: pagebreakMode },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            // [P2-LAZY-PDF · 2026-05-13] Dynamic import: ver nota en el
            // import section. El chunk html2pdf-*.js se fetch SOLO acá.
            //
            // [P3-RECIPES-CHUNK-LOAD-FAIL · 2026-05-15] Wrap dedicado para
            // `ChunkLoadError` — mismo patrón que Recipes.jsx. Sin esto el
            // outer try/catch lanza un toast genérico; el mensaje específico
            // sugiere refresh + retry que arregla el caso (red intermitente
            // o build rotation invalidando hashes).
            let html2pdf;
            try {
                html2pdf = (await import('html2pdf.js')).default;
            } catch (importErr) {
                toast.dismiss(loadingToast);
                const _msg = String(importErr?.message || '');
                if (
                    importErr?.name === 'ChunkLoadError' ||
                    /loading chunk|failed to fetch dynamically imported/i.test(_msg)
                ) {
                    toast.error('Error de red al cargar el PDF. Refresca la página e intenta de nuevo.');
                } else {
                    toast.error('No se pudo cargar el generador de PDF. Refresca la página e intenta de nuevo.');
                }
                pdfLock.current = false;
                return;
            }
            // [P2-PDF-OBS-2 · 2026-05-14] Timeout sobre html2pdf().save().
            // Bug observado (raro pero reproducible): html2canvas cuelga
            // indefinido en iOS Safari con `column-count: 4` + `break-inside:
            // avoid-column` en planes hyper-dense (≥60 items), o en
            // Chromium mobile si la pestaña pierde foco durante un render
            // largo. La promise nunca resuelve → el `finally` que libera
            // `pdfLock.current = false` nunca corre → usuario no puede
            // descargar PDF hasta refresh de página.
            //
            // Fix: Promise.race contra un timeout (default 60s, knob
            // `VITE_PDF_RENDER_TIMEOUT_MS` con clamp [15s, 180s]). Si
            // dispara, lanza `PdfRenderTimeout` que el catch existente
            // captura → `pdf_download_failed` con `error_name=PdfRenderTimeout`
            // permite a operadores grep eventos y discriminar timeouts de
            // errores reales del render.
            const _rawTimeoutKnob = parseInt(import.meta.env.VITE_PDF_RENDER_TIMEOUT_MS, 10);
            let _pdfRenderTimeoutMs = Number.isFinite(_rawTimeoutKnob) ? _rawTimeoutKnob : 60000;
            if (_pdfRenderTimeoutMs < 15000) _pdfRenderTimeoutMs = 15000;
            if (_pdfRenderTimeoutMs > 180000) _pdfRenderTimeoutMs = 180000;
            let _pdfTimeoutHandle = null;
            const _pdfTimeoutPromise = new Promise((_resolve, reject) => {
                _pdfTimeoutHandle = setTimeout(() => {
                    const _timeoutErr = new Error(`html2pdf no completó en ${_pdfRenderTimeoutMs}ms`);
                    _timeoutErr.name = 'PdfRenderTimeout';
                    reject(_timeoutErr);
                }, _pdfRenderTimeoutMs);
            });
            try {
                await Promise.race([
                    html2pdf().set(opt).from(element).save(),
                    _pdfTimeoutPromise,
                ]);
            } finally {
                if (_pdfTimeoutHandle) clearTimeout(_pdfTimeoutHandle);
            }

            toast.dismiss(loadingToast);
            toast.success('Lista PDF descargada exitosamente', { icon: '📄', position: 'top-center' });

            // [P3-SHOPPING-4 · 2026-05-14] Telemetría de éxito. Antes solo
            // emitíamos `pdf_stale_inventory_fallback` (path degradado);
            // ahora también `pdf_download_success` con dimensiones que
            // permiten medir adopción (total_items, density tier, multi_page,
            // si fue stale fallback). Base-rate de success permite calcular
            // success_rate y discriminar bursts del cron P2-SHOPPING-3 vs
            // crecimiento orgánico de uso del feature.
            try {
                trackEvent('pdf_download_success', {
                    user_id: userProfile?.id,
                    plan_id: effectivePlanData?.id,
                    duration,
                    total_items: totalItems,
                    density: layout?.density,
                    multi_page: !!multiPage,
                    fresh_inventory_stale: freshInventoryStale,
                    is_plan_expired: isPlanExpired,
                    delta_items_removed: deltaItemsRemoved,
                });
            } catch (_telSuccessErr) {
                // No-op: telemetría best-effort.
            }

        } catch (error) {
            console.error('Error downloading supply list:', error);
            toast.dismiss();
            toast.error('Error al generar la lista de compras.');
            // [P3-SHOPPING-4 · 2026-05-14] Telemetría de fallo. Sin esto el
            // operador no puede distinguir "feature no usado" de "feature
            // roto" — ambos producen 0 success events. `error_name` y
            // `error_message` truncados a 200 chars para evitar payloads
            // gigantes en GA/PostHog (algunos backends cortan a 256).
            try {
                const _errName = (error && error.name) ? String(error.name).slice(0, 64) : 'UnknownError';
                const _errMsg = (error && error.message) ? String(error.message).slice(0, 200) : '';
                trackEvent('pdf_download_failed', {
                    user_id: userProfile?.id,
                    plan_id: planData?.id,
                    duration: formData?.groceryDuration || 'weekly',
                    error_name: _errName,
                    error_message: _errMsg,
                });
            } catch (_telFailErr) {
                // No-op: telemetría best-effort.
            }
        } finally {
            // [P1-6] Liberar SIEMPRE el lock, aunque el render del PDF
            // o el fetch fresh fallaran. Sin este finally, un fallo
            // silencioso dejaría el lock activo permanente y el usuario
            // no podría descargar el PDF hasta refrescar la página.
            pdfLock.current = false;
        }
    };

    const handleRestock = async () => {
        if (!userProfile?.id) {
            toast.error('Debes iniciar sesión para usar esta función.');
            return;
        }

        // [P0-2] Candado síncrono para evitar doble envío antes de que React actualice isRestocking
        if (restockLock.current) return;
        restockLock.current = true;

        // Validación Unica: Si matemáticamente y en tiempo real faltan ingredientes, lo permitimos.
        if (!hasPendingShoppingItems) {
            toast.info('Ya tienes todos estos ingredientes en tu Nevera.', { icon: '📦' });
            setShowRestockModal(false);
            restockLock.current = false;
            return;
        }

        setIsRestocking(true);
        const loadingToast = toast.loading('Guardando ingredientes en la despensa...', { position: 'top-center' });

        try {
            // [P1-1] Refresco de inventario fresco con timeout + degradación
            // visible. Antes el bloque era un `try/catch` silencioso (raw
            // `await supabase.from(...)`): si Supabase tardaba o fallaba,
            // `liveInventory` (potencialmente stale tras un restock cuyo
            // response falló pero sí persistió en BD) se usaba sin alerta →
            // el delta se calculaba contra caché vieja y el restock duplicaba
            // items en la despensa. Asimétrico con `handleDownloadShoppingList`
            // (PDF) que ya estaba hardenizado por P1-PDF-1.
            //
            // [P3-RESTOCK-STALE-FALLBACK-EMPTY · 2026-05-18] Cuando el fresh
            // fetch de user_inventory falla (timeout/error), NO usar liveInventory
            // cacheado como fallback — usar [] (lista vacía). El backend tiene
            // self-heal P3-RESTOCK-STALE-DEDUP que cubre el caso.
            let freshInventoryForRestock = liveInventory;
            const _restockFreshFetch = await fetchFreshInventoryWithTimeout(
                () => supabase
                    .from('user_inventory')
                    .select('ingredient_name, quantity, unit, created_at, master_ingredients(name, category, shelf_life_days)')
                    .eq('user_id', userProfile.id)
                    .gt('quantity', 0)
                    .order('ingredient_name', { ascending: true }),
                getInventoryFetchTimeoutMs(),
            );
            if (!_restockFreshFetch.stale) {
                freshInventoryForRestock = _restockFreshFetch.data;
                setLiveInventory(_restockFreshFetch.data);
                setInventoryStale(false);
            } else {
                freshInventoryForRestock = [];
                setInventoryStale(true);
                toast.warning('Tu Nevera puede estar desactualizada', {
                    description: 'No pudimos validar tu inventario en vivo. Procediendo con la lista completa — la DB es la fuente de verdad.',
                    duration: 6000,
                });
                trackEvent('restock_stale_inventory_fallback', {
                    reason: _restockFreshFetch.reason,
                    user_id: userProfile?.id,
                    fallback_strategy: 'empty_array_trust_backend',
                });
            }

            // Fuente Verdadera: Solo enviar a la BD lo que es estrictamente NUEVO de la Lista de Compras del Plan!
            const duration = formData?.groceryDuration || 'weekly';
            const rawActiveShoppingList = getActiveShoppingList(planData, duration) || allPlanIngredients || [];

            // 🔄 Delta Shopping: solo enviar lo que NO está ya en la Nevera
            const activeShoppingList = buildDeltaShoppingList(rawActiveShoppingList, freshInventoryForRestock);

            const sourceIngredients = activeShoppingList.map(ing => {
                let name = '';
                let structured = null;
                let raw = '';
                if (typeof ing === 'object' && ing !== null) {
                    name = ing.name || ing.display_name || ing.display_string || String(ing);
                    if (ing.name && (ing.market_qty !== undefined || ing.market_qty_numeric !== undefined || ing.display_qty)) {
                        let mqNum = resolveShopQty(ing);
                        if (mqNum === 0) {
                            mqNum = parseMarketQty(ing.display_qty) || 1;
                        }
                        structured = {
                            name: ing.name,
                            quantity: mqNum,
                            unit: ing.market_unit || ing.unit || 'unidad'
                        };
                    }
                    raw = ing.display_string || ing.id_string || `${ing.display_qty || '1'} de ${ing.name || 'Ingrediente'}`;
                } else {
                    raw = String(ing);
                    const match = raw.match(/^([\d.,\/\s½¼¾%]+(?:oz|lbs?|g|kg|ml|l|taza[s]?|cda[s]?|cdta[s]?|u|pz[a]?[s]?|dientes?|manojo|piezas?|rebanadas?)\s*(?:de\s*)?)(.*)$/i) || raw.match(/^([\d.,\/\s½¼¾%]+(?:de\s*)?)(.*)$/i);
                    name = raw;
                    if (match) name = match[2];
                }
                return { raw, structured, normalized: name.toLowerCase().trim() };
            }).filter(item => !disabledIngredients.includes(item.normalized))
                .map(item => item.structured || item.raw);

            if (sourceIngredients.length === 0) {
                toast.dismiss(loadingToast);
                toast.info('Ya tienes todos estos ingredientes en tu Nevera.', { icon: '📦' });
                setIsRestocking(false);
                setShowRestockModal(false);
                restockLock.current = false;
                return;
            }

            const response = await fetchWithAuth('/api/plans/restock', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: userProfile.id,
                    plan_id: planData?.id,
                    ingredients: sourceIngredients
                })
            });

            const data = await response.json();
            toast.dismiss(loadingToast);

            if (response.ok && data.success) {
                toast.success('¡Ingredientes ingresados a tu Nevera Virtual!', { icon: '📦' });
                setSessionRestocked(true);

                // ✅ Marcar planData como restocked para que el PDF delta suprima residuos
                if (planData) {
                    const updatedPlan = { ...planData, is_restocked: true };
                    setPlanData(updatedPlan);
                    localStorage.setItem('mealfit_plan', JSON.stringify(updatedPlan));
                }

                // Guardar la configuración con la que se registraron las compras
                if (userProfile?.id) {
                    localStorage.setItem(`mealfit_restock_config_${userProfile.id}`, JSON.stringify({
                        householdSize: formData?.householdSize || 1,
                        groceryDuration: formData?.groceryDuration || groceryDuration || 'weekly'
                    }));
                }

                // [P3-RESTOCK-NO-BAR · 2026-05-20] Sin barra de progreso, el
                // modal cierra DIRECTO al success — no esperamos animaciones.
                setShowRestockModal(false);

                // [P3-RESTOCK-FLOW-SPEED · 2026-05-20] Invalidar cache stale
                // PRE-refetch.
                invalidateInventoryCache();

                // [P3-RESTOCK-FLOW-SPEED · 2026-05-20] Refetch + cache populate
                // en paralelo. Sin `await`, el navigate no se bloquea.
                supabase
                    .from('user_inventory')
                    .select('ingredient_name, quantity, unit, created_at, master_ingredients(name, category, shelf_life_days)')
                    .eq('user_id', userProfile.id)
                    .gt('quantity', 0)
                    .order('ingredient_name', { ascending: true })
                    .then(({ data: freshInv }) => {
                        if (freshInv) {
                            setLiveInventory(freshInv);
                            // Popula el cache singleton — Pantry monta con
                            // `getCachedInventory()` poblado → cero skeleton.
                            setCachedInventory(freshInv);
                        }
                    })
                    .catch(() => { /* non-blocking — Pantry hará su propio fetch */ });

                // Limpiar ingredientes deshabilitados ya que la despensa se actualizó
                setDisabledIngredients([]);

                // [P3-RESTOCK-FLOW-SPEED · 2026-05-20] Navigate síncrono.
                navigate('/dashboard/pantry');
            } else {
                toast.error(data.message || 'Error al actualizar la despensa.');
            }
        } catch (error) {
            console.error('🛒 [RESTOCK] CATCH ERROR:', error);
            toast.dismiss(loadingToast);
            toast.error('Hubo un error de conexión al registrar la compra.');
        } finally {
            setIsRestocking(false);
            restockLock.current = false;
        }
    };


    // Retrocompatibilidad y extracción de días
    const planDays = planData?.days || [{ day: 1, meals: planData?.meals || planData?.perfectDay || [] }];
    
    // Rolling Window: calcular el índice del día de hoy dentro del plan
    // daysSinceCreation ya está calculado arriba a partir de grocery_start_date
    const todayPlanDayIndex = Math.max(0, Math.min(daysSinceCreation, planDays.length - 1));
    
    // Mostrar todos los d\u00edas pero marcar cu\u00e1les son pasados/hoy/futuros
    // Si hay d\u00edas de retraso (el cron no corri\u00f3) o si faltan d\u00edas (plan roto), llamar a /shift-plan on-demand
    useEffect(() => {
        const triggerShift = async () => {
            const requestedDays = Math.max(3, parseInt(planData?.total_days_requested) || 3);
            const needsShift = daysSinceCreation > 0;
            // Solo intentar rellenar días faltantes si el plan ya no se está generando en background por chunks
            const needsFill = planDays.length < requestedDays && planData?.generation_status !== 'partial';
            
            if (!userProfile?.id || (!needsShift && !needsFill)) return;
            
            // Check if we already have the days (maybe backend shifted but grocery_start_date didn't update yet)
            // Or just call the API, it's idempotent.
            try {
                const response = await fetchWithAuth(`${API_BASE}/api/plans/shift-plan`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user_id: userProfile.id,
                        tzOffset: new Date().getTimezoneOffset()
                    })
                });
                
                if (response.ok) {
                    const resData = await response.json();
                    if (resData.success && resData.plan_data && !resData.message.includes("completo")) {
                        // console.log('\ud83d\udd04 [ROLLING WINDOW] Shift/Fill completado on-demand:', resData.message);
                        setPlanData(resData.plan_data);
                    }
                }
            } catch (error) {
                console.error('\u26a0\ufe0f [ROLLING WINDOW] Error en shift on-demand:', error);
            }
        };
        
        triggerShift();
    }, [userProfile?.id, daysSinceCreation, planDays.length, planData?.total_days_requested]);

    // [P3-DASH-WINDOW-FROM-TODAY · 2026-05-18] Ventana rolling que ARRANCA en
    // hoy y avanza, NUNCA retrocede a días pasados. La ventana se achica al
    // cruzar cada día hasta llegar al último día del chunk vivo, y se expande
    // a 4 tabs cuando entra el chunk siguiente.
    //
    // Comportamiento end-to-end (plan 7d con chunks [3, 4]):
    //   - Lunes (día 1):  [L, M, Mi]          ventana 3 (chunk 2 aún no listo)
    //   - Martes (día 2): [M, Mi]              ventana 2 (se achica)
    //   - Miércoles (3):  [Mi]                  ventana 1 (último día del chunk 1)
    //   - Jueves (4)*:    [J, V, S, D]          ventana 4 (chunk 2 ya está en planDays)
    //   - Viernes (5):    [V, S, D]             ventana 3
    //   ... y así sucesivamente.
    //   *requiere que el cron del chunk 2 haya completado y `triggerShift` haya
    //   re-hidratado `planData` con los 4 nuevos días.
    //
    // Tooltip-anchor: P3-DASH-WINDOW-FROM-TODAY.
    //
    // [P0-DASH-WINDOW-COLLAPSE · 2026-05-09] REMOVIDO el anti-colapso al final
    // del plan. El user pidió explícitamente que la ventana se achicara al cruzar
    // cada día (vs el comportamiento anterior que mantenía 3 tabs fijos
    // retrocediendo el inicio para evitar el "colapso"). Decisión 2026-05-18:
    // el colapso es feature, no bug — refleja exactamente el ciclo del usuario
    // ("hoy es miércoles y este es mi último día antes del próximo bloque").
    //
    // El edge case que P0-DASH-WINDOW-COLLAPSE protegía (rolling refill atrasado
    // sin chunks futuros aún persistidos) queda cubierto por el `triggerShift`
    // useEffect arriba: si planDays.length <= todayPlanDayIndex, el shift API
    // se invoca y re-hidrata el plan. Mientras tanto, el clamp del
    // `visibleStartIndex` a `planDays.length - 1` evita slice vacío.
    const _MAX_WINDOW = 4;
    const visibleStartIndex = Math.min(
        todayPlanDayIndex,
        Math.max(0, planDays.length - 1)
    );
    const visiblePlanDays = planDays.slice(visibleStartIndex, visibleStartIndex + _MAX_WINDOW);

    // Auto-seleccionar el tab del día actual si queda fuera de la ventana visible.
    // [P3-DASH-WINDOW-FROM-TODAY · 2026-05-18] Renombrado `_WINDOW_SIZE` →
    // `_MAX_WINDOW` para reflejar que ahora es un cap, no una ventana fija.
    useEffect(() => {
        if (!planData?.days || planData.days.length <= 1) return;
        const windowEnd = visibleStartIndex + _MAX_WINDOW;
        if (activeDayIndex < visibleStartIndex || activeDayIndex >= windowEnd) {
            setActiveDayIndex(todayPlanDayIndex);
        }
    }, [planData?.days, todayPlanDayIndex, visibleStartIndex]);

    const currentDayMeals = planDays[activeDayIndex]?.meals || [];
    const currentDaySupplements = planDays[activeDayIndex]?.supplements || [];

    return (
        <>

            {/* Mobile Responsive Styles */}
            <style>{`
                .dashboard-header {
                    margin-bottom: 3rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    flex-wrap: wrap;
                    gap: 1.5rem;
                    background: linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.5) 100%);
                    backdrop-filter: blur(12px);
                    padding: 2rem;
                    border-radius: 2rem;
                    border: 1px solid rgba(255,255,255,0.6);
                    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.05);
                    position: relative;
                    z-index: 100;
                }
                .dashboard-title {
                    font-size: 2.5rem;
                    font-weight: 800;
                    line-height: 1.1;
                    letter-spacing: -0.03em;
                    margin-bottom: 0.25rem;
                    color: #1E293B;
                }
                .dashboard-subtitle {
                    color: #64748B;
                    font-size: 1.1rem;
                    font-weight: 500;
                }
                .macros-card {
                    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.8) 100%);
                    backdrop-filter: blur(20px);
                    border-radius: 1.75rem;
                    border: 1px solid rgba(226, 232, 240, 0.8);
                    box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.05), inset 0 2px 4px rgba(255, 255, 255, 0.8);
                    margin-bottom: 2.5rem;
                    overflow: hidden;
                    position: relative;
                }
                .macros-card-header {
                    padding: 1.5rem 1.75rem 0.5rem 1.75rem;
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    margin: 0;
                }
                .macros-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    position: relative;
                }
                .macros-grid > div:not(:last-child) {
                    border-right: 1px solid rgba(226, 232, 240, 0.6);
                }
                .stat-item {
                    padding: 1.5rem 1.75rem;
                    display: flex;
                    align-items: center;
                    gap: 1.15rem;
                    background: transparent;
                    cursor: default;
                }
                .menu-section-header {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 2.5rem 2rem 1.5rem 4rem;
                }
                .menu-section-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--text-main);
                    margin: 0;
                    text-align: center;
                }
                .menu-section-count {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                }
                .option-buttons {
                    display: flex;
                    gap: 1rem;
                    justify-content: center;
                    background: transparent;
                    padding: 0.5rem 2rem 1.5rem 4rem;
                    border-bottom: 2px dashed #94A3B8;
                }
                .option-btn {
                    flex: 1;
                    padding: 1rem;
                    border-radius: 0.75rem;
                    font-weight: 800;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-size: 1rem;
                }
                .meals-container {
                    background-color: #FDFCF8;
                    border-radius: 0.5rem 1.75rem 1.75rem 0.5rem;
                    border: 1px solid #E2E8F0;
                    border-left: 20px solid #1E293B;
                    box-shadow: 4px 4px 0px rgba(0,0,0,0.02), 8px 8px 0px rgba(0,0,0,0.01), 0 25px 50px -12px rgba(0,0,0,0.15), inset 8px 0px 8px -4px rgba(0,0,0,0.2);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    position: relative;
                }
                .meals-container::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    left: 2.5rem;
                    width: 3px;
                    border-left: 1px solid rgba(248, 113, 113, 0.4);
                    border-right: 1px solid rgba(248, 113, 113, 0.4);
                    z-index: 0;
                    pointer-events: none;
                }
                .meal-card {
                    padding: 2.5rem 2.5rem 2.5rem 4.5rem;
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: 1.5rem;
                    align-items: center;
                    background: transparent;
                    position: relative;
                    z-index: 1;
                }
                .meal-card:not(:last-child)::after,
                .skipped-lunch:not(:last-child)::after {
                    content: '';
                    display: block;
                    position: absolute;
                    bottom: 0;
                    left: 2.5rem;
                    right: 0;
                    height: 2px;
                    background: rgba(147, 197, 253, 0.3);
                }
                .skipped-lunch {
                    padding: 2.5rem 2.5rem 2.5rem 4.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1.5rem;
                    position: relative;
                    flex-wrap: wrap;
                    z-index: 1;
                }
                .main-grid {
                    display: flex;
                    flex-direction: row;
                    align-items: flex-start;
                    gap: 2.5rem;
                }
                .actions-group {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
                    position: relative;
                    z-index: 50;
                }
                .new-plan-btn {
                    padding: 0.85rem 1.75rem;
                    border-radius: 1rem;
                    border: none;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    /* [P3-PLAN-BTN-NO-FLASH · 2026-05-19] Transition acotada a
                       box-shadow + filter (lo que el :hover/:active necesitan).
                       Pre-fix transition:all 0.3s animaba CUALQUIER cambio de
                       propiedad, incluyendo el background runtime que el
                       botón "Llena tu Nevera" / "Actualizar platos" recalcula
                       cuando isPantryTooEmpty flippea tras el fetch async del
                       inventario. Resultado: al volver al apartado Plan, el
                       botón hacía un flash de ~300ms por el background fade.
                       Los botones "Ya compré todo" y "PDF" no flasheaban
                       porque su background es estable. Ahora todos quedan
                       estáticos en mount/remount. */
                    transition:
                        box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                        filter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-size: 0.95rem;
                    cursor: pointer;
                }
                .new-plan-btn:hover:not(:disabled) {
                    box-shadow: var(--hover-shadow, 0 15px 30px -5px rgba(0,0,0,0.15)) !important;
                    filter: brightness(1.1);
                }
                .new-plan-btn:active:not(:disabled) {
                    box-shadow: var(--active-shadow, 0 5px 15px -5px rgba(0,0,0,0.1)) !important;
                    filter: brightness(0.95);
                }

                /* [P3-RESTOCK-MINIMAL-CTA · 2026-05-20] Estilos del botón
                   "Ya compré todo" rediseñado (outline + accent dot). El
                   dot emerald es el ÚNICO acento de color — preserva la
                   semántica "success ready" sin el ruido del gradient.
                   Hover: borde slate-900 + dot ring ampliado.
                   Tooltip-anchor: P3-RESTOCK-MINIMAL-CTA. */
                .restock-cta-minimal {
                    position: relative;
                }
                .restock-cta-minimal:hover:not(:disabled) {
                    border-color: #0F172A !important;
                    box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.12) !important;
                    transform: translateY(-1px);
                }
                .restock-cta-minimal:active:not(:disabled) {
                    transform: translateY(0);
                    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06) !important;
                }
                .restock-cta-minimal:focus-visible {
                    outline: 2px solid #4F46E5;
                    outline-offset: 2px;
                }
                .restock-cta-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #10B981;
                    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55);
                    animation: restock-cta-pulse 2.1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                    flex-shrink: 0;
                }
                /* Pulse subtle — ring grows + fades out, dot core stays solid */
                @keyframes restock-cta-pulse {
                    0%   { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
                    70%  { box-shadow: 0 0 0 7px rgba(16, 185, 129, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                }
                .restock-cta-minimal:hover .restock-cta-dot {
                    /* Hover: dot ring más grande + un poco más opaco */
                    animation-duration: 1.4s;
                }
                @media (prefers-reduced-motion: reduce) {
                    .restock-cta-dot {
                        animation: none;
                        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
                    }
                    .restock-cta-minimal:hover:not(:disabled) {
                        transform: none;
                    }
                }

                /* [P3-RESTOCK-MINIMAL-CTA · 2026-05-20] Estilos del modal de
                   confirmación rediseñado. CTA principal slate-900 (text-main)
                   con flecha que se desliza horizontalmente en hover — micro-
                   interacción minimal que comunica acción. Cancel como text-link
                   sin background ni padding pesado (no compite con CTA). */
                .restock-modal-confirm {
                    background: #0F172A;
                    color: #FFFFFF;
                    border: none;
                    padding: 0.95rem 1.25rem;
                    border-radius: 0.85rem;
                    font-weight: 600;
                    font-size: 0.95rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.55rem;
                    transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
                    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.15);
                    letter-spacing: -0.005em;
                }
                .restock-modal-confirm:hover:not(:disabled) {
                    background: #1E293B; /* slate-800 — sutilmente más claro */
                    box-shadow: 0 8px 20px -4px rgba(15, 23, 42, 0.3);
                }
                .restock-modal-confirm:hover:not(:disabled) .restock-modal-arrow {
                    transform: translateX(4px);
                }
                .restock-modal-confirm:active:not(:disabled) {
                    transform: translateY(1px);
                    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
                }
                .restock-modal-confirm:focus-visible {
                    outline: 2px solid #4F46E5;
                    outline-offset: 2px;
                }
                .restock-modal-confirm:disabled {
                    opacity: 0.6;
                    cursor: wait;
                }
                .restock-modal-arrow {
                    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                @media (prefers-reduced-motion: reduce) {
                    .restock-modal-confirm:hover .restock-modal-arrow {
                        transform: none;
                    }
                }

                .restock-modal-cancel {
                    background: transparent;
                    color: #94A3B8;
                    border: none;
                    padding: 0.7rem;
                    font-weight: 500;
                    font-size: 0.88rem;
                    cursor: pointer;
                    transition: color 0.18s ease;
                    letter-spacing: -0.005em;
                }
                .restock-modal-cancel:hover {
                    color: #475569; /* slate-600 — más oscuro on hover */
                }
                .restock-modal-cancel:focus-visible {
                    outline: 2px solid #4F46E5;
                    outline-offset: 2px;
                    border-radius: 6px;
                }

                @media (max-width: 768px) {
                    .dashboard-header {
                        padding: 1.25rem;
                        margin-bottom: 1.5rem;
                        border-radius: 1.25rem;
                        gap: 1rem;
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .header-text-group {
                        align-items: center;
                        text-align: center;
                    }
                    .dashboard-title {
                        font-size: 1.65rem;
                    }
                    .dashboard-subtitle {
                        font-size: 0.9rem;
                    }
                    .macros-card {
                        border-radius: 1.25rem;
                    }
                    .macros-card-header {
                        padding: 1.25rem 1.15rem 0.25rem 1.15rem;
                    }
                    .macros-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                    .macros-grid > div:not(:last-child) {
                        border-right: none;
                    }
                    .stat-item {
                        padding: 1.25rem 1.15rem;
                        gap: 0.85rem;
                        border-bottom: 1px solid rgba(226, 232, 240, 0.6);
                    }
                    .stat-item:nth-child(odd) {
                        border-right: 1px solid rgba(226, 232, 240, 0.6) !important;
                    }
                    .stat-item:nth-child(n+3) {
                        border-bottom: none !important;
                    }
                    .stat-item .stat-icon {
                        width: 40px !important;
                        height: 40px !important;
                        border-radius: 10px !important;
                    }
                    .stat-item .stat-icon svg {
                        width: 20px;
                        height: 20px;
                    }
                    .stat-item .stat-value {
                        font-size: 1.25rem !important;
                    }
                    .stat-item .stat-label {
                        font-size: 0.7rem !important;
                    }
                    .menu-section-header {
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        gap: 0.5rem;
                        margin-bottom: 0.5rem;
                        padding: 1.5rem 1rem 0.5rem 2.25rem;
                    }
                    .menu-section-title {
                        text-align: center;
                        width: 100%;
                    }
                    .option-buttons {
                        gap: 0.5rem;
                        padding: 0 1.5rem 1.25rem 2.5rem;
                        margin-bottom: 0;
                    }
                    .option-btn {
                        padding: 0.7rem 0.5rem;
                        font-size: 0.85rem;
                        border-radius: 0.6rem;
                    }
                    .meals-container::before {
                        left: 0.5rem;
                    }
                    .meal-card:not(:last-child)::after,
                    .skipped-lunch:not(:last-child)::after {
                        left: 0.5rem;
                        display: block;
                    }
                    .meal-card {
                        padding: 2rem 1.25rem 2rem 2.25rem;
                        border-radius: 0;
                        grid-template-columns: 1fr;
                        gap: 1rem;
                    }
                    .skipped-lunch {
                        padding: 2rem 1.25rem 2rem 2.25rem;
                    }
                    .meal-right-side {
                        flex-direction: row !important;
                        align-items: center !important;
                        justify-content: space-between;
                        width: 100%;
                        border-top: 1px solid #F1F5F9;
                        padding-top: 0.75rem;
                    }
                    .meal-right-side > div:first-child {
                        text-align: left !important;
                    }
                    .main-grid {
                        flex-direction: column;
                        gap: 1.5rem;
                    }
                    .actions-group {
                        width: 100%;
                        align-items: flex-start;
                    }
                    .new-plan-wrapper {
                        flex: 1.1;
                    }
                    .new-plan-btn {
                        width: 100%;
                        justify-content: center;
                        padding: 0.75rem 1.25rem;
                        font-size: 0.88rem;
                    }
                    .credits-badge {
                        flex: 1;
                    }
                }

                @media (max-width: 480px) {
                    .dashboard-header {
                        padding: 1rem;
                        margin-bottom: 1.25rem;
                        border-radius: 1rem;
                    }
                    .dashboard-title {
                        font-size: 1.45rem;
                    }
                    .stat-item {
                        padding: 0.85rem 0.7rem;
                    }
                    .meals-container::before {
                        left: 0.5rem;
                    }
                    .meal-card:not(:last-child)::after,
                    .skipped-lunch:not(:last-child)::after {
                        left: 0.5rem;
                    }
                    .menu-section-header {
                        padding: 1.25rem 1rem 0.5rem 1.75rem;
                    }
                    .option-buttons {
                        padding: 0.5rem 1.5rem 1.25rem 1.75rem;
                    }
                    .meal-card {
                        padding: 1.5rem 1rem 1.5rem 1.75rem;
                        border-radius: 0;
                    }
                    .skipped-lunch {
                        padding: 1.5rem 1rem 1.5rem 1.75rem;
                    }
                    .meal-right-side > div:last-child {
                        gap: 0.5rem !important;
                    }
                }
            `}</style>

            {/* --- HEADER PREMIUM --- */}
            <header className="dashboard-header">
                <div className="header-text-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

                    {/* PLAN TIER BADGE */}
                    <div style={{ marginBottom: '0.25rem' }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.65rem',
                            fontWeight: '800',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            background: isPremium ? 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' : '#F8FAFC',
                            color: isPremium ? '#B45309' : '#64748B',
                            border: `1.5px solid ${isPremium ? '#FCD34D' : '#CBD5E1'}`,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                        }}>
                            {isPremium ? (userProfile?.plan_tier === 'ultra' ? 'ULTRA' : userProfile?.plan_tier === 'basic' ? 'BÁSICO' : 'PLUS') : 'GRATUITO'}
                        </span>
                    </div>

                    <h1 className="dashboard-title">
                        Hola, <span style={{
                            background: 'linear-gradient(to right, #3B82F6, #8B5CF6)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>
                            {userProfile?.full_name?.split(' ')[0] || formData?.name || 'Nutrifit'}
                        </span>
                    </h1>
                    <p className="dashboard-subtitle">
                        Aquí tienes tu estrategia nutricional.
                    </p>
                </div>

                {/* --- ACTIONS GROUP --- */}
                <div className="actions-group">

                    {/* VISUALIZADOR DE CRÉDITOS */}
                    <div className="credits-badge" style={{
                        background: '#FFFFFF',
                        padding: '0.6rem 1rem',
                        borderRadius: '1rem',
                        border: '2px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.875rem',
                        boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.08)',
                    }}>
                        <div style={{
                            width: 36, height: 36,
                            background: isLimitReached ? '#FEF2F2' : '#EFF6FF',
                            color: isLimitReached ? '#EF4444' : '#3B82F6',
                            borderRadius: '0.75rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Zap size={18} fill={isLimitReached ? '#EF4444' : '#3B82F6'} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em', WebkitTextStroke: '0.5px #334155' }}>
                                Créditos
                            </span>
                            <div style={{
                                fontSize: '1rem',
                                fontWeight: 800,
                                color: 'var(--text-main)',
                                display: 'flex',
                                alignItems: 'center',
                                // [P3-CREDITS-INFINITY-CENTER · 2026-05-20] Centrar
                                // horizontalmente cuando es ilimitado (solo icono ∞).
                                // Para usuarios con plan (formato "5 / 50") mantener
                                // alineación natural a la izquierda.
                                justifyContent: remainingCredits === '∞' ? 'center' : 'flex-start',
                                gap: '3px',
                                whiteSpace: 'nowrap'
                            }}>
                                {remainingCredits === '∞'
                                    ? <InfinityIcon size={20} strokeWidth={2.5} style={{ color: 'var(--text-main)', marginRight: '4px' }} />
                                    : remainingCredits}
                                {userPlanLimit !== 'Ilimitado' && <span style={{ color: '#94A3B8', fontSize: '0.85rem', fontWeight: 600 }}>/ {userPlanLimit}</span>}
                            </div>
                        </div>
                    </div>

                    {/* REGENERACIÓN DE MENÚ Y EXPORTACIÓN */}
                    <div className="new-plan-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'stretch' }}>

                        {/* INDICADOR COMPACTO: Despensa + Personas (Híbrido) */}
                        <div ref={despensaDropdownRef} style={{ position: 'relative' }}>
                            {/* Compact Trigger Row */}
                            <div
                                onClick={() => setShowDespensaDropdown(!showDespensaDropdown)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    gap: '0.5rem',
                                    background: showDespensaDropdown
                                        ? 'linear-gradient(135deg, #F1F5F9 0%, #E8EDF3 100%)'
                                        : 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                                    padding: '0.45rem 0.75rem',
                                    borderRadius: '10px',
                                    border: `1.5px solid ${showDespensaDropdown ? '#94A3B8' : '#E2E8F0'}`,
                                    boxShadow: showDespensaDropdown
                                        ? '0 0 0 2px rgba(148, 163, 184, 0.1)'
                                        : '0 1px 3px rgba(0,0,0,0.04)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    userSelect: 'none',
                                    minHeight: '36px'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        {isRecalculating ? (
                                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: 'flex' }}>
                                                <Loader2 size={13} color="#059669" strokeWidth={2.5} />
                                            </motion.div>
                                        ) : (
                                            <Clock size={13} color="#059669" strokeWidth={2.5} />
                                        )}
                                        <span style={{ fontWeight: 700, color: '#334155' }}>
                                            {{ weekly: '7d', biweekly: '15d', monthly: '30d' }[groceryDuration] || '7d'}
                                        </span>
                                        <span style={{ color: '#94A3B8', fontWeight: 500 }}>
                                            {{ weekly: 'semanal', biweekly: 'quincenal', monthly: 'mensual' }[groceryDuration] || 'semanal'}
                                        </span>
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    {/* [P1-5] Chip compacto: avisa que el inventario en
                                        uso puede ser caché stale. Antes era un banner
                                        full-width entre los chips y la fila de botones
                                        (rompía la jerarquía visual). Ahora es un pin
                                        discreto al lado del badge "6d" con tooltip
                                        nativo (`title`) + `aria-label` para
                                        screen readers. `onClick stopPropagation`
                                        evita que el click abra el despensa dropdown.
                                        Se baja automáticamente cuando un fetch fresco
                                        (mount, focus, Realtime, PDF, Restock) confirma
                                        datos vivos. */}
                                    {inventoryStale && (
                                        <div
                                            role="status"
                                            aria-live="polite"
                                            aria-label="Tu Nevera puede estar desactualizada. Estamos usando datos en caché. Verifica antes de comprar para evitar duplicados."
                                            title="Tu Nevera puede estar desactualizada. Estamos usando datos en caché. Verifica antes de comprar para evitar duplicados."
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                background: '#FFFBEB',
                                                color: '#78350F',
                                                padding: '0.2rem 0.45rem',
                                                borderRadius: '6px',
                                                fontSize: '0.65rem',
                                                fontWeight: 800,
                                                border: '1px solid #FDE68A',
                                                display: 'flex', alignItems: 'center', gap: '0.25rem',
                                                whiteSpace: 'nowrap',
                                                cursor: 'help',
                                            }}
                                        >
                                            <AlertCircle size={11} color="#F59E0B" strokeWidth={2.5} />
                                            <span>caché</span>
                                        </div>
                                    )}
                                    {!isPlanExpired ? (
                                        <div style={{
                                            background: daysLeft <= 2 ? '#FEE2E2' : '#DBEAFE',
                                            color: daysLeft <= 2 ? '#DC2626' : '#2563EB',
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '6px',
                                            fontSize: '0.65rem',
                                            fontWeight: 800,
                                            display: 'flex', alignItems: 'center', gap: '0.2rem'
                                        }}>
                                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: daysLeft <= 2 ? '#DC2626' : '#2563EB' }} />
                                            {daysLeft}d
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: '#FEE2E2', color: '#DC2626',
                                            padding: '0.2rem 0.5rem', borderRadius: '6px',
                                            fontSize: '0.65rem', fontWeight: 800
                                        }}>
                                            Exp.
                                        </div>
                                    )}
                                    <motion.div animate={{ rotate: showDespensaDropdown ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                        <ChevronDown size={13} color="#94A3B8" strokeWidth={2.5} />
                                    </motion.div>
                                </div>
                            </div>

                            {/* Combined Popover */}
                            <AnimatePresence>
                                {showDespensaDropdown && (
                                    // [P3-DURATION-DROPDOWN-OPEN-FLUID · 2026-05-17]
                                    // Iteración 2: pre-fix tenía spring underdamped + scale +
                                    // backdropFilter blur(16px) sobre background rgba(0.97).
                                    // El doble destello sobreviviente tras quitar el spring era
                                    // causado por `backdrop-filter` recomponiendo el blur en
                                    // stages durante la transición + el background semi-translúcido
                                    // (bug conocido de blink/webkit: el filtro se "snapea" al
                                    // final del primer frame produciendo flash en los bordes).
                                    // Fix definitivo: fondo opaco + sin backdrop-filter + animación
                                    // SOLO de opacity (sin transform/scale) — opacity-only no puede
                                    // flickerar porque no requiere capa de composición nueva.
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15, ease: 'easeOut' }}
                                        style={{
                                            position: 'absolute', top: 'calc(100% + 6px)', left: '-4px', right: '-4px',
                                            zIndex: 9999,
                                            background: '#FFFFFF',
                                            borderRadius: '12px',
                                            border: '1.5px solid #CBD5E1',
                                            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.15)',
                                            overflow: 'hidden',
                                            padding: '6px'
                                        }}
                                    >
                                        {/* Despensa Section */}
                                        <div style={{ padding: '4px 8px 2px' }}>
                                            <span style={{ fontSize: '0.62rem', color: '#059669', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Clock size={10} /> Duración del Plan
                                            </span>
                                        </div>
                                        {[
                                            { value: 'weekly', label: '7 Días', sub: 'Semanal' },
                                            { value: 'biweekly', label: '15 Días', sub: 'Quincenal' },
                                            { value: 'monthly', label: '30 Días', sub: 'Mensual' }
                                        ].map((opt) => (
                                            <div
                                                key={opt.value}
                                                onClick={async () => {
                                                    updateData('groceryDuration', opt.value);
                                                    // [P1-FORM-9] Reemplaza spread `{...formData, groceryDuration}`.
                                                    safeUpdateHealthProfile({ groceryDuration: opt.value });
                                                    // [P3-DURATION-DROPDOWN-CLOSE-IMMEDIATE · 2026-05-17]
                                                    // Cerrar el dropdown INMEDIATAMENTE tras seleccionar, no esperar
                                                    // a que termine el recalc (~1-3s). El toast.loading('Calculando...')
                                                    // ya da feedback visible del trabajo en background.
                                                    setShowDespensaDropdown(false);
                                                    if (userProfile?.id && planData) {
                                                        setIsRecalculating(true);
                                                        const recalcToast = toast.loading('Calculando lista...', { position: 'top-center' });
                                                        try {
                                                            // [P0-B2] withRecalcLock garantiza release del lock en
                                                            // finally — antes el lock dependía de calls explícitos en
                                                            // happy + catch (riesgo de leak si una excepción caía entre
                                                            // medio o si el componente se desmontaba mid-flight).
                                                            await withRecalcLock(async () => {
                                                                // [P3-RECALC-503-CLASSIFICATION · 2026-05-16] Retry 1×
                                                                // tras 500ms si la respuesta es 5xx o el fetch falla
                                                                // (network error). Backend ya clasifica transient → 503
                                                                // (pool exhaustion, supabase RemoteProtocolError);
                                                                // determinístico → 500. Esta retry cubre el blip más
                                                                // común: free tier pgBouncer saturado por ~500ms.
                                                                // 4xx (401/400) NO se reintentan.
                                                                const recalcBody = JSON.stringify({ user_id: userProfile.id, plan_id: planData?.id, householdSize: formData?.householdSize || 1, groceryDuration: opt.value });
                                                                const attemptRecalc = async () => {
                                                                    try {
                                                                        const r = await fetchWithAuth(`${API_BASE}/api/plans/recalculate-shopping-list`, {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            // [P2-NEW-B · 2026-05-11] Enviar plan_id explícito
                                                                            // (cuando esté disponible en planData) para evitar
                                                                            // race con _chunk_worker creando un plan B en paralelo.
                                                                            body: recalcBody
                                                                        });
                                                                        return { res: r, networkError: null };
                                                                    } catch (e) {
                                                                        return { res: null, networkError: e };
                                                                    }
                                                                };
                                                                let { res: response, networkError } = await attemptRecalc();
                                                                const isTransient = networkError || (response && response.status >= 500);
                                                                if (isTransient) {
                                                                    await new Promise((r) => setTimeout(r, 500));
                                                                    ({ res: response, networkError } = await attemptRecalc());
                                                                }
                                                                if (networkError) throw networkError;
                                                                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                                                                const result = await response.json();
                                                                if (result.success && result.plan_data) {
                                                                    const rk = `mealfit_restock_cache_${userProfile?.id}_${result.plan_data.grocery_start_date || 'latest'}_${formData?.householdSize || 1}_${opt.value}`;
                                                                    if (result.plan_data.is_restocked == null && localStorage.getItem(rk)) result.plan_data.is_restocked = true;
                                                                    localStorage.setItem('mealfit_plan', JSON.stringify(result.plan_data));
                                                                    setPlanData(result.plan_data);
                                                                    toast.success('Lista actualizada', { id: recalcToast });
                                                                    // [P2-AUDIT-NEW-1 · 2026-05-12] Consumir
                                                                    // `_coherence_warnings` post-recalc (silencio
                                                                    // si endpoint legacy o sin drift).
                                                                    emitCoherenceToast(toast, result._coherence_warnings);
                                                                } else toast.dismiss(recalcToast);
                                                            });
                                                        } catch {
                                                            toast.dismiss(recalcToast);
                                                        } finally {
                                                            setIsRecalculating(false);
                                                        }
                                                    }
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '0.4rem 0.6rem', borderRadius: '7px', cursor: 'pointer',
                                                    background: groceryDuration === opt.value ? 'linear-gradient(135deg, #F0FDF4, #DCFCE7)' : 'transparent',
                                                    border: groceryDuration === opt.value ? '1px solid #BBF7D0' : '1px solid transparent',
                                                    transition: 'all 0.15s ease', margin: '1px 0'
                                                }}
                                                onMouseEnter={e => { if (groceryDuration !== opt.value) e.currentTarget.style.background = '#F8FAFC'; }}
                                                onMouseLeave={e => { if (groceryDuration !== opt.value) e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: groceryDuration === opt.value ? '#059669' : '#334155' }}>{opt.label}</span>
                                                    <span style={{ fontSize: '0.6rem', color: '#94A3B8' }}>{opt.sub}</span>
                                                </div>
                                                {groceryDuration === opt.value && <CheckCircle size={13} color="#059669" strokeWidth={2.5} />}
                                            </div>
                                        ))}

                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>


                        {/* BOTONES LADO A LADO */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', width: '100%' }}>
                            {(() => {
                                return (
                                    <button
                                        onClick={async () => {
                                            if (isPlanExpired) {
                                                navigate('/assessment');
                                                return;
                                            }
                                            // [P3-UPDATE-PLATOS-REQUIRES-PANTRY · 2026-05-17]
                                            // Gate antes del credit check: si la Nevera no tiene
                                            // mínimo de alimentos, abrir el modal sería un dead-end
                                            // (regeneración no tiene ingredientes con qué trabajar).
                                            // Toast informativo + CTA hacia /pantry para que el
                                            // usuario llene la Nevera y vuelva.
                                            if (isPantryTooEmpty) {
                                                const msg = pantryItemCount === 0
                                                    ? `Tu Nevera está vacía. Añade al menos ${PANTRY_MIN_ITEMS_FOR_UPDATE} alimentos para actualizar platos.`
                                                    : `Tu Nevera tiene ${pantryItemCount} alimento${pantryItemCount === 1 ? '' : 's'}. Necesitas mínimo ${PANTRY_MIN_ITEMS_FOR_UPDATE} para actualizar platos.`;
                                                toast.info(msg, {
                                                    duration: 5000,
                                                    action: {
                                                        label: 'Ir a Nevera',
                                                        onClick: () => navigate('/pantry'),
                                                    },
                                                });
                                                return;
                                            }
                                            const hasCredits = await validateCreditsAsync();
                                            if (!hasCredits) return;
                                            setShowUpdatePlanModal(true);
                                        }}
                                        className="new-plan-btn"
                                        aria-disabled={isLimitReached || isPantryTooEmpty}
                                        title={isPantryTooEmpty ? `Llena tu Nevera (mínimo ${PANTRY_MIN_ITEMS_FOR_UPDATE} alimentos) para actualizar platos` : undefined}
                                        style={{
                                            background: (isLimitReached || isPantryTooEmpty)
                                                ? '#E2E8F0'
                                                : isPlanExpired
                                                    ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                                                    : 'linear-gradient(135deg, #0F172A 0%, #334155 100%)',
                                            color: (isLimitReached || isPantryTooEmpty) ? '#94A3B8' : 'white',
                                            cursor: (isLimitReached || isPantryTooEmpty) ? 'not-allowed' : 'pointer',
                                            '--hover-shadow': isPlanExpired
                                                ? '0 20px 40px -5px rgba(239, 68, 68, 0.5), inset 0 0 0 1px rgba(255,255,255,0.1)'
                                                : '0 20px 40px -5px rgba(15, 23, 42, 0.45), inset 0 0 0 1px rgba(255,255,255,0.1)',
                                            '--active-shadow': isPlanExpired
                                                ? '0 5px 15px -5px rgba(239, 68, 68, 0.2)'
                                                : '0 5px 15px -5px rgba(15, 23, 42, 0.2)',
                                            boxShadow: (isLimitReached || isPantryTooEmpty) ? 'none' : isPlanExpired
                                                ? '0 10px 20px -5px rgba(239, 68, 68, 0.4)'
                                                : '0 10px 20px -5px rgba(15, 23, 42, 0.35)',
                                            flex: '1 1 auto',
                                            width: 'auto',
                                            justifyContent: 'center',
                                            padding: '0.75rem 0.75rem',
                                            border: 'none',
                                            borderRadius: '1rem',
                                            fontWeight: '700',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        {isLimitReached
                                            ? <AlertCircle size={18} />
                                            : isPlanExpired
                                                ? <RefreshCw size={18} />
                                                : isPantryTooEmpty
                                                    ? <Lock size={18} />
                                                    : <Wand2 size={18} />}
                                        <span style={{ fontSize: '0.85rem' }}>
                                            {isLimitReached
                                                ? 'Límite'
                                                : isPlanExpired
                                                    ? 'Evaluar de Nuevo'
                                                    : isPantryTooEmpty
                                                        ? 'Llena tu Nevera'
                                                        : 'Actualizar platos'}
                                        </span>
                                    </button>
                                );
                            })()}

                            {/* [P3-RESTOCK-BTN-NO-FLASH · 2026-05-18] Solo renderizar
                              * cuando hayPendingShoppingItems es DEFINITIVAMENTE true
                              * (no mientras isLoadingInventory). Antes el botón mostraba
                              * "Calculando..." durante el mount fetch de inventario, lo
                              * que producía un flash de ~200ms cada vez que el usuario
                              * navegaba a Plan (el useEffect de fetch reaccionaba a
                              * planData changes). Ahora el botón aparece "limpio"
                              * solo cuando se sabe que hay items por comprar — el delay
                              * inicial del fetch queda absorbido como "no mostrar nada"
                              * en vez de "mostrar estado falso de carga". */}
                            {hasPendingShoppingItems && (
                                /* [P3-RESTOCK-MINIMAL-CTA · 2026-05-20] Rediseño del
                                   botón "Ya compré todo": de gradient verde saturado
                                   con sombra colorida a outline minimalista con dot
                                   verde pulsante. Trade-off: pierde "loud premium"
                                   look, gana coherencia con paleta web (--text-main
                                   #0F172A, slate borders) y se distingue del 95% de
                                   UIs verdes saturadas. La semántica positiva la
                                   carga el dot emerald-500 lateral (pulse animation
                                   indica "acción disponible"). Hover oscurece borde
                                   a slate-900 + dot ring más visible. */
                                <button
                                    onClick={() => setShowRestockModal(true)}
                                    className="restock-cta-minimal"
                                    style={{
                                        background: '#FFFFFF',
                                        color: '#0F172A',
                                        cursor: 'pointer',
                                        border: '1px solid #E2E8F0',
                                        flex: '1 1 auto',
                                        width: 'auto',
                                        justifyContent: 'center',
                                        padding: '0.7rem 1rem',
                                        borderRadius: '0.85rem',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.55rem',
                                        whiteSpace: 'nowrap',
                                        fontSize: '0.85rem',
                                        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                                        transition: 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
                                    }}
                                >
                                    {/* Dot pulsante emerald — semántica "ready to act" */}
                                    <span className="restock-cta-dot" aria-hidden="true" />
                                    <span>Ya compré todo</span>
                                </button>
                            )}

                            <button
                                onClick={handleDownloadShoppingList}
                                disabled={isRecalculating}
                                className="new-plan-btn"
                                style={{
                                    background: isRecalculating ? '#E2E8F0' : 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                                    color: isRecalculating ? '#94A3B8' : '#334155',
                                    border: isRecalculating ? '1.5px solid #CBD5E1' : '1.5px solid #CBD5E1',
                                    '--hover-shadow': isRecalculating ? 'none' : '0 15px 30px -5px rgba(0, 0, 0, 0.1), inset 0 0 0 1.5px #CBD5E1',
                                    '--active-shadow': isRecalculating ? 'none' : '0 5px 15px -5px rgba(0, 0, 0, 0.05), inset 0 0 0 1.5px #CBD5E1',
                                    boxShadow: isRecalculating ? 'none' : '0 2px 4px rgba(0,0,0,0.04)',
                                    cursor: isRecalculating ? 'wait' : 'pointer',
                                    flex: '1 1 auto',
                                    width: 'auto',
                                    justifyContent: 'center',
                                    padding: '0.75rem 0.75rem',
                                    borderRadius: '1rem',
                                    fontWeight: '700',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                <ShoppingCart size={18} />
                                <span style={{ fontSize: '0.85rem' }}>PDF</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>


            {/* --- BANNER: PLAN EXPIRADO --- */}
            {isPlanExpired && planData?.generation_status !== 'partial' && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
                        border: '1.5px solid #FECACA',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        marginBottom: '1.5rem',
                        boxShadow: '0 4px 12px -2px rgba(220,38,38,0.12)',
                        flexWrap: 'wrap'
                    }}
                >
                    <AlertCircle size={22} color="#DC2626" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <span style={{ fontWeight: 700, color: '#991B1B', fontSize: '0.95rem', display: 'block', marginBottom: '0.15rem' }}>
                            ¡Tu ciclo ha terminado!
                        </span>
                        <span style={{ color: '#B91C1C', fontSize: '0.85rem' }}>
                            Ya han pasado los días programados en tu plan actual. Genera uno nuevo para seguir recibiendo deliciosas recomendaciones y listas de compras frescas.
                        </span>
                    </div>
                    <button
                        onClick={() => navigate('/assessment')}
                        style={{
                            background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                            color: 'white',
                            border: 'none',
                            padding: '0.6rem 1.2rem',
                            borderRadius: '0.75rem',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            boxShadow: '0 4px 10px rgba(239, 68, 68, 0.3)',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <Wand2 size={16} />
                        Generar Nuevo Plan
                    </button>
                </motion.div>
            )}

            {/* --- BANNER: GENERACIÓN EN BACKGROUND (Semanas 2-4) --- */}
            {/* Banner de Chunking Background eliminado para alinearse con la experiencia visual "silenciosa" */}

            {/* [P1-LOW-SIGNAL-FALLBACK · 2026-05-21] Banner cuando la IA agotó los
                3 intentos sin lograr un plan que aprobara el revisor. El plan se
                entrega igual (mejor versión disponible) pero el usuario debe
                saber que el sistema "se rindió" y que puede usar Cambiar Plato
                para iterar manualmente. Flag viene de `plan_data._quality_degraded`
                seteado en `should_retry` cuando `attempt >= MAX_ATTEMPTS=3`. */}
            {planData?._quality_degraded && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                        border: '1.5px solid #FCD34D',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        marginBottom: '1.5rem',
                        boxShadow: '0 4px 12px -2px rgba(217,119,6,0.15)',
                        flexWrap: 'wrap'
                    }}
                    role="status"
                    aria-live="polite"
                >
                    <AlertCircle size={22} color="#D97706" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <span style={{ fontWeight: 700, color: '#92400E', fontSize: '0.95rem', display: 'block', marginBottom: '0.15rem' }}>
                            La IA no logró un plan óptimo tras {planData?._quality_degraded_attempts || 3} intentos
                        </span>
                        <span style={{ color: '#B45309', fontSize: '0.85rem' }}>
                            Te entregamos la mejor versión que produjo. Si alguna comida no te cuadra, usa <strong>Cambiar Plato</strong> para reemplazarla individualmente o regenera el plan completo.
                        </span>
                    </div>
                </motion.div>
            )}

            {/* --- DAILY TRACKER UI (incluye objetivo + progreso fusionados) --- */}
            <TrackingProgress
                planData={planData}
                userId={userProfile?.id || formData?.session_id || 'guest'}
            />

            {/* [P3-WATER-TRACKER · 2026-05-16] En mobile el WaterTracker
                vive ENCIMA del menu de comidas (UX: la hidratacion es accion
                diaria de alto valor; en pantalla pequeña la columna derecha
                stackea al final, dejando el tracker debajo del bottom-tab).
                En desktop sigue en la columna derecha (ver mas abajo).
                Render condicional por viewport para evitar doble fetch.
                NO gateado por `isPlanExpired`: la hidratacion es independiente
                del ciclo de plan — un usuario sin plan activo igual debe poder
                rastrear vasos. El propio componente se auto-oculta si el
                usuario apago el toggle en Preferencias. */}
            {isMobileViewport && <WaterTracker />}

            {/* --- MAIN CONTENT COLUMNS --- */}
            <div className="main-grid">

                {/* Left Column: MEALS TIMELINE */}
                <div className="meals-container" style={{ flex: 2, alignSelf: 'start' }}>
                    <div className="menu-section-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h2 className="menu-section-title">
                                Tu Menú
                            </h2>
                        </div>
                        <span className="menu-section-count">
                            {/* Número de comidas oculto según petición */}
                        </span>
                    </div>

                    {/* Indicador de generación → skeleton tab(s) inline en la fila de días (más abajo) */}

                    {/* [P0-DASH-CHIP-HONESTY-V2 · 2026-05-09] Banner contextual
                        cuando la queue tiene chunks pausados sin nada in-flight.
                        Reemplaza el slot fantasma "Lunes · nevera vacía" que
                        antes se renderizaba en la fila de días. UX: el día
                        futuro NO debe aparecer (aún no llegó), pero el usuario
                        SÍ debe enterarse de que el sistema espera acción. Copy
                        derivado del primer paused_chunk.reason_code (matchea
                        plans.py:3580 reason_to_text). */}
                    {(() => {
                        const _csi = chunkStatusInfo;
                        const _puac = (_csi && typeof _csi.pending_user_action_count === 'number')
                            ? _csi.pending_user_action_count : 0;
                        const _inFlight = (_csi && typeof _csi.in_flight_count === 'number')
                            ? _csi.in_flight_count : 0;
                        if (!(_puac > 0 && _inFlight === 0)) return null;
                        const _pc = (_csi && Array.isArray(_csi.paused_chunks) && _csi.paused_chunks.length > 0)
                            ? _csi.paused_chunks[0] : null;
                        if (!_pc) return null;

                        // [P0-DASH-CHIP-HONESTY-V3 · 2026-05-09] Mismo
                        // temporal_gate UX que aplica al slot del día.
                        // Si el usuario aún está consumiendo días del
                        // chunk actual (daysSinceCreation < generated),
                        // NO mostrar el banner — la pausa del próximo
                        // bloque no es urgente todavía. Reduce ansiedad
                        // anticipada. SSOT con la lógica del slot.
                        const _planDaysLen = Array.isArray(planData?.days) ? planData.days.length : 0;
                        if (
                            typeof daysSinceCreation === 'number'
                            && Number.isFinite(daysSinceCreation)
                            && _planDaysLen > 0
                            && daysSinceCreation < _planDaysLen
                        ) {
                            return null;
                        }

                        const _reasonCopy = {
                            empty_pantry: { title: 'Tu próximo bloque está pausado', body: 'Tu nevera está vacía. Añade ingredientes para que generemos los próximos días.', cta: 'Actualizar nevera', url: '/inventory' },
                            empty_pantry_proactive: { title: 'Tu próximo bloque está pausado', body: 'Tu nevera está vacía. Añade ingredientes para que generemos los próximos días.', cta: 'Actualizar nevera', url: '/inventory' },
                            stale_snapshot: { title: 'Validando tu inventario', body: 'Estamos refrescando tu nevera. El plan continuará en breve.', cta: null, url: null },
                            stale_snapshot_live_unreachable: { title: 'Actualiza tu nevera para continuar', body: 'No pudimos validar tu inventario en vivo. Abre la nevera para refrescar.', cta: 'Abrir nevera', url: '/inventory' },
                            learning_zero_logs: { title: 'Registra tus comidas para continuar', body: 'Necesitamos saber qué comiste para generar el siguiente bloque.', cta: 'Ir al diario', url: '/diary' },
                            tz_unresolved: { title: 'Confirmando tu zona horaria', body: 'Aún no pudimos resolver tu zona horaria para programar el siguiente bloque.', cta: null, url: null },
                            missing_prior_lessons: { title: 'Reconstruyendo el aprendizaje', body: 'El sistema intenta recuperar el aprendizaje del bloque previo.', cta: null, url: null },
                            persistent_drift: { title: 'Validando tu inventario', body: 'Detectamos diferencias persistentes con tu inventario. Refrescando…', cta: 'Abrir nevera', url: '/inventory' },
                        };
                        const _copy = _reasonCopy[_pc.reason_code] || {
                            title: 'Tu próximo bloque está pausado',
                            body: 'El sistema espera tu acción para continuar.',
                            cta: null, url: null,
                        };
                        return (
                            <div role="status" style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: '12px', padding: '12px 16px', marginBottom: '16px',
                                background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px',
                                color: '#92400E', fontSize: '0.875rem',
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>{_copy.title}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#B45309' }}>{_copy.body}</div>
                                </div>
                                {_copy.cta && _copy.url && (
                                    <button
                                        onClick={() => navigate(_copy.url)}
                                        style={{
                                            padding: '8px 14px', background: '#F59E0B', color: 'white',
                                            border: 'none', borderRadius: '8px', fontWeight: 600,
                                            fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {_copy.cta}
                                    </button>
                                )}
                            </div>
                        );
                    })()}

                    {/* [P2-δ] Botón explícito "Refrescar próximos días" cuando el usuario está
                        en día 5+ del bloque y los siguientes chunks NO se están generando. El
                        useEffect de shift-plan ya corre silenciosamente, pero un control visible
                        evita que el usuario sienta que el plan "se queda atrás" cuando el cron
                        background no ha disparado todavía. La acción es idempotente: si el plan
                        está al día, /shift-plan responde sin hacer cambios. */}
                    {!isPlanExpired
                        && daysSinceCreation >= 5
                        && planData?.generation_status !== 'partial'
                        && planData?.generation_status !== 'generating_next'
                        && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 14px', background: '#F0FDF4', borderRadius: '10px', marginBottom: '16px', color: '#15803D', fontSize: '0.85rem', border: '1px solid #BBF7D0' }}>
                            <span>¿Quieres adelantar la próxima actualización?</span>
                            <button
                                onClick={async () => {
                                    if (!userProfile?.id) return;
                                    const tId = toast.loading('Refrescando próximos días…', { position: 'top-center' });
                                    try {
                                        const res = await fetchWithAuth(`${API_BASE}/api/plans/shift-plan`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                user_id: userProfile.id,
                                                tzOffset: new Date().getTimezoneOffset(),
                                            }),
                                        });
                                        if (res.ok) {
                                            const data = await res.json();
                                            if (data?.plan_data) setPlanData(data.plan_data);
                                            toast.success('Plan actualizado', { id: tId });
                                        } else {
                                            toast.error('No se pudo refrescar', { id: tId });
                                        }
                                    } catch (e) {
                                        console.error('[P2-δ] shift-plan manual:', e);
                                        toast.error('Error al refrescar', { id: tId });
                                    }
                                }}
                                style={{
                                    padding: '6px 12px',
                                    background: '#15803D',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                }}
                            >
                                Refrescar
                            </button>
                        </div>
                    )}

                    {/* [P3-2] Banner sutil si alguna semana fue regenerada en modo simplificado.
                        Backend persiste planData._user_forced_simplified_weeks: {week_number: iso_ts}
                        cuando el usuario aceptó el CTA "regenerar simplificado" tras un dead_letter.
                        El indicador es informativo — no bloquea ni afecta la nav. */}
                    {planData?._user_forced_simplified_weeks && Object.keys(planData._user_forced_simplified_weeks).length > 0 && (
                        <div style={{
                            background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                            border: '1px solid #F59E0B',
                            borderRadius: '12px',
                            padding: '10px 14px',
                            marginBottom: '12px',
                            fontSize: '0.85rem',
                            color: '#92400E',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}>
                            <span style={{ fontSize: '1.1rem' }}>ℹ️</span>
                            <span>
                                Algunos días de tu plan fueron regenerados en modo simplificado por tu solicitud.
                                Las recetas son más sencillas y flexibles con los ingredientes disponibles.
                            </span>
                        </div>
                    )}

                    {/* BOTONES NAVEGACIÓN DÍAS (AGRUPADOS POR SEMANA) — Rolling Window */}
                    {visiblePlanDays.length >= 1 && (
                        <div className="days-navigation-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            {Array.from({ length: Math.ceil(visiblePlanDays.length / 7) }).map((_, weekIdx) => {
                                const weekDays = visiblePlanDays.slice(weekIdx * 7, (weekIdx + 1) * 7);
                                return (
                                    <div key={`week-${weekIdx}`} className="week-group">
                                        {visiblePlanDays.length > 7 && (
                                            <h4 style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Semana {weekIdx + 1}
                                            </h4>
                                        )}
                                        <div 
                                            className="option-buttons"
                                            style={{ 
                                                display: 'flex', 
                                                overflowX: 'auto', 
                                                gap: '10px', 
                                                paddingBottom: '16px', // Espacio incrementado para separar los botones de la línea punteada
                                                WebkitOverflowScrolling: 'touch',
                                                scrollbarWidth: 'none', /* Firefox */
                                                msOverflowStyle: 'none' /* IE/Edge */
                                            }}
                                        >
                                            <style>{`.option-buttons::-webkit-scrollbar { display: none; }`}</style>
                                            {weekDays.map((day, localIdx) => {
                                                // globalIdx is absolute index in original planData.days
                                                const visibleIdx = weekIdx * 7 + localIdx;
                                                const globalIdx = visibleStartIndex + visibleIdx;
                                                // [GAP 7] Dias generados por Smart Shuffle en modo degradado
                                                const isDegraded = !!day?._is_degraded_shuffle;
                                                const isEmergencyRepeat = !!day?._is_emergency_repeat;
                                                const isActive = activeDayIndex === globalIdx;
                                                // Marcar el d\u00eda de hoy y d\u00edas pasados
                                                const isToday = globalIdx === todayPlanDayIndex;
                                                const isPastDay = globalIdx < todayPlanDayIndex;
                                                return (
                                                    <button
                                                        key={globalIdx}
                                                        onClick={() => setActiveDayIndex(globalIdx)}
                                                        className="option-btn"
                                                        title={
                                                            isPastDay ? 'Este día ya pasó'
                                                            : isEmergencyRepeat ? 'Día de respaldo (repetido porque no hubo variedad disponible)'
                                                            : isDegraded ? 'Día de respaldo generado desde tu perfil favorito'
                                                            : isToday ? 'Hoy'
                                                            : undefined
                                                        }
                                                        style={{
                                                            flexShrink: 0,
                                                            minWidth: 'fit-content',
                                                            justifyContent: 'center',
                                                            whiteSpace: 'nowrap',
                                                            padding: '8px 16px',
                                                            borderRadius: '8px',
                                                            fontWeight: isToday ? '700' : '500',
                                                            fontSize: '0.9rem',
                                                            transition: 'all 0.2s',
                                                            border: isActive ? 'none'
                                                                : isPastDay ? '1px solid #E2E8F0'
                                                                : isDegraded ? '1px dashed #F59E0B'
                                                                : '1px solid #CBD5E1',
                                                            background: isActive
                                                                ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)'
                                                                : isPastDay ? '#F1F5F9' : 'white',
                                                            color: isActive ? 'white'
                                                                : isPastDay ? '#94A3B8'
                                                                : isDegraded ? '#B45309' : '#475569',
                                                            boxShadow: isActive ? '0 10px 15px -3px rgba(59, 130, 246, 0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
                                                            transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
                                                            opacity: isPastDay && !isActive ? 0.55 : 1,
                                                            textDecoration: isPastDay && !isActive ? 'line-through' : 'none',
                                                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                                        }}
                                                    >
                                                        {(() => {
                                                            // [P3-DAY-LABEL-FROM-PLAN · 2026-05-17] Usar
                                                            // `day.day_name` que el backend inyecta en
                                                            // graph_orchestrator.py:7278 (computado desde
                                                            // grocery_start_date + day_index, TZ-aware).
                                                            // Sin esto, las labels se computaban desde
                                                            // `new Date() + visibleIdx` (calendario) y el
                                                            // dot "Hoy" desde `todayPlanDayIndex` (índice
                                                            // del plan) → mismatch cuando el plan empieza
                                                            // en un día distinto a hoy. Bug observable
                                                            // 2026-05-17: localStorage con plan de ayer
                                                            // (Sábado start) + hoy Domingo → labels decían
                                                            // "Domingo/Lunes/Martes" pero meals eran de
                                                            // "Sábado/Domingo/Lunes" y dot caía en "Lunes"
                                                            // (porque ESO era el slot de hoy en el plan).
                                                            //
                                                            // Ahora label = day.day_name → tabs siempre
                                                            // alineados con meals; el dot cae en el mismo
                                                            // tab donde está el contenido de hoy.
                                                            //
                                                            // Fallback al cálculo viejo si day_name ausente
                                                            // (planes legacy pre-backend-inject que aún
                                                            // están en localStorage).
                                                            if (day?.day_name) return day.day_name;
                                                            const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                                                            const d = new Date();
                                                            d.setDate(d.getDate() + visibleIdx);
                                                            return diasSemana[d.getDay()];
                                                        })()}
                                                        {isToday && !isActive && (
                                                            <span style={{
                                                                width: 6, height: 6, borderRadius: '50%',
                                                                background: '#3B82F6', display: 'inline-block',
                                                            }} />
                                                        )}
                                                        {isDegraded && (
                                                            <span style={{
                                                                fontSize: '0.65rem',
                                                                fontWeight: 700,
                                                                padding: '1px 6px',
                                                                borderRadius: '6px',
                                                                background: isActive ? 'rgba(255,255,255,0.25)' : '#FEF3C7',
                                                                color: isActive ? 'white' : '#92400E',
                                                                letterSpacing: '0.02em',
                                                            }}>
                                                                {isEmergencyRepeat ? 'REPETIDO' : 'RESPALDO'}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                            
                                            {/* [P0-DASH-MISSING-DAY-SLOT · 2026-05-09] Skeleton tab(s) para
                                                días que faltan dentro de la ventana visible. Antes solo se
                                                mostraban si `generation_status === 'generating_next'`, pero
                                                hay 2 escenarios MUCHO más comunes donde plan_data.days está
                                                corto vs total_days_requested:
                                                  (a) chunk siguiente en `pending_user_action` (dead-lettered
                                                      esperando regeneración manual del usuario) — el banner
                                                      P1-CHUNKS-1 ya alerta arriba pero los slots de día se
                                                      caían silenciosamente.
                                                  (b) initial generation con generation_status='complete' del
                                                      primer chunk pero chunks restantes pendientes/dead-letter.
                                                Ambos casos resultaban en ventana colapsada (e.g., solo Sábado
                                                visible cuando Domingo es el día 2 del plan pero su chunk no
                                                se mergeo a plan_data.days). El nuevo predicate dispara el
                                                skeleton también cuando `total_days_requested > planDays.length`
                                                o `_user_action_required` está set. */}
                                            {(() => {
                                                if (weekIdx !== 0) return null;
                                                // [P3-DASH-WINDOW-FROM-TODAY · 2026-05-18] Skeleton se calcula
                                                // contra `_MAX_WINDOW` (4) en vez del antiguo `_WINDOW_SIZE` (3).
                                                // El skeleton solo aparece cuando hay días "futuros" en el plan
                                                // que aún no se generaron — NO cuando la ventana se achicó
                                                // legítimamente al final del chunk vivo. La condición de
                                                // `total_days_requested > planDays.length` (3 líneas abajo en
                                                // `_isGenerating`) garantiza que el skeleton no se dispare por
                                                // colapso natural (e.g., miércoles último día del chunk 1
                                                // mostrando solo [Mi]).
                                                const _missingSlots = _MAX_WINDOW - visiblePlanDays.length;
                                                if (_missingSlots <= 0) return null;
                                                const _genStatus = planData?.generation_status;
                                                const _isGenerating = _genStatus === 'generating_next'
                                                    || _genStatus === 'generating'
                                                    || _genStatus === 'partial';
                                                const _hasActionReq = !!planData?._user_action_required;
                                                // [P0-DASH-CHIP-HONESTY · 2026-05-09] Tooltip-anchor:
                                                // P0-DASH-CHIP-HONESTY-FE | test_p0_dash_chip_honesty
                                                //
                                                // Reconciliación con la queue real: plan_data.
                                                // generation_status='generating_next' puede
                                                // coexistir con TODOS los chunks pausados
                                                // (pending_user_action por empty_pantry, snapshot
                                                // stale, etc). El chip "en camino" mentía cuando
                                                // realmente nada estaba corriendo — el usuario
                                                // veía spinner para días pausados y no se enteraba
                                                // de que tenía que actualizar la nevera.
                                                //
                                                // Reglas (prioridad descendente):
                                                //   1. dead-letter / _user_action_required → chip
                                                //      "Acción" (ya cubierto). Mismo nivel que
                                                //      pending_user_action_count > 0 cuando NO
                                                //      hay nada in-flight.
                                                //   2. pending_user_action_count > 0 Y in_flight=0
                                                //      → "Pausado: <reason>". Reason resuelto
                                                //      del primer paused_chunk con reason válido.
                                                //   3. _isGenerating Y in_flight > 0 → "en camino"
                                                //      (el caso histórico, ahora honesto).
                                                //   4. _isGenerating pero in_flight=0 y nada
                                                //      pausado → fallback "en camino" (estado
                                                //      transitorio entre chunks; no esperar a
                                                //      tener queue counters para mostrar algo).
                                                const _csi = chunkStatusInfo;
                                                const _puac = (_csi && typeof _csi.pending_user_action_count === 'number')
                                                    ? _csi.pending_user_action_count : 0;
                                                const _inFlight = (_csi && typeof _csi.in_flight_count === 'number')
                                                    ? _csi.in_flight_count : 0;
                                                const _failedQ = (_csi && typeof _csi.failed_count === 'number')
                                                    ? _csi.failed_count : 0;
                                                const _isPausedFromQueue = (_puac > 0 && _inFlight === 0);

                                                // [P0-DASH-MISSING-DAY-SLOT-V4 · 2026-05-09] Regla
                                                // "el siguiente chunk se crea SOLO cuando termina
                                                // el actual" (rolling refill). Implicación visual:
                                                // los slots de skeleton solo se renderizan si hay
                                                // automatización en curso o acción explícita
                                                // requerida — NO para llenar la ventana hasta
                                                // total_days_requested cuando el plan está
                                                // 'complete'.
                                                if (!_isGenerating && !_hasActionReq) return null;

                                                // [P0-DASH-CHIP-HONESTY-V3 · 2026-05-09] Tooltip-anchor:
                                                // P0-DASH-CHIP-HONESTY-V3 | test_p0_dash_chip_honesty
                                                //
                                                // **temporal_gate UX-side**: NO renderizar slots de
                                                // días futuros hasta que el último día del chunk
                                                // actual haya llegado en TZ del usuario. Regla
                                                // operacional fundamental del producto: el rolling
                                                // refill solo trabaja en chunks cuyos días previos
                                                // ya concluyeron. Mostrar "Lunes · en camino"
                                                // cuando aún es Sábado (Domingo no ha terminado)
                                                // miente sobre lo que el sistema realmente está
                                                // haciendo — los chunks pueden estar técnicamente
                                                // `in_flight`, pero el `temporal_gate` los va a
                                                // diferir hasta que el día previo concluya.
                                                // Honestidad UX: si el usuario aún consume días
                                                // del chunk actual, el siguiente bloque NO debe
                                                // aparecer en pantalla.
                                                //
                                                // Algoritmo: usamos `daysSinceCreation` (offset
                                                // del día activo en el rolling window, calculado
                                                // arriba en línea ~541 desde grocery_start_date —
                                                // SSOT del resto del Dashboard para los índices
                                                // de día). Si `daysSinceCreation < visiblePlanDays.length`
                                                // → hoy es uno de los días generados → ocultar
                                                // slot. La igualdad NO se incluye porque
                                                // daysSinceCreation == length significa que ya
                                                // pasamos del último día generado (siguiente bloque).
                                                //
                                                // Fallback: si daysSinceCreation no es finito o
                                                // visiblePlanDays está vacío, preserva V4.
                                                if (
                                                    typeof daysSinceCreation === 'number'
                                                    && Number.isFinite(daysSinceCreation)
                                                    && visiblePlanDays
                                                    && visiblePlanDays.length > 0
                                                    && daysSinceCreation < visiblePlanDays.length
                                                ) {
                                                    return null;
                                                }

                                                // [P0-DASH-CHIP-HONESTY-V2 · 2026-05-09] Si el
                                                // chunk actual ya terminó pero la queue dice
                                                // "pausado y nada in_flight", el slot no se
                                                // renderiza tampoco — la pausa se comunica vía
                                                // el banner contextual arriba del menú.
                                                if (_isPausedFromQueue) return null;

                                                const _diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                                                // [P0-DASH-CHIP-HONESTY · 2026-05-09] 3 estados
                                                // visuales (antes 2):
                                                //   - "en camino" (gris shimmer + spinner): plan
                                                //     activo Y queue tiene in_flight > 0. Honesto:
                                                //     algo está corriendo de verdad.
                                                //   - "pausado: <reason>" (ámbar punteado): la
                                                //     queue tiene pending_user_action y nada
                                                //     in-flight. El usuario debe actuar (nevera,
                                                //     diario, etc). Banner detalle según reason.
                                                //   - "acción requerida" (ámbar más fuerte):
                                                //     _user_action_required del plan_data
                                                //     (escalación dead-letter). Banner P1-CHUNKS-1
                                                //     arriba detalla.
                                                const _isPending = _hasActionReq && !_isGenerating;
                                                // Reason resuelto del primer paused_chunk: el
                                                // backend ya devuelve reason_code canónico
                                                // (empty_pantry, stale_snapshot, learning_zero_logs,
                                                // tz_unresolved, missing_prior_lessons,
                                                // empty_pantry_proactive, _unknown).
                                                const _firstPausedReason = (_isPausedFromQueue && _csi
                                                    && Array.isArray(_csi.paused_chunks)
                                                    && _csi.paused_chunks.length > 0
                                                    && typeof _csi.paused_chunks[0].reason_code === 'string')
                                                    ? _csi.paused_chunks[0].reason_code
                                                    : null;
                                                // Map reason_code → copy del chip (corto). Para
                                                // detalle completo el banner /blocked_reasons
                                                // (cuando se monte) usará el dict reason_to_text.
                                                const _PAUSED_LABELS = {
                                                    empty_pantry: 'nevera vacía',
                                                    empty_pantry_proactive: 'nevera vacía',
                                                    stale_snapshot: 'inventario',
                                                    stale_snapshot_live_unreachable: 'inventario',
                                                    learning_zero_logs: 'sin registros',
                                                    tz_unresolved: 'zona horaria',
                                                    missing_prior_lessons: 'aprendizaje',
                                                    missing_start_date_no_anchor: 'fecha inicio',
                                                    pantry_violation_post_merge: 'cantidades',
                                                    synthesis_ratio_exceeded: 'síntesis',
                                                };
                                                const _pausedShortLabel = _firstPausedReason
                                                    ? (_PAUSED_LABELS[_firstPausedReason] || 'pausado')
                                                    : 'pausado';
                                                return Array.from({ length: _missingSlots }).map((_, sIdx) => {
                                                    const _slotVisibleIdx = visiblePlanDays.length + sIdx;
                                                    const _d = new Date();
                                                    _d.setDate(_d.getDate() + _slotVisibleIdx);
                                                    const _dayName = _diasSemana[_d.getDay()];

                                                    let _suffix; let _ariaSuffix; let _titleText;
                                                    let _border; let _background; let _backgroundSize;
                                                    let _animation; let _color; let _showSpinner;
                                                    if (_isPending) {
                                                        _suffix = '· acción';
                                                        _ariaSuffix = 'requiere acción';
                                                        _titleText = 'Este día está dead-letteado. Revisa el banner "Acción requerida" arriba para regenerar.';
                                                        _border = '1px dashed #F59E0B';
                                                        _background = '#FFFBEB';
                                                        _backgroundSize = 'auto';
                                                        _animation = 'none';
                                                        _color = '#B45309';
                                                        _showSpinner = false;
                                                    } else if (_isPausedFromQueue) {
                                                        // [P0-DASH-CHIP-HONESTY · 2026-05-09]
                                                        // Queue tiene pending_user_action y NADA
                                                        // in-flight. NO mentir con shimmer; usar
                                                        // ámbar punteado estático con reason corto.
                                                        // Detalle vía /blocked_reasons (banner
                                                        // arriba o tooltip).
                                                        _suffix = `· ${_pausedShortLabel}`;
                                                        _ariaSuffix = `pausado, ${_pausedShortLabel}`;
                                                        _titleText = `Este día está pausado (${_pausedShortLabel}). El sistema espera tu acción para continuar.`;
                                                        _border = '1px dashed #F59E0B';
                                                        _background = '#FFFBEB';
                                                        _backgroundSize = 'auto';
                                                        _animation = 'none';
                                                        _color = '#B45309';
                                                        _showSpinner = false;
                                                    } else {
                                                        // _isGenerating con queue in_flight > 0
                                                        // (o sin info de queue todavía — fallback
                                                        // honesto durante la primera carga).
                                                        _suffix = '· en camino';
                                                        _ariaSuffix = 'en camino';
                                                        _titleText = 'Este día se está generando en background.';
                                                        _border = '1px dashed #CBD5E1';
                                                        _background = 'linear-gradient(90deg, #F1F5F9 0%, #E2E8F0 50%, #F1F5F9 100%)';
                                                        _backgroundSize = '200% 100%';
                                                        _animation = 'skeleton-shimmer 1.4s ease-in-out infinite';
                                                        _color = '#94A3B8';
                                                        _showSpinner = true;
                                                    }

                                                    return (
                                                        <div
                                                            key={`skeleton-${sIdx}`}
                                                            role="status"
                                                            aria-label={`${_dayName}: ${_ariaSuffix}`}
                                                            title={_titleText}
                                                            style={{
                                                                flexShrink: 0,
                                                                minWidth: '88px',
                                                                padding: '8px 16px',
                                                                borderRadius: '8px',
                                                                border: _border,
                                                                background: _background,
                                                                backgroundSize: _backgroundSize,
                                                                animation: _animation,
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '6px',
                                                                color: _color,
                                                                fontSize: '0.8rem',
                                                                fontWeight: 500,
                                                                cursor: 'default',
                                                            }}
                                                        >
                                                            {_showSpinner && (
                                                                <Loader2 size={12} strokeWidth={2.5} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                                            )}
                                                            <span>{_dayName}</span>
                                                            <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>
                                                                {_suffix}
                                                            </span>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                            <style>{`
                                                @keyframes skeleton-shimmer {
                                                    0% { background-position: 200% 0; }
                                                    100% { background-position: -200% 0; }
                                                }
                                            `}</style>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {(() => {
                            // Copia segura de platos usando el día activo (filtrar suplementos que tienen su propia sección)
                            const displayMeals = [...currentDayMeals].filter(m => !m.meal?.toLowerCase().includes('suplemento'));

                            if (displayMeals.length === 0) {
                                return (
                                    <EmptyState
                                        icon={Utensils}
                                        title="No hay comidas para este día"
                                        description="Cuando tu plan esté listo, verás aquí el menú del día seleccionado."
                                        cta={{
                                            label: 'Generar nuevo plan',
                                            onClick: () => navigate('/assessment'),
                                        }}
                                    />
                                );
                            }

                            return displayMeals.map((meal, index) => {
                                const isLiked = meal.name ? !!likedMeals[meal.name] : false;

                                return (
                                    <div key={index} className="meal-card">

                                        {/* Meal Info */}
                                        <div>
                                            <div style={{
                                                textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 800,
                                                color: 'var(--primary)', letterSpacing: '0.05em', marginBottom: '0.25rem'
                                            }}>
                                                {meal.meal}
                                            </div>

                                            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                                                {meal.name}
                                            </h3>

                                            {/* PANTRY UNSAFE BADGE */}
                                            {meal._pantry_unsafe_after_flexible && (
                                                <div style={{
                                                    display: 'flex', flexDirection: 'column', gap: '0.25rem',
                                                    fontSize: '0.75rem', color: '#EF4444', background: 'rgba(239, 68, 68, 0.1)',
                                                    padding: '0.4rem 0.6rem', borderRadius: '0.5rem', marginBottom: '0.5rem',
                                                    fontWeight: 600, border: '1px solid rgba(239, 68, 68, 0.2)'
                                                }}>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                        <AlertCircle size={14} />
                                                        <span>⚠ Compra Urgente Requerida</span>
                                                    </div>
                                                    {meal._missing_ingredients && Array.isArray(meal._missing_ingredients) && meal._missing_ingredients.length > 0 && (
                                                        <div style={{ paddingLeft: '1.2rem', color: '#B91C1C', fontSize: '0.7rem' }}>
                                                            Faltan: {meal._missing_ingredients.join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* TIEMPO DE PREPARACIÓN */}
                                            {meal.prep_time && (
                                                <div style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                    fontSize: '0.75rem', color: '#2563EB', background: '#EFF6FF',
                                                    padding: '4px 10px', borderRadius: '6px', marginBottom: '0.75rem', fontWeight: 700,
                                                    border: '1px solid #BFDBFE', boxShadow: '0 1px 2px rgba(37,99,235,0.05)'
                                                }}>
                                                    <Clock size={13} strokeWidth={2.5} /> {meal.prep_time}
                                                </div>
                                            )}

                                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                                                {meal.desc}
                                            </p>
                                        </div>

                                        {/* Right Side: Calories + Buttons */}
                                        <div className="meal-right-side" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1rem' }}>

                                            {/* Calories Badge */}
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                    {meal.cals}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '4px' }}>kcal</div>
                                            </div>

                                            {/* BUTTONS GROUP */}
                                            <div style={{ display: 'flex', gap: '0.75rem' }}>

                                                {/* VER RECETA */}
                                                <button
                                                    onClick={() => navigate('/dashboard/recipes')}
                                                    style={{
                                                        background: '#EFF6FF',
                                                        border: '1.5px solid #BFDBFE',
                                                        borderRadius: '50%',
                                                        width: 44, height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    title="Ver paso a paso"
                                                >
                                                    <BookOpen size={20} color="#3B82F6" />
                                                </button>

                                                {/* REGENERATE BUTTON (AI SWAP) — Abre modal de razón */}
                                                <button
                                                    onClick={async () => {
                                                        if (regeneratingId === index) return;
                                                        const hasCredits = await validateCreditsAsync();
                                                        if (!hasCredits) return;
                                                        // Abrir el micro-prompt modal en vez de ejecutar directamente
                                                        setSwapModal({ dayIndex: activeDayIndex, mealIndex: index, mealType: meal.meal, mealName: meal.name });
                                                    }}
                                                    disabled={regeneratingId === index}
                                                    style={{
                                                        background: '#FFF7ED',
                                                        border: '1.5px solid #FED7AA',
                                                        borderRadius: '1rem',
                                                        padding: '0 0.85rem',
                                                        height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                                        cursor: regeneratingId === index ? 'wait' : 'pointer',
                                                        transition: 'all 0.2s',
                                                        opacity: 1,
                                                        fontWeight: 650,
                                                        fontSize: '0.8rem',
                                                        color: "#EA580C"
                                                    }}
                                                    title="Cambiar con IA"
                                                >
                                                    <RefreshCw
                                                        size={18}
                                                        color="#EA580C"
                                                        className={regeneratingId === index ? "spin-fast" : ""}
                                                    />
                                                    <span style={{ whiteSpace: 'nowrap' }}>Cambiar Plato</span>
                                                </button>

                                                {/* LIKE BUTTON */}
                                                <button
                                                    onClick={() => {
                                                        const currentlyLiked = !!likedMeals[meal.name];
                                                        toggleMealLike(meal.name, meal.meal);
                                                        if (!currentlyLiked) {
                                                            toast.success('¡Anotado!', { description: `Aprenderemos que te gusta: ${meal.name}`, icon: '❤️' });
                                                        } else {
                                                            toast('Like removido');
                                                        }
                                                    }}
                                                    style={{
                                                        background: isLiked ? '#FEE2E2' : '#FDF2F8',
                                                        border: isLiked ? '1.5px solid #FECACA' : '1.5px solid #FBCFE8',
                                                        borderRadius: '50%',
                                                        width: 44, height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        boxShadow: isLiked ? '0 2px 5px rgba(239, 68, 68, 0.2)' : 'none'
                                                    }}
                                                    title="Me gusta"
                                                >
                                                    <Heart size={20} color={isLiked ? '#EF4444' : '#EC4899'} fill={isLiked ? '#EF4444' : 'none'} />
                                                </button>
                                            </div>
                                        </div>

                                        <style>{`
                                            .spin-fast { animation: spin 1s linear infinite; }
                                            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                                        `}</style>
                                    </div>
                                );
                            })
                        })()}


                    </div>

                    {/* SUPPLEMENTS SECTION */}
                    {currentDaySupplements.length > 0 && (
                        <div style={{
                            marginTop: '1.5rem',
                            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(168, 85, 247, 0.08) 100%)',
                            borderRadius: '1.5rem',
                            border: '1px solid rgba(139, 92, 246, 0.15)',
                            padding: '1.5rem',
                            boxShadow: '0 4px 15px -5px rgba(139, 92, 246, 0.1)'
                        }}>
                            <h3 style={{
                                fontSize: '1rem', fontWeight: 800, color: '#6D28D9',
                                marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}>
                                <div style={{
                                    background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
                                    color: 'white', borderRadius: '10px',
                                    width: 32, height: 32,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Pill size={16} />
                                </div>
                                Suplementos del Día
                                <span style={{
                                    marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600,
                                    background: '#EDE9FE', color: '#7C3AED',
                                    padding: '0.2rem 0.6rem', borderRadius: '9999px'
                                }}>
                                    {currentDaySupplements.length}
                                </span>
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {currentDaySupplements.map((supp, i) => (
                                    <div key={i} style={{
                                        background: 'white',
                                        borderRadius: '1rem',
                                        padding: '1rem 1.25rem',
                                        border: '1px solid rgba(139, 92, 246, 0.1)',
                                        display: 'flex', flexDirection: 'column', gap: '0.35rem'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.95rem' }}>
                                                💊 {supp.name}
                                            </span>
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 700,
                                                background: '#F5F3FF', color: '#7C3AED',
                                                padding: '0.15rem 0.5rem', borderRadius: '6px'
                                            }}>
                                                {supp.timing}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                            Dosis: {supp.dose}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748B', lineHeight: 1.4 }}>
                                            {supp.reason}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: INSIGHTS & INGREDIENTS */}
                <div style={{ flex: 1, minWidth: 0, width: '100%' }}>

                    {/* [P3-WATER-TRACKER · 2026-05-16] Tracker de hidratacion
                        diaria (8 vasos, reset a medianoche local). Reemplazo
                        del card "Mi Nevera" anterior — la pagina Pantry ya
                        cubre el inventario fisico, mantener ambas confundia
                        al usuario. La gestion de "agotados" (disabledIngredients)
                        sigue activa via Pantry y se aplica al render del
                        shopping list / PDF.

                        En mobile (≤768px) el tracker se renderiza ENCIMA del
                        menu (ver bloque arriba del .main-grid); aqui solo
                        rendera en desktop para mantener una sola instancia.
                        NO gateado por `isPlanExpired` — la hidratacion es
                        independiente del plan. El componente se auto-oculta
                        via toggle en Preferencias. */}
                    {!isMobileViewport && <WaterTracker />}

                    {/* Insights Card */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.5) 100%)',
                        backdropFilter: 'blur(12px)',
                        padding: '1.75rem',
                        borderRadius: '2rem',
                        border: '1.5px solid rgba(203, 213, 225, 0.8)',
                        marginBottom: '2rem',
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08), 0 0 0 1px rgba(148, 163, 184, 0.05)'
                    }}>
                        <h3 style={{
                            fontSize: '1.2rem', fontWeight: 800, color: '#0F172A',
                            marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem'
                        }}>
                            <div style={{ background: '#F0F9FF', padding: '0.4rem', borderRadius: '0.75rem', color: '#0284C7' }}>
                                <Brain size={22} strokeWidth={2.5} />
                            </div>
                            Razonamiento
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {(!planData.insights || planData.insights.length === 0) ? (
                                <EmptyState
                                    icon={Brain}
                                    title="Aún no hay razonamiento"
                                    description="Cuando tu plan esté listo, encontrarás aquí el diagnóstico, el plan de acción y los tips del chef."
                                    compact
                                />
                            ) : planData.insights.map((insight, i) => {
                                let icon = <CheckCircle size={20} />;
                                let title = "Nota:";
                                let color = "#0F172A";
                                let bgColor = "#F1F5F9";

                                if (insight.toLowerCase().includes('diagnóstico') || i === 0) {
                                    icon = <Lightbulb size={20} />;
                                    title = "Diagnóstico";
                                    color = "#7C3AED"; // Violet
                                    bgColor = "#F5F3FF";
                                }
                                if (insight.toLowerCase().includes('estrategia') || i === 1) {
                                    icon = <Wallet size={20} />;
                                    title = "Plan de Acción";
                                    color = "#059669"; // Emerald
                                    bgColor = "#ECFDF5";
                                }
                                if (insight.toLowerCase().includes('chef') || i === 2) {
                                    icon = <Flame size={20} />;
                                    title = "Tip del Chef";
                                    color = "#EA580C"; // Orange
                                    bgColor = "#NFF2F7";
                                }

                                const cleanText = insight.includes(':') ? insight.split(':')[1].trim() : insight;

                                return (
                                    <div key={i} style={{
                                        display: 'flex', gap: '1rem',
                                        paddingBottom: i < planData.insights.length - 1 ? '1.25rem' : '0',
                                        borderBottom: i < planData.insights.length - 1 ? '1px solid #F1F5F9' : 'none'
                                    }}>
                                        <div style={{
                                            color: color, background: bgColor,
                                            minWidth: '42px', height: '42px',
                                            borderRadius: '12px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            {icon}
                                        </div>
                                        <div>
                                            <h4 style={{
                                                margin: '0 0 0.35rem 0',
                                                fontSize: '0.9rem', fontWeight: 700,
                                                color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em'
                                            }}>
                                                {title}
                                            </h4>
                                            <p style={{ margin: 0, fontSize: '0.95rem', color: '#64748B', lineHeight: 1.6 }}>
                                                {cleanText}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>



                </div>
            </div>

            {/* MODAL DE ONBOARDING WEB PUSH (Alertas Inteligentes) */}
            <AnimatePresence>
                {showPushOnboarding && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.7)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 99999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '1rem'
                    }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                background: '#FFFFFF',
                                borderRadius: '24px',
                                padding: '2.5rem 2rem',
                                width: '100%', maxWidth: '420px',
                                position: 'relative',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                textAlign: 'center',
                                overflow: 'hidden'
                            }}
                        >
                            {/* Decorative background circle */}
                            <div style={{
                                position: 'absolute', top: '-50px', left: '50%', transform: 'translateX(-50%)',
                                width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, rgba(255,255,255,0) 70%)',
                                borderRadius: '50%', zIndex: 0
                            }}></div>

                            <div style={{
                                width: '64px', height: '64px', borderRadius: '20px',
                                background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 1.5rem auto', position: 'relative', zIndex: 1,
                                boxShadow: '0 8px 16px rgba(99, 102, 241, 0.3)'
                            }}>
                                <Brain size={32} color="#FFFFFF" strokeWidth={2} />
                            </div>

                            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.75rem', position: 'relative', zIndex: 1 }}>
                                Activa tu Nutricionista IA
                            </h2>
                            <p style={{ color: '#64748B', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
                                Déjame mandarte un aviso a tu celular a la hora de comer para que nunca olvides tu rutina y alcances tus metas más rápido.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', zIndex: 1 }}>
                                <button
                                    onClick={handleEnablePush}
                                    disabled={isPushEnabling}
                                    style={{
                                        background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                                        color: '#FFFFFF', border: 'none',
                                        padding: '1rem', borderRadius: '1rem',
                                        fontWeight: 700, fontSize: '1rem',
                                        cursor: isPushEnabling ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
                                        opacity: isPushEnabling ? 0.7 : 1,
                                        transform: isPushEnabling ? 'scale(0.98)' : 'scale(1)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {isPushEnabling ? (
                                        <><Loader2 size={20} className="spin-animation" /> Activando...</>
                                    ) : (
                                        <>¡Sí, encender alertas!</>
                                    )}
                                </button>

                                <button
                                    onClick={handleDismissPushOnboarding}
                                    disabled={isPushEnabling}
                                    style={{
                                        background: 'transparent', color: '#94A3B8', border: 'none',
                                        padding: '0.75rem', borderRadius: '1rem',
                                        fontWeight: 600, fontSize: '0.9rem',
                                        cursor: 'pointer',
                                        transition: 'color 0.2s'
                                    }}
                                >
                                    Quizá más tarde
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* --- MODAL CONFIRMACIÓN ONE-CLICK RESTOCK --- */}
            <AnimatePresence>
                {showRestockModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                        zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', padding: '1rem'
                    }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                background: '#FFFFFF', borderRadius: '1.5rem', padding: '2rem',
                                width: '100%', maxWidth: '400px', textAlign: 'center',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                overflow: 'hidden', position: 'relative'
                            }}
                        >
                            <AnimatePresence mode="wait">
                                {!isRestocking ? (
                                    /* === ESTADO: CONFIRMACIÓN — [P3-RESTOCK-MINIMAL-CTA · 2026-05-20]
                                       Rediseño minimalista: icon outline-only (sin BG colorido pesado),
                                       título sin signos interrogativos, copy directo, botón principal
                                       slate-900 con flecha que se desliza en hover (microinteracción),
                                       cancelar como link text en lugar de botón con padding. */
                                    <motion.div
                                        key="confirm"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        {/* Icon outline sin background — flotante, minimal.
                                            Ring slate-200 alrededor en lugar del cuadro verde
                                            saturado. Dot emerald pequeño tipo "status" en la
                                            esquina inferior derecha — preserva semántica
                                            "ready/success" del verde sin saturar. */}
                                        <div style={{
                                            position: 'relative',
                                            width: '56px', height: '56px',
                                            borderRadius: '16px',
                                            border: '1.5px solid #E2E8F0',
                                            background: '#FFFFFF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            margin: '0 auto 1.5rem auto',
                                            boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)'
                                        }}>
                                            <ShoppingCart size={24} color="#0F172A" strokeWidth={1.75} />
                                            {/* Status dot — emerald punto pequeño, lateral */}
                                            <span style={{
                                                position: 'absolute',
                                                bottom: '-3px', right: '-3px',
                                                width: '14px', height: '14px',
                                                borderRadius: '50%',
                                                background: '#10B981',
                                                border: '2.5px solid #FFFFFF',
                                                boxShadow: '0 1px 2px rgba(16, 185, 129, 0.4)'
                                            }} aria-hidden="true" />
                                        </div>

                                        <h2 style={{
                                            fontSize: '1.35rem', fontWeight: 700, color: '#0F172A',
                                            marginBottom: '0.5rem', letterSpacing: '-0.015em'
                                        }}>
                                            Confirmar compra
                                        </h2>
                                        <p style={{
                                            color: '#64748B', fontSize: '0.92rem', lineHeight: '1.55',
                                            marginBottom: isShoppingListStale ? '1.25rem' : '1.75rem',
                                            maxWidth: '320px', margin: isShoppingListStale ? '0 auto 1.25rem' : '0 auto 1.75rem',
                                        }}>
                                            Agregaremos todos los ingredientes de tu lista a la Nevera Virtual.
                                        </p>

                                        {isShoppingListStale && (
                                            <div style={{
                                                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                                                padding: '0.6rem 0.8rem', marginBottom: '1.25rem',
                                                background: '#FFFBEB', border: '1px solid #FCD34D',
                                                borderRadius: '0.75rem', textAlign: 'left'
                                            }}>
                                                <AlertCircle size={14} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                                                <span style={{ fontSize: '0.78rem', color: '#92400E', lineHeight: 1.45 }}>
                                                    La lista puede estar desactualizada. Si cambiaste el ciclo, recalcula antes de comprar.
                                                </span>
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                            {/* CTA principal: slate-900 solid, flecha que se desliza
                                                hacia la derecha en hover. Microinteracción que
                                                comunica "vamos a hacerlo". */}
                                            <button
                                                onClick={handleRestock}
                                                disabled={isRestocking}
                                                className="restock-modal-confirm"
                                            >
                                                <span>Añadir a mi Nevera</span>
                                                <ArrowRight size={17} strokeWidth={2.25} className="restock-modal-arrow" />
                                            </button>

                                            {/* Cancelar como link text — no compite visualmente
                                                con el CTA principal. */}
                                            <button
                                                onClick={() => setShowRestockModal(false)}
                                                className="restock-modal-cancel"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    /* === ESTADO: PROCESANDO (Animación Premium) === */
                                    <motion.div
                                        key="loading"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.3 }}
                                        style={{ padding: '0.5rem 0' }}
                                    >
                                        {/* Halo + icono animado */}
                                        <div style={{ position: 'relative', margin: '0 auto 1.5rem auto', width: '84px', height: '84px' }}>
                                            {/* Halo difuso pulsante */}
                                            <motion.div
                                                animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.15, 0.45] }}
                                                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                                                style={{
                                                    position: 'absolute', inset: '-8px',
                                                    borderRadius: '50%',
                                                    background: 'radial-gradient(circle, rgba(16,185,129,0.45) 0%, rgba(16,185,129,0) 70%)',
                                                    filter: 'blur(8px)',
                                                    pointerEvents: 'none'
                                                }}
                                            />
                                            <motion.div
                                                animate={{ rotate: 360 }}
                                                transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
                                                style={{
                                                    position: 'absolute', inset: 0,
                                                    borderRadius: '50%',
                                                    border: '3px solid transparent',
                                                    borderTopColor: '#10B981',
                                                    borderRightColor: 'rgba(16,185,129,0.55)',
                                                }}
                                            />
                                            <motion.div
                                                animate={{ rotate: -360 }}
                                                transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
                                                style={{
                                                    position: 'absolute', inset: '7px',
                                                    borderRadius: '50%',
                                                    border: '2px solid transparent',
                                                    borderBottomColor: '#059669',
                                                    borderLeftColor: 'rgba(5,150,105,0.45)',
                                                }}
                                            />
                                            <div style={{
                                                position: 'absolute', inset: '15px',
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 12px -2px rgba(16,185,129,0.35)'
                                            }}>
                                                <motion.div
                                                    animate={{ scale: [1, 1.12, 1] }}
                                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                                                >
                                                    <ShoppingCart size={24} color="#059669" strokeWidth={2.5} />
                                                </motion.div>
                                            </div>
                                        </div>

                                        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.4rem', letterSpacing: '-0.01em' }}>
                                            Registrando compras
                                        </h2>
                                        <p style={{ color: '#64748B', fontSize: '0.88rem', lineHeight: '1.45', marginBottom: '0' }}>
                                            Estamos organizando tus ingredientes en la Nevera
                                        </p>
                                        {/* [P3-RESTOCK-NO-BAR · 2026-05-20] Barra de progreso, indicador
                                          * % y los 3 pasos REMOVIDOS por decisión de producto del user:
                                          * "no quiero que tenga una barra de carga ya que lo veo
                                          * innecesario". El flow post-P3-RESTOCK-FLOW-SPEED toma
                                          * ~500-1100ms perceptibles — la barra "premium" añadía ruido
                                          * visual sin valor informativo en un flow tan corto. El
                                          * spinner circular del header + título + descripción ya dan
                                          * feedback "estamos trabajando". Tooltip-anchor: P3-RESTOCK-NO-BAR. */}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ═══════════ MODAL: ¿Por qué quieres cambiar? ═══════════ */}
            <OptionPickerModal
                isOpen={!!swapModal}
                onClose={() => setSwapModal(null)}
                title="¿Por qué quieres cambiar?"
                subtitle={
                    swapModal && (
                        <>
                            <p style={{ margin: '0 0 1.15rem 0' }}>
                                Tu respuesta nos ayuda a mejorar tus futuros planes.
                            </p>
                            <div style={{
                                background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '0.85rem',
                                padding: '0.65rem 0.9rem', marginBottom: '1rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}>
                                <RefreshCw size={15} color="#EA580C" />
                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#9A3412' }}>
                                    {swapModal.mealName}
                                </span>
                            </div>
                        </>
                    )
                }
                options={(() => {
                    const todayDow = new Date().getDay(); // 0=Dom, 6=Sáb
                    const isWeekend = todayDow === 0 || todayDow === 6;
                    const daysUntilSat = 6 - todayDow;
                    const weekendOpt = isWeekend
                        ? { id: 'weekend', icon: Zap, label: 'Fin de semana especial', color: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE', desc: 'Platos más elaborados y premium (Sáb-Dom)' }
                        : { id: 'weekend', icon: Zap, label: 'Fin de semana especial', color: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE', desc: 'Platos más elaborados y premium (Sáb-Dom)', disabled: true, disabledDesc: `Disponible en ${daysUntilSat} ${daysUntilSat === 1 ? 'día' : 'días'} (sábado)` };
                    return [
                        { id: 'variety',      icon: Shuffle,      label: 'Quiero variedad',        color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', desc: 'Me gusta, pero quiero algo diferente' },
                        { id: 'time',         icon: Clock,        label: 'No tengo tiempo hoy',    color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', desc: 'Busco algo más rápido de preparar' },
                        { id: 'budget',       icon: Wallet,       label: 'Opciones económicas',    color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', desc: 'Ingredientes de bajo costo' },
                        { id: 'cravings',     icon: Heart,        label: 'Tengo un antojo',        color: '#EC4899', bg: '#FDF2F8', border: '#FBCFE8', desc: 'Un capricho que encaja en tu plan' },
                        weekendOpt,
                        { id: 'similar',      icon: Copy,         label: 'Ya comí algo similar',   color: '#F97316', bg: '#FFF7ED', border: '#FED7AA', desc: 'Hoy ya tuve un plato parecido' },
                        { id: 'dislike',      icon: ThumbsDown,   label: 'No me gusta este plato', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', desc: 'La IA evitará sugerirlo en el futuro' }
                    ];
                })()}
                onOptionClick={async (optionId) => {
                    if (!swapModal) return;
                    const { dayIndex, mealIndex, mealType, mealName } = swapModal;
                    setSwapModal(null);

                    // Dislike requiere confirmación explícita antes de ejecutar el bloqueo permanente
                    if (optionId === 'dislike') {
                        setSwapDislikeConfirm({ dayIndex, mealIndex, mealType, mealName });
                        return;
                    }

                    // Estado de carga
                    setRegeneratingId(mealIndex);
                    const toastId = toast.loading('🔄 Consultando al Chef IA...', { description: 'Buscando una alternativa deliciosa...' });

                    try {
                        const newName = await regenerateSingleMeal(
                            dayIndex, mealIndex, mealType, mealName,
                            optionId, // ← swap_reason
                            liveInventory // ← [P0-1] para detectar ingredientes nuevos post-restock
                        );

                        trackEvent('plan_regeneration_triggered', {
                            reason: optionId,
                            source: 'dashboard',
                            is_expired: isPlanExpired,
                            has_pantry: liveInventory && liveInventory.length > 0,
                            type: 'single_meal'
                        });

                        toast.dismiss(toastId);
                        toast.success('¡Menú Actualizado!', {
                            description: `Cambiado por: ${newName}`,
                            icon: '👨‍🍳'
                        });
                    } catch (error) {
                        console.error('Error al regenerar:', error);
                        toast.dismiss(toastId);
                        toast.error('No se pudo conectar con la IA', {
                            description: 'Se usó una receta alternativa local.'
                        });
                    } finally {
                        setRegeneratingId(null);
                    }
                }}
                infoBandRenderer={(hoveredOption) => (
                    <div style={{ marginTop: '1.25rem', padding: '0.85rem', background: '#F8FAFC', borderRadius: '0.8rem', border: '1px solid #E2E8F0', fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0, color: '#64748B' }} />
                        <div>
                            {hoveredOption === 'dislike' ? (
                                <><strong>Se evitará:</strong> {swapModal?.mealName}.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~4s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}. ⚠️ Este plato se excluirá permanentemente de futuros planes.</span></>
                            ) : hoveredOption ? (
                                <><strong>Regenerando:</strong> 1 plato ({swapModal?.mealType || 'Comida'}).<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~4s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : (
                                isPremium ? (
                                    <>Plan <strong>Premium</strong>: Regeneraciones ilimitadas activas.</>
                                ) : (
                                    <>Te quedan <strong>{typeof userPlanLimit === 'number' ? Math.max(0, userPlanLimit - planCount) : 'ilimitadas'}</strong> regeneraciones este mes.</>
                                )
                            )}
                        </div>
                    </div>
                )}
            />

            {/* ═══════════ MODAL: ¿Por qué quieres actualizar los platos de hoy? ═══════════ */}
            <OptionPickerModal
                isOpen={showUpdatePlanModal}
                onClose={() => setShowUpdatePlanModal(false)}
                title={isPlanExpired ? "Nuevo Ciclo de Compras" : "¿Por qué quieres actualizar?"}
                subtitle={isPlanExpired
                    ? "Ciclo de compras cerrado. ¿Qué priorizamos esta semana?"
                    : "Ayuda al sistema a entender qué platos prefieres."
                }
                options={(() => {
                    const todayDow = new Date().getDay(); // 0=Dom, 6=Sáb
                    const isWeekend = todayDow === 0 || todayDow === 6;
                    const weekendOption = isWeekend
                        ? { id: 'weekend', icon: Zap, label: 'Fin de semana especial', color: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE', desc: 'Platos más elaborados y premium (Sáb-Dom)' }
                        : { id: 'weekend', icon: Zap, label: 'Fin de semana especial', color: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE', desc: 'Platos más elaborados y premium (Sáb-Dom)', disabled: true, disabledDesc: (() => { const d = 6 - todayDow; return `Disponible en ${d} ${d === 1 ? 'día' : 'días'} (sábado)`; })() };
                    return isPlanExpired ? [
                        { id: 'variety',  icon: Shuffle,    label: 'Quiero variedad',       color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', desc: 'Me apetecen platos distintos esta semana' },
                        { id: 'time',     icon: Clock,      label: 'Semana ocupada',       color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', desc: 'Busco preparaciones más rápidas' },
                        { id: 'budget',   icon: Wallet,     label: 'Opciones económicas',   color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', desc: 'Priorizar ingredientes de bajo costo' },
                        { id: 'cravings', icon: Heart,      label: 'Tengo un antojo',       color: '#EC4899', bg: '#FDF2F8', border: '#FBCFE8', desc: 'Un capricho que encaja en tu plan semanal' },
                        weekendOption,
                        { id: 'similar',  icon: Copy,       label: 'Se parece al ciclo anterior', color: '#F97316', bg: '#FFF7ED', border: '#FED7AA', desc: 'Evitar sugerencias muy parecidas a la semana pasada' },
                        { id: 'dislike',  icon: ThumbsDown, label: 'No me gustó el ciclo anterior', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', desc: 'Evitar ingredientes y estilos similares en el futuro' }
                    ] : [
                        { id: 'variety',  icon: Shuffle,    label: 'Quiero más variedad',       color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', desc: 'Me apetecen platos distintos hoy' },
                        { id: 'time',     icon: Clock,      label: 'No tengo tiempo hoy',       color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', desc: 'Busco algo más rápido de preparar' },
                        { id: 'budget',   icon: Wallet,     label: 'Opciones más económicas',   color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', desc: 'Ingredientes de bajo costo' },
                        { id: 'cravings', icon: Heart,      label: 'Tengo un antojo distinto',  color: '#EC4899', bg: '#FDF2F8', border: '#FBCFE8', desc: 'Un capricho que encaja en tu plan' },
                        weekendOption,
                        { id: 'dislike',  icon: ThumbsDown, label: 'No me gustan estos platos', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', desc: 'Evitar sugerencias similares en el futuro' }
                    ];
                })()}
                isNavigatingOption={isNavigatingOption}
                onOptionClick={async (optionId) => {
                    if (isLimitReached || isNavigatingOption) return;
                    if (optionId === 'dislike') {
                        setShowUpdatePlanModal(false);
                        setShowDislikeConfirmModal(true);
                        return;
                    }
                    setIsNavigatingOption(optionId);

                    const toastId = toast.loading(
                        isPlanExpired ? 'Preparando nuevo ciclo...' : 'Actualizando platos...',
                        { description: 'Analizando opciones con IA...' }
                    );

                    try {
                        await handleNewPlan(optionId, toastId, 'dashboard_refresh');
                        setShowUpdatePlanModal(false);
                    } finally {
                        setIsNavigatingOption(null);
                    }
                }}
                infoBandRenderer={(hoveredOption) => (
                    <div style={{ marginTop: '1.25rem', padding: '0.85rem', background: '#F8FAFC', borderRadius: '0.8rem', border: '1px solid #E2E8F0', fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', minHeight: '56px' }}>
                        <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0, color: '#64748B' }} />
                        <div>
                            {hoveredOption === 'dislike' ? (
                                <><strong>Se evitarán:</strong> {currentDayMeals.length > 0 ? currentDayMeals.map(m => m.name).join(', ') : 'los platos actuales'}.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : hoveredOption === 'variety' ? (
                                <><strong>Variedad:</strong> platos de diferentes cocinas y perfiles de sabor.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : hoveredOption === 'time' ? (
                                <><strong>Rapidez:</strong> platos con ≤20 min de preparación aproximada.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : hoveredOption === 'budget' ? (
                                <><strong>Económico:</strong> ingredientes accesibles sin salir de tus macros.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : hoveredOption === 'cravings' ? (
                                <><strong>Antojo:</strong> opciones más indulgentes dentro de tus objetivos.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : hoveredOption === 'weekend' ? (
                                <><strong>Fin de semana:</strong> platos más elaborados y experiencias premium.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : hoveredOption ? (
                                <><strong>Regenerando:</strong> el menú completo del ciclo actual.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : (
                                isPremium ? (
                                    <>Plan <strong>Premium</strong>: Regeneraciones ilimitadas activas.</>
                                ) : (
                                    <>Te quedan <strong>{typeof userPlanLimit === 'number' ? Math.max(0, userPlanLimit - planCount) : 'ilimitadas'}</strong> regeneraciones este mes.</>
                                )
                            )}
                        </div>
                    </div>
                )}
            />
            {/* ═══════════ MODAL: Confirmación bloqueo permanente de un plato individual ═══════════ */}
            <OptionPickerModal
                isOpen={!!swapDislikeConfirm}
                onClose={() => setSwapDislikeConfirm(null)}
                title="¿Bloquear este plato?"
                subtitle={
                    swapDislikeConfirm && (
                        <div style={{ margin: '0 0 1.15rem 0', fontSize: '0.85rem', color: '#64748B' }}>
                            <p style={{ margin: '0 0 0.75rem 0' }}>
                                Este plato quedará <strong style={{ color: '#EF4444' }}>bloqueado permanentemente</strong> y la IA no volverá a sugerirlo en futuros planes:
                            </p>
                            <div style={{
                                background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.75rem',
                                padding: '0.6rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}>
                                <ThumbsDown size={14} color="#EF4444" />
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#991B1B' }}>
                                    {swapDislikeConfirm.mealName}
                                </span>
                            </div>
                        </div>
                    )
                }
                options={[
                    { id: 'confirm', icon: ThumbsDown, label: 'Sí, bloquear y cambiar', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', desc: 'La IA no volverá a sugerir este plato' },
                    { id: 'cancel',  icon: Shuffle,    label: 'Cancelar',               color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', desc: 'Volver sin hacer cambios' }
                ]}
                onOptionClick={async (optionId) => {
                    if (optionId === 'cancel') {
                        setSwapDislikeConfirm(null);
                        return;
                    }
                    const { dayIndex, mealIndex, mealType, mealName } = swapDislikeConfirm;
                    setSwapDislikeConfirm(null);

                    setRegeneratingId(mealIndex);
                    const toastId = toast.loading('👎 Registrando preferencia...', { description: 'Buscando una alternativa deliciosa...' });

                    try {
                        const newName = await regenerateSingleMeal(
                            dayIndex, mealIndex, mealType, mealName,
                            'dislike',
                            liveInventory // ← [P0-1] para detectar ingredientes nuevos post-restock
                        );

                        trackEvent('plan_regeneration_triggered', {
                            reason: 'dislike',
                            source: 'dashboard',
                            is_expired: isPlanExpired,
                            has_pantry: liveInventory && liveInventory.length > 0,
                            type: 'single_meal'
                        });

                        toast.dismiss(toastId);
                        toast.success('¡Menú Actualizado!', { description: `Cambiado por: ${newName}`, icon: '👨‍🍳' });
                    } catch (error) {
                        console.error('Error al regenerar:', error);
                        toast.dismiss(toastId);
                        toast.error('No se pudo conectar con la IA', { description: 'Se usó una receta alternativa local.' });
                    } finally {
                        setRegeneratingId(null);
                    }
                }}
            />
            {/* ═══════════ MODAL: Confirmación permanente de "No me gustan estos platos" ═══════════ */}
            <OptionPickerModal
                isOpen={showDislikeConfirmModal}
                onClose={() => { setShowDislikeConfirmModal(false); setShowUpdatePlanModal(true); }}
                title="¿Bloquear estos platos?"
                subtitle={
                    <div style={{ margin: '0 0 1.15rem 0', fontSize: '0.85rem', color: '#64748B' }}>
                        <p style={{ margin: '0 0 0.5rem 0' }}>
                            Los siguientes platos quedarán <strong style={{ color: '#EF4444' }}>bloqueados permanentemente</strong> y no volverán a aparecer en futuros planes:
                        </p>
                        {currentDayMeals.length > 0 && (
                            <ul style={{ margin: '0.35rem 0 0 0', padding: '0 0 0 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                {currentDayMeals.map((m, i) => (
                                    <li key={i} style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.82rem' }}>{m.name}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                }
                options={[
                    { id: 'confirm_dislike', icon: ThumbsDown, label: 'Sí, bloquear y actualizar', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', desc: 'Se evitarán estos platos en todos los ciclos futuros' },
                    { id: 'cancel_dislike',  icon: Shuffle,    label: 'Cancelar',                  color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', desc: 'Volver al menú de opciones sin cambios' }
                ]}
                isNavigatingOption={isNavigatingOption}
                onOptionClick={async (optionId) => {
                    if (optionId === 'cancel_dislike') {
                        setShowDislikeConfirmModal(false);
                        setShowUpdatePlanModal(true);
                        return;
                    }
                    if (isLimitReached || isNavigatingOption) return;
                    setIsNavigatingOption('confirm_dislike');
                    const toastId = toast.loading(
                        isPlanExpired ? 'Preparando nuevo ciclo...' : 'Actualizando platos...',
                        { description: 'Analizando opciones con IA...' }
                    );
                    try {
                        await handleNewPlan('dislike', toastId, 'dashboard_refresh');
                        setShowDislikeConfirmModal(false);
                    } finally {
                        setIsNavigatingOption(null);
                    }
                }}
            />

        </>
    );
};

export default Dashboard;
