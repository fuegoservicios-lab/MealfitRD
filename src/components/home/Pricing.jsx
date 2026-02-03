import { Check } from 'lucide-react';
import styles from './Pricing.module.css';

const Pricing = () => {
    return (
        <section className={styles.pricing}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <span className={styles.badge}>Planes Flexibles</span>
                    <h2 className={styles.title}>Invierte en tu Salud</h2>
                    <p className={styles.subtitle}>
                        Comienza gratis y desbloquea todo el potencial de la IA.
                    </p>
                </div>

                <div className={styles.grid}>
                    {/* Gratis / Inicial - MEJORADO */}
                    <div className={`${styles.card} ${styles.popular}`}>
                        <div className={styles.popularBadge}>Plan Recomendado</div>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>Gratis</h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>RD$</span>
                                <span className={styles.amount}>0</span>
                                {null}
                            </div>
                            <p className={styles.description}>
                                Acceso total a la plataforma (Límite de 30 planes).
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>30 Generaciones de menú AI</strong></li>
                                <li><Check size={18} className={styles.check} /> Generador de Recetas Inteligentes</li>
                                <li><Check size={18} className={styles.check} /> Lista de Compras Automática</li>
                                <li><Check size={18} className={styles.check} /> Panel de Control Nutricional</li>
                                <li><Check size={18} className={styles.check} /> Acceso a todas las herramientas</li>
                            </ul>

                            <button className={styles.btnPrimary}>Empezar Gratis Ahora</button>
                        </div>
                    </div>

                    {/* Ilimitado / Plus */}
                    <div className={styles.card}>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>Plus Ilimitado</h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>RD$</span>
                                <span className={styles.amount}>999</span>
                                <span className={styles.period}>/mes</span>
                            </div>
                            <p className={styles.description}>Elimina los límites y maximiza tu progreso.</p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>Generaciones AI Ilimitadas</strong></li>
                                <li><Check size={18} className={styles.check} /> Soporte Prioritario</li>
                                <li><Check size={18} className={styles.check} /> Todo lo incluido en Gratis</li>
                                <li><Check size={18} className={styles.check} /> Uso sin restricciones</li>
                            </ul>

                            <button className={styles.btnOutline}>Mejorar a Plus</button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Pricing;
