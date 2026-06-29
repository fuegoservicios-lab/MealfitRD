import Header from './Header';
import Footer from './Footer';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { HeroCtaProvider } from '../../context/HeroCtaContext';

const Layout = ({ children }) => {
    // [P3-PLAN-LOADING-NO-CHROME · 2026-06-29] La pantalla de generación de plan
    // (/plan, "Diseñando tu plan") es un takeover de pantalla completa: sin header,
    // sin footer y sin el padding-top del header. El resto de páginas no cambia.
    const { pathname } = useLocation();
    const isPlanLoading = pathname === '/plan' || pathname.startsWith('/plan/');

    return (
        // [HEADER-STICKY-CTA · 2026-05-31] Provider que comparte la visibilidad del
        // CTA del Hero entre <Header/> y la página (Hero). Vive aquí (no en App.jsx)
        // porque el Layout es justo el componente que compone Header + página.
        <HeroCtaProvider>
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                {!isPlanLoading && <Header />}
                <main className="main-content" style={isPlanLoading ? { flex: 1, paddingTop: 0 } : { flex: 1 }}>
                    <style>{`
                        /* [P3-HEADER-FLOAT-REDESIGN · 2026-06-28] El header es una barra
                           flotante (wrapper con padding + pastilla). Subimos el offset
                           para que el contenido arranque con aire bajo la barra. */
                        .main-content {
                            padding-top: calc(72px + max(env(safe-area-inset-top), 18px));
                        }
                        @media (min-width: 768px) {
                            .main-content {
                                padding-top: 88px;
                            }
                        }
                    `}</style>
                    {children}
                </main>
                {!isPlanLoading && <Footer />}
            </div>
        </HeroCtaProvider>
    );
};

Layout.propTypes = {
    children: PropTypes.node.isRequired,
};

export default Layout;
