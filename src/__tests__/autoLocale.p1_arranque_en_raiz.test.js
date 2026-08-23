/**
 * [P1-I18N-ARRANQUE-EN-RAIZ-MATA-LA-AUTODETECCION · 2026-08-23] La autodetección de idioma
 * estaba apagada en TODA la app nativa y en cada arranque por la raíz.
 *
 * El guard que impide autodetectar en el landing pregunta sólo por `location.pathname`, y
 * `/` está en la lista de superficies de papel. Pero `/` no es sólo la portada del apex:
 *
 *   · es la raíz del host de la app (`app.bioboros.com/`),
 *   · es el `start_url` del manifiesto de la PWA instalada,
 *   · y —lo que más pesa— es la URL con la que arranca SIEMPRE la app nativa de Capacitor
 *     (`capacitor://localhost/`, sin bloque `server` en la config).
 *
 * En esos tres casos el arranque nunca preguntaba por el idioma del dispositivo. Y la
 * decisión se toma UNA sola vez, con el pathname de entrada (`getStoredLocale()` alimenta el
 * `useState` inicial y `initLocale()` corre con deps `[]`), así que gobierna la sesión
 * entera aunque el usuario navegue a `/dashboard` un instante después.
 *
 * MEDIDO ejecutando el bloque real del boot de `index.html`, navegador en fr-FR y sin
 * preferencia guardada:
 *
 *     ruta          elegido   html lang
 *     /dashboard    fr-FR     fr-FR
 *     /             null      (es-DO estático)     <-- la app nativa, siempre
 *
 * Consecuencia: un francés que baja la app del App Store recorre splash, login, registro y
 * formulario ENTEROS en español; y como el único selector vive en Configuración —inalcanzable
 * sin cuenta— no tiene salida. Al primer `fetchProfile` se le estampa `es-DO` en el perfil, y
 * desde ahí viaja a todos sus dispositivos. Es «un default sembrado es indistinguible de una
 * elección» reintroducido por la puerta del cliente, después de que
 * `P1-I18N-PROFILE-DEFAULT-PISA` lo cerrara en la columna.
 *
 * EL ARREGLO: cortar por HOST + ruta, no por ruta sola. La razón ya estaba escrita en el
 * repo — el docstring de `isMarketingVisit` (observabilityScope.js) dice, para el replay de
 * Sentry: «El corte es por HOST y no por ruta a propósito. La superficie papel incluye rutas
 * como /precios, que existen TAMBIÉN en app.bioboros.com… El host no cambia a mitad de
 * sesión; la ruta sí». Es exactamente la misma distinción.
 *
 * NO se toca `isPaperSurface`: gobierna el TEMA y tiene su propio test de espejo.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// `new Function` sobre el bloque REAL de `index.html`, misma técnica que
// `autoLocale.p1.test.js`: la entrada es el propio fichero del repo, no dato de nadie, y es
// la única forma de medir el boot que de verdad llega al navegador en vez de una copia.
const __dirname = dirname(fileURLToPath(import.meta.url));

function conEntorno({ pathname = '/', hostname = 'app.bioboros.com', idioma = 'fr-FR', protocol = 'https:' }) {
    // Mismo patron que `autoLocale.p1.test.js`: `stubGlobal`, que vitest deshace solo.
    vi.stubGlobal('navigator', { languages: [idioma], language: idioma });
    vi.stubGlobal('location', { pathname, hostname, protocol, href: protocol + '//' + hostname + pathname });
}

describe('[P1-I18N-ARRANQUE-EN-RAIZ-MATA-LA-AUTODETECCION]', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
    });

    afterEach(() => vi.unstubAllGlobals());

    it('la RAIZ del host de la app autodetecta (es el arranque de la PWA y de la app nativa)', async () => {
        conEntorno({ pathname: '/', hostname: 'app.bioboros.com', idioma: 'fr-FR' });
        const { getStoredLocale } = await import('../i18n');
        expect(
            getStoredLocale(),
            'la raiz de app.* es el arranque de la PWA instalada: si no autodetecta, el usuario '
            + 'se queda en espanol y no tiene selector hasta tener cuenta',
        ).toBe('fr-FR');
    });

    it('la RAIZ en `capacitor://localhost` autodetecta (la app nativa arranca SIEMPRE ahi)', async () => {
        conEntorno({ pathname: '/', hostname: 'localhost', idioma: 'it-IT', protocol: 'capacitor:' });
        const { getStoredLocale } = await import('../i18n');
        expect(
            getStoredLocale(),
            'la app de iOS carga capacitor://localhost/ y NUNCA otra ruta: si `/` suprime la '
            + 'deteccion, el idioma del dispositivo no se lee jamas en nativo',
        ).toBe('it-IT');
    });

    it('la portada DEL APEX sigue sin autodetectar (el landing no esta traducido)', async () => {
        conEntorno({ pathname: '/', hostname: 'bioboros.com', idioma: 'fr-FR' });
        const { getStoredLocale } = await import('../i18n');
        const { DEFAULT_LOCALE } = await import('../i18n/locales');
        expect(
            getStoredLocale(),
            'el landing tiene 72 t() sueltas en 6.698 lineas: traducirlo a medias es peor que '
            + 'dejarlo en espanol entero. Esta es la razon por la que el guard existe.',
        ).toBe(DEFAULT_LOCALE);
    });

    it('una ruta de marketing DEL APEX sigue sin autodetectar', async () => {
        conEntorno({ pathname: '/precios', hostname: 'bioboros.com', idioma: 'pt-BR' });
        const { getStoredLocale } = await import('../i18n');
        const { DEFAULT_LOCALE } = await import('../i18n/locales');
        expect(getStoredLocale()).toBe(DEFAULT_LOCALE);
    });

    it('una ruta de la APP en el apex si autodetecta (no es superficie de papel)', async () => {
        conEntorno({ pathname: '/dashboard', hostname: 'bioboros.com', idioma: 'pt-BR' });
        const { getStoredLocale } = await import('../i18n');
        expect(getStoredLocale()).toBe('pt-BR');
    });

    // ----------------------------------------------------------------------------------
    // El BOOT de `index.html` es una copia SEPARADA del mismo predicado, y es la que fija
    // `<html lang>` antes de que React monte. Si sólo se arreglara el módulo, el atributo y
    // la app discreparían — que es peor que cualquiera de los dos estados coherentes.
    // ----------------------------------------------------------------------------------
    const _bootConHost = (hostname, pathname, idiomas) => {
        const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf-8');
        let cuerpo = html.slice(
            html.indexOf('var SUPPORTED'),
            html.indexOf('} catch', html.indexOf('var SUPPORTED')),
        );
        cuerpo = cuerpo.replaceAll('%VITE_AUTO_LOCALE%', 'on');
        const raiz = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
        const correr = new Function(
            'localStorage', 'navigator', 'location', 'document', 'window',
            `${cuerpo}\n;return { elegido: typeof elegido === 'undefined' ? null : elegido };`,
        );
        return correr(
            { getItem: () => null },
            { languages: idiomas, language: idiomas[0] },
            { pathname, hostname },
            { documentElement: raiz },
            {},
        ).elegido;
    };

    it('BOOT: la raiz del host de la app autodetecta', () => {
        expect(_bootConHost('app.bioboros.com', '/', ['fr-FR'])).toBe('fr-FR');
    });

    it('BOOT: la raiz en capacitor (hostname localhost) autodetecta', () => {
        expect(_bootConHost('localhost', '/', ['it-IT'])).toBe('it-IT');
    });

    it('BOOT: la portada del apex sigue sin autodetectar', () => {
        expect(_bootConHost('bioboros.com', '/', ['fr-FR'])).toBeNull();
    });

    it('BOOT: una ruta de marketing del apex sigue sin autodetectar', () => {
        expect(_bootConHost('www.bioboros.com', '/precios', ['pt-BR'])).toBeNull();
    });

    it('lo GUARDADO sigue ganando sobre lo detectado EN LA APP', async () => {
        conEntorno({ pathname: '/dashboard', hostname: 'app.bioboros.com', idioma: 'fr-FR' });
        localStorage.setItem('mealfit_locale', 'it-IT');
        const { getStoredLocale } = await import('../i18n');
        expect(
            getStoredLocale(),
            'la deteccion es el SUELO, no el techo: en cuanto el usuario elige, manda su eleccion',
        ).toBe('it-IT');
    });

    // ----------------------------------------------------------------------------------
    // [P2-I18N-FRONTERA-MARKETING-CROMO-TRADUCIDO · 2026-08-23] En marketing del apex NO
    // manda ni lo detectado ni lo GUARDADO. Este caso decía antes «lo guardado gana en
    // todas las superficies» y describía la conducta de entonces, no una decisión: con un
    // fr-FR guardado, /funciones salía con cabecera y pie en francés sobre un cuerpo
    // español y `<html lang="fr-FR">` sobre un documento en castellano.
    // ----------------------------------------------------------------------------------
    it('en marketing del apex, lo GUARDADO tampoco manda: es-DO entero, cromo incluido', async () => {
        conEntorno({ pathname: '/funciones', hostname: 'bioboros.com', idioma: 'fr-FR' });
        localStorage.setItem('mealfit_locale', 'fr-FR');
        const { getStoredLocale } = await import('../i18n');
        const { DEFAULT_LOCALE } = await import('../i18n/locales');
        expect(getStoredLocale()).toBe(DEFAULT_LOCALE);
    });

    it('la misma ruta en el host de la APP sí respeta lo guardado (control: es el host, no la ruta)', async () => {
        conEntorno({ pathname: '/precios', hostname: 'app.bioboros.com', idioma: 'en-US' });
        localStorage.setItem('mealfit_locale', 'fr-FR');
        const { getStoredLocale } = await import('../i18n');
        expect(getStoredLocale()).toBe('fr-FR');
    });

    const _bootConGuardado = (hostname, pathname, guardado) => {
        const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf-8');
        let cuerpo = html.slice(
            html.indexOf('var SUPPORTED'),
            html.indexOf('} catch', html.indexOf('var SUPPORTED')),
        );
        cuerpo = cuerpo.replaceAll('%VITE_AUTO_LOCALE%', 'on');
        const raiz = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
        const correr = new Function(
            'localStorage', 'navigator', 'location', 'document', 'window',
            `${cuerpo}
;return { elegido: typeof elegido === 'undefined' ? null : elegido, lang: document.documentElement.attrs.lang || null };`,
        );
        return correr(
            { getItem: () => guardado },
            { languages: ['es-DO'], language: 'es-DO' },
            { pathname, hostname },
            { documentElement: raiz },
            {},
        );
    };

    it('BOOT: en marketing del apex un fr-FR guardado NO toca `<html lang>`', () => {
        const r = _bootConGuardado('bioboros.com', '/funciones', 'fr-FR');
        expect(r.elegido).toBeNull();
        expect(r.lang, '<html lang> declararía francés sobre un documento en castellano').toBeNull();
    });

    it('BOOT: en la app el mismo fr-FR guardado sí fija `<html lang>` (control)', () => {
        const r = _bootConGuardado('app.bioboros.com', '/dashboard', 'fr-FR');
        expect(r.elegido).toBe('fr-FR');
        expect(r.lang).toBe('fr-FR');
    });
});
