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
import { buildFieldToStepIndex, FIELD_LABELS, findFirstIncompleteField, minBudgetFor } from '../../config/formValidation';

const InteractiveAssessmentFlow = () => {
    const { currentStep, setCurrentStep, nextStep, formData, maxReachedStep, planData, loadingSensitive } = useAssessment();
    const navigate = useNavigate();
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
        setTimeout(() => {
            nextStep();
            setIsAutoAdvancing(false);
        }, 300);
    };

    // [P6-FORM-FLASH-FIX] Reset defensivo: si el usuario navega manualmente
    // (prevStep, jump, etc.) durante el setTimeout, el flag debe limpiarse
    // al cambiar de step para no esconder el botón en el siguiente.
    useEffect(() => {
        setIsAutoAdvancing(false);
    }, [currentStep]);

    // The sequence of steps
    // [P1-FORM-1] Cada step que captura campos `REQUIRED_FORM_FIELDS` declara
    // explícitamente su propiedad `fields: [...]`. El array es la única fuente
    // de verdad: el orden determina el índice, y `buildFieldToStepIndex` (más
    // abajo) construye el mapping `field → step index` en runtime. Reordenar
    // o insertar steps no rompe la navegación a campo faltante.
    const steps = [
        // [P1-PANTRY-FIRST-PLAN · 2026-07-11] F3: primera decisión del formulario —
        // plan libre vs construido desde la Nevera. Campo `planSource` viaja en el
        // payload del SSE (spread de formData); el backend inyecta el inventario
        // server-side cuando planSource='pantry'. Sin `fields` requeridos (default
        // 'scratch' → usuarios existentes/guests no se bloquean).
        {
            title: <>¿Cómo quieres crear tu plan?</>,
            subtitle: "Diseño libre con IA, o un plan construido alrededor de lo que ya tienes en tu Nevera.",
            component: <QPlanSource onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Eres hombre o mujer?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Las necesidades nutricionales varían según tu sexo biológico.",
            fields: ['gender'],
            component: <QGender onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>Tus Medidas&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Ingresa tu edad, altura y peso para calcular tus macros con precisión.",
            hasInternalNext: true,
            fields: ['age', 'height', 'weight', 'weightUnit'],
            component: <QMeasurements onManualAdvance={nextStep} />
        },
        {
            title: <>¿Cuál es tu nivel de actividad física?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Considera tanto tu trabajo como tus entrenamientos.",
            fields: ['activityLevel'],
            component: <QActivityLevel onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Cómo es tu horario cotidiano?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Adaptaremos los horarios de tus comidas a tu reloj biológico.",
            fields: ['scheduleType'],
            component: <QSchedule onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Cuántas horas duermes?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "La calidad de tu sueño afecta directamente tu metabolismo.",
            fields: ['sleepHours'],
            component: <QSleep onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Cuál es tu nivel de estrés diario?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Un alto nivel de estrés puede dificultar la pérdida de grasa.",
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
            title: <>Tus hábitos de consumo</>,
            subtitle: "Alcohol, tabaco, cafeína y agua cambian cómo calibramos tu plan (y cómo interactúa con tus medicamentos).",
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
            title: <>¿Cuánto tiempo tienes para cocinar?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Te daremos recetas reales que se ajusten a tu agenda.",
            fields: ['cookingTime'],
            component: <QCookingTime onAutoAdvance={handleAutoAdvance} />
        },
        {
            // [BUDGET-ORDER · 2026-05-31] "Frecuencia de tus compras" va ANTES que
            // "Tu presupuesto" (pedido del usuario). Además es más coherente: el
            // ciclo de compras (groceryDuration) contextualiza el monto custom del
            // presupuesto (`build_budget_context` lo usa: "RD$X para tu ciclo
            // quincenal"). El orden de captura no afecta los datos — ambos se
            // envían juntos al final.
            title: <>Frecuencia de tus compras&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Con esto calculamos cuánto comprar cada vez para que ningún ingrediente se dañe ni te falte antes del próximo mercado.",
            hasInternalNext: true,
            fields: ['groceryDuration'],
            component: <QHousehold onManualAdvance={nextStep} />
        },
        {
            title: <>Tu presupuesto para compras&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Ajustaremos los ingredientes para no afectar tu bolsillo.",
            fields: ['budget'],
            // [BUDGET-CUSTOM · 2026-05-31] Si el usuario eligió "Personalizar"
            // (budget==='custom'), el monto total debe alcanzar el MÍNIMO viable
            // ([BUDGET-MIN]: escalado por duración + moneda vía `minBudgetFor`,
            // SSOT compartido con el hint de QBudget) para habilitar "Siguiente
            // Paso". Scoped a este step para no bloquear otros cuando budget='custom'.
            // [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Usa el piso PERSONALIZADO que QBudget
            // sincronizó a `_budgetFloorMin` (calorías × hogar × ciclo, = el que exige el backend);
            // fallback al estático `minBudgetFor` si aún no llegó (red lenta / offline).
            validateExtra: (fd) => fd.budget !== 'custom'
                || Number(fd.budgetAmount) >= (Number(fd._budgetFloorMin) || minBudgetFor(fd.budgetCurrency || 'DOP', fd.groceryDuration)),
            component: <QBudget onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Qué tipo de dieta prefieres?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Selecciona el estilo de alimentación que más disfrutes.",
            fields: ['dietType'],
            component: <QDietType onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Tienes alguna alergia o intolerancia?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Marca todas las opciones que apliquen.",
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
            title: <>Alimentos que no te gustan&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Selecciona los que apliquen, escribe otros, o marca \"Ninguno\" si no rechazas ningún alimento.",
            hasInternalNext: true,
            fields: ['dislikes'],
            component: <QDislikes onManualAdvance={nextStep} />
        },
        {
            // [P1-FORM-7] Quitamos "(Opcional)" del title — era misleading:
            // QMedical ahora requiere señal explícita (chip / "Ninguna" /
            // free-text) para avanzar. Una condición silenciada por copy
            // engañosa puede ser un riesgo de seguridad médica si el LLM
            // no la respeta. El asterisco rojo señala "respuesta requerida"
            // (no "tienes que tener una condición").
            title: <>Condiciones Médicas&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Marca todas las que apliquen, escribe otras, o marca \"Ninguna\" si no tienes ninguna condición preexistente.",
            hasInternalNext: true,
            fields: ['medicalConditions'],
            component: <QMedical onManualAdvance={nextStep} />
        },
        {
            title: <>¿Cuál es tu objetivo PRINCIPAL?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Define la meta que quieres lograr con este plan.",
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
            title: <>Tu meta de peso</>,
            subtitle: "Cuantificar la meta nos deja calibrar el ritmo del plan a tu medida — o déjala en manos de la IA.",
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
            title: <>Mayores Obstáculos&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Marca los que apliquen, escribe otros, o marca \"Ninguno\" si no identificas obstáculos específicos.",
            hasInternalNext: true,
            fields: ['struggles'],
            component: <QStruggles onManualAdvance={nextStep} />
        },
        {
            title: <>¿Por qué quieres hacer esto AHORA?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Escribe tu motivación real. Esto será tu gasolina en días difíciles.",
            hasInternalNext: true,
            fields: ['motivation'],
            component: <QMotivation onManualAdvance={nextStep} />
        },
        {
            title: "Suplementación (Opcional)",
            subtitle: "¿Te gustaría incluir suplementos profesionales en tu plan?",
            hasInternalNext: true,
            component: <QSupplements
                onFinish={async () => {
                    // [P1-FORM-4] Guard síncrono PRIMERO (ref), luego state.
                    // El ref captura clicks dentro de la misma React frame;
                    // el state captura el caso (raro pero posible) donde la
                    // ref se reinició pero el state aún muestra el botón
                    // disabled (transición de unmount→remount).
                    if (submittingRef.current || isSubmitting) return;

                    // [P1-3] Si el descifrado del sensitive cifrado todavía
                    // está en vuelo (caso raro: usuario que loggea en otro
                    // tab mientras este wizard corre, o token refresh
                    // disparado durante el flow), no validamos contra campos
                    // sensibles potencialmente vacíos. Toast neutral y NO
                    // tocamos `submittingRef` — el usuario puede reintentar
                    // en <1s una vez termine la hidratación.
                    if (loadingSensitive) {
                        toast.info('Cargando tus datos…', {
                            description: 'Esperando a que se sincronice tu perfil. Inténtalo en unos segundos.',
                            duration: 3000,
                        });
                        return;
                    }

                    // CRITICAL: setear el ref ANTES de cualquier validación
                    // o async. Si el segundo click llega después de este
                    // punto pero antes de setIsSubmitting (varios ms de
                    // gap por React batching), el ref ya está true y returna.
                    submittingRef.current = true;

                    // [P0-B3] Validación de campos requeridos ANTES de navegar.
                    // Si falta alguno, llevamos al usuario al step correspondiente
                    // y mostramos un toast accionable — preferible a quemar el
                    // check de cuota + recibir 422 genérico desde el backend.
                    const missing = findFirstIncompleteField(formData);
                    if (missing) {
                        // [P1-FORM-4] Liberar el lock: la validación falló,
                        // el usuario debe poder reintentar tras corregir el
                        // campo faltante. Sin esto, el botón quedaría
                        // permanentemente disabled hasta unmount.
                        submittingRef.current = false;
                        const stepIdx = fieldToStepIndex[missing];
                        const label = FIELD_LABELS[missing] || missing;
                        toast.error(`Falta completar: ${label}`, {
                            description: 'Te llevamos al paso correspondiente.',
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
                    if (formData.budget === 'custom') {
                        const _floor = Number(formData._budgetFloorMin)
                            || minBudgetFor(formData.budgetCurrency || 'DOP', formData.groceryDuration);
                        if (!(Number(formData.budgetAmount) >= _floor)) {
                            submittingRef.current = false;
                            toast.error('Tu presupuesto quedó por debajo del mínimo para tu plan.', {
                                description: 'Te llevamos al paso de presupuesto para ajustarlo.',
                                duration: 4000,
                            });
                            const _budgetIdx = fieldToStepIndex['budget'];
                            if (typeof _budgetIdx === 'number') setCurrentStep(_budgetIdx);
                            return;
                        }
                    }

                    // [P1-PANTRY-BUILDER-FLOW · 2026-07-11] Modo "desde mi Nevera" v2
                    // (feedback owner: "el usuario debe tocar la nevera antes de crear el
                    // plan"). El submit ya NO genera: desvía a /pantry en modo constructor —
                    // ahí el usuario agrega/ajusta sus alimentos con un medidor de
                    // factibilidad en vivo y un CTA "Crear mi plan con esta Nevera" que
                    // dispara la generación cuando ÉL decide (navega a /plan con el form
                    // completo ya persistido en el context). El flag vive en sessionStorage:
                    // sobrevive refresh dentro de la pestaña, muere al cerrarla.
                    if (formData.planSource === 'pantry') {
                        submittingRef.current = false;
                        try { sessionStorage.setItem('mealfit_pantry_plan_flow', '1'); } catch { /* no-op */ }
                        toast.info('Último paso: prepara tu Nevera', {
                            description: 'Agrega o confirma los alimentos que tienes; tu plan se construirá con ellos cuando presiones "Crear mi plan".',
                            duration: 7000,
                        });
                        navigate('/dashboard/pantry');  // [P1-PANTRY-ROUTE-ALIAS] ruta canónica ('/pantry' era 404)
                        return;
                    }

                    // [P0-B3] Sin setTimeout artificial: el toast "Analizando..."
                    // del código anterior era engañoso (no analizaba nada, solo
                    // dormía 1.5s antes de navegar). Ahora navegamos directo;
                    // `Plan.jsx` muestra su propio LoadingScreen mientras corre
                    // la generación SSE real.
                    setIsSubmitting(true);
                    try {
                        navigate('/plan');
                    } catch (error) {
                        // [P1-FORM-4] Liberar ambos lock + state en el path
                        // de error. El cleanup del unmount cubre el caso de
                        // navegación exitosa (componente se desmonta).
                        submittingRef.current = false;
                        toast.error('Ocurrió un error al iniciar la generación');
                        setIsSubmitting(false);
                    }
                }}
                isSubmitting={isSubmitting}
            />
        }
    ];

    // [P1-FORM-1] Mapping `field → step index` derivado del array `steps` en
    // runtime. Reemplaza el constante hardcoded `FIELD_TO_STEP_INDEX` que
    // requería actualización manual cada vez que se reordenaba/insertaba un
    // step. `useMemo` con deps vacías porque la estructura de `fields` es
    // estática para la vida del componente (los componentes JSX cambian por
    // closure refresh pero los `fields` declarados son literales constantes).
    // Costo: O(n) microsegundos una sola vez por mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const fieldToStepIndex = useMemo(() => buildFieldToStepIndex(steps), []);

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
            toast.info('Cargando tus datos…', {
                description: 'Esperando a que se sincronice tu perfil. Inténtalo en unos segundos.',
                duration: 3000,
            });
            return;
        }
        const missing = findFirstIncompleteField(formData);
        if (missing) {
            const stepIdx = fieldToStepIndex[missing];
            const label = FIELD_LABELS[missing] || missing;
            toast.info(`Antes de saltar, completa: ${label}`, {
                description: 'Te llevamos al paso correspondiente.',
                duration: 4000,
            });
            if (typeof stepIdx === 'number') {
                setCurrentStep(stepIdx);
            }
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
                        marginTop: '2rem',
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
                        {!currentStepConfig.hasInternalNext && (
                            <NextButton
                                onClick={nextStep}
                                label="Siguiente Paso"
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
                         * Por eso es seguro mostrar el botón siempre en
                         * step 0 — peor caso es 1 click → toast → primer
                         * step incompleto. */}
                        {/* [FORM-CTA-UNIFY · 2026-07-02] Ghost secundario a
                            propósito (jerarquía: acción alternativa, no debe
                            competir con el CTA gradiente). Hover/focus viven en
                            .mf-ghost-btn (index.css) — antes eran handlers JS
                            onMouseOver que no cubrían focus de teclado. */}
                        {currentStep === 0 && (
                            <button
                                onClick={handleSkipToLastStep}
                                className="mf-ghost-btn"
                            >
                                Saltar a la última pregunta <ChevronsRight size={18} />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </InteractiveAssessmentLayout>
    );
};

export default InteractiveAssessmentFlow;
