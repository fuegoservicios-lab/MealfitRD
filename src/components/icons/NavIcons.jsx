import PropTypes from 'prop-types';

/**
 * [ICONOS-FAMILIA · 2026-11-14] Iconos del menú (lateral y barra inferior) dibujados como UNA familia.
 *
 * Antes cada pestaña traía su glifo de un sitio distinto (lucide a trazo fino, un robot propio, un libro propio) y
 * el conjunto se veía genérico. Aquí todos comparten la misma receta: rejilla de 24, trazo redondeado, y un relleno
 * suave del mismo color (`TINTE`) en la parte que da cuerpo al dibujo. Con eso leen igual de nítidos a 20 px y la
 * pestaña activa gana presencia sin cambiar de icono.
 *
 * API compatible con lucide: `size`, `strokeWidth`, `color` (currentColor por defecto), `className`.
 */
export const TINTE = 0.3;

const propTypes = {
    size: PropTypes.number,
    strokeWidth: PropTypes.number,
    color: PropTypes.string,
    className: PropTypes.string,
};

function Lienzo({ size = 24, strokeWidth = 2, color = 'currentColor', className, children }) {
    return (
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
            {children}
        </svg>
    );
}
Lienzo.propTypes = { ...propTypes, children: PropTypes.node };

/** Plan / inicio: tablero de tres piezas, la alta con cuerpo. */
export function PlanIcon(props) {
    const c = props.color || 'currentColor';
    return (
        <Lienzo {...props}>
            <rect x="3" y="3" width="8" height="18" rx="2.6" fill={c} fillOpacity={TINTE} />
            <rect x="14" y="3" width="7" height="7" rx="2.4" />
            <rect x="14" y="13.5" width="7" height="7.5" rx="2.4" fill={c} fillOpacity={TINTE} />
        </Lienzo>
    );
}
PlanIcon.propTypes = propTypes;

/** Progreso: tres barras que suben; la más alta con cuerpo. */
export function ProgressIcon(props) {
    const c = props.color || 'currentColor';
    return (
        <Lienzo {...props}>
            <rect x="3.2" y="13" width="4.6" height="8" rx="1.7" />
            <rect x="9.7" y="8" width="4.6" height="13" rx="1.7" fill={c} fillOpacity={TINTE} />
            <rect x="16.2" y="3" width="4.6" height="18" rx="1.7" fill={c} fillOpacity={TINTE * 1.8} />
        </Lienzo>
    );
}
ProgressIcon.propTypes = propTypes;

/** Nevera: dos puertas, el congelador con cuerpo, y sus tiradores. */
export function PantryIcon(props) {
    const c = props.color || 'currentColor';
    return (
        <Lienzo {...props}>
            <path d="M8.5 2.5h7A3.5 3.5 0 0 1 19 6v3.5H5V6a3.5 3.5 0 0 1 3.5-3.5Z" fill={c} fillOpacity={TINTE} stroke="none" />
            <rect x="5" y="2.5" width="14" height="19" rx="3.5" />
            <path d="M5 9.5h14" />
            <path d="M8.7 5.4v1.4M8.7 12.6v3" />
        </Lienzo>
    );
}
PantryIcon.propTypes = propTypes;

/** Historial: el reloj que vuelve atrás. */
export function HistoryIcon(props) {
    const c = props.color || 'currentColor';
    return (
        <Lienzo {...props}>
            <circle cx="12" cy="12" r="9" fill={c} fillOpacity={TINTE} stroke="none" />
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3.2V8h4.8" />
            <path d="M12 7.4V12l3.2 1.9" />
        </Lienzo>
    );
}
HistoryIcon.propTypes = propTypes;
