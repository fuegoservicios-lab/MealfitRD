// [P1-3 · TanStack Query · 2026-07-09] queryClient singleton + provider foundation.
//
// Fix ESTRUCTURAL de la clase de fuga PII cross-user (6 fixes se enviaron por la
// misma raiz: caches module/window keyed SIN user_id, purgadas por una lista a
// mano en _clearUserScopedCaches; cada cache nueva era una fuga hasta que alguien
// recordaba agregarla). La convencion a partir de aqui:
//   - Toda query de servidor se keya [recurso, userId]  (ej. ['history-list', uid]).
//   - En logout / user-switch se llama clearUserQueryCache() UNA vez → evicta TODO
//     el estado de servidor atomicamente → la clase de fuga se vuelve imposible por
//     construccion, no por checklist.
//
// FOUNDATION ONLY (P1-3): esto instala el provider + el clear. La migracion de los
// surfaces read-only a useQuery (borrar historyCaches.js/pantryCache.js) es P2-1.
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Defaults conservadores para un mercado movil es-DO (datos moviles caros):
      // no refetch agresivo. Los surfaces afinaran su staleTime/gcTime al migrar
      // (P2-1) para matchear los TTL hand-tuned actuales.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Evicta TODO el estado de servidor cacheado. Se invoca desde el teardown SSOT
 * (AssessmentContext._clearUserScopedCaches), que corre en los 5 paths de logout/
 * user-switch/reset. Un solo clear() cierra la clase de fuga PII cross-user.
 */
export function clearUserQueryCache() {
  queryClient.clear();
}
