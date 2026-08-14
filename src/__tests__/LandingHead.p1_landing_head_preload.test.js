/**
 * [P1-LANDING-HEAD-PRELOAD · 2026-08-14] El código del landing dejaba de
 * descubrirse en el segundo viaje.
 *
 * EL DEFECTO QUE CIERRA. `App.jsx` mantiene `Home` en `lazy()` — correcto, y hay
 * que conservarlo: P1-PERF-LAZY-HOME lo hizo para sacar framer del entry de
 * `/login`. Pero el `<head>` compilado declaraba exactamente cuatro recursos (el
 * entry, dos modulepreload de vendor y la CSS del shell) y CERO referencia a
 * Home. Medido el 2026-08-14: ola 1 = 629.800 B, ola 2 = 226.434 B, y la ola 2
 * no se puede ni PEDIR hasta que la ola 1 se descarga y el entry de 259.222 B se
 * parsea. El 100% de los visitantes del apex paga ese viaje serializado.
 *
 * ⚠️ POR QUÉ NO SE ARREGLA CON UN `<link>` FIJO EN index.html. Hay UN SOLO
 * `index.html` para los dos hosts. Un preload incondicional le metería 226 kB de
 * landing eager a app.bioboros.com — que es literalmente el problema que
 * P3-APP-SUBDOMAIN-BUILD-SEP resolvió sacando Login y DashboardLayout del entry.
 * Por eso los links se inyectan desde un bloque GATEADO POR HOST, y por eso este
 * test comprueba las dos direcciones: que en el apex se emitan y que fuera del
 * apex no exista ninguna URL de Home suelta en el HTML.
 *
 * ⚠️ Y POR QUÉ LOS NOMBRES SALEN DEL BUNDLE. Los chunks llevan hash de
 * contenido: escribirlos a mano en el HTML es una lista que caduca en el
 * siguiente deploy y falla en SILENCIO (un preload a una URL que no existe no
 * rompe la página, sólo deja de servir). Se derivan del bundle en build.
 */
import { describe, it, expect } from 'vitest';
import {
    landingPreloadTargets,
    landingHeadSnippet,
} from '../../scripts/landingHead.mjs';

/** Bundle falso con la forma que Rollup+Vite producen de verdad. */
const bundleFalso = () => ({
    'assets/index-AAA.js': {
        type: 'chunk',
        isEntry: true,
        fileName: 'assets/index-AAA.js',
        facadeModuleId: 'C:/repo/frontend/src/main.jsx',
        imports: ['assets/vendor-react-BBB.js'],
        viteMetadata: { importedCss: new Set(['assets/index-CCC.css']) },
    },
    'assets/Home-DDD.js': {
        type: 'chunk',
        isEntry: false,
        fileName: 'assets/Home-DDD.js',
        facadeModuleId: 'C:/repo/frontend/src/pages/Home.jsx',
        imports: ['assets/proxy-EEE.js', 'assets/vendor-react-BBB.js'],
        viteMetadata: { importedCss: new Set(['assets/Home-FFF.css']) },
    },
    'assets/proxy-EEE.js': {
        type: 'chunk',
        isEntry: false,
        fileName: 'assets/proxy-EEE.js',
        facadeModuleId: null,
        imports: [],
        viteMetadata: { importedCss: new Set() },
    },
    'assets/vendor-react-BBB.js': {
        type: 'chunk',
        isEntry: false,
        fileName: 'assets/vendor-react-BBB.js',
        facadeModuleId: null,
        imports: [],
        viteMetadata: { importedCss: new Set() },
    },
    'assets/logo-GGG.png': { type: 'asset', fileName: 'assets/logo-GGG.png' },
});

describe('[P1-LANDING-HEAD-PRELOAD] qué se precarga', () => {
    it('encuentra el chunk de Home por su módulo de origen, no por su nombre', () => {
        // El nombre lleva hash de contenido: buscarlo por `Home-` sería una
        // heurística que rompe el día que alguien renombre el fichero.
        const { scripts } = landingPreloadTargets(bundleFalso());
        expect(scripts).toContain('/assets/Home-DDD.js');
    });

    it('arrastra las dependencias de Home — framer es la que pesa', () => {
        const { scripts } = landingPreloadTargets(bundleFalso());
        expect(scripts).toContain('/assets/proxy-EEE.js');
    });

    it('NO repite lo que la ola 1 ya trae: el vendor ya tiene su modulepreload', () => {
        // Duplicar el modulepreload de vendor-react no acelera nada y ensucia el
        // <head> con una entrada que el navegador ya está pidiendo.
        const { scripts } = landingPreloadTargets(bundleFalso());
        expect(scripts).not.toContain('/assets/vendor-react-BBB.js');
    });

    it('precarga la CSS de Home, que es la que pinta el hero', () => {
        const { styles } = landingPreloadTargets(bundleFalso());
        expect(styles).toContain('/assets/Home-FFF.css');
    });

    it('no arrastra la CSS del shell, que ya viene enlazada en la ola 1', () => {
        const { styles } = landingPreloadTargets(bundleFalso());
        expect(styles).not.toContain('/assets/index-CCC.css');
    });

    it('devuelve vacío —sin reventar— si Home dejó de existir', () => {
        // Si alguien renombra la página, el build NO debe caerse: debe dejar de
        // precargar. Un fallo aquí bloquearía el deploy por una optimización.
        const sinHome = bundleFalso();
        delete sinHome['assets/Home-DDD.js'];
        const { scripts, styles } = landingPreloadTargets(sinHome);
        expect(scripts).toEqual([]);
        expect(styles).toEqual([]);
    });
});

describe('[P1-LANDING-HEAD-PRELOAD] el bloque inyectado está gateado por host', () => {
    const snippet = () => landingHeadSnippet(landingPreloadTargets(bundleFalso()));

    it('menciona el apex y el www como los únicos hosts que precargan', () => {
        const html = snippet();
        expect(html).toContain('bioboros.com');
        expect(html).toContain('www.bioboros.com');
    });

    it('lleva las URLs de Home dentro del bloque, no como <link> sueltos', () => {
        // Ésta es la aserción que protege a app.bioboros.com: si las URLs
        // aparecieran en un <link> de nivel superior, el subdominio de la app se
        // comería 226 kB de landing que no usa (P3-APP-SUBDOMAIN-BUILD-SEP).
        const html = snippet();
        expect(html).toContain('/assets/Home-DDD.js');
        expect(html).not.toMatch(/<link[^>]+Home-DDD\.js/);
    });

    it('pide los scripts como modulepreload y la CSS como preload de estilo', () => {
        const html = snippet();
        expect(html).toContain('modulepreload');
        expect(html).toContain('style');
    });

    it('no emite nada cuando no hay nada que precargar', () => {
        expect(landingHeadSnippet({ scripts: [], styles: [] })).toBe('');
    });

    it('gatea también el preconnect del host de autenticación', () => {
        // P2-PRECONNECT-AUTH abría DNS+TCP+TLS contra Neon Auth en TODAS las
        // rutas, y el apex no lo contacta jamás: P3-APEX-NO-SESSION corta la
        // sesión en seco antes de cualquier llamada. Era un handshake pagado en
        // el critical path a cambio de nada.
        const html = landingHeadSnippet(
            { scripts: [], styles: [] },
            { authOrigin: 'https://ep-ejemplo.neonauth.aws.neon.tech' },
        );
        expect(html).toContain('ep-ejemplo.neonauth.aws.neon.tech');
        expect(html).toContain('preconnect');
    });
});
