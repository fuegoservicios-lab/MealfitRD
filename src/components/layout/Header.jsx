import { Link } from 'react-router-dom';
import styles from './Header.module.css';
import { Menu, X, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { useAssessment } from '../../context/AssessmentContext';

const Header = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Obtenemos planData para saber si el usuario ya tiene un plan activo
    const { planData } = useAssessment();

    return (
        <header className={styles.header}>
            <div className={`container ${styles.container}`}>
                <Link to="/" className={styles.logo}>
                    Mealfit<span className={styles.highlight}>RD</span>.IA
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
                            <LayoutDashboard size={18} /> Mi Panel
                        </Link>
                    ) : (
                        <Link to="/assessment" className={styles.ctaButton}>
                            Empezar Ahora
                        </Link>
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
                                <LayoutDashboard size={18} /> Ir a mi Panel
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
                    </nav>
                )}
            </div>
        </header>
    );
};

export default Header;