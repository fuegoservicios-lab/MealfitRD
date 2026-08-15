import Header from './Header';
import Footer from './Footer';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';

/* [P1-PAPER-HERO-FIG00 · 2026-08-01] Fuera `HeroCtaProvider`.
 * El puente Hero→Header (HEADER-STICKY-CTA · 2026-05-31) llevaba sin
 * consumidor desde P3-HEADER-FLOAT-REDESIGN: el CTA del header pasó a ser
 * permanente (`Header.jsx`: `showStickyCta = isLandingLike && !hideStartNow`,
 * sin leer `heroCtaVisible`). Quedaba un IntersectionObserver en el Hero
 * escribiendo un estado que nadie leía, y un provider envolviendo TODAS las
 * páginas para transportarlo. Se retiraron los tres a la vez — ref, provider
 * y `context/HeroCtaContext.jsx` — porque limpiar solo el ref deja un
 * provider huérfano que invita a recablearlo.
 */

const Layout = ({ children }) => {
    // [P3-PLAN-LOADING-NO-CHROME · 2026-06-29] La pantalla de generación de plan
    // (/plan, "Diseñando tu plan") es un takeover de pantalla completa: sin header,
    // sin footer y sin el padding-top del header. El resto de páginas no cambia.
    const { pathname } = useLocation();
    const isPlanLoading = pathname === '/plan' || pathname.startsWith('/plan/');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {!isPlanLoading && <Header />}
            <main id="main-content" tabIndex={-1} className="main-content" style={isPlanLoading ? { flex: 1, paddingTop: 0 } : { flex: 1 }}>
                {children}
            </main>
            {!isPlanLoading && <Footer />}
        </div>
    );
};

Layout.propTypes = {
    children: PropTypes.node.isRequired,
};

export default Layout;
