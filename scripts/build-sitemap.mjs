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

// `lastmod` es la fecha de generación: el sitemap se regenera en cada build, así
// que refleja cuándo se publicó el sitio, que es lo que un crawler quiere saber.
const hoy = new Date().toISOString().slice(0, 10);
const xml = construirSitemap(hoy);
writeFileSync(SALIDA, xml, 'utf8');
const cuantas = (xml.match(/<loc>/g) || []).length;
console.log(`[sitemap] ${cuantas} URLs escritas en public/sitemap.xml (lastmod ${hoy})`);
