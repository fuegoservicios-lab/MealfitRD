import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import styles from './NewsHighlight.module.css';
import { makeSectionMotion } from './sectionMotion';
import { NEWS } from '../../data/news';

/* [P3-NEWS-1 · 2026-07-01 · rediseño OpenAI-style 2026-07-11] Banda de "Novedades"
   del landing al estilo del news grid de OpenAI: cada anuncio lleva un ARTE
   ABSTRACTO de campos de color difuminados (CSS puro — tres blobs radiales con
   blur sobre un gradiente base, colores por noticia vía `art` en data/news.js) +
   título + categoría/fecha. El más reciente va destacado a dos columnas (texto |
   arte grande con monograma glass del `badge`); el resto en grid de dos columnas
   con thumbnail cuadrado a la izquierda. Se alimenta del SSOT data/news.js.
   [P1-LANDING-MOTION · 2026-07-11] Reveal on-scroll compartido (sectionMotion). */

/* Paleta cíclica para noticias sin `art` propio (índice % length). */
const FALLBACK_ART = [
    ['#6366F1', '#A78BFA', '#FB7185'],
    ['#34D399', '#38BDF8', '#6366F1'],
    ['#FB923C', '#FB7185', '#A78BFA'],
    ['#38BDF8', '#6366F1', '#34D399'],
];

const artVars = (n, i) => {
    const [a1, a2, a3] = n.art || FALLBACK_ART[i % FALLBACK_ART.length];
    return { '--a1': a1, '--a2': a2, '--a3': a3 };
};

const newsTo = (n) => n.href || `/novedades/${n.slug}`;

/* Arte del thumbnail: imagen real del anuncio si la noticia trae `image`
   (el gradiente queda debajo como placeholder de carga); si no, campos de
   color + monograma glass del `badge` (solo cuando withBadge). */
const NewsArt = ({ n, i, className, withBadge = false }) => (
    <span className={`${styles.art} ${className}`} style={artVars(n, i)} aria-hidden="true">
        {n.image ? (
            <img className={styles.artImg} src={n.image} alt="" loading="lazy" decoding="async" />
        ) : (
            withBadge && n.badge && <span className={styles.artBadge}>{n.badge}</span>
        )}
    </span>
);

const NewsHighlight = () => {
    const reduce = useReducedMotion();
    const M = makeSectionMotion(reduce);
    const featured = NEWS[0];
    const rest = NEWS.slice(1, 5);
    if (!featured) return null;

    return (
        <section className={styles.section} id="news">
            <motion.div className={styles.inner}
                variants={M.container} initial="hidden" whileInView="show"
                viewport={{ once: true, amount: 0.2 }}>
                <motion.div className={styles.head} variants={M.rise}>
                    <span className={styles.eyebrow}>
                        <span className={styles.pulse} aria-hidden="true" />
                        Novedades
                    </span>
                    <Link to="/novedades" className={styles.allLink}>
                        Ver todas <ArrowRight size={16} strokeWidth={2.5} />
                    </Link>
                </motion.div>

                {/* destacado: texto | arte grande con monograma */}
                <motion.div variants={M.rise}>
                    <Link to={newsTo(featured)} className={styles.feature} aria-label={`Leer: ${featured.title}`}>
                        <span className={styles.body}>
                            <span className={styles.meta}>
                                <span className={styles.tag}>{featured.tag}</span>
                                <span className={styles.date}>{featured.dateLabel}</span>
                                {featured.readTime && <span className={styles.date}>· {featured.readTime}</span>}
                            </span>
                            <span className={styles.title}>{featured.title}</span>
                            <span className={styles.excerpt}>{featured.excerpt}</span>
                        </span>
                        <NewsArt n={featured} i={0} className={styles.artFeatured} withBadge />
                    </Link>
                </motion.div>

                {/* anteriores: grid estilo OpenAI (thumb cuadrado + título + tag/fecha) */}
                {rest.length > 0 && (
                    <ul className={styles.grid}>
                        {rest.map((n, i) => (
                            <motion.li key={n.slug} variants={M.rise} className={styles.cell}>
                                <Link to={newsTo(n)} className={styles.card} aria-label={`Leer: ${n.title}`}>
                                    <NewsArt n={n} i={i + 1} className={styles.artThumb} />
                                    <span className={styles.cardBody}>
                                        <span className={styles.cardTitle}>{n.title}</span>
                                        <span className={styles.cardMeta}>
                                            <span className={styles.cardTag}>{n.tag}</span>
                                            <span className={styles.cardDate}>{n.dateLabel}</span>
                                        </span>
                                    </span>
                                </Link>
                            </motion.li>
                        ))}
                    </ul>
                )}
            </motion.div>
        </section>
    );
};

export default NewsHighlight;
