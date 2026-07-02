import { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { BadgeCheck, ChevronDown, Store } from 'lucide-react';
import { api } from '../../config/api';

/* [P1-SUPERMARKET-MATCH · 2026-07-02] "Marcas del súper" — conexión v1 entre la
   lista de compras y la base Supermercado RD (supermarket_products en Neon).

   Panel colapsable bajo los controles de la lista: al expandir hace UN POST a
   /api/supermarket/match con los nombres de la `aggregated_shopping_list` y
   muestra, por ítem, las marcas/presentaciones reales del mercado dominicano
   con su precio RD$ (La Sirena / Supermercados Nacional). Informativo — NO
   toca plan_data ni el motor de costeo (I6/I7 intactos); la persistencia de
   la marca preferida + recosteo es la fase 2 del roadmap. */

const norm = (s) => (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

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

const MAX_VARIANTS_SHOWN = 4;

const SupermarketBrands = ({ shoppingList }) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [matches, setMatches] = useState(null); // { <nombre item>: [{food_name, variants:[...]}] }
    const [expandedItem, setExpandedItem] = useState(null);

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
        } finally {
            setLoading(false);
        }
    }, [matches, loading, names]);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next) load();
    };

    if (!names.length) return null;

    const matchedNames = matches ? names.filter((n) => matches[n]?.length) : [];

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
                            <ul style={{ listStyle: 'none', margin: '0.55rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {matchedNames.map((name) => {
                                    const foodGroups = matches[name];
                                    const variantCount = foodGroups.reduce((acc, g) => acc + g.variants.length, 0);
                                    const prices = foodGroups.flatMap((g) => g.variants.map((v) => v.price_rd)).filter((v) => v !== null && v !== undefined);
                                    const minPrice = prices.length ? Math.min(...prices) : null;
                                    const isExpanded = expandedItem === name;
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
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {variantCount} opci{variantCount === 1 ? 'ón' : 'ones'}
                                                    {minPrice !== null && <> · desde <strong style={{ color: 'var(--text-main)' }}>{formatPrice(minPrice)}</strong></>}
                                                </span>
                                                <ChevronDown size={13} style={{ flexShrink: 0, color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} aria-hidden="true" />
                                            </button>
                                            {isExpanded && (
                                                <ul style={{ listStyle: 'none', margin: '0.25rem 0 0.15rem', padding: '0 0 0 0.55rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                    {foodGroups.map((g) => (
                                                        <li key={g.food_name}>
                                                            {foodGroups.length > 1 && (
                                                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0.25rem 0 0.15rem' }}>
                                                                    {g.food_name}
                                                                </div>
                                                            )}
                                                            {g.variants.slice(0, MAX_VARIANTS_SHOWN).map((v) => (
                                                                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.28rem 0.45rem', borderRadius: '0.45rem' }}>
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
                                                                </div>
                                                            ))}
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
                                                    ))}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                            <p style={{ margin: '0.55rem 0 0', fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                Precios de referencia de La Sirena y Supermercados Nacional. Pueden variar
                                por establecimiento y temporada.
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
};

export default SupermarketBrands;
