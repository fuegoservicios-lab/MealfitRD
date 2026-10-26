// [P1-PLAN-LOTE-721 · 2026-09-28] La miniatura de la foto de un plato registrado, en su fila del contador y del cajón de
// días anteriores. La foto vive solo en este dispositivo (`utils/fotosDeComidas.js`); sin foto no pinta nada. Es
// decorativa cuando hay una sola; si hay varias, anuncia la cantidad de fotos de la galería.
import PropTypes from 'prop-types';
import { useFotosDeComida } from '../../hooks/useFotosDeComidas';
import { useT } from '../../i18n';
import styles from './MiniaturaDeComida.module.css';

const GalleryIcon = () => (
    <svg
        className={styles.galleryIcon}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
    >
        <rect
            x="4"
            y="1.5"
            width="10.5"
            height="10.5"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeOpacity="0.85"
        />
        <rect
            x="1.5"
            y="4"
            width="10.5"
            height="10.5"
            rx="2"
            fill="currentColor"
            fillOpacity="0.25"
            stroke="currentColor"
            strokeWidth="1.25"
        />
    </svg>
);

const MiniaturaDeComida = ({ userId, mealId, className }) => {
    const t = useT();
    const fotos = useFotosDeComida(userId, mealId, 'mini');
    const url = fotos[0]?.url;
    if (!url) return null;
    if (fotos.length === 1) return <img src={url} alt="" aria-hidden="true" className={className} width={36} height={36} decoding="sync" />;
    const etiqueta = t('{n} fotos', { n: fotos.length });
    return (
        <span className={`${className || ''} ${styles.stack}`} role="img" aria-label={etiqueta} title={etiqueta}>
            <img src={fotos[1].url} alt="" aria-hidden="true" className={styles.rear} width={36} height={36} decoding="sync" />
            <img src={url} alt="" aria-hidden="true" className={styles.cover} width={36} height={36} decoding="sync" />
            <span className={styles.count} aria-hidden="true">
                <GalleryIcon />
                <span>{fotos.length}</span>
            </span>
        </span>
    );
};

MiniaturaDeComida.propTypes = {
    userId: PropTypes.string,
    mealId: PropTypes.string,
    className: PropTypes.string,
};

export default MiniaturaDeComida;
