/**
 * [P1-PLAN-LOTE-1116 · 2026-11-20] Planes de pago, rediseñados para la app (decisión del dueño: «precios muy
 * elevados… renueva el diseño completo y sus descripciones»).
 *
 * Qué cambió frente a P3-UPGRADE-PAGE-V2:
 *   - Precios nuevos (3,99 / 6,99 / 11,99 USD al mes; anual con ~37-40 % de ahorro, también en Max). Viven en
 *     `config/plans.js` (PRICING) y en los planes de PayPal con los MISMOS ids.
 *   - Lo que distingue un plan ya no son «créditos» abstractos: son los TOPES reales de uso (fotos al día, mensajes
 *     con el coach, minutos de voz en vivo, planes con IA en Beta), los mismos que aplica el servidor
 *     (`backend/topes_por_nivel.py` ↔ `TIER_LIMITS`).
 *   - El contador es el producto estable y es gratis para siempre: la página lo dice arriba, antes de vender nada.
 *   - Móvil primero: una columna de tarjetas compactas, botón de la app (`components/ui/Button`), tokens del sistema
 *     de diseño (sin degradados, hex ni tamaños fuera de escala). La tabla y las preguntas, solo en pantallas anchas.
 *
 * La lógica del cobro (checkout persistido en la URL, verify antes de navegar, invitados → cuenta) es la de siempre.
 */
import React, { useState, lazy, Suspense, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAssessment } from '../context/AssessmentContext';
// [P1-PLAN-LOTE-680] Invitado → hoja «Guarda tu plan» (login sin salir del plan) en vez de toast + /register.
import { pedirCuentaInvitado } from '../utils/hojaGuardarPlan';
import {
    ArrowLeft, Check, X, ChevronDown, ShieldCheck, Camera, MessageCircle, Mic, CalendarRange, Gauge,
    Headphones, Rocket,
} from 'lucide-react';
import styles from './Upgrade.module.css';
import { formatDate, formatNumber, t, useT } from '../i18n';
import Button from '../components/ui/Button';
// [P5-SPEED-PAYMENTMODAL-LAZY · 2026-06-01] el chunk de PayPal se baja al abrir el checkout.
const PaymentModal = lazy(() => import('../components/dashboard/PaymentModal'));
// [P1-LEGAL-LINKS-APEX · 2026-08-22] Las legales viven SOLO en el apex (en capacitor:// un href relativo abriría la
// copia JSX obsoleta).
import { apexUrl } from '../config/site';
import { nativeIapAvailable } from '../config/platform';
import { initRevenueCat, getNativeOfferings, purchaseNativePlan, restoreNativePurchases } from '../features/billing/revenuecat';
import { toast } from 'sonner';
import iconoDeAviso from '../utils/iconoDeAviso';
// [P3-I18N-MARCA-HORNEADA-EN-26-CLAVES] la marca entra como variable, no horneada en la clave.
import { BRAND } from '../data/routeMeta';
import { planPagado } from '../utils/regalosCuenta';
import {
    ANNUAL_DISABLED_TIERS, LAUNCH_OFFER, TIER_CREDITS, TIER_LIMITS, tierDisplayName, periodLabel,
    PRICING, NAME_BY_TIER, TIER_RANK, isLaunchOfferActive, monthlyEquivalent, annualSavingsPct, maxAnnualSavingsPct,
} from '../config/plans';

const PAGO = ['basic', 'plus', 'ultra'];

/* [P1-I18N-DASHBOARD · 2026-08-15] FUNCIONES, no constantes: un `t()` en ámbito de módulo se evalúa al importar
   —antes de que el catálogo esté cargado— y se queda congelado en español. */
function getDescripcion(tier) {
    return {
        gratis: t('Para empezar: el contador completo, con fotos y coach todos los días.'),
        basic: t('Para registrar todo con foto, sin pensarlo dos veces.'),
        plus: t('El equilibrio: coach a diario, voz en vivo y planes con IA.'),
        ultra: t('Para quien usa la IA a fondo, cada día.'),
    }[tier];
}

/** Lo que incluye cada plan, derivado de los TOPES reales (los que aplica el servidor). */
function getIncluye(tier) {
    const l = TIER_LIMITS[tier];
    const n = (v) => formatNumber(v);
    const filas = [
        { icon: Camera, texto: t('{n} fotos analizadas al día', { n: n(l.fotos_dia) }) },
        { icon: MessageCircle, texto: t('{n} mensajes con el coach al mes', { n: n(l.coach_mes) }) },
        { icon: Mic, texto: t('{n} min de voz en vivo al mes', { n: n(l.voz_min_mes) }) },
        { icon: CalendarRange, texto: t('{n} planes con IA al mes (Beta)', { n: n(TIER_CREDITS[tier]) }) },
    ];
    if (tier === 'ultra') {
        filas.push({ icon: Headphones, texto: t('Soporte prioritario') });
        filas.push({ icon: Rocket, texto: t('Acceso anticipado a lo nuevo') });
    }
    return filas;
}

/** Lo que es igual en todos los planes, también en Gratis. */
function getSiempreIncluido() {
    return [
        t('Contador de calorías y macros sin límite'),
        t('Buscador de alimentos y registro escrito'),
        t('Progreso, semanas y rachas'),
        t('Micronutrientes del día'),
        t('Nevera y lista de compras'),
    ];
}

/* Tabla comparativa (pantallas anchas): las mismas cifras que las tarjetas. */
function getFilasTabla() {
    const fila = (nombre, clave) => ({ nombre, valores: Object.fromEntries(['gratis', ...PAGO].map((tier) => [tier, formatNumber(TIER_LIMITS[tier][clave])])) });
    return [
        fila(t('Fotos analizadas al día'), 'fotos_dia'),
        fila(t('Mensajes con el coach al día'), 'coach_dia'),
        fila(t('Mensajes con el coach al mes'), 'coach_mes'),
        fila(t('Minutos de voz en vivo al mes'), 'voz_min_mes'),
        { nombre: t('Planes con IA al mes (Beta)'), valores: Object.fromEntries(['gratis', ...PAGO].map((tier) => [tier, formatNumber(TIER_CREDITS[tier])])) },
        { nombre: t('Contador, buscador y progreso'), valores: { gratis: true, basic: true, plus: true, ultra: true } },
        { nombre: t('Soporte prioritario'), valores: { gratis: false, basic: false, plus: false, ultra: true } },
    ];
}

/* ============================================================
   CONFIG: FAQ
   ============================================================ */

/* [P1-I18N-DASHBOARD · 2026-08-15] FUNCIÓN, no constante (ver arriba). */
function getFaqItems(isNativeIap = false) {
    return [
        {
            q: t('¿Puedo cancelar en cualquier momento?'),
            a: isNativeIap
                ? t('Sí. Puedes cancelar tu suscripción en cualquier momento desde los ajustes de tu Apple ID en App Store. Mantienes acceso al plan hasta el final del período facturado.')
                : t('Sí. Tu suscripción se puede cancelar desde Ajustes en un click, sin penalización ni preguntas. Mantienes acceso al plan hasta el final del período facturado.'),
        },
        {
            q: t('¿Qué pasa cuando se acaban mis créditos del mes?'),
            // [P1-PLAN-LOTE-718 · 2026-09-28] Los créditos se cuentan desde el día 1 del mes natural
            // (`db_profiles.get_monthly_api_usage`), y subir de plan es una suscripción NUEVA sin prorrateo
            // (`routers/billing.py`, «Detectado Upgrade/Cambio»).
            a: t('Tus créditos se renuevan el día 1 de cada mes. Si necesitas más antes, puedes pasarte a un plan superior y su límite se aplica al momento. El cambio es una suscripción nueva a precio completo: la anterior se cancela en ese momento, sin prorrateo ni reembolso de lo ya pagado.'),
        },
        {
            q: t('¿Qué pasa si llego a un tope del día?'),
            a: t('El contador sigue funcionando: puedes registrar escribiendo o con el buscador. Las fotos y los mensajes del día vuelven a las 24 horas; los del mes, el día 1.'),
        },
        {
            q: t('¿Ofrecen reembolsos?'),
            a: t('Las suscripciones no son reembolsables, salvo donde la ley lo exija. Puedes cancelar cuando quieras: detienes las renovaciones y conservas el acceso hasta el fin del período ya pagado. Dudas: bioboros.support@gmail.com.'),
        },
        {
            q: t('¿Mis datos están seguros?'),
            a: isNativeIap
                ? t('Todos los pagos se procesan de forma segura a través de Apple App Store. No almacenamos datos de tarjetas en nuestros servidores. Tus datos nutricionales están encriptados en tránsito y en reposo, y nunca se comparten con terceros.')
                : t('Todos los pagos se procesan vía PayPal (PCI-DSS Level 1). No almacenamos tarjetas en nuestros servidores. Tus datos nutricionales están encriptados en tránsito y en reposo, y nunca se comparten con terceros.'),
        },
    ];
}

/* ============================================================
   COMPONENTES INLINE
   ============================================================ */

const CeldaTabla = ({ value, destacada }) => {
    const t = useT();
    const cls = destacada ? styles.compTableCellHighlight : '';
    if (value === true) return <td className={cls}><Check size={18} className={styles.compTableIconYes} aria-label={t('Incluido')} /></td>;
    if (value === false) return <td className={cls}><X size={18} className={styles.compTableIconNo} aria-label={t('No incluido')} /></td>;
    return <td className={cls}>{value}</td>;
};

const FAQItem = ({ item, isOpen, onToggle }) => (
    <div className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ''}`}>
        <button type="button" className={styles.faqQuestion} onClick={onToggle} aria-expanded={isOpen}>
            {item.q}
            <ChevronDown size={20} className={`${styles.faqChevron} ${isOpen ? styles.faqChevronOpen : ''}`} />
        </button>
        {isOpen && <div className={styles.faqAnswer}>{item.a}</div>}
    </div>
);

/* ============================================================
   COMPONENTE PRINCIPAL
   ============================================================ */

const Upgrade = () => {
    const t = useT();
    const navigate = useNavigate();
    // [P3-UPGRADE-DESKTOP-MINIMAL · 2026-05-26] `remainingCredits` y
    // `PLAN_LIMIT` removidos del destructure — solo los usaba el
    // `userContextCard` que ya no se renderiza. `currentTierLabel` también
    // eliminado abajo por la misma razón.
    // [P1-BILLING-ORPHAN-RECOVERY · 2026-08-22] `session` para el `custom_id` del
    // checkout: MISMA fuente que usa `upgradeUserPlan` al llamar a `/verify`, para
    // que el id que viaja a PayPal y el que se verifica sean el mismo.
    const { planData, upgradeUserPlan, userProfile, isGuest, session, refreshProfileAndPlan, checkPlanLimit } = useAssessment();
    const [searchParams, setSearchParams] = useSearchParams();
    const isNativeIap = nativeIapAvailable();

    const [billingPeriod, setBillingPeriod] = useState('monthly');
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [openFAQ, setOpenFAQ] = useState(null);
    const [nativeOfferings, setNativeOfferings] = useState({});
    const [nativeLoadingOfferings, setNativeLoadingOfferings] = useState(isNativeIap);
    const [purchasingTier, setPurchasingTier] = useState(null);
    const [restoringPurchases, setRestoringPurchases] = useState(false);

    useEffect(() => {
        if (!isNativeIap) return;
        let cancelled = false;
        setNativeLoadingOfferings(true);
        (async () => {
            try {
                if (session?.user?.id) await initRevenueCat(session.user.id);
                const mapped = await getNativeOfferings();
                if (!cancelled) setNativeOfferings(mapped || {});
            } catch (err) {
                console.error('Error cargando offerings de StoreKit:', err);
            } finally {
                if (!cancelled) setNativeLoadingOfferings(false);
            }
        })();
        return () => { cancelled = true; };
    }, [isNativeIap, session?.user?.id]);

    const isAnnual = billingPeriod === 'annual';
    // [ULTRA-MONTHLY-ONLY · 2026-06-19] Anual efectivo POR tier (Ultra excluido).
    const isAnnualForTier = (tier) => isAnnual && !ANNUAL_DISABLED_TIERS.has(tier);

    // [P2-LANDING-COPY-TRUTH · 2026-08-14] La urgencia se evalúa contra la FECHA,
    // no contra un booleano que alguien tendría que acordarse de bajar. Se calcula
    // una vez por render: pasada la medianoche del 15 en RD, las tarjetas dejan de
    // anunciar una subida que ya ocurrió.
    const ofertaViva = isLaunchOfferActive();
    const hasStarted = !!planData;

    const rawTier = (planPagado(userProfile) || '').toLowerCase().trim();  // [P1-PLAN-LOTE-776] lo que se PAGA
    const currentTier = ['gratis', 'basic', 'plus', 'ultra', 'admin'].includes(rawTier) ? rawTier : 'gratis';
    const currentRank = TIER_RANK[currentTier] || 1;

    // tier-aware: Ultra siempre mensual (ver ANNUAL_DISABLED_TIERS).
    const getPrice = (tier) => PRICING[tier]?.[isAnnualForTier(tier) ? 'annual' : 'monthly']?.price || '0';
    // [P1-PRICING-I18N · 2026-08-20] «/mes» y «/año» son copy, no dato de precio.
    const getPeriodLabel = (tier) => periodLabel(
        PRICING[tier]?.[isAnnualForTier(tier) ? 'annual' : 'monthly']?.label || '', t);
    const getMonthlyEquiv = (tier) => (isAnnualForTier(tier) ? monthlyEquivalent(tier) : null);

    const handleFreePlanClick = () => {
        window.scrollTo(0, 0);
        navigate(hasStarted ? '/dashboard' : '/assessment');
    };

    const handleUpgradeClick = async (tier, name) => {
        // [P1-GUEST-PRICING · 2026-06-21] Invitado → crear cuenta antes de suscribirse
        // (el checkout/verify requiere auth).
        if (isGuest) {
            if (pedirCuentaInvitado('guardar')) return;
            window.scrollTo(0, 0);
            navigate('/login');
            return;
        }
        const targetRank = TIER_RANK[tier] || 1;
        if (targetRank <= currentRank) {
            navigate('/dashboard');
            return;
        }
        const annual = isAnnualForTier(tier);
        if (isNativeIap) {
            const periodKey = annual ? 'annual' : 'monthly';
            const pkgInfo = nativeOfferings?.[tier]?.[periodKey];
            if (!pkgInfo?.aPackage) {
                toast.error(t('Este plan no está disponible en StoreKit en este momento. Intenta de nuevo en unos segundos.'));
                return;
            }
            setPurchasingTier(tier);
            try {
                if (session?.user?.id) await initRevenueCat(session.user.id);
                const result = await purchaseNativePlan(pkgInfo);
                if (result?.cancelled) return;
                await Promise.all([
                    refreshProfileAndPlan?.(),
                    session?.user?.id ? checkPlanLimit?.(session.user.id) : Promise.resolve(),
                ]);
                const planNames = { basic: 'Bioboros Básico', plus: 'Bioboros Plus', ultra: 'Bioboros Max' };
                toast.success(t('¡Bienvenido a {plan}!', { plan: planNames[tier] || 'Bioboros Plus' }), {
                    description: t('Has desbloqueado acceso premium.'),
                    duration: 5000,
                    icon: iconoDeAviso('premium'),
                });
                navigate('/dashboard');
            } catch (err) {
                console.error('Error en compra StoreKit:', err);
                toast.error(t('No pudimos completar la compra en App Store. Inténtalo de nuevo.'));
            } finally {
                setPurchasingTier(null);
            }
            return;
        }
        const price = getPrice(tier);
        // [ULTRA-MONTHLY-ONLY · 2026-06-19] Periodo efectivo tier-aware (Ultra → mensual).
        const periodSuffix = annual ? t(' (Anual)') : t(' (Mensual)');
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

    const handleRestorePurchases = async () => {
        if (!isNativeIap || restoringPurchases) return;
        setRestoringPurchases(true);
        try {
            if (session?.user?.id) await initRevenueCat(session.user.id);
            const sync = await restoreNativePurchases();
            await Promise.all([
                refreshProfileAndPlan?.(),
                session?.user?.id ? checkPlanLimit?.(session.user.id) : Promise.resolve(),
            ]);
            if (sync?.active) {
                toast.success(t('Tu suscripción se restauró correctamente.'));
                navigate('/dashboard');
            } else {
                toast.info(t('No encontramos suscripciones activas en tu Apple ID.'));
            }
        } catch (err) {
            console.error('Error restaurando compras en Upgrade:', err);
            toast.error(t('No pudimos restaurar tus compras. Inténtalo de nuevo.'));
        } finally {
            setRestoringPurchases(false);
        }
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

    const handlePaymentSuccess = async (tier, subscriptionId, couponCode = null) => {
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
        const ok = await upgradeUserPlan(tier, subscriptionId, couponCode);
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
        if (isNativeIap) return;
        // [P1-I18N-DASHBOARD · 2026-08-15] Se llamaba `t`, que ahora es la función
        // de traducción del ámbito de arriba: dejarlo sombreado convierte cualquier
        // `t('…')` futuro dentro de este efecto en un error mudo.
        const tierParam = searchParams.get('checkout');
        const b = searchParams.get('billing');
        if (!['basic', 'plus', 'ultra'].includes(tierParam)) {
            if (tierParam !== null || b !== null) {
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
        const annual = b === 'annual' && !ANNUAL_DISABLED_TIERS.has(tierParam);
        setBillingPeriod(annual ? 'annual' : 'monthly');
        setSelectedPlan({
            tier: tierParam,
            price: PRICING[tierParam][annual ? 'annual' : 'monthly'].price,
            name: NAME_BY_TIER[tierParam] + (annual ? ' (Anual)' : ' (Mensual)'),
            isAnnual: annual,
        });
        setIsPaymentOpen(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getButtonText = (tier) => {
        // [P1-GUEST-PRICING · 2026-06-21] Invitado: Gratis = tier efectivo ("Invitado");
        // pagos → "Crear cuenta" (el checkout requiere auth).
        if (isGuest) {
            return tier === 'gratis' ? t('Invitado') : t('Crear cuenta');
        }
        // El nombre comercial del plan (Gratis/Básico/Plus/Max) es dato, no copy:
        // viaja interpolado y NO pasa por el catálogo.
        if (!userProfile?.id) {
            return tier === 'gratis' ? t('Empezar Gratis') : t('Cambiar a {plan}', { plan: tierDisplayName(tier, t) });
        }
        if (currentTier === tier) return t('Tu Plan Actual');
        const targetRank = TIER_RANK[tier] || 1;
        if (targetRank < currentRank) return t('Incluido en tu Plan');
        return tier === 'gratis' ? t('Empezar Gratis') : t('Cambiar a {plan}', { plan: tierDisplayName(tier, t) });
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

    const ahorroMax = maxAnnualSavingsPct();

    const renderPlanCard = (tier, displayName, ctaName) => {
        const isCurrent = isCurrentPlan(tier);
        const isPopular = isPopularPlan(tier);
        const isFree = tier === 'gratis';
        const periodKey = isAnnualForTier(tier) ? 'annual' : 'monthly';
        const nativePkg = isNativeIap && !isFree ? nativeOfferings?.[tier]?.[periodKey] : null;
        const nativeMonthlyPkg = isNativeIap && !isFree ? nativeOfferings?.[tier]?.monthly : null;
        const nativeAnnualPkg = isNativeIap && !isFree ? nativeOfferings?.[tier]?.annual : null;
        const isPurchasingThis = purchasingTier === tier;
        const disabled = isButtonDisabled(tier) || (isNativeIap && !isFree && (purchasingTier !== null || nativeLoadingOfferings || !nativePkg?.aPackage));
        const nativeSavings = isNativeIap && isAnnualForTier(tier) && nativeMonthlyPkg?.price > 0 && nativeAnnualPkg?.price > 0
            ? Math.round((1 - nativeAnnualPkg.price / (nativeMonthlyPkg.price * 12)) * 100)
            : null;
        const ahorro = !isFree && isAnnualForTier(tier)
            ? (isNativeIap ? nativeSavings : annualSavingsPct(tier))
            : null;
        const nativeEquivUsd = isNativeIap && isAnnualForTier(tier) && nativeAnnualPkg?.price > 0 && nativeAnnualPkg?.currencyCode === 'USD'
            ? (nativeAnnualPkg.price / 12).toFixed(2)
            : null;
        const equivMonto = isNativeIap ? nativeEquivUsd : getMonthlyEquiv(tier);

        const cardClass = [
            styles.planCard,
            isFree && styles.planCardFree,
            isCurrent && styles.planCardCurrent,
            isPopular && styles.planCardPopular,
        ].filter(Boolean).join(' ');

        return (
            <article key={tier} className={cardClass} aria-label={displayName}>
                <header className={styles.planHead}>
                    <h3 className={styles.planName}>{displayName}</h3>
                    {isCurrent && <span className={`${styles.planBadge} ${styles.planBadgeCurrent}`}>{t('Tu plan')}</span>}
                    {isPopular && <span className={`${styles.planBadge} ${styles.planBadgePopular}`}>{t('Más elegido')}</span>}
                </header>

                <div className={styles.planPrice}>
                    {isNativeIap ? (
                        isFree ? (
                            <>
                                <span className={styles.planPriceCurrency}>$</span>
                                <span className={styles.planPriceAmount}>0</span>
                            </>
                        ) : (
                            <>
                                <span className={styles.planPriceAmount}>{nativePkg?.priceString || '—'}</span>
                                <span className={styles.planPricePeriod}>{getPeriodLabel(tier)}</span>
                            </>
                        )
                    ) : (
                        <>
                            <span className={styles.planPriceCurrency}>USD$</span>
                            <span className={styles.planPriceAmount}>{isFree ? '0' : getPrice(tier)}</span>
                            {!isFree && <span className={styles.planPricePeriod}>{getPeriodLabel(tier)}</span>}
                        </>
                    )}
                </div>
                <div className={styles.planPriceEquivalent}>
                    {isFree && t('Gratis para siempre')}
                    {!isFree && equivMonto && (
                        <>
                            {t('equivale a ${monto}/mes', { monto: equivMonto })}
                            {ahorro ? <span className={styles.planSaving}>{t('Ahorras {pct} %', { pct: ahorro })}</span> : null}
                        </>
                    )}
                    {!isFree && !equivMonto && ahorro ? (
                        <span className={styles.planSaving}>{t('Ahorras {pct} %', { pct: ahorro })}</span>
                    ) : null}
                    {!isFree && isAnnual && ANNUAL_DISABLED_TIERS.has(tier) && t('Disponible solo en facturación mensual')}
                </div>
                {/* [P1-LAUNCH-OFFER · 2026-07-31] Anclaje de lanzamiento (hoy apagado en config/plans.js: los precios
                    BAJARON). La fecha se DERIVA del ISO con `timeZone: 'UTC'` (P2-I18N-FECHA-LANZAMIENTO-CLAVADA). */}
                {!isFree && !isNativeIap && ofertaViva && !isAnnualForTier(tier) && LAUNCH_OFFER.futureMonthly[tier] && (
                    <div className={styles.launchOffer}>
                        <span className={styles.launchOfferOld}>USD${LAUNCH_OFFER.futureMonthly[tier]}</span>
                        <span className={styles.launchOfferPill}>
                            {t('Lanzamiento · sube el {fecha}', {
                                fecha: formatDate(new Date(LAUNCH_OFFER.deadlineISO), {
                                    day: 'numeric', month: 'short', timeZone: 'UTC',
                                }),
                            })}
                        </span>
                    </div>
                )}

                <p className={styles.planDescription}>{getDescripcion(tier)}</p>

                <ul className={styles.planFeatures}>
                    {getIncluye(tier).map(({ icon: Icono, texto }) => (
                        <li key={texto} className={styles.planFeatureItem}>
                            <span className={styles.planFeatureIconWrap} aria-hidden="true">
                                <Icono size={14} strokeWidth={2.25} />
                            </span>
                            <span>{texto}</span>
                        </li>
                    ))}
                </ul>

                <Button
                    variant={isPopular && !disabled ? 'primary' : 'secondary'}
                    block
                    className={[styles.planButton, isPopular && !disabled && styles.planButtonPrimary].filter(Boolean).join(' ')}
                    onClick={() => (isFree ? handleFreePlanClick() : handleUpgradeClick(tier, ctaName))}
                    disabled={disabled}
                >
                    {isPurchasingThis
                        ? t('Procesando compra...')
                        : (isNativeIap && !isFree && nativeLoadingOfferings && !nativePkg?.aPackage ? t('Cargando precios...') : getButtonText(tier))}
                </Button>
            </article>
        );
    };

    return (
        <div className={styles.root}>
            {/* --- MODAL DE PAGO --- [P5-SPEED-PAYMENTMODAL-LAZY] chunk lazy al abrir (solo web). */}
            {!isNativeIap && isPaymentOpen && (
                <Suspense fallback={null}>
                    <PaymentModal
                        isOpen={isPaymentOpen}
                        onClose={closePayment}
                        onSuccess={(subId, coupon) => handlePaymentSuccess(selectedPlan?.tier, subId, coupon)}
                        price={selectedPlan?.price || PRICING.basic.monthly.price}
                        planName={/* [I18N-EXEMPT: NOMBRE del plan en PayPal, no copy: viaja al proveedor y sale en el cargo] */ selectedPlan?.name || 'Suscripción Básico'}
                        tier={selectedPlan?.tier || 'basic'}
                        isAnnual={selectedPlan?.isAnnual || false}
                        userId={session?.user?.id}
                        pricingMode={planData?._pricing_mode || null}
                    />
                </Suspense>
            )}

            <header className={styles.stickyHeader}>
                <Button
                    variant="text"
                    size="sm"
                    className={styles.headerBackBtn}
                    onClick={() => navigate('/dashboard')}
                    aria-label={t('Volver al dashboard')}
                >
                    <ArrowLeft size={18} aria-hidden="true" />
                    {t('Volver')}
                </Button>
                <span className={styles.headerTitle}>{t('Planes')}</span>
                <span aria-hidden="true" />
            </header>

            {/* --- HERO --- */}
            <section className={styles.hero}>
                <p className={styles.heroEyebrow}>{t('Planes')}</p>
                <h1 className={styles.heroTitle}>{t('Más IA, cuando la necesites')}</h1>
                <p className={styles.heroSubtitle}>
                    {t('El contador es gratis para siempre. Un plan te da más fotos analizadas, más coach y voz en vivo.')}
                </p>
                {/* [P1-PLAN-LOTE-776 · 2026-09-28] Cortesía vigente: el nombre viene de `plan_tier` (efectivo). */}
                {userProfile?.cortesia && (
                    <p className={styles.cortesiaNota}>
                        {t('Tienes {nombre} de cortesía. Si te suscribes, lo conservas cuando termine.', { nombre: tierDisplayName(userProfile.cortesia.plan, t) })}
                    </p>
                )}
            </section>

            {/* --- MENSUAL / ANUAL --- */}
            <div className={styles.toggleWrapper}>
                <div className={styles.toggle} role="group" aria-label={t('Periodo de facturación')}>
                    <button
                        type="button"
                        className={`${styles.toggleOption} ${!isAnnual ? styles.toggleActive : ''}`}
                        onClick={() => setBillingPeriod('monthly')}
                        aria-pressed={!isAnnual}
                    >
                        {t('Mensual')}
                    </button>
                    <button
                        type="button"
                        className={`${styles.toggleOption} ${isAnnual ? styles.toggleActive : ''}`}
                        onClick={() => setBillingPeriod('annual')}
                        aria-pressed={isAnnual}
                    >
                        {t('Anual')}
                        {ahorroMax ? <span className={styles.toggleDiscountBadge}>{t('hasta −{pct} %', { pct: ahorroMax })}</span> : null}
                    </button>
                </div>
            </div>

            {/* --- TARJETAS --- [P1-PRICING-I18N] el `tier` que viaja al checkout es la clave cruda. */}
            <div className={styles.plansGrid}>
                {renderPlanCard('gratis', tierDisplayName('gratis', t), t('Plan Gratis'))}
                {renderPlanCard('basic', tierDisplayName('basic', t), t('Suscripción {plan}', { plan: tierDisplayName('basic', t) }))}
                {renderPlanCard('plus', tierDisplayName('plus', t), t('Suscripción {plan}', { plan: tierDisplayName('plus', t) }))}
                {renderPlanCard('ultra', tierDisplayName('ultra', t), t('Suscripción {plan}', { plan: tierDisplayName('ultra', t) }))}
            </div>

            {isNativeIap && (
                <div className={styles.restoreRow}>
                    <Button
                        variant="secondary"
                        onClick={handleRestorePurchases}
                        disabled={restoringPurchases}
                    >
                        {restoringPurchases ? t('Restaurando...') : t('Restaurar compras')}
                    </Button>
                </div>
            )}

            {/* --- SIEMPRE INCLUIDO --- */}
            <section className={styles.siempre} aria-labelledby="upgrade-siempre">
                <div className={styles.siempreHead}>
                    <Gauge size={18} strokeWidth={2.25} aria-hidden="true" className={styles.siempreIcon} />
                    <h2 id="upgrade-siempre" className={styles.siempreTitle}>{t('En todos los planes, también en Gratis')}</h2>
                </div>
                <ul className={styles.siempreList}>
                    {getSiempreIncluido().map((texto) => (
                        <li key={texto}><Check size={14} strokeWidth={2.5} aria-hidden="true" />{texto}</li>
                    ))}
                </ul>
            </section>

            {/* --- TABLA (pantallas anchas) --- */}
            <section className={`${styles.sectionWrapper} ${styles.sectionTable}`}>
                <h2 className={styles.sectionTitle}>{t('Compara los planes')}</h2>
                <div className={styles.tableWrapper}>
                    <table className={styles.compTable}>
                        <thead>
                            <tr>
                                <th>{t('Incluye')}</th>
                                <th>{tierDisplayName('gratis', t)}</th>
                                <th>{tierDisplayName('basic', t)}</th>
                                <th className={styles.compTableCellHighlight}>{tierDisplayName('plus', t)}</th>
                                <th>{tierDisplayName('ultra', t)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {getFilasTabla().map((fila) => (
                                <tr key={fila.nombre}>
                                    <td className={styles.compTableFeatureName}>{fila.nombre}</td>
                                    <CeldaTabla value={fila.valores.gratis} />
                                    <CeldaTabla value={fila.valores.basic} />
                                    <CeldaTabla value={fila.valores.plus} destacada />
                                    <CeldaTabla value={fila.valores.ultra} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* --- PREGUNTAS --- */}
            <section className={`${styles.sectionWrapper} ${styles.sectionFaq}`}>
                <h2 className={styles.sectionTitle}>{t('Preguntas frecuentes')}</h2>
                <div className={styles.faqList}>
                    {getFaqItems(isNativeIap).map((item, idx) => (
                        <FAQItem key={item.q} item={item} isOpen={openFAQ === idx} onToggle={() => setOpenFAQ(openFAQ === idx ? null : idx)} />
                    ))}
                </div>
            </section>

            <div className={styles.trustLine}>
                <ShieldCheck size={14} aria-hidden="true" />
                <span>{isNativeIap
                    ? t('Pago seguro vía App Store · Renovable automáticamente · Cancela cuando quieras en los ajustes de tu Apple ID')
                    : t('Pago seguro con PayPal · Cancela cuando quieras · No vendemos tus datos')}</span>
            </div>

            {isNativeIap && (
                <p className={styles.appleLegalNote}>
                    {t('Las suscripciones se cobran a tu cuenta de Apple ID al confirmar la compra y se renuevan automáticamente a menos que se cancelen al menos 24 horas antes del final del período actual. Puedes gestionar o cancelar tus suscripciones en la configuración de tu Apple ID. Términos de uso (EULA) y Política de privacidad disponibles abajo.')}
                </p>
            )}

            <footer className={styles.footerLinks}>
                <a href={apexUrl('/privacy')} target="_blank" rel="noopener noreferrer">{isNativeIap ? t('Política de privacidad') : t('Privacidad')}</a>
                <span aria-hidden="true">·</span>
                <a href={apexUrl('/terms')} target="_blank" rel="noopener noreferrer">{isNativeIap ? t('Términos de uso (EULA)') : t('Términos')}</a>
                <span aria-hidden="true">·</span>
                <a href="mailto:bioboros.support@gmail.com">{t('Soporte')}</a>
                <span className={styles.footerNote}>{t('© 2026 {app} · Hecho en República Dominicana 🇩🇴', { app: BRAND })}</span>
            </footer>
        </div>
    );
};

export default Upgrade;
