// [P1-PLAN-LOTE-92 · 2026-09-17] El diseño de teléfono del contador no puede depender de un acantilado en 480px.
//
// El dueño, con captura de su iPhone: «se ve estrecho, mira todo el espacio que tiene los bordes de los lados, hay vacíos».
// Comprobado en el log del servidor que su teléfono tenía el JS y el CSS correctos, y que el JS pasa `flatOnMobile`; medido
// en la captura, el contenido ocupaba ~75 % del ancho — exactamente lo que se ve si el bloque de 480 NO casa. Basta con que
// el usuario baje el zoom del sitio para que su viewport CSS pase de 480. El resto del armazón ya decide «teléfono» en 768.
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

// El bloque `@media` que contiene `aguja`, con su cabecera: devuelve [cabecera, cuerpo].
const bloqueDe = (rel, aguja) => {
    const css = sinComentarios(src(rel));
    const i = css.indexOf(aguja);
    expect(i).toBeGreaterThan(-1);
    const ini = css.lastIndexOf('@media', i);
    expect(ini).toBeGreaterThan(-1);
    return [css.slice(ini, css.indexOf('{', ini)).trim(), css.slice(ini, i + aguja.length)];
};

describe('el corte del teléfono es 768, no 480', () => {
    it('las tres reglas del teléfono viven en @media (max-width: 768px)', () => {
        for (const [rel, aguja] of [
            ['src/components/dashboard/TrackingProgress.module.css', '.card.flatMobile'],
            ['src/components/dashboard/WaterTracker.module.css', '.card.flatMobile'],
            ['src/components/dashboard/DashboardTracking.module.css', 'padding: 0.35rem 0.15rem 0.5rem'],
        ]) {
            const [cabecera] = bloqueDe(rel, aguja);
            expect(cabecera).toBe('@media (max-width: 768px)');
        }
    });

    it('ningún módulo del contador deja el aplanado en un bloque de 480', () => {
        for (const rel of [
            'src/components/dashboard/TrackingProgress.module.css',
            'src/components/dashboard/WaterTracker.module.css',
            'src/components/dashboard/DashboardTracking.module.css',
        ]) {
            const css = sinComentarios(src(rel));
            const i = css.indexOf('@media (max-width: 480px) {');
            if (i < 0) continue;
            const fin = css.indexOf('\n}\n', i);
            const cuerpo = css.slice(i, fin);
            expect(cuerpo).not.toContain('flatMobile');
            expect(cuerpo).not.toContain('0.35rem 0.15rem');
            expect(cuerpo).not.toContain(':has(');
        }
    });

    it('768 es el MISMO corte con el que el armazón se vuelve teléfono', () => {
        const layout = sinComentarios(src('src/components/dashboard/DashboardLayout.module.css'));
        const i = layout.lastIndexOf('@media (max-width: 768px) {');
        expect(i).toBeGreaterThan(-1);
        // el relleno estrecho del contenido es la firma de «esto ya es un teléfono»
        expect(layout.slice(i).split(/\s+/).join(' ')).toContain('.mainContent { padding: 0.65rem 0.85rem;');
    });
});
