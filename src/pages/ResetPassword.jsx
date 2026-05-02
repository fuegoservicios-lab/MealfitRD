import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, ArrowRight, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import styles from './Auth.module.css';

const ResetPassword = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        // Verificar si estamos en una sesión de recuperación (Supabase la establece por URL)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                // Si alguien entra a esta URL sin un token válido en la URL (o si ya expiró),
                // no tendrán sesión. Sin embargo, Supabase maneja el parseo de la URL automáticamente.
                // Si falla al actualizar, se le notificará.
            }
        };
        checkSession();
    }, []);

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;
            
            setSuccessMessage('Contraseña actualizada exitosamente. Redirigiendo...');
            setTimeout(() => {
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
                    <Link to="/" className={styles.logo}>
                        Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </Link>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 className={styles.title}>
                        Crear nueva contraseña
                    </h1>
                    <p className={styles.subtitle}>Escribe tu nueva contraseña a continuación para recuperar el acceso a tu cuenta.</p>
                </div>

                {error && (
                    <div className={styles.errorBox}>
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                {successMessage && (
                    <div className={styles.successBox}>
                        <CheckCircle2 size={16} />
                        {successMessage}
                    </div>
                )}

                <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Nueva Contraseña <span className={styles.requiredAsterisk}>*</span></label>
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
                                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                aria-pressed={showPassword}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Confirmar Contraseña <span className={styles.requiredAsterisk}>*</span></label>
                        <div className={styles.inputWrapper}>
                            <div className={styles.inputIcon}>
                                <Lock size={18} />
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                className={styles.input}
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
