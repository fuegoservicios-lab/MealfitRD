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

// [P1-COUNTRY-SYSTEM-F2 · 2026-08-17] Preselección por zona horaria IANA
// (Addendum §4 del dueño, spec 2026-08-16-sistema-paises-design.md). Mapea el
// NOMBRE de la zona (`Intl.DateTimeFormat().resolvedOptions().timeZone`) a un
// país — JAMÁS el offset numérico: RD y Puerto Rico comparten -240 los 365
// días del año, así que un mapeo por offset sería indistinguible por diseño
// (la razón exacta que el dueño cita para prohibirlo). Tampoco geo-IP externa
// (dependencia/privacidad/VPN). Test de paridad backend: todo código que esta
// tabla emite DEBE existir en `constants.COUNTRY_PROFILES`.
//
// tooltip-anchor: TZ_COUNTRY_EXACT, TZ_COUNTRY_PREFIXES, countryFromTimeZone
// (backend/tests/test_p1_country_system_f2.py) — ese test parsea estos TRES
// nombres por regex sobre este fuente; renombrar cualquiera sin tocar el test
// lo rompe primero a él, no a producción.
//
// Exact-match primero (O(1)); las únicas zonas que necesitan PREFIJO son las
// que empiezan con "America/Indiana/" o "America/Kentucky/" — condados de
// EE.UU. sin una zona IANA única por su historial de DST no uniforme.
//
// [CUIDADO al editar este comentario]: nunca peguen barra y asterisco
// consecutivos en esta prosa (por ejemplo para denotar un comodín de ruta) —
// esos dos caracteres los interpreta como inicio de comentario de bloque el
// stripper de los tests backend (parser CRLF-safe), que se come todo el
// texto hasta el próximo cierre de bloque que encuentre en el archivo. Por
// esa razón este archivo usa solo comentarios de línea, nunca de bloque.
const TZ_COUNTRY_EXACT = {
    'America/Santo_Domingo': 'DO',
    'America/Puerto_Rico': 'PR',
    'Europe/Madrid': 'ES',
    'Atlantic/Canary': 'ES',
    'America/Bogota': 'CO',
    // México
    'America/Mexico_City': 'MX',
    'America/Cancun': 'MX',
    'America/Merida': 'MX',
    'America/Monterrey': 'MX',
    'America/Tijuana': 'MX',
    'America/Chihuahua': 'MX',
    'America/Hermosillo': 'MX',
    'America/Mazatlan': 'MX',
    'America/Matamoros': 'MX',
    'America/Ojinaga': 'MX',
    'America/Bahia_Banderas': 'MX',
    // Estados Unidos (continental + Alaska/Hawái)
    'America/New_York': 'US',
    'America/Chicago': 'US',
    'America/Denver': 'US',
    'America/Phoenix': 'US',
    'America/Los_Angeles': 'US',
    'America/Anchorage': 'US',
    'Pacific/Honolulu': 'US',
    'America/Detroit': 'US',
    'America/Boise': 'US',
};

const TZ_COUNTRY_PREFIXES = [
    ['America/Indiana/', 'US'],
    ['America/Kentucky/', 'US'],
];

// Traduce el NOMBRE de una zona horaria IANA a un país ISO-3166 alpha-2.
// Toma una zona (string) — nunca un offset. Desconocido/ausente/basura/un
// offset ⇒ `DEFAULT_COUNTRY` ('DO'), el mismo fail-safe que `coerceCountry`.
export function countryFromTimeZone(tzName) {
    if (typeof tzName === 'string' && tzName.length > 0) {
        const exact = TZ_COUNTRY_EXACT[tzName];
        if (exact) return exact;
        for (const [prefix, code] of TZ_COUNTRY_PREFIXES) {
            if (tzName.startsWith(prefix)) return code;
        }
    }
    return DEFAULT_COUNTRY;
}
