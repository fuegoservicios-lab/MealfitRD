import { useState, useEffect, useRef, useMemo } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import { motion, AnimatePresence } from 'framer-motion';
import { requestNotificationPermission, subscribeToPushNotifications, isPushSupported } from '../utils/pushNotifications';

import { useNavigate, Navigate, Link } from 'react-router-dom';
import {
    Zap, Droplet, Flame, ArrowRight, CheckCircle,
    RefreshCw, ChefHat, Heart, Pill, Lock,
    Brain, Wallet, AlertCircle, Dumbbell, Wheat,
    Lightbulb, Wand2, Clock, BookOpen, Loader2, Target, ShoppingCart, Trash2, ChevronDown, Users
} from 'lucide-react';
import PropTypes from 'prop-types';
import { toast } from 'sonner';
import TrackingProgress from '../components/dashboard/TrackingProgress';
import { supabase } from '../supabase';
import html2pdf from 'html2pdf.js';
import { API_BASE } from '../config/api';
const Dashboard = () => {
    // 1. Obtenemos estado y funciones del Contexto Global
    const {
        planData,
        likedMeals,
        toggleMealLike,
        regenerateSingleMeal, // Ahora esta función es ASYNC (llama a la IA)
        formData,
        planCount,
        PLAN_LIMIT,
        userPlanLimit,
        remainingCredits,
        isPremium,
        userProfile,
        loadingData,
        setCurrentStep,
        updateData,
        refreshProfileAndPlan,
        restoreSessionData,
        setPlanData,
        setRecalcLock,
        updateUserProfile
    } = useAssessment();

    const navigate = useNavigate();

    // Estado local para saber qué tarjeta se está regenerando (loading spinner específico)
    const [regeneratingId, setRegeneratingId] = useState(null);
    const [sessionRestocked, setSessionRestocked] = useState(false);
    const [showDespensaDropdown, setShowDespensaDropdown] = useState(false);
    const despensaDropdownRef = useRef(null);
    const [showHouseholdDropdown, setShowHouseholdDropdown] = useState(false);
    const householdDropdownRef = useRef(null);

    // Cierra los dropdowns custom si el usuario hace clic fuera de ellos
    useEffect(() => {
        function handleClickOutside(event) {
            if (despensaDropdownRef.current && !despensaDropdownRef.current.contains(event.target)) {
                setShowDespensaDropdown(false);
            }
            if (householdDropdownRef.current && !householdDropdownRef.current.contains(event.target)) {
                setShowHouseholdDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Estado local para la navegación por pestañas (Días)
    const [activeDayIndex, setActiveDayIndex] = useState(0);
    const [isRecalculating, setIsRecalculating] = useState(false);

    // Estado para "Nevera Virtual" - ingredientes temporalmente marcados como agotados
    // Persistido en localStorage para sobrevivir recargas de página y navegación
    const [disabledIngredients, setDisabledIngredients] = useState(() => {
        try {
            const saved = localStorage.getItem('mealfit_disabled_ingredients');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.every(i => typeof i === 'string')) return parsed;
            }
        } catch (e) { /* ignore corrupt data */ }
        return [];
    });

    // Estados para Compras con 1 clic
    const [showRestockModal, setShowRestockModal] = useState(false);
    const [isRestocking, setIsRestocking] = useState(false);

    // Helper: Resetear estado de restock cuando cambian cantidades (personas/duración)
    const resetRestockState = useCallback(() => {
        setSessionRestocked(false);
        // Limpiar localStorage key del restock actual
        if (userProfile?.id && planData?.grocery_start_date) {
            localStorage.removeItem(`mealfit_restock_cache_${userProfile.id}_${planData.grocery_start_date}`);
        }
        if (userProfile?.id) {
            localStorage.removeItem(`mealfit_restock_cache_${userProfile.id}_latest`);
        }
    }, [userProfile?.id, planData?.grocery_start_date]);

    // Estado para el modal de Onboarding de Alertas Inteligentes
    const [showPushOnboarding, setShowPushOnboarding] = useState(false);
    const [isPushEnabling, setIsPushEnabling] = useState(false);

    // Guard contra race condition: evita que la rotación automática dispare handleNewPlan()
    // al mismo tiempo que una acción manual del usuario
    const isNavigatingRef = useRef(false);

    // Inventario real (user_inventory en DB) — sincronizado con la Nevera física
    const [liveInventory, setLiveInventory] = useState(null);

    // Sync disabledIngredients → localStorage en cada cambio
    useEffect(() => {
        try {
            if (disabledIngredients.length > 0) {
                localStorage.setItem('mealfit_disabled_ingredients', JSON.stringify(disabledIngredients));
            } else {
                localStorage.removeItem('mealfit_disabled_ingredients');
            }
        } catch (e) { /* quota exceeded or private mode */ }
    }, [disabledIngredients]);

    // Fetch inventario real desde user_inventory (refleja consumos y ediciones de la Nevera)
    useEffect(() => {
        if (!userProfile?.id) return;
        const fetchLiveInventory = async () => {
            try {
                const { data, error } = await supabase
                    .from('user_inventory')
                    .select('ingredient_name, quantity, unit, master_ingredients(name, category)')
                    .eq('user_id', userProfile.id)
                    .gt('quantity', 0)
                    .order('ingredient_name', { ascending: true });
                if (!error && data) setLiveInventory(data);
            } catch (e) {
                console.error('Error fetching live inventory:', e);
            }
        };
        fetchLiveInventory();
    }, [userProfile?.id, planData]);

    // Real-time sync: si la Nevera o el chat-agent modifican el inventario, el Dashboard se actualiza solo
    useEffect(() => {
        if (!userProfile?.id) return;
        const channel = supabase
            .channel('dashboard-inventory-sync')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user_inventory',
                filter: `user_id=eq.${userProfile.id}`
            }, async () => {
                try {
                    const { data } = await supabase
                        .from('user_inventory')
                        .select('ingredient_name, quantity, unit, master_ingredients(name, category)')
                        .eq('user_id', userProfile.id)
                        .gt('quantity', 0)
                        .order('ingredient_name', { ascending: true });
                    if (data) setLiveInventory(data);
                } catch (e) { /* non-blocking */ }
            })
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR') {
                    console.warn('[MealfitRD] Realtime sync failed for inventory channel');
                }
            });
        return () => supabase.removeChannel(channel);
    }, [userProfile?.id]);

    // 2. ESTADO DE CARGA: Si estamos recuperando datos de la DB, mostramos loader
    if (loadingData) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '1rem',
                color: '#64748B',
                background: '#F8FAFC'
            }}>
                <Loader2 className="spin-fast" size={48} color="var(--primary)" />
                <p style={{ fontWeight: 600 }}>Sincronizando tu plan...</p>
                <style>{`
                    .spin-fast { animation: spin 1s linear infinite; } 
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    // 3. Protección de Ruta: Si terminó de cargar y NO hay plan, mandar al formulario de evaluación
    if (!planData) {
        return <Navigate to="/assessment" replace />;
    }

    // Cálculos para la UI de límites
    const isLimitReached = typeof userPlanLimit === 'number' && planCount >= userPlanLimit;

    // Calcular si el periodo de compras expiró para sugerir "Actualizar Plan" en lugar de "Platos"
    const groceryDuration = formData?.groceryDuration || 'weekly';

    // Normalizar fechas a medianoche para calcular días calendario transcurridos correctamente
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const rawStartDate = planData?.grocery_start_date || planData?.created_at;
    const startMidnight = rawStartDate ? new Date(rawStartDate) : new Date();
    startMidnight.setHours(0, 0, 0, 0);

    const daysSinceCreation = Math.round((todayMidnight - startMidnight) / (1000 * 60 * 60 * 24));

    let isPlanExpired = false;
    let maxDays = 7;
    if (groceryDuration === 'weekly') { maxDays = 7; if (daysSinceCreation >= 7) isPlanExpired = true; }
    if (groceryDuration === 'biweekly') { maxDays = 15; if (daysSinceCreation >= 15) isPlanExpired = true; }
    if (groceryDuration === 'monthly') { maxDays = 30; if (daysSinceCreation >= 30) isPlanExpired = true; }

    const daysLeft = Math.max(0, maxDays - daysSinceCreation);



    // Pre-calcular ingredientes de la despensa para mostrarlos en UI
    // Prioridad unificada: Mostrar una fusión (UNION) entre el Inventario Físico Real y la Lista de Compras del Ciclo.
    const allPlanIngredients = useMemo(() => {
        if (!planData || isPlanExpired) return [];

        const currentIngredientsMap = new Map();

        // 1. Agregar Inventario Físico (user_inventory) - Lo que ya tiene en casa
        if (liveInventory && Array.isArray(liveInventory) && liveInventory.length > 0) {
            liveInventory.forEach(item => {
                const qty = parseFloat(item.quantity) || 0;
                const unit = item.unit || 'unidad';
                const name = item.ingredient_name || item.master_ingredients?.name || 'Ingrediente';
                const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1).replace(/\.0$/, '');

                let displayQty = '';
                if (qty > 0) {
                    if (unit === 'unidad') {
                        displayQty = qty === 1 ? '1 Ud.' : `${qtyStr} Uds.`;
                    } else {
                        displayQty = `${qtyStr} ${unit}`;
                    }
                }

                // id_string compatible con backend _parse_quantity
                const idString = unit === 'unidad'
                    ? `${qtyStr} ${name}`
                    : `${qtyStr} ${unit} de ${name}`;

                currentIngredientsMap.set(name.toLowerCase().trim(), {
                    id_string: idString,
                    quantity: displayQty,
                    name: name
                });
            });
        }

        // 2. Agregar Lista de Compras (lo nuevo) - Debe sobreescribir para reflejar cantidades escaladas
        if (planData.aggregated_shopping_list && Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0) {
            planData.aggregated_shopping_list.forEach(ing => {
                if (typeof ing === 'object' && ing !== null) {
                    const idString = ing.display_string || ing.name || String(ing);
                    const qty = ing.display_qty || '';
                    const name = ing.name || ing.display_name || ing.display_string || 'Ingrediente';

                    // Siempre sobreescribimos para asegurar que el UI refleje el nuevo tamaño del hogar
                    currentIngredientsMap.set(name.toLowerCase().trim(), {
                        id_string: idString,
                        quantity: qty,
                        name: name
                    });
                    
                    return;
                }

                // Fallback directo sin Regex para strings legacy
                const str_ing = String(ing).trim();
                currentIngredientsMap.set(str_ing.toLowerCase(), {
                    id_string: str_ing,
                    quantity: 'Al gusto',
                    name: str_ing
                });
            });
        } else {
            // 3. Fallback Legacy si no hay aggregated_shopping_list
            const planDaysToCheck = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
            planDaysToCheck.forEach(day => {
                day.meals.forEach(meal => {
                    if (meal && meal.ingredients && Array.isArray(meal.ingredients)) {
                        meal.ingredients.forEach(ing => {
                            let qty = 'Al gusto';
                            let name = 'Desconocido';
                            let id_string = '';

                            if (typeof ing === 'object' && ing !== null) {
                                name = ing.name || ing.display_name || ing.display_string || String(ing);
                                qty = ing.display_qty || (ing.market_qty && ing.market_unit ? `${ing.market_qty} ${ing.market_unit}` : 'Al gusto');
                                id_string = ing.display_string || name;
                            } else {
                                name = String(ing).trim();
                                id_string = name;
                            }

                            if (name.length > 2 && !currentIngredientsMap.has(name.toLowerCase().trim())) {
                                currentIngredientsMap.set(name.toLowerCase().trim(), { id_string: id_string, quantity: qty, name: name });
                            }
                        });
                    }
                });
            });
        }

        return Array.from(currentIngredientsMap.values()).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    }, [planData, isPlanExpired, liveInventory]);

    // Despensa puramente física, mapeada del user_inventory real
    const physicalPantryIngredients = useMemo(() => {
        if (!liveInventory || !Array.isArray(liveInventory) || liveInventory.length === 0) return [];

        return liveInventory.map(item => {
            const qty = parseFloat(item.quantity) || 0;
            const unit = item.unit || 'unidad';
            const name = item.ingredient_name || item.master_ingredients?.name || 'Ingrediente';
            const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1).replace(/\.0$/, '');

            let displayQty = '';
            if (qty > 0) {
                if (unit === 'unidad') {
                    displayQty = qty === 1 ? '1 Ud.' : `${qtyStr} Uds.`;
                } else {
                    displayQty = `${qtyStr} ${unit}`;
                }
            }

            return {
                name: name,
                quantity: displayQty
            };
        });
    }, [liveInventory]);

    const handleNewPlan = () => {
        // Protección contra doble disparo (auto-rotación + clic manual simultáneo)
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        // Auto-reset después de 3s por si la navegación falla
        setTimeout(() => { isNavigatingRef.current = false; }, 3000);
        if (formData && formData.age && formData.mainGoal) {
            let previousMeals = [];
            let currentIngredients = [];

            // Si NO ha expirado el plan (Actualizar Platos), enviamos las comidas previas 
            // para que la IA mantenga el plan de despensa y solo rote las preparaciones.
            // Si SÍ expiró el plan (Actualizar Plan), enviamos el arreglo vacío para que
            // la IA genere recomendaciones y una lista de compras totalmente nueva.
            if (planData && !isPlanExpired) {
                const planDaysToCheck = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];

                planDaysToCheck.forEach(day => {
                    day.meals.forEach(meal => {
                        if (meal && meal.name) previousMeals.push(meal.name);
                    });
                });

                // Usamos allPlanIngredients menos los disabledIngredients
                currentIngredients = allPlanIngredients
                    .filter(ingObj => !disabledIngredients.includes(ingObj.name.toLowerCase().trim()))
                    .map(ingObj => ingObj.id_string);

                toast('Actualizando Platos', {
                    description: 'Diseñando nuevos platos con tus ingredientes actuales...',
                    icon: '🍲',
                });
            } else {
                toast('Ciclo Renovado', {
                    description: 'Generando nueva lista de compras y menú desde cero...',
                    icon: '📦',
                });
            }

            // --- DEUDA TÉCNICA: Eliminar Ingredientes Agotados Físicamente ---
            if (disabledIngredients.length > 0 && liveInventory && liveInventory.length > 0) {
                const itemsToConsume = liveInventory.filter(item => {
                    const name = item.ingredient_name || item.master_ingredients?.name || 'Ingrediente';
                    return disabledIngredients.includes(name.toLowerCase().trim());
                }).map(item => item.ingredient_name || item.master_ingredients?.name);

                if (itemsToConsume.length > 0) {
                    supabase.auth.getSession().then(({ data }) => {
                        if (data?.session?.access_token) {
                            fetch(`${API_BASE}/api/inventory/consume`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${data.session.access_token}`
                                },
                                body: JSON.stringify({
                                    user_id: userProfile.id,
                                    ingredients: itemsToConsume
                                })
                            }).then(res => {
                                if (!res.ok) throw new Error('Network response was not ok');
                            }).catch(e => {
                                console.error(e);
                                toast.error('Error de conexión', {
                                    description: 'Hubo un problema sincronizando tu despensa física.'
                                });
                            });
                        }
                    });
                }
            }

            navigate('/plan', { state: { previous_meals: previousMeals, current_pantry_ingredients: typeof currentIngredients !== 'undefined' ? currentIngredients : [] } });
        } else {
            setCurrentStep(0);
            navigate('/assessment');
        }
    };

    // --- NUEVO: ROTACIÓN AUTOMÁTICA DIARIA (LAZY) ---
    useEffect(() => {
        if (loadingData || !planData || !formData) return;

        const autoRotateSaved = localStorage.getItem('mealfit_auto_rotate');
        // Desactivado por defecto si no existe la clave para que sea puramente opcional
        const autoRotateEnabled = autoRotateSaved !== null ? autoRotateSaved === 'true' : false;

        const tier = (userProfile?.plan_tier || '').toLowerCase();
        const isPlusOrHigher = ['plus', 'ultra', 'admin'].includes(tier);

        if (autoRotateEnabled && !isPlusOrHigher) {
            // Self-healing: Apagar rotación si el usuario ya no es premium (ej: expiró suscripción)
            localStorage.setItem('mealfit_auto_rotate', 'false');
            return;
        }

        if (autoRotateEnabled && isPlusOrHigher) {
            const today = new Date().toLocaleDateString();
            const lastRotation = localStorage.getItem('mealfit_last_auto_rotation');

            if (!lastRotation) {
                // Es la primera vez que entra con la función activa.
                // Registramos el día para que comience a rotar a partir de MAÑANA,
                // sin interrumpir la experiencia el día de hoy.
                localStorage.setItem('mealfit_last_auto_rotation', today);
            } else if (lastRotation !== today) {
                // Guardamos el día actual para asegurar que no se cicle
                localStorage.setItem('mealfit_last_auto_rotation', today);

                toast('Rotación Autónoma 🌅', {
                    description: 'Diseñando nuevos platos con tu despensa actual...',
                    icon: '🔄',
                    duration: 4000
                });

                // Disparamos la rotación de fondo como si el usuario diera a "Actualizar Platos/Plan"
                setTimeout(() => {
                    handleNewPlan();
                }, 500); // Pequeño delay de 500ms para asegurar renderizado previo
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadingData, planData, formData]);

    // --- NUEVO: ONBOARDING DE ALERTAS INTELIGENTES (WEB PUSH) ---
    useEffect(() => {
        if (!loadingData && userProfile && isPushSupported() && 'Notification' in window) {
            // Evaluamos si es un usuario recién registrado basándonos en la fecha de creación
            // Consideramos "nuevo" si su cuenta se creó hace menos de unas 2-24 horas, o simplemente
            // miramos el planCount === 1 (es su primer plan generado)
            // Por ejemplo, aquí usamos planCount === 1 como proxy de "usuario nuevo", 
            // ya que está entrando por primera vez con su primer plan.
            const isNewUser = formData?.isNewUser || planCount === 1;

            const hasSeenOnboarding = localStorage.getItem('mealfit_push_onboarding_seen');

            if (isNewUser && !hasSeenOnboarding && Notification.permission === 'default') {
                // Pequeño retraso para que la interfaz se asiente primero antes de mostrar el modal
                const timer = setTimeout(() => {
                    setShowPushOnboarding(true);
                }, 2000);
                return () => clearTimeout(timer);
            }
        }
    }, [loadingData, userProfile, planCount, formData]);

    const handleEnablePush = async () => {
        setIsPushEnabling(true);
        try {
            const permission = await requestNotificationPermission();
            if (permission) {
                await subscribeToPushNotifications(userProfile.id);
                toast.success("¡Alertas Inteligentes activadas!", {
                    description: "Te avisaremos si olvidas registrar una comida.",
                    icon: '🧠'
                });
            } else {
                toast.info("Notificaciones omitidas", {
                    description: "Puedes activarlas más adelante desde Ajustes."
                });
            }
        } catch (error) {
            console.error("Error activando notificaciones:", error);
        } finally {
            setIsPushEnabling(false);
            setShowPushOnboarding(false);
            localStorage.setItem('mealfit_push_onboarding_seen', 'true');
        }
    };

    const handleDismissPushOnboarding = () => {
        setShowPushOnboarding(false);
        localStorage.setItem('mealfit_push_onboarding_seen', 'true');
    };

    const handleDownloadShoppingList = async () => {
        try {
            const loadingToast = toast.loading('Generando lista de compras...', { position: 'top-center' });

            // Obtener duración actual desde el formulario para cambiar la cantidad en el PDF sobre la marcha
            const duration = formData?.groceryDuration || 'weekly';

            // Usar la lista consolidada correcta según el ciclo seleccionado
            let sourceListKey = 'aggregated_shopping_list';
            if (duration === 'weekly' && planData.aggregated_shopping_list_weekly) {
                sourceListKey = 'aggregated_shopping_list_weekly';
            } else if (duration === 'biweekly' && planData.aggregated_shopping_list_biweekly) {
                sourceListKey = 'aggregated_shopping_list_biweekly';
            } else if (duration === 'monthly' && planData.aggregated_shopping_list_monthly) {
                sourceListKey = 'aggregated_shopping_list_monthly';
            }

            const sourceIngredients = (planData[sourceListKey] && Array.isArray(planData[sourceListKey]) && planData[sourceListKey].length > 0)
                ? planData[sourceListKey]
                : (planData.aggregated_shopping_list && Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0)
                    ? planData.aggregated_shopping_list
                    : (allPlanIngredients || []);

            if (sourceIngredients.length === 0) {
                toast.dismiss(loadingToast);
                toast.error('No se encontró una lista de despensa activa.');
                return;
            }

            const consData = {};
            sourceIngredients.forEach((item, index) => {
                let name = '';
                let cat = '🛒 OTROS';
                let qtyStr = 'Al gusto';

                if (typeof item === 'object' && item !== null) {
                    // Nivel 3: Consumir display_category del backend (Single Source of Truth)
                    name = item.name || item.display_name || item.item_name || 'Desconocido';
                    cat = item.display_category || item.category || '🛒 OTROS';

                    if (item.display_qty) {
                        // Nivel 3: display_qty ya viene con pluralización correcta del backend
                        qtyStr = item.display_qty;
                    } else if (item.market_qty !== undefined && item.market_unit !== undefined && item.market_qty !== '') {
                        qtyStr = `${item.market_qty} ${item.market_unit}`;
                    } else if (item.display_string) {
                        const parts = item.display_string.split(name);
                        if (parts.length > 0 && parts[0].trim().length > 0) {
                            qtyStr = parts[0].trim();
                        } else {
                            qtyStr = item.display_string;
                        }
                    }
                } else {
                    // Fallback directo sin Regex para strings legacy (si llegara a ocurrir)
                    const itemStr = String(item).trim();
                    name = itemStr.charAt(0).toUpperCase() + itemStr.slice(1).toLowerCase();
                    qtyStr = 'Al gusto';
                }

                consData[index] = {
                    name: name,
                    display_name: name,
                    category: cat,
                    item_ref: item,
                    qty_base: qtyStr || 'Al gusto'
                };
            });

            const perishables = {};
            const stables = {};
            Object.values(consData).forEach(item => {
                let cat = item.category;
                const shelfLife = item.item_ref?.shelf_life_days;

                let isPerishable = false;
                if (shelfLife !== undefined && shelfLife !== null) {
                    isPerishable = shelfLife <= 7;
                } else {
                    const lowerCat = cat.toLowerCase();
                    if (lowerCat.includes('proteína') || lowerCat.includes('lácteo') || lowerCat.includes('vegetal') || lowerCat.includes('fruta')) {
                        isPerishable = true;
                    }
                }

                if (isPerishable) {
                    if (!perishables[cat]) perishables[cat] = [];
                    perishables[cat].push(item);
                } else {
                    if (!stables[cat]) stables[cat] = [];
                    stables[cat].push(item);
                }
            });

            // ── Dedup: Consolidar categorías duplicadas entre secciones ──
            // Si una categoría aparece en AMBAS secciones, mover TODOS sus items
            // a la sección donde esa categoría pertenece por naturaleza.
            const PERISHABLE_CATS = ['proteína', 'vegetal', 'fruta', 'lácteo'];
            const duplicatedCats = Object.keys(perishables).filter(c => stables[c]);
            duplicatedCats.forEach(cat => {
                const lowerCat = cat.toLowerCase();
                const belongsToPerishable = PERISHABLE_CATS.some(p => lowerCat.includes(p));
                if (belongsToPerishable) {
                    // Mover items estables de esta categoría → perecederos
                    perishables[cat] = [...perishables[cat], ...stables[cat]];
                    delete stables[cat];
                } else {
                    // Mover items perecederos de esta categoría → estables
                    stables[cat] = [...stables[cat], ...perishables[cat]];
                    delete perishables[cat];
                }
            });

            // Count total items to adjust density and keep the PDF on 1 page
            const totalItems = Object.values(consData).length;
            const isDense = totalItems >= 26;
            const rootPadding = isDense ? '12px' : '20px';
            const headerPadding = isDense ? '12px 16px' : '16px 20px';
            const headerMargin = isDense ? '12px' : '20px';
            const gapMargin = isDense ? '6px' : '10px';  // grid gap
            const listGap = isDense ? '8px' : '10px';

            // Obtener duración actual (ya declarada arriba)
            let durationText = '7 Días';
            let qtyField = 'qty_7';
            if (duration === 'biweekly') { durationText = '15 Días'; qtyField = 'qty_15'; }
            if (duration === 'monthly') { durationText = '1 Mes'; qtyField = 'qty_30'; }

            // Generar contenido HTML estilizado para el PDF
            const element = document.createElement('div');

            let htmlContent = `
            <div style="font-family: 'Inter', system-ui, sans-serif; padding: ${rootPadding}; color: #1f2937; background-color: #ffffff;">
                <!-- Header Box -->
                <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: ${headerPadding}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); display: flex; align-items: center; justify-content: space-between; margin-bottom: ${headerMargin}; border-top: 5px solid #10b981;">
                    <div>
                        <h1 style="margin: 0 0 8px 0; color: #111827; font-size: 20px; font-weight: 800; letter-spacing: -0.025em;">Lista de Compras</h1>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <span style="background-color: #ecfdf5; color: #065f46; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; border: 1px solid #10b98140;">Ciclo: ${durationText}</span>
                            ${(formData?.householdSize || 1) > 1 ? `<span style="background-color: #f5f3ff; color: #6d28d9; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; border: 1px solid #ddd6fe;">👥 ${formData.householdSize} Personas</span>` : ''}
                            <span style="background-color: #f3f4f6; color: #4b5563; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600;">Generado: ${new Date().toLocaleDateString('es-DO')}</span>
                        </div>
                    </div>
                    <img src="/favicon-transparent.png" alt="MealfitRD Logo" style="height: 40px;" />
                </div>

                
                <!-- Disclaimer de Cantidades -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #3b82f6; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                    <svg style="flex-shrink: 0; width: 16px; height: 16px; color: #3b82f6; margin-top: 1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p style="margin: 0; font-size: 11px; color: #334155; line-height: 1.4;">
                        <strong>Smart Engine:</strong> Las cantidades listadas han sido <strong>calculadas de manera exacta</strong> según empaques del mercado local dominicano${(formData?.householdSize || 1) > 1 ? ` y <strong>multiplicadas para ${formData.householdSize} personas</strong>` : ''}. Ajusta según tu inventario actual en casa. <strong>Nota: "Ud." significa "Unidad" (pieza entera).</strong>
                    </p>
                </div>

            `;

            const generateBlocks = (groupObj) => {
                let innerHtml = '';
                const sortedKeys = Object.keys(groupObj).sort((a, b) => {
                    if (a.includes('ESTIMADO TOTAL')) return 1;
                    if (b.includes('ESTIMADO TOTAL')) return -1;
                    return a.localeCompare(b);
                });

                sortedKeys.forEach(cat => {
                    const icon = `<span style="background-color: #10b981; color: white; border-radius: 4px; padding: 4px; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px;"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg></span>`;
                    innerHtml += `
                    <div style="background-color: #ffffff; border: 1px solid #f3f4f6; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); break-inside: avoid-column; page-break-inside: avoid; margin-bottom: 16px; display: table; width: 100%;">
                        <div style="background-color: #f8fafc; padding: ${isDense ? '6px 10px' : '8px 12px'}; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 6px;">
                            ${icon}
                            <h3 style="margin: 0; font-size: 11px; font-weight: 800; color: #1f2937; text-transform: uppercase; letter-spacing: 0.05em;">${cat}</h3>
                        </div>
                        <ul style="list-style: none; padding: 0; margin: 0;">
                    `;
                    groupObj[cat].forEach((item, index) => {
                        const isLast = index === groupObj[cat].length - 1;
                        const borderBottom = isLast ? '' : 'border-bottom: 1px solid #f3f4f6;';

                        let displayQty = item.qty_base || '';
                        let display = item.display_name || item.name || item.item_name;

                        if (typeof display === 'string' && display.trim().startsWith('{')) {
                            try {
                                const parsed = JSON.parse(display);
                                display = parsed.display_name || parsed.name || parsed.item_name || display;
                            } catch (e) { }
                        } else if (typeof display === 'object' && display !== null) {
                            display = display.display_name || display.name || display.item_name || JSON.stringify(display);
                        }

                        const conf = (item.item_ref && item.item_ref.confidence_score) ? item.item_ref.confidence_score : 1.0;
                        let tagBg = '#ecfdf5'; let tagColor = '#059669'; let tagBorder = '#10b98130';
                        if (conf >= 0.9) { tagBg = '#ecfdf5'; tagColor = '#059669'; tagBorder = '#10b98130'; }
                        else if (conf >= 0.7) { tagBg = '#fff7ed'; tagColor = '#ea580c'; tagBorder = '#ea580c30'; }
                        else { tagBg = '#fef2f2'; tagColor = '#ef4444'; tagBorder = '#ef444430'; }

                        const qtyStr = displayQty && String(displayQty).trim() !== 'None' ? `<span style="font-weight: 700; color: ${tagColor}; font-size: ${isDense ? '8.5px' : '9.5px'}; background-color: ${tagBg}; border: 1px solid ${tagBorder}; padding: 1.5px 4px; border-radius: 4px; margin-left: 6px; white-space: nowrap; align-self: flex-start;">${displayQty}</span>` : '';

                        innerHtml += `
                            <li style="display: flex; align-items: flex-start; padding: ${isDense ? '4px 8px' : '6px 12px'}; ${borderBottom} page-break-inside: avoid;">
                                <div style="width: ${isDense ? '12px' : '14px'}; height: ${isDense ? '12px' : '14px'}; border: 1.5px solid #d1d5db; border-radius: ${isDense ? '3px' : '4px'}; margin-right: ${isDense ? '6px' : '10px'}; flex-shrink: 0; background-color: #ffffff; margin-top: 2px;"></div>
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                                    <span style="font-size: ${isDense ? '10px' : '11px'}; font-weight: 600; color: #374151; line-height: 1.3;">${display}</span>
                                    ${qtyStr}
                                </div>
                            </li>
                        `;
                    });
                    innerHtml += `</ul></div>`;
                });
                return innerHtml;
            };

            if (Object.keys(perishables).length > 0) {
                htmlContent += `
                <!-- Prioridad Alta -->
                <div style="background-color: #fef2f2; border: 1px solid #fca5a5; padding: 6px 12px; border-radius: 6px; margin-bottom: 12px; display: table;">
                    <div style="display: table-cell; vertical-align: middle; padding-right: 6px; padding-top: 2px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <div style="display: table-cell; vertical-align: middle;">
                        <span style="font-size: 11px; font-weight: 800; color: #991b1b; letter-spacing: 0.05em;">COMPRA INMEDIATA (PERECEDEROS 1-7 DÍAS)</span>
                    </div>
                </div>
                <div style="column-count: 3; column-gap: 16px;">
                `;
                htmlContent += generateBlocks(perishables);
                htmlContent += `</div> <!-- End Columns -->`;
            }

            if (Object.keys(stables).length > 0) {
                htmlContent += `
                <!-- Estables -->
                <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 6px 12px; border-radius: 6px; margin-top: 4px; margin-bottom: 12px; display: table;">
                    <div style="display: table-cell; vertical-align: middle; padding-right: 6px; padding-top: 2px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2.5"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/></svg>
                    </div>
                    <div style="display: table-cell; vertical-align: middle;">
                        <span style="font-size: 11px; font-weight: 800; color: #166534; letter-spacing: 0.05em;">DESPENSA Y ESTABLES (+7 DÍAS)</span>
                    </div>
                </div>
                <div style="column-count: 3; column-gap: 16px;">
                `;
                htmlContent += generateBlocks(stables);
                htmlContent += `</div> <!-- End Columns -->`;
            }


            htmlContent += `
                <!-- Footer -->
                <div style="margin-top: 15px; text-align: center; color: #9ca3af; font-size: 10px; border-top: 2px dashed #e5e7eb; padding-top: 10px;">
                    <p style="margin: 0; font-weight: 700; color: #6b7280; letter-spacing: 1px;">PROCESADO POR MEALFITRD IA - NUTRICIÓN INTELIGENTE</p>
                </div>
            </div>
            `;

            element.innerHTML = htmlContent;

            // html2pdf opciones
            const opt = {
                margin: [5, 0, 5, 0], // top, left, bottom, right (en mm)
                filename: `Lista_de_compras_${durationText.replace(' ', '_')}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            await html2pdf().set(opt).from(element).save();

            toast.dismiss(loadingToast);
            toast.success('Lista PDF descargada exitosamente', { icon: '📄', position: 'top-center' });

        } catch (error) {
            console.error('Error downloading supply list:', error);
            toast.dismiss();
            toast.error('Error al generar la lista de compras.');
        }
    };

    const handleRestock = async () => {
        console.log('🛒 [RESTOCK] handleRestock INVOKED');
        console.log('🛒 [RESTOCK] userProfile:', userProfile);
        console.log('🛒 [RESTOCK] planData?.id:', planData?.id);
        console.log('🛒 [RESTOCK] planData?.is_restocked:', planData?.is_restocked);

        if (!userProfile?.id) {
            console.log('🛒 [RESTOCK] BLOCKED: No user profile');
            toast.error('Debes iniciar sesión para usar esta función.');
            return;
        }

        // 1. Validación Principal: Servidor (Impide duplicación entre dispositivos)
        if (planData?.is_restocked) {
            console.log('🛒 [RESTOCK] BLOCKED: Plan already restocked (server flag)');
            toast.info('Ya registraste las compras para este ciclo (Verificado en Nube).', { icon: '📦' });
            setShowRestockModal(false);
            return;
        }

        // 2. Validación Secundaria: Caché Local (UX Inmediata)
        // IMPORTANTE: Incluir user_id para que no se compartan keys entre cuentas en localhost
        // Usamos grocery_start_date porque planData desde el AssessmentContext a veces no trae 'id'
        const restockKey = planData ? `mealfit_restock_cache_${userProfile?.id}_${planData.grocery_start_date || 'latest'}` : null;
        if (restockKey && localStorage.getItem(restockKey)) {
            console.log('🛒 [RESTOCK] BLOCKED: localStorage key exists:', restockKey);
            toast.info('Ya registraste las compras para este ciclo. Puedes editar cantidades directamente en la Nevera.', { icon: '📦' });
            setShowRestockModal(false);
            return;
        }

        setIsRestocking(true);
        const loadingToast = toast.loading('Guardando ingredientes en la despensa...', { position: 'top-center' });

        try {
            // Fuente Verdadera: Solo enviar a la BD lo que es estrictamente NUEVO de la Lista de Compras del Plan!
            // No enviar todo el 'allPlanIngredients' ya que duplicaría el liveInventory que el usuario ya poseía.
            const duration = formData?.groceryDuration || 'weekly';
            let sourceListKey = 'aggregated_shopping_list';
            if (duration === 'weekly' && planData.aggregated_shopping_list_weekly) {
                sourceListKey = 'aggregated_shopping_list_weekly';
            } else if (duration === 'biweekly' && planData.aggregated_shopping_list_biweekly) {
                sourceListKey = 'aggregated_shopping_list_biweekly';
            } else if (duration === 'monthly' && planData.aggregated_shopping_list_monthly) {
                sourceListKey = 'aggregated_shopping_list_monthly';
            }

            const activeShoppingList = (planData[sourceListKey] && Array.isArray(planData[sourceListKey]) && planData[sourceListKey].length > 0)
                ? planData[sourceListKey]
                : (planData.aggregated_shopping_list && Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0)
                    ? planData.aggregated_shopping_list
                    : (allPlanIngredients || []);

            console.log('🛒 [RESTOCK] sourceListKey:', sourceListKey);
            console.log('🛒 [RESTOCK] activeShoppingList length:', activeShoppingList.length);
            console.log('🛒 [RESTOCK] activeShoppingList[0]:', activeShoppingList[0]);
            console.log('🛒 [RESTOCK] disabledIngredients:', disabledIngredients);

            const sourceIngredients = activeShoppingList.map(ing => {
                let name = '';
                let structured = null;
                let raw = '';
                if (typeof ing === 'object' && ing !== null) {
                    name = ing.name || ing.display_name || ing.display_string || String(ing);
                    // Send structured data directly to bypass display_string re-parsing
                    // (display_string contains Unicode fractions like ½ that _parse_quantity can't handle)
                    if (ing.name && (ing.market_qty !== undefined || ing.display_qty)) {
                        const mqRaw = ing.market_qty ?? ing.display_qty ?? 1;
                        let mqNum = 0;
                        if (typeof mqRaw === 'number') {
                            mqNum = mqRaw;
                        } else if (typeof mqRaw === 'string') {
                            // Parse fractional strings like "1/2", "1 1/2", "3/4"
                            const parts = mqRaw.trim().split(/\s+/);
                            try {
                                if (parts.length === 2 && parts[1].includes('/')) {
                                    const [n, d] = parts[1].split('/');
                                    mqNum = parseFloat(parts[0]) + parseFloat(n) / parseFloat(d);
                                } else if (parts.length === 1 && parts[0].includes('/')) {
                                    const [n, d] = parts[0].split('/');
                                    mqNum = parseFloat(n) / parseFloat(d);
                                } else {
                                    mqNum = parseFloat(mqRaw) || 0;
                                }
                            } catch { mqNum = parseFloat(mqRaw) || 0; }
                        }
                        structured = {
                            name: ing.name,
                            quantity: mqNum,
                            unit: ing.market_unit || 'unidad'
                        };
                    }
                    raw = ing.display_string || ing.id_string || `${ing.display_qty || '1'} de ${ing.name || 'Ingrediente'}`;
                } else {
                    raw = String(ing);
                    const match = raw.match(/^([\d.,\/\s½¼¾%]+(?:oz|lbs?|g|kg|ml|l|taza[s]?|cda[s]?|cdta[s]?|u|pz[a]?[s]?|dientes?|manojo|piezas?|rebanadas?)\s*(?:de\s*)?)(.*)$/i) || raw.match(/^([\d.,\/\s½¼¾%]+(?:de\s*)?)(.*)$/i);
                    name = raw;
                    if (match) name = match[2];
                }
                return { raw, structured, normalized: name.toLowerCase().trim() };
            }).filter(item => !disabledIngredients.includes(item.normalized))
                .map(item => item.structured || item.raw);

            console.log('🛒 [RESTOCK] sourceIngredients count:', sourceIngredients.length);
            console.log('🛒 [RESTOCK] sourceIngredients sample:', sourceIngredients.slice(0, 3));

            if (sourceIngredients.length === 0) {
                console.log('🛒 [RESTOCK] BLOCKED: Zero ingredients after filtering');
                toast.dismiss(loadingToast);
                toast.error('No hay ingredientes para guardar.');
                setIsRestocking(false);
                setShowRestockModal(false);
                return;
            }

            const sessionObj = await supabase.auth.getSession();
            const token = sessionObj.data.session?.access_token;
            console.log('🛒 [RESTOCK] Token exists:', !!token);
            console.log('🛒 [RESTOCK] Sending to:', `${API_BASE}/api/restock`);

            const response = await fetch(`${API_BASE}/api/restock`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    user_id: userProfile.id,
                    plan_id: planData?.id,
                    ingredients: sourceIngredients
                })
            });

            const data = await response.json();
            console.log('🛒 [RESTOCK] Response status:', response.status);
            console.log('🛒 [RESTOCK] Response data:', data);
            toast.dismiss(loadingToast);

            if (response.ok && data.success) {
                if (restockKey) localStorage.setItem(restockKey, new Date().toISOString());
                toast.success('¡Ingredientes ingresados a tu Nevera Virtual!', { icon: '📦' });
                setSessionRestocked(true);
                setShowRestockModal(false);
                // Refrescar inventario real para sincronizar la Despensa del Dashboard
                try {
                    const { data: freshInv } = await supabase
                        .from('user_inventory')
                        .select('ingredient_name, quantity, unit, master_ingredients(name, category)')
                        .eq('user_id', userProfile.id)
                        .gt('quantity', 0)
                        .order('ingredient_name', { ascending: true });
                    if (freshInv) setLiveInventory(freshInv);
                    console.log('🛒 [RESTOCK] Fresh inventory count:', freshInv?.length);
                } catch (e) { /* non-blocking */ }
                // Limpiar ingredientes deshabilitados ya que la despensa se actualizó
                setDisabledIngredients([]);
                navigate('/dashboard/pantry');
            } else {
                console.log('🛒 [RESTOCK] FAILED:', data.message);
                toast.error(data.message || 'Error al actualizar la despensa.');
            }
        } catch (error) {
            console.error('🛒 [RESTOCK] CATCH ERROR:', error);
            toast.dismiss(loadingToast);
            toast.error('Hubo un error de conexión al registrar la compra.');
        } finally {
            setIsRestocking(false);
        }
    };


    // Retrocompatibilidad y extracción de días
    const planDays = planData?.days || [{ day: 1, meals: planData?.meals || planData?.perfectDay || [] }];
    const currentDayMeals = planDays[activeDayIndex]?.meals || [];
    const currentDaySupplements = planDays[activeDayIndex]?.supplements || [];

    return (
        <>

            {/* Mobile Responsive Styles */}
            <style>{`
                .dashboard-header {
                    margin-bottom: 3rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    flex-wrap: wrap;
                    gap: 1.5rem;
                    background: linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.5) 100%);
                    backdrop-filter: blur(12px);
                    padding: 2rem;
                    border-radius: 2rem;
                    border: 1px solid rgba(255,255,255,0.6);
                    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.05);
                    position: relative;
                    z-index: 100;
                }
                .dashboard-title {
                    font-size: 2.5rem;
                    font-weight: 800;
                    line-height: 1.1;
                    letter-spacing: -0.03em;
                    margin-bottom: 0.25rem;
                    color: #1E293B;
                }
                .dashboard-subtitle {
                    color: #64748B;
                    font-size: 1.1rem;
                    font-weight: 500;
                }
                .macros-card {
                    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.8) 100%);
                    backdrop-filter: blur(20px);
                    border-radius: 1.75rem;
                    border: 1px solid rgba(226, 232, 240, 0.8);
                    box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.05), inset 0 2px 4px rgba(255, 255, 255, 0.8);
                    margin-bottom: 2.5rem;
                    overflow: hidden;
                    position: relative;
                }
                .macros-card-header {
                    padding: 1.5rem 1.75rem 0.5rem 1.75rem;
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    margin: 0;
                }
                .macros-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    position: relative;
                }
                .macros-grid > div:not(:last-child) {
                    border-right: 1px solid rgba(226, 232, 240, 0.6);
                }
                .stat-item {
                    padding: 1.5rem 1.75rem;
                    display: flex;
                    align-items: center;
                    gap: 1.15rem;
                    background: transparent;
                    cursor: default;
                }
                .menu-section-header {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 2.5rem 2rem 1.5rem 4rem;
                }
                .menu-section-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--text-main);
                    margin: 0;
                    text-align: center;
                }
                .menu-section-count {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                }
                .option-buttons {
                    display: flex;
                    gap: 1rem;
                    justify-content: center;
                    background: transparent;
                    padding: 0.5rem 2rem 1.5rem 4rem;
                    border-bottom: 2px dashed #94A3B8;
                }
                .option-btn {
                    flex: 1;
                    padding: 1rem;
                    border-radius: 0.75rem;
                    font-weight: 800;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-size: 1rem;
                }
                .meals-container {
                    background-color: #FDFCF8;
                    border-radius: 0.5rem 1.75rem 1.75rem 0.5rem;
                    border: 1px solid #E2E8F0;
                    border-left: 20px solid #1E293B;
                    box-shadow: 4px 4px 0px rgba(0,0,0,0.02), 8px 8px 0px rgba(0,0,0,0.01), 0 25px 50px -12px rgba(0,0,0,0.15), inset 8px 0px 8px -4px rgba(0,0,0,0.2);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    position: relative;
                }
                .meals-container::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    left: 2.5rem;
                    width: 3px;
                    border-left: 1px solid rgba(248, 113, 113, 0.4);
                    border-right: 1px solid rgba(248, 113, 113, 0.4);
                    z-index: 0;
                    pointer-events: none;
                }
                .meal-card {
                    padding: 2.5rem 2.5rem 2.5rem 4.5rem;
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: 1.5rem;
                    align-items: center;
                    background: transparent;
                    position: relative;
                    z-index: 1;
                }
                .meal-card:not(:last-child)::after,
                .skipped-lunch:not(:last-child)::after {
                    content: '';
                    display: block;
                    position: absolute;
                    bottom: 0;
                    left: 2.5rem;
                    right: 0;
                    height: 2px;
                    background: rgba(147, 197, 253, 0.3);
                }
                .skipped-lunch {
                    padding: 2.5rem 2.5rem 2.5rem 4.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1.5rem;
                    position: relative;
                    flex-wrap: wrap;
                    z-index: 1;
                }
                .main-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 2.5rem;
                }
                .actions-group {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
                    position: relative;
                    z-index: 50;
                }
                .new-plan-btn {
                    padding: 0.85rem 1.75rem;
                    border-radius: 1rem;
                    border: none;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-size: 0.95rem;
                    cursor: pointer;
                }
                .new-plan-btn:hover:not(:disabled) {
                    box-shadow: var(--hover-shadow, 0 15px 30px -5px rgba(0,0,0,0.15)) !important;
                    filter: brightness(1.1);
                }
                .new-plan-btn:active:not(:disabled) {
                    box-shadow: var(--active-shadow, 0 5px 15px -5px rgba(0,0,0,0.1)) !important;
                    filter: brightness(0.95);
                }

                @media (max-width: 768px) {
                    .dashboard-header {
                        padding: 1.25rem;
                        margin-bottom: 1.5rem;
                        border-radius: 1.25rem;
                        gap: 1rem;
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .header-text-group {
                        align-items: center;
                        text-align: center;
                    }
                    .dashboard-title {
                        font-size: 1.65rem;
                    }
                    .dashboard-subtitle {
                        font-size: 0.9rem;
                    }
                    .macros-card {
                        border-radius: 1.25rem;
                    }
                    .macros-card-header {
                        padding: 1.25rem 1.15rem 0.25rem 1.15rem;
                    }
                    .macros-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                    .macros-grid > div:not(:last-child) {
                        border-right: none;
                    }
                    .stat-item {
                        padding: 1.25rem 1.15rem;
                        gap: 0.85rem;
                        border-bottom: 1px solid rgba(226, 232, 240, 0.6);
                    }
                    .stat-item:nth-child(odd) {
                        border-right: 1px solid rgba(226, 232, 240, 0.6) !important;
                    }
                    .stat-item:nth-child(n+3) {
                        border-bottom: none !important;
                    }
                    .stat-item .stat-icon {
                        width: 40px !important;
                        height: 40px !important;
                        border-radius: 10px !important;
                    }
                    .stat-item .stat-icon svg {
                        width: 20px;
                        height: 20px;
                    }
                    .stat-item .stat-value {
                        font-size: 1.25rem !important;
                    }
                    .stat-item .stat-label {
                        font-size: 0.7rem !important;
                    }
                    .menu-section-header {
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        gap: 0.5rem;
                        margin-bottom: 0.5rem;
                        padding: 1.5rem 1rem 0.5rem 2.25rem;
                    }
                    .menu-section-title {
                        text-align: center;
                        width: 100%;
                    }
                    .option-buttons {
                        gap: 0.5rem;
                        padding: 0 1.5rem 1.25rem 2.5rem;
                        margin-bottom: 0;
                    }
                    .option-btn {
                        padding: 0.7rem 0.5rem;
                        font-size: 0.85rem;
                        border-radius: 0.6rem;
                    }
                    .meals-container::before {
                        left: 0.5rem;
                    }
                    .meal-card:not(:last-child)::after,
                    .skipped-lunch:not(:last-child)::after {
                        left: 0.5rem;
                        display: block;
                    }
                    .meal-card {
                        padding: 2rem 1.25rem 2rem 2.25rem;
                        border-radius: 0;
                        grid-template-columns: 1fr;
                        gap: 1rem;
                    }
                    .skipped-lunch {
                        padding: 2rem 1.25rem 2rem 2.25rem;
                    }
                    .meal-right-side {
                        flex-direction: row !important;
                        align-items: center !important;
                        justify-content: space-between;
                        width: 100%;
                        border-top: 1px solid #F1F5F9;
                        padding-top: 0.75rem;
                    }
                    .meal-right-side > div:first-child {
                        text-align: left !important;
                    }
                    .main-grid {
                        grid-template-columns: 1fr;
                        gap: 1.5rem;
                    }
                    .actions-group {
                        width: 100%;
                        align-items: flex-start;
                    }
                    .new-plan-wrapper {
                        flex: 1.1;
                    }
                    .new-plan-btn {
                        width: 100%;
                        justify-content: center;
                        padding: 0.75rem 1.25rem;
                        font-size: 0.88rem;
                    }
                    .credits-badge {
                        flex: 1;
                    }
                }

                @media (max-width: 480px) {
                    .dashboard-header {
                        padding: 1rem;
                        margin-bottom: 1.25rem;
                        border-radius: 1rem;
                    }
                    .dashboard-title {
                        font-size: 1.45rem;
                    }
                    .stat-item {
                        padding: 0.85rem 0.7rem;
                    }
                    .meals-container::before {
                        left: 0.5rem;
                    }
                    .meal-card:not(:last-child)::after,
                    .skipped-lunch:not(:last-child)::after {
                        left: 0.5rem;
                    }
                    .menu-section-header {
                        padding: 1.25rem 1rem 0.5rem 1.75rem;
                    }
                    .option-buttons {
                        padding: 0.5rem 1.5rem 1.25rem 1.75rem;
                    }
                    .meal-card {
                        padding: 1.5rem 1rem 1.5rem 1.75rem;
                        border-radius: 0;
                    }
                    .skipped-lunch {
                        padding: 1.5rem 1rem 1.5rem 1.75rem;
                    }
                    .meal-right-side > div:last-child {
                        gap: 0.5rem !important;
                    }
                }
            `}</style>

            {/* --- HEADER PREMIUM --- */}
            <header className="dashboard-header">
                <div className="header-text-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

                    {/* PLAN TIER BADGE */}
                    <div style={{ marginBottom: '0.25rem' }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.65rem',
                            fontWeight: '800',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            background: isPremium ? 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' : '#F8FAFC',
                            color: isPremium ? '#B45309' : '#64748B',
                            border: `1.5px solid ${isPremium ? '#FCD34D' : '#CBD5E1'}`,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                        }}>
                            {isPremium ? (userProfile?.plan_tier === 'ultra' ? 'ULTRA' : userProfile?.plan_tier === 'basic' ? 'BÁSICO' : 'PLUS') : 'GRATUITO'}
                        </span>
                    </div>

                    <h1 className="dashboard-title">
                        Hola, <span style={{
                            background: 'linear-gradient(to right, #3B82F6, #8B5CF6)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>
                            {userProfile?.full_name?.split(' ')[0] || formData?.name || 'Nutrifit'}
                        </span>
                    </h1>
                    <p className="dashboard-subtitle">
                        Aquí tienes tu estrategia nutricional de hoy.
                    </p>
                </div>

                {/* --- ACTIONS GROUP --- */}
                <div className="actions-group">

                    {/* VISUALIZADOR DE CRÉDITOS */}
                    <div className="credits-badge" style={{
                        background: '#FFFFFF',
                        padding: '0.6rem 1rem',
                        borderRadius: '1rem',
                        border: '2px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.875rem',
                        boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.08)',
                    }}>
                        <div style={{
                            width: 36, height: 36,
                            background: isLimitReached ? '#FEF2F2' : '#EFF6FF',
                            color: isLimitReached ? '#EF4444' : '#3B82F6',
                            borderRadius: '0.75rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Zap size={18} fill={isLimitReached ? '#EF4444' : '#3B82F6'} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em', WebkitTextStroke: '0.5px #334155' }}>
                                Créditos
                            </span>
                            <div style={{
                                fontSize: '1rem',
                                fontWeight: 800,
                                color: 'var(--text-main)',
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: '3px',
                                whiteSpace: 'nowrap'
                            }}>
                                {remainingCredits} {userPlanLimit !== 'Ilimitado' && <span style={{ color: '#94A3B8', fontSize: '0.85rem', fontWeight: 600 }}>/ {userPlanLimit}</span>}
                            </div>
                        </div>
                    </div>

                    {/* REGENERACIÓN DE MENÚ Y EXPORTACIÓN */}
                    <div className="new-plan-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'stretch' }}>

                        {/* SELECTOR DE CICLO DE DESPENSA */}
                        {/* SELECTOR DE CICLO DE DESPENSA — Custom Dropdown */}
                        <div ref={despensaDropdownRef} style={{ position: 'relative' }}>
                            <div
                                onClick={() => setShowDespensaDropdown(!showDespensaDropdown)}
                                onMouseEnter={(e) => {
                                    if (!showDespensaDropdown) {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!showDespensaDropdown) {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)';
                                    }
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    gap: '0.75rem',
                                    background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                                    padding: '0.5rem 0.75rem 0.5rem 1rem',
                                    borderRadius: '12px',
                                    border: `1.5px solid ${showDespensaDropdown ? '#10B981' : '#CBD5E1'}`,
                                    boxShadow: showDespensaDropdown
                                        ? '0 0 0 3px rgba(16, 185, 129, 0.1), 0 2px 4px rgba(0,0,0,0.05)'
                                        : '0 2px 5px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
                                    minHeight: '42px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    userSelect: 'none'
                                }}
                            >
                                {/* Accent line */}
                                <div style={{
                                    position: 'absolute', left: 0, top: '20%', bottom: '20%', width: '3px',
                                    borderRadius: '0 3px 3px 0',
                                    background: 'linear-gradient(180deg, #10B981, #059669)'
                                }} />

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '8px',
                                        background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        <Clock size={14} color="#059669" strokeWidth={2.5} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', lineHeight: '1' }}>
                                        <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 500 }}>
                                            Despensa
                                        </span>
                                        <span style={{ fontSize: '0.82rem', color: '#0F172A', fontWeight: 700 }}>
                                            {{ weekly: '7\u00A0\u00A0Días', biweekly: '15\u00A0\u00A0Días', monthly: '1\u00A0\u00A0Mes' }[groceryDuration] || '7\u00A0\u00A0Días'}
                                        </span>
                                    </div>
                                    <motion.div
                                        animate={{ rotate: showDespensaDropdown ? 180 : 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <ChevronDown size={14} color="#94A3B8" strokeWidth={2.5} />
                                    </motion.div>
                                </div>

                                {!isPlanExpired ? (
                                    <div style={{
                                        background: daysLeft <= 2
                                            ? 'linear-gradient(135deg, #FEE2E2, #FECACA)'
                                            : 'linear-gradient(135deg, #DBEAFE, #BFDBFE)',
                                        color: daysLeft <= 2 ? '#DC2626' : '#2563EB',
                                        padding: '0.3rem 0.7rem',
                                        borderRadius: '8px',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em',
                                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                                        flexShrink: 0,
                                        boxShadow: daysLeft <= 2
                                            ? '0 2px 6px rgba(220, 38, 38, 0.15)'
                                            : '0 2px 6px rgba(37, 99, 235, 0.1)'
                                    }}>
                                        <div style={{
                                            width: '5px', height: '5px', borderRadius: '50%',
                                            background: daysLeft <= 2 ? '#DC2626' : '#2563EB',
                                            animation: daysLeft <= 2 ? 'pulseGlow 2s infinite' : 'none'
                                        }} />
                                        {daysLeft} {daysLeft === 1 ? 'día' : 'días'}
                                    </div>
                                ) : (
                                    <div style={{
                                        background: 'linear-gradient(135deg, #FEE2E2, #FECACA)',
                                        color: '#DC2626',
                                        padding: '0.3rem 0.7rem',
                                        borderRadius: '8px',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em',
                                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                                        flexShrink: 0,
                                        boxShadow: '0 2px 6px rgba(220, 38, 38, 0.15)'
                                    }}>
                                        <AlertCircle size={12} />
                                        Expirada
                                    </div>
                                )}
                            </div>

                            {/* Custom Dropdown Menu */}
                            <AnimatePresence>
                                {showDespensaDropdown && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -4, scale: 0.95 }}
                                        transition={{ type: 'spring', stiffness: 450, damping: 30, mass: 0.8 }}
                                        style={{
                                            position: 'absolute', top: 'calc(100% + 8px)', left: '-4px', right: '-4px',
                                            zIndex: 9999,
                                            background: 'rgba(255, 255, 255, 0.95)',
                                            backdropFilter: 'blur(16px)',
                                            borderRadius: '12px',
                                            border: '1.5px solid #CBD5E1',
                                            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5) inset',
                                            overflow: 'hidden',
                                            padding: '4px'
                                        }}
                                    >
                                        {[
                                            { value: 'weekly', label: '7\u00A0\u00A0Días', sub: 'Semanal' },
                                            { value: 'biweekly', label: '15\u00A0\u00A0Días', sub: 'Quincenal' },
                                            { value: 'monthly', label: '1\u00A0\u00A0Mes', sub: 'Mensual' }
                                        ].map((opt) => (
                                            <div
                                                key={opt.value}
                                                onClick={() => {
                                                    updateData('groceryDuration', opt.value);
                                                    if (userProfile && typeof updateUserProfile === 'function') {
                                                        updateUserProfile({
                                                            health_profile: {
                                                                ...formData,
                                                                groceryDuration: opt.value
                                                            }
                                                        });
                                                    }
                                                    setShowDespensaDropdown(false);
                                                    
                                                    // Trigger recalculation on duration change as well to ensure UI sync
                                                    if (userProfile?.id && planData) {
                                                        setIsRecalculating(true);
                                                        setRecalcLock(true); // 🔒 Bloquear restoreSessionData
                                                        const recalcToast = toast.loading('Calculando lista...', { position: 'top-center' });
                                                        supabase.auth.getSession().then(({ data: { session } }) => {
                                                            if (!session) { toast.error("Sesión expirada"); setIsRecalculating(false); return; }
                                                            fetch(`${API_BASE}/api/recalculate-shopping-list`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                                                                body: JSON.stringify({
                                                                    user_id: userProfile.id,
                                                                    householdSize: formData?.householdSize || 1,
                                                                    groceryDuration: opt.value
                                                                })
                                                            }).then(res => res.json()).then(result => {
                                                                if (result.success && result.plan_data) {
                                                                    // Limpiar is_restocked porque las cantidades cambiaron
                                                                    delete result.plan_data.is_restocked;
                                                                    localStorage.setItem('mealfit_plan', JSON.stringify(result.plan_data));
                                                                    setPlanData(result.plan_data);
                                                                    resetRestockState();
                                                                    toast.success('Lista actualizada', { id: recalcToast });
                                                                } else {
                                                                    toast.dismiss(recalcToast);
                                                                }
                                                                setIsRecalculating(false);
                                                                setRecalcLock(false); // 🔓 Desbloquear
                                                            }).catch(() => {
                                                                toast.dismiss(recalcToast);
                                                                setIsRecalculating(false);
                                                                setRecalcLock(false); // 🔓 Desbloquear en error
                                                            });
                                                        });
                                                    }
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '0.5rem 0.6rem',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    background: groceryDuration === opt.value
                                                        ? 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)'
                                                        : 'transparent',
                                                    border: groceryDuration === opt.value ? '1px solid #BBF7D0' : '1px solid transparent',
                                                    boxShadow: groceryDuration === opt.value ? '0 2px 8px rgba(16, 185, 129, 0.15)' : 'none',
                                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                                }}
                                                onMouseEnter={e => {
                                                    if (groceryDuration !== opt.value) {
                                                        e.currentTarget.style.background = '#F8FAFC';
                                                        e.currentTarget.style.transform = 'translateX(4px)';
                                                    }
                                                }}
                                                onMouseLeave={e => {
                                                    if (groceryDuration !== opt.value) {
                                                        e.currentTarget.style.background = 'transparent';
                                                        e.currentTarget.style.transform = 'translateX(0)';
                                                    }
                                                }}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                                                    <span style={{
                                                        fontSize: '0.78rem', fontWeight: 800,
                                                        color: groceryDuration === opt.value ? '#059669' : '#334155',
                                                        letterSpacing: '-0.01em'
                                                    }}>
                                                        {opt.label}
                                                    </span>
                                                    <span style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 500 }}>
                                                        {opt.sub}
                                                    </span>
                                                </div>
                                                {groceryDuration === opt.value && (
                                                    <motion.div
                                                        initial={{ scale: 0, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                                                    >
                                                        <CheckCircle size={14} color="#059669" strokeWidth={2.5} />
                                                    </motion.div>
                                                )}
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* SELECTOR DE PERSONAS */}
                        <div ref={householdDropdownRef} style={{ position: 'relative', width: '100%' }}>
                            <div
                                onClick={() => setShowHouseholdDropdown(!showHouseholdDropdown)}
                                onMouseEnter={(e) => {
                                    if (!showHouseholdDropdown) {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!showHouseholdDropdown) {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)';
                                    }
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    gap: '0.75rem',
                                    background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                                    padding: '0.5rem 0.75rem 0.5rem 1rem',
                                    borderRadius: '12px',
                                    border: `1.5px solid ${showHouseholdDropdown ? '#8B5CF6' : '#CBD5E1'}`,
                                    boxShadow: showHouseholdDropdown
                                        ? '0 0 0 3px rgba(139, 92, 246, 0.1), 0 2px 4px rgba(0,0,0,0.05)'
                                        : '0 2px 5px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
                                    minHeight: '42px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    userSelect: 'none'
                                }}
                            >
                                {/* Accent line */}
                                <div style={{
                                    position: 'absolute', left: 0, top: '20%', bottom: '20%', width: '3px',
                                    borderRadius: '0 3px 3px 0',
                                    background: 'linear-gradient(180deg, #8B5CF6, #7C3AED)'
                                }} />

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '8px',
                                        background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        <Users size={14} color="#7C3AED" strokeWidth={2.5} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', lineHeight: '1' }}>
                                        <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 500 }}>
                                            Personas
                                        </span>
                                        <span style={{ fontSize: '0.82rem', color: '#0F172A', fontWeight: 700 }}>
                                            {formData?.householdSize || 1}
                                        </span>
                                    </div>
                                    <motion.div
                                        animate={{ rotate: showHouseholdDropdown ? 180 : 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <ChevronDown size={14} color="#94A3B8" strokeWidth={2.5} />
                                    </motion.div>
                                </div>

                                {(formData?.householdSize || 1) > 1 && (
                                    <div style={{
                                        background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)',
                                        color: '#7C3AED',
                                        padding: '0.3rem 0.7rem',
                                        borderRadius: '8px',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em',
                                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                                        flexShrink: 0,
                                        boxShadow: '0 2px 6px rgba(139, 92, 246, 0.1)',
                                        border: '1px solid #DDD6FE'
                                    }}>
                                        ×{formData?.householdSize || 1}
                                    </div>
                                )}
                            </div>

                            {/* Household Dropdown Menu */}
                            <AnimatePresence>
                                {showHouseholdDropdown && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -4, scale: 0.95 }}
                                        transition={{ type: 'spring', stiffness: 450, damping: 30, mass: 0.8 }}
                                        style={{
                                            position: 'absolute', top: 'calc(100% + 8px)', left: '-4px', right: '-4px',
                                            zIndex: 9999,
                                            background: 'rgba(255, 255, 255, 0.95)',
                                            backdropFilter: 'blur(16px)',
                                            borderRadius: '12px',
                                            border: '1.5px solid #CBD5E1',
                                            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5) inset',
                                            overflow: 'hidden',
                                            padding: '4px'
                                        }}
                                    >
                                        <div style={{ padding: '6px 10px 4px', marginBottom: '2px' }}>
                                            <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                ¿Cuántas personas comen?
                                            </span>
                                        </div>
                                        {[1, 2, 3, 4, 5, 6].map((num) => (
                                            <div
                                                key={num}
                                                onClick={async () => {
                                                    updateData('householdSize', num);
                                                    if (userProfile && typeof updateUserProfile === 'function') {
                                                        updateUserProfile({
                                                            health_profile: {
                                                                ...formData,
                                                                householdSize: num
                                                            }
                                                        });
                                                    }
                                                    setShowHouseholdDropdown(false);
                                                    
                                                    // Recalcular lista de compras en tiempo real
                                                    if (userProfile?.id && planData) {
                                                        setIsRecalculating(true);
                                                        setRecalcLock(true); // 🔒 Bloquear restoreSessionData
                                                        const recalcToast = toast.loading('Recalculando lista de compras...', { position: 'top-center' });
                                                        try {
                                                            const sessionObj = await supabase.auth.getSession();
                                                            const token = sessionObj.data.session?.access_token;
                                                            if (!token) {
                                                                toast.error("Sesión expirada");
                                                                setIsRecalculating(false);
                                                                return;
                                                            }
                                                            const response = await fetch(`${API_BASE}/api/recalculate-shopping-list`, {
                                                                method: 'POST',
                                                                headers: {
                                                                    'Content-Type': 'application/json',
                                                                    'Authorization': `Bearer ${token}`
                                                                },
                                                                body: JSON.stringify({
                                                                    user_id: userProfile.id,
                                                                    householdSize: num,
                                                                    groceryDuration: formData?.groceryDuration || 'weekly'
                                                                })
                                                            });
                                                            const result = await response.json();
                                                            console.log('🔍 [RECALC RESULT]', { success: result.success, has_plan_data: !!result.plan_data, message: result.message });
                                                            if (result.plan_data?._debug_recalc) {
                                                                console.log('🔍 [FINGERPRINT]', result.plan_data._debug_recalc);
                                                            }
                                                            if (result.success && result.plan_data) {
                                                                // DEBUG: Compare key items between old and new plan_data
                                                                const oldList = planData?.aggregated_shopping_list_weekly || [];
                                                                const newList = result.plan_data?.aggregated_shopping_list_weekly || [];
                                                                console.log('🔍 [RECALC] OLD weekly list length:', oldList.length);
                                                                console.log('🔍 [RECALC] NEW weekly list length:', newList.length);
                                                                const kws = ['pechuga', 'yogurt', 'aguacate'];
                                                                oldList.forEach(it => { if (kws.some(k => (it.name||'').toLowerCase().includes(k))) console.log('  OLD:', it.name, it.display_qty); });
                                                                newList.forEach(it => { if (kws.some(k => (it.name||'').toLowerCase().includes(k))) console.log('  NEW:', it.name, it.display_qty); });
                                                                
                                                                // Aplicar directamente los datos recalculados
                                                                // Limpiar is_restocked porque las cantidades cambiaron
                                                                delete result.plan_data.is_restocked;
                                                                localStorage.setItem('mealfit_plan', JSON.stringify(result.plan_data));
                                                                setPlanData(result.plan_data);
                                                                resetRestockState();
                                                                toast.success(`Lista actualizada para ${num} ${num === 1 ? 'persona' : 'personas'}`, { id: recalcToast, icon: '👥' });
                                                            } else if (result.success) {
                                                                console.warn('⚠️ [RECALC] success=true but NO plan_data! Result:', result);
                                                                await restoreSessionData(userProfile.id);
                                                                toast.success(`Lista actualizada para ${num} ${num === 1 ? 'persona' : 'personas'}`, { id: recalcToast, icon: '👥' });
                                                            } else {
                                                                console.error('❌ [RECALC] Failed:', result);
                                                                toast.dismiss(recalcToast);
                                                            }
                                                            setIsRecalculating(false);
                                                            setRecalcLock(false); // 🔓 Desbloquear
                                                        } catch (e) {
                                                            console.error('Error recalculando:', e);
                                                            toast.dismiss(recalcToast);
                                                            setIsRecalculating(false);
                                                            setRecalcLock(false); // 🔓 Desbloquear en error
                                                        }
                                                    }
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '0.5rem 0.6rem',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    background: (formData?.householdSize || 1) === num
                                                        ? 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)'
                                                        : 'transparent',
                                                    border: (formData?.householdSize || 1) === num ? '1px solid #DDD6FE' : '1px solid transparent',
                                                    boxShadow: (formData?.householdSize || 1) === num ? '0 2px 8px rgba(139, 92, 246, 0.15)' : 'none',
                                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                                }}
                                                onMouseEnter={e => {
                                                    if ((formData?.householdSize || 1) !== num) {
                                                        e.currentTarget.style.background = '#F8FAFC';
                                                        e.currentTarget.style.transform = 'translateX(4px)';
                                                    }
                                                }}
                                                onMouseLeave={e => {
                                                    if ((formData?.householdSize || 1) !== num) {
                                                        e.currentTarget.style.background = 'transparent';
                                                        e.currentTarget.style.transform = 'translateX(0)';
                                                    }
                                                }}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                                                    <span style={{
                                                        fontSize: '0.78rem', fontWeight: 800,
                                                        color: (formData?.householdSize || 1) === num ? '#7C3AED' : '#334155',
                                                        letterSpacing: '-0.01em'
                                                    }}>
                                                        {num} {num === 1 ? 'Persona' : 'Personas'}
                                                    </span>
                                                    <span style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 500 }}>
                                                        {num === 1 ? 'Individual' : `Cantidades ×${num}`}
                                                    </span>
                                                </div>
                                                {(formData?.householdSize || 1) === num && (
                                                    <motion.div
                                                        initial={{ scale: 0, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                                                    >
                                                        <CheckCircle size={14} color="#7C3AED" strokeWidth={2.5} />
                                                    </motion.div>
                                                )}
                                            </div>
                                        ))}
                                        <div style={{ padding: '4px 10px 6px', marginTop: '2px', borderTop: '1px solid #F1F5F9' }}>
                                            <span style={{ fontSize: '0.6rem', color: '#94A3B8', lineHeight: 1.3 }}>
                                                💡 Al generar un nuevo plan, las cantidades se multiplicarán automáticamente.
                                            </span>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* BOTONES LADO A LADO */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', width: '100%' }}>
                            {(() => {
                                const isPremiumForRotation = ['plus', 'ultra', 'admin'].includes((userProfile?.plan_tier || '').toLowerCase());
                                const isAutoRotationActiveHeader = isPremiumForRotation && localStorage.getItem('mealfit_auto_rotate') === 'true';

                                if (isAutoRotationActiveHeader) {
                                    return (
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                toast('Rotación Autónoma', {
                                                    description: 'Tus platos se actualizan automáticamente todos los días.',
                                                    icon: '🤖'
                                                });
                                            }}
                                            className="new-plan-btn"
                                            style={{
                                                background: '#F8FAFC',
                                                color: '#64748B', 
                                                cursor: 'not-allowed',
                                                boxShadow: 'none',
                                                flex: '1 1 auto',
                                                width: 'auto',
                                                justifyContent: 'center',
                                                padding: '0.75rem 0.75rem',
                                                border: '1.5px dashed #CBD5E1',
                                                borderRadius: '1rem',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                                whiteSpace: 'nowrap',
                                                opacity: 0.9
                                            }}
                                        >
                                            <Lock size={16} color="#94A3B8" />
                                            <span style={{ fontSize: '0.85rem' }}>Rotación Autónoma</span>
                                        </button>
                                    );
                                }

                                return (
                                    <button
                                        onClick={handleNewPlan}
                                        disabled={isLimitReached}
                                        className="new-plan-btn"
                                        style={{
                                            background: isLimitReached
                                                ? '#E2E8F0'
                                                : 'linear-gradient(135deg, #0F172A 0%, #334155 100%)',
                                            color: isLimitReached ? '#94A3B8' : 'white',
                                            cursor: isLimitReached ? 'not-allowed' : 'pointer',
                                            '--hover-shadow': '0 20px 40px -5px rgba(15, 23, 42, 0.45), inset 0 0 0 1px rgba(255,255,255,0.1)',
                                            '--active-shadow': '0 5px 15px -5px rgba(15, 23, 42, 0.2)',
                                            boxShadow: isLimitReached ? 'none' : '0 10px 20px -5px rgba(15, 23, 42, 0.35)',
                                            flex: '1 1 auto',
                                            width: 'auto',
                                            justifyContent: 'center',
                                            padding: '0.75rem 0.75rem',
                                            border: 'none',
                                            borderRadius: '1rem',
                                            fontWeight: '700',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        {isLimitReached ? <AlertCircle size={18} /> : <Wand2 size={18} />}
                                        <span style={{ fontSize: '0.85rem' }}>{isLimitReached ? 'Límite' : (isPlanExpired ? 'Nuevo Plan' : 'Actualizar Platos')}</span>
                                    </button>
                                );
                            })()}

                            {(!sessionRestocked && !planData?.is_restocked && !(planData && localStorage.getItem(`mealfit_restock_cache_${userProfile?.id}_${planData.grocery_start_date || 'latest'}`))) && (
                                <button
                                    onClick={() => setShowRestockModal(true)}
                                    className="new-plan-btn"
                                    style={{
                                        background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                        color: 'white',
                                        cursor: 'pointer',
                                        '--hover-shadow': '0 20px 40px -5px rgba(16, 185, 129, 0.5), inset 0 0 0 1px rgba(255,255,255,0.2)',
                                        '--active-shadow': '0 5px 15px -5px rgba(16, 185, 129, 0.2)',
                                        boxShadow: '0 10px 20px -5px rgba(16, 185, 129, 0.4)',
                                        flex: '1 1 auto',
                                        width: 'auto',
                                        justifyContent: 'center',
                                        padding: '0.75rem 0.75rem',
                                        border: 'none',
                                        borderRadius: '1rem',
                                        fontWeight: '700',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <CheckCircle size={18} />
                                    <span style={{ fontSize: '0.85rem' }}>Registrar Compras</span>
                                </button>
                            )}

                            <button
                                onClick={handleDownloadShoppingList}
                                disabled={isRecalculating}
                                className="new-plan-btn"
                                style={{
                                    background: isRecalculating ? '#E2E8F0' : 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                                    color: isRecalculating ? '#94A3B8' : '#334155',
                                    border: isRecalculating ? '1.5px solid #CBD5E1' : '1.5px solid #CBD5E1',
                                    '--hover-shadow': isRecalculating ? 'none' : '0 15px 30px -5px rgba(0, 0, 0, 0.1), inset 0 0 0 1.5px #CBD5E1',
                                    '--active-shadow': isRecalculating ? 'none' : '0 5px 15px -5px rgba(0, 0, 0, 0.05), inset 0 0 0 1.5px #CBD5E1',
                                    boxShadow: isRecalculating ? 'none' : '0 2px 4px rgba(0,0,0,0.04)',
                                    cursor: isRecalculating ? 'wait' : 'pointer',
                                    flex: '1 1 auto',
                                    width: 'auto',
                                    justifyContent: 'center',
                                    padding: '0.75rem 0.75rem',
                                    borderRadius: '1rem',
                                    fontWeight: '700',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                <ShoppingCart size={18} />
                                <span style={{ fontSize: '0.85rem' }}>PDF</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* --- MACROS & CALORIES SUMMARY ROW --- */}
            <div className="macros-card">
                <h2 className="macros-card-header" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                    <div style={{ background: '#EFF6FF', color: '#3B82F6', padding: '0.4rem', borderRadius: '0.5rem', display: 'flex' }}>
                        <Target size={20} strokeWidth={2.5} />
                    </div>
                    Objetivo del Día
                </h2>

                <div className="macros-grid">
                    <StatItem label="Calorías Totales" value={planData.calories} unit="kcal" icon={Flame} color="#F59E0B" bgColor="#FFFBEB" isFirst={true} />
                    <StatItem label="Proteína" value={planData.macros?.protein || "0g"} unit="" icon={Dumbbell} color="#3B82F6" bgColor="#EFF6FF" />
                    <StatItem label="Carbohidratos" value={planData.macros?.carbs || "0g"} unit="" icon={Wheat} color="#10B981" bgColor="#ECFDF5" />
                    <StatItem label="Grasas" value={planData.macros?.fats || "0g"} unit="" icon={Droplet} color="#EC4899" bgColor="#FDF2F8" />
                </div>
            </div>

            {/* --- DAILY TRACKER UI --- */}
            <TrackingProgress
                planData={planData}
                userId={userProfile?.id || formData?.session_id || 'guest'}
            />

            {/* --- MAIN CONTENT COLUMNS --- */}
            <div className="main-grid">

                {/* Left Column: MEALS TIMELINE */}
                <div className="meals-container" style={{ flex: 2, alignSelf: 'start' }}>
                    <div className="menu-section-header">
                        <h2 className="menu-section-title">
                            Platos de Hoy
                        </h2>
                        <span className="menu-section-count">
                            {/* Número de comidas oculto según petición */}
                        </span>
                    </div>

                    {/* BOTONES NAVEGACIÓN DÍAS (OPCIONES) */}
                    {planDays.length > 1 && (
                        <div className="option-buttons">
                            {planDays.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setActiveDayIndex(idx)}
                                    className="option-btn"
                                    style={{
                                        border: activeDayIndex === idx ? 'none' : '1px solid #CBD5E1',
                                        background: activeDayIndex === idx ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' : 'white',
                                        color: activeDayIndex === idx ? 'white' : '#475569',
                                        boxShadow: activeDayIndex === idx ? '0 10px 15px -3px rgba(59, 130, 246, 0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
                                        transform: activeDayIndex === idx ? 'translateY(-2px)' : 'translateY(0)'
                                    }}
                                >
                                    Opción {String.fromCharCode(65 + idx)}
                                </button>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {(() => {
                            // Copia segura de platos usando el día activo (filtrar suplementos que tienen su propia sección)
                            let displayMeals = [...currentDayMeals].filter(m => !m.meal?.toLowerCase().includes('suplemento'));

                            // Inyectar almuerzo familiar visual si aplica
                            if (formData?.skipLunch) {
                                const hasLunch = displayMeals.some(m => m.meal.toLowerCase().includes('almuerzo'));
                                if (!hasLunch) {
                                    displayMeals.splice(1, 0, {
                                        meal: 'Almuerzo',
                                        name: 'Almuerzo Familiar',
                                        isSkipped: true
                                    });
                                }
                            }

                            const hasPremiumForRotation = ['plus', 'ultra', 'admin'].includes((userProfile?.plan_tier || '').toLowerCase());
                            const isAutoRotationActive = hasPremiumForRotation && localStorage.getItem('mealfit_auto_rotate') === 'true';

                            return displayMeals.map((meal, index) => {
                                const isSkippedLunch = meal.isSkipped;
                                const isLiked = meal.name ? !!likedMeals[meal.name] : false;

                                if (isSkippedLunch) {
                                    if (isPremium) {
                                        return (
                                            <div key={index} className="skipped-lunch" style={{
                                                background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.8), rgba(219, 234, 254, 0.5))',
                                                borderTop: index > 0 ? '1px dashed #93C5FD' : 'none',
                                                borderBottom: index < displayMeals.length - 1 ? '1px dashed #93C5FD' : 'none',
                                                color: '#1E40AF'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <div style={{
                                                        background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                                                        color: 'white',
                                                        borderRadius: '12px', width: 48, height: 48,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)'
                                                    }}>
                                                        <ChefHat size={24} />
                                                    </div>
                                                    <div>
                                                        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.25rem', color: '#1E3A8A' }}>
                                                            Cupo Vacío para Almuerzo
                                                        </h3>
                                                        <p style={{ fontSize: '0.9rem', margin: 0, color: '#3B82F6', fontWeight: 500 }}>
                                                            Dile a tu Agente IA qué vas a almorzar hoy.
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        window.scrollTo(0, 0);
                                                        navigate('/dashboard/agent');
                                                    }}
                                                    style={{
                                                        background: 'white',
                                                        color: '#2563EB',
                                                        border: '2px solid #BFDBFE',
                                                        borderRadius: '1rem',
                                                        padding: '0.75rem 1.25rem',
                                                        fontWeight: 700,
                                                        fontSize: '0.9rem',
                                                        cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                        transition: 'all 0.2s',
                                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                                        e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(59, 130, 246, 0.15)';
                                                        e.currentTarget.style.borderColor = '#93C5FD';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)';
                                                        e.currentTarget.style.borderColor = '#BFDBFE';
                                                    }}
                                                >
                                                    <Wand2 size={18} /> Registrar con IA
                                                </button>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={index} className="skipped-lunch" style={{
                                            background: 'rgba(239, 246, 255, 0.6)',
                                            borderTop: index > 0 ? '1px dashed #3B82F6' : 'none',
                                            borderBottom: index < displayMeals.length - 1 ? '1px dashed #3B82F6' : 'none',
                                            color: '#1E40AF'
                                        }}>
                                            <div style={{
                                                background: '#3B82F6', color: 'white',
                                                borderRadius: '50%', width: 40, height: 40,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <ChefHat size={20} />
                                            </div>
                                            <div>
                                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                                                    Almuerzo Familiar / Libre
                                                </h3>
                                                <p style={{ fontSize: '0.85rem', margin: 0, opacity: 0.8 }}>
                                                    Reserva calórica aplicada. Come con moderación lo que haya en casa.
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={index} className="meal-card">

                                        {/* Meal Info */}
                                        <div>
                                            <div style={{
                                                textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 800,
                                                color: 'var(--primary)', letterSpacing: '0.05em', marginBottom: '0.25rem'
                                            }}>
                                                {meal.meal}
                                            </div>

                                            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                                                {meal.name}
                                            </h3>

                                            {/* TIEMPO DE PREPARACIÓN */}
                                            {meal.prep_time && (
                                                <div style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                    fontSize: '0.75rem', color: '#2563EB', background: '#EFF6FF',
                                                    padding: '4px 10px', borderRadius: '6px', marginBottom: '0.75rem', fontWeight: 700,
                                                    border: '1px solid #BFDBFE', boxShadow: '0 1px 2px rgba(37,99,235,0.05)'
                                                }}>
                                                    <Clock size={13} strokeWidth={2.5} /> {meal.prep_time}
                                                </div>
                                            )}

                                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                                                {meal.desc}
                                            </p>
                                        </div>

                                        {/* Right Side: Calories + Buttons */}
                                        <div className="meal-right-side" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1rem' }}>

                                            {/* Calories Badge */}
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                    {meal.cals}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '4px' }}>kcal</div>
                                            </div>

                                            {/* BUTTONS GROUP */}
                                            <div style={{ display: 'flex', gap: '0.75rem' }}>

                                                {/* VER RECETA */}
                                                <button
                                                    onClick={() => navigate('/dashboard/recipes')}
                                                    style={{
                                                        background: '#EFF6FF',
                                                        border: '1.5px solid #BFDBFE',
                                                        borderRadius: '50%',
                                                        width: 44, height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    title="Ver paso a paso"
                                                >
                                                    <BookOpen size={20} color="#3B82F6" />
                                                </button>

                                                {/* REGENERATE BUTTON (AI SWAP) */}
                                                <button
                                                    onClick={async () => {
                                                        if (isAutoRotationActive) {
                                                            toast('Rotación Autónoma Activa', {
                                                                description: 'Tus platos se actualizan automáticamente todos los días.',
                                                                icon: '🔄'
                                                            });
                                                            return;
                                                        }

                                                        // 1. Evitar doble clic
                                                        if (regeneratingId === index) return;

                                                        // 2. Estado Visual de Carga
                                                        setRegeneratingId(index);

                                                        // 3. Notificación Inicial (Toast de Carga)
                                                        const toastId = toast.loading('Consultando al Chef IA...', {
                                                            description: 'Buscando una alternativa deliciosa...',
                                                        });

                                                        try {
                                                            // 4. Llamada ASYNC al modelo local
                                                            const newName = await regenerateSingleMeal(activeDayIndex, index, meal.meal, meal.name);

                                                            // 5. Éxito
                                                            toast.dismiss(toastId);
                                                            toast.success('¡Menú Actualizado!', {
                                                                description: `Cambiado por: ${newName}`,
                                                                icon: '👨‍🍳'
                                                            });
                                                        } catch (error) {
                                                            console.error("Error al regenerar:", error);
                                                            // 6. Error (probablemente usa el fallback)
                                                            toast.dismiss(toastId);
                                                            toast.error('No se pudo conectar con la IA', {
                                                                description: 'Se usó una receta alternativa local.'
                                                            });
                                                        } finally {
                                                            // 7. Liberar botón
                                                            setRegeneratingId(null);
                                                        }
                                                    }}
                                                    disabled={regeneratingId === index || isAutoRotationActive}
                                                    style={{
                                                        background: isAutoRotationActive ? '#F8FAFC' : '#FFF7ED',
                                                        border: isAutoRotationActive ? '1.5px solid #E2E8F0' : '1.5px solid #FED7AA',
                                                        borderRadius: '50%',
                                                        width: 44, height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: isAutoRotationActive ? 'not-allowed' : (regeneratingId === index ? 'wait' : 'pointer'),
                                                        transition: 'all 0.2s',
                                                        opacity: isAutoRotationActive ? 0.6 : 1
                                                    }}
                                                    title={isAutoRotationActive ? "Rotación Autónoma Activa" : "No me gusta (Cambiar con IA)"}
                                                >
                                                    <RefreshCw
                                                        size={20}
                                                        color={isAutoRotationActive ? "#94A3B8" : "#EA580C"}
                                                        className={regeneratingId === index && !isAutoRotationActive ? "spin-fast" : ""}
                                                    />
                                                </button>

                                                {/* LIKE BUTTON */}
                                                <button
                                                    onClick={() => {
                                                        const currentlyLiked = !!likedMeals[meal.name];
                                                        toggleMealLike(meal.name, meal.meal);
                                                        if (!currentlyLiked) {
                                                            toast.success('¡Anotado!', { description: `Aprenderemos que te gusta: ${meal.name}`, icon: '❤️' });
                                                        } else {
                                                            toast('Like removido');
                                                        }
                                                    }}
                                                    style={{
                                                        background: isLiked ? '#FEE2E2' : '#FDF2F8',
                                                        border: isLiked ? '1.5px solid #FECACA' : '1.5px solid #FBCFE8',
                                                        borderRadius: '50%',
                                                        width: 44, height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        boxShadow: isLiked ? '0 2px 5px rgba(239, 68, 68, 0.2)' : 'none'
                                                    }}
                                                    title="Me gusta"
                                                >
                                                    <Heart size={20} color={isLiked ? '#EF4444' : '#EC4899'} fill={isLiked ? '#EF4444' : 'none'} />
                                                </button>
                                            </div>
                                        </div>

                                        <style>{`
                                            .spin-fast { animation: spin 1s linear infinite; }
                                            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                                        `}</style>
                                    </div>
                                );
                            })
                        })()}
                    </div>

                    {/* SUPPLEMENTS SECTION */}
                    {currentDaySupplements.length > 0 && (
                        <div style={{
                            marginTop: '1.5rem',
                            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(168, 85, 247, 0.08) 100%)',
                            borderRadius: '1.5rem',
                            border: '1px solid rgba(139, 92, 246, 0.15)',
                            padding: '1.5rem',
                            boxShadow: '0 4px 15px -5px rgba(139, 92, 246, 0.1)'
                        }}>
                            <h3 style={{
                                fontSize: '1rem', fontWeight: 800, color: '#6D28D9',
                                marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}>
                                <div style={{
                                    background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
                                    color: 'white', borderRadius: '10px',
                                    width: 32, height: 32,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Pill size={16} />
                                </div>
                                Suplementos del Día
                                <span style={{
                                    marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600,
                                    background: '#EDE9FE', color: '#7C3AED',
                                    padding: '0.2rem 0.6rem', borderRadius: '9999px'
                                }}>
                                    {currentDaySupplements.length}
                                </span>
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {currentDaySupplements.map((supp, i) => (
                                    <div key={i} style={{
                                        background: 'white',
                                        borderRadius: '1rem',
                                        padding: '1rem 1.25rem',
                                        border: '1px solid rgba(139, 92, 246, 0.1)',
                                        display: 'flex', flexDirection: 'column', gap: '0.35rem'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.95rem' }}>
                                                💊 {supp.name}
                                            </span>
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 700,
                                                background: '#F5F3FF', color: '#7C3AED',
                                                padding: '0.15rem 0.5rem', borderRadius: '6px'
                                            }}>
                                                {supp.timing}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                            Dosis: {supp.dose}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748B', lineHeight: 1.4 }}>
                                            {supp.reason}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: INSIGHTS & INGREDIENTS */}
                <div style={{ flex: 1, minWidth: 0, width: '100%' }}>

                    {/* Despensa (Virtual Fridge) */}
                    {!isPlanExpired && (
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.5) 100%)',
                            backdropFilter: 'blur(12px)',
                            padding: '1.75rem',
                            borderRadius: '2rem',
                            border: '1.5px solid rgba(203, 213, 225, 0.8)',
                            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08), 0 0 0 1px rgba(148, 163, 184, 0.05)',
                            marginBottom: '2rem',
                            width: '100%',
                            boxSizing: 'border-box'
                        }}>
                            <h3 style={{
                                fontSize: '1.2rem', fontWeight: 800, color: '#0F172A',
                                marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem'
                            }}>
                                <div style={{ background: '#ECFDF5', padding: '0.4rem', borderRadius: '0.75rem', color: '#10B981' }}>
                                    <ShoppingCart size={22} strokeWidth={2.5} />
                                </div>
                                Despensa
                            </h3>
                            <p style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.4, textAlign: 'center' }}>
                                Toca lo que se agotó. La IA lo excluirá de tu próximo menú.
                            </p>

                            {physicalPantryIngredients.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '1rem', color: '#64748B', fontSize: '0.95rem' }}>
                                    Tu despensa está vacía. Registra las compras de tu plan para llenarla.
                                </div>
                            ) : (
                                <div className="soft-scrollbar" style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '350px', overflowY: 'auto', padding: '0.25rem', paddingRight: '0.5rem', width: '100%', boxSizing: 'border-box' }}>
                                    {[...physicalPantryIngredients]
                                        .sort((a, b) => {
                                            const aDisabled = disabledIngredients.includes(a.name.toLowerCase().trim());
                                            const bDisabled = disabledIngredients.includes(b.name.toLowerCase().trim());
                                            if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;
                                            return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
                                        })
                                        .map((ingObj, idx) => {
                                            const normalizedName = ingObj.name.toLowerCase().trim();
                                            const isDisabled = disabledIngredients.includes(normalizedName);
                                            const quantity = ingObj.quantity;
                                            const name = ingObj.name;

                                            return (
                                                <motion.button
                                                    key={normalizedName}
                                                    whileHover={{ scale: isDisabled ? 1.0 : 1.03, opacity: 0.9 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    layout
                                                    onClick={() => {
                                                        if (isDisabled) {
                                                            setDisabledIngredients(prev => prev.filter(i => i !== normalizedName));
                                                        } else {
                                                            setDisabledIngredients(prev => [...prev, normalizedName]);
                                                        }
                                                    }}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.4rem',
                                                        background: isDisabled ? '#F8FAFC' : '#FFFFFF',
                                                        color: isDisabled ? '#94A3B8' : '#0F172A',
                                                        border: `1px solid ${isDisabled ? '#E2E8F0' : '#CBD5E1'}`,
                                                        boxShadow: isDisabled ? 'inset 0 2px 4px rgba(0,0,0,0.02)' : '0 2px 5px rgba(0,0,0,0.06)',
                                                        borderRadius: '9999px',
                                                        padding: quantity ? '0.25rem 0.75rem 0.25rem 0.25rem' : '0.4rem 0.8rem',
                                                        fontSize: '0.85rem',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.2s, color 0.2s, border 0.2s, box-shadow 0.2s'
                                                    }}
                                                    title={isDisabled ? "Agotado. Toca para restaurar." : "Disponible. Toca para reportar como agotado."}
                                                >
                                                    {quantity && (
                                                        <div style={{
                                                            background: isDisabled ? '#E2E8F0' : '#F1F5F9',
                                                            color: isDisabled ? '#94A3B8' : '#64748B',
                                                            padding: '0.2rem 0.5rem',
                                                            borderRadius: '9999px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 700,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            textDecoration: isDisabled ? 'line-through' : 'none'
                                                        }}>
                                                            {quantity}
                                                        </div>
                                                    )}

                                                    <span style={{
                                                        fontWeight: 600,
                                                        textDecoration: isDisabled ? 'line-through' : 'none',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem'
                                                    }}>
                                                        {name}
                                                        <AnimatePresence>
                                                            {isDisabled && (
                                                                <motion.div
                                                                    initial={{ scale: 0, opacity: 0 }}
                                                                    animate={{ scale: 1, opacity: 1 }}
                                                                    exit={{ scale: 0, opacity: 0 }}
                                                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                                                >
                                                                    <Trash2 size={13} color="#EF4444" style={{ marginLeft: '2px', opacity: 0.9 }} />
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </span>
                                                </motion.button>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Insights Card */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.5) 100%)',
                        backdropFilter: 'blur(12px)',
                        padding: '1.75rem',
                        borderRadius: '2rem',
                        border: '1.5px solid rgba(203, 213, 225, 0.8)',
                        marginBottom: '2rem',
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08), 0 0 0 1px rgba(148, 163, 184, 0.05)'
                    }}>
                        <h3 style={{
                            fontSize: '1.2rem', fontWeight: 800, color: '#0F172A',
                            marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem'
                        }}>
                            <div style={{ background: '#F0F9FF', padding: '0.4rem', borderRadius: '0.75rem', color: '#0284C7' }}>
                                <Brain size={22} strokeWidth={2.5} />
                            </div>
                            Razonamiento
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {planData.insights?.map((insight, i) => {
                                let icon = <CheckCircle size={20} />;
                                let title = "Nota:";
                                let color = "#0F172A";
                                let bgColor = "#F1F5F9";

                                if (insight.toLowerCase().includes('diagnóstico') || i === 0) {
                                    icon = <Lightbulb size={20} />;
                                    title = "Diagnóstico";
                                    color = "#7C3AED"; // Violet
                                    bgColor = "#F5F3FF";
                                }
                                if (insight.toLowerCase().includes('estrategia') || i === 1) {
                                    icon = <Wallet size={20} />;
                                    title = "Plan de Acción";
                                    color = "#059669"; // Emerald
                                    bgColor = "#ECFDF5";
                                }
                                if (insight.toLowerCase().includes('chef') || i === 2) {
                                    icon = <Flame size={20} />;
                                    title = "Tip del Chef";
                                    color = "#EA580C"; // Orange
                                    bgColor = "#NFF2F7";
                                }

                                const cleanText = insight.includes(':') ? insight.split(':')[1].trim() : insight;

                                return (
                                    <div key={i} style={{
                                        display: 'flex', gap: '1rem',
                                        paddingBottom: i < planData.insights.length - 1 ? '1.25rem' : '0',
                                        borderBottom: i < planData.insights.length - 1 ? '1px solid #F1F5F9' : 'none'
                                    }}>
                                        <div style={{
                                            color: color, background: bgColor,
                                            minWidth: '42px', height: '42px',
                                            borderRadius: '12px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            {icon}
                                        </div>
                                        <div>
                                            <h4 style={{
                                                margin: '0 0 0.35rem 0',
                                                fontSize: '0.9rem', fontWeight: 700,
                                                color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em'
                                            }}>
                                                {title}
                                            </h4>
                                            <p style={{ margin: 0, fontSize: '0.95rem', color: '#64748B', lineHeight: 1.6 }}>
                                                {cleanText}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Recipe Preview */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.5) 100%)',
                        backdropFilter: 'blur(12px)',
                        padding: '1.75rem',
                        borderRadius: '2rem',
                        border: '1px solid white',
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{
                                fontSize: '1.2rem', fontWeight: 800, color: '#0F172A',
                                display: 'flex', alignItems: 'center', gap: '0.75rem'
                            }}>
                                <div style={{ background: '#FFF7ED', padding: '0.4rem', borderRadius: '0.75rem', color: '#EA580C' }}>
                                    <ChefHat size={22} strokeWidth={2.5} />
                                </div>
                                Recetas
                            </h3>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                            {currentDayMeals.slice(0, 3).map((meal, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                    padding: '0.85rem', borderRadius: '1rem',
                                    background: 'white', border: '1px solid #CBD5E1', /* Slightly darker border */
                                    boxShadow: '0 8px 16px -4px rgba(15, 23, 42, 0.08), 0 4px 8px -2px rgba(15, 23, 42, 0.04)', /* Deeper, more noticeable shadow */
                                    transition: 'all 0.2s ease', cursor: 'pointer'
                                }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px -4px rgba(15, 23, 42, 0.12)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 16px -4px rgba(15, 23, 42, 0.08), 0 4px 8px -2px rgba(15, 23, 42, 0.04)'; }}
                                >
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '0.75rem',
                                        background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#64748B', flexShrink: 0
                                    }}>
                                        <ChefHat size={20} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {meal.name}
                                        </h4>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem' }}>
                                            <Flame size={14} /> {meal.cals} kcal
                                        </div>
                                    </div>
                                    <div style={{ color: '#CBD5E1' }}>
                                        <ArrowRight size={18} />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Link to="/dashboard/recipes"
                            onClick={() => window.scrollTo(0, 0)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                textDecoration: 'none', color: 'white',
                                background: 'var(--text-main)',
                                fontWeight: 600, padding: '1rem', borderRadius: '1rem',
                                fontSize: '0.95rem', transition: 'all 0.2s',
                                boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.1)'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(15, 23, 42, 0.15)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(15, 23, 42, 0.1)'; }}
                        >
                            Ver Todo <ArrowRight size={18} />
                        </Link>
                    </div>

                </div>
            </div>

            {/* MODAL DE ONBOARDING WEB PUSH (Alertas Inteligentes) */}
            <AnimatePresence>
                {showPushOnboarding && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.7)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 99999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '1rem'
                    }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                background: '#FFFFFF',
                                borderRadius: '24px',
                                padding: '2.5rem 2rem',
                                width: '100%', maxWidth: '420px',
                                position: 'relative',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                textAlign: 'center',
                                overflow: 'hidden'
                            }}
                        >
                            {/* Decorative background circle */}
                            <div style={{
                                position: 'absolute', top: '-50px', left: '50%', transform: 'translateX(-50%)',
                                width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, rgba(255,255,255,0) 70%)',
                                borderRadius: '50%', zIndex: 0
                            }}></div>

                            <div style={{
                                width: '64px', height: '64px', borderRadius: '20px',
                                background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 1.5rem auto', position: 'relative', zIndex: 1,
                                boxShadow: '0 8px 16px rgba(99, 102, 241, 0.3)'
                            }}>
                                <Brain size={32} color="#FFFFFF" strokeWidth={2} />
                            </div>

                            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.75rem', position: 'relative', zIndex: 1 }}>
                                Activa tu Nutricionista IA
                            </h2>
                            <p style={{ color: '#64748B', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
                                Déjame mandarte un aviso a tu celular a la hora de comer para que nunca olvides tu rutina y alcances tus metas más rápido.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', zIndex: 1 }}>
                                <button
                                    onClick={handleEnablePush}
                                    disabled={isPushEnabling}
                                    style={{
                                        background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                                        color: '#FFFFFF', border: 'none',
                                        padding: '1rem', borderRadius: '1rem',
                                        fontWeight: 700, fontSize: '1rem',
                                        cursor: isPushEnabling ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
                                        opacity: isPushEnabling ? 0.7 : 1,
                                        transform: isPushEnabling ? 'scale(0.98)' : 'scale(1)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {isPushEnabling ? (
                                        <><Loader2 size={20} className="spin-animation" /> Activando...</>
                                    ) : (
                                        <>¡Sí, encender alertas!</>
                                    )}
                                </button>

                                <button
                                    onClick={handleDismissPushOnboarding}
                                    disabled={isPushEnabling}
                                    style={{
                                        background: 'transparent', color: '#94A3B8', border: 'none',
                                        padding: '0.75rem', borderRadius: '1rem',
                                        fontWeight: 600, fontSize: '0.9rem',
                                        cursor: 'pointer',
                                        transition: 'color 0.2s'
                                    }}
                                >
                                    Quizá más tarde
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* --- MODAL CONFIRMACIÓN ONE-CLICK RESTOCK --- */}
            <AnimatePresence>
                {showRestockModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                        zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', padding: '1rem'
                    }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                background: '#FFFFFF', borderRadius: '1.5rem', padding: '2rem',
                                width: '100%', maxWidth: '400px', textAlign: 'center',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                overflow: 'hidden', position: 'relative'
                            }}
                        >
                            <AnimatePresence mode="wait">
                                {!isRestocking ? (
                                    /* === ESTADO: CONFIRMACIÓN === */
                                    <motion.div
                                        key="confirm"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div style={{
                                            width: '64px', height: '64px', borderRadius: '20px',
                                            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            margin: '0 auto 1.5rem auto', boxShadow: '0 8px 16px rgba(16, 185, 129, 0.3)'
                                        }}>
                                            <ShoppingCart size={28} color="#FFFFFF" strokeWidth={2} />
                                        </div>

                                        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.75rem' }}>
                                            ¿Confirmar Compra?
                                        </h2>
                                        <p style={{ color: '#64748B', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem' }}>
                                            Esto agregará todos los ingredientes de la lista de compras directamente a tu Nevera Virtual.
                                        </p>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <button
                                                onClick={handleRestock}
                                                style={{
                                                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                                    color: '#FFFFFF', border: 'none', padding: '1rem', borderRadius: '1rem',
                                                    fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                                                    transition: 'all 0.2s', transform: 'scale(1)'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                            >
                                                <CheckCircle size={20} /> Añadir a mi Nevera
                                            </button>

                                            <button
                                                onClick={() => setShowRestockModal(false)}
                                                style={{
                                                    background: 'transparent', color: '#94A3B8', border: 'none',
                                                    padding: '0.75rem', borderRadius: '1rem', fontWeight: 600, fontSize: '0.9rem',
                                                    cursor: 'pointer', transition: 'color 0.2s'
                                                }}
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    /* === ESTADO: PROCESANDO (Animación Premium) === */
                                    <motion.div
                                        key="loading"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.3 }}
                                        style={{ padding: '0.5rem 0' }}
                                    >
                                        {/* Icono animado con pulso */}
                                        <div style={{ position: 'relative', margin: '0 auto 1.5rem auto', width: '72px', height: '72px' }}>
                                            <motion.div
                                                animate={{ rotate: 360 }}
                                                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                                style={{
                                                    position: 'absolute', inset: 0,
                                                    borderRadius: '50%',
                                                    border: '3px solid transparent',
                                                    borderTopColor: '#10B981',
                                                    borderRightColor: '#10B981',
                                                }}
                                            />
                                            <motion.div
                                                animate={{ rotate: -360 }}
                                                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                                                style={{
                                                    position: 'absolute', inset: '6px',
                                                    borderRadius: '50%',
                                                    border: '3px solid transparent',
                                                    borderBottomColor: '#059669',
                                                    borderLeftColor: '#059669',
                                                    opacity: 0.6
                                                }}
                                            />
                                            <div style={{
                                                position: 'absolute', inset: '14px',
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <motion.div
                                                    animate={{ scale: [1, 1.15, 1] }}
                                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                                                >
                                                    <ShoppingCart size={22} color="#059669" strokeWidth={2.5} />
                                                </motion.div>
                                            </div>
                                        </div>

                                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.5rem' }}>
                                            Registrando compras...
                                        </h2>
                                        <p style={{ color: '#64748B', fontSize: '0.85rem', lineHeight: '1.4', marginBottom: '1.5rem' }}>
                                            Estamos organizando tus ingredientes en la Nevera
                                        </p>

                                        {/* Barra de progreso animada */}
                                        <div style={{
                                            width: '100%', height: '6px', borderRadius: '3px',
                                            background: '#F1F5F9', overflow: 'hidden', marginBottom: '1.25rem'
                                        }}>
                                            <motion.div
                                                initial={{ width: '0%' }}
                                                animate={{ width: '92%' }}
                                                transition={{ duration: 4, ease: [0.25, 0.46, 0.45, 0.94] }}
                                                style={{
                                                    height: '100%', borderRadius: '3px',
                                                    background: 'linear-gradient(90deg, #10B981, #059669, #10B981)',
                                                    backgroundSize: '200% 100%',
                                                    animation: 'shimmer 1.5s ease-in-out infinite'
                                                }}
                                            />
                                        </div>

                                        {/* Pasos de progreso */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', textAlign: 'left' }}>
                                            {[
                                                { label: 'Verificando ingredientes', delay: 0 },
                                                { label: 'Actualizando inventario', delay: 1.2 },
                                                { label: 'Sincronizando Nevera', delay: 2.4 }
                                            ].map((step, i) => (
                                                <motion.div
                                                    key={step.label}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: step.delay, duration: 0.4 }}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                                                        fontSize: '0.85rem', color: '#64748B'
                                                    }}
                                                >
                                                    <motion.div
                                                        initial={{ scale: 0 }}
                                                        animate={{ scale: 1 }}
                                                        transition={{ delay: step.delay + 0.2, type: 'spring', stiffness: 300 }}
                                                        style={{
                                                            width: '20px', height: '20px', borderRadius: '50%',
                                                            background: 'linear-gradient(135deg, #10B981, #059669)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            flexShrink: 0
                                                        }}
                                                    >
                                                        <CheckCircle size={12} color="#fff" strokeWidth={3} />
                                                    </motion.div>
                                                    {step.label}
                                                </motion.div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

// --- Componente interno para las métricas (Items del KPI Board) ---
const StatItem = ({ label, value, unit, icon, color, bgColor, isFirst }) => {
    const Icon = icon;

    return (
        <div className="stat-item">
            <div className="stat-icon" style={{
                width: 48, height: 48,
                borderRadius: '12px',
                background: bgColor,
                color: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: `0 8px 16px -6px ${color}40, inset 0 2px 4px rgba(255,255,255,0.7)`
            }}>
                <Icon size={24} strokeWidth={2.5} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <div className="stat-value" style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0F172A', lineHeight: 1, letterSpacing: '-0.02em' }}>
                        {value}
                    </div>
                    {unit && (
                        <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, paddingLeft: '5px' }}>
                            {unit}
                        </div>
                    )}
                </div>
                <div className="stat-label" style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {label}
                </div>
            </div>
        </div>
    );
};

StatItem.propTypes = {
    label: PropTypes.string,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    unit: PropTypes.string,
    icon: PropTypes.elementType,
    color: PropTypes.string,
    bgColor: PropTypes.string,
    isFirst: PropTypes.bool
};

export default Dashboard;