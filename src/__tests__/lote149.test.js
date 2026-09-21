// [P1-PLAN-LOTE-149 · 2026-09-21] El borde inferior del login en la app.
//
// El dueño, con captura del iPhone: «el borde de abajo del texto "genera un plan de muestra gratis" casi está cerca
// del borde». Causa: con DOS botones de OAuth (Apple del 146 y Google del 147, donde antes no había NINGUNO en
// nativo) la columna pasó a llenar la pantalla exacta.
//
// Medido en el arnés a 390×797 —el viewport REAL de la app instalada, que no llega al borde de la pantalla—:
//
//     antes   hueco 15 px · scrollHeight === clientHeight (sin recorrido)
//     ahora   hueco 44 px · sigue sin recorrido
//
// Por eso no bastaba con subir el relleno: sin altura libre, habría creado scroll. Se libera arriba (ilustración y
// titular, que es lo decorativo) y se gasta abajo. Comprobado también a 375×812, 430×932 (hueco 51, sin scroll) y
// 375×667, que sigue desplazándose como ya hacía, pero 25 px menos.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Login.css'), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 149 · el login respira por abajo en la app', () => {
    it('el relleno inferior sigue sumando el safe-area, y es mayor que antes', () => {
        expect(css).toContain('padding-bottom: calc(3.2rem + env(safe-area-inset-bottom, 0px));');
        expect(css).not.toContain('padding-bottom: calc(2.2rem + env(safe-area-inset-bottom, 0px));');
    });

    it('la altura la cede lo DECORATIVO, no un control', () => {
        // lastIndexOf: la primera aparición es la regla de escritorio (`display: none`), no la del móvil
        const i = css.lastIndexOf('.mf-hero-illu {');
        const regla = css.slice(i, css.indexOf('}', i));
        expect(regla).toContain('width: 46%;');
        expect(regla).toContain('max-width: 176px;');
        // el reparto del espacio libre sigue siendo suyo: en pantallas altas crece el aire de arriba, no el de abajo
        expect(regla).toContain('margin: auto auto 0;');
        expect(css).toContain('margin: 1.1rem 0 1.4rem;');
    });

    it('ningún botón encogió: los controles conservan su zona táctil', () => {
        expect(css).toContain('.mf-btn { padding: 1.05rem 1.25rem; border-radius: 0.95rem; }');
        expect(css).toContain('.mf-input { padding: 1.05rem 1.1rem; border-radius: 0.95rem; }');
    });
});
