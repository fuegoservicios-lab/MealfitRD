// [P3-4 · useLatestRef · 2026-07-09] Mirror genérico estado→ref para closures
// long-lived (listeners, intervals, handlers SSE) que necesitan leer el valor
// FRESCO sin ser deps del effect. Antes el patrón estaba copiado a mano en 14
// sitios (8 solo en AgentPage): `useEffect(() => { ref.current = v; }, [v])` —
// trabajo muerto que queda stale si olvidas un dep.
//
// Hermano de useStableCallback (P1-8): aquel es para CALLBACKS (identidad
// estable + closure fresco); este para VALORES. NO usar en refs que además se
// escriben imperativamente fuera del mirror (p.ej. callModeRef/isSpeakingRef
// de AgentPage): la reasignación por render pisaría esos writes.
import { useEffect, useRef } from 'react';

/**
 * @template T
 * @param {T} value
 * @returns {{ current: T }} ref cuyo .current siempre es el último value commiteado.
 */
export function useLatestRef(value) {
    const ref = useRef(value);
    // En effect (no en render): escribir ref.current durante el render viola
    // react-hooks/refs y StrictMode lo detectaría. El listener que lo lee
    // corre en event-time, siempre posterior al commit.
    useEffect(() => {
        ref.current = value;
    }, [value]);
    return ref;
}
