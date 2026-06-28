
import { useState, useEffect, useRef } from 'react';
import { authClient, sendEmailOtp, signInWithEmailOtp } from '../authClient';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import styles from './Auth.module.css';
import { useAssessment } from '../context/AssessmentContext';
import { logoutFirstPartySession } from '../utils/firstPartySession';
import { humanizeAuthError } from '../utils/authErrors';
// [P1-AUTH-BG-3D · 2026-06-21] Fondo 3D molecular animado (canvas, sin deps).
import AuthBackground from '../components/auth/AuthBackground';

// [P1-EMAIL-OTP · 2026-06-21] Login SIN contraseña: un solo flujo correo → código
// (como OpenAI/Anthropic). El primer código de un correo nuevo crea la cuenta
// automáticamente (ver authClient.signInWithEmailOtp), por eso ya NO hay página
// de registro separada (/register redirige aquí). Se conservan Google y el modo
// invitado como entradas alternativas. Cero contraseñas → cero "olvidé mi
// contraseña", cero check de contraseñas filtradas.
const RESEND_COOLDOWN_S = 30;

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    // [P1-GUEST-MODE · 2026-06-15] Entrada al funnel del plan gratuito sin cuenta.
    const { activateGuestMode, session } = useAssessment();
    const [guestLoading, setGuestLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    // Máquina de dos pasos: pedir correo → escribir código.
    const [step, setStep] = useState('email'); // 'email' | 'code'
    // location.state.email lo manda cualquier CTA "crear cuenta" que ahora cae
    // aquí (Upgrade/Pricing/Dashboard/NotificationCenter) → pre-rellena el correo.
    const [email, setEmail] = useState(location.state?.email || '');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [cooldown, setCooldown] = useState(0);
    const codeInputRef = useRef(null);

    // Limpiar el location.state tras consumirlo (un refresh no debe re-aplicarlo).
    useEffect(() => {
        if (location.state) navigate(location.pathname, { replace: true, state: null });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Tick del cooldown de "Reenviar código".
    useEffect(() => {
        if (cooldown <= 0) return undefined;
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    // Foco automático al input de código al pasar al paso 2.
    useEffect(() => {
        if (step === 'code' && codeInputRef.current) codeInputRef.current.focus();
    }, [step]);

    const requestCode = async (targetEmail) => {
        const { error: sendError } = await sendEmailOtp(targetEmail);
        if (sendError) {
            setError(humanizeAuthError(sendError));
            return false;
        }
        return true;
    };

    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        const clean = email.trim();
        if (!clean) {
            setError('Ingresa tu correo electrónico.');
            return;
        }
        setLoading(true);
        const ok = await requestCode(clean);
        setLoading(false);
        if (ok) {
            setStep('code');
            setCooldown(RESEND_COOLDOWN_S);
        }
    };

    const handleCodeSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        const clean = code.trim();
        if (clean.length < 4) {
            setError('Ingresa el código que te enviamos por correo.');
            return;
        }
        setLoading(true);
        const { error: otpError } = await signInWithEmailOtp(email.trim(), clean);
        if (otpError) {
            setError(humanizeAuthError(otpError));
            setLoading(false);
            return;
        }
        // [P0-LOGIN-SESSION-PROPAGATE · 2026-06-18] Mismo patrón que el login por
        // contraseña: recarga COMPLETA (no navigate SPA). El adapter de Neon Auth
        // no emite el evento de sesión same-tab; el full reload remonta el provider
        // → getSession lee la cookie fresca que dejó /sign-in/email-otp → la sesión
        // se propaga (+ se mintea la first-party). El landing-skip enruta a
        // /dashboard o /assessment según el estado del plan.
        window.location.assign('/');
    };

    const handleResend = async () => {
        if (cooldown > 0 || loading) return;
        setError(null);
        setLoading(true);
        const ok = await requestCode(email.trim());
        setLoading(false);
        if (ok) {
            setCooldown(RESEND_COOLDOWN_S);
            // Feedback breve sin repetir el correo (ya está en el subtítulo).
            toast.success('Te reenviamos el código.');
        }
    };

    const backToEmail = () => {
        setStep('email');
        setCode('');
        setError(null);
    };

    // [LOGIN-REDIRECT-IF-AUTHED · 2026-06-21] Si ya hay sesión viva (la cookie de
    // Neon 7d o la sesión first-party 30d siguen vigentes) y el usuario cae en
    // /login (revisita, bookmark), entra DIRECTO a la app — no le mostramos el
    // formulario ni le pedimos código de nuevo. El destino real (dashboard o
    // formulario) lo decide ProtectedRoute en '/'. Los invitados (session null +
    // isGuest) no se afectan.
    if (session) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className={styles.authContainer}>
            <AuthBackground />

            <div className={styles.authCard}>
                <div className={styles.logoWrapper}>
                    <div className={styles.logo}>
                        Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 className={styles.title}>
                        {/* [P1-EMAIL-OTP] Flujo unificado (login + registro): el título debe
                            servir a usuarios nuevos Y existentes — "de nuevo" no aplica al primerizo. */}
                        {step === 'email' ? 'Bienvenido' : 'Revisa tu correo'}
                    </h1>
                    <p className={styles.subtitle}>
                        {step === 'email'
                            ? 'Tu transformación continúa aquí.'
                            : <>Escribe el código que enviamos a <strong>{email.trim()}</strong>.</>}
                    </p>
                </div>

                {/* [P2-AUDIT-6 · 2026-05-15] role="alert" + aria-live para que los
                    lectores de pantalla anuncien errores/estados al instante. */}
                {error && (
                    <div className={styles.errorBox} role="alert" aria-live="assertive">
                        <AlertCircle size={16} aria-hidden="true" />
                        {error}
                    </div>
                )}

                {step === 'email' ? (
                    <>
                        <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div className={styles.formGroup}>
                                <input
                                    id="login-email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Ingresa tu correo electrónico"
                                    aria-label="Correo electrónico"
                                    className={`${styles.input} ${styles.inputBare}`}
                                    autoComplete="email"
                                    autoFocus
                                />
                            </div>

                            <button type="submit" disabled={loading} className={styles.submitBtn}>
                                {loading ? (
                                    <><Loader2 className={styles.loader} size={18} /> Enviando código…</>
                                ) : (
                                    <>Continuar <ArrowRight size={18} /></>
                                )}
                            </button>

                            <div className={styles.divider}>o</div>

                            <button
                                type="button"
                                disabled={googleLoading}
                                onClick={async () => {
                                    if (googleLoading) return;
                                    setGoogleLoading(true);
                                    setError(null);
                                    try {
                                        const { error: oauthError } = await authClient.auth.signInWithOAuth({
                                            provider: 'google',
                                            options: { redirectTo: `${window.location.origin}/dashboard` },
                                        });
                                        if (oauthError) throw oauthError;
                                        // éxito → la página redirige a Google; no reseteamos loading.
                                    } catch (err) {
                                        setError(humanizeAuthError(err));
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
                                {googleLoading ? 'Conectando con Google…' : 'Continuar con Google'}
                            </button>
                        </form>

                        {/* [P1-GUEST-MODE · 2026-06-15] Probar el plan gratuito sin
                            crear cuenta. [P1-GUEST-SIGNOUT] Si hay sesión real activa,
                            cerrarla primero; [P1-GUEST-FIRSTPARTY-CLEAR] limpiar el
                            token first-party del dispositivo para no resucitar la
                            cuenta anterior al refrescar en modo invitado. */}
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
                                    try { await logoutFirstPartySession(); } catch { /* best-effort */ }
                                    activateGuestMode();
                                    navigate('/assessment');
                                } finally {
                                    setGuestLoading(false);
                                }
                            }}
                            className={styles.guestTryBtn}
                            style={{ marginTop: '1.5rem' }}
                        >
                            {guestLoading ? 'Entrando…' : 'Probar sin cuenta'}
                        </button>
                        <p className={styles.guestTrySub}>
                            Genera un plan de muestra gratis. Crea tu cuenta cuando quieras guardarlo.
                        </p>
                    </>
                ) : (
                    <form onSubmit={handleCodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className={styles.formGroup}>
                            <input
                                id="login-code"
                                ref={codeInputRef}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
                                placeholder="123456"
                                aria-label="Código de verificación"
                                className={`${styles.input} ${styles.inputBare} ${styles.inputCode}`}
                                maxLength={8}
                            />
                        </div>

                        <button type="submit" disabled={loading} className={styles.submitBtn}>
                            {loading ? (
                                <><Loader2 className={styles.loader} size={18} /> Verificando…</>
                            ) : (
                                <>Entrar <ArrowRight size={18} /></>
                            )}
                        </button>

                        <div className={styles.checkboxContainer} style={{ justifyContent: 'space-between', marginTop: '0.25rem' }}>
                            <button type="button" onClick={backToEmail} className={styles.forgotPasswordLink} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <ArrowLeft size={14} aria-hidden="true" /> Usar otro correo
                            </button>
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={cooldown > 0 || loading}
                                className={styles.forgotPasswordLink}
                                style={{ opacity: cooldown > 0 ? 0.55 : 1 }}
                            >
                                {cooldown > 0 ? `Reenviar código (${cooldown}s)` : 'Reenviar código'}
                            </button>
                        </div>

                        <p className={styles.guestTrySub} style={{ marginTop: '1rem' }}>
                            ¿Es tu primera vez? Con el código creamos tu cuenta automáticamente. Revisa también tu carpeta de spam.
                        </p>
                    </form>
                )}

                {/* [P1-LEGAL-ACK · 2026-06-21] Reconocimiento de privacidad al pie.
                    El Link pasa state.from='/login' → "Volver" en la página legal
                    regresa al LOGIN (no al landing, que está gateado para usuarios sin
                    sesión ni modo invitado). */}
                <p className={styles.legalNote}>
                    Al continuar, reconoces nuestra{' '}
                    <Link to="/privacy" state={{ from: '/login' }} className={styles.legalLink}>Política de Privacidad</Link>.
                </p>
            </div>
        </div>
    );
};

export default Login;
