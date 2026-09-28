// [P1-PLAN-LOTE-702 · 2026-09-28] El país de lectura vive fuera de la tabla de nombres: el arranque no carga la tabla.
//
// `AssessmentContext` (JS de arranque) sólo FIJA el país, pero importaba `nombresDelPais.js` y con él la tabla
// `nombresPorPais.json` y el glosador: +1,2 kB gz en el entry (medido por mealfitrd-ia-9b, presupuesto 148 kB).
// El estado pasa a `paisDelUsuario.js`, sin tabla; quien glosa (páginas perezosas) sigue importando `nombresDelPais`.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setPaisDeLectura } from '../utils/paisDelUsuario';
import { getPaisDeLectura, getPaisDelUsuario, glosarTexto } from '../utils/nombresDelPais';

const leer = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

afterEach(() => setPaisDeLectura(null));

describe('lote 702 — el país de lectura sin la tabla de nombres', () => {
    it('el módulo del estado no importa la tabla ni el glosador', () => {
        const src = leer('utils/paisDelUsuario.js');
        expect(src).not.toMatch(/^\s*import\b/m);
    });

    it('el contexto de arranque fija el país desde el módulo ligero', () => {
        const src = leer('context/AssessmentContext.jsx');
        expect(src).toMatch(/import \{ setPaisDeLectura \} from '\.\.\/utils\/paisDelUsuario';/);
        expect(src).not.toMatch(/from '\.\.\/utils\/nombresDelPais'/);
    });

    it('lo fijado en el módulo ligero lo ve el glosador', () => {
        setPaisDeLectura('es');
        expect(getPaisDeLectura()).toBe('ES');
        expect(glosarTexto('1 guineo mediano')).toBe('1 guineo (plátano) mediano');
    });

    it('un país sin tabla cuenta para los °F pero no para los nombres', () => {
        setPaisDeLectura('US');
        expect(getPaisDeLectura()).toBeNull();
        expect(getPaisDelUsuario()).toBe('US');
        setPaisDeLectura('nada');
        expect(getPaisDelUsuario()).toBeNull();
    });
});
