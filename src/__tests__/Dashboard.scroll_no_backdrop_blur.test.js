// [P3-DASH-SCROLL-NO-BLUR · 2026-09-03] «Cuando scrolleo esto se ve raro, en especial si
// scrolleo rápido y explosivo» (dueño, sobre el panel de macros del Dashboard). Un
// `backdrop-filter` en un elemento que SCROLLEA con la página obliga al navegador a
// re-muestrear y desenfocar el fondo en cada frame; en scrolls rápidos Chrome pinta esa capa
// un frame tarde y el hero (justo encima del panel) se despega del resto. En oscuro el hero
// ya tenía fondo opaco: el blur era coste puro. Solo el overlay «cocinando» (3px, encima de
// UNA card y solo durante un swap) conserva su backdrop-filter en el CSS del Dashboard.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/Dashboard.jsx'), 'utf8')
    .split(String.fromCharCode(13)).join('');

function cssBlock(selectorLine) {
    const i = SRC.indexOf(selectorLine);
    expect(i, selectorLine).toBeGreaterThan(0);
    return SRC.slice(i, SRC.indexOf('}', i));
}

describe('dashboard: nada que scrollea lleva backdrop-filter', () => {
    it('el hero no desenfoca el fondo (ni en claro ni en oscuro)', () => {
        expect(cssBlock('.dashboard-header {')).not.toContain('backdrop-filter');
        expect(cssBlock('html[data-theme="dark"] .dashboard-header {')).not.toContain('backdrop-filter');
        // en claro, la opacidad sube para no perder lectura sin el blur
        expect(cssBlock('.dashboard-header {')).toContain('rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.82) 100%');
    });

    it('el único backdrop-filter del CSS del Dashboard es el overlay cocinando', () => {
        const usos = SRC.split('backdrop-filter: blur(').length - 1;
        expect(usos, 'backdrop-filter + -webkit-backdrop-filter del overlay').toBe(2);
        expect(cssBlock('.meal-cooking-overlay {')).toContain('backdrop-filter: blur(3px)');
    });
});
