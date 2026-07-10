// [P2-10 · 2026-07-09] Primitiva Skeleton compartida y theme-aware. Los
// loading-states se re-implementaban por página (~6 shimmers distintos:
// History.module.css ×2, Dashboard inline <style>, SidebarRecientes,
// Login.css, Supermarket.module.css) con colores light hardcodeados que
// flasheaban en dark. Esta primitiva usa tokens (dark gratis) y el
// @keyframes shimmer global de index.css. Migración incremental: UI nueva
// la usa; la existente se migra boy-scout.
import PropTypes from 'prop-types';

/**
 * @param {object} props
 * @param {string|number} [props.width='100%']  Ancho CSS.
 * @param {string|number} [props.height='1rem'] Alto CSS.
 * @param {boolean} [props.circle=false]        Redondo (avatares).
 * @param {object}  [props.style]               Overrides inline.
 */
const Skeleton = ({ width = '100%', height = '1rem', circle = false, style, ...rest }) => (
    <span
        className="mf-skeleton"
        aria-hidden="true"
        style={{
            width,
            height,
            ...(circle ? { borderRadius: '9999px' } : null),
            ...style,
        }}
        {...rest}
    />
);

Skeleton.propTypes = {
    width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    circle: PropTypes.bool,
    style: PropTypes.object,
};

export default Skeleton;
