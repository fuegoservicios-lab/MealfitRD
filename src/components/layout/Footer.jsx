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
                            {/* TikTok glyph oficial — path llena el viewBox 24x24
                                de manera centrada (logo completo, no solo el "gancho"
                                abstracto que tenía antes). Usa fill en lugar de stroke
                                para matchear el peso visual de los íconos lucide
                                (Instagram/Facebook/Youtube son stroke-based, pero TikTok
                                queda visualmente mejor como solid fill aquí). */}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                            >
                                <path d="M16.6 5.82a4.28 4.28 0 0 1-1.06-2.82V2.5h-3.09v12.9a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.78.12V9.66a5.69 5.69 0 0 0-.78-.05 5.69 5.69 0 1 0 5.7 5.69V9.01a7.34 7.34 0 0 0 4.29 1.38V7.3a4.32 4.32 0 0 1-3.25-1.48z" />
                            </svg>
                        </a>
                        <a href="https://www.instagram.com/mealfit_rd?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" target="_blank" rel="noopener noreferrer" className={styles.socialIcon} aria-label="Instagram">
                            <Instagram size={20} />
                        </a>
                        <a href="https://www.facebook.com/share/1HkwoX8zHF/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" className={styles.socialIcon} aria-label="Facebook">
                            <Facebook size={20} />
                        </a>
                        <a href="https://www.youtube.com/@MealfitRD" target="_blank" rel="noopener noreferrer" className={styles.socialIcon} aria-label="YouTube">
                            <Youtube size={20} />
                        </a>
                    </div>
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
