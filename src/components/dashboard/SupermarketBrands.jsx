import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { BadgeCheck, Check, ChevronDown, Store } from 'lucide-react';
import { api, fetchWithAuth } from '../../config/api';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';

/* [P1-SUPERMARKET-MATCH · 2026-07-02] "Marcas del súper" — conexión v1 entre la
   lista de compras y la base Supermercado RD (supermarket_products en Neon).

   [P1-SUPERMARKET-PREFS · 2026-07-02 · fase 2] El usuario ELIGE su marca
   preferida por alimento: tocar una variante la marca como preferencia. Para
   autenticados persiste server-side (PUT /api/supermarket/preferences → tabla
   user_brand_preferences, sobrevive dispositivos y regeneraciones de plan);
   para invitados o si la auth falla, fallback a localStorage. Abajo, resumen
   "tu selección" con el total de las presentaciones elegidas. Sigue sin tocar
   plan_data ni el motor de costeo (I6/I7 intactos) — el costeo del PDF es SSOT. */

const LOCAL_PREFS_KEY = 'mf_brand_prefs';

// Simétrica a `_norm_food` del backend: minúsculas + sin acentos + espacios colapsados.
const norm = (s) => (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const itemDisplayName = (item) => {
    let display = item?.name || item?.item_name || item?.display_name;
    if (typeof display === 'string' && display.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(display);
            display = parsed.name || parsed.item_name || parsed.display_name || display;
        } catch { /* se queda como string */ }
    } else if (typeof display === 'object' && display !== null) {
        display = display.name || display.item_name || display.display_name || null;
    }
    return typeof display === 'string' ? display.trim() : null;
};

const formatPrice = (value) => (
    value === null || value === undefined
        ? 'Precio relativo'
        : `RD$${Number(value).toLocaleString('es-DO', { maximumFractionDigits: 2 })}`
);

const readLocalPrefs = () => {
    try {
        const raw = safeLocalStorageGet(LOCAL_PREFS_KEY, null);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
};

const MAX_VARIANTS_SHOWN = 4;

/* [P1-BRAND-SIZE-FILTER · 2026-07-06] Filtro por tamaño del envase de la LISTA.
   El backend expone `package_grams` en cada ítem (envase que el costeo eligió,
   ej. 907 g = 2 lb) y `size_g` en cada variante del /match. El picker enseña
   SOLO las marcas de ese tamaño (±15%), ordenadas de más barata a más cara —
   feedback del owner: "Genérico 5L/10L están de más si la lista dice 2 Lb, y
   deben aparecer MÁS marcas sin irme al catálogo". La variante ya elegida se
   muestra siempre (aunque sea de otro tamaño) para poder des-seleccionarla.
   Sin package_grams (planes viejos sin recalc) o sin tamaños → fallback al
   comportamiento previo (todas, cap 4). */
const SIZE_TOLERANCE = 0.15;
const MAX_SIZED_SHOWN = 12;

/* [P1-BRAND-STABLE-ALL-SIZES · 2026-07-06] Pedido del owner: los alimentos
   DURADEROS (estables de despensa — is_perishable === false, flag SSOT backend)
   deben enseñar TODAS las marcas y tamaños del catálogo para seleccionar ("hay
   personas que compran 50 lb de arroz si quieren, o 2 lb"). Para estables NO se
   filtra por tamaño: se ordena con los del tamaño de tu lista PRIMERO y luego
   por precio ascendente. El filtro ±15% queda solo para frescos/perecederos. */
const MAX_STABLE_SHOWN = 60;

const sizeFilteredVariants = (variants, targetG, chosenId) => {
    if (!targetG || !Array.isArray(variants)) return null;
    const matched = variants.filter((v) => (
        (chosenId && v.id === chosenId)
        || (typeof v.size_g === 'number' && v.size_g > 0
            && Math.abs(v.size_g - targetG) / targetG <= SIZE_TOLERANCE)
    ));
    if (!matched.length) return null;
    return [...matched].sort((a, b) => (
        (a.price_rd ?? Infinity) - (b.price_rd ?? Infinity)
    ));
};

/* [P2-BRAND-SIZE-FLOOR · 2026-07-06] Piso de tamaño en duraderos. Feedback del
   owner: "si el plan necesita 800 g de maní, ¿por qué aparecen fundas de 55 g?
   Deben ser cantidades iguales o mayores — o como mucho un poco menos (12 Oz vs
   16 Oz)". Regla: variantes con tamaño ≥ 70% del envase que la lista usa (12/16
   Oz = 75% → pasa; potes de 300 g para 800 g → fuera, quedan tras el link del
   catálogo). La variante YA elegida siempre se muestra (para poder quitarla) y
   si el piso vaciara la lista, se enseña todo (fail-open). */
const MIN_STABLE_SIZE_RATIO = 0.7;

const stableSortedVariants = (variants, targetG, chosenId) => {
    const matchesSize = (v) => (
        targetG && typeof v.size_g === 'number' && v.size_g > 0
        && Math.abs(v.size_g - targetG) / targetG <= SIZE_TOLERANCE
    );
    let pool = [...(variants || [])];
    if (targetG) {
        const floored = pool.filter((v) => (
            (chosenId && v.id === chosenId)
            || typeof v.size_g !== 'number' || v.size_g <= 0
            || v.size_g >= targetG * MIN_STABLE_SIZE_RATIO
        ));
        if (floored.length) pool = floored;
    }
    return pool.sort((a, b) => (
        (matchesSize(a) ? 0 : 1) - (matchesSize(b) ? 0 : 1)
        || (a.price_rd ?? Infinity) - (b.price_rd ?? Infinity)
    ));
};

const SupermarketBrands = ({ shoppingList, onPrefApplied, onPrefPending }) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // [P2-BRANDS-APPLY-IMMEDIATE · 2026-07-02] debounce del re-costeo: elegir 3 marcas
    // seguidas dispara UN solo recalc (el padre pasa onPrefApplied → /recalculate-shopping-list).
    const applyTimerRef = useRef(null);
    const [matches, setMatches] = useState(null); // { <nombre item>: [{food_name, variants:[...]}] }
    const [expandedItem, setExpandedItem] = useState(null);
    // [P3-BRANDS-POPOVER-NO-DEFORM · 2026-07-02] El listado abierto ya NO crece
    // inline (estiraba el header card completo con 40+ ítems); ahora es un popover
    // flotante anclado al trigger — mismo patrón que el dropdown de duración del
    // Dashboard. rootRef cierra en click-afuera / Escape.
    const rootRef = useRef(null);
    // prefs: { <food_key normalizado>: product_id } · source: 'server' | 'local'
    const [prefs, setPrefs] = useState({});
    const [prefsSource, setPrefsSource] = useState('local');

    const names = useMemo(() => {
        const seen = new Set();
        const out = [];
        (shoppingList || []).forEach((item) => {
            const name = itemDisplayName(item);
            if (!name) return;
            const key = norm(name);
            if (!key || seen.has(key)) return;
            seen.add(key);
            out.push(name);
        });
        return out.slice(0, 200);
    }, [shoppingList]);

    // [P1-BRAND-SIZE-FILTER] tamaño (g) del envase que el costeo eligió por ítem.
    const sizeByKey = useMemo(() => {
        const out = {};
        (shoppingList || []).forEach((item) => {
            const name = itemDisplayName(item);
            const g = Number(item?.package_grams);
            if (name && Number.isFinite(g) && g > 0) out[norm(name)] = g;
        });
        return out;
    }, [shoppingList]);

    // [P1-BRAND-STABLE-ALL-SIZES] ítems DURADEROS (flag SSOT is_perishable === false):
    // sin filtro de tamaño — catálogo completo, tu tamaño primero.
    const stableByKey = useMemo(() => {
        const out = {};
        (shoppingList || []).forEach((item) => {
            const name = itemDisplayName(item);
            if (name && item?.is_perishable === false) out[norm(name)] = true;
        });
        return out;
    }, [shoppingList]);

    // [P1-BRAND-DEFAULT-PRESELECTED · 2026-07-06] Producto del súper que la LISTA
    // está usando por ítem (`brand_product_id` del costeo backend). El picker lo
    // muestra pre-seleccionado (estilo distinto a la preferencia manual) para que
    // el usuario vea qué marca está en su lista — pedido del owner: "Wala está
    // por defecto en arroz blanco, debe verse seleccionado; así no se confunden".
    // Tocarlo lo FIJA como preferencia permanente (deja de moverse si el default
    // más barato cambia con los precios).
    const defaultIdByKey = useMemo(() => {
        const out = {};
        (shoppingList || []).forEach((item) => {
            const name = itemDisplayName(item);
            const pid = item?.brand_product_id;
            if (name && typeof pid === 'string' && pid) out[norm(name)] = pid;
        });
        return out;
    }, [shoppingList]);

    const load = useCallback(async () => {
        if (matches || loading || names.length === 0) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(api('/api/supermarket/match'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names }),
            });
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const data = await res.json();
            setMatches(data?.matches || {});
        } catch (err) {
            console.error('[P1-SUPERMARKET-MATCH] match falló:', err);
            setError('No se pudieron cargar las marcas del súper. Intenta de nuevo.');
            setLoading(false);
            return;
        }
        // Preferencias: server para autenticados; localStorage como fallback
        // (guests, sesión expirada, red). Nunca bloquea el panel.
        try {
            const res = await fetchWithAuth('/api/supermarket/preferences');
            if (res.ok) {
                const data = await res.json();
                const flat = {};
                Object.entries(data?.preferences || {}).forEach(([k, v]) => {
                    if (v?.product_id) flat[k] = v.product_id;
                });
                setPrefs(flat);
                setPrefsSource('server');
            } else {
                setPrefs(readLocalPrefs());
                setPrefsSource('local');
            }
        } catch {
            setPrefs(readLocalPrefs());
            setPrefsSource('local');
        }
        setLoading(false);
    }, [matches, loading, names]);

    const persistPref = useCallback(async (foodKey, productId) => {
        setPrefs((prev) => {
            const next = { ...prev };
            if (productId) next[foodKey] = productId; else delete next[foodKey];
            if (prefsSource === 'local') {
                try { safeLocalStorageSet(LOCAL_PREFS_KEY, JSON.stringify(next)); } catch { /* noop */ }
            }
            return next;
        });
        if (prefsSource === 'server') {
            try {
                const res = await fetchWithAuth('/api/supermarket/preferences', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ food_key: foodKey, product_id: productId }),
                });
                if (!res.ok) throw new Error(`Error ${res.status}`);
                // [P2-BRAND-APPLY-FEEDBACK · 2026-07-06] Señal INMEDIATA al padre
                // (toast "Aplicando tu marca…"): el recalc tarda 15-40s (pipeline +
                // cola tras el auto-refresh) y sin feedback el owner refrescaba la
                // página creyendo que no pasó nada (caso Quaker en avena — el 200
                // llegó, pero el F5 mató el fetch antes).
                if (typeof onPrefPending === 'function') {
                    try { onPrefPending(); } catch { /* fail-open */ }
                }
                // [P2-BRANDS-APPLY-IMMEDIATE · 2026-07-02] preferencia persistida → re-costear el
                // plan YA (antes el costo real solo cambiaba al regenerar/recalcular a mano y el
                // total del panel vs el del PDF eran números distintos). Debounce 900ms: elegir
                // varias marcas seguidas = un solo recalc. Solo server-prefs (guests no costean).
                if (typeof onPrefApplied === 'function') {
                    if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
                    applyTimerRef.current = setTimeout(() => {
                        applyTimerRef.current = null;
                        try { onPrefApplied(); } catch { /* fail-open */ }
                    }, 900);
                }
            } catch (err) {
                // Degradación: guarda local para no perder la elección del usuario.
                console.error('[P1-SUPERMARKET-PREFS] persist falló, fallback local:', err);
                setPrefsSource('local');
                try {
                    const next = { ...readLocalPrefs() };
                    if (productId) next[foodKey] = productId; else delete next[foodKey];
                    safeLocalStorageSet(LOCAL_PREFS_KEY, JSON.stringify(next));
                } catch { /* noop */ }
            }
        }
    }, [prefsSource]);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next) load();
    };

    // [P3-BRANDS-PREFETCH · 2026-07-02] Cargar matches + prefs al montar, no al
    // primer click: el trigger muestra "· N/M con opciones · N elegidas"
    // sin tener que abrir el panel. Mismo fetch de siempre, solo adelantado —
    // load() se auto-guarda (matches/loading) así que abrir después no re-fetchea.
    useEffect(() => {
        if (names.length > 0) load();
    }, [names, load]);

    // [P3-BRANDS-POPOVER-NO-DEFORM] Al ser overlay flotante, cerrar con click
    // fuera del componente o con Escape (igual que el dropdown de duración).
    useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('touchstart', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('touchstart', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    if (!names.length) return null;

    const matchedNames = matches ? names.filter((n) => matches[n]?.length) : [];

    // Selección actual hidratada: [{foodKey, foodName, variant}] — solo variantes
    // que sigan existiendo en los matches (si la admin UI ocultó el producto, cae).
    const selection = [];
    if (matches) {
        const seenKeys = new Set();
        matchedNames.forEach((name) => {
            (matches[name] || []).forEach((g) => {
                const foodKey = norm(g.food_name);
                if (seenKeys.has(foodKey)) return;
                const chosenId = prefs[foodKey];
                if (!chosenId) return;
                const variant = g.variants.find((v) => v.id === chosenId);
                if (variant) {
                    seenKeys.add(foodKey);
                    selection.push({ foodKey, foodName: g.food_name, variant });
                }
            });
        });
    }
    const selectionTotal = selection.reduce((acc, s) => acc + (s.variant.price_rd || 0), 0);

    return (
        <div ref={rootRef} style={{
            // [P3-BRANDS-POPOVER-NO-DEFORM · 2026-07-02] position:relative ancla el
            // popover del listado; SIN overflow:hidden (recortaría el panel absoluto).
            position: 'relative',
            marginTop: '0.6rem',
            borderRadius: '0.75rem',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            maxWidth: '100%',
        }}>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.45rem',
                    width: '100%', padding: '0.65rem 0.85rem',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-main)', textAlign: 'left',
                }}
            >
                <Store size={15} style={{ flexShrink: 0, color: 'var(--text-muted)' }} aria-hidden="true" />
                {/* [P3-BRANDS-WIDTH-STABLE · 2026-07-02] nowrap+ellipsis: el sufijo
                    "· N/M con opciones · N elegidas" no puede partir la barra en 2 líneas
                    ni empujar el ancho de la columna (ahora fija en 420px desktop). */}
                <span style={{ fontSize: '0.82rem', fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Marcas del súper
                    {matches && (
                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                            {' '}· {matchedNames.length}/{names.length} con opciones
                            {selection.length > 0 && <> · {selection.length} elegida{selection.length === 1 ? '' : 's'}</>}
                        </span>
                    )}
                </span>
                <ChevronDown
                    size={15}
                    style={{
                        flexShrink: 0, color: 'var(--text-muted)',
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.15s ease',
                    }}
                    aria-hidden="true"
                />
            </button>

            {open && (
                // [P3-BRANDS-POPOVER-NO-DEFORM · 2026-07-02] Popover flotante con scroll
                // interno: el header card ya no se estira con 40+ ítems. Mismo lenguaje
                // visual que el dropdown de duración (fondo opaco, sombra, maxHeight).
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    zIndex: 9999,
                    background: 'var(--bg-card)',
                    border: '1.5px solid var(--border)',
                    borderRadius: '12px',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.25)',
                    maxHeight: 'min(62vh, 480px)',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    overscrollBehavior: 'contain',
                    padding: '0 0.85rem 0.75rem',
                }}>
                    {loading && (
                        <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Buscando marcas en el supermercado…
                        </p>
                    )}
                    {error && (
                        <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {error}{' '}
                            <button
                                type="button"
                                onClick={() => { setError(null); setMatches(null); load(); }}
                                style={{
                                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                    color: 'var(--text-main)', fontWeight: 700, fontSize: '0.78rem',
                                    textDecoration: 'underline',
                                }}
                            >
                                Reintentar
                            </button>
                        </p>
                    )}
                    {matches && !loading && !error && matchedNames.length === 0 && (
                        <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Todavía no hay variantes de marca cargadas para los ítems de esta lista.
                        </p>
                    )}
                    {matches && !loading && matchedNames.length > 0 && (
                        <>
                            <p style={{ margin: '0.55rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                Toca una variante para marcarla como tu preferida
                                {prefsSource === 'local' && ' (se guarda en este dispositivo)'}.
                                {' '}El check punteado marca la que tu lista usa por defecto (la más
                                económica) — tócala para fijarla. En despensa/duraderos ves todas las
                                marcas en tamaños que cubren lo que tu plan necesita (los de tu tamaño
                                primero); en frescos, las del tamaño que usa tu lista — siempre de la
                                más económica a la más cara.
                            </p>
                            <ul style={{ listStyle: 'none', margin: '0.45rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {matchedNames.map((name) => {
                                    const foodGroups = matches[name];
                                    // [P1-BRAND-SIZE-FILTER] variantes efectivas por grupo: las del
                                    // tamaño de la lista (ordenadas por precio) o fallback a todas.
                                    // [P1-BRAND-STABLE-ALL-SIZES] duraderos: catálogo COMPLETO
                                    // (todas las marcas/tamaños), tu tamaño primero.
                                    const targetG = sizeByKey[norm(name)] || null;
                                    const isStable = stableByKey[norm(name)] === true;
                                    const effGroups = foodGroups.map((g) => {
                                        if (isStable) {
                                            return {
                                                ...g,
                                                // [P2-BRAND-SIZE-FLOOR] piso ≥70% del envase de la lista.
                                                shownVariants: stableSortedVariants(g.variants, targetG, prefs[norm(g.food_name)]).slice(0, MAX_STABLE_SHOWN),
                                                sizedApplied: false,
                                            };
                                        }
                                        const sized = sizeFilteredVariants(g.variants, targetG, prefs[norm(g.food_name)]);
                                        return {
                                            ...g,
                                            shownVariants: sized ? sized.slice(0, MAX_SIZED_SHOWN) : g.variants.slice(0, MAX_VARIANTS_SHOWN),
                                            sizedApplied: Boolean(sized),
                                        };
                                    });
                                    const variantCount = effGroups.reduce((acc, g) => acc + g.shownVariants.length, 0);
                                    const prices = effGroups.flatMap((g) => g.shownVariants.map((v) => v.price_rd)).filter((v) => v !== null && v !== undefined);
                                    const minPrice = prices.length ? Math.min(...prices) : null;
                                    const sizedAny = effGroups.some((g) => g.sizedApplied);
                                    // [P1-BRAND-DEFAULT-PRESELECTED] la variante que la LISTA usa hoy
                                    // (sin pref manual): por brand_product_id del costeo, o — fallback —
                                    // la ÚNICA variante del ítem (yuca/laurel: 1 opción = esa es).
                                    const defaultId = defaultIdByKey[norm(name)] || null;
                                    const hasChosen = foodGroups.some((g) => prefs[norm(g.food_name)]);
                                    let defaultVariant = null;
                                    if (!hasChosen) {
                                        if (defaultId) {
                                            for (const g of foodGroups) {
                                                const v = g.variants.find((x) => x.id === defaultId);
                                                if (v) { defaultVariant = v; break; }
                                            }
                                        }
                                        if (!defaultVariant) {
                                            const all = foodGroups.flatMap((g) => g.variants);
                                            if (all.length === 1) defaultVariant = all[0];
                                        }
                                    }
                                    const isExpanded = expandedItem === name;
                                    const chosen = foodGroups
                                        .map((g) => {
                                            const id = prefs[norm(g.food_name)];
                                            return id ? g.variants.find((v) => v.id === id) : null;
                                        })
                                        .find(Boolean);
                                    return (
                                        <li key={name}>
                                            <button
                                                type="button"
                                                onClick={() => setExpandedItem(isExpanded ? null : name)}
                                                aria-expanded={isExpanded}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    width: '100%', padding: '0.4rem 0.55rem',
                                                    borderRadius: '0.55rem', border: '1px solid var(--border)',
                                                    background: isExpanded ? 'var(--bg-muted)' : 'transparent',
                                                    cursor: 'pointer', color: 'var(--text-main)', textAlign: 'left',
                                                }}
                                            >
                                                <span style={{ fontSize: '0.78rem', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {name}
                                                </span>
                                                {chosen ? (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                        fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
                                                        color: '#059669', background: 'rgba(16,185,129,0.1)',
                                                        border: '1px solid rgba(16,185,129,0.3)',
                                                        padding: '0.1rem 0.45rem', borderRadius: '999px',
                                                        maxWidth: '46%', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    }}>
                                                        <Check size={11} style={{ flexShrink: 0 }} aria-hidden="true" />
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {chosen.brand || 'Genérico'} · {formatPrice(chosen.price_rd)}
                                                        </span>
                                                    </span>
                                                ) : defaultVariant ? (
                                                    // [P1-BRAND-DEFAULT-PRESELECTED] chip apagado (no verde):
                                                    // es la marca que tu lista USA por default, no tu elección.
                                                    <span
                                                        title="Marca predeterminada de tu lista — tócala adentro para fijarla"
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                            fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
                                                            color: 'var(--text-muted)', background: 'var(--bg-muted)',
                                                            border: '1px solid var(--border)',
                                                            padding: '0.1rem 0.45rem', borderRadius: '999px',
                                                            maxWidth: '46%', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        }}
                                                    >
                                                        <Check size={11} style={{ flexShrink: 0 }} aria-hidden="true" />
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {defaultVariant.brand || 'Genérico'} · {formatPrice(defaultVariant.price_rd)}
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        {variantCount} {sizedAny
                                                            ? `marca${variantCount === 1 ? '' : 's'} en tu tamaño`
                                                            : `opci${variantCount === 1 ? 'ón' : 'ones'}`}
                                                        {minPrice !== null && <> · desde <strong style={{ color: 'var(--text-main)' }}>{formatPrice(minPrice)}</strong></>}
                                                    </span>
                                                )}
                                                <ChevronDown size={13} style={{ flexShrink: 0, color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} aria-hidden="true" />
                                            </button>
                                            {isExpanded && (
                                                <ul style={{ listStyle: 'none', margin: '0.25rem 0 0.15rem', padding: '0 0 0 0.55rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                    {effGroups.map((g) => {
                                                        const foodKey = norm(g.food_name);
                                                        const chosenId = prefs[foodKey];
                                                        return (
                                                            <li key={g.food_name}>
                                                                {effGroups.length > 1 && (
                                                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0.25rem 0 0.15rem' }}>
                                                                        {g.food_name}
                                                                    </div>
                                                                )}
                                                                {g.shownVariants.map((v) => {
                                                                    const isChosen = chosenId === v.id;
                                                                    // [P1-BRAND-DEFAULT-PRESELECTED] la marca que tu lista USA
                                                                    // hoy (sin pref manual): check verde HUECO. Tocarla la fija
                                                                    // como preferencia permanente (deja de moverse si el default
                                                                    // más barato cambia con los precios del súper).
                                                                    const isDefault = !isChosen && !chosenId && defaultVariant && v.id === defaultVariant.id;
                                                                    return (
                                                                        <button
                                                                            key={v.id}
                                                                            type="button"
                                                                            onClick={() => persistPref(foodKey, isChosen ? null : v.id)}
                                                                            aria-pressed={isChosen}
                                                                            title={isChosen
                                                                                ? 'Quitar preferencia'
                                                                                : isDefault
                                                                                    ? 'Predeterminada de tu lista — tócala para fijarla como tu preferida'
                                                                                    : 'Marcar como mi preferida'}
                                                                            style={{
                                                                                display: 'flex', alignItems: 'center', gap: '0.45rem',
                                                                                width: '100%', padding: '0.28rem 0.45rem',
                                                                                borderRadius: '0.45rem', cursor: 'pointer', textAlign: 'left',
                                                                                border: isChosen ? '1px solid rgba(16,185,129,0.5)'
                                                                                    : isDefault ? '1px dashed rgba(16,185,129,0.45)'
                                                                                        : '1px solid transparent',
                                                                                background: isChosen ? 'rgba(16,185,129,0.08)'
                                                                                    : isDefault ? 'rgba(16,185,129,0.04)'
                                                                                        : 'transparent',
                                                                            }}
                                                                        >
                                                                            <span style={{
                                                                                width: '14px', height: '14px', flexShrink: 0,
                                                                                borderRadius: '50%', display: 'inline-flex',
                                                                                alignItems: 'center', justifyContent: 'center',
                                                                                border: isChosen ? 'none'
                                                                                    : isDefault ? '1.5px solid #10B981'
                                                                                        : '1.5px solid var(--border)',
                                                                                background: isChosen ? '#10B981' : 'transparent',
                                                                            }} aria-hidden="true">
                                                                                {isChosen && <Check size={10} color="#fff" strokeWidth={3} />}
                                                                                {isDefault && <Check size={10} color="#10B981" strokeWidth={3} />}
                                                                            </span>
                                                                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                                                                                {v.brand || 'Genérico'}
                                                                            </span>
                                                                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                {v.presentation || '—'}
                                                                            </span>
                                                                            {v.is_verified && <BadgeCheck size={12} style={{ flexShrink: 0, color: '#10B981' }} aria-hidden="true" />}
                                                                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                                                                                {formatPrice(v.price_rd)}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                                {g.variants.length > g.shownVariants.length && (
                                                                    <a
                                                                        href={`https://mealfitrd.com/supermercado?q=${encodeURIComponent(g.food_name)}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{ display: 'inline-block', padding: '0.15rem 0.45rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'underline' }}
                                                                    >
                                                                        +{g.variants.length - g.shownVariants.length} {g.sizedApplied ? 'de otros tamaños en el catálogo' : 'más en el catálogo'}
                                                                    </a>
                                                                )}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                            {selection.length > 0 && (
                                <div style={{
                                    marginTop: '0.55rem', padding: '0.5rem 0.65rem',
                                    borderRadius: '0.55rem',
                                    border: '1px solid rgba(16,185,129,0.3)',
                                    background: 'rgba(16,185,129,0.06)',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                }}>
                                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-main)', flex: 1 }}>
                                        Tu selección: {selection.length} marca{selection.length === 1 ? '' : 's'} elegida{selection.length === 1 ? '' : 's'}
                                    </span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#059669', whiteSpace: 'nowrap' }}>
                                        {formatPrice(selectionTotal)}
                                    </span>
                                </div>
                            )}
                            <p style={{ margin: '0.55rem 0 0', fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                Precios de referencia de La Sirena y Supermercados Nacional (1 presentación
                                por ítem elegido). Tus marcas elegidas se aplican al costo real de la lista
                                al instante (recalculamos el plan al elegir) y quedan como tu
                                predeterminado para todos tus planes futuros — sin elección, usamos la
                                marca más económica del súper.
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

SupermarketBrands.propTypes = {
    shoppingList: PropTypes.array,
    onPrefApplied: PropTypes.func,  // [P2-BRANDS-APPLY-IMMEDIATE] re-costeo inmediato (debounced)
    onPrefPending: PropTypes.func,  // [P2-BRAND-APPLY-FEEDBACK] señal instantánea al elegir (toast loading)
};

export default SupermarketBrands;
