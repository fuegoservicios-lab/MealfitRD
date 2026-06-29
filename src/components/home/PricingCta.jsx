import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import styles from './PricingCta.module.css';

/* [P3-PRICING-SEPARATE-PAGE · 2026-06-29] El detalle de planes se movió a /precios
   (estilo Anthropic/OpenAI). En el landing queda esta banda con un botón que lleva
   a esa página. Conserva id="pricing" como sección del home. */
const PricingCta = () => (
    <section className={styles.section} id="pricing">
        <div className={styles.glow} aria-hidden="true" />
        <div className={styles.inner}>
            <span className={styles.badge}>Planes flexibles</span>
            <h2 className={styles.title}>
                Invierte en tu <span className={styles.titleAccent}>salud</span>
            </h2>
            <p className={styles.subtitle}>
                Comienza gratis y escala cuando quieras. Mira los planes y precios en detalle.
            </p>
            <Link to="/precios" className={styles.cta}>
                Ver planes y precios <ArrowRight size={18} strokeWidth={2.5} />
            </Link>
            <p className={styles.note}>Gratis para empezar · sin tarjeta</p>
        </div>
    </section>
);

export default PricingCta;
