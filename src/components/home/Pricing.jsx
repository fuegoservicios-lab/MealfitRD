import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';
import { Check } from 'lucide-react';
import styles from './Pricing.module.css';
// [P5-SPEED-PAYMENTMODAL-LAZY · 2026-06-01] PaymentModal arrastra el wrapper
// @paypal/react-paypal-js (chunk ~22KB). Como Pricing se importa al cargar el
// landing (Home), el import estático emitía un <link modulepreload> de ese chunk
// en cada visita al landing aunque el 99% de los visitantes nunca abre el modal.
// Lazy + gate por `isPaymentOpen` → el chunk se baja solo al abrir el checkout.
// PaymentModal ya retornaba null cuando !isOpen (y solo entonces monta el
// PayPalScriptProvider), así que el comportamiento visible es idéntico.
const PaymentModal = lazy(() => import('../../components/dashboard/PaymentModal'));

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
    
    // Jerarquía de planes
    const tierRank = { gratis: 1, basic: 2, plus: 3, ultra: 4, admin: 5 };
    const currentRank = tierRank[currentTier] || 1;

    // [P2-PRICING-PROFILE-LOADING · 2026-05-31] El landing siempre vive tras
    // ProtectedRoute (no existe invitado real). Mientras userProfile no hidrate,
    // tratamos los botones como "cargando" (disabled) en vez de la rama invitado
    // que mostraba upgrades/downgrades activos e incorrectos durante la ventana
    // de carga (un usuario Plus/Ultra veía todas las tarjetas pagas clickeables).
    const isProfileLoading = !userProfile?.id;

    // Helper: obtener precio actual según billing period
    const getPrice = (tier) => PRICING[tier]?.[billingPeriod]?.price || '0';
    const getPeriodLabel = (tier) => PRICING[tier]?.[billingPeriod]?.label || '';
    const getMonthlyEquiv = (tier) => PRICING[tier]?.annual?.monthlyEquiv;

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
        // [P1-PAY-LIMBO · 2026-05-30] Esperar el resultado antes de cerrar el
        // modal y navegar. Si /subscription/verify falla tras un cobro PayPal
        // real, navegar incondicionalmente dejaba al usuario como gratis pero
        // suscrito (limbo). El modal queda visible durante la verificación
        // (cierra el P2 de timing) y solo navegamos en éxito; en fallo el
        // toast.error de upgradeUserPlan informa y el usuario reintenta.
        const ok = await upgradeUserPlan(tier, subscriptionId);
        setIsPaymentOpen(false);
        if (ok) navigate('/dashboard');
    };

    // Texto del botón según estado del usuario
    const getButtonText = (tier) => {
        // Ventana de carga: sesión presente pero perfil aún sin hidratar.
        if (isProfileLoading) return "Cargando…";

        // Plan Gratis: CTA de adquisición del usuario gratis sin plan (el target
        // de conversión). Antes este botón quedaba "Tu Plan Actual" + disabled
        // para el usuario gratis → CTA muerto en la tarjeta dirigida a él.
        if (tier === 'gratis') {
            if (currentTier === 'gratis') return hasStarted ? "Ir a mi Panel" : "Empezar Gratis Ahora";
            return "Incluido en tu Plan"; // ya pagó un tier superior
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
        // Durante la carga del perfil, deshabilitar para no exponer acciones erróneas.
        if (isProfileLoading) return true;

        // Gratis: solo deshabilitado si el usuario YA pagó un tier superior;
        // nunca para el usuario gratis (su CTA de conversión debe ser clickeable).
        if (tier === 'gratis') return currentRank > tierRank.gratis;

        const targetRank = tierRank[tier] || 1;

        // Deshabilitar el botón si es el plan actual
        if (currentTier === tier) return true;

        // Deshabilitar SOLO si el plan visualizado es INFERIOR al actual
        return targetRank < currentRank;
    };

    const disabledStyles = { opacity: 0.85, cursor: 'not-allowed', filter: 'grayscale(100%)' };

    return (
        <section className={styles.pricing} id="pricing">

            {/* --- MODAL DE PAGO --- [P5-SPEED-PAYMENTMODAL-LAZY · 2026-06-01]
                gate por isPaymentOpen + Suspense → el chunk lazy se baja al abrir. */}
            {isPaymentOpen && (
                <Suspense fallback={null}>
                    <PaymentModal
                        isOpen={isPaymentOpen}
                        onClose={() => setIsPaymentOpen(false)}
                        onSuccess={(subId) => handlePaymentSuccess(selectedPlan?.tier, subId)}
                        price={selectedPlan?.price || "9.99"}
                        planName={selectedPlan?.name || "Suscripción Básico"}
                        tier={selectedPlan?.tier || "basic"}
                        isAnnual={selectedPlan?.isAnnual || false}
                    />
                </Suspense>
            )}

            <div className={styles.container}>
                {/* Cabecera de la Sección */}
                <div className={styles.header}>
                    <span className={styles.badge}>Planes Flexibles</span>
                    <h2 className={styles.title}>Invierte en tu Salud</h2>
                    <p className={styles.subtitle}>
                        Comienza gratis y desbloquea todo el potencial de la IA.
                    </p>

                    {/* --- TOGGLE MENSUAL / ANUAL --- */}
                    {/* [P2-A11Y-LOGGING · 2026-05-13] role="group" + aria-label
                        en el contenedor + aria-pressed por botón para que
                        lectores de pantalla anuncien el estado seleccionado.
                        Sin esto, ambos botones se anuncian igual (visual
                        active vía className es invisible a la AT). */}
                    <div className={styles.billingToggle} role="group" aria-label="Periodo de facturación">
                        <button
                            className={`${styles.toggleOption} ${!isAnnual ? styles.toggleActive : ''}`}
                            onClick={() => setBillingPeriod('monthly')}
                            aria-pressed={!isAnnual}
                        >
                            Mensual
                        </button>
                        <button
                            className={`${styles.toggleOption} ${isAnnual ? styles.toggleActive : ''}`}
                            onClick={() => setBillingPeriod('annual')}
                            aria-pressed={isAnnual}
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
                                Descubre el poder de la IA. Plan personalizado con aprendizaje continuo y recetas paso a paso.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>{PLAN_LIMIT} Créditos</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Plan de Comidas con IA</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Recetas Paso a Paso</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Lista de Compras PDF</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Analizador de Macros</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Asistente IA con Visión</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Nevera Inteligente</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Aprendizaje a Corto Plazo</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Seguimiento de Progreso</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Historial de Planes</strong></li>
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
                            {isAnnual && (
                                <p className={styles.monthlyEquiv}>≈ USD${getMonthlyEquiv('basic')}/mes, facturado anual</p>
                            )}

                            <p className={styles.description}>
                                Para quienes quieren más capacidad. Más créditos al mes y memoria a largo plazo para escalar tu progreso.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>50 Créditos al mes</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Memoria a Largo Plazo</strong></li>
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
                            {isAnnual && (
                                <p className={styles.monthlyEquiv}>≈ USD${getMonthlyEquiv('plus')}/mes, facturado anual</p>
                            )}

                            <p className={styles.description}>
                                Tu nutricionista en tiempo real. Consultas por voz las 24 horas y métricas de salud avanzadas.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>200 Créditos al mes</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Llamadas de Voz con tu Nutricionista IA</strong></li>
                                <li><Check size={18} className={styles.check} /> <strong>Memoria Infinita</strong></li>
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
                            {isAnnual && (
                                <p className={styles.monthlyEquiv}>≈ USD${getMonthlyEquiv('ultra')}/mes, facturado anual</p>
                            )}

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