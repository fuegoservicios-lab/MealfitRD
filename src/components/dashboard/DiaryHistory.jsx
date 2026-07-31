// [P1-DIARY-HISTORY · 2026-07-31] Ver el diario de días pasados.
//
// POR QUÉ EXISTE
// El coach registra hacia atrás (`days_ago`): "cené dos panes" dicho por la
// mañana va al diario de AYER. Pero la única superficie que mostraba el diario
// era la card "Progreso en Tiempo Real", que es SOLO hoy. Resultado medido: el
// owner registró correctamente su cena de anoche, miró el panel en cero y
// reportó "no se registró" — la fila estaba en `consumed_meals`, fechada el día
// anterior. Un registro correcto que el usuario no puede ver es indistinguible
// de uno que falló.
//
// DECISIONES DE DISEÑO
// 1. El día es una LÍNEA, no una lista. Un diario de comidas es cronológico y
//    la card de hoy tira esa información. Aquí cada comida cuelga de su hora:
//    "18:51 · Cena" responde de un vistazo la pregunta que originó todo esto.
// 2. La tira de días es a la vez navegación y gráfico: la altura de cada barra
//    son las kcal de ese día contra el objetivo. Elegir día y ver la adherencia
//    son el mismo gesto, sin añadir un segundo componente.
// 3. Un día sin registro se dibuja HUECO, no a cero: la ausencia de dato tiene
//    que verse distinta de "un día flojo".
// 4. Drawer lateral, como `NotificationCenter` — la app ya tiene ese vocabulario
//    y una modal centrada abriría un tercer patrón para lo mismo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarDays } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';
import styles from './DiaryHistory.module.css';

const DIAS_TIRA = 14;

// Mismos 5 valores que emite el backend (`tools.py::_normalize_meal_type`).
const SLOT_LABEL = {
    desayuno: 'Desayuno',
    almuerzo: 'Almuerzo',
    cena: 'Cena',
    merienda: 'Merienda',
    snack: 'Snack',
};

// Un color por franja para que la línea del día se lea sin depender del texto.
const SLOT_COLOR = {
    desayuno: '#FBBF24',
    almuerzo: '#34D399',
    cena: '#818CF8',
    merienda: '#F472B6',
    snack: '#94A3B8',
};

const MACROS = [
    { key: 'protein', label: 'P', color: '#60A5FA' },
    { key: 'carbs', label: 'C', color: '#34D399' },
    { key: 'healthy_fats', label: 'G', color: '#F472B6' },
];

const DIA_LETRA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** `YYYY-MM-DD` en hora LOCAL. `toISOString()` daría UTC y en RD (UTC-4)
 *  cualquier cosa después de las 20:00 saltaría al día siguiente. */
const aISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Parseo explícito a fecha LOCAL. `new Date('2026-07-30')` la interpreta como
 *  medianoche UTC, que en RD es el día 29 a las 20:00 — el mismo desfase por el
 *  que esta pantalla existe. */
const desdeISO = (iso) => {
    const [a, m, d] = String(iso).split('-').map(Number);
    return new Date(a, (m || 1) - 1, d || 1);
};

const etiquetaRelativa = (iso, hoyISO) => {
    if (iso === hoyISO) return 'Hoy';
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    if (iso === aISO(ayer)) return 'Ayer';
    return '';
};

const horaDe = (meal) => {
    const raw = meal?.consumed_at || meal?.created_at;
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
};

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
};

const DiaryHistory = ({ userId, open, onClose, targetCalories = 2000 }) => {
    const hoyISO = useMemo(() => aISO(new Date()), []);
    const [selected, setSelected] = useState(hoyISO);
    const [resumen, setResumen] = useState([]);          // [{date, calories, meals_count}]
    const [dia, setDia] = useState(null);                // {meals, totals}
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    const cierreRef = useRef(null);

    const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

    // Los 14 días de la tira, del más antiguo al más reciente (izq → der), que
    // es como se lee una línea de tiempo en es-DO.
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

    // --- resumen del rango (una sola llamada) --------------------------------
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
                // La tira degrada a "sin datos": es un adorno informativo, no
                // debe tumbar la pantalla. El día seleccionado tiene su propio
                // fetch y su propio error visible.
            }
        })();
        return () => { vivo = false; };
    }, [open, userId, tzOffset]);

    // --- el día seleccionado -------------------------------------------------
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
                    setError('No pudimos cargar ese día. Revisa tu conexión e intenta de nuevo.');
                }
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
    }, [open, userId, selected, tzOffset]);

    const moverDia = useCallback((delta) => {
        setSelected((actual) => {
            const i = dias.indexOf(actual);
            const j = Math.min(dias.length - 1, Math.max(0, (i < 0 ? dias.length - 1 : i) + delta));
            return dias[j];
        });
    }, [dias]);

    // Esc cierra; flechas cambian de día. Un drawer sin teclado obliga a apuntar
    // con el ratón a botones de 38px.
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
    const relativa = etiquetaRelativa(selected, hoyISO);
    const totales = dia?.totals || {};
    const comidas = useMemo(() => {
        const lista = [...(dia?.meals || [])];
        // Orden cronológico ASCENDENTE: la línea del día se lee de la mañana a
        // la noche. El endpoint devuelve por `created_at` desc, que es el orden
        // de REGISTRO — no el de consumo, y son distintos justo en el caso que
        // motivó esta pantalla (una cena registrada al día siguiente).
        lista.sort((a, b) => {
            const ha = horaDe(a); const hb = horaDe(b);
            if (!ha || !hb) return 0;
            return ha - hb;
        });
        return lista;
    }, [dia]);

    if (!open) return null;

    const cuerpo = (
        <>
            <motion.div
                className={styles.overlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={onClose}
                aria-hidden="true"
            />
            <motion.aside
                className={styles.drawer}
                role="dialog"
                aria-modal="true"
                aria-label="Diario de días anteriores"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            >
                <header className={styles.head}>
                    <div>
                        <div className={styles.eyebrow}>Diario</div>
                        <h2 className={styles.dateTitle}>
                            {DIAS_LARGO[fecha.getDay()]} {fecha.getDate()} de {MESES[fecha.getMonth()]}
                        </h2>
                        {relativa && <div className={styles.dateRelative}>{relativa}</div>}
                    </div>
                    <button
                        ref={cierreRef}
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label="Cerrar"
                    >
                        <X size={17} />
                    </button>
                </header>

                <div className={styles.strip} role="tablist" aria-label="Elegir día">
                    {dias.map((iso) => {
                        const d = desdeISO(iso);
                        const r = porFecha.get(iso);
                        const kcal = r?.calories || 0;
                        const conDatos = (r?.meals_count || 0) > 0;
                        // Techo al 100%: un día por encima del objetivo llena la
                        // barra, no la desborda ni re-escala a los vecinos.
                        const pct = targetCalories > 0
                            ? Math.min(100, Math.round((kcal / targetCalories) * 100))
                            : 0;
                        const activo = iso === selected;
                        return (
                            <button
                                key={iso}
                                type="button"
                                role="tab"
                                aria-selected={activo}
                                className={`${styles.dayBtn} ${activo ? styles.dayBtnActive : ''}`}
                                onClick={() => setSelected(iso)}
                                title={conDatos
                                    ? `${kcal} kcal · ${r.meals_count} comida(s)`
                                    : 'Sin registro'}
                            >
                                <span className={styles.dayLetter}>{DIA_LETRA[d.getDay()]}</span>
                                <span className={`${styles.rail} ${conDatos ? '' : styles.railEmpty}`}>
                                    {conDatos && (
                                        <motion.span
                                            className={styles.railFill}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${Math.max(pct, 6)}%` }}
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

                <div className={styles.totals}>
                    <div className={styles.kcal}>
                        {num(totales.calories)}
                        <span className={styles.kcalUnit}>kcal</span>
                    </div>
                    <div />
                </div>
                <div className={styles.macros}>
                    {MACROS.map((m) => (
                        <span key={m.key} className={styles.macro}>
                            <span className={styles.macroDot} style={{ background: m.color }} />
                            {m.label}<span className={styles.macroValue}>&nbsp;{num(totales[m.key])} g</span>
                        </span>
                    ))}
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.timeline}>
                    {cargando && (
                        <>
                            <div className={styles.skeleton} />
                            <div className={styles.skeleton} />
                        </>
                    )}

                    {!cargando && !error && comidas.length === 0 && (
                        <div className={styles.empty}>
                            <div className={styles.emptyTitle}>
                                {relativa === 'Hoy'
                                    ? 'Todavía no registras nada hoy'
                                    : `No registraste nada el ${DIAS_LARGO[fecha.getDay()].toLowerCase()}`}
                            </div>
                            <p className={styles.emptyHint}>
                                Puedes contárselo al coach en el chat aunque haya pasado —
                                él lo anota en el día que corresponda.
                            </p>
                        </div>
                    )}

                    {!cargando && comidas.map((meal, i) => {
                        const h = horaDe(meal);
                        const slot = (meal.meal_type || '').toLowerCase();
                        const color = SLOT_COLOR[slot] || '#94A3B8';
                        return (
                            <motion.div
                                key={meal.id || `${meal.meal_name}-${i}`}
                                className={styles.entry}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.24, delay: Math.min(i, 6) * 0.035 }}
                            >
                                <span className={styles.hour}>
                                    {h ? `${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}` : '--:--'}
                                </span>
                                <span className={styles.node} style={{ color }} />
                                <div className={styles.body}>
                                    <div className={styles.slot} style={{ color }}>
                                        {SLOT_LABEL[slot] || 'Comida'}
                                    </div>
                                    <div className={styles.mealName}>{meal.meal_name || 'Sin nombre'}</div>
                                    <div className={styles.mealMacros}>
                                        <span className={styles.mealKcal}>{num(meal.calories)} kcal</span>
                                        {' · '}P {num(meal.protein)} g · C {num(meal.carbs)} g · G {num(meal.healthy_fats)} g
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
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
};

/** Botón que abre el drawer. Vive junto al componente para que añadirlo a una
 *  card sea una línea y no haya dos sitios que mantener sincronizados. */
export const DiaryHistoryTrigger = ({ onClick }) => (
    <button type="button" className={styles.trigger} onClick={onClick}>
        <CalendarDays size={14} />
        Ver días anteriores
    </button>
);

DiaryHistoryTrigger.propTypes = { onClick: PropTypes.func };

export default DiaryHistory;
