import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Utensils, Settings, LogOut, User, Menu, X, Clock, Bot } from 'lucide-react';
import { useAssessment } from '../../context/AssessmentContext';
import LogoutConfirmModal from './LogoutConfirmModal';
import styles from './DashboardLayout.module.css';

const DashboardLayout = ({ children, noPaddingMobile = false }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { resetApp, planData, userProfile, session } = useAssessment();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    const handleLogoutConfirm = async () => {
        await resetApp();
        navigate('/');
    };

    const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
    const closeMenu = () => setIsMobileMenuOpen(false);

    const menuItems = [
        { icon: LayoutDashboard, label: 'Mi Plan', path: '/dashboard' },
        { icon: Bot, label: 'Mi Agente', path: '/dashboard/agent' },
        { icon: Utensils, label: 'Recetas', path: '/dashboard/recipes' }, // Placeholder
        { icon: ShoppingBag, label: 'Lista de Compras', path: '/dashboard/shopping' },
        { icon: Clock, label: 'Historial', path: '/history' },
        { icon: Settings, label: 'Ajustes', path: '/dashboard/settings' }, // Placeholder
    ];

    return (
        <div className={styles.container}>

            {/* Mobile Overlay */}
            <div
                className={`${styles.overlay} ${isMobileMenuOpen ? styles.overlayVisible : ''}`}
                onClick={closeMenu}
            />

            {/* Sidebar */}
            <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link to="/" className={styles.logo} onClick={closeMenu}>
                        Mealfit<span style={{ color: 'var(--primary)' }}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </Link>
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
                        return (
                            <Link
                                to={item.path}
                                key={item.path}
                                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                                onClick={closeMenu}
                            >
                                <Icon size={20} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className={styles.userFooter}>
                    <button
                        onClick={() => setShowLogoutModal(true)}
                        className={styles.logoutBtn}
                    >
                        <LogOut size={18} strokeWidth={2.5} className={styles.logoutIcon} />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Wrapper */}
            <div className={styles.mainWrapper}>

                {/* Mobile Header — hidden on AgentPage which has its own */}
                {!noPaddingMobile && (
                <header className={styles.mobileHeader}>
                    <Link to="/" className={styles.mobileLogo}>
                        Mealfit<span style={{ color: 'var(--primary)' }}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </Link>
                    <button onClick={toggleMenu} className={styles.menuBtn}>
                        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </header>
                )}

                <main className={`${styles.mainContent} ${noPaddingMobile ? styles.noPaddingMobile : ''}`}>
                    {children}
                </main>
            </div>

            <LogoutConfirmModal
                isOpen={showLogoutModal}
                onConfirm={handleLogoutConfirm}
                onCancel={() => setShowLogoutModal(false)}
                userEmail={session?.user?.email}
            />
        </div>
    );
};

DashboardLayout.propTypes = {
    children: PropTypes.node.isRequired,
    noPaddingMobile: PropTypes.bool
};

export default DashboardLayout;