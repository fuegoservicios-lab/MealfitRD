import { Link, useLocation } from 'react-router-dom';
import { Instagram, Youtube, Facebook, Mail, Clock } from 'lucide-react';
import styles from './Footer.module.css';
// [P3-LEGAL-HEADER-PARITY · 2026-06-30] LEGAL_PATHS desde SSOT compartido con Header.
import { LEGAL_PATHS } from '../../utils/legalRoutes';

// [P3-LEGAL-BACK-LINK · 2026-05-26 · 4ª iter] Si el path actual es una página legal,
// NO usar ese path como `from` del próximo Link (eso haría que "Volver" regrese de
// Términos→Privacidad→Términos...). Mejor preservar el `state.from` heredado de cuando
// el user entró por primera vez a las legales — su origen real (landing, dashboard, etc).
// La lista de rutas legales vive en utils/legalRoutes.js (SSOT, ver arriba).

const Footer = () => {
    const location = useLocation();
    const isOnLegalPage = LEGAL_PATHS.includes(location.pathname);
    // Path origen real: si estoy en una legal, hereda el `from` previo;
    // si no, uso el path actual.
    const fromPath = isOnLegalPage
        ? (location.state?.from || '/')
        : location.pathname;

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
                        {/* [P3-FOOTER-X · 2026-07-01] Glyph oficial de X (Twitter). SVG inline
                            con fill (lucide no trae el logo de X), mismo patrón que TikTok. */}
                        <a href="https://x.com/MealfitRD" target="_blank" rel="noopener noreferrer" className={styles.socialIcon} aria-label="X">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="19"
                                height="19"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                            >
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                            </svg>
                        </a>
                    </div>
                </div>



                {/* [P3-LEGAL-EXPANSION · 2026-06-30 · cookies merge 2026-06-30] Dos columnas
                    legales: "Términos y servicios" (uso/pago/IA/médico) y "Privacidad y datos"
                    (privacidad/datos/investigación). La Política de Cookies se fusionó en
                    Privacidad (sección 13). `state.from` preserva el origen real para el
                    back-link inteligente de LegalLayout (ver P3-LEGAL-BACK-LINK). */}
                <div className={styles.col}>
                    <h4>Términos y servicios</h4>
                    <Link to="/terms" state={{ from: fromPath }}>Términos de Servicio</Link>
                    <Link to="/acceptable-use" state={{ from: fromPath }}>Política de Uso</Link>
                    <Link to="/refunds" state={{ from: fromPath }}>Reembolsos y Cancelaciones</Link>
                    <Link to="/ai-policy" state={{ from: fromPath }}>Uso de Inteligencia Artificial</Link>
                    <Link to="/medical" state={{ from: fromPath }}>Aviso Médico</Link>
                </div>

                <div className={styles.col}>
                    <h4>Privacidad y datos</h4>
                    <Link to="/privacy" state={{ from: fromPath }}>Política de Privacidad</Link>
                    <Link to="/data-protection" state={{ from: fromPath }}>Protección de Datos</Link>
                    <Link to="/responsible-disclosure" state={{ from: fromPath }}>Divulgación Responsable</Link>
                </div>

                {/* [P3-ABOUT-PAGE · 2026-06-30] Columna "Empresas": página corporativa
                    (Acerca de MealfitRD) + Investigación (movida desde "Privacidad y datos"). */}
                <div className={styles.col}>
                    <h4>Empresas</h4>
                    <Link to="/about" state={{ from: fromPath }}>MealfitRD</Link>
                    <Link to="/novedades" state={{ from: fromPath }}>Novedades</Link>
                    {/* [P1-SUPERMARKET-DB · 2026-07-02] Base de datos pública del
                        Supermercado RD (alimentos verificados + precios RD$). */}
                    <Link to="/supermercado" state={{ from: fromPath }}>Supermercados RD</Link>
                    <Link to="/research" state={{ from: fromPath }}>Investigación</Link>
                </div>

                {/* [P3-FOOTER-SUPPORT · 2026-05-31] Contacto directo de soporte
                    en un clic (antes solo alcanzable enterrado en las legales /
                    en la página Upgrade). Mismo email canónico que Upgrade.jsx. */}
                <div className={styles.col}>
                    <h4>Soporte</h4>
                    <p className={styles.supportIntro}>¿Dudas o problemas? Estamos para ayudarte.</p>
                    <a href="mailto:fuego.servicios@gmail.com" className={styles.supportLink}>
                        <span className={styles.supportIcon} aria-hidden="true">
                            <Mail size={16} strokeWidth={2.25} />
                        </span>
                        fuego.servicios@gmail.com
                    </a>
                    <p className={styles.supportNote}>
                        <Clock size={13} strokeWidth={2.25} aria-hidden="true" />
                        Respondemos en menos de 24 horas
                    </p>
                </div>

                <div className={styles.bottom}>
                    &copy; {new Date().getFullYear()} MealfitRD. Todos los derechos reservados.
                </div>
            </div>
        </footer>
    );
};

export default Footer;
