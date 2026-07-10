import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
// [P2-14 · 2026-07-09] Hook SSOT de media queries (antes copia local del mismo hook).
import { useMediaQuery } from '../../hooks/useMediaQuery';

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

    // [P4-MODAL-FOCUS-SPLIT] Refs para leer onClose/disableClose frescos sin meterlos en
    // deps del effect de foco. Antes su identidad inline (el padre pasa onClose nuevo cada
    // render) re-ejecutaba el effect en cada re-render → el cleanup restauraba el foco al
    // trigger y el setTimeout re-movía el foco al modal, robándoselo al usuario.
    const onCloseRef = useRef(onClose);
    const disableCloseRef = useRef(disableClose);
    // [P4-MODAL-FOCUS-SPLIT] Sincronizar refs en effect (NO en render: el lint prohíbe
    // escribir ref.current durante el render). El listener keydown los lee en event-time,
    // siempre posterior al commit, así que ven el valor vigente sin ser deps del effect de foco.
    useEffect(() => {
        onCloseRef.current = onClose;
        disableCloseRef.current = disableClose;
    }, [onClose, disableClose]);

    useEffect(() => {
        if (isOpen) {
            // Guardar el elemento activo al abrir el modal (botón disparador)
            triggerRef.current = document.activeElement;
            // Opcional: Evitar scroll de la página trasera
            document.body.style.overflow = 'hidden';

            const handleKeyDown = (e) => {
                if (e.key === 'Escape' && !disableCloseRef.current) {
                    onCloseRef.current();
                } else if (e.key === 'Tab') {
                    // Lógica de Focus Trap
                    if (!modalRef.current) return;
                    
                    // [P3-MODAL-FOCUSTRAP-DISABLED · 2026-06-01] `:not([disabled])` en
                    // los controles: sin él, un <button disabled> (p.ej. las opciones de
                    // OptionPickerModal mientras isNavigatingOption está activo) podía ser
                    // el lastElement del trap. `.focus()` sobre un disabled es no-op → el
                    // ciclo Tab no envolvía y el foco escapaba al fondo durante el loading
                    // del picker. Alinea con el SSOT useModalAccessibility.js.
                    const focusableElements = modalRef.current.querySelectorAll(
                        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
            let focusTimer = null;
            if (modalRef.current) {
                // Pequeño timeout para asegurar que el DOM ha renderizado completamente tras AnimatePresence
                focusTimer = setTimeout(() => {
                    if (modalRef.current) modalRef.current.focus();
                }, 10);
            }

            return () => {
                if (focusTimer) clearTimeout(focusTimer);
                document.removeEventListener('keydown', handleKeyDown);
                document.body.style.overflow = '';
                // Restaurar foco al botón disparador al cerrar
                if (triggerRef.current) {
                    triggerRef.current.focus();
                }
            };
        }
        // [P4-MODAL-FOCUS-SPLIT] deps solo [isOpen]: onClose/disableClose se leen via ref.
    }, [isOpen]);

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
                    {/* [P2-MODAL-OUTLINE-A11Y · 2026-05-15] `className` +
                        CSS `:focus-visible` en index.css. Pre-fix tenía
                        `outline: 'none'` inline aplicado siempre — un
                        keyboard user que recibía el foco programático en
                        modal-open no veía indicador alguno (WCAG 2.4.7
                        Focus Visible). El reemplazo usa `:focus-visible`
                        que SOLO dispara con keyboard nav (Tab) y no con
                        click, así mouse users no ven outline molesto y
                        keyboard users sí lo ven. Anchor:
                        P2-MODAL-OUTLINE-A11Y. */}
                    <motion.div
                        ref={modalRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        tabIndex={-1}
                        className="mealfit-modal-content"
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
                            background: 'var(--bg-card)',
                            borderRadius: isMobile ? '1.5rem 1.5rem 0 0' : '1.25rem',
                            padding: isMobile ? '1.5rem 1.25rem 2rem' : '2rem',
                            width: '100%', maxWidth, position: 'relative', zIndex: 1,
                            boxShadow: isMobile ? '0 -8px 30px rgba(0,0,0,0.12)' : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            // [P2-MODAL-OUTLINE-A11Y] outline ahora gestionado
                            // por `.mealfit-modal-content:focus-visible` en
                            // index.css — keyboard users SÍ ven el indicador.
                        }}
                    >
                        {/* Drag handle — solo en móvil */}
                        {isMobile && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                                <div style={{ width: '40px', height: '4px', borderRadius: '99px', background: 'var(--border)' }} />
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
                                background: isMobile ? 'var(--bg-muted)' : 'none', border: 'none',
                                color: disableClose ? 'var(--text-light)' : 'var(--text-muted)',
                                cursor: disableClose ? 'not-allowed' : 'pointer',
                                opacity: disableClose ? 0.5 : 1,
                                display: 'flex', padding: '0.25rem',
                                borderRadius: '0.5rem', transition: 'background 0.2s, color 0.2s, opacity 0.2s'
                            }}
                            onMouseOver={(e) => { if (!disableClose) e.currentTarget.style.background = 'var(--bg-muted)'; }}
                            onMouseOut={(e) => { if (!disableClose) e.currentTarget.style.background = isMobile ? 'var(--bg-muted)' : 'none'; }}
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
