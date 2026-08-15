// [P1-DIARY-HISTORY · 2026-07-31 · rediseño P2-DIARY-SLOTS] El diario, día por día.
//
// POR QUÉ EXISTE
// El coach registra hacia atrás (`days_ago`): "cené dos panes" dicho por la
// mañana va al diario de AYER. La única superficie que mostraba el diario era
// la card "Progreso en Tiempo Real", que es SOLO hoy. El owner registró bien su
// cena de anoche, miró el panel en cero y reportó "no se registró" — la fila
// estaba, fechada el día anterior. Un registro correcto que no se puede ver es
// indistinguible de uno que falló.
//
// POR QUÉ SE REDISEÑÓ A LOS 20 MINUTOS
// La v1 dibujaba una LÍNEA HORARIA. Estaba mal por los datos, no por el gusto:
// `tools.log_consumed_meal` sella `consumed_at = now() - N días`, así que una
// cena registrada a las 10:51 de la mañana salía como "10:51 · CENA". Medido en
// la fila real: `consumed=30 jul 14:51:04` / `created=31 jul 14:51:04` — el
// mismo minuto, 24 h de diferencia. La hora era el instante del REGISTRO.
//   ⇒ La señal de la v1 descansaba sobre un dato inventado.
//
// Lo que SÍ es real es la FRANJA: la nombró el usuario. Y en cuanto el día se
// dibuja por sus franjas, el enorme vacío bajo una sola comida deja de ser un
// problema de espaciado y pasa a ser la respuesta a "¿qué me falta?".
//
// UNA SOLA GRAMÁTICA: punteado = sin dato. Lo usa el riel de un día sin
// registro en la tira y lo usa una franja vacía. Las dos mitades del cajón
// dicen lo mismo de la misma forma.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarDays, ChevronRight } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';
import { useT } from '../../i18n';
import styles from './DiaryHistory.module.css';

const DIAS_TIRA = 14;

// [P1-I18N-DASHBOARD · 2026-08-15] Las tablas de copy son FUNCIONES: evaluadas
// como constantes correrían al importar, antes de que el catálogo exista, y se
// quedarían en español para siempre. Las `key` NO se traducen — son el enum de
// `meal_type` del backend.
//
// El orden es el del DÍA, no el del enum del backend: así la pantalla se lee
// de la mañana a la noche aunque no haya ni una hora fiable.
const getFranjas = (t) => [
    { key: 'desayuno', label: t('Desayuno'), color: '#FBBF24' },
    { key: 'almuerzo', label: t('Almuerzo'), color: '#34D399' },
    { key: 'merienda', label: t('Merienda'), color: '#F472B6' },
    { key: 'cena', label: t('Cena'), color: '#818CF8' },
];
// `snack` no tiene fila propia: no es una franja del día sino algo suelto entre
// medias. Se agrupa al final y solo aparece si existe.
const getSnack = (t) => ({ key: 'snack', label: t('Snacks'), color: '#94A3B8' });

const getMacros = (t) => [
    { key: 'protein', label: t('Proteína'), color: '#60A5FA', goal: 'protein' },
    { key: 'carbs', label: t('Carbos'), color: '#34D399', goal: 'carbs' },
    { key: 'healthy_fats', label: t('Grasas'), color: '#F472B6', goal: 'fats' },
];

const DIA_LETRA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
// Cuerpo con llaves a propósito: el validador (`scripts/i18n-check.mjs`) mide el
// ámbito contando llaves, así que una flecha que devuelve un array pelado deja
// sus `t()` a profundidad 0 y los reporta —con razón formal— como ámbito de
// módulo. Con bloque, la lectura del validador coincide con la realidad.
const getMeses = (t) => {
    return [t('enero'), t('febrero'), t('marzo'), t('abril'), t('mayo'), t('junio'), t('julio'),
        t('agosto'), t('septiembre'), t('octubre'), t('noviembre'), t('diciembre')];
};
const getDiasLargo = (t) => {
    return [t('Domingo'), t('Lunes'), t('Martes'), t('Miércoles'), t('Jueves'), t('Viernes'), t('Sábado')];
};

/** `YYYY-MM-DD` en hora LOCAL. `toISOString()` daría UTC y en RD (UTC-4)
 *  cualquier cosa después de las 20:00 saltaría al día siguiente. */
const aISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Parseo explícito a fecha LOCAL. `new Date('2026-07-30')` la interpreta como
 *  medianoche UTC, que en RD es el día 29 a las 20:00. */
const desdeISO = (iso) => {
    const [a, m, d] = String(iso).split('-').map(Number);
    return new Date(a, (m || 1) - 1, d || 1);
};

const aFecha = (raw) => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
};

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
};

const pct = (v, meta) => (meta > 0 ? Math.min(100, Math.round((num(v) / meta) * 100)) : 0);

/**
 * ¿Se puede confiar en la hora de esta comida?
 *
 * `log_consumed_meal` retrodata con `consumed_at = now() - N días`, así que en
 * un registro de otro día la hora es la del REGISTRO y no la de la comida.
 * Se detecta comparando los DÍAS de ambas marcas: si difieren, fue retrodatado.
 * No hace falta epsilon — la pregunta es "¿lo anotaste otro día?", no "¿cuánto
 * se parecen los relojes?".
 */
const horaFiable = (meal) => {
    const consumido = aFecha(meal?.consumed_at);
    const creado = aFecha(meal?.created_at);
    if (!consumido) return null;
    if (creado && aISO(creado) !== aISO(consumido)) return null;
    return consumido;
};

const hhmm = (d) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const DiaryHistory = ({ userId, open, onClose, targetCalories = 2000, targetMacros = {} }) => {
    const t = useT();
    const hoyISO = useMemo(() => aISO(new Date()), []);
    const [selected, setSelected] = useState(hoyISO);
    const [resumen, setResumen] = useState([]);
    const [dia, setDia] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    const cierreRef = useRef(null);
    const stripRef = useRef(null);
    const activoRef = useRef(null);

    const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

    const dias = useMemo(() => {
        const out = [];
        for (let i = DIAS_TIRA - 1; i >= 0; i -= 1) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            out.push(aISO(d));
        }
        return out;
    }, []);

    const porFecha = useMemo(() => {
        const m = new Map();
        resumen.forEach((r) => m.set(r.date, r));
        return m;
    }, [resumen]);

    useEffect(() => {
        if (!open || !userId) return undefined;
        let vivo = true;
        (async () => {
            try {
                const res = await fetchWithAuth(
                    `/api/diary/consumed-range/${userId}?days=${DIAS_TIRA}&tzOffset=${tzOffset}`
                );
                const data = await res.json();
                if (vivo && Array.isArray(data?.days)) setResumen(data.days);
            } catch {
                // La tira degrada a "sin datos": es contexto, no el contenido.
            }
        })();
        return () => { vivo = false; };
    }, [open, userId, tzOffset]);

    useEffect(() => {
        if (!open || !userId) return undefined;
        let vivo = true;
        setCargando(true);
        setError('');
        (async () => {
            try {
                const res = await fetchWithAuth(
                    `/api/diary/consumed/${userId}?date=${selected}&tzOffset=${tzOffset}`
                );
                if (!res.ok) throw new Error('respuesta no OK');
                const data = await res.json();
                if (vivo) setDia({ meals: data?.meals || [], totals: data?.totals || {} });
            } catch {
                if (vivo) {
                    setDia(null);
                    setError(t('No pudimos cargar ese día. Revisa tu conexión e intenta de nuevo.'));
                }
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
    }, [open, userId, selected, tzOffset, t]);

    // [P1-DIARY-STRIP-SCROLL] Los 14 días no caben y la barra está oculta: sin
    // esto la tira abría por los días MÁS VIEJOS y hoy/ayer quedaban fuera de
    // pantalla. Se ancla al día ACTIVO para que también siga a las flechas.
    useEffect(() => {
        if (!open) return;
        const nodo = activoRef.current;
        const cinta = stripRef.current;
        if (!nodo || !cinta) return;
        const izq = nodo.offsetLeft - (cinta.clientWidth - nodo.offsetWidth) / 2;
        cinta.scrollTo({
            left: Math.max(0, izq),
            behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                ? 'auto' : 'smooth',
        });
    }, [open, selected, dias]);

    const moverDia = useCallback((delta) => {
        setSelected((actual) => {
            const i = dias.indexOf(actual);
            const j = Math.min(dias.length - 1, Math.max(0, (i < 0 ? dias.length - 1 : i) + delta));
            return dias[j];
        });
    }, [dias]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); moverDia(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); moverDia(1); }
        };
        window.addEventListener('keydown', onKey);
        cierreRef.current?.focus();
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose, moverDia]);

    const fecha = desdeISO(selected);
    const esHoy = selected === hoyISO;
    const esAyer = useMemo(() => {
        const a = new Date(); a.setDate(a.getDate() - 1);
        return selected === aISO(a);
    }, [selected]);
    const totales = dia?.totals || {};

    // Las comidas agrupadas por franja, en el orden del día.
    const porFranja = useMemo(() => {
        const m = new Map();
        (dia?.meals || []).forEach((meal) => {
            const k = (meal.meal_type || 'snack').toLowerCase();
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(meal);
        });
        return m;
    }, [dia]);

    const sinNada = !cargando && !error && (dia?.meals || []).length === 0;

    if (!open) return null;

    const renderComida = (meal) => {
        const h = horaFiable(meal);
        const creado = aFecha(meal?.created_at);
        return (
            <div key={meal.id || meal.meal_name}>
                <div className={styles.mealName}>{meal.meal_name || t('Sin nombre')}</div>
                <div className={styles.mealMacros}>
                    <span className={styles.mealKcal}>{num(meal.calories)} kcal</span>
                    {' · '}P {num(meal.protein)} · C {num(meal.carbs)} · G {num(meal.healthy_fats)}
                </div>
                {/* La hora solo si es de fiar. Si se anotó otro día, se dice ESO
                    — que es verdad y además útil — en vez de una hora inventada. */}
                {!h && creado && (
                    <div className={styles.loggedOn}>
                        {t('Lo anotaste el {diaSemana} {dia}', {
                            diaSemana: getDiasLargo(t)[creado.getDay()].toLowerCase(),
                            dia: creado.getDate(),
                        })}
                    </div>
                )}
            </div>
        );
    };

    const cuerpo = (
        <>
            <motion.div
                className={styles.overlay}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={onClose} aria-hidden="true"
            />
            <motion.aside
                className={styles.drawer}
                role="dialog" aria-modal="true" aria-label={t('Diario de días anteriores')}
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            >
                <header className={styles.head}>
                    <div>
                        <div className={styles.eyebrow}>{t('Diario')}</div>
                        <h2 className={styles.dateTitle}>
                            {t('{diaSemana} {dia} de {mes}', {
                                diaSemana: getDiasLargo(t)[fecha.getDay()],
                                dia: fecha.getDate(),
                                mes: getMeses(t)[fecha.getMonth()],
                            })}
                        </h2>
                        {(esHoy || esAyer) && (
                            <div className={styles.dateRelative}>{esHoy ? t('Hoy') : t('Ayer')}</div>
                        )}
                    </div>
                    <button
                        ref={cierreRef} type="button" className={styles.closeBtn}
                        onClick={onClose} aria-label={t('Cerrar')}
                    >
                        <X size={17} />
                    </button>
                </header>

                <div ref={stripRef} className={styles.strip} role="tablist" aria-label={t('Elegir día')}>
                    {dias.map((iso) => {
                        const d = desdeISO(iso);
                        const r = porFecha.get(iso);
                        const kcal = r?.calories || 0;
                        const conDatos = (r?.meals_count || 0) > 0;
                        const alto = pct(kcal, targetCalories);
                        const activo = iso === selected;
                        return (
                            <button
                                key={iso}
                                ref={activo ? activoRef : null}
                                type="button" role="tab" aria-selected={activo}
                                className={`${styles.dayBtn} ${activo ? styles.dayBtnActive : ''}`}
                                onClick={() => setSelected(iso)}
                                title={conDatos
                                    ? t('{kcal} kcal · {n} comida(s)', { kcal, n: r.meals_count })
                                    : t('Sin registro')}
                            >
                                <span className={styles.dayLetter}>{DIA_LETRA[d.getDay()]}</span>
                                <span className={`${styles.rail} ${conDatos ? '' : styles.railEmpty}`}>
                                    {conDatos && (
                                        <motion.span
                                            className={styles.railFill}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${Math.max(alto, 8)}%` }}
                                            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                                        />
                                    )}
                                </span>
                                <span className={styles.dayNum}>{d.getDate()}</span>
                                <span className={iso === hoyISO ? styles.todayDot : styles.todayDotHidden} />
                            </button>
                        );
                    })}
                </div>

                <div className={styles.quota}>
                    <div className={styles.quotaTop}>
                        <span className={styles.quotaNum}>{num(totales.calories)}</span>
                        <span className={styles.quotaOf}>{t('de {kcal} kcal', { kcal: targetCalories })}</span>
                    </div>
                    <div className={styles.quotaBar}>
                        <motion.div
                            className={styles.quotaFill}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct(totales.calories, targetCalories)}%` }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        />
                    </div>
                </div>

                <div className={styles.macroRow}>
                    {getMacros(t).map((m) => {
                        const meta = num(targetMacros?.[m.goal]) || 0;
                        return (
                            <div key={m.key} className={styles.macroCell}>
                                <div className={styles.macroTop}>
                                    <span className={styles.macroName}>{m.label}</span>
                                    <span className={styles.macroVal}>
                                        {num(totales[m.key])}{meta ? `/${meta}` : ''} g
                                    </span>
                                </div>
                                <div className={styles.macroBar}>
                                    <motion.div
                                        className={styles.macroFill}
                                        style={{ background: m.color }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${pct(totales[m.key], meta)}%` }}
                                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.slots}>
                    {cargando && (<><div className={styles.skeleton} /><div className={styles.skeleton} /></>)}

                    {!cargando && !error && getFranjas(t).map((f, i) => {
                        const items = porFranja.get(f.key) || [];
                        const lleno = items.length > 0;
                        return (
                            <motion.div
                                key={f.key}
                                className={`${styles.slot} ${lleno ? '' : styles.slotEmpty}`}
                                style={{ color: f.color }}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.22, delay: i * 0.04 }}
                            >
                                <span className={styles.slotRule} />
                                <div>
                                    <div className={styles.slotHead}>
                                        <span className={styles.slotLabel} style={lleno ? { color: f.color } : undefined}>
                                            {f.label}
                                        </span>
                                        {lleno && items.length === 1 && horaFiable(items[0]) && (
                                            <span className={styles.slotNote}>{hhmm(horaFiable(items[0]))}</span>
                                        )}
                                    </div>
                                    {lleno
                                        ? items.map((meal) => renderComida(meal))
                                        : <div className={styles.slotEmptyText}>{t('Sin registro')}</div>}
                                </div>
                            </motion.div>
                        );
                    })}

                    {!cargando && !error && (porFranja.get(getSnack(t).key) || []).length > 0 && (
                        <div className={styles.slot} style={{ color: getSnack(t).color }}>
                            <span className={styles.slotRule} />
                            <div>
                                <div className={styles.slotHead}>
                                    <span className={styles.slotLabel} style={{ color: getSnack(t).color }}>
                                        {getSnack(t).label}
                                    </span>
                                </div>
                                {porFranja.get(getSnack(t).key).map((meal) => renderComida(meal))}
                            </div>
                        </div>
                    )}

                    {sinNada && (
                        <p className={styles.dayEmpty}>
                            {esHoy
                                ? t('El día está en blanco. Cuéntale al coach lo que comas y lo va anotando aquí.')
                                : t('Ese día quedó sin registrar. Puedes contárselo al coach aunque haya pasado — él lo anota en la fecha que corresponda.')}
                        </p>
                    )}
                </div>
            </motion.aside>
        </>
    );

    return createPortal(<AnimatePresence>{cuerpo}</AnimatePresence>, document.body);
};

DiaryHistory.propTypes = {
    userId: PropTypes.string,
    open: PropTypes.bool,
    onClose: PropTypes.func,
    targetCalories: PropTypes.number,
    targetMacros: PropTypes.object,
};

/** Botón que abre el cajón. Vive junto al componente para que añadirlo a una
 *  card sea una línea y no haya dos sitios que mantener sincronizados. */
export const DiaryHistoryTrigger = ({ onClick }) => {
    const t = useT();
    return (
        <button type="button" className={styles.trigger} onClick={onClick}>
            <CalendarDays size={14} />
            {t('Ver días anteriores')}
            <ChevronRight size={14} className={styles.triggerChevron} />
        </button>
    );
};

DiaryHistoryTrigger.propTypes = { onClick: PropTypes.func };

export default DiaryHistory;
