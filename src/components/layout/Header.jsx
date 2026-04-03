import { Link } from 'react-router-dom';
import styles from './Header.module.css';
import { Menu, X, LayoutDashboard, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useAssessment } from '../../context/AssessmentContext';
import LogoutConfirmModal from '../dashboard/LogoutConfirmModal';

const Header = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    // Obtenemos planData para saber si el usuario ya tiene un plan activo
    // Obtener session y resetApp para el logout
    const { planData, session, resetApp } = useAssessment();

    return (
        <>
        <header className={styles.header}>
            <div className={`container ${styles.container}`}>
                <Link to="/" className={styles.logo}>
                    Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                </Link>

                {/* Navegación de Escritorio */}
                <nav className={styles.navDesktop}>


                    {/* Lógica condicional: Si hay plan, muestra Dashboard; si no, Evaluación */}
                    {planData ? (
                        <Link
                            to="/dashboard"
                            className={styles.ctaButton}
                        >
                            <LayoutDashboard size={18} /> Mi Panel
                        </Link>
                    ) : (
                        <Link to="/assessment" className={styles.ctaButton}>
                            Empezar Ahora
                        </Link>
                    )}

                    {/* Botón Logout solo si hay sesión */}
                    {session && (
                        <button
                            onClick={() => setShowLogoutModal(true)}
                            className={styles.navLink}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.5rem 1rem',
                                fontSize: '0.95rem',
                                fontFamily: 'inherit'
                            }}
                        >
                            <LogOut size={16} strokeWidth={2.5} /> Cerrar Sesión
                        </button>
                    )}
                </nav>

                {/* Botón Menú Móvil */}
                <button
                    className={styles.mobileToggle}
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                    {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>

                {/* Navegación Móvil */}
                {isMenuOpen && (
                    <nav className={styles.navMobile}>


                        {planData ? (
                            <Link
                                to="/dashboard"
                                className={styles.ctaButtonMobile}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                <LayoutDashboard size={18} /> Mi Panel
                            </Link>
                        ) : (
                            <Link
                                to="/assessment"
                                className={styles.ctaButtonMobile}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                Empezar Ahora
                            </Link>
                        )}

                        {/* Botón Logout Móvil */}
                        {session && (
                            <button
                                onClick={() => {
                                    setShowLogoutModal(true);
                                    setIsMenuOpen(false);
                                }}
                                className={styles.logoutBtnMobile}
                            >
                                <LogOut size={18} /> Cerrar Sesión
                            </button>
                        )}
                    </nav>
                )}
            </div>
        </header>

        <LogoutConfirmModal
            isOpen={showLogoutModal}
            onConfirm={async () => {
                await resetApp();
                setShowLogoutModal(false);
            }}
            onCancel={() => setShowLogoutModal(false)}
            userEmail={session?.user?.email}
        />
        </>
    );
};

export default Header;