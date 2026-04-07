import { useState, useMemo, useEffect } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import { Navigate, useNavigate } from 'react-router-dom';
import {
    ShoppingCart, ArrowLeft, Download, Check, ChevronDown, Minus,
    Leaf, Drumstick, Wheat, Milk, Archive, Circle, CheckCircle, ShoppingBag, Layers, X, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import html2pdf from 'html2pdf.js';
// IMPORTAMOS CONFIGURACIONES
import { fetchWithAuth } from '../config/api';

// IMPORTAMOS EL GENERADOR
import { generateShoppingListFromPlan } from '../services/shoppingGenerator';
import { supabase } from '../supabase';

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
    if (lower.includes('suplemento')) return { color: '#7C3AED', bgColor: '#EDE9FE' };
    return { color: '#475569', bgColor: '#F1F5F9' }; 
};


const ShoppingList = () => {
    const { planData, formData, updateData, updateUserProfile, session } = useAssessment();
    const navigate = useNavigate();

    // Estado para los items marcados (usando el nombre del item como key para persistencia simple)
    const [checkedItems, setCheckedItems] = useState(() => {
        const saved = localStorage.getItem('mealfit_shopping_checks');
        return saved ? JSON.parse(saved) : {};
    });

    // Persist checked items to localStorage
    useEffect(() => {
        localStorage.setItem('mealfit_shopping_checks', JSON.stringify(checkedItems));
    }, [checkedItems]);

    // Estado para días a comprar, persistido
    const [daysToShop, setDaysToShop] = useState(() => {
        const saved = localStorage.getItem('mealfit_shopping_days');
        if (saved) return parseInt(saved, 10);
        
        // Link to user's onboarding preference
        if (planData?.form_data?.groceryDuration) {
            if (planData.form_data.groceryDuration === 'biweekly') return 15;
            if (planData.form_data.groceryDuration === 'monthly') return 30;
        }
        return 7;
    });

    useEffect(() => {
        localStorage.setItem('mealfit_shopping_days', daysToShop.toString());
    }, [daysToShop]);

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
    const [loadingCustom, setLoadingCustom] = useState(true); // Inicialmente cargando la DB
    const [isGenerating, setIsGenerating] = useState(false); // La IA arranca falsa, a menos que la DB esté vacía
    const [itemToDelete, setItemToDelete] = useState(null); // Modal para eliminar item

    // Obtener userId para el fetch
    const userId = typeof window !== 'undefined' ? localStorage.getItem('mealfit_user_id') : null;

    // --- SUPABASE REALTIME (WebSockets) ---
    useEffect(() => {
        if (!userId || userId === 'guest') return;

        const channel = supabase
            .channel('shopping_list_changes')
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'custom_shopping_items',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {

                    
                    if (payload.eventType === 'INSERT') {
                        setCustomItems(prev => {
                            // Prevenir duplicidad si el componente ya lo tiene
                            if (prev.some(item => item.id === payload.new.id)) return prev;
                            return [payload.new, ...prev]; // Añadir al inicio o final, la DB usará order by pero en real-time lo inyectamos
                        });
                    } else if (payload.eventType === 'DELETE') {
                        setCustomItems(prev => prev.filter(item => item.id !== payload.old.id));
                    } else if (payload.eventType === 'UPDATE') {
                        setCustomItems(prev => prev.map(item => item.id === payload.new.id ? payload.new : item));
                        
                        // Sincronizar checkmarks opcionalmente
                        try {
                            const parsed = typeof payload.new.item_name === 'string' ? JSON.parse(payload.new.item_name) : null;
                            if (parsed && typeof parsed === 'object' && parsed.is_checked !== undefined) {
                                setCheckedItems(prevChecks => ({
                                    ...prevChecks,
                                    [`custom-${payload.new.id}`]: parsed.is_checked
                                }));
                            }
                        } catch(error) {}
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId]);

    // Auto-consolida y hace fetch de custom shopping items al montar
    useEffect(() => {
        if (!userId || userId === 'guest') return;
        
        let isMounted = true;
        
        const fetchAndConsolidate = async () => {
            try {
                // 1. Fetch rápido de lo que ya existe en la DB (Optimistic UI)
                const res = await fetchWithAuth(`/api/shopping/custom/${userId}`);
                const data = await res.json();
                
                const hasExistingData = data.items && data.items.length > 0;
                
                if (isMounted) {
                    if (hasExistingData) {
                        setCustomItems(data.items);
                        // Cargar checkmarks inmediatamente
                        setCheckedItems(prev => {
                            const next = { ...prev };
                            data.items.forEach(it => {
                                try {
                                    const parsed = typeof it.item_name === 'string' ? JSON.parse(it.item_name) : null;
                                    if (parsed && typeof parsed === 'object' && parsed.is_checked !== undefined) {
                                        next[`custom-${it.id}`] = parsed.is_checked;
                                    }
                                    } catch(error) {}
                            });
                            return next;
                        });
                        setLoadingCustom(false);
                        setIsGenerating(false); // Ya tenemos data, no mostramos el loader gigante
                    } else {
                        // Si no hay data previa, sí mostramos el loader de IA
                        setIsGenerating(true);
                        setLoadingCustom(true);
                    }
                }

                // 2. Trigger auto-generate en el background (sincronizará el backend si el plan cambió)
                // Esto devolverá cached: true súper rápido si no hay cambios.
                const autogenRes = await fetchWithAuth('/api/shopping/auto-generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, days: daysToShop })
                });
                
                const autogenData = await autogenRes.json();
                
                if (isMounted) {
                    // Si el backend efectivamente regeneró una nueva lista por la IA (cached false)
                    // o si nunca tuvimos data al inicio, actualizamos el UI con la lista final fresca.
                    if (autogenData.success && (!hasExistingData || autogenData.cached === false)) {
                        setCustomItems(autogenData.items || []);
                        
                        if (autogenData.cached === false && hasExistingData) {
                            toast.success('Lista actualizada a tu nuevo plan automáticamante. 🛒');
                        }
                    }
                }

            } catch (err) {
                console.error('Error in auto-generation flow:', err);
            } finally {
                if (isMounted) {
                    setLoadingCustom(false);
                    setIsGenerating(false);
                }
            }
        };

        fetchAndConsolidate();
        
        return () => { isMounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const executeDelete = async (itemId) => {
        try {
            await fetchWithAuth(`/api/shopping/custom/${itemId}`, { method: 'DELETE' });
            setCustomItems(prev => prev.filter(i => i.id !== itemId));
        } catch (err) {
            console.error('Error deleting custom item:', err);
            toast.error('Error al eliminar el item');
        }
    };

    const handleDeleteCustomItem = (structItem) => {
        setItemToDelete(structItem);
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

    const scaleQuantityString = (str, factor) => {
        if (!str) return str;
        let pStr = str.trim();
        const lStr = pStr.toLowerCase();
        if (lStr.startsWith('media ') || lStr.startsWith('medio ')) pStr = pStr.replace(/^(media|medio)\s+/i, '0.5 ');
        else if (lStr.startsWith('un ') || lStr.startsWith('una ')) pStr = pStr.replace(/^(un|una)\s+/i, '1 ');
        else if (lStr.startsWith('dos ')) pStr = pStr.replace(/^dos\s+/i, '2 ');
        
        return pStr.replace(/^([\d.,]+)(.*)/, (match, numbStr, rest) => {
            let num = parseFloat(numbStr.replace(',', '.'));
            if (isNaN(num)) return match;
            let newNum = num * factor;
            let formatted = newNum % 1 === 0 ? newNum.toString() : (Math.round(newNum * 10) / 10).toString().replace('.', ',');
            // Ensure there is a space if the rest of the string starts with a letter, but not if it's already spaced
            let spacedRest = rest;
            if (rest.length > 0 && !rest.startsWith(' ') && /[a-zA-Z]/.test(rest.charAt(0))) {
                spacedRest = ' ' + rest;
            }
            return formatted + spacedRest;
        });
    };

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
                    
                    let displayQty = parsed.qty || item.qty || "";
                    if (daysToShop === 7) {
                        displayQty = parsed.qty_7 || displayQty;
                    } else if (daysToShop === 15) {
                        displayQty = parsed.qty_15 || parsed.qty_7 || displayQty;
                        if (!parsed.qty_15 && displayQty) displayQty = scaleQuantityString(displayQty, 2);
                    } else if (daysToShop === 30) {
                        displayQty = parsed.qty_30 || parsed.qty_15 || parsed.qty_7 || displayQty;
                        if (!parsed.qty_30 && displayQty) displayQty = scaleQuantityString(displayQty, 4);
                    }
                    
                    const label = (displayQty && displayQty.trim() !== "") 
                        ? `${displayQty} ${parsed.name}` 
                        : parsed.name;
                    
                    categories[cat].items.push({ id: item.id, name: parsed.name, qty: displayQty, label, raw: item });
                } else {
                    standalone.push(item);
                }
            } catch(error) {
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
        const toastId = toast.loading('Generando PDF...');

        try {
            // ====== BUILD DEDICATED PDF TEMPLATE ======
            // Collect items to render (from AI list or fallback)
            let pdfCategories = []; // [{name, emoji, items: [{label}]}]

            if (hasAIList) {
                Object.entries(customStructured.categories).forEach(([catName, catData]) => {
                    const items = catData.items.map(si => ({ label: si.label || si.name }));
                    if (items.length > 0) {
                        pdfCategories.push({ name: catName, emoji: catData.emoji || '🛒', items });
                    }
                });
            } else {
                Object.entries(categorizedList).forEach(([catId, items]) => {
                    const category = CATEGORIES.find(c => c.id === catId);
                    if (items.length > 0) {
                        pdfCategories.push({ name: category?.label || catId, emoji: '', items: items.map(i => ({ label: i })) });
                    }
                });
            }

            if (pdfCategories.length === 0) {
                toast.dismiss(toastId);
                toast.error('No hay items para exportar');
                return;
            }

            // Count total items to dynamically choose font size
            const totalPdfItems = pdfCategories.reduce((sum, c) => sum + c.items.length, 0);
            const fontSize = totalPdfItems > 40 ? '11pt' : totalPdfItems > 30 ? '11.5pt' : '12.5pt';
            const lineH = totalPdfItems > 40 ? '1.35' : '1.5';
            const catGap = totalPdfItems > 40 ? '10px' : '14px';

            // Date formatting
            const today = new Date();
            const dateStr = today.toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            // Distribute categories across 3 columns (balanced)
            const col1 = [], col2 = [], col3 = [];
            const colHeights = [0, 0, 0];
            const cols = [col1, col2, col3];
            // Sort categories by size descending for better balance
            const sortedCats = [...pdfCategories].sort((a, b) => b.items.length - a.items.length);
            sortedCats.forEach(cat => {
                const minIdx = colHeights.indexOf(Math.min(...colHeights));
                cols[minIdx].push(cat);
                colHeights[minIdx] += cat.items.length + 1.5; // +1.5 for category header
            });

            const renderColumn = (catList) => catList.map(cat => `
                <div style="margin-bottom: ${catGap};">
                    <div style="font-weight: 700; font-size: 14pt; color: #1E293B; border-bottom: 2px solid #CBD5E1; padding-bottom: 4px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <span>${cat.emoji}</span> ${cat.name}
                        <span style="font-weight: 400; color: #94A3B8; font-size: 9pt; margin-left: auto;">${cat.items.length}</span>
                    </div>
                    ${cat.items.map(item => `
                        <div style="display: flex; align-items: flex-start; gap: 7px; padding: 2px 0; font-size: ${fontSize}; line-height: ${lineH}; color: #334155;">
                            <div style="width: 15px; height: 15px; min-width: 15px; border: 1.5px solid #94A3B8; border-radius: 3px; margin-top: 2px;"></div>
                            <span>${item.label}</span>
                        </div>
                    `).join('')}
                </div>
            `).join('');

            const pdfHTML = `
                <div style="width: 190mm; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; padding: 0; box-sizing: border-box;">
                    <!-- HEADER -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #4F46E5; padding-bottom: 8px; margin-bottom: 14px;">
                        <div>
                            <div style="font-size: 22pt; font-weight: 800; letter-spacing: -0.5px; color: #0F172A;">
                                Mealfit<span style="color: #4F46E5;">R</span><span style="color: #F43F5E;">D</span>
                            </div>
                            <div style="font-size: 9pt; color: #64748B; margin-top: 2px;">Lista de Compras Inteligente</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 10pt; font-weight: 600; color: #1E293B;">
                                📅 ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}
                            </div>
                            <div style="font-size: 10pt; color: #4F46E5; font-weight: 700; margin-top: 2px;">
                                🛒 Para ${daysToShop} día${daysToShop > 1 ? 's' : ''} · ${totalPdfItems} items
                            </div>
                        </div>
                    </div>

                    <!-- 3-COLUMN GRID -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; align-items: start;">
                        <div>${renderColumn(col1)}</div>
                        <div>${renderColumn(col2)}</div>
                        <div>${renderColumn(col3)}</div>
                    </div>

                    <!-- FOOTER -->
                    <div style="margin-top: 12px; padding-top: 6px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 8pt; color: #94A3B8;">Generado automáticamente por MealfitRD · mealfitrd.com</span>
                        <span style="font-size: 8pt; color: #94A3B8;">✅ Marca los items a medida que compras</span>
                    </div>
                </div>
            `;

            const opt = {
                margin: [8, 10, 8, 10],
                filename: `MealfitRD-Lista-Compras-${daysToShop}dias.pdf`,
                image: { type: 'jpeg', quality: 0.95 },
                html2canvas: { scale: 2.5, useCORS: true, letterRendering: true, scrollY: 0, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            await html2pdf().set(opt).from(pdfHTML, 'string').save();

            toast.dismiss(toastId);
            toast.success('PDF descargado correctamente');
        } catch (error) {
            console.error(error);
            toast.dismiss(toastId);
            toast.error('Error al generar PDF');
        }
    };

    const handleRegenerate = async () => {
        if (!window.confirm('¿Estás seguro de regenerar? Esto borrará tu lista actual (y tus marcas de chequeo) para crear una nueva basada en tu plan.')) return;
        
        setIsGenerating(true);
        // Desplazar arriba
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        try {
            const autogenRes = await fetchWithAuth('/api/shopping/auto-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, days: daysToShop, force: true })
            });
            const autogenData = await autogenRes.json();
            
            if (autogenData.success) {
                setCustomItems(autogenData.items || []);
                // Limpiar checkmarks viejos
                const newChecked = {};
                (autogenData.items || []).forEach(it => {
                    newChecked[`custom-${it.id}`] = false;
                });
                setCheckedItems(newChecked);
                toast.success('Lista re-generada exitosamente con tu nuevo plan. 🛒');
            } else {
                toast.error(autogenData.message || 'Error al regenerar lista');
            }
        } catch(e) {
            console.error(e);
            toast.error('Error al regenerar lista');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <>
            <div className="shopping-container">


                {/* --- HEADER TITLE & PROGRESS --- */}
                <div>
                    <div className="shopping-hero no-print">
                        {/* Regenerate & PDF Download - floating in hero for mobile */}
                        <div className="hero-floating-actions no-print" style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={handleDownloadPDF}
                                className="hero-pdf-btn"
                                title="Descargar PDF"
                            >
                                <Download size={18} />
                            </button>
                        </div>
                        
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
                                    {[7, 15, 30].map(days => (
                                        <button
                                            key={days}
                                            onClick={() => {
                                                setDaysToShop(days);
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
                                    Ocultar<span className="hide-mobile"> completados</span>
                                </span>
                            </label>

                            {/* Consolidando indicator (desktop only) */}
                            {isGenerating && (
                                <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748B', fontSize: '0.9rem' }}>
                                    <ShoppingCart size={16} className="spin-slow" />
                                    <span>Consolidando...</span>
                                </div>
                            )}

                            {/* Regenerate and PDF buttons - desktop only (on mobile they're in the hero) */}
                            <div className="hide-mobile control-group" style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ width: '1px', height: '24px', background: '#E2E8F0', marginRight: '0.5rem' }} />
                                <button
                                    onClick={handleDownloadPDF}
                                    className="btn-secondary"
                                >
                                    <Download size={18} /> PDF
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- CONTENT LIST --- */}
                    <div className="categories-grid">
                        
                        {/* 0. MODO CARGA IA */}
                        {isGenerating ? (
                            <div style={{ columnSpan: 'all', WebkitColumnSpan: 'all', width: '100%', textAlign: 'center', padding: '6rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ background: '#EEF2FF', width: 120, height: 120, borderRadius: '3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#4F46E5', boxShadow: '0 8px 30px rgba(79, 70, 229, 0.25)' }}>
                                    <ShoppingCart size={64} className="spin-slow" strokeWidth={2} />
                                </div>
                                <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1E293B', margin: '0 0 0.5rem 0', letterSpacing: '-0.02em' }}>
                                    Consolidando tu lista...
                                </h3>
                                <p style={{ color: '#64748B', maxWidth: '400px', margin: '0 auto', fontSize: '1.1rem', lineHeight: 1.5 }}>
                                    La Inteligencia Artificial está unificando y ordenando tus ingredientes para hacer tus compras más fáciles.
                                </p>
                            </div>
                        ) : loadingCustom ? (
                            /* Loader silencioso inicial de base de datos */
                            <div style={{ columnSpan: 'all', width: '100%', textAlign: 'center', padding: '8rem 1rem' }}>
                                <div className="spin-slow" style={{ color: '#4F46E5', display: 'inline-block', opacity: 0.8, filter: 'drop-shadow(0 6px 12px rgba(79,70,229,0.3))' }}>
                                    <ShoppingCart size={80} strokeWidth={1.5} />
                                </div>
                                <div style={{ marginTop: '1.5rem', color: '#64748B', fontSize: '1.1rem', fontWeight: '500' }}>Cargando tus ingredientes...</div>
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
                                                                    {structItem.qty ? (
                                                                        <span className="item-name">
                                                                            <span className="item-qty">{structItem.qty}</span>
                                                                            {structItem.name}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="item-name">{structItem.name}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteCustomItem(structItem); }}
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
            </div>

            {/* --- MODAL PARA ELIMINAR ITEM --- */}
            {itemToDelete && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.2s ease-out' }}>
                    <div style={{ background: '#ffffff', borderRadius: '1.25rem', width: '100%', maxWidth: '380px', padding: '1.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0F172A', fontWeight: 800 }}>Eliminar {itemToDelete.name}</h3>
                            <button onClick={() => setItemToDelete(null)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '0.25rem', borderRadius: '0.5rem', display: 'flex' }} onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                <X size={20} />
                            </button>
                        </div>
                        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.95rem', color: '#64748B', lineHeight: '1.5' }}>
                            Si no deseas comer este ingrediente nuevamente, podemos decirle a la IA que lo evite en tus futuros menús.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button 
                                onClick={() => {
                                    executeDelete(itemToDelete.id);
                                    setItemToDelete(null);
                                    toast.success('Eliminado de la lista 🏠');
                                }}
                                style={{ padding: '0.85rem 1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '0.75rem', color: '#334155', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'all 0.2s', width: '100%', textAlign: 'left' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                            >
                                🏠 Ya lo tengo en casa (Solo borrar)
                            </button>

                            <button 
                                onClick={() => {
                                    executeDelete(itemToDelete.id);
                                    
                                    // Calculamos tiempo de expiración
                                    const groceryMap = { 'weekly': 7, 'biweekly': 15, 'monthly': 30 };
                                    const userDuration = planData?.form_data?.groceryDuration || formData?.groceryDuration || 'weekly';
                                    const durationDays = groceryMap[userDuration] || 7;
                                    
                                    const expiryDate = new Date();
                                    expiryDate.setDate(expiryDate.getDate() + durationDays);
                                    
                                    const currentTempDislikes = formData?.temporary_dislikes || {};
                                    const newTempDislikes = {
                                        ...currentTempDislikes,
                                        [itemToDelete.name]: expiryDate.toISOString()
                                    };
                                    
                                    updateData('temporary_dislikes', newTempDislikes);
                                    if (session?.user) {
                                        updateUserProfile({ health_profile: { ...formData, temporary_dislikes: newTempDislikes } });
                                    }
                                    
                                    setItemToDelete(null);
                                    toast.success('Ignorado hasta tu próximo súper 🛒');
                                }}
                                style={{ padding: '0.85rem 1rem', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '0.75rem', color: '#C2410C', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'all 0.2s', width: '100%', textAlign: 'left' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#FFEDD5'; e.currentTarget.style.borderColor = '#FDBA74'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#FFF7ED'; e.currentTarget.style.borderColor = '#FED7AA'; }}
                            >
                                🛒 No lo encontré / No lo compraré hoy
                            </button>
                            
                            <button 
                                onClick={() => {
                                    executeDelete(itemToDelete.id);
                                    const currentDislikes = formData?.dislikes || [];
                                    if (!currentDislikes.includes(itemToDelete.name)) {
                                        const newDislikes = [...currentDislikes, itemToDelete.name];
                                        updateData('dislikes', newDislikes);
                                        if (session?.user) {
                                            updateUserProfile({ health_profile: { ...formData, dislikes: newDislikes } });
                                        }
                                        toast.success(`¡Entendido! "${itemToDelete.name}" añadido a tu lista negra 🚫`);
                                    } else {
                                        toast.success('Eliminado de la lista');
                                    }
                                    setItemToDelete(null);
                                }}
                                style={{ padding: '0.85rem 1rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.75rem', color: '#DC2626', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'all 0.2s', width: '100%', textAlign: 'left' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#FEF2F2'; }}
                            >
                                🚫 No me gusta (Evitar en el futuro)
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </>
    );
};

export default ShoppingList;