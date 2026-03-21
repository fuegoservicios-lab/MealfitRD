import { useState, useMemo, useRef, useEffect } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { Navigate, useNavigate } from 'react-router-dom';
import {
    ShoppingCart, ArrowLeft, Download, Check, ChevronDown, Minus,
    Leaf, Drumstick, Wheat, Milk, Archive, Circle, CheckCircle, ShoppingBag, Layers, X
} from 'lucide-react';
import { toast } from 'sonner';
import html2pdf from 'html2pdf.js';
// IMPORTAMOS CONFIGURACIONES
import { fetchWithAuth } from '../config/api';

// IMPORTAMOS EL GENERADOR
import { generateShoppingListFromPlan } from '../services/shoppingGenerator';

// NUEVOS ESTILOS
import './ShoppingList.css';

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

const getAILightColor = (catName) => {
    const lower = catName.toLowerCase();
    if (lower.includes('carne') || lower.includes('pescado') || lower.includes('pollo') || lower.includes('proteina') || lower.includes('proteína')) return { color: '#DC2626', bgColor: '#FEE2E2' };
    if (lower.includes('fruta') || lower.includes('verdura') || lower.includes('vegetal')) return { color: '#16A34A', bgColor: '#DCFCE7' };
    if (lower.includes('lácteo') || lower.includes('lacteo') || lower.includes('huevo') || lower.includes('queso') || lower.includes('refrigerado')) return { color: '#2563EB', bgColor: '#EFF6FF' };
    if (lower.includes('despensa') || lower.includes('grano') || lower.includes('cereal') || lower.includes('pan')) return { color: '#D97706', bgColor: '#FEF3C7' };
    return { color: '#475569', bgColor: '#F1F5F9' }; 
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
    const [collapsedCategories, setCollapsedCategories] = useState({
        'standalone_extra': true // Mantenemos las notas cerradas por defecto
    });
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

    // Auto-consolida y hace fetch de custom shopping items al montar
    useEffect(() => {
        if (!userId || userId === 'guest') return;
        
        let isMounted = true;
        
        const fetchAndConsolidate = async () => {
            setLoadingCustom(true);
            setIsGenerating(true);
            
            try {
                // 1. Trigger auto-generate (fast if cached by backend)
                await fetchWithAuth('/api/shopping/auto-generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, days: daysToShop })
                });
                
                // 2. Fetch the normalized list from the database
                const res = await fetchWithAuth(`/api/shopping/custom/${userId}`);
                const data = await res.json();
                
                if (isMounted) {
                    setCustomItems(data.items || []);
                    
                    if (data.items && data.items.length > 0) {
                        setCheckedItems(prev => {
                            const next = { ...prev };
                            data.items.forEach(it => {
                                try {
                                    const parsed = typeof it.item_name === 'string' ? JSON.parse(it.item_name) : null;
                                    if (parsed && typeof parsed === 'object' && parsed.is_checked !== undefined) {
                                        next[`custom-${it.id}`] = parsed.is_checked;
                                    }
                                } catch(e) {}
                            });
                            return next;
                        });
                    }
                }
            } catch (err) {
                console.error('Error in auto-generation flow:', err);
                if (isMounted) {
                    try {
                        const fallbackRes = await fetchWithAuth(`/api/shopping/custom/${userId}`);
                        const fallbackData = await fallbackRes.json();
                        if (isMounted) setCustomItems(fallbackData.items || []);
                    } catch(e) {
                         console.error('Fallback fetch failed:', e);
                    }
                }
            } finally {
                if (isMounted) {
                    setLoadingCustom(false);
                    setIsGenerating(false);
                }
            }
        };

        fetchAndConsolidate();
        
        return () => { isMounted = false; };
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

    // Generamos la lista plana y luego la categorizamos (Solo para fallback)
    const categorizedList = useMemo(() => {
        if (!planData || customItems.length > 0) return {};

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

    }, [planData, daysToShop, customItems.length]);

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
                    
                    let displayQty = parsed.qty || "";
                    if (item.source === 'auto') {
                        if (daysToShop === 1 && parsed.qty_1) displayQty = parsed.qty_1;
                        if (daysToShop === 3 && parsed.qty_3) displayQty = parsed.qty_3;
                        if (daysToShop === 7 && parsed.qty_7) displayQty = parsed.qty_7;
                    }
                    
                    const label = (displayQty && displayQty.trim() !== "") 
                        ? `${displayQty} ${parsed.name}` 
                        : parsed.name;
                    
                    categories[cat].items.push({ id: item.id, name: parsed.name, qty: displayQty, label, raw: item });
                } else {
                    standalone.push(item);
                }
            } catch(e) {
                standalone.push(item);
            }
        });
        return { categories, standalone };
    }, [customItems, daysToShop]);

    const hasAIList = customItems.length > 0;

    // Calcular progreso
    const allItems = hasAIList 
        ? customItems 
        : Object.values(categorizedList).flat();

    const filteredItems = hideCompleted 
        ? allItems.filter(item => hasAIList ? !checkedItems[`custom-${item.id}`] : !checkedItems[item]) 
        : allItems;

    const totalItems = filteredItems.length;

    const completedItems = allItems.filter(item => hasAIList ? checkedItems[`custom-${item.id}`] : checkedItems[item]).length;

    const progress = allItems.length > 0 ? (completedItems / allItems.length) * 100 : 0;

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
    const toggleAllInCategory = (items, isCustomList, e) => {
        e.stopPropagation(); // No colapsar al hacer clic
        const visibleItems = items.filter(item => {
            const key = isCustomList ? `custom-${item.id}` : item;
            return !hideCompleted || !checkedItems[key];
        });
        const allChecked = visibleItems.every(item => {
            const key = isCustomList ? `custom-${item.id}` : item;
            return checkedItems[key];
        });
        setCheckedItems(prev => {
            const updated = { ...prev };
            visibleItems.forEach(item => {
                const key = isCustomList ? `custom-${item.id}` : item;
                updated[key] = !allChecked;
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
            <div className="shopping-container">


                {/* --- HEADER TITLE & PROGRESS --- */}
                <div ref={contentRef}>
                    <div className="shopping-hero no-print">
                        <div className="hero-icon-wrapper">
                            <ShoppingBag size={40} />
                        </div>

                        <h1 className="hero-title">
                            Lista de Compras
                        </h1>
                        <p className="hero-subtitle">
                            Cantidades calculadas para tu plan personalizado.
                        </p>

                        {/* PROGRESS BAR */}
                        {totalItems > 0 && (
                            <div className="progress-container">
                                <div className="progress-header">
                                    <span>Progreso</span>
                                    <span>{completedItems} / {allItems.length} items</span>
                                </div>
                                <div className="progress-track">
                                    <div 
                                        className="progress-fill" 
                                        style={{ width: `${progress}%` }} 
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* --- CONTROL PANEL --- */}
                    {totalItems > 0 && (
                        <div className="controls-panel no-print">
                            {/* Days selector */}
                            <div className="control-group">
                                <span className="control-label">Días:</span>
                                <div className="days-selector">
                                    {[1, 3, 7].map(days => (
                                        <button
                                            key={days}
                                            onClick={() => {
                                                setDaysToShop(days);
                                                setCheckedItems({});
                                            }}
                                            className={`day-btn ${daysToShop === days ? 'active' : ''}`}
                                        >
                                            {days}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Hide completed toggle */}
                            <label className="control-group" style={{ cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={hideCompleted}
                                    onChange={(e) => setHideCompleted(e.target.checked)}
                                    style={{ display: 'none' }}
                                />
                                <div className={`toggle-switch ${hideCompleted ? 'active' : ''}`}>
                                    <div className="toggle-knob" />
                                </div>
                                <span className="control-label" style={{ color: hideCompleted ? '#1E293B' : '#64748B' }}>
                                    Ocultar completados
                                </span>
                            </label>

                            {/* Separator */}
                            <div className="hide-mobile" style={{ width: '1px', height: '24px', background: '#E2E8F0' }} />

                            {/* Acciones principales */}
                            <div className="control-group">
                                {isGenerating && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748B', fontSize: '0.9rem', marginRight: '0.5rem' }}>
                                        <ShoppingCart size={16} className="spin-slow" />
                                        <span className="hide-mobile">Consolidando...</span>
                                    </div>
                                )}
                                <button
                                    onClick={handleDownloadPDF}
                                    className="btn-secondary"
                                >
                                    <Download size={18} /> <span className="hide-mobile">PDF</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- CONTENT LIST --- */}
                    <div className="categories-grid">
                        
                        {/* 0. MODO CARGA: Si estamos consolidando o cargando, mostramos un spinner para evitar que la lista cruda parpadee */}
                        {(isGenerating || loadingCustom) ? (
                            <div style={{ columnSpan: 'all', WebkitColumnSpan: 'all', width: '100%', textAlign: 'center', padding: '6rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ background: '#EEF2FF', width: 80, height: 80, borderRadius: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#4F46E5', boxShadow: '0 4px 20px rgba(79, 70, 229, 0.15)' }}>
                                    <ShoppingCart size={36} className="spin-slow" />
                                </div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1E293B', margin: '0 0 0.5rem 0', letterSpacing: '-0.02em' }}>
                                    Consolidando tu lista...
                                </h3>
                                <p style={{ color: '#64748B', maxWidth: '400px', margin: '0 auto', fontSize: '1.05rem', lineHeight: 1.5 }}>
                                    La Inteligencia Artificial está unificando y ordenando tus ingredientes para hacer tus compras más fáciles.
                                </p>
                            </div>
                        ) : hasAIList ? (
                            <>
                                {/* Estructura agrupada en categorías JSON */}
                                {Object.entries(customStructured.categories).map(([catName, catData], catIdx) => {
                                    // Filtramos los items de esta categoría
                                    const visibleItems = catData.items.filter(structItem => {
                                        const isChecked = !!checkedItems[`custom-${structItem.id}`];
                                        return !hideCompleted || !isChecked;
                                    });

                                    if (visibleItems.length === 0 && hideCompleted) return null;

                                    const checkedCount = catData.items.filter(structItem => checkedItems[`custom-${structItem.id}`]).length;
                                    const allChecked = checkedCount === catData.items.length && catData.items.length > 0;
                                    const someChecked = checkedCount > 0 && !allChecked;

                                    let btnClass = "none-checked";
                                    if (allChecked) btnClass = "all-checked";
                                    else if (someChecked) btnClass = "some-checked";

                                    // Dinamic Color
                                    const dynamicColor = getAILightColor(catName);

                                    return (
                                        <section key={catIdx} className="category-card shopping-section" style={{ breakInside: 'avoid' }}>
                                            <div 
                                                className="category-header shopping-section-header"
                                                onClick={() => toggleCategory(catName)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div className="cat-icon" style={{ background: dynamicColor.bgColor, color: dynamicColor.color, fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {catData.emoji}
                                                </div>
                                                <h2 className="cat-title">{catName}</h2>
                                                <span className="cat-badge">{visibleItems.length}</span>
                                                
                                                <div
                                                    onClick={(e) => toggleAllInCategory(catData.items, true, e)}
                                                    title={allChecked ? 'Desmarcar toda la categoría' : 'Marcar toda la categoría'}
                                                    className={`mark-all-btn ${btnClass}`}
                                                >
                                                    {allChecked && <Check size={16} strokeWidth={3} />}
                                                    {someChecked && <Minus size={16} strokeWidth={3} />}
                                                </div>
                                                
                                                <ChevronDown
                                                    size={20}
                                                    className={`cat-collapse-icon ${collapsedCategories[catName] ? 'collapsed' : ''}`}
                                                />
                                            </div>
                                            
                                            <div className={`items-list shopping-collapse ${collapsedCategories[catName] ? 'collapsed' : ''}`}>
                                                {visibleItems.map(structItem => {
                                                    const checkKey = `custom-${structItem.id}`;
                                                    const isChecked = !!checkedItems[checkKey];
                                                    return (
                                                        <div key={structItem.id} className={`shopping-item ${isChecked ? 'checked' : ''}`}>
                                                            <div 
                                                                onClick={() => toggleItem(checkKey)}
                                                                style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.75rem', cursor: 'pointer' }}
                                                            >
                                                                <div className="custom-checkbox">
                                                                    {isChecked && <Check size={16} strokeWidth={3} />}
                                                                </div>
                                                                <div className="item-content">
                                                                    <span className="item-name">{structItem.label}</span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteCustomItem(structItem.id); }}
                                                                className="btn-secondary no-print shopping-item-delete-btn"
                                                                style={{ padding: '0.4rem', borderRadius: '0.5rem', border: 'none', background: 'transparent' }}
                                                                onMouseEnter={(e) => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = '#FEE2E2'; }}
                                                                onMouseLeave={(e) => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.background = 'transparent'; }}
                                                                title="Eliminar item"
                                                            >
                                                                <X size={16} strokeWidth={2.5}/>
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    );
                                })}

                                {/* Fallback Legacy/Standalone items eliminados a petición del usuario */}
                            </>
                        ) : (
                            /* 2. MODO FALLBACK (Legacy): Si no hay lista IA y ya terminó de cargar, usamos la lista cruda basada en CategorizedList */
                            Object.keys(categorizedList).length > 0 ? (
                                Object.entries(categorizedList)
                                    .map(([catId, items]) => [catId, items.filter(item => !hideCompleted || !checkedItems[item])])
                                    .filter(([_, items]) => items.length > 0)
                                    .map(([catId, items]) => {
                                    const category = CATEGORIES.find(c => c.id === catId);
                                    return (
                                        <section key={catId} className="category-card shopping-section" style={{ breakInside: 'avoid' }}>

                                            <div
                                                onClick={() => toggleCategory(catId)}
                                                className="category-header shopping-section-header"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div className="cat-icon" style={{ background: category.bgColor, color: category.color }}>
                                                    <category.icon size={22} />
                                                </div>
                                                <h2 className="cat-title">
                                                    {category.label}
                                                </h2>
                                                <span className="cat-badge">
                                                    {items.length}
                                                </span>
                                                
                                                {(() => {
                                                    const visibleItems = items.filter(item => !hideCompleted || !checkedItems[item]);
                                                    const checkedCount = items.filter(item => checkedItems[item]).length;
                                                    const allChecked = checkedCount === items.length && items.length > 0;
                                                    const someChecked = checkedCount > 0 && !allChecked;
                                                    
                                                    let btnClass = "none-checked";
                                                    if(allChecked) btnClass = "all-checked";
                                                    else if (someChecked) btnClass = "some-checked";

                                                    return (
                                                        <div
                                                            onClick={(e) => toggleAllInCategory(items, false, e)}
                                                            title={allChecked ? 'Desmarcar toda la categoría' : 'Marcar toda la categoría'}
                                                            className={`mark-all-btn ${btnClass}`}
                                                        >
                                                            {allChecked && <Check size={16} strokeWidth={3} />}
                                                            {someChecked && <Minus size={16} strokeWidth={3} />}
                                                        </div>
                                                    );
                                                })()}
                                                <ChevronDown
                                                    size={20}
                                                    className={`cat-collapse-icon ${collapsedCategories[catId] ? 'collapsed' : ''}`}
                                                />
                                            </div>

                                            <div className={`items-list shopping-collapse ${collapsedCategories[catId] ? 'collapsed' : ''}`}>
                                                {items
                                                    .filter(item => !hideCompleted || !checkedItems[item])
                                                    .map((item, idx) => {
                                                    const isChecked = !!checkedItems[item];
                                                    return (
                                                        <div
                                                            key={`${catId}-${idx}`}
                                                            onClick={() => toggleItem(item)}
                                                            className={`shopping-item ${isChecked ? 'checked' : ''}`}
                                                        >
                                                            <div className="custom-checkbox">
                                                                {isChecked && <Check size={16} strokeWidth={3} />}
                                                            </div>
                                                            <div className="item-content">
                                                                <span className="item-name">
                                                                    {item}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    );
                                })
                            ) : (
                                !isGenerating && (
                                    <div style={{ textAlign: 'center', padding: '4rem 1rem', gridColumn: '1 / -1' }}>
                                        <div style={{ background: '#F8FAFC', width: 80, height: 80, borderRadius: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#94A3B8', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                            <ShoppingCart size={36} />
                                        </div>
                                        <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.5rem 0', letterSpacing: '-0.02em' }}>
                                            Tu lista está vacía
                                        </h3>
                                        <p style={{ color: '#64748B', maxWidth: '400px', margin: '0 auto', fontSize: '1.05rem', lineHeight: 1.5 }}>
                                            Genera un nuevo plan de comidas para ver los ingredientes necesarios aquí mágicamente.
                                        </p>
                                    </div>
                                )
                            )
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
                @media print {
                    @page { margin: 1cm; size: auto; }
                    body { background: white !important; font-size: 11pt; -webkit-print-color-adjust: exact; }
                    .no-print, aside, nav, header { display: none !important; }
                    .container, .main-content { width: 100% !important; margin: 0 !important; padding: 0 !important; display: block !important; }
                    .shopping-container { max-width: 100% !important; border: none !important; box-shadow: none !important; background: transparent !important; }
                    .print-only { display: block !important; }
                    
                    .categories-grid { display: block !important; }
                    .category-card { border: none !important; box-shadow: none !important; margin-bottom: 2rem; break-inside: avoid; }
                    .category-header { border-bottom: 2px solid #E2E8F0 !important; padding: 0.5rem 0 !important; background: transparent !important; }
                    .category-header .cat-icon { display: none !important; }
                    .category-header .cat-badge, .category-header .cat-collapse-icon, .mark-all-btn { display: none !important; }
                    
                    .items-list { padding: 0.5rem 0 !important; }
                    .shopping-item { 
                        border: none !important; 
                        padding: 0.25rem 0 !important; 
                        background: transparent !important;
                        box-shadow: none !important;
                        page-break-inside: avoid;
                    }
                    .shopping-item .custom-checkbox {
                        border: 1px solid #000 !important;
                        width: 16px !important; height: 16px !important;
                        background: transparent !important; color: transparent !important;
                        border-radius: 4px !important;
                    }
                }
            `}</style>
        </DashboardLayout>
    );
};

export default ShoppingList;