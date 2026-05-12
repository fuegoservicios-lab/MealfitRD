import PropTypes from 'prop-types';

/**
 * Ícono de "Recetas" — libro de cocina abierto con líneas que sugieren
 * el texto de las recetas en ambas páginas. Reemplazo del genérico
 * fork+cuchillo de lucide-react. Representación directa del concepto
 * de "recetas escritas". API compatible con lucide (size / strokeWidth
 * / color → currentColor por default).
 */
const RecipesIcon = ({ size = 24, strokeWidth = 2, color = 'currentColor' }) => {
    const detailWidth = Math.max(strokeWidth * 0.6, 1);
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: 'block' }}
        >
            {/* Cubierta del libro abierto — silueta V suave (top) + U (bottom) */}
            <path
                d="M 3 6 Q 12 8, 21 6 L 21 19 Q 12 21, 3 19 Z"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            {/* Lomo central */}
            <path
                d="M 12 8 L 12 21"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
            />
            {/* Líneas de texto — página izquierda */}
            <line
                x1="5.5"
                y1="10.5"
                x2="10"
                y2="10.8"
                stroke={color}
                strokeWidth={detailWidth}
                strokeOpacity="0.5"
                strokeLinecap="round"
            />
            <line
                x1="5.5"
                y1="13"
                x2="10"
                y2="13.3"
                stroke={color}
                strokeWidth={detailWidth}
                strokeOpacity="0.5"
                strokeLinecap="round"
            />
            <line
                x1="5.5"
                y1="15.5"
                x2="9"
                y2="15.8"
                stroke={color}
                strokeWidth={detailWidth}
                strokeOpacity="0.5"
                strokeLinecap="round"
            />
            {/* Líneas de texto — página derecha */}
            <line
                x1="14"
                y1="10.8"
                x2="18.5"
                y2="10.5"
                stroke={color}
                strokeWidth={detailWidth}
                strokeOpacity="0.5"
                strokeLinecap="round"
            />
            <line
                x1="14"
                y1="13.3"
                x2="18.5"
                y2="13"
                stroke={color}
                strokeWidth={detailWidth}
                strokeOpacity="0.5"
                strokeLinecap="round"
            />
            <line
                x1="15"
                y1="15.8"
                x2="18.5"
                y2="15.5"
                stroke={color}
                strokeWidth={detailWidth}
                strokeOpacity="0.5"
                strokeLinecap="round"
            />
        </svg>
    );
};

RecipesIcon.propTypes = {
    size: PropTypes.number,
    strokeWidth: PropTypes.number,
    color: PropTypes.string,
};

export default RecipesIcon;
