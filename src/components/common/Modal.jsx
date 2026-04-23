import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const useMediaQuery = (query) => {
    const [matches, setMatches] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia(query).matches;
        }
        return false;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }
        
        const listener = (e) => setMatches(e.matches);
        media.addEventListener('change', listener);
        
        return () => media.removeEventListener('change', listener);
    }, [matches, query]);

    return matches;
};

const Modal = ({ isOpen, onClose, titleId, children, maxWidth = '460px', disableClose = false, isBottomSheetOnMobile = false }) => {
    const modalRef = useRef(null);
    const triggerRef = useRef(null);
    const [isCloseShaking, setIsCloseShaking] = useState(false);

    const handleCloseAttempt = () => {
        if (!disableClose) { onClose(); return; }
        if (isCloseShaking) return;
        setIsCloseShaking(true);
        setTimeout(() => setIsCloseShaking(false), 400);
    };
    
    // Para responsividad
    const isDesktop = useMediaQuery('(min-width: 641px)');
    const isMobile = isBottomSheetOnMobile && !isDesktop;

    useEffect(() => {
        if (isOpen) {
            // Guardar el elemento activo al abrir el modal (botón disparador)
            triggerRef.current = document.activeElement;
            // Opcional: Evitar scroll de la página trasera
            document.body.style.overflow = 'hidden';

            const handleKeyDown = (e) => {
                if (e.key === 'Escape' && !disableClose) {
                    onClose();
                } else if (e.key === 'Tab') {
                    // Lógica de Focus Trap
                    if (!modalRef.current) return;
                    
                    const focusableElements = modalRef.current.querySelectorAll(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                    
                    if (focusableElements.length === 0) return;
                    
                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];

                    if (e.shiftKey) {
                        if (document.activeElement === firstElement || document.activeElement === modalRef.current) {
                            lastElement.focus();
                            e.preventDefault();
                        }
                    } else {
                        if (document.activeElement === lastElement) {
                            firstElement.focus();
                            e.preventDefault();
                        }
                    }
                }
            };

            document.addEventListener('keydown', handleKeyDown);

            // Mover el foco al modal inicialmente para que los lectores de pantalla comiencen allí
            if (modalRef.current) {
                // Pequeño timeout para asegurar que el DOM ha renderizado completamente tras AnimatePresence
                setTimeout(() => {
                    if (modalRef.current) modalRef.current.focus();
                }, 10);
            }

            return () => {
                document.removeEventListener('keydown', handleKeyDown);
                document.body.style.overflow = '';
                // Restaurar foco al botón disparador al cerrar
                if (triggerRef.current) {
                    triggerRef.current.focus();
                }
            };
        }
    }, [isOpen, onClose, disableClose]);

    // Variantes de animación
    const animationVariants = isMobile ? {
        initial: { y: '100%', opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: '100%', opacity: 0 },
        transition: { type: 'spring', damping: 28, stiffness: 340 }
    } : {
        initial: { opacity: 0, scale: 0.95, y: 10 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 10 },
        transition: { duration: 0.2 }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div 
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
                        alignItems: isMobile ? 'flex-end' : 'center', 
                        justifyContent: 'center', 
                        padding: isMobile ? '0' : '1.25rem'
                    }}
                >
                    {/* Backdrop */}
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        onClick={() => { if (!disableClose) onClose(); }}
                        style={{
                            position: 'absolute', inset: 0, 
                            background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)'
                        }}
                        aria-hidden="true"
                    />

                    {/* Modal Content */}
                    <motion.div
                        ref={modalRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        tabIndex={-1}
                        initial={animationVariants.initial} 
                        animate={animationVariants.animate} 
                        exit={animationVariants.exit}
                        transition={animationVariants.transition}
                        drag={isMobile ? "y" : false}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 1 }}
                        onDragEnd={(event, info) => {
                            if (isMobile && info.offset.y > 100 && !disableClose) {
                                onClose();
                            }
                        }}
                        style={{
                            background: '#FFFFFF', 
                            borderRadius: isMobile ? '1.5rem 1.5rem 0 0' : '1.25rem', 
                            padding: isMobile ? '1.5rem 1.25rem 2rem' : '2rem',
                            width: '100%', maxWidth, position: 'relative', zIndex: 1,
                            boxShadow: isMobile ? '0 -8px 30px rgba(0,0,0,0.12)' : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            outline: 'none' // Quitamos el borde default de outline al hacer focus sobre el div
                        }}
                    >
                        {/* Drag handle — solo en móvil */}
                        {isMobile && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                                <div style={{ width: '40px', height: '4px', borderRadius: '99px', background: '#E2E8F0' }} />
                            </div>
                        )}

                        <motion.button
                            onClick={handleCloseAttempt}
                            animate={isCloseShaking ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                            transition={{ duration: 0.35 }}
                            aria-label="Cerrar ventana modal"
                            aria-disabled={disableClose}
                            style={{
                                position: 'absolute', top: isMobile ? '1.25rem' : '1rem', right: isMobile ? '1.25rem' : '1rem',
                                background: isMobile ? '#F1F5F9' : 'none', border: 'none',
                                color: disableClose ? '#CBD5E1' : '#64748B',
                                cursor: disableClose ? 'not-allowed' : 'pointer',
                                opacity: disableClose ? 0.5 : 1,
                                display: 'flex', padding: '0.25rem',
                                borderRadius: '0.5rem', transition: 'background 0.2s, color 0.2s, opacity 0.2s'
                            }}
                            onMouseOver={(e) => { if (!disableClose) e.currentTarget.style.background = '#F1F5F9'; }}
                            onMouseOut={(e) => { if (!disableClose) e.currentTarget.style.background = isMobile ? '#F1F5F9' : 'none'; }}
                        >
                            <X size={isMobile ? 18 : 20} />
                        </motion.button>

                        {children}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
export default Modal;
