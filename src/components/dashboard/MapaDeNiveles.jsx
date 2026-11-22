// [P1-PLAN-LOTE-1131 · 2026-11-20] El «Registro por día» como MAPA DE NIVELES (pedido del dueño: «estilo video juego como
// Candy Crush y sus sistemas de niveles pero con la gama de colores de Bioboros… quiero un efecto wow»; opción A: CADA
// DÍA ES UN NIVEL). Es la vista PRINCIPAL del cajón; el calendario del mes sigue como segunda pestaña.
//
// Qué se ve (de arriba abajo = de lo nuevo a lo viejo; el camino se SUBE, como en los juegos):
//  · una ventana de noche estrellada con su marcador flotante (día del camino, mundo, estrellas, racha); tocar cada
//    pastilla explica qué cuenta;
//  · los días como niveles sobre un camino que serpentea: verde en meta (✓), ámbar bajo la meta, coral sobre la
//    meta, punteado sin registro, candado los que vienen; hoy, más grande, con su halo y el cartel «Estás aquí»;
//  · cada semana se cierra con su trofeo y sus 1-3 estrellas (las MISMAS de «S9» en el calendario y de Progreso).
// Tocar un día lo elige (el detalle del día sigue debajo, como con el calendario). Lógica pura en `utils/mapaDeNiveles`.
//
// [P1-PLAN-LOTE-1132 · 2026-11-20] Segunda pasada (plan de mejora + las ideas propuestas al cerrar el 1131):
//  · más denso (5-6 días y la curva entera a la vista), marco nítido (la máscara va en el scroll, no en el marco),
//    nodos menos «plástico», «Hoy» al pie del día de hoy, leyenda en una línea, copy de la primera estrella;
//  · MUNDOS: cada rango de la escalera (Bronce → Diamante) es un tramo del camino con su paisaje y su puerta;
//  · CELEBRACIÓN al cerrar un día en meta (o al abrir un mundo), una vez por cosa y solo lo reciente;
//  · «Ir a hoy» cuando te alejas, háptica al tocar y «Compartir mi camino» como historia.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { ArrowDown, ArrowUp, Check, Maximize2, Minimize2, Crown, Flag, Flame, Gem, Gift, Lock, MapPin, Medal, PartyPopper, Share, Shield, Star, Trophy } from 'lucide-react';
import { formatDate, formatNumber, useT, useTn } from '../../i18n';
import { DIAS_DE_LA_SEMANA, ESTRELLAS_MAX, estrellasDeLaSemana, mediodiaDe } from '../../utils/progresoDeLosDias';
import { adornosDelMapa, armarMapa, celebracionPendiente, filasDelMapa, trazo } from '../../utils/mapaDeNiveles';
import { triggerMobileHaptic } from '../../utils/mobileHaptics';
import { ESCALERA, posicionEnLaEscalera } from '../../utils/caminoDeRangos';
import { ESTRELLAS_SEMANA, RANGOS_PUNTOS, faltanParaOtraEstrella, nombreDelRango, rangoPorPuntos } from '../../utils/juegoPuntos';
import { Button } from '../ui/Button';
import styles from './MapaDeNiveles.module.css';

const UMBRALES = ESCALERA.map((e) => e.desde);
const UMBRALES_PUNTOS = RANGOS_PUNTOS.map(([, desde]) => desde);   // [1161]
const ICONO_MUNDO = { bronce: Medal, plata: Medal, oro: Trophy, platino: Crown, diamante: Gem };
export const CLAVE_CELEBRADAS = 'mealfit_mapa_celebradas';
const AYUDA_MS = 4500;
const CELEBRACION_MS = 3600;
const ANCLA = 0.4;
const BAJO_EL_MARCADOR = 52;   // alto del marcador flotante (pastillas de 30 px a 10 px del borde) + aire
const AIRE_ABAJO = 28;          // [1162] lo que necesita la tarjeta de abajo para no quedar bajo la sombra del borde
const MITAD_HOY = 86;           // [1162] media fila de hoy (74) + el cartel «Estás aquí» que asoma por encima

const ETIQUETA = (t) => ({
    meta: t('En meta'),
    bajo: t('Bajo la meta'),
    sobre: t('Sobre la meta'),
    vacio: t('Sin registro'),
    futuro: t('Bloqueado'),
});
const NOMBRE_MUNDO = (t) => ({ bronce: t('Bronce'), plata: t('Plata'), oro: t('Oro'), platino: t('Platino'), diamante: t('Diamante') });

const leerCelebradas = () => {
    try {
        const v = JSON.parse(window.localStorage.getItem(CLAVE_CELEBRADAS) || '[]');
        return new Set(Array.isArray(v) ? v : []);
    } catch { return new Set(); }
};
const guardarCelebrada = (clave) => {
    try {
        const v = [...leerCelebradas(), clave].slice(-30);
        window.localStorage.setItem(CLAVE_CELEBRADAS, JSON.stringify(v));
    } catch { /* sin almacenamiento: se celebra otra vez, nada más */ }
};
const sinMovimiento = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

// El confeti: 16 trocitos en abanico (ángulo, distancia y tono fijos: es un dibujo, no un azar en cada render).
const CONFETI = Array.from({ length: 16 }, (_, k) => ({
    clave: k,
    tono: ['meta', 'oro', 'primario', 'acento'][k % 4],
    estilo: { '--ang': `${(k * 360) / 16 + (k % 2 ? 9 : -9)}deg`, '--dist': `${70 + (k % 3) * 26}px`, '--giro': `${k % 2 ? 220 : -180}deg` },
}));

// [P1-PLAN-LOTE-1155] la insignia de estado de cada nivel
const INSIGNIA = {
    meta: <Check strokeWidth={3.5} />,
    bajo: <ArrowDown strokeWidth={3.25} />,
    sobre: <ArrowUp strokeWidth={3.25} />,
};

function Estrellas({ n }) {
    return (
        <span className={styles.estrellas} aria-hidden="true">
            {Array.from({ length: ESTRELLAS_MAX }, (_, k) => (
                <Star key={k} className={k < n ? styles.estrellaOn : styles.estrellaOff} strokeWidth={2.25} />
            ))}
        </span>
    );
}
Estrellas.propTypes = { n: PropTypes.number.isRequired };

// [P1-PLAN-LOTE-1146] La barra de la semana: 7 tramos (uno por día en meta) con los hitos de estrella (3.º, 5.º, 7.º)
// marcados: se VE cuánto falta para la siguiente, no solo se lee.
const HITOS = Array.from({ length: DIAS_DE_LA_SEMANA }, (_, k) => estrellasDeLaSemana(k + 1) > estrellasDeLaSemana(k));
function BarraDeLaSemana({ enMeta }) {
    return (
        <span className={styles.barra} aria-hidden="true">
            {HITOS.map((hito, k) => (
                <span key={k} className={`${styles.tramo} ${k < enMeta ? styles.tramoLleno : ''} ${hito ? styles.tramoHito : ''}`}>
                    {hito && <Star className={styles.tramoEstrella} strokeWidth={2.5} />}
                </span>
            ))}
        </span>
    );
}
BarraDeLaSemana.propTypes = { enMeta: PropTypes.number.isRequired };

// [P1-PLAN-LOTE-1162 · 2026-11-22] Con el juego por puntos la barra es de PUNTOS: se llena hacia los 260 y lleva las
// tres estrellas donde se ganan (80, 160, 260). Antes contaba días en meta y contradecía las estrellas del servidor
// («Semana perfecta ★★★» con una barra casi vacía).
const TOPE_SEMANA = ESTRELLAS_SEMANA[ESTRELLAS_SEMANA.length - 1];
const estiloLleno = (pts) => ({ '--lleno': `${Math.round(Math.min(1, Math.max(0, pts / TOPE_SEMANA)) * 100)}%` });
const estiloHito = (u) => ({ '--en': `${Math.round((u / TOPE_SEMANA) * 100)}%` });
function BarraDePuntos({ puntos }) {
    return (
        <span className={styles.barraPts} style={estiloLleno(puntos)} aria-hidden="true">
            <i className={styles.barraPtsLleno} />
            {ESTRELLAS_SEMANA.map((u) => (
                <Star key={u} className={`${styles.barraPtsHito} ${puntos >= u ? styles.barraPtsHitoHecho : ''}`} style={estiloHito(u)} strokeWidth={2.5} />
            ))}
        </span>
    );
}
BarraDePuntos.propTypes = { puntos: PropTypes.number.isRequired };

export default function MapaDeNiveles({ inicioISO, hoyISO, selected, estadoDe, porFecha, onElegir, onCompartir, onGrande, juego = null }) {
    const t = useT();
    // [P1-PLAN-LOTE-1135] «En grande» (el dueño: «en pc que se pueda poner en grande para ver todo… la gente de pc no
    // tiene forma de scrollear desde afuera»): el mapa a pantalla completa, en PC y en móvil. Escape o el botón lo
    // devuelven al cajón; el cajón lo sabe (`onGrande`) para que su Escape no lo cierre a él.
    const [grande, setGrande] = useState(false);
    // [P1-PLAN-LOTE-1138] RENDIMIENTO («no lo siento tan rápido», sobre todo abrir en grande): solo se pintan las filas
    // cerca de lo que se ve (± una pantalla); con 371 niveles, abrir pintaba los 371 con sus animaciones y sombras.
    // `vista` = { top, h } de la ventana, en tramos de 160 px para no repintar en cada píxel del scroll.
    const [vista, setVista] = useState(null);
    // Las entradas animadas (niveles que «saltan» al abrir) solo al ABRIR: lo que entra luego al desplazarte aparece
    // ya quieto (si no, cada fila nueva hacía su salto con retraso y el scroll se sentía lento).
    const [entrando, setEntrando] = useState(true);
    useEffect(() => {
        if (!entrando) return undefined;
        const id = setTimeout(() => setEntrando(false), 1100);
        return () => clearTimeout(id);
    }, [entrando]);
    const cambiarGrande = useCallback((v) => {
        setGrande(v);
        setVista(null);
        setEntrando(true);         // la ventana nueva arranca en su sitio: el tramo pintado se recalcula desde ahí
        onGrande?.(v);
        triggerMobileHaptic('light');
    }, [onGrande]);
    useEffect(() => {
        if (!grande) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); cambiarGrande(false); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [grande, cambiarGrande]);
    useEffect(() => () => { if (grande) onGrande?.(false); }, [grande, onGrande]);
    const tn = useTn();
    const ventanaRef = useRef(null);
    const lienzoRef = useRef(null);
    // El SVG trabaja en PÍXELES reales (viewBox = ancho medido): con `non-scaling-stroke` el guion animado del camino
    // se medía en pantalla y solo pintaba 1 px.
    const [ancho, setAncho] = useState(360);
    useLayoutEffect(() => {
        const el = lienzoRef.current;
        if (!el) return undefined;
        const medir = () => { const w = el.clientWidth; if (w > 0) setAncho(w); };
        medir();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    // [1135] al pasar a/desde «en grande» el lienzo es OTRO nodo (vive en el portal): hay que medir el nuevo
    }, [grande]);
    const etiquetas = ETIQUETA(t);
    const nombres = NOMBRE_MUNDO(t);

    // [P1-PLAN-LOTE-1161] con el juego por puntos, las estrellas y la racha son las del servidor y los mundos se abren por puntos
    const mapa = useMemo(
        () => armarMapa({ inicioISO, hoyISO, estadoDe, umbrales: juego ? UMBRALES_PUNTOS : UMBRALES, servidor: juego }),
        [inicioISO, hoyISO, estadoDe, juego],
    );
    const { filas, alto, zonas } = useMemo(() => filasDelMapa(mapa.semanas), [mapa]);
    // [P1-PLAN-LOTE-1155] el paisaje a los lados del camino (planetas, lunas, destellos, cometas)
    const adornos = useMemo(() => adornosDelMapa(filas), [filas]);
    const claveMundo = (i) => ESCALERA[i]?.clave || 'bronce';
    const escalera = posicionEnLaEscalera(mapa.estrellas);
    const sigMundo = juego ? RANGOS_PUNTOS[mapa.mundo + 1] || null : null;

    // El camino: lo RECORRIDO (del inicio a hoy, de abajo arriba) brilla y se dibuja al abrir; lo que VIENE va punteado.
    const { recorrido, porVenir } = useMemo(() => {
        const puntos = filas.map((f) => ({ x: (f.x / 100) * ancho, y: f.y, hoy: f.tipo === 'dia' && f.dia.esHoy }));
        const iHoy = puntos.findIndex((p) => p.hoy);
        if (iHoy < 0) return { recorrido: trazo(puntos.slice().reverse()), porVenir: '' };
        return { recorrido: trazo(puntos.slice(iHoy).reverse()), porVenir: trazo(puntos.slice(0, iHoy + 1)) };
    }, [filas, ancho]);

    // Al abrir (y al cambiar de día desde fuera, p. ej. «Tu semana»), el día elegido queda centrado en la ventana.
    const yHoy = filas.find((f) => f.tipo === 'dia' && f.dia.esHoy)?.y ?? 0;
    const yElegido = filas.find((f) => f.tipo === 'dia' && f.dia.iso === selected)?.y ?? yHoy;
    // [P1-PLAN-LOTE-1133] «me debería abrir más arriba» (el dueño): el trofeo de la semana del día quedaba cortado bajo
    // el marcador. Ahora la ventana arranca con ESE trofeo entero justo bajo el marcador; solo si el día queda muy
    // abajo (un domingo de una semana larga) manda el día, que nunca pasa del 72 % de la ventana.
    const topeDe = (iso) => {
        const dia = filas.find((f) => f.tipo === 'dia' && f.dia.iso === iso);
        const trofeo = dia && filas.find((f) => f.tipo === 'trofeo' && f.semana === dia.semana);
        return trofeo ? trofeo.y - trofeo.alto / 2 : null;
    };
    const topeElegido = topeDe(selected) ?? topeDe(hoyISO);
    const topeHoy = topeDe(hoyISO);
    // [P1-PLAN-LOTE-1162] lo que hay JUSTO debajo del día (el trofeo de la semana anterior, o una puerta de mundo): su
    // borde inferior. El dueño: «lo que veo que se tapa cuando abro el mapa» — en domingo (día 1 de la semana) el día
    // quedaba al 72 % y la tarjeta de la semana pasada, cortada contra el borde bajo la sombra del marco.
    const fondoDe = (iso) => {
        const i = filas.findIndex((f) => f.tipo === 'dia' && f.dia.iso === iso);
        const abajo = i >= 0 ? filas[i + 1] : null;
        return abajo && abajo.tipo !== 'dia' ? abajo.y + abajo.alto / 2 : null;
    };
    const fondoElegido = fondoDe(selected) ?? fondoDe(hoyISO);
    const fondoHoy = fondoDe(hoyISO);
    const yaCentradoRef = useRef(false);
    const irA = useCallback((y, suave, tope = null, fondo = null) => {
        const v = ventanaRef.current;
        if (!v) return;
        const h = v.clientHeight;
        let destino = tope != null ? tope - BAJO_EL_MARCADOR : y - h * ANCLA;
        if (y - destino > h * 0.72) destino = y - h * 0.72;
        // [1162] que la tarjeta de debajo quepa ENTERA (con aire sobre la sombra del borde), sin subir tanto que el día
        // y su «Estás aquí» se metan bajo el marcador
        if (fondo != null && fondo + AIRE_ABAJO > destino + h) {
            destino = Math.min(fondo + AIRE_ABAJO - h, y - MITAD_HOY - BAJO_EL_MARCADOR);
        }
        destino = Math.max(0, destino);
        if (typeof v.scrollTo === 'function') v.scrollTo({ top: destino, behavior: suave && !sinMovimiento() ? 'smooth' : 'auto' });
        else v.scrollTop = destino;
    }, []);
    useLayoutEffect(() => {
        // la primera vez, al instante (abrir ya en tu día); después, deslizando (sin saltos al tocar)
        irA(yElegido, yaCentradoRef.current, topeElegido, fondoElegido);
        yaCentradoRef.current = true;
    }, [yElegido, topeElegido, fondoElegido, irA, grande]);
    // en grande, la ventana toma el foco: rueda, flechas, Re Pág/Av Pág y espacio la desplazan sin tocar nada más
    const enfocarVentana = useCallback(() => { ventanaRef.current?.focus?.({ preventScroll: true }); }, []);
    useEffect(() => {
        if (grande) enfocarVentana();
    }, [grande, enfocarVentana]);

    // «Ir a hoy»: aparece cuando hoy queda fuera de la ventana (explorando semanas viejas).
    const [lejosDeHoy, setLejosDeHoy] = useState(false);
    const rafRef = useRef(0);
    const onScroll = useCallback(() => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            const v = ventanaRef.current;
            if (!v) return;
            setLejosDeHoy(Math.abs(v.scrollTop + v.clientHeight * ANCLA - yHoy) > v.clientHeight * 0.55);
            const top = Math.round(v.scrollTop / 160) * 160;
            const h = v.clientHeight;
            setVista((a) => (a && a.top === top && a.h === h ? a : { top, h }));
        });
    }, [yHoy]);
    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
    const irAHoy = () => {
        triggerMobileHaptic('light');
        onElegir(hoyISO);
        irA(yHoy, true, topeHoy, fondoHoy);
    };

    // Las pastillas del marcador explican lo que cuentan (una a la vez; se cierra sola o al volver a tocar).
    const [ayuda, setAyuda] = useState(null);
    useEffect(() => {
        if (!ayuda) return undefined;
        const id = setTimeout(() => setAyuda(null), AYUDA_MS);
        return () => clearTimeout(id);
    }, [ayuda]);
    const alternarAyuda = (cual) => setAyuda((a) => (a === cual ? null : cual));
    const textoAyuda = {
        dia: t('Día {n} de tu camino: cuenta desde tu primer día.', { n: formatNumber(mapa.nivelHoy) }),
        mundo: juego
            ? (sigMundo
                ? t('Tu rango es tu mundo. Te faltan {n} pts para {siguiente}.', { n: formatNumber(sigMundo[1] - (mapa.puntos || 0)), siguiente: nombres[sigMundo[0]] })
                : t('Llegaste al último mundo: Diamante.'))
            : escalera.siguiente
            ? tn(escalera.faltan, 'Tu rango es tu mundo. Te falta {n} estrella para {siguiente}.', 'Tu rango es tu mundo. Te faltan {n} estrellas para {siguiente}.', { n: escalera.faltan, siguiente: nombres[escalera.siguiente.clave] })
            : t('Llegaste al último mundo: Diamante.'),
        estrellas: juego
            ? t('Cada semana da hasta 3 estrellas según los puntos que sumes.')
            : t('Cada semana da hasta 3 estrellas: con 3, 5 y 7 días en meta.'),
        racha: juego
            ? t('Días seguidos registrando: multiplican tus puntos. Hoy no la corta mientras el día no termine.')
            : t('Días seguidos en meta. Hoy no la corta mientras el día no termine.'),
    };

    // La celebración: una vez por cosa (se anota al verse) y se va sola.
    const [celebradas, setCelebradas] = useState(leerCelebradas);
    const celebracion = useMemo(() => celebracionPendiente(mapa, celebradas), [mapa, celebradas]);
    // Por su CLAVE: el mapa se rehace con cada dato que llega y no debe anotar ni vibrar otra vez lo mismo.
    const claveCelebracion = celebracion?.clave || null;
    useEffect(() => {
        if (!claveCelebracion) return undefined;
        guardarCelebrada(claveCelebracion);
        triggerMobileHaptic('success');
        const id = setTimeout(() => setCelebradas((s) => new Set([...s, claveCelebracion])), CELEBRACION_MS);
        return () => clearTimeout(id);
    }, [claveCelebracion]);
    const cerrarCelebracion = () => { if (celebracion) setCelebradas((s) => new Set([...s, celebracion.clave])); };

    const lienzoEstilo = useMemo(() => ({ height: `${alto}px` }), [alto]);
    const zonasEstilo = useMemo(() => zonas.map((z) => ({ ...z, estilo: { top: `${z.y0}px`, height: `${z.y1 - z.y0}px` } })), [zonas]);
    const iElegido = Math.max(0, filas.findIndex((f) => f.y === yElegido));
    // El tramo que se pinta: lo visible ± una pantalla larga (antes del primer scroll, alrededor de donde abre).
    const rango = vista || { top: Math.max(0, (topeElegido ?? yElegido) - BAJO_EL_MARCADOR - 480), h: 1200 };
    const filasVisibles = filas.map((f, idx) => [f, idx]).filter(([f]) => f.y >= rango.top - 1000 && f.y <= rango.top + rango.h + 1000);
    const adornosVisibles = adornos.filter((a) => a.y >= rango.top - 1000 && a.y <= rango.top + rango.h + 1000);
    const fechaLarga = (iso) => formatDate(mediodiaDe(iso), { weekday: 'long', day: 'numeric', month: 'long' });

    const compartir = () => {
        const dias = mapa.semanas.flatMap((s) => s.dias).filter((d) => d.estado !== 'futuro').reverse();
        onCompartir({ nivelHoy: mapa.nivelHoy, estrellas: mapa.estrellas, racha: mapa.racha, mundo: claveMundo(mapa.mundo), dias });
    };

    const mundoHoy = claveMundo(mapa.mundo);
    // [1162] con el juego por puntos el marcador dice el rango CON división, igual que «Tu semana» («Plata II»)
    const rangoHud = juego ? (juego.rango || rangoPorPuntos(juego.totalPuntos ?? mapa.puntos ?? 0)) : null;
    const chip = (cual, clase, contenido, titulo) => (
        <button type="button" className={`${styles.hudChip} ${clase}`} title={titulo}
            aria-expanded={ayuda === cual} aria-controls="mapa-ayuda" onClick={() => alternarAyuda(cual)}>
            {contenido}
        </button>
    );

    const seccion = (
        <section className={`${styles.mapa} ${grande ? styles.mapaGrande : ''}`} aria-label={t('Mapa de niveles')} data-testid="mapa-de-niveles">
            <div className={styles.ventanaMarco}>
                <div className={styles.hud}>
                    <span className={styles.hudLado}>
                        <button type="button" className={`${styles.hudChip} ${styles.hudGrande}`}
                            onClick={() => cambiarGrande(!grande)}
                            aria-label={grande ? t('Salir de la vista grande') : t('Ver el mapa en grande')}
                            title={grande ? t('Salir de la vista grande') : t('Ver el mapa en grande')}>
                            {grande ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
                        </button>
                        {chip('dia', '', <><MapPin aria-hidden="true" />{t('Día {n}', { n: formatNumber(mapa.nivelHoy) })}</>, t('Día del camino'))}
                        {chip('mundo', styles.hudMundo, <><span className={`${styles.hudMedalla} ${styles[`medalla_${mundoHoy}`]}`} aria-hidden="true" />{rangoHud ? nombreDelRango(rangoHud.clave, rangoHud.division, t) : nombres[mundoHoy]}</>, t('Mundo'))}
                    </span>
                    <span className={styles.hudLado}>
                        {chip('estrellas', styles.hudEstrellas, <><Star aria-hidden="true" /><b>{formatNumber(mapa.estrellas)}</b><span className={styles.srOnly}>{t('Estrellas')}</span></>, t('Estrellas'))}
                        {chip('racha', `${styles.hudRacha} ${mapa.racha > 0 ? styles.hudRachaViva : ''}`, <><Flame aria-hidden="true" /><b>{formatNumber(mapa.racha)}</b><span className={styles.srOnly}>{t('Racha')}</span></>, t('Racha'))}
                    </span>
                </div>
                <p id="mapa-ayuda" className={`${styles.ayuda} ${ayuda ? styles.ayudaVisible : ''}`} role="status" aria-live="polite">
                    {ayuda ? textoAyuda[ayuda] : ''}
                </p>

                {/* el cielo va en el MARCO (del tamaño de la pantalla), no en el lienzo de miles de px que se desplaza */}
                <span className={styles.cielo} aria-hidden="true" />
                <div ref={ventanaRef} className={styles.ventana} onScroll={onScroll} tabIndex={grande ? 0 : undefined}>
                    <div ref={lienzoRef} className={`${styles.lienzo} ${entrando ? '' : styles.lienzoQuieto}`} style={lienzoEstilo}>
                        {zonasEstilo.map((z) => (
                            <span key={`z-${z.y0}`} className={`${styles.zona} ${styles[`zona_${claveMundo(z.mundo)}`]}`} style={z.estilo} aria-hidden="true" />
                        ))}
                        {adornosVisibles.map((a) => (
                            <span key={a.clave}
                                className={`${styles.adorno} ${styles[`adorno_${a.tipo}`]} ${styles[`zona_${claveMundo(a.mundo)}`]}`}
                                style={{ left: `${a.x}%`, top: `${a.y}px`, '--tam': `${a.tam}px` }} aria-hidden="true" />
                        ))}
                        <svg className={styles.camino} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
                            <defs>
                                <linearGradient id="mapaRecorrido" x1="0" y1="1" x2="0" y2="0" gradientUnits="objectBoundingBox">
                                    <stop offset="0%" className={styles.gradA} />
                                    <stop offset="100%" className={styles.gradB} />
                                </linearGradient>
                            </defs>
                            {porVenir && <path d={porVenir} className={styles.caminoPorVenir} />}
                            <path d={recorrido} className={styles.caminoBase} />
                            <path d={recorrido} className={styles.caminoHalo} />
                            <path d={recorrido} className={styles.caminoBrillo} stroke="url(#mapaRecorrido)" pathLength="1" />
                            {/* [1155] la línea central del camino recorrido: una fila de puntos, como un sendero */}
                            <path d={recorrido} className={styles.caminoPuntos} />
                        </svg>

                        <ol className={styles.niveles}>
                            {filasVisibles.map(([f, idx]) => {
                                const pos = { left: `${f.x}%`, top: `${f.y}px`, '--orden': Math.min(14, Math.abs(idx - iElegido)) };
                                if (f.tipo === 'puerta' || f.tipo === 'inicio') {
                                    const clave = claveMundo(f.mundo);
                                    const Icono = f.tipo === 'inicio' ? Flag : ICONO_MUNDO[clave];
                                    const titulo = f.tipo === 'inicio' ? t('Inicio') : t('Mundo {nombre}', { nombre: nombres[clave] });
                                    const sub = f.tipo === 'inicio'
                                        ? t('Mundo {nombre}', { nombre: nombres[clave] })
                                        : juego
                                            ? t('Desde {n} pts', { n: formatNumber(RANGOS_PUNTOS[f.mundo]?.[1] || 0) })
                                            : t('Desde {n} estrellas', { n: formatNumber(ESCALERA[f.mundo].desde) });
                                    return (
                                        <li key={f.clave} className={styles.puertaFila} style={pos}>
                                            <div className={`${styles.puerta} ${f.tipo === 'inicio' ? styles.puertaInicio : ''}`} role="img" aria-label={`${titulo} · ${sub}`}>
                                                <span className={`${styles.medalla} ${styles[`medalla_${clave}`]}`} aria-hidden="true"><Icono /></span>
                                                <span className={styles.puertaTexto} aria-hidden="true">
                                                    <b>{titulo}</b>
                                                    <small>{sub}</small>
                                                </span>
                                            </div>
                                        </li>
                                    );
                                }
                                if (f.tipo === 'trofeo') {
                                    const s = f.semana;
                                    const Icono = s.enCurso ? Gift : Trophy;
                                    return (
                                        <li key={f.clave} className={styles.trofeoFila} style={pos}>
                                            <div className={`${styles.trofeo} ${s.estrellas === ESTRELLAS_MAX ? styles.trofeoPerfecto : ''} ${s.enCurso ? styles.trofeoEnCurso : ''} ${!s.enCurso && s.estrellas === 0 ? styles.trofeoVacio : ''}`}
                                                role="img"
                                                aria-label={`${t('Semana {n}', { n: s.numero })}: ${t('{n} de {total} estrellas', { n: s.estrellas, total: ESTRELLAS_MAX })}`}>
                                                <span className={styles.trofeoIcono} aria-hidden="true"><Icono /></span>
                                                <span className={styles.trofeoTexto} aria-hidden="true">
                                                    <span className={styles.trofeoLinea}>
                                                        <b>{t('Semana {n}', { n: s.numero })}</b>
                                                        <Estrellas n={s.estrellas} />
                                                    </span>
                                                    <small>
                                                        {juego && s.puntos != null
                                                            ? (s.estrellas === ESTRELLAS_MAX
                                                                ? t('{n} pts · Semana perfecta', { n: formatNumber(s.puntos) })
                                                                : s.enCurso
                                                                    ? (s.estrellas === 0
                                                                        ? t('{n} pts · faltan {f} para tu primera estrella', { n: formatNumber(s.puntos), f: formatNumber(faltanParaOtraEstrella(s.puntos)) })
                                                                        : t('{n} pts · faltan {f} para otra estrella', { n: formatNumber(s.puntos), f: formatNumber(faltanParaOtraEstrella(s.puntos)) }))
                                                                    : t('{n} pts', { n: formatNumber(s.puntos) }))
                                                        : s.estrellas === ESTRELLAS_MAX
                                                            ? t('Semana perfecta')
                                                            : s.enCurso
                                                                ? s.estrellas === 0
                                                                    ? tn(s.faltan, 'Falta {n} día en meta para tu primera estrella', 'Faltan {n} días en meta para tu primera estrella', { n: s.faltan })
                                                                    : tn(s.faltan, 'Falta {n} día en meta para otra estrella', 'Faltan {n} días en meta para otra estrella', { n: s.faltan })
                                                                : tn(s.enMeta, '{n} día en meta', '{n} días en meta', { n: s.enMeta })}
                                                    </small>
                                                    {juego && s.puntos != null
                                                        ? <BarraDePuntos puntos={Number(s.puntos) || 0} />
                                                        : <BarraDeLaSemana enMeta={s.enMeta} />}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                }
                                const d = f.dia;
                                const r = porFecha?.get?.(d.iso);
                                const activo = d.iso === selected;
                                const bloqueado = d.estado === 'futuro';
                                const salvado = d.estado === 'vacio' && Boolean(juego?.escudosUsados?.has?.(d.iso));
                                const fecha = mediodiaDe(d.iso);
                                const celebrado = celebracion?.tipo === 'dia' && celebracion.iso === d.iso;
                                const detalle = r && (r.meals_count || 0) > 0
                                    ? ` · ${t('{kcal} kcal · {n} comida(s)', { kcal: formatNumber(Math.round(r.calories || 0)), n: r.meals_count })}`
                                    : '';
                                return (
                                    <li key={f.clave} className={styles.nivelFila} style={pos}>
                                        {d.esHoy && (
                                            <span className={styles.cartel} aria-hidden="true"><MapPin className={styles.cartelPin} strokeWidth={2.5} />{t('Estás aquí')}</span>
                                        )}
                                        <button
                                            type="button"
                                            className={`${styles.nivel} ${styles[`nivel_${d.estado}`]} ${d.esHoy ? styles.nivelHoy : ''} ${activo ? styles.nivelActivo : ''} ${celebrado ? styles.nivelCelebrado : ''} ${salvado ? styles.nivelEscudo : ''}`}
                                            disabled={bloqueado}
                                            aria-pressed={activo}
                                            aria-label={`${fechaLarga(d.iso)} · ${t('Día {n}', { n: d.nivel })} · ${etiquetas[d.estado]}${salvado ? ` · ${t('Escudo protegió tu racha')}` : ''}${detalle}`}
                                            onClick={() => { if (!bloqueado) { triggerMobileHaptic('light'); onElegir(d.iso); } }}
                                        >
                                            {/* [1155] el número del día SIEMPRE a la vista; el estado, en una insignia (✓ en meta, ↓ bajo,
                                                ↑ sobre): se distingue también sin color, y el pie ya no repite la fecha */}
                                            <span className={styles.nivelCara} aria-hidden="true">
                                                {bloqueado ? <Lock /> : fecha.getDate()}
                                            </span>
                                            {(INSIGNIA[d.estado] || salvado) && (
                                                <span className={`${styles.insignia} ${salvado ? styles.insignia_escudo : styles[`insignia_${d.estado}`]}`} aria-hidden="true">
                                                    {salvado ? <Shield strokeWidth={2.75} /> : INSIGNIA[d.estado]}
                                                </span>
                                            )}
                                        </button>
                                        <span className={`${styles.nivelPie} ${d.esHoy ? styles.nivelPieHoy : ''}`} aria-hidden="true">
                                            {d.esHoy ? t('Hoy') : formatDate(fecha, { weekday: 'short' })}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                </div>

                {lejosDeHoy && (
                    <button type="button" className={styles.irAHoy} onClick={irAHoy}>
                        <ArrowUp aria-hidden="true" strokeWidth={2.5} />
                        {t('Ir a hoy')}
                    </button>
                )}

                {celebracion && (
                    <button type="button" className={styles.celebracion} onClick={cerrarCelebracion} aria-live="assertive">
                        <span className={styles.confeti} aria-hidden="true">
                            {CONFETI.map((p) => <span key={p.clave} className={`${styles.trocito} ${styles[`trocito_${p.tono}`]}`} style={p.estilo} />)}
                        </span>
                        <span className={`${styles.celebracionIcono} ${celebracion.tipo === 'mundo' ? styles[`medalla_${claveMundo(celebracion.mundo)}`] : ''}`} aria-hidden="true">
                            {celebracion.tipo === 'mundo' ? <Crown /> : <PartyPopper />}
                        </span>
                        <b>
                            {celebracion.tipo === 'mundo'
                                ? t('¡Mundo {nombre} desbloqueado!', { nombre: nombres[claveMundo(celebracion.mundo)] })
                                : celebracion.esHoy ? t('¡Nivel superado!') : t('¡Ayer cerraste en meta!')}
                        </b>
                        <small>
                            {celebracion.tipo === 'mundo'
                                ? t('Tu camino sigue en un paisaje nuevo')
                                : celebracion.estrella ? t('+1 estrella para tu semana') : t('Un día más en meta')}
                        </small>
                    </button>
                )}
            </div>

            <ul className={styles.leyenda} aria-label={t('Leyenda')}>
                {[['meta', t('En meta')], ['bajo', t('Bajo')], ['sobre', t('Sobre')], ['vacio', t('Sin registro')]].map(([e, rotulo]) => (
                    <li key={e}><span className={`${styles.leyendaPunto} ${styles[`punto_${e}`]}`} aria-hidden="true">{INSIGNIA[e]}</span>{rotulo}</li>
                ))}
            </ul>

            {onCompartir && mapa.semanas.length > 0 && (
                <Button variant="secondary" block className={styles.compartir} onClick={compartir}>
                    <Share size={16} strokeWidth={2.25} aria-hidden="true" />
                    {t('Compartir mi camino')}
                </Button>
            )}
        </section>
    );

    if (!grande) return seccion;
    return createPortal(
        <div className={styles.capaGrande} role="dialog" aria-modal="true" aria-label={t('Mapa de niveles')}>
            <button type="button" className={styles.veloGrande} onClick={() => cambiarGrande(false)} aria-label={t('Salir de la vista grande')} tabIndex={-1} />
            {seccion}
        </div>,
        document.body,
    );
}

MapaDeNiveles.propTypes = {
    inicioISO: PropTypes.string,
    hoyISO: PropTypes.string.isRequired,
    selected: PropTypes.string,
    estadoDe: PropTypes.func.isRequired,
    porFecha: PropTypes.instanceOf(Map),
    onElegir: PropTypes.func.isRequired,
    onCompartir: PropTypes.func,
    onGrande: PropTypes.func,
    juego: PropTypes.shape({
        estrellas: PropTypes.instanceOf(Map),
        puntos: PropTypes.instanceOf(Map),
        racha: PropTypes.number,
        escudosUsados: PropTypes.instanceOf(Set),
        totalPuntos: PropTypes.number,
        rango: PropTypes.object,
    }),
};
