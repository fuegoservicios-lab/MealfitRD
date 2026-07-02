import styles from './NewsFigure.module.css';

/* [P3-NEWS-SCIENTIFIC · 2026-07-02] Figura compartida de Novedades (banda del landing +
   índice /novedades): retícula de calibración line-art sobre papel milimetrado, rótulo
   central (badge del SSOT news.js) y pie tipo paper "Fig. NN —". Theme-aware vía tokens. */

const NewsFigure = ({ badge, caption }) => (
    <figure className={styles.figure} aria-hidden="true">
        <div className={styles.canvas}>
            <svg
                className={styles.svg}
                viewBox="0 0 320 240"
                preserveAspectRatio="xMidYMid meet"
            >
                <circle cx="160" cy="120" r="92" className={styles.line} />
                <circle cx="160" cy="120" r="64" className={styles.line} />
                <circle cx="160" cy="120" r="38" className={styles.muted} />
                <line x1="24" y1="120" x2="296" y2="120" className={styles.dash} />
                <line x1="160" y1="8" x2="160" y2="232" className={styles.dash} />
                {[48, 68, 88, 232, 252, 272].map((x) => (
                    <line key={x} x1={x} y1="116" x2={x} y2="124" className={styles.muted} />
                ))}
                <circle cx="160" cy="28" r="3" className={styles.dotAccent} />
                <circle cx="225" cy="55" r="2.5" className={styles.dot} />
                <circle cx="252" cy="120" r="3" className={styles.dotAccent} />
                <circle cx="95" cy="185" r="2.5" className={styles.dot} />
                <circle cx="68" cy="120" r="3" className={styles.dot} />
                <path d="M 160 28 A 92 92 0 0 1 252 120" className={styles.accent} />
            </svg>
            {badge && <span className={styles.badge}>{badge}</span>}
        </div>
        {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
);

export default NewsFigure;
