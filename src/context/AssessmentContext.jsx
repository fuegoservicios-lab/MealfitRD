import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabase';
import { getAlternativeMeal } from '../services/PlanGenerator';
import { toast } from 'sonner';

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
    
    // Estado para saber si estamos sincronizando datos de la DB
    const [loadingData, setLoadingData] = useState(true);

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

    // --- FUNCIÓN PARA RESTAURAR SESIÓN DESDE DB ---
    const restoreSessionData = useCallback(async (userId) => {
        if (!userId) {
            setLoadingData(false);
            return;
        }

        setLoadingData(true);
        console.log("🔄 Sincronizando datos del usuario...");

        try {
            // 1. Buscar el último plan creado por este usuario en Supabase
            const { data: plans, error } = await supabase
                .from('meal_plans')
                .select('plan_data')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (plans && plans.length > 0) {
                const latestPlan = plans[0].plan_data;
                
                // Leemos directamente del localStorage para la comparación
                const localSaved = localStorage.getItem('mealfit_plan');
                
                // Solo actualizamos si el plan en la nube es diferente al local
                if (!localSaved || JSON.stringify(JSON.parse(localSaved)) !== JSON.stringify(latestPlan)) {
                    console.log("📥 Descargando plan actualizado desde la nube...");
                    setPlanData(latestPlan);
                    localStorage.setItem('mealfit_plan', JSON.stringify(latestPlan));
                } else {
                    console.log("✅ El plan local está sincronizado con la nube.");
                }
            } else {
                console.log("ℹ️ El usuario no tiene planes guardados en la nube.");
            }
        } catch (err) {
            console.error("❌ Error restaurando sesión:", err);
        } finally {
            setLoadingData(false);
        }
    }, []);

    // --- 1. FUNCIÓN PARA CONSULTAR LÍMITE (RPC Supabase) ---
    const checkPlanLimit = useCallback(async (specificUserId = null) => {
        try {
            const userId = specificUserId || session?.user?.id || localStorage.getItem('mealfit_user_id');

            if (!userId) return;

            const { data, error } = await supabase.rpc('get_monthly_plan_count', {
                user_uuid: userId
            });

            if (error) throw error;

            setPlanCount(data);
            return data;
        } catch (error) {
            console.error("Error verificando límites:", error);
            return 0;
        }
    }, [session]);

    // --- 2. MANEJO DE SESIÓN Y PERFIL (SUPABASE) ---
    useEffect(() => {
        const fetchProfile = async (userId) => {
            try {
                const { data } = await supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (data) {
                    setUserProfile(data);
                }
            } catch (error) {
                console.error('Error cargando perfil:', error);
            }
        };

        const handleAuthChange = async (currentSession) => {
            // Evitar actualizaciones innecesarias si la sesión es idéntica
            // Usamos JSON.stringify para comparar objetos de forma segura
            if (session?.user?.id && currentSession?.user?.id && session.user.id === currentSession.user.id) {
               return; 
            }

            setSession(currentSession);
            
            if (currentSession?.user) {
                const userId = currentSession.user.id;
                localStorage.setItem('mealfit_user_id', userId);
                
                // Ejecutamos todo en paralelo
                await Promise.all([
                    fetchProfile(userId),
                    checkPlanLimit(userId),
                    restoreSessionData(userId)
                ]);
            } else {
                // Logout / No sesión
                setUserProfile(null);
                setPlanCount(0);
                setPlanData(null); 
                localStorage.removeItem('mealfit_user_id');
                localStorage.removeItem('mealfit_plan'); 
                setLoadingData(false);
            }
            setLoadingAuth(false);
        };

        // Obtener sesión inicial
        supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
            handleAuthChange(initialSession);
        });

        // Escuchar cambios en tiempo real
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, newSession) => {
            handleAuthChange(newSession);
        });

        return () => subscription.unsubscribe();

    // Agregamos 'session' a las dependencias para cumplir con el Linter
    // La lógica dentro de handleAuthChange previene bucles infinitos
    }, [checkPlanLimit, restoreSessionData, session]);

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
        if (formData) localStorage.setItem('mealfit_form', JSON.stringify(formData));
    }, [formData]);

    useEffect(() => {
        if (planData) localStorage.setItem('mealfit_plan', JSON.stringify(planData));
    }, [planData]);

    useEffect(() => {
        if (likedMeals) localStorage.setItem('mealfit_likes', JSON.stringify(likedMeals));
    }, [likedMeals]);


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

            const API_URL = import.meta.env.VITE_LIKE_WEBHOOK || 'https://agente-de-citas-dental-space-n8n.ofcrls.easypanel.host/webhook/like';

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
                throw new Error(`n8n respondió: ${response.status}`);
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
    const regenerateSingleMeal = async (mealIndex, mealType, currentName) => {
        const targetCalories = planData.perfectDay[mealIndex].cals;
        const userDietType = formData.dietType || "balanced";
        const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');

        console.log(`🔄 Regenerando ${mealType} (Rechazado: ${currentName})...`);

        try {
            // 1. LLAMADA A LA IA
            const API_SWAP_URL = 'https://agente-de-citas-dental-space-n8n.ofcrls.easypanel.host/webhook/swap-meal';
            const response = await fetch(API_SWAP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId || "guest",
                    rejected_meal: currentName,
                    meal_type: mealType,
                    target_calories: targetCalories,
                    diet_type: userDietType
                })
            });

            if (!response.ok) throw new Error("Error conectando con la IA");

            const newMealData = await response.json();
            console.log("✅ Nueva opción recibida:", newMealData);

            // 2. ACTUALIZAR ESTADO LOCAL
            const updatedPlan = { ...planData };
            const updatedDay = [...updatedPlan.perfectDay];
            updatedDay[mealIndex] = {
                ...updatedDay[mealIndex],
                name: newMealData.name,
                desc: newMealData.desc,
                cals: newMealData.cals,
                prep_time: newMealData.prep_time,
                recipe: newMealData.recipe || [],
                ingredients: newMealData.ingredients || []
            };
            updatedPlan.perfectDay = updatedDay;
            
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
                        console.log("💾 Guardando cambio en DB ID:", planId);

                        // b) Ejecutar UPDATE del campo plan_data
                        const { error: updateError } = await supabase
                            .from('meal_plans')
                            .update({ plan_data: updatedPlan }) // Guardamos el JSON modificado
                            .eq('id', planId);

                        if (updateError) {
                            console.error("❌ Error Supabase UPDATE:", updateError);
                            toast.error("Error de sincronización", { description: "El cambio es solo local." });
                        } else {
                            console.log("✅ DB Actualizada correctamente.");
                        }
                    }
                } catch (dbError) {
                    console.error("❌ Fallo crítico DB:", dbError);
                }
            }

            return newMealData.name;

        } catch (error) {
            // CORRECCIÓN DEL ERROR DE LINTER: Usamos la variable 'error'
            console.error("❌ Falló IA, usando fallback local...", error);
            
            // Fallback Local
            const localFallback = getAlternativeMeal(mealType, currentName, targetCalories, userDietType);
            
            const updatedPlan = { ...planData };
            const updatedDay = [...updatedPlan.perfectDay];

            updatedDay[mealIndex] = {
                ...updatedDay[mealIndex],
                name: localFallback.name,
                desc: localFallback.desc,
                cals: localFallback.cals,
                recipe: localFallback.recipe
            };
            updatedPlan.perfectDay = updatedDay;
            setPlanData(updatedPlan);
            return localFallback.name;
        }
    };

    const updateData = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const saveGeneratedPlan = async (data) => {
        setPlanData(data);
        setLikedMeals({});
        setTimeout(async () => {
            await checkPlanLimit();
        }, 2000);
    };

    const restorePlan = (pastPlanData) => {
        if (!pastPlanData) return;
        setPlanData(pastPlanData);
        localStorage.setItem('mealfit_plan', JSON.stringify(pastPlanData));
        toast.success('Plan Restaurado', {
            description: 'Ahora verás este plan en tu Dashboard principal.'
        });
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
        setLoadingData(false);
    };

    const upgradeUserToPlus = async () => {
        try {
            const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');
            if (!userId) throw new Error("No user ID");
            console.log("💳 Procesando actualización a Plus...");
            const { error } = await supabase
                .from('user_profiles')
                .update({
                    plan_tier: 'plus',
                    updated_at: new Date()
                })
                .eq('id', userId);
            if (error) throw error;
            setUserProfile(prev => ({ ...prev, plan_tier: 'plus' }));
            await checkPlanLimit(userId);
            toast.success('¡Bienvenido a Mealfit Plus!', {
                description: 'Has desbloqueado acceso ilimitado.',
                duration: 5000,
                icon: '🌟'
            });
            return true;
        } catch (error) {
            console.error("Error upgrading user:", error);
            toast.error('Error al actualizar perfil');
            return false;
        }
    };

    const isPlus = userProfile?.plan_tier === 'plus' || userProfile?.plan_tier === 'admin';

    return (
        <AssessmentContext.Provider value={{
            session,
            loadingAuth,
            loadingData,
            userProfile,
            updateUserProfile,
            currentStep,
            setCurrentStep,
            direction,
            nextStep,
            prevStep,
            formData,
            updateData,
            planData,
            saveGeneratedPlan,
            likedMeals,
            toggleMealLike,
            regenerateSingleMeal,
            resetApp,
            planCount,
            PLAN_LIMIT,
            checkPlanLimit,
            isPlus, 
            remainingCredits: isPlus ? 9999 : Math.max(0, PLAN_LIMIT - planCount), 
            upgradeUserToPlus,
            restorePlan
        }}>
            {children}
        </AssessmentContext.Provider>
    );
};

AssessmentProvider.propTypes = { children: PropTypes.node.isRequired };

// eslint-disable-next-line react-refresh/only-export-components
export const useAssessment = () => useContext(AssessmentContext);