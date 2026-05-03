import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAssessment } from '../context/AssessmentContext';
import { supabase } from '../supabase';
import { Search, Plus, Minus, Trash2, Loader2, Save, X, Search as SearchIcon, AlertCircle, Snowflake, Beef, Drumstick, Fish, Egg, Apple, Carrot, Salad, Milk, Wheat, Croissant, Cookie, Nut, GlassWater, Package, Leaf, Droplets, Flame, ShoppingBasket } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, API_BASE } from '../config/api';

const CATEGORY_ICONS = {
    'PROTEÍNAS': Beef,
    'PROTEINAS': Beef,
    'CARNES': Beef,
    'CARNES ROJAS': Beef,
    'POLLO': Drumstick,
    'AVES': Drumstick,
    'PESCADO': Fish,
    'PESCADOS': Fish,
    'PESCADOS Y MARISCOS': Fish,
    'MARISCOS': Fish,
    'HUEVOS': Egg,
    'VEGETALES': Salad,
    'VERDURAS': Salad,
    'HORTALIZAS': Carrot,
    'FRUTAS': Apple,
    'LÁCTEOS': Milk,
    'LACTEOS': Milk,
    'QUESOS': Milk,
    'CEREALES Y GRANOS': Wheat,
    'CEREALES': Wheat,
    'GRANOS': Wheat,
    'DESPENSA Y GRANOS': Wheat,
    'DESPENSA': Package,
    'LEGUMBRES': Wheat,
    'VÍVERES': ShoppingBasket,
    'VIVERES': ShoppingBasket,
    'ESPECIAS': Flame,
    'CONDIMENTOS': Flame,
    'HIERBAS': Leaf,
    'GRASAS': Droplets,
    'ACEITES': Droplets,
    'BEBIDAS': GlassWater,
    'PANADERIA': Croissant,
    'PANADERÍA': Croissant,
    'PANES': Croissant,
    'DULCES': Cookie,
    'AZÚCARES': Cookie,
    'AZUCARES': Cookie,
    'FRUTOS SECOS': Nut,
    'OTROS': Package,
};

const getCategoryIcon = (cat) => {
    if (!cat) return Package;
    return CATEGORY_ICONS[cat.toUpperCase().trim()] || Package;
};

const Pantry = () => {
    const { session, userProfile, setPlanData } = useAssessment();
    const [inventory, setInventory] = useState([]);
    const [masterList, setMasterList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingItem, setSavingItem] = useState(null); // ID of item being saved
    const [searchQuery, setSearchQuery] = useState('');
    
    // Auto-complete (Add Item) state
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [addItemSearch, setAddItemSearch] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeletingAll, setIsDeletingAll] = useState(false);

    // Resetear focus activo al cambiar búsqueda o cerrar modal
    useEffect(() => {
        setSelectedIndex(-1);
    }, [addItemSearch, showAddMenu]);

    const [disabledIngredients, setDisabledIngredients] = useState([]);

    useEffect(() => {
        const checkDisabled = () => {
            const saved = localStorage.getItem('mealfit_disabled_ingredients');
            if (saved) {
                try {
                    setDisabledIngredients(JSON.parse(saved));
                } catch(e) { }
            } else {
                setDisabledIngredients([]);
            }
        };
        checkDisabled();
        window.addEventListener('storage', checkDisabled);
        return () => window.removeEventListener('storage', checkDisabled);
    }, []);

    // Lock/Debounce por item para el guardado 
    const pendingOps = useRef(new Map()); // id -> { baselineQty, targetQty, timeout }
    const masterListLoaded = useRef(false);

    // Refs para modo sostenido (velocímetro)
    const holdIntervalRef = useRef({});
    const holdTimeoutRef = useRef({});
    const inventoryRef = useRef([]);

    // Mantener inventoryRef fresco para los intervalos asíncronos y fallbacks
    useEffect(() => {
        inventoryRef.current = inventory;
    }, [inventory]);

    // 1. Fetch data on mount
    useEffect(() => {
        if (!session?.user?.id) return;
        fetchData(true);
    }, [session?.user?.id]);

    // 1b. Real-time sync: anula el "efecto eco" procesando el payload en vez de hacer refetch global
    useEffect(() => {
        if (!session?.user?.id) return;

        const fetchAndAddSingleItem = async (itemId) => {
            try {
                const { data, error } = await supabase
                    .from('user_inventory')
                    .select('*, master_ingredients(name, category, default_unit)')
                    .eq('id', itemId)
                    .single();
                if (error) throw error;
                if (data) {
                    setInventory(prev => {
                        if (prev.some(item => item.id === data.id)) return prev;
                        return [...prev, data].sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name));
                    });
                }
            } catch (err) {
                console.error("Error fetching realtime item:", err);
            }
        };

        const channel = supabase
            .channel('pantry-realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user_inventory',
                filter: `user_id=eq.${session.user.id}`
            }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    setInventory(prev => prev.filter(item => item.id !== payload.old.id));
                } else if (payload.eventType === 'UPDATE') {
                    setInventory(prev => prev.map(item => 
                        item.id === payload.new.id ? { ...item, ...payload.new } : item
                    ));
                } else if (payload.eventType === 'INSERT') {
                    if (!inventoryRef.current.some(item => item.id === payload.new.id)) {
                        fetchAndAddSingleItem(payload.new.id);
                    }
                }
            })
            .subscribe();
            
        return () => supabase.removeChannel(channel);
    }, [session?.user?.id]);

    const fetchData = async (isInitial = true) => {
        if (isInitial) setLoading(true);
        try {
            // Fetch User Inventory
            const { data: invData, error: invError } = await supabase
                .from('user_inventory')
                .select('*, master_ingredients(name, category, default_unit)')
                .eq('user_id', session.user.id)
                .gt('quantity', 0)
                .order('ingredient_name', { ascending: true });

            if (invError) throw invError;
            setInventory(invData || []);

            // Fetch Master List (solo una vez; cambios son rarísimos)
            if (!masterListLoaded.current) {
                const { data: masterData, error: masterError } = await supabase
                    .from('master_ingredients')
                    .select('*')
                    .order('name', { ascending: true });

                if (masterError) throw masterError;
                setMasterList(masterData || []);
                masterListLoaded.current = true;
            }
        } catch (error) {
            console.error('Error fetching pantry:', error);
            if (isInitial) toast.error('Error al cargar la despensa.');
        } finally {
            if (isInitial) setLoading(false);
        }
    };

    // Funciones Helper para tracking hiper-rápido antes de que React renderice
    const getLatestQuantity = (id) => {
        if (pendingOps.current.has(id)) {
            return pendingOps.current.get(id).targetQty;
        }
        const item = inventoryRef.current.find(i => i.id === id);
        return item ? item.quantity : 0;
    };

    const stopHolding = (e, id) => {
        if (e) e.preventDefault();
        clearTimeout(holdTimeoutRef.current[id]);
        clearInterval(holdIntervalRef.current[id]);
    };

    // 2. Real-time updates (Optimistic UI con Debounce Agresivo)
    const handleUpdateQuantity = async (id, newQty) => {
        if (newQty < 0) return;
        const roundedQty = Math.round(newQty * 100) / 100;

        if (roundedQty === 0) {
            stopHolding(null, id); // Cancelamos si vienen como ráfaga del velocímetro
            if (pendingOps.current.has(id)) {
                const op = pendingOps.current.get(id);
                if (op.timeout) clearTimeout(op.timeout);
                pendingOps.current.delete(id);
            }
            await handleDeleteItem(id);
            return;
        }

        // 1. Capturar el estado BASELINE solo si no había una ráfaga activa
        if (!pendingOps.current.has(id)) {
            const currentItem = inventoryRef.current.find(i => i.id === id);
            const baselineQty = currentItem ? currentItem.quantity : 0;
            pendingOps.current.set(id, { baselineQty, targetQty: roundedQty, timeout: null });
        } else {
            pendingOps.current.get(id).targetQty = roundedQty; // Actualizar objetivo de la ráfaga
        }

        const op = pendingOps.current.get(id);

        // 2. UI Updates visuales instantáneos
        setInventory(prev => prev.map(item => item.id === id ? { ...item, quantity: roundedQty } : item));
        setSavingItem(id);

        // 3. Limpiar guardado pendiente (Debounce re-trigger)
        if (op.timeout) clearTimeout(op.timeout);

        // 4. Disparar el guardado cuando pasen 500ms SIN recibir otra actualización
        op.timeout = setTimeout(async () => {
            try {
                // El delta es la diferencia total desde que empezó la ráfaga
                const finalTarget = pendingOps.current.get(id).targetQty;
                const delta = finalTarget - op.baselineQty;

                if (delta !== 0) {
                    const { error } = await supabase.rpc('increment_inventory_quantity', {
                        p_id: id,
                        p_delta: delta
                    });
                    if (error) throw error;
                }
            } catch (error) {
                console.error("Error updating quantity:", error);
                toast.error('Error al actualizar alimento.');
                fetchData(false); // rollback visual si falla
            } finally {
                setSavingItem(null);
                pendingOps.current.delete(id); // Liberamos la ráfaga
            }
        }, 500); 
    };

    // Activación del "Velocímetro"
    const startHolding = (e, id, step) => {
        if (e) e.preventDefault(); // prevenir double click zoom
        const item = inventoryRef.current.find(i => i.id === id);
        if (!item) return;

        let currentQty = getLatestQuantity(id) + step;
        handleUpdateQuantity(id, currentQty);

        holdTimeoutRef.current[id] = setTimeout(() => {
            holdIntervalRef.current[id] = setInterval(() => {
                currentQty += step;
                if (currentQty < 0) currentQty = 0;
                handleUpdateQuantity(id, currentQty);
            }, 80); // <--- Velocidad supersónica (80ms = turbo)
        }, 400);
    };

    const handleDeleteItem = async (id) => {
        // Capturar snapshot del item antes de eliminarlo de la UI
        const deletedItem = inventory.find(item => item.id === id);
        if (!deletedItem) return;

        // Eliminación optimista inmediata de la UI
        setInventory(prev => prev.filter(item => item.id !== id));

        // Delete inmediato de la DB para evitar "fantasmas"
        try {
            await supabase.from('user_inventory').delete().eq('id', id);
        } catch (error) {
            console.error("Error deleting:", error);
            // Revertir en la UI si falla
            setInventory(prev => [...prev, deletedItem].sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name)));
            toast.error(`Error al eliminar ${deletedItem.ingredient_name}`);
            return;
        }

        // Toast con opción de deshacer real (insert)
        toast.success(`${deletedItem.ingredient_name} eliminado`, {
            icon: '🗑️',
            duration: 5000,
            action: {
                label: 'Deshacer',
                onClick: async () => {
                    // Re-insertar en la DB
                    try {
                        const { id: oldId, master_ingredients, ...itemToInsert } = deletedItem;
                        const { data, error } = await supabase
                            .from('user_inventory')
                            .insert([itemToInsert])
                            .select('*, master_ingredients(name, category, default_unit)')
                            .single();
                        
                        if (error) throw error;
                        
                        // Insertar nueva data devuelta por DB
                        setInventory(prev =>
                            [...prev.filter(i => i.id !== oldId), data].sort((a, b) =>
                                a.ingredient_name.localeCompare(b.ingredient_name)
                            )
                        );
                        toast.success(`${deletedItem.ingredient_name} restaurado`, { icon: '↩️', duration: 2000 });
                    } catch (err) {
                        console.error('Error restaurando item:', err);
                        toast.error('No se pudo restaurar el alimento.');
                    }
                }
            }
        });
    };

    const confirmDeleteAll = async () => {
        if (isDeletingAll) return;
        setIsDeletingAll(true);
        setShowDeleteConfirm(false);
        const loadingToast = toast.loading('Borrando todos los alimentos...');
        try {
            const { error } = await supabase.from('user_inventory').delete().eq('user_id', session.user.id);
            if (error) throw error;
            
            setInventory([]);
            toast.dismiss(loadingToast);
            toast.success('Todos los alimentos han sido borrados');

            // ── Recalcular lista de compras en background ──
            // Al vaciar la nevera, el delta cambia: ahora se necesitan TODOS los ingredientes del plan.
            try {
                const savedPlan = localStorage.getItem('mealfit_plan');
                if (savedPlan && session?.user?.id) {
                    const planData = JSON.parse(savedPlan);
                    const householdSize = planData?.calc_household_size || 1;
                    const groceryDuration = planData?.calc_grocery_duration || 'weekly';

                    const recalcRes = await fetchWithAuth(`${API_BASE}/api/plans/recalculate-shopping-list`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id: session.user.id,
                            householdSize,
                            groceryDuration
                        })
                    });
                    const result = await recalcRes.json();
                    if (result.success && result.plan_data) {
                        // Limpiar flag de restocked — la despensa fue vaciada
                        delete result.plan_data.is_restocked;
                        localStorage.setItem('mealfit_plan', JSON.stringify(result.plan_data));
                        // Sincronizar con el contexto global para que Dashboard se actualice al instante
                        setPlanData(result.plan_data);
                        toast.success('Lista de compras actualizada', { icon: '🛒', duration: 3000 });
                    }
                }
            } catch (recalcErr) {
                console.warn('⚠️ No se pudo recalcular la lista de compras:', recalcErr);
                // No bloquear al usuario — el delete ya fue exitoso
            }
        } catch (error) {
            console.error("Error deleting all:", error);
            toast.dismiss(loadingToast);
            toast.error('Error al borrar los alimentos');
        } finally {
            setIsDeletingAll(false);
        }
    };

    const handleAddNewItem = async (masterItem) => {
        setIsAdding(true);
        try {
            // Check if already exists in User Inventory
            const existing = inventory.find(i => i.master_ingredient_id === masterItem.id);
            if (existing) {
                // Just add 1 to the existing
                await handleUpdateQuantity(existing.id, existing.quantity + 1);
                toast.success(`Añadido +1 a ${masterItem.name}`);
                setShowAddMenu(false);
                setAddItemSearch('');
                return;
            }

            // Unidad base desde el catálogo maestro (columna default_unit)
            const defaultUnit = masterItem.default_unit || "unidad";

            const newItem = {
                user_id: session.user.id,
                ingredient_name: masterItem.name,
                master_ingredient_id: masterItem.id,
                quantity: 1,
                unit: defaultUnit,
            };

            const { data, error } = await supabase
                .from('user_inventory')
                .upsert([newItem], { onConflict: 'user_id,master_ingredient_id' })
                .select('*, master_ingredients(name, category, default_unit)')
                .single();

            if (error) throw error;

            toast.success(`${masterItem.name} puesto en Nevera.`);
            setInventory(prev => [...prev, data].sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name)));
            setShowAddMenu(false);
            setAddItemSearch('');
        } catch (error) {
            console.error("Add Error: ", error);
            toast.error("Error al añadir alimento.");
        } finally {
            setIsAdding(false);
        }
    };

    // 3. Computed Views
    const filteredInventory = useMemo(() => {
        let textMatch = inventory;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            textMatch = textMatch.filter(i => 
                (i.ingredient_name || i.master_ingredients?.name || '').toLowerCase().includes(q)
            );
        }

        // Agrupar por Categoría del Master (con normalización de duplicados)
        const CATEGORY_NORMALIZE = {
            'Despensa': 'Despensa y Granos',
            'Granos': 'Despensa y Granos',
            'Cereales': 'Cereales y Granos',
            'Carbohidratos': 'Cereales y Granos',
        };
        const grouped = {};
        textMatch.forEach(item => {
            let cat = item.master_ingredients?.category || "OTROS";
            cat = CATEGORY_NORMALIZE[cat] || cat; // Normalizar
            if(!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        });
        return grouped;
    }, [inventory, searchQuery]);

    const suggestedMasterItems = useMemo(() => {
        if (!addItemSearch.trim()) return [];
        const q = addItemSearch.toLowerCase();
        return masterList.filter(m => 
            m.name.toLowerCase().includes(q) || 
            (m.aliases && m.aliases.some(a => a.toLowerCase().includes(q)))
        ).slice(0, 8); // Top 8 suggestions
    }, [addItemSearch, masterList]);

    const handleKeyDown = (e) => {
        if (!suggestedMasterItems.length) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < suggestedMasterItems.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < suggestedMasterItems.length) {
                handleAddNewItem(suggestedMasterItems[selectedIndex]);
            } else if (suggestedMasterItems.length === 1) {
                // Si solo hay una opción y presionan Enter, la agregamos por defecto
                handleAddNewItem(suggestedMasterItems[0]);
            }
        }
    };


    // ESTILOS INLINE Y MASONRY (Reutilizando clases de Dashboard)
    if (loading) {
        return (
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ padding: '0px', paddingBottom: '100px', backgroundColor: '#F8FAFC', minHeight: '100vh' }}
            >
                <style>{`
                    @keyframes shimmer {
                        0% { background-position: -1000px 0; }
                        100% { background-position: 1000px 0; }
                    }
                    .skeleton {
                        background: linear-gradient(90deg, var(--border) 25%, var(--bg-muted) 50%, var(--border) 75%);
                        background-size: 1000px 100%;
                        animation: shimmer 2s infinite linear;
                        border-radius: 0.5rem;
                    }
                `}</style>
                
                {/* Skeleton Header */}
                <header style={{
                     padding: '2rem',
                     background: 'var(--bg-glass)',
                     borderBottom: '1px solid var(--border-light)',
                     marginBottom: '1.5rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="skeleton" style={{ width: '54px', height: '54px', borderRadius: '1rem' }} />
                            <div>
                                <div className="skeleton" style={{ width: '150px', height: '2.2rem', marginBottom: '0.4rem' }} />
                                <div className="skeleton" style={{ width: '200px', height: '1rem' }} />
                            </div>
                        </div>
                        <div className="skeleton" style={{ width: '180px', height: '45px', borderRadius: '99px' }} />
                    </div>

                    <div style={{ marginTop: '1.5rem' }}>
                        <div className="skeleton" style={{ width: '100%', height: '54px', borderRadius: '1rem' }} />
                    </div>
                </header>

                <div style={{ padding: '0 1.5rem' }}>
                    {/* Skeletons para categorías */}
                    {[1, 2].map((catIndex) => (
                        <div key={`cat-${catIndex}`} style={{ marginBottom: '2rem' }}>
                            <div className="skeleton" style={{ width: '180px', height: '1.5rem', marginBottom: '1rem', borderRadius: '0.5rem' }} />
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                {[1, 2, 3, 4].map((itemIndex) => (
                                    <div key={`item-${catIndex}-${itemIndex}`} style={{
                                        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1.2rem', padding: '1.2rem',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        boxShadow: 'var(--shadow-sm)'
                                    }}>
                                        <div style={{ flex: 1, marginRight: '1rem' }}>
                                            <div className="skeleton" style={{ width: '80%', height: '1.2rem', marginBottom: '0.6rem' }} />
                                            <div className="skeleton" style={{ width: '40%', height: '1.5rem', borderRadius: '0.5rem' }} />
                                        </div>
                                        <div className="skeleton" style={{ width: '110px', height: '36px', borderRadius: '99px' }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        );
    }

    return (
        <div className="nevera-page-frame" style={{ padding: '0px', paddingBottom: '100px', backgroundColor: 'var(--bg-page)', minHeight: '100vh', position: 'relative', transition: 'background-color 0.3s' }}>
            <div className="nevera-overlay" />

            <style>{`
                /* === FRIDGE ENCLOSURE FRAME === */
                .nevera-page-frame {
                    border: 2.5px solid rgba(125, 211, 252, 0.75);
                    border-top: 3px solid rgba(186, 230, 253, 0.95);
                    border-bottom: 3px solid rgba(56, 189, 248, 0.65);
                    border-radius: 1.6rem;
                    box-shadow:
                        inset 0 2px 0 rgba(255,255,255,1),
                        inset 0 -2px 0 rgba(255,255,255,0.6),
                        inset 0 0 0 1px rgba(255,255,255,0.65),
                        inset 2px 0 6px -3px rgba(125, 211, 252, 0.35),
                        inset -2px 0 6px -3px rgba(125, 211, 252, 0.35),
                        0 14px 36px -10px rgba(14, 165, 233, 0.25),
                        0 4px 10px -2px rgba(14, 165, 233, 0.12);
                }

                /* === ARCTIC OVERLAY (interior light from above) === */
                .nevera-overlay {
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    z-index: 0;
                    border-radius: 1.6rem;
                    background:
                        radial-gradient(ellipse 80% 35% at 50% 0%, rgba(186, 230, 253, 0.32) 0%, transparent 65%),
                        radial-gradient(circle at 0% 0%, rgba(165, 243, 252, 0.18) 0%, transparent 40%),
                        radial-gradient(circle at 100% 0%, rgba(186, 230, 253, 0.18) 0%, transparent 40%);
                }

                /* === HEADER — frosted glass arctic === */
                .nevera-header {
                    padding: 2rem;
                    background: linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(240, 249, 255, 0.55) 100%);
                    backdrop-filter: blur(20px) saturate(140%);
                    -webkit-backdrop-filter: blur(20px) saturate(140%);
                    border-bottom: 2.5px solid rgba(125, 211, 252, 0.7);
                    border-radius: 1.45rem 1.45rem 0 0;
                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,0.95),
                        0 4px 24px -8px rgba(14, 165, 233, 0.15);
                    margin-bottom: 1.5rem;
                    position: sticky;
                    top: 0;
                    z-index: 40;
                    overflow: hidden;
                }
                .nevera-header::after {
                    content: '';
                    position: absolute;
                    bottom: -2.5px;
                    left: 0;
                    right: 0;
                    height: 1.5px;
                    background: rgba(255,255,255,0.95);
                    pointer-events: none;
                }
                .nevera-header::before {
                    content: '';
                    position: absolute;
                    top: -40px;
                    right: -30px;
                    width: 220px;
                    height: 220px;
                    background:
                        radial-gradient(circle, rgba(125, 211, 252, 0.18) 0%, transparent 60%);
                    pointer-events: none;
                    filter: blur(8px);
                }

                .nevera-top {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 1rem;
                    position: relative;
                }
                .nevera-title-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                .nevera-title-row {
                    display: flex;
                    align-items: center;
                    gap: 0.7rem;
                }
                .nevera-title {
                    margin: 0;
                    font-size: 2.4rem;
                    font-weight: 900;
                    letter-spacing: -0.04em;
                    line-height: 1.1;
                    background: linear-gradient(135deg, #0F172A 0%, #0369A1 100%);
                    -webkit-background-clip: text;
                    background-clip: text;
                    -webkit-text-fill-color: transparent;
                    color: transparent;
                }
                .nevera-snowflake-icon {
                    color: #0EA5E9;
                    filter: drop-shadow(0 0 10px rgba(14, 165, 233, 0.45));
                    animation: nevera-frost-rotate 6s ease-in-out infinite;
                    flex-shrink: 0;
                }
                @keyframes nevera-frost-rotate {
                    0%, 100% { transform: rotate(0deg); opacity: 0.9; }
                    50% { transform: rotate(40deg); opacity: 1; }
                }

                .nevera-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.4rem;
                    margin: 0.5rem 0 0 0;
                    background: linear-gradient(135deg, rgba(186, 230, 253, 0.45) 0%, rgba(207, 250, 254, 0.35) 100%);
                    border: 1px solid rgba(125, 211, 252, 0.5);
                    padding: 0.25rem 0.75rem;
                    border-radius: 99px;
                    backdrop-filter: blur(8px);
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.65);
                }
                .nevera-badge-text {
                    color: #075985;
                    font-weight: 600;
                    font-size: 0.85rem;
                }

                /* === BUTTONS — fridge control panel feel === */
                .nevera-add-btn {
                    background: linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%);
                    color: #FFFFFF;
                    border: 2px solid rgba(125, 211, 252, 0.5);
                    border-top-color: rgba(186, 230, 253, 0.85);
                    border-bottom-color: rgba(3, 105, 161, 0.7);
                    padding: 0.75rem 1.4rem;
                    border-radius: 99px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    cursor: pointer;
                    position: relative;
                    overflow: hidden;
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,0.4),
                        inset 0 -2px 4px -1px rgba(3, 105, 161, 0.4),
                        0 8px 20px -4px rgba(14, 165, 233, 0.5),
                        0 2px 5px rgba(14, 165, 233, 0.18);
                    transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
                }
                .nevera-add-btn:hover {
                    transform: translateY(-1px);
                    border-color: rgba(56, 189, 248, 0.8);
                    border-top-color: rgba(186, 230, 253, 1);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,0.5),
                        inset 0 -2px 4px -1px rgba(3, 105, 161, 0.45),
                        0 12px 26px -4px rgba(14, 165, 233, 0.55),
                        0 3px 6px rgba(14, 165, 233, 0.22);
                }
                .nevera-add-btn:active { transform: scale(0.97); }

                .nevera-delete-all-btn {
                    background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(254, 242, 242, 0.85) 100%);
                    color: #DC2626;
                    border: 2px solid rgba(252, 165, 165, 0.6);
                    border-top-color: rgba(254, 202, 202, 0.95);
                    border-bottom-color: rgba(239, 68, 68, 0.45);
                    padding: 0.75rem 1.4rem;
                    border-radius: 99px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    cursor: pointer;
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,1),
                        inset 0 -2px 4px -1px rgba(252, 165, 165, 0.3),
                        0 4px 12px -2px rgba(220, 38, 38, 0.12),
                        0 1px 3px rgba(0, 0, 0, 0.03);
                    transition: all 0.2s;
                }
                .nevera-delete-all-btn:hover:not(:disabled) {
                    background: linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(254, 226, 226, 0.95) 100%);
                    border-color: rgba(248, 113, 113, 0.75);
                    border-top-color: rgba(254, 202, 202, 1);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,1),
                        inset 0 -2px 4px -1px rgba(248, 113, 113, 0.4),
                        0 8px 18px -3px rgba(220, 38, 38, 0.2),
                        0 2px 4px rgba(0, 0, 0, 0.04);
                }
                .nevera-delete-all-btn:active:not(:disabled) { transform: scale(0.97); }

                /* === SEARCH === */
                .nevera-search-wrap {
                    position: relative;
                    margin-top: 1.5rem;
                }
                .nevera-search-icon {
                    position: absolute;
                    left: 1.1rem;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #0EA5E9;
                    filter: drop-shadow(0 0 6px rgba(14, 165, 233, 0.3));
                    pointer-events: none;
                    z-index: 2;
                }
                .nevera-search-input {
                    width: 100%;
                    padding: 1rem 1rem 1rem 3rem;
                    border-radius: 1rem;
                    border: 2px solid rgba(125, 211, 252, 0.7);
                    border-top-color: rgba(186, 230, 253, 0.95);
                    border-bottom-color: rgba(56, 189, 248, 0.55);
                    outline: none;
                    font-size: 1rem;
                    font-weight: 500;
                    color: var(--text-main);
                    background: linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 249, 255, 0.85) 100%);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,1),
                        inset 0 -2px 4px -1px rgba(125, 211, 252, 0.2),
                        0 4px 12px -3px rgba(14, 165, 233, 0.12);
                    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
                }
                .nevera-search-input::placeholder {
                    color: rgba(100, 116, 139, 0.85);
                    font-weight: 500;
                }
                .nevera-search-input:focus {
                    border-color: #0EA5E9;
                    border-top-color: rgba(186, 230, 253, 1);
                    border-bottom-color: #0369A1;
                    background: linear-gradient(180deg, rgba(255, 255, 255, 1) 0%, rgba(240, 249, 255, 0.95) 100%);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,1),
                        inset 0 -2px 4px -1px rgba(125, 211, 252, 0.25),
                        0 0 0 4px rgba(14, 165, 233, 0.15),
                        0 6px 16px -4px rgba(14, 165, 233, 0.2);
                }

                /* === CATEGORY "SHELF" === */
                .nevera-shelf {
                    margin-bottom: 2.5rem;
                    position: relative;
                    padding-top: 1.5rem;
                }
                .nevera-shelf::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 2px;
                    border-radius: 2px;
                    background: linear-gradient(90deg,
                        transparent 0%,
                        rgba(186, 230, 253, 0.5) 15%,
                        rgba(125, 211, 252, 0.7) 50%,
                        rgba(186, 230, 253, 0.5) 85%,
                        transparent 100%);
                }
                .nevera-shelf::after {
                    content: '';
                    position: absolute;
                    top: 2px;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: linear-gradient(90deg,
                        transparent 0%,
                        rgba(255, 255, 255, 0.85) 50%,
                        transparent 100%);
                }
                .nevera-shelf:first-of-type {
                    padding-top: 0;
                }
                .nevera-shelf:first-of-type::before,
                .nevera-shelf:first-of-type::after {
                    display: none;
                }
                .nevera-shelf-header {
                    font-size: 1.1rem;
                    font-weight: 800;
                    color: var(--text-main);
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin: 0 0 1rem 0;
                }
                .nevera-shelf-count {
                    font-size: 0.75rem;
                    background: linear-gradient(135deg, rgba(186, 230, 253, 0.55) 0%, rgba(207, 250, 254, 0.45) 100%);
                    border: 1px solid rgba(125, 211, 252, 0.45);
                    color: #075985;
                    padding: 0.15rem 0.6rem;
                    border-radius: 99px;
                    font-weight: 800;
                    font-variant-numeric: tabular-nums;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
                }

                /* === ITEM CARDS — fridge bin / drawer look === */
                .nevera-item-card {
                    background: linear-gradient(180deg,
                        rgba(255, 255, 255, 0.96) 0%,
                        rgba(240, 249, 255, 0.88) 50%,
                        rgba(224, 242, 254, 0.82) 100%);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 2px solid rgba(125, 211, 252, 0.75);
                    border-top-color: rgba(186, 230, 253, 0.95);
                    border-bottom-color: rgba(56, 189, 248, 0.55);
                    border-radius: 1rem;
                    padding: 1.2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    position: relative;
                    overflow: hidden;
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,1),
                        inset 0 -3px 8px -2px rgba(125, 211, 252, 0.28),
                        0 6px 18px -4px rgba(14, 165, 233, 0.2),
                        0 2px 4px rgba(0,0,0,0.03);
                    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
                }
                /* Frost shimmer on top (cold surface highlight) */
                .nevera-item-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 35%;
                    background: linear-gradient(180deg,
                        rgba(255, 255, 255, 0.55) 0%,
                        rgba(255, 255, 255, 0) 100%);
                    pointer-events: none;
                    border-radius: 0.85rem 0.85rem 0 0;
                }
                .nevera-item-card > * { position: relative; z-index: 1; }
                .nevera-item-card:hover {
                    transform: translateY(-2px);
                    border-color: rgba(56, 189, 248, 0.85);
                    border-top-color: rgba(186, 230, 253, 1);
                    border-bottom-color: rgba(14, 165, 233, 0.65);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,1),
                        inset 0 -3px 10px -2px rgba(125, 211, 252, 0.4),
                        0 12px 28px -6px rgba(14, 165, 233, 0.28),
                        0 3px 6px rgba(0,0,0,0.04);
                }
                .nevera-item-unit-tag {
                    font-size: 0.78rem;
                    color: #075985;
                    background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(224, 242, 254, 0.9) 100%);
                    border: 1px solid rgba(125, 211, 252, 0.6);
                    padding: 0.18rem 0.6rem;
                    border-radius: 0.4rem;
                    font-weight: 600;
                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,0.85),
                        0 1px 2px rgba(14, 165, 233, 0.08);
                }
                .nevera-item-counter {
                    display: flex;
                    align-items: center;
                    background: rgba(240, 249, 255, 0.85);
                    backdrop-filter: blur(6px);
                    border-radius: 99px;
                    border: 1px solid rgba(186, 230, 253, 0.65);
                    padding: 0.25rem;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
                }

                /* === EMPTY STATE — the card IS a fridge === */
                .nevera-empty-wrapper {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    min-height: calc(100vh - 260px);
                    width: 100%;
                    padding: 2rem 1rem;
                }
                .nevera-empty-fridge {
                    width: 100%;
                    max-width: 340px;
                    min-height: 440px;
                    background: linear-gradient(180deg, #FFFFFF 0%, #F0F9FF 100%);
                    border: 2px solid #BAE6FD;
                    border-radius: 1.5rem;
                    position: relative;
                    box-shadow:
                        0 24px 60px -12px rgba(14, 165, 233, 0.32),
                        0 8px 16px -4px rgba(14, 165, 233, 0.12),
                        inset 0 2px 0 rgba(255,255,255,0.95),
                        inset 0 0 0 1px rgba(255,255,255,0.7);
                    overflow: hidden;
                }

                /* Top freezer compartment */
                .nevera-fridge-freezer {
                    height: 22%;
                    min-height: 90px;
                    background: linear-gradient(180deg, #FAFCFF 0%, #DBEAFE 100%);
                    border-bottom: 2.5px solid #7DD3FC;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.7rem;
                }
                .nevera-fridge-freezer::after {
                    content: '';
                    position: absolute;
                    bottom: -4px;
                    left: 0;
                    right: 0;
                    height: 1.5px;
                    background: rgba(255,255,255,0.95);
                }
                .nevera-fridge-snowflake-icon {
                    color: #0EA5E9;
                    filter: drop-shadow(0 0 10px rgba(14, 165, 233, 0.55));
                    animation: nevera-frost-rotate 6s ease-in-out infinite;
                }
                .nevera-fridge-led {
                    background: #0F172A;
                    color: #10B981;
                    font-family: 'Courier New', 'Menlo', monospace;
                    font-size: 0.7rem;
                    padding: 0.22rem 0.6rem;
                    border-radius: 4px;
                    letter-spacing: 0.12em;
                    font-weight: 700;
                    box-shadow:
                        inset 0 1px 2px rgba(0,0,0,0.5),
                        0 0 10px rgba(16, 185, 129, 0.35);
                }

                /* Right-side door handle */
                .nevera-fridge-handle {
                    position: absolute;
                    right: 16px;
                    top: 34%;
                    width: 5px;
                    height: 38%;
                    background: linear-gradient(180deg, #38BDF8 0%, #0369A1 100%);
                    border-radius: 5px;
                    box-shadow:
                        0 0 12px rgba(14, 165, 233, 0.45),
                        inset 0 1px 0 rgba(255,255,255,0.4);
                    z-index: 2;
                }

                /* Door seam (vertical line in fridge section) */
                .nevera-fridge-seam {
                    position: absolute;
                    top: 22%;
                    bottom: 0;
                    left: 50%;
                    width: 1px;
                    background: linear-gradient(180deg, rgba(125, 211, 252, 0.4) 0%, rgba(125, 211, 252, 0.15) 100%);
                    pointer-events: none;
                }

                /* Interior */
                .nevera-fridge-interior {
                    height: 78%;
                    padding: 1.75rem 1.5rem;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    text-align: center;
                    position: relative;
                }
                .nevera-fridge-interior::before {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 280px;
                    height: 280px;
                    background: radial-gradient(circle, rgba(254, 240, 138, 0.5) 0%, rgba(254, 215, 170, 0.2) 45%, transparent 75%);
                    pointer-events: none;
                    filter: blur(12px);
                    z-index: 0;
                }

                /* Decorative shelves */
                .nevera-fridge-shelf {
                    position: absolute;
                    left: 7%;
                    right: 16%;
                    height: 1.5px;
                    background: linear-gradient(90deg, transparent, rgba(125, 211, 252, 0.65), transparent);
                    border-radius: 2px;
                    pointer-events: none;
                    z-index: 0;
                }
                .nevera-fridge-shelf::after {
                    content: '';
                    position: absolute;
                    top: 1.5px;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent);
                }
                .nevera-fridge-shelf-1 { top: 26%; }
                .nevera-fridge-shelf-2 { top: 72%; }

                .nevera-fridge-message {
                    position: relative;
                    z-index: 1;
                    max-width: 280px;
                }
                .nevera-fridge-message h3 {
                    color: #0F172A;
                    font-size: 1.2rem;
                    font-weight: 800;
                    margin: 0 0 0.5rem 0;
                    letter-spacing: -0.01em;
                }
                .nevera-fridge-message p {
                    color: #475569;
                    font-size: 0.88rem;
                    line-height: 1.5;
                    margin: 0;
                }

                /* Subtle floor shadow under the fridge */
                .nevera-empty-fridge::after {
                    content: '';
                    position: absolute;
                    bottom: -22px;
                    left: 10%;
                    right: 10%;
                    height: 18px;
                    background: radial-gradient(ellipse at center, rgba(14, 165, 233, 0.25) 0%, transparent 70%);
                    filter: blur(8px);
                    pointer-events: none;
                    z-index: -1;
                }

                /* === DESKTOP — hide redundant title (sidebar already shows "Nevera") === */
                @media (min-width: 641px) {
                    .nevera-title-row {
                        display: none;
                    }
                }

                /* === MOBILE === */
                @media (max-width: 640px) {
                    .nevera-header {
                        padding: 1.25rem 1rem;
                    }
                    .nevera-top {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 1.25rem;
                    }
                    .nevera-title-wrapper {
                        gap: 0.75rem;
                    }
                    .nevera-title {
                        font-size: 2rem !important;
                    }
                    .nevera-badge-text {
                        font-size: 0.75rem !important;
                        white-space: nowrap;
                    }
                    .nevera-add-btn {
                        flex: 1;
                    }
                }
            `}</style>
            
            {/* Header / Nav */}
            <header className="nevera-header">
                <div className="nevera-top">
                    <div className="nevera-title-wrapper">
                        <div>
                            <div className="nevera-title-row">
                                <Snowflake size={30} strokeWidth={2.25} className="nevera-snowflake-icon" />
                                <h1 className="nevera-title">Nevera</h1>
                            </div>
                            <div className="nevera-badge">
                                <span className="nevera-badge-text">Solo lo que tienes</span>
                                <span style={{ fontSize: '0.85rem' }}>🔒</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button 
                            onClick={() => setShowDeleteConfirm(true)}
                            className="nevera-delete-all-btn"
                            disabled={inventory.length === 0}
                            style={{ opacity: inventory.length === 0 ? 0.5 : 1, cursor: inventory.length === 0 ? 'not-allowed' : 'pointer' }}
                        >
                            <Trash2 strokeWidth={2.5} size={18} /> Borrar Todos
                        </button>
                        <button 
                            onClick={() => setShowAddMenu(true)}
                            className="nevera-add-btn"
                        >
                            <Plus strokeWidth={3} size={18} /> Añadir Alimento
                        </button>
                    </div>
                </div>

                {/* Main Search */}
                <div className="nevera-search-wrap">
                    <Search size={20} strokeWidth={2.25} className="nevera-search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar ingrediente..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="nevera-search-input"
                    />
                </div>
            </header>

            {/* Listado de Inventario Groupped by Category */}
            <div style={{ padding: '0 1.5rem' }}>
                
                {Object.keys(filteredInventory).length === 0 ? (
                  <div className="nevera-empty-wrapper">
                     <motion.div
                        className="nevera-empty-fridge"
                        initial={{ opacity: 0, scale: 0.95, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                    >
                        {/* Top freezer compartment with snowflake + LED display */}
                        <div className="nevera-fridge-freezer">
                            <Snowflake size={22} strokeWidth={2.5} className="nevera-fridge-snowflake-icon" />
                            <span className="nevera-fridge-led">-- 4°C</span>
                        </div>

                        {/* Right-side handle */}
                        <div className="nevera-fridge-handle" />

                        {/* Vertical seam between doors */}
                        <div className="nevera-fridge-seam" />

                        {/* Interior */}
                        <div className="nevera-fridge-interior">
                            {/* Decorative shelves */}
                            <div className="nevera-fridge-shelf nevera-fridge-shelf-1" />
                            <div className="nevera-fridge-shelf nevera-fridge-shelf-2" />

                            <div className="nevera-fridge-message">
                                <h3>Tu Nevera está vacía</h3>
                                <p>El corazón de tu plan está esperando. Registra tus compras recientes o añade tus primeros ingredientes a mano.</p>
                            </div>
                        </div>
                     </motion.div>
                  </div>
                ) : (
                    <AnimatePresence>
                        {Object.keys(filteredInventory).sort().map(category => {
                            const CategoryIcon = getCategoryIcon(category);
                            return (
                            <motion.div
                                key={category}
                                className="nevera-shelf"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            >
                                <h2 className="nevera-shelf-header">
                                    <CategoryIcon size={20} strokeWidth={2.25} style={{ color: '#0EA5E9', flexShrink: 0 }} />
                                    {category}
                                    <span className="nevera-shelf-count">{filteredInventory[category].length}</span>
                                </h2>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                    {filteredInventory[category].map(item => {
                                        const normalizedName = item.ingredient_name.toLowerCase().trim();
                                        const isDisabled = disabledIngredients.includes(normalizedName);

                                        return (
                                        <motion.div
                                            key={item.id}
                                            className="nevera-item-card"
                                            layout
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            style={{
                                                opacity: isDisabled ? 0.5 : 1,
                                                filter: isDisabled ? 'grayscale(100%)' : 'none'
                                            }}
                                        >
                                            <div style={{ flex: 1, marginRight: '1rem', textDecoration: isDisabled ? 'line-through' : 'none' }}>
                                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: isDisabled ? 'var(--danger)' : 'var(--text-main)', lineHeight: 1.2 }}>{item.ingredient_name}</h3>
                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <span className="nevera-item-unit-tag">Unidad base: {item.unit}</span>
                                                    {isDisabled && <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Trash2 size={12}/> Pendiente de eliminación</span>}
                                                </div>
                                            </div>

                                            {/* Controlador Inteligente */}
                                            <div className="nevera-item-counter">
                                                {item.quantity <= 1 ? (
                                                    <button 
                                                        onClick={() => handleUpdateQuantity(item.id, 0)} 
                                                        style={{ border:'none', background:'none', padding:'0.5rem', color:'var(--danger)', cursor:'pointer', touchAction: 'manipulation' }}
                                                    >
                                                        {savingItem === item.id ? <Loader2 size={16} className="spin-fast" /> : <Trash2 size={16} strokeWidth={2.5}/>}
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onPointerDown={(e) => startHolding(e, item.id, -1)}
                                                        onPointerUp={(e) => stopHolding(e, item.id)}
                                                        onPointerLeave={(e) => stopHolding(e, item.id)}
                                                        onContextMenu={(e) => e.preventDefault()}
                                                        style={{ border:'none', background:'none', padding:'0.5rem', color:'var(--text-muted)', cursor:'pointer', userSelect: 'none', touchAction: 'manipulation' }}
                                                    >
                                                        <Minus size={16} strokeWidth={2.5}/>
                                                    </button>
                                                )}
                                                
                                                <span style={{ width: '2.5rem', textAlign: 'center', fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {item.quantity}
                                                </span>

                                                <button
                                                    onPointerDown={(e) => startHolding(e, item.id, 1)}
                                                    onPointerUp={(e) => stopHolding(e, item.id)}
                                                    onPointerLeave={(e) => stopHolding(e, item.id)}
                                                    onContextMenu={(e) => e.preventDefault()}
                                                    style={{ border:'none', background:'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)', color:'white', borderRadius:'99px', padding:'0.5rem', cursor:'pointer', boxShadow:'0 4px 12px -2px rgba(14, 165, 233, 0.45), inset 0 1px 0 rgba(255,255,255,0.2)', userSelect: 'none', touchAction: 'manipulation' }}
                                                >
                                                    <Plus size={16} strokeWidth={3}/>
                                                </button>
                                            </div>
                                        </motion.div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>

            {/* Modal "Nuevo Alimento" Estilo App */}
            <AnimatePresence>
                {showAddMenu && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => { setShowAddMenu(false); setAddItemSearch(''); }}
                            style={{ position: 'fixed', inset: 0, background: 'var(--bg-glass)', backdropFilter: 'blur(4px)', zIndex: 100 }}
                        />
                        <motion.div 
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            style={{
                                position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg-card)',
                                borderRadius: '2rem 2rem 0 0', padding: '2rem', zIndex: 101,
                                boxShadow: '0 -10px 40px rgba(0,0,0,0.1)', maxHeight: '85vh', display: 'flex', flexDirection: 'column'
                            }}
                        >
                            <div style={{ width: '40px', height: '5px', background: 'var(--border)', borderRadius: '10px', margin: '0 auto 1.5rem', opacity: 0.8 }} />
                            
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 1rem 0', color: 'var(--text-main)' }}>Registrar Nuevo Alimento</h2>
                            
                            <div style={{ position: 'relative', marginBottom: '1rem' }}>
                                <SearchIcon color="var(--text-light)" size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                                <input 
                                    autoFocus
                                    type="text" 
                                    placeholder="Buscar en el catálogo semántico..." 
                                    value={addItemSearch}
                                    onChange={e => setAddItemSearch(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    style={{
                                        width: '100%', padding: '1.2rem 1rem 1.2rem 3rem', borderRadius: '1rem', border: '2px solid var(--border)',
                                        outline: 'none', fontSize: '1.1rem', fontWeight: 500, background: 'var(--bg-page)', color: 'var(--text-main)'
                                    }}
                                />
                            </div>

                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                                <AlertCircle size={14} /> El buscador utiliza el Catálogo Maestro para evitar redundancias.
                            </p>

                            {/* Resultados de búsqueda (Scrollable) */}
                            <div style={{ overflowY: 'auto', flex: 1, paddingBottom: '2rem' }}>
                                {suggestedMasterItems.map((item, index) => (
                                    <div 
                                        key={item.id}
                                        onClick={() => handleAddNewItem(item)}
                                        onMouseEnter={() => setSelectedIndex(index)}
                                        style={{
                                            padding: '1rem', borderBottom: '1px solid var(--bg-muted)', display: 'flex',
                                            justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                                            backgroundColor: index === selectedIndex ? 'var(--bg-muted)' : 'transparent',
                                            borderRadius: index === selectedIndex ? '0.5rem' : '0',
                                            transition: 'background-color 0.2s'
                                        }}
                                    >
                                        <div>
                                            <h4 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>{item.name}</h4>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.2rem', display: 'block' }}>
                                                Alias incl.: {item.aliases?.slice(0, 3).join(', ')}{item.aliases?.length > 3 ? '...' : ''}
                                            </span>
                                        </div>
                                        <button disabled={isAdding} style={{
                                            background: 'var(--bg-muted)', color: 'var(--secondary)', border: '1px solid var(--border)', padding: '0.5rem 1rem',
                                            borderRadius: '99px', fontWeight: 700, cursor: 'pointer'
                                        }}>
                                            Elegir
                                        </button>
                                    </div>
                                ))}
                                
                                {addItemSearch.trim() && suggestedMasterItems.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                                        No existe en el catálogo maestro todavía.
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Modal de Confirmación Borrar Todos */}
            <AnimatePresence>
                {showDeleteConfirm && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowDeleteConfirm(false)}
                            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', zIndex: 200 }}
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: '-50%', x: '-50%' }} animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }} exit={{ opacity: 0, scale: 0.95, y: '-50%', x: '-50%' }}
                            style={{
                                position: 'fixed', top: '50%', left: '50%',
                                background: 'var(--bg-card)', borderRadius: '1.5rem', padding: '2rem', zIndex: 201,
                                width: '90%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', color: 'var(--danger, #ef4444)' }}>
                                <AlertCircle size={56} strokeWidth={1.5} />
                            </div>
                            <h2 style={{ textAlign: 'center', margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>¿Vaciar la Nevera?</h2>
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.5 }}>
                                Estás a punto de borrar <strong>todos los alimentos</strong> de la despensa. Esta acción no se puede deshacer.
                            </p>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button 
                                    onClick={() => setShowDeleteConfirm(false)}
                                    style={{ flex: 1, padding: '1rem', background: 'var(--bg-muted)', color: 'var(--text-main)', border: 'none', borderRadius: '1rem', fontWeight: 700, cursor: 'pointer', transition: 'background-color 0.2s' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={confirmDeleteAll}
                                    style={{ flex: 1, padding: '1rem', background: 'var(--danger, #ef4444)', color: 'white', border: 'none', borderRadius: '1rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)', transition: 'transform 0.1s' }}
                                    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                                    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    <Trash2 size={18} strokeWidth={2.5}/> Sí, vaciar
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

        </div>
    );
};

export default Pantry;
