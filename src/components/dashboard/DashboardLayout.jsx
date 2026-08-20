import { Fragment, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
// [P2-MOTION-REDUCED-USER · 2026-07-09] framer-motion respeta prefers-reduced-
// motion del SO en TODO el árbol del dashboard (el kill-switch CSS de index.css
// no cubre animaciones JS-driven que framer escribe inline vía WAAPI).
// Se monta AQUÍ y no en App.jsx a propósito: App es eager y framer-motion está
// deliberadamente fuera del critical path (P1-PERF-FRAMER-SPLIT); este layout
// es lazy y sus páginas ya cargan framer de todos modos.
import { MotionConfig } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, LogOut, Menu, X, Clock, Refrigerator, Lock, Info, ChevronRight, HelpCircle } from 'lucide-react';
import RecipesIcon from '../icons/RecipesIcon';
import AgentIcon from '../icons/AgentIcon';
import { useAssessment } from '../../context/AssessmentContext';
import { navItemsFor, isTrackingMode } from '../../config/dashboardNav';
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
// [P3-MORE-INFO-MENU · 2026-07-03] Enlaces "Más información" (SSOT compartido
// con la card del menú de cuenta) — versión inline para el menú "más" móvil.
import { moreInfoGroups } from './moreInfoLinks';
import { apexUrl } from '../../config/site';
// [P2-HELP-CHATBOT · 2026-07-04] Chatbot de ayuda ("Obtener ayuda"). Lazy:
// solo carga su chunk cuando el usuario lo abre.
const HelpChatWidget = lazy(() => import('./HelpChatWidget'));
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
import { useT } from '../../i18n';
import styles from './DashboardLayout.module.css';
import Wordmark from '../common/Wordmark';

const DashboardLayout = ({ children, noPaddingMobile = false }) => {
    const t = useT();
    const location = useLocation();
    const navigate = useNavigate();
    const { resetApp, userProfile, planData, session, isPremium, isGuest, exitGuestSession } = useAssessment();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileMoreMenuOpen, setIsMobileMoreMenuOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    // [P2-HELP-CHATBOT · 2026-07-04] Panel del chatbot de ayuda.
    const [isHelpChatOpen, setIsHelpChatOpen] = useState(false);
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

    /* [P1-SETTINGS-DIALOG · 2026-08-10] Configuración se abre como VENTANA sobre
       la página actual. `backgroundLocation` es lo que la convierte en ventana:
       App resuelve el árbol de rutas contra la ubicación que se manda aquí, así
       que lo que estabas mirando sigue pintado detrás y conserva su scroll.

       La URL no cambia de destino — sigue siendo /dashboard/settings —, así que
       los enlaces a `#subscription` y el botón atrás del teléfono funcionan
       igual. Entrar por enlace directo no trae este state y cae a la página
       completa de siempre; esa degradación es automática, no un caso especial. */
    const openSettingsDialog = useCallback(() => {
        setIsAccountMenuOpen(false);
        closeMenu();
        navigate('/dashboard/settings', { state: { backgroundLocation: location } });
         
    }, [navigate, location]);

    // [P3-DASH-MODALS-A11Y · 2026-05-30] onClose memoizado + hook de a11y del
    // "Mobile More Menu". Identidad estable de onClose → el effect del hook no se
    // re-arma en cada render (misma lección que P2-DASH-SCAN-ONCLOSE-MEMO). Da
    // ESC para cerrar, focus-trap (Tab no escapa al fondo) y restore-focus al
    // trigger. Conserva `role="menu"` — el hook NO toca el DOM, solo gestiona foco.
    // [P3-MORE-INFO-MENU · 2026-07-03] Al cerrar el menú "más" móvil, colapsa
    // también la sub-lista "Más información" para que reabra en estado limpio.
    const [isMobileInfoOpen, setIsMobileInfoOpen] = useState(false);
    const closeMoreMenu = useCallback(() => {
        setIsMobileMoreMenuOpen(false);
        setIsMobileInfoOpen(false);
    }, []);
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

    // [P1-PLAN-MODE · 2026-08-11] Las ENTRADAS salen del SSOT (config/dashboardNav);
    // aquí solo se les pega el icono. Dos copias a mano eran dos verdades.
    const _navIcons = {
        plan: { icon: LayoutDashboard },
        agent: { icon: AgentIcon },
        pantry: { icon: Refrigerator, iconStroke: 2.25 },
        recipes: { icon: RecipesIcon },
        history: { icon: Clock },
    };
    const menuItems = navItemsFor({ trackingMode: isTrackingMode(userProfile, planData) })
        .map((it) => ({ ...it, ..._navIcons[it.key] }));

    // [P1-GUEST-LOGOUT · 2026-06-15] Un invitado no tiene email: mostrar "Invitado".
    const logoutLabel = isGuest ? t('Salir del modo invitado') : t('Cerrar sesión');

    // [P3-ACCOUNT-MENU-REDESIGN · 2026-06-27] Datos para la card del menú de cuenta.
    // Reusa la misma lógica guest/tier del popover previo: invitado → 'Invitado'
    // + sub-label "Plan de muestra"; free registrado → 'Gratuito'; premium → tier.
    const realEmail = session?.user?.email || '';
    // [P3-ACCOUNT-MENU-NAME · 2026-06-27] Nombre real del perfil ("Nombre Completo"
    // de Settings = userProfile.full_name); fallback al local del email si aún no
    // se ha guardado un nombre.
    const profileName = (userProfile?.full_name || '').trim();
    const accountName = isGuest
        ? t('Invitado')
        : (profileName || (realEmail ? realEmail.split('@')[0] : t('Cuenta')));
    const accountEmail = isGuest ? null : (realEmail || null);
    const accountSubLabel = isGuest ? t('Plan de muestra') : null;
    // [P1-I18N-DASHBOARD · 2026-08-15] «Max» y «Plus» son NOMBRES de tier (no se
    // traducen, igual que la marca); «Gratuito» y «Básico» son adjetivos y sí.
    const planLabel = isGuest
        ? t('Invitado')
        : !isPremium
        ? t('Gratuito')
        : userProfile?.plan_tier === 'ultra' ? 'Max'
        : userProfile?.plan_tier === 'plus' ? 'Plus'
        : t('Básico');
    const isUltraTier = isPremium && userProfile?.plan_tier === 'ultra';
    const accountAvatarNode = avatarId
        ? <MinimalAvatar id={avatarId} size={34} style={{ borderRadius: '50%', width: '100%', height: '100%' }} />
        : null;

    return (
        <MotionConfig reducedMotion="user">
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
                        {/* [2026-08-14] SOLO el wordmark. Se probó el isotipo al lado
                            (en índigo y en monocromo, ambas desplegadas) y el dueño
                            decidió quedarse con el nombre a secas. El símbolo, su
                            componente y su PNG se borraron con él: un asset sin
                            consumidor es peso muerto — es la razón por la que la
                            auditoría del landing lo había borrado esta misma mañana.
                            Si vuelve a pedirse, está en el historial (commit 9725f93). */}
                        <div className={styles.logo}>
                            <Wordmark />
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
                                    title={t('Crea tu cuenta para desbloquear')}
                                >
                                    <Icon size={20} strokeWidth={item.iconStroke ?? 2} />
                                    <span style={{ flex: 1 }}>{item.label}</span>
                                    <Lock size={13} strokeWidth={2.5} aria-hidden="true" />
                                </Link>
                            );
                        }

                        // Si está bloqueado, hacemos que el Link navegue a la
                        // comparación de planes opcionalmente o solo mostramos
                        // el ícono de candado.
                        // [P3-10 · 2026-07-09] Antes apuntaba a "/pricing", ruta
                        // INEXISTENTE (la real es /precios, y dentro del app la
                        // superficie correcta es /dashboard/upgrade) — el wildcard
                        // soft-404 mandaba al usuario a "/" sin explicación.
                        if (item.locked) {
                            return (
                                <Link
                                    to="/dashboard/upgrade"
                                    key={item.path}
                                    className={styles.navItem}
                                    onClick={closeMenu}
                                    style={{ color: '#94A3B8', opacity: 0.8 }}
                                >
                                    <Icon size={20} strokeWidth={item.iconStroke ?? 2} />
                                    <span style={{ flex: 1 }}>{item.label}</span>
                                    <span style={{ fontSize: '10px', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>🔒 {t('Básico')}</span>
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
                                planAccessory={null}
                                /* [P3-CTA-MEJORAR-PLAN · 2026-06-30] "Mejorar plan" invita a subir
                                   de tier (Gratuito/Básico/Plus); Ultra ya está en el tope → "Ver planes". */
                                viewPlansLabel={isUltraTier ? t('Ver planes') : t('Mejorar plan')}
                                avatar={accountAvatarNode}
                                subLabel={accountSubLabel}
                                settingsSlot={isGuest ? <GuestAppearanceToggle /> : null}
                                logoutLabel={logoutLabel}
                                onViewPlans={() => { setIsAccountMenuOpen(false); closeMenu(); navigate('/dashboard/upgrade'); }}
                                onViewPlansHover={() => prefetchRoute('/dashboard/upgrade')}
                                onSettings={openSettingsDialog}
                                onSettingsHover={() => prefetchRoute('/dashboard/settings')}
                                onLogout={() => { setIsAccountMenuOpen(false); setShowLogoutModal(true); }}
                                onAccount={() => setIsAccountMenuOpen(false)}
                                onHelp={() => { setIsAccountMenuOpen(false); setIsHelpChatOpen(true); }}
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
                        ariaLabel={t('Abrir menú de cuenta')}
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
                        <Wordmark />
                    </div>
                    <button
                        className={styles.menuBtn}
                        onClick={() => setIsMobileMoreMenuOpen(true)}
                        aria-label={t('Abrir menú')}
                    >
                        <Menu size={22} />
                    </button>
                </header>
                )}

                <main
                    id="main-content"
                    tabIndex={-1}
                    className={`${styles.mainContent} ${noPaddingMobile ? styles.noPaddingMobile : ''} ${isSettings ? styles.bottomBarHidden : ''} ${(isRecipes || isPantry || isHistory) ? styles.recipesEdge : ''}`}
                    style={noPaddingMobile ? { padding: 0, maxWidth: '100vw', overflow: 'hidden', margin: 0, width: '100%', minWidth: 0 } : {}}
                >
                    {children}
                </main>
            </div>

            {/* [P1-CHAT-TABBAR-BACK · 2026-08-10] Antes: `!noPaddingMobile && !isSettings`.
                Los dos gates no eran equivalentes. `!isSettings` SÍ tiene una razón escrita
                (línea ~138: «Settings funciona como página standalone»). `noPaddingMobile`
                no tenía ninguna: su único trabajo declarado es CSS (`.noPaddingMobile
                { padding: 0 }`), y lo pasa un solo caller —App.jsx, para la ruta del
                Agente—. O sea que una bandera de RELLENO estaba decidiendo, de rebote, si
                el usuario tiene navegación.

                El efecto era el que reportó el dueño («salir es incómodo»): el chat era la
                única sección del dashboard sin barra de pestañas. Entrar costaba 1 toque y
                salir 2 (hamburguesa → entrada del menú), rompiendo el patrón de toda la
                app. El propio archivo demuestra que las dos cosas son separables: Recetas,
                Nevera e Historial ya van edge-to-edge «conservando header y BottomTabBar»
                con la clase `recipesEdge`.

                El alto de la barra (64px + safe-area) lo reserva ahora el propio chat por
                dentro — ver `.input-wrapper` en AgentPage. Devolver la barra SIN esa
                reserva la deja tapando la caja de escribir, que es peor que el defecto que
                arregla: los dos cambios son inseparables. */}
            {!isSettings && <BottomTabBar />}

            <LogoutConfirmModal
                isOpen={showLogoutModal}
                onConfirm={handleLogoutConfirm}
                onCancel={() => setShowLogoutModal(false)}
                userEmail={session?.user?.email}
                isGuest={isGuest}
            />

            {/* [P2-HELP-CHATBOT · 2026-07-04] Chatbot de ayuda — se monta solo al
                abrirlo (lazy chunk) y se porta a <body> él mismo (createPortal). */}
            {isHelpChatOpen && (
                <Suspense fallback={null}>
                    <HelpChatWidget onClose={() => setIsHelpChatOpen(false)} />
                </Suspense>
            )}

            {/* [P3-NOTIF-CENTER · 2026-06-16] Tirador + drawer de notificaciones —
                SOLO en la página "Plan" (/dashboard), que es de donde salen los
                avisos (micros, calidad). En Agente/Nevera/Recetas/etc. no aparece.
                [P3-NOTIF-HIDE-ON-MENU · 2026-06-29] En móvil, con el menú de las 3
                rayas abierto la campanita chocaba visualmente con el dropdown → se
                oculta mientras el menú está abierto. display:none (no desmonta) →
                preserva el estado/notificaciones del NotificationCenter.
                [P3-NOTIF-HANDLE-RAISE · 2026-07-04] Ídem con el chat de ayuda
                abierto: el panel vive abajo-derecha y el tirador le quedaba encima. */}
            {location.pathname.replace(/\/$/, '') === '/dashboard' && (
                <NotificationCenter hidden={isMobileMoreMenuOpen || isHelpChatOpen} />
            )}


            {/* Mobile More Menu (Configuración + Cerrar Sesión) — rendered at container root to escape stacking contexts */}
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
                                state={{ backgroundLocation: location }}
                                className={styles.mobileMoreItem}
                                onClick={closeMoreMenu}
                                onTouchStart={() => prefetchRoute('/dashboard/settings')}
                                role="menuitem"
                            >
                                <Settings size={18} strokeWidth={2.5} />
                                <span>{t('Configuración')}</span>
                            </Link>
                        )}
                        {/* [P3-MORE-INFO-MENU · 2026-07-03] "Más información" — expande
                            inline los enlaces de marketing/legales (SSOT moreInfoLinks).
                            Abren en pestaña nueva (su casa canónica es el apex). */}
                        <button
                            className={styles.mobileMoreItem}
                            onClick={() => setIsMobileInfoOpen(prev => !prev)}
                            role="menuitem"
                            aria-expanded={isMobileInfoOpen}
                        >
                            <Info size={18} strokeWidth={2.5} />
                            <span style={{ flex: 1 }}>{t('Más información')}</span>
                            <ChevronRight
                                size={15}
                                strokeWidth={2.5}
                                style={{ transform: isMobileInfoOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
                                aria-hidden="true"
                            />
                        </button>
                        {isMobileInfoOpen && (
                            <div className={styles.mobileMoreSubList}>
                                {moreInfoGroups(t).map((group, gi) => (
                                    <Fragment key={gi}>
                                        {gi > 0 && <div className={styles.mobileMoreSubDivider} role="separator" />}
                                        {/* [P1-MORE-INFO-IN-APP · 2026-08-10] Navegación NORMAL: dentro de la app
                                            y en la misma pestaña. Antes saltaban al dominio público en pestaña
                                            nueva, donde la sesión no existe por diseño — se entraba como anónimo,
                                            y el «atrás» de Safari cerraba esa pestaña devolviendo al dashboard.
                                            El icono también cambia: el de «abrir fuera» anunciaba algo que ya no
                                            ocurre, y un icono que promete lo que no hace estorba. */}
                                        {/* [P1-MORE-INFO-UNA-COPIA · 2026-08-20] `<a>` y NO `<Link>`, igual que el
                                            pie (P1-LEGAL-UNA-SOLA-COPIA). nginx redirige estas 16 rutas de
                                            `app.` al apex con un 301, pero eso solo atrapa una carga completa
                                            de pagina: un `<Link>` lo resuelve React Router EN EL CLIENTE, nunca
                                            toca el servidor, y el usuario se queda viendo la COPIA INTERNA — la
                                            que arrastra el diseno y el nav anteriores, y cuyo texto legal ya
                                            divergio (el 19-ago la misma afirmacion falsa sobre contrasenas vivia
                                            en TRES sitios).

                                            Aquel arreglo cerro el pie y se dejo los dos menus, que el 10-ago
                                            habian pasado a `<Link>` para no perder la sesion al salir al apex.
                                            Ese motivo se atendio de otra forma: MISMA PESTANA (sin `target`), asi
                                            que «atras» vuelve al dashboard y la sesion de `app.` sigue intacta —
                                            lo que aquel reporte pedia era no acabar en una pestana huerfana.
                                            Servir un contrato desincronizado es peor que un salto de dominio. */}
                                        {group.map((link) => (
                                            <a
                                                key={link.path}
                                                href={apexUrl(link.path)}
                                                rel="noopener"
                                                className={styles.mobileMoreSubItem}
                                                role="menuitem"
                                                onClick={closeMoreMenu}
                                            >
                                                <span style={{ flex: 1 }}>{link.label}</span>
                                                <ChevronRight size={13} strokeWidth={2.25} aria-hidden="true" />
                                            </a>
                                        ))}
                                    </Fragment>
                                ))}
                            </div>
                        )}
                        {/* [P2-HELP-CHATBOT · 2026-07-04] "Obtener ayuda" — abre el
                            chatbot de ayuda (antes mailto directo; el correo sigue
                            como escalación en el pie del widget). */}
                        <button
                            className={styles.mobileMoreItem}
                            role="menuitem"
                            onClick={() => {
                                closeMoreMenu();
                                setIsHelpChatOpen(true);
                            }}
                        >
                            <HelpCircle size={18} strokeWidth={2.5} />
                            <span>{t('Obtener ayuda')}</span>
                        </button>
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
        </MotionConfig>
    );
};

DashboardLayout.propTypes = {
    children: PropTypes.node.isRequired,
    noPaddingMobile: PropTypes.bool
};

export default DashboardLayout;
