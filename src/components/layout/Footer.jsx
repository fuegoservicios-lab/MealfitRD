import { Link } from 'react-router-dom';
import { Instagram, Youtube, Facebook } from 'lucide-react';
import styles from './Footer.module.css';

const Footer = () => {
    return (
        <footer className={styles.footer}>
            <div className={styles.container}>
                <div className={styles.col}>
                    <h3 className={styles.logo}>
                        Mealfit<span className={styles.highlight}>RD</span>.IA
                    </h3>
                    <p className={styles.desc}>
                        Nutrición de precisión potenciada por Inteligencia Artificial.
                        Tu camino hacia una vida más saludable empieza aquí.
                    </p>
                    <div className={styles.socialLinks}>
                        <a href="#" className={styles.socialIcon} aria-label="Instagram">
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
                    &copy; {new Date().getFullYear()} MealfitRD.IA. Todos los derechos reservados.
                </div>
            </div>
        </footer>
    );
};

export default Footer;
