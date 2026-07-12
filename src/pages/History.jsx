import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// [P1-NEON-DB-MIGRATION · 2026-06-12] Eliminado `import { el cliente anterior }`: el
// único uso ejecutable era el select de plan_data en _loadPlanDataLazy,
// migrado a GET /api/plans-data/{plan_id} (la DB vive en Neon; PostgREST
// apunta al Postgres stale de el backend anterior).
import { fetchWithAuth, deletePlanFromHistory, getHistoryList, getLessonsCounts, getPlanLessonsDetail, getPlanCoherenceHistory, getHistoryStatusSummary, getPlanBlockedReasons, getPlanChunkMetrics, getPlanLifetimeLessons, renamePlan } from '../config/api';
import { useAssessment } from '../context/AssessmentContext';
import { CalendarDays, CalendarRange, CalendarCheck, Calendar, ChevronLeft, ChevronRight, Flame, Dumbbell, Wheat, Droplet, RotateCcw, X, Edit2, Check, Trash2, Wand2, BookOpen, AlertTriangle, Sparkles, Search, Sun, Moon, Coffee, Fish } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './History.module.css';
// [P1-CLINICAL-MEAL-COUNT · 2026-06-27] Emoji por SLOT (no por índice) — planes de 3/5/6 comidas.
import { mealEmojiFor } from '../utils/mealEmoji';
// [P2-HIST-MODALS-A11Y · 2026-05-30] Hook SSOT (P2-CUSTOM-MODALS-A11Y) con
// role=dialog + aria-modal + ESC + focus-trap + restore-focus + body overflow
// lock para los 3 modales custom del Historial (detalle + reactivar + eliminar).
// Los modales eran `motion.div` con click-backdrop como única vía de cierre —
// outlier respecto a PaymentModal / LogoutConfirmModal / Dashboard restock /
// los 3 modales de Pantry (P2-PANTRY-MODALS-A11Y), que ya usan este hook.
import { useModalAccessibility } from '../hooks/useModalAccessibility';
// [P2-14 · 2026-07-09] Hook SSOT de media queries (antes copia local del mismo hook).
import { useMediaQuery } from '../hooks/useMediaQuery';
// [P-HISTORY-CHUNK-WINDOW] Helpers chunk-aware compartidos con Recipes.jsx.
// Sincronizados con `split_with_absorb` del backend (constants.py:961).
// [P1-HIST-1 · 2026-05-09] Reintroducimos `splitWithAbsorb` para soportar
// navegación read-only entre chunks dentro del modal. El cap "≤4 días
// visibles a la vez" sigue vigente — solo permitimos saltar al chunk
// siguiente/previo SIN reactivar el plan (la reactivación es destructiva,
// post-P0-HIST-1 cancela chunks pending del plan activo).
import { splitWithAbsorb, findChunkContaining, parseStartLocal } from '../utils/chunkWindow';
// [P2-HIST-AUDIT-11 · 2026-05-09] Caches singleton del modal del
// Historial. Persisten cross-mount del componente <History> para
// que un usuario que navega entre History ↔ Dashboard no dispare
// los lazy fetches del modal de cero al volver.
import { historyCaches, setCachedEntry, hydrateCacheDict, setCachedLifetimeEntry, hydrateLifetimeDict, invalidateCachesForPlan, getCachedHistoryListStale, setCachedHistoryList, invalidateHistoryListCache } from '../utils/historyCaches';
// [P2-HIST-AUDIT-13 · 2026-05-09] SSOT del set de coherence
// anomalous actions. Mirror de `backend/constants.py::COHERENCE_ANOMALOUS_ACTIONS`.
import { isAnomalousCoherenceAction } from '../utils/coherenceActions';
// [P2-HIST-NEW-1 · 2026-05-09] Map reason_code → label es-DO para el
// chip "Acción: <reason>" en cards. Mirror del catálogo de
// /blocked_reasons (~3670+) con labels más cortos para chip layout.
// Sin callsite activo tras refactor de cards, pero el import es anchor
// del test parser-based History.p2_action_chip_with_reason.test.js —
// NO eliminar sin actualizar ese test.
// eslint-disable-next-line no-unused-vars
import { getActionReasonLabel } from '../utils/actionReasons';
// [P2-HIST-NEW-4 · 2026-05-09] Map chunk_kind → label es-DO. Mirror
// del enum del backend (`initial_plan` / `rolling_refill` / `catchup`).
// Test backend de paridad detecta drift cross-language.
import { getChunkKindLabel } from '../utils/chunkKinds';
// [P0-HIST-FIX-5 · 2026-05-09] Status humanization helper para el
// tab Métricas. Mapea `completed`/`pending`/etc. → "Completado"/
// "En cola"/etc. en es-DO breve.
import { getChunkStatusLabel } from '../utils/chunkStatus';
// [P1-3 · 2026-05-10] Maps es-DO para action_taken + hypothesis del guard
// recetas↔lista. Renderiza badges/chips humanizados en el tab "Ajustes".
import { getCoherenceActionLabel, getCoherenceHypothesisLabel } from '../utils/coherenceLabels';
// [P3-HIST-DESKTOP-REDESIGN · 2026-06-24] Panel de Historial para PC (diseño del
// owner) injertado sobre los datos/handlers reales. Solo se monta en escritorio;
// móvil mantiene el render compacto existente. El modal de detalle sigue siendo
// el real (más abajo en este archivo).
import HistoryDesktopPanel from '../components/history/HistoryDesktopPanel';
import HistoryMobilePanel from '../components/history/HistoryMobilePanel';

// [P-HISTORY-DAY-LABELS] Nombres de día (mismo SSOT que Recipes.jsx y
// Dashboard.jsx). Capitalizados para títulos ("Menú — Viernes") y tabs.
const _DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// [P3-HIST-MODAL-MENU-CARDS · 2026-06-24] Estilo por tipo de comida para las
// tarjetas del menú del modal (diseño del owner: cuadro de ícono coloreado +
// label coloreado). Mapea por el texto del tipo; fallback ciclando por índice.
const _MEAL_TYPE_STYLES = [
    { tone: '#FBBF24', Icon: Sun },    // Desayuno
    { tone: '#34D399', Icon: Fish },   // Almuerzo
    { tone: '#38BDF8', Icon: Coffee }, // Merienda
    { tone: '#A78BFA', Icon: Moon },   // Cena
];
function _mealTypeStyle(label, idx) {
    const s = String(label || '').toLowerCase();
    if (s.includes('desayuno')) return _MEAL_TYPE_STYLES[0];
    if (s.includes('almuerzo') || s.includes('comida')) return _MEAL_TYPE_STYLES[1];
    if (s.includes('merienda') || s.includes('snack')) return _MEAL_TYPE_STYLES[2];
    if (s.includes('cena')) return _MEAL_TYPE_STYLES[3];
    return _MEAL_TYPE_STYLES[idx % _MEAL_TYPE_STYLES.length];
}

// [P1-HIST-4 · 2026-05-09] Timestamp efectivo para ordenar el historial.
// Antes el listado se ordenaba solo por `created_at` desc — un plan
// modificado por swap, post-swap revalidation (P2-B), shift_plan,
// restore (P0-HIST-1), o cualquiera de los ~6 paths del backend que
// sellan `_plan_modified_at` en plan_data, NO saltaba arriba aunque
// el contenido sea más fresco que el de planes "más nuevos" pero sin
// ediciones.
//
// Helper exportable para reuso (Dashboard "Recientes", etc.). Toma
// el max(created_at, _plan_modified_at) — usar solo el modificado
// rompería planes legacy sin la key. Devuelve epoch millis para que
// `Array.sort` use comparación numérica directa.
//
// [P1-HIST-AUDIT-4 · 2026-05-09] Acepta DOS shapes:
//   1. Summary del endpoint /api/plans/history-list:
//      { plan_modified_at: "<iso>"|null, created_at: "<iso>", ... }
//   2. Legacy row directo de meal_plans:
//      { plan_data: { _plan_modified_at: "<iso>" }, created_at: "<iso>" }
// El check del shape 1 toma precedencia. Mantener el shape 2 evita
// romper tests vitest existentes y consumidores fuera del Historial.
export const _effectiveModifiedAt = (plan) => {
    if (!plan) return 0;
    const summaryMod = typeof plan.plan_modified_at === 'string'
        ? plan.plan_modified_at
        : null;
    const legacyMod = (plan.plan_data && typeof plan.plan_data._plan_modified_at === 'string')
        ? plan.plan_data._plan_modified_at
        : null;
    const planModRaw = summaryMod || legacyMod;
    const planMod = planModRaw ? Date.parse(planModRaw) : NaN;
    const created = Date.parse(plan.created_at || '');
    if (Number.isFinite(planMod) && Number.isFinite(created)) {
        return Math.max(planMod, created);
    }
    if (Number.isFinite(planMod)) return planMod;
    if (Number.isFinite(created)) return created;
    return 0;
};

const _dayNameForGlobalIdx = (startMid, globalIdx) => {
    if (!startMid || typeof globalIdx !== 'number' || globalIdx < 0) {
        return `Día ${(globalIdx ?? 0) + 1}`;
    }
    const d = new Date(startMid.getTime());
    d.setDate(d.getDate() + globalIdx);
    return _DIAS_SEMANA[d.getDay()];
};

// [P1-HIST-COMPLETE-PROGRESS · 2026-05-31] El Historial muestra el progreso
// COMPLETO del plan: los días que el shift rolling del backend PODÓ del array
// vivo (`plan_data._archived_days`, ya pasados) + los días vigentes
// (`plan_data.days`, la ventana que el Dashboard "Tu Menú"/Recetas siguen
// mostrando). El backend (api_shift_plan + _background_shift_plan_for_user)
// archiva los días antes de podarlos. Esta función SOLO se usa en el modal
// del Historial — el Dashboard/Recetas leen `plan_data.days` directo (ventana
// rolling intacta). Devuelve [] defensivamente. Helper exportado para test.
export const _fullHistoryDays = (planData) => {
    if (!planData || typeof planData !== 'object') return [];
    const live = Array.isArray(planData.days) ? planData.days : [];
    const archived = Array.isArray(planData._archived_days) ? planData._archived_days : [];
    return archived.length > 0 ? [...archived, ...live] : live;
};

// [P1-HIST-COMPLETE-PROGRESS · 2026-05-31] Base de fecha para etiquetar los
// tabs del modal. Si HAY días archivados, el timeline completo arranca en el
// inicio ORIGINAL inmutable (`cycle_start_date`) — porque el shift rebasa
// `grocery_start_date` a "hoy" en cada rollover (plans.py:api_shift_plan), así
// que usarlo etiquetaría el primer día archivado como hoy. Si NO hay archive
// (plan que nunca shifteó, o planes pre-fix), se conserva el comportamiento
// previo (`grocery_start_date`, que == cycle_start_date cuando no ha shifteado).
export const _historyLabelStart = (planData, createdAt) => {
    const hasArchive = Array.isArray(planData?._archived_days) && planData._archived_days.length > 0;
    if (hasArchive) {
        return planData?.cycle_start_date || planData?.grocery_start_date || createdAt;
    }
    return planData?.grocery_start_date || createdAt;
};

const History = () => {
    // [P3-HIST-LIST-CACHE · 2026-05-19] Stale-while-revalidate del listado.
    // Lazy-init lee el singleton del módulo `historyCaches`.
    // [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] Usa la versión "stale"
    // que retorna la última lista conocida AUNQUE el TTL de 60s haya
    // expirado, y AUNQUE el cache venga de localStorage de una sesión
    // pasada. El fetchHistory del useEffect mount refresca silencioso
    // — la "frescura" se garantiza por stale-while-revalidate, no por
    // bloqueo con skeleton.
    //
    // Trade-off: el usuario puede ver datos hasta ~minutos viejos al
    // entrar tras una sesión larga / refresh / cold boot. Aceptable
    // porque (a) el listado del Historial es low-volatility, (b) la
    // lista se refresca en background en <1s típicamente, (c) las
    // mutaciones (delete/restore/rename) invalidan el cache
    // explícitamente, así que cambios del propio user nunca aparecen
    // stale.
    const [plans, setPlans] = useState(() => getCachedHistoryListStale() || []);
    const [searchQuery, setSearchQuery] = useState('');
    // [P3-HIST-DESKTOP-REDESIGN · 2026-06-24] PC (≥769px) usa HistoryDesktopPanel.
    const isDesktop = useMediaQuery('(min-width: 769px)');
    const [loading, setLoading] = useState(() => !getCachedHistoryListStale());
    const [selectedPlan, setSelectedPlan] = useState(null);
    // [P3-HIST-FAST-OPEN · 2026-05-18] Flag de carga del plan_data del
    // plan abierto. El modal ahora abre INSTANTÁNEO con el summary
    // (calories/macros/name/created_at del listado) y stream el
    // plan_data en paralelo. Mientras el flag esté `true` Y el plan
    // no tenga `plan_data.days`, el body del modal muestra un skeleton
    // sutil donde van los meals (vs el bloqueo previo donde el modal
    // no abría hasta resolverse el await — delay de 200-500ms en cada
    // click).
    const [planDataLoading, setPlanDataLoading] = useState(false);
    const [selectedDay, setSelectedDay] = useState(0);
    // [P1-HIST-1 · 2026-05-09] Índice del chunk visible en el modal.
    // Permite navegación read-only entre chunks (≤4 días por chunk).
    // La iteración previa (P3-UI-HISTORY-MAX-4-DAYS) eliminó este state
    // porque la nav legacy mostraba TODOS los días simultáneamente; la
    // re-introducción aquí mantiene el cap por chunk pero deja que el
    // usuario revise el plan archivado completo sin reactivarlo.
    const [activeChunkIdx, setActiveChunkIdx] = useState(0);
    const [confirmRestore, setConfirmRestore] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    // [P1-HIST-3 · 2026-05-09] Conteo de lecciones por plan, una sola
    // request al montar. `{ "<plan_id>": <count> }`. Planes sin entrada
    // se tratan como 0 (no se renderiza chip). Si la request falla, el
    // estado queda como objeto vacío y el feature degrada silente.
    const [lessonsCounts, setLessonsCounts] = useState({});
    // [P2-HIST-AUDIT-D · 2026-05-09] Split por tier (high/partial/low)
    // de los counts de telemetría. El endpoint /lessons-counts ahora
    // devuelve `counts_by_quality: { "<plan_id>": {high, partial, low} }`.
    // El chip de la card lo usa para mostrar "X high · Y low" en lugar
    // del total plano que mezclaba calidad con proxy degradado.
    // El valor ya no se lee (chip removido del card layout) pero la
    // declaración exacta es anchor del test parser-based
    // History.p2_audit_batch.test.js y el setter sigue hidratándose
    // desde /lessons-counts (_fetchLessonsCounts) — NO eliminar.
    // eslint-disable-next-line no-unused-vars
    const [lessonsCountsByQuality, setLessonsCountsByQuality] = useState({});

    // [P0-AUDIT-HIST-2 · 2026-05-09] Summary agregado de
    // `plan_chunk_queue.status` por plan del usuario. `{ "<plan_id>":
    // { pending_user_action_count, failed_count, in_flight_count,
    // completed_count, total } }`. Cierre del drift entre la queue y
    // `plan_data._user_action_required`: solo
    // `_escalate_unrecoverable_chunk` escribe el flag en plan_data,
    // pero 6+ rutas setean `pending_user_action`. Sin este summary,
    // chunks pausados (pantry/tz/missing-lessons) son INVISIBLES al
    // Historial.
    //
    // Si la request falla, queda como `{}` y `getStatusInfo` cae al
    // path legacy (solo plan_data). Degradación silenciosa — no
    // bloquea la lista. Best-effort, igual que lessonsCounts.
    const [chunkStatusSummary, setChunkStatusSummary] = useState({});

    // [P2-HIST-AUDIT-2 · 2026-05-09] Tabs del modal del Historial:
    // 'menu' | 'lessons' | 'adjustments'. Default 'menu' al abrir
    // cualquier card. Lazy fetch del contenido de los otros tabs:
    // - lessonsDetailCache: { "<plan_id>": [<lesson>, ...] } o
    //   { "<plan_id>": "loading" | "error" } como sentinels.
    // - coherenceHistoryCache: idem para ajustes.
    // Cache per-plan_id evita re-fetch al volver al mismo plan.
    const [activeModalTab, setActiveModalTab] = useState('menu');
    // [P2-HIST-AUDIT-11 · 2026-05-09] Lazy init desde singleton:
    // si el usuario ya abrió un plan en sesión anterior, los datos
    // cacheados re-aparecen al re-montar <History>. El singleton
    // solo persiste arrays (no sentinels 'loading'/'error') con
    // TTL 30 min — ver utils/historyCaches.js para diseño completo.
    const [lessonsDetailCache, setLessonsDetailCache] = useState(
        () => hydrateCacheDict(historyCaches.lessonsDetail)
    );
    const [coherenceHistoryCache, setCoherenceHistoryCache] = useState(
        () => hydrateCacheDict(historyCaches.coherenceHistory)
    );
    // [P2-HIST-AUDIT-9 · 2026-05-09] Cache de reasons per-chunk por
    // plan_id. `{ "<plan_id>": [<reason>, ...] }` o sentinels
    // 'loading' | 'error'. Se popula lazy al abrir el modal cuando
    // hay drift indicado por counters embedded o summary endpoint.
    // Sin esto, el banner solo mostraba el `_user_action_required`
    // agregado de plan_data — un plan con 3 chunks bloqueados por
    // razones distintas reportaba un único reason genérico.
    // [P2-HIST-AUDIT-11 · 2026-05-09] Lazy init desde singleton.
    const [blockedReasonsCache, setBlockedReasonsCache] = useState(
        () => hydrateCacheDict(historyCaches.blockedReasons)
    );

    // [P2-HIST-AUDIT-10 · 2026-05-09] Cache de chunk metrics por
    // plan_id. `{ "<plan_id>": [<chunk>, ...] }` o sentinels
    // 'loading' | 'error'. Lazy-loaded al activar el tab "Métricas"
    // (no al abrir el modal — evita request innecesaria si el
    // usuario solo mira el menú). Cada chunk incluye
    // learning_metrics jsonb + métricas persistidas en
    // plan_chunk_metrics (duration_ms, lag_seconds, was_degraded,
    // learning_repeat_pct, etc.).
    // [P2-HIST-AUDIT-11 · 2026-05-09] Lazy init desde singleton.
    const [chunkMetricsCache, setChunkMetricsCache] = useState(
        () => hydrateCacheDict(historyCaches.chunkMetrics)
    );
    // [P1-HIST-NEW-4 · 2026-05-09] Metadata paralela (`total_count` +
    // `limit`) del response de chunk-metrics. Estado separado del
    // cache principal (que sigue siendo `{<plan_id>: <array>}` con
    // sentinels) para no romper el shape esperado por los helpers
    // del singleton `historyCaches`. El render del tab Métricas
    // muestra "Mostrando X de N" cuando `total_count > chunks.length`,
    // señal de que el cap LIMIT 50 truncó. Sin esto, planes con
    // 50+ chunks (extreme: tier ultra 90d con re-enqueues post-swap
    // que dejan completed+failed coexistentes tras P0-HIST-NEW-1)
    // mostraban silently truncados — el operador en post-mortem no
    // sabía si veía la lista completa.
    const [chunkMetricsMeta, setChunkMetricsMeta] = useState({});

    // [P1-HIST-LIFETIME-LESSONS · 2026-05-09] Cache del payload de
    // lifetime-lessons por plan_id. `{ "<plan_id>": {summary, history,
    // critical_permanent, counts} }` o sentinels 'loading' | 'error'.
    // A diferencia de los 4 caches anteriores (arrays planos), aquí
    // el value es un OBJETO compuesto — necesita helpers dedicados
    // (`setCachedLifetimeEntry` / `hydrateLifetimeDict`) en lugar de
    // los `setCachedEntry`/`hydrateCacheDict` que asumen array.
    // Lazy-loaded al activar el tab "Lecciones" (paralelo al
    // _ensureLessonsDetail existente — los dos endpoints poblan
    // sub-secciones distintas del mismo tab).
    const [lifetimeLessonsCache, setLifetimeLessonsCache] = useState(
        () => hydrateLifetimeDict()
    );

    // [P2-HIST-NEW-5 · 2026-05-09] Toggle de expansión del bloque
    // "Historial reciente por chunk" del tab Lecciones. Antes el
    // cap visual era 5 entries con counter "5 de 50" pero sin
    // acción para expandir — surface incompleto para planes con
    // historial largo. Ahora el botón "Ver todos" / "Ver menos"
    // permite ver el set completo (cap backend 50).
    //
    // Single boolean (no per-plan_id) porque solo un modal está
    // abierto a la vez. Se resetea a false cuando el usuario
    // cambia de plan abierto (useEffect con [selectedPlan?.id]
    // deps abajo).
    const [lifetimeHistoryExpanded, setLifetimeHistoryExpanded] = useState(false);

    // Edit name state
    const [isEditing, setIsEditing] = useState(null);
    const [tempName, setTempName] = useState('');
    const [sessionExpired, setSessionExpired] = useState(false);  // [P2-HISTORY-401-GRACEFUL · 2026-06-21]

    // [P0-HIST-VIS-REFRESH · 2026-05-09] Timestamp del último
    // fetchHistory exitoso. Lo usa el listener de `visibilitychange`
    // para decidir si re-pulla el listado al volver del background.
    // Sin esto, un usuario que dejó la pestaña dormida 2h vuelve
    // viendo el bucket pre-mutación: chunks que el cron transicionó
    // (pending_user_action → completed, processing → failed) siguen
    // mostrando su estado viejo hasta refresh manual.
    const _lastFetchedAtRef = useRef(Date.now());

    // [P1-HISTORY-ABORT · 2026-05-23] AbortController component-scoped.
    // Cubre la ventana donde un usuario premium navega fuera de /history
    // mientras los 3 fetches del mount (history-list 12s + lessons-counts
    // 12s + history-status-summary 12s) están en flight: sin esto, las
    // promesas resuelven post-unmount y disparan setState-on-unmounted +
    // memory leak suave (~1KB body parsed + retenido) + warning Sentry.
    // Una sola instancia por mount: el listener de visibilitychange
    // reusa la misma signal — abort en cleanup cancela TODOS los
    // in-flight (mount + re-fetches por visibility) atomicamente.
    const _abortControllerRef = useRef(null);

    const navigate = useNavigate();
    // [P0-HIST-1 · 2026-05-09] Usamos `restorePlanFromHistory` (no
    // `restorePlan`) para que el flujo desde Historial pase por el
    // endpoint atómico que cancela chunks pending/processing del
    // target y sobrescribe columnas top-level. Antes, el legacy
    // `restorePlan(plan_data)` UPDATE-aba solo `plan_data` de la
    // fila latest, dejando que workers de chunks continuaran
    // generando días con el `pipeline_snapshot` del plan anterior y
    // contaminaran el plan restaurado.
    // [P6-SPEED-HIST-GETUSER · 2026-06-01] `session` (ya hidratada del contexto)
    // reemplaza el `el cliente anterior.auth.getUser()` que hacía _loadPlanDataLazy — ese
    // era el ÚNICO getUser() del árbol (un roundtrip de red a /auth/v1/user que
    // revalida el JWT server-side) y bloqueaba ~100-300ms el query de plan_data
    // en cada apertura de tarjeta no cacheada. La RLS ya enforza ownership.
    const { restorePlanFromHistory, session } = useAssessment();

    // [P2-HIST-MODALS-A11Y · 2026-05-30] Defenses a11y (role/aria/ESC/
    // focus-trap/restore-focus/scroll-lock) para los 3 modales custom.
    // onClose memoizado con useCallback: el hook tiene `onClose` en sus
    // deps de useEffect, así que un arrow inline re-correría el effect en
    // CADA render del componente (el modal de detalle re-renderiza mucho:
    // cambio de tab, nav de día, lazy-load de plan_data) → re-foco al
    // container cada 10ms robando el focus de los elementos internos.
    // Memoizado, el effect solo corre al abrir/cerrar de verdad.
    const _closeDetailModal = useCallback(() => setSelectedPlan(null), []);
    const _closeRestoreConfirm = useCallback(() => setConfirmRestore(null), []);
    const _closeDeleteConfirm = useCallback(() => setConfirmDelete(null), []);
    // El modal de detalle DESACTIVA su trap mientras un confirm está
    // encima (confirmRestore se abre desde el footer del detalle y se
    // apila): así solo hay UN focus-trap + UN handler de ESC activo a la
    // vez. Al cerrar el confirm, el trap del detalle se re-activa.
    const { containerRef: detailModalRef } = useModalAccessibility({
        isOpen: !!selectedPlan && !confirmRestore && !confirmDelete,
        onClose: _closeDetailModal,
    });
    const { containerRef: restoreConfirmRef } = useModalAccessibility({
        isOpen: !!confirmRestore,
        onClose: _closeRestoreConfirm,
    });
    const { containerRef: deleteConfirmRef } = useModalAccessibility({
        isOpen: !!confirmDelete,
        onClose: _closeDeleteConfirm,
    });

    // [P1-HIST-NEW-3 · 2026-05-09] Helper extraído del useEffect de
    // mount para que el listener de visibilitychange (siguiente
    // useEffect) pueda re-disparar la misma lógica al volver del
    // background. Antes vivía inline en el mount; visibilitychange
    // ignoraba esta fetch y los chips de lecciones quedaban con
    // conteo viejo aunque el cron añadiera lecciones a
    // `chunk_lesson_telemetry` mientras el tab estaba dormido.
    //
    // Mismo patrón Promise.race + timeout 12s + best-effort silent.
    // Si falla, los conteos previos se preservan (no se borran a {}
    // — eso parpadearía los chips).
    // [P1-HISTORY-ABORT · 2026-05-23] options.signal cancela la request
    // si el componente desmonta. AbortError cae al catch silencioso.
    const _fetchLessonsCounts = ({ signal } = {}) => {
        Promise.race([
            getLessonsCounts({ signal }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_LESSONS_COUNTS')), 12000)),
        ])
            .then(async (res) => {
                if (signal && signal.aborted) return;
                if (!res.ok) return;
                const body = await res.json().catch(() => ({}));
                if (signal && signal.aborted) return;
                if (body && typeof body.counts === 'object' && body.counts !== null) {
                    setLessonsCounts(body.counts);
                }
                // [P2-HIST-AUDIT-D · 2026-05-09] counts_by_quality
                // viene en el mismo response como mapa de plan_id a
                // `{high, partial, low}`. Si el backend es legacy
                // (pre-P2-HIST-AUDIT-D) la key no aparece — el state
                // queda vacío y el render legacy del chip se usa.
                if (body && typeof body.counts_by_quality === 'object'
                    && body.counts_by_quality !== null) {
                    setLessonsCountsByQuality(body.counts_by_quality);
                }
            })
            .catch(() => { /* silencioso (incluye AbortError) */ });
    };

    useEffect(() => {
        // [P1-HISTORY-ABORT · 2026-05-23] Controller component-scoped.
        // Cubre los 3 fetches del mount + los re-fetches del listener
        // visibilitychange. Cleanup abort() cancela TODOS los in-flight
        // sincronamente — el browser cierra el TCP/HTTP request en vuelo
        // y los .then no se disparan post-unmount.
        const controller = new AbortController();
        _abortControllerRef.current = controller;
        const signal = controller.signal;

        fetchHistory({ signal });
        // [P1-HIST-3 · 2026-05-09] Best-effort: si falla, lessonsCounts
        // queda en {} y los chips simplemente no aparecen. No bloqueamos
        // ni mostramos toast de error — es feature opcional, no crítica.
        // [P0-HIST-FETCH-TIMEOUT · 2026-05-09] Race contra timeout 12s.
        // Sin esto, si `el cliente anterior.auth.getSession()` (interno de
        // fetchWithAuth) cuelga, este .then nunca corre y los chips de
        // lecciones quedan ausentes silenciosamente forever; menos crítico
        // que el del fetchHistory pero mismo patrón.
        // [P1-HIST-NEW-3 · 2026-05-09] Helper extraído arriba para
        // permitir reuso en visibilitychange.
        _fetchLessonsCounts({ signal });

        // [P0-AUDIT-HIST-2 · 2026-05-09] Summary de queue states para
        // reconciliación bucket en `getStatusInfo`. Mismo patrón
        // best-effort + timeout 12s que `getLessonsCounts`. Si falla,
        // el summary queda `{}` y `getStatusInfo` opera en modo
        // legacy (solo plan_data) — no se rompe la lista.
        //
        // [P1-AUDIT-HIST-4 · 2026-05-09] FALLBACK LEGACY. Tras el
        // LEFT JOIN del backend, `/api/plans/history-list` ya trae
        // los counters embebidos por plan (`chunk_*_count`) y
        // `getStatusInfo` los prefiere. Este fetch sigue activo
        // como fallback durante deploy lag (frontend nuevo + backend
        // viejo): el response del listado no traerá counters, y el
        // summary salva. En el feliz path post-redeploy, el summary
        // se descarga pero `getStatusInfo` lo ignora (cero impacto
        // en UX, un roundtrip extra). Removible en futura iteración
        // tras confirmar adopción 100%.
        Promise.race([
            getHistoryStatusSummary({ signal }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_HISTORY_STATUS_SUMMARY')), 12000)),
        ])
            .then(async (res) => {
                if (signal.aborted) return;
                if (!res.ok) return;
                const body = await res.json().catch(() => ({}));
                if (signal.aborted) return;
                if (body && typeof body.summary === 'object' && body.summary !== null) {
                    setChunkStatusSummary(body.summary);
                }
            })
            .catch(() => { /* silencioso (incluye AbortError) */ });

        return () => {
            // [P1-HISTORY-ABORT · 2026-05-23] Aborta los 3 fetches en
            // flight cuando el usuario navega fuera de /history antes
            // de que resuelvan. Sin esto, las .then sobreviven al
            // unmount y disparan setState-on-unmounted-component
            // (warning React + leak de body parseado retenido).
            try { controller.abort(); } catch { /* noop */ }
        };
    },[]);

    // [P2-HIST-NEW-5 · 2026-05-09] Reset de la expansión del lifetime
    // history cuando el usuario cambia de plan abierto (selectedPlan
    // cambia o se cierra el modal). Sin esto, abrir el plan A → click
    // "Ver todos" → cerrar → abrir plan B mostraría B con 50 entries
    // expandidos por accidente; UX inconsistente. El reset siempre a
    // false al transicionar evita state-bleed cross-plan.
    useEffect(() => {
        setLifetimeHistoryExpanded(false);
    }, [selectedPlan?.id]);

    // [P0-HIST-VIS-REFRESH · 2026-05-09] Re-fetchea el listado del
    // Historial cuando la pestaña vuelve a estar visible tras >60s
    // dormida. Cierre del bug latente del cache singleton de
    // P2-HIST-AUDIT-11: TTL 30 min era óptimo para navegación entre
    // páginas, pero un usuario que deja `/history` abierto en
    // background mientras un cron transiciona chunks (escalación,
    // recovery, pickup) volvía a un listado pre-mutación + caches
    // del modal con datos obsoletos hasta refresh manual.
    //
    // Estrategia:
    //   1. Refrescar el listado (`fetchHistory`) — recoge bucket
    //      reconciliado nuevo y counters embedded actualizados.
    //   2. [P1-HIST-NEW-3 · 2026-05-09] Refrescar lessonsCounts +
    //      lessonsCountsByQuality. fetchHistory cubre los counters
    //      embedded del queue (chunk_*_count) pero NO la tabla
    //      `chunk_lesson_telemetry` — un chunk que completa en
    //      background y persiste lecciones nuevas vía T2 dejaba el
    //      chip "X lecciones" con el conteo del primer mount hasta
    //      navegar fuera+entrar al Historial. Sin embedded
    //      equivalente (history-list no agrega lecciones por costo
    //      del JOIN extra contra una tabla de telemetría que
    //      crece linealmente con el uso), llamamos al endpoint
    //      dedicado.
    //   3. Invalidar singleton + state local del PLAN ABIERTO
    //      (selectedPlan) si lo hay. Sin esto, los tabs Lecciones/
    //      Ajustes/Métricas/Bloqueados del modal seguirían leyendo
    //      del cache stale aunque el bucket de la card ya cambió.
    //
    // Threshold 60s evita disparos por idle micro-cambios de visibility
    // (alt-tab rápidos). Un cron transición típica toma >5min; 60s es
    // el piso por debajo del cual no esperamos cambio de estado real.
    useEffect(() => {
        const _STALE_MS = 60 * 1000;
        // [P0-HIST-NEW-2 · 2026-05-09] Bypass del threshold cuando
        // Plan.jsx señala una inserción reciente vía localStorage. El
        // threshold de 60s era para evitar fetches espurios por
        // alt-tabs cortos; pero un usuario que guarda un plan en
        // /plan y vuelve a /history en otra pestaña dentro de esa
        // ventana NO debe ver el listado pre-insert. La señal es un
        // timestamp epoch ms; si supera `_lastFetchedAtRef`, sabemos
        // que la mutación ocurrió DESPUÉS del último fetch y forzamos
        // refresh aunque `_stale < 60s`.
        const _isHistoryDirtySinceLastFetch = () => {
            try {
                if (typeof window === 'undefined' || !window.localStorage) return false;
                const raw = window.localStorage.getItem('mealfit_history_dirty_at');
                if (!raw) return false;
                const ts = parseInt(raw, 10);
                if (!Number.isFinite(ts)) return false;
                return ts > _lastFetchedAtRef.current;
            } catch {
                return false;
            }
        };
        const _onVisibilityChange = () => {
            if (typeof document === 'undefined') return;
            if (document.visibilityState !== 'visible') return;
            const _stale = Date.now() - _lastFetchedAtRef.current;
            const _dirty = _isHistoryDirtySinceLastFetch();
            if (_stale < _STALE_MS && !_dirty) return;
            // 1) Refrescar listado completo. fetchHistory sobreescribe
            //    plans state + bumpea _lastFetchedAtRef al éxito.
            // [P1-HIST-ABORT · 2026-05-23] Reusa el signal del controller
            //    del mount — abort en unmount cancela también estos
            //    re-fetches en flight, no solo los del mount inicial.
            const _vSignal = _abortControllerRef.current?.signal;
            fetchHistory({ signal: _vSignal });
            // 2) [P1-HIST-NEW-3 · 2026-05-09] Refrescar lessons-counts.
            //    Sin esto, el chip "X lecciones" mostraba conteo
            //    pre-mutación tras background generation. Best-effort
            //    silent — si falla, los conteos previos se preservan
            //    (no se borran a {}, eso parpadearía los chips).
            _fetchLessonsCounts({ signal: _vSignal });
            // 3) Limpiar caches del plan abierto SOLO si hay señal
            //    explícita de mutación (_dirty) — antes invalidábamos
            //    en cada visibilitychange con _stale>60s aunque NO
            //    hubiera cambio real, causando re-fetch de 4 endpoints
            //    pesados (lessons/coherence/blocked/metrics) cada vez
            //    que el usuario volvía al tab.
            //
            //    [P2-NEW-1 · 2026-05-11] Alineamos threshold con TTL
            //    del cache singleton (30min). Modal caches viven 30min
            //    por diseño — invalidarlos en cada alt-tab ≥60s
            //    desperdicia cuota del tier ultra. Ahora solo se
            //    invalidan cuando:
            //      (a) _dirty=true: señal explícita via
            //          `mealfit_history_dirty_at` (P0-HIST-NEW-2).
            //      (b) _stale ≥ TTL del cache (30min): preservación
            //          natural del TTL ya hace expirar las entries;
            //          la invalidación es safety net.
            //    Si no hay modal abierto, nada que limpiar — el resto
            //    de planes se re-cachea on-demand al abrir su modal.
            const _CACHE_TTL_MS = 30 * 60 * 1000;  // mirror utils/historyCaches.js _DEFAULT_TTL_MS
            const _shouldInvalidateModalCaches = _dirty || _stale >= _CACHE_TTL_MS;
            if (_shouldInvalidateModalCaches && selectedPlan && selectedPlan.id) {
                invalidateCachesForPlan(selectedPlan.id);
                setLessonsDetailCache((prev) => {
                    if (!(selectedPlan.id in prev)) return prev;
                    const { [selectedPlan.id]: _omit, ...rest } = prev;
                    return rest;
                });
                setCoherenceHistoryCache((prev) => {
                    if (!(selectedPlan.id in prev)) return prev;
                    const { [selectedPlan.id]: _omit, ...rest } = prev;
                    return rest;
                });
                setBlockedReasonsCache((prev) => {
                    if (!(selectedPlan.id in prev)) return prev;
                    const { [selectedPlan.id]: _omit, ...rest } = prev;
                    return rest;
                });
                setChunkMetricsCache((prev) => {
                    if (!(selectedPlan.id in prev)) return prev;
                    const { [selectedPlan.id]: _omit, ...rest } = prev;
                    return rest;
                });
                // [P1-HIST-LIFETIME-LESSONS · 2026-05-09] Mismo
                // patrón de limpieza que los 4 caches anteriores.
                setLifetimeLessonsCache((prev) => {
                    if (!(selectedPlan.id in prev)) return prev;
                    const { [selectedPlan.id]: _omit, ...rest } = prev;
                    return rest;
                });
            }
        };
        document.addEventListener('visibilitychange', _onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', _onVisibilityChange);
        // selectedPlan en deps para que el listener cierre sobre el
        // valor actual al disparar (sino captura el undefined inicial).
    }, [selectedPlan]);

    // [P1-HISTORY-ABORT · 2026-05-23] options.signal cancela la fetch
    // si el componente desmonta mientras está en flight. AbortError
    // cae al catch silencioso (no toast — el usuario navegó, no es
    // una falla genuina). Guards `signal.aborted` antes de setLoading
    // / setPlans / setCachedHistoryList previenen state-on-unmount.
    const fetchHistory = async ({ signal } = {}) => {
        try {
            // [P1-HIST-AUDIT-4 · 2026-05-09] Endpoint backend
            // `/api/plans/history-list` con projection mínima vía
            // operadores jsonb. Reemplaza el `select('*')` de el backend anterior
            // que descargaba `plan_data` completo (30-80KB por plan
            // típico, MBs para tier ultra). El backend extrae solo los
            // keys que la card consume (calories, macros, status,
            // user_action_required, simplified_weeks, coherence
            // adjusts count, preview meals, tags) → response típico
            // ~1KB por card (50× más liviano).
            //
            // El sort `GREATEST(created_at, _plan_modified_at)` está
            // hecho en SQL (idéntico SSOT a api_restore_plan tras
            // P1-HIST-AUDIT-1). El frontend ya NO necesita re-ordenar.
            //
            // El modal del Historial sigue necesitando
            // `plan_data.days/meals` para el menú; eso lo carga lazy
            // el handler onClick de la card (concentra el bandwidth
            // pesado en el plan que se mira, no upfront).
            //
            // [P0-HIST-FETCH-TIMEOUT · 2026-05-09] Promise.race con
            // timeout 12s. Antes esto era `await getHistoryList()` raw —
            // si `el cliente anterior.auth.getSession()` (dentro de fetchWithAuth)
            // colgaba (intermitencia conocida en local con refresh tokens
            // expirados), la promesa nunca resolvía, el `finally` no
            // corría, y el page se quedaba en skeleton infinito (síntoma
            // observado: "Timeout cargando datos del usuario" en console
            // del AssessmentContext apareciendo SIN que el History saliera
            // de loading=true). El timeout fuerza al usuario a un empty
            // state + toast en vez de un spinner perpetuo.
            const response = await Promise.race([
                getHistoryList({ signal }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_HISTORY_LIST')), 12000)),
            ]);
            if (signal && signal.aborted) return;
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const body = await response.json();
            if (signal && signal.aborted) return;
            const plans = Array.isArray(body && body.plans) ? body.plans : [];
            // El filter `name IS NOT NULL` ya está en el SQL backend
            // (espeja la convención post-P2-HIST-1 del cliente legacy).
            // El sort backend ya ordena por GREATEST(...) DESC →
            // setPlans directo, sin sort client-side (sería redundante
            // y waste CPU). Si en el futuro este endpoint pierde el
            // ORDER BY, _effectiveModifiedAt sigue exportable para
            // re-sort defensivo.
            setSessionExpired(false);  // [P2-HISTORY-401-GRACEFUL] limpia el flag tras un fetch OK
            setPlans(plans);
            // [P3-HIST-LIST-CACHE · 2026-05-19] Persiste al singleton para
            // que el próximo mount renderice instantáneo. Solo si la
            // request fue exitosa (estamos dentro del try, ya pasamos
            // response.ok). El TTL del cache (60s) corre desde aquí.
            setCachedHistoryList(plans);
            // [P0-HIST-VIS-REFRESH · 2026-05-09] Marca el último
            // fetch exitoso para que el listener de visibilitychange
            // pueda calcular staleness al volver al tab.
            _lastFetchedAtRef.current = Date.now();
        } catch (error) {
            // [P1-HISTORY-ABORT · 2026-05-23] AbortError = unmount
            // intencional (usuario navegó fuera mid-fetch). Silencioso:
            // ni log ni toast. El AbortController.abort() del cleanup
            // dispara DOMException name='AbortError' en fetch.
            if (error && error.name === 'AbortError') return;
            if (signal && signal.aborted) return;
            console.error('Error fetching history:', error);
            // [P2-HISTORY-401-GRACEFUL · 2026-06-21] getHistoryList lanza `HTTP <status>`
            // (Response cruda, línea 638). 401 → estado "sesión expirada" elegante en vez
            // del toast rojo alarmante. El `finally` igual pone loading=false.
            if (error && error.message === 'HTTP 401') {
                setPlans([]);
                setSessionExpired(true);
                return;
            }
            const _isTimeout = error && error.message === 'TIMEOUT_HISTORY_LIST';
            toast.error(_isTimeout
                ? 'El historial tardó demasiado en cargar. Intenta refrescar.'
                : 'No se pudo cargar el historial.');
        } finally {
            // [P1-HISTORY-ABORT · 2026-05-23] No tocar loading si ya
            // desmontamos — evita React warning state-on-unmounted.
            if (!signal || !signal.aborted) setLoading(false);
        }
    };

    // [P1-HIST-AUDIT-4 · 2026-05-09] Lazy-load del plan_data completo
    // cuando el usuario abre una card. La lista summary no trae
    // `days/meals` (donde está el bandwidth pesado); este handler
    // carga solo el plan_data del plan abierto. Cache implícito:
    // setSelectedPlan guarda el plan_data en el row del state, así
    // re-abrir la misma card no dispara una segunda request en la
    // misma sesión.
    const _loadPlanDataLazy = async (planSummary) => {
        if (!planSummary || !planSummary.id) return null;
        // Si el plan_data ya viene cargado (compat con tests / paths
        // legacy que pasan rows completos), no re-fetch.
        if (planSummary.plan_data && typeof planSummary.plan_data === 'object') {
            return planSummary.plan_data;
        }
        try {
            // [P6-SPEED-HIST-GETUSER · 2026-06-01] id de la sesión ya hidratada
            // (lectura síncrona, sin roundtrip). Pre-check barato: sin sesión
            // el endpoint devolvería 401 — preservamos el `return null`
            // silencioso del flujo legacy.
            const uid = session?.user?.id;
            if (!uid) return null;
            // [P1-NEON-DB-MIGRATION · 2026-06-12] GET backend con ownership
            // server-side (I2) — reemplaza el select directo de PostgREST
            // (la DB vive en Neon; el SDK anterior ya no la ve). 404 = plan
            // inexistente o ajeno → mismo manejo que el `maybeSingle` null
            // legacy: objeto vacío, sin toast de error.
            const res = await fetchWithAuth(`/api/plans-data/${planSummary.id}`);
            if (res.status === 404) return {};
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = await res.json();
            return (body && body.plan && body.plan.plan_data) || {};
        } catch (err) {
            console.error('Error cargando plan_data del plan:', err);
            toast.error('No se pudo cargar el detalle del plan');
            return null;
        }
    };

    // [P2-HIST-AUDIT-2 · 2026-05-09] Lazy fetch del detalle de
    // lecciones del plan. Cache per-plan_id evita re-fetch al volver
    // al tab. Sentinels 'loading' / 'error' permiten render del
    // estado intermedio sin re-disparar requests.
    const _ensureLessonsDetail = async (planId) => {
        if (!planId) return;
        const current = lessonsDetailCache[planId];
        // Si ya tenemos array (data cargada) o sentinel 'loading',
        // no re-fetch. Si tenemos 'error', re-fetch al click.
        if (Array.isArray(current) || current === 'loading') return;
        setLessonsDetailCache((prev) => ({ ...prev, [planId]: 'loading' }));
        try {
            const res = await getPlanLessonsDetail(planId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = await res.json();
            const lessons = Array.isArray(body && body.lessons) ? body.lessons : [];
            setLessonsDetailCache((prev) => ({ ...prev, [planId]: lessons }));
            // [P2-HIST-AUDIT-11 · 2026-05-09] Persist en singleton —
            // sobrevive cross-mount.
            setCachedEntry(historyCaches.lessonsDetail, planId, lessons);
        } catch (err) {
            console.error('Error cargando lessons detail:', err);
            setLessonsDetailCache((prev) => ({ ...prev, [planId]: 'error' }));
        }
    };

    const _ensureCoherenceHistory = async (planId) => {
        if (!planId) return;
        const current = coherenceHistoryCache[planId];
        if (Array.isArray(current) || current === 'loading') return;
        setCoherenceHistoryCache((prev) => ({ ...prev, [planId]: 'loading' }));
        try {
            const res = await getPlanCoherenceHistory(planId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = await res.json();
            const history = Array.isArray(body && body.history) ? body.history : [];
            setCoherenceHistoryCache((prev) => ({ ...prev, [planId]: history }));
            // [P2-HIST-AUDIT-11 · 2026-05-09] Persist en singleton.
            setCachedEntry(historyCaches.coherenceHistory, planId, history);
        } catch (err) {
            console.error('Error cargando coherence history:', err);
            setCoherenceHistoryCache((prev) => ({ ...prev, [planId]: 'error' }));
        }
    };

    // [P2-HIST-AUDIT-9 · 2026-05-09] Lazy fetch de reasons per-chunk.
    // Llamado solo al abrir el modal y solo cuando hay drift (chunks
    // pending_user_action/failed/exhausted > 0). Cache per-plan_id —
    // re-abrir el mismo plan no dispara una segunda request.
    const _ensureBlockedReasons = async (planId) => {
        if (!planId) return;
        const current = blockedReasonsCache[planId];
        if (Array.isArray(current) || current === 'loading') return;
        setBlockedReasonsCache((prev) => ({ ...prev, [planId]: 'loading' }));
        try {
            const res = await getPlanBlockedReasons(planId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = await res.json();
            const reasons = Array.isArray(body && body.reasons) ? body.reasons : [];
            setBlockedReasonsCache((prev) => ({ ...prev, [planId]: reasons }));
            // [P2-HIST-AUDIT-11 · 2026-05-09] Persist en singleton.
            setCachedEntry(historyCaches.blockedReasons, planId, reasons);
        } catch (err) {
            console.error('Error cargando blocked reasons:', err);
            setBlockedReasonsCache((prev) => ({ ...prev, [planId]: 'error' }));
        }
    };

    // [P2-HIST-AUDIT-10 · 2026-05-09] Lazy fetch de chunk metrics
    // (learning_metrics + plan_chunk_metrics joined). Disparado al
    // ACTIVAR el tab "Métricas" — evita request innecesaria si el
    // usuario solo mira el menú/lecciones/ajustes. Mismo patrón
    // sentinels que los otros caches.
    const _ensureChunkMetrics = async (planId) => {
        if (!planId) return;
        const current = chunkMetricsCache[planId];
        if (Array.isArray(current) || current === 'loading') return;
        setChunkMetricsCache((prev) => ({ ...prev, [planId]: 'loading' }));
        try {
            const res = await getPlanChunkMetrics(planId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = await res.json();
            const chunks = Array.isArray(body && body.chunks) ? body.chunks : [];
            setChunkMetricsCache((prev) => ({ ...prev, [planId]: chunks }));
            // [P2-HIST-AUDIT-11 · 2026-05-09] Persist en singleton.
            setCachedEntry(historyCaches.chunkMetrics, planId, chunks);
            // [P1-HIST-NEW-4 · 2026-05-09] Metadata paralela:
            // total_count + limit. Solo si vienen como números válidos
            // (deploy lag inverso con backend pre-fix → quedan como
            // undefined y el notice de truncado simplemente no
            // aparece). NO persistido en singleton — recalcularlo en
            // re-fetch es trivial y evita inflar el cache singleton
            // con metadata derivable.
            const _total = (typeof body.total_count === 'number' && body.total_count >= 0)
                ? body.total_count : null;
            const _limit = (typeof body.limit === 'number' && body.limit > 0)
                ? body.limit : null;
            if (_total !== null || _limit !== null) {
                setChunkMetricsMeta((prev) => ({
                    ...prev,
                    [planId]: { total_count: _total, limit: _limit },
                }));
            }
        } catch (err) {
            console.error('Error cargando chunk metrics:', err);
            setChunkMetricsCache((prev) => ({ ...prev, [planId]: 'error' }));
        }
    };

    // [P1-HIST-LIFETIME-LESSONS · 2026-05-09] Lazy fetch del surface
    // del aprendizaje continuo. Disparado al ACTIVAR el tab
    // "Lecciones" — paralelo a _ensureLessonsDetail (telemetría),
    // ambos endpoints pueblan sub-secciones distintas del mismo tab.
    //
    // Sentinel "current" check: a diferencia de los demás caches
    // donde una vez cargado el value es un array, aquí es un OBJETO
    // (con keys summary/history/critical_permanent/counts). El check
    // `current && typeof current === 'object' && !Array.isArray(current)
    // && current !== null` distingue "ya cargado" (objeto) de los
    // sentinels string ('loading' / 'error') o vacío (undefined).
    const _ensureLifetimeLessons = async (planId) => {
        if (!planId) return;
        const current = lifetimeLessonsCache[planId];
        const _isLoadedObject = current && typeof current === 'object'
            && !Array.isArray(current);
        if (_isLoadedObject || current === 'loading') return;
        setLifetimeLessonsCache((prev) => ({ ...prev, [planId]: 'loading' }));
        try {
            const res = await getPlanLifetimeLessons(planId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = await res.json();
            // Shape esperado: {plan_id, summary, history,
            // critical_permanent, counts}. Coerción defensiva por si
            // el backend cambia: cada sub-key cae a un default seguro.
            const payload = (body && typeof body === 'object') ? body : {};
            const normalized = {
                summary: (payload.summary && typeof payload.summary === 'object'
                    && !Array.isArray(payload.summary))
                    ? payload.summary : null,
                history: Array.isArray(payload.history) ? payload.history : [],
                critical_permanent: Array.isArray(payload.critical_permanent)
                    ? payload.critical_permanent : [],
                // [P0-HIST-LEARN-1 · 2026-05-09] Snapshot del último
                // chunk aprendido — se inyecta como semilla al PRÓXIMO
                // chunk del cron. Plan legacy sin la key responde null
                // y la sub-sección queda oculta.
                last_chunk_learning: (payload.last_chunk_learning
                    && typeof payload.last_chunk_learning === 'object'
                    && !Array.isArray(payload.last_chunk_learning))
                    ? payload.last_chunk_learning : null,
                // [P0-HIST-LEARN-2 · 2026-05-09] Counter de chunks
                // consecutivos generados sin feedback del usuario. Plan
                // legacy → null. generation_status complementa: cuando
                // el counter cruza ≥3, el cron flippea status a
                // 'degraded_pending_engagement' — el chip del header
                // diferencia "1-2 (info)" de "≥3 + degradado (alarm)".
                consecutive_zero_log_chunks: (typeof payload.consecutive_zero_log_chunks === 'number')
                    ? payload.consecutive_zero_log_chunks : null,
                generation_status: (typeof payload.generation_status === 'string'
                    && payload.generation_status.trim())
                    ? payload.generation_status : null,
                counts: (payload.counts && typeof payload.counts === 'object'
                    && !Array.isArray(payload.counts))
                    ? payload.counts : {},
            };
            setLifetimeLessonsCache((prev) => ({ ...prev, [planId]: normalized }));
            // Persist en singleton (cross-mount).
            setCachedLifetimeEntry(planId, normalized);
        } catch (err) {
            console.error('Error cargando lifetime lessons:', err);
            setLifetimeLessonsCache((prev) => ({ ...prev, [planId]: 'error' }));
        }
    };

    const handleRestoreRequest = () => {
        setConfirmRestore(selectedPlan);
    };

    const handleRestoreConfirm = async () => {
        // [P0-HIST-1 · 2026-05-09] Pasamos el row COMPLETO (no solo
        // `plan_data`) para que `restorePlanFromHistory` envíe el
        // `id` al endpoint backend y la cancelación de chunks /
        // release de locks ocurra atómicamente con el UPDATE.
        const planRow = confirmRestore;
        setConfirmRestore(null);
        setSelectedPlan(null);
        const toastId = toast.loading('Restaurando plan...');

        try {
            // [P2-HIST-RESTORE-ROW-UID · 2026-07-12] restorePlanFromHistory NO lanza en sus
            // fallos controlados (guard de ownership P1-NEW-8, endpoint no-ok) — RETORNA
            // {success:false,...}. Antes este handler mostraba "¡Plan reactivado!" + navigate
            // incondicionalmente → toasts contradictorios ("sesión inválida" + éxito) con el
            // dashboard sin restaurar (vivo 08:35Z). Ahora el resultado manda.
            const result = await restorePlanFromHistory(planRow);
            if (result && result.success === false) {
                console.error('Restore rechazado:', result);
                toast.error('No se pudo reactivar el plan', {
                    id: toastId,
                    description: result.error === 'ownership_mismatch'
                        ? 'Sesión inválida — recarga la página e intenta de nuevo.'
                        : 'Intenta de nuevo en unos segundos.'
                });
                return;
            }
            // [P0-HIST-CACHE-INVALIDATION · 2026-05-09] El plan source
            // post-restore tiene chunks pending/processing cancelados
            // por el endpoint atómico (P0-HIST-1) — los caches
            // (blockedReasons, chunkMetrics) reflejan el estado pre-
            // cancel y mentirían si el usuario reabre el modal del
            // source después.
            if (planRow && planRow.id) {
                invalidateCachesForPlan(planRow.id);
            }
            // [P3-HIST-LIST-CACHE · 2026-05-19] El restore cambia el
            // bucket temporal del plan (pasa a "activo"), el listado
            // cacheado mostraría el bucket viejo hasta el próximo fetch.
            invalidateHistoryListCache();
            toast.success('¡Plan reactivado!', {
                id: toastId,
                description: 'Tu dashboard se ha actualizado.'
            });
            navigate('/dashboard');
        } catch (err) {
            console.error('Error restoring plan:', err);
            toast.error('Error al restaurar el plan', { id: toastId });
        }
    };

    const handleDeleteConfirm = async () => {
        const plan = confirmDelete;
        setConfirmDelete(null);
        const toastId = toast.loading('Eliminando plan...');

        try {
            // [P0-HIST-3 · 2026-05-09] Endpoint atómico backend. Antes
            // este handler hacía `el cliente de DB anterior`
            // directo, dejando chunk_user_locks zombi (no tiene FK a
            // meal_plans, así que el CASCADE no los limpia) y orphans
            // en chunk_lesson_telemetry/chunk_deferrals. El endpoint
            // libera locks dentro de la misma transacción que el
            // DELETE; las FKs SET NULL agregadas por la migración
            // SSOT cubren la telemetría.
            const response = await deletePlanFromHistory(plan.id);
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body?.detail || `HTTP ${response.status}`);
            }

            setPlans(prev => prev.filter(p => p.id !== plan.id));
            if (selectedPlan?.id === plan.id) setSelectedPlan(null);
            // [P0-HIST-CACHE-INVALIDATION · 2026-05-09] Limpieza
            // explícita del singleton para el plan eliminado. TTL lo
            // recogería igual en 30 min, pero invalidar ya elimina
            // ~KBs de jsonb (chunkMetrics rico) reservados para un
            // plan que el usuario nunca volverá a abrir.
            invalidateCachesForPlan(plan.id);
            // [P3-HIST-LIST-CACHE · 2026-05-19] El cache del listado
            // contiene la fila eliminada; el próximo mount la mostraría
            // hasta que el fetch background la borre. Invalidar fuerza
            // re-fetch limpio + evita el flash "card aparece y desaparece".
            invalidateHistoryListCache();

            toast.success('Plan eliminado exitosamente', { id: toastId });
        } catch (err) {
            console.error('Error deleting plan:', err);
            toast.error('No se pudo eliminar el plan', { id: toastId });
        }
    };

    const handleEditSave = async (e, plan) => {
        e.stopPropagation();
        const trimmed = tempName.trim();
        if (!trimmed) {
            setIsEditing(null);
            return;
        }

        try {
            // [P1-HIST-5 · 2026-05-09] Endpoint atómico backend que
            // actualiza columna `name` Y `plan_data.name` (jsonb_set)
            // en el mismo UPDATE. Antes este handler solo actualizaba
            // la columna via el cliente anterior client → drift entre los dos
            // valores; cualquier flujo que copiara plan_data después
            // (swap, shift_plan, restore pre-P0-HIST-1) propagaba el
            // nombre viejo a otro contexto.
            const response = await renamePlan(plan.id, trimmed);
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body?.detail || `HTTP ${response.status}`);
            }

            // Mirror del UPDATE en state local: actualizar tanto la
            // columna `name` como `plan_data.name` para que la card y
            // los flujos posteriores (renderMealPreview, getStatusInfo,
            // _effectiveModifiedAt si plan_data.name aparece allí en
            // el futuro) vean el valor consistente sin esperar a que
            // se refresque desde DB.
            //
            // [P1-HIST-AUDIT-4 · 2026-05-09] Sello local de
            // `plan_modified_at` (summary key) y `_plan_modified_at`
            // (legacy nested) — el backend P1-HIST-AUDIT-2 lo sella en
            // DB; el optimistic update aquí permite que el sort
            // client-side (post _effectiveModifiedAt) suba el plan
            // renombrado a la cabeza sin esperar al próximo
            // fetchHistory. Re-sort post-map para que la card se
            // mueva visualmente.
            // [P2-HIST-RENAME-NO-PROMOTE · 2026-07-12] Espejo del guard backend: el sello
            // optimista de `plan_modified_at` aplica SOLO si el plan renombrado YA es el
            // activo (cabeza del sort). Sellar un ARCHIVADO lo subía a "PLAN ACTIVO"
            // visualmente (vivo: el owner renombró 'barniel' en un archivado y la card
            // activa cambió al instante — el backend ya NO sella, pero este optimistic
            // update replicaba el comportamiento viejo hasta el próximo refetch).
            const _modIso = new Date().toISOString();
            const _isActiveRename = Array.isArray(plans) && plans.length > 0
                && plans[0]?.id === plan.id;
            setPlans(prev => prev.map(p => {
                if (p.id !== plan.id) return p;
                return {
                    ...p,
                    name: trimmed,
                    ...(_isActiveRename ? { plan_modified_at: _modIso } : {}),
                    plan_data: p.plan_data
                        ? {
                            ...p.plan_data,
                            name: trimmed,
                            ...(_isActiveRename ? { _plan_modified_at: _modIso } : {}),
                        }
                        : p.plan_data,
                };
            }).sort((a, b) => _effectiveModifiedAt(b) - _effectiveModifiedAt(a)));
            // [P3-HIST-LIST-CACHE · 2026-05-19] El cache del listado
            // tiene el nombre viejo; sin invalidar, el próximo mount
            // mostraría el rename revertido visualmente hasta el fetch
            // background. Invalidación explícita = consistency inmediata.
            invalidateHistoryListCache();
            if (selectedPlan && selectedPlan.id === plan.id) {
                setSelectedPlan({
                    ...selectedPlan,
                    name: trimmed,
                    ...(_isActiveRename ? { plan_modified_at: _modIso } : {}),
                    plan_data: selectedPlan.plan_data
                        ? {
                            ...selectedPlan.plan_data,
                            name: trimmed,
                            ...(_isActiveRename ? { _plan_modified_at: _modIso } : {}),
                        }
                        : selectedPlan.plan_data,
                });
            }
            toast.success('Nombre actualizado');
        } catch (err) {
            console.error('Error al actualizar nombre', err);
            toast.error('Error al actualizar nombre');
        } finally {
            setIsEditing(null);
        }
    };

    // [P1-HIST-2 · 2026-05-09] Deriva el status del plan archivado
    // 100% client-side desde `plan_data`. Antes el historial mostraba
    // todos los planes idénticos: un plan donde se pidieron 30 días
    // pero solo se generaron 12 (chunks dead-lettered o usuario abandonó)
    // se veía igual que un plan completado — la card decía "30 días" pero
    // el modal solo tenía 12.
    //
    // 4 buckets:
    //   - 'failed': generation_status==='failed' o _recovery_exhausted_chunks
    //     no vacío. Plan sin contenido utilizable; la card alerta en rojo.
    //   - 'action_required': _user_action_required presente (banner CTA
    //     desde el backend). Plan tiene días pero hay chunks dead-lettered
    //     pendientes de regeneración manual.
    //   - 'partial': daysGenerated < totalDays sin failed/action. Plan
    //     incompleto pero utilizable; chip amber neutro.
    //   - 'complete': daysGenerated === totalDays (default si no hay
    //     metadata). No renderiza chip — no agregar ruido visual al
    //     happy path.
    //
    // El chip se renderiza en cardActions junto a las tags. El endpoint
    // `/{plan_id}/chunk-status` ofrece info más rica (failed_chunks,
    // tier_breakdown) pero invocarlo por cada plan visible dispara N
    // requests; queda como enrichment futuro (P2).
    const getStatusInfo = (plan) => {
        // [P1-HIST-AUDIT-4 · 2026-05-09] Acepta dos shapes:
        //   1. Summary del endpoint history-list (top-level keys
        //      `days_generated`, `total_days_requested`,
        //      `generation_status`, `recovery_exhausted_count`,
        //      `user_action_required`).
        //   2. Legacy row completo con `plan_data` nested.
        // El check del summary toma precedencia; el fallback legacy
        // mantiene compat con tests vitest y consumidores externos.
        const data = plan.plan_data || {};
        const days_legacy = Array.isArray(data.days) ? data.days : [];
        const daysGenerated = typeof plan.days_generated === 'number'
            ? plan.days_generated
            : days_legacy.length;

        // total_days_requested es el SSOT (lo persiste el backend al
        // crear el plan). Fallback a totalDays (campo legacy) y a
        // daysGenerated (planes muy viejos sin metadata explícita).
        const _candidates = [
            plan.total_days_requested,
            data.total_days_requested,
            data.totalDays,
        ];
        let totalDays = daysGenerated;
        for (const c of _candidates) {
            if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
                totalDays = c;
                break;
            }
        }

        const rawStatus = typeof plan.generation_status === 'string'
            ? plan.generation_status
            : (typeof data.generation_status === 'string'
                ? data.generation_status
                : null);
        const recoveryExhausted = (typeof plan.recovery_exhausted_count === 'number'
            ? plan.recovery_exhausted_count > 0
            : (Array.isArray(data._recovery_exhausted_chunks)
                && data._recovery_exhausted_chunks.length > 0));
        const _summaryActionReq = plan.user_action_required;
        const _legacyActionReq = data._user_action_required;
        const actionRequired = (
            (_summaryActionReq != null && _summaryActionReq !== false)
            || (_legacyActionReq != null && _legacyActionReq !== false)
        );
        // [P2-HIST-1 · 2026-05-09] Plan sin calories persistido → el
        // backend murió antes de calcular el resumen. Esa fila ahora
        // pasa el filter (post-P2-HIST-1) y debe verse al menos como
        // `partial` para que el chip del P1-HIST-2 alerte. Sin esto,
        // un plan completamente vacío con `daysGenerated=0` y
        // `totalDays=0` (ambos missing) caería al bucket `complete`
        // por la última rama del else.
        const hasCalories = typeof plan.calories === 'number' && plan.calories > 0;

        // [P2-HIST-AUDIT-1 · 2026-05-09] Bucket `unknown` para planes
        // legacy sin contenido procesable. Antes la última rama caía
        // a `complete` cuando:
        //   - hasCalories=true (no entra a `partial` por la regla
        //     `!hasCalories`).
        //   - daysGenerated=0 con totalDays=0 (no entra a `partial`
        //     por `totalDays > 0 && daysGenerated < totalDays`).
        //   - Sin generation_status, sin _user_action_required, sin
        //     _recovery_exhausted_chunks.
        // Resultado: planes muy viejos pre-rollout sin metadata, o
        // planes corruptos donde el row tiene calories pero el jsonb
        // `days` quedó como [] tras un wipe accidental, aparecían
        // como "Completo" — falso positivo. Con el bucket `unknown`,
        // el chip muestra "Sin datos" y comunica honestamente al
        // usuario que la card no tiene contenido visible.
        //
        // [P0-HIST-IN-PROGRESS · 2026-05-09] Bucket `in_progress`
        // para planes generándose en background. Fuente: rawStatus
        // ∈ {generating, generating_next, rolling} Y queue tiene
        // chunks `pending`/`processing`/`stale` (in_flight > 0).
        //
        // Antes (audit 2026-05-09): un plan healthy con 2/15 días
        // generados y 13 chunks corriendo en background caía a
        // `partial` por la regla `(totalDays > 0 && daysGenerated <
        // totalDays)`. La card mostraba "Parcial 2/15" idéntico a un
        // plan abandonado. Sin reconciliación a action_required (los
        // chunks NO están bloqueados, están corriendo) el usuario no
        // tenía cómo distinguir "se está generando" de "se atascó".
        //
        // Reconciliación posterior NO degrada: si counter
        // pending_user_action > 0 o failed > 0, el bucket se eleva a
        // action_required (más severo que in_progress). Solo cuando
        // todos los chunks están sanos (in_flight) este bucket
        // sobrevive.
        const _embeddedInFlight = (typeof plan.chunk_in_flight_count === 'number')
            ? plan.chunk_in_flight_count
            : null;
        const _summaryEntryForInFlight = (_embeddedInFlight === null && chunkStatusSummary && plan && plan.id)
            ? chunkStatusSummary[plan.id]
            : null;
        const _inFlightCount = _embeddedInFlight !== null
            ? _embeddedInFlight
            : (_summaryEntryForInFlight && typeof _summaryEntryForInFlight.in_flight_count === 'number'
                ? _summaryEntryForInFlight.in_flight_count
                : 0);
        const _isGeneratingStatus = (
            rawStatus === 'generating'
            || rawStatus === 'generating_next'
            || rawStatus === 'rolling'
        );

        let bucket; // 'complete' | 'partial' | 'failed' | 'action_required' | 'in_progress' | 'unknown'
        if (rawStatus === 'failed' || recoveryExhausted) {
            bucket = 'failed';
        } else if (actionRequired) {
            bucket = 'action_required';
        } else if (_isGeneratingStatus && _inFlightCount > 0) {
            bucket = 'in_progress';
        } else if (
            rawStatus === 'partial' ||
            rawStatus === 'complete_partial' ||
            rawStatus === 'rolling' ||
            (totalDays > 0 && daysGenerated < totalDays) ||
            !hasCalories
        ) {
            bucket = 'partial';
        } else if (daysGenerated === 0) {
            // hasCalories=true pero days=[] y sin metadata declarando
            // total_days_requested → no podemos saber si está
            // completo ni cuánto falta. Caso edge legacy.
            bucket = 'unknown';
        } else {
            bucket = 'complete';
        }

        // [P0-AUDIT-HIST-2 · 2026-05-09] Reconciliación con la fuente
        // operativa (`plan_chunk_queue`). Solo
        // `_escalate_unrecoverable_chunk` (cron_tasks.py:7928) escribe
        // `_user_action_required` en plan_data; las 6 rutas que setean
        // `status='pending_user_action'` por pausa pantry/tz/missing-
        // lessons NO actualizan plan_data → drift donde el chunk está
        // bloqueado pero el bucket de la card sale `complete`/`partial`
        // y el banner CTA jamás aparece.
        //
        // [P1-AUDIT-HIST-4 · 2026-05-09] Fuente preferida = los
        // counters embebidos en el plan (`chunk_pending_user_action_count`,
        // `chunk_failed_count`) que ahora vienen del LEFT JOIN del
        // backend en el mismo response del listado. Sin race condition
        // con el endpoint summary (que se podía desincronizar entre
        // las dos requests). Si los counters embebidos no están
        // (response legacy de un backend pre-P1-AUDIT-HIST-4), fallback
        // al `chunkStatusSummary` (P0-AUDIT-HIST-2). Si tampoco está,
        // bucket queda con su valor plan_data-derived.
        //
        // Reglas (solo elevar, nunca degradar):
        //   - Si ya es `failed` o `action_required` → mantener.
        //   - Si counter pending_user_action > 0 → `action_required`.
        //   - Si counter failed > 0 (sin que plan_data lo declare) →
        //     `action_required`. El recovery cron pudo dejar un chunk
        //     en `failed` antes de propagar el flag al jsonb.
        if (bucket !== 'failed' && bucket !== 'action_required') {
            // Source 1 (preferred): counters embebidos del plan.
            const _embeddedPuac = typeof plan.chunk_pending_user_action_count === 'number'
                ? plan.chunk_pending_user_action_count
                : null;
            // [P0-HIST-NEW-1 · 2026-05-09] Preferimos
            // `chunk_failed_unreplaced_count` sobre `chunk_failed_count`.
            // El índice parcial `ux_plan_chunk_queue_live_week` permite
            // coexistencia `completed` + `failed` para misma (plan, week)
            // — típicamente cuando un chunk completó días, fue
            // re-encolado (post-swap revalidation, manual retry) y el
            // segundo intento dead-letteró. La fila `failed` queda como
            // residuo informativo pero los días YA están en plan_data
            // vía la fila completed hermana → elevar a `action_required`
            // por estos residuos hace que el chip rojo "Acción" aparezca
            // indefinidamente en planes 30/30 sanos. El fallback al
            // legacy `chunk_failed_count` cubre deploy lag (backend
            // pre-P0-HIST-NEW-1 que no devuelve la nueva key).
            const _embeddedFcUnreplaced = typeof plan.chunk_failed_unreplaced_count === 'number'
                ? plan.chunk_failed_unreplaced_count
                : null;
            const _embeddedFc = typeof plan.chunk_failed_count === 'number'
                ? plan.chunk_failed_count
                : null;
            const _hasEmbedded = _embeddedPuac !== null
                || _embeddedFcUnreplaced !== null
                || _embeddedFc !== null;

            // Source 2 (fallback): summary endpoint (P0-AUDIT-HIST-2).
            const _summaryEntry = (!_hasEmbedded && chunkStatusSummary && plan && plan.id)
                ? chunkStatusSummary[plan.id]
                : null;

            const _puac = _embeddedPuac !== null
                ? _embeddedPuac
                : (_summaryEntry && typeof _summaryEntry.pending_user_action_count === 'number'
                    ? _summaryEntry.pending_user_action_count
                    : 0);
            // [P0-HIST-NEW-1 · 2026-05-09] Cascada: embedded unreplaced
            // → summary unreplaced → embedded total → summary total → 0.
            // Los dos primeros son la fuente correcta post-fix; los dos
            // últimos cubren backend legacy.
            const _fc = (() => {
                if (_embeddedFcUnreplaced !== null) return _embeddedFcUnreplaced;
                if (_summaryEntry
                    && typeof _summaryEntry.failed_unreplaced_count === 'number') {
                    return _summaryEntry.failed_unreplaced_count;
                }
                if (_embeddedFc !== null) return _embeddedFc;
                if (_summaryEntry
                    && typeof _summaryEntry.failed_count === 'number') {
                    return _summaryEntry.failed_count;
                }
                return 0;
            })();

            if (_puac > 0 || _fc > 0) {
                bucket = 'action_required';
            }
        }

        return { bucket, daysGenerated, totalDays };
    };

    // [P3-HIST-ACTIVE-CHIP · 2026-05-18] Bucket temporal del plan
    // (ortogonal a `getStatusInfo`, que clasifica el estado de
    // GENERACIÓN). El historial muestra todos los planes mezclados,
    // pero solo UNO suele estar "vivo" (la fecha de hoy cae dentro
    // de su ventana). Sin un chip que lo marque, el usuario no
    // distingue de un vistazo cuál plan está rigiendo ahora.
    //
    // Fuente preferida: `grocery_start_date` (fecha date-only del
    // ciclo de compras, resuelta por el cron `_resolve_grocery_start_date`
    // o por POST /grocery-start-date). Fallback: `cycle_start_date`
    // (fecha inmutable del primer día del plan original). Último
    // fallback: `plan.created_at` (timestamp del INSERT).
    //
    // Ventana: [start, start + totalDays). Resolución por DÍA local
    // del usuario (igual que P3-SHIFT-DATEONLY-LOCAL · 2026-05-18 +
    // `_parseStartLocal` de Dashboard.jsx) — date-only strings
    // semánticamente significan "calendario local", NUNCA UTC.
    //
    // Devuelve null cuando no podemos resolver totalDays > 0 (plan
    // legacy sin metadata, plan corrupto) — el chip se omite en vez
    // de mostrar info incorrecta.
    const getTemporalStatus = (plan) => {
        if (!plan) return null;
        const _info = getStatusInfo(plan);
        const totalDays = _info.totalDays;
        if (!Number.isFinite(totalDays) || totalDays <= 0) return null;

        // Fallback chain del start. `grocery_start_date` y
        // `cycle_start_date` ahora vienen top-level del summary
        // (P3-HIST-ACTIVE-CHIP backend). Legacy: leer del plan_data
        // anidado (planes lazy-cargados via _loadPlanDataLazy).
        const startRaw = plan.grocery_start_date
            || plan.cycle_start_date
            || (plan.plan_data && (plan.plan_data.grocery_start_date || plan.plan_data.cycle_start_date))
            || plan.created_at;
        if (!startRaw || typeof startRaw !== 'string') return null;

        // Detect date-only `YYYY-MM-DD` para parsear como fecha
        // LOCAL del usuario (cero TZ dance — espeja
        // P3-SHIFT-DATEONLY-LOCAL del backend). Timestamps con TZ
        // se parsean directos y se truncan a su fecha local.
        let startMid;
        const _dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(startRaw);
        if (_dateOnly) {
            const [y, m, d] = startRaw.split('-').map((s) => parseInt(s, 10));
            startMid = new Date(y, m - 1, d, 0, 0, 0, 0);
        } else {
            const parsed = new Date(startRaw);
            if (Number.isNaN(parsed.getTime())) return null;
            startMid = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
        }

        const now = new Date();
        const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const _msPerDay = 86400000;
        const dayIdx = Math.round((todayMid.getTime() - startMid.getTime()) / _msPerDay);

        if (dayIdx < 0) return { bucket: 'future', dayIdx, totalDays };
        if (dayIdx >= totalDays) return { bucket: 'past', dayIdx, totalDays };
        return { bucket: 'active', dayIdx, totalDays };
    };

    // [P2-HIST-3 · 2026-05-09] Etiqueta retroactiva de semanas
    // simplificadas. `plan_data._user_forced_simplified_weeks` es un
    // dict `{ "<week_number>": "<iso_ts>" }` que el backend persiste
    // cuando el usuario fuerza modo simplificado para un chunk
    // dead-lettered (P3-2). Antes solo el Dashboard del plan ACTIVO
    // mostraba el banner sutil; aquí lo surface retroactivamente
    // para planes archivados.
    //
    // Devuelve null cuando no hay semanas simplificadas (chip se
    // omite). Para 1-2 semanas listas las numera ("S3 simplif." /
    // "S2, S3 simplif."); para 3+ usa contador agregado
    // ("3 sem. simplif.") para no romper el layout horizontal.
    //
    // Sin callsite activo (el chip se retiró del card layout), pero el
    // helper es anchor de los tests parser-based
    // History.simplified_weeks_badge.test.js y
    // History.audit_4_summary_endpoint.test.js — NO eliminar sin
    // actualizar esos tests.
    // eslint-disable-next-line no-unused-vars
    const getSimplifiedWeeksLabel = (plan) => {
        if (!plan) return null;
        // [P1-HIST-AUDIT-4 · 2026-05-09] Summary expone
        // `user_forced_simplified_weeks` top-level (jsonb crudo).
        // Legacy expone via `plan.plan_data._user_forced_simplified_weeks`.
        const raw = plan.user_forced_simplified_weeks
            || (plan.plan_data && plan.plan_data._user_forced_simplified_weeks);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        // Solo claves numéricas válidas. Backend usa string keys
        // (jsonb_set convierte el path a text), filtramos defensivo.
        const weeks = Object.keys(raw)
            .map((k) => parseInt(k, 10))
            .filter((n) => Number.isFinite(n) && n > 0)
            .sort((a, b) => a - b);
        if (weeks.length === 0) return null;
        if (weeks.length === 1) return `S${weeks[0]} simplif.`;
        if (weeks.length === 2) return `S${weeks[0]}, S${weeks[1]} simplif.`;
        return `${weeks.length} sem. simplif.`;
    };

    // [P2-HIST-4 · 2026-05-09] Conteo de ajustes de coherencia
    // recetas↔lista hechos por el sistema en este plan. Lee
    // `plan_data._shopping_coherence_block_history` (P3-NEW-C —
    // append-only, cap 20). Solo cuenta entries "anomalous":
    //   - `degrade` / `reject_minor` / `reject_high`: el sistema
    //     bloqueó+corrigió una divergencia real (recipes→list).
    //   - `hydration_error`: bug del consumer (block_set=True pero
    //     action_taken quedó None hasta que el fallback lo hidrató).
    // Excluye:
    //   - `not_applicable`: warn-only, block_set=False (no es ajuste,
    //     es info pura).
    //   - `post_swap_revalidation` (P2-B): observability tras swap;
    //     el cron P3-B explícitamente lo trata como NO anomalous.
    //   - null: invariante violado (combinación reservada error).
    const getCoherenceAdjustsCount = (plan) => {
        if (!plan) return 0;
        // [P1-HIST-AUDIT-4 · 2026-05-09] Summary trae
        // `coherence_adjusts_count` pre-calculado server-side
        // (whitelist: degrade / reject_minor / reject_high /
        // hydration_error). Legacy itera el array completo. Si el
        // summary lo provee, confiamos en él (single source of truth
        // — coherente con el SQL del endpoint).
        if (typeof plan.coherence_adjusts_count === 'number') {
            return plan.coherence_adjusts_count;
        }
        const data = plan.plan_data;
        if (!data || typeof data !== 'object') return 0;
        const history = data._shopping_coherence_block_history;
        if (!Array.isArray(history)) return 0;
        let count = 0;
        for (const entry of history) {
            if (!entry || typeof entry !== 'object') continue;
            // [P2-HIST-AUDIT-13 · 2026-05-09] Helper canónico desde
            // `utils/coherenceActions.js`. Antes había 4 string
            // literals inline encadenados con `||`; cualquier
            // adición al catálogo requería tocar este sitio Y el
            // backend. Ahora el SSOT vive en `constants.py` (Python)
            // mirror'd en `coherenceActions.js` (JS); drift
            // detection cross-archivo en tests.
            if (isAnomalousCoherenceAction(entry.action_taken)) {
                count++;
            }
        }
        return count;
    };

    // Sin callsite activo tras el rediseño de cards, pero anchor del test
    // parser-based History.audit_4_summary_endpoint.test.js ('const getSmartTags')
    // — NO eliminar sin actualizar ese test.
    // eslint-disable-next-line no-unused-vars
    const getSmartTags = (plan) => {
        // [P1-HIST-AUDIT-4 · 2026-05-09] Summary trae goal/diet/
        // allergies pre-extraídos top-level. Legacy los lee del
        // plan_data.{root or assessment}. Mismo fallback chain del SQL
        // backend (`api_plans_history_list`).
        const data = plan.plan_data || {};
        const assessment = data.assessment || {};
        const tags = [];

        const goal = plan.goal
            || data.goal
            || assessment.mainGoal;
        if (goal === 'lose_weight') tags.push('Pérdida de Grasa');
        else if (goal === 'build_muscle') tags.push('Masa Muscular');
        else if (goal === 'maintain') tags.push('Mantener');
        else if (goal === 'health') tags.push('Salud General');

        const diet = plan.diet_preference
            || data.diet_preference
            || assessment.diet_preference
            || assessment.dietPreference
            || assessment.dietType;
        if (diet && diet !== 'none' && diet !== 'Omnívoro' && diet !== 'omnivorous') {
            const dietMap = { 'vegetarian': 'Vegetariano', 'vegan': 'Vegano', 'pescatarian': 'Pescatariano', 'keto': 'Keto', 'paleo': 'Paleo' };
            tags.push(dietMap[diet] || (diet.charAt(0).toUpperCase() + diet.slice(1)));
        }

        const allergies = (Array.isArray(plan.allergies) && plan.allergies)
            || data.allergies
            || assessment.allergies
            || assessment.intolerances
            || [];
        if (Array.isArray(allergies)) {
            if (allergies.includes('lactose') || allergies.includes('dairy')) tags.push('Sin Lácteos');
            if (allergies.includes('gluten')) tags.push('Sin Gluten');
            if (allergies.includes('nuts')) tags.push('Sin Nueces');
            if (allergies.includes('shellfish')) tags.push('Sin Mariscos');
            if (allergies.includes('soy')) tags.push('Sin Soya');
        }

        return tags.slice(0, 3);
    };

    // Meal preview helper
    // [P3-HIST-DESKTOP-REDESIGN · 2026-06-24] Apertura del modal de detalle —
    // extraída del onClick inline de la card para reusarla desde el panel de PC.
    // Misma lógica: optimistic open con el summary + lazy-fetch de plan_data +
    // ensure de blocked-reasons si hay drift de chunks.
    const openPlanModal = (plan) => {
        setSelectedDay(0);
        setActiveChunkIdx(0);
        setActiveModalTab('menu');
        const _hasInlinePlanData = !!(plan.plan_data && typeof plan.plan_data === 'object' && Array.isArray(plan.plan_data.days));
        setSelectedPlan({ ...plan, plan_data: _hasInlinePlanData ? plan.plan_data : null });
        const _puac = (typeof plan.chunk_pending_user_action_count === 'number') ? plan.chunk_pending_user_action_count : 0;
        const _fc = (typeof plan.chunk_failed_count === 'number') ? plan.chunk_failed_count : 0;
        const _exh = (typeof plan.recovery_exhausted_count === 'number') ? plan.recovery_exhausted_count : 0;
        const _inFlight = (typeof plan.chunk_in_flight_count === 'number') ? plan.chunk_in_flight_count : 0;
        if (_puac > 0 || _fc > 0 || _exh > 0 || _inFlight > 0) {
            _ensureBlockedReasons(plan.id);
        }
        if (!_hasInlinePlanData) {
            setPlanDataLoading(true);
            _loadPlanDataLazy(plan).then((fullPlanData) => {
                setPlanDataLoading(false);
                if (fullPlanData == null) return;
                setSelectedPlan((prev) => {
                    if (!prev || prev.id !== plan.id) return prev;
                    return { ...prev, plan_data: fullPlanData };
                });
            }).catch(() => setPlanDataLoading(false));
        }
    };

    // Sin callsite activo tras el rediseño de cards, pero anchor del test
    // parser-based History.audit_4_summary_endpoint.test.js
    // ('const renderMealPreview') — NO eliminar sin actualizar ese test.
    // eslint-disable-next-line no-unused-vars
    const renderMealPreview = (plan) => {
        // [P1-HIST-AUDIT-4 · 2026-05-09] Summary trae `preview_meals`
        // top-level (max 4, solo {name, meal}). Legacy deriva del
        // plan_data.days[0].meals. Si el summary lo provee no
        // necesitamos `plan_data` en el listado — clave del ahorro
        // de bandwidth (no se descarga el blob jsonb completo).
        const summaryPreview = Array.isArray(plan.preview_meals) ? plan.preview_meals : null;
        const meals = summaryPreview
            || plan.plan_data?.days?.[0]?.meals
            || plan.plan_data?.meals
            || plan.plan_data?.perfectDay
            || [];
        // [P4-HIST-ARRAY-GUARD] Array.isArray: un plan_data.meals/perfectDay no-array (legacy)
        // lanzaba TypeError en .filter y tumbaba el render del listado.
        const activeMeals = (Array.isArray(meals) ? meals : []).filter(m => m.name && !m.isSkipped);

        return (
            <div className={styles.mealPreviewContainer}>
                {activeMeals.slice(0, 3).map((m, i) => {
                    const shortName = m.name.length > 20 ? m.name.substring(0, 18) + '…' : m.name;
                    return (
                        <div key={i} className={styles.mealPreviewBadge}>
                            <span>{mealEmojiFor(m.meal)}</span>
                            <span className={styles.mealPreviewText}>{shortName}</span>
                        </div>
                    );
                })}
                {activeMeals.length > 3 && (
                    <div className={styles.mealPreviewBadgeMore}>
                        +{activeMeals.length - 3}
                    </div>
                )}
            </div>
        );
    };

    // Skeleton Loader
    const SkeletonLoader = () => (
        <div className={styles.skeletonGrid}>
            {[1, 2, 3].map(i => (
                <div key={i} className={styles.skeletonCard}>
                    <div className={styles.skeletonIcon} />
                    <div className={styles.skeletonLines}>
                        <div className={`${styles.skeletonLine} ${styles.skeletonLineLong}`} />
                        <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
                    </div>
                    <div className={styles.skeletonBadge} />
                </div>
            ))}
        </div>
    );

    // Empty State
    // [P3-HIST-EMPTY-CTA · 2026-07-02] El estado vacío decía QUÉ hacer ("genera tu
    // primer plan") pero no daba CÓMO — sin acción, en móvil era una caja muerta.
    // CTA directo al formulario, mismo look .emptyCta del SessionExpiredState.
    // [P3-12 · 2026-07-09] role="status": paridad a11y con el EmptyState común
    // (components/common/EmptyState.jsx) — el SR anuncia el estado vacío. La
    // consolidación visual completa queda diferida (los locales usan el look
    // .emptyState/.emptyCta propio del Historial; unificar es decisión de producto).
    const EmptyState = () => (
        <div className={styles.emptyState} role="status">
            <div className={styles.emptyIcon}>
                <BookOpen size={32} />
            </div>
            <h3 className={styles.emptyTitle}>Tu historial está vacío</h3>
            <p className={styles.emptyText}>
                Genera tu primer plan nutricional y lo encontrarás aquí.
            </p>
            <button className={styles.emptyCta} onClick={() => navigate('/assessment')}>
                Crear mi primer plan <ChevronRight size={17} />
            </button>
        </div>
    );

    // [P2-HISTORY-401-GRACEFUL · 2026-06-21] Sesión expirada (401): "inicia sesión"
    // en vez del toast rojo "No se pudo cargar el historial".
    const SessionExpiredState = () => (
        <div className={styles.emptyState} role="status">
            <div className={styles.emptyIcon}>
                <AlertTriangle size={36} />
            </div>
            <h3 className={styles.emptyTitle}>Sesión expirada</h3>
            <p className={styles.emptyText}>
                Tu sesión finalizó. Inicia sesión de nuevo para ver tu historial.
            </p>
            <button className={styles.emptyCta} onClick={() => navigate('/login')}>
                Iniciar sesión
            </button>
        </div>
    );

    // [P1-HIST-ACTIVE-IDENTITY · 2026-05-31] El plan "activo" es EL plan
    // actual (el más reciente por `_effectiveModifiedAt` — mismo criterio
    // que el backend usa para resolver el plan vivo y que el Dashboard
    // carga en `planData`), y SOLO si tiene contenido utilizable.
    //
    // Pre-fix el chip "Activo" (y el ocultar "Reactivar") eran puramente
    // TEMPORALES (hoy ∈ ventana de fechas del plan). Eso producía dos bugs
    // reportados por el usuario:
    //   1. Un plan INCOMPLETO sin menú (days_generated=0, generation_status
    //      'partial'/'failed' tras agotarse los créditos de Gemini) cuya
    //      ventana incluye hoy salía "Activo" — aunque el Dashboard decía
    //      "Tu plan quedó incompleto" y "Tu Menú"/"Recetas" estaban vacíos.
    //   2. Al crear un plan nuevo, el anterior — si su ventana de fechas
    //      solapaba hoy — seguía saliendo "Activo" Y sin botón "Reactivar",
    //      así que el usuario no podía reactivarlo.
    // Anclar a la IDENTIDAD del plan actual garantiza que solo UNO esté
    // activo a la vez, que los anteriores queden inactivos (reactivables),
    // y que el actual recupere "Activo" automáticamente en cuanto se le
    // generen días (req. del usuario: "si se vuelve a generar platos en Tu
    // menú y recetas, ahí sí se debe volver a activar automáticamente").
    // Se deriva de la lista completa `plans` (no de la lista filtrada por
    // búsqueda) para que la búsqueda no cambie quién es el plan actual.
    // [P3-HIST-SEARCH-MEMO · 2026-05-31] useMemo: el reduce + los Date.parse de
    // `_effectiveModifiedAt` (hasta 2-4 por plan por comparación) solo corren
    // cuando `plans` cambia — no en cada keystroke del buscador.
    const currentPlanId = useMemo(
        () => plans.length > 0
            ? plans.reduce(
                (best, p) => (!best || _effectiveModifiedAt(p) > _effectiveModifiedAt(best)) ? p : best,
                null,
            )?.id
            : null,
        [plans],
    );

    // [P3-HIST-DESKTOP-REDESIGN · 2026-06-24] El plan "activo" del panel de PC
    // (el hero) = el plan actual SOLO si tiene contenido utilizable (≥1 día
    // generado y no fallido) — mismo criterio que el chip "Activo" de la lista.
    const activePlanId = useMemo(() => {
        if (!currentPlanId) return null;
        const cp = plans.find((p) => p.id === currentPlanId);
        if (!cp) return null;
        const info = getStatusInfo(cp);
        return (info.daysGenerated > 0 && info.bucket !== 'failed') ? currentPlanId : null;
    }, [currentPlanId, plans]);

    return (
        <>
            {loading ? (
                <SkeletonLoader />
            ) : sessionExpired ? (
                <SessionExpiredState />
            ) : plans.length === 0 ? (
                <EmptyState />
            ) : isDesktop ? (
                /* [P3-HIST-DESKTOP-REDESIGN · 2026-06-24] Panel de PC (diseño del
                   owner). Móvil sigue con la lista compacta de abajo. El modal de
                   detalle (más abajo) lo abre `openPlanModal`. */
                <HistoryDesktopPanel
                    plans={plans}
                    total={plans.length}
                    activePlanId={activePlanId}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    onOpen={openPlanModal}
                    onEdit={(raw) => { setIsEditing(raw.id); setTempName(raw.name || 'Plan Generado'); }}
                    onDelete={(raw) => setConfirmDelete(raw)}
                    editingId={isEditing}
                    tempName={tempName}
                    setTempName={setTempName}
                    onEditSave={(raw) => handleEditSave({ stopPropagation: () => {} }, raw)}
                    onEditCancel={() => { setIsEditing(null); setTempName(''); }}
                />
            ) : (
                /* [P3-HIST-MOBILE-REDESIGN · 2026-06-24] Panel de móvil (diseño del
                   owner): edge-to-edge, datos/handlers reales, SVGs actuales. El
                   modal de detalle (más abajo) lo abre `openPlanModal`. */
                <HistoryMobilePanel
                    plans={plans}
                    total={plans.length}
                    activePlanId={activePlanId}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    onOpen={openPlanModal}
                    onEdit={(raw) => { setIsEditing(raw.id); setTempName(raw.name || 'Plan Generado'); }}
                    onDelete={(raw) => setConfirmDelete(raw)}
                    editingId={isEditing}
                    tempName={tempName}
                    setTempName={setTempName}
                    onEditSave={(raw) => handleEditSave({ stopPropagation: () => {} }, raw)}
                    onEditCancel={() => { setIsEditing(null); setTempName(''); }}
                />
            )}

            {/* --- MODAL DE DETALLES --- */}
            <AnimatePresence>
                {selectedPlan && (
                    <motion.div
                        className={styles.modalOverlay}
                        onClick={() => setSelectedPlan(null)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            ref={detailModalRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="history-detail-title"
                            tabIndex={-1}
                            className={styles.modalContent}
                            onClick={e => e.stopPropagation()}
                            initial={{ scale: 0.9, opacity: 0, y: 30 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 30 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        >
                            {/* Header */}
                            <div className={styles.modalHeader}>
                                <div>
                                    <h2 id="history-detail-title" className={styles.modalTitle}>{selectedPlan.name || 'Detalles del Plan'}</h2>
                                    <span className={styles.modalDate}>
                                        {new Date(selectedPlan.created_at).toLocaleDateString('es-DO', {
                                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                                        })}
                                    </span>
                                </div>
                                <button onClick={() => setSelectedPlan(null)} className={styles.closeButton}>
                                    <X size={24} color="#64748B" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className={styles.modalBody}>

                                {/* [P2-HIST-2 · 2026-05-09] Banner action_required.
                                    El chip rojo "Acción" en la card (P1-HIST-2)
                                    señaliza el problema; este banner lo explica
                                    dentro del modal. Lee `_user_action_required`
                                    (preformateado por el backend en
                                    `_escalate_unrecoverable_chunk` con
                                    title/body/cta/url/chunk_id/reason) +
                                    `_recovery_exhausted_chunks` para count.
                                    El CTA real ("Reactivar este Plan") sigue
                                    en el modalFooter — ese flujo lleva al
                                    Dashboard donde la lógica de regen ya
                                    existe (P1-CHUNKS-1). */}
                                {(() => {
                                    const _pd = selectedPlan.plan_data || {};
                                    const _actionReq = _pd._user_action_required;
                                    const _exhausted = Array.isArray(_pd._recovery_exhausted_chunks)
                                        ? _pd._recovery_exhausted_chunks
                                        : [];
                                    const _hasAction = _actionReq != null && _actionReq !== false;
                                    // [P0-AUDIT-HIST-2 · 2026-05-09] Si plan_data
                                    // está limpio pero la queue tiene chunks
                                    // bloqueados (drift documentado en el
                                    // endpoint), renderizamos un banner con copy
                                    // fallback. Sin esto, el chip de la card
                                    // (elevado a `action_required` por la
                                    // reconciliación) era contradicho por un
                                    // modal sin banner — UX incoherente.
                                    //
                                    // [P1-AUDIT-HIST-4 · 2026-05-09] Lectura
                                    // preferida desde counters embebidos en el
                                    // plan (response del LEFT JOIN); fallback
                                    // al summary endpoint. Mismo patrón que
                                    // getStatusInfo para coherencia.
                                    const _embeddedPuac = (typeof selectedPlan.chunk_pending_user_action_count === 'number')
                                        ? selectedPlan.chunk_pending_user_action_count
                                        : null;
                                    // [P0-HIST-NEW-1 · 2026-05-09] Mismo
                                    // criterio que getStatusInfo: preferimos
                                    // `chunk_failed_unreplaced_count` para
                                    // que el banner NO dispare por residuos
                                    // failed con sibling completed (mismo
                                    // (plan, week) tiene fila completed que
                                    // ya cubre los días → no requiere acción).
                                    const _embeddedFailedUnreplaced = (typeof selectedPlan.chunk_failed_unreplaced_count === 'number')
                                        ? selectedPlan.chunk_failed_unreplaced_count
                                        : null;
                                    const _embeddedFailed = (typeof selectedPlan.chunk_failed_count === 'number')
                                        ? selectedPlan.chunk_failed_count
                                        : null;
                                    const _hasEmbeddedCounters = _embeddedPuac !== null
                                        || _embeddedFailedUnreplaced !== null
                                        || _embeddedFailed !== null;
                                    const _summaryEntry = (!_hasEmbeddedCounters && chunkStatusSummary)
                                        ? chunkStatusSummary[selectedPlan.id]
                                        : null;
                                    const _queuePuac = _embeddedPuac !== null
                                        ? _embeddedPuac
                                        : ((_summaryEntry && typeof _summaryEntry.pending_user_action_count === 'number')
                                            ? _summaryEntry.pending_user_action_count
                                            : 0);
                                    // Cascada: embedded unreplaced →
                                    // summary unreplaced → embedded total →
                                    // summary total → 0.
                                    const _queueFailed = (() => {
                                        if (_embeddedFailedUnreplaced !== null) return _embeddedFailedUnreplaced;
                                        if (_summaryEntry
                                            && typeof _summaryEntry.failed_unreplaced_count === 'number') {
                                            return _summaryEntry.failed_unreplaced_count;
                                        }
                                        if (_embeddedFailed !== null) return _embeddedFailed;
                                        if (_summaryEntry
                                            && typeof _summaryEntry.failed_count === 'number') {
                                            return _summaryEntry.failed_count;
                                        }
                                        return 0;
                                    })();
                                    const _hasQueueDrift = (_queuePuac > 0 || _queueFailed > 0)
                                        && !_hasAction
                                        && _exhausted.length === 0;
                                    if (!_hasAction && _exhausted.length === 0 && !_hasQueueDrift) return null;

                                    // Defensa contra payloads inesperados:
                                    // accept solo strings, fallback a copy
                                    // genérico. Sin esto, un title que sea un
                                    // objeto rompería el render.
                                    const _title = (_hasAction && typeof _actionReq.title === 'string'
                                        && _actionReq.title.trim())
                                        ? _actionReq.title
                                        : 'Acción requerida';
                                    // [P0-AUDIT-HIST-2 · 2026-05-09] Body
                                    // fallback específico para queue drift —
                                    // explica al usuario qué tipo de acción se
                                    // espera (regenerar el plan) sin pretender
                                    // un detalle que plan_data no tiene.
                                    const _queueDriftBody = _hasQueueDrift
                                        ? `Detectamos ${_queuePuac + _queueFailed} chunk(s) bloqueado(s) en la cola. Reactiva este plan o regéneralo para que el sistema retome la generación.`
                                        : null;
                                    const _body = (_hasAction && typeof _actionReq.body === 'string'
                                        && _actionReq.body.trim())
                                        ? _actionReq.body
                                        : _queueDriftBody;
                                    const _reason = (_hasAction && typeof _actionReq.reason === 'string'
                                        && _actionReq.reason.trim())
                                        ? _actionReq.reason
                                        : null;

                                    // [P2-HIST-AUDIT-7 · 2026-05-09] CTA
                                    // configurable desde el backend. Si
                                    // `_actionReq.cta` (label string) Y
                                    // `_actionReq.url` (path relativo SAFE)
                                    // están presentes, renderizamos un botón
                                    // que navega allá vía useNavigate.
                                    //
                                    // Antes el copy estaba hardcoded ("Pulsa
                                    // Reactivar este Plan abajo…") — si el
                                    // backend cambiaba el deeplink (e.g.,
                                    // directo a regen-chunk endpoint), el
                                    // frontend lo ignoraba.
                                    //
                                    // Security: solo aceptamos URLs que
                                    // empiecen con `/` y NO contengan `://`
                                    // ni empiecen con `//`. Eso previene:
                                    //   - Protocol-relative attack (`//evil.com`)
                                    //   - URLs absolutas externas (`https://evil.com`)
                                    //   - JavaScript URIs (`javascript:...`)
                                    //   - Data URIs (`data:...`)
                                    // Cualquier URL inválida cae al fallback
                                    // copy hardcoded — el feature degrada
                                    // silente vs disparar redirect malicioso.
                                    const _cta = (_hasAction && typeof _actionReq.cta === 'string'
                                        && _actionReq.cta.trim())
                                        ? _actionReq.cta.trim()
                                        : null;
                                    const _urlRaw = (_hasAction && typeof _actionReq.url === 'string')
                                        ? _actionReq.url.trim()
                                        : '';
                                    const _urlSafe = (
                                        _urlRaw.startsWith('/')
                                        && !_urlRaw.startsWith('//')
                                        && !_urlRaw.includes('://')
                                    ) ? _urlRaw : null;
                                    const _hasCustomCta = !!(_cta && _urlSafe);

                                    return (
                                        <div className={styles.actionBanner} role="alert">
                                            <div className={styles.actionBannerIcon}>
                                                <AlertTriangle size={20} />
                                            </div>
                                            <div className={styles.actionBannerContent}>
                                                <strong className={styles.actionBannerTitle}>
                                                    {_title}
                                                </strong>
                                                {_body && (
                                                    <p className={styles.actionBannerBody}>{_body}</p>
                                                )}
                                                {_exhausted.length > 0 && (
                                                    <p className={styles.actionBannerMeta}>
                                                        {_exhausted.length === 1
                                                            ? '1 chunk no recuperable.'
                                                            : `${_exhausted.length} chunks no recuperables.`}
                                                    </p>
                                                )}
                                                {_reason && !_body && (
                                                    <p className={styles.actionBannerMeta}>
                                                        Razón: <code>{_reason}</code>
                                                    </p>
                                                )}

                                                {/* [P2-HIST-AUDIT-9 · 2026-05-09]
                                                    Lista per-chunk de reasons
                                                    cuando el banner está
                                                    activado por queue drift o
                                                    plan_data action_required.
                                                    Lectura desde
                                                    `blockedReasonsCache`
                                                    (lazy-fetched al abrir el
                                                    modal). Sin esto, un plan
                                                    con 3 chunks bloqueados por
                                                    razones distintas
                                                    (e.g. 1 stale_snapshot + 1
                                                    tz_unresolved + 1
                                                    recovery_exhausted) reportaba
                                                    un único reason agregado
                                                    desde plan_data — el
                                                    usuario no podía
                                                    diagnosticar cada chunk. */}
                                                {(() => {
                                                    const _br = blockedReasonsCache[selectedPlan.id];
                                                    if (_br === 'loading') {
                                                        return (
                                                            <p className={styles.actionBannerMeta}>
                                                                Cargando detalle por chunk…
                                                            </p>
                                                        );
                                                    }
                                                    if (_br === 'error' || !Array.isArray(_br) || _br.length === 0) {
                                                        return null;
                                                    }
                                                    return (
                                                        <ul className={styles.actionBannerReasons}>
                                                            {_br.map((r) => {
                                                                const _wk = (typeof r.week_number === 'number')
                                                                    ? `Semana ${r.week_number}`
                                                                    : 'Chunk';
                                                                const _t = (typeof r.title === 'string' && r.title.trim())
                                                                    ? r.title
                                                                    : (r.reason_code || 'Bloqueado');
                                                                const _b = (typeof r.body === 'string' && r.body.trim())
                                                                    ? r.body
                                                                    : null;
                                                                return (
                                                                    <li key={r.chunk_id}
                                                                        className={styles.actionBannerReasonItem}>
                                                                        <strong>{_wk}: {_t}</strong>
                                                                        {_b && <span> — {_b}</span>}
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    );
                                                })()}

                                                {_hasCustomCta ? (
                                                    <button
                                                        type="button"
                                                        className={styles.actionBannerCtaButton}
                                                        onClick={() => navigate(_urlSafe)}
                                                    >
                                                        {_cta}
                                                    </button>
                                                ) : (() => {
                                                    // [P3-HIST-ACTIVE-NO-REACTIVATE · 2026-05-18]
                                                    // El texto "Pulsa Reactivar este Plan abajo"
                                                    // asumía que el botón siempre estaba visible.
                                                    // Ahora se oculta para planes activos/futuros.
                                                    // Si es el plan actual, redirigimos
                                                    // al Dashboard (donde el banner de recovery del
                                                    // plan activo surface el chunk bloqueado).
                                                    // [P1-HIST-ACTIVE-IDENTITY · 2026-05-31] El
                                                    // ocultar "Reactivar" ahora se basa en si ESTE
                                                    // es el plan actual, no en su ventana temporal.
                                                    const _hideRestore = !!currentPlanId && selectedPlan?.id === currentPlanId;
                                                    return (
                                                        <p className={styles.actionBannerCta}>
                                                            {_hideRestore
                                                                ? (<>Vuelve al <strong>Dashboard</strong> para retomar la generación de los chunks bloqueados.</>)
                                                                : (<>Pulsa <strong>Reactivar este Plan</strong> abajo para retomar la generación desde el Dashboard.</>)}
                                                        </p>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* [P1-HIST-BLOCKED-STUCK · 2026-05-09]
                                    Mini-bloque "info" para chunks atascados
                                    (status `processing`/`stale` con lag >
                                    threshold). NO usa el banner rojo
                                    `actionBanner` porque stuck NO requiere
                                    acción inmediata del usuario — el cron
                                    los retoma automáticamente. Solo se
                                    renderiza cuando hay reasons stuck en
                                    `blockedReasonsCache` Y NO se está
                                    mostrando ya el banner action_required
                                    (sino sería ruido duplicado).

                                    Tono info azul, ícono Calendar, copy
                                    "tu plan está tardando más de lo
                                    habitual" — la lista detallada per-chunk
                                    queda dentro del banner action_required
                                    cuando ese sí se dispara. */}
                                {(() => {
                                    const _br = blockedReasonsCache[selectedPlan.id];
                                    if (!Array.isArray(_br) || _br.length === 0) return null;
                                    const _stuckOnly = _br.filter(
                                        (r) => typeof r.reason_code === 'string'
                                            && (r.reason_code === 'stuck_processing'
                                                || r.reason_code === 'stuck_stale')
                                    );
                                    if (_stuckOnly.length === 0) return null;
                                    // Si el banner action_required YA se está
                                    // disparando (action_required del plan,
                                    // exhausted chunks, o queue drift por
                                    // PUAC/failed counters), las reasons
                                    // stuck ya aparecen DENTRO de su lista
                                    // — no dupliques con un mini-bloque.
                                    const _pd2 = selectedPlan.plan_data || {};
                                    const _hasAction2 = _pd2._user_action_required != null
                                        && _pd2._user_action_required !== false;
                                    const _exh2 = Array.isArray(_pd2._recovery_exhausted_chunks)
                                        ? _pd2._recovery_exhausted_chunks.length : 0;
                                    const _puac2 = (typeof selectedPlan.chunk_pending_user_action_count === 'number')
                                        ? selectedPlan.chunk_pending_user_action_count : 0;
                                    // [P0-HIST-NEW-1 · 2026-05-09] Mismo
                                    // criterio que action_banner: usamos
                                    // unreplaced para evitar suprimir el
                                    // stuck-banner solo porque hay residuos
                                    // failed con sibling completed (que NO
                                    // disparan el action_banner).
                                    const _fc2 = (typeof selectedPlan.chunk_failed_unreplaced_count === 'number')
                                        ? selectedPlan.chunk_failed_unreplaced_count
                                        : ((typeof selectedPlan.chunk_failed_count === 'number')
                                            ? selectedPlan.chunk_failed_count : 0);
                                    if (_hasAction2 || _exh2 > 0 || _puac2 > 0 || _fc2 > 0) {
                                        return null;
                                    }
                                    // Helper local para formatear lag (segundos
                                    // desde execute_after) como "Xh" / "Xh Ym".
                                    const _fmtLag = (sec) => {
                                        if (typeof sec !== 'number' || sec <= 0) return null;
                                        const _h = Math.floor(sec / 3600);
                                        const _m = Math.floor((sec % 3600) / 60);
                                        if (_h <= 0) return `${_m}m`;
                                        return _m > 0 ? `${_h}h ${_m}m` : `${_h}h`;
                                    };
                                    return (
                                        <div className={styles.stuckBanner} role="status">
                                            <div className={styles.stuckBannerIcon}>
                                                <Calendar size={18} />
                                            </div>
                                            <div className={styles.stuckBannerContent}>
                                                <strong className={styles.stuckBannerTitle}>
                                                    Tu plan está tardando más de lo habitual
                                                </strong>
                                                <p className={styles.stuckBannerBody}>
                                                    {_stuckOnly.length === 1
                                                        ? '1 bloque del plan lleva un rato sin completar. El cron lo retomará automáticamente.'
                                                        : `${_stuckOnly.length} bloques del plan llevan un rato sin completar. El cron los retomará automáticamente.`}
                                                </p>
                                                <ul className={styles.stuckBannerList}>
                                                    {_stuckOnly.map((r) => {
                                                        const _wk = (typeof r.week_number === 'number')
                                                            ? `Semana ${r.week_number}`
                                                            : 'Chunk';
                                                        const _lag = _fmtLag(r.lag_seconds);
                                                        const _label = r.reason_code === 'stuck_stale'
                                                            ? 'reanudando'
                                                            : 'procesando';
                                                        return (
                                                            <li key={r.chunk_id}
                                                                className={styles.stuckBannerListItem}>
                                                                <span>{_wk}: {_label}</span>
                                                                {_lag && (
                                                                    <span className={styles.stuckBannerLag}>
                                                                        hace {_lag}
                                                                    </span>
                                                                )}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* 4-column Macros */}
                                <div className={styles.macrosGrid}>
                                    <div className={`${styles.macroCard} ${styles.macroCardOrange}`}>
                                        <Flame size={18} color="#EA580C" style={{ marginBottom: '0.4rem' }} />
                                        <div className={styles.macroValueOrange}>{selectedPlan.calories}</div>
                                        <div className={styles.macroLabelOrange}>kcal</div>
                                    </div>
                                    <div className={`${styles.macroCard} ${styles.macroCardBlue}`}>
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.4rem' }}>
                                            {/* [APPEARANCE-THEME · 2026-05-29] Dumbbell lucide outline
                                                (color = macroLabelBlue #2563EB) para igualar el estilo
                                                outline de Flame/Wheat/Droplet de esta grid. Antes
                                                `<ProteinIcon />` (mancuerna sólida) desentonaba. */}
                                            <Dumbbell size={18} color="#2563EB" style={{ marginBottom: 0 }} />
                                        </div>
                                        <div className={styles.macroValueBlue}>{selectedPlan.macros?.protein || '—'}</div>
                                        <div className={styles.macroLabelBlue}>Proteína</div>
                                    </div>
                                    <div className={`${styles.macroCard} ${styles.macroCardGreen}`}>
                                        <Wheat size={18} color="#059669" style={{ marginBottom: '0.4rem' }} />
                                        <div className={styles.macroValueGreen}>{selectedPlan.macros?.carbs || '—'}</div>
                                        <div className={styles.macroLabelGreen}>Carbos</div>
                                    </div>
                                    <div className={`${styles.macroCard} ${styles.macroCardPink}`}>
                                        <Droplet size={18} color="#EC4899" style={{ marginBottom: '0.4rem' }} />
                                        <div className={styles.macroValuePink}>{selectedPlan.macros?.fats || '—'}</div>
                                        <div className={styles.macroLabelPink}>Grasas</div>
                                    </div>
                                </div>

                                {/* [P1-AUDIT-HIST-6 · 2026-05-09] Tier breakdown
                                    de los chunks completed del plan archivado.
                                    Comunica al usuario la "calidad" con la que
                                    se generaron los días: `llm` (mejor), o uno
                                    de los degraded (`shuffle`/`edge`/`emergency`).
                                    Mismo dato que el endpoint chunk-status del
                                    plan ACTIVO (routers/plans.py:3349) ahora
                                    expuesto retroactivamente para planes
                                    archivados.

                                    Fuente: `selectedPlan.chunk_tier_breakdown`
                                    (LEFT JOIN del backend, P1-AUDIT-HIST-6).
                                    Backend devuelve `null` cuando no hay tier
                                    info (sin chunks completed con tier no-NULL)
                                    — el bloque entero se omite. */}
                                {(() => {
                                    const _breakdown = selectedPlan.chunk_tier_breakdown;
                                    if (!_breakdown || typeof _breakdown !== 'object'
                                        || Object.keys(_breakdown).length === 0) {
                                        return null;
                                    }
                                    // Copy + clase de color por tier. Los tiers
                                    // canónicos del backend son llm/shuffle/edge/
                                    // emergency/failed/paused/error. Tiers
                                    // desconocidos caen al fallback "Otro".
                                    const _TIER_LABELS = {
                                        llm: 'Calidad LLM',
                                        shuffle: 'Re-mezclado',
                                        edge: 'Edge case',
                                        emergency: 'Emergencia',
                                        failed: 'Fallo',
                                        paused: 'Pausado',
                                        error: 'Error',
                                    };
                                    const _TIER_CLASSES = {
                                        llm: styles.tierBadgeOk,
                                        shuffle: styles.tierBadgeWarn,
                                        edge: styles.tierBadgeWarn,
                                        emergency: styles.tierBadgeWarn,
                                        failed: styles.tierBadgeBad,
                                        paused: styles.tierBadgeBad,
                                        error: styles.tierBadgeBad,
                                    };
                                    // Orden estable: llm primero (happy path),
                                    // luego degraded en severity ascendente,
                                    // luego desconocidos. Sin orden, el render
                                    // de Object.keys puede variar por plan.
                                    const _TIER_ORDER = [
                                        'llm', 'shuffle', 'edge', 'emergency',
                                        'failed', 'paused', 'error',
                                    ];
                                    const _entries = Object.entries(_breakdown)
                                        .filter(([_, count]) => typeof count === 'number' && count > 0);
                                    if (_entries.length === 0) return null;
                                    _entries.sort((a, b) => {
                                        const ai = _TIER_ORDER.indexOf(a[0]);
                                        const bi = _TIER_ORDER.indexOf(b[0]);
                                        const aSafe = ai === -1 ? 999 : ai;
                                        const bSafe = bi === -1 ? 999 : bi;
                                        return aSafe - bSafe;
                                    });
                                    return (
                                        <div className={styles.tierBreakdownRow}>
                                            <span className={styles.tierBreakdownLabel}>
                                                Calidad de chunks:
                                            </span>
                                            {_entries.map(([tier, count]) => {
                                                const _label = _TIER_LABELS[tier] || tier;
                                                const _cls = _TIER_CLASSES[tier] || styles.tierBadgeNeutral;
                                                return (
                                                    <span
                                                        key={tier}
                                                        className={`${styles.tierBadge} ${_cls}`}
                                                        title={`${count} chunk(s) generado(s) en tier "${tier}"`}
                                                    >
                                                        {_label}: {count}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}

                                {/* [P2-HIST-AUDIT-2 · 2026-05-09] Modal tabs: alternar
                                    entre Menú / Lecciones / Ajustes. Las dos últimas
                                    cargan lazy desde endpoints de detalle por-plan
                                    (`/api/plans/{id}/lessons` y
                                    `/api/plans/{id}/coherence-history`). Solo se
                                    muestran si el plan tiene contenido para esos tabs
                                    (>0 según los conteos del summary). Sin esto, el
                                    chip "X lecciones" en la card era un dead-end —
                                    el usuario veía el conteo pero no podía expandir
                                    a ver QUÉ aprendió el sistema, perdiendo surface
                                    del diferenciador. */}
                                {(() => {
                                    const _lessonsCount = lessonsCounts[selectedPlan.id] || 0;
                                    const _adjustsCount = getCoherenceAdjustsCount(selectedPlan);
                                    const _hasLessons = _lessonsCount > 0;
                                    const _hasAdjusts = _adjustsCount > 0;
                                    // [P2-HIST-AUDIT-10 · 2026-05-09] Tab
                                    // "Métricas" visible cuando el plan tiene
                                    // chunks con info útil. Nos basamos en
                                    // counters embedded (P1-AUDIT-HIST-4) o
                                    // fallback summary (P0-AUDIT-HIST-2).
                                    //
                                    // [P0-HIST-METRICS-FAILED · 2026-05-09]
                                    // Antes el tab se ocultaba si
                                    // chunk_completed_count=0. Para un plan que
                                    // se cayó con TODOS los chunks failed (0
                                    // completed, N failed con
                                    // dead_letter_reason), el usuario perdía
                                    // visibilidad post-mortem: el chunk-metrics
                                    // endpoint ya devuelve dead_letter_reason +
                                    // attempts + escalated_at + learning_metrics
                                    // de chunks failed (LEFT JOIN sin filter por
                                    // status), pero el frontend no lo renderizaba
                                    // por la condición de visibilidad. Cierre:
                                    // mostrar tab también si hay failed o
                                    // recovery_exhausted > 0. Label muestra el
                                    // total de chunks con metadata significativa
                                    // (completed + failed) para que el contador
                                    // del tab refleje qué se va a renderizar.
                                    const _completedFromEmbedded = (typeof selectedPlan.chunk_completed_count === 'number')
                                        ? selectedPlan.chunk_completed_count
                                        : null;
                                    const _completedFromSummary = (chunkStatusSummary && chunkStatusSummary[selectedPlan.id]
                                        && typeof chunkStatusSummary[selectedPlan.id].completed_count === 'number')
                                        ? chunkStatusSummary[selectedPlan.id].completed_count
                                        : 0;
                                    const _completedCount = (_completedFromEmbedded !== null)
                                        ? _completedFromEmbedded
                                        : _completedFromSummary;
                                    const _failedFromEmbedded = (typeof selectedPlan.chunk_failed_count === 'number')
                                        ? selectedPlan.chunk_failed_count
                                        : null;
                                    const _failedFromSummary = (chunkStatusSummary && chunkStatusSummary[selectedPlan.id]
                                        && typeof chunkStatusSummary[selectedPlan.id].failed_count === 'number')
                                        ? chunkStatusSummary[selectedPlan.id].failed_count
                                        : 0;
                                    const _failedCount = (_failedFromEmbedded !== null)
                                        ? _failedFromEmbedded
                                        : _failedFromSummary;
                                    const _exhaustedCount = (typeof selectedPlan.recovery_exhausted_count === 'number')
                                        ? selectedPlan.recovery_exhausted_count
                                        : (Array.isArray(selectedPlan.plan_data?._recovery_exhausted_chunks)
                                            ? selectedPlan.plan_data._recovery_exhausted_chunks.length
                                            : 0);
                                    // Total renderable en tab Métricas: completed
                                    // (con duration/learning_metrics) + failed
                                    // (con dead_letter_reason/attempts). exhausted
                                    // es subset de failed pero abre el tab incluso
                                    // si la queue solo tiene exhausted persistido
                                    // en plan_data._recovery_exhausted_chunks
                                    // (planes legacy donde la queue se purgó).
                                    const _metricsTabCount = _completedCount + _failedCount;
                                    const _hasMetrics = _metricsTabCount > 0 || _exhaustedCount > 0;
                                    // Si no hay nada extra, no mostramos los tabs —
                                    // el modal queda con su layout tradicional sin
                                    // ruido de UI.
                                    if (!_hasLessons && !_hasAdjusts && !_hasMetrics) return null;
                                    return (
                                        <div className={styles.modalTabs}>
                                            <button
                                                type="button"
                                                onClick={() => setActiveModalTab('menu')}
                                                className={`${styles.modalTab} ${activeModalTab === 'menu' ? styles.modalTabActive : ''}`}
                                            >
                                                Menú
                                            </button>
                                            {_hasLessons && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveModalTab('lessons');
                                                        // [P2-HIST-AUDIT-2] Telemetría
                                                        // (chunk_lesson_telemetry).
                                                        _ensureLessonsDetail(selectedPlan.id);
                                                        // [P1-HIST-LIFETIME-LESSONS ·
                                                        // 2026-05-09] Lifetime + critical
                                                        // permanent del aprendizaje
                                                        // continuo (plan_data). Mismo
                                                        // tab — sub-secciones distintas.
                                                        _ensureLifetimeLessons(selectedPlan.id);
                                                    }}
                                                    className={`${styles.modalTab} ${activeModalTab === 'lessons' ? styles.modalTabActive : ''}`}
                                                >
                                                    Lecciones ({_lessonsCount})
                                                </button>
                                            )}
                                            {_hasAdjusts && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveModalTab('adjustments');
                                                        _ensureCoherenceHistory(selectedPlan.id);
                                                    }}
                                                    className={`${styles.modalTab} ${activeModalTab === 'adjustments' ? styles.modalTabActive : ''}`}
                                                >
                                                    Ajustes ({_adjustsCount})
                                                </button>
                                            )}
                                            {_hasMetrics && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveModalTab('metrics');
                                                        _ensureChunkMetrics(selectedPlan.id);
                                                    }}
                                                    className={`${styles.modalTab} ${activeModalTab === 'metrics' ? styles.modalTabActive : ''}`}
                                                >
                                                    {/* [P0-HIST-METRICS-FAILED · 2026-05-09]
                                                        Label muestra completed+failed (chunks
                                                        con metadata renderable). Si solo hay
                                                        recovery_exhausted (persistido en
                                                        plan_data sin queue rows), label cae a
                                                        "Métricas" sin contador. */}
                                                    Métricas{_metricsTabCount > 0 ? ` (${_metricsTabCount})` : ''}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* [P1-HIST-LIFETIME-LESSONS · 2026-05-09]
                                    Sub-sección "Aprendizaje del usuario" del tab
                                    Lecciones. Surface las 3 estructuras del
                                    aprendizaje continuo persistidas en plan_data:
                                      - _lifetime_lessons_summary (agregado).
                                      - _critical_lessons_permanent (inmortales).
                                      - _lifetime_lessons_history (top 50 recientes).
                                    Antes solo la telemetría (chunk_lesson_telemetry)
                                    aparecía en el tab — eso es señal mecánica SOBRE
                                    el aprendizaje, no el aprendizaje en sí. Esta
                                    sección comunica al usuario QUÉ aprendió Mealfit
                                    de él en este plan (rechazos, alergias, repeticiones).

                                    Render condicional: solo si el endpoint devuelve
                                    payload con contenido visible (summary != null
                                    O history.length > 0 O critical_permanent.length > 0).
                                    Plan legacy sin estas keys → sub-sección oculta y
                                    el tab cae directo a la telemetría. */}
                                {activeModalTab === 'lessons' && (() => {
                                    const _ll = lifetimeLessonsCache[selectedPlan.id];
                                    if (_ll === 'loading' || _ll === undefined) {
                                        return (
                                            <div className={styles.modalDetailEmpty}>
                                                Cargando aprendizaje del usuario…
                                            </div>
                                        );
                                    }
                                    if (_ll === 'error') {
                                        // Error en el endpoint lifetime — NO bloquear
                                        // el render de la telemetría (es independiente).
                                        // Mostramos un mini-aviso y dejamos que la
                                        // telemetría siga abajo.
                                        return (
                                            <div className={styles.modalDetailEmpty}
                                                 style={{ marginBottom: '0.75rem' }}>
                                                No se pudo cargar el aprendizaje agregado del plan.
                                            </div>
                                        );
                                    }
                                    const _summary = (_ll && _ll.summary) || null;
                                    const _history = (_ll && Array.isArray(_ll.history))
                                        ? _ll.history : [];
                                    const _critical = (_ll && Array.isArray(_ll.critical_permanent))
                                        ? _ll.critical_permanent : [];
                                    const _counts = (_ll && _ll.counts) || {};
                                    // [P0-HIST-LEARN-2 · 2026-05-09] Counter
                                    // de zero-log también cuenta como "tiene
                                    // contenido" — un plan con counter > 0
                                    // pero sin lifetime aggregates (chunks
                                    // todos sin signal) DEBE renderizar el
                                    // header con el chip de alarma.
                                    const _czl = (_ll && typeof _ll.consecutive_zero_log_chunks === 'number')
                                        ? _ll.consecutive_zero_log_chunks : null;
                                    const _hasContent = _summary !== null
                                        || _history.length > 0
                                        || _critical.length > 0
                                        || (_czl !== null && _czl > 0);
                                    if (!_hasContent) return null;

                                    // Helper: trunca string a N chars con ellipsis.
                                    // Útil para `permanent_meal_blocklist` que puede
                                    // tener nombres largos ("Pollo guisado con coco
                                    // y cilantro al estilo dominicano").
                                    const _trunc = (s, n = 38) => (
                                        typeof s === 'string' && s.length > n
                                            ? s.slice(0, n - 1) + '…'
                                            : s
                                    );

                                    // Helper: timestamp formateado o vacío.
                                    const _fmtTs = (raw) => {
                                        if (!raw || typeof raw !== 'string') return '';
                                        const _d = new Date(raw);
                                        if (Number.isNaN(_d.getTime())) return '';
                                        return _d.toLocaleString('es-DO', {
                                            month: 'short', day: 'numeric',
                                            hour: '2-digit', minute: '2-digit',
                                        });
                                    };

                                    // Proxy ratio badge: salud del aprendizaje.
                                    // Threshold 0.5 espeja CHUNK_MAX_LIFETIME_PROXY_RATIO
                                    // (constants.py — backend lo usa para emitir
                                    // telemetría 'lifetime_proxy_ratio_exceeded').
                                    // Render solo si tenemos summary y la métrica.
                                    const _proxyRatio = (_summary
                                        && typeof _summary._lifetime_proxy_ratio === 'number')
                                        ? _summary._lifetime_proxy_ratio : null;
                                    const _proxyDegraded = _proxyRatio !== null
                                        && _proxyRatio >= 0.5;

                                    // [P0-HIST-LEARN-2 · 2026-05-09] Estado
                                    // del counter zero-log para el chip del
                                    // header. `generation_status =
                                    // degraded_pending_engagement` es señal
                                    // explícita del cron (cron_tasks.py:17488)
                                    // — la combinación con counter ≥3 escala
                                    // a "alarm" (palette bad). Counter 1-2
                                    // sin status degraded → "info" (todavía
                                    // no es alarma, el cron solo nota).
                                    const _genStatus = (_ll && typeof _ll.generation_status === 'string')
                                        ? _ll.generation_status : null;
                                    const _zeroLogAlarming = (_czl !== null && _czl >= 3)
                                        || _genStatus === 'degraded_pending_engagement';
                                    const _zeroLogInfo = (_czl !== null && _czl > 0 && !_zeroLogAlarming);

                                    return (
                                        <div className={styles.lifetimeLessonsBlock}>
                                            <div className={styles.lifetimeLessonsHeader}>
                                                <Sparkles size={16} strokeWidth={2.5} />
                                                <strong>Aprendizaje del usuario</strong>
                                                {_proxyDegraded && (
                                                    <span
                                                        className={styles.lifetimeProxyBadge}
                                                        title={`Aprendizaje degradado: ${Math.round(_proxyRatio * 100)}% de las lecciones vienen de proxy (sin logs reales del usuario). Threshold ≥ 50%.`}
                                                    >
                                                        Proxy {Math.round(_proxyRatio * 100)}%
                                                    </span>
                                                )}
                                                {_zeroLogAlarming && (
                                                    <span
                                                        className={styles.zeroLogBadgeAlarm}
                                                        title={`${_czl} bloque(s) consecutivo(s) generado(s) sin tu feedback (sin logs ni interacciones que cuenten). El sistema marcó este plan como "degradado por engagement" (generation_status='degraded_pending_engagement') — los próximos bloques pueden tener menos personalización hasta que loguees comidas.`}
                                                    >
                                                        Sin feedback: {_czl}
                                                    </span>
                                                )}
                                                {_zeroLogInfo && (
                                                    <span
                                                        className={styles.zeroLogBadgeInfo}
                                                        title={`${_czl} bloque${_czl === 1 ? '' : 's'} sin feedback. A partir de 3 consecutivos el plan se marca como "degradado por engagement".`}
                                                    >
                                                        Sin feedback: {_czl}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Counters agregados del summary —
                                                solo render si tenemos summary. */}
                                            {_summary && (() => {
                                                const _rej = _summary.total_rejection_violations;
                                                const _alg = _summary.total_allergy_violations;
                                                const _logs = _summary._lifetime_user_logs_count;
                                                const _proxy = _summary._lifetime_proxy_count;
                                                const _hasAny = (
                                                    typeof _rej === 'number' ||
                                                    typeof _alg === 'number' ||
                                                    typeof _logs === 'number' ||
                                                    typeof _proxy === 'number'
                                                );
                                                if (!_hasAny) return null;
                                                return (
                                                    <div className={styles.lifetimeCountersRow}>
                                                        {typeof _rej === 'number' && (
                                                            <span className={styles.detailItemCounter}
                                                                  title="Total de violaciones de rechazos detectadas en el lifetime de este plan">
                                                                Rechazos: {_rej}
                                                            </span>
                                                        )}
                                                        {typeof _alg === 'number' && _alg > 0 && (
                                                            <span className={`${styles.detailItemCounter} ${styles.tierBadgeBad}`}
                                                                  title="Violaciones de alergias — el sistema las trata como inmortales">
                                                                Alergias: {_alg}
                                                            </span>
                                                        )}
                                                        {typeof _logs === 'number' && (
                                                            <span className={styles.detailItemCounter}
                                                                  title="Lecciones derivadas de logs reales del usuario">
                                                                Logs: {_logs}
                                                            </span>
                                                        )}
                                                        {typeof _proxy === 'number' && _proxy > 0 && (
                                                            <span className={styles.detailItemCounter}
                                                                  title="Lecciones generadas via proxy (sin log explícito del usuario)">
                                                                Proxy: {_proxy}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}

                                            {/* [P0-HIST-LEARN-1 · 2026-05-09]
                                                Snapshot del último chunk aprendido —
                                                la semilla literal que el cron inyecta al
                                                PRÓXIMO chunk. Antes invisible: diagnosticar
                                                "por qué el chunk N+1 generó X" requería SQL
                                                al jsonb. Ahora visible debajo de los counters
                                                lifetime, antes de los tops/lists.

                                                Severity por key:
                                                  - learning_signal_strength=weak → warn,
                                                    medium=info, strong=ok (chip neutral).
                                                  - low_confidence=true → warn ("baja
                                                    confianza" del aprendizaje).
                                                  - metrics_unavailable=true → warn (T2 fail:
                                                    el chunk shippó días pero learning no se
                                                    persistió, próximo chunk nace ciego).
                                                  - rebuilt_from_pipeline_failure=true → bad
                                                    (el cron tuvo que reconstruir tras
                                                    pipeline crash).
                                                  - rebuilt_from_queue/preflight=true → info
                                                    (recovery path normal, sin alarma).
                                                  - allergy_violations>0 → bad.
                                                  - rejection_violations/fatigued_violations>0
                                                    → warn.
                                                  - repeat_pct/ingredient_base_repeat_pct
                                                    >60% → bad, >20% → warn.

                                                Render solo si la key existe (plan legacy →
                                                oculto). Cap visual lista 5 + "+N más" en
                                                title=. */}
                                            {(() => {
                                                const _lcl = _ll && _ll.last_chunk_learning;
                                                if (!_lcl || typeof _lcl !== 'object'
                                                    || Array.isArray(_lcl)) return null;
                                                // Detectamos si hay AL MENOS un campo con
                                                // valor renderizable. Sin esto, un payload
                                                // con todos los keys nulled (chunk
                                                // pre-pipeline) renderizaría un sub-bloque
                                                // vacío con solo el header — confuso.
                                                const _hasAnyValue = (
                                                    typeof _lcl.chunk === 'number'
                                                    || typeof _lcl.repeat_pct === 'number'
                                                    || typeof _lcl.ingredient_base_repeat_pct === 'number'
                                                    || (typeof _lcl.rejection_violations === 'number' && _lcl.rejection_violations > 0)
                                                    || (typeof _lcl.allergy_violations === 'number' && _lcl.allergy_violations > 0)
                                                    || (typeof _lcl.fatigued_violations === 'number' && _lcl.fatigued_violations > 0)
                                                    || _lcl.low_confidence === true
                                                    || _lcl.metrics_unavailable === true
                                                    || _lcl.rebuilt_from_queue === true
                                                    || _lcl.rebuilt_from_preflight === true
                                                    || _lcl.rebuilt_from_pipeline_failure === true
                                                    || (typeof _lcl.learning_signal_strength === 'string' && _lcl.learning_signal_strength.trim())
                                                    || (typeof _lcl.rebuilt_source_status === 'string' && _lcl.rebuilt_source_status.trim())
                                                    || (Array.isArray(_lcl.repeated_meal_names) && _lcl.repeated_meal_names.length > 0)
                                                    || (Array.isArray(_lcl.repeated_bases) && _lcl.repeated_bases.length > 0)
                                                    || (Array.isArray(_lcl.allergy_hits) && _lcl.allergy_hits.length > 0)
                                                    || (Array.isArray(_lcl.rejected_meals_that_reappeared) && _lcl.rejected_meals_that_reappeared.length > 0)
                                                );
                                                if (!_hasAnyValue) return null;

                                                const _wkLabel = (typeof _lcl.chunk === 'number')
                                                    ? `Bloque ${_lcl.chunk}` : 'Último bloque';
                                                const _ts = _fmtTs(_lcl.timestamp);

                                                // Helpers de render para mantener el JSX
                                                // del map manejable. Cada uno devuelve
                                                // null si la condición no aplica — el
                                                // ARRAY de chips se filtra al final.
                                                const _signal = (typeof _lcl.learning_signal_strength === 'string')
                                                    ? _lcl.learning_signal_strength.trim().toLowerCase()
                                                    : '';
                                                const _signalSev = (
                                                    _signal === 'weak' ? styles.tierBadgeWarn
                                                    : (_signal === 'strong' ? '' : '')
                                                );
                                                const _signalLabel = (
                                                    _signal === 'weak' ? 'débil'
                                                    : _signal === 'medium' ? 'media'
                                                    : _signal === 'strong' ? 'fuerte'
                                                    : _signal
                                                );

                                                // Repeat pct llega 0-1 (fraction) en la
                                                // semilla del cron — diferente al lm de
                                                // métricas que llega 0-100. Mismo umbral
                                                // semántico (>60 bad / >20 warn) escalado.
                                                const _fmtRepPct = (raw) => {
                                                    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
                                                    const _pct = raw <= 1 ? raw * 100 : raw;
                                                    let _sev = '';
                                                    if (_pct > 60) _sev = styles.tierBadgeBad;
                                                    else if (_pct > 20) _sev = styles.tierBadgeWarn;
                                                    return { txt: `${_pct.toFixed(1)}%`, sev: _sev };
                                                };
                                                const _rep = _fmtRepPct(_lcl.repeat_pct);
                                                const _baseRep = _fmtRepPct(_lcl.ingredient_base_repeat_pct);

                                                // Lista compacta: top 5 items + "+N más"
                                                // en title= tooltip. Mismo patrón que el
                                                // metadata de lessons (P2-HIST-NEW-2).
                                                const _listChip = (label, items, sevClass) => {
                                                    if (!Array.isArray(items) || items.length === 0) return null;
                                                    const _shown = items.slice(0, 5).map((it) => _trunc(String(it), 22));
                                                    const _extra = Math.max(0, items.length - 5);
                                                    const _txt = _shown.join(', ') + (_extra > 0 ? ` +${_extra}` : '');
                                                    const _full = items.map((it) => String(it)).join('\n');
                                                    return (
                                                        <span
                                                            key={`lcl-list-${label}`}
                                                            className={`${styles.detailItemCounter} ${sevClass || ''}`}
                                                            title={_full}
                                                        >
                                                            {label}: {_txt}
                                                        </span>
                                                    );
                                                };

                                                return (
                                                    <div className={styles.lastChunkLearningBlock}>
                                                        <div className={styles.lastChunkLearningHeader}>
                                                            <strong>Lo aprendido del último bloque</strong>
                                                            <span className={styles.lastChunkLearningMeta}>
                                                                {_wkLabel}{_ts ? ` · ${_ts}` : ''}
                                                            </span>
                                                        </div>
                                                        <div className={styles.detailItemBody}>
                                                            {_signalLabel && (
                                                                <span
                                                                    className={`${styles.detailItemCounter} ${_signalSev}`}
                                                                    title="Fuerza de la señal de aprendizaje que el cron extrajo del chunk anterior. 'Débil' indica baja confianza para el próximo prompt."
                                                                >
                                                                    Señal: {_signalLabel}
                                                                </span>
                                                            )}
                                                            {_lcl.low_confidence === true && (
                                                                <span
                                                                    className={`${styles.detailItemCounter} ${styles.tierBadgeWarn}`}
                                                                    title="El cron marcó este aprendizaje como baja confianza — los próximos chunks pueden tener menos precisión hasta que llegue señal nueva (logs / interacciones)."
                                                                >
                                                                    Baja confianza
                                                                </span>
                                                            )}
                                                            {_lcl.metrics_unavailable === true && (
                                                                <span
                                                                    className={`${styles.detailItemCounter} ${styles.tierBadgeWarn}`}
                                                                    title="El chunk shippó días pero learning_metrics quedó NULL (T2 fail). El próximo chunk nace sin la información del anterior — riesgo de repetir comidas."
                                                                >
                                                                    Sin métricas T2
                                                                </span>
                                                            )}
                                                            {_lcl.rebuilt_from_pipeline_failure === true && (
                                                                <span
                                                                    className={`${styles.detailItemCounter} ${styles.tierBadgeBad}`}
                                                                    title="El cron tuvo que reconstruir el aprendizaje tras un crash del pipeline LangGraph. Señal de inestabilidad — revisa logs si recurre."
                                                                >
                                                                    Reconstruido tras crash
                                                                </span>
                                                            )}
                                                            {_lcl.rebuilt_from_queue === true && (
                                                                <span
                                                                    className={styles.detailItemCounter}
                                                                    title="Aprendizaje reconstruido desde plan_chunk_queue.learning_metrics — recovery path normal cuando _recent_chunk_lessons se perdió."
                                                                >
                                                                    Reconstruido (queue)
                                                                </span>
                                                            )}
                                                            {_lcl.rebuilt_from_preflight === true && (
                                                                <span
                                                                    className={styles.detailItemCounter}
                                                                    title="Aprendizaje reconstruido desde un preflight — fallback cuando ni queue ni days tenían señal recuperable."
                                                                >
                                                                    Reconstruido (preflight)
                                                                </span>
                                                            )}
                                                            {typeof _lcl.rebuilt_source_status === 'string' && _lcl.rebuilt_source_status.trim() && (
                                                                <span
                                                                    className={styles.detailItemCounter}
                                                                    title={`Status del origen desde el que el cron reconstruyó: ${_lcl.rebuilt_source_status}`}
                                                                >
                                                                    Origen: {_trunc(_lcl.rebuilt_source_status, 18)}
                                                                </span>
                                                            )}
                                                            {_rep && (
                                                                <span
                                                                    className={`${styles.detailItemCounter} ${_rep.sev}`}
                                                                    title="% de meals del último chunk que ya habían aparecido antes en el plan. >20% indica fatiga; >60% es señal fuerte de bucle."
                                                                >
                                                                    Repetición meals: {_rep.txt}
                                                                </span>
                                                            )}
                                                            {_baseRep && (
                                                                <span
                                                                    className={`${styles.detailItemCounter} ${_baseRep.sev}`}
                                                                    title="% de bases (proteína/carbo) repetidas vs chunks previos del plan. Complementa Repetición meals — alto base pct con bajo meal pct = recetas distintas, mismos ingredientes."
                                                                >
                                                                    Repetición bases: {_baseRep.txt}
                                                                </span>
                                                            )}
                                                            {typeof _lcl.allergy_violations === 'number' && _lcl.allergy_violations > 0 && (
                                                                <span
                                                                    className={`${styles.detailItemCounter} ${styles.tierBadgeBad}`}
                                                                    title="Violaciones de alergias detectadas en el último chunk. Las alergias son inmortales — el próximo chunk hereda este conteo."
                                                                >
                                                                    Alergias: {_lcl.allergy_violations}
                                                                </span>
                                                            )}
                                                            {typeof _lcl.rejection_violations === 'number' && _lcl.rejection_violations > 0 && (
                                                                <span
                                                                    className={`${styles.detailItemCounter} ${styles.tierBadgeWarn}`}
                                                                    title="Meals rechazados que reaparecieron en el último chunk."
                                                                >
                                                                    Rechazos: {_lcl.rejection_violations}
                                                                </span>
                                                            )}
                                                            {typeof _lcl.fatigued_violations === 'number' && _lcl.fatigued_violations > 0 && (
                                                                <span
                                                                    className={`${styles.detailItemCounter} ${styles.tierBadgeWarn}`}
                                                                    title="Meals con fatiga (presencia frecuente reciente) que volvieron a aparecer."
                                                                >
                                                                    Fatiga: {_lcl.fatigued_violations}
                                                                </span>
                                                            )}
                                                            {_listChip('Reaparecieron', _lcl.rejected_meals_that_reappeared, styles.tierBadgeWarn)}
                                                            {_listChip('Meals repetidos', _lcl.repeated_meal_names)}
                                                            {_listChip('Bases repetidas', _lcl.repeated_bases)}
                                                            {_listChip('Alergias hit', _lcl.allergy_hits, styles.tierBadgeBad)}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Listas top: blocklist permanente,
                                                rechazos, repeticiones de meals/bases.
                                                Cada lista colapsada con cap visual de
                                                10 items + "... +N más" si supera. */}
                                            {_summary && (() => {
                                                const _renderList = (items, label, hint) => {
                                                    if (!Array.isArray(items) || items.length === 0) return null;
                                                    const _shown = items.slice(0, 10);
                                                    const _extra = Math.max(0, items.length - _shown.length);
                                                    return (
                                                        <div className={styles.lifetimeListBlock}>
                                                            <span className={styles.lifetimeListLabel} title={hint}>
                                                                {label}:
                                                            </span>
                                                            {_shown.map((it, idx) => (
                                                                <span key={`${label}-${idx}`}
                                                                      className={styles.lifetimeListItem}
                                                                      title={typeof it === 'string' ? it : ''}>
                                                                    {_trunc(String(it))}
                                                                </span>
                                                            ))}
                                                            {_extra > 0 && (
                                                                <span className={styles.lifetimeListItemMore}>
                                                                    +{_extra} más
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                };
                                                return (
                                                    <>
                                                        {_renderList(
                                                            _summary.permanent_meal_blocklist,
                                                            'Blocklist permanente',
                                                            'Meals que aparecieron en ≥2 chunks del plan — Mealfit los evita en regeneraciones futuras.'
                                                        )}
                                                        {_renderList(
                                                            _summary.top_rejection_hits,
                                                            'Top rechazos',
                                                            'Meals rechazados por el usuario que reaparecieron en chunks posteriores.'
                                                        )}
                                                        {_renderList(
                                                            _summary.top_repeated_meal_names,
                                                            'Meals repetidos',
                                                            'Meals que aparecieron en múltiples chunks — señal de fatiga.'
                                                        )}
                                                        {_renderList(
                                                            _summary.top_repeated_bases,
                                                            'Bases repetidas',
                                                            'Ingredientes base repetidos cross-chunks (proteína/carbo).'
                                                        )}
                                                    </>
                                                );
                                            })()}

                                            {/* Critical lessons permanent —
                                                inmortales (alergias o rechazos
                                                críticos). Render compacto con
                                                badges de counts. */}
                                            {_critical.length > 0 && (
                                                <div className={styles.lifetimeCriticalBlock}>
                                                    <div className={styles.lifetimeCriticalHeader}>
                                                        <strong>Lecciones permanentes</strong>
                                                        <span className={styles.lifetimeCriticalCount}>
                                                            {_critical.length}
                                                            {typeof _counts.critical_permanent_total === 'number'
                                                                && _counts.critical_permanent_total > _critical.length
                                                                ? ` de ${_counts.critical_permanent_total}` : ''}
                                                        </span>
                                                    </div>
                                                    <ul className={styles.detailList}>
                                                        {_critical.slice(0, 8).map((c, idx) => {
                                                            const _alg = (c && typeof c.allergy_violations === 'number')
                                                                ? c.allergy_violations : 0;
                                                            const _rej = (c && typeof c.rejection_violations === 'number')
                                                                ? c.rejection_violations : 0;
                                                            const _ts = _fmtTs(
                                                                (c && (c.last_validated_at || c.last_seen_at
                                                                    || c.updated_at || c.created_at)) || null
                                                            );
                                                            return (
                                                                <li key={`crit-${idx}`} className={styles.detailItem}>
                                                                    <div className={styles.detailItemHeader}>
                                                                        <span className={styles.detailItemBadge}>
                                                                            {_alg > 0 ? 'Alergia' : 'Rechazo crítico'}
                                                                        </span>
                                                                        <span className={styles.detailItemMeta}>
                                                                            {_ts}
                                                                        </span>
                                                                    </div>
                                                                    <div className={styles.detailItemBody}>
                                                                        {_alg > 0 && (
                                                                            <span className={`${styles.detailItemCounter} ${styles.tierBadgeBad}`}>
                                                                                Alergias: {_alg}
                                                                            </span>
                                                                        )}
                                                                        {_rej > 0 && (
                                                                            <span className={styles.detailItemCounter}>
                                                                                Rechazos: {_rej}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* History tail — antes cap fijo a 5
                                                con counter "5 de N" pero sin acción
                                                para expandir (P2-HIST-NEW-5).
                                                Ahora botón "Ver todos" / "Ver menos"
                                                permite mostrar el set completo (cap
                                                backend 50). Default colapsado a 5
                                                porque el tab Métricas ya tiene el
                                                detalle exhaustivo per-chunk — este
                                                bloque es preview, no sustituto. */}
                                            {_history.length > 0 && (() => {
                                                // [P2-HIST-NEW-5 · 2026-05-09]
                                                // Slice dinámico según expansión.
                                                // Cuando colapsado: top 5. Expandido:
                                                // todo el array (capeado a 50 desde
                                                // backend; ese cap es defensa contra
                                                // payloads inflados, NO el cap visual).
                                                const _COLLAPSED_CAP = 5;
                                                const _expanded = lifetimeHistoryExpanded;
                                                const _visible = _expanded
                                                    ? _history
                                                    : _history.slice(0, _COLLAPSED_CAP);
                                                const _canExpand = _history.length > _COLLAPSED_CAP;
                                                const _shownCount = _visible.length;
                                                const _totalCount = (typeof _counts.history_total === 'number'
                                                    && _counts.history_total > _history.length)
                                                    ? _counts.history_total
                                                    : _history.length;
                                                return (
                                                <div className={styles.lifetimeHistoryBlock}>
                                                    <div className={styles.lifetimeCriticalHeader}>
                                                        <strong>Historial reciente por chunk</strong>
                                                        <span className={styles.lifetimeCriticalCount}>
                                                            {_shownCount}
                                                            {_totalCount > _shownCount
                                                                ? ` de ${_totalCount}` : ''}
                                                        </span>
                                                    </div>
                                                    <ul className={styles.detailList}>
                                                        {_visible.map((entry, idx) => {
                                                            const _wk = (entry && typeof entry.chunk === 'number')
                                                                ? `Sem. ${entry.chunk}` : 'Chunk';
                                                            const _rej = (entry && typeof entry.rejection_violations === 'number')
                                                                ? entry.rejection_violations : 0;
                                                            const _alg = (entry && typeof entry.allergy_violations === 'number')
                                                                ? entry.allergy_violations : 0;
                                                            const _repNames = (entry && Array.isArray(entry.repeated_meal_names))
                                                                ? entry.repeated_meal_names.length : 0;
                                                            return (
                                                                <li key={`hist-${idx}`} className={styles.detailItem}>
                                                                    <div className={styles.detailItemHeader}>
                                                                        <span className={styles.detailItemBadge}>
                                                                            {_wk}
                                                                        </span>
                                                                    </div>
                                                                    <div className={styles.detailItemBody}>
                                                                        {_rej > 0 && (
                                                                            <span className={styles.detailItemCounter}>
                                                                                Rechazos: {_rej}
                                                                            </span>
                                                                        )}
                                                                        {_alg > 0 && (
                                                                            <span className={`${styles.detailItemCounter} ${styles.tierBadgeBad}`}>
                                                                                Alergias: {_alg}
                                                                            </span>
                                                                        )}
                                                                        {_repNames > 0 && (
                                                                            <span className={styles.detailItemCounter}>
                                                                                Repetidos: {_repNames}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                    {/* [P2-HIST-NEW-5 · 2026-05-09]
                                                        Botón toggle de expansión.
                                                        Solo render cuando _canExpand
                                                        (history > 5) — sin esto un
                                                        plan corto mostraría un botón
                                                        "Ver todos" inerte. Copy es-DO:
                                                        "Ver todos los N" expandido,
                                                        "Ver menos" colapsado. */}
                                                    {_canExpand && (
                                                        <button
                                                            type="button"
                                                            className={styles.lifetimeHistoryToggle}
                                                            onClick={() => setLifetimeHistoryExpanded((prev) => !prev)}
                                                            aria-expanded={_expanded}
                                                        >
                                                            {_expanded
                                                                ? 'Ver menos'
                                                                : `Ver todos los ${_history.length}`}
                                                        </button>
                                                    )}
                                                </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                })()}

                                {/* Tab "Lecciones" (P2-HIST-AUDIT-2) — lazy-loaded.
                                    Renderiza una lista compacta de events
                                    semánticos (whitelist P1-HIST-AUDIT-5: 4 events).
                                    Cada item: badge del event + week + counters
                                    (synthesized/queue) + timestamp.
                                    [P1-HIST-LIFETIME-LESSONS · 2026-05-09] La sub-
                                    sección "Aprendizaje del usuario" arriba muestra
                                    QUÉ aprendió el sistema; ESTA sección muestra
                                    los EVENTOS de telemetría (señal sobre el
                                    aprendizaje). Sub-header divider para
                                    diferenciarlas. */}
                                {activeModalTab === 'lessons' && (() => {
                                    const _data = lessonsDetailCache[selectedPlan.id];
                                    if (_data === 'loading' || _data === undefined) {
                                        return (
                                            <div className={styles.modalDetailEmpty}>
                                                Cargando lecciones…
                                            </div>
                                        );
                                    }
                                    if (_data === 'error') {
                                        return (
                                            <div className={styles.modalDetailEmpty}>
                                                No se pudo cargar el detalle. Intenta cerrar y reabrir el modal.
                                            </div>
                                        );
                                    }
                                    const _list = Array.isArray(_data) ? _data : [];
                                    if (_list.length === 0) {
                                        return (
                                            <div className={styles.modalDetailEmpty}>
                                                Este plan no tiene lecciones registradas todavía.
                                            </div>
                                        );
                                    }
                                    return (
                                        <>
                                            {/* [P1-HIST-LIFETIME-LESSONS · 2026-05-09]
                                                Sub-header divider entre la sección
                                                "Aprendizaje del usuario" (arriba) y
                                                la telemetría (abajo). Solo se renderiza
                                                cuando hay AMBAS secciones — si la
                                                lifetime cayó a oculta (sin contenido),
                                                este header sería confuso. */}
                                            {(() => {
                                                const _ll2 = lifetimeLessonsCache[selectedPlan.id];
                                                const _hasLifetime = (
                                                    _ll2 && typeof _ll2 === 'object'
                                                    && !Array.isArray(_ll2)
                                                    && (
                                                        _ll2.summary !== null
                                                        || (Array.isArray(_ll2.history) && _ll2.history.length > 0)
                                                        || (Array.isArray(_ll2.critical_permanent) && _ll2.critical_permanent.length > 0)
                                                    )
                                                );
                                                return _hasLifetime ? (
                                                    <div className={styles.lifetimeSectionDivider}>
                                                        Eventos de telemetría
                                                    </div>
                                                ) : null;
                                            })()}
                                        <ul className={styles.detailList}>
                                            {_list.map((lesson) => {
                                                const _ts = lesson.created_at
                                                    ? new Date(lesson.created_at).toLocaleString('es-DO', {
                                                        month: 'short', day: 'numeric',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })
                                                    : '';
                                                return (
                                                    <li key={lesson.id} className={styles.detailItem}>
                                                        <div className={styles.detailItemHeader}>
                                                            <span className={styles.detailItemBadge}>
                                                                {lesson.event}
                                                            </span>
                                                            <span className={styles.detailItemMeta}>
                                                                Sem. {lesson.week_number} · {_ts}
                                                            </span>
                                                        </div>
                                                        <div className={styles.detailItemBody}>
                                                            {typeof lesson.synthesized_count === 'number' && (
                                                                <span className={styles.detailItemCounter}>
                                                                    Sintetizadas: {lesson.synthesized_count}
                                                                </span>
                                                            )}
                                                            {typeof lesson.queue_count === 'number' && (
                                                                <span className={styles.detailItemCounter}>
                                                                    En cola: {lesson.queue_count}
                                                                </span>
                                                            )}
                                                            {/* [P2-HIST-NEW-2 · 2026-05-09] Surface
                                                                de `metadata` (jsonb arbitrario que
                                                                escriben los crons al persistir cada
                                                                lección). Antes el endpoint ya lo
                                                                devolvía pero el frontend lo
                                                                descartaba — diagnóstico potencial
                                                                perdido (`{score: 85}`,
                                                                `{retries: 3, error: ...}`, etc.).

                                                                Render: hasta 3 chips inline
                                                                "key: value" con value sanitizado +
                                                                truncado. Si hay >3 keys, indica
                                                                "+N más" en el último chip; el JSON
                                                                completo va en el title= del último
                                                                chip para inspección hover. Cada
                                                                value se sanitiza por tipo:
                                                                  - number/boolean: render directo.
                                                                  - string: trim + truncate ≤24.
                                                                  - object/array: JSON serializado
                                                                    truncado.
                                                                Sin esto, un object profundo
                                                                renderizaría "[object Object]". */}
                                                            {lesson.metadata
                                                                && typeof lesson.metadata === 'object'
                                                                && !Array.isArray(lesson.metadata) && (() => {
                                                                const _entries = Object.entries(lesson.metadata);
                                                                if (_entries.length === 0) return null;
                                                                const _fmtVal = (v) => {
                                                                    if (v === null || v === undefined) return 'null';
                                                                    if (typeof v === 'number' || typeof v === 'boolean') {
                                                                        return String(v);
                                                                    }
                                                                    if (typeof v === 'string') {
                                                                        const _t = v.trim();
                                                                        return _t.length > 24
                                                                            ? _t.slice(0, 23) + '…'
                                                                            : _t;
                                                                    }
                                                                    let _json;
                                                                    try {
                                                                        _json = JSON.stringify(v);
                                                                    } catch (_e) {
                                                                        return '[obj]';
                                                                    }
                                                                    return _json.length > 24
                                                                        ? _json.slice(0, 23) + '…'
                                                                        : _json;
                                                                };
                                                                const _shown = _entries.slice(0, 3);
                                                                const _extra = Math.max(0, _entries.length - 3);
                                                                let _fullJson;
                                                                try {
                                                                    _fullJson = JSON.stringify(lesson.metadata, null, 2);
                                                                } catch (_e) {
                                                                    _fullJson = '[unable to serialize]';
                                                                }
                                                                return (
                                                                    <>
                                                                        {_shown.map(([k, v], _idx) => (
                                                                            <span
                                                                                key={`meta-${k}`}
                                                                                className={styles.detailItemCounter}
                                                                                title={`${k}: ${_fmtVal(v)}`}
                                                                            >
                                                                                {k}: {_fmtVal(v)}
                                                                            </span>
                                                                        ))}
                                                                        {_extra > 0 && (
                                                                            <span
                                                                                className={styles.detailItemCounter}
                                                                                title={_fullJson}
                                                                            >
                                                                                +{_extra} más
                                                                            </span>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        </>
                                    );
                                })()}

                                {/* Tab "Ajustes" (P2-HIST-AUDIT-2) — coherence-history
                                    detail. Renderiza entries del
                                    `_shopping_coherence_block_history` con su
                                    action_taken (degrade/reject_minor/reject_high/
                                    hydration_error/not_applicable/
                                    post_swap_revalidation) y el ts. */}
                                {activeModalTab === 'adjustments' && (() => {
                                    const _data = coherenceHistoryCache[selectedPlan.id];
                                    if (_data === 'loading' || _data === undefined) {
                                        return (
                                            <div className={styles.modalDetailEmpty}>
                                                Cargando ajustes…
                                            </div>
                                        );
                                    }
                                    if (_data === 'error') {
                                        return (
                                            <div className={styles.modalDetailEmpty}>
                                                No se pudo cargar el detalle. Intenta cerrar y reabrir el modal.
                                            </div>
                                        );
                                    }
                                    const _list = Array.isArray(_data) ? _data : [];
                                    if (_list.length === 0) {
                                        return (
                                            <div className={styles.modalDetailEmpty}>
                                                Este plan no tiene ajustes registrados.
                                            </div>
                                        );
                                    }
                                    // Reverse para mostrar más recientes primero
                                    // (el array es append-only en el backend).
                                    const _ordered = [..._list].reverse();
                                    return (
                                        <ul className={styles.detailList}>
                                            {_ordered.map((entry, idx) => {
                                                const _action = (entry && typeof entry.action_taken === 'string')
                                                    ? entry.action_taken
                                                    : '—';
                                                // [P1-3 · 2026-05-10] Etiqueta es-DO + fallback al code crudo
                                                // (preserva diagnóstico cuando el catálogo va detrás del backend).
                                                const _actionLabel = getCoherenceActionLabel(_action) || _action;
                                                const _ts = (entry && typeof entry.ts === 'string')
                                                    ? new Date(entry.ts).toLocaleString('es-DO', {
                                                        month: 'short', day: 'numeric',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })
                                                    : '';
                                                // [P1-3 · 2026-05-10] Top-3 hipótesis distintas del entry.
                                                // `divergences` es lista de {food, hypothesis, ...}; deduplicamos
                                                // por hypothesis y mostramos máx 3 chips. Defensa contra non-array
                                                // y entries malformados (ts/action ya defendidos arriba).
                                                const _divs = Array.isArray(entry && entry.divergences)
                                                    ? entry.divergences
                                                    : [];
                                                const _hypSet = new Set();
                                                for (const d of _divs) {
                                                    if (d && typeof d.hypothesis === 'string' && d.hypothesis) {
                                                        _hypSet.add(d.hypothesis);
                                                    }
                                                    if (_hypSet.size >= 3) break;
                                                }
                                                const _hyps = [..._hypSet];
                                                return (
                                                    <li key={idx} className={styles.detailItem}>
                                                        <div className={styles.detailItemHeader}>
                                                            <span
                                                                className={styles.detailItemBadge}
                                                                title={_action}
                                                            >
                                                                {_actionLabel}
                                                            </span>
                                                            <span className={styles.detailItemMeta}>{_ts}</span>
                                                        </div>
                                                        {_hyps.length > 0 && (
                                                            <>
                                                                {_hyps.map((h) => {
                                                                    const _hLabel = getCoherenceHypothesisLabel(h) || h;
                                                                    return (
                                                                        <span
                                                                            key={`hyp-${h}`}
                                                                            className={styles.detailItemCounter}
                                                                            title={h}
                                                                        >
                                                                            {_hLabel}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    );
                                })()}

                                {/* Tab "Métricas" (P2-HIST-AUDIT-10) — lazy-loaded.
                                    Renderiza una tarjeta por chunk con stats
                                    operacionales (duration_ms, lag_seconds,
                                    quality_tier, retries, was_degraded) y
                                    keys principales del jsonb learning_metrics
                                    que SÍ tienen productor (recovery_attempts,
                                    escalation_reason, shuffle_*). El raw jsonb queda
                                    accesible vía un detalle expandible `<pre>`
                                    para diagnóstico avanzado.
                                    [G14-DOC-DRIFT · 2026-05-29] synth_quality_score /
                                    synthesized_count / queue_count NO viven en
                                    learning_metrics (G8 las removió de
                                    `_LM_DISPLAY_GROUPS`): synthesized_count/queue_count
                                    vienen de chunk_lesson_telemetry (objeto `lesson`,
                                    ~L3487-3494); synth_quality_score no se computa. */}
                                {activeModalTab === 'metrics' && (() => {
                                    const _data = chunkMetricsCache[selectedPlan.id];
                                    if (_data === 'loading' || _data === undefined) {
                                        return (
                                            <div className={styles.modalDetailEmpty}>
                                                Cargando métricas por chunk…
                                            </div>
                                        );
                                    }
                                    if (_data === 'error') {
                                        return (
                                            <div className={styles.modalDetailEmpty}>
                                                No se pudo cargar el detalle. Intenta cerrar y reabrir el modal.
                                            </div>
                                        );
                                    }
                                    const _rawList = Array.isArray(_data) ? _data : [];
                                    // [P0-HIST-FIX-10 · 2026-05-09] Filtrar
                                    // chunks fuera del rango de días del
                                    // plan, NO por week_number.
                                    //
                                    // FIX-7 anterior usaba `week_number <=
                                    // ceil(displayTotal/7)`. Esto era correcto
                                    // para detectar chunks fantasma en planes
                                    // cortos (test seeds), pero ERRÓNEO en
                                    // planes largos: el sistema asigna
                                    // week_number = MAX+1 secuencial (ver
                                    // routers/plans.py:1745), NO cronológico.
                                    // Plan 30d con 8 chunks tiene week_numbers
                                    // 1..8 — FIX-7 ocultaba weeks 6,7,8
                                    // aunque sus días (24-30) estuvieran
                                    // dentro del plan.
                                    //
                                    // FIX-10 valida con la métrica correcta:
                                    // days_offset + days_count <= total. Esto
                                    // captura phantoms reales (chunk con días
                                    // fuera del plan) sin penalizar chunks
                                    // legítimos con week_number alto.
                                    //
                                    // Fallback a week_number para chunks
                                    // legacy sin days_offset/days_count.
                                    const _filterActiveTotal = (
                                        typeof selectedPlan.total_days_requested === 'number'
                                            ? selectedPlan.total_days_requested
                                            : (typeof selectedPlan.plan_data?.total_days_requested === 'number'
                                                ? selectedPlan.plan_data.total_days_requested
                                                : (typeof selectedPlan.plan_data?.totalDays === 'number'
                                                    ? selectedPlan.plan_data.totalDays
                                                    : 0))
                                    );
                                    const _filterLegacyTotal = (typeof selectedPlan.plan_data?.totalDays === 'number')
                                        ? selectedPlan.plan_data.totalDays
                                        : 0;
                                    const _filterDisplayTotal = Math.max(_filterActiveTotal, _filterLegacyTotal);
                                    const _maxValidWeek = _filterDisplayTotal > 0
                                        ? Math.ceil(_filterDisplayTotal / 7)
                                        : Number.POSITIVE_INFINITY;
                                    const _list = _rawList.filter((c) => {
                                        // FIX-10: validar por rango de días
                                        // si el chunk los expone.
                                        if (typeof c.days_offset === 'number'
                                            && typeof c.days_count === 'number'
                                            && _filterDisplayTotal > 0) {
                                            return (c.days_offset + c.days_count) <= _filterDisplayTotal;
                                        }
                                        // Fallback legacy: chunks sin
                                        // days_offset/days_count caen al
                                        // filtro por week_number.
                                        if (typeof c.week_number !== 'number') return true;
                                        return c.week_number <= _maxValidWeek;
                                    });
                                    const _filteredOutCount = _rawList.length - _list.length;
                                    if (_list.length === 0) {
                                        return (
                                            <div className={styles.modalDetailEmpty}>
                                                {_filteredOutCount > 0
                                                    ? `Este plan tiene ${_filteredOutCount} chunk(s) registrados pero ninguno corresponde al alcance del plan (${_maxValidWeek} semana${_maxValidWeek === 1 ? '' : 's'}).`
                                                    : 'Este plan no tiene métricas registradas todavía.'}
                                            </div>
                                        );
                                    }
                                    // Helper local: formatear duration_ms
                                    // como "X.Y s" si >= 1000ms, sino "Nms".
                                    const _fmtDuration = (ms) => {
                                        if (typeof ms !== 'number' || ms < 0) return null;
                                        if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
                                        return `${ms} ms`;
                                    };
                                    // [P1-HIST-CHUNK-TIMESTAMPS · 2026-05-09]
                                    // Helper: formatea ISO timestamp como
                                    // tiempo relativo legible ("hace 2h",
                                    // "hace 1d 3h", "ahora"). Devuelve
                                    // `{rel, iso}` para que el caller pueda
                                    // mostrar el relative en el chip y el
                                    // ISO completo en el `title=` (tooltip).
                                    // Diseñado para escalated_at y
                                    // learning_persisted_at que vienen del
                                    // endpoint chunk-metrics como ISO 8601.
                                    //
                                    // Returns null si el input no parsea —
                                    // chip se omite silente. ISO con
                                    // zona horaria local (Date.toLocaleString)
                                    // para que el operador vea su timestamp
                                    // sin hacer math mental UTC→DO.
                                    const _fmtRelTime = (iso) => {
                                        if (!iso || typeof iso !== 'string') return null;
                                        const _d = new Date(iso);
                                        if (Number.isNaN(_d.getTime())) return null;
                                        const _diffMs = Date.now() - _d.getTime();
                                        // Future timestamps (clock skew o
                                        // bug del backend): mostramos como
                                        // "ahora" en lugar de "hace -5m".
                                        if (_diffMs < 0) {
                                            return {
                                                rel: 'ahora',
                                                iso: _d.toLocaleString('es-DO'),
                                            };
                                        }
                                        const _sec = Math.floor(_diffMs / 1000);
                                        const _min = Math.floor(_sec / 60);
                                        const _h = Math.floor(_min / 60);
                                        const _days = Math.floor(_h / 24);
                                        let _rel;
                                        if (_sec < 60) _rel = 'hace <1m';
                                        else if (_min < 60) _rel = `hace ${_min}m`;
                                        else if (_h < 24) {
                                            const _remMin = _min - _h * 60;
                                            _rel = _remMin > 0
                                                ? `hace ${_h}h ${_remMin}m`
                                                : `hace ${_h}h`;
                                        } else {
                                            const _remH = _h - _days * 24;
                                            _rel = _remH > 0
                                                ? `hace ${_days}d ${_remH}h`
                                                : `hace ${_days}d`;
                                        }
                                        return {
                                            rel: _rel,
                                            iso: _d.toLocaleString('es-DO'),
                                        };
                                    };
                                    // [P1-HIST-LM-WHITELIST · 2026-05-09]
                                    // Whitelist categorizada de learning_metrics
                                    // por-chunk. Antes la whitelist tenía solo 5
                                    // keys (síntesis/escalación) y ocultaba ~20
                                    // keys ricas que `cron_tasks.py:18339-19651`
                                    // persiste en cada chunk: porcentajes de
                                    // repetición, violaciones de rechazos/
                                    // alergias/fatiga, sample preview lists,
                                    // proxies de pantry/logging, etc. Para
                                    // diagnosticar "por qué este chunk repitió
                                    // ingredientes" o "qué pantry signal usó
                                    // el cron al generar este día" había que
                                    // ir a admin/SQL — ahora visible en el modal.
                                    //
                                    // Estructura: 4 grupos con sub-header. Cada
                                    // entry es [key, label, type] donde type ∈
                                    //   'number' (raw)
                                    //   'int' (Math.round)
                                    //   'pct' (suffix '%' + 1 decimal)
                                    //   'bool' (Sí/No)
                                    //   'preview' (truncate primer item de array)
                                    //   'severity' (warn class si > 0)
                                    //   'severity_high' (bad class si > 0 — alergias)
                                    //   'hours' (suffix 'h' + 1 decimal)
                                    //   'str' (raw string truncado)
                                    //
                                    // Drift detection: el test
                                    // `test_p1_hist_lm_whitelist_keys.py` parsea
                                    // cron_tasks.py y verifica que cada key
                                    // emitida por el writer aparezca en este
                                    // catálogo (warn loud si el writer agrega
                                    // una key sin que la UI la categorice).
                                    const _LM_DISPLAY_GROUPS = [
                                        {
                                            id: 'synthesis',
                                            title: 'Síntesis y escalación',
                                            keys: [
                                                // [G8-LM-CATALOG-HONESTY · 2026-05-29] Removidas
                                                // synth_quality_score / synthesized_count / queue_count:
                                                // NO tienen productor en plan_chunk_queue.learning_metrics
                                                // (_lm) → renderizaban SIEMPRE en blanco para todo plan.
                                                // synthesized_count y queue_count viven en
                                                // chunk_lesson_telemetry (objeto `lesson`, ya renderizado
                                                // arriba ~L3487-3494); synth_quality_score no se computa en
                                                // ningún lado del repo. Pertenecen a la superficie de
                                                // telemetría, NO al catálogo de learning_metrics.
                                                // recovery_attempts / escalation_reason SÍ tienen productor
                                                // (merge de _escalate_unrecoverable_chunk) → se quedan.
                                                ['recovery_attempts', 'Reintentos recovery', 'int'],
                                                ['escalation_reason', 'Razón escalación', 'str'],
                                                ['shuffle_learning_applied', 'Shuffle aplicado', 'bool'],
                                                ['shuffle_source', 'Fuente shuffle', 'str'],
                                                ['learning_confidence', 'Confianza aprendizaje', 'str'],
                                                ['pipeline_failed', 'Pipeline falló', 'bool'],
                                            ],
                                        },
                                        {
                                            id: 'repetition',
                                            title: 'Repetición',
                                            keys: [
                                                ['learning_repeat_pct', 'Meals repetidos', 'pct'],
                                                ['ingredient_base_repeat_pct', 'Bases repetidas', 'pct'],
                                                ['total_new_meals', 'Meals del chunk', 'int'],
                                                ['prior_meals_count', 'Meals previos', 'int'],
                                                ['prior_meal_bases_count', 'Bases previas', 'int'],
                                                ['rejected_count', 'Rechazos previos', 'int'],
                                                ['allergy_keywords_count', 'Keywords alergia', 'int'],
                                                ['sample_repeats', 'Ejemplos repetidos', 'preview'],
                                                ['sample_repeated_bases', 'Ejemplos bases', 'preview'],
                                            ],
                                        },
                                        {
                                            id: 'violations',
                                            title: 'Violaciones',
                                            keys: [
                                                ['rejection_violations', 'Rechazos', 'severity'],
                                                ['allergy_violations', 'Alergias', 'severity_high'],
                                                ['fatigued_violations', 'Fatiga', 'severity'],
                                                ['pantry_quantity_violations', 'Cantidades pantry', 'severity'],
                                                ['sample_rejection_hits', 'Ej. rechazos', 'preview'],
                                                ['sample_allergy_hits', 'Ej. alergias', 'preview'],
                                                ['sample_pantry_quantity_violations', 'Ej. cantidades', 'str'],
                                            ],
                                        },
                                        {
                                            id: 'pantry',
                                            title: 'Pantry y señal',
                                            keys: [
                                                ['inventory_activity_proxy_used', 'Proxy inventario', 'bool'],
                                                ['inventory_activity_mutations', 'Mutaciones inv.', 'int'],
                                                ['sparse_logging_proxy_used', 'Proxy logging', 'bool'],
                                                ['learning_signal_strength', 'Fuerza señal', 'str'],
                                                ['pantry_degraded_reason', 'Pantry degradada', 'str'],
                                                ['pantry_snapshot_age_hours_at_pickup', 'Edad snapshot', 'hours'],
                                            ],
                                        },
                                    ];

                                    // Helper: formatea valor según tipo
                                    // declarado en _LM_DISPLAY_GROUPS. Devuelve
                                    // {text, severity} donde severity ∈
                                    // 'warn' / 'bad' / null. NO renderiza —
                                    // el caller arma el span con la clase.
                                    const _fmtLmValue = (v, type) => {
                                        if (v === null || v === undefined) {
                                            return null;
                                        }
                                        switch (type) {
                                            case 'bool':
                                                if (typeof v !== 'boolean') return null;
                                                return { text: v ? 'Sí' : 'No', severity: null };
                                            case 'int': {
                                                const _n = Number(v);
                                                if (!Number.isFinite(_n)) return null;
                                                return { text: String(Math.round(_n)), severity: null };
                                            }
                                            case 'number': {
                                                const _n = Number(v);
                                                if (!Number.isFinite(_n)) return null;
                                                return { text: String(_n), severity: null };
                                            }
                                            case 'pct': {
                                                // Backend emite 0-100 (no 0-1).
                                                // Ver _calculate_learning_metrics
                                                // (cron_tasks.py:15112): repeat_pct
                                                // se redondea a (count/total)*100.
                                                const _n = Number(v);
                                                if (!Number.isFinite(_n)) return null;
                                                let _sev = null;
                                                if (_n > 60) _sev = 'bad';
                                                else if (_n > 20) _sev = 'warn';
                                                return { text: `${_n.toFixed(1)}%`, severity: _sev };
                                            }
                                            case 'hours': {
                                                const _n = Number(v);
                                                if (!Number.isFinite(_n)) return null;
                                                let _sev = null;
                                                if (_n > 48) _sev = 'bad';
                                                else if (_n > 12) _sev = 'warn';
                                                return { text: `${_n.toFixed(1)}h`, severity: _sev };
                                            }
                                            case 'severity': {
                                                const _n = Number(v);
                                                if (!Number.isFinite(_n)) return null;
                                                if (_n <= 0) return null;  // no render para 0
                                                return { text: String(Math.round(_n)), severity: 'warn' };
                                            }
                                            case 'severity_high': {
                                                const _n = Number(v);
                                                if (!Number.isFinite(_n)) return null;
                                                if (_n <= 0) return null;
                                                return { text: String(Math.round(_n)), severity: 'bad' };
                                            }
                                            case 'preview': {
                                                // sample_* puede ser list[str] o
                                                // list[dict] (sample_repeated_bases
                                                // tiene shape `{meal, bases}`).
                                                if (!Array.isArray(v) || v.length === 0) return null;
                                                const _first = v[0];
                                                let _txt;
                                                if (typeof _first === 'string') {
                                                    _txt = _first;
                                                } else if (_first && typeof _first === 'object') {
                                                    // dict: prefer `meal` key, fallback al primero.
                                                    _txt = _first.meal
                                                        || Object.values(_first)[0]
                                                        || JSON.stringify(_first);
                                                    _txt = String(_txt);
                                                } else {
                                                    _txt = String(_first);
                                                }
                                                if (_txt.length > 28) _txt = _txt.slice(0, 27) + '…';
                                                const _suffix = v.length > 1 ? ` +${v.length - 1}` : '';
                                                return { text: `${_txt}${_suffix}`, severity: null };
                                            }
                                            case 'str':
                                            default: {
                                                if (typeof v !== 'string') return null;
                                                const _t = v.trim();
                                                if (!_t) return null;
                                                return {
                                                    text: _t.length > 32 ? _t.slice(0, 31) + '…' : _t,
                                                    severity: null,
                                                };
                                            }
                                        }
                                    };
                                    // [P1-HIST-NEW-4 · 2026-05-09] Notice
                                    // de truncado cuando el endpoint
                                    // chunk-metrics aplicó LIMIT 50 y hay
                                    // más chunks reales que renderizables.
                                    // `chunkMetricsMeta[planId]` viene del
                                    // _ensureChunkMetrics tras el fetch
                                    // (P1-HIST-NEW-4 backend devuelve
                                    // total_count + limit). Si meta es
                                    // undefined (deploy lag inverso o
                                    // backend pre-fix), el notice no
                                    // aparece — degrada silente al
                                    // comportamiento previo.
                                    const _meta = chunkMetricsMeta[selectedPlan.id];
                                    const _totalCount = (_meta && typeof _meta.total_count === 'number')
                                        ? _meta.total_count : null;
                                    // [P0-HIST-FIX-7 · 2026-05-09] Restamos los
                                    // chunks fantasma filtrados al total para
                                    // que el notice "Mostrando X de Y" sea
                                    // coherente con el alcance del plan. Si el
                                    // backend reportó 4 chunks pero filtramos
                                    // 1 fantasma de week_number=2, el user-facing
                                    // total es 3 (los del plan real).
                                    const _adjustedTotal = _totalCount !== null
                                        ? Math.max(0, _totalCount - _filteredOutCount)
                                        : null;
                                    const _truncated = _adjustedTotal !== null
                                        && _adjustedTotal > _list.length;
                                    return (
                                        <>
                                            {_truncated && (
                                                <div
                                                    className={`${styles.modalDetailEmpty} ${styles.metricsTruncatedNotice}`}
                                                    role="status"
                                                    title={`El plan tiene ${_adjustedTotal} chunks dentro de su alcance${_filteredOutCount > 0 ? ` (más ${_filteredOutCount} chunk(s) fuera del alcance que se omitieron)` : ''}; el endpoint cap a ${_meta.limit ?? 50} para evitar payloads grandes.`}
                                                >
                                                    Mostrando {_list.length} de {_adjustedTotal} chunks. Los más antiguos no aparecen — usa el panel admin si necesitas el detalle completo.
                                                </div>
                                            )}
                                        <ul className={styles.detailList}>
                                            {_list.map((c) => {
                                                const _wkLabel = (typeof c.week_number === 'number')
                                                    ? `Semana ${c.week_number}`
                                                    : 'Chunk';
                                                // [P2-HIST-NEW-4 · 2026-05-09]
                                                // Humanización del chunk_kind. Antes
                                                // el badge mostraba el snake_case
                                                // crudo del backend ("rolling_refill",
                                                // "initial_plan") visible al usuario
                                                // final. Asimetría con _TIER_LABELS
                                                // del tier breakdown que sí mapea.
                                                // El helper devuelve null para codes
                                                // desconocidos — caemos al code crudo
                                                // (mejor mostrar `· rolling_refill_v2`
                                                // que silenciar la señal del chunk).
                                                const _kindRaw = c.chunk_kind || '';
                                                const _kindLabelText = _kindRaw
                                                    ? (getChunkKindLabel(_kindRaw) || _kindRaw)
                                                    : '';
                                                const _kindLabel = _kindLabelText
                                                    ? ` · ${_kindLabelText}`
                                                    : '';
                                                // [P2-HIST-NEW-3 · 2026-05-09] Rango
                                                // de días concretos del chunk —
                                                // permite correlacionar la card de
                                                // Métricas con el menú renderizado
                                                // del tab Menú.
                                                //
                                                // [P0-HIST-FIX-6 · 2026-05-09] Ajuste
                                                // por días expirados (shift_plan).
                                                // Cuando el cron rolling trimmea un
                                                // día pasado (ej. Viernes), el
                                                // backend MUTA `days_count` del
                                                // first_chunk (de 3 → 2 si Vie cayó)
                                                // Y `days_offset` de los chunks
                                                // posteriores (re-indexa el array).
                                                //
                                                // El user espera ver la NUMERACIÓN
                                                // ORIGINAL: first_chunk días 1-3
                                                // (incluyendo Vie expirado), refill
                                                // días 4-7 — coherente con el
                                                // "plan de 7 días" que nombró.
                                                //
                                                // Heurística:
                                                //   - Calculamos `_expiredDays` a
                                                //     nivel modal usando el mismo
                                                //     método que el missing-days
                                                //     block (legacy totalDays vs
                                                //     active total_days_requested).
                                                //   - Para chunks first_chunk /
                                                //     initial_plan: count += expired
                                                //     (los días expirados venían
                                                //     de este chunk).
                                                //   - Para los demás: offset +=
                                                //     expired (su offset se
                                                //     decrementó cuando el array
                                                //     se re-indexó).
                                                const _planActiveTotal = (
                                                    typeof selectedPlan.total_days_requested === 'number'
                                                        ? selectedPlan.total_days_requested
                                                        : (typeof selectedPlan.plan_data?.total_days_requested === 'number'
                                                            ? selectedPlan.plan_data.total_days_requested
                                                            : (typeof selectedPlan.plan_data?.totalDays === 'number'
                                                                ? selectedPlan.plan_data.totalDays
                                                                : 0))
                                                );
                                                const _planLegacyTotal = (typeof selectedPlan.plan_data?.totalDays === 'number')
                                                    ? selectedPlan.plan_data.totalDays
                                                    : 0;
                                                const _planDisplayTotal = Math.max(_planActiveTotal, _planLegacyTotal);
                                                const _planExpiredDays = Math.max(0, _planDisplayTotal - _planActiveTotal);
                                                const _isFirstKind = c.chunk_kind === 'first_chunk'
                                                    || c.chunk_kind === 'initial_plan';
                                                let _adjustedOffset = c.days_offset;
                                                let _adjustedCount = c.days_count;
                                                if (_planExpiredDays > 0
                                                    && typeof c.days_offset === 'number'
                                                    && typeof c.days_count === 'number') {
                                                    if (_isFirstKind) {
                                                        // Days_count del first_chunk
                                                        // fue decrementado por el
                                                        // trim — sumamos los
                                                        // expirados de vuelta.
                                                        _adjustedCount = c.days_count + _planExpiredDays;
                                                    } else {
                                                        // Otros chunks: offset
                                                        // shifteado por el re-index
                                                        // del array; sumamos los
                                                        // expirados al offset.
                                                        _adjustedOffset = c.days_offset + _planExpiredDays;
                                                    }
                                                }
                                                let _daysLabel = '';
                                                if (typeof _adjustedOffset === 'number'
                                                    && _adjustedOffset >= 0
                                                    && typeof _adjustedCount === 'number'
                                                    && _adjustedCount >= 1) {
                                                    const _start = _adjustedOffset + 1;
                                                    const _end = _adjustedOffset + _adjustedCount;
                                                    _daysLabel = _adjustedCount === 1
                                                        ? ` · Día ${_start}`
                                                        : ` · Días ${_start}–${_end}`;
                                                }
                                                const _tier = c.quality_tier || '—';
                                                const _duration = c.metrics
                                                    ? _fmtDuration(c.metrics.duration_ms)
                                                    : null;
                                                const _lag = (c.metrics && typeof c.metrics.lag_seconds === 'number')
                                                    ? c.metrics.lag_seconds
                                                    : c.lag_seconds_at_pickup;
                                                const _lm = (c.learning_metrics && typeof c.learning_metrics === 'object')
                                                    ? c.learning_metrics
                                                    : null;
                                                // [P0-HIST-FIX-5 · 2026-05-09]
                                                // Meta line humanizada:
                                                //   Antes: "completed · tier: —"
                                                //   Ahora: "Completado" o
                                                //          "Completado · LLM"
                                                //          (omitiendo tier "—").
                                                // Status crudo (`completed`,
                                                // `pending`) era ruidoso y no
                                                // comunicaba al user lo que
                                                // significaba "pending" — ¿en
                                                // cola? ¿esperando? El helper
                                                // `getChunkStatusLabel` mapea
                                                // a labels es-DO.
                                                const _statusLabel = getChunkStatusLabel(c.status) || c.status;
                                                const _hasTier = c.quality_tier
                                                    && typeof c.quality_tier === 'string'
                                                    && c.quality_tier.trim();
                                                const _tierLabel = _hasTier
                                                    ? c.quality_tier.toUpperCase()
                                                    : null;
                                                return (
                                                    <li key={c.chunk_id} className={styles.detailItem}>
                                                        <div className={styles.detailItemHeader}>
                                                            <span className={styles.detailItemBadge}>
                                                                {_wkLabel}{_kindLabel}{_daysLabel}
                                                            </span>
                                                            <span className={styles.detailItemMeta}>
                                                                {_statusLabel}
                                                                {_tierLabel && ` · ${_tierLabel}`}
                                                            </span>
                                                        </div>
                                                        <div className={styles.detailItemBody}>
                                                            {/* [P0-HIST-FIX-5 · 2026-05-09]
                                                                Tooltips explicativos en cada chip
                                                                para que el operator entienda QUÉ
                                                                mide cada métrica sin abrir docs. */}
                                                            {_duration && (
                                                                <span className={styles.detailItemCounter}
                                                                      title="Tiempo total que tardó el LLM en generar los días de este chunk.">
                                                                    Duración: {_duration}
                                                                </span>
                                                            )}
                                                            {typeof _lag === 'number' && (
                                                                <span className={styles.detailItemCounter}
                                                                      title="Demora entre que el chunk se programó y el worker lo agarró. >0s típico en horas pico; >SLA indica saturación.">
                                                                    Espera: {_lag}s
                                                                </span>
                                                            )}
                                                            {typeof c.attempts === 'number' && c.attempts > 0 && (
                                                                <span className={styles.detailItemCounter}
                                                                      title={`El chunk fue procesado ${c.attempts} ${c.attempts === 1 ? 'vez' : 'veces'} (intentos de reintento si falló).`}>
                                                                    Intentos: {c.attempts}
                                                                </span>
                                                            )}
                                                            {/* [P0-HIST-FIX-5 · 2026-05-09] "Degraded" →
                                                                "Calidad reducida" en es-DO claro.
                                                                Tooltip explica al user qué significa
                                                                (cron generó días en modo simplificado
                                                                — shuffle/edge/emergency tier — porque
                                                                el LLM falló o pantry tenía señal débil). */}
                                                            {c.metrics && c.metrics.was_degraded === true && (
                                                                <span className={`${styles.detailItemCounter} ${styles.tierBadgeWarn}`}
                                                                      title="Días generados en modo simplificado tras un fallo del LLM o señal débil de pantry. La calidad nutricional puede ser menor.">
                                                                    Calidad reducida
                                                                </span>
                                                            )}
                                                            {c.metrics && typeof c.metrics.learning_repeat_pct === 'number' && (
                                                                <span className={styles.detailItemCounter}
                                                                      title="% de meals en este chunk que repiten meals de chunks previos. >50% indica falta de variedad.">
                                                                    Repetición: {Math.round(c.metrics.learning_repeat_pct * 100)}%
                                                                </span>
                                                            )}
                                                            {c.dead_letter_reason && (
                                                                <span className={`${styles.detailItemCounter} ${styles.tierBadgeBad}`}
                                                                      title={`Razón por la que el chunk no se pudo recuperar automáticamente: ${c.dead_letter_reason}`}>
                                                                    No recuperable: {c.dead_letter_reason}
                                                                </span>
                                                            )}
                                                            {/* [P1-HIST-NEW-1 · 2026-05-09] Render
                                                                de `error_message` (snapshot del
                                                                último intento commiteado a
                                                                plan_chunk_metrics). El endpoint
                                                                chunk-metrics ya lo devolvía en
                                                                `metrics.error_message` desde
                                                                P2-HIST-AUDIT-10 pero el frontend lo
                                                                descartaba — `dead_letter_reason`
                                                                (categórico) sí aparecía pero el
                                                                texto crudo del exception (la pista
                                                                más directa de "qué pasó") quedaba
                                                                invisible salvo via SQL.

                                                                Tratamiento:
                                                                  - Solo render cuando hay string
                                                                    no-vacío post-trim.
                                                                  - Whitespace+newlines colapsados
                                                                    para chip single-line.
                                                                  - Truncate visual a 80 chars con
                                                                    ellipsis; texto completo en
                                                                    `title=` tooltip.
                                                                  - Palette `tierBadgeBad` +
                                                                    `errorMessageBadge` (monospace
                                                                    + max-width) para diferenciar
                                                                    visualmente del badge categórico
                                                                    de `dead_letter_reason`. */}
                                                            {c.metrics
                                                                && typeof c.metrics.error_message === 'string'
                                                                && c.metrics.error_message.trim() && (() => {
                                                                const _raw = c.metrics.error_message.trim();
                                                                const _flat = _raw.replace(/\s+/g, ' ');
                                                                const _short = _flat.length > 80
                                                                    ? _flat.slice(0, 79) + '…'
                                                                    : _flat;
                                                                // [P0-HIST-FIX-9 · 2026-05-09]
                                                                // Render del error_message SOLO
                                                                // cuando es accionable para el user:
                                                                // status `failed` o `pending_user_action`.
                                                                //
                                                                // Para `pending`/`processing`/`stale`,
                                                                // el chunk fue re-encolado tras un
                                                                // intento previo fallido — el error
                                                                // es histórico y NO requiere acción
                                                                // del user (el cron lo retomará). El
                                                                // user reportó que ver "Último error"
                                                                // en un chunk en cola seguía siendo
                                                                // confuso aunque el label diferenciaba
                                                                // (P0-HIST-FIX-8).
                                                                //
                                                                // Para `completed`, el chunk ya
                                                                // superó el error — mostrarlo sería
                                                                // ruido (ya está hecho).
                                                                //
                                                                // Quien necesite el error histórico
                                                                // de un chunk en cola sigue teniendo
                                                                // los chips diagnósticos: "Intentos: N",
                                                                // "Calidad reducida", + admin tools.
                                                                const _shouldShowError = c.status === 'failed'
                                                                    || c.status === 'pending_user_action';
                                                                if (!_shouldShowError) return null;
                                                                return (
                                                                    <span
                                                                        className={`${styles.detailItemCounter} ${styles.tierBadgeBad} ${styles.errorMessageBadge}`}
                                                                        title={_raw}
                                                                    >
                                                                        Error: {_short}
                                                                    </span>
                                                                );
                                                            })()}
                                                            {/* [P1-HIST-CHUNK-TIMESTAMPS · 2026-05-09]
                                                                Render de `escalated_at` y
                                                                `learning_persisted_at`. El endpoint
                                                                chunk-metrics ya los devuelve desde
                                                                P2-HIST-AUDIT-10 pero el frontend los
                                                                descartaba. Críticos para post-mortem:
                                                                  - escalated_at: cuándo el cron
                                                                    escalator marcó este chunk como
                                                                    no-recoverable (sumar al status
                                                                    'failed' + dead_letter_reason).
                                                                    Aparece warn (amber) — no es
                                                                    error nuevo, es marca histórica.
                                                                  - learning_persisted_at: cuándo el
                                                                    learning del chunk se commiteó a
                                                                    plan_data._last_chunk_learning
                                                                    (ver T2 en cron_tasks). Aparece
                                                                    neutral si presente — es señal
                                                                    de que el chunk N+1 tiene la
                                                                    info para no repetir.
                                                                  - Si chunk completed PERO
                                                                    learning_persisted_at es null →
                                                                    bug de T2: el chunk shippó días
                                                                    pero el learning no se commiteó.
                                                                    Render warn "Sin learning". */}
                                                            {(() => {
                                                                const _esc = _fmtRelTime(c.escalated_at);
                                                                if (!_esc) return null;
                                                                return (
                                                                    <span className={`${styles.detailItemCounter} ${styles.tierBadgeWarn}`}
                                                                          title={`Escalado a no-recoverable el ${_esc.iso}`}>
                                                                        Escalado: {_esc.rel}
                                                                    </span>
                                                                );
                                                            })()}
                                                            {/* [P1-HIST-NEW-2 · 2026-05-09] Render
                                                                de `dead_lettered_at`. El endpoint
                                                                chunk-metrics ya lo devolvía desde
                                                                P2-HIST-AUDIT-10 pero el frontend
                                                                solo renderizaba `escalated_at`.
                                                                Asimetría sin razón: para chunks en
                                                                estado terminal, `dead_lettered_at`
                                                                es **el** timestamp canónico — el
                                                                punto en que el sistema dejó de
                                                                reintentar y aceptó la pérdida.
                                                                `escalated_at` es marca de transición
                                                                hacia ese estado.

                                                                Diferenciación visual:
                                                                  - `escalated_at` = warn (amber):
                                                                    transición hacia no-recoverable.
                                                                  - `dead_lettered_at` = bad (rojo):
                                                                    estado terminal aceptado.
                                                                Cuando ambos están presentes (caso
                                                                típico tras `_escalate_unrecoverable_chunk`)
                                                                aparecen consecutivos. Cuando solo
                                                                `dead_lettered_at` (paths sin escalación
                                                                explícita: timeout cron, mark-dead
                                                                manual), solo el chip terminal. */}
                                                            {(() => {
                                                                const _dl = _fmtRelTime(c.dead_lettered_at);
                                                                if (!_dl) return null;
                                                                return (
                                                                    <span className={`${styles.detailItemCounter} ${styles.tierBadgeBad}`}
                                                                          title={`Dead-letter (estado terminal) desde ${_dl.iso}. El sistema dejó de reintentar este chunk.`}>
                                                                        Dead-letter: {_dl.rel}
                                                                    </span>
                                                                );
                                                            })()}
                                                            {(() => {
                                                                const _lp = _fmtRelTime(c.learning_persisted_at);
                                                                if (_lp) {
                                                                    return (
                                                                        <span className={styles.detailItemCounter}
                                                                              title={`Learning commiteado el ${_lp.iso} — disponible para chunks posteriores.`}>
                                                                            Learning: {_lp.rel}
                                                                        </span>
                                                                    );
                                                                }
                                                                // Edge case T2 fail: completed sin
                                                                // learning persistido. Si fue completed
                                                                // pero T2 crasheó, el chunk N+1 va a
                                                                // empezar sin señal del N — peligro
                                                                // de regenerar meals repetidos.
                                                                if (c.status === 'completed') {
                                                                    // [P0-HIST-FIX-5 · 2026-05-09] "Sin
                                                                    // learning" → "Sin aprendizaje guardado"
                                                                    // — más explícito sobre qué pasó. El
                                                                    // tooltip explica el impacto: chunks
                                                                    // posteriores pueden repetir comidas.
                                                                    return (
                                                                        <span className={`${styles.detailItemCounter} ${styles.tierBadgeWarn}`}
                                                                              title="El chunk generó los días pero el aprendizaje (qué meals propusimos, qué evitar) no se guardó. Los próximos chunks pueden repetir comidas que este ya propuso.">
                                                                            Sin aprendizaje guardado
                                                                        </span>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
                                                            {/* [P2-HIST-AUDIT-B · 2026-05-09]
                                                                expected_preemption_seconds:
                                                                SLA esperado al pickup. Solo
                                                                render si non-null Y > 0
                                                                (chunks sin reserva tienen 0). */}
                                                            {typeof c.expected_preemption_seconds === 'number'
                                                                && c.expected_preemption_seconds > 0 && (
                                                                <span className={styles.detailItemCounter}
                                                                      title="SLA esperado: tiempo predicho hasta el pickup del chunk. Útil para comparar con lag real.">
                                                                    SLA: {c.expected_preemption_seconds}s
                                                                </span>
                                                            )}
                                                            {/* [P1-HIST-NEW-5 · 2026-05-09] Ratio
                                                                lag/SLA visualizado. Antes el operator
                                                                tenía que hacer math mental entre los
                                                                chips `Lag: 240s` y `SLA: 60s`
                                                                independientes para detectar "tomó 4×
                                                                lo esperado" — señal crítica de
                                                                worker pool saturation o lock heredado.
                                                                Ahora un chip dedicado aparece cuando
                                                                el ratio supera el threshold:
                                                                  - 2×–4×: warn (amber).
                                                                  - ≥5×: bad (rojo) — anomalía severa.
                                                                Solo se renderiza cuando ambos son
                                                                números válidos > 0 (chunks sin
                                                                reserva tienen SLA=0/null y nunca
                                                                disparan el chip). */}
                                                            {(() => {
                                                                const _sla = c.expected_preemption_seconds;
                                                                if (typeof _sla !== 'number' || _sla <= 0) return null;
                                                                if (typeof _lag !== 'number' || _lag <= 0) return null;
                                                                const _ratio = _lag / _sla;
                                                                if (_ratio < 2) return null;
                                                                const _severe = _ratio >= 5;
                                                                const _label = _ratio >= 10
                                                                    ? `${Math.round(_ratio)}×`
                                                                    : `${_ratio.toFixed(1)}×`;
                                                                const _cls = _severe
                                                                    ? styles.tierBadgeBad
                                                                    : styles.tierBadgeWarn;
                                                                return (
                                                                    <span className={`${styles.detailItemCounter} ${_cls}`}
                                                                          title={`Lag (${_lag}s) supera el SLA esperado (${_sla}s) por ${_label}. ${_severe ? 'Anomalía severa: revisar worker pool / lock heredado.' : 'Worker pool bajo presión o cron lag.'}`}>
                                                                        Lag {_label} SLA
                                                                    </span>
                                                                );
                                                            })()}
                                                            {/* [P2-HIST-AUDIT-B · 2026-05-09]
                                                                reservation_status: 'fallback' es
                                                                señal warn (worker pool saturado al
                                                                pickup, el chunk cayó al fallback
                                                                queue). 'ok' es no-render (happy path). */}
                                                            {c.reservation_status === 'fallback' && (
                                                                <span className={`${styles.detailItemCounter} ${styles.tierBadgeWarn}`}
                                                                      title="Worker pool saturado al pickup — el chunk cayó al fallback queue.">
                                                                    Reserva: fallback
                                                                </span>
                                                            )}
                                                            {/* [P1-HIST-NEW-6 · 2026-05-09] Chip
                                                                de chunk_deferrals (cada vez que un
                                                                gate del pipeline LangGraph difirió
                                                                este chunk: temporal_gate,
                                                                learning_zero_logs,
                                                                missing_prior_lessons, etc.). Antes
                                                                solo visible vía endpoint admin —
                                                                ahora surface por chunk en post-mortem.

                                                                Threshold:
                                                                  - 1–2 deferrals: chip neutro
                                                                    (ruido normal del scheduler).
                                                                  - ≥3 deferrals: warn (amber) —
                                                                    señal de que el chunk peleó
                                                                    contra los gates antes de
                                                                    avanzar.
                                                                Tooltip lista las reasons DISTINCT —
                                                                un chunk con `temporal_gate` solo
                                                                vs uno con `temporal_gate +
                                                                learning_zero_logs` cuentan distinto
                                                                en post-mortem. */}
                                                            {typeof c.deferrals_count === 'number'
                                                                && c.deferrals_count > 0 && (() => {
                                                                const _n = c.deferrals_count;
                                                                const _reasons = Array.isArray(c.deferral_reasons)
                                                                    ? c.deferral_reasons : [];
                                                                const _warn = _n >= 3;
                                                                const _cls = _warn ? styles.tierBadgeWarn : '';
                                                                const _reasonsTxt = _reasons.length > 0
                                                                    ? _reasons.join(', ')
                                                                    : 'sin razón registrada';
                                                                return (
                                                                    <span className={`${styles.detailItemCounter} ${_cls}`}
                                                                          title={`Diferido ${_n} ${_n === 1 ? 'vez' : 'veces'} por gates del pipeline. Razones: ${_reasonsTxt}.`}>
                                                                        Diferido {_n}×
                                                                    </span>
                                                                );
                                                            })()}
                                                            {/* [P2-HIST-AUDIT-E · 2026-05-09]
                                                                Cross-check is_rolling_refill drift.
                                                                Solo render warn si el backend detectó
                                                                divergencia entre chunk_kind (queue,
                                                                vivo) y m.is_rolling_refill (snapshot
                                                                al completar) — bug del writer del
                                                                snapshot O recovery que cambió kind. */}
                                                            {c.is_rolling_refill_drift === true && (
                                                                <span className={`${styles.detailItemCounter} ${styles.tierBadgeWarn}`}
                                                                      title="Drift entre chunk_kind y is_rolling_refill del snapshot — chunk transicionó de kind durante recovery O bug del writer.">
                                                                    Kind drift
                                                                </span>
                                                            )}
                                                            {/* [P2-HIST-AUDIT-F · 2026-05-09]
                                                                Lock zombi: otro chunk del usuario
                                                                tiene el lock con heartbeat fresco
                                                                (<5min) — este chunk está
                                                                bloqueado por contención. Solo
                                                                aparece para chunks que estaban
                                                                pending/processing al pickup —
                                                                es señal diagnóstica per-chunk. */}
                                                            {typeof c.blocking_lock_chunk_id === 'string'
                                                                && c.blocking_lock_chunk_id.length > 0 && (
                                                                <span className={`${styles.detailItemCounter} ${styles.tierBadgeWarn}`}
                                                                      title={`Lock del usuario activo en otro chunk (${c.blocking_lock_chunk_id.slice(0, 8)}…). Lleva ${c.blocking_lock_age_seconds || '?'}s. Este chunk espera turno.`}>
                                                                    Lock zombi
                                                                </span>
                                                            )}
                                                        </div>
                                                        {/* [P1-HIST-LM-WHITELIST · 2026-05-09]
                                                            learning_metrics agrupado en 4
                                                            secciones (síntesis/repetición/
                                                            violaciones/pantry). Cada
                                                            grupo se omite si NINGUNA de
                                                            sus keys tiene valor — el chunk
                                                            que solo persistió `synth_*`
                                                            (failure pre-pipeline) muestra
                                                            solo el grupo "Síntesis", no
                                                            grupos vacíos. */}
                                                        {_lm && (() => {
                                                            const _renderedGroups = _LM_DISPLAY_GROUPS
                                                                .map((group) => {
                                                                    const _items = group.keys
                                                                        .map(([k, label, type]) => {
                                                                            const _fmt = _fmtLmValue(_lm[k], type);
                                                                            return _fmt ? { k, label, ..._fmt } : null;
                                                                        })
                                                                        .filter(Boolean);
                                                                    return _items.length > 0
                                                                        ? { id: group.id, title: group.title, items: _items }
                                                                        : null;
                                                                })
                                                                .filter(Boolean);
                                                            if (_renderedGroups.length === 0) return null;
                                                            return (
                                                                <div className={styles.lmGroupsContainer}>
                                                                    {_renderedGroups.map((g) => (
                                                                        <div key={g.id} className={styles.lmGroup}>
                                                                            <span className={styles.lmGroupTitle}>
                                                                                {g.title}
                                                                            </span>
                                                                            <div className={styles.lmGroupItems}>
                                                                                {g.items.map(({ k, label, text, severity }) => {
                                                                                    const _sevCls = severity === 'bad'
                                                                                        ? styles.tierBadgeBad
                                                                                        : (severity === 'warn'
                                                                                            ? styles.tierBadgeWarn
                                                                                            : '');
                                                                                    return (
                                                                                        <span key={k}
                                                                                              className={`${styles.detailItemCounter} ${_sevCls}`}
                                                                                              title={`${label}: ${text}`}>
                                                                                            {label}: {text}
                                                                                        </span>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })()}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        </>
                                    );
                                })()}

                                {/* Tab "Menú" (default — toda la lógica chunk-aware
                                    + meals existente) solo se renderiza si
                                    activeModalTab === 'menu'. */}
                                {activeModalTab === 'menu' && (
                                <>
                                {/* [P3-HIST-FAST-OPEN · 2026-05-18] Skeleton del
                                    menú mientras `plan_data` se carga en paralelo
                                    tras el optimistic open. Render solo cuando:
                                      1. El modal está abierto (selectedPlan truthy
                                         — garantizado por el wrapper).
                                      2. NO hay plan_data.days (helper devolverá
                                         [] cuando plan_data sea null).
                                      3. El fetch está en vuelo (`planDataLoading`)
                                         — si ya resolvió con plan vacío real (plan
                                         legacy corrupto sin days), NO mostramos
                                         skeleton perpetuo: el banner missingDays
                                         abajo se encarga.
                                    El skeleton imita el layout final (3-4 tabs
                                    pill + 4 meal cards) para que el swap sea
                                    fluido cuando llegue el data. */}
                                {planDataLoading && !(selectedPlan.plan_data && Array.isArray(selectedPlan.plan_data.days) && selectedPlan.plan_data.days.length > 0) && (
                                    <div className={styles.menuSkeleton}>
                                        <div className={styles.menuSkeletonTabs}>
                                            <div className={`${styles.menuSkeletonTab} ${styles.menuSkeletonTabActive}`} />
                                            <div className={styles.menuSkeletonTab} />
                                            <div className={styles.menuSkeletonTab} />
                                        </div>
                                        <div className={styles.menuSkeletonMeals}>
                                            {[0, 1, 2, 3].map((i) => (
                                                <div key={i} className={styles.menuSkeletonMeal}>
                                                    <div className={styles.menuSkeletonMealIcon} />
                                                    <div className={styles.menuSkeletonMealText}>
                                                        <div className={styles.menuSkeletonMealLine} />
                                                        <div className={`${styles.menuSkeletonMealLine} ${styles.menuSkeletonMealLineShort}`} />
                                                    </div>
                                                    <div className={styles.menuSkeletonMealKcal} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* [P1-HIST-1 · 2026-05-09] Day tabs chunk-aware con
                                    navegación read-only entre chunks. Cap por chunk
                                    se mantiene (≤4 días visibles a la vez); las flechas
                                    prev/next saltan al chunk siguiente/previo del plan
                                    archivado SIN reactivarlo (lectura, sin tocar el
                                    plan activo del usuario). Antes de P1-HIST-1 el modal
                                    forzaba reactivar (destructivo) para revisar más
                                    de los primeros 3-4 días. selectedDay es índice
                                    GLOBAL en plan_data.days; labels usan nombre de día
                                    calculado desde grocery_start_date + globalIdx. */}
                                {(() => {
                                    // [P1-HIST-COMPLETE-PROGRESS · 2026-05-31] Días
                                    // COMPLETOS (archivados + vigentes) — el Historial
                                    // muestra todo el progreso, NO la ventana rolling.
                                    const _planDays = _fullHistoryDays(selectedPlan.plan_data);
                                    const _totalDays = _planDays.length;
                                    if (_totalDays <= 1) return null;

                                    // Cap defensivo: necesario porque `splitWithAbsorb(5)=[5]`
                                    // (plan de 5d = 1 chunk de 5d). La regla "máximo 4 días
                                    // visibles a la vez" se mantiene sin importar el chunkSize.
                                    const _MAX_VISIBLE_DAYS = 4;
                                    const _allChunks = splitWithAbsorb(_totalDays);
                                    const _safeChunkIdx = Math.min(
                                        Math.max(activeChunkIdx, 0),
                                        _allChunks.length - 1
                                    );
                                    const _chunkSize = _allChunks[_safeChunkIdx];
                                    // Suma de tamaños de chunks previos = índice global
                                    // del primer día del chunk activo.
                                    const _chunkStart = _allChunks
                                        .slice(0, _safeChunkIdx)
                                        .reduce((acc, n) => acc + n, 0);
                                    const _visibleSize = Math.min(_chunkSize, _MAX_VISIBLE_DAYS);
                                    const _chunkEnd = _chunkStart + _visibleSize;
                                    const _chunkDays = _planDays.slice(_chunkStart, _chunkEnd);

                                    // Clamp defensivo: si selectedDay quedó fuera del chunk
                                    // activo (cambio de plan archivado, click en flecha),
                                    // default al primer día del chunk.
                                    const _visibleSelectedDay = (selectedDay >= _chunkStart && selectedDay < _chunkEnd)
                                        ? selectedDay
                                        : _chunkStart;

                                    const _hasPrev = _safeChunkIdx > 0;
                                    const _hasNext = _safeChunkIdx < _allChunks.length - 1;

                                    const _goPrevChunk = () => {
                                        if (!_hasPrev) return;
                                        const newIdx = _safeChunkIdx - 1;
                                        const newStart = _allChunks
                                            .slice(0, newIdx)
                                            .reduce((acc, n) => acc + n, 0);
                                        setActiveChunkIdx(newIdx);
                                        setSelectedDay(newStart);
                                    };
                                    const _goNextChunk = () => {
                                        if (!_hasNext) return;
                                        const newIdx = _safeChunkIdx + 1;
                                        const newStart = _allChunks
                                            .slice(0, newIdx)
                                            .reduce((acc, n) => acc + n, 0);
                                        setActiveChunkIdx(newIdx);
                                        setSelectedDay(newStart);
                                    };

                                    // [P1-HIST-COMPLETE-PROGRESS · 2026-05-31] Base de
                                    // fecha del timeline completo: `cycle_start_date`
                                    // (inicio original inmutable) cuando hay días
                                    // archivados; si no, `grocery_start_date`. Ver
                                    // `_historyLabelStart`.
                                    const _startMid = parseStartLocal(
                                        _historyLabelStart(selectedPlan.plan_data, selectedPlan.created_at)
                                    );

                                    return (
                                        <>
                                            {/* Nav inter-chunks. Solo se renderiza si el
                                                plan tiene más de un chunk (i.e., totalDays>4
                                                típicamente). Para planes ≤4 días el cap
                                                visible cubre todo y la nav sería ruido. */}
                                            {_allChunks.length > 1 && (
                                                <div className={styles.chunkNav}>
                                                    <button
                                                        type="button"
                                                        onClick={_goPrevChunk}
                                                        disabled={!_hasPrev}
                                                        className={styles.chunkNavBtn}
                                                        aria-label="Chunk anterior"
                                                    >
                                                        <ChevronLeft size={16} />
                                                    </button>
                                                    <span className={styles.chunkNavLabel}>
                                                        {`Días ${_chunkStart + 1}–${_chunkEnd} de ${_totalDays}`}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={_goNextChunk}
                                                        disabled={!_hasNext}
                                                        className={styles.chunkNavBtn}
                                                        aria-label="Chunk siguiente"
                                                    >
                                                        <ChevronRight size={16} />
                                                    </button>
                                                </div>
                                            )}
                                            <div className={styles.dayTabs}>
                                                {_chunkDays.map((_, localIdx) => {
                                                    const globalIdx = _chunkStart + localIdx;
                                                    const isActive = _visibleSelectedDay === globalIdx;
                                                    return (
                                                        <button
                                                            key={globalIdx}
                                                            className={`${styles.dayTab} ${isActive ? styles.dayTabActive : ''}`}
                                                            onClick={() => setSelectedDay(globalIdx)}
                                                        >
                                                            {_dayNameForGlobalIdx(_startMid, globalIdx)}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    );
                                })()}

                                {/* Meals List */}
                                <h3 className={styles.menuTitle}>
                                    {(() => {
                                        const _planDaysLen = _fullHistoryDays(selectedPlan.plan_data).length;
                                        if (_planDaysLen <= 1) return 'Menú del Plan';
                                        // [P1-HIST-1 · 2026-05-09] El título se clampa al chunk
                                        // ACTIVO (no siempre el chunk 0 como pre-P1-HIST-1).
                                        // `findChunkContaining(planDaysLen, selectedDay)` elige
                                        // el chunk que CONTIENE selectedDay — coherente con la
                                        // navegación: si el usuario clickeó "Días 8-11" el día
                                        // por defecto será 8 y el título mostrará el nombre del
                                        // día 8.
                                        const { start: _cs, size: _sz } = findChunkContaining(_planDaysLen, selectedDay);
                                        const _safeIdx = (selectedDay >= _cs && selectedDay < _cs + _sz)
                                            ? selectedDay
                                            : _cs;
                                        return `Menú — ${_dayNameForGlobalIdx(
                                            parseStartLocal(
                                                _historyLabelStart(selectedPlan.plan_data, selectedPlan.created_at)
                                            ),
                                            _safeIdx
                                        )}`;
                                    })()}
                                </h3>
                                <div className={styles.menuList}>
                                    {(() => {
                                        // [P-HISTORY-CHUNK-WINDOW] Clamp selectedDay al
                                        // primer chunk para que sólo se muestren meals de
                                        // días visibles en el selector (3-4 días).
                                        // [P1-HIST-COMPLETE-PROGRESS · 2026-05-31] Lee del
                                        // timeline COMPLETO (archivados + vigentes).
                                        const _fullDays = _fullHistoryDays(selectedPlan.plan_data);
                                        const _len = _fullDays.length;
                                        const _safeIdx = _len > 0 && selectedDay < _len
                                            ? selectedDay
                                            : 0;
                                        const _mealsArr = _fullDays[_safeIdx]?.meals
                                            || selectedPlan.plan_data?.meals
                                            || selectedPlan.plan_data?.perfectDay;
                                        // [P4-HIST-ARRAY-GUARD] Array.isArray: un meals no-array
                                        // (legacy) lanzaba TypeError en .map y tumbaba el modal.
                                        return Array.isArray(_mealsArr) ? _mealsArr : [];
                                    })()?.map((meal, idx) => {
                                        // [P3-HIST-MODAL-MENU-CARDS · 2026-06-24] Tarjeta estilo
                                        // bottom-sheet (diseño del owner): cuadro de ícono coloreado
                                        // por tipo (sol/pez/taza/luna) + label coloreado + nombre +
                                        // pastilla kcal. El color es dinámico → estilos inline.
                                        const _ms = _mealTypeStyle(meal.meal, idx);
                                        const MealIcon = _ms.Icon;
                                        return (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 12, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-page)' }}>
                                            <span style={{ flex: 'none', width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', color: _ms.tone, background: `color-mix(in srgb, ${_ms.tone} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${_ms.tone} 28%, transparent)` }}>
                                                <MealIcon size={21} />
                                            </span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: _ms.tone }}>{meal.meal}</div>
                                                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.3, marginTop: 2 }}>{meal.name}</div>
                                            </div>
                                            {meal.cals && (
                                                /* [P3-HIST-KCAL-BADGE-DARK · 2026-06-24] Tinte naranja
                                                   translúcido, adapta a ambos temas. */
                                                <span style={{
                                                    flex: 'none',
                                                    fontSize: '0.78rem', fontWeight: 800,
                                                    color: '#FB923C',
                                                    background: 'color-mix(in srgb, #FB923C 15%, transparent)',
                                                    padding: '0.25rem 0.6rem', borderRadius: '99px',
                                                    border: '1px solid color-mix(in srgb, #FB923C 32%, transparent)', whiteSpace: 'nowrap'
                                                }}>
                                                    {meal.cals} kcal
                                                </span>
                                            )}
                                        </div>
                                        );
                                    })}
                                </div>

                                {/* Bloque desactivado (`false &&`) INTENCIONALMENTE preservado:
                    los tests parser-based History.audit_hist_8_missing_days_block.test.js
                    (frontend) y test_p0_hist_fix_{2,3,4}.py / test_p3_hist_chunk_scheduled.py
                    (backend) anclan markers y variables de su interior — NO borrar
                    sin actualizar esos tests. El disable cubre el `false &&` de abajo. */}
                {/* eslint-disable no-constant-binary-expression */}
                {/* [P3-HIST-MISSING-DAYS-REMOVED · 2026-05-19]
                                    Banner "Faltan X días por generar / X de Y
                                    listos" eliminado del modal del Historial.
                                    Motivo (decisión del user, sesión UX
                                    2026-05-19): el counter "X de Y" generaba
                                    confusión entre "días que el sistema
                                    generó originalmente" vs "días aún
                                    visibles en el menú hoy" (afectado por
                                    shift_plan que trimmea días pasados). El
                                    intento de fix calendar-based
                                    (P3-HIST-MISSING-DAYS-EXPIRED-CALENDAR /
                                    P3-HIST-CHIP-DISPLAY-INCLUDE-EXPIRED)
                                    cerraba el caso técnico pero el banner
                                    seguía siendo ruido cognitivo para el
                                    user. Decisión: ocultar el banner —
                                    señales equivalentes siguen disponibles:
                                      - Chip "Parcial X/Y" del listado de
                                        cards (sigue mostrando progreso).
                                      - El listado de días en el menú del
                                        modal muestra los días reales.
                                      - recovery_exhausted / failed / queue
                                        states se surfacean en otros chips.
                                    Si se necesita revivir, restaurar el IIFE
                                    desde git history pre-2026-05-19. */}
                                {false && (() => {
                                    const _plan = selectedPlan;
                                    const _planDaysLen = _plan.plan_data?.days?.length || 0;
                                    // [P0-HIST-FIX-3 · 2026-05-09] Dos
                                    // valores distintos del "total":
                                    //   - `_activeTotal`: lo que el backend
                                    //     espera generar AHORA mismo
                                    //     (`total_days_requested`, decrementado
                                    //     cuando shift_plan trimmea días
                                    //     pasados). Usado para el cómputo
                                    //     de missing.
                                    //   - `_displayTotal`: el plan ORIGINAL
                                    //     (`legacy totalDays`), inmutable.
                                    //     Refleja el mental model del
                                    //     usuario ("plan de 7 días"). Usado
                                    //     para el chip "X de Y listos".
                                    // Mismatch entre ambos = días que ya
                                    // expiraron (shift_plan trimmeó). El
                                    // backend mantiene `totalDays` legacy
                                    // intacto al crear el plan; un refactor
                                    // futuro podría usar otro campo (e.g.
                                    // `_original_total_days`) — el max() de
                                    // ambos cubre el caso.
                                    const _activeTotal = (
                                        typeof _plan.total_days_requested === 'number'
                                            ? _plan.total_days_requested
                                            : (typeof _plan.plan_data?.total_days_requested === 'number'
                                                ? _plan.plan_data.total_days_requested
                                                : (typeof _plan.plan_data?.totalDays === 'number'
                                                    ? _plan.plan_data.totalDays
                                                    : 0))
                                    );
                                    const _legacyTotalDays = (typeof _plan.plan_data?.totalDays === 'number')
                                        ? _plan.plan_data.totalDays
                                        : 0;
                                    const _displayTotal = Math.max(_activeTotal, _legacyTotalDays);
                                    // [P3-HIST-MISSING-DAYS-EXPIRED-CALENDAR · 2026-05-19]
                                    // Días expirados — DOS sources, tomamos el max:
                                    //   (a) Active-delta: `_displayTotal - _activeTotal`.
                                    //       Funciona SOLO si el backend decrementa
                                    //       `total_days_requested` cuando shift_plan
                                    //       trimmea — convención esperada del
                                    //       comentario P0-HIST-FIX-3 original. En
                                    //       prod (2026-05-19) el backend NO siempre
                                    //       decrementa: el plan del user mostró
                                    //       activeTotal=7 + planDaysLen=2 con un
                                    //       día expirado real (lunes pasó, shift
                                    //       removió 1 día del array), dando
                                    //       expiredDays=0 cuando debía ser 1 →
                                    //       missingDays=5 cuando debía ser 4.
                                    //   (b) Calendar-based: `dayIdx` de
                                    //       `getTemporalStatus` (días desde
                                    //       grocery_start_date). Robusto contra el
                                    //       backend no-decremento — se computa
                                    //       client-side desde fechas, no depende
                                    //       de campos jsonb que pueden no
                                    //       actualizarse.
                                    // Clamp final a `_maxPossibleExpired` para no
                                    // sobre-contar cuando dayIdx > días originales
                                    // generados (e.g. plan creado hace 5 días pero
                                    // chunk_1 solo generó 3 — los 2 días previos
                                    // al plan no expiraron, nunca existieron).
                                    const _expiredDaysActiveDelta = Math.max(0, _displayTotal - _activeTotal);
                                    const _temporalForMissing = getTemporalStatus(_plan);
                                    const _dayIdxCalendar = (_temporalForMissing && Number.isFinite(_temporalForMissing.dayIdx))
                                        ? _temporalForMissing.dayIdx
                                        : 0;
                                    const _expiredDaysCalendar = Math.max(0, _dayIdxCalendar);
                                    const _maxPossibleExpired = Math.max(0, _activeTotal - _planDaysLen);
                                    const _expiredDays = Math.min(
                                        Math.max(_expiredDaysActiveDelta, _expiredDaysCalendar),
                                        _maxPossibleExpired
                                    );
                                    const _exhaustedCount = (
                                        typeof _plan.recovery_exhausted_count === 'number'
                                            ? _plan.recovery_exhausted_count
                                            : (Array.isArray(_plan.plan_data?._recovery_exhausted_chunks)
                                                ? _plan.plan_data._recovery_exhausted_chunks.length
                                                : 0)
                                    );
                                    // Missing math usa _activeTotal — los
                                    // chunks que el cron AÚN va a generar.
                                    // Si usáramos _displayTotal, contaríamos
                                    // como "missing" días que ya expiraron y
                                    // nunca se generarán → falso positivo.
                                    const _missingDays = _activeTotal > _planDaysLen
                                        ? (_activeTotal - _planDaysLen)
                                        : 0;
                                    if (_missingDays === 0 && _exhaustedCount === 0) return null;

                                    // [P0-HIST-FIX-4 · 2026-05-09] El conteo
                                    // "listos" debe incluir días que el
                                    // primer chunk generó pero ya expiraron
                                    // (visualmente removidos del array por
                                    // shift_plan). El chunk inicial genera
                                    // típicamente 3 días; si hoy es sábado
                                    // y el viernes ya pasó, el array tiene 2
                                    // pero "listos" debe ser 3.
                                    //
                                    // _generatedTotal = días en array + días
                                    // que ya expiraron (= days originally
                                    // generated by the chunks that ran).
                                    const _generatedTotal = _planDaysLen + _expiredDays;
                                    // [P0-HIST-FIX-2 · 2026-05-09] Range
                                    // string en es-DO neutro: singular "el
                                    // día N" / plural "del día N al día M".
                                    // [P0-HIST-FIX-4 · 2026-05-09] Day
                                    // numbering desde el día 1 = primer día
                                    // del plan original (incluye expirados).
                                    // Si generated=3 y missing=4, los días
                                    // que faltan son 4-7, no 3-6.
                                    let _missingRange = '';
                                    if (_missingDays === 1) {
                                        _missingRange = `el día ${_generatedTotal + 1}`;
                                    } else if (_missingDays > 1) {
                                        _missingRange = `del día ${_generatedTotal + 1} al día ${_generatedTotal + _missingDays}`;
                                    }

                                    // Counters embedded del LEFT JOIN
                                    // (P1-AUDIT-HIST-4) o fallback summary
                                    // (P0-AUDIT-HIST-2). Si ninguno, asumir 0.
                                    const _summaryEntry = chunkStatusSummary
                                        ? chunkStatusSummary[_plan.id]
                                        : null;
                                    const _puac = (typeof _plan.chunk_pending_user_action_count === 'number')
                                        ? _plan.chunk_pending_user_action_count
                                        : ((_summaryEntry && typeof _summaryEntry.pending_user_action_count === 'number')
                                            ? _summaryEntry.pending_user_action_count : 0);
                                    const _failedC = (typeof _plan.chunk_failed_count === 'number')
                                        ? _plan.chunk_failed_count
                                        : ((_summaryEntry && typeof _summaryEntry.failed_count === 'number')
                                            ? _summaryEntry.failed_count : 0);
                                    const _inFlight = (typeof _plan.chunk_in_flight_count === 'number')
                                        ? _plan.chunk_in_flight_count
                                        : ((_summaryEntry && typeof _summaryEntry.in_flight_count === 'number')
                                            ? _summaryEntry.in_flight_count : 0);
                                    // [P3-HIST-CHUNK-SCHEDULED · 2026-05-18]
                                    // Split del in_flight_count para mostrar
                                    // copy preciso. Pre-fix: cualquier chunk
                                    // pending/processing/stale (in_flight > 0)
                                    // → copy "Mealfit los está generando AHORA
                                    // en segundo plano". Pero el worker filtra
                                    // por `execute_after <= NOW()`; un chunk
                                    // pending con execute_after en 3 días NO
                                    // está corriendo, está dormido. El backend
                                    // ahora devuelve dos counters separados:
                                    //   - chunk_scheduled_count: pending/stale
                                    //     con execute_after > NOW() (dormidos).
                                    //   - chunk_running_now_count: processing
                                    //     + pending/stale con execute_after
                                    //     vencido (elegibles ya).
                                    // Branch priority: running_now > 0 = "ahora"
                                    // (incluye el caso mixto donde algunos corren
                                    // y otros duermen — el mensaje "ahora" gana
                                    // porque al menos PARTE está corriendo).
                                    const _scheduled = (typeof _plan.chunk_scheduled_count === 'number')
                                        ? _plan.chunk_scheduled_count
                                        : 0;
                                    const _runningNow = (typeof _plan.chunk_running_now_count === 'number')
                                        ? _plan.chunk_running_now_count
                                        : 0;

                                    // [P0-HIST-FIX-2 · 2026-05-09] Copy
                                    // re-escrita en es-DO claro. Antes
                                    // "Generación en proceso — vuelve a abrir
                                    // el plan en unos minutos." era poco
                                    // accionable: el user no sabía CUÁNTO
                                    // tiempo, qué pasa después, ni si tenía
                                    // que hacer algo. Ahora cada tono lleva
                                    // un emoji que comunica visualmente el
                                    // estado, y el body indica claramente
                                    // qué hacer y cuándo.
                                    // [P3-HIST-ACTIVE-NO-REACTIVATE · 2026-05-18]
                                    // Copy de cada tono depende de si el botón
                                    // "Reactivar este Plan" sigue visible. Para
                                    // planes activos/futuros el botón se oculta
                                    // (no aplica conceptualmente — el usuario
                                    // YA está usando ese plan), así que las
                                    // sentencias "Pulsa 'Reactivar este Plan'
                                    // abajo…" quedan rotas y hay que pivotar
                                    // al Dashboard como punto de recovery.
                                    // [P1-HIST-ACTIVE-IDENTITY · 2026-05-31] Ocultar "Reactivar"
                                    // para el plan actual (no por ventana temporal). Ver currentPlanId.
                                    const _hideRestore = !!currentPlanId && _plan?.id === currentPlanId;
                                    const _ctaText = _hideRestore
                                        ? 'Vuelve al Dashboard para retomar la generación.'
                                        : 'Pulsa "Reactivar este Plan" abajo para retomar la generación.';
                                    const _ctaRetry = _hideRestore
                                        ? 'Vuelve al Dashboard para reintentarlo.'
                                        : 'Pulsa "Reactivar este Plan" abajo para reintentarlo.';
                                    const _ctaRetryWithInfo = _hideRestore
                                        ? 'Vuelve al Dashboard para reintentarlo con la información actualizada.'
                                        : 'Pulsa "Reactivar este Plan" abajo para reintentarlo con la información actualizada.';

                                    let _reason;
                                    let _tone; // 'bad' | 'warn' | 'info'
                                    let _icon; // emoji por tono
                                    if (_exhaustedCount > 0) {
                                        _reason = `No fue posible generar estos días automáticamente. ${_ctaRetryWithInfo}`;
                                        _tone = 'bad';
                                        _icon = '⚠️';
                                    } else if (_puac > 0) {
                                        _reason = `Mealfit está esperando que actualices algo (tu nevera, tu registro de comidas, o la fecha del plan). ${_ctaText}`;
                                        _tone = 'warn';
                                        _icon = '⏸️';
                                    } else if (_failedC > 0) {
                                        _reason = `Hubo un error al generar estos días. ${_ctaRetry}`;
                                        _tone = 'bad';
                                        _icon = '⚠️';
                                    } else if (_runningNow > 0) {
                                        // [P3-HIST-CHUNK-SCHEDULED · 2026-05-18]
                                        // Genuinamente "generando ahora": al menos
                                        // un chunk está `processing` o `pending`/
                                        // `stale` con execute_after vencido. El
                                        // worker lo recogerá en el próximo tick
                                        // (≤1 min) o ya lo recogió. Si _scheduled
                                        // > 0 también, mencionar que hay más
                                        // dormidos para no engañar.
                                        if (_scheduled > 0) {
                                            _reason = `Mealfit está generando algunos ahora en segundo plano. El resto (${_scheduled} ${_scheduled === 1 ? 'chunk' : 'chunks'}) se generará automáticamente cuando llegue su momento — no tienes que hacer nada.`;
                                        } else {
                                            _reason = 'Mealfit los está generando ahora en segundo plano. Cierra el modal y vuelve a abrirlo en 2 a 5 minutos para verlos listos.';
                                        }
                                        _tone = 'info';
                                        _icon = '🔄';
                                    } else if (_scheduled > 0) {
                                        // [P3-HIST-CHUNK-SCHEDULED · 2026-05-18]
                                        // Todos los chunks pendientes están
                                        // DORMIDOS (execute_after > NOW()). El
                                        // worker no los está tocando — los
                                        // generará automáticamente cuando llegue
                                        // su día programado. Este es el caso del
                                        // user que reportó "no debería generarlos
                                        // ahora ya que no ha llegado su tiempo".
                                        _reason = 'Estos días se generarán automáticamente cuando llegue su momento. No tienes que hacer nada — los verás listos un par de días antes de comerlos.';
                                        _tone = 'info';
                                        _icon = '⏳';
                                    } else if (_inFlight > 0) {
                                        // Fallback: backend pre-P3-HIST-CHUNK-SCHEDULED
                                        // sin el split nuevo. Copy neutro
                                        // (NO "generando ahora") para no
                                        // mentir.
                                        _reason = 'Mealfit los generará automáticamente cuando llegue su momento. No necesitas hacer nada.';
                                        _tone = 'info';
                                        _icon = '⏳';
                                    } else {
                                        _reason = 'Estos días aún no se han generado.';
                                        _tone = 'info';
                                        _icon = '📅';
                                    }

                                    // Tone → CSS class (estilos distintos del
                                    // banner action_required: este bloque es
                                    // info per-day, no acción global).
                                    const _toneClass = _tone === 'bad'
                                        ? styles.missingDaysBad
                                        : (_tone === 'warn'
                                            ? styles.missingDaysWarn
                                            : styles.missingDaysInfo);

                                    // [P0-HIST-FIX-2 · 2026-05-09] Counter
                                    // re-framed: antes "4/6" era ambiguo
                                    // (¿4 hechos de 6 o 4 faltan de 6?).
                                    // Ahora "2 de 6 listos" es progreso
                                    // explícito; el título dice cuántos
                                    // faltan, así no hay duda. Tooltip con
                                    // el detalle complementario (faltan N).
                                    return (
                                        <div className={`${styles.missingDaysBlock} ${_toneClass}`}>
                                            <div className={styles.missingDaysHeader}>
                                                <span className={styles.missingDaysIcon}>{_icon}</span>
                                                <strong className={styles.missingDaysTitle}>
                                                    {_missingDays > 0
                                                        ? (_missingDays === 1
                                                            ? 'Falta 1 día por generar'
                                                            : `Faltan ${_missingDays} días por generar`)
                                                        : (_exhaustedCount === 1
                                                            ? '1 bloque sin completar'
                                                            : `${_exhaustedCount} bloques sin completar`)}
                                                </strong>
                                                {_missingDays > 0 && (
                                                    <span
                                                        className={styles.missingDaysCount}
                                                        title={`${_generatedTotal} día(s) generado(s) (${_planDaysLen} disponible(s) hoy${_expiredDays > 0 ? `, ${_expiredDays} ya pasó(aron)` : ''}) · ${_missingDays} por generar · plan original: ${_displayTotal} días`}
                                                    >
                                                        {_generatedTotal} de {_displayTotal} listos
                                                    </span>
                                                )}
                                            </div>
                                            {_missingDays > 0 && _missingRange && (
                                                <p className={styles.missingDaysSubtitle}>
                                                    Falta{_missingDays === 1 ? '' : 'n'} {_missingRange}
                                                    {_expiredDays > 0 && (
                                                        _expiredDays === 1
                                                            ? '. (1 día ya pasó y no aparece en el menú)'
                                                            : `. (${_expiredDays} días ya pasaron y no aparecen en el menú)`
                                                    )}
                                                    {_expiredDays === 0 && '.'}
                                                </p>
                                            )}
                                            <p className={styles.missingDaysReason}>{_reason}</p>
                                        </div>
                                    );
                                })()}
                                {/* eslint-enable no-constant-binary-expression */}
                                </>
                                )}
                                {/* /P2-HIST-AUDIT-2 tab Menú wrapper */}
                            </div>

                            {/* Footer */}
                            {/* [P3-HIST-ACTIVE-NO-REACTIVATE · 2026-05-18 ·
                                identidad P1-HIST-ACTIVE-IDENTITY · 2026-05-31]
                                "Reactivar este Plan" copia un plan archivado
                                como el nuevo plan activo del usuario. Solo
                                tiene sentido para planes que NO son el actual:
                                para el plan que YA es el actual (el más
                                reciente, el que estás usando) el botón confunde
                                — reactivarse sobre sí mismo es no-op. Por eso
                                se oculta únicamente para `currentPlanId`; TODOS
                                los demás planes (anteriores) conservan el CTA
                                para que el usuario pueda reactivarlos cuando
                                quiera, aunque su ventana de fechas solape hoy.

                                [P3-HIST-NO-CERRAR-BTN · 2026-05-18]
                                El botón "Cerrar" del footer se removió: la X
                                del modalHeader hace exactamente lo mismo
                                (`setSelectedPlan(null)`). Mantener ambos era
                                ruido visual sin valor — dos affordances para
                                la misma acción + el click fuera del modal
                                (overlay) también cierra. Consecuencia: cuando
                                `_hideRestore=true` el footer queda vacío y
                                lo renderizamos `null` (no white band sin
                                contenido). Para planes pasados el footer
                                solo muestra el CTA Reactivar full-width. */}
                            {(() => {
                                // [P1-HIST-ACTIVE-IDENTITY · 2026-05-31] El botón
                                // "Reactivar este Plan" se oculta SOLO para el plan
                                // actual (el que ya estás usando). Los planes anteriores
                                // SÍ lo muestran para que puedas reactivarlos cuando
                                // quieras — aunque su ventana de fechas solape hoy.
                                const _hideRestore = !!currentPlanId && selectedPlan?.id === currentPlanId;
                                if (_hideRestore) {
                                    // Footer vacío — la X del header cierra.
                                    return null;
                                }
                                return (
                                    <div className={`${styles.modalFooter} ${styles.modalFooterSingle}`}>
                                        <button
                                            onClick={handleRestoreRequest}
                                            className={styles.modalActionBtn}
                                        >
                                            <RotateCcw size={18} /> Reactivar este Plan
                                        </button>
                                    </div>
                                );
                            })()}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- CONFIRM RESTORE MODAL --- */}
            <AnimatePresence>
                {confirmRestore && (
                    <motion.div
                        className={styles.confirmOverlay}
                        onClick={() => setConfirmRestore(null)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            ref={restoreConfirmRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="history-restore-confirm-title"
                            aria-describedby="history-restore-confirm-desc"
                            tabIndex={-1}
                            className={styles.confirmBox}
                            onClick={e => e.stopPropagation()}
                            initial={{ scale: 0.85, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.85, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                        >
                            {/* [P3-HISTORY-CONFIRM-POLISH · 2026-07-12] Tono warning por
                                default del box; el icono hereda color del wrapper. */}
                            <div className={styles.confirmIconWrapper}>
                                <AlertTriangle size={26} />
                            </div>
                            <h3 id="history-restore-confirm-title" className={styles.confirmTitle}>¿Reactivar este plan?</h3>
                            <p id="history-restore-confirm-desc" className={styles.confirmText}>
                                Tu plan actual será reemplazado por <strong>{confirmRestore.name || 'este plan'}</strong>. Esta acción no se puede deshacer.
                            </p>
                            <div className={styles.confirmActions}>
                                <button
                                    className={styles.confirmCancelBtn}
                                    onClick={() => setConfirmRestore(null)}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className={styles.confirmAcceptBtn}
                                    onClick={handleRestoreConfirm}
                                >
                                    <RotateCcw size={16} /> Sí, reactivar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- CONFIRM DELETE MODAL --- */}
            <AnimatePresence>
                {confirmDelete && (
                    <motion.div
                        className={styles.confirmOverlay}
                        onClick={() => setConfirmDelete(null)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            ref={deleteConfirmRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="history-delete-confirm-title"
                            aria-describedby="history-delete-confirm-desc"
                            tabIndex={-1}
                            className={`${styles.confirmBox} ${styles.confirmDanger}`}
                            onClick={e => e.stopPropagation()}
                            initial={{ scale: 0.85, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.85, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                        >
                            {/* [P3-HISTORY-CONFIRM-POLISH · 2026-07-12] Variante danger via
                                clase (antes colores light hardcodeados inline que flotaban
                                pálidos sobre el theme oscuro). */}
                            <div className={styles.confirmIconWrapper}>
                                <Trash2 size={26} />
                            </div>
                            <h3 id="history-delete-confirm-title" className={styles.confirmTitle}>¿Eliminar este plan?</h3>
                            <p id="history-delete-confirm-desc" className={styles.confirmText}>
                                El plan <strong>{confirmDelete.name || 'Seleccionado'}</strong> será borrado permanentemente de tu historial. Esta acción no se puede deshacer.
                            </p>
                            <div className={styles.confirmActions}>
                                <button
                                    className={styles.confirmCancelBtn}
                                    onClick={() => setConfirmDelete(null)}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className={styles.confirmAcceptBtn}
                                    onClick={handleDeleteConfirm}
                                >
                                    <Trash2 size={16} /> Eliminar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default History;
