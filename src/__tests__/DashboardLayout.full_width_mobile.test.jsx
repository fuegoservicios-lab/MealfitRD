// [P1-PLAN-LOTE-93 · 2026-09-17] En el teléfono, el contenido del dashboard ocupa el ancho de la PANTALLA, no el de su
// texto más largo.
//
// `.mainContent` lleva `max-width: 1200px; margin: 0 auto` para centrar la columna en escritorio. En ≤1024 su padre pasa a
// `display: flex; flex-direction: column`, y un ítem flex con márgenes automáticos en el eje transversal NO se estira: se
// dimensiona a su contenido. Resultado medido con el armazón real a 392px: con la tarjeta de invitación el dashboard medía
// 360px; al pulsar «Ahora no» —que quita el texto más ancho de la pantalla— pasaba a 294px centrados. `width: 100%` lo ata.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const sinComentarios = (css) => {
    let out = '';
    let i = 0;
    for (;;) {
        const a = css.indexOf('/*', i);
        if (a < 0) return out + css.slice(i);
        out += css.slice(i, a);
        const b = css.indexOf('*/', a + 2);
        if (b < 0) return out;
        i = b + 2;
    }
};

const CSS = () => sinComentarios(src('src/components/dashboard/DashboardLayout.module.css'));
const reglaEn = (css, bloque, selector) => {
    const i = bloque ? css.indexOf(bloque) : 0;
    expect(i).toBeGreaterThan(-1);
    const j = css.indexOf(selector, i);
    expect(j).toBeGreaterThan(-1);
    return css.slice(j, css.indexOf('}', j)).split(/\s+/).join(' ');
};

describe('el dashboard ocupa el ancho de la pantalla en el teléfono', () => {
    it('donde el padre se vuelve flex, el contenido declara su ancho', () => {
        const css = CSS();
        const movil = reglaEn(css, '@media (max-width: 1024px) {', '.mainContent {');
        expect(movil).toContain('width: 100%;');
        // el padre es quien crea el contexto flex: si deja de serlo, esta regla sobra pero no estorba
        expect(reglaEn(css, '@media (max-width: 1024px) {', '.mainWrapper {')).toContain('flex-direction: column;');
    });

    it('el centrado de escritorio sigue intacto (es lo que hace falta el width)', () => {
        const base = reglaEn(CSS(), null, '.mainContent {');
        expect(base).toContain('max-width: 1200px;');
        expect(base).toContain('margin: 0 auto;');
    });
});
