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
