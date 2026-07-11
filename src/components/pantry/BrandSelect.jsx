// [P1-BRAND-SELECT-UI · 2026-07-11] Dropdown propio para elegir marca — el popup
// nativo del <select> no es estilable (feedback owner: "se ve raro") y ya agotamos
// color-scheme/option. Panel con el design system del app (bg-card, borde, radio,
// sombra, hover, precio a la derecha, check en la selección). Compartido por los
// chips de la Nevera (desktop + móvil) y el paso 21 del wizard.
import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Tag } from 'lucide-react';

/**
 * @param value      marca actual (null/'' = Genérico)
 * @param brands     [{brand, price}] del súper (sin 'Genérico')
 * @param onSelect   (brand: string) => void — '' para Genérico
 * @param className  clase del chip contenedor (fstyles/mstyles.brandChip*)
 * @param inline     true = trigger de texto discreto (paso 21) en vez de chip
 * @param ariaLabel  etiqueta accesible del selector
 */
export const BrandSelect = ({ value, brands = [], onSelect, className, inline = false, ariaLabel }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onDocDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', onDocDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDocDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const current = (value && value !== 'Genérico') ? value : '';
    const label = current || (inline ? 'Genérico (sin marca)' : 'Genérico');
    // La marca actual siempre es opción aunque el súper ya no la liste.
    const options = current && !brands.some(b => b.brand === current)
        ? [{ brand: current, price: null }, ...brands]
        : brands;

    const pick = (brand) => {
        setOpen(false);
        if ((brand || '') !== current) onSelect(brand);
    };

    return (
        <span ref={rootRef} className={className} style={{ position: 'relative', cursor: 'pointer' }}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                title={`Marca: ${label} — tocar para cambiar`}
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    background: 'transparent', border: 'none', padding: 0,
                    font: 'inherit', color: 'inherit', cursor: 'pointer',
                    ...(inline ? { fontSize: '0.75rem', color: 'var(--text-muted)' } : {}),
                }}
            >
                {!inline && <Tag size={9} strokeWidth={2.5} aria-hidden="true" />}
                {label}
                <ChevronDown size={inline ? 12 : 9} strokeWidth={2.5} aria-hidden="true"
                    style={{ opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {open && (
                <div role="listbox" aria-label={ariaLabel} style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 60,
                    minWidth: '210px', maxHeight: '250px', overflowY: 'auto',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '0.75rem', boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                    padding: '4px', display: 'flex', flexDirection: 'column',
                }}>
                    {[{ brand: '', price: null, _label: 'Genérico (sin marca)' }, ...options].map((opt) => {
                        const isSel = (opt.brand || '') === current;
                        return (
                            <button
                                key={opt.brand || '__generic'}
                                type="button"
                                role="option"
                                aria-selected={isSel}
                                onClick={() => pick(opt.brand)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    width: '100%', padding: '0.5rem 0.65rem', borderRadius: '0.5rem',
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    textAlign: 'left', font: 'inherit', fontSize: '0.83rem',
                                    color: isSel ? 'var(--primary)' : 'var(--text-main)',
                                    fontWeight: isSel ? 700 : 500,
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {opt._label || opt.brand}
                                </span>
                                {opt.price != null && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', flexShrink: 0 }}>
                                        ~RD${Math.round(opt.price)}
                                    </span>
                                )}
                                {isSel && <Check size={13} strokeWidth={3} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                            </button>
                        );
                    })}
                </div>
            )}
        </span>
    );
};
