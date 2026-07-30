// [BRAND-LOGO-MARK · 2026-07-11] Logo reutilizable: isotipo (símbolo) + wordmark
// "Bioboros". El símbolo es un PNG transparente servido desde /public.
//
// Por ahora usa SOLO la variante `dark` (símbolo indigo claro): se lee muy bien
// sobre fondo oscuro —el default de la app— y de forma aceptable sobre claro.
// Cuando exista `mealfit-mark-light.png` se añade aquí el toggle por tema
// (CSS driven por html[data-theme]) sin tocar los ~10 callsites.
//
// [P2-WORDMARK-BIOBOROS · 2026-07-30] El texto ya NO se escribe aquí: delega en
// `<Wordmark/>`. Este archivo era el ÚNICO de los 12 que renderizaban el
// wordmark cuyo markup estaba en líneas separadas, así que el rebrand
// automático (que buscaba los tres fragmentos adyacentes) no lo alcanzó — y
// como es el componente COMPARTIDO, el usuario siguió viendo "Mealfit" en el
// sidebar y el header de una app ya rebrandeada. Delegar en un solo sitio hace
// que ese fallo no pueda repetirse.
import PropTypes from 'prop-types';
import Wordmark from './Wordmark';

export const Logo = ({
    showText = true,
    markHeight = '1.75em',
    gap = '0.18em',
    className = '',
    style = {},
}) => (
    <span
        className={className}
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: showText ? gap : 0,
            lineHeight: 1,
            ...style,
        }}
    >
        <img
            src="/mealfit-mark-dark.png?v=1"
            alt={showText ? '' : 'Bioboros'}
            aria-hidden={showText ? 'true' : undefined}
            draggable="false"
            style={{ height: markHeight, width: 'auto', display: 'block', flex: 'none' }}
        />
        {showText && <Wordmark />}
    </span>
);

Logo.propTypes = {
    showText: PropTypes.bool,
    markHeight: PropTypes.string,
    gap: PropTypes.string,
    className: PropTypes.string,
    style: PropTypes.object,
};

export default Logo;
