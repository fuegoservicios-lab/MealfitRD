import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAssessment } from '../context/AssessmentContext';
import { supabase } from '../supabase';
import { Search, Plus, Minus, Trash2, Loader2, Save, X, Search as SearchIcon, AlertCircle, Snowflake, Beef, Drumstick, Fish, Egg, Apple, Carrot, Salad, Milk, Wheat, Croissant, Cookie, Nut, GlassWater, Package, Leaf, Droplets, Flame, ShoppingBasket, RotateCcw, PackageX, ChevronLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, API_BASE } from '../config/api';
import { getShelfLifeBadge, getShelfLifeBadgeStyle } from '../utils/shelfLife';
import { safeJSONParseObject } from '../utils/safeJSONParse';
// [P2-LOCALSTORAGE-GETITEM-DEFENSIVE · 2026-05-15] read defensivo para
// `mealfit_disabled_ingredients` en el useEffect mount (línea 88+).
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/safeLocalStorage';
import { emitCoherenceToast } from '../utils/renderCoherenceWarnings';

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

// [P3-C · 2026-05-08] El helper `getEstimatedDailyConsumption` vive en
// `frontend/src/utils/pantryConsumption.js` para que sea testeable sin
// arrastrar este componente al bundle de tests.

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

    // [ADD-FOODS-2026-05-18] Flujo "Añadir Alimento" en 2 pasos:
    //   'search'  → autocomplete sobre master_ingredients (paso 1).
    //   'details' → formulario nombre/categoría/cantidad/unidad (paso 2),
    //               disparado al elegir un master O al crear personalizado.
    // `addFormData` mantiene los valores del formulario del paso 2.
    // Cuando `masterItem` está presente, es un master conocido (puede tener
    // master_ingredient_id); cuando es null, el usuario está creando un item
    // 100% custom (master_ingredient_id se persiste como NULL).
    const [addStep, setAddStep] = useState('search');
    const [addFormData, setAddFormData] = useState({
        masterItem: null,
        name: '',
        category: 'Despensa',
        quantity: '1',
        unit: 'unidad',
    });

    // Resetear focus activo al cambiar búsqueda o cerrar modal
    useEffect(() => {
        setSelectedIndex(-1);
    }, [addItemSearch, showAddMenu]);

    const [disabledIngredients, setDisabledIngredients] = useState([]);

    useEffect(() => {
        const checkDisabled = () => {
            // [P2-LOCALSTORAGE-GETITEM-DEFENSIVE · 2026-05-15] safeLocalStorageGet
            // — iOS Private Mode lanza SecurityError en getItem y rompía
            // este useEffect (Pantry no se hidrataba en initial mount).
            const saved = safeLocalStorageGet('mealfit_disabled_ingredients', null);
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

    // Estado "Agotados": items que el usuario marcó como agotados o eliminó
    // manualmente. Se guarda en localStorage (mismo patrón que disabledIngredients)
    // y NO toca la DB — semánticamente "agotado" === "ya no lo tengo", que es
    // idéntico para el backend a "eliminado". El visual es puramente client-side.
    const [depletedItems, setDepletedItems] = useState([]);

    const _depletedKey = (entryOrItem) => {
        const masterId = entryOrItem?.master_ingredient_id;
        if (masterId) return `m:${masterId}`;
        const name = entryOrItem?.ingredient_name || entryOrItem?.name || '';
        return `n:${String(name).toLowerCase().trim()}`;
    };

    const _persistDepleted = (next) => {
        setDepletedItems(next);
        if (next.length === 0) {
            safeLocalStorageRemove('mealfit_depleted_items');
        } else {
            safeLocalStorageSet('mealfit_depleted_items', JSON.stringify(next));
        }
    };

    const _addDepleted = (item) => {
        // Capturamos la cantidad en el momento de agotar para que Reponer
        // devuelva el mismo número (ej: 2 limones → agotar → reponer → 2).
        // Fallback a 1 si el item llega sin quantity (defensive).
        const snapshotQty = (typeof item.quantity === 'number' && item.quantity > 0)
            ? item.quantity
            : 1;
        const entry = {
            master_ingredient_id: item.master_ingredient_id || null,
            ingredient_name: item.ingredient_name,
            quantity: snapshotQty,
            unit: item.unit,
            category: item.master_ingredients?.category || 'OTROS',
            shelf_life_days: item.master_ingredients?.shelf_life_days || null,
            depleted_at: new Date().toISOString(),
        };
        const k = _depletedKey(entry);
        const next = [...depletedItems.filter(e => _depletedKey(e) !== k), entry];
        _persistDepleted(next);
    };

    const _removeDepleted = (entryOrItem) => {
        const k = _depletedKey(entryOrItem);
        const next = depletedItems.filter(e => _depletedKey(e) !== k);
        if (next.length !== depletedItems.length) _persistDepleted(next);
    };

    useEffect(() => {
        const hydrate = () => {
            const saved = safeLocalStorageGet('mealfit_depleted_items', null);
            if (!saved) { setDepletedItems([]); return; }
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) setDepletedItems(parsed);
            } catch (e) { setDepletedItems([]); }
        };
        hydrate();
        window.addEventListener('storage', hydrate);
        return () => window.removeEventListener('storage', hydrate);
    }, []);

    // Lock/Debounce por item para el guardado 
    const pendingOps = useRef(new Map()); // id -> { baselineQty, targetQty, timeout }
    const masterListLoaded = useRef(false);

    // Refs para modo sostenido (velocímetro)
    const holdIntervalRef = useRef({});
    const holdTimeoutRef = useRef({});
    const inventoryRef = useRef([]);

    // [P2-NEW-12 · 2026-05-11] Debounce coalescente trailing para
    // `_recalcShoppingListAfterPantryChange`. Refs vs state porque NO
    // queremos re-render por cada burst de add/delete.
    const _recalcDebounceTimer = useRef(null);
    const _recalcInFlight = useRef(false);
    const _recalcPendingAfterFlight = useRef(false);
    const _RECALC_DEBOUNCE_MS = 500; // P2-NEW-12: ventana coalescente

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
                    .select('*, master_ingredients(name, category, default_unit, shelf_life_days)')
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
                .select('*, master_ingredients(name, category, default_unit, shelf_life_days)')
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
    // [P3-AUDIT-8 · 2026-05-10] Helper SSOT para recalcular la lista de
    // compras tras un cambio en el SET de items de la nevera (add/delete).
    //
    // ANTES, solo `confirmDeleteAll` ejecutaba este flow inline; añadir o
    // eliminar un item individual NO invalidaba el `mealfit_plan` cacheado
    // ni notificaba al Dashboard. El PDF (`Dashboard.jsx handleDownloadShoppingList`)
    // sí refresca con `fetchFreshInventoryWithTimeout` antes de renderizar,
    // pero el DISPLAY in-app del Dashboard usaba la lista del plan cacheada
    // hasta el siguiente full refresh → user veía un item recién comprado
    // todavía en la lista "por comprar".
    //
    // NO se invoca tras `handleUpdateQuantity` porque los cambios de
    // cantidad ya quedan reflejados via el RPC `increment_inventory_quantity`
    // (que actualiza user_inventory directo) + el render del Dashboard
    // recalcula sobre liveInventory. Llamar al recalc en cada qty change
    // dispararía N HTTP innecesarios por la ráfaga del velocímetro turbo.
    //
    // Best-effort: si el recálculo falla, NO bloquea al usuario — el
    // cambio en pantry ya se persistió y el PDF lo recoge en la próxima
    // generación.
    const _recalcShoppingListAfterPantryChange = async ({
        silentSuccess = true,
        clearRestockedFlag = false,
    } = {}) => {
        try {
            const savedPlan = localStorage.getItem('mealfit_plan');
            if (!savedPlan || !session?.user?.id) return;

            let planData = safeJSONParseObject(savedPlan);
            if (!planData.calc_household_size && !planData.calc_grocery_duration) {
                // Storage corrupto/vacío: skip silencioso. El flujo principal
                // (carga desde DB en próximo mount) lo restaurará.
                console.warn('[Pantry] mealfit_plan storage no parseable; skip recalc.');
                return;
            }

            // [P2-NEW-4 · 2026-05-11] Pre-check defensive: si el plan
            // cambió en background (shift_plan, regen, restore), el
            // cliente puede tener `calc_household_size`/`calc_grocery_duration`
            // de un plan viejo. Aplicarlos al recalc generaría una lista
            // con household incorrecto.
            //
            // Defensa: lectura barata del plan actual del usuario antes
            // del recalc. Si el `id` o `updated_at` cambiaron, recargamos
            // localStorage desde DB y usamos los valores frescos.
            //
            // Patrón best-effort: cualquier fallo del pre-check NO debe
            // abortar el recalc — caemos al comportamiento previo.
            try {
                // calc_household_size / calc_grocery_duration NO son columnas
                // top-level en meal_plans — viven dentro de plan_data jsonb.
                // Pedirlas en el SELECT producía 400 silencioso (absorbido por
                // el try/catch, ruido en consola). Las leemos del jsonb abajo.
                const { data: latestRows, error: latestErr } = await supabase
                    .from('meal_plans')
                    .select('id, updated_at, plan_data')
                    .eq('user_id', session.user.id)
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (!latestErr && latestRows && latestRows.length > 0) {
                    const latest = latestRows[0];
                    const localId = planData?.id;
                    const localUpdatedAt = planData?.updated_at;
                    if (
                        latest.id &&
                        localId &&
                        (latest.id !== localId ||
                         (latest.updated_at && localUpdatedAt && latest.updated_at !== localUpdatedAt))
                    ) {
                        console.warn(
                            '[P2-NEW-4] Plan drift detected pre-recalc: ' +
                            `local=${localId} (${localUpdatedAt}), ` +
                            `latest=${latest.id} (${latest.updated_at}). ` +
                            'Refrescando localStorage antes del recalc.'
                        );
                        // Refrescar planData con el plan real.
                        const fresh = latest.plan_data || {};
                        // Inyectar campos top-level que el recalc necesita.
                        // calc_household_size / calc_grocery_duration ya están
                        // dentro de plan_data jsonb (i.e. `fresh.calc_...`), no
                        // hace falta sobreescribirlas con columnas inexistentes.
                        fresh.id = latest.id;
                        fresh.updated_at = latest.updated_at;
                        try {
                            localStorage.setItem('mealfit_plan', JSON.stringify(fresh));
                        } catch (_lsErr) { /* localStorage best-effort */ }
                        planData = fresh;
                        try { setPlanData(fresh); } catch (_setErr) { /* setter best-effort */ }
                    }
                }
            } catch (_prefetchErr) {
                console.warn('[P2-NEW-4] Plan freshness prefetch falló (best-effort):', _prefetchErr);
            }

            const householdSize = planData?.calc_household_size || 1;
            const groceryDuration = planData?.calc_grocery_duration || 'weekly';

            // [P3-RECALC-503-CLASSIFICATION · 2026-05-16] Retry 1× en
            // 5xx/network. Backend escala transient (pool exhaustion,
            // RemoteProtocolError) → 503; este recalc post-pantry es
            // no-crítico (cambio ya persistido) pero el retry evita
            // toast "no se pudo recalcular" en blips.
            const recalcBody = JSON.stringify({
                user_id: session.user.id,
                householdSize,
                groceryDuration,
                // [P2-NEW-4] plan_id incluido para que el backend pueda
                // loggear/rechazar drift si recibe un id que ya no es el
                // último del usuario.
                // [P2-NEW-B · 2026-05-11] El backend ahora resuelve el
                // plan target con SELECT explícito `WHERE id=%s AND
                // user_id=%s` cuando el body lleva plan_id (en lugar de
                // fallback a `get_latest_meal_plan_with_id`). Cierra
                // race con _chunk_worker creando plan B en paralelo.
                plan_id: planData?.id,
            });
            const attemptRecalc = async () => {
                try {
                    const r = await fetchWithAuth(`${API_BASE}/api/plans/recalculate-shopping-list`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: recalcBody,
                    });
                    return { res: r, networkError: null };
                } catch (e) {
                    return { res: null, networkError: e };
                }
            };
            let { res: recalcRes, networkError } = await attemptRecalc();
            const isTransient = networkError || (recalcRes && recalcRes.status >= 500);
            if (isTransient) {
                await new Promise((r) => setTimeout(r, 500));
                ({ res: recalcRes, networkError } = await attemptRecalc());
            }
            if (networkError) throw networkError;
            const result = await recalcRes.json();
            if (result.success && result.plan_data) {
                if (clearRestockedFlag) {
                    // confirmDeleteAll limpia `is_restocked` porque la
                    // despensa fue vaciada por completo. Para add/delete
                    // individual no tocamos este flag (el restock parcial
                    // sigue siendo válido).
                    delete result.plan_data.is_restocked;
                }
                localStorage.setItem('mealfit_plan', JSON.stringify(result.plan_data));
                setPlanData(result.plan_data);
                if (!silentSuccess) {
                    toast.success('Lista de compras actualizada', { icon: '🛒', duration: 3000 });
                }
                // [P2-AUDIT-NEW-1 · 2026-05-12] Consumir `_coherence_warnings`
                // que el backend emite cuando el guard P2-COHERENCE-1 detecta
                // drift recetas↔lista durante el recalc. Toast no-bloqueante
                // (silencio si la key está ausente o lista vacía — endpoints
                // legacy que no emiten warnings siguen funcionando igual).
                emitCoherenceToast(toast, result._coherence_warnings);
            }
        } catch (recalcErr) {
            // No bloquear al usuario — el cambio en pantry ya se persistió.
            console.warn('⚠️ No se pudo recalcular la lista de compras:', recalcErr);
        }
    };

    // [P2-NEW-12 · 2026-05-11] Wrapper coalescente para los callsites
    // add/delete INDIVIDUALES (no para `confirmDeleteAll` que mantiene
    // semántica await directa — toast post-éxito).
    //
    // Garantías:
    //   - Múltiples invocaciones dentro de `_RECALC_DEBOUNCE_MS` (500ms)
    //     producen UN solo HTTP a `/api/plans/recalculate-shopping-list`.
    //   - Si una invocación llega mientras OTRO recalc está en flight,
    //     se marca `_recalcPendingAfterFlight=true` y al terminar el
    //     en-flight se dispara UN recalc adicional (preserva el último
    //     estado de la nevera).
    //   - El timer se cancela en unmount via efecto de cleanup más abajo.
    //
    // Trade-off consciente: descarta args (`silentSuccess`/`clearRestockedFlag`)
    // — los 3 callsites debounced no los pasaban en su forma original
    // (línea 473, 485, 567 invocaban sin args). El path `confirmDeleteAll`
    // (línea 510, que SÍ pasa args) sigue inline sin debounce.
    const _scheduleRecalcShoppingList = () => {
        if (_recalcInFlight.current) {
            // Hay un recalc corriendo — marcamos pendiente y volveremos
            // a schedule al terminar.
            _recalcPendingAfterFlight.current = true;
            return;
        }
        if (_recalcDebounceTimer.current) {
            clearTimeout(_recalcDebounceTimer.current);
        }
        _recalcDebounceTimer.current = setTimeout(async () => {
            _recalcDebounceTimer.current = null;
            _recalcInFlight.current = true;
            try {
                await _recalcShoppingListAfterPantryChange();
            } finally {
                _recalcInFlight.current = false;
                if (_recalcPendingAfterFlight.current) {
                    _recalcPendingAfterFlight.current = false;
                    // Re-schedule trailing: respeta debounce window.
                    _scheduleRecalcShoppingList();
                }
            }
        }, _RECALC_DEBOUNCE_MS);
    };

    // Cleanup del timer si el componente se desmonta mid-debounce —
    // evita warning "state update on unmounted component" si el recalc
    // resolve después del unmount y modifica state.
    useEffect(() => {
        return () => {
            if (_recalcDebounceTimer.current) {
                clearTimeout(_recalcDebounceTimer.current);
                _recalcDebounceTimer.current = null;
            }
        };
    }, []);

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
    //
    // Reglas de floor (P-FIX agotar-vs-decrement):
    //   - El botón "-" SOLO decrementa cantidad. Tiene piso en qty=1.
    //     Para eliminar/agotar el usuario tiene los botones explícitos
    //     (trash al llegar a qty=1, o "Agotar" siempre visible).
    //   - Sin este floor, mantener "-" presionado >400ms hacía que el
    //     turbo decrementara 2→1→0 en ~480ms, eliminando + marcando
    //     como agotado sin intención del usuario.
    const startHolding = (e, id, step) => {
        if (e) e.preventDefault(); // prevenir double click zoom
        const item = inventoryRef.current.find(i => i.id === id);
        if (!item) return;

        const _floor = step < 0 ? 1 : -Infinity; // "-" no baja de 1; "+" sin tope
        let currentQty = getLatestQuantity(id) + step;
        if (currentQty < _floor) return; // primera pulsación bajo el floor: no-op
        handleUpdateQuantity(id, currentQty);

        holdTimeoutRef.current[id] = setTimeout(() => {
            holdIntervalRef.current[id] = setInterval(() => {
                currentQty += step;
                if (step < 0 && currentQty < _floor) {
                    // El turbo llegó al piso (qty=1). Detener el interval —
                    // el usuario deberá soltar y dar click explícito en el
                    // botón trash o "Agotar" para eliminar.
                    stopHolding(null, id);
                    return;
                }
                if (currentQty < 0) currentQty = 0;
                handleUpdateQuantity(id, currentQty);
            }, 80); // <--- Velocidad supersónica (80ms = turbo)
        }, 400);
    };

    const handleDeleteItem = async (id, opts = {}) => {
        const { markAsDepleted = true } = opts;
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

        // Marcar como "agotado" para que siga visible en el listado con la
        // etiqueta AGOTADO. Si el caller no quiere ese visual (delete duro
        // desde la sección de agotados), pasa markAsDepleted=false.
        if (markAsDepleted) _addDepleted(deletedItem);

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
                            .select('*, master_ingredients(name, category, default_unit, shelf_life_days)')
                            .single();

                        if (error) throw error;

                        // Insertar nueva data devuelta por DB
                        setInventory(prev =>
                            [...prev.filter(i => i.id !== oldId), data].sort((a, b) =>
                                a.ingredient_name.localeCompare(b.ingredient_name)
                            )
                        );
                        // Salió del estado "agotado" porque el usuario lo recuperó.
                        _removeDepleted(deletedItem);
                        toast.success(`${deletedItem.ingredient_name} restaurado`, { icon: '↩️', duration: 2000 });
                        // [P3-AUDIT-8] Revertir el delta: el item está de
                        // vuelta, la lista de compras debe excluirlo otra vez.
                        // [P2-NEW-12 · 2026-05-11] Debounced — undo masivo no
                        // genera N recalcs paralelos.
                        _scheduleRecalcShoppingList();
                    } catch (err) {
                        console.error('Error restaurando item:', err);
                        toast.error('No se pudo restaurar el alimento.');
                    }
                }
            }
        });

        // [P3-AUDIT-8 · 2026-05-10] Recalcular lista tras delete individual.
        // Sin esto el Dashboard mostraría el item recién eliminado todavía
        // como "ya en nevera" en su display in-app.
        // [P2-NEW-12 · 2026-05-11] Debounced — delete masivo no genera N
        // recalcs paralelos al backend.
        _scheduleRecalcShoppingList();
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
            // Vaciar también la lista de "agotados" — el usuario está empezando
            // desde cero, no tiene sentido conservar recordatorios viejos.
            _persistDepleted([]);
            toast.dismiss(loadingToast);
            toast.success('Todos los alimentos han sido borrados');

            // [P3-AUDIT-8 · 2026-05-10] Delega al helper SSOT. Pasa
            // `clearRestockedFlag=true` porque vaciar la nevera invalida
            // cualquier restock previo; `silentSuccess=false` muestra el
            // toast "Lista actualizada" porque vaciar todo es operación
            // mayor (vs add/delete individual que es silencioso).
            //
            // Previamente este bloque vivía inline (~50 LOC duplicadas
            // contra el helper). Refactor cierra drift y simplifica el
            // cierre del gap P3-AUDIT-8 (un solo path de recálculo).
            await _recalcShoppingListAfterPantryChange({
                silentSuccess: false,
                clearRestockedFlag: true,
            });
        } catch (error) {
            console.error("Error deleting all:", error);
            toast.dismiss(loadingToast);
            toast.error('Error al borrar los alimentos');
        } finally {
            setIsDeletingAll(false);
        }
    };

    // [ADD-FOODS-2026-05-18] Helpers del flujo "Añadir Alimento" en 2 pasos.
    // El step 'details' aparece después de que el usuario:
    //   (a) elige un master del autocomplete → openAddDetailsForMaster(master)
    //   (b) hace click en "Crear personalizado" → openAddDetailsForCustom()
    // Pre-rellenamos el formulario con defaults sensatos para que el camino
    // happy-path siga siendo de un click (Enter en el form lo confirma).
    const _closeAddModal = () => {
        setShowAddMenu(false);
        setAddItemSearch('');
        setAddStep('search');
        setAddFormData({ masterItem: null, name: '', category: 'Despensa', quantity: '1', unit: 'unidad' });
    };

    const openAddDetailsForMaster = (masterItem) => {
        setAddFormData({
            masterItem,
            name: masterItem.name,
            category: masterItem.category || 'Despensa',
            quantity: '1',
            unit: masterItem.default_unit || 'unidad',
        });
        setAddStep('details');
    };

    const openAddDetailsForCustom = () => {
        const presetName = (addItemSearch || '').trim();
        setAddFormData({
            masterItem: null,
            name: presetName,
            category: 'Despensa',
            quantity: '1',
            unit: 'unidad',
        });
        setAddStep('details');
    };

    // [ADD-FOODS-2026-05-18] Persistencia del paso 2. Acepta el form completo
    // y un masterItem opcional. Lógica de merge:
    //   - Si hay masterItem y ya existe por master_ingredient_id → suma qty.
    //   - Si no hay masterItem (custom) y existe row con mismo (name, unit)
    //     → suma qty (matches el UNIQUE (user_id, ingredient_name, unit)).
    //   - Sino INSERT nuevo. category solo se guarda para items custom
    //     (los master resuelven categoría vía join con master_ingredients).
    const handleSaveAddForm = async () => {
        if (isAdding) return;

        const name = (addFormData.name || '').trim();
        const qty = parseFloat(addFormData.quantity);
        const unit = (addFormData.unit || '').trim() || 'unidad';
        const category = (addFormData.category || '').trim() || null;
        const masterItem = addFormData.masterItem;

        if (!name) {
            toast.error('Pónle un nombre al alimento.');
            return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
            toast.error('La cantidad debe ser mayor que 0.');
            return;
        }

        setIsAdding(true);
        try {
            _removeDepleted({
                master_ingredient_id: masterItem?.id || null,
                ingredient_name: name,
            });

            const nameLc = name.toLowerCase();
            const unitLc = unit.toLowerCase();
            const existing = inventory.find(i => {
                if (masterItem && i.master_ingredient_id === masterItem.id) return true;
                if (!masterItem
                    && (i.ingredient_name || '').toLowerCase().trim() === nameLc
                    && (i.unit || '').toLowerCase().trim() === unitLc) return true;
                return false;
            });

            if (existing) {
                await handleUpdateQuantity(existing.id, existing.quantity + qty);
                toast.success(`+${qty} ${unit} a ${existing.ingredient_name}`);
                _closeAddModal();
                return;
            }

            const newItem = {
                user_id: session.user.id,
                ingredient_name: name,
                master_ingredient_id: masterItem?.id || null,
                quantity: qty,
                unit,
                category: masterItem ? null : category,
            };

            const { data, error } = await supabase
                .from('user_inventory')
                .insert([newItem])
                .select('*, master_ingredients(name, category, default_unit, shelf_life_days)')
                .single();

            if (error) {
                // 23505 = unique violation por race (otra pestaña/refresh insertó
                // el mismo (name, unit) entre el pre-check y el INSERT). Refresh
                // y tratamos como éxito — la fila quedó en DB de alguna forma.
                if (error.code === '23505') {
                    await fetchData(false);
                    toast.success(`${name} ya está en tu nevera.`);
                    _closeAddModal();
                    return;
                }
                throw error;
            }

            toast.success(`${name} puesto en Nevera.`);
            setInventory(prev => [...prev, data].sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name)));
            _closeAddModal();
            // [P3-AUDIT-8 · 2026-05-10] Recalcular lista tras add individual.
            // [P2-NEW-12 · 2026-05-11] Debounced — añadir N items no genera N recalcs.
            _scheduleRecalcShoppingList();
        } catch (error) {
            console.error("Add Error: ", error);
            toast.error("Error al añadir alimento.");
        } finally {
            setIsAdding(false);
        }
    };

    // Reponer un item agotado: INSERT en user_inventory con quantity=1 + remover
    // de la lista de agotados. No requiere abrir el modal de búsqueda.
    //
    // Usa INSERT (no upsert) porque el row fue eliminado físicamente al
    // marcar agotado, no debería haber conflicto. El único UNIQUE en la
    // tabla es (user_id, ingredient_name, unit) — si por race condition
    // otra pestaña re-añadió el item, Postgres devuelve 23505 que tratamos
    // como "ya existe, todo bien".
    const handleRestoreDepleted = async (entry) => {
        // Restaurar con la cantidad snapshot al momento de agotar (entry.quantity).
        // Entradas legacy sin quantity caen al fallback 1.
        const restoreQty = (typeof entry.quantity === 'number' && entry.quantity > 0)
            ? entry.quantity
            : 1;
        const newItem = {
            user_id: session.user.id,
            ingredient_name: entry.ingredient_name,
            master_ingredient_id: entry.master_ingredient_id || null,
            quantity: restoreQty,
            unit: entry.unit || 'unidad',
        };
        try {
            const { data, error } = await supabase
                .from('user_inventory')
                .insert([newItem])
                .select('*, master_ingredients(name, category, default_unit, shelf_life_days)')
                .single();
            if (error) {
                // 23505 = unique_violation. El item ya existe en DB (race con
                // otra pestaña / sync remoto). Refrescamos para que aparezca
                // y tratamos como éxito.
                if (error.code === '23505') {
                    await fetchData(false);
                    _removeDepleted(entry);
                    toast.success(`${entry.ingredient_name} ya estaba en tu nevera`, { icon: '✅', duration: 2000 });
                    return;
                }
                throw error;
            }
            setInventory(prev => [...prev.filter(i => i.id !== data.id), data].sort((a, b) =>
                a.ingredient_name.localeCompare(b.ingredient_name)
            ));
            _removeDepleted(entry);
            toast.success(`${entry.ingredient_name} repuesto (${restoreQty} ${entry.unit || ''})`.trim(), { icon: '✅', duration: 2000 });
            _scheduleRecalcShoppingList();
        } catch (err) {
            console.error('Restore depleted error:', err);
            toast.error(`No se pudo reponer ${entry.ingredient_name}.`);
        }
    };

    // Quitar definitivamente de la lista de agotados (no toca DB porque la fila
    // ya no existe; solo limpia el marcador localStorage).
    const handleDismissDepleted = (entry) => {
        _removeDepleted(entry);
        toast(`${entry.ingredient_name} removido de la lista de agotados`, { duration: 2000 });
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
            // [ADD-FOODS-2026-05-18] Items personalizados (sin master_ingredient_id)
            // traen su categoría en `item.category` directamente; los canónicos la
            // resuelven vía join con master_ingredients. Fallback final: "OTROS".
            let cat = item.category || item.master_ingredients?.category || "OTROS";
            cat = CATEGORY_NORMALIZE[cat] || cat; // Normalizar
            if(!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        });
        return grouped;
    }, [inventory, searchQuery]);

    // Items agotados visibles: excluye los que actualmente existen en
    // inventory (defensive — un INSERT externo podría dejar el item activo
    // pese a estar en la lista de agotados; preferimos verdad DB).
    const visibleDepletedItems = useMemo(() => {
        const activeKeys = new Set(
            inventory.map(i => i.master_ingredient_id
                ? `m:${i.master_ingredient_id}`
                : `n:${(i.ingredient_name || '').toLowerCase().trim()}`)
        );
        let list = depletedItems.filter(e => !activeKeys.has(_depletedKey(e)));
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(e => (e.ingredient_name || '').toLowerCase().includes(q));
        }
        return list.sort((a, b) =>
            // Más recientes arriba
            (b.depleted_at || '').localeCompare(a.depleted_at || '')
        );
    }, [depletedItems, inventory, searchQuery]);

    const activeCount = inventory.length;
    const depletedCount = useMemo(() => {
        const activeKeys = new Set(
            inventory.map(i => i.master_ingredient_id
                ? `m:${i.master_ingredient_id}`
                : `n:${(i.ingredient_name || '').toLowerCase().trim()}`)
        );
        return depletedItems.filter(e => !activeKeys.has(_depletedKey(e))).length;
    }, [depletedItems, inventory]);

    const suggestedMasterItems = useMemo(() => {
        if (!addItemSearch.trim()) return [];
        const q = addItemSearch.toLowerCase();
        return masterList.filter(m => 
            m.name.toLowerCase().includes(q) || 
            (m.aliases && m.aliases.some(a => a.toLowerCase().includes(q)))
        ).slice(0, 8); // Top 8 suggestions
    }, [addItemSearch, masterList]);

    const handleKeyDown = (e) => {
        // [ADD-FOODS-2026-05-18] Enter sin resultados → abre el paso "Crear
        // personalizado" con el texto actual como nombre. Antes esta tecla
        // era no-op cuando no había sugerencias del master.
        if (!suggestedMasterItems.length) {
            if (e.key === 'Enter' && (addItemSearch || '').trim()) {
                e.preventDefault();
                openAddDetailsForCustom();
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < suggestedMasterItems.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < suggestedMasterItems.length) {
                openAddDetailsForMaster(suggestedMasterItems[selectedIndex]);
            } else if (suggestedMasterItems.length === 1) {
                openAddDetailsForMaster(suggestedMasterItems[0]);
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

                /* === HEADER — frosted glass arctic ===
                 * Position sticky + backdrop-filter es el combo más costoso
                 * para scroll: el header re-blurea contenido por frame.
                 * Mantenemos blur ligero (10px) y backdrop-filter solo en
                 * pointer fino (desktop). En touch usamos bg opaco. */
                .nevera-header {
                    padding: 2rem;
                    background: linear-gradient(135deg, rgba(248,252,255,0.98) 0%, rgba(240, 249, 255, 0.96) 100%);
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
                    will-change: transform;
                }
                @media (hover: hover) and (pointer: fine) {
                    .nevera-header {
                        background: linear-gradient(135deg, rgba(255,255,255,0.78) 0%, rgba(240, 249, 255, 0.62) 100%);
                        backdrop-filter: blur(10px);
                        -webkit-backdrop-filter: blur(10px);
                    }
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
                    background: linear-gradient(180deg, rgba(255, 255, 255, 1) 0%, rgba(240, 249, 255, 0.95) 100%);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,1),
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

                /* === ITEM CARDS — fridge bin / drawer look ===
                 * NO backdrop-filter aquí: con 30+ items el navegador
                 * composita N capas blur por scroll frame y el listado
                 * empieza a janquear (sobre todo en mobile). Reemplazado
                 * por gradiente opaco que da el mismo look "frosted". */
                .nevera-item-card {
                    background: linear-gradient(180deg,
                        rgba(255, 255, 255, 1) 0%,
                        rgba(240, 249, 255, 0.98) 50%,
                        rgba(224, 242, 254, 0.96) 100%);
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
                        0 4px 12px -4px rgba(14, 165, 233, 0.18);
                    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
                    contain: layout style paint;
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
                /* Hover sólo en pointer fino (desktop). En touch el hover
                 * se "pega" durante scroll y dispara box-shadow recompose
                 * por cada item bajo el dedo → jank. */
                @media (hover: hover) and (pointer: fine) {
                    .nevera-item-card:hover {
                        transform: translateY(-2px);
                        border-color: rgba(56, 189, 248, 0.85);
                        box-shadow:
                            inset 0 1.5px 0 rgba(255,255,255,1),
                            0 8px 18px -6px rgba(14, 165, 233, 0.25);
                    }
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
                    background: rgba(240, 249, 255, 0.95);
                    border-radius: 99px;
                    border: 1px solid rgba(186, 230, 253, 0.65);
                    padding: 0.25rem;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
                }

                /* === DEPLETE BUTTON (per item) === */
                .nevera-deplete-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.3rem;
                    background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(254, 242, 242, 0.85) 100%);
                    color: #B91C1C;
                    border: 1px solid rgba(252, 165, 165, 0.7);
                    padding: 0.28rem 0.7rem;
                    border-radius: 99px;
                    font-size: 0.72rem;
                    font-weight: 700;
                    cursor: pointer;
                    letter-spacing: 0.01em;
                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,0.95),
                        0 1px 2px rgba(220, 38, 38, 0.08);
                    transition: all 0.15s;
                    white-space: nowrap;
                }
                .nevera-deplete-btn:hover {
                    background: linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(254, 226, 226, 0.95) 100%);
                    border-color: rgba(248, 113, 113, 0.85);
                    transform: translateY(-1px);
                }
                .nevera-deplete-btn:active { transform: scale(0.96); }

                /* === DEPLETED SHELF (agotados) === */
                .nevera-depleted-shelf {
                    margin-top: 2.5rem;
                    padding-top: 1.5rem;
                    border-top: 2px dashed rgba(252, 165, 165, 0.45);
                }
                .nevera-depleted-header {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 1.1rem;
                    font-weight: 800;
                    color: #991B1B;
                    margin: 0 0 0.4rem 0;
                }
                .nevera-depleted-subtitle {
                    margin: 0 0 1rem 0;
                    color: #64748B;
                    font-size: 0.85rem;
                }
                .nevera-depleted-count {
                    font-size: 0.75rem;
                    background: linear-gradient(135deg, rgba(254, 226, 226, 0.85) 0%, rgba(254, 242, 242, 0.75) 100%);
                    border: 1px solid rgba(252, 165, 165, 0.6);
                    color: #991B1B;
                    padding: 0.15rem 0.6rem;
                    border-radius: 99px;
                    font-weight: 800;
                    font-variant-numeric: tabular-nums;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
                }
                .nevera-depleted-card {
                    background: linear-gradient(180deg, #FAFAFA 0%, #F1F5F9 100%);
                    border: 2px dashed rgba(203, 213, 225, 0.9);
                    border-radius: 1rem;
                    padding: 1.2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.03);
                    position: relative;
                    overflow: hidden;
                    contain: layout style paint;
                }
                .nevera-depleted-card::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: repeating-linear-gradient(
                        135deg,
                        rgba(248, 113, 113, 0.04) 0px,
                        rgba(248, 113, 113, 0.04) 8px,
                        transparent 8px,
                        transparent 18px
                    );
                    pointer-events: none;
                }
                .nevera-depleted-card > * { position: relative; z-index: 1; }
                .nevera-depleted-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.25rem;
                    font-size: 0.68rem;
                    background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%);
                    color: white;
                    padding: 0.18rem 0.6rem;
                    border-radius: 99px;
                    font-weight: 800;
                    letter-spacing: 0.05em;
                    box-shadow: 0 2px 4px rgba(220, 38, 38, 0.25);
                }
                .nevera-depleted-name {
                    margin: 0;
                    font-size: 1.05rem;
                    font-weight: 700;
                    color: #475569;
                    text-decoration: line-through;
                    text-decoration-color: rgba(220, 38, 38, 0.45);
                    line-height: 1.2;
                }
                .nevera-restore-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    background: linear-gradient(135deg, #10B981 0%, #047857 100%);
                    color: white;
                    border: 1px solid rgba(167, 243, 208, 0.65);
                    padding: 0.5rem 0.95rem;
                    border-radius: 99px;
                    font-weight: 700;
                    font-size: 0.82rem;
                    cursor: pointer;
                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,0.3),
                        0 4px 12px -2px rgba(16, 185, 129, 0.4);
                    transition: transform 0.15s;
                    white-space: nowrap;
                }
                .nevera-restore-btn:hover { transform: translateY(-1px); }
                .nevera-restore-btn:active { transform: scale(0.96); }
                .nevera-dismiss-btn {
                    background: transparent;
                    color: #64748B;
                    border: 1px solid rgba(203, 213, 225, 0.8);
                    padding: 0.5rem;
                    border-radius: 99px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                }
                .nevera-dismiss-btn:hover {
                    background: rgba(241, 245, 249, 0.95);
                    color: #334155;
                }

                /* === TOTAL COUNT METRICS === */
                .nevera-total-pills {
                    display: flex;
                    gap: 0.5rem;
                    margin-top: 0.5rem;
                    flex-wrap: wrap;
                }
                .nevera-total-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    padding: 0.28rem 0.75rem;
                    border-radius: 99px;
                    font-size: 0.82rem;
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                }
                .nevera-total-pill-active {
                    background: linear-gradient(135deg, rgba(186, 230, 253, 0.55) 0%, rgba(207, 250, 254, 0.45) 100%);
                    border: 1px solid rgba(125, 211, 252, 0.6);
                    color: #0369A1;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
                }
                .nevera-total-pill-depleted {
                    background: linear-gradient(135deg, rgba(254, 226, 226, 0.65) 0%, rgba(254, 242, 242, 0.55) 100%);
                    border: 1px solid rgba(252, 165, 165, 0.6);
                    color: #991B1B;
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
                            <div className="nevera-total-pills">
                                <span className="nevera-total-pill nevera-total-pill-active" title="Alimentos disponibles en tu nevera">
                                    <ShoppingBasket size={13} strokeWidth={2.5} />
                                    {activeCount} {activeCount === 1 ? 'item' : 'items'}
                                </span>
                                {depletedCount > 0 && (
                                    <span className="nevera-total-pill nevera-total-pill-depleted" title="Alimentos agotados (pendientes de reponer)">
                                        <PackageX size={13} strokeWidth={2.5} />
                                        {depletedCount} agotado{depletedCount === 1 ? '' : 's'}
                                    </span>
                                )}
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

                {Object.keys(filteredInventory).length === 0 && visibleDepletedItems.length === 0 ? (
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
                    <>
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
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            style={{
                                                opacity: isDisabled ? 0.5 : 1,
                                            }}
                                        >
                                            <div style={{ flex: 1, marginRight: '1rem', textDecoration: isDisabled ? 'line-through' : 'none' }}>
                                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: isDisabled ? 'var(--danger)' : 'var(--text-main)', lineHeight: 1.2 }}>{item.ingredient_name}</h3>
                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <span className="nevera-item-unit-tag">Unidad base: {item.unit}</span>
                                                    {/* [P3-4 · 2026-05-10] Chip de shelf-life: el backend ya
                                                        computaba urgency y lo incluía en el texto al LLM, pero
                                                        el frontend no lo surfaceaba al usuario. Helper
                                                        client-side computa days_left desde `created_at` +
                                                        `master_ingredients.shelf_life_days`. Solo se muestra
                                                        para items con urgency (≤3 días) — items frescos NO
                                                        ven chip para evitar ruido visual. */}
                                                    {(() => {
                                                        const badge = getShelfLifeBadge(item);
                                                        if (!badge) return null;
                                                        const _style = getShelfLifeBadgeStyle(badge.severity);
                                                        return (
                                                            <span
                                                                title={`Tu plan priorizará este ingrediente. ${badge.label}.`}
                                                                aria-label={`Shelf-life: ${badge.label}`}
                                                                style={{
                                                                    fontSize: '0.7rem',
                                                                    background: _style.background,
                                                                    color: _style.color,
                                                                    border: `1px solid ${_style.borderColor}`,
                                                                    padding: '2px 8px',
                                                                    borderRadius: '999px',
                                                                    fontWeight: 600,
                                                                    whiteSpace: 'nowrap',
                                                                }}
                                                            >
                                                                ⚠ {badge.label}
                                                            </span>
                                                        );
                                                    })()}
                                                    {isDisabled && <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Trash2 size={12}/> Pendiente de eliminación</span>}
                                                </div>
                                            </div>

                                            {/* Controlador + botón Agotar */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
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
                                                <button
                                                    onClick={() => handleDeleteItem(item.id)}
                                                    title="Marcar como agotado"
                                                    aria-label={`Marcar ${item.ingredient_name} como agotado`}
                                                    className="nevera-deplete-btn"
                                                >
                                                    <PackageX size={13} strokeWidth={2.5} /> Agotar
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

                    {visibleDepletedItems.length > 0 && (
                        <section className="nevera-depleted-shelf">
                            <h2 className="nevera-depleted-header">
                                <PackageX size={20} strokeWidth={2.25} />
                                Agotados
                                <span className="nevera-depleted-count">{visibleDepletedItems.length}</span>
                            </h2>
                            <p className="nevera-depleted-subtitle">
                                Ya no los tienes. Toca <strong>Reponer</strong> cuando vuelvas a comprarlos.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                <AnimatePresence>
                                    {visibleDepletedItems.map(entry => (
                                        <motion.div
                                            key={_depletedKey(entry)}
                                            className="nevera-depleted-card"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                        >
                                            <div style={{ flex: 1, marginRight: '0.75rem', minWidth: 0 }}>
                                                <span className="nevera-depleted-badge">
                                                    <PackageX size={10} strokeWidth={3} /> AGOTADO
                                                </span>
                                                <h3 className="nevera-depleted-name" style={{ marginTop: '0.5rem' }}>
                                                    {entry.ingredient_name}
                                                </h3>
                                                <span style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.25rem', display: 'inline-block' }}>
                                                    Tenías: <strong style={{ color: '#475569', fontWeight: 700 }}>
                                                        {entry.quantity || 1} {entry.unit || 'unidad'}
                                                    </strong>
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                                                <button
                                                    onClick={() => handleRestoreDepleted(entry)}
                                                    className="nevera-restore-btn"
                                                    title="Reponer este alimento"
                                                >
                                                    <RotateCcw size={14} strokeWidth={2.5} /> Reponer
                                                </button>
                                                <button
                                                    onClick={() => handleDismissDepleted(entry)}
                                                    className="nevera-dismiss-btn"
                                                    title="Quitar de la lista de agotados"
                                                    aria-label={`Quitar ${entry.ingredient_name} de la lista de agotados`}
                                                >
                                                    <X size={14} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </section>
                    )}
                    </>
                )}
            </div>

            {/* Modal "Nuevo Alimento" — 2 pasos (search / details) [ADD-FOODS-2026-05-18] */}
            <AnimatePresence>
                {showAddMenu && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={_closeAddModal}
                            style={{ position: 'fixed', inset: 0, background: 'var(--bg-glass)', backdropFilter: 'blur(4px)', zIndex: 100 }}
                        />
                        <motion.div
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            style={{
                                position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg-card)',
                                borderRadius: '2rem 2rem 0 0', padding: '2rem', zIndex: 101,
                                boxShadow: '0 -10px 40px rgba(0,0,0,0.1)', maxHeight: '90vh', display: 'flex', flexDirection: 'column'
                            }}
                        >
                            <div style={{ width: '40px', height: '5px', background: 'var(--border)', borderRadius: '10px', margin: '0 auto 1.5rem', opacity: 0.8 }} />

                            {addStep === 'search' && (
                                <>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 1rem 0', color: 'var(--text-main)' }}>Añadir Alimento</h2>

                                    <div style={{ position: 'relative', marginBottom: '1rem' }}>
                                        <SearchIcon color="var(--text-light)" size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Buscar (ej: aceite de oliva, pollo, leche…)"
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
                                        <AlertCircle size={14} /> Empieza desde el catálogo. Si no aparece, crea uno personalizado.
                                    </p>

                                    {/* Resultados + CTA personalizado (Scrollable) */}
                                    <div style={{ overflowY: 'auto', flex: 1, paddingBottom: '2rem' }}>
                                        {suggestedMasterItems.map((item, index) => (
                                            <div
                                                key={item.id}
                                                onClick={() => openAddDetailsForMaster(item)}
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
                                                        {item.category ? `${item.category} · ` : ''}Unidad: {item.default_unit || 'unidad'}
                                                        {item.aliases?.length ? ` · Alias: ${item.aliases.slice(0, 2).join(', ')}` : ''}
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
                                            <div style={{ textAlign: 'center', padding: '2rem 1rem 1.5rem', color: 'var(--text-light)' }}>
                                                "<strong style={{ color: 'var(--text-main)' }}>{addItemSearch.trim()}</strong>" no está en el catálogo.
                                                <br />Puedes crearlo tú mismo abajo.
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            onClick={openAddDetailsForCustom}
                                            disabled={isAdding}
                                            style={{
                                                width: '100%', marginTop: '0.5rem', padding: '1rem 1.25rem',
                                                background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
                                                color: '#FFFFFF',
                                                border: '2px solid rgba(125, 211, 252, 0.5)',
                                                borderRadius: '1rem', fontWeight: 700, fontSize: '1rem',
                                                cursor: isAdding ? 'not-allowed' : 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                                boxShadow: '0 8px 20px -4px rgba(14, 165, 233, 0.4)',
                                            }}
                                        >
                                            <Sparkles size={18} strokeWidth={2.5} />
                                            {addItemSearch.trim()
                                                ? `Crear personalizado: "${addItemSearch.trim()}"`
                                                : 'Crear alimento personalizado'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {addStep === 'details' && (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}>
                                        <button
                                            type="button"
                                            onClick={() => setAddStep('search')}
                                            disabled={isAdding}
                                            aria-label="Volver a la búsqueda"
                                            style={{
                                                background: 'var(--bg-muted)', color: 'var(--text-main)',
                                                border: '1px solid var(--border)', borderRadius: '99px',
                                                width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: isAdding ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            <ChevronLeft size={20} strokeWidth={2.5} />
                                        </button>
                                        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                                            {addFormData.masterItem ? 'Confirmar Alimento' : 'Alimento Personalizado'}
                                        </h2>
                                    </div>

                                    <div style={{ overflowY: 'auto', flex: 1, paddingBottom: '1rem' }}>
                                        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', margin: '0 0 0.4rem 0' }}>
                                            Nombre del alimento
                                        </label>
                                        <input
                                            type="text"
                                            autoFocus={!addFormData.masterItem}
                                            value={addFormData.name}
                                            onChange={e => setAddFormData(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="Ej: Aceite de oliva extra virgen"
                                            disabled={!!addFormData.masterItem}
                                            style={{
                                                width: '100%', padding: '0.9rem 1rem', borderRadius: '0.75rem',
                                                border: '2px solid var(--border)', outline: 'none',
                                                fontSize: '1rem', fontWeight: 500,
                                                background: addFormData.masterItem ? 'var(--bg-muted)' : 'var(--bg-page)',
                                                color: 'var(--text-main)', marginBottom: '1rem',
                                            }}
                                        />

                                        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', margin: '0 0 0.4rem 0' }}>
                                            Categoría
                                        </label>
                                        <select
                                            value={addFormData.category}
                                            onChange={e => setAddFormData(prev => ({ ...prev, category: e.target.value }))}
                                            disabled={!!addFormData.masterItem}
                                            style={{
                                                width: '100%', padding: '0.9rem 1rem', borderRadius: '0.75rem',
                                                border: '2px solid var(--border)', outline: 'none',
                                                fontSize: '1rem', fontWeight: 500,
                                                background: addFormData.masterItem ? 'var(--bg-muted)' : 'var(--bg-page)',
                                                color: 'var(--text-main)', marginBottom: '1rem',
                                                appearance: 'auto',
                                            }}
                                        >
                                            <option value="Despensa">Despensa y Granos</option>
                                            <option value="Vegetales">Vegetales</option>
                                            <option value="Frutas">Frutas</option>
                                            <option value="Proteínas">Proteínas</option>
                                            <option value="Lácteos">Lácteos</option>
                                            <option value="Víveres">Víveres</option>
                                            <option value="Otros">Otros</option>
                                        </select>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '0.75rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', margin: '0 0 0.4rem 0' }}>
                                                    Cantidad
                                                </label>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    min="0"
                                                    step="0.25"
                                                    value={addFormData.quantity}
                                                    onChange={e => setAddFormData(prev => ({ ...prev, quantity: e.target.value }))}
                                                    style={{
                                                        width: '100%', padding: '0.9rem 1rem', borderRadius: '0.75rem',
                                                        border: '2px solid var(--border)', outline: 'none',
                                                        fontSize: '1rem', fontWeight: 600, textAlign: 'center',
                                                        background: 'var(--bg-page)', color: 'var(--text-main)',
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', margin: '0 0 0.4rem 0' }}>
                                                    Unidad
                                                </label>
                                                <select
                                                    value={addFormData.unit}
                                                    onChange={e => setAddFormData(prev => ({ ...prev, unit: e.target.value }))}
                                                    style={{
                                                        width: '100%', padding: '0.9rem 1rem', borderRadius: '0.75rem',
                                                        border: '2px solid var(--border)', outline: 'none',
                                                        fontSize: '1rem', fontWeight: 500,
                                                        background: 'var(--bg-page)', color: 'var(--text-main)',
                                                        appearance: 'auto',
                                                    }}
                                                >
                                                    <optgroup label="Discretas">
                                                        <option value="unidad">unidad</option>
                                                        <option value="paquete">paquete</option>
                                                        <option value="bolsa">bolsa</option>
                                                        <option value="caja">caja</option>
                                                        <option value="lata">lata</option>
                                                        <option value="botella">botella</option>
                                                        <option value="pote">pote</option>
                                                        <option value="sobre">sobre</option>
                                                        <option value="cartón">cartón</option>
                                                        <option value="tetra">tetra</option>
                                                        <option value="galón">galón</option>
                                                        <option value="mazo">mazo</option>
                                                        <option value="diente">diente</option>
                                                        <option value="cabeza">cabeza</option>
                                                        <option value="hoja">hoja</option>
                                                        <option value="rebanada">rebanada</option>
                                                    </optgroup>
                                                    <optgroup label="Peso">
                                                        <option value="g">g</option>
                                                        <option value="kg">kg</option>
                                                        <option value="lb">lb</option>
                                                        <option value="oz">oz</option>
                                                    </optgroup>
                                                    <optgroup label="Volumen">
                                                        <option value="ml">ml</option>
                                                        <option value="l">l</option>
                                                        <option value="taza">taza</option>
                                                        <option value="cda">cda</option>
                                                        <option value="cdta">cdta</option>
                                                    </optgroup>
                                                </select>
                                            </div>
                                        </div>

                                        {addFormData.masterItem && (
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', margin: '1rem 0 0', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                <AlertCircle size={13} /> Nombre y categoría heredados del catálogo. Ajusta cantidad y unidad.
                                            </p>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setAddStep('search')}
                                            disabled={isAdding}
                                            style={{
                                                flex: 1, padding: '1rem',
                                                background: 'var(--bg-muted)', color: 'var(--text-main)',
                                                border: 'none', borderRadius: '1rem',
                                                fontWeight: 700, fontSize: '1rem',
                                                cursor: isAdding ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSaveAddForm}
                                            disabled={isAdding}
                                            style={{
                                                flex: 1.4, padding: '1rem',
                                                background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
                                                color: '#FFFFFF', border: 'none', borderRadius: '1rem',
                                                fontWeight: 700, fontSize: '1rem',
                                                cursor: isAdding ? 'not-allowed' : 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                                boxShadow: '0 8px 20px -4px rgba(14, 165, 233, 0.45)',
                                                opacity: isAdding ? 0.7 : 1,
                                            }}
                                        >
                                            {isAdding
                                                ? <><Loader2 size={18} strokeWidth={2.5} className="spin-animation" /> Guardando…</>
                                                : <><Save size={18} strokeWidth={2.5} /> Guardar en Nevera</>}
                                        </button>
                                    </div>
                                </>
                            )}
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
