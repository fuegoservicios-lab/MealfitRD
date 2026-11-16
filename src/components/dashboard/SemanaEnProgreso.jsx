// [SEMANA-EN-PROGRESO · 2026-11-15] El progreso de los días a la vista, sin abrir nada.
//
// Cada día es un ANILLO que se llena con sus calorías frente a la meta de ese día:
//   · verde con ✓  = día completado (dentro de la banda de la meta);
//   · ámbar        = se quedó corto;   · coral = se pasó;   · punteado = sin registros;   · candado = aún no llega.
// Tocar un día abre debajo su resumen (kcal, macros, comidas) y un botón que lleva al cajón del diario YA en ese día.
//
// [SEMANAS-NUMERADAS · 2026-11-15] «Semana 1, Semana 2… hasta el infinito», estilo videojuego: la Semana 1 empieza el
// primer día con registros; cada semana se ve entera, se ganan hasta 3 estrellas (3, 5 y 7 días en meta) y se puede
// volver a las anteriores con las flechas o deslizando. El día 1 se guarda aparte para que la cuenta no dependa del
// tope de 365 días del endpoint. El «hoy» ya no late hacia afuera (chocaba con el día de al lado): un arco gira
// DENTRO de su propio hueco.
//
// Hoy se pinta con lo que la tarjeta ya tiene en memoria (sube en vivo al registrar); los días pasados salen de
// `/api/diary/consumed-range` (el mismo endpoint del calendario) y se guardan para pintar al instante la próxima vez.
import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Flame, Lock, Plus, Star, Trophy } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';
import { formatDate, formatNumber, useT, useTn } from '../../i18n';
import { getBiologicalDateStr, getCalendarDateStr } from '../../utils/diaBiologico';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import {
    DIAS_DE_LA_SEMANA, DIAS_EN_TIRA, DIAS_MAX_HISTORIA, ESTRELLAS_MAX, construirDias, estrellasDeLaSemana,
    domingoDe, faltanParaLaSiguienteEstrella, fechasDeLaSemana, inicioDelViaje, mediodiaDe, numeroDeSemana, rachaEnMeta,
    ultimosDias,
} from '../../utils/progresoDeLosDias';
import styles from './SemanaEnProgreso.module.css';

const RADIO = 17;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
const _claveCache = (userId) => `mealfit_semana_progreso_${userId}`;
const _claveInicio = (userId) => `mealfit_semana_inicio_${userId}`;

const _leerCache = (userId) => {
    try {
        const crudo = safeLocalStorageGet(_claveCache(userId), null);
        const filas = crudo ? JSON.parse(crudo) : null;
        return Array.isArray(filas) ? filas : [];
    } catch { return []; }
};

const SemanaEnProgreso = ({
    userId, hoy = null, targetCalories = 0, targetMacros = null, mainGoal = '', onAbrirDia = null, calendario = null,
}) => {
    const t = useT();
    const tn = useTn();
    const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);
    const [filas, setFilas] = useState(() => _leerCache(userId));
    const [version, setVersion] = useState(0);
    const [elegido, setElegido] = useState(null);
    const [vista, setVista] = useState({ semana: null, sentido: 0 });   // semana null = la semana en curso
    const hoyISO = getBiologicalDateStr(new Date());
    const calendarioISO = getCalendarDateStr(new Date());

    useEffect(() => {
        if (!userId) return undefined;
        let vivo = true;
        // La primera vez se pide todo el historial (de ahí salen el día 1 y las semanas viejas); los refrescos, solo
        // los últimos 14 días, que se funden con lo que ya hay.
        const pedir = version === 0 ? DIAS_MAX_HISTORIA : DIAS_EN_TIRA;
        (async () => {
            try {
                const res = await fetchWithAuth(`/api/diary/consumed-range/${userId}?days=${pedir}&tzOffset=${tzOffset}`);
                const data = await res.json();
                if (!vivo || !Array.isArray(data?.days)) return;
                setFilas((antes) => {
                    const recientes = new Set(ultimosDias(getBiologicalDateStr(new Date()), DIAS_EN_TIRA));
                    const nuevas = version === 0
                        ? data.days
                        : [...(antes || []).filter((r) => r && !recientes.has(String(r.date))), ...data.days];
                    safeLocalStorageSet(_claveCache(userId), JSON.stringify(nuevas));
                    return nuevas;
                });
            } catch { /* la tira es contexto: sin red se queda con lo guardado */ }
        })();
        return () => { vivo = false; };
    }, [userId, tzOffset, version]);

    // Lo que cambie el diario (registrar, borrar, el coach) o volver a la app al día siguiente refresca la tira.
    useEffect(() => {
        // Lo que borra la propia tarjeta de hoy no pide nada: su anillo ya se movió con los datos en vivo (`hoy`).
        const refrescar = (e) => { if (e?.detail?.source !== 'tracking-progress') setVersion((v) => v + 1); };
        const alVolver = () => { if (!document.hidden) setVersion((v) => v + 1); };
        window.addEventListener('mealfit:refresh-inventory', refrescar);
        window.addEventListener('mealfit:diary-changed', refrescar);
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            window.removeEventListener('mealfit:refresh-inventory', refrescar);
            window.removeEventListener('mealfit:diary-changed', refrescar);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, []);

    // Se guarda el PRIMER DÍA con registros; las semanas se cuentan desde el domingo de esa semana (como el calendario).
    const primerDia = useMemo(
        () => inicioDelViaje(filas, hoyISO, userId ? safeLocalStorageGet(_claveInicio(userId), null) : null),
        [filas, hoyISO, userId],
    );
    useEffect(() => { if (userId) safeLocalStorageSet(_claveInicio(userId), primerDia); }, [userId, primerDia]);
    const inicio = domingoDe(primerDia);

    const semanaActual = numeroDeSemana(inicio, hoyISO);
    const semana = Math.max(1, Math.min(vista.semana ?? semanaActual, semanaActual));
    const enCurso = semana === semanaActual;
    const dias = useMemo(
        () => construirDias({
            hoyISO, calendarioISO, filas, hoy, targetCalories, targetMacros, mainGoal, fechas: fechasDeLaSemana(inicio, semana),
        }),
        [hoyISO, calendarioISO, filas, hoy, targetCalories, targetMacros, mainGoal, inicio, semana],
    );
    const racha = useMemo(
        () => rachaEnMeta(construirDias({
            hoyISO, filas, hoy, targetCalories, targetMacros, mainGoal,
            n: Math.min(DIAS_MAX_HISTORIA, semanaActual * DIAS_DE_LA_SEMANA),
        })),
        [hoyISO, filas, hoy, targetCalories, targetMacros, mainGoal, semanaActual],
    );
    const enMeta = dias.filter((d) => d.estado === 'meta').length;
    const estrellas = estrellasDeLaSemana(enMeta);
    const faltan = faltanParaLaSiguienteEstrella(enMeta);
    const diaDeLaSemana = dias.findIndex((d) => d.esHoy) + 1;
    const sel = elegido ? dias.find((d) => d.iso === elegido) : null;

    const irA = (n) => {
        const destino = Math.max(1, Math.min(n, semanaActual));
        if (destino === semana) return;
        setElegido(null);
        setVista({ semana: destino === semanaActual ? null : destino, sentido: destino > semana ? 1 : -1 });
    };

    const textoEstado = (d) => {
        if (d.estado === 'meta') return t('Meta cumplida');
        if (d.estado === 'futuro') return t('Aún no llega');
        if (d.estado === 'vacio') return t('Sin registros');
        const kcal = formatNumber(Math.abs(d.target - d.calories));
        if (d.estado === 'pasado') return t('{kcal} kcal de más', { kcal });
        return d.esHoy ? t('Te faltan {kcal} kcal', { kcal }) : t('{kcal} kcal por debajo', { kcal });
    };
    const fechaLarga = (d) => (d.esCalendarioHoy
        ? t('Hoy')
        : formatDate(mediodiaDe(d.iso), { weekday: 'long', day: 'numeric', month: 'long' }));
    const fechaCorta = (iso) => formatDate(mediodiaDe(iso), { day: 'numeric', month: 'short' });

    const macros = sel ? [
        { clave: 'protein', nombre: t('Proteína'), valor: sel.protein, meta: Number(sel.targetMacros?.protein) || 0 },
        { clave: 'carbs', nombre: t('Carbos'), valor: sel.carbs, meta: Number(sel.targetMacros?.carbs) || 0 },
        { clave: 'fats', nombre: t('Grasas'), valor: sel.fats, meta: Number(sel.targetMacros?.fats) || 0 },
    ] : [];

    const titulo = t('Semana {n}', { n: semana });
    const textoRacha = tn(racha, '{n} día seguido', '{n} días seguidos', { n: racha });
    return (
        <section
            className={`${styles.semana} ${estrellas === ESTRELLAS_MAX ? styles.semanaPerfecta : ''}`}
            aria-label={titulo}
        >
            <div className={styles.cabecera}>
                <div className={styles.nivel}>
                    {/* el número ya lo dice el título: la insignia lleva el trofeo (dorada con las 3 estrellas) */}
                    <span className={styles.insignia} aria-hidden="true"><Trophy key={semana} size={22} strokeWidth={2.25} /></span>
                    <div className={styles.nivelTexto}>
                        <h3 className={styles.titulo}>{titulo}</h3>
                        <p className={styles.sub}>
                            {enCurso
                                ? t('Día {n} de {total}', { n: diaDeLaSemana, total: DIAS_DE_LA_SEMANA })
                                : `${fechaCorta(dias[0].iso)} – ${fechaCorta(dias[DIAS_DE_LA_SEMANA - 1].iso)}`}
                        </p>
                    </div>
                </div>
                {calendario}
            </div>

            <div className={styles.resumen}>
                <span
                    className={styles.estrellas}
                    role="img"
                    aria-label={t('{n} de {total} estrellas', { n: estrellas, total: ESTRELLAS_MAX })}
                >
                    {Array.from({ length: ESTRELLAS_MAX }, (_, i) => (
                        <Star
                            key={`${semana}-${i}-${i < estrellas}`}
                            size={18}
                            strokeWidth={2.25}
                            className={i < estrellas ? styles.estrellaGanada : styles.estrella}
                            style={{ '--i': i }}
                            aria-hidden="true"
                        />
                    ))}
                </span>
                <p className={styles.cuenta}>
                    {t('{n} de {total} días en meta', { n: enMeta, total: DIAS_DE_LA_SEMANA })}
                </p>
                {racha >= 2 && (
                    <span className={styles.racha} role="img" aria-label={textoRacha} title={textoRacha}>
                        <Flame size={14} strokeWidth={2.5} aria-hidden="true" />
                        {racha}
                    </span>
                )}
                <span className={styles.flechas}>
                    <button
                        type="button"
                        className={styles.flecha}
                        disabled={semana <= 1}
                        onClick={() => irA(semana - 1)}
                        aria-label={t('Semana anterior')}
                    >
                        <ChevronLeft size={18} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className={styles.flecha}
                        disabled={enCurso}
                        onClick={() => irA(semana + 1)}
                        aria-label={t('Semana siguiente')}
                    >
                        <ChevronRight size={18} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                </span>
            </div>

            <motion.div
                key={semana}
                className={styles.cinta}
                role="group"
                aria-label={titulo}
                initial={vista.sentido ? { x: vista.sentido * 36, opacity: 0 } : false}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                drag="x"
                dragDirectionLock
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragEnd={(_e, info) => {
                    if (info.offset.x > 56) irA(semana - 1);
                    else if (info.offset.x < -56) irA(semana + 1);
                }}
            >
                {dias.map((d, i) => {
                    const activo = sel?.iso === d.iso;
                    const futuro = d.estado === 'futuro';
                    const lleno = Math.max(0, Math.min(1, d.ratio));
                    const clases = [styles.dia, styles[`dia_${d.estado}`]];
                    if (d.esHoy) clases.push(styles.diaHoy);
                    if (activo) clases.push(styles.diaActivo);
                    const sig = dias[i + 1];
                    let enlace = null;
                    if (sig) {
                        enlace = styles.enlace;
                        if (d.estado === 'meta' && sig.estado === 'meta') enlace += ` ${styles.enlaceMeta}`;
                        else if (sig.estado === 'futuro') enlace += ` ${styles.enlaceFuturo}`;
                    }
                    return (
                        <motion.button
                            key={d.iso}
                            type="button"
                            className={clases.join(' ')}
                            whileTap={futuro ? undefined : { scale: 0.88 }}
                            disabled={futuro}
                            aria-pressed={activo}
                            aria-label={`${fechaLarga(d)}: ${textoEstado(d)}`}
                            onClick={() => setElegido(activo ? null : d.iso)}
                            style={{ '--i': i }}
                        >
                            <span className={styles.letra}>
                                {d.esHoy && d.esCalendarioHoy ? t('Hoy') : formatDate(mediodiaDe(d.iso), { weekday: 'narrow' })}
                            </span>
                            <span className={styles.nodo}>
                                {enlace && <i className={enlace} aria-hidden="true" />}
                                <span className={styles.anillo}>
                                    <svg viewBox="0 0 44 44" aria-hidden="true">
                                        <circle className={styles.pista} cx="22" cy="22" r={RADIO} />
                                        {d.estado !== 'vacio' && !futuro && (
                                            <circle
                                                className={styles.arco}
                                                cx="22"
                                                cy="22"
                                                r={RADIO}
                                                style={{ '--largo': CIRCUNFERENCIA, '--resto': CIRCUNFERENCIA * (1 - lleno) }}
                                            />
                                        )}
                                    </svg>
                                    <span className={styles.centro}>
                                        {d.estado === 'meta' && <Check size={16} strokeWidth={3.25} aria-hidden="true" />}
                                        {futuro && <Lock size={12} strokeWidth={2.5} aria-hidden="true" />}
                                        {d.estado !== 'meta' && !futuro && Number(d.iso.slice(8))}
                                    </span>
                                    {d.estado === 'pasado' && (
                                        <span className={styles.exceso}><Plus size={9} strokeWidth={4} aria-hidden="true" /></span>
                                    )}
                                </span>
                            </span>
                        </motion.button>
                    );
                })}
            </motion.div>

            {estrellas === ESTRELLAS_MAX && (
                <p className={`${styles.aviso} ${styles.avisoPerfecta}`}>
                    <Star size={13} strokeWidth={2.5} aria-hidden="true" />
                    {t('Semana perfecta')}
                </p>
            )}
            {enCurso && faltan > 0 && (
                <p className={styles.aviso}>
                    <Star size={13} strokeWidth={2.5} aria-hidden="true" />
                    {tn(faltan, 'Falta {n} día en meta para otra estrella', 'Faltan {n} días en meta para otra estrella', { n: faltan })}
                </p>
            )}

            <AnimatePresence initial={false}>
                {sel && (
                    <motion.div
                        key="detalle"
                        className={styles.detalle}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className={styles.detalleDentro}>
                            <div className={styles.detalleCima}>
                                <span className={styles.fecha}>{fechaLarga(sel)}</span>
                                <span className={`${styles.chip} ${styles[`chip_${sel.estado}`]}`}>
                                    {sel.estado === 'meta' && <Check size={13} strokeWidth={3} aria-hidden="true" />}
                                    {textoEstado(sel)}
                                </span>
                            </div>
                            {sel.estado === 'vacio' ? (
                                <p className={styles.vacio}>{t('Ese día no anotaste comidas.')}</p>
                            ) : (
                                <>
                                    <p className={styles.kcal}>
                                        <strong>{formatNumber(sel.calories)}</strong>
                                        {sel.target > 0 && <span> / {formatNumber(sel.target)}</span>}
                                        <span> kcal</span>
                                        <span className={styles.comidas}>
                                            {tn(sel.mealsCount, '{n} comida', '{n} comidas', { n: sel.mealsCount })}
                                        </span>
                                    </p>
                                    <div className={`${styles.barra} ${styles[`barra_${sel.estado}`]}`}>
                                        <span style={{ width: `${Math.min(100, Math.round(sel.ratio * 100))}%` }} />
                                    </div>
                                    <ul className={styles.macros}>
                                        {macros.map((m) => (
                                            <li key={m.clave} className={styles[`macro_${m.clave}`]}>
                                                <span className={styles.macroNombre}>{m.nombre}</span>
                                                <span className={styles.macroValor}>
                                                    {formatNumber(m.valor)}{m.meta > 0 ? ` / ${formatNumber(m.meta)}` : ''} g
                                                </span>
                                                <span className={styles.macroBarra}>
                                                    <i style={{ width: `${m.meta > 0 ? Math.min(100, Math.round((m.valor / m.meta) * 100)) : 0}%` }} />
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                            {onAbrirDia && (
                                <button type="button" className={styles.verDia} onClick={() => onAbrirDia(sel.iso)}>
                                    {t('Ver este día')}
                                    <ChevronRight size={16} strokeWidth={2.5} aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
};

SemanaEnProgreso.propTypes = {
    userId: PropTypes.string,
    hoy: PropTypes.shape({
        calories: PropTypes.number, protein: PropTypes.number, carbs: PropTypes.number, fats: PropTypes.number,
        mealsCount: PropTypes.number,
    }),
    targetCalories: PropTypes.number,
    targetMacros: PropTypes.object,
    mainGoal: PropTypes.string,
    onAbrirDia: PropTypes.func,
    calendario: PropTypes.node,
};

export default SemanaEnProgreso;
