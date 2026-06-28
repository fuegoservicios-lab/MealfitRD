import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
// [P1-NEON-DB-MIGRATION · 2026-06-12] `authClient` queda SOLO para auth
// (getSession del POST consume). Los SELECTs de user_inventory migraron
// a GET /api/inventory via fetchWithAuth (la DB vive en Neon; PostgREST
// no está en uso).
import { authClient } from '../authClient';
import { API_BASE, fetchWithAuth } from '../config/api';
import { useAssessment } from '../context/AssessmentContext';
import { findFirstIncompleteField, FIELD_LABELS } from '../config/formValidation';

import { calculateAllPlanIngredients } from '../utils/shoppingHelpers';


export const useRegeneratePlan = () => {
    const { formData, planData, userProfile, setCurrentStep, checkPlanLimit, userPlanLimit, dislikedMeals, loadingSensitive } = useAssessment();
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

        // [P1-3] Si el descifrado del sensitive cifrado todavía está en vuelo
        // (50-200ms post-login), abortamos sin tocar `isNavigatingRef`. Sin
        // este gate, `findFirstIncompleteField` (~30 líneas abajo) evaluaría
        // con allergies=[] / motivation="" / bodyFat="" → toast "Antes de
        // regenerar, completa: Motivación" + redirect a /assessment ← pero el
        // dato SÍ está en `mealfit_form_secure`. Mostramos un toast suave en
        // su lugar; el usuario puede reintentar tras la hidratación (típicamente
        // <1s tras el login). NO disparamos navegación.
        if (loadingSensitive) {
            toast.info('Cargando tus datos…', {
                description: 'Esperando a que se sincronice tu perfil. Inténtalo en unos segundos.',
                duration: 3000,
            });
            return;
        }
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
            // [P1-B6] Validar TODOS los campos requeridos por el backend antes
            // de regenerar. Antes este check era `formData.age && formData.mainGoal`
            // (2 de 6) y permitía disparar regenerate con `gender=""` o
            // `weight=""`, llevando al usuario a `/plan` que después rebotaba
            // a `/assessment` con 422 — UX rota tras gastar tiempo de "preparar".
            const missingField = findFirstIncompleteField(formData);
            if (!missingField) {

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
            // [P1-RENEWAL-PANTRY-AWARE · 2026-06-28] Modo "completar nevera": cuando hay
            // inventario real, mandamos los items de la nevera como CANDIDATOS a reuso
            // (el backend filtra perecederos y solo SUGIERE los duraderos, advisory). Solo
            // surte efecto si el knob backend está ON; inofensivo si OFF.
            let durablePantryIngredients = [];
            let renewalPantryAware = false;

            // Si no nos pasan el inventario, lo buscamos (caso desde Settings)
            let currentLiveInventory = liveInventory;
            if (currentLiveInventory === null) {
                try {
                    // [P1-NEON-DB-MIGRATION · 2026-06-12] GET backend (embed
                    // master_ingredients incluido, solo quantity > 0 — misma
                    // proyección que el select PostgREST legacy). Best-effort:
                    // si falla, seguimos con [] como antes.
                    const res = await fetchWithAuth('/api/inventory');
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const body = await res.json();
                    currentLiveInventory = Array.isArray(body && body.items) ? body.items : [];
                } catch (e) {
                    currentLiveInventory = [];
                }
            } else {
                // GAP 9: Verificación de staleness (Inventory drift)
                try {
                    // [P1-NEON-DB-MIGRATION · 2026-06-12] Mismo GET backend
                    // para el staleness-check. Best-effort: si falla, seguimos
                    // con el inventario que nos pasaron (catch de abajo).
                    const res = await fetchWithAuth('/api/inventory');
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const body = await res.json();

                    const dbInventory = Array.isArray(body && body.items) ? body.items : [];

                    // Comparación rápida serializada
                    const strDb = JSON.stringify(dbInventory.map(i => ({n: i.ingredient_name, q: i.quantity, u: i.unit})).sort((a,b)=>a.n.localeCompare(b.n)));
                    const strLive = JSON.stringify(currentLiveInventory.map(i => ({n: i.ingredient_name, q: i.quantity, u: i.unit})).sort((a,b)=>a.n.localeCompare(b.n)));

                    if (strDb !== strLive) {
                        // [TOAST-NOISE-CLEANUP · 2026-06-22] Se mantiene la sincronización
                        // del inventario, pero SIN el toast "Inventario sincronizado": el
                        // usuario va camino a la pantalla de carga del plan y la notificación
                        // flasheaba ~1s sin aportar (la Nevera se aplica silenciosamente).
                        currentLiveInventory = dbInventory;
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
                    // [P2-CALC-INGREDIENTS-MEALS-GUARD · 2026-05-30] Guard
                    // simétrico al backend: un día parcial/chunked sin `meals`
                    // array haría `day.meals.forEach` lanzar TypeError y romper
                    // la regeneración. Mismo fix que shoppingHelpers.js.
                    const _meals = (day && Array.isArray(day.meals)) ? day.meals : [];
                    _meals.forEach(meal => {
                        if (meal && meal.name) previousMeals.push(meal.name);
                    });
                });

                // [P0-PANTRY-RENEW-EMPTY-INV · 2026-06-13] Solo reusar los
                // ingredientes del plan actual como RESTRICCIÓN de despensa si el
                // usuario REALMENTE tiene inventario (marcó "Ya compré la lista" →
                // user_inventory poblado). Con inventario VACÍO (no compró aún),
                // "Renovar para variar los alimentos" es una generación FRESCA:
                // pasar los ingredientes viejos hacía que el pantry guard del
                // revisor médico rechazara los alimentos nuevos (la variación que
                // el usuario pidió) → max_attempts → plan entregado degradado con
                // alerta plan_quality_degraded. Sin inventario real, current_
                // pantry_ingredients queda [] → el guard se auto-desactiva (no hay
                // despensa que respetar). Para usuarios CON inventario, el
                // comportamiento "reusa lo que compraste" se preserva intacto.
                const _hasRealInventory = Array.isArray(currentLiveInventory) && currentLiveInventory.length > 0;
                if (_hasRealInventory) {
                    currentIngredients = currentAllPlanIngredients
                        .filter(ingObj => !currentDisabledIngredients.includes(ingObj.name.toLowerCase().trim()))
                        .map(ingObj => ingObj.id_string);
                    // Items de la nevera como candidatos a reuso (el backend filtra perecederos).
                    renewalPantryAware = true;
                    durablePantryIngredients = currentLiveInventory
                        .map(item => item.ingredient_name || item.master_ingredients?.name)
                        .filter(Boolean);
                }
            }

            // --- Eliminar Ingredientes Agotados Físicamente ---
            if (currentDisabledIngredients.length > 0 && currentLiveInventory && currentLiveInventory.length > 0) {
                const itemsToConsume = currentLiveInventory.filter(item => {
                    const name = item.ingredient_name || item.master_ingredients?.name || 'Ingrediente';
                    return currentDisabledIngredients.includes(name.toLowerCase().trim());
                }).map(item => item.ingredient_name || item.master_ingredients?.name);

                if (itemsToConsume.length > 0) {
                    try {
                        const { data } = await authClient.auth.getSession();
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
            navigate('/plan', { state: { previous_meals: previousMeals, current_pantry_ingredients: typeof currentIngredients !== 'undefined' ? currentIngredients : [], update_reason: reason, _renewal_pantry_aware: renewalPantryAware, durable_pantry_ingredients: durablePantryIngredients, is_plan_expired: actualIsPlanExpired, entry_point, disliked_meals: Object.keys(dislikedMeals || {}) } });
        } else {
            // [P1-B6] Falta algún campo requerido. Toast informativo + redirect
            // a /assessment (antes el redirect era silencioso y el usuario no
            // sabía qué llenar). Reseteamos `isNavigatingRef` para que un
            // segundo intento (tras completar el campo) no quede bloqueado.
            isNavigatingRef.current = false;
            if (toastId) toast.dismiss(toastId);
            const label = FIELD_LABELS[missingField] || missingField;
            toast.info(`Antes de regenerar, completa: ${label}`, {
                description: 'Te llevamos al cuestionario.',
                duration: 4000,
            });
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
