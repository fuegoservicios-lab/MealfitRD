import { useState, useEffect, useRef } from 'react';
import { authClient } from '../authClient';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, ArrowRight, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import { checkLeakedPassword } from '../utils/checkLeakedPassword';
import styles from './Auth.module.css';

const ResetPassword = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const redirectTimerRef = useRef(null);

    useEffect(() => {
        // Verificar si estamos en una sesión de recuperación (el backend anterior la establece por URL)
        const checkSession = async () => {
            const { data: { session } } = await authClient.auth.getSession();
            if (!session) {
                // Si alguien entra a esta URL sin un token válido en la URL (o si ya expiró),
                // no tendrán sesión. Sin embargo, el backend anterior maneja el parseo de la URL automáticamente.
                // Si falla al actualizar, se le notificará.
            }
        };
        checkSession();
    }, []);

    // [P4-RESET-TIMER] Limpia el timer de redirect si el usuario desmonta antes de los 2s
    // (evita navigation-hijack: navigate('/') disparándose tras abandonar la página).
    useEffect(() => () => {
        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    }, []);

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        // [P3-PASSWORD-MIN-LENGTH · 2026-05-12] Subido de 6 → 8 caracteres
        // alineado con Register.jsx + recomendación OWASP. HIBP check abajo
        // cubre passwords filtradas; este cubre brute-force de cortas.
        if (password.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres.');
            return;
        }

        setLoading(true);

        // [P2-3] HIBP leaked password check (k-anonymity, blocks if mode=block)
        const leak = await checkLeakedPassword(password);
        if (leak.leaked && leak.mode === 'block') {
            setError(
                `Esta contraseña aparece en ${leak.count.toLocaleString()} filtraciones públicas conocidas. Por favor elige una más segura.`
            );
            setLoading(false);
            return;
        }

        try {
            const { error } = await authClient.auth.updateUser({
                password: password
            });

            if (error) throw error;
            
            setSuccessMessage('Contraseña actualizada exitosamente. Redirigiendo...');
            redirectTimerRef.current = setTimeout(() => {
                navigate('/');
            }, 2000);
        } catch (err) {
            setError(err.message === 'User not found'
                ? 'No encontramos un usuario con este correo.'
                : err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.authContainer}>
            <div className={styles.authCard}>
                <div className={styles.logoWrapper}>
                    <div className={styles.logo}>
                        Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 className={styles.title}>
                        Crear nueva contraseña
                    </h1>
                    <p className={styles.subtitle}>Escribe tu nueva contraseña a continuación para recuperar el acceso a tu cuenta.</p>
                </div>

                {/* [P2-AUDIT-6 · 2026-05-15] role + aria-live para screen readers. */}
                {error && (
                    <div className={styles.errorBox} role="alert" aria-live="assertive">
                        <AlertCircle size={16} aria-hidden="true" />
                        {error}
                    </div>
                )}

                {successMessage && (
                    <div className={styles.successBox} role="status" aria-live="polite">
                        <CheckCircle2 size={16} aria-hidden="true" />
                        {successMessage}
                    </div>
                )}

                <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div className={styles.formGroup}>
                        <label className={styles.label} htmlFor="reset-password-new">Nueva Contraseña <span className={styles.requiredAsterisk}>*</span></label>
                        <div className={styles.inputWrapper}>
                            <div className={styles.inputIcon} aria-hidden="true">
                                <Lock size={18} />
                            </div>
                            <input
                                id="reset-password-new"
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
                                tabIndex="-1"
                                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                            >
                                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                            </button>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label} htmlFor="reset-password-confirm">Confirmar Contraseña <span className={styles.requiredAsterisk}>*</span></label>
                        <div className={styles.inputWrapper}>
                            <div className={styles.inputIcon} aria-hidden="true">
                                <Lock size={18} />
                            </div>
                            <input
                                id="reset-password-confirm"
                                type={showPassword ? "text" : "password"}
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                className={styles.input}
                                autoComplete="new-password"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || successMessage !== null}
                        className={styles.submitBtn}
                        style={{ marginTop: '1rem' }}
                    >
                        {loading ? (
                            <>
                                <Loader2 className={styles.loader} size={18} />
                                Actualizando...
                            </>
                        ) : (
                            <>Actualizar <ArrowRight size={18} /></>
                        )}
                    </button>
                </form>

                <div className={styles.footerText}>
                    ¿Recordaste tu contraseña?{' '}
                    <Link to="/login" className={styles.link}>
                        Inicia sesión aquí
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
