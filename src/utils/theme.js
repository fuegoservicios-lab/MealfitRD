// [APPEARANCE-THEME · 2026-05-28] Motor de tema (Sistema/Básico/Oscuro).
//
// Contrato: el atributo `html[data-theme]` es la ÚNICA fuente de verdad visual.
//   - data-theme="dark"  → paleta oscura (overrides de variables CSS en index.css)
//   - data-theme="light" → paleta clara (defaults de :root)
//
// La PREFERENCIA del usuario (system|light|dark) vive en localStorage bajo
// `mealfit_theme`. `system` se resuelve contra `prefers-color-scheme` y se
// re-resuelve cuando el SO cambia de modo (ver initSystemThemeListener).
//
// El flash inicial lo evita el boot script inline en index.html, que fija
// data-theme síncronamente antes del primer paint. Este módulo re-aplica en
// runtime (al montar la app y cuando el usuario cambia el toggle en Settings).

const STORAGE_KEY = 'mealfit_theme';
const VALID_PREFS = ['system', 'light', 'dark'];

/** Lee la preferencia persistida; cae a 'dark' si falta o es inválida.
 *  [P3-DEFAULT-DARK · 2026-06-01] Default cambiado de 'system' a 'dark'
 *  (decisión de producto: app oscura por defecto). 'system' sigue siendo una
 *  opción explícita seleccionable; la migración one-time del boot script
 *  (index.html) convierte un 'system' previo a 'dark' una sola vez. */
export function getStoredThemePref() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return VALID_PREFS.includes(v) ? v : 'dark';
    } catch {
        return 'dark';
    }
}

/** Resuelve una preferencia a booleano isDark (system → prefers-color-scheme). */
export function resolveIsDark(pref) {
    if (pref === 'dark') return true;
    if (pref === 'light') return false;
    // 'system' (o cualquier valor raro): seguir al SO.
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;
}

/**
 * Aplica una preferencia al DOM fijando html[data-theme]. Devuelve isDark.
 * NO persiste — eso es responsabilidad del callsite (Settings) para que el
 * boot script y este módulo lean el mismo valor.
 */
export function applyThemePref(pref) {
    const isDark = resolveIsDark(pref);
    try {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        // [P3-THEME-COLOR-SYNC · 2026-05-30] Notifica a useThemeColor para
        // re-sincronizar <meta name="theme-color"> de inmediato. Cubre el toggle
        // de tema en Settings Y el cambio del SO cuando pref='system' (via
        // initSystemThemeListener) — ninguno re-renderiza el layout que hospeda
        // useThemeColor, así que sin este evento la barra de estado quedaba
        // rezagada hasta la siguiente navegación.
        window.dispatchEvent(new Event('mealfit-theme-change'));
    } catch {
        /* SSR / DOM ausente: no-op */
    }
    return isDark;
}

let _systemListenerBound = false;
/**
 * Engancha un listener a prefers-color-scheme UNA sola vez. Solo re-aplica
 * cuando la preferencia activa es 'system' (en light/dark explícito el usuario
 * mandó, ignoramos el SO). Idempotente.
 */
export function initSystemThemeListener() {
    if (_systemListenerBound) return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    _systemListenerBound = true;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
        if (getStoredThemePref() === 'system') applyThemePref('system');
    };
    if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', handler);
    } else if (typeof mq.addListener === 'function') {
        // Safari < 14 fallback
        mq.addListener(handler);
    }
}

/** Conveniencia para el arranque de la app: aplica la pref guardada + listener. */
export function initTheme() {
    applyThemePref(getStoredThemePref());
    initSystemThemeListener();
}

/** True si el tema resuelto actual es oscuro (lee el DOM, no localStorage). */
export function isDarkActive() {
    try {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    } catch {
        return false;
    }
}
