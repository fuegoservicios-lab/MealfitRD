// [P1-PLAN-LOTE-702 · 2026-09-28] El país del perfil para la lectura, sin la tabla de nombres.
//
// Lo FIJA `AssessmentContext` (JS de arranque) y lo LEEN `nombresDelPais.js` (glosa de nombres, °F) y las páginas.
// Vive aparte para que el arranque no cargue `nombresPorPais.json` ni el glosador sólo por fijar un código.
let _paisUsuario = null;

/** El país del perfil (código ISO de 2 letras) o null. Qué país tiene tabla de nombres lo decide `nombresDelPais`. */
export function setPaisDeLectura(pais) {
    const p = typeof pais === 'string' ? pais.trim().toUpperCase() : '';
    _paisUsuario = /^[A-Z]{2}$/.test(p) ? p : null;
}

export const getPaisDelUsuario = () => _paisUsuario;

/**
 * [P1-PLAN-LOTE-703 · 2026-09-28] (G85) La etiqueta BCP-47 con la que se formatea una cantidad que decide el PAÍS:
 * el idioma del usuario con la región de su país (`es` + ES → `es-ES`, `en` + CO → `en-CO`). Sin país válido, el
 * idioma tal cual. Sólo para lo que produce el motor de países (la cantidad métrica de la lista); el resto del
 * formato (horas, fechas, kcal) sigue al idioma.
 */
export const formatRegionFor = (country, locale) => {
    const idioma = typeof locale === 'string' ? locale.split('-')[0] : '';
    const region = typeof country === 'string' ? country.trim().toUpperCase() : '';
    return idioma && /^[A-Z]{2}$/.test(region) ? `${idioma}-${region}` : locale;
};
