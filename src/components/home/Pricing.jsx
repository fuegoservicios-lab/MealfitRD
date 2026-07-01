import { useState, lazy, Suspense, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

// [ULTRA-MONTHLY-ONLY · 2026-06-19] Ultra no se ofrece en facturación anual —
// siempre se factura mensual. El toggle "Anual" no aplica a esta tarjeta: cae a
// su precio mensual y el checkout fuerza 'monthly'.
const ANNUAL_DISABLED_TIERS = new Set(['ultra']);

// [PAY-MODAL-PERSIST · 2026-06-18] Nombre de plan por tier (SSOT local) para
// re-derivar el `name` del modal al rehidratarlo desde la URL tras un refresh.
const NAME_BY_TIER = {
    basic: 'Suscripción Básico',
    plus: 'Suscripción Plus',
    ultra: 'Suscripción Max',
};

const Pricing = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const {
        PLAN_LIMIT,
        planData,
        upgradeUserPlan,
        userProfile,
        isGuest,
        session,
        loadingAuth,
    } = useAssessment();

    // Estado para controlar billing period y modal
    const [billingPeriod, setBillingPeriod] = useState('monthly'); // 'monthly' | 'annual'
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);

    const isAnnual = billingPeriod === 'annual';

    // [ULTRA-MONTHLY-ONLY · 2026-06-19] Anual efectivo POR tier: Ultra queda
    // excluido del anual aunque el toggle global esté en "Anual".
    const isAnnualForTier = (tier) => isAnnual && !ANNUAL_DISABLED_TIERS.has(tier);

    // Lógica para determinar el estado del usuario
    const hasStarted = !!planData;
    const rawTier = (userProfile?.plan_tier || '').toLowerCase().trim(); // Ensure lowercase
    const currentTier = ['gratis', 'basic', 'plus', 'ultra', 'admin'].includes(rawTier) ? rawTier : 'gratis';
    
    // Jerarquía de planes
    const tierRank = { gratis: 1, basic: 2, plus: 3, ultra: 4, admin: 5 };
    const currentRank = tierRank[currentTier] || 1;

    // [P2-PRICING-PROFILE-LOADING · 2026-05-31] Mientras userProfile no hidrate,
    // tratamos los botones como "cargando" (disabled) en vez de la rama invitado
    // que mostraba upgrades/downgrades activos e incorrectos durante la ventana
    // de carga (un usuario Plus/Ultra veía todas las tarjetas pagas clickeables).
    // [P1-GUEST-PRICING · 2026-06-21] PERO un INVITADO nunca tiene userProfile (no
    // hidrata jamás) → sin el guard de isGuest los botones quedaban atascados en
    // "Cargando…" para siempre. Para invitado el estado está RESUELTO (no hay perfil
    // que cargar): isProfileLoading=false → muestra "Invitado"/CTA de registro.
    // [P1-PRICING-ANON-LOADING · 2026-07-01] El guard `!isGuest` NO cubría al visitante
    // ANÓNIMO (sin sesión Y sin modo invitado): `isGuest = !session && guestFlag` es false
    // para él, así que `!isGuest && !userProfile?.id` quedaba true → los 4 botones decían
    // "Cargando…" para siempre (todo visitante frío que scrollea a precios lo veía roto).
    // Fix: "Cargando…" SOLO mientras la auth resuelve (`loadingAuth`, ventana breve común
    // a todos) O cuando ya hay sesión pero el perfil aún no hidrata (carga real del usuario
    // logueado). Una vez resuelta la auth sin sesión, `noSession` (anónimo O invitado)
    // resuelve a los CTA de gratis/registro — ninguno tiene perfil que esperar. El
    // `loadingAuth ||` evita además que un logueado parpadee el CTA anónimo en el mount.
    const noSession = !session;
    const isProfileLoading = loadingAuth || (!noSession && !userProfile?.id);

    // Helper: obtener precio actual según billing period (tier-aware: Ultra
    // siempre mensual, ver ANNUAL_DISABLED_TIERS).
    const getPrice = (tier) => PRICING[tier]?.[isAnnualForTier(tier) ? 'annual' : 'monthly']?.price || '0';
    const getPeriodLabel = (tier) => PRICING[tier]?.[isAnnualForTier(tier) ? 'annual' : 'monthly']?.label || '';
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
        // [P1-GUEST-PRICING · 2026-06-21 · P1-PRICING-ANON-LOADING 2026-07-01] Sin sesión
        // (invitado O visitante anónimo) debe crear cuenta antes de suscribirse (el
        // checkout/verify requiere auth). Redirige a registro. Antes solo cubría `isGuest`;
        // un anónimo caía al checkout sin auth y el verify fallaba.
        if (noSession) {
            window.scrollTo(0, 0);
            navigate('/register');
            return;
        }
        const targetRank = tierRank[tier] || 1;

        // Validacion de seguridad (aunque el boton este disabled)
        if (targetRank <= currentRank) {
            window.scrollTo(0, 0);
            navigate('/dashboard');
            return;
        }
        const price = getPrice(tier);
        // [ULTRA-MONTHLY-ONLY · 2026-06-19] El periodo efectivo del checkout es
        // tier-aware: Ultra siempre 'monthly' aunque el toggle esté en "Anual".
        const annual = isAnnualForTier(tier);
        const periodSuffix = annual ? ' (Anual)' : ' (Mensual)';
        setSelectedPlan({ tier, price, name: name + periodSuffix, isAnnual: annual });
        setIsPaymentOpen(true);
        // [PAY-MODAL-PERSIST · 2026-06-18] Persistir el checkout en la URL para que
        // sobreviva un refresh (re-abre el modal en mount). replace → no ensucia el
        // history con cada click ni dispara el landing-skip POP.
        setSearchParams((prev) => {
            const p = new URLSearchParams(prev);
            p.set('checkout', tier);
            p.set('billing', annual ? 'annual' : 'monthly');
            return p;
        }, { replace: true });
    };

    // [PAY-MODAL-PERSIST · 2026-06-18] Cierre centralizado del checkout: baja el
    // modal, limpia el plan y BORRA ?checkout/?billing de la URL (replace → no
    // ensucia history ni dispara el landing-skip POP). Un refresh posterior NO
    // re-abre el modal.
    const closePayment = () => {
        setIsPaymentOpen(false);
        setSelectedPlan(null);
        setSearchParams((prev) => {
            const p = new URLSearchParams(prev);
            p.delete('checkout');
            p.delete('billing');
            return p;
        }, { replace: true });
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
        if (ok) {
            // Éxito: el cambio de ruta a /dashboard descarta los params de '/'.
            navigate('/dashboard');
        } else {
            // [PAY-MODAL-PERSIST · 2026-06-18 · FIX-B1] Fallo de verify: el usuario
            // se queda en la ruta → cerrar el modal Y limpiar los params; si no, un
            // refresh re-abriría un checkout que ya falló.
            closePayment();
        }
    };

    // [PAY-MODAL-PERSIST · 2026-06-18 · FIX-B2] Rehidratar el checkout tras un
    // refresh: si la URL trae ?checkout=<tier>, re-abre el modal con el mismo plan.
    // MOUNT-ONLY (deps []) leyendo searchParams por closure → corre 1 vez por
    // montaje (= 1 vez por refresh); cerrar el modal NUNCA lo re-dispara. NO valida
    // rank ni navega (el cobro real lo deriva el backend del plan_id de PayPal,
    // I-Billing-1); solo valida que el tier sea conocido.
    useEffect(() => {
        const t = searchParams.get('checkout');
        const b = searchParams.get('billing');
        if (!['basic', 'plus', 'ultra'].includes(t)) {
            if (t !== null || b !== null) {
                setSearchParams((prev) => {
                    const p = new URLSearchParams(prev);
                    p.delete('checkout');
                    p.delete('billing');
                    return p;
                }, { replace: true });
            }
            return;
        }
        // [ULTRA-MONTHLY-ONLY · 2026-06-19] Un link viejo con ?billing=annual para
        // un tier sin anual (Ultra) NO debe re-abrir un checkout anual: forzar mensual.
        const annual = b === 'annual' && !ANNUAL_DISABLED_TIERS.has(t);
        setBillingPeriod(annual ? 'annual' : 'monthly');
        setSelectedPlan({
            tier: t,
            price: PRICING[t][annual ? 'annual' : 'monthly'].price,
            name: NAME_BY_TIER[t] + (annual ? ' (Anual)' : ' (Mensual)'),
            isAnnual: annual,
        });
        setIsPaymentOpen(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Texto del botón según estado del usuario
    const getButtonText = (tier) => {
        // Ventana de carga: sesión presente pero perfil aún sin hidratar.
        if (isProfileLoading) return "Cargando…";

        // [P1-GUEST-PRICING · 2026-06-21 · P1-PRICING-ANON-LOADING 2026-07-01] Sin sesión:
        // el plan Gratis es una etiqueta de estado para el invitado ("Invitado") o un CTA
        // de conversión para el visitante anónimo ("Empezar Gratis Ahora"); los planes
        // pagos, en ambos casos, invitan a crear cuenta (el checkout requiere auth).
        if (noSession) {
            if (tier === 'gratis') return isGuest ? 'Invitado' : 'Empezar Gratis Ahora';
            return 'Crear cuenta';
        }

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

        // [P1-GUEST-PRICING · 2026-06-21 · P1-PRICING-ANON-LOADING 2026-07-01] Sin sesión:
        // el Gratis del invitado es etiqueta de estado ('Invitado' → disabled); el Gratis
        // del anónimo es CTA de conversión ('Empezar Gratis' → clickeable); los planes
        // pagos siempre clickeables (CTA de registro) en ambos casos.
        if (noSession) return isGuest && tier === 'gratis';

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
                        onClose={closePayment}
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
                                Tu nutricionista IA en tiempo real, disponible 24/7, con métricas de salud avanzadas.
                            </p>

                            <ul className={styles.features}>
                                <li><Check size={18} className={styles.check} /> <strong>200 Créditos al mes</strong></li>
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
                                Max
                            </h3>
                            <div className={styles.price}>
                                <span className={styles.currency}>USD$</span>
                                <span className={styles.amount}>{getPrice('ultra')}</span>
                                <span className={styles.period}>{getPeriodLabel('ultra')}</span>
                            </div>
                            {/* [ULTRA-MONTHLY-ONLY · 2026-06-19] Ultra no tiene plan anual:
                                cuando el toggle está en "Anual" aclaramos que se factura mensual. */}
                            {isAnnual && (
                                <p className={styles.monthlyEquiv}>Disponible solo en facturación mensual</p>
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
                                onClick={() => handleUpgradeClick('ultra', 'Suscripción Max')}
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