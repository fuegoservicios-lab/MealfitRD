import { useCallback, useMemo, useRef, useState } from 'react';
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

const SupermarketBrands = ({ shoppingList, onPrefApplied }) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // [P2-BRANDS-APPLY-IMMEDIATE · 2026-07-02] debounce del re-costeo: elegir 3 marcas
    // seguidas dispara UN solo recalc (el padre pasa onPrefApplied → /recalculate-shopping-list).
    const applyTimerRef = useRef(null);
    const [matches, setMatches] = useState(null); // { <nombre item>: [{food_name, variants:[...]}] }
    const [expandedItem, setExpandedItem] = useState(null);
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
        <div style={{
            marginTop: '0.6rem',
            borderRadius: '0.75rem',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            maxWidth: '100%',
            overflow: 'hidden',
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
                <span style={{ fontSize: '0.82rem', fontWeight: 700, flex: 1 }}>
                    Marcas y precios del súper
                    {matches && (
                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                            {' '}· {matchedNames.length} de {names.length} ítems con opciones
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
                <div style={{ padding: '0 0.85rem 0.75rem', borderTop: '1px solid var(--border)' }}>
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
                            </p>
                            <ul style={{ listStyle: 'none', margin: '0.45rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {matchedNames.map((name) => {
                                    const foodGroups = matches[name];
                                    const variantCount = foodGroups.reduce((acc, g) => acc + g.variants.length, 0);
                                    const prices = foodGroups.flatMap((g) => g.variants.map((v) => v.price_rd)).filter((v) => v !== null && v !== undefined);
                                    const minPrice = prices.length ? Math.min(...prices) : null;
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
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        {variantCount} opci{variantCount === 1 ? 'ón' : 'ones'}
                                                        {minPrice !== null && <> · desde <strong style={{ color: 'var(--text-main)' }}>{formatPrice(minPrice)}</strong></>}
                                                    </span>
                                                )}
                                                <ChevronDown size={13} style={{ flexShrink: 0, color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} aria-hidden="true" />
                                            </button>
                                            {isExpanded && (
                                                <ul style={{ listStyle: 'none', margin: '0.25rem 0 0.15rem', padding: '0 0 0 0.55rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                    {foodGroups.map((g) => {
                                                        const foodKey = norm(g.food_name);
                                                        const chosenId = prefs[foodKey];
                                                        return (
                                                            <li key={g.food_name}>
                                                                {foodGroups.length > 1 && (
                                                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0.25rem 0 0.15rem' }}>
                                                                        {g.food_name}
                                                                    </div>
                                                                )}
                                                                {g.variants.slice(0, MAX_VARIANTS_SHOWN).map((v) => {
                                                                    const isChosen = chosenId === v.id;
                                                                    return (
                                                                        <button
                                                                            key={v.id}
                                                                            type="button"
                                                                            onClick={() => persistPref(foodKey, isChosen ? null : v.id)}
                                                                            aria-pressed={isChosen}
                                                                            title={isChosen ? 'Quitar preferencia' : 'Marcar como mi preferida'}
                                                                            style={{
                                                                                display: 'flex', alignItems: 'center', gap: '0.45rem',
                                                                                width: '100%', padding: '0.28rem 0.45rem',
                                                                                borderRadius: '0.45rem', cursor: 'pointer', textAlign: 'left',
                                                                                border: isChosen ? '1px solid rgba(16,185,129,0.5)' : '1px solid transparent',
                                                                                background: isChosen ? 'rgba(16,185,129,0.08)' : 'transparent',
                                                                            }}
                                                                        >
                                                                            <span style={{
                                                                                width: '14px', height: '14px', flexShrink: 0,
                                                                                borderRadius: '50%', display: 'inline-flex',
                                                                                alignItems: 'center', justifyContent: 'center',
                                                                                border: isChosen ? 'none' : '1.5px solid var(--border)',
                                                                                background: isChosen ? '#10B981' : 'transparent',
                                                                            }} aria-hidden="true">
                                                                                {isChosen && <Check size={10} color="#fff" strokeWidth={3} />}
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
                                                                {g.variants.length > MAX_VARIANTS_SHOWN && (
                                                                    <a
                                                                        href={`https://mealfitrd.com/supermercado?q=${encodeURIComponent(g.food_name)}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{ display: 'inline-block', padding: '0.15rem 0.45rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'underline' }}
                                                                    >
                                                                        +{g.variants.length - MAX_VARIANTS_SHOWN} más en el catálogo
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
                                al instante (recalculamos el plan al elegir).
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
};

export default SupermarketBrands;
