import PropTypes from 'prop-types';

// [APPEARANCE-THEME · 2026-05-29 · v2 centrada/grande] Gota de DOS TONOS para
// el chip de Grasas en modo oscuro. El cuerpo llena el viewBox 24×24 (tip
// y≈2.4, base y≈22.4, ancho x≈5-19, centrado en x=12) para que NO se vea
// pequeña ni desplazada. Cuerpo `currentColor` + reflejo glossy.
const FatDropIcon = ({ size = 24, highlight = 'rgba(255,255,255,0.5)' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        shapeRendering="geometricPrecision"
        style={{ display: 'block' }}
    >
        {/* Cuerpo de la gota — llena la caja, centrado */}
        <path
            d="M12 2.4 C 12 2.4 19 10.8 19 15.4 a 7 7 0 0 1 -14 0 C 5 10.8 12 2.4 12 2.4 Z"
            fill="currentColor"
        />
        {/* Reflejo/brillo */}
        <ellipse
            cx="9.3"
            cy="15"
            rx="1.7"
            ry="2.7"
            fill={highlight}
            transform="rotate(-20 9.3 15)"
        />
    </svg>
);

FatDropIcon.propTypes = {
    size: PropTypes.number,
    highlight: PropTypes.string,
};

export default FatDropIcon;
