import PropTypes from 'prop-types';

/**
 * [ICONOS-FAMILIA · 2026-11-14] Icono del Coach en el menú: el mismo emblema que su avatar (`BotAvatar`, COACH-EMBLEMA)
 * — un anillo abierto que se cierra sobre su cabeza — en vez del robot con antena y sonrisa. Así la pestaña y la
 * conversación son la misma marca.
 *
 * API compatible con lucide (`size`, `strokeWidth`, `color` → currentColor) y reenvía `className`.
 */
const AgentIcon = ({ size = 24, strokeWidth = 2, color = 'currentColor', className }) => (
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
        <circle cx="12" cy="12" r="4" fill={color} fillOpacity="0.3" />
        <g transform="rotate(-32 12 12)">
            {/* anillo abierto: el hueco queda justo antes de la cabeza */}
            <circle
                cx="12" cy="12" r="8.2"
                stroke={color} strokeWidth={strokeWidth + 0.3} strokeLinecap="round"
                strokeDasharray="40.8 10.72"
            />
            <circle cx="20.2" cy="12" r="2.1" fill={color} />
        </g>
    </svg>
);

AgentIcon.propTypes = {
    size: PropTypes.number,
    strokeWidth: PropTypes.number,
    color: PropTypes.string,
    className: PropTypes.string,
};

export default AgentIcon;
