import { useState, useEffect, useRef } from 'react';
import {
    User, Bell, Shield, ChevronRight,
    LogOut, Save, Trash2, Database, Mail, Brain, CreditCard, AlertCircle, X, AlertTriangle, Lock, Loader2, Clock, Zap, Users, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAssessment } from '../context/AssessmentContext';
import { useNavigate } from 'react-router-dom';
import { useRegeneratePlan } from '../hooks/useRegeneratePlan';
import styles from './Settings.module.css';
import { fetchWithAuth } from '../config/api';
import { requestNotificationPermission, subscribeToPushNotifications, unsubscribeFromPushNotifications, isPushSupported } from '../utils/pushNotifications';
import { trackEvent } from '../utils/analytics';
import Modal from '../components/common/Modal';
import OptionPickerModal from '../components/common/OptionPickerModal';

const Settings = () => {
    // Obtenemos userProfile y updateUserProfile del contexto global
    const { planData, formData, resetApp, userProfile, updateUserProfile, setCurrentStep, userPlanLimit, planCount, checkPlanLimit } = useAssessment();
    const navigate = useNavigate();
    const { regeneratePlan } = useRegeneratePlan();

    // Estados GAP 8
    const [hoveredEvaluateOption, setHoveredEvaluateOption] = useState(null);
    
    // Estados GAP 9
    const [isNavigatingOption, setIsNavigatingOption] = useState(null);
    
    // GAP 4: Ref para prevenir doble-disparo
    const isNavigatingRef = useRef(false);
    // --- ESTADOS LOCALES ---
    const isLimitReached = typeof userPlanLimit === 'number' && planCount >= userPlanLimit;
    
    // Estado para las notificaciones (Avisos de comidas)
    const [notifications, setNotifications] = useState(() => {
        return localStorage.getItem('mealfit_notifications') === 'true';
    });

    // Estado para las Notificaciones Web Push (IA)
    const [pushEnabled, setPushEnabled] = useState(false);
    const [isPushLoading, setIsPushLoading] = useState(false);
    const [isPushBlocked, setIsPushBlocked] = useState(false);
    const [pushSubscribeError, setPushSubscribeError] = useState(null);

    // [P1-4] Preferencia de logging: 'manual' (default) o 'auto_proxy'.
    // En auto_proxy el sistema NO pausa los chunks aunque el usuario deje de loguear comidas.
    const [loggingPreference, setLoggingPreference] = useState('manual');
    const [isLoggingPrefLoading, setIsLoggingPrefLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetchWithAuth('/api/diary/preferences/logging');
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && data?.logging_preference) {
                    setLoggingPreference(data.logging_preference);
                }
            } catch (e) {
                // No bloqueante: si falla, queda en 'manual' por default.
                console.debug('No se pudo cargar logging_preference:', e);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleToggleLoggingPreference = async () => {
        const next = loggingPreference === 'auto_proxy' ? 'manual' : 'auto_proxy';
        setIsLoggingPrefLoading(true);
        const prev = loggingPreference;
        setLoggingPreference(next); // optimistic
        try {
            const res = await fetchWithAuth('/api/diary/preferences/logging', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logging_preference: next }),
            });
            if (!res.ok) throw new Error('PUT failed');
            toast.success(
                next === 'auto_proxy'
                    ? 'Modo auto activado: ya no pausaremos tu plan por falta de logs.'
                    : 'Modo manual activado: pausaremos tu plan si dejas de loguear comidas.',
            );
        } catch (e) {
            console.error('handleToggleLoggingPreference error:', e);
            setLoggingPreference(prev);
            toast.error('No se pudo actualizar la preferencia. Inténtalo de nuevo.');
        } finally {
            setIsLoggingPrefLoading(false);
        }
    };

    useEffect(() => {
        const checkSubscription = async () => {
            if (isPushSupported() && 'Notification' in window) {
                // Si el permiso está denegado o por defecto, sabemos que es falso
                if (Notification.permission === 'denied') {
                    setPushEnabled(false);
                    setIsPushBlocked(true);
                    return;
                }
                if (Notification.permission !== 'granted') {
                    setPushEnabled(false);
                    return;
                }
                
                // Si está concedido, tenemos que verificar si hay una suscripción activa
                try {
                    let registration = await navigator.serviceWorker.getRegistration();
                    
                    if (!registration) {
                        registration = await Promise.race([
                            navigator.serviceWorker.ready,
                            new Promise((_, reject) => setTimeout(() => reject(new Error("SW timeout")), 2000))
                        ]);
                    }

                    if (registration) {
                        const subscription = await registration.pushManager.getSubscription();
                        setPushEnabled(!!subscription);
                    } else {
                        setPushEnabled(false);
                    }
                } catch (e) {
                    console.error("Error checking subscription:", e);
                    setPushEnabled(false);
                }
            }
        };
        checkSubscription();
    }, []);

    // CORRECCIÓN: Inicialización Lazy para evitar conflictos de renderizado
    // Si ya tenemos el dato en el contexto, lo usamos inmediatamente al crear el componente.
    const [userName, setUserName] = useState(
        userProfile?.full_name || planData?.userParams?.name || ''
    );

    const [isSaving, setIsSaving] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [saveStatus, setSaveStatus] = useState(''); // '', 'success', 'error'
    const [nameError, setNameError] = useState('');
    const [confirmReset, setConfirmReset] = useState(false);

    // --- ESTADOS PARA CEREBRO IA ---
    const [userFacts, setUserFacts] = useState([]);
    const [isLoadingFacts, setIsLoadingFacts] = useState(false);
    const [isDeletingFact, setIsDeletingFact] = useState(null); // ID del fact que se está borrando

    // --- ESTADOS DE PAGO ---
    const [isCancelling, setIsCancelling] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);

    // --- ESTADOS DE EVALUACIÓN ---
    const [showEvaluateModal, setShowEvaluateModal] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // --- EFECTOS ---

    // CORRECCIÓN: Validación estricta dentro del useEffect
    useEffect(() => {
        // Determinamos cuál es el nombre que viene de la base de datos o del plan antiguo
        const incomingName = userProfile?.full_name || planData?.userParams?.name;

        // SOLUCIÓN AL ERROR:
        // Solo actualizamos el estado si hay un dato nuevo Y es diferente al que ya tenemos.
        // Esto evita que React entre en un bucle infinito de actualizaciones.
        if (incomingName && incomingName !== userName) {
            setUserName(incomingName);
        }
        
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile, planData]); // Quitamos 'userName' de las dependencias intencionalmente

    // Persistir preferencia de notificaciones
    useEffect(() => {
        localStorage.setItem('mealfit_notifications', notifications);
    }, [notifications]);

    // Cargar los "hechos" del Cerebro de la IA
    useEffect(() => {
        const fetchUserFacts = async () => {
            const userId = userProfile?.id;
            if (!userId) return;

            setIsLoadingFacts(true);
            try {
                // Asumimos que la API corre en http://localhost:3001
                const response = await fetchWithAuth(`/api/user-facts/${userId}`);
                if (response.ok) {
                    const data = await response.json();
                    setUserFacts(data.facts || []);
                }
            } catch (error) {
                console.error("Error cargando Cerebro IA:", error);
            } finally {
                setIsLoadingFacts(false);
            }
        };

        fetchUserFacts();
    }, [userProfile?.id]);

    // --- MANEJADORES (HANDLERS) ---
    
    const getNotificationBlockedMessage = async () => {
        const ua = navigator.userAgent;
        const isBrave = (typeof navigator.brave !== 'undefined') || ua.includes('Brave');
        const isFirefox = ua.includes('Firefox');
        const isEdge = ua.includes('Edg/');
        const isSafari = ua.includes('Safari') && !ua.includes('Chrome');

        if (isBrave) return "Brave bloquea notificaciones por defecto. Haz clic en el escudo 🛡 de la barra de direcciones → Permisos del sitio → Notificaciones → Permitir.";
        if (isFirefox) return "Permisos bloqueados en Firefox. Haz clic en el ícono de candado 🔒 en la barra de direcciones → Más información → Permisos → Notificaciones → Permitir.";
        if (isSafari) return "Permisos bloqueados en Safari. Ve a Safari → Configuración para este sitio web → Notificaciones → Permitir.";
        if (isEdge) return "Permisos bloqueados en Edge. Haz clic en el candado 🔒 en la barra de direcciones → Permisos para este sitio → Notificaciones → Permitir.";
        return "Permisos bloqueados en el navegador. Haz clic en el candado 🔒 en la barra de direcciones → Permisos del sitio → Notificaciones → Permitir.";
    };

    const handleTogglePush = async () => {
        try {
            if (!isPushSupported()) {
                toast.error("Tu navegador no soporta notificaciones Push.");
                return;
            }

            setIsPushLoading(true);

            if (pushEnabled) {
                // Desuscribir
                const success = await unsubscribeFromPushNotifications();
                if (success) {
                    setPushEnabled(false);
                    toast.success("Notificaciones de la IA desactivadas.");
                } else {
                    toast.error("Error al desactivar notificaciones.");
                }
            } else {
                // Suscribir
                const permissionGranted = await requestNotificationPermission();
                if (!permissionGranted) {
                    const msg = await getNotificationBlockedMessage();
                    toast.error(msg, { duration: 7000 });
                    setIsPushLoading(false);
                    return;
                }

                const result = await subscribeToPushNotifications();
                if (result && result.success) {
                    setPushEnabled(true);
                    setPushSubscribeError(null);
                    toast.success("¡Notificaciones de la IA activadas con éxito!");
                } else {
                    const errMsg = result?.error || 'Error desconocido al suscribirse.';
                    setPushSubscribeError(errMsg);
                    toast.error(errMsg, { duration: 6000 });
                }
            }
            setIsPushLoading(false);
        } catch (err) {
            console.error("handleTogglePush error:", err);
            const errMsg = err.message || 'Error inesperado.';
            setPushSubscribeError(errMsg);
            toast.error(`Error inesperado: ${errMsg}`);
            setIsPushLoading(false);
        }
    };

    const handleResetApp = () => {
        if (confirmReset) {
            resetApp(); // Limpia localStorage y hace SignOut en Supabase
            navigate('/');
        } else {
            setConfirmReset(true);
            setTimeout(() => setConfirmReset(false), 3000);
        }
    };

    const handleSaveProfile = async () => {
        if (isSaving) return;
        
        const trimmedName = userName.trim();
        if (!trimmedName) {
            setNameError("Por favor, ingresa tu nombre.");
            return;
        }
        setNameError('');

        setIsSaving(true);
        setSaveStatus('');

        // Actualizamos en Supabase
        const result = await updateUserProfile({
            full_name: trimmedName
        });

        setIsSaving(false);

        if (result.success) {
            setSaveStatus('success');
            toast.success("Perfil actualizado con éxito.");
            setTimeout(() => setSaveStatus(''), 3000);
        } else {
            setSaveStatus('error');
            toast.error("Hubo un error al guardar. Por favor verifica tu conexión.");
        }
    };

    const handleDeleteFact = async (factId) => {
        if (!confirm("¿Seguro que deseas olvidar esta información?")) return;
        
        setIsDeletingFact(factId);
        try {
            const response = await fetchWithAuth(`/api/user-facts/${factId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                // Actualizamos el estado local quitando el hecho borrado
                setUserFacts(prev => prev.filter(f => f.id !== factId));
                toast.success("Información olvidada con éxito.");
            } else {
                toast.error("Hubo un problema al olvidar la información.");
            }
        } catch (error) {
            console.error("Error borrando fact:", error);
            toast.error("No se pudo conectar con el servidor para borrar.");
        } finally {
            setIsDeletingFact(null);
        }
    };

    const handleCancelSubscription = () => {
        setShowCancelModal(true);
    };

    const runCancelSubscription = async () => {
        setIsCancelling(true);
        try {
            const response = await fetchWithAuth('/api/subscription/cancel', {
                method: 'POST',
                body: JSON.stringify({ user_id: userProfile?.id })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                setShowCancelModal(false);
                toast.success("Tu suscripción ha sido cancelada exitosamente.");
                // Forzar la recarga del perfil global
                setTimeout(() => window.location.reload(), 2000);
            } else {
                toast.error(data.message || "Hubo un error al cancelar la suscripción.");
                setShowCancelModal(false);
            }
        } catch (error) {
            console.error("Error cancelando suscripción:", error);
            toast.error("No se pudo conectar con el servidor para cancelar. Inténtalo más tarde.");
            setShowCancelModal(false);
        } finally {
            setIsCancelling(false);
        }
    };

    // Datos derivados para la UI
    const userGoal = formData?.mainGoal || "Mejorar Salud";
    const displayEmail = userProfile?.email || "Cargando correo...";

    return (
        <>
            <div className={styles.wrapper}>
                <Modal 
                    isOpen={showCancelModal} 
                    onClose={() => !isCancelling && setShowCancelModal(false)} 
                    titleId="cancel-modal-title" 
                    maxWidth="420px"
                    disableClose={isCancelling}
                >
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                                    <div style={{ background: '#FEF2F2', color: '#EF4444', padding: '0.75rem', borderRadius: '50%' }}>
                                        <AlertTriangle size={24} strokeWidth={2.5} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                                        Cancelar Suscripción
                                    </h3>
                                </div>
                                
                                <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                                    ¿Estás seguro de que deseas cancelar tu suscripción? Perderás todos tus beneficios premium al finalizar tu ciclo actual. <strong>Esta acción no se puede deshacer.</strong>
                                </p>
                                
                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                    <button 
                                        onClick={() => setShowCancelModal(false)}
                                        disabled={isCancelling}
                                        style={{
                                            padding: '0.75rem 1.25rem', borderRadius: '0.75rem', border: 'none',
                                            background: '#F1F5F9', color: '#475569', fontWeight: 600, 
                                            cursor: isCancelling ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                                            opacity: isCancelling ? 0.7 : 1
                                        }}
                                        onMouseOver={(e) => { if (!isCancelling) e.currentTarget.style.background = '#E2E8F0'; }}
                                        onMouseOut={(e) => { if (!isCancelling) e.currentTarget.style.background = '#F1F5F9'; }}
                                    >
                                        Mantener Plan
                                    </button>
                                    <button 
                                        onClick={runCancelSubscription}
                                        disabled={isCancelling}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                            padding: '0.75rem 1.25rem', borderRadius: '0.75rem', border: 'none',
                                            background: '#EF4444', color: '#FFFFFF', fontWeight: 600, 
                                            cursor: isCancelling ? 'wait' : 'pointer',
                                            transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)',
                                            opacity: isCancelling ? 0.8 : 1
                                        }}
                                        onMouseOver={(e) => { if (!isCancelling) e.currentTarget.style.background = '#DC2626'; }}
                                        onMouseOut={(e) => { if (!isCancelling) e.currentTarget.style.background = '#EF4444'; }}
                                    >
                                        {isCancelling ? 'Cancelando...' : 'Sí, Cancelar'}
                                    </button>
                                </div>
                </Modal>

                {/* MODAL Evaluar de Nuevo */}
            <AnimatePresence>
                {showEvaluateModal && (
                    showResetConfirm ? (
                        <Modal
                            isOpen={true}
                            onClose={() => { setShowEvaluateModal(false); setShowResetConfirm(false); }}
                            titleId="reset-confirm-modal"
                            maxWidth="440px"
                            isBottomSheetOnMobile={true}
                            disableClose={isNavigatingRef.current}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: '#FEE2E2', color: '#EF4444', padding: '0.75rem', borderRadius: '50%' }}>
                                    <AlertTriangle size={24} strokeWidth={2.5} />
                                </div>
                                <h3 id="reset-confirm-modal" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                                    ¿Empezar desde cero?
                                </h3>
                            </div>
                            
                            <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                                Esto reemplazará tu plan actual y <strong>borrará todas tus preferencias</strong>, incluyendo los platos que no te gustan. Esta acción es irreversible y consumirá 1 crédito.
                            </p>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <button 
                                    onClick={async (e) => {
                                        if (isNavigatingRef.current) return;
                                        isNavigatingRef.current = true;
                                        
                                        const toastId = toast.loading('Borrando preferencias...', { description: 'Preparando tu cuenta para un nuevo inicio.' });

                                        try {
                                            // GAP 6: Invocar el endpoint para resetear preferencias en el backend
                                            await fetchWithAuth('/api/account/reset-preferences', {
                                                method: 'POST'
                                            });

                                            // Limpiar LocalStorage para asegurar que el UI refleje el reseteo
                                            localStorage.removeItem('mealfit_disabled_ingredients');
                                            localStorage.removeItem('mealfit_plan');
                                            localStorage.removeItem('mealfit_likes');
                                            localStorage.removeItem('mealfit_dislikes');

                                            toast.dismiss(toastId);
                                            toast.success('Cuenta reseteada', { description: 'Empecemos de nuevo.' });
                                            
                                            // GAP 13: Analítica explícita para la intención de empezar de cero
                                            trackEvent('plan_regeneration_triggered', {
                                                reason: 'account_reset',
                                                source: 'settings_reset',
                                                is_expired: false,
                                                has_pantry: false,
                                                type: 'full_reset'
                                            });

                                            setShowEvaluateModal(false);
                                            setShowResetConfirm(false);
                                            
                                            // Ir al form desde cero
                                            setCurrentStep(0);
                                            navigate('/assessment');
                                        } catch (error) {
                                            console.error("Error reseteando preferencias:", error);
                                            toast.dismiss(toastId);
                                            toast.error('Error', { description: 'Hubo un problema al borrar tus preferencias.' });
                                        } finally {
                                            setTimeout(() => { isNavigatingRef.current = false; }, 1000);
                                        }
                                    }}
                                    style={{
                                        padding: '1.25rem', borderRadius: '1rem', border: 'none',
                                        background: '#EF4444', color: 'white', cursor: 'pointer', transition: 'all 0.2s',
                                        fontWeight: 700, fontSize: '1.05rem', textAlign: 'center'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.background = '#DC2626'}
                                    onMouseOut={(e) => e.currentTarget.style.background = '#EF4444'}
                                >
                                    Sí, empezar desde cero
                                </button>

                                <button 
                                    onClick={() => setShowResetConfirm(false)}
                                    style={{
                                        padding: '1.25rem', borderRadius: '1rem', border: '2px solid #E2E8F0',
                                        background: 'transparent', color: '#475569', cursor: 'pointer', transition: 'all 0.2s',
                                        fontWeight: 600, fontSize: '1.05rem', textAlign: 'center'
                                    }}
                                    onMouseOver={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                                    onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </Modal>
                    ) : (
                        <OptionPickerModal
                            isOpen={true}
                            onClose={() => setShowEvaluateModal(false)}
                            title="Evaluar de Nuevo"
                            subtitle="Elige cómo quieres generar tu nuevo plan. ¿Quieres mantener tus datos actuales o empezar desde cero?"
                            headerIcon={{ icon: <Database size={24} strokeWidth={2.5} />, bg: '#DCFCE7', color: '#16A34A' }}
                            options={[
                                { 
                                    id: 'renovar', 
                                    label: 'Renovar Plan Actual', 
                                    desc: 'Genera un plan totalmente nuevo para variar los alimentos, tomando en cuenta los datos que ya configuraste.',
                                    hoverBg: '#EFF6FF',
                                    hoverBorder: '#3B82F6',
                                    labelColor: '#1E3A8A'
                                },
                                { 
                                    id: 'cero', 
                                    label: 'Empezar Desde Cero', 
                                    desc: 'Elimina todo tu progreso y te lleva al formulario inicial.',
                                    hoverBg: '#F0FDF4',
                                    hoverBorder: '#10B981',
                                    labelColor: '#065F46'
                                }
                            ]}
                            isNavigatingOption={isNavigatingOption}
                            onOptionClick={async (optionId) => {
                                if (optionId === 'renovar') {
                                    // GAP 11: Mini-confirm inline si se están agotando los créditos
                                    if (typeof userPlanLimit === 'number' && userPlanLimit > 0) {
                                        if (planCount / userPlanLimit > 0.7) {
                                            const remaining = Math.max(0, userPlanLimit - planCount);
                                            const confirmed = window.confirm(`¿Consumir 1 regeneración? Quedan ${remaining}.`);
                                            if (!confirmed) return;
                                        }
                                    }

                                    if (isNavigatingRef.current) return;
                                    setIsNavigatingOption('renovar');
                                    const toastId = toast.loading('Preparando renovación...', { description: 'Iniciando Chef IA...' });
                                    await regeneratePlan({ reason: 'variety', isPlanExpired: false, toastId, entry_point: 'settings_renovar' });
                                    setIsNavigatingOption(null);
                                    setShowEvaluateModal(false);
                                } else if (optionId === 'cero') {
                                    setShowResetConfirm(true);
                                }
                            }}
                            infoBandRenderer={(hoveredOption) => (
                                <div style={{ marginTop: '1.25rem', padding: '0.85rem', background: '#F8FAFC', borderRadius: '0.8rem', border: '1px solid #E2E8F0', fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                    <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0, color: '#64748B' }} />
                                    <div>
                                        {hoveredOption === 'cero' ? (
                                            <><strong>Empezar de cero:</strong> Limpiará tus datos y generará un plan totalmente nuevo.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~30s. Consumirá 1 regeneración.</span></>
                                        ) : hoveredOption === 'renovar' ? (
                                            <><strong>Renovar:</strong> Mantendrá tus alergias y generará nuevos platos.<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tiempo est.: ~30s. Consumirá 1 regeneración.</span></>
                                        ) : (
                                            <>Te quedan <strong>{typeof userPlanLimit === 'number' ? Math.max(0, userPlanLimit - planCount) : 'ilimitadas'}</strong> regeneraciones de planes este mes.</>
                                        )}
                                    </div>
                                </div>
                            )}
                        />
                    )
                )}
            </AnimatePresence>

                {/* --- HEADER --- */}
                <header className={styles.header}>
                    <h1 className={styles.headerTitle}>
                        Ajustes
                    </h1>
                    <p className={styles.headerSubtitle}>
                        Gestiona tu perfil, preferencias y datos de la aplicación.
                    </p>
                </header>

                <div className={styles.grid}>

                    {/* SECCIÓN 1: PERFIL (CONECTADO A SUPABASE) */}
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            <div style={{ background: '#EFF6FF', padding: '0.5rem', borderRadius: '0.5rem', color: '#3B82F6' }}>
                                <User size={20} />
                            </div>
                            Perfil de Usuario
                        </h2>

                        <div className={styles.profileFlex}>
                            
                            {/* Avatar Centrado */}
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                                <div className={styles.avatar}>
                                    {userName ? userName.charAt(0).toUpperCase() : 'U'}
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {/* Nombre */}
                                <div style={{ width: '100%' }}>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Nombre Completo <span style={{ color: '#EF4444' }}>*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={userName}
                                        onChange={(e) => {
                                            setUserName(e.target.value);
                                            if (nameError) setNameError('');
                                        }}
                                        placeholder="Tu nombre aquí"
                                        style={{
                                            width: '100%',
                                            padding: '0.875rem 1.25rem',
                                            borderRadius: '0.75rem',
                                            border: nameError ? '2px solid #FCA5A5' : '2px solid transparent',
                                            outline: 'none',
                                            fontSize: '1rem',
                                            transition: 'all 0.3s ease',
                                            background: nameError ? '#FEF2F2' : '#F1F5F9',
                                            color: nameError ? '#7F1D1D' : 'var(--text-main)',
                                            fontWeight: 500
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.background = 'white';
                                            e.target.style.borderColor = nameError ? '#EF4444' : '#3B82F6';
                                            e.target.style.boxShadow = nameError ? '0 0 0 4px rgba(239, 68, 68, 0.1)' : '0 0 0 4px rgba(59, 130, 246, 0.1)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.background = nameError ? '#FEF2F2' : '#F1F5F9';
                                            e.target.style.borderColor = nameError ? '#FCA5A5' : 'transparent';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                    {nameError && (
                                        <div style={{ color: '#EF4444', fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 500 }}>
                                            {nameError}
                                        </div>
                                    )}
                                </div>
                                
                                {/* Campo de Email (Solo Lectura) */}
                                <div className={styles.emailContainer}>
                                    <div style={{ background: 'white', padding: '0.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', flexShrink: 0 }}>
                                        <Mail size={18} color="#64748B" />
                                    </div>
                                    <div className={styles.emailInfo}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Correo Electrónico (ID)</span>
                                        <span style={{ color: '#334155', fontSize: '0.95rem', fontWeight: 500, wordBreak: 'break-all' }}>{displayEmail}</span>
                                    </div>
                                    <div className={styles.emailBadge}>
                                        <Shield size={14} /> Protegido
                                    </div>
                                </div>

                                {/* Número de Personas */}
                                <div style={{ width: '100%', marginTop: '0.5rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.75rem' }}>
                                        {isRecalculating ? (
                                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: 'flex' }}>
                                                <Loader2 size={16} color="#7C3AED" />
                                            </motion.div>
                                        ) : (
                                            <Users size={16} color="#7C3AED" />
                                        )}
                                        ¿Para cuántas personas cocinas?
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
                                        {[1, 2, 3, 4, 5, 6].map((num) => {
                                            const isActive = (formData?.householdSize || 1) === num;
                                            return (
                                                <button
                                                    key={num}
                                                    disabled={isRecalculating}
                                                    onClick={async () => {
                                                        if (isRecalculating || isActive) return;
                                                        const prevHouseholdSize = formData?.householdSize || 1;
                                                        
                                                        // Update optimistically
                                                        updateData('householdSize', num);
                                                        if (userProfile && typeof updateUserProfile === 'function') {
                                                            updateUserProfile({ health_profile: { ...formData, householdSize: num } });
                                                        }
                                                        
                                                        if (userProfile?.id && planData) {
                                                            setIsRecalculating(true);
                                                            const recalcToast = toast.loading('Recalculando...', { position: 'top-center' });
                                                            try {
                                                                const response = await fetchWithAuth(`${API_BASE}/api/plans/recalculate-shopping-list`, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ 
                                                                        user_id: userProfile.id, 
                                                                        householdSize: num, 
                                                                        groceryDuration: formData?.groceryDuration || 'weekly' 
                                                                    })
                                                                });
                                                                
                                                                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                                                                const result = await response.json();
                                                                
                                                                if (result.success && result.plan_data) {
                                                                    const rk = `mealfit_restock_cache_${userProfile?.id}_${result.plan_data.grocery_start_date || 'latest'}_${num}_${formData?.groceryDuration || 'weekly'}`;
                                                                    if (result.plan_data.is_restocked == null && localStorage.getItem(rk)) result.plan_data.is_restocked = true;
                                                                    
                                                                    localStorage.setItem('mealfit_plan', JSON.stringify(result.plan_data));
                                                                    setPlanData(result.plan_data);
                                                                    toast.success(`${num} ${num === 1 ? 'persona' : 'personas'}`, { id: recalcToast, icon: '👥' });
                                                                } else {
                                                                    toast.dismiss(recalcToast);
                                                                }
                                                                setIsRecalculating(false);
                                                            } catch {
                                                                toast.dismiss(recalcToast);
                                                                toast.error('Error al actualizar personas');
                                                                updateData('householdSize', prevHouseholdSize);
                                                                if (userProfile && typeof updateUserProfile === 'function') {
                                                                    updateUserProfile({ health_profile: { ...formData, householdSize: prevHouseholdSize } });
                                                                }
                                                                setIsRecalculating(false);
                                                            }
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '0.75rem 0',
                                                        borderRadius: '0.75rem',
                                                        border: isActive ? '2px solid #7C3AED' : '1px solid #E2E8F0',
                                                        background: isActive ? '#F5F3FF' : 'white',
                                                        color: isActive ? '#7C3AED' : '#64748B',
                                                        fontWeight: isActive ? 700 : 500,
                                                        cursor: isRecalculating ? 'not-allowed' : 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                                                        opacity: isRecalculating && !isActive ? 0.5 : 1,
                                                        boxShadow: isActive ? '0 4px 12px rgba(124, 58, 237, 0.15)' : 'none'
                                                    }}
                                                >
                                                    <span style={{ fontSize: '1.2rem' }}>
                                                        {num === 1 ? '👤' : num <= 3 ? '👥' : '👨‍👩‍👧‍👦'}
                                                    </span>
                                                    <span>{num}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <AlertCircle size={12} />
                                        La lista de compras se recalculará automáticamente.
                                    </p>
                                </div>
                            </div>

                            {/* Botón Guardar */}
                            <div className={styles.saveBtnContainer} style={{ marginTop: '0.5rem' }}>
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={isSaving}
                                    style={{
                                        background: saveStatus === 'success' ? '#10B981' : 'var(--primary)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '0.75rem 1.5rem',
                                        borderRadius: '0.75rem',
                                        fontWeight: 600,
                                        cursor: isSaving ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        opacity: isSaving ? 0.8 : 1,
                                        transform: isSaving ? 'scale(0.98)' : 'scale(1)',
                                        boxShadow: saveStatus === 'success' ? '0 4px 12px rgba(16, 185, 129, 0.3)' : '0 4px 12px rgba(59, 130, 246, 0.3)'
                                    }}
                                >
                                    {isSaving ? (
                                        <>Guardando...</>
                                    ) : saveStatus === 'success' ? (
                                        <>¡Cambios Guardados!</>
                                    ) : (
                                        <><Save size={18} /> Guardar Cambios</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </section>


                    {/* SECCIÓN 2: PREFERENCIAS & DATOS (Grid) */}
                    <div className={styles.preferencesGrid}>

                        {/* Preferencias */}
                        <section className={styles.section}>
                            <h2 className={styles.sectionTitle}>
                                <div style={{ background: '#F3E8FF', padding: '0.5rem', borderRadius: '0.5rem', color: '#9333EA' }}>
                                    <Bell size={20} />
                                </div>
                                Notificaciones
                            </h2>

                            <div style={{ 
                                background: 'linear-gradient(135deg, #F8F7FF 0%, #F0EEFF 50%, #EEF2FF 100%)', 
                                borderRadius: '1rem', 
                                padding: '1.25rem', 
                                border: '1px solid #E0E7FF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '1rem'
                            }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                                    <div style={{ 
                                        background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)', 
                                        padding: '0.75rem', 
                                        borderRadius: '0.75rem', 
                                        flexShrink: 0,
                                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                                    }}>
                                        <Brain size={20} color="#FFFFFF" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, color: 'var(--text-main)', display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.95rem' }}>
                                            Alertas Inteligentes
                                            <span style={{
                                                fontSize: '0.6rem',
                                                background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                                                color: '#FFFFFF',
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '1rem',
                                                fontWeight: 700,
                                                letterSpacing: '0.5px',
                                                textTransform: 'uppercase'
                                            }}>Beta</span>
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.45', marginTop: '0.25rem' }}>
                                            Recibe avisos en tu pantalla si olvidas registrar una comida
                                        </div>
                                    </div>
                                </div>
                                <label className={styles.toggleSwitch} style={{ flexShrink: 0, opacity: isPushBlocked ? 0.4 : 1 }}>
                                    <input
                                        type="checkbox"
                                        checked={pushEnabled}
                                        onChange={handleTogglePush}
                                        disabled={isPushLoading || isPushBlocked}
                                    />
                                    <span className={styles.toggleSlider} style={{ opacity: isPushLoading ? 0.5 : 1 }}></span>
                                </label>
                            </div>

                            {isPushBlocked && (
                                <div
                                    role="alert"
                                    onClick={async () => { const msg = await getNotificationBlockedMessage(); toast.error(msg, { duration: 7000 }); }}
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                                        marginTop: '0.65rem', padding: '0.6rem 0.85rem',
                                        background: '#FFF7ED', border: '1px solid #FED7AA',
                                        borderRadius: '0.65rem', cursor: 'pointer',
                                        fontSize: '0.78rem', color: '#92400E', lineHeight: 1.4,
                                    }}
                                >
                                    <Lock size={13} style={{ marginTop: '2px', flexShrink: 0, color: '#D97706' }} />
                                    <span>Permiso bloqueado en el navegador. <strong>Toca aquí para ver cómo reactivarlo.</strong></span>
                                </div>
                            )}

                            {!isPushBlocked && pushSubscribeError && (
                                <div
                                    role="alert"
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                                        marginTop: '0.65rem', padding: '0.6rem 0.85rem',
                                        background: '#FFF1F2', border: '1px solid #FECDD3',
                                        borderRadius: '0.65rem',
                                        fontSize: '0.78rem', color: '#9F1239', lineHeight: 1.4,
                                    }}
                                >
                                    <AlertTriangle size={13} style={{ marginTop: '2px', flexShrink: 0, color: '#E11D48' }} />
                                    <span>
                                        {pushSubscribeError.includes('Brave') || pushSubscribeError.includes('push service')
                                            ? <>Notificaciones bloqueadas por Brave. Habilita la mensajería push en <strong>brave://settings/privacy</strong>.</>
                                            : pushSubscribeError.includes('Service Worker') || pushSubscribeError.includes('timeout')
                                                ? <>Servicio no disponible. Recarga la página e intenta de nuevo.</>
                                                : <>No se pudo activar. Recarga la página e intenta de nuevo.</>
                                        }
                                    </span>
                                </div>
                            )}

                            {/* [P1-4] Toggle de modo de logging */}
                            <div style={{
                                background: 'linear-gradient(135deg, #F8F7FF 0%, #F0EEFF 50%, #EEF2FF 100%)',
                                borderRadius: '1rem',
                                padding: '1.25rem',
                                border: '1px solid #E0E7FF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '1rem',
                                marginTop: '0.75rem'
                            }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                                    <div style={{
                                        background: 'linear-gradient(135deg, #F59E0B 0%, #F97316 100%)',
                                        padding: '0.75rem',
                                        borderRadius: '0.75rem',
                                        flexShrink: 0,
                                        boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)'
                                    }}>
                                        <Zap size={20} color="#FFFFFF" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>
                                            Modo automático
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.45', marginTop: '0.25rem' }}>
                                            Si confías en el plan y prefieres no loguear cada comida, actívalo. No pausaremos tu plan aunque dejes de registrar comidas.
                                        </div>
                                    </div>
                                </div>
                                <label className={styles.toggleSwitch} style={{ flexShrink: 0 }}>
                                    <input
                                        type="checkbox"
                                        checked={loggingPreference === 'auto_proxy'}
                                        onChange={handleToggleLoggingPreference}
                                        disabled={isLoggingPrefLoading}
                                    />
                                    <span className={styles.toggleSlider} style={{ opacity: isLoggingPrefLoading ? 0.5 : 1 }}></span>
                                </label>
                            </div>

                        </section>

                        {/* INFO DEL PLAN */}
                        <section className={styles.section}>
                            <h2 className={styles.sectionTitle}>
                                <div style={{ background: '#DCFCE7', padding: '0.5rem', borderRadius: '0.5rem', color: '#166534' }}>
                                    <Database size={20} />
                                </div>
                                Tu Objetivo Actual
                            </h2>

                            <div style={{
                                background: 'linear-gradient(135deg, var(--primary) 0%, #16a34a 100%)',
                                color: 'white',
                                padding: '1.5rem',
                                borderRadius: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1rem',
                                boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.4)'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.25rem' }}>Meta Principal</div>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 800, textTransform: 'capitalize', letterSpacing: '-0.02em' }}>
                                        {userGoal.replace(/_/g, ' ')}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', marginTop: '0.5rem', opacity: 0.9 }}>
                                        <span style={{ fontWeight: 700 }}>{Math.round(planData?.calories || 2000)}</span> kcal diarios
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                    <>
                                        <button
                                            onClick={() => {
                                                if (!isLimitReached) {
                                                    setShowEvaluateModal(true);
                                                }
                                            }}
                                            className={styles.actionBtn}
                                            disabled={isLimitReached}
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                border: '1px solid rgba(255, 255, 255, 0.4)',
                                                borderRadius: '0.75rem',
                                                background: isLimitReached ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)',
                                                color: isLimitReached ? 'rgba(255, 255, 255, 0.5)' : 'white',
                                                fontWeight: 600,
                                                cursor: isLimitReached ? 'not-allowed' : 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                                backdropFilter: 'blur(10px)',
                                                opacity: isLimitReached ? 0.7 : 1
                                            }}
                                            onMouseOver={(e) => { if (!isLimitReached) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)' }}
                                            onMouseOut={(e) => { if (!isLimitReached) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)' }}
                                        >
                                            {isLimitReached ? 'Límite de Plan Alcanzado' : 'Evaluar de Nuevo'} { !isLimitReached && <ChevronRight size={18} /> }
                                        </button>
                                        
                                        {isLimitReached && (
                                            <div style={{ textAlign: 'center' }}>
                                                <a 
                                                    href="#subscription" 
                                                    style={{ color: '#E0E7FF', fontSize: '0.85rem', textDecoration: 'underline', cursor: 'pointer' }}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        document.querySelector('#subscription')?.scrollIntoView({ behavior: 'smooth' });
                                                    }}
                                                >
                                                    Actualiza tu suscripción para continuar
                                                </a>
                                            </div>
                                        )}
                                    </>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* SECCIÓN NUEVA: SUSCRIPCIÓN */}
                    <section className={styles.section} id="subscription">
                        <h2 className={styles.sectionTitle} style={{ marginBottom: '1rem' }}>
                            <div style={{ background: '#E0E7FF', padding: '0.5rem', borderRadius: '0.5rem', color: '#4F46E5' }}>
                                <CreditCard size={20} />
                            </div>
                            Suscripción y Pagos
                        </h2>
                        
                        <div style={{ 
                            background: '#F8FAFC', 
                            border: '1px solid #E2E8F0', 
                            padding: '1.5rem', 
                            borderRadius: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1rem'
                        }}>
                            <div className={styles.planHeader}>
                                <div style={{ width: '100%' }}>
                                    <div style={{ fontSize: '0.9rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Plan Actual
                                    </div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {userProfile?.plan_tier === 'ultra' ? 'Ultra (Ilimitado)' : 
                                         userProfile?.plan_tier === 'plus' ? 'Plus' : 
                                         userProfile?.plan_tier === 'admin' ? 'Administrador' : 'Plan Gratis'}
                                        
                                        {userProfile?.plan_tier !== 'gratis' && userProfile?.plan_tier !== 'admin' && (
                                            <span style={{ 
                                                fontSize: '0.75rem', 
                                                padding: '0.2rem 0.5rem', 
                                                background: userProfile?.subscription_status === 'CANCELLED' ? '#F1F5F9' : '#DCFCE7', 
                                                color: userProfile?.subscription_status === 'CANCELLED' ? '#475569' : '#166534', 
                                                borderRadius: '1rem', 
                                                fontWeight: 600 
                                            }}>
                                                {userProfile?.subscription_status === 'CANCELLED' ? 'Activo (Cancelada)' : 'Activo'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                {userProfile?.plan_tier !== 'gratis' && userProfile?.plan_tier !== 'admin' && userProfile?.subscription_status !== 'CANCELLED' && (
                                    <div className={styles.planAction}>
                                        <button 
                                            onClick={handleCancelSubscription}
                                            disabled={isCancelling}
                                            style={{
                                                background: '#FEF2F2',
                                                color: '#DC2626',
                                                border: '1px solid #FECACA',
                                                padding: '0.6rem 1.25rem',
                                                borderRadius: '0.75rem',
                                                fontWeight: 600,
                                                cursor: isCancelling ? 'wait' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                transition: 'all 0.2s',
                                                opacity: isCancelling ? 0.7 : 1
                                            }}
                                            onMouseOver={(e) => {
                                                if(!isCancelling) e.currentTarget.style.background = '#FEE2E2';
                                            }}
                                            onMouseOut={(e) => {
                                                if(!isCancelling) e.currentTarget.style.background = '#FEF2F2';
                                            }}
                                        >
                                            {isCancelling ? 'Cancelando...' : 'Cancelar Suscripción'}
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            {userProfile?.plan_tier !== 'gratis' && userProfile?.plan_tier !== 'admin' && userProfile?.subscription_status === 'CANCELLED' && (
                                <div style={{ 
                                    display: 'flex', 
                                    gap: '0.75rem', 
                                    background: '#EFF6FF', 
                                    padding: '1rem', 
                                    borderRadius: '0.75rem',
                                    border: '1px solid #BFDBFE',
                                    color: '#1E3A8A',
                                    fontSize: '0.85rem',
                                    marginTop: '0.5rem'
                                }}>
                                    <AlertCircle size={18} style={{ flexShrink: 0 }} />
                                    <div>
                                        Has cancelado la renovación automática. Mantendrás tus beneficios premium hasta el final de tu ciclo de facturación actual. Luego tu plan pasará a ser Gratis.
                                    </div>
                                </div>
                            )}

                            {userProfile?.plan_tier !== 'gratis' && userProfile?.plan_tier !== 'admin' && userProfile?.subscription_status !== 'CANCELLED' && (
                                <div style={{ 
                                    display: 'flex', 
                                    gap: '0.75rem', 
                                    background: '#FFFBEB', 
                                    padding: '1rem', 
                                    borderRadius: '0.75rem',
                                    border: '1px solid #FEF3C7',
                                    color: '#B45309',
                                    fontSize: '0.85rem',
                                    marginTop: '0.5rem'
                                }}>
                                    <AlertCircle size={18} style={{ flexShrink: 0 }} />
                                    <div>
                                        Al cancelar, la no-renovación será inmediata, pero mantendrás acceso hasta que termine tu periodo pagado actual.
                                    </div>
                                </div>
                            )}
                            
                            {userProfile?.plan_tier === 'gratis' && (
                                <div style={{ fontSize: '0.9rem', color: '#475569' }}>
                                    Actualmente estás en el plan gratis. Puedes mejorar tu plan explorando más funcionalidades de la app.
                                </div>
                            )}
                        </div>
                    </section>

                    {/* SECCIÓN NUEVA: CEREBRO IA */}
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle} style={{ marginBottom: '0.5rem' }}>
                            <div style={{ background: '#FEF08A', padding: '0.5rem', borderRadius: '0.5rem', color: '#CA8A04' }}>
                                <Brain size={20} />
                            </div>
                            Memoria
                        </h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            Tu Agente aprende de tus conversaciones para ser más preciso. Borra lo que ya no necesite saber.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {!['basic', 'plus', 'ultra', 'admin'].includes((userProfile?.plan_tier || '').toLowerCase()) ? (
                                <div style={{ textAlign: 'center', color: '#94A3B8', padding: '2.5rem 1.5rem', background: '#F8FAFC', borderRadius: '1rem', border: '1px dashed #CBD5E1' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
                                    <h3 style={{ margin: '0 0 0.5rem 0', color: '#334155' }}>Memoria a Largo Plazo</h3>
                                    <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: '#64748B' }}>
                                        El Cerebro IA está disponible a partir del plan <strong>Básico</strong>.<br />
                                        La IA aprenderá de tus gustos y conversaciones automáticamente.
                                    </p>
                                </div>
                            ) : isLoadingFacts ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', background: '#F8FAFC', borderRadius: '1rem' }}>
                                    Conectando con el Cerebro Neural...
                                </div>
                            ) : userFacts.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', background: '#F8FAFC', borderRadius: '1rem' }}>
                                    Aún no he aprendido datos extra sobre ti. ¡Sigue conversando!
                                </div>
                            ) : (
                                userFacts.map(fact => (
                                    <div key={fact.id} className={styles.factItem} style={{ 
                                        opacity: isDeletingFact === fact.id ? 0.5 : 1
                                    }}>
                                        <div className={styles.factContent}>
                                            <div className={styles.factText}>
                                                "{fact.fact}"
                                            </div>
                                            <div className={styles.factMeta}>
                                                <span style={{ background: '#E2E8F0', padding: '2px 8px', borderRadius: '4px', textTransform: 'capitalize' }}>
                                                    {fact.metadata?.categoria || 'Dato'}
                                                </span>
                                                {fact.metadata?.ingrediente && (
                                                    <span style={{ border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: '4px' }}>
                                                        {fact.metadata.ingrediente}
                                                    </span>
                                                )}
                                                <span>Añadido: {new Date(fact.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleDeleteFact(fact.id)}
                                            disabled={isDeletingFact === fact.id}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#EF4444',
                                                cursor: 'pointer',
                                                padding: '0.5rem',
                                                borderRadius: '0.5rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'background 0.2s',
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.background = '#FEE2E2'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                                            title="Olvidar Dato"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
};

export default Settings;