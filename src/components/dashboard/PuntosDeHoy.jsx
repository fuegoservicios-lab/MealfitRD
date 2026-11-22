// [P1-PLAN-LOTE-1161 · 2026-11-22] El marcador de HOY en «Tu semana»: los puntos que llevas (contador que sube), la
// llama de la racha con su multiplicador y escudos, y los logros del día — los cumplidos encendidos y los pendientes
// diciendo cuánto darían («+10»). Al ganar puntos, un «+N» sube y se desvanece (sin movimiento con reduced-motion).
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { Check } from 'lucide-react';
import { formatNumber, useT } from '../../i18n';
import { PUNTOS } from '../../utils/juegoPuntos';
import LlamaDeRacha from './LlamaDeRacha';
import styles from './PuntosDeHoy.module.css';

const ORDEN = ['registro', 'completo', 'banda', 'proteina', 'agua'];

function ContadorAnimado({ valor }) {
    const quieto = useReducedMotion();
    const resorte = useSpring(valor, { stiffness: 140, damping: 22 });
    const redondo = useTransform(resorte, (v) => formatNumber(Math.round(v)));
    useEffect(() => { resorte.set(valor); }, [resorte, valor]);
    if (quieto) return <span>{formatNumber(valor)}</span>;
    return <motion.span>{redondo}</motion.span>;
}
ContadorAnimado.propTypes = { valor: PropTypes.number.isRequired };

const PuntosDeHoy = ({ puntos = 0, mult = 1, logros = {}, racha = 0, tramo = null, escudos = 0, escudosMax = 2, onAbrir = null }) => {
    const t = useT();
    // «+N» al ganar: se ajusta el estado DURANTE el render (patrón de React para derivar de un cambio de prop).
    const [seguimiento, setSeguimiento] = useState({ valor: puntos, delta: 0, n: 0 });
    if (seguimiento.valor !== puntos) {
        setSeguimiento({ valor: puntos, delta: puntos - seguimiento.valor, n: seguimiento.n + 1 });
    }
    const nombres = {
        registro: t('Registro'), completo: t('Día completo'), banda: t('Calorías'), proteina: t('Proteína'), agua: t('Agua'),
    };
    const visibles = ORDEN.filter((k) => !(k === 'agua' && (logros?.agua === null || logros?.agua === undefined)));
    const multTxt = formatNumber(mult || 1, { maximumFractionDigits: 2 });

    return (
        <div className={styles.marcador}>
            <div className={styles.fila}>
                <div className={styles.hoy} aria-live="polite">
                    <span className={styles.hoyEtiqueta}>{t('Hoy')}</span>
                    <span className={styles.hoyCifra}>
                        <strong><ContadorAnimado valor={puntos} /></strong>
                        <span className={styles.hoyUnidad}>{t('pts')}</span>
                        {seguimiento.delta > 0 && (
                            <span key={seguimiento.n} className={styles.flotante} aria-hidden="true">+{formatNumber(seguimiento.delta)}</span>
                        )}
                    </span>
                    {mult > 1 && (
                        <span className={styles.hoyMult}>{t('Tu racha multiplica ×{m}', { m: multTxt })}</span>
                    )}
                </div>
                <LlamaDeRacha racha={racha} tramo={tramo} escudos={escudos} escudosMax={escudosMax} onAbrir={onAbrir} />
            </div>
            <ul className={styles.logros} aria-label={t('Logros de hoy')}>
                {visibles.map((k) => {
                    const hecho = logros?.[k] === true;
                    return (
                        <li
                            key={k}
                            className={`${styles.logro} ${hecho ? styles.logroHecho : ''}`}
                            aria-label={`${nombres[k]}: ${hecho ? t('conseguido') : t('+{n} puntos si lo consigues', { n: PUNTOS[k] })}`}
                        >
                            {hecho
                                ? <Check size={13} strokeWidth={3} aria-hidden="true" />
                                : <span className={styles.logroPts} aria-hidden="true">+{PUNTOS[k]}</span>}
                            <span aria-hidden="true">{nombres[k]}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

PuntosDeHoy.propTypes = {
    puntos: PropTypes.number,
    mult: PropTypes.number,
    logros: PropTypes.object,
    racha: PropTypes.number,
    tramo: PropTypes.object,
    escudos: PropTypes.number,
    escudosMax: PropTypes.number,
    onAbrir: PropTypes.func,
};

export default PuntosDeHoy;
