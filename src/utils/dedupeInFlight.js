// [P1-PLAN-POLL-BOUNDED · 2026-07-29] Envuelve una función async para que
// llamadas CONCURRENTES — mientras la anterior sigue en vuelo — reusen la
// MISMA promesa en vez de disparar un fetch nuevo cada una.
//
// Usado por AssessmentContext para que el trigger de wake/focus no apile un
// fetch sobre un poll ya en curso, y para que una ráfaga de eventos `focus`
// (alt-tabbing repetido) no multiplique requests reales — ambos observados en
// el incidente (P1-PLAN-POLL-BOUNDED · 2026-07-29): el wake/focus era
// unconditional del estado del poll, así que cada cambio de pestaña sumaba su
// propio `/plans-data/latest` encima de los que el poll de 25s ya disparaba.
//
// Deliberadamente simple: NO distingue argumentos entre llamadas — la primera
// llamada "gana" y las que llegan mientras esa promesa sigue pendiente reciben
// la MISMA respuesta, ignorando sus propios argumentos. Correcto para el caso
// de uso actual (`hydrateLatestPlan`): el endpoint fetcheado
// (`/api/plans-data/latest`) devuelve el MISMO plan más reciente sin importar
// qué `src` mandó el caller — ese parámetro es puramente de telemetría server-
// side, nunca cambia la respuesta. NO usar esto para envolver funciones cuyos
// argumentos SÍ cambian el resultado de forma observable para el caller.
export function createInFlightDedupe(fn) {
    let inFlight = null;
    return (...args) => {
        if (inFlight) return inFlight;
        const p = Promise.resolve(fn(...args)).finally(() => {
            if (inFlight === p) inFlight = null;
        });
        inFlight = p;
        return p;
    };
}
