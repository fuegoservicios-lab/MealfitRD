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
//     viejo escrito en el árbol.
//   · Recorte: el PNG traía el glifo en el 45% central de un lienzo de
//     1254×1254; el resto era transparencia. Sin recortar hay que darle una caja
//     el doble de alta y compensar con márgenes negativos.
//   · Peso: 47,7 KB → 4,9 KB (128 px, RGB plano y alfa intacto).
//
// ─────────────────────────────────────────────────────────────────────────────
// EL COLOR ES ÍNDIGO POR DECISIÓN DEL DUEÑO — NO LO PASES A MONOCROMO
//
// [2026-08-14, tras verlo en producción] Se probó la variante monocroma: el PNG
// como máscara CSS y la tinta heredada del wordmark con `currentColor`. El
// argumento técnico era bueno y sigue siendo cierto:
//   · el wordmark es monocromo por decisión previa suya (P2-WORDMARK-BIOBOROS
//     descartó bicolor índigo+rosa y las tres «o» en verde), así que un símbolo
//     de color reintroduce por el símbolo el acento rechazado en las letras;
//   · medido sobre el sidebar oscuro, la palabra da 15,11:1 contra el fondo y el
//     símbolo índigo 5,18:1 — 2,9× más débil;
//   · con máscara, el tema claro resolvía su tinta solo (el índigo ahí da
//     3,42:1: pasa el mínimo de 3:1 para elemento no textual, pero se ve suave).
//
// El dueño vio las dos en la app y eligió el ÍNDIGO. Es su marca y es una
// decisión de producto, no un descuido: el símbolo aporta el único color de la
// pantalla de marca y a él le gusta así. Si vuelves con «el logo debería ser
// monocromo», ya se discutió con las dos versiones desplegadas delante.
// ─────────────────────────────────────────────────────────────────────────────
//
// NO lleva `alt` descriptivo a propósito: va SIEMPRE acompañado del wordmark,
// que ya dice «Bioboros». Un `alt="Bioboros"` haría que un lector de pantalla
// anunciara la marca dos veces seguidas; el símbolo es decorativo en ese par.
import PropTypes from 'prop-types';

export const BrandMark = ({ size = '1.15em', className = '', style = {} }) => (
    <img
        src="/bioboros-mark.png"
        alt=""
        aria-hidden="true"
        width={128}
        height={128}
        className={className}
        style={{
            height: size,
            width: 'auto',
            display: 'block',
            flexShrink: 0,
            ...style,
        }}
    />
);

BrandMark.propTypes = {
    size: PropTypes.string,
    className: PropTypes.string,
    style: PropTypes.object,
};

export default BrandMark;
