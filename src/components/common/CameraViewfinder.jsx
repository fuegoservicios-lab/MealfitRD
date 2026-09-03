// [P1-SCANNER-SHARED · 2026-08-10] Visor de cámara en vivo, SSOT.
//
// POR QUÉ EXISTE: el escáner de la Nevera ya abría un visor in-app con retícula y
// barrido, mientras que el de comida («Escanear comida») delegaba en la cámara del
// sistema con `<input capture>`. Dos escáneres de la misma app, uno con cara de
// producto y otro con cara de formulario. El dueño pidió que el de comida se vea
// «como un escáner profesional» en el móvil.
//
// La respuesta correcta NO era copiar 200 líneas al segundo sitio: este repo ya
// castiga el drift (`test_p1_pantry_dash_parity` existe justo para que el flujo del
// escáner viva en UN archivo). Así que el visor se extrae aquí y lo consumen los
// dos. Lo que se mueve se mueve con sus comentarios: cada uno documenta un bug real
// que costó encontrar.
//
// LO QUE ESTE COMPONENTE POSEE: el ciclo de vida de la cámara, la retícula, el
// disparador y la foto congelada. Lo que NO: qué se hace con la foto — eso lo
// decide el caller vía `onCapture`, porque la Nevera y el diario van a endpoints
// distintos y muestran resultados distintos.
//
// LIFECYCLE DE TRACKS (bug clásico: la luz de la cámara se queda prendida si se
// olvida un `.stop()`). `stopStream()` para TODO track y se invoca en:
//   1. cleanup del effect que adquiere `getUserMedia` — cubre CIERRE (isOpen→false)
//      Y UNMOUNT del componente (mismo cleanup de React).
//   2. justo tras capturar el frame — ya no hace falta el feed en vivo mientras la
//      IA analiza la foto congelada.
//   3. rama `cancelled` dentro de la promesa — cierra el stream si el visor se
//      cerró ANTES de que el browser resolviera el permiso (evita una fuga si el
//      usuario cierra rapidísimo).
//
// iOS SAFARI: el <video> necesita `muted` (y `playsinline`) como CONTENT ATTRIBUTE
// —no solo como prop de React, que solo escribe la property— o el autoplay queda
// bloqueado en silencio. Mismo bug que P1-HERO-ORB-AUTOPLAY-MOBILE (2026-07-11).
import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Camera, Loader2, X } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useT } from '../../i18n';

// Captura el frame actual del <video> a un <canvas> en sus dimensiones REALES
// (video.videoWidth/videoHeight — nunca el tamaño CSS del elemento). Produce el
// `file` que el caller manda a su endpoint y el `previewUrl` del freeze-frame.
export const captureVideoFrame = (video, fileName = 'captura.jpg') => new Promise((resolve, reject) => {
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
            resolve({ file: new File([blob], fileName, { type: 'image/jpeg' }), previewUrl });
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
 * @param {boolean}  isOpen
 * @param {string}   title            — encabezado del visor.
 * @param {string}   hint             — qué encuadrar («Encuadra tu plato completo»).
 * @param {boolean}  busy             — el caller está analizando la foto capturada.
 * @param {string}   [busyHint]       — caption mientras analiza (null ⇒ el default traducido).
 * @param {string}   [busyHintLong]   — caption tras ~6s (la espera larga necesita explicación).
 * @param {string}   [fileName]       — nombre del File que se entrega en onCapture.
 * @param {Function} onCapture        — (file, previewUrl) => void. El caller decide qué hacer.
 * @param {Function} onClose
 * @param {Function} [onFallbackToFile] — si falta, no se ofrece la salida a galería.
 * @param {boolean}  [hideReticle]    — el caller ya muestra resultados sobre el marco.
 * @param {node}     [children]       — overlay dentro del marco (lista de detecciones, etc.).
 */
// [P1-I18N-DASHBOARD · 2026-08-15] Los defaults de `busyHint`/`busyHintLong` se
// resuelven DENTRO del cuerpo (no en la firma): un default de parámetro no puede
// llamar al hook, y el hook es lo que suscribe el componente al cambio de idioma.
export default function CameraViewfinder({
    isOpen,
    title,
    hint,
    busy = false,
    busyHint = null,
    busyHintLong = null,
    fileName = 'captura.jpg',
    onCapture,
    onClose,
    onFallbackToFile = null,
    hideReticle = false,
    children = null,
}) {
    const t = useT();
    // phase: 'starting' | 'live' | 'denied'
    const [phase, setPhase] = useState('starting');
    const [capturedPreviewUrl, setCapturedPreviewUrl] = useState(null);
    const [longBusy, setLongBusy] = useState(false);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    const { containerRef } = useModalAccessibility({ isOpen, onClose });

    // Adquiere la cámara al abrir; el cleanup cubre CIERRE + UNMOUNT.
    useEffect(() => {
        if (!isOpen) return undefined;
        let cancelled = false;
        setPhase('starting');
        setCapturedPreviewUrl(null);
        setLongBusy(false);

        if (!navigator.mediaDevices?.getUserMedia) {
            setPhase('denied');
            return undefined;
        }

        // [P1-SCAN-CAPTURE-RES · 2026-08-10] La resolución se PIDE. Sin pedirla, el
        // navegador entrega su default —VGA, 640x480— y eso es lo que llevaba meses
        // saliendo: los logs de producción mostraban `original_wh=(480, 640)` en TODOS
        // los scans, con `resized=False` porque ya cabían de sobra bajo el tope de
        // 1024px del servidor. O sea: teléfonos de 12 megapíxeles mandando 0,3, y el
        // resize —escrito para ahorrar— nunca llegaba a actuar.
        //
        // Eso explica mejor que ningún modelo por qué la visión no distinguía un pan
        // de agua de uno de hot dog: no es que razonara poco, es que miraba una foto
        // de 0,3 MP. Antes de pagar un modelo más caro o el doble de espera, hay que
        // dejar de mandarle una imagen borrosa.
        //
        // `ideal` y no `exact`: un dispositivo que no llegue a 1920 entrega lo que
        // pueda en vez de fallar la cámara entera. El coste sigue acotado aguas abajo
        // — el caller recorta antes de subir — así que cambia la nitidez, no el peso.
        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            },
            audio: false,
        }).then((stream) => {
            if (cancelled) {
                // El visor se cerró mientras esperábamos el permiso — no dejar el
                // stream vivo (exit path #3 del lifecycle).
                stream.getTracks().forEach((t) => t.stop());
                return;
            }
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                const p = videoRef.current.play?.();
                if (p?.catch) p.catch(() => { /* autoplay policy — el usuario ya ve el visor */ });
            }
            setPhase('live');
        }).catch((err) => {
            if (cancelled) return;
            console.error('CameraViewfinder:', err);
            setPhase('denied');
        });

        return () => {
            cancelled = true;
            stopStream();
        };
    }, [isOpen, stopStream]);

    // iOS Safari: atributos de contenido, no solo props (ver cabecera).
    useEffect(() => {
        const el = videoRef.current;
        if (!el || phase !== 'live') return;
        el.muted = true;
        el.defaultMuted = true;
        el.setAttribute('muted', '');
        el.setAttribute('playsinline', '');
    }, [phase]);

    // Caption "todavía analizando" tras ~6s: una espera muda se lee como app colgada.
    useEffect(() => {
        if (!(isOpen && capturedPreviewUrl && busy)) {
            setLongBusy(false);
            return undefined;
        }
        // [P1-I18N-DASHBOARD · 2026-08-15] `timer`, no `t`: `t` es ahora el
        // traductor del componente y este local lo tapaba dentro del efecto.
        const timer = setTimeout(() => setLongBusy(true), 6000);
        return () => clearTimeout(timer);
    }, [isOpen, capturedPreviewUrl, busy]);

    if (!isOpen) return null;

    const handleShutter = async () => {
        if (phase !== 'live' || !videoRef.current || capturedPreviewUrl) return;
        try {
            const { file, previewUrl } = await captureVideoFrame(videoRef.current, fileName);
            setCapturedPreviewUrl(previewUrl);
            stopStream();   // exit path #2: el feed ya no hace falta
            onCapture?.(file, previewUrl);
        } catch (e) {
            console.error('CameraViewfinder shutter:', e);
            setPhase('denied');
        }
    };

    const showControls = !capturedPreviewUrl && phase !== 'denied';

    return (
        <div style={{
            // 1200 y no 1000: el visor puede abrirse DESDE otro modal (el de
            // «Escanear comida» ya ocupa 1000). A igualdad de z-index solo
            // desempata el orden del DOM, y confiar en eso es frágil — el mismo
            // modo de fallo que P1-MODAL-ABOVE-HEADER.
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(15, 23, 42, 0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
        }}>
            <style>{`
                @keyframes mfvf-spin { to { transform: rotate(360deg); } }
                @keyframes mfvf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
                /* Barrido: una línea top→bottom en loop ~1.6s. Se usa "top" (no
                   transform) porque el % de "top" es relativo al contenedor
                   posicionado — transform: translateY(%) sería relativo a la altura
                   de la propia barra (2px), no a la del marco. */
                @keyframes mfvf-sweep {
                    0%   { top: 0%;   opacity: 0; }
                    10%  { opacity: 1; }
                    90%  { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .mfvf-focusable:focus-visible {
                    outline: 3px solid var(--primary);
                    outline-offset: 2px;
                }
            `}</style>
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="mfvf-title"
                tabIndex={-1}
                style={{
                    width: '100%', maxWidth: '460px', maxHeight: '95vh',
                    display: 'flex', flexDirection: 'column', gap: '0.85rem',
                    outline: 'none',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 id="mfvf-title" style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#fff' }}>
                        {title}
                    </h2>
                    <button type="button" onClick={onClose} aria-label={t('Cerrar')}
                        className="mfvf-focusable ui-close">
                        <X size={20} strokeWidth={2.25} aria-hidden="true" />
                    </button>
                </div>

                {/* Marco: video en vivo o foto congelada + retícula + barrido. */}
                <div style={{
                    position: 'relative', width: '100%', aspectRatio: '3 / 4', maxHeight: '68vh',
                    borderRadius: '1.1rem', overflow: 'hidden', background: '#000',
                }}>
                    {!capturedPreviewUrl && phase !== 'denied' && (
                        <video
                            ref={videoRef}
                            muted
                            playsInline
                            autoPlay
                            aria-hidden="true"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                    )}

                    {capturedPreviewUrl && (
                        <img src={capturedPreviewUrl} alt={t('Foto capturada')}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    )}

                    {phase === 'starting' && !capturedPreviewUrl && (
                        <div style={{
                            position: 'absolute', inset: 0, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Loader2 size={26} color="rgba(255,255,255,0.75)"
                                style={{ animation: 'mfvf-spin 1s linear infinite' }} />
                        </div>
                    )}

                    {phase === 'denied' && (
                        <div style={{
                            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: '1rem',
                            padding: '1.75rem', textAlign: 'center',
                        }}>
                            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem' }}>
                                {t('No pudimos abrir la cámara.')}
                                {onFallbackToFile ? ` ${t('Puedes subir una foto en su lugar.')}` : ''}
                            </span>
                            {onFallbackToFile && (
                                <button type="button" onClick={onFallbackToFile}
                                    className="mfvf-focusable"
                                    style={{
                                        padding: '0.6rem 1.1rem', borderRadius: '99px', border: 'none',
                                        background: 'var(--primary)', color: '#fff', fontWeight: 700,
                                        cursor: 'pointer',
                                    }}>
                                    {t('Subir una foto en su lugar')}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Retícula indigo (var(--primary) — NO scanner-green) + barrido.
                        No se dibujan cajas de detección: la API no devuelve coordenadas
                        — el barrido es movimiento ambiental honesto. */}
                    {phase !== 'denied' && !hideReticle && (
                        <div aria-hidden="true" style={{ position: 'absolute', inset: '9%', pointerEvents: 'none' }}>
                            {/* Las clases no pintan nada: son el ancla por la que los
                                tests distinguen retícula de barrido. Sin ellas, un
                                renombre de animación pasaría sin que nada avisara. */}
                            {_VF_CORNERS.map((c, i) => (
                                <span key={i} className="mfvf-corner" style={{
                                    position: 'absolute', width: 28, height: 28,
                                    borderColor: 'var(--primary)',
                                    animation: reducedMotion ? 'mfvf-pulse 2.4s ease-in-out infinite' : 'none',
                                    ...c,
                                }} />
                            ))}
                            {!reducedMotion && (
                                <span className="mfvf-sweep" style={{
                                    position: 'absolute', left: 0, right: 0, height: 2,
                                    background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
                                    boxShadow: '0 0 10px var(--primary)',
                                    animation: 'mfvf-sweep 1.6s ease-in-out infinite',
                                }} />
                            )}
                        </div>
                    )}

                    {children}
                </div>

                {/* Caption de estado. */}
                {phase !== 'denied' && !hideReticle && (
                    <p role="status" aria-live="polite" style={{
                        margin: 0, textAlign: 'center', color: 'rgba(255,255,255,0.88)', fontSize: '0.88rem',
                    }}>
                        {capturedPreviewUrl
                            ? (longBusy
                                ? (busyHintLong ?? t('Todavía analizando — la foto tenía mucho detalle'))
                                : (busyHint ?? t('Analizando…')))
                            : hint}
                    </p>
                )}

                {/* Disparador + fallback discreto. */}
                {showControls && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem' }}>
                        <button type="button" onClick={handleShutter}
                            disabled={phase !== 'live'}
                            aria-label={t('Tomar foto')}
                            className="mfvf-focusable"
                            style={{
                                width: 64, height: 64, borderRadius: '50%',
                                border: '3px solid #fff', background: 'var(--primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: phase === 'live' ? 'pointer' : 'not-allowed',
                                opacity: phase === 'live' ? 1 : 0.5,
                            }}>
                            <Camera size={26} color="#fff" />
                        </button>
                        {onFallbackToFile && (
                            <button type="button" onClick={onFallbackToFile}
                                className="mfvf-focusable"
                                style={{
                                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.78)',
                                    fontSize: '0.82rem', textDecoration: 'underline', cursor: 'pointer',
                                    padding: '0.25rem',
                                }}>
                                {t('Subir una foto en su lugar')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

CameraViewfinder.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    title: PropTypes.string.isRequired,
    hint: PropTypes.string.isRequired,
    busy: PropTypes.bool,
    busyHint: PropTypes.string,
    busyHintLong: PropTypes.string,
    fileName: PropTypes.string,
    onCapture: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onFallbackToFile: PropTypes.func,
    hideReticle: PropTypes.bool,
    children: PropTypes.node,
};
