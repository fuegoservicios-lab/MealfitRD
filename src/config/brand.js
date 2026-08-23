// [P3-I18N-WORDMARK-SIN-COMPONENTE · 2026-08-22] El texto de la marca, sin componente al lado.
//
// POR QUÉ ESTE FICHERO EXISTE Y NO ES `Wordmark.jsx`
//
// `P2-PDF-WORDMARK-EN-CADENA` metió tres constantes (`WORDMARK_TEXT`,
// `WORDMARK_LETTER_SPACING`, `wordmarkHtml`) dentro de `Wordmark.jsx`, que exporta además el
// componente. Eso dispara `react-refresh/only-export-components`: un módulo que mezcla
// componentes con otras exportaciones rompe el Fast Refresh de Vite — al editar la constante,
// el módulo entero se recarga y el estado del árbol se pierde.
//
// El warning subió el conteo de eslint de 66 a 67, y el gate corre con `--max-warnings 66`.
// Eslint es el PASO 1 del job `quality`: aborta los ocho siguientes, incluido el gate de
// i18n, que ya estuvo 25 corridas sin ejecutarse por esta misma causa
// (`P1-CI-QUALITY-ABORTADO`). La salida fácil habría sido subir el tope a 67; es una de las
// seis formas documentadas de que un gate diga que sí sin comprobar nada, y además habría
// dejado el defecto de Fast Refresh vivo.
//
// La invariante que `Wordmark.jsx` protege sigue intacta y es la de siempre: **UNA sola copia
// del texto de la marca**. El rebrand de julio dejó una de doce sin actualizar y el usuario
// vio «Mealfit» en la app ya renombrada. Que la copia viva aquí en vez de allí no la duplica
// — la mueve, y los guards apuntan a este fichero.

export const WORDMARK_TEXT = 'Bioboros';
export const WORDMARK_LETTER_SPACING = '-0.03em';

/**
 * El wordmark como HTML, para los documentos que se construyen como CADENA.
 *
 * El PDF de receta se arma con `html2pdf`, que recibe HTML y no JSX: escribir `<Wordmark />`
 * dentro de un template literal no instancia nada — el navegador lee una etiqueta desconocida
 * y vacía, y la cabecera sale sin marca. Ningún test de render puede verlo, porque ahí no hay
 * render. Por eso la cadena se compone con esto y no a mano.
 */
export const wordmarkHtml = (estiloExtra = '') =>
    `<span style="letter-spacing: ${WORDMARK_LETTER_SPACING};${estiloExtra}">${WORDMARK_TEXT}</span>`;
