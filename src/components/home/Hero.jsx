import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './Hero.module.css';
import PlateExploded from './figures/PlateExploded';
import { LANDING_EASE } from './sectionMotion';
import { useAssessment } from '../../context/AssessmentContext';

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

/* Franja acotada bajo las acciones. Cinco celdas, etiqueta mono arriba y valor
   abajo — reemplaza a las trust pills con backdrop-filter.
   La celda de PRECIO es literal de producto (P1-CREDITS-LADDER: gratis = 10
   planes/mes). Si la escalera de créditos cambia, esta celda cambia con ella. */
const STRIP = [
    { label: 'MÉTODO', value: 'Evidencia clínica' },
    { label: 'PERFIL', value: 'Tu salud y tus metas' },
    { label: 'REVISIÓN', value: 'Profesional si aplica' },
    { label: 'COCINA', value: 'Dominicana' },
    { label: 'PRECIO', value: 'Gratis · 10 planes al mes' },
];

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

    /* [P1-PAPER-HERO-FIG00] Los literales del CTA primario son los MISMOS que
       ata `Header.sticky_cta.test.jsx` ('Crear mi Plan Ahora' / 'Ver mi Plan').
       No se reescriben. Y NO llevan versales: no hay `text-transform` ni aquí
       ni en el .module.css, a propósito — el CTA del header quedó en caja
       normal en la Task 3 (`Header.module.css`, bloque paper) y los dos botones
       tienen que verse igual. En este sistema las versales son de la
       rotulación mono, no de los controles. */
    const hasPlan = Boolean(planData);

    return (
        <section className={styles.hero}>
            {/* ── FILA-CARTUCHO ────────────────────────────────────────────
                El cajetín de un plano: quién firma, qué es, dónde se hizo. */}
            <div className={styles.cartridge}>
                <span className={styles.cartridgeCell}>BIOBOROS</span>
                <span className={`${styles.cartridgeCell} ${styles.cartridgeMid}`}>
                    NUTRICIÓN DE PRECISIÓN
                </span>
                {/* [P1-PAPER-CARTRIDGE-ORIGIN · 2026-08-02] Decía «SANTO DOMINGO, RD»
                    y era falso: el origen es San Pedro de Macorís. Se CORRIGE en vez de
                    retirarse porque bajo 600px la celda del medio ya se oculta, así que
                    quitar el lugar dejaría el cajetín en UNA celda — y un cajetín sin
                    dónde deja de ser un cajetín.
                    VA SIN «, RD» a propósito, y no es estética: medido a 360×3, con el
                    sufijo la celda pide 276,6px y `BIOBOROS` 83,4 → 360,0 exactos, cero
                    holgura. A 320px se desbordaba 40px, y `.cartridgeCell` no lleva
                    `overflow: hidden` (solo `.cartridgeMid`), así que habría metido
                    scroll horizontal al documento en un iPhone SE. El país ya lo dice
                    el `ES-DO / V1` del header, a unos píxeles de aquí; un cajetín real
                    rotula la ciudad cuando el país está establecido en otra parte. */}
                <span className={styles.cartridgeCell}>SAN PEDRO DE MACORÍS</span>
            </div>

            <div className={styles.container}>
                <motion.div
                    className={styles.content}
                    variants={V.container}
                    initial="hidden"
                    animate="show"
                >
                    <motion.h1 className={styles.title} variants={V.settle}>
                        Nutrición calculada,
                        <br />
                        no improvisada
                    </motion.h1>

                    <motion.div className={styles.titleRule} variants={V.rule} aria-hidden="true" />

                    <motion.div className={styles.copy} variants={V.settle}>
                        <p className={styles.lead}>
                            Planes personalizados a tu perfil de salud, con <strong>precisión de macronutrientes</strong> y criterios clínicos fundamentados en evidencia. Con revisión profesional cuando tu condición lo amerita.
                        </p>
                        {/* Línea de promesa en español llano, en la primera
                            pantalla: sin ella, quien no conoce el nombre no sabe
                            qué recibe en los 5 primeros segundos. */}
                        <p className={styles.promise}>
                            Plan semanal con comida dominicana, lista de compras con precios de colmado y recetas paso a paso.
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
                                    Crear mi Plan Ahora
                                </Link>
                            )}
                            {/* Control FANTASMA: contorno = «el otro», lo que no
                                es el dato acotado (§5.5). El hover lo rellena a
                                negro en 140 ms — solo tinta, sin transform. */}
                            <Link to="/motor" className={styles.ghostBtn}>
                                Conoce el motor
                            </Link>
                        </div>

                        <dl className={styles.strip}>
                            {STRIP.map((cell) => (
                                <div key={cell.label} className={styles.stripCell}>
                                    <dt className={styles.stripLabel}>{cell.label}</dt>
                                    <dd className={styles.stripValue}>{cell.value}</dd>
                                </div>
                            ))}
                        </dl>
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
