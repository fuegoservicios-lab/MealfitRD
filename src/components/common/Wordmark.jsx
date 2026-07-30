// [P2-WORDMARK-BIOBOROS · 2026-07-30] SSOT del wordmark "Bioboros".
//
// POR QUÉ EXISTE ESTE COMPONENTE
// El wordmark estaba escrito a mano en 12 sitios (11 inline + Logo.jsx). Al
// renombrar la marca, 11 se actualizaron y UNO no: `Logo.jsx` —el compartido,
// el que usan el sidebar y el header— tenía los tres fragmentos en LÍNEAS
// SEPARADAS, y el patrón que buscaba `Mealfit<span>R</span><span>D</span>`
// adyacentes no lo alcanzó. Resultado: el usuario vio "Mealfit" en la app ya
// rebrandeada. Doce copias de una marca garantizan que la próxima vez pase
// otra vez; esta es la única.
//
// EL DISEÑO
// El bicolor anterior (indigo + rosa) venía de "MealfitRD", donde "RD" era el
// país y separarlo SIGNIFICABA algo. Heredado a "Bioboros" el corte quedó en
// "b" + "oros": un recurso estructural que no codifica nada, y por eso se leía
// genérico.
//
// La palabra trae algo mejor: **Bi·o·b·o·r·o·s tiene tres "o" alternas**. Un
// ouroboros es un anillo cerrado, y este producto ES cíclico — ciclos de plan
// de 7/15/30 días, la ventana que rota cada día, y el bucle
// comprar→nevera→consumir→comprar. Tres anillos repartidos por la palabra, en
// un producto de ciclos: la estructura codifica algo verdadero en vez de
// decorar.
//
// Color: un solo acento, `--secondary` (emerald), que el sistema ya usa para
// los estados "en verde" (micros al día, dentro de presupuesto). Es el color
// de "bio" y NO se inventa nada nuevo. El cuerpo va en `--text-main`.
// El tracking cerrado (-0.03em) hace que se lea como una marca, no como una
// palabra suelta.
import PropTypes from 'prop-types';

/** Las tres "o" del nombre — los anillos. Único acento del wordmark. */
const O = () => <span style={{ color: 'var(--secondary)' }}>o</span>;

export const Wordmark = ({ className = '', style = {} }) => (
    <span
        className={className}
        style={{ letterSpacing: '-0.03em', ...style }}
    >
        Bi<O />b<O />r<O />s
    </span>
);

Wordmark.propTypes = {
    className: PropTypes.string,
    style: PropTypes.object,
};

export default Wordmark;
