// [P1-I18N-DASHBOARD · 2026-08-15] SSOT de los idiomas del dashboard.
//
// Este archivo es la ÚNICA lista de idiomas soportados. Lo consumen:
//   - el selector de Configuración → Apariencia (pinta las opciones),
//   - el motor `src/i18n/index.js` (valida antes de cargar un catálogo),
//   - el boot síncrono de `index.html` (copia literal, anclada por test),
//   - `scripts/i18n-check.mjs` (sabe qué catálogos deben existir),
//   - el backend `_LOCALE_VALUES` + el CHECK de `user_profiles.locale`.
//
// Añadir un idioma es: una entrada aquí + un JSON en `locales/` + la misma
// entrada en el CHECK de la migración y en `_LOCALE_VALUES` del backend. El
// test `test_p1_i18n_dashboard.py` falla si esos cuatro sitios divergen —
// una lista de idiomas que vive en cinco lados y no se verifica es la misma
// forma de drift que P1-DIET-CANON-SSOT cerró para `dietType`.

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
 * lista no sabe leer la que tiene delante. Es la misma razón por la que las
 * capturas de referencia dicen «Français (France)» y no «Francés (Francia)».
 */
export const LOCALES = [
    { code: 'es-DO', native: 'Español (República Dominicana)' },
    { code: 'en-US', native: 'English (United States)' },
    { code: 'pt-BR', native: 'Português (Brasil)' },
    { code: 'fr-FR', native: 'Français (France)' },
    { code: 'it-IT', native: 'Italiano (Italia)' },
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
