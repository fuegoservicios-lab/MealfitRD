// [P1-LANDING-HEAD-PRELOAD · 2026-08-14] El `<head>` deja de ser el mismo para
// los dos hosts.
//
// EL PROBLEMA. `App.jsx` carga `Home` con `lazy()` y eso hay que conservarlo:
// P1-PERF-LAZY-HOME lo hizo para que `/login` no arrastrase framer. El coste
// escondido era que el `<head>` compilado declaraba cuatro recursos y NINGUNO
// era Home, así que el navegador no podía enterarse de que existe hasta haber
// descargado y parseado el entry. Medido el 2026-08-14: ola 1 = 629.800 B, ola 2
// = 226.434 B, en serie. Todos los visitantes del apex pagan ese segundo viaje.
//
// POR QUÉ NO ES UN `<link>` FIJO. Hay UN SOLO `index.html` para bioboros.com y
// app.bioboros.com. Un preload incondicional le daría 226 kB de landing eager al
// subdominio de la app, que es exactamente lo que P3-APP-SUBDOMAIN-BUILD-SEP
// quitó de ahí. Y tampoco vale nombrar los chunks en `manualChunks` para poder
// enlazarlos: P2-NEON-LAZY y P1-PERF-FRAMER-SPLIT dejaron escrito que un vendor
// chunk NOMBRADO recibe `modulepreload` eager de Vite en TODAS las rutas — el
// mismo daño por otra puerta.
//
// La salida es un bloque inyectado que decide en el cliente por `hostname`. Se
// pierde el preload-scanner (el bloque corre cuando el parser llega a él, no
// antes), pero se gana el paralelismo, que es de donde sale casi toda la
// ganancia: las dos olas dejan de ir en serie.
//
// POR QUÉ LOS NOMBRES SALEN DEL BUNDLE Y NO DE UNA LISTA. Los chunks llevan hash
// de contenido. Escribirlos a mano produce una lista que caduca en el siguiente
// deploy y falla EN SILENCIO: un preload a una URL inexistente no rompe la
// página, simplemente deja de servir para nada, y nadie se entera.
//
// Guard: src/__tests__/LandingHead.p1_landing_head_preload.test.js
import { SITE_DOMAIN } from '../src/config/site.js';

/** Los hosts donde vive el marketing. Derivado del SSOT del dominio. */
export const APEX_HOSTS = [SITE_DOMAIN, `www.${SITE_DOMAIN}`];

/** El módulo que abre el landing. Su chunk es el que hay que precargar. */
const LANDING_MODULE = 'src/pages/Home.jsx';

const _aUrl = (base, fileName) => `${base.endsWith('/') ? base : `${base}/`}${fileName}`;

const _normaliza = (id) => String(id || '').replace(/\\/g, '/');

/**
 * Qué debe precargar el landing, derivado del bundle real.
 *
 * Resta lo que la ola 1 ya trae: repetir el `modulepreload` de `vendor-react` no
 * acelera nada y deja en el `<head>` una entrada que el navegador ya está
 * pidiendo por su cuenta.
 */
export function landingPreloadTargets(bundle, opts = {}) {
    const moduloLanding = opts.landingModule || LANDING_MODULE;
    const base = opts.base || '/';
    const trozos = Object.values(bundle || {}).filter((c) => c && c.type === 'chunk');

    // Lo que el HTML ya enlaza por sí mismo (entry + sus imports + su CSS).
    const ola1 = new Set();
    const entry = trozos.find((c) => c.isEntry);
    if (entry) {
        ola1.add(entry.fileName);
        for (const dep of entry.imports || []) ola1.add(dep);
        for (const css of entry.viteMetadata?.importedCss || []) ola1.add(css);
    }

    const home = trozos.find((c) => _normaliza(c.facadeModuleId).endsWith(moduloLanding));
    if (!home) {
        // Si alguien renombra la página, el build NO se cae: deja de precargar.
        // Reventar aquí bloquearía un deploy entero por una optimización.
        return { scripts: [], styles: [] };
    }

    const scripts = [home.fileName, ...(home.imports || [])]
        .filter((f, i, arr) => arr.indexOf(f) === i && !ola1.has(f))
        .map((f) => _aUrl(base, f));
    const styles = [...(home.viteMetadata?.importedCss || [])]
        .filter((f) => !ola1.has(f))
        .map((f) => _aUrl(base, f));

    return { scripts, styles };
}

/**
 * El bloque que se inyecta en el `<head>`.
 *
 * Dos ramas excluyentes, y las dos existen por la misma razón (un HTML, dos
 * audiencias):
 *   · apex  → precarga el landing.
 *   · app.* → precalienta el origen de autenticación.
 *
 * Ese `preconnect` estaba fijo en `index.html` desde P2-PRECONNECT-AUTH y el
 * apex NO contacta jamás ese host: `AssessmentContext` corta la sesión en seco
 * con `isApexHost()` (P3-APEX-NO-SESSION, del 2026-07-01, ocho días ANTES de que
 * se añadiera el preconnect — nadie comparó los dos markers). Era un DNS+TCP+TLS
 * pagado en el critical path de la portada a cambio de nada.
 */
export function landingHeadSnippet(targets, opts = {}) {
    const { scripts = [], styles = [] } = targets || {};
    const authOrigin = opts.authOrigin || '';
    if (!scripts.length && !styles.length && !authOrigin) return '';

    const hosts = JSON.stringify(APEX_HOSTS);
    const js = JSON.stringify(scripts);
    const css = JSON.stringify(styles);

    return `<script>
(function(){
  try {
    var h = (location.hostname || '').toLowerCase();
    var esApex = ${hosts}.indexOf(h) !== -1;
    var cabeza = document.head;
    function enlazar(rel, href, como) {
      var l = document.createElement('link');
      l.rel = rel;
      l.href = href;
      if (como) l.as = como;
      if (rel === 'modulepreload') l.crossOrigin = '';
      cabeza.appendChild(l);
    }
    if (esApex) {
      var js = ${js}, css = ${css}, i;
      for (i = 0; i < js.length; i++) enlazar('modulepreload', js[i]);
      for (i = 0; i < css.length; i++) enlazar('preload', css[i], 'style');
    }${authOrigin ? ` else {
      enlazar('preconnect', ${JSON.stringify(authOrigin)});
      enlazar('dns-prefetch', ${JSON.stringify(authOrigin)});
    }` : ''}
  } catch (e) {
    // Una optimización jamás debe impedir que la página cargue.
  }
})();
</script>`;
}
