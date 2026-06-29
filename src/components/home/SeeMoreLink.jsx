import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { ArrowRight } from 'lucide-react';
import styles from './SeeMoreLink.module.css';

/* [P3-DETAIL-PAGES · 2026-06-29] Enlace "Ver más" de cada sección del landing a su
   página de detalle (/como-funciona, /funciones, /precision). */
const SeeMoreLink = ({ to, children }) => (
    <div className={styles.wrap}>
        <Link to={to} className={styles.link}>
            {children} <ArrowRight size={17} strokeWidth={2.5} />
        </Link>
    </div>
);

SeeMoreLink.propTypes = {
    to: PropTypes.string.isRequired,
    children: PropTypes.node.isRequired,
};

export default SeeMoreLink;
