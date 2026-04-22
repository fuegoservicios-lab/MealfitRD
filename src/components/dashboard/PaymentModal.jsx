import { useState, useCallback, useEffect } from "react";
import { PayPalScriptProvider, PayPalButtons, FUNDING } from "@paypal/react-paypal-js";
import { X, CreditCard, Sparkles, Lock, Tag, Check, AlertCircle, Loader2, ChevronRight, Zap, User, Calendar, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PropTypes from 'prop-types';
import { fetchWithAuth } from '../../config/api';

/* ─── Plan Feature Map ─── */
const PLAN_FEATURES = {
    basic: [
        { icon: "⚡", text: "50 Créditos de IA al mes" },
        { icon: "👁️", text: "Asistente IA con Visión" },
        { icon: "🧠", text: "Memoria a Largo Plazo" },
        { icon: "📋", text: "Historial de Planes" },
    ],
    plus: [
        { icon: "⚡", text: "200 Créditos de IA al mes" },
        { icon: "🛒", text: "Registro de Compras Inteligente" },
        { icon: "📊", text: "Seguimiento de Progreso" },
        { icon: "🎯", text: "Analizador de Macros" },
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
    
    // New payment flow states
    const [paymentMethod, setPaymentMethod] = useState('card');
    const [isProcessing, setIsProcessing] = useState(false);
    const [cardDetails, setCardDetails] = useState({ name: '', number: '', exp: '', cvc: '' });

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

    const handleCreateSubscription = (data, actions) => {
        const paypalPlanId = PLAN_IDS[isAnnual ? 'annual' : 'monthly'][tier];
        if (paypalPlanId.includes("PLACEHOLDER")) {
            alert("Plan ID Anual no configurado.");
            return Promise.reject(new Error("Missing Plan ID"));
        }

        const payload = { 'plan_id': paypalPlanId };

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

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {/* Overlay */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: '#0a0a0a',
                    overflowY: 'auto',
                    display: 'flex',
                }}
            >
                {/* Close */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 10000,
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
                    <X size={20} />
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
                        padding: isMobile ? '5rem 1.5rem 2rem' : '4rem 5%',
                        borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
                        borderBottom: isMobile ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        background: '#0a0a0a',
                    }}>
                        <div style={{ maxWidth: '480px', width: '100%' }}>
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
                                <CreditCard size={18} /> Tarjeta
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
                                                <h4 style={{ color: '#fff', fontSize: '0.95rem', margin: '0 0 0.35rem 0', fontFamily: "'Outfit', sans-serif" }}>Paga con tu tarjeta local</h4>
                                                <p style={{ color: '#aaa', fontSize: '0.8rem', margin: 0, lineHeight: 1.4 }}>Procesamos todas las tarjetas de débito o crédito de <b>República Dominicana</b>. El pago es seguro vía PayPal. <span style={{ color: '#fff' }}>No necesitas abrir ni tener una cuenta de PayPal.</span></p>
                                            </div>
                                        </div>
                                        <PayPalScriptProvider options={initialOptions}>
                                            <PayPalButtons
                                                fundingSource={FUNDING.CARD}
                                                style={{ shape: "rect", color: "black", label: "subscribe", height: 50, tagline: false }}
                                                createSubscription={handleCreateSubscription}
                                                onApprove={async (data) => { try { onSuccess(data.subscriptionID); } catch (err) { console.error(err); } }}
                                                onError={(err) => console.error("PayPal Card Error:", err)}
                                                onCancel={() => { }}
                                            />
                                        </PayPalScriptProvider>
                                        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#999', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                                            <Lock size={12} /> Transacción 100% cifrada y asegurada internacionalmente
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
                                                <h4 style={{ color: '#fff', fontSize: '0.95rem', margin: '0 0 0.35rem 0', fontFamily: "'Outfit', sans-serif" }}>Paga seguro con PayPal</h4>
                                                <p style={{ color: '#aaa', fontSize: '0.8rem', margin: 0, lineHeight: 1.4 }}>Serás redirigido a la pasarela oficial de PayPal. Puedes usar tu balance de PayPal o asociar una tarjeta allí sin crear cuenta nueva.</p>
                                            </div>
                                        </div>
                                        <PayPalScriptProvider options={initialOptions}>
                                            <PayPalButtons
                                                fundingSource={FUNDING.PAYPAL}
                                                style={{ shape: "rect", color: "gold", label: "subscribe", height: 50, tagline: false }}
                                                createSubscription={handleCreateSubscription}
                                                onApprove={async (data) => { try { onSuccess(data.subscriptionID); } catch (err) { console.error(err); } }}
                                                onError={(err) => console.error("PayPal Error:", err)}
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
                                fontSize: '0.75rem', color: '#888',
                                marginTop: '1.25rem', lineHeight: 1.5,
                            }}>
                                Se renueva {isAnnual ? 'anualmente' : 'mensualmente'} hasta que canceles.
                                {' '}Cancela en cualquier momento en Configuración.
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
    tier: PropTypes.string,
    isAnnual: PropTypes.bool
};

export default PaymentModal;