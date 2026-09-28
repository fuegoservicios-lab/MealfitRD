// [P1-PLAN-LOTE-761 · 2026-09-28] Volver a la app con una respuesta en vuelo.
//
// Desde el lote 760 el servidor termina y guarda la respuesta aunque el usuario salga de la app. Al volver hay tres
// casos: la conexión sigue viva y trae lo que faltaba (nada que hacer); se rompió y el `fetch` falla (el rescate del
// 156 adopta la respuesta guardada); o se quedó COLGADA —el teléfono la suspendió sin cerrarla— y el lector espera
// datos que ya no van a llegar. Ese tercer caso solo lo cortaba el vigilante del silencio del 157, a los 5 minutos de
// «Pensando…» sobre una respuesta que ya estaba guardada.
//
// Al volver tras un rato fuera con un turno en vuelo, el chat pregunta una vez al servidor: si dice que ya no hay turno
// (`turn_active: false`), el stream está colgado y se corta como lo cortaría el vigilante — el rescate hace el resto.
// Pura: la página decide cuándo mirar y qué hacer; esto dice si toca.

/** Cuánto hay que haber estado fuera para sospechar de la conexión (un vistazo al centro de control no cuenta). */
export const FUERA_MINIMO_MS = 3000;
/** Cuánto se espera tras volver antes de preguntar: si la conexión sigue viva, el stream reanuda en ese rato. */
export const ESPERA_TRAS_VOLVER_MS = 2500;

export function debeConsultarAlVolver({ fueraMs, turnoActivo }) {
    return Boolean(turnoActivo) && Number.isFinite(fueraMs) && fueraMs >= FUERA_MINIMO_MS;
}

/** El historial dice que el servidor ya no tiene turno para este chat (terminó, se guardó o murió). */
export function servidorYaTermino(historial) {
    return Boolean(historial && historial.turn_active === false);
}
