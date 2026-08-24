import { useState, lazy, Suspense, useEffect } from 'react';
import PropTypes from 'prop-types';
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

// [P2-LANDING-COPY-TRUTH · 2026-08-14] `PRICING` vive en `config/plans.js`.
// Estaba aquí y en `Upgrade.jsx` byte a byte, y ya habían divergido en
// `getMonthlyEquiv`. La subida de precio está agendada: tres copias eran
// tres sitios que editar el día en que más caro sale fallar.

// [ULTRA-MONTHLY-ONLY · 2026-06-19] Ultra no se ofrece en facturación anual —
// siempre se factura mensual. El toggle "Anual" no aplica a esta tarjeta: cae a
// su precio mensual y el checkout fuerza 'monthly'.
// [P1-CREDITS-LADDER + P1-LAUNCH-OFFER · 2026-07-31] Créditos por tier y
// anclaje de precio de lanzamiento — SSOT compartido con Upgrade.jsx.
import {
    ANNUAL_DISABLED_TIERS, LAUNCH_OFFER, TIER_CREDITS, TIER_DISPLAY_NAME,
    creditsVsPredecessor, includesPredecessor,
    PRICING, NAME_BY_TIER, TIER_RANK, isLaunchOfferActive, monthlyEquivalent,
} from '../../config/plans';


// [P2-TIER-DISPLAY-NAME · 2026-07-31] Nombre comercial por tier — SSOT en
// `config/plans.js`, compartido con Upgrade.jsx.
const DISPLAY_BY_TIER = TIER_DISPLAY_NAME;

// [P2-CHECKOUT-PLANCARD · 2026-08-14] Sube a modulo: es una constante (no
// depende de estado) y ahora la necesita tambien `PlanCard`.
const disabledStyles = { opacity: 0.85, cursor: 'not-allowed', filter: 'grayscale(100%)' };

/**
 * [P2-CHECKOUT-PLANCARD · 2026-08-14] Una tarjeta de plan.
 *
 * Las cuatro estaban escritas longhand —~50 líneas casi idénticas cada una—
 * mientras `Upgrade.jsx` ya había extraído su `renderPlanCard`. Este componente
 * cierra esa mitad: la PRESENTACIONAL.
 *
 * ⚠️ PARAMETRIZAR, NO PROMEDIAR. Las cuatro tarjetas NO dicen lo mismo, y esa es
 * justo la trampa de un componente compartido: Gratis no tiene periodo ni
 * equivalente anual ni oferta, Max cambia su nota anual por «solo mensual»
 * (ULTRA-MONTHLY-ONLY) y añade dos bullets propios, y Plus es la única con
 * insignia y botón primario. Por eso lo variable entra como NODOS ya construidos
 * en vez de como banderas que el componente interprete — si mañana una tarjeta
 * necesita algo que ninguna otra tiene, se le pasa, no se le añade un `if` aquí.
 *
 * ⚠️ LO QUE **NO** SE TOCA en este ciclo, y no por falta de ganas: la máquina de
 * checkout (`handleUpgradeClick`, `closePayment`, `handlePaymentSuccess`, la
 * rehidratación desde la URL) sigue duplicada con `Upgrade.jsx`. Es el único
 * camino que factura y acumula ≥4 P-fixes de comportamiento; extraer un
 * `usePlanCheckout` es cambiar deuda de mantenimiento por riesgo en el cobro.
 * El paso previo —tests que monten este componente— ya existe
 * (`Pricing.p2_checkout_characterization.test.jsx`); el hook viene después.
 */
const PlanCard = ({ name, popular = false, priceNode, noteNode, description, features, cta }) => (
    <div className={popular ? `${styles.card} ${styles.popular}` : styles.card}>
        {popular && <div className={styles.popularBadge}>Más Popular</div>}
        <div className={styles.cardContent}>
            <h3 className={styles.planName}>{name}</h3>
            <div className={styles.price}>{priceNode}</div>
            {noteNode}
            <p className={styles.description}>{description}</p>
            <ul className={styles.features}>
                {features.map((f, i) => (
                    <li key={i}><Check size={18} className={styles.check} /> <strong>{f}</strong></li>
                ))}
            </ul>
            <button
                className={cta.primary ? styles.btnPrimary : styles.btnOutline}
                onClick={cta.onClick}
                disabled={cta.disabled}
                style={cta.disabled ? disabledStyles : {}}
            >
                {cta.label}
            </button>
        </div>
    </div>
);

PlanCard.propTypes = {
    name: PropTypes.node.isRequired,
    popular: PropTypes.bool,
    priceNode: PropTypes.node.isRequired,
    noteNode: PropTypes.node,
    description: PropTypes.node.isRequired,
    features: PropTypes.arrayOf(PropTypes.node).isRequired,
    cta: PropTypes.shape({
        label: PropTypes.node,
        onClick: PropTypes.func,
        disabled: PropTypes.bool,
        primary: PropTypes.bool,
    }).isRequired,
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

    // [P2-LANDING-COPY-TRUTH · 2026-08-14] La urgencia se evalúa contra la FECHA,
    // no contra un booleano que alguien tendría que acordarse de bajar. Se calcula
    // una vez por render: pasada la medianoche del 15 en RD, las tarjetas dejan de
    // anunciar una subida que ya ocurrió.
    const ofertaViva = isLaunchOfferActive();

    // Lógica para determinar el estado del usuario
    const hasStarted = !!planData;
    const rawTier = (userProfile?.plan_tier || '').toLowerCase().trim(); // Ensure lowercase
    const currentTier = ['gratis', 'basic', 'plus', 'ultra', 'admin'].includes(rawTier) ? rawTier : 'gratis';
    
    // Jerarquía de planes
    const currentRank = TIER_RANK[currentTier] || 1;

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
    // [P2-LANDING-COPY-TRUTH] Antes devolvía el equivalente SIEMPRE, incluso para
    // un tier sin anual. Se unifica en la variante de `Upgrade.jsx`, que pregunta
    // primero si el tier ofrece anual.
    const getMonthlyEquiv = (tier) => (isAnnualForTier(tier) ? monthlyEquivalent(tier) : null);

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
        const targetRank = TIER_RANK[tier] || 1;

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
    const handlePaymentSuccess = async (tier, subscriptionId, couponCode = null) => {
        // [P1-PAY-LIMBO · 2026-05-30] Esperar el resultado antes de cerrar el
        // modal y navegar. Si /subscription/verify falla tras un cobro PayPal
        // real, navegar incondicionalmente dejaba al usuario como gratis pero
        // suscrito (limbo). El modal queda visible durante la verificación
        // (cierra el P2 de timing) y solo navegamos en éxito; en fallo el
        // toast.error de upgradeUserPlan informa y el usuario reintenta.
        const ok = await upgradeUserPlan(tier, subscriptionId, couponCode);
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

        const targetRank = TIER_RANK[tier] || 1;

        if (targetRank < currentRank) {
            return "Incluido en tu Plan";
        }

        // [P2-TIER-DISPLAY-NAME · 2026-07-31] Nombre COMERCIAL, no la clave
        // interna: capitalizar `ultra` ofrecía "Cambiar a Ultra" bajo una
        // tarjeta titulada "Max" (y "Basic" bajo "Básico").
        return `Cambiar a ${DISPLAY_BY_TIER[tier] || tier}`;
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
        if (tier === 'gratis') return currentRank > TIER_RANK.gratis;

        const targetRank = TIER_RANK[tier] || 1;

        // Deshabilitar el botón si es el plan actual
        if (currentTier === tier) return true;

        // Deshabilitar SOLO si el plan visualizado es INFERIOR al actual
        return targetRank < currentRank;
    };


    return (
        <section className={styles.pricing} id="pricing">

            {/* --- MODAL DE PAGO --- [P5-SPEED-PAYMENTMODAL-LAZY · 2026-06-01]
                gate por isPaymentOpen + Suspense → el chunk lazy se baja al abrir. */}
            {isPaymentOpen && (
                <Suspense fallback={null}>
                    <PaymentModal
                        isOpen={isPaymentOpen}
                        onClose={closePayment}
                        onSuccess={(subId, coupon) => handlePaymentSuccess(selectedPlan?.tier, subId, coupon)}
                        price={selectedPlan?.price || "9.99"}
                        planName={selectedPlan?.name || "Suscripción Básico"}
                        tier={selectedPlan?.tier || "basic"}
                        isAnnual={selectedPlan?.isAnnual || false}
                        userId={session?.user?.id}
                        pricingMode={planData?._pricing_mode || null}
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

                    {/* [P2-CHECKOUT-PLANCARD · 2026-08-14] Las cuatro tarjetas eran
                        ~50 lineas casi identicas cada una. Ahora son DATOS: lo que de
                        verdad las distingue queda a la vista de un vistazo, en lugar de
                        enterrado en cuatro bloques de JSX que habia que comparar a mano.
                        Los nodos van construidos aqui -- no banderas que `PlanCard`
                        interprete -- para que una tarjeta pueda ser distinta sin
                        anadirle un `if` al componente. */}
                    {[
                        {
                            tier: 'gratis',
                            name: 'Gratis',
                            priceNode: (<>
                                <span className={styles.currency}>USD$</span>
                                <span className={styles.amount}>0</span>
                            </>),
                            /* [P3-PRICING-HONEST-COPY · 2026-07-12] Directiva del owner:
                               Gratis accede a TODAS las funciones (por ahora) — los tiers
                               se diferencian solo por creditos; Max no cambia. */
                            description: 'Empieza con todo: plan completo, recetas, asistente y nevera. Gratis.',
                            features: [
                                <>{PLAN_LIMIT} Créditos</>, 'Plan de Comidas con IA',
                                'Recetas Paso a Paso', 'Lista de Compras PDF',
                                'Analizador de Macros', 'Asistente IA con Visión',
                                'Nevera Inteligente', 'Seguimiento de Progreso',
                                'Todas las funciones incluidas',
                            ],
                            cta: { onClick: handleFreePlanClick },
                        },
                        {
                            tier: 'basic',
                            name: 'Básico',
                            description: 'Más créditos para regenerar platos y días sin miedo a quedarte corto.',
                            /* [P2-LADDER-VS-PREDECESSOR · 2026-07-31] Salto contra el
                               escalon anterior, derivado de TIER_CREDITS. */
                            features: [
                                <>{TIER_CREDITS.basic} Créditos al mes</>,
                                creditsVsPredecessor('basic'), includesPredecessor('basic'),
                            ],
                            cta: { onClick: () => handleUpgradeClick('basic', NAME_BY_TIER.basic) },
                        },
                        {
                            tier: 'plus',
                            name: 'Plus',
                            popular: true,
                            description: 'Combustible de sobra: ajusta, regenera y experimenta toda la semana.',
                            features: [
                                <>{TIER_CREDITS.plus} Créditos al mes</>,
                                creditsVsPredecessor('plus'), includesPredecessor('plus'),
                            ],
                            cta: { primary: true, onClick: () => handleUpgradeClick('plus', NAME_BY_TIER.plus) },
                        },
                        {
                            tier: 'ultra',
                            name: 'Max',
                            /* [P1-CREDITS-LADDER · 2026-07-31] Max ya NO vende "ilimitado":
                               500/mes acotado (paridad backend). El diferenciador real: el
                               tope mas alto + acceso anticipado + VIP. */
                            description: 'El tope más alto: para quien ajusta y optimiza su plan todos los días.',
                            features: [
                                <>{TIER_CREDITS.ultra} Créditos al mes</>,
                                creditsVsPredecessor('ultra'),
                                'Acceso Anticipado a Nuevas Funciones',
                                'Soporte Prioritario VIP',
                                includesPredecessor('ultra'),
                            ],
                            cta: { onClick: () => handleUpgradeClick('ultra', NAME_BY_TIER.ultra) },
                            /* [ULTRA-MONTHLY-ONLY · 2026-06-19] Ultra no tiene plan anual:
                               con el toggle en "Anual" se aclara que se factura mensual. */
                            notaAnual: 'Disponible solo en facturación mensual',
                        },
                    ].map((plan) => {
                        const dePago = plan.tier !== 'gratis';
                        const equiv = getMonthlyEquiv(plan.tier);
                        return (
                            <PlanCard
                                key={plan.tier}
                                name={plan.name}
                                popular={plan.popular}
                                priceNode={plan.priceNode || (<>
                                    <span className={styles.currency}>USD$</span>
                                    <span className={styles.amount}>{getPrice(plan.tier)}</span>
                                    <span className={styles.period}>{getPeriodLabel(plan.tier)}</span>
                                </>)}
                                noteNode={dePago && (
                                    <>
                                        {isAnnual && (plan.notaAnual
                                            ? <p className={styles.monthlyEquiv}>{plan.notaAnual}</p>
                                            : equiv && <p className={styles.monthlyEquiv}>≈ USD${equiv}/mes, facturado anual</p>
                                        )}
                                        {/* [P1-LAUNCH-OFFER · 2026-07-31] Precio futuro tachado +
                                            fecha de subida (solo vista mensual). ⚠️ La subida debe
                                            ser real — ver config/plans.js. */}
                                        {!isAnnual && ofertaViva && (
                                            <p className={styles.monthlyEquiv}>
                                                <s>USD${LAUNCH_OFFER.futureMonthly[plan.tier]}</s> · Precio de lanzamiento — sube el {LAUNCH_OFFER.deadlineLabel}
                                            </p>
                                        )}
                                    </>
                                )}
                                description={plan.description}
                                features={plan.features}
                                cta={{
                                    ...plan.cta,
                                    label: getButtonText(plan.tier),
                                    disabled: isButtonDisabled(plan.tier),
                                }}
                            />
                        );
                    })}

                </div>
            </div>
        </section>
    );
};

export default Pricing;