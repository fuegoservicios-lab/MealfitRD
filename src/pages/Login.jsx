
import { useState } from 'react';
import { supabase } from '../supabase';
import { useNavigate, Link } from 'react-router-dom';
import { User, Lock, ArrowRight, AlertCircle, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import styles from './Auth.module.css';

const Login = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
    const [error, setError] = useState(null);
    const [resetLoading, setResetLoading] = useState(false);
    const [resetMessage, setResetMessage] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Intentar establecer persistencia (puede fallar en algunas versiones/entornos)
            try {
                /* await supabase.auth.setPersistence(rememberMe ? 'local' : 'session'); */
            } catch (pError) {
                console.warn("No se pudo establecer persistencia:", pError);
            }

            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            navigate('/');
        } catch (err) {
            if (err.message === 'Invalid login credentials') {
                // Verificar si el correo realmente existe en la base de datos
                try {
                    const { data } = await supabase
                        .from('user_profiles')
                        .select('id')
                        .eq('email', email.trim())
                        .single();
                        
                    if (!data) {
                        // El usuario no existe, redirigir a registro
                        navigate('/register', { state: { email: email.trim() } });
                        return;
                    } else {
                        // El usuario existe, la contraseña es incorrecta
                        setError('Correo o contraseña incorrectos.');
                    }
                } catch (profileErr) {
                    // Si falla la consulta (ej. RLS o no existe), asumimos que no existe
                    navigate('/register', { state: { email: email.trim() } });
                    return;
                }
            } else {
                setError(err.message);
            }
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
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/reset-password`,
            });
            if (error) throw error;
            setResetMessage('Te hemos enviado un enlace para restablecer tu contraseña. Revisa tu correo.');
        } catch (err) {
            let errorMessage = err.message;
            if (errorMessage === 'User not found') {
                navigate('/register', { state: { email: email.trim() } });
                return; // Stop execution to let navigation happen smoothly
            } else if (errorMessage.toLowerCase().includes('invalid')) {
                errorMessage = 'El correo electrónico no es válido o está asociado a una cuenta de Google. Si usaste Google, por favor inicia sesión con el botón de abajo.';
            } else if (errorMessage.toLowerCase().includes('rate limit') || errorMessage.toLowerCase().includes('too many')) {
                errorMessage = 'Has solicitado esto demasiadas veces. Por favor, espera un momento.';
            }
            setError(errorMessage);
        } finally {
            setResetLoading(false);
        }
    };

    return (
        <div className={styles.authContainer}>
            {/* Background handled by CSS ::before */}

            <div className={styles.authCard}>
                <div className={styles.logoWrapper}>
                    <Link to="/" className={styles.logo}>
                        Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </Link>
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

                {error && (
                    <div className={styles.errorBox}>
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                {resetMessage && (
                    <div className={styles.successBox}>
                        <CheckCircle2 size={16} />
                        {resetMessage}
                    </div>
                )}

                {isForgotPasswordMode ? (
                    <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Correo Electrónico <span className={styles.requiredAsterisk}>*</span></label>
                            <div className={styles.inputWrapper}>
                                <div className={styles.inputIcon}>
                                    <User size={18} />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="ejemplo@correo.com"
                                    className={styles.input}
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
                                <label className={styles.label}>Correo Electrónico <span className={styles.requiredAsterisk}>*</span></label>
                                <div className={styles.inputWrapper}>
                                    <div className={styles.inputIcon}>
                                        <User size={18} />
                                    </div>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="ejemplo@correo.com"
                                        className={styles.input}
                                    />
                                </div>
                            </div>

                            {email.length > 0 && (
                                <div className={styles.animateFadeIn}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Contraseña <span className={styles.requiredAsterisk}>*</span></label>
                                        <div className={styles.inputWrapper}>
                                            <div className={styles.inputIcon}>
                                                <Lock size={18} />
                                            </div>
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                required
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className={styles.input}
                                            />
                                            <button
                                                type="button"
                                                className={styles.passwordToggle}
                                                onClick={() => setShowPassword(!showPassword)}
                                                tabIndex="-1"
                                                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                            >
                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className={styles.checkboxContainer}>
                                        <div className={styles.checkboxWrapper}>
                                            <label className={styles.checkboxLabel}>
                                                <input
                                                    type="checkbox"
                                                    checked={rememberMe}
                                                    onChange={(e) => setRememberMe(e.target.checked)}
                                                    className={styles.checkboxInput}
                                                />
                                                <div className={styles.customCheckbox}></div>
                                                Recordarme
                                            </label>
                                        </div>
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
                                onClick={async () => {
                                    try {
                                        const { error } = await supabase.auth.signInWithOAuth({
                                            provider: 'google',
                                            options: {
                                                redirectTo: `${window.location.origin}/dashboard`
                                            }
                                        });
                                        if (error) throw error;
                                    } catch (error) {
                                        setError(error.message);
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
                                Google
                            </button>
                        </form>

                        <div className={styles.footerText}>
                            ¿No tienes cuenta?{' '}
                            <Link to="/register" className={styles.link}>
                                Registrarse
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default Login;
