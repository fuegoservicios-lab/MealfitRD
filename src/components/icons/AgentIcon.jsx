import PropTypes from 'prop-types';

/**
 * Ícono de "Agente" — robot moderno y limpio. [P3-AGENT-ICON-QUALITY · 2026-06-19]
 * Rediseño del anterior (cabeza cuadrada, ojos punto, orejas-stub sueltas) por
 * algo más definido y balanceado: cabeza bien proporcionada (16×15, centrada),
 * antena con bombillo, orejas conectadas, OJOS tipo pantalla (rounded-square,
 * look "AI" digital) y una sonrisa sutil. Geometría alineada al grid de 24 para
 * que renderice nítido a tamaños pequeños (sidebar / tab bar).
 *
 * API compatible con lucide (size / strokeWidth / color → currentColor por
 * default) y reenvía `className` para heredar las transiciones de la tab bar.
 */
const AgentIcon = ({ size = 24, strokeWidth = 2, color = 'currentColor', className }) => {
    // Detalle fino (antena/orejas/boca) un poco más delgado que el contorno.
    const detail = Math.max(strokeWidth * 0.85, 1);
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ display: 'block' }}
            aria-hidden="true"
        >
            {/* Antena: tallo + bombillo */}
            <line
                x1="12" y1="1.6" x2="12" y2="4"
                stroke={color}
                strokeWidth={detail}
                strokeLinecap="round"
            />
            <circle cx="12" cy="1.4" r="1.05" fill={color} stroke="none" />

            {/* Cabeza — rounded rect centrada, ligeramente más ancha que alta */}
            <rect
                x="4" y="4" width="16" height="15" rx="4.2"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
            />

            {/* Orejas — stubs cortos conectados a los lados de la cabeza */}
            <line
                x1="4" y1="11.5" x2="2.3" y2="11.5"
                stroke={color}
                strokeWidth={detail}
                strokeLinecap="round"
            />
            <line
                x1="20" y1="11.5" x2="21.7" y2="11.5"
                stroke={color}
                strokeWidth={detail}
                strokeLinecap="round"
            />

            {/* Ojos tipo pantalla — rounded-square, look digital/AI */}
            <rect x="7.8" y="9.5" width="2.7" height="3.1" rx="1.05" fill={color} stroke="none" />
            <rect x="13.5" y="9.5" width="2.7" height="3.1" rx="1.05" fill={color} stroke="none" />

            {/* Boca — sonrisa sutil */}
            <path
                d="M 9.6 15.3 Q 12 16.7 14.4 15.3"
                stroke={color}
                strokeWidth={detail}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
};

AgentIcon.propTypes = {
    size: PropTypes.number,
    strokeWidth: PropTypes.number,
    color: PropTypes.string,
    className: PropTypes.string,
};

export default AgentIcon;
