import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// [UX-DURATION-PANEL-BACKDROP · 2026-07-03] Portal a <body> para el backdrop con blur del panel
// duración/presupuesto (position:fixed dentro del árbol se rompería si un ancestro framer-motion
// conserva un transform — el portal lo hace inmune a eso).
import { createPortal } from 'react-dom';
import { useAssessment } from '../context/AssessmentContext';
import { useRegeneratePlan } from '../hooks/useRegeneratePlan';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { requestNotificationPermission, subscribeToPushNotifications, isPushSupported } from '../utils/pushNotifications';

import { useNavigate, Navigate, Link } from 'react-router-dom';
import {
    Zap, Flame, ArrowRight, CheckCircle,
    RefreshCw, ChefHat, Heart, Pill, Lock,
    Brain, Wallet, AlertCircle, Dumbbell,
    Lightbulb, Wand2, Clock, BookOpen, Loader2, Target, ShoppingCart, ChevronDown,
    ThumbsDown, Shuffle, X, Utensils, Copy, ChevronRight, Refrigerator
} from 'lucide-react';
import { toast } from 'sonner';
import TrackingProgress from '../components/dashboard/TrackingProgress';
// [P3-WATER-TRACKER · 2026-05-16] Tracker de hidratacion (8 vasos diarios)
// reemplaza el card "Mi Nevera" que duplicaba la pagina Pantry.
import WaterTracker from '../components/dashboard/WaterTracker';
// [P2-CREDITS-METER · 2026-06-15] Gauge circular animado de créditos (reemplaza
// el badge plano icono+número del header). Recibe la misma data del badge.
import CreditsMeter from '../components/dashboard/CreditsMeter';
// [P3-MICRONUTRIENT-PANEL · 2026-06-15] Panel de micros como medidores + dismissible.
// [P3-NOTIF-CENTER · 2026-06-16] buildMicrosNotification = SSOT del resumen archivado;
// microsContentSig = firma estable por contenido (clave de dismissal/backfill).
// [P1-MICRO-FOCO-PANEL · 2026-06-26] El render visible del panel de gaps lo absorbe
// MicronutrientMeter (diseño Foco); aquí solo importamos los helpers SSOT que sigue
// usando el backfill de la notificación de micros (archivado de descartes legacy).
import { buildMicrosNotification, microsContentSig } from '../components/dashboard/MicronutrientPanel';
// [P1-FOOD-DB-EXTENDED-MICROS · 2026-06-25] Medidor con TODOS los micros (no solo gaps).
import MicronutrientMeter from '../components/dashboard/MicronutrientMeter';
// [P3-RESTOCK-NUDGE · 2026-06-23] Nudge para que el usuario llene la Nevera tras
// comprar (banner + prompt + auto-fill + recordatorio). Cierra el olvido de tocar
// "Ya compré la lista". Lógica de decisión en utils/restockNudge.js.
import RestockNudge from '../components/dashboard/RestockNudge';
// [P1-SUPERMARKET-MATCH · 2026-07-02] Panel "Marcas del súper": conecta la lista
// de compras con supermarket_products (marcas/presentaciones/precios reales).
import SupermarketBrands from '../components/dashboard/SupermarketBrands';
// [P2-AUDIT-V7-BATCH · 2026-07-04] (P2-8) lista por pasillo on-screen (antes solo PDF).
// [P3-AGENT-PREFILL · 2026-06-15] Tocar un micronutriente → pregunta al coach IA.
import { requestAgentPrefill } from '../utils/agentPrefill';
import Modal from '../components/common/Modal';
import OptionPickerModal from '../components/common/OptionPickerModal';
// [P3-MOTIVO-MODAL-REDESIGN · 2026-06-24] Selector de motivo rediseñado para
// "actualizar día completo" (plan vigente). El "Nuevo Ciclo" (plan vencido)
// sigue usando OptionPickerModal (tiene la opción extra "similar").
import MotivoActualizarModal from '../components/dashboard/MotivoActualizarModal';
import EmptyState from '../components/common/EmptyState';
// [P1-NEON-DB-MIGRATION · 2026-06-12] Import de `el cliente anterior` eliminado: los
// SELECTs/realtime directos a Postgres migraron a endpoints backend
// (GET /api/inventory, GET /api/plans-data/{plan_id}) via fetchWithAuth.
// [P2-LAZY-PDF · 2026-05-13] html2pdf.js (976 KB) se importa dinámico
// dentro del handler de descarga — ver `await import('html2pdf.js')` más
// abajo. Pre-fix era import estático top-level: el chunk se fetch eager
// al entrar al Dashboard, 100% de usuarios pagan el costo aunque jamás
// descarguen PDF. Tooltip-anchor: P2-LAZY-PDF.
import { API_BASE, fetchWithAuth, getPlanChunkStatus } from '../config/api';
// [P1-DASH-BUDGET-EDIT · 2026-06-23] Ciclo de compras (días) para el editor de presupuesto.
import { minBudgetFor, budgetCycleDays } from '../config/formValidation';
// [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Mínimo de presupuesto personalizado por las metas
// (calorías × hogar × ciclo) — mismo número que exige el backend; fail-open al estático.
import { useBudgetFloor } from '../hooks/useBudgetFloor';
import { trackEvent } from '../utils/analytics';
// [P3-RESTOCK-FLOW-SPEED · 2026-05-20] Cache compartido de inventory. Tras
// el restock, Dashboard populá este singleton de modo que Pantry.jsx monta
// con `inventory = getCachedInventory()` ya poblado → cero skeleton + cero
// fetch dup. Pre-fix Pantry hacía su propio fetch al mount (~300-800ms)
// pese a que Dashboard ya había hecho refetch para `setLiveInventory`.
import { getCachedInventory, setCachedInventory, invalidateInventoryCache } from '../utils/pantryCache';
import { safeJSONParse } from '../utils/safeJSONParse';
// [P3-DASH-WINDOW-TEST · 2026-05-29] Lógica pura de la ventana rolling +
// estado de ciclo, extraída de este componente para poder testearla con
// fechas fijas (ver src/__tests__/planWindow.test.js).
import {
    parseStartLocal,
    daysSinceMidnight,
    computeRollingWindow,
    computeCycleStatus,
    resolveActiveDayIndex,
    MAX_WINDOW,
} from '../utils/planWindow';
// [P1-FRONTEND-LEGACY-LOCALSTORAGE-CRITICAL · 2026-05-23] safeLocalStorageGet
// para el effect de onboarding de push (línea ~1139). Pre-fix era raw
// `localStorage.getItem(...)` sin try/catch → iOS Private Mode lanzaba
// SecurityError y el useEffect callback crasheaba silenciosamente, dejando
// a usuarios nuevos sin el modal de onboarding push.
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';
// [P3-NOTIF-CENTER · 2026-06-16] Archivar el banner "plan no óptimo" al cerrarlo
// + backfill de avisos descartados antes de que existiera el centro.
import { addNotification, getNotifications, setNotificationData, openNotificationCenter } from '../utils/notifications';
// [P1-REASONING-DISMISS · 2026-06-26] Restaurar el panel de Razonamiento desde el
// centro de notificaciones (mismo patrón que el panel de micros).
import { INSIGHTS_RESTORE_EVENT, insightsDismissKey } from '../utils/insightsPanel';
// [P2-CUSTOM-MODALS-A11Y · 2026-05-24] Hook SSOT para el restock modal inline
// (4470-4580): role/aria-modal/focus trap/ESC/restore focus/body overflow.
// Pre-fix el modal era keyboard-inaccesible (Tab escapaba al fondo, ESC no
// cerraba) y screen readers no lo anunciaban como dialog.
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import { getActiveShoppingList, getDeltaSourceList, calculateAllPlanIngredients, fetchFreshInventoryWithTimeout, getInventoryFetchTimeoutMs, computePdfLayoutDensity, PDF_LAYOUT_THRESHOLDS, parseMarketQty, resolveShopQty, escapeHtml } from '../utils/shoppingHelpers';
import { emitCoherenceToast, emitHistoricalCoherenceToast } from '../utils/renderCoherenceWarnings';
import { getMealAdvisories } from '../utils/mealAdvisories';
// [P1-FORM-9] Helper que filtra flags internos `_*` y bloquea cuando la
// hidratación cifrada del formData (post-login) parece estar en curso —
// evita que el spread `{...formData}` envíe campos sensibles vacíos a DB,
// pisando datos médicos previos. Ver `secureFormStorage.js` para el
// rationale completo.
import { buildHealthProfilePayload } from '../config/secureFormStorage';
// [APPEARANCE-THEME · 2026-05-29] Snapshot del tema para botones inline-styled
// cuyo color pastel se ve lavado en oscuro. El Dashboard re-monta al navegar
// (no es keep-alive), así que el snapshot siempre está fresco; el toggle vive
// en Settings (otra ruta) → no hay caso de cambio en vivo sobre esta vista.
import { isDarkActive } from '../utils/theme';

// [P2-BRANDS-OPTIMISTIC · 2026-07-07] Update en TIEMPO REAL del brand elegido en
// "Marcas del súper". El display de cada ítem es un solo string backend
// (`display_qty` = "2 potes (16 Oz · Genérico c/u)") + el precio en
// `estimated_cost_rd`. Antes la lista solo cambiaba cuando el recalc
// (/recalculate-shopping-list, 15-40s + serializado) devolvía y hacía setPlanData
// → el owner veía el toast girando y la lista en "Genérico" (se sentía roto).
// Ahora parcheamos el ítem al instante (marca + precio si el envase coincide) y el
// recalc reconcilia el costo exacto en segundo plano. Reversible: es puramente UI,
// el recalc sigue siendo la fuente de verdad.
const _brandNorm = (s) => (s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');

// Match espejo del backend `_resolve_brand_pref`: exacto → singular → contención
// bidireccional word-boundary. Cubre "aceite de oliva" (pref) ↔ "Aceite de oliva
// extra virgen" (ítem del plan), donde el nombre del plan difiere del food_name del súper.
const _brandKeyMatches = (itemNameNorm, foodKey) => {
    if (!itemNameNorm || !foodKey) return false;
    if (itemNameNorm === foodKey) return true;
    const sing = (s) => (s.length > 4 && s.endsWith('es')) ? s.slice(0, -2)
        : (s.length > 3 && s.endsWith('s') ? s.slice(0, -1) : s);
    if (sing(itemNameNorm) === foodKey || itemNameNorm === sing(foodKey)) return true;
    if (foodKey.length >= 4 && itemNameNorm.length >= 4) {
        const a = ` ${itemNameNorm} `; const b = ` ${foodKey} `;
        if (a.includes(b) || b.includes(a)) return true;
    }
    return false;
};

// Envases conocidos (espejo de _PRES_CONTAINER_WORDS del backend) para separar
// "Botella Virgen Extra 125 Ml" → contenedor "botella" + tamaño "Virgen Extra 125 Ml".
const _BRAND_CONTAINER_WORDS = new Set([
    'botella', 'funda', 'lata', 'paquete', 'frasco', 'tarro', 'pote', 'caja',
    'carton', 'carton', 'brik', 'sobre', 'bandeja', 'bolsa', 'galon', 'saco',
    'malla', 'tetra', 'pieza', 'barra', 'tubo', 'cubo',
]);

// Reconstruye el ítem desde el variant ELEGIDO: recomputa el conteo (ceil de lo
// que la lista ya compraba / el tamaño del nuevo envase), el label tamaño·marca y
// el costo (conteo × precio). Correcto incluso cuando el tamaño difiere (Borges
// 125ml vs la default Wala 500ml) — antes solo se cambiaba la marca dejando "500ml".
const _rebuildItemFromVariant = (it, variant) => {
    if (!it || typeof it !== 'object' || !variant) return it;
    const out = { ...it };
    const brand = (variant.brand && String(variant.brand).trim()) || 'Genérico';
    const sg = Number(variant.size_g) || 0;
    const price = Number(variant.price_rd) || 0;
    const pres = String(variant.presentation || '').trim();

    // contenedor + tamaño desde la presentación del variant
    let container = ''; let sizeLabel = pres;
    if (pres) {
        const first = pres.split(' ')[0];
        if (_BRAND_CONTAINER_WORDS.has(_brandNorm(first))) {
            container = first.toLowerCase();
            sizeLabel = pres.slice(first.length).trim();
        }
    }
    // conteo: ceil(necesidad aprox / tamaño del envase). La necesidad aprox = lo que
    // la lista ya compra (conteo actual × package_grams). Sin datos → mantiene conteo.
    const curCount = parseInt(String(out.display_qty || ''), 10) || 1;
    const pg = Number(out.package_grams) || 0;
    let count = curCount;
    if (pg > 0 && sg > 0) count = Math.max(1, Math.ceil((curCount * pg) / sg));

    const plural = count > 1;
    const contDisp = container
        ? (plural && !container.endsWith('s') ? `${container}s` : container)
        : (plural ? 'unidades' : 'unidad');
    const cu = plural ? ' c/u' : '';
    out.display_qty = sizeLabel
        ? `${count} ${contDisp} (${sizeLabel} · ${brand}${cu})`
        : `${count} ${contDisp} (${brand})`;
    out.sku_size_label = sizeLabel ? `${sizeLabel} · ${brand}` : brand;
    if (variant.id) out.brand_product_id = variant.id;
    if (sg > 0) out.package_grams = sg;
    if (price > 0) {
        const cost = Math.round(count * price);
        out.estimated_cost_rd = cost;
        if (typeof out.estimated_cost === 'number') out.estimated_cost = cost;
    }
    return out;
};

// Parchea el ítem que matchea `foodKey` en TODAS las listas por duración del plan.
// Devuelve el plan nuevo si tocó algo, o `null` si no hubo match (para que el caller
// sepa si mostrar "aplicada" al instante o "aplicando…" y esperar el recalc).
const applyBrandToPlanOptimistic = (plan, foodKey, variant) => {
    if (!plan || !foodKey || !variant) return null;
    const keys = [
        'aggregated_shopping_list', 'aggregated_shopping_list_weekly',
        'aggregated_shopping_list_biweekly', 'aggregated_shopping_list_monthly',
    ];
    let touched = false;
    const next = { ...plan };
    keys.forEach((k) => {
        const list = plan[k];
        if (!Array.isArray(list)) return;
        let changed = false;
        const nl = list.map((it) => {
            const nm = _brandNorm(it && (it.name || it.display_name || it.item_name));
            if (_brandKeyMatches(nm, foodKey)) { changed = true; return _rebuildItemFromVariant(it, variant); }
            return it;
        });
        if (changed) { next[k] = nl; touched = true; }
    });
    return touched ? next : null;
};

// [P3-UPDATE-PLATOS-REQUIRES-PANTRY · 2026-05-17] Mínimo de alimentos en la
// Nevera para desbloquear "Actualizar platos". Con menos ítems el LLM no
// puede regenerar platos significativos (regeneración usa el inventory real
// como ingredient pool). UX decision: usuario reportó que el botón se podía
// clickear con nevera vacía → modal abría → flujo sin sentido. Threshold de
// 3 permite construir 1-2 platos variados sin ser restrictivo.
const PANTRY_MIN_ITEMS_FOR_UPDATE = 3;

// [P5-SPEED-DELTA-CONSTS-HOIST · 2026-06-01] Constantes estáticas de
// `buildDeltaShoppingList` izadas a module-scope. Antes vivían DENTRO del
// useCallback → se reconstruían en cada invocación, y `buildDeltaShoppingList`
// corre en el camino caliente de sync del inventario (el useMemo
// `computedHasPendingShoppingItems` lo llama en cada push realtime, focus-refresh,
// swap optimista y recalc-success). Lo más costoso era recompilar ~38 regex de
// stop-words por ítem (≈ items × 38 `new RegExp` por invocación); ahora se
// compilan UNA vez aquí. Las regex usan flag `g` → `String.replace` resetea
// lastIndex tras cada llamada, así que reusar la instancia compartida es seguro.
// Cero cambio de comportamiento: mismas tablas, mismas regex, misma lógica.
const MASS_TO_G = { 'g': 1, 'gr': 1, 'gramos': 1, 'kg': 1000, 'lb': 453.592, 'lbs': 453.592, 'oz': 28.3495, 'onza': 28.3495, 'onzas': 28.3495 };
const VOL_TO_ML = { 'ml': 1, 'l': 1000, 'taza': 240, 'tazas': 240, 'cda': 15, 'cdta': 5 };
const NAME_STOP_WORDS = ['picada', 'picado', 'en tiras', 'en cubos', 'rallado', 'rallada',
    'magra', 'magro', 'para rebozar', 'en hojuelas', 'hervida', 'desmenuzada',
    'fresco', 'fresca', 'cocido', 'cocida', 'pelada', 'pelado', 'en dados',
    'al gusto', 'en aros', 'en trozos', 'en rodajas', 'en porciones',
    'sin piel', 'sin hueso', 'crudo', 'cruda', 'asado', 'asada',
    'entero', 'entera', 'fina', 'finas', 'gruesa', 'gruesas',
    'horneado', 'grandes', 'firme'];
const STOP_WORD_REGEXES = NAME_STOP_WORDS.map(s => new RegExp('\\b' + s + '\\b', 'gi'));
const NAME_IRREGULARS = {
    'nueces': 'nuez', 'aves': 'ave', 'maices': 'maiz', 'arroces': 'arroz',
    'peces': 'pez', 'carnes': 'carne', 'tomates': 'tomate'
};
const DRY_GOODS = ['arroz', 'pasta', 'fideo', 'espagueti', 'macarrón', 'macarron', 'lenteja', 'habichuela', 'frijol', 'garbanzo', 'gandul', 'moro', 'avena', 'quinoa', 'cuscús', 'cuscus', 'bulgur', 'cebada', 'harina', 'azúcar', 'azucar', 'sal', 'bicarbonato', 'levadura', 'cacao', 'café', 'cafe', 'infusión', 'especia', 'condimento', 'maíz seco', 'maiz seco', 'palomita', 'cereal'];
const PANTRY_STAPLES_DELTA = new Set([
    'sal y ajo en polvo', 'aceite de oliva', 'aceite de coco',
    'aceite de sésamo o maní', 'salsa de soya', 'orégano',
    'canela', 'pimienta', 'sal', 'vinagre', 'ajo en polvo'
]);

// [P1-NEON-DB-MIGRATION · 2026-06-12] Fetcher único del inventario vía backend
// (GET /api/inventory) — reemplaza los 5 SELECTs directos de `user_inventory`
// via el SDK anterior (PostgREST apunta al Postgres de el backend anterior, stale post-cutover
// a Neon). El endpoint ya aplica `quantity > 0` + ORDER BY ingredient_name y
// devuelve el embed `master_ingredients` con el mismo shape anidado que el
// select PostgREST legacy. Adapta la response al contrato `{ data, error }`
// que `fetchFreshInventoryWithTimeout` espera — la semántica stale
// (timeout/error/empty_response) y los banners/telemetría quedan intactos.
const fetchInventoryFromApi = async () => {
    try {
        const response = await fetchWithAuth('/api/inventory');
        if (!response.ok) {
            return { data: null, error: new Error(`HTTP ${response.status}`) };
        }
        const payload = await response.json();
        return { data: Array.isArray(payload?.items) ? payload.items : null, error: null };
    } catch (e) {
        return { data: null, error: e };
    }
};

// [P1-DASH-HOOKS-ORDER · 2026-05-31] `DashboardInner` contiene TODOS los hooks
// del Dashboard SIN early-returns. Los dos guards (loadingData / !planData) que
// antes vivían dentro de este componente (tras ~80 hooks) violaban
// react-hooks/rules-of-hooks: cuando `loadingData` flipeaba true→false con
// planData presente, el conteo de hooks cambiaba entre renders → React lanzaría
// "rendered more hooks than during the previous render". El bug estaba dormido
// porque `ProtectedRoute` solo monta Dashboard ya-cargado, pero era frágil. Los
// guards se movieron al wrapper `Dashboard` (abajo), que lee SOLO context y
// monta `DashboardInner` cuando los datos están listos. Comportamiento idéntico
// en el camino común; estrictamente más seguro en el borde (unmount limpio en
// vez de crash). Hooks ahora incondicionales → contrato de orden estable.
// [P3-NOTIF-CENTER · 2026-06-16] Mapa de motivos del banner "plan no óptimo",
// elevado a módulo para que el banner (IIFE en JSX) y el archivado al centro de
// notificaciones (dismissQDegraded) compartan el MISMO copy — cero drift.
// [P2-PDF-COST-DELTA-MISMATCH · 2026-06-22] (audit fresco P2-20) `buildDeltaShoppingList` degrada
// `market_qty` por ciclo×inventario PERO conservaba `item_ref.estimated_cost_rd` original → mid-ciclo el
// display decía "0.5 lb" pero el precio/total eran de la cantidad COMPLETA (sobre-estima; plan-nuevo es
// exacto, por eso 119/119 no lo cazó). Este helper escala el costo al MISMO factor de la cantidad mostrada.
// Para unidades de ENVASE no divisibles (pote/frasco/lata/unidad…) redondea hacia ARRIBA a paquetes
// completos (compras el envase entero). tooltip-anchor: P2-PDF-COST-DELTA-MISMATCH
const _PDF_PACKAGE_UNITS = new Set([
    'pote', 'frasco', 'lata', 'unidad', 'unidades', 'ud', 'und', 'u', 'paquete', 'caja',
    'botella', 'sobre', 'barra', 'docena', 'bandeja', 'funda', 'carton', 'cartón',
]);
function _scaleItemRefCost(obj, finalQty, rawQty, unit) {
    const ref = obj && obj.item_ref;
    if (!ref || !(rawQty > 0) || !(finalQty > 0)) return obj;
    const origCost = ref.estimated_cost_rd ?? ref.estimated_cost;
    if (typeof origCost !== 'number' || !(origCost > 0)) return obj;
    let scaled;
    const u = String(unit || '').toLowerCase().trim();
    if (_PDF_PACKAGE_UNITS.has(u)) {
        const perUnit = origCost / rawQty;            // costo por envase canónico
        scaled = perUnit * Math.max(1, Math.ceil(finalQty));  // compras envases completos (≥1)
    } else {
        scaled = origCost * (finalQty / rawQty);      // peso/volumen: escala lineal
    }
    return { ...obj, item_ref: { ...ref, estimated_cost_rd: scaled, estimated_cost: scaled } };
}

const Q_DEGRADED_REASON_MAP = {
    high_contextual: 'No pudimos adaptar el plan a una restricción tuya (despensa, alergia o condición). Revisa tus datos en el formulario y regenera.',
    max_attempts: 'El revisor de calidad no aprobó el plan tras varios intentos. Te dimos la mejor versión disponible; revísala y usa Cambiar Plato si algo no cuadra.',
    invalid_pipeline_start: 'Hubo un problema técnico al iniciar la generación. Intenta regenerar el plan.',
    budget_exhausted: 'Se alcanzó el límite de tiempo de generación. Te dimos la mejor versión disponible.',
    // [P2-BAND-SCORE-GATE · 2026-06-15] motivo emitido por _maybe_mark_low_band_degraded
    low_band_score: 'La precisión de macros de este plan quedó por debajo de la banda objetivo (90-112% del target). Las porciones pueden no ser exactas; ajústalas a tu medida.',
    // [P2-PANEL-SOFT-REJECT · 2026-06-15] motivos de _maybe_mark_panel_degraded
    condition_panel_gap: 'El balance de tu condición (grasa saturada / potasio / magnesio / fibra) quedó fuera de la meta tras los ajustes automáticos. Revísalo con tu profesional.',
    low_micros: 'Algunos micronutrientes (fibra / potasio / magnesio / calcio) quedaron por debajo del objetivo diario.',
    high_sodium_sugar: 'El sodio o el azúcar añadida quedaron por encima del techo recomendado por la OMS.',
    // [P2-FASE7-HONESTY · 2026-06-21] Lista de compras incompleta (preocupación #1 del owner):
    // emitida por `_maybe_mark_shopping_incomplete_degraded` cuando el plan entregado quedó con la
    // lista vacía pese a tener recetas. Sobrescribe el genérico max_attempts (motivo más específico
    // + accionable). Las otras "honestidades" del build se surfacean en SU propia superficie, NO en
    // este banner: presupuesto insuficiente → bloqueo + toast pre-generación (Plan.jsx); piso de
    // proteína → disclaimer del plan de contingencia (Plan.jsx, `_review_disclaimer`); nevera baja →
    // banner en Mi Nevera. Por eso NO se duplican aquí (evita copy que nunca se dispara).
    shopping_list_incomplete: 'La lista de compras quedó incompleta para este plan. Regenera, o revisa que cada ingrediente de las recetas aparezca en tu lista.',
    // [P2-DEGRADE-BANNER-CLINICAL-COPY · 2026-06-22] (audit fresco P2-13) Dos motivos que el backend SÍ
    // emite (`_quality_degraded_reason`, graph_orchestrator.py:19030/19078) pero no tenían copy → caían al
    // genérico. `clinical_layer_incomplete` es severity HIGH y SOLO para perfiles con condición/alergia real
    // → es justo el subgrupo at-risk el que veía el copy menos accionable.
    clinical_layer_incomplete: 'No pudimos aplicar por completo la capa de seguridad clínica de tu perfil (condición/alergia). El plan es ORIENTATIVO: revísalo con tu profesional de salud antes de seguirlo y, si puedes, regenéralo.',
    composite_dish_unresolved: 'Algunos platos compuestos (ej. sancocho, mangú) no se pudieron desglosar en ingredientes con precisión, así que sus macros y su lista de compras son aproximados. Usa Cambiar Plato si necesitas más exactitud.',
    // [P1-MARKER-UNRESOLVED-HONESTY · 2026-06-23] (audit inteligencia P1-6) El corrector de
    // coherencia de slots (self_critique + surgical regen) no pudo resolver algún día tras los
    // reintentos → puede haber comidas repetidas (almuerzo↔cena) o un slot incoherente. Antes se
    // entregaba como plan plenamente verificado SIN aviso.
    slot_coherence_unresolved: 'Algunos días pueden tener comidas repetidas o poco variadas: el ajuste automático no terminó. Usa Cambiar Plato para variar el día que no te cuadre.',
    // [P3-MICRO-WORSTDAY-COPY · 2026-07-04] Los dos motivos del soft-reject del panel de micros
    // (P2-PANEL-SOFT-REJECT) caían al genérico "Calidad por debajo del óptimo" — el owner vio el
    // banner y no supo que era el SODIO del peor día (pregunta real 2026-07-04). Copy específico
    // y accionable, alineado con lo que el panel de micros muestra abajo.
    micro_worst_day_ceiling: 'Un día se pasa del techo de sodio o azúcar añadida (revisa el panel de micros: enlatados, queso y embutidos son los sospechosos típicos). Usa Cambiar Plato en la comida más salada de ese día.',
    micro_worst_day: 'Un día quedó por debajo del piso en algunos micronutrientes (fibra, potasio, magnesio…). Revisa el panel de micros y usa Cambiar Plato si quieres reforzar ese día.',
};

// [P3-NOTIF-CENTER-BACKFILL · 2026-06-16] Reconcilia (crea-o-enriquece) una
// notificación archivada. Helper PURO a nivel de módulo (no cierra sobre estado
// del componente → identidad estable, sin necesidad de useCallback). Tres casos:
//  - no existe y NO se backfilleó nunca → crear (si la borraste, no reaparece).
//  - existe sin `data` (notificación legacy pre-vista-expandida) → enriquecerla
//    in-place (sin tocar lectura ni posición).
//  - existe con data, o ya borrada tras backfill → no-op.
// El flag SÓLO se fija si la operación persistió de verdad (en cuota agotada las
// escrituras devuelven false → se reintenta en la próxima carga, no se pierde).
function reconcileBackfill(notif, backfillKey) {
    if (!notif || !notif.id) return; // sin contenido/id aún → reintentar luego (no marcar)
    const existing = getNotifications().find((n) => n.id === notif.id);
    let done;
    if (existing) {
        done = existing.data ? true : setNotificationData(notif.id, notif.data);
    } else if (safeLocalStorageGet(backfillKey, '') !== '1') {
        done = !!addNotification(notif);
    } else {
        done = true; // ya backfilleado y borrado por el usuario → nada que hacer
    }
    if (done) safeLocalStorageSet(backfillKey, '1');
}

// [P3-GREETING-ROTATE · 2026-06-19 · v2] El saludo del dashboard cambia cada ~2h de
// RELOJ (no cada 9s): es DETERMINÍSTICO por bloque horario → estable dentro de la
// ventana, distinto entre horas/visitas (más variedad) e INTELIGENTE (pool según la
// franja del día). Si cruzas un bloque con la pestaña abierta, anima la transición
// (blur + slide). Respeta prefers-reduced-motion (actualiza el texto sin animación).
const _GREETING_SUBTITLES = [
    'Aquí tienes tu estrategia nutricional.',
    'Tu plan, hecho a tu medida.',
    'Pequeños pasos, grandes resultados.',
    'Comida real, metas reales.',
    'Sigue tu plan, sin complicarte.',
    'Hoy es un buen día para nutrirte bien.',
    'Constancia, no perfección.',
    'Tu progreso, un plato a la vez.',
    'Lo simple, sostenido, gana.',
];

const _GREETING_NAME_STYLE = {
    background: 'linear-gradient(to right, #3B82F6, #8B5CF6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    display: 'inline-block',
    paddingRight: '0.08em',
    paddingBottom: '0.06em',
    lineHeight: 1.2,
    verticalAlign: 'baseline',
};

// Ventana de cambio: 2 horas de reloj.
const _GREETING_BLOCK_MS = 2 * 60 * 60 * 1000;

function _greetingSalutations(hour) {
    if (hour < 5) return ['Buenas madrugadas', 'Aún despierto', 'Trasnochando', 'Sin sueño', 'Hola'];
    if (hour < 12) return ['Buenos días', 'Buen día', 'Arriba', 'A darle', 'A por el día', 'Buen comienzo'];
    if (hour < 19) return ['Buenas tardes', 'Qué tal', 'Seguimos', 'Buena tarde', 'A media marcha', 'Hola'];
    return ['Buenas noches', 'Buenas', 'A cerrar el día', 'Ya de noche', 'Hola'];
}

function _pickGreeting() {
    const now = Date.now();
    const block = Math.floor(now / _GREETING_BLOCK_MS);
    const sal = _greetingSalutations(new Date(now).getHours());
    return {
        block,
        salutation: sal[block % sal.length],
        subtitle: _GREETING_SUBTITLES[block % _GREETING_SUBTITLES.length],
    };
}

function RotatingGreeting({ firstName }) {
    const prefersReducedMotion = useReducedMotion();
    const [g, setG] = useState(_pickGreeting);
    useEffect(() => {
        // Chequeo cada minuto; sólo actualiza (y anima) al cruzar el bloque de 2h.
        const id = setInterval(() => {
            setG((prev) => {
                const next = _pickGreeting();
                return next.block !== prev.block ? next : prev;
            });
        }, 60 * 1000);
        return () => clearInterval(id);
    }, []);

    const name = <span style={_GREETING_NAME_STYLE}>{firstName}</span>;

    if (prefersReducedMotion) {
        return (
            <>
                <h1 className="dashboard-title">{g.salutation}, {name}</h1>
                <p className="dashboard-subtitle">{g.subtitle}</p>
            </>
        );
    }

    return (
        <>
            <h1 className="dashboard-title" style={{ minHeight: '1.1em' }}>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                        key={g.salutation}
                        /* [P2-GREETING-BLUR-CLIP-FIX · 2026-06-29] SIN `filter: blur` aquí: aplicar un filter
                           al span padre rompe el `-webkit-background-clip: text` del nombre con gradiente
                           anidado ("angelo") en WebKit/Safari → el nombre se renderiza deforme/sólido durante
                           la animación. Mantenemos el fade + slide (opacity/y), que no tienen ese conflicto. */
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -14 }}
                        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                        style={{ display: 'inline-block' }}
                    >
                        {g.salutation}, {name}
                    </motion.span>
                </AnimatePresence>
            </h1>
            <p className="dashboard-subtitle" style={{ minHeight: '1.4em' }}>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                        key={g.subtitle}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                        style={{ display: 'inline-block' }}
                    >
                        {g.subtitle}
                    </motion.span>
                </AnimatePresence>
            </p>
        </>
    );
}

const DashboardInner = () => {
    // [APPEARANCE-THEME · 2026-05-29] Tema activo para los botones de acción de
    // cada comida (Ver receta / Cambiar Plato / Like): en oscuro sus fondos
    // pastel claros se ven lavados, así que usamos variantes vívidas/notorias.
    const isDark = isDarkActive();
    // 1. Obtenemos estado y funciones del Contexto Global
    const {
        planData,
        likedMeals,
        toggleMealLike,
        regenerateSingleMeal, // Ahora esta función es ASYNC (llama a la IA)
        regenerateDay, // [P5-PANTRY-SUFFICIENCY · 2026-06-23] actualizar el día desde la Nevera
        formData,
        planCount,
        PLAN_LIMIT,
        userPlanLimit,
        remainingCredits,
        isPremium,
        userProfile,
        loadingData,
        updateData,
        refreshProfileAndPlan,
        setPlanData,
        withRecalcLock,
        updateUserProfile,
        checkPlanLimit,
        // [P1-FORM-9] `session` requerido por `buildHealthProfilePayload` para
        // detectar race de hidratación cifrada. Si está ausente (guest), el
        // helper desactiva el gate y deja pasar el update.
        session,
        // [P1-GUEST-MODE · 2026-06-15] Invitado del funnel del plan gratuito.
        isGuest
    } = useAssessment();

    const { regeneratePlan } = useRegeneratePlan();

    const navigate = useNavigate();

    // [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Piso de presupuesto personalizado por las metas
    // del usuario (calorías × hogar × ciclo) — el editor de presupuesto del dashboard muestra el
    // MISMO mínimo que el backend exige al renovar (cero "422 sorpresa"). Fail-open al estático.
    const budgetFloor = useBudgetFloor(formData);
    // [P1-DASH-BUDGET-AUTOFILL · 2026-06-23] Se "arma" al cambiar la duración en modo Personalizar;
    // este efecto SINCRONIZA el monto al mínimo PERSONALIZADO por calorías de la nueva duración
    // cuando el hook lo trae (p.ej. 7d=RD$4,200, 15d=RD$7,350, 30d=RD$13,650). Sincroniza en AMBOS
    // sentidos (sube o baja) → el monto siempre = el mínimo de la duración elegida. Disarma tras
    // actuar, así no pisa lo que el usuario teclee DESPUÉS (hasta el próximo cambio de duración).
    const autofillArmedRef = useRef(false);
    useEffect(() => {
        if (!autofillArmedRef.current) return;
        if (formData?.budget !== 'custom') { autofillArmedRef.current = false; return; }
        if (!budgetFloor.isPersonalized) return; // espera el mínimo real del backend para la nueva duración
        if (String(budgetFloor.min) !== String(formData?.budgetAmount)) {
            updateData('budgetAmount', String(budgetFloor.min));
            safeUpdateHealthProfile({ budgetAmount: String(budgetFloor.min) });
        }
        autofillArmedRef.current = false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [budgetFloor.min, budgetFloor.isPersonalized]);

    // [P3-MICRO-PERSIST · 2026-06-15] El panel "Micronutrientes a vigilar"
    // desaparecía al refrescar: el `micronutrient_report` viaja DENTRO del plan,
    // pero un refetch/overwrite de `planData` (o un plan que vive solo en
    // localStorage sin fila en BD, como tras un persist fallido) podía dejar el
    // plan SIN el report → el panel se ocultaba. Cacheamos el report/advice
    // (keyed por una firma estable del plan) y lo usamos como FALLBACK, así el
    // panel persiste pase lo que pase con `planData`. La firma cambia al
    // regenerar (nuevo cycle_start_date) → cero stale entre planes distintos.
    const _planMicroSig = planData?.cycle_start_date || planData?.id || planData?.plan_id || planData?.name || null;
    // [P3-NOTIF-CENTER-STABLE-ID · 2026-06-16] Identificador estable para el panel
    // de micros (dismiss + id de notificación). Antes el panel usaba
    // `plan_id || id` que en planes solo-localStorage es undefined → la dismissal
    // no se persistía (el panel REAPARECÍA) y la notificación recibía un id por
    // timestamp (DUPLICADOS). Añadimos fallback a cycle_start_date/name (siempre
    // presentes cuando hay reporte de micros). plan_id/id PRIMERO preserva la
    // clave existente de planes que sí los tienen (cero migración para ellos).
    const _microPlanId = planData?.plan_id || planData?.id || planData?.cycle_start_date || planData?.name || null;
    useEffect(() => {
        const rep = planData?.micronutrient_report;
        const adv = planData?.micronutrient_supplement_advice;
        if (rep && _planMicroSig) {
            safeLocalStorageSet('mealfit_micros_cache', JSON.stringify({ sig: _planMicroSig, report: rep, advice: adv || null }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData?.micronutrient_report, planData?.micronutrient_supplement_advice, _planMicroSig]);

    const microReport = useMemo(() => {
        if (planData?.micronutrient_report) return planData.micronutrient_report;
        if (!_planMicroSig) return null;
        const c = safeJSONParse(safeLocalStorageGet('mealfit_micros_cache', null), null);
        return c && c.sig === _planMicroSig ? c.report : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData?.micronutrient_report, _planMicroSig]);

    const microAdvice = useMemo(() => {
        if (planData?.micronutrient_supplement_advice) return planData.micronutrient_supplement_advice;
        if (!_planMicroSig) return null;
        const c = safeJSONParse(safeLocalStorageGet('mealfit_micros_cache', null), null);
        return c && c.sig === _planMicroSig ? c.advice : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData?.micronutrient_supplement_advice, _planMicroSig]);

    // [P3-QDEGRADED-DISMISS · 2026-06-15] El banner "La IA no logró un plan óptimo"
    // persistía en CADA visita (molesto) y no se podía cerrar. Ahora es dismissible
    // y se recuerda por plan (misma firma estable que el cache de micros); se
    // resetea al cambiar de plan (otra firma → vuelve a mostrarse si aplica).
    const [qDegradedHidden, setQDegradedHidden] = useState(false);
    useEffect(() => {
        const key = _planMicroSig ? `mealfit_qdeg_dismissed_${_planMicroSig}` : null;
        setQDegradedHidden(!!(key && safeLocalStorageGet(key, '') === '1'));
    }, [_planMicroSig]);

    // [P2-PRO-REVIEW-DISMISS · 2026-06-27] El banner de revisión profesional (FS9, "Declaraste una condición
    // de salud…") ahora es dismissible con una X y se recuerda por plan (misma firma estable que micros/
    // qDegraded). Reaparece al cambiar de plan (firma distinta) → no se pierde el disclaimer en planes nuevos.
    const [proReviewHidden, setProReviewHidden] = useState(false);
    useEffect(() => {
        const key = _planMicroSig ? `mealfit_proreview_dismissed_${_planMicroSig}` : null;
        setProReviewHidden(!!(key && safeLocalStorageGet(key, '') === '1'));
    }, [_planMicroSig]);
    const dismissProReview = useCallback(() => {
        setProReviewHidden(true);
        const key = _planMicroSig ? `mealfit_proreview_dismissed_${_planMicroSig}` : null;
        if (key) safeLocalStorageSet(key, '1');
    }, [_planMicroSig]);
    // [P3-NOTIF-CENTER · 2026-06-16] SSOT del payload de notificación del banner
    // "plan no óptimo" (título + motivo, mismo copy que el banner). Compartido
    // entre el descarte (X) y el backfill. null si el plan no está degradado.
    const buildQualityNotification = useCallback(() => {
        if (!planData?._quality_degraded) return null;
        const _attempts = planData?._quality_degraded_attempts || 3;
        const _reason = planData?._quality_degraded_reason;
        const _sev = planData?._quality_degraded_severity === 'high' ? 'Importante' : 'Menor';
        const _reasonLabel = _reason
            ? (Q_DEGRADED_REASON_MAP[_reason] || 'Calidad por debajo del óptimo.')
            : null;
        const _reasonText = _reasonLabel
            ? `Motivo (${_sev}): ${_reasonLabel}`
            : 'Te entregamos la mejor versión. Usa Cambiar Plato o regenera el plan completo.';
        return {
            id: _planMicroSig ? `quality_${_planMicroSig}` : undefined,
            kind: 'quality',
            title: `Plan no óptimo (${_attempts} intento${_attempts === 1 ? '' : 's'})`,
            message: _reasonText,
            severity: 'warning',
            // Payload estructurado para la vista expandida.
            data: {
                attempts: _attempts,
                severityLabel: _sev,
                reasonLabel: _reasonLabel,
                guidance: 'Te entregamos la mejor versión disponible. Usa “Cambiar Plato” para reemplazar comidas puntuales, o regenera el plan completo si quieres reintentarlo.',
            },
        };
    }, [planData?._quality_degraded, planData?._quality_degraded_attempts, planData?._quality_degraded_reason, planData?._quality_degraded_severity, _planMicroSig]);

    const dismissQDegraded = () => {
        const notif = buildQualityNotification();
        if (notif) addNotification(notif);
        // Marca el backfill hecho → no re-crear si luego la borras del centro.
        if (_planMicroSig) safeLocalStorageSet(`mealfit_qdeg_notif_backfilled_${_planMicroSig}`, '1');
        setQDegradedHidden(true);
        if (_planMicroSig) safeLocalStorageSet(`mealfit_qdeg_dismissed_${_planMicroSig}`, '1');
    };

    // [P1-COHERENCE-BANNER-NOTIF · 2026-06-16] Mismo patrón que el banner "plan no
    // óptimo": el aviso "Revisa tu lista de compras" (`_swap_coherence_warnings`)
    // se puede CERRAR con su X — al cerrarlo se ARCHIVA en el centro de
    // notificaciones (no se pierde) y se abre el centro ("redirige a
    // notificaciones"). Recordado por plan para no re-molestar tras un reload.
    const [coherenceHidden, setCoherenceHidden] = useState(false);
    useEffect(() => {
        const key = _planMicroSig ? `mealfit_coherence_dismissed_${_planMicroSig}` : null;
        setCoherenceHidden(!!(key && safeLocalStorageGet(key, '') === '1'));
    }, [_planMicroSig]);
    const buildCoherenceNotification = useCallback(() => {
        const cc = planData?._swap_coherence_warnings?.critical_count;
        if (!cc) return null;
        return {
            id: _planMicroSig ? `coherence_${_planMicroSig}` : undefined,
            kind: 'warning',
            title: 'Revisa tu lista de compras',
            message: `Algunas recetas mencionan ingredientes que no quedaron bien reflejados en tu lista (${cc} ${cc === 1 ? 'detalle' : 'detalles'}). Usa “Cambiar Plato” en las comidas que te parezcan inconsistentes.`,
            severity: 'warning',
        };
    }, [planData?._swap_coherence_warnings?.critical_count, _planMicroSig]);
    const dismissCoherence = () => {
        const notif = buildCoherenceNotification();
        if (notif) addNotification(notif);
        setCoherenceHidden(true);
        if (_planMicroSig) safeLocalStorageSet(`mealfit_coherence_dismissed_${_planMicroSig}`, '1');
        // Abre el centro de notificaciones para que el usuario vea dónde quedó.
        openNotificationCenter();
    };

    // [P3-BUDGET-BANNER-DISMISS · 2026-07-04] El banner de presupuesto (dentro/cerca/
    // excedido) ahora tiene su X — mismo patrón que el de coherencia: al cerrarlo se
    // ARCHIVA en el centro de notificaciones (no se pierde) y se abre el centro.
    // Recordado por plan Y por status: si un recalc (household/duración/marca) cambia
    // el status (p.ej. dentro→excedido), el banner REAPARECE — ocultar un "cerca" no
    // debe silenciar un futuro "excedido".
    const _budgetStatus = planData?.budget_reconciliation?.status || '';
    const [budgetBannerHidden, setBudgetBannerHidden] = useState(false);
    useEffect(() => {
        const key = (_planMicroSig && _budgetStatus)
            ? `mealfit_budget_dismissed_${_planMicroSig}_${_budgetStatus}` : null;
        setBudgetBannerHidden(!!(key && safeLocalStorageGet(key, '') === '1'));
    }, [_planMicroSig, _budgetStatus]);
    const buildBudgetNotification = useCallback(() => {
        const _br = planData?.budget_reconciliation;
        if (!_br || !_br.status || _br.status === 'sin_limite' || !_br.reference_rd) return null;
        const _fmt = (v) => `RD$${Math.round(v || 0).toLocaleString('es-DO')}`;
        const _est = _br.basis && _br.basis !== 'custom' ? ' (referencia estimada)' : '';
        const title = _br.status === 'dentro'
            ? 'Presupuesto: dentro de tu referencia'
            : _br.status === 'cerca'
                ? 'Presupuesto: al límite de tu referencia'
                : 'Presupuesto: tu lista supera tu referencia';
        const subs = Array.isArray(_br.substitutions) && _br.substitutions.length
            ? ` Para cuidar tu bolsillo ajustamos: ${_br.substitutions.slice(0, 3).join(' · ')}.` : '';
        return {
            id: _planMicroSig ? `budget_${_planMicroSig}_${_br.status}` : undefined,
            kind: 'info',
            title,
            message: `${_fmt(_br.estimated_cycle_rd)} de ${_fmt(_br.reference_rd)}${_est} por ciclo.${subs}`,
            severity: _br.status === 'excedido' ? 'warning' : 'info',
        };
    }, [planData?.budget_reconciliation, _planMicroSig]);
    const dismissBudgetBanner = () => {
        const notif = buildBudgetNotification();
        if (notif) addNotification(notif);
        setBudgetBannerHidden(true);
        const key = (_planMicroSig && _budgetStatus)
            ? `mealfit_budget_dismissed_${_planMicroSig}_${_budgetStatus}` : null;
        if (key) safeLocalStorageSet(key, '1');
        // Abre el centro para que el usuario vea dónde quedó archivado.
        openNotificationCenter();
    };

    // [P1-REASONING-DISMISS · 2026-06-26] El panel "Razonamiento" (Diagnóstico /
    // Plan de Acción / Tip del Chef) ahora tiene su "X": al cerrarlo se ARCHIVA en
    // el centro de notificaciones (no se pierde) y se puede volver a mostrar cuando
    // el usuario quiera (botón "Volver a mostrar" del centro → INSIGHTS_RESTORE_EVENT).
    // Recordado por plan (firma estable) → se resetea al cambiar de plan.
    const [reasoningHidden, setReasoningHidden] = useState(false);
    useEffect(() => {
        const key = _planMicroSig ? insightsDismissKey(_planMicroSig) : null;
        setReasoningHidden(!!(key && safeLocalStorageGet(key, '') === '1'));
    }, [_planMicroSig]);
    // Re-mostrar al instante cuando el centro pide restaurar ESTE plan (o genérico).
    useEffect(() => {
        const onRestore = (e) => {
            const sig = e?.detail?.sig;
            if (sig && _planMicroSig && sig !== _planMicroSig) return; // no es para este plan
            setReasoningHidden(false);
        };
        window.addEventListener(INSIGHTS_RESTORE_EVENT, onRestore);
        return () => window.removeEventListener(INSIGHTS_RESTORE_EVENT, onRestore);
    }, [_planMicroSig]);
    const buildInsightsNotification = useCallback(() => {
        const insights = Array.isArray(planData?.insights) ? planData.insights.filter(Boolean) : [];
        if (!insights.length) return null;
        return {
            id: _planMicroSig ? `insights_${_planMicroSig}` : undefined,
            kind: 'insights',
            title: 'Razonamiento de tu plan',
            message: 'Diagnóstico, plan de acción y tip del chef de tu plan actual.',
            severity: 'info',
            data: { insights },
        };
    }, [planData?.insights, _planMicroSig]);
    const dismissReasoning = () => {
        const notif = buildInsightsNotification();
        if (notif) addNotification(notif);
        setReasoningHidden(true);
        if (_planMicroSig) safeLocalStorageSet(insightsDismissKey(_planMicroSig), '1');
        toast('Razonamiento guardado', {
            description: 'Quedó en Notificaciones (campana) — ábrelas para volver a mostrarlo cuando quieras.',
        });
    };

    // [P3-NOTIF-CENTER-BACKFILL · 2026-06-16] Reconciliación para avisos
    // descartados ANTES de que existiera el centro de notificaciones: quedaron
    // marcados como "ocultos" en localStorage pero sin notificación archivada.
    // Si el aviso está descartado, su contenido sigue disponible y todavía no se
    // archivó (flag por-plan), se crea la notificación UNA vez. El flag se fija
    // tras el primer backfill → si luego borras la notificación del centro, NO
    // reaparece (el borrado es permanente). Idempotente y por-plan.
    // Backfill de micros: reconcilia (crea-o-enriquece) la notificación de un
    // panel descartado. Ver reconcileBackfill (módulo) para la semántica.
    useEffect(() => {
        // [P3-NOTIF-CENTER-CONTENT-DISMISS · 2026-06-16] Clave content-based
        // (espeja el panel) + lee también la legacy por planId para migrar
        // descartes previos. El flag de backfill también es content-based → el
        // panel (archive directo) y este efecto comparten id de notificación y
        // flag, sin asimetría.
        const sig = microsContentSig(microReport, microAdvice);
        const dismissedContent = !!sig && safeLocalStorageGet(`mealfit_micros_dismissed_c_${sig}`, '') === '1';
        const dismissedLegacy = !!_microPlanId && safeLocalStorageGet(`mealfit_micros_dismissed_${_microPlanId}`, '') === '1';
        if (!dismissedContent && !dismissedLegacy) return; // panel visible → se archiva al descartar
        reconcileBackfill(
            buildMicrosNotification({ report: microReport, advice: microAdvice }),
            sig ? `mealfit_micros_notif_backfilled_c_${sig}` : `mealfit_micros_notif_backfilled_${_microPlanId}`,
        );
    }, [_microPlanId, microReport, microAdvice]);

    // Backfill del banner "plan no óptimo".
    useEffect(() => {
        if (!_planMicroSig) return;
        const dismissed = safeLocalStorageGet(`mealfit_qdeg_dismissed_${_planMicroSig}`, '') === '1';
        if (!dismissed) return;
        reconcileBackfill(
            buildQualityNotification(),
            `mealfit_qdeg_notif_backfilled_${_planMicroSig}`,
        );
    }, [_planMicroSig, buildQualityNotification]);

    // [P3-DASH-TABS-NO-MOUNT-JUMP · 2026-06-16] Las pestañas de día "se movían"
    // unos ms al refrescar: el auto-select del día activo + la ventana rolling
    // cambian el estado JUSTO tras el primer paint, y `layout="position"` + los
    // transforms (y/scale) de framer animaban ese asentamiento. Gateamos las
    // animaciones de las pestañas hasta que el estado inicial se asienta: durante
    // ese rato aplican INSTANTÁNEO (sin layout, transición 0) → cero salto al
    // cargar. Tras asentarse, se habilitan para interacciones reales (click,
    // fin-de-día con su fade/reacomodo).
    const [tabsSettled, setTabsSettled] = useState(false);
    useEffect(() => {
        const id = setTimeout(() => setTabsSettled(true), 80);
        return () => clearTimeout(id);
    }, []);

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
    // [UX-DURATION-PANEL-BACKDROP · 2026-07-03] El panel vive en un PORTAL a <body> (iteración 2):
    // el intento 1 (backdrop en portal + panel in-tree con zIndex 9999) fallaba porque un ancestro
    // del dashboard crea su propio stacking context → el panel competía DENTRO de ese contexto y el
    // backdrop de body lo tapaba (todo salía borroso, incluido el menú). Portalizando TAMBIÉN el
    // panel, backdrop (z 9998) y panel (z 9999) comparten el contexto raíz de body y el orden es
    // determinista. El panel se posiciona con el rect del trigger (medido al abrir + resize/scroll).
    const despensaPanelRef = useRef(null);
    const [despensaMenuRect, setDespensaMenuRect] = useState(null);
    useEffect(() => {
        if (!showDespensaDropdown) return;
        const measure = () => {
            const el = despensaDropdownRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            setDespensaMenuRect({ top: r.top, left: r.left, width: r.width });
        };
        measure();
        window.addEventListener('resize', measure);
        // capture=true: también scrolls de contenedores internos, no solo el window.
        window.addEventListener('scroll', measure, true);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [showDespensaDropdown]);

    // [P3-DASH-SCROLL-TOP · 2026-06-01] Al montar el Dashboard, resetea el scroll
    // arriba. React Router (BrowserRouter) NO restaura scroll en cambios de ruta:
    // al venir del landing (donde el CTA sticky "Ver mi Plan" aparece tras
    // scrollear hacia abajo) el window conservaba esa posición → el dashboard
    // aparecía scrolleado al fondo. Triple reset window/documentElement/body por
    // robustez en iOS Safari (mismo patrón que Recipes.jsx:395 y BottomTabBar.jsx:30).
    // El dashboard scrollea el window, no un contenedor interno.
    useEffect(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, []);

    // Cierra los dropdowns custom si el usuario hace clic fuera de ellos
    useEffect(() => {
        function handleClickOutside(event) {
            // [UX-DURATION-PANEL-BACKDROP · 2026-07-03] el panel vive en un portal fuera del ref del
            // trigger → un click DENTRO del panel portaleado no debe cerrarlo (chequear ambos refs).
            const inTrigger = despensaDropdownRef.current && despensaDropdownRef.current.contains(event.target);
            const inPanel = despensaPanelRef.current && despensaPanelRef.current.contains(event.target);
            if (!inTrigger && !inPanel) {
                setShowDespensaDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Estado local para la navegación por pestañas (Días)
    const [activeDayIndex, setActiveDayIndex] = useState(0);
    const [isRecalculating, setIsRecalculating] = useState(false);
    // [P2-NEVERA-COMPLETION-REMOVED · 2026-07-06] eliminado el estado
    // `pantryCompletionList` junto con el panel "Para completar tu Nevera"
    // (decisión del owner: redundante con la lista de compras + ocupaba espacio).
    // [P3-DASH-WINDOW-AUTOSELECT · 2026-05-30] Track del índice de "hoy" del render
    // anterior, para detectar cuándo el día avanza (medianoche / re-index del shift)
    // y seguir a hoy. Ref declarado aquí (top-level hooks) — NO dentro del effect,
    // para no añadir un hook tras el early-return de carga del componente.
    const _prevTodayPlanDayIndexRef = useRef(null);

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
        // [P4-LOCALSTORAGE-LAZY-INIT] getItem crudo aquí lanzaba SecurityError
        // en iOS Private Mode / storage deshabilitado → crash del lazy initializer
        // → Dashboard al GlobalErrorBoundary. safeLocalStorageGet absorbe el throw
        // (hermano del P1-AGENT-LAZY-INIT-PRIVATE-MODE). safeJSONParse maneja null→[].
        const saved = safeLocalStorageGet('mealfit_disabled_ingredients', null);
        return safeJSONParse(saved, [], {
            validator: (v) => Array.isArray(v) && v.every(i => typeof i === 'string'),
        });
    });

    // Estados para Compras con 1 clic
    const [showRestockModal, setShowRestockModal] = useState(false);
    const [isRestocking, setIsRestocking] = useState(false);

    // [P2-CUSTOM-MODALS-A11Y · 2026-05-24] Hook a11y para el restock modal
    // inline (renderizado en JSX línea ~4475). `disableClose=isRestocking`
    // evita que ESC cierre el modal mid-flight (operación POST /restock
    // ya iniciada; cerrar mid-request deja state inconsistente con BD).
    // [P2-DASH-SCAN-ONCLOSE-MEMO · 2026-05-30] onClose memoizado (era arrow inline).
    // Misma clase que TrackingProgress/push-onboarding: identidad estable → el effect
    // de useModalAccessibility no se re-arma en cada render de Dashboard mientras el
    // modal está abierto. Benigno aquí (solo botones confirm/cancel, sin input de
    // texto) pero cierra la clase de forma consistente.
    const closeRestockModal = useCallback(() => setShowRestockModal(false), []);
    const { containerRef: restockModalRef } = useModalAccessibility({
        isOpen: showRestockModal,
        onClose: closeRestockModal,
        disableClose: isRestocking,
    });
    // [P3-RESTOCK-NO-BAR · 2026-05-20] State acoplado a la barra REMOVIDO:
    // contador rAF de progreso, trigger fast-finish, constantes de duración,
    // useEffect rAF driver, useEffect watcher modal-close. Decisión de
    // producto: el modal ahora muestra solo icon spinner + título +
    // descripción; cierra directamente post-response success. Bundle
    // Dashboard.jsx bajó ~8KB. Tooltip-anchor: P3-RESTOCK-NO-BAR.

    // Estados para GAP 8 (Bandas informativas de modales)

    // Estados para GAP 9 (Carga inline tras el clic)
    const [isNavigatingOption, setIsNavigatingOption] = useState(null);

    // Helper: Resetear/restaurar estado de restock según la configuración
    // Si el usuario vuelve a los mismos valores con los que registró compras,
    // la nevera ya tiene esas cantidades → no mostrar botón de nuevo.

    // Estado para el modal de Onboarding de Alertas Inteligentes
    const [showPushOnboarding, setShowPushOnboarding] = useState(false);
    const [isPushEnabling, setIsPushEnabling] = useState(false);

    // [P3-DASH-MODALS-A11Y · 2026-05-30] a11y SSOT para el modal de Onboarding
    // Push. Era el ÚNICO modal del Dashboard sin useModalAccessibility (el restock
    // modal inline ~línea 209 sí lo usa): overlay full-screen sin role=dialog/ESC/
    // focus-trap/restore. Dismiss memoizado (identidad estable → el effect del hook
    // no se re-arma robando foco); ESC = dismiss = marca "visto" (misma semántica
    // que el botón "Quizá más tarde"). `disableClose=isPushEnabling` evita cerrar
    // mid-request. Declarado ARRIBA de los early-returns (~731/754) para cumplir
    // rules-of-hooks. SSOT del dismiss — reemplaza al viejo handleDismissPushOnboarding.
    const dismissPushOnboarding = useCallback(() => {
        setShowPushOnboarding(false);
        // safeLocalStorageSet — raw setItem lanza en iOS Private Mode (P1-PROD-FINAL-3).
        safeLocalStorageSet('mealfit_push_onboarding_seen', 'true');
    }, []);
    const { containerRef: pushOnboardingRef } = useModalAccessibility({
        isOpen: showPushOnboarding,
        onClose: dismissPushOnboarding,
        disableClose: isPushEnabling,
    });

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
    //     (la data acaba de venir directo desde el backend anterior, es fresca por definición).
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
    // [P3-DASH-WINDOW-WAKE · 2026-05-29] El tick por setTimeout no basta por sí
    // solo: si el dispositivo se suspende cruzando la medianoche (laptop
    // cerrada, móvil en background), el navegador throttlea/pospone el timer y
    // `todayDate` queda stale → la ventana rolling de días no avanza al día
    // correcto hasta que el timer despierta. Re-sincronizamos al volver a primer
    // plano (visibilitychange/focus/pageshow): recalculamos la medianoche local
    // y, si cambió de día, actualizamos el state y reprogramamos el próximo tick.
    useEffect(() => {
        let timerId = null;

        const computeMidnight = () => {
            const d = new Date(); d.setHours(0, 0, 0, 0); return d;
        };

        // Functional update: evita un re-render si seguimos en el mismo día
        // (focus/visibilitychange disparan a menudo sin cruce de medianoche).
        const syncToday = () => {
            const d = computeMidnight();
            setTodayDate(prev => (prev && prev.getTime() === d.getTime() ? prev : d));
        };

        const scheduleNextMidnight = () => {
            const now = new Date();
            const nextMidnight = new Date(now);
            nextMidnight.setDate(nextMidnight.getDate() + 1);
            nextMidnight.setHours(0, 0, 0, 0);
            const msUntilMidnight = nextMidnight - now;
            timerId = setTimeout(() => {
                syncToday();
                scheduleNextMidnight();
            }, msUntilMidnight);
        };

        const onWake = () => {
            // visibilitychange también dispara al OCULTAR la pestaña: ignorar.
            if (document.visibilityState === 'hidden') return;
            syncToday();
            // Tras una suspensión larga el timer pendiente puede traer un delay
            // desfasado; lo reseteamos para apuntar a la próxima medianoche real.
            if (timerId !== null) clearTimeout(timerId);
            scheduleNextMidnight();
        };

        scheduleNextMidnight();
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('focus', onWake);
        window.addEventListener('pageshow', onWake);

        return () => {
            if (timerId !== null) clearTimeout(timerId);
            document.removeEventListener('visibilitychange', onWake);
            window.removeEventListener('focus', onWake);
            window.removeEventListener('pageshow', onWake);
        };
    }, []);

    const restockLock = useRef(false);
    // [P5-DAY-UPDATE-DOUBLECLICK · 2026-06-23] Candado SÍNCRONO contra doble-tap en
    // "Actualizar platos" (día completo). El guard previo `isNavigatingOption` es STATE
    // (async) → un doble-tap rápido pasa el check 2 veces antes del re-render → 2 requests
    // /regenerate-day → 2 créditos cobrados (confirmado en prod 2026-06-23). Un ref es
    // síncrono: el segundo tap ve `true` y aborta de inmediato. Mismo patrón que restockLock.
    const dayUpdateLock = useRef(false);
    // [P5-LOADING-DISABLE · 2026-06-23] Estado visual del botón "Actualizar platos" (día completo):
    // spinner + disabled mientras corre regenerateDay (dayUpdateLock es el guard SÍNCRONO; este
    // STATE dispara el re-render del botón para que se vea cargando y no sea clickeable de nuevo).
    const [isDayUpdating, setIsDayUpdating] = useState(false);
    // Candado SÍNCRONO para el modal de "Cambiar Plato" individual contra doble-tap (mismo bug de
    // doble-cobro que el día: setSwapModal(null) es async → un 2º tap pasaría antes del re-render).
    const swapInFlightLock = useRef(false);
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
    const safeUpdateHealthProfile = useCallback((overrides, { silent = false } = {}) => {
        if (!userProfile || typeof updateUserProfile !== 'function') return false;
        const payload = buildHealthProfilePayload(formDataRef.current, overrides, session);
        if (!payload) {
            // [P1-PROFILE-TOAST-SILENT · 2026-06-16] El guard de hidratación
            // (buildHealthProfilePayload→null cuando allergies/medicalConditions
            // leen como []) bloquea la escritura para no pisar datos médicos. PERO
            // las escrituras de FONDO (sync debounced de disabled_ingredients, que
            // corre en cada carga del dashboard + cada cambio) NO deben molestar al
            // usuario con un toast — se reintentan solas en el próximo cambio y la
            // copia en localStorage ya quedó guardada. Sin esto, un perfil cuyos
            // arrays sensibles leen [] (race persistente o blob no-desencriptado)
            // disparaba el toast "a cada rato". El toast queda SOLO para acciones
            // explícitas del usuario (p.ej. cambiar duración de compras), donde el
            // feedback sí es útil.
            if (!silent) {
                toast.warning('Tu perfil aún se está cargando. Inténtalo en un momento.', {
                    duration: 3500,
                });
            }
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

    // Sync disabledIngredients → localStorage + el backend anterior (debounced) on every change
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
            // [P1-PROFILE-TOAST-SILENT · 2026-06-16] `silent`: es un sync de FONDO
            // → si el guard lo bloquea, NO toast (se reintenta + ya está en
            // localStorage). Evita el nag "Tu perfil aún se está cargando" repetido.
            safeUpdateHealthProfile({ disabled_ingredients: disabledIngredients }, { silent: true });
        }, 800);
    }, [disabledIngredients]); // eslint-disable-line react-hooks/exhaustive-deps

    // [P3-DASH-DISABLED-SYNC-TIMER-CLEANUP · 2026-06-01] Cancelar el debounce de
    // disabled_ingredients al desmontar DashboardInner (route change SPA dentro de
    // la ventana de 800ms): sin esto el setTimeout sobrevivía al unmount y disparaba
    // safeUpdateHealthProfile sobre un componente desmontado (write fantasma + warning
    // React). Misma clase ya cerrada para _recalcDebounceTimer/pendingOps en Pantry.
    useEffect(() => () => { clearTimeout(disabledSyncTimer.current); }, []);

    // [P3-PLAN-BTN-STABLE · 2026-05-19] Sync del cache localStorage cada vez que
    // `liveInventory` cambia (cubre fetch inicial + refetch on focus/visibilitychange
    // + restock). Centralizar acá evita duplicar la escritura del cache en cada
    // callsite de `setLiveInventory`. SSOT: liveInventory.length → cache.
    useEffect(() => {
        if (!_pantryCountCacheKey || !Array.isArray(liveInventory)) return;
        const count = liveInventory.length;
        setCachedPantryCount(count);
        try { localStorage.setItem(_pantryCountCacheKey, String(count)); } catch { /* quota / private mode */ }
    }, [liveInventory, _pantryCountCacheKey]);

    // Fetch inventario real desde user_inventory (refleja consumos y ediciones de la Nevera)
    // [P1-5] Usa `fetchFreshInventoryWithTimeout` (cap 2000ms) y alimenta
    // `inventoryStale`. Si el backend anterior tarda o falla en el mount inicial, el
    // Dashboard arranca con `inventoryStale=true` y el chip ámbar se muestra
    // sobre los botones — el usuario sabe ANTES de actuar que su Nevera puede
    // estar desactualizada. Si la fetch funciona, baja el flag a false.
    useEffect(() => {
        if (!userProfile?.id) {
            setIsLoadingInventory(false);
            return;
        }
        // [P2-DASH-INVENTORY-FETCH-RACE · 2026-06-01] ignore-flag: dos setPlanData
        // rápidos (swap optimista seguido de recalc-success) podían lanzar dos
        // fetchLiveInventory concurrentes y resolver fuera de orden → setLiveInventory
        // last-writer-wins con datos no-latest. El flag descarta resoluciones obsoletas
        // (mismo patrón AbortController del effect hermano P1-DASHBOARD-POLLING-ABORT).
        let ignore = false;
        const fetchLiveInventory = async () => {
            setIsLoadingInventory(true);
            // [P1-NEON-DB-MIGRATION · 2026-06-12] SELECT directo → GET /api/inventory.
            const result = await fetchFreshInventoryWithTimeout(
                fetchInventoryFromApi,
                getInventoryFetchTimeoutMs(),
            );
            if (ignore) return;
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
        return () => { ignore = true; };
        // [P2-DASH-INVENTORY-FETCH-RACE · 2026-06-01] Dep estrechada de `planData`
        // (objeto completo, ref nueva en cada chunk / swap / recalc) a
        // `id`+`generation_status`. La frescura del inventario ya la cubren el
        // refresh on visibilitychange/focus y el custom-event
        // mealfit:refresh-inventory; mantener generation_status preserva
        // el único caso no cubierto (transición partial→complete llena la nevera).
    }, [userProfile?.id, planData?.id, planData?.generation_status]);

    // [P1-NEON-DB-MIGRATION · 2026-06-12] Canal realtime `dashboard-inventory-sync`
    // (postgres_changes sobre user_inventory) ELIMINADO: la publicación Realtime de
    // el backend anterior muere con el cutover a Neon. Su callback solo refetcheaba el
    // inventario — el refetch on visibilitychange/focus de abajo + el custom event
    // `mealfit:refresh-inventory` + el refetch post-mutación (restock/PDF) quedan
    // como mecanismo único de sincronización.

    // Sincronización: refrescar inventario cuando el usuario vuelve al tab
    // (cubre el caso multi-tab/device y el usuario que navegó a Pantry y vació la nevera)
    // [P1-5] Usa `fetchFreshInventoryWithTimeout` y mantiene `inventoryStale` en sync:
    // si el refresh-on-focus falla/timeoutea, el chip se enciende para avisar.
    // Si succeed, lo bajamos.
    useEffect(() => {
        if (!userProfile?.id) return;
        const refreshInventoryOnFocus = async () => {
            // [P1-NEON-DB-MIGRATION · 2026-06-12] SELECT directo → GET /api/inventory.
            const result = await fetchFreshInventoryWithTimeout(
                fetchInventoryFromApi,
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

        // [P1-DASHBOARD-POLLING-ABORT · 2026-05-23] AbortController scoped
        // al useEffect — cancela TODOS los fetches in-flight (inicial +
        // los del setInterval) cuando el usuario navega fuera del Dashboard.
        // Pre-fix, el clearInterval del cleanup solo prevenía nuevos polls
        // pero los fetches ya lanzados completaban post-unmount y disparaban
        // setChunkStatusInfo() sobre componente desmontado (warning React +
        // body parseado retenido). Mismo patrón que P1-HISTORY-ABORT.
        const controller = new AbortController();
        const signal = controller.signal;

        if (_isActiveForChunkPoll && planData?.id) {
            // Fetch inicial y también a través del polling normal de
            // 30s que ya refresca el plan. El response es chico
            // (counters + paused_chunks resumido), no requiere su
            // propio interval — piggyback al refresh del plan.
            getPlanChunkStatus(planData.id, { signal })
                .then(async (r) => {
                    if (signal.aborted) return;
                    if (!r || !r.ok) return;
                    const body = await r.json().catch(() => null);
                    if (signal.aborted) return;
                    if (body && typeof body === 'object') setChunkStatusInfo(body);
                })
                .catch(() => { /* best-effort (incluye AbortError): el chip cae al fallback plan_data-only */ });
        } else if (chunkStatusInfo !== null && status === 'complete') {
            // Plan completado: limpiar el snapshot stale para que el
            // render no muestre paused chunks viejos.
            setChunkStatusInfo(null);
        }

        if (status === 'partial') {
            setShowChunkBanner(true);
            pollInterval = setInterval(() => {
                if (signal.aborted) return;
                // [P2-DASH-POLL-VISIBILITY · 2026-05-31] Pausar el poll de 30s
                // cuando la pestaña está oculta (ahorra red/batería en sesiones
                // background largas). El listener de visibilitychange ya refresca
                // al volver a la pestaña, así que no se pierde frescura.
                if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
                refreshProfileAndPlan();
                if (planData?.id) {
                    getPlanChunkStatus(planData.id, { signal })
                        .then(async (r) => {
                            if (signal.aborted) return;
                            if (!r || !r.ok) return;
                            const body = await r.json().catch(() => null);
                            if (signal.aborted) return;
                            if (body && typeof body === 'object') setChunkStatusInfo(body);
                        })
                        .catch(() => { /* incluye AbortError post-unmount */ });
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
            // [P1-DASHBOARD-POLLING-ABORT · 2026-05-23] Cancela fetches
            // in-flight para evitar setState-on-unmounted. Si el browser
            // ya cerró el request (AbortError) el .catch silencioso lo
            // absorbe — cero noise post-unmount.
            try { controller.abort(); } catch { /* noop */ }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData?.generation_status, refreshProfileAndPlan]);

    // [P1-DASH-HOOKS-ORDER · 2026-05-31] Los guards `loadingData` / `!planData`
    // se movieron al wrapper `Dashboard` (final del archivo). Aquí ya NO hay
    // early-returns antes de los hooks → orden de hooks estable. `DashboardInner`
    // solo se monta cuando los datos están listos (loadingData=false && planData).

    // Cálculos para la UI de límites
    const isLimitReached = typeof userPlanLimit === 'number' && planCount >= userPlanLimit;

    // [P3-UPDATE-PLATOS-REQUIRES-PANTRY · 2026-05-17] Gate "Actualizar platos"
    // contra Nevera vacía. `pantryItemCount`:
    //   - `null`  → inventario no cargado aún o fetch falló (no bloquear)
    //   - número  → conteo de filas con quantity > 0 (filtro ya aplicado
    //               server-side en GET /api/inventory de `fetchLiveInventory`)
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

    // [GROCERY-START-DATE-LOCAL-PARSE 2026-05-06] Parser local-aware +
    // diferencia en días-calendario. La implementación (y el detalle del bug
    // UTC-midnight que cierra) vive ahora en utils/planWindow.js, testeada con
    // fechas fijas. `_parseStartLocal` se conserva como alias local porque lo
    // usan los dos call sites de fecha de abajo.
    // [P3-DASH-WINDOW-TEST · 2026-05-29]
    const _parseStartLocal = parseStartLocal;

    const rawStartDate = planData?.grocery_start_date || planData?.created_at;
    const startMidnight = _parseStartLocal(rawStartDate);

    const daysSinceCreation = daysSinceMidnight(todayMidnight, startMidnight);

    // cycle_start_date: fecha inmutable de inicio del ciclo (no la rota el backend).
    // Se usa solo para el contador "daysLeft" del badge; daysSinceCreation se mantiene
    // basado en grocery_start_date porque el resto del Dashboard (rolling window, índice
    // de día actual en planDays, etc.) depende de ese desplazamiento.
    const rawCycleStart = planData?.cycle_start_date || rawStartDate;
    const cycleStartMidnight = _parseStartLocal(rawCycleStart);
    const daysSinceCycleStart = daysSinceMidnight(todayMidnight, cycleStartMidnight);

    // [P3-DASH-WINDOW-TEST · 2026-05-29] maxDays/expiryExtension/totalAllowedDays/
    // isPlanExpired/daysLeft/planFinished se derivan en utils/planWindow.js
    // (computeCycleStatus), testeado con fechas fijas: incluye la extensión de
    // expiración por generación incompleta (GAP 8 — no marcar expirado un plan
    // que aún se completa por chunks) y la expiración contra el ciclo inmutable
    // cycle_start_date (daysSinceCycleStart), no el rolling grocery_start_date.
    const generated_days = planData?.days?.length || 0;
    const {
        maxDays,
        isPlanExpired,
        daysLeft,
        planFinished,
    } = computeCycleStatus({
        groceryDuration,
        generatedDays: generated_days,
        daysSinceCycleStart,
    });

    // [BADGE-HOURS] El badge del ciclo deja de mostrar "0d" (confuso: ¿terminó o no?).
    //   - Último día (daysLeft===1): horas reales restantes hasta el fin del ciclo.
    //   - Ciclo terminado (daysLeft===0): estado "Finalizado" + CTA reiniciar.
    // cycleEndMs = medianoche local tras el último día del ciclo (cycleStart + maxDays).
    // Quedan inline (no en planWindow.js) porque dependen de Date.now() (no-puro).
    const cycleEndMs = cycleStartMidnight.getTime() + maxDays * 24 * 60 * 60 * 1000;
    const hoursUntilCycleEnd = Math.max(1, Math.ceil((cycleEndMs - Date.now()) / (60 * 60 * 1000)));

    // [P3-PLAN-CORRUPTED-BANNER · 2026-05-27] Detecta planes que entraron al
    // localStorage en estado inválido y nunca se autorrecuperaron. Dos modos
    // canónicos del fallo (audit P0-AUDIT 2026-05-25, plan 884bd00a):
    //   (a) `generation_status === 'failed'` — SQL forensic ya marcó el plan
    //       como inválido pero el cliente sigue cargándolo desde localStorage.
    //   (b) `generation_status === 'partial'` + `days=[]` — el chunk worker T1
    //       no produjo días (corrupción silente). Sin este flag, el botón PDF
    //       falla silente porque `aggregated_shopping_list*` está vacío.
    // El banner ofrece CTA directo a /assessment para regenerar — más eficaz
    // que un toast que aparece solo al clickear PDF.
    const isPlanCorrupted = !!planData && (
        planData.generation_status === 'failed'
        || (
            planData.generation_status === 'partial'
            && Array.isArray(planData.days)
            && planData.days.length === 0
        )
    );

    // [P2-SHOPLIST-AUTO-REFRESH · 2026-07-06] Recalc SILENCIOSO de la lista de
    // compras al cargar el Dashboard (una vez por plan). Pedido del owner: la
    // lista persistida solo se actualizaba al cambiar duración 30→15→30 (truco
    // manual) — cambios server-side (marcas default, precios vivos, fixes de
    // costeo) quedaban invisibles hasta ese dance. Mismo endpoint canónico que
    // el cambio de duración (cero costo LLM, RateLimiter 20/60s, atómico
    // P1-RECALC-LOSTUPDATE) con preserve_restock. Sin toast: si falla, la lista
    // persistida sigue siendo válida (fail-open).
    const _shopAutoRefreshRef = useRef(null);
    useEffect(() => {
        if (isGuest || !userProfile?.id || !planData?.id) return;
        if (isPlanExpired || planFinished || isPlanCorrupted) return;
        // [P2-BRANDS-CANONICAL-SOURCE · 2026-07-06] gate por DAYS (la fuente del
        // recalc), NO por la lista activa: post-restock total la activa queda
        // vacía por diseño y el gate viejo BLOQUEABA el self-heal del recalc.
        if (!Array.isArray(planData?.days) || planData.days.length === 0) return;
        if (_shopAutoRefreshRef.current === planData.id) return;
        _shopAutoRefreshRef.current = planData.id;
        (async () => {
            try {
                await withRecalcLock(async () => {
                    const r = await fetchWithAuth(`${API_BASE}/api/plans/recalculate-shopping-list`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id: userProfile.id,
                            plan_id: planData.id,
                            householdSize: formData?.householdSize || planData.calc_household_size || 1,
                            groceryDuration: planData.calc_grocery_duration || formData?.groceryDuration || 'weekly',
                            preserve_restock: true,
                        }),
                    });
                    if (!r.ok) return;
                    const result = await r.json().catch(() => null);
                    if (result?.success && result.plan_data) {
                        setPlanData(result.plan_data);
                        safeLocalStorageSet('mealfit_plan', JSON.stringify(result.plan_data));
                    }
                });
            } catch { /* fail-open: la lista persistida sigue siendo válida */ }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGuest, userProfile?.id, planData?.id, isPlanExpired, planFinished, isPlanCorrupted]);

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

        // [P5-PRESENCE-SHOPPING-LIST · 2026-06-23] La supresión por ventana-de-tiempo
        // is_restocked (isPostRestockRotation + _staleDedup) fue ELIMINADA. El modelo ahora es de
        // PRESENCIA pura: un ítem se muestra SOLO si está ausente de la Nevera (ver loop abajo).
        // Eso vuelve innecesario el flag (un ítem agotado nunca puede quedar oculto) y elimina la
        // clase de bug "Lista Vacía pese a Nevera vacía" que _staleDedup parchaba. `is_restocked`
        // se sigue persistiendo (lo lee el banner RestockNudge) pero ya NO suprime contenido.

        // [P5-SPEED-DELTA-CONSTS-HOIST · 2026-06-01] MASS_TO_G / VOL_TO_ML izados a
        // module-scope (arriba). Las referencias aquí abajo resuelven a la constante
        // module-level (mismas tablas).
        const toBaseUnit = (qty, unit) => {
            let u = unit.toLowerCase().trim().replace(/\.$/, ''); // remove trailing dot from 'ud.'
            if (MASS_TO_G[u]) return { value: qty * MASS_TO_G[u], type: 'mass', ratio: MASS_TO_G[u] };
            if (VOL_TO_ML[u]) return { value: qty * VOL_TO_ML[u], type: 'volume', ratio: VOL_TO_ML[u] };
            
            // Map count units to a single type
            if (['ud', 'unidad', 'unidades', 'pz', 'pza', 'pieza', 'piezas', 'cabeza', 'cabezas'].includes(u)) {
                return { value: qty, type: 'unit', ratio: 1 };
            }
            // Map package units to a single type
            // [P3-RESTOCK-LECHE-UNIT · 2026-06-23] 'cartón'/'carton'/'cartones' DEBEN
            // caer en 'pkg' igual que el backend: CANONICAL_UNIT_MAP (canonical_units.py)
            // mapea cartón→paquete. Sin esto, la leche descremada (lista market_unit='cartón'
            // vs Nevera unit='paquete', porque el restock canonicaliza cartón→paquete al
            // persistir) nunca reconciliaba el delta (tipos 'cartón' ≠ 'pkg') → se mostraba
            // como faltante y se RE-AGREGABA a la Nevera en cada recálculo de duración (7/15/30).
            // Tooltip-anchor: P3-RESTOCK-LECHE-UNIT.
            if (['pq', 'paq', 'paquete', 'paquetes', 'funda', 'fundita', 'fundas', 'sobre', 'sobres', 'cartón', 'carton', 'cartones'].includes(u)) {
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

            // Stop words: réplica exacta del backend (shopping_calculator.py línea 103).
            // [P5-SPEED-DELTA-CONSTS-HOIST · 2026-06-01] STOP_WORD_REGEXES precompiladas
            // a module-scope (antes: `new RegExp` por palabra por ítem). Flag `g` →
            // replace resetea lastIndex tras cada llamada → seguro reusar la instancia.
            for (const re of STOP_WORD_REGEXES) {
                n = n.replace(re, '');
            }
            n = n.replace(/,/g, '').replace(/\s+/g, ' ').trim();

            return n.split(/\s+/).map(w => {
                 // [P5-SPEED-DELTA-CONSTS-HOIST · 2026-06-01] NAME_IRREGULARS izado a
                 // module-scope (antes se reconstruía por cada palabra de cada ítem).
                 if (NAME_IRREGULARS[w]) return NAME_IRREGULARS[w];

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

        // [P5-SPEED-DELTA-CONSTS-HOIST · 2026-06-01] PANTRY_STAPLES_DELTA y DRY_GOODS
        // izados a module-scope (arriba); las referencias resuelven a las constantes
        // module-level.
        const inferShelfLifeDays = (name, category) => {
            const n = (name || '').toLowerCase();
            const c = (category || '').toLowerCase();
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

        // [P5-PRESENCE-FORWARD-LOOKING · 2026-06-23] (decisión confirmada por el owner) Un ítem
        // agotado reaparece SOLO si el PLAN RESTANTE aún lo usa — no por "está ausente" a secas.
        // `remainingNeedsSet` = nombres normalizados de los ingredientes de las comidas de HOY en
        // adelante (días `todayPlanDayIndex..fin` del menú; computeRollingWindow es puro y sus
        // entradas ya están arriba). Reglas:
        //   - Ciclo TERMINADO (daysLeft<=0) → set vacío → nada reaparece (regeneras, no recompras).
        //   - Ciclo activo + set construido → un ausente solo se muestra si está en el set.
        //   - FAIL-OPEN: si el set queda vacío por datos raros (plan parcial/sin ingredientes), lo
        //     dejamos en null = NO filtrar → preferimos MOSTRAR de más antes que ESCONDER algo que
        //     el usuario sí necesita (un falso negativo = se queda sin comprarlo, peor que un extra).
        let remainingNeedsSet = null;
        try {
            const _days = Array.isArray(planData?.days) ? planData.days : null;
            if (_days && _days.length > 0) {
                if (daysLeft <= 0) {
                    remainingNeedsSet = new Set(); // ciclo terminado → nada se necesita
                } else {
                    const { todayPlanDayIndex: _todayIdx } = computeRollingWindow(_days.length, daysSinceCreation);
                    const _set = new Set();
                    for (let _di = Math.max(0, _todayIdx); _di < _days.length; _di++) {
                        const _meals = _days[_di]?.meals || [];
                        for (const _meal of _meals) {
                            for (const _ing of (_meal?.ingredients || [])) {
                                const _nm = typeof _ing === 'string' ? _ing : (_ing?.name || _ing?.display_name || _ing?.item || '');
                                if (_nm) { _set.add(normalizeName(_nm)); _set.add(normalizeNameAlt(_nm)); }
                            }
                        }
                    }
                    // fail-open: set vacío con ciclo activo = datos raros → no filtrar.
                    remainingNeedsSet = _set.size > 0 ? _set : null;
                }
            }
        } catch (_rnErr) { remainingNeedsSet = null; /* ante cualquier error: no filtrar (seguro) */ }

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

            // [P5-PRESENCE-SHOPPING-LIST · 2026-06-23] MODELO DE PRESENCIA (spec del owner):
            // un ítem aparece en la lista SOLO si está AUSENTE de la Nevera (qty<=0 o no existe).
            // Presente en CUALQUIER cantidad → oculto. La lista es un espejo vivo de la Nevera:
            // todo presente → vacía; se agota la leche → leche reaparece; y así con cada ítem.
            // Reemplaza el delta cuantitativo (parcial / unit-mismatch) + la supresión por ventana
            // is_restocked, que causaban (a) falsos re-add por canonicalización de unidad
            // (P3-RESTOCK-LECHE-UNIT cartón vs paquete) y top-up parcial, y (b) que un ítem
            // genuinamente agotado NO reapareciera (lo escondía isPostRestockRotation).
            const _invQty = invItem ? (parseFloat(invItem.quantity) || 0) : 0;
            if (_invQty > 0) {
                itemsRemoved++;
                return; // presente en la Nevera → ocultar
            }
            // [P5-PRESENCE-FORWARD-LOOKING] Ausente. ¿El plan que te queda aún lo usa? Si el menú
            // restante (hoy en adelante) NO incluye este ingrediente → ya no lo necesitas → ocultar.
            // (null = no filtrar; ver remainingNeedsSet arriba.)
            if (remainingNeedsSet && !(remainingNeedsSet.has(nameKey1) || remainingNeedsSet.has(nameKey2))) {
                itemsRemoved++;
                return;
            }
            // Ausente y aún necesario por el plan restante → mostrar el ítem completo.
            deltaList.push(_scaleItemRefCost({
                ...item,
                market_qty: shopQty,
                display_qty: item.display_qty != null ? `${degradedQtyStr} ${shopUnit}` : undefined,
                display_string: item.display_string != null ? `${degradedQtyStr} ${shopUnit} de ${item.name}` : undefined
            }, shopQty, rawShopQty, shopUnit));
            return;
        });

        // Metadata para UI
        deltaList._itemsRemoved = itemsRemoved;
        deltaList._isAdjusted = itemsRemoved > 0 || deltaList.some(i => i?._adjustedFromInventory);

        return deltaList;
        // [P3-BUILD-DELTA-DEP-ARRAY · 2026-05-30] maxDays/daysLeft añadidos al
        // dep array: el callback los cierra (degradationRatio, ~líneas 1069-1070)
        // pero al cruzar la medianoche `daysLeft` baja 1 sin que planData cambie
        // → el closure retenía el daysLeft pre-medianoche → un PDF/restock
        // generado tras medianoche escalaba el delta con el ciclo viejo
        // (off-by-one-día, ~14% sobre-escala). Son primitivos numéricos
        // (comparados por valor → sin re-creación espuria). groceryDuration/
        // todayDate quedan subsumidos (maxDays/daysLeft derivan de ellos).
    }, [liveInventory, planData, maxDays, daysLeft, daysSinceCreation]);

    // Calcular si la delta list de esta sesión actual todavia requiere compras
    // GUARD: No calcular hasta que liveInventory se haya cargado (evita flash del botón).
    const computedHasPendingShoppingItems = useMemo(() => {
        if (liveInventory !== null && planData && (planData.aggregated_shopping_list || allPlanIngredients)) {
            const duration = formData?.groceryDuration || 'weekly';
            const rawList = getDeltaSourceList(planData, duration) || allPlanIngredients || [];

            const currentDelta = buildDeltaShoppingList(rawList);
            return currentDelta.length > 0;
        }
        return null;  // null = "no sabemos aún" (vs false = "sabemos que NO hay items")
    }, [liveInventory, planData, formData?.groceryDuration, allPlanIngredients, buildDeltaShoppingList]);

    // [P2-BRANDS-CANONICAL-SOURCE · 2026-07-06] Fuente del panel "Marcas y precios
    // del súper": la lista CANÓNICA semanal (necesidades completas del plan),
    // JAMÁS la activa/híbrida — las listas biweekly/monthly filtran lo YA
    // comprado en el ciclo (restocked_items), así que tras un restock total
    // quedan en 0 y el panel DESAPARECÍA ("¿por qué el menú del supermercado
    // desaparece?" — owner, plan ff673061). Gestionar marcas debe poder hacerse
    // siempre, comprado o no. Fallback a la lista activa para planes viejos.
    const brandsPanelList = useMemo(() => {
        const weekly = planData?.aggregated_shopping_list_weekly;
        if (Array.isArray(weekly) && weekly.length > 0) return weekly;
        return Array.isArray(planData?.aggregated_shopping_list) ? planData.aggregated_shopping_list : [];
    }, [planData]);

    // [P2-NEVERA-DELTA-NOTICE · 2026-06-24] Metadata del delta para el aviso IN-APP de la Nevera
    // Inteligente. computedHasPendingShoppingItems descarta `_itemsRemoved`; este useMemo lo conserva
    // del MISMO buildDeltaShoppingList. Antes el aviso "N ítems ya en tu Nevera / lista vacía" vivía
    // SOLO en el HTML del PDF → tras renovar, el usuario veía la lista corta (o el botón desaparecía)
    // sin saber que fue la Nevera Inteligente ("no aparecen los alimentos nuevos"). tooltip-anchor: P2-NEVERA-DELTA-NOTICE
    const shoppingDeltaMeta = useMemo(() => {
        if (liveInventory !== null && planData && (planData.aggregated_shopping_list || allPlanIngredients)) {
            const duration = formData?.groceryDuration || 'weekly';
            const rawList = getDeltaSourceList(planData, duration) || allPlanIngredients || [];
            const currentDelta = buildDeltaShoppingList(rawList);
            const itemsRemoved = currentDelta._itemsRemoved || 0;
            const hasItems = currentDelta.length > 0;
            return {
                itemsRemoved,
                isAdjusted: !!currentDelta._isAdjusted || itemsRemoved > 0,
                hasItems,
                isEmptyDueToPantry: !hasItems && itemsRemoved > 0,
            };
        }
        return null;
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

            // [P1-FRONTEND-LEGACY-LOCALSTORAGE-CRITICAL · 2026-05-23]
            // safeLocalStorageGet en lugar de raw getItem: iOS Private Mode
            // lanzaba SecurityError aquí y el callback del useEffect moría
            // silenciosamente. Onboarding push nunca se disparaba para
            // usuarios nuevos en Private Mode.
            const hasSeenOnboarding = safeLocalStorageGet('mealfit_push_onboarding_seen');

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
            // [P1-PROD-FINAL-3 · 2026-05-24] safeLocalStorageSet — raw setItem
            // dentro del finally lanzaba uncaught en iOS Private Mode tras
            // habilitar push, dejando el modal re-disparable en mount.
            safeLocalStorageSet('mealfit_push_onboarding_seen', 'true');
        }
    };

    // [P3-DASH-MODALS-A11Y · 2026-05-30] `handleDismissPushOnboarding` reemplazado
    // por `dismissPushOnboarding` (useCallback memoizado, declarado arriba junto al
    // hook useModalAccessibility del modal). SSOT único del dismiss.

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
                    // [P1-NEON-DB-MIGRATION · 2026-06-12] SELECT directo a meal_plans
                    // (.eq(id).eq(user_id).maybeSingle()) → GET /api/plans-data/{plan_id}
                    // (ownership server-side, I2). 404 = plan ausente → latestRow null,
                    // mismo tratamiento best-effort que el maybeSingle() sin fila.
                    let latestRow = null;
                    const _planResp = await fetchWithAuth(`/api/plans-data/${planData.id}`);
                    if (_planResp.ok) {
                        const _planPayload = await _planResp.json();
                        latestRow = _planPayload?.plan || null;
                    }
                    if (latestRow?.plan_data) {
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
            const aggregatedList = getDeltaSourceList(effectivePlanData, duration);
            // [P2-PDF-NO-AGG-GUARD · 2026-06-17] Si NO existe lista AGREGADA real (ni
            // la del ciclo ni la base), el plan está incompleto/fallido. El fallback
            // `allPlanIngredients` lista ingredientes CRUDOS por-comida (agua, sal "al
            // gusto", fracciones tipo "0.5 huevos", duplicados, todo en "Otros") →
            // inservible como lista de compras. En vez de renderizar esa basura,
            // avisamos y abortamos (mismo copy que el caso lista-vacía). Sin este guard
            // un plan fallido (generación incompleta) producía un PDF con decenas de
            // ingredientes de receta sin consolidar.
            if (!aggregatedList) {
                toast.dismiss(loadingToast);
                toast.error(
                    'Tu plan no tiene lista de compras todavía. Esto suele pasar cuando la generación quedó incompleta. Genera un plan nuevo desde el formulario.',
                    {
                        duration: 8000,
                        position: 'top-center',
                        icon: '⚠️',
                        style: { fontSize: '0.95rem', maxWidth: '480px', padding: '14px 18px', borderRadius: '12px', fontWeight: 500, lineHeight: 1.45 },
                    }
                );
                return;
            }
            const rawSourceIngredients = aggregatedList;

            // [P1-PDF-1] Fetch de inventario fresco con timeout + degradación
            // visible. Antes el bloque era un `try/catch` silencioso: si el backend anterior
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
            // [P1-NEON-DB-MIGRATION · 2026-06-12] SELECT directo → GET /api/inventory.
            const _freshFetchResult = await fetchFreshInventoryWithTimeout(
                fetchInventoryFromApi,
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
                    // [P3-PDF-EMPTY-LIST-VISIBLE · 2026-05-27] Toast más visible
                    // cuando el plan no tiene aggregated_shopping_list. Pre-fix
                    // el toast.error genérico (2s, top-right) era invisible para
                    // usuarios con DevTools abierto y no daba pista accionable.
                    // Post-fix: 8s top-center con copy explícito apuntando al
                    // origen real (plan incompleto/corrupto) y la acción concreta.
                    toast.dismiss(loadingToast);
                    toast.error(
                        'Tu plan no tiene lista de compras todavía. Esto suele pasar cuando la generación quedó incompleta. Genera un plan nuevo desde el formulario.',
                        {
                            duration: 8000,
                            position: 'top-center',
                            icon: '⚠️',
                            style: {
                                fontSize: '0.95rem',
                                maxWidth: '480px',
                                padding: '14px 18px',
                                borderRadius: '12px',
                                fontWeight: 500,
                                lineHeight: 1.45,
                            },
                        }
                    );
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

            // [P3-SHOPPING-COST-TOTAL · 2026-06-20] Total estimado del mercado: suma de estimated_cost_rd
            // por ítem (precios reales de Supermercados Nacional vía el motor de costeo del backend, en
            // item_ref). Honesto: cuenta cuántos ítems tienen precio (los sin precio en master no suman).
            let _shopTotalCost = 0, _shopPricedCount = 0, _shopTotalItems = 0;
            Object.values(consData).forEach((_it) => {
                _shopTotalItems++;
                const _c = _it.item_ref && (_it.item_ref.estimated_cost_rd ?? _it.item_ref.estimated_cost);
                if (typeof _c === 'number' && _c > 0) { _shopTotalCost += _c; _shopPricedCount++; }
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

            // [P3-CYCLE-COST-TOTAL · 2026-06-23] Costo REAL del ciclo completo.
            // `_shopTotalCost` (suma cruda arriba) es lo que compras EN ESTA IDA al
            // súper: perecederos de 1 semana + despensa del periodo. Para 15/30 días
            // los perecederos se RECOMPRAN cada 7 días (ver `_build_hybrid_shopping_list`
            // en backend/shopping_calculator.py), así que el costo real del ciclo es
            //   estables (1×, compra única) + perecederos × nº de semanas del ciclo.
            // [P1-CYCLE-COVERAGE-FRACTIONAL · 2026-07-06] Espejo del backend (shopping_calculator.py
            // _cycle_cost_multiplier/_cycle_trip_count). Pre-fix usaba floor(días/7) (monthly=4) →
            // los días 29-30 del ciclo quedaban sin costear NI mostrar. Ahora:
            //   - COSTO = perecederos × (días/7) FRACCIONAL (30/7=4.286): honesto, sin sobre-estimar.
            //   - IDAS mostradas = ceil(días/7) (30d=5, la 5ª parcial): cuántas veces recompra.
            // Pre-fix: el total de 7 y 15 días salía idéntico → el usuario sub-presupuestaba.
            const _sumBucketCost = (dict) => Object.values(dict).reduce((acc, arr) => (
                acc + (Array.isArray(arr) ? arr.reduce((s, it) => {
                    const c = it.item_ref && (it.item_ref.estimated_cost_rd ?? it.item_ref.estimated_cost);
                    return s + (typeof c === 'number' && c > 0 ? c : 0);
                }, 0) : 0)
            ), 0);
            const _perishableCost = _sumBucketCost(perishables);
            const _stableCost = _sumBucketCost(stables);
            const _cycleDays = duration === 'monthly' ? 30 : duration === 'biweekly' ? 15 : 7;
            const _cycleCostMultiplier = _cycleDays / 7;          // fraccional (4.286 mensual)
            const _cycleTrips = Math.ceil(_cycleDays / 7);        // idas al súper (5 mensual)
            const _fullCycleCost = _stableCost + _perishableCost * _cycleCostMultiplier;
            // [P1-BUDGET-COST-SSOT · 2026-07-02] Preferir el resumen del BACKEND (SSOT, mismo número
            // que la reconciliación de presupuesto) cuando el plan lo trae; la re-suma local queda
            // como fallback para planes legacy persistidos antes del fix.
            const _backendCostSummary = planData?.shopping_cost_summary?.by_duration?.[duration] || null;
            const _shopTotalCostFinal = (_backendCostSummary && typeof _backendCostSummary.trip_total_rd === 'number' && _backendCostSummary.trip_total_rd > 0)
                ? _backendCostSummary.trip_total_rd : _shopTotalCost;
            const _fullCycleCostFinal = (_backendCostSummary && typeof _backendCostSummary.cycle_total_rd === 'number' && _backendCostSummary.cycle_total_rd > 0)
                ? _backendCostSummary.cycle_total_rd : _fullCycleCost;
            // Solo mostramos el segundo número cuando aporta info (ciclo > 1 semana y
            // de hecho cuesta más que la compra de esta semana).
            const _showCycleCost = duration !== 'weekly' && _fullCycleCostFinal > _shopTotalCostFinal + 1;

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
                        <strong>Smart Engine:</strong> cantidades exactas según empaques del mercado local — ajústalas a tu inventario. <strong>Ud.</strong> = unidad · <strong>~</strong> = conversión aproximada (<em>2 Cabezas ≈ 2.2 lbs</em>).
                        ${isUltraDense ? '' : `
                        <span style="display: block; margin-top: 2px; color: #475569;">
                            Algunas varían por <strong>realismo de almacenamiento</strong> (hierbas, lácteos, cítricos). <strong>Estables (aceite, vinagre, miel, especias):</strong> misma cantidad en ciclos de 7/15/30 días.
                        </span>
                        `}
                    </p>
                </div>

                ${freshInventoryStale ? `
                <!-- [P1-PDF-1 · banner copy corregido P3-PDF-STALE-BANNER-COPY · 2026-05-30]
                     Stale Inventory Banner: el fetch fresco de la Nevera falló o
                     timeoutó. Desde [P3-RESTOCK-STALE-FALLBACK-EMPTY] el fallback NO
                     usa liveInventory cacheado sino [] → buildDeltaShoppingList
                     retorna la lista COMPLETA sin deducir (dirección segura: el peor
                     caso es re-comprar lo que ya tienes, no quedarte corto). El copy
                     viejo decía "usa datos en caché... para evitar duplicados", que
                     era factualmente incorrecto en el 100% de los casos donde se
                     muestra el banner. Color amber/warning (no rojo). -->
                <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 3px solid #f59e0b; padding: ${disclaimerPadding}; border-radius: 6px; margin-bottom: ${disclaimerMargin}; display: flex; align-items: flex-start; gap: 8px;">
                    <svg style="flex-shrink: 0; width: 14px; height: 14px; color: #f59e0b; margin-top: 1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p style="margin: 0; font-size: ${isUltraDense ? '9.5px' : '11px'}; color: #78350f; line-height: 1.3;">
                        <strong>Aviso:</strong> No pudimos validar tu Nevera en vivo, así que esta lista incluye <strong>todos</strong> los ingredientes del plan. Revisa qué ya tienes en casa antes de comprar.
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

                // [P2-PDF-HYPERDENSE-INNERCOLS · 2026-06-17] En hyper-dense (60+ items)
                // las columnas van DENTRO de la <ul> (los items fluyen en N columnas
                // dentro de cada tarjeta full-width), NO como columnas de tarjetas.
                // Verificado headless (html2pdf real): una categoría con 64 items en
                // columnas EXTERNAS deja la tarjeta atómica (display:table +
                // break-inside:avoid-column) → no se parte entre columnas → 1 columna
                // altísima → 2-3 páginas (hueco en pág. 1 + desborde). Con columnas
                // internas → 1 página. Para <60 items se mantiene el layout previo
                // (columnas de tarjetas), que ya rinde 1 página y es más compacto.
                const cardStyle = isHyperDense
                    ? 'display: block; width: 100%; page-break-inside: avoid;'
                    : 'display: table; width: 100%; break-inside: avoid-column; page-break-inside: avoid;';
                const ulStyle = isHyperDense
                    ? `list-style: none; padding: 0; margin: 0; column-count: ${columnCount}; column-gap: ${columnGap};`
                    : 'list-style: none; padding: 0; margin: 0;';

                sortedKeys.forEach(cat => {
                    const icon = `<span style="background-color: #10b981; color: white; border-radius: 4px; padding: 3px; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px;"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg></span>`;
                    // [P1-PDF-3] Padding del header de cada tarjeta de categoría.
                    const catHeaderPadding = isHyperDense ? '3px 6px' : isUltraDense ? '4px 8px' : (isDense ? '6px 10px' : '8px 12px');
                    const catTitleFont = isHyperDense ? '8px' : isUltraDense ? '9.5px' : '11px';
                    innerHtml += `
                    <div style="background-color: #ffffff; border: 1px solid #f3f4f6; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); margin-bottom: ${catMargin}; ${cardStyle}">
                        <div style="background-color: #f8fafc; padding: ${catHeaderPadding}; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 6px;">
                            ${icon}
                            <h3 style="margin: 0; font-size: ${catTitleFont}; font-weight: 800; color: #1f2937; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(cat)}</h3>
                        </div>
                        <ul style="${ulStyle}">
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
                        // del LLM, del user_inventory de el backend anterior o del formulario.
                        // Escapamos los 5 metacaracteres HTML antes de interpolar
                        // para evitar markup roto en el PDF (categorías duplicadas,
                        // listado truncado, descarga malformada).
                        const qtyStr = displayQty && String(displayQty).trim() !== 'None' ? `<span style="font-weight: 700; color: ${tagColor}; font-size: ${qtyFont}; background-color: ${tagBg}; border: 1px solid ${tagBorder}; padding: ${qtyPad}; border-radius: 4px; margin-left: 4px; white-space: nowrap; align-self: flex-start;">${escapeHtml(displayQty)}</span>` : '';

                        // [P3-SHOPPING-COST-TOTAL · 2026-06-20] Precio estimado por ítem (RD$, del motor de costeo).
                        const _costVal = item.item_ref && (item.item_ref.estimated_cost_rd ?? item.item_ref.estimated_cost);
                        const costStr = (typeof _costVal === 'number' && _costVal > 0)
                            ? `<span style="font-weight: 600; color: #9ca3af; font-size: ${qtyFont}; margin-top: 2px; white-space: nowrap;">RD$${Math.round(_costVal).toLocaleString('es-DO')}</span>`
                            : '';

                        // [P1-PDF-3] En hyper-dense, ocultamos `_inventoryNote`
                        // (libera ~10-12px verticales por item). El info no se
                        // pierde — sigue visible en la UI del Dashboard y en el
                        // banner global del PDF.
                        const noteHTML = (showInventoryNotes && item._inventoryNote)
                            ? `<div style="font-size: ${isUltraDense ? '7.5px' : (isDense ? '8.5px' : '9.5px')}; color: #059669; margin-top: 1px; font-weight: 500; line-height: 1.1;">💡 ${escapeHtml(item._inventoryNote)}</div>`
                            : '';

                        innerHtml += `
                            <li style="display: flex; align-items: flex-start; padding: ${ulPadding}; ${borderBottom} break-inside: avoid-column; page-break-inside: avoid;">
                                <div style="width: ${checkboxSize}; height: ${checkboxSize}; border: 1.5px solid #d1d5db; border-radius: ${isDense ? '3px' : '4px'}; margin-right: ${checkboxMarginRight}; flex-shrink: 0; background-color: #ffffff; margin-top: 2px;"></div>
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                                    <div style="display: flex; flex-direction: column;">
                                        <span style="font-size: ${itemFont}; font-weight: 600; color: #374151; line-height: 1.2;">${escapeHtml(display)}${lowConfWarn}</span>
                                        ${noteHTML}
                                    </div>
                                    <div style="display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0;">${qtyStr}${costStr}</div>
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
            // [P2-PDF-HYPERDENSE-INNERCOLS · 2026-06-17] En hyper-dense las columnas
            // viven DENTRO de cada tarjeta (ver generateBlocks) → el contenedor de
            // sección NO lleva column-count (las tarjetas apilan full-width). Para
            // <60 items se conservan las columnas de tarjetas (más compacto, ya rinde).
            const sectionWrapStyle = isHyperDense ? '' : `column-count: ${columnCount}; column-gap: ${columnGap};`;
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
                : `Esta comida fresca alcanza ~7 días: en tu ciclo de ${durationText} la compras ${_cycleTrips} veces (cada 7 días). Se dañan rápido, por eso no se compran todas de una vez.`;
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
                <div style="${sectionWrapStyle}">
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
                <div style="${sectionWrapStyle}">
                `;
                htmlContent += generateBlocks(stables, false);
                htmlContent += `</div> <!-- End Columns -->`;
            }


            // [P2-PRO-REVIEW-SURFACE · 2026-06-15] El plan IMPRESO que el usuario sigue debe llevar la
            // advertencia de revisión profesional (crítico para renal). escapeHtml en TODA interpolación
            // (XSS, la nota puede incluir nombres de condición/ingrediente influenciados por el form).
            const _rpr = planData?.requires_professional_review;
            const clinicalNoteHTML = (_rpr && _rpr.flag && _rpr.note)
                ? `<div style="margin-top: 15px; padding: 10px 12px; border: 1.5px solid ${_rpr.renal_gate ? '#fca5a5' : '#93c5fd'}; background: ${_rpr.renal_gate ? '#fef2f2' : '#eff6ff'}; border-radius: 8px; color: ${_rpr.renal_gate ? '#991b1b' : '#1e40af'}; font-size: 10px; line-height: 1.45;"><strong>${_rpr.renal_gate ? '🫘 Condición renal — requiere supervisión de tu nefrólogo' : '⚕️ Consulta a tu profesional de salud'}</strong><br/>${escapeHtml(String(_rpr.note))}</div>`
                : '';

            htmlContent += `
                ${_shopPricedCount > 0 ? `<div style="margin-top: 14px; padding: 11px 15px; background: linear-gradient(135deg,#ecfdf5,#f0fdf4); border: 1.5px solid #10b98133; border-radius: 9px; break-inside: avoid; page-break-inside: avoid;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                        <div style="font-size: 12px; font-weight: 800; color: #065f46;">💵 ${_showCycleCost ? 'Esta compra <span style="font-weight: 600; color: #059669;">(frescos de 1 semana + despensa)</span>' : 'Total estimado del mercado'}</div>
                        <span style="font-size: 19px; font-weight: 800; color: #047857; white-space: nowrap;">RD$${Math.round(_shopTotalCostFinal).toLocaleString('es-DO')}</span>
                    </div>
                    ${_showCycleCost ? `<div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 7px; padding-top: 7px; border-top: 1px dashed #10b98155;">
                        <div style="font-size: 11.5px; font-weight: 800; color: #065f46;">🛒 Costo real del ciclo de ${escapeHtml(durationText)}<div style="font-size: 9px; font-weight: 500; color: #059669; margin-top: 1px; letter-spacing: normal;">Despensa 1× + perecederos de ${escapeHtml(durationText)} (recompra cada 7 días)</div></div>
                        <span style="font-size: 18px; font-weight: 800; color: #065f46; white-space: nowrap;">RD$${Math.round(_fullCycleCostFinal).toLocaleString('es-DO')}</span>
                    </div>` : ''}
                    ${(() => {
                        // [P1-BUDGET-RECONCILE · 2026-07-02] Estado honesto del presupuesto en el PDF:
                        // compara el costo real del ciclo contra el presupuesto del formulario
                        // (custom → monto; tiers → banda del piso de metas). Solo números + enum
                        // internos (sin texto user-controlled) → sin riesgo XSS.
                        const _br = planData?.budget_reconciliation;
                        if (!_br || !_br.status || _br.status === 'sin_limite' || !_br.reference_rd) return '';
                        const _est = Math.round(_br.estimated_cycle_rd || 0).toLocaleString('es-DO');
                        // [P2-AUDIT-V6-BATCH · 2026-07-03] (P2-I) tiers categóricos → RD$Y es piso×banda
                        // (número no declarado por el usuario) → etiquetado "referencia estimada" (paridad app).
                        const _ref = Math.round(_br.reference_rd).toLocaleString('es-DO')
                            + (_br.basis && _br.basis !== 'custom' ? ' (referencia estimada)' : '');
                        // [P2-AUDIT-V5-BATCH GAP-06] Caveat de cobertura parcial (solo números backend → sin XSS).
                        const _pp = _br.partial_pricing
                            ? `<span style="font-weight:600; color:#92400e;"> · estimado parcial (${Math.round((_br.price_coverage || 0) * 100)}% con precio)</span>`
                            : '';
                        if (_br.status === 'dentro') {
                            return `<div style="margin-top: 7px; padding-top: 7px; border-top: 1px dashed #10b98155; font-size: 11px; font-weight: 700; color: #047857;">✓ Dentro de tu presupuesto — RD$${_est} de RD$${_ref}${_pp}</div>`;
                        }
                        if (_br.status === 'cerca') {
                            return `<div style="margin-top: 7px; padding-top: 7px; border-top: 1px dashed #f59e0b55; font-size: 11px; font-weight: 700; color: #92400e;">≈ Al límite de tu presupuesto — RD$${_est} de RD$${_ref}${_pp}</div>`;
                        }
                        const _delta = Math.round(Math.max(0, _br.delta_rd || 0)).toLocaleString('es-DO');
                        return `<div style="margin-top: 7px; padding-top: 7px; border-top: 1px dashed #f8717155; font-size: 11px; font-weight: 700; color: #b91c1c;">▲ Supera tu presupuesto por RD$${_delta} — RD$${_est} de RD$${_ref}${_br.adjusted ? '<span style="font-weight:600; color:#92400e;"> · ya ajustamos ingredientes premium a equivalentes económicos</span>' : ''}${_pp}</div>`;
                    })()}
                </div>` : ''}
                ${clinicalNoteHTML}
                <!-- Footer -->
                <!-- [PDF-FOOTER-CONTRAST · 2026-06-22] El footer se veía casi invisible
                     (grises muy claros #6b7280/#9ca3af sobre papel blanco). Se oscurecen
                     a gray-700/gray-600 + subtítulo 9px→11px para que se lea bien. -->
                <div style="margin-top: 15px; text-align: center; color: #4b5563; font-size: 10px; border-top: 2px dashed #cbd5e1; padding-top: 10px;">
                    <p style="margin: 0; font-weight: 800; color: #374151; letter-spacing: 1px;">PROCESADO POR MEALFITRD IA - NUTRICIÓN INTELIGENTE</p>
                    <!-- [P2-PDF-PRICE-SOURCE-COPY · 2026-06-22] (audit fresco P2-22) Copy suavizado: el precio
                         por-ítem puede ser verificado O estimado (price_confidence/price_source por fila) → afirmar
                         "verificados en La Sirena" universal era inexacto. -->
                    <p style="margin: 6px 0 0; font-size: 11px; color: #4b5563;">Precios estimados a partir de supermercados dominicanos (Nacional/La Sirena); pueden variar según tienda y fecha.</p>
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
            // - Normal/dense/ultra (<60 items): `avoid-all` evita cortes dentro
            //   de tarjetas Y del bloque entero — comprime y cabe en 1 página.
            // - hyper-dense / multi-página (≥60 items): estrategia CSS+legacy que
            //   respeta `page-break-inside: avoid` por elemento individual.
            //
            // [P2-PDF-HYPERDENSE-PAGEBREAK · 2026-06-17] hyper-dense (60-79 items)
            // SE MUEVE de avoid-all a css+legacy. Con avoid-all, html2pdf marcaba
            // el contenedor multi-columna ENTERO como `page-break-inside: avoid`;
            // al no caber en lo que resta de la página 1 tras el header, lo empujaba
            // COMPLETO a la página 2 (hueco gigante en pág. 1) y, al ser más alto
            // que una página, desbordaba a la 3 → "muy raro, 3 páginas". css+legacy
            // deja que el contenido arranque en la página 1 y fluya/paginee por
            // tarjeta sin truncar (1 página cuando cabe; corte limpio si no).
            const paginateFormally = multiPage || isHyperDense;
            const pagebreakMode = paginateFormally ? ['css', 'legacy'] : ['avoid-all'];
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
                margin: paginateFormally ? [6, 4, 8, 4] : [4, 0, 0, 0],
                filename: `Lista_de_compras_${durationText.replace(/ /g, '_')}_${_today}_${_planIdPrefix}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, windowWidth: 800 },
                pagebreak: { mode: pagebreakMode },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            // [P3-PDF-ONE-PAGE · 2026-06-20] Cuando la lista CABE (caso no-formal, <60 ítems): medir la
            // ALTURA REAL del contenido y poner la página jsPDF a esa medida exacta → SIEMPRE 1 hoja.
            // Cierra el bug "2ª hoja vacía": `avoid-all` igual paginaba cuando el contenido pasaba la A4 por
            // unos mm (el footer/micros caía a una pág. 2 casi en blanco). Fit-to-content. Fail-safe → A4.
            // El caso multi-página REAL (30 días / hyper-dense ≥60 ítems) NO se toca: necesita varias hojas.
            if (!paginateFormally) {
                try {
                    // Fuentes listas → la altura medida coincide con la que renderiza html2canvas.
                    if (document.fonts && document.fonts.ready) { await document.fonts.ready; }
                    const _measureW = 800; // = html2canvas.windowWidth (el contenido se mide al mismo ancho)
                    const _prev = element.getAttribute('style') || '';
                    element.style.cssText = `position:absolute;left:-10000px;top:0;width:${_measureW}px;visibility:hidden;`;
                    document.body.appendChild(element);
                    const _contentH = element.scrollHeight; // px a 800px de ancho
                    document.body.removeChild(element);
                    element.setAttribute('style', _prev);
                    // Alto de UNA página A4 en px al ancho de medición (A4 = 210×297mm).
                    const _onePageHpx = (297 / 210) * _measureW;
                    // [P3-PDF-ONE-PAGE-2 · 2026-06-20] Cap subido 1.5→3.5: aquí solo se entra cuando
                    // !paginateFormally (plan <60 ítems, NO hyper-dense/multipage), así que la altura está
                    // acotada → fit-to-content a UNA sola hoja alta para TODO plan no-formal (el usuario
                    // quiere 1 hoja, sin 2ª página casi vacía). Fail-safe >3.5 páginas → A4. Los 60+ paginan formal.
                    if (_contentH > 0 && _contentH <= _onePageHpx * 3.5) {
                        const _pageW = 210; // ancho A4 en mm (márgenes L/R = 0 en el caso no-formal)
                        const _contentMm = _contentH * _pageW / _measureW;
                        // [P3-PDF-ONE-PAGE-3 · 2026-06-21] Colchón robusto: el +3mm fijo era MUY ajustado y
                        // reaparecía la 2ª hoja casi-blanca cuando html2canvas renderiza unos px más alto que el
                        // `scrollHeight` medido (discrepancia sub-pixel × scale 2 / windowWidth). Cushion =
                        // max(20mm, 3.5% del contenido) absorbe ambos modos (fijo + proporcional) sin whitespace
                        // notable en una página ya alta. Reapareció el off-by-one al crecer la lista (habichuelas
                        // en lata añadieron ítems). Sigue garantizando UNA sola hoja.
                        const _cushion = Math.max(20, _contentMm * 0.035);
                        const _pdfH = 4 /*margen top mm*/ + _contentMm + _cushion;
                        opt.jsPDF = { ...opt.jsPDF, format: [_pageW, _pdfH] };
                        opt.pagebreak = { mode: ['avoid-all'] };
                    }
                } catch { /* fallback: queda el A4 de arriba (peor caso = comportamiento actual) */ }
            }

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

    const handleRestock = async (opts = {}) => {
        // [P3-RESTOCK-NUDGE · 2026-06-23] `silent`=true para el auto-fill de fondo
        // (RestockNudge #3): mismo POST/delta/persistencia, pero SIN overlay
        // full-screen, SIN toasts de éxito y SIN navegar a la Nevera (sería intrusivo
        // al abrir la app). El nudge emite su propia notificación reversible. `opts`
        // puede ser un SyntheticEvent (el modal pasa onClick={handleRestock}) →
        // `?.silent` es undefined ⇒ false. Default (botón/modal) = no silencioso.
        const silent = opts?.silent === true;
        if (!userProfile?.id) {
            if (!silent) toast.error('Debes iniciar sesión para usar esta función.');
            return;
        }

        // [P0-2] Candado síncrono para evitar doble envío antes de que React actualice isRestocking
        if (restockLock.current) return;
        restockLock.current = true;

        // Validación Unica: Si matemáticamente y en tiempo real faltan ingredientes, lo permitimos.
        if (!hasPendingShoppingItems) {
            if (!silent) toast.info('Ya tienes todos estos ingredientes en tu Nevera.', { icon: '📦' });
            setShowRestockModal(false);
            restockLock.current = false;
            return;
        }

        if (!silent) setIsRestocking(true);
        // [P3-RESTOCK-SINGLE-LOADER · 2026-06-01] Sin toast.loading aquí: el
        // overlay full-screen `isRestocking` ("Registrando compras") ya cubre la
        // fase de carga. Antes coexistían el toast pequeño + el overlay → doble
        // indicador de carga simultáneo (reporte visual del usuario). Los toasts
        // success/error/info de abajo se mantienen (son confirmación, no carga).

        try {
            // [P1-1] Refresco de inventario fresco con timeout + degradación
            // visible. Antes el bloque era un `try/catch` silencioso (raw
            // `await (cliente anterior)`): si el backend anterior tardaba o fallaba,
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
            // [P1-NEON-DB-MIGRATION · 2026-06-12] SELECT directo → GET /api/inventory.
            const _restockFreshFetch = await fetchFreshInventoryWithTimeout(
                fetchInventoryFromApi,
                getInventoryFetchTimeoutMs(),
            );
            if (!_restockFreshFetch.stale) {
                freshInventoryForRestock = _restockFreshFetch.data;
                setLiveInventory(_restockFreshFetch.data);
                setInventoryStale(false);
            } else {
                freshInventoryForRestock = [];
                setInventoryStale(true);
                if (!silent) toast.warning('Tu Nevera puede estar desactualizada', {
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
            const rawActiveShoppingList = getDeltaSourceList(planData, duration) || allPlanIngredients || [];

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
                            unit: ing.market_unit || ing.unit || 'unidad',
                            // [P2-NEVERA-BRANDS · 2026-07-06] producto que la lista usó
                            // (default o preferencia) → el backend resuelve la marca y
                            // la Nevera la enseña junto al ítem comprado.
                            ...(typeof ing.brand_product_id === 'string' && ing.brand_product_id
                                ? { brand_product_id: ing.brand_product_id } : {}),
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

            if (response.ok && data.success) {
                if (!silent) toast.success('¡Ingredientes ingresados a tu Nevera Virtual!', { icon: '📦' });
                setSessionRestocked(true);

                // ✅ Marcar planData como restocked para que el PDF delta suprima residuos
                if (planData) {
                    const updatedPlan = { ...planData, is_restocked: true };
                    setPlanData(updatedPlan);
                    safeLocalStorageSet('mealfit_plan', JSON.stringify(updatedPlan));
                }

                // Guardar la configuración con la que se registraron las compras
                if (userProfile?.id) {
                    safeLocalStorageSet(`mealfit_restock_config_${userProfile.id}`, JSON.stringify({
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
                // [P1-NEON-DB-MIGRATION · 2026-06-12] SELECT directo → GET /api/inventory.
                fetchInventoryFromApi()
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
                // [P3-RESTOCK-NUDGE] En auto-fill silencioso NO navegamos (intrusivo).
                if (!silent) navigate('/dashboard/pantry');
            } else {
                // [P2-NEVERA-QUOTA-EXEMPT · 2026-06-24] Generalizar a `data.detail || data.message`: los
                // errores tipados del backend (HTTPException) traen `detail`, no `message`, así que el
                // genérico tragaba el motivo real. (El 402 del paywall ya no ocurre tras P1-NEVERA-QUOTA-EXEMPT.)
                const _msg = data.detail || data.message;
                if (!silent) toast.error(_msg || 'Error al actualizar la despensa.');
                else throw new Error(_msg || 'restock failed'); // deja que el nudge reintente
            }
        } catch (error) {
            console.error('🛒 [RESTOCK] CATCH ERROR:', error);
            if (!silent) toast.error('Hubo un error de conexión al registrar la compra.');
            else throw error; // propaga para que RestockNudge resetee y reintente
        } finally {
            if (!silent) setIsRestocking(false);
            restockLock.current = false;
        }
    };


    // Retrocompatibilidad y extracción de días
    const planDays = planData?.days || [{ day: 1, meals: planData?.meals || planData?.perfectDay || [] }];
    
    // Rolling Window: índice del día de hoy + inicio de la ventana visible.
    // [P3-DASH-WINDOW-TEST · 2026-05-29] computeRollingWindow (utils/planWindow.js)
    // encapsula el clamp a [0, length-1] y el cálculo de visibleStartIndex,
    // testeado con fechas fijas. daysSinceCreation ya está calculado arriba a
    // partir de grocery_start_date.
    const { todayPlanDayIndex, visibleStartIndex } = computeRollingWindow(
        planDays.length,
        daysSinceCreation,
        MAX_WINDOW
    );
    
    // Mostrar todos los d\u00edas pero marcar cu\u00e1les son pasados/hoy/futuros
    // Si hay d\u00edas de retraso (el cron no corri\u00f3) o si faltan d\u00edas (plan roto), llamar a /shift-plan on-demand
    useEffect(() => {
        // [P3-DASH-TRIGGERSHIFT-ABORT · 2026-06-01] Guard de cancelación: las deps
        // (daysSinceCreation al cruzar medianoche, planDays.length/total_days_requested
        // al completar un chunk) pueden cambiar con un POST in-flight → 2 requests
        // concurrentes; si el más viejo resuelve después, su setPlanData clobbea el plan
        // fresco. El flag descarta la resolución obsoleta (patrón P1-DASHBOARD-POLLING-ABORT).
        let cancelled = false;
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
                    if (!cancelled && resData.success && resData.plan_data && !resData.message.includes("completo")) {
                        // console.log('\ud83d\udd04 [ROLLING WINDOW] Shift/Fill completado on-demand:', resData.message);
                        setPlanData(resData.plan_data);
                    }
                }
            } catch (error) {
                console.error('\u26a0\ufe0f [ROLLING WINDOW] Error en shift on-demand:', error);
            }
        };
        
        triggerShift();
        return () => { cancelled = true; };
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
    // `visibleStartIndex` y `todayPlanDayIndex` ya vienen de computeRollingWindow
    // (arriba). `_MAX_WINDOW` se conserva como alias local porque otros sitios
    // (skeleton tabs, auto-select del tab activo) lo referencian.
    const _MAX_WINDOW = MAX_WINDOW;
    const visiblePlanDays = planDays.slice(visibleStartIndex, visibleStartIndex + _MAX_WINDOW);

    // Auto-seleccionar el tab del día actual.
    // [P3-DASH-WINDOW-FROM-TODAY · 2026-05-18] Renombrado `_WINDOW_SIZE` →
    // `_MAX_WINDOW` para reflejar que ahora es un cap, no una ventana fija.
    // [P3-DASH-WINDOW-TEST · 2026-05-29] La decisión out-of-window se delega a
    // shouldReselectActiveDay (utils/planWindow.js), testeada con casos fijos.
    //
    // [P3-DASH-WINDOW-AUTOSELECT · 2026-05-30] FIX: "seguir a hoy" cuando el día
    // de hoy avanza. Antes SOLO se re-seleccionaba si el día activo caía FUERA de
    // la ventana — pero cuando un día finaliza, `triggerShift` llama a /shift-plan
    // que re-hidrata `planData` RE-INDEXANDO (hoy pasa a índice 0). Tras ese
    // re-index el `activeDayIndex` viejo (p.ej. 2) seguía DENTRO de la nueva
    // ventana [0,4) pero apuntando a otro día → shouldReselectActiveDay devolvía
    // false → la selección NO seguía a hoy y el usuario veía un día equivocado /
    // sin comidas y tenía que clickear hoy manualmente cada vez que finalizaba
    // un día. Ahora, cuando `todayPlanDayIndex` CAMBIA (cruce de medianoche o
    // re-index del shift), saltamos a hoy. Dentro de un mismo día (todayPlanDayIndex
    // estable) se respeta la selección manual, salvo que caiga fuera de la ventana.
    useEffect(() => {
        if (!planData?.days || planData.days.length <= 1) return;
        const next = resolveActiveDayIndex({
            activeDayIndex,
            prevTodayPlanDayIndex: _prevTodayPlanDayIndexRef.current,
            todayPlanDayIndex,
            visibleStartIndex,
            maxWindow: _MAX_WINDOW,
        });
        _prevTodayPlanDayIndexRef.current = todayPlanDayIndex;
        if (next !== null) setActiveDayIndex(next);
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
                    /* [P3-HEADER-NO-DEFORM · 2026-07-04] era flex-end: cuando la columna
                       derecha crece (banner de presupuesto + lista por pasillo + marcas +
                       avisos), el saludo quedaba clavado ABAJO de un hero alto con un vacío
                       enorme encima — deformado. stretch + centrado vertical del texto
                       (regla de .header-text-group abajo) mantiene el hero equilibrado sin
                       importar cuántos paneles se apilen a la derecha. */
                    align-items: stretch;
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
                    color: var(--text-main);
                }
                .dashboard-subtitle {
                    color: var(--text-muted);
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
                    border: 1px solid var(--border);
                    /* [DASH-NOTEBOOK-SOFTEN · 2026-06-22] Lomo del cuaderno más
                       fino (20px→14px) para que no pese tanto en la vista. */
                    border-left: 14px solid #1E293B;
                    box-shadow: 4px 4px 0px rgba(0,0,0,0.02), 8px 8px 0px rgba(0,0,0,0.01), 0 25px 50px -12px rgba(0,0,0,0.15), inset 8px 0px 8px -4px rgba(0,0,0,0.2);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    position: relative;
                }
                .meals-container::before {
                    content: '';
                    position: absolute;
                    /* [DASH-NOTEBOOK-SOFTEN · 2026-06-22] La línea de margen roja ya
                       NO toca los bordes (top/bottom inset 1.25rem) → termina limpia y
                       desaparece la "raya" pegada a la esquina de abajo. Alpha más bajo
                       (0.4→0.22) para que sea un acento sutil, no un trazo fuerte. */
                    top: 1.25rem;
                    bottom: 1.25rem;
                    left: 2.5rem;
                    width: 3px;
                    border-left: 1px solid rgba(248, 113, 113, 0.22);
                    border-right: 1px solid rgba(248, 113, 113, 0.22);
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
                    /* [2026-07-06] flex-start → center (pedido del owner: post-restock la
                       columna de controles queda corta y pegada ARRIBA con un vacío enorme
                       debajo — asimétrico). La objeción original de P3-HEADER-NO-DEFORM
                       (créditos flotando a media altura) ya NO aplica: el medidor se mudó
                       al bloque de identidad (P3-CREDITS-IN-IDENTITY · 2026-07-04). Cuando
                       la columna es más alta que el saludo, ella dicta el alto del hero y
                       center ≡ flex-start — solo cambia el caso corto, que es el que se
                       veía mal. */
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
                    position: relative;
                    z-index: 50;
                }
                /* [P3-HEADER-NO-DEFORM · 2026-07-04] El saludo se centra verticalmente en el
                   alto real del hero (dictado por la columna derecha). Solo desktop — en ≤768px
                   el header pasa a columna y el media query de abajo ya centra el texto. */
                @media (min-width: 769px) {
                    .dashboard-header .header-text-group {
                        justify-content: center;
                    }
                }
                /* [P3-CREDITS-IN-IDENTITY · 2026-07-04] El medidor de créditos vive bajo el
                   saludo: alineado a la izquierda en desktop, centrado en móvil (donde el
                   header-text-group ya centra todo). */
                .credits-meter-slot {
                    align-self: flex-start;
                }
                @media (max-width: 768px) {
                    .credits-meter-slot {
                        align-self: center;
                        width: 100%;
                        display: flex;
                        justify-content: center;
                    }
                }
                /* [P3-HERO-TITLE-WRAP · 2026-07-04] En desktop el saludo largo
                   ("Buenas madrugadas, ...") NO empuja los controles a la fila de
                   abajo: la columna de texto cede (flex 1 + min-width 0) y el
                   título parte en dos líneas dentro de su columna; los controles
                   se quedan a la derecha. Solo ≥1025px — en móvil/tablet el
                   layout depende del wrap actual (controles debajo, full-width). */
                @media (min-width: 1025px) {
                    .dashboard-header .header-text-group {
                        flex: 1 1 0;
                        min-width: 0;
                    }
                    .dashboard-header .actions-group {
                        flex-shrink: 0;
                    }
                }
                /* [P3-NEVERA-NOTICE-NO-DEFORM · 2026-06-24] Cap del ancho de la
                   columna de controles. El aviso verde de la Nevera (texto largo)
                   estiraba el dropdown + botones a su ancho de una sola línea; con
                   el cap, el aviso hace wrap dentro y los controles no se deforman.
                   [P3-BRANDS-WIDTH-STABLE · 2026-07-02] width FIJO (no solo cap):
                   antes el ancho lo dictaba el contenido, y al abrir "Marcas del
                   súper" el label crecía ("· 39 de 41 ítems…") → la columna entera
                   saltaba de ancho. Ahora siempre mide 420px en desktop (el media
                   query ≤768px lo pone full-width). */
                .new-plan-wrapper {
                    width: 420px;
                    max-width: 100%;
                }
                /* [P3-NEVERA-NOTICE-CENTER-MOBILE · 2026-06-24] El chip del aviso de
                   la Nevera va a la izquierda en PC; en móvil, centrado. */
                .nevera-notice-chip {
                    align-self: flex-start;
                }
                @media (max-width: 768px) {
                    .nevera-notice-chip {
                        align-self: center;
                    }
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
                    border-color: var(--hover-border, var(--border)) !important;
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
                /* [RESTOCK-CTA-COLOR · 2026-06-01] "Ya compré la lista" en emerald
                   (acción positiva "ya lo compré", combina con el dot verde) en vez
                   del card-color plano que se perdía sobre el fondo oscuro. Tinte
                   suave on-brand en ambos temas — NO el verde saturado loud del
                   diseño viejo. Colores movidos de inline a CSS para poder
                   tematizar por data-theme. */
                .restock-cta-minimal {
                    position: relative;
                    background: rgba(16, 185, 129, 0.10);
                    color: #047857;
                    border: 1px solid rgba(16, 185, 129, 0.35);
                }
                /* [RESTOCK-CTA-HOVER-GLOW · 2026-06-01] Sin movimiento: se quitó el
                   translateY (que además se filtraba al modo oscuro, donde la regla
                   dark no lo reseteaba). El hover ahora es SOLO un brillo —glow
                   emerald del box-shadow + tinte intensificado—, análogo al hover del
                   botón "Actualizar platos". En claro NO usamos filter:brightness para
                   no lavar el tinte a blanco; el glow lo da el box-shadow. */
                .restock-cta-minimal:hover:not(:disabled) {
                    background: rgba(16, 185, 129, 0.18);
                    border-color: rgba(16, 185, 129, 0.6) !important;
                    /* [RESTOCK-HOVER-DIM · 2026-06-01] glow más tenue en hover. */
                    box-shadow: 0 3px 12px -2px rgba(16, 185, 129, 0.26) !important;
                }
                html[data-theme="dark"] .restock-cta-minimal {
                    background: rgba(52, 211, 153, 0.13);
                    color: #6EE7B7;
                    border-color: rgba(52, 211, 153, 0.34);
                }
                html[data-theme="dark"] .restock-cta-minimal:hover:not(:disabled) {
                    background: rgba(52, 211, 153, 0.24);
                    border-color: rgba(52, 211, 153, 0.6) !important;
                    box-shadow: 0 3px 13px -2px rgba(16, 185, 129, 0.28) !important;
                    /* [RESTOCK-HOVER-DIM · 2026-06-01] Brillo más sutil en hover (el
                       usuario lo quería menos): brightness 1.1 → 1.05 + glow más tenue.
                       Sigue avivando el emerald sin lavarlo. Sin transform = sin movimiento. */
                    filter: brightness(1.05);
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
                    color: var(--text-muted);
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

                /* [RESTOCK-MODAL-DARK · 2026-06-01] En oscuro el CTA slate-900
                   (#0F172A) quedaba casi invisible sobre la tarjeta oscura
                   (--bg-card ≈ #111827) → se veía como texto suelto sin botón. Lo
                   pasamos a indigo de marca con texto oscuro (mismo lenguaje que
                   los CTA dark del Header). "Cancelar" aclara en hover (en claro
                   oscurecía, lo cual en dark era ilegible). */
                html[data-theme="dark"] .restock-modal-confirm {
                    background: var(--primary);
                    color: #0B1120;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
                }
                html[data-theme="dark"] .restock-modal-confirm:hover:not(:disabled) {
                    background: var(--primary-light);
                    box-shadow: 0 8px 22px -4px rgba(0, 0, 0, 0.55);
                }
                html[data-theme="dark"] .restock-modal-cancel:hover {
                    color: var(--text-main);
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
                        border-top: 1px solid var(--border);
                        padding-top: 0.75rem;
                    }
                    .meal-right-side > div:first-child {
                        text-align: left !important;
                    }
                    /* [P3-MENU-MOBILE-ACTIONS · 2026-05-30] Fila de acciones
                       balanceada: el grupo de botones llena el espacio restante
                       y "Cambiar Plato" (2º botón = acción primaria) crece para
                       ocupar el centro entre los dos circulares. Pre-fix: la kcal
                       quedaba aislada a la izquierda y el cluster apretado a la
                       derecha con la CTA primaria comprimida. */
                    .meal-right-side > div:last-child {
                        flex: 1;
                        justify-content: flex-end;
                    }
                    .meal-right-side .meal-act-btn:nth-child(2) {
                        flex: 1;
                        max-width: 260px;
                    }
                    .main-grid {
                        flex-direction: column;
                        gap: 1.5rem;
                    }
                    /* [DASH-MOBILE-MENU-OVERFLOW · 2026-06-01] El .meals-container
                       (cuaderno) trae inline alignSelf 'start' pensado para el layout
                       ROW de desktop (top-align). En mobile el .main-grid pasa a
                       COLUMNA y align-self controla el eje HORIZONTAL: 'start' hacia
                       que el cuaderno tomara el ancho de su CONTENIDO (las pestanas de
                       dia, que no encogen) en vez de estirarse al viewport. Con 3
                       pestanas cabia; con 4+ la tarjeta se salia y recortaba el texto y
                       las pestanas a la derecha. stretch la fija al ancho disponible:
                       las pestanas vuelven a scrollear dentro (overflow-x auto) y las
                       comidas envuelven. !important para ganarle al style inline. */
                    .meals-container {
                        align-self: stretch !important;
                        max-width: 100%;
                    }
                    /* [P3-MOBILE-ACTIONS-STACK · 2026-05-26] En mobile el
                       .actions-group debe stackear vertical, no row. Pre-fix
                       quedaba en flex-direction:row (default) con CREDITOS
                       sola a la izquierda y new-plan-wrapper apilada a la
                       derecha — layout disonante respecto al header centered
                       de arriba. Ahora todo column, full width, centrado. */
                    .actions-group {
                        width: 100%;
                        flex-direction: column;
                        align-items: stretch;
                        gap: 0.75rem;
                    }
                    /* [P2-CREDITS-METER · 2026-06-15] El badge de créditos migró a
                       <CreditsMeter/> (CSS module propio que ya maneja full-width
                       en <=768px). La regla .credits-badge quedó sin elemento. */
                    .new-plan-wrapper {
                        flex: none;
                        width: 100%;
                        max-width: none;
                    }
                    .new-plan-btn {
                        width: 100%;
                        justify-content: center;
                        padding: 0.75rem 1.25rem;
                        font-size: 0.88rem;
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

                /* [P3-CHIP-MOBILE-PREMIUM · 2026-05-27] Chip del plan tier
                   con polish premium: gradient dorado de 3 stops + shimmer
                   sutil + shadow doble + Crown icon + CTA pill embebida.
                   Visible solo en mobile/tablet (≤1024px); en desktop el
                   surface es el popover del user menu. */
                .plan-tier-badge {
                    /* Base styles — antes inline, ahora controlados por CSS */
                    display: none;
                    align-items: center;
                    gap: 0.4rem;
                    padding: 0.35rem 0.55rem 0.35rem 0.75rem;
                    border-radius: 9999px;
                    font-size: 0.65rem;
                    font-weight: 800;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    cursor: pointer;
                    font-family: inherit;
                    line-height: 1;
                    position: relative;
                    overflow: hidden;
                    transition: transform 0.18s ease, box-shadow 0.22s ease;
                    isolation: isolate;
                }

                /* [P3-CHIP-MOBILE-TIER-COLORS · 2026-05-27] Paletas por tier:
                   free → slate, basic → emerald, plus → indigo, ultra → amber.
                   Ultra es el único con shimmer animation. */

                /* GRATUITO — slate gris sobrio */
                .plan-tier-badge--free {
                    background: linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%);
                    color: #64748B;
                    border: 1.5px solid #CBD5E1;
                    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
                }

                /* BÁSICO — emerald esmeralda (entry tier de pago) */
                .plan-tier-badge--basic {
                    background: linear-gradient(135deg,
                        #ECFDF5 0%,
                        #D1FAE5 40%,
                        #A7F3D0 100%);
                    color: #065F46;
                    border: 1.5px solid #10B981;
                    box-shadow:
                        0 2px 6px rgba(6, 95, 70, 0.15),
                        0 0 0 0.5px rgba(255, 255, 255, 0.4) inset;
                }
                /* [PLAN-TIER-BADGE-BASIC-DARK · 2026-06-01] El chip "BÁSICO" del header
                   MÓVIL usaba el gradiente verde MUY claro sin override dark → pill
                   brillante/lavado sobre el fondo oscuro. Variante oscura: tinte
                   esmeralda translúcido + texto verde claro + el CTA "Ver planes" a tono.
                   (Es un elemento distinto al badge del menú de cuenta del sidebar.) */
                html[data-theme="dark"] .plan-tier-badge--basic {
                    background: rgba(16, 185, 129, 0.16);
                    color: #6EE7B7;
                    border-color: rgba(16, 185, 129, 0.5);
                    box-shadow: none;
                }
                html[data-theme="dark"] .plan-tier-badge--basic .plan-tier-badge-cta {
                    background: rgba(16, 185, 129, 0.28);
                    color: #D1FAE5;
                    /* El separador y la sombra del CTA eran BLANCOS (border-left
                       rgba(255,255,255,0.55) + box-shadow claro) → se veían como un
                       contorno blanco en oscuro. A tono esmeralda + sin sombra clara. */
                    border-left-color: rgba(16, 185, 129, 0.4);
                    box-shadow: none;
                }
                /* [PLAN-TIER-BADGE-FREE-DARK · 2026-06-15] El chip "GRATUITO" usaba
                   el gradiente slate MUY claro (#F8FAFC→#F1F5F9) sin override dark →
                   pill blanquecino/lavado sobre el fondo oscuro en móvil. Variante
                   oscura: slate translúcido (gris más oscuro) + texto slate claro +
                   CTA "Ver planes" a tono, sin bordes/sombras blancas. */
                html[data-theme="dark"] .plan-tier-badge--free {
                    background: rgba(148, 163, 184, 0.13);
                    color: #CBD5E1;
                    border-color: rgba(148, 163, 184, 0.34);
                    box-shadow: none;
                }
                html[data-theme="dark"] .plan-tier-badge--free .plan-tier-badge-cta {
                    background: rgba(148, 163, 184, 0.24);
                    color: #E2E8F0;
                    border-left-color: rgba(148, 163, 184, 0.32);
                    box-shadow: none;
                }

                /* PLUS — indigo (pro, intermediate) */
                .plan-tier-badge--plus {
                    background: linear-gradient(135deg,
                        #EEF2FF 0%,
                        #E0E7FF 40%,
                        #C7D2FE 100%);
                    color: #3730A3;
                    border: 1.5px solid #6366F1;
                    box-shadow:
                        0 2px 6px rgba(99, 102, 241, 0.18),
                        0 0 0 0.5px rgba(255, 255, 255, 0.4) inset;
                }

                /* ULTRA — amber dorado con shimmer (premium top exclusivo) */
                .plan-tier-badge--ultra {
                    background: linear-gradient(135deg,
                        #FEF3C7 0%,
                        #FDE68A 35%,
                        #FCD34D 65%,
                        #FBBF24 100%);
                    color: #78350F;
                    border: 1.5px solid #F59E0B;
                    box-shadow:
                        0 2px 6px rgba(180, 83, 9, 0.18),
                        0 0 0 0.5px rgba(255, 255, 255, 0.4) inset;
                }

                /* Shimmer SOLO en Ultra — distintivo del tier máximo */
                .plan-tier-badge--ultra::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -50%;
                    width: 40%;
                    height: 100%;
                    background: linear-gradient(90deg,
                        transparent 0%,
                        rgba(255, 255, 255, 0.65) 50%,
                        transparent 100%);
                    animation: planTierShimmer 5s ease-in-out infinite;
                    pointer-events: none;
                    z-index: 1;
                }

                @keyframes planTierShimmer {
                    0%, 88%, 100% { left: -50%; }
                    94% { left: 110%; }
                }

                /* Hover lift universal + shadow color-matched */
                .plan-tier-badge:hover {
                    transform: translateY(-1.5px);
                }
                .plan-tier-badge--free:hover {
                    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08);
                }
                .plan-tier-badge--basic:hover {
                    box-shadow:
                        0 6px 14px rgba(6, 95, 70, 0.25),
                        0 0 0 0.5px rgba(255, 255, 255, 0.5) inset;
                }
                .plan-tier-badge--plus:hover {
                    box-shadow:
                        0 6px 14px rgba(99, 102, 241, 0.28),
                        0 0 0 0.5px rgba(255, 255, 255, 0.5) inset;
                }
                .plan-tier-badge--ultra:hover {
                    box-shadow:
                        0 6px 14px rgba(180, 83, 9, 0.28),
                        0 0 0 0.5px rgba(255, 255, 255, 0.5) inset;
                }
                .plan-tier-badge:hover .plan-tier-badge-chevron {
                    transform: translateX(2px);
                }
                .plan-tier-badge:active {
                    transform: translateY(0);
                }
                .plan-tier-badge:focus-visible {
                    outline: 2px solid #6366F1;
                    outline-offset: 2px;
                }

                /* Crown icon (solo premium) */
                .plan-tier-badge-crown {
                    flex-shrink: 0;
                    color: currentColor;
                    margin-top: -1px;
                    z-index: 2;
                    position: relative;
                }

                /* Tier name protagonista */
                .plan-tier-badge-label {
                    font-weight: 900;
                    letter-spacing: 0.08em;
                    z-index: 2;
                    position: relative;
                }

                /* CTA "Ver planes" como pill embebida con su propio bg
                   color-matched a cada tier */
                .plan-tier-badge-cta {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.2rem;
                    text-transform: none;
                    letter-spacing: 0;
                    font-weight: 700;
                    font-size: 0.7rem;
                    padding: 0.25rem 0.55rem 0.25rem 0.6rem;
                    margin-left: 0.15rem;
                    border-radius: 9999px;
                    background: rgba(255, 255, 255, 0.55);
                    z-index: 2;
                    position: relative;
                    transition: background 0.18s ease, color 0.18s ease;
                }
                .plan-tier-badge--free .plan-tier-badge-cta {
                    background: rgba(255, 255, 255, 0.85);
                    color: #475569;
                }
                .plan-tier-badge--basic .plan-tier-badge-cta {
                    color: #047857;
                }
                .plan-tier-badge--plus .plan-tier-badge-cta {
                    color: #4338CA;
                }
                .plan-tier-badge--ultra .plan-tier-badge-cta {
                    color: #92400E;
                }
                .plan-tier-badge:hover .plan-tier-badge-cta {
                    background: rgba(255, 255, 255, 0.85);
                }

                .plan-tier-badge-chevron {
                    transition: transform 0.18s ease;
                    flex-shrink: 0;
                }

                @media (max-width: 1024px) {
                    /* Mobile/tablet: el sidebar lateral cambia a BottomTabBar
                       — sin popover del avatar disponible, el chip es el
                       único acceso a /dashboard/upgrade. */
                    .plan-tier-badge {
                        display: inline-flex;
                    }

                    /* [P3-CHIP-MOBILE-POLISH · 2026-05-30] Polish del chip en
                       mobile: área táctil más cómoda (≈40px alto), tipografía
                       más legible y CTA "Ver planes" con separador + sombra
                       sutil para que lea claramente como botón, no como adorno. */
                    .plan-tier-badge {
                        gap: 0.5rem;
                        padding: 0.5rem 0.65rem 0.5rem 0.95rem;
                        min-height: 38px;
                        font-size: 0.72rem;
                    }
                    .plan-tier-badge-label {
                        font-size: 0.74rem;
                        letter-spacing: 0.07em;
                    }
                    .plan-tier-badge-cta {
                        font-size: 0.74rem;
                        padding: 0.3rem 0.6rem;
                        margin-left: 0.35rem;
                        background: rgba(255, 255, 255, 0.78);
                        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
                        /* separador sutil entre el tier y la CTA */
                        border-left: 1px solid rgba(255, 255, 255, 0.55);
                    }
                    .plan-tier-badge-chevron {
                        margin-left: -0.1rem;
                    }
                }
                @media (max-width: 380px) {
                    /* En viewports muy estrechos (iPhone SE, etc.) la CTA
                       "Ver planes" desaparece pero conservamos chevron — el
                       chevron solo + el badge dorado + crown ya implican
                       "tap aquí". */
                    .plan-tier-badge-cta {
                        display: none;
                    }
                    .plan-tier-badge {
                        padding-right: 0.5rem;
                    }
                }

                /* [APPEARANCE-THEME · 2026-05-28] TEMA OSCURO — overrides de
                   superficies glassmorphism que en claro usan gradients de
                   blanco translúcido (no overridables desde inline). En oscuro
                   las repintamos a superficie sólida slate para que no queden
                   tarjetas blancas sobre el fondo profundo. El tema claro
                   queda intacto: estas reglas solo aplican bajo data-theme. */
                html[data-theme="dark"] .dashboard-header {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                }
                html[data-theme="dark"] .macros-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    box-shadow: var(--shadow-lg);
                }
                html[data-theme="dark"] .macros-grid > div:not(:last-child) {
                    border-right: 1px solid var(--border);
                }
                html[data-theme="dark"] .meals-container {
                    background-color: var(--bg-card);
                    /* [APPEARANCE-THEME · 2026-05-29] El "lomo" del cuaderno
                       (border-left #1E293B en claro) se fundía con el papel
                       oscuro var(--bg-card)=#111827 — el cuaderno perdía su
                       identidad y quedaba como una tarjeta plana. Repintamos el
                       lomo a un slate claramente más claro (encuadernado de
                       cuero oscuro) y reemplazamos las sombras (calibradas para
                       el crema, invisibles en oscuro) por: un hairline de luz en
                       el pliegue del lomo, una sombra de valle que hunde la
                       página hacia el encuadernado, y una sombra de elevación
                       profunda que despega el cuaderno del fondo de página. */
                    /* [DASH-NOTEBOOK-SOFTEN · 2026-06-22] Lomo más cercano al papel
                       oscuro (#3A4358→#2C3442) y hairline del pliegue más tenue
                       (0.22→0.12) → el encuadernado se nota pero ya no resalta. */
                    border-left-color: #2C3442;
                    box-shadow:
                        inset 1px 0 0 0 rgba(148, 163, 184, 0.12),
                        inset 10px 0 12px -7px rgba(0, 0, 0, 0.6),
                        0 24px 50px -12px rgba(0, 0, 0, 0.7);
                }
                html[data-theme="dark"] .meals-container::before {
                    /* Línea de margen roja del cuaderno: +brillo y alpha para
                       que lea sobre el papel oscuro (en claro era 248,113,113
                       @ 0.4; aquí el accent oscuro #FB7185 @ 0.55). */
                    border-left-color: rgba(251, 113, 133, 0.35);
                    border-right-color: rgba(251, 113, 133, 0.35);
                }
                html[data-theme="dark"] .option-buttons {
                    /* La "línea de rasgado" punteada bajo los días: en claro es
                       #94A3B8 (sólido), que en oscuro choca duro contra el papel.
                       La bajamos a un slate translúcido más suave y a tono. */
                    border-bottom-color: rgba(148, 163, 184, 0.4);
                }
                @media (max-width: 768px) {
                    html[data-theme="dark"] .stat-item {
                        border-bottom: 1px solid var(--border);
                    }
                    html[data-theme="dark"] .stat-item:nth-child(odd) {
                        border-right: 1px solid var(--border) !important;
                    }
                }

                /* [DASH-MOBILE-CLEAN-CARD · 2026-06-01] En móvil el menú deja de ser un
                   "cuaderno" (lomo oscuro grueso a la izquierda + línea roja de margen +
                   esquinas asimétricas + sombras de encuadernado) y pasa a una tarjeta
                   limpia y moderna. El escritorio conserva el cuaderno. Los paddings
                   izquierdos grandes existían para librar el lomo → se normalizan.
                   !important para ganarle a los overrides de tema oscuro del notebook
                   (.meals-container dark, ::before, .option-buttons), de mayor
                   especificidad. */
                @media (max-width: 768px) {
                    .meals-container {
                        border: 1px solid var(--border) !important;
                        border-radius: 1.25rem !important;
                        box-shadow: 0 8px 24px -12px rgba(0, 0, 0, 0.30) !important;
                    }
                    .meals-container::before {
                        display: none !important;
                    }
                    .option-buttons {
                        border-bottom: 1px solid var(--border) !important;
                        /* [DASH-MOBILE-TABS-PADDING · 2026-06-01] +separación de los
                           bordes: las pestañas se estiran (flex-grow) y llenan el ancho,
                           así que la única holgura lateral es este padding. Subido a 2rem
                           + gap reducido para que la 1ª/última pestaña no queden pegadas
                           a los bordes en iPhone. */
                        padding-left: 2rem !important;
                        padding-right: 2rem !important;
                        gap: 0.5rem !important;
                    }
                    .menu-section-header {
                        padding-left: 1.25rem !important;
                        padding-right: 1.25rem !important;
                    }
                    .meal-card,
                    .skipped-lunch {
                        padding-left: 1.25rem !important;
                    }
                    .meal-card:not(:last-child)::after,
                    .skipped-lunch:not(:last-child)::after {
                        left: 1.25rem !important;
                        right: 1.25rem !important;
                    }
                }

                /* [DASH-NARROW-TABS-FIT · 2026-06-01] En pantallas angostas (iPhone 12
                   Pro 390px, SE/mini 375px, etc.) las 4 pestañas de día + el padding de
                   2rem ya NO caben → se desbordan y el navegador ignora el padding, así
                   que se pegan a los bordes (en Pro Max 430px sí caben = perfecto).
                   Achicamos texto + padding interno de las pestañas SOLO aquí para que
                   quepan CON el margen de 2rem. >400px (Pro Max) no entra en esta regla. */
                @media (max-width: 400px) {
                    /* [DASH-NARROW-TABS-FIT · 2026-06-01] Tamaño que entra en 390px CON
                       el margen de 2rem: texto 0.8rem + alto 0.6rem (más grandes que el
                       0.75rem inicial, que se veían muy chicos) sin desbordar. */
                    .option-btn {
                        font-size: 0.8rem !important;
                        padding: 0.6rem 0.5rem !important;
                    }
                    .option-buttons {
                        gap: 0.35rem !important;
                    }
                }
            `}</style>

            {/* --- HEADER PREMIUM --- */}
            <header className="dashboard-header">
                <div className="header-text-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

                    {/* [P3-UPGRADE-FUSION-MOBILE · 2026-05-26] Chip del plan
                        tier RESTAURADO solo en mobile (≤1024px). En desktop la
                        fusión del popover sigue activa — el chip está oculto
                        (CSS `display: none`) porque el popover del user menu
                        provee el mismo entry point con menos clutter visual.
                        En mobile/tablet, el sidebar lateral cambia a
                        BottomTabBar (sin avatar popover visible) → el chip es
                        la única forma rápida de acceder a /dashboard/upgrade.

                        [P3-UPGRADE-CHIP-CTA · 2026-05-26] Chip enriquecido con
                        "· Ver planes ›" para señalizar claramente que es
                        clickeable. Sin este hint, el usuario interpreta el
                        badge como ornament visual de status (no actionable). */}
                    <div style={{ marginBottom: '0.25rem' }}>
                        {/* [P3-CHIP-MOBILE-TIER-COLORS · 2026-05-27] Cada tier
                            tiene paleta distintiva: free=slate, basic=emerald,
                            plus=indigo, ultra=amber con shimmer + Crown.
                            Refuerza la jerarquía visual del upgrade path. */}
                        {(() => {
                            // [P1-GUEST-BADGE · 2026-06-21] Invitado real → 'Invitado'.
                            const tierVariant = !isPremium
                                ? 'free'
                                : userProfile?.plan_tier === 'ultra' ? 'ultra'
                                : userProfile?.plan_tier === 'plus' ? 'plus'
                                : 'basic';
                            const tierLabel = isGuest
                                ? 'Invitado'
                                : !isPremium
                                ? 'GRATUITO'
                                : userProfile?.plan_tier === 'ultra' ? 'MAX'
                                : userProfile?.plan_tier === 'plus' ? 'PLUS'
                                : 'BÁSICO';
                            return (
                                <button
                                    type="button"
                                    onClick={() => navigate('/dashboard/upgrade')}
                                    aria-label={`Plan actual: ${tierLabel}. Click para ver todos los planes.`}
                                    className={`plan-tier-badge plan-tier-badge--${tierVariant}`}
                                >
                                    <span className="plan-tier-badge-label">
                                        {tierLabel}
                                    </span>
                                    <span className="plan-tier-badge-cta">Ver planes</span>
                                    <ChevronRight
                                        size={12}
                                        strokeWidth={2.75}
                                        className="plan-tier-badge-chevron"
                                        aria-hidden="true"
                                    />
                                </button>
                            );
                        })()}
                    </div>

                    {/* [P3-GREETING-ROTATE · 2026-06-19] Saludo time-aware que rota cada ~9s
                        con transición animada. El nombre conserva su gradient (estilo en
                        `_GREETING_NAME_STYLE`, con los fixes de clip P3-GRADIENT-NAME-CLIP-FIX). */}
                    <RotatingGreeting firstName={userProfile?.full_name?.split(' ')[0] || formData?.name || 'Nutrifit'} />

                    {/* VISUALIZADOR DE CRÉDITOS — [P2-CREDITS-METER · 2026-06-15] gauge circular
                        animado (ver components/dashboard/CreditsMeter).
                        [P3-CREDITS-IN-IDENTITY · 2026-07-04] Movido de actions-group al bloque de
                        identidad: tras P3-HEADER-NO-DEFORM quedaba HUÉRFANO flotando entre el
                        saludo y la columna de controles (feedback directo del owner). Debajo del
                        saludo ancla con la identidad y equilibra el lado izquierdo del hero
                        contra la columna derecha cargada. */}
                    <div style={{ marginTop: '0.65rem' }} className="credits-meter-slot">
                        <CreditsMeter
                            remainingCredits={remainingCredits}
                            userPlanLimit={userPlanLimit}
                            isLimitReached={isLimitReached}
                            isGuest={isGuest}
                        />
                    </div>
                </div>

                {/* --- ACTIONS GROUP --- */}
                <div className="actions-group">

                    {/* REGENERACIÓN DE MENÚ Y EXPORTACIÓN */}
                    <div className="new-plan-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'stretch' }}>

                        {/* INDICADOR COMPACTO: Despensa + Personas (Híbrido) */}
                        <div ref={despensaDropdownRef} style={{ position: 'relative' }}>
                            {/* [UX-DURATION-PANEL-BACKDROP · 2026-07-03] Backdrop fijo con blur al abrir el
                                panel: desenfoca el resto del dashboard y enfoca el menú. Portal a <body>
                                (inmune a ancestros con transform/stacking context — el intento in-tree con
                                zIndex fallaba: un ancestro del dashboard crea su propio contexto y el
                                backdrop de body tapaba el menú → TODO salía borroso). SIEMPRE montado con
                                transición de opacity (fade simétrico abrir/cerrar sin depender de
                                AnimatePresence-en-portal); pointerEvents solo al abrir. Click en el fondo
                                cierra. Blur constante + fade de opacity = sin el flicker histórico del blur
                                animado (P3-DURATION-DROPDOWN-OPEN-FLUID). */}
                            {createPortal(
                                <div
                                    aria-hidden="true"
                                    onClick={() => setShowDespensaDropdown(false)}
                                    style={{
                                        position: 'fixed', inset: 0, zIndex: 9998,
                                        background: isDark ? 'rgba(2, 6, 23, 0.45)' : 'rgba(15, 23, 42, 0.22)',
                                        backdropFilter: 'blur(5px)',
                                        WebkitBackdropFilter: 'blur(5px)',
                                        opacity: showDespensaDropdown ? 1 : 0,
                                        pointerEvents: showDespensaDropdown ? 'auto' : 'none',
                                        transition: 'opacity 0.2s ease',
                                    }}
                                />,
                                document.body
                            )}
                            {/* Compact Trigger Row */}
                            <div
                                onClick={() => setShowDespensaDropdown(!showDespensaDropdown)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    gap: '0.5rem',
                                    background: showDespensaDropdown
                                        // [APPEARANCE-THEME · 2026-05-29] Estado "abierto":
                                        // en claro el gradient termina en #E8EDF3 (gris claro
                                        // = look "presionado"). En oscuro eso volvía la barra
                                        // medio-blanca/brillosa y tapaba el texto → usar un
                                        // slate sólido sutil.
                                        ? (isDark ? 'var(--bg-muted)' : 'linear-gradient(135deg, var(--bg-muted) 0%, #E8EDF3 100%)')
                                        : 'linear-gradient(135deg, var(--bg-page) 0%, var(--bg-muted) 100%)',
                                    padding: '0.45rem 0.75rem',
                                    borderRadius: '10px',
                                    border: `1.5px solid ${showDespensaDropdown ? 'var(--text-light)' : 'var(--border)'}`,
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
                                        <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                                            {{ weekly: '7d', biweekly: '15d', monthly: '30d' }[groceryDuration] || '7d'}
                                        </span>
                                        <span style={{ color: 'var(--text-light)', fontWeight: 500 }}>
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
                                                background: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FFFBEB',
                                                color: isDark ? '#FCD34D' : '#78350F',
                                                padding: '0.2rem 0.45rem',
                                                borderRadius: '6px',
                                                fontSize: '0.65rem',
                                                fontWeight: 800,
                                                border: isDark ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid #FDE68A',
                                                display: 'flex', alignItems: 'center', gap: '0.25rem',
                                                whiteSpace: 'nowrap',
                                                cursor: 'help',
                                            }}
                                        >
                                            <AlertCircle size={11} color="#F59E0B" strokeWidth={2.5} />
                                            <span>caché</span>
                                        </div>
                                    )}
                                    {planFinished ? (
                                        // [BADGE-HOURS] Ciclo terminado → "Finalizado" (antes "0d"/"Exp.",
                                        // ambos confusos). El CTA de reiniciar vive en el botón primario abajo.
                                        <div style={{
                                            background: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
                                            color: isDark ? '#F87171' : '#DC2626',
                                            padding: '0.2rem 0.5rem', borderRadius: '6px',
                                            fontSize: '0.65rem', fontWeight: 800,
                                            display: 'flex', alignItems: 'center', gap: '0.2rem'
                                        }}>
                                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: isDark ? '#F87171' : '#DC2626' }} />
                                            Finalizado
                                        </div>
                                    ) : daysLeft === 1 ? (
                                        // [BADGE-HOURS] Último día → horas reales restantes en vez de "1d"/"0d".
                                        <div style={{
                                            background: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
                                            color: isDark ? '#F87171' : '#DC2626',
                                            padding: '0.2rem 0.5rem', borderRadius: '6px',
                                            fontSize: '0.65rem', fontWeight: 800,
                                            display: 'flex', alignItems: 'center', gap: '0.2rem'
                                        }}>
                                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: isDark ? '#F87171' : '#DC2626' }} />
                                            {hoursUntilCycleEnd}h
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: isDark
                                                ? (daysLeft <= 2 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(37, 99, 235, 0.24)')
                                                : (daysLeft <= 2 ? '#FEE2E2' : '#DBEAFE'),
                                            color: isDark
                                                ? (daysLeft <= 2 ? '#F87171' : '#93C5FD')
                                                : (daysLeft <= 2 ? '#DC2626' : '#2563EB'),
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '6px',
                                            fontSize: '0.65rem',
                                            fontWeight: 800,
                                            display: 'flex', alignItems: 'center', gap: '0.2rem'
                                        }}>
                                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: isDark ? (daysLeft <= 2 ? '#F87171' : '#93C5FD') : (daysLeft <= 2 ? '#DC2626' : '#2563EB') }} />
                                            {daysLeft}d
                                        </div>
                                    )}
                                    <motion.div animate={{ rotate: showDespensaDropdown ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                        <ChevronDown size={13} color="var(--text-light)" strokeWidth={2.5} />
                                    </motion.div>
                                </div>
                            </div>

                            {/* Combined Popover */}
                            {createPortal(
                            <AnimatePresence>
                                {showDespensaDropdown && despensaMenuRect && (
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
                                        ref={despensaPanelRef}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15, ease: 'easeOut' }}
                                        style={{
                                            // [UX-DURATION-PANEL-WIDTH · 2026-07-03] El cap de 340px dejaba el
                                            // panel MÁS ANGOSTO que su propio trigger (~430px) → mismo ancho
                                            // de la barra (rect del trigger + 8px), capado al viewport.
                                            // [UX-DURATION-PANEL-BACKDROP · 2026-07-03] Portaleado a <body> y
                                            // posicionado FIXED con el rect del trigger: queda SOBRE el
                                            // backdrop blurreado (z 9999 > 9998) y CUBRE el área del trigger
                                            // (nada del control queda borroso detrás). El rect se re-mide en
                                            // resize/scroll (efecto de arriba) → sigue anclado al moverse.
                                            position: 'fixed',
                                            top: Math.max(12, despensaMenuRect.top - 4),
                                            left: Math.max(12, despensaMenuRect.left - 4),
                                            width: Math.min(despensaMenuRect.width + 8, window.innerWidth - 24),
                                            zIndex: 9999,
                                            background: 'var(--bg-card)',
                                            borderRadius: '12px',
                                            border: '1.5px solid var(--border)',
                                            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.15)',
                                            overflowX: 'hidden', overflowY: 'auto',
                                            maxHeight: `calc(100vh - ${Math.max(12, despensaMenuRect.top - 4) + 12}px)`,
                                            padding: '8px'
                                        }}
                                    >
                                        {/* Despensa Section */}
                                        <div style={{ padding: '4px 8px 3px' }}>
                                            <span style={{ fontSize: '0.66rem', color: isDark ? '#34D399' : '#059669', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Clock size={11} /> Duración del Plan
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
                                                    // [P1-DASH-BUDGET-AUTOFILL · 2026-06-23] En modo 'Personalizar', al
                                                    // cambiar la duración SINCRONIZAMOS el monto al MÍNIMO de la nueva
                                                    // duración (pedido del owner: el monto = el mínimo de la duración
                                                    // elegida, suba o baje). Ponemos el piso estático al instante (sin
                                                    // esperar la red) y ARMAMOS el sync al mínimo PERSONALIZADO por calorías;
                                                    // cuando el hook lo trae, el efecto de arriba lo ajusta a ESE valor
                                                    // ("según tus metas"). Si la red falla, queda el estático como fallback.
                                                    if (formData?.budget === 'custom') {
                                                        const _afCur = formData?.budgetCurrency || 'DOP';
                                                        const _afMin = minBudgetFor(_afCur, opt.value);
                                                        if (String(_afMin) !== String(formData?.budgetAmount)) {
                                                            updateData('budgetAmount', String(_afMin));
                                                            safeUpdateHealthProfile({ budgetAmount: String(_afMin) });
                                                        }
                                                        autofillArmedRef.current = true;
                                                    }
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
                                                                // (pool exhaustion, el cliente anterior RemoteProtocolError);
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
                                                                    // [P4-RECALC-LOCALSTORAGE] setPlanData ANTES de tocar storage:
                                                                    // en iOS Private Mode / quota un throw de localStorage no debe
                                                                    // descartar el recalc del backend. Helpers safe absorben el throw.
                                                                    if (result.plan_data.is_restocked == null && safeLocalStorageGet(rk, null)) result.plan_data.is_restocked = true;
                                                                    setPlanData(result.plan_data);
                                                                    safeLocalStorageSet('mealfit_plan', JSON.stringify(result.plan_data));
                                                                    toast.success('Lista actualizada', { id: recalcToast });
                                                                    // [P2-NEVERA-COMPLETION-REMOVED · 2026-07-06] el panel
                                                                    // "Para completar tu Nevera" fue eliminado (decisión del
                                                                    // owner); `result.pantry_completion_list` se ignora.
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
                                                    padding: '0.5rem 0.75rem', borderRadius: '8px', cursor: 'pointer',
                                                    background: groceryDuration === opt.value
                                                        ? (isDark ? 'rgba(16, 185, 129, 0.14)' : 'linear-gradient(135deg, #F0FDF4, #DCFCE7)')
                                                        : 'transparent',
                                                    border: groceryDuration === opt.value
                                                        ? (isDark ? '1px solid rgba(52, 211, 153, 0.45)' : '1px solid #BBF7D0')
                                                        : '1px solid transparent',
                                                    transition: 'all 0.15s ease', margin: '2px 0'
                                                }}
                                                onMouseEnter={e => { if (groceryDuration !== opt.value) e.currentTarget.style.background = 'var(--bg-muted)'; }}
                                                onMouseLeave={e => { if (groceryDuration !== opt.value) e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: groceryDuration === opt.value ? (isDark ? '#34D399' : '#059669') : 'var(--text-main)' }}>{opt.label}</span>
                                                    <span style={{ fontSize: '0.66rem', color: isDark ? 'var(--text-muted)' : 'var(--text-light)' }}>{opt.sub}</span>
                                                </div>
                                                {groceryDuration === opt.value && <CheckCircle size={15} color={isDark ? '#34D399' : '#059669'} strokeWidth={2.5} />}
                                            </div>
                                        ))}

                                        {/* [P1-DASH-BUDGET-EDIT · 2026-06-23] Presupuesto editable desde el
                                            dashboard. Antes el owner no podía renovar tras cambiar la duración:
                                            su presupuesto 'custom' quedaba bajo el piso de la nueva duración y
                                            SOLO se editaba en el formulario → la renovación chocaba con el gate
                                            P2-BUDGET-FLOOR (422) y lo botaba al /assessment. Ahora se ajusta aquí
                                            (mismo panel que la duración); persiste a formData + health profile,
                                            así la próxima renovación usa el monto nuevo. El mínimo mostrado se
                                            recalcula con la duración elegida (mismo SSOT minBudgetFor). */}
                                        <div style={{ height: 1, background: 'var(--border)', margin: '8px 4px' }} />
                                        <div style={{ padding: '2px 8px 5px' }}>
                                            <span style={{ fontSize: '0.66rem', color: isDark ? '#34D399' : '#059669', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Wallet size={11} /> Presupuesto
                                            </span>
                                        </div>
                                        {(() => {
                                            const _cur = formData?.budgetCurrency || 'DOP';
                                            const _sym = _cur === 'USD' ? 'US$' : 'RD$';
                                            const _min = budgetFloor.min;
                                            const _cycleDays = budgetCycleDays(groceryDuration);
                                            const _amt = Number(formData?.budgetAmount);
                                            const _isCustom = formData?.budget === 'custom';
                                            const _belowMin = _isCustom && formData?.budgetAmount !== '' && formData?.budgetAmount != null && _amt > 0 && _amt < _min;
                                            const _setBudget = (field, value) => { updateData(field, value); safeUpdateHealthProfile({ [field]: value }); };
                                            const _opts = [
                                                { val: 'low', label: 'Económico' },
                                                { val: 'medium', label: 'Moderado' },
                                                { val: 'high', label: 'Alto' },
                                                { val: 'unlimited', label: 'Sin límite' },
                                                { val: 'custom', label: 'Personalizar' },
                                            ];
                                            // [P2-AUDIT-V6-BATCH · 2026-07-03] (P2-I) referencia estimada del tier
                                            // seleccionado (piso × banda, misma fórmula del banner) — paridad con
                                            // el formulario: el usuario ve el RD$Y contra el que se comparará.
                                            const _selTierRef = (!_isCustom && budgetFloor.tierReferences
                                                && budgetFloor.tierReferences[formData?.budget]) || null;
                                            return (
                                                <div style={{ padding: '0 4px' }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {_opts.map(o => {
                                                            const sel = (formData?.budget || '') === o.val;
                                                            return (
                                                                <button
                                                                    key={o.val}
                                                                    type="button"
                                                                    onClick={() => _setBudget('budget', o.val)}
                                                                    style={{
                                                                        flex: o.val === 'custom' ? '1 1 100%' : '1 1 calc(50% - 6px)',
                                                                        padding: '0.5rem 0.6rem', borderRadius: '8px', cursor: 'pointer',
                                                                        fontSize: '0.75rem', fontWeight: 700, textAlign: 'center',
                                                                        background: sel ? (isDark ? 'rgba(16,185,129,0.14)' : 'linear-gradient(135deg,#F0FDF4,#DCFCE7)') : 'var(--bg-muted)',
                                                                        border: sel ? (isDark ? '1px solid rgba(52,211,153,0.45)' : '1px solid #BBF7D0') : '1px solid transparent',
                                                                        color: sel ? (isDark ? '#34D399' : '#059669') : 'var(--text-main)',
                                                                        transition: 'all 0.15s ease',
                                                                    }}
                                                                >{o.label}</button>
                                                            );
                                                        })}
                                                    </div>
                                                    {_selTierRef && (
                                                        <span style={{ display: 'block', marginTop: '0.45rem', fontSize: '0.68rem', lineHeight: 1.35, color: 'var(--text-muted)' }}>
                                                            ≈ {_sym}{Number(_selTierRef).toLocaleString('en-US')} por {_cycleDays} días (referencia estimada según tus metas).
                                                        </span>
                                                    )}
                                                    {_isCustom && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.55rem' }}>
                                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                <div style={{ position: 'relative', flex: 1 }}>
                                                                    <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem', pointerEvents: 'none' }}>{_sym}</span>
                                                                    <input
                                                                        type="number" inputMode="decimal" min={_min} step="1"
                                                                        placeholder={_cur === 'USD' ? 'Ej. 100' : 'Ej. 5000'}
                                                                        value={formData?.budgetAmount || ''}
                                                                        onChange={(e) => _setBudget('budgetAmount', e.target.value)}
                                                                        aria-label={`Presupuesto total en ${_cur === 'USD' ? 'dólares' : 'pesos dominicanos'}`}
                                                                        style={{
                                                                            width: '100%', boxSizing: 'border-box',
                                                                            padding: '0.5rem 0.6rem 0.5rem 2.6rem', borderRadius: '8px',
                                                                            border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-main)',
                                                                            fontSize: '0.85rem', fontWeight: 600, outline: 'none',
                                                                        }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', background: 'var(--bg-muted)', borderRadius: '0.5rem', padding: '3px', flexShrink: 0 }}>
                                                                    {['DOP', 'USD'].map(c => {
                                                                        const on = (_cur === c);
                                                                        return (
                                                                            <button key={c} type="button" onClick={() => _setBudget('budgetCurrency', c)} aria-pressed={on}
                                                                                style={{ border: 'none', background: on ? 'var(--bg-card)' : 'transparent', padding: '4px 9px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, color: on ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                                                                            >{c === 'USD' ? 'US$' : 'RD$'}</button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                            <span style={{ fontSize: '0.72rem', lineHeight: 1.4, fontWeight: _belowMin ? 700 : 500, color: _belowMin ? 'var(--warning)' : 'var(--text-muted)' }}>
                                                                {_belowMin ? '⚠️ ' : ''}Mínimo {_sym}{_min.toLocaleString('en-US')} para {_cycleDays} días{budgetFloor.isPersonalized ? ' (según tus metas)' : ''}.
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                    </motion.div>
                                )}
                            </AnimatePresence>,
                            document.body
                            )}
                        </div>


                        {/* BOTONES LADO A LADO */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', width: '100%' }}>
                            {(() => {
                                // [UX-PANTRY-CTA-DISAMBIG · 2026-05-28] (B) Ocultar el CTA
                                // manual "Ir a mi Nevera" cuando HAY lista de compras
                                // pendiente: "Ya compré la lista" es el camino rápido para
                                // llenar la Nevera de golpe, así que el botón manual es
                                // redundante en ese estado (ambos terminaban llenando la
                                // Nevera → confusión). La Nevera sigue accesible por el nav
                                // lateral. Solo aplica al estado "Ir a mi Nevera"
                                // (isPantryTooEmpty sin limit/plan-finished, que tienen
                                // prioridad de label).
                                if (!isLimitReached && !planFinished && isPantryTooEmpty && hasPendingShoppingItems) {
                                    return null;
                                }
                                return (
                                    <button
                                        onClick={async () => {
                                            // [P5-LOADING-DISABLE] Si el día ya se está actualizando, ignorar
                                            // el click (botón en estado "Actualizando…", evita 2ª llamada).
                                            if (isDayUpdating) return;
                                            if (planFinished) {
                                                navigate('/assessment');
                                                return;
                                            }
                                            // [P3-UPDATE-PLATOS-REQUIRES-PANTRY · 2026-05-17]
                                            // [P3-LLENA-NEVERA-DIRECT-CTA · 2026-05-27]
                                            // Pre-fix: el botón mostraba "Llena tu Nevera" en gris
                                            // disabled y al clickear emitía un toast.info con
                                            // sub-CTA "Ir a Nevera". UX confuso — visualmente
                                            // bloqueado pero técnicamente clickeable con doble click.
                                            // Post-fix: cuando la Nevera está vacía/escasa, el
                                            // botón es CTA real (azul accent, cursor pointer,
                                            // icon Refrigerator) que navega DIRECTO a /pantry.
                                            if (isPantryTooEmpty) {
                                                navigate('/dashboard/pantry');
                                                return;
                                            }
                                            // [2026-05-29] Abrir el modal AL INSTANTE (sin
                                            // esperar la validación de cuota, que en cache-miss
                                            // hace fetch y metía delay). Validamos en paralelo y
                                            // solo cerramos si no hay créditos (validateCreditsAsync
                                            // ya muestra el toast explicativo). Caso sin-créditos
                                            // es raro → flash open/close aceptable.
                                            setShowUpdatePlanModal(true);
                                            validateCreditsAsync().then((hasCredits) => {
                                                if (!hasCredits) setShowUpdatePlanModal(false);
                                            });
                                        }}
                                        className="new-plan-btn"
                                        aria-disabled={isLimitReached || isDayUpdating}
                                        aria-busy={isDayUpdating}
                                        title={isPantryTooEmpty ? `Tu Nevera necesita al menos ${PANTRY_MIN_ITEMS_FOR_UPDATE} alimentos. Tap para añadirlos.` : undefined}
                                        style={{
                                            background: isLimitReached
                                                ? 'var(--bg-muted)'
                                                : planFinished
                                                    ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                                                    : isPantryTooEmpty
                                                        ? 'linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%)'
                                                        // [2026-05-30] "Actualizar platos" (acción PRIMARIA con
                                                        // IA, icono Wand2) usa el acento violeta/índigo de la
                                                        // marca para diferenciarse del botón "PDF" (neutro).
                                                        // Violeta-600→índigo-600 (no el 400→500 más claro): menos
                                                        // brilloso y mejor contraste del texto/icono blancos
                                                        // (~5.5:1, AA) — el violet-400 #8B5CF6 daba ~3.6:1.
                                                        : 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
                                            color: isLimitReached ? 'var(--text-light)' : 'white',
                                            cursor: isDayUpdating ? 'wait' : (isLimitReached ? 'not-allowed' : 'pointer'),
                                            opacity: isDayUpdating ? 0.85 : 1,
                                            // [2026-05-29] Mismo efecto de hover que el botón PDF:
                                            // anillo interno nítido (antes era rgba 0.1, casi
                                            // invisible). Ring blanco visible sobre el gradiente.
                                            '--hover-shadow': planFinished
                                                ? '0 20px 40px -5px rgba(239, 68, 68, 0.5), inset 0 0 0 1.5px rgba(255,255,255,0.45)'
                                                : isPantryTooEmpty
                                                    ? '0 20px 40px -5px rgba(37, 99, 235, 0.45), inset 0 0 0 1.5px rgba(255,255,255,0.45)'
                                                    : '0 14px 30px -8px rgba(79, 70, 229, 0.4), inset 0 0 0 1.5px rgba(255,255,255,0.3)',
                                            '--active-shadow': planFinished
                                                ? '0 5px 15px -5px rgba(239, 68, 68, 0.2), inset 0 0 0 1.5px rgba(255,255,255,0.45)'
                                                : isPantryTooEmpty
                                                    ? '0 5px 15px -5px rgba(37, 99, 235, 0.25), inset 0 0 0 1.5px rgba(255,255,255,0.45)'
                                                    : '0 4px 12px -6px rgba(79, 70, 229, 0.22), inset 0 0 0 1.5px rgba(255,255,255,0.3)',
                                            boxShadow: isLimitReached
                                                ? 'none'
                                                : planFinished
                                                    ? '0 10px 20px -5px rgba(239, 68, 68, 0.4)'
                                                    : isPantryTooEmpty
                                                        ? '0 10px 20px -5px rgba(37, 99, 235, 0.35)'
                                                        : '0 6px 16px -6px rgba(79, 70, 229, 0.28)',
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
                                        {isDayUpdating
                                            ? <Loader2 size={18} className="spin-fast" />
                                            : isLimitReached
                                                ? <AlertCircle size={18} />
                                                : planFinished
                                                    ? <RefreshCw size={18} />
                                                    : isPantryTooEmpty
                                                        ? <Refrigerator size={18} />
                                                        : <Wand2 size={18} />}
                                        <span style={{ fontSize: '0.85rem' }}>
                                            {isDayUpdating
                                                ? 'Actualizando…'
                                                : isLimitReached
                                                    ? 'Límite'
                                                    : planFinished
                                                        ? 'Reiniciar plan'
                                                        : isPantryTooEmpty
                                                            ? 'Ir a mi Nevera'
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
                                    title="Agrega de una vez todo lo de tu lista de compras a la Nevera."
                                    style={{
                                        cursor: 'pointer',
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
                                        transition: 'background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
                                    }}
                                >
                                    {/* Dot pulsante emerald — semántica "ready to act" */}
                                    <span className="restock-cta-dot" aria-hidden="true" />
                                    <span>Ya compré la lista</span>
                                </button>
                            )}

                            <button
                                onClick={handleDownloadShoppingList}
                                disabled={isRecalculating}
                                className="new-plan-btn"
                                style={{
                                    background: isRecalculating ? 'var(--bg-muted)' : 'linear-gradient(135deg, var(--bg-page) 0%, var(--bg-muted) 100%)',
                                    color: isRecalculating ? 'var(--text-light)' : 'var(--text-main)',
                                    border: isRecalculating ? '1.5px solid var(--border)' : '1.5px solid var(--border)',
                                    // [PDF-BTN-HOVER-OUTLINE · 2026-06-01] En hover el
                                    // BORDE se vuelve un contorno sólido (negro en claro,
                                    // claro en oscuro). Antes había un inset ring tenue al
                                    // 35% que convivía con el borde claro var(--border) →
                                    // se veía doble raya (blanca + gris). Ahora es una sola
                                    // línea limpia (el borde mismo cambia de color).
                                    '--hover-border': isRecalculating ? 'var(--border)' : (isDark ? '#CBD5E1' : '#0F172A'),
                                    '--hover-shadow': isRecalculating ? 'none' : '0 15px 30px -5px rgba(0, 0, 0, 0.12)',
                                    '--active-shadow': isRecalculating ? 'none' : '0 5px 15px -5px rgba(0, 0, 0, 0.06)',
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

                        {/* [P2-NEVERA-DELTA-NOTICE · 2026-06-24] Aviso de la Nevera Inteligente,
                            DEBAJO de los botones. Solo ícono + texto verde (SIN pastilla: ni fondo
                            ni borde — la pastilla se confundía con un botón). Una línea. Izquierda
                            en PC / centrado en móvil. Solo con plan válido; la deducción es by-design. */}
                        {shoppingDeltaMeta?.itemsRemoved > 0 && !isPlanExpired && !planFinished && !isPlanCorrupted && (
                            /* [2026-07-06] Polish visual (pedido del owner): de texto desnudo a
                               mini-banner de éxito — MISMA paleta esmeralda que el banner de
                               presupuesto (coherencia), franja a lo ancho de la columna, texto
                               centrado. Supersede el "sin pastilla" de P2-NEVERA-DELTA-NOTICE:
                               el low-contrast + sin sombra evita que se lea como botón. */
                            <span className="nevera-notice-chip" style={{
                                width: '100%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                padding: '0.5rem 0.85rem',
                                marginTop: '0.1rem',
                                borderRadius: '0.75rem',
                                background: isDark ? 'rgba(16,185,129,0.10)' : '#ECFDF5',
                                border: isDark ? '1px solid rgba(52,211,153,0.30)' : '1px solid #A7F3D0',
                                color: isDark ? '#6EE7B7' : '#047857',
                                fontSize: '0.74rem', fontWeight: 600, lineHeight: 1.3,
                                textAlign: 'center',
                            }}>
                                <Refrigerator size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {shoppingDeltaMeta.isEmptyDueToPantry
                                        ? <>Tu Nevera ya cubre la lista ({shoppingDeltaMeta.itemsRemoved} ítem{shoppingDeltaMeta.itemsRemoved > 1 ? 's' : ''} de la compra)</>
                                        : <>{shoppingDeltaMeta.itemsRemoved} ítem{shoppingDeltaMeta.itemsRemoved > 1 ? 's' : ''} de la lista ya en tu Nevera</>}
                                </span>
                            </span>
                        )}

                        {/* [P2-NEVERA-COMPLETION-REMOVED · 2026-07-06] Eliminado el panel "Para
                            completar tu Nevera" (P1-RENEWAL-PANTRY-AWARE Fase 3): decisión del
                            owner — redundante ("es obvio que faltan alimentos": la lista de
                            compras YA es exactamente eso) y ocupaba demasiado espacio del hero
                            con 30+ chips. El campo backend `pantry_completion_list` sigue
                            llegando en el recalc y se ignora (knob backend intacto por si se
                            revisita como tooltip/contador compacto). */}

                        {/* [P2-SHOPLIST-PANEL-REMOVED · 2026-07-06] Panel "Lista de compras
                            por pasillo" eliminado (decisión del owner: el detalle vive en el
                            PDF). El total "esta ida al súper" se integró al banner de
                            presupuesto de abajo — la línea suelta se veía huérfana. */}
                        {/* [P1-BUDGET-RECONCILE · 2026-07-02] Estado honesto del presupuesto: costo real
                            del ciclo (SSOT backend) vs el presupuesto del formulario. dentro=verde,
                            cerca=ámbar, excedido=rojo + sustituciones/sugerencias de ahorro. */}
                        {(() => {
                            const _br = planData?.budget_reconciliation;
                            // [P3-BUDGET-BANNER-POST-RESTOCK · 2026-07-06] Con la compra YA hecha
                            // ("Ya compré la lista" → Nevera cubre la lista), el banner de
                            // presupuesto cumplió su trabajo (guiar la compra) y es ruido
                            // post-hoc — se oculta solo (pedido del owner). Misma señal que el
                            // RestockNudge; el render condicional colapsa el layout sin hueco.
                            // Reaparece al renovar el ciclo (is_restocked se resetea con el plan).
                            const _restockedNow = !!planData?.is_restocked || sessionRestocked;
                            // [P3-BUDGET-BANNER-DISMISS · 2026-07-04] respetar la X (recordada
                            // por plan+status; ver dismissBudgetBanner).
                            if (!_br || !_br.status || _br.status === 'sin_limite' || !_br.reference_rd
                                || budgetBannerHidden || _restockedNow
                                || isPlanExpired || planFinished || isPlanCorrupted) return null;
                            const _fmtRD = (v) => `RD$${Math.round(v || 0).toLocaleString('es-DO')}`;
                            const _palette = _br.status === 'dentro'
                                ? { icon: '✓', bg: isDark ? 'rgba(16,185,129,0.10)' : '#ECFDF5', border: isDark ? 'rgba(52,211,153,0.35)' : '#A7F3D0', fg: isDark ? '#6EE7B7' : '#065F46' }
                                : _br.status === 'cerca'
                                    ? { icon: '≈', bg: isDark ? 'rgba(245,158,11,0.10)' : '#FFFBEB', border: isDark ? 'rgba(251,191,36,0.35)' : '#FDE68A', fg: isDark ? '#FCD34D' : '#92400E' }
                                    : { icon: '▲', bg: isDark ? 'rgba(244,63,94,0.10)' : '#FEF2F2', border: isDark ? 'rgba(251,113,133,0.35)' : '#FECACA', fg: isDark ? '#FDA4AF' : '#991B1B' };
                            // [P2-AUDIT-V6-BATCH · 2026-07-03] (P2-I) para tiers categóricos (low/medium/high)
                            // el RD$Y es piso×banda — un número que el usuario NUNCA declaró. Etiquetarlo
                            // "referencia estimada" evita que se lea como un techo que él puso. Custom = su monto.
                            const _refIsEstimated = _br.basis && _br.basis !== 'custom';
                            const _refLabel = `${_fmtRD(_br.reference_rd)}${_refIsEstimated ? ' (referencia estimada)' : ''}`;
                            const _headline = _br.status === 'dentro'
                                ? `Dentro de tu presupuesto: ${_fmtRD(_br.estimated_cycle_rd)} de ${_refLabel} por ciclo`
                                : _br.status === 'cerca'
                                    ? `Al límite de tu presupuesto: ${_fmtRD(_br.estimated_cycle_rd)} de ${_refLabel} por ciclo`
                                    : `Tu lista supera tu presupuesto por ${_fmtRD(Math.max(0, _br.delta_rd || 0))} (${_fmtRD(_br.estimated_cycle_rd)} de ${_refLabel})`;
                            const _subs = Array.isArray(_br.substitutions) ? _br.substitutions.slice(0, 3) : [];
                            const _sugs = Array.isArray(_br.suggestions) ? _br.suggestions.slice(0, 3) : [];
                            return (
                                <div role="status" style={{
                                    marginTop: '0.75rem', padding: '0.65rem 0.85rem',
                                    background: _palette.bg, border: `1px solid ${_palette.border}`,
                                    borderRadius: '0.75rem',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem' }}>
                                        <span aria-hidden="true" style={{ fontWeight: 800, color: _palette.fg }}>{_palette.icon}</span>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: _palette.fg, flex: 1, minWidth: 0 }}>{_headline}</span>
                                        {/* [P3-BUDGET-BANNER-DISMISS · 2026-07-04] X → archiva en
                                            notificaciones (mismo patrón del banner de coherencia). */}
                                        <button
                                            type="button"
                                            onClick={dismissBudgetBanner}
                                            aria-label="Ocultar este aviso (se guarda en notificaciones)"
                                            title="Ocultar (se guarda en notificaciones)"
                                            style={{
                                                flexShrink: 0,
                                                display: 'grid',
                                                placeItems: 'center',
                                                width: 24,
                                                height: 24,
                                                marginTop: '-2px',
                                                border: 'none',
                                                borderRadius: '0.5rem',
                                                background: 'transparent',
                                                color: _palette.fg,
                                                opacity: 0.7,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <X size={15} strokeWidth={2.5} />
                                        </button>
                                    </div>
                                    {/* [P2-AUDIT-V5-BATCH GAP-06] Caveat de cobertura parcial de precios:
                                        el backend marca partial_pricing cuando pocos ítems tienen precio —
                                        el total mostrado subestima, así que bajamos la certeza del verde. */}
                                    {_br.partial_pricing && (
                                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                            Estimado parcial: {Math.round((_br.price_coverage || 0) * 100)}% de los ítems tienen precio — el total real puede ser mayor.
                                        </p>
                                    )}
                                    {_br.adjusted && _subs.length > 0 && (
                                        <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                            Para cuidar tu bolsillo ajustamos: {_subs.join(' · ')}
                                        </p>
                                    )}
                                    {_br.status === 'excedido' && _sugs.length > 0 && (
                                        <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                            {_sugs.map((s, i) => (
                                                <li key={i}>{typeof s === 'string' ? s : (s && s.text) || ''}</li>
                                            ))}
                                        </ul>
                                    )}
                                    {/* [P2-SHOPLIST-PANEL-REMOVED] total de ESTA ida (frescos 1
                                        semana + despensa) — convive con el total del CICLO de
                                        arriba; se actualiza en vivo al cambiar marcas/duración. */}
                                    {(() => {
                                        const _trItems = (planData?.aggregated_shopping_list || []).filter((it) => it && typeof it === 'object');
                                        if (!_trItems.length) return null;
                                        let _tripCost = 0;
                                        _trItems.forEach((it) => {
                                            const c = it?.estimated_cost_rd ?? it?.estimated_cost;
                                            if (typeof c === 'number' && c > 0) _tripCost += c;
                                        });
                                        if (_tripCost <= 0) return null;
                                        return (
                                            <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                                Esta ida al súper: <strong style={{ color: _palette.fg }}>{_fmtRD(_tripCost)}</strong> · {_trItems.length} ítems — el detalle está en el PDF.
                                            </p>
                                        );
                                    })()}
                                </div>
                            );
                        })()}

                        {/* [P1-SUPERMARKET-MATCH · 2026-07-02] Marcas y precios reales del súper
                            por ítem de la lista (base Supermercado RD). Informativo — no toca
                            plan_data ni el costeo; persistencia de marca preferida = fase 2. */}
                        {brandsPanelList.length > 0
                            && !isPlanExpired && !planFinished && !isPlanCorrupted && (
                            <SupermarketBrands
                                // [P2-BRANDS-CANONICAL-SOURCE] canónica semanal — el panel de
                                // marcas vive aunque ya hayas comprado todo el ciclo.
                                shoppingList={brandsPanelList}
                                // [P2-BRANDS-OPTIMISTIC · 2026-07-07] Update en TIEMPO REAL: al elegir
                                // la marca parcheamos la lista mostrada al instante (marca + precio si el
                                // envase coincide) + toast breve de éxito. Antes esto solo mostraba un
                                // toast "Aplicando…" que quedaba girando 15-40s (recalc + cola) con la
                                // lista aún en "Genérico" — se sentía roto. `variant` null = deselección.
                                onPrefPending={(foodKey, variant) => {
                                    if (!variant) {
                                        toast.success('Marca quitada — actualizando tu lista…', { id: 'brand-apply', duration: 2200, position: 'top-center' });
                                        return;
                                    }
                                    // Optimista: si el ítem matchea, se reconstruye al instante (marca +
                                    // conteo + precio). Si no matchea (nombre raro), el recalc de fondo
                                    // lo aplica igual — feedback honesto "aplicando…".
                                    const patched = applyBrandToPlanOptimistic(planData, foodKey, variant);
                                    if (patched) {
                                        setPlanData(patched);
                                        toast.success('Marca aplicada a tu lista', { id: 'brand-apply', duration: 2200, position: 'top-center' });
                                    } else {
                                        toast.success('Aplicando tu marca a la lista…', { id: 'brand-apply', duration: 3500, position: 'top-center' });
                                    }
                                }}
                                // [P2-BRANDS-APPLY-IMMEDIATE · 2026-07-02 · reconcile silencioso 2026-07-07]
                                // El recalc canónico corre en SEGUNDO PLANO para reconciliar el costo exacto
                                // (overlay P1-SUPERMARKET-COSTING) — el usuario ya vio el update optimista, así
                                // que NO mostramos spinner ni error toast que lo tape. Si falla, el update
                                // optimista se mantiene (marca visible) y la pref quedó guardada server-side.
                                onPrefApplied={async () => {
                                    if (!userProfile?.id || !planData?.id) return;
                                    const _applyOnce = async () => {
                                        const r = await fetchWithAuth(`${API_BASE}/api/plans/recalculate-shopping-list`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                user_id: userProfile.id,
                                                plan_id: planData.id,
                                                householdSize: formData?.householdSize || planData.calc_household_size || 1,
                                                groceryDuration: planData.calc_grocery_duration || formData?.groceryDuration || 'weekly',
                                                preserve_restock: true,
                                            }),
                                        });
                                        if (!r.ok) return null;
                                        return r.json().catch(() => null);
                                    };
                                    try {
                                        await withRecalcLock(async () => {
                                            let result = await _applyOnce();
                                            if (!result?.success || !result.plan_data) {
                                                await new Promise((res) => setTimeout(res, 2000));
                                                result = await _applyOnce();
                                            }
                                            if (result?.success && result.plan_data) {
                                                // Reconcilia con el costeo autoritativo (marca + costo exacto).
                                                setPlanData(result.plan_data);
                                                safeLocalStorageSet('mealfit_plan', JSON.stringify(result.plan_data));
                                            }
                                            // Fallo: dejamos el update optimista (marca visible); la pref
                                            // quedó guardada y el próximo recalc/recarga aplica el costo exacto.
                                        });
                                    } catch (e) {
                                        console.error('[P2-BRANDS-APPLY-IMMEDIATE] recalc de reconcile falló (optimista se mantiene):', e);
                                    }
                                }}
                            />
                        )}


                    </div>
                </div>
            </header>

            {/* [P1-GUEST-MODE · 2026-06-15] Banner de conversión para invitados:
                el plan que ven es de muestra (efímero, 3 días). Invitarlos a crear
                cuenta para guardarlo, desbloquear la semana completa y registrar
                comidas. Solo en modo invitado. */}
            {isGuest && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.85rem',
                        background: isDark
                            ? 'linear-gradient(135deg, rgba(99,102,241,0.14) 0%, rgba(16,185,129,0.12) 100%)'
                            : 'linear-gradient(135deg, #EEF2FF 0%, #ECFDF5 100%)',
                        border: isDark ? '1px solid rgba(129,140,248,0.35)' : '1.5px solid #C7D2FE',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        marginBottom: '1.5rem',
                        boxShadow: isDark ? '0 4px 12px -2px rgba(0,0,0,0.5)' : '0 4px 12px -2px rgba(99,102,241,0.12)',
                        flexWrap: 'wrap'
                    }}
                    role="region"
                    aria-label="Modo invitado"
                >
                    <div style={{ flex: 1, minWidth: '220px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem', display: 'block', marginBottom: '0.15rem' }}>
                            Estás en modo invitado
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Este es un plan de muestra. Crea tu cuenta gratis para guardarlo, desbloquear la semana completa y registrar tus comidas.
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate('/register')}
                        style={{
                            flexShrink: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            background: 'linear-gradient(135deg, #4F46E5 0%, #10B981 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.75rem',
                            padding: '0.6rem 1.1rem',
                            fontWeight: 700,
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            boxShadow: '0 6px 16px -4px rgba(79,70,229,0.45)'
                        }}
                    >
                        Crear cuenta gratis
                        <ArrowRight size={16} />
                    </button>
                </motion.div>
            )}

            {/* [P3-PLAN-CORRUPTED-BANNER · 2026-05-27] Banner persistente para
                planes que quedaron en estado inválido. Va PRIMERO (antes que
                expired/quality_degraded) porque corrupción bloquea TODAS las
                acciones derivadas: PDF empty, swap meals null, recipes vacías.
                CTA directo a /assessment evita que el usuario pegue comandos
                en console o llame soporte. */}
            {isPlanCorrupted && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        // [APPEARANCE-THEME · 2026-05-31] Colores semánticos del
                        // theme (light/dark) en vez de hardcodear rosa claro —
                        // pre-fix el banner salía como un bloque rosa brillante
                        // chocante sobre el fondo oscuro. `--danger-*` se re-mapea
                        // en html[data-theme="dark"] (bg #2A1517, texto #FCA5A5).
                        background: 'var(--danger-bg)',
                        border: '1.5px solid var(--danger-border)',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        marginBottom: '1.5rem',
                        boxShadow: 'var(--shadow-md)',
                        flexWrap: 'wrap'
                    }}
                    role="alert"
                    aria-live="assertive"
                >
                    <AlertCircle size={22} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--danger-text)', fontSize: '0.95rem', display: 'block', marginBottom: '0.15rem' }}>
                            Tu plan quedó incompleto
                        </span>
                        <span style={{ color: 'var(--danger-text)', fontSize: '0.85rem' }}>
                            La generación no terminó correctamente — no hay menú ni lista de compras disponibles. Genera un plan nuevo para continuar.
                        </span>
                    </div>
                    <button
                        onClick={() => {
                            try {
                                localStorage.removeItem('mealfit_plan');
                                localStorage.removeItem('mealfit_plan_id');
                            } catch (_lsErr) { /* best-effort */ }
                            navigate('/assessment');
                        }}
                        // [CTA-HOVER-GLOW · 2026-05-31] box-shadow en .mf-danger-cta
                        // (index.css) para que :hover lo intensifique (lift + glow rojo
                        // + brillo). El gradiente rojo sigue inline.
                        className="mf-danger-cta"
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
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <RefreshCw size={16} />
                        Generar Nuevo Plan
                    </button>
                </motion.div>
            )}

            {/* [P3-RESTOCK-NUDGE · 2026-06-23] Banner + prompt + auto-fill de respaldo
                para que el usuario llene la Nevera tras comprar (cierra el olvido de
                tocar "Ya compré la lista"). Solo en planes válidos con compras
                pendientes. La lógica de cuándo mostrar cada capa vive en
                utils/restockNudge.js; el restock real reusa handleRestock (SSOT). */}
            <RestockNudge
                planData={planData}
                hasPendingItems={hasPendingShoppingItems && !isPlanExpired && !planFinished && !isPlanCorrupted}
                restocked={!!planData?.is_restocked || sessionRestocked}
                daysSinceGroceryStart={daysSinceCreation}
                onConfirmRestock={() => handleRestock()}
                onSilentRestock={() => handleRestock({ silent: true })}
            />

            {/* --- BANNER: PLAN EXPIRADO --- */}
            {isPlanExpired && planData?.generation_status !== 'partial' && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        // [APPEARANCE-THEME · 2026-05-31] Theme-aware (light/dark);
                        // ver banner de plan corrupto arriba. Mismo `--danger-*`.
                        background: 'var(--danger-bg)',
                        border: '1.5px solid var(--danger-border)',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        marginBottom: '1.5rem',
                        boxShadow: 'var(--shadow-md)',
                        flexWrap: 'wrap'
                    }}
                >
                    <AlertCircle size={22} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--danger-text)', fontSize: '0.95rem', display: 'block', marginBottom: '0.15rem' }}>
                            ¡Tu ciclo ha terminado!
                        </span>
                        <span style={{ color: 'var(--danger-text)', fontSize: '0.85rem' }}>
                            Ya han pasado los días programados en tu plan actual. Genera uno nuevo para seguir recibiendo deliciosas recomendaciones y listas de compras frescas.
                        </span>
                    </div>
                    <button
                        onClick={() => navigate('/assessment')}
                        // [CTA-HOVER-GLOW · 2026-05-31] box-shadow en .mf-danger-cta
                        // (index.css) para que :hover lo intensifique (lift + glow rojo
                        // + brillo). El gradiente rojo sigue inline.
                        className="mf-danger-cta"
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

            {/* [P2-PRO-REVIEW-SURFACE · 2026-06-15] Banner de revisión profesional. El backend YA computa
                `requires_professional_review` (flag + note + renal_gate) en la capa clínica (FS9 / red de
                seguridad renal) cuando el usuario declara una condición médica, PERO ningún surface lo
                leía → el paciente (especialmente renal) nunca veía la advertencia de consultar a su
                profesional. Aquí se muestra prominente; estilo rojo si es gate renal (mayor riesgo
                iatrogénico), azul para el resto de condiciones. Cierra P2-7/P2-15 del audit. */}
            {planData?.requires_professional_review?.flag && planData?.requires_professional_review?.note && !proReviewHidden && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        // [P2-PRO-REVIEW-DARKMODE · 2026-06-27] Tints rgba (no gradientes claros hardcodeados) +
                        // texto var(--text-*) → legible en claro Y oscuro. El acento semántico (azul/rojo) lo da
                        // el ícono + borde + tint, no el color del texto (que antes quedaba ilegible en oscuro).
                        background: planData.requires_professional_review.renal_gate
                            ? 'rgba(239, 68, 68, 0.12)'
                            : 'rgba(59, 130, 246, 0.12)',
                        border: planData.requires_professional_review.renal_gate
                            ? '1.5px solid rgba(239, 68, 68, 0.45)'
                            : '1.5px solid rgba(59, 130, 246, 0.45)',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        marginBottom: '1.5rem',
                        boxShadow: '0 4px 12px -2px rgba(0,0,0,0.12)',
                        flexWrap: 'wrap'
                    }}
                    role="alert"
                    aria-live="polite"
                >
                    <AlertCircle
                        size={22}
                        color={planData.requires_professional_review.renal_gate ? '#EF4444' : '#3B82F6'}
                        style={{ flexShrink: 0, marginTop: '2px' }}
                    />
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <span style={{
                            fontWeight: 700,
                            color: 'var(--text-main)',
                            fontSize: '0.95rem', display: 'block', marginBottom: '0.25rem'
                        }}>
                            {planData.requires_professional_review.renal_gate
                                ? 'Condición renal — este plan requiere supervisión de tu nefrólogo'
                                : 'Declaraste una condición de salud — consulta a tu profesional'}
                        </span>
                        <span style={{
                            color: 'var(--text-main)', opacity: 0.85,
                            fontSize: '0.85rem', whiteSpace: 'pre-line'
                        }}>
                            {/* [P2-PRO-REVIEW-ICON-CLEANUP · 2026-06-27] El AlertCircle ya es el ícono del banner;
                                quitamos el emoji ⚕️/🫘 redundante del inicio de la nota (strip de no-letras inicial). */}
                            {String(planData.requires_professional_review.note || '').replace(/^[^\p{L}]+/u, '')}
                        </span>
                    </div>
                    {/* [P2-PRO-REVIEW-DISMISS · 2026-06-27] X para ocultar el aviso (persistido por plan). */}
                    <button
                        type="button"
                        onClick={dismissProReview}
                        aria-label="Ocultar aviso de revisión profesional"
                        title="Ocultar"
                        style={{
                            flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer',
                            padding: '4px', margin: '-2px -4px 0 0', borderRadius: '8px',
                            color: 'var(--text-muted)', lineHeight: 0
                        }}
                    >
                        <X size={18} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                </motion.div>
            )}

            {/* [P2-MICRONUTRIENT-SURFACE · 2026-06-15] Panel de micronutrientes a vigilar + suplementación.
                El backend YA computa `micronutrient_report` (FS4: vit D/hierro/calcio/B12/potasio/Mg +
                techos de sodio/azúcar/satfat vs DRI/WHO) y `micronutrient_supplement_advice` (FS8), pero
                ningún surface los leía → trabajo clínico invisible. Solo se muestra si hay gaps/suplementos
                accionables (no ruido en el happy path). Cierra P2-6 del audit. */}
            {/* [P1-MICRO-FOCO-PANEL · 2026-06-26] Panel "Foco" unificado: jerarquía
                (lo que falta primero, con sugerencia accionable inline), lo cumplido
                como chips, y los límites aparte. Consolida el antiguo medidor (todos
                los micros) + el panel de gaps/suplementos en uno solo — la sugerencia
                clínica (advice.items: alimentos + dosis) va dentro de cada tarjeta
                "por mejorar". Tocar una tarjeta → preguntarle al coach cómo subirla.
                Lee report.panel[] (17 nutrientes). No dismissible (panel de estado). */}
            {microReport?.panel?.length > 0 && (
                <MicronutrientMeter
                    report={microReport}
                    advice={microAdvice}
                    onAsk={(question) => {
                        // [P3-AGENT-PREFILL · 2026-06-15] El chat es solo para
                        // cuentas (el invitado no accede a /dashboard/agent). Para
                        // invitados, convertir el tap en gancho de registro.
                        if (isGuest) {
                            toast('Crea tu cuenta para hablar con tu coach IA', {
                                description: 'Te dirá exactamente cómo mejorar cada micronutriente de tu plan.',
                            });
                            navigate('/register');
                            return;
                        }
                        requestAgentPrefill(question);
                        navigate('/dashboard/agent');
                    }}
                />
            )}

            {/* [P1-LOW-SIGNAL-FALLBACK · 2026-05-21] Banner cuando la IA agotó los
                3 intentos sin lograr un plan que aprobara el revisor. El plan se
                entrega igual (mejor versión disponible) pero el usuario debe
                saber que el sistema "se rindió" y que puede usar Cambiar Plato
                para iterar manualmente. Flag viene de `plan_data._quality_degraded`
                seteado en `should_retry` cuando `attempt >= MAX_ATTEMPTS=3`. */}
            {planData?._quality_degraded && !qDegradedHidden && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.6rem',
                        background: isDark
                            ? 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(217,119,6,0.16) 100%)'
                            : 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                        border: isDark ? '1px solid rgba(251,191,36,0.32)' : '1.5px solid #FCD34D',
                        borderRadius: '0.85rem',
                        padding: '0.7rem 0.85rem',
                        marginBottom: '1.1rem',
                        boxShadow: isDark ? '0 4px 12px -2px rgba(0,0,0,0.5)' : '0 4px 12px -2px rgba(217,119,6,0.15)'
                    }}
                    role="status"
                    aria-live="polite"
                >
                    <AlertCircle size={17} color={isDark ? '#FBBF24' : '#D97706'} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: isDark ? '#FDE68A' : '#92400E', fontSize: '0.82rem', display: 'block', marginBottom: '0.1rem' }}>
                            {/* [P3-ATTEMPTS-SINGULAR · 2026-07-04] "tras 1 intentos" era visible
                                desde que MAX_ATTEMPTS puede entregar al primer intento. */}
                            La IA no logró un plan óptimo tras {planData?._quality_degraded_attempts || 3} intento{(planData?._quality_degraded_attempts || 3) === 1 ? '' : 's'}
                        </span>
                        <span style={{ color: isDark ? '#FCD34D' : '#B45309', fontSize: '0.76rem', lineHeight: 1.4 }}>
                            Te entregamos la mejor versión. Usa <strong>Cambiar Plato</strong> para reemplazar comidas o regenera el plan completo.
                        </span>
                        {/* [G10-QUALITY-DEGRADED-SURFACE · 2026-05-29] Surface de
                            _quality_degraded_reason / _quality_degraded_severity, escritos por
                            _mark_plan_result_quality_degraded en backend pero antes sin lector
                            (dead-write UI). Ahora el usuario ve POR QUÉ se degradó. */}
                        {planData?._quality_degraded_reason && (
                            <span style={{ color: isDark ? '#FCD34D' : '#92400E', fontSize: '0.72rem', display: 'block', marginTop: '0.3rem', opacity: isDark ? 0.85 : 0.85 }}>
                                {(() => {
                                    // [P3-NOTIF-CENTER · 2026-06-16] Mapa elevado a módulo (Q_DEGRADED_REASON_MAP).
                                    const _label = Q_DEGRADED_REASON_MAP[planData._quality_degraded_reason] || 'Calidad por debajo del óptimo.';
                                    const _sev = planData?._quality_degraded_severity === 'high' ? 'Importante' : 'Menor';
                                    return <>Motivo ({_sev}): {_label}</>;
                                })()}
                            </span>
                        )}
                        {/* [P2-AUDIT-V7-BATCH · 2026-07-04] (P2-9) CTA diferenciado cuando el backend
                            atribuyó el degradado a la Nevera (_quality_degraded_pantry_limited,
                            P1-PANTRY-DEGRADED-SIGNAL): los closers/motor se auto-revirtieron porque el
                            modo estricto no puede "comprar más". Antes la señal se persistía sin lector
                            → el usuario veía el banner genérico sin saber que la palanca es surtir su
                            Nevera. */}
                        {planData?._quality_degraded_pantry_limited && (
                            <span style={{ display: 'block', marginTop: '0.4rem' }}>
                                <span style={{ color: isDark ? '#FCD34D' : '#92400E', fontSize: '0.72rem', display: 'block', marginBottom: '0.3rem' }}>
                                    Este ajuste quedó limitado por tu <strong>Nevera</strong>: cocinamos solo con lo que tienes y no alcanzó para clavar los macros.
                                </span>
                                <button
                                    type="button"
                                    onClick={() => navigate('/dashboard/pantry')}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        padding: '0.32rem 0.6rem',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        background: isDark ? 'rgba(251,191,36,0.18)' : '#FDE68A',
                                        color: isDark ? '#FDE68A' : '#92400E'
                                    }}
                                >
                                    Agregar ítems a mi Nevera →
                                </button>
                            </span>
                        )}
                    </div>
                    {/* [P3-QDEGRADED-DISMISS · 2026-06-15] Cerrar (recordado por plan). */}
                    <button
                        type="button"
                        onClick={dismissQDegraded}
                        aria-label="Ocultar este aviso"
                        title="Ocultar"
                        style={{
                            flexShrink: 0,
                            display: 'grid',
                            placeItems: 'center',
                            width: 24,
                            height: 24,
                            marginTop: '-1px',
                            border: 'none',
                            borderRadius: '0.5rem',
                            background: 'transparent',
                            color: isDark ? '#FCD34D' : '#B45309',
                            opacity: 0.7,
                            cursor: 'pointer'
                        }}
                    >
                        <X size={15} strokeWidth={2.5} />
                    </button>
                </motion.div>
            )}

            {/* [P1-SWAP-COHERENCE-ESCALATE · 2026-05-22] Banner cuando un
                swap interno (assemble_plan_node swap-to-best) dejó divergencias
                severas entre recetas y lista de compras (cap_swallowed_modifier
                o magnitud >30% off). Pre-fix: cron diario P3-B alertaba 6-24h
                después; el usuario veía la inconsistencia sin contexto. Ahora
                el plan_data trae inline `_swap_coherence_warnings` y el
                Dashboard lo renderea en el primer paint del plan entregado. */}
            {planData?._swap_coherence_warnings?.critical_count > 0 && !coherenceHidden && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        background: isDark
                            ? 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(217,119,6,0.16) 100%)'
                            : 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                        border: isDark ? '1px solid rgba(251,191,36,0.32)' : '1.5px solid #FCD34D',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        marginBottom: '1.5rem',
                        boxShadow: isDark ? '0 4px 12px -2px rgba(0,0,0,0.5)' : '0 4px 12px -2px rgba(217,119,6,0.15)',
                        flexWrap: 'wrap'
                    }}
                    role="status"
                    aria-live="polite"
                >
                    <AlertCircle size={22} color={isDark ? '#FBBF24' : '#D97706'} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <span style={{ fontWeight: 700, color: isDark ? '#FDE68A' : '#92400E', fontSize: '0.95rem', display: 'block', marginBottom: '0.15rem' }}>
                            Revisa tu lista de compras
                        </span>
                        <span style={{ color: isDark ? '#FCD34D' : '#B45309', fontSize: '0.85rem', lineHeight: 1.4 }}>
                            Algunas recetas mencionan ingredientes que no quedaron bien reflejados en tu lista ({planData._swap_coherence_warnings.critical_count} {planData._swap_coherence_warnings.critical_count === 1 ? 'detalle' : 'detalles'}). Usa <strong>Cambiar Plato</strong> en las comidas que te parezcan inconsistentes.
                        </span>
                    </div>
                    {/* [P1-COHERENCE-BANNER-NOTIF · 2026-06-16] Cerrar → archiva el
                        aviso en el centro de notificaciones y lo abre. */}
                    <button
                        type="button"
                        onClick={dismissCoherence}
                        aria-label="Ocultar y enviar a notificaciones"
                        title="Ocultar (se guarda en notificaciones)"
                        style={{
                            flexShrink: 0,
                            display: 'grid',
                            placeItems: 'center',
                            width: 26,
                            height: 26,
                            marginTop: '-1px',
                            border: 'none',
                            borderRadius: '0.5rem',
                            background: 'transparent',
                            color: isDark ? '#FCD34D' : '#B45309',
                            opacity: 0.75,
                            cursor: 'pointer'
                        }}
                    >
                        <X size={16} strokeWidth={2.5} />
                    </button>
                </motion.div>
            )}

            {/* --- DAILY TRACKER UI (incluye objetivo + progreso fusionados) --- */}
            <TrackingProgress
                planData={planData}
                userId={session?.user?.id || userProfile?.id || 'guest'}
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
            {isMobileViewport && <WaterTracker userId={session?.user?.id || userProfile?.id || 'guest'} />}

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

                    {/* [silent-bg · 2026-05-29] La píldora de progreso "Analizando tus
                        preferencias…" se removió por decisión de producto: la generación de
                        los próximos bloques en background es silenciosa (ver banner removido
                        arriba) y el texto genérico confundía — sonaba a que tocaba el menú
                        que ya estás viendo. No re-añadir un indicador de background sin copy
                        claro ("Preparando tus próximos días…") + estilos de modo oscuro
                        reales (el original usaba variables CSS inexistentes → píldora clara
                        sobre el cuaderno oscuro). El backend sigue exponiendo el hint en
                        /chunk-status; simplemente ya no se renderiza. */}

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
                                            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                                            {/* [P3-DASH-WINDOW-ANIM · 2026-05-29] AnimatePresence +
                                                motion.button: al finalizar un día, el tab sale con
                                                fade/scale y los demás se reacomodan (layout) en vez de
                                                saltar. initial={false} evita animar el primer paint. */}
                                            <AnimatePresence initial={false}>
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
                                                    <motion.button
                                                        key={globalIdx}
                                                        layout={tabsSettled ? 'position' : false}
                                                        initial={{ opacity: 0, scale: 0.85 }}
                                                        animate={{ opacity: (isPastDay && !isActive) ? 0.55 : 1, scale: 1, y: isActive ? -2 : 0 }}
                                                        exit={{ opacity: 0, scale: 0.8 }}
                                                        transition={{ duration: tabsSettled ? 0.2 : 0, ease: 'easeOut' }}
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
                                                            // [P3-DASH-WINDOW-ANIM] opacity/scale/y los maneja framer
                                                            // (initial/animate/exit). Aquí solo transicionamos color y
                                                            // sombra para no pelear con los transforms de framer.
                                                            transition: 'background 0.2s, color 0.2s, box-shadow 0.2s, border-color 0.2s',
                                                            border: isActive ? 'none'
                                                                : isPastDay ? '1px solid var(--border)'
                                                                : isDegraded ? '1px dashed #F59E0B'
                                                                : '1px solid var(--border)',
                                                            background: isActive
                                                                ? (isDark ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)')
                                                                : isPastDay ? 'var(--bg-muted)' : 'var(--bg-card)',
                                                            color: isActive ? 'white'
                                                                : isPastDay ? 'var(--text-light)'
                                                                : isDegraded ? '#B45309' : 'var(--text-muted)',
                                                            boxShadow: isActive ? (isDark ? '0 4px 10px -3px rgba(37, 99, 235, 0.35)' : '0 10px 15px -3px rgba(59, 130, 246, 0.3)') : '0 1px 2px rgba(0,0,0,0.05)',
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
                                                    </motion.button>
                                                );
                                            })}
                                            </AnimatePresence>

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
                                                // [P1-GUEST-MODE · 2026-06-15] En modo invitado NO hay
                                                // chunking en background (plan efímero capado a 3 días),
                                                // así que los slots "en camino" nunca resolverían y solo
                                                // mienten. Mostrar SOLO los días disponibles. El gancho
                                                // de la semana completa se comunica con el CTA de crear
                                                // cuenta más abajo, no con un spinner colgado.
                                                if (isGuest) return null;
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
                                                        _border = '1px dashed var(--border)';
                                                        _background = 'linear-gradient(90deg, var(--bg-muted) 0%, var(--border) 50%, var(--bg-muted) 100%)';
                                                        _backgroundSize = '200% 100%';
                                                        _animation = 'skeleton-shimmer 1.4s ease-in-out infinite';
                                                        _color = 'var(--text-light)';
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
                            // [P2-SWAP-INDEX-COUPLING · 2026-05-30] Mapeamos sobre
                            // `currentDayMeals` SIN filtrar y saltamos los suplementos
                            // con `return null`, de modo que `index` sea el índice REAL
                            // dentro de `planData.days[d].meals`. Pre-fix se mapeaba
                            // sobre el array FILTRADO → si un suplemento precediera a
                            // una comida (LLM mislabel; el backend tiene sanitizer para
                            // eso), `index` (filtrado) ≠ índice real, y ese index viaja
                            // sin cambios al swap optimista (AssessmentContext) y al
                            // `meal_index` del jsonb_set backend → el swap sobrescribía
                            // OTRA comida. Inalcanzable hoy (0 suplementos en .meals en
                            // prod) pero blindaje del acoplamiento UI↔write↔backend.
                            const _isSupplementEntry = (m) => m.meal?.toLowerCase().includes('suplemento');
                            const displayMeals = currentDayMeals.filter(m => !_isSupplementEntry(m));

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

                            return currentDayMeals.map((meal, index) => {
                                if (_isSupplementEntry(meal)) return null;
                                const isLiked = meal.name ? !!likedMeals[meal.name] : false;

                                // [P1-MEAL-CARD-KEY · 2026-05-31] key por identidad
                                // natural (meal.name) en vez de index: evita que React
                                // reutilice nodos DOM con datos de otra comida si el orden
                                // cambia (swap/regeneración), preservando estado de
                                // like/foco/receta. Fallback a index si falta name.
                                return (
                                    <div key={meal.name || `meal-${index}`} className="meal-card">

                                        {/* Meal Info */}
                                        <div>
                                            <div style={{
                                                textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 800,
                                                color: 'var(--primary)', letterSpacing: '0.05em', marginBottom: '0.25rem'
                                            }}>
                                                {meal.meal}
                                            </div>

                                            {/* [DASH-MEAL-TITLE-GAP · 2026-06-01] marginBottom
                                                0.25rem → 0.5rem: el chip de tiempo ("10 min")
                                                quedaba pegado al título. */}
                                            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
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

                                            {/* [P3-MEAL-ADVISORY-INLINE · 2026-07-04] Fila ÚNICA de metadatos:
                                                tiempo + advisories como pills compactos en la MISMA línea. El
                                                bloque-caja anterior (P2-DISHQUAL-SURFACE-UPDATES) quedaba suelto
                                                entre el título y el chip de tiempo y deformaba la tarjeta
                                                (feedback directo del owner). Amber (≠ rojo del pantry-urgent);
                                                sigue informando sin bloquear. */}
                                            {(() => {
                                                const _advisories = getMealAdvisories(meal);
                                                if (!meal.prep_time && !_advisories.length) return null;
                                                return (
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                                                        gap: '0.4rem', marginBottom: '0.75rem',
                                                    }}>
                                                        {meal.prep_time && (
                                                            <div style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                                fontSize: '0.75rem',
                                                                // [APPEARANCE-THEME · 2026-05-29] En oscuro, el azul claro
                                                                // (#EFF6FF) se veía brilloso → tinte translúcido + texto claro.
                                                                color: isDark ? '#93C5FD' : '#2563EB',
                                                                background: isDark ? 'rgba(37, 99, 235, 0.16)' : '#EFF6FF',
                                                                padding: '4px 10px', borderRadius: '6px', fontWeight: 700,
                                                                border: isDark ? '1px solid rgba(96, 165, 250, 0.4)' : '1px solid #BFDBFE',
                                                                boxShadow: isDark ? 'none' : '0 1px 2px rgba(37,99,235,0.05)'
                                                            }}>
                                                                <Clock size={13} strokeWidth={2.5} /> {meal.prep_time}
                                                            </div>
                                                        )}
                                                        {_advisories.map((a) => (
                                                            <div key={a.key} title={a.label} style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                                fontSize: '0.7rem', fontWeight: 600,
                                                                color: isDark ? '#FCD34D' : '#B45309',
                                                                background: isDark ? 'rgba(245, 158, 11, 0.14)' : 'rgba(245, 158, 11, 0.1)',
                                                                padding: '4px 10px', borderRadius: '6px',
                                                                border: isDark ? '1px solid rgba(252, 211, 77, 0.3)' : '1px solid rgba(245, 158, 11, 0.25)',
                                                            }}>
                                                                <AlertCircle size={12} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                                                                <span>{a.label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })()}

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
                                                    className="meal-act-btn"
                                                    onClick={() => {
                                                        // [P3-GUEST-GATE-MEAL-ACTIONS · 2026-06-21] Invitado: ver recetas requiere cuenta.
                                                        if (isGuest) { toast('Crea tu cuenta para ver las recetas paso a paso'); return; }
                                                        navigate('/dashboard/recipes');
                                                    }}
                                                    style={{
                                                        background: isDark ? 'rgba(59, 130, 246, 0.22)' : '#EFF6FF',
                                                        border: isDark ? '1.5px solid rgba(96, 165, 250, 0.6)' : '1.5px solid #BFDBFE',
                                                        borderRadius: '50%',
                                                        width: 44, height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    title="Ver paso a paso"
                                                >
                                                    <BookOpen size={20} color={isDark ? '#93C5FD' : '#3B82F6'} />
                                                </button>

                                                {/* REGENERATE BUTTON (AI SWAP) — Abre modal de razón */}
                                                <button
                                                    className="meal-act-btn"
                                                    onClick={() => {
                                                        // [P3-GUEST-GATE-MEAL-ACTIONS · 2026-06-21] Invitado: cambiar plato (IA) requiere cuenta.
                                                        if (isGuest) { toast('Crea tu cuenta para cambiar platos con IA'); return; }
                                                        if (regeneratingId === index || isDayUpdating) return;
                                                        // [2026-05-29] Abrir el modal al instante; validar cuota
                                                        // en paralelo y cerrar solo si no hay créditos (evita el
                                                        // delay del fetch en cache-miss).
                                                        const _swap = { dayIndex: activeDayIndex, mealIndex: index, mealType: meal.meal, mealName: meal.name };
                                                        setSwapModal(_swap);
                                                        validateCreditsAsync().then((hasCredits) => {
                                                            if (!hasCredits) setSwapModal(null);
                                                        });
                                                    }}
                                                    disabled={regeneratingId === index || isDayUpdating}
                                                    style={{
                                                        background: isDark ? 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)' : '#FFF7ED',
                                                        border: isDark ? '1.5px solid transparent' : '1.5px solid #FED7AA',
                                                        borderRadius: '1rem',
                                                        padding: '0 0.85rem',
                                                        height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                                        cursor: (regeneratingId === index || isDayUpdating) ? 'wait' : 'pointer',
                                                        transition: 'all 0.2s',
                                                        opacity: 1,
                                                        fontWeight: isDark ? 750 : 650,
                                                        fontSize: '0.8rem',
                                                        color: isDark ? '#FFFFFF' : '#EA580C',
                                                        boxShadow: isDark ? '0 2px 8px -3px rgba(234, 88, 12, 0.3)' : 'none'
                                                    }}
                                                    title="Cambiar con IA"
                                                >
                                                    <RefreshCw
                                                        size={18}
                                                        color={isDark ? '#FFFFFF' : '#EA580C'}
                                                        className={(regeneratingId === index || isDayUpdating) ? "spin-fast" : ""}
                                                    />
                                                    <span style={{ whiteSpace: 'nowrap' }}>Cambiar Plato</span>
                                                </button>

                                                {/* LIKE BUTTON */}
                                                <button
                                                    className="meal-act-btn"
                                                    onClick={() => {
                                                        // [P3-GUEST-GATE-MEAL-ACTIONS · 2026-06-21] Invitado: guardar favoritos requiere cuenta.
                                                        if (isGuest) { toast('Crea tu cuenta para guardar tus favoritos'); return; }
                                                        const currentlyLiked = !!likedMeals[meal.name];
                                                        toggleMealLike(meal.name, meal.meal);
                                                        if (!currentlyLiked) {
                                                            toast.success('¡Anotado!', { description: `Aprenderemos que te gusta: ${meal.name}`, icon: '❤️' });
                                                        } else {
                                                            toast('Like removido');
                                                        }
                                                    }}
                                                    style={{
                                                        // [LIKE-FILL · 2026-05-29] Estado "liked" = botón RELLENO
                                                        // con gradiente rosa sólido + corazón blanco + glow + leve
                                                        // pop (scale). Mucho más satisfactorio que el tinte sutil
                                                        // previo (rgba 0.22). El estado sin-marcar sigue como
                                                        // contorno para conservar la afordancia "toca para marcar"
                                                        // y la diferencia liked/unliked. El gradiente sólido lee
                                                        // bien en claro y oscuro → no necesita rama isDark.
                                                        background: isLiked
                                                            ? 'linear-gradient(135deg, #FB7185 0%, #EC4899 100%)'
                                                            : (isDark ? 'rgba(236, 72, 153, 0.20)' : '#FDF2F8'),
                                                        border: isLiked
                                                            ? '1.5px solid transparent'
                                                            : (isDark ? '1.5px solid rgba(244, 114, 182, 0.6)' : '1.5px solid #FBCFE8'),
                                                        borderRadius: '50%',
                                                        width: 44, height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        boxShadow: isLiked ? '0 4px 12px -2px rgba(244, 63, 94, 0.5)' : 'none',
                                                        transform: isLiked ? 'scale(1.06)' : 'scale(1)'
                                                    }}
                                                    title={isLiked ? 'Te gusta — toca para quitar' : 'Me gusta'}
                                                >
                                                    <Heart size={20} color={isLiked ? '#FFFFFF' : (isDark ? '#F472B6' : '#EC4899')} fill={isLiked ? '#FFFFFF' : 'none'} strokeWidth={2.25} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        })()}
                        {/* [P3-MEAL-CARD-STYLE-HOIST · 2026-06-01] UNA sola copia del
                            <style> (antes se inyectaba idéntico DENTRO de cada meal-card
                            → N nodos <style> duplicados por día, re-reconciliados en cada
                            swap/regen/cambio de día). Las reglas son por-clase
                            (.meal-act-btn / .spin-fast), así que una instancia cubre todos
                            los botones. Cero cambio visual. */}
                        <style>{`
                            .spin-fast { animation: spin 1s linear infinite; }
                            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                            /* [2026-05-29] Mismo hover que el botón PDF/Actualizar:
                               anillo interno nítido + brillo, en los 3 botones de
                               acción de cada comida (receta / Cambiar Plato / like). */
                            /* Anillo OSCURO en modo claro (sobre botones
                               claros el blanco no se veía / quedaba raro). */
                            .meal-act-btn:hover:not(:disabled) {
                                /* [MEAL-BTN-HOVER-NO-WHITE · 2026-06-01] Los
                                   fondos pastel (#EFF6FF/#FFF7ED/#FDF2F8) ya son
                                   casi blancos; brightness(1.04) los lavaba a
                                   blanco en hover. Ahora DEEPENAMOS (brillo<1) +
                                   saturamos → el color se intensifica en vez de
                                   blanquearse. Solo afecta el modo claro (la regla
                                   dark de abajo conserva su propio hover). */
                                filter: brightness(0.96) saturate(1.28);
                                box-shadow: inset 0 0 0 1.5px rgba(15, 23, 42, 0.35) !important;
                            }
                            /* Anillo blanco en modo oscuro. */
                            html[data-theme="dark"] .meal-act-btn:hover:not(:disabled) {
                                filter: brightness(1.08);
                                box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.45) !important;
                            }
                            .meal-act-btn:active:not(:disabled) {
                                filter: brightness(0.96);
                            }
                        `}</style>


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
                                        background: 'var(--bg-card)',
                                        borderRadius: '1rem',
                                        padding: '1rem 1.25rem',
                                        border: '1px solid rgba(139, 92, 246, 0.1)',
                                        display: 'flex', flexDirection: 'column', gap: '0.35rem'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>
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
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            Dosis: {supp.dose}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                            {supp.reason}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: INSIGHTS & INGREDIENTS */}
                {/* [DASH-RIGHTCOL-WIDER · 2026-06-22] flex 1 → 1.4: la columna de
                    Razonamiento/insights se veía muy angosta (~⅓) y el texto se
                    apilaba mucho. Sube a ~41% (meals queda ~59%, sigue cómodo). */}
                <div style={{ flex: 1.4, minWidth: 0, width: '100%' }}>

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
                    {!isMobileViewport && <WaterTracker userId={session?.user?.id || userProfile?.id || 'guest'} />}

                    {/* Insights Card */}
                    {/* [P1-REASONING-DISMISS · 2026-06-26] Dismissible: la X archiva el
                        panel en el centro de notificaciones (campana) y se puede volver a
                        mostrar desde ahí cuando el usuario quiera. Recordado por plan. */}
                    {!reasoningHidden && (
                    <div style={{
                        background: 'var(--bg-card)',
                        backdropFilter: 'blur(12px)',
                        padding: '1.75rem',
                        borderRadius: '2rem',
                        border: '1.5px solid var(--border)',
                        marginBottom: '2rem',
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08), 0 0 0 1px rgba(148, 163, 184, 0.05)'
                    }}>
                        <h3 style={{
                            fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)',
                            marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem'
                        }}>
                            <div style={{ background: isDark ? 'rgba(2, 132, 199, 0.16)' : '#F0F9FF', padding: '0.4rem', borderRadius: '0.75rem', color: isDark ? '#38BDF8' : '#0284C7' }}>
                                <Brain size={22} strokeWidth={2.5} />
                            </div>
                            Razonamiento
                            {planData?.insights?.length > 0 && (
                                <button
                                    type="button"
                                    onClick={dismissReasoning}
                                    aria-label="Ocultar el razonamiento (se guarda en Notificaciones)"
                                    title="Ocultar — se guarda en Notificaciones"
                                    style={{
                                        marginLeft: 'auto', width: '32px', height: '32px', flex: 'none',
                                        display: 'grid', placeItems: 'center', borderRadius: '10px',
                                        border: '1px solid var(--border)', background: 'transparent',
                                        color: 'var(--text-light)', cursor: 'pointer', transition: 'background .16s, color .16s'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-light)'; }}
                                >
                                    <X size={17} strokeWidth={2.4} />
                                </button>
                            )}
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
                                let color = "var(--text-main)";
                                let bgColor = "var(--bg-muted)";

                                if (insight.toLowerCase().includes('diagnóstico') || i === 0) {
                                    icon = <Lightbulb size={20} />;
                                    title = "Diagnóstico";
                                    // [APPEARANCE-THEME · 2026-05-29] En oscuro: icono violeta
                                    // más claro + chip tinte translúcido (en claro el pastel
                                    // #F5F3FF se veía brilloso).
                                    color = isDark ? "#A78BFA" : "#7C3AED"; // Violet
                                    bgColor = isDark ? "rgba(124, 58, 237, 0.18)" : "#F5F3FF";
                                }
                                if (insight.toLowerCase().includes('estrategia') || i === 1) {
                                    icon = <Wallet size={20} />;
                                    title = "Plan de Acción";
                                    color = isDark ? "#34D399" : "#059669"; // Emerald
                                    bgColor = isDark ? "rgba(5, 150, 105, 0.18)" : "#ECFDF5";
                                }
                                if (insight.toLowerCase().includes('chef') || i === 2) {
                                    icon = <Flame size={20} />;
                                    title = "Tip del Chef";
                                    // [APPEARANCE-THEME · 2026-05-29] bgColor era "#NFF2F7"
                                    // (hex inválido → chip transparente, la llama flotaba).
                                    // Ahora chip naranja como los otros dos (dark-aware).
                                    color = isDark ? "#FB923C" : "#EA580C"; // Orange
                                    bgColor = isDark ? "rgba(234, 88, 12, 0.16)" : "#FFF7ED";
                                }

                                // [P4-INSIGHT-SPLIT] slice(1).join(':') preserva el texto tras el 2º ':'
                                // (antes split(':')[1] truncaba "Razón: a: b" a " a", perdiendo ": b").
                                const cleanText = insight.includes(':') ? insight.split(':').slice(1).join(':').trim() : insight;

                                return (
                                    <div key={i} style={{
                                        display: 'flex', gap: '1rem',
                                        paddingBottom: i < planData.insights.length - 1 ? '1.25rem' : '0',
                                        borderBottom: i < planData.insights.length - 1 ? '1px solid var(--border)' : 'none'
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
                                                color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em'
                                            }}>
                                                {title}
                                            </h4>
                                            <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                                {cleanText}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    )}



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
                            ref={pushOnboardingRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="push-onboarding-title"
                            tabIndex={-1}
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                background: 'var(--bg-card)',
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

                            <h2 id="push-onboarding-title" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.75rem', position: 'relative', zIndex: 1 }}>
                                Activa tu Nutricionista IA
                            </h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
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
                                    onClick={dismissPushOnboarding}
                                    disabled={isPushEnabling}
                                    style={{
                                        background: 'transparent', color: 'var(--text-light)', border: 'none',
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
            {/* [P2-CUSTOM-MODALS-A11Y · 2026-05-24] ref + role/aria-modal/
                aria-labelledby + tabIndex={-1} sobre el contenido del modal.
                El hook useModalAccessibility (declarado ~línea 180) instala
                focus trap + ESC + restore focus + body overflow. */}
            <AnimatePresence>
                {showRestockModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                        zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', padding: '1rem'
                    }}>
                        <motion.div
                            ref={restockModalRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="restock-modal-title"
                            tabIndex={-1}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                background: 'var(--bg-card)', borderRadius: '1.5rem', padding: '2rem',
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
                                            border: '1.5px solid var(--border)',
                                            background: 'var(--bg-card)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            margin: '0 auto 1.5rem auto',
                                            boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)'
                                        }}>
                                            <ShoppingCart size={24} color="var(--text-main)" strokeWidth={1.75} />
                                            {/* Status dot — emerald punto pequeño, lateral */}
                                            <span style={{
                                                position: 'absolute',
                                                bottom: '-3px', right: '-3px',
                                                width: '14px', height: '14px',
                                                borderRadius: '50%',
                                                background: '#10B981',
                                                border: '2.5px solid var(--bg-card)',
                                                boxShadow: '0 1px 2px rgba(16, 185, 129, 0.4)'
                                            }} aria-hidden="true" />
                                        </div>

                                        <h2
                                            id="restock-modal-title"
                                            style={{
                                                fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)',
                                                marginBottom: '0.5rem', letterSpacing: '-0.015em'
                                            }}
                                        >
                                            Confirmar compra
                                        </h2>
                                        <p style={{
                                            color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: '1.55',
                                            marginBottom: isShoppingListStale ? '1.25rem' : '1.75rem',
                                            maxWidth: '320px', margin: isShoppingListStale ? '0 auto 1.25rem' : '0 auto 1.75rem',
                                        }}>
                                            Agregaremos todos los ingredientes de tu lista a la Nevera Virtual.
                                        </p>

                                        {isShoppingListStale && (
                                            <div style={{
                                                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                                                padding: '0.6rem 0.8rem', marginBottom: '1.25rem',
                                                background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                                                borderRadius: '0.75rem', textAlign: 'left'
                                            }}>
                                                <AlertCircle size={14} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                                <span style={{ fontSize: '0.78rem', color: 'var(--warning-text)', lineHeight: 1.45 }}>
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

                                        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.4rem', letterSpacing: '-0.01em' }}>
                                            Registrando compras
                                        </h2>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: '1.45', marginBottom: '0' }}>
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

            {/* ═══════════ MODAL (rediseño): ¿Por qué quieres cambiar? — un plato (PC + móvil) ═══════════ */}
            <MotivoActualizarModal
                open={!!swapModal}
                onClose={() => setSwapModal(null)}
                title="¿Por qué quieres cambiar?"
                subtitle="Tu respuesta nos ayuda a mejorar tus futuros planes."
                contextLabel={swapModal?.mealName}
                unlimited={isPremium || typeof userPlanLimit !== 'number'}
                quota={{
                    left: typeof userPlanLimit === 'number' ? Math.max(0, userPlanLimit - planCount) : 0,
                    total: typeof userPlanLimit === 'number' ? userPlanLimit : 0,
                }}
                options={[
                    { id: 'variety',  label: 'Quiero variedad',     desc: 'Me gusta, pero quiero algo diferente', color: '#818CF8', icon: 'shuffle' },
                    { id: 'time',     label: 'No tengo tiempo hoy',  desc: 'Busco algo más rápido de preparar',    color: '#A78BFA', icon: 'clock' },
                    { id: 'cravings', label: 'Tengo un antojo',      desc: 'Un capricho que encaja en tu plan',    color: '#FB7185', icon: 'heart' },
                ]}
                coming={(() => {
                    const todayDow = new Date().getDay(); // 0=Dom … 6=Sáb
                    const isWeekend = todayDow === 0 || todayDow === 6;
                    const d = 6 - todayDow;
                    return {
                        id: 'weekend',
                        label: 'Fin de semana especial',
                        desc: isWeekend
                            ? 'Platos más elaborados y premium · disponible hoy'
                            : 'Platos más elaborados y premium · se desbloquea el sábado',
                        color: '#FBBF24',
                        icon: 'bolt',
                        unlockLabel: `En ${d} ${d === 1 ? 'día' : 'días'}`,
                        unlocked: isWeekend,
                    };
                })()}
                extraRows={[
                    { id: 'similar', label: 'Ya comí algo similar', desc: 'Hoy ya tuve un plato parecido', color: '#FB923C', icon: 'copy' },
                ]}
                dislike={{ label: 'No me gusta este plato', desc: 'La IA evitará sugerirlo en el futuro' }}
                onPick={async (optionId) => {
                    if (!swapModal) return;
                    const { dayIndex, mealIndex, mealType, mealName } = swapModal;
                    setSwapModal(null);
                    if (optionId === 'dislike') {
                        setSwapDislikeConfirm({ dayIndex, mealIndex, mealType, mealName });
                        return;
                    }
                    // [P5-LOADING-DISABLE] Candado síncrono contra doble-tap (setSwapModal es async).
                    if (swapInFlightLock.current) return;
                    swapInFlightLock.current = true;
                    setRegeneratingId(mealIndex);
                    const toastId = toast.loading('🔄 Consultando al Chef IA...', { description: 'Buscando una alternativa deliciosa...' });
                    try {
                        const newName = await regenerateSingleMeal(
                            dayIndex, mealIndex, mealType, mealName,
                            optionId, // ← swap_reason
                            liveInventory // ← [P0-1] detectar ingredientes nuevos post-restock
                        );
                        trackEvent('plan_regeneration_triggered', {
                            reason: optionId,
                            source: 'dashboard',
                            is_expired: isPlanExpired,
                            has_pantry: liveInventory && liveInventory.length > 0,
                            type: 'single_meal',
                        });
                        toast.dismiss(toastId);
                        // [P2-SWAP-TOAST-FIX · 2026-06-29] Solo "¡Menú Actualizado!" si HUBO cambio real.
                        // En soft-fail (422 / swap_failed) regenerateSingleMeal devuelve null y YA mostró su
                        // toast.error específico → no dupliques con un success engañoso ("Cambiado por: <original>").
                        if (newName) {
                            toast.success('¡Menú Actualizado!', { description: `Cambiado por: ${newName}`, icon: '👨‍🍳' });
                        }
                    } catch (error) {
                        console.error('Error al regenerar:', error);
                        toast.dismiss(toastId);
                        toast.error('No se pudo conectar con la IA', { description: 'Se usó una receta alternativa local.' });
                    } finally {
                        setRegeneratingId(null);
                        swapInFlightLock.current = false; // [P5-LOADING-DISABLE]
                    }
                }}
            />

            {/* ═══════════ MODAL: Nuevo Ciclo de Compras (plan VENCIDO) ═══════════ */}
            {/* [P3-MOTIVO-MODAL-REDESIGN · 2026-06-24] Solo el caso VENCIDO usa este
                picker (tiene la opción extra "similar"); el día-completo vigente usa
                MotivoActualizarModal (más abajo). */}
            <OptionPickerModal
                isOpen={showUpdatePlanModal && isPlanExpired}
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
                    // [P3-NEWPLAN-NO-BUDGET-MODAL · 2026-05-23] Opción 'budget'
                    // ("Opciones económicas / Ingredientes de bajo costo")
                    // removida — el regenerate ya respeta la nevera por
                    // default (el frontend pasa `current_pantry_ingredients`
                    // a `/api/plans/generate`). El hint "ECONÓMICAS" del
                    // prompt era ortogonal a la restricción real (que es
                    // pantry/shopping-list) y sugería falsamente al user
                    // que los demás reasons NO usaban su nevera. Mirror
                    // del removal análogo en el modal swap-meal
                    // (P3-SWAP-PANTRY-DEFAULT · 2026-05-22).
                    return isPlanExpired ? [
                        { id: 'variety',  icon: Shuffle,    label: 'Quiero variedad',       color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', desc: 'Me apetecen platos distintos esta semana' },
                        { id: 'time',     icon: Clock,      label: 'Semana ocupada',       color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', desc: 'Busco preparaciones más rápidas' },
                        { id: 'cravings', icon: Heart,      label: 'Tengo un antojo',       color: '#EC4899', bg: '#FDF2F8', border: '#FBCFE8', desc: 'Un capricho que encaja en tu plan semanal' },
                        weekendOption,
                        { id: 'similar',  icon: Copy,       label: 'Se parece al ciclo anterior', color: '#F97316', bg: '#FFF7ED', border: '#FED7AA', desc: 'Evitar sugerencias muy parecidas a la semana pasada' },
                        { id: 'dislike',  icon: ThumbsDown, label: 'No me gustó el ciclo anterior', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', desc: 'Evitar ingredientes y estilos similares en el futuro' }
                    ] : [
                        { id: 'variety',  icon: Shuffle,    label: 'Quiero más variedad',       color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', desc: 'Me apetecen platos distintos hoy' },
                        { id: 'time',     icon: Clock,      label: 'No tengo tiempo hoy',       color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', desc: 'Busco algo más rápido de preparar' },
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
                    // [P5-DAY-UPDATE-DOUBLECLICK] Candado síncrono: aborta el 2º tap antes del re-render.
                    if (dayUpdateLock.current) return;
                    dayUpdateLock.current = true;
                    // [P5-DAY-LOADING-UX · 2026-06-23] Plan VIGENTE → día EN SITIO (lento ~1 min):
                    // cerrar el modal DE INMEDIATO en vez de atrapar al usuario tras `disableClose`
                    // durante todo el regen; regenerateDay muestra el progreso como toast
                    // no-bloqueante. Plan VENCIDO → Nuevo Ciclo navega a /plan → conservamos el
                    // spinner in-modal de la transición corta (setIsNavigatingOption).
                    if (!isPlanExpired && typeof regenerateDay === 'function') {
                        setShowUpdatePlanModal(false);
                        setIsDayUpdating(true); // [P5-LOADING-DISABLE] botón "Actualizando…" + disabled
                        try {
                            await regenerateDay(activeDayIndex, optionId);
                        } finally {
                            setIsDayUpdating(false);
                            dayUpdateLock.current = false;
                        }
                    } else {
                        setIsNavigatingOption(optionId);
                        try {
                            await handleNewPlan(optionId, null, 'dashboard_refresh');
                            setShowUpdatePlanModal(false);
                        } finally {
                            setIsNavigatingOption(null);
                            dayUpdateLock.current = false;
                        }
                    }
                }}
                infoBandRenderer={(hoveredOption) => (
                    <div style={{ marginTop: '1.25rem', padding: '0.85rem', background: 'var(--bg-muted)', borderRadius: '0.8rem', border: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', minHeight: '56px' }}>
                        <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--text-muted)' }} />
                        <div>
                            {hoveredOption === 'dislike' ? (
                                <><strong>Se evitarán:</strong> {currentDayMeals.length > 0 ? currentDayMeals.map(m => m.name).join(', ') : 'los platos actuales'}.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : hoveredOption === 'variety' ? (
                                <><strong>Variedad:</strong> platos de diferentes cocinas y perfiles de sabor.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : hoveredOption === 'time' ? (
                                <><strong>Rapidez:</strong> platos con ≤20 min de preparación aproximada.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : hoveredOption === 'cravings' ? (
                                <><strong>Antojo:</strong> opciones más indulgentes dentro de tus objetivos.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : hoveredOption === 'weekend' ? (
                                <><strong>Fin de semana:</strong> platos más elaborados y experiencias premium.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
                            ) : hoveredOption ? (
                                <><strong>{isPlanExpired ? 'Regenerando:' : 'Actualizando:'}</strong> {isPlanExpired ? 'el menú completo del ciclo actual' : 'los platos de este día, cocinando con lo que tienes en tu Nevera'}.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~12s. {isPremium ? 'Sin costo (Premium)' : 'Consumirá 1 regeneración'}.</span></>
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

            {/* ═══════════ MODAL (rediseño): ¿Por qué quieres actualizar? — día completo (plan VIGENTE) ═══════════ */}
            <MotivoActualizarModal
                open={showUpdatePlanModal && !isPlanExpired}
                onClose={() => setShowUpdatePlanModal(false)}
                unlimited={isPremium || typeof userPlanLimit !== 'number'}
                quota={{
                    left: typeof userPlanLimit === 'number' ? Math.max(0, userPlanLimit - planCount) : 0,
                    total: typeof userPlanLimit === 'number' ? userPlanLimit : 0,
                }}
                options={[
                    { id: 'variety',  label: 'Quiero más variedad',      desc: 'Me apetecen platos distintos hoy',   color: '#818CF8', icon: 'shuffle', recommended: true },
                    { id: 'time',     label: 'No tengo tiempo hoy',       desc: 'Busco algo más rápido de preparar',  color: '#A78BFA', icon: 'clock' },
                    { id: 'cravings', label: 'Tengo un antojo distinto',  desc: 'Un capricho que encaja en tu plan',  color: '#FB7185', icon: 'heart' },
                ]}
                coming={(() => {
                    const todayDow = new Date().getDay(); // 0=Dom … 6=Sáb
                    const isWeekend = todayDow === 0 || todayDow === 6;
                    const d = 6 - todayDow; // días hasta el sábado
                    return {
                        id: 'weekend',
                        label: 'Fin de semana especial',
                        desc: isWeekend
                            ? 'Platos más elaborados y premium · disponible hoy'
                            : 'Recetas para darte un gusto el finde · se desbloquea el sábado',
                        color: '#FBBF24',
                        icon: 'bolt',
                        unlockLabel: `En ${d} ${d === 1 ? 'día' : 'días'}`,
                        unlocked: isWeekend,
                    };
                })()}
                pickingId={isNavigatingOption}
                onPick={async (optionId) => {
                    if (isLimitReached || isNavigatingOption) return;
                    if (optionId === 'dislike') {
                        setShowUpdatePlanModal(false);
                        setShowDislikeConfirmModal(true);
                        return;
                    }
                    // [P5-DAY-UPDATE-DOUBLECLICK] Candado síncrono contra doble-tap.
                    if (dayUpdateLock.current) return;
                    dayUpdateLock.current = true;
                    // [P5-DAY-LOADING-UX · 2026-06-23] Plan vigente → día en sitio (lento):
                    // cerramos el modal de inmediato; regenerateDay muestra progreso por toast.
                    setShowUpdatePlanModal(false);
                    setIsDayUpdating(true);
                    try {
                        if (typeof regenerateDay === 'function') {
                            await regenerateDay(activeDayIndex, optionId);
                        } else {
                            await handleNewPlan(optionId, null, 'dashboard_refresh');
                        }
                    } finally {
                        setIsDayUpdating(false);
                        dayUpdateLock.current = false;
                    }
                }}
            />
            {/* ═══════════ MODAL: Confirmación bloqueo permanente de un plato individual ═══════════ */}
            <OptionPickerModal
                isOpen={!!swapDislikeConfirm}
                onClose={() => setSwapDislikeConfirm(null)}
                title="¿Bloquear este plato?"
                subtitle={
                    swapDislikeConfirm && (
                        <div style={{ margin: '0 0 1.15rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
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

                    // [P5-LOADING-DISABLE] Candado síncrono contra doble-tap (mismo que el modal de razón).
                    if (swapInFlightLock.current) return;
                    swapInFlightLock.current = true;
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
                        // [P2-SWAP-TOAST-FIX · 2026-06-29] Solo "¡Menú Actualizado!" si HUBO cambio real.
                        // En soft-fail (422 / swap_failed) regenerateSingleMeal devuelve null y YA mostró su
                        // toast.error específico → no dupliques con un success engañoso ("Cambiado por: <original>").
                        if (newName) {
                            toast.success('¡Menú Actualizado!', { description: `Cambiado por: ${newName}`, icon: '👨‍🍳' });
                        }
                    } catch (error) {
                        console.error('Error al regenerar:', error);
                        toast.dismiss(toastId);
                        toast.error('No se pudo conectar con la IA', { description: 'Se usó una receta alternativa local.' });
                    } finally {
                        setRegeneratingId(null);
                        swapInFlightLock.current = false; // [P5-LOADING-DISABLE]
                    }
                }}
            />
            {/* ═══════════ MODAL: Confirmación permanente de "No me gustan estos platos" ═══════════ */}
            <OptionPickerModal
                isOpen={showDislikeConfirmModal}
                onClose={() => { setShowDislikeConfirmModal(false); setShowUpdatePlanModal(true); }}
                title="¿Bloquear estos platos?"
                subtitle={
                    <div style={{ margin: '0 0 1.15rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <p style={{ margin: '0 0 0.5rem 0' }}>
                            Los siguientes platos quedarán <strong style={{ color: '#EF4444' }}>bloqueados permanentemente</strong> y no volverán a aparecer en futuros planes:
                        </p>
                        {currentDayMeals.length > 0 && (
                            <ul style={{ margin: '0.35rem 0 0 0', padding: '0 0 0 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                {currentDayMeals.map((m, i) => (
                                    <li key={i} style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.82rem' }}>{m.name}</li>
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
                    // [P5-DAY-UPDATE-DOUBLECLICK] Candado síncrono contra doble-tap (mismo que el modal de motivos).
                    if (dayUpdateLock.current) return;
                    dayUpdateLock.current = true;
                    // [P5-DAY-LOADING-UX · 2026-06-23] Plan vigente → día en sitio (lento): cerrar
                    // modal YA + toast no-bloqueante (regenerateDay). Vencido → Nuevo Ciclo navega.
                    if (!isPlanExpired && typeof regenerateDay === 'function') {
                        setShowDislikeConfirmModal(false);
                        setIsDayUpdating(true); // [P5-LOADING-DISABLE]
                        try {
                            await regenerateDay(activeDayIndex, 'dislike');
                        } finally {
                            setIsDayUpdating(false);
                            dayUpdateLock.current = false;
                        }
                    } else {
                        setIsNavigatingOption('confirm_dislike');
                        try {
                            await handleNewPlan('dislike', null, 'dashboard_refresh');
                            setShowDislikeConfirmModal(false);
                        } finally {
                            setIsNavigatingOption(null);
                            dayUpdateLock.current = false;
                        }
                    }
                }}
            />

        </>
    );
};

// [P1-DASH-HOOKS-ORDER · 2026-05-31] Wrapper guardián: lee SOLO `loadingData` y
// `planData` del context y decide si montar el árbol pesado de `DashboardInner`.
// Mantiene 1 hook (useAssessment) en orden estable; los early-returns viven aquí
// donde NO hay hooks debajo, así que cualquier transición loadingData/planData
// produce un montaje/desmontaje limpio de `DashboardInner` en vez del crash de
// rules-of-hooks que existía cuando los guards estaban dentro del componente
// con ~80 hooks debajo. Comportamiento idéntico al previo en el camino común
// (ProtectedRoute ya garantiza loadingData=false al renderizar esta ruta).
const Dashboard = () => {
    const { loadingData, planData, planSyncFailed, retryPlanSync } = useAssessment();

    // ESTADO DE CARGA: recuperando datos de la DB → loader.
    if (loadingData) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '1rem',
                color: 'var(--text-muted)',
                background: 'var(--bg-page)'
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

    // [P1-LOGIN-PLAN-SYNC-RETRY · 2026-07-03] La sincronización del plan FALLÓ
    // (red/5xx/race post-login en dispositivo nuevo) — eso NO significa que el
    // usuario no tenga plan. Antes este caso caía al Navigate de abajo y el
    // usuario con plan aterrizaba en el FORMULARIO (reporte del owner desde el
    // teléfono). Pantalla honesta con Reintentar en vez de asumir "sin plan".
    if (!planData && planSyncFailed) {
        return (
            <div style={{
                height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: '1rem', padding: '1.5rem', textAlign: 'center',
                color: 'var(--text-muted)', background: 'var(--bg-page)'
            }}>
                <AlertCircle size={44} color="var(--warning)" />
                <p style={{ fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                    No pudimos sincronizar tu plan
                </p>
                <p style={{ fontSize: '0.85rem', maxWidth: 340, margin: 0, lineHeight: 1.45 }}>
                    Puede ser una conexión inestable o que la sesión aún se esté activando.
                    Tu plan sigue guardado — vuelve a intentarlo.
                </p>
                <button
                    onClick={() => retryPlanSync?.()}
                    style={{
                        marginTop: '0.25rem', padding: '0.6rem 1.4rem', borderRadius: '10px',
                        border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
                        background: 'var(--primary)', color: '#fff'
                    }}
                >
                    Reintentar
                </button>
            </div>
        );
    }

    // Protección de ruta: cargó y NO hay plan → al formulario de evaluación.
    if (!planData) {
        return <Navigate to="/assessment" replace />;
    }

    return <DashboardInner />;
};

export default Dashboard;
