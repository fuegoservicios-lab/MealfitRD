import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';
import { ChevronLeft, LayoutDashboard, LogIn, LogOut } from 'lucide-react';
import styles from './InteractiveAssessmentLayout.module.css';
import Wordmark from '../common/Wordmark';
import LocaleSwitcher from '../common/LocaleSwitcher';
import LogoutConfirmModal from '../dashboard/LogoutConfirmModal';
import { useT } from '../../i18n';

const InteractiveAssessmentLayout = ({ children, totalSteps, stepKey, title, subtitle }) => {
    const { currentStep, prevStep, resetApp, isGuest, exitGuestSession, userProfile, planData } = useAssessment();
    // [P1-ARQ25-F1-CLOSE · 2026-09-02] Si ya hay un plan generándose (placeholder de la cola sin
    // días), el asistente lo dice arriba y manda al panel: reenviar el formulario cancelaría
    // la generación en marcha. Vivo: tras un reinicio del backend el cliente aterrizó aquí sin
    // ninguna pista de que su plan seguía vivo.
    const _planGenerandose = planData?.generation_status === 'generating'
        && !(Array.isArray(planData?.days) && planData.days.length > 0);
    // [P2-POLICY-PANEL-UI · 2026-09-05] Con plan vivo y cuenta, el asistente es una EDICIÓN: se puede volver al panel
    // sin destruir nada (el pill de login cierra sesión y borra el formulario).
    const _puedeVolverAlPanel = !isGuest && Boolean(
        planData && (_planGenerandose || (Array.isArray(planData.days) && planData.days.length > 0)));
    const navigate = useNavigate();
    const t = useT();
    const progress = (currentStep / (totalSteps - 1)) * 100;
    const [confirmarSalida, setConfirmarSalida] = useState(false);

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

    // [P1-WIZARD-EXIT-CONFIRM · 2026-08-10] La salida DESTRUYE (borra el formulario y,
    // si hay cuenta, cierra la sesión), así que ahora pregunta. Antes se ejecutaba al
    // primer toque. El modal es el mismo del dashboard, donde esta misma operación SÍ
    // estaba protegida — la asimetría era el defecto, no el modal.
    const pedirConfirmacionSalida = () => setConfirmarSalida(true);

    // [P1-WIZARD-STEP-FOCUS · 2026-08-10] Al cambiar de paso el foco caía al <body> y
    // había que re-tabular desde el principio: 21 veces seguidas. Se mueve al título.
    //
    // Por qué una función de ref y no `focus()` dentro del efecto: el título vive en un
    // AnimatePresence con `mode="wait"`, así que cuando el efecto corre, el nodo nuevo
    // TODAVÍA NO existe (el viejo está saliendo). Enfocar ahí movería el foco al nodo
    // que se está desmontando. La bandera se arma al cambiar de paso y se consume cuando
    // el título nuevo monta de verdad.
    const focoPendienteRef = useRef(false);

    useEffect(() => {
        focoPendienteRef.current = true;
        window.scrollTo(0, 0);
    }, [currentStep]);

    // [P1-ANDROID-BACK · 2026-08-10] El gesto «atrás» de Android retrocede un paso.
    //
    // EL DEFECTO: los 21 pasos eran estado de React, no entradas de historial, así que
    // el deslizamiento desde el borde —la forma canónica de decir «atrás» en Android y
    // el reflejo que más se usa en un formulario largo— no significaba nada aquí: en el
    // mejor caso producía un parpadeo que dejaba al usuario en el mismo paso (y parecía
    // que la app lo ignoraba); cuando la pila se había consumido, salía del formulario.
    //
    // Se empuja una entrada por avance y se consume una por gesto, con la MISMA URL: así
    // el enrutador no ve cambio de ruta y no re-monta nada. En el paso 1 no hay entradas
    // nuestras que consumir, así que el gesto sale de verdad — que es lo que se espera.
    const pasoPrevioRef = useRef(currentStep);
    const volviendoDelHistorialRef = useRef(false);
    const pasoActualRef = useRef(currentStep);

    useEffect(() => {
        // Sincronizado en efecto, no en el render: escribir un ref durante el render
        // rompe con el render concurrente.
        pasoActualRef.current = currentStep;
        const previo = pasoPrevioRef.current;
        pasoPrevioRef.current = currentStep;
        // Un retroceso disparado POR el historial no debe empujar otra entrada: se
        // duplicaría la pila y harían falta dos gestos por paso.
        if (volviendoDelHistorialRef.current) {
            volviendoDelHistorialRef.current = false;
            return;
        }
        if (currentStep > previo) {
            try { window.history.pushState({ mfPaso: currentStep }, ''); } catch { /* noop */ }
        }
    }, [currentStep]);

    useEffect(() => {
        const alVolver = () => {
            if (pasoActualRef.current > 0) {
                volviendoDelHistorialRef.current = true;
                prevStep();
            }
        };
        window.addEventListener('popstate', alVolver);
        return () => window.removeEventListener('popstate', alVolver);
    }, [prevStep]);

    const tituloRef = useCallback((nodo) => {
        if (nodo && focoPendienteRef.current) {
            focoPendienteRef.current = false;
            nodo.focus();
        }
    }, []);

    return (
        <div className={styles.layout}>
            {/* Header / Top Bar */}
            <header className={styles.header}>
                {/* [FORM-EXIT-TO-LOGIN-PC · 2026-07-04 · v3] Pill "Volver al login"
                    SOLO desktop, anclado ABSOLUTO a la esquina izquierda del header
                    (v2 lo dejaba en el slot del grid .headerContent, que es
                    max-width:1200px centrado → en pantallas anchas flotaba a ~360px
                    del borde). Mismo teardown handleBackToLogin. */}
                {/* [P2-POLICY-PANEL-UI · 2026-09-05] Quien entra al asistente DESDE el panel («Cambiar mis
                    preferencias») ya tiene plan y cuenta: para él la salida no es cerrar sesión, es VOLVER. El pill
                    destructivo se reserva para quien aún no tiene plan. */}
                {_puedeVolverAlPanel ? (
                    <button
                        onClick={() => navigate('/dashboard')}
                        className={styles.loginExitBtn}
                        aria-label={t('Volver al panel')}
                    >
                        <LayoutDashboard size={15} strokeWidth={2.4} aria-hidden="true" />
                        {t('Volver al panel')}
                    </button>
                ) : (
                    <button
                        onClick={pedirConfirmacionSalida}
                        className={styles.loginExitBtn}
                        aria-label={t('Volver al inicio de sesión')}
                    >
                        <LogIn size={15} strokeWidth={2.4} aria-hidden="true" />
                        {t('Volver al login')}
                    </button>
                )}
                <div className={styles.headerContent}>
                    {currentStep > 0 ? (
                        <button onClick={prevStep} className={styles.backBtn} aria-label={t('Paso anterior')}>
                            <ChevronLeft size={24} />
                        </button>
                    ) : (
                        /* [FORM-BACK-TO-LOGIN · 2026-07-03] Botón de salir al login del
                           PASO 1 — SOLO móvil (en desktop existe el pill de la esquina).
                           visibility:hidden en desktop: como grid child de la col 1,
                           display:none correría el logo a la col 1.

                           [P1-WIZARD-EXIT-CONFIRM · 2026-08-10] Ya NO es un chevron. Era
                           píxel a píxel idéntico al de «paso anterior» —misma clase, mismo
                           icono, misma posición— y solo los separaba un media query de
                           escritorio. El usuario retrocedía paso a paso y el siguiente
                           toque, indistinguible de los anteriores, le borraba el
                           formulario entero. Un icono de salida dice lo que hace. */
                        <button
                            onClick={pedirConfirmacionSalida}
                            className={`${styles.backBtn} ${styles.backToLogin}`}
                            aria-label={t('Salir del formulario y volver al inicio de sesión')}
                        >
                            <LogOut size={22} aria-hidden="true" />
                        </button>
                    )}

                    <div className={styles.logo}>
                        <Wordmark />
                    </div>

                    {/* [P3-ASSESSMENT-NO-CANCEL · 2026-07-01] Botón «Cancelar» eliminado a pedido.
                        [FORM-STEP-COUNTER-DEDUP · 2026-07-03] La píldora contador "N / M" del
                        header eliminada a pedido — duplicaba el kicker "Paso N de M" de la card.
                        Spacer para que `:last-child { justify-self: end }` no capture el logo. */}
                    {/* [P2-I18N-SIN-SELECTOR-ANTES-DE-TENER-CUENTA · 2026-08-23] El spacer
                        pasa a ser el selector de idioma: el invitado llega al formulario sin
                        cuenta y, hasta hoy, sin forma de corregir la autodetección. Sigue
                        siendo el `:last-child` del grid → `justify-self: end`. */}
                    <div className={styles.backSpacer}>
                        <LocaleSwitcher id="mf-locale-wizard" menuAlign="start" />
                    </div>
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

            {/* [P1-SKIPLINK-ANCHOR - 2026-08-10] Destino del enlace "Saltar al
                contenido". Apuntaba a un id que no existe en esta pantalla, asi que el
                PRIMER control de la pagina no hacia nada para quien navega con teclado.
                tabIndex=-1 para que el salto pueda depositar el foco aqui. */}
            <main id="main-content" tabIndex={-1} className={styles.main}>
                <div className={styles.contentWrapper}>
                    {/* [FORM-BACK-IN-CARD-PC · 2026-07-07] En DESKTOP la flecha "paso anterior"
                        vive DENTRO del recuadro (esquina superior izquierda), no en el header —
                        pedido del owner. En móvil sigue en el header (.backBtn) y esta se oculta
                        (CSS: display:none base, inline-flex ≥900px). Solo desde el paso 2 (el
                        paso 1 no tiene "anterior"). El .backBtn del header se oculta ≥900px. */}
                    {currentStep > 0 && (
                        <button onClick={prevStep} className={styles.cardBackBtn} aria-label={t('Paso anterior')}>
                            <ChevronLeft size={22} />
                        </button>
                    )}
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
                                {t('Paso {actual} de {total}', { actual: currentStep + 1, total: totalSteps })}
                            </span>
                            {/* [P1-WIZARD-STEP-FOCUS] `tabIndex={-1}` lo hace enfocable por
                                código sin meterlo en el orden de tabulación. */}
                            {title && <h1 ref={tituloRef} tabIndex={-1} className={styles.title}>{title}</h1>}
                            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
                        </motion.div>
                    </AnimatePresence>

                    {_planGenerandose && (
                        <div
                            role="status"
                            data-testid="wizard-generating-notice"
                            style={{
                                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem',
                                padding: '0.85rem 1rem', marginBottom: '1rem', borderRadius: '0.85rem',
                                border: '1px solid rgba(99, 102, 241, 0.35)', background: 'rgba(99, 102, 241, 0.08)',
                            }}
                        >
                            <div style={{ flex: '1 1 16rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                <span style={{ fontWeight: 700 }}>{t('Ya tienes un plan generándose')}</span>
                                <span style={{ fontSize: '0.85rem', opacity: 0.85 }}>
                                    {t('Si vuelves a enviar el formulario se cancela el que está en marcha. Espéralo en tu panel.')}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => navigate('/dashboard')}
                                style={{
                                    padding: '0.55rem 0.95rem', borderRadius: '0.7rem', fontWeight: 700,
                                    border: '1px solid rgba(99, 102, 241, 0.6)', background: 'transparent', color: 'inherit', cursor: 'pointer',
                                }}
                            >
                                {t('Ver mi panel')}
                            </button>
                        </div>
                    )}
                    <div className={styles.stepContainer}>
                        {children}
                    </div>
                </div>
            </main>

            {/* [P1-WIZARD-EXIT-CONFIRM · 2026-08-10] El mismo modal que ya protege esta
                misma operación en el dashboard. Su texto describe con honestidad lo que
                pasa en cada rama: al invitado le avisa que pierde el progreso; a la
                cuenta, que cierra sesión (que es lo que `resetApp` hace de verdad). */}
            <LogoutConfirmModal
                isOpen={confirmarSalida}
                isGuest={isGuest}
                userEmail={userProfile?.email}
                userName={userProfile?.full_name}
                onConfirm={handleBackToLogin}
                onCancel={() => setConfirmarSalida(false)}
            />
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
