import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAssessment } from '../context/AssessmentContext';
import { supabase } from '../supabase';
import { Search, Plus, Minus, Trash2, Loader2, Save, X, Search as SearchIcon, AlertCircle, Snowflake, Beef, Drumstick, Fish, Egg, Apple, Carrot, Salad, Milk, Wheat, Croissant, Cookie, Nut, GlassWater, Package, Leaf, Droplets, Flame, ShoppingBasket, RotateCcw, PackageX } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, API_BASE } from '../config/api';
import { getShelfLifeBadge, getShelfLifeBadgeStyle } from '../utils/shelfLife';
import { safeJSONParseObject } from '../utils/safeJSONParse';
// [P2-LOCALSTORAGE-GETITEM-DEFENSIVE · 2026-05-15] read defensivo para
// `mealfit_disabled_ingredients` en el useEffect mount (línea 88+).
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/safeLocalStorage';
import { emitCoherenceToast } from '../utils/renderCoherenceWarnings';
// [P3-PANTRY-CACHE · 2026-05-19] Stale-while-revalidate del mount de Pantry
import { getCachedInventory, setCachedInventory, getCachedMasterList, setCachedMasterList } from '../utils/pantryCache';

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

// [P3-PANTRY-FRIDGE-LAYOUT · 2026-05-19] Mapping categoría master_ingredients
// → zona física de la nevera real. Las 25 variantes de `master_ingredients.category`
// caen en 7 zonas: 3 estantes interiores + 2 gavetas (crispers) + puerta + alacena
// externa. Cierra el bucket "OTROS" como pantry (no nevera) — granos secos,
// especias, conservas no se refrigeran en RD.
const CATEGORY_TO_ZONE = {
    // Estante 1 — Lácteos & Huevos (alto, productos delicados)
    'LÁCTEOS': 'shelf_dairy',
    'LACTEOS': 'shelf_dairy',
    'QUESOS': 'shelf_dairy',
    'HUEVOS': 'shelf_dairy',

    // Estante 2 — Proteínas crudas (medio, evita drip sobre lácteos)
    'PROTEÍNAS': 'shelf_proteins',
    'PROTEINAS': 'shelf_proteins',
    'CARNES': 'shelf_proteins',
    'CARNES ROJAS': 'shelf_proteins',
    'POLLO': 'shelf_proteins',
    'AVES': 'shelf_proteins',
    'PESCADO': 'shelf_proteins',
    'PESCADOS': 'shelf_proteins',
    'PESCADOS Y MARISCOS': 'shelf_proteins',
    'MARISCOS': 'shelf_proteins',

    // Estante 3 — Listos para comer (panadería, dulces, frutos secos)
    'PANADERIA': 'shelf_ready',
    'PANADERÍA': 'shelf_ready',
    'PANES': 'shelf_ready',
    'DULCES': 'shelf_ready',
    'AZÚCARES': 'shelf_ready',
    'AZUCARES': 'shelf_ready',
    'FRUTOS SECOS': 'shelf_ready',

    // Gavetas (crispers) inferiores
    'FRUTAS': 'drawer_fruits',
    'VEGETALES': 'drawer_veggies',
    'VERDURAS': 'drawer_veggies',
    'HORTALIZAS': 'drawer_veggies',
    'HIERBAS': 'drawer_veggies',

    // Puerta lateral — botellas y frasquitos
    'BEBIDAS': 'door',
    'GRASAS': 'door',
    'ACEITES': 'door',
    'CONDIMENTOS': 'door',

    // Alacena externa (no se refrigera)
    'CEREALES Y GRANOS': 'pantry',
    'CEREALES': 'pantry',
    'GRANOS': 'pantry',
    'DESPENSA Y GRANOS': 'pantry',
    'DESPENSA': 'pantry',
    'LEGUMBRES': 'pantry',
    'ESPECIAS': 'pantry',
    'VÍVERES': 'pantry',
    'VIVERES': 'pantry',
    'OTROS': 'pantry',
};

const getZoneForCategory = (cat) => {
    if (!cat) return 'pantry';
    return CATEGORY_TO_ZONE[cat.toUpperCase().trim()] || 'pantry';
};

// Definiciones de zonas: orden de render + metadata visual. Cada zona se
// muestra solo si tiene items (zonas vacías se ocultan automáticamente).
// [P3-PANTRY-FRIDGE-POLISH · 2026-05-19] Drawers: labels sin "Gaveta de"
// (la metáfora visual de crisper + asita + radius pronunciado ya comunica
// que es una gaveta — el prefijo era ruido). Color per-zone añadido para
// que cada categoría tenga identidad visual propia y rompa la monotonía
// cyan que hacía sentir el rediseño homogéneo.
const ZONE_DEFINITIONS = [
    { key: 'shelf_dairy',    label: 'Lácteos & Huevos',          icon: Milk,       kind: 'shelf',  color: '#0EA5E9' },
    { key: 'shelf_proteins', label: 'Proteínas',                 icon: Beef,       kind: 'shelf',  color: '#DC2626' },
    { key: 'shelf_ready',    label: 'Listos para comer',         icon: Croissant,  kind: 'shelf',  color: '#F59E0B' },
    { key: 'door',           label: 'Puerta · Bebidas & Condimentos', icon: GlassWater, kind: 'door', color: '#0891B2' },
    { key: 'drawer_fruits',  label: 'Frutas',                    icon: Apple,      kind: 'drawer', color: '#EC4899' },
    { key: 'drawer_veggies', label: 'Verduras',                  icon: Salad,      kind: 'drawer', color: '#16A34A' },
    { key: 'pantry',         label: 'Alacena · Granos y secos',  icon: Package,    kind: 'pantry', color: '#92400E' },
];

// [P3-C · 2026-05-08] El helper `getEstimatedDailyConsumption` vive en
// `frontend/src/utils/pantryConsumption.js` para que sea testeable sin
// arrastrar este componente al bundle de tests.

const Pantry = () => {
    const { session, userProfile, setPlanData } = useAssessment();
    // [P3-PANTRY-CACHE · 2026-05-19] Stale-while-revalidate lazy-init.
    // Si hay cache vigente (inventory TTL 30s, masterList TTL 24h), el
    // primer render tiene rows visibles y skeleton oculto. El fetchData
    // del useEffect mount sigue corriendo para pisar con datos frescos.
    // Pre-fix: dos queries Supabase serializadas bloqueaban render con
    // skeleton 300-1500ms cada entrada al apartado.
    const [inventory, setInventory] = useState(() => getCachedInventory() || []);
    const [masterList, setMasterList] = useState(() => getCachedMasterList() || []);
    const [loading, setLoading] = useState(() => !getCachedInventory());
    const [savingItem, setSavingItem] = useState(null); // ID of item being saved
    const [searchQuery, setSearchQuery] = useState('');
    
    // Auto-complete (Add Item) state
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [addItemSearch, setAddItemSearch] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeletingAll, setIsDeletingAll] = useState(false);

    // [P3-PANTRY-ADD-UX · 2026-05-18] Customizar cantidad + unidad antes de añadir.
    // Reemplaza el flujo "click → +1 con default_unit" por un mini-form inline
    // que permite "1 botella de vinagre", "2 libras de pollo", etc.
    const [pickerForId, setPickerForId] = useState(null);   // master_ingredient_id en config
    const [pickerQty, setPickerQty] = useState(1);
    const [pickerUnit, setPickerUnit] = useState('');

    // [P3-PANTRY-QTY-EDIT · 2026-05-18] Editor de cantidad exacta para items
    // ya en la nevera. Cierra el gap UX "tengo 5 cartones, no quiero clickear
    // + cinco veces ni mantener turbo presionado contando". Click en el número
    // del counter abre este editor; `+` / `-` siguen siendo +1/-1 turbo
    // (gestos rápidos para el caso común).
    const [qtyEditItem, setQtyEditItem] = useState(null);   // row completo del inventory
    const [qtyEditValue, setQtyEditValue] = useState(1);
    const [qtyEditSaving, setQtyEditSaving] = useState(false);

    // Unidades de envase/medida que un dominicano usa al hacer compras.
    // Orden: discretas → pesos → volumen → containers.
    // [P3-PANTRY-MARKET-CONTAINER · 2026-05-19] 'cartón' añadido para
    // alinear con el `master_ingredients.market_container` que el PDF usa
    // (leche, jugos, huevos vienen "en cartón" en RD).
    const COMMON_PURCHASE_UNITS = [
        'unidad', 'libra', 'kg', 'botella', 'paquete',
        'lata', 'caja', 'cartón', 'bolsa', 'galón', 'sobre',
    ];

    // Resetear focus activo al cambiar búsqueda o cerrar modal
    useEffect(() => {
        setSelectedIndex(-1);
    }, [addItemSearch, showAddMenu]);

    // Reset del picker inline al cerrar el modal o cambiar la búsqueda.
    useEffect(() => {
        setPickerForId(null);
        setPickerQty(1);
        setPickerUnit('');
    }, [addItemSearch, showAddMenu]);

    // [P3-PANTRY-LOCALSTORAGE-LAZY · 2026-05-19] Hidratación lazy-init
    // desde localStorage para evitar re-render post-mount. Pre-fix el
    // useState arrancaba en `[]` y un useEffect[] hacía
    // `setDisabledIngredients(JSON.parse(saved))` tras montar → re-render
    // del componente completo (1100 líneas). El user reportó delay
    // perceptible (~300-500ms) específico a Nevera; uno de los
    // contribuyentes era esta cascada de setStates al mount. Con lazy
    // init el valor inicial ya es el correcto desde el primer render.
    const [disabledIngredients, setDisabledIngredients] = useState(() => {
        try {
            const saved = safeLocalStorageGet('mealfit_disabled_ingredients', null);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch(e) {}
        return [];
    });

    useEffect(() => {
        // Solo el listener cross-tab sync — la hidratación inicial ya
        // ocurrió en el lazy-init de useState. El `storage` event solo
        // dispara cuando OTRA tab modifica el key.
        const checkDisabled = () => {
            const saved = safeLocalStorageGet('mealfit_disabled_ingredients', null);
            if (saved) {
                try { setDisabledIngredients(JSON.parse(saved)); } catch(e) {}
            } else {
                setDisabledIngredients([]);
            }
        };
        window.addEventListener('storage', checkDisabled);
        return () => window.removeEventListener('storage', checkDisabled);
    }, []);

    // Estado "Agotados": items que el usuario marcó como agotados o eliminó
    // manualmente. Se guarda en localStorage (mismo patrón que disabledIngredients)
    // y NO toca la DB — semánticamente "agotado" === "ya no lo tengo", que es
    // idéntico para el backend a "eliminado". El visual es puramente client-side.
    // [P3-PANTRY-LOCALSTORAGE-LAZY · 2026-05-19] Mismo patrón que
    // disabledIngredients — lazy init evita re-render post-mount.
    const [depletedItems, setDepletedItems] = useState(() => {
        try {
            const saved = safeLocalStorageGet('mealfit_depleted_items', null);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch(e) {}
        return [];
    });

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

    // [P3-PANTRY-LOCALSTORAGE-LAZY · 2026-05-19] La hidratación inicial
    // se hizo en el lazy-init de useState. Solo mantenemos el listener
    // cross-tab para sincronizar si OTRA tab modifica el key.
    useEffect(() => {
        const hydrate = () => {
            const saved = safeLocalStorageGet('mealfit_depleted_items', null);
            if (!saved) { setDepletedItems([]); return; }
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) setDepletedItems(parsed);
            } catch (e) { setDepletedItems([]); }
        };
        window.addEventListener('storage', hydrate);
        return () => window.removeEventListener('storage', hydrate);
    }, []);

    // Lock/Debounce por item para el guardado 
    const pendingOps = useRef(new Map()); // id -> { baselineQty, targetQty, timeout }
    // [P3-PANTRY-CACHE · 2026-05-19] Si el cache singleton tiene masterList
    // vigente (TTL 24h, casi-inmutable), arrancamos el ref en `true` para
    // skipear el fetch redundante. Lazy useRef init via callback no existe
    // como `useState(() => ...)`, así que evaluamos directo.
    const masterListLoaded = useRef(Boolean(getCachedMasterList()));

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
    // [P3-PANTRY-CACHE-SKIP-REFETCH · 2026-05-19] Si hay cache vigente
    // (TTL 30s no expirado), SKIP el fetch background completo. Antes
    // hacíamos fetch silencioso "para refrescar", pero ese fetch
    // disparaba `setInventory(rows)` con array nuevo aunque el contenido
    // fuera idéntico — React re-renderizaba el componente entero
    // (1100 líneas + N item cards) ~200-500ms después del primer paint,
    // sumado a los re-renders de `setDisabledIngredients` y
    // `setDepletedItems` desde localStorage, daba una cascada de 3-5
    // re-renders que el usuario percibía como "delay raro post-paint":
    // contenido visible pero algo seguía "cargando" 300ms más.
    //
    // Trade-off: si el cache tiene data 25s vieja, vas a ver eso 25s
    // viejo. Aceptable porque:
    //   (a) Realtime channel suscrito a `user_inventory` (línea ~245)
    //       empuja UPDATEs/INSERTs/DELETEs al state en tiempo real
    //       sin pasar por fetchData — el cache fresh + realtime es
    //       suficiente para mantener consistency.
    //   (b) Mutaciones del propio user (delete, increment, restock)
    //       invocan `fetchData(false)` o `setInventory` directo y
    //       pisan el cache.
    //   (c) TTL 30s significa peor caso 30s de staleness antes del
    //       próximo cache miss → fetch normal.
    useEffect(() => {
        if (!session?.user?.id) return;
        const _hasFreshCache = Boolean(getCachedInventory());
        if (_hasFreshCache) {
            // Cache fresh → trust it + realtime channel. Cero re-render
            // adicional al mount. Datos cacheados quedan visibles snap.
            return;
        }
        fetchData(true);
    }, [session?.user?.id]);

    // 1b. Real-time sync: anula el "efecto eco" procesando el payload en vez de hacer refetch global
    // [P3-PANTRY-RT-DEFER · 2026-05-19] Difiere el `supabase.channel(...).subscribe()`
    // 200ms tras el mount. El WebSocket handshake + envío de auth + ACK
    // del servidor Realtime son trabajo síncrono parcial que compite con
    // el primer paint del componente. Diferirlo asegura que la UI se
    // pinta antes que se establezca la conexión. UPDATE/INSERT/DELETE
    // externos en ese gap de 200ms los recoge el próximo fetchData o
    // cache miss.
    useEffect(() => {
        if (!session?.user?.id) return;

        let channel = null;
        let cancelled = false;

        const fetchAndAddSingleItem = async (itemId) => {
            try {
                const { data, error } = await supabase
                    .from('user_inventory')
                    .select('*, master_ingredients(name, category, default_unit, market_container, shelf_life_days)')
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

        const _subscribeRealtime = () => {
            if (cancelled) return;
            channel = supabase
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
        };

        // Diferir el subscribe hasta que el browser esté idle (o 200ms
        // worst case). El idle callback corre tras el primer paint.
        let _idleHandle = null;
        let _fallbackTimer = null;
        if (typeof window.requestIdleCallback === 'function') {
            _idleHandle = window.requestIdleCallback(_subscribeRealtime, { timeout: 200 });
        } else {
            _fallbackTimer = setTimeout(_subscribeRealtime, 200);
        }

        return () => {
            cancelled = true;
            if (_idleHandle && typeof window.cancelIdleCallback === 'function') {
                window.cancelIdleCallback(_idleHandle);
            }
            if (_fallbackTimer) clearTimeout(_fallbackTimer);
            if (channel) supabase.removeChannel(channel);
        };
    }, [session?.user?.id]);

    const fetchData = async (isInitial = true) => {
        if (isInitial) setLoading(true);
        try {
            // Fetch User Inventory
            const { data: invData, error: invError } = await supabase
                .from('user_inventory')
                .select('*, master_ingredients(name, category, default_unit, market_container, shelf_life_days)')
                .eq('user_id', session.user.id)
                .gt('quantity', 0)
                .order('ingredient_name', { ascending: true });

            if (invError) throw invError;
            const _invRows = invData || [];
            setInventory(_invRows);
            // [P3-PANTRY-CACHE · 2026-05-19] Persiste al singleton tras
            // éxito. Próximo mount renderiza con cache vigente sin
            // skeleton. Mutaciones (delete/increment/restock/realtime)
            // siguen llamando fetchData → pisan el cache acá mismo.
            setCachedInventory(_invRows);

            // Fetch Master List (solo una vez; cambios son rarísimos)
            if (!masterListLoaded.current) {
                const { data: masterData, error: masterError } = await supabase
                    .from('master_ingredients')
                    .select('*')
                    .order('name', { ascending: true });

                if (masterError) throw masterError;
                const _masterRows = masterData || [];
                setMasterList(_masterRows);
                // [P3-PANTRY-CACHE · 2026-05-19] Catálogo cuasi-inmutable.
                // Cache 24h cross-mount cubre toda la sesión típica del
                // user sin bajar 19.8KB cada entrada al apartado.
                setCachedMasterList(_masterRows);
                masterListLoaded.current = true;
            } else if (masterList.length === 0) {
                // [P3-PANTRY-CACHE · 2026-05-19] Edge: masterListLoaded
                // viene `true` del cache singleton pero el useState lazy
                // arrancó vacío (cache invalidado entre el render y este
                // punto). Releer del singleton; si sigue vigente lo
                // setearemos. Sin esto el render queda con master vacío.
                const _cachedMaster = getCachedMasterList();
                if (Array.isArray(_cachedMaster) && _cachedMaster.length > 0) {
                    setMasterList(_cachedMaster);
                }
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
                            .select('*, master_ingredients(name, category, default_unit, market_container, shelf_life_days)')
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

    // [P3-PANTRY-ADD-UX · 2026-05-18] Acepta qty y unit explícitos para que
    // el usuario pueda registrar "1 botella de vinagre", "2 libras de pollo",
    // etc. desde el inline picker. Pre-existente flujo "+1 con default_unit"
    // sigue funcionando si el caller no pasa overrides.
    //
    // [P3-PANTRY-ADD-UX-INSERT · 2026-05-18] Reemplazado upsert(onConflict:
    // 'user_id,master_ingredient_id') por INSERT plano + manejo de 23505.
    // El upsert apuntaba a una constraint que NO existe en `user_inventory`
    // (Postgres 42P10) — el único UNIQUE real es (user_id, ingredient_name,
    // unit). El path "+1 al existing" cliente sigue siendo el camino feliz;
    // el INSERT+23505 cubre legacy rows con master_id null y races de
    // múltiples pestañas. Mismo patrón que `handleRestoreDepleted` (línea ~820).
    const handleAddNewItem = async (masterItem, customQty = 1, customUnit = null) => {
        setIsAdding(true);
        try {
            // Si estaba marcado como agotado, sale de la lista — el usuario
            // lo está reponiendo.
            _removeDepleted({ master_ingredient_id: masterItem.id, ingredient_name: masterItem.name });

            // Sanitizar qty: numero entero positivo, clamp [1, 999].
            const safeQty = Math.max(1, Math.min(999, Math.round(Number(customQty) || 1)));

            // Para items nuevos: usa la unidad del picker si el caller la
            // pasó, sino prioriza `market_container` (curado dominicano,
            // mismo que el PDF) sobre `default_unit` (genérico).
            // [P3-PANTRY-MARKET-CONTAINER · 2026-05-19]
            const finalUnit = (typeof customUnit === 'string' && customUnit.trim())
                ? customUnit.trim()
                : (masterItem.market_container || masterItem.default_unit || 'unidad');

            // Detección de existing en 2 fases:
            //   1) Por `master_ingredient_id` (camino canónico).
            //   2) Por `(ingredient_name, unit)` case-insensitive — captura
            //      filas legacy con master_id NULL Y casos donde el catálogo
            //      maestro fue re-importado y los IDs cambiaron pero los
            //      nombres se preservaron.
            const nameLc = (masterItem.name || '').toLowerCase();
            let existing = inventory.find(i => i.master_ingredient_id === masterItem.id);
            if (!existing) {
                existing = inventory.find(i =>
                    (i.ingredient_name || '').toLowerCase() === nameLc
                    && (i.unit || '') === finalUnit
                );
            }
            if (existing) {
                await handleUpdateQuantity(existing.id, existing.quantity + safeQty);
                toast.success(`+${safeQty} ${existing.unit || ''} a ${masterItem.name}`.trim());
                setShowAddMenu(false);
                setAddItemSearch('');
                return;
            }

            const newItem = {
                user_id: session.user.id,
                ingredient_name: masterItem.name,
                master_ingredient_id: masterItem.id,
                quantity: safeQty,
                unit: finalUnit,
            };

            const { data, error } = await supabase
                .from('user_inventory')
                .insert([newItem])
                .select('*, master_ingredients(name, category, default_unit, market_container, shelf_life_days)')
                .single();

            if (error) {
                // 23505 = unique_violation. Race contra otra pestaña que ya
                // insertó (user_id, ingredient_name, unit). Refetch y sumamos
                // al row existente — UX consistente con click→+1.
                if (error.code === '23505') {
                    await fetchData(false);
                    const dup = inventoryRef.current.find(i =>
                        i.master_ingredient_id === masterItem.id
                        || ((i.ingredient_name || '').toLowerCase() === nameLc
                            && (i.unit || '') === finalUnit)
                    );
                    if (dup) {
                        await handleUpdateQuantity(dup.id, dup.quantity + safeQty);
                        toast.success(`+${safeQty} ${dup.unit || ''} a ${masterItem.name}`.trim());
                    } else {
                        toast.success(`${masterItem.name} ya estaba en tu nevera`, { icon: '✅' });
                    }
                    setShowAddMenu(false);
                    setAddItemSearch('');
                    _scheduleRecalcShoppingList();
                    return;
                }
                throw error;
            }

            toast.success(`${safeQty} ${finalUnit} de ${masterItem.name} en la nevera`);
            setInventory(prev => [...prev, data].sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name)));
            setShowAddMenu(false);
            setAddItemSearch('');
            // [P3-AUDIT-8 · 2026-05-10] Recalcular lista tras add individual.
            // Si el ítem que se acaba de añadir estaba en la lista de
            // compras, debe desaparecer; el Dashboard refleja el cambio
            // al instante. NOTA: el path "+1 a existing" arriba (línea ~424)
            // delega a `handleUpdateQuantity` que NO recalcula — qty
            // changes no alteran el set de items y el PDF live-fetch
            // ya cubre ese caso.
            // [P2-NEW-12 · 2026-05-11] Debounced — añadir N items rápido no
            // genera N recalcs.
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
                .select('*, master_ingredients(name, category, default_unit, market_container, shelf_life_days)')
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
            let cat = item.master_ingredients?.category || "OTROS";
            cat = CATEGORY_NORMALIZE[cat] || cat; // Normalizar
            if(!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        });
        return grouped;
    }, [inventory, searchQuery]);

    // [P3-PANTRY-FRIDGE-LAYOUT · 2026-05-19] Proyección por zona física de
    // la nevera real. Mantenemos `filteredInventory` (por categoría) para
    // empty-state check y compatibilidad; este derivado agrupa items por
    // zona (shelf_dairy, shelf_proteins, …, pantry) según CATEGORY_TO_ZONE.
    const inventoryByZone = useMemo(() => {
        const byZone = {};
        Object.entries(filteredInventory).forEach(([category, items]) => {
            const zone = getZoneForCategory(category);
            if (!byZone[zone]) byZone[zone] = [];
            // Anotamos category para mostrarla como sub-label si el usuario
            // tiene varias categorías en la misma zona (ej. Lácteos + Huevos).
            items.forEach(it => byZone[zone].push({ ...it, _zoneCategory: category }));
        });
        return byZone;
    }, [filteredInventory]);

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
        if (!suggestedMasterItems.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < suggestedMasterItems.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const targetItem = selectedIndex >= 0
                ? suggestedMasterItems[selectedIndex]
                : suggestedMasterItems[0];
            if (!targetItem) return;
            // [P3-PANTRY-ADD-UX · 2026-05-18] 1er Enter abre el picker;
            // 2do Enter (picker ya abierto para ese item) confirma con los
            // valores actuales del picker. Permite flujo rápido teclado-only.
            if (pickerForId === targetItem.id) {
                handleAddNewItem(targetItem, pickerQty, pickerUnit);
            } else {
                setPickerForId(targetItem.id);
                setPickerQty(1);
                // [P3-PANTRY-MARKET-CONTAINER · 2026-05-19] prioriza
                // market_container (curado) sobre default_unit (genérico).
                setPickerUnit(targetItem.market_container || targetItem.default_unit || 'unidad');
            }
        } else if (e.key === 'Escape' && pickerForId) {
            e.preventDefault();
            setPickerForId(null);
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

    // [P3-PANTRY-FRIDGE-LAYOUT · 2026-05-19] Helper para renderizar una card
    // de inventario. Extraído de inline para reusar en los 3 estantes, las
    // 2 gavetas, la puerta y la alacena con identidad visual unificada.
    // Cierra duplicación de ~125 líneas × 7 zonas que tendríamos si quedara
    // inline en cada bucket de la nueva estructura tipo nevera.
    const renderItemCard = (item) => {
        const normalizedName = item.ingredient_name.toLowerCase().trim();
        const isDisabled = disabledIngredients.includes(normalizedName);

        // [P3-PANTRY-MARKET-CONTAINER · 2026-05-19] Display unit prefers
        // `master_ingredients.market_container` (curado dominicano, el mismo
        // que usa el PDF/lista de compras) sobre `item.unit` (que puede ser
        // el `default_unit` genérico persistido en el pasado). Si master
        // no tiene market_container, cae a item.unit.
        const displayUnit = item.master_ingredients?.market_container || item.unit;

        return (
            <div
                key={item.id}
                className="nevera-item-card"
                style={{ opacity: isDisabled ? 0.5 : 1 }}
            >
                <div style={{ flex: 1, marginRight: '1rem', textDecoration: isDisabled ? 'line-through' : 'none' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: isDisabled ? 'var(--danger)' : 'var(--text-main)', lineHeight: 1.2 }}>{item.ingredient_name}</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="nevera-item-unit-tag" title={`Medida del item: ${displayUnit}`}>{displayUnit}</span>
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

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    <div className="nevera-item-counter">
                        <button
                            type="button"
                            onPointerDown={(e) => item.quantity > 1 && startHolding(e, item.id, -1)}
                            onPointerUp={(e) => stopHolding(e, item.id)}
                            onPointerLeave={(e) => stopHolding(e, item.id)}
                            onContextMenu={(e) => e.preventDefault()}
                            disabled={item.quantity <= 1}
                            aria-label={item.quantity <= 1
                                ? 'Cantidad mínima — usa "Agotar" para eliminar'
                                : `Disminuir cantidad de ${item.ingredient_name}`}
                            title={item.quantity <= 1
                                ? 'Para eliminar, usa el botón "Agotar"'
                                : 'Mantener presionado para bajar rápido'}
                            style={{
                                border: 'none',
                                background: 'none',
                                padding: '0.5rem',
                                color: item.quantity <= 1 ? 'var(--border)' : 'var(--text-muted)',
                                cursor: item.quantity <= 1 ? 'not-allowed' : 'pointer',
                                opacity: item.quantity <= 1 ? 0.5 : 1,
                                userSelect: 'none',
                                touchAction: 'manipulation',
                            }}
                        >
                            <Minus size={16} strokeWidth={2.5}/>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setQtyEditItem(item);
                                setQtyEditValue(item.quantity);
                            }}
                            title="Tocar para ajustar a cantidad exacta"
                            aria-label={`Ajustar cantidad de ${item.ingredient_name}`}
                            style={{
                                width: '2.8rem', textAlign: 'center', fontSize: '1rem', fontWeight: 800,
                                color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums',
                                background: 'none', border: 'none', padding: '0.4rem 0',
                                cursor: 'pointer', borderRadius: '0.4rem',
                                touchAction: 'manipulation',
                            }}
                        >
                            {item.quantity}
                        </button>

                        <button
                            className="nevera-plus-btn"
                            onPointerDown={(e) => startHolding(e, item.id, 1)}
                            onPointerUp={(e) => stopHolding(e, item.id)}
                            onPointerLeave={(e) => stopHolding(e, item.id)}
                            onContextMenu={(e) => e.preventDefault()}
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
            </div>
        );
    };

    return (
        <div className="nevera-page-outer" style={{ padding: '0px', paddingBottom: '90px', backgroundColor: 'var(--bg-page)', minHeight: '100vh', position: 'relative', transition: 'background-color 0.3s' }}>
        <div className="nevera-page-frame">
            <div className="nevera-overlay" />

            <style>{`
                /* === FRIDGE ENCLOSURE FRAME === */
                /* === [P3-PANTRY-FRIDGE-UNIT · 2026-05-19] === */
                .nevera-page-outer {
                    /* Wrapper de página — sin border. Hereda padding +
                       min-height + bg desde el style inline. La estructura
                       visual de "nevera completa" vive en .nevera-page-frame. */
                    position: relative;
                }
                .nevera-page-frame {
                    /* Marco UNIFICADO de toda la nevera — envuelve header
                       (freezer area) + cuerpo principal. Pre-fix había DOS
                       marcos anidados; ahora este es el único. */
                    position: relative;
                    border: 2.5px solid rgba(148, 163, 184, 0.4);
                    border-top: 3.5px solid rgba(241, 245, 249, 1);
                    border-bottom: 4px solid rgba(100, 116, 139, 0.5);
                    border-left: 2.5px solid rgba(203, 213, 225, 0.6);
                    border-right: 2.5px solid rgba(148, 163, 184, 0.55);
                    border-radius: 1.6rem;
                    overflow: hidden;
                    /* Fondo metálico perlado tipo "puerta de electrodoméstico" */
                    background:
                        linear-gradient(180deg,
                            rgba(248, 250, 252, 0.6) 0%,
                            rgba(241, 245, 249, 0.4) 50%,
                            rgba(226, 232, 240, 0.5) 100%);
                    box-shadow:
                        /* Highlight superior tipo "brillo metálico" */
                        inset 0 2px 0 rgba(255,255,255,1),
                        inset 0 -3px 0 rgba(148, 163, 184, 0.3),
                        inset 0 0 0 1px rgba(255,255,255,0.5),
                        /* Reflejo lateral izquierdo (luz desde arriba-izq) */
                        inset 4px 0 12px -6px rgba(255, 255, 255, 0.7),
                        /* Sombra lateral derecha (donde NO hay luz) */
                        inset -3px 0 10px -6px rgba(100, 116, 139, 0.18),
                        /* Sombra externa proyectada — nevera apoyada */
                        0 24px 48px -14px rgba(15, 23, 42, 0.25),
                        0 8px 20px -6px rgba(15, 23, 42, 0.15),
                        0 2px 6px -1px rgba(15, 23, 42, 0.08);
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

                /* === HEADER — "Puerta del freezer" (zona superior nevera) ===
                 * [P3-PANTRY-FRIDGE-UNIT · 2026-05-19] Pre-fix era panel
                 * frosted-cyan translúcido con border-radius arriba — flotaba
                 * separado del cuerpo. Ahora es la "puerta superior" de la
                 * nevera: fondo metálico perlado (no cyan), brand label tipo
                 * "logo de electrodoméstico", border-bottom groove tipo
                 * "unión entre puerta del freezer y puerta del cuerpo".
                 * Sin border-radius — el page-frame externo da las esquinas
                 * redondeadas; aquí queda recta para integrarse al unit. */
                .nevera-header {
                    padding: 3.3rem 3.2rem 1.8rem 2rem;
                    background:
                        /* Reflejo de luz desde arriba-centro */
                        radial-gradient(ellipse 70% 50% at 50% 0%,
                            rgba(255, 255, 255, 0.65) 0%,
                            transparent 70%),
                        /* Brillo izquierdo sutil */
                        radial-gradient(ellipse 30% 100% at 0% 50%,
                            rgba(255, 255, 255, 0.35) 0%,
                            transparent 60%),
                        /* Base metálica perlada */
                        linear-gradient(180deg,
                            rgba(255, 255, 255, 0.98) 0%,
                            rgba(248, 250, 252, 0.95) 40%,
                            rgba(241, 245, 249, 0.92) 80%,
                            rgba(226, 232, 240, 0.88) 100%);
                    border-bottom: 1px solid rgba(100, 116, 139, 0.35);
                    /* Groove divisor entre "puerta freezer" y "cuerpo" */
                    box-shadow:
                        inset 0 2px 0 rgba(255, 255, 255, 1),
                        inset 0 -3px 6px -2px rgba(100, 116, 139, 0.12),
                        /* Groove inferior — línea oscura + línea clara */
                        0 1px 0 rgba(255, 255, 255, 0.95),
                        0 2px 0 rgba(148, 163, 184, 0.25),
                        0 3px 0 rgba(255, 255, 255, 0.7);
                    position: relative;
                    overflow: hidden;
                }
                /* Patrón "cepillado" muy sutil simula acero inoxidable */
                .nevera-header::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: repeating-linear-gradient(
                        90deg,
                        rgba(255, 255, 255, 0) 0,
                        rgba(255, 255, 255, 0) 2px,
                        rgba(148, 163, 184, 0.025) 2px,
                        rgba(148, 163, 184, 0.025) 3px
                    );
                    pointer-events: none;
                    z-index: 0;
                }
                .nevera-header > * {
                    position: relative;
                    z-index: 1;
                }

                /* Etiqueta de marca tipo "logo discreto de electrodoméstico" */
                .nevera-brand-label {
                    position: absolute;
                    top: 0.55rem;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 2;
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    font-size: 0.65rem;
                    font-weight: 700;
                    letter-spacing: 0.18em;
                    text-transform: uppercase;
                    color: rgba(71, 85, 105, 0.75);
                    padding: 0.25rem 0.85rem;
                    background: linear-gradient(180deg,
                        rgba(241, 245, 249, 0.85) 0%,
                        rgba(226, 232, 240, 0.7) 100%);
                    border: 1px solid rgba(148, 163, 184, 0.35);
                    border-top-color: rgba(255, 255, 255, 0.9);
                    border-bottom-color: rgba(100, 116, 139, 0.4);
                    border-radius: 0 0 0.55rem 0.55rem;
                    box-shadow:
                        inset 0 1px 0 rgba(255, 255, 255, 0.7),
                        0 2px 4px -1px rgba(15, 23, 42, 0.12);
                    pointer-events: none;
                }
                .nevera-brand-dot {
                    width: 5px;
                    height: 5px;
                    border-radius: 50%;
                    background: radial-gradient(circle at 30% 30%,
                        #86EFAC 0%,
                        #22C55E 50%,
                        #15803D 100%);
                    box-shadow:
                        0 0 4px rgba(34, 197, 94, 0.8),
                        inset 0 -1px 1px rgba(0, 0, 0, 0.25);
                }

                /* Manija propia del freezer (puerta superior) — espejo
                   reducido de .nevera-fridge-handle del body. Alineada
                   verticalmente con esta para que se vea como dos manijas
                   de una nevera de dos puertas (top-mounted freezer). */
                .nevera-header-handle {
                    position: absolute;
                    top: 25%;
                    bottom: 25%;
                    right: 10px;
                    width: 22px;
                    border-radius: 14px;
                    background:
                        linear-gradient(90deg,
                            transparent 45%,
                            rgba(255, 255, 255, 0.55) 49%,
                            rgba(255, 255, 255, 0.85) 50%,
                            rgba(255, 255, 255, 0.55) 51%,
                            transparent 55%),
                        linear-gradient(90deg,
                            rgba(100, 116, 139, 0.95) 0%,
                            rgba(148, 163, 184, 1) 18%,
                            rgba(226, 232, 240, 1) 40%,
                            rgba(241, 245, 249, 1) 50%,
                            rgba(226, 232, 240, 1) 60%,
                            rgba(148, 163, 184, 1) 82%,
                            rgba(100, 116, 139, 0.95) 100%);
                    box-shadow:
                        inset 0 2px 0 rgba(255,255,255,0.95),
                        inset 0 1px 4px rgba(255,255,255,0.5),
                        inset 0 -2px 4px rgba(51, 65, 85, 0.5),
                        inset -1px 0 2px rgba(100, 116, 139, 0.3),
                        inset 1px 0 2px rgba(100, 116, 139, 0.3),
                        4px 6px 14px -2px rgba(15, 23, 42, 0.4),
                        2px 3px 6px -1px rgba(15, 23, 42, 0.25);
                    pointer-events: none;
                    z-index: 2;
                }
                .nevera-header-handle::before,
                .nevera-header-handle::after {
                    content: '';
                    position: absolute;
                    left: -4px;
                    right: -4px;
                    height: 11px;
                    background:
                        linear-gradient(180deg,
                            #94A3B8 0%,
                            #64748B 50%,
                            #475569 100%);
                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,0.4),
                        inset 0 -1px 2px rgba(15, 23, 42, 0.4),
                        0 2px 4px rgba(15, 23, 42, 0.35);
                }
                .nevera-header-handle::before {
                    top: -10px;
                    border-radius: 5px 5px 3px 3px;
                }
                .nevera-header-handle::after {
                    bottom: -10px;
                    border-radius: 3px 3px 5px 5px;
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
                /* [P3-PANTRY-NO-TITLE · 2026-05-19] Eliminados:
                   .nevera-title-row, .nevera-title, .nevera-snowflake-icon
                   y la animation keyframes nevera-frost-rotate. El título
                   "Nevera" + Snowflake del header se removieron del JSX
                   (la sidebar ya muestra Nevera como pestaña activa; era
                   redundante). */

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

                /* === BUTTONS — fridge control panel feel ===
                   [P3-PANTRY-BTN-HOVER-GLOW-ONLY · 2026-05-18] Hover SIN
                   movimiento. Solo el glow (box-shadow + border-color +
                   background) responde al puntero. Antes el lift translateY
                   se leía como inestable; reemplazado por intensificación
                   pura de la sombra. Cero transform, cero scale, cero
                   translateY — el botón se queda exactamente donde está. */
                .nevera-add-btn,
                .nevera-delete-all-btn {
                    padding: 0.75rem 1.4rem;
                    border-radius: 99px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    cursor: pointer;
                    will-change: box-shadow;
                    transition:
                        box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1),
                        background 0.22s ease-out,
                        border-color 0.22s ease-out;
                }

                .nevera-add-btn {
                    background: linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%);
                    color: #FFFFFF;
                    border: 2px solid rgba(125, 211, 252, 0.5);
                    border-top-color: rgba(186, 230, 253, 0.85);
                    border-bottom-color: rgba(3, 105, 161, 0.7);
                    position: relative;
                    overflow: hidden;
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,0.4),
                        inset 0 -2px 4px -1px rgba(3, 105, 161, 0.4),
                        0 8px 20px -4px rgba(14, 165, 233, 0.5),
                        0 2px 5px rgba(14, 165, 233, 0.18);
                }
                .nevera-add-btn:hover {
                    border-color: rgba(56, 189, 248, 0.85);
                    border-top-color: rgba(186, 230, 253, 1);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,0.55),
                        inset 0 -2px 4px -1px rgba(3, 105, 161, 0.5),
                        0 14px 32px -4px rgba(14, 165, 233, 0.65),
                        0 4px 10px rgba(14, 165, 233, 0.3);
                }

                .nevera-delete-all-btn {
                    background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(254, 242, 242, 0.85) 100%);
                    color: #DC2626;
                    border: 2px solid rgba(252, 165, 165, 0.6);
                    border-top-color: rgba(254, 202, 202, 0.95);
                    border-bottom-color: rgba(239, 68, 68, 0.45);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,1),
                        inset 0 -2px 4px -1px rgba(252, 165, 165, 0.3),
                        0 4px 12px -2px rgba(220, 38, 38, 0.12),
                        0 1px 3px rgba(0, 0, 0, 0.03);
                }
                .nevera-delete-all-btn:hover:not(:disabled) {
                    background: linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(254, 226, 226, 0.95) 100%);
                    border-color: rgba(248, 113, 113, 0.8);
                    border-top-color: rgba(254, 202, 202, 1);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,1),
                        inset 0 -2px 4px -1px rgba(248, 113, 113, 0.5),
                        0 10px 24px -3px rgba(220, 38, 38, 0.28),
                        0 3px 6px rgba(0, 0, 0, 0.05);
                }

                /* === SEARCH ===
                   [P3-PANTRY-SEARCH-STATIC · 2026-05-18] Sin animaciones ni
                   glows. Pre-fix el input tenía transition 0.2s en
                   border-color/box-shadow/background, drop-shadow en el
                   icono (aura constante) y :focus con anillo azul de 4px
                   que pulsaba al click. Todo eliminado para look estático. */
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
                    pointer-events: none;
                    z-index: 2;
                }
                .nevera-search-input {
                    width: 100%;
                    padding: 1rem 1rem 1rem 3rem;
                    border-radius: 1rem;
                    border: 2px solid rgba(125, 211, 252, 0.7);
                    outline: none;
                    font-size: 1rem;
                    font-weight: 500;
                    color: var(--text-main);
                    background: #FFFFFF;
                }
                .nevera-search-input::placeholder {
                    color: rgba(100, 116, 139, 0.85);
                    font-weight: 500;
                }
                .nevera-search-input:focus {
                    /* Solo border-color para a11y; sin transition, sin glow,
                       sin box-shadow extra. Cambio instantáneo. */
                    border-color: #0EA5E9;
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

                /* === [P3-PANTRY-FRIDGE-LAYOUT · 2026-05-19] ===
                   Cuerpo de la nevera (marco realista) + alacena externa.
                   El cuerpo agrupa 3 estantes + puerta + 2 gavetas dentro
                   de un contenedor con manija lateral, sombra inferior tipo
                   "piso" y patitas. La alacena (granos secos) vive afuera
                   como sección separada con paleta cálida (madera/ámbar). */

                .nevera-fridge-body {
                    position: relative;
                    /* [P3-PANTRY-FRIDGE-UNIT · 2026-05-19] Margen-top 0 para
                       continuidad con header (groove divisor visible). Sin
                       margin-bottom porque la sombra del piso ya está en el
                       page-frame externo. Padding-right para acomodar manija. */
                    margin: 0 0 1.5rem 0;
                    padding-right: 44px;
                }
                .nevera-fridge-interior-wrap {
                    position: relative;
                    /* [P3-PANTRY-FRIDGE-UNIT · 2026-05-19] Sin border ni
                       border-radius propios — el page-frame externo ya es el
                       marco visual de la nevera. Mantenemos solo el fondo
                       cyan claro tipo "interior frío iluminado" + sombras
                       inset que dan profundidad sin duplicar contorno. */
                    background:
                        linear-gradient(180deg,
                            rgba(240, 249, 255, 0.85) 0%,
                            rgba(224, 242, 254, 0.7) 50%,
                            rgba(186, 230, 253, 0.45) 100%);
                    padding: 1.25rem 1.4rem 1.5rem 1.4rem;
                    box-shadow:
                        /* Sombra interior tipo "frío reflejado" */
                        inset 0 4px 12px -4px rgba(255, 255, 255, 0.95),
                        inset 0 -8px 16px -6px rgba(14, 165, 233, 0.22),
                        inset 2px 0 6px -3px rgba(255, 255, 255, 0.6),
                        inset -2px 0 6px -3px rgba(14, 165, 233, 0.15);
                    /* Sutil "reflejo" en la esquina superior izquierda */
                    background-image:
                        linear-gradient(180deg,
                            rgba(240, 249, 255, 0.85) 0%,
                            rgba(224, 242, 254, 0.7) 50%,
                            rgba(186, 230, 253, 0.45) 100%),
                        radial-gradient(ellipse 60% 30% at 8% 4%,
                            rgba(255,255,255,0.55) 0%,
                            transparent 70%);
                }

                /* === Panel superior tipo "display de control" de nevera moderna === */
                .nevera-fridge-control-panel {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 0.8rem;
                    padding: 0.5rem 0.8rem;
                    margin: -0.6rem -0.4rem 1rem -0.4rem;
                    background:
                        linear-gradient(180deg,
                            rgba(15, 23, 42, 0.92) 0%,
                            rgba(30, 41, 59, 0.95) 100%);
                    border-radius: 0.8rem;
                    border: 1px solid rgba(51, 65, 85, 0.9);
                    border-top: 1.5px solid rgba(71, 85, 105, 1);
                    border-bottom: 2px solid rgba(2, 6, 23, 0.95);
                    box-shadow:
                        inset 0 1px 0 rgba(148, 163, 184, 0.3),
                        inset 0 -2px 4px rgba(0, 0, 0, 0.4),
                        0 4px 10px -2px rgba(15, 23, 42, 0.4);
                }
                .nevera-fridge-led-display {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    padding: 0.25rem 0.7rem;
                    background:
                        linear-gradient(180deg,
                            rgba(8, 47, 73, 0.95) 0%,
                            rgba(7, 89, 133, 0.9) 100%);
                    border-radius: 0.4rem;
                    border: 1px solid rgba(56, 189, 248, 0.6);
                    box-shadow:
                        inset 0 1px 2px rgba(0, 0, 0, 0.6),
                        0 0 8px rgba(56, 189, 248, 0.35);
                    /* Display monospace tipo LED */
                    font-family: 'Courier New', monospace;
                    font-weight: 700;
                }
                .nevera-fridge-led-icon {
                    color: #7DD3FC;
                    font-size: 0.85rem;
                    text-shadow: 0 0 4px rgba(125, 211, 252, 0.8);
                }
                .nevera-fridge-led-temp {
                    color: #BAE6FD;
                    font-size: 0.78rem;
                    letter-spacing: 0.05em;
                    text-shadow: 0 0 4px rgba(186, 230, 253, 0.7);
                }
                /* Rejilla de ventilación al centro */
                .nevera-fridge-vent {
                    flex: 1;
                    height: 14px;
                    background: repeating-linear-gradient(
                        90deg,
                        rgba(71, 85, 105, 0.9) 0,
                        rgba(71, 85, 105, 0.9) 2px,
                        rgba(15, 23, 42, 0.95) 2px,
                        rgba(15, 23, 42, 0.95) 4px
                    );
                    border-radius: 2px;
                    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
                }
                /* LED de encendido — verde pulsante */
                .nevera-fridge-power-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: radial-gradient(circle at 30% 30%,
                        #86EFAC 0%,
                        #22C55E 40%,
                        #15803D 100%);
                    box-shadow:
                        0 0 6px rgba(34, 197, 94, 0.9),
                        0 0 12px rgba(34, 197, 94, 0.5),
                        inset 0 -1px 1px rgba(0, 0, 0, 0.3);
                    flex-shrink: 0;
                }

                /* === Manija lateral derecha — barra vertical metálica realista === */
                .nevera-fridge-handle {
                    position: absolute;
                    top: 16%;
                    bottom: 20%;
                    right: 10px;
                    width: 22px;
                    border-radius: 14px;
                    background:
                        /* Reflejo vertical central tipo "brillo de cromo" */
                        linear-gradient(90deg,
                            transparent 45%,
                            rgba(255, 255, 255, 0.55) 49%,
                            rgba(255, 255, 255, 0.85) 50%,
                            rgba(255, 255, 255, 0.55) 51%,
                            transparent 55%),
                        /* Gradiente metálico base — cromado pulido */
                        linear-gradient(90deg,
                            rgba(100, 116, 139, 0.95) 0%,
                            rgba(148, 163, 184, 1) 18%,
                            rgba(226, 232, 240, 1) 40%,
                            rgba(241, 245, 249, 1) 50%,
                            rgba(226, 232, 240, 1) 60%,
                            rgba(148, 163, 184, 1) 82%,
                            rgba(100, 116, 139, 0.95) 100%);
                    box-shadow:
                        /* Highlight superior tipo "brillo metálico" */
                        inset 0 2px 0 rgba(255,255,255,0.95),
                        inset 0 1px 4px rgba(255,255,255,0.5),
                        /* Sombra inferior interna para volumen */
                        inset 0 -2px 4px rgba(51, 65, 85, 0.5),
                        inset -1px 0 2px rgba(100, 116, 139, 0.3),
                        inset 1px 0 2px rgba(100, 116, 139, 0.3),
                        /* Sombra externa proyectada */
                        4px 6px 14px -2px rgba(15, 23, 42, 0.4),
                        2px 3px 6px -1px rgba(15, 23, 42, 0.25);
                    pointer-events: none;
                    z-index: 2;
                }
                /* Pivote superior — bloque de anclaje al marco */
                .nevera-fridge-handle::before {
                    content: '';
                    position: absolute;
                    left: -4px;
                    right: -4px;
                    top: -12px;
                    height: 14px;
                    background:
                        linear-gradient(180deg,
                            #94A3B8 0%,
                            #64748B 50%,
                            #475569 100%);
                    border-radius: 5px 5px 3px 3px;
                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,0.4),
                        inset 0 -1px 2px rgba(15, 23, 42, 0.4),
                        0 2px 4px rgba(15, 23, 42, 0.35);
                }
                /* Pivote inferior — espejo del superior */
                .nevera-fridge-handle::after {
                    content: '';
                    position: absolute;
                    left: -4px;
                    right: -4px;
                    bottom: -12px;
                    height: 14px;
                    background:
                        linear-gradient(180deg,
                            #94A3B8 0%,
                            #64748B 50%,
                            #475569 100%);
                    border-radius: 3px 3px 5px 5px;
                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,0.4),
                        inset 0 -1px 2px rgba(15, 23, 42, 0.4),
                        0 2px 4px rgba(15, 23, 42, 0.35);
                }

                /* === Patitas inferiores de la nevera — más prominentes === */
                .nevera-fridge-feet {
                    position: absolute;
                    bottom: -16px;
                    left: 0;
                    right: 44px;
                    height: 16px;
                    display: flex;
                    justify-content: space-between;
                    padding: 0 7%;
                    pointer-events: none;
                    z-index: 1;
                }
                .nevera-fridge-feet span {
                    width: 44px;
                    height: 16px;
                    background:
                        linear-gradient(180deg,
                            #94A3B8 0%,
                            #64748B 45%,
                            #475569 75%,
                            #334155 100%);
                    border-radius: 0 0 8px 8px;
                    box-shadow:
                        inset 0 2px 0 rgba(255,255,255,0.35),
                        inset 0 -2px 2px rgba(15, 23, 42, 0.5),
                        0 4px 10px -2px rgba(15, 23, 42, 0.4),
                        0 2px 4px rgba(15, 23, 42, 0.25);
                    /* Sutil brillo metálico central */
                    background-image:
                        linear-gradient(180deg,
                            #94A3B8 0%,
                            #64748B 45%,
                            #475569 75%,
                            #334155 100%),
                        linear-gradient(90deg,
                            transparent 30%,
                            rgba(255,255,255,0.2) 50%,
                            transparent 70%);
                }

                /* === ZONA: estilo común === */
                .nevera-zone {
                    position: relative;
                    padding: 1.1rem 0 1.4rem 0;
                }
                .nevera-zone + .nevera-zone {
                    /* Divisor tipo "vidrio del estante" entre zonas */
                    border-top: 1.5px solid rgba(125, 211, 252, 0.55);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,0.85),
                        inset 0 -1px 2px rgba(14, 165, 233, 0.1);
                }
                .nevera-zone-header {
                    font-size: 1.05rem;
                    font-weight: 800;
                    color: var(--text-main);
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin: 0 0 0.9rem 0;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                    font-size: 0.85rem;
                }
                .nevera-zone-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 1rem;
                }

                /* === ZONA: PUERTA — fondo más oscuro tipo "compartimento" === */
                .nevera-zone-door {
                    background:
                        linear-gradient(180deg,
                            rgba(2, 132, 199, 0.08) 0%,
                            rgba(125, 211, 252, 0.12) 100%);
                    margin: 0.4rem -0.6rem;
                    padding: 1rem 0.9rem 1.2rem 0.9rem;
                    border-radius: 0.85rem;
                    border: 1px dashed rgba(14, 165, 233, 0.35);
                    /* Marca el "pliegue" de la puerta con borde lateral */
                    border-left: 4px solid rgba(56, 189, 248, 0.55);
                }
                .nevera-zone-door + .nevera-zone {
                    /* No queremos doble divisor cuando le sigue otra zona */
                    border-top: none;
                    box-shadow: none;
                }

                /* === GAVETAS (CRISPERS) — fila inferior === */
                .nevera-drawers-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    /* [P3-PANTRY-FRIDGE-POLISH · 2026-05-19] align-items: start
                       hace que cada gaveta crezca solo lo que su contenido
                       necesita. Pre-fix grid estiraba la gaveta corta (Frutas
                       con 3 items) a la altura de la larga (Verduras con 7),
                       dejando un hueco vacío feo en el screenshot del user. */
                    align-items: start;
                    gap: 0.9rem;
                    margin-top: 1.4rem;
                    padding-top: 1.4rem;
                    border-top: 1.5px solid rgba(125, 211, 252, 0.55);
                    box-shadow:
                        inset 0 1.5px 0 rgba(255,255,255,0.85);
                }
                .nevera-drawer {
                    background:
                        linear-gradient(180deg,
                            rgba(255, 255, 255, 0.95) 0%,
                            rgba(224, 242, 254, 0.75) 100%);
                    border: 2px solid rgba(125, 211, 252, 0.7);
                    border-top: 1.5px solid rgba(186, 230, 253, 0.95);
                    border-bottom: 3px solid rgba(56, 189, 248, 0.55);
                    /* Radius pronunciado abajo simula crisper real */
                    border-radius: 0.6rem 0.6rem 1.4rem 1.4rem;
                    padding: 1rem 1rem 1.2rem 1rem;
                    box-shadow:
                        inset 0 2px 0 rgba(255,255,255,0.9),
                        inset 0 -6px 12px -4px rgba(14, 165, 233, 0.18),
                        0 4px 10px -3px rgba(14, 165, 233, 0.18);
                    position: relative;
                }
                /* Asita de la gaveta (línea horizontal arriba al centro) */
                .nevera-drawer::before {
                    content: '';
                    position: absolute;
                    top: 6px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 48px;
                    height: 4px;
                    background: linear-gradient(180deg, #94A3B8 0%, #64748B 100%);
                    border-radius: 99px;
                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,0.45),
                        0 1px 2px rgba(15, 23, 42, 0.2);
                }
                .nevera-drawer-header {
                    margin-top: 0.6rem;
                }
                .nevera-drawer-grid {
                    display: grid;
                    /* Cards más compactas en gavetas */
                    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
                    gap: 0.8rem;
                }

                /* === ALACENA — fuera de la nevera, paleta ámbar === */
                .nevera-pantry-section {
                    /* [P3-PANTRY-BOTTOM-SPACE · 2026-05-19] margin-bottom
                       2.5rem → 0.6rem. La alacena suele ser el último
                       elemento y el paddingBottom del page-outer ya da
                       espacio sobre el BottomTabBar. Pre-fix sumaban
                       ~140px de espacio vacío. */
                    margin: 0 0 0.6rem 0;
                    padding: 1.4rem 1.4rem 1.6rem 1.4rem;
                    background:
                        linear-gradient(180deg,
                            rgba(254, 243, 199, 0.55) 0%,
                            rgba(253, 230, 138, 0.4) 100%);
                    border: 2px solid rgba(217, 119, 6, 0.35);
                    border-top: 3px solid rgba(245, 158, 11, 0.55);
                    border-bottom: 3px solid rgba(180, 83, 9, 0.35);
                    border-radius: 1.2rem;
                    box-shadow:
                        inset 0 2px 6px rgba(255,255,255,0.7),
                        inset 0 -6px 14px -4px rgba(180, 83, 9, 0.12),
                        0 12px 28px -10px rgba(180, 83, 9, 0.25);
                    /* Sutil patrón "tablones de madera" via repeating gradient */
                    background-image:
                        linear-gradient(180deg,
                            rgba(254, 243, 199, 0.55) 0%,
                            rgba(253, 230, 138, 0.4) 100%),
                        repeating-linear-gradient(90deg,
                            transparent 0px,
                            transparent 80px,
                            rgba(180, 83, 9, 0.04) 80px,
                            rgba(180, 83, 9, 0.04) 81px);
                }
                .nevera-pantry-header {
                    color: #78350F;
                }
                .nevera-pantry-subtitle {
                    margin: -0.4rem 0 1rem 0;
                    color: #92400E;
                    font-size: 0.82rem;
                    font-style: italic;
                }
                .nevera-pantry-count {
                    font-size: 0.75rem;
                    background: linear-gradient(135deg, rgba(254, 243, 199, 0.85) 0%, rgba(253, 230, 138, 0.7) 100%);
                    border: 1px solid rgba(217, 119, 6, 0.5);
                    color: #78350F;
                    padding: 0.15rem 0.6rem;
                    border-radius: 99px;
                    font-weight: 800;
                    font-variant-numeric: tabular-nums;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
                }

                /* === ITEM CARDS — fridge bin / drawer look ===
                 * NO backdrop-filter aquí: con 30+ items el navegador
                 * composita N capas blur por scroll frame y el listado
                 * empieza a janquear (sobre todo en mobile). Reemplazado
                 * por gradiente opaco que da el mismo look "frosted". */
                /* [P3-PANTRY-CARD-STATIC · 2026-05-19] Card 100% estática
                 * por pedido del user: cero animación + sin "brillo azul"
                 * cyan que la rodeaba. Antes tenía:
                 *   - 3 tonos cyan en border (top más claro, bottom más
                 *     saturado) → glow effect.
                 *   - box-shadow con tint cyan (rgba(14, 165, 233, 0.18))
                 *     → halo azul alrededor.
                 *   - background gradient con sky-blue tones → look
                 *     "frosted".
                 *   - ::before pseudo-element con shimmer blanco translúcido
                 *     → highlight de superficie fría.
                 *   - transition: transform + box-shadow + border-color
                 *     0.2s → hover animaba.
                 *   - :hover translateY(-2px) + glow extendido.
                 * Ahora: card plana blanca con border slate neutro, sin
                 * shadow, sin transition, sin hover effect, sin shimmer
                 * overlay. Look limpio y predecible.
                 */
                .nevera-item-card {
                    background: #FFFFFF;
                    border: 1px solid #E2E8F0;
                    border-radius: 1rem;
                    padding: 1.2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    contain: layout style paint;
                }
                /* [P3-PANTRY-PLUS-HOVER · 2026-05-19] Botón '+' del counter
                 * de cada card. Estilos movidos desde inline a class para
                 * poder añadir :hover con sombra reforzada (no se podía con
                 * styles inline puros). */
                .nevera-plus-btn {
                    border: none;
                    background: linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%);
                    color: white;
                    border-radius: 99px;
                    padding: 0.5rem;
                    cursor: pointer;
                    box-shadow:
                        0 4px 12px -2px rgba(14, 165, 233, 0.45),
                        inset 0 1px 0 rgba(255,255,255,0.2);
                    user-select: none;
                    touch-action: manipulation;
                    transition: box-shadow 0.15s ease;
                }
                @media (hover: hover) and (pointer: fine) {
                    .nevera-plus-btn:hover {
                        box-shadow:
                            0 8px 20px -2px rgba(14, 165, 233, 0.65),
                            0 0 0 4px rgba(14, 165, 233, 0.18),
                            inset 0 1px 0 rgba(255,255,255,0.3);
                    }
                }
                .nevera-plus-btn:active {
                    box-shadow:
                        0 2px 6px -2px rgba(14, 165, 233, 0.5),
                        inset 0 1px 0 rgba(255,255,255,0.15);
                }
                .nevera-item-unit-tag {
                    font-size: 0.78rem;
                    color: #075985;
                    background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(224, 242, 254, 0.9) 100%);
                    border: 1px solid rgba(125, 211, 252, 0.6);
                    padding: 0.18rem 0.6rem;
                    border-radius: 0.4rem;
                    font-weight: 600;
                    text-transform: capitalize;
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

                /* [P3-PANTRY-NO-TITLE · 2026-05-19] Bloque desktop
                   "@media (min-width: 641px) { .nevera-title-row: display: none }"
                   eliminado — el JSX ya no renderiza .nevera-title-row. */

                /* === MOBILE === [P3-PANTRY-MOBILE-POLISH · 2026-05-19] === */
                @media (max-width: 640px) {
                    /* === HEADER (puerta del freezer) compactado ===
                       Pre-fix mobile: padding 1.6rem top + 1.25rem bottom →
                       header gigante con gap visible al body. Ahora:
                       1.1rem top / 0.7rem bottom + título y pills reducidos.
                       Layout horizontal de pills en row evita altura excesiva. */
                    .nevera-header {
                        /* [P3-PANTRY-BRAND-SPACING · 2026-05-19] padding-top
                           generoso para que el brand label absoluto no pise
                           el pill "Solo lo que tienes" debajo. */
                        padding: 2.5rem 2rem 0.75rem 0.9rem;
                    }
                    .nevera-brand-label {
                        font-size: 0.55rem;
                        padding: 0.16rem 0.55rem;
                        letter-spacing: 0.12em;
                        top: 0.4rem;
                    }
                    .nevera-header-handle {
                        width: 14px;
                        right: 6px;
                        border-radius: 9px;
                    }
                    .nevera-header-handle::before,
                    .nevera-header-handle::after {
                        height: 9px;
                        left: -3px;
                        right: -3px;
                    }
                    .nevera-header-handle::before { top: -7px; }
                    .nevera-header-handle::after  { bottom: -7px; }

                    .nevera-top {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 0.9rem;
                    }
                    .nevera-title-wrapper {
                        gap: 0.5rem;
                    }
                    /* [P3-PANTRY-NO-TITLE · 2026-05-19] Reglas mobile de
                       .nevera-title y .nevera-snowflake-icon eliminadas
                       junto con el JSX que las usaba. */
                    .nevera-badge-text {
                        font-size: 0.7rem !important;
                        white-space: nowrap;
                    }

                    /* Botones + búsqueda compactos */
                    .nevera-add-btn,
                    .nevera-delete-all-btn {
                        flex: 1;
                        padding: 0.6rem 0.8rem;
                        font-size: 0.85rem;
                        white-space: nowrap;
                    }
                    .nevera-search-wrap {
                        margin-top: 1rem;
                    }
                    .nevera-search-input {
                        padding: 0.85rem 1rem 0.85rem 2.75rem;
                        font-size: 0.95rem;
                        border-radius: 0.85rem;
                    }
                    .nevera-search-icon {
                        left: 0.9rem;
                    }

                    /* === BODY (cuerpo principal) más cerca del header === */
                    .nevera-fridge-body {
                        padding-right: 26px;
                        margin: 0 0 1rem 0;
                    }
                    .nevera-fridge-interior-wrap {
                        /* padding-top reducido para cerrar gap con header.
                           Antes 1rem (~ resulta en gap visible); ahora 0.75rem. */
                        padding: 0.75rem 0.75rem 1.25rem 0.75rem;
                    }
                    .nevera-fridge-control-panel {
                        margin: -0.25rem -0.1rem 0.7rem -0.1rem;
                        padding: 0.35rem 0.55rem;
                        gap: 0.5rem;
                        border-radius: 0.6rem;
                    }
                    .nevera-fridge-vent {
                        display: none;
                    }
                    .nevera-fridge-led-display {
                        flex: 1;
                        justify-content: center;
                        padding: 0.2rem 0.6rem;
                    }
                    .nevera-fridge-led-icon { font-size: 0.78rem; }
                    .nevera-fridge-led-temp { font-size: 0.72rem; }
                    .nevera-fridge-power-dot {
                        width: 7px;
                        height: 7px;
                    }

                    .nevera-fridge-handle {
                        width: 14px;
                        right: 6px;
                        border-radius: 9px;
                    }
                    .nevera-fridge-handle::before,
                    .nevera-fridge-handle::after {
                        height: 9px;
                        left: -3px;
                        right: -3px;
                    }
                    .nevera-fridge-handle::before { top: -7px; }
                    .nevera-fridge-handle::after  { bottom: -7px; }
                    .nevera-fridge-feet {
                        right: 26px;
                        padding: 0 6%;
                    }
                    .nevera-fridge-feet span {
                        width: 30px;
                        height: 13px;
                    }

                    /* === ZONAS, CARDS, GAVETAS más compactas === */
                    .nevera-zone {
                        padding: 0.85rem 0 0.95rem 0;
                    }
                    .nevera-zone-header {
                        font-size: 0.78rem !important;
                        margin: 0 0 0.6rem 0 !important;
                        gap: 0.4rem !important;
                    }
                    .nevera-zone-door {
                        margin: 0.3rem -0.35rem;
                        padding: 0.7rem 0.6rem 0.85rem 0.6rem;
                        border-radius: 0.65rem;
                    }
                    .nevera-item-card {
                        padding: 0.85rem 0.9rem;
                        border-radius: 0.85rem;
                    }
                    .nevera-item-card h3 {
                        font-size: 0.95rem !important;
                    }
                    .nevera-item-unit-tag {
                        font-size: 0.72rem !important;
                        padding: 0.15rem 0.5rem !important;
                    }
                    .nevera-deplete-btn {
                        padding: 0.25rem 0.55rem !important;
                        font-size: 0.66rem !important;
                    }

                    .nevera-drawers-row {
                        grid-template-columns: 1fr;
                        gap: 0.7rem;
                        margin-top: 1rem;
                        padding-top: 1rem;
                    }
                    .nevera-drawer {
                        padding: 0.85rem 0.8rem 1rem 0.8rem;
                        border-radius: 0.5rem 0.5rem 1.1rem 1.1rem;
                    }
                    .nevera-drawer-header {
                        margin-top: 0.5rem;
                    }
                    .nevera-zone-grid,
                    .nevera-drawer-grid {
                        grid-template-columns: 1fr;
                        gap: 0.7rem;
                    }

                    /* === ALACENA compactada === */
                    .nevera-pantry-section {
                        padding: 1rem 0.95rem 1.15rem 0.95rem;
                        border-radius: 1rem;
                    }
                    .nevera-pantry-subtitle {
                        font-size: 0.75rem !important;
                        margin-bottom: 0.85rem !important;
                    }
                }

                /* === EXTRA-SMALL (≤380px) — pantallas estrechas tipo iPhone SE === */
                @media (max-width: 380px) {
                    .nevera-header {
                        padding: 2.35rem 1.6rem 0.7rem 0.75rem;
                    }
                    .nevera-add-btn,
                    .nevera-delete-all-btn {
                        padding: 0.55rem 0.65rem;
                        font-size: 0.78rem;
                    }
                    /* Iconos solos cuando el espacio aprieta */
                    .nevera-header-handle {
                        width: 11px;
                        right: 4px;
                    }
                }
            `}</style>
            
            {/* [P3-PANTRY-FRIDGE-UNIT · 2026-05-19] Header / Nav — Freezer area
                (puerta superior de la nevera). El `.nevera-page-frame` exterior
                actúa ahora como "marco de nevera completa" (border + sombras
                3D) que envuelve solo header + fridge-body. La alacena vive
                fuera (sibling del frame) — coherente con la decisión de
                producto "lo seco no va en nevera". Pre-fix la alacena quedaba
                atrapada dentro del marco cyan, contradiciendo el simbolismo. */}
            <header className="nevera-header">
                {/* Etiqueta tipo "modelo de electrodoméstico" — refuerza
                    la metáfora de aparato real con un nombre técnico. */}
                <div className="nevera-brand-label" aria-hidden="true">
                    <span className="nevera-brand-dot" />
                    FRIO MAX
                </div>
                {/* Manija propia del freezer (puerta superior) — pequeña,
                    alineada vertical con la manija del cuerpo principal. */}
                <div className="nevera-header-handle" aria-hidden="true" />
                <div className="nevera-top">
                    <div className="nevera-title-wrapper">
                        <div>
                            {/* [P3-PANTRY-NO-TITLE · 2026-05-19] Snowflake +
                                "Nevera" eliminados. La sidebar ya muestra
                                "Nevera" activo; aquí era redundante. El brand
                                label "FRIO MAX" arriba mantiene la identidad
                                de electrodoméstico sin duplicar el nombre. */}
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
            {/* [P3-PANTRY-FRIDGE-UNIT · 2026-05-19] padding 0 (no lateral)
                para que el body llene el ancho del page-frame, alineado
                con el header arriba. El interior-wrap tiene su propio
                padding interno que mantiene aire alrededor de las cards. */}
            <div style={{ padding: '0' }}>

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
                    {/* [P3-PANTRY-FRIDGE-LAYOUT · 2026-05-19] Marco de nevera
                        física + alacena externa. Las categorías se mapean a
                        zonas (3 estantes interiores + puerta + 2 gavetas) por
                        CATEGORY_TO_ZONE. Zonas vacías se ocultan. Los granos
                        secos/especias/conservas viven fuera de la nevera, en
                        la "alacena" — refuerza el simbolismo de "qué se
                        guarda dónde" en cocina dominicana real. */}
                    {(() => {
                        const fridgeZones = ZONE_DEFINITIONS.filter(z => z.kind !== 'pantry');
                        const pantryZone  = ZONE_DEFINITIONS.find(z => z.kind === 'pantry');

                        const shelfZones  = fridgeZones.filter(z => z.kind === 'shelf');
                        const doorZone    = fridgeZones.find(z => z.kind === 'door');
                        const drawerZones = fridgeZones.filter(z => z.kind === 'drawer');

                        const drawersHaveItems = drawerZones.some(z => (inventoryByZone[z.key] || []).length > 0);
                        const doorHasItems     = doorZone && (inventoryByZone[doorZone.key] || []).length > 0;
                        const shelvesHaveItems = shelfZones.some(z => (inventoryByZone[z.key] || []).length > 0);
                        const pantryHasItems   = pantryZone && (inventoryByZone[pantryZone.key] || []).length > 0;
                        const fridgeHasAnyItem = shelvesHaveItems || doorHasItems || drawersHaveItems;

                        const renderZoneShelf = (zone) => {
                            const items = inventoryByZone[zone.key] || [];
                            if (items.length === 0) return null;
                            const Icon = zone.icon;
                            return (
                                <div key={zone.key} className={`nevera-zone nevera-zone-${zone.kind}`}>
                                    <h2 className="nevera-zone-header">
                                        <Icon size={18} strokeWidth={2.25} style={{ color: zone.color, flexShrink: 0 }} />
                                        {zone.label}
                                        <span className="nevera-shelf-count">{items.length}</span>
                                    </h2>
                                    <div className="nevera-zone-grid">
                                        {items.map(renderItemCard)}
                                    </div>
                                </div>
                            );
                        };

                        return (
                            <>
                                {fridgeHasAnyItem && (
                                    <div className="nevera-fridge-body" aria-label="Interior de la nevera">
                                        <div className="nevera-fridge-handle" aria-hidden="true" />
                                        <div className="nevera-fridge-interior-wrap">
                                            {/* Panel superior tipo "display de control" de nevera moderna */}
                                            <div className="nevera-fridge-control-panel" aria-hidden="true">
                                                <div className="nevera-fridge-led-display">
                                                    <span className="nevera-fridge-led-icon">❄</span>
                                                    <span className="nevera-fridge-led-temp">3°C</span>
                                                </div>
                                                <div className="nevera-fridge-vent" />
                                                <div className="nevera-fridge-power-dot" title="Encendida" />
                                            </div>
                                            {shelfZones.map(renderZoneShelf)}
                                            {doorZone && renderZoneShelf(doorZone)}
                                            {drawersHaveItems && (
                                                <div className="nevera-drawers-row">
                                                    {drawerZones.map(zone => {
                                                        const items = inventoryByZone[zone.key] || [];
                                                        if (items.length === 0) return null;
                                                        const Icon = zone.icon;
                                                        return (
                                                            <div key={zone.key} className="nevera-drawer">
                                                                <h2 className="nevera-zone-header nevera-drawer-header">
                                                                    <Icon size={18} strokeWidth={2.25} style={{ color: zone.color, flexShrink: 0 }} />
                                                                    {zone.label}
                                                                    <span className="nevera-shelf-count">{items.length}</span>
                                                                </h2>
                                                                <div className="nevera-drawer-grid">
                                                                    {items.map(renderItemCard)}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        <div className="nevera-fridge-feet" aria-hidden="true">
                                            <span /><span />
                                        </div>
                                    </div>
                                )}
                                {/* [P3-PANTRY-FRIDGE-UNIT · 2026-05-19] La
                                    sección de alacena se renderiza FUERA del
                                    page-frame (más abajo en el JSX) para que
                                    no quede atrapada dentro del marco cyan de
                                    nevera. Aquí solo retornamos el body. */}
                            </>
                        );
                    })()}

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
                                {/* [P3-PANTRY-STATIC-CARDS · 2026-05-19] Cards
                                    Agotados también estáticas — mismo motivo. */}
                                {visibleDepletedItems.map(entry => (
                                        <div
                                            key={_depletedKey(entry)}
                                            className="nevera-depleted-card"
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
                                        </div>
                                    ))}
                            </div>
                        </section>
                    )}
                    </>
                )}
            </div>
            </div>{/* /nevera-page-frame */}

            {/* [P3-PANTRY-FRIDGE-UNIT · 2026-05-19] La alacena (granos secos,
                especias, despensa) vive AQUÍ — fuera del marco de nevera —
                porque conceptualmente no se refrigera en RD. La paleta ámbar
                + el patrón sutil de "tablones de madera" la diferencia
                visualmente como mueble distinto a la nevera. */}
            {(() => {
                const pantryZone = ZONE_DEFINITIONS.find(z => z.kind === 'pantry');
                if (!pantryZone) return null;
                const pantryItems = inventoryByZone[pantryZone.key] || [];
                if (pantryItems.length === 0) return null;
                return (
                    <div style={{ padding: '0 1.5rem', marginTop: '1.5rem' }}>
                        <section className="nevera-pantry-section" aria-label="Alacena">
                            <h2 className="nevera-zone-header nevera-pantry-header">
                                <pantryZone.icon size={18} strokeWidth={2.25} style={{ color: pantryZone.color, flexShrink: 0 }} />
                                {pantryZone.label}
                                <span className="nevera-pantry-count">{pantryItems.length}</span>
                            </h2>
                            <p className="nevera-pantry-subtitle">
                                Lo seco no va en nevera — arroz, especias, conservas y granos viven aquí.
                            </p>
                            <div className="nevera-zone-grid">
                                {pantryItems.map(renderItemCard)}
                            </div>
                        </section>
                    </div>
                );
            })()}

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

                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.4rem 0', color: 'var(--text-main)' }}>Añade a tu Nevera</h2>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0 0 1rem 0', lineHeight: 1.4 }}>
                                Busca el alimento, ajusta la cantidad y elige cómo viene (botella, libra, paquete…).
                            </p>

                            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                                <SearchIcon color="var(--text-light)" size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="¿Qué vas a añadir? (ej: vinagre, aceite, pollo)"
                                    value={addItemSearch}
                                    onChange={e => setAddItemSearch(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    style={{
                                        width: '100%', padding: '1.2rem 1rem 1.2rem 3rem', borderRadius: '1rem', border: '2px solid var(--border)',
                                        outline: 'none', fontSize: '1.1rem', fontWeight: 500, background: 'var(--bg-page)', color: 'var(--text-main)'
                                    }}
                                />
                            </div>

                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                                <AlertCircle size={14} /> Si no aparece, prueba con otro nombre o sinónimo.
                            </p>

                            {/* Resultados de búsqueda (Scrollable) */}
                            <div style={{ overflowY: 'auto', flex: 1, paddingBottom: '2rem' }}>
                                {suggestedMasterItems.map((item, index) => {
                                    const isPickerOpen = pickerForId === item.id;
                                    const existing = inventory.find(i => i.master_ingredient_id === item.id);
                                    return (
                                    <div
                                        key={item.id}
                                        onMouseEnter={() => setSelectedIndex(index)}
                                        style={{
                                            borderBottom: '1px solid var(--bg-muted)',
                                            backgroundColor: isPickerOpen
                                                ? 'var(--bg-page)'
                                                : (index === selectedIndex ? 'var(--bg-muted)' : 'transparent'),
                                            borderRadius: isPickerOpen ? '1rem' : (index === selectedIndex ? '0.5rem' : '0'),
                                            transition: 'background-color 0.2s',
                                            marginBottom: isPickerOpen ? '0.5rem' : 0,
                                        }}
                                    >
                                        <div
                                            onClick={() => {
                                                if (isPickerOpen) {
                                                    setPickerForId(null);
                                                } else {
                                                    setPickerForId(item.id);
                                                    setPickerQty(1);
                                                    // [P3-PANTRY-MARKET-CONTAINER · 2026-05-19]
                                                    setPickerUnit(item.market_container || item.default_unit || 'unidad');
                                                }
                                            }}
                                            style={{
                                                padding: '1rem', display: 'flex',
                                                justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>{item.name}</h4>
                                                {existing ? (
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--secondary)', marginTop: '0.2rem', display: 'block', fontWeight: 600 }}>
                                                        Ya tienes {existing.quantity} {existing.unit} · sumará a tu existente
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.2rem', display: 'block' }}>
                                                        Alias incl.: {item.aliases?.slice(0, 3).join(', ')}{item.aliases?.length > 3 ? '...' : ''}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                disabled={isAdding}
                                                style={{
                                                    background: isPickerOpen
                                                        ? 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)'
                                                        : 'var(--bg-muted)',
                                                    color: isPickerOpen ? 'white' : 'var(--secondary)',
                                                    border: isPickerOpen ? 'none' : '1px solid var(--border)',
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '99px', fontWeight: 700, cursor: 'pointer',
                                                    boxShadow: isPickerOpen ? '0 4px 12px -2px rgba(14, 165, 233, 0.45)' : 'none',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {isPickerOpen ? 'Cerrar' : 'Elegir'}
                                            </button>
                                        </div>

                                        <AnimatePresence initial={false}>
                                            {isPickerOpen && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    style={{ overflow: 'hidden' }}
                                                >
                                                    <div style={{ padding: '0 1rem 1.25rem 1rem' }}>
                                                        {/* Counter de cantidad */}
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Cantidad</span>
                                                            <div style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '0.75rem',
                                                                background: 'var(--bg-card)', borderRadius: '99px', padding: '0.35rem',
                                                                border: '1px solid var(--border)',
                                                            }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPickerQty(q => Math.max(1, q - 1))}
                                                                    disabled={pickerQty <= 1}
                                                                    style={{
                                                                        border: 'none', background: 'none', padding: '0.5rem',
                                                                        color: pickerQty <= 1 ? 'var(--border)' : 'var(--text-muted)',
                                                                        cursor: pickerQty <= 1 ? 'not-allowed' : 'pointer',
                                                                        touchAction: 'manipulation',
                                                                    }}
                                                                    aria-label="Disminuir cantidad"
                                                                >
                                                                    <Minus size={18} strokeWidth={2.5} />
                                                                </button>
                                                                <span style={{
                                                                    minWidth: '2.5rem', textAlign: 'center', fontSize: '1.15rem',
                                                                    fontWeight: 800, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums',
                                                                }}>
                                                                    {pickerQty}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPickerQty(q => Math.min(999, q + 1))}
                                                                    style={{
                                                                        border: 'none',
                                                                        background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
                                                                        color: 'white', borderRadius: '99px', padding: '0.5rem',
                                                                        cursor: 'pointer', touchAction: 'manipulation',
                                                                        boxShadow: '0 4px 12px -2px rgba(14, 165, 233, 0.45)',
                                                                    }}
                                                                    aria-label="Aumentar cantidad"
                                                                >
                                                                    <Plus size={18} strokeWidth={3} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Pills de unidades */}
                                                        {existing ? (
                                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem 0', fontStyle: 'italic' }}>
                                                                Se sumará usando la unidad actual ({existing.unit}).
                                                            </p>
                                                        ) : (
                                                            <>
                                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>
                                                                    ¿Cómo viene?
                                                                </div>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
                                                                    {/* Unión de market_container + default_unit + COMMON. Preserva
                                                                        la unidad recomendada del catálogo (ej. "diente" para ajo)
                                                                        y prioriza el `market_container` curado (ej. "cartón"
                                                                        para leche) — [P3-PANTRY-MARKET-CONTAINER · 2026-05-19]. */}
                                                                    {Array.from(new Set([
                                                                        item.market_container || item.default_unit || 'unidad',
                                                                        item.default_unit || 'unidad',
                                                                        ...COMMON_PURCHASE_UNITS,
                                                                    ])).map(unit => {
                                                                        const isActive = pickerUnit === unit;
                                                                        return (
                                                                            <button
                                                                                type="button"
                                                                                key={unit}
                                                                                onClick={() => setPickerUnit(unit)}
                                                                                style={{
                                                                                    padding: '0.45rem 0.9rem',
                                                                                    borderRadius: '99px',
                                                                                    border: isActive ? '2px solid #0EA5E9' : '1px solid var(--border)',
                                                                                    background: isActive ? 'rgba(14, 165, 233, 0.08)' : 'var(--bg-card)',
                                                                                    color: isActive ? '#0369A1' : 'var(--text-main)',
                                                                                    fontWeight: isActive ? 700 : 500,
                                                                                    fontSize: '0.85rem',
                                                                                    cursor: 'pointer',
                                                                                    textTransform: 'capitalize',
                                                                                    touchAction: 'manipulation',
                                                                                    transition: 'all 0.15s',
                                                                                }}
                                                                            >
                                                                                {unit}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </>
                                                        )}

                                                        {/* Preview + Botón confirmar */}
                                                        <button
                                                            type="button"
                                                            disabled={isAdding}
                                                            onClick={() => handleAddNewItem(item, pickerQty, pickerUnit)}
                                                            style={{
                                                                width: '100%',
                                                                padding: '0.9rem 1rem',
                                                                background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
                                                                color: 'white', border: 'none', borderRadius: '1rem',
                                                                fontWeight: 800, fontSize: '1rem',
                                                                cursor: isAdding ? 'wait' : 'pointer',
                                                                opacity: isAdding ? 0.7 : 1,
                                                                boxShadow: '0 6px 18px -4px rgba(14, 165, 233, 0.55)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                                                touchAction: 'manipulation',
                                                            }}
                                                        >
                                                            {isAdding ? (
                                                                <><Loader2 size={18} className="spin-fast" /> Añadiendo…</>
                                                            ) : existing ? (
                                                                <><Plus size={18} strokeWidth={3} /> Sumar {pickerQty} {existing.unit} a la nevera</>
                                                            ) : (
                                                                <><Plus size={18} strokeWidth={3} /> Añadir {pickerQty} {pickerUnit} a la nevera</>
                                                            )}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    );
                                })}

                                {addItemSearch.trim() && suggestedMasterItems.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                                        <Package size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No encontramos "{addItemSearch.trim()}"</div>
                                        <div style={{ fontSize: '0.85rem' }}>Prueba con otro nombre o un sinónimo más común.</div>
                                    </div>
                                )}

                                {!addItemSearch.trim() && (
                                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-light)' }}>
                                        <SearchIcon size={28} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                                        <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                                            Escribe el nombre del alimento para ver opciones.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* [P3-PANTRY-QTY-EDIT · 2026-05-18] Modal de ajuste exacto de cantidad */}
            <AnimatePresence>
                {qtyEditItem && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => !qtyEditSaving && setQtyEditItem(null)}
                            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', zIndex: 150 }}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94, y: '-50%', x: '-50%' }}
                            animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
                            exit={{ opacity: 0, scale: 0.94, y: '-50%', x: '-50%' }}
                            transition={{ type: 'spring', damping: 22, stiffness: 240 }}
                            style={{
                                position: 'fixed', top: '50%', left: '50%',
                                background: 'var(--bg-card)', borderRadius: '1.5rem', padding: '2rem', zIndex: 151,
                                width: '92%', maxWidth: '420px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                            }}
                        >
                            <h2 style={{ margin: '0 0 0.3rem 0', fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                Ajustar cantidad
                            </h2>
                            <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                                <strong style={{ color: 'var(--text-main)' }}>{qtyEditItem.ingredient_name}</strong>
                                {' '}· medida: <span style={{ textTransform: 'capitalize' }}>{qtyEditItem.unit}</span>
                            </p>

                            {/* Counter grande */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
                                marginBottom: '1.25rem',
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setQtyEditValue(v => Math.max(0, (Number(v) || 0) - 1))}
                                    disabled={qtyEditSaving || qtyEditValue <= 0}
                                    style={{
                                        border: '1px solid var(--border)', background: 'var(--bg-card)',
                                        borderRadius: '99px', width: '3rem', height: '3rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: qtyEditValue <= 0 ? 'var(--border)' : 'var(--text-main)',
                                        cursor: qtyEditValue <= 0 || qtyEditSaving ? 'not-allowed' : 'pointer',
                                        touchAction: 'manipulation',
                                    }}
                                    aria-label="Disminuir cantidad"
                                >
                                    <Minus size={20} strokeWidth={3} />
                                </button>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max="999"
                                    value={qtyEditValue}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        if (isNaN(n)) {
                                            setQtyEditValue('');
                                            return;
                                        }
                                        setQtyEditValue(Math.max(0, Math.min(999, n)));
                                    }}
                                    onBlur={() => {
                                        // Si quedó vacío al salir del input, restaura el valor previo.
                                        if (qtyEditValue === '' || qtyEditValue === null) {
                                            setQtyEditValue(qtyEditItem.quantity);
                                        }
                                    }}
                                    style={{
                                        width: '5.5rem', textAlign: 'center',
                                        fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)',
                                        background: 'var(--bg-page)', border: '2px solid var(--border)',
                                        borderRadius: '1rem', padding: '0.6rem 0.5rem',
                                        fontVariantNumeric: 'tabular-nums',
                                        outline: 'none',
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setQtyEditValue(v => Math.min(999, (Number(v) || 0) + 1))}
                                    disabled={qtyEditSaving || qtyEditValue >= 999}
                                    style={{
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
                                        color: 'white', borderRadius: '99px', width: '3rem', height: '3rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: qtyEditSaving || qtyEditValue >= 999 ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 4px 14px -2px rgba(14, 165, 233, 0.5)',
                                        touchAction: 'manipulation',
                                    }}
                                    aria-label="Aumentar cantidad"
                                >
                                    <Plus size={20} strokeWidth={3} />
                                </button>
                            </div>

                            {/* Atajos rápidos */}
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '0.4rem',
                                justifyContent: 'center', marginBottom: '1.5rem',
                            }}>
                                {[1, 2, 5, 10, 20].map(preset => (
                                    <button
                                        type="button"
                                        key={preset}
                                        onClick={() => setQtyEditValue(preset)}
                                        disabled={qtyEditSaving}
                                        style={{
                                            padding: '0.35rem 0.85rem',
                                            borderRadius: '99px',
                                            border: qtyEditValue === preset ? '2px solid #0EA5E9' : '1px solid var(--border)',
                                            background: qtyEditValue === preset ? 'rgba(14, 165, 233, 0.08)' : 'var(--bg-card)',
                                            color: qtyEditValue === preset ? '#0369A1' : 'var(--text-muted)',
                                            fontWeight: qtyEditValue === preset ? 700 : 500,
                                            fontSize: '0.85rem', cursor: 'pointer',
                                            touchAction: 'manipulation',
                                        }}
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>

                            {qtyEditValue === 0 && (
                                <p style={{
                                    margin: '0 0 1rem 0', padding: '0.6rem 0.8rem',
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    borderRadius: '0.6rem',
                                    color: 'var(--danger, #ef4444)',
                                    fontSize: '0.82rem', textAlign: 'center', fontWeight: 600,
                                }}>
                                    Al guardar con 0 se marcará como agotado.
                                </p>
                            )}

                            {/* Botones */}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setQtyEditItem(null)}
                                    disabled={qtyEditSaving}
                                    style={{
                                        flex: 1, padding: '0.9rem', background: 'var(--bg-muted)',
                                        color: 'var(--text-main)', border: 'none', borderRadius: '0.9rem',
                                        fontWeight: 700, cursor: qtyEditSaving ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const targetItem = qtyEditItem;
                                        const target = Math.max(0, Math.min(999, Math.round(Number(qtyEditValue) || 0)));
                                        if (target === targetItem.quantity) {
                                            setQtyEditItem(null);
                                            return;
                                        }
                                        setQtyEditSaving(true);
                                        try {
                                            await handleUpdateQuantity(targetItem.id, target);
                                            if (target === 0) {
                                                toast.success(`${targetItem.ingredient_name} marcado como agotado`);
                                            } else {
                                                toast.success(`${targetItem.ingredient_name}: ${target} ${targetItem.unit}`);
                                            }
                                        } catch (err) {
                                            console.error('qty edit error', err);
                                            toast.error('No se pudo actualizar la cantidad');
                                        } finally {
                                            setQtyEditSaving(false);
                                            setQtyEditItem(null);
                                        }
                                    }}
                                    disabled={qtyEditSaving || qtyEditValue === '' || qtyEditValue === null}
                                    style={{
                                        flex: 1.4, padding: '0.9rem',
                                        background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
                                        color: 'white', border: 'none', borderRadius: '0.9rem',
                                        fontWeight: 800, cursor: qtyEditSaving ? 'wait' : 'pointer',
                                        boxShadow: '0 6px 18px -4px rgba(14, 165, 233, 0.55)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                        opacity: qtyEditSaving ? 0.75 : 1,
                                    }}
                                >
                                    {qtyEditSaving ? (
                                        <><Loader2 size={16} className="spin-fast" /> Guardando…</>
                                    ) : (
                                        <>Guardar</>
                                    )}
                                </button>
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
