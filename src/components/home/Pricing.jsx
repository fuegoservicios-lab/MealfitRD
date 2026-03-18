import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';
import { Check } from 'lucide-react';
import styles from './Pricing.module.css';
import PaymentModal from '../../components/dashboard/PaymentModal';

const Pricing = () => {
    const navigate = useNavigate();

    // Obtenemos datos y funciones del Contexto Global
    const {
        PLAN_LIMIT,
        remainingCredits,
        planData,
        upgradeUserToPlus,
        userProfile
    } = useAssessment();

    // Estado para controlar la visibilidad del Modal de Pago
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);

    // Lógica para determinar el estado del usuario
    const hasStarted = !!planData; // Si ya generó al menos un plan
    const isPlus = userProfile?.plan_tier === 'plus'; // Si ya pagó

    // Manejador del botón Plan Gratis
    const handleFreePlanClick = () => {
        if (hasStarted) {
            navigate('/dashboard');
        } else {
            navigate('/assessment');
        }
    };

    // Manejador del botón Plan Plus
    const handleUpgradeClick = () => {
        if (isPlus) {
            // Si ya es Plus, lo llevamos a Mi Agente
            navigate('/dashboard/agent');
            return;
        }
        // Si no es Plus, abrimos la pasarela de pago
        setIsPaymentOpen(true);
    };

    // Callback que se ejecuta cuando PayPal confirma el pago exitoso
    const handlePaymentSuccess = async () => {
        setIsPaymentOpen(false); // Cerramos modal
        await upgradeUserToPlus(); // Actualizamos la base de datos y el estado local
        navigate('/dashboard'); // Redirigimos al panel principal
    };

    return (
        <section className={styles.pricing}>

            {/* --- COMPONENTE DEL MODAL DE PAGO --- */}
            <PaymentModal
                isOpen={isPaymentOpen}
                onClose={() => setIsPaymentOpen(false)}
                onSuccess={handlePaymentSuccess}
                price="18.00" // Precio en USD para PayPal (aprox RD$999)
            />

            <div className={styles.container}>
                {/* Cabecera de la Sección */}
                <div className={styles.header}>
                    <span className={styles.badge}>Planes Flexibles</span>
                    <h2 className={styles.title}>Invierte en tu Salud</h2>
                    <p className={styles.subtitle}>
                        Comienza gratis y desbloquea todo el potencial de la IA.
                    </p>
                </div>

                <div className={styles.grid}>

                    {/* --- TARJETA 1: GRATIS --- */}
                    <div className={styles.card}>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>Gratis</h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>RD$</span>
                                <span className={styles.amount}>0</span>
                            </div>
                            <p className={styles.description}>
                                Descubre el poder de nuestra IA: crea planes nutricionales personalizados, genera listas de compras y ajusta tus comidas (Límite de {PLAN_LIMIT} créditos totales).
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>{PLAN_LIMIT} Créditos</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Lista de Compras Automática</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Recetas personalizadas</strong></li>
                            </ul>

                            <button
                                className={styles.btnOutline}
                                onClick={handleFreePlanClick}
                            >
                                {isPlus
                                    ? "Ir al Panel"
                                    : (hasStarted
                                        ? `Créditos: ${remainingCredits}/${PLAN_LIMIT}`
                                        : 'Empezar Gratis Ahora')
                                }
                            </button>
                        </div>
                    </div>

                    {/* --- TARJETA 2: PLUS (MÁS POPULAR) --- */}
                    <div className={`${styles.card} ${styles.popular}`}>
                        <div className={styles.popularBadge}>Más Popular</div>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>Plus</h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>USD$</span>
                                <span className={styles.amount}>25</span>
                                <span className={styles.period}>/mes</span>
                            </div>
                            <p className={styles.description}>
                                Sube al siguiente nivel. Obtén suficientes créditos para realizar cientos de ajustes o generaciones durante el mes.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>200 Créditos</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Asistente Experto Nutricional</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Aprendizaje Continuo</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Memoria a Largo Plazo</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Analizador de Macros Exacto</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Progreso en Tiempo Real</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Todo lo incluido en Gratis</strong></li>
                                <li><Check size={18} className={styles.check} /> Soporte Prioritario</li>
                            </ul>

                            <button
                                className={styles.btnPrimary}
                                onClick={handleUpgradeClick}
                            >
                                {isPlus ? "Tu Plan Actual" : "Cambiar a Plus"}
                            </button>
                        </div>
                    </div>

                    {/* --- TARJETA 3: ULTRA (ILIMITADO) --- */}
                    <div className={styles.card}>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>
                                Ultra Ilimitado
                            </h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>USD$</span>
                                <span className={styles.amount}>75</span>
                                <span className={styles.period}>/mes</span>
                            </div>
                            <p className={styles.description}>
                                Maximiza tu progreso sin restricciones. Genera tus dietas de la semana, listas de supermercado y modifica comidas sin límites.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>Dietas y planes ilimitados</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Asistencia Ilimitada</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Reportes de progreso detallados</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Todo lo incluido en Plus</strong></li>
                                <li><Check size={18} className={styles.check} /> Atención Exclusiva</li>
                            </ul>

                            <button
                                className={styles.btnOutline}
                                onClick={handleUpgradeClick}
                            >
                                Cambiar a Ultra
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
};

export default Pricing;