import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { Navigate, useNavigate } from 'react-router-dom';
import { Utensils, ArrowLeft, Clock, ChefHat, Share2, Flame, CheckCircle2, Download, Leaf } from 'lucide-react';
import { motion } from 'framer-motion';
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

const Recipes = () => {
    const { planData, formData } = useAssessment();
    const navigate = useNavigate();
    const contentRef = useRef(null);
    const [activeDayIndex, setActiveDayIndex] = useState(0);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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

    const handleDownloadPDF = (elementId = null, customFilename = null) => {
        let element = contentRef.current;
        let finalFilename = customFilename || 'MealfitRD-Recetas.pdf';
        
        // Determinar opciones en base a si es 1 sola receta o todas
        const isSingleRecipe = !!elementId;

        if (isSingleRecipe) {
            element = document.getElementById(elementId);
        }

        if (!element) return;

        // Opciones base
        const opt = {
            margin: isSingleRecipe ? [0.25, 0.25, 0.25, 0.25] : [0.75, 0.5, 0.75, 0.5],
            filename: finalFilename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                scrollY: 0,
                windowWidth: 1024,
            },
            // Si es individual, forzamos un formato alto y desactivamos por completo los quiebres de página
            jsPDF: isSingleRecipe 
                   ? { unit: 'in', format: [10, 15], orientation: 'portrait' } // Formato muy largo para que no corte
                   : { unit: 'in', format: 'letter', orientation: 'portrait' },
            pagebreak: isSingleRecipe
                       ? { mode: 'avoid-all' } 
                       : { mode: ['css', 'avoid-all'] }
        };

        const toastId = toast.loading(isSingleRecipe ? 'Generando receta rescalada en 1 página...' : 'Generando PDF estructurado...');

        html2pdf().set(opt).from(element).toPdf().get('pdf').then(function (pdf) {
            const totalPages = pdf.internal.getNumberOfPages();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'bold');

                const textMealfit = "Mealfit";
                const textR = "R";
                const textD = "D";

                const wMealfit = pdf.getTextWidth(textMealfit);
                const wR = pdf.getTextWidth(textR);
                const wD = pdf.getTextWidth(textD);

                const marginX = 0.5;
                const marginY = 0.3;

                let currentX = pageWidth - marginX - wD;
                const y = pageHeight - marginY;

                pdf.setTextColor(244, 63, 94);
                pdf.text(textD, currentX, y);

                currentX -= wR;
                pdf.setTextColor(79, 70, 229);
                pdf.text(textR, currentX, y);

                currentX -= wMealfit;
                pdf.setTextColor(15, 23, 42);
                pdf.text(textMealfit, currentX, y);
            }
        }).save().then(() => {
            toast.dismiss(toastId);
            toast.success('PDF descargado correctamente');
        }).catch((err) => {
            console.error(err);
            toast.dismiss(toastId);
            toast.error('Error al generar el PDF');
        });
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
            <div style={{ maxWidth: '850px', margin: '0 auto', paddingBottom: '4rem' }}>



                {/* Contenido Imprimible */}
                <div ref={contentRef} id="recipes-pdf-content" style={{ position: 'relative', zIndex: 1, paddingBottom: isMobile ? '0' : '2rem' }}>
                    <AmbientBackground />
                    {/* Hero Section */}
                    <motion.div
                        data-html2canvas-ignore="true"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ marginBottom: isMobile ? '2.5rem' : '3.5rem', textAlign: 'center', position: 'relative', zIndex: 2 }}
                    >
                        <div style={{
                            margin: '0 auto 1rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Utensils size={isMobile ? 36 : 40} strokeWidth={2.5} color="#4F46E5" />
                        </div>
                        <h1 style={{
                            fontSize: isMobile ? '1.9rem' : '2.1rem', fontWeight: 900, color: '#0F172A',
                            marginBottom: '0.75rem', letterSpacing: '-0.03em', lineHeight: 1.1,
                            paddingBottom: '0.2em'
                        }}>
                            Tus Recetas
                        </h1>
                        <p style={{ color: '#475569', fontSize: isMobile ? '1.05rem' : '1.1rem', maxWidth: '500px', margin: '0 auto', lineHeight: 1.5, padding: isMobile ? '0 1rem' : '0' }}>
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
                                    background: 'rgba(255, 255, 255, 0.7)',
                                    backdropFilter: 'blur(12px)',
                                    WebkitBackdropFilter: 'blur(12px)',
                                    padding: isMobile ? '0.5rem' : '1rem',
                                    borderRadius: '1.25rem',
                                    border: '1px solid rgba(255, 255, 255, 0.5)',
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
                                            borderRadius: isMobile ? '0.75rem' : '0.85rem',
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
                                            padding: isMobile ? '1.5rem' : '2rem',
                                            paddingBottom: '1.5rem',
                                            borderBottom: '1px solid #F1F5F9',
                                            position: 'relative',
                                            background: 'linear-gradient(to bottom, #F8FAFC, white)',
                                            borderRadius: isMobile ? '1.5rem 1.5rem 0 0' : '2rem 2rem 0 0',
                                            pageBreakInside: 'avoid',
                                            breakInside: 'avoid'
                                        }}>
                                            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: '1.25rem', gap: '0.75rem' }}>
                                                {/* Grupo Izquierdo: Etiquetas (Desayuno y Calorías) */}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <div style={{
                                                        textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em',
                                                        color: '#4F46E5', background: '#E0E7FF',
                                                        padding: '0.35rem 0.85rem', borderRadius: '99px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                                    }}>
                                                        {meal.meal}
                                                    </div>
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                                                        padding: '0.35rem 0.85rem', background: '#FFF7ED',
                                                        borderRadius: '99px', border: '1px solid #FFEDD5',
                                                        fontSize: '0.65rem', fontWeight: 700, color: '#EA580C'
                                                    }}>
                                                        <Flame size={14} fill="#F97316" strokeWidth={0} />
                                                        {meal.cals} kcal
                                                    </div>
                                                </div>

                                                {/* Botón de Acción a la derecha o abajo en móvil */}
                                                <button 
                                                    data-html2canvas-ignore="true"
                                                    onClick={() => handleDownloadPDF(`recipe-card-${index}`, `Receta-${meal.name.replace(/\s+/g, '-')}.pdf`)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                                        padding: isMobile ? '0.6rem 0.85rem' : '0.4rem 0.85rem', background: '#F8FAFC',
                                                        borderRadius: '99px', border: '1px solid #E2E8F0',
                                                        fontSize: isMobile ? '0.75rem' : '0.7rem', fontWeight: 600, color: '#64748B',
                                                        cursor: 'pointer', transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#4F46E5'; e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.background = '#EEF2FF' }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B'; e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#F8FAFC' }}
                                                >
                                                    <Download size={14} strokeWidth={2.5} /> Descargar
                                                </button>
                                            </div>
                                            <h2 style={{
                                                fontSize: isMobile ? '1.05rem' : '1.25rem', fontWeight: 900, color: '#0F172A',
                                                margin: 0, lineHeight: 1.2, maxWidth: '100%',
                                                letterSpacing: '-0.02em'
                                            }}>
                                                {meal.name}
                                            </h2>
                                        </div>

                                        {/* Content Body */}
                                        <div style={{ padding: isMobile ? '1.5rem' : '2rem' }}>
                                            {/* Description Box */}
                                                <div style={{
                                                    background: '#F8FAFC', padding: '1.25rem 1.5rem', borderRadius: '0.75rem',
                                                    marginBottom: '2rem',
                                                    borderLeft: '4px solid #4F46E5',
                                                    pageBreakInside: 'avoid',
                                                    breakInside: 'avoid'
                                                }}>
                                                    <p style={{
                                                        color: '#64748B', margin: 0, fontStyle: 'italic',
                                                        fontSize: '0.95rem', lineHeight: 1.7
                                                    }}>
                                                    "{meal.desc}"
                                                </p>
                                            </div>

                                            {/* Ingredients Box */}
                                            {meal.ingredients && meal.ingredients.length > 0 && (
                                                <div style={{ marginBottom: '2.5rem' }}>
                                                    <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <div style={{ background: '#ECFDF5', padding: '0.5rem', borderRadius: '0.5rem', color: '#10B981', display: 'flex' }}>
                                                            <Leaf size={18} strokeWidth={2.5} />
                                                        </div>
                                                        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
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
                                                                color: '#475569', fontSize: '0.95rem',
                                                                background: '#FFFFFF', padding: '0.875rem 1.25rem', borderRadius: '0.5rem',
                                                                border: '1px solid #E2E8F0',
                                                                pageBreakInside: 'avoid',
                                                                breakInside: 'avoid'
                                                            }}>
                                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />
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
