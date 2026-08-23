// [P1-COUNTRY-SYSTEM-F1 · 2026-08-16, fix-round 1] `coerceCountry`/`COUNTRY_SYSTEM_UI`
// para `currencyOptionsForCountry`/`effectiveBudgetCurrency` más abajo. Import a nivel
// de módulo (no local) porque este archivo no tiene ningún otro import — la única
// excepción se documenta aquí para que no sorprenda en review.
import {
    COUNTRIES,
    COUNTRY_SYSTEM_UI,
    coerceCountry,
    defaultCurrencyForCountry,
} from './countries';

// [P3-I18N-MARCA-HORNEADA-EN-26-CLAVES] la marca entra como variable, no horneada en la clave.
import { BRAND } from '../data/routeMeta';
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
// El total lo dicta `.length` — no repitas la cifra aquí: ya mintió una vez
// (decía 20 con 22 en el array). El conteo histórico que aparece en este header
// ("6 completos" en P0-B3, "19 campos" en el drift documentado de P0-FORM-6)
// refleja el estado pre-fix; no actualizar esos números — son evidencia
// narrativa del problema que se cerró. La cifra autoritativa es la longitud
// del array de abajo (`REQUIRED_FORM_FIELDS.length`).
export const REQUIRED_FORM_FIELDS = [
    // [P1-APPMODE-REQUIRED · 2026-08-12] El paso 0 (¿plan o contador?) también es
    // obligatorio por decisión del owner. Frontend-only: el backend jamás lee
    // appMode del payload (el modo se conmuta por el endpoint plan-mode, no por
    // el formulario). NO va en TRACKING_REQUIRED_FIELDS a propósito: la rama
    // corta solo existe cuando appMode ya vale tracking (garantía estructural)
    // y QTrackingFinish persiste esa lista al health_profile — meter appMode ahí
    // contaminaría el jsonb con un campo de ruteo del wizard.
    // OJO parser: el test de paridad backend extrae TODO string entre comillas
    // de este bloque — en estos comentarios, cero literales entrecomillados.
    'appMode',
    // [P1-PLANSOURCE-REQUIRED · 2026-08-12] Obligatoria por decisión del owner
    // (anula el default-scratch silencioso de P1-PANTRY-FIRST-PLAN): elegir si
    // el plan nace libre o desde la Nevera ES la primera decisión del plan, no
    // un detalle con default. Frontend-only a propósito — el backend sigue
    // tratando ausente como generación libre (compat legacy, mismo patrón que
    // dietType; whitelist `_FRONTEND_ONLY_BY_DESIGN` del test de paridad).
    // Va PRIMERO: findFirstIncompleteField navega en este orden y su paso es
    // el primero de la rama del plan.
    'planSource',
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

// [BUDGET-MIN · 2026-05-31] Mínimo de presupuesto para que un plan sea VIABLE.
// Bajo este monto no hay suficiente para cubrir las comidas del ciclo. Escala
// con la duración elegida (7/15/30 días) y la moneda. SSOT compartido por
// `QBudget` (hint + input min) y el `validateExtra` del step de presupuesto en
// `InteractiveAssessmentFlow` (gatea "Siguiente Paso"). Si ajustas estos pisos,
// este es el ÚNICO lugar a tocar.
// [BUDGET-MIN-NONLINEAR · 2026-06-23] Piso TOTAL por ciclo, NO lineal (descuento por
// compra grande, pedido del owner): 7d=RD$4,000, 15d=RD$7,000, 30d=RD$13,000 (antes era
// lineal 571.43/día → 15d=RD$8,571, 30d=RD$17,143). USD a ~50 DOP/USD para mantener
// 7d=US$80 → 15d=US$140, 30d=US$260. DEBE quedar CONSISTENTE con el piso del backend
// (_budget_cycle_floor_dop en nutrition_calculator.py: 4000/7000/13000) para que el form
// no permita un monto que el backend después rechace.
// [P1-COUNTRY-SYSTEM-F1] Pisos PROVISIONALES derivados del piso USD por factor fijo
// (EUR×0.95, MXN×18, COP×4200) — Fase 3 los sustituye por precios reales de mercado.
// Espejo del backend (_budget_cycle_floor_dop region); test de paridad en
// test_p1_country_system_f1.py.
//   EUR: 80×0.95=76→75   140×0.95=133→135   260×0.95=247→245
//   MXN: 80×18=1440→1400 140×18=2520→2500   260×18=4680→4700
//   COP: 80×4200=336000→350000 140×4200=588000→600000 260×4200=1092000→1100000
export const BUDGET_MIN_TOTAL = {
    DOP: { weekly: 4000, biweekly: 7000, monthly: 13000 },
    USD: { weekly: 80, biweekly: 140, monthly: 260 },
    EUR: { weekly: 75, biweekly: 135, monthly: 245 },
    MXN: { weekly: 1400, biweekly: 2500, monthly: 4700 },
    COP: { weekly: 350000, biweekly: 600000, monthly: 1100000 },
};
export const BUDGET_CYCLE_DAYS = { weekly: 7, biweekly: 15, monthly: 30 };

/** Días del ciclo según la duración de compras elegida (default 7). */
export const budgetCycleDays = (groceryDuration) =>
    BUDGET_CYCLE_DAYS[groceryDuration] || 7;

/** Mínimo de presupuesto TOTAL para (moneda, duración). */
export const minBudgetFor = (currency, groceryDuration) => {
    const table = BUDGET_MIN_TOTAL[currency] || BUDGET_MIN_TOTAL.DOP;
    return table[groceryDuration] ?? table.weekly;
};

// [P1-COUNTRY-SYSTEM-F1 · 2026-08-16; P1-COUNTRY-BUDGET-CURRENCY-DEFAULT · 2026-08-23]
// Terceras monedas que añade el toggle. Se DERIVAN del SSOT `COUNTRIES`: el mapa previo repetía
// ES/MX/CO a mano y dejaba fuera la moneda por defecto de US/PR. Es intencional excluir DOP/USD
// aquí: ambas opciones universales ya existen en el toggle y añadir US/PR duplicaría USD.
//
// Vive AQUÍ (no en QBudget.jsx, donde nació) porque QBudget NO es su único
// consumidor: InteractiveAssessmentFlow.jsx (el gate "Siguiente Paso") y
// useBudgetFloor.js (el piso estático) también necesitan resolver la moneda
// vigente, y ambos YA importan de este módulo — importar un mapa de moneda desde un
// componente de wizard hacia un hook/orquestador habría sido la dirección de
// dependencia equivocada. UNA fuente, tres consumidores.
export const BETA_CURRENCY_BY_COUNTRY = Object.fromEntries(
    COUNTRIES
        .filter(({ beta, currency }) => beta && !['DOP', 'USD'].includes(currency))
        .map(({ code, currency }) => [code, currency]),
);

/**
 * [P1-COUNTRY-SYSTEM-F1] Qué monedas ofrece el toggle de presupuesto. PURA — sin
 * AssessmentContext/fetch/i18n — exportada para test unitario ligero
 * (QBudget.p1_country_system_f1.test.jsx) sin montar ningún componente, mismo patrón
 * que `sanitizeBudgetAmount`.
 *
 * `countrySystemUI=false` (oscuro, default) ⇒ `betaCurrency` SIEMPRE undefined y
 * `options` es EXACTAMENTE [DOP, USD] — el toggle de hoy, byte-idéntico, sin importar
 * el país. Encendido + país beta con moneda propia (ES/MX/CO) ⇒ 3ª opción con el
 * código de esa moneda. DO (nativo) y US/PR (ya usan USD) quedan en [DOP, USD] incluso
 * encendido — no hay moneda nueva que ofrecerles.
 */
export function currencyOptionsForCountry(rawCountry, countrySystemUI) {
    const betaCurrency = countrySystemUI ? BETA_CURRENCY_BY_COUNTRY[coerceCountry(rawCountry)] : undefined;
    return {
        betaCurrency,
        options: [
            { value: 'DOP', label: 'RD$' },
            { value: 'USD', label: 'US$' },
            ...(betaCurrency ? [{ value: betaCurrency, label: betaCurrency }] : []),
        ],
    };
}

/**
 * [P1-COUNTRY-SYSTEM-F1 · fix-round 1 · review] La moneda REALMENTE vigente — nunca
 * `budgetCurrency` crudo.
 *
 * EL BUG QUE CIERRA: `budgetCurrency='EUR'` puede persistir en `formData`
 * (localStorage) mientras `COUNTRY_SYSTEM_UI` estuvo encendida. Si la bandera se
 * apaga después (rollback) — o el usuario cambia de país sin volver a tocar el
 * toggle — `budgetCurrency` queda STALE: ya no es una opción legítima, pero nadie la
 * limpia. Un call site que siga leyendo `formData.budgetCurrency` directo (placeholder
 * en EUR, aria-label en euros, piso comparado contra el piso EUR) queda mintiendo
 * mientras el gate real (backend `validate_budget_sufficient`, gateado por
 * `MEALFIT_COUNTRY_SYSTEM`) ya volvió a tratar esa moneda como DOP — 422 con "RD$"
 * contra una UI que pedía "≥75 EUR".
 *
 * Devuelve `budgetCurrency` SOLO cuando (a) es 'DOP'/'USD' —universales, válidas
 * siempre— o (b) el country-system está encendido Y `budgetCurrency` coincide con la
 * moneda beta del país declarado. Si está ausente/stale, deriva la moneda local desde
 * `COUNTRIES`; con el sistema apagado conserva el fallback histórico DOP.
 *
 * `countrySystemUI` es el 3er parámetro, OPCIONAL, default la bandera real del build
 * (`COUNTRY_SYSTEM_UI`) — los call sites de producción llaman con 2 argumentos; el
 * 3ro existe solo para que los tests puedan fijar el estado de la bandera sin mockear
 * el módulo `config/countries`.
 */
/**
 * [P1-DASH-BUDGET-CURRENCY · 2026-08-21] SSOT del símbolo de la moneda de presupuesto.
 *
 * Vive aquí, junto a `currencyOptionsForCountry` y `effectiveBudgetCurrency`, porque la política
 * de moneda ya vive aquí y porque sus consumidores (QBudget, el panel del Dashboard, el hook del
 * piso) ya importan de este módulo.
 *
 * EL BUG QUE CIERRA: la regla estaba escrita DOS veces. QBudget tenía la versión de tres ramas
 * (USD → US$, DOP → RD$, resto → el código) y el panel del Dashboard su propia copia de dos
 * (`_cur === 'USD' ? 'US$' : 'RD$'`), donde EUR/MXN/COP caían al `else`. Un usuario español con
 * `budgetCurrency='EUR'` leía en el Dashboard «Mínimo RD$245 para 30 días» sobre un monto que el
 * backend había calculado en EUROS. Escribirla una tercera vez para arreglarla habría sido el
 * mismo error con más pasos.
 *
 * PURA y sin fallback a país: recibe una moneda YA resuelta (el caller la saca de
 * `effectiveBudgetCurrency`, que es quien sabe de países y de banderas). Ausente/vacía ⇒ 'RD$',
 * el mismo fail-safe que el resto del sistema.
 */
export function budgetCurrencySymbol(currency) {
    const cur = String(currency ?? '').trim();
    if (cur === 'USD') return 'US$';
    if (cur === 'DOP' || cur === '') return 'RD$';
    return cur;
}

export function effectiveBudgetCurrency(country, budgetCurrency, countrySystemUI = COUNTRY_SYSTEM_UI) {
    if (budgetCurrency === 'DOP' || budgetCurrency === 'USD') return budgetCurrency;
    const { betaCurrency } = currencyOptionsForCountry(country, countrySystemUI);
    if (betaCurrency && budgetCurrency === betaCurrency) return budgetCurrency;
    return countrySystemUI ? defaultCurrencyForCountry(country) : 'DOP';
}

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
// [I18N-EXEMPT: SSOT canonico de campos; los rotulos traducidos viven en getFieldLabels(t)]
export const FIELD_LABELS = {
    appMode: 'Qué hace Bioboros por ti (plan o contador)',
    planSource: 'Cómo arma tu plan la IA',
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
 * [P1-I18N-DASHBOARD · 2026-08-15] Las mismas etiquetas, traducibles.
 *
 * Por qué DUPLICA los valores de `FIELD_LABELS` en vez de traducirlo al vuelo:
 *
 *   1. `FIELD_LABELS` es SSOT y lo parsean dos tests del backend
 *      (`test_form_backend_parity_meta.py`, `test_p0_form_6_required_fields_sync.py`).
 *      Convertirlo en función o meterle `t()` dentro toca un contrato ajeno.
 *   2. `t(FIELD_LABELS[key])` FUNCIONARÍA en runtime —la clave del catálogo es
 *      justamente el texto español— pero sería una clave DINÁMICA, invisible
 *      para `npm run i18n:check`. O sea: nunca entraría en los catálogos y esas
 *      22 etiquetas se quedarían en español para siempre, sin que nada avisara.
 *      Es exactamente el fallo silencioso que el validador existe para impedir.
 *
 * El precio de la duplicación es explícito y barato: si alguien añade un campo
 * a `FIELD_LABELS` y olvida esta tabla, el `??` lo pinta en español. Degrada,
 * no miente.
 *
 * Es una FUNCIÓN, no una constante: un `t()` en ámbito de módulo se evalúa al
 * importar —antes de que exista catálogo— y se congela en español para siempre.
 */
export const getFieldLabels = (t) => ({
    appMode: t('Qué hace {app} por ti (plan o contador)', { app: BRAND }),
    planSource: t('Cómo arma tu plan la IA'),
    gender: t('Sexo biológico'),
    age: t('Edad'),
    height: t('Altura'),
    weight: t('Peso'),
    weightUnit: t('Unidad de peso (lb/kg)'),
    activityLevel: t('Nivel de actividad'),
    scheduleType: t('Tu horario cotidiano'),
    sleepHours: t('Horas de sueño'),
    stressLevel: t('Nivel de estrés'),
    cookingTime: t('Tiempo para cocinar'),
    budget: t('Presupuesto de compras'),
    householdSize: t('Tamaño del hogar'),
    groceryDuration: t('Duración entre compras'),
    dietType: t('Tipo de dieta'),
    allergies: t('Alergias o intolerancias'),
    dislikes: t('Alimentos que no te gustan'),
    medicalConditions: t('Condiciones médicas'),
    mainGoal: t('Objetivo principal'),
    struggles: t('Mayores obstáculos'),
    motivation: t('Motivación personal'),
});

/** Etiqueta traducida de un campo; cae al español del SSOT y luego a la clave. */
export const getFieldLabel = (key, t) =>
    (typeof t === 'function' ? getFieldLabels(t)[key] : null) ?? FIELD_LABELS[key] ?? key;

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
// [P2-FORM-FREETEXT-SATISFIES · 2026-06-27] Campos array required que se satisfacen TAMBIÉN con su texto
// libre companion (el usuario escribió "cirugía bariátrica" en "Otra condición médica" sin marcar un chip).
// El gate del NextButton de cada step ya lo aceptaba (InteractiveQuestions: medicalConditions||otherConditions),
// pero este validador global (usado al submit / navegación a campo faltante) miraba solo el array → rebotaba
// al usuario al step ya completado, en bucle. El backend lo mergea downstream (espejo: _FREE_TEXT_COMPANION_FIELDS
// en routers/plans.py). tooltip-anchor: P2-FORM-FREETEXT-SATISFIES
//
// [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] `medicalConditions: 'otherConditions'` se CONSERVA
// aunque QMedical.jsx ya no renderiza el input "Otra condición médica..." (decisión de producto:
// alcance clínico acotado al checklist). Es intencional, NO dead code: cubre compat con sesiones
// en curso / formData restaurado de localStorage que aún trae `otherConditions` poblado de ANTES
// del deploy — sin esto, ese usuario quedaría atascado en el step aunque ya lo hubiera completado
// bajo las reglas viejas. El backend mantiene el mismo companion por la misma razón (ver comentario
// de compatibilidad en `_FREE_TEXT_COMPANION_FIELDS`, routers/plans.py). Un usuario NUEVO nunca
// puede popular `otherConditions` (no hay UI), así que este companion es un no-op para él.
const FREE_TEXT_COMPANION = {
    allergies: 'otherAllergies',
    dislikes: 'otherDislikes',
    medicalConditions: 'otherConditions',
    struggles: 'otherStruggles',
};

export const findFirstIncompleteField = (formData) => {
    if (!formData) return REQUIRED_FORM_FIELDS[0];
    for (const field of REQUIRED_FORM_FIELDS) {
        const v = formData[field];
        const comp = FREE_TEXT_COMPANION[field];
        const compFilled = comp && String(formData[comp] || '').trim() !== '';
        if (v === undefined || v === null) {
            if (compFilled) continue;
            return field;
        }
        if (typeof v === 'string' && v.trim() === '') return field;
        if (Array.isArray(v) && v.length === 0) {
            if (compFilled) continue;
            return field;
        }
    }
    return null;
};

// ============================================================
// [P1-PLAN-MODE · 2026-08-11] El modo seguimiento — su propio contrato
// ------------------------------------------------------------
// `REQUIRED_FORM_FIELDS` (el array de arriba) es el contrato del BACKEND para
// GENERAR UN PLAN, sincronizado con `_REQUIRED_FORM_FIELDS` de routers/plans.py
// y vigilado por test_p0_form_6. NO SE TOCA: en modo seguimiento no se llama a
// /analyze/stream, así que ese contrato no aplica — y si se aplicara,
// `findFirstIncompleteField` devolvería 'scheduleType' y mandaría al usuario a
// un paso que en su modo NO EXISTE.
//
// TRACKING_REQUIRED_FIELDS = los que o entran en `get_nutrition_targets` (el
// NÚMERO del contador) o son SEGURIDAD (alergias, condiciones). Nada más. Los
// 12 pasos que el modo se salta se rellenan con NADA — quedan ausentes y se
// preguntan el día que el usuario encienda el plan. Este repo tiene tres
// cicatrices de la clase contraria (P0-FORM-1/-4/-5): inventar un
// `cookingTime:'medium'` y usarlo meses después es la misma trampa con fecha.
export const TRACKING_REQUIRED_FIELDS = [
    'gender',
    'age',
    'height',
    'weight',
    'weightUnit',
    'activityLevel',
    'mainGoal',
    'dietType',
    'allergies',
    'medicalConditions',
];

// [P1-SUPPLEMENT-CLINICAL-GATE · 2026-08-12] Espejo UI de la tabla backend
// `constants.SUPPLEMENT_CONTRAINDICATIONS` (el ENFORCEMENT vive allá:
// filtro del prompt + barredora post-gen + Revisor Médico; esto solo evita
// que el usuario marque algo que el motor va a vetar). Keyed por los CHIPS
// EXACTOS del wizard (QMedical) — igualdad de string, jamás substring.
// Test de paridad backend: test_p1_supplement_clinical_gate.py.
// [I18N-EXEMPT: SSOT clinico con paridad backend; el hint se traduce en blockedSupplementsFor(t)]
export const SUPPLEMENT_BLOCKERS = {
    pre_workout: {
        conditions: ['Hipertensión', 'Embarazo', 'Lactancia', 'Gastritis'],
        medications: ['Antidepresivo IMAO'],
        hint: 'No recomendado con hipertensión, embarazo/lactancia, gastritis o antidepresivos IMAO.',
    },
    fat_burner: {
        conditions: ['Hipertensión', 'Embarazo', 'Lactancia', 'Gastritis', 'Hipotiroidismo'],
        medications: ['Antidepresivo IMAO'],
        hint: 'No recomendado con hipertensión, embarazo/lactancia, gastritis, hipotiroidismo o IMAO.',
    },
    creatine: {
        conditions: ['Enfermedad Renal'],
        medications: [],
        hint: 'No recomendado con enfermedad renal.',
    },
    whey_protein: {
        conditions: ['Enfermedad Renal'],
        medications: [],
        hint: 'Tu plan renal ya controla la proteína: sin proteína suplementaria.',
    },
    vegan_protein: {
        conditions: ['Enfermedad Renal'],
        medications: [],
        hint: 'Tu plan renal ya controla la proteína: sin proteína suplementaria.',
    },
    bcaa: {
        conditions: ['Enfermedad Renal'],
        medications: [],
        hint: 'Tu plan renal ya controla la proteína: sin aminoácidos suplementarios.',
    },
    omega3: {
        conditions: [],
        medications: ['Warfarina'],
        hint: 'No recomendado con anticoagulantes (riesgo de sangrado).',
    },
};

/**
 * [P1-I18N-SUPPLEMENT-HINT · 2026-08-22] Los mismos siete avisos, traducibles.
 *
 * Los `hint` de arriba se pintaban CRUDOS en dos sitios: como `description` de un toast
 * cuyo título sí estaba traducido, y dentro del `aria-label` del chip vetado. Un usuario en
 * inglés con hipertensión declarada tocaba «Pre-Workout» y leía:
 *
 *     «Not recommended with your medical profile.
 *      No recomendado con hipertensión, embarazo/lactancia, gastritis o antidepresivos IMAO.»
 *
 * Y esa segunda línea es la ÚNICA frase que le explica por qué no puede marcarlo: el chip se
 * ve, no se puede marcar, y el tap explica — ése es el patrón dead-control con MOTIVO que
 * `P1-PLANSOURCE-DEAD-CONTROL` fijó. Sin poder leer el motivo, vuelve a ser un control que
 * no funciona y no dice por qué.
 *
 * Estaban DENTRO de las 96 cadenas sin envolver desde el 21-ago: el gate las veía y las
 * contaba, que es distinto de que alguien las mirara.
 *
 * FUNCIÓN de `t` (no constante) por el congelado de siempre, y literales a la vista porque
 * el extractor es textual. `SUPPLEMENT_BLOCKERS` se queda intacto: es el espejo UI de
 * `constants.SUPPLEMENT_CONTRAINDICATIONS` y lo parsea `test_p1_supplement_clinical_gate.py`.
 *
 * LAS CONDICIONES NO SE TOCAN, y esto es la frontera: `'Hipertensión'`, `'Enfermedad Renal'`,
 * `'Warfarina'` son los chips EXACTOS de QMedical, comparados por igualdad de string contra
 * el backend. Traducirlas rompería el gate clínico en silencio — la misma clase de daño que
 * traducir un nombre de alimento.
 */
const _hintsTraducidos = (t) => ({
    pre_workout: t('No recomendado con hipertensión, embarazo/lactancia, gastritis o antidepresivos IMAO.'),
    fat_burner: t('No recomendado con hipertensión, embarazo/lactancia, gastritis, hipotiroidismo o IMAO.'),
    creatine: t('No recomendado con enfermedad renal.'),
    whey_protein: t('Tu plan renal ya controla la proteína: sin proteína suplementaria.'),
    vegan_protein: t('Tu plan renal ya controla la proteína: sin proteína suplementaria.'),
    bcaa: t('Tu plan renal ya controla la proteína: sin aminoácidos suplementarios.'),
    omega3: t('No recomendado con anticoagulantes (riesgo de sangrado).'),
});

/** Los suplementos vetados para este formData: `{clave: hint}`. Igualdad
 *  exacta contra los chips (una condición de texto libre no se evalúa aquí —
 *  el backend sí la ve con sus registries y barre post-gen).
 *
 *  `t` es opcional: sin ella el hint sale en español, que es degradar y no mentir. */
export const blockedSupplementsFor = (formData, t) => {
    const conds = formData?.medicalConditions || [];
    const meds = formData?.medications || [];
    let traducidos = null;
    if (typeof t === 'function') {
        try { traducidos = _hintsTraducidos(t); } catch { traducidos = null; }
    }
    const out = {};
    for (const [key, spec] of Object.entries(SUPPLEMENT_BLOCKERS)) {
        if (spec.conditions.some((c) => conds.includes(c)) || spec.medications.some((m) => meds.includes(m))) {
            out[key] = (traducidos && traducidos[key]) || spec.hint;
        }
    }
    return out;
};

/** `findFirstIncompleteField`, pero contra una lista dada. La original queda
 *  intacta (firma y 3 call sites); esta existe para que cada modo valide SU
 *  contrato y no el del otro. */
export const findFirstIncompleteFieldFor = (formData, requiredFields) => {
    if (!formData) return requiredFields[0] || null;
    for (const field of requiredFields) {
        const v = formData[field];
        const comp = FREE_TEXT_COMPANION[field];
        const compFilled = comp && String(formData[comp] || '').trim() !== '';
        if (v === undefined || v === null) {
            if (compFilled) continue;
            return field;
        }
        if (typeof v === 'string' && v.trim() === '') return field;
        if (Array.isArray(v) && v.length === 0) {
            if (compFilled) continue;
            return field;
        }
    }
    return null;
};

/** Los campos del contrato de PLAN que a este usuario le faltan. Alimenta el
 *  «Te faltan N preguntas» de la tarjeta de encender el plan — un hecho
 *  accionable, no un adjetivo de marketing. */
export const missingPlanFields = (formData) => {
    const faltan = [];
    for (const field of REQUIRED_FORM_FIELDS) {
        const v = formData?.[field];
        const comp = FREE_TEXT_COMPANION[field];
        const compFilled = comp && String(formData?.[comp] || '').trim() !== '';
        if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
            || (Array.isArray(v) && v.length === 0)) {
            if (!compFilled) faltan.push(field);
        }
    }
    return faltan;
};

/** [AUDIT-FORM-COPY · 2026-08-12] Cuántas PREGUNTAS del wizard le faltan — la
 *  unidad que el usuario ve en pantalla, no campos: «Tus Medidas» pide 4
 *  campos en UNA pregunta, y decirle «te faltan 4» por esa pantalla era un
 *  hecho de otra unidad. Subconteo conocido y aceptado: QHabits gatea sus 4
 *  filas sin declarar fields, así que no aparece aquí — el copy que consuma
 *  esto no debe prometer exactitud de censo, solo magnitud honesta. */
const _QUESTION_GROUP = { age: 'medidas', height: 'medidas', weight: 'medidas', weightUnit: 'medidas' };
export const missingPlanQuestionsCount = (formData) =>
    new Set(missingPlanFields(formData).map((f) => _QUESTION_GROUP[f] || f)).size;

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
    // [P1-CLINICAL-INTAKE · 2026-07-03] Cintura OPCIONAL (riesgo cardiometabólico;
    // afina la lectura de composición corporal junto a bodyFat). Solo-frontend,
    // como weightLb/heightFt: el backend NO la valida por rango (dato opcional que
    // fluye al prompt vía form_data) → NO entra en `_PAIRS` del test de paridad.
    waistCm:  { min: 40,  max: 220, step: 0.5, unit: 'cm' },
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
// [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] Cap de condiciones médicas
// simultáneas (decisión de producto del owner).
// ------------------------------------------------------------
// Espejo de `MEALFIT_MAX_MEDICAL_CONDITIONS` (default 3, clamp [1,7]) en
// `backend/routers/plans.py::_validate_medical_conditions_cap`. El backend
// es source of truth (rechaza con 422 `too_many_medical_conditions` si un
// cliente no oficial bypassa este gate); esta constante SOLO gatea UX —
// deshabilitar chips no seleccionados + mensaje inline ANTES de quemar un
// roundtrip. Si el knob backend cambia, actualizar aquí también (mismo
// patrón que BIO_RANGES arriba).
//
// "Ninguna" (sentinel) y los chips de Embarazo/Lactancia (gender-gated,
// PREGNANCY_CHIP_LABELS en QMedical.jsx) NO cuentan contra el cap — mismo
// exemption que el backend (ver comentario `[SAFETY]` en
// `_validate_medical_conditions_cap`): son un estado fisiológico que activa
// un gate de seguridad aparte (déficit calórico fail-hard), no complejidad
// clínica combinatoria que el cap busca acotar.
// ============================================================
export const MAX_MEDICAL_CONDITIONS = 3;

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
