import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabase';
// --- BASE DE DATOS LOCAL DE RECETAS (FALLBACK) ---
const DOMINICAN_MEALS = {
    breakfast: [
        { name: "Mangú con Huevo", tags: ['balanced', 'vegetarian'], desc: "Puré de plátano verde con huevo hervido.", recipe: ["Hervir plátanos verdes.", "Majar con agua de cocción.", "Hervir 2 huevos.", "Saltear cebolla roja en vinagre."], cals: 450 },
        { name: "Avena Integral con Canela", tags: ['balanced', 'vegetarian'], desc: "Avena cocida con canela y vainilla.", recipe: ["Hervir avena con canela.", "Agregar leche descremada.", "Endulzar con stevia."], cals: 350 },
        { name: "Revuelto de Huevos y Vegetales", tags: ['balanced', 'low_carb', 'keto', 'vegetarian'], desc: "Huevos revueltos con ajíes y espinaca.", recipe: ["Picar vegetales.", "Sofreír en sartén.", "Batir 2 huevos y revolver."], cals: 300 },
        { name: "Batida Proteica de Guineo", tags: ['balanced', 'vegetarian'], desc: "Batido de proteína con guineo.", recipe: ["Licuar proteína, guineo, hielo y agua."], cals: 350 }
    ],
    lunch: [
        { name: "La Bandera (Versión Fit)", tags: ['balanced'], desc: "Arroz, habichuelas y pollo guisado.", recipe: ["1 taza de arroz.", "1/2 taza de habichuelas.", "Pollo guisado sin piel.", "Ensalada verde."], cals: 600 },
        { name: "Pechuga a la Plancha + Vegetales", tags: ['low_carb', 'keto'], desc: "Pechuga al orégano con brócoli.", recipe: ["Adobar pechuga.", "Cocinar en plancha.", "Hervir brócoli y zanahoria."], cals: 450 },
        { name: "Moro de Guandules con Pescado", tags: ['balanced'], desc: "Moro con filete de pescado.", recipe: ["Preparar moro.", "Cocinar filete con pimientos."], cals: 550 },
        { name: "Sancocho Light", tags: ['balanced'], desc: "Sancocho con carnes magras y más auyama.", recipe: ["Usar pechuga y carne magra.", "Mucha auyama.", "Reducir víveres pesados."], cals: 500 }
    ],
    dinner: [
        { name: "Pescado al Papillote", tags: ['low_carb', 'keto', 'balanced'], desc: "Filete de pescado cocido con vegetales.", recipe: ["Colocar filete en aluminio.", "Cubrir con vegetales.", "Cocinar 12-15 min."], cals: 400 },
        { name: "Tortilla de Espinacas", tags: ['low_carb', 'keto', 'vegetarian'], desc: "Cena ligera de huevo y espinacas.", recipe: ["Saltear espinacas.", "Batir 2 huevos y verter.", "Cocinar a fuego lento."], cals: 300 },
        { name: "Crema de Auyama", tags: ['balanced', 'vegan', 'vegetarian'], desc: "Crema espesa de auyama.", recipe: ["Hervir auyama con ajo.", "Licuar con agua de cocción."], cals: 350 },
        { name: "Ensalada de Atún", tags: ['low_carb', 'keto'], desc: "Atún en agua con vegetales y limón.", recipe: ["Escurrir atún.", "Mezclar con vegetales.", "Aderezar con limón."], cals: 300 }
    ],
    merienda: [
        { name: "Guineo Maduro", tags: ['balanced', 'vegan', 'vegetarian'], desc: "Una unidad mediana.", recipe: ["Pelar y comer."], cals: 120 },
        { name: "Yogur Griego con Chinola", tags: ['low_carb', 'vegetarian'], desc: "Alto en proteína.", recipe: ["1 taza yogur griego.", "Pulpa de chinola."], cals: 180 },
        { name: "Puñado de Nueces Mixtas", tags: ['low_carb', 'keto', 'vegan'], desc: "Grasas saludables.", recipe: ["Un puñado de almendras o nueces."], cals: 200 },
        { name: "Huevo Hervido", tags: ['low_carb', 'keto', 'vegetarian'], desc: "Protein snack.", recipe: ["Hervir 10 min. Pelar y agregar sal."], cals: 80 }
    ]
};

const getAlternativeMeal = (mealType, currentMealName, targetCalories, userDietType) => {
    let category = 'merienda';
    const lowerType = mealType.toLowerCase();
    if (lowerType.includes('desayuno')) category = 'breakfast';
    else if (lowerType.includes('almuerzo')) category = 'lunch';
    else if (lowerType.includes('cena')) category = 'dinner';
    else if (lowerType.includes('merienda')) category = 'merienda';

    let dietFilter = 'balanced';
    if (userDietType) {
        const type = userDietType.toLowerCase();
        if (type.includes('keto')) dietFilter = 'keto';
        else if (type.includes('low')) dietFilter = 'low_carb';
        else if (type.includes('veg') && !type.includes('vegetariana')) dietFilter = 'vegan';
        else if (type.includes('vegetariana')) dietFilter = 'vegetarian';
    }

    const options = DOMINICAN_MEALS[category] || DOMINICAN_MEALS.breakfast;
    let compatibleOptions = options.filter(meal => dietFilter === 'balanced' ? true : meal.tags.includes(dietFilter));
    if (compatibleOptions.length === 0) {
        compatibleOptions = options.filter(m => m.tags.includes('balanced') || m.tags.includes('vegetarian'));
        if (compatibleOptions.length === 0) compatibleOptions = options;
    }
    const availableOptions = compatibleOptions.filter(m => m.name !== currentMealName);
    const selectedTemplate = availableOptions.length > 0
        ? availableOptions[Math.floor(Math.random() * availableOptions.length)]
        : options[0];
    return {
        name: selectedTemplate.name,
        desc: selectedTemplate.desc,
        cals: targetCalories || selectedTemplate.cals || 400,
        recipe: selectedTemplate.recipe,
        isSwapped: true
    };
};
import { toast } from 'sonner';
import { fetchWithAuth } from '../config/api';

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
    const [maxReachedStep, setMaxReachedStep] = useState(0);

    // Datos del Plan Generado (JSON devuelto por la IA)
    const [planData, setPlanData] = useState(savedPlan ? JSON.parse(savedPlan) : null);

    // Estado de Likes Persistente { "NombrePlato": true }
    const [likedMeals, setLikedMeals] = useState(savedLikes ? JSON.parse(savedLikes) : {});

    // Estado de Dislikes Persistente con expiración de 7 días
    const savedDislikes = localStorage.getItem('mealfit_dislikes');
    const [dislikedMeals, setDislikedMeals] = useState(() => {
        if (!savedDislikes) return {};
        try {
            const parsed = JSON.parse(savedDislikes);
            const now = Date.now();
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const valid = {};
            for (const meal in parsed) {
                // Si es un número (timestamp) y no ha expirado
                if (typeof parsed[meal] === 'number' && (now - parsed[meal] < sevenDaysMs)) {
                    valid[meal] = parsed[meal];
                } 
                // Retrocompatibilidad: Si antes era 'true', asumimos que es de ahora
                else if (parsed[meal] === true) {
                    valid[meal] = now;
                }
            }
            return valid;
        } catch (e) {
            return {};
        }
    });

    const initialFormData = {
        age: '', gender: '', height: '', weight: '', weightUnit: 'lb', bodyFat: '', activityLevel: '',
        sleepHours: '', stressLevel: '', cookingTime: '', budget: '', scheduleType: '',
        dietType: '', allergies: [], dislikes: [], medicalConditions: [], otherAllergies: '',
        mainGoal: '', motivation: '', struggles: [], skipLunch: false,
        includeSupplements: false, selectedSupplements: [], groceryDuration: 'weekly', householdSize: 1,
        otherConditions: '',
    };

    // Datos del Formulario de Evaluación
    const [formData, setFormData] = useState(savedForm ? JSON.parse(savedForm) : initialFormData);

    // --- ESTADO PARA LOS CRÉDITOS ---
    const [planCount, setPlanCount] = useState(0);
    const PLAN_LIMIT = 15; // Límite del plan gratuito

    // 🔒 Lock para evitar que restoreSessionData sobreescriba datos recalculados
    const recalcLockRef = useRef(false);
    const setRecalcLock = useCallback((val) => {
        recalcLockRef.current = val;
        // Auto-unlock después de 15s como seguridad (evita locks permanentes)
        if (val) {
            setTimeout(() => { recalcLockRef.current = false; }, 15000);
        }
    }, []);

    // --- FUNCIÓN PARA RESTAURAR SESIÓN DESDE DB ---
    const restoreSessionData = useCallback(async (userId) => {
        if (!userId) {
            setLoadingData(false);
            return;
        }

        // 🔒 Si hay un recálculo en progreso, no sobreescribir planData
        if (recalcLockRef.current) {
            console.log('🔒 [RESTORE] Bloqueado por recalcLock — omitiendo sincronización con la nube.');
            setLoadingData(false);
            return;
        }

        setLoadingData(true);


        try {
            // 1. Buscar el último plan creado por este usuario en Supabase
            const { data: plans, error } = await supabase
                .from('meal_plans')
                .select('id, plan_data, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (plans && plans.length > 0) {
                const latestPlan = plans[0].plan_data;
                const planCreatedAt = plans[0].created_at;
                const planId = plans[0].id;

                // FIX: Asegurar que el plan de la BD tenga una fecha de inicio de compras para el contador de Dashboard
                let didInjectGroceryDate = false;
                if (!latestPlan.grocery_start_date) {
                    const localSaved = localStorage.getItem('mealfit_plan');
                    let localGroceryStartDate = null;
                    if (localSaved) {
                        try {
                            const parsed = JSON.parse(localSaved);
                            localGroceryStartDate = parsed.grocery_start_date;
                        } catch(e) {}
                    }
                    
                    // Si el plan vino de la IA/Chat, no trae esta fecha.
                    // Priorizamos mantener la local, si no existe usamos la de creación.
                    latestPlan.grocery_start_date = localGroceryStartDate || planCreatedAt;
                    didInjectGroceryDate = true;
                }

                // Leemos directamente del localStorage para la comparación
                const localSavedForCompare = localStorage.getItem('mealfit_plan');

                let localSavedParsed = null;
                if (localSavedForCompare) {
                    try {
                        localSavedParsed = JSON.parse(localSavedForCompare);
                    } catch(e) {
                        console.warn("⚠️ Error parseando plan local, forzando sincronización con la nube.");
                    }
                }

                // Solo actualizamos si el plan en la nube es diferente al local
                if (!localSavedParsed || JSON.stringify(localSavedParsed) !== JSON.stringify(latestPlan)) {

                    setPlanData(latestPlan);
                    localStorage.setItem('mealfit_plan', JSON.stringify(latestPlan));
                } else {

                }

                // Guardar la fecha en DB para persistencia cruzada (si se inyectó)
                if (didInjectGroceryDate && userId && userId !== 'guest') {
                    supabase.from('meal_plans').update({ plan_data: latestPlan }).eq('id', planId).then((res) => {
                        if (res.error) console.error('Error sincronizando fecha inicio despensa', res.error);
                    });
                }
            } else {

            }
        } catch (err) {
            console.error("❌ Error restaurando sesión:", err);
        } finally {
            setLoadingData(false);
        }
    }, []);

    // --- 1. FUNCIÓN PARA CONSULTAR LÍMITE DE IA (API) ---
    const checkPlanLimit = useCallback(async (specificUserId = null) => {
        try {
            const userId = specificUserId || session?.user?.id || localStorage.getItem('mealfit_user_id');

            if (!userId || userId === 'guest') {
                setPlanCount(0);
                return 0;
            }

            const response = await fetchWithAuth(`/api/user/credits/${userId}`);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error consultando créditos: ${response.status} - ${errorText}`);
            }
            const data = await response.json();

            setPlanCount(data.credits || 0);
            return data.credits || 0;
        } catch (error) {
            console.error("Error verificando límites de API:", error);
            return 0;
        }
    }, [session]);

    // --- 2. MANEJO DE SESIÓN Y PERFIL (SUPABASE) ---
    const fetchProfile = useCallback(async (userId) => {
        try {
            const { data } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (data) {
                setUserProfile(data);
                // Sincronizar UI form data con health_profile (si existe y tiene datos)
                if (data.health_profile && Object.keys(data.health_profile).length > 0) {
                    setFormData(prev => ({
                        ...prev,
                        ...data.health_profile
                    }));
                }
            }
        } catch (error) {
            console.error('Error cargando perfil:', error);
        }
    }, [setFormData, setUserProfile]);

    const refreshProfileAndPlan = useCallback(async () => {
        const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');
        if (userId) {
            try {
                const { data } = await supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (data) {
                    setUserProfile(data);
                    
                    let latestFormData = { ...formData };
                    if (data.health_profile && Object.keys(data.health_profile).length > 0) {
                        setFormData(prev => {
                            latestFormData = { ...prev, ...data.health_profile };
                            return latestFormData;
                        });
                        
                        // toast.info("Actualizando tu plan basado en tus nuevos datos...", { duration: 4000 });
                        // 
                        // // Generar nuevo plan con los datos sincronizados
                        // const newPlan = await generateAIPlan(latestFormData);
                        // if (newPlan) {
                        //     setPlanData(newPlan);
                        //     localStorage.setItem('mealfit_plan', JSON.stringify(newPlan));
                        //     await savePlanToHistory(newPlan);
                        //     toast.success("¡Plan sincronizado exitosamente!");
                        // }
                    }
                }
            } catch (error) {
                console.error("Error refreshing profile or plan:", error);
            }
        }
    }, [session, formData]);

    useEffect(() => {
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

                const lastOwner = localStorage.getItem('mealfit_last_form_owner');
                if (lastOwner && lastOwner !== 'guest' && lastOwner !== userId) {
                    // Los datos pertenecen a un usuario diferente, por lo que limpiamos para el usuario nuevo/diferente
                    localStorage.removeItem('mealfit_form');
                    setFormData(initialFormData);
                }
                localStorage.setItem('mealfit_last_form_owner', userId);

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
                localStorage.removeItem('mealfit_guest_session');
                // Al cerrar sesión NO limpiamos mealfit_form para que un guest pueda seguir usándolo
                setLoadingData(false);
            }
            setLoadingAuth(false);
            
            // 🚀 Desvanecer Splash Screen nativo una vez React esté listo con la sesión
            setTimeout(() => {
                const splash = document.getElementById('pwa-splash');
                if (splash) {
                    splash.style.opacity = '0';
                    setTimeout(() => splash.remove(), 500);
                }
            }, 100); // Darle un mini-delay para que React pinte el ProtectedRoute o Dashboard
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

    // --- ESCUCHA DE SUPABASE REALTIME (Actualizaciones de la IA) ---
    useEffect(() => {
        const userId = session?.user?.id;
        if (!userId) return;


        
        const profileSubscription = supabase
            .channel('public:user_profiles')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'user_profiles',
                    filter: `id=eq.${userId}`
                },
                (payload) => {
                    // 🔒 No sincronizar si hay un recálculo activo
                    if (recalcLockRef.current) {
                        console.log('🔒 [REALTIME] Bloqueado por recalcLock — ignorando actualización de perfil.');
                        return;
                    }
                    // Disparar sincronización mágica
                    refreshProfileAndPlan();
                }
            )
            .subscribe();

        return () => {

            supabase.removeChannel(profileSubscription);
        };
    }, [session, refreshProfileAndPlan]);

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

    useEffect(() => {
        if (dislikedMeals) localStorage.setItem('mealfit_dislikes', JSON.stringify(dislikedMeals));
    }, [dislikedMeals]);

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

            const API_URL = '/api/like';

            const response = await fetchWithAuth(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    meal_name: mealName,
                    meal_type: mealType
                })
            });

            if (!response.ok) {
                throw new Error(`El Agente IA respondió con error: ${response.status}`);
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
    const regenerateSingleMeal = async (dayIndex, mealIndex, mealType, currentName) => {
        const planDays = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
        const currentMeals = planDays[dayIndex]?.meals || [];
        const targetCalories = currentMeals[mealIndex]?.cals || 400;
        const userDietType = formData.dietType || "balanced";
        const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');

        // Extraer la lista de compra actual para RESTRINGIR las sugerencias del LLM a esta despensa
        let currentIngredients = [];
        planDays.forEach(day => {
            (day.meals || []).forEach(m => {
                if (m.ingredients && Array.isArray(m.ingredients)) {
                    // Safety net: Normalizar cada ingrediente a string limpio
                    // (protege contra cambios futuros de estructura a objetos)
                    const normalized = m.ingredients.map(ing => {
                        if (typeof ing === 'string') return ing;
                        if (typeof ing === 'object' && ing !== null) return ing.display_name || ing.name || ing.item_name || String(ing);
                        return String(ing);
                    }).filter(s => s && s.length > 2);
                    currentIngredients.push(...normalized);
                }
            });
        });

        try {
            // 1. LLAMADA A LA IA
            const API_SWAP_URL = '/api/swap-meal';
            const sessionId = localStorage.getItem('mealfit_user_id') || 'guest_session';
            const response = await fetchWithAuth(API_SWAP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId || "guest",
                    session_id: sessionId,
                    rejected_meal: currentName,
                    meal_type: mealType,
                    target_calories: targetCalories,
                    diet_type: userDietType,
                    allergies: formData.allergies || [],
                    dislikes: formData.dislikes || [],
                    liked_meals: Object.keys(likedMeals || {}),
                    disliked_meals: Object.keys(dislikedMeals || {}),
                    current_pantry_ingredients: currentIngredients
                })
            });

            if (!response.ok) throw new Error("Error conectando con la IA");

            const newMealData = await response.json();


            // 2. ACTUALIZAR ESTADO LOCAL
            const updatedPlan = { ...planData };
            
            // Retrocompatibilidad rápida al regenerar
            if (!updatedPlan.days) {
                 updatedPlan.days = [{ day: 1, meals: updatedPlan.meals || updatedPlan.perfectDay || [] }];
                 delete updatedPlan.meals;
                 delete updatedPlan.perfectDay;
            }

            const updatedDays = [...updatedPlan.days];
            const updatedDayObj = { ...updatedDays[dayIndex] };
            const updatedMeals = [...updatedDayObj.meals];

            updatedMeals[mealIndex] = {
                ...updatedMeals[mealIndex],
                name: newMealData.name,
                desc: newMealData.desc,
                cals: newMealData.cals,
                prep_time: newMealData.prep_time,
                recipe: newMealData.recipe || [],
                ingredients: newMealData.ingredients || []
            };

            updatedDayObj.meals = updatedMeals;
            updatedDays[dayIndex] = updatedDayObj;
            updatedPlan.days = updatedDays;

            // Invalidar la lista pre-calculada para que el memo allPlanIngredients
            // recalcule desde los ingredientes actualizados del plan
            delete updatedPlan.aggregated_shopping_list;

            // Add rejected meal to disliked list with current timestamp
            setDislikedMeals(prev => ({
                ...prev,
                [currentName]: Date.now()
            }));

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


                        // b) Ejecutar UPDATE del campo plan_data
                        const { error: updateError } = await supabase
                            .from('meal_plans')
                            .update({ plan_data: updatedPlan }) // Guardamos el JSON modificado
                            .eq('id', planId);

                        if (updateError) {
                            console.error("❌ Error Supabase UPDATE:", updateError);
                            toast.error("Error de sincronización", { description: "El cambio es solo local." });
                        } else {

                        }
                    }
                } catch (dbError) {
                    console.error("❌ Fallo crítico DB:", dbError);
                }
            }

            // Actualizar créditos en tiempo real después de regenerar exitosamente
            setTimeout(async () => {
                await checkPlanLimit();
            }, 1000);

            return newMealData.name;

        } catch (error) {
            // CORRECCIÓN DEL ERROR DE LINTER: Usamos la variable 'error'
            console.error("❌ Falló IA, usando fallback local...", error);

            // Fallback Local
            const localFallback = getAlternativeMeal(mealType, currentName, targetCalories, userDietType);

            const updatedPlan = { ...planData };
            if (!updatedPlan.days) {
                 updatedPlan.days = [{ day: 1, meals: updatedPlan.meals || updatedPlan.perfectDay || [] }];
                 delete updatedPlan.meals;
                 delete updatedPlan.perfectDay;
            }

            const updatedDays = [...updatedPlan.days];
            const updatedDayObj = { ...updatedDays[dayIndex] };
            const updatedMeals = [...updatedDayObj.meals];

            updatedMeals[mealIndex] = {
                ...updatedMeals[mealIndex],
                name: localFallback.name,
                desc: localFallback.desc,
                cals: localFallback.cals,
                recipe: localFallback.recipe
            };
            
            updatedDayObj.meals = updatedMeals;
            updatedDays[dayIndex] = updatedDayObj;
            updatedPlan.days = updatedDays;

            setPlanData(updatedPlan);
            return localFallback.name;
        }
    };

    const updateData = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        localStorage.setItem('mealfit_last_form_owner', session?.user?.id || 'guest');
    };

    const saveGeneratedPlan = async (data) => {
        setPlanData(data);
        setLikedMeals({});
        
        // NOTA: NO guardamos en Supabase aquí.
        // El backend ya lo hace en _save_plan_and_track_background() con datos más completos
        // (meal_names, ingredients, techniques, frequency tracking).
        // Guardarlo aquí también causaba duplicados en el historial.

        setTimeout(async () => {
            await checkPlanLimit();
        }, 2000);
    };

    const restorePlan = async (pastPlanData) => {
        if (!pastPlanData) return;

        // 1. Actualizar estado local inmediatamente
        setPlanData(pastPlanData);
        setLikedMeals({});
        localStorage.setItem('mealfit_plan', JSON.stringify(pastPlanData));
        localStorage.setItem('mealfit_likes', JSON.stringify({}));

        // 2. Sincronizar con Supabase para que cloud sync no lo revierta
        const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');
        if (userId && userId !== 'guest') {
            try {
                // Obtener el plan más reciente del usuario
                const { data: latestRows } = await supabase
                    .from('meal_plans')
                    .select('id')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (latestRows && latestRows.length > 0) {
                    const planId = latestRows[0].id;

                    // Actualizar el plan_data del registro más reciente
                    const { error: updateError } = await supabase
                        .from('meal_plans')
                        .update({ plan_data: pastPlanData })
                        .eq('id', planId);

                    if (updateError) {
                        console.error('❌ Error sincronizando plan restaurado:', updateError);
                        toast.warning('Plan restaurado localmente', {
                            description: 'No se pudo sincronizar con la nube.'
                        });
                    } else {

                    }
                }
            } catch (dbError) {
                console.error('❌ Error de DB al restaurar plan:', dbError);
            }
        }
    };

    const nextStep = () => {
        setDirection(1);
        setCurrentStep((prev) => {
            const next = prev + 1;
            setMaxReachedStep((max) => Math.max(max, next));
            return next;
        });
    };
    const prevStep = () => { setDirection(-1); setCurrentStep((prev) => Math.max(0, prev - 1)); };

    const resetApp = async () => {
        // NO limpiamos mealfit_form para que tras cerrar sesión, 
        // los datos sigan presentes para invitados, pero sí se limpiarán al entrar con otra cuenta.
        localStorage.removeItem('mealfit_plan');
        localStorage.removeItem('mealfit_likes');
        localStorage.removeItem('mealfit_user_id');
        localStorage.removeItem('mealfit_guest_session');
        localStorage.removeItem('mealfit_guest_sessions_list');
        localStorage.removeItem('mealfit_current_session');
        localStorage.removeItem('mealfit_dislikes');

        await supabase.auth.signOut();

        setPlanData(null);
        setLikedMeals({});
        setDislikedMeals({});
        setUserProfile(null);
        setPlanCount(0);
        setCurrentStep(0);
        setMaxReachedStep(0);
        setLoadingData(false);
    };

    const upgradeUserPlan = async (tier = 'plus', subscriptionId = null) => {
        try {
            const userId = session?.user?.id || localStorage.getItem('mealfit_user_id');
            if (!userId) throw new Error("No user ID");


            if (subscriptionId) {
                // Validación Segura B2B con nuestro Backend
                toast.loading('Verificando tu pago. Por favor espera...', { id: 'payment-verify' });
                const response = await fetchWithAuth('/api/subscription/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        subscriptionID: subscriptionId,
                        tier: tier
                    })
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || "Fallo en la verificación del pago en el servidor.");
                }
                
                toast.success('Pago verificado exitosamente.', { id: 'payment-verify' });
                
                // Recargar el perfil desde la base de datos ya que el servidor hizo el UPDATE
                await refreshProfileAndPlan();
                
            } else {
                // Caso antiguo o admin bypass
                console.warn("⚠️ Bypass de suscripción llamado (Sin ID de suscripción).");
                const { error } = await supabase
                    .from('user_profiles')
                    .update({
                        plan_tier: tier,
                        updated_at: new Date()
                    })
                    .eq('id', userId);
                if (error) throw error;
                setUserProfile(prev => ({ ...prev, plan_tier: tier }));
            }

            await checkPlanLimit(userId);
            
            const planNames = { basic: 'Mealfit Básico', plus: 'Mealfit Plus', ultra: 'Mealfit Ultra Ilimitado' };
            const planName = planNames[tier] || 'Mealfit Plus';
            
            toast.success(`¡Bienvenido a ${planName}!`, {
                description: 'Has desbloqueado acceso premium.',
                duration: 5000,
                icon: '🌟'
            });
            return true;
        } catch (error) {
            console.error("Error upgrading user:", error);
            toast.error(error.message || 'Error al actualizar perfil');
            toast.dismiss('payment-verify');
            return false;
        }
    };

    const isPremium = ['basic', 'plus', 'admin', 'ultra'].includes(userProfile?.plan_tier);

    let userPlanLimit = PLAN_LIMIT;
    if (userProfile?.plan_tier === 'basic') userPlanLimit = 50;
    else if (userProfile?.plan_tier === 'plus') userPlanLimit = 200;
    else if (['ultra', 'admin'].includes(userProfile?.plan_tier)) userPlanLimit = 'Ilimitado';

    return (
        <AssessmentContext.Provider value={{
            session,
            loadingAuth,
            loadingData,
            userProfile,
            updateUserProfile,
            currentStep,
            setCurrentStep,
            maxReachedStep,
            setMaxReachedStep,
            direction,
            nextStep,
            prevStep,
            formData,
            updateData,
            planData,
            setPlanData,
            saveGeneratedPlan,
            likedMeals,
            toggleMealLike,
            dislikedMeals,
            regenerateSingleMeal,
            resetApp,
            planCount,
            PLAN_LIMIT,
            userPlanLimit,
            checkPlanLimit,
            isPremium,
            remainingCredits: typeof userPlanLimit === 'number' ? Math.max(0, userPlanLimit - planCount) : '∞',
            upgradeUserPlan,
            restorePlan,
            refreshProfileAndPlan,
            restoreSessionData,
            setRecalcLock
        }}>
            {children}
        </AssessmentContext.Provider>
    );
};

AssessmentProvider.propTypes = { children: PropTypes.node.isRequired };

// eslint-disable-next-line react-refresh/only-export-components
export const useAssessment = () => useContext(AssessmentContext);