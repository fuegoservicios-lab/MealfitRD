import { Link } from 'react-router-dom';
import styles from './Header.module.css';
import { Menu, X, LayoutDashboard, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useAssessment } from '../../context/AssessmentContext';

const Header = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Obtenemos planData para saber si el usuario ya tiene un plan activo
    // Obtener session y resetApp para el logout
    const { planData, session, resetApp } = useAssessment();

    return (
        <header className={styles.header}>
            <div className={`container ${styles.container}`}>
                <Link to="/" className={styles.logo}>
                    Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                </Link>

                {/* Navegación de Escritorio */}
                <nav className={styles.navDesktop}>
                    <Link to="/" className={styles.navLink}>Inicio</Link>


                    {/* Lógica condicional: Si hay plan, muestra Dashboard; si no, Evaluación */}
                    {planData ? (
                        <Link
                            to="/dashboard"
                            className={styles.ctaButton}
                        >
                            <LayoutDashboard size={18} /> Ver mi Plan
                        </Link>
                    ) : (
                        <Link to="/assessment" className={styles.ctaButton}>
                            Empezar Ahora
                        </Link>
                    )}

                    {/* Botón Logout solo si hay sesión */}
                    {session && (
                        <button
                            onClick={() => {
                                resetApp();
                            }}
                            className={styles.navLink}
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: 0,
                                fontSize: 'inherit'
                            }}
                        >
                            <LogOut size={18} /> Cerrar Sesión
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
                        <Link
                            to="/"
                            className={styles.navLinkMobile}
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Inicio
                        </Link>


                        {planData ? (
                            <Link
                                to="/dashboard"
                                className={styles.ctaButtonMobile}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                <LayoutDashboard size={18} /> Ver mi Plan
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
                                    resetApp();
                                    setIsMenuOpen(false);
                                }}
                                className={styles.navLinkMobile}
                                style={{
                                    background: 'var(--bg-page)',
                                    width: '100%',
                                    textAlign: 'left',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <LogOut size={18} /> Cerrar Sesión
                            </button>
                        )}
                    </nav>
                )}
            </div>
        </header>
    );
};

export default Header;