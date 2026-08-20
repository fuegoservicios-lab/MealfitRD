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
import { resolverPlanDeUrl, resolverSincronizacionModal } from '../utils/historyDeepLink';

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
        // [P1-HIST-MODAL-ONE-CLICK · 2026-08-20] El helper paso a ser
        // `resolverSincronizacionModal`, que envuelve a `resolverPlanDeUrl` y
        // ademas decide el CIERRE. La intencion del guard no cambia: la decision
        // vive en una funcion probada, no en un `find` suelto dentro del efecto.
        expect(SRC).toMatch(/resolverSincronizacionModal\(/);
    });

    it('ningún cierre deja el parámetro colgado', () => {
        // El bug que esto evita: un cierre que hace `setSelectedPlan(null)` sin
        // limpiar la URL deja el plan en el parámetro, y el efecto lo reabre al
        // instante. Un cierre que no limpia la URL deja de ser un cierre.
        //
        // [P1-HIST-MODAL-ONE-CLICK · 2026-08-20] La formulación cambió con el
        // diseño, y a MÁS estricta. Antes se exigía que todo `setSelectedPlan(null)`
        // estuviera dentro de `_closeDetailModal` (que hacía las dos escrituras).
        // Resultó que esas dos escrituras no caen en el mismo render: quedaba una
        // pasada con la selección limpia y el parámetro puesto, el efecto la leía
        // como «ábrelo», y hacían falta dos clics. Ahora el cierre es UNA sola
        // escritura —quitar el parámetro— y el estado lo cierra el efecto.
        // El invariante fuerte lo enforza
        // `el UNICO setSelectedPlan(null) vive en el efecto de sincronizacion`.
        const i = SRC.indexOf('const _closeDetailModal');
        expect(i).toBeGreaterThan(-1);
        const cuerpo = SRC.slice(i, SRC.indexOf('const _closeRestoreConfirm'));
        expect(cuerpo, 'el cierre canónico ya no limpia la URL').toMatch(/_quitarPlanDeUrl/);
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

/* [P1-HIST-MODAL-ONE-CLICK · 2026-08-20] Hacia falta darle DOS veces a la X.
 *
 * EL BUG. `_closeDetailModal` hacia dos escrituras: `setSelectedPlan(null)` y
 * `setSearchParams(...)`. No caen en el mismo render -- medido con una sonda:
 *
 *   1. {selected: null,  planUrl: 'aaa'}   <- se limpia la seleccion...
 *   2. {selected: 'aaa', planUrl: 'aaa'}   <- ...la URL aun no, y el efecto REABRE
 *   3. {selected: 'aaa', planUrl: null}    <- la URL se limpia tarde; ya hay seleccion
 *
 * El segundo clic si cerraba porque para entonces la URL ya estaba limpia. Es
 * exactamente el modo de fallo que el comentario del P-fix original anticipaba
 * ("sin esto el efecto lo reabriria al instante"): la mitigacion existia, pero
 * dependia de que las dos escrituras cayeran juntas, y no caen.
 *
 * EL ARREGLO: UN SOLO ESCRITOR. La X (y el overlay, y ESC, y el borrado) solo
 * quitan el plan de la URL. Quien cierra el estado es el efecto de sincronizacion.
 * Asi el cierre por boton y el cierre por "Atras" recorren el MISMO camino --
 * que ademas arregla el Atras, porque no habia ningun camino que cerrara al
 * perder el parametro: el unico efecto que miraba la URL solo sabia ABRIR.
 *
 * HONESTIDAD SOBRE ESTOS TESTS: los unitarios del helper NO habrian cazado el
 * bug original -- el helper siempre estuvo bien; lo que fallaba era el ACOPLE
 * (dos escrituras, dos renders). Lo que protege contra la recaida es el guard
 * parser-based de abajo: si `_closeDetailModal` vuelve a tocar el estado, rojo.
 */
describe('[P1-HIST-MODAL-ONE-CLICK] un clic cierra, y la URL manda', () => {
    const SRC = fs.readFileSync(path.resolve(__dirname, '../pages/History.jsx'), 'utf8')
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

    it('el cierre NO toca el estado: solo quita el parametro', () => {
        const i = SRC.indexOf('const _closeDetailModal');
        expect(i).toBeGreaterThan(-1);
        const cuerpo = SRC.slice(i, SRC.indexOf('const _closeRestoreConfirm'));
        expect(cuerpo).toMatch(/_quitarPlanDeUrl/);
        expect(cuerpo,
            'volvio la doble escritura: setSelectedPlan(null) aqui reabre el modal '
            + 'en el render intermedio y hacen falta dos clics')
            .not.toMatch(/setSelectedPlan/);
    });

    it('el UNICO setSelectedPlan(null) vive en el efecto de sincronizacion', () => {
        // Reexpresa (y refuerza) el guard del diseno anterior: antes se exigia
        // que todo cierre pasara por `_closeDetailModal`; ahora se exige que
        // NINGUN handler cierre el estado -- solo el efecto, que reacciona a la
        // URL. Un handler que lo haga reintroduce la carrera.
        const sueltos = [...SRC.matchAll(/setSelectedPlan\(null\)/g)];
        expect(sueltos.length, 'deberia haber exactamente uno').toBe(1);
        const sync = SRC.indexOf('resolverSincronizacionModal(');
        expect(sync).toBeGreaterThan(-1);
        expect(Math.abs(sueltos[0].index - sync) < 400,
            'el cierre del estado salio del efecto de sincronizacion').toBe(true);
    });

    it('la sincronizacion pasa por el helper, no por un if suelto', () => {
        expect(SRC).toMatch(/resolverSincronizacionModal\(/);
    });
});

describe('[P1-HIST-MODAL-ONE-CLICK] decisiones de resolverSincronizacionModal', () => {
    const P = [{ id: 'aaa-111' }, { id: 'bbb-222' }];

    it('sin modal abierto delega en resolverPlanDeUrl', () => {
        expect(resolverSincronizacionModal('aaa-111', null, P, true).accion).toBe('abrir');
        expect(resolverSincronizacionModal(null, null, P, true).accion).toBe('nada');
        expect(resolverSincronizacionModal('zzz', null, [], false).accion).toBe('esperar');
    });

    it('con modal abierto y la URL sin plan, CIERRA (la X y el boton Atras)', () => {
        expect(resolverSincronizacionModal(null, P[0], P, true).accion).toBe('cerrar');
    });

    it('con modal abierto y el MISMO plan en la URL, no hace nada', () => {
        expect(resolverSincronizacionModal('aaa-111', P[0], P, true).accion).toBe('nada');
    });

    it('con modal abierto y OTRO plan en la URL, cambia al de la URL', () => {
        // Atras entre dos detalles. Antes se ignoraba (`if (selectedPlan) return`)
        // y el modal seguia mostrando el plan viejo con la URL apuntando a otro.
        const r = resolverSincronizacionModal('bbb-222', P[0], P, true);
        expect(r.accion).toBe('abrir');
        expect(r.plan).toBe(P[1]);
    });

    it('compara por valor: un id numerico no dispara un cambio fantasma', () => {
        const num = [{ id: 7 }];
        expect(resolverSincronizacionModal('7', num[0], num, true).accion).toBe('nada');
    });

    it('si la URL apunta a un plan que aun no esta en la lista, espera', () => {
        // No cerrar ni cambiar por una ausencia de datos: misma leccion que
        // `resolverPlanDeUrl` con la lista a medio cargar.
        expect(resolverSincronizacionModal('zzz', P[0], P, false).accion).toBe('nada');
    });
});
