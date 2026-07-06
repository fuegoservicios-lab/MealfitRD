import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, ShoppingBasket } from 'lucide-react';

/* [P2-AUDIT-V7-BATCH · 2026-07-04] (P2-8) Lista de compras POR PASILLO en la UI viva.
   La agrupación profesional (estables vs frescos + categorías de súper + costo por ítem)
   vivía SOLO en el htmlContent del PDF — on-screen el usuario tenía banner de presupuesto,
   panel de marcas y total, pero ninguna lista itemizada navegable. Este panel reusa las
   MISMAS reglas del PDF (flag SSOT `is_perishable` del backend → shelf_life → fallback de
   prefijos; categoría = `display_category` SSOT) para que pantalla y PDF nunca diverjan.
   Solo LECTURA de la lista agregada — cero escrituras a plan_data (I6 intacto).

   [P3-AISLE-POPOVER-NO-DEFORM · 2026-07-04] El listado abierto NO crece inline (45 ítems
   estiraban el hero del Dashboard igual que lo hacía el panel de marcas pre-fix): ahora es
   un POPOVER flotante anclado al trigger con scroll interno — mismo patrón y lenguaje
   visual que SupermarketBrands (P3-BRANDS-POPOVER-NO-DEFORM) y el dropdown de duración.
   Cierra con click-afuera y Escape. */

const PERISHABLE_PREFIXES = ['proteína', 'proteina', 'lácteo', 'lacteo', 'vegetal', 'fruta', 'urgente'];

const inferIsPerishable = (item) => {
    // Prioridad 1: flag SSOT del backend (P1-PDF-2).
    if (typeof item?.is_perishable === 'boolean') return item.is_perishable;
    // Prioridad 2: shelf_life_days (mismo umbral que backend).
    if (item?.shelf_life_days !== undefined && item?.shelf_life_days !== null) {
        return Number(item.shelf_life_days) <= 7;
    }
    // Fallback legacy: substring de la categoría.
    const cat = String(item?.display_category || item?.category || '').toLowerCase();
    return PERISHABLE_PREFIXES.some((p) => cat.includes(p));
};

const itemName = (item) => {
    const n = item?.name || item?.display_name || item?.item_name;
    return typeof n === 'string' ? n.trim() : '';
};

const itemQty = (item) => {
    if (item?.display_qty && String(item.display_qty).trim() !== 'None') return String(item.display_qty);
    if (item?.market_qty !== undefined && item?.market_unit !== undefined && item?.market_qty !== '') {
        return `${item.market_qty} ${item.market_unit}`;
    }
    return '';
};

const itemCost = (item) => {
    const c = item?.estimated_cost_rd ?? item?.estimated_cost;
    return (typeof c === 'number' && c > 0) ? c : null;
};

const fmtRD = (v) => `RD$${Math.round(v).toLocaleString('es-DO')}`;

const groupByCategory = (items) => {
    const groups = {};
    items.forEach((it) => {
        const cat = it.display_category || it.category || '🛒 OTROS';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(it);
    });
    // Categorías ordenadas por costo agrupado desc (lo más caro primero = lo más informativo).
    return Object.entries(groups).sort((a, b) => {
        const cost = (arr) => arr.reduce((s, i) => s + (itemCost(i) || 0), 0);
        return cost(b[1]) - cost(a[1]);
    });
};

const SECTION_STYLES = {
    perishable: { label: 'FRESCOS — COMPRA ESTA SEMANA', color: '#dc2626' },
    stable: { label: 'DESPENSA — ESTABLES (COMPRA UNA VEZ)', color: '#2563eb' },
};

const ShoppingListPanel = ({ shoppingList, duration }) => {
    const [open, setOpen] = useState(false);
    // [P3-AISLE-POPOVER-NO-DEFORM · 2026-07-04] cierra en click-afuera / Escape
    // (mismo contrato que SupermarketBrands).
    const rootRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onClick = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const { sections, totalCost, pricedCount, totalItems } = useMemo(() => {
        const valid = (shoppingList || []).filter((it) => it && typeof it === 'object' && itemName(it));
        const perishables = valid.filter(inferIsPerishable);
        const stables = valid.filter((it) => !inferIsPerishable(it));
        let cost = 0; let priced = 0;
        valid.forEach((it) => {
            const c = itemCost(it);
            if (c) { cost += c; priced++; }
        });
        return {
            sections: [
                { key: 'perishable', groups: groupByCategory(perishables), count: perishables.length },
                { key: 'stable', groups: groupByCategory(stables), count: stables.length },
            ],
            totalCost: cost,
            pricedCount: priced,
            totalItems: valid.length,
        };
    }, [shoppingList]);

    if (!totalItems) return null;

    const durationLabel = duration === 'monthly' ? 'ciclo de 30 días'
        : duration === 'biweekly' ? 'ciclo de 15 días' : 'semana';

    return (
        <div ref={rootRef} style={{
            // [P3-AISLE-POPOVER-NO-DEFORM] position:relative ancla el popover;
            // SIN overflow:hidden (recortaría el panel absoluto).
            position: 'relative',
            marginTop: '0.75rem',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            background: 'var(--bg-card)',
            maxWidth: '100%',
        }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    padding: '0.65rem 0.85rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                }}
            >
                <ShoppingBasket size={16} style={{ flexShrink: 0, color: 'var(--text-muted)' }} aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                        display: 'block', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        Lista de compras por pasillo
                    </span>
                    <span style={{
                        display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {totalItems} ítems para tu {durationLabel}
                        {totalCost > 0 && <> · {fmtRD(totalCost)} esta ida al súper</>}
                        {pricedCount < totalItems && pricedCount > 0 && <> ({pricedCount}/{totalItems} con precio)</>}
                    </span>
                </span>
                <ChevronDown
                    size={15}
                    style={{
                        flexShrink: 0,
                        color: 'var(--text-muted)',
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.15s ease',
                    }}
                    aria-hidden="true"
                />
            </button>

            {open && (
                // [P3-AISLE-POPOVER-NO-DEFORM · 2026-07-04] Popover flotante con scroll
                // interno: el hero NO se estira con 45 ítems. Mismo lenguaje visual que
                // el panel de marcas (fondo opaco, sombra, maxHeight, z-index).
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
                    padding: '0 0.85rem 0.8rem',
                }}>
                    {sections.map(({ key, groups, count }) => {
                        if (!count) return null;
                        const meta = SECTION_STYLES[key];
                        return (
                            <div key={key} style={{ marginTop: '0.6rem' }}>
                                <div style={{
                                    fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.05em',
                                    color: meta.color, marginBottom: '0.25rem',
                                }}>
                                    {/* [P3-AISLE-COUNT-LABEL · 2026-07-04] "· 27" a secas era ambiguo
                                        (pregunta real del owner) — explícito: "· 27 ítems". */}
                                    {meta.label} · {count} {count === 1 ? 'ítem' : 'ítems'}
                                </div>
                                {groups.map(([cat, items]) => {
                                    const catCost = items.reduce((s, i) => s + (itemCost(i) || 0), 0);
                                    return (
                                        <div key={cat} style={{ marginBottom: '0.45rem' }}>
                                            <div style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                                                fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-main)',
                                                borderBottom: '1px solid var(--border)',
                                                paddingBottom: '0.15rem', marginBottom: '0.2rem',
                                            }}>
                                                <span>{cat}</span>
                                                {catCost > 0 && (
                                                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{fmtRD(catCost)}</span>
                                                )}
                                            </div>
                                            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                                {items.map((it, i) => {
                                                    const qty = itemQty(it);
                                                    const cost = itemCost(it);
                                                    return (
                                                        <li key={`${itemName(it)}-${i}`} style={{
                                                            display: 'flex', justifyContent: 'space-between', gap: '0.5rem',
                                                            fontSize: '0.74rem', padding: '0.14rem 0',
                                                            color: 'var(--text-main)',
                                                        }}>
                                                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {itemName(it)}
                                                            </span>
                                                            <span style={{ flexShrink: 0, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                                {qty}{qty && cost ? ' · ' : ''}{cost ? fmtRD(cost) : ''}
                                                            </span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                        Mismos grupos y precios que el PDF descargable — los frescos se recompran cada semana; la despensa una sola vez por ciclo.
                        {/* [P1-BRAND-LIST-VISIBILITY · 2026-07-06] la marca entre paréntesis viene del
                            costeo backend (más barata por default; tu preferencia si la elegiste). */}
                        {' '}La marca junto a cada ítem es la más económica del súper — cámbiala en
                        «Marcas y precios del súper» y tu elección queda para futuros planes.
                    </p>
                </div>
            )}
        </div>
    );
};

ShoppingListPanel.propTypes = {
    shoppingList: PropTypes.array,
    duration: PropTypes.string,
};

export default ShoppingListPanel;
