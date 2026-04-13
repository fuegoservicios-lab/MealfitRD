import { useState, useCallback, useEffect } from "react";
import { PayPalScriptProvider, PayPalButtons, FUNDING } from "@paypal/react-paypal-js";
import { X, CreditCard, Sparkles, Lock, Tag, Check, AlertCircle, Loader2, ChevronRight, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PropTypes from 'prop-types';
import { fetchWithAuth } from '../../config/api';

/* ─── Plan Feature Map ─── */
const PLAN_FEATURES = {
    basic: [
        { icon: "⚡", text: "50 Créditos de IA al mes" },
        { icon: "👁️", text: "Asistente IA con Visión" },
        { icon: "🧠", text: "Memoria a Largo Plazo" },
        { icon: "🔄", text: "Rotación de Platos" },
        { icon: "📋", text: "Historial de Planes" },
    ],
    plus: [
        { icon: "⚡", text: "200 Créditos de IA al mes" },
        { icon: "🛒", text: "Registro de Compras Inteligente" },
        { icon: "📊", text: "Seguimiento de Progreso" },
        { icon: "🎯", text: "Analizador de Macros" },
        { icon: "🔄", text: "Rotación Autónoma de Platos" },
    ],
    ultra: [
        { icon: "∞", text: "Créditos Ilimitados" },
        { icon: "🚀", text: "Generación Ilimitada de Planes" },
        { icon: "🔮", text: "Acceso Anticipado a Funciones" },
        { icon: "👑", text: "Soporte Prioritario VIP" },
    ]
};

const PLAN_DISPLAY = {
    basic: "Plan Básico",
    plus: "Plan Plus",
    ultra: "Plan Ultra Ilimitado",
};

const PaymentModal = ({
    isOpen, onClose, onSuccess,
    price = "25.00", planName = "Suscripción Plus",
    tier = "plus", isAnnual = false
}) => {
    const [couponCode, setCouponCode] = useState('');
    const [couponLoading, setCouponLoading] = useState(false);
    const [couponResult, setCouponResult] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    // PayPal
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
            setCouponResult({ valid: false, message: 'Error validando el código.' });
        } finally {
            setCouponLoading(false);
        }
    }, [couponCode, tier]);

    const originalPrice = parseFloat(price);
    const discountPercent = couponResult?.valid ? couponResult.discount_percent : 0;
    const discountAmount = (originalPrice * discountPercent / 100);
    const finalPrice = (originalPrice - discountAmount).toFixed(2);
    const features = PLAN_FEATURES[tier] || PLAN_FEATURES.plus;

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {/* Overlay */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0, 0, 0, 0.9)',
                    padding: '1rem',
                }}
            >
                {/* Modal Container */}
                <motion.div
                    onClick={(e) => e.stopPropagation()}
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: 10 }}
                    transition={{ type: "spring", damping: 30, stiffness: 350 }}
                    style={{
                        background: '#1a1a1a',
                        borderRadius: '1.25rem',
                        width: '100%',
                        maxWidth: '820px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        position: 'relative',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                    }}
                >
                    {/* Close */}
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute', top: '1rem', right: '1rem', zIndex: 20,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '50%', width: 32, height: 32,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: '#999',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#999'; }}
                    >
                        <X size={15} />
                    </button>

                    {/* ═══════ LEFT — Forma de pago ═══════ */}
                    <div style={{
                        flex: isMobile ? 'none' : '1 1 55%',
                        padding: isMobile ? '1.75rem 1.5rem 1.5rem' : '2.25rem 2rem',
                        borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
                        borderBottom: isMobile ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    }}>
                        <h2 style={{
                            fontFamily: "'Outfit', sans-serif",
                            fontSize: '1.35rem', fontWeight: 700,
                            color: '#fff', marginBottom: '0.35rem',
                        }}>
                            Forma de pago
                        </h2>
                        <p style={{
                            fontSize: '0.85rem', color: '#777',
                            marginBottom: '1.75rem',
                        }}>
                            Elige tu método de pago preferido
                        </p>

                        {/* PayPal Buttons */}
                        <div style={{ minHeight: '120px', marginBottom: '1.5rem' }}>
                            <PayPalScriptProvider options={initialOptions}>
                                {/* Card First */}
                                <div style={{ marginBottom: '0.5rem' }}>
                                    <PayPalButtons
                                        fundingSource={FUNDING.CARD}
                                        style={{ shape: "rect", color: "black", label: "subscribe", height: 48, tagline: false }}
                                        createSubscription={(data, actions) => {
                                            const paypalPlanId = PLAN_IDS[isAnnual ? 'annual' : 'monthly'][tier];
                                            if (paypalPlanId.includes("PLACEHOLDER")) {
                                                alert("Plan ID Anual no configurado.");
                                                return Promise.reject(new Error("Missing Plan ID"));
                                            }
                                            return actions.subscription.create({ 'plan_id': paypalPlanId });
                                        }}
                                        onApprove={async (data) => { try { onSuccess(data.subscriptionID); } catch (err) { console.error(err); } }}
                                        onError={(err) => console.error("PayPal Card Error:", err)}
                                        onCancel={() => {}}
                                    />
                                </div>
                                {/* PayPal Second */}
                                <PayPalButtons
                                    fundingSource={FUNDING.PAYPAL}
                                    style={{ shape: "rect", color: "gold", label: "subscribe", height: 48, tagline: false }}
                                    createSubscription={(data, actions) => {
                                        const paypalPlanId = PLAN_IDS[isAnnual ? 'annual' : 'monthly'][tier];
                                        if (paypalPlanId.includes("PLACEHOLDER")) {
                                            alert("Plan ID Anual no configurado.");
                                            return Promise.reject(new Error("Missing Plan ID"));
                                        }
                                        return actions.subscription.create({ 'plan_id': paypalPlanId });
                                    }}
                                    onApprove={async (data) => { try { onSuccess(data.subscriptionID); } catch (err) { console.error(err); } }}
                                    onError={(err) => console.error("PayPal Error:", err)}
                                    onCancel={() => {}}
                                />
                            </PayPalScriptProvider>
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
                                Código de descuento
                            </label>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                                    {couponLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Aplicar'}
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

                    {/* ═══════ RIGHT — Plan summary ═══════ */}
                    <div style={{
                        flex: isMobile ? 'none' : '1 1 45%',
                        padding: isMobile ? '1.5rem' : '2.25rem 2rem',
                        display: 'flex', flexDirection: 'column',
                        justifyContent: 'space-between',
                    }}>
                        {/* Plan Header */}
                        <div>
                            <h2 style={{
                                fontFamily: "'Outfit', sans-serif",
                                fontSize: '1.35rem', fontWeight: 700,
                                color: '#fff', marginBottom: '1.25rem',
                            }}>
                                {PLAN_DISPLAY[tier] || planName}
                            </h2>

                            <p style={{
                                fontSize: '0.78rem', fontWeight: 600,
                                color: '#888', textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                marginBottom: '0.85rem',
                            }}>
                                Características principales
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
                                <span>Suscripción {isAnnual ? 'Anual' : 'Mensual'}</span>
                                <span>US${originalPrice.toFixed(2)}</span>
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
                                    <span>Descuento ({discountPercent}%)</span>
                                    <span>-US${discountAmount.toFixed(2)}</span>
                                </motion.div>
                            )}

                            {/* Tax line */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                fontSize: '0.85rem', color: '#777',
                                marginBottom: '0.85rem',
                            }}>
                                <span>Impuesto estimado</span>
                                <span>US$0.00</span>
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
                                    Monto a pagar hoy
                                </span>
                                <span style={{
                                    fontFamily: "'Outfit', sans-serif",
                                    fontSize: '1.15rem', fontWeight: 800, color: '#fff',
                                }}>
                                    US${discountPercent > 0 ? finalPrice : originalPrice.toFixed(2)}
                                </span>
                            </div>

                            {/* Fine print */}
                            <p style={{
                                fontSize: '0.7rem', color: '#555',
                                marginTop: '1.25rem', lineHeight: 1.5,
                            }}>
                                Se renueva {isAnnual ? 'anualmente' : 'mensualmente'} hasta que canceles.
                                {' '}Cancela en cualquier momento en Configuración.
                                {discountPercent > 0 && ' *El descuento es visual, PayPal procesa el monto estándar.'}
                            </p>
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
    tier: PropTypes.string,
    isAnnual: PropTypes.bool
};

export default PaymentModal;