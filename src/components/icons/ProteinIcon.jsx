import PropTypes from 'prop-types';

// [ICONOS-FAMILIA · 2026-11-14] Mancuerna de Proteína. Misma receta que el resto de macros: contorno redondeado, discos
// con un velo del mismo color y UN acento sólido (la barra). Todo en `currentColor`: sirve en claro y en oscuro.
const ProteinIcon = ({ size = 24 }) => (
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
        {/* barra */}
        <path d="M9.4 12h5.2" strokeWidth="2.6" />
        {/* discos */}
        <rect x="5.2" y="6" width="4.2" height="12" rx="1.9" fill="currentColor" fillOpacity="0.32" />
        <rect x="14.6" y="6" width="4.2" height="12" rx="1.9" fill="currentColor" fillOpacity="0.32" />
        {/* topes */}
        <path d="M2.5 9.6v4.8M21.5 9.6v4.8" strokeWidth="2.2" />
    </svg>
);

ProteinIcon.propTypes = { size: PropTypes.number };

export default ProteinIcon;
