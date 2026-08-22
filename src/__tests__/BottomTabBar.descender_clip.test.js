/**
 * [P2-TABBAR-DESCENDER-CLIP · 2026-08-22] En el iPhone (build 8) la «g» de «Agente»
 * salía con el rabo cortado. Causa: `.tabLabel` combinaba `line-height: 1` con
 * `overflow: hidden`. Con line-height 1 la caja de línea mide EXACTAMENTE el em de la
 * fuente y los descendentes (g, p, y, j) cuelgan por debajo; `overflow: hidden` —que
 * sí hace falta, acota la barra ante traducciones largas— los recorta.
 *
 * Contrato: la etiqueta deja hueco al descendente. `overflow: hidden` se queda.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(
    path.resolve(__dirname, '../components/dashboard/BottomTabBar.module.css'),
    'utf-8',
);

function rule(selector) {
    const i = css.indexOf(`${selector} {`);
    expect(i, `no existe la regla ${selector}`).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('}', i));
}

describe('[P2-TABBAR-DESCENDER-CLIP] la etiqueta de la pestaña no decapita la «g» de Agente', () => {
    it('.tabLabel no usa line-height: 1 (sin hueco para el descendente, overflow lo corta)', () => {
        const r = rule('.tabLabel');
        expect(r).not.toMatch(/line-height:\s*1\s*;/);
        const m = r.match(/line-height:\s*([\d.]+)\s*;/);
        expect(m, '.tabLabel debe declarar line-height').not.toBeNull();
        expect(parseFloat(m[1])).toBeGreaterThanOrEqual(1.2);
    });

    it('.tabLabel conserva overflow: hidden (acota la barra ante traducciones largas)', () => {
        expect(rule('.tabLabel')).toMatch(/overflow:\s*hidden/);
    });
});
