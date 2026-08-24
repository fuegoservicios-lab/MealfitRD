import { useState, useCallback } from "react";
import { PayPalScriptProvider, PayPalButtons, FUNDING } from "@paypal/react-paypal-js";
import { X, CreditCard, Sparkles, Lock, Tag, Check, AlertCircle, Loader2, ChevronRight, Zap, User, Calendar, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PropTypes from 'prop-types';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { nativeHidesCommerce } from '../../config/platform';
// [POSTHOG-ANALYTICS · 2026-07-12] Evento del embudo de pago.
import { trackEvent } from '../../utils/analytics';
// [P2-CUSTOM-MODALS-A11Y · 2026-05-24] Hook SSOT de defenses a11y mínimas.
// PaymentModal es CRÍTICO: surface de pago PayPal sin focus trap dejaba
// Tab escapar al fondo durante el flujo de checkout. Layout split-screen
// full-bleed (100vh × 100vw) NO encaja en Modal.jsx (maxWidth 460px) —
// el hook aplica las defenses inline sin refactor de layout.
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
// [P2-14 · 2026-07-09] Hook SSOT de viewport (antes useState + resize listener).
import { useIsMobile } from '../../hooks/useMediaQuery';
import { formatCurrency, useI18n } from '../../i18n';
// [P1-CHECKOUT-CREDITS-TRUTH · 2026-08-22] SSOT del ladder: las cifras y los
// múltiplos se derivan, jamás se copian (ver `getPlanFeatures`).
import { TIER_CREDITS, creditsVsPredecessor, includesPredecessor } from '../../config/plans';

/* ─── Plan Feature Map ─── */
// [P2-PAYMENT-FEATURES-ALIGN · 2026-05-31] La pantalla de checkout anunciaba como
// "lo que pagas" varias features que el landing (Pricing.jsx) y la tabla
// comparativa (Upgrade.jsx) declaran GRATIS (Asistente con Visión, Historial,
// Seguimiento de Progreso, Analizador de Macros). En el momento de mayor fricción
// eso degrada credibilidad. Ahora cada tier muestra solo lo que AÑADE sobre el
// inferior, espejando Pricing.jsx.
/* [P3-PRICING-HONEST-COPY · 2026-07-12] Directiva del owner: los tiers se
   diferencian SOLO por créditos (Gratis accede a todo por ahora); Max no
   cambia. Se retiran los claims de "Memoria" como exclusivas de pago. */
// [P1-I18N-DASHBOARD · 2026-08-15] Funciones y no constantes: una tabla de copy
// en ámbito de módulo se evalúa al importar, antes de que el catálogo exista.
//
// [P1-CHECKOUT-CREDITS-TRUTH · 2026-08-22] Las cifras se DERIVAN de
// `config/plans.js`; estaban escritas a mano y se quedaron en el ladder VIEJO
// (cuando Gratis eran 15): Básico decía "3× más que Gratis" (son 5×), Plus "13×"
// (son 20×) y Max vendía "Créditos Ilimitados" cuando `auth._TIER_LIMITS` corta
// en 500. La landing y `/upgrade` sí derivaban desde `P1-CREDITS-LADDER`
// (31-jul), así que el usuario leía «500 Créditos al mes» en la tarjeta y
// «ilimitado» en la pantalla donde pone la tarjeta — una contradicción dentro
// del mismo embudo, justo en el paso del dinero.
//
// El comentario `P2-PAYMENT-FEATURES-ALIGN` de arriba dice que esta pantalla se
// alineó con Pricing.jsx, y es cierto: se alineó en MAYO. Por eso ahora no se
// copia el resultado sino la FUENTE — `creditsVsPredecessor`/`includesPredecessor`
// son los mismos helpers que usan las otras dos superficies, así que el próximo
// cambio de ladder llega aquí solo.
const getPlanFeatures = (t) => ({
    basic: [
        { icon: "⚡", text: t("{n} Créditos de IA al mes", { n: TIER_CREDITS.basic }) },
        { icon: "📈", text: creditsVsPredecessor('basic', t) },
        { icon: "✅", text: includesPredecessor('basic', t) },
    ],
    plus: [
        { icon: "⚡", text: t("{n} Créditos de IA al mes", { n: TIER_CREDITS.plus }) },
        { icon: "📈", text: creditsVsPredecessor('plus', t) },
        { icon: "✅", text: includesPredecessor('plus', t) },
    ],
    ultra: [
        { icon: "⚡", text: t("{n} Créditos de IA al mes", { n: TIER_CREDITS.ultra }) },
        { icon: "📈", text: creditsVsPredecessor('ultra', t) },
        { icon: "🔮", text: t("Acceso Anticipado a Funciones") },
        { icon: "👑", text: t("Soporte Prioritario VIP") },
        { icon: "✅", text: includesPredecessor('ultra', t) },
    ]
});

const getPlanDisplay = (t) => ({
    basic: t("Plan Básico"),
    plus: t("Plan Plus"),
    ultra: t("Plan Max"),
});

const PaymentModal = ({
    isOpen, onClose, onSuccess,
    price = "25.00", planName = "Suscripción Plus",
    tier = "plus", isAnnual = false,
    // [P1-BILLING-ORPHAN-RECOVERY · 2026-08-22] Id del usuario que paga. Viaja a
    // PayPal como `custom_id` para que un cobro cuyo `/verify` no llegó siga
    // siendo atribuible desde el webhook (ver `handleCreateSubscription`).
    userId = null,
    // [P1-COUNTRY-CHECKOUT-BETA-MUDO · 2026-08-23] El régimen de precios del plan, el MISMO
    // dato que el Dashboard usa para ocultar sus tres paneles (`_pricing_mode`). Llega como
    // prop y no se deriva aquí de `health_profile.country`: ese campo es identidad CULINARIA,
    // no ubicación, y el comentario de COUNTRY_PROFILES lo dice — inferir de él dónde vive
    // alguien es justo el error que este gap señala.
    pricingMode = null
}) => {
    // [P2-I18N-PAYPAL-LOCALE · 2026-08-21] Hace falta `locale` ademas de `t` para
    // decirle al SDK de PayPal en que idioma hablar.
    const { t, locale } = useI18n();
    const [couponCode, setCouponCode] = useState('');
    const [couponLoading, setCouponLoading] = useState(false);
    const [couponResult, setCouponResult] = useState(null);
    // [P2-14 · 2026-07-09] Hook SSOT (antes useState + resize listener local).
    const isMobile = useIsMobile();

    const [paymentMethod, setPaymentMethod] = useState('card');
    // [P3-PAYMENTMODAL-DEADSTATE · 2026-05-30] Eliminados `isProcessing` y
    // `cardDetails` ({name,number,exp,cvc}): estado React nunca leído ni seteado
    // (el flujo delega 100% a <PayPalButtons>; no hay form de tarjeta propio).
    // El shape con number/cvc sugería falsamente que la app toca PAN/CVC crudo
    // (no lo hace — todo es PayPal-hosted).

    // [P2-CUSTOM-MODALS-A11Y · 2026-05-24] focus trap + ESC + restore focus +
    // body overflow lock. `disableClose=false` — el flujo de pago NO bloquea
    // ESC (el user puede abortar antes de submit; tras submit el flow es
    // server-driven via onSuccess y no depende de este modal).
    const { containerRef: paymentModalRef } = useModalAccessibility({
        isOpen,
        onClose,
        disableClose: false,
    });

    // [P3-NEW-PAYPAL-FALLBACK · 2026-05-15] Anti-pattern eliminado: el
    // fallback hardcoded a un client_id de PayPal real (no placeholder)
    // ocultaba misconfig — si el deploy perdía `VITE_PAYPAL_CLIENT_ID` por
    // typo o deploy parcial, el SDK seguía usando el ID hardcoded del
    // commit, posiblemente apuntando al merchant equivocado o a un client
    // viejo deshabilitado. Fail-loud: tirar Error visible que para el
    // mount del modal y dispara el ErrorBoundary global. Mejor "modal
    // roto + alert SRE" que "pago procesado contra merchant incorrecto".
    // PayPal client_id es público (visible en bundle), pero el riesgo es
    // operacional, no de seguridad. Anchor: P3-NEW-PAYPAL-FALLBACK.
    const _paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    if (!_paypalClientId) {
        throw new Error(
            "[P3-NEW-PAYPAL-FALLBACK] VITE_PAYPAL_CLIENT_ID missing in env. " +
            "Configure the deploy env vars before deploying PaymentModal."
        );
    }
    // PayPal
    //
    // [P2-I18N-PAYPAL-LOCALE · 2026-08-21] El widget hablaba el idioma que PayPal
    // dedujera del navegador o de la IP, no el que el usuario eligio en la app. Un
    // frances con el movil en ingles pagaba en ingles dentro de una interfaz en frances.
    //
    // MAPA EXPLICITO, nunca `getLocale().replace('-','_')`: PayPal usa `xx_XX` y su
    // lista NO es la nuestra — `es_DO` no existe ahi, y un locale no soportado no
    // degrada, rompe el widget. Por eso el espanol se OMITE en vez de forzarse a
    // `es_ES`: dejar que PayPal deduzca es la conducta de hoy y es correcta para un
    // dominicano; mandarle Espana seria cambiarla a peor.
    const _PAYPAL_LOCALE = {
        'en-US': 'en_US',
        'pt-BR': 'pt_BR',
        'fr-FR': 'fr_FR',
        'it-IT': 'it_IT',
    }[locale];

    const initialOptions = {
        "client-id": _paypalClientId,
        currency: "USD",
        intent: "subscription",
        vault: true,
        ...(_PAYPAL_LOCALE ? { locale: _PAYPAL_LOCALE } : {}),
    };

    // [P2-PAYPAL-PLAN-FAIL-LOUD · 2026-07-09] Env-only, SIN fallbacks hardcoded
    // ni placeholders: el mismo anti-patrón que P3-NEW-PAYPAL-FALLBACK eliminó
    // para el client-id. Un fallback silencioso a un plan_id embebido puede
    // cobrar contra el plan equivocado si el env var cambia/rota; un ID falsy
    // aborta en handleCreateSubscription con toast (fail-loud en el punto de
    // acción, sin romper el render del modal). Los 6 IDs reales viven en
    // .env.production (públicos según PayPal).
    const PLAN_IDS = {
        monthly: {
            basic: import.meta.env.VITE_PAYPAL_PLAN_BASIC_MONTHLY || import.meta.env.VITE_PAYPAL_PLAN_BASIC,
            plus: import.meta.env.VITE_PAYPAL_PLAN_PLUS_MONTHLY || import.meta.env.VITE_PAYPAL_PLAN_PLUS,
            ultra: import.meta.env.VITE_PAYPAL_PLAN_ULTRA_MONTHLY || import.meta.env.VITE_PAYPAL_PLAN_ULTRA
        },
        annual: {
            basic: import.meta.env.VITE_PAYPAL_PLAN_BASIC_ANNUAL,
            plus: import.meta.env.VITE_PAYPAL_PLAN_PLUS_ANNUAL,
            ultra: import.meta.env.VITE_PAYPAL_PLAN_ULTRA_ANNUAL
        }
    };

    // Discount
    const handleApplyCoupon = useCallback(async () => {
        if (!couponCode.trim()) return;
        setCouponLoading(true);
        setCouponResult(null);
        try {
            const response = await fetchWithAuth('/api/discount/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: couponCode.trim(), tier })
            });
            const data = await response.json();
            setCouponResult(data);
        } catch {
            setCouponResult({ valid: false, message: t('Error validando el código.') });
        } finally {
            setCouponLoading(false);
        }
    }, [couponCode, tier, t]);

    const originalPrice = parseFloat(price);
    const discountPercent = couponResult?.valid ? couponResult.discount_percent : 0;
    const discountAmount = (originalPrice * discountPercent / 100);
    const finalPrice = (originalPrice - discountAmount).toFixed(2);
    const _planFeatures = getPlanFeatures(t);
    // `.filter(Boolean)`: `creditsVsPredecessor` devuelve null si el ladder dejara
    // de crecer — sin el filtro quedaría una fila vacía con su icono.
    const features = (_planFeatures[tier] || _planFeatures.plus).filter((f) => f && f.text);

    const handleCreateSubscription = (data, actions) => {
        const paypalPlanId = PLAN_IDS[isAnnual ? 'annual' : 'monthly'][tier];
        // [P2-PAYPAL-PLAN-FAIL-LOUD · 2026-07-09] Env var ausente → abortar la
        // suscripción con feedback (antes solo cubría el placeholder anual;
        // el mensual caía en un fallback hardcoded silencioso).
        if (!paypalPlanId) {
            // [P3-AUDIT-2 · 2026-05-15] `alert()` nativo reemplazado por
            // `toast.error` (sonner). Consistencia UX con el resto de la
            // app + no bloquea el thread durante el flujo de pago.
            toast.error(t("Plan de pago no configurado. Contacta soporte."));
            return Promise.reject(new Error("Missing PayPal plan ID"));
        }

        const payload = { 'plan_id': paypalPlanId };

        // [P1-BILLING-ORPHAN-RECOVERY · 2026-08-22] `custom_id` = quién paga.
        //
        // Hasta ahora `POST /api/subscription/verify` era el ÚNICO camino por el que
        // una suscripción llegaba a `user_profiles`, y lo dispara ESTE navegador desde
        // `onApprove`. Si entre la aprobación y esa llamada se cae la red, el usuario
        // cierra la pestaña o `/verify` devuelve 5xx, PayPal cobra y el sistema no se
        // entera: `paypal_subscription_id` queda NULL y los webhooks filtran justo por
        // esa columna → 0 filas, no-op silencioso. Cobro sin acceso y sin alerta.
        //
        // PayPal nos devuelve este campo FIRMADO dentro del webhook, así que el backend
        // puede adoptar al huérfano sin depender de que el navegador sobreviva. El TIER
        // lo sigue derivando ÉL del `plan_id` (I-Billing-1): esto dice a quién, no qué.
        //
        // Solo se añade si hay valor: PayPal guardaría un "undefined" literal.
        if (typeof userId === 'string' && userId.trim()) {
            payload.custom_id = userId.trim().slice(0, 127);  // cap de PayPal
        }

        if (discountPercent > 0) {
            payload.plan = {
                billing_cycles: [
                    {
                        sequence: 1,
                        pricing_scheme: {
                            fixed_price: {
                                value: finalPrice.toString(),
                                currency_code: 'USD'
                            }
                        }
                    }
                ]
            };
        }

        return actions.subscription.create(payload);
    };

    // [P1-IOS-NATIVE-SHELL · 2026-08-21] Defensa en profundidad: aunque en nativo ninguna
    // ruta ni CTA llega aquí, el checkout PayPal jamás se pinta dentro de la app de la
    // App Store (Apple 3.1.1). Va DESPUÉS de los hooks para no violar sus reglas.
    if (!isOpen || nativeHidesCommerce()) return null;

    return (
        <AnimatePresence>
            {/* Overlay */}
            {/* [P2-CUSTOM-MODALS-A11Y · 2026-05-24] role/aria-modal/aria-labelledby
                + ref del hook para focus trap. tabIndex={-1} permite focus
                programático al mount (screen readers anuncian dialog). */}
            <motion.div
                ref={paymentModalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="payment-modal-title"
                tabIndex={-1}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
                    background: '#0a0a0a',
                    overflowY: 'auto',
                    display: 'flex',
                }}
            >
                {/* Close */}
                <button
                    onClick={onClose}
                    aria-label={t("Cerrar ventana modal")}
                    style={{
                        // [P3-PAYMENT-MODAL-SAFE-AREA · 2026-06-01] +env(safe-area-inset-top): la X
                        // no debe quedar bajo la barra de estado / notch en iOS. env()=0 sin notch.
                        position: 'fixed', top: 'calc(1.5rem + env(safe-area-inset-top, 0px))', right: '1.5rem', zIndex: 10000,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '50%', width: 40, height: 40,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: '#ccc',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#ccc'; }}
                >
                    <X size={20} aria-hidden="true" />
                </button>

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ type: "spring", damping: 30, stiffness: 350 }}
                    style={{
                        width: '100%',
                        minHeight: '100vh',
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                    }}
                >
                    {/* ═══════ LEFT — Forma de pago ═══════ */}
                    <div style={{
                        flex: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        // [P3-PAYMENT-MODAL-SAFE-AREA · 2026-06-01] padding-top móvil suma el
                        // inset para que el contenido baje junto con la X (no bajo el notch).
                        padding: isMobile ? 'calc(5rem + env(safe-area-inset-top, 0px)) 1.5rem 2rem' : '4rem 5%',
                        borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
                        borderBottom: isMobile ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        background: '#0a0a0a',
                    }}>
                        <div style={{ maxWidth: '480px', width: '100%' }}>
                            <h2
                                id="payment-modal-title"
                                style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    fontSize: '1.35rem', fontWeight: 700,
                                    color: '#fff', marginBottom: '0.35rem',
                                }}
                            >
                            {t("Forma de pago")}
                        </h2>
                        <p style={{
                            fontSize: '0.85rem', color: '#777',
                            marginBottom: '1.75rem',
                        }}>
                            {t("Elige tu método de pago preferido")}
                        </p>

                        {/* Payment Method Selector */}
                        <div style={{ 
                            display: 'flex', gap: '0.5rem', marginBottom: '2rem', 
                            background: 'rgba(255,255,255,0.03)', padding: '0.35rem', 
                            borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)'
                        }}>
                            <button
                                onClick={() => setPaymentMethod('card')}
                                style={{
                                    flex: 1, padding: '0.8rem', borderRadius: '0.75rem',
                                    background: paymentMethod === 'card' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    border: paymentMethod === 'card' ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                                    color: paymentMethod === 'card' ? '#fff' : '#777',
                                    fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    transition: 'all 0.2s', fontFamily: "'Outfit', sans-serif"
                                }}
                            >
                                <CreditCard size={18} /> {t("Tarjeta")}
                            </button>
                            <button
                                onClick={() => setPaymentMethod('paypal')}
                                style={{
                                    flex: 1, padding: '0.8rem', borderRadius: '0.75rem',
                                    background: paymentMethod === 'paypal' ? '#FFC439' : 'transparent',
                                    border: paymentMethod === 'paypal' ? '1px solid #F5B82E' : '1px solid transparent',
                                    color: paymentMethod === 'paypal' ? '#000' : '#777',
                                    fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    transition: 'all 0.2s', fontFamily: "'Outfit', sans-serif"
                                }}
                            >
                                PayPal
                            </button>
                        </div>

                        {/* Payment Form Area */}
                        <div style={{ minHeight: '280px', marginBottom: '1.5rem' }}>
                            <AnimatePresence mode="wait">
                                {paymentMethod === 'card' && (
                                    <motion.div 
                                        key="card"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', borderRadius: '0.75rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                            <div style={{ background: 'rgba(255,255,255,0.08)', padding: '0.5rem', borderRadius: '50%', color: '#fff' }}>
                                                <CreditCard size={18} />
                                            </div>
                                            <div>
                                                <h4 style={{ color: '#fff', fontSize: '0.95rem', margin: '0 0 0.35rem 0', fontFamily: "'Outfit', sans-serif" }}>{t("Paga con tu tarjeta local")}</h4>
                                                <p style={{ color: '#aaa', fontSize: '0.8rem', margin: 0, lineHeight: 1.4 }}>{t("PayPal procesa tarjetas de débito y crédito internacionales.")} <span style={{ color: '#fff' }}>{t("No necesitas abrir ni tener una cuenta de PayPal.")}</span></p>
                                            </div>
                                        </div>
                                        <PayPalScriptProvider options={initialOptions}>
                                            <PayPalButtons
                                                fundingSource={FUNDING.CARD}
                                                style={{ shape: "rect", color: "black", label: "subscribe", height: 50, tagline: false }}
                                                createSubscription={handleCreateSubscription}
                                                onApprove={async (data) => { try { trackEvent('subscription_activated', { tier, isAnnual, coupon: !!(couponResult?.valid) }); onSuccess(data.subscriptionID, couponResult?.valid ? couponCode.trim().toUpperCase() : null); } catch (err) { console.error(err); } }}
                                                onError={(err) => {
                                                    // [P2-PAYPAL-ONERROR-TOAST · 2026-05-30] El SDK puede
                                                    // fallar mid-checkout (5xx PayPal, red, popup bloqueado,
                                                    // plan_id inválido). onSuccess nunca corre → sin este
                                                    // toast el modal full-screen quedaba mudo en la pantalla
                                                    // de mayor conversión. No hay cargo (el error precede al
                                                    // approve), así que es feedback, no pérdida de pago.
                                                    console.error("PayPal Card Error:", err);
                                                    toast.error(t("No se pudo procesar el pago. Intenta de nuevo o usa otro método."));
                                                }}
                                                onCancel={() => { }}
                                            />
                                        </PayPalScriptProvider>
                                        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#999', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                                            <Lock size={12} /> {t("Transacción 100% cifrada y asegurada internacionalmente")}
                                        </p>
                                    </motion.div>
                                )}

                                {paymentMethod === 'paypal' && (
                                    <motion.div 
                                        key="paypal"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div style={{ background: 'rgba(255,196,57,0.05)', border: '1px solid rgba(255,196,57,0.15)', padding: '1.25rem', borderRadius: '0.75rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                            <div style={{ background: 'rgba(255,196,57,0.15)', padding: '0.5rem', borderRadius: '50%', color: '#FFC439' }}>
                                                <Lock size={18} />
                                            </div>
                                            <div>
                                                <h4 style={{ color: '#fff', fontSize: '0.95rem', margin: '0 0 0.35rem 0', fontFamily: "'Outfit', sans-serif" }}>{t("Paga seguro con PayPal")}</h4>
                                                <p style={{ color: '#aaa', fontSize: '0.8rem', margin: 0, lineHeight: 1.4 }}>{t("Serás redirigido a la pasarela oficial de PayPal. Puedes usar tu balance de PayPal o asociar una tarjeta allí sin crear cuenta nueva.")}</p>
                                            </div>
                                        </div>
                                        <PayPalScriptProvider options={initialOptions}>
                                            <PayPalButtons
                                                fundingSource={FUNDING.PAYPAL}
                                                style={{ shape: "rect", color: "gold", label: "subscribe", height: 50, tagline: false }}
                                                createSubscription={handleCreateSubscription}
                                                onApprove={async (data) => { try { trackEvent('subscription_activated', { tier, isAnnual, coupon: !!(couponResult?.valid) }); onSuccess(data.subscriptionID, couponResult?.valid ? couponCode.trim().toUpperCase() : null); } catch (err) { console.error(err); } }}
                                                onError={(err) => {
                                                    // [P2-PAYPAL-ONERROR-TOAST · 2026-05-30] Ver nota en el
                                                    // botón de tarjeta arriba — mismo feedback al usuario.
                                                    console.error("PayPal Error:", err);
                                                    toast.error(t("No se pudo procesar el pago. Intenta de nuevo o usa otro método."));
                                                }}
                                                onCancel={() => { }}
                                            />
                                        </PayPalScriptProvider>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Discount Code */}
                        <div style={{
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            paddingTop: '1.25rem',
                        }}>
                            <label style={{
                                fontSize: '0.8rem', fontWeight: 600,
                                color: '#888', display: 'flex',
                                alignItems: 'center', gap: '0.35rem',
                                marginBottom: '0.6rem',
                            }}>
                                <Tag size={13} />
                                {t("Código de descuento")}
                            </label>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="text"
                                    placeholder={t("Ej: LAUNCH50")}
                                    value={couponCode}
                                    onChange={(e) => {
                                        setCouponCode(e.target.value.toUpperCase());
                                        if (couponResult) setCouponResult(null);
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                                    style={{
                                        flex: 1, padding: '0.7rem 0.9rem',
                                        background: '#2a2a2a',
                                        border: `1px solid ${couponResult?.valid ? '#22c55e' : couponResult && !couponResult.valid ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                                        borderRadius: '0.6rem', color: '#fff',
                                        fontSize: '0.9rem',
                                        fontFamily: "'Inter', 'Outfit', sans-serif",
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                    }}
                                />
                                <button
                                    onClick={handleApplyCoupon}
                                    disabled={couponLoading || !couponCode.trim()}
                                    style={{
                                        padding: '0.7rem 1.1rem',
                                        background: '#333',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        borderRadius: '0.6rem', color: '#ccc',
                                        fontSize: '0.85rem', fontWeight: 600,
                                        cursor: couponLoading || !couponCode.trim() ? 'not-allowed' : 'pointer',
                                        opacity: couponLoading || !couponCode.trim() ? 0.4 : 1,
                                        transition: 'all 0.2s',
                                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                                        whiteSpace: 'nowrap',
                                    }}
                                    onMouseEnter={(e) => { if (!couponLoading && couponCode.trim()) e.currentTarget.style.background = '#444'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = '#333'; }}
                                >
                                    {couponLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : t('Aplicar')}
                                </button>
                            </div>

                            {/* Coupon feedback */}
                            {couponResult && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                                        marginTop: '0.5rem',
                                        fontSize: '0.78rem',
                                        color: couponResult.valid ? '#22c55e' : '#ef4444',
                                    }}
                                >
                                    {couponResult.valid ? <Check size={13} /> : <AlertCircle size={13} />}
                                    <span>{couponResult.message}</span>
                                </motion.div>
                            )}
                        </div>
                        </div>
                    </div>

                    {/* ═══════ RIGHT — Plan summary ═══════ */}
                    <div style={{
                        flex: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: isMobile ? '2rem 1.5rem 4rem' : '4rem 5%',
                        background: '#111111',
                    }}>
                        <div style={{ maxWidth: '440px', width: '100%', display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : '100%', justifyContent: 'center' }}>
                        {/* Plan Header */}
                        <div>
                            <h2 style={{
                                fontFamily: "'Outfit', sans-serif",
                                fontSize: '1.35rem', fontWeight: 700,
                                color: '#fff', marginBottom: '1.25rem',
                            }}>
                                {getPlanDisplay(t)[tier] || planName}
                            </h2>

                            {/* [P1-COUNTRY-CHECKOUT-BETA-MUDO · 2026-08-23] El checkout no decía
                                «beta» ni una vez, y al usuario beta el propio sistema le entrega
                                MENOS: el Dashboard le oculta tres paneles porque su país aún no
                                tiene precios de súper. Cobrar sin decirlo es la parte que sí es
                                nuestra; cuánto cobrar es decisión del dueño y no se toca aquí.
                                El copy se reutiliza tal cual del aviso del Dashboard y del PDF
                                (P2-DASH-BETA-NOTICE) — ya está traducido a los cinco idiomas, así
                                que no nace ninguna clave huérfana. */}
                            {pricingMode === 'beta_no_prices' && (
                                <div style={{
                                    display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
                                    background: 'rgba(234, 179, 8, 0.10)',
                                    border: '1px solid rgba(234, 179, 8, 0.35)',
                                    borderRadius: '0.75rem', padding: '0.75rem 0.9rem',
                                    marginBottom: '1.25rem',
                                }}>
                                    <AlertCircle size={16} style={{ color: '#EAB308', flexShrink: 0, marginTop: '0.1rem' }} />
                                    <p style={{ color: '#D6D3D1', fontSize: '0.8rem', margin: 0, lineHeight: 1.45 }}>
                                        {t('Tu país está en beta — pronto añadiremos los precios nativos de tu súper a esta lista.')}
                                    </p>
                                </div>
                            )}

                            <p style={{
                                fontSize: '0.78rem', fontWeight: 600,
                                color: '#888', textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                marginBottom: '0.85rem',
                            }}>
                                {t("Características principales")}
                            </p>

                            {/* Features */}
                            <div style={{
                                display: 'flex', flexDirection: 'column',
                                gap: '0.7rem', marginBottom: '1.75rem',
                            }}>
                                {features.map((feat, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.65rem',
                                        fontSize: '0.9rem', color: '#d1d1d1',
                                    }}>
                                        <span style={{ fontSize: '1rem', width: '20px', textAlign: 'center' }}>{feat.icon}</span>
                                        <span>{feat.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Price Breakdown */}
                        <div style={{
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            paddingTop: '1.25rem',
                        }}>
                            {/* Subscription line */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                fontSize: '0.88rem', color: '#bbb',
                                marginBottom: '0.4rem',
                            }}>
                                <span>{isAnnual ? t('Suscripción Anual') : t('Suscripción Mensual')}</span>
                                <span>{formatCurrency(originalPrice)}</span>
                            </div>

                            {/* Discount line */}
                            {discountPercent > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        fontSize: '0.88rem', color: '#22c55e',
                                        marginBottom: '0.4rem',
                                    }}
                                >
                                    <span>{t('Descuento ({porcentaje}%)', { porcentaje: discountPercent })}</span>
                                    <span>-{formatCurrency(discountAmount)}</span>
                                </motion.div>
                            )}

                            {/* Tax line */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                fontSize: '0.85rem', color: '#777',
                                marginBottom: '0.85rem',
                            }}>
                                <span>{t('Impuesto estimado')}</span>
                                <span>{formatCurrency(0)}</span>
                            </div>

                            {/* Total */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingTop: '0.85rem',
                                borderTop: '1px solid rgba(255,255,255,0.08)',
                            }}>
                                <span style={{
                                    fontSize: '0.95rem', fontWeight: 700, color: '#fff',
                                }}>
                                    {t('Monto a pagar hoy')}
                                </span>
                                <span style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    fontSize: '1.15rem', fontWeight: 800, color: '#fff',
                                }}>
                                    {formatCurrency(discountPercent > 0 ? finalPrice : originalPrice)}
                                </span>
                            </div>

                            {/* Fine print */}
                            <p style={{
                                fontSize: '0.75rem', color: '#888',
                                marginTop: '1.25rem', lineHeight: 1.5,
                            }}>
                                {isAnnual
                                    ? t('Se renueva anualmente hasta que canceles.')
                                    : t('Se renueva mensualmente hasta que canceles.')}
                                {' '}{t('Cancela en cualquier momento en Configuración.')}
                            </p>
                        </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

PaymentModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSuccess: PropTypes.func.isRequired,
    price: PropTypes.string,
    planName: PropTypes.string,
    pricingMode: PropTypes.string,
    tier: PropTypes.string,
    isAnnual: PropTypes.bool,
    userId: PropTypes.string
};

export default PaymentModal;