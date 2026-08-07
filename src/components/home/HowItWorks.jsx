import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import SeeMoreLink from './SeeMoreLink';
// [P1-LANDING-BENCH-1 · 2026-08-07] «17 micronutrientes» y «20+ variables»
// vivían escritos a mano aquí y en otros 6 sitios — ver data/systemFacts.js.
import { INPUT_VARIABLES_LABEL, MICROS_TRACKED } from '../../data/systemFacts';
import styles from './HowItWorks.module.css';

/* ============================================================================
   [P2-PAPER-NO-INK · 2026-08-01] HowItWorks → «02 / CÓMO SE CALCULA».

   El acordeón con auto-avance MURIÓ entero: `AUTO_ADVANCE_MS = 4500`, los
   estados `active`/`paused`, el `setInterval` que rotaba el paso activo, los
   handlers `onMouseEnter`/`onFocus`/`onBlur` que lo pausaban (el
   `onMouseEnter` que cambiaba de paso al pasar el mouse por la lista es
   además hostil en trackpad: dispara con el cursor de paso), los dos
   `AnimatePresence` (uno para el visual, otro para la descripción expandida)
   y los cuatro visuales generativos con sus anillos/tokens/sheen en loop
   infinito.

   Con ellos se fueron los 4 acentos de color — que NO vivían en el CSS, vivían
   en este archivo, en el array STEPS, inyectados como
   `style={{'--accent': step.color}}`. Un pase solo-CSS jamás los habría
   tocado; hacía falta abrir el JSX. `grep -n "color:" HowItWorks.jsx` en la
   versión anterior daba 4 resultados: `#60A5FA`/`#A78BFA`/`#34D399`/`#FB923C`.

   Tres degradados que morían LITERALMENTE en blanco también se fueron sin
   adaptar: `.stepProgress`, `.vRowFill` y `.vEngineSheen` terminaban en
   `color-mix(…, #ffffff)`. Sobre `--bg-card: #FFFFFF` la mitad derecha de
   cada barra y la cabeza del sheen se borran — extremo medido `#8FE7C7`
   1,456:1. No se retiñeron: no hay nada que retiñar, la sección ya no gira.

   Ahora: una HOJA DE PROCESO ESTÁTICA. Las cuatro etapas están visibles a la
   vez — cero estado interactivo, cero temporizador. El único estado que
   queda es `drawn`, y no es interactivo: es el gate de una animación de
   entrada que se dispara UNA vez (igual que `PlateExploded.jsx`, Fig. 00 del
   hero) y no vuelve a moverse.

   EL EJE DE PROCESO. Una regla de 1px cruza el ancho de contenido; sobre
   ella, 4 estaciones (rombo de 9px = punto de medida) de las que sube una
   línea de 16px al índice mono y baja otra de 24px a la celda. Es geometría
   pura (líneas/rombos), así que se construye en HTML/CSS, no en SVG: un
   único `<svg>` con `preserveAspectRatio="none"` habría escalado X e Y por
   separado y el rombo habría dejado de ser cuadrado.

   LAS CUATRO FIGURAS (88×64, line-art de 1px) SÍ son SVG, y siguen el
   patrón exacto de `figures/PlateExploded.jsx`: `pathLength={1}` +
   `vector-effect="non-scaling-stroke"` en lo que se TRAZA (clase `.stroke`),
   SOLO `vector-effect` en lo que ya trae su propio `stroke-dasharray` (clase
   `.guide`) — mezclar los dos en el mismo elemento re-interpreta el
   dasharray sobre un path normalizado a longitud 1 y la guía punteada se
   dibuja SÓLIDA. Ninguna de las 4 figuras lleva `<text>`: a 88 unidades de
   ancho, ninguna palabra real cabe por encima del piso de 11px del sistema
   (`HABICHUELA GUISADA` ya agota el margen a 420 unidades en Fig. 00). Los 4
   rótulos que pide la Fig. 01 (Perfil) son HTML real, fuera del SVG — el
   mismo patrón que ya usaba `vChartAxis` en la versión anterior de este
   archivo para las semanas del gráfico.

   REDUCED MOTION, DOBLE DEFENSA. (a) `useReducedMotion()` gatea el estado
   `drawn` en su DEFINICIÓN — con `reduce` el IntersectionObserver ni se
   monta, `drawn` nace `true`. (b) el bloque `@media` de
   `HowItWorks.module.css` fija la pose de reposo (todo `!important`): el
   guard global de `index.css` solo acorta duraciones, no anula un
   `stroke-dashoffset` que dejaría una figura en blanco para siempre. */

const STEPS = [
    {
        title: 'Perfil clínico-metabólico',
        desc: 'Más que tu peso: composición, gasto energético, condiciones, alergias IgE, presupuesto y estilo de vida. Es el sustrato de cada decisión del motor.',
        tag: `${INPUT_VARIABLES_LABEL} variables de entrada`,
    },
    {
        title: 'Motor de inferencia',
        // [P1-AI-CONFIDENTIAL · 2026-07-11] Sin nombres de modelos: la identidad
        // de los modelos que orquesta el motor es confidencial y rota según
        // rendimiento (ver Política de Uso de IA §2).
        desc: 'Nuestro motor híbrido orquesta modelos de IA de última generación — su identidad es confidencial y evoluciona constantemente — contra el catálogo verificado, optimizando macronutrientes, coste y adherencia en minutos, no a ojo.',
        tag: 'IA de frontera · minutos',
    },
    {
        title: 'Calibración nutricional',
        desc: `Cada plato se ajusta a tus macronutrientes objetivo y a ${MICROS_TRACKED} micronutrientes (vs DRI), con coherencia receta↔lista validada.`,
        tag: `${MICROS_TRACKED} micronutrientes · DRI`,
    },
    {
        title: 'Adaptación longitudinal',
        desc: 'El plan se recalcula con tu progreso semana a semana, ajustando porciones para sortear la meseta metabólica.',
        tag: 'recálculo semanal',
    },
];

/* Índice = stagger. `--d` se fija UNA vez por columna (en `.stationGroup` del
   eje y en `.cell`) y todo lo de adentro lo hereda por herencia normal de
   custom properties — no hace falta repetirlo en cada trazo. */
const delayOf = (i) => `${i * 70}ms`;

/* [P2-PAPER-NO-INK fix1] Mismas constantes que `figures/PlateExploded.jsx`
   (`VE`/`T`), extraídas aquí en vez de repetir los dos atributos a mano en
   cada trazo: es exactamente la confusión que costó una ronda de revisión
   en el hero (mezclar `pathLength` en una guía punteada re-interpreta su
   `stroke-dasharray` sobre un path normalizado a longitud 1 y la dibuja
   sólida). `VE` va SOLO en lo que trae su propio dasharray (`.guide`) o no
   se traza (nodos, nada que anime `stroke-dashoffset`); `T` va en lo que SÍ
   se traza (`.stroke`). */
const VE = { vectorEffect: 'non-scaling-stroke' };
const T = { ...VE, pathLength: 1 };

/* ───────────────────────────── Fig. 01 — Perfil ────────────────────────────
   Cuatro barras en CONTORNO (no es el dato acotado, es la variedad de
   entradas) de largo distinto. Los 4 rótulos son las restricciones reales
   con las que trabaja el motor en RD — HTML real al lado del SVG, ver nota
   de cabecera. */
function ProfileFigure() {
    const rows = [
        { y: 4, w: 60, label: 'PRESUPUESTO RD$' },
        { y: 20, w: 44, label: 'ALERGIAS' },
        { y: 36, w: 72, label: 'CONDICIÓN CLÍNICA' },
        { y: 52, w: 50, label: 'LO QUE HAY EN LA NEVERA' },
    ];
    return (
        <>
            <svg className={styles.fig} viewBox="0 0 88 64" role="presentation" aria-hidden="true" focusable="false">
                {rows.map((r) => (
                    <rect key={r.label} className={styles.stroke}
                        x="4" y={r.y} width={r.w} height="8" {...T} />
                ))}
            </svg>
            <ul className={styles.figLegend}>
                {rows.map((r) => <li key={r.label}>{r.label}</li>)}
            </ul>
        </>
    );
}

/* ───────────────────────────── Fig. 02 — Motor ─────────────────────────────
   Cuadrado SELLADO (contorno) con interior tramado a 45° — «material
   seccionado»: se ve que hay algo dentro, no se ve qué. Cuatro guías cortas
   entran desde los 4 lados y se detienen en el borde; ninguna sale rotulada
   por el otro extremo. Es `P1-AI-CONFIDENTIAL` dibujado. */
function EngineFigure() {
    return (
        <svg className={styles.fig} viewBox="0 0 88 64" role="presentation" aria-hidden="true" focusable="false">
            <defs>
                <pattern id="howEngineHatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                    <line className={styles.hatchLine} x1="0" y1="0" x2="0" y2="5" {...VE} />
                </pattern>
            </defs>
            <rect className={styles.hatchFill} x="24" y="8" width="40" height="40" fill="url(#howEngineHatch)" />
            <rect className={styles.stroke} x="24" y="8" width="40" height="40" {...T} />
            {/* guías entrando: arriba / derecha / abajo / izquierda, cada una
                rematada en el nodo donde «empieza a medirse» */}
            <line className={styles.stroke} x1="44" y1="0" x2="44" y2="8" {...T} />
            <line className={styles.stroke} x1="88" y1="28" x2="64" y2="28" {...T} />
            <line className={styles.stroke} x1="44" y1="64" x2="44" y2="48" {...T} />
            <line className={styles.stroke} x1="0" y1="28" x2="24" y2="28" {...T} />
            <circle className={styles.node} cx="44" cy="0" r="1.6" {...VE} />
            <circle className={styles.node} cx="88" cy="28" r="1.6" {...VE} />
            <circle className={styles.node} cx="44" cy="64" r="1.6" {...VE} />
            <circle className={styles.node} cx="0" cy="28" r="1.6" {...VE} />
        </svg>
    );
}

/* ─────────────────────────── Fig. 03 — Calibración ─────────────────────────
   Eco literal de la Fig. 04.1 (BenchmarkShowcase, aún por construir): cuatro
   bandas de tolerancia en miniatura — interior tramado (la especificación),
   límites en dos reglas verticales, y un tick SÓLIDO dentro (el dato, dentro
   de tolerancia). El ancho de cada banda varía entre filas a propósito — es
   la especificación real de cada macro/caloría, nunca el dato — y el tick
   nunca toca el límite. */
function CalibrationFigure() {
    const bands = [
        { y: 4, w: 50, tick: 22 },
        { y: 20, w: 66, tick: 40 },
        { y: 36, w: 40, tick: 18 },
        { y: 52, w: 58, tick: 34 },
    ];
    return (
        <svg className={styles.fig} viewBox="0 0 88 64" role="presentation" aria-hidden="true" focusable="false">
            <defs>
                <pattern id="howCalibHatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                    <line className={styles.hatchLine} x1="0" y1="0" x2="0" y2="5" {...VE} />
                </pattern>
            </defs>
            {bands.map((b, i) => (
                <g key={i}>
                    <rect className={styles.hatchFill} x="4" y={b.y} width={b.w} height="8" fill="url(#howCalibHatch)" />
                    <line className={styles.stroke} x1="4" y1={b.y - 2} x2="4" y2={b.y + 10} {...T} />
                    <line className={styles.stroke} x1={4 + b.w} y1={b.y - 2} x2={4 + b.w} y2={b.y + 10} {...T} />
                    <rect className={styles.solidFill} x={4 + b.tick - 1.5} y={b.y - 2} width="3" height="12" />
                </g>
            ))}
        </svg>
    );
}

/* ───────────────────────────── Fig. 04 — Adaptación ────────────────────────
   Polilínea ascendente de 5 puntos (el progreso semana a semana) contra una
   referencia punteada (el plan sin recalcular) y un tramo de guía entre
   ambas. Ese tramo NO lleva flechas ni cifra: en este sistema una cota con
   flechas es una afirmación de medida (§ regla del cota, ver
   `PlateExploded.jsx`), y esta figura es una miniatura ilustrativa, no una
   serie medida — inventarle un número sería la misma trampa que el sistema
   prohíbe en la Fig. 04.1/04.2 reales. Por eso el tramo va en el tono de
   CONSTRUCCIÓN (`--pa-rule-2`, sin trazar), no en tinta plena. */
function AdaptationFigure() {
    const pts = [[6, 52], [24, 42], [42, 34], [60, 24], [78, 14]];
    const poly = pts.map((p) => p.join(',')).join(' ');
    return (
        <svg className={styles.fig} viewBox="0 0 88 64" role="presentation" aria-hidden="true" focusable="false">
            <line className={styles.guide} x1="4" y1="52" x2="84" y2="52" {...VE} />
            <polyline className={styles.stroke} points={poly} {...T} />
            {pts.map((p) => (
                <circle key={p.join(',')} className={styles.node} cx={p[0]} cy={p[1]} r="1.8" {...VE} />
            ))}
            {/* tramo de construcción entre la referencia y el punto más alto */}
            <g className={styles.bracket}>
                <line x1="80" y1="52" x2="88" y2="52" {...VE} />
                <line x1="84" y1="52" x2="84" y2="14" {...VE} />
                <line x1="80" y1="14" x2="88" y2="14" {...VE} />
            </g>
        </svg>
    );
}

const FIGURES = [ProfileFigure, EngineFigure, CalibrationFigure, AdaptationFigure];

const HowItWorks = () => {
    const reduce = useReducedMotion();
    const sheetRef = useRef(null);
    const [drawn, setDrawn] = useState(false);

    /* Disparo único, igual que Fig. 00: con `reduce` el observer ni se monta
       y la hoja nace ya dibujada (defensa (a); la (b) vive en el .module.css). */
    useEffect(() => {
        if (reduce) {
            setDrawn(true);
            return undefined;
        }
        const el = sheetRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') {
            setDrawn(true);
            return undefined;
        }
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                setDrawn(true);
                io.disconnect();
            }
        }, { threshold: 0.35 });
        io.observe(el);
        return () => io.disconnect();
    }, [reduce]);

    return (
        <section className={styles.section} id="how-it-works">
            <div className={styles.container}>
                <div className={styles.sectionHead}>
                    <span className={styles.hLine} aria-hidden="true" />
                    <h2 className={styles.sectionLabel}>02 / CÓMO SE CALCULA</h2>
                    <span className={styles.hLine} aria-hidden="true" />
                </div>

                <p className={styles.subtitle}>
                    Simple por fuera, riguroso por dentro: del dato a tu plato, con método.
                </p>

                <div ref={sheetRef} className={`${styles.sheet}${drawn ? ` ${styles.drawn}` : ''}`}>
                    {/* Eje de proceso horizontal — ≥720px. Puramente decorativo
                        (el orden real vive en `.cells`), por eso aria-hidden. */}
                    <div className={styles.axis} aria-hidden="true">
                        <span className={styles.axisRule} />
                        {STEPS.map((_, i) => (
                            <span key={i} className={styles.stationGroup}
                                style={{ left: `${12.5 + i * 25}%`, '--d': delayOf(i) }}>
                                <span className={styles.stationIndex}>{`0${i + 1}`}</span>
                                <span className={styles.extUp} />
                                <span className={styles.station} />
                                <span className={styles.extDown} />
                            </span>
                        ))}
                    </div>

                    <div className={styles.cells}>
                        {/* Eje de proceso vertical — <720px, spina única para las
                            4 celdas apiladas. */}
                        <span className={styles.axisVRule} aria-hidden="true" />
                        {STEPS.map((s, i) => {
                            const Figure = FIGURES[i];
                            return (
                                <article key={s.title} className={styles.cell} style={{ '--d': delayOf(i) }}>
                                    <span className={styles.axisVMark} aria-hidden="true">
                                        <span className={styles.axisVIndex}>{`0${i + 1}`}</span>
                                        <span className={styles.axisVTick} />
                                        <span className={styles.axisVDiamond} />
                                    </span>
                                    <div className={styles.figureBox}>
                                        <Figure />
                                    </div>
                                    <div className={styles.cellText}>
                                        <h3 className={styles.cellTitle}>{s.title}</h3>
                                        <p className={styles.cellDesc}>{s.desc}</p>
                                        <div className={styles.miniCota}>
                                            <span className={styles.miniCotaLine} aria-hidden="true" />
                                            <span className={styles.miniCotaValue}>{s.tag}</span>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>

                <SeeMoreLink to="/como-funciona">Ver el proceso completo</SeeMoreLink>
            </div>
        </section>
    );
};

export default HowItWorks;
