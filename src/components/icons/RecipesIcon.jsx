import PropTypes from 'prop-types';

/**
 * [ICONOS-FAMILIA · 2026-11-14] «Recetas»: libro de cocina abierto, de la misma familia que `NavIcons` (trazo
 * redondeado + una página con cuerpo). API compatible con lucide (`size`, `strokeWidth`, `color`, `className`).
 */
const RecipesIcon = ({ size = 24, strokeWidth = 2, color = 'currentColor', className }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={{ display: 'block' }}
        aria-hidden="true"
    >
        {/* página izquierda con cuerpo */}
        <path d="M12 6.6C10.2 5.2 7.7 4.6 5 4.6a1 1 0 0 0-1 1V17a1 1 0 0 0 1 1c2.7 0 5.2.6 7 2Z" fill={color} fillOpacity="0.3" stroke="none" />
        <path d="M12 6.6C10.2 5.2 7.7 4.6 5 4.6a1 1 0 0 0-1 1V17a1 1 0 0 0 1 1c2.7 0 5.2.6 7 2 1.8-1.4 4.3-2 7-2a1 1 0 0 0 1-1V5.6a1 1 0 0 0-1-1c-2.7 0-5.2.6-7 2Z" />
        <path d="M12 6.6V20" />
        <path d="M15 10.2c.9-.3 1.8-.5 2.6-.6M15 13.6c.9-.3 1.8-.5 2.6-.6" strokeWidth={Math.max(strokeWidth * 0.8, 1)} />
    </svg>
);

RecipesIcon.propTypes = {
    size: PropTypes.number,
    strokeWidth: PropTypes.number,
    color: PropTypes.string,
    className: PropTypes.string,
};

export default RecipesIcon;
