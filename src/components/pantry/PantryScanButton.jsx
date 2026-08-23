// [P1-PANTRY-DASH-PARITY · 2026-07-11] Escáner de nevera por foto — componente
// COMPARTIDO entre el paso 21 del wizard (QPantryBuilder) y la página Nevera del
// dashboard (Pantry.jsx). SSOT del flujo completo: botón + reescala client-side +
// POST /api/inventory/photo-scan (READ-ONLY server-side) + checklist de
// confirmación + adds vía /api/inventory/items (409→increment). Nada entra a la
// Nevera sin que el usuario lo confirme. Extraído de QPantryBuilder
// (P1-PANTRY-SCAN-V0/QTY/BRAND) para que ambas superficies no dupliquen ni driften.
//
// [P1-PANTRY-CAMERA-SCAN · 2026-07-28 · visor extraído en P1-SCANNER-SHARED
// 2026-08-10] Al tocar la tarjeta se abre DIRECTO un visor in-app con retícula +
// barrido (en vez de saltar a la cámara nativa del OS). Ese visor —permiso, ciclo
// de vida de los tracks, atributos de iOS, retícula, disparador y la salida
// discreta a `<input type="file">`— vive ahora en `common/CameraViewfinder`, que
// comparte con «Escanear comida»: cuando el dueño pidió el mismo escáner para el
// diario, la respuesta correcta no era copiar 200 líneas.
//
// Lo que se queda aquí es lo propio de la Nevera: qué se hace con la foto
// (`handlePhotoSelected` → `/api/inventory/photo-scan`) y la hoja de resultados
// que sube desde el borde inferior del marco. La foto capturada entra por el MISMO
// `_downscaleToB64` (1024px máx, JPEG q0.82) que el `<input type="file">`, así que
// no hay drift de payload entre los dos orígenes.
//
// La API `/api/inventory/photo-scan` NO devuelve coordenadas de detección — por
// eso el barrido es movimiento ambiental honesto (nunca se dibujan cajas de
// detección fantasma sobre la foto). Los hallazgos llegan por el checklist de
// confirmación de siempre.
//
// [P1-PANTRY-SCAN-MOBILE-ONLY · 2026-07-28 · corregido por
// P1-PANTRY-SCAN-PC-UPLOAD · 2026-07-28] Primera lectura del feedback del
// owner ("para PC, lo de escanear no tiene sentido, solo déjalo para
// móviles") fue OCULTAR la tarjeta entera fuera de móvil. Lectura correcta:
// lo que no tiene sentido en desktop es el VISOR EN VIVO (nadie carga una
// nevera hasta el escritorio) — subir una foto SÍ tiene sentido ahí. La
// tarjeta ahora es visible en TODO dispositivo (sujeta solo al flag backend
// `enabled`, ver `if (!enabled) return null;` más abajo); lo que cambia por
// dispositivo es el MODO que dispara el tap:
//   - puntero coarse + API de cámara real → visor en vivo (sin cambios).
//   - cualquier otro caso (desktop, tablet sin cámara, `matchMedia` ausente
//     en SSR/entorno raro) → el <input type="file"> directo — sin viewfinder
//     ni prompt de permiso de cámara, nunca un callejón sin salida.
// Ver `useLiveViewfinder` más abajo — misma detección de capacidad de antes,
// ahora selecciona COMPORTAMIENTO en vez de ocultar el componente.
import { useState, useRef, useCallback } from 'react';
import { fetchWithAuth } from '../../config/api';
import { Plus, Camera, ImageUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { invalidateInventoryCache } from '../../utils/pantryCache';
import { useMediaQuery } from '../../hooks/useMediaQuery';
// [P1-SCANNER-SHARED · 2026-08-10] El visor en vivo salió de este archivo a
// `common/CameraViewfinder` para que «Escanear comida» lo use tal cual en vez de
// nacer una segunda copia. Lo que sigue viviendo aquí es lo propio de la Nevera.
import CameraViewfinder from '../common/CameraViewfinder';
import { useT, useTn } from '../../i18n';
import { glossUnitWord } from '../../utils/shoppingHelpers';
// [P1-I18N-BACKEND-DETAIL · 2026-08-21] El `detail` del servidor viene
// en español SIEMPRE; el `||` hacía que ganara sobre el fallback traducido.
import { mensajeDeError } from '../../utils/errorCopy';

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
// para el modelo de visión (foto de celular 4000px → 1024px). SSOT — tanto el
// <input type="file"> como el visor de cámara en vivo pasan por acá.
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
 * @param {Object}  [style] — [P1-PANTRY-SCAN-MOBILE-ONLY] merge opcional sobre el <div>
 *   raíz del componente (para que el caller pida separación — ej. margin — SIN envolver
 *   en su propio <div>). Un wrapper externo queda vacío-pero-presente en el DOM cuando el
 *   gate interno (`enabled` — el ÚNICO que oculta la tarjeta desde P1-PANTRY-SCAN-PC-UPLOAD,
 *   ver comentario de cabecera) oculta la tarjeta; el margen viajando CON la
 *   raíz del componente colapsa a cero junto con el resto del DOM. Ver callsites en
 *   `pages/Pantry.jsx` (antes envolvían en `<div style={{margin}}>`, ahora pasan `style`
 *   directo). `QPantryBuilder.jsx` no lo usa — su gap de layout es 100% del flex padre.
 */
// [P1-PANTRY-SCAN-TOOLBAR · 2026-08-14] `compact`: el escáner como un control
// más de la barra de la Nevera, junto a «+ Añadir». Antes era una tarjeta ancha
// centrada bajo el toolbar y el dueño la señaló como lo que afeaba la pantalla:
// el único elemento centrado de una vista alineada a la izquierda, partiendo en
// dos la relación entre las acciones y la lista.
export const PantryScanButton = ({ enabled, inventory, onInventoryChanged, style, compact = false }) => {
    const t = useT();
    const tn = useTn();
    const fileInputRef = useRef(null);
    const [scanning, setScanning] = useState(false);
    const [scanResults, setScanResults] = useState(null);
    const busyRef = useRef(false);

    // [P1-PANTRY-CAMERA-SCAN · visor extraído en P1-SCANNER-SHARED 2026-08-10]
    // Todo el ciclo de vida de la cámara (permiso, tracks, iOS, retícula, disparador)
    // vive ahora en `common/CameraViewfinder`, compartido con «Escanear comida».
    // Aquí solo queda si está abierto y qué hacer con la foto.
    const [viewfinderOpen, setViewfinderOpen] = useState(false);
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

    // [P1-PANTRY-SCAN-PC-UPLOAD · 2026-07-28] Capacidad, NO breakpoint — MISMA
    // detección que P1-PANTRY-SCAN-MOBILE-ONLY, pero ahora selecciona MODO en
    // vez de visibilidad (ver comentario de cabecera del archivo): puntero
    // primario coarse (dedo, no mouse/trackpad) Y una API de cámara real
    // disponible → el tap abre el visor en vivo. Cualquier otro caso
    // (desktop, tablet sin cámara, `matchMedia` ausente en SSR/entorno raro)
    // → el tap abre el <input type="file"> directo. Fail-secure hacia el
    // modo MÁS simple (upload sin viewfinder), nunca hacia ocultar la tarjeta.
    const isCoarsePointer = useMediaQuery('(pointer: coarse)');
    const hasCameraApi = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    const useLiveViewfinder = isCoarsePointer && hasCameraApi;

    const closeViewfinder = useCallback(() => setViewfinderOpen(false), []);


    // [P1-PANTRY-SCAN-PC-UPLOAD] Único gate de visibilidad: el flag backend.
    // La capacidad de dispositivo (`useLiveViewfinder`) ya NO oculta la
    // tarjeta — solo decide qué abre el tap. Ver comentario de cabecera.
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
                toast.error(mensajeDeError(data, t('No pudimos analizar la foto.'), t));
                return;
            }
            const items = (data?.items || []).map(it => ({
                ...it,
                // Preseleccionar solo lo confiable Y mapeado al catálogo verificado.
                selected: !!it.master_ingredient_id && (it.confidence ?? 0) >= 0.5,
            }));
            if (items.length === 0) {
                toast.info(t('No se detectaron alimentos en la foto'), {
                    description: t('Intenta con más luz y los empaques de frente.'),
                });
                return;
            }
            setScanResults(items);
            return items;
        } catch (e) {
            console.error('PantryScanButton scan:', e);
            toast.error(t('No pudimos analizar la foto.'));
        } finally {
            setScanning(false);
        }
        return null;
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
            toast.success(tn(
                chosen.length,
                '{n} alimento agregado desde la foto',
                '{n} alimentos agregados desde la foto',
                { n: chosen.length },
            ));
            setScanResults(null);
            try { await onInventoryChanged?.(); } catch { /* la superficie refetchea */ }
        } finally {
            busyRef.current = false;
        }
    };

    // [P1-PANTRY-SCAN-PC-UPLOAD] Un solo tap → selecciona modo por capacidad
    // (`useLiveViewfinder`): con cámara real (móvil/tablet) abre el visor en
    // vivo directo (nada de menú intermedio, comportamiento sin cambios);
    // sin cámara (desktop) abre el <input type="file"> directo — nunca pide
    // permiso de cámara ni muestra un visor que no puede funcionar ahí.
    const handleCardTap = () => {
        if (useLiveViewfinder) {
            setViewfinderOpen(true);
        } else {
            fileInputRef.current?.click();
        }
    };

    // [P1-SCANNER-SHARED · 2026-08-10] El visor entrega el File; el análisis sigue
    // siendo cosa de esta pantalla. Si NO hubo detecciones (0 items o error — el
    // toast ya explicó por qué), el visor se cierra solo: dejarlo abierto con la
    // foto congelada y sin lista sería una pantalla muerta. Antes esto era un
    // efecto que vigilaba tres estados a la vez; ahora es el desenlace del await,
    // que es donde de verdad se sabe.
    const handleViewfinderCapture = async (file) => {
        const items = await handlePhotoSelected(file);
        if (!items || items.length === 0) closeViewfinder();
    };

    // Falla la cámara (denegada/no disponible) o el usuario prefiere el <input>
    // de siempre: cierra el visor (para el stream si llegó a abrir) y dispara
    // el picker nativo — nunca deja al usuario en un callejón sin salida.
    const handleFallbackToFile = () => {
        closeViewfinder();
        fileInputRef.current?.click();
    };

    const renderResultsChecklist = () => (
        <>
            <strong style={{ color: 'var(--text-main)', fontSize: '0.92rem' }}>
                {t('Detectado en tu foto — confirma lo que quieres agregar:')}
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
                        {!it.master_ingredient_id && ` ${t('(sin match en el catálogo)')}`}
                        {/* [P1-SCAN-CATALOG-MATCH · 2026-08-10] Cuando el alimento del
                            catálogo NO se llama como lo que leyó la foto, se enseñan los
                            dos. Antes solo se veía el del catálogo, así que un mapeo
                            equivocado borraba de la pantalla la lectura del modelo: sobre
                            la foto de un pan aparecía «Polvo de hornear» y parecía que el
                            modelo se había equivocado, cuando había leído bien. El
                            porcentaje de al lado es la confianza de ESA lectura, no del
                            mapeo — razón de más para que la lectura se vea. */}
                        {it.catalog_renamed && it.detected_name && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                {' '}{t('· leído:')} {it.detected_name}
                            </span>
                        )}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                        {Math.max(1, Math.round(it.quantity || 1))} {glossUnitWord(it.catalog_unit || it.unit, t)}
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
                    <Plus size={15} /> {t('Agregar {n} a mi Nevera', { n: scanResults.filter(i => i.selected).length })}
                </button>
                <button type="button" onClick={() => setScanResults(null)}
                    style={{
                        padding: '0.6rem 1rem', borderRadius: '99px',
                        border: '1px solid var(--border)', background: 'none',
                        color: 'var(--text-muted)', cursor: 'pointer',
                    }}>
                    {t('Descartar')}
                </button>
            </div>
        </>
    );

    // [P1-PANTRY-SCAN-TOOLBAR] En compacto el wrapper DESAPARECE del layout
    // (`display: contents`): el botón pasa a ser hijo directo del flex de la
    // barra y se alinea con sus vecinos. Sin esto, la barra vería una caja
    // flex-column en vez del botón.
    const compactBtn = {
        display: 'inline-flex', alignItems: 'center', gap: 7,
        height: 44, padding: '0 14px', borderRadius: 12,
        // Mismo lenguaje que el chip de temperatura de esta barra (velo del
        // acento + borde), pero en índigo: emparenta con «+ Añadir» —son la
        // misma tarea— sin competir con su relleno sólido.
        border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
        background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
        color: 'var(--text-main)', font: 'inherit', fontSize: '.8rem', fontWeight: 700,
        cursor: scanning ? 'wait' : 'pointer', whiteSpace: 'nowrap',
        transition: 'background .15s, border-color .15s',
        animation: scanning ? 'qpb-border 2s ease-in-out infinite' : 'none',
    };

    return (
        <div style={compact
            ? { display: 'contents' }
            : { display: 'flex', flexDirection: 'column', gap: '0.75rem', ...style }}>
            <style>{`
                @keyframes qpb-spin { to { transform: rotate(360deg); } }
                @keyframes qpb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
                @keyframes qpb-border { 0%, 100% { border-color: var(--primary); } 50% { border-color: var(--border); } }
                /* La hoja de resultados "sube" desde el borde inferior del marco, donde
                   se asienta el barrido del visor — una sola animación continua de
                   escaneo → resultados. El barrido en sí vive en CameraViewfinder. */
                @keyframes qpb-vf-rise {
                    from { transform: translateY(14%); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
            `}</style>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => { handlePhotoSelected(e.target.files?.[0]); e.target.value = ''; }} />
            {/* [feedback owner 2026-07-11] Fila premium en vez de zona punteada
                (el dashed leía como placeholder/dropzone): badge circular con el
                ícono, título + subtítulo, pill BETA y hover con acento. */}
            {compact ? (
                /* Control de barra: ícono + verbo + BETA. El subtítulo
                   («Detecta alimentos, cantidades y marcas») no cabe aquí y
                   tampoco hace falta — el título ya dice qué hace, y lo que
                   antes explicaba el subtítulo lo cuenta el propio flujo al
                   abrirse. Se conserva en el `title` para quien se detenga. */
                <button type="button" disabled={scanning}
                    onClick={handleCardTap}
                    title={scanning
                        ? t('Analizando tu foto… esto toma 1-3 minutos')
                        : t('Detecta alimentos, cantidades y marcas automáticamente')}
                    onMouseEnter={(e) => { if (!scanning) { e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 18%, transparent)'; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 10%, transparent)'; }}
                    style={compactBtn}>
                    {scanning
                        ? <Loader2 size={16} style={{ color: 'var(--primary)', animation: 'qpb-spin 1s linear infinite' }} />
                        : (useLiveViewfinder
                            ? <Camera size={16} style={{ color: 'var(--primary)' }} />
                            : <ImageUp size={16} style={{ color: 'var(--primary)' }} />)}
                    <span style={{ animation: scanning ? 'qpb-pulse 1.8s ease-in-out infinite' : 'none' }}>
                        {scanning ? t('Analizando…') : t('Escanear')}
                    </span>
                    <span style={{
                        fontSize: '.58rem', fontWeight: 700, letterSpacing: '.08em',
                        textTransform: 'uppercase', color: 'var(--primary)',
                        border: '1px solid color-mix(in srgb, var(--primary) 45%, transparent)',
                        borderRadius: 99, padding: '1px 5px',
                    }}>beta</span>
                </button>
            ) : (
            <button type="button" disabled={scanning}
                onClick={handleCardTap}
                onMouseEnter={(e) => { if (!scanning) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--bg-muted)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    // [feedback owner] fila compacta (~420px) y CENTRADA.
                    width: '100%', maxWidth: '420px', margin: '0 auto',
                    padding: '0.6rem 0.9rem', borderRadius: '0.9rem',
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
                        : (useLiveViewfinder ? <Camera size={17} /> : <ImageUp size={17} />)}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{
                        color: 'var(--text-main)', fontWeight: 600, fontSize: '0.9rem',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        animation: scanning ? 'qpb-pulse 1.8s ease-in-out infinite' : 'none',
                    }}>
                        {scanning
                            ? t('Analizando tu foto…')
                            : (useLiveViewfinder ? t('Escanear mi nevera con una foto') : t('Sube una foto de tu nevera'))}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {scanning ? t('Esto toma 1-3 minutos — puedes seguir usando la app') : t('Detecta alimentos, cantidades y marcas automáticamente')}
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
            )}

            {/* Checklist del flujo NO-cámara (fallback de archivo, visor ya cerrado).
                [P1-PANTRY-SCAN-TOOLBAR] En compacto FLOTA anclada abajo en vez de
                ocupar sitio: desde la barra, una hoja en flujo se colaría entre el
                buscador y los botones. Misma hoja, distinto anclaje. */}
            {!viewfinderOpen && scanResults && (
                <div style={compact ? {
                    position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)',
                    width: 'min(560px, 92vw)', maxHeight: '70vh', overflowY: 'auto', zIndex: 60,
                    padding: '0.9rem', borderRadius: '0.9rem',
                    border: '1px solid var(--primary)', background: 'var(--bg-card)',
                    boxShadow: '0 18px 40px -12px rgb(0 0 0 / 0.45)',
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                } : {
                    padding: '0.9rem', borderRadius: '0.9rem',
                    border: '1px solid var(--primary)', background: 'var(--bg-card)',
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                }}>
                    {renderResultsChecklist()}
                </div>
            )}

            {/* [P1-PANTRY-CAMERA-SCAN] Visor de cámara en vivo. */}
            {/* [P1-SCANNER-SHARED · 2026-08-10] El visor vive en `common/CameraViewfinder`
                y lo comparten esta pantalla y la de «Escanear comida». Aquí solo queda
                lo que ES de la Nevera: la hoja de resultados que sube desde el borde
                inferior cuando la detección termina. */}
            <CameraViewfinder
                isOpen={viewfinderOpen}
                title={t('Escanear tu nevera')}
                hint={t('Encuadra el interior de tu nevera')}
                busy={scanning}
                fileName="nevera.jpg"
                onCapture={handleViewfinderCapture}
                onClose={closeViewfinder}
                onFallbackToFile={handleFallbackToFile}
                hideReticle={!!scanResults}
            >
                {/* Momento de firma: el barrido se asienta en el borde inferior (el
                    borde superior indigo de esta hoja) y la lista de detección "sube"
                    desde ahí — una sola animación continua de escaneo → resultados. */}
                {scanResults && (
                    <div style={{
                        position: 'absolute', left: 0, right: 0, bottom: 0,
                        maxHeight: '82%', overflowY: 'auto',
                        borderTop: '2px solid var(--primary)',
                        boxShadow: '0 -8px 20px -6px var(--primary)',
                        background: 'var(--bg-card)', borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem',
                        padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
                        animation: reducedMotion ? 'none' : 'qpb-vf-rise 0.45s ease-out',
                    }}>
                        {renderResultsChecklist()}
                    </div>
                )}
            </CameraViewfinder>
        </div>
    );
};
