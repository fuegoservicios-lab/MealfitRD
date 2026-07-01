import { useEffect, useLayoutEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import styles from './News.module.css';
import { getNewsBySlug } from '../data/news';

/* [P3-NEWS-1 · 2026-07-01] Página de un anuncio (/novedades/<slug>). Como la ruta es
   dinámica, RouteTitle la ignora (prefijo /novedades/) y aquí auto-gestionamos
   título + description + canonical por artículo. */

const BRAND = 'MealfitRD';
const ORIGIN = 'https://mealfitrd.com';

function setMetaByName(name, content) {
    let el = document.head.querySelector(`meta[name="${name}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}
function setMetaByProp(property, content) {
    let el = document.head.querySelector(`meta[property="${property}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}
function setCanonical(href) {
    let el = document.head.querySelector('link[rel="canonical"]');
    if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
    }
    el.setAttribute('href', href);
}

const NewsArticlePage = () => {
    const { slug } = useParams();
    const article = getNewsBySlug(slug);

    // [P3-NEWS-1] Si la noticia apunta a una página propia (href, p.ej. el Motor → /motor),
    // esta ruta genérica solo redirige a ese destino (cubre visitas directas / enlaces viejos).
    const redirectTo = article?.href;

    useLayoutEffect(() => { window.scrollTo(0, 0); }, [slug]);

    useEffect(() => {
        if (!article || redirectTo) return undefined;
        const prevTitle = document.title;
        const canonical = `${ORIGIN}/novedades/${article.slug}`;
        document.title = `${article.title} · ${BRAND}`;
        setMetaByName('description', article.excerpt);
        setMetaByName('twitter:description', article.excerpt);
        setMetaByProp('og:description', article.excerpt);
        setMetaByProp('og:url', canonical);
        setCanonical(canonical);
        return () => { document.title = prevTitle; };
    }, [article, redirectTo]);

    if (redirectTo) {
        return <Navigate to={redirectTo} replace />;
    }

    if (!article) {
        return (
            <div className={styles.page}>
                <div className={`${styles.inner} ${styles.innerNarrow}`}>
                    <Link to="/novedades" className={styles.back}>
                        <ArrowLeft size={16} strokeWidth={2.5} /> Novedades
                    </Link>
                    <h1 className={styles.articleTitle}>Anuncio no encontrado</h1>
                    <p className={styles.empty}>
                        Esta novedad no existe o fue movida.{' '}
                        <Link to="/novedades" className={styles.cardMore}>Ver todas las novedades</Link>.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <article className={`${styles.inner} ${styles.innerNarrow}`}>
                <Link to="/novedades" className={styles.back}>
                    <ArrowLeft size={16} strokeWidth={2.5} /> Novedades
                </Link>

                <div className={styles.articleMeta}>
                    <span className={styles.tag}>{article.tag}</span>
                    <span className={styles.metaText}>{article.dateLabel}</span>
                    {article.readTime && (
                        <>
                            <span className={styles.dot}>·</span>
                            <span className={styles.metaText}>{article.readTime}</span>
                        </>
                    )}
                </div>

                <h1 className={styles.articleTitle}>{article.title}</h1>
                <p className={styles.articleExcerpt}>{article.excerpt}</p>

                <div className={styles.divider} />

                <div className={styles.body}>
                    {article.content.map((block, i) => (
                        <div key={i}>
                            {block.h && <h2>{block.h}</h2>}
                            {block.body && block.body.map((p, j) => <p key={j}>{p}</p>)}
                            {block.list && (
                                <ul>
                                    {block.list.map((li, k) => <li key={k}>{li}</li>)}
                                </ul>
                            )}
                        </div>
                    ))}
                </div>

                <div className={styles.cta}>
                    <h2 className={styles.ctaTitle}>Pruébalo tú mismo</h2>
                    <p className={styles.ctaText}>
                        Crea tu plan personalizado con MealfitRD — gratis para empezar, sin tarjeta.
                    </p>
                    <div className={styles.ctaRow}>
                        <Link to="/assessment" className={styles.ctaPrimary}>
                            Crear mi Plan <ChevronRight size={18} strokeWidth={2.5} />
                        </Link>
                        <Link to="/novedades" className={styles.ctaGhost}>
                            Ver todas las novedades
                        </Link>
                    </div>
                </div>
            </article>
        </div>
    );
};

export default NewsArticlePage;
