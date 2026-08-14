// [P1-DASH-BRAND-MARK · 2026-08-14] El isotipo (el brote) junto al wordmark.
//
// HISTORIA, porque el archivo ya murió una vez. El símbolo vivía en
// `public/mealfit-mark-dark.png` con un `Logo.jsx` que lo envolvía, y el
// 2026-08-14 la auditoría del landing lo borró junto con otros dos assets «sin
// un solo consumidor». Era cierto: nadie lo renderizaba. Se recupera del
// historial porque el dueño pidió la marca en el dashboard, no porque el
// borrado fuera un error — un asset sin consumidor SÍ es peso muerto.
//
// QUÉ CAMBIA RESPECTO AL ORIGINAL. Nada del glifo; sí su envase:
//   · Nombre: `bioboros-mark.png`. El anterior decía «mealfit», la marca
//     muerta, y P2-WORDMARK-BIOBOROS ya enseñó lo que cuesta dejar el nombre
//     viejo escrito en el árbol: el rebrand automático no alcanzó a `Logo.jsx`
//     y el usuario vio «Mealfit» en una app ya rebrandeada.
//   · Recorte: el PNG traía el glifo en el 45% central de un lienzo de
//     1254×1254; el resto era transparencia. Sin recortar, para que el símbolo
//     se viera del tamaño del wordmark había que darle una caja el doble de
//     alta y luego pelearse con márgenes negativos. Se quitaron los píxeles
//     vacíos (`getbbox`), no el dibujo.
//   · Peso: 47,7 KB → 12,3 KB (128 px). Importa porque la auditoría que lo
//     borró estaba precisamente recortando el precache del apex.
//
// [P1-BRAND-MARK-MONO · 2026-08-14] La TINTA la pone el CSS, no el PNG: el
// símbolo se pinta con `currentColor` vía máscara (ver BrandMark.module.css).
// Un símbolo índigo junto a un wordmark monocromo reintroducía el acento de
// color que el dueño ya había rechazado dos veces, y además pesaba 2,9× menos
// que la palabra contra el fondo. Con la máscara heredan la misma tinta y el
// tema claro se resuelve solo.
//
// NO lleva `alt` descriptivo a propósito: va SIEMPRE acompañado del wordmark,
// que ya dice «Bioboros». Un `alt="Bioboros"` haría que un lector de pantalla
// anunciara la marca dos veces seguidas; el símbolo es decorativo en ese par.
import PropTypes from 'prop-types';
import styles from './BrandMark.module.css';

export const BrandMark = ({ size = '1.15em', className = '', style = {} }) => (
    <span
        role="presentation"
        aria-hidden="true"
        className={`${styles.marca} ${className}`.trim()}
        style={{ height: size, width: size, ...style }}
    />
);

BrandMark.propTypes = {
    size: PropTypes.string,
    className: PropTypes.string,
    style: PropTypes.object,
};

export default BrandMark;
