import { useState, useEffect } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import { motion, AnimatePresence } from 'framer-motion';
import { requestNotificationPermission, subscribeToPushNotifications, isPushSupported } from '../utils/pushNotifications';

import { useNavigate, Navigate, Link } from 'react-router-dom';
import {
    Zap, Droplet, Flame, ArrowRight, CheckCircle,
    RefreshCw, ChefHat, Heart, Pill,
    Brain, Wallet, AlertCircle, Dumbbell, Wheat,
    Lightbulb, Wand2, Clock, BookOpen, Loader2, Target, ShoppingCart
} from 'lucide-react';
import PropTypes from 'prop-types';
import { toast } from 'sonner';
import TrackingProgress from '../components/dashboard/TrackingProgress';
import { supabase } from '../supabase';
import html2pdf from 'html2pdf.js';

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
        updateData
    } = useAssessment();

    const navigate = useNavigate();

    // Estado local para saber qué tarjeta se está regenerando (loading spinner específico)
    const [regeneratingId, setRegeneratingId] = useState(null);

    // Estado local para la navegación por pestañas (Días)
    const [activeDayIndex, setActiveDayIndex] = useState(0);

    // Estado para el modal de Onboarding de Alertas Inteligentes
    const [showPushOnboarding, setShowPushOnboarding] = useState(false);
    const [isPushEnabling, setIsPushEnabling] = useState(false);

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

    // 3. Protección de Ruta: Si terminó de cargar y NO hay plan, mandar al inicio
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    // Cálculos para la UI de límites
    const isLimitReached = typeof userPlanLimit === 'number' && planCount >= userPlanLimit;

    // Calcular si el periodo de abastecimiento expiró para sugerir "Actualizar Plan" en lugar de "Platos"
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

    const handleNewPlan = () => {
        if (formData && formData.age && formData.mainGoal) {
            let previousMeals = [];
            let currentIngredients = [];
            
            // Si NO ha expirado el plan (Actualizar Platos), enviamos las comidas previas 
            // para que la IA mantenga el plan de despensa y solo rote las preparaciones.
            // Si SÍ expiró el plan (Actualizar Plan), enviamos el arreglo vacío para que
            // la IA genere recomendaciones y un plan de abastecimiento totalmente nuevo.
            if (planData && !isPlanExpired) {
                const planDaysToCheck = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
                
                planDaysToCheck.forEach(day => {
                    day.meals.forEach(meal => {
                        if (meal && meal.name) previousMeals.push(meal.name);
                        if (meal && meal.ingredients && Array.isArray(meal.ingredients)) {
                            currentIngredients.push(...meal.ingredients);
                        }
                    });
                });
                
                toast('Rotando Menú', {
                    description: 'Diseñando nuevos platos con tus ingredientes actuales...',
                    icon: '🍲',
                });
            } else {
                toast('Ciclo Renovado', {
                    description: 'Generando nuevo plan de abastecimiento y menú desde cero...',
                    icon: '📦',
                });
            }
            navigate('/plan', { state: { previous_meals: previousMeals, current_shopping_list: typeof currentIngredients !== 'undefined' ? currentIngredients : [] } });
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
                    description: 'Diseñando un nuevo menú ajustado a tus aprendizajes...',
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
            const hasSeenOnboarding = localStorage.getItem('mealfit_push_onboarding_seen');
            if (!hasSeenOnboarding && Notification.permission === 'default') {
                // Pequeño retraso para que la interfaz se asiente primero antes de mostrar el modal
                const timer = setTimeout(() => {
                    setShowPushOnboarding(true);
                }, 2000);
                return () => clearTimeout(timer);
            }
        }
    }, [loadingData, userProfile]);

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
            const loadingToast = toast.loading('Generando lista de abastecimiento...', { position: 'top-center' });
            
            let data = [];
            if (planData && planData.days) {
                planData.days.forEach(day => {
                    (day.meals || day.perfectDay || []).forEach(meal => {
                        if (meal.ingredients && Array.isArray(meal.ingredients)) {
                            data.push(...meal.ingredients);
                        }
                    });
                });
            }

            if (!data || data.length === 0) {
                toast.dismiss(loadingToast);
                toast.error('No se encontró una lista de despensa activa.');
                return;
            }

            const getPluralUnit = (num, u) => {
                if (num <= 1 || !u) return u;
                const l = u.toLowerCase();
                if (l === 'libra' || l === 'lb') return 'lbs';
                if (l === 'paquete') return 'paquetes';
                if (l === 'pote') return 'potes';
                if (l === 'unidad') return 'unidades';
                if (l === 'lata') return 'latas';
                if (l === 'cabeza') return 'cabezas';
                if (l === 'diente') return 'dientes';
                if (l === 'cartón' || l === 'carton') return 'cartones';
                if (l === 'sobre') return 'sobres';
                if (l === 'botella') return 'botellas';
                return u;
            };

            const normalizeName = (origName) => {
                let n = String(origName).toLowerCase().trim();
                
                n = n.replace(/\(.*?\)/g, '').trim(); // Remover paréntesis tipo (1 taza) primero
                n = n.replace(/^(cda|cdta|cdita|cucharada|cucharadita|taza|vaso|pizca|chorrito|puñado|atado|manojo|scoop|lonja|loncha)(s)?\s*(de\s+|del\s+)?/i, '');
                n = n.replace(/^(de\s+|del\s+)/i, '');
                
                if (n.includes('aceite')) {
                    if (n.includes('sésamo') || n.includes('sesamo') || n.includes('maní')) return 'Aceite de sésamo o maní';
                    if (n.includes('coco')) return 'Aceite de coco';
                    return 'Aceite de oliva';
                }
                if (n.includes('almendra')) return 'Almendras';
                if (n.includes('chía') || n.includes('chia')) return 'Semillas de chía';
                if (/\bavena\b/.test(n)) return 'Avena';
                if (n.includes('ají') || n.includes('ajies') || n.includes('pimiento')) return 'Ajíes';
                
                if (/\bres\b/.test(n) || n.includes('bistec') || n.includes('machada')) return 'Carne de res magra';
                if (n.includes('cerdo') || n.includes('chuleta') || n.includes('masita') || n.includes('longaniza') || n.includes('tocineta')) return 'Carne de cerdo magra';
                
                // --- Pavo y Pollo ---
                if (/\bpavo\b/.test(n)) {
                    if (n.includes('molido') || n.includes('molida')) return 'Pavo molido magro';
                    if (n.includes('salami')) return 'Salami de pavo dominicano';
                    return 'Pechuga de pavo'; 
                }
                if (/\bpollo\b/.test(n) || /\bpechuga\b/.test(n)) return 'Pechuga de pollo';

                if (n.includes('camarones') || n.includes('camaron') || n.includes('camarón')) return 'Camarones pelados';
                if (n.includes('pescado') || /\bmero\b/.test(n) || /\bchillo\b/.test(n) || n.includes('tilapia') || Boolean(n.match(/\bsalmón\b|\bsalmon\b/))) return 'Filete de pescado';
                if (n.includes('tortilla') || n.includes('wrap') || n.includes('plantilla') || n.includes('taco')) return 'Plantillas para wrap';
                
                // --- Quesos ---
                if (n.includes('queso de freir') || n.includes('queso de freír') || n.includes('queso blanco de freír')) return 'Queso blanco de freír ligero';
                if (n.includes('cottage')) return 'Queso cottage';
                if (n.includes('ricotta')) return 'Queso ricotta descremado';
                if (n.includes('mozzarella')) return 'Queso mozzarella descremado';
                if (n.includes('queso blanco')) return 'Queso blanco ligero';

                if (n.includes('batata')) return 'Batata';
                if (n.includes('plátano') || n.includes('platano')) {
                    if (n.includes('maduro')) return 'Plátano maduro';
                    return 'Plátano verde';
                }
                if (/\bhuevo\b/.test(n) || /\bhuevos\b/.test(n)) return 'Huevos';
                if (n.includes('vainita')) return 'Vainitas';
                if (n.includes('coliflor')) return 'Coliflor';
                if (n.includes('naranja')) return 'Naranja';
                if (/\bpapa\b/.test(n) || n.includes('yautía') || n.includes('yautia')) return 'Papa o Yautía';
                if (n.includes('tayota')) return 'Tayota';
                if (n.includes('brócoli') || n.includes('brocoli')) return 'Brócoli';
                if (n.includes('fresa')) return 'Fresas';
                if (n.includes('guineo') || n.includes('banana')) {
                     if (n.includes('verde') || n.includes('guineíto') || n.includes('guineito')) return 'Guineítos verdes';
                     return 'Guineos maduros';
                }
                if (n.includes('manzana')) return 'Manzana';
                if (n.includes('yogurt') || n.includes('yogur')) return 'Yogurt griego natural';
                if (/\barroz\b/.test(n)) return 'Arroz';
                if (n.includes('garbanzo')) return 'Garbanzos';
                if (n.includes('habichuela')) return 'Habichuelas';
                if (n.includes('lenteja')) return 'Lentejas';
                if (n.includes('atún') || n.includes('atun') || n.includes('sardina')) return 'Atún en agua (lata)';
                if (/\bpan\b/.test(n)) return 'Pan integral';
                if (n.includes('casabe')) return 'Casabe';
                if (n.includes('harina de maíz') || n.includes('harina de maiz')) return 'Harina de maíz';
                
                if (/\bsal\b/.test(n) && /\bajo\b/.test(n)) return 'Sal y ajo en polvo';
                if (n.includes('salsa de soya') || n.includes('salsa china')) return 'Salsa de soya';
                if (n.includes('cebolla')) return 'Cebolla';
                if (n.includes('orégano') || n.includes('oregano')) return 'Orégano';
                if (n.includes('canela')) return 'Canela';
                if (n.includes('pasta de tomate') || n.includes('salsa de tomate')) return 'Pasta de tomate natural';
                if (n.includes('tomate')) return 'Tomate';
                if (n.includes('limón') || n.includes('limon')) return 'Limón';
                if (n.includes('piña')) return 'Piña';
                if (n.includes('melón') || n.includes('melon')) return 'Melón';
                if (n.includes('chinola')) return 'Chinola';
                if (n.includes('repollo')) return 'Repollo';
                if (n.includes('tofu')) return 'Tofu firme';
                if (n.includes('molondron') || n.includes('molondrón')) return 'Molondrones';
                if (n.includes('zanahoria')) return 'Zanahorias';
                if (n.includes('cilantro') || n.includes('verdura')) return 'Cilantro o verdura';
                if (n.includes('berenjena')) return 'Berenjenas';
                if (n.includes('leche en polvo')) return 'Leche en polvo';

                const stops = ['picada', 'picado', 'en tiras', 'en cubos', 'rallado', 'rallada', 'magra', 'para rebozar', 'en hojuelas', 'hervida', 'desmenuzada', 'fresco', 'fresca', 'cocido', 'cocida', 'pelada', 'pelado', 'en dados', 'al gusto', 'pizca de', 'rodajas de', 'en aros', 'de la despensa', 'ralladura y jugo de 1/2', 'natural', 'bajo en grasa', 'descremado', 'descremada', 'horneado', 'grandes', 'firme'];
                stops.forEach(s => n = n.replace(new RegExp(`\\b${s}\\b`, 'gi'), ''));
                n = n.replace(/,/g, '').trim();
                
                return n.charAt(0).toUpperCase() + n.slice(1);
            };

            const parseQtyToNumber = (qtyStr) => {
                if (!qtyStr || String(qtyStr).trim() === 'None') return { num: 0, unit: '' };
                let parsedStr = String(qtyStr).trim().replace(/[\u00BD½]/g, ' 1/2').replace(/  +/g, ' ').trim();
                const regex = /^([\d.,]+(?:[ \/]+[\d.,]+)?)\s*(.*)$/;
                const match = parsedStr.match(regex);
                if (match) {
                    let nStr = match[1].replace(',', '.').trim();
                    let unit = match[2];
                    let num = 0;
                    if (nStr.includes('/')) {
                        const parts = nStr.split(' ');
                        if (parts.length === 2 && parts[1].includes('/')) {
                            const frac = parts[1].split('/');
                            num = parseFloat(parts[0]) + (parseFloat(frac[0]) / parseFloat(frac[1]));
                        } else if (parts.length === 1 && nStr.includes('/')) {
                            const frac = nStr.split('/');
                            num = parseFloat(frac[0]) / parseFloat(frac[1]);
                        }
                    } else {
                        num = parseFloat(nStr);
                    }
                    return { num: isNaN(num) ? 0 : num, unit: unit.trim() };
                }
                return { num: 0, unit: String(qtyStr).trim() }; 
            };

            const consData = {};
            data.forEach(rawItem => {
                let item = rawItem;
                
                if (typeof rawItem === 'string') {
                    let cleanStr = String(rawItem).replace(/^[-*•]\s*/, '').trim();
                    // Red de Seguridad Extra: Convertir palabras engañosas a números reales
                    const wordMap = { 'un cuarto de': '1/4', 'un cuarto': '1/4', 'media': '1/2', 'medio': '1/2', 'un': '1', 'una': '1', 'dos': '2', 'tres': '3', 'cuatro': '4', 'cinco': '5', 'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9', 'diez': '10', 'docena de': '12', 'docena': '12', 'par de': '2' };
                    for (const [w, n] of Object.entries(wordMap)) {
                        cleanStr = cleanStr.replace(new RegExp(`^${w}\\b`, 'i'), n);
                    }

                    const regex = /^([\d.,1\/2½]+(?:[ \t]+[\d.,1\/2½]+)?)\s*(?:(lbs|lb|libras|libra|onzas|oz|gr|g|kg|ml|lt|l|tazas|taza|cdta|cda|cucharaditas|cucharadita|cucharadas|cucharada|unidades|unidad|paquetes|paquete|paq|potes|pote|cartones|cartón|carton|latas|lata|cabezas|cabeza|dientes|diente|sobres|sobre|botellas|botella)\b)?\s*(?:de\s+|del\s+)?(.*)$/i;
                    const match = cleanStr.match(regex);
                    
                    if (match) {
                        const cant = `${match[1] || ''} ${match[2] || ''}`.trim();
                        item = {
                            category: 'Alimentos',
                            display_name: match[3] || cleanStr,
                            qty_7: cant || "None"
                        };
                    } else {
                        item = {
                            category: 'Alimentos',
                            display_name: cleanStr,
                            qty_7: "None"
                        };
                    }
                }

                let cat = item.category || 'Alimentos';
                if (cat === 'Otros') cat = 'Alimentos';
                
                let origName = item.display_name || item.name || item.item_name;
                if (typeof origName === 'string' && origName.trim().startsWith('{')) {
                    try { 
                        const parsed = JSON.parse(origName);
                        origName = parsed.display_name || parsed.name || parsed.item_name || origName; 
                    } catch(e){}
                } else if (typeof origName === 'object' && origName !== null) {
                    origName = origName.display_name || origName.name || origName.item_name || JSON.stringify(origName);
                }
                
                const normName = normalizeName(origName);
                // Prevenir falsos duplicados cruzados entre categorias con la key compuesta
                const uniqueKey = `${cat}_${normName}`;
                
                if (!consData[uniqueKey]) {
                    consData[uniqueKey] = {
                        ...item,
                        category: cat,
                        display_name: normName,
                        qty_7: item.qty_7 || item.qty || '', 
                        _parsedNum: 0,
                        _unit: ''
                    };
                }
                
                let { num, unit } = parseQtyToNumber(item.qty_7 || item.qty);

                const nLowerGlobal = normName.toLowerCase();
                // --- CONVERSIÓN DE PESOS (Gramos, onzas, kilos) A LIBRAS E INTERCEPCIONES COMERCIALES ---
                const uLower = (unit || '').toLowerCase();
                const isGrams = ['g', 'gr', 'gramo', 'gramos'].includes(uLower);
                const isOunces = ['oz', 'onza', 'onzas'].includes(uLower);
                const isKilos = ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(uLower);

                if (isGrams || isOunces || isKilos) {
                    if (nLowerGlobal.includes('atún') || nLowerGlobal.includes('atun') || nLowerGlobal.includes('sardina')) {
                        let totalGrams = num;
                        if (isOunces) totalGrams = num * 28.3495;
                        if (isKilos) totalGrams = num * 1000;
                        num = Math.ceil(totalGrams / 150) || 1; 
                        unit = 'lata';
                    } else if (nLowerGlobal.includes('habichuela') || nLowerGlobal.includes('garbanzo') || nLowerGlobal.includes('lenteja') || nLowerGlobal.includes('guandul') || nLowerGlobal.includes('maíz')) {
                        let totalGrams = num;
                        if (isOunces) totalGrams = num * 28.3495;
                        if (isKilos) totalGrams = num * 1000;
                        num = Math.ceil(totalGrams / 400) || 1; 
                        unit = 'lata';
                    } else if (nLowerGlobal.includes('yogurt') || nLowerGlobal.includes('yogur') || nLowerGlobal.includes('mostaza') || nLowerGlobal.includes('mayonesa')) {
                        let totalGrams = num;
                        if (isOunces) totalGrams = num * 28.3495;
                        if (isKilos) totalGrams = num * 1000;
                        num = Math.ceil(totalGrams / 250) || 1; 
                        unit = 'pote';
                    } else if (nLowerGlobal.includes('pan') || nLowerGlobal.includes('avena') || nLowerGlobal.includes('galleta') || nLowerGlobal.includes('casabe') || nLowerGlobal.includes('almendra') || nLowerGlobal.includes('nuez') || nLowerGlobal.includes('nueces')) {
                        num = 1; 
                        unit = 'paquete';
                    } else {
                        // Convertir a libras
                        if (isGrams) num = num / 453.592;
                        if (isOunces) num = num / 16;
                        if (isKilos) num = num * 2.20462;
                        
                        if (num < 0.5) num = 0.5; // Todo dominicano compra al menos 1/2 libra
                        // Redondear a la media libra más cercana (0.5, 1, 1.5, etc.) para el supermercado
                        num = Math.ceil(num * 2) / 2;
                        unit = 'lb';
                    }
                }

                // --- CORRECCIÓN DE ALUCINACIONES DE LA IA E INTERCEPCIÓN DE LÍQUIDOS ---
                const isVolume = ['ml', 'mililitro', 'mililitros', 'l', 'litro', 'litros'].includes((unit || '').toLowerCase());
                if (isVolume) {
                    if (nLowerGlobal.includes('atún') || nLowerGlobal.includes('atun')) {
                        unit = 'lata'; // Error de la IA (litros en vez de lata)
                        num = 1;
                    } else if (nLowerGlobal.includes('leche') || nLowerGlobal.includes('jugo')) {
                        let totalLiters = (unit.toLowerCase().includes('m')) ? num / 1000 : num;
                        num = Math.ceil(totalLiters) || 1;
                        unit = 'cartón';
                    } else if (nLowerGlobal.includes('aceite') || nLowerGlobal.includes('vinagre') || nLowerGlobal.includes('salsa') || nLowerGlobal.includes('vainilla') || nLowerGlobal.includes('miel') || nLowerGlobal.includes('sirope')) {
                        num = Math.ceil(num / 500) || 1; // Potes de medio litro
                        unit = 'pote';
                    }
                }

                // --- CONVERSIÓN DE UNIDADES CULINARIAS A COMERCIALES ---
                const cookingUnits = ['cda', 'cdta', 'cucharada', 'cucharadas', 'cucharadita', 'cucharaditas', 'taza', 'tazas', 'vaso', 'vasos', 'pizca', 'chorrito', 'rodaja', 'rodajas', 'diente', 'dientes', 'lonja', 'lonjas', 'al gusto'];
                if (cookingUnits.includes((unit || '').toLowerCase())) {
                    // Si el AI genera unidades de cocina (ej: 4 tazas arroz, 1 cda aceite)
                    // Las convertimos a 1 paquete/pote/etc para simplificarlas para el súper
                    num = 1;
                    unit = ''; // El string vacío fuerza a disparar el fallback inteligente abajo
                }

                const genericUnits = ['lb', 'lbs', 'libra', 'libras', 'l', 'lt', 'unidad', 'unidades', ''];
                const isGenericWeightOrCount = genericUnits.includes((unit || '').toLowerCase().trim());
                const originalParsedUnit = (unit || '').toLowerCase().trim();

                if (num > 0) {
                    if (isGenericWeightOrCount) {
                        if (nLowerGlobal.includes('huevo')) unit = 'cartón';
                        else if (nLowerGlobal.includes('pan') || nLowerGlobal.includes('wrap') || nLowerGlobal.includes('avena') || nLowerGlobal.includes('canela') || nLowerGlobal.includes('orégano') || nLowerGlobal.includes('semilla') || nLowerGlobal.includes('almendra') || nLowerGlobal.includes('chía') || nLowerGlobal.includes('chia') || nLowerGlobal.includes('casabe') || nLowerGlobal.includes('nuez') || nLowerGlobal.includes('nueces') || nLowerGlobal.includes('ensalada')) unit = 'paquete';
                        else if (nLowerGlobal.includes('habichuela') || nLowerGlobal.includes('garbanzo') || nLowerGlobal.includes('lenteja') || nLowerGlobal.includes('guandul') || nLowerGlobal.includes('gandul') || nLowerGlobal.includes('maíz') || nLowerGlobal.includes('atún') || nLowerGlobal.includes('atun') || nLowerGlobal.includes('sardina')) unit = 'lata';
                        else if (nLowerGlobal.includes('lechuga') || /\bajo(s)?\b/.test(nLowerGlobal)) unit = 'cabeza';
                        else if (nLowerGlobal.includes('yogurt') || nLowerGlobal.includes('yogur') || nLowerGlobal.includes('polvo') || nLowerGlobal.includes('aceite') || nLowerGlobal.includes('mostaza') || nLowerGlobal.includes('mayonesa') || nLowerGlobal.includes('ketchup') || nLowerGlobal.includes('mermelada') || nLowerGlobal.includes('miel') || nLowerGlobal.includes('sirope') || nLowerGlobal.includes('mantequilla') || nLowerGlobal.includes('maní') || nLowerGlobal.includes('aceituna')) unit = 'pote';
                        else if (nLowerGlobal.includes('salsa') || nLowerGlobal.includes('sésamo') || nLowerGlobal.includes('sesamo') || nLowerGlobal.includes('vinagre')) unit = 'botella';
                        else if (nLowerGlobal.includes('leche') || nLowerGlobal.includes('jugo')) unit = 'cartón';
                        else if (nLowerGlobal.includes('aguacate') || nLowerGlobal.includes('limón') || nLowerGlobal.includes('limon') || nLowerGlobal.includes('manzana') || nLowerGlobal.includes('naranja') || nLowerGlobal.includes('guineo')) unit = 'unidad';
                        else if (nLowerGlobal.includes('carne') || nLowerGlobal.includes('pollo') || nLowerGlobal.includes('queso') || nLowerGlobal.includes('batata') || nLowerGlobal.includes('arroz') || nLowerGlobal.includes('cerdo') || nLowerGlobal.includes('salmón') || nLowerGlobal.includes('pescado') || nLowerGlobal.includes('yuca') || nLowerGlobal.includes('plátano') || nLowerGlobal.includes('papa') || nLowerGlobal.includes('yautía') || nLowerGlobal.includes('brócoli') || nLowerGlobal.includes('zanahoria') || nLowerGlobal.includes('berenjena') || nLowerGlobal.includes('camarones') || nLowerGlobal.includes('tomate') || nLowerGlobal.includes('cebolla') || nLowerGlobal.includes('ají') || nLowerGlobal.includes('aji') || nLowerGlobal.includes('pimiento') || nLowerGlobal.includes('tayota') || nLowerGlobal.includes('vainita') || nLowerGlobal.includes('coliflor') || nLowerGlobal.includes('repollo')) unit = 'lb';
                        else unit = unit || 'unidad'; // Recuperar la unidad original (ej. 'lb') o unidad como fallback final
                        
                        // Blindaje de sobre - escalamiento:
                        // Si la IA mandó un conteo de porciones diminutas (ej. "10 (unidades) de aceitunas" o "4 huevos")
                        // y nosotros lo forzamos a un empaque (pote, paquete, cartón), garantizamos que una receta NO ocupe más de 1 empaque.
                        if ((originalParsedUnit === 'unidad' || originalParsedUnit === 'unidades' || originalParsedUnit === '') && num > 1) {
                            const bulkContainers = ['paquete', 'pote', 'botella', 'cartón', 'cabeza', 'lata'];
                            if (bulkContainers.includes(unit)) {
                                num = 1;
                            }
                        }
                    }
                    
                    if (!consData[uniqueKey]._unit && unit) {
                        consData[uniqueKey]._unit = unit; 
                    }
                    
                    const bulkUnits = ['paquete', 'paquetes', 'pote', 'potes', 'botella', 'botellas', 'cartón', 'cartones', 'cabeza', 'cabezas', 'lata', 'latas'];
                    if (bulkUnits.includes((consData[uniqueKey]._unit || '').toLowerCase())) {
                        // Para empaques de despensa o bultos, 2 recetas que piden "1 paquete de avena" usarán el MISM0 paquete
                        consData[uniqueKey]._parsedNum = Math.max(consData[uniqueKey]._parsedNum, num);
                    } else {
                        // Para items por peso o contables individuales (lbs, unidades), sumamos
                        consData[uniqueKey]._parsedNum += num;
                    }
                    
                    let nNum = Math.ceil(consData[uniqueKey]._parsedNum);
                    let finalUnit = getPluralUnit(nNum, consData[uniqueKey]._unit);
                    consData[uniqueKey].qty_7 = `${nNum} ${finalUnit}`.trim();
                } else if (consData[uniqueKey]._parsedNum === 0 && (!consData[uniqueKey].qty_7 || consData[uniqueKey].qty_7 === 'None')) {
                    let fallbackQty = item.qty_7 || item.qty;
                    const isGenericFallback = genericUnits.includes((fallbackQty || '').toString().toLowerCase().replace(/[0-9]/g, '').trim());
                    if (!fallbackQty || fallbackQty === 'None' || isGenericFallback) {
                        if (nLowerGlobal.includes('queso') || nLowerGlobal.includes('pescado') || nLowerGlobal.includes('carne') || nLowerGlobal.includes('pollo') || nLowerGlobal.includes('yuca') || nLowerGlobal.includes('plátano') || nLowerGlobal.includes('papa') || nLowerGlobal.includes('yautía') || nLowerGlobal.includes('brócoli') || nLowerGlobal.includes('zanahoria') || nLowerGlobal.includes('berenjena') || nLowerGlobal.includes('camarones') || nLowerGlobal.includes('tomate') || nLowerGlobal.includes('cebolla') || nLowerGlobal.includes('ají') || nLowerGlobal.includes('aji') || nLowerGlobal.includes('pimiento') || nLowerGlobal.includes('tayota') || nLowerGlobal.includes('vainita') || nLowerGlobal.includes('coliflor') || nLowerGlobal.includes('repollo') || nLowerGlobal.includes('arroz') || nLowerGlobal.includes('azúcar')) fallbackQty = '1 lb';
                        else if (nLowerGlobal.includes('pan') || nLowerGlobal.includes('avena') || nLowerGlobal.includes('galleta') || nLowerGlobal.includes('casabe') || nLowerGlobal.includes('almendra') || nLowerGlobal.includes('nuez') || nLowerGlobal.includes('nueces') || nLowerGlobal.includes('orégano') || nLowerGlobal.includes('semilla') || nLowerGlobal.includes('canela') || nLowerGlobal.includes('ensalada') || nLowerGlobal.includes('pasta') || nLowerGlobal.includes('quinoa')) fallbackQty = '1 paquete';
                        else if (nLowerGlobal.includes('habichuela') || nLowerGlobal.includes('garbanzo') || nLowerGlobal.includes('lenteja') || nLowerGlobal.includes('guandul') || nLowerGlobal.includes('gandul') || nLowerGlobal.includes('maíz') || nLowerGlobal.includes('atún') || nLowerGlobal.includes('atun') || nLowerGlobal.includes('sardina')) fallbackQty = '1 lata';
                        else if (nLowerGlobal.includes('yogurt') || nLowerGlobal.includes('yogur') || nLowerGlobal.includes('mostaza') || nLowerGlobal.includes('mayonesa') || nLowerGlobal.includes('ketchup') || nLowerGlobal.includes('aceite') || nLowerGlobal.includes('miel') || nLowerGlobal.includes('sirope') || nLowerGlobal.includes('polvo') || nLowerGlobal.includes('mermelada') || nLowerGlobal.includes('mantequilla') || nLowerGlobal.includes('maní') || nLowerGlobal.includes('aceituna')) fallbackQty = '1 pote';
                        else if (nLowerGlobal.includes('salsa') || nLowerGlobal.includes('vinagre')) fallbackQty = '1 botella';
                        else if (nLowerGlobal.includes('leche') || nLowerGlobal.includes('jugo') || nLowerGlobal.includes('huevo')) fallbackQty = '1 cartón';
                        else fallbackQty = fallbackQty && fallbackQty !== 'None' ? fallbackQty : '1 unidad';
                    }
                    consData[uniqueKey].qty_7 = fallbackQty;
                }
            });

            // Agrupar por categoría
            const grouped = {};
            Object.values(consData).forEach(item => {
                let cat = item.category;
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(item);
            });

            // Count total items to adjust density and keep the PDF on 1 page
            const totalItems = Object.values(consData).length;
            const isDense = totalItems >= 26;
            const rootPadding = isDense ? '12px' : '20px';
            const headerPadding = isDense ? '12px 16px' : '16px 20px';
            const headerMargin = isDense ? '12px' : '20px';
            const gapMargin = isDense ? '6px' : '10px';  // grid gap
            const listGap = isDense ? '8px' : '10px';

            // Obtener duración actual
            const duration = formData?.groceryDuration || 'weekly';
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
                        <div style="display: flex; gap: 8px;">
                            <span style="background-color: #ecfdf5; color: #065f46; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; border: 1px solid #10b98140;">Ciclo: ${durationText}</span>
                            <span style="background-color: #f3f4f6; color: #4b5563; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600;">Generado: ${new Date().toLocaleDateString('es-DO')}</span>
                        </div>
                    </div>
                    <img src="/favicon-transparent.png" alt="MealfitRD Logo" style="height: 40px;" />
                </div>

                
                <!-- Disclaimer de Cantidades -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #3b82f6; padding: 10px 14px; border-radius: 6px; margin-bottom: 20px; display: flex; align-items: flex-start; gap: 10px;">
                    <svg style="flex-shrink: 0; width: 16px; height: 16px; color: #3b82f6; margin-top: 1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p style="margin: 0; font-size: 11px; color: #334155; line-height: 1.4;">
                        <strong>Nota importante:</strong> Las cantidades de esta lista de compras <strong>no son 100% exactas</strong>, son proyecciones base para 1 persona. Te recomendamos ajustarlas y comprar <strong>al gusto</strong> según lo que consumes usualmente o si cocinas para más familiares.
                    </p>
                </div>

                <!-- Three Column Layout for Categories -->
                <div style="column-count: 3; column-gap: 16px;">
            `;

            Object.keys(grouped).sort().forEach(cat => {
                const icon = `<span style="background-color: #10b981; color: white; border-radius: 4px; padding: 4px; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg></span>`;
                htmlContent += `
                <div style="background-color: #ffffff; border: 1px solid #f3f4f6; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); break-inside: auto; page-break-inside: auto;">
                    <div style="background-color: #f8fafc; padding: ${isDense ? '6px 10px' : '8px 12px'}; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 6px;">
                        ${icon}
                        <h3 style="margin: 0; font-size: 11px; font-weight: 800; color: #1f2937; text-transform: uppercase; letter-spacing: 0.05em;">${cat}</h3>
                    </div>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                `;
                grouped[cat].forEach((item, index) => {
                    const isLast = index === grouped[cat].length - 1;
                    const borderBottom = isLast ? '' : 'border-bottom: 1px solid #f3f4f6;';
                    // Obtenemos la cantidad base (7 días)
                    const baseQty = item.qty_7 || item.qty || '';
                    let displayQty = baseQty;
                    
                    // Condición para no multiplicar despensa básica que dura mucho tiempo
                    const nLower = String(item.display_name || item.name || '').toLowerCase();
                    const isPantryStaple = 
                        nLower.includes('aceite') ||
                        nLower.includes('salsa de soya') ||
                        /\bsal\b/.test(nLower) ||
                        nLower.includes('ajo en polvo') ||
                        nLower.includes('especias') ||
                        nLower.includes('orégano') ||
                        nLower.includes('canela') ||
                        nLower.includes('multivitamínico') ||
                        nLower.includes('chía') ||
                        nLower.includes('almendra') ||
                        nLower.includes('avena') ||
                        nLower.includes('miel') ||
                        nLower.includes('sirope') ||
                        nLower.includes('vinagre') ||
                        nLower.includes('vainilla') ||
                        nLower.includes('al gusto') ||
                        nLower.includes('pizca');

                    // Lógica determinística para multiplicar cantidades según la duración
                    if (!isPantryStaple && baseQty && String(baseQty).trim() !== 'None' && duration !== 'weekly') {
                        const multiplier = duration === 'biweekly' ? 2 : 4;
                        let parsedBase = String(baseQty).trim().replace(/[\u00BD½]/g, ' 1/2').replace(/  +/g, ' ').trim();
                        // Regex que permite capturar hasta un número + espacio + unidad o fracción simple
                        const regex = /^([\d.,]+(?:[ \/]+[\d.,]+)?)\s*(.*)$/;
                        const match = parsedBase.match(regex);
                        
                        if (match) {
                            let numStr = match[1].replace(',', '.').trim();
                            let unit = match[2];
                            let num = 0;
                            
                            // Parsear fracciones como "1 1/2" o "1/2"
                            if (numStr.includes('/')) {
                                const parts = numStr.split(' ');
                                if (parts.length === 2 && parts[1].includes('/')) {
                                    const frac = parts[1].split('/');
                                    num = parseFloat(parts[0]) + (parseFloat(frac[0]) / parseFloat(frac[1]));
                                } else if (parts.length === 1 && numStr.includes('/')) {
                                    const frac = numStr.split('/');
                                    num = parseFloat(frac[0]) / parseFloat(frac[1]);
                                }
                            } else {
                                num = parseFloat(numStr);
                            }
                            
                            if (!isNaN(num) && num > 0) {
                                let newNum = num * multiplier;
                                
                                // Redondear siempre hacia arriba a números enteros
                                let finalNum = Math.ceil(newNum);
                                let finalUnit = getPluralUnit(finalNum, unit);
                                displayQty = `${finalNum} ${finalUnit}`.trim();
                            }
                        }
                    }

                    let display = item.display_name || item.name || item.item_name;
                    if (typeof display === 'string' && display.trim().startsWith('{')) {
                        try {
                            const parsed = JSON.parse(display);
                            display = parsed.display_name || parsed.name || parsed.item_name || display;
                        } catch(e) {}
                    } else if (typeof display === 'object' && display !== null) {
                        display = display.display_name || display.name || display.item_name || JSON.stringify(display);
                    }
                    
                    // Tag de cantidad super compacto para 3 columnas
                    const qtyStr = displayQty && String(displayQty).trim() !== 'None' ? `<span style="font-weight: 700; color: #059669; font-size: ${isDense ? '8.5px' : '9.5px'}; background-color: #ecfdf5; border: 1px solid #10b98130; padding: 1.5px 4px; border-radius: 4px; margin-left: 6px; white-space: nowrap; align-self: flex-start;">${displayQty}</span>` : '';

                    htmlContent += `
                        <li style="display: flex; align-items: flex-start; padding: ${isDense ? '4px 8px' : '6px 12px'}; ${borderBottom} page-break-inside: avoid;">
                            <div style="width: ${isDense ? '12px' : '14px'}; height: ${isDense ? '12px' : '14px'}; border: 1.5px solid #d1d5db; border-radius: ${isDense ? '3px' : '4px'}; margin-right: ${isDense ? '6px' : '10px'}; flex-shrink: 0; background-color: #ffffff; margin-top: 2px;"></div>
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                                <span style="font-size: ${isDense ? '10px' : '11px'}; font-weight: 600; color: #374151; line-height: 1.3;">${display}</span>
                                ${qtyStr}
                            </div>
                        </li>
                    `;
                });
                htmlContent += `
                    </ul>
                </div>
                `;
            });

            htmlContent += `
                </div> <!-- End Layout -->
                
                <!-- Footer -->
                <div style="margin-top: 15px; text-align: center; color: #9ca3af; font-size: 10px; border-top: 2px dashed #e5e7eb; padding-top: 10px;">
                    <p style="margin: 0; font-weight: 700; color: #6b7280; letter-spacing: 1px;">PROCESADO POR MEALFITRD IA - NUTRICIÓN INTELIGENTE</p>
                </div>
            </div>
            `;

            element.innerHTML = htmlContent;

            // html2pdf opciones
            const opt = {
                margin:       [5, 0, 5, 0], // top, left, bottom, right (en mm)
                filename:     `Lista_Compras_${durationText.replace(' ', '_')}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            await html2pdf().set(opt).from(element).save();

            toast.dismiss(loadingToast);
            toast.success('Lista PDF descargada exitosamente', { icon: '📄', position: 'top-center' });

        } catch (error) {
            console.error('Error downloading shopping list:', error);
            toast.dismiss();
            toast.error('Error al generar la lista de compras.');
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
                .macros-grid {
                    background: white;
                    border-radius: 1.25rem;
                    border: 1px solid #E2E8F0;
                    box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.03);
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    overflow: hidden;
                }
                .stat-item {
                    padding: 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    background: white;
                    border-right: 1px solid #F1F5F9;
                }
                .stat-item:last-child {
                    border-right: none;
                }
                .menu-section-header {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 1.5rem;
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
                    margin-bottom: 2rem;
                    justify-content: center;
                    background: #F8FAFC;
                    padding: 0.75rem;
                    border-radius: 1rem;
                    border: 1px solid #E2E8F0;
                    box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.02);
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
                .meal-card {
                    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.75) 100%);
                    backdrop-filter: blur(16px);
                    padding: 1.75rem;
                    border-radius: 2rem;
                    border: 1px solid white;
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: 1.5rem;
                    align-items: center;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
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
                }
                .new-plan-btn {
                    padding: 0.85rem 1.75rem;
                    border-radius: 1rem;
                    border: none;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    transition: all 0.3s ease;
                    font-size: 0.95rem;
                    cursor: pointer;
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
                    .macros-grid {
                        grid-template-columns: repeat(2, 1fr);
                        border-radius: 1rem;
                    }
                    .stat-item {
                        padding: 1rem 1.15rem;
                        gap: 0.65rem;
                        border-right: none;
                        border-bottom: 1px solid #F1F5F9;
                    }
                    .stat-item:nth-child(odd) {
                        border-right: 1px solid #F1F5F9;
                    }
                    .stat-item:nth-child(n+3) {
                        border-bottom: none;
                    }
                    .stat-item .stat-icon {
                        width: 38px;
                        height: 38px;
                        border-radius: 10px;
                    }
                    .stat-item .stat-value {
                        font-size: 1.25rem;
                    }
                    .stat-item .stat-label {
                        font-size: 0.7rem;
                    }
                    .menu-section-header {
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        gap: 0.25rem;
                        margin-bottom: 1rem;
                    }
                    .option-buttons {
                        gap: 0.5rem;
                        padding: 0.5rem;
                        margin-bottom: 1.25rem;
                    }
                    .option-btn {
                        padding: 0.7rem 0.5rem;
                        font-size: 0.85rem;
                        border-radius: 0.6rem;
                    }
                    .meal-card {
                        padding: 1.25rem;
                        border-radius: 1.25rem;
                        grid-template-columns: 1fr;
                        gap: 1rem;
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
                    .meal-card {
                        padding: 1rem;
                        border-radius: 1rem;
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
                            border: `1px solid ${isPremium ? '#FCD34D' : '#E2E8F0'}`,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: '#FFFFFF', padding: '0.4rem 0.75rem', borderRadius: '0.75rem', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Clock size={14} color="#64748B"/>
                                <span className="hidden sm:inline" style={{fontSize: '0.75rem', fontWeight: 700, color: '#64748B'}}>DESPENSA:</span>
                                <select 
                                    value={groceryDuration}
                                    onChange={(e) => updateData('groceryDuration', e.target.value)}
                                    style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', outline: 'none', color: '#0F172A', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    <option value="weekly">Estática por 7 Días</option>
                                    <option value="biweekly">Estática por 15 Días</option>
                                    <option value="monthly">Estática por 1 Mes</option>
                                </select>
                            </div>
                            
                            {!isPlanExpired ? (
                                <div style={{ background: '#FEF2F2', color: '#EF4444', padding: '0.2rem 0.6rem', borderRadius: '0.5rem', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                    {daysLeft} {daysLeft === 1 ? 'd' : 'días'}
                                </div>
                            ) : (
                                <div style={{ background: '#FEF2F2', color: '#EF4444', padding: '0.2rem 0.6rem', borderRadius: '0.5rem', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                                    Expirada
                                </div>
                            )}
                        </div>

                        {/* BOTONES LADO A LADO */}
                        <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
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
                                    boxShadow: isLimitReached ? 'none' : '0 10px 20px -5px rgba(15, 23, 42, 0.3)',
                                    flex: 1, // Toma la mitad del espacio
                                    width: 'auto',
                                    justifyContent: 'center',
                                    padding: '0.85rem 0.5rem',
                                    border: 'none',
                                    borderRadius: '1rem',
                                    fontWeight: '700',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}
                            >
                                {isLimitReached ? <AlertCircle size={18} /> : <Wand2 size={18} />}
                                <span style={{fontSize: '0.85rem'}}>{isLimitReached ? 'Límite' : (isPlanExpired ? 'Nuevo Plan' : 'Rotar Platos')}</span>
                            </button>

                            <button
                                onClick={handleDownloadShoppingList}
                                className="new-plan-btn"
                                style={{
                                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                    color: 'white',
                                    cursor: 'pointer',
                                    boxShadow: '0 10px 20px -5px rgba(16, 185, 129, 0.3)',
                                    flex: 1, // Toma la mitad del espacio
                                    width: 'auto',
                                    justifyContent: 'center',
                                    padding: '0.85rem 0.5rem',
                                    border: 'none',
                                    borderRadius: '1rem',
                                    fontWeight: '700',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}
                            >
                                <ShoppingCart size={18} />
                                <span style={{fontSize: '0.85rem'}}>Exportar PDF</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* --- MACROS & CALORIES SUMMARY ROW --- */}
            <div style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
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
                <div style={{ flex: 2 }}>
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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

                            return displayMeals.map((meal, index) => {
                                const isSkippedLunch = meal.isSkipped;
                                const isLiked = meal.name ? !!likedMeals[meal.name] : false;

                                if (isSkippedLunch) {
                                    if (isPremium) {
                                        return (
                                            <div key={index} style={{
                                                background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.8), rgba(219, 234, 254, 0.5))',
                                                padding: '1.5rem',
                                                borderRadius: '1.5rem',
                                                border: '2px dashed #93C5FD',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '1.5rem',
                                                color: '#1E40AF',
                                                boxShadow: '0 4px 15px -5px rgba(59, 130, 246, 0.1)',
                                                flexWrap: 'wrap'
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
                                        <div key={index} style={{
                                            background: 'rgba(239, 246, 255, 0.6)',
                                            padding: '1.5rem',
                                            borderRadius: '1rem',
                                            border: '1px dashed #3B82F6',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
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
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    fontSize: '0.75rem', color: '#64748B', background: '#F1F5F9',
                                                    padding: '2px 8px', borderRadius: '4px', marginBottom: '0.75rem', fontWeight: 600,
                                                    border: '1px solid #E2E8F0'
                                                }}>
                                                    <Clock size={12} /> {meal.prep_time}
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
                                                    disabled={regeneratingId === index}
                                                    style={{
                                                        background: '#FFF7ED',
                                                        border: '1.5px solid #FED7AA',
                                                        borderRadius: '50%',
                                                        width: 44, height: 44,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: regeneratingId === index ? 'wait' : 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    title="No me gusta (Cambiar con IA)"
                                                >
                                                    <RefreshCw
                                                        size={20}
                                                        color="#EA580C"
                                                        className={regeneratingId === index ? "spin-fast" : ""}
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
                <div style={{ flex: 1, minWidth: '300px' }}>

                    {/* Insights Card */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.5) 100%)',
                        backdropFilter: 'blur(12px)',
                        padding: '1.75rem',
                        borderRadius: '2rem',
                        border: '1px solid white',
                        marginBottom: '2rem',
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02)'
                    }}>
                        <h3 style={{
                            fontSize: '1.2rem', fontWeight: 800, color: '#0F172A',
                            marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem'
                        }}>
                            <div style={{ background: '#F0F9FF', padding: '0.4rem', borderRadius: '0.75rem', color: '#0284C7' }}>
                                <Lightbulb size={22} strokeWidth={2.5} />
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
                                    icon = <Brain size={20} />;
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
                flexShrink: 0
            }}>
                <Icon size={24} strokeWidth={2.5} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <div className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', lineHeight: 1, letterSpacing: '-0.02em' }}>
                        {value}
                    </div>
                    {unit && (
                        <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, paddingLeft: '5px' }}>
                            {unit}
                        </div>
                    )}
                </div>
                <div className="stat-label" style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
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