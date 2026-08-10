import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import styles from './Header.module.css';
import { Menu, X, Equal, LayoutDashboard, LogOut, ChevronRight, ChevronDown, Settings as SettingsIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAssessment } from '../../context/AssessmentContext';
import LogoutConfirmModal from '../dashboard/LogoutConfirmModal';
// [P1-GUEST-APPEARANCE · 2026-06-15] Selector de tema inline para invitados.
import GuestAppearanceToggle from '../dashboard/GuestAppearanceToggle';
// [P3-HEADER-FLOAT-REDESIGN] El consumo de heroCtaVisible se eliminó: el CTA del header
// es siempre visible en marketing (`showStickyCta`, más abajo).
// [P1-PAPER-HERO-FIG00 · 2026-08-01] Y el productor también murió: al quedarse sin
// consumidor, `HeroCtaContext` era un IntersectionObserver en el Hero escribiendo un
// estado que nadie leía. Contexto, provider y ref borrados — no hay puente que restaurar.
// [P3-LANDING-DARK-ONLY · 2026-06-29] SSOT de rutas de marketing (header completo +
// tema oscuro forzado + sin config de apariencia).
import { isMarketingRoute } from '../../utils/marketingRoutes';
// [P3-LEGAL-HEADER-PARITY · 2026-06-30] SSOT de rutas legales (compartido con Footer) —
// estas rutas usan el header completo del landing. Evita el drift de listas hardcodeadas.
import { isLegalRoute } from '../../utils/legalRoutes';
// [P3-NEWS-1 · 2026-07-01] Rutas de Novedades → header completo del landing (nav + CTA).
import { isNewsRoute } from '../../utils/newsRoutes';
// [P1-PAPER-THEME · 2026-08-01] SSOT de las 6 rutas que reciben la superficie
// papel — subconjunto de isLandingLike (esa cubre 19 patrones: marketing +
// legales + novedades + supermercado). Gatea los 3 elementos NUEVOS de este
// header (etiqueta ES-DO/V1, índice del menú móvil, glifo de 2 trazos del
// toggle) para que legales/novedades/supermercado, que siguen en su propio
// claro/oscuro sin forzar papel, no hereden un vocabulario que no les toca.
import { isPaperSurface } from '../../utils/paperSurface';
import Wordmark from '../common/Wordmark';

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
    { id: 'research', label: 'Investigación', to: '/research' },
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

    // [P1-PAPER-THEME · 2026-08-01] ¿La ruta activa es superficie papel?
    const isPaper = isPaperSurface(location.pathname);

    // [P1-PAPER-THEME · 2026-08-01] La hairline inferior del header se afila
    // (--pa-rule-2 → --pa-rule) a los 8px de scroll — cambio de estado, no
    // animación (spec §4.1). El listener corre en todas las rutas (barato,
    // passive) pero solo el CSS bajo data-theme="paper" reacciona a él.
    const [isScrolled, setIsScrolled] = useState(false);
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled((prev) => {
                const next = window.scrollY > 8;
                return prev === next ? prev : next;
            });
        };
        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // No mostrar el botón "Empezar Ahora" si estamos en las rutas de evaluación o plan
    const hideStartNow = location.pathname.startsWith('/assessment') || location.pathname.startsWith('/plan');
    
    // Ocultar elementos del panel cuando estamos explícitamente en modo de carga (ruta /plan)
    const isPlanLoading = location.pathname.startsWith('/plan');
    const isLegalPage = isLegalRoute(location.pathname);
    // [P3-PRICING-HEADER-PARITY · 2026-06-29 · ext P3-DETAIL-PAGES 2026-06-29 · ext
    // P3-LEGAL-HEADER-PARITY 2026-06-30] Todas las páginas de marketing (landing + precios
    // + las 3 de detalle + motor) Y las páginas legales (privacy/terms/cookies/medical)
    // deben tener el header IDÉNTICO al del landing (nav segmentada + CTA sticky), no la
    // versión recortada. isMarketingRoute (SSOT) agrupa las de marketing; las legales se
    // suman vía isLegalPage. (El tema NO se toca aquí — las legales respetan su propio
    // light/dark, a diferencia de las de marketing que sí fuerzan oscuro.)
    // [P1-SUPERMARKET-DB · 2026-07-02] /supermercado (catálogo público) también lleva el
    // header COMPLETO del landing, igual que novedades/legales (el tema NO se fuerza).
    const isLandingLike = isMarketingRoute(location.pathname) || isLegalPage || isNewsRoute(location.pathname)
        || location.pathname === '/supermercado';

    // [P3-HEADER-FLOAT-REDESIGN · 2026-06-28] El CTA del header SIEMPRE visible en
    // landing/marketing (decisión del owner). Ya no se gatea por scroll, así que Header
    // dejó de consumir heroCtaVisible.
    const showStickyCta = isLandingLike && !hideStartNow;

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
    // [P3-LANDING-NO-SESSION-CHROME · 2026-07-01] El menú de cuenta (avatar + nombre +
    // Configuración + Cerrar Sesión) NO debe aparecer en superficies públicas de marketing
    // (landing, marketing, legales, novedades): el chrome de sesión vive SOLO en la app
    // (el DashboardLayout tiene su propio menú de cuenta). En el apex las rutas de app
    // redirigen al subdominio, así que aquí `!isLandingLike` deja el menú solo en las
    // páginas de app que usan este header (p.ej. /configuracion, /upgrade).
    const showAccountMenu = (session || isGuest) && !isPlanLoading && !isLandingLike;
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
        <header className={styles.header} data-scrolled={isScrolled}>
            <div className={styles.container}>
                {/* [P3-HEADER-LOGO-LINK · 2026-05-31] El logo es Link a "/" (lleva al inicio). */}
                <div className={styles.brandCluster}>
                    <Link to="/" className={styles.logo} aria-label="Bioboros — Inicio">
                        <Wordmark />
                    </Link>
                    {/* [P1-PAPER-THEME · 2026-08-01] Cajetín editorial: regla vertical de
                        1px × 20px + rótulo mono (spec §4.1). Decorativo — aria-hidden para
                        que el nombre accesible del header lo siga dando solo el Link. */}
                    {isPaper && (
                        <div className={styles.editionTag} aria-hidden="true">
                            <span className={styles.editionRule} />
                            <span className={styles.editionLabel}>ES-DO / V1</span>
                        </div>
                    )}
                </div>

                {/* [P3-HEADER-FLOAT-REDESIGN · 2026-06-28 · rutas P3-DETAIL-PAGES] Nav
                    SEGMENTADA CENTRADA (entre logo y CTA). En el DOM también en móvil para
                    mobile-first indexing (display:none <768px en CSS). Cada ítem es un
                    enlace de RUTA a su página de detalle; el activo se marca por pathname. */}
                {isLandingLike && (
                    <nav className={styles.navMarketing} aria-label="Páginas">
                        {/* [P1-PAPER-THEME · 2026-08-01] `aria-current` baja de `'true'` a
                            `'page'`: este link SÍ representa "la página actual dentro de un
                            set de páginas" — el token ARIA correcto es `page` (spec
                            WAI-ARIA), no el genérico `true`/`false`. Ya coincidía así en el
                            nav móvil (unas líneas más abajo), en BottomTabBar.jsx y en
                            Settings.jsx — este desktop era el único con drift. */}
                        {NAV_SECTIONS.map((s) => (
                            <Link
                                key={s.id}
                                to={s.to}
                                className={`${styles.navMarketingLink} ${s.to === location.pathname ? styles.navMarketingLinkActive : ''}`}
                                aria-current={s.to === location.pathname ? 'page' : undefined}
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
                                aria-controls="account-menu-dropdown"
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
                        aria-controls="mobile-menu-nav"
                    >
                        {/* [P1-PAPER-THEME · 2026-08-01] En papel el glifo baja a "dos
                            trazos de 1px" (spec §4.1): Equal (2 líneas) reemplaza el
                            hamburger de 3 líneas de lucide; X no cambia (ya son 2 trazos).
                            Fuera de papel el icono sigue igual. */}
                        {isMenuOpen
                            ? <X size={24} strokeWidth={isPaper ? 1 : 2} />
                            : (isPaper ? <Equal size={24} strokeWidth={1} /> : <Menu size={24} />)}
                    </button>
                )}
                </div>

                {/* Navegación Móvil —
                    [P3-HEADER-MOBILE-PORTAL · conservado a propósito P1-PAPER-THEME · 2026-08-01]
                    El menú móvil se renderiza con createPortal a document.body. El motivo
                    ORIGINAL era que el backdrop-filter de la pastilla del header rompía
                    position:fixed — y ese filtro ya no existe en la superficie papel.
                    SE CONSERVA IGUALMENTE: quitarlo reabre el bug de position:fixed atrapado
                    en cuanto alguien reintroduzca cualquier filtro o transform en el header. */}
                {isMenuOpen && hasMobileMenuItems && typeof document !== 'undefined' && createPortal(
                    <nav id="mobile-menu-nav" className={styles.navMobile}>
                        {/* [P3-HEADER-MOBILE-FULLSCREEN · 2026-06-29] Menú full-screen:
                            barra superior propia (logo + cerrar) porque el overlay cubre
                            el header, así que el toggle original queda tapado. */}
                        <div className={styles.navMobileTop}>
                            <span className={styles.navMobileLogo} aria-hidden="true">
                                <Wordmark />
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
                        {isLandingLike && NAV_SECTIONS.map((s, i) => (
                            <Link
                                key={s.id}
                                to={s.to}
                                className={styles.navLinkMobile}
                                aria-current={s.to === location.pathname ? 'page' : undefined}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                {/* [P1-PAPER-THEME · 2026-08-01] El índice vive AQUÍ, no en
                                    el nav de escritorio (spec §4.1 rechaza numerarlo ahí):
                                    en el menú a pantalla completa sí funciona como tabla de
                                    contenido. aria-hidden lo saca del nombre accesible. */}
                                {isPaper && (
                                    <span className={styles.navLinkMobileIndex} aria-hidden="true">
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                )}
                                {s.label}
                            </Link>
                        ))}

                        {planData && !isPlanLoading ? (
                            <Link
                                to="/dashboard"
                                className={styles.ctaButtonMobile}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                <LayoutDashboard size={18} /> Ver mi Plan
                            </Link>
                        ) : !hideStartNow && (
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
                    </nav>,
                    document.body
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