import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import styles from './NewsHighlight.module.css';
import SeeMoreLink from './SeeMoreLink';
import { makeSectionMotion } from './sectionMotion';
import { NEWS } from '../../data/news';

/* ============================================================================
   [P2-PAPER-NO-INK · 2026-08-01] NewsHighlight → «05 / REGISTRO», TABLA DE
   REVISIONES.

   Reemplaza el "destacado + parrilla 2×2" estilo OpenAI (P3-NEWS-1, rediseño
   2026-07-11): 15 blobs radiales con `filter: blur()` por tarjeta — 3 por
   noticia × 5 noticias visibles — el peor coste de pintado permanente de la
   sección en gama baja, más el monograma "glass" del badge sobre el thumbnail
   destacado. El landing DEJÓ DE CONSUMIR `NewsArt` aquí, sin tocar el
   componente, porque entonces `/novedades` seguía fuera de alcance.
   [P1-PAPER-SURFACE-EXTEND · 2026-08-02] Ese «fuera de alcance» se cerró:
   `/novedades` y `/novedades/:slug` pasaron a papel, `NewsArt` se quedó sin
   consumidores y se borró junto con el campo `art` de `data/news.js`. Ya no
   queda un índice a color al otro lado de este enlace.

   POR QUÉ TABLA Y NO TARJETAS: una tabla es robusta con n=1, n=2 o n=17. El
   layout anterior renderizaba "destacado + UNA tarjeta suelta" con las 2
   entradas que `data/news.js` tiene HOY (`rest = NEWS.slice(1, 5)` dejaba un
   huérfano en una parrilla pensada para pares) — salía cojo hoy y seguiría
   saliendo cojo cada vez que las entradas no llegaran a número par. Un
   registro de revisiones (plano técnico) no tiene ese problema: n filas, cada
   una su propia línea.

   REV ES POSICIONAL, NO UN IDENTIFICADOR ESTABLE: `R02`/`R01` se deriva de
   `NEWS.length - i` en cada render. Insertar una entrada VIEJA en medio del
   array (en vez de al principio, que es la convención documentada arriba)
   RENUMERA TODAS las filas por debajo de ella. Si algún día una noticia
   necesita un identificador estable, ese id vive en `slug`, no en `REV`.

   COLUMNAS: REV (mono, código posicional) · FECHA (mono, ISO — el `dateLabel`
   legible vive en el `title` del enlace y en un `span` solo-para-lectores-de-
   pantalla, nunca en la vista) · TAG (mono, uppercase) · TÍTULO (Outfit 500,
   ES el enlace — la única ancla de la fila) + excerpt recortado a 2 líneas ·
   → (decorativo, `aria-hidden`, reacciona al hover/foco de la FILA entera vía
   CSS). Deliberado: un segundo `<a>` alrededor de la flecha con el MISMO
   destino habría dado dos enlaces por fila anunciados por separado a un
   lector de pantalla, para el mismo lugar.

   [P2-NEWS-NO-EMBLEM · 2026-08-02] SIN EMBLEMA. Aquí se dibujaba `n.image`
   (`/model-v1.webp`) como cuadrado de 48×48 con `grayscale(1) contrast(1.08)`,
   una excepción al B/N que el spec §4.6 declaraba explícitamente. Lo retira el
   dueño: la foto es oscura casi hasta el negro, y despintada a 48px sobre papel
   quedaba como la mancha de más peso de toda la sección — el ojo aterrizaba
   ahí antes que en cualquier titular, sin que el emblema aportara nada que el
   título no dijera ya.

   Nada más cambia de sitio: el `<td>` de ENTRADA vuelve a llevar el bloque de
   texto directo, sin los dos `<div>` de maquetación que existían solo para
   colocar el emblema a su izquierda, y su `<th>` deja de necesitar sangría.

   [2026-08-09] `n.image` YA NO EXISTE. Cuando esta sección lo soltó, el campo
   se conservó porque `NewsPage.jsx` (/novedades) seguía pintándolo — la
   retirada era de una superficie, no del dato. El dueño repitió el juicio para
   el índice, así que el campo se quedó sin consumidores y se borró de
   `data/news.js` con él. `/motor` sigue a todo color: `Engine.jsx` referencia
   el asset por ruta literal, no vía `NEWS`.

   LA "PESTAÑA DE REVISIÓN VIGENTE": la fila más reciente (`i === 0`) lleva una
   barra sólida de 24px en la canaleta de REV — el gesto de un plano real
   marcando cuál es la revisión activa entre varias archivadas.

   REFLOW <719px: no hay sitio para 5 columnas rígidas sin que TÍTULO quede
   comprimido a un ancho inviable (medido: a 375px, con FECHA+TAG como
   columnas fijas, TÍTULO queda con ~110px — un titular de 40+ caracteres en
   Outfit 17px necesitaría 6+ líneas). FECHA y TAG desaparecen como `<td>`
   (misma técnica que `.axisVRule`/`.axisVMark` de HowItWorks: se ocultan
   columnas enteras, no se fuerza `display` fuera de los valores de tabla — así
   la semántica de `<table>` no depende de parchear roles ARIA) y su
   información reaparece como una línea de meta dentro de la celda de TÍTULO,
   visible únicamente bajo el breakpoint donde las columnas dedicadas se
   esconden — nunca las dos a la vez.
   ========================================================================= */

const newsTo = (n) => n.href || `/novedades/${n.slug}`;

const NewsHighlight = () => {
    /* Reduced motion, defensa (a): `makeSectionMotion(reduce)` gatea las
       variants en su DEFINICIÓN (sin desplazamiento y duración ~0). La (b) es
       el bloque `@media (prefers-reduced-motion: reduce)` del .module.css: el
       guard global de index.css solo acorta duraciones, y framer-motion
       escribe los transforms inline vía WAAPI — un `whileInView` que nunca
       llegue a disparar dejaría la tabla en `opacity: 0` para siempre sin esa
       capa. */
    const reduce = useReducedMotion();
    const M = makeSectionMotion(reduce);

    if (NEWS.length === 0) return null;

    return (
        <section className={styles.section} id="news">
            <div className={styles.container}>
                <motion.div className={styles.head}
                    variants={M.container} initial="hidden" whileInView="show"
                    viewport={{ once: true, amount: 0.6 }}>
                    <motion.div className={styles.sectionHead} variants={M.rise}>
                        <span className={styles.hLine} aria-hidden="true" />
                        <h2 className={styles.sectionLabel}>05 / REGISTRO</h2>
                        <span className={styles.hLine} aria-hidden="true" />
                    </motion.div>
                    <motion.p className={styles.subtitle} variants={M.rise}>
                        Cada actualización del producto, registrada en el orden en que se publicó.
                    </motion.p>
                </motion.div>

                <motion.table className={styles.table}
                    variants={M.container} initial="hidden" whileInView="show"
                    viewport={{ once: true, amount: 0.2 }}>
                    <caption className={styles.srOnly}>
                        Registro de revisiones del producto, de la más reciente a la más antigua.
                    </caption>
                    <thead>
                        <tr>
                            <th scope="col" className={`${styles.th} ${styles.thRev}`}>Rev</th>
                            <th scope="col" className={`${styles.th} ${styles.thDate}`}>Fecha</th>
                            <th scope="col" className={`${styles.th} ${styles.thTag}`}>Categoría</th>
                            <th scope="col" className={styles.th}>Entrada</th>
                            <th scope="col" className={`${styles.th} ${styles.thGo}`}>
                                <span className={styles.srOnly}>Ir al anuncio</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {NEWS.map((n, i) => {
                            const rev = `R${String(NEWS.length - i).padStart(2, '0')}`;
                            const isLatest = i === 0;
                            const dest = newsTo(n);
                            return (
                                <motion.tr key={n.slug} variants={M.rise}
                                    className={`${styles.row} ${isLatest ? styles.rowCurrent : ''}`}>
                                    <td className={`${styles.cell} ${styles.cellRev}`}>
                                        {isLatest && <span className={styles.currentBar} aria-hidden="true" />}
                                        <span className={styles.revCode}>{rev}</span>
                                    </td>
                                    <td className={`${styles.cell} ${styles.cellDate}`}>
                                        <time dateTime={n.date}>
                                            <span aria-hidden="true">{n.date}</span>
                                            <span className={styles.srOnly}>{n.dateLabel}</span>
                                        </time>
                                    </td>
                                    <td className={`${styles.cell} ${styles.cellTag}`}>{n.tag}</td>
                                    <td className={`${styles.cell} ${styles.cellTitle}`}>
                                        {/* Sustituye a las columnas FECHA/TAG cuando estas se ocultan
                                            (<719px, ver .module.css) — MISMA información, no un adorno:
                                            `aria-label` con el dateLabel legible es lo que anuncia un
                                            lector de pantalla; los `<span>` visuales (ISO + tag) van
                                            aria-hidden para no duplicar el anuncio. */}
                                        <p className={styles.metaMobile} aria-label={`${n.dateLabel} · ${n.tag}`}>
                                            <span aria-hidden="true">{n.date}</span>
                                            <span className={styles.metaSep} aria-hidden="true">·</span>
                                            <span aria-hidden="true">{n.tag}</span>
                                        </p>
                                        <Link to={dest} className={styles.titleLink} title={n.dateLabel}>
                                            {n.title}
                                        </Link>
                                        <p className={styles.excerpt}>{n.excerpt}</p>
                                    </td>
                                    <td className={`${styles.cell} ${styles.cellGo}`}>
                                        <ArrowRight size={16} strokeWidth={2.25} className={styles.goIcon} aria-hidden="true" />
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </motion.table>

                <SeeMoreLink to="/novedades">Ver todas las revisiones</SeeMoreLink>
            </div>
        </section>
    );
};

export default NewsHighlight;
