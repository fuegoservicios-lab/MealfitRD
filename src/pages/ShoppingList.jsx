import { useState, useMemo, useRef } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { Navigate, useNavigate } from 'react-router-dom';
import {
    ShoppingCart, ArrowLeft, Download, Check,
    Leaf, Drumstick, Wheat, Milk, Archive, Circle, CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import html2pdf from 'html2pdf.js';

// IMPORTAMOS EL GENERADOR
import { generateShoppingListFromPlan } from '../services/shoppingGenerator';

// --- CONFIGURACIÓN DE CATEGORÍAS ---
const CATEGORIES = [
    {
        id: 'produce',
        label: 'Frutas y Verduras',
        icon: Leaf,
        color: '#16A34A', // Green
        bgColor: '#DCFCE7',
        keywords: ['tomate', 'cebolla', 'ajo', 'ají', 'pimiento', 'lechuga', 'espinaca', 'plátano', 'guineo', 'manzana', 'pera', 'uva', 'limón', 'cilantro', 'perejil', 'batata', 'papa', 'yuca', 'zanahoria', 'brócoli', 'coliflor', 'berenjena', 'calabacín', 'aguacate', 'repollo', 'pepino', 'rúcula', 'kale', 'fresa', 'piña', 'melon', 'sandía', 'chinola', 'remolacha', 'apio']
    },
    {
        id: 'protein',
        label: 'Proteínas y Carnes',
        icon: Drumstick,
        color: '#DC2626', // Red
        bgColor: '#FEE2E2',
        keywords: ['huevo', 'pollo', 'pechuga', 'muslo', 'carne', 'res', 'cerdo', 'pescado', 'atún', 'salmón', 'camarón', 'jamón', 'pavo', 'tofu', 'molida', 'chicharrón', 'longaniza', 'salami', 'bistec', 'chuleta', 'filete']
    },
    {
        id: 'dairy',
        label: 'Lácteos y Refrigerados',
        icon: Milk,
        color: '#2563EB', // Blue
        bgColor: '#EFF6FF',
        keywords: ['leche', 'queso', 'yogurt', 'mantequilla', 'crema', 'natilla', 'helado']
    },
    {
        id: 'pantry',
        label: 'Despensa y Granos',
        icon: Wheat,
        color: '#D97706', // Amber
        bgColor: '#FEF3C7',
        keywords: ['arroz', 'habichuela', 'frijol', 'lenteja', 'garbanzo', 'avena', 'pan', 'tortilla', 'harina', 'pasta', 'espagueti', 'quinoa', 'maiz', 'cereal', 'galleta', 'casabe']
    },
    {
        id: 'other',
        label: 'Otros / Especias / Condimentos',
        icon: Archive,
        color: '#64748B', // Slate
        bgColor: '#F1F5F9',
        keywords: [] // Fallback category
    }
];

const categorizeIngredient = (item) => {
    const lowerItem = item.toLowerCase();

    // Intenta buscar en categorías definidas
    for (const cat of CATEGORIES) {
        if (cat.id === 'other') continue;
        if (cat.keywords.some(k => lowerItem.includes(k))) {
            return cat.id;
        }
    }

    // Si no coincide, va a 'other'
    return 'other';
};

const ShoppingList = () => {
    const { planData } = useAssessment();
    const navigate = useNavigate();
    const contentRef = useRef(null);

    // Estado para los items marcados (usando el nombre del item como key para persistencia simple)
    const [checkedItems, setCheckedItems] = useState({});

    // Generamos la lista plana y luego la categorizamos
    const categorizedList = useMemo(() => {
        if (!planData) return {};

        const flatList = generateShoppingListFromPlan(planData);
        const grouped = {
            produce: [],
            protein: [],
            dairy: [],
            pantry: [],
            other: []
        };

        flatList.forEach(item => {
            const catId = categorizeIngredient(item);
            grouped[catId].push(item);
        });

        // Eliminar categorías vacías para el render
        return Object.fromEntries(Object.entries(grouped).filter(([_, items]) => items.length > 0));

    }, [planData]);

    // Calcular progreso
    const totalItems = Object.values(categorizedList).flat().length;
    const completedItems = Object.keys(checkedItems).filter(k => checkedItems[k]).length;
    const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

    // Protección de Ruta
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    // --- ACCIONES ---
    const toggleItem = (item) => {
        setCheckedItems(prev => ({
            ...prev,
            [item]: !prev[item]
        }));
    };

    const handleDownloadPDF = async () => {
        const element = contentRef.current;
        const opt = {
            // Margin: [Top, Right, Bottom, Left]
            // Aumentamos el margen inferior a 25mm para dejar espacio libre a la marca de agua
            margin: [10, 10, 25, 10],
            filename: 'MealfitRD-Lista-Compras.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        const toastId = toast.loading('Generando PDF...');

        try {
            await html2pdf().set(opt).from(element).toPdf().get('pdf').then((pdf) => {
                const totalPages = pdf.internal.getNumberOfPages();
                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();

                for (let i = 1; i <= totalPages; i++) {
                    pdf.setPage(i);
                    pdf.setFontSize(11);
                    pdf.setFont('helvetica', 'bold');

                    // Watermark: MealfitRD
                    const textMealfit = 'Mealfit';
                    const textR = 'R';
                    const textD = 'D';

                    const widthMealfit = pdf.getTextWidth(textMealfit);
                    const widthR = pdf.getTextWidth(textR);
                    const widthD = pdf.getTextWidth(textD);

                    const totalWidth = widthMealfit + widthR + widthD;
                    const endX = pageWidth - 10; // Alineado al margen derecho (10mm)
                    const startX = endX - totalWidth;
                    const postY = pageHeight - 12; // En el pie de página, dentro del margen de 25mm

                    // Mealfit -> #0F172A
                    pdf.setTextColor(15, 23, 42);
                    pdf.text(textMealfit, startX, postY);

                    // R -> #4F46E5
                    pdf.setTextColor(79, 70, 229);
                    pdf.text(textR, startX + widthMealfit, postY);

                    // D -> #F43F5E
                    pdf.setTextColor(244, 63, 94);
                    pdf.text(textD, startX + widthMealfit + widthR, postY);
                }
            }).save();

            toast.dismiss(toastId);
            toast.success('PDF descargado correctamente');
        } catch (error) {
            console.error(error);
            toast.dismiss(toastId);
            toast.error('Error al generar PDF');
        }
    };

    return (
        <DashboardLayout>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>

                {/* --- HEADER NAVIGATION --- */}
                <div className="no-print" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={() => navigate('/dashboard')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: 'transparent', border: 'none',
                            color: 'var(--text-muted)', fontWeight: 600,
                            cursor: 'pointer', fontSize: '0.9rem',
                            padding: '0.5rem', borderRadius: '0.5rem'
                        }}
                        className="hover-bg-gray"
                    >
                        <ArrowLeft size={18} /> Volver
                    </button>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            onClick={handleDownloadPDF}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                background: 'linear-gradient(135deg, #0F172A 0%, #334155 100%)',
                                border: 'none',
                                padding: '0.6rem 1.2rem', borderRadius: '0.75rem',
                                color: 'white', cursor: 'pointer', fontWeight: 600,
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 10px -2px rgba(0,0,0,0.15)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }}
                        >
                            <Download size={18} /> <span className="hide-mobile">Descargar PDF</span>
                        </button>
                    </div>
                </div>

                {/* --- HEADER TITLE & PROGRESS --- */}
                <div ref={contentRef}>
                    <div className="no-print" style={{ marginBottom: '3rem', textAlign: 'center' }}>
                        <div style={{
                            width: 64, height: 64, background: 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)', borderRadius: '1.5rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#166534', margin: '0 auto 1.5rem',
                            boxShadow: '0 10px 15px -3px rgba(22, 163, 74, 0.2)'
                        }}>
                            <ShoppingCart size={32} />
                        </div>

                        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
                            Lista de Compras Semanal
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '500px', margin: '0 auto 2rem' }}>
                            Cantidades calculadas para tu plan de 7 días.
                        </p>

                        {/* PROGRESS BAR */}
                        {totalItems > 0 && (
                            <div style={{ maxWidth: '400px', margin: '0 auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                                    <span>Progreso</span>
                                    <span>{completedItems}/{totalItems} items</span>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '99px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${progress}%`, height: '100%',
                                        background: 'var(--primary)', borderRadius: '99px',
                                        transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* --- CONTENT LIST --- */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {Object.keys(categorizedList).length > 0 ? (
                            Object.entries(categorizedList).map(([catId, items]) => {
                                const category = CATEGORIES.find(c => c.id === catId);
                                return (
                                    <section key={catId} className="shopping-section" style={{ breakInside: 'avoid' }}>

                                        {/* SECTION HEADER */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem',
                                            paddingBottom: '0.5rem', borderBottom: '2px solid #F1F5F9'
                                        }}>
                                            <div style={{
                                                background: category.bgColor, color: category.color,
                                                padding: '0.4rem', borderRadius: '0.5rem'
                                            }}>
                                                <category.icon size={20} />
                                            </div>
                                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                                                {category.label}
                                            </h2>
                                            <span style={{
                                                background: '#F1F5F9', color: 'var(--text-muted)',
                                                fontSize: '0.75rem', fontWeight: 600, padding: '0.1rem 0.5rem', borderRadius: '99px'
                                            }}>
                                                {items.length}
                                            </span>
                                        </div>

                                        {/* ITEMS GRID */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                                            {items.map((item, idx) => {
                                                const isChecked = !!checkedItems[item];
                                                return (
                                                    <div
                                                        key={`${catId}-${idx}`}
                                                        onClick={() => toggleItem(item)}
                                                        style={{
                                                            background: isChecked ? '#F8FAFC' : 'white',
                                                            border: isChecked ? '1px solid transparent' : '1px solid #E2E8F0',
                                                            borderRadius: '0.75rem',
                                                            padding: '0.75rem 1rem',
                                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s ease',
                                                            opacity: isChecked ? 0.6 : 1,
                                                            boxShadow: isChecked ? 'none' : '0 1px 2px rgba(0,0,0,0.02)'
                                                        }}
                                                        className="shopping-item"
                                                    >
                                                        <div style={{
                                                            minWidth: '22px', height: '22px',
                                                            borderRadius: '6px',
                                                            border: isChecked ? 'none' : '2px solid #CBD5E1',
                                                            background: isChecked ? 'var(--primary)' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            color: 'white', transition: 'all 0.2s', flexShrink: 0
                                                        }}>
                                                            {isChecked && <Check size={14} strokeWidth={3} />}
                                                        </div>
                                                        <span style={{
                                                            fontSize: '0.95rem', fontWeight: isChecked ? 400 : 500,
                                                            color: isChecked ? 'var(--text-muted)' : 'var(--text-main)',
                                                            textDecoration: isChecked ? 'line-through' : 'none'
                                                        }}>
                                                            {item}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                );
                            })
                        ) : (
                            <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                                <div style={{ background: '#F1F5F9', width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#94A3B8' }}>
                                    <ShoppingCart size={32} />
                                </div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                                    Tu lista está vacía
                                </h3>
                                <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>
                                    Genera un nuevo plan de comidas para ver los ingredientes necesarios aquí mágicamente.
                                </p>
                            </div>
                        )}
                    </div>

                </div>
                {/* --- PRINT HEADER (Invisible) --- */}
                <div className="print-only" style={{ display: 'none', marginBottom: '2rem', borderBottom: '2px solid #000', paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h1 style={{ fontSize: '24pt', color: '#000', margin: 0 }}>MealfitRD<span style={{ color: '#4F46E5' }}>.</span></h1>
                        <span style={{ fontSize: '10pt', color: '#666' }}>Lista de Compras Semanal (7 Días)</span>
                    </div>
                </div>

            </div>

            {/* --- PRINT STYLES --- */}
            <style>{`
                @media (max-width: 640px) {
                    .hide-mobile { display: none; }
                }
                .hover-bg-gray:hover { background: #F1F5F9 !important; }

                @media print {
                    @page { margin: 1cm; size: auto; }
                    body { background: white !important; font-size: 11pt; -webkit-print-color-adjust: exact; }
                    .no-print, aside, nav, header { display: none !important; }
                    .container, .main-content { width: 100% !important; margin: 0 !important; padding: 0 !important; display: block !important; }
                    .print-only { display: block !important; }
                    
                    .shopping-section { margin-bottom: 2rem; page-break-inside: avoid; }
                    .shopping-section h2 { border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 10px; font-size: 14pt; }
                    
                    .shopping-item { 
                        border: none !important; 
                        padding: 0.25rem 0 !important; 
                        background: transparent !important;
                        box-shadow: none !important;
                    }
                    .shopping-item div:first-child {
                        border: 1px solid #000 !important;
                        width: 14px !important; height: 14px !important;
                        background: transparent !important; color: transparent !important;
                    }
                }
            `}</style>
        </DashboardLayout>
    );
};

export default ShoppingList;