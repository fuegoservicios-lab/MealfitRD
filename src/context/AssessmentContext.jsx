import { createContext, useContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabase';
// CORRECCIÓN: Eliminamos generateAIPlan porque no se usa aquí
import { getAlternativeMeal } from '../services/PlanGenerator';

const AssessmentContext = createContext();

export const AssessmentProvider = ({ children }) => {
    // 1. CARGAR DATOS PERSISTENTES (LocalStorage)
    const savedPlan = localStorage.getItem('mealfit_plan');
    const savedForm = localStorage.getItem('mealfit_form');
    const savedLikes = localStorage.getItem('mealfit_likes');

    // --- ESTADOS DE LA APLICACIÓN ---

    // Auth State (Supabase)
    const [session, setSession] = useState(null);
    const [loadingAuth, setLoadingAuth] = useState(true);

    // Estado del Perfil Real (Base de Datos Supabase)
    const [userProfile, setUserProfile] = useState(null);

    // Navegación del Wizard (Pasos de la evaluación)
    const [currentStep, setCurrentStep] = useState(0);
    const [direction, setDirection] = useState(0);

    // Datos del Plan Generado (JSON devuelto por la IA)
    const [planData, setPlanData] = useState(savedPlan ? JSON.parse(savedPlan) : null);

    // Estado de Likes Persistente { "NombrePlato": true }
    const [likedMeals, setLikedMeals] = useState(savedLikes ? JSON.parse(savedLikes) : {});

    // Datos del Formulario de Evaluación
    const [formData, setFormData] = useState(savedForm ? JSON.parse(savedForm) : {
        age: '', gender: '', height: '', weight: '', bodyFat: '', activityLevel: '',
        sleepHours: '', stressLevel: '', cookingTime: '', budget: '', workSchedule: '',
        dietType: '', allergies: [], dislikes: [], medicalConditions: [], otherAllergies: '',
        mainGoal: '', motivation: '', struggles: [], skipLunch: false,
    });

    // --- MANEJO DE SESIÓN Y PERFIL (SUPABASE) ---
    useEffect(() => {
        // Función interna para cargar perfil desde la tabla 'user_profiles'
        const fetchProfile = async (userId) => {
            try {
                const { data, error } = await supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (error) {
                    // Ignoramos error PGRST116 (JSON nulo/fila no encontrada) si es el primer login
                    if (error.code !== 'PGRST116') {
                        console.error('Error cargando perfil:', error);
                    }
                }

                if (data) {
                    setUserProfile(data);
                }
            } catch (error) {
                console.error('Excepción al cargar perfil:', error);
            }
        };

        // 1. Obtener sesión inicial al cargar la app
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) {
                localStorage.setItem('mealfit_user_id', session.user.id);
                // Cargar perfil real de la DB
                fetchProfile(session.user.id);
            }
            setLoadingAuth(false);
        });

        // 2. Escuchar cambios en tiempo real (Login, Logout, Auto-refresh)
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                localStorage.setItem('mealfit_user_id', session.user.id);
                fetchProfile(session.user.id);
            } else {
                setUserProfile(null); // Limpiar perfil al cerrar sesión
            }
            setLoadingAuth(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    // --- FUNCIÓN PARA ACTUALIZAR PERFIL EN DB ---
    const updateUserProfile = async (updates) => {
        try {
            if (!session?.user) throw new Error('No hay sesión activa');

            const { error } = await supabase
                .from('user_profiles')
                .update(updates)
                .eq('id', session.user.id);

            if (error) throw error;

            // Actualizamos el estado local para reflejar el cambio inmediatamente en la UI
            setUserProfile((prev) => ({ ...prev, ...updates }));
            return { success: true };
        } catch (error) {
            console.error('Error actualizando perfil:', error);
            return { success: false, error };
        }
    };

    // --- EFECTOS DE PERSISTENCIA LOCAL (Respaldo) ---

    useEffect(() => {
        localStorage.setItem('mealfit_form', JSON.stringify(formData));
    }, [formData]);

    useEffect(() => {
        if (planData) localStorage.setItem('mealfit_plan', JSON.stringify(planData));
    }, [planData]);

    useEffect(() => {
        localStorage.setItem('mealfit_likes', JSON.stringify(likedMeals));
    }, [likedMeals]);

    // --- LÓGICA DE NEGOCIO ---

    const toggleMealLike = async (mealName, mealType) => {
        const isCurrentlyLiked = !!likedMeals[mealName];

        // Optimistic UI Update (Actualizamos visualmente antes de la red)
        setLikedMeals(prev => ({
            ...prev,
            [mealName]: !isCurrentlyLiked
        }));

        // Si damos Like, enviamos al webhook de IA para entrenamiento
        if (!isCurrentlyLiked) {
            try {
                const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');

                // Enviamos el like al webhook de n8n
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

    // --- NUEVA FUNCIÓN: Regenerar un solo plato ---
    const regenerateSingleMeal = (mealIndex, mealType, currentName) => {
        // 1. Obtenemos las calorías objetivo de ese slot específico del plan actual
        const targetCalories = planData.perfectDay[mealIndex].cals;
        
        // 2. Obtenemos el tipo de dieta del formulario del usuario para filtrar
        const userDietType = formData.dietType;

        // 3. Llamamos a la función inteligente del servicio
        const newMealData = getAlternativeMeal(mealType, currentName, targetCalories, userDietType);

        // 4. Actualizamos el estado de planData
        const updatedPlan = { ...planData };
        const updatedDay = [...updatedPlan.perfectDay];

        updatedDay[mealIndex] = {
            ...updatedDay[mealIndex], // Mantenemos hora y tipo
            name: newMealData.name,
            desc: newMealData.desc,
            cals: newMealData.cals, 
            recipe: newMealData.recipe || [] // Asignamos la receta
        };

        updatedPlan.perfectDay = updatedDay;
        setPlanData(updatedPlan);
        
        return newMealData.name; // Retornamos el nombre para mostrarlo en el Toast
    };

    const updateData = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const saveGeneratedPlan = (data) => {
        setPlanData(data);
        // Al generar nuevo plan, reseteamos likes visuales del día anterior
        setLikedMeals({});
    };

    const nextStep = () => { setDirection(1); setCurrentStep((prev) => prev + 1); };
    const prevStep = () => { setDirection(-1); setCurrentStep((prev) => Math.max(0, prev - 1)); };

    const resetApp = async () => {
        // Limpieza total (Logout)
        localStorage.removeItem('mealfit_form');
        localStorage.removeItem('mealfit_plan');
        localStorage.removeItem('mealfit_likes');

        await supabase.auth.signOut();

        setPlanData(null);
        setLikedMeals({});
        setUserProfile(null);
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
            // Auth & Perfil
            session,
            loadingAuth,
            userProfile,
            updateUserProfile,

            // Wizard Navigation
            currentStep,
            setCurrentStep,
            direction,
            nextStep,
            prevStep,

            // Datos
            formData,
            updateData,
            planData,
            saveGeneratedPlan,
            
            // Interacciones
            likedMeals,
            toggleMealLike,
            regenerateSingleMeal,
            resetApp
        }}>
            {children}
        </AssessmentContext.Provider>
    );
};

AssessmentProvider.propTypes = { children: PropTypes.node.isRequired };

// eslint-disable-next-line react-refresh/only-export-components
export const useAssessment = () => useContext(AssessmentContext);