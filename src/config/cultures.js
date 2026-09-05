// [P1-ARQ25-F7-CULTURE · 2026-09-05] SSOT frontend de los perfiles de cocina (Fase 7 del roadmap 2.5).
//
// La cocina va SEPARADA del país de compra (I16): `formData.country` decide precios, catálogo, moneda
// y medidas; `formData.cultureProfiles` decide qué platos inspiran el plan. Espejo de
// `backend/cultural_profiles.py::PROFILES` — el test `backend/tests/test_p1_arq25_f7_culture.py` lee
// ESTE archivo y falla si un id, una etiqueta, una intensidad o el tope dejan de coincidir.
//
// `id` es EL DATO del motor (viaja en `cultureProfiles.main` / `.secondary[].profile_id`);
// `labelKey` es la clave española que i18n traduce; `marketDefault` es el país cuya cocina es esta
// (para la bandera y para la sugerencia «la de tu país de compra»).
//
// Sin elección, el campo queda `null` — NO se siembra la sugerencia (lección P1-COUNTRY-SYSTEM-F0:
// un default sembrado es indistinguible de una elección). El backend usa la cocina del país de compra
// y la declara en la política.
import { coerceCountry } from './countries';
// `i18nKey` declara la clave para `npm run i18n:check` (el extractor es textual: no ve `t(c.labelKey)`).
import { i18nKey } from '../i18n';

// Knob del paso (VITE_CULTURAL_PROFILES). Encendido salvo '0' / 'false' / 'off'; el paso además
// exige COUNTRY_SYSTEM_UI (sin país de compra visible no hay sugerencia que explicar).
export const CULTURE_PROFILES_UI = !['0', 'false', 'off'].includes(
    String(import.meta.env.VITE_CULTURAL_PROFILES ?? '').toLowerCase(),
);

export const CULTURES = [
    { id: 'dominican_criolla', labelKey: i18nKey('Cocina dominicana'), marketDefault: 'DO' },
    { id: 'puertorico_criolla', labelKey: i18nKey('Cocina puertorriqueña'), marketDefault: 'PR' },
    { id: 'mexico_casera', labelKey: i18nKey('Cocina mexicana'), marketDefault: 'MX' },
    { id: 'colombia_casera', labelKey: i18nKey('Cocina colombiana'), marketDefault: 'CO' },
    { id: 'spain_mediterranea', labelKey: i18nKey('Cocina española'), marketDefault: 'ES' },
    { id: 'us_everyday', labelKey: i18nKey('Cocina estadounidense cotidiana'), marketDefault: 'US' },
];

// Intensidad de una cocina secundaria → parte aproximada de las comidas (espejo de INTENSITY_WEIGHT).
export const CULTURE_INTENSITIES = ['ocasional', 'frecuente', 'predominante'];
export const INTENSITY_SHARE = { ocasional: 15, frecuente: 30, predominante: 45 };
export const DEFAULT_INTENSITY = 'frecuente';
export const MAX_SECONDARY_CULTURES = 2;
export const DEFAULT_CULTURE = 'dominican_criolla';

const _BY_ID = new Map(CULTURES.map((c) => [c.id, c]));

export const isCultureId = (id) => typeof id === 'string' && _BY_ID.has(id);

/** La cocina cuyo país de compra es `code` (fail-safe: la dominicana). */
export const cultureForCountry = (code) =>
    CULTURES.find((c) => c.marketDefault === coerceCountry(code))?.id || DEFAULT_CULTURE;

/** Código de país de la cocina (para la bandera). */
export const countryForCulture = (id) => _BY_ID.get(id)?.marketDefault || 'DO';

export const cultureLabel = (t, id) => {
    const c = _BY_ID.get(id);
    return c ? t(c.labelKey) : String(id || '');
};

export const intensityLabel = (t, id) => ({
    ocasional: t('Ocasional'), frecuente: t('Frecuente'), predominante: t('Predominante'),
})[id] || id;

/** Platos que definen cada cocina (familias, no estereotipos): copy del paso, en render. */
export const cultureHints = (t) => ({
    dominican_criolla: t('Arroz con habichuelas, guisos, víveres, sancocho, mangú'),
    puertorico_criolla: t('Arroz con gandules, pernil, mofongo, sofrito, tostones'),
    mexico_casera: t('Tortillas, salsas, guisados caseros, frijoles, caldos'),
    colombia_casera: t('Arepas, sopas, fríjoles, arroz con pollo, sudados'),
    spain_mediterranea: t('Legumbres, pescado, aceite de oliva, guisos y plancha'),
    us_everyday: t('Desayunos rápidos, ensaladas, sándwiches, horneados y parrilla'),
});

/**
 * Valor válido del campo o `null`: id conocido como principal, hasta dos secundarias distintas de
 * la principal y entre sí, intensidad conocida (o la de siempre). Cualquier basura ⇒ `null`.
 */
export const normalizeCultureProfiles = (value) => {
    if (!value || typeof value !== 'object' || !isCultureId(value.main)) return null;
    const seen = new Set([value.main]);
    const secondary = [];
    for (const s of Array.isArray(value.secondary) ? value.secondary : []) {
        const pid = s && typeof s === 'object' ? s.profile_id : null;
        if (!isCultureId(pid) || seen.has(pid)) continue;
        seen.add(pid);
        secondary.push({ profile_id: pid, intensity: CULTURE_INTENSITIES.includes(s.intensity) ? s.intensity : DEFAULT_INTENSITY });
        if (secondary.length >= MAX_SECONDARY_CULTURES) break;
    }
    return { main: value.main, secondary };
};

/**
 * «Cocina dominicana 70 % · Cocina española 30 %» a partir de `culture_weights` del backend
 * ([{profile_id, weight}]); una sola cocina ⇒ solo su nombre. Vacío ⇒ ''.
 */
export const cultureWeightsSummary = (t, weights) => {
    const ws = (Array.isArray(weights) ? weights : []).filter((w) => w && isCultureId(w.profile_id));
    if (!ws.length) return '';
    if (ws.length === 1) return cultureLabel(t, ws[0].profile_id);
    return ws.map((w) => `${cultureLabel(t, w.profile_id)} ${Math.round(Number(w.weight || 0) * 100)} %`).join(' · ');
};
