// [P1-COUNTRY-SYSTEM-F0 · 2026-08-16] SSOT de países del producto.
//
// `code` ISO-3166 alpha-2 y ES EL DATO del motor (viaja en formData.country y
// health_profile.country); `labelKey` es la clave española que i18n traduce.
// Espejo del backend `constants.COUNTRY_PROFILES` — test de paridad en
// backend/tests/test_p1_country_system_f0.py: si añades un país aquí sin
// añadirlo allá (o viceversa), CI rojo.
//
// `COUNTRY_SYSTEM_UI` es la bandera de OSCURO del frontend: sin
// VITE_COUNTRY_SYSTEM=1 o true en el build, ningún selector se monta. El flip
// final (spec 2026-08-16) enciende esta env y MEALFIT_COUNTRY_SYSTEM del
// backend en el mismo deploy.

export const DEFAULT_COUNTRY = 'DO';

export const COUNTRIES = [
    { code: 'DO', labelKey: 'República Dominicana', beta: false },
    { code: 'ES', labelKey: 'España', beta: true },
    { code: 'US', labelKey: 'Estados Unidos', beta: true },
    { code: 'MX', labelKey: 'México', beta: true },
    { code: 'PR', labelKey: 'Puerto Rico', beta: true },
    { code: 'CO', labelKey: 'Colombia', beta: true },
];

const _CODES = new Set(COUNTRIES.map((c) => c.code));

export function coerceCountry(raw) {
    if (typeof raw === 'string') {
        const code = raw.trim().toUpperCase();
        if (_CODES.has(code)) return code;
    }
    return DEFAULT_COUNTRY;
}

export const COUNTRY_SYSTEM_UI = ['1', 'true'].includes(
    String(import.meta.env.VITE_COUNTRY_SYSTEM ?? '').toLowerCase()
);
