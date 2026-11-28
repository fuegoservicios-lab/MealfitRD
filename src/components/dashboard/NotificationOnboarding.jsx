import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, Check, Loader2 } from 'lucide-react';
import { useAssessment } from '../../context/AssessmentContext';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useLatestRef } from '../../hooks/useLatestRef';
import { estadoDeAvisos, activarAvisos, alarmaExactaPendiente, pedirAlarmaExacta } from '../../utils/avisosDeComida';
import { mensajePermisoBloqueado } from '../../utils/permisoAvisosGuia';
import { nativePlatform } from '../../config/platform';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import { useT } from '../../i18n';
import Button from '../ui/Button';
import styles from './NotificationOnboarding.module.css';

// Se monta tras el formulario, en el contador, el agente y la generación de planes.
// La decisión pertenece a esta cuenta en este dispositivo. El antiguo flag global
// se marcaba al mostrar, aunque el usuario nunca hubiera elegido una opción.
const notificationDecisionKey = (userId) => `mealfit_notification_welcome_v2:${userId}`;
// [P1-PLAN-LOTE-1156] más que esto girando = algo no contestó: se libera la tarjeta (la activación sigue detrás)
export const ESPERA_MAXIMA_MS = 15000;

export default function NotificationOnboarding() {
    const { session, userProfile, loadingData, isGuest } = useAssessment();
    const t = useT();
    const userId = !isGuest && session?.user?.id;
    const ready = Boolean(userId && userProfile && !loadingData);
    const [owner, setOwner] = useState(null);
    const [enabling, setEnabling] = useState(false);
    const [error, setError] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [blocked, setBlocked] = useState(false);
    const [canal, setCanal] = useState(null);
    // [P1-PLAN-LOTE-1156] Android: tras encender, si los avisos saldrían «con margen» (sin permiso de hora exacta),
    // un segundo paso lo ofrece aquí mismo; antes solo vivía, escondido, en Configuración.
    const [faltaHoraExacta, setFaltaHoraExacta] = useState(false);
    // si la activación tarda demasiado, «Ahora no» se libera y se puede reintentar (antes giraba sin fin)
    const [tarda, setTarda] = useState(false);
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
        setBlocked(false);
        setError(false);
        setEnabling(false);
        activationLock.current = false;
        if (!ready || safeLocalStorageGet(notificationDecisionKey(userId))) return undefined;
        let cancelled = false;
        let timer;
        estadoDeAvisos().then((status) => {
            if (cancelled || status.activo || status.bloqueado) return;
            if (status.canal !== 'local' && status.canal !== 'web-push') return;
            setCanal(status.canal);
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
        setTarda(false);
        const vigia = setTimeout(() => {
            if (currentUser.current !== userId) return;
            activationLock.current = false;
            setEnabling(false);
            setTarda(true);
        }, ESPERA_MAXIMA_MS);
        try {
            // Único punto que pide permiso: una acción explícita de la persona.
            const result = await activarAvisos();
            if (currentUser.current !== userId) return;
            if (result.ok) {
                safeLocalStorageSet(notificationDecisionKey(userId), 'enabled');
                setEnabled(true);
                setTarda(false);
                setError(false);
                if (nativePlatform() === 'android') {
                    alarmaExactaPendiente().then((v) => { if (currentUser.current === userId) setFaltaHoraExacta(v === true); }).catch(() => {});
                }
            } else if (result.code === 'permiso_denegado') {
                safeLocalStorageSet(notificationDecisionKey(userId), 'later');
                if (result.reason === 'denied') {
                    if (result.canal) setCanal(result.canal);
                    setBlocked(true);
                } else {
                    setOwner(null);
                }
            } else {
                setError(true);
            }
        } catch {
            if (currentUser.current === userId) setError(true);
        } finally {
            clearTimeout(vigia);
            if (currentUser.current === userId) {
                activationLock.current = false;
                setEnabling(false);
            }
        }
    };
    const permitirHoraExacta = async () => {
        const ok = await pedirAlarmaExacta().catch(() => false);
        if (currentUser.current === userId) setFaltaHoraExacta(!ok);
    };

    if (!isOpen) return null;
    // [P1-PLAN-LOTE-1118 · 2026-11-20] Más claro, limpio y minimalista (pedido del dueño): sin anillo de foco en la
    // tarjeta, icono sin baldosa, botones comunes y sin la nota repetida de Configuración.
    return createPortal(
        <div className={styles.overlay}>
            <section ref={containerRef} role="dialog" aria-modal="true" aria-labelledby="notification-welcome-title"
                aria-describedby="notification-welcome-description" tabIndex={-1} className={styles.card}>
                <span className={styles.icon} aria-hidden="true">{enabled ? <Check size={22} /> : blocked ? <BellOff size={22} /> : <Bell size={22} />}</span>
                <h2 id="notification-welcome-title">{enabled ? t('Notificaciones activadas') : blocked ? t('Notificaciones bloqueadas') : t('Activa tus recordatorios')}</h2>
                <p id="notification-welcome-description">{enabled
                    ? t('Puedes ajustar tus recordatorios cuando quieras en Configuración.')
                    : blocked
                        ? mensajePermisoBloqueado(canal, t)
                        : t('Recibe avisos para registrar tus comidas y seguir tu progreso.')}</p>
                {error && <p className={styles.error} role="alert">{t('No se pudieron activar. Prueba otra vez.')}</p>}
                {tarda && !enabled && !blocked && !error && (
                    <p className={styles.error} role="alert">{t('Está tardando más de la cuenta. Si ya diste el permiso, toca «Activar» otra vez.')}</p>
                )}
                {enabled && faltaHoraExacta && (
                    <p className={styles.nota}>{t('Para que suenen a su hora exacta, permite «Alarmas y recordatorios».')}</p>
                )}
                <div className={styles.actions}>
                    {enabled && faltaHoraExacta && (
                        <Button block onClick={permitirHoraExacta}>{t('Permitir hora exacta')}</Button>
                    )}
                    <Button block variant={enabled && faltaHoraExacta ? 'text' : undefined} disabled={enabling} onClick={enabled || blocked ? dismiss : enable}>
                        {enabling && <Loader2 size={18} className={styles.spinner} aria-hidden="true" />}
                        {enabled ? t('Continuar') : blocked ? t('Entendido') : enabling ? t('Activando...') : t('Activar notificaciones')}
                    </Button>
                    {!enabled && !blocked && <Button variant="text" block disabled={enabling} onClick={dismiss}>{t('Ahora no')}</Button>}
                </div>
            </section>
        </div>, document.body,
    );
}
