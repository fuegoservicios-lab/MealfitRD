import { useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Sparkles } from 'lucide-react';
import styles from './News.module.css';
import { NEWS } from '../data/news';

/* [P3-NEWS-1 · 2026-07-01 · rediseño índice] Índice de Novedades (/novedades). Destaca el
   último anuncio en una tarjeta a dos columnas (editorial + cover con la versión) y lista el
   resto en rejilla. Se alimenta del SSOT data/news.js. `href` → destino propio; `badge` → cover.
   El <title>/description los fija RouteTitle. */

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
                        Anuncios, mejoras del motor y todo lo nuevo. Aquí te contamos cada avance,
                        a medida que sucede.
                    </p>
                </header>

                {!featured ? (
                    <p className={styles.empty}>Aún no hay novedades. ¡Vuelve pronto!</p>
                ) : (
                    <>
                        {/* último anuncio — destacado */}
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
                                    Leer el anuncio <ArrowUpRight size={17} strokeWidth={2.5} />
                                </span>
                            </div>

                            <div className={styles.cover} aria-hidden="true">
                                <span className={styles.coverGrid} />
                                <span className={styles.coverGlow} />
                                {featured.badge
                                    ? <span className={styles.coverBadge}>{featured.badge}</span>
                                    : <Sparkles size={46} strokeWidth={1.5} className={styles.coverIcon} />}
                            </div>
                        </Link>

                        {/* anuncios anteriores — rejilla */}
                        {rest.length > 0 && (
                            <>
                                <div className={styles.sep}>Más novedades</div>
                                <div className={styles.grid}>
                                    {rest.map((n) => (
                                        <Link
                                            key={n.slug}
                                            to={n.href || `/novedades/${n.slug}`}
                                            className={styles.card}
                                        >
                                            <div className={styles.cardMeta}>
                                                <span className={styles.tag}>{n.tag}</span>
                                                <span className={styles.metaText}>{n.dateLabel}</span>
                                            </div>
                                            <h3 className={styles.cardTitle}>{n.title}</h3>
                                            <p className={styles.cardExcerpt}>{n.excerpt}</p>
                                            <span className={styles.cardMore}>
                                                Leer <ArrowRight size={15} strokeWidth={2.5} />
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default NewsPage;
