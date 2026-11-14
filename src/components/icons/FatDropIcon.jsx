import PropTypes from 'prop-types';

// [ICONOS-FAMILIA · 2026-11-14] Gota de Grasas. Misma receta que el resto de macros: contorno redondeado, cuerpo con
// un velo del mismo color y UN acento sólido (el brillo interior). Todo en `currentColor`: sirve en claro y en oscuro.
const FatDropIcon = ({ size = 24 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: 'block' }}
        aria-hidden="true"
    >
        <path
            d="M12 2.7S18.6 9.9 18.6 14.6a6.6 6.6 0 0 1-13.2 0C5.4 9.9 12 2.7 12 2.7Z"
            fill="currentColor" fillOpacity="0.32"
        />
        <path d="M8.9 14.6a3.2 3.2 0 0 0 2.7 3.1" strokeWidth="2.1" />
    </svg>
);

FatDropIcon.propTypes = { size: PropTypes.number };

export default FatDropIcon;
