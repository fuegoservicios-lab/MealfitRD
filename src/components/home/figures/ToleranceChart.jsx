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

/* Zona de anotación de la PRIMERA fila. `OBJETIVO` y los dos rótulos in situ
   viven DENTRO del SVG de la fila de proteína, no en franjas propias por
   encima de la figura.

   Por qué, y es un fallo medido, no una preferencia: con franjas separadas, al
   reflowar bajo 720 px cada `.row` se parte en dos líneas
   (`nombre | cifras` arriba, carril debajo). Eso metía la línea
   «Proteína  ±1,5 %  ±16,0 %» ENTRE la guía de `CON MOTOR` y el marcador al
   que apunta: la guía dejaba de señalar nada. Un rótulo in situ que se
   despega de su marca es una leyenda, que es justo el artefacto que esta
   figura existe para no tener. */
const ANNOT = 36;
const OBJ_Y = 11;            // línea base de `OBJETIVO`
const LEG_Y = 27;            // línea base de `CON MOTOR` / `SIN MOTOR`
const LEAD_Y1 = 31;          // guía, del rótulo hacia su marcador
/* [P2-SECCIONES-03-04-DENSIDAD · 2026-08-02] LAS GUÍAS NO LLEGABAN.
   `LEAD_Y2` valía 41 para las dos, y los marcadores de la fila guía empiezan
   en `ANNOT + TICK_CY − alto/2`: el sólido (22px) en 36+30−11 = 55, y el de
   contorno (14px) en 36+30−7 = 59. O sea, la guía moría 14px y 18px POR
   ENCIMA de lo que señalaba, colgando en el aire.

   El elemento cuyo trabajo entero es conectar era el único que no conectaba —
   y un rótulo in situ despegado de su marca vuelve a ser una LEYENDA, que es
   exactamente el artefacto que la cabecera de este fichero dice haber
   eliminado. Dos constantes porque los dos marcadores tienen alturas
   distintas; 2px de aire antes de tocar en ambos casos. */
const LEAD_Y2_ON = 53;       // marcador sólido: empieza en 55
const LEAD_Y2_OFF = 57;      // marcador de contorno: empieza en 59
const RULER_H = 44;

const AXIS_MIN = -20;
const AXIS_MAX = 20;
const TICKS = [-20, -10, 0, 10, 20];
/* Marcas menores: parten cada intervalo mayor por la mitad. No llevan rótulo —
   una marca menor rotulada es una marca mayor. */
const TICKS_MED = [-15, -5, 5, 15];

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

    return (
        <figure className={styles.figure}>
            <div ref={ref} className={`${styles.grid}${drawn ? ` ${styles.drawn}` : ''}`}>

                {/* ── las cuatro filas ─────────────────────────────────────── */}
                {MACROS.map((m, i) => {
                    const [lo, hi] = bandOf(m.key);
                    const off = OFF_ENGINE[m.key];
                    const hatchId = `paTolHatch-${m.key}`;
                    /* La primera fila es la única que rotula. Lleva encima una
                       zona de anotación con `OBJETIVO` y los dos rótulos in
                       situ; las otras tres ya no los necesitan. */
                    const isLead = i === 0;
                    const top = isLead ? ANNOT : 0;
                    const rowH = top + ROW_H;
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
                            className={`${styles.row} ${styles.macroRow}${isLead ? ` ${styles.leadRow}` : ''}`}
                            style={{ '--d': `${i * 70}ms` }}
                            role="img"
                            aria-label={aria}
                        >
                            <span className={styles.name}>{m.label}</span>
                            <div className={styles.plot}>
                                <svg className={styles.svg} width="100%" height={rowH} focusable="false">
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
                                    <rect className={styles.hatchFill} x={xPct(lo)} y={top + BAND_Y}
                                        width={`${(((hi - lo) / (AXIS_MAX - AXIS_MIN)) * 100).toFixed(4)}%`}
                                        height={BAND_H} fill={`url(#${hatchId})`} />
                                    <line className={styles.limit} x1={xPct(lo)} y1={top + LIMIT_Y1} x2={xPct(lo)} y2={top + LIMIT_Y2} pathLength={1} />
                                    <line className={styles.limit} x1={xPct(hi)} y1={top + LIMIT_Y1} x2={xPct(hi)} y2={top + LIMIT_Y2} pathLength={1} />

                                    {/* Guías de los rótulos in situ, solo en la primera
                                        fila. Las dos anclan por el final y cuelgan de UN
                                        marcador de su pareja —no del centro— porque
                                        centrarlas las hacía chocar en el carril estrecho
                                        del móvil.

                                        [fix · 2026-08-02] Este comentario decía que las
                                        dos cuelgan del marcador IZQUIERDO. Es falso desde
                                        siempre: `CON MOTOR` cuelga de `xPct(-m.mape)`, el
                                        izquierdo de su par, pero `SIN MOTOR` cuelga de
                                        `xPct(off)` —positivo— que es el DERECHO. Se
                                        describe lo que hace el código; si alguien
                                        «arreglara» la asimetría creyéndola un desliz,
                                        devolvería la colisión que la motivó. */}
                                    {isLead && (
                                        <>
                                            <line className={styles.leader} x1={xPct(-m.mape)} y1={LEAD_Y1} x2={xPct(-m.mape)} y2={LEAD_Y2_ON} pathLength={1} />
                                            {off !== undefined && (
                                                <line className={styles.leader} x1={xPct(off)} y1={LEAD_Y1} x2={xPct(off)} y2={LEAD_Y2_OFF} pathLength={1} />
                                            )}
                                        </>
                                    )}

                                    {/* El objetivo, a lo alto de toda la figura. Va ANTES
                                        que los textos: el halo de papel de `.axisLabel` /
                                        `.bandLabel` (`paint-order: stroke`) le abre el
                                        hueco justo donde un rótulo lo cruzaría. Sin eso,
                                        la regla del objetivo tachaba literalmente el
                                        `BANDA −5 / +5` de la fila de calorías, cuya banda
                                        es la única que empieza a la izquierda del cero. */}
                                    <line className={styles.zero} x1="50%" y1="-1" x2="50%" y2={rowH + 1} pathLength={1} />

                                    {isLead && (
                                        <>
                                            <text className={styles.axisLabel} x="50%" y={OBJ_Y} textAnchor="middle">OBJETIVO</text>
                                            <text className={styles.axisLabel} x={xPct(-m.mape)} y={LEG_Y} textAnchor="end">CON MOTOR</text>
                                            {off !== undefined && (
                                                <text className={styles.axisLabel} x={xPct(off)} y={LEG_Y} textAnchor="end">SIN MOTOR</text>
                                            )}
                                        </>
                                    )}

                                    <text className={styles.bandLabel} x={xPct(lo)} y={top + BAND_LABEL_Y} transform="translate(3,0)">
                                        {`BANDA −${Math.abs(lo)} / +${hi}`}
                                    </text>

                                    {/* marcadores = DATO. Sólido y alto = con motor;
                                        contorno y bajo = sin motor. Tres canales
                                        redundantes: relleno, altura y posición. */}
                                    {off !== undefined && [-off, off].map((v) => (
                                        <rect key={`off${v}`} className={styles.markOff} x={xPct(v)}
                                            y={top + TICK_CY - OUTLINE_H / 2} width="3" height={OUTLINE_H}
                                            transform="translate(-1.5,0)" />
                                    ))}
                                    {[-m.mape, m.mape].map((v) => (
                                        <line key={`on${v}`} className={styles.markOn} x1={xPct(v)}
                                            y1={top + TICK_CY - SOLID_H / 2} x2={xPct(v)} y2={top + TICK_CY + SOLID_H / 2} />
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

                {/* ── regla graduada + unidad ──────────────────────────────────
                    La unidad va DENTRO del SVG y en su propia línea, no en la
                    columna de cifras. Medido: con `+20` centrado en el 100 % del
                    carril, su mitad derecha invade los 12 px reservados y
                    aterrizaba encima de `% DE DESVIACIÓN`, que empezaba a
                    0,75 rem de la siguiente columna. Los 12 px reservados existen
                    para que el rótulo no muerda el borde de la CELDA; no
                    reservan sitio contra el texto de la columna de al lado. */}
                <div className={`${styles.row} ${styles.rulerRow}`} aria-hidden="true">
                    <span className={styles.name} />
                    <div className={styles.plot}>
                        <svg className={styles.svg} width="100%" height={RULER_H} focusable="false">
                            {/* [P2-SECCIONES-03-04-DENSIDAD · 2026-08-02] MARCAS
                                INTERMEDIAS. La regla eran cinco rayitas sueltas y por
                                eso se leía como un esquema, no como un instrumento;
                                cuatro trazos de 4px la gradúan sin tocar semántica.

                                Van en `--pa-rule-3` y a 4px, DEBAJO de las mayores
                                (`--pa-rule-2`, 6px), no al mismo peso: la distinción
                                construcción / especificación que documenta el módulo
                                depende de que la tinta plena siga reservada a `.zero` y
                                `.limit`.

                                Y son CUATRO, no las 32 que darían resolución al 1%: una
                                regla promete la resolución que dibuja, y esta figura no
                                se lee al 1%. */}
                            {TICKS_MED.map((v) => (
                                <line key={`m${v}`} className={styles.tickMed}
                                    x1={xPct(v)} y1="0" x2={xPct(v)} y2="4" pathLength={1} />
                            ))}
                            {TICKS.map((v) => (
                                <line key={v} className={v === 0 ? styles.zero : styles.tick}
                                    x1={xPct(v)} y1="0" x2={xPct(v)} y2="6" pathLength={1} />
                            ))}
                            {TICKS.map((v) => (
                                <text key={`t${v}`} className={styles.axisLabel} x={xPct(v)} y="19" textAnchor="middle">
                                    {signed(v)}
                                </text>
                            ))}
                            <text className={styles.axisLabel} x="100%" y="37" textAnchor="end">% DE DESVIACIÓN</text>
                        </svg>
                    </div>
                    <span className={styles.figures} />
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
