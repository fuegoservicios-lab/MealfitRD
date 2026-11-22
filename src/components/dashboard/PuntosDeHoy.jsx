// [P1-PLAN-LOTE-1161 · 2026-11-22] El marcador de HOY en «Tu semana»: los puntos que llevas (contador que sube), la
// llama de la racha con su multiplicador y escudos, y los logros del día — los cumplidos encendidos y los pendientes
// diciendo cuánto darían («+10»). Al ganar puntos, un «+N» sube y se desvanece (sin movimiento con reduced-motion).
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { Check, X, Zap } from 'lucide-react';
import { formatNumber, useT } from '../../i18n';
import { COMIDAS_DIA_COMPLETO, gananciaLogro, maximoDiario } from '../../utils/juegoPuntos';
import LlamaDeRacha from './LlamaDeRacha';
import styles from './PuntosDeHoy.module.css';

const ORDEN = ['registro', 'completo', 'banda', 'proteina', 'agua'];
const visibles0 = (logros) => ORDEN.filter((k) => !(k === 'agua' && (logros?.agua === null || logros?.agua === undefined)));
const estiloPct = (p) => (p > 0 ? { '--pct': `${Math.min(100, Math.round(p))}%` } : undefined);

function ContadorAnimado({ valor }) {
    const quieto = useReducedMotion();
    const resorte = useSpring(valor, { stiffness: 140, damping: 22 });
    const redondo = useTransform(resorte, (v) => formatNumber(Math.round(v)));
    useEffect(() => { resorte.set(valor); }, [resorte, valor]);
    if (quieto) return <span>{formatNumber(valor)}</span>;
    return <motion.span>{redondo}</motion.span>;
}
ContadorAnimado.propTypes = { valor: PropTypes.number.isRequired };

const PuntosDeHoy = ({
    puntos = 0, mult = 1, logros = {}, racha = 0, tramo = null, escudos = 0, escudosMax = 2, onAbrir = null,
    hoy = null, targetProtein = 0, estadoHoy = 'vacio', recordDia = 0, horaLocal = null,
}) => {
    const t = useT();
    // «+N» al ganar: se ajusta el estado DURANTE el render (patrón de React para derivar de un cambio de prop).
    const [seguimiento, setSeguimiento] = useState({ valor: puntos, delta: 0, n: 0 });
    if (seguimiento.valor !== puntos) {
        setSeguimiento({ valor: puntos, delta: puntos - seguimiento.valor, n: seguimiento.n + 1 });
    }
    const nombres = {
        registro: t('Registrar'),
        completo: t('Día completo'),
        banda: estadoHoy === 'pasado' ? t('Sobre la meta') : t('Calorías en meta'),
        proteina: t('Proteína'),
        agua: t('Agua'),
    };
    const visibles = visibles0(logros);
    const todosHechos = visibles.every((k) => logros?.[k] === true);
    const conAgua = visibles.includes('agua');
    const multEfectivo = mult || 1;
    const multTxt = formatNumber(multEfectivo, { maximumFractionDigits: 2 });
    const maxHoy = maximoDiario({ mult: multEfectivo, conAgua });
    const hora = horaLocal ?? new Date().getHours();
    const comidasHoy = Math.trunc(Number(hoy?.mealsCount) || 0);
    const proteinHoy = Number(hoy?.protein) || 0;
    const targetProt = Number(targetProtein) || 0;
    const recordSuperado = puntos > 0 && recordDia > 0 && puntos > recordDia;
    const faltaRecord = puntos > 0 && recordDia > puntos ? recordDia - puntos : 0;

    const mensajeSub = (() => {
        if (puntos === 0) {
            if (racha > 0 && multEfectivo > 1 && hora >= 17) {
                return escudos > 0
                    ? t('Registra hoy para no gastar un escudo (×{m}).', { m: multTxt })
                    : t('Registra hoy para cuidar tu racha (×{m}).', { m: multTxt });
            }
            return multEfectivo > 1
                ? t('Registra hoy: tu racha multiplica ×{m} lo que ganes.', { m: multTxt })
                : t('Registra una comida para empezar a sumar.');
        }
        if (multEfectivo > 1) return t('Tu racha multiplica ×{m} tus puntos de hoy', { m: multTxt });
        return null;
    })();

    return (
        <div className={styles.marcador} data-tramo={tramo?.clave || 'ninguno'}>
            <div className={styles.fila}>
                {/* sin aria-live: el contador animado haría leer cada número intermedio */}
                <div className={styles.hoy}>
                    <span className={styles.hoyEtiqueta}>{t('Hoy')}</span>
                    <span className={styles.hoyCifra}>
                        <strong><ContadorAnimado valor={puntos} /></strong>
                        <span className={styles.hoyUnidad}>{t('pts')}</span>
                        {recordSuperado && (
                            <span className={styles.recordBadge}>
                                <Zap size={11} strokeWidth={2.75} aria-hidden="true" />
                                {t('¡Nuevo récord!')}
                            </span>
                        )}
                        {seguimiento.delta > 0 && (
                            <span key={seguimiento.n} className={styles.flotante} aria-hidden="true">+{formatNumber(seguimiento.delta)}</span>
                        )}
                    </span>
                    {mensajeSub && <span className={styles.hoyMult}>{mensajeSub}</span>}
                    {!recordSuperado && faltaRecord > 0 && faltaRecord <= 20 && (
                        <span className={styles.cercaRecord}>{t('A {n} pts de tu récord', { n: formatNumber(faltaRecord) })}</span>
                    )}
                </div>
                <LlamaDeRacha racha={racha} tramo={tramo} escudos={escudos} escudosMax={escudosMax} onAbrir={onAbrir} />
            </div>
            <div className={styles.logrosCabecera}>
                <span className={styles.logrosTituloWrap}>
                    <p className={styles.logrosTitulo}>{todosHechos ? t('¡Hoy lo conseguiste todo!') : t('Cómo sumar puntos hoy')}</p>
                    {!todosHechos && multEfectivo > 1 && (
                        <span className={styles.maxHoy}>{t('Hasta {n} pts', { n: formatNumber(maxHoy) })}</span>
                    )}
                </span>
                {onAbrir && (
                    <button type="button" className={styles.comoFunciona} onClick={onAbrir} aria-haspopup="dialog">
                        {t('¿Cómo funciona?')}
                    </button>
                )}
            </div>
            <ul className={styles.logros} aria-label={t('Logros de hoy')}>
                {visibles.map((k) => {
                    const hecho = logros?.[k] === true;
                    const pasadoBanda = k === 'banda' && estadoHoy === 'pasado';
                    const parcialProt = k === 'proteina' && !hecho && logros?.proteina_parcial === true;
                    const ptsGanar = gananciaLogro({ logros, clave: k, mult: multEfectivo });

                    let pct = 0;
                    let progresoTxt = '';
                    if (!hecho && !pasadoBanda) {
                        if (k === 'completo' && comidasHoy > 0) {
                            pct = Math.round((comidasHoy / COMIDAS_DIA_COMPLETO) * 100);
                            progresoTxt = `${comidasHoy}/${COMIDAS_DIA_COMPLETO}`;
                        } else if (k === 'proteina' && proteinHoy > 0 && targetProt > 0) {
                            pct = Math.min(99, Math.round((proteinHoy / targetProt) * 100));
                            progresoTxt = `${pct}%`;
                        }
                    }

                    const clase = [styles.logro];
                    if (hecho) clase.push(styles.logroHecho);
                    else if (pasadoBanda) clase.push(styles.logroCerrado);
                    else if (parcialProt) clase.push(styles.logroParcial);

                    let aria;
                    if (hecho) aria = `${nombres[k]}: ${t('conseguido')}`;
                    else if (pasadoBanda) aria = `${t('Calorías en meta')}: ${t('hoy te pasaste de la banda')}`;
                    else if (parcialProt) aria = `${nombres[k]}: ${t('parcial conseguido, +{n} puntos si llegas al 90%', { n: formatNumber(ptsGanar) })}`;
                    else aria = `${nombres[k]}: ${t('+{n} puntos si lo consigues', { n: formatNumber(ptsGanar) })}`;

                    return (
                        <li key={k} className={clase.join(' ')} style={estiloPct(pct)} aria-label={aria}>
                            {hecho ? (
                                <Check size={13} strokeWidth={3} aria-hidden="true" />
                            ) : pasadoBanda ? (
                                <X size={13} strokeWidth={2.75} aria-hidden="true" />
                            ) : (
                                <span className={styles.logroPts} aria-hidden="true">+{formatNumber(ptsGanar)}</span>
                            )}
                            <span className={styles.logroNombre} aria-hidden="true">{nombres[k]}</span>
                            {progresoTxt && <span className={styles.logroMeta} aria-hidden="true">{progresoTxt}</span>}
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
    hoy: PropTypes.object,
    targetProtein: PropTypes.number,
    estadoHoy: PropTypes.string,
    recordDia: PropTypes.number,
    horaLocal: PropTypes.number,
};

export default PuntosDeHoy;
