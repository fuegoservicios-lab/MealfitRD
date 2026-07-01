import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Sparkles } from 'lucide-react';
import styles from './NewsHighlight.module.css';
import { NEWS } from '../../data/news';

/* [P3-NEWS-1 · 2026-07-01 · rediseño 2026-07-01] Banda de "Novedades" del landing.
   Estilo anuncio Anthropic/OpenAI: tarjeta destacada a dos columnas (editorial + cover
   abstracto con la versión) + lista compacta de anteriores + enlace al índice. Se alimenta
   del SSOT data/news.js (añadir noticia = actualiza solo). `href` → destino propio; `badge`
   → texto grande del cover. */

const NewsHighlight = () => {
    const featured = NEWS[0];
    const rest = NEWS.slice(1, 3);
    if (!featured) return null;
    const featuredTo = featured.href || `/novedades/${featured.slug}`;

    return (
        <section className={styles.section} id="news">
            <div className={styles.inner}>
                <div className={styles.head}>
                    <span className={styles.eyebrow}>
                        <span className={styles.pulse} aria-hidden="true" />
                        Novedades
                    </span>
                    <Link to="/novedades" className={styles.allLink}>
                        Ver todas <ArrowRight size={16} strokeWidth={2.5} />
                    </Link>
                </div>

                {/* anuncio destacado (el más reciente) */}
                <Link to={featuredTo} className={styles.feature} aria-label={`Leer: ${featured.title}`}>
                    <div className={styles.body}>
                        <div className={styles.meta}>
                            <span className={styles.tag}>{featured.tag}</span>
                            <span className={styles.metaSep} aria-hidden="true" />
                            <span className={styles.date}>{featured.dateLabel}</span>
                            {featured.readTime && (
                                <>
                                    <span className={styles.metaSep} aria-hidden="true" />
                                    <span className={styles.date}>{featured.readTime}</span>
                                </>
                            )}
                        </div>
                        <h2 className={styles.title}>{featured.title}</h2>
                        <p className={styles.excerpt}>{featured.excerpt}</p>
                        <span className={styles.cta}>
                            Leer el anuncio <ArrowUpRight size={17} strokeWidth={2.5} />
                        </span>
                    </div>

                    {/* cover abstracto (CSS puro): retícula + glow + rings + versión */}
                    <div className={styles.cover} aria-hidden="true">
                        <span className={styles.coverGrid} />
                        <span className={styles.coverGlow} />
                        {featured.badge
                            ? <span className={styles.coverBadge}>{featured.badge}</span>
                            : <Sparkles size={46} strokeWidth={1.5} className={styles.coverIcon} />}
                    </div>
                </Link>

                {/* anuncios anteriores (si los hay) */}
                {rest.length > 0 && (
                    <ul className={styles.list}>
                        {rest.map((n) => (
                            <li key={n.slug}>
                                <Link to={n.href || `/novedades/${n.slug}`} className={styles.listItem}>
                                    <span className={styles.listDate}>{n.dateLabel}</span>
                                    <span className={styles.listTag}>{n.tag}</span>
                                    <span className={styles.listTitle}>{n.title}</span>
                                    <ArrowUpRight size={16} strokeWidth={2.5} className={styles.listArrow} />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
};

export default NewsHighlight;
