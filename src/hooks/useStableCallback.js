import { useCallback, useLayoutEffect, useRef } from 'react';

// [P1-8 · useStableCallback · 2026-07-09] Hook estilo "event callback" (el patrón
// que React propone como useEffectEvent). Devuelve una función con IDENTIDAD
// ESTABLE (nunca cambia) que SIEMPRE invoca la versión más reciente del callback,
// leída de un ref actualizado en un layout effect.
//
// Por qué (P1-8): el value de AssessmentContext expone ~11 funciones plain que se
// recrean cada render → el objeto value cambia de identidad cada render → los 26
// consumidores de useAssessment re-renderizan ante cualquier setState del provider.
// Estabilizar esas funciones con useCallback + dep-arrays a mano es peligroso (un
// dep olvidado = stale-closure en la espina). Este patrón da identidad estable SIN
// dep-arrays: el ref siempre apunta al closure más reciente, así que la llamada
// ejecuta estado fresco. Semántica correcta para EVENT HANDLERS (que es lo que son
// updateData/nextStep/saveGeneratedPlan/...), no para valores.

/**
 * @template {(...args: any[]) => any} T
 * @param {T} fn
 * @returns {T} una función de identidad estable que delega en la última `fn`.
 */
export function useStableCallback(fn) {
  const ref = useRef(fn);
  // Layout effect: el ref se actualiza tras el render pero ANTES de que corran
  // effects/handlers que puedan invocar la función → nunca ejecutan una versión
  // vieja. (Los event handlers se disparan post-commit, así que ven la última.)
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args) => ref.current(...args), []);
}
