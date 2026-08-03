import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { VERSUS, es1 } from '../../../data/benchmark';
import styles from './InBandBar.module.css';

/* [P1-PAPER-BENCHMARK · 2026-08-02] Fig. 04.2 — PLANES CON LOS 4 MACROS EN BANDA.
 *
 * UNA SOLA FILA, y por eso no hay comparación falsa posible. Es lo que queda
 * del `VERSUS` de tres filas sobre un eje 0-100 compartido: de las tres, esta
 * es la única que es de verdad un porcentaje de planes. La de proteína se
 * reexpresó como error y se fundió con la Fig. 04.1; la de «cuadran al
 * recalcular» bajó a la tabla de capacidades, porque `100 vs 0` es una
 * capacidad binaria y en un eje de magnitudes fabricaba un «Δ 100 pts» que no
 * significa nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA COTA ES EL PUNTO DE ESTA FIGURA, Y SU RÓTULO ES LO QUE LA HACE HONESTA.
 * `+67,7 pp de planes`, no `Δ 67,7 pts`: `pp` (puntos porcentuales) dice en qué
 * unidad está la diferencia y «de planes» dice de qué. Ese rótulo es la única
 * diferencia entre una MEDICIÓN y una AFIRMACIÓN — y el valor se CALCULA de
 * `VERSUS`, nunca se escribe. Escribirlo abriría un tercer sitio de drift
 * dentro del mismo P-fix que cierra los otros dos.
 * `backend/tests/test_p1_paper_benchmark_ssot.py` falla si aparece escrito.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIN `viewBox`, IGUAL QUE LA FIG. 04.1. Una unidad de usuario es un píxel CSS
 * a cualquier ancho: el rótulo mono mide 12 px reales en móvil, la barra
 * sólida mide 22 px y la tramada 14 (la redundancia por ALTURA no se degrada),
 * y el tile de la trama mide 5 px reales, que es la mitigación del moiré a DPR
 * fraccionario. El precio es que la posición horizontal va en PORCENTAJE y no
 * se puede sumar píxeles dentro del mismo atributo: de ahí los
 * `transform="translate(…)"`.
 *
 * ⚠️ LO QUE NO SE ANIMA: el ANCHO DE LAS BARRAS. Una barra que crece de 0 a
 * 91,7 dibuja todos los valores intermedios por el camino — 40, 60, 84 — en la
 * figura cuyo argumento es que no fabricamos números. Las barras entran por
 * opacidad. Se traza la CONSTRUCCIÓN (regla graduada, verticales, líneas de
 * extensión, línea de cota), nunca el dato.
 */

const AXIS_TICKS = [0, 25, 50, 75, 100];

/* [P2-SECCIONES-03-04-DENSIDAD · 2026-08-02] Geometría recalculada para el
   REGISTRO DE CIFRA. `91,7 %` y `24,0 %` son el argumento entero de la sección
   y se dibujaban a 13px — por debajo del subtítulo (16px) y de las etiquetas de
   la tabla de capacidades (15px). Suben a 1,5rem (24px), que es la fila «cifra
   de fila» del spec §2.5 y que no tenía NI UN representante en toda la sección.

   Las dos cifras siguen compartiendo LÍNEA BASE con el rótulo mono de su
   carril: rótulo a la izquierda, cifra a la derecha, un solo renglón. Con la
   base en 62, el alto de mayúscula de un mono de 24px (≈16,8) arranca en 45,2
   — 4,2px por debajo del final de los ticks (41), así que no los toca.

   ⚠ Si cambias el cuerpo de `.valueOn`/`.valueOff`, RECALCULA estas Y o la
   cifra flota fuera de su carril. */
const UNIT_Y = 12;
const NUM_Y = 30;
const TICK_Y1 = 35;
const TICK_Y2 = 41;

const LANE1_LABEL_Y = 62;    /* era 58 */
const BAR1_Y = 70;           /* era 64 */
const BAR1_H = 22;

const LANE2_LABEL_Y = 116;   /* era 104 */
const BAR2_Y = 124;          /* era 110 */
const BAR2_H = 14;

/* Se conservan los 20px entre el pie de la barra tramada y la cota — que es
   donde cabe el rótulo `+67,7 pp de planes` desde P2-COTA-LABEL-ABOVE — y los
   16px de COTA_Y a FIG_H. */
const COTA_Y = 158;          /* era 144 */
const FIG_H = 174;           /* era 160 */

const pct = (v) => `${v.toFixed(4)}%`;

const InBandBar = () => {
    const reduce = useReducedMotion();
    const ref = useRef(null);
    const [drawn, setDrawn] = useState(false);

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

    /* Se busca por CLAVE, no por la etiqueta visible: renombrar «Los 4 macros
       en banda» no puede dejar esta figura sin dato en silencio. */
    const inBand = VERSUS.find((v) => v.key === 'inBand');
    if (!inBand) return null;

    const delta = inBand.mealfit - inBand.llm;
    const midPct = (inBand.mealfit + inBand.llm) / 2;

    return (
        <figure className={styles.figure}>
            <div
                ref={ref}
                className={`${styles.plot}${drawn ? ` ${styles.drawn}` : ''}`}
                role="img"
                aria-label={`Planes con los cuatro macronutrientes dentro de la banda objetivo: `
                    + `con motor ${es1(inBand.mealfit)} por ciento; sin motor ${es1(inBand.llm)} por ciento; `
                    + `diferencia de ${es1(delta)} puntos porcentuales de planes.`}
            >
                <svg className={styles.svg} width="100%" height={FIG_H} focusable="false">
                    <defs>
                        {/* `userSpaceOnUse` 5×5 SIN escalar — ver la nota de la
                            Fig. 04.1: el default `objectBoundingBox` haría el
                            tile anisótropo (la trama dejaría de estar a 45°
                            reales) y una trama escalable bate en moiré a DPR
                            1,5×. */}
                        <pattern id="paInBandHatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                            <line className={styles.hatchLine} x1="0" y1="0" x2="0" y2="5" />
                        </pattern>
                        {/* Dos markers y no uno con `orient="auto-start-reverse"`:
                            ese valor tardó en llegar a Safari y una cota con una
                            sola punta se lee como una flecha «hacia», no como
                            una medida ENTRE dos extremos. */}
                        <marker id="paInBandArrowEnd" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
                            <path className={styles.arrow} d="M0,0 L9,3.5 L0,7 Z" />
                        </marker>
                        <marker id="paInBandArrowStart" markerWidth="9" markerHeight="7" refX="0" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
                            <path className={styles.arrow} d="M9,0 L0,3.5 L9,7 Z" />
                        </marker>
                    </defs>

                    {/* ── regla graduada + unidad ─────────────────────────── */}
                    <text className={styles.unit} x="100%" y={UNIT_Y} textAnchor="end">% DE PLANES</text>
                    {AXIS_TICKS.map((v) => (
                        <text key={`n${v}`} className={styles.axisLabel} x={pct(v)} y={NUM_Y} textAnchor="middle">{v}</text>
                    ))}
                    {AXIS_TICKS.map((v) => (
                        <line key={`t${v}`} className={styles.tick} x1={pct(v)} y1={TICK_Y1} x2={pct(v)} y2={TICK_Y2} pathLength={1} />
                    ))}

                    {/* Verticales que atraviesan los carriles: leer un valor sin
                        subir la vista a la regla. Van ANTES que las barras para
                        que estas las tapen — una vertical cruzando una barra
                        sólida la partiría en dos. */}
                    {AXIS_TICKS.map((v) => (
                        <line key={`g${v}`} className={styles.gridline} x1={pct(v)} y1={TICK_Y2} x2={pct(v)} y2={BAR2_Y + BAR2_H} pathLength={1} />
                    ))}

                    {/* ── carril 1: con motor = barra SÓLIDA de 22 px ─────── */}
                    <text className={styles.laneLabel} x="0" y={LANE1_LABEL_Y}>CON MOTOR</text>
                    <text className={styles.valueOn} x="100%" y={LANE1_LABEL_Y} textAnchor="end">{`${es1(inBand.mealfit)} %`}</text>
                    <rect className={styles.barOn} x="0" y={BAR1_Y} width={pct(inBand.mealfit)} height={BAR1_H} />

                    {/* ── carril 2: sin motor = barra de CONTORNO tramada, 14 px ── */}
                    <text className={styles.laneLabel} x="0" y={LANE2_LABEL_Y}>SIN MOTOR</text>
                    <text className={styles.valueOff} x="100%" y={LANE2_LABEL_Y} textAnchor="end">{`${es1(inBand.llm)} %`}</text>
                    <rect className={styles.barOffFill} x="0" y={BAR2_Y} width={pct(inBand.llm)} height={BAR2_H} fill="url(#paInBandHatch)" />
                    <rect className={styles.barOff} x="0" y={BAR2_Y} width={pct(inBand.llm)} height={BAR2_H} />

                    {/* ── la cota ─────────────────────────────────────────── */}
                    <line className={styles.ext} x1={pct(inBand.mealfit)} y1={BAR1_Y + BAR1_H} x2={pct(inBand.mealfit)} y2={COTA_Y} pathLength={1} />
                    <line className={styles.ext} x1={pct(inBand.llm)} y1={BAR2_Y + BAR2_H} x2={pct(inBand.llm)} y2={COTA_Y} pathLength={1} />
                    <line
                        className={styles.cota}
                        x1={pct(inBand.llm)}
                        y1={COTA_Y}
                        x2={pct(inBand.mealfit)}
                        y2={COTA_Y}
                        markerStart="url(#paInBandArrowStart)"
                        markerEnd="url(#paInBandArrowEnd)"
                        pathLength={1}
                    />
                    {/* [P2-COTA-LABEL-ABOVE · 2026-08-02] EL RÓTULO VA ENCIMA DE LA
                        LÍNEA, no sentado sobre ella.

                        Antes se apoyaba en la cota y abría su hueco con un HALO DE
                        PAPEL (`paint-order: stroke`, `stroke-width: 3`). Un halo
                        sigue el CONTORNO DE LOS GLIFOS, así que tapaba las letras
                        pero no los espacios entre palabras: medido en producción, la
                        línea asomaba 4,08 px en cada uno de los tres espacios del
                        rótulo (espacio mono de 7,08 px menos los 3 px de halo). Se
                        leía «+67,7-pp-de-planes», con tres guiones que nadie
                        escribió — justo en la figura cuyo argumento es que los
                        números se miden y no se inventan.

                        Subirlo lo resuelve sin maquinaria: no hay hueco que abrir,
                        así que no hay hueco que se pueda quedar a medias. La cota
                        queda continua de punta a punta, que es como se dibuja una
                        cota. Y desaparecen de golpe las dos objeciones que el
                        comentario anterior documentaba: ya no hace falta partir la
                        línea en dos tramos (imposible, sus extremos van en
                        porcentaje y el hueco en píxeles) ni meter un rectángulo de
                        anchura fija que a 320 px se comía tramo útil.

                        Cabe: entre el pie de la barra tramada (124) y la cota (144)
                        hay 20 px, y el rótulo de 12 px con la base en 139 ocupa
                        ~130-142. Y va centrado en el 57,9 % del ancho, entre las dos
                        líneas de extensión (24 % y 91,7 %) — no las toca. */}
                    <text className={styles.cotaValue} x={pct(midPct)} y={COTA_Y - 5} textAnchor="middle">
                        {`+${es1(delta)} pp de planes`}
                    </text>
                </svg>
            </div>

            <figcaption className={styles.caption}>
                <span className={styles.captionTag}>Fig. 04.2</span>
                {` — Porcentaje de planes cuyos 4 macronutrientes caen dentro de la banda. Mismo pipeline,
                con el motor determinista encendido y apagado.`}
            </figcaption>
        </figure>
    );
};

export default InBandBar;
