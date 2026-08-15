// [P1-I18N-DASHBOARD · 2026-08-15] Motor de idioma del dashboard.
//
// ── Por qué motor propio y no `react-i18next` ────────────────────────────────
// La librería cuesta ~30 kB gz y trae backends HTTP, detección de idioma,
// namespaces y Suspense — nada de lo cual usamos. Este repo pasó agosto
// recuperando bytes del entry (P1-APEX-ENTRY-DIET: 33 kB sacando @sentry de
// cinco puertas; P2-LANDING-OLA1-DIET: 181 iconos fuera del vendor chunk).
// Pagar 30 kB por un `clave → cadena` con interpolación contradice esa línea.
//
// ── LA CLAVE ES EL TEXTO ESPAÑOL ─────────────────────────────────────────────
// `t('Apariencia')`, no `t('settings.appearance.title')`. Tres consecuencias,
// y son la razón del diseño entero:
//
//   1. es-DO NO TIENE CATÁLOGO. Es el fallback. El 100% de la base actual
//      (dominicana) descarga CERO bytes de i18n. Solo quien elige francés
//      pide `fr-FR.json`, en su propio chunk.
//   2. Una cadena sin traducir muestra el ESPAÑOL, nunca `settings.save` en
//      crudo. Una migración a medias deja una pantalla mitad traducida —
//      coherente — en vez de una pantalla rota.
//   3. El precio, y hay que decirlo: cambiar el copy español HUÉRFANA la
//      traducción en silencio. Eso no se cierra con disciplina, se cierra con
//      `npm run i18n:check`, que compara catálogos contra las claves vivas y
//      falla con las huérfanas y las faltantes. Sin ese script este diseño es
//      una trampa; con él es una red.
//
// ── Homógrafos ───────────────────────────────────────────────────────────────
// Dos cadenas españolas iguales con traducción distinta se desambiguan con
// sufijo de contexto: `t('Plan|nav')` vs `t('Plan|sustantivo')`. La clave del
// catálogo es la cadena COMPLETA con sufijo; lo que se pinta si no hay
// traducción es la parte previa al `|`.
//
// ── Trampa conocida: `t()` en ámbito de módulo ───────────────────────────────
// Un array de etiquetas evaluado al importar corre ANTES de que el catálogo
// esté cargado y se congela en español para siempre. Por eso las tablas de
// copy deben ser FUNCIONES que se llamen en render (`getNavItems()`), no
// constantes. `scripts/i18n-check.mjs` marca los `t()` en ámbito de módulo.

import {
    DEFAULT_LOCALE,
    LOCALE_STORAGE_KEY,
    coerceLocale,
    isSupportedLocale,
} from './locales';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';

// ---------------------------------------------------------------------------
// Cargadores de catálogo
// ---------------------------------------------------------------------------
// Mapa EXPLÍCITO en vez de `import(\`./locales/${code}.json\`)`: un import con
// path variable hace que Vite empaquete el glob entero y pierdo el control de
// los chunks. Con el mapa, cada idioma es su propio chunk y `es-DO` ni siquiera
// aparece — no tiene archivo.
const LOADERS = {
    'en-US': () => import('./locales/en-US.json'),
    'pt-BR': () => import('./locales/pt-BR.json'),
    'fr-FR': () => import('./locales/fr-FR.json'),
    'it-IT': () => import('./locales/it-IT.json'),
};

// ---------------------------------------------------------------------------
// Estado de módulo
// ---------------------------------------------------------------------------
// Vive fuera de React a propósito: `t()` tiene que ser llamable desde código
// que no es un componente (helpers, handlers de error, funciones de formato).
// El Provider lo espeja en estado de React para disparar el re-render.
let _locale = DEFAULT_LOCALE;
let _catalog = null;          // null ⇒ es-DO (o catálogo aún no cargado)
let _pluralRules = null;
const _subscribers = new Set();

// [P1-I18N-DASHBOARD · 2026-08-15] Testigo de la última petición de idioma.
//
// Cierra una carrera real: dos `loadLocale` en vuelo resuelven en el orden en
// que llegan sus chunks por la red, NO en el que se pidieron. Un usuario que
// toca «Français» y acto seguido «Italiano» —o el arranque, donde `initLocale`
// (caché local) y `syncLocaleFromProfile` (servidor) pueden solaparse— acabaría
// con el idioma del import más rápido. Cada llamada se lleva su número; al
// volver del `await`, si ya no es la última, se descarta en silencio: su
// resultado está obsoleto y aplicarlo pisaría una elección más reciente.
let _peticion = 0;

function _notify() {
    for (const fn of _subscribers) {
        try { fn(_locale); } catch { /* un suscriptor roto no tumba a los demás */ }
    }
}

/** Locale activo. Lectura barata para código no-React. */
export function getLocale() {
    return _locale;
}

/** Lee la preferencia persistida en este dispositivo. Fail-closed al default. */
export function getStoredLocale() {
    // `safeLocalStorageGet` y no `localStorage.getItem` crudo: iOS Safari en
    // modo privado lanza `SecurityError` con solo tocar el objeto
    // (P2-FRONTEND-LOCALSTORAGE-LINT). El envoltorio lo absorbe y devuelve el
    // fallback. Además hay un lint del repo que lo exige.
    return coerceLocale(safeLocalStorageGet(LOCALE_STORAGE_KEY, DEFAULT_LOCALE));
}

function _persistLocal(code) {
    safeLocalStorageSet(LOCALE_STORAGE_KEY, code);
}

function _applyLang(code) {
    try {
        document.documentElement.setAttribute('lang', code);
    } catch { /* SSR / DOM ausente */ }
}

// ---------------------------------------------------------------------------
// Interpolación
// ---------------------------------------------------------------------------
// `{nombre}` → vars.nombre. Un placeholder sin valor se deja LITERAL en vez de
// pintar "undefined": si falta un dato, un `{dias}` visible es un bug evidente
// en captura; un "undefined" parece texto y sobrevive a la revisión.
const _INTERP = /\{(\w+)\}/g;

function _interpolate(str, vars) {
    if (!vars) return str;
    return str.replace(_INTERP, (whole, key) =>
        Object.prototype.hasOwnProperty.call(vars, key) && vars[key] != null
            ? String(vars[key])
            : whole
    );
}

/** Quita el sufijo de contexto: 'Plan|nav' → 'Plan'. */
function _stripContext(key) {
    const i = key.indexOf('|');
    return i === -1 ? key : key.slice(0, i);
}

// ---------------------------------------------------------------------------
// t / tn
// ---------------------------------------------------------------------------

/**
 * Traduce una cadena. La clave ES el español.
 *
 *   t('Guardar cambios')
 *   t('Hola, {nombre}', { nombre: 'Ana' })
 *   t('Plan|nav')                      // homógrafo desambiguado
 *
 * Devuelve siempre una cadena: sin catálogo o sin entrada, el español.
 */
export function t(key, vars) {
    if (typeof key !== 'string' || key === '') return '';
    const hit = _catalog ? _catalog[key] : undefined;
    // Una entrada objeto es una forma plural mal invocada desde `t()`; caer al
    // español es más honesto que pintar "[object Object]".
    const raw = typeof hit === 'string' && hit !== '' ? hit : _stripContext(key);
    return _interpolate(raw, vars);
}

/**
 * Traduce con plural. La clave es la forma «other» en español.
 *
 *   tn(n, '{n} día restante', '{n} días restantes', { n })
 *
 * Las categorías las decide `Intl.PluralRules` del locale activo — no una
 * comparación `n === 1`. Francés mete el 0 en singular y portugués tiene
 * categoría `many`; hardcodear `n === 1` traduce mal en ambos.
 * El catálogo guarda un objeto por categoría CLDR:
 *   "{n} días restantes": { "one": "{n} day left", "other": "{n} days left" }
 * Sin la categoría exacta cae a `other`, y sin objeto cae al español.
 */
export function tn(count, one, other, vars) {
    const n = Number(count);
    const key = other;
    const hit = _catalog ? _catalog[key] : undefined;

    if (hit && typeof hit === 'object') {
        let category = 'other';
        try {
            if (!_pluralRules) _pluralRules = new Intl.PluralRules(_locale);
            category = _pluralRules.select(n);
        } catch { /* Intl ausente: `other` es el fallback seguro */ }
        const form = hit[category] ?? hit.other;
        if (typeof form === 'string' && form !== '') return _interpolate(form, vars);
    }
    if (typeof hit === 'string' && hit !== '') return _interpolate(hit, vars);

    // Español: la regla nativa es `n === 1`.
    return _interpolate(n === 1 ? _stripContext(one) : _stripContext(other), vars);
}

// ---------------------------------------------------------------------------
// Formato dependiente del idioma
// ---------------------------------------------------------------------------
// El repo tiene `toLocaleDateString('es-DO')` fijos repartidos. Estos helpers
// son el reemplazo: leen el locale ACTIVO. Un menú en francés con fechas en
// español es exactamente el descuido que delata una traducción a medias.

/** `Intl.DateTimeFormat` con el locale activo. */
export function formatDate(value, options) {
    try {
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return new Intl.DateTimeFormat(_locale, options).format(d);
    } catch {
        return '';
    }
}

/** `Intl.NumberFormat` con el locale activo. */
export function formatNumber(value, options) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    try {
        return new Intl.NumberFormat(_locale, options).format(n);
    } catch {
        return String(n);
    }
}

// ---------------------------------------------------------------------------
// Carga y cambio de idioma
// ---------------------------------------------------------------------------

/**
 * Carga el catálogo de `code` y lo activa. Idempotente.
 *
 * Fail-soft por diseño: si el chunk no baja (offline, deploy a medias, CDN
 * caído) NO se rompe la app — se queda en español y se devuelve `false`. Una
 * app en su idioma base es una degradación; una pantalla en blanco es una
 * caída. El llamador decide si avisa.
 */
export async function loadLocale(code) {
    const target = coerceLocale(code);
    const mia = ++_peticion;

    if (target === DEFAULT_LOCALE) {
        // Síncrono: no hay await, así que no puede quedar obsoleto.
        _locale = DEFAULT_LOCALE;
        _catalog = null;
        _pluralRules = null;
        _applyLang(target);
        _notify();
        return true;
    }

    const loader = LOADERS[target];
    if (!loader) return false;

    try {
        const mod = await loader();
        // Otra petición entró mientras este chunk viajaba: la nuestra ya no es
        // la elección vigente del usuario. Descartar en silencio.
        if (mia !== _peticion) return false;

        const data = mod && mod.default ? mod.default : mod;
        if (!data || typeof data !== 'object') return false;
        _catalog = data;
        _locale = target;
        _pluralRules = null;
        _applyLang(target);
        _notify();
        return true;
    } catch {
        // Chunk inalcanzable: nos quedamos donde estábamos.
        return false;
    }
}

/**
 * Arranque: aplica el locale cacheado en este dispositivo SIN esperar al
 * perfil. El perfil (fuente de verdad, cross-device) lo re-aplica después vía
 * `syncLocaleFromProfile`. Sin este paso, un usuario en francés vería el
 * dashboard en español durante el roundtrip del perfil.
 */
export async function initLocale() {
    const stored = getStoredLocale();
    _applyLang(stored);

    // [P1-I18N-DASHBOARD · 2026-08-15] Salir ANTES de tocar `loadLocale` cuando
    // no hay nada que cambiar. Parece una micro-optimización y es una
    // corrección: `loadLocale` incrementa el testigo de petición, así que un
    // `initLocale()` tardío —el efecto de montaje del Provider, que en React 19
    // con StrictMode se invoca dos veces— invalidaba una carga del usuario que
    // estuviera EN VUELO. Síntoma: el usuario toca «Français», el chunk llega,
    // y se descarta en silencio porque un arranque que no pedía nada distinto
    // había reclamado el turno después. Lo destapó la suite completa; aislado no
    // se reproducía, que es la firma de una carrera.
    if (stored === _locale) return true;

    return loadLocale(stored);
}

/**
 * Reconcilia con el perfil del servidor (cross-device). Solo actúa si el
 * servidor dice algo distinto de lo cacheado: así el caso normal (mismo
 * dispositivo, misma preferencia) no dispara ni carga ni re-render.
 */
export async function syncLocaleFromProfile(profileLocale) {
    if (!isSupportedLocale(profileLocale)) return false;
    if (profileLocale === _locale) return false;
    const ok = await loadLocale(profileLocale);
    if (ok) _persistLocal(profileLocale);
    return ok;
}

// ---------------------------------------------------------------------------
// Capa React
// ---------------------------------------------------------------------------

const I18nContext = createContext({
    locale: DEFAULT_LOCALE,
    t,
    tn,
    setLocale: async () => false,
    ready: true,
});

/**
 * Provider. Va POR ENCIMA del Router en App.jsx.
 *
 * `locale` en el contexto es lo que fuerza el repintado: App.jsx lo usa como
 * `key` del subárbol de rutas, así que un cambio de idioma REMONTA la vista.
 * Es deliberado y es lo único correcto: hay cadenas que se calculan fuera de
 * componentes (tablas de copy, handlers) y un re-render normal no las alcanza
 * si el subárbol está memoizado. El precio es perder estado transitorio de la
 * vista al cambiar de idioma — algo que se hace una vez, a mano, desde
 * Configuración. Los providers quedan ARRIBA de la `key`, así que la sesión y
 * el estado del wizard sobreviven.
 */
export function I18nProvider({ children }) {
    const [locale, setLocaleState] = useState(() => getStoredLocale());
    const [ready, setReady] = useState(() => getStoredLocale() === DEFAULT_LOCALE);

    // Sin guarda `mounted`: desde React 18 un setState sobre un componente
    // desmontado es un no-op silencioso — la vieja advertencia que justificaba
    // ese ref ya no existe. Mantenerlo aquí además rompía la regla
    // `react-hooks/refs` (el ref acababa leído en render, dentro del `value`).

    // Arranque: carga el catálogo cacheado en este dispositivo.
    useEffect(() => {
        (async () => {
            await initLocale();
            setLocaleState(getLocale());
            setReady(true);
        })();
    }, []);

    // Cambios disparados FUERA de React (`syncLocaleFromProfile`, que corre
    // dentro de `fetchProfile` en AssessmentContext) tienen que llegar al árbol
    // igual. Sin esta suscripción, el idioma del perfil se aplicaría al DOM
    // (`<html lang>`) y al catálogo pero el subárbol no se remontaría.
    useEffect(() => {
        const onChange = (next) => setLocaleState(next);
        _subscribers.add(onChange);
        return () => { _subscribers.delete(onChange); };
    }, []);

    const setLocale = useCallback(async (code) => {
        const target = coerceLocale(code);
        if (target === getLocale()) return true;
        const ok = await loadLocale(target);
        if (ok) _persistLocal(target);
        // `loadLocale` ya notificó a los suscriptores, así que el estado se
        // actualiza por esa vía; no hace falta un setState extra aquí.
        return ok;
    }, []);

    const value = useMemo(
        () => ({ locale, t, tn, setLocale, ready }),
        [locale, setLocale, ready]
    );

    return React.createElement(I18nContext.Provider, { value }, children);
}

/** Acceso completo: `{ locale, t, tn, setLocale, ready }`. */
export function useI18n() {
    return useContext(I18nContext);
}

/**
 * El hook de uso diario: `const t = useT();`
 *
 * Devuelve la MISMA función `t` de módulo; lo que hace útil al hook es que
 * suscribe al componente al contexto, así que un cambio de idioma lo
 * re-renderiza. Un componente que importa `t` directo funciona, pero solo se
 * actualiza si algo por encima lo re-renderiza.
 */
export function useT() {
    return useContext(I18nContext).t;
}

/** Variante plural del hook. */
export function useTn() {
    return useContext(I18nContext).tn;
}
