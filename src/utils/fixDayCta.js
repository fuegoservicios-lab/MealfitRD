// [P1-FIX-DAY-ONLY-IF-SODIUM · 2026-08-05] ¿Aplica el botón "Arreglar este día"?
//
// El motivo `micro_worst_day_ceiling` cubre CUATRO techos (sodio, azúcar añadida,
// grasa saturada y potasio renal), pero el endpoint que hay detrás del botón solo
// sabe arreglar UNO: sodio. Para los otros tres devuelve `ceiling_not_sodium` y lo
// único que el usuario obtiene por su clic es un mensaje diciéndole que el botón no
// servía. Reportado en vivo el 2026-08-05 con un techo de azúcares añadidos: «le doy
// a arreglar día y no pasa nada».
//
// Un control que solo puede fallar en el estado en que se muestra no debería
// mostrarse — misma clase que el CTA de reintento retirado en P2-CHUNK-OVERDUE-SIGNAL.
//
// El dato para decidirlo YA viajaba al cliente sin que nadie lo mirara:
// `_quality_degraded_panel_detail` trae `"día N: <nutriente>[,<nutriente>…]"`
// (medido en producción: `"día 1: free_sugars_g"`). Sale de `worst_day.high`
// (graph_orchestrator `_maybe_mark_panel_degraded`), que es EXACTAMENTE la misma
// fuente que el backend relee para decidir `ceiling_not_sodium`. Por eso el gate
// coincide con el criterio real del endpoint y no con una aproximación.
//
// Vive fuera de Dashboard.jsx a propósito: como función pura se puede probar la
// DECISIÓN (esta lista de nutrientes ⇒ ¿botón sí o no?). Dentro del JSX solo se
// podría comprobar que el texto del gate está escrito, que es lo que un test
// parser-based certifica — y esta misma sesión ya dejó tres casos donde eso pasó
// en verde con el arreglo borrado.

/** Nutriente que el endpoint `/fix-sodium-day` sabe corregir. */
const NUTRIENTE_ARREGLABLE = 'sodium';

/**
 * ¿Debe mostrarse "Arreglar este día" para este plan?
 *
 * Solo cuando el aviso es de techo de micros Y el sodio está entre los nutrientes
 * que lo rompieron. Ante cualquier duda (sin detalle, detalle vacío, shape rara)
 * devuelve false: el banner ya dice qué hacer a mano, y esa vía siempre funciona.
 *
 * @param {object|null|undefined} planData
 * @returns {boolean}
 */
export function fixDayCtaApplies(planData) {
    if (!planData || planData._quality_degraded_reason !== 'micro_worst_day_ceiling') {
        return false;
    }
    const detalle = planData._quality_degraded_panel_detail;
    if (typeof detalle !== 'string') return false;
    return detalle.toLowerCase().includes(NUTRIENTE_ARREGLABLE);
}
