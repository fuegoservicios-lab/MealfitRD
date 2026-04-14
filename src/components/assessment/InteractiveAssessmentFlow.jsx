import { useAssessment } from '../../context/AssessmentContext';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import InteractiveAssessmentLayout from './InteractiveAssessmentLayout';
import { 
    QGender, QMeasurements, QActivityLevel, QSchedule, 
    QSleep, QStress, QCookingTime, QBudget, QDietType, 
    QAllergies, QMedical, QMainGoal, QStruggles, 
    QMotivation, QSupplements 
} from './questions/InteractiveQuestions';
import { toast } from 'sonner';

const InteractiveAssessmentFlow = () => {
    const { currentStep, setCurrentStep, nextStep, formData, saveGeneratedPlan, maxReachedStep } = useAssessment();
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Auto advance helper with a slight delay for better UX
    const handleAutoAdvance = () => {
        setTimeout(() => {
            nextStep();
        }, 300);
    };

    // The sequence of steps
    const steps = [
        {
            title: <>¿Eres hombre o mujer?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Las necesidades nutricionales varían según tu sexo biológico.",
            component: <QGender onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>Tus Medidas&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Ingresa tu edad, altura y peso para calcular tus macros con precisión.",
            hasInternalNext: true,
            component: <QMeasurements onManualAdvance={nextStep} />
        },
        {
            title: <>¿Cuál es tu nivel de actividad física?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Considera tanto tu trabajo como tus entrenamientos.",
            component: <QActivityLevel onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Cómo es tu horario cotidiano?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Adaptaremos los horarios de tus comidas a tu reloj biológico.",
            component: <QSchedule onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Cuántas horas duermes?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "La calidad de tu sueño afecta directamente tu metabolismo.",
            component: <QSleep onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Cuál es tu nivel de estrés diario?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Un alto nivel de estrés puede dificultar la pérdida de grasa.",
            component: <QStress onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Cuánto tiempo tienes para cocinar?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Te daremos recetas reales que se ajusten a tu agenda.",
            component: <QCookingTime onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>Tu presupuesto para compras&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Ajustaremos los ingredientes para no afectar tu bolsillo.",
            component: <QBudget onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Qué tipo de dieta prefieres?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Selecciona el estilo de alimentación que más disfrutes.",
            component: <QDietType onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: <>¿Tienes alguna alergia o intolerancia?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Marca todas las opciones que apliquen.",
            hasInternalNext: true,
            component: <QAllergies onManualAdvance={nextStep} />
        },
        {
            title: "Condiciones Médicas (Opcional)",
            subtitle: "Si tienes alguna condición preexistente, la IA lo considerará.",
            hasInternalNext: true,
            component: <QMedical onManualAdvance={nextStep} />
        },
        {
            title: <>¿Cuál es tu objetivo PRINCIPAL?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Define la meta que quieres lograr con este plan.",
            component: <QMainGoal onAutoAdvance={handleAutoAdvance} />
        },
        {
            title: "Mayores Obstáculos",
            subtitle: "¿Qué crees que te ha impedido lograrlo antes?",
            hasInternalNext: true,
            component: <QStruggles onManualAdvance={nextStep} />
        },
        {
            title: <>¿Por qué quieres hacer esto AHORA?&nbsp;<span style={{ color: '#EF4444' }}>*</span></>,
            subtitle: "Escribe tu motivación real. Esto será tu gasolina en días difíciles.",
            hasInternalNext: true,
            component: <QMotivation onManualAdvance={nextStep} />
        },
        {
            title: "Suplementación (Opcional)",
            subtitle: "¿Te gustaría incluir suplementos profesionales en tu plan?",
            hasInternalNext: true,
            component: <QSupplements 
                onFinish={async () => {
                    if(isSubmitting) return;
                    setIsSubmitting(true);
                    toast.loading("Analizando tus respuestas...", { id: "generating" });
                    
                    try {
                        // In a real scenario, here we trigger the API call to generate the plan.
                        // For now we simulate generation and redirect to Processing/Dashboard
                        setTimeout(() => {
                            toast.dismiss("generating");
                            navigate('/plan');
                        }, 1500);
                    } catch (error) {
                        toast.error("Ocurrió un error");
                        setIsSubmitting(false);
                    }
                }} 
                isSubmitting={isSubmitting} 
            />
        }
    ];

    const currentStepConfig = steps[currentStep] || steps[0];
    const hasCompletedBefore = !!formData?.gender && !!formData?.mainGoal;
    const canSkip = (currentStep < maxReachedStep) || hasCompletedBefore;

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
                        
                        {(maxReachedStep > currentStep || hasCompletedBefore) && currentStep < steps.length - 1 && (
                            <button 
                                onClick={() => setCurrentStep(hasCompletedBefore ? steps.length - 1 : maxReachedStep)}
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
                                {hasCompletedBefore ? "Saltar a última pregunta ⏭" : "Saltar a donde estaba ⏭"}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </InteractiveAssessmentLayout>
    );
};

export default InteractiveAssessmentFlow;
