import PropTypes from 'prop-types';

// [ICONOS-FAMILIA · 2026-11-14] Espiga de Carbohidratos. Misma receta que el resto de macros: contorno redondeado,
// granos con un velo del mismo color y UN acento sólido (el grano de la punta). Todo en `currentColor`: sirve en claro
// y en oscuro. Cinco granos, no los siete de lucide: a 18 px siete son ruido.
const GRANOS = [
    'M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z',
    'M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z',
    'M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z',
    'M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z',
];

const WheatFilledIcon = ({ size = 24 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: 'block' }}
        aria-hidden="true"
    >
        <path d="M2.5 21.5 15.5 8.5" />
        {GRANOS.map((d) => <path key={d} d={d} fill="currentColor" fillOpacity="0.32" />)}
        <path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z" fill="currentColor" />
    </svg>
);

WheatFilledIcon.propTypes = { size: PropTypes.number };

export default WheatFilledIcon;
