/* [P1-HIST-MODAL-DEEPLINK · 2026-08-14] El detalle del Historial sobrevive al
 * refresh porque vive en la URL.
 *
 * «Cuando refresco la página con esto abierto se me quita, y no debería».
 * El modal era estado local y un refresh lo borra por definición. Con
 * `?plan=<id>` en la URL, recargar lo reabre — y de regalo el botón Atrás lo
 * cierra (lo que uno espera de un modal) y el enlace se puede compartir.
 *
 * El caso que justifica que la decisión sea un helper y no un `find` suelto:
 * mientras la lista carga, `plans` está vacío, pero eso NO significa que el
 * plan no exista — significa que todavía no se sabe. Concluir «no existe» ahí
 * borraría el parámetro y mataría la restauración justo en el refresh que la
 * motivó. Misma clase de error que el aviso de la Nevera de esta semana: una
 * ausencia de datos leída como un dato.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolverPlanDeUrl } from '../utils/historyDeepLink';

const PLANES = [{ id: 'aaa-111' }, { id: 'bbb-222' }];

describe('[P1-HIST-MODAL-DEEPLINK] qué hacer al llegar con ?plan=', () => {
    it('sin parámetro no hace nada', () => {
        expect(resolverPlanDeUrl(null, PLANES, true)).toEqual({ accion: 'nada' });
        expect(resolverPlanDeUrl('', PLANES, true)).toEqual({ accion: 'nada' });
    });

    it('con el plan en la lista, lo abre', () => {
        const r = resolverPlanDeUrl('bbb-222', PLANES, true);
        expect(r.accion).toBe('abrir');
        expect(r.plan).toBe(PLANES[1]);
    });

    it('MIENTRAS la lista carga, espera — no concluye que no existe', () => {
        // El caso del refresh: la URL trae el plan y `plans` aún está vacío.
        // Limpiar aquí sería borrar el parámetro antes de poder usarlo.
        expect(resolverPlanDeUrl('aaa-111', [], false)).toEqual({ accion: 'esperar' });
        expect(resolverPlanDeUrl('aaa-111', undefined, false)).toEqual({ accion: 'esperar' });
    });

    it('con la lista COMPLETA y sin el plan, limpia (borrado o ajeno)', () => {
        expect(resolverPlanDeUrl('zzz-999', PLANES, true)).toEqual({ accion: 'limpiar' });
        expect(resolverPlanDeUrl('zzz-999', [], true)).toEqual({ accion: 'limpiar' });
    });

    it('compara por valor: un id numérico en la URL encuentra su plan', () => {
        expect(resolverPlanDeUrl('7', [{ id: 7 }], true).accion).toBe('abrir');
    });

    it('tolera entradas basura en la lista sin reventar', () => {
        expect(resolverPlanDeUrl('aaa-111', [null, undefined, { id: 'aaa-111' }], true).accion)
            .toBe('abrir');
    });
});

describe('[P1-HIST-MODAL-DEEPLINK] el Historial escribe y limpia el parámetro', () => {
    const SRC = fs.readFileSync(path.resolve(__dirname, '../pages/History.jsx'), 'utf8')
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

    it('abrir el modal deja el plan en la URL', () => {
        const i = SRC.indexOf('const openPlanModal');
        expect(i).toBeGreaterThan(-1);
        expect(SRC.slice(i, i + 500), 'sin esto, el refresh sigue perdiendo el modal')
            .toMatch(/setSearchParams/);
    });

    it('cerrar el modal quita el plan de la URL', () => {
        // Si no se limpia, el efecto de restauración lo reabriría al instante
        // y el modal sería imposible de cerrar.
        const i = SRC.indexOf('_closeDetailModal');
        expect(SRC.slice(i, i + 300)).toMatch(/setSearchParams|_quitarPlanDeUrl/);
    });

    it('la restauración usa el helper, no un find suelto', () => {
        expect(SRC).toMatch(/resolverPlanDeUrl\(/);
    });

    it('TODOS los cierres pasan por el canónico: ninguno deja el parámetro colgado', () => {
        // El bug que esto habría dejado en producción: la X y el overlay
        // cerraban con `setSelectedPlan(null)` directo, así que la URL
        // conservaba el plan, el efecto de restauración lo reabría al instante
        // y el modal quedaba IMPOSIBLE de cerrar. Un cierre que no limpia la
        // URL deja de ser un cierre.
        const sueltos = [...SRC.matchAll(/setSelectedPlan\(null\)/g)];
        const permitido = SRC.indexOf('const _closeDetailModal');
        for (const m of sueltos) {
            const cerca = Math.abs(m.index - permitido) < 200;
            expect(cerca,
                `setSelectedPlan(null) fuera del cierre canónico (índice ${m.index}): `
                + 'usa _closeDetailModal o el modal se reabrirá solo').toBe(true);
        }
    });

    it('la apertura desde la URL no reescribe la URL (evita el bucle)', () => {
        // openPlanModal escribe el parámetro; si el efecto de restauración
        // llamara a openPlanModal, volvería a escribirlo en cada pasada. Por eso
        // la apertura "pura" está separada.
        expect(SRC).toMatch(/_abrirPlanEnEstado/);
        const i = SRC.indexOf('const _abrirPlanEnEstado');
        expect(i, 'falta la apertura sin efectos de URL').toBeGreaterThan(-1);
        const cuerpo = SRC.slice(i, SRC.indexOf('const openPlanModal'));
        expect(cuerpo, 'la apertura pura NO debe tocar la URL').not.toMatch(/setSearchParams/);
    });
});
