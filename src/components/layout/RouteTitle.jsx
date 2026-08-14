import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
// [P1-LANDING-BENCH-1 · 2026-08-07] Hechos estructurales desde el SSOT — las
// meta descriptions escribían «17 micronutrientes» y «+200 alimentos» a mano
// (esta última era la 4ª grafía distinta del mismo catálogo).
import { MICROS_TRACKED, VERIFIED_FOODS_LABEL } from '../../data/systemFacts';

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

const BRAND = 'Bioboros';
import { APEX_ORIGIN as ORIGIN } from '../../config/site';

const HOME_DESC = 'Planes de alimentación 100% personalizados con IA avanzada. Adaptados a tus gustos, presupuesto y estilo de vida. Comienza gratis.';

const TITLES = {
    '/': 'Bioboros | Nutrición Personalizada con IA',
    '/login': `Iniciar sesión · ${BRAND}`,
    '/reset-password': `Restablecer contraseña · ${BRAND}`,
    '/assessment': `Crear mi plan · ${BRAND}`,
    '/plan': `Diseñando tu plan · ${BRAND}`,
    '/dashboard': `Mi plan · ${BRAND}`,
    '/dashboard/pantry': `Mi nevera · ${BRAND}`,
    '/dashboard/recipes': `Recetas · ${BRAND}`,
    '/dashboard/agent': `Asistente · ${BRAND}`,
    '/dashboard/settings': `Ajustes · ${BRAND}`,
    '/dashboard/upgrade': `Planes · ${BRAND}`,
    // [P1-SETTINGS-ONE-SURFACE · 2026-08-10] `/configuracion` ya no tiene título
    // propio: dejó de ser una página y ahora redirige a `/dashboard/settings`,
    // que lleva el suyo tres líneas más arriba. Un título para una ruta que solo
    // existe durante un redirect es un rótulo sin puerta detrás.
    '/history': `Historial · ${BRAND}`,
    '/precios': `Planes y Precios · ${BRAND}`,
    '/privacy': `Política de Privacidad · ${BRAND}`,
    '/terms': `Términos de Servicio · ${BRAND}`,
    '/medical': `Aviso Médico · ${BRAND}`,
    '/data-protection': `Protección de Datos · ${BRAND}`,
    '/ai-policy': `Uso de Inteligencia Artificial · ${BRAND}`,
    '/research': `Investigación · ${BRAND}`,
    '/refunds': `Reembolsos y Cancelaciones · ${BRAND}`,
    '/acceptable-use': `Política de Uso · ${BRAND}`,
    '/about': `Acerca de ${BRAND} — nutrición de precisión con IA`,
    '/responsible-disclosure': `Divulgación Responsable · ${BRAND}`,
    '/novedades': `Novedades · ${BRAND}`,
    // [P1-SUPERMARKET-DB · 2026-07-02]
    '/supermercado': `Supermercados RD · ${BRAND}`,
};

// [P3-ROUTE-META] Description por ruta para el snippet de buscadores. ≤ ~160 chars,
// es-DO, adaptada al contenido real de cada página. Rutas sin entry → HOME_DESC.
const DESCRIPTIONS = {
    '/': HOME_DESC,
    '/login': 'Inicia sesión en Bioboros para acceder a tu plan nutricional personalizado con IA, tu lista de compras y tu coach.',
    '/assessment': 'Crea tu plan nutricional personalizado con IA en minutos. Adaptado a tus gustos, presupuesto y condición. Gratis para empezar, sin tarjeta.',
    '/precios': 'Planes y precios de Bioboros: empieza gratis o sube a Básico, Plus o Ultra. Precios reales en RD$, sin tarjeta para comenzar.',
    // Marketing (title self-managed; description gestionada aquí)
    '/funciones': 'Todo lo que hace Bioboros: plan diario calibrado, recetas paso a paso, lista de compras costeada en RD$, coach IA 24/7 y nevera inteligente.',
    '/como-funciona': 'El método de Bioboros paso a paso: de tu perfil clínico-metabólico al plato, con validación nutricional determinista en cada etapa.',
    '/precision': `La precisión que medimos en Bioboros: banda de macros, piso de proteína, ${MICROS_TRACKED} micronutrientes vs DRI y guardas clínicas por condición.`,
    '/motor': 'El motor de Bioboros por dentro: orquestación por grafos, validación nutricional y un catálogo verificado de alimentos dominicanos.',
    // Legales
    '/privacy': 'Política de Privacidad de Bioboros: qué datos recopilamos, cómo los ciframos y protegemos, qué cookies usamos, con quién los compartimos y tus derechos.',
    '/terms': 'Términos de Servicio de Bioboros: planes, suscripciones y pagos, uso aceptable, propiedad intelectual y limitación de responsabilidad.',
    '/medical': 'Aviso Médico de Bioboros: nuestras recomendaciones nutricionales son informativas y no sustituyen el consejo de un profesional de la salud.',
    '/data-protection': 'Protección de datos en Bioboros bajo la Ley 172-13: tus derechos de acceso, rectificación, cancelación y oposición, y cómo ejercerlos.',
    '/ai-policy': 'Cómo usa Bioboros la inteligencia artificial: qué datos viajan al proveedor, límites del modelo, supervisión humana y que no entrenamos con tus datos.',
    '/research': 'Política de Investigación de Bioboros: cómo usamos datos anonimizados para mejorar el producto, con exención de datos sensibles de salud y opt-out.',
    '/refunds': 'Reembolsos y cancelaciones de Bioboros: prueba gratis y cancela cuando quieras; las suscripciones no son reembolsables salvo donde la ley lo exija. Conforme a la Ley 358-05.',
    '/acceptable-use': 'Política de Uso de Bioboros: reglas para un uso responsable, conductas prohibidas, uso justo de la IA y consecuencias del incumplimiento.',
    '/about': 'Acerca de Bioboros: nutrición de precisión con IA para la mesa dominicana. Nuestra misión, cómo funciona el motor y los principios que nos guían.',
    '/responsible-disclosure': 'Política de Divulgación Responsable de Bioboros: cómo reportar vulnerabilidades de seguridad, nuestro compromiso de puerto seguro y el alcance del programa.',
    '/novedades': 'Novedades de Bioboros: anuncios, mejoras del motor y todo lo nuevo, a medida que sucede.',
    // [P1-SUPERMARKET-DB · 2026-07-02]
    '/supermercado': `El supermercado dominicano de Bioboros: ${VERIFIED_FOODS_LABEL} alimentos verificados con presentaciones, marcas y precios reales en RD$ que alimentan tu lista de compras.`,
};

// [P3-RESEARCH-PAGE-SCIENTIFIC · 2026-06-30] /research ahora es página propia (estilo científico)
// que fija su propio <title> vía useEffect → self-managed. Su description/canonical se siguen
// gestionando aquí (SELF_MANAGED solo exime el TITLE).
const SELF_MANAGED = new Set(['/motor', '/como-funciona', '/funciones', '/precision', '/research']);

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
