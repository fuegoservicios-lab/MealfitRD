import PropTypes from 'prop-types';

// [APPEARANCE-THEME · 2026-05-29] Trigo RELLENO de dos colores, para el chip de
// Carbohidratos en modo oscuro. Un solo color no servía: las venas necesitan
// ser oscuras (contraste sobre las hojas verdes vivas) pero el TALLO ("rabito")
// es solo trazo —sin relleno— y con color oscuro desaparecía sobre el fondo
// oscuro. Por eso:
//   · Hojas rellenas → currentColor (verde vivo del macro, visible).
//   · Tallo ("rabito") → verde oscuro #047857 (más sobrio que las hojas, pero
//     más claro que las venas para no desaparecer sobre el fondo oscuro).
//   · Venas de las hojas → verde casi-negro (#022C22) para definición nítida.
// [APPEARANCE-THEME · 2026-05-29 · v2 dark-legible] Espiga simplificada: se
// dropearon los 2 granos superiores (índices 2 y 6 de la versión lucide) para
// reducir el "ruido" a 16-20px; quedan 2 pares laterales + la hoja-bandera
// superior. Tallo más grueso y verde brillante (#34D399) para que no
// desaparezca, y venas más finas (1.0) para calmar el dibujo.
const GRAINS = [
    'M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z',
    'M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z',
    'M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z',
    'M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z',
    'M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z',
];

const WheatFilledIcon = ({ size = 24, vein = '#022C22' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        shapeRendering="geometricPrecision"
        style={{ display: 'block' }}
    >
        {/* Tallo ("rabito") — más grueso y verde brillante para que resalte. */}
        <path d="M4 20 16 8" stroke="#34D399" strokeWidth="2.2" strokeLinecap="round" />
        {/* Granos — relleno verde vivo + venas finas para nitidez sin ruido */}
        {GRAINS.map((d, i) => (
            <path
                key={i}
                d={d}
                fill="currentColor"
                stroke={vein}
                strokeWidth="1.0"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        ))}
    </svg>
);

WheatFilledIcon.propTypes = {
    size: PropTypes.number,
    vein: PropTypes.string,
};

export default WheatFilledIcon;
