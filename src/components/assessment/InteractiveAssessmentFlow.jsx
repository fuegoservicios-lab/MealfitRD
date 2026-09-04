import { useAssessment } from '../../context/AssessmentContext';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef } from 'react';
import InteractiveAssessmentLayout from './InteractiveAssessmentLayout';
import {
    QPlanSource,
    QGender, QMeasurements, QActivityLevel, QSchedule,
    QSleep, QStress, QHabits, QCookingTime, QBudget, QHousehold,
    QDietType, QAllergies, QDislikes, QMedical, QMainGoal, QGoalTarget, QStruggles,
    QMotivation, QSupplements,
    NextButton
} from './questions/InteractiveQuestions';
// [P1-PANTRY-WIZARD-STEP · 2026-07-11] Import directo (convención del barrel:
// imports nuevos NO pasan por InteractiveQuestions.jsx).
import { QPantryBuilder } from './questions/QPantryBuilder';
// [P1-STAPLE-FOODS · 2026-08-02] Import directo (mismo patrón que QPantryBuilder arriba).
import { QStapleFoods } from './questions/QStapleFoods';
// [P1-ARQ25-F4-FORM · 2026-09-03] Formulario progresivo (Fase 4) + embudo del wizard.
import { QMealOrganization } from './questions/QMealOrganization';
import { QShoppingHabits } from './questions/QShoppingHabits';
import { PLAN_POLICY_FORM_UI } from '../../config/planPolicy';
import { trackWizard, flushWizardTelemetry } from '../../utils/wizardTelemetry';
// [P1-PLAN-MODE · 2026-08-11] El paso 0 (¿plan o contador?) y el cierre del modo
// seguimiento. El formulario se bifurca por `formData.appMode`: 10 pasos en
// seguimiento, los 21+1 de siempre en plan.
import { QAppMode } from './questions/QAppMode';
import { QTrackingFinish } from './questions/QTrackingFinish';
// [P1-OUTSCOPE-SKIP-GATE · 2026-08-12] SSOT del gate «fuera de alcance» (vive
// junto a sus literales en QMedical): salto y submit lo consumen.
import { hasOutOfScopeMedical } from './questions/QMedical';
// [P1-COUNTRY-SYSTEM-F0 · 2026-08-16] Paso país, gated en OSCURO tras
// COUNTRY_SYSTEM_UI (import directo, mismo patrón que QPantryBuilder/QStapleFoods).
import { QCountry } from './questions/QCountry';
import { COUNTRY_SYSTEM_UI } from '../../config/countries';
// [FORM-CTA-UNIFY · 2026-07-02] Icono del botón "Saltar" (antes glyph ⏭ de texto,
// que renderiza distinto por plataforma; lucide es consistente con el resto).
import { ChevronsRight } from 'lucide-react';
import { toast } from 'sonner';
// [P1-B6] Validación cliente-side centralizada. El módulo
// `config/formValidation` mantiene las constantes y el helper alineadas con
// `_REQUIRED_FORM_FIELDS` del backend (`routers/plans.py:155`). Antes este
// archivo definía las constantes localmente (P0-B3); ahora importa para
// que Plan.jsx, Settings.jsx (vía useRegeneratePlan) y este flow usen la
// misma fuente de verdad.
//
// [P1-FORM-1] `buildFieldToStepIndex` reemplaza el constante hardcoded
// `FIELD_TO_STEP_INDEX` que había en formValidation.js. Ahora cada step en
// el array `steps` (más abajo) declara su propia propiedad `fields: [...]`
// y el mapping se construye en runtime → reordenar/insertar steps no rompe
// la navegación a campo faltante.
import { buildFieldToStepIndex, getFieldLabel, findFirstIncompleteField, findFirstIncompleteFieldFor, TRACKING_REQUIRED_FIELDS, minBudgetFor, effectiveBudgetCurrency } from '../../config/formValidation';
import { pisoSinProcedencia } from '../../config/countries';
import { useT } from '../../i18n';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';

// [P3-I18N-MARCA-HORNEADA-EN-26-CLAVES] la marca entra como variable, no horneada en la clave.
import { BRAND } from '../../data/routeMeta';
/* [P1-SKIP-RESPECTS-BUDGET · 2026-08-09] ¿El presupuesto personalizado alcanza
   el piso? SSOT de las TRES puertas que pueden dejar atrás el paso 11.

   EL BUG QUE CIERRA: «Saltar a la última pregunta» usaba solo
   `findFirstIncompleteField`, que comprueba PRESENCIA de campos. Con
   «Personalizar» elegido, `budget` vale `'custom'` — está presente, así que el
   paso 11 pasaba por completo aunque el monto fuera inválido (RD$13 contra un
   piso de 13.000). El salto se iba al paso 14 dejando atrás un paso roto.

   El paso SÍ sabía que estaba incompleto: su `validateExtra` lo dice y por eso
   su botón «Siguiente» estaba deshabilitado. Lo que fallaba es que esa regla
   solo corría AL PASAR POR EL PASO, y saltar es precisamente no pasar.

   El submit ya tenía su propia copia (P1-FORM-AUDIT-BATCH) — con la del salto
   habrían sido TRES implementaciones de la misma regla, que es como empiezan
   los drifts. Una función, tres consumidores.

   El piso preferido es `_budgetFloorMin` (personalizado por calorías × hogar ×
   ciclo, el mismo que exige el backend); si aún no llegó, cae al estático.

   [P1-BUDGET-FLOOR-STALE · 2026-08-12] Y el piso vigente es el MAYOR de los
   dos, no el cacheado a secas: `_budgetFloorMin` lo refresca SOLO el efecto de
   QBudget al montarse, pero PERSISTE entre sesiones (no es SENSITIVE y el
   split no filtra el prefijo `_`). Con el `||` original, un usuario canSkip
   que cambiaba la frecuencia a mensual SIN volver al paso de presupuesto
   conservaba el piso semanal viejo — las tres puertas daban válido y el
   backend devolvía 422 budget_below_goal_floor. El max nunca sub-bloquea:
   como mínimo aplica el estático correcto para la duración/moneda ACTUAL; si
   sobre-bloquea por un cacheado alto stale, el usuario aterriza en el paso de
   presupuesto, QBudget se monta y el cache se corrige solo. */
// [P1-COUNTRY-SYSTEM-F1 · fix-round 1 · review] `effectiveBudgetCurrency` (no
// `fd.budgetCurrency` crudo) resuelve el piso: una moneda beta STALE (bandera apagada
// tras un rollback, o país cambiado sin re-tocar QBudget) colapsa a DOP aquí IGUAL que
// en QBudget — si no, este gate podría aceptar "≥75" pensando en EUR mientras el
// backend, con el knob ya apagado, compara ese mismo monto contra el piso DOP (~4000+)
// y rechaza con 422.
const isCustomBudgetValid = (fd) => {
    if (fd?.budget !== 'custom') return true;
    const moneda = effectiveBudgetCurrency(fd?.country, fd?.budgetCurrency);
    // [P1-COUNTRY-BUDGET-FLOOR-FX · 2026-08-23] Si el piso de esa moneda es una conversion
    // FX de la cesta dominicana y no una cesta real del pais, ORIENTA pero no BLOQUEA: un
    // colombiano con 200.000 COP/semana —cifra realista— no podia pasar de este paso contra
    // un piso de 350.000 que no sale de ningun dato colombiano. El hint sigue mostrandose.
    // Espejo del backend, que degrada el mismo 422 a aviso: si este gate siguiera duro, el
    // arreglo de alla seria inalcanzable porque el usuario ni llegaria a enviar el formulario.
    if (pisoSinProcedencia(moneda)) return true;
    return Number(fd.budgetAmount) >= Math.max(
        Number(fd._budgetFloorMin) || 0,
        minBudgetFor(moneda, fd.groceryDuration),
    );
};

const InteractiveAssessmentFlow = () => {
    const { currentStep, setCurrentStep, nextStep, formData, updateData, maxReachedStep, setMaxReachedStep, planData, loadingSensitive, isGuest } = useAssessment();  // isGuest: [P1-PANTRY-BUILDER-GATE]
    const navigate = useNavigate();
    const t = useT();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // [P1-FORM-4] Lock síncrono contra doble-submit dentro del mismo tab.
    // ANTES, `if (isSubmitting) return` era el único guard. `isSubmitting` es
    // React state, que NO actualiza síncronamente — dos clicks dentro de la
    // misma frame de React (rapidísimo doble-click, evento de teclado +
    // mouse, programmatic re-trigger) ambos veían `isSubmitting=false`,
    // pasaban el guard, y disparaban dos navigate() + dos pipelines SSE en
    // paralelo. Backend con rate limiter hits 429 en el segundo pero el
    // primero ya quemó cuota LLM. UX confusa: usuario ve error donde el
    // plan ya se generó.
    //
    // `useRef` actualiza síncronamente (mutación directa, sin scheduler),
    // así que el segundo click ve `current=true` y returna inmediatamente.
    // Mantenemos el state `isSubmitting` para feedback visual del botón
    // (disabled, spinner). NO cubre cross-tab (requeriría BroadcastChannel);
    // ese caso lo intercepta el rate limiter del backend con 429.
    const submittingRef = useRef(false);

    // [P0-B3] Cleanup defensivo en unmount: si el usuario clickea "Finalizar"
    // y luego inmediatamente navega back con el browser back-button antes de
    // que React desmonte limpiamente, en escenarios de SPA route caching
    // (improbable hoy pero posible si futuros cambios introducen
    // `<KeepAlive>` o similar), `isSubmitting=true` quedaba congelado y
    // bloqueaba el botón sin posibilidad de retry hasta hard-reload. El
    // cleanup garantiza que cualquier unmount libere el flag.
    // [P1-FORM-4] Cleanup también del ref para que un remount post-unmount
    // pueda re-submitear sin estado residual.
    useEffect(() => {
        return () => {
            setIsSubmitting(false);
            submittingRef.current = false;
        };
    }, []);

    // [P6-FORM-FLASH-FIX] Flag transitorio que suprime el botón "Siguiente"
    // durante los 300ms del setTimeout de auto-advance. Sin esto, post-fix
    // P6-FORM-MANUAL-EXIT, el flujo era:
    //   1. user click "Sedentario" → `formData.activityLevel = 'sedentary'`
    //   2. React re-render → `stepFieldsFilled = true` → botón aparece (visible ~300ms)
    //   3. setTimeout dispara nextStep() → step cambia → botón desaparece
    // El flash visual es mala UX. Con `isAutoAdvancing=true` durante el
    // delay, el botón queda oculto hasta que el step cambie naturalmente.
    const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
    const autoAdvanceTimerRef = useRef(null);

    // [P3-FORM-NO-AUTO-ADVANCE-WHEN-MANUAL-BUTTONS · 2026-05-08] Si los
    // botones manuales ("Siguiente Paso" y/o "Saltar a la última pregunta")
    // ya son visibles en el step actual, hacer click en una opción
    // (Hombre/Mujer, nivel de actividad, etc.) NO debe auto-avanzar: el
    // usuario tiene los botones para decidir cuándo continuar — auto-avance
    // adicional vuelve a esos botones contradictorios.
    //
    // En el flujo lineal first-time (botones no visibles porque ni canSkip
    // ni stepFieldsFilled) conservamos el auto-advance histórico.
    //
    // La ref se actualiza durante el render (asignación más abajo, después
    // de calcular `canSkip` y `stepFieldsFilled`). El handler la consulta
    // por referencia, así que siempre ve el último estado coherente con la
    // visibilidad real de los botones.
    const manualButtonsVisibleRef = useRef(false);

    // Auto advance helper with a slight delay for better UX
    const handleAutoAdvance = () => {
        if (manualButtonsVisibleRef.current) {
            // Botones manuales presentes → el usuario decide cuándo avanzar.
            // Solo dejamos que la selección se persista en formData (lo hace
            // el componente Q*); este handler abort-early.
            return;
        }
        setIsAutoAdvancing(true);
        // [P1-AUTOADVANCE-CLEANUP · 2026-08-10] El temporizador se guarda para poder
        // cancelarlo. Antes quedaba suelto: sobrevivía al desmontaje del paso y podía
        // DESHACER un «atrás» del usuario disparando `nextStep` 300ms después de que él
        // hubiera decidido retroceder — con el gesto atrás de Android ahora conectado,
        // esa ventana deja de ser teórica.
        if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = setTimeout(() => {
            autoAdvanceTimerRef.current = null;
            nextStep();
            setIsAutoAdvancing(false);
        }, 300);
    };

    // [P6-FORM-FLASH-FIX] Reset defensivo: si el usuario navega manualmente
    // (prevStep, jump, etc.) durante el setTimeout, el flag debe limpiarse
    // al cambiar de step para no esconder el botón en el siguiente.
    useEffect(() => {
        // [P1-AUTOADVANCE-CLEANUP] Cambiar de paso invalida cualquier avance en vuelo:
        // si el usuario navegó a mano, su decisión manda sobre el temporizador.
        if (autoAdvanceTimerRef.current) {
            clearTimeout(autoAdvanceTimerRef.current);
            autoAdvanceTimerRef.current = null;
        }
        setIsAutoAdvancing(false);
    }, [currentStep]);

    // Y al desmontar: un temporizador vivo tras salir del formulario intentaría avanzar
    // un paso que ya no existe.
    useEffect(() => () => {
        if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    }, []);

    // [P1-PANTRY-WIZARD-STEP · 2026-07-11] Modo "Desde mi Nevera": añade el paso
    // final "Prepara tu Nevera" DENTRO del wizard. Guests excluidos: la Nevera
    // requiere cuenta (user_inventory persistente); un guest solo puede traer
    // planSource='pantry' stale de una sesión autenticada previa → flujo libre.
    const isPantryMode = formData.planSource === 'pantry' && !isGuest;

    // [P1-PANTRY-WIZARD-STEP] Submit único del wizard (extraído del onFinish inline
    // de QSupplements): en modo libre lo dispara QSupplements ("Finalizar y Generar");
    // en modo pantry lo dispara el CTA del paso Nevera ("Crear mi plan con esta
    // Nevera"). Toda la lógica previa (guards P1-FORM-4/P1-3, validación P0-B3,
    // piso de presupuesto) corre idéntica en ambos caminos.
    const submitAndGenerate = async () => {
        // [P1-FORM-4] Guard síncrono PRIMERO (ref), luego state. El ref captura
        // clicks dentro de la misma React frame; el state captura el caso (raro
        // pero posible) donde la ref se reinició pero el state aún muestra el
        // botón disabled (transición de unmount→remount).
        if (submittingRef.current || isSubmitting) return;

        // [P1-3] Si el descifrado del sensitive cifrado todavía está en vuelo
        // (caso raro: usuario que loggea en otro tab mientras este wizard corre,
        // o token refresh disparado durante el flow), no validamos contra campos
        // sensibles potencialmente vacíos. Toast neutral y NO tocamos
        // `submittingRef` — el usuario puede reintentar en <1s.
        if (loadingSensitive) {
            toast.info(t('Cargando tus datos…'), {
                description: t('Esperando a que se sincronice tu perfil. Inténtalo en unos segundos.'),
                duration: 3000,
            });
            return;
        }

        // CRITICAL: setear el ref ANTES de cualquier validación o async. Si el
        // segundo click llega después de este punto pero antes de setIsSubmitting
        // (varios ms de gap por React batching), el ref ya está true y returna.
        submittingRef.current = true;

        // [P0-B3] Validación de campos requeridos ANTES de navegar. Si falta
        // alguno, llevamos al usuario al step correspondiente y mostramos un
        // toast accionable — preferible a quemar el check de cuota + recibir
        // 422 genérico desde el backend.
        const missing = findFirstIncompleteField(formData);
        if (missing) {
            // [P1-FORM-4] Liberar el lock: la validación falló, el usuario debe
            // poder reintentar tras corregir el campo faltante.
            submittingRef.current = false;
            const stepIdx = fieldToStepIndex[missing];
            const label = getFieldLabel(missing, t);
            toast.error(t('Falta completar: {campo}', { campo: label }), {
                // [AUDIT-FORM-COPY 2026-08-12] La promesa de navegar solo si HAY
                // paso destino (householdSize es required sin paso: default 1).
                description: typeof stepIdx === 'number' ? t('Te llevamos al paso correspondiente.') : t('Revisalo antes de continuar.'),
                duration: 4000,
            });
            if (typeof stepIdx === 'number') {
                setCurrentStep(stepIdx);
            }
            return;
        }

        // [P1-FORM-AUDIT-BATCH · 2026-07-03] Piso de presupuesto custom TAMBIÉN
        // en el submit: el validateExtra del step 10 solo corre al pasar por ese
        // paso — un usuario returning que usa "Saltar a la última pregunta" con
        // un budgetAmount stale bajo el piso llegaba al backend y quemaba una
        // ida/vuelta para recibir el 422 budget_below_goal_floor. Mismo SSOT del
        // validateExtra (piso personalizado _budgetFloorMin → estático).
        // [P1-SKIP-RESPECTS-BUDGET · 2026-08-09] Reescrito sobre `isCustomBudgetValid`:
        // era una copia a mano de la misma regla que el `validateExtra` del paso, y
        // al añadir la del salto habrían sido TRES. Comportamiento idéntico.
        if (!isCustomBudgetValid(formData)) {
            submittingRef.current = false;
            toast.error(t('Tu presupuesto quedó por debajo del mínimo para tu plan.'), {
                description: t('Te llevamos al paso de presupuesto para ajustarlo.'),
                duration: 4000,
            });
            const _budgetIdx = fieldToStepIndex['budget'];
            if (typeof _budgetIdx === 'number') setCurrentStep(_budgetIdx);
            return;
        }

        // [P1-OUTSCOPE-SKIP-GATE · 2026-08-12] El gate clínico también en el
        // submit: sin esto, un salto legacy o estado stale con «Otra condición
        // (no listada)» quemaba el roundtrip y volvía como 422 genérico. El
        // backend sigue siendo la red final; esto es la misma regla, antes.
        if (hasOutOfScopeMedical(formData)) {
            submittingRef.current = false;
            toast.error(t('Tu condición o medicamento marcado está fuera del alcance del plan.'), {
                description: t('Revisa el paso de condiciones médicas.'),
                duration: 4500,
            });
            const _medIdx = fieldToStepIndex['medicalConditions'];
            if (typeof _medIdx === 'number') setCurrentStep(_medIdx);
            return;
        }

        // [P0-B3] Sin setTimeout artificial: navegamos directo; `Plan.jsx`
        // muestra su propio LoadingScreen mientras corre la generación SSE real.
        setIsSubmitting(true);
        trackWizard('wizard_submit', {
            index: currentStep, app_mode: formData.appMode || null, plan_source: formData.planSource || null,
            policy_form: PLAN_POLICY_FORM_UI, form_version: PLAN_POLICY_FORM_UI ? 'v2' : 'v1',
        });
        flushWizardTelemetry();
        try {
            navigate('/plan');
        } catch (error) {
            // [P1-FORM-4] Liberar ambos lock + state en el path de error. El
            // cleanup del unmount cubre el caso de navegación exitosa.
            submittingRef.current = false;
            toast.error(t('Ocurrió un error al iniciar la generación'));
            setIsSubmitting(false);
        }
    };

    // The sequence of steps
    // [P1-FORM-1] Cada step que captura campos `REQUIRED_FORM_FIELDS` declara
    // explícitamente su propiedad `fields: [...]`. El array es la única fuente
    // de verdad: el orden determina el índice, y `buildFieldToStepIndex` (más
    // abajo) construye el mapping `field → step index` en runtime. Reordenar
    // o insertar steps no rompe la navegación a campo faltante.
    const planOnlySteps = [
        // [P1-PANTRY-FIRST-PLAN · 2026-07-11] F3: primera decisión del formulario —
        // plan libre vs construido desde la Nevera. Campo `planSource` viaja en el
        // payload del SSE (spread de formData); el backend inyecta el inventario
        // server-side cuando planSource='pantry'.
        // [P1-PLANSOURCE-REQUIRED · 2026-08-12] Obligatoria por decisión del owner
        // (anula el «sin fields, default scratch» original): declara `fields` para
        // que «Siguiente» no aparezca sin selección, y vive en REQUIRED_FORM_FIELDS
        // para que saltar/submit la exijan. El backend sigue tolerando ausente
        // (compat legacy) — la obligación es del wizard.
        {
            // [P1-PLANSOURCE-COPY-PARITY · 2026-08-09] El título dice «la IA» UNA vez
            // y por delante de las dos opciones, para que la duda «¿esta también es
            // con IA?» no llegue a nacer. El subtítulo nombra el único eje real.
            title: <>{t('¿Cómo quieres que la IA arme tu plan?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Las dos opciones las diseña la IA. La diferencia es si parte de cero o de lo que ya hay en tu Nevera.'),
            fields: ['planSource'],
            component: <QPlanSource onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>{t('¿Eres hombre o mujer?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Las necesidades nutricionales varían según tu sexo biológico.'),
            fields: ['gender'],
            component: <QGender onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>{t('Tus Medidas')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Ingresa tu edad, altura y peso para calcular tus macros con precisión.'),
            hasInternalNext: true,
            fields: ['age', 'height', 'weight', 'weightUnit'],
            component: <QMeasurements onManualAdvance={nextStep} />
        },
        {
            title: <>{t('¿Cuál es tu nivel de actividad física?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Considera tanto tu trabajo como tus entrenamientos.'),
            fields: ['activityLevel'],
            component: <QActivityLevel onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>{t('¿Cómo es tu horario cotidiano?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Adaptaremos los horarios de tus comidas a tu reloj biológico.'),
            fields: ['scheduleType'],
            component: <QSchedule onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>{t('¿Cuántas horas duermes?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('La calidad de tu sueño afecta directamente tu metabolismo.'),
            fields: ['sleepHours'],
            component: <QSleep onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>{t('¿Cuál es tu nivel de estrés diario?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Un alto nivel de estrés puede dificultar la pérdida de grasa.'),
            fields: ['stressLevel'],
            component: <QStress onAutoAdvance={handleAutoAdvance} />
        },
        {
            // [P1-CLINICAL-INTAKE · 2026-07-03] Hábitos de consumo — anamnesis
            // estándar (alcohol/tabaco/cafeína/agua). NO va en REQUIRED_FORM_FIELDS
            // (usuarios existentes con form guardado no deben ser bloqueados al
            // regenerar); el gate vive en el NextButton interno del componente,
            // que exige las 4 filas respondidas al pasar por el step.
            // [P1-FORM-AUDIT-BATCH · 2026-07-03] SIN asterisco rojo: el * prometía un
            // enforcement que "Saltar a la última pregunta" y el submit NO aplican
            // (findFirstIncompleteField solo cubre REQUIRED_FORM_FIELDS) — contradicción
            // UI↔contrato. El gate lineal del NextButton interno se mantiene intacto.
            title: <>{t('Tus hábitos de consumo')}</>,
            subtitle: t('Alcohol, tabaco, cafeína y agua cambian cómo calibramos tu plan (y cómo interactúa con tus medicamentos).'),
            hasInternalNext: true,
            component: <QHabits onManualAdvance={nextStep} />
        },
        {
            // [P2-FORM-KITCHEN-EQUIPMENT · 2026-06-22] (audit fresco P2-24) DECISIÓN DE PRODUCTO: el intake
            // principal captura solo el TIEMPO de cocina, no el EQUIPO (estufa/horno/airfryer/licuadora). El
            // equipo SÍ se captura vía el panel opt-in de Súper Personalización (`kitchenEquipment`) e inyecta
            // al planner por `build_super_personalization_context` (gatea técnicas: "no asumas horno/airfryer si
            // no están en la lista"). Añadir una pregunta de equipo al flujo principal va contra la dirección
            // LEAN del intake (misma razón por la que se eliminó householdSize, P0-12). Gap acotado: solo el
            // PRIMER plan de quien NO llena el panel es equipment-blind. Revisitar si el owner prioriza.
            title: <>{t('¿Cuánto tiempo tienes para cocinar?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Te daremos recetas reales que se ajusten a tu agenda.'),
            fields: ['cookingTime'],
            component: <QCookingTime onAutoAdvance={handleAutoAdvance} />
        },
        // [P1-COUNTRY-SYSTEM-F0 · 2026-08-16 · reubicado por P1-QCOUNTRY-BEFORE-BUDGET
        // · 2026-08-21] El país, gated en OSCURO hasta el flip global.
        //
        // POR QUÉ ESTÁ AQUÍ Y NO AL FINAL. Nació antes de QSupplements porque el último paso
        // lleva el submit y un paso después del submit no se pregunta nunca — razón correcta
        // para no ponerlo el ÚLTIMO, pero que no exigía ponerlo el penúltimo. El coste medido de
        // tenerlo ahí: QBudget corría DIEZ pasos antes con `formData.country` todavía en el 'DO'
        // que siembra `initialFormData`, así que `currencyOptionsForCountry` devolvía exactamente
        // [RD$, US$] y la opción EUR/MXN/COP que T6 construyó era INALCANZABLE en el alta. En la
        // DB viva: las 8 filas de user_profiles con budgetCurrency 'DOP' o NULL, cero con moneda
        // beta — incluida la cuenta que generó los dos planes beta.
        //
        // Ahora va ANTES de la duración de compra y del presupuesto, que son los dos pasos cuyo
        // cálculo depende de la moneda. Sigue DESPUÉS de los datos corporales que abren el
        // formulario: el arranque es lo que engancha, y el país no es una pregunta de apertura.
        //
        // El corrimiento de índices de `mealfit_wizard_step` (persistido en localStorage) ocurre
        // en el deploy de este P-fix — es el segundo, tras el del flip; la doc de Fase 0 avisa de
        // que cada movimiento lo paga una vez.
        ...(COUNTRY_SYSTEM_UI ? [{
            title: <>{t('¿En qué país haces la compra?')}</>,
            subtitle: t('Adapta tus platos, medidas y — donde ya está listo — los precios del súper.'),
            fields: ['country'],
            component: <QCountry onAutoAdvance={handleAutoAdvance} />
        }] : []),
        {
            // [BUDGET-ORDER · 2026-05-31] "Frecuencia de tus compras" va ANTES que
            // "Tu presupuesto" (pedido del usuario). Además es más coherente: el
            // ciclo de compras (groceryDuration) contextualiza el monto custom del
            // presupuesto (`build_budget_context` lo usa: "RD$X para tu ciclo
            // quincenal"). El orden de captura no afecta los datos — ambos se
            // envían juntos al final.
            title: <>{t('Frecuencia de tus compras')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Con esto calculamos cuánto comprar cada vez para que ningún ingrediente se dañe ni te falte antes del próximo mercado.'),
            hasInternalNext: true,
            fields: ['groceryDuration'],
            component: <QHousehold onManualAdvance={nextStep} />
        },
        // [P1-ARQ25-F4-FORM · 2026-09-03] Preguntas 4-6 del formulario progresivo (§6.7): opcionales,
        // condicionales al ciclo (frescos solo si compras cada 15/30 días). Detrás del knob.
        ...(PLAN_POLICY_FORM_UI ? [{
            title: t('Tu compra y tu cocina (Opcional)'),
            subtitle: t('Reposiciones de frescos, congelador y cocinar por tandas: así la lista y el plan se ajustan a tu ritmo real.'),
            hasInternalNext: true,
            component: <QShoppingHabits onManualAdvance={nextStep} />
        }] : []),
        {
            title: <>{t('Tu presupuesto para compras')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Ajustaremos los ingredientes para no afectar tu bolsillo.'),
            fields: ['budget'],
            // [BUDGET-CUSTOM · 2026-05-31] Si el usuario eligió "Personalizar"
            // (budget==='custom'), el monto total debe alcanzar el MÍNIMO viable
            // ([BUDGET-MIN]: escalado por duración + moneda vía `minBudgetFor`,
            // SSOT compartido con el hint de QBudget) para habilitar "Siguiente
            // Paso". Scoped a este step para no bloquear otros cuando budget='custom'.
            // [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Usa el piso PERSONALIZADO que QBudget
            // sincronizó a `_budgetFloorMin` (calorías × hogar × ciclo, = el que exige el backend);
            // fallback al estático `minBudgetFor` si aún no llegó (red lenta / offline).
            // [P1-SKIP-RESPECTS-BUDGET · 2026-08-09] La regla vive en
            // `isCustomBudgetValid` (arriba) y la consumen las TRES puertas:
            // este `validateExtra`, el salto y el submit.
            validateExtra: isCustomBudgetValid,
            component: <QBudget onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>{t('¿Qué tipo de dieta prefieres?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Selecciona el estilo de alimentación que más disfrutes.'),
            fields: ['dietType'],
            component: <QDietType onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>{t('¿Tienes alguna alergia o intolerancia?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            // [AUDIT-FORM-COPY · 2026-08-12] Igual que sus tres hermanos (gustos/
            // médico/struggles): el subtítulo enseña la salida («Ninguna») y el
            // free-text. Es el chip más sensible por safety — el único que no
            // decía cómo responder «no tengo».
            subtitle: t('Marca todas las que apliquen, escribe la tuya en «Otra…», o marca «Ninguna».'),
            hasInternalNext: true,
            fields: ['allergies'],
            component: <QAllergies onManualAdvance={nextStep} />
        },
        {
            // [P1-B5] Step nuevo para `dislikes`. El backend ya consume el campo
            // (filtros de catálogo, RAG, prompt LLM, validación de cache). Antes
            // siempre llegaba `[]` porque el formulario no lo capturaba.
            // [P0-FORM-4] Quitamos el "(Opcional)" del title — era misleading:
            // QDislikes ahora requiere señal explícita (chip / "Ninguno" /
            // free-text) para avanzar. La copy era el origen del falso positivo
            // de "no rechazos" que dejaba colar cilantro/hígado/etc. al plan.
            title: <>{t('Alimentos que no te gustan')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Selecciona los que apliquen, escribe otros, o marca "Ninguno" si no rechazas ningún alimento.'),
            hasInternalNext: true,
            fields: ['dislikes'],
            component: <QDislikes onManualAdvance={nextStep} />
        },
        // [P1-ARQ25-F4-FORM · 2026-09-03] Pregunta 1 del formulario progresivo (§6.7): el perfil global
        // de recurrencia. Obligatoria SOLO en el wizard (frontend-only en el test de paridad): el
        // backend defaultea a `balanced` para clientes viejos.
        ...(PLAN_POLICY_FORM_UI ? [{
            title: <>{t('¿Cómo prefieres organizar tus comidas durante la semana?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Con esto el plan sabe si repetir es un acierto o un defecto.'),
            fields: ['mealOrganization'],
            component: <QMealOrganization onAutoAdvance={handleAutoAdvance} />
        }] : []),
        {
            // [P1-STAPLE-FOODS · 2026-08-02] "Mis básicos" — OPCIONAL/skippeable (mismo patrón que
            // QSupplements): NO en REQUIRED_FORM_FIELDS, SIN asterisco rojo, el NextButton interno
            // nunca se deshabilita por falta de selección.
            title: t('Tus básicos de siempre (Opcional)'),
            subtitle: t('Alimentos que comes seguido y quieres ver repetidos en tu plan sin que cuente como falta de variedad.'),
            hasInternalNext: true,
            component: <QStapleFoods onManualAdvance={nextStep} />
        },
        {
            // [P1-FORM-7] Quitamos "(Opcional)" del title — era misleading:
            // QMedical ahora requiere señal explícita (chip / "Ninguna" /
            // free-text) para avanzar. Una condición silenciada por copy
            // engañosa puede ser un riesgo de seguridad médica si el LLM
            // no la respeta. El asterisco rojo señala "respuesta requerida"
            // (no "tienes que tener una condición").
            title: <>{t('Condiciones Médicas')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            // [P1-MEDICAL-SCOPE-GATE · 2026-08-09] Decía «escribe otras» y el
            // input de texto libre se ELIMINÓ el 2026-08-01
            // (P1-MEDICAL-CONDITIONS-CAP): el enunciado invitaba a hacer algo
            // imposible. Ahora la vía para lo no listado es el chip «Otra
            // condición», que es una señal ESTRUCTURADA — no prosa que haya que
            // parsear (ver el rationale del gate en QMedical.jsx).
            subtitle: t('Marca todas las que apliquen, o "Ninguna" si no tienes ninguna condición preexistente. Si tienes una que no está en la lista, marca "Otra condición".'),
            hasInternalNext: true,
            fields: ['medicalConditions'],
            component: <QMedical onManualAdvance={nextStep} />
        },
        {
            title: <>{t('¿Cuál es tu objetivo PRINCIPAL?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Define la meta que quieres lograr con este plan.'),
            fields: ['mainGoal'],
            component: <QMainGoal onAutoAdvance={handleAutoAdvance} />
        },
        {
            // [P1-CLINICAL-INTAKE · 2026-07-03] Meta cuantificada + ritmo, justo
            // después del objetivo (el componente adapta copy a mainGoal). Igual
            // que QHabits: NO en REQUIRED_FORM_FIELDS — gate en el NextButton
            // interno (número válido con dirección coherente O "Sin meta
            // específica"; ritmo solo para lose_fat/gain_muscle).
            // [P1-FORM-AUDIT-BATCH · 2026-07-03] SIN asterisco rojo (mismo racional que
            // QHabits: el * prometía enforcement que skip/submit no aplican).
            title: <>{t('Tu meta de peso')}</>,
            subtitle: t('Cuantificar la meta nos deja calibrar el ritmo del plan a tu medida — o déjala en manos de la IA.'),
            hasInternalNext: true,
            component: <QGoalTarget onManualAdvance={nextStep} />
        },
        {
            // [P1-FORM-7] Title con asterisco rojo + subtitle clarificador,
            // alineado con el patrón de QDislikes/QMedical. ANTES "Mayores
            // Obstáculos" sin marca de requerido permitía pasar con array
            // vacío silenciosamente; el LLM perdía el contexto de coaching
            // personalizado. Ahora 1 click ("Ninguno" si no aplica) confirma
            // la respuesta y desbloquea el botón.
            title: <>{t('Mayores Obstáculos')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Marca los que apliquen, escribe otros, o marca "Ninguno" si no identificas obstáculos específicos.'),
            hasInternalNext: true,
            fields: ['struggles'],
            component: <QStruggles onManualAdvance={nextStep} />
        },
        {
            title: <>{t('¿Por qué quieres hacer esto AHORA?')}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: t('Escribe tu motivación real. Esto será tu gasolina en días difíciles.'),
            hasInternalNext: true,
            fields: ['motivation'],
            component: <QMotivation onManualAdvance={nextStep} />
        },
        {
            title: t('Suplementación (Opcional)'),
            subtitle: t('¿Te gustaría incluir suplementos profesionales en tu plan?'),
            hasInternalNext: true,
            // [P1-PANTRY-WIZARD-STEP · 2026-07-11] En modo pantry este step ya NO es el
            // final: avanza al paso "Prepara tu Nevera" (abajo) y el submit vive allí.
            component: <QSupplements
                onFinish={isPantryMode ? () => nextStep() : submitAndGenerate}
                isSubmitting={isSubmitting}
                finishLabel={isPantryMode ? t('Siguiente') : undefined}
            />
        },
        // [P1-PANTRY-WIZARD-STEP · 2026-07-11] Paso final condicional del modo
        // "Desde mi Nevera" (feedback owner: "mejor hacerlo directo en el formulario,
        // como la pregunta 21" — reemplaza el desvío a /dashboard/pantry). El array
        // `steps` se rearma en cada render, así que el paso aparece/desaparece
        // reactivo a planSource; va al FINAL para no mover los índices de
        // `fieldToStepIndex`. Guests no lo ven (la Nevera requiere cuenta;
        // QPlanSource ya les bloquea el modo).
        ...(isPantryMode ? [{
            title: <>{t('Prepara tu Nevera')}</>,
            subtitle: t('Agrega los alimentos que tienes en casa; tu plan se construirá alrededor de ellos y la lista de compras te dirá solo lo que falte.'),
            hasInternalNext: true,
            component: <QPantryBuilder onFinish={submitAndGenerate} isSubmitting={isSubmitting} />
        }] : [])
    ];

    // [P1-PLAN-MODE · 2026-08-11] EL FORMULARIO SE BIFURCA POR MODO.
    //
    // QAppMode es un paso PROPIO y anterior — no un tercer botón de QPlanSource,
    // cuyo enum es binario y el backend trata cualquier otro valor como generación
    // libre (la forma de P1-DIET-CANON-SSOT). El paso no ES el interruptor: lo PULSA
    // al terminar (QTrackingFinish → PUT /api/profile/plan-mode), porque los crons no
    // leen formData y los crons son donde se gasta el dinero.
    //
    // Los 10 pasos del modo seguimiento son los que alimentan el NÚMERO del contador
    // (get_nutrition_targets) o son SEGURIDAD. Los 12 que se saltan quedan AUSENTES
    // — se preguntan el día que el usuario encienda el plan, no se inventan
    // (P0-FORM-1/-4/-5 son las cicatrices de inventarlos).
    const _appModeStep = {
        // [P1-APPMODE-REQUIRED · 2026-08-12] Obligatoria como planSource (decisión
        // del owner): asterisco + entrada en REQUIRED_FORM_FIELDS. El `fields` de
        // abajo ya gateaba «Siguiente»; el contrato cubre al usuario que REGRESA
        // y salta (canSkip) sin haberla contestado jamás (cuentas pre-P1-PLAN-MODE).
        title: <>{t('¿Qué quieres que haga {app} por ti?', { app: BRAND })}&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
        subtitle: t('Las dos cosas usan la misma IA. La diferencia es si te genera el menú o solo te acompaña a contar.'),
        fields: ['appMode'],
        component: <QAppMode onAutoAdvance={handleAutoAdvance} />
    };

    const _byField = (f) => planOnlySteps.find((st) => (st.fields || []).includes(f));
    const _byComponent = (C) => planOnlySteps.find((st) => st.component && st.component.type === C);

    const _trackingSteps = [
        _appModeStep,
        _byField('gender'),
        _byField('age'),            // Tus Medidas: age/height/weight/weightUnit
        _byField('activityLevel'),
        _byField('mainGoal'),
        // [AUDIT-FORM-COPY · 2026-08-12] El subtítulo original habla «del plan» —
        // en esta rama no hay plan por diseño (el cierre lo dice dos pasos
        // después). Se sobreescribe SOLO el copy; el componente es el mismo.
        (() => {
            const _gt = _byComponent(QGoalTarget);
            return _gt && {
                ..._gt,
                subtitle: t('Cuantificar la meta nos deja calibrar tus calorías y macros a tu medida.'),
            };
        })(),
        _byField('dietType'),
        _byField('allergies'),
        _byField('medicalConditions'),
        // [P1-COUNTRY-SYSTEM-F0 · 2026-08-16] Mismo gate que en planOnlySteps —
        // el país también se pregunta en la rama contador cuando el sistema esté
        // encendido. `_byField` ya lo resuelve desde planOnlySteps (donde vive el
        // step real); `.filter(Boolean)` defensivo si el gate está true pero el
        // step no se encontrara.
        // [P2-TRACKING-COUNTRY-INERT · 2026-08-21] El copy del step real promete «tus platos,
        // medidas y — donde ya está listo — los precios del súper». En la rama contador NO hay
        // platos generados ni lista de la compra ni precios: la pregunta se hacía con una promesa
        // que esa rama no puede cumplir, y el usuario la contesta creyendo que decide algo que no
        // va a pasar. Se sobreescribe SÓLO el subtítulo — mismo patrón y misma razón que el step de
        // objetivos doce líneas más arriba, que ya lo hace («en esta rama no hay plan por diseño»).
        //
        // Lo que el país SÍ hace aquí, y por eso la pregunta se queda: filtra las sugerencias del
        // coach (`suggest_foods_for_nutrient`), decide el aviso de calibración del escáner y fija
        // el huso con el que se corta el día del diario y del agua.
        ...(COUNTRY_SYSTEM_UI
            ? [_byField('country')].filter(Boolean).map((_s) => ({
                ..._s,
                subtitle: t('Adapta las sugerencias del coach y cómo se leen los alimentos que registras.'),
            }))
            : []),
        {
            // [AUDIT-FORM-COPY · 2026-08-12] «Listo:» prometía completitud AL
            // ENTRAR al paso, con dos llamadas de red aún por delante que pueden
            // fallar. El título nombra el paso; el «listo» lo declara el toast
            // de éxito, que sí sabe si lo está.
            title: <>{t('Último paso: tu contador')}</>,
            subtitle: t('Sin plan generado, sin gastar créditos. Lo enciendes cuando quieras.'),
            hasInternalNext: true,
            component: <QTrackingFinish />
        },
    ].filter(Boolean);

    // [P1-GUEST-TRACKING-GUARD · 2026-08-12] `&& !isGuest`, simétrico a
    // isPantryMode: la rama corta termina en DOS fetchWithAuth (PATCH perfil +
    // PUT plan-mode) que a un invitado le devuelven 401 — un appMode='tracking'
    // residual en mealfit_form lo dejaba en un callejón sin salida con la
    // tarjeta del paso 0 deshabilitada (no podía ni ver el porqué).
    const _isTracking = formData.appMode === 'tracking' && !isGuest;
    const steps = _isTracking ? _trackingSteps : [_appModeStep, ...planOnlySteps];
    // [P1-ARQ25-F4-FORM · 2026-09-03] Embudo del wizard (línea base del gate de la Fase 4): un
    // `step_view` por paso visto, `wizard_start`/`wizard_restore` una vez por montaje, flush al
    // ocultar la pestaña. Best-effort y con opt-out: nunca condiciona el wizard.
    const _wizardStartedRef = useRef(false);
    useEffect(() => {
        const step = steps[currentStep];
        const field = (step?.fields || [])[0] || null;
        const meta = {
            step_id: field || `step_${currentStep}`, field, index: currentStep, total: steps.length,
            app_mode: formData.appMode || null, plan_source: formData.planSource || null,
            policy_form: PLAN_POLICY_FORM_UI, form_version: PLAN_POLICY_FORM_UI ? 'v2' : 'v1',
        };
        if (!_wizardStartedRef.current) {
            _wizardStartedRef.current = true;
            trackWizard(currentStep > 0 ? 'wizard_restore' : 'wizard_start', meta);
        }
        trackWizard('step_view', meta);
    }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const onHide = () => flushWizardTelemetry({ beacon: true });
        window.addEventListener('pagehide', onHide);
        return () => {
            window.removeEventListener('pagehide', onHide);
            flushWizardTelemetry({ beacon: true });
        };
    }, []);

    // [P1-GUEST-STALE-SANEO · 2026-08-12] Valores residuales de una sesión
    // autenticada previa que el modo invitado no puede ejercer: se LIMPIAN, no
    // solo se neutralizan. Sin esto, planSource='pantry' stale viajaba en el
    // SSE y la tarjeta quedaba marcada Y deshabilitada — imposible de
    // desmarcar; y appMode='tracking' re-activaba la rama corta al cerrar el
    // guard de arriba... para siempre, porque nadie lo reseteaba.
    useEffect(() => {
        if (!isGuest) return;
        if (formData.planSource === 'pantry') updateData('planSource', '');
        if (formData.appMode === 'tracking') updateData('appMode', '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGuest, formData.planSource, formData.appMode]);

    // [P1-FORM-1] Mapping `field → step index` derivado del array `steps` en
    // runtime. Reemplaza el constante hardcoded `FIELD_TO_STEP_INDEX` que
    // requería actualización manual cada vez que se reordenaba/insertaba un
    // step.
    //
    // [P1-PLAN-MODE · 2026-08-11] Las deps VACÍAS de antes eran ciertas por
    // accidente: el único paso condicional (pantry) iba al final y sin `fields`.
    // Con el formulario bifurcado por modo, un array que cambia de largo en medio
    // rompería las dos condiciones a la vez, y el síntoma es el toast «Te llevamos
    // al paso correspondiente» llevando AL PASO EQUIVOCADO — el bug exacto que
    // P1-FORM-1 cerró. La dep es la FIRMA de la forma real: cambia cuando cambia
    // qué campo vive en qué paso, y nada más.
    const stepsShape = steps.map((st) => (st.fields || []).join(',')).join('>');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const fieldToStepIndex = useMemo(() => buildFieldToStepIndex(steps), [stepsShape]);

    // [P1-PLAN-MODE · 2026-08-11] Trampa 2: `currentStep` persiste en localStorage y
    // es un ÍNDICE, no un identificador. Si el modo con el que se guardó no es el
    // actual, el índice no significa NADA — y el clamp genérico lo empeora: recorta
    // al último paso, que en seguimiento es el CIERRE, o sea aterrizar en «Listo»
    // sin haber contestado Condiciones Médicas. Regla: modo distinto ⇒ el índice se
    // tira y se recalcula al primer paso de la rama nueva.
    useEffect(() => {
        let _prevMode = null;
        _prevMode = safeLocalStorageGet('mealfit_wizard_step_mode', null);
        const _mode = _isTracking ? 'tracking' : 'plan';
        if (_prevMode !== _mode) {
            safeLocalStorageSet('mealfit_wizard_step_mode', _mode);
            // [P1-WIZARD-MAXSTEP-BRANCH · 2026-08-12] maxReachedStep también es DE LA
            // RAMA, y se tira junto con currentStep. Heredarlo era el bug: llegar al
            // paso 9 de la rama corta hacía `canSkip=true` en los pasos 1-8 de la
            // rama del PLAN — pasos JAMÁS visitados mostraban «Siguiente Paso» y
            // «Saltar» con preguntas obligatorias sin contestar (el horario cotidiano
            // se saltaba en la práctica). Un índice máximo solo significa algo en el
            // array donde se alcanzó.
            //
            // [P1-MAXSTEP-LANDING-PARITY · 2026-08-12] El máximo aterriza DONDE
            // aterriza el paso, no en 1 fijo: con currentStep=0 (reset «desde cero»
            // seguido de cambio de modo), un max=1 encendía canSkip en el paso 0 y
            // «Siguiente» aparecía sin contestar la pregunta obligatoria — la misma
            // clase de bug que este efecto existe para impedir.
            if (_prevMode !== null) {
                const _landing = currentStep > 0 ? Math.min(1, steps.length - 1) : 0;
                if (currentStep > 0) {
                    // Volver al paso 1 de la rama nueva (el 0 es QAppMode, ya contestado).
                    setCurrentStep(_landing);
                }
                setMaxReachedStep(_landing);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_isTracking]);

    const currentStepConfig = steps[currentStep] || steps[0];
    const hasCompletedBefore = !!planData;
    const canSkip = (currentStep < maxReachedStep) || hasCompletedBefore;

    // [P1-FORM-AUDIT-BATCH · 2026-07-03] Clamp REAL al nº de pasos: el clamp del provider
    // admite hasta 100 (genérico, no conoce steps.length). Con un `mealfit_wizard_step`
    // stale > 18 (storage corrupto o un deploy futuro que reduzca pasos) se renderizaba
    // steps[0] por el fallback pero el kicker decía "Paso 21 de 19" y la barra >100%.
    useEffect(() => {
        if (currentStep > steps.length - 1) {
            setCurrentStep(steps.length - 1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep]);

    // [BUDGET-CUSTOM · 2026-05-31] Validación extra por-step (scoped). Ej: el
    // step de presupuesto exige `budgetAmount > 0` cuando budget==='custom'. Se
    // calcula aparte para poder gatear el botón "Siguiente" INCLUSO cuando
    // `canSkip` es true (usuario que ya completó el form / llegó más lejos
    // antes) — si solo viviera dentro de `stepFieldsFilled`, la condición
    // `canSkip || stepFieldsFilled` lo bypassearía y se podría avanzar con
    // budget='custom' SIN monto.
    const stepExtraValid = typeof currentStepConfig.validateExtra !== 'function'
        || currentStepConfig.validateExtra(formData);

    // [P6-FORM-MANUAL-EXIT] Si los campos del step actual están llenos
    // (sea por click fresh, sea por hidratación de sesión anterior), el
    // usuario puede avanzar manualmente. Cubre el caso donde auto-advance
    // no se disparó (valor pre-existente, doble-click, etc.) — antes el
    // botón "Siguiente" solo aparecía si `canSkip` y el usuario quedaba
    // atrapado en step 0 con valor pre-seteado.
    const stepFieldsFilled = Array.isArray(currentStepConfig.fields)
        && currentStepConfig.fields.length > 0
        && currentStepConfig.fields.every((f) => {
            const v = formData[f];
            if (v === undefined || v === null || v === '') return false;
            if (Array.isArray(v) && v.length === 0) return false;
            return true;
        })
        && stepExtraValid;

    // [P3-FORM-NO-AUTO-ADVANCE-WHEN-MANUAL-BUTTONS · 2026-05-08] Sincronizar
    // ref con la visibilidad real de los botones manuales. Ver el comentario
    // en `handleAutoAdvance`. Se asigna durante el render (no es side effect:
    // es mutación de ref, segura en React) para que el siguiente click del
    // usuario lea el valor del último render.
    manualButtonsVisibleRef.current = (canSkip || stepFieldsFilled) && stepExtraValid;

    // [P1-B4] Handler para "Saltar a la última pregunta". Antes el onClick
    // hacía `setCurrentStep(steps.length - 1)` directo: si el usuario había
    // completado el flow antes (`hasCompletedBefore`) pero después manipuló
    // localStorage o limpió un campo y volvió, `maxReachedStep` seguía alto y
    // el salto a la última pregunta + click en "Finalizar" produciría un 422
    // del backend (ahora capturado por P0-B3 también, pero la UX sería confusa
    // sin contexto). Ahora: si falta algún `_REQUIRED_FORM_FIELDS`, llevamos
    // al usuario al primer step incompleto en lugar de al final.
    const handleSkipToLastStep = () => {
        // [P1-14] Guard contra race con la hidratación del sensitive cifrado
        // (`mealfit_form_secure`) y/o `fetchProfile` desde DB. Sin este
        // guard, un click rápido durante la ventana de descifrado (50-200ms)
        // o el fetch del profile (100-500ms en primer login en otro
        // dispositivo) hacía que `findFirstIncompleteField` leyera
        // `allergies=[]` / `motivation=''` / etc. (defaults vacíos) → el
        // toast "Antes de saltar, completa: Alergias" + redirect aparecía
        // PESE A QUE los datos SÍ están en storage cifrado o en DB.
        // Mismo patrón aplicado a `onFinish` de QSupplements (P1-3) y a
        // `Plan.jsx` (P0-13). Aquí cerramos el último call site afectado.
        if (loadingSensitive) {
            toast.info(t('Cargando tus datos…'), {
                description: t('Esperando a que se sincronice tu perfil. Inténtalo en unos segundos.'),
                duration: 3000,
            });
            return;
        }
        // [P1-TRACKING-SKIP-CONTRACT · 2026-08-12] El salto valida contra el contrato
        // DE LA RAMA ACTUAL. Con el del plan (22 campos), en modo contador exigía
        // «Tu horario cotidiano» — un campo cuyo paso NO existe en esta rama, así
        // que fieldToStepIndex tampoco podía llevarte a él: toast y botón muerto.
        // (El submit del plan, arriba, se queda con el contrato completo: la rama
        // contador termina en QTrackingFinish y nunca lo pisa.)
        const missing = _isTracking
            ? findFirstIncompleteFieldFor(formData, TRACKING_REQUIRED_FIELDS)
            : findFirstIncompleteField(formData);
        if (missing) {
            const stepIdx = fieldToStepIndex[missing];
            const label = getFieldLabel(missing, t);
            toast.info(t('Antes de saltar, completa: {campo}', { campo: label }), {
                description: typeof stepIdx === 'number' ? t('Te llevamos al paso correspondiente.') : t('Revisalo antes de continuar.'),
                duration: 4000,
            });
            if (typeof stepIdx === 'number') {
                setCurrentStep(stepIdx);
            }
            return;
        }
        // [P1-OUTSCOPE-SKIP-GATE · 2026-08-12] El gate clínico «fuera de alcance»
        // también sobrevive al salto (misma clase que el presupuesto: la regla
        // vivía SOLO en el disabled del botón del paso, y saltar es no pasar por
        // el paso). Aplica en AMBAS ramas — el chip existe en las dos.
        if (hasOutOfScopeMedical(formData)) {
            toast.info(t('Tu condición o medicamento marcado está fuera del alcance del plan.'), {
                description: t('Revisa el paso de condiciones médicas antes de continuar.'),
                duration: 4500,
            });
            const _medIdx = fieldToStepIndex['medicalConditions'];
            if (typeof _medIdx === 'number') setCurrentStep(_medIdx);
            return;
        }
        // [P1-SKIP-RESPECTS-BUDGET · 2026-08-09] `findFirstIncompleteField` mira
        // PRESENCIA, y con «Personalizar» el campo `budget` está presente ('custom')
        // aunque el monto sea inválido — el salto se iba a un paso posterior dejando
        // atrás el de presupuesto a medias. El mismo chequeo que ya hacía el submit,
        // ahora también aquí, desde el SSOT compartido.
        // Presupuesto es un paso del PLAN: en la rama contador ni se pregunta.
        if (!_isTracking && !isCustomBudgetValid(formData)) {
            toast.info(t('Antes de saltar, completa: Presupuesto'), {
                description: t('Elegiste "Personalizar" y el monto no llega al mínimo.'),
                duration: 4000,
            });
            const _budgetIdx = fieldToStepIndex['budget'];
            if (typeof _budgetIdx === 'number') setCurrentStep(_budgetIdx);
            return;
        }
        setCurrentStep(steps.length - 1);
    };

    return (
        <InteractiveAssessmentLayout
            totalSteps={steps.length}
            stepKey={currentStep}
            title={currentStepConfig.title}
            subtitle={currentStepConfig.subtitle}
        >
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', position: 'relative' }}>
                <div style={{ flex: 1 }}>
                    {currentStepConfig.component}
                </div>
                
                {(canSkip || stepFieldsFilled) && stepExtraValid && !isAutoAdvancing && (
                    <div style={{
                        /* [P2-WIZARD-NAV-GAP-UNIFORM · 2026-09-04] Con `hasInternalNext` el
                           «Siguiente» lo pinta la pregunta (NextButton, marginTop 2rem) y este
                           bloque solo trae «Saltar…»: sus 2rem se SUMABAN al botón de arriba y la
                           pareja quedaba a 32 px, contra los 12 px (gap 0.75rem) de los pasos
                           normales. La distancia entre los dos botones es la misma en todos los
                           pasos; los 2rem son la separación contenido → botones, no botón → botón. */
                        marginTop: currentStepConfig.hasInternalNext ? '0.75rem' : '2rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        animation: 'fadeIn 0.3s ease-in-out'
                    }}>
                        {/* [FORM-CTA-UNIFY · 2026-07-02] Antes este botón era una
                            píldora plana indigo inline, DISTINTA del NextButton
                            gradiente (indigo→esmeralda) que renderizan los steps
                            con hasInternalNext — dos looks para la misma acción.
                            Ahora ambos paths usan el mismo componente. */}
                        {/* [P2-WIZARD-NEXT-REQUIRES-FIELDS · 2026-09-04] Este bloque aparece con
                            `canSkip` (usuario que ya completó el formulario o que vuelve atrás)
                            AUNQUE el paso esté vacío, y `nextStep` no valida nada: «Siguiente
                            Paso» dejaba pasar una pregunta obligatoria sin responder (captura del
                            dueño: paso 18, mealOrganization, marcado con *). Los pasos con
                            hasInternalNext ya deshabilitan su propio NextButton; aquí faltaba la
                            misma puerta. Todo paso con `fields` es obligatorio (los «(Opcional)»
                            no declaran fields). */}
                        {!currentStepConfig.hasInternalNext && (
                            <NextButton
                                onClick={nextStep}
                                disabled={Array.isArray(currentStepConfig.fields) && currentStepConfig.fields.length > 0 && !stepFieldsFilled}
                                label={t('Siguiente Paso')}
                                style={{ marginTop: 0 }}
                            />
                        )}
                        
                        {/* [P6-FORM-SKIP-ALWAYS] Pre-fix: solo aparecía si
                         * `hasCompletedBefore` (planData existente). Eso
                         * dejaba a usuarios first-time sin opción de skip
                         * aunque tuvieran data parcialmente cargada (ej.
                         * desde un perfil otra ruta). El handler
                         * `handleSkipToLastStep` YA valida defensivamente:
                         * si falta algún `_REQUIRED_FORM_FIELDS`, redirige
                         * al primer step incompleto con toast informativo.
                         * Por eso es seguro mostrarlo sin exigir que el
                         * formulario esté completo — peor caso es 1 click →
                         * toast → primer step incompleto. (En qué pasos se
                         * muestra lo decide P1-SKIP-ALWAYS-REACHABLE, abajo.) */}
                        {/* [FORM-CTA-UNIFY · 2026-07-02] Ghost secundario a
                            propósito (jerarquía: acción alternativa, no debe
                            competir con el CTA gradiente). Hover/focus viven en
                            .mf-ghost-btn (index.css) — antes eran handlers JS
                            onMouseOver que no cubrían focus de teclado. */}
                        {/* [P1-SKIP-ALWAYS-REACHABLE · 2026-08-10] El botón existía SOLO
                         * en el paso 0, y por eso el dueño no lo encontraba nunca.
                         *
                         * No era cosa del móvil: medido como invitado, en el paso 1 no
                         * aparece NI en teléfono NI en escritorio, y `.mf-ghost-btn` no
                         * tiene una sola regla que dependa del ancho. Lo que lo escondía
                         * es la combinación con [P1-FORM-RESUME]: el formulario arranca
                         * en el paso que guardaste (`_initialStep` en AssessmentContext),
                         * así que quien ya avanzó no vuelve a pasar por el paso 0 — el
                         * atajo quedaba fuera del alcance de EXACTAMENTE la persona para
                         * la que se escribió, la que ya tiene un plan y vuelve. Y como
                         * `localStorage` es por dispositivo, en el teléfono (con progreso
                         * guardado) no salía y en el PC (recién estrenado, paso 0) sí:
                         * de ahí la impresión de que era un problema de móvil.
                         *
                         * Ahora se muestra mientras `canSkip` —o sea: ya llegaste más
                         * lejos antes, o ya tienes un plan hecho— y no estés en la última
                         * pregunta, donde saltar sería saltar a donde ya estás.
                         *
                         * El flujo lineal de quien entra por primera vez NO cambia: ahí
                         * `canSkip` es false y el botón sigue sin aparecer.
                         *
                         * Sigue siendo seguro mostrarlo en cualquier paso porque
                         * `handleSkipToLastStep` valida antes de saltar y devuelve al
                         * primer campo incompleto con un aviso (P1-SKIP-RESPECTS-BUDGET). */}
                        {canSkip && currentStep < steps.length - 1 && (
                            <button
                                onClick={handleSkipToLastStep}
                                className="mf-ghost-btn"
                            >
                                {t('Saltar a la última pregunta')} <ChevronsRight size={18} />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </InteractiveAssessmentLayout>
    );
};

export default InteractiveAssessmentFlow;
