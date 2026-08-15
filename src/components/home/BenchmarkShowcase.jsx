import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useReducedMotion } from 'framer-motion';
import { APP_VERSION } from '../../config/appVersion';
import { SERIES, BANDS, CAPS } from '../../data/benchmark';
import ToleranceChart from './figures/ToleranceChart';
import InBandBar from './figures/InBandBar';
import SeeMoreLink from './SeeMoreLink';
import styles from './BenchmarkShowcase.module.css';

/* ============================================================================
   [P1-PAPER-BENCHMARK · 2026-08-02] BenchmarkShowcase → «04 / LA MEDICIÓN».

   Era la última sección del landing con la CONSOLA OSCURA de junio
   (`P3-BENCHMARK-RADAR`) en mitad de una home ya en blanco y negro estricto.
   Estuvo bloqueada semanas porque una cifra se contradecía entre ficheros; el
   dueño la resolvió el 2026-08-02 y aquí se cierra entera.

   ─────────────────────────────────────────────────────────────────────────────
   LA CORRECCIÓN QUE MÁS IMPORTA NO ES DE COLOR, ES ESTRUCTURAL.

   Las tres filas del `VERSUS` se dibujaban sobre UN MISMO eje 0-100. Pero
   `98,5` es `100 − MAPE` de proteína, `91,7` es un porcentaje de PLANES, y
   `100 vs 0` es una CAPACIDAD BINARIA. Un eje compartido es una afirmación de
   comparabilidad, y esa afirmación era falsa: hacía parecer que la tercera
   mejora era 7× la primera y fabricaba un «Δ 100 pts» que no significa nada.
   Eso es PEOR que el teal que sustituye — el teal al menos no fingía ser una
   especificación.

   Resultado: la fila binaria bajó a la tabla de capacidades (`■ SÍ / □ NO`),
   la de proteína se reexpresó como ERROR y se fundió con la figura de macros
   (±1,5 % contra ±16,0 %, más honesto y más fuerte), y queda UNA sola
   comparación de barras, unívoca.

   ─────────────────────────────────────────────────────────────────────────────
   LO QUE MURIÓ, Y LO QUE ESO ARREGLA

   · `PrecisionRadar` entero y su `<radialGradient>` teal con
     `<animateTransform repeatCount="indefinite">` de 4,5 s. **Ese barrido era
     SMIL, y SMIL ignora `prefers-reduced-motion` por completo**: giraba
     eternamente incluso para quien había pedido que nada se moviera. Borrarlo
     cierra un fallo de accesibilidad que estaba VIVO en producción — no es
     limpieza estética.
   · El tilt 3D por `onMouseMove`/`onMouseLeave` escribiendo transforms inline,
     `.scanlines` con su barrido en bucle, el marco de consola, el badge
     `MEDICIÓN EN VIVO` con punto pulsante (afirmaba algo falso: son 8 planes
     de junio, no una medición en vivo) y el badge `3.8× más precisos`.
   · **La caja de leyenda con puntos de color** — el artefacto exacto que
     obligaba a memorizar un color para leer el gráfico. En su lugar, cada
     marcador se rotula PEGADO al sitio donde cae, y solo una vez.
   · Los 8 iconos lucide y el `CountUp`. El contador no se retira por
     minimalismo: una cifra que sube de 0 a 91,7 dibuja todos los valores
     intermedios por el camino, que es la misma clase de mentira que animar la
     posición de un marcador. En la sección cuyo argumento es la honestidad de
     la medición, no cabe.

   ─────────────────────────────────────────────────────────────────────────────
   CIFRAS: CERO EN ESTE ARCHIVO. Todas viven en `src/data/benchmark.js` (SSOT).
   Estaban escritas a mano aquí, en `PrecisionPage.jsx` y en `Engine.jsx`, y ya
   habían drifteado. `backend/tests/test_p1_paper_benchmark_ssot.py` falla si
   alguien vuelve a declarar una aquí.

   TRES `IntersectionObserver`, a propósito: uno por figura (cada una se traza
   cuando SE VE, no cuando se ve la sección — están a ~400 px de distancia) y
   uno aquí para el `settle` de los bloques de texto. Los tres con
   `{once: true}` y `disconnect()`.
   ========================================================================= */

const STATE_WORD = { yes: 'SÍ', partial: 'PARCIAL', no: 'NO' };

/* Tres estados por FORMA pura — ■ sólido / ▨ tramado / □ contorno — MÁS la
   palabra en mono. La redundancia no es cinturón y tirantes: a 360 px de ancho
   los tres glifos solos se caen (un cuadrado de 12 px tramado y uno vacío se
   distinguen mal a esa densidad), y este es el sitio exacto donde eso pasa. */
const StateCell = ({ state, patternId }) => (
    <span className={styles.state}>
        <svg className={styles.glyph} width="12" height="12" aria-hidden="true" focusable="false">
            {state === 'partial' && (
                <>
                    <defs>
                        <pattern id={patternId} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                            <line className={styles.glyphHatchLine} x1="0" y1="0" x2="0" y2="5" />
                        </pattern>
                    </defs>
                    <rect className={styles.glyphHatchFill} x="0.5" y="0.5" width="11" height="11" fill={`url(#${patternId})`} />
                </>
            )}
            {state === 'yes'
                ? <rect className={styles.glyphSolid} x="0" y="0" width="12" height="12" />
                : <rect className={styles.glyphOutline} x="0.5" y="0.5" width="11" height="11" />}
        </svg>
        <span className={styles.stateWord}>{STATE_WORD[state]}</span>
    </span>
);

StateCell.propTypes = {
    state: PropTypes.oneOf(['yes', 'partial', 'no']).isRequired,
    patternId: PropTypes.string.isRequired,
};

const BenchmarkShowcase = () => {
    const reduce = useReducedMotion();
    const ref = useRef(null);
    const [drawn, setDrawn] = useState(false);
    /* [P1-MOBILE-FIT · 2026-08-09] Plegado de la metodología. Es estado de React
       y no un `<details>` nativo a propósito: el plegado debe existir SOLO bajo
       768px, y `open` no se puede gobernar desde CSS — con `<details>` la nota
       quedaría cerrada también en desktop, donde no estorba a nadie. */
    const [methodOpen, setMethodOpen] = useState(false);

    /* Reduced motion, defensa (a): el gate está en la DEFINICIÓN del estado —
       con `reduce` el observer ni se monta y todo nace en su pose final. La
       (b) es el bloque @media del .module.css. */
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
        }, { threshold: 0.2 });
        io.observe(el);
        return () => io.disconnect();
    }, [reduce]);

    return (
        <section className={styles.section} id="benchmarks">
            <div ref={ref} className={`${styles.container}${drawn ? ` ${styles.drawn}` : ''}`}>
                <div className={styles.sectionHead}>
                    <span className={styles.hLine} aria-hidden="true" />
                    {/* [P2-SECCIONES-TITULAR · 2026-08-02] Baja de `h2` a `p`: el
                        titular de verdad es el de abajo. */}
                    <p className={styles.sectionLabel}>04 / LA MEDICIÓN</p>
                    <span className={styles.hLine} aria-hidden="true" />
                </div>

                <h2 className={styles.title} style={{ '--d': '0ms' }}>
                    No prometemos números. Los medimos.
                </h2>
                <p className={styles.subtitle} style={{ '--d': '35ms' }}>
                    Y los comparamos contra el mismo pipeline con el motor apagado.
                </p>

                {/* Tira de cartucho: sustituye al badge «MEDICIÓN EN VIVO» con
                    punto pulsante. La medición NO es en vivo, y decir lo
                    contrario en la sección que vende honestidad era el peor
                    sitio posible para una licencia de marketing. */}
                <ul className={styles.strip} style={{ '--d': '70ms' }}>
                    <li className={styles.stripCell}>{`SERIE N=${SERIES.n}`}</li>
                    <li className={styles.stripCell}>{SERIES.month}</li>
                    <li className={styles.stripCell}>{`MOTOR v${APP_VERSION}`}</li>
                    <li className={styles.stripCell}>A/B CON EL MOTOR APAGADO</li>
                </ul>

                <div className={styles.figBlock} style={{ '--d': '140ms' }}>
                    <ToleranceChart />
                </div>

                {/* [P1-SECCIONES-03-04-PROFUNDIDAD · 2026-08-02] El cosido. Las
                    dos figuras son el MISMO experimento A/B y hasta ahora no lo
                    decían en ninguna parte: la 04.1 da la desviación por macro y
                    la 04.2 el % de planes en banda. Estas dos guías punteadas lo
                    dibujan. Mismo `dasharray 3 4` del sistema.

                    Lleva `--d` como sus vecinas porque entra por el MISMO
                    revelado (`.drawn`, :397-417): sin él aparecería a peso
                    completo mientras las dos figuras que une aún se trazan — la
                    guía llegaría antes que aquello que cose.

                    `aria-hidden`: la relación ya está dicha en los dos pies. */}
                {/* ⚠ SIN `viewBox` Y CON X EN PORCENTAJE, como las guías de la
                    03 (`DashboardShowcase.jsx:497-512`) — y por la misma razón
                    por la que la cota de la Task 6 dejó de ser un SVG estirado.

                    Con `viewBox="0 0 100 48"` + `preserveAspectRatio="none"` la
                    X se estira ~10× (100 unidades → ~1032px) mientras la Y va
                    1:1. `vector-effect` normaliza el GROSOR del trazo, no la
                    longitud de arco del `dasharray`: los tramos horizontales
                    salían con guiones ~10× más largos que los verticales, o
                    sea que la frase «mismo `dasharray 3 4` del sistema» era
                    falsa en la mitad del dibujo. [fix · 2026-08-03]

                    Sin viewBox no hay escalado, así que `<line>` con X en `%` y
                    Y en px da el ritmo correcto en los dos ejes. `path` no
                    acepta porcentajes; por eso cada guía son tres `<line>`. */}
                <svg className={styles.stitch} style={{ '--d': '175ms' }} aria-hidden="true">
                    {/* CON MOTOR: marcador de la 04.1 → punta de su barra en la 04.2 */}
                    <line className={styles.stitchLine} x1="45.7%" y1="0" x2="45.7%" y2="24" />
                    <line className={styles.stitchLine} x1="45.7%" y1="24" x2="87.3%" y2="24" />
                    <line className={styles.stitchLine} x1="87.3%" y1="24" x2="87.3%" y2="48" />
                    {/* SIN MOTOR: idem, y cruza a la primera porque su barra es corta */}
                    <line className={styles.stitchLine} x1="74.6%" y1="0" x2="74.6%" y2="32" />
                    <line className={styles.stitchLine} x1="74.6%" y1="32" x2="26.6%" y2="32" />
                    <line className={styles.stitchLine} x1="26.6%" y1="32" x2="26.6%" y2="48" />
                </svg>

                <div className={styles.figBlock} style={{ '--d': '210ms' }}>
                    <InBandBar />
                </div>

                {/* ── capacidades: tabla semántica de verdad ─────────────────
                    Aquí entra «Macros que cuadran al recalcular», que antes se
                    dibujaba como 100-contra-0 en un eje de porcentajes. Es una
                    capacidad: se responde con ■ SÍ / □ NO, sin Δ inventada. */}
                {/* El stagger se TOPA en 210 ms (4 escalones): encadenar los seis
                    bloques dejaría el último entrando 350 ms tarde. */}
                <div className={styles.capsWrap} style={{ '--d': '210ms' }}>
                    <table className={styles.caps}>
                        <thead>
                            <tr>
                                <th scope="col" className={styles.capsTh}>Capacidad</th>
                                <th scope="col" className={`${styles.capsTh} ${styles.capsThState}`}>Con motor</th>
                                <th scope="col" className={`${styles.capsTh} ${styles.capsThState}`}>Sin motor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {CAPS.map((c) => (
                                <tr key={c.key} className={styles.capsRow}>
                                    <th scope="row" className={styles.capsRowHead}>
                                        <span className={styles.capLabel}>{c.label}</span>
                                        <span className={styles.capSub}>{c.sub}</span>
                                    </th>
                                    <td className={styles.capsCell}>
                                        <StateCell state={c.mealfit} patternId={`paCapOn-${c.key}`} />
                                    </td>
                                    <td className={styles.capsCell}>
                                        <StateCell state={c.llm} patternId={`paCapOff-${c.key}`} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* [P1-MOBILE-FIT · 2026-08-09] LA METODOLOGÍA SE PLIEGA EN MÓVIL.
                    Medida a 320px son 20 líneas de 13px (17 a 360): la letra
                    pequeña más larga de la página, justo antes del cierre, y en
                    el punto donde el lector ya lleva 8 pantallas.

                    Esto NO contradice el defecto que este mismo P-fix arregla en
                    HowItWorks. Allí el recorte era mudo —«…» y ninguna forma de
                    pedir el resto—; aquí hay un control declarado, con
                    `aria-expanded`, que devuelve el texto íntegro. La diferencia
                    entre esconder y plegar es exactamente esa: que el lector
                    pueda deshacerlo.

                    Se pliega SOLO bajo 768px (el botón es `display: none` arriba
                    y el recorte vive dentro del mismo @media): en desktop la nota
                    ocupa 6 líneas y no molesta a nadie. Y el estado arranca
                    cerrado, no abierto: si arrancara abierto, plegar no serviría
                    de nada. */}
                <div className={styles.footnote} style={{ '--d': '210ms' }}>
                    <p
                        id="benchmark-metodologia"
                        className={`${styles.footnoteText} ${methodOpen ? styles.footnoteTextOpen : ''}`}
                    >
                        <strong>Metodología.</strong> Es una prueba A/B del mismo pipeline de generación, con y sin
                        nuestro motor de optimización determinista — comparamos <strong>enfoques</strong>, no productos
                        con nombre. «Sin motor (LLM solo)» es lo que obtienes al pedirle el plan directamente a un
                        modelo de lenguaje, sin nada que cuadre tus macros. El error se mide con el{' '}
                        <strong>MAPE</strong> (error absoluto porcentual medio); «en banda» = dentro del{' '}
                        {`${100 + BANDS.macros[0]}–${100 + BANDS.macros[1]}%`} del objetivo
                        {` (${100 + BANDS.kcal[0]}–${100 + BANDS.kcal[1]}% en calorías)`}. Son métricas de{' '}
                        <strong>precisión de macros</strong> —qué tan cerca queda el plan de tus números—, no de
                        corrección clínica, y no constituyen consejo médico.{' '}
                        {/* [P1-PAPER-BENCHMARK · 2026-08-02] Decía «Medición continua sobre planes
                            reales». Es la MISMA afirmación falsa que el badge «MEDICIÓN EN VIVO»
                            que el dueño aprobó retirar (spec §10.1), en el mismo bloque: dejarla
                            aquí habría sido corregir el titular y no el cuerpo. Revertible en una
                            línea si el dueño prefiere el copy anterior. */}
                        La serie es de {`N=${SERIES.n}`} planes dominicanos generados en{' '}
                        {SERIES.monthLong}: no es una medición en vivo.
                    </p>

                    <button
                        type="button"
                        className={styles.footnoteToggle}
                        aria-expanded={methodOpen}
                        aria-controls="benchmark-metodologia"
                        onClick={() => setMethodOpen((v) => !v)}
                    >
                        {/* NO dice «metodología»: a 60px debajo vive el
                            `SeeMoreLink` que lleva a /precision, y su literal ya
                            usa esa palabra. Dos controles casi homónimos, uno
                            que despliega aquí y otro que cambia de página, es
                            peor que no tener ninguno — el lector no puede
                            predecir cuál hace qué. Este habla de LA NOTA, que es
                            lo que gobierna. */}
                        {methodOpen ? 'Ocultar la nota' : 'Leer la nota completa'}
                    </button>
                </div>

                <SeeMoreLink to="/precision">Ver la metodología completa</SeeMoreLink>
            </div>
        </section>
    );
};

export default BenchmarkShowcase;
