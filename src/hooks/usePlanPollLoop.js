// [P1-PLAN-POLL-BOUNDED · 2026-07-29] Bucle de polling genérico y ACOTADO:
// discriminador (chunk-status truth) + backoff geométrico en no-cambio +
// reset en cambio + tope de give-up. Reemplaza el `setInterval(fn, 25000)`
// plano que corría para siempre mientras `generation_status` estuviera en un
// set de estados "activos" — sin importar si había algo por venir.
//
// Usado por AssessmentContext (poll de `/api/plans-data/latest`, el que causó
// el incidente) y, en la misma sesión, aplicado con la misma forma al poll de
// Dashboard.jsx (`/api/profile` + `/chunk-status`). Ver `utils/planPollBackoff.js`
// para el razonamiento completo (discriminador, curva de backoff, cota de
// give-up) y las cifras medidas que las justifican.
//
// Contrato del `tick`: hace el fetch REAL (side-effectful) y devuelve un
// snapshot `{ daysCount, generationStatus, chunkStatus }` — o `null` si el
// tick no pudo evaluarse (pestaña oculta, fetch abortado, recalc lock, etc.).
// Un `null` NO cuenta como "sin progreso": simplemente reintenta al mismo
// delay sin tocar backoff ni el reloj de give-up (evita que una pausa por
// pestaña oculta cuente como tiempo "estancado").
import { useEffect } from 'react';
// [P3-4 · 2026-07-09] Mirror SSOT valor→ref (escribe en useEffect, no en render —
// escribir ref.current durante el render viola react-hooks/refs).
import { useLatestRef } from './useLatestRef';
import {
    PLAN_POLL_FAST_MS,
    PLAN_POLL_NEAR_TERM_ETA_MS,
    PLAN_POLL_GIVEUP_MS,
    isPlanActiveForFastPoll,
    isPlanInFlight,
    growPollDelay,
    hasContentProgressed,
    hasPollGivenUp,
} from '../utils/planPollBackoff';

/**
 * @param {object} opts
 * @param {boolean} opts.enabled - gate externo (p.ej. uid presente + status en el set "activo").
 *   Al pasar a `false` el loop se desarma por completo (cleanup del effect).
 * @param {*} [opts.resetKey] - cuando cambia (p.ej. `planData.id`), reinicia el
 *   loop desde cero (delay/activeSince/lastSnapshot) — paridad con "re-armar al
 *   cambiar de plan" del effect pre-fix.
 * @param {() => Promise<{daysCount:number, generationStatus:string|null, chunkStatus:object|null}|null>} opts.tick
 * @param {(gaveUp: boolean) => void} [opts.onGiveUpChange] - notifica cambios de estado give-up (para render).
 * @param {number} [opts.fastMs]
 * @param {number} [opts.nearTermMs]
 * @param {number} [opts.giveUpMs]
 */
export function usePlanPollLoop({
    enabled,
    resetKey,
    tick,
    onGiveUpChange,
    fastMs = PLAN_POLL_FAST_MS,
    nearTermMs = PLAN_POLL_NEAR_TERM_ETA_MS,
    giveUpMs = PLAN_POLL_GIVEUP_MS,
}) {
    const tickRef = useLatestRef(tick);
    const onGiveUpChangeRef = useLatestRef(onGiveUpChange);

    useEffect(() => {
        if (!enabled) {
            onGiveUpChangeRef.current?.(false);
            return undefined;
        }

        let cancelled = false;
        let timeoutId = null;
        let delayMs = fastMs;
        let activeSinceMs = Date.now();
        let lastSnapshot = null;

        const scheduleNext = (ms) => {
            if (cancelled) return;
            timeoutId = setTimeout(runTick, ms);
        };

        const runTick = async () => {
            if (cancelled) return;
            const nowBeforeFetch = Date.now();
            if (hasPollGivenUp(activeSinceMs, nowBeforeFetch, giveUpMs)) {
                // Tope duro: ~30min de "activo, sin progreso" (medido contra
                // p95/max reales de duración de chunk, ver planPollBackoff.js).
                // Termina la cadena — NO se re-arma sola. El trigger de
                // wake/focus (fuera de este hook) sigue disponible para un
                // refresh oportunista si el usuario vuelve a la pestaña.
                onGiveUpChangeRef.current?.(true);
                return;
            }

            let snapshot = null;
            try {
                // `() => cancelled` viaja al tick para que sus fetches puedan
                // abortar la adopción si ESTE effect ya se desarmó a mitad de
                // camino (mismo patrón que el `shouldAbort: () => cancelled`
                // del `setInterval` pre-fix — evita re-inyectar una respuesta
                // stale tras un teardown/re-arm).
                snapshot = await tickRef.current(() => cancelled);
            } catch {
                snapshot = null;
            }
            if (cancelled) return;

            if (!snapshot) {
                // Tick no evaluable (pestaña oculta, recalc lock, fetch
                // fallido/abortado): reintenta al mismo delay, sin tocar
                // backoff ni el reloj de give-up.
                scheduleNext(delayMs);
                return;
            }

            const now = Date.now();
            const progressed = hasContentProgressed(lastSnapshot, snapshot);
            lastSnapshot = snapshot;
            if (progressed) {
                delayMs = fastMs;
                activeSinceMs = now;
                onGiveUpChangeRef.current?.(false);
            }

            const active = isPlanActiveForFastPoll(snapshot.chunkStatus, now, nearTermMs);
            if (!active) {
                // [P1-PLAN-POLL-DORMANT-GIVEUP-SIGNAL · 2026-07-29] Dormante:
                // chunk-status dice que no hay nada por venir pronto
                // (in_flight_count===0 y next_chunk_eta lejos o ausente). Se
                // detiene el loop — SIN re-armarse — confiando en el trigger
                // de wake/focus para el refresh oportunista (recomendación de
                // la medición: "no hay nada que ver pronto", stopping no
                // arriesga la constraint de "generación real no debe tardar
                // más en aparecer"). PERO detenerse sin avisar es exactamente
                // la "pantalla muda" que el give-up wall-clock (arriba) fue
                // escrito para evitar — el consumidor (banner "Dejamos de
                // revisar…") no distingue POR QUÉ se detuvo, solo que debe
                // ofrecer un botón manual. Notificar aquí también, no solo en
                // el timeout de `giveUpMs`.
                onGiveUpChangeRef.current?.(true);
                return;
            }

            if (isPlanInFlight(snapshot.chunkStatus)) {
                // [P1-PLAN-POLL-INFLIGHT-NO-BACKOFF · 2026-07-29] Un chunk
                // REALMENTE cocinándose ahora mismo no debe pagar backoff solo
                // porque `daysCount` todavía no se movió — el chunk se
                // materializa como días recién al terminar, no a mitad de
                // camino. Cadencia rápida mientras dure, cualquiera sea
                // `progressed`.
                delayMs = fastMs;
            } else if (!progressed) {
                delayMs = growPollDelay(delayMs, { fastMs });
            }
            scheduleNext(delayMs);
        };

        runTick(); // primer tick inmediato — paridad con el `pollLatestPlan()` eager pre-fix.

        return () => {
            cancelled = true;
            if (timeoutId) clearTimeout(timeoutId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, resetKey, fastMs, nearTermMs, giveUpMs]);
}
