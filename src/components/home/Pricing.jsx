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
            // Si ya es Plus, lo llevamos a ajustes por si quiere ver su estado
            navigate('/dashboard/settings');
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
                    <div className={`${styles.card} ${styles.popular}`}>
                        <div className={styles.popularBadge}>Plan Recomendado</div>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>Gratis</h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>RD$</span>
                                <span className={styles.amount}>0</span>
                            </div>
                            <p className={styles.description}>
                                Acceso total a la plataforma (Límite de {PLAN_LIMIT} créditos mensuales).
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>{PLAN_LIMIT} Generaciones de menú AI</strong></li>
                                <li><Check size={18} className={styles.check} /> Generador de Recetas Inteligentes</li>
                                <li><Check size={18} className={styles.check} /> Lista de Compras Automática</li>
                                <li><Check size={18} className={styles.check} /> Acceso a todas las herramientas</li>
                            </ul>

                            <button
                                className={styles.btnPrimary}
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

                    {/* --- TARJETA 2: PLUS (ILIMITADO) --- */}
                    <div
                        className={styles.card}
                        style={isPlus ? { borderColor: '#10B981', background: '#F0FDF4', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.1)' } : {}}
                    >
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName} style={isPlus ? { color: '#059669' } : {}}>
                                Plus Ilimitado
                            </h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>RD$</span>
                                <span className={styles.amount}>999</span>
                                <span className={styles.period}>/mes</span>
                            </div>
                            <p className={styles.description}>
                                {isPlus
                                    ? "¡Felicidades! Tienes acceso total sin límites."
                                    : "Elimina los límites y maximiza tu progreso sin restricciones."
                                }
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>Generaciones AI Ilimitadas</strong></li>
                                <li><Check size={18} className={styles.check} /> Soporte Prioritario</li>
                                <li><Check size={18} className={styles.check} /> Todo lo incluido en Gratis</li>
                                <li><Check size={18} className={styles.check} /> Sin límites de uso</li>
                            </ul>

                            <button
                                className={isPlus ? styles.btnPrimary : styles.btnOutline}
                                onClick={handleUpgradeClick}
                                style={isPlus ? { background: '#10B981', border: 'none', color: 'white', pointerEvents: 'none' } : {}}
                            >
                                {isPlus ? "Tu Plan está Activo ✅" : "Mejorar a Plus (PayPal / Tarjeta)"}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
};

export default Pricing;