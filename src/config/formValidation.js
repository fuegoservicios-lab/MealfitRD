// [P1-B6] Validación cliente-side del formData del wizard de assessment.
//
// Este módulo es la fuente de verdad ÚNICA en el frontend para los campos
// requeridos por el backend. Antes, cada call site (Plan.jsx, Settings.jsx
// vía useRegeneratePlan, InteractiveAssessmentFlow) tenía su propio check
// con un subconjunto distinto:
//   - InteractiveAssessmentFlow.onFinish (P0-B3): valida los 6 completos.
//   - Plan.jsx useEffect: valida solo `age && mainGoal` (4 menos!).
//   - useRegeneratePlan: valida solo `age && mainGoal`.
// Resultado: un usuario que perdió `gender` en localStorage podía pasar
// `Plan.jsx` o disparar regenerate, llegar al backend, y recibir un 422
// "missing_required_fields" tras quemar el check de cuota — UX rota.
//
// Ahora todos los call sites importan `REQUIRED_FORM_FIELDS` y
// `findFirstIncompleteField` de aquí. Si un campo se agrega/quita del
// backend (`_REQUIRED_FORM_FIELDS` en `backend/routers/plans.py:155`),
// SOLO hay que actualizarlo en este archivo.
//
// El 422 del backend se mantiene como red de seguridad para clientes no
// oficiales (mobile legacy, scrapers, requests directos).

// Lista alineada con `_REQUIRED_FORM_FIELDS` en `backend/routers/plans.py`.
// Mantener en el mismo orden — `findFirstIncompleteField` lo usa para
// devolver consistentemente el mismo "primer faltante" en cada llamada.
//
// [P0-FORM-4] `weightUnit` añadido como required. Antes el backend defaulteaba
// a "lb" en silencio si el campo venía ausente (cliente legacy, hidratación
// rota desde DB). Si el usuario había ingresado kg, el cálculo nutricional
// resultaba en BMR completamente errado SIN disparar el chequeo de rango.
// Ahora el backend rechaza con 422 `missing_required_fields` y este array es
// la fuente de verdad del frontend para detectar el faltante antes del POST.
//
// [P0-FORM-1] `householdSize` y `groceryDuration` añadidos como required.
// Antes el backend defaulteaba silenciosamente a 1 persona / "weekly" si los
// campos venían ausentes (hidratación rota desde localStorage, cliente legacy,
// estado del form wipeado mid-flow). Resultado: lista de compras escalada para
// 1 cuando el usuario eligió 4 → faltante crítico de comida → plan inservible.
// El step QHousehold (índice 8) ya bloquea el botón "Siguiente" si están
// vacíos, pero esta capa cubre los call sites de Plan.jsx y useRegeneratePlan.
//
// [P0-FORM-3] `motivation` añadido como required. ANTES era un campo huérfano:
// se capturaba en QMotivation, se persistía a `health_profile`, se enviaba al
// pipeline, pero NINGÚN consumer del backend lo leía → promesa rota al usuario
// (subtitle: "será tu gasolina en días difíciles"). AHORA `build_motivation_context`
// lo inyecta al planner + day generator del LLM como contexto emocional para
// tono y descripciones de platos. La validación frontend (`findFirstIncompleteField`
// hace `v.trim() === ''`) bloquea submits con whitespace-only antes de quemar
// quota; el backend rechaza con 422 si el cliente lo omite.
//
// [P1-2] Cierre del gap de "asterisco rojo en title sin enforcement".
// ANTES: 10 steps del wizard (QSchedule, QSleep, QStress, QCookingTime,
// QBudget, QDietType, QAllergies, QDislikes, QMedical, QStruggles) tenían
// `*` rojo en su title pero NO estaban en este array. Resultado: el botón
// "Saltar a la última pregunta" (`InteractiveAssessmentFlow:275-290`) los
// bypaseaba porque su único guard era `findFirstIncompleteField`, que solo
// itera este array. Para los 4 multi-select chip-based (allergies,
// dislikes, medicalConditions, struggles) el bypass tenía RIESGO DE SAFETY
// MÉDICA: el backend interpreta `[]` como "sin restricciones", así que un
// usuario que perdió su respuesta de allergies en localStorage y skipeó
// terminaba con un plan posiblemente conteniendo su alérgeno.
//
// AHORA todos los steps con asterisco están aquí. Para los array fields,
// `findFirstIncompleteField` ya trata `[]` como ausente (`Array.isArray(v)
// && v.length === 0`) — el sentinel "Ninguna"/"Ninguno" cuenta como answer
// válida porque su length=1. Para los radio fields (auto-advance), `''` ya
// se trata como ausente.
//
// Orden importante: REQUIRED_FORM_FIELDS se itera en orden y
// `findFirstIncompleteField` retorna el PRIMER faltante. Mantener el orden
// alineado con el flujo del wizard hace que la nav-a-faltante lleve al
// usuario al step más temprano que necesita atención (mejor UX que saltar
// al último).
//
// [P0-FORM-6] Defense-in-depth backend: el array de abajo está SINCRONIZADO
// con `_REQUIRED_FORM_FIELDS` en `backend/routers/plans.py`. Antes existía
// drift: el frontend gateaba 19 campos pero el backend solo validaba ~12,
// así que un cliente legacy / hidratación rota / scraper saltaba el wizard
// y entraba al pipeline con señales vacías de timing/conducta → plan
// degradado sin alerta. Hoy ambos lados validan el mismo set excepto
// `dietType`, que queda fuera del backend por compat con perfiles legacy
// (variantes ES en `health_profile.dietType`: "Omnívora", "vegetariana",
// etc.); para ese campo el wizard sigue siendo el único gate, y downstream
// el catálogo balanced cubre el caso ausente sin riesgo.
//
// Si se añade un nuevo campo aquí, agregarlo también a
// `_REQUIRED_FORM_FIELDS` del backend o el test
// `backend/test_p0_form_6_required_fields_sync.py` falla intencionalmente.
//
// [P3-NEW-10 · 2026-05-11] [FORM-DRIFT-ANCHOR] Contrato de sync
// bidireccional entre este array y el backend:
//   - Backend SSOT: `backend/routers/plans.py:_REQUIRED_FORM_FIELDS`.
//   - Test que enforza la simetría: `backend/tests/test_p0_form_6_required_fields_sync.py`
//     (parsea ESTE archivo con regex Y compara contra el set backend).
//   - Excepciones documentadas: `dietType` (solo frontend, compat legacy).
//   - Convención de orden: alineado con el flujo del wizard para que
//     `findFirstIncompleteField` lleve al usuario al step más temprano.
//
// Grep-anchor para frontend devs: si modificas este array, grep por
// `[FORM-DRIFT-ANCHOR]` para encontrar TODA la documentación.
//
// Total actual: 20 campos. El conteo histórico que aparece en este header
// ("6 completos" en P0-B3, "19 campos" en el drift documentado de P0-FORM-6)
// refleja el estado pre-fix; no actualizar esos números — son evidencia
// narrativa del problema que se cerró. La cifra autoritativa es la longitud
// del array de abajo (`REQUIRED_FORM_FIELDS.length`).
export const REQUIRED_FORM_FIELDS = [
    'gender', 'age', 'height', 'weight', 'weightUnit', 'activityLevel',
    'scheduleType', 'sleepHours', 'stressLevel', 'cookingTime', 'budget',
    'householdSize', 'groceryDuration',
    // [P3-NEW-4 · 2026-05-11] `dietType` está aquí pero el backend
    // `_REQUIRED_FORM_FIELDS` (`routers/plans.py:234`) lo OMITE
    // intencional. Asimetría documentada:
    //   - Frontend: required (wizard UX — el usuario debe elegir entre
    //     balanced/keto/vegetarian/etc; sin selección, "Siguiente"
    //     bloqueado).
    //   - Backend: opcional (legacy compat — perfiles antiguos sin
    //     dietType cargados desde DB siguen funcionando con default
    //     `"balanced"` en graph_orchestrator.py:8058).
    // El test `test_p0_form_6_required_fields_sync.py:225` whitelista
    // esta divergencia en `_FRONTEND_ONLY_BY_DESIGN = {"dietType"}`. Si
    // alguien intenta "arreglar" agregando dietType al backend, el test
    // diet_type_NO_es_required_por_compat_legacy falla con copy explicativo.
    'dietType',
    'allergies', 'dislikes', 'medicalConditions',
    'mainGoal', 'struggles', 'motivation',
];

/**
 * [P1-FORM-1] Construye el mapeo `field → step index` desde la declaración
 * de steps en runtime. ANTES había un objeto hardcoded `FIELD_TO_STEP_INDEX`
 * con índices literales (gender:0, age:1, householdSize:8, mainGoal:13,
 * motivation:15). Cada vez que se insertaba/reordenaba un step había que
 * actualizar manualmente los índices o la navegación a campo faltante
 * llevaba al usuario al step equivocado (toast "Completa Sexo" pero estaba
 * en Goals). El comentario `P1-B5: 12→13 tras inserción de QDislikes` era
 * evidencia del problema: un humano tenía que recordar bumpear los índices
 * al insertar QDislikes.
 *
 * AHORA: cada step en `InteractiveAssessmentFlow.jsx` declara su propia
 * propiedad `fields: ['gender']` (o vacía/omitida si no captura requeridos).
 * Este builder itera el array y construye el mapping en O(n) — el orden de
 * los steps determina el índice automáticamente. Reordenar/insertar steps
 * mantiene la navegación correcta sin tocar este archivo.
 *
 * @param {Array<{fields?: string[]}>} steps — array de steps con `fields` opcional.
 * @returns {Object<string, number>} mapping `field → step index`.
 *
 * Comportamiento ante duplicados: first-wins (si un field aparece en dos
 * steps, el usuario es redirigido al PRIMERO que lo necesita — lo más
 * temprano en el flow). Defensive: en el codebase actual cada field vive
 * en un único step, pero esta semántica protege contra refactors futuros
 * que dividan campos entre steps.
 */
export const buildFieldToStepIndex = (steps) => {
    const map = {};
    if (!Array.isArray(steps)) return map;
    steps.forEach((step, idx) => {
        const fields = step?.fields;
        if (!Array.isArray(fields)) return;
        for (const field of fields) {
            if (typeof field === 'string' && !(field in map)) {
                map[field] = idx;
            }
        }
    });
    return map;
};

// Labels human-readable para los toasts.
// [P1-2] Cada entry de REQUIRED_FORM_FIELDS DEBE tener su label aquí o el toast
// muestra el nombre técnico del field ("scheduleType" en vez de "Tu horario").
export const FIELD_LABELS = {
    gender: 'Sexo biológico',
    age: 'Edad',
    height: 'Altura',
    weight: 'Peso',
    weightUnit: 'Unidad de peso (lb/kg)',
    activityLevel: 'Nivel de actividad',
    scheduleType: 'Tu horario cotidiano',
    sleepHours: 'Horas de sueño',
    stressLevel: 'Nivel de estrés',
    cookingTime: 'Tiempo para cocinar',
    budget: 'Presupuesto de compras',
    householdSize: 'Tamaño del hogar',
    groceryDuration: 'Duración entre compras',
    dietType: 'Tipo de dieta',
    allergies: 'Alergias o intolerancias',
    dislikes: 'Alimentos que no te gustan',
    medicalConditions: 'Condiciones médicas',
    mainGoal: 'Objetivo principal',
    struggles: 'Mayores obstáculos',
    motivation: 'Motivación personal',
};

/**
 * Devuelve la primera key de `REQUIRED_FORM_FIELDS` cuyo valor está ausente o
 * vacío en `formData`. Null si todos completos.
 *
 * Trata como "vacío":
 *   - undefined / null
 *   - string vacío o solo whitespace
 *   - array de longitud 0
 *
 * `formData = null` retorna el primer campo (`gender`) — sirve como guard
 * defensivo cuando el contexto aún no se hidrató.
 */
export const findFirstIncompleteField = (formData) => {
    if (!formData) return REQUIRED_FORM_FIELDS[0];
    for (const field of REQUIRED_FORM_FIELDS) {
        const v = formData[field];
        if (v === undefined || v === null) return field;
        if (typeof v === 'string' && v.trim() === '') return field;
        if (Array.isArray(v) && v.length === 0) return field;
    }
    return null;
};

// ============================================================
// [P1-3] Rangos biométricos plausibles
// ------------------------------------------------------------
// Mantener alineado con `_BIO_RANGES` en `backend/routers/plans.py`. El
// backend es source of truth (defense-in-depth contra clientes no oficiales).
// Estas constantes son solo para gating de UI: bloquear el botón "Siguiente"
// y poner `min`/`max` HTML nativo en los inputs para feedback inmediato.
// Si se ajusta un rango en el backend, actualizar acá también.
//
// Filosofía: PERMISIVOS — solo blindamos contra typos y bogus, no gate-keep
// médico. Cubrimos extremos humanos reales.
// ============================================================
export const BIO_RANGES = {
    age:      { min: 12,  max: 100, step: 1,   unit: 'años' },
    heightCm: { min: 100, max: 250, step: 1,   unit: 'cm' },
    heightFt: { min: 3,   max: 8,   step: 1,   unit: 'pies' },   // ~3'3" a 8'2"
    heightIn: { min: 0,   max: 11,  step: 1,   unit: 'pulg' },
    weightKg: { min: 30,  max: 300, step: 0.1, unit: 'kg' },
    weightLb: { min: 66,  max: 660, step: 0.1, unit: 'lb' },     // = 30-300 kg
    bodyFat:  { min: 1,   max: 60,  step: 0.1, unit: '%' },
    // [P1-FORM-12] Espejo de `_BIO_RANGES["household"]` en
    // `backend/routers/plans.py`. El cap de 12 cubre callers legacy /
    // hidratación de DB / households extendidos. Históricamente había
    // chips 1..6 en QHousehold; tras P0-12 el campo `householdSize` ya
    // no se setea desde chips ahí (UI canónica reside en otra superficie:
    // Settings, ajustes manuales o defaults del flow). Si frontend o
    // backend bumpea este rango, AMBOS lados deben subirlo
    // simultáneamente — `backend/test_p3_5_bio_ranges_parity.py` audita
    // la paridad cross-language (mismo patrón que P3-NEW-A).
    household: { min: 1,   max: 12,  step: 1,   unit: 'personas' },
};

/**
 * [P1-3] Valida que un valor biométrico (string del input o number) caiga
 * dentro del rango. Defensivo contra strings vacíos, NaN, formato regional
 * con coma decimal ("70,5"), etc.
 *
 * @param {string|number|null|undefined} rawValue — valor del input.
 * @param {{min:number, max:number}} range — rango aceptado.
 * @param {{optional?: boolean}} [opts] — si optional, `''`/null/undefined
 *   pasan como válidos (caso de bodyFat). Default false.
 * @returns {boolean} true si está en rango.
 */
export const isBiometricInRange = (rawValue, range, { optional = false } = {}) => {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
        return !!optional;
    }
    const normalized = typeof rawValue === 'number'
        ? rawValue
        : parseFloat(String(rawValue).replace(',', '.'));
    if (!Number.isFinite(normalized)) return false;
    return normalized >= range.min && normalized <= range.max;
};

// ============================================================
// [P1-FORM-8] Enum de tipos de dieta — SSOT con backend
// ------------------------------------------------------------
// Mantener alineado con `_DIET_TYPE_ENUM` en
// `backend/routers/plans.py` (frozenset Python). El backend valida en API
// boundary que cualquier `dietType` recibido sea exactamente uno de estos
// valores (lower-case, post-strip); cualquier otro string → 422 accionable.
//
// ANTES, `QDietType` (`InteractiveQuestions.jsx`) hardcodeaba la lista de
// 3 chips con literales (`"balanced"`, `"vegetarian"`, `"vegan"`). Si un
// futuro refactor renombrara uno (ej. `"vegan"` → `"plant_based"`) sin
// actualizar el backend, el wizard mandaría un valor que el orquestador
// trataría como desconocido — el filtro de catálogo dominicano
// (`constants._get_fast_filtered_catalogs`) caería al default `balanced`
// silenciosamente y el plan ignoraría la preferencia. Centralizar la
// lista acá + import en QDietType + validación backend cierra el drift.
//
// Si se añade un nuevo tipo de dieta (ej. "keto"), DEBE actualizarse en:
//   1. Este array (frontend SSOT).
//   2. `_DIET_TYPE_ENUM` en `backend/routers/plans.py` (lower-case).
//   3. `_get_fast_filtered_catalogs` en `backend/constants.py` para que
//      el catálogo filtre los ingredientes correctos.
//   4. Tests de regresión (`backend/test_p1_form_8_diet_type_enum.py` si
//      existe, o crear).
//
// Convención: lower-case + snake_case. El backend hace `.lower()` antes
// de comparar, así que "Balanced"/"VEGAN" pasan, pero el frontend manda
// siempre lower-case por consistencia.
// ============================================================
export const DIET_TYPES = Object.freeze(['balanced', 'vegetarian', 'vegan']);

/**
 * [P1-FORM-8] Devuelve true si `value` es un tipo de dieta válido.
 * Comparación case-insensitive tras `.trim()` para tolerar inputs con
 * formato laxo (mismo comportamiento que el backend).
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export const isValidDietType = (value) => {
    if (typeof value !== 'string') return false;
    return DIET_TYPES.includes(value.trim().toLowerCase());
};

// ============================================================
// [P0-FORM-5] Enums de `activityLevel` y `mainGoal` — SSOT con backend
// ------------------------------------------------------------
// Espejo de `_ACTIVITY_LEVEL_ENUM` y `_MAIN_GOAL_ENUM` en
// `backend/routers/plans.py`. El backend rechaza con 422 cualquier valor
// fuera de estos enums (a diferencia de `dietType` que tiene capa legacy
// `_DIET_TYPE_LEGACY_ACCEPTED`, estos son estrictos: el wizard siempre los
// envió en lower_case canónico).
//
// ANTES de P0-FORM-5: backend NO validaba el enum. `nutrition_calculator`
// hacía `ACTIVITY_MULTIPLIERS.get(activity_level, 1.55)` y
// `GOAL_ADJUSTMENTS.get(goal, 0.0)` → defaultaba silenciosamente a "moderate"
// y "maintenance" sin telemetría. Cliente legacy con typo / mobile viejo
// generaba BMR/TDEE/macros erróneos sin disparar warning.
//
// Si se añade un nuevo nivel/goal, actualizar AMBOS lados Y los dicts de
// `nutrition_calculator.py`:
//   - `ACTIVITY_MULTIPLIERS` (multiplicador del TDEE)
//   - `GOAL_ADJUSTMENTS` (% déficit/superávit)
//   - `MACRO_SPLITS` (distribución P/C/G por meta)
// Sin esos tres, el calculador defaultea silenciosamente al fallback.
// ============================================================
export const ACTIVITY_LEVELS = Object.freeze([
    'sedentary', 'light', 'moderate', 'active', 'athlete',
]);

export const MAIN_GOALS = Object.freeze([
    'lose_fat', 'gain_muscle', 'maintenance', 'performance',
]);

/**
 * [P0-FORM-5] Validación case-insensitive de `activityLevel` contra el enum.
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export const isValidActivityLevel = (value) => {
    if (typeof value !== 'string') return false;
    return ACTIVITY_LEVELS.includes(value.trim().toLowerCase());
};

/**
 * [P0-FORM-5] Validación case-insensitive de `mainGoal` contra el enum.
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export const isValidMainGoal = (value) => {
    if (typeof value !== 'string') return false;
    return MAIN_GOALS.includes(value.trim().toLowerCase());
};

// ============================================================
// [P1-FORM-14] Enum de `selectedSupplements` — SSOT con backend
// ------------------------------------------------------------
// Espejo de `_SUPPLEMENT_ENUM` en `backend/routers/plans.py` y de
// `SUPPLEMENT_NAMES.keys()` en `backend/constants.py`. El backend valida
// en API boundary (`/api/plans/generate` recibe el array y rechaza con 422
// si CUALQUIER entrada está fuera del enum); ANTES, el componente
// `QSupplements` (`InteractiveQuestions.jsx`) hardcodeaba los mismos 12
// strings literalmente — un rename en el backend (`vegan_protein` →
// `plant_protein`) sin actualizar el frontend producía rechazo silencioso
// del array entero al usuario al final del wizard sin explicación útil.
//
// `QSupplements` ahora importa esta lista, deriva el catálogo de chips de
// `SUPPLEMENT_META` (declarado en InteractiveQuestions.jsx) y corre un
// invariante runtime en dev-mode para detectar drift entre la lista y la
// metadata UI (mismo patrón que `DIET_TYPES`/`DIET_TYPE_META` de P1-FORM-8).
//
// Si se añade un nuevo suplemento (ej. "ashwagandha"), DEBE actualizarse en:
//   1. Este array (frontend SSOT).
//   2. `_SUPPLEMENT_ENUM` en `backend/routers/plans.py`.
//   3. `SUPPLEMENT_NAMES` en `backend/constants.py` con su nombre legible.
//   4. `SUPPLEMENT_META` en `InteractiveQuestions.jsx` con `{label, emoji}`.
//
// El test `backend/test_p1_form_14_supplements_sync.py` parsea ambos lados y
// falla en CI si detecta drift entre cualquiera de los 4 sites.
//
// Convención: lower_case + snake_case canónico. Backend rechaza variantes
// con mayúsculas para forzar consistencia (ver comentario en `_SUPPLEMENT_ENUM`).
// ============================================================
export const SUPPLEMENTS = Object.freeze([
    'whey_protein',
    'vegan_protein',
    'creatine',
    'bcaa',
    'pre_workout',
    'fat_burner',
    'collagen',
    'multivitamin',
    'omega3',
    'magnesium',
    'probiotics',
    'electrolytes',
]);

/**
 * [P1-FORM-14] Validación case-sensitive de un valor contra el enum
 * `SUPPLEMENTS`. El backend hace match estricto (no aplica `.lower()`),
 * así que el frontend debe alinear: comparación literal.
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export const isValidSupplement = (value) => {
    if (typeof value !== 'string') return false;
    return SUPPLEMENTS.includes(value);
};
