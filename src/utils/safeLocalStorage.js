/**
 * [P2-AUDIT-3 · 2026-05-15] Helpers SSOT para `localStorage.setItem` y
 * `localStorage.getItem` defensivos.
 *
 * Por qué existe:
 *   `localStorage.setItem(key, value)` puede lanzar `QuotaExceededError` (cuota
 *   por origen excedida, common en iOS Private Mode donde cuota efectiva es 0)
 *   y `SecurityError` (storage deshabilitado por settings). En ambos casos un
 *   throw no atrapado rompe el flujo del context que lo invoca:
 *     - AssessmentContext.jsx tenía 13 callsites raw `localStorage.setItem(...)`
 *       — un único QuotaExceededError corta la cadena de side-effects del
 *       useEffect o handler, dejando state inconsistente (plan guardado en
 *       React pero NO en localStorage → reload pierde el plan recién generado).
 *
 *   Convención documentada en P3-HISTORICAL-TOAST-DISMISS · 2026-05-14
 *   (try/catch para iOS Private Mode + QuotaExceededError). 13 callsites
 *   legacy quedaron expuestos antes de este helper.
 *
 * API:
 *   safeLocalStorageSet(key, value, opts?)
 *     key: string — clave de storage.
 *     value: any — si es string se almacena directo; si no, se serializa via
 *       JSON.stringify (consistente con cómo el resto del codebase usa
 *       `localStorage.setItem('mealfit_plan', JSON.stringify(planData))`).
 *     opts.onError: (err, key) => void — opcional, callback para logging.
 *   Returns:
 *     true si el set tuvo éxito; false si falló (caller decide cómo seguir).
 *     NUNCA throw.
 *
 *   safeLocalStorageGet(key, fallback?)
 *     key: string — clave de storage.
 *     fallback: any — valor a retornar si getItem lanza o devuelve null/undefined.
 *   Returns: string raw o fallback. Para parseo defensivo, combinar con
 *     `safeJSONParse` (P2-A).
 *
 *   safeLocalStorageRemove(key)
 *     Simétrico: best-effort delete sin crash.
 *
 *   safeLocalStorageAvailable()
 *     Test runtime de write+read+remove de una key throwaway. Útil para
 *     branchear UX: si storage no disponible, skipear features que dependen
 *     de persistencia local (e.g., sesión Supabase remembered).
 *
 * Diseño:
 *   - Cero dependencias (no importa nada del bundle React) para que el helper
 *     se pueda llamar desde cualquier surface (context, page, hook, SW).
 *   - SSR-safe: chequea `typeof window === 'undefined'` y `window.localStorage`
 *     antes de invocar. En SSR retorna false/fallback sin throw.
 *   - Sin logger spammy: en caso de error, opcional `opts.onError` para que el
 *     caller decida si emite trackEvent / console.warn. El helper en sí es
 *     silencioso por default (storage errors son ruido en navegadores con
 *     extensions agresivas, y un toast por cada `setItem` arruinaría UX).
 *
 * Tooltip-anchor: P2-AUDIT-3-SAFE-LOCALSTORAGE | gap audit 2026-05-15
 */

const _isStorageAvailable = () => {
    try {
        return (
            typeof window !== 'undefined'
            && window.localStorage !== null
            && window.localStorage !== undefined
        );
    } catch (_e) {
        return false;
    }
};

export function safeLocalStorageSet(key, value, opts) {
    if (!_isStorageAvailable()) return false;
    try {
        const serialized = (typeof value === 'string') ? value : JSON.stringify(value);
        window.localStorage.setItem(key, serialized);
        return true;
    } catch (err) {
        if (opts && typeof opts.onError === 'function') {
            try { opts.onError(err, key); } catch (_oe) { /* swallow */ }
        }
        return false;
    }
}

export function safeLocalStorageGet(key, fallback) {
    if (!_isStorageAvailable()) return fallback;
    try {
        const v = window.localStorage.getItem(key);
        return (v === null || v === undefined) ? fallback : v;
    } catch (_err) {
        return fallback;
    }
}

export function safeLocalStorageRemove(key) {
    if (!_isStorageAvailable()) return false;
    try {
        window.localStorage.removeItem(key);
        return true;
    } catch (_err) {
        return false;
    }
}

export function safeLocalStorageAvailable() {
    if (!_isStorageAvailable()) return false;
    const _testKey = '__mealfit_storage_probe__';
    try {
        window.localStorage.setItem(_testKey, '1');
        const ok = window.localStorage.getItem(_testKey) === '1';
        window.localStorage.removeItem(_testKey);
        return ok;
    } catch (_err) {
        return false;
    }
}
