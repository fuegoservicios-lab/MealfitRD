// [BRAND-LOGO-MARK · 2026-07-11] Logo reutilizable: isotipo (símbolo) + wordmark
// "MealfitRD". El símbolo es un PNG transparente servido desde /public.
//
// Por ahora usa SOLO la variante `dark` (símbolo indigo claro): se lee muy bien
// sobre fondo oscuro —el default de la app— y de forma aceptable sobre claro.
// Cuando exista `mealfit-mark-light.png` se añade aquí el toggle por tema
// (CSS driven por html[data-theme]) sin tocar los ~10 callsites.
//
// El texto hereda `color` del contenedor (que ya resuelve claro/oscuro); solo la
// R (var(--primary)) y la D (var(--accent)) llevan color de marca propio — igual
// que el wordmark de texto que reemplaza.
import PropTypes from 'prop-types';

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
            alt={showText ? '' : 'MealfitRD'}
            aria-hidden={showText ? 'true' : undefined}
            draggable="false"
            style={{ height: markHeight, width: 'auto', display: 'block', flex: 'none' }}
        />
        {showText && (
            <span>
                Mealfit
                <span style={{ color: 'var(--primary)' }}>R</span>
                <span style={{ color: 'var(--accent)' }}>D</span>
            </span>
        )}
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
