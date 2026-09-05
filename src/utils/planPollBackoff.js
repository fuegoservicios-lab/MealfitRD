// [P1-PLAN-POLL-BOUNDED · 2026-07-29] Discriminador + backoff + give-up puros
// para el bucle de polling de "nuevas semanas del plan" (AssessmentContext
// `/api/plans-data/latest` cada 25s, y el hermano de Dashboard que pollea
// `/api/profile` + `/chunk-status` cada 30s). Extraído a módulo propio para que
// sea testeable sin montar el provider entero (3900+ líneas) ni React Testing
// Library — funciones puras, ninguna toca `Date.now()`/`setTimeout` por sí sola.
//
// Incidente (horas antes de este fix, 2026-07-29): un plan que nunca podía
// completar hizo que el frontend pollee /api/plans-data/latest decenas de
// veces por minuto, PARA SIEMPRE, contra producción. La fila mala ya se borró,
// pero el loop seguía sin cota — cualquier plan estancado/atascado lo
// reproduce. Medido en vivo el mismo día: 6 planes 'partial' reales en prod
// llevan DÍAS sin avanzar (`next_chunk_eta` entre 2 y 27 días en el futuro) —
// cualquier pestaña abierta los pollearía cada 25s sin ningún beneficio.
//
// Por qué `days.length > 0` NO alcanza como discriminador: dice "el primer
// chunk llegó", pero nada sobre CUÁNDO (o si) llega el próximo. Un plan con
// next_chunk_eta a 5 segundos y uno con next_chunk_eta a 20 días se ven
// IDÉNTICOS mirando solo `plan_data`. La señal suficiente — `next_chunk_eta` /
// `in_flight_count` — ya existe server-side (`GET /chunk-status`,
// backend/routers/plans.py) y YA la pide un loop hermano (Dashboard); antes de
// este fix, el loop que causó el incidente nunca la consultaba.
//
// Distribución real de duración por chunk (pipeline_holistic, medición en vivo
// 2026-07-29, n=319 últimos 30 días): p50=363s(~6min) p75=537s p90=692s
// p95=763s(~12.7min) max=1192s(~19.9min, con reintentos incluidos). El give-up
// de abajo se dimensiona sobre ESTA distribución — no sobre los "~4 minutos"
// que asumía el reporte del incidente (optimista: el p50 real es 6-7min).

const _num = (raw, dflt, { min, max } = {}) => {
    if (raw === undefined || raw === null || raw === '') return dflt;
    const n = Number(raw);
    if (!Number.isFinite(n)) return dflt;
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
};

// import.meta.env no existe fuera de Vite/Vitest (p.ej. si este módulo se
// importara alguna vez desde un script Node plano) — degradar a {} en vez de
// reventar el import.
const _env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

// Cadencia "activa" — paridad con el `setInterval(pollLatestPlan, 25000)`
// pre-fix. Se mantiene SOLO mientras el discriminador dice que hay algo que
// ver pronto (ver `isPlanActiveForFastPoll`).
export const PLAN_POLL_FAST_MS = _num(_env.VITE_PLAN_POLL_FAST_MS, 25000, { min: 5000, max: 120000 });

// Ventana "el próximo chunk está por llegar": si `next_chunk_eta` cae dentro
// de esta ventana, se mantiene la cadencia rápida — el worker podría
// levantarlo en cualquier momento. 15min es sobre el SCHEDULING
// (`execute_after`), no sobre cuánto tarda en CORRER un chunk una vez que
// arrancó (eso es PLAN_POLL_GIVEUP_MS, abajo) — por eso el margen sobre el
// p95 de duración (12.7min) es más ajustado aquí a propósito.
export const PLAN_POLL_NEAR_TERM_ETA_MS = _num(
    _env.VITE_PLAN_POLL_NEAR_TERM_ETA_MS, 15 * 60 * 1000, { min: 60 * 1000, max: 60 * 60 * 1000 },
);

// Backoff geométrico: crece cuando la cadencia rápida está armada (chunk
// activo/próximo) pero el contenido NO cambia entre ticks — un chunk lento
// pero vivo no necesita que le preguntemos cada 25s exactos. Se resetea a
// PLAN_POLL_FAST_MS en cuanto el contenido SÍ progresa
// (`hasContentProgressed`).
export const PLAN_POLL_BACKOFF_MULTIPLIER = _num(_env.VITE_PLAN_POLL_BACKOFF_MULTIPLIER, 1.5, { min: 1, max: 5 });
export const PLAN_POLL_BACKOFF_MAX_MS = _num(
    _env.VITE_PLAN_POLL_BACKOFF_MAX_MS, 120 * 1000, { min: PLAN_POLL_FAST_MS, max: 10 * 60 * 1000 },
);

// Give-up: tope duro de tiempo continuo "activo (fast-poll armado) sin
// progreso" antes de dejar de pollear del todo. 30min ≈ 1.5× el máximo medido
// (19.9min con reintentos) y ≈2.4× el p95 (12.7min) — margen generoso para
// jamás abandonar una generación real que solo va lenta (constraint: "A
// working generation must still appear promptly" no puede violarse por un
// give-up demasiado agresivo).
export const PLAN_POLL_GIVEUP_MS = _num(
    _env.VITE_PLAN_POLL_GIVEUP_MS, 30 * 60 * 1000, { min: 5 * 60 * 1000, max: 120 * 60 * 1000 },
);

// [P2-PLAN-POLL-DORMANT-SLEEP · 2026-09-04] Latido del plan DORMIDO (siguiente bloque programado
// para más adelante): no es rendirse, es dormir. Un tick largo de respaldo; el despertar real es
// volver a la pestaña (visibilitychange).
export const PLAN_POLL_DORMANT_MS = _num(
    _env.VITE_PLAN_POLL_DORMANT_MS, 15 * 60 * 1000, { min: 60 * 1000, max: 60 * 60 * 1000 },
);


/**
 * Discriminador puro: ¿hay motivo para pollear a cadencia rápida AHORA MISMO?
 *
 * Fail-open (true) cuando `chunkStatus` es `null`/`undefined`: significa que
 * todavía no hidratamos el discriminador (primer tick) o que el fetch de
 * `/chunk-status` falló — nunca hay que demorar una generación real por falta
 * de datos DEL DISCRIMINADOR. El caso A (plan realmente generando) nunca debe
 * verse penalizado por este gate.
 *
 * @param {{in_flight_count?: number, next_chunk_eta?: string|null}|null|undefined} chunkStatus
 * @param {number} nowMs
 * @param {number} [nearTermMs]
 * @returns {boolean}
 */
export function isPlanActiveForFastPoll(chunkStatus, nowMs, nearTermMs = PLAN_POLL_NEAR_TERM_ETA_MS) {
    if (!chunkStatus || typeof chunkStatus !== 'object') return true; // fail-open: sin dato → no adivinar que está dormido
    const inFlight = Number(chunkStatus.in_flight_count);
    if (Number.isFinite(inFlight) && inFlight > 0) return true;
    const etaRaw = chunkStatus.next_chunk_eta;
    if (typeof etaRaw === 'string' && etaRaw) {
        const etaMs = Date.parse(etaRaw);
        if (Number.isFinite(etaMs) && (etaMs - nowMs) <= nearTermMs) return true;
    }
    return false;
}

/**
 * [P1-PLAN-POLL-INFLIGHT-NO-BACKOFF · 2026-07-29] ¿Hay un chunk REALMENTE
 * cocinándose ahora mismo (`in_flight_count>0`)? Sub-señal de `isPlanActiveForFastPoll`
 * — esa función también cuenta "nada corriendo todavía pero `next_chunk_eta` cae
 * pronto" como "activo" (razón correcta para NO detener el loop), pero ese
 * sub-caso SÍ puede pagar backoff geométrico (nada está corriendo aún). El
 * sub-caso `in_flight_count>0` no debe pagarlo nunca: el trabajo ya se
 * disparó server-side y puede terminar en cualquier tick — cadencia rápida
 * (`fastMs`) todo el tiempo que dure, sin importar si `daysCount` ya se movió
 * (el chunk completo solo se materializa como días al final, no a mitad de
 * camino).
 *
 * Fail-closed (false) cuando `chunkStatus` es null/undefined: el fail-open de
 * "seguir pollenado en vez de detenerse" ya lo cubre `isPlanActiveForFastPoll`;
 * aquí solo se decide si el backoff puede CRECER, y un `chunkStatus`
 * desconocido no autoriza asumir "cocinando ahora mismo" (congelaría el
 * backoff en `fastMs` indefinidamente para el caso benigno "el fetch de
 * `/chunk-status` falló pero el plan real está dormido").
 *
 * @param {{in_flight_count?: number}|null|undefined} chunkStatus
 * @returns {boolean}
 */
export function isPlanInFlight(chunkStatus) {
    if (!chunkStatus || typeof chunkStatus !== 'object') return false;
    const inFlight = Number(chunkStatus.in_flight_count);
    return Number.isFinite(inFlight) && inFlight > 0;
}

/**
 * Backoff puro: siguiente delay dado el actual. El caller decide CUÁNDO
 * llamarla (solo en ticks sin progreso Y sin chunk en vuelo — ver
 * `hasContentProgressed` / `isPlanInFlight`) y cuándo resetear a `fastMs` en
 * su lugar.
 */
export function growPollDelay(currentDelayMs, {
    fastMs = PLAN_POLL_FAST_MS,
    multiplier = PLAN_POLL_BACKOFF_MULTIPLIER,
    maxMs = PLAN_POLL_BACKOFF_MAX_MS,
} = {}) {
    const base = Number.isFinite(currentDelayMs) && currentDelayMs > 0 ? currentDelayMs : fastMs;
    return Math.min(maxMs, Math.round(base * multiplier));
}

/**
 * ¿Progresó el contenido entre dos snapshots consecutivos? Señal usada
 * exclusivamente para RESETEAR el backoff (y el reloj de give-up) — NO decide
 * si pollear, eso es `isPlanActiveForFastPoll`.
 *
 * @param {{daysCount?: number, generationStatus?: string|null}|null|undefined} prevSnapshot
 * @param {{daysCount?: number, generationStatus?: string|null}|null|undefined} nextSnapshot
 */
export function hasContentProgressed(prevSnapshot, nextSnapshot) {
    if (!prevSnapshot) return true; // primer snapshot: siempre "progreso" (arranca el reloj).
    const prevDays = Number(prevSnapshot?.daysCount) || 0;
    const nextDays = Number(nextSnapshot?.daysCount) || 0;
    if (nextDays !== prevDays) return true;
    if ((prevSnapshot?.generationStatus ?? null) !== (nextSnapshot?.generationStatus ?? null)) return true;
    return false;
}

/**
 * ¿Se cumplió el tope de give-up? `activeSinceMs` es el timestamp en el que
 * empezó la racha actual "activo sin progreso" — se resetea junto al backoff
 * en cuanto `hasContentProgressed` da `true`.
 */
export function hasPollGivenUp(activeSinceMs, nowMs, giveUpMs = PLAN_POLL_GIVEUP_MS) {
    if (!Number.isFinite(activeSinceMs)) return false;
    return (nowMs - activeSinceMs) >= giveUpMs;
}
