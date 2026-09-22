// [P1-PLAN-LOTE-157 · 2026-09-22] El techo de SILENCIO del turno, en el cliente.
//
// EL HUECO. El backend tiene un presupuesto total de 120 s para el turno, pero su comprobación
// vive al principio del bucle `for event in stream_iter`: **solo corre cuando LLEGA un evento**.
// Es la misma limitación que `P2-CHAT-STREAM-INACTIVITY-POSTHOC` documentó para el chequeo de
// inactividad — y que allí se aceptó a propósito, porque abortar por un hueco ya pasado mataba
// turnos vivos con el trabajo ya guardado. Consecuencia: si el grafo se queda mudo de verdad, no
// hay evento que dispare el presupuesto, y el cliente no tenía NINGÚN tope propio: el
// `fetchWithAuth` limpia su temporizador en cuanto llegan las cabeceras (así no rompe el SSE), y
// a partir de ahí el usuario podía quedarse mirando «Pensando…» hasta que se rindiera.
//
// POR QUÉ AHORA SÍ SE PUEDE. Antes del lote 156, abortar desde el cliente era destructivo: el
// backend podía terminar y GUARDAR la respuesta, y el usuario se quedaba con un error sobre una
// respuesta que existía. Desde el 156, un corte de conexión (`0`/`502`) dispara el rescate, que
// pregunta al servidor y adopta la respuesta si llegó. O sea: **el techo se apoya en el rescate**.
// Sin él, esto sería cambiar una espera infinita por una pérdida.
//
// EL UMBRAL ES DELIBERADAMENTE ALTÍSIMO. Un turno legítimo puede callar minutos: la ventana de
// inactividad del servidor se subió a 360 s por env justamente porque un `modify_single_meal`
// con reintento de despensa pasa 2-4 minutos dentro de un nodo sin emitir nada. Cortar a los 60
// o 180 s repetiría el defecto que el POSTHOC tuvo que deshacer. 300 s de silencio ABSOLUTO —ni
// un `progress`, ni un `chunk`, nada— no es un turno lento: es un turno que no va a volver.
// Cualquier evento, del tipo que sea, reinicia la cuenta.

/** Silencio máximo tolerado dentro de un turno, en ms. Ver arriba por qué es tan alto. */
export const SILENCIO_MAXIMO_MS = 300_000;

/**
 * ¿Hay que cortar este turno por silencio?
 *
 * @param {number} ahora              reloj monótono (`performance.now()`)
 * @param {number} ultimoEventoEn     marca del último evento recibido, del tipo que sea
 * @param {number} [tope]             ms de silencio tolerados
 * @returns {boolean}
 */
export function hayQueCortarPorSilencio(ahora, ultimoEventoEn, tope = SILENCIO_MAXIMO_MS) {
    if (!Number.isFinite(ahora) || !Number.isFinite(ultimoEventoEn)) return false;
    // Un reloj que va hacia atrás (cambio de hora, suspensión) no es un motivo para matar
    // un turno: ante la duda, se deja vivir.
    if (ahora < ultimoEventoEn) return false;
    return (ahora - ultimoEventoEn) > tope;
}
