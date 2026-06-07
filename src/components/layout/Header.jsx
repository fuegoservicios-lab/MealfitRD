import { Link, useLocation } from 'react-router-dom';
import styles from './Header.module.css';
import { Menu, X, LayoutDashboard, LogOut, ChevronRight, ChevronDown, Settings as SettingsIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAssessment } from '../../context/AssessmentContext';
import { useHeroCta } from '../../context/HeroCtaContext';
import LogoutConfirmModal from '../dashboard/LogoutConfirmModal';

const Header = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    // [ACCOUNT-MENU · 2026-06-01] Estado del menú de cuenta desplegable (desktop).
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const accountMenuRef = useRef(null);

    // Obtenemos planData para saber si el usuario ya tiene un plan activo
    // Obtener session y resetApp para el logout
    const { planData, session, resetApp, userProfile } = useAssessment();
    const { heroCtaVisible } = useHeroCta();
    const location = useLocation();

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
    const accountEmail = userProfile?.email || session?.user?.email || '';
    const accountName = userProfile?.full_name || (accountEmail ? accountEmail.split('@')[0] : 'Mi cuenta');
    const accountInitial = (accountName || accountEmail || 'U').trim().charAt(0).toUpperCase() || 'U';

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
                    {session && !isPlanLoading && (
                        <div className={styles.accountMenu} ref={accountMenuRef}>
                            <button
                                type="button"
                                className={styles.accountTrigger}
                                onClick={() => setIsAccountMenuOpen((p) => !p)}
                                aria-haspopup="menu"
                                aria-expanded={isAccountMenuOpen}
                                aria-label="Abrir menú de cuenta"
                            >
                                <span className={styles.accountAvatar} aria-hidden="true">{accountInitial}</span>
                                <ChevronDown
                                    size={16}
                                    className={`${styles.accountChevron} ${isAccountMenuOpen ? styles.accountChevronOpen : ''}`}
                                    aria-hidden="true"
                                />
                            </button>
                            {isAccountMenuOpen && (
                                <div className={styles.accountDropdown} role="menu">
                                    <div className={styles.accountIdentity}>
                                        <span className={styles.accountName}>{accountName}</span>
                                        {accountEmail && <span className={styles.accountEmailLine}>{accountEmail}</span>}
                                    </div>
                                    <Link
                                        to="/configuracion"
                                        className={styles.accountItem}
                                        role="menuitem"
                                        onClick={() => setIsAccountMenuOpen(false)}
                                    >
                                        <SettingsIcon size={16} strokeWidth={2.25} />
                                        <span>Configuración</span>
                                    </Link>
                                    <button
                                        type="button"
                                        className={`${styles.accountItem} ${styles.accountItemDanger}`}
                                        role="menuitem"
                                        onClick={() => { setIsAccountMenuOpen(false); setShowLogoutModal(true); }}
                                    >
                                        <LogOut size={16} strokeWidth={2.25} />
                                        <span>Cerrar Sesión</span>
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
                {!isPlanLoading && (
                    <button
                        className={styles.mobileToggle}
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        aria-label={isMenuOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
                        aria-expanded={isMenuOpen}
                    >
                        {isMenuOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
                    </button>
                )}
                </div>

                {/* Navegación Móvil */}
                {isMenuOpen && (
                    <nav className={styles.navMobile}>


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

                        {/* [ACCOUNT-SETTINGS · 2026-05-31] Acceso a Configuración (móvil) */}
                        {session && !isPlanLoading && (
                            <Link
                                to="/configuracion"
                                className={styles.navLinkMobile}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                <SettingsIcon size={18} /> Configuración
                            </Link>
                        )}

                        {/* Botón Logout Móvil */}
                        {session && !isPlanLoading && (
                            <button
                                onClick={() => {
                                    setShowLogoutModal(true);
                                    setIsMenuOpen(false);
                                }}
                                className={styles.logoutBtnMobile}
                            >
                                <LogOut size={18} /> Cerrar Sesión
                            </button>
                        )}
                    </nav>
                )}
            </div>
        </header>

        <LogoutConfirmModal
            isOpen={showLogoutModal}
            onConfirm={async () => {
                await resetApp();
                setShowLogoutModal(false);
            }}
            onCancel={() => setShowLogoutModal(false)}
            userEmail={session?.user?.email}
        />
        </>
    );
};

export default Header;