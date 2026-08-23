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
// EL DISEÑO: MONOCROMO
// Decisión del owner (2026-07-30) tras ver dos versiones en vivo. Se
// descartaron, en este orden:
//
//   1. Bicolor indigo + rosa. Venía de "MealfitRD", donde "RD" era el país y
//      separarlo SIGNIFICABA algo. Heredado a "Bioboros" el corte quedaba en
//      "b" + "oros" — un recurso estructural que no codifica nada.
//   2. Las tres "o" en verde. La idea era que Bi·o·b·o·r·o·s tiene tres "o"
//      alternas y un ouroboros es un anillo cerrado, en un producto que es
//      cíclico de verdad. Conceptualmente cerraba; visualmente no le gustó.
//
// Queda monocromo: una sola tinta (`--text-main`) y el tracking cerrado
// (-0.03em) como único recurso. La marca no necesita colorear letras para
// verse seria — es lo que hacen Linear, Vercel o Stripe. Un wordmark que no
// depende de un acento tampoco depende de que el tema lo resuelva bien, así
// que funciona igual en claro y en oscuro sin condicionales.
//
// NO reintroducir acentos de color aquí sin hablarlo: es la tercera versión y
// las dos anteriores se descartaron por eso mismo.
import PropTypes from 'prop-types';

// [P2-PDF-WORDMARK-EN-CADENA · 2026-08-22 · movido a `config/brand.js` el mismo día]
//
// El PDF de receta se construye como CADENA (`html2pdf` recibe HTML, no JSX), y ahí
// dentro alguien escribió `<Wordmark />`. Un template literal no instancia nada: el
// navegador leyó una etiqueta desconocida, vacía, y la cabecera del documento salió SIN
// marca. Ningún test de render podía verlo porque ahí no hay render.
//
// El texto, su tracking y el helper `wordmarkHtml()` viven en `src/config/brand.js` —
// un módulo SIN componente. [P3-I18N-WORDMARK-SIN-COMPONENTE] Exportarlos desde AQUÍ
// mezclaba componente y constantes en un mismo módulo, que es lo que dispara
// `react-refresh/only-export-components` y rompe el Fast Refresh de Vite. La invariante
// que este fichero protege no cambia: UNA sola copia del texto de la marca. Se movió,
// no se duplicó — y NO la reexportes desde aquí, porque el warning vuelve.
import { WORDMARK_LETTER_SPACING, WORDMARK_TEXT } from '../../config/brand';

export const Wordmark = ({ className = '', style = {} }) => (
    <span
        className={className}
        style={{ letterSpacing: WORDMARK_LETTER_SPACING, ...style }}
    >
        {WORDMARK_TEXT}
    </span>
);

Wordmark.propTypes = {
    className: PropTypes.string,
    style: PropTypes.object,
};

export default Wordmark;
