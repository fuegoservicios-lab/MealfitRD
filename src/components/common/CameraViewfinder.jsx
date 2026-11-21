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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { CameraOff, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useT } from '../../i18n';
import { nativePlatform } from '../../config/platform';
import { startCameraCanvasPreview } from '../../utils/cameraCanvasPreview';
import Button from '../ui/Button';
import styles from './CameraViewfinder.module.css';

// Captura el frame actual del <video> a un <canvas> en sus dimensiones REALES
// (video.videoWidth/videoHeight — nunca el tamaño CSS del elemento). Produce el
// `file` que el caller manda a su endpoint y el `previewUrl` del freeze-frame.
const captureVideoFrame = (video, fileName = 'captura.jpg') => new Promise((resolve, reject) => {
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
    { top: 0, left: 0, borderTopStyle: 'solid', borderLeftStyle: 'solid', borderTopLeftRadius: 'var(--radius-lg)' },
    { top: 0, right: 0, borderTopStyle: 'solid', borderRightStyle: 'solid', borderTopRightRadius: 'var(--radius-lg)' },
    { bottom: 0, left: 0, borderBottomStyle: 'solid', borderLeftStyle: 'solid', borderBottomLeftRadius: 'var(--radius-lg)' },
    { bottom: 0, right: 0, borderBottomStyle: 'solid', borderRightStyle: 'solid', borderBottomRightRadius: 'var(--radius-lg)' },
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
    const frameRef = useRef(null);
    const previewCanvasRef = useRef(null);
    const [canvasReady, setCanvasReady] = useState(false);
    const [canvasFailed, setCanvasFailed] = useState(false);
    const useCanvasPreview = nativePlatform() === 'ios' && !canvasFailed;
    const [videoBounds, setVideoBounds] = useState(null);
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

    useEffect(() => {
        if (!isOpen || phase !== 'live' || capturedPreviewUrl || !useCanvasPreview) return undefined;
        const video = videoRef.current;
        const canvas = previewCanvasRef.current;
        const frame = frameRef.current;
        if (!video || !canvas || !frame) return undefined;
        return startCameraCanvasPreview(video, canvas, frame, {
            onFirstFrame: () => setCanvasReady(true),
            onError: (error) => {
                console.error('CameraViewfinder preview:', error);
                setCanvasFailed(true);
            },
        });
    }, [isOpen, phase, capturedPreviewUrl, useCanvasPreview]);

    // Tamaño explícito con la proporción REAL del vídeo: evita depender del
    // object-fit del compositor de cámara de iOS dentro de un marco flexible.
    useLayoutEffect(() => {
        if (!isOpen || capturedPreviewUrl) return undefined;
        const frame = frameRef.current;
        const video = videoRef.current;
        if (!frame || !video) return undefined;
        const fitVideo = () => {
            const { videoWidth, videoHeight } = video;
            const { width: frameWidth, height: frameHeight } = frame.getBoundingClientRect();
            if (!videoWidth || !videoHeight || !frameWidth || !frameHeight) return;
            // Un píxel de cobertura evita líneas negras por el redondeo de WebKit.
            const scale = Math.max((frameWidth + 1) / videoWidth, (frameHeight + 1) / videoHeight);
            const width = videoWidth * scale;
            const height = videoHeight * scale;
            setVideoBounds((prev) => prev?.width === width && prev?.height === height ? prev : { width, height });
        };
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fitVideo) : null;
        observer?.observe(frame);
        video.addEventListener('loadeddata', fitVideo);
        video.addEventListener('resize', fitVideo);
        window.addEventListener('resize', fitVideo);
        fitVideo();
        return () => {
            observer?.disconnect();
            video.removeEventListener('loadeddata', fitVideo);
            video.removeEventListener('resize', fitVideo);
            window.removeEventListener('resize', fitVideo);
        };
    }, [isOpen, capturedPreviewUrl, phase]);

    // Adquiere la cámara al abrir; el cleanup cubre CIERRE + UNMOUNT.
    useEffect(() => {
        if (!isOpen) return undefined;
        let cancelled = false;
        let detachVideoEvents = () => {};
        setPhase('starting');
        setCapturedPreviewUrl(null);
        setLongBusy(false);
        setCanvasReady(false);
        setCanvasFailed(false);

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
            const video = videoRef.current;
            if (!video) { stopStream(); return; }
            // El permiso puede llegar antes que las dimensiones y el primer frame.
            // Mantener el cargador evita mostrar el ajuste inicial del encuadre.
            const markReady = () => {
                if (!cancelled && streamRef.current === stream
                    && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                    setPhase('live');
                }
            };
            video.addEventListener('loadeddata', markReady);
            video.addEventListener('playing', markReady);
            detachVideoEvents = () => {
                video.removeEventListener('loadeddata', markReady);
                video.removeEventListener('playing', markReady);
            };
            // iOS necesita los atributos ANTES de conectar y reproducir el stream.
            video.muted = true;
            video.defaultMuted = true;
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            video.srcObject = stream;
            const p = video.play?.();
            p?.then(markReady).catch(() => {
                if (cancelled) return;
                stopStream();
                setPhase('denied');
            });
            markReady();
        }).catch((err) => {
            if (cancelled) return;
            console.error('CameraViewfinder:', err);
            stopStream();
            setPhase('denied');
        });

        return () => {
            cancelled = true;
            detachVideoEvents();
            stopStream();
        };
    }, [isOpen, stopStream]);

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

    // Una página animada/transformada no debe convertirse en el viewport del visor.
    // [P1-PLAN-LOTE-1153 · 2026-11-21] «Mejora el diseño de esto» (el dueño, con el visor abierto). Era una tarjeta
    // 3:4 dentro de un fondo azul, con el disparador y un enlace subrayado debajo: un formulario con un vídeo dentro.
    // Ahora es la cámara del teléfono: la imagen a pantalla completa, una guía cuadrada para el plato con el resto
    // oscurecido, la cabecera y los controles flotando sobre degradados, un obturador de cámara de verdad y la
    // galería como botón redondo a su lado. La lógica de la cámara (adquirir, encajar, capturar, soltar) no cambia.
    return createPortal(
        <div className={styles.fondo}>
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
                className={styles.visor}>

                {/* Marco: video en vivo o foto congelada + guía + barrido, a pantalla completa. */}
                <div ref={frameRef} className={styles.marco}>
                    {!capturedPreviewUrl && phase !== 'denied' && (
                        <video
                            ref={videoRef}
                            muted
                            playsInline
                            autoPlay
                            aria-hidden="true"
                            className={styles.video}
                            style={{
                                width: videoBounds?.width ?? '100%', height: videoBounds?.height ?? '100%',
                                visibility: phase === 'live' ? 'visible' : 'hidden',
                                ...(useCanvasPreview ? {
                                    opacity: 0, pointerEvents: 'none',
                                } : {}),
                            }}
                        />
                    )}

                    {useCanvasPreview && !capturedPreviewUrl && phase !== 'denied' && (
                        <canvas ref={previewCanvasRef} aria-hidden="true" className={styles.lienzo}
                            data-listo={canvasReady ? 'si' : 'no'} />
                    )}

                    {capturedPreviewUrl && (
                        <img src={capturedPreviewUrl} alt={t('Foto capturada')} className={styles.foto} />
                    )}

                    {(phase === 'starting' || (phase === 'live' && useCanvasPreview && !canvasReady)) && !capturedPreviewUrl && (
                        <div className={styles.cargando}>
                            <Loader2 size={28} className={styles.girando} aria-hidden="true" />
                        </div>
                    )}

                    {phase === 'denied' && (
                        <div className={styles.denegado}>
                            <span className={styles.denegadoIco} aria-hidden="true"><CameraOff size={28} /></span>
                            <span className={styles.denegadoTxt}>
                                {t('No pudimos abrir la cámara.')}
                                {onFallbackToFile ? ` ${t('Puedes subir una foto en su lugar.')}` : ''}
                            </span>
                            {onFallbackToFile && (
                                <Button variant="primary" size="sm" onClick={onFallbackToFile}
                                    className="mfvf-focusable">
                                    {t('Subir una foto en su lugar')}
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Guía cuadrada (var(--primary-light) — NO scanner-green) + barrido; lo de fuera se oscurece.
                        No se dibujan cajas de detección: la API no devuelve coordenadas — el barrido es movimiento
                        ambiental honesto. */}
                    {phase !== 'denied' && !hideReticle && (
                        <div aria-hidden="true" className={styles.guia} data-congelada={capturedPreviewUrl ? 'si' : 'no'}>
                            {/* Las clases no pintan nada: son el ancla por la que los
                                tests distinguen retícula de barrido. Sin ellas, un
                                renombre de animación pasaría sin que nada avisara. */}
                            {_VF_CORNERS.map((c, i) => (
                                <span key={i} className={`mfvf-corner ${styles.esquina}`} style={{
                                    animation: reducedMotion ? 'mfvf-pulse 2.4s ease-in-out infinite' : 'none',
                                    ...c,
                                }} />
                            ))}
                            {!reducedMotion && (
                                <span className={`mfvf-sweep ${styles.barrido}`} style={{
                                    animation: 'mfvf-sweep 1.6s ease-in-out infinite',
                                }} />
                            )}
                        </div>
                    )}

                    {children}
                </div>

                {/* Cabecera flotante. */}
                <div className={styles.arriba}>
                    <h2 id="mfvf-title" className={styles.titulo}>{title}</h2>
                    <button type="button" onClick={onClose} aria-label={t('Cerrar')}
                        className={`mfvf-focusable ui-close ${styles.redondo}`}>
                        <X size={20} strokeWidth={2.25} aria-hidden="true" />
                    </button>
                </div>

                {/* Pie flotante: qué encuadrar (o «Analizando…») y los controles. */}
                {(showControls || (phase !== 'denied' && !hideReticle)) && (
                    <div className={styles.abajo}>
                        {phase !== 'denied' && !hideReticle && (
                            <p role="status" aria-live="polite" className={styles.pista}>
                                {capturedPreviewUrl
                                    ? (longBusy
                                        ? (busyHintLong ?? t('Todavía analizando — la foto tenía mucho detalle'))
                                        : (busyHint ?? t('Analizando…')))
                                    : hint}
                            </p>
                        )}

                        {showControls && (
                            <div className={styles.controles}>
                                {onFallbackToFile ? (
                                    <button type="button" onClick={onFallbackToFile}
                                        aria-label={t('Subir una foto en su lugar')}
                                        className={`mfvf-focusable ${styles.lateral}`}>
                                        <span className={styles.redondo} aria-hidden="true"><ImageIcon size={22} /></span>
                                        <span className={styles.lateralTxt} aria-hidden="true">{t('Galería')}</span>
                                    </button>
                                ) : <span className={styles.lateral} aria-hidden="true" />}
                                <button type="button" onClick={handleShutter}
                                    disabled={phase !== 'live' || (useCanvasPreview && !canvasReady)}
                                    aria-label={t('Tomar foto')}
                                    className={`mfvf-focusable ${styles.obturador}`}>
                                    <span className={styles.obturadorDisco} aria-hidden="true" />
                                </button>
                                <span className={styles.lateral} aria-hidden="true" />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body,
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
