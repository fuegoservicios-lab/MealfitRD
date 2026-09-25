// [P1-COMPARTIR-DIA · 2026-09-23] «Compartir tu día»: la imagen se dibuja al ABRIR (navigator.share exige el gesto
// vivo: al tocar «Compartir» no se espera nada), el interruptor «Incluir lo que comí» nace apagado (privacidad) y
// siempre hay una salida: WhatsApp por enlace y copiar el texto, que es lo que funciona en la WebView de Android.
//
// La hoja es la de «Registrar comida» (LogMealModal): portal a <body>, fondo que cierra, `useModalAccessibility`
// y, en el teléfono, hoja inferior con cabecera y pie fijos que se cierra deslizando (`useBottomSheet`). Las
// acciones van en el pie: con la vista previa alta, en un teléfono pequeño no se pierden bajo el pliegue.
//
// [P1-COMPARTIR-DIA-PASADO · 2026-09-24] Dos puertas: la tarjeta de hoy (su snapshot en `consumed`, sin `fecha`: hoy) y
// el Diario de días anteriores, que manda el día que se mira TAL CUAL lo devuelve el endpoint (`diario`) y su `fecha`;
// entonces la cabecera la dice bajo el título, porque en el teléfono la hoja tapa la del cajón y la imagen la lleva en
// letra pequeña. `diario` se adapta aquí (`consumidoDelDiario`) y no en el cajón: así `compartirDia.js` sigue en este
// trozo perezoso y no en el del panel, que el precache del apex descarga siempre.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X, Share2, Copy, Download, MessageCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { isNativeApp } from '../../config/platform';
import { useT } from '../../i18n';
import { resumenDelDia, textoDelDia, fechaLarga, consumidoDelDiario, urlWhatsApp, archivoDeImagen, puedeCompartirImagen, puedeCompartirTexto, compartir } from '../../utils/compartirDia';
import { dibujarTarjetaDelDia } from '../../utils/tarjetaDelDia';
import { useAssessment } from '../../context/AssessmentContext';
import { nombreDeRegistro } from '../../utils/nombreDeRegistro';
import styles from './ShareDaySheet.module.css';

const ShareDaySheet = ({ onClose, consumed = null, diario = null, metas, microMetas = null, fecha = null }) => {
    const t = useT();
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose });
    const bodyRef = useRef(null);
    const hoja = useBottomSheet({ containerRef, bodyRef, onClose });
    const [incluirComidas, setIncluirComidas] = useState(false);
    // `para`: el resumen con el que se dibujó. «Dibujando» se DERIVA (el resumen vigente aún no tiene imagen) en vez
    // de marcarse con un setState síncrono en el efecto (react-hooks/set-state-in-effect, con techo en lint-count).
    const [imagen, setImagen] = useState({ blob: null, url: null, para: null });

    // La tarjeta pasa `metas` como objeto literal, nuevo en CADA render suyo: se fija por sus cuatro números, o
    // cualquier re-render del panel con la hoja abierta y los mismos datos redibujaría la imagen y apagaría
    // «Compartir» mientras tanto. (Si cambia `consumed` —un refetch— sí se redibuja: puede traer otra comida.)
    const { calories, protein, carbs, fats } = metas || {};
    const metasDelDia = useMemo(() => ({ calories, protein, carbs, fats }), [calories, protein, carbs, fats]);
    // [P1-COMPARTIR-DIA-PASADO] El día también se fija por su VALOR (el instante), no por la referencia: un
    // `new Date()` nuevo en cada render del padre redibujaría la imagen sin parar. Sin `fecha`, hoy.
    const instante = fecha instanceof Date ? fecha.getTime() : NaN;
    const conFecha = Number.isFinite(instante);
    const fechaDelDia = useMemo(() => (Number.isFinite(instante) ? new Date(instante) : new Date()), [instante]);
    const delDia = useMemo(() => consumed || consumidoDelDiario(diario), [consumed, diario]);

    // [P1-PLAN-LOTE-224 · 2026-09-24] Los nombres de lo comido, en el idioma del usuario (utils/nombreDeRegistro.js).
    // Estable (useCallback): una función nueva en cada render redibujaría la imagen sin parar.
    const { planData } = useAssessment() || {};
    const nombrar = useCallback((n) => nombreDeRegistro(n, planData, t), [planData, t]);
    const resumen = useMemo(
        () => resumenDelDia({ consumed: delDia, metas: metasDelDia, microMetas, incluirComidas, fecha: fechaDelDia, nombrar }),
        [delDia, metasDelDia, microMetas, incluirComidas, fechaDelDia, nombrar],
    );
    const texto = useMemo(() => textoDelDia(resumen), [resumen]);

    useEffect(() => {
        let vivo = true;
        dibujarTarjetaDelDia(resumen).then((blob) => {
            if (!vivo) return;
            setImagen({ blob, url: blob ? URL.createObjectURL(blob) : null, para: resumen });
        }).catch(() => { if (vivo) setImagen({ blob: null, url: null, para: resumen }); });
        return () => { vivo = false; };
    }, [resumen]);

    // La URL en pantalla se revoca cuando otra YA la sustituyó (la limpieza de este efecto corre tras el commit de la
    // nueva) o al cerrar la hoja; antes se revocaba al EMPEZAR cada redibujo, con la imagen vieja aún en el <img>.
    useEffect(() => {
        const url = imagen.url;
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [imagen.url]);

    const archivo = useMemo(() => archivoDeImagen(imagen.blob), [imagen.blob]);
    const conImagen = puedeCompartirImagen(archivo);
    const hojaDelSistema = conImagen || puedeCompartirTexto();
    const puedeDescargar = !isNativeApp() && !conImagen && !!imagen.blob;
    // Mientras se redibuja (al cambiar «Incluir lo que comí») se sigue viendo la imagen anterior, pero no se comparte
    // ni se descarga: saldría la versión vieja.
    const dibujando = imagen.para !== resumen;

    // Un segundo toque mientras la hoja del sistema se abre hace que `navigator.share` rechace (InvalidStateError) y
    // saldría un «no dejó compartir» falso: se ignora. La marca se pone DESPUÉS de llamar a `compartir`, que invoca
    // `navigator.share` sin esperar nada antes (el gesto del usuario sigue vivo); el botón queda apagado mientras tanto.
    const compartiendoRef = useRef(false);
    const [compartiendo, setCompartiendo] = useState(false);
    const onCompartir = useCallback(async () => {
        if (compartiendoRef.current) return;
        const enCurso = compartir({ archivo, texto });
        compartiendoRef.current = true;
        setCompartiendo(true);
        try {
            const r = await enCurso;
            if (r === 'fallo') toast.error(t('Tu dispositivo no dejó compartir. Usa WhatsApp o copia el texto.'), { id: 'share-day-share' });
        } finally {
            compartiendoRef.current = false;
            setCompartiendo(false);
        }
    }, [archivo, texto, t]);

    // Con `id` (P2-TOAST-POLICY): copiar tres veces reemplaza el aviso en vez de apilar tres.
    const onCopiar = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(texto);
            toast.success(t('Texto copiado: pégalo en tu chat.'), { id: 'share-day-copy' });
        } catch {
            toast.error(t('No se pudo copiar el texto.'), { id: 'share-day-copy' });
        }
    }, [texto, t]);

    const onDescargar = useCallback(() => {
        if (!imagen.url) return;
        const a = document.createElement('a');
        a.href = imagen.url;
        a.download = 'mi-dia-bioboros.png';
        document.body.appendChild(a); a.click(); a.remove();
    }, [imagen.url]);

    const cuerpo = (
        <div className={styles.overlay}>
            <button type="button" className={styles.backdrop} aria-hidden="true" tabIndex={-1} onClick={onClose} />
            <div
                ref={containerRef}
                className={styles.sheet}
                role="dialog"
                aria-modal="true"
                aria-labelledby="share-day-title"
                aria-describedby={conFecha ? 'share-day-fecha' : undefined}
                tabIndex={-1}
                onTouchStart={hoja.onTouchStart}
                onTouchMove={hoja.onTouchMove}
                onTouchEnd={hoja.onTouchEnd}
                onTouchCancel={hoja.onTouchEnd}
            >
                <div className={styles.head}>
                    <span className={styles.grip} aria-hidden="true" />
                    <div className={styles.headRow}>
                        <div className={styles.headText}>
                            <h2 id="share-day-title" className={styles.title}>{t('Compartir tu día')}</h2>
                            {conFecha && <p id="share-day-fecha" className={styles.fecha}>{fechaLarga(fechaDelDia)}</p>}
                        </div>
                        <button type="button" className={`${styles.close} ui-close`} onClick={onClose} aria-label={t('Cerrar')}>
                            <X size={20} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div ref={bodyRef} className={styles.body}>
                    <div className={styles.preview} aria-busy={dibujando}>
                        {imagen.url
                            ? <img src={imagen.url} alt={t('Mi día: calorías, macros y micros')} className={styles.img} />
                            : dibujando
                                ? <Loader2 size={28} className="spin-animation" role="img" aria-label={t('Preparando la imagen…')} />
                                : <pre className={styles.textoPlano}>{texto}</pre>}
                    </div>
                </div>

                <div className={styles.footer}>
                    <label className={styles.toggle}>
                        <input type="checkbox" checked={incluirComidas} onChange={(e) => setIncluirComidas(e.target.checked)} />
                        <span>{t('Incluir lo que comí')}</span>
                    </label>
                    <div className={styles.actions}>
                        {hojaDelSistema && (
                            <button type="button" className={styles.primary} onClick={onCompartir} disabled={dibujando || compartiendo}>
                                <Share2 size={18} aria-hidden="true" />{t('Compartir')}
                            </button>
                        )}
                        <a className={styles.whatsapp} href={urlWhatsApp(texto)} target="_blank" rel="noopener noreferrer">
                            <MessageCircle size={18} aria-hidden="true" />{t('WhatsApp')}
                        </a>
                        <button type="button" className={styles.secondary} onClick={onCopiar}>
                            <Copy size={18} aria-hidden="true" />{t('Copiar texto')}
                        </button>
                        {puedeDescargar && (
                            <button type="button" className={styles.secondary} onClick={onDescargar} disabled={dibujando}>
                                <Download size={18} aria-hidden="true" />{t('Descargar imagen')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    // Portal a <body>: el panel vive bajo `isolation: isolate` (z-scale) y un modal montado dentro no le gana a nada
    // de fuera por número (mismo porqué que LogMealModal).
    return typeof document === 'undefined' ? null : createPortal(cuerpo, document.body);
};

ShareDaySheet.propTypes = {
    onClose: PropTypes.func.isRequired,
    // uno de los dos: el snapshot de la tarjeta de hoy, o el día del Diario tal cual (`{meals, totals}` del endpoint)
    consumed: PropTypes.object,
    diario: PropTypes.shape({ meals: PropTypes.array, totals: PropTypes.object }),
    metas: PropTypes.object.isRequired,
    microMetas: PropTypes.object,
    // [P1-COMPARTIR-DIA-PASADO] el día que se comparte (desde el Diario); sin ella, hoy
    fecha: PropTypes.instanceOf(Date),
};

export default ShareDaySheet;
