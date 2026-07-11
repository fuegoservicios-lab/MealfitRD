// [P1-PANTRY-DASH-PARITY · 2026-07-11] Escáner de nevera por foto — componente
// COMPARTIDO entre el paso 21 del wizard (QPantryBuilder) y la página Nevera del
// dashboard (Pantry.jsx). SSOT del flujo completo: botón + reescala client-side +
// POST /api/inventory/photo-scan (READ-ONLY server-side) + checklist de
// confirmación + adds vía /api/inventory/items (409→increment). Nada entra a la
// Nevera sin que el usuario lo confirme. Extraído de QPantryBuilder
// (P1-PANTRY-SCAN-V0/QTY/BRAND) para que ambas superficies no dupliquen ni driften.
import { useState, useRef } from 'react';
import { fetchWithAuth } from '../../config/api';
import { Plus, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { invalidateInventoryCache } from '../../utils/pantryCache';

const _apiJson = async (path, options = {}) => {
    const resp = await fetchWithAuth(path, options);
    let json = null;
    try { json = await resp.json(); } catch { /* body vacío / no-JSON */ }
    if (!resp.ok) {
        const err = new Error((json && json.detail) ? String(json.detail) : `HTTP ${resp.status}`);
        err.status = resp.status;
        err.detail = json?.detail;
        throw err;
    }
    return json;
};

// Reescala client-side antes de subir: menos payload y menos tokens de imagen
// para el modelo de visión (foto de celular 4000px → 1024px).
const _downscaleToB64 = (file, maxSide = 1024) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
        try {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            resolve(dataUrl.split(',')[1]);
        } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
});

/**
 * @param {boolean} enabled  — flag del provider de visión (photo_scan_enabled del backend).
 * @param {Array}   inventory — filas actuales (para el 409→increment del duplicado).
 * @param {Function} onInventoryChanged — callback post-add (refetch de la superficie).
 */
export const PantryScanButton = ({ enabled, inventory, onInventoryChanged }) => {
    const fileInputRef = useRef(null);
    const [scanning, setScanning] = useState(false);
    const [scanResults, setScanResults] = useState(null);
    const busyRef = useRef(false);

    if (!enabled) return null;

    const handlePhotoSelected = async (file) => {
        if (!file || scanning) return;
        setScanning(true);
        setScanResults(null);
        try {
            const b64 = await _downscaleToB64(file);
            const resp = await fetchWithAuth('/api/inventory/photo-scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_b64: b64 }),
            });
            const data = await resp.json().catch(() => null);
            if (!resp.ok) {
                toast.error(data?.detail || 'No pudimos analizar la foto.');
                return;
            }
            const items = (data?.items || []).map(it => ({
                ...it,
                // Preseleccionar solo lo confiable Y mapeado al catálogo verificado.
                selected: !!it.master_ingredient_id && (it.confidence ?? 0) >= 0.5,
            }));
            if (items.length === 0) {
                toast.info('No se detectaron alimentos en la foto', {
                    description: 'Intenta con más luz y los empaques de frente.',
                });
                return;
            }
            setScanResults(items);
        } catch (e) {
            console.error('PantryScanButton scan:', e);
            toast.error('No pudimos analizar la foto.');
        } finally {
            setScanning(false);
        }
    };

    const confirmScanItems = async () => {
        const chosen = (scanResults || []).filter(it => it.selected && it.master_ingredient_id);
        if (chosen.length === 0) { setScanResults(null); return; }
        if (busyRef.current) return;
        busyRef.current = true;
        try {
            for (const it of chosen) {
                const unit = it.catalog_unit || it.unit || 'unidad';
                const qty = Math.max(1, Math.round(it.quantity || 1));
                try {
                    await _apiJson('/api/inventory/items', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ingredient_name: it.catalog_name,
                            master_ingredient_id: it.master_ingredient_id,
                            quantity: qty,
                            unit,
                            // [P1-PANTRY-SCAN-BRAND] marca del empaque → etiqueta el item
                            // (NO la preferencia global — esa es solo manual).
                            brand: it.detected_brand || null,
                        }),
                    });
                } catch (err) {
                    if (err?.status === 409) {
                        const dup = (inventory || []).find(i => i.master_ingredient_id === it.master_ingredient_id);
                        if (dup) {
                            await _apiJson('/api/inventory/increment', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ item_id: dup.id, delta: qty }),
                            });
                        }
                    } else {
                        console.error('PantryScanButton add:', err);
                    }
                }
            }
            invalidateInventoryCache();
            toast.success(`${chosen.length} alimento${chosen.length === 1 ? '' : 's'} agregado${chosen.length === 1 ? '' : 's'} desde la foto`);
            setScanResults(null);
            try { await onInventoryChanged?.(); } catch { /* la superficie refetchea */ }
        } finally {
            busyRef.current = false;
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <style>{`
                @keyframes qpb-spin { to { transform: rotate(360deg); } }
                @keyframes qpb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
                @keyframes qpb-border { 0%, 100% { border-color: var(--primary); } 50% { border-color: var(--border); } }
            `}</style>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => { handlePhotoSelected(e.target.files?.[0]); e.target.value = ''; }} />
            {/* [feedback owner 2026-07-11] Fila premium en vez de zona punteada
                (el dashed leía como placeholder/dropzone): badge circular con el
                ícono, título + subtítulo, pill BETA y hover con acento. */}
            <button type="button" disabled={scanning}
                onClick={() => fileInputRef.current?.click()}
                onMouseEnter={(e) => { if (!scanning) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--bg-muted)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    width: '100%', padding: '0.6rem 0.9rem', borderRadius: '0.9rem',
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    cursor: scanning ? 'wait' : 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s, background 0.15s',
                    animation: scanning ? 'qpb-border 2s ease-in-out infinite' : 'none',
                }}>
                <span aria-hidden="true" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                    color: 'var(--primary)',
                }}>
                    {scanning
                        ? <Loader2 size={17} style={{ animation: 'qpb-spin 1s linear infinite' }} />
                        : <Camera size={17} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{
                        color: 'var(--text-main)', fontWeight: 600, fontSize: '0.9rem',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        animation: scanning ? 'qpb-pulse 1.8s ease-in-out infinite' : 'none',
                    }}>
                        {scanning ? 'Analizando tu foto…' : 'Escanear mi nevera con una foto'}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {scanning ? 'Esto toma 1-3 minutos — puedes seguir usando la app' : 'Detecta alimentos, cantidades y marcas automáticamente'}
                    </span>
                </span>
                <span style={{
                    flexShrink: 0, fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'var(--primary)',
                    border: '1px solid color-mix(in srgb, var(--primary) 45%, transparent)',
                    borderRadius: '99px', padding: '2px 8px',
                }}>
                    beta
                </span>
            </button>

            {scanResults && (
                <div style={{
                    padding: '0.9rem', borderRadius: '0.9rem',
                    border: '1px solid var(--primary)', background: 'var(--bg-card)',
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                }}>
                    <strong style={{ color: 'var(--text-main)', fontSize: '0.92rem' }}>
                        Detectado en tu foto — confirma lo que quieres agregar:
                    </strong>
                    {scanResults.map((it, idx) => (
                        <label key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: '0.55rem',
                            fontSize: '0.87rem', color: 'var(--text-main)',
                            opacity: it.master_ingredient_id ? 1 : 0.55, cursor: 'pointer',
                        }}>
                            <input type="checkbox" checked={it.selected} disabled={!it.master_ingredient_id}
                                onChange={() => setScanResults(prev => prev.map((p, i) =>
                                    i === idx ? { ...p, selected: !p.selected } : p))} />
                            <span style={{ flex: 1 }}>
                                {it.catalog_name || it.detected_name}
                                {it.detected_brand && (
                                    <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}> · {it.detected_brand}</span>
                                )}
                                {!it.master_ingredient_id && ' (sin match en el catálogo)'}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>
                                {Math.max(1, Math.round(it.quantity || 1))} {it.catalog_unit || it.unit}
                                {' · '}{Math.round((it.confidence || 0) * 100)}%
                            </span>
                        </label>
                    ))}
                    <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
                        <button type="button" onClick={confirmScanItems}
                            style={{
                                flex: 1, padding: '0.6rem 1rem', borderRadius: '99px', border: 'none',
                                background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                            }}>
                            <Plus size={15} /> Agregar {scanResults.filter(i => i.selected).length} a mi Nevera
                        </button>
                        <button type="button" onClick={() => setScanResults(null)}
                            style={{
                                padding: '0.6rem 1rem', borderRadius: '99px',
                                border: '1px solid var(--border)', background: 'none',
                                color: 'var(--text-muted)', cursor: 'pointer',
                            }}>
                            Descartar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
