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

   EL EMBLEMA (`/model-v1.webp`, `n.image`) vive DENTRO de la celda de
   TÍTULO — NO en columna propia. Añadir una sexta columna solo para el
   emblema habría exigido un `<th>` extra (¿con qué rótulo? ninguno de los
   cinco nombres de columna le queda) y un ancho fijo que la mayoría de las
   filas — las que no traen `image` — dejarían en blanco; con el emblema
   dentro de TÍTULO, el `<th>` de ENTRADA lo cubre gratis y una fila sin
   `image` simplemente no reserva el hueco (no hay columna vacía que
   delate la ausencia). 48×48, `grayscale(1) contrast(1.08)` + borde de
   1px — es un emblema real (la foto/logo del anuncio), no un dato que
   codificar en forma, así que colapsar sus colores por luma es intencional
   AQUÍ Y SOLO AQUÍ. La excepción la declara el spec del rediseño
   (`docs/superpowers/specs/2026-08-01-landing-papel-tecnico-design.md` §4.6 y
   §8, "Lo que NO se borra"): `/model-v1.webp` sigue vivo a todo color en
   `/motor` y solo se despinta como emblema de 48px en el registro.

   [fix · 2026-08-02] Este paréntesis decía "misma excepción declarada para
   `/model-v1.webp` en Hero/PlateExploded". Es FALSO: ninguno de esos dos
   ficheros menciona `model-v1` — el único otro consumidor real es
   `Engine.jsx:144`, y hace lo CONTRARIO (color pleno, 671×671, `alt`
   descriptivo). Un precedente inventado es peor que ninguno: invita a
   reañadirlo citando la doc (CLAUDE.md, invariante I6).

   `alt=""`: es redundante con el título, que ya identifica la entrada por
   texto — un lector de pantalla no pierde información si el emblema calla.

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
                            <th scope="col" className={`${styles.th} ${styles.thEntry}`}>Entrada</th>
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
                                        {/* El emblema (cuando la entrada trae `image`) vive DENTRO de la
                                            celda de TÍTULO, no en una columna propia: así el `<th>` de
                                            ENTRADA lo cubre gratis y ningún ancho de columna cambia por
                                            tenerlo o no — filas con y sin emblema conviven en la misma
                                            rejilla sin que las cabeceras se desalineen. */}
                                        <div className={styles.titleRow}>
                                            {/* [P2-NEWS-ROW-INTERACTION · 2026-08-02] El hueco del
                                                emblema se RESERVA aunque la entrada no traiga
                                                `image`. Antes el <img> se renderizaba condicional y
                                                el bloque de texto ocupaba su sitio: los títulos de
                                                filas con y sin emblema arrancaban a 62px de
                                                distancia entre sí, escalonados en la única columna
                                                que se lee en vertical. Un registro cuya columna de
                                                entradas no forma columna deja de ser un registro.

                                                El comentario de arriba defiende que ninguna anchura
                                                de COLUMNA cambie por tener emblema o no — y sigue
                                                siendo cierto, porque el hueco vive dentro de la
                                                celda. Lo que no cubría era el interior. */}
                                            <div className={styles.emblemSlot} aria-hidden="true">
                                                {n.image && (
                                                    <img
                                                        src={n.image}
                                                        alt=""
                                                        className={styles.emblem}
                                                    />
                                                )}
                                            </div>
                                            <div className={styles.titleBlock}>
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
                                            </div>
                                        </div>
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
