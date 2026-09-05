import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './Hero.module.css';
import PlateExploded from './figures/PlateExploded';
import { LANDING_EASE } from './sectionMotion';
import { useAssessment } from '../../context/AssessmentContext';
// [P1-LANDING-BENCH-1 · 2026-08-07] El «10 planes al mes» ahora sale del SSOT
// de créditos (P1-CREDITS-LADDER) en vez de vivir duplicado como literal.
import { TIER_CREDITS } from '../../config/plans';
// [P1-HERO-DEDUP-ACCENT · 2026-08-09] Y el «17 micronutrientes» del SSOT de
// hechos contables, por el mismo motivo.
import { MICROS_TRACKED } from '../../data/systemFacts';

/* [P1-PAPER-HERO-FIG00 · 2026-08-01] EL VÍDEO DEL HERO MURIÓ.
 *
 * Antes: una esfera 3D en vídeo (5 assets en public/, 5.550.239 bytes
 * medidos) sobre un escenario de spotlight + auroras + dot-grid + viñeta, con
 * dos IntersectionObserver (montaje diferido y reintento), un listener
 * `pointerdown` para reintentar la reproducción, una distinción entre el
 * aborto que provocaba nuestro propio pause y el veto de reproducción del
 * navegador, y un chequeo del modo ahorro de datos de `navigator.connection`.
 *
 * Nota para quien edite este comentario: el guard parser-based
 * `test_p1_paper_hero_fig00.py` escanea el ARCHIVO ENTERO, comentarios
 * incluidos. Nombrar aquí las APIs que se borraron (con su literal exacto)
 * hace fallar el test contra su propio arreglo. Descríbelas, no las cites.
 *
 * Ahora: la Fig. 00 — el despiece de un plato dominicano acotado, ~2 KB de SVG
 * inline. Cero red, cero decode, cero políticas de autoplay.
 *
 * Los 6 casos del test de autoplay móvil (P1-HERO-ORB-AUTOPLAY, 2026-07-11)
 * se BORRARON con la feature, no se adaptaron: codificaban un bug real de
 * Chrome Android e iOS Low Power Mode que deja de existir cuando no hay
 * vídeo. Adaptarlos para que pasaran habría sido fingir cobertura.
 *
 * POR QUÉ COMIDA Y NO UN DIAGRAMA ABSTRACTO: el diagrama «perfil → motor →
 * plan» que ilustraría esto igual de bien ilustra un CRM o una depuradora. Un
 * despiece de arroz, habichuela y pollo guisado solo puede ser este producto.
 *
 * `useHeroCta`/`ctaRef` también murieron. El puente Hero→Header dejó de tener
 * consumidor en P3-HEADER-FLOAT-REDESIGN (`Header.jsx`: el CTA del header es
 * permanente, `showStickyCta = isLandingLike && !hideStartNow`, sin leer
 * `heroCtaVisible`). Quedaba un IntersectionObserver escribiendo un estado que
 * nadie leía. Se limpió ENTERO — ref, provider y contexto — porque limpiar
 * solo el ref deja un provider huérfano que invita a recablearlo.
 *
 * REDUCED MOTION, DOBLE DEFENSA. El guard global de index.css solo acorta
 * duraciones, y framer-motion escribe los transforms inline vía WAAPI: una
 * sola capa deja el desplazamiento escrito. (a) `useReducedMotion()` gatea los
 * variants en su DEFINICIÓN (abajo, `makeVariants(reduce)`), no en su consumo.
 * (b) el bloque @media del .module.css fija la pose de reposo. Con `reduce`
 * activo la hoja se ve exactamente igual, ya dibujada.
 */

/* [P1-HERO-DEDUP-ACCENT · 2026-08-09] AQUÍ VIVÍA LA FRANJA DE CINCO CELDAS, y
   no se fue por espacio: cuatro de las cinco eran una reformulación en mono
   del párrafo que tenían justo encima. La celda de método reformulaba la
   cláusula de criterios clínicos; la de perfil, la de personalización; la de
   revisión, la de revisión profesional; y la de cocina, el adjetivo
   dominicana. Cuatro rótulos, cero información nueva.

   (Los nombres de esas celdas se describen, no se citan: el guard
   parser-based escanea este fichero ENTERO, comentarios incluidos, así que
   escribir aquí sus literales exactos haría fallar el test contra su propio
   arreglo. Misma regla que la cabecera de arriba para las APIs de vídeo.)

   Solo la celda de precio aportaba un dato que el párrafo no decía, y
   sobrevive como la línea `.datum` al final del `.tail`. Ese es también el
   motivo por el que la primera pantalla se leía apagada: tres franjas
   horizontales de mono gris de 11-12 px (cartucho, esta franja, pie de figura)
   contra UN solo objeto de tinta sólida. La masa de letra chica superaba a la
   de la afirmación grande.

   No la reintroduzcas «para dar contexto»: el contexto ya está dos párrafos
   más arriba, en prosa. */

const makeVariants = (reduce) => ({
    /* `settle` con stagger de 70 ms y TOPE DE 4 elementos: por eso las acciones
       y la franja viajan juntas en `.tail` en vez de ser el 5.º y 6.º hijo. */
    container: {
        hidden: {},
        show: {
            transition: {
                staggerChildren: reduce ? 0 : 0.07,
                delayChildren: reduce ? 0 : 0.06,
            },
        },
    },
    settle: {
        hidden: { opacity: 0, y: reduce ? 0 : 12 },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: reduce ? 0.001 : 0.42, ease: LANDING_EASE },
        },
    },
    /* La regla bajo el H1 se DIBUJA (scaleX desde la izquierda), no aparece.
       520 ms con LANDING_EASE — el easing ya exportado por sectionMotion.js;
       redefinirlo aquí crearía un segundo sitio de drift. */
    rule: {
        hidden: { scaleX: reduce ? 1 : 0 },
        show: {
            scaleX: 1,
            transition: { duration: reduce ? 0.001 : 0.52, ease: LANDING_EASE },
        },
    },
});

const Hero = () => {
    const reduce = useReducedMotion();
    const V = makeVariants(reduce);
    const { planData } = useAssessment();

    /* [P1-HERO-DEDUP-ACCENT · 2026-08-09] EL LITERAL DEL HERO ES LIBRE, y el
       comentario anterior decía lo contrario: afirmaba que
       `Header.sticky_cta.test.jsx` ataba estos literales a los del header. No
       los ata — ese test solo renderiza `<Header />`. Una restricción falsa
       documentada es peor que ninguna: congela código que nadie está obligando
       a congelar, y aquí congelaba justo el duplicado que había que romper.

       El CTA del header SÍ está atado por ese test, y que sea permanente en
       landing es decisión del dueño (P3-HEADER-FLOAT-REDESIGN). Por eso la
       gemelidad se rompe desde ESTE lado: literal propio, más corto que el
       suyo, y otra escala. Antes ambos botones llevaban el MISMO texto y eran
       dos rectángulos negros idénticos visibles sin scrollear. (El literal del
       header no se cita aquí: el guard escanea este fichero entero y lo
       prohíbe — que es exactamente el punto.)

       Sin versales: no hay `text-transform` ni aquí ni en el .module.css, a
       propósito. En este sistema las versales son de la rotulación mono, no de
       los controles. */
    const hasPlan = Boolean(planData);

    return (
        <section className={styles.hero}>
            {/* ── FILA-CARTUCHO ────────────────────────────────────────────
                El cajetín de un plano. Sus 3 celdas dicen 3 cosas que ningún
                otro elemento de la página dice.

                [P1-HERO-DEDUP-ACCENT · 2026-08-09] La celda 1 era la firma de
                la marca en versales — es decir, el wordmark del header otra
                vez, 40 px más abajo. Un cajetín que repite la firma que ya
                está encima gasta un tercio de su ancho en no decir nada.
                (Se describe y no se cita: el guard escanea el fichero entero,
                comentarios incluidos.) */}
            <div className={styles.cartridge}>
                {/* [P2-HERO-VANGUARDIA · 2026-09-05] Decía «DE PRECISIÓN». El
                    cambio es de registro, no de sentido: «precisión» es la
                    categoría técnica y sigue nombrándose en /about y en el pie;
                    aquí, en la primera línea de la página, manda el gancho.

                    Y CUESTA UN CARÁCTER, que en esta fila no es gratis: el
                    bloque móvil de Hero.module.css lleva la aritmética del
                    ancho, y `test_p2_hero_vanguardia.py` parsea ESTOS dos
                    literales (el `styles.cartridgeCell` de aquí abajo es su
                    ancla) contra el corte del apilado. Si alargas cualquiera
                    de los dos sin subir el corte, ese test cae. */}
                <span className={styles.cartridgeCell}>NUTRICIÓN DE VANGUARDIA</span>
                {/* El 17 sale de systemFacts.js, nunca a mano. Y se queda en
                    TINTA, no en acento: a 11 px un rojo se lee como error de
                    registro de imprenta, no como señal. Ser cifra SSOT habilita
                    el acento, no lo obliga. */}
                <span className={`${styles.cartridgeCell} ${styles.cartridgeMid}`}>
                    {`${MICROS_TRACKED} MICRONUTRIENTES CONTRA DRI`}
                </span>
                {/* [P1-PAPER-CARTRIDGE-ORIGIN · 2026-08-02] Decía «SANTO DOMINGO, RD»
                    y era falso: el origen es San Pedro de Macorís. Se CORRIGE en vez de
                    retirarse porque bajo 600px la celda del medio ya se oculta por ancho,
                    así que quitar el lugar dejaría el cajetín en UNA celda — y un cajetín
                    sin dónde deja de ser un cajetín.

                    ANCHO, medido bien: la celda es `1fr`, así que su `getBoundingClientRect`
                    devuelve el hueco que le sobra, NO lo que el texto necesita — medirla
                    así dice 276,6px tanto con sufijo como sin él, que es una lectura
                    inútil. El intrínseco real (canvas con la fuente y el letter-spacing
                    computados, más los 28px de padding) es 194,3px con «, RD» y 166,6 sin
                    él. A 320px, el ancho de contrato más estrecho, sobran 42,3px con el
                    sufijo. Cabe holgado: se queda.

                    Y se queda porque hace falta: «San Pedro de Macorís» a secas es una
                    ciudad que fuera de RD no se ubica, y el cajetín rotula procedencia. */}
                <span className={styles.cartridgeCell}>SAN PEDRO DE MACORÍS, RD</span>
            </div>

            <div className={styles.container}>
                <motion.div
                    className={styles.content}
                    variants={V.container}
                    initial="hidden"
                    animate="show"
                >
                    {/* [P1-HERO-DEDUP-ACCENT · 2026-08-09] SIN `<br />`. Lo llevaba
                        para forzar dos líneas, y al subir el titular a 104 px el
                        corte fijo dejaba «no» HUÉRFANO en su propia línea — el
                        pivote de la afirmación, en el peor sitio posible.

                        No se arregla bajando el techo. MEDIDO: la columna da
                        625 px y «no improvisada» pide 6,36 × el tamaño de
                        fuente; resolviendo contra el ancho de columna, con
                        `8.2vw` esa línea solo cabe por encima de ~1209 px de
                        viewport. Y a 1200 px exactos la columna ENCOGE 46 px
                        (el padding del contenedor salta de 2rem a 4rem y el gap
                        de 4 a 5rem) mientras la fuente sigue creciendo, así que
                        no existe un techo fijo que estabilice el corte en toda
                        la banda: cualquier número que elija se rompe en algún
                        ancho.

                        `text-wrap: balance` (en el .module.css) reparte las
                        líneas en CADA ancho y no deja huérfanas. Es la misma
                        familia que el `text-wrap: pretty` que ya usa `.lead`.
                        Si un día hay que volver a un corte fijo, que sea con la
                        medición de arriba delante. */}
                    <motion.h1 className={styles.title} variants={V.settle}>
                        Nutrición calculada, no improvisada
                    </motion.h1>

                    <motion.div className={styles.titleRule} variants={V.rule} aria-hidden="true" />

                    <motion.div className={styles.copy} variants={V.settle}>
                        {/* [P1-HERO-DEDUP-ACCENT · 2026-08-09] UN párrafo, no dos.
                            `lead` y `promise` decían ambos «qué recibes», y las 4
                            celdas borradas de la franja lo decían por tercera vez
                            en mono. Este texto absorbe las tres capas: ~45
                            palabras contra ~65 + 4 celdas, SIN perder ninguna
                            afirmación — método clínico, perfil, revisión
                            profesional y cocina dominicana siguen todos dichos,
                            una sola vez cada uno.

                            Abre por lo concreto («plan semanal de comida
                            dominicana») y no por la categoría: quien no conoce
                            el nombre necesita saber qué recibe en los primeros
                            segundos, que es lo que la línea de promesa borrada
                            existía para hacer — y lo hacía en tercer lugar. */}
                        <p className={styles.lead}>
                            Plan semanal de comida dominicana calculado contra tu perfil de salud, con <strong>precisión de macronutrientes</strong> y criterios clínicos fundamentados en evidencia. Lista de compras con precios de colmado, recetas paso a paso y revisión profesional cuando tu condición lo amerita.
                        </p>
                    </motion.div>

                    <motion.div className={styles.tail} variants={V.settle}>
                        <div className={styles.actions}>
                            {hasPlan ? (
                                <Link to="/dashboard" className={styles.primaryBtn}>
                                    Ver mi Plan
                                </Link>
                            ) : (
                                <Link to="/assessment" className={styles.primaryBtn}>
                                    Crear mi plan
                                </Link>
                            )}
                            {/* Control FANTASMA: contorno = «el otro», lo que no
                                es el dato acotado (§5.5). El hover lo rellena a
                                negro en 140 ms — solo tinta, sin transform.
                                SE QUEDA: /motor no está en `NAV_SECTIONS`
                                (Header.jsx:39-45), así que este botón es su
                                único acceso desde el sitio. */}
                            <Link to="/motor" className={styles.ghostBtn}>
                                Conoce el motor
                            </Link>
                        </div>

                        {/* [P1-HERO-DEDUP-ACCENT · 2026-08-09] Lo que queda de la
                            franja de 5 celdas: la única que aportaba un dato que
                            el párrafo no decía.

                            VIVE DENTRO DE `.tail` A PROPÓSITO — así hereda la
                            pose de reposo del bloque `prefers-reduced-motion`
                            sin necesitar selector propio, igual que la franja a
                            la que sustituye y por el mismo motivo de fondo (el
                            stagger de `settle` tiene tope de 4 elementos, así
                            que acciones y dato viajan juntos en `.tail` en vez
                            de ser el 5.º y 6.º hijo).

                            Que la misma cifra salga también en `ClosingBand` NO
                            es duplicación: son dos pantallas distintas y la
                            banda de cierre existe para volver a pedir el clic al
                            final. Lo que se eliminó es verla dos veces SIN
                            SCROLLEAR. */}
                        <p className={styles.datum}>
                            GRATIS · <span className={styles.datumNum}>{TIER_CREDITS.gratis}</span> PLANES AL MES
                        </p>
                    </motion.div>
                </motion.div>

                <figure className={styles.figure}>
                    <PlateExploded />
                    <figcaption className={styles.caption}>
                        Fig. 00 — Despiece de un plato dominicano. Cada componente se calcula por separado y se acota contra tu objetivo.
                        {/* El <svg> va aria-hidden porque un despiece leído nodo
                            a nodo es ruido. Pero entonces el pie es el ÚNICO
                            canal accesible de la figura, y sin esto un lector de
                            pantalla se quedaba sin los dos números acotados —
                            justo lo que el dibujo existe para decir. Va aquí y
                            no en el SVG para que sea una frase, no una lista de
                            rótulos sueltos. Los `140 g` se nombran siempre,
                            aunque bajo 768 px la cota anidada no se dibuje: el
                            dato del producto no depende del ancho de pantalla. */}
                        <span className={styles.srOnly}>
                            {' '}Los cinco componentes son arroz blanco, habichuela guisada, pollo guisado, ensalada verde y aguacate. El plato completo se acota en 2 000 kcal, y el pollo en 140 g de proteína.
                        </span>
                    </figcaption>
                </figure>
            </div>
        </section>
    );
};

export default Hero;
