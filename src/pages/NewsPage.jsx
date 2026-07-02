import { useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import styles from './News.module.css';
import { NEWS } from '../data/news';

/* [P3-NEWS-SCIENTIFIC · 2026-07-02] Índice de Novedades (/novedades) en clave
   minimalista-científica (lenguaje P3-HOWITWORKS-PAGE-SCIENTIFIC): hero centrado,
   último anuncio como "figura" line-art sobre papel milimetrado (pie "Fig. 01 —")
   y registro de anuncios anteriores en filas hairline numeradas. Se alimenta del
   SSOT data/news.js. `href` → destino propio; `badge` → rótulo central de la figura.
   El <title>/description los fija RouteTitle. */

/* Retícula de calibración: círculos concéntricos + ejes + marcas + arco de avance. */
const FeaturedFigure = () => (
    <svg
        className={styles.figSvg}
        viewBox="0 0 320 240"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
    >
        <circle cx="160" cy="120" r="92" className={styles.figLine} />
        <circle cx="160" cy="120" r="64" className={styles.figLine} />
        <circle cx="160" cy="120" r="38" className={styles.figMuted} />
        <line x1="24" y1="120" x2="296" y2="120" className={styles.figDash} />
        <line x1="160" y1="8" x2="160" y2="232" className={styles.figDash} />
        {[48, 68, 88, 232, 252, 272].map((x) => (
            <line key={x} x1={x} y1="116" x2={x} y2="124" className={styles.figMuted} />
        ))}
        <circle cx="160" cy="28" r="3" className={styles.figDotAccent} />
        <circle cx="225" cy="55" r="2.5" className={styles.figDot} />
        <circle cx="252" cy="120" r="3" className={styles.figDotAccent} />
        <circle cx="95" cy="185" r="2.5" className={styles.figDot} />
        <circle cx="68" cy="120" r="3" className={styles.figDot} />
        <path d="M 160 28 A 92 92 0 0 1 252 120" className={styles.figAccent} />
    </svg>
);

const NewsPage = () => {
    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);

    const featured = NEWS[0];
    const rest = NEWS.slice(1);

    return (
        <div className={styles.page}>
            <div className={styles.inner}>
                <header className={styles.pageHead}>
                    <span className={styles.eyebrow}>
                        <span className={styles.pulse} aria-hidden="true" />
                        Novedades
                    </span>
                    <h1 className={styles.pageTitle}>
                        Novedades de <span className={styles.titleAccent}>MealfitRD</span>
                    </h1>
                    <p className={styles.lead}>
                        Anuncios, mejoras del motor y todo lo nuevo. Cada avance,
                        documentado a medida que sucede.
                    </p>
                </header>

                {!featured ? (
                    <p className={styles.empty}>Aún no hay novedades. ¡Vuelve pronto!</p>
                ) : (
                    <>
                        {/* último anuncio — texto | figura (Fig. 01) */}
                        <Link
                            to={featured.href || `/novedades/${featured.slug}`}
                            className={styles.featured}
                            aria-label={`Leer: ${featured.title}`}
                        >
                            <div className={styles.featuredBody}>
                                <div className={styles.featuredMeta}>
                                    <span className={styles.tag}>{featured.tag}</span>
                                    <span className={styles.metaSep} aria-hidden="true" />
                                    <span className={styles.metaText}>{featured.dateLabel}</span>
                                    {featured.readTime && (
                                        <>
                                            <span className={styles.metaSep} aria-hidden="true" />
                                            <span className={styles.metaText}>{featured.readTime}</span>
                                        </>
                                    )}
                                </div>
                                <h2 className={styles.featuredTitle}>{featured.title}</h2>
                                <p className={styles.featuredExcerpt}>{featured.excerpt}</p>
                                <span className={styles.featuredCta}>
                                    Leer el anuncio <ArrowUpRight size={16} strokeWidth={2.5} />
                                </span>
                            </div>

                            <figure className={styles.featuredFigure} aria-hidden="true">
                                <div className={`${styles.figCanvas} ${styles.gridPaper}`}>
                                    <FeaturedFigure />
                                    {featured.badge && (
                                        <span className={styles.figBadge}>{featured.badge}</span>
                                    )}
                                </div>
                                <figcaption className={styles.figCaption}>
                                    Fig. 01 — Último anuncio
                                </figcaption>
                            </figure>
                        </Link>

                        {/* anuncios anteriores — registro en filas hairline */}
                        {rest.length > 0 && (
                            <section>
                                <div className={styles.sep}>Registro</div>
                                <div className={styles.archive}>
                                    {rest.map((n, i) => (
                                        <Link
                                            key={n.slug}
                                            to={n.href || `/novedades/${n.slug}`}
                                            className={styles.row}
                                        >
                                            <span className={styles.rowIndex}>
                                                {String(i + 2).padStart(2, '0')}
                                            </span>
                                            <span className={styles.rowDate}>{n.dateLabel}</span>
                                            <span className={styles.rowBody}>
                                                <span className={styles.rowTitle}>{n.title}</span>
                                                <span className={styles.rowExcerpt}>{n.excerpt}</span>
                                            </span>
                                            <ArrowRight
                                                size={16}
                                                strokeWidth={2.2}
                                                className={styles.rowArrow}
                                            />
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default NewsPage;
