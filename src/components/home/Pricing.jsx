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
    const rawTier = (userProfile?.plan_tier || '').toLowerCase().trim(); // Ensure lowercase
    const currentTier = ['gratis', 'basic', 'plus', 'ultra', 'admin'].includes(rawTier) ? rawTier : 'gratis';
    
    const isBasic = currentTier === 'basic';
    const isPlus = currentTier === 'plus';
    const isUltra = currentTier === 'ultra';

    // Jerarquía de planes
    const tierRank = { gratis: 1, basic: 2, plus: 3, ultra: 4, admin: 5 };
    const currentRank = tierRank[currentTier] || 1;

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
        const targetRank = tierRank[tier] || 1;

        // Validacion de seguridad (aunque el boton este disabled)
        if (targetRank <= currentRank) {
            window.scrollTo(0, 0);
            navigate('/dashboard');
            return;
        }
        const price = getPrice(tier);
        const periodSuffix = isAnnual ? ' (Anual)' : ' (Mensual)';
        setSelectedPlan({ tier, price, name: name + periodSuffix, isAnnual });
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
        // Usuario no autenticado
        if (!userProfile?.id) {
            if (tier === 'gratis') return "Empezar Gratis Ahora";
            return `Cambiar a ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
        }

        // Usuario autenticado
        if (currentTier === tier) {
            return "Tu Plan Actual";
        }

        const targetRank = tierRank[tier] || 1;
        
        if (targetRank < currentRank) {
            return "Incluido en tu Plan";
        }
        
        return `Cambiar a ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
    };

    // Lógica de deshabilitación de botones
    const isButtonDisabled = (tier) => {
        // Permitir click si no está autenticado (invitados eligiendo plan)
        if (!userProfile?.id) return false;

        const targetRank = tierRank[tier] || 1;
        
        // Deshabilitar el botón si es el plan actual
        if (currentTier === tier) return true;
        
        // Deshabilitar SOLO si el plan visualizado es INFERIOR al actual
        return targetRank < currentRank;
    };

    const disabledStyles = { opacity: 0.85, cursor: 'not-allowed', filter: 'grayscale(100%)' };

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
                isAnnual={selectedPlan?.isAnnual || false}
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
                                <span className={styles.currency}>USD$</span>
                                <span className={styles.amount}>0</span>
                            </div>
                            <p className={styles.description}>
                                Descubre el poder de la IA. Plan personalizado, recetas y lista de compras incluidos.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>{PLAN_LIMIT} Créditos</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Plan de Comidas con IA</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Recetas Paso a Paso</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Lista de Compras PDF</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Nevera Virtual (Despensa)</strong></li>
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
                                Todo el poder de la IA. Despensa inteligente, macros exactos y rotación autónoma de menús.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>50 Créditos al mes</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Analizador de Macros</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Asistente IA con Visión</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Memoria a Largo Plazo</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Rotación Autónoma de Platos</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Despensa Inteligente</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Seguimiento de Progreso</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Historial de Planes</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Todo lo incluido en Gratis</strong></li>
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
                                Tu nutricionista en tiempo real. Consultas por voz las 24 horas y métricas de salud avanzadas.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>200 Créditos al mes</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Llamadas de Voz con tu Nutricionista IA</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Integración con Apple Health/Fit</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Todo lo incluido en Básico</strong></li>
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
                                Sin límites. Genera, regenera y optimiza todo lo que necesites, cuando quieras.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>Créditos Ilimitados</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Generación Ilimitada de Planes</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Acceso Anticipado a Nuevas Funciones</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Soporte Prioritario VIP</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Todo lo incluido en Plus</strong></li>
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