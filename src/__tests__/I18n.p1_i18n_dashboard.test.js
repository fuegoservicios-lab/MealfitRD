/**
 * [P1-I18N-DASHBOARD · 2026-08-15] Contrato del motor de idioma.
 *
 * Lo que este archivo protege, por orden de gravedad si se rompe:
 *
 *  1. FALLBACK AL ESPAÑOL. La clave ES el texto es-DO, así que una cadena sin
 *     traducir debe pintar español — nunca la clave en crudo, nunca vacío. Si
 *     esto se rompe, una migración a medias deja pantallas ilegibles en vez de
 *     pantallas mitad traducidas.
 *  2. FAIL-CLOSED del locale. Basura en localStorage o en la DB cae a es-DO sin
 *     lanzar. Un locale inválido que llegue al motor no puede tumbar el arranque.
 *  3. Interpolación y plural. Un placeholder sin valor se queda LITERAL (`{n}`
 *     visible es un bug evidente; `undefined` parece copy y sobrevive a la
 *     revisión). El plural pasa por `Intl.PluralRules`, no por `n === 1`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SUPERSEDED, formatNumber, getLocale, loadLocale, t, tn } from '../i18n';
import {
    DEFAULT_LOCALE,
    LOCALES,
    LOCALE_CODES,
    coerceLocale,
    isSupportedLocale,
    localeLabel,
} from '../i18n/locales';

describe('[P1-I18N-DASHBOARD] SSOT de idiomas', () => {
    it('es-DO es el idioma base y NO tiene catálogo propio', () => {
        expect(DEFAULT_LOCALE).toBe('es-DO');
        expect(LOCALE_CODES[0]).toBe('es-DO');
    });

    it('los 5 idiomas soportados están declarados con etiqueta nativa', () => {
        expect(LOCALE_CODES).toEqual(['es-DO', 'en-US', 'pt-BR', 'fr-FR', 'it-IT']);
        for (const l of LOCALES) {
            expect(typeof l.native).toBe('string');
            expect(l.native.length).toBeGreaterThan(0);
        }
    });

    it('la etiqueta va en el PROPIO idioma, no traducida al español', () => {
        // Quien busca su idioma en una lista no sabe leer la que tiene delante.
        expect(localeLabel('fr-FR')).toContain('Français');
        expect(localeLabel('pt-BR')).toContain('Português');
        expect(localeLabel('en-US')).toContain('English');
        expect(localeLabel('it-IT')).toContain('Italiano');
    });

    it('coerceLocale es fail-closed ante cualquier basura', () => {
        for (const junk of [null, undefined, '', 'jp', 'fr', 'es-ES', 'français', 42, {}, []]) {
            expect(coerceLocale(junk)).toBe(DEFAULT_LOCALE);
        }
        expect(coerceLocale('fr-FR')).toBe('fr-FR');
    });

    it('isSupportedLocale no acepta prefijos ni valores no-string', () => {
        expect(isSupportedLocale('fr')).toBe(false);
        expect(isSupportedLocale('fr-FR')).toBe(true);
        expect(isSupportedLocale(null)).toBe(false);
        expect(isSupportedLocale(['fr-FR'])).toBe(false);
    });
});

describe('[P1-I18N-DASHBOARD] t() — fallback e interpolación', () => {
    beforeEach(async () => {
        await loadLocale(DEFAULT_LOCALE);
    });

    it('sin catálogo devuelve el ESPAÑOL, que es la clave', () => {
        expect(t('Guardar cambios')).toBe('Guardar cambios');
        expect(getLocale()).toBe('es-DO');
    });

    it('interpola {var}', () => {
        expect(t('Hola, {nombre}', { nombre: 'Ana' })).toBe('Hola, Ana');
        expect(t('{a} de {b}', { a: 3, b: 7 })).toBe('3 de 7');
    });

    it('un placeholder SIN valor se queda literal, no imprime "undefined"', () => {
        // Un `{dias}` visible es un bug evidente en una captura; un "undefined"
        // parece copy y pasa la revisión.
        expect(t('Quedan {dias} días')).toBe('Quedan {dias} días');
        expect(t('Quedan {dias} días', {})).toBe('Quedan {dias} días');
        expect(t('Quedan {dias} días', { dias: null })).toBe('Quedan {dias} días');
        expect(t('Quedan {dias} días', { otra: 1 })).toBe('Quedan {dias} días');
    });

    it('el valor 0 SÍ se interpola (0 es un dato, no una ausencia)', () => {
        expect(t('Te quedan {n} créditos', { n: 0 })).toBe('Te quedan 0 créditos');
    });

    it('el sufijo de contexto no se pinta: t("Plan|nav") → "Plan"', () => {
        expect(t('Plan|nav')).toBe('Plan');
        expect(t('Plan|sustantivo')).toBe('Plan');
    });

    it('entradas no-string devuelven cadena vacía sin lanzar', () => {
        expect(t(null)).toBe('');
        expect(t(undefined)).toBe('');
        expect(t('')).toBe('');
    });
});

describe('[P1-I18N-DASHBOARD] tn() — plural', () => {
    beforeEach(async () => {
        await loadLocale(DEFAULT_LOCALE);
    });

    it('en español usa la regla nativa n === 1', () => {
        expect(tn(1, '{n} día', '{n} días', { n: 1 })).toBe('1 día');
        expect(tn(2, '{n} día', '{n} días', { n: 2 })).toBe('2 días');
        expect(tn(0, '{n} día', '{n} días', { n: 0 })).toBe('0 días');
    });

    it('no lanza con valores raros', () => {
        expect(() => tn(NaN, 'uno', 'varios')).not.toThrow();
        expect(() => tn(undefined, 'uno', 'varios')).not.toThrow();
    });
});

describe('[P1-I18N-DASHBOARD] carga de catálogo', () => {
    it('loadLocale("es-DO") limpia el catálogo y vuelve al base', async () => {
        const ok = await loadLocale('es-DO');
        expect(ok).toBe(true);
        expect(getLocale()).toBe('es-DO');
        expect(t('Cualquier cosa')).toBe('Cualquier cosa');
    });

    it('un locale no soportado cae a es-DO en vez de lanzar', async () => {
        const ok = await loadLocale('jp-JP');
        expect(ok).toBe(true);          // coerce → es-DO, que siempre carga
        expect(getLocale()).toBe('es-DO');
    });

    it('carga un catálogo real y traduce con él', async () => {
        const ok = await loadLocale('en-US');
        expect(ok).toBe(true);
        expect(getLocale()).toBe('en-US');
        // Sea cual sea el contenido del catálogo, una clave AUSENTE debe seguir
        // cayendo al español. Es la garantía que hace segura la migración
        // incremental.
        expect(t('__clave_que_no_existe_en_ningun_catalogo__'))
            .toBe('__clave_que_no_existe_en_ningun_catalogo__');
        await loadLocale(DEFAULT_LOCALE);
    });

    it('los 4 catálogos REALES traducen de verdad', async () => {
        // Hasta aquí todo comprobaba el FALLBACK. Este test comprueba lo
        // contrario: que con catálogo cargado la cadena sale traducida. Sin él,
        // un catálogo vacío o mal cosido pasaría toda la suite en verde —
        // porque un catálogo vacío degrada al español, que es justo lo que el
        // resto de los tests esperan.
        // [P2-I18N-GLOSARIO-NEVERA · 2026-08-21] «Nevera» pasa de la palabra de
        // DESPENSA a la de FRIGORÍFICO. Es el cajón frío, y traducirlo como almacén
        // seco chocaba con «Alacena», que es la otra pestaña de la misma pantalla:
        // los dos vacíos salían idénticos carácter a carácter.
        //
        // El italiano se queda en «Dispensa» A PROPÓSITO y no es un olvido: en
        // italiano `dispensa` es femenino y `frigo` masculino, así que cambiar el
        // término descuadra artículos y adjetivos en las 98 cadenas que lo mencionan
        // («La tua frigo è vuota»). Se intentó por regex y salieron cosas peores
        // («nella tuo frigo»). Queda como gap con nombre propio, para una pasada que
        // revise cadena por cadena. Un término correcto con gramática rota se lee
        // peor que un término impreciso bien escrito.
        const esperado = {
            'en-US': { 'Guardar': 'Save', 'Idioma': 'Language', 'Nevera': 'Fridge', 'Alacena': 'Cupboard' },
            'pt-BR': { 'Guardar': 'Salvar', 'Nevera': 'Geladeira', 'Alacena': 'Armário' },
            'fr-FR': { 'Guardar': 'Enregistrer', 'Idioma': 'Langue', 'Nevera': 'Frigo' },
            'it-IT': { 'Guardar': 'Salva', 'Historial': 'Cronologia', 'Nevera': 'Dispensa' },
        };
        for (const [code, pares] of Object.entries(esperado)) {
            const ok = await loadLocale(code);
            expect(ok, `no se pudo cargar ${code}`).toBe(true);
            for (const [es, traducido] of Object.entries(pares)) {
                expect(t(es), `${code}: ${es}`).toBe(traducido);
            }
        }
        await loadLocale(DEFAULT_LOCALE);
    });

    it('el sufijo de contexto NO se cuela en la traducción', async () => {
        await loadLocale('it-IT');
        // La clave del catálogo lleva el `|nav`; lo que se pinta, no.
        expect(t('Plan|nav')).toBe('Piano');
        expect(t('Plan|nav')).not.toContain('|');
        await loadLocale(DEFAULT_LOCALE);
    });

    it('el plural traducido usa Intl.PluralRules del idioma activo', async () => {
        await loadLocale('fr-FR');
        const clave = 'Algunas recetas mencionan ingredientes que no quedaron bien reflejados en tu lista ({n} detalles). Usa';
        const uno = tn(1, clave, clave, { n: 1 });
        const varios = tn(4, clave, clave, { n: 4 });
        // El francés distingue: «1 détail» vs «4 détails».
        expect(uno).toContain('détail');
        expect(varios).toContain('détails');
        expect(uno).not.toBe(varios);
        await loadLocale(DEFAULT_LOCALE);
    });

    it('dos cargas solapadas: gana la ÚLTIMA PEDIDA, no la que llegue antes', async () => {
        // La carrera es real: `loadLocale` hace `await import(...)` y dos chunks
        // resuelven en el orden en que los sirve la red, no en el que se
        // pidieron. Sin el testigo de petición, un usuario que toca «Français»
        // y acto seguido «Italiano» se queda en francés si el chunk francés
        // tarda más. Lo mismo en el arranque, donde `initLocale` (caché local) y
        // `syncLocaleFromProfile` (servidor) pueden solaparse.
        await loadLocale(DEFAULT_LOCALE);

        const pFr = loadLocale('fr-FR');
        const pIt = loadLocale('it-IT');   // pedida DESPUÉS: debe ganar
        const [okFr, okIt] = await Promise.all([pFr, pIt]);

        expect(getLocale()).toBe('it-IT');
        expect(t('Guardar')).toBe('Salva');
        // [P3-I18N-LOADLOCALE-SUPERSEDED · 2026-08-21] La perdedora devuelve
        // `SUPERSEDED`, no `false`. Antes compartía valor con el fallo real, y eso
        // tenía dos consecuencias: Settings sacaba un toast rojo de conexión cuando el
        // usuario simplemente había tocado dos idiomas seguidos, y era imposible
        // distinguir «no apliqué porque me adelantaron» de «no pude cargar».
        //
        // Devolver `true` habría sido peor que `false`: `setLocale` persiste el idioma
        // cuando la carga va bien, así que la perdedora habría guardado SU locale
        // encima del que el usuario acabó eligiendo.
        expect(okIt).toBe(true);
        expect(okFr).toBe(SUPERSEDED);
        expect(okFr).not.toBe(false);

        await loadLocale(DEFAULT_LOCALE);
    });

    it('fija <html lang> al cargar', async () => {
        await loadLocale('fr-FR');
        expect(document.documentElement.getAttribute('lang')).toBe('fr-FR');
        await loadLocale(DEFAULT_LOCALE);
        expect(document.documentElement.getAttribute('lang')).toBe('es-DO');
    });
});

describe('[P1-I18N-DASHBOARD] formato dependiente del idioma', () => {
    it('formatNumber sigue al locale activo', async () => {
        // OJO con el par que se elige para comparar: es-DO y en-US formatean
        // IGUAL (`1,234.5`). República Dominicana usa punto decimal y coma de
        // millares, como EE.UU. y a diferencia de España — es el error que
        // cometió la primera versión de este test. Para demostrar que el
        // formateador sigue al idioma activo hace falta un par que de verdad
        // difiera: fr-FR usa coma decimal y espacio fino de millares.
        await loadLocale(DEFAULT_LOCALE);
        const es = formatNumber(1234.5, { minimumFractionDigits: 1 });
        await loadLocale('fr-FR');
        const fr = formatNumber(1234.5, { minimumFractionDigits: 1 });

        expect(es).not.toBe(fr);
        expect(es).toContain('.');   // es-DO: 1,234.5
        expect(fr).toContain(',');   // fr-FR: 1 234,5
        await loadLocale(DEFAULT_LOCALE);
    });

    it('es-DO y en-US comparten formato numérico (no es un bug)', () => {
        // Anclado a propósito: si alguien ve `1,234.5` en inglés y en español y
        // cree que el locale no se está aplicando, este test dice que sí se
        // aplica y que la coincidencia es real.
        expect(formatNumber(1234.5, { minimumFractionDigits: 1 })).toBe('1,234.5');
    });

    it('formatNumber devuelve cadena vacía ante valores no numéricos', () => {
        expect(formatNumber(undefined)).toBe('');
        expect(formatNumber('hola')).toBe('');
    });
});
