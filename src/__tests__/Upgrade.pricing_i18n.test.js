/* [P1-PRICING-I18N · 2026-08-20] Los nombres de plan seguían en español.
 *
 * Reportado con captura de `/dashboard/upgrade` en inglés: «Gratis», «Básico»,
 * «/mes», «5× más créditos que Gratis», «Todo lo incluido en Básico». Plus y Max ya
 * eran neutras, así que la pantalla se leía a medio traducir.
 *
 * ESTO CAMBIA UNA DECISIÓN ESCRITA. `P2-TIER-DISPLAY-NAME` decía que los nombres
 * comerciales «no pasan por el catálogo: son dato, igual que en PayPal». Decisión del
 * dueño (2026-08-20): «Gratis» y «Básico» son palabras españolas, no marcas.
 *
 * LO QUE HACE ESTO SEGURO, y es lo único que de verdad importa aquí: las CLAVES
 * internas (`gratis`/`basic`/`plus`/`ultra`) NO se tocan. Las usan PayPal,
 * `user_profiles.plan_tier`, los knobs y `auth._TIER_LIMITS`. Se traduce la capa
 * visible, que es justo la costura que aquel P-fix ya había separado. Si alguien
 * traduce una CLAVE, el cobro apunta a un plan que no existe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
    TIER_DISPLAY_NAME, TIER_CREDITS, TIER_PREDECESSOR,
    tierDisplayName, periodLabel, creditsVsPredecessor, includesPredecessor,
} from '../config/plans';
import { loadLocale } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';

const __dirname = dirname(fileURLToPath(import.meta.url));
const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf-8');

const T = {
    'Gratis': 'Free', 'Básico': 'Basic', 'Plus': 'Plus', 'Max': 'Max',
    '/mes': '/mo', '/año': '/yr',
    '{factor}× más créditos que {plan}': '{factor}× more credits than {plan}',
    'Todo lo incluido en {plan}': 'Everything in {plan}',
};
const t = (k, vars) => {
    let s = T[k] ?? k;
    if (vars) for (const [n, v] of Object.entries(vars)) s = s.split(`{${n}}`).join(String(v));
    return s;
};

describe('[P1-PRICING-I18N] las CLAVES internas no se traducen', () => {
    it('los cuatro tiers conservan su clave', () => {
        // El contrato que protege el cobro. `ultra` es la clave y `Max` el nombre:
        // confundirlos manda a PayPal un plan que no existe.
        expect(Object.keys(TIER_DISPLAY_NAME).sort()).toEqual(['basic', 'gratis', 'plus', 'ultra']);
        expect(Object.keys(TIER_CREDITS).sort()).toEqual(['basic', 'gratis', 'plus', 'ultra']);
        expect(Object.keys(TIER_PREDECESSOR).sort()).toEqual(['basic', 'plus', 'ultra']);
    });

    it('`Upgrade.jsx` nunca traduce el tier que viaja al checkout', () => {
        const src = leer('pages/Upgrade.jsx');
        // El `tier` de `renderPlanCard`/`handleUpgradeClick` es la clave cruda.
        expect(src).toMatch(/renderPlanCard\('gratis',/);
        expect(src).toMatch(/renderPlanCard\('ultra',/);
        expect(src).not.toMatch(/renderPlanCard\(t\(/);
    });
});

describe('[P1-PRICING-I18N] la capa visible sí se traduce', () => {
    it('el nombre comercial pasa por t()', () => {
        expect(tierDisplayName('gratis', t)).toBe('Free');
        expect(tierDisplayName('basic', t)).toBe('Basic');
        expect(tierDisplayName('ultra', t)).toBe('Max');
    });

    it('sin `t` devuelve el español — el landing sigue igual', () => {
        // `Pricing.jsx` (marketing, es-DO) llama sin `t` a propósito: una sola fuente,
        // y decide quien pinta.
        expect(tierDisplayName('gratis')).toBe('Gratis');
        expect(creditsVsPredecessor('basic')).toBe('5× más créditos que Gratis');
        expect(includesPredecessor('plus')).toBe('Todo lo incluido en Básico');
    });

    it('el periodo se traduce', () => {
        expect(periodLabel('/mes', t)).toBe('/mo');
        expect(periodLabel('/año', t)).toBe('/yr');
        expect(periodLabel('/mes')).toBe('/mes');
    });

    it('los derivados usan el nombre YA traducido del escalón anterior', () => {
        // El bug que esto evita: traducir la frase y dejar el nombre en español
        // («5× more credits than Gratis»).
        expect(creditsVsPredecessor('basic', t)).toBe('5× more credits than Free');
        expect(includesPredecessor('basic', t)).toBe('Everything in Free');
        expect(includesPredecessor('plus', t)).toBe('Everything in Basic');
    });

    it('el múltiplo sigue DERIVÁNDOSE de los créditos, no escribiéndose', () => {
        // P2-LADDER-VS-PREDECESSOR: tocar el ladder sin tocar el copy dejaría la
        // página prometiendo saltos que ya no existen.
        expect(creditsVsPredecessor('plus', t)).toContain(String(TIER_CREDITS.plus / TIER_CREDITS.basic));
        expect(creditsVsPredecessor('gratis', t)).toBeNull();
    });

    // [P3-I18N-LADDER-COMA-DECIMAL-CLAVADA · 2026-08-23] El factor no entero (ultra/plus =
    // 2,5) salía con coma A MANO en los cinco idiomas — y en es-DO lo correcto es «2.5»
    // (convención de EE.UU., la dominicana). El separador lo decide el locale activo.
    it('el separador decimal del múltiplo lo decide el locale, no una coma escrita a mano', async () => {
        const ratio = TIER_CREDITS.ultra / TIER_CREDITS.plus;
        expect(Number.isInteger(ratio), 'el caso necesita un múltiplo no entero; si el ladder cambió, elige otro par').toBe(false);
        await loadLocale('fr-FR');
        expect(creditsVsPredecessor('ultra', t)).toMatch(/^2,5×/);
        await loadLocale('en-US');
        expect(creditsVsPredecessor('ultra', t)).toMatch(/^2\.5×/);
        await loadLocale(DEFAULT_LOCALE);
        expect(creditsVsPredecessor('ultra', t), 'es-DO formatea 2.5, no 2,5').toMatch(/^2\.5×/);
        // Sin `t` (landing es-DO): el punto, no la coma.
        expect(creditsVsPredecessor('ultra')).toMatch(/^2\.5× más créditos/);
    });
});

describe('[P1-PRICING-I18N] los literales son visibles para i18n:check', () => {
    it('los nombres y periodos están dentro de llamadas t() explícitas', () => {
        // Pasarlos por variable (`t(base)`) los vuelve invisibles al checker, que los
        // da por HUÉRFANOS — y ese aviso («cambiaron el copy y la traducción quedó
        // atrás») se apaga a base de falsos positivos.
        const src = leer('config/plans.js');
        for (const k of ['Gratis', 'Básico', 'Plus', 'Max', '/mes', '/año']) {
            expect(src, `«${k}» no aparece como literal en un t()`).toContain(`t('${k}')`);
        }
    });

    it('esos mapas viven DENTRO de funciones (trampa del congelado)', () => {
        const src = leer('config/plans.js');
        expect(src).toMatch(/function _nombresTraducidos\(t\)/);
        expect(src).toMatch(/function _periodosTraducidos\(t\)/);
        // La asercion mira lo que IMPORTA —una llamada t() en ambito de modulo— y no
        // el nombre del mapa: la primera version exigia que terminara en «Traducidos»
        // y una mutacion que le anadia un sufijo la dejaba VERDE. Un guard atado al
        // nombre no protege la propiedad.
        const enModulo = src
            .split('\n')
            .filter((l) => /^(const|let|var)\s/.test(l) && /(?<![\w.])t\(\s*['"]/.test(l));
        expect(enModulo, `hay t() en ámbito de módulo: ${enModulo.join(' | ')}`).toEqual([]);
    });
});
