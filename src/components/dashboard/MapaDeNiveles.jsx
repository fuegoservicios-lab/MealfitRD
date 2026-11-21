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
import PropTypes from 'prop-types';
import { ArrowUp, Check, Crown, Flag, Flame, Gem, Gift, Lock, MapPin, Medal, PartyPopper, Share, Star, Trophy } from 'lucide-react';
import { formatDate, formatNumber, useT, useTn } from '../../i18n';
import { ESTRELLAS_MAX, mediodiaDe } from '../../utils/progresoDeLosDias';
import { armarMapa, celebracionPendiente, filasDelMapa, trazo } from '../../utils/mapaDeNiveles';
import { triggerMobileHaptic } from '../../utils/mobileHaptics';
import { ESCALERA, posicionEnLaEscalera } from './EscaleraDeRangos';
import { Button } from '../ui/Button';
import styles from './MapaDeNiveles.module.css';

const UMBRALES = ESCALERA.map((e) => e.desde);
const ICONO_MUNDO = { bronce: Medal, plata: Medal, oro: Trophy, platino: Crown, diamante: Gem };
export const CLAVE_CELEBRADAS = 'mealfit_mapa_celebradas';
const AYUDA_MS = 4500;
const CELEBRACION_MS = 3600;
const ANCLA = 0.4;
const BAJO_EL_MARCADOR = 52;   // alto del marcador flotante (pastillas de 30 px a 10 px del borde) + aire

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

export default function MapaDeNiveles({ inicioISO, hoyISO, selected, estadoDe, porFecha, onElegir, onCompartir }) {
    const t = useT();
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
    }, []);
    const etiquetas = ETIQUETA(t);
    const nombres = NOMBRE_MUNDO(t);

    const mapa = useMemo(() => armarMapa({ inicioISO, hoyISO, estadoDe, umbrales: UMBRALES }), [inicioISO, hoyISO, estadoDe]);
    const { filas, alto, zonas } = useMemo(() => filasDelMapa(mapa.semanas), [mapa]);
    const claveMundo = (i) => ESCALERA[i]?.clave || 'bronce';
    const escalera = posicionEnLaEscalera(mapa.estrellas);

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
    const yaCentradoRef = useRef(false);
    const irA = useCallback((y, suave, tope = null) => {
        const v = ventanaRef.current;
        if (!v) return;
        const h = v.clientHeight;
        let destino = tope != null ? tope - BAJO_EL_MARCADOR : y - h * ANCLA;
        if (y - destino > h * 0.72) destino = y - h * 0.72;
        destino = Math.max(0, destino);
        if (typeof v.scrollTo === 'function') v.scrollTo({ top: destino, behavior: suave && !sinMovimiento() ? 'smooth' : 'auto' });
        else v.scrollTop = destino;
    }, []);
    useLayoutEffect(() => {
        // la primera vez, al instante (abrir ya en tu día); después, deslizando (sin saltos al tocar)
        irA(yElegido, yaCentradoRef.current, topeElegido);
        yaCentradoRef.current = true;
    }, [yElegido, topeElegido, irA]);

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
        });
    }, [yHoy]);
    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
    const irAHoy = () => {
        triggerMobileHaptic('light');
        onElegir(hoyISO);
        irA(yHoy, true, topeHoy);
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
        mundo: escalera.siguiente
            ? tn(escalera.faltan, 'Tu rango es tu mundo. Te falta {n} estrella para {siguiente}.', 'Tu rango es tu mundo. Te faltan {n} estrellas para {siguiente}.', { n: escalera.faltan, siguiente: nombres[escalera.siguiente.clave] })
            : t('Llegaste al último mundo: Diamante.'),
        estrellas: t('Cada semana da hasta 3 estrellas: con 3, 5 y 7 días en meta.'),
        racha: t('Días seguidos en meta. Hoy no la corta mientras el día no termine.'),
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
    const fechaLarga = (iso) => formatDate(mediodiaDe(iso), { weekday: 'long', day: 'numeric', month: 'long' });

    const compartir = () => {
        const dias = mapa.semanas.flatMap((s) => s.dias).filter((d) => d.estado !== 'futuro').reverse();
        onCompartir({ nivelHoy: mapa.nivelHoy, estrellas: mapa.estrellas, racha: mapa.racha, mundo: claveMundo(mapa.mundo), dias });
    };

    const mundoHoy = claveMundo(mapa.mundo);
    const chip = (cual, clase, contenido, titulo) => (
        <button type="button" className={`${styles.hudChip} ${clase}`} title={titulo}
            aria-expanded={ayuda === cual} aria-controls="mapa-ayuda" onClick={() => alternarAyuda(cual)}>
            {contenido}
        </button>
    );

    return (
        <section className={styles.mapa} aria-label={t('Mapa de niveles')} data-testid="mapa-de-niveles">
            <div className={styles.ventanaMarco}>
                <div className={styles.hud}>
                    <span className={styles.hudLado}>
                        {chip('dia', '', <><MapPin aria-hidden="true" />{t('Día {n}', { n: formatNumber(mapa.nivelHoy) })}</>, t('Día del camino'))}
                        {chip('mundo', styles.hudMundo, <><span className={`${styles.hudMedalla} ${styles[`medalla_${mundoHoy}`]}`} aria-hidden="true" />{nombres[mundoHoy]}</>, t('Mundo'))}
                    </span>
                    <span className={styles.hudLado}>
                        {chip('estrellas', styles.hudEstrellas, <><Star aria-hidden="true" /><b>{formatNumber(mapa.estrellas)}</b><span className={styles.srOnly}>{t('Estrellas')}</span></>, t('Estrellas'))}
                        {chip('racha', `${styles.hudRacha} ${mapa.racha > 0 ? styles.hudRachaViva : ''}`, <><Flame aria-hidden="true" /><b>{formatNumber(mapa.racha)}</b><span className={styles.srOnly}>{t('Racha')}</span></>, t('Racha'))}
                    </span>
                </div>
                <p id="mapa-ayuda" className={`${styles.ayuda} ${ayuda ? styles.ayudaVisible : ''}`} role="status" aria-live="polite">
                    {ayuda ? textoAyuda[ayuda] : ''}
                </p>

                <div ref={ventanaRef} className={styles.ventana} onScroll={onScroll}>
                    <div ref={lienzoRef} className={styles.lienzo} style={lienzoEstilo}>
                        {zonasEstilo.map((z) => (
                            <span key={`z-${z.y0}`} className={`${styles.zona} ${styles[`zona_${claveMundo(z.mundo)}`]}`} style={z.estilo} aria-hidden="true" />
                        ))}
                        <span className={styles.cielo} aria-hidden="true" />
                        <svg className={styles.camino} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
                            <defs>
                                <linearGradient id="mapaRecorrido" x1="0" y1="1" x2="0" y2="0" gradientUnits="objectBoundingBox">
                                    <stop offset="0%" className={styles.gradA} />
                                    <stop offset="100%" className={styles.gradB} />
                                </linearGradient>
                            </defs>
                            {porVenir && <path d={porVenir} className={styles.caminoPorVenir} />}
                            <path d={recorrido} className={styles.caminoBase} />
                            <path d={recorrido} className={styles.caminoBrillo} stroke="url(#mapaRecorrido)" pathLength="1" />
                        </svg>

                        <ol className={styles.niveles}>
                            {filas.map((f, idx) => {
                                const pos = { left: `${f.x}%`, top: `${f.y}px`, '--orden': Math.min(14, Math.abs(idx - iElegido)) };
                                if (f.tipo === 'puerta' || f.tipo === 'inicio') {
                                    const clave = claveMundo(f.mundo);
                                    const Icono = f.tipo === 'inicio' ? Flag : ICONO_MUNDO[clave];
                                    const titulo = f.tipo === 'inicio' ? t('Inicio') : t('Mundo {nombre}', { nombre: nombres[clave] });
                                    const sub = f.tipo === 'inicio'
                                        ? t('Mundo {nombre}', { nombre: nombres[clave] })
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
                                                        {s.estrellas === ESTRELLAS_MAX
                                                            ? t('Semana perfecta')
                                                            : s.enCurso
                                                                ? s.estrellas === 0
                                                                    ? tn(s.faltan, 'Falta {n} día en meta para tu primera estrella', 'Faltan {n} días en meta para tu primera estrella', { n: s.faltan })
                                                                    : tn(s.faltan, 'Falta {n} día en meta para otra estrella', 'Faltan {n} días en meta para otra estrella', { n: s.faltan })
                                                                : tn(s.enMeta, '{n} día en meta', '{n} días en meta', { n: s.enMeta })}
                                                    </small>
                                                </span>
                                            </div>
                                        </li>
                                    );
                                }
                                const d = f.dia;
                                const r = porFecha?.get?.(d.iso);
                                const activo = d.iso === selected;
                                const bloqueado = d.estado === 'futuro';
                                const fecha = mediodiaDe(d.iso);
                                const celebrado = celebracion?.tipo === 'dia' && celebracion.iso === d.iso;
                                const detalle = r && (r.meals_count || 0) > 0
                                    ? ` · ${t('{kcal} kcal · {n} comida(s)', { kcal: formatNumber(Math.round(r.calories || 0)), n: r.meals_count })}`
                                    : '';
                                return (
                                    <li key={f.clave} className={styles.nivelFila} style={pos}>
                                        {d.esHoy && (
                                            <span className={styles.cartel} aria-hidden="true">{t('Estás aquí')}</span>
                                        )}
                                        <button
                                            type="button"
                                            className={`${styles.nivel} ${styles[`nivel_${d.estado}`]} ${d.esHoy ? styles.nivelHoy : ''} ${activo ? styles.nivelActivo : ''} ${celebrado ? styles.nivelCelebrado : ''}`}
                                            disabled={bloqueado}
                                            aria-pressed={activo}
                                            aria-label={`${fechaLarga(d.iso)} · ${t('Día {n}', { n: d.nivel })} · ${etiquetas[d.estado]}${detalle}`}
                                            onClick={() => { if (!bloqueado) { triggerMobileHaptic('light'); onElegir(d.iso); } }}
                                        >
                                            <span className={styles.nivelCara} aria-hidden="true">
                                                {bloqueado ? <Lock /> : d.estado === 'meta' ? <Check strokeWidth={3.25} /> : fecha.getDate()}
                                            </span>
                                        </button>
                                        <span className={`${styles.nivelPie} ${d.esHoy ? styles.nivelPieHoy : ''}`} aria-hidden="true">
                                            {d.esHoy ? t('Hoy') : `${formatDate(fecha, { weekday: 'short' })} ${fecha.getDate()}`}
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
                    <li key={e}><span className={`${styles.leyendaPunto} ${styles[`punto_${e}`]}`} aria-hidden="true" />{rotulo}</li>
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
}

MapaDeNiveles.propTypes = {
    inicioISO: PropTypes.string,
    hoyISO: PropTypes.string.isRequired,
    selected: PropTypes.string,
    estadoDe: PropTypes.func.isRequired,
    porFecha: PropTypes.instanceOf(Map),
    onElegir: PropTypes.func.isRequired,
    onCompartir: PropTypes.func,
};
