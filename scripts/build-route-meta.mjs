// [P2-LANDING-PRERENDER-META · 2026-08-14] Un `<head>` de verdad por cada ruta
// pública, estampado tras el build.
//
// EL DEFECTO QUE CIERRA. `index.html` era el ÚNICO HTML que existía, y sus
// `canonical`, `og:url`, `og:title` y `og:description` apuntaban todos a la
// portada. `RouteTitle.jsx` los corrige en el cliente, pero eso sólo sirve a
// quien ejecuta JavaScript — y los unfurlers sociales NO lo hacen. El propio
// comentario de `RouteTitle` lo declaraba por escrito: «los unfurlers
// (WhatsApp/Facebook/etc.) siguen leyendo el index.html estático… requeriría
// prerender por ruta (no hecho aquí)».
//
// Consecuencia real: compartir `/precios`, `/motor`, `/supermercado` o un
// artículo de `/novedades` por WhatsApp —el canal #1 en RD, y de donde viene el
// crecimiento de este producto— desplegaba una tarjeta con el título y la
// descripción de la PORTADA. Y por la especificación de Open Graph, `og:url` es
// el identificador permanente del objeto: las 20 URLs resolvían al MISMO objeto.
// Bing y los crawlers de IA (GPTBot, ClaudeBot, PerplexityBot) tampoco renderizan.
//
// LO QUE ESTO **NO** ES: no es SSR ni prerender de contenido. El `<body>` sigue
// siendo el mismo shell vacío; lo que cambia es el `<head>`. Es deliberado —
// resuelve el problema real (la previsualización y las señales a buscadores) sin
// tocar React, sin meter Chromium en el build del VPS y sin reescribir 50 rutas.
//
// TRES TRAMPAS, todas verificadas antes de escribir esto:
//   1. `try_files $uri $uri/ /index.html` DEBE incluir `$uri/`, o nginx ignora
//      estos ficheros en silencio y todo el ejercicio nace inerte.
//      Verificado en producción el 2026-08-14: lo incluye.
//   2. `location = /index.html` era coincidencia EXACTA, así que los HTML nuevos
//      no heredaban su `Cache-Control: no-cache` — y un HTML cacheado que
//      referencia hashes ya borrados es una página rota hasta limpiar caché.
//      Cambiado a `location ~ /index\.html$` en el mismo P-fix.
//   3. `injectManifest.globPatterns` incluye `**/*.html`: sin excluirlos, las ~20
//      copias entran al precache del Service Worker (+~250 KB por visitante).
//      Excluidos en `vite.config.js`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { PAPER_SURFACE_ROUTES } from '../src/utils/paperSurface.js';
import { SITE_DOMAIN } from '../src/config/site.js';
import { metaForRoute, BRAND } from '../src/data/routeMeta.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(AQUI, '..', 'dist');
const ORIGEN = `https://${SITE_DOMAIN}`;

/** `/cookies` sólo redirige (P3-COOKIES-MERGE): un HTML propio sería un duplicado. */
const SIN_HTML_PROPIO = new Set(['/', '/cookies']);

const escapar = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Sustituye una etiqueta del `<head>` por su valor de esta ruta.
 *
 * Se reemplaza sobre el HTML ya construido en vez de generarlo: así los `<script
 * type="module">` con hash, el bloque del tema, el gateado por host y todo lo que
 * Vite inyecte siguen siendo EXACTAMENTE los mismos. Un generador propio se
 * quedaría atrás en cuanto el build cambiara.
 */
function sustituir(html, { titulo, descripcion, url }) {
    return html
        .replace(/<title>[^<]*<\/title>/, `<title>${escapar(titulo)}</title>`)
        .replace(
            /(<meta name="description" content=")[^"]*(")/,
            `$1${escapar(descripcion)}$2`,
        )
        .replace(
            /(<link rel="canonical" href=")[^"]*(")/,
            `$1${escapar(url)}$2`,
        )
        .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapar(titulo)}$2`)
        .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapar(descripcion)}$2`)
        .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapar(url)}$2`)
        .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapar(titulo)}$2`)
        .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapar(descripcion)}$2`);
}

/** Artículos de novedades, leídos del fuente (el módulo arrastra JSX). */
function articulos() {
    const fuente = readFileSync(path.join(AQUI, '..', 'src', 'data', 'news.js'), 'utf8');
    return fuente
        .split(/\n {4}\{/)
        .map((bloque) => {
            const slug = bloque.match(/slug:\s*'([^']+)'/);
            if (!slug || bloque.includes('href:')) return null;
            const titulo = bloque.match(/title:\s*'([^']*)'/) || bloque.match(/title:\s*"([^"]*)"/);
            const resumen = bloque.match(/excerpt:\s*'([^']*)'/) || bloque.match(/excerpt:\s*"([^"]*)"/);
            const fecha = bloque.match(/date:\s*'([^']+)'/);
            return {
                ruta: `/novedades/${slug[1]}`,
                titulo: titulo ? `${titulo[1]} · ${BRAND}` : `Novedades · ${BRAND}`,
                descripcion: resumen ? resumen[1] : null,
                fecha: fecha ? fecha[1] : null,
            };
        })
        .filter(Boolean);
}

/** JSON-LD `NewsArticle` para los artículos: los hace elegibles como noticia. */
function jsonLdArticulo({ titulo, descripcion, ruta, fecha }) {
    const datos = {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: titulo,
        description: descripcion || undefined,
        datePublished: fecha || undefined,
        url: `${ORIGEN}${ruta}`,
        publisher: { '@type': 'Organization', name: BRAND, url: `${ORIGEN}/` },
    };
    return `\n  <script type="application/ld+json">\n${JSON.stringify(datos, null, 2)}\n  </script>\n`;
}

function main() {
    const indexPath = path.join(DIST, 'index.html');
    if (!existsSync(indexPath)) {
        console.error('[route-meta] no existe dist/index.html — ¿corriste `vite build`?');
        process.exit(1);
    }
    const base = readFileSync(indexPath, 'utf8');

    const paginas = PAPER_SURFACE_ROUTES
        .filter((r) => !SIN_HTML_PROPIO.has(r))
        .map((ruta) => {
            const { title, description } = metaForRoute(ruta);
            return { ruta, titulo: title, descripcion: description, extra: '' };
        });

    for (const a of articulos()) {
        paginas.push({
            ruta: a.ruta,
            titulo: a.titulo,
            descripcion: a.descripcion || metaForRoute('/novedades').description,
            extra: jsonLdArticulo(a),
        });
    }

    let escritas = 0;
    for (const p of paginas) {
        const url = `${ORIGEN}${p.ruta}`;
        let html = sustituir(base, { titulo: p.titulo, descripcion: p.descripcion, url });
        if (p.extra) html = html.replace('</head>', `${p.extra}</head>`);
        const destino = path.join(DIST, p.ruta.replace(/^\//, ''), 'index.html');
        mkdirSync(path.dirname(destino), { recursive: true });
        writeFileSync(destino, html, 'utf8');
        escritas++;
    }

    // Verificación en el sitio: si el reemplazo no cambió nada, el HTML base dejó
    // de tener las etiquetas que buscamos y estos ficheros serían copias inútiles
    // de la portada. Fallar aquí es infinitamente mejor que publicar 20 duplicados.
    const muestra = readFileSync(path.join(DIST, 'precios', 'index.html'), 'utf8');
    const esperado = metaForRoute('/precios').title;
    if (!muestra.includes(`<title>${escapar(esperado)}</title>`)) {
        console.error('[route-meta] el <title> no se sustituyó: el HTML base cambió de forma.');
        process.exit(1);
    }
    console.log(`[route-meta] ${escritas} HTML por ruta escritos en dist/`);
}

main();
