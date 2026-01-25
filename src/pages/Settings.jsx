import { useState, useEffect } from 'react';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import {
    User, Bell, Shield, Wallet, ChevronRight,
    Moon, Sun, LogOut, Save, Trash2, Database
} from 'lucide-react';
import { useAssessment } from '../context/AssessmentContext';
import { useNavigate } from 'react-router-dom';

const Settings = () => {
    const { planData, formData, resetApp } = useAssessment();
    const navigate = useNavigate();

    // --- LOCAL STATE ---
    const [notifications, setNotifications] = useState(() => {
        return localStorage.getItem('mealfit_notifications') === 'true';
    });

    const [darkMode, setDarkMode] = useState(() => {
        return localStorage.getItem('mealfit_theme') === 'dark';
    });

    // Estado local para el nombre (inicializado con datos reales o default)
    // Intentamos obtener el nombre de los parámetros del plan o del formulario
    const [userName, setUserName] = useState(planData?.userParams?.name || 'Usuario');
    const [saved, setSaved] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);

    // --- EFECTOS ---

    // 1. Manejo del Tema Oscuro (Dark Mode)
    useEffect(() => {
        if (darkMode) {
            document.body.classList.add('dark-mode'); // Asumiendo que existe o se creará esta clase global
            // O podemos inyectar estilos directamente si no hay CSS global para esto
            document.documentElement.style.setProperty('--bg-page', '#0f172a');
            document.documentElement.style.setProperty('--text-main', '#f8fafc');
            document.documentElement.style.setProperty('--bg-card', '#1e293b');
            // Nota: Esto es un MVP de dark mode. Lo ideal es tener variables CSS bien definidas.
        } else {
            document.body.classList.remove('dark-mode');
            document.documentElement.style.removeProperty('--bg-page');
            document.documentElement.style.removeProperty('--text-main');
            document.documentElement.style.removeProperty('--bg-card');
        }
        localStorage.setItem('mealfit_theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

    // 2. Persistencia de Notificaciones
    useEffect(() => {
        localStorage.setItem('mealfit_notifications', notifications);
    }, [notifications]);

    // --- MANEJADORES ---

    const handleResetApp = () => {
        if (confirmReset) {
            resetApp();
            navigate('/');
        } else {
            setConfirmReset(true);
            // Auto-cancel confirmation after 3 seconds if not clicked
            setTimeout(() => setConfirmReset(false), 3000);
        }
    };

    const handleSaveProfile = () => {
        // En una app real, esto actualizaría el contexto o backend.
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    // Obtenemos el objetivo real del usuario
    const userGoal = formData?.mainGoal || "Mejorar Salud";

    return (
        <DashboardLayout>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* --- HEADER --- */}
                <header style={{ marginBottom: '2.5rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1, marginBottom: '0.5rem' }}>
                        Ajustes
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>
                        Gestiona tus preferencias y datos de la aplicación.
                    </p>
                </header>

                <div style={{ display: 'grid', gap: '2rem' }}>

                    {/* SECCIÓN: PERFIL (REAL) */}
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
                            Perfil
                        </h2>

                        <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <div style={{
                                    width: '80px', height: '80px',
                                    background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                                    borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: '2rem', fontWeight: 700
                                }}>
                                    {userName.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Tu Nombre
                                    </label>
                                    <input
                                        type="text"
                                        value={userName}
                                        onChange={(e) => setUserName(e.target.value)}
                                        style={{
                                            width: '100%',
                                            maxWidth: '300px',
                                            padding: '0.75rem 1rem',
                                            borderRadius: '0.75rem',
                                            border: '1px solid var(--border)',
                                            outline: 'none',
                                            fontSize: '0.95rem'
                                        }}
                                    />
                                </div>
                            </div>
                            {/* Nota: Eliminamos el email porque no hay sistema de login real con correo todavía */}

                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={handleSaveProfile}
                                    style={{
                                        background: 'var(--primary)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '0.75rem 1.5rem',
                                        borderRadius: '0.75rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}
                                >
                                    {saved ? '¡Guardado!' : (
                                        <>
                                            <Save size={18} /> Actualizar Nombre
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </section>


                    {/* SECCIÓN: PREFERENCIAS & DATOS (Grid) */}
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

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Tema Oscuro</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Modo noche (Experimental)</div>
                                    </div>
                                    <button
                                        onClick={() => setDarkMode(!darkMode)}
                                        style={{
                                            background: '#F1F5F9', border: 'none', padding: '0.5rem', borderRadius: '0.5rem',
                                            cursor: 'pointer', color: 'var(--text-main)'
                                        }}
                                    >
                                        {darkMode ? <Moon size={20} /> : <Sun size={20} />}
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* INFO DEL PLAN (Reemplaza la sección de Pagos Falsa) */}
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
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                }}>
                                Cambiar Objetivo (Nuevo Plan) <ChevronRight size={16} />
                            </button>
                        </section>
                    </div>

                    {/* SECCIÓN: GESTIÓN DE DATOS (Real) */}
                    <section style={{
                        background: 'white',
                        borderRadius: '1.5rem',
                        padding: '2rem',
                        boxShadow: 'var(--shadow-sm)',
                        border: '1px solid var(--border)'
                    }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: '#FECACA', padding: '0.5rem', borderRadius: '0.5rem', color: '#DC2626' }}>
                                <Shield size={20} />
                            </div>
                            Gestión de Datos
                        </h2>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{ background: '#FEF2F2', padding: '0.75rem', borderRadius: '0.75rem' }}>
                                    <Trash2 size={20} color="#EF4444" />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Reiniciar Aplicación</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                        Borra todos tus datos locales y planes generados.
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleResetApp}
                                style={{
                                    color: 'white',
                                    background: confirmReset ? '#991B1B' : '#EF4444', // Darker red on confirm
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
                                <LogOut size={18} /> {confirmReset ? '¿Seguro? Clic para borrar' : 'Borrar Todo'}
                            </button>
                        </div>
                    </section>

                </div>
            </div>
        </DashboardLayout>
    );
};

export default Settings;
