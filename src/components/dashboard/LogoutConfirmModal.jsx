import { useState, useCallback } from 'react';
import { LogOut } from 'lucide-react';
import styles from './LogoutConfirmModal.module.css';
// [P2-CUSTOM-MODALS-A11Y · 2026-05-24] Hook SSOT de defenses a11y mínimas
// (focus trap + ESC + restore focus + body overflow + role/aria). Pre-fix
// este modal NO tenía role="dialog", aria-modal, focus trap ni ESC
// handler — keyboard users no podían cerrar con ESC, screen readers no
// anunciaban como modal, y el foco se perdía tras cerrar.
import { useModalAccessibility } from '../../hooks/useModalAccessibility';

const LogoutConfirmModal = ({ isOpen, onConfirm, onCancel, userEmail }) => {
    const [isClosing, setIsClosing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleClose = useCallback(() => {
        if (isLoading) return;
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onCancel();
        }, 200);
    }, [onCancel, isLoading]);

    // [P2-CUSTOM-MODALS-A11Y] disableClose=isLoading evita que ESC/backdrop
    // cierre el modal durante logout en progreso (logout es operación
    // irreversible — interrumpir a mitad deja state inconsistente).
    const { containerRef } = useModalAccessibility({
        isOpen,
        onClose: handleClose,
        disableClose: isLoading,
    });

    const handleConfirm = useCallback(async () => {
        setIsLoading(true);
        try {
            await onConfirm();
        } finally {
            setIsLoading(false);
            setIsClosing(false);
        }
    }, [onConfirm]);

    const handleOverlayClick = useCallback((e) => {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    }, [handleClose]);

    if (!isOpen) return null;

    return (
        <div
            className={`${styles.overlay} ${isClosing ? styles.overlayClosing : ''}`}
            onClick={handleOverlayClick}
        >
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="logout-confirm-title"
                tabIndex={-1}
                className={`${styles.card} ${isLoading ? styles.loading : ''}`}
            >
                <h2 id="logout-confirm-title" className={styles.title}>
                    ¿Confirmas que quieres{'\n'}cerrar sesión?
                </h2>
                <p className={styles.subtitle}>
                    ¿Cerrar sesión de MealfitRD como{' '}
                    <span className={styles.email}>{userEmail || 'tu cuenta'}</span>?
                </p>

                <div className={styles.actions}>
                    <button
                        className={styles.confirmBtn}
                        onClick={handleConfirm}
                        disabled={isLoading}
                        id="logout-confirm-btn"
                    >
                        <LogOut size={16} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
                        {isLoading ? 'Cerrando sesión...' : 'Cerrar sesión'}
                    </button>
                    <button
                        className={styles.cancelBtn}
                        onClick={handleClose}
                        disabled={isLoading}
                        id="logout-cancel-btn"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LogoutConfirmModal;
