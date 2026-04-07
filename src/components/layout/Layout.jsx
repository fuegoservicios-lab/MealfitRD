import Header from './Header';
import Footer from './Footer';
import PropTypes from 'prop-types';

const Layout = ({ children }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Header />
            <main className="main-content" style={{ flex: 1 }}>
                <style>{`
                    .main-content {
                        padding-top: calc(80px + max(env(safe-area-inset-top), 24px));
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
    );
};

Layout.propTypes = {
    children: PropTypes.node.isRequired,
};

export default Layout;
