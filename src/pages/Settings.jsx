import { useState, useEffect } from 'react';
import {
    User, Bell, Shield, ChevronRight,
    LogOut, Save, Trash2, Database, Mail, Brain, CreditCard, AlertCircle, X, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAssessment } from '../context/AssessmentContext';
import { useNavigate } from 'react-router-dom';
import styles from './Settings.module.css';
import { fetchWithAuth } from '../config/api';
import { requestNotificationPermission, subscribeToPushNotifications, unsubscribeFromPushNotifications, isPushSupported } from '../utils/pushNotifications';

const Settings = () => {
    // Obtenemos userProfile y updateUserProfile del contexto global
    const { planData, formData, resetApp, userProfile, updateUserProfile, setCurrentStep } = useAssessment();
    const navigate = useNavigate();

    // --- ESTADOS LOCALES ---
    
    // Estado para las notificaciones (Avisos de comidas)
    const [notifications, setNotifications] = useState(() => {
        return localStorage.getItem('mealfit_notifications') === 'true';
    });

    // Estado para la Rotación Automática Diaria
    const [autoRotateMeals, setAutoRotateMeals] = useState(() => {
        if (userProfile?.health_profile?.autoRotateMeals !== undefined) {
            return userProfile.health_profile.autoRotateMeals;
        }
        const saved = localStorage.getItem('mealfit_auto_rotate');
        return saved !== null ? saved === 'true' : false; // Desactivado por defecto (opcional)
    });

    // Sincronizar desde la BD si cambia remotamente o al cargar
    useEffect(() => {
        if (userProfile?.health_profile?.autoRotateMeals !== undefined) {
            setAutoRotateMeals(userProfile.health_profile.autoRotateMeals);
        }
    }, [userProfile?.health_profile?.autoRotateMeals]);

    // Estado para las Notificaciones Web Push (IA)
    const [pushEnabled, setPushEnabled] = useState(false);
    const [isPushLoading, setIsPushLoading] = useState(false);

    useEffect(() => {
        const checkSubscription = async () => {
            if (isPushSupported() && 'Notification' in window) {
                // Si el permiso está denegado o por defecto, sabemos que es falso
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

    // Persistir preferencia de rotación automática
    useEffect(() => {
        localStorage.setItem('mealfit_auto_rotate', autoRotateMeals);
    }, [autoRotateMeals]);

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
                    toast.error("Debes permitir las notificaciones en los ajustes de Brave. Haz clic en el candado 🔒 de la barra de direcciones.");
                    setIsPushLoading(false);
                    return;
                }

                const result = await subscribeToPushNotifications();
                if (result && result.success) {
                    setPushEnabled(true);
                    toast.success("¡Notificaciones de la IA activadas con éxito!");
                } else {
                    toast.error(`Fallo: ${result?.error || 'Error desconocido'}`);
                }
            }
            setIsPushLoading(false);
        } catch (err) {
            console.error("handleTogglePush error:", err);
            toast.error(`Error inesperado: ${err.message}`);
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
                <AnimatePresence>
                    {showCancelModal && (
                        <div style={{
                            position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
                            alignItems: 'center', justifyContent: 'center', padding: '1.25rem'
                        }}>
                            {/* Backdrop */}
                            <motion.div 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => !isCancelling && setShowCancelModal(false)}
                                style={{
                                    position: 'absolute', inset: 0, 
                                    background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)'
                                }}
                            />

                            {/* Modal Content */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                style={{
                                    background: '#FFFFFF', borderRadius: '1.25rem', padding: '2rem',
                                    width: '100%', maxWidth: '420px', position: 'relative', zIndex: 1,
                                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                                }}
                            >
                                <button 
                                    onClick={() => !isCancelling && setShowCancelModal(false)}
                                    disabled={isCancelling}
                                    style={{
                                        position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none',
                                        color: '#64748B', cursor: isCancelling ? 'not-allowed' : 'pointer', display: 'flex', padding: '0.25rem',
                                        borderRadius: '0.5rem', transition: 'background 0.2s', opacity: isCancelling ? 0.5 : 1
                                    }}
                                    onMouseOver={(e) => { if (!isCancelling) e.currentTarget.style.background = '#F1F5F9'; }}
                                    onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                                >
                                    <X size={20} />
                                </button>
                                
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
                            </motion.div>
                        </div>
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
                                                fontSize: '0.55rem', 
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
                                <label className={styles.toggleSwitch} style={{ flexShrink: 0 }}>
                                    <input
                                        type="checkbox"
                                        checked={pushEnabled}
                                        onChange={handleTogglePush}
                                        disabled={isPushLoading}
                                    />
                                    <span className={styles.toggleSlider} style={{ opacity: isPushLoading ? 0.5 : 1 }}></span>
                                </label>
                            </div>

                            {/* Nuevo Módulo de Rotación Automática */}
                            <div style={{ 
                                background: 'linear-gradient(135deg, #FFF9EB 0%, #FEF3C7 50%, #FEF08A 100%)', 
                                borderRadius: '1rem', 
                                padding: '1.25rem', 
                                border: '1px solid #FDE68A',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '1rem',
                                marginTop: '1rem'
                            }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
                                    <div style={{ 
                                        background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', 
                                        padding: '0.75rem', 
                                        borderRadius: '0.75rem', 
                                        flexShrink: 0,
                                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                                    }}>
                                        <Brain size={20} color="#FFFFFF" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, color: 'var(--text-main)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', fontSize: '0.95rem' }}>
                                            <span>Rotación Autónoma</span>
                                            <span style={{ 
                                                fontSize: '0.55rem', 
                                                background: 'linear-gradient(135deg, #F59E0B, #D97706)', 
                                                color: '#FFFFFF', 
                                                padding: '0.2rem 0.5rem', 
                                                borderRadius: '1rem', 
                                                fontWeight: 700, 
                                                letterSpacing: '0.5px',
                                                textTransform: 'uppercase'
                                            }}>NUEVO</span>
                                            {!['basic', 'plus', 'ultra', 'admin'].includes((userProfile?.plan_tier || '').toLowerCase()) && (
                                                <span style={{ fontSize: '0.85rem', flexShrink: 0 }} title="Requiere Plan Básico o superior">🔒</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#92400E', lineHeight: '1.45', marginTop: '0.25rem' }}>
                                            Renovar tus platos diarios tomando en cuenta tus nuevos gustos.
                                        </div>
                                    </div>
                                </div>
                                <label className={styles.toggleSwitch} style={{ flexShrink: 0 }}>
                                    <input
                                        type="checkbox"
                                        checked={autoRotateMeals && ['basic', 'plus', 'ultra', 'admin'].includes((userProfile?.plan_tier || '').toLowerCase())}
                                        onChange={() => {
                                            const tier = (userProfile?.plan_tier || '').toLowerCase();
                                            const isPremium = ['basic', 'plus', 'ultra', 'admin'].includes(tier);
                                            if (!isPremium) {
                                                toast.error("Función exclusiva de planes Premium", {
                                                    description: "Mejora a Básico o superior para usar la Rotación Autónoma.",
                                                    icon: "🔒"
                                                });
                                                return;
                                            }
                                            const newValue = !autoRotateMeals;
                                            setAutoRotateMeals(newValue);
                                            
                                            if (userProfile) {
                                                const currentHealthProfile = userProfile.health_profile || {};
                                                updateUserProfile({
                                                    health_profile: {
                                                        ...currentHealthProfile,
                                                        autoRotateMeals: newValue
                                                    }
                                                });
                                            }
                                        }}
                                    />
                                    <span className={styles.toggleSlider}></span>
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

                                <button
                                    onClick={() => {
                                        setCurrentStep(0);
                                        navigate('/assessment');
                                    }}
                                    className={styles.actionBtn}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: '1px solid rgba(255, 255, 255, 0.4)',
                                        borderRadius: '0.75rem',
                                        background: 'rgba(255, 255, 255, 0.15)',
                                        color: 'white',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                        backdropFilter: 'blur(10px)',
                                        marginTop: '0.5rem'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
                                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                >
                                    Evaluar de Nuevo <ChevronRight size={18} />
                                </button>
                            </div>
                        </section>
                    </div>

                    {/* SECCIÓN NUEVA: SUSCRIPCIÓN */}
                    <section className={styles.section}>
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