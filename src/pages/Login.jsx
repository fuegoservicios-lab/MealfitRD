import { useState, useEffect, useRef } from 'react';
import { authClient, sendEmailOtp, signInWithEmailOtp } from '../authClient';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAssessment } from '../context/AssessmentContext';
import { logoutFirstPartySession } from '../utils/firstPartySession';
import { humanizeAuthError } from '../utils/authErrors';
import PlanShowcase from '../components/auth/PlanShowcase';
import './Login.css';

// [P1-EMAIL-OTP · 2026-06-21] Login SIN contraseña: un solo flujo correo → código.
// [P3-LOGIN-EDITORIAL · 2026-06-29] Rediseño editorial oscuro de dos paneles (form +
// preview de plan animado). La LÓGICA de auth (OTP email, Google con su SVG real, modo
// invitado, redirect de sesión) se conserva intacta del diseño original — solo cambia la
// presentación. El SVG de Google y el flujo de login son los originales a propósito.
const RESEND_COOLDOWN_S = 30;

/* ---- SVG de Google ORIGINAL (los 4 colores) — a propósito, es mejor que el placeholder ---- */
function GoogleIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    );
}

/* ---- Ilustración hero (solo móvil) — bol con brote + constelación de macros en la
   paleta MealfitRD. Estilo line-art tipo el login de Claude, pero temática nutrición. ---- */
function HeroIllustration() {
    return (
        <svg viewBox="0 0 260 196" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {/* constelación: líneas finas que conectan los nodos */}
            <g stroke="var(--mf-text-faint)" strokeWidth="1.4" strokeLinecap="round" opacity="0.55">
                <path d="M132 150 L70 72" />
                <path d="M132 150 L198 64" />
                <path d="M70 72 L198 64" />
                <path d="M198 64 L218 122" />
                <path d="M70 72 L46 124" />
            </g>
            {/* bol (línea continua) */}
            <g stroke="var(--mf-text)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.92">
                <path d="M84 150 Q132 196 180 150" />
                <path d="M76 149 H188" />
            </g>
            {/* brote: tallo + hoja */}
            <path d="M132 148 C132 122 132 106 132 88" stroke="var(--mf-secondary)" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M132 108 C116 104 108 90 113 76 C129 80 138 98 132 108 Z" fill="var(--mf-secondary)" opacity="0.9" />
            {/* nodos de macros */}
            <circle cx="70" cy="72" r="10" fill="var(--mf-primary)" />
            <circle cx="198" cy="64" r="12.5" fill="var(--mf-accent)" />
            <circle cx="218" cy="122" r="8" fill="var(--mf-fat)" />
            <circle cx="46" cy="124" r="7" fill="var(--mf-secondary)" />
            <circle cx="132" cy="150" r="5" fill="var(--mf-text)" />
        </svg>
    );
}

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { activateGuestMode, session } = useAssessment();
    const [guestLoading, setGuestLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    const [step, setStep] = useState('email'); // 'email' | 'code'
    const [email, setEmail] = useState(location.state?.email || '');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [cooldown, setCooldown] = useState(0);
    const codeInputRef = useRef(null);

    useEffect(() => {
        if (location.state) navigate(location.pathname, { replace: true, state: null });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (cooldown <= 0) return undefined;
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

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
        // [P0-LOGIN-SESSION-PROPAGATE · 2026-06-18] Recarga COMPLETA para que el provider
        // remonte y lea la cookie fresca de Neon Auth + mintee la first-party.
        window.location.assign('/');
    };

    const handleGoogle = async () => {
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
    };

    const handleGuest = async () => {
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
    };

    const handleResend = async () => {
        if (cooldown > 0 || loading) return;
        setError(null);
        setLoading(true);
        const ok = await requestCode(email.trim());
        setLoading(false);
        if (ok) {
            setCooldown(RESEND_COOLDOWN_S);
            toast.success('Te reenviamos el código.');
        }
    };

    const backToEmail = () => {
        setStep('email');
        setCode('');
        setError(null);
    };

    // [LOGIN-REDIRECT-IF-AUTHED · 2026-06-21] Sesión viva → entra directo a la app.
    if (session) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="mf-login" data-side="left" data-anim="on">
            <div className="mf-glow mf-glow--a" aria-hidden="true" />
            <div className="mf-glow mf-glow--b" aria-hidden="true" />

            {/* Preview del plan (decorativo, oculto en móvil) */}
            <aside className="mf-showcase" aria-hidden="true">
                <PlanShowcase />
            </aside>

            {/* Formulario (auth real) */}
            <section className="mf-form">
                <div className="mf-brandmark">Mealfit<span className="mf-r">R</span><span className="mf-d">D</span></div>

                <div className="mf-form__inner">
                    <div className="mf-hero-illu" aria-hidden="true"><HeroIllustration /></div>
                    <h1 className="mf-headline">
                        <span>Tu mejor versión,</span>
                        <span>un plato a la vez.</span>
                    </h1>
                    <p className="mf-sub">
                        Planes de comida personalizados a tu objetivo, calculados a tu perfil y listos en minutos.
                    </p>

                    {error && (
                        <div className="mf-error" role="alert" aria-live="assertive">
                            <AlertCircle size={16} aria-hidden="true" />
                            {error}
                        </div>
                    )}

                    {step === 'email' ? (
                        <>
                            <form className="mf-card" onSubmit={handleEmailSubmit}>
                                <button type="button" className="mf-btn mf-btn--google" onClick={handleGoogle} disabled={googleLoading}>
                                    <GoogleIcon /> {googleLoading ? 'Conectando con Google…' : 'Continuar con Google'}
                                </button>

                                <div className="mf-divider"><span>o</span></div>

                                <input
                                    id="login-email"
                                    className="mf-input"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Ingresa tu correo electrónico"
                                    aria-label="Correo electrónico"
                                    autoComplete="email"
                                    autoFocus
                                />

                                <button type="submit" className="mf-btn mf-btn--primary" disabled={loading}>
                                    {loading ? (
                                        <><Loader2 className="mf-loader" size={18} /> Enviando código…</>
                                    ) : (
                                        <>Continuar con correo <ArrowRight size={18} /></>
                                    )}
                                </button>

                                <p className="mf-privacy">
                                    Al continuar, reconoces nuestra{' '}
                                    <Link to="/privacy" state={{ from: '/login' }}>Política de Privacidad</Link>.
                                </p>
                            </form>

                            <button type="button" className="mf-btn mf-btn--ghost" onClick={handleGuest} disabled={guestLoading}>
                                {guestLoading ? 'Entrando…' : 'Probar sin cuenta'}
                            </button>
                            <p className="mf-guest-sub">
                                Genera un plan de muestra gratis. Crea tu cuenta cuando quieras guardarlo.
                            </p>
                        </>
                    ) : (
                        <form className="mf-card" onSubmit={handleCodeSubmit}>
                            <p className="mf-code-hint">
                                Te enviamos un código a <strong>{email.trim()}</strong>.
                            </p>

                            <input
                                id="login-code"
                                ref={codeInputRef}
                                className="mf-input mf-input--code"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
                                placeholder="123456"
                                aria-label="Código de verificación"
                                maxLength={8}
                            />

                            <button type="submit" className="mf-btn mf-btn--primary" disabled={loading}>
                                {loading ? (
                                    <><Loader2 className="mf-loader" size={18} /> Verificando…</>
                                ) : (
                                    <>Entrar <ArrowRight size={18} /></>
                                )}
                            </button>

                            <div className="mf-code-actions">
                                <button type="button" onClick={backToEmail}>
                                    <ArrowLeft size={14} aria-hidden="true" /> Usar otro correo
                                </button>
                                <button
                                    type="button"
                                    onClick={handleResend}
                                    disabled={cooldown > 0 || loading}
                                    style={{ opacity: cooldown > 0 ? 0.55 : 1 }}
                                >
                                    {cooldown > 0 ? `Reenviar código (${cooldown}s)` : 'Reenviar código'}
                                </button>
                            </div>

                            <p className="mf-privacy">
                                ¿Primera vez? Con el código creamos tu cuenta automáticamente. Revisa también el spam.
                            </p>
                        </form>
                    )}
                </div>
            </section>
        </div>
    );
};

export default Login;
