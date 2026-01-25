import { createContext, useContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const AssessmentContext = createContext();

export const AssessmentProvider = ({ children }) => {
    // 1. CARGAR DATOS PERSISTENTES (LocalStorage)
    // Recuperamos datos previos para que no se pierdan al recargar (F5)
    const savedPlan = localStorage.getItem('mealfit_plan');
    const savedForm = localStorage.getItem('mealfit_form');
    // Recuperamos los likes guardados (si existen)
    const savedLikes = localStorage.getItem('mealfit_likes'); 
    
    // --- ESTADOS DE LA APLICACIÓN ---
    
    // Navegación del Wizard (Pasos)
    const [currentStep, setCurrentStep] = useState(0);
    const [direction, setDirection] = useState(0);

    // Datos del Plan Generado (JSON de la IA)
    const [planData, setPlanData] = useState(savedPlan ? JSON.parse(savedPlan) : null);
    
    // Estado de Likes Persistente { "NombrePlato": true }
    // Esto asegura que los corazones rojos se mantengan al recargar
    const [likedMeals, setLikedMeals] = useState(savedLikes ? JSON.parse(savedLikes) : {});

    // Datos del Formulario de Evaluación
    const [formData, setFormData] = useState(savedForm ? JSON.parse(savedForm) : {
        age: '', gender: '', height: '', weight: '', bodyFat: '', activityLevel: '',
        sleepHours: '', stressLevel: '', cookingTime: '', budget: '', workSchedule: '',
        dietType: '', allergies: [], dislikes: [], medicalConditions: [], otherAllergies: '',
        mainGoal: '', motivation: '', struggles: [],
    });

    // --- IDENTIDAD DE USUARIO (MEMORIA) ---
    useEffect(() => {
        const existingId = localStorage.getItem('mealfit_user_id');
        if (!existingId) {
            // Generamos un ID único para este dispositivo
            const newId = 'user_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('mealfit_user_id', newId);
            console.log("🆔 Nuevo ID de usuario generado:", newId);
        }
    }, []);

    // --- EFECTOS DE PERSISTENCIA ---
    
    // Guardar formulario al cambiar
    useEffect(() => {
        localStorage.setItem('mealfit_form', JSON.stringify(formData));
    }, [formData]);

    // Guardar plan al cambiar
    useEffect(() => {
        if (planData) localStorage.setItem('mealfit_plan', JSON.stringify(planData));
    }, [planData]);

    // Guardar likes al cambiar
    useEffect(() => {
        localStorage.setItem('mealfit_likes', JSON.stringify(likedMeals));
    }, [likedMeals]);

    // --- FUNCIONES Y LÓGICA ---

    // Función para manejar el Like (Visual + API)
    const toggleMealLike = async (mealName, mealType) => {
        const isCurrentlyLiked = !!likedMeals[mealName];
        
        // 1. Actualizar estado visual inmediatamente (Optimistic UI)
        setLikedMeals(prev => ({
            ...prev,
            [mealName]: !isCurrentlyLiked
        }));

        // 2. Si el usuario dio Like (TRUE), enviarlo al backend para que aprenda
        if (!isCurrentlyLiked) {
            try {
                const userId = localStorage.getItem('mealfit_user_id');
                
                // ACTUALIZADO: URL DE PRODUCCIÓN DE N8N
                await fetch('https://agente-de-citas-dental-space-n8n.ofcrls.easypanel.host/webhook/like', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        meal_name: mealName,
                        meal_type: mealType
                    })
                });
                console.log(`❤️ Like enviado a IA: ${mealName}`);
            } catch (error) {
                console.error("Error enviando like:", error);
            }
        }
    };

    // Actualizar campos del formulario
    const updateData = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    // Guardar un nuevo plan generado por la IA
    const saveGeneratedPlan = (data) => {
        setPlanData(data);
        // IMPORTANTE: Al generar un plan nuevo, reseteamos los likes visuales
        // porque son platos nuevos y no queremos corazones "fantasmas".
        setLikedMeals({}); 
    };

    // Navegación
    const nextStep = () => { setDirection(1); setCurrentStep((prev) => prev + 1); };
    const prevStep = () => { setDirection(-1); setCurrentStep((prev) => Math.max(0, prev - 1)); };

    // Resetear toda la app (Cerrar Sesión)
    const resetApp = () => {
        localStorage.removeItem('mealfit_form');
        localStorage.removeItem('mealfit_plan');
        localStorage.removeItem('mealfit_likes'); // Borramos likes locales
        
        // No borramos el user_id para mantener la "memoria" histórica en Supabase
        
        setPlanData(null);
        setLikedMeals({});
        setFormData({
            age: '', gender: '', height: '', weight: '', bodyFat: '', activityLevel: '',
            sleepHours: '', stressLevel: '', cookingTime: '', budget: '', workSchedule: '',
            dietType: '', allergies: [], dislikes: [], medicalConditions: [], otherAllergies: '',
            mainGoal: '', motivation: '', struggles: [],
        });
        setCurrentStep(0);
    };

    return (
        <AssessmentContext.Provider value={{
            currentStep, setCurrentStep, direction,
            formData, updateData, nextStep, prevStep,
            planData, saveGeneratedPlan, 
            likedMeals, toggleMealLike, // Exportamos estado y función de likes para usar en Dashboard
            resetApp
        }}>
            {children}
        </AssessmentContext.Provider>
    );
};

AssessmentProvider.propTypes = { children: PropTypes.node.isRequired };

// eslint-disable-next-line react-refresh/only-export-components
export const useAssessment = () => useContext(AssessmentContext);