import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';
import { Instagram, Youtube, Facebook, Mail, Clock } from 'lucide-react';
import styles from './Footer.module.css';
// [P3-LEGAL-HEADER-PARITY · 2026-06-30] LEGAL_PATHS desde SSOT compartido con Header.
import { LEGAL_PATHS } from '../../utils/legalRoutes';
import Wordmark from '../common/Wordmark';
// [P1-PAPER-THEME · 2026-08-01] Mismo SSOT de las 6 rutas papel que consume
// Header.jsx — gatea el <details> de Soporte y la ausencia de fila inferior;
// las rutas no-papel conservan el copyright de una sola línea.
import { isPaperSurface } from '../../utils/paperSurface';
import { useT } from '../../i18n';
import { apexUrl } from '../../config/site';

/**
 * [P1-LEGAL-UNA-SOLA-COPIA · 2026-08-19] Los legales viven en el apex, y se sale
 * de la aplicación para leerlos.
 *
 * POR QUÉ UN `<a>` Y NO UN `<Link>`. nginx redirige `app.bioboros.com/privacy`
 * al apex con un 301, pero eso sólo atrapa una carga completa de página. Un
 * `<Link>` lo resuelve React Router EN EL CLIENTE: nunca toca el servidor, así
 * que el 301 no se ejecuta y el usuario sigue viendo la copia interna.
 *
 * O sea que la redirección sola cubre a quien teclea la URL y se le escapa a
 * quien pincha en el pie —que es casi todo el mundo—. Media solución habría
 * dejado el síntoma visible justo por el camino más usado.
 *
 * Y no es sólo estética: esa copia interna arrastraba el diseño y el nav
 * anteriores —enlaces a `/funciones`, `/precision`, `/investigacion`, que en el
 * apex son 301, 301 y 404—. El texto también divergió: el 19 de agosto la misma
 * afirmación falsa sobre contraseñas vivía en TRES sitios a la vez.
 */
// El helper es SSOT en `config/site.js` (lo estrenó Login.jsx en junio).

function EnlaceLegal({ a, children }) {
    // `rel="noopener"` aunque no lleve `target`: es el mismo origen de marca pero
    // otro origen web, y cuesta cero.
    return <a href={apexUrl(a)} rel="noopener">{children}</a>;
}

// [P3-LEGAL-BACK-LINK · 2026-05-26 · 4ª iter] Si el path actual es una página legal,
// NO usar ese path como `from` del próximo Link (eso haría que "Volver" regrese de
// Términos→Privacidad→Términos...). Mejor preservar el `state.from` heredado de cuando
// el user entró por primera vez a las legales — su origen real (landing, dashboard, etc).
// La lista de rutas legales vive en utils/legalRoutes.js (SSOT, ver arriba).

/**
 * [P2-FOOTER-COLUMN-DEDUP · 2026-08-14] Una columna del pie.
 *
 * Las cuatro columnas estaban escritas DOS VECES —una rama `<details>` para la
 * superficie papel y otra `<h4>` plana para el resto— con los hijos idénticos:
 * 16 `<Link>` más el bloque de soporte duplicados a lo largo de ~115 líneas, en
 * un componente que renderizan las 19 rutas públicas Y la app. Ni un test lo
 * montaba. El precedente de deriva está escrito en el propio repo
 * (`legalRoutes.js`: «No hacerlo fue exactamente el bug que dejó las 4 políticas
 * nuevas con el header recortado»).
 *
 * Y ya había empezado a divergir: la rama no-papel de «Empresas» llevaba un
 * comentario `[P1-SUPERMARKET-DB]` que su gemela no tenía. Documentación
 * presente en una copia y ausente en la otra es el primer síntoma, siempre.
 *
 * ⚠️ ELIGE EL ELEMENTO, no sólo el estado. El CSS de papel fuerza el `<details>`
 * abierto y no-interactivo por encima de 640 px —palanca medida para bajar de
 * 812 px de alto en móvil (P1-PAPER-THEME)— y para eso necesita exactamente
 * `summary` + `div.colBody`. Un `<div>` que «a veces colapsa» no sirve.
 */
const FooterColumn = ({ title, collapsible, children }) => (
    collapsible ? (
        <details className={styles.colDetails}>
            <summary className={styles.colSummary}>{title}</summary>
            <div className={styles.colBody}>{children}</div>
        </details>
    ) : (
        <>
            <h4>{title}</h4>
            {children}
        </>
    )
);

FooterColumn.propTypes = {
    title: PropTypes.string.isRequired,
    collapsible: PropTypes.bool,
    children: PropTypes.node,
};

const Footer = () => {
    const t = useT();
    const location = useLocation();
    const isOnLegalPage = LEGAL_PATHS.includes(location.pathname);
    // [P1-PAPER-THEME · 2026-08-01] ¿La ruta activa es superficie papel? Decide
    // el markup de Soporte y si se monta la fila inferior (copyright) o ninguna.
    const isPaper = isPaperSurface(location.pathname);
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
                        <Wordmark />
                    </h3>
                    <p className={styles.desc}>
                        {t('Nutrición de precisión potenciada por Inteligencia Artificial. Tu camino hacia una vida más saludable empieza aquí.')}
                    </p>
                    <div className={styles.socialLinks}>
                        <a href="https://www.tiktok.com/@bioboros" target="_blank" rel="noopener noreferrer" className={styles.socialIcon} aria-label="TikTok">
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
                        <a href="https://www.instagram.com/bioboros/" target="_blank" rel="noopener noreferrer" className={styles.socialIcon} aria-label="Instagram">
                            <Instagram size={20} />
                        </a>
                        <a href="https://www.facebook.com/share/1HkwoX8zHF/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" className={styles.socialIcon} aria-label="Facebook">
                            <Facebook size={20} />
                        </a>
                        <a href="https://youtube.com/@bioboros?si=JZo3gkHnsvN39AiZ" target="_blank" rel="noopener noreferrer" className={styles.socialIcon} aria-label="YouTube">
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
                    {/* [P1-PAPER-THEME · 2026-08-01 · ronda de arreglo 1] Bajo papel, las 2
                        columnas legales van en <details> nativo: cierra por defecto SOLO bajo
                        el breakpoint <640px (Footer.module.css lo fuerza siempre-abierto y
                        no-interactivo en tablet/desktop) — la primera palanca (Empresas+Soporte
                        a 2 columnas) no bastaba por sí sola para bajar de 812px de alto en
                        móvil. Los 5 links siguen siendo los mismos 5 destinos, un tap detrás.
                        Las 15 rutas no-papel conservan el <h4> plano, sin cambios. */}
                    <FooterColumn title={t('Términos y servicios')} collapsible={isPaper}>
                                <EnlaceLegal a="/terms">{t('Términos de Servicio')}</EnlaceLegal>
                                <EnlaceLegal a="/acceptable-use">{t('Política de Uso')}</EnlaceLegal>
                                <EnlaceLegal a="/refunds">{t('Reembolsos y Cancelaciones')}</EnlaceLegal>
                                <EnlaceLegal a="/ai-policy">{t('Uso de Inteligencia Artificial')}</EnlaceLegal>
                                <EnlaceLegal a="/medical">{t('Aviso Médico')}</EnlaceLegal>
                    </FooterColumn>
                </div>

                <div className={styles.col}>
                    <FooterColumn title={t('Privacidad y datos')} collapsible={isPaper}>
                                <EnlaceLegal a="/privacy">{t('Política de Privacidad')}</EnlaceLegal>
                                <EnlaceLegal a="/data-protection">{t('Protección de Datos')}</EnlaceLegal>
                                <EnlaceLegal a="/responsible-disclosure">{t('Divulgación Responsable')}</EnlaceLegal>
                    </FooterColumn>
                </div>

                {/* [P3-ABOUT-PAGE · 2026-06-30] Columna "Empresas": página corporativa
                    (Acerca de Bioboros) + Investigación (movida desde "Privacidad y datos"). */}
                <div className={styles.col}>
                    {/* [P1-PAPER-THEME · 2026-08-01 · ronda de arreglo 1, 2ª iter] El
                        <details> de Términos+Privacidad solo (868,9px) no bastaba para bajar
                        de 812px: Empresas+Soporte, la fila siguiente, seguía a 249px de alto
                        (el mayor bloque restante tras Marca). Mismo patrón aquí. */}
                    <FooterColumn title={t('Empresas')} collapsible={isPaper}>
                            <Link to="/about" state={{ from: fromPath }}>Bioboros</Link>
                            <Link to="/novedades" state={{ from: fromPath }}>{t('Novedades')}</Link>
                            {/* [P1-SUPERMARKET-DB · 2026-07-02] Base de datos pública del
                                Supermercado RD (alimentos verificados + precios RD$). */}
                            <Link to="/supermercado" state={{ from: fromPath }}>{t('Supermercados RD')}</Link>
                            <Link to="/research" state={{ from: fromPath }}>{t('Investigación')}</Link>
                    </FooterColumn>
                </div>

                {/* [P3-FOOTER-SUPPORT · 2026-05-31] Contacto directo de soporte
                    en un clic (antes solo alcanzable enterrado en las legales /
                    en la página Upgrade). Mismo email canónico que Upgrade.jsx. */}
                <div className={styles.col}>
                    {/* [P1-PAPER-THEME · 2026-08-01 · ronda de arreglo 1, 2ª iter] Bajo
                        <640px el contacto de soporte pasa a un tap detrás del summary — el
                        mismo trade-off que Empresas. Sigue "alcanzable" (12/12 destinos), y
                        en desktop/tablet se ve exactamente igual que antes (forzado abierto). */}
                    <FooterColumn title={t('Soporte')} collapsible={isPaper}>
                                <p className={styles.supportIntro}>{t('¿Dudas o problemas? Estamos para ayudarte.')}</p>
                                <a href="mailto:bioboros.support@gmail.com" className={styles.supportLink}>
                                    <span className={styles.supportIcon} aria-hidden="true">
                                        <Mail size={16} strokeWidth={2.25} />
                                    </span>
                                    bioboros.support@gmail.com
                                </a>
                                <p className={styles.supportNote}>
                                    <Clock size={13} strokeWidth={2.25} aria-hidden="true" />
                                    {t('Respondemos en menos de 24 horas')}
                                </p>
                    </FooterColumn>
                </div>

                {/* [P1-PAPER-THEME · 2026-08-01 · cajetín retirado 2026-08-07]
                    Bajo papel el colofón era un cajetín reglado de 4 celdas
                    (EMITIDO — 2026 / REVISIÓN — R02 / MOTOR — vX / ES-DO, spec
                    §4.7). Retirado por decisión del dueño: ruido visual sin
                    función — igual que en su día se rechazaron "ESCALA — 1:1" y
                    "HOJA — 01/01" por atrezzo. Bajo papel el footer ya no monta
                    fila inferior; las rutas no-papel conservan el copyright de
                    1 línea. Si vuelve a hacer falta, el CSS del cajetín está en
                    el historial de Footer.module.css (regla §4.7). */}
                {!isPaper && (
                    <div className={styles.bottom}>
                        {t('© {year} Bioboros. Todos los derechos reservados.', { year: new Date().getFullYear() })}
                    </div>
                )}
            </div>
        </footer>
    );
};

export default Footer;
