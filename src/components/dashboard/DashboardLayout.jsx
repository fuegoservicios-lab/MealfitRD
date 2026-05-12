import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, LogOut, User, Menu, X, Clock, Bot, Refrigerator, Home, ChevronUp } from 'lucide-react';
import RecipesIcon from '../icons/RecipesIcon';
import { useAssessment } from '../../context/AssessmentContext';
import LogoutConfirmModal from './LogoutConfirmModal';
import BottomTabBar from './BottomTabBar';
import styles from './DashboardLayout.module.css';

const DashboardLayout = ({ children, noPaddingMobile = false }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { resetApp, planData, userProfile, session, isPremium } = useAssessment();
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
        await resetApp();
        navigate('/');
    };

    const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
    const closeMenu = () => setIsMobileMenuOpen(false);

    // Settings funciona como página standalone (sin sidebar global ni BottomTabBar).
    const isSettings = location.pathname.startsWith('/dashboard/settings');

    const menuItems = [
        { icon: LayoutDashboard, label: 'Plan', path: '/dashboard' },
        { icon: Bot, label: 'Agente', path: '/dashboard/agent' },
        { icon: Refrigerator, label: 'Nevera', path: '/dashboard/pantry', iconStroke: 2.25 },
        { icon: RecipesIcon, label: 'Recetas', path: '/dashboard/recipes' }, // Placeholder
        { icon: Clock, label: 'Historial', path: '/history' },
    ];

    const userEmail = session?.user?.email || 'Cuenta';

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

                        return (
                            <Link
                                to={item.path}
                                key={item.path}
                                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                                onClick={closeMenu}
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
                            <Link
                                to="/dashboard/settings"
                                className={styles.accountItem}
                                onClick={() => { setIsAccountMenuOpen(false); closeMenu(); }}
                                role="menuitem"
                            >
                                <Settings size={16} strokeWidth={2.25} />
                                <span>Ajustes</span>
                            </Link>
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
                                <span>Cerrar sesión</span>
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
            />

            {/* Mobile More Menu (Ajustes + Inicio + Cerrar Sesión) — rendered at container root to escape stacking contexts */}
            {isMobileMoreMenuOpen && (
                <>
                    <div
                        className={styles.mobileMoreOverlay}
                        onClick={() => setIsMobileMoreMenuOpen(false)}
                    />
                    <div className={styles.mobileMoreMenu} role="menu">
                        <Link
                            to="/dashboard/settings"
                            className={styles.mobileMoreItem}
                            onClick={() => setIsMobileMoreMenuOpen(false)}
                            role="menuitem"
                        >
                            <Settings size={18} strokeWidth={2.5} />
                            <span>Ajustes</span>
                        </Link>
                        <Link
                            to="/"
                            className={styles.mobileMoreItem}
                            onClick={() => setIsMobileMoreMenuOpen(false)}
                            role="menuitem"
                        >
                            <Home size={18} strokeWidth={2.5} />
                            <span>Inicio</span>
                        </Link>
                        <button
                            className={`${styles.mobileMoreItem} ${styles.mobileMoreItemDanger}`}
                            onClick={() => {
                                setIsMobileMoreMenuOpen(false);
                                setShowLogoutModal(true);
                            }}
                            role="menuitem"
                        >
                            <LogOut size={18} strokeWidth={2.5} />
                            <span>Cerrar Sesión</span>
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