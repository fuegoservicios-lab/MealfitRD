// [SEMANA-EN-PROGRESO · 2026-11-15] «Tu semana»: el progreso de los días a la vista, sin abrir nada.
//
// Antes, para saber si ayer se cumplió la meta había que abrir «Calendario y comidas». Ahora la pestaña Progreso lo
// enseña de entrada: una tira de 14 días (7 a la vista, se desliza hacia atrás) donde cada día es un ANILLO que se
// llena con sus calorías frente a la meta de ese día:
//   · verde con ✓  = día completado (dentro de la banda de la meta);
//   · ámbar        = se quedó corto;   · coral = se pasó;   · punteado = sin registros.
// Tocar un día abre debajo su resumen (kcal, macros, comidas) y un botón que lleva al cajón del diario YA en ese día.
// Arriba, la racha de días seguidos en meta y cuántos de los últimos 7 se cumplieron.
//
// Hoy se pinta con lo que la tarjeta ya tiene en memoria (sube en vivo al registrar); los días pasados salen de
// `/api/diary/consumed-range` (el mismo endpoint del calendario) y se guardan para pintar al instante la próxima vez.
import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, Flame, Plus } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';
import { formatDate, formatNumber, useT, useTn } from '../../i18n';
import { getBiologicalDateStr } from '../../utils/diaBiologico';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import {
    DIAS_DE_LA_SEMANA, DIAS_EN_TIRA, construirDias, diasEnMetaDeLaSemana, mediodiaDe, rachaEnMeta,
} from '../../utils/progresoDeLosDias';
import styles from './SemanaEnProgreso.module.css';

const RADIO = 17;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
const _claveCache = (userId) => `mealfit_semana_progreso_${userId}`;

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
    const cintaRef = useRef(null);
    const hoyISO = getBiologicalDateStr(new Date());

    useEffect(() => {
        if (!userId) return undefined;
        let vivo = true;
        (async () => {
            try {
                const res = await fetchWithAuth(`/api/diary/consumed-range/${userId}?days=${DIAS_EN_TIRA}&tzOffset=${tzOffset}`);
                const data = await res.json();
                if (!vivo || !Array.isArray(data?.days)) return;
                setFilas(data.days);
                safeLocalStorageSet(_claveCache(userId), JSON.stringify(data.days));
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

    // La cinta abre por HOY (el extremo derecho); los días viejos quedan a un deslizamiento.
    useEffect(() => {
        const cinta = cintaRef.current;
        if (cinta) cinta.scrollLeft = cinta.scrollWidth;
    }, []);

    const dias = useMemo(
        () => construirDias({ hoyISO, filas, hoy, targetCalories, targetMacros, mainGoal }),
        [hoyISO, filas, hoy, targetCalories, targetMacros, mainGoal],
    );
    const racha = rachaEnMeta(dias);
    const enMeta = diasEnMetaDeLaSemana(dias);
    const sel = elegido ? dias.find((d) => d.iso === elegido) : null;

    const textoEstado = (d) => {
        if (d.estado === 'meta') return t('Meta cumplida');
        if (d.estado === 'vacio') return t('Sin registros');
        const kcal = formatNumber(Math.abs(d.target - d.calories));
        if (d.estado === 'pasado') return t('{kcal} kcal de más', { kcal });
        return d.esHoy ? t('Te faltan {kcal} kcal', { kcal }) : t('{kcal} kcal por debajo', { kcal });
    };
    const fechaLarga = (d) => (d.esHoy
        ? t('Hoy')
        : formatDate(mediodiaDe(d.iso), { weekday: 'long', day: 'numeric', month: 'long' }));

    const macros = sel ? [
        { clave: 'protein', nombre: t('Proteína'), valor: sel.protein, meta: Number(sel.targetMacros?.protein) || 0 },
        { clave: 'carbs', nombre: t('Carbos'), valor: sel.carbs, meta: Number(sel.targetMacros?.carbs) || 0 },
        { clave: 'fats', nombre: t('Grasas'), valor: sel.fats, meta: Number(sel.targetMacros?.fats) || 0 },
    ] : [];

    return (
        <section className={styles.semana} aria-label={t('Tu semana')}>
            <div className={styles.cabecera}>
                <h3 className={styles.titulo}>{t('Tu semana')}</h3>
                {calendario}
            </div>
            <div className={styles.resumen}>
                <p className={styles.sub}>
                    {t('{n} de {total} días en meta', { n: enMeta, total: DIAS_DE_LA_SEMANA })}
                </p>
                {racha >= 2 && (
                    <span className={styles.racha}>
                        <Flame size={14} strokeWidth={2.5} aria-hidden="true" />
                        {tn(racha, '{n} día seguido', '{n} días seguidos', { n: racha })}
                    </span>
                )}
            </div>

            <div className={styles.cinta} ref={cintaRef} role="group" aria-label={t('Tu semana')}>
                {dias.map((d, i) => {
                    const activo = sel?.iso === d.iso;
                    const lleno = Math.max(0, Math.min(1, d.ratio));
                    const clases = [styles.dia, styles[`dia_${d.estado}`]];
                    if (d.esHoy) clases.push(styles.diaHoy);
                    if (activo) clases.push(styles.diaActivo);
                    return (
                        <motion.button
                            key={d.iso}
                            type="button"
                            className={clases.join(' ')}
                            whileTap={{ scale: 0.88 }}
                            aria-pressed={activo}
                            aria-label={`${fechaLarga(d)}: ${textoEstado(d)}`}
                            onClick={() => setElegido(activo ? null : d.iso)}
                            style={{ '--i': i % DIAS_DE_LA_SEMANA }}
                        >
                            <span className={styles.letra}>
                                {d.esHoy ? t('Hoy') : formatDate(mediodiaDe(d.iso), { weekday: 'narrow' })}
                            </span>
                            <span className={styles.anillo}>
                                <svg viewBox="0 0 44 44" aria-hidden="true">
                                    <circle className={styles.pista} cx="22" cy="22" r={RADIO} />
                                    {d.estado !== 'vacio' && (
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
                                    {d.estado === 'meta'
                                        ? <Check size={16} strokeWidth={3.25} aria-hidden="true" />
                                        : Number(d.iso.slice(8))}
                                </span>
                                {d.estado === 'pasado' && (
                                    <span className={styles.exceso}><Plus size={9} strokeWidth={4} aria-hidden="true" /></span>
                                )}
                            </span>
                        </motion.button>
                    );
                })}
            </div>

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
