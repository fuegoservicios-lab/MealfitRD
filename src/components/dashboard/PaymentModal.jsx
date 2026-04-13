import { useState, useCallback, useEffect } from "react";
import { PayPalScriptProvider, PayPalButtons, FUNDING } from "@paypal/react-paypal-js";
import { X, ShieldCheck, CreditCard, Sparkles, Lock, Tag, Check, AlertCircle, Loader2, Receipt, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PropTypes from 'prop-types';
import { fetchWithAuth } from '../../config/api';

/* ─── Plan Feature Map ─── */
const PLAN_FEATURES = {
    basic: [
        "50 Créditos al mes",
        "Asistente IA con Visión",
        "Memoria a Largo Plazo",
        "Rotación de Platos",
        "Historial de Planes"
    ],
    plus: [
        "200 Créditos al mes",
        "Registro de Compras",
        "Seguimiento de Progreso",
        "Analizador de Macros",
        "Rotación Autónoma de Platos",
    ],
    ultra: [
        "Créditos Ilimitados",
        "Generación Ilimitada de Planes",
        "Acceso Anticipado a Nuevas Funciones",
        "Soporte Prioritario VIP",
    ]
};

/* ─── Styles Object ─── */
const s = {
    overlay: {
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(10, 10, 30, 0.75)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        padding: '1rem',
    },
    card: {
        background: '#FFFFFF',
        borderRadius: '1.5rem',
        width: '100%', maxWidth: '780px',
        position: 'relative',
        boxShadow: '0 30px 60px -15px rgba(0,0,0,0.35), 0 0 60px rgba(99,102,241,0.08)',
        border: '1px solid rgba(226, 232, 240, 0.6)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'row',
    },
    cardMobile: {
        flexDirection: 'column', maxWidth: '440px',
    },
    closeBtn: {
        position: 'absolute', top: '1rem', right: '1rem', zIndex: 20,
        background: 'rgba(241,245,249,0.9)', border: '1px solid #E2E8F0',
        borderRadius: '50%', width: 34, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: '#64748B',
        transition: 'all 0.2s ease',
    },
    // LEFT COLUMN — Order Summary
    leftCol: {
        flex: '1 1 48%',
        background: 'linear-gradient(160deg, #0F0C29 0%, #1A1145 50%, #302b63 100%)',
        color: '#FFFFFF',
        padding: '2rem 1.75rem',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '420px',
        position: 'relative',
        overflow: 'hidden',
    },
    leftGlow: {
        position: 'absolute', top: '-60px', right: '-60px',
        width: '200px', height: '200px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
    },
    planBadge: {
        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '99px', padding: '0.3rem 0.85rem',
        fontSize: '0.75rem', fontWeight: 700,
        letterSpacing: '0.04em', textTransform: 'uppercase',
        color: '#C7D2FE', marginBottom: '1rem',
    },
    planTitle: {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '1.6rem', fontWeight: 800,
        letterSpacing: '-0.02em', lineHeight: 1.15,
        marginBottom: '1.25rem',
    },
    featureList: {
        listStyle: 'none', padding: 0, margin: '0 0 1.5rem 0',
        display: 'flex', flexDirection: 'column', gap: '0.6rem',
    },
    featureItem: {
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        fontSize: '0.88rem', color: 'rgba(226,232,240,0.85)',
    },
    featureCheck: {
        color: '#818CF8', background: 'rgba(99,102,241,0.2)',
        borderRadius: '50%', padding: '2px', flexShrink: 0,
    },
    divider: {
        height: '1px',
        background: 'rgba(255,255,255,0.12)',
        margin: '0.75rem 0',
    },
    // Discount code
    discountRow: {
        display: 'flex', gap: '0.5rem', marginBottom: '0.75rem',
    },
    discountInput: {
        flex: 1, padding: '0.6rem 0.85rem',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '0.75rem', color: '#FFFFFF',
        fontSize: '0.88rem', fontFamily: "'Outfit', sans-serif",
        outline: 'none',
    },
    discountBtn: {
        padding: '0.6rem 1rem',
        background: 'rgba(99,102,241,0.25)',
        border: '1px solid rgba(99,102,241,0.4)',
        borderRadius: '0.75rem', color: '#C7D2FE',
        fontSize: '0.82rem', fontWeight: 700,
        cursor: 'pointer', transition: 'all 0.2s ease',
        display: 'flex', alignItems: 'center', gap: '0.35rem',
        whiteSpace: 'nowrap',
    },
    discountBtnDisabled: {
        opacity: 0.5, cursor: 'not-allowed',
    },
    discountMsg: {
        fontSize: '0.78rem', marginBottom: '0.5rem', display: 'flex',
        alignItems: 'center', gap: '0.35rem',
    },
    // Price summary
    priceRow: {
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', fontSize: '0.9rem',
        color: 'rgba(203,213,225,0.8)', marginBottom: '0.4rem',
    },
    priceTotal: {
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginTop: '0.25rem',
    },
    totalLabel: {
        fontSize: '1rem', fontWeight: 700, color: '#FFFFFF',
    },
    totalAmount: {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '1.75rem', fontWeight: 800,
        background: 'linear-gradient(135deg, #FFFFFF, #C7D2FE)',
        backgroundClip: 'text', WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    // RIGHT COLUMN — Payment
    rightCol: {
        flex: '1 1 52%', padding: '2rem 1.75rem',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
    },
    payTitle: {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '1.2rem', fontWeight: 700,
        color: '#0F172A', marginBottom: '0.4rem',
    },
    paySubtitle: {
        fontSize: '0.88rem', color: '#64748B',
        marginBottom: '1.5rem',
    },
    paypalWrap: {
        minHeight: '130px', position: 'relative', zIndex: 1,
        marginBottom: '1rem',
    },
    securityBadge: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '0.5rem', fontSize: '0.78rem', fontWeight: 600,
        color: '#10B981',
        background: '#ECFDF5', padding: '0.45rem 0.85rem',
        borderRadius: '99px', border: '1px solid #D1FAE5',
        margin: '0.75rem auto 0',
    },
    renewNote: {
        fontSize: '0.72rem', color: '#94A3B8', textAlign: 'center',
        marginTop: '0.75rem', fontWeight: 500,
    },
};

/* ═══════════════════════════════════════════════════ */
const PaymentModal = ({
    isOpen, onClose, onSuccess,
    price = "25.00", planName = "Suscripción Plus",
    tier = "plus", isAnnual = false
}) => {
    const [couponCode, setCouponCode] = useState('');
    const [couponLoading, setCouponLoading] = useState(false);
    const [couponResult, setCouponResult] = useState(null); // { valid, discount_percent, message }
    const [isMobile, setIsMobile] = useState(window.innerWidth < 700);

    // Listen for resize
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 700);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    // PayPal config
    const initialOptions = {
        "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID || "ARVcVpVZ-8CQvKUs5hZEPpvUYmt-V4ahVzHblAkOQ343_N83vcwlV_8IUHgvW2aH6dKUUtiZ5xIC4YnP",
        currency: "USD",
        intent: "subscription",
        vault: true
    };

    const PLAN_IDS = {
        monthly: {
            basic: import.meta.env.VITE_PAYPAL_PLAN_BASIC_MONTHLY || import.meta.env.VITE_PAYPAL_PLAN_BASIC || "P-3EC609010T222652UNHGGQSY",
            plus: import.meta.env.VITE_PAYPAL_PLAN_PLUS_MONTHLY || import.meta.env.VITE_PAYPAL_PLAN_PLUS || "P-2N87184189425672JNHGGS4I",
            ultra: import.meta.env.VITE_PAYPAL_PLAN_ULTRA_MONTHLY || import.meta.env.VITE_PAYPAL_PLAN_ULTRA || "P-0D041124VT473392JNHGGTUI"
        },
        annual: {
            basic: import.meta.env.VITE_PAYPAL_PLAN_BASIC_ANNUAL || "P-ANNUAL_BASIC_PLACEHOLDER",
            plus: import.meta.env.VITE_PAYPAL_PLAN_PLUS_ANNUAL || "P-ANNUAL_PLUS_PLACEHOLDER",
            ultra: import.meta.env.VITE_PAYPAL_PLAN_ULTRA_ANNUAL || "P-ANNUAL_ULTRA_PLACEHOLDER"
        }
    };

    // ── Discount Validation ──
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
        } catch (err) {
            setCouponResult({ valid: false, message: 'Error validando el código. Intenta de nuevo.' });
        } finally {
            setCouponLoading(false);
        }
    }, [couponCode, tier]);

    // ── Price Calculations ──
    const originalPrice = parseFloat(price);
    const discountPercent = couponResult?.valid ? couponResult.discount_percent : 0;
    const discountAmount = (originalPrice * discountPercent / 100);
    const finalPrice = (originalPrice - discountAmount).toFixed(2);

    const features = PLAN_FEATURES[tier] || PLAN_FEATURES.plus;

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={s.overlay}
                onClick={onClose}
            >
                <motion.div
                    onClick={(e) => e.stopPropagation()}
                    initial={{ opacity: 0, scale: 0.92, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: "spring", damping: 28, stiffness: 320 }}
                    style={{
                        ...s.card,
                        ...(isMobile ? s.cardMobile : {})
                    }}
                >
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        style={s.closeBtn}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#0F172A'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(241,245,249,0.9)'; e.currentTarget.style.color = '#64748B'; }}
                    >
                        <X size={16} />
                    </button>

                    {/* ═══════ LEFT COLUMN — Order Summary ═══════ */}
                    <div style={s.leftCol}>
                        <div style={s.leftGlow} />

                        <div style={{ position: 'relative', zIndex: 2 }}>
                            {/* Plan Badge */}
                            <div style={s.planBadge}>
                                <Sparkles size={13} />
                                <span>{isAnnual ? 'Facturación Anual' : 'Facturación Mensual'}</span>
                            </div>

                            {/* Plan Name */}
                            <h2 style={s.planTitle}>{planName}</h2>

                            {/* Features */}
                            <ul style={s.featureList}>
                                {features.map((feat, idx) => (
                                    <li key={idx} style={s.featureItem}>
                                        <Check size={15} style={s.featureCheck} />
                                        <span>{feat}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* ── Bottom: Discount + Price ── */}
                        <div style={{ position: 'relative', zIndex: 2 }}>
                            <div style={s.divider} />

                            {/* Discount Code Input */}
                            <label style={{
                                fontSize: '0.78rem', fontWeight: 600,
                                color: 'rgba(203,213,225,0.6)',
                                letterSpacing: '0.04em', textTransform: 'uppercase',
                                marginBottom: '0.5rem', display: 'block',
                            }}>
                                <Tag size={12} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
                                Código de descuento
                            </label>

                            <div style={s.discountRow}>
                                <input
                                    type="text"
                                    placeholder="Ej: LAUNCH50"
                                    value={couponCode}
                                    onChange={(e) => {
                                        setCouponCode(e.target.value.toUpperCase());
                                        if (couponResult) setCouponResult(null);
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                                    style={{
                                        ...s.discountInput,
                                        ...(couponResult?.valid ? { borderColor: '#34D399' } : {}),
                                        ...(couponResult && !couponResult.valid ? { borderColor: '#F87171' } : {})
                                    }}
                                />
                                <button
                                    onClick={handleApplyCoupon}
                                    disabled={couponLoading || !couponCode.trim()}
                                    style={{
                                        ...s.discountBtn,
                                        ...(couponLoading || !couponCode.trim() ? s.discountBtnDisabled : {}),
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!couponLoading && couponCode.trim()) {
                                            e.currentTarget.style.background = 'rgba(99,102,241,0.4)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(99,102,241,0.25)';
                                    }}
                                >
                                    {couponLoading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                                    {couponLoading ? 'Validando...' : 'Aplicar'}
                                </button>
                            </div>

                            {/* Coupon Result Message */}
                            {couponResult && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        ...s.discountMsg,
                                        color: couponResult.valid ? '#34D399' : '#F87171',
                                    }}
                                >
                                    {couponResult.valid
                                        ? <Check size={14} />
                                        : <AlertCircle size={14} />
                                    }
                                    <span>{couponResult.message}</span>
                                </motion.div>
                            )}

                            <div style={s.divider} />

                            {/* Price Breakdown */}
                            <div style={s.priceRow}>
                                <span>Subtotal</span>
                                <span>${originalPrice.toFixed(2)} USD</span>
                            </div>

                            {discountPercent > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    style={{
                                        ...s.priceRow,
                                        color: '#34D399',
                                    }}
                                >
                                    <span>Descuento ({discountPercent}%)</span>
                                    <span>-${discountAmount.toFixed(2)} USD</span>
                                </motion.div>
                            )}

                            <div style={{ ...s.divider, background: 'rgba(255,255,255,0.2)' }} />

                            <div style={s.priceTotal}>
                                <span style={s.totalLabel}>Total a pagar</span>
                                <span style={s.totalAmount}>
                                    ${discountPercent > 0 ? finalPrice : originalPrice.toFixed(2)}
                                    <span style={{
                                        fontSize: '0.85rem', fontWeight: 500,
                                        color: 'rgba(203,213,225,0.6)',
                                        marginLeft: '0.3rem',
                                        WebkitTextFillColor: 'rgba(203,213,225,0.6)',
                                    }}>
                                        {isAnnual ? '/año' : '/mes'}
                                    </span>
                                </span>
                            </div>

                            {discountPercent > 0 && (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    style={{
                                        fontSize: '0.72rem',
                                        color: 'rgba(203,213,225,0.5)',
                                        marginTop: '0.35rem', fontStyle: 'italic',
                                    }}
                                >
                                    *El precio mostrado es visual. PayPal procesará el monto estándar.
                                </motion.p>
                            )}
                        </div>
                    </div>

                    {/* ═══════ RIGHT COLUMN — Payment Methods ═══════ */}
                    <div style={s.rightCol}>
                        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                            <div style={{
                                width: 48, height: 48,
                                background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                                borderRadius: '0.85rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 0.85rem',
                                color: '#4F46E5',
                            }}>
                                <CreditCard size={24} strokeWidth={1.5} />
                            </div>
                            <h3 style={s.payTitle}>Método de Pago</h3>
                            <p style={s.paySubtitle}>Pago procesado de forma segura por PayPal</p>
                        </div>

                        {/* PayPal Buttons — Card first, PayPal second */}
                        <div style={s.paypalWrap}>
                            <PayPalScriptProvider options={initialOptions}>
                                {/* 1. Debit/Credit Card FIRST */}
                                <div style={{ marginBottom: '0.5rem' }}>
                                    <PayPalButtons
                                        fundingSource={FUNDING.CARD}
                                        style={{
                                            shape: "pill",
                                            color: "black",
                                            label: "subscribe",
                                            height: 45,
                                            tagline: false,
                                        }}
                                        createSubscription={(data, actions) => {
                                            const targetPeriod = isAnnual ? 'annual' : 'monthly';
                                            const paypalPlanId = PLAN_IDS[targetPeriod][tier];
                                            if (paypalPlanId.includes("PLACEHOLDER")) {
                                                alert("Aviso: Aún no has configurado los Plan IDs Anuales.");
                                                return Promise.reject(new Error("Plan ID Anual faltante"));
                                            }
                                            return actions.subscription.create({ 'plan_id': paypalPlanId });
                                        }}
                                        onApprove={async (data) => {
                                            try { onSuccess(data.subscriptionID); }
                                            catch (err) { console.error("Error:", err); alert("Error interno."); }
                                        }}
                                        onError={(err) => console.error("Error PayPal Card:", err)}
                                        onCancel={() => {}}
                                    />
                                </div>
                                {/* 2. PayPal Subscribe SECOND */}
                                <PayPalButtons
                                    fundingSource={FUNDING.PAYPAL}
                                    style={{
                                        shape: "pill",
                                        color: "gold",
                                        label: "subscribe",
                                        height: 45,
                                        tagline: false,
                                    }}
                                    createSubscription={(data, actions) => {
                                        const targetPeriod = isAnnual ? 'annual' : 'monthly';
                                        const paypalPlanId = PLAN_IDS[targetPeriod][tier];
                                        if (paypalPlanId.includes("PLACEHOLDER")) {
                                            alert("Aviso: Aún no has configurado los Plan IDs Anuales.");
                                            return Promise.reject(new Error("Plan ID Anual faltante"));
                                        }
                                        return actions.subscription.create({ 'plan_id': paypalPlanId });
                                    }}
                                    onApprove={async (data) => {
                                        try { onSuccess(data.subscriptionID); }
                                        catch (err) { console.error("Error:", err); alert("Error interno."); }
                                    }}
                                    onError={(err) => console.error("Error PayPal:", err)}
                                    onCancel={() => {}}
                                />
                            </PayPalScriptProvider>
                        </div>

                        {/* Security Badges */}
                        <div style={s.securityBadge}>
                            <Lock size={13} />
                            <span>Pago cifrado y 100% seguro</span>
                        </div>

                        <p style={s.renewNote}>
                            Tu suscripción se renovará automáticamente.<br/>
                            Puedes cancelar en cualquier momento.
                        </p>
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
    tier: PropTypes.string,
    isAnnual: PropTypes.bool
};

export default PaymentModal;