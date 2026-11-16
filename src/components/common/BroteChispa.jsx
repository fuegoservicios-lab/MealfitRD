// [P1-PLAN-LOTE-1049 · 2026-11-16] El icono de «la IA hace algo por ti», propio de Bioboros.
//
// Sustituye al destello de cuatro puntas de lucide (`Sparkles`): el dueño lo leía como el logo de Gemini, y en una app
// que solo usa proveedores occidentales y tiene su propia marca no debe parecer la de otro. El dibujo es el BROTE de la
// marca (el mismo de la tarjeta compartida y del icono de la app: tallo, dos hojas y el capullo) con el capullo
// «encendido»: tres rayitas cortas que salen de él. Es una idea que brota, no una estrella.
//
// Misma interfaz que un icono de lucide (`size`, `strokeWidth`, `color`, `className` y el resto al <svg>), así sirve
// donde ya había un `<Sparkles …/>` o un `Icon: Sparkles`, sin tocar el CSS que lo pinta (`currentColor`).
import PropTypes from 'prop-types';

const BroteChispa = ({ size = 24, strokeWidth = 2, color = 'currentColor', className = '', ...rest }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className ? `brote-chispa ${className}` : 'brote-chispa'}
        aria-hidden="true"
        {...rest}
    >
        <path d="M12 21.2v-8.4" />
        <path d="M12 12.8c0-3.4-2.7-5.3-7.1-5.3 0 3.4 2.7 5.3 7.1 5.3z" />
        <path d="M12 12.8c0-3.4 2.7-5.3 7.1-5.3 0 3.4-2.7 5.3-7.1 5.3z" />
        <circle cx="12" cy="5.6" r="1.6" fill={color} stroke="none" />
        {/* los rayos salen DEL capullo (radiales a su centro) y son trazos, no puntos: con extremos redondeados un
            tramo de medio píxel se leía como una gota a 48 px */}
        <path d="M12 2.7V1.2" strokeWidth={Number(strokeWidth) * 0.8} />
        <path d="M9.9 3.6 8.8 2.5" strokeWidth={Number(strokeWidth) * 0.8} />
        <path d="M14.1 3.6l1.1-1.1" strokeWidth={Number(strokeWidth) * 0.8} />
    </svg>
);

BroteChispa.propTypes = {
    size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    strokeWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    color: PropTypes.string,
    className: PropTypes.string,
};

export default BroteChispa;
