import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, LogOut, User, Menu, X, Clock, Refrigerator, Home, ChevronUp, ChevronRight, Crown, Lock } from 'lucide-react';
import RecipesIcon from '../icons/RecipesIcon';
import AgentIcon from '../icons/AgentIcon';
import { useAssessment } from '../../context/AssessmentContext';
// [P3-DASH-MODALS-A11Y · 2026-05-30] Hook SSOT de a11y (ESC + focus-trap +
// restore + body-overflow) para el "Mobile More Menu" — overlay full-screen
// con acción destructiva (Cerrar Sesión) que era el único surface modal-like
// del layout sin estas defensas (el popover de cuenta desktop ya tiene ESC +
// click-outside).
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import LogoutConfirmModal from './LogoutConfirmModal';
// [P1-GUEST-APPEARANCE · 2026-06-15] Selector de tema inline para invitados.
import GuestAppearanceToggle from './GuestAppearanceToggle';
import BottomTabBar from './BottomTabBar';
// [P3-DASH-CROSSFADE-PRELOAD · 2026-05-19] Preload de chunks lazy al hover/touch
import { prefetchRoute } from '../../utils/routePreload';
// [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] Prefetch del listado del Historial
// al hover/touch del NavItem — el data llega antes que el click.
import { prefetchHistoryList } from '../../utils/historyCaches';
import styles from './DashboardLayout.module.css';

const DashboardLayout = ({ children, noPaddingMobile = false }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { resetApp, planData, userProfile, session, isPremium, isGuest, exitGuestSession } = useAssessment();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileMoreMenuOpen, setIsMobileMoreMenuOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const accountMenuRef = useRef(null);

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

    const handleLogoutConfirm = async () => {
        // [P1-GUEST-LOGOUT-RACE · 2026-06-15] Navegar a /login (ruta PÚBLICA) ANTES
        // del teardown de estado. Si limpiáramos primero, hay una ventana de
        // re-render en /dashboard donde ProtectedRoute ve (isGuest||session) +
        // planData=null y rebota al formulario (/assessment, su redirect de
        // "assessment incompleto"). Saliendo primero de la ruta protegida, el
        // teardown ocurre ya en /login (sin ProtectedRoute) → nunca rebota al form.
        // Un invitado no tiene sesión en el servidor: salir es teardown local (sin
        // signOut). Un usuario real: resetApp (signOut).
        navigate('/login', { replace: true });
        if (isGuest) {
            exitGuestSession();
            return;
        }
        await resetApp();
    };

    const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
    const closeMenu = () => setIsMobileMenuOpen(false);

    // [P3-DASH-MODALS-A11Y · 2026-05-30] onClose memoizado + hook de a11y del
    // "Mobile More Menu". Identidad estable de onClose → el effect del hook no se
    // re-arma en cada render (misma lección que P2-DASH-SCAN-ONCLOSE-MEMO). Da
    // ESC para cerrar, focus-trap (Tab no escapa al fondo) y restore-focus al
    // trigger. Conserva `role="menu"` — el hook NO toca el DOM, solo gestiona foco.
    const closeMoreMenu = useCallback(() => setIsMobileMoreMenuOpen(false), []);
    const { containerRef: moreMenuRef } = useModalAccessibility({
        isOpen: isMobileMoreMenuOpen,
        onClose: closeMoreMenu,
    });

    // Settings funciona como página standalone (sin sidebar global ni BottomTabBar).
    const isSettings = location.pathname.startsWith('/dashboard/settings');

    const menuItems = [
        { icon: LayoutDashboard, label: 'Plan', path: '/dashboard' },
        { icon: AgentIcon, label: 'Agente', path: '/dashboard/agent' },
        { icon: Refrigerator, label: 'Nevera', path: '/dashboard/pantry', iconStroke: 2.25 },
        { icon: RecipesIcon, label: 'Recetas', path: '/dashboard/recipes' }, // Placeholder
        { icon: Clock, label: 'Historial', path: '/history' },
    ];

    // [P1-GUEST-LOGOUT · 2026-06-15] Un invitado no tiene email: mostrar "Invitado".
    const userEmail = isGuest ? 'Invitado' : (session?.user?.email || 'Cuenta');
    const logoutLabel = isGuest ? 'Salir del modo invitado' : 'Cerrar sesión';

    return (
        <div className={`${styles.container} ${isSettings ? styles.standalonePage : ''}`}>

            {/* Mobile Overlay */}
            <div
                className={`${styles.overlay} ${isMobileMenuOpen ? styles.overlayVisible : ''}`}
                onClick={closeMenu}
            />

            {/* Sidebar */}
            <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className={styles.logo}>
                        Mealfit<span style={{ color: 'var(--primary)' }}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </div>
                    {/* Close button for mobile inside sidebar */}
                    <button className={styles.menuBtn} onClick={closeMenu} style={{ marginBottom: '3rem', display: 'none' }}>
                        {/* We hide this by default and could show via media query if we wanted an internal close button, 
                            but clicking overlay is usually enough. Adding X just in case for clarity on mobile logic if needed. 
                            actually let's just use the Menu/X logic in the header or overlay.
                        */}
                    </button>
                </div>

                <nav className={styles.nav}>
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;

                        // [P1-GUEST-NAV-LOCK · 2026-06-15] Para invitados, las
                        // secciones que requieren cuenta (Agente/Nevera/Recetas/
                        // Historial — todo salvo Plan) NO están en GUEST_ROUTES y
                        // rebotarían en silencio a /dashboard. Mostrarlas con
                        // candado + link a /register en vez de un no-op confuso:
                        // convierte el límite del invitado en un gancho de cuenta.
                        if (isGuest && item.path !== '/dashboard') {
                            return (
                                <Link
                                    to="/register"
                                    key={item.path}
                                    className={styles.navItem}
                                    onClick={closeMenu}
                                    style={{ opacity: 0.6 }}
                                    title="Crea tu cuenta para desbloquear"
                                >
                                    <Icon size={20} strokeWidth={item.iconStroke ?? 2} />
                                    <span style={{ flex: 1 }}>{item.label}</span>
                                    <Lock size={13} strokeWidth={2.5} aria-hidden="true" />
                                </Link>
                            );
                        }

                        // Si está bloqueado, hacemos que el Link navegue a pricing opcionalmente
                        // o solo mostramos el ícono de candado.
                        if (item.locked) {
                            return (
                                <Link
                                    to="/pricing"
                                    key={item.path}
                                    className={styles.navItem}
                                    onClick={closeMenu}
                                    style={{ color: '#94A3B8', opacity: 0.8 }}
                                >
                                    <Icon size={20} strokeWidth={item.iconStroke ?? 2} />
                                    <span style={{ flex: 1 }}>{item.label}</span>
                                    <span style={{ fontSize: '10px', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>🔒 Básico</span>
                                </Link>
                            );
                        }

                        // [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] Para
                        // /history, además del chunk JS prefeteamos también
                        // el data del listado. Por el tiempo que tarda el
                        // dedo en hacer click, ambos suelen estar listos.
                        const _isHistory = item.path === '/history';
                        const _doPrefetch = () => {
                            prefetchRoute(item.path);
                            if (_isHistory) prefetchHistoryList();
                        };
                        return (
                            <Link
                                to={item.path}
                                key={item.path}
                                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                                onClick={closeMenu}
                                onMouseEnter={_doPrefetch}
                                onFocus={_doPrefetch}
                                onTouchStart={_doPrefetch}
                            >
                                <Icon size={20} strokeWidth={item.iconStroke ?? 2} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className={styles.accountSection} ref={accountMenuRef}>
                    {isAccountMenuOpen && (
                        <div className={styles.accountPopover} role="menu">
                            {/* [P3-UPGRADE-FUSION · 2026-05-26] Mini-sección
                                del plan tier fusionada con el popover. Antes
                                el chip ULTRA/PLUS/etc. vivía en el header del
                                Dashboard (clickeable → /dashboard/upgrade).
                                Movido aquí para consolidar todas las acciones
                                de cuenta en un único surface. */}
                            {/* [P3-CHIP-TIER-COLORS-DESKTOP · 2026-05-27] El tinte
                                dorado del header se aplica SOLO cuando el tier
                                es Ultra (max premium). Basic/Plus tienen su
                                color en el badge pero NO tiñen todo el popover
                                — evita "ruido visual" en el surface compartido
                                con los items Ajustes/Inicio/Cerrar. */}
                            <div className={`${styles.accountPlanHeader} ${userProfile?.plan_tier === 'ultra' ? styles.accountPlanHeaderPremium : ''}`}>
                                <div className={styles.accountPlanLabel}>Tu plan</div>
                                {/* [P3-UPGRADE-FUSION-V3 · 2026-05-26] Badge
                                    ULTRA/PLUS/etc. desacoplado del Link. El
                                    badge es un `<span>` inerte (cursor default,
                                    no clickeable, sin role) que solo muestra
                                    el tier. El CTA "Ver Planes" sigue siendo
                                    el único elemento clickeable que navega a
                                    /dashboard/upgrade. Diseño claro: badge =
                                    estado, link = acción.

                                    [P3-CHIP-TIER-COLORS-DESKTOP · 2026-05-27]
                                    Paleta diferenciada por tier (paridad con
                                    mobile): free=slate, basic=emerald,
                                    plus=indigo, ultra=amber+shimmer+Crown. */}
                                {(() => {
                                    const tierVariant = !isPremium
                                        ? 'free'
                                        : userProfile?.plan_tier === 'ultra' ? 'ultra'
                                        : userProfile?.plan_tier === 'plus' ? 'plus'
                                        : 'basic';
                                    const tierLabel = !isPremium
                                        ? 'GRATUITO'
                                        : userProfile?.plan_tier === 'ultra' ? 'ULTRA'
                                        : userProfile?.plan_tier === 'plus' ? 'PLUS'
                                        : 'BÁSICO';
                                    const badgeClass = [
                                        styles.accountPlanBadge,
                                        styles[`accountPlanBadge${tierVariant.charAt(0).toUpperCase() + tierVariant.slice(1)}`],
                                    ].filter(Boolean).join(' ');
                                    return (
                                        <div className={styles.accountPlanRow}>
                                            <span
                                                className={badgeClass}
                                                aria-label={`Plan actual: ${tierLabel}`}
                                            >
                                                {tierVariant === 'ultra' && (
                                                    <Crown
                                                        size={11}
                                                        strokeWidth={2.5}
                                                        className={styles.accountPlanBadgeIcon}
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                {tierLabel}
                                            </span>
                                            <Link
                                                to="/dashboard/upgrade"
                                                className={styles.accountPlanCta}
                                                onClick={() => { setIsAccountMenuOpen(false); closeMenu(); }}
                                                onMouseEnter={() => prefetchRoute('/dashboard/upgrade')}
                                                onFocus={() => prefetchRoute('/dashboard/upgrade')}
                                                onTouchStart={() => prefetchRoute('/dashboard/upgrade')}
                                                role="menuitem"
                                                aria-label="Comparar planes"
                                            >
                                                Ver Planes
                                                <ChevronRight size={13} strokeWidth={2.5} />
                                            </Link>
                                        </div>
                                    );
                                })()}
                            </div>
                            {/* [P1-GUEST-APPEARANCE · 2026-06-15] Para invitados,
                                "Ajustes" (página completa, gateada + fetches auth)
                                se sustituye por el único ajuste que aplica sin
                                cuenta: la apariencia (tema). Cuenta real → Ajustes. */}
                            {isGuest ? (
                                <GuestAppearanceToggle />
                            ) : (
                                <Link
                                    to="/dashboard/settings"
                                    className={styles.accountItem}
                                    onClick={() => { setIsAccountMenuOpen(false); closeMenu(); }}
                                    onMouseEnter={() => prefetchRoute('/dashboard/settings')}
                                    onFocus={() => prefetchRoute('/dashboard/settings')}
                                    onTouchStart={() => prefetchRoute('/dashboard/settings')}
                                    role="menuitem"
                                >
                                    <Settings size={16} strokeWidth={2.25} />
                                    <span>Ajustes</span>
                                </Link>
                            )}
                            <Link
                                to="/"
                                className={styles.accountItem}
                                onClick={() => { setIsAccountMenuOpen(false); closeMenu(); }}
                                role="menuitem"
                            >
                                <Home size={16} strokeWidth={2.25} />
                                <span>Inicio</span>
                            </Link>
                            <button
                                type="button"
                                className={`${styles.accountItem} ${styles.accountItemDanger}`}
                                onClick={() => { setIsAccountMenuOpen(false); setShowLogoutModal(true); }}
                                role="menuitem"
                            >
                                <LogOut size={16} strokeWidth={2.25} />
                                <span>{logoutLabel}</span>
                            </button>
                        </div>
                    )}
                    <button
                        type="button"
                        className={styles.accountBtn}
                        onClick={() => setIsAccountMenuOpen(prev => !prev)}
                        aria-haspopup="menu"
                        aria-expanded={isAccountMenuOpen}
                        aria-label="Abrir menú de cuenta"
                    >
                        <span className={styles.accountAvatar} aria-hidden="true">
                            <User size={16} strokeWidth={2.25} />
                        </span>
                        <span className={styles.accountEmail}>{userEmail}</span>
                        <ChevronUp
                            size={16}
                            className={`${styles.accountChevron} ${isAccountMenuOpen ? styles.accountChevronOpen : ''}`}
                            aria-hidden="true"
                        />
                    </button>
                </div>
            </aside>

            {/* Main Content Wrapper */}
            <div className={styles.mainWrapper}>

                {/* Mobile Header — hidden on AgentPage which has its own */}
                {!noPaddingMobile && (
                <header className={styles.mobileHeader}>
                    <div className={styles.mobileLogo}>
                        Mealfit<span style={{ color: 'var(--primary)' }}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </div>
                    <button
                        className={styles.menuBtn}
                        onClick={() => setIsMobileMoreMenuOpen(true)}
                        aria-label="Abrir menú"
                    >
                        <Menu size={22} />
                    </button>
                </header>
                )}

                <main
                    className={`${styles.mainContent} ${noPaddingMobile ? styles.noPaddingMobile : ''} ${isSettings ? styles.bottomBarHidden : ''}`}
                    style={noPaddingMobile ? { padding: 0, maxWidth: '100vw', overflow: 'hidden', margin: 0, width: '100%' } : {}}
                >
                    {children}
                </main>
            </div>

            {!noPaddingMobile && !isSettings && <BottomTabBar />}

            <LogoutConfirmModal
                isOpen={showLogoutModal}
                onConfirm={handleLogoutConfirm}
                onCancel={() => setShowLogoutModal(false)}
                userEmail={session?.user?.email}
                isGuest={isGuest}
            />

            {/* Mobile More Menu (Ajustes + Inicio + Cerrar Sesión) — rendered at container root to escape stacking contexts */}
            {isMobileMoreMenuOpen && (
                <>
                    <div
                        className={styles.mobileMoreOverlay}
                        onClick={closeMoreMenu}
                    />
                    <div className={styles.mobileMoreMenu} role="menu" ref={moreMenuRef} tabIndex={-1}>
                        {/* [P1-GUEST-APPEARANCE · 2026-06-15] Invitado → apariencia
                            (tema) en vez de Ajustes (gateado + fetches auth). */}
                        {isGuest ? (
                            <GuestAppearanceToggle />
                        ) : (
                            <Link
                                to="/dashboard/settings"
                                className={styles.mobileMoreItem}
                                onClick={closeMoreMenu}
                                onTouchStart={() => prefetchRoute('/dashboard/settings')}
                                role="menuitem"
                            >
                                <Settings size={18} strokeWidth={2.5} />
                                <span>Ajustes</span>
                            </Link>
                        )}
                        <Link
                            to="/"
                            className={styles.mobileMoreItem}
                            onClick={closeMoreMenu}
                            role="menuitem"
                        >
                            <Home size={18} strokeWidth={2.5} />
                            <span>Inicio</span>
                        </Link>
                        <button
                            className={`${styles.mobileMoreItem} ${styles.mobileMoreItemDanger}`}
                            onClick={() => {
                                closeMoreMenu();
                                setShowLogoutModal(true);
                            }}
                            role="menuitem"
                        >
                            <LogOut size={18} strokeWidth={2.5} />
                            <span>{logoutLabel}</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

DashboardLayout.propTypes = {
    children: PropTypes.node.isRequired,
    noPaddingMobile: PropTypes.bool
};

export default DashboardLayout;