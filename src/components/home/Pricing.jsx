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
                        Elige el plan que mejor se adapte a tus objetivos y presupuesto.
                        Sin contratos forzosos.
                    </p>
                </div>

                <div className={styles.grid}>
                    {/* Gratis / Inicial */}
                    <div className={styles.card}>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>Gratis</h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>RD$</span>
                                <span className={styles.amount}>0</span>
                                <span className={styles.period}>/mes</span>
                            </div>
                            <p className={styles.description}>
                                Prueba la experiencia Mealfit sin costo por un mes.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>1 Mes de Acceso Gratis</strong></li>
                                <li><Check size={18} className={styles.check} /> 30 Generaciones de menú al mes</li>
                                <li><Check size={18} className={styles.check} /> Lista de compras básica</li>
                                <li><Check size={18} className={styles.check} /> Acceso al panel web</li>
                            </ul>

                            <button className={styles.btnOutline}>Empezar Gratis</button>
                        </div>
                    </div>

                    {/* Básico */}
                    <div className={styles.card}>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>Básico</h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>RD$</span>
                                <span className={styles.amount}>499</span>
                                <span className={styles.period}>/mes</span>
                            </div>
                            <p className={styles.description}>Perfecto para empezar tu cambio con una guía clara.</p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> Menú personalizado mensual</li>
                                <li><Check size={18} className={styles.check} /> Lista de compras básica</li>
                                <li><Check size={18} className={styles.check} /> Acceso al panel web</li>
                            </ul>

                            <button className={styles.btnOutline}>Comenzar Básico</button>
                        </div>
                    </div>

                    {/* Plus (Destacado) */}
                    <div className={`${styles.card} ${styles.popular}`}>
                        <div className={styles.popularBadge}>Más Popular</div>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>Plus</h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>RD$</span>
                                <span className={styles.amount}>999</span>
                                <span className={styles.period}>/mes</span>
                            </div>
                            <p className={styles.description}>Para quienes buscan resultados acelerados y variedad.</p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>Todo lo del Básico</strong></li>
                                <li><Check size={18} className={styles.check} /> Menú se ajusta cada 2 semanas</li>
                                <li><Check size={18} className={styles.check} /> Opción de "Salto de Comida"</li>
                                <li><Check size={18} className={styles.check} /> Recetas detalladas paso a paso</li>
                            </ul>

                            <button className={styles.btnPrimary}>Obtener Plus</button>
                        </div>
                    </div>

                    {/* Pro */}
                    <div className={styles.card}>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>Pro</h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>RD$</span>
                                <span className={styles.amount}>1,999</span>
                                <span className={styles.period}>/mes</span>
                            </div>
                            <p className={styles.description}>Transformación total con soporte prioritario.</p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>Todo lo del Plus</strong></li>
                                <li><Check size={18} className={styles.check} /> Ajustes ilimitados del menú</li>
                                <li><Check size={18} className={styles.check} /> Chat con Nutricionista IA</li>
                                <li><Check size={18} className={styles.check} /> Análisis de progreso semanal</li>
                            </ul>

                            <button className={styles.btnOutline}>Ser Pro</button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Pricing;
