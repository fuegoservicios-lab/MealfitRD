import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { Navigate, useNavigate } from 'react-router-dom';
import { Utensils, ArrowLeft, Clock, ChefHat, Share2, Flame, CheckCircle2, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useRef } from 'react';
import html2pdf from 'html2pdf.js';

const Recipes = () => {
    const { planData, formData } = useAssessment();
    const navigate = useNavigate();
    const contentRef = useRef(null);

    // Protección de Ruta
    if (!planData) {
        return <Navigate to="/" replace />;
    }


    const handleDownloadPDF = () => {
        const element = contentRef.current;
        const opt = {
            margin: [0.5, 0.5],
            filename: 'MealfitRD-Recetas.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        const toastId = toast.loading('Generando PDF...');

        html2pdf().set(opt).from(element).toPdf().get('pdf').then(function (pdf) {
            const totalPages = pdf.internal.getNumberOfPages();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'bold');

                // Text parts
                const textMealfit = "Mealfit";
                const textR = "R";
                const textD = "D";

                // Calculate widths
                const wMealfit = pdf.getTextWidth(textMealfit);
                const wR = pdf.getTextWidth(textR);
                const wD = pdf.getTextWidth(textD);

                // Start position (Bottom Right)
                const marginX = 0.5;
                const marginY = 0.4;

                let currentX = pageWidth - marginX - wD;
                const y = pageHeight - marginY;

                // Draw "D" (Rose-500)
                pdf.setTextColor(244, 63, 94);
                pdf.text(textD, currentX, y);

                // Draw "R" (Indigo-600)
                currentX -= wR;
                pdf.setTextColor(79, 70, 229);
                pdf.text(textR, currentX, y);

                // Draw "Mealfit" (Dark Navy)
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

                {/* Header de Navegación y Acciones */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                    <button
                        onClick={() => navigate('/dashboard')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: 'white', border: '1px solid var(--border)',
                            color: 'var(--text-muted)', fontWeight: 600,
                            cursor: 'pointer', fontSize: '0.9rem',
                            padding: '0.5rem 1rem', borderRadius: '0.75rem',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        <ArrowLeft size={18} /> Volver al Panel
                    </button>

                    <button
                        onClick={handleDownloadPDF}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                            border: 'none',
                            color: 'white', fontWeight: 600,
                            cursor: 'pointer', fontSize: '0.9rem',
                            padding: '0.5rem 1.25rem', borderRadius: '0.75rem',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(37, 99, 235, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(37, 99, 235, 0.3)';
                        }}
                    >
                        <Download size={18} /> Descargar PDF
                    </button>
                </motion.div>

                {/* Contenido Imprimible */}
                <div ref={contentRef} id="recipes-pdf-content">
                    {/* Hero Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ marginBottom: '3.5rem', textAlign: 'center' }}
                    >
                        <div style={{
                            width: 72, height: 72,
                            background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                            borderRadius: '24px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--primary)', margin: '0 auto 1.5rem',
                            boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.2)'
                        }}>
                            <Utensils size={36} strokeWidth={2} />
                        </div>
                        <h1 style={{
                            fontSize: '2.5rem', fontWeight: 800, color: '#0F172A',
                            marginBottom: '0.75rem', letterSpacing: '-0.02em',
                            paddingBottom: '0.2em'
                        }}>
                            Tus Recetas del Día
                        </h1>
                        <p style={{ color: '#64748B', fontSize: '1.1rem', maxWidth: '500px', margin: '0 auto', lineHeight: 1.6 }}>
                            Aquí tienes el paso a paso detallado para preparar tus comidas personalizadas y alcanzar tus objetivos.
                        </p>
                    </motion.div>

                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}
                    >
                        {planData.perfectDay?.filter(meal => {
                            if (formData?.skipLunch) {
                                const isLunch = meal.meal.toLowerCase().includes('almuerzo') || meal.name.toLowerCase().includes('lunch');
                                return !isLunch;
                            }
                            return true;
                        }).map((meal, index) => (
                            <motion.div
                                key={index}
                                variants={itemVariants}
                                style={{
                                    background: 'white',
                                    borderRadius: '2rem',
                                    border: '1px solid #F1F5F9', // Subtle border
                                    overflow: 'hidden',
                                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02)', // Premium shadow
                                    position: 'relative',
                                    breakInside: 'avoid', // Para evitar cortes en PDF
                                    pageBreakInside: 'avoid'
                                }}
                            >
                                {/* Card Header with Floating Action */}
                                <div style={{
                                    padding: '2rem',
                                    paddingBottom: '1.5rem',
                                    borderBottom: '1px solid #F1F5F9',
                                    position: 'relative',
                                    background: 'linear-gradient(to bottom, #F8FAFC, white)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                        <div style={{
                                            textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em',
                                            color: 'var(--primary)', background: 'rgba(37, 99, 235, 0.1)',
                                            padding: '0.25rem 0.75rem', borderRadius: '99px', display: 'inline-block'
                                        }}>
                                            {meal.meal}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                padding: '0.5rem 1rem', background: 'white',
                                                borderRadius: '99px', border: '1px solid #E2E8F0',
                                                fontSize: '0.85rem', fontWeight: 600, color: '#64748B',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                            }}>
                                                <Flame size={16} fill="#F97316" strokeWidth={0} />
                                                {meal.cals} kcal
                                            </div>
                                        </div>
                                    </div>
                                    <h2 style={{
                                        fontSize: '1.5rem', fontWeight: 800, color: '#0F172A',
                                        margin: 0, lineHeight: 1.3, maxWidth: '90%'
                                    }}>
                                        {meal.name}
                                    </h2>
                                </div>

                                {/* Content Body */}
                                <div style={{ padding: '2rem' }}>
                                    {/* Description Box */}
                                    <div style={{
                                        background: '#F0F9FF',
                                        borderLeft: '4px solid var(--primary)',
                                        padding: '1.25rem', borderRadius: '0.5rem',
                                        marginBottom: '2.5rem'
                                    }}>
                                        <p style={{
                                            color: '#334155', margin: 0, fontStyle: 'italic',
                                            fontSize: '0.95rem', lineHeight: 1.6
                                        }}>
                                            "{meal.desc}"
                                        </p>
                                    </div>

                                    <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ background: '#FFF7ED', padding: '0.4rem', borderRadius: '0.5rem', color: '#EA580C' }}>
                                            <ChefHat size={20} />
                                        </div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                                            Instrucciones de Preparación
                                        </h3>
                                    </div>

                                    {meal.recipe && meal.recipe.length > 0 ? (
                                        <div style={{ position: 'relative', paddingLeft: '1rem' }}>
                                            {/* Vertical Timeline Line */}
                                            <div style={{
                                                position: 'absolute', left: '27px', top: '15px', bottom: '30px',
                                                width: '2px', background: '#E2E8F0', zIndex: 0
                                            }} />

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                                {meal.recipe.map((step, i) => (
                                                    <div key={i} style={{ display: 'flex', gap: '1.5rem', position: 'relative', zIndex: 1 }}>
                                                        {/* Step Number Badge */}
                                                        <div style={{
                                                            width: '36px', height: '36px',
                                                            background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                                                            borderRadius: '50%',
                                                            color: 'white', fontWeight: 700, fontSize: '0.9rem',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            flexShrink: 0,
                                                            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)',
                                                            border: '2px solid white'
                                                        }}>
                                                            {i + 1}
                                                        </div>

                                                        {/* Step Text */}
                                                        <div style={{ paddingTop: '0.25rem' }}>
                                                            <p style={{
                                                                margin: 0, color: '#334155',
                                                                fontSize: '1rem', lineHeight: 1.7
                                                            }}>
                                                                {step.replace(/^\d+[\.\)]\s*/, '')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Completion Indicator */}
                                            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '2rem', position: 'relative', zIndex: 1 }}>
                                                <div style={{
                                                    width: '36px', height: '36px',
                                                    background: '#DCFCE7', borderRadius: '50%',
                                                    color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0, border: '2px solid white',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                                }}>
                                                    <CheckCircle2 size={20} />
                                                </div>
                                                <div style={{ paddingTop: '0.5rem', color: '#16A34A', fontWeight: 600, fontSize: '0.9rem' }}>
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
                        ))}
                    </motion.div>
                </div>
            </div>
        </DashboardLayout>
    );
};

export default Recipes;
