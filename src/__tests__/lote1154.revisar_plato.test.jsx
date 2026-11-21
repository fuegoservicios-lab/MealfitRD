// [P1-PLAN-LOTE-1154 · 2026-11-21] «Mejora el diseño de la pantalla de revisar plato». El total del plato vivía en el
// primero de cuatro campos de texto; ahora va arriba, con anillo y cifras, y se mueve con todo lo que lo cambia.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResumenDelPlato from '../components/dashboard/ResumenDelPlato';
import { tramosDelAnillo } from '../utils/anilloDelPlato';

const leer = (rel) => fs.readFileSync(rel, 'utf-8').replace(/\r\n/g, '\n');

describe('lote 1154 · el total del plato, de un vistazo', () => {
    it('pinta las kcal y las tres macros', () => {
        render(<ResumenDelPlato macros={{ calories: 659.6, protein: 41, carbs: 76, healthy_fats: 19 }} />);
        const g = screen.getByRole('group', { name: 'Total del plato' });
        expect(g).toHaveTextContent('660 kcal');
        expect(g).toHaveTextContent('41 g proteína');
        expect(g).toHaveTextContent('76 g carbs');
        expect(g).toHaveTextContent('19 g grasas');
    });

    it('el anillo reparte por kcal (4/4/9), sin tramos vacíos', () => {
        const t = tramosDelAnillo({ protein: 10, carbs: 10, healthy_fats: 0 });
        expect(t.map((x) => x.k)).toEqual(['p', 'c']);
        expect(t[0].largo).toBeCloseTo(t[1].largo);
        expect(tramosDelAnillo({})).toEqual([]);
        const [p, c, gr] = tramosDelAnillo({ protein: 10, carbs: 10, healthy_fats: 10 });
        expect(gr.largo / p.largo).toBeCloseTo(9 / 4);
        expect(c.desde).toBeCloseTo(p.largo);
    });

    it('el editor lo pone lo primero, con las mismas macros que se registran', () => {
        const s = leer('src/components/dashboard/ScanMealModal.jsx');
        const i = s.indexOf('<ResumenDelPlato macros={m} />');
        expect(i).toBeGreaterThan(0);
        expect(i).toBeLessThan(s.indexOf("{t('Revisa esto antes de registrar:')}"));
        expect(s.slice(s.lastIndexOf('const m = macrosDelPlato(plato);', i), i)).toContain('const m = macrosDelPlato(plato);');
    });

    it('cada ingrediente en dos líneas: «Cambiar» vive en la fila de la cantidad', () => {
        const s = leer('src/components/dashboard/ScanMealModal.jsx');
        const fila = s.slice(s.indexOf('const FilaComponente'), s.indexOf('FilaComponente.propTypes'));
        expect(fila.indexOf('className={styles.componentCambiar}')).toBeGreaterThan(fila.indexOf('<div className={styles.componentQtyRow}>'));
        const css = leer('src/components/dashboard/ScanMealModal.module.css');
        expect(css).toContain('.componentQtyRow .componentCambiar {');
    });

    it('las dudas, en índigo (el amarillo de advertencia parecía un error)', () => {
        const css = leer('src/components/dashboard/ScanMealModal.module.css');
        const i = css.indexOf('\n.dudas {');
        expect(css.slice(i, css.indexOf('}', i))).toContain('var(--primary)');
        expect(css.slice(i, css.indexOf('}', i))).not.toContain('--warning');
    });
});
