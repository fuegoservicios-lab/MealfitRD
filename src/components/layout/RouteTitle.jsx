import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
// [P1-LANDING-BENCH-1 · 2026-08-07] Hechos estructurales desde el SSOT — las
// meta descriptions escribían «17 micronutrientes» y «+200 alimentos» a mano
// (esta última era la 4ª grafía distinta del mismo catálogo).
// [P2-LANDING-PRERENDER-META · 2026-08-14] Las tablas de title/description
// vivian aqui dentro. Se mudaron a `data/routeMeta.js` porque ahora tienen DOS
// consumidores: este componente (navegacion SPA) y el script que estampa el
// mismo texto en un HTML por ruta durante el build. Dos copias del copy era
// justo lo que habia que evitar.
import {
    BRAND, HOME_DESC, TITLES, DESCRIPTIONS, SELF_MANAGED,
} from '../../data/routeMeta';

/* [P3-ROUTE-TITLE · 2026-06-29] Título de pestaña por ruta, minimalista y coherente.
   Fuente única: antes solo index.html (estático) + 4 páginas de marketing seteaban
   título; el resto (login, dashboard, etc.) heredaba un título stale/incoherente.
   Esquema: "<Sección> · Bioboros" para la app; el home conserva el título de marca.

   Las 4 páginas de marketing con SEO descriptivo propio (/motor, /como-funciona,
   /funciones, /precision) se auto-gestionan vía su useEffect → se listan en
   SELF_MANAGED para que este componente NO les pise el TITLE.

   [P3-ROUTE-META · 2026-06-30] Extendido para gestionar también <meta name="description">
   y <link rel="canonical"> (+ og/twitter description y og:url) POR RUTA. Motivo: el SPA
   sirve el mismo index.html estático para toda ruta, con la description Y el canonical de
   la HOME hardcodeados. Resultado en Google (que sí renderiza JS): el snippet de /privacy
   y demás subpáginas mostraba el texto genérico de la home, y peor — el canonical→home
   marcaba cada subpágina como DUPLICADO de la home, suprimiendo su indexación propia.
   Ahora cada ruta fija su propia description y un canonical auto-referente. Las 4 páginas
   de marketing siguen auto-gestionando su TITLE; su description se gestiona aquí.

   Nota de alcance: los unfurlers sociales (WhatsApp/Facebook/etc.) NO ejecutan JS → siguen
   leyendo el index.html estático. Este fix es para Google/buscadores. Un fix que también
   cubra unfurlers requeriría prerender/SSR por ruta (cambio de infra mayor, no hecho aquí). */

import { APEX_ORIGIN as ORIGIN } from '../../config/site';



// [P3-ROUTE-META] Description por ruta para el snippet de buscadores. ≤ ~160 chars,
// es-DO, adaptada al contenido real de cada página. Rutas sin entry → HOME_DESC.

// [P3-RESEARCH-PAGE-SCIENTIFIC · 2026-06-30] /research ahora es página propia (estilo científico)
// que fija su propio <title> vía useEffect → self-managed. Su description/canonical se siguen
// gestionando aquí (SELF_MANAGED solo exime el TITLE).

function setMetaByName(name, content) {
    let el = document.head.querySelector(`meta[name="${name}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

function setMetaByProp(property, content) {
    let el = document.head.querySelector(`meta[property="${property}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

function setCanonical(href) {
    let el = document.head.querySelector('link[rel="canonical"]');
    if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
    }
    el.setAttribute('href', href);
}

function removeMetaByName(name) {
    document.head.querySelector(`meta[name="${name}"]`)?.remove();
}

function removeCanonical() {
    document.head.querySelector('link[rel="canonical"]')?.remove();
}

// [P2-LANDING-HEAD-CLIENT · 2026-08-14] ¿Esta ruta existe?
//
// Hace falta porque nginx sirve el fallback SPA para TODO: `/precios2` responde
// 200, con la description de la portada y un canonical AUTORREFERENTE. Es decir,
// le estábamos diciendo a Google que una URL inexistente es la versión canónica
// de sí misma.
//
// El conjunto se compone de las tres fuentes que ya existen —no se escribe una
// cuarta lista— y replica los dos casos que el efecto ya trataba aparte:
// `/novedades/<slug>` (dinámica, autogestionada) y las rutas de app, que en el
// apex sólo REDIRIGEN a app.* y por tanto existen aunque aquí no se pinten.
const KNOWN_PATHS = new Set([...Object.keys(TITLES), ...SELF_MANAGED]);
const KNOWN_PREFIXES = ['/novedades/', '/dashboard'];
// Rutas vivas que no tienen título propio porque sólo redirigen (P3-COOKIES-MERGE,
// P1-PANTRY-ROUTE-ALIAS, P1-SETTINGS-ONE-SURFACE, P2-LANDING-MANIFEST-SHORTCUT).
const KNOWN_REDIRECTS = ['/cookies', '/pantry', '/mi-nevera', '/configuracion', '/register'];

function isKnownPath(path) {
    return KNOWN_PATHS.has(path)
        || KNOWN_REDIRECTS.includes(path)
        || KNOWN_PREFIXES.some((p) => path.startsWith(p));
}

export default function RouteTitle() {
    const { pathname } = useLocation();
    useEffect(() => {
        const path = pathname.replace(/\/+$/, '') || '/';

        // [P3-NEWS-1 · 2026-07-01] Las páginas de artículo de Novedades (/novedades/<slug>)
        // son dinámicas y auto-gestionan su título/description/canonical por artículo →
        // no las tocamos aquí (evita pisar el título del artículo con uno genérico).
        if (path.startsWith('/novedades/')) return;

        // [P2-LANDING-HEAD-CLIENT · 2026-08-14] Ruta inexistente: ni canonical ni
        // señales de indexación. `NotFound.jsx` ya dice «esta página no existe» en un
        // <h1>, así que Google acabará clasificándola como soft-404 igualmente; lo que
        // cierra esto es el ruido de rastreo y, sobre todo, la autodeclaración canónica.
        if (!isKnownPath(path)) {
            document.title = `Página no encontrada · ${BRAND}`;
            removeCanonical();
            setMetaByName('robots', 'noindex, follow');
            return;
        }

        // ⚠️ Retirar el noindex al ENTRAR en una ruta buena, no en un cleanup.
        // Si se quedara pegado, un visitante que llega por un enlace roto y luego
        // navega a /precios dejaría /precios en noindex — habríamos cambiado un
        // problema de rastreo por uno de DESINDEXACIÓN, que es mucho peor.
        removeMetaByName('robots');

        // Título — las páginas de marketing con título propio lo setean ellas mismas.
        if (!SELF_MANAGED.has(path)) {
            document.title = TITLES[path] || BRAND;
        }

        // Description + canonical — gestionados aquí para TODAS las rutas.
        const desc = DESCRIPTIONS[path] || HOME_DESC;
        const canonical = path === '/' ? `${ORIGIN}/` : `${ORIGIN}${path}`;
        setMetaByName('description', desc);
        setCanonical(canonical);
        // Google puede usar OG/Twitter como fallback del snippet; alinearlos evita
        // contradicciones. (Los unfurlers sin JS siguen leyendo el estático.)
        setMetaByProp('og:description', desc);
        setMetaByProp('og:url', canonical);
        setMetaByName('twitter:description', desc);
        // [P2-LANDING-HEAD-CLIENT · 2026-08-14] El TÍTULO social era el único de los
        // cinco que no se reescribía por ruta: ni siquiera los clientes que SÍ
        // ejecutan JS veían el título correcto al compartir. Se usa el título de la
        // ruta —incluso en las SELF_MANAGED, que fijan el `document.title` pero nunca
        // tocaron el og.
        const socialTitle = TITLES[path] || document.title || BRAND;
        setMetaByProp('og:title', socialTitle);
        setMetaByName('twitter:title', socialTitle);
    }, [pathname]);
    return null;
}
