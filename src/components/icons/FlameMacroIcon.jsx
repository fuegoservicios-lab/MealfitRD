import PropTypes from 'prop-types';

// [APPEARANCE-THEME · 2026-05-29 · v2 centrada/grande] Llama de DOS TONOS para
// el chip de Calorías en modo oscuro. El cuerpo llena el viewBox 24×24 (tip
// y≈2.6, base y≈20.5, ancho x≈5.8-18.2, centrado en x=12) para que NO se vea
// pequeña ni desplazada. Cuerpo `currentColor` + núcleo caliente glossy.
const FlameMacroIcon = ({ size = 24, highlight = 'rgba(255,255,255,0.55)' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        shapeRendering="geometricPrecision"
        style={{ display: 'block' }}
    >
        {/* Cuerpo de la llama — llena la caja, centrado */}
        <path
            d="M12 2.6 C 14.4 7.4 18.2 9.8 18.2 14.3 a 6.2 6.2 0 0 1 -12.4 0 C 5.8 11.6 7.3 10.5 8.6 9.7 C 8 11.6 8.7 13 10 13.6 C 8.7 11 10.1 7.7 12 2.6 Z"
            fill="currentColor"
        />
        {/* Núcleo caliente (brillo) en el centro-bajo de la llama */}
        <path
            d="M12 9 C 13.7 10.9 14.5 12.3 14.5 13.9 a 2.5 2.5 0 0 1 -5 0 C 9.5 12.3 10.3 10.9 12 9 Z"
            fill={highlight}
        />
    </svg>
);

FlameMacroIcon.propTypes = {
    size: PropTypes.number,
    highlight: PropTypes.string,
};

export default FlameMacroIcon;
