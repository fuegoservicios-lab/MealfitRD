import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import styles from './NewsHighlight.module.css';
import { NEWS } from '../../data/news';

/* [P3-NEWS-1 · 2026-07-01] Banda de "Novedades" del landing (reemplaza la vieja banda de
   precios). Estilo Anthropic/OpenAI: destaca el último anuncio + enlace al índice completo
   (/novedades). Se alimenta del SSOT data/news.js → añadir una noticia la actualiza sola. */

const NewsHighlight = () => {
    const featured = NEWS[0];
    const rest = NEWS.slice(1, 3);
    if (!featured) return null;

    return (
        <section className={styles.section} id="news">
            <div className={styles.inner}>
                <div className={styles.head}>
                    <span className={styles.eyebrow}>Novedades</span>
                    <Link to="/novedades" className={styles.allLink}>
                        Ver todas las novedades <ArrowRight size={16} strokeWidth={2.5} />
                    </Link>
                </div>

                {/* anuncio destacado (el más reciente) */}
                <Link to={`/novedades/${featured.slug}`} className={styles.feature}>
                    <div className={styles.meta}>
                        <span className={styles.tag}>{featured.tag}</span>
                        <span className={styles.date}>{featured.dateLabel}</span>
                    </div>
                    <h2 className={styles.title}>{featured.title}</h2>
                    <p className={styles.excerpt}>{featured.excerpt}</p>
                    <span className={styles.readMore}>
                        Leer el anuncio <ArrowUpRight size={17} strokeWidth={2.5} />
                    </span>
                </Link>

                {/* si hay más anuncios, lista compacta debajo */}
                {rest.length > 0 && (
                    <ul className={styles.list}>
                        {rest.map((n) => (
                            <li key={n.slug}>
                                <Link to={`/novedades/${n.slug}`} className={styles.listItem}>
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
