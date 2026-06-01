import PropTypes from 'prop-types';

// [APPEARANCE-THEME · 2026-05-29 · v6 mancuerna sólida] Ícono de Proteína =
// mancuerna (músculo/fuerza). Versión SÓLIDA y robusta — sin opacidad parcial
// (la v5 usaba discos interiores a 0.55 que se veían "fantasma"/borrosos). Todo
// en `currentColor` (se adapta al azul del chip: brillante en oscuro, base en
// claro). Llena y centra el viewBox 24×24 (ancho x≈2.6-21.4, alto y≈4.6-19.4,
// centrado en (12,12)) para leer nítida a 18px.
const ProteinIcon = ({ size = 24 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        shapeRendering="geometricPrecision"
        style={{ display: 'block' }}
    >
        {/* Discos exteriores (grandes) */}
        <rect x="2.6" y="4.6" width="4" height="14.8" rx="1.8" fill="currentColor" />
        <rect x="17.4" y="4.6" width="4" height="14.8" rx="1.8" fill="currentColor" />
        {/* Discos interiores (medianos) */}
        <rect x="6.8" y="7" width="2.9" height="10" rx="1.3" fill="currentColor" />
        <rect x="14.3" y="7" width="2.9" height="10" rx="1.3" fill="currentColor" />
        {/* Barra central (handle) */}
        <rect x="8.5" y="10.1" width="7" height="3.8" rx="1.5" fill="currentColor" />
    </svg>
);

ProteinIcon.propTypes = {
    size: PropTypes.number,
};

export default ProteinIcon;
