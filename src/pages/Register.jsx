
import { useState } from 'react';
import { authClient } from '../authClient';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { User, Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { checkLeakedPassword } from '../utils/checkLeakedPassword';
import { clearStoredMfSession } from '../utils/firstPartySession';
import { humanizeAuthError } from '../utils/authErrors';
import styles from './Auth.module.css';

const Register = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState(location.state?.email || '');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState(null);
    const [googleLoading, setGoogleLoading] = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // [P3-PASSWORD-MIN-LENGTH · 2026-05-12] Subido de 6 → 8 caracteres
        // alineado con recomendación OWASP. HIBP k-anonymity check abajo
        // cubre el caso "password filtrada"; este check cubre el caso
        // "password corta no-filtrada pero brute-forceable".
        if (password.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres.');
            setLoading(false);
            return;
        }

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            setLoading(false);
            return;
        }

        // [P2-3] HIBP leaked password check (k-anonymity, blocks if mode=block)
        const leak = await checkLeakedPassword(password);
        if (leak.leaked && leak.mode === 'block') {
            setError(
                `Esta contraseña aparece en ${leak.count.toLocaleString()} filtraciones públicas conocidas. Por favor elige una más segura.`
            );
            setLoading(false);
            return;
        }

        const cleanEmail = email.trim();
        try {
            const { error: signUpError } = await authClient.auth.signUp({
                email: cleanEmail,
                password,
                options: {
                    data: {
                        // [P1-REGISTER-NAME · 2026-06-18] El adapter de Neon Auth mapea
                        // options.data.displayName → name del usuario; `full_name` NO se
                        // leía, así que el nombre nunca se persistía. Enviamos ambos.
                        displayName: name.trim(),
                        full_name: name.trim(),
                    },
                },
            });

            if (signUpError) throw signUpError;

            // [P1-REGISTER-SESSION-FIX · 2026-06-16] `signUp` de Better Auth NO deja
            // la sesión activa de forma síncrona en el cliente. Sin esto la app se
            // quedaba en modo invitado (isGuest = !session && guestFlag — sin sesión
            // el flag de invitado nunca se limpiaba) y OBLIGABA a refrescar; peor:
            // en ese refresh un token first-party stale de OTRA cuenta del mismo
            // dispositivo (vía _resolveViaFirstParty) "ganaba" y la app cargaba la
            // cuenta vieja en vez de la recién creada.
            //   (1) descartamos cualquier token first-party previo del dispositivo;
            //   (2) forzamos el SIGNED_IN del NUEVO usuario → handleAuthChange setea
            //       la sesión, limpia el modo invitado y mintea el token correcto.
            try { clearStoredMfSession(); } catch { /* best-effort */ }
            const { error: signInError } = await authClient.auth.signInWithPassword({ email: cleanEmail, password });
            if (signInError) {
                // Cuenta creada pero el auto-login no procedió (p.ej. confirmación
                // de correo pendiente): mandamos a login con el email para entrar
                // manualmente, en vez de dejar la app en un estado a medias.
                navigate('/login', { state: { email: cleanEmail, justRegistered: true } });
                return;
            }

            // [P0-LOGIN-SESSION-PROPAGATE · 2026-06-18] Recarga COMPLETA (no navigate SPA):
            // el adapter de Neon Auth no emite el evento de sesión same-tab tras
            // signInWithPassword → con navigate() la sesión quedaba null y ProtectedRoute
            // rebotaba a /login tras registrarse. El reload remonta el provider →
            // getSession lee la cookie fresca → la sesión se propaga.
            window.location.assign('/assessment');
        } catch (err) {
            const raw = err?.message || '';
            let errorMessage;
            if (raw === 'User already registered' || raw.includes('already registered')) {
                errorMessage = 'Este correo electrónico ya está registrado. Por favor, inicia sesión.';
            } else if (raw.includes('Password should be at least')) {
                errorMessage = 'La contraseña debe tener al menos 8 caracteres.';
            } else if (raw.toLowerCase().includes('invalid email')) {
                errorMessage = 'El correo electrónico ingresado no tiene un formato válido.';
            } else {
                // red caída / rate-limit / desconocido → mensaje es-DO accionable.
                errorMessage = humanizeAuthError(err);
            }
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.authContainer}>
            {/* Background handled by CSS ::before */}

            <div className={styles.authCard}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 className={styles.title}>
                        Crea tu Cuenta
                    </h1>
                    <p className={styles.subtitle}>Empieza tu transformación hoy mismo.</p>
                </div>

                {/* [P2-AUDIT-6 · 2026-05-15] `role="alert"` + `aria-live="assertive"`
                    para que screen readers anuncien errores de validación
                    inmediatamente. */}
                {error && (
                    <div className={styles.errorBox} role="alert" aria-live="assertive">
                        <AlertCircle size={16} aria-hidden="true" />
                        {error}
                    </div>
                )}

                <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div className={styles.formGroup}>
                        <label className={styles.label} htmlFor="register-name">Nombre Completo <span className={styles.requiredAsterisk}>*</span></label>
                        <div className={styles.inputWrapper}>
                            <div className={styles.inputIcon} aria-hidden="true">
                                <User size={18} />
                            </div>
                            <input
                                id="register-name"
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Tu Nombre"
                                className={styles.input}
                                autoComplete="name"
                                spellCheck="false"
                            />
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label} htmlFor="register-email">Correo Electrónico <span className={styles.requiredAsterisk}>*</span></label>
                        <div className={styles.inputWrapper}>
                            <div className={styles.inputIcon} aria-hidden="true">
                                <Mail size={18} />
                            </div>
                            <input
                                id="register-email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="ejemplo@correo.com"
                                className={styles.input}
                                autoComplete="email"
                                spellCheck="false"
                            />
                        </div>
                    </div>

                    {name.trim() !== '' && email.trim() !== '' && (
                        <div className={`${styles.inputRow} ${styles.animateFadeIn}`}>
                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="register-password">Contraseña <span className={styles.requiredAsterisk}>*</span></label>
                                <div className={styles.inputWrapper}>
                                    <div className={styles.inputIcon} aria-hidden="true">
                                        <Lock size={18} />
                                    </div>
                                    <input
                                        id="register-password"
                                        type={showPassword ? "text" : "password"}
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className={styles.input}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className={styles.passwordToggle}
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                    >
                                        {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                                    </button>
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="register-confirm-password">Confirmar Contraseña <span className={styles.requiredAsterisk}>*</span></label>
                                <div className={styles.inputWrapper}>
                                    <div className={styles.inputIcon} aria-hidden="true">
                                        <Lock size={18} />
                                    </div>
                                    <input
                                        id="register-confirm-password"
                                        type={showConfirmPassword ? "text" : "password"}
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className={styles.input}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className={styles.passwordToggle}
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                    >
                                        {showConfirmPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className={styles.submitBtn}
                    >
                        {loading ? (
                            <>
                                <Loader2 className={styles.loader} size={18} />
                                Registrando...
                            </>
                        ) : (
                            <>Crear Cuenta <ArrowRight size={18} /></>
                        )}
                    </button>

                    <div className={styles.divider}>
                        o regístrate con
                    </div>

                    <button
                        type="button"
                        disabled={googleLoading}
                        onClick={async () => {
                            if (googleLoading) return;
                            setGoogleLoading(true);
                            setError(null);
                            try {
                                const { error } = await authClient.auth.signInWithOAuth({
                                    provider: 'google',
                                    options: {
                                        redirectTo: `${window.location.origin}/assessment`
                                    }
                                });
                                if (error) throw error;
                                // éxito → redirige a Google; no reseteamos loading.
                            } catch (error) {
                                setError(humanizeAuthError(error));
                                setGoogleLoading(false);
                            }
                        }}
                        className={styles.googleBtn}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        {googleLoading ? 'Conectando con Google…' : 'Google'}
                    </button>
                </form>

                <div className={styles.footerText}>
                    ¿Ya tienes cuenta?{' '}
                    <Link to="/login" className={styles.link}>
                        Inicia Sesión
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default Register;
