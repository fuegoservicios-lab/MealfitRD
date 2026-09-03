import { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Info } from 'lucide-react';
import styles from './LogoutConfirmModal.module.css';
// [P2-CUSTOM-MODALS-A11Y · 2026-05-24] Hook SSOT de defenses a11y mínimas
// (focus trap + ESC + restore focus + body overflow + role/aria). Pre-fix
// este modal NO tenía role="dialog", aria-modal, focus trap ni ESC
// handler — keyboard users no podían cerrar con ESC, screen readers no
// anunciaban como modal, y el foco se perdía tras cerrar.
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useT } from '../../i18n';
import { initialsFor } from '../../utils/initials';

// [P2-LOGOUT-IDENTITY-CARD · 2026-09-03] El modal decía «¿Cerrar sesión de Bioboros como
// correo@…?» en una frase gris, con «Cerrar sesión» como botón fantasma y «Cancelar» como
// botón blanco: la jerarquía al revés de lo que el usuario vino a hacer. Ahora: título, una
// FILA DE IDENTIDAD (avatar con iniciales + nombre + correo — la misma que el menú de cuenta)
// para que se vea QUÉ cuenta se cierra, una nota que quita el miedo (todo queda guardado) y
// la acción principal como botón sólido con «Cancelar» secundario debajo. La confirmación
// se conserva a propósito: cerrar sesión por un clic accidental cuesta volver a entrar.

const LogoutConfirmModal = ({ isOpen, onConfirm, onCancel, userEmail, userName = null, isGuest = false }) => {
    const t = useT();
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

    const displayName = isGuest
        ? t('Invitado')
        : ((userName || '').trim() || (userEmail ? userEmail.split('@')[0] : t('Cuenta')));
    const subLine = isGuest ? t('Sesión de invitado') : (userEmail || null);

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
                    {isGuest
                        ? t('¿Salir del\nmodo invitado?')
                        : t('¿Confirmas que quieres\ncerrar sesión?')}
                </h2>

                <div className={styles.identity}>
                    <span className={`${styles.avatar} ${isGuest ? styles.avatarGuest : ''}`} aria-hidden="true">
                        {isGuest ? '?' : initialsFor(userName, userEmail)}
                    </span>
                    <span className={styles.identityText}>
                        <span className={styles.name}>{displayName}</span>
                        {subLine && <span className={styles.email}>{subLine}</span>}
                    </span>
                </div>

                <p className={styles.note}>
                    <Info size={16} aria-hidden="true" />
                    <span>
                        {isGuest ? (
                            <>{t('Perderás el plan y el progreso de tu sesión de invitado.')}{' '}
                            <strong>{t('Crea una cuenta gratis')}</strong> {t('antes de salir para guardarlo.')}</>
                        ) : (
                            t('Tu plan, tu Nevera y tu historial quedan guardados en tu cuenta.')
                        )}
                    </span>
                </p>

                <div className={styles.actions}>
                    <button
                        type="button"
                        className={styles.confirmBtn}
                        onClick={handleConfirm}
                        disabled={isLoading}
                        id="logout-confirm-btn"
                    >
                        {isGuest
                            ? (isLoading ? t('Saliendo...') : t('Salir'))
                            : (isLoading ? t('Cerrando sesión...') : t('Cerrar sesión'))}
                    </button>
                    <button
                        type="button"
                        className={styles.cancelBtn}
                        onClick={handleClose}
                        disabled={isLoading}
                        id="logout-cancel-btn"
                    >
                        {t('Cancelar')}
                    </button>
                </div>
            </div>
        </div>
    );
};

LogoutConfirmModal.propTypes = {
    isOpen: PropTypes.bool,
    onConfirm: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    userEmail: PropTypes.string,
    userName: PropTypes.string,
    isGuest: PropTypes.bool,
};

export default LogoutConfirmModal;
