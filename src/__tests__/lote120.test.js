// [P1-PLAN-LOTE-120 · 2026-09-19] La pestaña activa se marca con un BRILLO, no con una raya. Desde el lote 118 el borde
// superior de la barra tiene el asa de plegar, y la barrita sólida del indicador era una segunda raya en el mismo
// sitio (el dueño: «que no se parezca a la raya de bajar el menú, quiero que sea un brillo»).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '..', 'components/dashboard/BottomTabBar.module.css'), 'utf8');
const regla = (selector) => {
    const i = css.indexOf(`${selector} {`);
    expect(i, `no existe la regla ${selector}`).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('}', i));
};

describe('[P1-PLAN-LOTE-120] el indicador de la pestaña activa es luz, no una raya', () => {
    it('es un degradado radial que nace en el borde superior y se apaga: sin contorno', () => {
        const r = regla('    .activeIndicator');
        expect(r).toMatch(/radial-gradient\(ellipse 50% 100% at 50% 0%/);
        expect(r).not.toMatch(/linear-gradient/);
        expect(r).not.toMatch(/height:\s*2\.5px/);
        expect(r).toMatch(/rgba\(99, 102, 241, 0\) 75%\)/);
    });

    it('va DEBAJO del icono y del rótulo (no los tiñe) y no roba toques', () => {
        const r = regla('    .activeIndicator');
        expect(r).toMatch(/z-index:\s*-1;/);
        expect(r).toMatch(/pointer-events:\s*none;/);
        expect(r).toMatch(/max-width:\s*100%;/);
    });

    it('el tema oscuro tiene su propio brillo, y el icono activo emite en los dos', () => {
        expect(regla(':global(html[data-theme="dark"]) .activeIndicator')).toMatch(/radial-gradient/);
        expect((css.match(/\.tabActive \.tabIcon \{\s*filter: drop-shadow/g) || []).length).toBe(2);
    });

    it('quien pide menos movimiento no ve el fundido de entrada', () => {
        const i = css.indexOf('.activeIndicator {\n            animation: none;'.replace(/\n/g, css.includes('\r\n') ? '\r\n' : '\n'));
        expect(i).toBeGreaterThan(-1);
    });
});
