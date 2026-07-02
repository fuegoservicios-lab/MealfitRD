import { useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import styles from './News.module.css';
import NewsFigure from '../components/news/NewsFigure';
import { NEWS } from '../data/news';

/* [P3-NEWS-SCIENTIFIC · 2026-07-02] Índice de Novedades (/novedades) en clave
   minimalista-científica (lenguaje P3-HOWITWORKS-PAGE-SCIENTIFIC): hero centrado,
   último anuncio como "figura" line-art sobre papel milimetrado (pie "Fig. 01 —",
   componente compartido NewsFigure) y registro de anuncios anteriores en filas
   hairline numeradas. Se alimenta del SSOT data/news.js. `href` → destino propio;
   `badge` → rótulo central de la figura. El <title>/description los fija RouteTitle. */

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

                            <NewsFigure
                                badge={featured.badge}
                                caption="Fig. 01 — Último anuncio"
                            />
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
