
import { useState, useEffect } from 'react';
import { authClient } from '../authClient';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { User, Lock, ArrowRight, AlertCircle, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import styles from './Auth.module.css';
import { useAssessment } from '../context/AssessmentContext';
import { logoutFirstPartySession } from '../utils/firstPartySession';
import { humanizeAuthError } from '../utils/authErrors';

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    // [P1-GUEST-MODE · 2026-06-15] Entrada al funnel del plan gratuito sin cuenta.
    const { activateGuestMode, session } = useAssessment();
    const [guestLoading, setGuestLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    // [LOGIN-LOCATION-STATE · 2026-06-18] Register manda {email, justRegistered} al
    // rebotar a /login (auto-login pendiente de confirmación) → pre-rellenamos el correo
    // y mostramos un banner, en vez de aterrizar en un login vacío sin contexto.
    const [email, setEmail] = useState(location.state?.email || '');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
    const [error, setError] = useState(null);
    const [infoMessage, setInfoMessage] = useState(
        location.state?.justRegistered ? 'Cuenta creada. Inicia sesión para continuar.' : null
    );
    const [resetLoading, setResetLoading] = useState(false);
    const [resetMessage, setResetMessage] = useState(null);

    // Limpiar el location.state tras consumirlo (un refresh no debe re-mostrar el banner).
    useEffect(() => {
        if (location.state) navigate(location.pathname, { replace: true, state: null });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setInfoMessage(null);

        try {
            const { error } = await authClient.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

            if (error) throw error;
            // [P0-LOGIN-SESSION-PROPAGATE · 2026-06-18] Recarga COMPLETA en vez de
            // navigate('/') SPA. El adapter de Neon Auth NO emite el evento de sesión en
            // la MISMA pestaña tras signInWithPassword (el BroadcastChannel excluye el tab
            // originante), así que con navigate() SPA la sesión quedaba null en el contexto
            // y ProtectedRoute rebotaba a /login pese al login correcto (enmascarado porque
            // el OAuth de Google sí hace redirect completo y es el camino dominante). Un
            // full reload remonta el provider → getSession lee la cookie fresca → la sesión
            // se propaga. El landing-skip enruta luego a /dashboard o /assessment según el
            // estado del plan.
            window.location.assign('/');
        } catch (err) {
            // humanizeAuthError mapea 'Invalid login credentials' → "Correo o contraseña
            // incorrectos." (anti user-enumeration, P2-LOGIN-WRONG-PW-REDIRECT) y la red
            // caída a un mensaje es-DO de conexión.
            setError(humanizeAuthError(err));
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError(null);
        setResetMessage(null);

        if (!email) {
            setError('Por favor, ingresa tu correo electrónico para restablecer la contraseña.');
            return;
        }

        setResetLoading(true);
        try {
            await authClient.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/reset-password`,
            });
        } catch (err) {
            // [ANTI-ENUMERATION · 2026-06-18] Solo informamos errores de RED/rate-limit;
            // la EXISTENCIA del correo NO se revela. Antes 'User not found' redirigía a
            // /register → un atacante distinguía cuenta-existe (mensaje de éxito) de
            // cuenta-no-existe (redirect). Misma clase que P2-LOGIN-WRONG-PW-REDIRECT
            // cerró para el login, ahora cerrada también en el reset.
            const lower = (err?.message || '').toLowerCase();
            const isNetworkOrRate =
                /rate limit|too many/.test(lower) ||
                /failed to fetch|networkerror|network error|load failed/.test(lower) ||
                (typeof navigator !== 'undefined' && navigator.onLine === false);
            if (isNetworkOrRate) {
                setError(humanizeAuthError(err));
                setResetLoading(false);
                return;
            }
            // Cualquier otro error (incl. "User not found") cae al mensaje neutro de abajo.
        }
        // Mensaje neutro SIEMPRE: no revela si el correo existe. Si existe, Neon Auth
        // envía el enlace; si no, no ocurre nada.
        setResetMessage('Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja (y la carpeta de spam).');
        setResetLoading(false);
    };

    return (
        <div className={styles.authContainer}>
            {/* Background handled by CSS ::before */}

            <div className={styles.authCard}>
                <div className={styles.logoWrapper}>
                    <div className={styles.logo}>
                        Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 className={styles.title}>
                        {isForgotPasswordMode ? 'Recuperar Contraseña' : 'Bienvenido de nuevo'}
                    </h1>
                    <p className={styles.subtitle}>
                        {isForgotPasswordMode 
                            ? 'Ingresa tu correo y te enviaremos un enlace para restablecerla.' 
                            : 'Inicia sesión para continuar tu transformación.'}
                    </p>
                </div>

                {/* [P2-AUDIT-6 · 2026-05-15] `role="alert"` + `aria-live="assertive"`
                    para que screen readers (NVDA, VoiceOver, TalkBack) anuncien
                    errores de validación inmediatamente al renderizarse, sin
                    requerir foco. Sin estos atributos los errores eran
                    invisibles para usuarios non-visual. */}
                {error && (
                    <div className={styles.errorBox} role="alert" aria-live="assertive">
                        <AlertCircle size={16} aria-hidden="true" />
                        {error}
                    </div>
                )}

                {resetMessage && (
                    <div className={styles.successBox} role="status" aria-live="polite">
                        <CheckCircle2 size={16} aria-hidden="true" />
                        {resetMessage}
                    </div>
                )}

                {infoMessage && (
                    <div className={styles.successBox} role="status" aria-live="polite">
                        <CheckCircle2 size={16} aria-hidden="true" />
                        {infoMessage}
                    </div>
                )}

                {isForgotPasswordMode ? (
                    <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="login-reset-email">Correo Electrónico <span className={styles.requiredAsterisk}>*</span></label>
                            <div className={styles.inputWrapper}>
                                <div className={styles.inputIcon} aria-hidden="true">
                                    <User size={18} />
                                </div>
                                <input
                                    id="login-reset-email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="ejemplo@correo.com"
                                    className={styles.input}
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={resetLoading}
                            className={styles.submitBtn}
                            style={{ margin: '1rem 0' }}
                        >
                            {resetLoading ? (
                                <>
                                    <Loader2 className={styles.loader} size={18} />
                                    Enviando...
                                </>
                            ) : (
                                <>Enviar enlace <ArrowRight size={18} /></>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setIsForgotPasswordMode(false);
                                setError(null);
                                setResetMessage(null);
                            }}
                            className={styles.forgotPasswordLink}
                            style={{ margin: '0 auto' }}
                        >
                            Volver al inicio de sesión
                        </button>
                    </form>
                ) : (
                    <>
                        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="login-email">Correo Electrónico <span className={styles.requiredAsterisk}>*</span></label>
                                <div className={styles.inputWrapper}>
                                    <div className={styles.inputIcon} aria-hidden="true">
                                        <User size={18} />
                                    </div>
                                    <input
                                        id="login-email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="ejemplo@correo.com"
                                        className={styles.input}
                                        autoComplete="email"
                                    />
                                </div>
                            </div>

                            {email.length > 0 && (
                                <div className={styles.animateFadeIn}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label} htmlFor="login-password">Contraseña <span className={styles.requiredAsterisk}>*</span></label>
                                        <div className={styles.inputWrapper}>
                                            <div className={styles.inputIcon} aria-hidden="true">
                                                <Lock size={18} />
                                            </div>
                                            <input
                                                id="login-password"
                                                type={showPassword ? "text" : "password"}
                                                required
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className={styles.input}
                                                autoComplete="current-password"
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

                                    {/* [LOGIN-REMEMBER-REMOVED · 2026-06-18] Se quitó la casilla
                                        "Recordarme": era dead-UI (setPersistence comentado y ausente
                                        en el adapter de Neon Auth). La sesión first-party (30d sliding,
                                        __Host-mf_session) ya es "recordarme" por defecto; un checkbox
                                        que no cambia nada es una promesa rota en dispositivos
                                        compartidos. Se conserva el enlace de recuperar contraseña. */}
                                    <div className={styles.checkboxContainer} style={{ justifyContent: 'flex-end' }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsForgotPasswordMode(true);
                                                setError(null);
                                                setResetMessage(null);
                                            }}
                                            className={styles.forgotPasswordLink}
                                        >
                                            ¿Olvidaste tu contraseña?
                                        </button>
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
                                        Entrando...
                                    </>
                                ) : (
                                    <>Entrar <ArrowRight size={18} /></>
                                )}
                            </button>

                            <div className={styles.divider}>
                                o continúa con
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
                                                redirectTo: `${window.location.origin}/dashboard`
                                            }
                                        });
                                        if (error) throw error;
                                        // éxito → la página redirige a Google; no reseteamos loading.
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
                            ¿No tienes cuenta?{' '}
                            <Link to="/register" className={styles.link}>
                                Registrarse
                            </Link>
                        </div>

                        {/* [P1-GUEST-MODE · 2026-06-15] Probar el plan gratuito sin
                            crear cuenta: activa modo invitado y entra al formulario.
                            [P1-GUEST-SIGNOUT · 2026-06-15] Si hay una sesión real
                            activa, cerrarla PRIMERO — sin esto, isGuest = !session &&
                            flag = false mientras la sesión viva, y la app seguiría
                            mostrando la cuenta real en vez de "Invitado". */}
                        <button
                            type="button"
                            disabled={guestLoading}
                            onClick={async () => {
                                if (guestLoading) return;
                                setGuestLoading(true);
                                try {
                                    if (session) {
                                        try { await authClient.auth.signOut(); } catch { /* best-effort */ }
                                    }
                                    // [P1-GUEST-FIRSTPARTY-CLEAR · 2026-06-16] Limpiar
                                    // SIEMPRE el token + cookie first-party de una cuenta
                                    // anterior en este dispositivo. El signOut de Neon NO
                                    // los toca (solo el logout real vía resetApp lo hacía)
                                    // → sin esto, un refresh en modo invitado resucitaba
                                    // la sesión vieja (_resolveViaFirstParty) y la app
                                    // "agarraba" la cuenta previa en vez de quedarse como
                                    // invitado.
                                    try { await logoutFirstPartySession(); } catch { /* best-effort */ }
                                    activateGuestMode();
                                    navigate('/assessment');
                                } finally {
                                    setGuestLoading(false);
                                }
                            }}
                            className={styles.guestTryBtn}
                        >
                            {guestLoading ? 'Entrando…' : 'Probar sin cuenta'}
                        </button>
                        <p className={styles.guestTrySub}>
                            Genera un plan de muestra gratis. Crea tu cuenta cuando quieras guardarlo.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default Login;
