import { Link } from 'react-router-dom';
import { Instagram, Youtube, Facebook } from 'lucide-react';
import styles from './Footer.module.css';

const Footer = () => {
    return (
        <footer className={styles.footer}>
            <div className={styles.container}>
                <div className={styles.col}>
                    <h3 className={styles.logo}>
                        Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </h3>
                    <p className={styles.desc}>
                        Nutrición de precisión potenciada por Inteligencia Artificial.
                        Tu camino hacia una vida más saludable empieza aquí.
                    </p>
                    <div className={styles.socialLinks}>
                        <a href="https://www.tiktok.com/@mealfitrd?_r=1&_t=ZS-93cjeaZR3NI" target="_blank" rel="noopener noreferrer" className={styles.socialIcon} aria-label="TikTok">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
                            </svg>
                        </a>
                        <a href="https://www.instagram.com/mealfit_rd?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" target="_blank" rel="noopener noreferrer" className={styles.socialIcon} aria-label="Instagram">
                            <Instagram size={20} />
                        </a>
                        <a href="#" className={styles.socialIcon} aria-label="Facebook">
                            <Facebook size={20} />
                        </a>
                        <a href="#" className={styles.socialIcon} aria-label="YouTube">
                            <Youtube size={20} />
                        </a>
                    </div>
                </div>

                <div className={styles.col}>
                    <h4>Explorar</h4>
                    <Link to="/">Inicio</Link>

                </div>

                <div className={styles.col}>
                    <h4>Legal</h4>
                    <Link to="/privacy">Política de Privacidad</Link>
                    <Link to="/terms">Términos de Servicio</Link>
                    <Link to="/cookies">Política de Cookies</Link>
                    <Link to="/medical">Aviso Médico</Link>
                </div>

                <div className={styles.bottom}>
                    &copy; {new Date().getFullYear()} MealfitRD. Todos los derechos reservados.
                </div>
            </div>
        </footer>
    );
};

export default Footer;
