// [P1-PLAN-LOTE-1059 · plan 1035 · 2026-11-17] Cierre de semana e hitos del juego.
//
// El servidor manda eventos con código y datos (D-G: nada de textos escritos por un modelo); aquí se ponen las
// palabras con i18n. Cada evento sale UNA vez: al mostrarse se marca visto en el servidor. Animación sobria y, con
// `prefers-reduced-motion`, ninguna.
import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { AnimatePresence, motion } from 'framer-motion';
import { Award, Crown, Flame, Share2, Shield, Star, Trophy, X, Zap } from 'lucide-react';
import { formatNumber, useT, useTn } from '../../i18n';
import { nombreDelRango } from '../../utils/juegoPuntos';
import { marcarEventosVistos } from '../../utils/progresoServidor';
import styles from './CierreDeSemana.module.css';

const MARCAR_TRAS_MS = 1200;
const _sinMovimiento = () => {
    try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
};

function textosDelEvento(ev, { t, tn }) {
    const d = ev?.datos || {};
    const rangos = { bronce: t('Bronce'), plata: t('Plata'), oro: t('Oro'), platino: t('Platino'), diamante: t('Diamante') };
    switch (ev?.codigo) {
        case 'semana_cerrada':
            return {
                titulo: t('Semana {n} cerrada', { n: d.numero }),
                texto: `${tn(d.estrellas || 0, '{n} estrella', '{n} estrellas', { n: d.estrellas || 0 })} · `
                    // [P1-PLAN-LOTE-1161] con el juego por puntos, los puntos de la semana
                    + `${Number.isFinite(Number(d.puntos)) && d.puntos !== null
                        ? t('{n} pts', { n: formatNumber(d.puntos) })
                        : t('{n} de {total} días en meta', { n: d.dias_en_meta || 0, total: 7 })}. `
                    + t('Empieza la Semana {n}.', { n: d.siguiente }),
            };
        case 'primera_estrella':
            return { titulo: t('¡Tu primera estrella!'), texto: t('3 días en meta en una semana.') };
        case 'primera_semana_perfecta':
            return { titulo: t('¡Primera semana perfecta!'), texto: t('Los 7 días en meta.') };
        case 'racha':
            return {
                titulo: tn(d.dias || 0, 'Racha de {n} día', 'Racha de {n} días', { n: d.dias || 0 }),
                texto: d.mult
                    ? t('Días seguidos registrando: tus puntos valen ×{m}.', { m: formatNumber(d.mult, { maximumFractionDigits: 2 }) })
                    : t('Días seguidos en meta.'),
            };
        // [P1-PLAN-LOTE-1161] juego por puntos
        case 'division':
            return { titulo: t('¡Subiste a {rango}!', { rango: nombreDelRango(d.clave, d.division, t) }), texto: t('Por tus puntos acumulados.') };
        // [P1-PLAN-LOTE-1163] el rango especial
        case 'maestro':
            return {
                titulo: t('¡Eres Maestro!'),
                texto: t('El rango más difícil: miles de puntos, semanas perfectas y una racha de 100 días. Es tuyo para siempre.'),
            };
        case 'escudo_ganado':
            return { titulo: t('Ganaste un escudo de racha'), texto: t('Si un día no registras, te guarda la racha.') };
        case 'escudo_salvo':
            return { titulo: t('Un escudo salvó tu racha'), texto: tn(d.racha || 0, 'Sigues con {n} día seguido.', 'Sigues con {n} días seguidos.', { n: d.racha || 0 }) };
        case 'record_dia':
            return { titulo: t('¡Récord de puntos en un día!'), texto: t('{n} pts hoy.', { n: formatNumber(d.puntos || 0) }) };
        case 'semanas_seguidas_con_estrella':
            return { titulo: tn(d.semanas || 0, '{n} semana seguida con estrella', '{n} semanas seguidas con estrella', { n: d.semanas || 0 }), texto: t('Constancia de verdad.') };
        case 'rango':
            return { titulo: t('Nuevo rango: {rango}', { rango: rangos[d.clave] || '' }), texto: t('Por tus estrellas acumuladas.') };
        case 'semana_numero':
            return { titulo: t('Llegaste a la Semana {n}', { n: d.numero }), texto: t('Sigue sumando días.') };
        default:
            return null;
    }
}

const ICONO = {
    semana_cerrada: Star, primera_estrella: Star, primera_semana_perfecta: Star, racha: Flame,
    division: Trophy, maestro: Crown, escudo_ganado: Shield, escudo_salvo: Shield, record_dia: Zap,
};

const CierreDeSemana = ({ userId, eventos, onCompartir = null }) => {
    const t = useT();
    const tn = useTn();
    const [quieto] = useState(_sinMovimiento);
    const [cerrados, setCerrados] = useState(() => new Set());
    const marcados = useRef(new Set());
    const visibles = useMemo(
        () => (Array.isArray(eventos) ? eventos : []).filter((e) => e && e.clave && !cerrados.has(e.clave) && textosDelEvento(e, { t, tn })),
        [eventos, cerrados, t, tn],
    );

    // Visto = mostrado: se marca tras un momento en pantalla (si no lo cierra, no vuelve a salir en otra visita).
    useEffect(() => {
        const nuevas = visibles.map((e) => e.clave).filter((c) => !marcados.current.has(c));
        if (!nuevas.length || !userId) return undefined;
        const id = setTimeout(() => {
            nuevas.forEach((c) => marcados.current.add(c));
            marcarEventosVistos(userId, nuevas);
        }, MARCAR_TRAS_MS);
        return () => clearTimeout(id);
    }, [visibles, userId]);

    if (!visibles.length) return null;
    const cierre = visibles.find((e) => e.codigo === 'semana_cerrada');
    const hitos = visibles.filter((e) => e !== cierre);
    const cerrar = (claves) => {
        setCerrados((antes) => new Set([...antes, ...claves]));
        const pendientes = claves.filter((c) => !marcados.current.has(c));
        pendientes.forEach((c) => marcados.current.add(c));
        if (pendientes.length) marcarEventosVistos(userId, pendientes);
    };
    const entrada = quieto ? { opacity: 0 } : { opacity: 0, y: -6 };

    return (
        <div className={styles.cierre} aria-live="polite">
            <AnimatePresence initial>
                {cierre && (() => {
                    const x = textosDelEvento(cierre, { t, tn });
                    const n = Math.max(0, Math.min(3, Number(cierre.datos?.estrellas) || 0));
                    return (
                        <motion.div
                            key={cierre.clave}
                            className={styles.tarjeta}
                            initial={entrada}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: quieto ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <span className={styles.estrellas} role="img" aria-label={tn(n, '{n} estrella', '{n} estrellas', { n })}>
                                {[0, 1, 2].map((i) => (
                                    <Star key={i} size={18} strokeWidth={2.25} className={i < n ? styles.ganada : styles.vacia} aria-hidden="true" />
                                ))}
                            </span>
                            <div className={styles.cuerpo}>
                                <p className={styles.titulo}>{x.titulo}</p>
                                <p className={styles.texto}>{x.texto}</p>
                                {/* [P1-PLAN-LOTE-1082] el domingo es el momento de compartirla */}
                                {onCompartir && Number(cierre.datos?.numero) > 0 && (
                                    <button type="button" className={styles.compartir} onClick={() => onCompartir(Number(cierre.datos.numero))}>
                                        <Share2 size={15} strokeWidth={2.5} aria-hidden="true" />
                                        {t('Compartir tu semana')}
                                    </button>
                                )}
                            </div>
                            <button type="button" className={styles.cerrar} onClick={() => cerrar([cierre.clave])} aria-label={t('Cerrar')}>
                                <X size={16} strokeWidth={2.5} aria-hidden="true" />
                            </button>
                        </motion.div>
                    );
                })()}
                {hitos.map((h) => {
                    const x = textosDelEvento(h, { t, tn });
                    const Icono = ICONO[h.codigo] || Award;
                    return (
                        <motion.div
                            key={h.clave}
                            className={styles.hito}
                            initial={entrada}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: quieto ? 0 : 0.28 }}
                        >
                            <Icono size={15} strokeWidth={2.5} className={styles.hitoIcono} aria-hidden="true" />
                            <p className={styles.hitoTexto}><strong>{x.titulo}</strong> {x.texto}</p>
                            <button type="button" className={styles.cerrar} onClick={() => cerrar([h.clave])} aria-label={t('Cerrar')}>
                                <X size={14} strokeWidth={2.5} aria-hidden="true" />
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
};

CierreDeSemana.propTypes = {
    userId: PropTypes.string,
    eventos: PropTypes.arrayOf(PropTypes.shape({
        clave: PropTypes.string, codigo: PropTypes.string, datos: PropTypes.object,
    })),
    onCompartir: PropTypes.func,
};

export default CierreDeSemana;
