import { useState, useEffect } from 'react';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import {
    User, Bell, Shield, ChevronRight,
    LogOut, Save, Trash2, Database, Mail
} from 'lucide-react';
import { useAssessment } from '../context/AssessmentContext';
import { useNavigate } from 'react-router-dom';

const Settings = () => {
    // Obtenemos userProfile y updateUserProfile del contexto global
    const { planData, formData, resetApp, userProfile, updateUserProfile } = useAssessment();
    const navigate = useNavigate();

    // --- ESTADOS LOCALES ---
    
    // Estado para las notificaciones
    const [notifications, setNotifications] = useState(() => {
        return localStorage.getItem('mealfit_notifications') === 'true';
    });

    // CORRECCIÓN: Inicialización Lazy para evitar conflictos de renderizado
    // Si ya tenemos el dato en el contexto, lo usamos inmediatamente al crear el componente.
    const [userName, setUserName] = useState(
        userProfile?.full_name || planData?.userParams?.name || ''
    );

    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(''); // '', 'success', 'error'
    const [confirmReset, setConfirmReset] = useState(false);

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

    // --- MANEJADORES (HANDLERS) ---

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

        setIsSaving(true);
        setSaveStatus('');

        // Actualizamos en Supabase
        const result = await updateUserProfile({
            full_name: userName
        });

        setIsSaving(false);

        if (result.success) {
            setSaveStatus('success');
            setTimeout(() => setSaveStatus(''), 3000);
        } else {
            setSaveStatus('error');
            alert("Hubo un error al guardar. Por favor verifica tu conexión.");
        }
    };

    // Datos derivados para la UI
    const userGoal = formData?.mainGoal || "Mejorar Salud";
    const displayEmail = userProfile?.email || "Cargando correo...";

    return (
        <DashboardLayout>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* --- HEADER --- */}
                <header style={{ marginBottom: '2.5rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1, marginBottom: '0.5rem' }}>
                        Ajustes
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>
                        Gestiona tu perfil, preferencias y datos de la aplicación.
                    </p>
                </header>

                <div style={{ display: 'grid', gap: '2rem' }}>

                    {/* SECCIÓN 1: PERFIL (CONECTADO A SUPABASE) */}
                    <section style={{
                        background: 'white',
                        borderRadius: '1.5rem',
                        padding: '2rem',
                        boxShadow: 'var(--shadow-sm)',
                        border: '1px solid var(--border)'
                    }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: '#EFF6FF', padding: '0.5rem', borderRadius: '0.5rem', color: '#3B82F6' }}>
                                <User size={20} />
                            </div>
                            Perfil de Usuario
                        </h2>

                        <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
                            
                            {/* Avatar y Nombre */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                <div style={{
                                    width: '80px', height: '80px',
                                    background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                                    borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: '2rem', fontWeight: 700,
                                    boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)'
                                }}>
                                    {userName ? userName.charAt(0).toUpperCase() : 'U'}
                                </div>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Nombre Completo
                                    </label>
                                    <input
                                        type="text"
                                        value={userName}
                                        onChange={(e) => setUserName(e.target.value)}
                                        placeholder="Tu nombre aquí"
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem 1rem',
                                            borderRadius: '0.75rem',
                                            border: '1px solid var(--border)',
                                            outline: 'none',
                                            fontSize: '0.95rem',
                                            transition: 'border-color 0.2s',
                                            background: '#F8FAFC'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                                        onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                                    />
                                </div>
                            </div>
                            
                            {/* Campo de Email (Solo Lectura) */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: '#F1F5F9', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                                <Mail size={18} color="#64748B" />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Correo Electrónico (ID)</span>
                                    <span style={{ color: '#334155', fontSize: '0.9rem' }}>{displayEmail}</span>
                                </div>
                                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#64748B', background: '#E2E8F0', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                    NO EDITABLE
                                </span>
                            </div>

                            {/* Botón Guardar */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>

                        {/* Preferencias */}
                        <section style={{
                            background: 'white',
                            borderRadius: '1.5rem',
                            padding: '2rem',
                            boxShadow: 'var(--shadow-sm)',
                            border: '1px solid var(--border)'
                        }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ background: '#F3E8FF', padding: '0.5rem', borderRadius: '0.5rem', color: '#9333EA' }}>
                                    <Bell size={20} />
                                </div>
                                Preferencias
                            </h2>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #F1F5F9' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Notificaciones</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Recordatorios de comidas</div>
                                    </div>
                                    <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                                        <input
                                            type="checkbox"
                                            checked={notifications}
                                            onChange={() => setNotifications(!notifications)}
                                            style={{ opacity: 0, width: 0, height: 0 }}
                                        />
                                        <span style={{
                                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: notifications ? 'var(--primary)' : '#cbd5e1',
                                            transition: '.4s', borderRadius: '34px'
                                        }}>
                                            <span style={{
                                                position: 'absolute', content: '""', height: '20px', width: '20px',
                                                left: notifications ? '22px' : '2px', bottom: '2px',
                                                backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                            }}></span>
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </section>

                        {/* INFO DEL PLAN */}
                        <section style={{
                            background: 'white',
                            borderRadius: '1.5rem',
                            padding: '2rem',
                            boxShadow: 'var(--shadow-sm)',
                            border: '1px solid var(--border)'
                        }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
                                marginBottom: '1.5rem'
                            }}>
                                <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.25rem' }}>Meta Principal</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, textTransform: 'capitalize' }}>
                                    {userGoal.replace(/_/g, ' ')}
                                </div>
                                <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.9 }}>
                                    Calorías: {planData?.calories || 2000} kcal
                                </div>
                            </div>

                            <button
                                onClick={() => navigate('/assessment')}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.75rem',
                                    background: 'white',
                                    color: 'var(--text-main)',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    transition: 'background 0.2s'
                                }}>
                                Cambiar Objetivo (Nuevo Plan) <ChevronRight size={16} />
                            </button>
                        </section>
                    </div>

                    {/* SECCIÓN 3: GESTIÓN DE DATOS (ZONA DE PELIGRO) */}
                    <section style={{
                        background: 'white',
                        borderRadius: '1.5rem',
                        padding: '2rem',
                        boxShadow: 'var(--shadow-sm)',
                        border: '1px solid #FECACA' // Borde rojo suave
                    }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: '#FECACA', padding: '0.5rem', borderRadius: '0.5rem', color: '#DC2626' }}>
                                <Shield size={20} />
                            </div>
                            Zona de Gestión
                        </h2>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{ background: '#FEF2F2', padding: '0.75rem', borderRadius: '0.75rem' }}>
                                    <Trash2 size={20} color="#EF4444" />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Cerrar Sesión & Limpiar</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                        Cierra tu sesión de forma segura.
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleResetApp}
                                style={{
                                    color: 'white',
                                    background: confirmReset ? '#991B1B' : '#EF4444',
                                    padding: '0.75rem 1.5rem',
                                    borderRadius: '0.75rem',
                                    fontWeight: 600,
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}>
                                <LogOut size={18} /> {confirmReset ? '¿Seguro? Clic para confirmar' : 'Salir'}
                            </button>
                        </div>
                    </section>

                </div>
            </div>
        </DashboardLayout>
    );
};

export default Settings;