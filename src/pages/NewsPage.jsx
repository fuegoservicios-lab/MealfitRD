import { useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import styles from './News.module.css';
import { NEWS } from '../data/news';

/* [P3-NEWS-1 · 2026-07-01] Índice de Novedades (/novedades). Lista todos los anuncios del
   SSOT data/news.js, más reciente primero. El <title>/description los fija RouteTitle. */

const NewsPage = () => {
    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);

    return (
        <div className={styles.page}>
            <div className={styles.inner}>
                <span className={styles.eyebrow}>Novedades</span>
                <h1 className={styles.pageTitle}>Novedades de MealfitRD</h1>
                <p className={styles.lead}>
                    Anuncios, mejoras del motor y todo lo nuevo de MealfitRD. Aquí te contamos
                    cada avance, a medida que sucede.
                </p>

                {NEWS.length === 0 ? (
                    <p className={styles.empty}>Aún no hay novedades. ¡Vuelve pronto!</p>
                ) : (
                    <ul className={styles.list}>
                        {NEWS.map((n) => (
                            <li key={n.slug}>
                                <Link to={n.href || `/novedades/${n.slug}`} className={styles.card}>
                                    <div className={styles.cardMeta}>
                                        <span className={styles.tag}>{n.tag}</span>
                                        <span className={styles.metaText}>{n.dateLabel}</span>
                                        {n.readTime && (
                                            <>
                                                <span className={styles.dot}>·</span>
                                                <span className={styles.metaText}>{n.readTime}</span>
                                            </>
                                        )}
                                    </div>
                                    <h2 className={styles.cardTitle}>{n.title}</h2>
                                    <p className={styles.cardExcerpt}>{n.excerpt}</p>
                                    <span className={styles.cardMore}>
                                        Leer el anuncio <ArrowRight size={16} strokeWidth={2.5} />
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default NewsPage;
