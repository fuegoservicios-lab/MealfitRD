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
    ThumbsDown, Shuffle, X, Utensils, Copy, ChevronRight, Refrigerator,
    CalendarClock
} from 'lucide-react';
import { toast } from 'sonner';
// [P1-I18N-DASHBOARD · 2026-08-15] Motor de idioma. `useT()` dentro de componentes
// (es lo que los suscribe al cambio de idioma); `t`/`tn` de módulo para los helpers
// que viven FUERA de React (los `resolve*` exportados, las tablas de copy). Las
// tablas son FUNCIONES, nunca constantes: una constante con `t()` se evalúa al
// importar —antes de que el catálogo cargue— y se congela en español para siempre.
import { useT, t, tn, formatDate } from '../i18n';

// [P1-DASH-GENERATING-HONESTY · 2026-08-16] «el próximo llega el <día>» a partir de
// `next_chunk_eta`. Devuelve '' ante cualquier entrada inservible: el copy que lo
// usa tiene una variante sin fecha, y una fecha inventada sería peor que ninguna.
// Va por `formatDate` (Intl con el locale activo) y no por un formateador propio:
// esta cadena la ven los cinco idiomas del dashboard.
function _formatoDiaCorto(iso) {
    if (!iso) return '';
    return formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
}
import TrackingProgress from '../components/dashboard/TrackingProgress';
// [P3-WATER-TRACKER · 2026-05-16] Tracker de hidratacion (8 vasos diarios)
// reemplaza el card "Mi Nevera" que duplicaba la pagina Pantry.
import WaterTracker from '../components/dashboard/WaterTracker';
// [P2-CREDITS-METER · 2026-06-15] Gauge circular animado de créditos (reemplaza
// el badge plano icono+número del header). Recibe la misma data del badge.
import CreditsMeter from '../components/dashboard/CreditsMeter';
import DashboardTracking from '../components/dashboard/DashboardTracking';
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
// [P2-CHUNK-OVERDUE-SIGNAL · 2026-08-04] Pestañas fantasma de los días del plan
// que aún no existen (absorbe el skeleton que vivía inline en la fila de días).
import PlanWeekNav from '../components/dashboard/PlanWeekNav';
import EmptyState from '../components/common/EmptyState';
// [P1-PANTRY-STRICT-CONSENT · 2026-08-02] "Nevera estricta + consentimiento": modal que nombra
// el/los ingrediente(s) que el chef necesita fuera de la Nevera real (nombre + cantidad + precio
// RD$ estimado) y ofrece añadir a la lista / buscar otra opción / cancelar — nada entra a la
// lista de compras sin este consentimiento explícito.
import PantryConsentModal from '../components/common/PantryConsentModal';
// [P1-NEON-DB-MIGRATION · 2026-06-12] Import de `el cliente anterior` eliminado: los
// SELECTs/realtime directos a Postgres migraron a endpoints backend
// (GET /api/inventory, GET /api/plans-data/{plan_id}) via fetchWithAuth.
// [P2-LAZY-PDF · 2026-05-13] html2pdf.js (976 KB) se importa dinámico
// dentro del handler de descarga — ver `await import('html2pdf.js')` más
// abajo. Pre-fix era import estático top-level: el chunk se fetch eager
// al entrar al Dashboard, 100% de usuarios pagan el costo aunque jamás
// descarguen PDF. Tooltip-anchor: P2-LAZY-PDF.
import { API_BASE, fetchWithAuth, getPlanChunkStatus } from '../config/api';
import { reanudarPlanes } from '../utils/planModeResume';
// [P1-DASH-BUDGET-EDIT · 2026-06-23] Ciclo de compras (días) para el editor de presupuesto.
// [P1-COUNTRY-SYSTEM-F1 · 2026-08-16 (T7)] effectiveBudgetCurrency — la moneda REALMENTE
// vigente (nunca budgetCurrency crudo, que puede quedar STALE en una moneda beta tras un
// rollback). Mismo helper SSOT que QBudget/InteractiveAssessmentFlow/useBudgetFloor (T6).
import { minBudgetFor, budgetCycleDays, effectiveBudgetCurrency } from '../config/formValidation';
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
// [P1-SWAP-PANTRY-GATE · 2026-07-30] Umbrales + gate de Nevera. La lógica pura
// vive en su propio módulo para poder testearla EJECUTÁNDOLA (los tests de este
// archivo son parser-based y no ejecutan nada). Ver utils/pantryGate.js.
import {
    PANTRY_MIN_ITEMS_FOR_UPDATE,
    PANTRY_MIN_ITEMS_FOR_SWAP,
    SWAP_REASONS_REQUIRING_PANTRY,
    computePantryGate,
} from '../utils/pantryGate';
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
import { writableDayIndex, buildTimeline } from '../utils/planWeeks';
import { fixDayCtaApplies } from '../utils/fixDayCta';
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
// [P2-14 · 2026-07-09] Hook SSOT de viewport (antes useState + matchMedia local).
import { useMediaQuery } from '../hooks/useMediaQuery';
// [P2-15 · 2026-07-09] Store single-source de la Nevera Virtual (antes 3 copias
// sincronizadas a mano: localStorage + useState local aquí + useState en Pantry).
import { useDisabledIngredients } from '../hooks/useDisabledIngredients';
// [P1-PLAN-POLL-BOUNDED · 2026-07-29] Mismo loop acotado (discriminador +
// backoff + give-up) que AssessmentContext usa para /plans-data/latest,
// aplicado aquí al hermano que pollea /api/profile + /chunk-status cada 30s
// bajo el mismo gate sin cota — ver hooks/usePlanPollLoop.js.
import { usePlanPollLoop } from '../hooks/usePlanPollLoop';
import { useLatestRef } from '../hooks/useLatestRef';
// [P2-3 · 2026-07-09] Cache del planCount keyed por usuario (antes window.__cachedQuota).
import { getFreshPlanCount } from '../utils/quotaCache';
import { getDeltaSourceList, calculateAllPlanIngredients, fetchFreshInventoryWithTimeout, getInventoryFetchTimeoutMs, computePdfLayoutDensity, PDF_LAYOUT_THRESHOLDS, parseMarketQty, resolveShopQty, escapeHtml } from '../utils/shoppingHelpers';
import { emitCoherenceToast, emitHistoricalCoherenceToast } from '../utils/renderCoherenceWarnings';
import { getMealAdvisories, diaEnBandaObjetivo } from '../utils/mealAdvisories';
// [P1-TODAY-REMAINING · 2026-07-28] "Ya comiste esto hoy" — derivado del
// diario en cada render (nunca escrito a plan_data). Ver docstring del
// módulo para la regla de match + la regla de ambigüedad (mismas que
// backend/agent.py::_build_today_remaining_context).
import { getEatenSlotIndices, sumConsumedCalories, sumPlannedRemainingCalories, todayRemainingLine, eatenChipLabel, eatenClaimForSlot } from '../utils/todayRemaining';
// [P1-EATEN-SLOT-POLISH · 2026-07-28] La card ya-comida se atenuaba (P1-TODAY-REMAINING)
// pero seguía siendo 100% interactiva — "Cambiar Plato" costaba un crédito real y
// "Me gusta" grababa una preferencia sobre un plato que el usuario NO comió (owner:
// "me deja interactuar y no debería"). Cambiar Plato y Me gusta ahora se deshabilitan
// de VERDAD (atributo `disabled` nativo — coincide teclado + lectores de pantalla, no
// solo opacidad). Ver Receta se mantiene activo a propósito: responde una pregunta
// legítima ("¿qué me tocaba comer?"); no cuesta crédito ni graba nada.
// [P1-EATEN-RECIPE-LOCK · 2026-07-28] OJO: Recetas ya NO es "solo lectura" — ahí el
// PDF y los checkboxes de ingredientes/pasos SÍ se bloquean para un slot ya
// registrado. Lo que nunca se gatea es LEER la receta, y eso es exactamente lo que
// Ver Receta abre, así que sigue activo. El match de slot es una heurística (P1-TODAY-REMAINING) y puede fallar, así
// que cada control bloqueado explica el escape hatch real: borrar la fila en
// "Progreso en Tiempo Real" (P1-DIARY-EDITABLE, TrackingProgress.jsx).
//
// [P1-EATEN-SLOT-COPY · 2026-07-28] `_EATEN_SLOT_LOCK_REASON` ERA un string
// module-level fijo ("Ya comiste esto — bloqueado...") — afirmaba que el
// usuario comió `meal.name` DEL PLAN, cuando el matcher empareja por SLOT
// (`meal_type`), nunca por nombre (owner: "en realidad comí otra cosa").
// Reemplazado por `eatenClaimForSlot(todaysConsumedMeals, meal.meal,
// 'unlock')` computado POR COMIDA dentro del `.map` de abajo — nombra lo que
// el DIARIO realmente registró, nunca el plato del plan. Mismo string
// reutilizado en la card, el chip y los dos botones bloqueados (SSOT, cero
// drift entre las 4 apariciones).
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
// [P1-PLAN-HYDRATE-ON-COMPLETE · 2026-07-24] Dueño del flag de "generación en vuelo".
import { hasPendingPipelineInFlight } from '../utils/pendingPipelineFlag';

// [P2-BRANDS-OPTIMISTIC · 2026-07-07] Update en TIEMPO REAL del brand elegido en
// "Marcas del súper". El display de cada ítem es un solo string backend
// (`display_qty` = "2 potes (16 Oz · Genérico c/u)") + el precio en
// `estimated_cost_rd`. Antes la lista solo cambiaba cuando el recalc
// (/recalculate-shopping-list, 15-40s + serializado) devolvía y hacía setPlanData
// → el owner veía el toast girando y la lista en "Genérico" (se sentía roto).
// Ahora parcheamos el ítem al instante (marca + precio si el envase coincide) y el
// recalc reconcilia el costo exacto en segundo plano. Reversible: es puramente UI,
// el recalc sigue siendo la fuente de verdad.
// [P1-URGENT-LIST-CANONICAL · 2026-08-09] La caja roja «Compra Urgente Requerida» del plato era
// una FOTO del momento de generación: el owner compró la lista entera («Tu Nevera ya cubre la
// lista») y los avisos seguían acusando. Este filtro la evalúa EN VIVO contra la Nevera: una
// línea faltante («380 ml de leche descremada») queda cubierta si TODOS los tokens del nombre de
// algún ítem del inventario («Leche descremada») aparecen como token COMPLETO en la parte-alimento
// de la línea — subconjunto por token, jamás substring («sal» no absuelve «salsa», 15ª clase).
// Compras → la caja desaparece; se te agota algo → reaparece. Fail-safe: sin inventario cargado,
// se muestra todo (mejor avisar de más que esconder una compra de seguridad).
const _MISSING_QTY_PREFIX_RX = /^[\d\s./½¼¾⅓⅔]+(?:g|gr|ml|kg|l|cdta|cda|cdas|cdtas|taza|tazas|unidad(?:es)?|ud|uds)?\s*(?:de\s+)?/i;
const _missingNormTokens = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split('(')[0].split(',')[0]
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('is')) ? w.slice(0, -1) : w);
export const filterStillMissing = (missingList, inventory) => {
    if (!Array.isArray(missingList) || missingList.length === 0) return [];
    // [P1-URGENT-FLASH-UNKNOWN · 2026-08-13] `null`/`undefined` = TODAVÍA NO SÉ
    // (el fetch de la Nevera va en camino), y es un estado DISTINTO de `[]` =
    // la nevera está vacía de verdad. Antes ambos caían en el mismo `return
    // missingList` y el aviso rojo salía ~300 ms en cada refresh para
    // retirarse solo: una ausencia de dato convertida en acusación. Devolver
    // vacío aquí significa «nada que mostrar todavía»; el caller decide qué
    // hacer si el fetch además FALLÓ (ver el uso de inventoryStale).
    if (inventory == null) return [];
    if (!Array.isArray(inventory) || inventory.length === 0) return missingList;
    const invTokenSets = inventory
        .map(r => _missingNormTokens(r?.ingredient_name || r?.name))
        .filter(t => t.length > 0);
    return missingList.filter(line => {
        const foodTokens = new Set(_missingNormTokens(String(line).replace(_MISSING_QTY_PREFIX_RX, '')));
        if (foodTokens.size === 0) return true;
        return !invTokenSets.some(ts => ts.every(t => foodTokens.has(t)));
    });
};

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
// [P1-COUNTRY-SYSTEM-F1 · 2026-08-16 (T7)] `suppressCost` (default false, byte-idéntico
// para DO): país beta sin precios nativos ⇒ el backend NUNCA escribió `estimated_cost_rd`
// para este plan (aggregator lo anula, ver `get_shopping_list_delta` backend) — el writer
// optimista del cliente no debe resucitarlo al elegir marca. El resto del rebuild (marca,
// tamaño, conteo) sigue aplicando: elegir marca sigue siendo útil sin precio.
const _rebuildItemFromVariant = (it, variant, suppressCost = false) => {
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
    if (price > 0 && !suppressCost) {
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
    // [P1-COUNTRY-SYSTEM-F1 · 2026-08-16 (T7)] País beta sin precios nativos ⇒ el writer
    // optimista se comporta como el backend: reconstruye marca/tamaño, JAMÁS costo.
    const _suppressCost = plan?._pricing_mode === 'beta_no_prices';
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
            if (_brandKeyMatches(nm, foodKey)) { changed = true; return _rebuildItemFromVariant(it, variant, _suppressCost); }
            return it;
        });
        if (changed) { next[k] = nl; touched = true; }
    });
    return touched ? next : null;
};

// [P3-UPDATE-PLATOS-REQUIRES-PANTRY · 2026-05-17 → P1-SWAP-PANTRY-GATE · 2026-07-30]
// `PANTRY_MIN_ITEMS_FOR_UPDATE` (y su hermano nuevo `PANTRY_MIN_ITEMS_FOR_SWAP`)
// se movieron a `utils/pantryGate.js` — ver el import de arriba. Vivían aquí como
// constante local, pero entonces el swap individual no podía compartirlas sin
// duplicarlas, y dos fuentes del mismo umbral divergen en el primer cambio.

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
const SINGLE_STOP_WORDS_REGEX = new RegExp('\\b(' + NAME_STOP_WORDS.join('|') + ')\\b', 'gi');
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

// [P1-I18N-DASHBOARD · 2026-08-15] FUNCIÓN, no constante: cada valor es copy que
// pasa por `t()` y este mapa se importa al arrancar el módulo — como constante se
// evaluaría antes de que el catálogo exista y quedaría congelado en español.
const getQDegradedReasonMap = () => ({
    high_contextual: t('No pudimos adaptar el plan a una restricción tuya (despensa, alergia o condición). Revisa tus datos en el formulario y regenera.'),
    max_attempts: t('El revisor de calidad no aprobó el plan tras varios intentos. Te dimos la mejor versión disponible; revísala y usa Cambiar Plato si algo no cuadra.'),
    invalid_pipeline_start: t('Hubo un problema técnico al iniciar la generación. Intenta regenerar el plan.'),
    budget_exhausted: t('Se alcanzó el límite de tiempo de generación. Te dimos la mejor versión disponible.'),
    // [P2-BAND-SCORE-GATE · 2026-06-15] motivo emitido por _maybe_mark_low_band_degraded
    // [2026-08-05] Copy en llano (hermano del chip de mealAdvisories): «banda
    // objetivo (90-112% del target)» era doble jerga para el usuario final.
    low_band_score: t('Este plan se desvía de tu objetivo de macros más de lo habitual. Las porciones pueden no ser exactas; ajústalas a tu medida.'),
    // [P2-PANEL-SOFT-REJECT · 2026-06-15] motivos de _maybe_mark_panel_degraded
    condition_panel_gap: t('El balance de tu condición (grasa saturada / potasio / magnesio / fibra) quedó fuera de la meta tras los ajustes automáticos. Revísalo con tu profesional.'),
    low_micros: t('Algunos micronutrientes (fibra / potasio / magnesio / calcio) quedaron por debajo del objetivo diario.'),
    high_sodium_sugar: t('El sodio o el azúcar añadida quedaron por encima del techo recomendado por la OMS.'),
    // [P2-FASE7-HONESTY · 2026-06-21] Lista de compras incompleta (preocupación #1 del owner):
    // emitida por `_maybe_mark_shopping_incomplete_degraded` cuando el plan entregado quedó con la
    // lista vacía pese a tener recetas. Sobrescribe el genérico max_attempts (motivo más específico
    // + accionable). Las otras "honestidades" del build se surfacean en SU propia superficie, NO en
    // este banner: presupuesto insuficiente → bloqueo + toast pre-generación (Plan.jsx); piso de
    // proteína → disclaimer del plan de contingencia (Plan.jsx, `_review_disclaimer`); nevera baja →
    // banner en Mi Nevera. Por eso NO se duplican aquí (evita copy que nunca se dispara).
    shopping_list_incomplete: t('La lista de compras quedó incompleta para este plan. Regenera, o revisa que cada ingrediente de las recetas aparezca en tu lista.'),
    // [P2-DEGRADE-BANNER-CLINICAL-COPY · 2026-06-22] (audit fresco P2-13) Dos motivos que el backend SÍ
    // emite (`_quality_degraded_reason`, graph_orchestrator.py:19030/19078) pero no tenían copy → caían al
    // genérico. `clinical_layer_incomplete` es severity HIGH y SOLO para perfiles con condición/alergia real
    // → es justo el subgrupo at-risk el que veía el copy menos accionable.
    clinical_layer_incomplete: t('No pudimos aplicar por completo la capa de seguridad clínica de tu perfil (condición/alergia). El plan es ORIENTATIVO: revísalo con tu profesional de salud antes de seguirlo y, si puedes, regenéralo.'),
    composite_dish_unresolved: t('Algunos platos compuestos (ej. sancocho, mangú) no se pudieron desglosar en ingredientes con precisión, así que sus macros y su lista de compras son aproximados. Usa Cambiar Plato si necesitas más exactitud.'),
    // [P1-MARKER-UNRESOLVED-HONESTY · 2026-06-23] (audit inteligencia P1-6) El corrector de
    // coherencia de slots (self_critique + surgical regen) no pudo resolver algún día tras los
    // reintentos → puede haber comidas repetidas (almuerzo↔cena) o un slot incoherente. Antes se
    // entregaba como plan plenamente verificado SIN aviso.
    slot_coherence_unresolved: t('Algunos días pueden tener comidas repetidas o poco variadas: el ajuste automático no terminó. Usa Cambiar Plato para variar el día que no te cuadre.'),
    // [P3-MICRO-WORSTDAY-COPY · 2026-07-04] Los dos motivos del soft-reject del panel de micros
    // (P2-PANEL-SOFT-REJECT) caían al genérico "Calidad por debajo del óptimo" — el owner vio el
    // banner y no supo que era el SODIO del peor día (pregunta real 2026-07-04). Copy específico
    // y accionable, alineado con lo que el panel de micros muestra abajo.
    // [P1-FIX-DAY-ONLY-IF-SODIUM · 2026-08-05] El copy ya no da por hecho que el techo
    // roto es sodio. Decía «usa Cambiar Plato en la comida más SALADA de ese día», y este
    // motivo cubre cuatro techos: con uno de azúcar añadida (caso real del owner) esa
    // instrucción manda al usuario a mirar el plato equivocado. El nutriente concreto
    // viaja en `_quality_degraded_panel_detail` y el panel de micros ya lo marca.
    micro_worst_day_ceiling: t('Un día se pasa de uno de tus techos (sodio, azúcar añadida, grasa saturada o potasio). Mira cuál en el panel de micros de arriba y usa Cambiar Plato en la comida de ese día que más lo aporte.'),
    micro_worst_day: t('Un día quedó por debajo del piso en algunos micronutrientes (fibra, potasio, magnesio…). Revisa el panel de micros y usa Cambiar Plato si quieres reforzar ese día.'),
});

// [P3-BANNER-REASON-COPY · 2026-07-10] `low_band_macro:<macros>` (sufijo dinámico, ej.
// "low_band_macro:carbs" o "low_band_macro:carbs,kcal" tras P2-BAND-GATE-KCAL-SEMANTICS) es un
// exact-match miss en Q_DEGRADED_REASON_MAP → caía SIEMPRE al genérico "Calidad por debajo del
// óptimo" sin decir CUÁL macro falló. Forensic corr=d57ffe04 (2026-07-10): el owner vio el banner
// exacto de este caso (carbs) y preguntó qué significaba.
const LOW_BAND_MACRO_LABELS = () => ({
    protein: t('la proteína'),
    carbs: t('los carbohidratos'),
    fats: t('las grasas'),
    kcal: t('las calorías'),
});

/* [P2-DEGRADED-HEADLINE-TRUTH · 2026-07-31] El titular del banner decía SIEMPRE
   "La IA no logró un plan óptimo tras N intentos", pero los motivos son de dos
   familias que no se parecen en nada:

     A) La IA de verdad no convergió: se acabaron los intentos, el presupuesto
        de tiempo o el contexto (los de este set).
     B) La IA SÍ entregó y el revisor APROBÓ — una auditoría posterior marcó un
        detalle (panel de micros, banda de macros, lista incompleta…).

   Caso real que lo destapó (plan d476023a, 2026-07-31): revisor "APROBADO" en
   el intento #1, calidad holística 0.925 con retry=1.00 y review=1.00, y el
   banner acusando a la IA de no haber logrado un plan óptimo. El motivo real
   era `micro_worst_day_ceiling`: un día se pasó del techo de sodio (gouda dos
   veces + camarones). Culpar al motor de un fallo que no cometió confunde el
   diagnóstico y desconfía del producto sin razón.

   Para un motivo DESCONOCIDO se decide por los intentos: con 1 intento la IA
   no pudo "quedarse sin intentos", así que el encuadre de agotamiento es falso
   por construcción. */
const Q_DEGRADED_RETRY_EXHAUSTION = new Set([
    'high_contextual',
    'max_attempts',
    'invalid_pipeline_start',
    'budget_exhausted',
]);

export function resolveQualityDegradedHeadline(reason, attempts) {
    const n = Number(attempts) > 0 ? Number(attempts) : null;
    // "Conocido" se mide contra el MAPA, no contra `resolveQualityDegradedLabel`:
    // ese resolver nunca devuelve null para un motivo con texto (cae a un genérico
    // "Calidad por debajo del óptimo"), así que usarlo aquí dejaba esta red de
    // seguridad INERTE — verificado ejecutándola, no leyéndola.
    const conocido = !!reason && (
        Object.prototype.hasOwnProperty.call(getQDegradedReasonMap(), reason)
        || reason.startsWith('low_band_macro:')
    );
    // Motivo nuevo que nadie clasificó + hubo reintentos de verdad → se asume
    // agotamiento (con 1 intento la IA no pudo "quedarse sin intentos", así que
    // ahí el encuadre acusatorio es falso por construcción).
    const agotado = Q_DEGRADED_RETRY_EXHAUSTION.has(reason) || (!conocido && n !== null && n > 1);

    if (agotado) {
        return {
            title: n
                ? tn(n, 'La IA no logró un plan óptimo tras {n} intento', 'La IA no logró un plan óptimo tras {n} intentos', { n })
                : t('La IA no logró un plan óptimo'),
            body: t('Te entregamos la mejor versión. Usa Cambiar Plato para reemplazar comidas o regenera el plan completo.'),
            exhausted: true,
        };
    }
    return {
        title: t('Plan listo, con un aviso'),
        body: t('Revisa el motivo aquí abajo y usa Cambiar Plato si quieres ajustar ese día.'),
        exhausted: false,
    };
}

export function resolveQualityDegradedLabel(reason) {
    if (!reason) return null;
    // [P1-I18N-DASHBOARD · 2026-08-15] El mapa es una FUNCIÓN y se resuelve aquí,
    // en tiempo de llamada, cuando el catálogo ya está cargado. El nombre local se
    // conserva a propósito: es el mismo lookup que antes, solo que no congelado.
    const Q_DEGRADED_REASON_MAP = getQDegradedReasonMap();
    if (Q_DEGRADED_REASON_MAP[reason]) return Q_DEGRADED_REASON_MAP[reason];
    if (reason.startsWith('low_band_macro:')) {
        const macros = reason.slice('low_band_macro:'.length).split(',').filter(Boolean);
        const _macroLabels = LOW_BAND_MACRO_LABELS();
        const names = macros.map((m) => _macroLabels[m] || m);
        const joined = names.length > 1
            ? t('{lista} y {ultimo}', { lista: names.slice(0, -1).join(', '), ultimo: names[names.length - 1] })
            : (names[0] || t('algunos macros'));
        // [2026-08-05] «Este plan se desvía en X» funciona igual con uno o
        // varios macros — la forma anterior («la precisión de X quedó») era el
        // mismo esquive de concordancia, pero con jerga.
        return t('Este plan se desvía de tu objetivo en {macros} durante varios días. Las porciones pueden no ser exactas; ajústalas a tu medida.', { macros: joined });
    }
    return t('Calidad por debajo del óptimo.');
}

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
// [P1-I18N-DASHBOARD · 2026-08-15] Función, no array constante: se llama desde
// `_pickGreeting()` en cada render/tick, con el catálogo ya cargado.
function _greetingSubtitles() {
    return [
        t('Aquí tienes tu estrategia nutricional.'),
        t('Tu plan, hecho a tu medida.'),
        t('Pequeños pasos, grandes resultados.'),
        t('Comida real, metas reales.'),
        t('Sigue tu plan, sin complicarte.'),
        t('Hoy es un buen día para nutrirte bien.'),
        t('Constancia, no perfección.'),
        t('Tu progreso, un plato a la vez.'),
        t('Lo simple, sostenido, gana.'),
    ];
}

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
    if (hour < 5) return [t('Buenas madrugadas'), t('Aún despierto'), t('Trasnochando'), t('Sin sueño'), t('Hola')];
    if (hour < 12) return [t('Buenos días'), t('Buen día'), t('Arriba'), t('A darle'), t('A por el día'), t('Buen comienzo')];
    if (hour < 19) return [t('Buenas tardes'), t('Qué tal'), t('Seguimos'), t('Buena tarde'), t('A media marcha'), t('Hola')];
    return [t('Buenas noches'), t('Buenas'), t('A cerrar el día'), t('Ya de noche'), t('Hola')];
}

function _pickGreeting() {
    const now = Date.now();
    const block = Math.floor(now / _GREETING_BLOCK_MS);
    const sal = _greetingSalutations(new Date(now).getHours());
    const subs = _greetingSubtitles();
    return {
        block,
        salutation: sal[block % sal.length],
        subtitle: subs[block % subs.length],
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

// [P1-SWAP-LOADING-UX · 2026-07-10] Overlay "cocinando" por meal-card. Antes: el swap
// individual solo giraba el icono del botón + un toast, y "actualizar día" dejaba las
// cards CONGELADAS 2-4 minutos con el único feedback en el botón superior ("Actualizando…").
// Ahora cada card en proceso muestra scrim + shimmer + chip con etapas rotando (el `seed`
// desfasa la etapa inicial por card para que el modo día no se vea clonado). El overlay
// además bloquea la interacción con la card mientras carga (pointer-events del scrim).
// [P1-I18N-DASHBOARD · 2026-08-15] Las tres tablas de etapas pasan de constantes a
// funciones: se leen dentro del render de `MealCookingOverlay`, ya con catálogo.
function _cookingStagesSingle() {
    return [
        t('El chef está pensando…'),
        t('Buscando en tu Nevera…'),
        t('Cuadrando tus macros…'),
        t('Escribiendo la receta…'),
    ];
}
function _cookingStagesDay() {
    return [
        t('Rediseñando tu día…'),
        t('Variando las proteínas…'),
        t('Cuadrando los macros del día…'),
        t('Puliendo las recetas…'),
    ];
}
// [P2-COOKING-OVERLAY-PROGRESS · 2026-07-12] Cola de "paciencia" post-etapas: frases variadas
// a ritmo calmado (8s) para regens largos — antes las 4 etapas rotaban en círculo cada 3.5s
// y "se sentía como bucle" (feedback del owner). La marcha principal ahora es ÚNICA
// (sensación de progreso real) y la cola tarda ~64s en repetirse.
function _cookingStagesTail() {
    return [
        t('Ajustando las porciones…'),
        t('Afinando sabores criollos…'),
        t('Revisando la lista de compras…'),
        t('Cuidando tus macros…'),
        t('Un plato bueno toma su tiempo…'),
        t('Emplatando los detalles…'),
        t('Verificando cada ingrediente…'),
        t('Ya casi está…'),
    ];
}
function MealCookingOverlay({ mode = 'single', seed = 0 }) {
    const t = useT();
    const stages = mode === 'day' ? _cookingStagesDay() : _cookingStagesSingle();
    const tailStages = _cookingStagesTail();
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 4000);
        return () => clearInterval(id);
    }, []);
    // Marcha única (offset 0/1 por seed para que las cards del modo día no se vean clonadas,
    // clamp en la última etapa) → luego cola de paciencia (8s por frase, offset por seed).
    const _mainIdx = Math.min((Math.abs(seed) % 2) + tick, stages.length - 1);
    const _inMain = tick < stages.length + 1;
    const _tailIdx = Math.abs(seed + Math.floor(Math.max(0, tick - stages.length) / 2)) % tailStages.length;
    const label = _inMain ? stages[_mainIdx] : tailStages[_tailIdx];
    return (
        <div className="meal-cooking-overlay" role="status" aria-live="polite" aria-label={t('Actualizando plato con IA')}>
            <div className="meal-cooking-chip">
                <ChefHat size={18} className="cook-icon" aria-hidden="true" />
                <span key={label} className="meal-cooking-text">{label}</span>
            </div>
        </div>
    );
}

const DashboardInner = () => {
    // [P1-I18N-DASHBOARD · 2026-08-15] `useT()` y no el `t` de módulo: el hook es lo
    // que suscribe este componente al cambio de idioma. Sombrea al import a
    // propósito — es exactamente la misma función, con la suscripción encima.
    const t = useT();
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
        dayRegenInFlight, // [P1-DAY-REGEN-RESUME · 2026-07-10] regen del día in-flight (sobrevive refresh)
        dayRegenIndex, // [P2-DAYREGEN-OVERLAY-SCOPE · 2026-07-12] qué día está en regen (escopa el overlay al tab)
        mealRegenInFlight, // [P1-SWAP-REGEN-RESUME · 2026-07-11] swap individual in-flight (sobrevive refresh)
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
        isGuest,
        // [P1-DASHBOARD-PLAN-SELFHEAL · 2026-07-25] Ver el efecto de auto-sanación abajo.
        hydrateLatestPlan,
        // [P1-PLAN-POLL-BOUNDED · 2026-07-29] El poll de AssessmentContext se rindió tras
        // el tope de give-up — anotación mínima más abajo, ver render de isPlanCorrupted.
        planPollGaveUp,
    } = useAssessment();

    const { regeneratePlan } = useRegeneratePlan();

    const navigate = useNavigate();

    // ─────────────────────────────────────────────────────────────────────────
    // [P1-DASHBOARD-PLAN-SELFHEAL · 2026-07-25] "Sigo teniendo que refrescar."
    //
    // Cuarta vez que se reporta el mismo síntoma. Las tres correcciones anteriores parchearon
    // CAMINOS (el recuperador, y dos sitios de Plan.jsx) y siempre apareció otro. Este efecto
    // deja de contar caminos y pone la comprobación en el DESTINO: da igual quién navegue al
    // dashboard, al llegar se pregunta si el backend tiene un plan que el usuario aún no ve.
    //
    // Contrato: `/pending-status` devuelve `plan_id_final` cuando el pipeline terminó. Si ese id
    // no es el del plan local, se adopta y RECIÉN ENTONCES se ackea. **El ack es el recibo de que
    // el usuario recibió el plan, no de que navegamos** — mientras no se adopte, el KV sigue vivo
    // y cualquier montaje posterior vuelve a intentarlo. Eso es lo que lo hace auto-sanante.
    //
    // Por qué no basta con "adoptar el más reciente": rompería restaurar un plan del Historial
    // (ahí el usuario elige a propósito uno más viejo). Por eso el discriminante es el
    // `plan_id_final` que el BACKEND declara, no una comparación de fechas.
    const selfHealRef = useRef(false);
    useEffect(() => {
        if (selfHealRef.current || isGuest) return;
        selfHealRef.current = true;
        (async () => {
            try {
                const r = await fetchWithAuth('/api/plans/pending-status');
                if (!r.ok) return;
                const st = await r.json();
                if (st?.status !== 'complete' || !st?.plan_id_final) return;
                if (planData?.id && planData.id === st.plan_id_final) return;  // ya lo tiene
                await hydrateLatestPlan?.({
                    force: true, expectPlanId: st.plan_id_final, src: 'dashboard-selfheal',
                });
                await fetchWithAuth('/api/plans/pending-status/ack', { method: 'POST' });
            } catch { /* silencioso: es una red de seguridad, no un camino crítico */ }
        })();
        // Sin dependencias: corre UNA vez por montaje del dashboard. El guard `selfHealRef`
        // evita re-disparos por re-render; volver a /dashboard remonta y vuelve a comprobar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
         
    }, [planData?.micronutrient_report, planData?.micronutrient_supplement_advice, _planMicroSig]);

    const microReport = useMemo(() => {
        if (planData?.micronutrient_report) return planData.micronutrient_report;
        if (!_planMicroSig) return null;
        const c = safeJSONParse(safeLocalStorageGet('mealfit_micros_cache', null), null);
        return c && c.sig === _planMicroSig ? c.report : null;
         
    }, [planData?.micronutrient_report, _planMicroSig]);

    const microAdvice = useMemo(() => {
        if (planData?.micronutrient_supplement_advice) return planData.micronutrient_supplement_advice;
        if (!_planMicroSig) return null;
        const c = safeJSONParse(safeLocalStorageGet('mealfit_micros_cache', null), null);
        return c && c.sig === _planMicroSig ? c.advice : null;
         
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
        const _sev = planData?._quality_degraded_severity === 'high' ? t('Importante') : t('Menor');
        // [P3-BANNER-REASON-COPY · 2026-07-10] prefix-match para low_band_macro:<macros>.
        const _reasonLabel = _reason ? resolveQualityDegradedLabel(_reason) : null;
        // [P2-DEGRADED-HEADLINE-TRUTH · 2026-07-31] Mismo SSOT que el banner: la
        // notificación decía "Plan no óptimo (1 intento)" incluso cuando el revisor
        // había APROBADO y el degradado venía de una auditoría posterior.
        const _head = resolveQualityDegradedHeadline(_reason, _attempts);
        const _reasonText = _reasonLabel
            ? t('Motivo ({severidad}): {motivo}', { severidad: _sev, motivo: _reasonLabel })
            : _head.body;
        return {
            id: _planMicroSig ? `quality_${_planMicroSig}` : undefined,
            kind: 'quality',
            title: _head.exhausted
                ? tn(_attempts, 'Plan no óptimo ({n} intento)', 'Plan no óptimo ({n} intentos)', { n: _attempts })
                : t('Plan listo, con un aviso'),
            message: _reasonText,
            severity: 'warning',
            // Payload estructurado para la vista expandida.
            data: {
                attempts: _attempts,
                severityLabel: _sev,
                reasonLabel: _reasonLabel,
                guidance: _head.exhausted
                    ? t('Te entregamos la mejor versión disponible. Usa “Cambiar Plato” para reemplazar comidas puntuales, o regenera el plan completo si quieres reintentarlo.')
                    : t('El plan está entregado; esto es un aviso sobre un punto a revisar. Usa “Cambiar Plato” en la comida señalada si quieres ajustarlo.'),
            },
        };
    // [P1-I18N-DASHBOARD · 2026-08-15] `t` entra en las deps de todos los memos de
    // copy: la identidad es estable (es la misma función de módulo que devuelve
    // `useT`), así que no re-crea nada — sólo mantiene honesto a exhaustive-deps.
    }, [planData?._quality_degraded, planData?._quality_degraded_attempts, planData?._quality_degraded_reason, planData?._quality_degraded_severity, _planMicroSig, t]);

    const dismissQDegraded = () => {
        const notif = buildQualityNotification();
        if (notif) addNotification(notif);
        // Marca el backfill hecho → no re-crear si luego la borras del centro.
        if (_planMicroSig) safeLocalStorageSet(`mealfit_qdeg_notif_backfilled_${_planMicroSig}`, '1');
        setQDegradedHidden(true);
        if (_planMicroSig) safeLocalStorageSet(`mealfit_qdeg_dismissed_${_planMicroSig}`, '1');
    };

    // [P1-FIX-SODIUM-DAY · 2026-08-02] "Arreglar este día" — puente de un clic entre el banner
    // `micro_worst_day_ceiling` y el swap sodio-consciente ya desplegado
    // (P1-SODIUM-AWARE-PLACEMENT). Caso real que lo motiva: banner "1 de 3 días se pasa del
    // techo (peor: Día 1)" con ricotta+camarones — el usuario tuvo que ADIVINAR qué plato
    // cambiar (y cambió el de OTRO día). El backend identifica el día/comida y hace TODO
    // (swap LLM + persist) server-side; el endpoint responde solo un resumen (no el plan
    // completo), así que el éxito exige un re-fetch — mismo patrón que el resume server-side
    // de P1-DAY-REGEN-RESUME (`applyRegenPlan`, más abajo en este archivo).
    const [fixSodiumDayLoading, setFixSodiumDayLoading] = useState(false);

    // [P1-EAT-PLAN-MEAL · 2026-08-07] "Me lo comí" — el camino de consumo MÁS
    // preciso del sistema y el único sin adivinanza: el plato del plan ya trae
    // su lista de ingredientes con cantidades, así que el backend descuenta la
    // Nevera con aritmética sobre datos que él mismo escribió (cero LLM, cero
    // visión, cero porción inferida).
    //
    // Mandamos COORDENADAS (plan_id + índices), nunca el contenido del plato:
    // si el cliente pudiera declarar `ingredients`, podría descontar de la
    // Nevera lo que quisiera. El backend relee `plan_data` filtrando por dueño.
    //
    // `index` es el índice REAL dentro de `currentDayMeals` (el mismo que
    // protege P2-SWAP-INDEX-COUPLING y que consume `todaysEatenIndices`), y
    // `activeDayIndex` el del día vivo — por eso el botón sólo existe en la
    // pestaña de HOY: en un día archivado esas coordenadas no apuntan a
    // `plan_data.days`.
    const [eatMealInFlight, setEatMealInFlight] = useState(null);
    const handleEatPlanMeal = async (meal, index) => {
        if (isGuest) { toast(t('Crea tu cuenta para registrar lo que comes')); return; }
        if (!planData?.id || eatMealInFlight !== null) return;
        setEatMealInFlight(index);
        try {
            const resp = await fetchWithAuth('/api/diary/consumed-from-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan_id: planData.id,
                    day_index: activeDayIndex,
                    meal_index: index,
                }),
            });
            let result = null;
            try { result = await resp.json(); } catch (_) { /* body vacío o no-JSON */ }
            if (!resp.ok || !result?.success) {
                const msg = (typeof result?.detail === 'string' ? result.detail : null)
                    || t('Inténtalo de nuevo en un momento.');
                toast.error(t('No se pudo registrar'), { description: msg });
                return;
            }
            if (result.already_logged) {
                toast(t('Ya lo tenías registrado'), {
                    description: t('No lo contamos dos veces.'),
                });
            } else {
                // [P1-PANTRY-NAME-RESOLUTION · 2026-08-07] Decir QUÉ no bajó de
                // la Nevera. Callar los ausentes dejaría al usuario creyendo que
                // todo se descontó — exactamente la mentira que aquel P-fix
                // eliminó del lado del chat. No es un error: comer algo que no
                // tenías registrado es normal.
                const ausentes = Array.isArray(result.not_in_pantry) ? result.not_in_pantry : [];
                const descontados = (Array.isArray(result.deducted) ? result.deducted.length : 0)
                    + (Array.isArray(result.inferred) ? result.inferred.length : 0);
                toast.success(t('{plato} registrado', { plato: result.meal_name }), {
                    description: ausentes.length > 0
                        ? t('Descontamos {n} de tu Nevera. No estaban registrados: {faltantes}', {
                            n: descontados,
                            faltantes: `${ausentes.slice(0, 3).join(', ')}${ausentes.length > 3 ? '…' : ''}`,
                        })
                        : (descontados > 0
                            ? tn(descontados, 'Descontamos {n} ingrediente de tu Nevera.', 'Descontamos {n} ingredientes de tu Nevera.', { n: descontados })
                            : t('Sumado a tu diario de hoy.')),
                });
            }
            // TrackingProgress escucha `refresh-inventory` → refetch del diario →
            // despacha `today-consumed-updated` → este Dashboard re-deriva
            // `todaysEatenIndices` y atenúa la card. Un solo evento basta.
            window.dispatchEvent(new Event('mealfit:refresh-inventory'));
        } catch (err) {
            console.error('Error registrando plato del plan:', err);
            toast.error(t('No se pudo registrar'), { description: t('Revisa tu conexión.') });
        } finally {
            setEatMealInFlight(null);
        }
    };
    // [P1-PANTRY-STRICT-CONSENT · 2026-08-02] `allowNewIngredients` (default null): nombres que
    // el usuario YA consintió comprar (modal "Tu Nevera no alcanza") — se reenvían al backend,
    // que amplía el universo autorizado y re-corre el swap sodio-consciente.
    const handleFixSodiumDay = async (allowNewIngredients = null) => {
        if (!planData?.id || fixSodiumDayLoading) return;
        setFixSodiumDayLoading(true);
        try {
            const resp = await fetchWithAuth(`${API_BASE}/api/plans/${planData.id}/fix-sodium-day`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(
                    Array.isArray(allowNewIngredients) && allowNewIngredients.length > 0
                        ? { allow_new_ingredients: allowNewIngredients }
                        : {}
                ),
            });
            let result = null;
            try { result = await resp.json(); } catch (_) { /* body vacío o no-JSON */ }
            if (!resp.ok) {
                const msg = result?.detail?.message
                    || (typeof result?.detail === 'string' ? result.detail : null)
                    || t('Inténtalo de nuevo en un momento.');
                toast.error(t('No se pudo arreglar el día'), { description: msg });
                setPantryConsent(null);
                pantryConsentContext.current = null;
                return;
            }
            // [P1-PANTRY-STRICT-CONSENT] El chef no encontró una comida menos salada SOLO con la
            // Nevera real — nombra qué falta en vez de introducirlo en silencio. Se chequea ANTES
            // de `fixed`/soft-fail genérico: hay una acción concreta (consentir o buscar otra vía).
            if (result?.needs_new_ingredients === true) {
                pantryConsentContext.current = { source: 'fix-sodium-day' };
                setPantryConsent({
                    missing: result.missing_ingredients || [],
                    message: result.message || t('El chef necesita ingredientes que no están en tu Nevera.'),
                    busy: false,
                });
                return;
            }
            setPantryConsent(null);
            pantryConsentContext.current = null;
            if (result?.fixed === true) {
                // El endpoint YA persistió atómicamente (mismo mutator que /swap-meal/persist:
                // day-band rebalance + micros/techos + listas inline) — solo falta traer el plan
                // fresco. Mismo mecanismo de refresh que usa el resume server-side del swap
                // individual: GET /api/plans-data/latest + setPlanData.
                try {
                    const latestResp = await fetchWithAuth('/api/plans-data/latest');
                    if (latestResp.ok) {
                        const { plan } = await latestResp.json();
                        const pdNew = plan?.plan_data;
                        if (pdNew) {
                            if (pdNew.id == null && plan?.id != null) pdNew.id = plan.id;
                            setPlanData(pdNew);
                            safeLocalStorageSet('mealfit_plan', pdNew);
                        }
                    }
                } catch (_) { /* no-op: el toast ya confirma el éxito; el próximo poll refresca */ }
                const underCeilingCopy = result.day_under_ceiling ? t(', bajo el techo ✓') : '';
                toast.success(`Día ${Number(result.day) + 1} arreglado`, {
                    description: `${result.old_meal} → ${result.new_meal} `
                        + `(${result.sodio_antes_mg}→${result.sodio_despues_mg} mg de sodio${underCeilingCopy}).`,
                    duration: 8000,
                });
            } else if (result?.code === 'ceiling_not_sodium') {
                // [P1-FIX-SODIUM-DAY-HONEST · 2026-08-02] `micro_worst_day_ceiling` no es
                // sodio-exclusivo: el backend leyó la MISMA fuente que armó el banner y el
                // techo roto del peor día es OTRO nutriente (azúcar añadida/grasa saturada/
                // potasio). No es un error — es información honesta: este botón no aplica
                // aquí. El plan quedó intacto (el backend no tocó nada), así que NO
                // refrescamos; el banner se queda tal cual.
                toast(result.message || t('El aviso de este día no es por sodio.'), { duration: 7000 });
            } else if (result?.code === 'no_day_over_ceiling') {
                // Honesto: puede que el panel ya estuviera stale (el usuario resolvió el día a
                // mano). Refrescamos igual — si el banner seguía vivo por caché local, desaparece.
                try { await hydrateLatestPlan?.({ force: true, src: 'fix-sodium-day-noop' }); } catch (_) { /* no-op */ }
                toast(result.message || t('Ya está bajo el techo de sodio.'), { duration: 6000 });
            } else {
                // Soft-fail del chef (retries agotados / clínico / nevera vacía / IA ocupada):
                // el banner queda, el plan está intacto.
                toast.error(t('El chef IA no pudo arreglar este día'), {
                    description: result?.error_message || t('Inténtalo de nuevo en un momento.'),
                    duration: 8000,
                });
            }
        } catch (_e) {
            toast.error(t('No se pudo arreglar el día'), { description: t('Revisa tu conexión e inténtalo de nuevo.') });
        } finally {
            setFixSodiumDayLoading(false);
        }
    };

    // [P1-PANTRY-STRICT-CONSENT · 2026-08-02] Ejecuta (o re-ejecuta) un swap de UN plato con el
    // flujo de "Nevera estricta + consentimiento" — SSOT usado por el modal "¿Por qué quieres
    // cambiar?", la confirmación de "No me gusta" y el reintento/consentimiento del modal "Tu
    // Nevera no alcanza". `allowNewIngredients` (default null) viaja tal cual a
    // `regenerateSingleMeal` — si viene, el backend amplía el universo autorizado con esos
    // nombres; si no, cocina SOLO desde la Nevera real.
    const runSwapWithConsentFlow = async ({
        dayIndex, mealIndex, mealType, mealName, swapReason, allowNewIngredients = null,
        loadingTitle = t('🔄 Consultando al Chef IA...'),
    }) => {
        if (swapInFlightLock.current) return;
        swapInFlightLock.current = true;
        setRegeneratingId(mealIndex);
        const toastId = toast.loading(loadingTitle, { description: t('Buscando una alternativa deliciosa...') });
        try {
            const result = await regenerateSingleMeal(
                dayIndex, mealIndex, mealType, mealName,
                swapReason,
                liveInventory, // ← [P0-1] detectar ingredientes nuevos post-restock
                allowNewIngredients,
            );
            trackEvent('plan_regeneration_triggered', {
                reason: swapReason,
                source: 'dashboard',
                is_expired: isPlanExpired,
                has_pantry: liveInventory && liveInventory.length > 0,
                type: 'single_meal',
            });
            toast.dismiss(toastId);
            if (result && typeof result === 'object' && result.needsConsent) {
                // El chef no encontró alternativa SOLO con la Nevera real — abre (o refresca) el
                // modal de consentimiento en vez de un toast. Nada se persiste todavía.
                pantryConsentContext.current = { dayIndex, mealIndex, mealType, mealName, swapReason };
                setPantryConsent({ missing: result.missing, message: result.message, busy: false });
                return;
            }
            setPantryConsent(null);
            pantryConsentContext.current = null;
            // [P2-SWAP-TOAST-FIX · 2026-06-29] Solo "¡Menú Actualizado!" si HUBO cambio real —
            // en soft-fail `regenerateSingleMeal` devuelve null y YA mostró su toast.error propio.
            if (result) {
                // [P1-I18N-DASHBOARD · 2026-08-15] El título se queda SIN `t()` a
                // propósito: `Dashboard.p1_pantry_strict_consent.test.js` ancla la
                // cadena `toast.success('¡Menú Actualizado!'` con el paréntesis y la
                // comilla pegados, y envolverla la rompería desde otro fichero.
                toast.success('¡Menú Actualizado!', { description: t('Cambiado por: {plato}', { plato: result }), icon: '👨‍🍳' });
            }
        } catch (error) {
            console.error('Error al regenerar:', error);
            toast.dismiss(toastId);
            toast.error(t('No se pudo conectar con la IA'), { description: t('Se usó una receta alternativa local.') });
            setPantryConsent(null);
            pantryConsentContext.current = null;
        } finally {
            setRegeneratingId(null);
            swapInFlightLock.current = false;
        }
    };

    // Handlers del modal "Tu Nevera no alcanza" — despachan a `runSwapWithConsentFlow` (swap de
    // un plato) o a `handleFixSodiumDay` (botón "Arreglar este día") según quién lo abrió.
    const handlePantryConsentConfirm = async () => {
        const ctx = pantryConsentContext.current;
        if (!ctx || !pantryConsent) return;
        const names = (pantryConsent.missing || []).map((m) => m?.name).filter(Boolean);
        if (names.length === 0) return;
        setPantryConsent((prev) => (prev ? { ...prev, busy: true } : prev));
        if (ctx.source === 'fix-sodium-day') {
            await handleFixSodiumDay(names);
        } else {
            await runSwapWithConsentFlow({ ...ctx, allowNewIngredients: names });
        }
    };

    const handlePantryConsentRetry = async () => {
        const ctx = pantryConsentContext.current;
        if (!ctx) return;
        setPantryConsent((prev) => (prev ? { ...prev, busy: true } : prev));
        if (ctx.source === 'fix-sodium-day') {
            await handleFixSodiumDay(null);
        } else {
            await runSwapWithConsentFlow({ ...ctx, allowNewIngredients: null });
        }
    };

    const handlePantryConsentClose = () => {
        // Cancelar: el plato/día se queda como está — nada entró a la lista de compras.
        setPantryConsent(null);
        pantryConsentContext.current = null;
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
            title: t('Revisa tu lista de compras'),
            message: tn(cc,
                'Algunas recetas mencionan ingredientes que no quedaron bien reflejados en tu lista ({n} detalle). Usa “Cambiar Plato” en las comidas que te parezcan inconsistentes.',
                'Algunas recetas mencionan ingredientes que no quedaron bien reflejados en tu lista ({n} detalles). Usa “Cambiar Plato” en las comidas que te parezcan inconsistentes.',
                { n: cc }),
            severity: 'warning',
        };
    }, [planData?._swap_coherence_warnings?.critical_count, _planMicroSig, t]);
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
    // [P2-BUDGET-BANNER-FLASH · 2026-08-15] La ocultación se DERIVA en el render,
    // no en un efecto.
    //
    // Antes: `useState(false)` + `useEffect` que leía localStorage. Consecuencia
    // medible en cada refresh con el banner ya descartado: el primer render lo
    // pintaba (hidden=false), el efecto corría DESPUÉS del paint y lo escondía —
    // una franja ámbar de unos milisegundos que el dueño describió como «un
    // subrayado amarillo del presupuesto». Es el mismo patrón que el parche mate
    // del page-loader: un estado que nace con el valor equivocado y se corrige
    // tras pintar es un parpadeo garantizado.
    //
    // `useMemo` con la MISMA clave (plan+status) lee la señal en el mismo render
    // que decidiría pintar el banner: no existe frame intermedio. `_dismissTick`
    // cubre el único caso que el memo no ve solo — el usuario acaba de pulsar la
    // X (la clave no cambia, pero el valor guardado sí).
    const _budgetDismissKey = (_planMicroSig && _budgetStatus)
        ? `mealfit_budget_dismissed_${_planMicroSig}_${_budgetStatus}` : null;
    const [_budgetDismissTick, _setBudgetDismissTick] = useState(0);
    const budgetBannerHidden = useMemo(
        () => !!(_budgetDismissKey && safeLocalStorageGet(_budgetDismissKey, '') === '1'),
        [_budgetDismissKey, _budgetDismissTick]
    );
    const buildBudgetNotification = useCallback(() => {
        const _br = planData?.budget_reconciliation;
        if (!_br || !_br.status || _br.status === 'sin_limite' || !_br.reference_rd) return null;
        const _fmt = (v) => `RD$${Math.round(v || 0).toLocaleString('es-DO')}`;
        const _est = _br.basis && _br.basis !== 'custom' ? t(' (referencia estimada)') : '';
        const title = _br.status === 'dentro'
            ? t('Presupuesto: dentro de tu referencia')
            : _br.status === 'cerca'
                ? t('Presupuesto: al límite de tu referencia')
                : t('Presupuesto: tu lista supera tu referencia');
        const subs = Array.isArray(_br.substitutions) && _br.substitutions.length
            ? ` ${t('Para cuidar tu bolsillo ajustamos: {sustituciones}.', { sustituciones: _br.substitutions.slice(0, 3).join(' · ') })}` : '';
        return {
            id: _planMicroSig ? `budget_${_planMicroSig}_${_br.status}` : undefined,
            kind: 'info',
            title,
            message: `${t('{estimado} de {referencia}{nota} por ciclo.', { estimado: _fmt(_br.estimated_cycle_rd), referencia: _fmt(_br.reference_rd), nota: _est })}${subs}`,
            severity: _br.status === 'excedido' ? 'warning' : 'info',
        };
    }, [planData?.budget_reconciliation, _planMicroSig, t]);
    const dismissBudgetBanner = () => {
        const notif = buildBudgetNotification();
        if (notif) addNotification(notif);
        // [P2-BUDGET-BANNER-FLASH] Primero el storage, después el tick: el memo
        // re-lee al cambiar el tick, así que el orden inverso re-leería el valor
        // viejo y la X parecería no responder.
        if (_budgetDismissKey) safeLocalStorageSet(_budgetDismissKey, '1');
        _setBudgetDismissTick((n) => n + 1);
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
            title: t('Razonamiento de tu plan'),
            message: t('Diagnóstico, plan de acción y tip del chef de tu plan actual.'),
            severity: 'info',
            data: { insights },
        };
    }, [planData?.insights, _planMicroSig, t]);
    const dismissReasoning = () => {
        const notif = buildInsightsNotification();
        if (notif) addNotification(notif);
        setReasoningHidden(true);
        if (_planMicroSig) safeLocalStorageSet(insightsDismissKey(_planMicroSig), '1');
        toast(t('Razonamiento guardado'), {
            description: t('Quedó en Notificaciones (campana) — ábrelas para volver a mostrarlo cuando quieras.'),
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
    // [P1-PANTRY-STRICT-CONSENT · 2026-08-02] Estado del modal "Tu Nevera no alcanza":
    // { missing, message, busy } | null. `pantryConsentContext` guarda el swap que lo disparó
    // (dayIndex/mealIndex/mealType/mealName/swapReason **o** `source:'fix-sodium-day'`) para que
    // "Añadir y continuar"/"Buscar otra opción" sepan QUÉ re-intentar.
    const [pantryConsent, setPantryConsent] = useState(null);
    const pantryConsentContext = useRef(null);
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
    //
    // [P1-DASH-WEEK-NAV · 2026-08-04] "Qué día miro" y "qué día escribo" dejan
    // de ser el mismo número. La navegación por semanas muestra también días
    // ARCHIVADOS (`_archived_days`), que tienen su PROPIO rango de índices; si
    // los dos rangos se mezclaran, el índice 0 dejaría de ser `days[0]` y un
    // "Cambiar Plato" reescribiría otro día en silencio — `/swap-meal/persist`
    // escribe con la ruta jsonb `{days,<i>,meals,<j>}`.
    //
    // `selectedDay` es la SELECCIÓN. `activeDayIndex` sigue existiendo como
    // valor DERIVADO para los consumidores de lectura, y `writableIdx` es lo
    // único que puede viajar a una escritura. Ver `writableDayIndex` en
    // utils/planWeeks.js, que es el único sitio que deriva ese índice.
    const [selectedDay, setSelectedDay] = useState({ origen: 'vivo', idx: 0 });
    const writableIdx = writableDayIndex(selectedDay);
    const isReadOnlyDay = writableIdx === null;
    const activeDayIndex = writableIdx ?? 0;
    const [isRecalculating, setIsRecalculating] = useState(false);
    // [P1-TODAY-REMAINING · 2026-07-28] Comidas del diario de HOY, para
    // atenuar en "Tu Menú" el card cuyo slot ya se comió (derivado, NUNCA
    // escrito a plan_data — invariante I6). NO se re-fetchea aquí: la card
    // "Progreso en Tiempo Real" (TrackingProgress.jsx) ya es dueña del
    // fetch/cache/delete de `consumed_meals` y emite este evento con CADA
    // cambio de su estado — un segundo `GET /api/diary/consumed/{userId}`
    // aquí crearía una segunda fuente de verdad que puede divergir de la
    // primera tras un delete.
    const [todaysConsumedMeals, setTodaysConsumedMeals] = useState([]);
    useEffect(() => {
        const onTodaysConsumedUpdated = (event) => {
            const meals = event?.detail?.meals;
            if (Array.isArray(meals)) setTodaysConsumedMeals(meals);
        };
        window.addEventListener('mealfit:today-consumed-updated', onTodaysConsumedUpdated);
        return () => window.removeEventListener('mealfit:today-consumed-updated', onTodaysConsumedUpdated);
    }, []);
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
    // [P2-14 · 2026-07-09] Hook SSOT (antes useState + matchMedia local con
    // fallback addListener; el hook cubre ambas APIs).
    const isMobileViewport = useMediaQuery('(max-width: 768px)');

    // Estado para "Nevera Virtual" - ingredientes temporalmente marcados como agotados
    // [P2-15 · 2026-07-09] Single-source: el store compartido reemplaza el
    // useState local + espejo manual a localStorage. Pantry consume el MISMO
    // store → cero drift same-tab (antes Pantry solo veía cambios cross-tab).
    // El validator estricto array-de-strings (P2-A) y la lectura defensiva
    // (P4-LOCALSTORAGE-LAZY-INIT) viven ahora dentro del hook.
    const [disabledIngredients, setDisabledIngredients] = useDisabledIngredients();

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
            // Fast path: context tiene planCount fresco (cargado al login).
            // userPlanLimit '∞' o 'Ilimitado' → siempre dejar pasar.
            if (userPlanLimit === '∞' || userPlanLimit === 'Ilimitado' || typeof userPlanLimit !== 'number') {
                return true;
            }
            // Si el cache local está vigente (<120s), validar SIN fetch.
            // [P2-3 · 2026-07-09] getFreshPlanCount (queryClient.fetchQuery,
            // key por usuario, TTL 120s vía staleTime): antes
            // window.__cachedQuota global SIN user_id — requería purga manual
            // en logout (P2-QUOTA-CACHE-XUSER); ahora clearUserQueryCache()
            // lo evicta estructuralmente + dedup in-flight con los gates de
            // useRegeneratePlan/Settings (misma key, TTLs propios).
            const freshPlanCount = await getFreshPlanCount(
                userProfile?.id, checkPlanLimit, { ttlMs: 120 * 1000 },
            );

            if (freshPlanCount >= userPlanLimit) {
                toast.error(t('Sin créditos'), { description: t('No tienes créditos de regeneración disponibles.') });
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
    // `_isLoadingInventory` (prefijo _): el valor ya no se lee (el fail-open del
    // gate migró al null-check de pantryItemCount, P3-PLAN-BTN-STABLE), pero el
    // initializer `useState(!_cachedInv)` es anchor del test parser-based
    // backend/tests/test_p1_dashboard_cache_inventory.py — NO eliminar.
    const [_isLoadingInventory, setIsLoadingInventory] = useState(!_cachedInv);

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
    // [P1-DAY-REGEN-RESUME · 2026-07-10] Espejo del flag del contexto: al REMONTAR tras un
    // refresh con regen del día in-flight, el resume del contexto pone dayRegenInFlight=true
    // → re-encendemos el overlay "cocinando" local; cuando el poll detecta el persist (o
    // agota el timeout), lo apagamos. Solo transiciones (no pisa el set local del click).
    const _prevDayRegenRef = useRef(false);
    useEffect(() => {
        if (dayRegenInFlight && !_prevDayRegenRef.current) setIsDayUpdating(true);
        if (!dayRegenInFlight && _prevDayRegenRef.current) setIsDayUpdating(false);
        _prevDayRegenRef.current = dayRegenInFlight;
    }, [dayRegenInFlight]);
    // [P1-SWAP-REGEN-RESUME · 2026-07-11] Espejo para el swap INDIVIDUAL: al remontar tras
    // un refresh con swap in-flight, el resume del contexto pone mealRegenInFlight →
    // re-encendemos el spinner del card (regeneratingId), escopado al día VISIBLE
    // (regeneratingId es un índice dentro de currentDayMeals — sin el guard de
    // activeDayIndex el spinner aparecería en el card equivocado de otro día).
    const _prevMealRegenRef = useRef(false);
    useEffect(() => {
        const inFlight = !!mealRegenInFlight && mealRegenInFlight.dayIndex === activeDayIndex;
        if (inFlight && !_prevMealRegenRef.current) setRegeneratingId(mealRegenInFlight.mealIndex);
        if (!inFlight && _prevMealRegenRef.current) setRegeneratingId(null);
        _prevMealRegenRef.current = inFlight;
    }, [mealRegenInFlight, activeDayIndex]);
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
                toast.warning(t('Tu perfil aún se está cargando. Inténtalo en un momento.'), {
                    duration: 3500,
                });
            }
            return false;
        }
        updateUserProfile({ health_profile: payload });
        return true;
    // formDataRef.current se lee desde el ref (siempre latest) → sin dep.
     
    }, [updateUserProfile, userProfile, session, t]);

    // Hydrate disabledIngredients from DB (merges with the shared store)
    // [P2-15 · 2026-07-09] Bug latente cerrado: el dep era [userProfile?.id]
    // (solo id) → un cambio de CONTENIDO de health_profile.disabled_ingredients
    // con el mismo id (write desde otro dispositivo + refetch de perfil) NO
    // re-mergeaba. Ahora depende del contenido serializado. El bail-out
    // (retornar `prev` si la unión no añade nada) evita re-notificar el store
    // y re-disparar el sync debounced a DB en un loop.
    const _dbDisabledKey = JSON.stringify(userProfile?.health_profile?.disabled_ingredients ?? null);
    useEffect(() => {
        if (!userProfile?.id || !userProfile.health_profile) return;
        const dbDisabled = userProfile.health_profile.disabled_ingredients;
        if (Array.isArray(dbDisabled) && dbDisabled.length > 0) {
            setDisabledIngredients(prev => {
                const merged = [...new Set([...dbDisabled, ...prev])];
                return merged.length === prev.length ? prev : merged;
            });
        }
    }, [userProfile?.id, _dbDisabledKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync disabledIngredients → backend (debounced) on every change.
    // [P2-15] El espejo a localStorage lo hace el store compartido — aquí
    // queda solo la persistencia a health_profile.
    useEffect(() => {
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
                // [P1-DASH-INV-CACHE-WRITE · 2026-08-14] Reponer la caché, que hasta
                // hoy este fetch NO tocaba.
                //
                // EL CIRCUITO ESTABA A MEDIAS. P1-DASHBOARD-CACHE-INVENTORY añadió la
                // LECTURA (el `useState(_cachedInv || null)` de arriba) y su comentario
                // decía «Dashboard solo guardaba sin leer»... pero el único
                // `setCachedInventory` del fichero vive dentro del flujo de RESTOCK.
                // O sea que la caché la producía la Nevera y la consumía el Dashboard,
                // sin reponerse: quien no entra a /dashboard/pantry —o entró hace más
                // de 10 min, el TTL— arrancaba con `liveInventory = null` en CADA F5.
                //
                // Consecuencia visible, que es como se detectó: `shoppingDeltaMeta`
                // exige `liveInventory !== null`, así que el aviso «Tu Nevera ya cubre
                // la lista (N ítems)» no se pintaba hasta que resolvía este fetch. El
                // dueño lo reportó como «desaparece unos milisegundos al refrescar».
                //
                // ⚠️ Va DENTRO del `!result.stale`: `fetchFreshInventoryWithTimeout`
                // marca stale en timeout/error/respuesta vacía, y persistir eso
                // guardaría el fallo durante los 10 min del TTL y lo serviría como si
                // fuera el inventario real del usuario. Un fallo puntual no puede
                // convertirse en diez minutos de mentira.
                setCachedInventory(result.data);
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
                // [P1-DASH-INV-CACHE-WRITE · 2026-08-14] La cache sigue al estado.
                // Si este callsite avanza `liveInventory` y no repone la cache, el
                // proximo montaje hidrataria con un valor VIEJO -- peor que arrancar
                // sin ninguno, porque un dato caducado no se distingue de uno fresco.
                setCachedInventory(result.data);
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

        // [P0-DASH-CHIP-HONESTY · 2026-05-09] Estados activos en los
        // que la queue puede tener chunks moviéndose o pausados.
        // 'rolling' incluido porque rolling_refill chunks viven aquí
        // post-first-chunk-completed. Sin esto, un plan en
        // 'generating_next' con todos los chunks pausados se quedaba
        // sin polling de chunkStatusInfo (chip seguía mintiendo).
        //
        // [P2-CHUNK-OVERDUE-SIGNAL · 2026-08-04] 'complete_partial' añadido, y
        // no por simetría: medición read-only sobre los 24 planes vivos de
        // producción (2026-08-04) →
        //
        //     status              planes   con días faltantes
        //     complete_partial        20                   20
        //     partial                  3                    3
        //     complete                 1                    0
        //
        // `complete_partial` es la población DOMINANTE (20 de 24) y sus 20
        // planes tienen días sin generar — exactamente la forma que el
        // predicado `overdue` del backend existe para detectar. Con el gate
        // previo esos 20 planes nunca pedían `/chunk-status`, así que
        // `chunkStatusInfo` se quedaba en `null` y la fila de días futuros
        // devolvía `null`: habrían sido invisibles justo en el caso para el
        // que se construyeron. Hoy ese consumidor es `PlanWeekNav`.
        //
        // Ojo con la rama `else if` de abajo: limpia el snapshot SOLO en
        // 'complete' puro (igualdad estricta, NO un `startsWith('complete')`).
        // Un plan de verdad terminado tiene que seguir botando sus
        // paused_chunks viejos; lo que entra al polling es `complete_partial`,
        // que es otra cosa: plan servible con trabajo pendiente en la cola.
        const _isActiveForChunkPoll = (
            status === 'partial'
            || status === 'generating'
            || status === 'generating_next'
            || status === 'rolling'
            || status === 'complete_partial'
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
            // [P1-PLAN-POLL-BOUNDED · 2026-07-29] El `setInterval(...,30000)` que vivía
            // aquí (idéntico problema que el poll de 25s de AssessmentContext: sin cota,
            // gateado solo por `generation_status`) se reemplazó por `usePlanPollLoop`
            // — ver el hook aparte más abajo. Este bloque solo prende el banner ahora.
            setShowChunkBanner(true);
        } else if (status === 'complete' && showChunkBanner) {
            setShowChunkBanner(false);
            const totalDays = planData?.total_days_requested || planData?.days?.length || 0;
            const groceryDur = formData?.groceryDuration || 'weekly';
            const coverDays = groceryDur === 'monthly' ? 30 : groceryDur === 'biweekly' ? 15 : 7;
            const repeats = totalDays > 0 && totalDays < coverDays;
            toast.success(tn(totalDays, '¡Tu menú de {n} día ya está listo! 🎉', '¡Tu menú de {n} días ya está listo! 🎉', { n: totalDays }), {
                description: repeats
                    ? t('Se repetirá automáticamente para cubrir tus {n} días de compras.', { n: coverDays })
                    : t('Todas las semanas están listas en tu calendario.'),
                duration: 6000,
            });
        } else if (status === 'complete_partial' && showChunkBanner) {
            setShowChunkBanner(false);
            toast.warning(t('Tu plan está listo (con respaldo) ⚠️'), {
                description: t('Algunos días se completaron con comidas de tu perfil favorito porque la IA tuvo dificultades. Puedes regenerarlos cuando quieras.'),
                duration: 8000,
            });
        } else if (status === 'failed' && showChunkBanner) {
            setShowChunkBanner(false);
            toast.error(t('Hubo un problema generando las próximas semanas'), {
                description: t('Tus días actuales están intactos. Intenta generar un nuevo plan pronto.'),
                duration: 10000,
            });
        }

        return () => {
            // [P1-DASHBOARD-POLLING-ABORT · 2026-05-23] Cancela fetches
            // in-flight para evitar setState-on-unmounted. Si el browser
            // ya cerró el request (AbortError) el .catch silencioso lo
            // absorbe — cero noise post-unmount.
            try { controller.abort(); } catch { /* noop */ }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData?.generation_status, refreshProfileAndPlan]);

    // [P2-CHUNK-OVERDUE-SIGNAL · 2026-08-04] Aquí vivió un `handleRetryUpcomingDays`
    // que `UpcomingDayTabs` usaba como CTA del estado `atrasado`. Se retiró: el
    // `triggerShift` de más abajo YA hace ese mismo POST en cada montaje, así que
    // cuando el chip es visible la llamada ya ocurrió y repetirla no encola nada;
    // y en `partial`/`generating_next` el click archivaba la ventana viva entera,
    // dejando `days = []` y apagando el propio chip con un toast de éxito. La
    // cadena completa quedó escrita en el spec 2026-08-04 (§C1). El control
    // equivalente y neutral que sí sobrevive es `[P2-δ] «Refrescar próximos
    // días»`, más abajo en este archivo.
    // [P1-DASH-WEEK-NAV · 2026-08-04] `UpcomingDayTabs` ya no existe: su
    // maquetación la sustituyó `PlanWeekNav` y su resolución de estados vive
    // en `utils/planWeeks.js::resolveDayState`.

    // [P1-PLAN-POLL-BOUNDED · 2026-07-29] Lectura fresca de `planData` dentro del `tick`
    // de abajo sin listarlo como dep del effect (mismo motivo que en AssessmentContext).
    const _dashPlanDataRef = useLatestRef(planData);

    // [P1-PLAN-POLL-BOUNDED · 2026-07-29] Bucle ACOTADO que reemplaza el
    // `setInterval(...,30000)` de arriba: refresca perfil+plan y `/chunk-status` con
    // discriminador (in_flight_count / next_chunk_eta) + backoff + give-up en vez de
    // pollear cada 30s para siempre mientras `generation_status==='partial'`. Medido en
    // vivo (2026-07-29): 6 planes 'partial' reales llevan DÍAS sin avanzar — este loop
    // Y el de AssessmentContext los pollearían por igual sin este fix. Ver
    // hooks/usePlanPollLoop.js + utils/planPollBackoff.js para el razonamiento completo.
    const _dashPollTick = useCallback(async (shouldAbort) => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return null;
        // Fire-and-forget, paridad con el `refreshProfileAndPlan();` sin await de arriba.
        refreshProfileAndPlan();
        const _planId = _dashPlanDataRef.current?.id;
        let chunkStatus = null;
        if (_planId) {
            try {
                const r = await getPlanChunkStatus(_planId);
                if (shouldAbort?.()) return null;
                if (r?.ok) {
                    const body = await r.json().catch(() => null);
                    if (shouldAbort?.()) return null;
                    if (body && typeof body === 'object') {
                        chunkStatus = body;
                        setChunkStatusInfo(body);
                    }
                }
            } catch {
                // fail-open: chunkStatus queda null → el discriminador asume "activo".
            }
        }
        if (shouldAbort?.()) return null;
        const latest = _dashPlanDataRef.current;
        return {
            daysCount: Array.isArray(latest?.days) ? latest.days.length : 0,
            generationStatus: latest?.generation_status ?? null,
            chunkStatus,
        };
    }, [refreshProfileAndPlan]);

    // [P2-CHUNK-OVERDUE-SIGNAL · 2026-08-04] El contador de la línea de abajo
    // subió de 3 a 4 al entrar 'complete_partial' en `_isActiveForChunkPoll`.
    // El gate de ESTE hook NO se toca: añadir un estado allá arriba no crea un
    // poll recurrente nuevo — aquel fetch es one-shot, piggyback del refresh de
    // plan, y el único bucle periódico sigue gateado a 'partial'.
    //
    // Este bloque vive FUERA del objeto a propósito: `Dashboard.plan_poll_bounded.
    // test.js` localiza la llamada de abajo y lee sus primeros 400 bytes para
    // anclar `enabled/resetKey/tick`; un comentario dentro del objeto empuja
    // `enabled:` fuera de esa ventana. Es la caducidad por ventana fija que ese
    // mismo test documenta — no la reintroduzcamos por dentro. (Y por eso este
    // párrafo tampoco escribe la firma literal de la llamada: el test la busca
    // con `indexOf` y engancharía este comentario en vez del código.)
    usePlanPollLoop({
        // Paridad exacta con el gate del `setInterval` reemplazado: SOLO 'partial'
        // (los otros 4 estados "activos" ya tienen su fetch inicial one-shot arriba).
        enabled: planData?.generation_status === 'partial' && !!planData?.id,
        resetKey: planData?.id,
        tick: _dashPollTick,
    });

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
    const isPantryTooEmpty = computePantryGate(pantryItemCount, PANTRY_MIN_ITEMS_FOR_UPDATE);

    // [P1-SWAP-PANTRY-GATE · 2026-07-30] Gate del swap INDIVIDUAL ("Cambiar
    // Plato"), que hasta ahora no miraba la Nevera: el modal abría con la
    // nevera vacía, el usuario elegía motivo, se gastaba un crédito y el
    // backend hacía soft-fail por strict-pantry sin inventario.
    //
    // Umbral PROPIO (6 vs 10): el día completo regenera 4 platos que además
    // reservan inventario entre sí; esto regenera 1. Mismo `pantryItemCount` y
    // por tanto el mismo fail-open — con el inventario sin cargar no se bloquea
    // nada.
    const isPantryTooEmptyForSwap = computePantryGate(pantryItemCount, PANTRY_MIN_ITEMS_FOR_SWAP);

    // Copy del bloqueo, compartido por el `title` y el `aria-label` del botón.
    const swapPantryClaim = t('Tu Nevera tiene muy pocos alimentos para cambiar un plato. Necesitas al menos {minimo} — añádelos en "Nevera".', { minimo: PANTRY_MIN_ITEMS_FOR_SWAP });

    // [P1-SWAP-PANTRY-GATE-FULL-BUTTON · 2026-07-30] Decisión del owner: el
    // BOTÓN ENTERO se bloquea, en vez de deshabilitar motivo por motivo dentro
    // del modal. Consecuencia asumida y explícita: con la Nevera baja tampoco
    // se puede pedir 'cravings' ni 'weekend', que P3-SWAP-PANTRY-DEFAULT
    // (2026-05-22) había eximido de strict-pantry. Se prefiere la simetría con
    // "Actualizar platos" y no abrir un modal donde media lista está muerta.
    //
    // El gate POR MOTIVO se conserva como SEGUNDA barrera, y no es código
    // muerto: cubre la ventana en que la Nevera se vacía MIENTRAS el modal está
    // abierto (otra pestaña, un consume, un restock deshecho). El botón ya no
    // deja entrar por debajo del mínimo, pero nada impide que el inventario
    // caiga entre la apertura y el click.
    const swapPantryLockLabel = t('Necesitas {minimo} alimentos', { minimo: PANTRY_MIN_ITEMS_FOR_SWAP });
    const isSwapReasonPantryLocked = (reasonId) =>
        isPantryTooEmptyForSwap && SWAP_REASONS_REQUIRING_PANTRY.includes(reasonId);
    const decorateSwapOption = (o) => (
        isSwapReasonPantryLocked(o.id)
            ? { ...o, disabled: true, disabledLabel: swapPantryLockLabel,
                disabledDesc: t('Llena tu Nevera para poder cambiarlo por algo que sí tengas') }
            : o
    );

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
    // [P1-PLAN-MODE · 2026-08-11] Plan en pausa por el usuario. Con esto: aparece la
    // franja de abajo y DESAPARECEN los dos CTA que encolan trabajo. Ocultar, no
    // deshabilitar: un botón gris pide que lo expliquen; la franja ya lo explicó.
    const isPlanPaused = planData?.generation_status === 'paused_by_user';
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
    // [P1-PLAN-HYDRATE-ON-COMPLETE · 2026-07-24] `partial` + 0 días NO es corrupción
    // mientras haya una generación en vuelo: es el estado normal de un plan recién
    // nacido cuyo SSE se cortó (refresh/navegación) mientras el backend sigue
    // trabajando. Reportado en vivo el 2026-07-24: el plan terminó perfecto (banda
    // 1.00, 51 ítems de lista) y el usuario igual vio "Tu plan quedó incompleto" con
    // CTA a regenerar — que además cancela los chunks encolados del plan bueno.
    // `failed` sí se muestra siempre (es veredicto del backend, no una ventana de carrera).
    //
    // [P1-DASH-CORRUPTED-VS-PAUSED · 2026-08-08] Segundo falso positivo medido en
    // vivo (plan f380821a): la ventana rolling archivó el último día vivo (days=[])
    // mientras el refill estaba PAUSADO server-side (`pending_user_action:
    // pantry_violation_after_retries`, TTL 12h → se genera solo). El flag client-side
    // de pipeline no cubre ese caso (el plan tiene 2 días de vida, no hay SSE), así
    // que el banner acusaba "la generación no terminó" con 7 chunks vivos en cola —
    // y su CTA cancela la cola y quema un crédito. La cola es la fuente de verdad:
    // el banner solo puede acusar cuando /chunk-status CONFIRMÓ cola muerta (nada en
    // vuelo, nada pausado). `chunkStatusInfo === null` (poll aún sin responder o
    // caído) NO acusa: preferimos un banner tardío a uno falso.
    const _chunkQueueConfirmedEmpty = (
        chunkStatusInfo !== null
        && Number(chunkStatusInfo.in_flight_count || 0) === 0
        && Number(chunkStatusInfo.pending_user_action_count || 0) === 0
    );
    const isPlanCorrupted = !!planData && (
        planData.generation_status === 'failed'
        || (
            planData.generation_status === 'partial'
            && Array.isArray(planData.days)
            && planData.days.length === 0
            && !hasPendingPipelineInFlight()
            && _chunkQueueConfirmedEmpty
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
            // [P5-SPEED-DELTA-CONSTS-HOIST · 2026-06-01] SINGLE_STOP_WORDS_REGEX precompilada
            // a module-scope. Usamos una sola regex combinada para O(1) pases de replace.
            // Flag `g` → replace resetea lastIndex tras cada llamada → seguro reusar.
            n = n.replace(SINGLE_STOP_WORDS_REGEX, '');
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

        // [P1-SHOPPING-PRESENCE-MATCH · 2026-07-11] Lookup de presencia por CONTENCIÓN
        // con límites de palabra, además del exact-match. Caso vivo (owner): tenía
        // "Yogurt griego entero" en la Nevera y la lista seguía pidiendo "Yogurt"
        // (y "Plátano" con "Plátano maduro" en casa) — la igualdad exacta no cruza
        // nombres parciales. Mín. 4 chars para no cruzar "sal" con nada (el padding
        // ya evita "sal"⊄"salsa"). Modelo de presencia intacto (P5): presente en
        // cualquier cantidad → oculto.
        const _invPadded = [...inventoryMap.entries()].map(([k, v]) => [` ${k} `, v]);
        const _lookupInventory = (k1, k2) => {
            const direct = inventoryMap.get(k1) || inventoryMap.get(k2);
            if (direct) return direct;
            for (const key of [k1, k2]) {
                if (!key || key.length < 4) continue;
                const pk = ` ${key} `;
                for (const [pkey, v] of _invPadded) {
                    if (pkey.length >= 6 && (pkey.includes(pk) || pk.includes(pkey))) return v;
                }
            }
            return null;
        };

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
                    // [P1-SHOPPING-NEEDS-MATCH · 2026-07-11] El set guarda LÍNEAS de receta
                    // normalizadas ("1½ tomate", "5 clara de huevo", "½ cdta de aceite de
                    // oliva") — con cantidades/medidas incrustadas — mientras el check de
                    // abajo consulta el NOMBRE CANÓNICO de la lista ("tomate"). La igualdad
                    // exacta casi nunca matchea → el filtro escondía prácticamente TODA la
                    // lista como "ya no lo necesitas" (caso vivo: primer plan modo-Nevera del
                    // owner, PDF con 3 ítems "al gusto" y 45 "excluidos"). Match correcto:
                    // contención con límites de palabra (" tomate " ⊂ " 1½ tomate ") —
                    // los falsos positivos solo MUESTRAN de más (dirección fail-open del diseño).
                    if (remainingNeedsSet) {
                        const _paddedNeeds = [...remainingNeedsSet].map(k => ` ${k} `);
                        const _exact = remainingNeedsSet;
                        remainingNeedsSet = {
                            has: (key) => {
                                if (!key) return false;
                                if (_exact.has(key)) return true;
                                const _pk = ` ${key} `;
                                return _paddedNeeds.some(line => line.includes(_pk));
                            },
                        };
                    }
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
            // [P1-SHOPPING-PRESENCE-MATCH] exact-match + contención con límites de palabra.
            const invItem = _lookupInventory(nameKey1, nameKey2);

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

            // [P1-URGENT-LIST-CANONICAL · 2026-08-09] El escalado por días restantes (26/30=0,87)
            // producía «0.87 funda» / «1.7 cartón» en TODO el PDF del owner — matemática honesta,
            // display absurdo: los empaques CONTABLES no se compran en fracciones. Ceil a empaque
            // entero para unidades contables (con epsilon anti 1.0000001→2); las unidades de PESO
            // (lb/kg/g) conservan la fracción — la carnicería sí vende 0,43 lb.
            const _WEIGHT_UNITS = ['lb', 'lbs', 'libra', 'libras', 'kg', 'g', 'gr', 'oz'];
            const _isWeightUnit = _WEIGHT_UNITS.includes(shopUnit);
            let shopQty = degradationRatio === 1 ? rawShopQty : (rawShopQty * degradationRatio);
            if (!_isWeightUnit && !Number.isInteger(shopQty)) {
                shopQty = Math.max(1, Math.ceil(shopQty - 0.02));
            }

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
                // [P1-URGENT-LIST-CANONICAL] espejo numérico alineado al qty ya ceileado —
                // el spread conservaba el 1.0 original y resolveShopQty lo PREFIERE, así que
                // PDF/restock veían un número distinto al display.
                market_qty_numeric: shopQty,
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

    // [P2-RESTOCK-MODAL-PREVIEW · 2026-07-12] El modal "Confirmar compra" era abstracto
    // ("agregaremos todos los ingredientes…" sin decir cuántos ni cuáles). Preview honesto:
    // MISMA fuente + MISMO delta que handleRestock (getDeltaSourceList + buildDeltaShoppingList
    // contra liveInventory) → el número que ves es lo que realmente se añade, no la lista bruta.
    const restockPreview = useMemo(() => {
        try {
            const duration = formData?.groceryDuration || 'weekly';
            const raw = getDeltaSourceList(planData, duration) || allPlanIngredients || [];
            const delta = buildDeltaShoppingList(raw, Array.isArray(liveInventory) ? liveInventory : []);
            const names = delta
                .map((it) => (it && typeof it === 'object' ? (it.name || it.item || '') : String(it || '')))
                .map((s) => String(s).trim())
                .filter(Boolean);
            const durationLabel = { weekly: t('semanal'), biweekly: t('quincenal'), monthly: t('mensual') }[duration] || duration;
            return { count: names.length, sample: names.slice(0, 4), durationLabel };
        } catch {
            return { count: 0, sample: [], durationLabel: t('semanal') };
        }
    }, [planData, formData?.groceryDuration, allPlanIngredients, liveInventory, buildDeltaShoppingList, t]);

    // [P2-BRANDS-DEFAULT-FROM-ACTIVE · 2026-07-07] La lista ACTIVA por duración (la
    // que el PDF realmente imprime) → el panel usa su `brand_product_id` por ítem
    // para MARCAR en el menú la marca default que la lista está usando (Wala/Quaker/
    // etc.), no solo las elegidas a mano. El set de ítems sigue viniendo de la
    // canónica semanal (brandsPanelList) para que el panel sobreviva a un restock;
    // esta lista solo alimenta la detección del default (override per-ítem).
    const brandsActiveList = useMemo(() => {
        const duration = formData?.groceryDuration || 'weekly';
        const active = getDeltaSourceList(planData, duration);
        return Array.isArray(active) ? active : [];
    }, [planData, formData?.groceryDuration]);

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
            // [P1-PDF-COST-DELTA-AWARE · 2026-07-12] Costos del DELTA para el banner de
            // presupuesto y la línea "esta ida al súper" (paridad con el recuadro del PDF):
            //   - deltaTripRd: lo que realmente compras HOY (suma de lo no-excluido).
            //   - deltaCycleRd: hoy + perecederos COMPLETOS × (semanas−1) — la Nevera solo
            //     ahorra la semana 1; los frescos futuros se recompran completos.
            let deltaTripRd = 0, deltaCount = 0;
            currentDelta.forEach((it) => {
                if (!it || typeof it !== 'object') return;
                deltaCount++;
                const c = it.estimated_cost_rd ?? it.estimated_cost;
                if (typeof c === 'number' && c > 0) deltaTripRd += c;
            });
            const _cycleDays = duration === 'monthly' ? 30 : duration === 'biweekly' ? 15 : 7;
            const _mult = _cycleDays / 7;
            const _bs = planData?.shopping_cost_summary?.by_duration?.[duration];
            const _fullPerishRd = (typeof _bs?.perishable_rd === 'number' && _bs.perishable_rd > 0)
                ? _bs.perishable_rd
                : rawList.reduce((s, it) => {
                    const c = it?.estimated_cost_rd ?? it?.estimated_cost;
                    return s + (it?.is_perishable === true && typeof c === 'number' && c > 0 ? c : 0);
                }, 0);
            const deltaCycleRd = deltaTripRd + _fullPerishRd * Math.max(0, _mult - 1);
            return {
                itemsRemoved,
                isAdjusted: !!currentDelta._isAdjusted || itemsRemoved > 0,
                hasItems,
                isEmptyDueToPantry: !hasItems && itemsRemoved > 0,
                deltaTripRd,
                deltaCycleRd,
                deltaCount,
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
                    // [P1-PUSH-ONBOARDING-SEEN-ON-SHOW · 2026-07-09] Marcar 'visto' al MOSTRARLO, no solo al
                    // activar/descartar. Bug reportado en iOS (móvil): el user activó las alertas pero el
                    // modal reapareció al reabrir/reiniciar la app — el flag no se había persistido a tiempo
                    // o el re-trigger corrió antes del handler. Marcando al mostrar, el onboarding aparece a
                    // lo sumo UNA vez por dispositivo (activar/descartar/navegar → no reaparece). El usuario
                    // siempre puede activarlas desde Ajustes si las omitió.
                    safeLocalStorageSet('mealfit_push_onboarding_seen', 'true');
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
                toast.success(t('¡Alertas Inteligentes activadas!'), {
                    description: t('Te avisaremos si olvidas registrar una comida.'),
                    icon: '🧠'
                });
            } else {
                toast.info(t('Notificaciones omitidas'), {
                    description: t('Puedes activarlas más adelante desde Ajustes.')
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
            const loadingToast = toast.loading(t('Generando lista de compras...'), { position: 'top-center' });

            // Obtener duración actual desde el formulario para cambiar la cantidad en el PDF sobre la marcha
            const duration = formData?.groceryDuration || 'weekly';

            // [P2-BRANDS-PDF-WAIT · 2026-07-07] Espera a que cualquier recalc en vuelo
            // termine y PERSISTA a la DB antes del fetch fresco del PDF. El PDF re-lee
            // plan_data de la DB (P3-PDF-ALWAYS-SYNC); si el reconcile de marcas (o un
            // pick reciente) aún no persistió, el PDF leería la lista vieja (marca
            // default) — el bug "PDF muestra Wala aunque elegí Borges". Timeout
            // defensivo (25s) para no colgar la descarga si un recalc quedó atascado.
            try {
                await Promise.race([
                    withRecalcLock(async () => {}),
                    new Promise((res) => setTimeout(res, 40000)),
                ]);
            } catch { /* best-effort: seguimos con lo que haya en DB */ }

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

            // [P1-COUNTRY-SYSTEM-F1 · 2026-08-16 (T7)] País beta sin precios nativos: el
            // backend nunca emitió `estimated_cost_rd` para este plan (aggregator +
            // shopping_cost_summary + budget_reconciliation ⇒ None/ausentes) — el PDF debe
            // avisarlo en vez de mostrar una lista con cifras huérfanas o simplemente
            // silenciosa. `effectivePlanData` (no el `planData` externo) porque puede haber
            // sido refrescado arriba (drift sync) — mismo dato que ya usa el resto de esta
            // función para todo lo demás.
            const _isBetaPricing = effectivePlanData?._pricing_mode === 'beta_no_prices';

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
                    t('Tu plan no tiene lista de compras todavía. Esto suele pasar cuando la generación quedó incompleta. Genera un plan nuevo desde el formulario.'),
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
                // [P1-DASH-INV-CACHE-WRITE · 2026-08-14] Idem: cache al dia con el estado.
                setCachedInventory(_freshFetchResult.data);
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
                    emptyMessageTitle = t('¡Felicidades, Lista Vacía!');
                    emptyMessageDesc = t('La Nevera Inteligente detectó que ya tienes en casa los ingredientes necesarios. Te has ahorrado hacer compras para este ciclo.');
                    toast.success(t('¡Ya tienes todo en tu Nevera!'), { icon: '✅' });
                } else {
                    // [P3-PDF-EMPTY-LIST-VISIBLE · 2026-05-27] Toast más visible
                    // cuando el plan no tiene aggregated_shopping_list. Pre-fix
                    // el toast.error genérico (2s, top-right) era invisible para
                    // usuarios con DevTools abierto y no daba pista accionable.
                    // Post-fix: 8s top-center con copy explícito apuntando al
                    // origen real (plan incompleto/corrupto) y la acción concreta.
                    toast.dismiss(loadingToast);
                    toast.error(
                        t('Tu plan no tiene lista de compras todavía. Esto suele pasar cuando la generación quedó incompleta. Genera un plan nuevo desde el formulario.'),
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
                let cat = t('🛒 OTROS');
                let qtyStr = t('Al gusto');

                if (typeof item === 'object' && item !== null) {
                    // Nivel 3: Consumir display_category del backend (Single Source of Truth)
                    name = item.name || item.display_name || item.item_name || t('Desconocido');
                    cat = item.display_category || item.category || t('🛒 OTROS');

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
                    qtyStr = t('Al gusto');
                }

                consData[index] = {
                    name: name,
                    display_name: name,
                    category: cat,
                    item_ref: item,
                    qty_base: qtyStr || t('Al gusto'),
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
            //
            // [P1-PDF-COST-DELTA-AWARE · 2026-07-12] EXCEPCIÓN al SSOT: cuando la Nevera excluyó
            // ítems (deltaItemsRemoved > 0), el resumen del backend describe el plan COMPLETO,
            // NO esta compra (vivo: PDF con 8 ítems visibles que suman ~RD$1,270 mostraba
            // "Esta compra RD$5,989" — el costo de los 44). Delta-aware:
            //   - "Esta compra" = suma LOCAL de lo realmente impreso (delta).
            //   - "Ciclo real"  = delta de HOY + perecederos COMPLETOS × (semanas − 1): lo que
            //     tienes en la Nevera solo te ahorra la semana 1 — los frescos de las semanas
            //     2..N se recompran completos (el resumen backend aporta perishable_rd full).
            const _backendCostSummary = planData?.shopping_cost_summary?.by_duration?.[duration] || null;
            const _deltaAware = (deltaItemsRemoved || 0) > 0;
            const _shopTotalCostFinal = (!_deltaAware && _backendCostSummary && typeof _backendCostSummary.trip_total_rd === 'number' && _backendCostSummary.trip_total_rd > 0)
                ? _backendCostSummary.trip_total_rd : _shopTotalCost;
            let _fullCycleCostFinal;
            if (_deltaAware) {
                const _fullPerishableRd = (typeof _backendCostSummary?.perishable_rd === 'number' && _backendCostSummary.perishable_rd > 0)
                    ? _backendCostSummary.perishable_rd : _perishableCost;
                _fullCycleCostFinal = _stableCost + _perishableCost
                    + _fullPerishableRd * Math.max(0, _cycleCostMultiplier - 1);
            } else {
                _fullCycleCostFinal = (_backendCostSummary && typeof _backendCostSummary.cycle_total_rd === 'number' && _backendCostSummary.cycle_total_rd > 0)
                    ? _backendCostSummary.cycle_total_rd : _fullCycleCost;
            }
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
            let durationText = t('7 Días');
            if (duration === 'biweekly') { durationText = t('15 Días'); }
            if (duration === 'monthly') { durationText = t('30 Días'); }

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
            const _fmtItems = (n) => tn(n, '{n} ítem', '{n} ítems', { n });

            // Generar contenido HTML estilizado para el PDF
            const element = document.createElement('div');

            let htmlContent = `
            <div style="font-family: 'Inter', system-ui, sans-serif; padding: ${rootPadding}; color: #1f2937; background-color: #ffffff;">
                <!-- Header Box -->
                <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: ${headerPadding}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); display: flex; align-items: center; justify-content: space-between; margin-bottom: ${headerMargin}; border-top: 5px solid #10b981;">
                    <div>
                        <h1 style="margin: 0 0 8px 0; color: #111827; font-size: 20px; font-weight: 800; letter-spacing: -0.025em;">${escapeHtml(t('Lista de Compras'))}</h1>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <span style="background-color: #ecfdf5; color: #065f46; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; border: 1px solid #10b98140;">${escapeHtml(t('Ciclo: {duracion}', { duracion: durationText }))}</span>
                            <span style="background-color: #f3f4f6; color: #4b5563; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600;">${escapeHtml(t('Generado: {fecha}', { fecha: new Date().toLocaleDateString('es-DO') }))}</span>
                            <!-- [P2-SHOPPING-TOTALS · 2026-05-16] Total chip. -->
                            <span style="background-color: #eff6ff; color: #1e40af; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; border: 1px solid #3b82f640;">${escapeHtml(t('Total: {items}', { items: _fmtItems(totalItems) }))}</span>
                        </div>
                    </div>
                    <img src="/favicon.png" alt="${escapeHtml(t('Logo de Bioboros'))}" style="height: 40px;" />
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
                        ${t('<strong>Smart Engine:</strong> cantidades exactas según empaques del mercado local — ajústalas a tu inventario. <strong>Ud.</strong> = unidad · <strong>~</strong> = conversión aproximada (<em>2 Cabezas ≈ 2.2 lbs</em>).')}
                        ${isUltraDense ? '' : `
                        <span style="display: block; margin-top: 2px; color: #475569;">
                            ${t('Algunas varían por <strong>realismo de almacenamiento</strong> (hierbas, lácteos, cítricos). <strong>Estables (aceite, vinagre, miel, especias):</strong> misma cantidad en ciclos de 7/15/30 días.')}
                        </span>
                        `}
                    </p>
                </div>

                ${_isBetaPricing ? `
                <!-- [P1-COUNTRY-SYSTEM-F1 · 2026-08-16 (T7)] Aviso beta: el súper de tu país
                     todavía no tiene precios propios en el motor — la lista sale sin importes.
                     Mismo azul informativo que el disclaimer de cantidades (no es un aviso de
                     error, es un estado del producto). -->
                <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 3px solid #3b82f6; padding: ${disclaimerPadding}; border-radius: 6px; margin-bottom: ${disclaimerMargin}; display: flex; align-items: flex-start; gap: 8px;">
                    <svg style="flex-shrink: 0; width: 14px; height: 14px; color: #3b82f6; margin-top: 1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p style="margin: 0; font-size: ${isUltraDense ? '9.5px' : '11px'}; color: #1e3a8a; line-height: 1.3;">
                        ${t('Precios del súper de tu país: próximamente. Tu lista sale sin importes.')}
                    </p>
                </div>
                ` : ''}

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
                        ${t('<strong>Aviso:</strong> No pudimos validar tu Nevera en vivo, así que esta lista incluye <strong>todos</strong> los ingredientes del plan. Revisa qué ya tienes en casa antes de comprar.')}
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
                        ${t('<strong>Plan vencido:</strong> Tu ciclo de compras ya expiró. Esta lista refleja el plan anterior. <strong>Regenera tu plan</strong> antes de comprar para que coincida con tus próximas comidas.')}
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
                        ${deltaItemsRemoved > 0
                            ? tn(deltaItemsRemoved,
                                '<strong>Nevera Inteligente:</strong> Esta lista fue <strong>ajustada automáticamente</strong> — {n} ingrediente ya está en tu Nevera y fue excluido.',
                                '<strong>Nevera Inteligente:</strong> Esta lista fue <strong>ajustada automáticamente</strong> — {n} ingredientes ya están en tu Nevera y fueron excluidos.',
                                { n: escapeHtml(deltaItemsRemoved) })
                            : t('<strong>Nevera Inteligente:</strong> Esta lista fue <strong>ajustada</strong> según lo que ya tienes en tu Nevera.')}
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
                            ? `<span style="margin-left: 6px; font-size: ${isHyperDense ? '6.5px' : '8px'}; color: #b45309; background-color: #fef3c7; padding: 0px 4px; border-radius: 3px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;">${escapeHtml(t('verifica'))}</span>`
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
                        // [P2-SHOPPING-PILLS-OVERFLOW · 2026-08-01] `white-space: nowrap` forzaba
                        // una sola línea sin límite de ancho: cuando `display_qty` trae el sufijo
                        // largo del backend ("· alcanza ~26 de 30 días — no recompres cada semana",
                        // shopping_calculator.py P1-CAPPED-STAPLE-HONESTY) la píldora reventaba el
                        // borde de la tarjeta/columna y el texto se cortaba (ilegible). `white-space:
                        // normal` + `overflow-wrap: anywhere` + `max-width: 100%` dejan que el texto
                        // haga wrap DENTRO de la píldora en vez de desbordar — el `flex-shrink: 0`
                        // del contenedor (abajo) también se removió, porque impedía que la píldora
                        // se angostara para dejar espacio al wrap.
                        const qtyStr = displayQty && String(displayQty).trim() !== 'None' ? `<span style="font-weight: 700; color: ${tagColor}; font-size: ${qtyFont}; background-color: ${tagBg}; border: 1px solid ${tagBorder}; padding: ${qtyPad}; border-radius: 4px; margin-left: 4px; white-space: normal; overflow-wrap: anywhere; word-break: break-word; max-width: 100%; box-sizing: border-box; align-self: flex-start;">${escapeHtml(displayQty)}</span>` : '';

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

                        // [P2-SHOPPING-PILLS-OVERFLOW · 2026-08-01] `flex-wrap: wrap` en la
                        // fila del item es el respaldo de la píldora que hace wrap arriba: si
                        // aun así no cabe al lado del nombre (columnas muy angostas en modo
                        // hyper-dense/4-col), baja a línea propia debajo en vez de forzar el
                        // ancho de la fila más allá de la tarjeta. `min-width: 0` en ambas
                        // columnas es necesario para que el algoritmo flex pueda angostarlas
                        // por debajo de su contenido — el default `min-width: auto` de un flex
                        // item lo impide y anula el `overflow-wrap` de la píldora.
                        innerHtml += `
                            <li style="display: flex; align-items: flex-start; padding: ${ulPadding}; ${borderBottom} break-inside: avoid-column; page-break-inside: avoid;">
                                <div style="width: ${checkboxSize}; height: ${checkboxSize}; border: 1.5px solid #d1d5db; border-radius: ${isDense ? '3px' : '4px'}; margin-right: ${checkboxMarginRight}; flex-shrink: 0; background-color: #ffffff; margin-top: 2px;"></div>
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; flex-wrap: wrap; row-gap: 2px; column-gap: 6px;">
                                    <div style="display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0;">
                                        <span style="font-size: ${itemFont}; font-weight: 600; color: #374151; line-height: 1.2;">${escapeHtml(display)}${lowConfWarn}</span>
                                        ${noteHTML}
                                    </div>
                                    <div style="display: flex; flex-direction: column; align-items: flex-end; flex: 0 1 auto; min-width: 0; max-width: 100%;">${qtyStr}${costStr}</div>
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
                ? t('COMPRA ESTA SEMANA — PERECEDEROS')
                : t('COMPRA ESTA SEMANA — PERECEDEROS (REPITE CADA 7 DÍAS)');
            const perishableDesc = isWeekly
                ? t('Carnes, lácteos, frutas y vegetales frescos. Consume o refrigera pronto.')
                : t('Esta comida fresca alcanza ~7 días: en tu ciclo de {duracion} la compras {idas} veces (cada 7 días). Se dañan rápido, por eso no se compran todas de una vez.', { duracion: durationText, idas: _cycleTrips });
            const stableLabel = duration === 'monthly'
                ? t('DESPENSA DEL MES — ESTABLES (COMPRA UNA SOLA VEZ)')
                : duration === 'biweekly'
                    ? t('DESPENSA PARA 15 DÍAS — ESTABLES (COMPRA UNA SOLA VEZ)')
                    : t('DESPENSA — ESTABLES (+7 DÍAS)');
            const stableDesc = isWeekly
                ? t('Granos, enlatados, especias y víveres secos. Tienen larga caducidad.')
                : t('Granos, enlatados, especias y víveres secos. Cantidad calculada para todo el periodo: cómpralos una sola vez.');

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
                ? `<div style="margin-top: 15px; padding: 10px 12px; border: 1.5px solid ${_rpr.renal_gate ? '#fca5a5' : '#93c5fd'}; background: ${_rpr.renal_gate ? '#fef2f2' : '#eff6ff'}; border-radius: 8px; color: ${_rpr.renal_gate ? '#991b1b' : '#1e40af'}; font-size: 10px; line-height: 1.45;"><strong>${escapeHtml(_rpr.renal_gate ? t('🫘 Condición renal — requiere supervisión de tu nefrólogo') : t('⚕️ Consulta a tu profesional de salud'))}</strong><br/>${escapeHtml(String(_rpr.note))}</div>`
                : '';

            htmlContent += `
                ${_shopPricedCount > 0 ? `<div style="margin-top: 14px; padding: 11px 15px; background: linear-gradient(135deg,#ecfdf5,#f0fdf4); border: 1.5px solid #10b98133; border-radius: 9px; break-inside: avoid; page-break-inside: avoid;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                        <div style="font-size: 12px; font-weight: 800; color: #065f46;">💵 ${_showCycleCost ? t('Esta compra <span style="font-weight: 600; color: #059669;">(frescos de 1 semana + despensa)</span>') : t('Total estimado del mercado')}</div>
                        <span style="font-size: 19px; font-weight: 800; color: #047857; white-space: nowrap;">RD$${Math.round(_shopTotalCostFinal).toLocaleString('es-DO')}</span>
                    </div>
                    ${_showCycleCost ? `<div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 7px; padding-top: 7px; border-top: 1px dashed #10b98155;">
                        <div style="font-size: 11.5px; font-weight: 800; color: #065f46;">🛒 ${escapeHtml(t('Costo real del ciclo de {duracion}', { duracion: durationText }))}<div style="font-size: 9px; font-weight: 500; color: #059669; margin-top: 1px; letter-spacing: normal;">${escapeHtml(t('Despensa 1× + perecederos de {duracion} (recompra cada 7 días)', { duracion: durationText }))}</div></div>
                        <span style="font-size: 18px; font-weight: 800; color: #065f46; white-space: nowrap;">RD$${Math.round(_fullCycleCostFinal).toLocaleString('es-DO')}</span>
                    </div>` : ''}
                    ${(() => {
                        // [P1-BUDGET-RECONCILE · 2026-07-02] Estado honesto del presupuesto en el PDF:
                        // compara el costo real del ciclo contra el presupuesto del formulario
                        // (custom → monto; tiers → banda del piso de metas). Solo números + enum
                        // internos (sin texto user-controlled) → sin riesgo XSS.
                        const _br = planData?.budget_reconciliation;
                        if (!_br || !_br.status || _br.status === 'sin_limite' || !_br.reference_rd) return '';
                        // [P1-PDF-COST-DELTA-AWARE · 2026-07-12] La línea de presupuesto del PDF
                        // debe usar el MISMO ciclo delta-aware del recuadro de arriba (vivo: el
                        // recuadro decía RD$12,053 y esta línea RD$16,771 — incoherencia interna).
                        // Status monótono: el estimado solo baja → ≤ ref ⇒ dentro; si no, el del backend.
                        const _estCycleRdPdf = _deltaAware ? _fullCycleCostFinal : (_br.estimated_cycle_rd || 0);
                        const _brStatusEff = (_deltaAware && _estCycleRdPdf <= _br.reference_rd)
                            ? 'dentro' : _br.status;
                        const _est = Math.round(_estCycleRdPdf).toLocaleString('es-DO');
                        // [P2-AUDIT-V6-BATCH · 2026-07-03] (P2-I) tiers categóricos → RD$Y es piso×banda
                        // (número no declarado por el usuario) → etiquetado "referencia estimada" (paridad app).
                        const _ref = Math.round(_br.reference_rd).toLocaleString('es-DO')
                            + (_br.basis && _br.basis !== 'custom' ? t(' (referencia estimada)') : '');
                        // [P2-AUDIT-V5-BATCH GAP-06] Caveat de cobertura parcial (solo números backend → sin XSS).
                        const _pp = _br.partial_pricing
                            ? `<span style="font-weight:600; color:#92400e;">${t(' · estimado parcial ({cobertura}% con precio)', { cobertura: Math.round((_br.price_coverage || 0) * 100) })}</span>`
                            : '';
                        // El importe viaja YA formateado («RD$5,989»): meter el símbolo dentro
                        // de la clave lo dejaría pegado a un `{placeholder}` y la clave se
                        // leería como una plantilla dentro de otra.
                        const _estRD = `RD$${_est}`;
                        const _refRD = `RD$${_ref}`;
                        if (_brStatusEff === 'dentro') {
                            return `<div style="margin-top: 7px; padding-top: 7px; border-top: 1px dashed #10b98155; font-size: 11px; font-weight: 700; color: #047857;">✓ ${t('Dentro de tu presupuesto — {gasto} de {referencia}', { gasto: _estRD, referencia: _refRD })}${_pp}</div>`;
                        }
                        if (_brStatusEff === 'cerca') {
                            return `<div style="margin-top: 7px; padding-top: 7px; border-top: 1px dashed #f59e0b55; font-size: 11px; font-weight: 700; color: #92400e;">≈ ${t('Al límite de tu presupuesto — {gasto} de {referencia}', { gasto: _estRD, referencia: _refRD })}${_pp}</div>`;
                        }
                        const _delta = Math.round(Math.max(0, _estCycleRdPdf - _br.reference_rd)).toLocaleString('es-DO');
                        return `<div style="margin-top: 7px; padding-top: 7px; border-top: 1px dashed #f8717155; font-size: 11px; font-weight: 700; color: #b91c1c;">▲ ${t('Supera tu presupuesto por {exceso} — {gasto} de {referencia}', { exceso: `RD$${_delta}`, gasto: _estRD, referencia: _refRD })}${_br.adjusted ? `<span style="font-weight:600; color:#92400e;">${t(' · ya ajustamos ingredientes premium a equivalentes económicos')}</span>` : ''}${_pp}</div>`;
                    })()}
                </div>` : ''}
                ${clinicalNoteHTML}
                <!-- Footer -->
                <!-- [PDF-FOOTER-CONTRAST · 2026-06-22] El footer se veía casi invisible
                     (grises muy claros #6b7280/#9ca3af sobre papel blanco). Se oscurecen
                     a gray-700/gray-600 + subtítulo 9px→11px para que se lea bien. -->
                <div style="margin-top: 15px; text-align: center; color: #4b5563; font-size: 10px; border-top: 2px dashed #cbd5e1; padding-top: 10px;">
                    <p style="margin: 0; font-weight: 800; color: #374151; letter-spacing: 1px;">${escapeHtml(t('PROCESADO POR MEALFITRD IA - NUTRICIÓN INTELIGENTE'))}</p>
                    <!-- [P2-PDF-PRICE-SOURCE-COPY · 2026-06-22] (audit fresco P2-22) Copy suavizado: el precio
                         por-ítem puede ser verificado O estimado (price_confidence/price_source por fila) → afirmar
                         "verificados en La Sirena" universal era inexacto.
                         [P1-COUNTRY-SYSTEM-F1 · 2026-08-16 (T7)] País beta ⇒ el pie NUNCA menciona
                         supermercados dominicanos (esta lista no tiene esos precios) — mismo aviso
                         que la cabecera. DO mantiene el texto EXACTO de siempre. -->
                    <p style="margin: 6px 0 0; font-size: 11px; color: #4b5563;">${escapeHtml(_isBetaPricing ? t('Precios del súper de tu país: próximamente. Tu lista sale sin importes.') : t('Precios estimados a partir de supermercados dominicanos (Nacional/La Sirena); pueden variar según tienda y fecha.'))}</p>
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
                    toast.error(t('Error de red al cargar el PDF. Refresca la página e intenta de nuevo.'));
                } else {
                    toast.error(t('No se pudo cargar el generador de PDF. Refresca la página e intenta de nuevo.'));
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
            toast.success(t('Lista PDF descargada exitosamente'), { icon: '📄', position: 'top-center' });

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
            toast.error(t('Error al generar la lista de compras.'));
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
            if (!silent) toast.error(t('Debes iniciar sesión para usar esta función.'));
            return;
        }

        // [P0-2] Candado síncrono para evitar doble envío antes de que React actualice isRestocking
        if (restockLock.current) return;
        restockLock.current = true;

        // Validación Unica: Si matemáticamente y en tiempo real faltan ingredientes, lo permitimos.
        if (!hasPendingShoppingItems) {
            if (!silent) toast.info(t('Ya tienes todos estos ingredientes en tu Nevera.'), { icon: '📦' });
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
                if (!silent) toast.warning(t('Tu Nevera puede estar desactualizada'), {
                    description: t('No pudimos validar tu inventario en vivo. Procediendo con la lista completa — la DB es la fuente de verdad.'),
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
                    const match = raw.match(/^([\d.,/\s½¼¾%]+(?:oz|lbs?|g|kg|ml|l|taza[s]?|cda[s]?|cdta[s]?|u|pz[a]?[s]?|dientes?|manojo|piezas?|rebanadas?)\s*(?:de\s*)?)(.*)$/i) || raw.match(/^([\d.,/\s½¼¾%]+(?:de\s*)?)(.*)$/i);
                    name = raw;
                    if (match) name = match[2];
                }
                return { raw, structured, normalized: name.toLowerCase().trim() };
            }).filter(item => !disabledIngredients.includes(item.normalized))
                .map(item => item.structured || item.raw);

            if (sourceIngredients.length === 0) {
                toast.info(t('Ya tienes todos estos ingredientes en tu Nevera.'), { icon: '📦' });
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
                if (!silent) toast.success(t('¡Ingredientes ingresados a tu Nevera Virtual!'), { icon: '📦' });
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
                if (!silent) toast.error(_msg || t('Error al actualizar la despensa.'));
                else throw new Error(_msg || 'restock failed'); // deja que el nudge reintente
            }
        } catch (error) {
            console.error('🛒 [RESTOCK] CATCH ERROR:', error);
            if (!silent) toast.error(t('Hubo un error de conexión al registrar la compra.'));
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
        if (next !== null) setSelectedDay({ origen: 'vivo', idx: next });
    }, [planData?.days, todayPlanDayIndex, visibleStartIndex]);

    // [P1-DASH-WEEK-NAV] El día mostrado puede venir de `days` o de
    // `_archived_days`, y cada colección tiene su propio rango de índices. No
    // usar `activeDayIndex` para leer un archivado: ahí vale 0 y pintaría el
    // primer día vivo.
    const currentDayRecord = selectedDay?.origen === 'archivado'
        ? (planData?._archived_days || [])[selectedDay.idx]
        : planDays[activeDayIndex];
    // La vista por semanas solo aplica si TODOS los días llevan su fecha
    // estampada. Sin eso degradamos a la fila de siempre: no inferimos fechas
    // (la razón, en utils/planWeeks.js).
    const weekNavReady = useMemo(() => buildTimeline(planData).ok, [planData]);

    const currentDayMeals = currentDayRecord?.meals || [];
    const currentDaySupplements = currentDayRecord?.supplements || [];

    // [P1-TODAY-REMAINING · 2026-07-28] Solo aplica al tab de HOY — un día
    // pasado o futuro no tiene "ya comido hoy" que atenuar. `currentDayMeals`
    // SIN filtrar (mismos índices que usa el swap, ver P2-SWAP-INDEX-COUPLING
    // más abajo) para que `todaysEatenIndices` sea directamente comparable
    // contra el `index` del map de comidas.
    const isTodayTabActive = activeDayIndex === todayPlanDayIndex;
    const todaysEatenIndices = useMemo(
        () => (isTodayTabActive ? getEatenSlotIndices(currentDayMeals, todaysConsumedMeals) : new Set()),
        [isTodayTabActive, currentDayMeals, todaysConsumedMeals]
    );
    // [P1-REMAINING-LINE-HONEST · 2026-07-28] "Te quedan ~X kcal de
    // presupuesto para N comidas del plan (~Y kcal)" — 3 cantidades
    // INDEPENDIENTES, ya NO una sola frase que las confunde (bug real: "Te
    // quedan ~460 kcal estimadas en 2 comidas del plan" cuando esas 2
    // comidas suman 1.284 kcal, no 460 — el owner lo detectó a simple
    // vista). `remainingKcal` = meta - SUMA CRUDA de lo comido hoy (nunca
    // depende de la atribución, que puede quedar ambigua — ver regla de
    // ambigüedad) — SIN el `Math.max(0, …)` que antes aplastaba el exceso a
    // "0 kcal" justo cuando el dato importaba más; ahora queda con signo y
    // `todayRemainingLine` decide qué decir con él. `plannedKcal` = suma de
    // `meal.cals` de los slots restantes (`sumPlannedRemainingCalories`,
    // MISMO `todaysEatenIndices` que atenúa las cards — nunca una segunda
    // regla de match). `remainingCount` = slots de hoy que NO se pudieron
    // remover por match inequívoco. Solo se muestra si ya hay algo
    // registrado hoy (paridad con el gate `if consumed_today:` del
    // backend, agent.py::_build_today_remaining_context — nota: esa
    // función backend tiene la MISMA conflación kcal-presupuesto vs
    // kcal-planificado sin corregir todavía; hasta que se corrija, el
    // coach y esta tarjeta pueden narrar el mismo día distinto).
    const todaysRemainingSummary = useMemo(() => {
        if (!isTodayTabActive || currentDayMeals.length === 0) return null;
        if (!Array.isArray(todaysConsumedMeals) || todaysConsumedMeals.length === 0) return null;
        const targetCalories = parseInt(planData?.calories) || null;
        const consumedTotal = sumConsumedCalories(todaysConsumedMeals);
        let remainingCount = 0;
        currentDayMeals.forEach((meal, index) => {
            if (meal?.meal?.toLowerCase().includes('suplemento')) return;
            if (!todaysEatenIndices.has(index)) remainingCount += 1;
        });
        const remainingKcal = targetCalories != null ? Math.round(targetCalories - consumedTotal) : null;
        const plannedKcal = sumPlannedRemainingCalories(currentDayMeals, todaysEatenIndices);
        return {
            remainingCount,
            remainingKcal,
            plannedKcal,
            isOverBudget: remainingKcal != null && remainingKcal < 0,
            exceedsBudget: remainingKcal != null && remainingKcal >= 0 && plannedKcal > remainingKcal,
            message: todayRemainingLine({ remainingKcal, plannedKcal, remainingCount }),
        };
    }, [isTodayTabActive, currentDayMeals, todaysConsumedMeals, todaysEatenIndices, planData?.calories]);

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
                       (0.4→0.22) para que sea un acento sutil, no un trazo fuerte.
                       [P1-NOTEBOOK-MARGIN-LIGHT · 2026-08-11] El alpha vuelve a subir,
                       0.22 → 0.6, SOLO para el tema claro (el oscuro tiene su propia
                       regla más abajo y no se toca).

                       El dueño lo reportó como «se siente muy transparente el rojo», y
                       medido resultó no ser una cuestión de gusto: la MISMA línea se
                       despega ΔL* 20,8 del papel en oscuro y solo 8,3 en claro — menos
                       de la mitad de fuerza para el mismo elemento. El softening de
                       junio se calibró mirando el tema oscuro, donde el rojo sobre
                       #111827 aguanta un alpha bajo; sobre el papel #FDFCF8 ese mismo
                       0.22 compone un rosa casi indistinguible del fondo.

                       0.6 la deja en ΔL* 22,1: por encima de su gemela oscura, y 2,7×
                       lo que había. Se ancla en la gemela y no en un número elegido a
                       ojo porque es el mismo elemento en los dos temas — si en uno se
                       lee y en el otro no, lo que falla es la paridad, no el tono.

                       ΔL* y no ratio WCAG: esto es una SUPERFICIE de 1px, no texto; el
                       ratio está pensado para legibilidad de glifos y aquí respondería
                       a otra pregunta. Mismo criterio que P1-LIGHT-INK-CONTRACT. */
                    top: 1.25rem;
                    bottom: 1.25rem;
                    left: 2.5rem;
                    width: 3px;
                    border-left: 1px solid rgba(248, 113, 113, 0.6);
                    border-right: 1px solid rgba(248, 113, 113, 0.6);
                    z-index: 0;
                    pointer-events: none;
                }
                /* [P1-MEAL-CARD-ROWS · 2026-08-09] DOS FILAS, no dos columnas.
                   Era «grid-template-columns: 1fr auto»: texto contra un bloque de
                   acciones dimensionado por su contenido. MEDIDO, ese bloque son
                   310 px y el coste fijo de la fila 446 px, así que la descripción
                   necesitaba 746 px de tarjeta para alcanzar 40 caracteres por
                   línea — y como su columna era la elástica, absorbía el 100 % de
                   cualquier recorte. A ~600 px de tarjeta el párrafo caía a ~155 px
                   y se leía en una columna de diez líneas cortas.

                   Ahora el texto ocupa el ancho entero y las acciones tienen su
                   propia fila. Esto NO es la adaptación móvil subida a escritorio:
                   la de <=768px reconstruía a mano esta misma fila con cuatro
                   reglas sobre la vieja columna lateral - se borraron, porque la
                   estructura ya la trae de serie a todas las anchuras. */
                .meal-card {
                    padding: 2.5rem 2.5rem 2.5rem 4.5rem;
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1.25rem;
                    align-items: start;
                    background: transparent;
                    position: relative;
                    z-index: 1;
                }
                /* Cabecera: rótulo + título elásticos, kcal fija a la derecha.
                   «align-items: flex-start» y no «center» - con un titulo de tres
                   líneas, centrar la cifra la deja flotando a media altura sin
                   nada con lo que alinearse. */
                .meal-head {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 1.25rem;
                }
                .meal-head-text {
                    flex: 1;
                    min-width: 0;
                }
                /* «flex: none» + «text-align: right»: la cifra no encoge nunca -
                   es el dato que el usuario busca de un vistazo. */
                .meal-kcal {
                    flex: none;
                    text-align: right;
                    line-height: 1.15;
                }
                /* La hairline separa la lectura de la acción. Es la misma regla que
                   la adaptación móvil ya usaba, ahora a todas las anchuras. */
                .meal-actions {
                    border-top: 1px solid var(--border);
                    padding-top: 1.1rem;
                }
                .meal-actions-row {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }
                /* Tope de MEDIDA del párrafo. Sin él, soltar el texto a todo el
                   ancho cambia un problema por el contrario: MEDIDO, a 1000 px de
                   tarjeta la línea llegaba a ~123 caracteres, muy por encima del
                   rango legible (45-75). 68ch la deja en ~72 en la tarjeta más
                   ancha y no ata nada por debajo — a 600 px sigue mandando el
                   contenedor. El título NO lleva tope: es corto y su salto de
                   línea no cansa. */
                .meal-desc {
                    max-width: 68ch;
                }
                /* [P1-EATEN-SLOT-POLISH-ALIGN-FIX · 2026-07-28] La anotación "Te
                   quedan..." reproduce el indent de .meal-card (margin-left 2.5rem +
                   padding-left 2rem = 4.5rem, el mismo valor que .meal-card
                   padding-left arriba) via CLASE en vez de inline style — así puede
                   seguir el mismo override responsive que .meal-card recibe en
                   móvil (ver @media max-width:768px, bloque DASH-MOBILE-CLEAN-CARD)
                   en vez de quedar fija en desktop. Pre-fix el inline style no tenía
                   media query: en <=768px .meal-card cae a padding-left 1.25rem
                   pero la anotación se quedaba en 4.5rem, ~3.25rem más adentro que
                   las cards que anota — leía como un indent suelto flotando sobre
                   el cuaderno, justo el defecto visual que este mismo fix intentaba
                   cerrar. */
                .today-remaining-note {
                    margin-left: 2.5rem;
                    padding: 0.85rem 2.5rem 0.85rem 2rem;
                    font-size: 0.85rem;
                    line-height: 1.5;
                }
                /* [P1-DASH-WEEK-NAV · 2026-08-04] La navegación por semanas vive
                   DENTRO del cuaderno, así que tiene que respetar su geometría:
                   sin esto arrancaba en 0 —pegada al lomo y a la IZQUIERDA de la
                   línea de margen roja (.meals-container::before, left 2.5rem)—
                   y se estiraba hasta el borde derecho. El owner lo reportó como
                   "las semanas pegan del borde izquierdo y los días del derecho".
                   Mismos insets que .meal-card (4.5rem / 2.5rem) para que las
                   pastillas, la fila de días y las comidas de abajo compartan
                   exactamente el mismo eje.
                   Va por CLASE y no inline por la razón de
                   P1-EATEN-SLOT-POLISH-ALIGN-FIX, justo arriba: un inline style
                   no recibe el override responsive y se queda ~3rem más adentro
                   que lo que alinea. */
                .plan-week-nav {
                    padding-left: 4.5rem;
                    padding-right: 2.5rem;
                }
                /* [P3-DASH-LAST-SEPARATOR-FIX · 2026-07-12] :last-child → :last-of-type.
                   El wrapper de comidas termina con un nodo <style> inline (hover de
                   .meal-act-btn): con :last-child la ÚLTIMA comida nunca era "última"
                   → pintaba un separador de más, clavado contra el borde inferior
                   redondeado del cuaderno (la "franja gris" reportada, se curvaba con
                   la esquina por el overflow:hidden). :last-of-type cuenta solo DIVs
                   → inmune a <style>/<script> hermanos. Si añades un DIV al FINAL del
                   wrapper que no sea comida, el bug vuelve — añádelo antes del map. */
                .meal-card:not(:last-of-type)::after,
                .skipped-lunch:not(:last-of-type)::after {
                    content: '';
                    display: block;
                    position: absolute;
                    bottom: 0;
                    left: 2.5rem;
                    right: 0;
                    height: 2px;
                    background: rgba(147, 197, 253, 0.3);
                }
                /* [P1-SWAP-LOADING-UX · 2026-07-10] Overlay "cocinando" por card:
                   scrim + blur del contenido, barrido shimmer violeta→cian y chip
                   pulsante con etapas rotando. Funciona sobre ambos temas (scrim
                   oscuro estilo modal). Respeta prefers-reduced-motion. */
                .meal-cooking-overlay {
                    position: absolute;
                    inset: 0;
                    z-index: 5;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(10, 14, 26, 0.58);
                    backdrop-filter: blur(3px);
                    -webkit-backdrop-filter: blur(3px);
                    overflow: hidden;
                    animation: cookFadeIn 0.25s ease-out;
                    /* [v2] track de la barra de progreso (el segmento de color vive en ::after) */
                    border-bottom: 3px solid rgba(255, 255, 255, 0.07);
                }
                /* [P2-DAYREGEN-LOADING-POLISH v2 · 2026-07-12] Ola + barra COORDINADAS
                   (feedback owner: "la primera ola es lenta y la otra rápida, se siente
                   lagueada"): un solo ritmo compartido (2.2s, mismo easing, misma fase) y
                   transform/GPU en vez de background-position (que repintaba cada frame —
                   el origen del lag). La ola diagonal y el segmento de la barra cruzan la
                   card JUNTOS de izquierda a derecha. */
                .meal-cooking-overlay::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(105deg, transparent 40%,
                        rgba(139, 92, 246, 0.22) 48%, rgba(34, 211, 238, 0.18) 54%,
                        transparent 62%);
                    transform: translateX(-70%);
                    animation: cookSweep 2.2s cubic-bezier(0.45, 0, 0.25, 1) infinite;
                    will-change: transform;
                    pointer-events: none;
                }
                .meal-cooking-overlay::after {
                    content: '';
                    position: absolute;
                    left: 0; bottom: -3px;
                    width: 45%;
                    height: 3px;
                    background: linear-gradient(90deg, transparent 0%, #8B5CF6 30%, #22D3EE 55%, transparent 100%);
                    transform: translateX(-100%);
                    animation: cookBarSlide 2.2s cubic-bezier(0.45, 0, 0.25, 1) infinite;
                    will-change: transform;
                    pointer-events: none;
                }
                @keyframes cookSweep {
                    0% { transform: translateX(-70%); }
                    100% { transform: translateX(70%); }
                }
                @keyframes cookBarSlide {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(240%); }
                }
                .meal-cooking-chip {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    padding: 0.65rem 1.1rem;
                    border-radius: 999px;
                    background: rgba(17, 24, 39, 0.92);
                    border: 1px solid rgba(139, 92, 246, 0.55);
                    box-shadow: 0 8px 24px -8px rgba(124, 58, 237, 0.55);
                    animation: cookPulse 2.2s cubic-bezier(0.45, 0, 0.25, 1) infinite;
                    max-width: 92%;
                }
                .meal-cooking-chip .cook-icon {
                    color: #A78BFA;
                    flex-shrink: 0;
                    animation: cookBob 1.8s ease-in-out infinite;
                }
                .meal-cooking-text {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #E5E7EB;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    animation: cookTextIn 0.4s ease-out;
                }
                @keyframes cookPulse {
                    0%, 100% { box-shadow: 0 8px 24px -8px rgba(124, 58, 237, 0.55); border-color: rgba(139, 92, 246, 0.55); }
                    50% { box-shadow: 0 8px 30px -6px rgba(34, 211, 238, 0.45); border-color: rgba(34, 211, 238, 0.6); }
                }
                @keyframes cookBob {
                    0%, 100% { transform: translateY(0) rotate(0deg); }
                    30% { transform: translateY(-2px) rotate(-8deg); }
                    60% { transform: translateY(1px) rotate(6deg); }
                }
                @keyframes cookFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes cookTextIn {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: none; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .meal-cooking-overlay,
                    .meal-cooking-overlay::before,
                    .meal-cooking-overlay::after,
                    .meal-cooking-chip,
                    .meal-cooking-chip .cook-icon,
                    .meal-cooking-text { animation: none !important; }
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
                    transform: translateY(-1px); /* [P3-RESTOCK-MODAL-POLISH] lift de familia */
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

                /* [P3-RESTOCK-MODAL-POLISH · 2026-07-12] Familia de diálogos pulidos
                   (mismo lenguaje que la confirmación destructiva de la Nevera, en
                   clave POSITIVA): icono con gradiente emerald + halo concéntrico +
                   glow, chips con tinte sutil. Theme-aware vía tokens --success*. */
                .restock-modal-icon {
                    position: relative;
                    width: 60px;
                    height: 60px;
                    border-radius: 18px;
                    margin: 0 auto 1.25rem;
                    display: grid;
                    place-items: center;
                    color: var(--success-text);
                    background: linear-gradient(160deg,
                        color-mix(in srgb, var(--success) 20%, var(--bg-card)),
                        color-mix(in srgb, var(--success) 7%, var(--bg-card)));
                    border: 1px solid color-mix(in srgb, var(--success) 35%, transparent);
                    box-shadow: 0 10px 28px -8px color-mix(in srgb, var(--success) 40%, transparent);
                }
                .restock-modal-icon::after {
                    content: '';
                    position: absolute;
                    inset: -9px;
                    border-radius: 24px;
                    border: 1px solid color-mix(in srgb, var(--success) 16%, transparent);
                    pointer-events: none;
                }
                .restock-modal-chip {
                    font-size: 0.72rem;
                    color: var(--text-muted);
                    border: 1px solid var(--border);
                    border-radius: 999px;
                    padding: 0.24rem 0.68rem;
                    white-space: nowrap;
                    max-width: 140px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    background: color-mix(in srgb, var(--text-main) 4%, transparent);
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
                    .meal-card:not(:last-of-type)::after,
                    .skipped-lunch:not(:last-of-type)::after {
                        left: 0.5rem;
                        display: block;
                    }
                    .meal-card {
                        padding: 2rem 1.25rem 2rem 2.25rem;
                        border-radius: 0;
                        grid-template-columns: 1fr;
                        gap: 1rem;
                    }
                    /* [P1-DASH-WEEK-NAV] Sigue a .meal-card: mismos insets. */
                    .plan-week-nav {
                        padding-left: 2.25rem;
                        padding-right: 1.25rem;
                    }
                    .skipped-lunch {
                        padding: 2rem 1.25rem 2rem 2.25rem;
                    }
                    /* [P1-MEAL-CARD-ROWS · 2026-08-09] Aquí vivían CUATRO reglas
                       sobre la vieja columna lateral que reconstruian a mano, solo en
                       móvil, la fila de acciones a lo ancho con una hairline
                       encima. Se van con la clase: esa estructura ahora es la
                       de todas las anchuras, así que la adaptación móvil ya no
                       tiene nada que adaptar.

                       [P3-MENU-MOBILE-ACTIONS · 2026-05-30] Lo único que
                       sobrevive es que "Cambiar Plato" (2º botón = acción
                       primaria) crezca para ocupar el centro entre los
                       circulares. Sigue siendo cierto y sigue siendo solo de
                       móvil: en escritorio la fila entera cabe holgada y
                       estirar la CTA a 260px la separaría de sus hermanas sin
                       motivo. */
                    .meal-actions-row {
                        justify-content: space-between;
                    }
                    .meal-actions-row .meal-act-btn:nth-child(2) {
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
                    .meal-card:not(:last-of-type)::after,
                    .skipped-lunch:not(:last-of-type)::after {
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
                    /* [P1-MEAL-CARD-ROWS · 2026-08-09] Aquí una regla sobre la vieja columna lateral
                       (gap: 0.5rem !important) apretaba el hueco
                       entre botones bajo 480px. Se va por doble motivo: la clase ya
                       no existe, y 0.5rem es el gap BASE de «.meal-actions-row»
                       desde este P-fix, así que la regla no tenía nada que apretar. */
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
                    .meal-card:not(:last-of-type)::after,
                    .skipped-lunch:not(:last-of-type)::after {
                        left: 1.25rem !important;
                        right: 1.25rem !important;
                    }
                    /* [P1-EATEN-SLOT-POLISH-ALIGN-FIX · 2026-07-28] Misma pin de
                       1.25rem que .meal-card arriba, para que la anotación quede
                       en la MISMA columna de texto que las cards en <=768px (antes
                       fija en 4.5rem via inline style, sin media query). */
                    .today-remaining-note {
                        margin-left: 0 !important;
                        padding-left: 1.25rem !important;
                        padding-right: 1.25rem !important;
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
                                ? t('Invitado')
                                : !isPremium
                                ? t('GRATUITO')
                                : userProfile?.plan_tier === 'ultra' ? 'MAX'
                                : userProfile?.plan_tier === 'plus' ? 'PLUS'
                                : t('BÁSICO');
                            return (
                                <button
                                    type="button"
                                    onClick={() => navigate('/dashboard/upgrade')}
                                    aria-label={t('Plan actual: {tier}. Click para ver todos los planes.', { tier: tierLabel })}
                                    className={`plan-tier-badge plan-tier-badge--${tierVariant}`}
                                >
                                    <span className="plan-tier-badge-label">
                                        {tierLabel}
                                    </span>
                                    <span className="plan-tier-badge-cta">{t('Ver planes')}</span>
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
                                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                                            {{ weekly: t('semanal'), biweekly: t('quincenal'), monthly: t('mensual') }[groceryDuration] || t('semanal')}
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
                                            aria-label={t('Tu Nevera puede estar desactualizada. Estamos usando datos en caché. Verifica antes de comprar para evitar duplicados.')}
                                            title={t('Tu Nevera puede estar desactualizada. Estamos usando datos en caché. Verifica antes de comprar para evitar duplicados.')}
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
                                            <AlertCircle size={11} color="var(--ink-pantry)" strokeWidth={2.5} />
                                            <span>{t('caché')}</span>
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
                                            {t('Finalizado')}
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
                                            <span style={{ fontSize: '0.66rem', color: isDark ? '#34D399' : '#047857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Clock size={11} /> {t('Duración del Plan')}
                                            </span>
                                        </div>
                                        {[
                                            { value: 'weekly', label: t('7 Días'), sub: t('Semanal') },
                                            { value: 'biweekly', label: t('15 Días'), sub: t('Quincenal') },
                                            { value: 'monthly', label: t('30 Días'), sub: t('Mensual') }
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
                                                        // [P1-COUNTRY-SYSTEM-F1 · 2026-08-16 (T7, fold de la review de T6)]
                                                        // `budgetCurrency` crudo puede quedar STALE en una moneda beta
                                                        // (bandera apagada tras rollback, país cambiado) — `minBudgetFor`
                                                        // con esa moneda cruda leería el piso EUR/MXN/COP (75/1400/350000)
                                                        // mientras el símbolo mostrado ya volvió a 'RD$', autorellenando un
                                                        // monto absurdamente bajo. Mismo fix que QBudget/InteractiveAssessmentFlow/
                                                        // useBudgetFloor (T6 fix-round 1).
                                                        const _afCur = effectiveBudgetCurrency(formData?.country, formData?.budgetCurrency);
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
                                                        const recalcToast = toast.loading(t('Calculando lista...'), { position: 'top-center' });
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
                                                                    toast.success(t('Lista actualizada'), { id: recalcToast });
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
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: groceryDuration === opt.value ? (isDark ? '#34D399' : '#047857') : 'var(--text-main)' }}>{opt.label}</span>
                                                    <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{opt.sub}</span>
                                                </div>
                                                {groceryDuration === opt.value && <CheckCircle size={15} color={isDark ? '#34D399' : '#047857'} strokeWidth={2.5} />}
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
                                            <span style={{ fontSize: '0.66rem', color: isDark ? '#34D399' : '#047857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Wallet size={11} /> {t('Presupuesto')}
                                            </span>
                                        </div>
                                        {(() => {
                                            // [P1-COUNTRY-SYSTEM-F1 · 2026-08-16 (T7, fold de la review de T6)]
                                            // mismo motivo que el autofill de arriba: `budgetCurrency` crudo
                                            // puede seguir en una moneda beta STALE tras un rollback.
                                            const _cur = effectiveBudgetCurrency(formData?.country, formData?.budgetCurrency);
                                            const _sym = _cur === 'USD' ? 'US$' : 'RD$';
                                            const _min = budgetFloor.min;
                                            const _cycleDays = budgetCycleDays(groceryDuration);
                                            const _amt = Number(formData?.budgetAmount);
                                            const _isCustom = formData?.budget === 'custom';
                                            const _belowMin = _isCustom && formData?.budgetAmount !== '' && formData?.budgetAmount != null && _amt > 0 && _amt < _min;
                                            const _setBudget = (field, value) => { updateData(field, value); safeUpdateHealthProfile({ [field]: value }); };
                                            const _opts = [
                                                { val: 'low', label: t('Económico') },
                                                { val: 'medium', label: t('Moderado') },
                                                { val: 'high', label: t('Alto') },
                                                { val: 'unlimited', label: t('Sin límite') },
                                                { val: 'custom', label: t('Personalizar') },
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
                                                                        color: sel ? (isDark ? '#34D399' : '#047857') : 'var(--text-main)',
                                                                        transition: 'all 0.15s ease',
                                                                    }}
                                                                >{o.label}</button>
                                                            );
                                                        })}
                                                    </div>
                                                    {_selTierRef && (
                                                        <span style={{ display: 'block', marginTop: '0.45rem', fontSize: '0.68rem', lineHeight: 1.35, color: 'var(--text-muted)' }}>
                                                            ≈ {t('{monto} por {dias} días (referencia estimada según tus metas).', { monto: `${_sym}${Number(_selTierRef).toLocaleString('en-US')}`, dias: _cycleDays })}
                                                        </span>
                                                    )}
                                                    {_isCustom && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.55rem' }}>
                                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                <div style={{ position: 'relative', flex: 1 }}>
                                                                    <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem', pointerEvents: 'none' }}>{_sym}</span>
                                                                    <input
                                                                        type="number" inputMode="decimal" min={_min} step="1"
                                                                        placeholder={_cur === 'USD' ? t('Ej. 100') : t('Ej. 5000')}
                                                                        value={formData?.budgetAmount || ''}
                                                                        onChange={(e) => _setBudget('budgetAmount', e.target.value)}
                                                                        aria-label={_cur === 'USD' ? t('Presupuesto total en dólares') : t('Presupuesto total en pesos dominicanos')}
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
                                                                {_belowMin ? '⚠️ ' : ''}{t('Mínimo {monto} para {dias} días{nota}.', {
                                                                    monto: `${_sym}${_min.toLocaleString('en-US')}`,
                                                                    dias: _cycleDays,
                                                                    nota: budgetFloor.isPersonalized ? t(' (según tus metas)') : '',
                                                                })}
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
                            {!isPlanPaused && (() => {
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
                                        title={isPantryTooEmpty ? t('Tu Nevera necesita al menos {minimo} alimentos. Tap para añadirlos.', { minimo: PANTRY_MIN_ITEMS_FOR_UPDATE }) : undefined}
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
                                        {/* [P2-DAYREGEN-OVERLAY-SCOPE v2] spinner/label del botón del día
                                            solo en el tab del día en regen; disabled queda global. */}
                                        {(isDayUpdating && (dayRegenIndex == null || dayRegenIndex === activeDayIndex))
                                            ? <Loader2 size={18} className="spin-fast" />
                                            : isLimitReached
                                                ? <AlertCircle size={18} />
                                                : planFinished
                                                    ? <RefreshCw size={18} />
                                                    : isPantryTooEmpty
                                                        ? <Refrigerator size={18} />
                                                        : <Wand2 size={18} />}
                                        <span style={{ fontSize: '0.85rem' }}>
                                            {(isDayUpdating && (dayRegenIndex == null || dayRegenIndex === activeDayIndex))
                                                ? t('Actualizando…')
                                                : isLimitReached
                                                    ? t('Límite')
                                                    : planFinished
                                                        ? t('Reiniciar plan')
                                                        : isPantryTooEmpty
                                                            ? t('Ir a mi Nevera')
                                                            : t('Actualizar platos')}
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
                                    title={t('Agrega de una vez todo lo de tu lista de compras a la Nevera.')}
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
                                    <span>{t('Ya compré la lista')}</span>
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
                                /* [P1-LIGHT-INK-CONTRACT · 2026-08-10] El texto de esta píldora SÍ cumplía
                                   (5,48:1). Lo que el dueño veía lavado era el relleno: quedaba a
                                   ΔL* 2,4 del fondo de página y no se leía como píldora. Sube a
                                   emerald-100/300. Arreglo de SUPERFICIE, no de color. */
                                background: isDark ? 'rgba(16,185,129,0.10)' : '#DCFCE7',
                                border: isDark ? '1px solid rgba(52,211,153,0.30)' : '1px solid #86EFAC',
                                color: isDark ? '#6EE7B7' : '#047857',
                                fontSize: '0.74rem', fontWeight: 600, lineHeight: 1.3,
                                textAlign: 'center',
                            }}>
                                <Refrigerator size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {shoppingDeltaMeta.isEmptyDueToPantry
                                        ? tn(shoppingDeltaMeta.itemsRemoved,
                                            'Tu Nevera ya cubre la lista ({n} ítem de la compra)',
                                            'Tu Nevera ya cubre la lista ({n} ítems de la compra)',
                                            { n: shoppingDeltaMeta.itemsRemoved })
                                        : tn(shoppingDeltaMeta.itemsRemoved,
                                            '{n} ítem de la lista ya en tu Nevera',
                                            '{n} ítems de la lista ya en tu Nevera',
                                            { n: shoppingDeltaMeta.itemsRemoved })}
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
                            // [P1-PDF-COST-DELTA-AWARE · 2026-07-12] Con Nevera descontando ítems, el
                            // estimado del backend describe el plan COMPLETO — usar el ciclo delta-aware
                            // (paridad con el recuadro del PDF). El estimado solo BAJA → el status solo
                            // puede mejorar: re-derivación monótona (≤ ref ⇒ dentro; si no, se conserva
                            // el status del backend — sin adivinar la tolerancia del knob client-side).
                            const _deltaAwareBanner = (shoppingDeltaMeta?.itemsRemoved || 0) > 0
                                && typeof shoppingDeltaMeta?.deltaCycleRd === 'number'
                                && shoppingDeltaMeta.deltaCycleRd > 0;
                            const _estCycleRd = _deltaAwareBanner
                                ? shoppingDeltaMeta.deltaCycleRd : _br.estimated_cycle_rd;
                            const _statusEff = (_deltaAwareBanner && _estCycleRd <= _br.reference_rd)
                                ? 'dentro' : _br.status;
                            const _palette = _statusEff === 'dentro'
                                ? { icon: '✓', bg: isDark ? 'rgba(16,185,129,0.10)' : '#ECFDF5', border: isDark ? 'rgba(52,211,153,0.35)' : '#A7F3D0', fg: isDark ? '#6EE7B7' : '#065F46' }
                                : _statusEff === 'cerca'
                                    ? { icon: '≈', bg: isDark ? 'rgba(245,158,11,0.10)' : '#FFFBEB', border: isDark ? 'rgba(251,191,36,0.35)' : '#FDE68A', fg: isDark ? '#FCD34D' : '#92400E' }
                                    : { icon: '▲', bg: isDark ? 'rgba(244,63,94,0.10)' : '#FEF2F2', border: isDark ? 'rgba(251,113,133,0.35)' : '#FECACA', fg: isDark ? '#FDA4AF' : '#991B1B' };
                            // [P2-AUDIT-V6-BATCH · 2026-07-03] (P2-I) para tiers categóricos (low/medium/high)
                            // el RD$Y es piso×banda — un número que el usuario NUNCA declaró. Etiquetarlo
                            // "referencia estimada" evita que se lea como un techo que él puso. Custom = su monto.
                            const _refIsEstimated = _br.basis && _br.basis !== 'custom';
                            const _refLabel = `${_fmtRD(_br.reference_rd)}${_refIsEstimated ? t(' (referencia estimada)') : ''}`;
                            const _headline = _statusEff === 'dentro'
                                ? t('Dentro de tu presupuesto: {gasto} de {referencia} por ciclo', { gasto: _fmtRD(_estCycleRd), referencia: _refLabel })
                                : _statusEff === 'cerca'
                                    ? t('Al límite de tu presupuesto: {gasto} de {referencia} por ciclo', { gasto: _fmtRD(_estCycleRd), referencia: _refLabel })
                                    : t('Tu lista supera tu presupuesto por {exceso} ({gasto} de {referencia})', { exceso: _fmtRD(Math.max(0, _estCycleRd - _br.reference_rd)), gasto: _fmtRD(_estCycleRd), referencia: _refLabel });
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
                                            aria-label={t('Ocultar este aviso (se guarda en notificaciones)')}
                                            title={t('Ocultar (se guarda en notificaciones)')}
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
                                            {t('Estimado parcial: {cobertura}% de los ítems tienen precio — el total real puede ser mayor.', { cobertura: Math.round((_br.price_coverage || 0) * 100) })}
                                        </p>
                                    )}
                                    {_br.adjusted && _subs.length > 0 && (
                                        <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                            {t('Para cuidar tu bolsillo ajustamos: {sustituciones}', { sustituciones: _subs.join(' · ') })}
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
                                        // [P1-PDF-COST-DELTA-AWARE · 2026-07-12] Con Nevera descontando,
                                        // "esta ida" es el DELTA real (paridad con el PDF), no la lista
                                        // completa (vivo: toast decía RD$5,989 · 44 ítems con 8 por comprar).
                                        if (_deltaAwareBanner && typeof shoppingDeltaMeta?.deltaTripRd === 'number'
                                            && shoppingDeltaMeta.deltaTripRd > 0) {
                                            return (
                                                <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                                    {t('Esta ida al súper:')} <strong style={{ color: _palette.fg }}>{_fmtRD(shoppingDeltaMeta.deltaTripRd)}</strong> {t('· {items} ítems (tu Nevera ya cubre {cubiertos}) — el detalle está en el PDF.', { items: shoppingDeltaMeta.deltaCount, cubiertos: shoppingDeltaMeta.itemsRemoved })}
                                                </p>
                                            );
                                        }
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
                                                {t('Esta ida al súper:')} <strong style={{ color: _palette.fg }}>{_fmtRD(_tripCost)}</strong> {t('· {items} ítems — el detalle está en el PDF.', { items: _trItems.length })}
                                            </p>
                                        );
                                    })()}
                                </div>
                            );
                        })()}

                        {/* [P1-SUPERMARKET-MATCH · 2026-07-02] Marcas y precios reales del súper
                            por ítem de la lista (base Supermercado RD). Informativo — no toca
                            plan_data ni el costeo; persistencia de marca preferida = fase 2. */}
                        {/* [P1-BRANDS-HIDE-WHEN-BOUGHT · 2026-08-09] Se oculta cuando la
                            Nevera YA cubre la lista entera. El panel sirve para decidir
                            marca ANTES de ir al súper; una vez importaste la compra, el
                            sitio para cambiarla es la propia Nevera —que escribe en el
                            MISMO endpoint de preferencias (`/api/supermarket/preferences`,
                            ver `Pantry.jsx::changeItemBrand`)—, así que no se pierde
                            ninguna función: se deja de ofrecer el mismo trabajo en dos
                            sitios cuando solo uno tiene sentido.

                            La condición es `shoppingDeltaMeta.hasItems`, que es VIVA
                            (`buildDeltaShoppingList` contra `liveInventory`), no un flag
                            persistente: cuando entre la semana siguiente con ítems nuevos
                            por comprar, el panel reaparece solo. Un flag de "ya compró"
                            se habría quedado pegado.

                            `hasItems !== false` y no `=== true`: mientras `liveInventory`
                            no ha cargado el memo devuelve `null`, así que `?.hasItems` es
                            `undefined` — y en esa ventana la decisión segura es MOSTRAR.
                            Con `=== true` el panel parpadearía (oculto → visible) en cada
                            carga, que es peor que mostrarlo de más un instante.

                            [P1-COUNTRY-SYSTEM-F1 · 2026-08-16 (T7)] País beta sin precios
                            nativos ⇒ el panel completo se oculta: "elegir marca más barata"
                            no significa nada sin costos que comparar, y las cards del panel
                            muestran RD$ por diseño (SupermarketBrands.jsx) — mostrarlas
                            vacías/engañosas sería peor que no ofrecerlas todavía. */}
                        {brandsPanelList.length > 0
                            && shoppingDeltaMeta?.hasItems !== false
                            && !isPlanExpired && !planFinished && !isPlanCorrupted
                            && planData?._pricing_mode !== 'beta_no_prices' && (
                            <SupermarketBrands
                                // [P2-BRANDS-CANONICAL-SOURCE] canónica semanal — el panel de
                                // marcas vive aunque ya hayas comprado todo el ciclo.
                                shoppingList={brandsPanelList}
                                // [P2-BRANDS-DEFAULT-FROM-ACTIVE] la lista activa (la del PDF) →
                                // marcar el default real que la lista usa por ítem.
                                activeList={brandsActiveList}
                                // [P2-BRANDS-OPTIMISTIC · 2026-07-07] Update en TIEMPO REAL: al elegir
                                // la marca parcheamos la lista mostrada al instante (marca + precio si el
                                // envase coincide) + toast breve de éxito. Antes esto solo mostraba un
                                // toast "Aplicando…" que quedaba girando 15-40s (recalc + cola) con la
                                // lista aún en "Genérico" — se sentía roto. `variant` null = deselección.
                                onPrefPending={(foodKey, variant) => {
                                    if (!variant) {
                                        toast.success(t('Marca quitada — actualizando tu lista…'), { id: 'brand-apply', duration: 2200, position: 'top-center' });
                                        return;
                                    }
                                    // Optimista: si el ítem matchea, se reconstruye al instante (marca +
                                    // conteo + precio). Si no matchea (nombre raro), el recalc de fondo
                                    // lo aplica igual — feedback honesto "aplicando…".
                                    const patched = applyBrandToPlanOptimistic(planData, foodKey, variant);
                                    if (patched) {
                                        setPlanData(patched);
                                        toast.success(t('Marca aplicada a tu lista'), { id: 'brand-apply', duration: 2200, position: 'top-center' });
                                    } else {
                                        toast.success(t('Aplicando tu marca a la lista…'), { id: 'brand-apply', duration: 3500, position: 'top-center' });
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
                    aria-label={t('Modo invitado')}
                >
                    <div style={{ flex: 1, minWidth: '220px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem', display: 'block', marginBottom: '0.15rem' }}>
                            {t('Estás en modo invitado')}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {t('Este es un plan de muestra. Crea tu cuenta gratis para guardarlo, desbloquear la semana completa y registrar tus comidas.')}
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
                        {t('Crear cuenta gratis')}
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
                            {t('Tu plan quedó incompleto')}
                        </span>
                        <span style={{ color: 'var(--danger-text)', fontSize: '0.85rem' }}>
                            {t('La generación no terminó correctamente — no hay menú ni lista de compras disponibles. Genera un plan nuevo para continuar.')}
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
                        {t('Generar Nuevo Plan')}
                    </button>
                </motion.div>
            )}

            {/* [P1-PLAN-POLL-BOUNDED · 2026-07-29] El poll de nuevas semanas
                (AssessmentContext, `/plans-data/latest`) se rindió tras ~30min
                "activo, sin progreso" — ver hooks/usePlanPollLoop.js. Sin esto, dejar
                de pollear era invisible: la pantalla seguía mostrando el plan
                'partial' sin ninguna señal de que ya no se refresca solo (el modo de
                fallo que el brief pidió evitar explícitamente: "stopping must not
                leave a silent dead screen"). Anotación de cuaderno, NO alert box —
                mismo lenguaje visual que `.today-remaining-note` (P1-EATEN-SLOT-
                POLISH) pero sin acoplarse a esa clase (esta vive fuera del layout de
                "Tu Menú" — el indent de esa clase asume alineación con `.meal-card`,
                que no aplica aquí). Gate `!isPlanCorrupted`: el banner rojo de arriba
                (days=0) ya es la señal más fuerte — esta anotación cubre el caso que
                ESE banner no cubre (semanas ya materializadas, o `days=0` con
                `hasPendingPipelineInFlight()` suprimiendo el banner localmente). */}
            {planPollGaveUp && !isPlanCorrupted && planData?.generation_status === 'partial' && (
                <div
                    style={{
                        borderBottom: '2px solid rgba(147, 197, 253, 0.3)',
                        paddingBottom: '0.75rem',
                        marginBottom: '1.5rem',
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '0.6rem',
                        flexWrap: 'wrap',
                    }}
                >
                    <span>
                        {t('Dejamos de revisar si llegaron tus próximas semanas — puede que estén programadas para más adelante. Vuelve a esta pestaña más tarde y las buscamos de nuevo.')}
                    </span>
                    <button
                        type="button"
                        onClick={() => { hydrateLatestPlan?.({ force: true, src: 'give-up-retry' }); }}
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--accent)',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {t('Revisar ahora')}
                    </button>
                </div>
            )}

            {/* [P3-RESTOCK-NUDGE · 2026-06-23] Banner + prompt + auto-fill de respaldo
                para que el usuario llene la Nevera tras comprar (cierra el olvido de
                tocar "Ya compré la lista"). Solo en planes válidos con compras
                pendientes. La lógica de cuándo mostrar cada capa vive en
                utils/restockNudge.js; el restock real reusa handleRestock (SSOT). */}
            {/* [P1-RESTOCK-NUDGE-SETTLED · 2026-07-28] `pendingItemsSettled` le dice a
                RestockNudge si `hasPendingItems` es el dato REAL (computed contra
                liveInventory ya cargado) o el fallback cacheado de la sesión anterior
                (computedHasPendingShoppingItems === null, ~línea 2151/2291 arriba). Sin
                esto, el prompt #2 se auto-abría con el guess cacheado y se cerraba solo
                en cuanto el dato real resolvía ("aparece y desaparece") — y de paso
                quemaba el auto-open de una sola vez por sesión sobre un fantasma. */}
            <RestockNudge
                planData={planData}
                // [P1-DAILY-NOT-CYCLE · 2026-07-28] Mismo fallback que WaterTracker
                // más abajo — el snooze/recordatorio de RestockNudge ahora se
                // guardan por userId, no por plan (ver utils/restockNudge.js).
                userId={session?.user?.id || userProfile?.id || 'guest'}
                hasPendingItems={hasPendingShoppingItems && !isPlanExpired && !planFinished && !isPlanCorrupted}
                pendingItemsSettled={computedHasPendingShoppingItems !== null}
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
                            {t('¡Tu ciclo ha terminado!')}
                        </span>
                        <span style={{ color: 'var(--danger-text)', fontSize: '0.85rem' }}>
                            {t('Ya han pasado los días programados en tu plan actual. Genera uno nuevo para seguir recibiendo deliciosas recomendaciones y listas de compras frescas.')}
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
                        {t('Generar Nuevo Plan')}
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
                                ? t('Condición renal — este plan requiere supervisión de tu nefrólogo')
                                : t('Declaraste una condición de salud — consulta a tu profesional')}
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
                        aria-label={t('Ocultar aviso de revisión profesional')}
                        title={t('Ocultar')}
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
                            toast(t('Crea tu cuenta para hablar con tu coach IA'), {
                                description: t('Te dirá exactamente cómo mejorar cada micronutriente de tu plan.'),
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
            {/* [P1-PLAN-FREEZE · 2026-07-11] Plan congelado por Nevera vacía: banner
                persistente (sin X — el estado es accionable, no descartable). Tus días
                NO corren mientras esté congelado; el restock lo reanuda solo. */}
            {planData?._frozen_at && (
                <div style={{
                    background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.35)',
                    borderRadius: 14, padding: '14px 18px', margin: '0 0 14px',
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                }}>
                    <div style={{ fontSize: 26 }}>🧊</div>
                    <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontWeight: 800, color: '#7dd3fc', fontSize: 14 }}>
                            {t('Plan congelado — tu Nevera está vacía')}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#9fb3c8', marginTop: 3, lineHeight: 1.45 }}>
                            {t('Tus días NO están corriendo: no pierdes nada. Transfiere tu compra a la Nevera y el plan se reanuda solo, retomando exactamente donde quedó.')}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate('/dashboard/pantry')}
                        style={{
                            padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            background: '#38bdf8', color: '#082f49', fontWeight: 800, fontSize: 13,
                        }}
                    >
                        {t('Reponer mi Nevera →')}
                    </button>
                </div>
            )}
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
                        {/* [P3-ATTEMPTS-SINGULAR · 2026-07-04] "tras 1 intentos" era visible
                            desde que MAX_ATTEMPTS puede entregar al primer intento.
                            [P2-DEGRADED-HEADLINE-TRUTH · 2026-07-31] El titular ya no acusa
                            a la IA cuando el plan SÍ fue aprobado y lo degradó una auditoría
                            posterior — ver resolveQualityDegradedHeadline. */}
                        <span style={{ fontWeight: 700, color: isDark ? '#FDE68A' : '#92400E', fontSize: '0.82rem', display: 'block', marginBottom: '0.1rem' }}>
                            {resolveQualityDegradedHeadline(
                                planData?._quality_degraded_reason,
                                planData?._quality_degraded_attempts,
                            ).title}
                        </span>
                        {/* `span` por trozo, NO `React.Fragment`: este archivo importa sólo
                            los hooks nombrados (`import { useState, … } from 'react'`), así
                            que `React` no existe en scope y el fragmento explícito reventaría
                            el render justo para quien ve este banner. */}
                        <span style={{ color: isDark ? '#FCD34D' : '#B45309', fontSize: '0.76rem', lineHeight: 1.4 }}>
                            {resolveQualityDegradedHeadline(
                                planData?._quality_degraded_reason,
                                planData?._quality_degraded_attempts,
                            ).body.split(t('Cambiar Plato')).map((parte, i, arr) => (
                                <span key={i}>
                                    {parte}
                                    {i < arr.length - 1 && <strong>{t('Cambiar Plato')}</strong>}
                                </span>
                            ))}
                        </span>
                        {/* [G10-QUALITY-DEGRADED-SURFACE · 2026-05-29] Surface de
                            _quality_degraded_reason / _quality_degraded_severity, escritos por
                            _mark_plan_result_quality_degraded en backend pero antes sin lector
                            (dead-write UI). Ahora el usuario ve POR QUÉ se degradó. */}
                        {planData?._quality_degraded_reason && (
                            <span style={{ color: isDark ? '#FCD34D' : '#92400E', fontSize: '0.72rem', display: 'block', marginTop: '0.3rem', opacity: isDark ? 0.85 : 0.85 }}>
                                {(() => {
                                    // [P3-NOTIF-CENTER · 2026-06-16] Mapa elevado a módulo (Q_DEGRADED_REASON_MAP).
                                    // [P3-BANNER-REASON-COPY · 2026-07-10] prefix-match para low_band_macro:<macros>.
                                    const _label = resolveQualityDegradedLabel(planData._quality_degraded_reason);
                                    const _sev = planData?._quality_degraded_severity === 'high' ? t('Importante') : t('Menor');
                                    return <>{t('Motivo ({severidad}): {motivo}', { severidad: _sev, motivo: _label })}</>;
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
                                    {t('Este ajuste quedó limitado por tu')} <strong>{t('Nevera')}</strong>{t(': cocinamos solo con lo que tienes y no alcanzó para clavar los macros.')}
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
                                    {t('Agregar ítems a mi Nevera →')}
                                </button>
                            </span>
                        )}
                        {/* [P1-FIX-SODIUM-DAY · 2026-08-02] Botón "Arreglar este día" — SOLO para la
                            clase de motivo sodio/micro-ceiling (`micro_worst_day_ceiling`). El copy de
                            `micro_worst_day_ceiling` ya le dice al usuario "usa Cambiar Plato en la
                            comida más salada de ese día" — este botón hace exactamente eso por él, sin
                            que tenga que adivinar cuál día ni cuál plato (caso real: adivinó mal y
                            cambió el de otro día). */}
                        {/* [P1-FIX-DAY-ONLY-IF-SODIUM · 2026-08-05] El botón solo aparece si el
                            techo roto ES sodio.

                            `micro_worst_day_ceiling` cubre CUATRO techos (sodio, azúcar añadida,
                            grasa saturada, potasio renal) pero el endpoint detrás solo sabe
                            arreglar sodio: para los otros tres devuelve `ceiling_not_sodium` y el
                            usuario recibe «este arreglo no aplica». Reportado en vivo por el owner
                            el 2026-08-05 con un techo de azúcar añadida: pulsó «Arreglar este día»
                            y lo único que obtuvo fue un mensaje diciéndole que el botón no servía.
                            Es la misma clase que el CTA de reintento retirado en
                            P2-CHUNK-OVERDUE-SIGNAL: un control que solo puede fallar en el estado
                            en que se muestra.

                            El dato para saberlo YA viaja: `_quality_degraded_panel_detail` trae
                            "día N: <nutriente>" (medido en prod: "día 1: free_sugars_g"). No hace
                            falta pulsar para descubrir que no aplica. */}
                        {fixDayCtaApplies(planData) && (
                            <span style={{ display: 'block', marginTop: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={handleFixSodiumDay}
                                    disabled={fixSodiumDayLoading}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        padding: '0.32rem 0.6rem',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        cursor: fixSodiumDayLoading ? 'default' : 'pointer',
                                        opacity: fixSodiumDayLoading ? 0.7 : 1,
                                        background: isDark ? 'rgba(251,191,36,0.18)' : '#FDE68A',
                                        color: isDark ? '#FDE68A' : '#92400E'
                                    }}
                                >
                                    {fixSodiumDayLoading
                                        ? t('El chef está reformulando la comida más salada… ~30 s')
                                        : t('Arreglar este día →')}
                                </button>
                            </span>
                        )}
                    </div>
                    {/* [P3-QDEGRADED-DISMISS · 2026-06-15] Cerrar (recordado por plan). */}
                    <button
                        type="button"
                        onClick={dismissQDegraded}
                        aria-label={t('Ocultar este aviso')}
                        title={t('Ocultar')}
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
                            {t('Revisa tu lista de compras')}
                        </span>
                        <span style={{ color: isDark ? '#FCD34D' : '#B45309', fontSize: '0.85rem', lineHeight: 1.4 }}>
                            {tn(planData._swap_coherence_warnings.critical_count,
                                'Algunas recetas mencionan ingredientes que no quedaron bien reflejados en tu lista ({n} detalle). Usa',
                                'Algunas recetas mencionan ingredientes que no quedaron bien reflejados en tu lista ({n} detalles). Usa',
                                { n: planData._swap_coherence_warnings.critical_count })} <strong>{t('Cambiar Plato')}</strong> {t('en las comidas que te parezcan inconsistentes.')}
                        </span>
                    </div>
                    {/* [P1-COHERENCE-BANNER-NOTIF · 2026-06-16] Cerrar → archiva el
                        aviso en el centro de notificaciones y lo abre. */}
                    <button
                        type="button"
                        onClick={dismissCoherence}
                        aria-label={t('Ocultar y enviar a notificaciones')}
                        title={t('Ocultar (se guarda en notificaciones)')}
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
                                {t('Tu Menú')}
                            </h2>
                        </div>
                        <span className="menu-section-count">
                            {/* Número de comidas oculto según petición */}
                        </span>
                    </div>

                    {/* Indicador de generación → skeleton tab(s) inline en la fila de días (más abajo) */}

                    {/* [P0-DASH-CHIP-HONESTY-V2 · 2026-05-09] Banner contextual
                        cuando la queue tiene chunks pausados (con o sin otros
                        chunks in-flight: la pausa convive con pendientes).
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
                        // [P2-CHUNK-OVERDUE-SIGNAL · ronda extra] El gate exigía
                        // además `_inFlight === 0`, partiendo de que una pausa
                        // deja la cola quieta. Es falso: la forma normal es un
                        // chunk pausado conviviendo con N pendientes (payload
                        // real de producción: `in_flight_count: 8` con
                        // `pending_user_action_count: 1`), así que el banner no
                        // se pintaba casi nunca. Y la pestaña fantasma del día
                        // pausado dice «⏸ pausado · revisa el aviso de arriba»:
                        // sin este arreglo remitiría a un aviso invisible, el
                        // mismo defecto que ya cerramos al quitar el gate V3.
                        // Que haya otros chunks avanzando no cambia el hecho de
                        // que ESTE espera una acción del usuario.
                        if (!(_puac > 0)) return null;
                        const _pc = (_csi && Array.isArray(_csi.paused_chunks) && _csi.paused_chunks.length > 0)
                            ? _csi.paused_chunks[0] : null;
                        if (!_pc) return null;

                        // [P2-CHUNK-OVERDUE-SIGNAL · 2026-08-04] Aquí vivía la
                        // copia del temporal_gate V3 que el slot del día tenía
                        // (`daysSinceCreation < planData.days.length → return
                        // null`): mientras el usuario aún consumiera días del
                        // chunk actual, el banner se ocultaba "para reducir
                        // ansiedad anticipada".
                        //
                        // Queda SUPERSEDED, igual que su gemelo en las
                        // pestañas. La reversión del owner (spec 2026-08-04) es
                        // "los días futuros se ven siempre", y el banner es
                        // parte de esa superficie: la pestaña fantasma de un
                        // día pausado dice «⏸ pausado · revisa el aviso de
                        // arriba», y ese gate garantizaba que durante ~el 90%
                        // del tiempo NO hubiera ningún aviso arriba. Una
                        // instrucción que remite a algo invisible es peor que
                        // no decir nada.
                        //
                        // El resto de la lógica del banner NO cambia: sigue
                        // apareciendo solo con `pending_user_action > 0` y un
                        // `paused_chunks` no vacío (los dos guards de arriba),
                        // con su razón y su CTA derivados del primer chunk
                        // pausado.
                        const _reasonCopy = {
                            empty_pantry: { title: t('Tu próximo bloque está pausado'), body: t('Tu nevera está vacía. Añade ingredientes para que generemos los próximos días.'), cta: t('Actualizar nevera'), url: '/inventory' },
                            empty_pantry_proactive: { title: t('Tu próximo bloque está pausado'), body: t('Tu nevera está vacía. Añade ingredientes para que generemos los próximos días.'), cta: t('Actualizar nevera'), url: '/inventory' },
                            // [P1-FIRST-PURCHASE-PAUSE · 2026-08-16] Pausa una-vez-por-plan: lista
                            // entregada y ninguna compra marcada jamás. El copy pide el paso que
                            // falta (la compra) y promete la reanudación sola (recovery a las 12h).
                            awaiting_first_purchase: { title: t('Tu primera compra está pendiente'), body: t('Te dimos la lista de compras y aún no marcaste nada como comprado. Márcalo en la Nevera — o espera, y seguiremos solos con la mejor información disponible.'), cta: t('Ir a la Nevera'), url: '/inventory' },
                            stale_snapshot: { title: t('Validando tu inventario'), body: t('Estamos refrescando tu nevera. El plan continuará en breve.'), cta: null, url: null },
                            stale_snapshot_live_unreachable: { title: t('Actualiza tu nevera para continuar'), body: t('No pudimos validar tu inventario en vivo. Abre la nevera para refrescar.'), cta: t('Abrir nevera'), url: '/inventory' },
                            learning_zero_logs: { title: t('Registra tus comidas para continuar'), body: t('Necesitamos saber qué comiste para generar el siguiente bloque.'), cta: t('Ir al diario'), url: '/diary' },
                            tz_unresolved: { title: t('Confirmando tu zona horaria'), body: t('Aún no pudimos resolver tu zona horaria para programar el siguiente bloque.'), cta: null, url: null },
                            missing_prior_lessons: { title: t('Reconstruyendo el aprendizaje'), body: t('El sistema intenta recuperar el aprendizaje del bloque previo.'), cta: null, url: null },
                            persistent_drift: { title: t('Validando tu inventario'), body: t('Detectamos diferencias persistentes con tu inventario. Refrescando…'), cta: t('Abrir nevera'), url: '/inventory' },
                        };
                        const _copy = _reasonCopy[_pc.reason_code] || {
                            title: t('Tu próximo bloque está pausado'),
                            body: t('El sistema espera tu acción para continuar.'),
                            cta: null, url: null,
                        };
                        return (
                            /* [P1-WARN-BANNER-TOKENS · 2026-08-11] Hermano exacto del aviso de
                               permisos de Ajustes: mismo ámbar CLARO clavado a mano, misma
                               ceguera al tema, mismo resultado en oscuro — un bloque crema
                               sobre una pantalla casi negra. Medido en el otro: el texto era
                               legible (6,7:1), lo que chirriaba era la SUPERFICIE, despegada
                               ΔL* 92 de la página. Los tokens `--warning-*` ya existían para
                               esto. Se arregla aquí en el mismo paso porque es el mismo defecto
                               y lo encontré barriendo: dejarlo sabiendo que está sería peor que
                               no haber mirado. */
                            <div role="status" style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: '12px', padding: '12px 16px', marginBottom: '16px',
                                background: 'var(--warning-bg)',
                                border: '1px solid var(--warning-border)',
                                borderRadius: '10px',
                                color: 'var(--warning-text)', fontSize: '0.875rem',
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>{_copy.title}</div>
                                    {/* El cuerpo llevaba un segundo ámbar (`#B45309`) para verse más
                                        apagado que el título. Se queda en el mismo token: la
                                        jerarquía ya la dan el peso y el tamaño, y un segundo tono
                                        obligaría a inventar un token que el sistema no tiene. */}
                                    <div style={{ fontSize: '0.8rem' }}>{_copy.body}</div>
                                </div>
                                {_copy.cta && _copy.url && (
                                    <button
                                        onClick={() => navigate(_copy.url)}
                                        style={{
                                            // El relleno sólido usa el ámbar del tema; el texto se
                                            // queda oscuro y FIJO porque va sobre ese relleno, no
                                            // sobre la página. Medido: sobre #F59E0B (claro) el
                                            // texto oscuro da 8,49:1 y el blanco 2,15:1; sobre
                                            // #FBBF24 (oscuro), 10,93:1 contra 1,67:1.
                                            //
                                            // O sea que el `color: white` de antes no era solo un
                                            // problema de tema: 2,15:1 está por debajo del mínimo
                                            // legible, así que el botón se leía mal también en
                                            // claro. Sobre un relleno amarillo el texto va oscuro.
                                            padding: '8px 14px', background: 'var(--warning)', color: '#1F1300',
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
                        && !isPlanPaused
                        && daysSinceCreation >= 5
                        && planData?.generation_status !== 'partial'
                        && planData?.generation_status !== 'generating_next'
                        && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 14px', background: '#F0FDF4', borderRadius: '10px', marginBottom: '16px', color: '#15803D', fontSize: '0.85rem', border: '1px solid #BBF7D0' }}>
                            <span>{t('¿Quieres adelantar la próxima actualización?')}</span>
                            <button
                                onClick={async () => {
                                    if (!userProfile?.id) return;
                                    const tId = toast.loading(t('Refrescando próximos días…'), { position: 'top-center' });
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
                                            toast.success(t('Plan actualizado'), { id: tId });
                                        } else {
                                            toast.error(t('No se pudo refrescar'), { id: tId });
                                        }
                                    } catch (e) {
                                        console.error('[P2-δ] shift-plan manual:', e);
                                        toast.error(t('Error al refrescar'), { id: tId });
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
                                {t('Refrescar')}
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
                                {t('Algunos días de tu plan fueron regenerados en modo simplificado por tu solicitud. Las recetas son más sencillas y flexibles con los ingredientes disponibles.')}
                            </span>
                        </div>
                    )}

                    {isPlanPaused && (
                        /* [P1-PLAN-MODE · 2026-08-11] La nota de pausa. NO se cambia de
                           pantalla: el usuario conserva su menú, sus recetas y su lista —
                           solo se detiene la generación de los días que faltan. Reanudar
                           vive aquí y en Configuración → Capacidades.

                           [P1-PAUSE-NOTE-NOTEBOOK · 2026-08-12] De caja a ANOTACIÓN del
                           cuaderno (owner: «choca con el diseño de las rayas rojas» — el
                           MISMO reporte que mató al info-alert de P1-EATEN-SLOT-POLISH).
                           Mismo tratamiento que .today-remaining-note: sin fill/borde/
                           radius/ícono, alineada a la columna de texto de las comidas
                           (la clase comparte el pin responsive), énfasis solo
                           tipográfico. «Reanudar planes» es un enlace escrito en la
                           página, no un botón sólido flotando sobre el margen rojo. */
                        <div className="today-remaining-note" style={{ color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--text-main)' }}>{t('Planes en pausa.')}</strong>{' '}
                            {t('Tu plan sigue aquí; no se están generando los días que faltan ({listos} de {total} listos).', {
                                listos: generated_days,
                                total: planData?.total_days_requested || generated_days,
                            })}{' '}
                            <button
                                type="button"
                                onClick={reanudarPlanes}
                                style={{
                                    border: 0, background: 'transparent', padding: 0,
                                    color: 'var(--primary, #818CF8)', fontWeight: 700,
                                    fontSize: 'inherit', fontFamily: 'inherit', cursor: 'pointer',
                                    textDecoration: 'underline', textUnderlineOffset: '3px',
                                }}
                            >
                                {t('Reanudar planes')}
                            </button>
                        </div>
                    )}

                    {/* BOTONES NAVEGACIÓN DÍAS (AGRUPADOS POR SEMANA) — Rolling Window */}
                    {weekNavReady ? (
                        <PlanWeekNav
                            planData={planData}
                            chunkStatusInfo={chunkStatusInfo}
                            today={todayDate}
                            selected={selectedDay}
                            onSelect={(entry) => setSelectedDay({ origen: entry.origen, idx: entry.idx })}
                        />
                    ) : visiblePlanDays.length >= 1 && (
                        <div className="days-navigation-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            {Array.from({ length: Math.ceil(visiblePlanDays.length / 7) }).map((_, weekIdx) => {
                                const weekDays = visiblePlanDays.slice(weekIdx * 7, (weekIdx + 1) * 7);
                                return (
                                    <div key={`week-${weekIdx}`} className="week-group">
                                        {visiblePlanDays.length > 7 && (
                                            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {t('Semana {n}', { n: weekIdx + 1 })}
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
                                                // [P2-DAYREGEN-TAB-SPINNER \u00b7 2026-07-12] El tab del d\u00eda en regen
                                                // muestra spinner junto al nombre (feedback owner: "Domingo" se
                                                // ve\u00eda est\u00e1tico mientras sus platos cargaban). Mismo gate scoped
                                                // que el overlay (P2-DAYREGEN-OVERLAY-SCOPE): solo SU tab.
                                                const isTabRegenerating = isDayUpdating
                                                    && ((dayRegenIndex ?? activeDayIndex) === globalIdx);
                                                return (
                                                    <motion.button
                                                        key={globalIdx}
                                                        layout={tabsSettled ? 'position' : false}
                                                        initial={{ opacity: 0, scale: 0.85 }}
                                                        animate={{ opacity: (isPastDay && !isActive) ? 0.55 : 1, scale: 1, y: isActive ? -2 : 0 }}
                                                        exit={{ opacity: 0, scale: 0.8 }}
                                                        transition={{ duration: tabsSettled ? 0.2 : 0, ease: 'easeOut' }}
                                                        onClick={() => setSelectedDay({ origen: 'vivo', idx: globalIdx })}
                                                        className="option-btn"
                                                        title={
                                                            isPastDay ? t('Este día ya pasó')
                                                            : isEmergencyRepeat ? t('Día de respaldo (repetido porque no hubo variedad disponible)')
                                                            : isDegraded ? t('Día de respaldo generado desde tu perfil favorito')
                                                            : isToday ? t('Hoy')
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
                                                        {isTabRegenerating && (
                                                            <Loader2
                                                                size={13}
                                                                strokeWidth={2.75}
                                                                style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
                                                                aria-hidden="true"
                                                            />
                                                        )}
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
                                                            const diasSemana = [t('Domingo'), t('Lunes'), t('Martes'), t('Miércoles'), t('Jueves'), t('Viernes'), t('Sábado')];
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
                                                                {isEmergencyRepeat ? t('REPETIDO') : t('RESPALDO')}
                                                            </span>
                                                        )}
                                                    </motion.button>
                                                );
                                            })}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* [P1-TODAY-REMAINING · 2026-07-28, copy reescrita P1-REMAINING-LINE-HONEST
                        · 2026-07-28] "Te quedan ~X kcal de presupuesto para N comidas del plan
                        (~Y kcal)" — solo en el tab de HOY y solo si ya hay algo registrado en
                        el diario (paridad con el gate del coach,
                        agent.py::_build_today_remaining_context). Derivado del diario en cada
                        render — nunca escrito a plan_data. Texto armado por
                        `todayRemainingLine` (utils/todayRemaining.js) — ver ese docstring para
                        los 3 estados (cabe / excede / ya se superó).
                        [P1-EATEN-SLOT-POLISH · 2026-07-28] Pre-fix esto era un info-alert
                        genérico (fondo degradado, borde 1px, radius 12px, ícono Utensils) que
                        chocaba con el cuaderno de "Tu Menú" (owner: "choca con el diseño").
                        Ahora es una ANOTACIÓN escrita en la página, no una caja flotando
                        encima: sin fill/borde/radius, alineada a la MISMA columna de texto que
                        cada `.meal-card` (`padding-left: 4.5rem`), separada del primer plato
                        con la línea rayada del cuaderno (`2px rgba(147, 197, 253, 0.3)`, la
                        misma que usa `.meal-card:not(:last-of-type)::after` entre comidas) en
                        vez de whitespace de margen. Sin ícono — la frase ya lo dice sola.
                        [P1-EATEN-SLOT-POLISH-ALIGN-FIX · 2026-07-28] El indent vive en la
                        clase `.today-remaining-note` (no inline style) para que el mismo
                        pin responsive de `.meal-card` a `padding-left: 1.25rem` en
                        <=768px (bloque DASH-MOBILE-CLEAN-CARD) también alcance a esta
                        anotación — pre-fix el inline style no tenía media query y se
                        quedaba en 4.5rem en móvil mientras las cards caían a 1.25rem.
                        Color = `var(--text-muted)` (token, no hex fijo) por default para que
                        funcione en ambos temas sin rama `isDark` — sigue siendo una anotación,
                        no una alerta. [P1-REMAINING-LINE-HONEST] Cuando lo planificado choca
                        con el presupuesto (excedido o ya superado) el color pasa a
                        `var(--warning-text)` + `font-weight` más alto — SIGUE sin fill/borde/
                        radius/ícono/caja flotante, solo un énfasis tipográfico dentro de la
                        misma anotación (el owner pidió explícitamente NO reintroducir la caja).
                        DOM: hermano del wrapper de comidas (el <div flexDirection:'column'>
                        de abajo), NUNCA dentro — así queda estructuralmente inmune al trap
                        P3-DASH-LAST-SEPARATOR-FIX (`.meal-card:not(:last-of-type)`, que solo
                        cuenta DIVs hermanos DENTRO de ese wrapper): esta línea no participa en
                        ese conteo sin importar cómo cambie el map. */}
                    {todaysRemainingSummary && (
                        <div
                            className="today-remaining-note"
                            style={{
                                // [P1-EATEN-SLOT-POLISH-ALIGN-FIX · 2026-07-28] borderBottom
                                // se queda INLINE (no en la clase CSS): la separación "línea
                                // rayada del cuaderno" (P1-EATEN-SLOT-POLISH) es la única
                                // señal de caja/borde que existe en esta anotación y un test
                                // de regresión la lee via `line.style.borderBottom` — moverla
                                // a la clase la haría invisible a ese test sin razón real
                                // (el indent responsive, que SÍ necesita ser clase para tener
                                // media query, vive aparte en `.today-remaining-note`).
                                borderBottom: '2px solid rgba(147, 197, 253, 0.3)',
                                fontWeight: (todaysRemainingSummary.isOverBudget || todaysRemainingSummary.exceedsBudget) ? 700 : 500,
                                color: (todaysRemainingSummary.isOverBudget || todaysRemainingSummary.exceedsBudget)
                                    ? 'var(--warning-text)'
                                    : 'var(--text-muted)',
                            }}
                        >
                            {todaysRemainingSummary.message}
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
                                // [P1-DASH-CORRUPTED-VS-PAUSED · 2026-08-08] Día vacío ≠ plan
                                // muerto. Si la cola server-side tiene chunks pausados o en
                                // vuelo, el CTA "Generar nuevo plan" es una trampa: cancela la
                                // cola entera y quema un crédito por días que YA vienen en
                                // camino. Copy honesto por estado de la cola; el fallback
                                // original queda solo para cola confirmada muerta / sin poll.
                                const _emptyDayPaused = Number(chunkStatusInfo?.pending_user_action_count || 0) > 0;
                                const _emptyDayInFlight = Number(chunkStatusInfo?.in_flight_count || 0) > 0;
                                if (_emptyDayPaused) {
                                    return (
                                        <EmptyState
                                            icon={Utensils}
                                            title={t('Tus próximos días están en pausa')}
                                            description={t('No pudimos cuadrar los próximos días con los ingredientes de tu nevera. Actualízala para continuar ahora — o espera, y los generaremos con la mejor información disponible.')}
                                            cta={{
                                                label: t('Revisar mi nevera'),
                                                onClick: () => navigate('/dashboard/pantry'),
                                            }}
                                        />
                                    );
                                }
                                // [P1-DASH-GENERATING-HONESTY · 2026-08-16] «Se llenará
                                // en unos minutos» se mostraba con `in_flight_count > 0`,
                                // que INCLUYE los chunks dormidos con `execute_after` a
                                // días vista. La pantalla prometía minutos para algo
                                // programado para el martes, y por eso el usuario lo leía
                                // como congelado (reportado 2026-08-16). Es la misma
                                // mentira que el Historial cerró en mayo (P3-HIST-CHUNK-
                                // SCHEDULED) y que este Dashboard nunca heredó.
                                //
                                // `in_flight_count` se conserva como respaldo y NO se
                                // sustituye por la suma de los dos: un chunk `processing`
                                // con `execute_after` futuro cae fuera de AMBOS contadores
                                // y el día desaparecería de la pantalla.
                                const _corriendoAhora = Number(chunkStatusInfo?.running_now_count || 0) > 0;
                                const _programados = Number(chunkStatusInfo?.scheduled_count || 0) > 0;
                                if (_corriendoAhora) {
                                    return (
                                        <EmptyState
                                            live
                                            icon={ChefHat}
                                            title={t('Estamos cocinando estos días')}
                                            description={_programados
                                                ? t('Este bloque se está generando ahora mismo. Los siguientes llegarán solos cuando toque — no hace falta hacer nada.')
                                                : t('Este bloque se está generando ahora mismo. Se llenará solo en unos minutos — no hace falta hacer nada.')}
                                        />
                                    );
                                }
                                if (_programados) {
                                    const _cuando = _formatoDiaCorto(chunkStatusInfo?.next_chunk_eta);
                                    return (
                                        <EmptyState
                                            icon={CalendarClock}
                                            title={t('Estos días aún no toca prepararlos')}
                                            description={_cuando
                                                ? `${t('Tu plan se genera por bloques, poco antes de que los necesites. El próximo llega el')} ${_cuando}.`
                                                : t('Tu plan se genera por bloques, poco antes de que los necesites. El próximo llegará automáticamente cuando toque.')}
                                        />
                                    );
                                }
                                if (_emptyDayInFlight) {
                                    // Respaldo para un backend anterior al desglose: hay
                                    // cola viva pero no se sabe si corre o duerme. El copy
                                    // no promete minutos — no mentir es más importante que
                                    // ser específico.
                                    return (
                                        <EmptyState
                                            icon={Utensils}
                                            title={t('Tus próximos días vienen en camino')}
                                            description={t('Este bloque del plan está en la cola. Se llenará solo — no hace falta hacer nada.')}
                                        />
                                    );
                                }
                                return (
                                    <EmptyState
                                        icon={Utensils}
                                        title={t('No hay comidas para este día')}
                                        description={t('Cuando tu plan esté listo, verás aquí el menú del día seleccionado.')}
                                        cta={{
                                            label: t('Generar nuevo plan'),
                                            onClick: () => navigate('/assessment'),
                                        }}
                                    />
                                );
                            }

                            return currentDayMeals.map((meal, index) => {
                                if (_isSupplementEntry(meal)) return null;
                                const isLiked = meal.name ? !!likedMeals[meal.name] : false;
                                // [P1-TODAY-REMAINING · 2026-07-28] `index` aquí es el
                                // MISMO índice real que P2-SWAP-INDEX-COUPLING protege
                                // arriba — comparamos directo contra `todaysEatenIndices`
                                // (calculado sobre `currentDayMeals` sin filtrar) sin
                                // introducir un segundo esquema de indexación.
                                const isEatenToday = todaysEatenIndices.has(index);
                                // [P1-EATEN-SLOT-COPY · 2026-07-28] Computado UNA vez por
                                // comida y reutilizado en la card + el chip + los 2 botones
                                // bloqueados de abajo — SSOT real (antes 4 apariciones
                                // independientes del mismo string estático mal-atribuido).
                                // `null` cuando no está comido: cada callsite decide su
                                // propio fallback (texto del control activo).
                                const eatenClaim = isEatenToday
                                    ? eatenClaimForSlot(todaysConsumedMeals, meal.meal, 'unlock')
                                    : null;

                                // [P1-SWAP-LOCK-EXPLAINS · 2026-08-11] El motivo del bloqueo de
                                // "Cambiar Plato", en UNA expresión. Antes cada consumidor
                                // (`disabled`, `title`, `aria-label`, los early-return del
                                // onClick) volvía a preguntar por su cuenta qué condiciones
                                // bloqueaban, y ya se habían desincronizado: `isReadOnlyDay`
                                // estaba en el early-return pero no en el `disabled`, así que un
                                // día archivado mostraba un botón vivo que no hacía nada.
                                //
                                // `null` = se puede cambiar. Cualquier otra cosa es la frase que
                                // se le enseña al usuario cuando toca el candado, así que el
                                // orden importa: primero el motivo más específico.
                                //
                                // El OCUPADO no vive aquí a propósito: "estamos cambiándolo" no
                                // es un bloqueo con motivo, es una operación en vuelo.
                                const swapLockReason = isEatenToday
                                    ? eatenClaim
                                    : isPantryTooEmptyForSwap
                                        ? swapPantryClaim
                                        : isReadOnlyDay
                                            ? t('Este día ya pasó y quedó archivado. Su menú se conserva como registro de lo que tocaba, por eso no se puede cambiar.')
                                            : null;

                                // [P1-MEAL-CARD-KEY · 2026-05-31] key por identidad
                                // natural (meal.name) en vez de index: evita que React
                                // reutilice nodos DOM con datos de otra comida si el orden
                                // cambia (swap/regeneración), preservando estado de
                                // like/foco/receta. Fallback a index si falta name.
                                return (
                                    <div
                                        key={meal.name || `meal-${index}`}
                                        className="meal-card"
                                        // [P1-TODAY-REMAINING · 2026-07-28] DIM, nunca hide —
                                        // ocultar la card le quita al usuario la única forma
                                        // de notar que el sistema adivinó mal (ver runbook del
                                        // lifecycle de plan_id, invariante "derivar, nunca
                                        // persistir"). Mismo opacity 0.55 que los tabs de días
                                        // pasados (línea ~6753) — mismo lenguaje visual.
                                        style={isEatenToday ? { opacity: 0.55 } : undefined}
                                        title={eatenClaim || undefined}
                                    >

                                        {/* [P1-SWAP-LOADING-UX · 2026-07-10] Overlay "cocinando": cubre ESTA
                                            card durante su swap individual, o TODAS durante el update del día
                                            (seed=index desfasa las etapas para que no se vean clonadas). */}
                                        {/* [P2-DAYREGEN-OVERLAY-SCOPE] el overlay del día solo en SU tab —
                                            se veía también en lunes/martes durante el regen del domingo. */}
                                        {(regeneratingId === index || (isDayUpdating
                                            && (dayRegenIndex == null || dayRegenIndex === activeDayIndex))) && (
                                            <MealCookingOverlay mode={isDayUpdating ? 'day' : 'single'} seed={index} />
                                        )}

                                        {/* Meal Info */}
                                        <div className="meal-main">
                                            {/* [P1-MEAL-CARD-ROWS · 2026-08-09] CABECERA: rótulo + título a la
                                                izquierda, kcal a la derecha.

                                                Las kcal vivían dentro de la columna de acciones, y ese era el
                                                problema de fondo: obligaban a que esa columna existiera al lado
                                                del texto. MEDIDO, el cluster de botones ocupa 310 px y el coste
                                                fijo de la fila (cluster + padding + gap) 446 px — con la columna
                                                de texto en `1fr` contra una de botones en `auto`, TODO el recorte
                                                lo absorbía el párrafo: hacían falta 746 px de tarjeta para que la
                                                descripción tuviera 40 caracteres por línea, y casi nunca los hay.
                                                El owner lo reportó como «los botones ocupan mucho espacio y por
                                                eso el texto se ve encogido», que es exactamente la causa.

                                                Las kcal son metadato del plato, no una acción: su sitio es junto
                                                al título. */}
                                            <div className="meal-head">
                                                <div className="meal-head-text">
                                                    <div style={{
                                                        textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 800,
                                                        color: 'var(--primary)', letterSpacing: '0.05em', marginBottom: '0.25rem'
                                                    }}>
                                                        {meal.meal}
                                                    </div>

                                                    {/* [DASH-MEAL-TITLE-GAP · 2026-06-01] marginBottom
                                                        0.25rem → 0.5rem: el chip de tiempo ("10 min")
                                                        quedaba pegado al título. */}
                                                    <h3 style={{
                                                        fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem',
                                                        // [P1-TODAY-REMAINING · 2026-07-28] line-through, mismo
                                                        // lenguaje visual que el tab de un día pasado (~línea 6789).
                                                        textDecoration: isEatenToday ? 'line-through' : 'none',
                                                    }}>
                                                        {meal.name}
                                                    </h3>
                                                </div>

                                                {/* Calories Badge — subió aquí desde la columna de acciones. */}
                                                <div className="meal-kcal">
                                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                        {meal.cals}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{t('kcal')}</div>
                                                </div>
                                            </div>

                                            {/* PANTRY UNSAFE BADGE
                                                [P1-URGENT-LIST-CANONICAL · 2026-08-09] La caja era una FOTO del
                                                momento de generación: el owner compró la lista entera y el aviso
                                                seguía acusando. Ahora se evalúa EN VIVO contra la Nevera
                                                (filterStillMissing): compras → desaparece; se agota → vuelve. */}
                                            {meal._pantry_unsafe_after_flexible && (() => {
                                                // [P1-URGENT-FLASH-UNKNOWN · 2026-08-13] Tres estados, no dos:
                                                //   · null + fetch en vuelo → CARGANDO: callar y esperar
                                                //     (filterStillMissing devuelve [] y no se pinta nada).
                                                //   · null + inventoryStale → el fetch FALLÓ y no va a llegar:
                                                //     aquí sí acusamos con la lista cruda, que es el fail-safe
                                                //     original — esconder una compra necesaria PARA SIEMPRE
                                                //     sería peor que el parpadeo que este fix quita.
                                                //   · array → filtrar contra la Nevera, como siempre.
                                                const _cargando = liveInventory == null && !inventoryStale;
                                                if (_cargando) return null;
                                                const _still = (liveInventory == null && inventoryStale)
                                                    ? (meal._missing_ingredients || [])
                                                    : filterStillMissing(meal._missing_ingredients, liveInventory);
                                                if (_still.length === 0) return null;
                                                return (
                                                <div style={{
                                                    display: 'flex', flexDirection: 'column', gap: '0.25rem',
                                                    fontSize: '0.75rem', color: 'var(--danger-text)', background: 'rgba(239, 68, 68, 0.1)',
                                                    padding: '0.4rem 0.6rem', borderRadius: '0.5rem', marginBottom: '0.5rem',
                                                    fontWeight: 600, border: '1px solid rgba(239, 68, 68, 0.2)'
                                                }}>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                        <AlertCircle size={14} />
                                                        <span>{t('⚠ Compra Urgente Requerida')}</span>
                                                    </div>
                                                    {/* [P1-URGENT-FLASH-UNKNOWN · 2026-08-13] Era #B91C1C fijo:
                                                        2,52:1 sobre el fondo del aviso en tema oscuro (bajo AA,
                                                        se leía apagado). El token sube a 8,61:1 y deja el claro
                                                        igual. */}
                                                    <div style={{ paddingLeft: '1.2rem', color: 'var(--danger-text)', fontSize: '0.7rem' }}>
                                                        {t('Faltan: {ingredientes}', { ingredientes: _still.join(', ') })}
                                                    </div>
                                                </div>
                                                );
                                            })()}

                                            {/* [P3-MEAL-ADVISORY-INLINE · 2026-07-04] Fila ÚNICA de metadatos:
                                                tiempo + advisories como pills compactos en la MISMA línea. El
                                                bloque-caja anterior (P2-DISHQUAL-SURFACE-UPDATES) quedaba suelto
                                                entre el título y el chip de tiempo y deformaba la tarjeta
                                                (feedback directo del owner). Amber (≠ rojo del pantry-urgent);
                                                sigue informando sin bloquear. */}
                                            {(() => {
                                                // [P1-MACRO-BADGE-DIA-EN-BANDA · 2026-08-05] El chip de
                                                // «se desvia de tus macros» se calla si el DIA cierra en
                                                // banda: las comidas se compensan y la unidad que cuenta
                                                // es el dia (caso real: band_score=1.0 con el chip puesto).
                                                const _advisories = getMealAdvisories(meal, {
                                                    diaEnBanda: diaEnBandaObjetivo(
                                                        currentDayMeals, planData?.macros, planData?.calories),
                                                });
                                                // [P1-TODAY-REMAINING · 2026-07-28] Chip "ya registraste tu
                                                // <slot>" — reusa la MISMA fila de chips que las advisories
                                                // (mecanismo existente) en vez de inventar un bloque nuevo.
                                                // Verde (≠ ámbar de las advisories, ≠ rojo del pantry-urgent):
                                                // no es una advertencia, es un estado informativo positivo.
                                                // [P1-EATEN-SLOT-COPY · 2026-07-28] El chip SOLO nombra el
                                                // SLOT (nunca un plato — el match es por `meal_type`, no por
                                                // nombre); el detalle (qué se registró + kcal estimada) vive
                                                // en `eatenClaim` (calculado arriba, mismo string que la card
                                                // y los 2 botones bloqueados) usado como `title` aquí abajo.
                                                if (!meal.prep_time && !_advisories.length && !isEatenToday) return null;
                                                return (
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                                                        gap: '0.4rem', marginBottom: '0.75rem',
                                                    }}>
                                                        {isEatenToday && (
                                                            <div
                                                                title={eatenClaim}
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                                    fontSize: '0.7rem', fontWeight: 700,
                                                                    color: isDark ? '#6EE7B7' : '#047857',
                                                                    background: isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.1)',
                                                                    padding: '4px 10px', borderRadius: '6px',
                                                                    border: isDark ? '1px solid rgba(110, 231, 183, 0.35)' : '1px solid rgba(16, 185, 129, 0.25)',
                                                                }}
                                                            >
                                                                <CheckCircle size={12} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                                                                <span>{eatenChipLabel(meal.meal)}</span>
                                                            </div>
                                                        )}
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

                                            {/* [P1-MEAL-CARD-ROWS · 2026-08-09] `meal-desc` trae el TOPE DE
                                                MEDIDA. Al soltar el párrafo a todo el ancho aparece el
                                                problema contrario al que este P-fix arregla: MEDIDO, en una
                                                tarjeta de 1000 px la línea llegaba a ~123 caracteres, muy por
                                                encima del rango legible (45-75). Un renglón demasiado largo
                                                cansa igual que uno demasiado corto — el ojo pierde el salto
                                                de línea. El tope lo acota sin volver a estrecharlo. */}
                                            <p className="meal-desc" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                                                {meal.desc}
                                            </p>
                                        </div>

                                        {/* [P1-MEAL-CARD-ROWS · 2026-08-09] FILA DE ACCIONES, a lo ancho.
                                            Era una columna lateral con las kcal arriba y los
                                            botones abajo, pegada al costado del texto. Las kcal subieron a
                                            la cabecera y aquí queda solo lo que es una acción.

                                            El orden de los 4 botones NO cambia — sigue siendo
                                            [Ver Receta, Cambiar Plato, Me gusta, Me lo comí] y sigue
                                            estando DESPUÉS del texto en el DOM, así que el contrato
                                            posicional que destructuran `Dashboard.today_remaining` y
                                            `Dashboard.eaten_slot_unlock` (ver la nota del botón «Me lo
                                            comí» abajo) se mantiene intacto. Mover la fila no es
                                            reordenarla. */}
                                        <div className="meal-actions">
                                            <div className="meal-actions-row">

                                                {/* VER RECETA */}
                                                <button
                                                    className="meal-act-btn"
                                                    onClick={() => {
                                                        // [P3-GUEST-GATE-MEAL-ACTIONS · 2026-06-21] Invitado: ver recetas requiere cuenta.
                                                        if (isGuest) { toast(t('Crea tu cuenta para ver las recetas paso a paso')); return; }
                                                        navigate('/dashboard/recipes');
                                                    }}
                                                    style={{
                                                        background: isDark ? 'rgba(59, 130, 246, 0.22)' : '#EFF6FF',
                                                        border: isDark ? '1px solid rgba(96, 165, 250, 0.6)' : '1px solid #BFDBFE',
                                                        borderRadius: '50%',
                                                        width: 38, height: 38,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    title={t('Ver paso a paso')}
                                                >
                                                    <BookOpen size={18} color={isDark ? '#93C5FD' : '#3B82F6'} />
                                                </button>

                                                {/* REGENERATE BUTTON (AI SWAP) — Abre modal de razón */}
                                                {/* [P1-EATEN-SLOT-POLISH · 2026-07-28] `isEatenToday` entra al MISMO
                                                    `disabled` real que ya protegía créditos durante regen/day-update
                                                    (arriba) — cambiar un plato ya comido gastaría un crédito real por
                                                    nada. Guard interno duplicado por defensa-en-profundidad (mismo
                                                    patrón que el resto de este botón: el `disabled` nativo ya bloquea
                                                    click+teclado, el early-return cubre cualquier dispatch sintético). */}
                                                {/* [P1-SWAP-LOCK-EXPLAINS · 2026-08-11] Bloqueado = CANDADO que explica.
                                                    Pedido del dueño: «cuando esté bloqueado quiero que aparezca un
                                                    candado nada más, y cuando lo presionen que le indique al usuario el
                                                    porqué».

                                                    Y hacía falta por un motivo que va más allá del aspecto: un botón
                                                    `disabled` NO EMITE CLICK. El motivo del bloqueo vivía en el `title`
                                                    —que en un teléfono no existe, porque no hay puntero que se pose— y
                                                    en el `aria-label`, que solo oye quien usa lector de pantalla. Para
                                                    todos los demás, tocar el botón no hacía absolutamente nada: el
                                                    bloqueo era indistinguible de una app colgada.

                                                    Por eso el bloqueado deja de usar `disabled` y pasa a
                                                    `aria-disabled` + `onClick` que explica. No es un rodeo: es la
                                                    diferencia entre «no se puede interactuar» y «se anuncia como no
                                                    disponible, pero se puede preguntar por qué». Los early-return de
                                                    dentro siguen ahí, así que la acción real sigue sin poder ocurrir —
                                                    lo único que se gana es la respuesta.

                                                    El OCUPADO (regenerando / día actualizándose) NO entra aquí: eso no
                                                    es un bloqueo con motivo, es una operación en vuelo, y sigue con
                                                    `disabled` de verdad para proteger los créditos.

                                                    De paso cierra un agujero real: `isReadOnlyDay` (día archivado)
                                                    estaba en el early-return pero NO en el `disabled`, así que el botón
                                                    se veía vivo y al tocarlo no pasaba nada, sin decir por qué. */}
                                                <button
                                                    className="meal-act-btn"
                                                    onClick={() => {
                                                        if (swapLockReason) { toast(swapLockReason); return; }
                                                        if (isEatenToday) return;
                                                        // [P1-SWAP-PANTRY-GATE · 2026-07-30] Nevera bajo el mínimo → ni
                                                        // se abre el modal. Guard interno duplicado igual que el de
                                                        // `isEatenToday`: el `disabled` nativo ya bloquea click+teclado,
                                                        // el early-return cubre cualquier dispatch sintético.
                                                        if (isPantryTooEmptyForSwap) return;
                                                        // [P3-GUEST-GATE-MEAL-ACTIONS · 2026-06-21] Invitado: cambiar plato (IA) requiere cuenta.
                                                        if (isGuest) { toast(t('Crea tu cuenta para cambiar platos con IA')); return; }
                                                        if (regeneratingId === index || isDayUpdating) return;
                                                        // [P1-DASH-WEEK-NAV] Un dia archivado no se edita.
                                                        if (isReadOnlyDay) return;
                                                        // [2026-05-29] Abrir el modal al instante; validar cuota
                                                        // en paralelo y cerrar solo si no hay créditos (evita el
                                                        // delay del fetch en cache-miss).
                                                        const _swap = { dayIndex: activeDayIndex, mealIndex: index, mealType: meal.meal, mealName: meal.name };
                                                        setSwapModal(_swap);
                                                        validateCreditsAsync().then((hasCredits) => {
                                                            if (!hasCredits) setSwapModal(null);
                                                        });
                                                    }}
                                                    // Solo el OCUPADO usa `disabled` de verdad. El bloqueado
                                                    // se marca con `aria-disabled`, que lo anuncia igual como
                                                    // no disponible pero deja que el toque llegue y pueda
                                                    // responder con el motivo.
                                                    disabled={!swapLockReason && (regeneratingId === index || isDayUpdating)}
                                                    aria-disabled={swapLockReason ? true : undefined}
                                                    // Bloqueado el rótulo visible desaparece (queda el candado), así
                                                    // que el nombre accesible tiene que decir QUÉ control es además
                                                    // del motivo. El estado no se escribe aquí: lo anuncia solo
                                                    // `aria-disabled`, y repetirlo lo haría sonar dos veces.
                                                    aria-label={swapLockReason ? t('Cambiar plato. {motivo}', { motivo: swapLockReason }) : undefined}
                                                    style={{
                                                        // Bloqueado: pierde el relleno naranja. Un candado sobre el
                                                        // color de la acción principal seguiría pareciendo el botón
                                                        // que grita; en gris neutro se lee como lo que es.
                                                        background: swapLockReason
                                                            ? (isDark ? 'rgba(148, 163, 184, 0.12)' : '#F1F5F9')
                                                            : (isDark ? 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)' : '#FFF7ED'),
                                                        border: swapLockReason
                                                            ? `1px solid ${isDark ? 'rgba(148, 163, 184, 0.22)' : '#E2E8F0'}`
                                                            : (isDark ? '1px solid transparent' : '1px solid #FED7AA'),
                                                        borderRadius: '1rem',
                                                        // Sin rótulo el ancho lo marca el icono: cuadrado de 38,
                                                        // el mismo alto que ya tenía, para que la fila no se mueva.
                                                        padding: swapLockReason ? 0 : '0 0.8rem',
                                                        width: swapLockReason ? 38 : undefined,
                                                        height: 38,
                                                        flex: 'none',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                                        // `pointer`, no `not-allowed`: ahora tocarlo SÍ hace algo
                                                        // (contesta). `not-allowed` prometería que no responde.
                                                        cursor: swapLockReason ? 'pointer' : ((regeneratingId === index || isDayUpdating) ? 'wait' : 'pointer'),
                                                        transition: 'all 0.2s',
                                                        // [P1-SWAP-PANTRY-GATE] El atenuado servía para que un botón
                                                        // bloqueado no se leyera como uno vivo que no responde. Con el
                                                        // candado eso ya lo dice la FORMA, y bajar la opacidad solo
                                                        // restaría contraste al único elemento que queda.
                                                        opacity: 1,
                                                        fontWeight: isDark ? 750 : 650,
                                                        fontSize: '0.8rem',
                                                        color: swapLockReason
                                                            ? (isDark ? '#94A3B8' : '#64748B')
                                                            : (isDark ? '#FFFFFF' : '#EA580C'),
                                                        boxShadow: (!swapLockReason && isDark) ? '0 2px 8px -3px rgba(234, 88, 12, 0.3)' : 'none'
                                                    }}
                                                    title={swapLockReason || t('Cambiar con IA')}
                                                >
                                                    {swapLockReason ? (
                                                        <Lock size={17} strokeWidth={2.5} aria-hidden="true" />
                                                    ) : (
                                                        <>
                                                            <RefreshCw
                                                                size={18}
                                                                color={isDark ? '#FFFFFF' : '#EA580C'}
                                                                // [P2-DAYREGEN-OVERLAY-SCOPE v2] el giro del ícono también se escopa
                                                                // al tab del día en regen (quedaba girando en los otros tabs como
                                                                // residual visual); el disabled sí queda global (protege créditos).
                                                                className={(regeneratingId === index || (isDayUpdating
                                                                    && (dayRegenIndex == null || dayRegenIndex === activeDayIndex))) ? "spin-fast" : ""}
                                                            />
                                                            {/* [P1-I18N-DASHBOARD · 2026-08-15] SIN `t()`: `P1_weeknav_mobile_size.
                                                                test.js` exige la cadena literal `Cambiar Plato</span>` (texto
                                                                pegado al cierre) para comprobar que el rótulo vive en la rama
                                                                DISPONIBLE y no en la del candado. Envolverlo la rompe desde otro
                                                                fichero. */}
                                                            <span style={{ whiteSpace: 'nowrap' }}>Cambiar Plato</span>
                                                        </>
                                                    )}
                                                </button>

                                                {/* LIKE BUTTON */}
                                                {/* [P1-EATEN-SLOT-POLISH · 2026-07-28] "Me gusta" en un plato ya
                                                    comido grabaría una preferencia sobre algo que el usuario NO
                                                    comió realmente (registró otra cosa en su diario) — bloqueado de
                                                    verdad, mismo patrón que Cambiar Plato arriba. */}
                                                <button
                                                    className="meal-act-btn"
                                                    onClick={() => {
                                                        if (isEatenToday) return;
                                                        // [P3-GUEST-GATE-MEAL-ACTIONS · 2026-06-21] Invitado: guardar favoritos requiere cuenta.
                                                        if (isGuest) { toast(t('Crea tu cuenta para guardar tus favoritos')); return; }
                                                        const currentlyLiked = !!likedMeals[meal.name];
                                                        toggleMealLike(meal.name, meal.meal);
                                                        if (!currentlyLiked) {
                                                            toast.success(t('¡Anotado!'), { description: t('Aprenderemos que te gusta: {plato}', { plato: meal.name }), icon: '❤️' });
                                                        } else {
                                                            toast(t('Like removido'));
                                                        }
                                                    }}
                                                    disabled={isEatenToday}
                                                    aria-label={isEatenToday ? eatenClaim : undefined}
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
                                                            ? '1px solid transparent'
                                                            : (isDark ? '1px solid rgba(244, 114, 182, 0.6)' : '1px solid #FBCFE8'),
                                                        borderRadius: '50%',
                                                        width: 38, height: 38,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: isEatenToday ? 'not-allowed' : 'pointer',
                                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        boxShadow: isLiked ? '0 4px 12px -2px rgba(244, 63, 94, 0.5)' : 'none',
                                                        transform: isLiked ? 'scale(1.06)' : 'scale(1)'
                                                    }}
                                                    title={isEatenToday ? eatenClaim : (isLiked ? t('Te gusta — toca para quitar') : t('Me gusta'))}
                                                >
                                                    <Heart size={18} color={isLiked ? '#FFFFFF' : (isDark ? '#F472B6' : '#EC4899')} fill={isLiked ? '#FFFFFF' : 'none'} strokeWidth={2.25} />
                                                </button>

                                                {/* [P1-EAT-PLAN-MEAL · 2026-08-07] ME LO COMÍ.

                                                    ⚠ ORDEN: va AL FINAL del row a propósito. Seis
                                                    aserciones de `Dashboard.today_remaining` y
                                                    `Dashboard.eaten_slot_unlock` destructuran
                                                    `getAllByRole('button')` POSICIONALMENTE asumiendo
                                                    `[Ver Receta, Cambiar Plato, Me gusta]`; ponerlo antes
                                                    corre esos índices y hace que un test de swap acabe
                                                    clickeando "Ver Receta". Si reordenas el row, migra
                                                    primero esas aserciones a `getByLabelText`.

                                                    Sólo en la pestaña de HOY y sólo si el slot no está
                                                    ya registrado: `activeDayIndex` + `index` son
                                                    coordenadas dentro de `plan_data.days`, y en un día
                                                    archivado no apuntan a nada.

                                                    Por qué esto no compite con el chip verde de
                                                    `isEatenToday`: ese chip DERIVA el estado comparando
                                                    `meal_type` del diario contra el slot del plan
                                                    (P1-TODAY-REMAINING), y se declara ambiguo cuando hay
                                                    ≥2 slots iguales. Este botón es lo contrario: una
                                                    DECLARACIÓN del usuario sobre un plato concreto, que
                                                    es justo el dato que al heurístico le falta. */}
                                                {isTodayTabActive && !isEatenToday && (
                                                    <button
                                                        className="meal-act-btn"
                                                        onClick={() => handleEatPlanMeal(meal, index)}
                                                        disabled={eatMealInFlight !== null}
                                                        style={{
                                                            background: isDark ? 'rgba(16, 185, 129, 0.22)' : '#ECFDF5',
                                                            border: isDark ? '1px solid rgba(110, 231, 183, 0.6)' : '1px solid #A7F3D0',
                                                            borderRadius: '50%',
                                                            width: 38, height: 38,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            cursor: eatMealInFlight !== null ? 'not-allowed' : 'pointer',
                                                            opacity: eatMealInFlight !== null && eatMealInFlight !== index ? 0.5 : 1,
                                                            transition: 'all 0.2s'
                                                        }}
                                                        title={t('Me lo comí — lo registra en tu diario y lo descuenta de tu Nevera')}
                                                        aria-label={t('Registrar que te comiste {plato}', { plato: meal.name })}
                                                    >
                                                        {eatMealInFlight === index
                                                            ? <Loader2 size={18} className="animate-spin" color={isDark ? '#6EE7B7' : '#047857'} />
                                                            : <CheckCircle size={18} color={isDark ? '#6EE7B7' : '#047857'} />}
                                                    </button>
                                                )}
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
                                {t('Suplementos del Día')}
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
                                            {t('Dosis: {dosis}', { dosis: supp.dose })}
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
                            {t('Razonamiento')}
                            {planData?.insights?.length > 0 && (
                                <button
                                    type="button"
                                    onClick={dismissReasoning}
                                    aria-label={t('Ocultar el razonamiento (se guarda en Notificaciones)')}
                                    title={t('Ocultar — se guarda en Notificaciones')}
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
                                    title={t('Aún no hay razonamiento')}
                                    description={t('Cuando tu plan esté listo, encontrarás aquí el diagnóstico, el plan de acción y los tips del chef.')}
                                    compact
                                />
                            ) : planData.insights.map((insight, i) => {
                                let icon = <CheckCircle size={20} />;
                                let title = t('Nota:');
                                let color = "var(--text-main)";
                                let bgColor = "var(--bg-muted)";

                                if (insight.toLowerCase().includes('diagnóstico') || i === 0) {
                                    icon = <Lightbulb size={20} />;
                                    // El `includes('diagnóstico')` de arriba mira el texto del BACKEND
                                    // (siempre es-DO): no se traduce, sería comparar contra otra cosa.
                                    title = t('Diagnóstico');
                                    // [APPEARANCE-THEME · 2026-05-29] En oscuro: icono violeta
                                    // más claro + chip tinte translúcido (en claro el pastel
                                    // #F5F3FF se veía brilloso).
                                    color = isDark ? "#A78BFA" : "#7C3AED"; // Violet
                                    bgColor = isDark ? "rgba(124, 58, 237, 0.18)" : "#F5F3FF";
                                }
                                if (insight.toLowerCase().includes('estrategia') || i === 1) {
                                    icon = <Wallet size={20} />;
                                    title = t('Plan de Acción');
                                    color = isDark ? "#34D399" : "#059669"; // Emerald
                                    bgColor = isDark ? "rgba(5, 150, 105, 0.18)" : "#ECFDF5";
                                }
                                if (insight.toLowerCase().includes('chef') || i === 2) {
                                    icon = <Flame size={20} />;
                                    title = t('Tip del Chef');
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
                                {t('Activa tu Coach nutricional IA')}
                            </h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
                                {t('Déjame mandarte un aviso a tu celular a la hora de comer para que nunca olvides tu rutina y alcances tus metas más rápido.')}
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
                                        <><Loader2 size={20} className="spin-animation" /> {t('Activando...')}</>
                                    ) : (
                                        <>{t('¡Sí, encender alertas!')}</>
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
                                    {t('Quizá más tarde')}
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
                                /* [P3-RESTOCK-MODAL-POLISH · 2026-07-12] Tinte radial emerald
                                   arriba + sombra en capas + highlight interior (familia de
                                   diálogos pulidos, clave positiva). */
                                background: 'radial-gradient(130% 75% at 50% 0%, color-mix(in srgb, var(--success) 8%, transparent), transparent 55%), var(--bg-card)',
                                border: '1px solid var(--border)',
                                borderRadius: '24px', padding: '2rem',
                                width: '100%', maxWidth: '400px', textAlign: 'center',
                                boxShadow: '0 32px 80px -16px rgba(0, 0, 0, 0.5), inset 0 1px 0 color-mix(in srgb, #ffffff 7%, transparent)',
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
                                        {/* [P3-RESTOCK-MODAL-POLISH · 2026-07-12] Icono con
                                            gradiente emerald + halo concéntrico + glow (clase
                                            .restock-modal-icon — el ::after del halo requiere
                                            CSS, no inline). El dot de status quedó redundante:
                                            el contenedor ya carga la semántica emerald. */}
                                        <div className="restock-modal-icon">
                                            <ShoppingCart size={26} strokeWidth={1.9} />
                                        </div>

                                        <h2
                                            id="restock-modal-title"
                                            style={{
                                                fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)',
                                                marginBottom: '0.5rem', letterSpacing: '-0.02em', textWrap: 'balance'
                                            }}
                                        >
                                            {t('Confirmar compra')}
                                        </h2>
                                        <p style={{
                                            color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: '1.55',
                                            maxWidth: '320px', textWrap: 'balance',
                                            margin: restockPreview.sample.length > 0
                                                ? '0 auto 1rem'
                                                : (isShoppingListStale ? '0 auto 1.25rem' : '0 auto 1.75rem'),
                                        }}>
                                            {restockPreview.count > 0
                                                ? <>{t('Agregaremos')} <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>{tn(restockPreview.count, '{n} ingrediente', '{n} ingredientes', { n: restockPreview.count })}</strong> {t('de tu lista {ciclo} a la Nevera Virtual.', { ciclo: restockPreview.durationLabel })}</>
                                                : t('Agregaremos todos los ingredientes de tu lista a la Nevera Virtual.')}
                                        </p>

                                        {/* [P2-RESTOCK-MODAL-PREVIEW · 2026-07-12] Chips line-art con los primeros
                                            ítems del delta real — el modal deja de ser abstracto sin saturar. */}
                                        {restockPreview.sample.length > 0 && (
                                            <div style={{
                                                display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                                                gap: '0.35rem', maxWidth: '340px',
                                                margin: isShoppingListStale ? '0 auto 1.25rem' : '0 auto 1.6rem',
                                            }} aria-hidden="true">
                                                {restockPreview.sample.map((nm, i) => (
                                                    <span key={i} className="restock-modal-chip">{nm}</span>
                                                ))}
                                                {restockPreview.count > restockPreview.sample.length && (
                                                    <span style={{
                                                        fontSize: '0.72rem', color: 'var(--text-muted)',
                                                        padding: '0.2rem 0.4rem', fontWeight: 600,
                                                    }}>{t('+{n} más', { n: restockPreview.count - restockPreview.sample.length })}</span>
                                                )}
                                            </div>
                                        )}

                                        {isShoppingListStale && (
                                            <div style={{
                                                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                                                padding: '0.6rem 0.8rem', marginBottom: '1.25rem',
                                                background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                                                borderRadius: '0.75rem', textAlign: 'left'
                                            }}>
                                                <AlertCircle size={14} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                                <span style={{ fontSize: '0.78rem', color: 'var(--warning-text)', lineHeight: 1.45 }}>
                                                    {t('La lista puede estar desactualizada. Si cambiaste el ciclo, recalcula antes de comprar.')}
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
                                                <span>{t('Añadir a mi Nevera')}</span>
                                                <ArrowRight size={17} strokeWidth={2.25} className="restock-modal-arrow" />
                                            </button>

                                            {/* Cancelar como link text — no compite visualmente
                                                con el CTA principal. */}
                                            <button
                                                onClick={() => setShowRestockModal(false)}
                                                className="restock-modal-cancel"
                                            >
                                                {t('Cancelar')}
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
                                            {t('Registrando compras')}
                                        </h2>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: '1.45', marginBottom: '0' }}>
                                            {t('Estamos organizando tus ingredientes en la Nevera')}
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
                title={t('¿Por qué quieres cambiar?')}
                subtitle={t('Tu respuesta nos ayuda a mejorar tus futuros planes.')}
                contextLabel={swapModal?.mealName}
                unlimited={isPremium || typeof userPlanLimit !== 'number'}
                quota={{
                    left: typeof userPlanLimit === 'number' ? Math.max(0, userPlanLimit - planCount) : 0,
                    total: typeof userPlanLimit === 'number' ? userPlanLimit : 0,
                }}
                // [P1-SWAP-PANTRY-GATE · 2026-07-30] `decorateSwapOption` marca
                // disabled SOLO los motivos que consumen la Nevera. 'cravings'
                // pasa intacto por diseño (exento, P3-SWAP-PANTRY-DEFAULT).
                options={[
                    { id: 'variety',  label: t('Quiero variedad'),     desc: t('Me gusta, pero quiero algo diferente'), color: '#818CF8', icon: 'shuffle' },
                    { id: 'time',     label: t('No tengo tiempo hoy'),  desc: t('Busco algo más rápido de preparar'),    color: '#A78BFA', icon: 'clock' },
                    { id: 'cravings', label: t('Tengo un antojo'),      desc: t('Un capricho que encaja en tu plan'),    color: '#FB7185', icon: 'heart' },
                ].map(decorateSwapOption)}
                coming={(() => {
                    const todayDow = new Date().getDay(); // 0=Dom … 6=Sáb
                    const isWeekend = todayDow === 0 || todayDow === 6;
                    const d = 6 - todayDow;
                    return {
                        id: 'weekend',
                        label: t('Fin de semana especial'),
                        desc: isWeekend
                            ? t('Platos más elaborados y premium · disponible hoy')
                            : t('Platos más elaborados y premium · se desbloquea el sábado'),
                        color: '#FBBF24',
                        icon: 'bolt',
                        unlockLabel: tn(d, 'En {n} día', 'En {n} días', { n: d }),
                        unlocked: isWeekend,
                    };
                })()}
                extraRows={[
                    { id: 'similar', label: t('Ya comí algo similar'), desc: t('Hoy ya tuve un plato parecido'), color: '#FB923C', icon: 'copy' },
                ].map(decorateSwapOption)}
                dislike={{ label: t('No me gusta este plato'), desc: t('La IA evitará sugerirlo en el futuro') }}
                onPick={async (optionId) => {
                    if (!swapModal) return;
                    // [P1-SWAP-PANTRY-GATE · 2026-07-30] Segunda barrera: el
                    // modal ya no deja pulsar un motivo bloqueado, pero el gate
                    // se re-evalúa aquí porque la Nevera puede vaciarse (otra
                    // pestaña, un consume) entre que el modal se abre y el
                    // usuario elige. Sin esto, el candado es solo visual.
                    if (isSwapReasonPantryLocked(optionId)) return;
                    const { dayIndex, mealIndex, mealType, mealName } = swapModal;
                    setSwapModal(null);
                    if (optionId === 'dislike') {
                        setSwapDislikeConfirm({ dayIndex, mealIndex, mealType, mealName });
                        return;
                    }
                    // [P5-LOADING-DISABLE] Candado síncrono contra doble-tap — vive DENTRO de
                    // runSwapWithConsentFlow (early-return silencioso antes del toast.loading).
                    await runSwapWithConsentFlow({ dayIndex, mealIndex, mealType, mealName, swapReason: optionId });
                }}
            />

            {/* ═══════════ MODAL: Nuevo Ciclo de Compras (plan VENCIDO) ═══════════ */}
            {/* [P3-MOTIVO-MODAL-REDESIGN · 2026-06-24] Solo el caso VENCIDO usa este
                picker (tiene la opción extra "similar"); el día-completo vigente usa
                MotivoActualizarModal (más abajo). */}
            <OptionPickerModal
                isOpen={showUpdatePlanModal && isPlanExpired}
                onClose={() => setShowUpdatePlanModal(false)}
                title={isPlanExpired ? t('Nuevo Ciclo de Compras') : t('¿Por qué quieres actualizar?')}
                subtitle={isPlanExpired
                    ? t('Ciclo de compras cerrado. ¿Qué priorizamos esta semana?')
                    : t('Ayuda al sistema a entender qué platos prefieres.')
                }
                options={(() => {
                    const todayDow = new Date().getDay(); // 0=Dom, 6=Sáb
                    const isWeekend = todayDow === 0 || todayDow === 6;
                    const weekendOption = isWeekend
                        ? { id: 'weekend', icon: Zap, label: t('Fin de semana especial'), color: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE', desc: t('Platos más elaborados y premium (Sáb-Dom)') }
                        : { id: 'weekend', icon: Zap, label: t('Fin de semana especial'), color: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE', desc: t('Platos más elaborados y premium (Sáb-Dom)'), disabled: true, disabledDesc: (() => { const d = 6 - todayDow; return tn(d, 'Disponible en {n} día (sábado)', 'Disponible en {n} días (sábado)', { n: d }); })() };
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
                        { id: 'variety',  icon: Shuffle,    label: t('Quiero variedad'),       color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', desc: t('Me apetecen platos distintos esta semana') },
                        { id: 'time',     icon: Clock,      label: t('Semana ocupada'),       color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', desc: t('Busco preparaciones más rápidas') },
                        { id: 'cravings', icon: Heart,      label: t('Tengo un antojo'),       color: '#EC4899', bg: '#FDF2F8', border: '#FBCFE8', desc: t('Un capricho que encaja en tu plan semanal') },
                        weekendOption,
                        { id: 'similar',  icon: Copy,       label: t('Se parece al ciclo anterior'), color: '#F97316', bg: '#FFF7ED', border: '#FED7AA', desc: t('Evitar sugerencias muy parecidas a la semana pasada') },
                        { id: 'dislike',  icon: ThumbsDown, label: t('No me gustó el ciclo anterior'), color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', desc: t('Evitar ingredientes y estilos similares en el futuro') }
                    ] : [
                        { id: 'variety',  icon: Shuffle,    label: t('Quiero más variedad'),       color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', desc: t('Me apetecen platos distintos hoy') },
                        { id: 'time',     icon: Clock,      label: t('No tengo tiempo hoy'),       color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', desc: t('Busco algo más rápido de preparar') },
                        { id: 'cravings', icon: Heart,      label: t('Tengo un antojo distinto'),  color: '#EC4899', bg: '#FDF2F8', border: '#FBCFE8', desc: t('Un capricho que encaja en tu plan') },
                        weekendOption,
                        { id: 'dislike',  icon: ThumbsDown, label: t('No me gustan estos platos'), color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', desc: t('Evitar sugerencias similares en el futuro') }
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
                            // [P1-DASH-WEEK-NAV] `writableIdx`, no `activeDayIndex`: el derivado
                            // cae a 0 y regeneraria el dia equivocado.
                            if (writableIdx === null) return;
                            await regenerateDay(writableIdx, optionId);
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
                                <><strong>{t('Se evitarán:')}</strong> {currentDayMeals.length > 0 ? currentDayMeals.map(m => m.name).join(', ') : t('los platos actuales')}.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t('Tiempo est.: ~12s.')} {isPremium ? t('Sin costo (Premium)') : t('Consumirá 1 regeneración')}.</span></>
                            ) : hoveredOption === 'variety' ? (
                                <><strong>{t('Variedad:')}</strong> {t('platos de diferentes cocinas y perfiles de sabor.')}<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t('Tiempo est.: ~12s.')} {isPremium ? t('Sin costo (Premium)') : t('Consumirá 1 regeneración')}.</span></>
                            ) : hoveredOption === 'time' ? (
                                <><strong>{t('Rapidez:')}</strong> {t('platos con ≤20 min de preparación aproximada.')}<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t('Tiempo est.: ~12s.')} {isPremium ? t('Sin costo (Premium)') : t('Consumirá 1 regeneración')}.</span></>
                            ) : hoveredOption === 'cravings' ? (
                                <><strong>{t('Antojo:')}</strong> {t('opciones más indulgentes dentro de tus objetivos.')}<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t('Tiempo est.: ~12s.')} {isPremium ? t('Sin costo (Premium)') : t('Consumirá 1 regeneración')}.</span></>
                            ) : hoveredOption === 'weekend' ? (
                                <><strong>{t('Fin de semana:')}</strong> {t('platos más elaborados y experiencias premium.')}<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t('Tiempo est.: ~12s.')} {isPremium ? t('Sin costo (Premium)') : t('Consumirá 1 regeneración')}.</span></>
                            ) : hoveredOption ? (
                                <><strong>{isPlanExpired ? t('Regenerando:') : t('Actualizando:')}</strong> {isPlanExpired ? t('el menú completo del ciclo actual') : t('los platos de este día, cocinando con lo que tienes en tu Nevera')}.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t('Tiempo est.: ~12s.')} {isPremium ? t('Sin costo (Premium)') : t('Consumirá 1 regeneración')}.</span></>
                            ) : (
                                isPremium ? (
                                    <>{t('Plan')} <strong>{t('Premium')}</strong>{t(': Regeneraciones ilimitadas activas.')}</>
                                ) : (
                                    <>{t('Te quedan')} <strong>{typeof userPlanLimit === 'number' ? Math.max(0, userPlanLimit - planCount) : t('ilimitadas')}</strong> {t('regeneraciones este mes.')}</>
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
                    { id: 'variety',  label: t('Quiero más variedad'),      desc: t('Me apetecen platos distintos hoy'),   color: '#818CF8', icon: 'shuffle', recommended: true },
                    { id: 'time',     label: t('No tengo tiempo hoy'),       desc: t('Busco algo más rápido de preparar'),  color: '#A78BFA', icon: 'clock' },
                    { id: 'cravings', label: t('Tengo un antojo distinto'),  desc: t('Un capricho que encaja en tu plan'),  color: '#FB7185', icon: 'heart' },
                ]}
                coming={(() => {
                    const todayDow = new Date().getDay(); // 0=Dom … 6=Sáb
                    const isWeekend = todayDow === 0 || todayDow === 6;
                    const d = 6 - todayDow; // días hasta el sábado
                    return {
                        id: 'weekend',
                        label: t('Fin de semana especial'),
                        desc: isWeekend
                            ? t('Platos más elaborados y premium · disponible hoy')
                            : t('Recetas para darte un gusto el finde · se desbloquea el sábado'),
                        color: '#FBBF24',
                        icon: 'bolt',
                        unlockLabel: tn(d, 'En {n} día', 'En {n} días', { n: d }),
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
                            // [P1-DASH-WEEK-NAV] `writableIdx`, no `activeDayIndex`: el derivado
                            // cae a 0 y regeneraria el dia equivocado.
                            if (writableIdx === null) return;
                            await regenerateDay(writableIdx, optionId);
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
                // [P1-I18N-DASHBOARD · 2026-08-15] SIN `t()`: `Dashboard.p1_pantry_strict_consent.
                // test.js` usa `title="¿Bloquear este plato?"` como MARCADOR para localizar este
                // bloque, y envolverlo lo haría desaparecer del fichero.
                title="¿Bloquear este plato?"
                subtitle={
                    swapDislikeConfirm && (
                        <div style={{ margin: '0 0 1.15rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            <p style={{ margin: '0 0 0.75rem 0' }}>
                                {t('Este plato quedará')} <strong style={{ color: '#EF4444' }}>{t('bloqueado permanentemente')}</strong> {t('y la IA no volverá a sugerirlo en futuros planes:')}
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
                    { id: 'confirm', icon: ThumbsDown, label: t('Sí, bloquear y cambiar'), color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', desc: t('La IA no volverá a sugerir este plato') },
                    { id: 'cancel',  icon: Shuffle,    label: t('Cancelar'),               color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', desc: t('Volver sin hacer cambios') }
                ]}
                onOptionClick={async (optionId) => {
                    if (optionId === 'cancel') {
                        setSwapDislikeConfirm(null);
                        return;
                    }
                    const { dayIndex, mealIndex, mealType, mealName } = swapDislikeConfirm;
                    setSwapDislikeConfirm(null);
                    // [P5-LOADING-DISABLE] Candado síncrono contra doble-tap — vive DENTRO de
                    // runSwapWithConsentFlow (early-return silencioso antes del toast.loading).
                    await runSwapWithConsentFlow({
                        dayIndex, mealIndex, mealType, mealName, swapReason: 'dislike',
                        loadingTitle: '👎 Registrando preferencia...',
                    });
                }}
            />

            {/* ═══════════ MODAL: "Tu Nevera no alcanza" (Nevera estricta + consentimiento) ═══════════ */}
            {/* [P1-PANTRY-STRICT-CONSENT · 2026-08-02] Se abre cuando el backend responde
                needs_new_ingredients — Cambiar Plato (ambos pickers arriba) o "Arreglar este día"
                (handleFixSodiumDay). Nada entra a la lista de compras sin que el usuario elija
                "Añadir a la lista y continuar" aquí. */}
            <PantryConsentModal
                open={!!pantryConsent}
                missing={pantryConsent?.missing || []}
                message={pantryConsent?.message}
                busy={!!pantryConsent?.busy}
                onConfirm={handlePantryConsentConfirm}
                onRetry={handlePantryConsentRetry}
                onClose={handlePantryConsentClose}
            />

            {/* ═══════════ MODAL: Confirmación permanente de "No me gustan estos platos" ═══════════ */}
            <OptionPickerModal
                isOpen={showDislikeConfirmModal}
                onClose={() => { setShowDislikeConfirmModal(false); setShowUpdatePlanModal(true); }}
                title={t('¿Bloquear estos platos?')}
                subtitle={
                    <div style={{ margin: '0 0 1.15rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <p style={{ margin: '0 0 0.5rem 0' }}>
                            {t('Los siguientes platos quedarán')} <strong style={{ color: '#EF4444' }}>{t('bloqueados permanentemente')}</strong> {t('y no volverán a aparecer en futuros planes:')}
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
                    { id: 'confirm_dislike', icon: ThumbsDown, label: t('Sí, bloquear y actualizar'), color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', desc: t('Se evitarán estos platos en todos los ciclos futuros') },
                    { id: 'cancel_dislike',  icon: Shuffle,    label: t('Cancelar'),                  color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', desc: t('Volver al menú de opciones sin cambios') }
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
                            // [P1-DASH-WEEK-NAV] `writableIdx`, no `activeDayIndex`: el derivado
                            // cae a 0 y regeneraria el dia equivocado.
                            if (writableIdx === null) return;
                            await regenerateDay(writableIdx, 'dislike');
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
    const t = useT();
    const { loadingData, planData, planSyncFailed, retryPlanSync, userProfile } = useAssessment();

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
                <p style={{ fontWeight: 600 }}>{t('Sincronizando tu plan...')}</p>
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
                    {t('No pudimos sincronizar tu plan')}
                </p>
                <p style={{ fontSize: '0.85rem', maxWidth: 340, margin: 0, lineHeight: 1.45 }}>
                    {t('Puede ser una conexión inestable o que la sesión aún se esté activando. Tu plan sigue guardado — vuelve a intentarlo.')}
                </p>
                <button
                    onClick={() => retryPlanSync?.()}
                    style={{
                        marginTop: '0.25rem', padding: '0.6rem 1.4rem', borderRadius: '10px',
                        border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
                        background: 'var(--primary)', color: '#fff'
                    }}
                >
                    {t('Reintentar')}
                </button>
            </div>
        );
    }

    // [P1-PLAN-MODE · 2026-08-11] `!planData` dejó de significar «este usuario no se
    // ha configurado». Hay TRES casos y solo uno es el formulario:
    //   1. modo seguimiento → su dashboard es el contador (DashboardTracking).
    //   2. perfil completo sin plan ni modo legible → dos puertas, no 21 preguntas.
    //   3. usuario nuevo de verdad → el formulario.
    // Si `plan_mode` no llegó (perfil lento, red mala) NO puede leerse como 'plan':
    // el desenlace de esa lectura es echar al formulario a quien acaba de decir que
    // no lo quiere — la forma de P1-LOGIN-PLAN-SYNC-RETRY (tratar «no lo sé» como
    // «no lo tiene»). De ahí el espejo en localStorage, que escriben el cierre del
    // wizard y el interruptor de Configuración.
    //
    // [P1-TRACKING-WINS · 2026-08-14] El modo se evalúa ANTES de planData. Con el
    // orden viejo, un plan pausado en memoria clavaba DashboardInner aunque el
    // usuario acabara de elegir «solo contador»: el contador manda cuando es
    // elección explícita; el plan queda en Historial con «Reanudar».
    let _localMode = null;
    try { _localMode = localStorage.getItem('mealfit_plan_mode'); } catch { /* noop */ }
    const _planMode = userProfile?.plan_mode || _localMode || null;

    if (_planMode === 'tracking') {
        return <DashboardTracking />;
    }
    if (!planData) {
        return <Navigate to="/assessment" replace />;
    }

    return <DashboardInner />;
};

export default Dashboard;
