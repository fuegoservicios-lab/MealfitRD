import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { Navigate, useNavigate } from 'react-router-dom';
import { Utensils, ArrowLeft, Clock, ChefHat, Share2, Flame, CheckCircle2, Download, Leaf, Play, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import React, { useRef, useState, useEffect } from 'react';
import html2pdf from 'html2pdf.js';

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
                return <strong key={i} style={{ color: '#0F172A', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    return (
        <div style={{
            display: 'flex', gap: '1rem',
            padding: sectionTitle ? '1.25rem' : '1rem 0.5rem',
            background: sectionTitle ? 'white' : 'transparent',
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
                color: 'white', fontWeight: 700, fontSize: '0.9rem',
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
                    margin: 0, color: '#475569',
                    fontSize: '0.95rem', lineHeight: 1.7
                }}>
                    {parseBold(content.replace(/^\d+[\.\)]\s*/, ''))}
                </p>
            </div>
        </div>
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

    const FormattedLargeStep = ({ text }) => {
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
                if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ color: '#0F172A', fontWeight: 800 }}>{part.slice(2, -2)}</strong>;
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
                    <div style={{ width: isMobile ? '64px' : '80px', height: isMobile ? '64px' : '80px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? '2rem' : '2.5rem', fontWeight: 900, boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.4)' }}>
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
                        <div style={{ width: isMobile ? '64px' : '80px', height: isMobile ? '64px' : '80px', background: '#DCFCE7', borderRadius: '50%', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle2 size={isMobile ? 32 : 40} strokeWidth={3} />
                        </div>
                        <h3 style={{ color: '#16A34A', fontSize: isMobile ? '1.5rem' : '1.8rem', fontWeight: 900, margin: 0 }}>¡Plato Terminado!</h3>
                    </motion.div>
                )}
            </motion.div>
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(255, 255, 255, 0.98)', zIndex: 9999, display: 'flex', flexDirection: 'column',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            }}
        >
            <div style={{ padding: isMobile ? '1.25rem 1rem' : '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', gap: '1rem' }}>
                <div style={{ flex: 1, paddingRight: isMobile ? '0' : '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.25rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>{recipe.name}</h3>
                    <p style={{ margin: 0, color: '#64748B', fontWeight: 600, fontSize: '0.9rem', marginTop: '0.25rem' }}>Paso {currentStep + 1} de {steps.length}</p>
                </div>
                <button 
                    onClick={onClose}
                    style={{ flexShrink: 0, background: '#F1F5F9', border: 'none', width: isMobile ? '40px' : '48px', height: isMobile ? '40px' : '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#E2E8F0'; e.currentTarget.style.color = '#0F172A'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#64748B'; }}
                >
                    <X size={isMobile ? 20 : 24} strokeWidth={2.5} />
                </button>
            </div>
            
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '1.5rem 1rem' : '2rem', overflowY: 'auto' }}>
                <AnimatePresence mode="wait">
                    <FormattedLargeStep text={steps[currentStep]} />
                </AnimatePresence>
            </div>

            <div style={{ padding: isMobile ? '1rem' : '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'stretch', background: 'white', borderTop: '1px solid #F1F5F9', boxShadow: '0 -10px 20px rgba(0,0,0,0.02)' }}>
                <button 
                    onClick={handlePrev} disabled={isFirstStep}
                    style={{ 
                        opacity: isFirstStep ? 0.3 : 1, pointerEvents: isFirstStep ? 'none' : 'auto',
                        padding: isMobile ? '1rem 0.5rem' : '1rem 1.5rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '1rem',
                        display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#475569', fontWeight: 700, fontSize: isMobile ? '1rem' : '1.1rem', cursor: 'pointer', transition: 'all 0.2s',
                        maxWidth: isMobile ? 'none' : '200px'
                    }}
                >
                    <ChevronLeft size={isMobile ? 20 : 24} /> Anterior
                </button>
                {isLastStep ? (
                    <button 
                        onClick={async () => {
                            if(onComplete) {
                                setIsSubmitting(true);
                                await onComplete(recipe);
                                setIsSubmitting(false);
                            } else {
                                onClose();
                            }
                        }}
                        disabled={isSubmitting}
                        style={{ 
                            padding: isMobile ? '1rem 0.5rem' : '1rem 2rem', background: '#10B981', border: 'none', borderRadius: '1rem',
                            display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'white', fontWeight: 800, fontSize: isMobile ? '1rem' : '1.1rem', cursor: isSubmitting ? 'wait' : 'pointer',
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
                            padding: isMobile ? '1rem 0.5rem' : '1rem 2rem', background: '#4F46E5', border: 'none', borderRadius: '1rem',
                            display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'white', fontWeight: 800, fontSize: isMobile ? '1rem' : '1.1rem', cursor: 'pointer',
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
    const { planData, formData } = useAssessment();
    const navigate = useNavigate();
    const contentRef = useRef(null);
    const [activeDayIndex, setActiveDayIndex] = useState(0);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [cookingRecipe, setCookingRecipe] = useState(null);

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

            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/diary/consumed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    user_id: formData.id,
                    meal_name: recipe.name,
                    calories: recipe.cals || 0,
                    protein: 0,
                    carbs: 0,
                    healthy_fats: 0
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
            opacity: 0.8
        }}>
            <div style={{
                position: 'absolute', top: '-5%', left: '-15%', width: '500px', height: '500px',
                background: 'radial-gradient(circle, rgba(219, 234, 254, 0.7) 0%, rgba(255,255,255,0) 70%)', // Blue-100
                filter: 'blur(60px)', transform: 'translateZ(0)', borderRadius: '50%'
            }} />
            <div style={{
                position: 'absolute', top: '5%', right: '-20%', width: '400px', height: '400px',
                background: 'radial-gradient(circle, rgba(237, 233, 254, 0.7) 0%, rgba(255,255,255,0) 70%)', // Violet-100
                filter: 'blur(60px)', transform: 'translateZ(0)', borderRadius: '50%'
            }} />
            <div style={{
                position: 'absolute', top: '25%', left: '10%', width: '600px', height: '600px',
                background: 'radial-gradient(circle, rgba(224, 231, 255, 0.5) 0%, rgba(255,255,255,0) 70%)', // Indigo-100
                filter: 'blur(60px)', transform: 'translateZ(0)', borderRadius: '50%'
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
        <DashboardLayout>
            <AnimatePresence>
                {cookingRecipe && <CookingModeOverlay recipe={cookingRecipe} onClose={() => setCookingRecipe(null)} onComplete={handleLogConsumption} />}
            </AnimatePresence>
            <div style={{ maxWidth: '850px', margin: '0 auto', paddingBottom: '4rem' }}>



                {/* Contenido Imprimible */}
                <div ref={contentRef} id="recipes-pdf-content" style={{ position: 'relative', zIndex: 1, paddingBottom: isMobile ? '0' : '2rem' }}>
                    <AmbientBackground />
                    {/* Hero Section */}
                    <motion.div
                        data-html2canvas-ignore="true"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ paddingTop: isMobile ? '2.5rem' : '3.5rem', marginBottom: isMobile ? '2.5rem' : '3.5rem', textAlign: 'center', position: 'relative', zIndex: 2 }}
                    >
                        <div style={{
                            margin: '0 auto 1.5rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <div style={{ 
                                background: 'white', padding: isMobile ? '1.25rem' : '1.5rem', 
                                borderRadius: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', border: '1px solid rgba(255,255,255,0.8)'
                            }}>
                                <Utensils size={isMobile ? 44 : 52} strokeWidth={2.5} color="#4F46E5" />
                            </div>
                        </div>
                        <h1 style={{
                            fontSize: isMobile ? '2.2rem' : '2.8rem', fontWeight: 900, color: '#0F172A',
                            marginBottom: '1rem', letterSpacing: '-0.03em', lineHeight: 1.1
                        }}>
                            Tus Recetas
                        </h1>
                        <p style={{ color: '#475569', fontSize: isMobile ? '1.1rem' : '1.25rem', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6, padding: isMobile ? '0 1.5rem' : '0' }}>
                            Aquí tienes el paso a paso detallado para preparar tus comidas personalizadas y alcanzar tus objetivos.
                        </p>
                    </motion.div>

                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        style={{ display: 'flex', flexDirection: 'column', gap: '3.5rem' }}
                    >
                        {/* TAB SELECTOR PARA OPCIONES */}
                        {planData.days && planData.days.length > 1 && (
                            <div 
                                data-html2canvas-ignore="true"
                                style={{
                                    display: 'flex',
                                    gap: isMobile ? '0.5rem' : '1rem',
                                    marginBottom: '0.5rem',
                                    justifyContent: 'center',
                                    background: 'rgba(255, 255, 255, 0.85)',
                                    backdropFilter: 'blur(12px)',
                                    WebkitBackdropFilter: 'blur(12px)',
                                    padding: isMobile ? '0.75rem' : '1rem',
                                    borderRadius: '99px',
                                    border: '1px solid rgba(255, 255, 255, 1)',
                                    boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.05)',
                                    position: 'relative', zIndex: 2
                                }}>
                                {planData.days.map((dayObj, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setActiveDayIndex(idx)}
                                        style={{
                                            flex: 1,
                                            padding: isMobile ? '0.75rem 0.25rem' : '1rem',
                                            borderRadius: '99px',
                                            border: activeDayIndex === idx ? 'none' : '1px solid #E2E8F0',
                                            background: activeDayIndex === idx ? '#3B82F6' : 'white',
                                            color: activeDayIndex === idx ? 'white' : '#475569',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            fontSize: isMobile ? '0.9rem' : '1rem',
                                            lineHeight: 1.2,
                                            boxShadow: activeDayIndex === idx ? '0 10px 20px -5px rgba(59, 130, 246, 0.4)' : '0 2px 4px rgba(0,0,0,0.02)',
                                            transform: activeDayIndex === idx ? 'translateY(-2px)' : 'translateY(0)',
                                            display: 'flex',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: isMobile ? '0.35rem' : '0.5rem',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        <span>Opción</span>
                                        <span>{String.fromCharCode(65 + idx)}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {(() => {
                            const planDays = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
                            // Prevent out of bounds if array changes
                            const currentDayIndex = Math.min(activeDayIndex, planDays.length - 1);
                            const dayObj = planDays[currentDayIndex];
                            const dayIdx = currentDayIndex;

                            if (!dayObj) return null;

                            return (
                            <div key={`day-${dayIdx}`} style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                                {dayObj.meals?.filter(meal => {
                                    if (formData?.skipLunch) {
                                        const isLunch = meal.meal.toLowerCase().includes('almuerzo') || meal.name.toLowerCase().includes('lunch');
                                        return !isLunch;
                                    }
                                    return true;
                                }).map((meal, index) => (
                                    <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                                        {/* HTML2PDF Forced Page Break between recipes */}
                                        {index > 0 && <div className="html2pdf__page-break" />}
                                        <motion.div
                                            id={`recipe-card-${index}`}
                                            variants={itemVariants}
                                            style={{
                                                background: 'white',
                                                borderRadius: isMobile ? '1.5rem' : '2rem',
                                                border: '1px solid rgba(255,255,255,0.8)', // Subtle border
                                                overflow: 'visible', // Changed from hidden to avoid PDF render bugs
                                                boxShadow: '0 20px 40px -10px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02)', // Premium shadow
                                                position: 'relative',
                                                zIndex: 2
                                            }}
                                        >
                                            {/* Card Header with Floating Action */}
                                        <div style={{
                                            padding: isMobile ? '2rem 1.5rem' : '2.5rem 3rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '1.5rem'
                                        }}>
                                            {/* Tags Centered */}
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                                <div style={{
                                                    textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em',
                                                    color: '#4F46E5', background: '#EEF2FF',
                                                    padding: '0.4rem 1rem', borderRadius: '99px', display: 'flex', alignItems: 'center'
                                                }}>
                                                    {meal.meal}
                                                </div>
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                                    padding: '0.4rem 1rem', background: '#FFF7ED',
                                                    borderRadius: '99px', border: '1px solid #FFEDD5',
                                                    fontSize: '0.75rem', fontWeight: 800, color: '#EA580C'
                                                }}>
                                                    <Flame size={14} fill="#F97316" strokeWidth={0} />
                                                    {meal.cals} kcal
                                                </div>
                                            </div>

                                            {/* Action Buttons Centered */}
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                                {meal.recipe && meal.recipe.length > 0 && (
                                                    <button 
                                                        data-html2canvas-ignore="true"
                                                        onClick={() => setCookingRecipe(meal)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                                            padding: isMobile ? '0.75rem 1.5rem' : '0.65rem 1.5rem', background: '#4F46E5',
                                                            borderRadius: '99px', border: 'none',
                                                            fontSize: isMobile ? '0.9rem' : '0.85rem', fontWeight: 800, color: 'white',
                                                            cursor: 'pointer', transition: 'all 0.2s',
                                                            boxShadow: '0 8px 16px -4px rgba(79, 70, 229, 0.4)'
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)' }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
                                                    >
                                                        <Play size={18} fill="white" /> Cocinar
                                                    </button>
                                                )}
                                                <button 
                                                    data-html2canvas-ignore="true"
                                                    onClick={() => handleDownloadPDF(meal)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                                        padding: isMobile ? '0.75rem 1.5rem' : '0.65rem 1.5rem', background: 'white',
                                                        borderRadius: '99px', border: '1px solid #E2E8F0',
                                                        fontSize: isMobile ? '0.9rem' : '0.85rem', fontWeight: 700, color: '#64748B',
                                                        cursor: 'pointer', transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#4F46E5'; e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.background = '#EEF2FF' }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B'; e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = 'white' }}
                                                >
                                                    <Download size={18} strokeWidth={2.5} /> Descargar
                                                </button>
                                            </div>

                                            {/* Recipe Title */}
                                            <h2 style={{
                                                fontSize: isMobile ? '1.5rem' : '1.8rem', fontWeight: 900, color: '#0F172A',
                                                margin: 0, lineHeight: 1.25, letterSpacing: '-0.02em', textAlign: 'left'
                                            }}>
                                                {meal.name}
                                            </h2>

                                            {/* Description Callout */}
                                            <div style={{
                                                background: '#F8FAFC', padding: '1.25rem 1.5rem', borderRadius: '1rem',
                                                borderLeft: '4px solid #4F46E5',
                                                pageBreakInside: 'avoid', breakInside: 'avoid',
                                                marginTop: '0.5rem'
                                            }}>
                                                <p style={{
                                                    color: '#64748B', margin: 0, fontStyle: 'italic',
                                                    fontSize: '1.05rem', lineHeight: 1.6
                                                }}>
                                                    "{meal.desc}"
                                                </p>
                                            </div>

                                            {/* Ingredients Box */}
                                            {meal.ingredients && meal.ingredients.length > 0 && (
                                                <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                                                    <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <div style={{ background: '#ECFDF5', padding: '0.5rem', borderRadius: '0.75rem', color: '#10B981', display: 'flex' }}>
                                                            <Leaf size={24} strokeWidth={2.5} />
                                                        </div>
                                                        <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                                                            Ingredientes
                                                        </h3>
                                                    </div>
                                                    <ul style={{ 
                                                        listStyle: 'none', padding: 0, margin: 0,
                                                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' 
                                                    }}>
                                                        {meal.ingredients.map((ing, idx) => (
                                                            <li key={idx} style={{ 
                                                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                                color: '#475569', fontSize: '0.95rem', fontWeight: 600,
                                                                background: '#FFFFFF', padding: '0.875rem 1.25rem', borderRadius: '0.75rem',
                                                                border: '1px solid #E2E8F0',
                                                                pageBreakInside: 'avoid', breakInside: 'avoid'
                                                            }}>
                                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />
                                                                <span>{ing}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
                                                <div style={{ background: '#FFF7ED', padding: '0.5rem', borderRadius: '0.5rem', color: '#EA580C', display: 'flex' }}>
                                                    <ChefHat size={18} strokeWidth={2.5} />
                                                </div>
                                                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                                                    Instrucciones de Preparación
                                                </h3>
                                            </div>

                                            {meal.recipe && meal.recipe.length > 0 ? (
                                                <div style={{ position: 'relative', paddingLeft: '0.5rem' }}>
                                                    {/* Vertical Timeline Line */}
                                                    <div style={{
                                                        position: 'absolute', left: '23px', top: '16px', bottom: '24px',
                                                        width: '2px', background: '#E2E8F0', zIndex: 0
                                                    }} />

                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                                        {meal.recipe.map((step, i) => (
                                                            <FormattedRecipeStep key={i} step={step} index={i} />
                                                        ))}
                                                    </div>

                                                    {/* Completion Indicator */}
                                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem', position: 'relative', zIndex: 1, alignItems: 'center' }}>
                                                        <div style={{
                                                            width: '32px', height: '32px',
                                                            background: '#DCFCE7', borderRadius: '50%',
                                                            color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            flexShrink: 0
                                                        }}>
                                                            <CheckCircle2 size={16} strokeWidth={2.5} />
                                                        </div>
                                                        <div style={{ color: '#16A34A', fontWeight: 700, fontSize: '0.65rem' }}>
                                                            ¡Listo para servir!
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{
                                                    textAlign: 'center', padding: '3rem',
                                                    background: '#F8FAFC', borderRadius: '1rem', border: '1px dashed #E2E8F0'
                                                }}>
                                                    <ChefHat size={32} color="#94A3B8" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                                    <p style={{ color: '#64748B', margin: 0 }}>
                                                        No hay pasos detallados disponibles. Guíate de la descripción general.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                    </div>
                                ))}
                            </div>
                            );
                        })()}
                    </motion.div>
                </div>
            </div>
        </DashboardLayout>
    );
};

export default Recipes;
