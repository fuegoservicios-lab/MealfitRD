// [P2-LANDING-SITEMAP-SSOT · 2026-08-14] Genera `public/sitemap.xml` desde las
// listas que YA existen, en vez de mantener una cuarta copia a mano.
//
// POR QUÉ. `sitemap.xml` era la 4ª copia de la lista de rutas públicas (las otras
// tres: `paperSurface.js`, el boot script de `index.html` y `marketingRoutes.js`)
// y la única sin ningún test que la cruzara con `App.jsx`. Derivó exactamente
// como derivan las listas a mano: le faltaba `/supermercado` —la página con más
// contenido único del sitio— mientras SÍ listaba el artículo que la anunciaba.
// Entró el anuncio del catálogo y no el catálogo.
//
// Correr con `npm run build:sitemap`, o automáticamente en `prebuild`.
//
// Lo que NO entra, y por qué cada exclusión es una decisión y no un olvido:
//   · `/cookies`  — es `<Navigate to="/privacy">` (P3-COOKIES-MERGE). Indexar una
//                   redirección gasta presupuesto de rastreo y produce el
//                   duplicado que la fusión existía para evitar.
//   · `/login`    — en el apex sólo redirige por JS a app.* (P3-APP-SUBDOMAIN-
//                   ROUTING). Para un crawler es una página vacía que se mueve.
//   · noticias con `href` — apuntan a otra página del sitio (p. ej. `/motor`), así
//                   que su slug sería un duplicado de un destino ya listado.
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { PAPER_SURFACE_ROUTES } from '../src/utils/paperSurface.js';
import { SITE_DOMAIN } from '../src/config/site.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(AQUI, '..', 'public', 'sitemap.xml');
const ORIGEN = `https://${SITE_DOMAIN}`;

/** Rutas que existen pero no deben indexarse. Ver la cabecera. */
const NO_INDEXAR = new Set(['/cookies']);

/** Prioridad y frecuencia por ruta. La portada manda; el resto son estables. */
const PESO = {
    '/': { priority: '1.0', changefreq: 'weekly' },
    '/precios': { priority: '0.9', changefreq: 'monthly' },
    '/supermercado': { priority: '0.8', changefreq: 'weekly' },
    '/novedades': { priority: '0.7', changefreq: 'weekly' },
};
const PESO_LEGAL = { priority: '0.3', changefreq: 'yearly' };
const LEGALES = new Set([
    '/privacy', '/terms', '/medical', '/data-protection', '/ai-policy',
    '/refunds', '/acceptable-use', '/responsible-disclosure',
]);

/**
 * Slugs de novedades que SÍ son artículos.
 *
 * Se leen del fuente con una expresión regular en vez de importar `news.js`
 * porque ese módulo arrastra JSX; aquí sólo hacen falta dos campos. Se parte por
 * bloque `{` para poder mirar si el MISMO objeto declara `href`.
 */
function slugsDeArticulos() {
    const fuente = readFileSync(path.join(AQUI, '..', 'src', 'data', 'news.js'), 'utf8');
    return fuente
        .split(/\n {4}\{/)
        .map((bloque) => {
            const slug = bloque.match(/slug:\s*'([^']+)'/);
            return slug && !bloque.includes('href:') ? slug[1] : null;
        })
        .filter(Boolean);
}

function entrada(ruta, hoy) {
    const peso = PESO[ruta] || (LEGALES.has(ruta) ? PESO_LEGAL : { priority: '0.6', changefreq: 'monthly' });
    return `  <url>
    <loc>${ORIGEN}${ruta}</loc>
    <lastmod>${hoy}</lastmod>
    <changefreq>${peso.changefreq}</changefreq>
    <priority>${peso.priority}</priority>
  </url>`;
}

export function construirSitemap(hoy) {
    const rutas = PAPER_SURFACE_ROUTES.filter((r) => !NO_INDEXAR.has(r));
    const articulos = slugsDeArticulos().map((slug) => `/novedades/${slug}`);
    const todas = [...rutas, ...articulos];
    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- [P2-LANDING-SITEMAP-SSOT · 2026-08-14] GENERADO por scripts/build-sitemap.mjs.
     NO editar a mano: la edición se perderá en el próximo build y, peor, volvería
     a abrir la deriva que este generador cerró (faltaba /supermercado mientras sí
     estaba el artículo que lo anunciaba).
     Fuentes: src/utils/paperSurface.js (rutas públicas) + src/data/news.js (slugs).
     Para añadir una ruta al sitemap, añádela a su SSOT y vuelve a generar. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${todas.map((r) => entrada(r, hoy)).join('\n')}
</urlset>
`;
}

/**
 * Hoy, en República Dominicana (UTC-4), no en UTC.
 *
 * [P3-SITEMAP-DIA-RD · 2026-08-15] `new Date().toISOString()` da la fecha UTC, así
 * que cualquier build lanzado después de las 20:00 hora de RD estampaba el
 * `lastmod` de MAÑANA — un sitemap que dice haberse publicado en el futuro. Se
 * reprodujo el 2026-08-14: un build a las 22:5x escribió `2026-08-15`.
 *
 * Es la misma clase de bug de «¿el día de quién?» que este repo ya pagó en
 * P1-AGENT-SESSION-DAY, y que `isLaunchOfferActive()` resuelve con este mismo
 * offset. RD no aplica horario de verano, así que -04:00 es constante todo el año
 * y no hace falta una librería de zonas.
 */
export function hoyEnRD(ahora = new Date()) {
    return new Date(ahora.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * `llms.txt` — el mapa del sitio para modelos de lenguaje (llmstxt.org).
 *
 * [P3-LLMS-TXT · 2026-08-15] Antes NO existía, y eso no era neutro: el fallback
 * SPA de nginx responde `index.html` con **HTTP 200** a cualquier ruta, así que un
 * crawler que pedía `/llms.txt` recibía la portada en HTML y la interpretaba como
 * el fichero. Lighthouse lo reportaba como «missing H1, no links» — describiendo,
 * sin saberlo, el `index.html`.
 *
 * Se genera del MISMO SSOT que el sitemap por la misma razón: una lista a mano se
 * queda atrás. Y el repo ya declara por escrito que le importan estos clientes —
 * el `<noscript>` de `index.html` nombra a GPTBot, ClaudeBot y PerplexityBot como
 * lectores que no ejecutan JS.
 */
const DESCRIPCION = {
    '/': 'Portada: qué es Bioboros y para quién.',
    '/precios': 'Planes, precios en USD y qué incluye cada nivel.',
    '/como-funciona': 'El método, paso a paso.',
    '/funciones': 'Qué incluye el producto.',
    '/precision': 'Qué se mide y con qué margen.',
    '/motor': 'Cómo se genera un plan: modelos, guardas clínicas y validación.',
    '/research': 'Fundamento y referencias.',
    '/novedades': 'Registro de cambios y anuncios.',
    '/supermercado': 'Catálogo de presentaciones comprables en supermercados de RD.',
    '/about': 'Quién está detrás.',
};

export function construirLlmsTxt() {
    const rutas = PAPER_SURFACE_ROUTES.filter((r) => !NO_INDEXAR.has(r));
    const producto = rutas.filter((r) => !LEGALES.has(r));
    const legales = rutas.filter((r) => LEGALES.has(r));
    const articulos = slugsDeArticulos();

    const linea = (r) => `- [${ORIGEN}${r}](${ORIGEN}${r})${DESCRIPCION[r] ? `: ${DESCRIPCION[r]}` : ''}`;

    return `# Bioboros

> Planes de nutrición personalizada generados con IA para República Dominicana.
> Se adaptan a condiciones médicas, medicamentos, alergias, presupuesto y a lo que
> se consigue de verdad en un supermercado dominicano.

Este fichero se GENERA desde \`scripts/build-sitemap.mjs\`; no lo edites a mano.
Sus fuentes son las mismas que las del sitemap: \`src/utils/paperSurface.js\` y
\`src/data/news.js\`.

## Páginas

${producto.map(linea).join('\n')}

## Novedades

${articulos.map((s) => `- [${ORIGEN}/novedades/${s}](${ORIGEN}/novedades/${s})`).join('\n')}

## Legal

${legales.map(linea).join('\n')}
`;
}

// Los efectos (escribir en `public/`) SOLO al ejecutarlo, nunca al importarlo.
//
// Sin esta guarda, el test que importa este módulo para probar `hoyEnRD` reescribe
// `public/sitemap.xml` y `public/llms.txt` en cada `npm test` — y `sitemap.xml`
// lleva la fecha, así que el árbol de trabajo aparecía modificado sin que nadie lo
// hubiera tocado. Un test que ensucia el repo al leerlo acaba enseñando a ignorar
// `git status`, que es donde se esconden los cambios que sí importan.
const EJECUTADO_DIRECTAMENTE = process.argv[1]
    && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (EJECUTADO_DIRECTAMENTE) {
    const hoy = hoyEnRD();
    const xml = construirSitemap(hoy);
    writeFileSync(SALIDA, xml, 'utf8');
    const cuantas = (xml.match(/<loc>/g) || []).length;
    console.log(`[sitemap] ${cuantas} URLs escritas en public/sitemap.xml (lastmod ${hoy}, día de RD)`);

    const llms = construirLlmsTxt();
    writeFileSync(path.join(AQUI, '..', 'public', 'llms.txt'), llms, 'utf8');
    console.log(`[llms.txt] ${(llms.match(/^- \[/gm) || []).length} enlaces escritos en public/llms.txt`);
}
