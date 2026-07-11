import styles from './NewsArt.module.css';

/* [P3-NEWS-OPENAI · 2026-07-11] Arte de anuncio compartido (landing NewsHighlight
   + índice /novedades): campos de color abstractos difuminados estilo OpenAI news,
   en CSS puro (gradiente base + 2 blobs radiales con blur ESTÁTICO — se rasteriza
   una vez, costo runtime ≈0). Si la noticia trae `image`, la muestra con cover y
   el gradiente queda debajo como placeholder de carga. `withBadge` superpone el
   monograma glass del `badge` (solo cuando NO hay imagen — la imagen manda).
   El contenedor padre fija tamaño/aspect-ratio vía `className`. */

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

const NewsArt = ({ n, i = 0, className = '', withBadge = false }) => (
    <span className={`${styles.art} ${className}`} style={artVars(n, i)} aria-hidden="true">
        {n.image ? (
            <img className={styles.artImg} src={n.image} alt="" loading="lazy" decoding="async" />
        ) : (
            withBadge && n.badge && <span className={styles.artBadge}>{n.badge}</span>
        )}
    </span>
);

export default NewsArt;
