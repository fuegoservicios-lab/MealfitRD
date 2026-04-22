import { useAssessment } from '../context/AssessmentContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { Utensils, ArrowLeft, Clock, ChefHat, Share2, Flame, CheckCircle2, Download, Leaf, Play, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import React, { useRef, useState, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { fetchWithAuth, API_BASE } from '../config/api';
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
    const { planData, formData, restorePlan } = useAssessment();
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
            const response = await fetchWithAuth('/api/plans/recipe/expand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...meal, user_id: userId })
            });

            const data = await response.json();
            if (response.ok && data.success && data.expanded_recipe) {
                // Mutamos el objeto de manera local para no tener que llamar a un dispatch del contexto
                // (O podríamos simplemente pasarle el override al modal)
                const expandedMeal = { ...meal, recipe: data.expanded_recipe, isExpanded: true };
                // Mutamos también el objeto in-place para que React lo vea a lo largo del árbol
                meal.recipe = data.expanded_recipe;
                meal.isExpanded = true;

                // Forzar persistencia manual en LocalStorage inmediato e impactar la DB (Supabase)
                if (planData) {
                    try {
                        localStorage.setItem('mealfit_plan', JSON.stringify(planData));
                        if (restorePlan) restorePlan(planData);
                    } catch (e) { console.error("Error setting plan to LS/DB:", e); }
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

    // Protección de Ruta
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    const generateRecipeHTML = (meal) => {
        const stepsHTML = meal.recipe ? meal.recipe.map((step, i) => {
            let sectionTitle = "";
            let color = "#475569";
            let content = step;
            const lowerT = step.toLowerCase();
            if (lowerT.startsWith("mise en place:")) { sectionTitle = "Mise en place"; color = "#00B4D8"; }
            if (lowerT.startsWith("el toque de fuego:") || lowerT.startsWith("toque de fuego:")) { sectionTitle = "El Toque de Fuego"; color = "#F97316"; }
            if (lowerT.startsWith("montaje:")) { sectionTitle = "Montaje"; color = "#8B5CF6"; }

            if (sectionTitle) {
                const prefixRegex = sectionTitle.toLowerCase() === "toque de fuego" || sectionTitle.toLowerCase() === "el toque de fuego"
                    ? /(el )?toque de fuego:\s*/i : new RegExp(`${sectionTitle}:\s*`, 'i');
                content = content.replace(prefixRegex, '');
            }

            const parseBold = (str) => str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

            return `
                <div style="margin-bottom: 20px; page-break-inside: avoid;">
                    ${sectionTitle ? `
                        <div style="color: ${color}; font-size: 14pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                            ${sectionTitle}
                        </div>
                    ` : `
                        <div style="color: #4F46E5; font-size: 14pt; font-weight: bold; margin-bottom: 8px;">
                            Paso ${i + 1}
                        </div>
                    `}
                    <div style="font-size: 13pt; line-height: 1.6; color: #334155;">
                        ${parseBold(content.replace(/^\d+[\.\)]\s*/, ''))}
                    </div>
                </div>
            `;
        }).join('') : '';

        const ingredientsHTML = meal.ingredients ? meal.ingredients.map(ing => `
            <li style="margin-bottom: 8px; font-size: 12pt; color: #475569; display: flex; align-items: flex-start; line-height: 1.4;">
                <span style="color: #10B981; margin-right: 8px; font-weight: bold;">•</span> ${ing}
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
                            ${meal.meal}
                        </div>
                        <div style="color: #F97316; font-size: 11pt; font-weight: bold;">
                            🔥 ${meal.cals} kcal
                        </div>
                    </div>
                </div>

                <!-- TITLE & DESC -->
                <div style="margin-bottom: 30px;">
                    <h1 style="font-size: 26pt; font-weight: 900; color: #0F172A; margin: 0 0 10px 0; line-height: 1.2;">${meal.name}</h1>
                    <p style="font-size: 13pt; color: #64748B; margin: 0; line-height: 1.5;">${meal.desc || ''}</p>
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
            const opt = {
                margin: [15, 15, 15, 15],
                filename: `Receta-${meal.name.replace(/\s+/g, '-')}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2.5, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' }
            };
            await html2pdf().set(opt).from(htmlString, 'string').save();
            toast.dismiss(toastId);
            toast.success('Receta descargada correctamente');
        } catch (error) {
            console.error(error);
            toast.dismiss(toastId);
            toast.error('Error al generar PDF');
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

                        {/* Hero Section */}
                        <motion.div
                            data-html2canvas-ignore="true"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{ textAlign: 'center', position: 'relative', zIndex: 2, marginBottom: isMobile ? '0' : '-0.5rem' }}
                        >
                            <h1 style={{
                                fontSize: isMobile ? '1.5rem' : '3.5rem', fontWeight: 900, color: 'var(--text-main)',
                                marginBottom: '0.25rem', letterSpacing: '-0.04em', lineHeight: 1.1, wordBreak: 'break-word'
                            }}>
                                Recetas
                            </h1>
                            <p style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.85rem' : '1.25rem', maxWidth: '600px', margin: '0 auto', lineHeight: 1.5, padding: '0' }}>
                                Tu plan nutricional personalizado, plato por plato.
                            </p>
                        </motion.div>

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

                        {/* DAY SELECTOR */}
                        {planData.days && planData.days.length > 1 && (
                            <div
                                data-html2canvas-ignore="true"
                                style={{
                                    display: 'flex', gap: isMobile ? '0.35rem' : '1rem',
                                    justifyContent: 'center', background: 'var(--bg-page)',
                                    padding: isMobile ? '0.35rem' : '0.75rem', borderRadius: '99px',
                                    border: '1px solid var(--border)',
                                    position: 'relative', zIndex: 2, margin: '0'
                                }}>
                                {planData.days.map((dayObj, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => { setActiveDayIndex(idx); setActiveMealIndex(0); setCheckedIngredients({}); }}
                                        style={{
                                            flex: 1, padding: isMobile ? '0.6rem 0.15rem' : '0.85rem 1rem', width: isMobile ? 'auto' : '120px',
                                            borderRadius: '99px',
                                            border: activeDayIndex === idx ? 'none' : '1px solid transparent',
                                            background: activeDayIndex === idx ? 'var(--primary)' : 'transparent',
                                            color: activeDayIndex === idx ? 'var(--bg-card)' : 'var(--text-muted)',
                                            fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            fontSize: isMobile ? '0.8rem' : '1rem',
                                            boxShadow: activeDayIndex === idx ? '0 4px 10px -2px rgba(0, 0, 0, 0.15)' : 'none',
                                            transform: activeDayIndex === idx ? 'translateY(-1px)' : 'translateY(0)',
                                        }}
                                    >
                                        {String.fromCharCode(65 + idx)}
                                    </button>
                                ))}
                            </div>
                        )}

                        {(() => {
                            const planDays = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
                            const currentDayIndex = Math.min(activeDayIndex, planDays.length - 1);
                            const dayObj = planDays[currentDayIndex];
                            if (!dayObj) return null;

                            const validMeals = dayObj.meals?.filter(meal => {
                                if (formData?.skipLunch) {
                                    const isLunch = meal.meal.toLowerCase().includes('almuerzo') || meal.name.toLowerCase().includes('lunch');
                                    return !isLunch;
                                }
                                return true;
                            }) || [];

                            if (validMeals.length === 0) return null;

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
                                                        <Download size={18} strokeWidth={2.5} /> Receta PDF
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
