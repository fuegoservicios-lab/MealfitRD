import { useState, useMemo, useRef, useEffect } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { Navigate, useNavigate } from 'react-router-dom';
import {
    ShoppingCart, ArrowLeft, Download, Check, ChevronDown, Minus,
    Leaf, Drumstick, Wheat, Milk, Archive, Circle, CheckCircle, Sparkles, X
} from 'lucide-react';
import { toast } from 'sonner';
import html2pdf from 'html2pdf.js';
import { fetchWithAuth } from '../config/api';

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
    const [checkedItems, setCheckedItems] = useState(() => {
        const saved = localStorage.getItem('mealfit_shopping_checks');
        return saved ? JSON.parse(saved) : {};
    });

    // Persist checked items to localStorage
    useEffect(() => {
        localStorage.setItem('mealfit_shopping_checks', JSON.stringify(checkedItems));
    }, [checkedItems]);

    // Estado para días a comprar
    const [daysToShop, setDaysToShop] = useState(7);

    // Estado para ocultar completados
    const [hideCompleted, setHideCompleted] = useState(false);

    // Estado para categorías colapsadas
    const [collapsedCategories, setCollapsedCategories] = useState({});
    const toggleCategory = (catId) => {
        setCollapsedCategories(prev => ({
            ...prev,
            [catId]: !prev[catId]
        }));
    };

    // Estado para items custom añadidos por la IA
    const [customItems, setCustomItems] = useState([]);
    const [loadingCustom, setLoadingCustom] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Obtener userId para el fetch
    const userId = typeof window !== 'undefined' ? localStorage.getItem('mealfit_user_id') : null;

    // Fetch custom shopping items al montar
    useEffect(() => {
        if (!userId || userId === 'guest') return;
        setLoadingCustom(true);
        fetchWithAuth(`/api/shopping/custom/${userId}`)
            .then(res => res.json())
            .then(data => {
                setCustomItems(data.items || []);
                
                // Inicializar checkboxes desde la Base de Datos para persistencia multi-dispositivo
                if (data.items && data.items.length > 0) {
                    setCheckedItems(prev => {
                        const next = { ...prev };
                        data.items.forEach(it => {
                            try {
                                const parsed = JSON.parse(it.item_name);
                                if (parsed && typeof parsed === 'object' && parsed.is_checked !== undefined) {
                                    next[`custom-${it.id}`] = parsed.is_checked;
                                }
                            } catch(e) {}
                        });
                        return next;
                    });
                }
            })
            .catch(err => console.error('Error fetching custom items:', err))
            .finally(() => setLoadingCustom(false));
    }, [userId]);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleDeleteCustomItem = async (itemId) => {
        try {
            await fetchWithAuth(`/api/shopping/custom/${itemId}`, { method: 'DELETE' });
            setCustomItems(prev => prev.filter(i => i.id !== itemId));
            toast.success('Item eliminado de la lista');
        } catch (err) {
            console.error('Error deleting custom item:', err);
            toast.error('Error al eliminar el item');
        }
    };

    const handleAutoGenerate = async () => {
        if (!userId || userId === 'guest') {
            toast.error('Debes iniciar sesión para usar la IA.');
            return;
        }

        const toastId = toast.loading('Calculando ingredientes combinados (puede tardar ~15s)...');
        setIsGenerating(true);

        try {
            const res = await fetchWithAuth('/api/shopping/auto-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'Error al generar lista');
            }

            toast.dismiss(toastId);
            toast.success('¡Ingredientes IA consolidados con éxito!');
            
            // Refrescar lista de items custom
            setLoadingCustom(true);
            const refreshRes = await fetchWithAuth(`/api/shopping/custom/${userId}`);
            const data = await refreshRes.json();
            setCustomItems(data.items || []);
            setCollapsedCategories(prev => ({ ...prev, custom_ai: false })); // Auto-abrir pestaña
            
        } catch (error) {
            console.error('Error auto-generating shopping list:', error);
            toast.dismiss(toastId);
            toast.error(error.message || 'Error de conexión con la IA');
        } finally {
            setIsGenerating(false);
            setLoadingCustom(false);
        }
    };

    // Generamos la lista plana y luego la categorizamos
    const categorizedList = useMemo(() => {
        if (!planData) return {};

        const flatList = generateShoppingListFromPlan(planData, daysToShop);
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

    }, [planData, daysToShop]);

    // Procesar items custom (IA JSON vs legacy)
    const customStructured = useMemo(() => {
        const categories = {};
        const standalone = [];
        
        customItems.forEach(item => {
            try {
                const parsed = JSON.parse(item.item_name);
                if (parsed && parsed.category) {
                    const cat = parsed.category;
                    if (!categories[cat]) categories[cat] = { emoji: parsed.emoji || '🛒', items: [] };
                    categories[cat].items.push({ id: item.id, name: parsed.name, qty: parsed.qty, label: `${parsed.qty} ${parsed.name}`, raw: item });
                } else {
                    standalone.push(item);
                }
            } catch(e) {
                standalone.push(item);
            }
        });
        return { categories, standalone };
    }, [customItems]);

    // Calcular progreso (filtered by hideCompleted)
    const allItems = Object.values(categorizedList).flat();
    const filteredItems = hideCompleted ? allItems.filter(item => !checkedItems[item]) : allItems;
    const totalItems = filteredItems.length;
    const completedItems = allItems.filter(k => checkedItems[k]).length;
    const progress = totalItems > 0 ? (completedItems / allItems.length) * 100 : 0;

    // Protección de Ruta
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    // --- ACCIONES ---
    const toggleItem = (item) => {
        setCheckedItems(prev => {
            const newState = !prev[item];
            
            // Persistencia en DB (Fase 3): Si es un item custom de la BD
            if (typeof item === 'string' && item.startsWith('custom-')) {
                const itemId = item.replace('custom-', '');
                fetchWithAuth(`/api/shopping/custom/${itemId}/check`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_checked: newState })
                }).catch(err => console.error("Error syncing check status:", err));
            }
            
            return { ...prev, [item]: newState };
        });
    };

    // Marcar / desmarcar todos los items de una categoría
    const toggleAllInCategory = (items, e) => {
        e.stopPropagation(); // No colapsar al hacer clic
        const visibleItems = items.filter(item => !hideCompleted || !checkedItems[item]);
        const allChecked = visibleItems.every(item => checkedItems[item]);
        setCheckedItems(prev => {
            const updated = { ...prev };
            visibleItems.forEach(item => {
                updated[item] = !allChecked;
            });
            return updated;
        });
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
            // Add a global style to force .no-print elements to display: none
            const printStyle = document.createElement('style');
            printStyle.id = 'temp-pdf-style';
            printStyle.innerHTML = '.no-print { display: none !important; }';
            document.head.appendChild(printStyle);

            // Brief delay so styles apply before html2canvas runs
            await new Promise(r => setTimeout(r, 50));

            await html2pdf().set(opt).from(element).toPdf().get('pdf').then((pdf) => {
                const totalPages = pdf.internal.getNumberOfPages();
                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();

                for (let i = 1; i <= totalPages; i++) {
                    pdf.setPage(i);
                    pdf.setFontSize(11);
                    pdf.setFont('helvetica', 'bold');

                    const textMealfit = 'Mealfit';
                    const textR = 'R';
                    const textD = 'D';

                    const widthMealfit = pdf.getTextWidth(textMealfit);
                    const widthR = pdf.getTextWidth(textR);
                    const widthD = pdf.getTextWidth(textD);

                    const totalWidth = widthMealfit + widthR + widthD;
                    const endX = pageWidth - 10;
                    const startX = endX - totalWidth;
                    const postY = pageHeight - 12;

                    pdf.setTextColor(15, 23, 42);
                    pdf.text(textMealfit, startX, postY);

                    pdf.setTextColor(79, 70, 229);
                    pdf.text(textR, startX + widthMealfit, postY);

                    pdf.setTextColor(244, 63, 94);
                    pdf.text(textD, startX + widthMealfit + widthR, postY);
                }
            }).save();

            // Restore elements
            const tempStyle = document.getElementById('temp-pdf-style');
            if (tempStyle) tempStyle.remove();

            toast.dismiss(toastId);
            toast.success('PDF descargado correctamente');
        } catch (error) {
            console.error(error);
            // Restore everything on error
            const tempStyle = document.getElementById('temp-pdf-style');
            if (tempStyle) tempStyle.remove();
            toast.dismiss(toastId);
            toast.error('Error al generar PDF');
        }
    };

    return (
        <DashboardLayout>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>


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
                            Lista de Compras
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '500px', margin: '0 auto 2rem' }}>
                            Cantidades calculadas para tu plan personalizado.
                        </p>

                        {/* PROGRESS BAR */}
                        {totalItems > 0 && (
                            <div style={{ maxWidth: '400px', margin: '0 auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.6rem', color: 'var(--text-main)' }}>
                                    <span>Progreso</span>
                                    <span>{completedItems}/{totalItems} items</span>
                                </div>
                                <div style={{ 
                                    width: '100%', height: '10px', 
                                    background: '#CBD5E1', 
                                    borderRadius: '99px', overflow: 'hidden',
                                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                                }}>
                                    <div style={{
                                        width: `${progress}%`, height: '100%',
                                        background: 'var(--primary)', borderRadius: '99px',
                                        transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: '0 2px 4px rgba(79, 70, 229, 0.3)'
                                    }} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* --- CONTROL PANEL --- */}
                    {totalItems > 0 && (
                        <div className="no-print" style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '1.5rem',
                            flexWrap: 'wrap',
                            marginBottom: '2rem',
                            padding: '1rem',
                            background: '#F8FAFC',
                            borderRadius: '1rem',
                            border: '1px solid #E2E8F0'
                        }}>
                            {/* Days selector */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Días:</span>
                                <div style={{ display: 'flex', gap: '0.25rem', background: '#E2E8F0', padding: '0.25rem', borderRadius: '0.5rem' }}>
                                    {[1, 3, 7].map(days => (
                                        <button
                                            key={days}
                                            onClick={() => {
                                                setDaysToShop(days);
                                                setCheckedItems({});
                                            }}
                                            style={{
                                                padding: '0.4rem 0.75rem',
                                                border: 'none',
                                                borderRadius: '0.375rem',
                                                background: daysToShop === days ? 'white' : 'transparent',
                                                color: daysToShop === days ? 'var(--text-main)' : 'var(--text-muted)',
                                                fontWeight: daysToShop === days ? 600 : 500,
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                boxShadow: daysToShop === days ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {days}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Hide completed toggle */}
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                color: hideCompleted ? 'var(--text-main)' : 'var(--text-muted)'
                            }}>
                                <input 
                                    type="checkbox" 
                                    checked={hideCompleted}
                                    onChange={(e) => setHideCompleted(e.target.checked)}
                                    style={{ display: 'none' }}
                                />
                                <div style={{
                                    width: '36px',
                                    height: '20px',
                                    background: hideCompleted ? 'var(--primary)' : '#CBD5E1',
                                    borderRadius: '99px',
                                    position: 'relative',
                                    transition: 'all 0.2s'
                                }}>
                                    <div style={{
                                        width: '16px',
                                        height: '16px',
                                        background: 'white',
                                        borderRadius: '50%',
                                        position: 'absolute',
                                        top: '2px',
                                        left: hideCompleted ? '18px' : '2px',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                    }} />
                                </div>
                                Ocultar completados
                            </label>

                            {/* Separator */}
                            <div style={{ width: '1px', height: '24px', background: '#E2E8F0' }} />

                            {/* Auto-Generate AI */}
                            <button
                                onClick={handleAutoGenerate}
                                disabled={isGenerating}
                                className="no-print"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    background: 'linear-gradient(135deg, #4F46E5, #3B82F6)',
                                    border: 'none',
                                    padding: '0.5rem 1rem', borderRadius: '0.5rem',
                                    color: 'white', cursor: isGenerating ? 'not-allowed' : 'pointer', 
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.4)',
                                    opacity: isGenerating ? 0.7 : 1,
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <ShoppingCart size={16} className={isGenerating ? "spin-slow" : ""} /> 
                                <span className="hide-mobile">{isGenerating ? 'Consolidando...' : 'Consolidar Ingredientes'}</span>
                            </button>

                            {/* Download PDF */}
                            <button
                                onClick={handleDownloadPDF}
                                className="no-print"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    background: 'transparent',
                                    border: '1px solid #E2E8F0',
                                    padding: '0.4rem 0.85rem', borderRadius: '0.5rem',
                                    color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 500,
                                    fontSize: '0.85rem',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.background = 'white'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = 'transparent'; }}
                            >
                                <Download size={15} /> <span className="hide-mobile">PDF</span>
                            </button>
                        </div>
                    )}

                    {/* --- CONTENT LIST --- */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {Object.keys(categorizedList).length > 0 ? (
                            Object.entries(categorizedList)
                                .map(([catId, items]) => [catId, items.filter(item => !hideCompleted || !checkedItems[item])])
                                .filter(([_, items]) => items.length > 0)
                                .map(([catId, items]) => {
                                const category = CATEGORIES.find(c => c.id === catId);
                                return (
                                    <section key={catId} className="shopping-section" style={{ breakInside: 'avoid' }}>

                                        {/* SECTION HEADER - Clickable for collapse */}
                                        <div
                                            onClick={() => toggleCategory(catId)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                marginBottom: collapsedCategories[catId] ? '0' : '1rem',
                                                padding: '0.5rem 0.75rem',
                                                borderRadius: '0.75rem',
                                                cursor: 'pointer', userSelect: 'none',
                                                transition: 'margin-bottom 0.3s ease, background-color 0.2s ease'
                                            }}
                                            className="shopping-section-header"
                                        >
                                            <div style={{
                                                background: category.bgColor, color: category.color,
                                                padding: '0.4rem', borderRadius: '0.5rem'
                                            }}>
                                                <category.icon size={20} />
                                            </div>
                                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0, flex: 1 }}>
                                                {category.label}
                                            </h2>
                                            <span style={{
                                                background: '#F1F5F9', color: 'var(--text-muted)',
                                                fontSize: '0.75rem', fontWeight: 600, padding: '0.1rem 0.5rem', borderRadius: '99px'
                                            }}>
                                                {items.filter(item => !hideCompleted || !checkedItems[item]).length}
                                            </span>
                                            {/* Mark all checkbox */}
                                            {(() => {
                                                const visibleItems = items.filter(item => !hideCompleted || !checkedItems[item]);
                                                const checkedCount = items.filter(item => checkedItems[item]).length;
                                                const allChecked = checkedCount === items.length && items.length > 0;
                                                const someChecked = checkedCount > 0 && !allChecked;
                                                return (
                                                    <div
                                                        onClick={(e) => toggleAllInCategory(items, e)}
                                                        title={allChecked ? 'Desmarcar toda la categoría' : 'Marcar toda la categoría'}
                                                        className="mark-all-btn"
                                                        style={{
                                                            minWidth: '24px', height: '24px',
                                                            borderRadius: '6px',
                                                            border: allChecked || someChecked ? 'none' : '2px solid #CBD5E1',
                                                            background: allChecked ? 'var(--primary)' : someChecked ? 'var(--primary)' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            color: 'white', transition: 'all 0.2s',
                                                            flexShrink: 0, cursor: 'pointer',
                                                            opacity: allChecked || someChecked ? 1 : 0.6
                                                        }}
                                                    >
                                                        {allChecked && <Check size={14} strokeWidth={3} />}
                                                        {someChecked && <Minus size={14} strokeWidth={3} />}
                                                    </div>
                                                );
                                            })()}
                                            <ChevronDown
                                                size={20}
                                                style={{
                                                    color: 'var(--text-muted)',
                                                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    transform: collapsedCategories[catId] ? 'rotate(-90deg)' : 'rotate(0deg)',
                                                    flexShrink: 0
                                                }}
                                            />
                                        </div>

                                        {/* ITEMS GRID - Collapsible */}
                                        <div
                                            className={`shopping-collapse ${collapsedCategories[catId] ? 'collapsed' : ''}`}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                                                gap: '0.75rem',
                                                overflow: 'hidden',
                                                maxHeight: collapsedCategories[catId] ? '0' : '2000px',
                                                opacity: collapsedCategories[catId] ? 0 : 1,
                                                transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
                                                paddingTop: collapsedCategories[catId] ? '0' : '0.25rem'
                                            }}
                                        >
                                            {items
                                                .filter(item => !hideCompleted || !checkedItems[item])
                                                .map((item, idx) => {
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

                    {/* --- CUSTOM ITEMS (Added by AI) --- */}
                    {customItems.length > 0 && (
                        <div style={{ marginTop: '2rem' }}>
                            <div
                                onClick={() => toggleCategory('custom_ai')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    marginBottom: collapsedCategories['custom_ai'] ? '0' : '1rem',
                                    padding: '0.5rem 0.75rem',
                                    borderRadius: '0.75rem',
                                    cursor: 'pointer', userSelect: 'none',
                                    transition: 'margin-bottom 0.3s ease, background-color 0.2s ease'
                                }}
                                className="shopping-section-header"
                            >
                                <div style={{
                                    background: 'linear-gradient(135deg, #DCFCE7, #BBF7D0)', color: '#16A34A',
                                    padding: '0.4rem', borderRadius: '0.5rem'
                                }}>
                                    <ShoppingCart size={20} />
                                </div>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0, flex: 1 }}>
                                    Lista Consolidada
                                </h2>
                                <span style={{
                                    background: '#DCFCE7', color: '#16A34A',
                                    fontSize: '0.75rem', fontWeight: 600, padding: '0.1rem 0.5rem', borderRadius: '99px'
                                }}>
                                    {customItems.length}
                                </span>
                                <ChevronDown
                                    size={20}
                                    style={{
                                        color: 'var(--text-muted)',
                                        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        transform: collapsedCategories['custom_ai'] ? 'rotate(-90deg)' : 'rotate(0deg)',
                                        flexShrink: 0
                                    }}
                                />
                            </div>
                            <div
                                className={`shopping-collapse ${collapsedCategories['custom_ai'] ? 'collapsed' : ''}`}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                                    gap: '0.75rem',
                                    overflow: 'hidden',
                                    maxHeight: collapsedCategories['custom_ai'] ? '0' : '2000px',
                                    opacity: collapsedCategories['custom_ai'] ? 0 : 1,
                                    transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
                                    paddingTop: collapsedCategories['custom_ai'] ? '0' : '0.25rem'
                                }}
                            >
                                {/* Estructura agrupada en categorías JSON */}
                                {Object.entries(customStructured.categories).map(([catName, catData], catIdx) => (
                                    <div key={catIdx} style={{ background: 'white', border: '1px solid #DDD6FE', borderRadius: '0.75rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: '0 2px 4px rgba(124, 58, 237, 0.05)' }}>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#4F46E5', borderBottom: '1px solid #F3F4F6', paddingBottom: '0.5rem' }}>
                                            {catData.emoji} {catName}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {catData.items.map(structItem => {
                                                const checkKey = `custom-${structItem.id}`;
                                                const isChecked = !!checkedItems[checkKey];
                                                return (
                                                    <div key={structItem.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.25rem 0', opacity: isChecked ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                                                        <div 
                                                            onClick={() => toggleItem(checkKey)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', flex: 1 }}
                                                        >
                                                            <div style={{ minWidth: '22px', height: '22px', borderRadius: '6px', border: isChecked ? 'none' : '2px solid #CBD5E1', background: isChecked ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', transition: 'all 0.2s', flexShrink: 0 }}>
                                                                {isChecked && <Check size={14} strokeWidth={3} />}
                                                            </div>
                                                            <span style={{ fontSize: '0.95rem', color: isChecked ? 'var(--text-muted)' : 'var(--text-main)', textDecoration: isChecked ? 'line-through' : 'none', fontWeight: isChecked ? 400 : 500 }}>
                                                                {structItem.label}
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteCustomItem(structItem.id); }}
                                                            style={{ background: '#F1F5F9', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '0.3rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                                                            onMouseEnter={(e) => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = '#FEE2E2'; }}
                                                            onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = '#F1F5F9'; }}
                                                            title="Eliminar item"
                                                        >
                                                            <X size={15} strokeWidth={2.5}/>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}

                                {/* Fallback Legacy/Standalone items */}
                                {customStructured.standalone.map(item => {
                                    const parts = item.item_name.split(':');
                                    const titleStr = parts.length > 1 ? parts[0].trim() : '';
                                    const contentStr = parts.length > 1 ? parts.slice(1).join(':').trim() : item.item_name.trim();
                                    const itemsList = contentStr.split(',').map(s => s.trim()).filter(Boolean);

                                    return (
                                        <div key={item.id} style={{ background: 'white', border: '1px solid #DDD6FE', borderRadius: '0.75rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: '0 2px 4px rgba(124, 58, 237, 0.05)' }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                                                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#4F46E5', paddingTop: '0.1rem' }}>
                                                    {titleStr || "Ingredientes Extra"}
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteCustomItem(item.id); }}
                                                    style={{ background: '#F1F5F9', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '0.3rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = '#FEE2E2'; }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = '#F1F5F9'; }}
                                                    title="Eliminar de la lista"
                                                >
                                                    <X size={15} strokeWidth={2.5}/>
                                                </button>
                                            </div>
                                            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-main)', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', lineHeight: 1.4 }}>
                                                {itemsList.map((ingItem, idx) => (
                                                    <li key={idx}>
                                                        {ingItem}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

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
                
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .spin-slow { animation: spin 2s linear infinite; }

                .shopping-section-header {
                    border-bottom: 2px solid #F1F5F9;
                }
                .shopping-section-header:hover {
                    background-color: rgba(241, 245, 249, 0.6);
                }

                .shopping-collapse.collapsed {
                    pointer-events: none;
                }

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