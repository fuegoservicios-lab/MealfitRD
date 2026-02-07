import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { X, ShieldCheck, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PropTypes from 'prop-types';

const PaymentModal = ({ isOpen, onClose, onSuccess, price = "18.00" }) => {

    // ⚠️ IMPORTANTE: 
    // Cambia "sb" por tu CLIENT ID real de producción cuando estés listo.
    // Puedes obtenerlo en: https://developer.paypal.com/dashboard/
    const initialOptions = {
        "client-id": "ASH9fFKh5vsUyXVFeLX3XFgueclSMNU6gb0xAX4a-iT7hJnTe6014ZP6MuVy-m67Ja6kBh6s90DvLu1h",
        currency: "USD",
        intent: "capture",
        // "enable-funding": "card", // Fuerza la aparición de tarjeta si es necesario
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {/* Overlay Oscuro */}
            <div style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999, // Z-index alto para tapar el sidebar/header
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(5px)'
            }}>

                {/* Tarjeta del Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.2 }}
                    style={{
                        background: 'white',
                        padding: '2rem',
                        borderRadius: '1.5rem',
                        width: '90%',
                        maxWidth: '450px',
                        position: 'relative',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}
                >
                    {/* Botón Cerrar */}
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute',
                            top: '1rem',
                            right: '1rem',
                            background: '#F1F5F9',
                            border: 'none',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#64748B',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#E2E8F0'}
                        onMouseLeave={(e) => e.target.style.background = '#F1F5F9'}
                    >
                        <X size={18} />
                    </button>

                    {/* Header del Modal */}
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <div style={{
                            width: 64,
                            height: 64,
                            background: '#EFF6FF',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1rem',
                            color: '#3B82F6',
                            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)'
                        }}>
                            <CreditCard size={32} />
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1E293B', marginBottom: '0.5rem', lineHeight: 1.2 }}>
                            Suscripción Plus
                        </h2>
                        <p style={{ color: '#64748B', fontSize: '0.95rem', lineHeight: 1.5 }}>
                            Desbloquea generaciones ilimitadas por solo <br />
                            <strong style={{ color: '#0F172A', fontSize: '1.1rem' }}>RD$999 / mes</strong> <span style={{ fontSize: '0.8rem' }}>(aprox. ${price} USD)</span>
                        </p>
                    </div>

                    {/* Contenedor de Botones PayPal */}
                    <div style={{ minHeight: '150px', position: 'relative', zIndex: 1 }}>
                        <PayPalScriptProvider options={initialOptions}>
                            <PayPalButtons
                                style={{
                                    layout: "vertical",
                                    shape: "rect",
                                    borderRadius: 12,
                                    height: 48
                                }}
                                createOrder={(data, actions) => {
                                    return actions.order.create({
                                        purchase_units: [{
                                            description: "MealfitRD Plan Plus (Mensual)",
                                            amount: { value: price }
                                        }]
                                    });
                                }}
                                onApprove={async (data, actions) => {
                                    try {
                                        const order = await actions.order.capture();
                                        console.log("Pago exitoso:", order);
                                        // Aquí podrías guardar el ID de transacción en tu BD si quisieras
                                        onSuccess();
                                    } catch (err) {
                                        console.error("Error capturando orden:", err);
                                        alert("El pago fue autorizado pero hubo un error al finalizar. Contáctanos.");
                                    }
                                }}
                                onError={(err) => {
                                    console.error("Error PayPal:", err);
                                    // No mostramos alert si el usuario cierra el popup voluntariamente
                                }}
                                onCancel={() => {
                                    console.log("Usuario canceló el pago");
                                }}
                            />
                        </PayPalScriptProvider>
                    </div>

                    {/* Footer de Seguridad */}
                    <div style={{
                        marginTop: '1.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        fontSize: '0.75rem',
                        color: '#94A3B8',
                        background: '#F8FAFC',
                        padding: '0.75rem',
                        borderRadius: '0.75rem'
                    }}>
                        <ShieldCheck size={16} color="#10B981" />
                        <span>Pagos procesados de forma segura por PayPal</span>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

PaymentModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSuccess: PropTypes.func.isRequired,
    price: PropTypes.string
};

export default PaymentModal;