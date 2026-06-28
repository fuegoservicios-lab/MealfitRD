import { Link, useLocation, useNavigate } from 'react-router-dom';
import styles from './Header.module.css';
import { Menu, X, LayoutDashboard, LogOut, ChevronRight, ChevronDown, Settings as SettingsIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAssessment } from '../../context/AssessmentContext';
import { useHeroCta } from '../../context/HeroCtaContext';
import LogoutConfirmModal from '../dashboard/LogoutConfirmModal';
// [P1-GUEST-APPEARANCE · 2026-06-15] Selector de tema inline para invitados.
import GuestAppearanceToggle from '../dashboard/GuestAppearanceToggle';

const Header = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    // [ACCOUNT-MENU · 2026-06-01] Estado del menú de cuenta desplegable (desktop).
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const accountMenuRef = useRef(null);

    // Obtenemos planData para saber si el usuario ya tiene un plan activo
    // Obtener session y resetApp para el logout
    const { planData, session, resetApp, userProfile, isGuest, exitGuestSession } = useAssessment();
    const { heroCtaVisible } = useHeroCta();
    const location = useLocation();
    const navigate = useNavigate();

    // No mostrar el botón "Empezar Ahora" si estamos en las rutas de evaluación o plan
    const hideStartNow = location.pathname.startsWith('/assessment') || location.pathname.startsWith('/plan');
    
    // Ocultar elementos del panel cuando estamos explícitamente en modo de carga (ruta /plan)
    const isPlanLoading = location.pathname.startsWith('/plan');
    const isHome = location.pathname === '/';
    const isLegalPage = location.pathname === '/privacy' || location.pathname === '/terms';

    // [HEADER-STICKY-CTA · 2026-05-31] En el landing el header NO muestra CTA (el
    // Hero ya tiene el suyo). Cuando el del Hero sale de vista al scrollear, este
    // CTA equivalente aparece; al volver arriba (Hero CTA visible de nuevo) se va.
    const showStickyCta = isHome && !heroCtaVisible && !hideStartNow && !isLegalPage;

    // [ACCOUNT-MENU · 2026-06-01] Identidad para el avatar (inicial) + la cabecera
    // del menú (nombre + correo). Fallbacks: nombre del perfil → parte local del
    // correo → genérico.
    const accountEmail = isGuest ? '' : (userProfile?.email || session?.user?.email || '');
    const accountName = isGuest ? 'Invitado' : (userProfile?.full_name || (accountEmail ? accountEmail.split('@')[0] : 'Mi cuenta'));
    const accountInitial = isGuest ? 'I' : ((accountName || accountEmail || 'U').trim().charAt(0).toUpperCase() || 'U');

    // [P1-GUEST-LOGOUT · 2026-06-15] El menú de cuenta (con la salida) también
    // aparece para invitados — antes solo `session &&`, así que un invitado en la
    // landing no tenía cómo salir del modo invitado. La salida de un invitado es
    // un teardown local (exitGuestSession) + redirect a /login, sin signOut.
    const showAccountMenu = (session || isGuest) && !isPlanLoading;
    const logoutLabel = isGuest ? 'Salir del modo invitado' : 'Cerrar Sesión';

    // [HEADER-EMPTY-MENU-HIDE · 2026-06-23] ¿El menú móvil tendría AL MENOS un item?
    // En páginas legales (privacy/terms) SIN sesión ni invitado, todos los items se
    // gatean (session/isGuest/!isLegalPage) → el menú salía VACÍO y la hamburguesa
    // abría la nada (confunde, p.ej. al entrar a la Política desde el link del login).
    // Ocultamos el botón cuando no hay nada que mostrar.
    const _mobileCtaShows = !isHome && !isLegalPage && (Boolean(planData) || !hideStartNow);
    const hasMobileMenuItems = (session || isGuest) || _mobileCtaShows;

    // [ACCOUNT-MENU · 2026-06-01] Cerrar el menú con click-outside o Escape — mismo
    // patrón que el menú de cuenta del DashboardLayout (accountMenuRef + mousedown).
    useEffect(() => {
        if (!isAccountMenuOpen) return undefined;
        const handlePointerDown = (e) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
                setIsAccountMenuOpen(false);
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setIsAccountMenuOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isAccountMenuOpen]);

    return (
        <>
        <header className={styles.header}>
            <div className={`container ${styles.container}`}>
                {/* [P3-HEADER-LOGO-LINK · 2026-05-31] El logo ahora es Link a "/"
                    (convención universal: el logo lleva al inicio). Antes era un
                    <div> inerte. */}
                <Link to="/" className={styles.logo} aria-label="MealfitRD — Inicio">
                    Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                </Link>

                {/* [HEADER-STICKY-CTA · 2026-05-31] Cluster derecho: agrupa CTA sticky
                    + nav + toggle, alineados juntos a la derecha. El navMobile
                    (absolute) queda fuera, como hermano. */}
                <div className={styles.headerRight}>
                {/* [HEADER-STICKY-CTA · 2026-05-31] CTA sticky del landing — PRIMERO en
                    el cluster (queda a la IZQUIERDA) para que "Cerrar Sesión" (dentro de
                    navDesktop) quede a la DERECHA. Aparece al scrollear cuando el CTA del
                    Hero sale de vista; refleja "Ver mi Plan" (si hay plan) o "Crear mi
                    Plan Ahora". Montaje condicional → no ocupa espacio mientras oculto;
                    salida = desmonte directo. */}
                {showStickyCta && (
                    planData ? (
                        <Link to="/dashboard" className={`${styles.ctaButton} ${styles.stickyCtaEnter}`}>
                            <LayoutDashboard size={18} /> Ver mi Plan
                        </Link>
                    ) : (
                        <Link to="/assessment" className={`${styles.ctaButton} ${styles.stickyCtaEnter}`}>
                            Crear mi Plan Ahora <ChevronRight size={16} />
                        </Link>
                    )
                )}
                {/* Navegación de Escritorio */}
                <nav className={styles.navDesktop}>


                    {/* Lógica condicional: Si hay plan, muestra Dashboard; si no y no estamos en evaluación/plan, Evaluación */}
                    {planData && !isPlanLoading ? (
                        !isHome && !isLegalPage && (
                            <Link
                                to="/dashboard"
                                className={styles.ctaButton}
                            >
                                <LayoutDashboard size={18} /> Panel
                            </Link>
                        )
                    ) : !hideStartNow && !isHome && !isLegalPage && (
                        <Link to="/assessment" className={styles.ctaButton}>
                            Empezar Ahora
                        </Link>
                    )}

                    {/* [ACCOUNT-MENU · 2026-06-01] Menú de cuenta: fusiona
                        "Configuración" + "Cerrar Sesión" en un solo control
                        compacto (avatar + chevron) para no ocupar tanto espacio.
                        El menú móvil (hamburguesa) ya agrupaba ambos. */}
                    {showAccountMenu && (
                        <div className={styles.accountMenu} ref={accountMenuRef}>
                            <button
                                type="button"
                                className={styles.accountTrigger}
                                onClick={() => setIsAccountMenuOpen((p) => !p)}
                                aria-haspopup="menu"
                                aria-expanded={isAccountMenuOpen}
                                aria-controls="account-menu-dropdown"
                                aria-label={isAccountMenuOpen ? "Cerrar menú de cuenta" : "Abrir menú de cuenta"}
                            >
                                <span className={styles.accountAvatar} aria-hidden="true">{accountInitial}</span>
                                <ChevronDown
                                    size={16}
                                    className={`${styles.accountChevron} ${isAccountMenuOpen ? styles.accountChevronOpen : ''}`}
                                    aria-hidden="true"
                                />
                            </button>
                            {isAccountMenuOpen && (
                                <div id="account-menu-dropdown" className={styles.accountDropdown} role="menu">
                                    <div className={styles.accountIdentity}>
                                        <span className={styles.accountName}>{accountName}</span>
                                        {accountEmail && <span className={styles.accountEmailLine}>{accountEmail}</span>}
                                    </div>
                                    {/* [P1-GUEST-LOGOUT] Configuración (página completa)
                                        solo para cuentas reales — gateada para invitados.
                                        [P1-GUEST-APPEARANCE · 2026-06-15] El invitado recibe
                                        el único ajuste sin cuenta: la apariencia (tema). */}
                                    {isGuest ? (
                                        <GuestAppearanceToggle />
                                    ) : (
                                        <Link
                                            to="/configuracion"
                                            className={styles.accountItem}
                                            role="menuitem"
                                            onClick={() => setIsAccountMenuOpen(false)}
                                        >
                                            <SettingsIcon size={16} strokeWidth={2.25} />
                                            <span>Configuración</span>
                                        </Link>
                                    )}
                                    <button
                                        type="button"
                                        className={`${styles.accountItem} ${styles.accountItemDanger}`}
                                        role="menuitem"
                                        onClick={() => { setIsAccountMenuOpen(false); setShowLogoutModal(true); }}
                                    >
                                        <LogOut size={16} strokeWidth={2.25} />
                                        <span>{logoutLabel}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </nav>

                {/* Botón Menú Móvil */}
                {/* [P2-A11Y-LOGGING · 2026-05-13] aria-label + aria-expanded
                    para que lectores de pantalla anuncien tanto la acción
                    ("Abrir/Cerrar menú") como el estado actual del menú. */}
                {!isPlanLoading && hasMobileMenuItems && (
                    <button
                        className={styles.mobileToggle}
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        aria-label={isMenuOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
                        aria-expanded={isMenuOpen}
                        aria-controls="mobile-nav-menu"
                    >
                        {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                )}
                </div>

                {/* Navegación Móvil */}
                {isMenuOpen && hasMobileMenuItems && (
                    <nav id="mobile-nav-menu" className={styles.navMobile}>


                        {planData && !isPlanLoading ? (
                            !isHome && !isLegalPage && (
                                <Link
                                    to="/dashboard"
                                    className={styles.ctaButtonMobile}
                                    onClick={() => setIsMenuOpen(false)}
                                >
                                    <LayoutDashboard size={18} /> Panel
                                </Link>
                            )
                        ) : !hideStartNow && !isHome && !isLegalPage && (
                            <Link
                                to="/assessment"
                                className={styles.ctaButtonMobile}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                Empezar Ahora
                            </Link>
                        )}

                        {/* [ACCOUNT-SETTINGS · 2026-05-31] Acceso a Configuración (móvil).
                            [P1-GUEST-LOGOUT] No para invitados (settings gateado). */}
                        {session && !isGuest && !isPlanLoading && (
                            <Link
                                to="/configuracion"
                                className={styles.navLinkMobile}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                <SettingsIcon size={18} /> Configuración
                            </Link>
                        )}

                        {/* [P1-GUEST-APPEARANCE · 2026-06-15] Apariencia (tema) para
                            invitados — el único ajuste sin cuenta. */}
                        {isGuest && !isPlanLoading && <GuestAppearanceToggle />}

                        {/* Botón Logout Móvil — [P1-GUEST-LOGOUT] también para invitados. */}
                        {showAccountMenu && (
                            <button
                                onClick={() => {
                                    setShowLogoutModal(true);
                                    setIsMenuOpen(false);
                                }}
                                className={styles.logoutBtnMobile}
                            >
                                <LogOut size={18} /> {logoutLabel}
                            </button>
                        )}
                    </nav>
                )}
            </div>
        </header>

        <LogoutConfirmModal
            isOpen={showLogoutModal}
            onConfirm={async () => {
                // [LOGOUT-SESSION-SYNC · 2026-06-21] resetApp ahora limpia `session`
                // de forma síncrona → ProtectedRoute redirige a /login solo. Navegamos
                // DESPUÉS del teardown (no antes): con el guard redirect-if-session de
                // /login, navegar con la sesión aún stale rebotaba a / (el usuario "no
                // se deslogueaba" sin refrescar).
                setShowLogoutModal(false);
                if (isGuest) {
                    exitGuestSession();
                    navigate('/login', { replace: true });
                    return;
                }
                await resetApp();
                navigate('/login', { replace: true });
            }}
            onCancel={() => setShowLogoutModal(false)}
            userEmail={session?.user?.email}
            isGuest={isGuest}
        />
        </>
    );
};

export default Header;