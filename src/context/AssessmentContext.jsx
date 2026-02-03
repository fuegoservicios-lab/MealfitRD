import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabase';
import { getAlternativeMeal } from '../services/PlanGenerator';
import { toast } from 'sonner'; // Asumiendo que usas sonner como en el App.jsx

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

    // --- ESTADO PARA LOS CRÉDITOS ---
    const [planCount, setPlanCount] = useState(0);
    const PLAN_LIMIT = 30; // Límite del plan gratuito

    // --- 1. FUNCIÓN PARA CONSULTAR LÍMITE (RPC Supabase) ---
    const checkPlanLimit = useCallback(async (specificUserId = null) => {
        try {
            const userId = specificUserId || session?.user?.id || localStorage.getItem('mealfit_user_id');
            
            if (!userId) return;

            // Llamada a la función RPC que creaste en Supabase
            const { data, error } = await supabase.rpc('get_monthly_plan_count', {
                user_uuid: userId
            });

            if (error) throw error;
            
            console.log("📊 Planes usados este mes:", data);
            setPlanCount(data);
            return data;
        } catch (error) {
            console.error("Error verificando límites:", error);
            return 0; // En caso de error, asumimos 0 para no bloquear
        }
    }, [session]);

    // --- 2. MANEJO DE SESIÓN Y PERFIL (SUPABASE) ---
    useEffect(() => {
        const fetchProfile = async (userId) => {
            try {
                const { data, error } = await supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    console.error('Error cargando perfil:', error);
                }

                if (data) {
                    setUserProfile(data);
                }
            } catch (error) {
                console.error('Excepción al cargar perfil:', error);
            }
        };

        // Obtener sesión inicial
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) {
                localStorage.setItem('mealfit_user_id', session.user.id);
                fetchProfile(session.user.id);
                // Consultar límite al iniciar
                checkPlanLimit(session.user.id);
            }
            setLoadingAuth(false);
        });

        // Escuchar cambios en tiempo real
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                localStorage.setItem('mealfit_user_id', session.user.id);
                fetchProfile(session.user.id);
                checkPlanLimit(session.user.id);
            } else {
                setUserProfile(null);
                setPlanCount(0);
                localStorage.removeItem('mealfit_user_id');
            }
            setLoadingAuth(false);
        });

        return () => subscription.unsubscribe();
    }, [checkPlanLimit]);

    // --- FUNCIÓN PARA ACTUALIZAR PERFIL EN DB ---
    const updateUserProfile = async (updates) => {
        try {
            if (!session?.user) throw new Error('No hay sesión activa');

            const { error } = await supabase
                .from('user_profiles')
                .update(updates)
                .eq('id', session.user.id);

            if (error) throw error;

            setUserProfile((prev) => ({ ...prev, ...updates }));
            return { success: true };
        } catch (error) {
            console.error('Error actualizando perfil:', error);
            return { success: false, error };
        }
    };

    // --- EFECTOS DE PERSISTENCIA LOCAL ---
    useEffect(() => {
        localStorage.setItem('mealfit_form', JSON.stringify(formData));
    }, [formData]);

    useEffect(() => {
        if (planData) localStorage.setItem('mealfit_plan', JSON.stringify(planData));
    }, [planData]);

    useEffect(() => {
        localStorage.setItem('mealfit_likes', JSON.stringify(likedMeals));
    }, [likedMeals]);

    // --- LÓGICA DE NEGOCIO Y WEBHOOKS ---

    // =========================================================
    // CORRECCIÓN CRÍTICA: Función Toggle Like Robusta
    // =========================================================
    const toggleMealLike = async (mealName, mealType) => {
        // 1. Optimismo en UI (Cambia el corazón inmediatamente)
        const isCurrentlyLiked = !!likedMeals[mealName];
        
        setLikedMeals(prev => ({
            ...prev,
            [mealName]: !isCurrentlyLiked
        }));

        // Si estamos QUITANDO el like, por ahora no llamamos a la API (o podrías crear un endpoint para borrar)
        if (isCurrentlyLiked) return;

        // Si estamos AGREGANDO like, intentamos enviar a n8n
        try {
            const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');
            
            // Validación de seguridad
            if (!userId) {
                console.error("❌ Error: Usuario no autenticado. No se puede guardar el like.");
                toast.error("Inicia sesión para guardar tus favoritos");
                // Revertimos el cambio visual
                setLikedMeals(prev => {
                    const newState = { ...prev };
                    delete newState[mealName];
                    return newState;
                });
                return;
            }

            // URL del Webhook (Usamos la de producción hardcoded si falla la ENV)
            const API_URL = import.meta.env.VITE_LIKE_WEBHOOK || 'https://agente-de-citas-dental-space-n8n.ofcrls.easypanel.host/webhook/like';

            console.log(`🚀 Enviando Like a n8n...`);
            
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    meal_name: mealName,
                    meal_type: mealType
                })
            });

            if (!response.ok) {
                // Intentamos leer el error del servidor
                const errorText = await response.text();
                throw new Error(`n8n respondió: ${response.status} - ${errorText}`);
            }

            // Éxito confirmado
            const data = await response.json();
            console.log("✅ Like guardado en DB:", data);

        } catch (error) {
            console.error("❌ ERROR CRÍTICO AL ENVIAR LIKE:", error);
            
            // Feedback al usuario
            toast.error("Error de conexión", {
                description: "No se pudo guardar tu preferencia."
            });

            // Revertir estado visual (Rollback)
            setLikedMeals(prev => {
                const newState = { ...prev };
                delete newState[mealName];
                return newState;
            });
        }
    };

    // Función de regeneración local (para cambios rápidos)
    const regenerateSingleMeal = (mealIndex, mealType, currentName) => {
        const targetCalories = planData.perfectDay[mealIndex].cals;
        const userDietType = formData.dietType;
        const newMealData = getAlternativeMeal(mealType, currentName, targetCalories, userDietType);

        const updatedPlan = { ...planData };
        const updatedDay = [...updatedPlan.perfectDay];

        updatedDay[mealIndex] = {
            ...updatedDay[mealIndex],
            name: newMealData.name,
            desc: newMealData.desc,
            cals: newMealData.cals, 
            recipe: newMealData.recipe || []
        };

        updatedPlan.perfectDay = updatedDay;
        setPlanData(updatedPlan);
        
        return newMealData.name;
    };

    const updateData = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const saveGeneratedPlan = async (data) => {
        setPlanData(data);
        setLikedMeals({}); // Resetear likes del día anterior para empezar fresco
        
        // Actualizar contador inmediatamente después de generar
        setTimeout(async () => {
            await checkPlanLimit();
        }, 1500); // Pequeño delay para asegurar que n8n ya insertó en Supabase
    };

    const nextStep = () => { setDirection(1); setCurrentStep((prev) => prev + 1); };
    const prevStep = () => { setDirection(-1); setCurrentStep((prev) => Math.max(0, prev - 1)); };

    const resetApp = async () => {
        localStorage.removeItem('mealfit_form');
        localStorage.removeItem('mealfit_plan');
        localStorage.removeItem('mealfit_likes');
        localStorage.removeItem('mealfit_user_id');

        await supabase.auth.signOut();

        setPlanData(null);
        setLikedMeals({});
        setUserProfile(null);
        setPlanCount(0);
        setFormData({
            age: '', gender: '', height: '', weight: '', bodyFat: '', activityLevel: '',
            sleepHours: '', stressLevel: '', cookingTime: '', budget: '', workSchedule: '',
            dietType: '', allergies: [], dislikes: [], medicalConditions: [], otherAllergies: '',
            mainGoal: '', motivation: '', struggles: [], skipLunch: false,
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
            resetApp,

            // --- VALORES DE CRÉDITOS ---
            planCount,
            PLAN_LIMIT,
            checkPlanLimit,
            remainingCredits: Math.max(0, PLAN_LIMIT - planCount)
        }}>
            {children}
        </AssessmentContext.Provider>
    );
};

AssessmentProvider.propTypes = { children: PropTypes.node.isRequired };

// eslint-disable-next-line react-refresh/only-export-components
export const useAssessment = () => useContext(AssessmentContext);