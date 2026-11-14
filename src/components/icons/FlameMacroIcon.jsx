import PropTypes from 'prop-types';

// [ICONOS-FAMILIA · 2026-11-14] Llama de Calorías. Misma receta que el resto de macros: contorno redondeado, cuerpo
// con un velo del mismo color y UN acento sólido (aquí, el núcleo). Todo en `currentColor`: sirve en claro y en oscuro.
const FlameMacroIcon = ({ size = 24 }) => (
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
            d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z"
            fill="currentColor" fillOpacity="0.32"
        />
        <path
            d="M12 18.6a2.1 2.1 0 0 0 2.1-2.1c0-1-.7-1.7-1.6-2.8-.5 1-2.6 1.6-2.6 2.8a2.1 2.1 0 0 0 2.1 2.1Z"
            fill="currentColor" stroke="none"
        />
    </svg>
);

FlameMacroIcon.propTypes = { size: PropTypes.number };

export default FlameMacroIcon;
