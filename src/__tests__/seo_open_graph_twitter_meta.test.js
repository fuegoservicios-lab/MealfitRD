// [F-P2-3 · 2026-05-23] Guard: `index.html` declara Open Graph + Twitter
// Card meta tags para preview rich en redes sociales.
//
// Gap original (audit production-readiness 2026-05-23, F-P2-3):
//   Links compartidos en WhatsApp/LinkedIn/Twitter/Facebook mostraban
//   preview pobre o vacío sin og:* tags. Conversión social degradada.
//
// Fix:
//   index.html declara los 11 meta tags canónicos:
//     - og:type, og:site_name, og:title, og:description, og:url, og:image,
//       og:image:alt, og:locale
//     - twitter:card, twitter:title, twitter:description, twitter:image,
//       twitter:image:alt
//
// Validación cross:
//   - https://opengraph.dev/preview
//   - https://cards-dev.twitter.com/validator
//
// Cobertura:
//   A) index.html existe.
//   B) Open Graph tags canónicas presentes (type, title, description, url, image).
//   C) Twitter Card tags canónicas presentes (card, title, description, image).
//   D) canonical link tag presente.
//   E) Anchor F-P2-3 presente.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _INDEX_HTML = join(__dirname, '..', '..', 'index.html');

const html = readFileSync(_INDEX_HTML, 'utf8');

function _hasMetaProperty(name) {
    // Match: <meta property="og:title" content="..."  > (case insensitive,
    // attribute order flexible).
    const re = new RegExp(`<meta\\s+[^>]*property=["']${name}["']`, 'i');
    return re.test(html);
}

function _hasMetaName(name) {
    const re = new RegExp(`<meta\\s+[^>]*name=["']${name}["']`, 'i');
    return re.test(html);
}

describe('F-P2-3: Open Graph + Twitter Card meta tags', () => {
    it('A) Open Graph: og:type / og:title / og:description / og:url / og:image', () => {
        const required = ['og:type', 'og:title', 'og:description', 'og:url', 'og:image'];
        const missing = required.filter((tag) => !_hasMetaProperty(tag));
        expect(
            missing,
            `index.html NO declara Open Graph tags críticas: ${missing.join(', ')}. ` +
            `Preview en WhatsApp/LinkedIn/Facebook quedará vacío sin estas.`,
        ).toHaveLength(0);
    });

    it('B) Twitter Card: twitter:card / twitter:title / twitter:description / twitter:image', () => {
        const required = [
            'twitter:card',
            'twitter:title',
            'twitter:description',
            'twitter:image',
        ];
        const missing = required.filter((tag) => !_hasMetaName(tag));
        expect(
            missing,
            `index.html NO declara Twitter Card tags: ${missing.join(', ')}. ` +
            `Twitter / X muestran preview pobre sin estas.`,
        ).toHaveLength(0);
    });

    it('C) twitter:card value es `summary_large_image` (no `summary`)', () => {
        // `summary_large_image` muestra imagen grande, mejor CTR que `summary`.
        const match = html.match(/name=["']twitter:card["']\s+content=["']([^"']+)["']/i);
        expect(match, 'twitter:card sin atributo content').not.toBeNull();
        expect(
            match[1],
            `twitter:card="${match[1]}" — para imagen prominente usar ` +
            `'summary_large_image'.`,
        ).toBe('summary_large_image');
    });

    it('D) og:image y twitter:image apuntan al MISMO asset', () => {
        const og = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
        const tw = html.match(/name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
        expect(og, 'og:image sin content').not.toBeNull();
        expect(tw, 'twitter:image sin content').not.toBeNull();
        expect(
            og[1],
            `og:image (${og[1]}) NO matchea twitter:image (${tw[1]}). ` +
            `Inconsistencia visual entre plataformas.`,
        ).toBe(tw[1]);
    });

    it('E) canonical link presente', () => {
        const re = /<link\s+rel=["']canonical["']/i;
        expect(
            re.test(html),
            'index.html NO declara <link rel="canonical">. Sin canonical, ' +
            'duplicación de contenido (e.g. /?utm_source=X) confunde SEO.',
        ).toBe(true);
    });

    it('F) anchor F-P2-3 presente', () => {
        expect(
            html.includes('F-P2-3'),
            'Anchor F-P2-3 ausente en index.html. Sin breadcrumb, refactor ' +
            'cosmético del HEAD pierde el contexto del gap.',
        ).toBe(true);
    });
});
