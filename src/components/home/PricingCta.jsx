import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Check } from 'lucide-react';
import styles from './PricingCta.module.css';

/* [P3-PRICING-CTA-REDESIGN · 2026-06-29] El detalle de planes vive en /precios
   (estilo Anthropic/OpenAI). En el landing queda esta banda CTA premium: panel de
   vidrio sobre aurora animada + pills de planes + botón con destello. Conserva
   id="pricing" como sección del home. */

const TIERS = ['Gratis', 'Básico', 'Plus', 'Ultra'];
const TRUST = ['Gratis para empezar', 'Sin tarjeta', 'Cancela cuando quieras'];

const PricingCta = () => (
    <section className={styles.section} id="pricing">
        <div className={styles.aurora} aria-hidden="true">
            <span className={styles.blob1} />
            <span className={styles.blob2} />
            <span className={styles.blob3} />
        </div>

        <div className={styles.panel}>
            <span className={styles.badge}>
                <Sparkles size={13} strokeWidth={2.5} /> Planes flexibles
            </span>
            <h2 className={styles.title}>
                Invierte en tu <span className={styles.accent}>salud</span>
            </h2>
            <p className={styles.subtitle}>
                Comienza gratis y escala cuando quieras. Cuatro planes pensados para cada etapa de tu progreso.
            </p>

            <div className={styles.tiers}>
                {TIERS.map((t) => (
                    <span key={t} className={`${styles.tier} ${t === 'Plus' ? styles.tierHot : ''}`}>
                        {t === 'Plus' && <span className={styles.star} aria-hidden="true">★</span>}
                        {t}
                    </span>
                ))}
            </div>

            <Link to="/precios" className={styles.cta}>
                Ver planes y precios <ArrowRight size={18} strokeWidth={2.5} />
            </Link>

            <ul className={styles.trust}>
                {TRUST.map((t) => (
                    <li key={t}><Check size={14} strokeWidth={3} /> {t}</li>
                ))}
            </ul>
        </div>
    </section>
);

export default PricingCta;
