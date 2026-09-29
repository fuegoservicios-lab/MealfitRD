/**
 * [P1-DOMAIN-CUTOVER-BIOBOROS · 2026-07-30] SSOT del dominio del sitio.
 *
 * Antes el dominio estaba HARDCODEADO en 8 sitios del frontend (redirect apex→app,
 * dos `ORIGIN` de canonical SEO, un link a /supermercado, dos textos legales,
 * una noticia, y los ficheros de `public/`). Migrar de `mealfitrd.com` a
 * `bioboros.com` obligó a tocarlos uno por uno — y el peligroso era
 * `App.jsx`, cuyo redirect duro mandaba al usuario al dominio VIEJO.
 *
 * Con estas constantes, el próximo cambio de dominio es una línea. Los ficheros
 * estáticos de `public/` (robots, sitemaps, security.txt) NO pueden importarlas
 * — son texto plano servido tal cual — así que siguen siendo edición manual y
 * quedan enumerados abajo para que nadie los olvide.
 *
 * Ficheros estáticos que también llevan el dominio:
 *   public/robots.txt · public/sitemap.xml · public/app-sitemap.xml
 *   public/.well-known/security.txt · index.html (og:url, canonical, JSON-LD)
 */

/** Dominio desnudo, sin protocolo ni subdominio. */
export const SITE_DOMAIN = 'bioboros.com';

/** Origen del sitio público (landing, legales, supermercado, SEO canonical). */
export const APEX_ORIGIN = `https://${SITE_DOMAIN}`;

/** Origen de la aplicación (login, dashboard). Ver P3-APP-SUBDOMAIN-ROUTING. */
export const APP_ORIGIN = `https://app.${SITE_DOMAIN}`;

/**
 * [P1-HOSTNAME-PREDICATES · 2026-07-30] Predicados de host, sin regex.
 *
 * POR QUÉ EXISTEN. El dominio estaba escrito en CUATRO regex con el punto
 * ESCAPADO (`/^(www\.)?mealfitrd\.com$/`). Al migrar a bioboros.com, la
 * búsqueda del literal `mealfitrd.com` NO los encontró — el backslash rompe la
 * coincidencia — así que la verificación dio VERDE EN FALSO y los cuatro
 * siguieron comparando contra el dominio viejo. En producción eso significaba
 * que `IS_APEX_HOST` era `false` en bioboros.com y el redirect apex→app nunca
 * disparaba.
 *
 * Se sustituye la regex por comparación de strings: no hay nada que escapar,
 * así que la clase de fallo desaparece en vez de quedar arreglada una vez.
 */

/** ¿Es el sitio público (apex o www), NO el subdominio de la app? */
export function isApexHost(hostname) {
    const h = String(hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
    return h === SITE_DOMAIN || h === `www.${SITE_DOMAIN}`;
}

/** ¿Es CUALQUIER host nuestro — apex, www o un subdominio como `app.`? */
export function isSiteHost(hostname) {
    const h = String(hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
    return h === SITE_DOMAIN || h.endsWith(`.${SITE_DOMAIN}`);
}

/**
 * URL de una pagina publica (legales, precios, etc.) en el APEX.
 *
 * [P3-LOGIN-LEGAL-LANDING . 2026-06-30 . SSOT aqui P1-LEGAL-UNA-SOLA-COPIA . 2026-08-19]
 * Nacio dentro de `Login.jsx` como constante local. Al hacer que el pie tambien
 * saliera al apex escribi un SEGUNDO mecanismo sin ver el primero --una constante
 * `APEX` con el dominio a pelo--, que es como se empieza a no saber cual usar.
 *
 * Este es mejor que el que yo habia escrito y por eso gana: quita el prefijo
 * `app.` del host ACTUAL en vez de fijar el dominio, asi que funciona en
 * cualquier entorno, y en dev/preview cae a la ruta interna para que el enlace
 * no mande a produccion desde localhost.
 */
// [P1-LEGAL-LINKS-APEX · 2026-08-22] Sonda «estoy en la app nativa», INYECTADA.
//
// site.js NO puede importar `./platform`: lo cargan tres scripts de Node fuera de
// Vite (build-sitemap, build-route-meta, landingHead) que ni resuelven `./platform`
// sin extensión ni deben arrastrar el runtime nativo. Lo aprendí con el build del VPS
// en rojo. Así que la dependencia va al revés: `platform.js` (que sí conoce
// Capacitor y sólo vive dentro del bundle) registra la sonda al cargarse. En Node
// nunca se registra y apexUrl() se comporta como siempre.
let _isNativeProbe = () => false;
export function registerNativeProbe(fn) {
    _isNativeProbe = typeof fn === 'function' ? fn : () => false;
}

/**
 * [P1-PLAN-LOTE-845 · 2026-09-29] Páginas del apex que tienen variante `/app/*`: el MISMO
 * texto legal, sin la navegación de marketing, sin precios y sin botones de llamada a la
 * acción (las publicó la sesión 6d; auditoría App Store, filas 1.1 y 10.2, §A.5).
 *
 * Por qué. En la app nativa cada enlace legal abría `bioboros.com/privacy` en Safari, y esa
 * página lleva «Precios» en su navegación: desde la app se llegaba a comprar fuera en dos
 * toques (guideline 3.1.1). Apple exige que la política sea alcanzable desde la app, así que
 * la solución no es quitar el enlace sino que apunte a una página sin salida al comercio.
 *
 * Se decide AQUÍ y en ningún otro sitio: todos los enlaces legales pasan ya por `apexUrl()`
 * (el test de P1-LEGAL-LINKS-APEX lo vigila), así que la hoja del permiso de IA, Configuración,
 * el login, «Más información» y el pie la heredan sin tocar sus call sites. Solo en NATIVO: la
 * web sigue enlazando las páginas normales. Una ruta que no está en la lista sigue a su página
 * de siempre (no existe una variante que inventar).
 */
export const RUTAS_CON_VARIANTE_APP = Object.freeze([
    '/privacy', '/terms', '/medical', '/ai-policy', '/data-protection',
    '/acceptable-use', '/refunds', '/soporte',
]);

// `/privacy#seccion` o `/terms?x=1` conservan el resto tras la ruta.
function varianteApp(path) {
    const p = String(path);
    const corte = p.search(/[?#]/);
    const ruta = corte < 0 ? p : p.slice(0, corte);
    const resto = corte < 0 ? '' : p.slice(corte);
    return RUTAS_CON_VARIANTE_APP.includes(ruta) ? `/app${ruta}${resto}` : p;
}

export function apexUrl(path) {
    if (typeof window === 'undefined') return path;
    // En la app nativa el host es `localhost` (capacitor://localhost), igual que en
    // dev — pero aquí NO hay ruta interna que valga: la copia JSX de las legales
    // quedó obsoleta frente al apex (única copia desde P1-LEGAL-UNA-SOLA-COPIA) y
    // Apple exige que la política accesible desde la app sea LA política. Así que en
    // nativo el apex es siempre absoluto, y en su variante `/app/*` cuando la tiene.
    if (_isNativeProbe()) return `${APEX_ORIGIN}${varianteApp(path)}`;
    const { protocol, hostname } = window.location;
    if (isSiteHost(hostname)) {
        return `${protocol}//${hostname.replace(/^app\./i, '')}${path}`;
    }
    return path; // dev / preview -> ruta in-app
}
