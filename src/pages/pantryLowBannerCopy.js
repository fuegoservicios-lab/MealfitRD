/**
 * [P1-PANTRY-LOW-BANNER-TRACKING · 2026-08-14] SSOT del texto del banner «tu
 * nevera está baja».
 *
 * POR QUÉ UN MÓDULO PARA UNA FRASE. Vivía escrita a mano en los DOS shells de
 * `Pantry.jsx` — y ya habían driftado: el de escritorio prometía «tus próximas
 * listas de mantenimiento comprarán lo que falte automáticamente» y el móvil, no.
 * Arreglar solo el que salió en la captura del dueño habría dejado vivo el otro,
 * que dice la misma mentira más corta. Un texto en dos sitios es un texto que
 * volverá a divergir.
 *
 * LA MENTIRA QUE CIERRA. Las listas de mantenimiento las produce el
 * `_chunk_worker`, y su pickup está cerrado en modo contador
 * (`PICKUP_GATE_SQL: … AND NOT EXISTS (… plan_mode='tracking')`). Con la
 * generación apagada no viene ninguna lista: el usuario dejaba la nevera baja
 * confiando en una reposición que no existe.
 *
 * LO QUE SE CONSERVA. El HECHO (tienes N alimentos, se recomiendan ~M) es verdad
 * en los dos modos y sigue siendo útil en el contador: con la nevera vacía hay
 * menos que registrar y menos que escanear. Lo que se cae en pausa es la razón
 * prestada al plan y la promesa de compra automática.
 */

/**
 * @param {{meaningful_count?: number, recommended_target?: number}} estado
 *        `pantryStatus` tal cual lo devuelve el backend.
 * @param {boolean} enModoContador  veredicto de `isTrackingMode` (SSOT
 *        config/dashboardNav.js). No se calcula aquí: un segundo criterio de modo
 *        driftaría del de la nav, que es justo el error que este P-fix corrige.
 */
export function textoNeveraBaja(estado, enModoContador) {
    const n = estado?.meaningful_count ?? 0;
    const objetivo = estado?.recommended_target || 20;
    const unidad = n === 1 ? 'alimento' : 'alimentos';
    const hecho = `Tu nevera está baja (tienes ${n} ${unidad}).`;

    if (enModoContador) {
        // Ni «plan» ni «lista» ni «automáticamente»: nada de eso ocurre ahora.
        // La razón que se ofrece es una que la Nevera SÍ sostiene por sí sola.
        return `${hecho} Con más ingredientes registrados, escanear y anotar lo que comes te cuesta menos.`;
    }
    return `${hecho} Te recomendamos tener ~${objetivo} para que tus planes aprovechen mejor tu nevera. `
        + 'Mientras tanto, tus próximas listas de mantenimiento comprarán lo que falte automáticamente.';
}
