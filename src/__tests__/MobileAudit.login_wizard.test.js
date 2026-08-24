/**
 * [P2-MOBILE-AUDIT-LOGIN-WIZARD · 2026-08-22] Auditoría con WebKit real (320/390/430 px)
 * del login y los 24 pasos del formulario. Cero desbordes, cero recortes, cero páginas más
 * altas que su contenido. Tres hallazgos, los tres del mismo tipo: valores que en escritorio
 * no se notan y en un iPhone sí.
 *
 *  1. `.mf-privacy a` — enlaces legales de 16 px de alto. Apple HIG pide 44 pt para lo
 *     que se toca; un enlace en línea no puede medir 44, pero sí darle relleno vertical
 *     y `display:inline-block` para que la zona táctil crezca sin romper la línea.
 *  2. Campo de búsqueda de «Tus básicos» a 0.95rem (15,2 px).
 *  3. Área de texto de «¿Por qué AHORA?» a 0.95rem (15,2 px).
 *     iOS Safari hace ZOOM al enfocar cualquier campo con fuente < 16 px, y el zoom se
 *     queda tras cerrar el teclado. El resto de inputs del wizard ya van a 1rem.
 *
 * Estos guards son parser-based (el e2e que mide en navegador es caro); la regla que
 * protegen es numérica y barata de comprobar en el fuente.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

describe('[P2-MOBILE-AUDIT-LOGIN-WIZARD] campos de texto del wizard a ≥ 16px (sin zoom de iOS)', () => {
    it('QStapleFoods: el buscador no usa fontSize < 1rem', () => {
        const src = read('components/assessment/questions/QStapleFoods.jsx');
        // Se mide el <input ...> que lleva ese placeholder, no una ventana ciega: un <p>
        // vecino a 0.9rem es texto, no un campo, y no dispara el zoom.
        const ph = src.indexOf('Busca un alimento');
        expect(ph).toBeGreaterThan(0);
        const ini = src.lastIndexOf('<input', ph);
        const fin = src.indexOf('/>', ph);
        expect(ini).toBeGreaterThan(0);
        const input = src.slice(ini, fin);
        expect(input).not.toMatch(/fontSize:\s*'0\.9\d?rem'/);
        expect(input).toMatch(/fontSize:\s*'1rem'/);
    });

    it('QMotivation: el textarea no usa fontSize < 1rem', () => {
        const src = read('components/assessment/questions/QMotivation.jsx');
        const i = src.indexOf('<textarea');
        expect(i).toBeGreaterThan(0);
        const bloque = src.slice(i, i + 900);
        expect(bloque).not.toMatch(/fontSize:\s*'0\.9\d?rem'/);
        expect(bloque).toMatch(/fontSize:\s*'1rem'/);
    });
});

describe('[P2-MOBILE-AUDIT-LOGIN-WIZARD] enlaces legales del login con zona táctil', () => {
    it('.mf-privacy a lleva display inline-block y padding vertical', () => {
        const css = read('pages/Login.css');
        const i = css.indexOf('.mf-privacy a {');
        expect(i, 'falta la regla .mf-privacy a').toBeGreaterThan(0);
        const rule = css.slice(i, css.indexOf('}', i));
        expect(rule).toMatch(/display:\s*inline-block/);
        expect(rule).toMatch(/padding:\s*0\.\d+(rem|em)\s+0/);
    });
});

describe('[P1-LOGIN-CTA-LIMPIO] el botón de correo no tiene canto blanco', () => {
    it('elimina la apariencia nativa, el borde, el degradado y la sombra', () => {
        const css = read('pages/Login.css');
        const baseStart = css.indexOf('.mf-btn {');
        const base = css.slice(baseStart, css.indexOf('}', baseStart));
        expect(base).toMatch(/-webkit-appearance:\s*none/);
        expect(base).toMatch(/appearance:\s*none/);

        const start = css.indexOf('.mf-btn--primary {');
        const rule = css.slice(start, css.indexOf('}', start));
        expect(rule).toMatch(/background:\s*#[0-9A-F]{6}/i);
        expect(rule).toMatch(/background-image:\s*none/);
        expect(rule).toMatch(/border:\s*0/);
        expect(rule).toMatch(/box-shadow:\s*none/);
        expect(rule).not.toMatch(/linear-gradient/);
    });
});
