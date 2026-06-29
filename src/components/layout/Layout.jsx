import Header from './Header';
import Footer from './Footer';
import PropTypes from 'prop-types';
import { HeroCtaProvider } from '../../context/HeroCtaContext';

const Layout = ({ children }) => {
    return (
        // [HEADER-STICKY-CTA · 2026-05-31] Provider que comparte la visibilidad del
        // CTA del Hero entre <Header/> y la página (Hero). Vive aquí (no en App.jsx)
        // porque el Layout es justo el componente que compone Header + página.
        <HeroCtaProvider>
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                <Header />
                <main className="main-content" style={{ flex: 1 }}>
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
                <Footer />
            </div>
        </HeroCtaProvider>
    );
};

Layout.propTypes = {
    children: PropTypes.node.isRequired,
};

export default Layout;
