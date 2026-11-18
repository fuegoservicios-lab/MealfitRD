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
import { X, Share2, Copy, Download, MessageCircle, Loader2, Camera, Images, Image as ImageIcon, Type, RotateCcw } from 'lucide-react';
import { chooseNativeGalleryImage, takeNativeChatPhoto, isNativePickerCancellation } from '../../utils/nativeChatImagePicker';
import BroteChispa from '../common/BroteChispa';   // [P1-PLAN-LOTE-1049] el destello de lucide parecía el logo de Gemini
import { toast } from 'sonner';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { isNativeApp } from '../../config/platform';
import { useT } from '../../i18n';
import { resumenDelDia, textoDelDia, fechaLarga, consumidoDelDiario, urlWhatsApp, archivoDeImagen, puedeCompartirImagen, sabeCompartirImagenes, compartir } from '../../utils/compartirDia';
import { dibujarTarjetaDelDia } from '../../utils/tarjetaDelDia';
import { cargarFoto, cargarFuentes, dibujarHistoriaConFoto, pintarHistoria, moverEncuadre, cajaDeCifras, ENCUADRE_INICIAL, ZOOM_MAX, LIMITES_CIFRAS, ANCHO as ANCHO_HISTORIA, ALTO as ALTO_HISTORIA } from '../../utils/historiaConFoto';
import { BLOQUE_INICIAL, ESCALA_MIN, acotarBloque, moverBloque, imantar, escalaMax, tocaLasCifras, esInicial } from '../../utils/bloqueDeCifras';
import { useAssessment } from '../../context/AssessmentContext';
import { nombreDeRegistro } from '../../utils/nombreDeRegistro';
import { getBiologicalDate } from '../../utils/diaBiologico';
import styles from './ShareDaySheet.module.css';

const ShareDaySheet = ({ onClose, consumed = null, diario = null, metas, microMetas = null, fecha = null }) => {
    const t = useT();
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose });
    const bodyRef = useRef(null);
    const hoja = useBottomSheet({ containerRef, bodyRef, onClose });
    const [incluirComidas, setIncluirComidas] = useState(false);
    // [P1-PLAN-LOTE-300] Publicación 4:5 (chats, feed) o historia 9:16 (estados de WhatsApp, historias de Instagram).
    const [formato, setFormato] = useState('publicacion');
    // `para`: el resumen con el que se dibujó. «Dibujando» se DERIVA (el resumen vigente aún no tiene imagen) en vez
    // de marcarse con un setState síncrono en el efecto (react-hooks/set-state-in-effect, con techo en lint-count).
    const [imagen, setImagen] = useState({ blob: null, url: null, para: null });
    // [P1-PLAN-LOTE-1048] La historia con TU foto (la selfie del espejo de fondo, las cifras encima). La foto se lee y
    // se dibuja en el teléfono: no viaja a ningún servidor. Con foto, el formato es siempre historia (9:16).
    const [foto, setFoto] = useState(null);
    const [estilo, setEstilo] = useState('titular');
    const inputFotoRef = useRef(null);
    const inputCamaraRef = useRef(null);
    // [P1-PLAN-LOTE-1050] «Galería» o «Cámara» con NUESTRO selector (el dueño no quería el menú de tres opciones de iOS:
    // Fototeca / Hacer foto / Seleccionar archivo). En la app nativa, la fototeca del binario (PHPicker directo, sin
    // permiso) y la cámara del plugin; en la web, un <input> por opción (el de la cámara con `capture`).
    const [eligiendo, setEligiendo] = useState(false);
    const pedirFoto = useCallback(() => setEligiendo(true), []);
    const usarFichero = useCallback(async (fichero) => {
        if (!fichero) return;
        const lista = await cargarFoto(fichero);
        if (!lista) { toast.error(t('No se pudo abrir esa foto. Prueba con otra.'), { id: 'share-day-foto' }); return; }
        setEncuadre(ENCUADRE_INICIAL);
        setBloque(BLOQUE_INICIAL);
        setCapa('foto');
        setFoto(lista);
    }, [t]);
    const onElegirFoto = useCallback(async (e) => {
        const fichero = e.target.files?.[0];
        e.target.value = '';                       // elegir la MISMA foto otra vez también dispara `change`
        await usarFichero(fichero);
    }, [usarFichero]);
    const desdeNativo = useCallback(async (abrir) => {
        try {
            await usarFichero(await abrir());
        } catch (err) {
            if (!isNativePickerCancellation(err)) toast.error(t('No pudimos abrir tus fotos. Revisa los permisos e inténtalo de nuevo.'), { id: 'share-day-foto' });
        }
    }, [usarFichero, t]);
    // El <input> se abre SIN esperar nada antes: el navegador solo abre el selector dentro del toque.
    const elegirDeGaleria = useCallback(() => {
        setEligiendo(false);
        if (isNativeApp()) { void desdeNativo(() => chooseNativeGalleryImage()); return; }
        inputFotoRef.current?.click();
    }, [desdeNativo]);
    const hacerFoto = useCallback(() => {
        setEligiendo(false);
        if (isNativeApp()) { void desdeNativo(async () => (await takeNativeChatPhoto({ lado: 2400 }))?.[0]); return; }
        inputCamaraRef.current?.click();
    }, [desdeNativo]);
    // [P1-PLAN-LOTE-1048 · encuadre] La selfie se mueve con el dedo y se acerca pellizcando (o con el deslizador): la
    // vista previa es un lienzo que se repinta en vivo; el JPEG que se comparte se rehace cuando el dedo se para.
    const [encuadre, setEncuadre] = useState(ENCUADRE_INICIAL);
    // [P1-PLAN-LOTE-1078] Las cifras son un sticker: se arrastran y se pellizcan como la foto. El gesto mueve lo que
    // TOCASTE (las cifras o la foto); el deslizador, la capa elegida en «Foto · Tus cifras».
    const [bloque, setBloque] = useState(BLOQUE_INICIAL);
    const [capa, setCapa] = useState('foto');
    const [guiaVisible, setGuiaVisible] = useState(false);
    const gesto = useRef({ capa: 'foto', crudo: BLOQUE_INICIAL });
    const guiaTope = useRef(null);
    const [fuentesListas, setFuentesListas] = useState(false);
    const lienzoRef = useRef(null);
    const punteros = useRef(new Map());
    useEffect(() => {
        let vivo = true;
        cargarFuentes().then(() => { if (vivo) setFuentesListas(true); });
        return () => { vivo = false; };
    }, []);

    // La tarjeta pasa `metas` como objeto literal, nuevo en CADA render suyo: se fija por sus cuatro números, o
    // cualquier re-render del panel con la hoja abierta y los mismos datos redibujaría la imagen y apagaría
    // «Compartir» mientras tanto. (Si cambia `consumed` —un refetch— sí se redibuja: puede traer otra comida.)
    const { calories, protein, carbs, fats } = metas || {};
    const metasDelDia = useMemo(() => ({ calories, protein, carbs, fats }), [calories, protein, carbs, fats]);
    // [P1-COMPARTIR-DIA-PASADO] El día también se fija por su VALOR (el instante), no por la referencia: un
    // `new Date()` nuevo en cada render del padre redibujaría la imagen sin parar. Sin `fecha`, hoy.
    const instante = fecha instanceof Date ? fecha.getTime() : NaN;
    const conFecha = Number.isFinite(instante);
    const fechaDelDia = useMemo(() => (Number.isFinite(instante) ? new Date(instante) : getBiologicalDate(new Date())), [instante]);
    const delDia = useMemo(() => consumed || consumidoDelDiario(diario), [consumed, diario]);

    // [P1-PLAN-LOTE-225 · 2026-09-24] Los nombres de lo comido, en el idioma del usuario (utils/nombreDeRegistro.js).
    // Estable (useCallback): una función nueva en cada render redibujaría la imagen sin parar.
    const { planData } = useAssessment() || {};
    const nombrar = useCallback((n) => nombreDeRegistro(n, planData, t), [planData, t]);
    const resumen = useMemo(
        () => resumenDelDia({ consumed: delDia, metas: metasDelDia, microMetas, incluirComidas, fecha: fechaDelDia, nombrar }),
        [delDia, metasDelDia, microMetas, incluirComidas, fechaDelDia, nombrar],
    );
    const texto = useMemo(() => textoDelDia(resumen), [resumen]);
    const caja = useMemo(() => cajaDeCifras(resumen, estilo), [resumen, estilo]);
    const escalaTope = useMemo(() => escalaMax(caja, LIMITES_CIFRAS), [caja]);
    const bloqueVisto = useMemo(() => acotarBloque(bloque, caja, LIMITES_CIFRAS), [bloque, caja]);

    useEffect(() => {
        let vivo = true;
        const fijar = (blob) => {
            if (vivo) setImagen({ blob, url: blob ? URL.createObjectURL(blob) : null, para: resumen, formato, foto, estilo, encuadre, bloque });
        };
        // Con foto, el JPEG espera a que el dedo se pare (arrastrar pide decenas de encuadres por segundo). Sin foto, la
        // tarjeta se dibuja en el acto, como siempre.
        if (!foto) {
            dibujarTarjetaDelDia(resumen, { formato }).then(fijar).catch(() => fijar(null));
            return () => { vivo = false; };
        }
        const tope = setTimeout(() => {
            dibujarHistoriaConFoto(resumen, { foto, estilo, encuadre, bloque }).then(fijar).catch(() => fijar(null));
        }, 280);
        return () => { vivo = false; clearTimeout(tope); };
    }, [resumen, formato, foto, estilo, encuadre, bloque]);

    // La vista previa en vivo: un fotograma por cambio.
    useEffect(() => {
        if (!foto) return undefined;
        const guia = guiaVisible ? { centrado: true } : null;
        const id = requestAnimationFrame(() => pintarHistoria(lienzoRef.current, resumen, { foto, estilo, encuadre, bloque, guia }));
        return () => cancelAnimationFrame(id);
    }, [foto, resumen, estilo, encuadre, bloque, guiaVisible, fuentesListas]);
    useEffect(() => () => clearTimeout(guiaTope.current), []);
    // El contorno de las cifras se ve mientras las mueves (y un momento después de soltar el deslizador); nunca en el JPEG.
    const verGuia = useCallback((ms = 0) => {
        clearTimeout(guiaTope.current);
        setGuiaVisible(true);
        if (ms > 0) guiaTope.current = setTimeout(() => setGuiaVisible(false), ms);
    }, []);

    // Las cifras se mueven sobre una posición «cruda» (la del dedo) y lo que se ve es esa posición imantada al centro:
    // imantar lo ya imantado no dejaría salir del centro con un arrastre lento.
    const moverCifras = useCallback((cambio) => {
        const g = gesto.current;
        g.crudo = moverBloque(g.crudo, caja, LIMITES_CIFRAS, cambio);
        setBloque(imantar(g.crudo));
    }, [caja]);

    const onPunteroAbajo = useCallback((e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const p = punteros.current;
        if (p.size === 0) {
            const r = e.currentTarget.getBoundingClientRect();
            const x = r.width > 0 ? (e.clientX - r.left) * (ANCHO_HISTORIA / r.width) : -1;
            const y = r.height > 0 ? (e.clientY - r.top) * (ALTO_HISTORIA / r.height) : -1;
            const sobreCifras = tocaLasCifras(caja, bloqueVisto, x, y);
            gesto.current = { capa: sobreCifras ? 'cifras' : 'foto', crudo: bloqueVisto };
            setCapa(sobreCifras ? 'cifras' : 'foto');
            if (sobreCifras) verGuia();
        }
        p.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }, [caja, bloqueVisto, verGuia]);
    const onPunteroMovido = useCallback((e) => {
        const p = punteros.current;
        const previo = p.get(e.pointerId);
        if (!previo || !foto) return;
        const r = e.currentTarget.getBoundingClientRect();
        const k = r.width > 0 ? ANCHO_HISTORIA / r.width : 1;     // px de pantalla → px del lienzo
        const deCifras = gesto.current.capa === 'cifras';
        if (p.size >= 2) {
            const [a, b] = [...p.entries()].map(([id, v]) => (id === e.pointerId ? { x: e.clientX, y: e.clientY } : v));
            const [a0, b0] = [...p.values()];
            const antes = Math.hypot(a0.x - b0.x, a0.y - b0.y);
            const ahora = Math.hypot(a.x - b.x, a.y - b.y);
            if (antes > 0) {
                if (deCifras) moverCifras({ factor: ahora / antes });
                else setEncuadre((en) => moverEncuadre(en, foto, { factor: ahora / antes }));
            }
        } else {
            const dx = (e.clientX - previo.x) * k;
            const dy = (e.clientY - previo.y) * k;
            if (deCifras) moverCifras({ dx, dy });
            else setEncuadre((en) => moverEncuadre(en, foto, { dx, dy }));
        }
        p.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }, [foto, moverCifras]);
    const onPunteroArriba = useCallback((e) => {
        punteros.current.delete(e.pointerId);
        if (punteros.current.size === 0 && gesto.current.capa === 'cifras') verGuia(700);
    }, [verGuia]);
    const restablecer = useCallback(() => {
        if (capa === 'cifras') { setBloque(BLOQUE_INICIAL); verGuia(700); } else setEncuadre(ENCUADRE_INICIAL);
    }, [capa, verGuia]);
    const sinCambios = capa === 'cifras' ? esInicial(bloqueVisto) : (encuadre.zoom === 1 && encuadre.x === 0 && encuadre.y === 0);
    // El arrastre de la foto no es el gesto de cerrar la hoja (useBottomSheet escucha el toque en el diálogo).
    const pararToque = useCallback((e) => e.stopPropagation(), []);

    // La URL en pantalla se revoca cuando otra YA la sustituyó (la limpieza de este efecto corre tras el commit de la
    // nueva) o al cerrar la hoja; antes se revocaba al EMPEZAR cada redibujo, con la imagen vieja aún en el <img>.
    useEffect(() => {
        const url = imagen.url;
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [imagen.url]);

    const archivo = useMemo(() => archivoDeImagen(imagen.blob), [imagen.blob]);
    const conImagen = puedeCompartirImagen(archivo);
    // [P1-PLAN-LOTE-300] en la app nativa, la hoja del sistema con la IMAGEN (plugins Share + Filesystem)
    // [P1-PLAN-LOTE-386] la imagen es LA forma de compartir: una acción clara y la imagen sola. El texto (WhatsApp por
    // enlace, copiar) queda de reserva donde no se puede compartir la imagen, o si el sistema la rechazó.
    const compartirImagen = sabeCompartirImagenes();
    const [alternativas, setAlternativas] = useState(false);
    const verAlternativas = !compartirImagen || alternativas;
    const puedeDescargar = !isNativeApp() && !conImagen && !!imagen.blob;
    // Mientras se redibuja (al cambiar «Incluir lo que comí») se sigue viendo la imagen anterior, pero no se comparte
    // ni se descarga: saldría la versión vieja.
    const dibujando = imagen.para !== resumen || imagen.formato !== formato || imagen.foto !== foto || imagen.estilo !== estilo || imagen.encuadre !== encuadre || (!!foto && imagen.bloque !== bloque);

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
            if (r === 'fallo') {
                toast.error(t('Tu teléfono no dejó compartir la imagen. Prueba con el texto.'), { id: 'share-day-share' });
                setAlternativas(true);
            }
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
        a.download = imagen.blob?.type === 'image/jpeg' ? 'mi-dia-bioboros.jpg' : 'mi-dia-bioboros.png';
        document.body.appendChild(a); a.click(); a.remove();
    }, [imagen.url, imagen.blob]);

    const cuerpo = (
        <div className={styles.overlay}>
            <button type="button" className={styles.backdrop} aria-hidden="true" tabIndex={-1} onClick={onClose} />
            <div
                ref={containerRef}
                className={foto ? `${styles.sheet} ${styles.sheetFoto}` : styles.sheet}
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
                        {foto ? (
                            <canvas
                                ref={lienzoRef} width={ANCHO_HISTORIA} height={1920}
                                role="img" aria-label={t('Mi día: tu historia con tu foto')}
                                className={`${styles.img} ${styles.lienzo}`}
                                onPointerDown={onPunteroAbajo} onPointerMove={onPunteroMovido}
                                onPointerUp={onPunteroArriba} onPointerCancel={onPunteroArriba}
                                onTouchStart={pararToque} onTouchMove={pararToque} onTouchEnd={pararToque}
                            />
                        ) : imagen.url
                            ? <img src={imagen.url} alt={t('Mi día: calorías, macros y micros')} className={styles.img} />
                            : dibujando
                                ? <Loader2 size={28} className="spin-animation" role="img" aria-label={t('Preparando la imagen…')} />
                                : <pre className={styles.textoPlano}>{texto}</pre>}
                    </div>
                </div>

                <div className={styles.footer}>
                    <input
                        ref={inputFotoRef} type="file" accept="image/*" className={styles.inputOculto}
                        onChange={onElegirFoto} tabIndex={-1} aria-hidden="true" data-testid="share-day-foto"
                    />
                    <input
                        ref={inputCamaraRef} type="file" accept="image/*" capture="environment" className={styles.inputOculto}
                        onChange={onElegirFoto} tabIndex={-1} aria-hidden="true" data-testid="share-day-camara"
                    />
                    {eligiendo && (
                        <div className={styles.fuentes} role="group" aria-label={t('Ponle tu foto')}>
                            <button type="button" className={styles.fuente} onClick={elegirDeGaleria}>
                                <span className={`${styles.fuenteIco} ${styles.fuenteGaleria}`} aria-hidden="true"><Images size={20} /></span>
                                <span className={styles.fuenteTxt}><strong>{t('Galería')}</strong><small>{t('Tu selfie del espejo')}</small></span>
                            </button>
                            <button type="button" className={styles.fuente} onClick={hacerFoto}>
                                <span className={`${styles.fuenteIco} ${styles.fuenteCamara}`} aria-hidden="true"><Camera size={20} /></span>
                                <span className={styles.fuenteTxt}><strong>{t('Cámara')}</strong><small>{t('Hazla ahora')}</small></span>
                            </button>
                            {/* [1078] la tranquilidad va donde se decide: al elegir la foto (con ella puesta, el sitio es de la historia) */}
                            <p className={`${styles.nota} ${styles.fuentesNota}`}>{t('Tu foto no sale de tu teléfono: la imagen se arma aquí.')}</p>
                            <button type="button" className={`${styles.enlace} ${styles.fuentesCancelar}`} onClick={() => setEligiendo(false)}>{t('Cancelar')}</button>
                        </div>
                    )}
                    {eligiendo ? null : foto ? (
                        <div className={styles.conFoto}>
                            <div className={styles.formatos} role="radiogroup" aria-label={t('Estilo de la historia')}>
                                {[['titular', t('Titular')], ['minimal', t('Minimal')], ['cristal', t('Cristal')]].map(([clave, rotulo]) => (
                                    <button
                                        key={clave} type="button" role="radio" aria-checked={estilo === clave}
                                        className={estilo === clave ? `${styles.formato} ${styles.formatoActivo}` : styles.formato}
                                        onClick={() => setEstilo(clave)}
                                    >
                                        {rotulo}
                                    </button>
                                ))}
                            </div>
                            <div className={styles.capas} role="radiogroup" aria-label={t('Qué ajustas')}>
                                {[['foto', t('Tu foto'), ImageIcon], ['cifras', t('Tus cifras'), Type]].map(([clave, rotulo, Icono]) => (
                                    <button
                                        key={clave} type="button" role="radio" aria-checked={capa === clave}
                                        className={capa === clave ? `${styles.capa} ${styles.capaActiva}` : styles.capa}
                                        onClick={() => { setCapa(clave); if (clave === 'cifras') verGuia(900); }}
                                    >
                                        <Icono size={16} aria-hidden="true" />{rotulo}
                                    </button>
                                ))}
                            </div>
                            <p className={styles.pista}>
                                {capa === 'cifras'
                                    ? t('Arrástralas · pellizca para cambiar su tamaño')
                                    : t('Arrastra para encuadrar · pellizca para acercar')}
                            </p>
                            <div className={styles.zoomFila}>
                            {capa === 'cifras' ? (
                                <input
                                    key="cifras" type="range" className={styles.zoom} min={ESCALA_MIN} max={escalaTope} step={0.01}
                                    value={bloqueVisto.escala} aria-label={t('Tamaño de tus cifras')}
                                    onChange={(e) => {
                                        const v = Number(e.target.value);
                                        setBloque((b) => acotarBloque({ ...acotarBloque(b, caja, LIMITES_CIFRAS), escala: v }, caja, LIMITES_CIFRAS));
                                        verGuia(900);
                                    }}
                                />
                            ) : (
                                <input
                                    key="foto" type="range" className={styles.zoom} min={1} max={ZOOM_MAX} step={0.01}
                                    value={encuadre.zoom} aria-label={t('Acercar la foto')}
                                    onChange={(e) => { const v = Number(e.target.value); setEncuadre((en) => moverEncuadre(en, foto, { factor: v / en.zoom })); }}
                                />
                            )}
                                <button type="button" className={styles.restablecer} onClick={restablecer} disabled={sinCambios} aria-label={t('Restablecer')} title={t('Restablecer')}>
                                    <RotateCcw size={18} aria-hidden="true" />
                                </button>
                            </div>
                            <div className={styles.fotoAcciones}>
                                <button type="button" className={styles.enlace} onClick={pedirFoto}>{t('Cambiar foto')}</button>
                                <button type="button" className={styles.enlace} onClick={() => setFoto(null)}>{t('Quitar foto')}</button>
                            </div>
                        </div>
                    ) : (
                        <button type="button" className={styles.fotoCta} onClick={pedirFoto}>
                            <span className={styles.fotoCtaIcono} aria-hidden="true"><Camera size={20} /></span>
                            <span className={styles.fotoCtaTexto}>
                                <span>{t('Ponle tu foto')}</span>
                                <span className={styles.fotoCtaSub}>{t('Tu selfie de fondo y tus cifras encima: lista para tu historia')}</span>
                            </span>
                            <BroteChispa size={18} className={styles.fotoCtaBrillo} aria-hidden="true" />
                        </button>
                    )}
                    {!foto && (
                        <>
                            <div className={styles.formatos} role="radiogroup" aria-label={t('Formato de la imagen')}>
                                {[['publicacion', t('Publicación')], ['historia', t('Historia')]].map(([clave, rotulo]) => (
                                    <button
                                        key={clave} type="button" role="radio" aria-checked={formato === clave}
                                        className={formato === clave ? `${styles.formato} ${styles.formatoActivo}` : styles.formato}
                                        onClick={() => setFormato(clave)}
                                    >
                                        <span>{rotulo}</span>
                                        {/* [P1-PLAN-LOTE-1049] qué es cada uno («¿cuál es la diferencia?», el dueño) */}
                                        <span className={styles.formatoSub}>{clave === 'publicacion' ? t('4:5 · chats y feed') : t('9:16 · historias y estados')}</span>
                                    </button>
                                ))}
                            </div>
                            <label className={styles.toggle}>
                                <input type="checkbox" checked={incluirComidas} onChange={(e) => setIncluirComidas(e.target.checked)} />
                                <span>{t('Incluir lo que comí')}</span>
                            </label>
                        </>
                    )}
                    <div className={styles.actions}>
                        {compartirImagen && (
                            <button type="button" className={`${styles.primary} ${styles.principal}`} onClick={onCompartir} disabled={dibujando || compartiendo || !archivo}>
                                <Share2 size={18} aria-hidden="true" />
                                <span className={styles.principalTexto}>
                                    <span>{t('Compartir imagen')}</span>
                                    <span className={styles.principalSub}>{t('WhatsApp, Instagram, Mensajes…')}</span>
                                </span>
                            </button>
                        )}
                        {puedeDescargar && (
                            <button type="button" className={compartirImagen ? styles.secondary : styles.primary} onClick={onDescargar} disabled={dibujando}>
                                <Download size={18} aria-hidden="true" />{t('Descargar imagen')}
                            </button>
                        )}
                        {verAlternativas && (
                            <>
                                <a className={styles.secondary} href={urlWhatsApp(texto)} target="_blank" rel="noopener noreferrer">
                                    <MessageCircle size={18} aria-hidden="true" />{t('Texto por WhatsApp')}
                                </a>
                                <button type="button" className={styles.secondary} onClick={onCopiar}>
                                    <Copy size={18} aria-hidden="true" />{t('Copiar texto')}
                                </button>
                            </>
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
