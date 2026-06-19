import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { authClient } from '../authClient';
// [P2-AUDIT-3 · 2026-05-15] Helper SSOT para `localStorage.setItem` defensivo.
// [P2-LOCALSTORAGE-REMOVEITEM · 2026-05-15] + `safeLocalStorageRemove` para
// los flujos de logout/reset (iOS Private Mode lanza SecurityError en
// removeItem y rompe la cadena).
// [P2-LOCALSTORAGE-GETITEM-DEFENSIVE · 2026-05-15] + `safeLocalStorageGet`
// para los reads en el initializer del provider (líneas 88+) donde un
// throw de localStorage congela el provider entero.
import { safeLocalStorageSet, safeLocalStorageGet, safeLocalStorageRemove } from '../utils/safeLocalStorage';
// [P1-GUEST-MODE · 2026-06-15] Helpers del modo invitado (funnel del plan
// gratuito sin cuenta). Ver utils/guestMode.js.
import {
    GUEST_PLAN_CREDITS,
    isGuestModeActive,
    activateGuestMode as activateGuestModeStorage,
    getGuestCreditsUsed,
    incrementGuestCreditsUsed,
    exitGuestMode,
    clearGuestModeStorage,
} from '../utils/guestMode';
// [P2-CHAT-CACHE-XUSER · 2026-05-31] Keys del chat del Agente para limpiar en
// logout/user-switch (SSOT en módulo liviano — no arrastra AgentPage al bundle).
import { CHAT_MESSAGES_CACHE_KEY, CHAT_SESSIONS_CACHE_KEY, CHAT_CURRENT_SESSION_KEY } from '../utils/chatCacheKeys';
// --- BASE DE DATOS LOCAL DE RECETAS (FALLBACK) ---
const DOMINICAN_MEALS = {
    breakfast: [
        { name: "Mangú con Huevo", tags: ['balanced', 'vegetarian'], desc: "Puré de plátano verde con huevo hervido.", recipe: ["Hervir plátanos verdes.", "Majar con agua de cocción.", "Hervir 2 huevos.", "Saltear cebolla roja en vinagre."], cals: 450 },
        { name: "Avena Integral con Canela", tags: ['balanced', 'vegetarian'], desc: "Avena cocida con canela y vainilla.", recipe: ["Hervir avena con canela.", "Agregar leche descremada.", "Endulzar con stevia."], cals: 350 },
        { name: "Revuelto de Huevos y Vegetales", tags: ['balanced', 'low_carb', 'keto', 'vegetarian'], desc: "Huevos revueltos con ajíes y espinaca.", recipe: ["Picar vegetales.", "Sofreír en sartén.", "Batir 2 huevos y revolver."], cals: 300 },
        { name: "Batida Proteica de Guineo", tags: ['balanced', 'vegetarian'], desc: "Batido de proteína con guineo.", recipe: ["Licuar proteína, guineo, hielo y agua."], cals: 350 }
    ],
    lunch: [
        { name: "La Bandera (Versión Fit)", tags: ['balanced'], desc: "Arroz, habichuelas y pollo guisado.", recipe: ["1 taza de arroz.", "1/2 taza de habichuelas.", "Pollo guisado sin piel.", "Ensalada verde."], cals: 600 },
        { name: "Pechuga a la Plancha + Vegetales", tags: ['low_carb', 'keto'], desc: "Pechuga al orégano con brócoli.", recipe: ["Adobar pechuga.", "Cocinar en plancha.", "Hervir brócoli y zanahoria."], cals: 450 },
        { name: "Moro de Guandules con Pescado", tags: ['balanced'], desc: "Moro con filete de pescado.", recipe: ["Preparar moro.", "Cocinar filete con pimientos."], cals: 550 },
        { name: "Sancocho Light", tags: ['balanced'], desc: "Sancocho con carnes magras y más auyama.", recipe: ["Usar pechuga y carne magra.", "Mucha auyama.", "Reducir víveres pesados."], cals: 500 }
    ],
    dinner: [
        { name: "Pescado al Papillote", tags: ['low_carb', 'keto', 'balanced'], desc: "Filete de pescado cocido con vegetales.", recipe: ["Colocar filete en aluminio.", "Cubrir con vegetales.", "Cocinar 12-15 min."], cals: 400 },
        { name: "Tortilla de Espinacas", tags: ['low_carb', 'keto', 'vegetarian'], desc: "Cena ligera de huevo y espinacas.", recipe: ["Saltear espinacas.", "Batir 2 huevos y verter.", "Cocinar a fuego lento."], cals: 300 },
        { name: "Crema de Auyama", tags: ['balanced', 'vegan', 'vegetarian'], desc: "Crema espesa de auyama.", recipe: ["Hervir auyama con ajo.", "Licuar con agua de cocción."], cals: 350 },
        { name: "Ensalada de Atún", tags: ['low_carb', 'keto'], desc: "Atún en agua con vegetales y limón.", recipe: ["Escurrir atún.", "Mezclar con vegetales.", "Aderezar con limón."], cals: 300 }
    ],
    merienda: [
        { name: "Guineo Maduro", tags: ['balanced', 'vegan', 'vegetarian'], desc: "Una unidad mediana.", recipe: ["Pelar y comer."], cals: 120 },
        { name: "Yogur Griego con Chinola", tags: ['low_carb', 'vegetarian'], desc: "Alto en proteína.", recipe: ["1 taza yogur griego.", "Pulpa de chinola."], cals: 180 },
        { name: "Puñado de Nueces Mixtas", tags: ['low_carb', 'keto', 'vegan'], desc: "Grasas saludables.", recipe: ["Un puñado de almendras o nueces."], cals: 200 },
        { name: "Huevo Hervido", tags: ['low_carb', 'keto', 'vegetarian'], desc: "Protein snack.", recipe: ["Hervir 10 min. Pelar y agregar sal."], cals: 80 }
    ]
};

const getAlternativeMeal = (mealType, currentMealName, targetCalories, userDietType) => {
    let category = 'merienda';
    const lowerType = mealType.toLowerCase();
    if (lowerType.includes('desayuno')) category = 'breakfast';
    else if (lowerType.includes('almuerzo')) category = 'lunch';
    else if (lowerType.includes('cena')) category = 'dinner';
    else if (lowerType.includes('merienda')) category = 'merienda';

    let dietFilter = 'balanced';
    if (userDietType) {
        const type = userDietType.toLowerCase();
        if (type.includes('keto')) dietFilter = 'keto';
        else if (type.includes('low')) dietFilter = 'low_carb';
        else if (type.includes('veg') && !type.includes('vegetariana')) dietFilter = 'vegan';
        else if (type.includes('vegetariana')) dietFilter = 'vegetarian';
    }

    const options = DOMINICAN_MEALS[category] || DOMINICAN_MEALS.breakfast;
    let compatibleOptions = options.filter(meal => dietFilter === 'balanced' ? true : meal.tags.includes(dietFilter));
    if (compatibleOptions.length === 0) {
        compatibleOptions = options.filter(m => m.tags.includes('balanced') || m.tags.includes('vegetarian'));
        if (compatibleOptions.length === 0) compatibleOptions = options;
    }
    const availableOptions = compatibleOptions.filter(m => m.name !== currentMealName);
    const selectedTemplate = availableOptions.length > 0
        ? availableOptions[Math.floor(Math.random() * availableOptions.length)]
        : options[0];
    return {
        name: selectedTemplate.name,
        desc: selectedTemplate.desc,
        cals: targetCalories || selectedTemplate.cals || 400,
        recipe: selectedTemplate.recipe,
        isSwapped: true
    };
};
import { toast } from 'sonner';
import { emitCoherenceToast } from '../utils/renderCoherenceWarnings';
import { fetchWithAuth, restorePlanFromHistory as restorePlanFromHistoryApi } from '../config/api';
// [P1-XTAB-CACHE-LEAK · 2026-05-30] Invalidadores de caches con KEY GLOBAL
// (sin user_id) — se limpian en logout / user-switch para evitar leak
// cross-user en dispositivo compartido (ver _clearUserScopedCaches).
import { invalidateInventoryCache } from '../utils/pantryCache';
import { invalidateHistoryListCache, clearAllModalCaches } from '../utils/historyCaches';
// [P1-B7] Storage seguro para datos sensibles del formulario.
import {
    saveFormData as secureSaveFormData,
    loadFormData as secureLoadFormData,
    migrateLegacyFormStorage,
    clearFormStorage,
} from '../config/secureFormStorage';

const AssessmentContext = createContext();

// [P1-XTAB-CACHE-LEAK · 2026-05-30] Limpia las caches con KEY GLOBAL (sin
// user_id) que sobreviven a un cambio de usuario en el MISMO dispositivo.
// El logout es navigate SPA (sin reload), así que los singletons in-memory de
// pantryCache/historyCaches persisten en memoria; y sus espejos en localStorage
// (`mealfit_pantry_inventory_cache_v1`, `mealfit_history_list_cache_v1`)
// tampoco se borraban. Sin esta limpieza, el usuario B veía el inventario de la
// Nevera y el listado de Historial (nombres/calorías/macros — PII nutricional)
// del usuario A hasta que el fetch backend-autenticado los pisaba (~300-800ms,
// o indefinido si ese fetch hacía timeout). Invocada desde resetApp (logout) y
// desde la rama user-switch de handleAuthChange (cubre re-login sin logout
// previo limpio: cierre de tab / magic link / token switch).
const _clearUserScopedCaches = () => {
    try { invalidateInventoryCache(); } catch { /* noop */ }
    try { invalidateHistoryListCache(); } catch { /* noop */ }
    // [P3-HIST-MODAL-CACHE-XUSER · 2026-05-30] Además del cache del LISTADO,
    // limpiar los 5 caches singleton per-plan del modal del Historial
    // (lessons/coherence/blocked/metrics/lifetime). Son `Map` global-keyed
    // por plan_id que sobreviven al logout SPA con la PII nutricional del
    // usuario anterior — la otra mitad global-keyed de la clase
    // P1-XTAB-CACHE-LEAK.
    try { clearAllModalCaches(); } catch { /* noop */ }
    safeLocalStorageRemove('mealfit_disabled_ingredients');
    // [P2-DEPLETED-XUSER · 2026-05-30] `mealfit_depleted_items` (key global,
    // NO user-scoped) cachea los ítems agotados de la despensa del usuario.
    // Su SSOT cross-device es la tabla `user_depleted_items`; el localStorage
    // es solo cache. En dispositivo compartido, sin este remove el usuario B
    // veía los ítems agotados de A en la Nevera hasta que el fetch de BD
    // reconciliaba. Hermano omitido del fix P1-XTAB-CACHE-LEAK — misma clase.
    safeLocalStorageRemove('mealfit_depleted_items');
    // [P3-DEPLETED-MIGRATION-FLAG-XUSER · 2026-05-30] Limpiar también el flag
    // derivado `mealfit_depleted_items_migrated_at` (one-shot migration del
    // localStorage→BD en Pantry.jsx). Es derivado de `mealfit_depleted_items`
    // (que se acaba de borrar) y debe limpiarse junto a él para que el próximo
    // usuario re-evalúe la migración con estado consistente. Hermano omitido de
    // P2-DEPLETED-XUSER — sin pérdida de datos (la SSOT de B es la BD vía
    // _fetchAndApply), pero cierra la inconsistencia de clearing user-scoped.
    safeLocalStorageRemove('mealfit_depleted_items_migrated_at');
    // [P2-CHAT-CACHE-XUSER · 2026-05-31] Caches del chat del Agente: mensajes
    // (hasta 50 msgs), lista de sesiones (con títulos) y sesión actual. Las 3
    // son GLOBAL-keyed (sin user_id) y sobrevivían al logout SPA → en
    // dispositivo compartido el usuario B podía ver/rehidratar la conversación
    // de A (PII nutricional). Hermano omitido del sweep P1-XTAB-CACHE-LEAK.
    // `mealfit_current_session` además: sin borrarla, la rama user-switch dejaba
    // el sessionId de A → el initializer del messages-cache (cache.sessionId ===
    // currentSessionId) rehidrataba la conversación de A en la vista de B.
    safeLocalStorageRemove(CHAT_MESSAGES_CACHE_KEY);
    safeLocalStorageRemove(CHAT_SESSIONS_CACHE_KEY);
    safeLocalStorageRemove(CHAT_CURRENT_SESSION_KEY);
    // [P2-QUOTA-CACHE-XUSER · 2026-06-01] `window.__cachedQuota` / `__lastQuotaCheckTime`
    // son globals NO user-scoped que cachean el planCount del backend (TTL 120s en
    // Dashboard, 5s en useRegeneratePlan/Settings) para evitar fetch en cada click del
    // gate de regeneración. El logout es navigate SPA sin reload → sobreviven al
    // user-switch → en dispositivo compartido el usuario B leía el conteo de A contra
    // su propio límite (falso bloqueo / falso bypass del gate soft por ≤120s). El quota
    // real se enforza server-side (verify_api_quota→402), así que NO es escalada — solo
    // UX del gate. Hermano omitido de la clase P1-XTAB-CACHE-LEAK / P2-CHAT-CACHE-XUSER.
    // `= undefined`/`= 0` basta: el primer lector post-switch ve undefined → fetch fresco.
    try {
        if (typeof window !== 'undefined') {
            window.__cachedQuota = undefined;
            window.__lastQuotaCheckTime = 0;
        }
    } catch { /* noop */ }
};

export const AssessmentProvider = ({ children }) => {
    // --- ESTADOS DE LA APLICACIÓN ---

    // Auth State
    const [session, setSession] = useState(null);
    const [loadingAuth, setLoadingAuth] = useState(true);

    // [APPEARANCE-THEME · 2026-05-29] Señal para que main.jsx descarte el splash
    // cuando la auth inicial resolvió (shell listo para pintar la pantalla
    // correcta: login o dashboard). main.jsx tiene un fallback por si acaso.
    useEffect(() => {
        if (!loadingAuth) {
            window.dispatchEvent(new Event('mealfit:app-ready'));
        }
    }, [loadingAuth]);

    // Estado para saber si estamos sincronizando datos de la DB
    const [loadingData, setLoadingData] = useState(true);

    // Estado del Perfil Real (Base de Datos)
    const [userProfile, setUserProfile] = useState(null);

    // Navegación del Wizard (Pasos de la evaluación)
    const [currentStep, setCurrentStep] = useState(0);
    const [direction, setDirection] = useState(0);
    const [maxReachedStep, setMaxReachedStep] = useState(0);

    // Datos del Plan Generado (JSON devuelto por la IA)
    // [P2-B] try/catch defensivo: si `mealfit_plan` se corrompe (edición manual,
    // bug de serialización, downgrade de versión), un throw aquí rompe el render
    // inicial del AssessmentProvider — y como envuelve toda la app, el usuario
    // ve pantalla blanca sin forma de recuperarse salvo limpiando storage manual.
    const [planData, setPlanData] = useState(() => {
        const savedPlan = safeLocalStorageGet('mealfit_plan', null);
        if (!savedPlan) return null;
        try { return JSON.parse(savedPlan); }
        catch { return null; }
    });

    // Estado de Likes Persistente { "NombrePlato": true }
    // [P2-B] Mismo patrón defensivo que `planData` arriba.
    const [likedMeals, setLikedMeals] = useState(() => {
        const savedLikes = safeLocalStorageGet('mealfit_likes', null);
        if (!savedLikes) return {};
        try { return JSON.parse(savedLikes); }
        catch { return {}; }
    });

    // Estado de Dislikes Persistente (permanente — sin expiración)
    // [P1-FRONTEND-HARDEN · 2026-05-23] safeLocalStorageGet vs raw getItem:
    // en iOS Safari Private Mode getItem lanza SecurityError. Como este call
    // está FUERA del callback del useState (no se ejecuta lazy), el throw
    // corta el render del provider entero → pantalla blanca sin recuperación.
    const [dislikedMeals, setDislikedMeals] = useState(() => {
        const savedDislikes = safeLocalStorageGet('mealfit_dislikes', null);
        if (!savedDislikes) return {};
        try {
            const parsed = JSON.parse(savedDislikes);
            const now = Date.now();
            const valid = {};
            for (const meal in parsed) {
                if (typeof parsed[meal] === 'number') {
                    valid[meal] = parsed[meal];
                } else if (parsed[meal] === true) {
                    // Migración de formato legacy (boolean → timestamp)
                    valid[meal] = now;
                }
            }
            return valid;
        } catch (e) {
            return {};
        }
    });

    // [P1-FORM-3] Default `weightUnit` basado en locale del browser. ANTES era
    // hardcoded 'lb'; ~95% de usuarios (todo el mundo no-US) son métricos y
    // tipear "70" pensando en kg pero almacenando como lb daba un cálculo
    // nutricional ~32% menor (70 lb = 31.7 kg) sin disparar el chequeo de
    // rango (31.7 > 30 kg mínimo). Países con sistema imperial para peso
    // corporal: US, Liberia, Myanmar. Resto → kg. Para MealfitRD (DR, locale
    // típico es-DO), esto cambia el default de "lb (incorrecto para 99% de
    // usuarios)" a "kg (correcto para 99% de usuarios)". El touched-tracking
    // (`_weightUnitTouched`, ver abajo) cubre los edge cases.
    const _getDefaultWeightUnit = () => {
        // [P3-DEFAULT-IMPERIAL · 2026-05-20] Default unificado a 'lb' para
        // todos los locales. Pre-fix branchaba por locale del navegador
        // (en-US/en-LR/my → lb, resto → kg). Decisión de producto: imperial
        // como default global; el user puede cambiar a kg via el toggle en
        // assessment o Settings.
        return 'lb';
    };

    const initialFormData = {
        age: '', gender: '', height: '', weight: '', weightUnit: _getDefaultWeightUnit(), bodyFat: '', activityLevel: '',
        sleepHours: '', stressLevel: '', cookingTime: '', budget: '', budgetAmount: '', budgetCurrency: 'DOP', scheduleType: '',
        dietType: '', allergies: [], dislikes: [], medicalConditions: [], otherAllergies: '',
        // [P1-MEDICATION-RULES · 2026-06-18] Medicamentos actuales (chips, OPCIONAL — array vacío = sin
        // medicamentos, sin sentinel "Ninguno"). Alimenta el motor de interacciones fármaco-alimento
        // (backend medication_rules.py): warfarina↔vit K, metformina↔B12, IECA/ARA-II↔potasio,
        // levotiroxina↔Ca/Fe → directiva al generador + gate de revisión profesional (FS9).
        medications: [],
        mainGoal: '', motivation: '', struggles: [],
        // [P1-FORM-3] Touched-flag para `weightUnit` (mismo patrón que otros
        // touched-flags del wizard).
        // Si el usuario explícitamente tocó el toggle LB/KG en QMeasurements,
        // `_weightUnitTouched=true` persiste y el useEffect mount-only protege
        // `weightUnit` de ser sobreescrito por hidratación stale del DB. Sin
        // esto, un usuario europeo que cambió a 'kg' podía perder esa decisión
        // tras refresh y volver al default → sus 70 kg se interpretarían como
        // 70 lb (≈31.7 kg) → BMR/macros completamente errados. El default
        // ahora es locale-based (ver `_getDefaultWeightUnit` arriba), pero
        // este flag cubre el edge case de US-expat-en-DR (locale es-DO →
        // default 'kg' incorrecto para él) o cualquier mismatch locale↔intent.
        _weightUnitTouched: false,
        // [P1-12 · householdSize removido 2026-05-30] Touched-flag para
        // groceryDuration. Mismo patrón que `_weightUnitTouched` (P1-FORM-3):
        // sin él, un cambio explícito del ciclo de compras podía revertirse al
        // siguiente Realtime UPDATE de `user_profiles` (admin tooling, otra
        // pestaña, sync cloud) o tras `fetchProfile` post-login con valores
        // stale del DB. El useEffect mount-only re-arma `editedFieldsRef` con
        // 'groceryDuration' cuando el flag está a `true`. `_householdSizeTouched`
        // se eliminó: householdSize es fijo en 1 (decisión de producto
        // 2026-05-30, sin selector de hogar) → no hay edición de hogar que
        // preservar.
        _groceryDurationTouched: false,
        // [P1-13] Unidad seleccionada en QMeasurements para el INPUT de altura
        // (cm vs ft+inches). Antes vivía como `useState` local, perdiéndose al
        // remount del componente (caso típico: usuario tipea "5 ft 10 in",
        // avanza a QActivityLevel, vuelve con prevStep — `unit` arrancaba 'cm'
        // por default y mostraba la altura en cm sin contexto). Persistirlo
        // como `_heightInputUnit` en formData garantiza que prevStep recupere
        // la decisión visual del usuario. NO se hidrata desde DB (prefijo `_`
        // lo trata como interno via stripInternalFlags / SENSITIVE_FIELDS),
        // solo desde localStorage.
        // [FT-DEFAULT-PRESELECT · 2026-05-31] Default 'ft' (no 'cm') — paridad
        // con `weightUnit: 'lb'`: el mercado es-DO usa pies+pulgadas/imperial.
        // Pre-fix initialFormData='cm' mientras el componente caía a `|| 'ft'`
        // (inconsistente: el fallback nunca aplicaba porque 'cm' es truthy →
        // usuarios nuevos arrancaban en CM). La altura SIEMPRE se guarda en cm
        // internamente (el toggle solo cambia qué inputs se muestran); el toggle
        // CM sigue visible para quien prefiera centímetros.
        _heightInputUnit: 'ft',
        // [P0-12 · revisado 2026-05-30] `groceryDuration` arranca en '' y el
        // wizard (QHousehold) lo exige antes de avanzar. `householdSize` es
        // FIJO en 1 por decisión de producto (2026-05-30): se eliminó el
        // selector de tamaño de hogar; el producto escala por persona. Sigue
        // listado en REQUIRED_FORM_FIELDS por paridad de contrato con el
        // backend (`test_p0_form_6_required_fields_sync`), pero el default 1
        // (truthy) siempre satisface `findFirstIncompleteField` → nunca bloquea
        // ni navega a un step inexistente. NO re-introducir un selector de
        // hogar sin revertir antes esta decisión (ver tests P0_12/P1_12).
        includeSupplements: false, selectedSupplements: [], groceryDuration: '', householdSize: 1,
        otherConditions: '',
        // [P1-B5] otherDislikes captura el free-text del step QDislikes (alimentos
        // no listados en los chips comunes, ej. "Apio, Curry, Picante").
        otherDislikes: '',
        // [P1-C] otherStruggles ya lo escribe QStruggles vía updateData y lo
        // mergea el backend en `_OTHER_TEXT_FIELD_MAP`. Declararlo aquí cierra
        // la inconsistencia de SSOT con los demás `other*` y evita warnings de
        // "controlled to uncontrolled" en el primer render del input.
        otherStruggles: '',
    };

    // [P1-B7] State inicial del formData. Composición:
    //   - `initialFormData` como base (defaults).
    //   - `savedForm` plain de `mealfit_form` (solo public ahora; sensitive
    //     fue removido por la migración legacy si existía).
    //   - `_legacySensitive` recuperado de la migración (si había sensitive
    //     en formato viejo, vive en memoria; se cifrará y persistirá cuando
    //     llegue la session).
    //
    // El sensitive cifrado de `mealfit_form_secure` se hidrata async en un
    // `useEffect` aparte cuando session está disponible — mientras tanto los
    // campos sensitive arrancan con sus valores default. Ese flicker es el
    // costo aceptable de no leer plain de localStorage.
    const [formData, setFormData] = useState(() => {
        const _legacyMigration = migrateLegacyFormStorage();
        const _legacySensitive = _legacyMigration?.sensitiveData || null;
        const savedForm = safeLocalStorageGet('mealfit_form', null);

        let _parsedSavedForm = null;
        if (savedForm) {
            try { _parsedSavedForm = JSON.parse(savedForm); } catch { _parsedSavedForm = null; }
        }

        return {
            ...initialFormData,
            ...(_parsedSavedForm || {}),
            ...(_legacySensitive || {}),
        };
    });

    // [P1-3] Flag de hidratación pendiente del sensitive cifrado.
    // ----------------------------------------------------------------
    // El descifrado de `mealfit_form_secure` (AES-GCM con clave HKDF derivada
    // del access_token) se hace en un useEffect aparte cuando llega `session`
    // — toma 50-200ms en hardware típico. Durante esa ventana, los campos
    // sensibles (allergies, medicalConditions, dislikes, struggles, motivation,
    // bodyFat, otherAllergies/Conditions/Dislikes/Struggles) están en sus
    // valores default vacíos (a menos que `_legacySensitive` los haya repuesto
    // desde la migración legacy).
    //
    // Antes esto era documentado como "flicker aceptable", pero si el usuario
    // navegaba a `/plan` o disparaba regenerate en esos 50-200ms post-login
    // (deep link, caché abierta del Dashboard), `findFirstIncompleteField`
    // evaluaba con allergies=[] / motivation="" / bodyFat="" → toast "Falta
    // completar Edad" (o cualquier sensitive) y redirect a `/assessment` ←
    // pero el dato SÍ estaba en storage cifrado. UX rota silenciosamente.
    //
    // Ahora: arrancamos `true` SI hay session activa O si vamos a tener una
    // (auth (Neon) pendiente: hay token en localStorage). En el useEffect
    // que descifra, bajamos a `false` cuando terminó (éxito, sin sensitive,
    // o error). Sin session → bajamos a `false` inmediatamente en el primer
    // render via useEffect deps (no hay nada que descifrar).
    //
    // Consumers (Plan.jsx, useRegeneratePlan, InteractiveAssessmentFlow):
    // gatear `findFirstIncompleteField` con `if (loadingSensitive) return;`
    // y mostrar UI de carga en su lugar.
    //
    // Heurística inicial: `true` si existe la key `mealfit_form_secure` en
    // localStorage (significa que hubo session previa que cifró sensitive).
    // Si no existe esa key, sensitive nunca fue persistido → no hay nada que
    // hidratar → arrancamos `false` y los consumers no esperan.
    const [loadingSensitive, setLoadingSensitive] = useState(() => {
        try {
            return typeof localStorage !== 'undefined' && !!localStorage.getItem('mealfit_form_secure');
        } catch {
            return false;
        }
    });

    // [P1-10] Hidratación pendiente del PROFILE (DB → formData) además del
    // sensitive cifrado. ANTES, `loadingSensitive` SOLO chequeaba la
    // existencia de `mealfit_form_secure`. Para usuarios en su PRIMER login
    // en otro dispositivo (sin ese key), `loadingSensitive=false` desde el
    // primer render aunque `fetchProfile` estuviera en vuelo desde el backend
    // (~100-500ms). Plan.jsx y useRegeneratePlan evaluaban
    // `findFirstIncompleteField` antes de que `fetchProfile` completara →
    // toast engañoso "Falta completar X" + redirect a /assessment con datos
    // que SÍ existían en DB pero aún no llegaban al state.
    //
    // Heurística inicial: arrancar `true` si hay user_id en localStorage
    // (fuerte señal de session previa que iba a cargarse). Sin user_id → no
    // hay nada que hidratar desde DB → `false`. El handler de auth-change
    // lo sube a `true` antes del Promise.all([fetchProfile, ...]) y lo baja
    // a `false` después del Promise.race con el timeout de 5s.
    //
    // El `loadingSensitive` exportado al context combina ambos flags
    // (`loadingSensitive || loadingProfile`) para que los 4 consumers
    // existentes (Plan.jsx, useRegeneratePlan, InteractiveAssessmentFlow,
    // ...) NO necesiten cambiar — siguen leyendo `loadingSensitive` y
    // automáticamente esperan a la hidratación COMPLETA del formData.
    const [loadingProfile, setLoadingProfile] = useState(() => {
        try {
            return typeof localStorage !== 'undefined'
                && !!localStorage.getItem('mealfit_user_id')
                && localStorage.getItem('mealfit_user_id') !== 'guest';
        } catch {
            return false;
        }
    });

    // --- ESTADO PARA LOS CRÉDITOS ---
    const [planCount, setPlanCount] = useState(0);
    const PLAN_LIMIT = 15; // Límite del plan gratuito

    // [P1-GUEST-MODE · 2026-06-15] Estado del modo invitado. `guestFlag` espeja
    // el flag de localStorage (re-render al activar); `guestCreditsUsed` espeja
    // el contador de créditos consumidos. `isGuest` es verdadero SOLO cuando no
    // hay sesión real (un login válido siempre gana sobre el modo invitado).
    const [guestFlag, setGuestFlag] = useState(() => isGuestModeActive());
    const [guestCreditsUsed, setGuestCreditsUsed] = useState(() => getGuestCreditsUsed());

    // Al confirmarse una sesión real, salir de modo invitado y limpiar TODAS las
    // keys de invitado (flag + créditos + session_id efímero) para que el usuario
    // logueado vea sus créditos reales y no quede rastro de la identidad anónima
    // del invitado en el dispositivo. [P1-GUEST-KEY-HYGIENE · 2026-06-15] antes
    // solo exitGuestMode() (flag+créditos) dejaba mealfit_guest_session_id stale.
    useEffect(() => {
        if (session) {
            clearGuestModeStorage();
            setGuestFlag(false);
        }
    }, [session]);

    // [P1-GUEST-FRESH · 2026-06-15] Activa modo invitado arrancando una cuenta de
    // invitado NUEVA y LIMPIA (lo invoca "Probar sin cuenta"). Antes solo seteaba
    // el flag → el formulario/plan/likes que hubieran quedado en localStorage de
    // una sesión previa (cuenta real cerrada o invitado anterior) se mostraban
    // "medio llenos". Ahora limpiamos esos datos (localStorage + state de React) y
    // rotamos session_id + créditos. El progreso del invitado NO se pierde al
    // registrarse: la detección de cambio-de-usuario excluye 'guest' (no borra),
    // así que su form/plan recién llenados se HEREDAN a la cuenta nueva.
    const activateGuestMode = useCallback(() => {
        safeLocalStorageRemove('mealfit_form');
        safeLocalStorageRemove('mealfit_form_secure');
        safeLocalStorageRemove('mealfit_plan');
        safeLocalStorageRemove('mealfit_likes');
        safeLocalStorageRemove('mealfit_dislikes');
        safeLocalStorageRemove('mealfit_current_session');
        // [P1-GUEST-XUSER-CACHE · 2026-06-15] Limpiar los caches global-keyed
        // (inventario Nevera + listado Historial + 5 modal caches + depleted +
        // chat) de CUALQUIER usuario previo ANTES de arrancar el invitado. Sin
        // esto, A (que cargó Nevera/Historial aquí) → /login → "Probar sin cuenta"
        // → registra cuenta B reabriría el leak PII cross-user P1-XTAB-CACHE-LEAK:
        // la rama de wipe en handleAuthChange excluye 'guest' (herencia intencional
        // del form/plan) y NO corre _clearUserScopedCaches en ese path. Paridad con
        // exitGuestSession/resetApp. NO afecta la herencia (form/plan viven en
        // mealfit_form/mealfit_plan, ya re-seteados, no en los caches global-keyed).
        _clearUserScopedCaches();
        // Marcar 'guest' como dueño del form: al registrarse, el form/plan recién
        // llenados se HEREDAN (la rama de wipe en handleAuthChange excluye 'guest').
        safeLocalStorageSet('mealfit_last_form_owner', 'guest');
        const sid = activateGuestModeStorage();
        setFormData(initialFormData);
        setPlanData(null);
        setLikedMeals({});
        setDislikedMeals({});
        setCurrentStep(0);
        setMaxReachedStep(0);
        editedFieldsRef.current.clear();
        setGuestFlag(true);
        setGuestCreditsUsed(0);
        return sid;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Consume 1 crédito de invitado (tras una generación exitosa).
    const consumeGuestCredit = useCallback(() => {
        const n = incrementGuestCreditsUsed();
        setGuestCreditsUsed(n);
        return n;
    }, []);

    // 🔒 [P0-B2] Lock para evitar que `restoreSessionData` (cloud sync) o el
    // canal Realtime sobreescriban planData mientras una operación local de
    // recalc está en vuelo.
    //
    // Antes, `setRecalcLock(true)` programaba un `setTimeout(15s)` que jamás se
    // cancelaba aunque el caller llamara `setRecalcLock(false)` antes. Si la
    // operación terminaba en 200ms, el ref pasaba a false correctamente, pero
    // 15s después el timer todavía fired y forzaba `false` otra vez — sin
    // efecto en el happy path, pero en el escenario:
    //   1. Recalc A inicia → setRecalcLock(true), timer A schedulado 15s.
    //   2. Recalc A termina en 1s → setRecalcLock(false). Timer A sigue vivo.
    //   3. 5s después, recalc B inicia → setRecalcLock(true), timer B schedulado.
    //   4. A los 15s del PASO 1: timer A fires, setea ref=false PESE A que B
    //      está activo. B queda sin lock; cloud sync puede pisar su resultado.
    //
    // Además, ningún call site garantizaba `setRecalcLock(false)` en finally:
    // si la async fn lanzaba en un punto entre los `try { ... } catch`, el lock
    // dependía de que el catch también llamara explícitamente — riesgo de leak.
    //
    // Ahora:
    //   - `recalcSafetyTimerRef` guarda el handle del timer activo. Cada
    //     `setRecalcLock(true)` clearea el timer anterior antes de crear uno
    //     nuevo, evitando que un timer huérfano libere el lock de otra ejecución.
    //   - `setRecalcLock(false)` también clearea el timer (release explícito).
    //   - `withRecalcLock(asyncFn)` envuelve toda la operación en try/finally,
    //     garantizando release aunque la fn lance, sea cancelada, o el componente
    //     se desmonte mid-flight.
    const recalcLockRef = useRef(false);
    const recalcSafetyTimerRef = useRef(null);

    // [P0-FORM-2 + P0-FORM-3] Tracking de TODOS los campos editados por el
    // usuario desde que este provider montó. Contramedida contra dos races
    // distintas que escribían sobre `formData` ASYNC mientras el usuario
    // editaba el wizard:
    //
    //   - [P0-FORM-2] Descifrado de `mealfit_form_secure` post-login / token
    //     refresh (~50-200ms). Solo afecta los campos sensibles definidos en
    //     `SENSITIVE_FIELDS` de `secureFormStorage.js`. El `useEffect` de
    //     hidratación filtraba con `{...prev, ...sensitiveData}` — sensitiveData
    //     GANABA sobre prev → pérdida silenciosa de la edición in-flight.
    //
    //   - [P0-FORM-3] Fetch de `user_profiles.health_profile` desde el backend
    //     en `fetchProfile` (~100-500ms). Afecta CUALQUIER campo del formData.
    //     Mismo patrón de spread invertida — el snapshot del DB ganaba sobre
    //     la edición in-flight, sobreescribiendo lo que el usuario acababa de
    //     teclear con el valor anterior almacenado en DB.
    //
    // Fix unificado: cada `updateData(field, ...)` registra el field en este Set.
    // Ambos consumidores async (hidratación cifrada + fetchProfile) filtran
    // su payload excluyendo cualquier key que el usuario ya tocó.
    //
    // Comportamiento neto:
    //   - Sin ediciones previas → fetch/hidratación poblan todos los campos
    //     (intent "post-login mostrar datos del usuario").
    //   - Edición previa → solo los campos NO tocados se hidratan/sincronizan
    //     desde storage o DB. Los tocados se preservan tal cual el usuario los dejó.
    //   - Token refresh durante edición concurrente → idem.
    //
    // No reseteamos el set: para la vida del provider, una key tocada nunca
    // debe ser sobrescrita por storage o DB. Reload re-monta el provider y
    // el set arranca vacío, que es el comportamiento deseado.
    const editedFieldsRef = useRef(new Set());

    // [P0-FORM-2 + P1-FORM-3] Re-arma la protección de campos con touched-flag
    // persistido tras remount/refresh. `editedFieldsRef` arranca vacío en cada
    // mount (es in-memory). Si el usuario tomó decisiones explícitas en una
    // sesión previa (persistido en `_xxxTouched=true` dentro de `mealfit_form`),
    // este effect re-añade los fields correspondientes al set para que
    // `fetchProfile` y `secureLoadFormData` los excluyan del overlay → las
    // decisiones del usuario sobreviven a la hidratación async post-login con
    // valores potencialmente stale del DB. Mount-only (deps vacías) — leemos
    // los flags UNA vez al arranque del provider; ediciones posteriores ya
    // pasan por `updateData` que añade el field al ref directamente.
    //
    // Patrón: `_xxxTouched=true` (persistido) → re-armar 'xxx' en el ref.
    // Cubre actualmente: weightUnit (P1-FORM-3) y groceryDuration (P1-12).
    // householdSize se removió (fijo en 1, decisión de producto 2026-05-30).
    useEffect(() => {
        if (formData?._weightUnitTouched === true) {
            editedFieldsRef.current.add('weightUnit');
        }
        // [P1-12 · householdSize removido 2026-05-30] Re-armar groceryDuration
        // desde el flag persistido. Sin esto, el cambio de ciclo de compras
        // podía ser revertido por Realtime UPDATE / fetchProfile post-refresh.
        if (formData?._groceryDurationTouched === true) {
            editedFieldsRef.current.add('groceryDuration');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // [P3-RECALC-LOCK-TIMER-FIX · 2026-05-16] Safety timer ms — configurable
    // pero default 30s (era 15s). Razón: con el retry P3-RECALC-503-CLASSIFICATION
    // (frontend reintenta 1× tras 500ms en 5xx), una operación legítima puede
    // tomar:
    //   • 1er intento (recalc lento free tier): 8-12s
    //   • backoff: 0.5s
    //   • 2do intento: 8-12s
    //   • total: 17-24s — excede 15s habitualmente, disparaba el warn falso.
    // 30s acomoda el caso retry + recalc lento sin desbloquear lock prematuramente.
    // Si una operación realmente tarda >30s, hay un bug aguas arriba — el warn
    // sigue siendo útil pero con mensaje preciso (sin culpar al caller).
    const _RECALC_SAFETY_TIMER_MS = 30000;

    const setRecalcLock = useCallback((val) => {
        // Siempre cancelar el timer pendiente: evita que un timer huérfano
        // libere prematuramente un lock futuro.
        if (recalcSafetyTimerRef.current) {
            clearTimeout(recalcSafetyTimerRef.current);
            recalcSafetyTimerRef.current = null;
        }
        recalcLockRef.current = !!val;
        if (val) {
            // Safety net: si la operación tarda más del límite, asumimos que
            // algo se quedó colgado (componente desmontado mid-flight, fetch
            // hanging, finally que no corrió) y liberamos el lock para que
            // Realtime y otros consumidores no queden bloqueados indefinidamente.
            // [P3-RECALC-LOCK-TIMER-FIX · 2026-05-16] Mensaje reescrito: el warn
            // original ("el caller olvidó setRecalcLock") era engañoso —
            // `withRecalcLock` siempre libera en finally, así que el warn dispara
            // por operaciones lentas legítimas (free tier + retry), no por bug
            // del caller. Si esto aparece >30s, es señal de backend lento, no
            // de bug del frontend.
            recalcSafetyTimerRef.current = setTimeout(() => {
                recalcLockRef.current = false;
                recalcSafetyTimerRef.current = null;
                console.warn(
                    `🔒 [RECALC LOCK] Safety timer (${_RECALC_SAFETY_TIMER_MS / 1000}s) ` +
                    `liberó el lock — la operación de recalc no terminó a tiempo. ` +
                    `Probable causa: backend lento (free tier DB + retry transient). ` +
                    `Si recurrente, investigar logs backend del endpoint recalc.`
                );
            }, _RECALC_SAFETY_TIMER_MS);
        }
    }, []);
    // [P0-B2] Wrapper recomendado para envolver operaciones de recalc:
    // `await withRecalcLock(async () => { ... })`. Garantiza release en finally
    // — incluido si la fn lanza, retorna early, o termina con success. Devuelve
    // el valor que retorne `asyncFn` para componer con el caller.
    const withRecalcLock = useCallback(async (asyncFn) => {
        setRecalcLock(true);
        try {
            return await asyncFn();
        } finally {
            setRecalcLock(false);
        }
    }, [setRecalcLock]);

    // --- FUNCIÓN PARA RESTAURAR SESIÓN DESDE DB ---
    const restoreSessionData = useCallback(async (userId) => {
        if (!userId) {
            setLoadingData(false);
            return;
        }

        // 🔒 Si hay un recálculo en progreso, no sobreescribir planData
        if (recalcLockRef.current) {
            console.log('🔒 [RESTORE] Bloqueado por recalcLock — omitiendo sincronización con la nube.');
            setLoadingData(false);
            return;
        }

        setLoadingData(true);


        try {
            // 1. Buscar el último plan creado por este usuario.
            // [P1-NEON-DB-MIGRATION · 2026-06-12] SELECT directo a meal_plans
            // (PostgREST) → GET /api/plans-data/latest. El backend resuelve la
            // identidad desde el Bearer token y filtra user_id server-side
            // (I2); timestamps con paridad PostgREST (ISO-8601 con 'T').
            const latestResp = await fetchWithAuth('/api/plans-data/latest');
            if (!latestResp.ok) {
                throw new Error(`GET /api/plans-data/latest → HTTP ${latestResp.status}`);
            }
            const { plan: latestRow } = await latestResp.json();

            if (latestRow) {
                const latestPlan = latestRow.plan_data;
                const planCreatedAt = latestRow.created_at;
                const planId = latestRow.id;

                // [P0-DASH-CHIP-HONESTY · 2026-05-09] Inyectar el row id
                // dentro del jsonb del planData para que consumidores
                // (Dashboard chip honesto, restock handler línea 1590,
                // History fetchHistory) lo lean como `planData.id`. Antes
                // el id solo vivía en este scope local; los call sites
                // que escribían `planData?.id` recibían undefined y
                // fallaban silenciosamente — el endpoint /chunk-status
                // se llamaba con `/api/plans/undefined/chunk-status` →
                // 404 → state chunkStatusInfo nunca se hidrataba → el
                // chip "en camino" del Dashboard mentía pese al fix
                // P0-DASH-CHIP-HONESTY del backend. Reconcilia ambos
                // lados (el jsonb mantiene su shape; agregamos una key
                // `id` que coincide con la fila — análogo al inject de
                // grocery_start_date/cycle_start_date más abajo).
                if (latestPlan && typeof latestPlan === 'object') {
                    latestPlan.id = planId;
                }

                // FIX: Asegurar que el plan de la BD tenga una fecha de inicio de compras para el contador de Dashboard
                // [P1-FRONTEND-HARDEN · 2026-05-23] los 3 getItem('mealfit_plan')
                // pasaron a safeLocalStorageGet: en iOS Private Mode el throw
                // dejaba localGroceryStartDate/localCycleStartDate undefined y
                // el backfill se aplicaba con planCreatedAt aunque el localStorage
                // tuviera fechas válidas — drift cosmético del contador del Dashboard.
                let didInjectGroceryDate = false;
                if (!latestPlan.grocery_start_date) {
                    const localSaved = safeLocalStorageGet('mealfit_plan', null);
                    let localGroceryStartDate = null;
                    if (localSaved) {
                        try {
                            const parsed = JSON.parse(localSaved);
                            localGroceryStartDate = parsed.grocery_start_date;
                        } catch(e) {}
                    }

                    // Si el plan vino de la IA/Chat, no trae esta fecha.
                    // Priorizamos mantener la local, si no existe usamos la de creación.
                    latestPlan.grocery_start_date = localGroceryStartDate || planCreatedAt;
                    didInjectGroceryDate = true;
                }

                // cycle_start_date: fecha inmutable para el contador de daysLeft del Dashboard.
                // grocery_start_date la rota el backend (rolling window de menús), por lo que
                // no sirve para medir cuántos días lleva activo el ciclo. Backfill para planes
                // existentes con la fecha de creación de la fila DB.
                if (!latestPlan.cycle_start_date) {
                    const localSaved = safeLocalStorageGet('mealfit_plan', null);
                    let localCycleStartDate = null;
                    if (localSaved) {
                        try {
                            const parsed = JSON.parse(localSaved);
                            localCycleStartDate = parsed.cycle_start_date;
                        } catch(e) {}
                    }
                    latestPlan.cycle_start_date = localCycleStartDate || planCreatedAt;
                    didInjectGroceryDate = true;
                }

                // Leemos directamente del localStorage para la comparación
                const localSavedForCompare = safeLocalStorageGet('mealfit_plan', null);

                let localSavedParsed = null;
                if (localSavedForCompare) {
                    try {
                        localSavedParsed = JSON.parse(localSavedForCompare);
                    } catch(e) {
                        console.warn("⚠️ Error parseando plan local, forzando sincronización con la nube.");
                    }
                }

                // Solo actualizamos si el plan en la nube es diferente al local.
                // [P3-RESTORE-STRINGIFY-ONCE · 2026-06-01] plan_data es jsonb
                // multi-semana (decenas-cientos de KB) y esto corre en el critical
                // path de cada login/token-switch. Antes serializaba el plan ENTERO
                // 3× por llamada (2 en la comparación + 1 dentro de safeLocalStorageSet).
                // Stringify cada objeto UNA vez y reusar: comparación byte-equivalente,
                // y pasamos el string ya serializado a safeLocalStorageSet (acepta
                // string directo → evita el 3er stringify).
                const _localStr = localSavedParsed ? JSON.stringify(localSavedParsed) : null;
                const _latestStr = JSON.stringify(latestPlan);
                if (_localStr === null || _localStr !== _latestStr) {

                    setPlanData(latestPlan);
                    safeLocalStorageSet('mealfit_plan', _latestStr);
                } else {

                }

                // Guardar la fecha en DB para persistencia cruzada (si se inyectó)
                //
                // [P0-NEW-B · 2026-05-11] Reemplaza el patrón legacy
                // de full overwrite del JSONB desde el cliente que producía
                // lost-update si `_chunk_worker` o el cron
                // `_resolve_grocery_start_date` mutaban plan_data en
                // paralelo. El endpoint backend hace jsonb_set quirúrgico
                // sobre `{grocery_start_date}` y `{cycle_start_date}` con
                // idempotencia `(plan_data->>'<key>') IS NULL` + AND user_id.
                if (didInjectGroceryDate && userId && userId !== 'guest') {
                    fetchWithAuth(`/api/plans/${planId}/grocery-start-date`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            grocery_start_date: latestPlan.grocery_start_date,
                            cycle_start_date: latestPlan.cycle_start_date,
                        }),
                    }).then((res) => {
                        if (!res.ok) {
                            console.error('Error sincronizando fecha inicio despensa:', res.status);
                        }
                    }).catch((err) => {
                        console.error('Error sincronizando fecha inicio despensa', err);
                    });
                }
            } else {

            }
        } catch (err) {
            console.error("❌ Error restaurando sesión:", err);
        } finally {
            setLoadingData(false);
        }
    }, []);

    // --- 1. FUNCIÓN PARA CONSULTAR LÍMITE DE IA (API) ---
    const checkPlanLimit = useCallback(async (specificUserId = null) => {
        try {
            const userId = specificUserId || session?.user?.id || safeLocalStorageGet('mealfit_user_id', null);

            if (!userId || userId === 'guest') {
                setPlanCount(0);
                return 0;
            }

            const response = await fetchWithAuth(`/api/user/credits/${userId}`);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error consultando créditos: ${response.status} - ${errorText}`);
            }
            const data = await response.json();

            setPlanCount(data.credits || 0);
            return data.credits || 0;
        } catch (error) {
            console.error("Error verificando límites de API:", error);
            return 0;
        }
        // [P5-SPEED-CTX-DEP-NARROW · 2026-06-01] dep [session]→[session?.user?.id]:
        // el cuerpo solo lee session?.user?.id; fetchWithAuth lee el token fresco
        // internamente. El objeto `session` recibe NUEVA referencia en cada
        // TOKEN_REFRESHED (~1h), lo que recreaba este callback y re-suscribía el
        // effect de auth (dep en línea ~1109) sin necesidad. Estrechar a la primitiva
        // mantiene la identidad estable salvo cambio real de usuario.
    }, [session?.user?.id]);

    // --- 2. MANEJO DE SESIÓN Y PERFIL ---
    const fetchProfile = useCallback(async (userId) => {
        if (!userId) return;
        try {
            // [P1-NEON-DB-MIGRATION · 2026-06-12] SELECT * de user_profiles
            // (.single() PostgREST) → GET /api/profile. El backend resuelve la
            // identidad desde el Bearer token (`userId` se mantiene como guard
            // de compat para los callers). 404 = sin perfil aún (mismo no-op
            // que .single() sin fila).
            const profileResp = await fetchWithAuth('/api/profile');
            if (profileResp.status === 404) return;
            if (!profileResp.ok) {
                throw new Error(`GET /api/profile → HTTP ${profileResp.status}`);
            }
            const { profile: data } = await profileResp.json();

            if (data) {
                setUserProfile(data);
                // Sincronizar UI form data con health_profile (si existe y tiene datos)
                if (data.health_profile && Object.keys(data.health_profile).length > 0) {
                    // [P0-FORM-3] Filtra campos que el usuario ya editó desde el
                    // mount del provider (registrados en `editedFieldsRef` por
                    // `updateData`). Antes el spread `{...prev, ...health_profile}`
                    // hacía que el snapshot del DB GANARA sobre la edición
                    // in-flight: si el usuario tipeó age=30, abrió otra pestaña,
                    // y volvió, la siguiente pasada del wizard mostraba age=25
                    // (valor anterior persistido en DB). Ahora los campos
                    // tocados se preservan; los no tocados sí se hidratan.
                    const edited = editedFieldsRef.current;
                    const filtered = {};
                    for (const [k, v] of Object.entries(data.health_profile)) {
                        if (!edited.has(k)) filtered[k] = v;
                    }
                    if (Object.keys(filtered).length > 0) {
                        setFormData(prev => ({ ...prev, ...filtered }));
                    }
                }
            }
        } catch (error) {
            console.error('Error cargando perfil:', error);
        }
    }, [setFormData, setUserProfile]);

    const refreshProfileAndPlan = useCallback(async () => {
        const userId = session?.user?.id || safeLocalStorageGet('mealfit_user_id', null);
        if (userId) {
            try {
                // [P1-NEON-DB-MIGRATION · 2026-06-12] SELECT * de user_profiles
                // → GET /api/profile (identidad desde el Bearer token, I2).
                const profileResp = await fetchWithAuth('/api/profile');
                if (profileResp.status === 404) return;
                if (!profileResp.ok) {
                    throw new Error(`GET /api/profile → HTTP ${profileResp.status}`);
                }
                const { profile: data } = await profileResp.json();

                if (data) {
                    setUserProfile(data);

                    if (data.health_profile && Object.keys(data.health_profile).length > 0) {
                        // [P0-FORM-3] Mismo filtro que `fetchProfile`. Este path
                        // corre desde el listener de visibilitychange/focus
                        // (antes canal Realtime de `user_profiles`, eliminado en
                        // P1-NEON-DB-MIGRATION) y desde `upgradeUserPlan` tras
                        // pagos. Sin este filtro, un snapshot del DB que llega
                        // mientras el usuario edita el wizard GANARÍA sobre la
                        // edición in-flight (regresión silenciosa de P0-FORM-3
                        // que solo se había aplicado en `fetchProfile`).
                        // `recalcLockRef` solo cubre recálculo de plan, no
                        // edición de wizard, así que no protege esta ventana.
                        // Los campos tocados se preservan; los no tocados sí
                        // se hidratan.
                        const edited = editedFieldsRef.current;
                        const filtered = {};
                        for (const [k, v] of Object.entries(data.health_profile)) {
                            if (!edited.has(k)) filtered[k] = v;
                        }
                        if (Object.keys(filtered).length > 0) {
                            setFormData(prev => ({ ...prev, ...filtered }));
                        }
                    }
                }
            } catch (error) {
                console.error("Error refreshing profile or plan:", error);
            }
        }
        // [P5-SPEED-CTX-DEP-NARROW · 2026-06-01] dep [session]→[session?.user?.id]:
        // el cuerpo solo lee session?.user?.id; fetchWithAuth lee el token fresco
        // internamente. `session` recibe nueva referencia en cada TOKEN_REFRESHED
        // (~1h) → recreaba este callback, que es dep del chunk-poll effect del
        // Dashboard (Dashboard.jsx:794) → ese effect se tear-down/re-armaba cada
        // refresh de token. Estrechar a la primitiva evita la recreación.
    }, [session?.user?.id]);

    // [P1-B9] Mantener `sessionRef.current` sincronizado con `session` permite
    // que el `useEffect` grande de abajo lea la sesión vigente sin tener que
    // declarar `session` como dependencia. Antes, el array de deps incluía
    // `session` y cada `setSession(currentSession)` retriggeaba el effect entero
    // — desuscribiendo + resuscribiendo `onAuthStateChange` y haciendo otro
    // round trip a `getSessionWithTimeout` cada vez. El guard de "session
    // idéntica" cubría la mayoría pero hay window de race en transiciones
    // (login → token refresh → logout) donde el chequeo pasa y dispara
    // `fetchProfile + checkPlanLimit + restoreSessionData` doblemente.
    const sessionRef = useRef(null);
    useEffect(() => {
        sessionRef.current = session;
    }, [session]);

    // [P2-REALTIME-RESUB-ON-TOKEN-REFRESH · 2026-06-01] Espejo de
    // `refreshProfileAndPlan` en un ref para que el listener de visibilitychange/
    // focus (antes canal Realtime de user_profiles, eliminado en
    // P1-NEON-DB-MIGRATION · 2026-06-12) pueda invocar la versión fresca SIN
    // listarla en deps. Antes ese effect dependía de
    // `[session, refreshProfileAndPlan]` y `refreshProfileAndPlan` es un
    // useCallback con dep `[session]` → cada `setSession` de TOKEN_REFRESHED
    // (~cada hora, [P2-TOKEN-REFRESH-SYNC]) recreaba la función → teardown +
    // re-suscripción del listener. Mismo patrón P1-B9.
    const refreshProfileAndPlanRef = useRef(null);
    useEffect(() => {
        refreshProfileAndPlanRef.current = refreshProfileAndPlan;
    }, [refreshProfileAndPlan]);

    // [P2-NEW-13 · 2026-05-11] Sync multi-tab del `mealfit_plan` via
    // storage event.
    //
    // Por qué existe (re-audit 2026-05-11):
    //   Sin este listener, dos tabs abiertas del mismo usuario divergían
    //   silenciosamente:
    //     1. Tab A swap-meal vía `/api/plans/{plan_id}/swap-meal/persist`
    //        → backend persiste vía jsonb_set quirúrgico → frontend Tab A
    //        actualiza localStorage `mealfit_plan` + `setPlanData(...)`.
    //     2. Tab B no se entera. Sigue mostrando plan viejo en UI.
    //     3. Cuando Tab B navega o refresca, lee localStorage fresco —
    //        pero hasta entonces, el user ve macros/lista de compras del
    //        plan pre-swap. UX inconsistente entre tabs.
    //
    //   Backend está safe (jsonb_set + AND user_id, no lost-update — eso
    //   lo cerró P0-NEW-A). Este P-fix solo arregla la sincronía visual
    //   entre tabs. Patrón espejo de Pantry.jsx que ya escucha storage
    //   para `mealfit_disabled_ingredients` desde 2026-05-08.
    //
    // Comportamiento:
    //   - `storage` event SOLO se dispara en tabs OTRAS — el originador
    //     ya tiene el estado via `setPlanData` directo.
    //   - newValue=null (key removida por logout/clear) → resetear
    //     planData a null en este tab también.
    //   - parse error → log warning y mantener estado actual (mejor
    //     UI desactualizada que pantalla blanca).
    //   - Mismo session check que el resto del contexto: si user logout
    //     entremedio, no aplicamos cambios.
    useEffect(() => {
        const handlePlanStorageChange = (e) => {
            if (e.key !== 'mealfit_plan') return;
            // storageArea distinto al window actual → ignorar (sessionStorage
            // u otro origin no nos afecta).
            if (e.storageArea && e.storageArea !== window.localStorage) return;
            try {
                if (e.newValue === null || e.newValue === '') {
                    // Plan eliminado en otra tab — sincronizar.
                    setPlanData(null);
                    return;
                }
                const fresh = JSON.parse(e.newValue);
                if (fresh && typeof fresh === 'object') {
                    setPlanData(fresh);
                }
            } catch (err) {
                console.warn(
                    '[P2-NEW-13] mealfit_plan storage event: parse falló, ' +
                    'manteniendo estado actual:',
                    err
                );
            }
        };
        window.addEventListener('storage', handlePlanStorageChange);
        return () => window.removeEventListener('storage', handlePlanStorageChange);
    }, []);

    useEffect(() => {
        const handleAuthChange = async (currentSession) => {
            // Evitar actualizaciones innecesarias si la sesión es idéntica.
            // [P1-B9] Leemos del ref en vez de cerrar sobre `session` para
            // poder remover `session` del array de deps de este effect.
            const prevSession = sessionRef.current;
            if (prevSession?.user?.id && currentSession?.user?.id && prevSession.user.id === currentSession.user.id) {
                // [P2-TOKEN-REFRESH-SYNC · 2026-05-30] Mismo usuario: saltamos el
                // fetch pesado (fetchProfile/checkPlanLimit/restoreSessionData),
                // PERO si el evento es un TOKEN_REFRESHED el access_token rotó.
                // El effect que persiste `mealfit_form_secure` deriva su clave
                // AES-GCM del access_token (secureFormStorage.js); si el React
                // `session` se queda con el token viejo, el blob cifrado tras
                // cada refresh queda keyado a una clave que NO coincide con el
                // token que `getSession()` devuelve al recargar → decrypt falla
                // y el cache local muere. Propagamos solo el token (barato) para
                // que los effects re-keyeen el blob, sin re-disparar el fetch.
                if (prevSession.access_token !== currentSession.access_token) {
                    setSession(currentSession);
                }
                return;
            }

            setSession(currentSession);

            if (currentSession?.user) {
                const userId = currentSession.user.id;
                safeLocalStorageSet('mealfit_user_id', userId);

                // [P1-FRONTEND-HARDEN · 2026-05-23] safeLocalStorageGet vs raw
                // getItem: en iOS Private Mode el throw del raw getItem hacía
                // que la rama de detección user-switch nunca corriera. Modo de
                // fallo: User-A logout → User-B login en mismo browser → datos
                // médicos cifrados de A persistían bajo `mealfit_form_secure`
                // hasta el primer clearFormStorage manual. Fallback null fuerza
                // el path "no last owner conocido" sin crash del provider.
                const lastOwner = safeLocalStorageGet('mealfit_last_form_owner', null);
                if (lastOwner && lastOwner !== 'guest' && lastOwner !== userId) {
                    // Los datos pertenecen a un usuario diferente, por lo que limpiamos para el usuario nuevo/diferente
                    // [P1-B7] limpiar AMBAS keys (public plain + secure cifrado).
                    // Sin esto, el secure cifrado del owner anterior sobreviviría
                    // y se intentaría descifrar con el access_token del nuevo
                    // usuario — fallaría al descifrar (clave HKDF distinta) pero
                    // ocupa storage y confunde la migración futura.
                    clearFormStorage();
                    setFormData(initialFormData);
                    // [P1-EDITED-FIELDS-XUSER · 2026-06-01] Vaciar el touched-set
                    // heredado de A. `editedFieldsRef` acumula todo campo que A tocó
                    // vía updateData() durante la vida del provider, y los 3 writers
                    // que hidratan el form desde la DB del nuevo usuario (fetchProfile/
                    // refreshProfileAndPlan/secureLoadFormData) EXCLUYEN del overlay
                    // cualquier key en el ref (`if (!edited.has(k))`). Sin este clear,
                    // los valores reales de B (age/weight/activityLevel/…) quedan
                    // bloqueados → B ve vacíos/defaults → findFirstIncompleteField
                    // dispara el toast falso "Falta completar X" + redirect a
                    // /assessment. Este path NO pasa por resetApp y el ref es in-memory
                    // (solo se vacía con remount real), así que hay que limpiarlo aquí,
                    // antes del fetchProfile(userId_B) del Promise.all de abajo.
                    editedFieldsRef.current.clear();
                    // [P1-XTAB-CACHE-LEAK · 2026-05-30] Re-login de un usuario
                    // DISTINTO sin logout previo limpio (cierre de tab / magic
                    // link / token switch) NO pasa por resetApp, así que aquí
                    // hay que limpiar lo mismo: caches global-keyed (inventario
                    // Nevera + listado Historial = PII de A) + el plan y los
                    // likes/dislikes de A. restoreSessionData(userId) re-hidrata
                    // los de B justo después.
                    _clearUserScopedCaches();
                    setPlanData(null);
                    safeLocalStorageRemove('mealfit_plan');
                    setLikedMeals({});
                    setDislikedMeals({});
                    safeLocalStorageRemove('mealfit_likes');
                    safeLocalStorageRemove('mealfit_dislikes');
                }
                safeLocalStorageSet('mealfit_last_form_owner', userId);

                // [P1-10] Marcamos profile como en-vuelo ANTES de los fetches.
                // El Promise.race + timeout de 5s garantiza que el flag baje
                // siempre, aunque alguno de los fetches cuelgue. Sin esto los
                // consumers (Plan.jsx vía `loadingSensitive`) podrían evaluar
                // `findFirstIncompleteField` con state hidratado a medias.
                setLoadingProfile(true);

                // Ejecutamos todo en paralelo, con un timeout de 5s para evitar bloqueo total
                const loadPromises = Promise.all([
                    fetchProfile(userId),
                    checkPlanLimit(userId),
                    restoreSessionData(userId)
                ]);

                let timeoutId;
                const timeoutPromise = new Promise((resolve) => {
                    timeoutId = setTimeout(() => {
                        console.warn("⚠️ Timeout cargando datos del usuario, forzando renderizado...");
                        resolve();
                    }, 5000);
                });

                try {
                    await Promise.race([loadPromises, timeoutPromise]);
                } finally {
                    clearTimeout(timeoutId);
                    // [P1-10] Liberamos siempre, sea por éxito, timeout, o
                    // excepción de cualquiera de los 3 fetches.
                    setLoadingProfile(false);
                }
            } else {
                // Logout / No sesión
                // [P2-LOCALSTORAGE-REMOVEITEM · 2026-05-15] safeLocalStorageRemove
                // (iOS Private Mode lanza SecurityError en removeItem y corta
                // la cadena de cleanup).
                setUserProfile(null);
                setPlanCount(0);
                setPlanData(null);
                // [P1-XTAB-CACHE-LEAK · 2026-05-30] Esta rama es alcanzable SIN
                // pasar por resetApp: un SIGNED_OUT disparado por el auth provider
                // (expiración de sesión/token, o sign-out desde OTRA pestaña).
                // resetApp limpia los caches global-keyed (inventario Nevera +
                // listado Historial = PII del usuario A) + likes/dislikes, pero
                // esta rama no lo hacía → quedaban en memoria mientras el
                // dispositivo seguía en /login o lo usaba un guest. Espejamos el
                // cleanup de resetApp para cerrar la misma ventana de fuga.
                _clearUserScopedCaches();
                setLikedMeals({});
                setDislikedMeals({});
                safeLocalStorageRemove('mealfit_likes');
                safeLocalStorageRemove('mealfit_dislikes');
                safeLocalStorageRemove('mealfit_user_id');
                safeLocalStorageRemove('mealfit_plan');
                safeLocalStorageRemove('mealfit_guest_session');
                // [P1-B7] Al cerrar sesión, borrar el secure storage cifrado:
                // sin access_token ya no podremos descifrarlo, así que dejarlo
                // ahí solo ocupa espacio. El public en `mealfit_form` se mantiene
                // por compat (un guest puede seguir usando los campos no
                // sensibles que llenó antes de cerrar sesión).
                try { localStorage.removeItem('mealfit_form_secure'); } catch { /* noop */ }
                setLoadingData(false);
                // [P1-10] Sin session no hay profile que hidratar.
                setLoadingProfile(false);
            }
            setLoadingAuth(false);
            setLoadingData(false); // Forzar a false para destrabar la UI
            
            // 🚀 Desvanecer Splash Screen nativo una vez React esté listo con la sesión
            setTimeout(() => {
                const splash = document.getElementById('pwa-splash');
                if (splash) {
                    splash.style.opacity = '0';
                    setTimeout(() => splash.remove(), 500);
                }
            }, 100); // Darle un mini-delay para que React pinte el ProtectedRoute o Dashboard
        };

        // Obtener sesión inicial con Timeout
        // [P1-NEON-AUTH-MIGRATION · 2026-06-13] Timeout 10s (era 5s): el SDK de
        // Neon Auth hace un fetch cross-origin al servicio de auth (us-east-1);
        // en redes lentas o con el servicio en cold-start, 5s tiraba a guest de
        // más. 10s da margen sin colgar la UI indefinidamente.
        const getSessionWithTimeout = () => {
            return Promise.race([
                authClient.auth.getSession(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout obteniendo sesión")), 10000))
            ]);
        };

        getSessionWithTimeout().then(({ data: { session: initialSession } }) => {
            handleAuthChange(initialSession);
        }).catch((err) => {
            console.warn("⚠️ Advertencia: No se pudo verificar la sesión (Neon Auth inalcanzable — posible fallo de red, firewall o DNS). Iniciando en modo offline/guest.");
            setLoadingAuth(false);
            setLoadingData(false);
            // [P1-10] Sin session verificable → NO hay profile que hidratar.
            // Sin esto, el flag arrancado heurísticamente como `true` (por
            // user_id en localStorage) quedaría colgado bloqueando consumers.
            setLoadingProfile(false);
            // Si falla la red, asumimos que no hay sesión temporalmente para no bloquear la app entera
            handleAuthChange(null);
        });

        // Escuchar cambios en tiempo real
        const {
            data: { subscription },
        } = authClient.auth.onAuthStateChange((_event, newSession) => {
            handleAuthChange(newSession);
        });

        return () => subscription.unsubscribe();

        // [P1-B9] `session` ya NO está en deps — leemos su valor vigente vía
        // `sessionRef.current` (sincronizado por un effect ligero arriba). Esto
        // asegura que el effect se monte UNA VEZ por proceso y la subscription
        // a `onAuthStateChange` viva todo el lifetime del provider, en lugar de
        // re-suscribirse cada vez que `setSession` se llamaba.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checkPlanLimit, restoreSessionData]);

    // --- REFETCH DE PERFIL AL VOLVER A LA PESTAÑA ---
    // [P1-NEON-DB-MIGRATION · 2026-06-12] Reemplaza el canal Realtime
    // `public:user_profiles` (la publicación Realtime murió con el cutover a
    // Neon — el SDK de auth anterior apunta al Postgres stale de Neon Auth). El callback
    // del canal solo disparaba un refetch del perfil, así que el reemplazo es
    // el patrón estándar del repo: refetch on visibilitychange/focus (mismo
    // patrón que Dashboard) + los refetch post-mutación existentes
    // (updateUserProfile actualiza el state local; upgradeUserPlan invoca
    // refreshProfileAndPlan explícito tras el verify de pago).
    useEffect(() => {
        const userId = session?.user?.id;
        if (!userId) return;

        const refreshProfileOnWake = () => {
            // 🔒 No sincronizar si hay un recálculo activo (paridad con el
            // guard que tenía el callback del canal Realtime).
            if (recalcLockRef.current) {
                console.log('🔒 [VISIBILITY] Bloqueado por recalcLock — ignorando refetch de perfil.');
                return;
            }
            // [P2-REALTIME-RESUB-ON-TOKEN-REFRESH · 2026-06-01] Vía ref para
            // no listar refreshProfileAndPlan en deps (ver nota arriba).
            refreshProfileAndPlanRef.current?.();
        };
        const handleVisibilityChange = () => {
            // visibilitychange también dispara al OCULTAR la pestaña: ignorar.
            if (document.visibilityState === 'visible') {
                refreshProfileOnWake();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', refreshProfileOnWake);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', refreshProfileOnWake);
        };
        // Dep estrechada a `session?.user?.id` (paridad con el canal previo):
        // no re-armar listeners en cada rotación de token de la misma cuenta.
        // (exhaustive-deps satisfecho: el handler solo usa refs + session?.user?.id.)
    }, [session?.user?.id]);

    // --- POLLING: Nuevas semanas del plan (Background Chunking) ---
    // [P1-NEON-DB-MIGRATION · 2026-06-12] Reemplaza el canal Realtime
    // `meal-plan-chunk-updates` (P2-REALTIME-PUB-SYNC quedó obsoleto: la
    // publicación `db_realtime` murió con el cutover a Neon). Polling
    // suave de GET /api/plans-data/latest cada 25s ÚNICAMENTE mientras el
    // plan en memoria está en un estado activo de generación — mismos 4
    // estados que el `_isActiveForChunkPoll` del Dashboard (partial /
    // generating / generating_next / rolling). Al llegar 'complete'/'failed'
    // el effect se desarma solo (generation_status ∈ deps) → cero polling
    // permanente. Se preserva el merge-al-state del canal original, incluido
    // el guard P2-REALTIME-PLAN-ID-GUARD.
    useEffect(() => {
        const userId = session?.user?.id;
        if (!userId) return;

        const localStatus = planData?.generation_status;
        const isGenerating = (
            localStatus === 'partial'
            || localStatus === 'generating'
            || localStatus === 'generating_next'
            || localStatus === 'rolling'
        );
        if (!isGenerating) return;

        // Flag de teardown: descarta respuestas in-flight que resuelvan
        // después de que el effect se re-armó (e.g. el merge anterior ya
        // marcó 'complete') — evita re-injertar un snapshot viejo.
        let cancelled = false;

        const pollLatestPlan = async () => {
            // Pausar el poll con la pestaña oculta (mismo patrón
            // P2-DASH-POLL-VISIBILITY del Dashboard); el tick siguiente
            // post-visibilidad recupera la frescura.
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            // 🔒 No pisar planData mientras un recalc local está en vuelo
            // (paridad con restoreSessionData).
            if (recalcLockRef.current) return;
            try {
                const resp = await fetchWithAuth('/api/plans-data/latest');
                if (cancelled || !resp.ok) return;
                const { plan } = await resp.json();
                if (cancelled) return;
                const newPlanData = plan?.plan_data;
                if (!newPlanData) return;

                const incomingStatus = newPlanData.generation_status;
                // Solo reaccionar si el plan tiene semanas siendo generadas
                // o acaba de completarse (paridad con el handler del canal).
                if (incomingStatus !== 'partial' && incomingStatus !== 'complete') return;

                setPlanData(prev => {
                    if (!prev) return newPlanData;
                    // [P2-REALTIME-PLAN-ID-GUARD · 2026-05-30] El poll trae el
                    // plan MÁS RECIENTE del usuario, que puede NO ser el plan
                    // activo en memoria (e.g. el usuario restauró un plan del
                    // Historial, o un plan nuevo nació en otra pestaña). Sin
                    // este guard, los `days` de ese otro plan se injertaban
                    // sobre el plan activo (que conserva su id/grocery_start_date/
                    // macros) y el estado fusionado corrupto se persistía a
                    // localStorage, sobreviviendo al reload. Solo cortocircuitamos
                    // cuando AMBOS ids existen y difieren, para que la ventana
                    // post-generación (donde prev.id aún es undefined) siga
                    // mezclando los chunks legítimos del plan activo.
                    if (prev.id && plan.id && prev.id !== plan.id) {
                        return prev;
                    }
                    // Mezclar: preservar campos locales (grocery_start_date, is_restocked, etc.)
                    // pero actualizar los días con el valor más reciente del servidor
                    const merged = {
                        ...prev,
                        days: newPlanData.days,
                        generation_status: incomingStatus,
                        total_days_requested: newPlanData.total_days_requested ?? prev.total_days_requested,
                    };
                    safeLocalStorageSet('mealfit_plan', merged);
                    return merged;
                });
            } catch (e) {
                // Blip de red — no es accionable; el próximo tick reintenta.
            }
        };

        const intervalId = setInterval(pollLatestPlan, 25000);
        // Primer tick inmediato: el canal push entregaba el chunk sin espera;
        // arrancar con un fetch evita perder hasta 25s de frescura.
        pollLatestPlan();

        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
        // Deps: uid + status del plan en memoria (gate del polling) + id del
        // plan activo (re-armar al cambiar de plan). El handler usa la forma
        // funcional de setPlanData + refs → sin closures stale sobre planData.
    }, [session?.user?.id, planData?.generation_status, planData?.id]);

    // --- FUNCIÓN PARA ACTUALIZAR PERFIL EN DB ---
    // [P1-NEON-DB-MIGRATION · 2026-06-12] UN SOLO `PATCH /api/profile`
    // reemplaza la RPC `update_health_profile_merge`, su fallback full-replace
    // (P1-FORM-9 — eliminado: el merge jsonb `||` ahora ocurre server-side
    // GARANTIZADO en el endpoint, sin path degradado) y el `.update()` de
    // columnas escalares:
    //   - `health_profile`: MERGE jsonb server-side (misma garantía anti-race
    //     que la RPC; primera línea de defensa sigue siendo
    //     `buildHealthProfilePayload` en el frontend).
    //   - `fields`: columnas escalares whitelisted ({full_name}). Las columnas
    //     de entitlement (plan_tier, subscription_*) son server-derived
    //     (I-Billing-1) — el backend rechaza con 400 cualquier campo fuera de
    //     la whitelist; NO añadir campos aquí sin extenderla primero.
    const updateUserProfile = async (updates) => {
        try {
            if (!session?.user) throw new Error('No hay sesión activa');

            const { health_profile: healthProfilePatch, ...rest } = updates || {};

            const body = {};
            if (
                healthProfilePatch
                && typeof healthProfilePatch === 'object'
                && Object.keys(healthProfilePatch).length > 0
            ) {
                body.health_profile = healthProfilePatch;
            }
            if (Object.keys(rest).length > 0) {
                body.fields = rest;
            }
            if (Object.keys(body).length === 0) {
                // Nada que actualizar — no-op (paridad con el path legacy, y
                // evita el 400 "Nada que actualizar" del backend).
                return { success: true };
            }

            const resp = await fetchWithAuth('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!resp.ok) {
                const errBody = await resp.json().catch(() => ({}));
                const detail = typeof errBody?.detail === 'string'
                    ? errBody.detail
                    : `PATCH /api/profile → HTTP ${resp.status}`;
                throw new Error(detail);
            }

            setUserProfile((prev) => ({ ...prev, ...updates }));
            return { success: true };
        } catch (error) {
            console.error('Error actualizando perfil:', error);
            return { success: false, error };
        }
    };

    // --- EFECTOS DE PERSISTENCIA LOCAL ---
    // [P1-B7] Persistencia segura: public en `mealfit_form` plain, sensitive
    // cifrado AES-GCM en `mealfit_form_secure` con clave HKDF derivada del
    // access_token. Para guests, sensitive solo en memoria. Async — fire-and-
    // forget; errores se loguean a consola dentro de `secureSaveFormData`.
    useEffect(() => {
        // [P1-PII-SAVE-RACE · 2026-05-31] NO persistir mientras la hidratación
        // del sensitive cifrado está en vuelo. Al llegar la session (login o page
        // reload con sesión activa), este effect dispara con `session` recién
        // cambiada PERO `formData` aún tiene los defaults vacíos de los campos
        // sensibles (allergies:[], medicalConditions:[], motivation:'', bodyFat:'',
        // dislikes:[], …). Guardar en ese instante cifraría esos vacíos sobre el
        // blob `mealfit_form_secure` válido → pérdida de datos médicos. El effect
        // de descifrado (abajo) baja `loadingSensitive` en su `finally`; entonces
        // este effect re-dispara (loadingSensitive ∈ deps) ya con el formData
        // hidratado y persiste lo correcto. Defensa-en-profundidad junto al
        // filtro `editedFieldsRef` que ya preserva edits in-flight del usuario.
        if (formData && !loadingSensitive) {
            secureSaveFormData(formData, session).catch(() => { /* logged dentro */ });
        }
    }, [formData, session, loadingSensitive]);

    // [P1-B7] Hidratación del sensitive cifrado al recibir session. Al login
    // (o page reload con sesión activa), descifra `mealfit_form_secure` y mergea
    // los campos sensibles al state actual. Sin session, no hace nada — el
    // sensitive queda con los defaults o lo que la migración legacy haya dejado.
    //
    // [P0-FORM-2] El descifrado es async (~50-200ms). Si el usuario edita un
    // campo sensible ANTES de que termine la hidratación, su edición se debe
    // preservar. La spread previa (`{...prev, ...sensitiveData}`) hacía que
    // `sensitiveData` ganara → bug de pérdida silenciosa de datos médicos.
    // Ahora filtramos `sensitiveData` excluyendo cualquier key que el usuario
    // tocó (registrada en `editedFieldsRef` desde `updateData`). Las
    // keys no tocadas se hidratan normalmente; las tocadas se preservan.
    useEffect(() => {
        // [P1-3] Sin session → no hay sensitive cifrado que descifrar. Bajamos
        // el flag inmediatamente para que los consumers (Plan.jsx,
        // useRegeneratePlan, InteractiveAssessmentFlow) no se queden esperando
        // una hidratación que nunca va a ocurrir. Cubre: usuarios guest,
        // usuarios que aún no han logged-in, sesiones expiradas tras token
        // refresh fallido.
        if (!session?.user) {
            setLoadingSensitive(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const { sensitiveData } = await secureLoadFormData(session);
                if (cancelled) return;
                if (!sensitiveData) return;
                const hasSensitive = Object.keys(sensitiveData).length > 0;
                if (!hasSensitive) return;
                // [P0-FORM-2] Filtra keys que el usuario ya editó in-flight.
                // El ref se lee aquí (después del await) — captura cualquier edit
                // que ocurrió DURANTE el descifrado. Compartido con P0-FORM-3.
                const edited = editedFieldsRef.current;
                const filtered = {};
                for (const [k, v] of Object.entries(sensitiveData)) {
                    if (!edited.has(k)) filtered[k] = v;
                }
                if (Object.keys(filtered).length === 0) return;
                setFormData(prev => ({ ...prev, ...filtered }));
            } finally {
                // [P1-3] Bajamos el flag SIEMPRE al terminar, sin importar el
                // outcome (éxito, sin sensitive, error de descifrado, token
                // rotado). El finally garantiza que un fallo silencioso de
                // `secureLoadFormData` no deje a los consumers atascados en
                // estado de carga indefinido. Si quedó cancelled (re-mount o
                // session change), no hace daño actualizar el state — el
                // próximo run del effect lo subirá de nuevo si hace falta.
                if (!cancelled) setLoadingSensitive(false);
            }
        })();
        return () => { cancelled = true; };
    }, [session?.user?.id, session?.access_token]);

    useEffect(() => {
        if (planData) safeLocalStorageSet('mealfit_plan', planData);
    }, [planData]);

    useEffect(() => {
        if (likedMeals) safeLocalStorageSet('mealfit_likes', likedMeals);
    }, [likedMeals]);

    useEffect(() => {
        if (dislikedMeals) safeLocalStorageSet('mealfit_dislikes', dislikedMeals);
    }, [dislikedMeals]);

    // --- LÓGICA DE NEGOCIO Y WEBHOOKS ---

    const toggleMealLike = async (mealName, mealType) => {
        const isCurrentlyLiked = !!likedMeals[mealName];

        setLikedMeals(prev => ({
            ...prev,
            [mealName]: !isCurrentlyLiked
        }));

        if (isCurrentlyLiked) return;

        try {
            const userId = session?.user?.id || safeLocalStorageGet('mealfit_user_id', null);

            if (!userId) {
                toast.error("Inicia sesión para guardar tus favoritos");
                setLikedMeals(prev => {
                    const newState = { ...prev };
                    delete newState[mealName];
                    return newState;
                });
                return;
            }

            const API_URL = '/api/plans/like';

            const response = await fetchWithAuth(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    meal_name: mealName,
                    meal_type: mealType
                })
            });

            if (!response.ok) {
                throw new Error(`El Agente IA respondió con error: ${response.status}`);
            }

        } catch (error) {
            console.error("❌ ERROR AL ENVIAR LIKE:", error);
            setLikedMeals(prev => {
                const newState = { ...prev };
                delete newState[mealName];
                return newState;
            });
        }
    };

    // --- REGENERACIÓN INTELIGENTE CON PERSISTENCIA DE DB ---
    const regenerateSingleMeal = async (dayIndex, mealIndex, mealType, currentName, swapReason = 'dislike', liveInventory = null) => {
        const planDays = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
        const currentMeals = planDays[dayIndex]?.meals || [];
        const targetCalories = currentMeals[mealIndex]?.cals || 400;
        const userDietType = formData.dietType || "balanced";
        const userId = session?.user?.id || safeLocalStorageGet('mealfit_user_id', null);

        // Extraer la lista de compra actual para RESTRINGIR las sugerencias del LLM a esta despensa
        let currentIngredients = [];
        planDays.forEach(day => {
            (day.meals || []).forEach(m => {
                if (m.ingredients && Array.isArray(m.ingredients)) {
                    // Safety net: Normalizar cada ingrediente a string limpio
                    // (protege contra cambios futuros de estructura a objetos)
                    const normalized = m.ingredients.map(ing => {
                        if (typeof ing === 'string') return ing;
                        if (typeof ing === 'object' && ing !== null) return ing.display_name || ing.name || ing.item_name || String(ing);
                        return String(ing);
                    }).filter(s => s && s.length > 2);
                    currentIngredients.push(...normalized);
                }
            });
        });

        try {
            // 1. LLAMADA A LA IA
            const API_SWAP_URL = '/api/plans/swap-meal';
            // [P1-FRONTEND-HARDEN · 2026-05-23] safeLocalStorageGet con fallback
            // 'guest_session' — el raw getItem en Private Mode lanzaba y abortaba
            // la swap-meal con TypeError sin que el caller pudiera distinguir
            // fallo de storage vs fallo de red. Fallback explícito preserva
            // semántica original ("|| 'guest_session'") sin path de excepción.
            const sessionId = safeLocalStorageGet('mealfit_user_id', 'guest_session');
            const response = await fetchWithAuth(API_SWAP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId || "guest",
                    session_id: sessionId,
                    // Siempre enviar el plato rechazado para dar contexto al LLM sobre qué plato reemplazar
                    rejected_meal: currentName,
                    swap_reason: swapReason,
                    meal_type: mealType,
                    target_calories: targetCalories,
                    diet_type: userDietType,
                    allergies: formData.allergies || [],
                    dislikes: formData.dislikes || [],
                    liked_meals: Object.keys(likedMeals || {}),
                    disliked_meals: Object.keys(dislikedMeals || {}),
                    current_pantry_ingredients: currentIngredients
                })
            });

            if (!response.ok) {
                // [P2-SWAP-422-UX-COPY · 2026-05-22 · revisado P3-SWAP-SOFT-FAIL-200 · 2026-05-23]
                // Path para 5xx / network errors. Los swap failures ahora vienen
                // como 200 con `swap_failed:true` flag (manejado abajo). Si llega
                // 422/4xx significa que el backend está corriendo en modo
                // legacy (knob MEALFIT_SWAP_HARD_FAIL_HTTP_422=true) — preservamos
                // el handler legacy como fallback de compatibility.
                let errorBody = null;
                try { errorBody = await response.json(); } catch (_) { /* body vacío o no-JSON */ }
                const code = errorBody?.detail?.code || null;
                const userMessage = errorBody?.detail?.message
                    || (typeof errorBody?.detail === 'string' ? errorBody.detail : null)
                    || "Error conectando con la IA";
                const err = new Error(userMessage);
                err.status = response.status;
                err.code = code;
                err.detailMessage = userMessage;
                throw err;
            }

            const newMealData = await response.json();

            // [P3-SWAP-SOFT-FAIL-200 · 2026-05-23] Backend retorna 200 con
            // flag `swap_failed:true` cuando el swap no produjo un plato real
            // (LLM agotó retries O strict-pantry sin inventario). Detectamos
            // ANTES de procesar como plato exitoso. Mismo UX que el 422
            // legacy (toast + preserva plato original) pero sin ruido rojo
            // en DevTools del browser.
            if (newMealData?.swap_failed === true) {
                const errCode = newMealData.error_code || 'unknown';
                const errMsg = newMealData.error_message || 'No se pudo generar una alternativa.';
                if (errCode === 'swap_strict_pantry_no_inventory') {
                    toast.error('Nevera vacía', { description: errMsg });
                } else if (errCode === 'swap_llm_retries_exhausted') {
                    toast.error('Chef IA sin alternativa', { description: errMsg });
                } else {
                    toast.error('No se pudo cambiar el plato', { description: errMsg });
                }
                return currentName;  // preserva plato original (NO setPlanData)
            }


            // 2. ACTUALIZAR ESTADO LOCAL
            const updatedPlan = { ...planData };
            
            // Retrocompatibilidad rápida al regenerar
            if (!updatedPlan.days) {
                 updatedPlan.days = [{ day: 1, meals: updatedPlan.meals || updatedPlan.perfectDay || [] }];
                 delete updatedPlan.meals;
                 delete updatedPlan.perfectDay;
            }

            const updatedDays = [...updatedPlan.days];
            const updatedDayObj = { ...updatedDays[dayIndex] };
            const updatedMeals = [...updatedDayObj.meals];

            updatedMeals[mealIndex] = {
                ...updatedMeals[mealIndex],
                name: newMealData.name,
                desc: newMealData.desc,
                cals: newMealData.cals,
                prep_time: newMealData.prep_time,
                recipe: newMealData.recipe || [],
                ingredients: newMealData.ingredients || [],
                // [P2-SWAP-RESET-ISEXPANDED · 2026-05-30] El plato nuevo trae su
                // receta base SIN expandir. Sin resetear `isExpanded`, el spread
                // de la comida vieja arrastraba `isExpanded:true` → el guard de
                // Recipes.jsx (`if (meal.isExpanded) return`) trataba la receta
                // base nueva como "ya expandida de chef" y jamás permitía
                // expandirla. Forzar false (también se persiste en new_meal).
                isExpanded: false
            };

            updatedDayObj.meals = updatedMeals;
            updatedDays[dayIndex] = updatedDayObj;
            updatedPlan.days = updatedDays;

            // Invalidar la lista pre-calculada para que el memo allPlanIngredients
            // recalcule desde los ingredientes actualizados del plan
            delete updatedPlan.aggregated_shopping_list;

            // [P0-1 FIX] "Punto ciego en Swaps Post-Restock":
            // Si el usuario ya registró sus compras (is_restocked=true) y luego rota un plato,
            // el nuevo plato puede requerir ingredientes que NO están en su nevera.
            // buildDeltaShoppingList suprime agresivamente esos ítems bajo isPostRestockRotation,
            // por lo que el usuario nunca sabría que le faltan. Aquí detectamos ese caso y
            // reseteamos is_restocked=false para que la lista de compras reaparezca solo
            // para los ingredientes verdaderamente nuevos.
            //
            // [P0-NEW-A · 2026-05-11] Capturamos el flag además de mutar
            // `updatedPlan.is_restocked` local: el backend lo aplicará en el
            // mismo UPDATE atómico (`clear_is_restocked: true`) para que la
            // mutación local y la persistida no diverjan tras lost-update.
            let clearIsRestockedFlag = false;
            if (updatedPlan.is_restocked && liveInventory && Array.isArray(liveInventory)) {
                const newIngredients = newMealData.ingredients || [];
                if (newIngredients.length > 0) {
                    // Normalizar nombres del inventario a lower-case para comparación rápida
                    const inventoryNames = new Set(
                        liveInventory
                            .filter(item => (parseFloat(item.quantity) || 0) > 0)
                            .map(item => (item.ingredient_name || '').toLowerCase().trim())
                    );

                    // Verificar si algún ingrediente del nuevo plato NO está en inventario
                    const hasUncoveredIngredient = newIngredients.some(ing => {
                        const ingName = (typeof ing === 'string' ? ing : (ing?.display_name || ing?.name || '')).toLowerCase().trim();
                        if (!ingName || ingName.length < 3) return false;
                        // Verificación simple de substring: si alguna llave del inventario contiene el ingrediente
                        return ![...inventoryNames].some(invName =>
                            invName.includes(ingName) || ingName.includes(invName)
                        );
                    });

                    if (hasUncoveredIngredient) {
                        // Resetear bandera para que la lista de compras muestre el delta faltante
                        updatedPlan.is_restocked = false;
                        clearIsRestockedFlag = true;
                        console.log('[P0-1] Swap post-restock introdujo ingredientes nuevos — is_restocked reseteado a false.');
                    }
                }
            }

            // Solo agregar a la lista de rechazos locales si es un dislike real
            if (swapReason === 'dislike') {
                setDislikedMeals(prev => ({
                    ...prev,
                    [currentName]: Date.now()
                }));
            }

            // [P3-SWAP-REVERT · 2026-05-30] Snapshot pre-swap para revertir si
            // la persistencia falla. `planData` NO se muta (updatedPlan y sus
            // days/meals son copias frescas vía spread), así que es un snapshot
            // válido del estado previo al swap.
            const prevPlanSnapshot = planData;
            // Actualizamos UI inmediatamente (optimista)
            setPlanData(updatedPlan);
            safeLocalStorageSet('mealfit_plan', updatedPlan);

            // 3. PERSISTENCIA ATÓMICA EN BACKEND
            // [P0-NEW-A · 2026-05-11] Reemplaza el patrón legacy
            // de escritura directa del JSONB completo desde el cliente. Ese patrón
            // producía lost-update si `_chunk_worker` finalizaba un chunk
            // entre el read del state local y el write — los `days[7-14]`
            // (y `_chunk_lessons`, `aggregated_shopping_list`, etc.) recién
            // persistidos por el worker se perdían.
            //
            // El nuevo endpoint `/api/plans/{plan_id}/swap-meal/persist`
            // hace `jsonb_set` quirúrgico sobre `days[dayIndex].meals[mealIndex]`
            // + bump `_plan_modified_at` + strip de aggregated_shopping_list*
            // + `AND user_id = %s` defense-in-depth, todo en un UPDATE
            // atómico. Mismo patrón que `/retry-chunk` y `/recipe/expand`.
            if (userId && userId !== 'guest') {
                try {
                    // a) Resolver plan_id activo (igual que pre-fix).
                    // [P1-NEON-DB-MIGRATION · 2026-06-12] SELECT id de
                    // meal_plans → GET /api/plans-data/latest?include_plan_data=false
                    // (payload liviano: solo resolvemos el id activo). Un
                    // status no-OK deja latestRow=null → se omite la
                    // persistencia (misma semántica que el error swallowed
                    // del cliente PostgREST previo).
                    const latestResp = await fetchWithAuth('/api/plans-data/latest?include_plan_data=false');
                    const latestRow = latestResp.ok ? (await latestResp.json())?.plan : null;

                    if (latestRow?.id) {
                        const planId = latestRow.id;

                        // b) POST atómico al backend. El body solo lleva el
                        //    delta (meal nuevo + índices) — el backend no
                        //    recibe el plan completo, eliminando la
                        //    superficie del lost-update.
                        const persistResponse = await fetchWithAuth(
                            `/api/plans/${planId}/swap-meal/persist`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    day_index: dayIndex,
                                    meal_index: mealIndex,
                                    new_meal: updatedMeals[mealIndex],
                                    clear_is_restocked: clearIsRestockedFlag,
                                }),
                            }
                        );

                        if (!persistResponse.ok) {
                            console.error('❌ Error /swap-meal/persist:', persistResponse.status);
                            // [P3-SWAP-REVERT · 2026-05-30] Revertir el optimistic
                            // update. Antes solo mostraba "el cambio es solo local"
                            // y dejaba el state divergente: el próximo
                            // restoreSessionData lo pisaba con la versión DB (vieja)
                            // → el swap desaparecía silenciosamente tras
                            // refresh/re-login. Restaurar deja el estado consistente
                            // con el backend.
                            setPlanData(prevPlanSnapshot);
                            safeLocalStorageSet('mealfit_plan', prevPlanSnapshot);
                            toast.error('No se pudo cambiar el plato', { description: 'Inténtalo de nuevo.' });
                        } else {
                            // GAP 3: Recalcular la lista de compras como un Delta Matemático
                            // [P3-RECALC-503-CLASSIFICATION · 2026-05-16] Retry 1× en
                            // 5xx/network — backend escala transient (pool/network) a 503;
                            // este recalc post-swap es no-crítico (swap ya persistió)
                            // pero el retry evita falsos console.error en blips.
                            try {
                                const recalcBody = JSON.stringify({
                                    user_id: userId,
                                    // [P2-NEW-B · 2026-05-11] plan_id explícito: el
                                    // swap acaba de persistirse contra `planId`,
                                    // garantizamos que el recalc opere sobre EL
                                    // MISMO plan (no `get_latest_meal_plan` que
                                    // bajo race con _chunk_worker podría apuntar
                                    // a plan B recién creado).
                                    plan_id: planId,
                                    householdSize: updatedPlan.calc_household_size || formData.householdSize || 1,
                                    groceryDuration: updatedPlan.calc_grocery_duration || formData.groceryDuration || 'weekly',
                                    is_new_plan: false
                                });
                                const attemptRecalc = async () => {
                                    try {
                                        const r = await fetchWithAuth('/api/plans/recalculate-shopping-list', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: recalcBody
                                        });
                                        return { res: r, networkError: null };
                                    } catch (e) {
                                        return { res: null, networkError: e };
                                    }
                                };
                                let { res: recalcResponse, networkError } = await attemptRecalc();
                                const isTransient = networkError || (recalcResponse && recalcResponse.status >= 500);
                                if (isTransient) {
                                    await new Promise((r) => setTimeout(r, 500));
                                    ({ res: recalcResponse, networkError } = await attemptRecalc());
                                }
                                if (networkError) throw networkError;

                                if (recalcResponse.ok) {
                                    const recalcData = await recalcResponse.json();
                                    if (recalcData.success && recalcData.plan_data) {
                                        setPlanData(recalcData.plan_data);
                                        safeLocalStorageSet('mealfit_plan', recalcData.plan_data);
                                        console.log("✅ [GAP 3] Lista de compras recalculada vía Delta Matemático tras modificar plato.");
                                        // [P2-AUDIT-NEW-1 · 2026-05-12] Consumir
                                        // `_coherence_warnings` post-swap-recalc.
                                        emitCoherenceToast(toast, recalcData._coherence_warnings);
                                    }
                                }
                            } catch (recalcErr) {
                                console.error("⚠️ Error recalculando lista de compras post-swap (tras retry):", recalcErr);
                            }
                        }
                    }
                } catch (dbError) {
                    console.error("❌ Fallo crítico persistencia swap:", dbError);
                    // [P3-SWAP-REVERT · 2026-05-30] Revertir ante excepción de
                    // red/persistencia (misma divergencia que el branch !ok). Si
                    // el backend SÍ persistió pero se perdió la respuesta, el
                    // próximo restoreSessionData mostrará el valor nuevo desde DB
                    // → revertir local es seguro (DB es SSOT).
                    setPlanData(prevPlanSnapshot);
                    safeLocalStorageSet('mealfit_plan', prevPlanSnapshot);
                    toast.error('No se pudo cambiar el plato', { description: 'Revisa tu conexión e inténtalo de nuevo.' });
                }
            }

            // Actualizar créditos en tiempo real después de regenerar exitosamente
            setTimeout(async () => {
                await checkPlanLimit();
            }, 1000);

            return newMealData.name;

        } catch (error) {
            // [P2-SWAP-422-UX-COPY · 2026-05-22] Si el backend rechazó por
            // strict-pantry sin inventario, NO degradar a fallback local
            // (que produciría un plato genérico ignorando la razón del user).
            // Mostrar toast con el copy específico y preservar el plato actual.
            if (error?.status === 422 && error?.code === 'swap_strict_pantry_no_inventory') {
                toast.error('Nevera vacía', { description: error.detailMessage });
                return currentName;
            }

            // [P3-SWAP-LLM-RETRIES-422 · 2026-05-23] El backend ya NO emite
            // un "Plato Fallback" engañoso cuando el LLM agota retries —
            // ahora devuelve 422 con code='swap_llm_retries_exhausted'.
            // Preserva el plato original (NO setPlanData) y muestra toast
            // amigable con el copy del backend.
            if (error?.status === 422 && error?.code === 'swap_llm_retries_exhausted') {
                toast.error('Chef IA sin alternativa', { description: error.detailMessage });
                return currentName;
            }

            // CORRECCIÓN DEL ERROR DE LINTER: Usamos la variable 'error'
            console.error("❌ Falló IA, usando fallback local...", error);

            // Fallback Local
            const localFallback = getAlternativeMeal(mealType, currentName, targetCalories, userDietType);

            const updatedPlan = { ...planData };
            if (!updatedPlan.days) {
                 updatedPlan.days = [{ day: 1, meals: updatedPlan.meals || updatedPlan.perfectDay || [] }];
                 delete updatedPlan.meals;
                 delete updatedPlan.perfectDay;
            }

            const updatedDays = [...updatedPlan.days];
            const updatedDayObj = { ...updatedDays[dayIndex] };
            const updatedMeals = [...updatedDayObj.meals];

            updatedMeals[mealIndex] = {
                ...updatedMeals[mealIndex],
                name: localFallback.name,
                desc: localFallback.desc,
                cals: localFallback.cals,
                recipe: localFallback.recipe
            };
            
            updatedDayObj.meals = updatedMeals;
            updatedDays[dayIndex] = updatedDayObj;
            updatedPlan.days = updatedDays;

            setPlanData(updatedPlan);
            return localFallback.name;
        }
    };

    const updateData = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        safeLocalStorageSet('mealfit_last_form_owner', session?.user?.id || 'guest');
        // [P0-FORM-2 + P0-FORM-3] Marca el campo como tocado para que ningún
        // writer async lo sobrescriba con valor stale. Cubre TRES consumidores:
        //   1. Hidratación cifrada de `mealfit_form_secure` (post-login).
        //   2. `fetchProfile` vía GET /api/profile (carga inicial del perfil).
        //   3. `refreshProfileAndPlan` disparado por el listener de
        //      visibilitychange/focus (ediciones desde otra pestaña, cron,
        //      admin — antes canal Realtime, P1-NEON-DB-MIGRATION).
        // Tracking universal — los campos public también pueden ser pisados
        // por `fetchProfile`/`refreshProfileAndPlan` ya que el spread
        // `{...prev, ...health_profile}` los incluía sin filtro.
        editedFieldsRef.current.add(field);
    };

    const saveGeneratedPlan = async (data) => {
        setPlanData(data);
        // [P3-SAVEPLAN-LS-SYNC · 2026-05-30] Persistir `mealfit_plan` SÍNCRONO aquí,
        // igual que TODAS las hermanas de guardado (restorePlan/restoreFromHistory/
        // recalc rollback). Pre-fix `saveGeneratedPlan` era la ÚNICA ruta que confiaba
        // sólo en el `useEffect [planData]` (línea ~1259) para escribir localStorage.
        // El effect SÍ dispara (el Provider no se desmonta al navegar a /dashboard),
        // así que no había bug observable — pero dejaba una ventana teórica sub-paint
        // entre `setPlanData` y el commit del effect: si el usuario recargaba ahí,
        // `restoreSessionData` leía un `cycle_start_date` stale de localStorage antes
        // de healearlo vía /grocery-start-date. Escribir síncrono aquí cierra la
        // ventana y unifica el patrón con el resto de save paths (cero riesgo: el
        // useEffect re-escribe el mismo valor en el próximo commit). `data` ya trae
        // `cycle_start_date`/`grocery_start_date` inyectados por Plan.jsx.
        safeLocalStorageSet('mealfit_plan', data);
        // [P1-B8] NO limpiar likedMeals al aceptar un plan nuevo. Los likes son
        // meta-state user-level que se construye con el tiempo y persiste server-side
        // (vía `/api/plans/like`). Antes este `setLikedMeals({})` provocaba:
        //   - Flicker visible: corazones vacíos en el dashboard hasta que
        //     `restoreSessionData` rehidrataba desde el backend.
        //   - Race con clicks tempranos: si el usuario hacía like inmediatamente
        //     tras aceptar, se escribía sobre el state vacío y se perdían
        //     likes históricos cargados después.
        // Si un like anterior corresponde a un plato que ya no aparece en el
        // plan actual, la UI simplemente no lo renderiza (no se ven likes
        // huérfanos), pero el like permanece para futuros planes que reusen
        // el nombre del plato — comportamiento user-friendly.

        // NOTA: NO guardamos en Neon Auth aquí.
        // El backend ya lo hace en _save_plan_and_track_background() con datos más completos
        // (meal_names, ingredients, techniques, frequency tracking).
        // Guardarlo aquí también causaba duplicados en el historial.

        // [P3-DOC-1 · 2026-05-11] Señal cross-tab para que `History.jsx`
        // bypassee su threshold de 60s en el listener `visibilitychange`.
        // ANTES vivía en `Plan.jsx::savePlanToHistory` (eliminada por
        // P3-DOC-1 — dead code, 0 callers). Acá es el callsite real
        // post-SSE-success: cuando llegamos a `saveGeneratedPlan`, el
        // backend ya invocó `_save_plan_and_track_background` y el plan
        // está persistido. Sin esta señal, un usuario que ya tenía
        // /history abierto en otra pestaña y vuelve dentro de los 60s
        // ve el listado pre-mutación. P0-HIST-NEW-2 contract preserved.
        // [P2-AUDIT-3 · 2026-05-15] Helper SSOT atrapa SecurityError +
        // QuotaExceededError silenciosamente; el try/catch inline previo
        // quedó como ejemplo del patrón ad-hoc que el helper subsume.
        safeLocalStorageSet('mealfit_history_dirty_at', String(Date.now()));

        setTimeout(async () => {
            await checkPlanLimit();
        }, 2000);
    };

    const restorePlan = async (pastPlanData, expectedUserId = null) => {
        if (!pastPlanData) return;

        // [P1-NEW-4 · 2026-05-11] Guard de ownership defensive (client-side IDOR
        // read-only). Si el caller proporciona `expectedUserId` (típicamente el
        // `user_id` de la fila del Historial), verificar contra la sesión actual
        // ANTES de pisar el state local. Backend ya tiene IDOR guards en
        // mutaciones (`.eq('user_id', userId)` más abajo + `.eq('id', planId)`),
        // pero un deeplink/fetch interceptado que pase plan ajeno al callsite
        // local pisaría `setPlanData` con contenido cross-user hasta el próximo
        // refresh — UX confunde. Defensa-en-profundidad client-side:
        if (expectedUserId) {
            const _currentUid = session?.user?.id || safeLocalStorageGet('mealfit_user_id', null);
            if (_currentUid && _currentUid !== expectedUserId) {
                console.warn(
                    '[P1-NEW-4] restorePlan: ownership mismatch — ' +
                    `expected user_id=${expectedUserId}, current session=${_currentUid}. ` +
                    'Abortando para evitar pintar plan ajeno en el UI.'
                );
                try {
                    toast.error('No se pudo restaurar el plan (sesión inválida).');
                } catch (_toastErr) { /* toast es best-effort */ }
                return;
            }
        }

        // 1. Actualizar estado local inmediatamente
        setPlanData(pastPlanData);
        // [P1-B8] NO limpiar likedMeals al restaurar un plan del historial.
        // Mismo razonamiento que `saveGeneratedPlan`: los likes son user-level
        // y persisten server-side. Restaurar un plan viejo no debería resetear
        // los gustos acumulados del usuario; si el plato del like no existe en
        // el plan restaurado, la UI simplemente no lo muestra (sin perder el
        // dato para planes futuros).
        safeLocalStorageSet('mealfit_plan', pastPlanData);

        // 2. Sincronizar con Neon Auth para que cloud sync no lo revierta
        const userId = session?.user?.id || safeLocalStorageGet('mealfit_user_id', null);
        if (userId && userId !== 'guest') {
            try {
                // Obtener el plan más reciente del usuario
                // [P1-NEON-DB-MIGRATION · 2026-06-12] SELECT id de meal_plans
                // → GET /api/plans-data/latest?include_plan_data=false (solo
                // resolvemos el id; el backend filtra user_id desde el token).
                const latestResp = await fetchWithAuth('/api/plans-data/latest?include_plan_data=false');
                const latestRow = latestResp.ok ? (await latestResp.json())?.plan : null;

                if (latestRow?.id) {
                    const planId = latestRow.id;

                    // [P0-HIST-2 · 2026-05-09] Además de `plan_data`,
                    // sobrescribir las columnas top-level críticas para el
                    // header (Dashboard.jsx lee `name/calories/macros`
                    // directo de la fila, no del jsonb). Sin esto, revertir
                    // un regen rechazado restauraba los días pero el header
                    // seguía mostrando el nombre/calorías/macros del plan
                    // rechazado → drift visible.
                    //
                    // Derivamos solo lo seguro de `pastPlanData`:
                    //   - name: jsonb top-level "name".
                    //   - calories: jsonb "calories" o "totalCalories".
                    //   - macros: jsonb "macros" si es un objeto.
                    // `meal_names/ingredients/techniques` son derivados
                    // server-side en _save_plan_and_track_background y NO
                    // viajan en plan_data. Recalcularlos client-side
                    // tendría drift; los dejamos al próximo save.
                    //
                    // Para restauración desde Historial (con id) usar
                    // `restorePlanFromHistory` (P0-HIST-1) en lugar de este
                    // path: el endpoint atómico backend cubre las 6
                    // columnas + cancel chunks + lock release.
                    //
                    // [P1-OPEN-1 · 2026-05-11] Migrado al endpoint backend
                    // atómico `POST /api/plans/{plan_id}/restore-local` para
                    // cerrar la última violación de invariante I6 (CLAUDE.md):
                    // direct-write desde cliente a `meal_plans`. Pre-fix
                    // este bloque hacía una escritura directa de
                    // `{plan_data, name, calories, macros}` que producía
                    // lost-update vs `_chunk_worker` concurrente
                    // (mismo modo de fallo que P0-NEW-A cerró para swap-meal,
                    // P0-NEW-B para grocery-start-date, P1-HIST-5 para rename).
                    // El endpoint nuevo toma advisory lock 'general' antes del
                    // UPDATE (I7) y filtra `AND user_id = %s` (I2).
                    const restoreBody = { plan_data: pastPlanData };
                    if (typeof pastPlanData?.name === 'string' && pastPlanData.name.trim()) {
                        restoreBody.name = pastPlanData.name;
                    }
                    const _calories = pastPlanData?.calories ?? pastPlanData?.totalCalories;
                    if (typeof _calories === 'number' && Number.isFinite(_calories)) {
                        restoreBody.calories = _calories;
                    }
                    if (
                        pastPlanData?.macros &&
                        typeof pastPlanData.macros === 'object' &&
                        !Array.isArray(pastPlanData.macros)
                    ) {
                        restoreBody.macros = pastPlanData.macros;
                    }

                    const restoreResp = await fetchWithAuth(
                        `/api/plans/${planId}/restore-local`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(restoreBody),
                        },
                    );

                    if (!restoreResp.ok) {
                        const errBody = await restoreResp.json().catch(() => ({}));
                        console.error(
                            '❌ Error sincronizando plan restaurado:',
                            restoreResp.status,
                            errBody,
                        );
                        toast.warning('Plan restaurado localmente', {
                            description: 'No se pudo sincronizar con la nube.',
                        });
                    }
                }
            } catch (dbError) {
                console.error('❌ Error de DB al restaurar plan:', dbError);
            }
        }
    };

    // [P0-HIST-1 · 2026-05-09] Restauración atómica desde Historial.
    // `restorePlan` (arriba) sigue cubriendo los call-sites de Plan.jsx y
    // Recipes.jsx que reviven un plan_data sin `id` (e.g., revertir una
    // regeneración rechazada usando state local). Para el flujo del
    // Historial donde existe el `id` del plan archivado, esta función
    // delega al endpoint backend `/api/plans/restore`, que en una sola
    // transacción:
    //   1. Cancela chunks pending/processing del target → cierra el bug
    //      de "workers continúan generando días con pipeline_snapshot
    //      del plan anterior y los mergean al plan_data restaurado".
    //   2. Libera chunk_user_locks del target (locks zombi bloqueaban
    //      la siguiente generación).
    //   3. Sobrescribe plan_data Y las 6 columnas top-level
    //      (name/calories/macros/meal_names/ingredients/techniques) →
    //      cierra P0-HIST-2 (drift entre plan_data y header del
    //      Dashboard que las lee directo).
    //   4. Anota `_plan_modified_at` y `_restored_from_plan_id`.
    const restorePlanFromHistory = async (pastPlanRow) => {
        if (!pastPlanRow || !pastPlanRow.id) {
            // Sin id no podemos llamar al endpoint. El caller debió
            // pasar el row completo (no solo plan_data). Caemos al
            // legacy local-only para no romper edge cases.
            return restorePlan(pastPlanRow?.plan_data || pastPlanRow);
        }

        // [P1-NEW-4 · 2026-05-11] [P1-NEW-8 · 2026-05-11] Guard de
        // ownership defensive (P1-NEW-4) extendido para rechazar user_id
        // falsy (legacy null, row corrupta) — P1-NEW-8.
        {
            const _currentUid = session?.user?.id || safeLocalStorageGet('mealfit_user_id', null);
            if (
                _currentUid &&
                _currentUid !== 'guest' &&
                (!pastPlanRow.user_id || pastPlanRow.user_id !== _currentUid)
            ) {
                console.warn(
                    '[P1-NEW-4] [P1-NEW-8] restorePlanFromHistory: ownership mismatch — ' +
                    `row.user_id=${pastPlanRow.user_id}, current=${_currentUid}. ` +
                    'Abortando (no pintar plan ajeno o sin owner en UI).'
                );
                try {
                    toast.error('No se pudo restaurar el plan (sesión inválida).');
                } catch (_toastErr) { /* toast es best-effort */ }
                return { success: false, error: 'ownership_mismatch' };
            }
        }

        const pastPlanData = pastPlanRow.plan_data;

        // 1. Estado local primero (UI inmediata).
        setPlanData(pastPlanData);
        safeLocalStorageSet('mealfit_plan', pastPlanData);

        // 2. Endpoint atómico (cancel chunks + release locks + UPDATE).
        const userId = session?.user?.id || safeLocalStorageGet('mealfit_user_id', null);
        if (!userId || userId === 'guest') {
            // Guest sin userId: solo local-state. No hay nada que
            // sincronizar server-side.
            return { success: true, noop: true, guest: true };
        }

        try {
            const response = await restorePlanFromHistoryApi(pastPlanRow.id);
            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                console.error('❌ Error en restore endpoint:', response.status, errBody);
                toast.warning('Plan restaurado localmente', {
                    description: 'No se pudo sincronizar con la nube.'
                });
                return { success: false, status: response.status, error: errBody };
            }
            return await response.json();
        } catch (apiError) {
            console.error('❌ Error de red al restaurar plan:', apiError);
            toast.warning('Plan restaurado localmente', {
                description: 'No se pudo sincronizar con la nube.'
            });
            return { success: false, error: String(apiError) };
        }
    };

    const nextStep = () => {
        setDirection(1);
        setCurrentStep((prev) => {
            const next = prev + 1;
            setMaxReachedStep((max) => Math.max(max, next));
            return next;
        });
    };
    const prevStep = () => { setDirection(-1); setCurrentStep((prev) => Math.max(0, prev - 1)); };

    const resetApp = async () => {
        // NO limpiamos mealfit_form para que tras cerrar sesión,
        // los datos no sensibles sigan presentes para invitados, pero sí se
        // limpiarán al entrar con otra cuenta.
        // [P2-LOCALSTORAGE-REMOVEITEM · 2026-05-15] safeLocalStorageRemove
        // — la cadena pre-fix usaba `localStorage.removeItem` raw para 7
        // keys; iOS Private Mode (SecurityError) corta el flujo en cualquier
        // call, quedando el reset parcial (algunas keys borradas, otras no
        // → state inconsistente post-signout).
        // [P1-B7] Sí limpiamos el secure storage cifrado: sin access_token ya
        // no podremos descifrarlo, así que se descarta para no ocupar espacio.
        safeLocalStorageRemove('mealfit_form_secure');
        safeLocalStorageRemove('mealfit_plan');
        safeLocalStorageRemove('mealfit_likes');
        safeLocalStorageRemove('mealfit_user_id');
        safeLocalStorageRemove('mealfit_guest_session');
        safeLocalStorageRemove('mealfit_guest_sessions_list');
        safeLocalStorageRemove('mealfit_current_session');
        safeLocalStorageRemove('mealfit_dislikes');
        // [P1-GUEST-KEY-HYGIENE · 2026-06-15] Las keys del modo invitado de PLAN
        // (mealfit_guest_mode / _session_id / _credits_used) son distintas de las
        // del chat (mealfit_guest_session / _sessions_list, arriba). Limpiarlas en
        // el logout real deja el dispositivo sin rastro de la identidad efímera.
        clearGuestModeStorage();
        // [P1-XTAB-CACHE-LEAK · 2026-05-30] Limpiar caches global-keyed
        // (inventario Nevera + listado Historial + ingredientes deshabilitados)
        // que NO están scopeadas por user_id y sobrevivirían al logout SPA →
        // leak cross-user en dispositivo compartido.
        _clearUserScopedCaches();

        // [P3-RESETAPP-SIGNOUT-GUARD · 2026-05-30] Todo el teardown de PII
        // (localStorage + caches) ya corrió ARRIBA de forma síncrona, así que
        // el leak cross-user está cerrado pase lo que pase con signOut. Pero si
        // `signOut()` rechaza (red caída), sin este try/catch la promesa de
        // resetApp se rechazaba y los setters de React de abajo NUNCA corrían →
        // planData/userProfile en memoria sobrevivían hasta el próximo remount.
        // Toleramos el fallo de red para que el reset de estado siempre proceda.
        try {
            await authClient.auth.signOut();
        } catch (e) {
            console.warn('signOut() falló; el teardown local ya se completó.', e);
        }

        setPlanData(null);
        setLikedMeals({});
        setDislikedMeals({});
        setUserProfile(null);
        setPlanCount(0);
        setCurrentStep(0);
        setMaxReachedStep(0);
        setLoadingData(false);
    };

    // [P1-GUEST-LOGOUT · 2026-06-15] "Cerrar sesión" de un INVITADO. Como no hay
    // sesión en el servidor, es un teardown puramente local: sale del modo
    // invitado (flag + créditos), borra TODO el progreso efímero (form/plan/likes
    // + caches user-scoped) para no dejar datos en un dispositivo compartido, y
    // resetea el state de React. NO llama signOut (no hay sesión que cerrar) y NO
    // es async. El caller navega a /login después.
    const exitGuestSession = useCallback(() => {
        safeLocalStorageRemove('mealfit_form');
        safeLocalStorageRemove('mealfit_form_secure');
        safeLocalStorageRemove('mealfit_plan');
        safeLocalStorageRemove('mealfit_likes');
        safeLocalStorageRemove('mealfit_dislikes');
        safeLocalStorageRemove('mealfit_user_id');
        safeLocalStorageRemove('mealfit_guest_session_id');
        safeLocalStorageRemove('mealfit_current_session');
        safeLocalStorageRemove('mealfit_last_form_owner');
        exitGuestMode(); // limpia mealfit_guest_mode + mealfit_guest_credits_used
        _clearUserScopedCaches();
        setFormData(initialFormData);
        setPlanData(null);
        setLikedMeals({});
        setDislikedMeals({});
        setUserProfile(null);
        setPlanCount(0);
        setCurrentStep(0);
        setMaxReachedStep(0);
        editedFieldsRef.current.clear();
        setGuestFlag(false);
        setGuestCreditsUsed(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const upgradeUserPlan = async (tier = 'plus', subscriptionId = null) => {
        try {
            const userId = session?.user?.id || safeLocalStorageGet('mealfit_user_id', null);
            if (!userId) throw new Error("No user ID");


            if (subscriptionId) {
                // Validación Segura B2B con nuestro Backend
                toast.loading('Verificando tu pago. Por favor espera...', { id: 'payment-verify' });
                const response = await fetchWithAuth('/api/subscription/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        subscriptionID: subscriptionId,
                        tier: tier
                    })
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || "Fallo en la verificación del pago en el servidor.");
                }
                
                toast.success('Pago verificado exitosamente.', { id: 'payment-verify' });

                // [P5-SPEED-UPGRADE-PARALLEL · 2026-06-01] Recargar perfil + créditos en
                // paralelo: refreshProfileAndPlan (SELECT user_profiles) y checkPlanLimit
                // (GET /api/user/credits) son independientes; antes corrían en serie
                // (2 roundtrips secuenciales tras el verify). Promise.all los solapa.
                // Cada uno tiene su propio try/catch interno → un fallo en uno no corrompe
                // el estado del otro. Se ejecuta aquí (antes era checkPlanLimit más abajo)
                // porque el único camino que llega al post-verify es esta rama.
                await Promise.all([refreshProfileAndPlan(), checkPlanLimit(userId)]);

            } else {
                // [P0-TIER-RLS-LOCK · 2026-05-31] Eliminado el client-side write de
                // `plan_tier` (la vieja rama "admin bypass"). Otorgar el tier desde el
                // navegador evade TODO el billing server-side (I-Billing-1): el tier
                // DEBE derivarse de PayPal en `/api/subscription/verify` (rama de
                // arriba), nunca escribirse desde el cliente. La RLS de `user_profiles`
                // permitía a un usuario escribir su propio `plan_tier` (UPDATE de
                // cualquier columna de su fila) → escalación de tier desde la consola.
                // Cerrado a nivel DB por el trigger `trg_guard_user_profiles_entitlement`
                // (migración SSOT `p0_user_profiles_entitlement_lock_2026_05_31.sql`),
                // y aquí se elimina el surface client-side por defensa-en-profundidad.
                // Fail-closed: un upgrade sin `subscriptionId` es un error de
                // programación, no un bypass legítimo.
                throw new Error(
                    'upgradeUserPlan requiere un subscriptionId de PayPal verificado; ' +
                    'el tier no puede otorgarse desde el cliente (P0-TIER-RLS-LOCK).'
                );
            }

            // [P5-SPEED-UPGRADE-PARALLEL · 2026-06-01] checkPlanLimit ya se ejecutó en
            // paralelo con refreshProfileAndPlan dentro de la rama de verify (arriba).

            const planNames = { basic: 'Mealfit Básico', plus: 'Mealfit Plus', ultra: 'Mealfit Ultra Ilimitado' };
            const planName = planNames[tier] || 'Mealfit Plus';
            
            toast.success(`¡Bienvenido a ${planName}!`, {
                description: 'Has desbloqueado acceso premium.',
                duration: 5000,
                icon: '🌟'
            });
            return true;
        } catch (error) {
            console.error("Error upgrading user:", error);
            toast.error(error.message || 'Error al actualizar perfil');
            toast.dismiss('payment-verify');
            return false;
        }
    };

    const isPremium = ['basic', 'plus', 'admin', 'ultra'].includes(userProfile?.plan_tier);

    let userPlanLimit = PLAN_LIMIT;
    if (userProfile?.plan_tier === 'basic') userPlanLimit = 50;
    else if (userProfile?.plan_tier === 'plus') userPlanLimit = 200;
    else if (['ultra', 'admin'].includes(userProfile?.plan_tier)) userPlanLimit = 'Ilimitado';

    // [P1-GUEST-MODE · 2026-06-15] Para invitados los créditos vienen del
    // contador local (GUEST_PLAN_CREDITS), no del backend. `isGuest` es true
    // SOLO sin sesión real + flag activo (un login válido siempre gana).
    const isGuest = !session && guestFlag;
    const effectivePlanLimit = isGuest ? GUEST_PLAN_CREDITS : userPlanLimit;
    const effectivePlanCount = isGuest ? guestCreditsUsed : planCount;
    const effectiveRemaining = isGuest
        ? Math.max(0, GUEST_PLAN_CREDITS - guestCreditsUsed)
        : (typeof userPlanLimit === 'number' ? Math.max(0, userPlanLimit - planCount) : '∞');

    return (
        <AssessmentContext.Provider value={{
            session,
            loadingAuth,
            loadingData,
            // [P1-3 + P1-10] Hidratación pendiente del formData post-login.
            // Combina dos sources de hidratación async:
            //   - `loadingSensitive`: descifrado de `mealfit_form_secure`
            //     (sensitive cifrado con clave HKDF derivada del access_token,
            //     50-200ms).
            //   - `loadingProfile`: fetch de `user_profiles.health_profile`
            //     desde el backend + restoreSessionData + checkPlanLimit
            //     (100-500ms en primer login en otro dispositivo).
            // Consumers (Plan.jsx, useRegeneratePlan, InteractiveAssessmentFlow)
            // deben gatear con `if (loadingSensitive) return;` antes de llamar a
            // `findFirstIncompleteField` o renderizar Navigate. Sin gate, la
            // ventana post-login produce falsos positivos ("Falta completar X")
            // con datos que SÍ están en storage cifrado o en DB pero aún no
            // llegaron al state.
            loadingSensitive: loadingSensitive || loadingProfile,
            userProfile,
            updateUserProfile,
            currentStep,
            setCurrentStep,
            maxReachedStep,
            setMaxReachedStep,
            direction,
            nextStep,
            prevStep,
            formData,
            updateData,
            planData,
            setPlanData,
            saveGeneratedPlan,
            likedMeals,
            toggleMealLike,
            dislikedMeals,
            regenerateSingleMeal,
            resetApp,
            planCount: effectivePlanCount,
            PLAN_LIMIT,
            userPlanLimit: effectivePlanLimit,
            checkPlanLimit,
            isPremium,
            remainingCredits: effectiveRemaining,
            // [P1-GUEST-MODE · 2026-06-15] Modo invitado (funnel del plan gratuito
            // sin cuenta). Consumers: ProtectedRoute (allowlist de rutas), Login
            // (botón "Probar sin cuenta"), Dashboard (oculta "en camino" + CTA
            // crear cuenta), Plan.jsx (consume crédito al generar).
            isGuest,
            activateGuestMode,
            consumeGuestCredit,
            exitGuestSession,
            upgradeUserPlan,
            restorePlan,
            // [P0-HIST-1 · 2026-05-09] Variante atómica para Historial.
            // Caller debe pasar el row completo (con `id`) para que el
            // endpoint pueda autorizar y resolver source/target.
            restorePlanFromHistory,
            refreshProfileAndPlan,
            restoreSessionData,
            setRecalcLock,
            withRecalcLock
        }}>
            {children}
        </AssessmentContext.Provider>
    );
};

AssessmentProvider.propTypes = { children: PropTypes.node.isRequired };

// eslint-disable-next-line react-refresh/only-export-components
export const useAssessment = () => useContext(AssessmentContext);