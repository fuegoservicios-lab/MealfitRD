// [P1-PANTRY-DASH-PARITY · 2026-07-11] Escáner de nevera por foto — componente
// COMPARTIDO entre el paso 21 del wizard (QPantryBuilder) y la página Nevera del
// dashboard (Pantry.jsx). SSOT del flujo completo: botón + reescala client-side +
// POST /api/inventory/photo-scan (READ-ONLY server-side) + checklist de
// confirmación + adds vía /api/inventory/items (409→increment). Nada entra a la
// Nevera sin que el usuario lo confirme. Extraído de QPantryBuilder
// (P1-PANTRY-SCAN-V0/QTY/BRAND) para que ambas superficies no dupliquen ni driften.
//
// [P1-PANTRY-CAMERA-SCAN · 2026-07-28] Visor de cámara en vivo. Al tocar la
// tarjeta se abre DIRECTO un viewfinder in-app con retícula + barrido (en vez de
// saltar a la cámara nativa del OS) — un link secundario discreto "Subir una foto
// en su lugar" cae al <input type="file"> preexistente. La captura dibuja el
// <video> en un <canvas> en sus dimensiones REALES (videoWidth/videoHeight,
// NUNCA el tamaño CSS del elemento), lo convierte a File y lo alimenta al MISMO
// `handlePhotoSelected` que usa el <input> — por lo tanto pasa por el MISMO
// `_downscaleToB64` (1024px máx, JPEG q0.82) y el MISMO POST — cero drift de
// payload entre ambos orígenes.
//
// Lifecycle de tracks del stream (bug clásico: la luz de la cámara se queda
// prendida si se olvida un `.stop()`): `stopStream()` para TODO track y se
// invoca en:
//   1. cleanup del effect que adquiere `getUserMedia` — cubre CIERRE del visor
//      (viewfinderOpen→false) Y UNMOUNT del componente (mismo cleanup de React).
//   2. justo tras capturar el frame (handleShutter) — ya no hace falta el feed
//      en vivo mientras la IA analiza la foto congelada.
//   3. rama `cancelled` dentro de la promesa de `getUserMedia` — cierra el
//      stream si el visor se cerró ANTES de que el browser resolviera el
//      permiso (evita una fuga si el usuario cierra rapidísimo).
//
// iOS Safari: el <video> necesita `muted` (y `playsinline`) como CONTENT
// ATTRIBUTE — no solo como prop de React, que solo escribe la property — o el
// autoplay queda bloqueado en silencio. Mismo bug que P1-HERO-ORB-AUTOPLAY-MOBILE
// (2026-07-11), que vivía en el hero. Ese código y su test se borraron en
// P1-PAPER-HERO-FIG00 (2026-08-01) al morir el vídeo del hero, así que ESTE
// archivo es ahora el único sitio del repo donde queda el patrón: ahí también se
// asigna `el.muted = true; el.defaultMuted = true; el.setAttribute('muted', '')`
// en un effect al montar/arrancar el video, no confiando solo en el JSX prop.
// Aquí replicamos la misma técnica + `setAttribute('playsinline', '')`.
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
import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchWithAuth } from '../../config/api';
import { Plus, Camera, ImageUp, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { invalidateInventoryCache } from '../../utils/pantryCache';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useMediaQuery } from '../../hooks/useMediaQuery';

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

// [P1-PANTRY-CAMERA-SCAN] Captura el frame actual del <video> a un <canvas> en
// sus dimensiones REALES (video.videoWidth/videoHeight — nunca el tamaño CSS
// del elemento). Produce:
//   - `file`: JPEG de alta calidad que alimenta el MISMO `_downscaleToB64` que
//     usa el <input type="file"> — el payload final es idéntico sin importar
//     el origen (cámara en vivo vs. archivo subido).
//   - `previewUrl`: dataURL para el freeze-frame visual mientras la IA trabaja.
const _captureVideoFrame = (video) => new Promise((resolve, reject) => {
    try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) { reject(new Error('video sin dimensiones aún')); return; }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(video, 0, 0, w, h);
        const previewUrl = canvas.toDataURL('image/jpeg', 0.85);
        canvas.toBlob((blob) => {
            if (!blob) { reject(new Error('toBlob devolvió null')); return; }
            resolve({ file: new File([blob], 'nevera.jpg', { type: 'image/jpeg' }), previewUrl });
        }, 'image/jpeg', 0.92);
    } catch (e) { reject(e); }
});

// Cuatro esquinas en L de la retícula — posición/orientación por esquina.
const _VF_CORNERS = [
    { top: 0, left: 0, borderTop: '3px solid', borderLeft: '3px solid', borderTopLeftRadius: 8 },
    { top: 0, right: 0, borderTop: '3px solid', borderRight: '3px solid', borderTopRightRadius: 8 },
    { bottom: 0, left: 0, borderBottom: '3px solid', borderLeft: '3px solid', borderBottomLeftRadius: 8 },
    { bottom: 0, right: 0, borderBottom: '3px solid', borderRight: '3px solid', borderBottomRightRadius: 8 },
];

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
export const PantryScanButton = ({ enabled, inventory, onInventoryChanged, style }) => {
    const fileInputRef = useRef(null);
    const [scanning, setScanning] = useState(false);
    const [scanResults, setScanResults] = useState(null);
    const busyRef = useRef(false);

    // [P1-PANTRY-CAMERA-SCAN] Estado del visor en vivo.
    const [viewfinderOpen, setViewfinderOpen] = useState(false);
    // cameraPhase: 'starting' | 'live' | 'denied'
    const [cameraPhase, setCameraPhase] = useState('starting');
    const [capturedPreviewUrl, setCapturedPreviewUrl] = useState(null);
    const [longAnalysis, setLongAnalysis] = useState(false);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
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

    // Para TODO track del stream — ver bloque de comentarios arriba (3 exit paths).
    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    const closeViewfinder = useCallback(() => setViewfinderOpen(false), []);

    const { containerRef } = useModalAccessibility({
        isOpen: viewfinderOpen,
        onClose: closeViewfinder,
    });

    // Adquiere la cámara al abrir el visor; el cleanup cubre CIERRE + UNMOUNT.
    useEffect(() => {
        if (!viewfinderOpen) return undefined;
        let cancelled = false;
        setCameraPhase('starting');
        setCapturedPreviewUrl(null);
        setLongAnalysis(false);

        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraPhase('denied');
            return undefined;
        }

        navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
        }).then((stream) => {
            if (cancelled) {
                // El visor se cerró mientras esperábamos el permiso — no dejar
                // el stream vivo (exit path #3 del lifecycle).
                stream.getTracks().forEach((t) => t.stop());
                return;
            }
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                const p = videoRef.current.play?.();
                if (p?.catch) p.catch(() => { /* autoplay policy — el usuario ya ve el visor */ });
            }
            setCameraPhase('live');
        }).catch((err) => {
            if (cancelled) return;
            console.error('PantryScanButton camera:', err);
            setCameraPhase('denied');
        });

        return () => {
            cancelled = true;
            stopStream();
        };
    }, [viewfinderOpen, stopStream]);

    // iOS Safari: `muted`/`playsinline` como CONTENT ATTRIBUTE (no solo prop de
    // React) — mismo fix que P1-HERO-ORB-AUTOPLAY-MOBILE (Hero.jsx).
    useEffect(() => {
        const el = videoRef.current;
        if (!el || cameraPhase !== 'live') return;
        el.muted = true;
        el.defaultMuted = true;
        el.setAttribute('muted', '');
        el.setAttribute('playsinline', '');
    }, [cameraPhase]);

    // Caption "todavía analizando" tras ~6s (solo mientras hay foto congelada en vuelo).
    useEffect(() => {
        if (!(viewfinderOpen && capturedPreviewUrl && scanning)) {
            setLongAnalysis(false);
            return undefined;
        }
        const t = setTimeout(() => setLongAnalysis(true), 6000);
        return () => clearTimeout(t);
    }, [viewfinderOpen, capturedPreviewUrl, scanning]);

    // La captura terminó sin resultados (0 detecciones / error — el toast ya
    // explicó por qué) → cierra el visor solo; el botón base sigue disponible
    // y ya refleja "Analizando…"/idle vía el estado `scanning` compartido.
    useEffect(() => {
        if (viewfinderOpen && capturedPreviewUrl && !scanning && !scanResults) {
            closeViewfinder();
        }
    }, [viewfinderOpen, capturedPreviewUrl, scanning, scanResults, closeViewfinder]);

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

    const handleShutter = async () => {
        if (cameraPhase !== 'live' || !videoRef.current || capturedPreviewUrl) return;
        try {
            const { file, previewUrl } = await _captureVideoFrame(videoRef.current);
            setCapturedPreviewUrl(previewUrl);
            // Ya no hace falta el feed en vivo mientras la IA analiza — apaga
            // la cámara YA (exit path #2 del lifecycle de tracks).
            stopStream();
            handlePhotoSelected(file);
        } catch (e) {
            console.error('PantryScanButton capture:', e);
            toast.error('No pudimos capturar la foto. Intenta de nuevo.');
        }
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
        </>
    );

    const showControls = !capturedPreviewUrl && cameraPhase !== 'denied';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', ...style }}>
            <style>{`
                @keyframes qpb-spin { to { transform: rotate(360deg); } }
                @keyframes qpb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
                @keyframes qpb-border { 0%, 100% { border-color: var(--primary); } 50% { border-color: var(--border); } }
                /* [P1-PANTRY-CAMERA-SCAN] Barrido: una línea top→bottom en loop ~1.6s.
                   Se usa "top" (no transform) porque el % de "top" es relativo al
                   contenedor posicionado — transform: translateY(%) sería relativo
                   a la altura de la propia barra (2px), no a la del marco. */
                @keyframes qpb-vf-sweep {
                    0%   { top: 0%;   opacity: 0; }
                    10%  { opacity: 1; }
                    90%  { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                @keyframes qpb-vf-rise {
                    from { transform: translateY(14%); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
                .qpb-vf-focusable:focus-visible {
                    outline: 3px solid var(--primary);
                    outline-offset: 2px;
                }
            `}</style>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => { handlePhotoSelected(e.target.files?.[0]); e.target.value = ''; }} />
            {/* [feedback owner 2026-07-11] Fila premium en vez de zona punteada
                (el dashed leía como placeholder/dropzone): badge circular con el
                ícono, título + subtítulo, pill BETA y hover con acento. */}
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
                            ? 'Analizando tu foto…'
                            : (useLiveViewfinder ? 'Escanear mi nevera con una foto' : 'Sube una foto de tu nevera')}
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

            {/* Checklist del flujo NO-cámara (fallback de archivo, visor ya cerrado). */}
            {!viewfinderOpen && scanResults && (
                <div style={{
                    padding: '0.9rem', borderRadius: '0.9rem',
                    border: '1px solid var(--primary)', background: 'var(--bg-card)',
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                }}>
                    {renderResultsChecklist()}
                </div>
            )}

            {/* [P1-PANTRY-CAMERA-SCAN] Visor de cámara en vivo. */}
            {viewfinderOpen && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(15, 23, 42, 0.85)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                }}>
                    <div
                        ref={containerRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="qpb-vf-title"
                        tabIndex={-1}
                        style={{
                            width: '100%', maxWidth: '460px', maxHeight: '95vh',
                            display: 'flex', flexDirection: 'column', gap: '0.85rem',
                            outline: 'none',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h2 id="qpb-vf-title" style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#fff' }}>
                                Escanear tu nevera
                            </h2>
                            <button type="button" onClick={closeViewfinder} aria-label="Cerrar"
                                className="qpb-vf-focusable"
                                style={{
                                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)',
                                    cursor: 'pointer', padding: '0.3rem', borderRadius: '0.5rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                <X size={22} />
                            </button>
                        </div>

                        {/* Marco: video en vivo o foto congelada + retícula + barrido. */}
                        <div style={{
                            position: 'relative', width: '100%', aspectRatio: '3 / 4', maxHeight: '68vh',
                            borderRadius: '1.1rem', overflow: 'hidden', background: '#000',
                        }}>
                            {!capturedPreviewUrl && cameraPhase !== 'denied' && (
                                <video
                                    ref={videoRef}
                                    muted
                                    playsInline
                                    defaultMuted
                                    autoPlay
                                    aria-hidden="true"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                />
                            )}

                            {capturedPreviewUrl && (
                                <img src={capturedPreviewUrl} alt="Foto capturada de tu nevera"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            )}

                            {cameraPhase === 'starting' && !capturedPreviewUrl && (
                                <div style={{
                                    position: 'absolute', inset: 0, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Loader2 size={26} color="rgba(255,255,255,0.75)"
                                        style={{ animation: 'qpb-spin 1s linear infinite' }} />
                                </div>
                            )}

                            {cameraPhase === 'denied' && (
                                <div style={{
                                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', gap: '1rem',
                                    padding: '1.75rem', textAlign: 'center',
                                }}>
                                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem' }}>
                                        No pudimos abrir la cámara. Puedes subir una foto en su lugar.
                                    </span>
                                    <button type="button" onClick={handleFallbackToFile}
                                        className="qpb-vf-focusable"
                                        style={{
                                            padding: '0.6rem 1.1rem', borderRadius: '99px', border: 'none',
                                            background: 'var(--primary)', color: '#fff', fontWeight: 700,
                                            cursor: 'pointer',
                                        }}>
                                        Subir una foto en su lugar
                                    </button>
                                </div>
                            )}

                            {/* Retícula indigo (var(--primary) — NO scanner-green) + barrido.
                                No se dibujan cajas de detección: la API no devuelve
                                coordenadas — el barrido es movimiento ambiental honesto. */}
                            {cameraPhase !== 'denied' && !scanResults && (
                                <div aria-hidden="true" style={{ position: 'absolute', inset: '9%', pointerEvents: 'none' }}>
                                    {_VF_CORNERS.map((c, i) => (
                                        <span key={i} className="qpb-vf-corner" style={{
                                            position: 'absolute', width: 28, height: 28,
                                            borderColor: 'var(--primary)',
                                            animation: reducedMotion ? 'qpb-pulse 2.4s ease-in-out infinite' : 'none',
                                            ...c,
                                        }} />
                                    ))}
                                    {!reducedMotion && (
                                        <span className="qpb-vf-sweep" style={{
                                            position: 'absolute', left: 0, right: 0, height: 2,
                                            background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
                                            boxShadow: '0 0 10px var(--primary)',
                                            animation: 'qpb-vf-sweep 1.6s ease-in-out infinite',
                                        }} />
                                    )}
                                </div>
                            )}

                            {/* Momento de firma: el barrido se asienta en el borde inferior
                                (el borde superior indigo de esta hoja) y la lista de
                                detección "sube" desde ahí — una sola animación continua
                                de escaneo → resultados. */}
                            {scanResults && (
                                <div className="qpb-vf-results-rise" style={{
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
                        </div>

                        {/* Caption de estado. */}
                        {cameraPhase !== 'denied' && !scanResults && (
                            <p role="status" aria-live="polite" style={{
                                margin: 0, textAlign: 'center', color: 'rgba(255,255,255,0.88)', fontSize: '0.88rem',
                            }}>
                                {capturedPreviewUrl
                                    ? (longAnalysis ? 'Todavía analizando — la foto tenía mucho detalle' : 'Analizando…')
                                    : 'Encuadra el interior de tu nevera'}
                            </p>
                        )}

                        {/* Disparador + fallback discreto. */}
                        {showControls && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem' }}>
                                <button type="button" onClick={handleShutter}
                                    disabled={cameraPhase !== 'live'}
                                    aria-label="Tomar foto"
                                    className="qpb-vf-focusable"
                                    style={{
                                        width: 64, height: 64, borderRadius: '50%',
                                        border: '3px solid #fff', background: 'var(--primary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: cameraPhase === 'live' ? 'pointer' : 'not-allowed',
                                        opacity: cameraPhase === 'live' ? 1 : 0.5,
                                    }}>
                                    <Camera size={26} color="#fff" />
                                </button>
                                <button type="button" onClick={handleFallbackToFile}
                                    className="qpb-vf-focusable"
                                    style={{
                                        background: 'none', border: 'none', color: 'rgba(255,255,255,0.78)',
                                        fontSize: '0.82rem', textDecoration: 'underline', cursor: 'pointer',
                                        padding: '0.25rem',
                                    }}>
                                    Subir una foto en su lugar
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
