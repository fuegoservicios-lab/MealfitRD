// [P1-PLAN-LOTE-1131 · 2026-11-20] El «Registro por día» como MAPA DE NIVELES (pedido del dueño: «estilo video juego como
// Candy Crush y sus sistemas de niveles pero con la gama de colores de Bioboros… quiero un efecto wow»; opción A: CADA
// DÍA ES UN NIVEL). Es la vista PRINCIPAL del cajón; el calendario del mes sigue como segunda pestaña.
//
// Qué se ve (de arriba abajo = de lo nuevo a lo viejo; el camino se SUBE, como en los juegos):
//  · una ventana de noche estrellada con su marcador (día del camino, estrellas ganadas, racha);
//  · los días como «caramelos» sobre un camino que serpentea: verde en meta (✓), ámbar bajo la meta, coral sobre la
//    meta, punteado sin registro, candado los que vienen; hoy, más grande, con su halo y el cartel «Estás aquí»;
//  · cada semana se cierra con su trofeo y sus 1-3 estrellas (las MISMAS de «S9» en el calendario y de Progreso).
// Tocar un día lo elige (el detalle del día sigue debajo, como con el calendario). Lógica pura en `utils/mapaDeNiveles`.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, Flame, Lock, MapPin, Star, Trophy, Gift } from 'lucide-react';
import { formatDate, formatNumber, useT, useTn } from '../../i18n';
import { ESTRELLAS_MAX, mediodiaDe } from '../../utils/progresoDeLosDias';
import { armarMapa, filasDelMapa, trazo } from '../../utils/mapaDeNiveles';
import styles from './MapaDeNiveles.module.css';

const ETIQUETA = (t) => ({
    meta: t('En meta'),
    bajo: t('Bajo la meta'),
    sobre: t('Sobre la meta'),
    vacio: t('Sin registro'),
    futuro: t('Bloqueado'),
});

function Estrellas({ n, grande = false }) {
    return (
        <span className={`${styles.estrellas} ${grande ? styles.estrellasGrandes : ''}`} aria-hidden="true">
            {Array.from({ length: ESTRELLAS_MAX }, (_, k) => (
                <Star key={k} className={k < n ? styles.estrellaOn : styles.estrellaOff} strokeWidth={2.25} />
            ))}
        </span>
    );
}
Estrellas.propTypes = { n: PropTypes.number.isRequired, grande: PropTypes.bool };

export default function MapaDeNiveles({ inicioISO, hoyISO, selected, estadoDe, porFecha, onElegir }) {
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

    const mapa = useMemo(() => armarMapa({ inicioISO, hoyISO, estadoDe }), [inicioISO, hoyISO, estadoDe]);
    const { filas, alto } = useMemo(() => filasDelMapa(mapa.semanas), [mapa]);

    // El camino: lo RECORRIDO (del día 1 a hoy, de abajo arriba) brilla y se dibuja al abrir; lo que VIENE va punteado.
    const { recorrido, porVenir } = useMemo(() => {
        const puntos = filas.map((f) => ({ x: (f.x / 100) * ancho, y: f.y, futuro: f.tipo === 'dia' && f.dia.estado === 'futuro', hoy: f.tipo === 'dia' && f.dia.esHoy }));
        const iHoy = puntos.findIndex((p) => p.hoy);
        if (iHoy < 0) return { recorrido: trazo(puntos.slice().reverse()), porVenir: '' };
        return { recorrido: trazo(puntos.slice(iHoy).reverse()), porVenir: trazo(puntos.slice(0, iHoy + 1)) };
    }, [filas, ancho]);

    // Al abrir (y al cambiar de día desde fuera, p. ej. «Tu semana»), el día elegido queda centrado en la ventana.
    const yElegido = filas.find((f) => f.tipo === 'dia' && f.dia.iso === selected)?.y
        ?? filas.find((f) => f.tipo === 'dia' && f.dia.esHoy)?.y ?? 0;
    const yaCentradoRef = useRef(false);
    useLayoutEffect(() => {
        const v = ventanaRef.current;
        if (!v) return;
        const destino = Math.max(0, yElegido - v.clientHeight / 2);
        // la primera vez, al instante (abrir ya en tu día); después, deslizando (sin saltos al tocar)
        const suave = yaCentradoRef.current && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        yaCentradoRef.current = true;
        if (typeof v.scrollTo === 'function') v.scrollTo({ top: destino, behavior: suave ? 'smooth' : 'auto' });
        else v.scrollTop = destino;
    }, [yElegido]);

    const lienzoEstilo = useMemo(() => ({ height: `${alto}px` }), [alto]);
    const iElegido = Math.max(0, filas.findIndex((f) => f.y === yElegido));
    const fechaLarga = (iso) => formatDate(mediodiaDe(iso), { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <section className={styles.mapa} aria-label={t('Mapa de niveles')} data-testid="mapa-de-niveles">
            <div className={styles.hud}>
                <span className={styles.hudChip}>
                    <MapPin aria-hidden="true" />
                    {t('Día {n}', { n: formatNumber(mapa.nivelHoy) })}
                </span>
                <span className={styles.hudDerecha}>
                    <span className={`${styles.hudChip} ${styles.hudEstrellas}`} title={t('Estrellas')}>
                        <Star aria-hidden="true" />
                        <b>{formatNumber(mapa.estrellas)}</b>
                        <span className={styles.srOnly}>{t('Estrellas')}</span>
                    </span>
                    <span className={`${styles.hudChip} ${styles.hudRacha} ${mapa.racha > 0 ? styles.hudRachaViva : ''}`} title={t('Racha')}>
                        <Flame aria-hidden="true" />
                        <b>{formatNumber(mapa.racha)}</b>
                        <span className={styles.srOnly}>{t('Racha')}</span>
                    </span>
                </span>
            </div>

            <div ref={ventanaRef} className={styles.ventana}>
                <div ref={lienzoRef} className={styles.lienzo} style={lienzoEstilo}>
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
                                                <b>{t('Semana {n}', { n: s.numero })}</b>
                                                <Estrellas n={s.estrellas} />
                                                <small>
                                                    {s.estrellas === ESTRELLAS_MAX
                                                        ? t('Semana perfecta')
                                                        : s.enCurso
                                                            ? tn(s.faltan, 'Falta {n} día en meta para otra estrella', 'Faltan {n} días en meta para otra estrella', { n: s.faltan })
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
                                        className={`${styles.nivel} ${styles[`nivel_${d.estado}`]} ${d.esHoy ? styles.nivelHoy : ''} ${activo ? styles.nivelActivo : ''}`}
                                        disabled={bloqueado}
                                        aria-pressed={activo}
                                        aria-label={`${fechaLarga(d.iso)} · ${t('Día {n}', { n: d.nivel })} · ${etiquetas[d.estado]}${detalle}`}
                                        onClick={() => { if (!bloqueado) onElegir(d.iso); }}
                                    >
                                        <span className={styles.nivelCara} aria-hidden="true">
                                            {bloqueado ? <Lock /> : d.estado === 'meta' ? <Check strokeWidth={3.25} /> : fecha.getDate()}
                                        </span>
                                    </button>
                                    <span className={styles.nivelPie} aria-hidden="true">
                                        {formatDate(fecha, { weekday: 'short' })} {fecha.getDate()}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            </div>

            <ul className={styles.leyenda} aria-label={t('Leyenda')}>
                {['meta', 'bajo', 'sobre', 'vacio'].map((e) => (
                    <li key={e}><span className={`${styles.leyendaPunto} ${styles[`punto_${e}`]}`} aria-hidden="true" />{etiquetas[e]}</li>
                ))}
            </ul>
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
};
