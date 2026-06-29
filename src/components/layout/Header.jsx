import { Link, useLocation, useNavigate } from 'react-router-dom';
import styles from './Header.module.css';
import { Menu, X, LayoutDashboard, LogOut, ChevronRight, ChevronDown, Settings as SettingsIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAssessment } from '../../context/AssessmentContext';
import LogoutConfirmModal from '../dashboard/LogoutConfirmModal';
// [P1-GUEST-APPEARANCE · 2026-06-15] Selector de tema inline para invitados.
import GuestAppearanceToggle from '../dashboard/GuestAppearanceToggle';
// [P3-HEADER-FLOAT-REDESIGN] El consumo de heroCtaVisible se eliminó (el CTA del header
// es siempre visible); por eso ya NO se importa useHeroCta aquí. Hero sigue siendo el
// productor del valor vía su provider.
// [P3-LANDING-DARK-ONLY · 2026-06-29] SSOT de rutas de marketing (header completo +
// tema oscuro forzado + sin config de apariencia).
import { isMarketingRoute } from '../../utils/marketingRoutes';

// [P3-HEADER-FLOAT-REDESIGN · 2026-06-28] Secciones del landing para la nav segmentada.
// El `id` debe coincidir con el id de cada <section> del Home (how-it-works, dashboard,
// benchmarks, pricing) — usados por el scroll suave Y el scrollspy del item activo.
// [P3-DETAIL-PAGES · 2026-06-29] Los 4 ítems del nav son RUTAS a páginas de detalle
// (no anchors in-page). Los showcases siguen en el landing + botón "Ver más"; el nav
// lleva directo a la página completa de cada tema. La scrollspy queda inactiva (filtra
// `!s.to` → 0 secciones), preservada por si se reintroduce algún anchor.
const NAV_SECTIONS = [
    { id: 'how-it-works', label: 'Cómo funciona', to: '/como-funciona' },
    { id: 'dashboard', label: 'Funciones', to: '/funciones' },
    { id: 'benchmarks', label: 'Precisión', to: '/precision' },
    { id: 'pricing', label: 'Precios', to: '/precios' },
];


const Header = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    // [ACCOUNT-MENU · 2026-06-01] Estado del menú de cuenta desplegable (desktop).
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const accountMenuRef = useRef(null);

    // Obtenemos planData para saber si el usuario ya tiene un plan activo
    // Obtener session y resetApp para el logout
    const { planData, session, resetApp, userProfile, isGuest, exitGuestSession } = useAssessment();
    const location = useLocation();
    const navigate = useNavigate();

    // No mostrar el botón "Empezar Ahora" si estamos en las rutas de evaluación o plan
    const hideStartNow = location.pathname.startsWith('/assessment') || location.pathname.startsWith('/plan');
    
    // Ocultar elementos del panel cuando estamos explícitamente en modo de carga (ruta /plan)
    const isPlanLoading = location.pathname.startsWith('/plan');
    const isLegalPage = location.pathname === '/privacy' || location.pathname === '/terms';
    // [P3-PRICING-HEADER-PARITY · 2026-06-29 · ext P3-DETAIL-PAGES 2026-06-29] Todas las
    // páginas de marketing (landing + precios + las 3 de detalle + motor) deben tener el
    // header IDÉNTICO al del landing (nav segmentada + CTA sticky), no la versión recortada
    // que mostraba solo "Empezar Ahora". isMarketingRoute (SSOT en utils) las agrupa.
    const isLandingLike = isMarketingRoute(location.pathname);

    // [P3-HEADER-FLOAT-REDESIGN · 2026-06-28] El CTA del header SIEMPRE visible en
    // landing/marketing (decisión del owner). Ya no se gatea por scroll, así que Header
    // dejó de consumir heroCtaVisible.
    const showStickyCta = isLandingLike && !hideStartNow && !isLegalPage;

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
    const _mobileCtaShows = !isLandingLike && !isLegalPage && (Boolean(planData) || !hideStartNow);
    // [P3-HEADER-MOBILE-HAMBURGER · 2026-06-29] En móvil las páginas de marketing
    // (landing-like) muestran la hamburguesa con el nav + el CTA (el CTA sticky se
    // oculta en móvil vía CSS), así que el menú siempre tiene contenido ahí.
    const hasMobileMenuItems = (session || isGuest) || _mobileCtaShows || isLandingLike;

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

    // [P3-DETAIL-PAGES · 2026-06-29] El nav segmentado dejó de ser scrollspy in-page:
    // todos sus ítems son RUTAS a páginas de detalle (ver NAV_SECTIONS). Se eliminaron
    // como código muerto el IntersectionObserver, `activeSection` y el scroll-suave
    // `handleSectionNav` — ya no existían secciones #id que observar/anclar.

    return (
        <>
        <header className={styles.header}>
            <div className={styles.container}>
                {/* [P3-HEADER-LOGO-LINK · 2026-05-31] El logo es Link a "/" (lleva al inicio). */}
                <Link to="/" className={styles.logo} aria-label="MealfitRD — Inicio">
                    Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                </Link>

                {/* [P3-HEADER-FLOAT-REDESIGN · 2026-06-28 · rutas P3-DETAIL-PAGES] Nav
                    SEGMENTADA CENTRADA (entre logo y CTA). En el DOM también en móvil para
                    mobile-first indexing (display:none <768px en CSS). Cada ítem es un
                    enlace de RUTA a su página de detalle; el activo se marca por pathname. */}
                {isLandingLike && (
                    <nav className={styles.navMarketing} aria-label="Páginas">
                        {NAV_SECTIONS.map((s) => (
                            <Link
                                key={s.id}
                                to={s.to}
                                className={`${styles.navMarketingLink} ${s.to === location.pathname ? styles.navMarketingLinkActive : ''}`}
                                aria-current={s.to === location.pathname ? 'true' : undefined}
                            >
                                {s.label}
                            </Link>
                        ))}
                    </nav>
                )}

                {/* [HEADER-STICKY-CTA · 2026-05-31] Cluster derecho: CTA + cuenta + toggle. */}
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
                            {/* [P3-HEADER-CTA-MOBILE-SHORT · 2026-06-29] Texto corto solo
                                en móvil ("Crear plan"); completo en desktop. */}
                            <span className={styles.ctaTextFull}>Crear mi Plan Ahora</span>
                            <span className={styles.ctaTextShort}>Crear plan</span>
                            <ChevronRight size={16} />
                        </Link>
                    )
                )}
                {/* Navegación de Escritorio */}
                <nav className={styles.navDesktop}>


                    {/* Lógica condicional: Si hay plan, muestra Dashboard; si no y no estamos en evaluación/plan, Evaluación */}
                    {planData && !isPlanLoading ? (
                        !isLandingLike && !isLegalPage && (
                            <Link
                                to="/dashboard"
                                className={styles.ctaButton}
                            >
                                <LayoutDashboard size={18} /> Panel
                            </Link>
                        )
                    ) : !hideStartNow && !isLandingLike && !isLegalPage && (
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
                                    {/* [P1-GUEST-LOGOUT] Configuración (página completa)
                                        solo para cuentas reales — gateada para invitados.
                                        [P1-GUEST-APPEARANCE · 2026-06-15] El invitado recibe
                                        el único ajuste sin cuenta: la apariencia (tema). */}
                                    {isGuest ? (
                                        /* [P3-LANDING-DARK-ONLY · 2026-06-29] El landing/marketing
                                           es oscuro fijo (sin config de apariencia ahí) → no se
                                           muestra el selector de tema en esas rutas. En la app sí. */
                                        !isLandingLike && <GuestAppearanceToggle />
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
                    >
                        {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                )}
                </div>

                {/* Navegación Móvil */}
                {isMenuOpen && hasMobileMenuItems && (
                    <nav className={styles.navMobile}>
                        {/* [P3-HEADER-MOBILE-FULLSCREEN · 2026-06-29] Menú full-screen:
                            barra superior propia (logo + cerrar) porque el overlay cubre
                            el header, así que el toggle original queda tapado. */}
                        <div className={styles.navMobileTop}>
                            <span className={styles.navMobileLogo} aria-hidden="true">
                                Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                            </span>
                            <button
                                type="button"
                                className={styles.navMobileClose}
                                onClick={() => setIsMenuOpen(false)}
                                aria-label="Cerrar menú"
                            >
                                <X size={26} />
                            </button>
                        </div>
                        {/* [P3-HEADER-MOBILE-HAMBURGER · 2026-06-29] Opciones del nav de
                            marketing dentro del menú móvil (landing-like): Cómo funciona,
                            Funciones, Precisión, Precios. */}
                        {isLandingLike && NAV_SECTIONS.map((s) => (
                            <Link
                                key={s.id}
                                to={s.to}
                                className={styles.navLinkMobile}
                                aria-current={s.to === location.pathname ? 'page' : undefined}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                {s.label}
                            </Link>
                        ))}

                        {planData && !isPlanLoading ? (
                            !isLegalPage && (
                                <Link
                                    to="/dashboard"
                                    className={styles.ctaButtonMobile}
                                    onClick={() => setIsMenuOpen(false)}
                                >
                                    <LayoutDashboard size={18} /> Ver mi Plan
                                </Link>
                            )
                        ) : !hideStartNow && !isLegalPage && (
                            <Link
                                to="/assessment"
                                className={styles.ctaButtonMobile}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                Crear mi Plan
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
                        {isGuest && !isPlanLoading && !isLandingLike && <GuestAppearanceToggle />}

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