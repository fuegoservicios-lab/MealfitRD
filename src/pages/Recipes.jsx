import { useAssessment } from '../context/AssessmentContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { Utensils, ArrowLeft, Clock, ChefHat, Share2, Flame, CheckCircle2, Download, Leaf, Play, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import React, { useRef, useState, useEffect } from 'react';
// [P2-LAZY-PDF · 2026-05-13] html2pdf.js (976 KB) importado dinámico
// dentro del handler `handleDownloadPDF` — ver `await import('html2pdf.js')`
// más abajo. Mismo patrón que Dashboard.jsx para evitar eager load del
// chunk a usuarios que solo navegan recetas sin descargar PDF.
import { fetchWithAuth, API_BASE } from '../config/api';
// [P-RECIPES-CHUNK-WINDOW] Helpers chunk-aware extraídos a utils para
// reutilizar desde otras páginas (Plan.jsx, Dashboard.jsx) y testear
// independientemente. Sincronizados con `split_with_absorb` del backend.
import { parseStartLocal, findChunkContaining } from '../utils/chunkWindow';
// [P2-AUDIT-2 · 2026-05-15] Helper SSOT para escapar texto del LLM antes de
// interpolarlo en `generateRecipeHTML`. html2pdf renderiza el htmlString en
// un iframe detached vía html2canvas — sin escape, prompt injection
// adversarial via meal.name/desc/recipe podría inyectar `<script>` que
// ejecuta en ese contexto y exfiltra tokens de localStorage. Defense-in-depth
// análoga al test blanket que cubre Dashboard.jsx (P1-PDF-XSS-AUDITED).
// Anchor: P2-AUDIT-2.
import { escapeHtml } from '../utils/escapeHtml';
// [P3-AUDIT-1 · 2026-05-15] Telemetría success/failure del PDF de recetas
// individual, análoga a la que P3-SHOPPING-4 instrumentó en Dashboard.jsx
// para el PDF de lista de compras. Antes este handler no emitía ningún
// event — operador no podía distinguir "feature no usado" de "feature
// roto" (ambos producen 0 success events). Anchor: P3-AUDIT-1.
import { trackEvent } from '../utils/analytics';
// [P2-NEW-3 · 2026-05-11] Tras `/api/plans/recipe/expand` exitoso, el
// backend persiste `expanded_recipe` en `plan_data` (vía
// `update_meal_plan_data` server-side). Los caches del Historial
// (lessonsDetail, coherenceHistory, blockedReasons, chunkMetrics) NO
// se enteran del cambio porque su TTL=30min — el modal del Historial
// seguiría mostrando data pre-expand por hasta 30min. Invalidamos
// caches per-plan para que el próximo render del modal refetchee.
// Mismo helper SSOT que usa History.jsx en sus mutaciones.
import { invalidateCachesForPlan } from '../utils/historyCaches';
import EmptyState from '../components/common/EmptyState';

const FormattedRecipeStep = ({ step, index }) => {
    // 1. Identificar si es una sección especial (Mise en place, Fuego, Montaje)
    const getSectionInfo = (text) => {
        const lowerText = text.toLowerCase();
        if (lowerText.startsWith("mise en place:")) return { title: "Mise en place", color: "#00B4D8", icon: <ChefHat /> };
        if (lowerText.startsWith("el toque de fuego:") || lowerText.startsWith("toque de fuego:")) return { title: "El Toque de Fuego", color: "#F97316", icon: <Flame /> };
        if (lowerText.startsWith("montaje:")) return { title: "Montaje", color: "#8B5CF6", icon: <Utensils /> };
        return null;
    };

    const sectionInfo = getSectionInfo(step);
    const sectionTitle = sectionInfo ? sectionInfo.title : null;
    const sectionColor = sectionInfo ? sectionInfo.color : null;
    const icon = sectionInfo ? sectionInfo.icon : null;

    // 2. Extraer el contenido real del paso (quitando el título de la sección y los números iniciales)
    let content = step;
    if (sectionTitle) {
        // Remover el título de la sección (ej. "Mise en place:", "El Toque de Fuego:")
        // Usamos una Regex para ser flexibles con espacios o minúsculas/mayúsculas
        const prefixRegex = sectionTitle.toLowerCase() === "toque de fuego" || sectionTitle.toLowerCase() === "el toque de fuego"
            ? /(el )?toque de fuego:\s*/i
            : new RegExp(`${sectionTitle}:\s*`, 'i');
        content = content.replace(prefixRegex, '');
    }

    // Parse bold text
    const parseBold = (text) => {
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} style={{ color: 'var(--text-main)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    return (
        <div style={{
            display: 'flex', gap: '1rem',
            padding: sectionTitle ? '1.25rem' : '1rem 0.5rem',
            background: sectionTitle ? 'var(--bg-card)' : 'transparent',
            borderRadius: sectionTitle ? '0.75rem' : '0',
            border: sectionTitle ? `1px solid ${sectionColor}30` : 'none',
            boxShadow: sectionTitle ? `0 4px 12px -2px ${sectionColor}15` : 'none',
            pageBreakInside: 'avoid',
            breakInside: 'avoid',
            position: 'relative',
            zIndex: sectionTitle ? 2 : 1
        }}>
            {/* Step Number Badge or Section Icon */}
            <div style={{
                width: '32px', height: '32px',
                background: sectionTitle ? sectionColor : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                borderRadius: '50%',
                color: 'var(--bg-card)', fontWeight: 700, fontSize: '0.9rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                border: 'none',
                boxShadow: 'none',
                marginTop: '0.2rem'
            }}>
                {sectionTitle ? (
                    icon && React.cloneElement(icon, { size: 16, strokeWidth: 2.5 })
                ) : (
                    index + 1
                )}
            </div>

            {/* Step Text */}
            <div style={{ paddingTop: '0', flex: 1 }}>
                {sectionTitle && (
                    <h4 style={{
                        margin: '0 0 0.25rem 0',
                        color: sectionColor,
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}>
                        {sectionTitle}
                    </h4>
                )}
                <p style={{
                    margin: 0, color: 'var(--text-muted)',
                    fontSize: '0.95rem', lineHeight: 1.7
                }}>
                    {parseBold(content.replace(/^\d+[\.\)]\s*/, ''))}
                </p>
            </div>
        </div>
    );
};

const FormattedLargeStep = ({ text, currentStep, isLastStep, isMobile }) => {
    const getSectionInfo = (t) => {
        const lowerT = t.toLowerCase();
        if (lowerT.startsWith("mise en place:")) return { title: "Mise en place", color: "#00B4D8", icon: <ChefHat size={32} /> };
        if (lowerT.startsWith("el toque de fuego:") || lowerT.startsWith("toque de fuego:")) return { title: "El Toque de Fuego", color: "#F97316", icon: <Flame size={32} /> };
        if (lowerT.startsWith("montaje:")) return { title: "Montaje", color: "#8B5CF6", icon: <Utensils size={32} /> };
        return null;
    };

    const sectionInfo = getSectionInfo(text);
    const sectionTitle = sectionInfo ? sectionInfo.title : null;
    let content = text;
    if (sectionTitle) {
        const prefixRegex = sectionTitle.toLowerCase() === "toque de fuego" || sectionTitle.toLowerCase() === "el toque de fuego"
            ? /(el )?toque de fuego:\s*/i : new RegExp(`${sectionTitle}:\s*`, 'i');
        content = content.replace(prefixRegex, '');
    }

    const parseBold = (str) => {
        const parts = str.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ color: 'var(--text-main)', fontWeight: 800 }}>{part.slice(2, -2)}</strong>;
            return part;
        });
    };

    return (
        <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? '1.5rem' : '2rem' }}
        >
            {sectionTitle ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: isMobile ? '64px' : '80px', height: isMobile ? '64px' : '80px', borderRadius: '50%', background: `${sectionInfo.color}15`, color: sectionInfo.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {React.cloneElement(sectionInfo.icon, { size: isMobile ? 28 : 32 })}
                    </div>
                    <h2 style={{ color: sectionInfo.color, fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                        {sectionTitle}
                    </h2>
                </div>
            ) : (
                <div style={{ width: isMobile ? '64px' : '80px', height: isMobile ? '64px' : '80px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)', color: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? '2rem' : '2.5rem', fontWeight: 900, boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.4)' }}>
                    {currentStep + 1}
                </div>
            )}
            <p style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', lineHeight: 1.6, color: '#1E293B', fontWeight: 500, margin: 0, maxWidth: '800px', padding: '0 1rem' }}>
                {parseBold(content.replace(/^\d+[\.\)]\s*/, ''))}
            </p>
            {isLastStep && (
                <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring' }}
                    style={{ marginTop: isMobile ? '1rem' : '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}
                >
                    <div style={{ width: isMobile ? '64px' : '80px', height: isMobile ? '64px' : '80px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '50%', color: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle2 size={isMobile ? 32 : 40} strokeWidth={3} />
                    </div>
                    <h3 style={{ color: 'var(--secondary)', fontSize: isMobile ? '1.5rem' : '1.8rem', fontWeight: 900, margin: 0 }}>¡Plato Terminado!</h3>
                </motion.div>
            )}
        </motion.div>
    );
};

const CookingModeOverlay = ({ recipe, onClose, onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    if (!recipe || !recipe.recipe || recipe.recipe.length === 0) return null;

    const steps = recipe.recipe;
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === steps.length - 1;

    const handleNext = () => { if (!isLastStep) setCurrentStep(prev => prev + 1); };
    const handlePrev = () => { if (!isFirstStep) setCurrentStep(prev => prev - 1); };


    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'var(--bg-page)', zIndex: 9999, display: 'flex', flexDirection: 'column',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(10px)',
            }}
        >
            <div style={{ padding: isMobile ? '1.25rem 1rem' : '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', gap: '1rem' }}>
                <div style={{ flex: 1, paddingRight: isMobile ? '0' : '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.25rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.3 }}>{recipe.name}</h3>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', marginTop: '0.25rem' }}>Paso {currentStep + 1} de {steps.length}</p>
                </div>
                <button
                    onClick={onClose}
                    style={{ flexShrink: 0, background: 'var(--bg-page)', border: 'none', width: isMobile ? '40px' : '48px', height: isMobile ? '40px' : '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-page)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                    <X size={isMobile ? 20 : 24} strokeWidth={2.5} />
                </button>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '1.5rem 1rem' : '2rem', overflowY: 'auto' }}>
                <AnimatePresence mode="wait">
                    <FormattedLargeStep text={steps[currentStep]} currentStep={currentStep} isLastStep={isLastStep} isMobile={isMobile} />
                </AnimatePresence>
            </div>

            <div style={{ padding: isMobile ? '1rem' : '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'stretch', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', boxShadow: '0 -10px 20px rgba(0,0,0,0.02)' }}>
                <button
                    onClick={handlePrev} disabled={isFirstStep}
                    style={{
                        opacity: isFirstStep ? 0.3 : 1, pointerEvents: isFirstStep ? 'none' : 'auto',
                        padding: isMobile ? '1rem 0.5rem' : '1rem 1.5rem', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '1rem',
                        display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontWeight: 700, fontSize: isMobile ? '1rem' : '1.1rem', cursor: 'pointer', transition: 'all 0.2s',
                        maxWidth: isMobile ? 'none' : '200px'
                    }}
                >
                    <ChevronLeft size={isMobile ? 20 : 24} /> Anterior
                </button>
                {isLastStep ? (
                    <button
                        onClick={async () => {
                            if (onComplete) {
                                setIsSubmitting(true);
                                await onComplete(recipe);
                                setIsSubmitting(false);
                            } else {
                                onClose();
                            }
                        }}
                        disabled={isSubmitting}
                        style={{
                            padding: isMobile ? '1rem 0.5rem' : '1rem 2rem', background: 'var(--secondary)', border: 'none', borderRadius: '1rem',
                            display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--bg-card)', fontWeight: 800, fontSize: isMobile ? '1rem' : '1.1rem', cursor: isSubmitting ? 'wait' : 'pointer',
                            boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.4)',
                            opacity: isSubmitting ? 0.7 : 1,
                            maxWidth: isMobile ? 'none' : '300px'
                        }}
                    >
                        <CheckCircle2 size={isMobile ? 20 : 24} /> {isSubmitting ? "Cargando..." : "Terminar"}
                    </button>
                ) : (
                    <button
                        onClick={handleNext}
                        style={{
                            padding: isMobile ? '1rem 0.5rem' : '1rem 2rem', background: 'var(--primary)', border: 'none', borderRadius: '1rem',
                            display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--bg-card)', fontWeight: 800, fontSize: isMobile ? '1rem' : '1.1rem', cursor: 'pointer',
                            boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.4)',
                            maxWidth: isMobile ? 'none' : '200px'
                        }}
                    >
                        Siguiente <ChevronRight size={isMobile ? 20 : 24} />
                    </button>
                )}
            </div>
        </motion.div>
    );
};

const Recipes = () => {
    // [P1-HIST-CLOSE-1 · 2026-05-10] `restorePlan` ya NO se importa aquí.
    // El callsite legacy (`if (restorePlan) restorePlan(planData)` tras
    // expandir una receta, línea ~368 pre-fix) duplicaba el write que ya
    // hace `/api/plans/recipe/expand` server-side (plans.py:2860 →
    // `update_meal_plan_data`). Peor aún: el path legacy de
    // `restorePlan` re-emite `name/calories/macros` desde `planData` en
    // memoria del cliente, valores que NO cambian al expandir una
    // receta y que pueden estar stale (e.g., un chunk worker añadió
    // días entre page-load y cook-click → kcal/macros recalculados
    // server-side; el client write los pisa con el snapshot viejo).
    // El fix es sólo droppear la llamada — el server ya persiste, y
    // localStorage update sigue para consistencia inmediata UI. El
    // mismo bug que P0-HIST-2 cerró para el path Historial (drift
    // top-level cols ↔ plan_data) se reintroducía aquí cada vez que un
    // usuario abría una receta.
    const { planData, formData } = useAssessment();
    const navigate = useNavigate();
    const contentRef = useRef(null);
    const [activeDayIndex, setActiveDayIndex] = useState(0);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [cookingRecipe, setCookingRecipe] = useState(null);
    const [isExpanding, setIsExpanding] = useState(false);
    const [checkedIngredients, setCheckedIngredients] = useState({});
    const [activeMealIndex, setActiveMealIndex] = useState(0);

    // Scroll to top on mount (cuando se navega desde BottomTabBar o sidebar)
    useEffect(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, []);

    // [P-RECIPES-CHUNK-WINDOW] Ventana del chunk que contiene "hoy".
    // ─────────────────────────────────────────────────────────────────────
    // Estos valores DEBEN computarse antes del `useEffect` que los consume
    // (el clamp de abajo) para evitar TDZ. También antes del early-return
    // `if (!planData)` porque las Reglas de Hooks prohíben llamar useEffect
    // condicionalmente — todos los hooks quedan arriba del Navigate.
    // Acceso null-safe via `planData?.…`: si planData es null la primera
    // pasada, los defaults (totalDays=0, chunkStart=0) hacen que el
    // useEffect no escriba state y el componente termine en el Navigate.
    const _planDaysAll = planData?.days || [];
    const _totalDays = _planDaysAll.length;
    const _todayMid = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
    const _startMid = parseStartLocal(planData?.grocery_start_date || planData?.created_at);
    const _daysSinceCreation = Math.max(0, Math.round((_todayMid - _startMid) / 86400000));
    const todayPlanDayIndex = _totalDays > 0
        ? Math.max(0, Math.min(_daysSinceCreation, _totalDays - 1))
        : 0;
    const { start: chunkStart, size: chunkSize } = _totalDays > 0
        ? findChunkContaining(_totalDays, todayPlanDayIndex)
        : { start: 0, size: 0 };
    const chunkDays = _planDaysAll.slice(chunkStart, chunkStart + chunkSize);

    // [P-RECIPES-CHUNK-WINDOW] Clampa `activeDayIndex` (que es GLOBAL en
    // planData.days) al window del chunk activo. Si el usuario llegó a esta
    // página con un index pre-existente fuera del chunk (deeplink, refresh,
    // navegación cruzada), default a `todayPlanDayIndex`.
    useEffect(() => {
        if (!planData?.days || planData.days.length === 0) return;
        const windowEnd = chunkStart + chunkSize;
        if (activeDayIndex < chunkStart || activeDayIndex >= windowEnd) {
            setActiveDayIndex(todayPlanDayIndex);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData?.days, chunkStart, chunkSize, todayPlanDayIndex]);

    const toggleIngredient = (idx) => {
        setCheckedIngredients(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const handleCookClick = async (meal) => {
        setCheckedIngredients({});
        // Si la receta ya fue expandida previamente (usamos recipeExpandedFlag) la abrimos de una
        if (meal.isExpanded) {
            setCookingRecipe(meal);
            return;
        }

        setIsExpanding(true);
        const loadingToast = toast.loading(`El Chef AI está detallando los pasos para ${meal.name}...`);

        try {
            const userId = formData?.id !== "guest" ? formData?.id : "guest";
            // [P1-HIST-RECIPE-1 · 2026-05-10] Pasar plan_id + (day_index,
            // meal_index) para que el backend persista al plan correcto y
            // a la posición exacta. Sin estos identificadores el backend
            // cae a `get_latest_meal_plan(user_id)` y a match por `name`
            // (legacy), lo que (a) puede persistir al plan equivocado si
            // un chunk worker insertó uno nuevo entre cook-click y request,
            // y (b) en planes con la misma receta repetida solo expandía
            // la primera ocurrencia, quemando cuota LLM en clicks
            // posteriores. Los 3 campos son OPCIONALES y el backend tiene
            // fallback a la lógica legacy.
            const planId = planData?.id;
            const dayIndex = activeDayIndex;
            const mealIndex = activeMealIndex;
            const response = await fetchWithAuth('/api/plans/recipe/expand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...meal,
                    user_id: userId,
                    plan_id: planId,
                    day_index: typeof dayIndex === 'number' ? dayIndex : undefined,
                    meal_index: typeof mealIndex === 'number' ? mealIndex : undefined,
                })
            });

            const data = await response.json();
            if (response.ok && data.success && data.expanded_recipe) {
                // Mutamos el objeto de manera local para no tener que llamar a un dispatch del contexto
                // (O podríamos simplemente pasarle el override al modal)
                const expandedMeal = { ...meal, recipe: data.expanded_recipe, isExpanded: true };
                // Mutamos también el objeto in-place para que React lo vea a lo largo del árbol
                meal.recipe = data.expanded_recipe;
                meal.isExpanded = true;

                // [P1-HIST-CLOSE-1 · 2026-05-10] Solo localStorage. El
                // server-side persist lo hace `/api/plans/recipe/expand`
                // (plans.py:2860 → `update_meal_plan_data`) en la MISMA
                // request que devolvió `expanded_recipe`. Antes este
                // bloque llamaba `restorePlan(planData)` adicionalmente,
                // duplicando el write y arrastrando `name/calories/
                // macros` posiblemente stale del cliente al server (un
                // chunk worker que añadió días entre page-load y
                // cook-click recalcula kcal; el client write los pisa).
                if (planData) {
                    try {
                        localStorage.setItem('mealfit_plan', JSON.stringify(planData));
                    } catch (e) { console.error("Error setting plan to LS:", e); }
                }

                // [P2-NEW-3 · 2026-05-11] Invalidar caches del Historial para
                // este plan_id. Sin esto, el modal del Historial podría
                // mostrar receta pre-expand hasta 30min (TTL del cache).
                // Solo se invoca cuando hay `planId` real — guest plans
                // ni planes legacy no tienen caches asociados.
                if (planId) {
                    try {
                        invalidateCachesForPlan(planId);
                    } catch (e) {
                        console.warn('[P2-NEW-3] invalidate cache falló:', e);
                    }
                }

                toast.success('¡Instrucciones de chef listas!', { id: loadingToast });
                setCookingRecipe(expandedMeal);
            } else {
                toast.error(data.detail || 'No se pudo expandir la receta. Abriendo original.', { id: loadingToast });
                setCookingRecipe(meal);
            }
        } catch (error) {
            console.error("Error expanding recipe:", error);
            toast.error('Hubo un error de conexión.', { id: loadingToast });
            setCookingRecipe(meal);
        } finally {
            setIsExpanding(false);
        }
    };

    const handleLogConsumption = async (recipe) => {
        if (!formData || !formData.id || formData.id === 'guest') {
            toast.error("Inicia sesión para registrar tus comidas.");
            setCookingRecipe(null);
            return;
        }

        const toastId = toast.loading(`Registrando ${recipe.name}...`);
        try {
            const token = localStorage.getItem('supabase.auth.token');
            let jwt = "";
            if (token) {
                const parsed = JSON.parse(token);
                jwt = parsed?.currentSession?.access_token || parsed?.access_token || token;
            }

            const response = await fetch(`${API_BASE}/api/diary/consumed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    user_id: formData.id,
                    meal_name: recipe.name,
                    calories: recipe.cals || 0,
                    protein: recipe.protein || 0,
                    carbs: recipe.carbs || 0,
                    healthy_fats: recipe.fats || 0
                }),
            });

            if (!response.ok) {
                throw new Error("Error on API");
            }

            toast.success(`¡"${recipe.name}" registrada exitosamente!`, { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error("No se pudo registrar la comida. Intenta de nuevo.", { id: toastId });
        } finally {
            setCookingRecipe(null);
        }
    };

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Ambient background shapes for premium mobile view
    const AmbientBackground = () => (
        <div data-html2canvas-ignore="true" style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
            overflow: 'hidden', zIndex: 0, pointerEvents: 'none',
            opacity: 1
        }}>
            <div style={{
                position: 'absolute', top: '-10%', left: '-10%', width: '60vw', height: '60vw',
                background: 'radial-gradient(circle at center, var(--primary) 0%, transparent 60%)',
                filter: 'blur(100px)', transform: 'translateZ(0)', borderRadius: '50%', opacity: 0.15
            }} />
            <div style={{
                position: 'absolute', top: '20%', right: '-10%', width: '40vw', height: '40vw',
                background: 'radial-gradient(circle at center, var(--secondary) 0%, transparent 60%)',
                filter: 'blur(100px)', transform: 'translateZ(0)', borderRadius: '50%', opacity: 0.1
            }} />
            <div style={{
                position: 'absolute', top: '60%', left: '10%', width: '50vw', height: '50vw',
                background: 'radial-gradient(circle at center, var(--accent) 0%, transparent 60%)',
                filter: 'blur(80px)', transform: 'translateZ(0)', borderRadius: '50%', opacity: 0.05
            }} />
        </div>
    );

    // Protección de Ruta. La computación del chunk se movió arriba del
    // useEffect de clamp (P-RECIPES-CHUNK-WINDOW); la guard sigue funcionando
    // igual porque chunkStart/Size/Days tienen defaults seguros para planData=null.
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    const generateRecipeHTML = (meal) => {
        // [P2-AUDIT-2 · 2026-05-15] `escapeHtml` aplicado a TODAS las
        // interpolaciones de texto proveniente del LLM (meal.name, meal.desc,
        // meal.meal, meal.cals, recipe steps, ingredients). `parseBold`
        // post-escape convierte el patrón **bold** del LLM en `<strong>` —
        // hacer el bold DESPUÉS del escape garantiza que `<strong>` legítimo
        // queda intacto pero cualquier `<script>` adversarial ya fue
        // escapado a `&lt;script&gt;`. `color` (sectionTitle determinístico
        // de mapping local) NO escapado intencionalmente; los demás
        // `${...}` ahora pasan por `escapeHtml`.
        const stepsHTML = meal.recipe ? meal.recipe.map((step, i) => {
            let sectionTitle = "";
            let color = "#475569";
            let content = step;
            const lowerT = (typeof step === 'string' ? step : '').toLowerCase();
            if (lowerT.startsWith("mise en place:")) { sectionTitle = "Mise en place"; color = "#00B4D8"; }
            if (lowerT.startsWith("el toque de fuego:") || lowerT.startsWith("toque de fuego:")) { sectionTitle = "El Toque de Fuego"; color = "#F97316"; }
            if (lowerT.startsWith("montaje:")) { sectionTitle = "Montaje"; color = "#8B5CF6"; }

            if (sectionTitle) {
                const prefixRegex = sectionTitle.toLowerCase() === "toque de fuego" || sectionTitle.toLowerCase() === "el toque de fuego"
                    ? /(el )?toque de fuego:\s*/i : new RegExp(`${sectionTitle}:\s*`, 'i');
                content = content.replace(prefixRegex, '');
            }

            // [P2-AUDIT-2] Bold parser opera sobre el texto YA escapado:
            // `**foo**` → `<strong>foo</strong>`. Si la LLM hubiera emitido
            // `**<script>**`, el escape previo lo convirtió en
            // `**&lt;script&gt;**` → bold parser produce
            // `<strong>&lt;script&gt;</strong>` — visible como texto, no
            // ejecutado.
            const parseBoldEscaped = (raw) => escapeHtml(raw).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

            return `
                <div style="margin-bottom: 20px; page-break-inside: avoid;">
                    ${sectionTitle ? `
                        <div style="color: ${color}; font-size: 14pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                            ${escapeHtml(sectionTitle)}
                        </div>
                    ` : `
                        <div style="color: #4F46E5; font-size: 14pt; font-weight: bold; margin-bottom: 8px;">
                            Paso ${i + 1}
                        </div>
                    `}
                    <div style="font-size: 13pt; line-height: 1.6; color: #334155;">
                        ${parseBoldEscaped(content.replace(/^\d+[\.\)]\s*/, ''))}
                    </div>
                </div>
            `;
        }).join('') : '';

        const ingredientsHTML = meal.ingredients ? meal.ingredients.map(ing => `
            <li style="margin-bottom: 8px; font-size: 12pt; color: #475569; display: flex; align-items: flex-start; line-height: 1.4;">
                <span style="color: #10B981; margin-right: 8px; font-weight: bold;">•</span> ${escapeHtml(ing)}
            </li>
        `).join('') : '';

        return `
            <div style="width: 100%; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; padding: 0; box-sizing: border-box;">
                <!-- HEADER -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #4F46E5; padding-bottom: 15px; margin-bottom: 25px;">
                    <div>
                        <div style="font-size: 24pt; font-weight: 900; color: #0F172A; letter-spacing: -0.5px;">
                            Mealfit<span style="color: #4F46E5;">R</span><span style="color: #F43F5E;">D</span>
                        </div>
                        <div style="font-size: 11pt; color: #64748B; margin-top: 4px; font-weight: 500;">Receta Exclusiva</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="background: #EEF2FF; color: #4F46E5; padding: 6px 14px; border-radius: 20px; font-size: 11pt; font-weight: 700; display: inline-block; margin-bottom: 6px;">
                            ${escapeHtml(meal.meal)}
                        </div>
                        <div style="color: #F97316; font-size: 11pt; font-weight: bold;">
                            🔥 ${escapeHtml(meal.cals)} kcal
                        </div>
                    </div>
                </div>

                <!-- TITLE & DESC -->
                <div style="margin-bottom: 30px;">
                    <h1 style="font-size: 26pt; font-weight: 900; color: #0F172A; margin: 0 0 10px 0; line-height: 1.2;">${escapeHtml(meal.name)}</h1>
                    <p style="font-size: 13pt; color: #64748B; margin: 0; line-height: 1.5;">${escapeHtml(meal.desc || '')}</p>
                </div>

                <div style="display: flex; gap: 30px; align-items: flex-start;">
                    <!-- INGREDIENTS SIDEBAR -->
                    <div style="flex: 0 0 250px; background: #F8FAFC; padding: 25px; border-radius: 16px; border: 1px solid #E2E8F0;">
                        <h3 style="font-size: 14pt; font-weight: 800; color: #0F172A; margin: 0 0 15px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px;">Ingredientes</h3>
                        <ul style="list-style: none; padding: 0; margin: 0;">
                            ${ingredientsHTML}
                        </ul>
                    </div>

                    <!-- PREPARATION STEPS -->
                    <div style="flex: 1;">
                        <h3 style="font-size: 16pt; font-weight: 800; color: #0F172A; margin: 0 0 20px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px;">Preparación</h3>
                        ${stepsHTML}
                    </div>
                </div>

                <!-- FOOTER -->
                <div style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #E2E8F0; text-align: center; color: #94A3B8; font-size: 10pt;">
                    Disfruta de tu comida. Generado automáticamente por MealfitRD.
                </div>
            </div>
        `;
    };

    const handleDownloadPDF = async (meal) => {
        const toastId = toast.loading('Generando PDF de alta calidad...');
        try {
            const htmlString = generateRecipeHTML(meal);
            // [P3-AUDIT-1 · 2026-05-15] Filename con discriminador único:
            // `Receta_<meal-name-slug>_<plan_id[:8]>_<YYYY-MM-DD>.pdf`.
            // Pre-fix `Receta-${meal.name}.pdf` colisionaba para 2 recetas
            // del mismo nombre en planes distintos (común: "Pollo guisado"
            // aparece en múltiples planes). Cada PDF descargado sobrescribía
            // al anterior en la carpeta Downloads del usuario. Mismo patrón
            // que P3-SHOPPING-1 (Dashboard PDF) — plan_id[:8] preserva
            // legibilidad sin exponer el UUID completo; fecha discrimina
            // re-descargas del mismo plan en días distintos.
            const _planIdPrefix = (planData?.id || '').toString().slice(0, 8) || 'noid';
            const _today = new Date().toISOString().slice(0, 10);
            const _mealSlug = String(meal?.name || 'receta').replace(/\s+/g, '-');
            const opt = {
                margin: [15, 15, 15, 15],
                filename: `Receta_${_mealSlug}_${_planIdPrefix}_${_today}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2.5, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' }
            };
            // [P2-LAZY-PDF · 2026-05-13] Dynamic import: ver nota en el
            // import section. Chunk html2pdf-*.js solo se fetch al click.
            //
            // [P3-RECIPES-CHUNK-LOAD-FAIL · 2026-05-15] Wrap dedicado para
            // `ChunkLoadError` (Vercel/CDN dropea el chunk en red intermitente,
            // o rotación de build invalida el hash mientras la pestaña vive).
            // Sin esto el outer try/catch muestra "Error al descargar PDF" —
            // mensaje genérico que confunde al usuario. Mensaje específico
            // sugiere refresh + retry, lo que arregla el caso.
            let html2pdf;
            try {
                html2pdf = (await import('html2pdf.js')).default;
            } catch (importErr) {
                toast.dismiss(toastId);
                const _msg = String(importErr?.message || '');
                if (
                    importErr?.name === 'ChunkLoadError' ||
                    /loading chunk|failed to fetch dynamically imported/i.test(_msg)
                ) {
                    toast.error('Error de red al cargar el PDF. Refresca la página e intenta de nuevo.');
                } else {
                    toast.error('No se pudo cargar el generador de PDF. Refresca la página e intenta de nuevo.');
                }
                return;
            }
            // [P1-AUDIT-2 · 2026-05-15] Timeout sobre html2pdf().save().
            // Patrón canónico replicado de Dashboard.jsx P2-PDF-OBS-2: el audit
            // 2026-05-14 cerró el hang en Dashboard pero olvidó este segundo
            // callsite. Bug observado (raro pero reproducible): html2canvas
            // cuelga indefinido en iOS Safari con recetas hyper-densas
            // (recipe con ≥20 pasos + ingredients largos) o si la pestaña
            // pierde foco durante un render largo. La promise nunca resuelve →
            // `toast.dismiss(toastId)` nunca corre → usuario no puede retry
            // sin refresh.
            //
            // Fix: Promise.race contra un timeout (default 60s, knob
            // `VITE_PDF_RENDER_TIMEOUT_MS` con clamp [15s, 180s]). Si dispara,
            // lanza `PdfRenderTimeout` que el catch existente captura. Mismo
            // knob que Dashboard — SRE puede subirlo sin redeploy si recetas
            // legítimas exceden 60s.
            const _rawTimeoutKnob = parseInt(import.meta.env.VITE_PDF_RENDER_TIMEOUT_MS, 10);
            let _pdfRenderTimeoutMs = Number.isFinite(_rawTimeoutKnob) ? _rawTimeoutKnob : 60000;
            if (_pdfRenderTimeoutMs < 15000) _pdfRenderTimeoutMs = 15000;
            if (_pdfRenderTimeoutMs > 180000) _pdfRenderTimeoutMs = 180000;
            let _pdfTimeoutHandle = null;
            const _pdfTimeoutPromise = new Promise((_resolve, reject) => {
                _pdfTimeoutHandle = setTimeout(() => {
                    const _timeoutErr = new Error(`html2pdf no completó en ${_pdfRenderTimeoutMs}ms`);
                    _timeoutErr.name = 'PdfRenderTimeout';
                    reject(_timeoutErr);
                }, _pdfRenderTimeoutMs);
            });
            try {
                await Promise.race([
                    html2pdf().set(opt).from(htmlString, 'string').save(),
                    _pdfTimeoutPromise,
                ]);
            } finally {
                if (_pdfTimeoutHandle) clearTimeout(_pdfTimeoutHandle);
            }
            toast.dismiss(toastId);
            toast.success('Receta descargada correctamente');
            // [P3-AUDIT-1 · 2026-05-15] Telemetría success. Análoga a
            // `pdf_download_success` en Dashboard (P3-SHOPPING-4) pero para
            // recetas individuales — permite calcular adoption rate del
            // feature recipe-PDF vs el shopping-list PDF. `recipe_steps` y
            // `ingredients_count` ayudan a discriminar bursts de recetas
            // hyper-densas que se acercan al timeout límite.
            try {
                trackEvent('recipe_pdf_download_success', {
                    plan_id: planData?.id,
                    meal_name: String(meal?.name || '').slice(0, 64),
                    meal_type: meal?.meal,
                    recipe_steps: Array.isArray(meal?.recipe) ? meal.recipe.length : 0,
                    ingredients_count: Array.isArray(meal?.ingredients) ? meal.ingredients.length : 0,
                    is_expanded: !!meal?.isExpanded,
                });
            } catch (_telSuccessErr) {
                // No-op: telemetría best-effort.
            }
        } catch (error) {
            console.error(error);
            toast.dismiss(toastId);
            toast.error('Error al generar PDF');
            // [P3-AUDIT-1 · 2026-05-15] Telemetría failure. `error_name` y
            // `error_message` truncados a 64/200 chars para evitar payloads
            // gigantes en GA/PostHog (algunos backends cortan a 256). `name`
            // distingue timeouts (`PdfRenderTimeout` de P1-AUDIT-2) de
            // errores reales del render.
            try {
                const _errName = (error && error.name) ? String(error.name).slice(0, 64) : 'UnknownError';
                const _errMsg = (error && error.message) ? String(error.message).slice(0, 200) : '';
                trackEvent('recipe_pdf_download_failed', {
                    plan_id: planData?.id,
                    meal_name: String(meal?.name || '').slice(0, 64),
                    meal_type: meal?.meal,
                    error_name: _errName,
                    error_message: _errMsg,
                });
            } catch (_telFailErr) {
                // No-op: telemetría best-effort.
            }
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: { type: 'spring', stiffness: 100 }
        }
    };

    return (
        <>
            <AnimatePresence>
                {cookingRecipe && <CookingModeOverlay recipe={cookingRecipe} onClose={() => setCookingRecipe(null)} onComplete={handleLogConsumption} />}
            </AnimatePresence>
            <div style={{ maxWidth: '850px', margin: '0 auto', paddingBottom: '4rem', overflowX: 'hidden', width: '100%', boxSizing: 'border-box' }}>

                <div ref={contentRef} style={{ position: 'relative', zIndex: 1, paddingBottom: isMobile ? '0' : '2rem', overflow: 'hidden', maxWidth: '100%' }}>
                    <AmbientBackground />

                    <div className="recipe-book-wrapper" style={{
                        padding: isMobile ? '1.25rem 1rem' : '2.5rem 2rem 2.5rem 4.5rem',
                        marginTop: isMobile ? '0.5rem' : '3.5rem',
                        minWidth: 0,
                        maxWidth: '100%',
                        boxSizing: 'border-box'
                    }}>

                        <style>{`
                            .meal-hover-card {
                                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                            }
                            .meal-hover-card:not(.active):hover {
                                box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.08) !important;
                                transform: translateY(-2px) scale(1.02) !important;
                            }
                            .meal-hover-card.active:hover {
                                box-shadow: 0 12px 28px -6px rgba(0, 0, 0, 0.15) !important;
                            }
                        `}</style>

                        {/* DAY SELECTOR — limitado al chunk activo (3 ó 4 días)
                            según `split_with_absorb`. Sin chunk-aware se mostraban
                            TODOS los días del plan aunque el usuario solo tenga
                            recetas válidas para el chunk actual. */}
                        {chunkDays.length > 1 && (
                            <div
                                data-html2canvas-ignore="true"
                                style={{
                                    display: 'flex', gap: isMobile ? '0.35rem' : '1rem',
                                    justifyContent: 'center', background: 'var(--bg-page)',
                                    padding: isMobile ? '0.35rem' : '0.75rem', borderRadius: '99px',
                                    border: '1px solid var(--border)',
                                    position: 'relative', zIndex: 2, margin: '0'
                                }}>
                                {chunkDays.map((dayObj, localIdx) => {
                                    const globalIdx = chunkStart + localIdx;
                                    const isActive = activeDayIndex === globalIdx;
                                    return (
                                        <button
                                            key={globalIdx}
                                            onClick={() => { setActiveDayIndex(globalIdx); setActiveMealIndex(0); setCheckedIngredients({}); }}
                                            style={{
                                                flex: 1, padding: isMobile ? '0.6rem 0.15rem' : '0.85rem 1rem', width: isMobile ? 'auto' : '120px',
                                                borderRadius: '99px',
                                                border: isActive ? 'none' : '1px solid transparent',
                                                background: isActive ? 'var(--primary)' : 'transparent',
                                                color: isActive ? 'var(--bg-card)' : 'var(--text-muted)',
                                                fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                fontSize: isMobile ? '0.8rem' : '1rem',
                                                boxShadow: isActive ? '0 4px 10px -2px rgba(0, 0, 0, 0.15)' : 'none',
                                                transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
                                            }}
                                        >
                                            {(() => {
                                                // Día = grocery_start_date + globalIdx. Antes el código
                                                // usaba "today + localIdx" lo que producía nombres
                                                // incorrectos cuando el chunk no empieza en hoy o el
                                                // plan llevaba días corriendo (P-RECIPES-CHUNK-WINDOW).
                                                const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                                                const d = new Date(_startMid.getTime());
                                                d.setDate(d.getDate() + globalIdx);
                                                return diasSemana[d.getDay()];
                                            })()}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {(() => {
                            const planDays = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
                            // [P-RECIPES-CHUNK-WINDOW] Clamp inline al window
                            // del chunk antes que el useEffect corra. Sin esto,
                            // el primer render con `activeDayIndex=0` (default
                            // useState) podía mostrar día de chunk anterior por
                            // un tick si chunkStart>0.
                            const _windowEnd = chunkStart + chunkSize;
                            const _clampedIdx = Math.max(chunkStart, Math.min(activeDayIndex, _windowEnd - 1));
                            const currentDayIndex = Math.min(_clampedIdx, planDays.length - 1);
                            const dayObj = planDays[currentDayIndex];
                            const validMeals = (dayObj && dayObj.meals) || [];

                            if (!dayObj || validMeals.length === 0) {
                                return (
                                    <EmptyState
                                        icon={ChefHat}
                                        title="Aún no hay recetas para este día"
                                        description="Cuando tu plan esté completo, encontrarás aquí las recetas paso a paso."
                                        cta={{
                                            label: 'Volver al plan',
                                            onClick: () => navigate('/dashboard'),
                                        }}
                                    />
                                );
                            }

                            const currentMealIndex = Math.min(activeMealIndex, validMeals.length - 1);
                            const activeMeal = validMeals[currentMealIndex];

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '1.25rem' : '2rem', position: 'relative', zIndex: 2, minWidth: 0, width: '100%' }}>

                                    {/* MEAL SELECTOR */}
                                    <div data-html2canvas-ignore="true">
                                        {isMobile ? (
                                            /* MOBILE: 2-column mini-cards grid — all visible, tap to select */
                                            <div style={{
                                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem',
                                                padding: '0.2rem', maxWidth: '100%'
                                            }}>
                                                {validMeals.map((meal, index) => {
                                                    const isActive = currentMealIndex === index;
                                                    return (
                                                        <button
                                                            key={index}
                                                            className={`meal-hover-card ${isActive ? 'active' : ''}`}
                                                            onClick={() => { setActiveMealIndex(index); setCheckedIngredients({}); }}
                                                            style={{
                                                                display: 'flex', flexDirection: 'column', gap: '0.3rem',
                                                                padding: '0.75rem 0.85rem',
                                                                borderRadius: '1rem',
                                                                border: isActive ? '1.5px solid var(--text-main)' : '1.5px solid var(--border)',
                                                                background: 'var(--bg-card)',
                                                                color: 'var(--text-main)',
                                                                cursor: 'pointer', textAlign: 'left',
                                                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                boxShadow: isActive
                                                                    ? '0 8px 20px -6px rgba(0, 0, 0, 0.15)'
                                                                    : '0 1px 3px rgba(0,0,0,0.04)',
                                                                transform: isActive ? 'scale(1.02)' : 'scale(1)',
                                                                minWidth: 0, overflow: 'hidden',
                                                            }}
                                                        >
                                                            <span style={{
                                                                fontSize: '0.65rem', fontWeight: 800,
                                                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                                                color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                                                            }}>
                                                                {meal.meal}
                                                            </span>
                                                            <span style={{
                                                                fontSize: '0.85rem', fontWeight: 800, lineHeight: 1.2,
                                                                overflow: 'hidden', textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                                color: 'var(--text-main)',
                                                            }}>
                                                                {meal.name}
                                                            </span>
                                                            <span style={{
                                                                fontSize: '0.7rem', fontWeight: 600,
                                                                color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                                                                display: 'flex', alignItems: 'center', gap: '0.2rem'
                                                            }}>
                                                                <Flame size={10} strokeWidth={2.5} /> {meal.cals} kcal
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            /* DESKTOP: Large cards layout */
                                            <div style={{
                                                display: 'flex', flexWrap: 'wrap',
                                                gap: '1rem', padding: '0.25rem 0'
                                            }}>
                                                {validMeals.map((meal, index) => {
                                                    const isActive = currentMealIndex === index;
                                                    return (
                                                        <div
                                                            key={index}
                                                            className={`meal-hover-card ${isActive ? 'active' : ''}`}
                                                            onClick={() => { setActiveMealIndex(index); setCheckedIngredients({}); }}
                                                            style={{
                                                                flex: '1 1 auto', minWidth: '150px',
                                                                background: isActive ? 'var(--bg-card)' : 'var(--bg-page)',
                                                                borderRadius: '1.5rem', padding: '1.25rem',
                                                                border: isActive ? '2px solid var(--text-main)' : '1px solid var(--border)',
                                                                boxShadow: isActive ? '0 10px 25px -5px rgba(0, 0, 0, 0.1)' : 'none',
                                                                cursor: 'pointer', transition: 'all 0.3s',
                                                                transform: isActive ? 'scale(1.02) translateY(-4px)' : 'scale(1)',
                                                                color: 'var(--text-main)',
                                                                display: 'flex', flexDirection: 'column', gap: '0.5rem'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: isActive ? 'var(--text-main)' : 'var(--text-muted)', opacity: isActive ? 1 : 0.8 }}>
                                                                    {meal.meal}
                                                                </span>
                                                                {isActive && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-main)' }} />}
                                                            </div>
                                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-main)' }}>
                                                                {meal.name}
                                                            </h3>
                                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: isActive ? 'var(--text-main)' : 'var(--text-muted)', opacity: isActive ? 1 : 0.8, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                <Flame size={14} color={isActive ? 'var(--text-main)' : 'var(--text-muted)'} strokeWidth={isActive ? 2.5 : 2} /> {meal.cals} kcal
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* ACTIVE MEAL FOCUS AREA */}
                                    <div style={{ padding: '0', minWidth: 0, overflow: 'hidden' }}>
                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key={'meal-' + currentMealIndex}
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                transition={{ type: 'spring', stiffness: 250, damping: 25 }}
                                                style={{
                                                    background: 'transparent', borderRadius: '0', padding: isMobile ? '1.5rem 0' : '2rem 0',
                                                    border: 'none', boxShadow: 'none',
                                                    position: 'relative', zIndex: 10, width: '100%', boxSizing: 'border-box', minWidth: 0, overflow: 'hidden'
                                                }}
                                            >

                                                {/* Header & Badges */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
                                                    <h2 style={{ fontSize: isMobile ? '1.4rem' : '2.8rem', fontWeight: 900, color: 'var(--text-main)', margin: 0, lineHeight: 1.15, letterSpacing: '-0.02em', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                                        {activeMeal.name}
                                                    </h2>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                        {activeMeal.prep_time && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.8rem', background: 'var(--bg-page)', borderRadius: '99px', border: '1px solid var(--border)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                                                <Clock size={14} /> {activeMeal.prep_time}
                                                            </div>
                                                        )}
                                                        {activeMeal.difficulty && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.8rem', background: 'var(--bg-page)', borderRadius: '99px', border: '1px solid var(--border)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                                                <ChefHat size={14} /> {activeMeal.difficulty}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <p style={{ color: 'var(--text-muted)', margin: 0, fontStyle: 'italic', fontSize: isMobile ? '0.95rem' : '1.1rem', lineHeight: 1.6, maxWidth: '600px', wordBreak: 'break-word' }}>
                                                        "{activeMeal.desc}"
                                                    </p>
                                                </div>

                                                {/* Action Bar */}
                                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: isMobile ? '1rem' : '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    {activeMeal.recipe && activeMeal.recipe.length > 0 && (
                                                        <button
                                                            data-html2canvas-ignore="true"
                                                            onClick={() => handleCookClick(activeMeal)}
                                                            disabled={isExpanding}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 1.5rem', background: 'var(--text-main)', borderRadius: '99px', border: 'none', fontSize: '0.9rem', fontWeight: 800, color: 'var(--bg-card)', cursor: isExpanding ? 'wait' : 'pointer', transition: 'all 0.2s', boxShadow: '0 8px 16px -4px rgba(15, 23, 42, 0.4)', opacity: isExpanding ? 0.7 : 1 }}
                                                        >
                                                            <Play size={18} fill="white" /> {isExpanding ? "Generando..." : "Cocinar"}
                                                        </button>
                                                    )}
                                                    <button
                                                        data-html2canvas-ignore="true"
                                                        onClick={() => handleDownloadPDF(activeMeal)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 1.5rem', background: 'var(--bg-page)', borderRadius: '99px', border: '1px solid var(--border)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', cursor: 'pointer', transition: 'all 0.2s' }}
                                                    >
                                                        <Download size={18} strokeWidth={2.5} /> PDF
                                                    </button>
                                                </div>

                                                <hr style={{ border: 'none', borderTop: '1px dashed var(--border)', margin: '2.5rem 0' }} />

                                                {/* Content Split: Macros/Ingredients & Steps */}
                                                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '2rem' : '3rem', alignItems: 'flex-start', minWidth: 0, width: '100%' }}>

                                                    {/* LEFT/TOP COLUMN: Ingredients & Macros */}
                                                    <div style={{ flex: isMobile ? '1 1 auto' : '0 0 320px', width: '100%', position: isMobile ? 'static' : 'sticky', top: '2rem', minWidth: 0 }}>

                                                        {/* Sleek Macros Design */}
                                                        {activeMeal.protein !== undefined && activeMeal.protein > 0 && (
                                                            <div style={{ background: 'var(--bg-page)', borderRadius: '1.25rem', border: '1px solid var(--border)', padding: '1rem', marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--secondary)', textTransform: 'uppercase' }}>PROTEÍNAS</div>
                                                                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)' }}>{activeMeal.protein}<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>g</span></div>
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>CARBOS</div>
                                                                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)' }}>{activeMeal.carbs}<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>g</span></div>
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--danger)', textTransform: 'uppercase' }}>GRASAS</div>
                                                                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)' }}>{activeMeal.fats}<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>g</span></div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Ingredients */}
                                                        {activeMeal.ingredients && activeMeal.ingredients.length > 0 && (
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                                                    <div style={{ width: '8px', height: '24px', background: 'var(--secondary)', borderRadius: '4px' }} />
                                                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>Ingredientes</h3>
                                                                </div>
                                                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                    {activeMeal.ingredients.map((ing, idx) => {
                                                                        const isChecked = checkedIngredients[idx];
                                                                        return (
                                                                            <li key={idx}
                                                                                onClick={() => toggleIngredient(idx)}
                                                                                style={{
                                                                                    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                                                                                    color: isChecked ? 'var(--text-light)' : 'var(--text-main)', fontSize: '0.95rem', fontWeight: 600,
                                                                                    cursor: 'pointer', transition: 'all 0.2s ease', opacity: isChecked ? 0.6 : 1,
                                                                                    textDecoration: isChecked ? 'line-through' : 'none',
                                                                                    padding: '0.5rem 0'
                                                                                }}>
                                                                                <div style={{
                                                                                    width: '24px', height: '24px', borderRadius: '50%',
                                                                                    background: isChecked ? 'var(--secondary)' : 'var(--bg-page)',
                                                                                    border: isChecked ? 'none' : '1px solid var(--border)',
                                                                                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                    transition: 'all 0.2s'
                                                                                }}>
                                                                                    {isChecked && <CheckCircle2 size={14} color="#FFFFFF" strokeWidth={3.5} />}
                                                                                </div>
                                                                                <span style={{ lineHeight: 1.4 }}>{ing}</span>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* RIGHT/BOTTOM COLUMN: Steps */}
                                                    <div style={{ flex: 1, width: '100%', minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                                            <div style={{ width: '8px', height: '24px', background: 'var(--primary)', borderRadius: '4px' }} />
                                                            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>Instrucciones</h3>
                                                        </div>

                                                        {activeMeal.recipe && activeMeal.recipe.length > 0 ? (
                                                            <div style={{ position: 'relative', paddingLeft: '0.25rem' }}>
                                                                <div style={{ position: 'absolute', left: '19px', top: '16px', bottom: '24px', width: '2px', background: 'var(--border)', zIndex: 0 }} />
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                                    {activeMeal.recipe.map((step, i) => (
                                                                        <FormattedRecipeStep key={i} step={step} index={i} />
                                                                    ))}
                                                                </div>
                                                                {/* Completion Indicator */}
                                                                <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem', position: 'relative', zIndex: 1, alignItems: 'center' }}>
                                                                    <div style={{ width: '32px', height: '32px', background: 'var(--secondary)', borderRadius: '50%', color: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)' }}>
                                                                        <CheckCircle2 size={16} strokeWidth={3} />
                                                                    </div>
                                                                    <div style={{ color: 'var(--text-main)', fontWeight: 800, fontSize: '1rem' }}>¡Listo para disfrutar!</div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-page)', borderRadius: '1.5rem', border: '1px dashed var(--border)' }}>
                                                                <ChefHat size={40} color="var(--text-light)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                                                <p style={{ color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>No hay pasos detallados. Guíate de la descripción general.</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                </div>
                                            </motion.div>
                                        </AnimatePresence>
                                    </div>

                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            <style>{`
                .recipe-book-wrapper {
                    background-color: var(--bg-card);
                    border-radius: 0.5rem 1.75rem 1.75rem 0.5rem;
                    border: 1px solid var(--border-light);
                    border-left: 20px solid #1E293B;
                    box-shadow: 4px 4px 0px rgba(0,0,0,0.02), 8px 8px 0px rgba(0,0,0,0.01), 0 25px 50px -12px rgba(0,0,0,0.15), inset 8px 0px 8px -4px rgba(0,0,0,0.2);
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                    position: relative;
                    z-index: 2;
                    overflow: hidden;
                    max-width: 100%;
                }

                .recipe-book-wrapper::before {
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

                @media (max-width: 768px) {
                    .recipe-book-wrapper {
                        border-left: none;
                        border-radius: 1.25rem;
                        gap: 1rem;
                        box-shadow: 0 4px 20px -4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
                        border: 1px solid var(--border);
                    }
                    .recipe-book-wrapper::before {
                        display: none;
                    }
                }
            `}</style>
        </>
    );
};

export default Recipes;
