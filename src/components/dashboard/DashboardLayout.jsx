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

                <div className={styles.userFooter} style={{ padding: '1.25rem', borderTop: '1px solid #F1F5F9', background: 'rgba(255,255,255,0.5)' }}>
                    <div className={styles.userProfile} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div className={styles.avatar} style={{
                            width: '2.75rem', height: '2.75rem', borderRadius: '0.75rem',
                            background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                            color: '#3B82F6',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 4px -1px rgba(59, 130, 246, 0.1)',
                            border: '1px solid #BFDBFE'
                        }}>
                            <User size={20} strokeWidth={2.5} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                <div style={{
                                    fontWeight: 700, color: '#1E293B', fontSize: '0.9rem',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    letterSpacing: '-0.01em'
                                }}>
                                    {userProfile?.full_name || planData?.userParams?.name || 'Mi Cuenta'}
                                </div>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center',
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '6px',
                                    fontSize: '0.6rem',
                                    fontWeight: '800',
                                    letterSpacing: '0.05em',
                                    textTransform: 'uppercase',
                                    background: userProfile?.plan_tier === 'plus' ? 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)' : '#F1F5F9',
                                    color: userProfile?.plan_tier === 'plus' ? '#B45309' : '#64748B',
                                    border: `1px solid ${userProfile?.plan_tier === 'plus' ? '#FCD34D' : '#E2E8F0'}`
                                }}>
                                    {userProfile?.plan_tier === 'plus' ? 'PLUS' : 'FREE'}
                                </span>
                            </div>
                            <div style={{ color: '#64748B', fontSize: '0.75rem', fontWeight: 500 }}>
                                {planData?.planName || 'Plan Personalizado'}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        className={styles.logoutBtn}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '0.75rem',
                            border: '1px solid transparent',
                            background: 'transparent',
                            color: '#64748B',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#FEF2F2';
                            e.currentTarget.style.color = '#EF4444';
                            e.currentTarget.style.borderColor = '#FECACA';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = '#64748B';
                            e.currentTarget.style.borderColor = 'transparent';
                        }}
                    >
                        <LogOut size={16} strokeWidth={2.5} />
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