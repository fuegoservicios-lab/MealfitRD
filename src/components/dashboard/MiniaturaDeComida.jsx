// [P1-PLAN-LOTE-721 · 2026-09-28] La miniatura de la foto de un plato registrado, en su fila del contador y del cajón de
// días anteriores. La foto vive solo en este dispositivo (`utils/fotosDeComidas.js`); sin foto no pinta nada. Es
// decorativa: el nombre del plato ya está en la fila, así que no lleva texto alternativo.
import PropTypes from 'prop-types';
import { useFotoDeComida } from '../../hooks/useFotosDeComidas';

const MiniaturaDeComida = ({ userId, mealId, className }) => {
    const url = useFotoDeComida(userId, mealId, 'mini');
    if (!url) return null;
    return <img src={url} alt="" aria-hidden="true" className={className} width={36} height={36} decoding="async" />;
};

MiniaturaDeComida.propTypes = {
    userId: PropTypes.string,
    mealId: PropTypes.string,
    className: PropTypes.string,
};

export default MiniaturaDeComida;
