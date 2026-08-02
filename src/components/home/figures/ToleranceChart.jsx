import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { MACROS, VERSUS, BANDS, SERIES, es1 } from '../../../data/benchmark';
import styles from './ToleranceChart.module.css';

/* [P1-PAPER-BENCHMARK · 2026-08-02] Fig. 04.1 — TOLERANCIA POR MACRO.
 *
 * QUÉ DIBUJA: cuatro filas, una por macronutriente, sobre un eje horizontal
 * común de −20 % a +20 % de desviación respecto al objetivo. En cada fila: la
 * banda de tolerancia DECLARADA (interior tramado a 45°, límites en dos reglas
 * de 1 px) y el error MEDIDO como marcadores.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ AQUÍ EL EJE COMPARTIDO SÍ ES LEGÍTIMO. Las tres filas del `VERSUS`
 * anterior (98,5 · 91,7 · 100-vs-0) vivían sobre un mismo eje 0-100 siendo
 * magnitudes incommensurables: `100 − MAPE`, `% de planes` y una capacidad
 * binaria. Un eje compartido es una AFIRMACIÓN DE COMPARABILIDAD, y esa
 * afirmación era falsa. Aquí las cuatro filas comparten unidad de verdad —
 * todas son «% de desviación respecto a tu objetivo» — así que el eje común es
 * correcto y la comparación entre filas significa algo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRES DECISIONES QUE UN FUTURO EDITOR VA A CUESTIONAR
 *
 * 1) DOS TICKS POR SERIE, NO UNO. `±1,5 %` es un error absoluto medio: una
 *    MAGNITUD simétrica, no una desviación con signo. Dibujar un solo tick
 *    obliga a ponerlo a un lado del objetivo, y eso inventa un sesgo que nunca
 *    medimos. Se dibujan los dos límites del intervalo declarado (−1,5 y
 *    +1,5), que es exactamente lo que la cifra dice. El resultado se lee de un
 *    vistazo: con motor el error abraza el objetivo; sin motor se va al borde.
 *
 * 2) SOLO LA FILA DE PROTEÍNA LLEVA EL SEGUNDO MARCADOR. El A/B con el motor
 *    apagado se midió sobre proteína — es el único macro del que existe dato
 *    «sin motor» (`VERSUS.protein.llm = 84` → ±16,0 % de error). Inventarle un
 *    valor a calorías, grasas y carbohidratos para que las cuatro filas
 *    quedaran simétricas sería fabricar tres números en la figura cuyo
 *    argumento es que no fabricamos números. La regla del sistema es literal:
 *    si no lo medimos, no lo acotamos. El pie de figura lo dice en voz alta.
 *
 * 3) EL ANCHO DE LA BANDA NO CODIFICA EL DATO — JAMÁS. La banda de calorías es
 *    más estrecha (−5/+5) que la de los macros (−10/+12) porque la
 *    ESPECIFICACIÓN es más estrecha, no porque su error sea menor. Por eso
 *    cada banda lleva su rótulo con los límites pegado: sin él, un lector
 *    razonable concluye que la banda estrecha es «mejor». Regla dura del spec
 *    §5.2: la banda se rotula con sus límites o no se dibuja. **La banda es la
 *    especificación; el tick es el dato. Nunca al revés.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE SVG NO LLEVA `viewBox` (y por tanto tampoco `vector-effect`)
 *
 * A diferencia de `PlateExploded.jsx` y de las 4 figuras de `HowItWorks.jsx`,
 * estos SVG NO declaran `viewBox`: se les da `width="100%"` y una `height` en
 * píxeles. Sin `viewBox` no hay transformación de escala, así que **una unidad
 * de usuario ES un píxel CSS** a cualquier ancho de pantalla. Consecuencias,
 * todas buscadas:
 *   · `font-size: 12` es 12 px reales en móvil y en escritorio — el piso de
 *     12 px del sistema para «todo lo que decodifica una figura» se cumple por
 *     construcción, no por un cálculo de escala como el de Fig. 00.
 *   · el tick sólido mide 3 × 22 px exactos y el de contorno 3 × 14: la
 *     redundancia por ALTURA (22 vs 14) no se degrada al encoger la pantalla.
 *   · la trama de 5 px es de 5 px reales, que es la mitigación del moiré a DPR
 *     fraccionario (1,5×) — el `patternUnits="userSpaceOnUse"` del spec.
 *   · `vector-effect="non-scaling-stroke"` sobra aquí: no hay escala que
 *     compensar. Añadirlo por costumbre sería ruido. NO copiarlo de las otras
 *     figuras sin entender esta diferencia.
 * Lo que se paga a cambio: la posición horizontal tiene que expresarse en
 * PORCENTAJE (`x="53.75%"`), y los porcentajes no se pueden mezclar con
 * píxeles dentro de un mismo atributo. De ahí los `transform="translate(…)"`
 * para centrar un `<rect>` sobre su valor.
 *
 * Los 12 px reservados a cada extremo del eje NO están en el SVG: son el
 * `padding` de `.plot` en el CSS. A 320 px de viewport el eje mide 288 px y un
 * rótulo `+20` centrado en el 100 % se comería el borde de la celda.
 */

/* Geometría de una fila, en píxeles (= unidades de usuario, ver cabecera). */
const ROW_H = 44;
const TICK_CY = 30;          // centro vertical de los marcadores
const SOLID_H = 22;          // «con motor»
const OUTLINE_H = 14;        // «sin motor»
const BAND_Y = 17;
const BAND_H = 26;
const LIMIT_Y1 = 15;
const LIMIT_Y2 = 43;
const BAND_LABEL_Y = 13;     // línea base del rótulo `BANDA −10 / +12`

const TOP_H = 20;            // franja de `OBJETIVO`
const LEGEND_H = 26;         // franja de `CON MOTOR` / `SIN MOTOR`
const RULER_H = 26;

const AXIS_MIN = -20;
const AXIS_MAX = 20;
const TICKS = [-20, -10, 0, 10, 20];

/* Valor → posición en el eje, en porcentaje del ancho del carril. */
const xPct = (v) => `${(((v - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100).toFixed(4)}%`;

/* Signo explícito en los rótulos del eje: `−20 −10 0 +10 +20`. El menos es
   U+2212 (menos matemático), no un guion: a 12 px un guion se lee como un
   trazo de construcción. */
const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');

const bandOf = (key) => (key === 'kcal' ? BANDS.kcal : BANDS.macros);

/* El único dato «sin motor» que existe: se JUNTA por `macroKey`, no por la
   etiqueta visible (ver la nota de `VERSUS` en el SSOT). `100 − llm` convierte
   el «84 % de precisión» en el ±16,0 % de error que es realmente. */
const OFF_ENGINE = VERSUS.reduce((acc, v) => {
    if (v.macroKey) acc[v.macroKey] = Number((100 - v.llm).toFixed(1));
    return acc;
}, {});

const ToleranceChart = () => {
    const reduce = useReducedMotion();
    const ref = useRef(null);
    const [drawn, setDrawn] = useState(false);

    /* Disparo único, mismo patrón que `PlateExploded.jsx` y `HowItWorks.jsx`:
       con `reduce` el observer NI SE MONTA y la figura nace dibujada (defensa
       (a); la (b) es el bloque @media del .module.css). */
    useEffect(() => {
        if (reduce) {
            setDrawn(true);
            return undefined;
        }
        const el = ref.current;
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

    const protein = MACROS[0];
    const proteinOff = OFF_ENGINE[protein.key];

    return (
        <figure className={styles.figure}>
            <div ref={ref} className={`${styles.grid}${drawn ? ` ${styles.drawn}` : ''}`}>

                {/* ── franja superior: el objetivo ─────────────────────────── */}
                <div className={styles.row} aria-hidden="true">
                    <span className={styles.name} />
                    <div className={styles.plot}>
                        <svg className={styles.svg} width="100%" height={TOP_H} focusable="false">
                            <text className={styles.axisLabel} x="50%" y="12" textAnchor="middle">OBJETIVO</text>
                            <line className={styles.zero} x1="50%" y1="15" x2="50%" y2={TOP_H + 1} pathLength={1} />
                        </svg>
                    </div>
                    <span className={styles.figures} />
                </div>

                {/* ── franja de leyenda IN SITU ────────────────────────────────
                    Cero caja de leyenda: los dos marcadores se rotulan pegados
                    al sitio donde caen, y solo en la primera fila. Una leyenda
                    que hay que ir a consultar es exactamente el artefacto que
                    obligaba a memorizar un color — el que este rediseño mata.
                    Los DOS anclan por el final (`text-anchor: end`) y cada uno
                    cuelga del marcador IZQUIERDO de su pareja: centrarlos los
                    hacía chocar en el carril estrecho del móvil (medido: a
                    264 px de carril, `CON MOTOR` centrado en el tick derecho
                    solapaba `SIN MOTOR` por 1 px), y anclar `SIN MOTOR` al
                    90 % del carril centrado lo sacaba del encuadre. */}
                <div className={styles.row} aria-hidden="true">
                    <span className={styles.name} />
                    <div className={styles.plot}>
                        <svg className={styles.svg} width="100%" height={LEGEND_H} focusable="false">
                            <text className={styles.axisLabel} x={xPct(-protein.mape)} y="11" textAnchor="end">CON MOTOR</text>
                            <line className={styles.leader} x1={xPct(-protein.mape)} y1="15" x2={xPct(-protein.mape)} y2={LEGEND_H} pathLength={1} />
                            <text className={styles.axisLabel} x={xPct(proteinOff)} y="11" textAnchor="end">SIN MOTOR</text>
                            <line className={styles.leader} x1={xPct(proteinOff)} y1="15" x2={xPct(proteinOff)} y2={LEGEND_H} pathLength={1} />
                            <line className={styles.zero} x1="50%" y1="-1" x2="50%" y2={LEGEND_H + 1} pathLength={1} />
                        </svg>
                    </div>
                    <span className={styles.figures} />
                </div>

                {/* ── las cuatro filas ─────────────────────────────────────── */}
                {MACROS.map((m, i) => {
                    const [lo, hi] = bandOf(m.key);
                    const off = OFF_ENGINE[m.key];
                    const hatchId = `paTolHatch-${m.key}`;
                    /* La lectura de un vistazo y la del lector de pantalla
                       tienen que coincidir: `role="img"` sobre la fila entera
                       hace que su contenido sea presentacional, así que el
                       lector oye UNA frase por fila en vez de tres fragmentos
                       (nombre, dibujo mudo, cifras) sin relación. */
                    const aria = `${m.label}: desviación con motor ±${es1(m.mape)} por ciento`
                        + (off ? `; sin motor ±${es1(off)} por ciento` : '; sin dato del motor apagado')
                        + `; banda objetivo de menos ${Math.abs(lo)} a más ${hi} por ciento.`;

                    return (
                        <div
                            key={m.key}
                            className={`${styles.row} ${styles.macroRow}`}
                            style={{ '--d': `${i * 70}ms` }}
                            role="img"
                            aria-label={aria}
                        >
                            <span className={styles.name}>{m.label}</span>
                            <div className={styles.plot}>
                                <svg className={styles.svg} width="100%" height={ROW_H} focusable="false">
                                    <defs>
                                        {/* `userSpaceOnUse` + 5×5 SIN escalar: el default
                                            (`objectBoundingBox`) haría el tile anisótropo
                                            —la trama dejaría de estar a 45° reales y cada
                                            banda la dibujaría con otra separación— y una
                                            trama escalable bate en moiré a DPR 1,5×. */}
                                        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                                            <line className={styles.hatchLine} x1="0" y1="0" x2="0" y2="5" />
                                        </pattern>
                                    </defs>

                                    {/* banda = ESPECIFICACIÓN */}
                                    <rect className={styles.hatchFill} x={xPct(lo)} y={BAND_Y}
                                        width={`${(((hi - lo) / (AXIS_MAX - AXIS_MIN)) * 100).toFixed(4)}%`}
                                        height={BAND_H} fill={`url(#${hatchId})`} />
                                    <line className={styles.limit} x1={xPct(lo)} y1={LIMIT_Y1} x2={xPct(lo)} y2={LIMIT_Y2} pathLength={1} />
                                    <line className={styles.limit} x1={xPct(hi)} y1={LIMIT_Y1} x2={xPct(hi)} y2={LIMIT_Y2} pathLength={1} />
                                    <text className={styles.bandLabel} x={xPct(lo)} y={BAND_LABEL_Y} transform="translate(3,0)">
                                        {`BANDA −${Math.abs(lo)} / +${hi}`}
                                    </text>

                                    {/* el objetivo, a lo alto de toda la figura */}
                                    <line className={styles.zero} x1="50%" y1="-1" x2="50%" y2={ROW_H + 1} pathLength={1} />

                                    {/* marcadores = DATO. Sólido y alto = con motor;
                                        contorno y bajo = sin motor. Tres canales
                                        redundantes: relleno, altura y posición. */}
                                    {off !== undefined && [-off, off].map((v) => (
                                        <rect key={`off${v}`} className={styles.markOff} x={xPct(v)}
                                            y={TICK_CY - OUTLINE_H / 2} width="3" height={OUTLINE_H}
                                            transform="translate(-1.5,0)" />
                                    ))}
                                    {[-m.mape, m.mape].map((v) => (
                                        <line key={`on${v}`} className={styles.markOn} x1={xPct(v)}
                                            y1={TICK_CY - SOLID_H / 2} x2={xPct(v)} y2={TICK_CY + SOLID_H / 2} />
                                    ))}
                                </svg>
                            </div>
                            <span className={styles.figures}>
                                <span className={styles.figOn}>{`±${es1(m.mape)} %`}</span>
                                {off !== undefined && <span className={styles.figOff}>{`±${es1(off)} %`}</span>}
                            </span>
                        </div>
                    );
                })}

                {/* ── regla graduada + unidad ──────────────────────────────── */}
                <div className={`${styles.row} ${styles.rulerRow}`} aria-hidden="true">
                    <span className={styles.name} />
                    <div className={styles.plot}>
                        <svg className={styles.svg} width="100%" height={RULER_H} focusable="false">
                            {TICKS.map((v) => (
                                <line key={v} className={v === 0 ? styles.zero : styles.tick}
                                    x1={xPct(v)} y1="0" x2={xPct(v)} y2="6" pathLength={1} />
                            ))}
                            {TICKS.map((v) => (
                                <text key={`t${v}`} className={styles.axisLabel} x={xPct(v)} y="19" textAnchor="middle">
                                    {signed(v)}
                                </text>
                            ))}
                        </svg>
                    </div>
                    <span className={`${styles.figures} ${styles.unit}`}>% DE DESVIACIÓN</span>
                </div>
            </div>

            <figcaption className={styles.caption}>
                <span className={styles.captionTag}>Fig. 04.1</span>
                {` — Desviación medida frente al objetivo, por macronutriente. La banda tramada es la
                tolerancia declarada de cada uno, y su ancho es la especificación, nunca el dato. Serie de
                N=${SERIES.n} planes dominicanos, ${SERIES.monthLong}. El A/B con el motor apagado se midió
                sobre proteína, el macro más difícil de cuadrar: por eso solo esa fila lleva el segundo marcador.`}
            </figcaption>
        </figure>
    );
};

export default ToleranceChart;
