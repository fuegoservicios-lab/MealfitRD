/**
 * [P3-UPGRADE-PAGE-V2 · 2026-05-26] Página dedicada de comparación de planes
 * para el usuario logueado del dashboard.
 *
 * Decisión de diseño (vs P3-UPGRADE-PAGE inicial que reusaba `<Pricing />`
 * de la landing): sustituido por componente standalone con UX
 * dashboard-native. Razones:
 *   - El componente landing prioriza copy de marketing (badges "Más Popular",
 *     descripciones largas, CTA "Empezar gratis"). El usuario logueado ya
 *     pasó el funnel — necesita densidad informativa.
 *   - Aquí destacamos: créditos restantes del mes, plan actual con border
 *     verde y badge "TU PLAN", tabla comparativa feature-by-feature (cero
 *     en landing), FAQ billing, trust badges PayPal+SSL.
 *   - Pricing.jsx sigue siendo SSOT de la landing — sin cambios.
 *
 * Estructura:
 *   1. Sticky header con back-link.
 *   2. Hero personalizado (badge "Planes Flexibles", título gradient).
 *   3. UserContextCard: plan actual + créditos restantes del mes.
 *   4. Toggle Mensual/Anual con badge -25%.
 *   5. PlansGrid (4 cards: Gratis/Básico/Plus/Ultra) — plan actual o más
 *      popular destacado con border colorido + badge top.
 *   6. ComparativeTable feature-by-feature (12 features × 4 planes).
 *   7. FAQ accordion (6 preguntas billing/cancelación).
 *   8. TrustBadges (4 items: PayPal SSL Garantía CancelAnytime).
 *   9. FooterLinks (Privacy / Terms / Soporte).
 *
 * Reusos:
 *   - PaymentModal sin cambios (mismo flujo PayPal).
 *   - upgradeUserPlan del context para post-pago.
 *   - PRICING + tierRank locales (consistentes con Pricing.jsx).
 */
import React, { useState, lazy, Suspense, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAssessment } from '../context/AssessmentContext';
import {
    ArrowLeft, Check, X, Zap, ChevronDown,
    ShieldCheck, RefreshCw, CreditCard, BadgeCheck,
    Infinity as InfinityIcon,
} from 'lucide-react';
import styles from './Upgrade.module.css';
// [P5-SPEED-PAYMENTMODAL-LAZY · 2026-06-01] lazy + gate por isPaymentOpen → el
// chunk de PaymentModal (wrapper PayPal ~22KB) se baja al abrir el checkout, no al
// montar esta página lazy. Comportamiento idéntico (PaymentModal ya devolvía null
// y montaba el PayPalScriptProvider solo cuando isOpen).
const PaymentModal = lazy(() => import('../components/dashboard/PaymentModal'));

/* ============================================================
   CONFIG: precios + features (SSOT local de esta página)
   ============================================================ */

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

const TIER_RANK = { gratis: 1, basic: 2, plus: 3, ultra: 4, admin: 5 };

// [ULTRA-MONTHLY-ONLY · 2026-06-19] Ultra no se ofrece en facturación anual —
// siempre mensual. El toggle "Anual" no aplica a esta tarjeta. (= Pricing.jsx)
const ANNUAL_DISABLED_TIERS = new Set(['ultra']);

// [PAY-MODAL-PERSIST · 2026-06-18] Nombre de plan por tier (SSOT local, = ctaName de
// renderPlanCard) para re-derivar el `name` del modal al rehidratarlo desde la URL
// tras un refresh.
const NAME_BY_TIER = {
    basic: 'Suscripción Básico',
    plus: 'Suscripción Plus',
    ultra: 'Suscripción Max',
};

const PLAN_SUMMARY = {
    gratis: {
        description: 'Descubre el poder de la IA. Plan personalizado con aprendizaje continuo.',
        features: [
            '15 Créditos al mes',
            'Plan de Comidas con IA',
            'Recetas Paso a Paso',
            'Lista de Compras PDF',
            'Asistente IA con Visión',
            'Nevera Inteligente',
        ],
    },
    basic: {
        description: 'Para quienes quieren más capacidad. Más créditos y memoria a largo plazo.',
        features: [
            '50 Créditos al mes',
            'Memoria a Largo Plazo',
            'Todo lo incluido en Gratis',
        ],
    },
    plus: {
        description: 'Tu nutricionista IA en tiempo real, con métricas avanzadas.',
        features: [
            '200 Créditos al mes',
            'Memoria Infinita',
            'Todo lo incluido en Básico',
        ],
    },
    ultra: {
        description: 'Sin límites. Genera, regenera y optimiza todo lo que necesites.',
        features: [
            'Créditos Ilimitados',
            'Generación Ilimitada de Planes',
            'Acceso Anticipado a Funciones',
            'Soporte Prioritario VIP',
            'Todo lo incluido en Plus',
        ],
    },
};

/* ============================================================
   CONFIG: tabla comparativa feature-by-feature
   ============================================================ */

const COMP_FEATURES = [
    {
        category: 'Créditos & Generación',
        rows: [
            {
                name: 'Créditos de IA al mes',
                desc: 'Cada generación de plan consume 1 crédito',
                values: { gratis: '15', basic: '50', plus: '200', ultra: '∞' },
            },
            {
                name: 'Regenerar plato individual',
                desc: 'Cambiar un plato sin regenerar el plan completo',
                values: { gratis: true, basic: true, plus: true, ultra: true },
            },
            {
                name: 'Regenerar plan completo',
                desc: 'Generar plan desde cero con nueva configuración',
                values: { gratis: 'Limitado', basic: 'Limitado', plus: '✓', ultra: '∞' },
            },
        ],
    },
    {
        category: 'Inteligencia & Aprendizaje',
        rows: [
            {
                name: 'Asistente IA con Visión',
                desc: 'Sube fotos de comida y el agente las analiza',
                values: { gratis: true, basic: true, plus: true, ultra: true },
            },
            {
                name: 'Memoria a Largo Plazo',
                desc: 'El agente recuerda tus preferencias y ajustes',
                values: { gratis: false, basic: true, plus: true, ultra: true },
            },
            {
                name: 'Memoria Infinita',
                desc: 'Sin truncamiento del historial conversacional',
                values: { gratis: false, basic: false, plus: true, ultra: true },
            },
        ],
    },
    {
        category: 'Tracking & Métricas',
        rows: [
            {
                name: 'Nevera Inteligente',
                desc: 'Inventario sincronizado con tus compras',
                values: { gratis: true, basic: true, plus: true, ultra: true },
            },
            {
                name: 'Analizador de Macros',
                desc: 'Desglose de calorías y macronutrientes',
                values: { gratis: true, basic: true, plus: true, ultra: true },
            },
            // [P1-PHANTOM-FEATURE · 2026-05-31] 'Integración Apple Health/Fit'
            // eliminada: no existe implementación (cero HealthKit/Google Fit en el
            // codebase) y es arquitectónicamente imposible en una PWA pura (sin
            // wrapper nativo Capacitor/Cordova). Vendida con ✓ en un plan de pago =
            // riesgo de reembolsos/disputas. Reintroducir solo cuando exista de verdad.
        ],
    },
    {
        category: 'Soporte & Acceso',
        rows: [
            {
                name: 'Historial de Planes',
                desc: 'Revisa planes pasados y métricas evolutivas',
                values: { gratis: true, basic: true, plus: true, ultra: true },
            },
            {
                name: 'Acceso Anticipado',
                desc: 'Prueba nuevas funciones antes que nadie',
                values: { gratis: false, basic: false, plus: false, ultra: true },
            },
            {
                name: 'Soporte Prioritario VIP',
                desc: 'Respuesta < 24h con técnico dedicado',
                values: { gratis: false, basic: false, plus: false, ultra: true },
            },
        ],
    },
];

/* ============================================================
   CONFIG: FAQ
   ============================================================ */

const FAQ_ITEMS = [
    {
        q: '¿Puedo cancelar en cualquier momento?',
        a: 'Sí. Tu suscripción se puede cancelar desde Ajustes en un click, sin penalización ni preguntas. Mantienes acceso al plan hasta el final del período facturado.',
    },
    {
        q: '¿Qué pasa cuando se acaban mis créditos del mes?',
        a: 'Los créditos se reinician automáticamente cada mes el día de tu fecha de inicio. Si necesitas más antes, puedes hacer upgrade a un plan superior y la diferencia se prorratea.',
    },
    {
        q: '¿Ofrecen reembolsos?',
        a: 'Las suscripciones no son reembolsables, salvo donde la ley lo exija. Puedes cancelar cuando quieras: detienes las renovaciones y conservas el acceso hasta el fin del período ya pagado. Dudas: fuego.servicios@gmail.com.',
    },
    {
        q: '¿Por qué Anual cuesta menos?',
        a: 'Al pagar 12 meses por adelantado obtienes ~25% de descuento vs mensual. Es nuestra forma de premiar el compromiso largo plazo + reduce nuestros costos de procesamiento de pagos.',
    },
    {
        q: '¿Puedo cambiar entre planes?',
        a: 'Sí, en cualquier momento. Si haces upgrade, pagas la diferencia prorrateada y los créditos extra están disponibles inmediatamente. Si haces downgrade, el cambio aplica al inicio del siguiente período.',
    },
    {
        q: '¿Mis datos están seguros?',
        a: 'Todos los pagos se procesan vía PayPal (PCI-DSS Level 1). No almacenamos tarjetas en nuestros servidores. Tus datos nutricionales están encriptados en tránsito y en reposo, y nunca se comparten con terceros.',
    },
];

/* ============================================================
   COMPONENTES INLINE
   ============================================================ */

const CompTableCell = ({ value, isCurrent }) => {
    const cls = isCurrent ? styles.compTableCellHighlight : '';
    if (value === true) {
        return <td className={cls}><Check size={18} className={styles.compTableIconYes} aria-label="Incluido" /></td>;
    }
    if (value === false) {
        return <td className={cls}><X size={18} className={styles.compTableIconNo} aria-label="No incluido" /></td>;
    }
    // [P3-UPGRADE-TABLE-INFINITY · 2026-05-26] Carácter Unicode `∞` se ve
    // demasiado pequeño en celda de tabla. Reemplazado por icono Lucide
    // `Infinity` con styling premium (dorado + halo + tamaño mayor).
    if (value === '∞') {
        return (
            <td className={cls}>
                <InfinityIcon
                    size={22}
                    strokeWidth={2.5}
                    className={styles.compTableInfinity}
                    aria-label="Ilimitado"
                />
            </td>
        );
    }
    return <td className={cls}>{value}</td>;
};

const FAQItem = ({ item, isOpen, onToggle }) => (
    <div className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ''}`}>
        <button
            type="button"
            className={styles.faqQuestion}
            onClick={onToggle}
            aria-expanded={isOpen}
        >
            {item.q}
            <ChevronDown
                size={20}
                className={`${styles.faqChevron} ${isOpen ? styles.faqChevronOpen : ''}`}
            />
        </button>
        {isOpen && (
            <div className={styles.faqAnswer}>
                {item.a}
            </div>
        )}
    </div>
);

/* ============================================================
   COMPONENTE PRINCIPAL
   ============================================================ */

const Upgrade = () => {
    const navigate = useNavigate();
    // [P3-UPGRADE-DESKTOP-MINIMAL · 2026-05-26] `remainingCredits` y
    // `PLAN_LIMIT` removidos del destructure — solo los usaba el
    // `userContextCard` que ya no se renderiza. `currentTierLabel` también
    // eliminado abajo por la misma razón.
    const { planData, upgradeUserPlan, userProfile, isGuest } = useAssessment();
    const [searchParams, setSearchParams] = useSearchParams();

    const [billingPeriod, setBillingPeriod] = useState('monthly');
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [openFAQ, setOpenFAQ] = useState(null);

    const isAnnual = billingPeriod === 'annual';
    // [ULTRA-MONTHLY-ONLY · 2026-06-19] Anual efectivo POR tier (Ultra excluido).
    const isAnnualForTier = (tier) => isAnnual && !ANNUAL_DISABLED_TIERS.has(tier);
    const hasStarted = !!planData;

    const rawTier = (userProfile?.plan_tier || '').toLowerCase().trim();
    const currentTier = ['gratis', 'basic', 'plus', 'ultra', 'admin'].includes(rawTier) ? rawTier : 'gratis';
    const currentRank = TIER_RANK[currentTier] || 1;

    // tier-aware: Ultra siempre mensual (ver ANNUAL_DISABLED_TIERS).
    const getPrice = (tier) => PRICING[tier]?.[isAnnualForTier(tier) ? 'annual' : 'monthly']?.price || '0';
    const getPeriodLabel = (tier) => PRICING[tier]?.[isAnnualForTier(tier) ? 'annual' : 'monthly']?.label || '';
    const getMonthlyEquiv = (tier) => isAnnualForTier(tier) ? PRICING[tier]?.annual?.monthlyEquiv : null;

    const handleFreePlanClick = () => {
        window.scrollTo(0, 0);
        navigate(hasStarted ? '/dashboard' : '/assessment');
    };

    const handleUpgradeClick = (tier, name) => {
        // [P1-GUEST-PRICING · 2026-06-21] Invitado → crear cuenta antes de suscribirse
        // (el checkout/verify requiere auth).
        if (isGuest) {
            window.scrollTo(0, 0);
            navigate('/register');
            return;
        }
        const targetRank = TIER_RANK[tier] || 1;
        if (targetRank <= currentRank) {
            navigate('/dashboard');
            return;
        }
        const price = getPrice(tier);
        // [ULTRA-MONTHLY-ONLY · 2026-06-19] Periodo efectivo tier-aware (Ultra → mensual).
        const annual = isAnnualForTier(tier);
        const periodSuffix = annual ? ' (Anual)' : ' (Mensual)';
        setSelectedPlan({ tier, price, name: name + periodSuffix, isAnnual: annual });
        setIsPaymentOpen(true);
        // [PAY-MODAL-PERSIST · 2026-06-18] Persistir el checkout en la URL para que
        // sobreviva un refresh (re-abre el modal en mount). replace → no ensucia history.
        setSearchParams((prev) => {
            const p = new URLSearchParams(prev);
            p.set('checkout', tier);
            p.set('billing', annual ? 'annual' : 'monthly');
            return p;
        }, { replace: true });
    };

    // [PAY-MODAL-PERSIST · 2026-06-18] Cierre centralizado del checkout: baja el modal,
    // limpia el plan y BORRA ?checkout/?billing de la URL (replace). Un refresh
    // posterior NO re-abre el modal.
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

    const handlePaymentSuccess = async (tier, subscriptionId) => {
        // [P1-PAY-LIMBO · 2026-05-30] NO cerrar el modal ni navegar antes de
        // saber el resultado. Antes: `setIsPaymentOpen(false)` + navigate
        // incondicional, ignorando el retorno de upgradeUserPlan. Si
        // /subscription/verify falla tras un cobro PayPal real (timeout/5xx),
        // el usuario quedaba en /dashboard como gratis pero con suscripción
        // activa cobrando (limbo → chargeback/soporte). Ahora: el modal
        // full-screen sigue visible durante la verificación (cierra también el
        // P2 de "modal desaparece a mitad de verify") y solo navegamos en
        // éxito; en fallo cerramos el modal y dejamos al usuario en esta página
        // con el toast.error de upgradeUserPlan para reintentar.
        const ok = await upgradeUserPlan(tier, subscriptionId);
        if (ok) {
            navigate('/dashboard'); // el cambio de ruta descarta los params
        } else {
            // [PAY-MODAL-PERSIST · 2026-06-18 · FIX-B1] Fallo de verify: cerrar el
            // modal Y limpiar los params; si no, un refresh re-abriría un checkout
            // que ya falló.
            closePayment();
        }
    };

    // [PAY-MODAL-PERSIST · 2026-06-18 · FIX-B2] Rehidratar el checkout tras un refresh:
    // si la URL trae ?checkout=<tier>, re-abre el modal con el mismo plan. MOUNT-ONLY
    // (deps []) → corre 1 vez por montaje; cerrar el modal NUNCA lo re-dispara. NO valida
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
        // [ULTRA-MONTHLY-ONLY · 2026-06-19] Un link viejo con ?billing=annual para un
        // tier sin anual (Ultra) NO debe re-abrir un checkout anual: forzar mensual.
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

    const getButtonText = (tier) => {
        // [P1-GUEST-PRICING · 2026-06-21] Invitado: Gratis = tier efectivo ("Invitado");
        // pagos → "Crear cuenta" (el checkout requiere auth).
        if (isGuest) {
            return tier === 'gratis' ? 'Invitado' : 'Crear cuenta';
        }
        if (!userProfile?.id) {
            return tier === 'gratis' ? 'Empezar Gratis' : `Cambiar a ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
        }
        if (currentTier === tier) return 'Tu Plan Actual';
        const targetRank = TIER_RANK[tier] || 1;
        if (targetRank < currentRank) return 'Incluido en tu Plan';
        return tier === 'gratis' ? 'Empezar Gratis' : `Cambiar a ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
    };

    const isButtonDisabled = (tier) => {
        // [P1-GUEST-PRICING · 2026-06-21] Invitado: 'Invitado' (Gratis) es status →
        // disabled; pagos → CTA de registro clickeable.
        if (isGuest) return tier === 'gratis';
        if (!userProfile?.id) return false;
        if (currentTier === tier) return true;
        const targetRank = TIER_RANK[tier] || 1;
        return targetRank < currentRank;
    };

    const isCurrentPlan = (tier) => currentTier === tier;
    const isPopularPlan = (tier) => tier === 'plus' && !isCurrentPlan('plus');

    const renderPlanCard = (tier, displayName, ctaName) => {
        const isCurrent = isCurrentPlan(tier);
        const isPopular = isPopularPlan(tier);
        const disabled = isButtonDisabled(tier);
        const isFree = tier === 'gratis';
        const summary = PLAN_SUMMARY[tier];

        const cardClass = [
            styles.planCard,
            isCurrent && styles.planCardCurrent,
            isPopular && styles.planCardPopular,
        ].filter(Boolean).join(' ');

        const btnClass = [
            styles.planButton,
            isPopular && !disabled && styles.planButtonPrimary,
            disabled && styles.planButtonDisabled,
        ].filter(Boolean).join(' ');

        return (
            <div key={tier} className={cardClass}>
                {isCurrent && (
                    <div className={`${styles.planCardBadge} ${styles.planCardBadgeCurrent}`}>
                        <BadgeCheck size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                        Plan actual
                    </div>
                )}
                {isPopular && (
                    <div className={`${styles.planCardBadge} ${styles.planCardBadgePopular}`}>
                        Más Popular
                    </div>
                )}

                <h3 className={styles.planName}>
                    {displayName}
                </h3>

                <div>
                    <div className={styles.planPrice}>
                        <span className={styles.planPriceCurrency}>USD$</span>
                        <span className={styles.planPriceAmount}>{isFree ? '0' : getPrice(tier)}</span>
                        {!isFree && <span className={styles.planPricePeriod}>{getPeriodLabel(tier)}</span>}
                    </div>
                    {!isFree && isAnnual && getMonthlyEquiv(tier) && (
                        <div className={styles.planPriceEquivalent}>
                            equivale a ${getMonthlyEquiv(tier)}/mes
                        </div>
                    )}
                    {/* [ULTRA-MONTHLY-ONLY · 2026-06-19] Ultra no tiene plan anual:
                        con el toggle en "Anual" aclaramos que se factura mensual. */}
                    {!isFree && isAnnual && ANNUAL_DISABLED_TIERS.has(tier) && (
                        <div className={styles.planPriceEquivalent}>
                            Disponible solo en facturación mensual
                        </div>
                    )}
                </div>

                <p className={styles.planDescription}>{summary.description}</p>

                <ul className={styles.planFeatures}>
                    {summary.features.map((feat, idx) => (
                        <li key={idx} className={styles.planFeatureItem}>
                            <Check size={16} className={styles.planFeatureIcon} />
                            <span>{feat}</span>
                        </li>
                    ))}
                </ul>

                <button
                    type="button"
                    className={btnClass}
                    onClick={() => isFree ? handleFreePlanClick() : handleUpgradeClick(tier, ctaName)}
                    disabled={disabled}
                >
                    {getButtonText(tier)}
                </button>
            </div>
        );
    };

    return (
        <div className={styles.root}>
            {/* --- MODAL DE PAGO (reuse) --- [P5-SPEED-PAYMENTMODAL-LAZY · 2026-06-01]
                gate por isPaymentOpen + Suspense → chunk lazy al abrir. */}
            {isPaymentOpen && (
                <Suspense fallback={null}>
                    <PaymentModal
                        isOpen={isPaymentOpen}
                        onClose={closePayment}
                        onSuccess={(subId) => handlePaymentSuccess(selectedPlan?.tier, subId)}
                        price={selectedPlan?.price || '9.99'}
                        planName={selectedPlan?.name || 'Suscripción Básico'}
                        tier={selectedPlan?.tier || 'basic'}
                        isAnnual={selectedPlan?.isAnnual || false}
                    />
                </Suspense>
            )}

            {/* --- HEADER STICKY ---
                [P3-UPGRADE-HEADER-MINIMAL · 2026-05-26] Removido el título
                "Comparar Planes" — el contexto ya queda claro por las cards
                de planes que dominan el viewport. Solo back-link. */}
            <header className={styles.stickyHeader}>
                <button
                    type="button"
                    onClick={() => navigate('/dashboard')}
                    aria-label="Volver al dashboard"
                    className={styles.backButton}
                >
                    <ArrowLeft size={18} />
                    Volver al Dashboard
                </button>
            </header>

            {/* --- HERO --- */}
            <section className={styles.hero}>
                <div className={styles.heroBadge}>
                    <Zap size={12} />
                    Planes Flexibles
                </div>
                <h1 className={styles.heroTitle}>
                    Invierte en tu <span className={styles.heroTitleGradient}>Salud</span>
                </h1>
                <p className={styles.heroSubtitle}>
                    Elige tu plan. Cambia cuando quieras.
                </p>

                {/* [P3-UPGRADE-DESKTOP-MINIMAL · 2026-05-26] User context
                    card "TU PLAN ACTUAL · Ultra · ∞ créditos" eliminado.
                    Esta info ya es visible:
                      - Desktop: en el popover del avatar del sidebar (mini
                        sección "Tu plan" con badge tier + "Ver Planes").
                      - Mobile: en el chip ULTRA del header del Dashboard.
                      - En las propias cards de planes abajo, la card del tier
                        actual del usuario muestra el badge "TU PLAN" en verde.
                    Duplicar la info aquí era ruido visual. */}
            </section>

            {/* --- TOGGLE MENSUAL / ANUAL --- */}
            <div className={styles.toggleWrapper}>
                <div className={styles.toggle} role="group" aria-label="Periodo de facturación">
                    <button
                        type="button"
                        className={`${styles.toggleOption} ${!isAnnual ? styles.toggleActive : ''}`}
                        onClick={() => setBillingPeriod('monthly')}
                        aria-pressed={!isAnnual}
                    >
                        Mensual
                    </button>
                    <button
                        type="button"
                        className={`${styles.toggleOption} ${isAnnual ? styles.toggleActive : ''}`}
                        onClick={() => setBillingPeriod('annual')}
                        aria-pressed={isAnnual}
                    >
                        Anual
                        <span className={styles.toggleDiscountBadge}>-25%</span>
                    </button>
                </div>
            </div>

            {/* --- PLANS GRID --- */}
            <div className={styles.plansGrid}>
                {renderPlanCard('gratis', 'Gratis', 'Plan Gratis')}
                {renderPlanCard('basic', 'Básico', 'Suscripción Básico')}
                {renderPlanCard('plus', 'Plus', 'Suscripción Plus')}
                {renderPlanCard('ultra', 'Max', 'Suscripción Max')}
            </div>

            {/* --- TABLA COMPARATIVA ---
                [P3-UPGRADE-MOBILE-MINIMAL · 2026-05-26] `sectionTable` class
                adicional para poder ocultarla en mobile via media query.
                En mobile la grid de cards arriba ya comunica lo esencial;
                la tabla detallada solo aporta valor en desktop con espacio. */}
            <section className={`${styles.sectionWrapper} ${styles.sectionTable}`}>
                <h2 className={styles.sectionTitle}>Compara todo en detalle</h2>
                <p className={styles.sectionSubtitle}>
                    Cada feature, cada plan. Encuentra exactamente lo que necesitas.
                </p>

                <div className={styles.tableWrapper}>
                    <table className={styles.compTable}>
                        <thead>
                            <tr>
                                <th>Característica</th>
                                <th>Gratis</th>
                                <th>Básico</th>
                                <th className={styles.compTableCellHighlight}>
                                    <span className={styles.compTablePopularBadge}>Popular</span>
                                    Plus
                                </th>
                                <th>Ultra</th>
                            </tr>
                        </thead>
                        <tbody>
                            {COMP_FEATURES.map((section) => (
                                <React.Fragment key={section.category}>
                                    <tr className={styles.compTableCategoryRow}>
                                        <td colSpan={5}>
                                            {section.category}
                                        </td>
                                    </tr>
                                    {section.rows.map((row) => (
                                        <tr key={row.name}>
                                            <td>
                                                <div className={styles.compTableFeatureRow}>
                                                    <span className={styles.compTableFeatureName}>{row.name}</span>
                                                    {row.desc && (
                                                        <span className={styles.compTableFeatureDesc}>{row.desc}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <CompTableCell value={row.values.gratis} />
                                            <CompTableCell value={row.values.basic} />
                                            <CompTableCell value={row.values.plus} isCurrent />
                                            <CompTableCell value={row.values.ultra} />
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* --- FAQ ---
                [P3-UPGRADE-MOBILE-MINIMAL · 2026-05-26] `sectionFaq` class
                adicional para ocultarla en mobile. En mobile el FAQ accordion
                de 6 items hace la página muy larga; quien quiera detalle
                contacta soporte. */}
            <section className={`${styles.sectionWrapper} ${styles.sectionFaq}`}>
                <h2 className={styles.sectionTitle}>Preguntas frecuentes</h2>
                <p className={styles.sectionSubtitle}>
                    Si tienes otra duda, escríbenos a fuego.servicios@gmail.com.
                </p>

                <div className={styles.faqList}>
                    {FAQ_ITEMS.map((item, idx) => (
                        <FAQItem
                            key={idx}
                            item={item}
                            isOpen={openFAQ === idx}
                            onToggle={() => setOpenFAQ(openFAQ === idx ? null : idx)}
                        />
                    ))}
                </div>
            </section>

            {/* --- TRUST LINE MOBILE (solo visible ≤768px) ---
                [P3-UPGRADE-MOBILE-MINIMAL · 2026-05-26] El grid de 4 trust
                cards (PayPal/SSL/Garantía/Cancela) es valioso en desktop
                pero verboso en mobile. Aquí 1 línea inline con los mismos
                signals compactados — solo aparece en mobile. */}
            <div className={styles.trustLineMobile}>
                <ShieldCheck size={14} aria-hidden="true" />
                <span>Pago seguro · SSL cifrado · Cancela cuando quieras</span>
            </div>

            {/* --- TRUST BADGES (desktop only) --- */}
            <section className={styles.trustGrid}>
                <div className={styles.trustItem}>
                    <div className={styles.trustIcon}>
                        <CreditCard size={20} />
                    </div>
                    <h3 className={styles.trustTitle}>Pago seguro</h3>
                    <p className={styles.trustDesc}>Procesado por PayPal (PCI-DSS L1)</p>
                </div>
                <div className={styles.trustItem}>
                    <div className={styles.trustIcon}>
                        <ShieldCheck size={20} />
                    </div>
                    <h3 className={styles.trustTitle}>SSL Encriptado</h3>
                    <p className={styles.trustDesc}>Conexión cifrada extremo a extremo</p>
                </div>
                <div className={styles.trustItem}>
                    <div className={styles.trustIcon}>
                        <RefreshCw size={20} />
                    </div>
                    <h3 className={styles.trustTitle}>Cambia de plan al instante</h3>
                    <p className={styles.trustDesc}>Sube o baja tu plan cuando quieras</p>
                </div>
                <div className={styles.trustItem}>
                    <div className={styles.trustIcon}>
                        <BadgeCheck size={20} />
                    </div>
                    <h3 className={styles.trustTitle}>Cancela cuando quieras</h3>
                    <p className={styles.trustDesc}>Sin penalización ni preguntas</p>
                </div>
            </section>

            {/* --- FOOTER LINKS --- */}
            <footer className={styles.footerLinks}>
                <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacidad</a>
                ·
                <a href="/terms" target="_blank" rel="noopener noreferrer">Términos</a>
                ·
                <a href="mailto:fuego.servicios@gmail.com">Soporte</a>
                <br />
                <span style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                    © 2026 MealfitRD · Hecho en República Dominicana 🇩🇴
                </span>
            </footer>
        </div>
    );
};

export default Upgrade;
