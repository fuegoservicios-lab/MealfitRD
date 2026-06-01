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
                        .main-content {
                            padding-top: calc(60px + max(env(safe-area-inset-top), 24px));
                        }
                        @media (min-width: 768px) {
                            .main-content {
                                padding-top: 70px;
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
