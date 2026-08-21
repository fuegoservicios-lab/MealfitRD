import { useState, useEffect, useRef } from 'react';
import { authClient } from '../authClient';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, ArrowRight, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import { checkLeakedPassword } from '../utils/checkLeakedPassword';
import { humanizeAuthError } from '../utils/authErrors';
import styles from './Auth.module.css';
import Wordmark from '../components/common/Wordmark';
import { useI18n } from '../i18n';

// [P1-RESET-PASSWORD-FIX · 2026-06-18] El flujo "crear nueva contraseña" estaba ROTO:
// llamaba authClient.auth.updateUser({password}), y el adapter de Neon Auth lo RECHAZA
// (FeatureNotSupported: "use the changePassword method instead") → el usuario SIEMPRE
// veía un error crudo y nunca podía completar el reset. Además nunca leía el token del
// link del email. Ahora: (1) se lee el `token` del query del URL al montar (Better Auth
// lo añade al redirectTo del email); sin token → estado "enlace inválido/expirado"
// ANTES de teclear; (2) se usa el método soportado por Better Auth:
// getBetterAuthInstance().resetPassword({newPassword, token}).
const ResetPassword = () => {
    // [P1-I18N-AUTH-COPY · 2026-08-21] `useI18n()` y no `useT()`: `humanizeAuthError`
    // necesita tambien el `locale` para decidir si un mensaje espanol del servidor
    // es copy util (en es-DO) o ruido que el usuario no entiende (en otro idioma).
    const { t, locale } = useI18n();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [token, setToken] = useState(null);
    const [linkInvalid, setLinkInvalid] = useState(false);
    const redirectTimerRef = useRef(null);

    // Leer el token del link de reset (Better Auth: redirectTo?token=...; algunos
    // emisores lo ponen en el hash). Sin token o con ?error= → enlace inválido.
    useEffect(() => {
        try {
            const search = new URLSearchParams(window.location.search);
            const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
            const t = search.get('token') || hash.get('token');
            const errParam = search.get('error') || hash.get('error');
            if (errParam || !t) {
                setLinkInvalid(true);
            } else {
                setToken(t);
            }
        } catch {
            setLinkInvalid(true);
        }
    }, []);

    // [P4-RESET-TIMER] Limpia el timer de redirect si el usuario desmonta antes de los 2s
    // (evita navigation-hijack: navigate() disparándose tras abandonar la página).
    useEffect(() => () => {
        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    }, []);

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!token) {
            setError(t('El enlace de restablecimiento es inválido o expiró. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".'));
            return;
        }
        if (password !== confirmPassword) {
            setError(t('Las contraseñas no coinciden.'));
            return;
        }

        // [P3-PASSWORD-MIN-LENGTH · 2026-05-12] 8 caracteres (OWASP). HIBP abajo cubre
        // passwords filtradas; este cubre brute-force de cortas.
        if (password.length < 8) {
            setError(t('La contraseña debe tener al menos 8 caracteres.'));
            return;
        }

        setLoading(true);

        // [P2-3] HIBP leaked password check (k-anonymity, blocks if mode=block)
        const leak = await checkLeakedPassword(password);
        if (leak.leaked && leak.mode === 'block') {
            setError(
                t('Esta contraseña aparece en {cantidad} filtraciones públicas conocidas. Por favor elige una más segura.', { cantidad: leak.count.toLocaleString() })
            );
            setLoading(false);
            return;
        }

        try {
            // [P1-RESET-PASSWORD-FIX] Método soportado por Better Auth (vía
            // getBetterAuthInstance). El adapter SupabaseAuthAdapter.updateUser rechaza
            // password; getBetterAuthInstance() expone el cliente Better Auth real.
            // [P2-NEON-LAZY] getBetterAuthInstance es ahora async (facade lazy); devuelve
            // null si el SDK no lo expone (el guard de abajo lo cubre).
            const ba = await authClient.auth.getBetterAuthInstance();
            if (!ba || typeof ba.resetPassword !== 'function') {
                throw new Error(t('No pudimos procesar el restablecimiento. Solicita un nuevo enlace desde el inicio de sesión.'));
            }
            const res = await ba.resetPassword({ newPassword: password, token });
            if (res?.error) {
                const m = (res.error.message || res.error.statusText || '').toLowerCase();
                if (m.includes('invalid') || m.includes('expired') || m.includes('token')) {
                    throw new Error(t('El enlace de restablecimiento es inválido o expiró. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".'));
                }
                throw new Error(res.error.message || t('No pudimos actualizar la contraseña.'));
            }

            setSuccessMessage(t('Contraseña actualizada exitosamente. Redirigiendo al inicio de sesión...'));
            redirectTimerRef.current = setTimeout(() => {
                navigate('/login');
            }, 2000);
        } catch (err) {
            setError(humanizeAuthError(err, t, locale));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.authContainer}>
            <div className={styles.authCard}>
                <div className={styles.logoWrapper}>
                    <div className={styles.logo}>
                        <Wordmark />
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 className={styles.title}>
                        {linkInvalid ? t('Enlace inválido o expirado') : t('Crear nueva contraseña')}
                    </h1>
                    <p className={styles.subtitle}>
                        {linkInvalid
                            ? t('Este enlace de restablecimiento no es válido o ya expiró. Solicita uno nuevo desde el inicio de sesión.')
                            : t('Escribe tu nueva contraseña a continuación para recuperar el acceso a tu cuenta.')}
                    </p>
                </div>

                {/* [P2-AUDIT-6 · 2026-05-15] role + aria-live para screen readers. */}
                {error && (
                    // [P2-13 · 2026-07-09] id para ligar los campos vía aria-describedby.
                    <div id="reset-error" className={styles.errorBox} role="alert" aria-live="assertive">
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

                {linkInvalid ? (
                    <Link to="/login" className={styles.submitBtn} style={{ marginTop: '0.5rem', textDecoration: 'none', justifyContent: 'center' }}>
                        {t('Volver al inicio de sesión')} <ArrowRight size={18} />
                    </Link>
                ) : (
                    <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="reset-password-new">{t('Nueva Contraseña')} <span className={styles.requiredAsterisk}>*</span></label>
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
                                    aria-invalid={!!error}
                                    aria-describedby={error ? 'reset-error' : undefined}
                                />
                                <button
                                    type="button"
                                    className={styles.passwordToggle}
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? t('Ocultar contraseña') : t('Mostrar contraseña')}
                                >
                                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                                </button>
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="reset-password-confirm">{t('Confirmar Contraseña')} <span className={styles.requiredAsterisk}>*</span></label>
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
                                    aria-invalid={!!error}
                                    aria-describedby={error ? 'reset-error' : undefined}
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
                                    {t('Actualizando...')}
                                </>
                            ) : (
                                <>{t('Actualizar')} <ArrowRight size={18} /></>
                            )}
                        </button>
                    </form>
                )}

                <div className={styles.footerText}>
                    {t('¿Recordaste tu contraseña?')}{' '}
                    <Link to="/login" className={styles.link}>
                        {t('Inicia sesión aquí')}
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
