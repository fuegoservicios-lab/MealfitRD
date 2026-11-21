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
//
// [P1-PLAN-LOTE-1082 · 2026-11-18] Tercera puerta: «Compartir mi semana» (`semana`, lo que pinta «Tu semana»). Es
// siempre la historia 9:16 en lienzo (con tu foto o con el fondo de la app), con los tres estilos y las cifras como
// sticker; sin formatos ni «Incluir lo que comí» (la semana no lleva kcal ni comidas). Resumen y dibujo:
// `utils/compartirSemana.js`, en este mismo trozo perezoso.
//
// [P1-PLAN-LOTE-1143 · 2026-11-21] Editor completo (el dueño: «pantalla completa, agrandar y reducir… como CapCut, y
// algo para dar para atrás y para alante»): deshacer/rehacer (`utils/historialDeEdicion.js`, un paso por gesto), la
// imagen a pantalla completa con zoom de VISTA (botones, rueda, pellizco con la Mano; doble toque = 100 %) y guías
// que imantan los textos al centro o al margen seguro.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X, Share2, Copy, Download, MessageCircle, Loader2, Camera, Images, Image as ImageIcon, Type, RotateCcw, Eye, EyeOff, ChevronRight, Undo2, Redo2, Maximize2, Hand, Minus, Plus, Trash2 } from 'lucide-react';
import { crearHistorial, apuntar, deshacer, rehacer, mismoEstado, puedeDeshacer, puedeRehacer, VISTA_INICIAL, VISTA_MAX, acotarVista, vistaConZoom, pasoDeVista } from '../../utils/historialDeEdicion';
import { chooseNativeGalleryImage, takeNativeChatPhoto, isNativePickerCancellation } from '../../utils/nativeChatImagePicker';
import { toast } from 'sonner';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { isNativeApp } from '../../config/platform';
import { useT, formatDate } from '../../i18n';
import { DISENOS, disenoDelDia } from '../../utils/disenosDeHistoria';
import { resumenDeSemana, textoDeSemana } from '../../utils/compartirSemana';
import { resumenDeMes, textoDeMes } from '../../utils/compartirMes';
import { resumenDeMapa, textoDeMapa } from '../../utils/compartirMapa';
import { SITIO, resumenDelDia, textoDelDia, fechaLarga, consumidoDelDiario, urlWhatsApp, archivoDeImagen, puedeCompartirImagen, sabeCompartirImagenes, compartir } from '../../utils/compartirDia';
import { dibujarTarjetaDelDia } from '../../utils/tarjetaDelDia';
import { piezaEn, moverPieza, imantarPieza, alternarPieza, piezasEnSuSitio, piezasMovidas, estadoDePieza } from '../../utils/piezasDeHistoria';
import { BRAND } from '../../data/routeMeta';
import { piezasDeLaHistoria, cargarFoto, cargarFuentes, dibujarHistoriaConFoto, pintarHistoria, moverEncuadre, cajaDeCifras, PINCEL, ENCUADRE_INICIAL, ZOOM_MAX, LIMITES_CIFRAS, ANCHO as ANCHO_HISTORIA, ALTO as ALTO_HISTORIA } from '../../utils/historiaConFoto';
import { BLOQUE_INICIAL, ESCALA_MIN, acotarBloque, moverBloque, imantar, escalaMax, tocaLasCifras, esInicial } from '../../utils/bloqueDeCifras';
import { useAssessment } from '../../context/AssessmentContext';
import { nombreDeRegistro } from '../../utils/nombreDeRegistro';
import { getBiologicalDate } from '../../utils/diaBiologico';
import styles from './ShareDaySheet.module.css';

const ShareDaySheet = ({ onClose, consumed = null, diario = null, metas = null, microMetas = null, fecha = null, semana = null, mes = null, mapa = null }) => {
    const t = useT();
    const esSemana = !!semana;
    // [P1-PLAN-LOTE-1100] cuarta puerta: el mes (lo que pinta el calendario del Diario). Semana y mes son «periodos».
    const esMes = !!mes && !semana;
    // [P1-PLAN-LOTE-1132] quinta puerta: el camino del mapa de niveles (también es un «periodo»).
    const esMapa = !!mapa && !semana && !mes;
    const esPeriodo = esSemana || esMes || esMapa;
    // El texto de cada puerta: [semana, mes, camino, día].
    const segun = (sem, me, ma, di) => (esSemana ? sem : esMes ? me : esMapa ? ma : di);
    // [1143] con el editor a pantalla completa abierto, ESC y el Tab son suyos (la hoja espera debajo)
    const { containerRef } = useModalAccessibility({
        isOpen: true, onClose,
        isTopmost: () => typeof document === 'undefined' || !document.querySelector('[data-editor-completo]'),
    });
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
    // [P1-PLAN-LOTE-1095] siete diseños, uno por día: nace con el del día que se comparte (la semana, con el de hoy)
    const [estilo, setEstilo] = useState(() => disenoDelDia(!semana && !mes && !mapa && fecha instanceof Date ? fecha : new Date()).clave);
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
    // El contorno que se ve mientras mueves algo: null, { centrado } (las cifras) o { pieza } (un texto suelto).
    const [guia, setGuia] = useState(null);
    // [P1-PLAN-LOTE-1084] Los textos sueltos (marca, fecha, sitio, pregunta) se arrastran y se quitan: `piezasDeHistoria.js`.
    const [piezas, setPiezas] = useState({});
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

    // [1143] Deshacer / rehacer. Lo editable se apunta cuando se asienta (350 ms sin cambios y sin dedos encima): un
    // arrastre o un deslizador es UN paso. Los botones se derivan de `pasos` (estado) y del cambio aún sin apuntar.
    const editable = useMemo(() => ({ encuadre, bloque, piezas, estilo, foto }), [encuadre, bloque, piezas, estilo, foto]);
    const [historialInicial] = useState(() => crearHistorial(editable));
    const historial = useRef(historialInicial);
    const editableRef = useRef(editable);
    const manoPunteros = useRef(new Map());
    const [pantalla, setPantalla] = useState(false);      // [1143] el editor a pantalla completa
    const [pasos, setPasos] = useState(() => ({ atras: false, adelante: false, presente: editable }));
    const fijarHistorial = useCallback((h) => {
        historial.current = h;
        setPasos({ atras: puedeDeshacer(h), adelante: puedeRehacer(h), presente: h.presente });
    }, []);
    useEffect(() => {
        editableRef.current = editable;
        if (mismoEstado(historial.current.presente, editable)) return undefined;
        let tope;
        const asentar = () => {
            if (punteros.current.size > 0) { tope = setTimeout(asentar, 200); return; }
            fijarHistorial(apuntar(historial.current, editableRef.current));
        };
        tope = setTimeout(asentar, 350);
        return () => clearTimeout(tope);
    }, [editable, fijarHistorial]);
    const sinApuntar = !mismoEstado(pasos.presente, editable);
    const puedeAtras = pasos.atras || sinApuntar;
    const puedeAdelante = pasos.adelante && !sinApuntar;
    const aplicarPaso = useCallback((e) => {
        setEncuadre(e.encuadre); setBloque(e.bloque); setPiezas(e.piezas); setEstilo(e.estilo); setFoto(e.foto);
        gesto.current = { ...gesto.current, crudo: e.bloque, crudoPiezas: e.piezas };
        clearTimeout(guiaTope.current);
        setGuia(null);
    }, []);
    const moverEnHistorial = useCallback((dir) => {
        if (punteros.current.size > 0) return;            // a mitad de un gesto, no
        const h = apuntar(historial.current, editableRef.current);
        const nuevo = dir < 0 ? deshacer(h) : rehacer(h);
        fijarHistorial(nuevo);
        if (nuevo !== h) aplicarPaso(nuevo.presente);
    }, [aplicarPaso, fijarHistorial]);

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
        () => (semana
            ? resumenDeSemana(semana)
            : mes
                ? resumenDeMes(mes)
                : mapa
                    ? resumenDeMapa(mapa)
                    : resumenDelDia({ consumed: delDia, metas: metasDelDia, microMetas, incluirComidas, fecha: fechaDelDia, nombrar })),
        [semana, mes, mapa, delDia, metasDelDia, microMetas, incluirComidas, fechaDelDia, nombrar],
    );
    const texto = useMemo(() => (resumen.tipo === 'semana' ? textoDeSemana(resumen)
        : resumen.tipo === 'mes' ? textoDeMes(resumen) : resumen.tipo === 'mapa' ? textoDeMapa(resumen) : textoDelDia(resumen)), [resumen]);
    // [1082] La historia en lienzo (vista previa en vivo + JPEG): con tu foto, o siempre en la semana.
    const enLienzo = !!foto || esPeriodo;
    // Sin foto no hay foto que mover: lo que se ajusta son las cifras.
    const capaVista = foto ? capa : 'cifras';
    const caja = useMemo(() => cajaDeCifras(resumen, estilo), [resumen, estilo]);
    const escalaTope = useMemo(() => escalaMax(caja, LIMITES_CIFRAS), [caja]);
    const bloqueVisto = useMemo(() => acotarBloque(bloque, caja, LIMITES_CIFRAS), [bloque, caja]);
    const defsPiezas = useMemo(() => (enLienzo ? piezasDeLaHistoria(resumen, estilo) : []), [enLienzo, resumen, estilo]);

    useEffect(() => {
        let vivo = true;
        const fijar = (blob) => {
            if (vivo) setImagen({ blob, url: blob ? URL.createObjectURL(blob) : null, para: resumen, formato, foto, estilo, encuadre, bloque, piezas });
        };
        // Con foto, el JPEG espera a que el dedo se pare (arrastrar pide decenas de encuadres por segundo). Sin foto, la
        // tarjeta se dibuja en el acto, como siempre.
        if (!enLienzo) {
            dibujarTarjetaDelDia(resumen, { formato }).then(fijar).catch(() => fijar(null));
            return () => { vivo = false; };
        }
        const tope = setTimeout(() => {
            dibujarHistoriaConFoto(resumen, { foto, estilo, encuadre, bloque, piezas }).then(fijar).catch(() => fijar(null));
        }, 280);
        return () => { vivo = false; clearTimeout(tope); };
    }, [resumen, formato, foto, estilo, encuadre, bloque, enLienzo, piezas]);

    // La vista previa en vivo: un fotograma por cambio. [1143] `pantalla`: el lienzo se muda (hoja ↔ pantalla completa)
    // y el nuevo nace en blanco.
    useEffect(() => {
        if (!enLienzo) return undefined;
        const id = requestAnimationFrame(() => pintarHistoria(lienzoRef.current, resumen, { foto, estilo, encuadre, bloque, guia, piezas }));
        return () => cancelAnimationFrame(id);
    }, [enLienzo, foto, resumen, estilo, encuadre, bloque, guia, piezas, fuentesListas, pantalla]);
    useEffect(() => () => clearTimeout(guiaTope.current), []);
    // El contorno de las cifras se ve mientras las mueves (y un momento después de soltar el deslizador); nunca en el JPEG.
    const verGuia = useCallback((ms = 0, que = { centrado: true }) => {
        clearTimeout(guiaTope.current);
        setGuia(que);
        if (ms > 0) guiaTope.current = setTimeout(() => setGuia(null), ms);
    }, []);

    // Las cifras se mueven sobre una posición «cruda» (la del dedo) y lo que se ve es esa posición imantada al centro:
    // imantar lo ya imantado no dejaría salir del centro con un arrastre lento.
    const moverCifras = useCallback((cambio) => {
        const g = gesto.current;
        g.crudo = moverBloque(g.crudo, caja, LIMITES_CIFRAS, cambio);
        setBloque(imantar(g.crudo));
    }, [caja]);

    // [P1-PLAN-LOTE-1083 · 2026-11-18] El pellizco (el dueño: «tengo que pellizcar muy lejos para que funcione»). Tres
    // causas: (1) solo contaba si los DOS dedos caían sobre el lienzo, que en la hoja mide ~260 px de ancho: el segundo
    // dedo solía caer fuera; ahora escucha TODA la vista previa; (2) la capa la decidía solo el primer dedo con un
    // margen de ~10 px de pantalla: un pellizco que no empezaba justo encima de las cifras agrandaba la FOTO; ahora el
    // pellizco es de las cifras si cualquiera de los dos dedos (o su punto medio) las toca, o si están elegidas, y el
    // margen es de 28 px de PANTALLA; (3) el factor se aplicaba paso a paso sobre lo ya acotado; ahora es absoluto
    // desde que se apoyan los dos dedos (distancia actual / inicial), sin deriva.
    const aLienzo = useCallback((cx, cy) => {
        const r = lienzoRef.current?.getBoundingClientRect?.();
        if (!r || !(r.width > 0) || !(r.height > 0)) return { x: -1, y: -1, k: 1 };
        return { x: (cx - r.left) * (ANCHO_HISTORIA / r.width), y: (cy - r.top) * (ALTO_HISTORIA / r.height), k: ANCHO_HISTORIA / r.width };
    }, []);
    const sobreLasCifras = useCallback((cx, cy) => {
        const { x, y, k } = aLienzo(cx, cy);
        return tocaLasCifras(caja, bloqueVisto, x, y, 28 * k);
    }, [aLienzo, caja, bloqueVisto]);

    const onPunteroAbajo = useCallback((e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const p = punteros.current;
        p.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (p.size === 1) {
            // [1084] primero los textos sueltos (encima de todo), luego las cifras, luego la foto
            const { x, y, k } = aLienzo(e.clientX, e.clientY);
            const pieza = piezaEn(defsPiezas, piezas, x, y, 22 * k);
            if (pieza) {
                gesto.current = { capa: 'pieza', pieza, crudo: bloqueVisto, crudoPiezas: piezas, linea: null, pellizco: null, elegida: capaVista };
                verGuia(0, { pieza });
                return;
            }
            const enCifras = !foto || sobreLasCifras(e.clientX, e.clientY);
            gesto.current = { capa: enCifras ? 'cifras' : 'foto', crudo: bloqueVisto, pellizco: null, elegida: capaVista };
            setCapa(enCifras ? 'cifras' : 'foto');
            if (enCifras) verGuia();
        } else if (p.size === 2) {
            const [a, b] = [...p.values()];
            const g = gesto.current;
            const cifras = !foto || g.elegida === 'cifras' || g.capa === 'cifras'
                || sobreLasCifras(a.x, a.y) || sobreLasCifras(b.x, b.y) || sobreLasCifras((a.x + b.x) / 2, (a.y + b.y) / 2);
            g.capa = cifras ? 'cifras' : 'foto';
            g.pellizco = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), escala0: g.crudo.escala, zoom0: encuadre.zoom };
            setCapa(g.capa);
            if (cifras) verGuia();
        }
    }, [foto, sobreLasCifras, bloqueVisto, capaVista, verGuia, encuadre.zoom, aLienzo, defsPiezas, piezas]);
    const onPunteroMovido = useCallback((e) => {
        const p = punteros.current;
        const previo = p.get(e.pointerId);
        if (!previo || !enLienzo) return;
        p.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g = gesto.current;
        if (p.size >= 2 && g.pellizco) {
            const [a, b] = [...p.values()];
            const f = Math.hypot(a.x - b.x, a.y - b.y) / g.pellizco.d0;
            if (g.capa === 'cifras') {
                g.crudo = acotarBloque({ ...g.crudo, escala: g.pellizco.escala0 * f }, caja, LIMITES_CIFRAS);
                setBloque(imantar(g.crudo));
            } else {
                const zoom = g.pellizco.zoom0 * f;
                setEncuadre((en) => moverEncuadre(en, foto, { factor: zoom / (en.zoom || 1) }));
            }
            return;
        }
        const { k } = aLienzo(e.clientX, e.clientY);     // px de pantalla → px del lienzo
        const dx = (e.clientX - previo.x) * k;
        const dy = (e.clientY - previo.y) * k;
        if (g.capa === 'pieza') {
            const def = defsPiezas.find((d) => d.id === g.pieza);
            if (def) {
                // [1143] se mueve la posición cruda (la del dedo) y se ve la imantada a la guía, con su línea
                g.crudoPiezas = moverPieza(g.crudoPiezas, def, { dx, dy }, ANCHO_HISTORIA, ALTO_HISTORIA);
                const im = imantarPieza(g.crudoPiezas, def, { ancho: ANCHO_HISTORIA, margen: PINCEL.M });
                g.linea = im.linea;
                setPiezas(im.piezas);
                setGuia({ pieza: g.pieza, linea: im.linea });
            }
        } else if (g.capa === 'cifras') moverCifras({ dx, dy });
        else setEncuadre((en) => moverEncuadre(en, foto, { dx, dy }));
    }, [foto, enLienzo, moverCifras, aLienzo, caja, defsPiezas]);
    const onPunteroArriba = useCallback((e) => {
        const p = punteros.current;
        p.delete(e.pointerId);
        // al levantar un dedo del pellizco, el otro sigue arrastrando desde donde está
        if (p.size < 2) gesto.current.pellizco = null;
        if (p.size === 0 && gesto.current.capa === 'cifras') verGuia(700);
        if (p.size === 0 && gesto.current.capa === 'pieza') verGuia(600, { pieza: gesto.current.pieza, linea: gesto.current.linea });
    }, [verGuia]);
    const restablecer = useCallback(() => {
        // [1084] «Restablecer» de las cifras también devuelve los textos a su sitio (los quitados siguen quitados)
        if (capaVista === 'cifras') { setBloque(BLOQUE_INICIAL); setPiezas(piezasEnSuSitio); verGuia(700); } else setEncuadre(ENCUADRE_INICIAL);
    }, [capaVista, verGuia]);
    const sinCambios = capaVista === 'cifras' ? (esInicial(bloqueVisto) && !piezasMovidas(piezas)) : (encuadre.zoom === 1 && encuadre.x === 0 && encuadre.y === 0);
    // El arrastre de la foto no es el gesto de cerrar la hoja (useBottomSheet escucha el toque en el diálogo).
    const pararToque = useCallback((e) => e.stopPropagation(), []);

    // [1143] Ctrl+Z / Ctrl+Mayús+Z / Ctrl+Y en la computadora, con la hoja abierta.
    useEffect(() => {
        if (!enLienzo || typeof document === 'undefined') return undefined;
        const onTecla = (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            const k = String(e.key || '').toLowerCase();
            if (k === 'z' && !e.shiftKey) { e.preventDefault(); moverEnHistorial(-1); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); moverEnHistorial(1); }
        };
        document.addEventListener('keydown', onTecla);
        return () => document.removeEventListener('keydown', onTecla);
    }, [enLienzo, moverEnHistorial]);

    // [1143] Pantalla completa: la MISMA imagen (el mismo lienzo, que se muda), con zoom de VISTA. La vista no toca la
    // imagen: agranda para colocar con precisión. Sin la Mano, el dedo edita como en la hoja; con la Mano, el dedo
    // recorre la vista y el pellizco la agranda (el pellizco sin Mano sigue siendo de la foto o de las cifras).
    const [vista, setVista] = useState(VISTA_INICIAL);
    const [mano, setMano] = useState(false);
    const cerrarPantalla = useCallback(() => {
        setPantalla(false); setVista(VISTA_INICIAL); setMano(false);
        manoPunteros.current.clear();
    }, []);
    const editor = useModalAccessibility({ isOpen: pantalla, onClose: cerrarPantalla });
    const escenaRef = useRef(null);
    useLayoutEffect(() => {
        const el = escenaRef.current;
        if (el) el.style.transform = vista.zoom === 1 && !vista.x && !vista.y ? '' : `translate(${vista.x}px, ${vista.y}px) scale(${vista.zoom})`;
    }, [vista, pantalla]);
    const medidaEscena = useCallback(() => [escenaRef.current?.offsetWidth || 0, escenaRef.current?.offsetHeight || 0], []);
    const zoomDeVista = useCallback((z) => {
        const [w, h] = medidaEscena();
        setVista((v) => vistaConZoom(v, typeof z === 'function' ? z(v.zoom) : z, w, h));
    }, [medidaEscena]);
    const manoPellizco = useRef(null);
    const toque = useRef(null);
    const onVistaAbajo = useCallback((e) => {
        toque.current = { ...(toque.current || {}), x0: e.clientX, y0: e.clientY, t0: Date.now(), varios: punteros.current.size + manoPunteros.current.size > 0 };
        if (!mano) { onPunteroAbajo(e); return; }
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const p = manoPunteros.current;
        p.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (p.size === 2) {
            const [a, b] = [...p.values()];
            manoPellizco.current = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom0: vista.zoom };
        }
    }, [mano, onPunteroAbajo, vista.zoom]);
    const onVistaMovida = useCallback((e) => {
        if (!mano) { onPunteroMovido(e); return; }
        const p = manoPunteros.current;
        const previo = p.get(e.pointerId);
        if (!previo) return;
        p.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (p.size >= 2 && manoPellizco.current) {
            const [a, b] = [...p.values()];
            const { d0, zoom0 } = manoPellizco.current;
            zoomDeVista(zoom0 * (Math.hypot(a.x - b.x, a.y - b.y) / d0));
            return;
        }
        const [w, h] = medidaEscena();
        const dx = e.clientX - previo.x;
        const dy = e.clientY - previo.y;
        setVista((v) => acotarVista({ ...v, x: v.x + dx, y: v.y + dy }, w, h));
    }, [mano, onPunteroMovido, zoomDeVista, medidaEscena]);
    const onVistaArriba = useCallback((e) => {
        // doble toque (dos toques cortos y quietos seguidos): la vista vuelve al 100 %
        const tq = toque.current;
        const ahora = Date.now();
        if (tq && !tq.varios && ahora - tq.t0 < 250 && Math.hypot(e.clientX - tq.x0, e.clientY - tq.y0) < 12) {
            const u = tq.ultimo;
            if (u && ahora - u.t < 350 && Math.hypot(e.clientX - u.x, e.clientY - u.y) < 40) { setVista(VISTA_INICIAL); toque.current = null; } else toque.current = { ultimo: { t: ahora, x: e.clientX, y: e.clientY } };
        } else toque.current = null;
        if (!mano || !manoPunteros.current.has(e.pointerId)) { onPunteroArriba(e); return; }
        manoPunteros.current.delete(e.pointerId);
        if (manoPunteros.current.size < 2) manoPellizco.current = null;
    }, [mano, onPunteroArriba]);
    const onVistaRueda = useCallback((e) => zoomDeVista((z) => z * Math.exp(-e.deltaY * 0.0015)), [zoomDeVista]);

    // La URL en pantalla se revoca cuando otra YA la sustituyó (la limpieza de este efecto corre tras el commit de la
    // nueva) o al cerrar la hoja; antes se revocaba al EMPEZAR cada redibujo, con la imagen vieja aún en el <img>.
    useEffect(() => {
        const url = imagen.url;
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [imagen.url]);

    const baseArchivo = segun('mi-semana-bioboros', 'mi-mes-bioboros', 'mi-camino-bioboros', 'mi-dia-bioboros');
    const archivo = useMemo(() => archivoDeImagen(imagen.blob, `${baseArchivo}.png`), [imagen.blob, baseArchivo]);
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
    const dibujando = imagen.para !== resumen || imagen.formato !== formato || imagen.foto !== foto || imagen.estilo !== estilo || imagen.encuadre !== encuadre || (enLienzo && (imagen.bloque !== bloque || imagen.piezas !== piezas));

    // Un segundo toque mientras la hoja del sistema se abre hace que `navigator.share` rechace (InvalidStateError) y
    // saldría un «no dejó compartir» falso: se ignora. La marca se pone DESPUÉS de llamar a `compartir`, que invoca
    // `navigator.share` sin esperar nada antes (el gesto del usuario sigue vivo); el botón queda apagado mientras tanto.
    const compartiendoRef = useRef(false);
    const [compartiendo, setCompartiendo] = useState(false);
    const onCompartir = useCallback(async () => {
        if (compartiendoRef.current) return;
        const enCurso = compartir(esSemana ? { archivo, texto, titulo: t('Mi semana'), tituloHoja: t('Compartir tu semana') }
            : esMes ? { archivo, texto, titulo: t('Mi mes'), tituloHoja: t('Compartir tu mes') }
                : esMapa ? { archivo, texto, titulo: t('Mi camino'), tituloHoja: t('Compartir tu camino') } : { archivo, texto });
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
    }, [archivo, texto, t, esSemana, esMes, esMapa]);

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
        const base = baseArchivo;
        a.download = imagen.blob?.type === 'image/jpeg' ? `${base}.jpg` : `${base}.png`;
        document.body.appendChild(a); a.click(); a.remove();
    }, [imagen.url, imagen.blob, baseArchivo]);

    // [1082] El estilo y el tamaño de las cifras: los mismos controles con tu foto y en la semana sin foto.
    // [P1-PLAN-LOTE-1090] «se ve medio raro» (el dueño): cada ajuste es UNA fila del mismo ancho, con su rótulo a la
    // izquierda (Estilo · Tamaño · Textos); antes eran bloques centrados de anchos distintos con frases encima.
    // [P1-PLAN-LOTE-1095] Los siete diseños en una fila que se desliza de lado: su muestra de color, el nombre y su día
    // («Hoy» el de hoy). `data-gesto-propio`: la hoja no se come el deslizamiento (1089).
    const hoyDia = new Date().getDay();
    const diaCorto = (dia) => {
        if (dia === hoyDia) return t('Hoy');
        const ref = new Date(2026, 10, 15 + dia, 12);      // 15-nov-2026 fue domingo
        return formatDate(ref, { weekday: 'short' });
    };
    // al aparecer, la fila se desliza hasta el diseño elegido (el de hoy puede ser el séptimo)
    const colocarDisenos = (el) => {
        if (!el || el.dataset.colocado) return;
        el.dataset.colocado = '1';
        const activo = el.querySelector('[aria-checked="true"]');
        if (activo) el.scrollLeft = Math.max(0, activo.offsetLeft - el.offsetLeft - 8);
    };
    const selectorDeEstilo = (
        <div className={styles.fila}>
            <span className={styles.filaRotulo} aria-hidden="true">{t('Diseño')}</span>
            <div className={styles.disenos} role="radiogroup" aria-label={t('Estilo de la historia')} data-gesto-propio="" ref={colocarDisenos}>
                {DISENOS.map((d) => (
                    <button
                        key={d.clave} type="button" role="radio" aria-checked={estilo === d.clave}
                        className={estilo === d.clave ? `${styles.diseno} ${styles.disenoActivo}` : styles.diseno}
                        onClick={() => setEstilo(d.clave)}
                    >
                        <span className={`${styles.muestra} ${styles[`muestra_${d.clave}`]}`} aria-hidden="true" />
                        <span className={styles.disenoTexto}>
                            <span className={styles.disenoNombre}>{t(d.nombre)}</span>
                            <span className={styles.disenoDia} aria-hidden="true">{diaCorto(d.dia)}</span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
    const deslizadorDeCifras = (
        <input
            key="cifras" type="range" className={styles.zoom} min={ESCALA_MIN} max={escalaTope} step={0.01}
            value={bloqueVisto.escala} aria-label={t('Tamaño de tus cifras')}
            onChange={(e) => {
                const v = Number(e.target.value);
                setBloque((b) => acotarBloque({ ...acotarBloque(b, caja, LIMITES_CIFRAS), escala: v }, caja, LIMITES_CIFRAS));
                verGuia(900);
            }}
        />
    );
    // [1084] Qué textos se ven: cada uno se quita o se vuelve a poner (y se mueve arrastrándolo en la imagen).
    const rotuloDePieza = (id) => ({
        marca: BRAND, fecha: segun(t('Fechas'), t('Mes'), t('Camino'), t('Fecha')), sitio: SITIO,
        pregunta: segun(t('¿Y tú, cómo va tu semana?'), t('¿Y tú, cómo va tu mes?'), t('¿Y tú, cómo va tu camino?'), t('¿Y tú, cómo vas hoy?')), sello: t('{app} abajo', { app: BRAND }),
    })[id] || id;
    const selectorDePiezas = defsPiezas.length > 0 && (
        <div className={styles.fila} role="group" aria-labelledby="share-day-piezas" aria-describedby="share-day-piezas-pista">
            <span id="share-day-piezas" className={styles.filaRotulo}>{t('Textos')}</span>
            <span id="share-day-piezas-pista" className={styles.inputOculto}>{t('Textos: tócalos para quitarlos o arrástralos en la imagen')}</span>
            {/* [1090] una sola línea que se desliza de lado: `data-gesto-propio` para que la hoja no se lo coma (1089) */}
            <div className={styles.piezasLista} data-gesto-propio="">
                {defsPiezas.map((d) => {
                    const visible = !estadoDePieza(piezas, d.id).oculta;
                    const Icono = visible ? Eye : EyeOff;
                    return (
                        <button
                            key={d.id} type="button" aria-pressed={visible}
                            className={visible ? `${styles.pieza} ${styles.piezaVisible}` : styles.pieza}
                            onClick={() => setPiezas((ps) => alternarPieza(ps, d.id))}
                        >
                            <Icono size={14} aria-hidden="true" />
                            <span className={styles.piezaTexto}>{rotuloDePieza(d.id)}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
    const botonRestablecer = (
        <button type="button" className={styles.restablecer} onClick={restablecer} disabled={sinCambios} aria-label={t('Restablecer')} title={t('Restablecer')}>
            <RotateCcw size={18} aria-hidden="true" />
        </button>
    );

    // [1143] Lo que comparten la hoja y el editor a pantalla completa.
    const lienzo = (clase) => (
        <canvas
            ref={lienzoRef} width={ANCHO_HISTORIA} height={1920}
            role="img" aria-label={segun(t('Mi semana: tu historia'), t('Mi mes: tu historia'), t('Mi camino: tu historia'), t('Mi día: tu historia con tu foto'))}
            className={clase}
        />
    );
    const pista = foto && capa === 'foto'
        ? t('Arrastra para encuadrar · pellizca para acercar')
        : t('Arrastra para mover · pellizca para el tamaño');
    const botonesDeHistorial = (clase) => (
        <>
            <button type="button" className={clase} onClick={() => moverEnHistorial(-1)} disabled={!puedeAtras} aria-label={t('Deshacer')} title={t('Deshacer')}>
                <Undo2 size={18} aria-hidden="true" />
            </button>
            <button type="button" className={clase} onClick={() => moverEnHistorial(1)} disabled={!puedeAdelante} aria-label={t('Rehacer')} title={t('Rehacer')}>
                <Redo2 size={18} aria-hidden="true" />
            </button>
        </>
    );
    const editorCompleto = pantalla && enLienzo && (
        <div ref={editor.containerRef} className={styles.editor} role="dialog" aria-modal="true" aria-label={t('Editar imagen')} tabIndex={-1} data-editor-completo="">
            <div className={styles.editorBarra}>
                {botonesDeHistorial(styles.editorBoton)}
                <span className={styles.editorHueco} />
                <button type="button" className={styles.editorListo} onClick={cerrarPantalla}>{t('Listo')}</button>
            </div>
            <div
                className={mano ? `${styles.editorVista} ${styles.editorVistaMano}` : styles.editorVista}
                onPointerDown={onVistaAbajo} onPointerMove={onVistaMovida} onPointerUp={onVistaArriba} onPointerCancel={onVistaArriba}
                onWheel={onVistaRueda}
            >
                <div ref={escenaRef} className={styles.editorEscena}>{lienzo(styles.lienzoCompleto)}</div>
            </div>
            <div className={styles.editorPie}>
                <p className={styles.editorPista}>{mano ? t('Arrastra para recorrer · pellizca para acercar la vista') : pista}</p>
                <div className={styles.editorControles}>
                    <button
                        type="button" aria-pressed={mano} onClick={() => setMano((m) => !m)}
                        className={mano ? `${styles.editorBoton} ${styles.editorBotonActivo}` : styles.editorBoton}
                        aria-label={t('Mano: mover la vista')} title={t('Mano: mover la vista')}
                    >
                        <Hand size={18} aria-hidden="true" />
                    </button>
                    <div className={styles.editorZoom} role="group" aria-label={t('Tamaño de la vista')}>
                        <button type="button" className={styles.editorBoton} onClick={() => zoomDeVista((z) => pasoDeVista(z, -1))} disabled={vista.zoom <= 1} aria-label={t('Alejar')} title={t('Alejar')}>
                            <Minus size={18} aria-hidden="true" />
                        </button>
                        <button type="button" className={styles.editorPorcentaje} onClick={() => setVista(VISTA_INICIAL)} aria-label={t('Ver al 100 %')} title={t('Ver al 100 %')}>
                            {`${Math.round(vista.zoom * 100)} %`}
                        </button>
                        <button type="button" className={styles.editorBoton} onClick={() => zoomDeVista((z) => pasoDeVista(z, 1))} disabled={vista.zoom >= VISTA_MAX} aria-label={t('Acercar')} title={t('Acercar')}>
                            <Plus size={18} aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    const cuerpo = (
        <div className={styles.overlay}>
            <button type="button" className={styles.backdrop} aria-hidden="true" tabIndex={-1} onClick={onClose} />
            <div
                ref={containerRef}
                className={enLienzo || imagen.url || dibujando ? `${styles.sheet} ${styles.sheetFoto}` : styles.sheet}
                role="dialog"
                aria-modal="true"
                aria-labelledby="share-day-title"
                aria-describedby={conFecha || esPeriodo ? 'share-day-fecha' : undefined}
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
                            <h2 id="share-day-title" className={styles.title}>{segun(t('Compartir tu semana'), t('Compartir tu mes'), t('Compartir tu camino'), t('Compartir tu día'))}</h2>
                            {esMapa ? (
                                <p id="share-day-fecha" className={styles.fecha}>{resumen.periodo}</p>
                            ) : esMes ? (
                                <p id="share-day-fecha" className={styles.fecha}>{resumen.nombre}</p>
                            ) : esSemana ? (
                                <p id="share-day-fecha" className={styles.fecha}>
                                    {[t('Semana {n}', { n: resumen.numero }), resumen.periodo].filter(Boolean).join(' · ')}
                                </p>
                            ) : conFecha && <p id="share-day-fecha" className={styles.fecha}>{fechaLarga(fechaDelDia)}</p>}
                        </div>
                        <button type="button" className={`${styles.close} ui-close`} onClick={onClose} aria-label={t('Cerrar')}>
                            <X size={20} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div ref={bodyRef} className={styles.body}>
                    {/* [1083] con lienzo, TODA la vista previa recibe el gesto: el segundo dedo del pellizco puede caer fuera
                        de la imagen. Lo que no es la imagen no es el gesto de cerrar la hoja (`pararToque`). */}
                    <div
                        className={enLienzo ? `${styles.preview} ${styles.previewGesto}` : styles.preview}
                        aria-busy={dibujando}
                        {...(enLienzo ? {
                            onPointerDown: onPunteroAbajo, onPointerMove: onPunteroMovido,
                            onPointerUp: onPunteroArriba, onPointerCancel: onPunteroArriba,
                            onTouchStart: pararToque, onTouchMove: pararToque, onTouchEnd: pararToque,
                        } : {})}
                    >
                        {enLienzo ? (
                            // [1143] con el editor abierto el lienzo vive allí; aquí queda su hueco (la hoja no salta)
                            pantalla ? <div className={`${styles.img} ${styles.lienzo}`} aria-hidden="true" /> : lienzo(`${styles.img} ${styles.lienzo}`)
                        ) : imagen.url
                            ? <img src={imagen.url} alt={t('Mi día: calorías, macros y micros')} className={styles.img} />
                            : dibujando
                                ? <Loader2 size={28} className="spin-animation" role="img" aria-label={t('Preparando la imagen…')} />
                                : <pre className={styles.textoPlano}>{texto}</pre>}
                    </div>
                    {/* [1090] cómo se usa la imagen, UNA vez y bajo la imagen (antes, una frase por cada control del pie) */}
                    {/* [1143] deshacer · rehacer a la izquierda, la pista en medio y la pantalla completa a la derecha */}
                    {enLienzo && (
                        <div className={styles.herramientas}>
                            {botonesDeHistorial(styles.herramienta)}
                            <p className={styles.pista}>{pista}</p>
                            <button type="button" className={styles.herramienta} onClick={() => setPantalla(true)} aria-label={t('Pantalla completa')} title={t('Pantalla completa')}>
                                <Maximize2 size={18} aria-hidden="true" />
                            </button>
                        </div>
                    )}
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
                            {selectorDeEstilo}
                            <div className={styles.fila}>
                            <span className={styles.filaRotulo} aria-hidden="true">{t('Mover')}</span>
                            <div className={`${styles.capas} ${styles.capasFila}`} role="radiogroup" aria-label={t('Qué ajustas')}>
                                {/* [P1-PLAN-LOTE-1144] a la vista, la palabra corta con su icono (la larga no cabía en un teléfono y se
                                    comía el icono); el nombre completo sigue para el lector de pantalla */}
                                {[['foto', t('Foto'), t('Foto de fondo'), ImageIcon], ['cifras', t('Resumen'), segun(t('Resumen de la semana'), t('Resumen del mes'), t('Resumen del camino'), t('Resumen del día')), Type]].map(([clave, corto, rotulo, Icono]) => (
                                    <button
                                        key={clave} type="button" role="radio" aria-checked={capa === clave} aria-label={rotulo}
                                        className={capa === clave ? `${styles.capa} ${styles.capaActiva}` : styles.capa}
                                        onClick={() => { setCapa(clave); if (clave === 'cifras') verGuia(900); }}
                                    >
                                        <Icono size={16} aria-hidden="true" />{corto}
                                    </button>
                                ))}
                            </div>
                            </div>
                            <div className={styles.fila}>
                            <span className={styles.filaRotulo} aria-hidden="true">{capa === 'cifras' ? t('Tamaño') : t('Zoom')}</span>
                            {capa === 'cifras' ? deslizadorDeCifras : (
                                <input
                                    key="foto" type="range" className={styles.zoom} min={1} max={ZOOM_MAX} step={0.01}
                                    value={encuadre.zoom} aria-label={t('Acercar la foto')}
                                    onChange={(e) => { const v = Number(e.target.value); setEncuadre((en) => moverEncuadre(en, foto, { factor: v / en.zoom })); }}
                                />
                            )}
                                {botonRestablecer}
                            </div>
                            {selectorDePiezas}
                            {/* [P1-PLAN-LOTE-1144] la foto es una fila más (rótulo + píldoras), no dos enlaces sueltos */}
                            <div className={styles.fila}>
                                <span className={styles.filaRotulo} aria-hidden="true">{t('Foto')}</span>
                                <div className={styles.fotoAcciones}>
                                    <button type="button" className={styles.fotoBoton} onClick={pedirFoto} aria-label={t('Cambiar foto')}>
                                        <Images size={16} aria-hidden="true" />{t('Cambiar')}
                                    </button>
                                    <button type="button" className={`${styles.fotoBoton} ${styles.fotoBotonQuitar}`} onClick={() => setFoto(null)} aria-label={t('Quitar foto')}>
                                        <Trash2 size={16} aria-hidden="true" />{t('Quitar')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <button type="button" className={styles.fotoCta} onClick={pedirFoto}>
                            <span className={styles.fotoCtaIcono} aria-hidden="true"><Camera size={20} /></span>
                            <span className={styles.fotoCtaTexto}>
                                <span>{t('Ponle tu foto')}</span>
                                <span className={styles.fotoCtaSub}>{t('Tu selfie detrás de tus cifras')}</span>
                            </span>
                            <ChevronRight size={18} className={styles.fotoCtaFlecha} aria-hidden="true" />
                        </button>
                    )}
                    {!foto && esPeriodo && !eligiendo && (
                        <div className={styles.conFoto}>
                            {selectorDeEstilo}
                            <div className={styles.fila}>
                                <span className={styles.filaRotulo} aria-hidden="true">{t('Tamaño')}</span>
                                {deslizadorDeCifras}
                                {botonRestablecer}
                            </div>
                            {selectorDePiezas}
                        </div>
                    )}
                    {!foto && !esPeriodo && (
                        // [P1-PLAN-LOTE-1092] «mejora el diseño de este también»: el mismo segmentado que la semana y un
                        // interruptor de verdad en vez de la casilla en su caja
                        <div className={styles.conFoto}>
                            <div className={`${styles.capas} ${styles.formatosDia}`} role="radiogroup" aria-label={t('Formato de la imagen')}>
                                {[['publicacion', t('Publicación')], ['historia', t('Historia')]].map(([clave, rotulo]) => (
                                    <button
                                        key={clave} type="button" role="radio" aria-checked={formato === clave}
                                        className={formato === clave ? `${styles.capa} ${styles.formatoDia} ${styles.capaActiva}` : `${styles.capa} ${styles.formatoDia}`}
                                        onClick={() => setFormato(clave)}
                                    >
                                        <span>{rotulo}</span>
                                        {/* [P1-PLAN-LOTE-1049] qué es cada uno («¿cuál es la diferencia?», el dueño) */}
                                        <span className={styles.formatoSub}>{clave === 'publicacion' ? t('4:5 · chats y feed') : t('9:16 · historias y estados')}</span>
                                    </button>
                                ))}
                            </div>
                            <label className={styles.toggle}>
                                <span>{t('Incluir lo que comí')}</span>
                                <input type="checkbox" role="switch" className={styles.interruptor} checked={incluirComidas} onChange={(e) => setIncluirComidas(e.target.checked)} />
                            </label>
                        </div>
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
            {editorCompleto}
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
    metas: PropTypes.object,
    microMetas: PropTypes.object,
    // [P1-COMPARTIR-DIA-PASADO] el día que se comparte (desde el Diario); sin ella, hoy
    fecha: PropTypes.instanceOf(Date),
    // [P1-PLAN-LOTE-1082] la semana que se comparte (lo que pinta «Tu semana»: número, días, estrellas, racha, rango)
    // [P1-PLAN-LOTE-1100] el mes que se comparte (lo que pinta el calendario: nombre, día de la semana del 1, días)
    mes: PropTypes.shape({ nombre: PropTypes.string, inicio: PropTypes.number, dias: PropTypes.array, enCurso: PropTypes.bool }),
    // [P1-PLAN-LOTE-1132] el camino del mapa de niveles (día, estrellas, racha, mundo y los últimos niveles)
    mapa: PropTypes.shape({ nivelHoy: PropTypes.number, estrellas: PropTypes.number, racha: PropTypes.number, mundo: PropTypes.string, dias: PropTypes.array }),
    semana: PropTypes.shape({
        numero: PropTypes.number, enCurso: PropTypes.bool, periodo: PropTypes.string, dias: PropTypes.array,
        enMeta: PropTypes.number, estrellas: PropTypes.number, racha: PropTypes.number, rango: PropTypes.string,
    }),
};

export default ShareDaySheet;
