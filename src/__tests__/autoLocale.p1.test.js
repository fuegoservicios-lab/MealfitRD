/* [P1-AUTO-LOCALE · 2026-08-20] El login ya estaba traducido; lo que faltaba era ELEGIR
 * el idioma.
 *
 * `getStoredLocale()` leía localStorage y, sin nada guardado, caía a es-DO. O sea que un
 * visitante nuevo veía español SIEMPRE — por definición, no por fallo. Y el dueño lo veía
 * también cada vez que hacía «Clear site data», porque eso borra `mealfit_locale`.
 *
 * IDIOMA DEL DISPOSITIVO, NO UBICACIÓN. La petición hablaba de «dónde está el teléfono»;
 * se implementa por idioma, que es lo que hacen Anthropic u OpenAI y lo que acierta más:
 * un dominicano en Miami con el móvil en español debe leer español, y un inglés de
 * vacaciones en Punta Cana debe leer inglés. La geo-IP falla justo con viajeros,
 * emigrados y VPN, y encima exige un servicio externo para acertar menos.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { detectBrowserLocale } from '../i18n/locales';

const __dirname = dirname(fileURLToPath(import.meta.url));
const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf-8');

const conIdiomas = (langs) => {
    vi.stubGlobal('navigator', { languages: langs, language: langs?.[0] });
};
afterEach(() => vi.unstubAllGlobals());

describe('[P1-AUTO-LOCALE] detectBrowserLocale', () => {
    it('coincidencia exacta', () => {
        conIdiomas(['en-US']);
        expect(detectBrowserLocale()).toBe('en-US');
    });

    it('por subetiqueta: `en-GB` es inglés aunque no esté en la lista', () => {
        // Mandarlo a español por no ser exactamente `en-US` sería absurdo, y es el
        // error más fácil de cometer aquí.
        conIdiomas(['en-GB']);
        expect(detectBrowserLocale()).toBe('en-US');
    });

    it('España cae en nuestro español', () => {
        // La única variante de español que ofrecemos. Es la razón por la que la
        // etiqueta del selector ya no dice «República Dominicana».
        conIdiomas(['es-ES']);
        expect(detectBrowserLocale()).toBe('es-DO');
        conIdiomas(['es-MX']);
        expect(detectBrowserLocale()).toBe('es-DO');
    });

    it('respeta el ORDEN de preferencia, no solo el primero', () => {
        // Sistema en un idioma que no tenemos, pero con portugués declarado después.
        // Quedarse con `navigator.language` desperdiciaría lo que el usuario ya dijo.
        conIdiomas(['de-DE', 'pt-BR', 'en-US']);
        expect(detectBrowserLocale()).toBe('pt-BR');
    });

    it('no distingue mayúsculas (la especificación las permite)', () => {
        conIdiomas(['EN-us']);
        expect(detectBrowserLocale()).toBe('en-US');
    });

    it('fail-closed: idioma desconocido, lista vacía o basura → es-DO', () => {
        conIdiomas(['de-DE']);
        expect(detectBrowserLocale()).toBe('es-DO');
        conIdiomas([]);
        expect(detectBrowserLocale()).toBe('es-DO');
        conIdiomas([null, '', 42]);
        expect(detectBrowserLocale()).toBe('es-DO');
    });

    it('sin `navigator` no revienta', () => {
        vi.stubGlobal('navigator', undefined);
        expect(detectBrowserLocale()).toBe('es-DO');
    });
});

describe('[P1-AUTO-LOCALE] lo guardado gana, y el landing queda fuera', () => {
    const motor = leer('i18n/index.js');

    it('una elección explícita gana sobre la detección', () => {
        // Sin este orden el selector de Configuración sería decorativo para cualquiera
        // cuyo móvil esté en otro idioma: elegiría, y al recargar volvería a lo del
        // dispositivo.
        expect(motor).toMatch(/const guardado = safeLocalStorageGet\(LOCALE_STORAGE_KEY, null\)/);
        expect(motor).toMatch(/if \(isSupportedLocale\(guardado\)\) return guardado;/);
    });

    it('NO se detecta en las rutas de marketing', () => {
        // El landing tiene hoy 72 llamadas sueltas a `t()` en 6.698 líneas: detectar allí
        // traduciría ESAS 72 y nada más — medio en inglés, que es peor que entero en
        // español. Se abre cuando el landing esté al 100%.
        expect(motor).toMatch(/isPaperSurface\(window\.location\.pathname\)/);
        expect(motor).toMatch(/return DEFAULT_LOCALE;/);
    });

    it('usa el SSOT de rutas, no una segunda lista', () => {
        expect(motor).toMatch(/import \{ isPaperSurface \} from '\.\.\/utils\/paperSurface'/);
    });
});

describe('[P1-AUTO-LOCALE] el boot de index.html hace lo mismo', () => {
    const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf-8');
    const bloque = html.slice(html.indexOf('var SUPPORTED'), html.indexOf('</script>', html.indexOf('var SUPPORTED')));

    it('detecta antes del primer paint', () => {
        // Sin esto, `<html lang>` y el splash arrancan en español para un visitante
        // nuevo y React corrige medio segundo después: parpadeo.
        expect(bloque).toContain('navigator.languages');
    });

    // [P1-I18N-BOOT-DEFAULT-INDEX0 · 2026-08-21] Este test decía
    //
    //     expect(bloque).toContain("SUPPORTED.indexOf(stored) > 0 ? stored : null");
    //
    // y se llamaba «lo guardado sigue ganando». Lo que anclaba era la cadena literal
    // del caso en que NO gana: `SUPPORTED[0]` es 'es-DO', su `indexOf` es 0, y 0 no
    // supera el `> 0`. Un 'es-DO' guardado se leía como «no hay nada guardado» y caía
    // a la autodetección — así que un dominicano con el navegador en inglés que había
    // elegido Español a mano veía el splash en INGLÉS y `<html lang="en-US">`, y sólo
    // después React lo corregía. Las dos capas discrepaban sobre qué significa «nada
    // guardado»: `getStoredLocale()` (i18n/index.js) sí respeta 'es-DO'.
    //
    // Y arreglar el bug ponía este test en ROJO. Un `toContain` de una expresión no
    // puede distinguir la versión correcta de la rota: ese era el defecto, no un
    // detalle del arreglo. Ahora se mide CONDUCTA, evaluando el bloque de verdad.
    const evaluarBoot = ({ guardado = null, idiomas = [], ruta = '/dashboard' } = {}) => {
        const cuerpo = html.slice(
            html.indexOf('var SUPPORTED'),
            html.indexOf('} catch', html.indexOf('var SUPPORTED')),
        );
        const raiz = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
        const win = {};
        // eslint-disable-next-line no-new-func
        const correr = new Function(
            'localStorage', 'navigator', 'location', 'document', 'window',
            `${cuerpo}\n;return { elegido: typeof elegido === 'undefined' ? null : elegido };`,
        );
        const { elegido } = correr(
            { getItem: () => guardado },
            { languages: idiomas, language: idiomas[0] },
            { pathname: ruta },
            { documentElement: raiz },
            win,
        );
        return { elegido, lang: raiz.attrs.lang, publicado: win.__mfLocale };
    };

    it('un `es-DO` GUARDADO gana sobre el idioma del dispositivo', () => {
        // El caso que el `> 0` rompía. Un dominicano con Chrome en inglés que eligió
        // Español a mano: si la detección le gana, el splash sale en inglés y
        // VoiceOver anuncia la pantalla en el idioma equivocado — que es exactamente
        // la razón por la que este boot existe.
        const r = evaluarBoot({ guardado: 'es-DO', idiomas: ['en-US'] });
        expect(r.elegido).toBe('es-DO');
        expect(r.publicado).toBeUndefined();   // es-DO ya es el `lang` estático
        expect(r.lang).toBeUndefined();
    });

    it('cualquier otro idioma guardado también gana', () => {
        // No regresión: el caso que el `> 0` sí acertaba, por estar en índice >= 1.
        const r = evaluarBoot({ guardado: 'fr-FR', idiomas: ['en-US'] });
        expect(r.elegido).toBe('fr-FR');
        expect(r.publicado).toBe('fr-FR');
        expect(r.lang).toBe('fr-FR');
    });

    it('sin nada guardado, manda el dispositivo', () => {
        const r = evaluarBoot({ guardado: null, idiomas: ['fr-FR'] });
        expect(r.elegido).toBe('fr-FR');
        expect(r.lang).toBe('fr-FR');
    });

    it('un valor basura en localStorage no cuenta como elección', () => {
        const r = evaluarBoot({ guardado: 'jp', idiomas: ['pt-BR'] });
        expect(r.elegido).toBe('pt-BR');
    });

    it('y tampoco detecta en el landing', () => {
        expect(bloque).toContain('enMarketing');
    });

    it('la lista de rutas de marketing coincide con el SSOT', () => {
        // Copia literal por necesidad (corre antes que cualquier módulo), anclada aquí
        // para que no drifee — mismo trato que la lista de idiomas.
        const ssot = leer('utils/paperSurface.js');
        for (const ruta of ['/precios', '/como-funciona', '/motor', '/supermercado']) {
            expect(bloque, `${ruta} falta en el boot`).toContain(`'${ruta}'`);
            expect(ssot, `${ruta} falta en el SSOT`).toContain(`'${ruta}'`);
        }
    });
});
