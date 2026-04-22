import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { API_BASE } from '../config/api';
import { useAssessment } from '../context/AssessmentContext';

import { calculateAllPlanIngredients } from '../utils/shoppingHelpers';

import { trackEvent } from '../utils/analytics';

export const useRegeneratePlan = () => {
    const { formData, planData, userProfile, setCurrentStep, checkPlanLimit, userPlanLimit, dislikedMeals } = useAssessment();
    const navigate = useNavigate();
    const isNavigatingRef = useRef(false);

    const regeneratePlan = async ({
        reason = null,
        liveInventory = null,
        disabledIngredients = null,
        allPlanIngredients = null,
        isPlanExpired = false,
        toastId = null,
        entry_point = null
    } = {}) => {
        // Protección contra doble disparo (auto-rotación + clic manual simultáneo)
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;

        // GAP 12: Derivación segura de isPlanExpired para evitar desincronización
        let actualIsPlanExpired = isPlanExpired;
        if (planData) {
            const planCreationDate = planData.plan_start_date ? new Date(planData.plan_start_date) : new Date(planData.created_at || new Date());
            const normalizedCreation = new Date(Date.UTC(planCreationDate.getUTCFullYear(), planCreationDate.getUTCMonth(), planCreationDate.getUTCDate()));
            const nowD = new Date();
            const normalizedNow = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate()));
            const diffTime = Math.abs(normalizedNow - normalizedCreation);
            const daysSinceCreation = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            const groceryDuration = formData?.groceryDuration || 'weekly';
            let requested_days = 7;
            if (groceryDuration === 'biweekly') requested_days = 15;
            if (groceryDuration === 'monthly') requested_days = 30;
            
            const generated_days = planData.days ? planData.days.length : 0;
            
            // GAP 8: Expiración de plan no considera tiempo de generación
            // Fix: extender expiry por (requested_days - generated_days)
            const expiryExtension = Math.max(0, requested_days - generated_days);

            if (groceryDuration === 'weekly' && daysSinceCreation >= (7 + expiryExtension)) actualIsPlanExpired = true;
            if (groceryDuration === 'biweekly' && daysSinceCreation >= (15 + expiryExtension)) actualIsPlanExpired = true;
            if (groceryDuration === 'monthly' && daysSinceCreation >= (30 + expiryExtension)) actualIsPlanExpired = true;
        }

        try {
            if (formData && formData.age && formData.mainGoal) {

            // GAP 5: Validación de límite fresco (server-side) con caché de 5s
            const now = Date.now();
            let freshPlanCount = window.__cachedQuota || 0;
            if (now - (window.__lastQuotaCheckTime || 0) > 5000) {
                freshPlanCount = await checkPlanLimit(userProfile?.id);
                window.__cachedQuota = freshPlanCount;
                window.__lastQuotaCheckTime = now;
            }

            const isLimitReached = typeof userPlanLimit === 'number' && freshPlanCount >= userPlanLimit;
            
            if (isLimitReached) {
                isNavigatingRef.current = false;
                if (toastId) toast.dismiss(toastId);
                toast.error('Límite de regeneraciones alcanzado', {
                    description: 'Has usado todos tus créditos de regeneración este mes.'
                });
                return;
            }

            let previousMeals = [];
            let currentIngredients = [];

            // Si no nos pasan el inventario, lo buscamos (caso desde Settings)
            let currentLiveInventory = liveInventory;
            if (currentLiveInventory === null) {
                try {
                    const { data } = await supabase
                        .from('user_inventory')
                        .select('ingredient_name, quantity, unit, master_ingredients(name, category)')
                        .eq('user_id', userProfile?.id)
                        .gt('quantity', 0);
                    currentLiveInventory = data || [];
                } catch (e) {
                    currentLiveInventory = [];
                }
            } else {
                // GAP 9: Verificación de staleness (Inventory drift)
                try {
                    const { data: dbData } = await supabase
                        .from('user_inventory')
                        .select('ingredient_name, quantity, unit, master_ingredients(name, category)')
                        .eq('user_id', userProfile?.id)
                        .gt('quantity', 0);

                    const dbInventory = dbData || [];

                    // Comparación rápida serializada
                    const strDb = JSON.stringify(dbInventory.map(i => ({n: i.ingredient_name, q: i.quantity, u: i.unit})).sort((a,b)=>a.n.localeCompare(b.n)));
                    const strLive = JSON.stringify(currentLiveInventory.map(i => ({n: i.ingredient_name, q: i.quantity, u: i.unit})).sort((a,b)=>a.n.localeCompare(b.n)));

                    if (strDb !== strLive) {
                        currentLiveInventory = dbInventory;
                        toast.info('Inventario sincronizado', {
                            description: 'Detectamos cambios recientes en tu Nevera y los aplicamos al nuevo plan.',
                            icon: '📦'
                        });
                    }
                } catch (e) {
                    // Si falla la verificación, seguimos con el que nos pasaron
                }
            }

            // Si no nos pasan los ingredientes agotados (Nevera Virtual)
            let currentDisabledIngredients = disabledIngredients;
            if (currentDisabledIngredients === null) {
                try {
                    const saved = localStorage.getItem('mealfit_disabled_ingredients');
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed) && parsed.every(i => typeof i === 'string')) {
                            currentDisabledIngredients = parsed;
                        } else {
                            currentDisabledIngredients = [];
                        }
                    } else {
                        currentDisabledIngredients = [];
                    }
                } catch (e) {
                    currentDisabledIngredients = [];
                }
            }

            // Si no nos pasan la lista calculada de ingredientes del plan
            let currentAllPlanIngredients = allPlanIngredients;
            if (currentAllPlanIngredients === null) {
                currentAllPlanIngredients = calculateAllPlanIngredients(planData, actualIsPlanExpired, currentLiveInventory);
            }

            // --- Analítica movida al éxito del endpoint en Plan.jsx ---

            // Lógica principal
            if (planData && !actualIsPlanExpired) {
                const planDaysToCheck = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];

                planDaysToCheck.forEach(day => {
                    day.meals.forEach(meal => {
                        if (meal && meal.name) previousMeals.push(meal.name);
                    });
                });

                // Usamos allPlanIngredients menos los disabledIngredients
                currentIngredients = currentAllPlanIngredients
                    .filter(ingObj => !currentDisabledIngredients.includes(ingObj.name.toLowerCase().trim()))
                    .map(ingObj => ingObj.id_string);
            }

            // --- Eliminar Ingredientes Agotados Físicamente ---
            if (currentDisabledIngredients.length > 0 && currentLiveInventory && currentLiveInventory.length > 0) {
                const itemsToConsume = currentLiveInventory.filter(item => {
                    const name = item.ingredient_name || item.master_ingredients?.name || 'Ingrediente';
                    return currentDisabledIngredients.includes(name.toLowerCase().trim());
                }).map(item => item.ingredient_name || item.master_ingredients?.name);

                if (itemsToConsume.length > 0) {
                    try {
                        const { data } = await supabase.auth.getSession();
                        if (data?.session?.access_token) {
                            const res = await fetch(`${API_BASE}/api/plans/inventory/consume`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${data.session.access_token}`
                                },
                                body: JSON.stringify({
                                    user_id: userProfile.id,
                                    ingredients: itemsToConsume
                                })
                            });
                            if (!res.ok) throw new Error('Network response was not ok');
                        }
                    } catch (e) {
                        console.error('Error getting session for consume:', e);
                        throw new Error('Error al sincronizar despensa física');
                    }
                }
            }

            if (toastId) toast.dismiss(toastId);
            navigate('/plan', { state: { previous_meals: previousMeals, current_pantry_ingredients: typeof currentIngredients !== 'undefined' ? currentIngredients : [], update_reason: reason, is_plan_expired: actualIsPlanExpired, entry_point, disliked_meals: Object.keys(dislikedMeals || {}) } });
        } else {
            if (toastId) toast.dismiss(toastId);
            setCurrentStep(0);
            navigate('/assessment');
        }
        } catch (error) {
            isNavigatingRef.current = false;
            if (toastId) {
                toast.dismiss(toastId);
                toast.error('Error de conexión', { description: 'Hubo un problema preparando la regeneración.' });
            }
            console.error('Error during plan regeneration:', error);
            // throw error; // Remove throw to prevent unhandled promise rejection if not caught upstream. The UI is already handled via toast.
        }
    };

    return { regeneratePlan };
};
