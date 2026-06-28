import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, LogOut, Menu, X, Clock, Refrigerator, Home, Crown, Lock } from 'lucide-react';
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
// [P3-ACCOUNT-MENU-REDESIGN · 2026-06-27] Card del menú de cuenta (rediseño owner).
// AccountIdentityButton = la fila de cuenta compartida: pie de la card (abierto)
// Y disparador del sidebar (cerrado) → ambos estados idénticos por construcción.
import AccountMenu, { AccountIdentityButton } from './AccountMenu';
// [P1-APP-VERSION · 2026-06-19] Versión visible bajo el wordmark (SSOT en config).
import { APP_VERSION } from '../../config/appVersion';
// [P3-AVATAR-CYCLE · 2026-06-20] Avatar minimalista elegido en Ajustes, reflejado
// en el botón de cuenta del sidebar y sincronizado en vivo vía avatarStore.
import { MinimalAvatar } from '../avatars/minimalAvatars';
import { getAvatarId, subscribeAvatar } from '../../utils/avatarStore';
// [P3-NOTIF-CENTER · 2026-06-16] Centro de notificaciones (tirador en el borde +
// drawer) — global a todas las páginas del dashboard. Se auto-renderiza via
// portal a <body>, así que basta montarlo una vez aquí.
import NotificationCenter from './NotificationCenter';
// [P3-DASH-CROSSFADE-PRELOAD · 2026-05-19] Preload de chunks lazy al hover/touch
import { prefetchRoute } from '../../utils/routePreload';
// [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] Prefetch del listado del Historial
// al hover/touch del NavItem — el data llega antes que el click.
import { prefetchHistoryList } from '../../utils/historyCaches';
import styles from './DashboardLayout.module.css';

const DashboardLayout = ({ children, noPaddingMobile = false }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { resetApp, userProfile, session, isPremium, isGuest, exitGuestSession } = useAssessment();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileMoreMenuOpen, setIsMobileMoreMenuOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const accountMenuRef = useRef(null);

    // [P3-AVATAR-CYCLE · 2026-06-20] Avatar elegido (en Ajustes); refleja el cambio
    // en vivo en el botón de cuenta del sidebar vía avatarStore (mismo tab + cross-tab).
    const [avatarId, setAvatarId] = useState(getAvatarId);
    useEffect(() => subscribeAvatar(setAvatarId), []);

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
        // [LOGOUT-SESSION-SYNC · 2026-06-21] resetApp limpia `session` de forma
        // síncrona → el `!session` de ProtectedRoute (que corre ANTES del gate de
        // assessment) redirige a /login de inmediato, sin rebotar al formulario.
        // Navegamos DESPUÉS del teardown: con el guard redirect-if-session de /login,
        // navegar con la sesión aún stale rebotaba a / (no se deslogueaba sin refresh).
        if (isGuest) {
            exitGuestSession();
            navigate('/login', { replace: true });
            return;
        }
        await resetApp();
        navigate('/login', { replace: true });
    };

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
    // [P3-RECIPES-EDGE-MOBILE · 2026-06-24] Recetas va edge-to-edge en móvil
    // (sin el padding horizontal del mainContent) para máxima visibilidad —
    // conservando header y BottomTabBar (a diferencia de noPaddingMobile).
    const isRecipes = location.pathname.startsWith('/dashboard/recipes');
    // [P3-PANTRY-EDGE-MOBILE · 2026-06-24] Nevera edge-to-edge en móvil igual que
    // Recetas: el recuadro llena ancho + alto y reserva por dentro el espacio del
    // BottomTabBar (sin franja gris). Reusa la misma regla .mainContent.recipesEdge.
    const isPantry = location.pathname.startsWith('/dashboard/pantry');
    // [P3-HIST-EDGE-MOBILE · 2026-06-24] Historial también edge-to-edge en móvil
    // (mismo tratamiento que Recetas/Nevera: la superficie llena ancho + alto).
    const isHistory = location.pathname.startsWith('/history');

    const menuItems = [
        { icon: LayoutDashboard, label: 'Plan', path: '/dashboard' },
        { icon: AgentIcon, label: 'Agente', path: '/dashboard/agent' },
        { icon: Refrigerator, label: 'Nevera', path: '/dashboard/pantry', iconStroke: 2.25 },
        { icon: RecipesIcon, label: 'Recetas', path: '/dashboard/recipes' }, // Placeholder
        { icon: Clock, label: 'Historial', path: '/history' },
    ];

    // [P1-GUEST-LOGOUT · 2026-06-15] Un invitado no tiene email: mostrar "Invitado".
    const logoutLabel = isGuest ? 'Salir del modo invitado' : 'Cerrar sesión';

    // [P3-ACCOUNT-MENU-REDESIGN · 2026-06-27] Datos para la card del menú de cuenta.
    // Reusa la misma lógica guest/tier del popover previo: invitado → 'Invitado'
    // + sub-label "Plan de muestra"; free registrado → 'Gratuito'; premium → tier.
    const realEmail = session?.user?.email || '';
    // [P3-ACCOUNT-MENU-NAME · 2026-06-27] Nombre real del perfil ("Nombre Completo"
    // de Settings = userProfile.full_name); fallback al local del email si aún no
    // se ha guardado un nombre.
    const profileName = (userProfile?.full_name || '').trim();
    const accountName = isGuest
        ? 'Invitado'
        : (profileName || (realEmail ? realEmail.split('@')[0] : 'Cuenta'));
    const accountEmail = isGuest ? null : (realEmail || null);
    const accountSubLabel = isGuest ? 'Plan de muestra' : null;
    const planLabel = isGuest
        ? 'Invitado'
        : !isPremium
        ? 'Gratuito'
        : userProfile?.plan_tier === 'ultra' ? 'Ultra'
        : userProfile?.plan_tier === 'plus' ? 'Plus'
        : 'Básico';
    const isUltraTier = isPremium && userProfile?.plan_tier === 'ultra';
    const accountAvatarNode = avatarId
        ? <MinimalAvatar id={avatarId} size={34} style={{ borderRadius: '50%', width: '100%', height: '100%' }} />
        : null;

    return (
        <div className={`${styles.container} ${isSettings ? styles.standalonePage : ''}`}>

            {/* Mobile Overlay */}
            <div
                className={`${styles.overlay} ${isMobileMenuOpen ? styles.overlayVisible : ''}`}
                onClick={closeMenu}
            />

            {/* Sidebar */}
            <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className={styles.brandStack}>
                        <div className={styles.logo}>
                            Mealfit<span style={{ color: 'var(--primary)' }}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                        </div>
                        {/* [P1-APP-VERSION · 2026-06-19] Versión minimalista (estilo Anthropic) bajo el wordmark. */}
                        <span className={styles.version}>v{APP_VERSION}</span>
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
                    {/* [P3-ACCOUNT-MENU-REDESIGN · 2026-06-27] Card del menú de cuenta
                        (rediseño aportado por el owner). El popover se ancla a `bottom:0`
                        para que su pie de cuenta caiga exactamente sobre el botón
                        disparador (oculto vía visibility mientras está abierto) → la card
                        "reemplaza" al disparador sin duplicar la fila de cuenta. Conserva:
                        modo invitado (selector de tema en vez de Configuración + sub-label),
                        tiers premium (Crown en Ultra), avatar minimalista y el modal de
                        confirmación de logout. */}
                    {isAccountMenuOpen && (
                        <div className={styles.accountMenuPopover}>
                            <AccountMenu
                                user={{ name: accountName, email: accountEmail }}
                                plan={planLabel}
                                planAccessory={isUltraTier ? <Crown size={15} strokeWidth={2.5} /> : null}
                                avatar={accountAvatarNode}
                                subLabel={accountSubLabel}
                                settingsSlot={isGuest ? <GuestAppearanceToggle /> : null}
                                logoutLabel={logoutLabel}
                                onViewPlans={() => { setIsAccountMenuOpen(false); closeMenu(); navigate('/dashboard/upgrade'); }}
                                onViewPlansHover={() => prefetchRoute('/dashboard/upgrade')}
                                onSettings={() => { setIsAccountMenuOpen(false); closeMenu(); navigate('/dashboard/settings'); }}
                                onSettingsHover={() => prefetchRoute('/dashboard/settings')}
                                onHome={() => { setIsAccountMenuOpen(false); closeMenu(); navigate('/'); }}
                                onLogout={() => { setIsAccountMenuOpen(false); setShowLogoutModal(true); }}
                                onAccount={() => setIsAccountMenuOpen(false)}
                            />
                        </div>
                    )}
                    {/* [P3-ACCOUNT-MENU-REDESIGN · 2026-06-27] Disparador (estado
                        cerrado) = la MISMA fila de cuenta que el pie de la card abierta,
                        vía AccountIdentityButton. Se oculta con visibility mientras la
                        card está abierta (la card lo cubre, anclada a bottom:0). */}
                    <AccountIdentityButton
                        avatar={accountAvatarNode}
                        name={accountName}
                        email={accountEmail}
                        subLabel={accountSubLabel}
                        chevron="up"
                        onClick={() => setIsAccountMenuOpen(prev => !prev)}
                        style={{ visibility: isAccountMenuOpen ? 'hidden' : 'visible' }}
                        ariaLabel="Abrir menú de cuenta"
                        ariaHasPopup="menu"
                        ariaExpanded={isAccountMenuOpen}
                    />
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
                    className={`${styles.mainContent} ${noPaddingMobile ? styles.noPaddingMobile : ''} ${isSettings ? styles.bottomBarHidden : ''} ${(isRecipes || isPantry || isHistory) ? styles.recipesEdge : ''}`}
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

            {/* [P3-NOTIF-CENTER · 2026-06-16] Tirador + drawer de notificaciones —
                SOLO en la página "Plan" (/dashboard), que es de donde salen los
                avisos (micros, calidad). En Agente/Nevera/Recetas/etc. no aparece. */}
            {location.pathname.replace(/\/$/, '') === '/dashboard' && <NotificationCenter />}


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
                                <span>Configuración</span>
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