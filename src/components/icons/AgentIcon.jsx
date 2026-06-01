import PropTypes from 'prop-types';

/**
 * Ícono de "Agente" — robot de cabeza grande (ocupa casi todo el viewBox),
 * antena corta con bombillo, ojos circulares amplios, sonrisa y orejas
 * laterales. Reemplazo del genérico `Bot` de lucide-react por algo con más
 * carácter y proporción. API compatible con lucide (size / strokeWidth /
 * color → currentColor por default) y, a diferencia de RecipesIcon, reenvía
 * `className` para que herede las transiciones de la tab bar (.tabIcon).
 */
const AgentIcon = ({ size = 24, strokeWidth = 2, color = 'currentColor', className }) => {
    // Detalle fino (orejas/antena) un poco más delgado que el contorno.
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
            {/* Antena corta: tallo + bombillo */}
            <line
                x1="12" y1="1.5" x2="12" y2="4"
                stroke={color}
                strokeWidth={detail}
                strokeLinecap="round"
            />
            <circle cx="12" cy="1.5" r="1" fill={color} stroke="none" />

            {/* Cabeza grande — ocupa casi todo el alto/ancho */}
            <rect
                x="2.5" y="4" width="19" height="17" rx="5"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
            />

            {/* Orejas laterales */}
            <line
                x1="2.5" y1="11" x2="0.75" y2="11"
                stroke={color}
                strokeWidth={detail}
                strokeLinecap="round"
            />
            <line
                x1="2.5" y1="14" x2="0.75" y2="14"
                stroke={color}
                strokeWidth={detail}
                strokeLinecap="round"
            />
            <line
                x1="21.5" y1="11" x2="23.25" y2="11"
                stroke={color}
                strokeWidth={detail}
                strokeLinecap="round"
            />
            <line
                x1="21.5" y1="14" x2="23.25" y2="14"
                stroke={color}
                strokeWidth={detail}
                strokeLinecap="round"
            />

            {/* Ojos amplios */}
            <circle cx="8.5" cy="11.5" r="1.7" fill={color} stroke="none" />
            <circle cx="15.5" cy="11.5" r="1.7" fill={color} stroke="none" />

            {/* Boca: sonrisa */}
            <path
                d="M 8.5 16 Q 12 18.3 15.5 16"
                stroke={color}
                strokeWidth={detail}
                strokeLinecap="round"
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
