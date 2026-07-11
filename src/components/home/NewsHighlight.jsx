import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import styles from './NewsHighlight.module.css';
import NewsFigure from '../news/NewsFigure';
import { makeSectionMotion } from './sectionMotion';
import { NEWS } from '../../data/news';

/* [P3-NEWS-1 · 2026-07-01 · rediseño científico 2026-07-02] Banda de "Novedades" del
   landing en clave minimalista-científica (mismo lenguaje que /novedades): tarjeta
   hairline a dos columnas (editorial + figura de calibración compartida NewsFigure
   con pie "Fig. 01 —") + lista compacta de anteriores + enlace al índice. Se alimenta
   del SSOT data/news.js (añadir noticia = actualiza solo). `href` → destino propio;
   `badge` → rótulo central de la figura.
   [P1-LANDING-MOTION · 2026-07-11] Reveal on-scroll (head → destacado → lista en
   cascada), mismo lenguaje de motion que Hero/HowItWorks. Reduced-motion → fade puro. */

const NewsHighlight = () => {
    const reduce = useReducedMotion();
    const M = makeSectionMotion(reduce);
    const featured = NEWS[0];
    const rest = NEWS.slice(1, 3);
    if (!featured) return null;
    const featuredTo = featured.href || `/novedades/${featured.slug}`;

    return (
        <section className={styles.section} id="news">
            <motion.div className={styles.inner}
                variants={M.container} initial="hidden" whileInView="show"
                viewport={{ once: true, amount: 0.25 }}>
                <motion.div className={styles.head} variants={M.rise}>
                    <span className={styles.eyebrow}>
                        <span className={styles.pulse} aria-hidden="true" />
                        Novedades
                    </span>
                    <Link to="/novedades" className={styles.allLink}>
                        Ver todas <ArrowRight size={16} strokeWidth={2.5} />
                    </Link>
                </motion.div>

                {/* anuncio destacado (el más reciente). El wrapper motion lleva la
                    entrada; el Link conserva sus estados hover del CSS. */}
                <motion.div variants={M.rise}>
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
                                Leer el anuncio <ArrowUpRight size={16} strokeWidth={2.5} />
                            </span>
                        </div>

                        <NewsFigure badge={featured.badge} caption="Fig. 01 — Último anuncio" />
                    </Link>
                </motion.div>

                {/* anuncios anteriores (si los hay) — cascada */}
                {rest.length > 0 && (
                    <ul className={styles.list}>
                        {rest.map((n) => (
                            <motion.li key={n.slug} variants={M.rise}>
                                <Link to={n.href || `/novedades/${n.slug}`} className={styles.listItem}>
                                    <span className={styles.listDate}>{n.dateLabel}</span>
                                    <span className={styles.listTag}>{n.tag}</span>
                                    <span className={styles.listTitle}>{n.title}</span>
                                    <ArrowUpRight size={16} strokeWidth={2.5} className={styles.listArrow} />
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
