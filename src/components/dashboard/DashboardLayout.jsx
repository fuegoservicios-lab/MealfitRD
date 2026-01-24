import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Utensils, Settings, LogOut, User, Menu, X } from 'lucide-react';
import { useAssessment } from '../../context/AssessmentContext';
import styles from './DashboardLayout.module.css';

const DashboardLayout = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { resetApp } = useAssessment();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        resetApp();
        navigate('/');
    };

    const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
    const closeMenu = () => setIsMobileMenuOpen(false);

    const menuItems = [
        { icon: LayoutDashboard, label: 'Mi Plan', path: '/dashboard' },
        { icon: ShoppingBag, label: 'Lista de Compras', path: '/dashboard/shopping' },
        { icon: Utensils, label: 'Recetas', path: '/dashboard/recipes' }, // Placeholder
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
                        Mealfit<span style={{ color: 'var(--primary)' }}>RD</span>.IA
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
                    <div className={styles.userProfile}>
                        <div className={styles.avatar}>
                            <User size={20} />
                        </div>
                        <div style={{ fontSize: '0.875rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Mi Cuenta</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Plan Personalizado</div>
                        </div>
                    </div>

                    <button onClick={handleLogout} className={styles.logoutBtn}>
                        <LogOut size={16} /> Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* Main Content Wrapper */}
            <div className={styles.mainWrapper}>

                {/* Mobile Header */}
                <header className={styles.mobileHeader}>
                    <Link to="/" style={{ textDecoration: 'none', fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                        Mealfit<span style={{ color: 'var(--primary)' }}>RD</span>
                    </Link>
                    <button onClick={toggleMenu} className={styles.menuBtn}>
                        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </header>

                <main className={styles.mainContent}>
                    {children}
                </main>
            </div>
        </div>
    );
};

DashboardLayout.propTypes = {
    children: PropTypes.node.isRequired,
};

export default DashboardLayout;