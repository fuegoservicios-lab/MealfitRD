// [ACCOUNT-SETTINGS · 2026-05-31] Página de Configuración LIVIANA y separada
// del dashboard (`/dashboard/settings` es el panel completo de 2800 líneas).
// Vive bajo el `Layout` simple (mismo header logo + "Cerrar Sesión" del
// screenshot) en la ruta top-level `/configuracion`. Alcance acotado a lo que
// el usuario pidió: cambiar Apariencia, Nombre y Correo — más Contraseña.
// (Cerrar sesión NO vive aquí: ya existe en el menú de cuenta del header.)
//
// Contratos reutilizados (no reinventados):
//   - Tema: applyThemePref + localStorage('mealfit_theme') (utils/theme.js).
//   - Nombre: updateUserProfile({ full_name }) (AssessmentContext, user_profiles).
//   - Correo: SOLO LECTURA — no se cambia desde aquí (decisión del usuario).
//   - Contraseña: reauth con la contraseña actual (cliente Supabase efímero) +
//     supabase.auth.updateUser({ password }).
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Monitor, Sun, Moon, User, Lock, Loader2,
    ArrowLeft, Check, ShieldCheck, Palette,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';
import { useAssessment } from '../context/AssessmentContext';
import { supabase } from '../supabase';
import { applyThemePref, getStoredThemePref } from '../utils/theme';
import { safeLocalStorageSet } from '../utils/safeLocalStorage';

const THEME_OPTIONS = [
    { value: 'system', label: 'Sistema', desc: 'Sigue tu dispositivo', Icon: Monitor },
    { value: 'light', label: 'Básico', desc: 'Tema claro', Icon: Sun },
    { value: 'dark', label: 'Oscuro', desc: 'Tonos oscuros', Icon: Moon },
];

const AccountSettings = () => {
    const navigate = useNavigate();
    const { userProfile, updateUserProfile, session } = useAssessment();

    // --- Apariencia ---
    const [themePref, setThemePref] = useState(() => getStoredThemePref());

    const handleSelectTheme = (value) => {
        if (value === themePref) return;
        setThemePref(value);
        safeLocalStorageSet('mealfit_theme', value);
        applyThemePref(value); // aplica html[data-theme] en vivo (sin reload)
        toast.success('Apariencia actualizada.', { duration: 1800 });
    };

    // --- Nombre ---
    const [name, setName] = useState(userProfile?.full_name || '');
    const [savingName, setSavingName] = useState(false);

    // --- Correo (solo lectura) ---
    // [ACCOUNT-EMAIL-READONLY · 2026-06-01] El correo ya NO se cambia desde aquí
    // (decisión del usuario). Se muestra de solo-lectura.
    const displayEmail = userProfile?.email || session?.user?.email || '';

    // Hidratar el nombre cuando el perfil llega async (mismo patrón que Settings.jsx).
    useEffect(() => {
        if (userProfile?.full_name) setName((p) => p || userProfile.full_name);
    }, [userProfile?.full_name]);

    // --- Contraseña ---
    // [ACCOUNT-PASSWORD-REAUTH · 2026-06-01] Cambiar la contraseña exige la
    // contraseña ACTUAL (reautenticación), verificada con un cliente efímero.
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);

    const handleSaveName = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error('Escribe tu nombre.');
            return;
        }
        if (trimmed === (userProfile?.full_name || '')) {
            toast.info('Tu nombre no cambió.');
            return;
        }
        setSavingName(true);
        const res = await updateUserProfile({ full_name: trimmed });
        setSavingName(false);
        if (res?.success) toast.success('Nombre guardado.');
        else toast.error('No se pudo guardar el nombre. Verifica tu conexión.');
    };

    const handleSavePassword = async () => {
        if (!currentPassword) {
            toast.error('Ingresa tu contraseña actual.');
            return;
        }
        if (newPassword.length < 8) {
            toast.error('La nueva contraseña debe tener al menos 8 caracteres.');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('Las contraseñas no coinciden.');
            return;
        }
        if (newPassword === currentPassword) {
            toast.error('La nueva contraseña debe ser distinta a la actual.');
            return;
        }
        const accountEmail = userProfile?.email || session?.user?.email;
        if (!accountEmail) {
            toast.error('No pudimos verificar tu cuenta. Recarga e inténtalo de nuevo.');
            return;
        }
        setSavingPassword(true);
        try {
            // [ACCOUNT-PASSWORD-REAUTH · 2026-06-01] Verificar la contraseña ACTUAL
            // con un cliente Supabase efímero (persistSession:false +
            // autoRefreshToken:false + storageKey propio) → NO toca la sesión
            // principal ni dispara su onAuthStateChange. Si las credenciales son
            // correctas, recién entonces aplicamos la nueva contraseña con el
            // cliente principal (ya autenticado).
            const verifier = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'mealfit-pwverify' } },
            );
            const { error: verifyErr } = await verifier.auth.signInWithPassword({
                email: accountEmail,
                password: currentPassword,
            });
            if (verifyErr) {
                toast.error('La contraseña actual no es correcta.');
                return;
            }

            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            toast.success('Contraseña actualizada.');
        } catch (err) {
            console.error('Error cambiando contraseña:', err);
            toast.error(err?.message || 'No se pudo actualizar la contraseña.');
        } finally {
            setSavingPassword(false);
        }
    };

    return (
        <div className="acct-wrap">
            <style>{`
                .acct-wrap {
                    max-width: 680px;
                    margin: 0 auto;
                    padding: 1.5rem 1.25rem 4rem;
                    font-family: var(--font-body);
                    color: var(--text-main);
                }
                /* [ACCOUNT-BG · 2026-06-01] Mismo fondo del dashboard. Pseudo-elemento
                   fijo al viewport, detrás del contenido (z-index:-1 → por encima del
                   canvas --bg-page del body, debajo de las tarjetas).
                   - Claro: la ilustración de burbujas (dashboard_bg.png, opacity 0.85).
                   - Oscuro (regla de abajo): glows indigo + rayas diagonales hairline,
                     igual que el DashboardLayout dark (la ilustración no encaja en dark). */
                .acct-wrap::before {
                    content: '';
                    position: fixed;
                    inset: 0;
                    z-index: -1;
                    /* [P6-SPEED-IMG · 2026-06-01] WebP con fallback PNG vía image-set. */
                    background-image: url('/dashboard_bg.png');
                    background-image: image-set(url('/dashboard_bg.webp') type('image/webp'), url('/dashboard_bg.png') type('image/png'));
                    background-size: cover;
                    background-position: center;
                    background-repeat: no-repeat;
                    opacity: 0.85;
                    pointer-events: none;
                }
                html[data-theme="dark"] .acct-wrap::before {
                    background-image:
                        repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.04) 0, rgba(255, 255, 255, 0.04) 1px, transparent 1px, transparent 52px),
                        radial-gradient(ellipse 70% 55% at 8% -10%, rgba(99, 102, 241, 0.28) 0%, transparent 55%),
                        radial-gradient(ellipse 58% 50% at 100% 2%, rgba(129, 140, 248, 0.20) 0%, transparent 52%),
                        radial-gradient(ellipse 55% 50% at 90% 96%, rgba(139, 92, 246, 0.14) 0%, transparent 55%),
                        radial-gradient(ellipse 75% 55% at 28% 108%, rgba(79, 70, 229, 0.18) 0%, transparent 55%);
                    background-size: auto, cover, cover, cover, cover;
                    background-repeat: repeat, no-repeat, no-repeat, no-repeat, no-repeat;
                    opacity: 1;
                }
                .acct-back {
                    display: inline-flex; align-items: center; gap: 0.4rem;
                    background: transparent; border: none; cursor: pointer;
                    color: var(--text-muted); font-size: 0.9rem; font-family: inherit;
                    padding: 0.4rem 0; margin-bottom: 0.5rem; border-radius: var(--radius-sm);
                }
                .acct-back:hover { color: var(--text-main); }
                .acct-title {
                    font-family: var(--font-heading); font-weight: 800;
                    font-size: 1.9rem; letter-spacing: -0.02em; margin: 0.2rem 0 0.25rem;
                }
                .acct-subtitle { color: var(--text-muted); font-size: 0.98rem; margin: 0 0 1.75rem; }
                .acct-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-xl);
                    padding: 1.4rem;
                    margin-bottom: 1.25rem;
                    box-shadow: var(--shadow-sm);
                }
                .acct-card-head {
                    display: flex; align-items: center; gap: 0.7rem; margin-bottom: 1.2rem;
                }
                .acct-card-icon {
                    width: 40px; height: 40px; flex-shrink: 0;
                    display: grid; place-items: center;
                    border-radius: var(--radius-md);
                    background: color-mix(in srgb, var(--primary) 14%, transparent);
                    color: var(--primary);
                }
                .acct-card-title { font-family: var(--font-heading); font-weight: 700; font-size: 1.1rem; margin: 0; }
                .acct-card-sub { color: var(--text-muted); font-size: 0.82rem; margin: 0.1rem 0 0; }

                /* Selector de apariencia */
                .acct-theme-grid {
                    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem;
                }
                .acct-theme-opt {
                    display: flex; flex-direction: column; align-items: center; gap: 0.45rem;
                    padding: 0.9rem 0.5rem; cursor: pointer;
                    border-radius: var(--radius-lg);
                    border: 1.5px solid var(--border);
                    background: var(--bg-muted);
                    color: var(--text-muted);
                    font-family: inherit; transition: all 0.15s ease;
                    text-align: center;
                }
                .acct-theme-opt:hover { border-color: var(--primary-light); color: var(--text-main); }
                .acct-theme-opt.active {
                    border-color: var(--primary);
                    background: color-mix(in srgb, var(--primary) 12%, var(--bg-card));
                    color: var(--primary);
                    box-shadow: var(--shadow-sm);
                }
                .acct-theme-label { font-weight: 700; font-size: 0.9rem; }
                .acct-theme-desc { font-size: 0.72rem; opacity: 0.85; }
                .acct-theme-check {
                    position: absolute; top: 0.5rem; right: 0.5rem;
                }
                .acct-theme-opt { position: relative; }

                /* Filas de campos */
                .acct-field { margin-bottom: 1.1rem; }
                .acct-field:last-child { margin-bottom: 0; }
                .acct-label {
                    display: block; font-size: 0.82rem; font-weight: 600;
                    color: var(--text-muted); margin-bottom: 0.4rem;
                }
                .acct-row { display: flex; gap: 0.6rem; align-items: stretch; }
                .acct-input {
                    flex: 1; min-width: 0;
                    padding: 0.7rem 0.85rem;
                    border: 1.5px solid var(--border);
                    border-radius: var(--radius-md);
                    background: var(--bg-page);
                    color: var(--text-main);
                    font-size: 0.95rem; font-family: inherit;
                    transition: border-color 0.15s ease;
                }
                .acct-input:focus-visible {
                    outline: none; border-color: var(--primary);
                    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
                }
                .acct-input::placeholder { color: var(--text-light); }
                .acct-input-readonly {
                    background: var(--bg-muted);
                    color: var(--text-muted);
                    cursor: default;
                }
                .acct-input-readonly:focus-visible {
                    border-color: var(--border);
                    box-shadow: none;
                }
                .acct-btn {
                    display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
                    padding: 0.7rem 1.1rem; white-space: nowrap;
                    border: none; border-radius: var(--radius-md); cursor: pointer;
                    background: var(--primary); color: #fff;
                    font-weight: 700; font-size: 0.9rem; font-family: inherit;
                    transition: filter 0.15s ease, transform 0.05s ease;
                }
                .acct-btn:hover:not(:disabled) { filter: brightness(1.07); }
                .acct-btn:active:not(:disabled) { transform: translateY(1px); }
                .acct-btn:disabled { opacity: 0.6; cursor: not-allowed; }
                .acct-hint {
                    display: flex; align-items: flex-start; gap: 0.4rem;
                    font-size: 0.78rem; color: var(--text-muted);
                    margin-top: 0.5rem; line-height: 1.35;
                }
                .acct-hint svg { flex-shrink: 0; margin-top: 1px; }

                .acct-spin { animation: acct-spin 0.8s linear infinite; }
                @keyframes acct-spin { to { transform: rotate(360deg); } }

                @media (max-width: 520px) {
                    .acct-row { flex-direction: column; }
                    /* [P3-ACCT-SAVE-BTN-SIZE · 2026-06-01] En móvil el botón es full-width;
                       a 0.9rem el texto ("Guardar" / "Actualizar") se veía diminuto dentro
                       del botón ancho. Subimos fuente + padding para un CTA legible y
                       proporcionado. Desktop (botón inline compacto) queda igual. */
                    .acct-btn { width: 100%; font-size: 1.15rem; padding: 0.95rem; }
                    .acct-theme-grid { grid-template-columns: 1fr; }
                    .acct-theme-opt { flex-direction: row; justify-content: flex-start; gap: 0.7rem; padding: 0.8rem 1rem; }
                }
            `}</style>

            {/* [ACCOUNT-SETTINGS · 2026-06-01] "Volver" va SIEMPRE al inicio del
                landing (navigate('/')), NO navigate(-1). El back-en-historial era
                no-determinista: si la entrada previa no era el landing, ProtectedRoute
                la redirigía a /assessment (formulario) cuando la cuenta aún no tiene
                plan/perfil. navigate('/') es PUSH → el guard landing-skip de
                ProtectedRoute (solo POP) NO dispara, así que se queda en el inicio. */}
            <button className="acct-back" onClick={() => navigate('/')} aria-label="Volver al inicio">
                <ArrowLeft size={18} /> Volver
            </button>
            <h1 className="acct-title">Configuración</h1>
            <p className="acct-subtitle">Apariencia y datos de tu cuenta.</p>

            {/* APARIENCIA */}
            <section className="acct-card">
                <div className="acct-card-head">
                    <div className="acct-card-icon"><Palette size={20} /></div>
                    <div>
                        <h2 className="acct-card-title">Apariencia</h2>
                        <p className="acct-card-sub">Elige cómo se ve la aplicación.</p>
                    </div>
                </div>
                <div className="acct-theme-grid" role="radiogroup" aria-label="Apariencia">
                    {THEME_OPTIONS.map(({ value, label, desc, Icon }) => {
                        const active = themePref === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={`acct-theme-opt${active ? ' active' : ''}`}
                                onClick={() => handleSelectTheme(value)}
                            >
                                {active && <Check size={15} className="acct-theme-check" />}
                                <Icon size={22} />
                                <span className="acct-theme-label">{label}</span>
                                <span className="acct-theme-desc">{desc}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* CUENTA */}
            <section className="acct-card">
                <div className="acct-card-head">
                    <div className="acct-card-icon"><User size={20} /></div>
                    <div>
                        <h2 className="acct-card-title">Cuenta</h2>
                        <p className="acct-card-sub">Tu nombre y correo.</p>
                    </div>
                </div>

                {/* Nombre */}
                <div className="acct-field">
                    <label className="acct-label" htmlFor="acct-name">Nombre</label>
                    <div className="acct-row">
                        <input
                            id="acct-name"
                            className="acct-input"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Tu nombre"
                            autoComplete="name"
                        />
                        <button className="acct-btn" onClick={handleSaveName} disabled={savingName}>
                            {savingName && <Loader2 size={16} className="acct-spin" />}
                            Guardar
                        </button>
                    </div>
                </div>

                {/* Correo (solo lectura) */}
                <div className="acct-field">
                    <label className="acct-label" htmlFor="acct-email">Correo electrónico</label>
                    <input
                        id="acct-email"
                        className="acct-input acct-input-readonly"
                        style={{ width: '100%' }}
                        type="email"
                        value={displayEmail}
                        readOnly
                        aria-readonly="true"
                    />
                    <p className="acct-hint">
                        <ShieldCheck size={14} />
                        Tu correo de acceso. No se puede cambiar desde aquí.
                    </p>
                </div>
            </section>

            {/* CONTRASEÑA */}
            <section className="acct-card">
                <div className="acct-card-head">
                    <div className="acct-card-icon"><Lock size={20} /></div>
                    <div>
                        <h2 className="acct-card-title">Contraseña</h2>
                        <p className="acct-card-sub">Cámbiala cuando quieras.</p>
                    </div>
                </div>
                <div className="acct-field">
                    <label className="acct-label" htmlFor="acct-pass-current">Contraseña actual</label>
                    <input
                        id="acct-pass-current"
                        className="acct-input"
                        style={{ width: '100%' }}
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Tu contraseña actual"
                        autoComplete="current-password"
                    />
                </div>
                <div className="acct-field">
                    <label className="acct-label" htmlFor="acct-pass">Nueva contraseña</label>
                    <input
                        id="acct-pass"
                        className="acct-input"
                        style={{ width: '100%' }}
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        autoComplete="new-password"
                    />
                </div>
                <div className="acct-field">
                    <label className="acct-label" htmlFor="acct-pass2">Confirmar contraseña</label>
                    <div className="acct-row">
                        <input
                            id="acct-pass2"
                            className="acct-input"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Repite la contraseña"
                            autoComplete="new-password"
                        />
                        <button className="acct-btn" onClick={handleSavePassword} disabled={savingPassword}>
                            {savingPassword && <Loader2 size={16} className="acct-spin" />}
                            Actualizar
                        </button>
                    </div>
                </div>
            </section>

        </div>
    );
};

export default AccountSettings;
