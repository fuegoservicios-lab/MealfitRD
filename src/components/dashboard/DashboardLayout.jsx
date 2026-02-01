import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Utensils, Settings, LogOut, User, Menu, X } from 'lucide-react';
import { useAssessment } from '../../context/AssessmentContext';
import styles from './DashboardLayout.module.css';

const DashboardLayout = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { resetApp, planData, userProfile } = useAssessment();
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

                <div className={styles.userFooter} style={{ padding: '1.5rem', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <div className={styles.userProfile} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                        <div className={styles.avatar} style={{
                            width: '3.25rem', height: '3.25rem', borderRadius: '1rem',
                            background: '#EFF6FF', color: '#3B82F6',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.1)'
                        }}>
                            <User size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, color: '#1E293B', fontSize: '1rem', letterSpacing: '-0.025em' }}>
                                {userProfile?.full_name || planData?.userParams?.name || 'Mi Cuenta'}
                            </div>
                            <div style={{ color: '#64748B', fontSize: '0.8rem', fontWeight: 500 }}>Plan Personalizado</div>
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        className={styles.logoutBtn}
                        style={{
                            width: '100%',
                            padding: '0.875rem',
                            borderRadius: '0.875rem',
                            border: '1px solid #FECACA',
                            background: '#FEF2F2',
                            color: '#EF4444',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#FEE2E2';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(239, 68, 68, 0.1), 0 2px 4px -1px rgba(239, 68, 68, 0.06)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#FEF2F2';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    >
                        <LogOut size={18} strokeWidth={2.5} />
                        <span>Cerrar Sesión</span>
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