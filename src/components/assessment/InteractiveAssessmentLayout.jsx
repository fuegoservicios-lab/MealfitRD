import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';
import { ChevronLeft, LogIn } from 'lucide-react';
import styles from './InteractiveAssessmentLayout.module.css';

const InteractiveAssessmentLayout = ({ children, totalSteps, stepKey, title, subtitle }) => {
    const { currentStep, prevStep, resetApp, isGuest, exitGuestSession } = useAssessment();
    const navigate = useNavigate();
    const progress = (currentStep / (totalSteps - 1)) * 100;

    // [FORM-BACK-TO-LOGIN · 2026-07-03] navigate('/login') a secas NO llega: el guard
    // redirect-if-session de Login.jsx (:211) rebota a "/" mientras haya sesión/guest
    // activo. Mismo teardown del logout canónico (DashboardLayout.handleLogoutConfirm):
    // guest → exitGuestSession; autenticado → resetApp (limpia session síncrono) →
    // /login ya no rebota.
    const handleBackToLogin = async () => {
        try {
            if (isGuest) {
                exitGuestSession();
            } else {
                await resetApp();
            }
        } catch { /* teardown best-effort — navegar igual */ }
        navigate('/login', { replace: true });
    };

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [currentStep]);

    return (
        <div className={styles.layout}>
            {/* Header / Top Bar */}
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    {/* [FORM-EXIT-TO-LOGIN-PC · 2026-07-04] Slot izquierdo agrupado:
                        chevron de paso anterior (o el chevron móvil del paso 1,
                        FORM-BACK-TO-LOGIN) + pill "Volver al login" SOLO desktop
                        (a pedido, esquina IZQUIERDA). Mismo teardown handleBackToLogin. */}
                    <div className={styles.headerLeft}>
                        {currentStep > 0 ? (
                            <button onClick={prevStep} className={styles.backBtn} aria-label="Paso anterior">
                                <ChevronLeft size={24} />
                            </button>
                        ) : (
                            /* [FORM-BACK-TO-LOGIN · 2026-07-03] Chevron de salir al login del
                               PASO 1 — SOLO móvil (en desktop existe el pill de al lado). */
                            <button
                                onClick={handleBackToLogin}
                                className={`${styles.backBtn} ${styles.backToLogin}`}
                                aria-label="Volver al inicio de sesión"
                            >
                                <ChevronLeft size={24} />
                            </button>
                        )}
                        <button
                            onClick={handleBackToLogin}
                            className={styles.loginExitBtn}
                            aria-label="Volver al inicio de sesión"
                        >
                            <LogIn size={15} strokeWidth={2.4} aria-hidden="true" />
                            Volver al login
                        </button>
                    </div>

                    <div className={styles.logo}>
                        Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </div>

                    {/* [P3-ASSESSMENT-NO-CANCEL · 2026-07-01] Botón «Cancelar» eliminado a pedido.
                        [FORM-STEP-COUNTER-DEDUP · 2026-07-03] La píldora contador "N / M" del
                        header eliminada a pedido — duplicaba el kicker "Paso N de M" de la card.
                        Spacer para que `:last-child { justify-self: end }` no capture el logo. */}
                    <div className={styles.backSpacer} aria-hidden="true" />
                </div>
                
                {/* Progress Bar under header */}
                <div className={styles.progressContainer}>
                    <motion.div
                        className={styles.progressBar}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                </div>
            </header>

            <main className={styles.main}>
                <div className={styles.contentWrapper}>
                    <AnimatePresence mode="wait">
                        {/* [P4-LAYOUT-KEY] key primitivo (stepKey) — title es un JSX fragment,
                            así que key={title} se volvía "[object Object]" para todos los steps
                            → AnimatePresence mode="wait" nunca re-animaba el título entre pasos. */}
                        <motion.div
                            key={stepKey}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            className={styles.titleSection}
                        >
                            {/* [FORM-VISUAL-V2 · 2026-07-02] Kicker de contexto sobre el
                                título — orienta cuánto falta sin mirar el header. */}
                            <span className={styles.kicker}>
                                Paso {currentStep + 1} de {totalSteps}
                            </span>
                            {title && <h1 className={styles.title}>{title}</h1>}
                            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
                        </motion.div>
                    </AnimatePresence>

                    <div className={styles.stepContainer}>
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
};

InteractiveAssessmentLayout.propTypes = {
    children: PropTypes.node.isRequired,
    totalSteps: PropTypes.number.isRequired,
    stepKey: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    // [P4-LAYOUT-KEY] title/subtitle son JSX (fragments con <span>*</span>), no strings.
    title: PropTypes.node,
    subtitle: PropTypes.node,
};

export default InteractiveAssessmentLayout;
