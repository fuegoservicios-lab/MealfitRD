// [P1-I18N-DASHBOARD · 2026-08-15] SSOT de los idiomas del dashboard.
//
// Este archivo es la ÚNICA lista de idiomas soportados. Lo consumen:
//   - el selector de Configuración → Apariencia (pinta las opciones),
//   - el motor `src/i18n/index.js` (valida antes de cargar un catálogo),
//   - el boot síncrono de `index.html` (copia literal, anclada por test),
//   - `scripts/i18n-check.mjs` (sabe qué catálogos deben existir),
//   - el backend `_LOCALE_VALUES` + el CHECK de `user_profiles.locale`.
//
// [P2-I18N-ESPEJOS-SIN-ANCLA · 2026-08-21] Aquí decía que la lista vive en cinco
// lados y que `test_p1_i18n_dashboard.py` falla si divergen. Son DOCE, y siete no
// los anclaba nadie: los mapas de `LOADERS`, `_COACH_LANGUAGE_NAMES`,
// `_TITLE_LANGUAGE_DIRECTIVES`, `_DISPLAY_LANGUAGE_DIRECTIVES` y los dos addenda
// del display, más el JSON del catálogo.
//
// La lista completa, con QUÉ SE VE si falta cada uno, está en la §6 de
// `backend/docs/i18n_dashboard.md`. Un espejo por test en
// `backend/tests/test_p2_i18n_espejos_sin_ancla.py`.
//
// Lo que hace este drift peligroso es que no rompe nada: el idioma que falte en un
// espejo simplemente deja ESA superficie en español. Es la misma forma que
// P1-DIET-CANON-SSOT cerró para `dietType`, pero más callada.

/** Idioma base del producto. NO tiene archivo de catálogo: es el fallback.
 *  Las claves del código SON el texto es-DO, así que un usuario dominicano
 *  no descarga ni un byte de traducciones. */
export const DEFAULT_LOCALE = 'es-DO';

/** Clave de localStorage. Espejo client-side de `user_profiles.locale`, para
 *  fijar `<html lang>` antes del primer paint (el perfil llega por red). */
export const LOCALE_STORAGE_KEY = 'mealfit_locale';

/**
 * Los idiomas, en el orden en que se pintan.
 *
 * `native` va en el propio idioma a propósito: quien busca su idioma en una
 * lista no sabe leer la que tiene delante. Por eso «Français» y no «Francés».
 *
 * [P1-I18N-LABEL-NEUTRAL · 2026-08-15] SIN paréntesis de país, y la regla es
 * general: **el paréntesis existe para desambiguar, y no hay nada que
 * desambiguar cuando se ofrece UNA sola variante por idioma.**
 *
 * Nació como un problema concreto: «Español (República Dominicana)» le decía a
 * un cliente español «esto no es para ti», que es exactamente lo contrario de
 * lo que hace falta si el producto se va a vender fuera de RD. Y quitarlo solo
 * del español dejaba a los otros cuatro con país, lo que se lee como descuido.
 *
 * El día que existan DOS variantes de una misma lengua, el paréntesis vuelve —
 * pero a las dos: «Español (España)» + «Español (Latinoamérica)», nunca a una
 * sola. Una lista donde un idioma lleva país y su gemelo no obliga al usuario a
 * deducir cuál es cuál.
 *
 * ⚠️ El CÓDIGO no sigue a la etiqueta. `es-DO` se queda: `Intl` formatea
 * `es-DO` como 2,000 / 1,234.5 (convención de EE.UU., que es la dominicana) y
 * `es`/`es-ES` como 2000 / 1234,5. Cambiar el código «para que sea neutro»
 * mueve los separadores de miles y decimales de TODA la base actual sin que
 * nadie lo haya pedido. La etiqueta es lo único que el usuario lee; el código
 * es un identificador interno con consecuencias de formato.
 */
export const LOCALES = [
    { code: 'es-DO', native: 'Español' },
    { code: 'en-US', native: 'English' },
    { code: 'pt-BR', native: 'Português' },
    { code: 'fr-FR', native: 'Français' },
    { code: 'it-IT', native: 'Italiano' },
];

export const LOCALE_CODES = LOCALES.map((l) => l.code);

/** True si `code` es uno de los soportados. Fail-closed: cualquier otra cosa
 *  (null, basura de localStorage, valor viejo de la DB) cae al default. */
export function isSupportedLocale(code) {
    return typeof code === 'string' && LOCALE_CODES.includes(code);
}

/** Normaliza a un locale soportado; nunca lanza, nunca devuelve inválido. */
export function coerceLocale(code) {
    return isSupportedLocale(code) ? code : DEFAULT_LOCALE;
}

/** Etiqueta nativa de un código (para el selector y los aria-label). */
export function localeLabel(code) {
    const hit = LOCALES.find((l) => l.code === code);
    return hit ? hit.native : code;
}

// [P1-AUTO-LOCALE · 2026-08-20] Idioma del DISPOSITIVO, no del sitio.
//
// Hasta hoy `getStoredLocale()` leía localStorage y, si no había nada, caía a es-DO.
// O sea que un visitante nuevo veía español SIEMPRE — por definición, no por fallo.
//
// IDIOMA, NO UBICACIÓN. La petición hablaba de «dónde está el teléfono», pero es el
// idioma del dispositivo lo que se usa aquí, que es lo que hacen Anthropic u OpenAI y
// lo que acierta más: un dominicano en Miami con el móvil en español debe leer español,
// y un inglés de vacaciones en Punta Cana debe leer inglés. La geo-IP se equivoca justo
// con viajeros, emigrados y VPN, y exige un servicio externo para acertar menos.
//
// Se mira `navigator.languages` (la lista ORDENADA de preferencias) y no solo
// `navigator.language`: quien tiene el sistema en inglés pero prefiere portugués lo
// declara ahí, y quedarse con el primero desperdicia lo que el usuario ya dijo.
//
// Coincidencia por etiqueta exacta primero y por subetiqueta después: `en-GB` no está
// en la lista pero es inglés, y mandarlo a español por no ser `en-US` seria absurdo.
// `es-ES` cae en es-DO por la misma regla — es la única variante de español que
// ofrecemos, y la etiqueta ya no dice «República Dominicana» justamente por esto.
//
// Fail-closed como todo lo demás en este archivo: sin `navigator`, con la lista vacía o
// con basura, devuelve el default. Nunca lanza.
export function detectBrowserLocale() {
    let preferidos = [];
    try {
        const nav = typeof navigator !== 'undefined' ? navigator : null;
        if (!nav) return DEFAULT_LOCALE;
        preferidos = Array.isArray(nav.languages) && nav.languages.length
            ? nav.languages
            : [nav.language].filter(Boolean);
    } catch {
        return DEFAULT_LOCALE;
    }

    for (const bruto of preferidos) {
        if (typeof bruto !== 'string' || !bruto.trim()) continue;
        const etiqueta = bruto.trim();
        // 1. Exacta, sin importar mayúsculas (`EN-us` es válido en la especificación).
        const exacta = LOCALE_CODES.find((c) => c.toLowerCase() === etiqueta.toLowerCase());
        if (exacta) return exacta;
        // 2. Por subetiqueta primaria: `en` → `en-US`, `pt` → `pt-BR`, `es` → `es-DO`.
        const primaria = etiqueta.toLowerCase().split('-')[0];
        const porIdioma = LOCALE_CODES.find((c) => c.toLowerCase().split('-')[0] === primaria);
        if (porIdioma) return porIdioma;
    }
    return DEFAULT_LOCALE;
}
