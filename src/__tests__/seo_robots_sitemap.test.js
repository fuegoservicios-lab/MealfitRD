// [F-P2-4 · 2026-05-23] Guard: `public/robots.txt` + `public/sitemap.xml`
// existen + cubren las rutas canónicas + bloquean rutas protegidas.
//
// Gap original (audit production-readiness 2026-05-23, F-P2-4):
//   Sin robots.txt → search bots indexan rutas protegidas (404 después
//   de SPA rewrite + ProtectedRoute redirect → contenido inconsistente).
//   Sin sitemap.xml → crawlers descubren páginas via links solo, perdiendo
//   las legales (/privacy /terms /cookies /medical) que NO tienen link
//   visible desde la home.
//
// Fix:
//   - public/robots.txt con Allow/Disallow explícitas + Sitemap directive.
//   - public/sitemap.xml con las 7 rutas públicas + lastmod + priority.
//
// Cobertura:
//   A) public/robots.txt existe.
//   B) public/sitemap.xml existe + XML válido.
//   C) robots bloquea rutas protegidas canónicas.
//   D) robots referencia sitemap.xml.
//   E) sitemap incluye las rutas legales públicas.
//   F) sitemap NO incluye rutas protegidas (defensa-en-profundidad).

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _PUBLIC = join(__dirname, '..', '..', 'public');
const _ROBOTS = join(_PUBLIC, 'robots.txt');
const _SITEMAP = join(_PUBLIC, 'sitemap.xml');

describe('F-P2-4: SEO robots.txt + sitemap.xml', () => {
    it('A) public/robots.txt existe', () => {
        expect(existsSync(_ROBOTS), `robots.txt ausente en ${_ROBOTS}`).toBe(true);
    });

    it('B) public/sitemap.xml existe y XML bien formado', () => {
        expect(existsSync(_SITEMAP), `sitemap.xml ausente en ${_SITEMAP}`).toBe(true);
        const text = readFileSync(_SITEMAP, 'utf8');
        expect(text.startsWith('<?xml'), 'sitemap.xml NO empieza con XML declaration').toBe(true);
        expect(text.includes('<urlset'), 'sitemap.xml falta <urlset>').toBe(true);
        expect(text.includes('</urlset>'), 'sitemap.xml falta </urlset> closing tag').toBe(true);
    });

    it('C) robots bloquea rutas protegidas canónicas', () => {
        const text = readFileSync(_ROBOTS, 'utf8');
        const mustBlock = ['/dashboard', '/history', '/assessment', '/plan'];
        const missing = mustBlock.filter((r) => !text.includes(`Disallow: ${r}`));
        expect(
            missing,
            `robots.txt NO bloquea rutas protegidas: ${missing.join(', ')}. ` +
            `Bots indexarían páginas que retornan redirect a /login.`,
        ).toHaveLength(0);
    });

    it('D) robots referencia sitemap.xml', () => {
        const text = readFileSync(_ROBOTS, 'utf8');
        expect(
            text.includes('Sitemap:'),
            'robots.txt NO declara `Sitemap:` directive. Crawlers no descubren ' +
            'sitemap automáticamente sin esto.',
        ).toBe(true);
        expect(
            text.includes('sitemap.xml'),
            'robots.txt no referencia sitemap.xml en la Sitemap directive.',
        ).toBe(true);
    });

    it('E) sitemap incluye las 7 rutas públicas + legales', () => {
        const text = readFileSync(_SITEMAP, 'utf8');
        const required = [
            'mealfitrd.com/', // home
            '/login',
            '/register',
            '/privacy',
            '/terms',
            '/cookies',
            '/medical',
        ];
        const missing = required.filter((r) => !text.includes(r));
        expect(
            missing,
            `sitemap.xml NO incluye rutas: ${missing.join(', ')}. ` +
            `Crawlers no descubren páginas legales (sin link visible desde home).`,
        ).toHaveLength(0);
    });

    it('F) sitemap NO incluye rutas protegidas (defensa)', () => {
        const text = readFileSync(_SITEMAP, 'utf8');
        const forbidden = ['/dashboard', '/history', '/assessment', '/plan'];
        const leaked = forbidden.filter((r) => text.includes(`<loc>https://mealfitrd.com${r}`));
        expect(
            leaked,
            `sitemap.xml INCLUYE rutas protegidas: ${leaked.join(', ')}. ` +
            `Inconsistente con robots.txt — eliminar del sitemap.`,
        ).toHaveLength(0);
    });

    it('G) bots agresivos (GPTBot, ClaudeBot, CCBot) bloqueados', () => {
        const text = readFileSync(_ROBOTS, 'utf8');
        const aiBots = ['GPTBot', 'ClaudeBot', 'CCBot', 'anthropic-ai'];
        const missing = aiBots.filter((b) => !text.includes(`User-agent: ${b}`));
        expect(
            missing,
            `robots.txt NO bloquea bots AI scrapers: ${missing.join(', ')}. ` +
            `Si decisión deliberada (permitir scraping para SEO AI), ` +
            `documentar inline y actualizar este test.`,
        ).toHaveLength(0);
    });

    it('H) anchor F-P2-4 presente en al menos uno de los archivos', () => {
        const robotsText = readFileSync(_ROBOTS, 'utf8');
        const sitemapText = readFileSync(_SITEMAP, 'utf8');
        const hasAnchor = robotsText.includes('F-P2-4') || sitemapText.includes('F-P2-4');
        expect(hasAnchor, 'Anchor F-P2-4 perdido en ambos archivos').toBe(true);
    });
});
