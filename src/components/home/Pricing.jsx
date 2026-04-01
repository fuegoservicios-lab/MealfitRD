import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';
import { Check } from 'lucide-react';
import styles from './Pricing.module.css';
import PaymentModal from '../../components/dashboard/PaymentModal';

// --- Configuración de precios ---
const PRICING = {
    basic: {
        monthly: { price: '9.99', label: '/mes' },
        annual:  { price: '89.99', label: '/año', monthlyEquiv: '7.50' },
    },
    plus: {
        monthly: { price: '19.99', label: '/mes' },
        annual:  { price: '179.99', label: '/año', monthlyEquiv: '15.00' },
    },
    ultra: {
        monthly: { price: '49.99', label: '/mes' },
        annual:  { price: '449.99', label: '/año', monthlyEquiv: '37.50' },
    },
};

const Pricing = () => {
    const navigate = useNavigate();

    const {
        PLAN_LIMIT,
        remainingCredits,
        planData,
        upgradeUserPlan,
        userProfile
    } = useAssessment();

    // Estado para controlar billing period y modal
    const [billingPeriod, setBillingPeriod] = useState('monthly'); // 'monthly' | 'annual'
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);

    const isAnnual = billingPeriod === 'annual';

    // Lógica para determinar el estado del usuario
    const hasStarted = !!planData;
    const currentTier = userProfile?.plan_tier || 'gratis';
    const isBasic = currentTier === 'basic';
    const isPlus = currentTier === 'plus';
    const isUltra = currentTier === 'ultra';

    // Jerarquía de planes
    const tierRank = { gratis: 0, basic: 1, plus: 2, ultra: 3, admin: 4 };
    const currentRank = tierRank[currentTier] || 0;

    // Helper: obtener precio actual según billing period
    const getPrice = (tier) => PRICING[tier]?.[billingPeriod]?.price || '0';
    const getPeriodLabel = (tier) => PRICING[tier]?.[billingPeriod]?.label || '';

    // Manejador del botón Plan Gratis
    const handleFreePlanClick = () => {
        window.scrollTo(0, 0);
        if (hasStarted) {
            navigate('/dashboard');
        } else {
            navigate('/assessment');
        }
    };

    // Manejador del botón Planes Pagos
    const handleUpgradeClick = (tier, name) => {
        const targetRank = tierRank[tier] || 0;

        // Validacion de seguridad (aunque el boton este disabled)
        if (targetRank <= currentRank) {
            window.scrollTo(0, 0);
            navigate('/dashboard');
            return;
        }
        const price = getPrice(tier);
        const periodSuffix = isAnnual ? ' (Anual)' : ' (Mensual)';
        setSelectedPlan({ tier, price, name: name + periodSuffix });
        setIsPaymentOpen(true);
    };

    // Callback que se ejecuta cuando PayPal confirma el pago exitoso (Suscripciones)
    const handlePaymentSuccess = async (tier, subscriptionId) => {
        setIsPaymentOpen(false);
        await upgradeUserPlan(tier, subscriptionId);
        navigate('/dashboard');
    };

    // Texto del botón según estado del usuario
    const getButtonText = (tier) => {
        if (tier === 'gratis') {
            if (currentRank > 0) return "Incluido en tu Plan";
            if (currentRank === 0 && hasStarted) return `Créditos: ${remainingCredits}/${PLAN_LIMIT}`;
            return "Empezar Gratis Ahora";
        }

        const targetRank = tierRank[tier] || 0;
        if (currentTier === tier) return "Tu Plan Actual";
        if (targetRank < currentRank) return "Incluido en tu Plan";
        return `Cambiar a ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
    };

    // Lógica de deshabilitación de botones
    const isButtonDisabled = (tier) => {
        const targetRank = tierRank[tier] || 0;
        // Si el usuario es Gratis, nunca deshabilitar el botón Gratis para que pueda navegar
        if (currentRank === 0 && tier === 'gratis') return false;
        
        // No deshabilitar el plan actual para que puedan hacer clic e ir al dashboard
        if (targetRank === currentRank) return false;
        
        // Para cualquier otro caso, deshabilitar SOLO si el plan visualizado es INFERIOR al actual
        return targetRank < currentRank;
    };

    const disabledStyles = { opacity: 0.5, cursor: 'not-allowed', filter: 'grayscale(100%)' };

    return (
        <section className={styles.pricing}>

            {/* --- MODAL DE PAGO --- */}
            <PaymentModal
                isOpen={isPaymentOpen}
                onClose={() => setIsPaymentOpen(false)}
                onSuccess={(subId) => handlePaymentSuccess(selectedPlan?.tier, subId)}
                price={selectedPlan?.price || "9.99"}
                planName={selectedPlan?.name || "Suscripción Básico"}
                tier={selectedPlan?.tier || "basic"}
            />

            <div className={styles.container}>
                {/* Cabecera de la Sección */}
                <div className={styles.header}>
                    <span className={styles.badge}>Planes Flexibles</span>
                    <h2 className={styles.title}>Invierte en tu Salud</h2>
                    <p className={styles.subtitle}>
                        Comienza gratis y desbloquea todo el potencial de la IA.
                    </p>

                    {/* --- TOGGLE MENSUAL / ANUAL --- */}
                    <div className={styles.billingToggle}>
                        <button
                            className={`${styles.toggleOption} ${!isAnnual ? styles.toggleActive : ''}`}
                            onClick={() => setBillingPeriod('monthly')}
                        >
                            Mensual
                        </button>
                        <button
                            className={`${styles.toggleOption} ${isAnnual ? styles.toggleActive : ''}`}
                            onClick={() => setBillingPeriod('annual')}
                        >
                            Anual
                            <span className={styles.discountBadge}>-25%</span>
                        </button>
                    </div>
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
                                Ideal para probar la plataforma. Planes y recetas con IA incluidos.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>{PLAN_LIMIT} Créditos</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Lista de Compras Automática</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Recetas personalizadas</strong></li>
                            </ul>

                            <button
                                className={styles.btnOutline}
                                onClick={handleFreePlanClick}
                                disabled={isButtonDisabled('gratis')}
                                style={isButtonDisabled('gratis') ? disabledStyles : {}}
                            >
                                {getButtonText('gratis')}
                            </button>
                        </div>
                    </div>

                    {/* --- TARJETA 2: BÁSICO --- */}
                    <div className={styles.card}>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>Básico</h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>USD$</span>
                                <span className={styles.amount}>{getPrice('basic')}</span>
                                <span className={styles.period}>{getPeriodLabel('basic')}</span>
                            </div>

                            <p className={styles.description}>
                                Más créditos, asistente experto y memoria de IA que aprende de ti.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>50 Créditos al mes</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Asistente Experto Nutricional</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Memoria a Largo Plazo</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Aprendizaje Continuo</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Todo lo incluido en Gratis</strong></li>
                                <li><Check size={18} className={styles.check} /> Soporte Prioritario</li>
                            </ul>

                            <button
                                className={styles.btnOutline}
                                onClick={() => handleUpgradeClick('basic', 'Suscripción Básico')}
                                disabled={isButtonDisabled('basic')}
                                style={isButtonDisabled('basic') ? disabledStyles : {}}
                            >
                                {getButtonText('basic')}
                            </button>
                        </div>
                    </div>

                    {/* --- TARJETA 3: PLUS (MÁS POPULAR) --- */}
                    <div className={`${styles.card} ${styles.popular}`}>
                        <div className={styles.popularBadge}>Más Popular</div>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>Plus</h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>USD$</span>
                                <span className={styles.amount}>{getPrice('plus')}</span>
                                <span className={styles.period}>{getPeriodLabel('plus')}</span>
                            </div>

                            <p className={styles.description}>
                                Para quienes buscan resultados serios. Ajustes ilimitados y macros exactos.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>200 Créditos al mes</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Analizador de Macros Exacto</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Progreso en Tiempo Real</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Todo lo incluido en Básico</strong></li>
                                <li><Check size={18} className={styles.check} /> Soporte Prioritario</li>
                            </ul>

                            <button
                                className={styles.btnPrimary}
                                onClick={() => handleUpgradeClick('plus', 'Suscripción Plus')}
                                disabled={isButtonDisabled('plus')}
                                style={isButtonDisabled('plus') ? disabledStyles : {}}
                            >
                                {getButtonText('plus')}
                            </button>
                        </div>
                    </div>

                    {/* --- TARJETA 4: ULTRA (ILIMITADO) --- */}
                    <div className={styles.card}>
                        <div className={styles.cardContent}>
                            <h3 className={styles.planName}>
                                Ultra Ilimitado
                            </h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>USD$</span>
                                <span className={styles.amount}>{getPrice('ultra')}</span>
                                <span className={styles.period}>{getPeriodLabel('ultra')}</span>
                            </div>

                            <p className={styles.description}>
                                Sin límites. Genera, modifica y optimiza todo lo que necesites.
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
                                onClick={() => handleUpgradeClick('ultra', 'Suscripción Ultra Ilimitado')}
                                disabled={isButtonDisabled('ultra')}
                                style={isButtonDisabled('ultra') ? disabledStyles : {}}
                            >
                                {getButtonText('ultra')}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
};

export default Pricing;