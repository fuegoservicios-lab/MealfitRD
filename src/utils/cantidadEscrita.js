// [CI-LINT-2026-11-14] Sale de LogMealModal.jsx: un fichero de componentes que exporta funciones sueltas
// rompe el refresco en caliente (react-refresh/only-export-components). Misma función, sin cambios.
/**
 * [P1-PLAN-LOTE-166 · 2026-09-22] La cantidad tal como se TECLEA, normalizada: la coma decimal pasa a punto («1,5» →
 * «1.5») y lo que no es un número a medio escribir devuelve `null` (no entra). Era un `type="number"`: con un teclado
 * que pone coma (español de España, francés, italiano, portugués) el navegador la rechazaba en silencio, el valor
 * quedaba vacío y la línea contaba 0 g.
 */
export function cantidadEscrita(texto) {
    const v = String(texto ?? '').replace(',', '.');
    return /^\d*\.?\d*$/.test(v) ? v : null;
}
