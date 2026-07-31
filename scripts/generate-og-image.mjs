/**
 * [P2-WORDMARK-BIOBOROS · 2026-07-31] Genera `public/og-image-v4.jpg`.
 *
 * POR QUE EXISTE ESTE SCRIPT
 * La imagen de compartir (`og:image`) es lo que iOS enseña en el share sheet y
 * lo que pintan WhatsApp, X y Facebook al pegar el enlace. Es un raster: no la
 * alcanza ningun grep, ningun test de copy y ningun guard del wordmark. La v3
 * seguia diciendo "MealfitRD" con la R indigo y la D rosa semanas despues del
 * rebrand, y solo se descubrio porque el owner compartio el enlace desde su
 * movil y lo VIO.
 *
 * Un asset generado a mano vuelve a quedarse atras. Este script deja el diseno
 * en codigo: la proxima vez que cambie la marca, se edita `MARCA` y se corre.
 *
 * POR QUE PLAYWRIGHT Y NO UNA LIBRERIA DE IMAGEN
 * Renderiza con la MISMA Outfit self-hosted que sirve la app. Dibujarlo con
 * PIL/canvas obligaria a elegir una fuente "parecida", y el wordmark es
 * monocromo: su unico recurso es el tipo y el tracking cerrado. Aproximar la
 * fuente es aproximar la marca entera.
 *
 * USO:  node scripts/generate-og-image.mjs
 * Sirve `public/` por HTTP para que las @font-face resuelvan como en produccion.
 */
import { chromium } from '@playwright/test';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
const SALIDA = join(PUBLIC, 'og-image-v4.jpg');

const MARCA = 'Bioboros';
const TAGLINE = 'Nutrición personalizada con IA';

// Misma paleta que el splash de index.html: la vista previa al compartir y la
// pantalla de arranque son lo mismo visto en dos sitios.
const FONDO = '#0B1120';
const TINTA = '#F8FAFC';
const TINTA_TAGLINE = '#94A3B8';

const HTML = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Outfit'; font-style: normal; font-weight: 500;
    src: url(/fonts/QGYvz_MVcBeNP4NJtEtq.woff2) format('woff2');
  }
  @font-face {
    font-family: 'Outfit'; font-style: normal; font-weight: 800;
    src: url(/fonts/QGYvz_MVcBeNP4NJtEtq.woff2) format('woff2');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 1200px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-family: 'Outfit', system-ui, sans-serif;
    /* Un solo halo neutro. La v3 llevaba glows indigo y rosa; el wordmark es
       monocromo por decision de producto y un fondo bicolor lo contradice. */
    background:
      radial-gradient(ellipse 85% 65% at 50% 42%, rgba(148, 163, 184, 0.10) 0%, transparent 62%),
      ${FONDO};
  }
  .marca {
    font-size: 168px; font-weight: 800; color: ${TINTA};
    /* -0.03em = el mismo tracking que Wordmark.jsx y .splash-brand. Es el UNICO
       recurso que le queda a un wordmark sin color: si aqui difiere, la imagen
       de compartir se ve de otra marca. */
    letter-spacing: -0.03em; line-height: 1;
  }
  .tagline {
    font-size: 50px; font-weight: 500; color: ${TINTA_TAGLINE};
    margin-top: 38px; letter-spacing: -0.01em;
  }
</style>
<div class="marca">${MARCA}</div>
<div class="tagline">${TAGLINE}</div>
`;

const MIME = { '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = createServer(async (req, res) => {
    const ruta = decodeURIComponent(req.url.split('?')[0]);
    if (ruta === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(HTML);
    }
    try {
        const buf = await readFile(join(PUBLIC, ruta));
        res.writeHead(200, { 'Content-Type': MIME[extname(ruta)] ?? 'application/octet-stream' });
        res.end(buf);
    } catch {
        res.writeHead(404).end();
    }
});

await new Promise((r) => server.listen(0, r));
const puerto = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
await page.goto(`http://127.0.0.1:${puerto}/`);
// Sin esto el screenshot puede salir con la fuente de sistema: `font-display`
// deja pintar antes de que la woff2 llegue, y ahi se pierde justo lo que
// distingue al wordmark.
await page.evaluate(() => document.fonts.ready);

// Sanity del vehiculo: si Outfit no cargo, abortamos en vez de publicar una
// imagen con la tipografia equivocada. Outfit a 168px/800 es notablemente mas
// estrecha que cualquier sans de sistema.
const ancho = await page.evaluate(() => document.querySelector('.marca').getBoundingClientRect().width);
const cargada = await page.evaluate(() => document.fonts.check('800 168px Outfit'));
if (!cargada) {
    await browser.close(); server.close();
    throw new Error(`Outfit NO cargo (ancho medido: ${Math.round(ancho)}px). ` +
        `Revisa public/fonts/*.woff2 — publicar con la fuente de sistema cambia la marca.`);
}

await page.screenshot({ path: SALIDA, type: 'jpeg', quality: 92 });
await browser.close();
server.close();

console.log(`OK  ${SALIDA}`);
console.log(`    marca="${MARCA}"  ancho renderizado=${Math.round(ancho)}px  Outfit=cargada`);
