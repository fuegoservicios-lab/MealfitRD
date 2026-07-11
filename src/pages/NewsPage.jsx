import { useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import styles from './News.module.css';
import NewsArt from '../components/news/NewsArt';
import { NEWS } from '../data/news';

/* [P3-NEWS-SCIENTIFIC · 2026-07-02 · rediseño OpenAI-style 2026-07-11] Índice de
   Novedades (/novedades) alineado al news grid de OpenAI (mismo lenguaje que la
   banda del landing): hero centrado, último anuncio destacado con arte abstracto
   de campos de color (o imagen real vía `image`) + monograma glass del `badge`,
   y los anteriores en grid de tarjetas con thumbnail cuadrado + título +
   categoría/fecha + resumen. Arte compartido: components/news/NewsArt. Se
   alimenta del SSOT data/news.js. El <title>/description los fija RouteTitle. */

const newsTo = (n) => n.href || `/novedades/${n.slug}`;

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
                        {/* último anuncio — texto | arte */}
                        <Link
                            to={newsTo(featured)}
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

                            <NewsArt n={featured} i={0} className={styles.featuredArt} withBadge />
                        </Link>

                        {/* anuncios anteriores — grid de tarjetas con arte */}
                        {rest.length > 0 && (
                            <section>
                                <div className={styles.sep}>Anteriores</div>
                                <ul className={styles.newsGrid}>
                                    {rest.map((n, i) => (
                                        <li key={n.slug} className={styles.newsCell}>
                                            <Link to={newsTo(n)} className={styles.newsCard} aria-label={`Leer: ${n.title}`}>
                                                <NewsArt n={n} i={i + 1} className={styles.newsThumb} />
                                                <span className={styles.newsBody}>
                                                    <span className={styles.newsTitle}>{n.title}</span>
                                                    <span className={styles.newsExcerpt}>{n.excerpt}</span>
                                                    <span className={styles.newsMeta}>
                                                        <span className={styles.newsTag}>{n.tag}</span>
                                                        <span className={styles.newsDate}>{n.dateLabel}</span>
                                                    </span>
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default NewsPage;
