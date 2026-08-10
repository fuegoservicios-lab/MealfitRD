import { useState, useEffect, useRef } from 'react';
import { isSiteHost } from '../config/site';
import { authClient, sendEmailOtp } from '../authClient';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAssessment } from '../context/AssessmentContext';
// [P1-OTP-FIRST-PARTY · 2026-07-03] la verificación del código emite sesión first-party
// vía nuestro backend (la cookie de Neon vía XHR era third-party → bloqueada en móvil).
import { logoutFirstPartySession, verifyEmailOtpFirstParty } from '../utils/firstPartySession';
import { humanizeAuthError } from '../utils/authErrors';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/safeLocalStorage';
import PlanShowcase from '../components/auth/PlanShowcase';
import './Login.css';
import Wordmark from '../components/common/Wordmark';

// [P1-EMAIL-OTP · 2026-06-21] Login SIN contraseña: un solo flujo correo → código.
// [P3-LOGIN-EDITORIAL · 2026-06-29] Rediseño editorial oscuro de dos paneles (form +
// preview de plan animado). La LÓGICA de auth (OTP email, Google con su SVG real, modo
// invitado, redirect de sesión) se conserva intacta del diseño original — solo cambia la
// presentación. El SVG de Google y el flujo de login son los originales a propósito.
const RESEND_COOLDOWN_S = 30;
// [P1-LOGIN-KEYBOARD · 2026-08-10] Longitud del código que emite Better Auth. Al
// alcanzarla se envía solo: el teclado numérico de iOS no trae tecla de envío y el
// botón queda debajo del teclado.
const OTP_LENGTH = 6;

// [P3-LOGIN-LEGAL-LANDING · 2026-06-30] Las políticas "oficiales" viven en el LANDING de
// marketing (apex mealfitrd.com), no en el app (app.mealfitrd.com). Desde el login
// enlazamos al apex para que se vean en su contexto de marketing (header/footer del
// landing), no con el chrome del app. En dev/preview (no *.mealfitrd.com) usamos la ruta
// in-app para que siga funcionando localmente.
const landingLegalUrl = (path) => {
    if (typeof window === 'undefined') return path;
    const { protocol, hostname } = window.location;
    if (isSiteHost(hostname)) {
        return `${protocol}//${hostname.replace(/^app\./i, '')}${path}`;
    }
    return path; // dev / preview → ruta in-app
};

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
   paleta Bioboros. Estilo line-art tipo el login de Claude, pero temática nutrición. ---- */
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

// [P1-LOGIN-OTP-RESUME · 2026-08-10] El paso del código sobrevive a que el usuario
// salga de la app.
//
// EL FALLO QUE CIERRA: todo el flujo vivía en `useState`. Pero este flujo EXIGE salir
// de la app a leer el correo, y el manifiesto declara `display: standalone` — modo en
// el que iOS termina el proceso al pasar a segundo plano y lo relanza limpio. El
// usuario volvía al paso 1 con el código ya gastado en la mano. Es, además,
// exactamente lo que hará un revisor de tienda.
//
// localStorage y NO sessionStorage: esta última muere con el webview, que es justo el
// evento del que hay que sobrevivir.
const OTP_PENDING_KEY = 'mf_otp_pending';
const OTP_PENDING_TTL_MS = 15 * 60 * 1000; // ventana generosa sobre la validez del código

const loadPendingOtp = () => {
    try {
        const raw = safeLocalStorageGet(OTP_PENDING_KEY, null);
        if (!raw) return null;
        const p = JSON.parse(raw);
        if (!p?.email || !p?.sentAt) return null;
        if (Date.now() - p.sentAt > OTP_PENDING_TTL_MS) {
            safeLocalStorageRemove(OTP_PENDING_KEY);
            return null;
        }
        return p;
    } catch { return null; }
};
const savePendingOtp = (email) => {
    safeLocalStorageSet(OTP_PENDING_KEY, JSON.stringify({ email, sentAt: Date.now() }));
};
const clearPendingOtp = () => {
    safeLocalStorageRemove(OTP_PENDING_KEY);
};

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { activateGuestMode, session } = useAssessment();
    const [guestLoading, setGuestLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    // Se lee UNA vez, en el arranque: si había un código en vuelo, se retoma ahí.
    const [pendiente] = useState(loadPendingOtp);

    const [step, setStep] = useState(pendiente ? 'code' : 'email'); // 'email' | 'code'
    const [email, setEmail] = useState(pendiente?.email || location.state?.email || '');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // El contador de reenvío se reconstruye desde el instante del envío, no desde cero:
    // si no, al volver el usuario podría pedir otro código de inmediato y saltarse el límite.
    const [cooldown, setCooldown] = useState(() => {
        if (!pendiente) return 0;
        const transcurrido = Math.floor((Date.now() - pendiente.sentAt) / 1000);
        return Math.max(0, RESEND_COOLDOWN_S - transcurrido);
    });
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

    const esPantallaAncha = () => typeof window !== 'undefined'
        && window.matchMedia?.('(min-width: 881px)')?.matches;

    // [P1-LOGIN-KEYBOARD · 2026-08-10] El foco del campo del código SE MANTIENE en móvil,
    // a diferencia del de correo. La auditoría proponía quitarlo porque el teclado tapa el
    // botón — pero el auto-envío al completar los 6 dígitos elimina la necesidad de ese
    // botón, así que la premisa ya no aplica. Y quitarlo tendría un coste: el
    // autocompletado del código de iOS solo ofrece el código sobre un campo ENFOCADO.
    useEffect(() => {
        if (step === 'code' && codeInputRef.current) codeInputRef.current.focus();
    }, [step]);

    // [P1-ANDROID-BACK · 2026-08-10] El gesto atrás desde el paso del código vuelve al
    // correo en vez de salir de la pantalla (o cerrar la app). `backToEmail` NO se llama
    // aquí porque él mismo retrocede el historial: haría un doble salto.
    const pasoRef = useRef(step);
    // El ref se sincroniza en un efecto, no durante el render: escribirlo en el cuerpo
    // del componente rompe con el render concurrente (React puede renderizar y descartar).
    useEffect(() => { pasoRef.current = step; }, [step]);
    useEffect(() => {
        const alVolver = () => {
            if (pasoRef.current === 'code') {
                clearPendingOtp();
                setStep('email');
                setCode('');
                setError(null);
            }
        };
        window.addEventListener('popstate', alVolver);
        return () => window.removeEventListener('popstate', alVolver);
    }, []);

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
            savePendingOtp(clean);
            // [P1-ANDROID-BACK · 2026-08-10] El paso del código pasa a ser una entrada de
            // historial. Antes era `setStep` puro, así que el gesto atrás no volvía al
            // correo: salía de /login. Y si /login era la primera entrada —arranque en
            // frío de la app instalada, el caso NORMAL en tienda— cerraba la app, con el
            // código ya consumido y el usuario sin forma de corregir un correo mal
            // tecleado, porque el botón «Usar otro correo» tampoco es lo que su reflejo
            // le pide pulsar.
            try { window.history.pushState({ mfOtp: 1 }, ''); } catch { /* noop */ }
            setStep('code');
            setCooldown(RESEND_COOLDOWN_S);
        }
    };

    // [P1-LOGIN-KEYBOARD] El envío del código se extrae del manejador del formulario
    // para poder dispararlo también solo, al completar los 6 dígitos. En móvil el
    // teclado numérico de iOS NO trae tecla de envío, y el botón «Entrar» queda debajo
    // del teclado: sin auto-envío, terminar el login exigía cerrar el teclado a mano.
    const submittingRef = useRef(false);

    const enviarCodigo = async (valor) => {
        const clean = String(valor || '').trim();
        if (clean.length < 4) {
            setError('Ingresa el código que te enviamos por correo.');
            return;
        }
        if (submittingRef.current) return; // el auto-envío y el botón pueden coincidir
        submittingRef.current = true;
        setLoading(true);
        // [P1-OTP-FIRST-PARTY · 2026-07-03] La verificación va vía NUESTRO backend (proxy a
        // Neon server-side) que emite la sesión FIRST-PARTY directo. El fetch directo previo
        // a Neon seteaba una cookie third-party vía XHR que los navegadores móviles bloquean
        // → getSession() del reload no encontraba nada y rebotaba a /login ("pongo el código
        // y no entro"). Con la first-party same-origin, el reload resuelve la sesión vía
        // _resolveViaFirstParty SIN depender de la cookie de Neon — NO se arma el flag de
        // retry (mf_oauth_pending): esperaría ~8s reintentando un getSession de Neon que
        // aquí legítimamente no existe; el fallback first-party entra de inmediato.
        const { error: otpError } = await verifyEmailOtpFirstParty(email.trim(), clean);
        if (otpError) {
            setError(humanizeAuthError(otpError));
            setLoading(false);
            // Soltar el cerrojo: sin esto un código mal tecleado dejaría el botón muerto
            // para siempre y el usuario tendría que recargar para reintentar.
            submittingRef.current = false;
            return;
        }
        // Verificado: el código en vuelo ya no sirve para nada.
        clearPendingOtp();
        // [P0-LOGIN-SESSION-PROPAGATE · 2026-06-18] Recarga COMPLETA para que el provider
        // remonte y resuelva la sesión (Neon si su cookie llegó; first-party si no).
        window.location.assign('/');
    };

    const handleCodeSubmit = (e) => {
        e.preventDefault();
        setError(null);
        enviarCodigo(code);
    };

    // Auto-envío al alcanzar la longitud del código. `enviarCodigo` ya es reentrante-seguro.
    const handleCodeChange = (e) => {
        const v = e.target.value.replace(/\D/g, '');
        setCode(v);
        if (v.length === OTP_LENGTH) {
            setError(null);
            enviarCodigo(v);
        }
    };

    const handleGoogle = async () => {
        if (googleLoading) return;
        setGoogleLoading(true);
        setError(null);
        // [P1-OAUTH-RETURN-RETRY · 2026-07-01] Marca que iniciamos un OAuth. Al volver
        // de Google, el provider (AssessmentContext) reintenta resolver la sesión si el
        // primer getSession corre antes de que la cookie/sesión de Neon esté disponible
        // (carrera que obligaba a pulsar "Continuar con Google" una 2ª vez). sessionStorage
        // sobrevive el round-trip app→Google→app (mismo origen, misma pestaña).
        try { sessionStorage.setItem('mf_oauth_pending', '1'); } catch { /* noop */ }
        try {
            const { error: oauthError } = await authClient.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: `${window.location.origin}/dashboard` },
            });
            if (oauthError) throw oauthError;
            // éxito → la página redirige a Google; no reseteamos loading.
        } catch (err) {
            // No hubo redirect → limpiar el flag para no reintentar en un load normal.
            try { sessionStorage.removeItem('mf_oauth_pending'); } catch { /* noop */ }
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
            // Refrescar el sello: el contador al volver a la app debe medirse desde el
            // ÚLTIMO envío, no desde el primero.
            savePendingOtp(email.trim());
            setCooldown(RESEND_COOLDOWN_S);
            toast.success('Te reenviamos el código.');
        }
    };

    const backToEmail = () => {
        // El código en vuelo deja de valer: si no se borra, volver a abrir la app
        // devolvería al usuario al paso del código del que acaba de salir.
        clearPendingOtp();
        setStep('email');
        setCode('');
        setError(null);
        // [P1-ANDROID-BACK · 2026-08-10] Consumir también la entrada de historial que
        // empujó el paso del código. Sin esto quedaría huérfana y al usuario le haría
        // falta un gesto atrás de más para salir de /login. El oyente de `popstate` ya
        // está guardado por el paso actual, así que repetir el reseteo es inocuo.
        try { window.history.back(); } catch { /* noop */ }
    };

    // [LOGIN-REDIRECT-IF-AUTHED · 2026-06-21] Sesión viva → entra directo a la app.
    if (session) {
        return <Navigate to="/" replace />;
    }

    // [P2-13 · 2026-07-09] id para que el campo activo lo referencie vía aria-describedby
    // → el lector de pantalla anuncia QUÉ campo falló.
    // [P2-AUDIT-6 · re-anclado 2026-07-28] El contrato a11y del Login OTP: cada campo
    // lleva aria-label (sustituto válido del par htmlFor/id del flujo de contraseña
    // retirado el 2026-06-21), el error es role="alert" aria-live, y el éxito viaja por
    // toast (sonner gestiona su aria-live).
    // (El comentario evita la palabra campo-con-ángulo: el test la cuenta.)
    //
    // [P1-LOGIN-KEYBOARD · 2026-08-10] Se renderiza DENTRO de la tarjeta, justo encima
    // del botón de envío, en vez de arriba del todo. Con el teclado abierto en móvil, un
    // error que aparece fuera de la pantalla visible equivale a no dar respuesta: el
    // usuario pulsa, no ve nada, y vuelve a pulsar.
    const avisoError = error ? (
        <div id="login-error" className="mf-error" role="alert" aria-live="assertive">
            <AlertCircle size={16} aria-hidden="true" />
            {error}
        </div>
    ) : null;

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
                <div className="mf-brandmark"><Wordmark /></div>

                <div className="mf-form__inner">
                    <div className="mf-hero-illu" aria-hidden="true"><HeroIllustration /></div>
                    <h1 className="mf-headline">
                        <span>Tu mejor versión,</span>
                        <span>un plato a la vez.</span>
                    </h1>
                    <p className="mf-sub">
                        Planes de comida personalizados a tu objetivo, calculados a tu perfil y listos en minutos.
                    </p>

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
                                    // [P2-13] liga el error al campo para lectores de pantalla.
                                    aria-invalid={!!error}
                                    aria-describedby={error ? 'login-error' : undefined}
                                    autoComplete="email"
                                    inputMode="email"
                                    enterKeyHint="send"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck="false"
                                    // [P1-LOGIN-KEYBOARD · 2026-08-10] Sin `autoFocus`: en Android
                                    // abría el teclado al CARGAR, y el teclado tapa el botón de
                                    // abajo — el usuario aterrizaba con el CTA ya oculto sin haber
                                    // tocado nada. En escritorio el foco lo pone el efecto de arriba.
                                    ref={(el) => { if (el && esPantallaAncha() && !email) el.focus(); }}
                                />

                                {avisoError}

                                <button type="submit" className="mf-btn mf-btn--primary" disabled={loading}>
                                    {loading ? (
                                        <><Loader2 className="mf-loader" size={18} /> Enviando código…</>
                                    ) : (
                                        <>Continuar con correo <ArrowRight size={18} /></>
                                    )}
                                </button>

                                <p className="mf-privacy">
                                    Al continuar, reconoces nuestra{' '}
                                    <a href={landingLegalUrl('/privacy')} target="_blank" rel="noopener noreferrer">Política de Privacidad</a>.
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
                                onChange={handleCodeChange}
                                enterKeyHint="go"
                                placeholder="123456"
                                aria-label="Código de verificación"
                                // [P2-13] liga el error al campo para lectores de pantalla.
                                aria-invalid={!!error}
                                aria-describedby={error ? 'login-error' : undefined}
                                maxLength={8}
                            />

                            {avisoError}

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
