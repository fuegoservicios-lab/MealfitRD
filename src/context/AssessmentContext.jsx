import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabase';
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
import { fetchWithAuth } from '../config/api';
// [P1-B7] Storage seguro para datos sensibles del formulario.
import {
    saveFormData as secureSaveFormData,
    loadFormData as secureLoadFormData,
    migrateLegacyFormStorage,
    clearFormStorage,
} from '../config/secureFormStorage';

const AssessmentContext = createContext();

export const AssessmentProvider = ({ children }) => {
    // 1. CARGAR DATOS PERSISTENTES (LocalStorage)
    const savedPlan = localStorage.getItem('mealfit_plan');
    // [P1-B7] Migración legacy ANTES de leer `mealfit_form`. Si el storage tenía
    // sensitive mezclado con public (formato pre-fix), `migrateLegacyFormStorage`
    // separa: deja public en `mealfit_form` (lo que leeremos abajo) y nos
    // devuelve sensitive en memoria. La persistencia cifrada del sensitive
    // ocurrirá en el primer `useEffect` cuando haya session disponible.
    const _legacyMigration = migrateLegacyFormStorage();
    const _legacySensitive = _legacyMigration?.sensitiveData || null;
    const savedForm = localStorage.getItem('mealfit_form');
    const savedLikes = localStorage.getItem('mealfit_likes');

    // --- ESTADOS DE LA APLICACIÓN ---

    // Auth State (Supabase)
    const [session, setSession] = useState(null);
    const [loadingAuth, setLoadingAuth] = useState(true);

    // Estado para saber si estamos sincronizando datos de la DB
    const [loadingData, setLoadingData] = useState(true);

    // Estado del Perfil Real (Base de Datos Supabase)
    const [userProfile, setUserProfile] = useState(null);

    // Navegación del Wizard (Pasos de la evaluación)
    const [currentStep, setCurrentStep] = useState(0);
    const [direction, setDirection] = useState(0);
    const [maxReachedStep, setMaxReachedStep] = useState(0);

    // Datos del Plan Generado (JSON devuelto por la IA)
    const [planData, setPlanData] = useState(savedPlan ? JSON.parse(savedPlan) : null);

    // Estado de Likes Persistente { "NombrePlato": true }
    const [likedMeals, setLikedMeals] = useState(savedLikes ? JSON.parse(savedLikes) : {});

    // Estado de Dislikes Persistente (permanente — sin expiración)
    const savedDislikes = localStorage.getItem('mealfit_dislikes');
    const [dislikedMeals, setDislikedMeals] = useState(() => {
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
        if (typeof navigator === 'undefined') return 'lb';
        const lang = (navigator.language || '').toLowerCase();
        if (lang.startsWith('en-us') || lang.startsWith('en-lr') || lang.startsWith('my')) {
            return 'lb';
        }
        return 'kg';
    };

    const initialFormData = {
        age: '', gender: '', height: '', weight: '', weightUnit: _getDefaultWeightUnit(), bodyFat: '', activityLevel: '',
        sleepHours: '', stressLevel: '', cookingTime: '', budget: '', scheduleType: '',
        dietType: '', allergies: [], dislikes: [], medicalConditions: [], otherAllergies: '',
        mainGoal: '', motivation: '', struggles: [], skipLunch: false,
        // [P0-FORM-2] Persiste si el usuario ya tomó la decisión EXPLÍCITA sobre
        // skipLunch (toggle clickeado en QHousehold). Antes, `editedFieldsRef`
        // protegía la edición solo dentro de UNA sesión (in-memory). Tras
        // refresh/remount, un usuario que toggleó skipLunch=true en sesión 1
        // perdía la protección y la hidratación post-login desde DB
        // (`fetchProfile`, `secureLoadFormData`) podía sobreescribir con el
        // valor stale del DB → backend generaba 4 comidas en vez de 3 →
        // distribución de macros rota. Este flag persiste a localStorage junto
        // con skipLunch; un useEffect al mount re-puebla `editedFieldsRef`
        // con 'skipLunch' si está true, garantizando que la decisión sobreviva
        // remounts, refreshes, y hidratación async post-login.
        _skipLunchTouched: false,
        // [P1-FORM-3] Mismo patrón que `_skipLunchTouched` para `weightUnit`.
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
        includeSupplements: false, selectedSupplements: [], groceryDuration: 'weekly', householdSize: 1,
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
    const _parsedSavedForm = (() => {
        if (!savedForm) return null;
        try { return JSON.parse(savedForm); } catch { return null; }
    })();
    const [formData, setFormData] = useState({
        ...initialFormData,
        ...(_parsedSavedForm || {}),
        ...(_legacySensitive || {}),
    });

    // --- ESTADO PARA LOS CRÉDITOS ---
    const [planCount, setPlanCount] = useState(0);
    const PLAN_LIMIT = 15; // Límite del plan gratuito

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
    //   - [P0-FORM-3] Fetch de `user_profiles.health_profile` desde Supabase
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
    // Cubre actualmente: skipLunch (P0-FORM-2), weightUnit (P1-FORM-3).
    useEffect(() => {
        if (formData?._skipLunchTouched === true) {
            editedFieldsRef.current.add('skipLunch');
        }
        if (formData?._weightUnitTouched === true) {
            editedFieldsRef.current.add('weightUnit');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setRecalcLock = useCallback((val) => {
        // Siempre cancelar el timer pendiente: evita que un timer huérfano
        // libere prematuramente un lock futuro.
        if (recalcSafetyTimerRef.current) {
            clearTimeout(recalcSafetyTimerRef.current);
            recalcSafetyTimerRef.current = null;
        }
        recalcLockRef.current = !!val;
        if (val) {
            // Safety net: si por alguna razón el caller no libera el lock
            // (excepción no atrapada, unmount, etc.), 15s después se libera
            // automáticamente. `withRecalcLock` debería ser el camino normal —
            // este timer solo cubre fallos del path manual.
            recalcSafetyTimerRef.current = setTimeout(() => {
                recalcLockRef.current = false;
                recalcSafetyTimerRef.current = null;
                console.warn('🔒 [RECALC LOCK] Safety timer (15s) liberó el lock — el caller olvidó setRecalcLock(false). Migrar a withRecalcLock.');
            }, 15000);
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
            // 1. Buscar el último plan creado por este usuario en Supabase
            const { data: plans, error } = await supabase
                .from('meal_plans')
                .select('id, plan_data, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (plans && plans.length > 0) {
                const latestPlan = plans[0].plan_data;
                const planCreatedAt = plans[0].created_at;
                const planId = plans[0].id;

                // FIX: Asegurar que el plan de la BD tenga una fecha de inicio de compras para el contador de Dashboard
                let didInjectGroceryDate = false;
                if (!latestPlan.grocery_start_date) {
                    const localSaved = localStorage.getItem('mealfit_plan');
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
                    const localSaved = localStorage.getItem('mealfit_plan');
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
                const localSavedForCompare = localStorage.getItem('mealfit_plan');

                let localSavedParsed = null;
                if (localSavedForCompare) {
                    try {
                        localSavedParsed = JSON.parse(localSavedForCompare);
                    } catch(e) {
                        console.warn("⚠️ Error parseando plan local, forzando sincronización con la nube.");
                    }
                }

                // Solo actualizamos si el plan en la nube es diferente al local
                if (!localSavedParsed || JSON.stringify(localSavedParsed) !== JSON.stringify(latestPlan)) {

                    setPlanData(latestPlan);
                    localStorage.setItem('mealfit_plan', JSON.stringify(latestPlan));
                } else {

                }

                // Guardar la fecha en DB para persistencia cruzada (si se inyectó)
                if (didInjectGroceryDate && userId && userId !== 'guest') {
                    supabase.from('meal_plans').update({ plan_data: latestPlan }).eq('id', planId).then((res) => {
                        if (res.error) console.error('Error sincronizando fecha inicio despensa', res.error);
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
            const userId = specificUserId || session?.user?.id || localStorage.getItem('mealfit_user_id');

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
    }, [session]);

    // --- 2. MANEJO DE SESIÓN Y PERFIL (SUPABASE) ---
    const fetchProfile = useCallback(async (userId) => {
        try {
            const { data } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();

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
        const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');
        if (userId) {
            try {
                const { data } = await supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (data) {
                    setUserProfile(data);

                    if (data.health_profile && Object.keys(data.health_profile).length > 0) {
                        // [P0-FORM-3] Mismo filtro que `fetchProfile`. Este path
                        // corre desde el canal Realtime de `user_profiles` (línea
                        // ~692) y desde `upgradeUserPlan` tras pagos. Sin este
                        // filtro, un UPDATE Realtime que llega mientras el
                        // usuario edita el wizard hacía que el snapshot del DB
                        // GANARA sobre la edición in-flight (regresión silenciosa
                        // de P0-FORM-3 que solo se había aplicado en
                        // `fetchProfile`). `recalcLockRef` solo cubre recálculo
                        // de plan, no edición de wizard, así que no protege esta
                        // ventana. Los campos tocados se preservan; los no
                        // tocados sí se hidratan.
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
    }, [session]);

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

    useEffect(() => {
        const handleAuthChange = async (currentSession) => {
            // Evitar actualizaciones innecesarias si la sesión es idéntica.
            // [P1-B9] Leemos del ref en vez de cerrar sobre `session` para
            // poder remover `session` del array de deps de este effect.
            const prevSession = sessionRef.current;
            if (prevSession?.user?.id && currentSession?.user?.id && prevSession.user.id === currentSession.user.id) {
                return;
            }

            setSession(currentSession);

            if (currentSession?.user) {
                const userId = currentSession.user.id;
                localStorage.setItem('mealfit_user_id', userId);

                const lastOwner = localStorage.getItem('mealfit_last_form_owner');
                if (lastOwner && lastOwner !== 'guest' && lastOwner !== userId) {
                    // Los datos pertenecen a un usuario diferente, por lo que limpiamos para el usuario nuevo/diferente
                    // [P1-B7] limpiar AMBAS keys (public plain + secure cifrado).
                    // Sin esto, el secure cifrado del owner anterior sobreviviría
                    // y se intentaría descifrar con el access_token del nuevo
                    // usuario — fallaría al descifrar (clave HKDF distinta) pero
                    // ocupa storage y confunde la migración futura.
                    clearFormStorage();
                    setFormData(initialFormData);
                }
                localStorage.setItem('mealfit_last_form_owner', userId);

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

                await Promise.race([loadPromises, timeoutPromise]);
                clearTimeout(timeoutId);
            } else {
                // Logout / No sesión
                setUserProfile(null);
                setPlanCount(0);
                setPlanData(null);
                localStorage.removeItem('mealfit_user_id');
                localStorage.removeItem('mealfit_plan');
                localStorage.removeItem('mealfit_guest_session');
                // [P1-B7] Al cerrar sesión, borrar el secure storage cifrado:
                // sin access_token ya no podremos descifrarlo, así que dejarlo
                // ahí solo ocupa espacio. El public en `mealfit_form` se mantiene
                // por compat (un guest puede seguir usando los campos no
                // sensibles que llenó antes de cerrar sesión).
                try { localStorage.removeItem('mealfit_form_secure'); } catch { /* noop */ }
                setLoadingData(false);
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
        const getSessionWithTimeout = () => {
            return Promise.race([
                supabase.auth.getSession(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout obteniendo sesión")), 5000))
            ]);
        };

        getSessionWithTimeout().then(({ data: { session: initialSession } }) => {
            handleAuthChange(initialSession);
        }).catch((err) => {
            console.warn("⚠️ Advertencia: No se pudo verificar la sesión de Supabase (posible fallo de red o DNS). Iniciando en modo offline/guest.");
            setLoadingAuth(false);
            setLoadingData(false);
            // Si falla la red, asumimos que no hay sesión temporalmente para no bloquear la app entera
            handleAuthChange(null);
        });

        // Escuchar cambios en tiempo real
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, newSession) => {
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

    // --- ESCUCHA DE SUPABASE REALTIME (Actualizaciones de la IA) ---
    useEffect(() => {
        const userId = session?.user?.id;
        if (!userId) return;



        const profileSubscription = supabase
            .channel('public:user_profiles')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'user_profiles',
                    filter: `id=eq.${userId}`
                },
                (payload) => {
                    // 🔒 No sincronizar si hay un recálculo activo
                    if (recalcLockRef.current) {
                        console.log('🔒 [REALTIME] Bloqueado por recalcLock — ignorando actualización de perfil.');
                        return;
                    }
                    // Disparar sincronización mágica
                    refreshProfileAndPlan();
                }
            )
            .subscribe();

        return () => {

            supabase.removeChannel(profileSubscription);
        };
    }, [session, refreshProfileAndPlan]);

    // --- ESCUCHA REALTIME: Nuevas semanas del plan (Background Chunking) ---
    useEffect(() => {
        const userId = session?.user?.id;
        if (!userId) return;

        const planChunkSubscription = supabase
            .channel('meal-plan-chunk-updates')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'meal_plans',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    const newPlanData = payload.new?.plan_data;
                    if (!newPlanData) return;

                    const incomingStatus = newPlanData.generation_status;
                    // Solo reaccionar si el plan tiene semanas siendo generadas
                    if (incomingStatus !== 'partial' && incomingStatus !== 'complete') return;

                    setPlanData(prev => {
                        if (!prev) return newPlanData;
                        // Mezclar: preservar campos locales (grocery_start_date, is_restocked, etc.)
                        // pero actualizar los días con el valor más reciente del servidor
                        const merged = {
                            ...prev,
                            days: newPlanData.days,
                            generation_status: incomingStatus,
                            total_days_requested: newPlanData.total_days_requested ?? prev.total_days_requested,
                        };
                        localStorage.setItem('mealfit_plan', JSON.stringify(merged));
                        return merged;
                    });
                }
            )
            .subscribe();

        return () => supabase.removeChannel(planChunkSubscription);
    }, [session]);

    // --- FUNCIÓN PARA ACTUALIZAR PERFIL EN DB ---
    // [P1-FORM-9] Si el caller pasa `health_profile`, lo enrutamos por la RPC
    // `update_health_profile_merge` (definida en
    // `supabase/migrations/p1_form_9_health_profile_jsonb_merge.sql`) que
    // aplica un MERGE jsonb (`||`) en lugar de reemplazo total. Esto es la
    // segunda línea de defensa contra el race de hidratación cifrada — la
    // primera la pone `buildHealthProfilePayload` en el frontend.
    //
    // Otros campos (full_name, plan_tier, etc.) siguen el camino tradicional
    // `.update()` porque no son JSONB y reemplazar es el comportamiento
    // correcto para columnas escalares.
    //
    // Si la RPC no está disponible (migración no desplegada todavía o
    // ambiente que la elimina), caemos al `.update()` tradicional con
    // warning — preservamos disponibilidad funcional aunque perdamos la
    // garantía de merge. Operadores ven el warning y saben que falta
    // aplicar la migración.
    const updateUserProfile = async (updates) => {
        try {
            if (!session?.user) throw new Error('No hay sesión activa');

            const { health_profile: healthProfilePatch, ...rest } = updates || {};

            // [P1-FORM-9] Path 1: health_profile via RPC (jsonb merge).
            if (healthProfilePatch && typeof healthProfilePatch === 'object') {
                const { error: rpcError } = await supabase.rpc(
                    'update_health_profile_merge',
                    { patch: healthProfilePatch }
                );
                if (rpcError) {
                    // Fallback: la migración aún no se aplicó o la RPC fue
                    // dropeada. Caemos al patrón antiguo con warning visible
                    // para que el equipo de ops detecte la falla en producción
                    // y aplique la migración pendiente.
                    console.warn(
                        '[P1-FORM-9] RPC update_health_profile_merge falló — '
                        + 'cayendo a UPDATE tradicional (sin merge garantizado). '
                        + 'Verificar que la migración esté aplicada. Error:',
                        rpcError
                    );
                    const { error: fallbackError } = await supabase
                        .from('user_profiles')
                        .update({ health_profile: healthProfilePatch })
                        .eq('id', session.user.id);
                    if (fallbackError) throw fallbackError;
                }
            }

            // [P1-FORM-9] Path 2: campos escalares (full_name, etc.) via update tradicional.
            if (Object.keys(rest).length > 0) {
                const { error } = await supabase
                    .from('user_profiles')
                    .update(rest)
                    .eq('id', session.user.id);
                if (error) throw error;
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
        if (formData) {
            secureSaveFormData(formData, session).catch(() => { /* logged dentro */ });
        }
    }, [formData, session]);

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
        if (!session?.user) return;
        let cancelled = false;
        (async () => {
            const { sensitiveData } = await secureLoadFormData(session);
            if (cancelled || !sensitiveData) return;
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
        })();
        return () => { cancelled = true; };
    }, [session?.user?.id, session?.access_token]);

    useEffect(() => {
        if (planData) localStorage.setItem('mealfit_plan', JSON.stringify(planData));
    }, [planData]);

    useEffect(() => {
        if (likedMeals) localStorage.setItem('mealfit_likes', JSON.stringify(likedMeals));
    }, [likedMeals]);

    useEffect(() => {
        if (dislikedMeals) localStorage.setItem('mealfit_dislikes', JSON.stringify(dislikedMeals));
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
            const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');

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
        const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');

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
            const sessionId = localStorage.getItem('mealfit_user_id') || 'guest_session';
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

            if (!response.ok) throw new Error("Error conectando con la IA");

            const newMealData = await response.json();


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
                ingredients: newMealData.ingredients || []
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

            // Actualizamos UI inmediatamente
            setPlanData(updatedPlan);
            localStorage.setItem('mealfit_plan', JSON.stringify(updatedPlan));

            // 3. PERSISTENCIA EN SUPABASE (CRÍTICO)
            if (userId && userId !== 'guest') {
                try {
                    // a) Obtener el ID del plan actual (el más reciente)
                    const { data: latestRows } = await supabase
                        .from('meal_plans')
                        .select('id')
                        .eq('user_id', userId)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (latestRows && latestRows.length > 0) {
                        const planId = latestRows[0].id;


                        // b) Ejecutar UPDATE del campo plan_data
                        const { error: updateError } = await supabase
                            .from('meal_plans')
                            .update({ plan_data: updatedPlan }) // Guardamos el JSON modificado
                            .eq('id', planId);

                        if (updateError) {
                            console.error("❌ Error Supabase UPDATE:", updateError);
                            toast.error("Error de sincronización", { description: "El cambio es solo local." });
                        } else {
                            // GAP 3: Recalcular la lista de compras como un Delta Matemático
                            try {
                                const recalcResponse = await fetchWithAuth('/api/plans/recalculate-shopping-list', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        user_id: userId,
                                        householdSize: updatedPlan.calc_household_size || formData.householdSize || 1,
                                        groceryDuration: updatedPlan.calc_grocery_duration || formData.groceryDuration || 'weekly',
                                        is_new_plan: false
                                    })
                                });
                                
                                if (recalcResponse.ok) {
                                    const recalcData = await recalcResponse.json();
                                    if (recalcData.success && recalcData.plan_data) {
                                        setPlanData(recalcData.plan_data);
                                        localStorage.setItem('mealfit_plan', JSON.stringify(recalcData.plan_data));
                                        console.log("✅ [GAP 3] Lista de compras recalculada vía Delta Matemático tras modificar plato.");
                                    }
                                }
                            } catch (recalcErr) {
                                console.error("⚠️ Error recalculando lista de compras post-swap:", recalcErr);
                            }
                        }
                    }
                } catch (dbError) {
                    console.error("❌ Fallo crítico DB:", dbError);
                }
            }

            // Actualizar créditos en tiempo real después de regenerar exitosamente
            setTimeout(async () => {
                await checkPlanLimit();
            }, 1000);

            return newMealData.name;

        } catch (error) {
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
        localStorage.setItem('mealfit_last_form_owner', session?.user?.id || 'guest');
        // [P0-FORM-2 + P0-FORM-3] Marca el campo como tocado para que ningún
        // writer async lo sobrescriba con valor stale. Cubre TRES consumidores:
        //   1. Hidratación cifrada de `mealfit_form_secure` (post-login).
        //   2. `fetchProfile` desde Supabase (carga inicial del perfil).
        //   3. `refreshProfileAndPlan` disparado por el canal Realtime de
        //      `user_profiles` (ediciones desde otra pestaña, cron, admin).
        // Tracking universal — los campos public también pueden ser pisados
        // por `fetchProfile`/`refreshProfileAndPlan` ya que el spread
        // `{...prev, ...health_profile}` los incluía sin filtro.
        editedFieldsRef.current.add(field);
    };

    const saveGeneratedPlan = async (data) => {
        setPlanData(data);
        // [P1-B8] NO limpiar likedMeals al aceptar un plan nuevo. Los likes son
        // meta-state user-level que se construye con el tiempo y persiste server-side
        // (vía `/api/plans/like`). Antes este `setLikedMeals({})` provocaba:
        //   - Flicker visible: corazones vacíos en el dashboard hasta que
        //     `restoreSessionData` rehidrataba desde Supabase.
        //   - Race con clicks tempranos: si el usuario hacía like inmediatamente
        //     tras aceptar, se escribía sobre el state vacío y se perdían
        //     likes históricos cargados después.
        // Si un like anterior corresponde a un plato que ya no aparece en el
        // plan actual, la UI simplemente no lo renderiza (no se ven likes
        // huérfanos), pero el like permanece para futuros planes que reusen
        // el nombre del plato — comportamiento user-friendly.

        // NOTA: NO guardamos en Supabase aquí.
        // El backend ya lo hace en _save_plan_and_track_background() con datos más completos
        // (meal_names, ingredients, techniques, frequency tracking).
        // Guardarlo aquí también causaba duplicados en el historial.

        setTimeout(async () => {
            await checkPlanLimit();
        }, 2000);
    };

    const restorePlan = async (pastPlanData) => {
        if (!pastPlanData) return;

        // 1. Actualizar estado local inmediatamente
        setPlanData(pastPlanData);
        // [P1-B8] NO limpiar likedMeals al restaurar un plan del historial.
        // Mismo razonamiento que `saveGeneratedPlan`: los likes son user-level
        // y persisten server-side. Restaurar un plan viejo no debería resetear
        // los gustos acumulados del usuario; si el plato del like no existe en
        // el plan restaurado, la UI simplemente no lo muestra (sin perder el
        // dato para planes futuros).
        localStorage.setItem('mealfit_plan', JSON.stringify(pastPlanData));

        // 2. Sincronizar con Supabase para que cloud sync no lo revierta
        const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');
        if (userId && userId !== 'guest') {
            try {
                // Obtener el plan más reciente del usuario
                const { data: latestRows } = await supabase
                    .from('meal_plans')
                    .select('id')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (latestRows && latestRows.length > 0) {
                    const planId = latestRows[0].id;

                    // Actualizar el plan_data del registro más reciente
                    const { error: updateError } = await supabase
                        .from('meal_plans')
                        .update({ plan_data: pastPlanData })
                        .eq('id', planId);

                    if (updateError) {
                        console.error('❌ Error sincronizando plan restaurado:', updateError);
                        toast.warning('Plan restaurado localmente', {
                            description: 'No se pudo sincronizar con la nube.'
                        });
                    } else {

                    }
                }
            } catch (dbError) {
                console.error('❌ Error de DB al restaurar plan:', dbError);
            }
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
        // [P1-B7] Sí limpiamos el secure storage cifrado: sin access_token ya
        // no podremos descifrarlo, así que se descarta para no ocupar espacio.
        try { localStorage.removeItem('mealfit_form_secure'); } catch { /* noop */ }
        localStorage.removeItem('mealfit_plan');
        localStorage.removeItem('mealfit_likes');
        localStorage.removeItem('mealfit_user_id');
        localStorage.removeItem('mealfit_guest_session');
        localStorage.removeItem('mealfit_guest_sessions_list');
        localStorage.removeItem('mealfit_current_session');
        localStorage.removeItem('mealfit_dislikes');

        await supabase.auth.signOut();

        setPlanData(null);
        setLikedMeals({});
        setDislikedMeals({});
        setUserProfile(null);
        setPlanCount(0);
        setCurrentStep(0);
        setMaxReachedStep(0);
        setLoadingData(false);
    };

    const upgradeUserPlan = async (tier = 'plus', subscriptionId = null) => {
        try {
            const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');
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
                
                // Recargar el perfil desde la base de datos ya que el servidor hizo el UPDATE
                await refreshProfileAndPlan();
                
            } else {
                // Caso antiguo o admin bypass
                console.warn("⚠️ Bypass de suscripción llamado (Sin ID de suscripción).");
                const { error } = await supabase
                    .from('user_profiles')
                    .update({
                        plan_tier: tier,
                        updated_at: new Date()
                    })
                    .eq('id', userId);
                if (error) throw error;
                setUserProfile(prev => ({ ...prev, plan_tier: tier }));
            }

            await checkPlanLimit(userId);
            
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

    return (
        <AssessmentContext.Provider value={{
            session,
            loadingAuth,
            loadingData,
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
            planCount,
            PLAN_LIMIT,
            userPlanLimit,
            checkPlanLimit,
            isPremium,
            remainingCredits: typeof userPlanLimit === 'number' ? Math.max(0, userPlanLimit - planCount) : '∞',
            upgradeUserPlan,
            restorePlan,
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