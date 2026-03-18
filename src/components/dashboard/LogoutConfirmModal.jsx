import { useState, useCallback } from 'react';
import { LogOut } from 'lucide-react';
import styles from './LogoutConfirmModal.module.css';

const LogoutConfirmModal = ({ isOpen, onConfirm, onCancel, userEmail }) => {
    const [isClosing, setIsClosing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onCancel();
        }, 200);
    }, [onCancel]);

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
            <div className={`${styles.card} ${isLoading ? styles.loading : ''}`}>
                <h2 className={styles.title}>
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
