// [P2-14 · useMediaQuery SSOT · 2026-07-09] Hook canónico de viewport/media
// queries. Antes el mismo hook estaba copy-pasteado en 4 archivos (Modal,
// History, Pantry, MotivoActualizarModal) y otros 4 componentes re-derivaban
// isMobile con useState + resize listener (Recipes ×2, PaymentModal, AgentPage,
// Dashboard) — 8 implementaciones para una sola pregunta ("¿matchea este
// breakpoint?"), cada una re-suscribiendo su propio listener.
//
// useSyncExternalStore en vez de useState+useEffect:
//   - El estado vive en el browser (matchMedia), no en React — es exactamente
//     el caso para el que existe la API.
//   - Cero setState síncrono dentro de un effect (el patrón anterior disparaba
//     react-hooks/set-state-in-effect y un render extra al montar).
//   - getServerSnapshot=false mantiene SSR-safety (paridad con las copias
//     anteriores, que devolvían false sin window).
//
// Los breakpoints NO se unifican a propósito: Modal usa 641px, Pantry 760px,
// AgentPage 1024px — cada uno acoplado a su CSS. Este hook consolida el
// MECANISMO, no la política de breakpoints.
import { useCallback, useSyncExternalStore } from 'react';

const _subscribeNoop = () => () => {};
const _getFalse = () => false;

/**
 * @param {string} query  Media query CSS (ej. '(max-width: 768px)').
 * @returns {boolean} true si el query matchea ahora mismo (reactivo).
 */
export function useMediaQuery(query) {
    const subscribe = useCallback((onStoreChange) => {
        if (typeof window === 'undefined' || !window.matchMedia) return _subscribeNoop();
        const media = window.matchMedia(query);
        // addEventListener puede no existir en stubs viejos (Safari <14 usaba
        // addListener); los targets reales del producto lo soportan.
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', onStoreChange);
            return () => media.removeEventListener('change', onStoreChange);
        }
        if (typeof media.addListener === 'function') {
            media.addListener(onStoreChange);
            return () => media.removeListener(onStoreChange);
        }
        return _subscribeNoop();
    }, [query]);

    const getSnapshot = useCallback(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false;
        return window.matchMedia(query).matches;
    }, [query]);

    return useSyncExternalStore(subscribe, getSnapshot, _getFalse);
}

/**
 * Conveniencia para el breakpoint móvil dominante del producto (<768px).
 * 767.98 (patrón Bootstrap) preserva la semántica de los callsites que
 * comparaban `window.innerWidth < 768` incluso con anchos fraccionales (DPR).
 *
 * @param {number} [maxWidthPx=768] Ancho EXCLUSIVO a partir del cual deja de ser móvil.
 */
export function useIsMobile(maxWidthPx = 768) {
    return useMediaQuery(`(max-width: ${maxWidthPx - 0.02}px)`);
}
