import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, Loader2 } from 'lucide-react';
import { useAssessment } from '../../context/AssessmentContext';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useLatestRef } from '../../hooks/useLatestRef';
import { estadoDeAvisos, activarAvisos } from '../../utils/avisosDeComida';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import { useT } from '../../i18n';
import styles from './NotificationOnboarding.module.css';

// Se monta tras el formulario, en el contador, el agente y la generación de planes.
// La decisión pertenece a esta cuenta en este dispositivo. El antiguo flag global
// se marcaba al mostrar, aunque el usuario nunca hubiera elegido una opción.
const notificationDecisionKey = (userId) => `mealfit_notification_welcome_v2:${userId}`;

export default function NotificationOnboarding() {
    const { session, userProfile, loadingData, isGuest } = useAssessment();
    const t = useT();
    const userId = !isGuest && session?.user?.id;
    const ready = Boolean(userId && userProfile && !loadingData);
    const [owner, setOwner] = useState(null);
    const [enabling, setEnabling] = useState(false);
    const [error, setError] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const currentUser = useLatestRef(userId);
    const activationLock = useRef(false);
    const isOpen = ready && owner === userId;

    const dismiss = useCallback(() => {
        if (!userId || activationLock.current) return;
        safeLocalStorageSet(notificationDecisionKey(userId), enabled ? 'enabled' : 'later');
        setOwner(null);
    }, [userId, enabled]);
    const { containerRef } = useModalAccessibility({ isOpen, onClose: dismiss, disableClose: enabling });

    useEffect(() => {
        setOwner(null);
        setEnabled(false);
        setError(false);
        setEnabling(false);
        activationLock.current = false;
        if (!ready || safeLocalStorageGet(notificationDecisionKey(userId))) return undefined;
        let cancelled = false;
        let timer;
        estadoDeAvisos().then((status) => {
            if (cancelled || status.activo || status.bloqueado) return;
            if (status.canal !== 'local' && status.canal !== 'web-push') return;
            const offer = () => {
                if (cancelled) return;
                // No cubrir el consentimiento de IA ni otra ventana del cierre del formulario.
                if (document.visibilityState === 'hidden' || document.querySelector('[role="dialog"][aria-modal="true"]')) {
                    timer = setTimeout(offer, 500);
                    return;
                }
                setOwner(userId);
            };
            timer = setTimeout(offer, 700);
        }).catch(() => { /* La lectura del permiso no debe bloquear el acceso a la app. */ });
        return () => { cancelled = true; clearTimeout(timer); };
    }, [ready, userId]);

    const enable = async () => {
        if (activationLock.current) return;
        activationLock.current = true;
        setEnabling(true);
        setError(false);
        try {
            // Único punto que pide permiso: una acción explícita de la persona.
            const result = await activarAvisos();
            if (currentUser.current !== userId) return;
            if (result.ok) {
                safeLocalStorageSet(notificationDecisionKey(userId), 'enabled');
                setEnabled(true);
            } else if (result.code === 'permiso_denegado') {
                safeLocalStorageSet(notificationDecisionKey(userId), 'later');
                setOwner(null);
            } else {
                setError(true);
            }
        } catch {
            if (currentUser.current === userId) setError(true);
        } finally {
            if (currentUser.current === userId) {
                activationLock.current = false;
                setEnabling(false);
            }
        }
    };

    if (!isOpen) return null;
    return createPortal(
        <div className={styles.overlay}>
            <section ref={containerRef} role="dialog" aria-modal="true" aria-labelledby="notification-welcome-title"
                aria-describedby="notification-welcome-description" tabIndex={-1} className={styles.card}>
                <div className={styles.icon} aria-hidden="true">{enabled ? <Check size={28} /> : <Bell size={28} />}</div>
                <h2 id="notification-welcome-title">{enabled ? t('Notificaciones activadas') : t('Activa tus recordatorios')}</h2>
                <p id="notification-welcome-description">{enabled
                    ? t('Puedes ajustar tus recordatorios cuando quieras en Configuración.')
                    : t('Recibe avisos para registrar tus comidas y seguir tu progreso.')}</p>
                {error && <p className={styles.error} role="alert">{t('No pudimos activarlas. Inténtalo de nuevo o hazlo después desde Configuración.')}</p>}
                <button type="button" className={styles.primary} disabled={enabling} onClick={enabled ? dismiss : enable}>
                    {enabling && <Loader2 size={20} className={styles.spinner} aria-hidden="true" />}
                    {enabled ? t('Continuar') : enabling ? t('Activando...') : t('Activar notificaciones')}
                </button>
                {!enabled && <button type="button" className={styles.secondary} disabled={enabling} onClick={dismiss}>{t('Ahora no')}</button>}
                {!enabled && <small>{t('Puedes cambiarlas después en Configuración.')}</small>}
            </section>
        </div>, document.body,
    );
}
