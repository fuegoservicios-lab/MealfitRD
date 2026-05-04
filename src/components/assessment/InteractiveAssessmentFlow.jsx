import { useAssessment } from '../../context/AssessmentContext';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef } from 'react';
import InteractiveAssessmentLayout from './InteractiveAssessmentLayout';
import {
    QGender, QMeasurements, QActivityLevel, QSchedule,
    QSleep, QStress, QCookingTime, QBudget, QHousehold,
    QDietType, QAllergies, QDislikes, QMedical, QMainGoal, QStruggles,
    QMotivation, QSupplements
} from './questions/InteractiveQuestions';
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
import { buildFieldToStepIndex, FIELD_LABELS, findFirstIncompleteField } from '../../config/formValidation';

const InteractiveAssessmentFlow = () => {
    const { currentStep, setCurrentStep, nextStep, formData, saveGeneratedPlan, maxReachedStep, planData } = useAssessment();
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

    // Auto advance helper with a slight delay for better UX
    const handleAutoAdvance = () => {
        setTimeout(() => {
            nextStep();
        }, 300);
    };

    // The sequence of steps
    // [P1-FORM-1] Cada step que captura campos `REQUIRED_FORM_FIELDS` declara
    // explícitamente su propiedad `fields: [...]`. El array es la única fuente
    // de verdad: el orden determina el índice, y `buildFieldToStepIndex` (más
    // abajo) construye el mapping `field → step index` en runtime. Reordenar
    // o insertar steps no rompe la navegación a campo faltante.
    const steps = [
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
            title: <>¿Cuánto tiempo tienes para cocinar?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Te daremos recetas reales que se ajusten a tu agenda.",
            fields: ['cookingTime'],
            component: <QCookingTime onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>Tu presupuesto para compras&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Ajustaremos los ingredientes para no afectar tu bolsillo.",
            fields: ['budget'],
            component: <QBudget onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>Tu Hogar y Despensa&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Esto personaliza tu lista de compras y las cantidades.",
            hasInternalNext: true,
            fields: ['householdSize', 'groceryDuration'],
            component: <QHousehold onManualAdvance={nextStep} />
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

    // [P1-B4] Handler para "Saltar a la última pregunta". Antes el onClick
    // hacía `setCurrentStep(steps.length - 1)` directo: si el usuario había
    // completado el flow antes (`hasCompletedBefore`) pero después manipuló
    // localStorage o limpió un campo y volvió, `maxReachedStep` seguía alto y
    // el salto a la última pregunta + click en "Finalizar" produciría un 422
    // del backend (ahora capturado por P0-B3 también, pero la UX sería confusa
    // sin contexto). Ahora: si falta algún `_REQUIRED_FORM_FIELDS`, llevamos
    // al usuario al primer step incompleto en lugar de al final.
    const handleSkipToLastStep = () => {
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
            title={currentStepConfig.title}
            subtitle={currentStepConfig.subtitle}
        >
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', position: 'relative' }}>
                <div style={{ flex: 1 }}>
                    {currentStepConfig.component}
                </div>
                
                {canSkip && (
                    <div style={{ 
                        marginTop: '2rem', 
                        display: 'flex', 
                        flexDirection: 'column',
                        gap: '0.75rem', 
                        animation: 'fadeIn 0.3s ease-in-out' 
                    }}>
                        {!currentStepConfig.hasInternalNext && (
                            <button 
                                onClick={nextStep}
                                style={{ 
                                    padding: '1rem', 
                                    background: 'var(--primary)', 
                                    color: 'white', 
                                    border: 'none', 
                                    borderRadius: '12px', 
                                    fontWeight: '600', 
                                    fontSize: '1rem',
                                    cursor: 'pointer', 
                                    transition: 'all 0.2s',
                                    width: '100%'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                                onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                            >
                                Siguiente Paso ➔
                            </button>
                        )}
                        
                        {currentStep === 0 && hasCompletedBefore && (
                            <button
                                onClick={handleSkipToLastStep}
                                style={{ 
                                    padding: '1rem', 
                                    background: 'transparent', 
                                    color: 'var(--text-secondary)', 
                                    border: '1px solid var(--border)', 
                                    borderRadius: '12px', 
                                    fontWeight: '600', 
                                    fontSize: '1rem',
                                    cursor: 'pointer', 
                                    transition: 'all 0.2s',
                                    width: '100%'
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.background = 'var(--bg-card)';
                                    e.currentTarget.style.color = 'var(--text-primary)';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--text-secondary)';
                                }}
                            >
                                Saltar a la última pregunta ⏭
                            </button>
                        )}
                    </div>
                )}
            </div>
        </InteractiveAssessmentLayout>
    );
};

export default InteractiveAssessmentFlow;
