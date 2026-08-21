import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '../../i18n';
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

// [P1-I18N-ROUTE-TITLES · 2026-08-21] Los titulos de las rutas de APP, traducibles.
//
// POR QUE NO SE TRADUCE `TITLES` DE `routeMeta.js`. Ese modulo es el SSOT del BUILD:
// lo importa Node en el prerender de rutas y alimenta ademas `og:title` y
// `twitter:title`. Sus lectores son buscadores y unfurlers, que no tienen locale y a
// los que interesa el espanol canonico; y no puede importar el motor de i18n porque
// eso arrastraria React a un script de build.
//
// Asi que se separa por AUDIENCIA, no por fichero: el `<meta description>`, el
// canonical y los titulos sociales siguen saliendo del SSOT en espanol, y lo unico
// que se traduce es el `document.title` de las rutas que hay DETRAS DEL LOGIN, que
// las lee una persona y no un rastreador.
//
// Las rutas de marketing no estan aqui a proposito: su copy sigue sin traducir
// (decision de producto) y ademas varias se auto-gestionan el titulo via SELF_MANAGED.
const TITULOS_APP = (t) => ({
    '/login': t('Iniciar sesión'),
    '/reset-password': t('Restablecer contraseña'),
    '/assessment': t('Crear mi plan'),
    '/plan': t('Diseñando tu plan'),
    '/dashboard': t('Mi plan'),
    '/dashboard/pantry': t('Mi nevera'),
    '/dashboard/recipes': t('Recetas'),
    '/dashboard/agent': t('Asistente'),
    '/dashboard/settings': t('Ajustes'),
    '/dashboard/upgrade': t('Planes'),
    '/history': t('Historial'),
});

export default function RouteTitle() {
    const { pathname } = useLocation();
    // [P1-I18N-ROUTE-TITLES · 2026-08-21] `locale` va en las deps del efecto de
    // abajo. Sin el, el titulo solo se recalcula al NAVEGAR: quien cambia de idioma
    // desde Configuracion se queda con la pestana en espanol hasta moverse de ruta.
    const { t, locale } = useI18n();

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
            document.title = `${t('Página no encontrada')} · ${BRAND}`;
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
            // Las rutas de APP van por catalogo (las lee una persona logueada); las de
            // marketing siguen saliendo del SSOT de build en espanol, igual que su
            // canonical y su description.
            const appTitulo = TITULOS_APP(t)[path];
            document.title = appTitulo ? `${appTitulo} · ${BRAND}` : (TITLES[path] || BRAND);
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
    }, [pathname, t, locale]);
    return null;
}
