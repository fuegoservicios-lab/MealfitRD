import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { X, ShieldCheck, CreditCard, Sparkles, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PropTypes from 'prop-types';

const PaymentModal = ({ isOpen, onClose, onSuccess, price = "25.00", planName = "Suscripción Plus", tier = "plus" }) => {

    // Configuración de PayPal para suscripciones
    const initialOptions = {
        "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID || "AX8mhI1HOizJC0A2RrmcEz61KYxDj9-j_mEjBSv2D7-bemszv5zl8EMkYklQAwicdCHjqAF1M2_p6Lgd",
        currency: "USD",
        intent: "subscription",
        vault: true // Necesario para suscripciones
    };

    // Mapeo seguro de Plan IDs desde tu .env de React
    const PLAN_IDS = {
        basic: import.meta.env.VITE_PAYPAL_PLAN_BASIC || "P-YOUR_BASIC_PLAN_ID_HERE",
        plus: import.meta.env.VITE_PAYPAL_PLAN_PLUS || "P-YOUR_PLUS_PLAN_ID_HERE",
        ultra: import.meta.env.VITE_PAYPAL_PLAN_ULTRA || "P-YOUR_ULTRA_PLAN_ID_HERE"
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {/* Overlay Oscuro con Blur Mejorado */}
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(15, 23, 42, 0.7)',
                    backdropFilter: 'blur(12px)',
                    padding: '1rem'
                }}
                onClick={onClose}
            >
                {/* Tarjeta del Modal */}
                <motion.div
                    onClick={(e) => e.stopPropagation()}
                    initial={{ opacity: 0, scale: 0.9, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    style={{
                        background: '#ffffff',
                        padding: '2.5rem 2rem',
                        borderRadius: '2rem',
                        width: '100%',
                        maxWidth: '420px',
                        position: 'relative',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3), 0 0 40px rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(226, 232, 240, 0.8)',
                        overflow: 'hidden'
                    }}
                >
                    {/* Efecto de Brillo de Fondo */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '150px',
                        background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.05) 0%, rgba(255,255,255,0) 100%)',
                        pointerEvents: 'none'
                    }} />

                    {/* Botón Cerrar */}
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute',
                            top: '1.25rem',
                            right: '1.25rem',
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#64748B',
                            transition: 'all 0.2s ease',
                            zIndex: 10
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#F1F5F9';
                            e.currentTarget.style.color = '#0F172A';
                            e.currentTarget.style.transform = 'rotate(90deg)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#F8FAFC';
                            e.currentTarget.style.color = '#64748B';
                            e.currentTarget.style.transform = 'rotate(0deg)';
                        }}
                    >
                        <X size={18} />
                    </button>

                    {/* Header del Modal */}
                    <div style={{ textAlign: 'center', marginBottom: '2rem', position: 'relative' }}>
                        
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.1, type: "spring" }}
                            style={{
                                width: 72,
                                height: 72,
                                background: 'linear-gradient(135deg, #ECFEFF 0%, #DBEAFE 100%)',
                                borderRadius: '1.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 1.5rem',
                                color: '#2563EB',
                                boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.2), inset 0 2px 4px rgba(255,255,255,0.5)',
                                transform: 'rotate(-5deg)'
                            }}
                        >
                            <motion.div
                                animate={{ rotate: [0, -5, 5, -5, 0] }}
                                transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                            >
                                <CreditCard size={36} strokeWidth={1.5} />
                            </motion.div>
                        </motion.div>
                        
                        <h2 style={{ 
                            fontSize: '1.75rem', 
                            fontWeight: 800, 
                            color: '#0F172A', 
                            marginBottom: '0.75rem', 
                            lineHeight: 1.2,
                            letterSpacing: '-0.025em'
                        }}>
                            {planName}
                        </h2>
                        
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: '#F1F5F9',
                            padding: '0.35rem 0.85rem',
                            borderRadius: '2rem',
                            marginBottom: '1rem',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: '#334155'
                        }}>
                            Generaciones Ilimitadas
                        </div>

                        <div style={{ marginTop: '0.5rem' }}>
                            <span style={{ fontSize: '2.5rem', fontWeight: 900, color: '#1E293B', letterSpacing: '-0.05em' }}>
                                ${price}
                            </span>
                            <span style={{ fontSize: '1rem', fontWeight: 500, color: '#64748B', marginLeft: '0.25rem' }}>
                                USD / mes
                            </span>
                        </div>
                    </div>

                    {/* Contenedor de Botones PayPal */}
                    <div style={{ minHeight: '150px', position: 'relative', zIndex: 1, marginBottom: '0.5rem' }}>
                        <PayPalScriptProvider options={initialOptions}>
                            <PayPalButtons
                                style={{
                                    layout: "vertical",
                                    shape: "pill",
                                    color: "gold",
                                    label: "subscribe",
                                    height: 48
                                }}
                                createSubscription={(data, actions) => {
                                    const paypalPlanId = PLAN_IDS[tier];
                                    if (paypalPlanId.includes("PLACEHOLDER")) {
                                        alert("Error: Faltan los Plan IDs configurados en .env");
                                        return actions.reject();
                                    }
                                    return actions.subscription.create({
                                        'plan_id': paypalPlanId
                                    });
                                }}
                                onApprove={async (data, actions) => {
                                    try {
                                        console.log("Suscripción exitosa en UI. Validando en Backend. ID:", data.subscriptionID);
                                        // Pasamos el subscriptionID al onSuccess callback para verificar
                                        onSuccess(data.subscriptionID);
                                    } catch (err) {
                                        console.error("Error confirmando suscripción:", err);
                                        alert("Hubo un error intern. Por favor contáctanos.");
                                    }
                                }}
                                onError={(err) => {
                                    console.error("Error PayPal:", err);
                                }}
                                onCancel={() => {
                                    console.log("Usuario canceló el proceso de suscripción");
                                }}
                            />
                        </PayPalScriptProvider>
                    </div>

                    {/* Footer de Seguridad */}
                    <div style={{
                        marginTop: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#10B981',
                            background: '#ECFDF5',
                            padding: '0.5rem 1rem',
                            borderRadius: '2rem',
                            border: '1px solid #D1FAE5',
                            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.1)'
                        }}>
                            <Lock size={14} />
                            <span>Pago cifrado y 100% seguro</span>
                        </div>
                        <p style={{
                            fontSize: '0.75rem',
                            color: '#94A3B8',
                            marginTop: '0.5rem',
                            textAlign: 'center',
                            fontWeight: 500
                        }}>
                            Tu suscripción se renovará automáticamente.<br/>Puedes cancelar en cualquier momento.
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
    tier: PropTypes.string
};

export default PaymentModal;