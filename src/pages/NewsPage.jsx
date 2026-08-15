import { useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import styles from './News.module.css';
import { NEWS } from '../data/news';

/* ============================================================================
   [P3-NEWS-1 · 2026-07-01 · reescrito P1-PAPER-SURFACE-EXTEND · 2026-08-02]
   Índice de Novedades (/novedades) — REGISTRO DE REVISIONES.

   Sustituye el news grid estilo OpenAI de julio (hero centrado + destacado a dos
   columnas con arte abstracto + parrilla 2×2 de tarjetas). Dos razones, y
   ninguna es estética:

   1. LA RUTA ES PAPEL. /novedades y /novedades/<slug> entraron en
      `utils/paperSurface.js`, lo que cierra la deuda con fecha del spec §10.3
      («el landing en B/N enlazando a un índice con color»). El arte de las
      tarjetas eran 3 blobs radiales con `filter: blur()` por noticia, prohibidos
      por el §2.3 sin excepción.

   2. ES LA VERSIÓN LARGA DEL REGISTRO DE LA HOME. `NewsHighlight` («05 /
      REGISTRO») ya resolvió esta información como tabla de revisiones. El
      visitante que pulsa «Ver todas las revisiones» tiene que aterrizar en la
      MISMA tabla con todas las filas, no en otro lenguaje: si cambiara de
      idioma visual al cruzar el enlace, el enlace estaría mintiendo.

   Y de paso arregla el mismo defecto estructural que motivó la tabla en la
   home: con `NEWS.length` impar, «destacado + parrilla de pares» renderiza una
   tarjeta huérfana. Hoy, con 2 entradas, salía destacado + UNA suelta.

   COLUMNAS (idénticas a la home): REV (mono, posicional) · FECHA (mono ISO; el
   `dateLabel` legible vive en el `title` del enlace y en un `span` para lectores
   de pantalla) · CATEGORÍA (mono uppercase) · ENTRADA (Outfit 500, ES el enlace
   — la única ancla de la fila) + excerpt a 2 líneas · → (decorativo,
   `aria-hidden`, reacciona al hover/foco de la FILA vía CSS).

   Deliberado, igual que en la home: NO se envuelve la flecha en un segundo
   `<Link>` al mismo destino — serían dos enlaces por fila anunciados por
   separado al mismo sitio.

   `NewsArt` DEJA DE EXISTIR: este era su último consumidor (el landing lo soltó
   en Task 12). El componente y su `.module.css` se borran en este mismo commit
   — código muerto se borra, no se recolorea. El campo `art` de `data/news.js`
   se va con él por la misma razón: un campo inerte que documenta colores es la
   puerta trasera por la que vuelve el color.

   [P2-NEWS-NO-EMBLEM · 2026-08-02 · extendido al índice 2026-08-09] SIN
   EMBLEMA, TAMPOCO AQUÍ. La celda de ENTRADA pintaba `n.image` como cuadrado de
   48×48 despintado a la izquierda del titular. El registro del landing lo
   retiró el 2026-08-02 y el dueño repite hoy el juicio para /novedades: la foto
   es oscura casi hasta el negro, y a 48px sobre papel era la mancha de más peso
   de la tabla — el ojo aterrizaba ahí antes que en ningún titular. Sin ella las
   dos filas pesan lo mismo, que es lo que una tabla de revisiones debe
   aparentar: ninguna entrada destaca por tener foto, destacan por ser recientes
   (para eso está la pestaña de REV).

   Se van con el emblema los dos `<div>` de maquetación (`.titleRow` /
   `.titleBlock`) que existían SOLO para colocarlo a la izquierda del bloque de
   texto, y el campo `image` de `data/news.js` — este era su ÚLTIMO consumidor.
   Se borra en vez de quedarse inerte por el mismo motivo escrito allí para
   `art`: un campo visual sin consumidor es la puerta trasera por la que vuelve
   lo retirado. `/motor` no pierde nada: `Engine.jsx` referencia
   `/model-v1.webp` por ruta literal, no vía `NEWS`.
   ========================================================================= */

const newsTo = (n) => n.href || `/novedades/${n.slug}`;

const NewsPage = () => {
    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);

    const latest = NEWS[0];

    return (
        <div className={styles.page}>
            <div className={styles.inner}>
                <header className={styles.pageHead}>
                    <span className={styles.eyebrow}>Registro de revisiones</span>
                    <h1 className={styles.pageTitle}>
                        Novedades de <span className={styles.titleAccent}>Bioboros</span>
                    </h1>
                    <p className={styles.lead}>
                        Anuncios, mejoras del motor y todo lo nuevo. Cada avance,
                        documentado a medida que sucede.
                    </p>

                    {/* Cajetín de la hoja. Los dos valores son DERIVADOS de
                        `data/news.js` — conteo y fecha de la entrada 0 —, nunca
                        escritos: la regla moral del sistema es que solo se acota
                        lo que se mide. Si el array queda vacío, el cajetín no se
                        dibuja en vez de acotar un cero.

                        SON DOS CELDAS, no tres. Un borrador llevaba una tercera
                        con `ES-DO`, y se cayó por dos motivos que se refuerzan:
                        (1) es atrezzo — el §4.7 del spec rechaza expresamente las
                        celdas decorativas de cajetín («ESCALA — 1:1», «HOJA —
                        01/01») y el dato ya vive DOS veces en esta misma página,
                        en el cajetín del header y en el del footer; (2) medido a
                        390px, la tercera celda envolvía y su `border-left`
                        quedaba colgando al inicio de la segunda línea como una
                        regla suelta. Con dos celdas caben en una línea. */}
                    {latest && (
                        <div className={styles.cartouche}>
                            <span className={styles.cartoucheCell}>
                                Revisiones — <span className={styles.cartoucheVal}>
                                    {String(NEWS.length).padStart(2, '0')}
                                </span>
                            </span>
                            <span className={styles.cartoucheCell}>
                                Última — <span className={styles.cartoucheVal}>{latest.date}</span>
                            </span>
                        </div>
                    )}
                </header>

                {!latest ? (
                    <p className={styles.empty}>Aún no hay novedades. ¡Vuelve pronto!</p>
                ) : (
                    <table className={styles.table}>
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
                                return (
                                    <tr key={n.slug}
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
                                            {/* Sustituye a las columnas FECHA/CATEGORÍA cuando se
                                                ocultan (<719px). MISMA información, no un adorno: el
                                                `aria-label` con el dateLabel legible es lo que anuncia
                                                un lector de pantalla; los `<span>` visuales van
                                                aria-hidden para no duplicar el anuncio. */}
                                            {/* [P2-A11Y-ARIA-ON-P · 2026-08-15] Era un `aria-label` en el
                                                `<p>`: ARIA lo PROHÍBE ahí (un párrafo no tiene rol que lo
                                                admita), así que los lectores lo ignoraban y, con los tres
                                                spans en aria-hidden, no quedaba nada que anunciar. Texto
                                                oculto visualmente en su lugar — es contenido real, no una
                                                anotación que se pueda descartar. */}
                                            <p className={styles.metaMobile}>
                                                <span className={styles.srOnly}>{`${n.dateLabel} · ${n.tag}`}</span>
                                                <span aria-hidden="true">{n.date}</span>
                                                <span className={styles.metaSep} aria-hidden="true">·</span>
                                                <span aria-hidden="true">{n.tag}</span>
                                            </p>
                                            <Link to={newsTo(n)} className={styles.titleLink} title={n.dateLabel}>
                                                {n.title}
                                            </Link>
                                            <p className={styles.excerpt}>{n.excerpt}</p>
                                        </td>
                                        <td className={`${styles.cell} ${styles.cellGo}`}>
                                            <ArrowRight size={16} strokeWidth={2.25}
                                                className={styles.goIcon} aria-hidden="true" />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default NewsPage;
