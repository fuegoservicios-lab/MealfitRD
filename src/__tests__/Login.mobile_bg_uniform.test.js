// [P2-LOGIN-MOBILE-BG-UNIFORM · 2026-09-04] Captura del dueño (iPhone): bajo el último texto del
// login («Genera un plan de muestra gratis…») el fondo cambiaba de tono. El login mide `100dvh`
// y pinta su propio fondo (`--mf-bg`); lo que queda fuera de esa caja (la zona que Safari
// descubre al plegar su barra, el rebote, el safe-area inferior) es el <body>, que llevaba
// `--bg-page` del dashboard. Mientras el login está montado, html/body se pintan del MISMO
// valor. El literal se repite porque el token vive dentro de `.mf-login`: este test los ata.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(process.cwd(), 'src/pages/Login.css'), 'utf8').split(String.fromCharCode(13)).join('');

describe('login en móvil: el lienzo del documento es del mismo color que el login', () => {
    it('html/body llevan el mismo literal que --mf-bg mientras el login está montado', () => {
        const token = CSS.match(/^\s*--mf-bg:\s*(#[0-9A-Fa-f]{6});/m);
        expect(token, 'falta --mf-bg en .mf-login').toBeTruthy();
        const i = CSS.indexOf('html:has(.mf-login),\n  body:has(.mf-login) {');
        expect(i).toBeGreaterThan(0);
        const block = CSS.slice(i, CSS.indexOf('}', i));
        expect(block).toContain(`background: ${token[1]};`);
        expect(block).toContain('overflow: hidden;');
    });
});
