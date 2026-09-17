// [P1-PLAN-LOTE-94 · 2026-09-17] Dos defectos de la revisión a fondo del móvil.
//
// 1. El desplegable del tipo de comida cortaba su valor por defecto («Extra (fuera del» a 392px, «Extra (fuel» a 320px):
//    los dos selects se repartían la fila a partes iguales aunque uno pide 185px y el otro 85, y un `<select>` nativo
//    corta sin puntos suspensivos.
// 2. En tema claro, sin tarjeta (lote 88) el texto quedaba sobre la imagen decorativa del dashboard: el subtítulo bajaba
//    a ~4,1:1, por debajo del 4,5:1 de AA. Solo en claro: en oscuro el contraste sobra y el degradado es del dueño.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const plano = (s) => s.split(/\s+/).join(' ');

describe('el componedor no corta el tipo de comida', () => {
    it('la fila deja de repartirse a partes iguales y se apila en pantallas muy estrechas', () => {
        const css = src('src/components/dashboard/LogMealModal.module.css');
        const i = css.indexOf('.selectors {');
        const regla = plano(css.slice(i, css.indexOf('}', i)));
        expect(regla).toContain('display: grid;');
        expect(regla).toContain('grid-template-columns: minmax(0, 1fr) auto;');
        expect(regla).not.toContain('display: flex;');
        expect(plano(css)).toContain('@media (max-width: 380px) { .selectors { grid-template-columns: 1fr; } }');
        // red de seguridad para traducciones largas
        const j = css.indexOf('.select {');
        expect(plano(css.slice(j, css.indexOf('}', j)))).toContain('text-overflow: ellipsis;');
    });
});

describe('el contador no se lee sobre las burbujas en claro', () => {
    it('la página se apoya en el color liso, y solo en tema claro', () => {
        const css = src('src/components/dashboard/DashboardTracking.module.css');
        const i = css.lastIndexOf('@media (max-width: 768px) {');
        expect(i).toBeGreaterThan(-1);
        const bloque = plano(css.slice(i));
        expect(bloque).toContain(':global(html:not([data-theme="dark"])) .page { background: var(--bg-page');
        // en oscuro NO se pinta: el degradado superior es parte de la identidad
        expect(bloque).not.toContain(':global(html[data-theme="dark"]) .page { background');
    });
});
