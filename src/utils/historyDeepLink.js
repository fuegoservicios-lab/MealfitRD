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
