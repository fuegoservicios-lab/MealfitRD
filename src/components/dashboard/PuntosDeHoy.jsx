// [P1-PLAN-LOTE-1161 · 2026-11-22] El marcador de HOY en «Tu semana»: los puntos que llevas (contador que sube), la
// llama de la racha con su multiplicador y escudos, y los logros del día — los cumplidos encendidos y los pendientes
// diciendo cuánto darían («+10»). Al ganar puntos, un «+N» sube y se desvanece (sin movimiento con reduced-motion).
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { Check, ChevronDown, CircleHelp, Flame, Star, Zap } from 'lucide-react';
import { formatNumber, useT } from '../../i18n';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import { COMIDAS_DIA_COMPLETO, gananciaLogro, maximoDiario, puntosCaloriasParciales, puntosMicrosParciales } from '../../utils/juegoPuntos';
import LlamaDeRacha from './LlamaDeRacha';
import styles from './PuntosDeHoy.module.css';

// [P1-PLAN-LOTE-1164] puntos por calidad v6: carbos, grasas, 8 micros clave, multiplicador condicionado por calidad.
const ORDEN = ['registro', 'banda', 'proteina', 'carbos', 'grasas', 'micros', 'completo', 'agua', 'dia_perfecto'];
const visibles0 = (logros) => ORDEN.filter((k) => {
    if ((k === 'agua' || k === 'carbos' || k === 'grasas' || k === 'micros')
        && (logros?.[k] === null || logros?.[k] === undefined)) return false;
    return true;
});
const estiloPct = (p) => (p > 0 ? { '--pct': `${Math.min(100, Math.round(p))}%` } : undefined);

// [P1-PUNTOS-PLEGABLES · 2026-11-27] «Cómo sumar puntos hoy» se pliega como los micros. En el teléfono arranca
// cerrado (la tarjeta subió bajo el contador y no debe empujar las comidas); en PC, abierto. La elección se recuerda.
const CLAVE_PLEGADO = 'bioboros_puntos_logros_abiertos';
function abiertoInicial() {
    const guardado = safeLocalStorageGet(CLAVE_PLEGADO, null);
    if (guardado === '1') return true;
    if (guardado === '0') return false;
    try {
        return !(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 909px)')?.matches);
    } catch {
        return true;
    }
}

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
    puntos = 0, mult = 1, multActivo = true, logros = {}, racha = 0, tramo = null, escudos = 0, escudosMax = 2, onAbrir = null,
    hoy = null, targetProtein = 0, targetCarbs = 0, targetFats = 0, estadoHoy = 'vacio', recordDia = 0, horaLocal = null,
}) => {
    const t = useT();
    // «+N» al ganar: se ajusta el estado DURANTE el render (patrón de React para derivar de un cambio de prop).
    const [seguimiento, setSeguimiento] = useState({ valor: puntos, delta: 0, n: 0 });
    const [abierto, setAbierto] = useState(abiertoInicial);
    const alternar = () => setAbierto((v) => {
        safeLocalStorageSet(CLAVE_PLEGADO, v ? '0' : '1');
        return !v;
    });
    if (seguimiento.valor !== puntos) {
        setSeguimiento({ valor: puntos, delta: puntos - seguimiento.valor, n: seguimiento.n + 1 });
    }
    const nombres = {
        registro: t('Registrar'),
        completo: t('Día completo'),
        banda: estadoHoy === 'pasado' ? t('Sobre la meta') : t('Calorías en meta'),
        proteina: t('Proteína'),
        carbos: logros?.carbos_pasado ? t('Carbos altos') : t('Carbohidratos'),
        grasas: logros?.grasas_pasado ? t('Grasas altas') : t('Grasas en rango'),
        micros: t('Micronutrientes'),
        agua: t('Agua'),
        dia_perfecto: t('Día perfecto'),
    };
    const ptsCaloriasYa = puntosCaloriasParciales({ logros, mult: mult || 1 });
    const ptsMicrosYa = puntosMicrosParciales({ logros, mult: mult || 1 });
    const visibles = visibles0(logros);
    const pilasPrincipales = visibles.filter((k) => k !== 'registro' && k !== 'dia_perfecto');
    const todosHechos = visibles.every((k) => logros?.[k] === true);
    const conseguidos = pilasPrincipales.filter((k) => logros?.[k] === true).length;
    const conAgua = visibles.includes('agua');
    const conCarbos = visibles.includes('carbos');
    const conGrasas = visibles.includes('grasas');
    const conMicros = visibles.includes('micros');
    const multEfectivo = mult || 1;
    const multTxt = formatNumber(multEfectivo, { maximumFractionDigits: 2 });
    const maxHoy = maximoDiario({ mult: multEfectivo, conAgua, conCarbos, conGrasas, conMicros });
    const hora = horaLocal ?? new Date().getHours();
    const comidasHoy = Math.trunc(Number(hoy?.mealsCount) || 0);
    const proteinHoy = Number(hoy?.protein) || 0;
    const carbsHoy = Number(hoy?.carbs) || 0;
    const fatsHoy = Number(hoy?.fats) || 0;
    const targetProt = Number(targetProtein) || 0;
    const targetCarb = Number(targetCarbs) || 0;
    const targetFat = Number(targetFats) || 0;
    const recordSuperado = puntos > 0 && recordDia > 0 && puntos > recordDia;
    const faltaRecord = puntos > 0 && recordDia > puntos ? recordDia - puntos : 0;

    const mensajeSub = (() => {
        if (puntos === 0) {
            if (logros?.registro) return t('Registrado: tu racha sigue. Los puntos llegan al acercarte a tus metas.');
            if (racha > 0 && multEfectivo > 1 && hora >= 17) {
                return escudos > 0
                    ? t('Registra hoy para no gastar un escudo (×{m}).', { m: multTxt })
                    : t('Registra hoy para cuidar tu racha (×{m}).', { m: multTxt });
            }
            return multEfectivo > 1
                ? t('Registra hoy: tu racha multiplica ×{m} lo que ganes.', { m: multTxt })
                : t('Registra una comida para empezar a sumar.');
        }
        if (multEfectivo > 1 && !multActivo) {
            if (logros?.grasas_pasado && logros?.carbos_pasado) return t('Sin ×{m} hoy: te pasaste en carbos y grasas', { m: multTxt });
            if (logros?.grasas_pasado) return t('Sin ×{m} hoy: te pasaste en grasas', { m: multTxt });
            if (logros?.carbos_pasado) return t('Sin ×{m} hoy: te pasaste en carbos', { m: multTxt });
            if (logros?.sodio_muy_pasado) return t('Sin ×{m} hoy: te pasaste en sodio', { m: multTxt });
            if (logros?.potasio_muy_pasado) return t('Sin ×{m} hoy: potasio sobre tu límite', { m: multTxt });
            if (logros?.satfat_muy_pasado) return t('Sin ×{m} hoy: grasa saturada muy alta', { m: multTxt });
            if (logros?.azucar_muy_pasado) return t('Sin ×{m} hoy: azúcar añadida muy alta', { m: multTxt });
            if (logros?.calorias_muy_bajo) return t('Sin ×{m} hoy: faltan calorías mínimas', { m: multTxt });
            return t('Sin ×{m} hoy: cumple calorías o proteína', { m: multTxt });
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
                    {mensajeSub && (
                        <span className={`${styles.hoyMult} ${multEfectivo > 1 && puntos > 0 && !multActivo ? styles.hoyMultPausa : ''}`}>
                            {mensajeSub}
                        </span>
                    )}
                    {!recordSuperado && faltaRecord > 0 && faltaRecord <= 20 && (
                        <span className={styles.cercaRecord}>{t('A {n} pts de tu récord', { n: formatNumber(faltaRecord) })}</span>
                    )}
                </div>
                <LlamaDeRacha racha={racha} tramo={tramo} escudos={escudos} escudosMax={escudosMax} onAbrir={onAbrir} />
            </div>
            <div className={styles.logrosCabecera}>
                <span className={styles.logrosTituloWrap}>
                    <button
                        type="button"
                        className={styles.logrosPliegue}
                        onClick={alternar}
                        aria-expanded={abierto}
                        aria-controls="logros-de-hoy"
                    >
                        {/* [P1-PUNTOS-PLEGABLES · 2026-11-27] el pliegue es un panel: título arriba y, debajo, el avance de
                            hoy en segmentos («4 de 6» suelto en una pastilla se partía en dos líneas y no decía de qué) */}
                        <span className={styles.logrosTextos}>
                            <span className={styles.logrosTitulo}>{todosHechos ? t('¡Hoy lo conseguiste todo!') : t('Cómo sumar puntos hoy')}</span>
                            {pilasPrincipales.length > 0 && (
                                <span className={styles.logrosMeta}>
                                    <span className={styles.logrosSegmentos} aria-hidden="true">
                                        {pilasPrincipales.map((k) => (
                                            <i key={k} className={logros?.[k] === true ? styles.segmentoHecho : undefined} />
                                        ))}
                                    </span>
                                    <span className={styles.logrosResumen}>
                                        {t('{n} de {total} logrados', { n: formatNumber(conseguidos), total: formatNumber(pilasPrincipales.length) })}
                                    </span>
                                    {!todosHechos && multEfectivo > 1 && (
                                        <span className={styles.logrosMetaMax}>{t('Hasta {n} pts', { n: formatNumber(maxHoy) })}</span>
                                    )}
                                </span>
                            )}
                        </span>
                        <span className={styles.logrosChevronCaja} aria-hidden="true">
                            <ChevronDown
                                size={16}
                                strokeWidth={2.5}
                                className={`${styles.logrosChevron} ${abierto ? styles.logrosChevronAbierto : ''}`}
                            />
                        </span>
                    </button>
                    {onAbrir && (
                        <button type="button" className={styles.comoFunciona} onClick={onAbrir} aria-haspopup="dialog" aria-label={t('¿Cómo funciona?')} title={t('¿Cómo funciona?')}>
                            <CircleHelp size={15} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                    )}
                </span>
                {!todosHechos && multEfectivo > 1 && (
                    <span className={styles.maxHoy}>{t('Hasta {n} pts', { n: formatNumber(maxHoy) })}</span>
                )}
            </div>
            <ul id="logros-de-hoy" hidden={!abierto} className={styles.logros} aria-label={t('Logros de hoy')} data-n={pilasPrincipales.length}>
                {visibles.map((k) => {
                    const hecho = logros?.[k] === true;
                    const pasadoBanda = (k === 'banda' || k === 'dia_perfecto') && estadoHoy === 'pasado' && !hecho;
                    const pasadoCarbo = k === 'carbos' && logros?.carbos_pasado === true;
                    const pasadoGrasa = k === 'grasas' && logros?.grasas_pasado === true;
                    const alertaMicrosTxt = k === 'micros'
                        ? (logros?.sodio_pasado
                            ? t('Sodio alto')
                            : logros?.potasio_pasado
                                ? t('Potasio alto')
                                : logros?.satfat_pasado
                                    ? t('Grasa saturada alta')
                                    : logros?.azucar_pasado
                                        ? t('Azúcar alta')
                                        : logros?.fibra_baja && logros?.micros !== null
                                            ? t('Fibra baja')
                                            : '')
                        : '';
                    const bloqueadoPerfecto = k === 'dia_perfecto' && !hecho && (
                        estadoHoy === 'pasado'
                        || logros?.grasas_pasado
                        || logros?.carbos_pasado
                        || logros?.sodio_pasado
                        || logros?.potasio_pasado
                        || logros?.satfat_pasado
                        || logros?.azucar_pasado
                        || (logros?.fibra_baja && logros?.micros !== null)
                    );
                    const pasado = pasadoBanda || pasadoCarbo || pasadoGrasa || (k === 'micros' && Boolean(
                        logros?.sodio_muy_pasado || logros?.potasio_muy_pasado || logros?.satfat_muy_pasado || logros?.azucar_muy_pasado,
                    ));
                    const parcialProt = k === 'proteina' && !hecho && logros?.proteina_parcial === true;
                    const parcialKcal = k === 'banda' && !hecho && !pasadoBanda && ptsCaloriasYa > 0;
                    const parcialMicros = k === 'micros' && !hecho && logros?.micros_parcial === true && ptsMicrosYa > 0;
                    const soloRacha = k === 'registro';
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
                        } else if (k === 'carbos' && carbsHoy > 0 && targetCarb > 0) {
                            const carbPct = Math.round((carbsHoy / targetCarb) * 100);
                            pct = Math.min(100, carbPct);
                            progresoTxt = `${carbPct}%`;
                        } else if (k === 'grasas' && fatsHoy > 0 && targetFat > 0) {
                            const fatPct = Math.round((fatsHoy / targetFat) * 100);
                            pct = Math.min(100, fatPct);
                            progresoTxt = `${fatPct}%`;
                        } else if (k === 'micros' && Number(logros?.micros_total) > 0) {
                            const mOk = Number(logros.micros_ok) || 0;
                            const mTot = Number(logros.micros_total);
                            if (mOk > 0 || logros?.registro) {
                                pct = Math.min(99, Math.round((mOk / mTot) * 100));
                                progresoTxt = `${mOk}/${mTot}`;
                            }
                        }
                    }

                    const clase = [styles.logro];
                    if (hecho) clase.push(styles.logroHecho);
                    else if (pasado) clase.push(styles.logroCerrado);
                    else if (parcialProt || parcialKcal || parcialMicros) clase.push(styles.logroParcial);
                    if (k === 'dia_perfecto') clase.push(styles.logroPerfecto);
                    else if (soloRacha) clase.push(styles.logroRacha);
                    else clase.push(styles.logroTarjeta);

                    let aria;
                    if (hecho) aria = `${nombres[k]}: ${t('conseguido')}`;
                    else if (soloRacha) aria = `${nombres[k]}: ${t('mantiene tu racha')}`;
                    else if (pasadoCarbo) aria = `${nombres[k]}: ${t('te pasaste de carbos hoy (pausa tu multiplicador)')}`;
                    else if (pasadoGrasa) aria = `${nombres[k]}: ${t('te pasaste de grasas hoy (pausa tu multiplicador)')}`;
                    else if (pasadoBanda && k === 'banda') aria = `${t('Calorías en meta')}: ${t('hoy te pasaste de la banda (0 pts)')}`;
                    else if (pasadoBanda) aria = `${nombres[k]}: ${t('hoy te pasaste de la banda')}`;
                    else if (parcialKcal) aria = `${nombres[k]}: ${t('cerca: +{n} ya; +{m} más si entras en tu meta', { n: formatNumber(ptsCaloriasYa), m: formatNumber(ptsGanar) })}`;
                    else if (parcialProt) aria = `${nombres[k]}: ${t('parcial conseguido, +{n} puntos si llegas al 90%', { n: formatNumber(ptsGanar) })}`;
                    else if (parcialMicros) aria = `${nombres[k]}: ${t('parcial: +{n} ya; +{m} más al 50%', { n: formatNumber(ptsMicrosYa), m: formatNumber(ptsGanar) })}`;
                    else aria = `${nombres[k]}: ${t('+{n} puntos si lo consigues', { n: formatNumber(ptsGanar) })}`;

                    return (
                        <li key={k} className={clase.join(' ')} style={estiloPct(pct)} aria-label={aria}>
                            {soloRacha ? (
                                <>
                                    <span className={styles.logroIcono} aria-hidden="true">
                                        {hecho ? <Check size={13} strokeWidth={3} /> : <Flame size={13} strokeWidth={2.5} />}
                                    </span>
                                    <span className={styles.logroNombre} aria-hidden="true">{hecho ? t('Racha a salvo hoy') : t('Registra una comida')}</span>
                                    <span className={styles.logroMeta} aria-hidden="true">{t('mantiene tu racha')}</span>
                                </>
                            ) : k === 'dia_perfecto' ? (
                                <>
                                    <span className={styles.logroIcono} aria-hidden="true"><Star size={14} strokeWidth={2.5} /></span>
                                    <span className={styles.logroNombre} aria-hidden="true">
                                        {nombres[k]}
                                        <small>
                                            {bloqueadoPerfecto
                                                ? (estadoHoy === 'pasado' || logros?.grasas_pasado || logros?.carbos_pasado
                                                    ? t('hoy te pasaste de la banda')
                                                    : logros?.sodio_pasado || logros?.potasio_pasado || logros?.satfat_pasado || logros?.azucar_pasado
                                                        ? t('hoy te pasaste de un límite')
                                                        : t('fibra muy baja hoy'))
                                                : t('todo en meta, sin pasarte')}
                                        </small>
                                    </span>
                                    {hecho ? <Check className={styles.logroMeta} size={15} strokeWidth={3} aria-hidden="true" />
                                        : bloqueadoPerfecto ? <span className={styles.logroMeta} aria-hidden="true">0 pts</span>
                                            : <span className={`${styles.logroPts} ${styles.logroMeta}`} aria-hidden="true">+{formatNumber(ptsGanar)}</span>}
                                </>
                            ) : (
                                <>
                                    <span className={styles.logroTop} aria-hidden="true">
                                        {hecho ? (
                                            <span className={styles.logroPts}><Check size={16} strokeWidth={3} /></span>
                                        ) : pasado ? (
                                            <span className={styles.logroPts}>0 {t('pts')}</span>
                                        ) : (
                                            <span className={styles.logroPts}>+{formatNumber(ptsGanar)}</span>
                                        )}
                                        {progresoTxt && <span className={styles.logroPct}>{progresoTxt}</span>}
                                    </span>
                                    <span className={styles.logroNombre} aria-hidden="true">{nombres[k]}</span>
                                    {parcialKcal && (
                                        <span className={styles.logroSub} aria-hidden="true">{t('cerca +{n}', { n: formatNumber(ptsCaloriasYa) })}</span>
                                    )}
                                    {parcialMicros && !alertaMicrosTxt && (
                                        <span className={styles.logroSub} aria-hidden="true">{t('parcial +{n}', { n: formatNumber(ptsMicrosYa) })}</span>
                                    )}
                                    {alertaMicrosTxt && (
                                        <span className={styles.logroSubWarn} aria-hidden="true">{alertaMicrosTxt}</span>
                                    )}
                                    {(pasadoGrasa || pasadoCarbo) && (
                                        <span className={styles.logroSubWarn} aria-hidden="true">
                                            {multEfectivo > 1 ? t('Sin bono ×{m}', { m: multTxt }) : t('Sin bono hoy')}
                                        </span>
                                    )}
                                </>
                            )}
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
    multActivo: PropTypes.bool,
    logros: PropTypes.object,
    racha: PropTypes.number,
    tramo: PropTypes.object,
    escudos: PropTypes.number,
    escudosMax: PropTypes.number,
    onAbrir: PropTypes.func,
    hoy: PropTypes.object,
    targetProtein: PropTypes.number,
    targetCarbs: PropTypes.number,
    targetFats: PropTypes.number,
    estadoHoy: PropTypes.string,
    recordDia: PropTypes.number,
    horaLocal: PropTypes.number,
};

export default PuntosDeHoy;
