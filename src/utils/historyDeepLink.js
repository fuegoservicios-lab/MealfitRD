// [P1-HIST-MODAL-DEEPLINK · 2026-08-14] El modal de detalle del Historial vive
// en la URL (`?plan=<id>`), así que sobrevive a un refresh.
//
// El owner: «cuando refresco la página con esto abierto se me quita, y no
// debería quitarse». El modal era estado local del componente y un refresh lo
// borra por definición. Ponerlo en la URL lo arregla y, de paso, hace que el
// botón Atrás lo cierre (que es lo que uno espera de un modal) y que el enlace
// se pueda compartir.
//
// Este helper decide QUÉ hacer al llegar con un `?plan=` puesto. Existe por un
// caso que se cuela fácil: mientras la lista de planes está cargando, `plans`
// es un array vacío — pero eso NO significa que el plan no exista, significa
// que todavía no se sabe. Concluir «no existe» ahí borraría el parámetro y
// mataría la restauración justo en el refresh que la motivó. Es la misma clase
// de error que se cerró esta semana en el aviso de la Nevera: una ausencia de
// datos leída como un dato.

/**
 * @param {string|null} idUrl        valor de `?plan=`
 * @param {Array}       plans        lista de planes (puede estar a medio cargar)
 * @param {boolean}     listaLista   la lista ya terminó de cargar
 * @returns {{accion: 'nada'|'esperar'|'abrir'|'limpiar', plan?: object}}
 */
export const resolverPlanDeUrl = (idUrl, plans, listaLista) => {
    if (!idUrl) return { accion: 'nada' };
    const lista = Array.isArray(plans) ? plans : [];
    const plan = lista.find((p) => p && String(p.id) === String(idUrl));
    if (plan) return { accion: 'abrir', plan };
    // Sin el plan a la vista: solo es «no existe» si la lista ya está completa.
    return { accion: listaLista ? 'limpiar' : 'esperar' };
};

// [P1-HIST-MODAL-ONE-CLICK · 2026-08-20] Hacía falta darle DOS veces a la X.
//
// El cierre hacía dos escrituras —`setSelectedPlan(null)` y `setSearchParams(...)`—
// y NO caen en el mismo render. Medido con una sonda:
//
//   1. {selected: null,  planUrl: 'aaa'}   ← se limpia la selección…
//   2. {selected: 'aaa', planUrl: 'aaa'}   ← …la URL aún no, y el efecto REABRE
//   3. {selected: 'aaa', planUrl: null}    ← la URL se limpia tarde; ya hay selección
//
// El segundo clic sí cerraba porque para entonces la URL ya estaba limpia. Es
// exactamente el modo de fallo que el comentario de arriba anticipaba: la
// mitigación existía, pero dependía de que las dos escrituras cayeran juntas.
//
// La salida es UN SOLO ESCRITOR: quien cierra (la X, el overlay, ESC, el borrado)
// solo quita el plan de la URL, y este helper decide qué hace el estado. Así el
// cierre por botón y el cierre por «Atrás» recorren el MISMO camino — y de paso
// arregla el Atrás, porque no existía ningún camino que cerrara al perder el
// parámetro: el único efecto que miraba la URL solo sabía ABRIR.
//
// El caso `otro plan en la URL` (Atrás entre dos detalles) tampoco funcionaba: se
// ignoraba con un `if (selectedPlan) return` y el modal seguía mostrando el plan
// viejo mientras la URL apuntaba a otro.

/**
 * Decide qué debe hacer el ESTADO del modal para seguir a la URL, que es la
 * fuente de verdad.
 *
 * @param {string|null} idUrl        valor de `?plan=`
 * @param {object|null} seleccionado el plan abierto en estado, si lo hay
 * @param {Array}       plans        lista de planes (puede estar a medio cargar)
 * @param {boolean}     listaLista   la lista ya terminó de cargar
 * @returns {{accion: 'nada'|'esperar'|'abrir'|'cerrar'|'limpiar', plan?: object}}
 */
export const resolverSincronizacionModal = (idUrl, seleccionado, plans, listaLista) => {
    if (!seleccionado) return resolverPlanDeUrl(idUrl, plans, listaLista);
    // Hay modal abierto: la URL manda.
    if (!idUrl) return { accion: 'cerrar' };
    if (String(seleccionado.id) === String(idUrl)) return { accion: 'nada' };
    // Apunta a OTRO plan. Si aún no está en la lista NO se cierra ni se cambia:
    // una ausencia de datos no es un dato (misma lección que `resolverPlanDeUrl`).
    const lista = Array.isArray(plans) ? plans : [];
    const plan = lista.find((p) => p && String(p.id) === String(idUrl));
    return plan ? { accion: 'abrir', plan } : { accion: 'nada' };
};
