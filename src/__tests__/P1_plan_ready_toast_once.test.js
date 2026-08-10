// [P1-PLAN-READY-TOAST-ONCE + P1-TOAST-APP-THEME · 2026-08-10] Dos defectos del mismo
// aviso verde de «Tu plan está listo».
//
// 1. SALÍA EN CADA REFRESCO. `PendingPipelineRecovery` tiene DOS ramas que atienden el
//    estado 'complete'. La que corre dentro de la sesión hace `clearPendingFlag()` Y
//    `ackPendingStatus()`; la que corre AL ARRANCAR solo hacía el acuse al servidor y
//    dejaba la señal LOCAL puesta. La asimetría no se notaba durante la sesión porque
//    un ref (`handledRef`) corta la repetición… pero un ref muere con la página: cada
//    recarga arrancaba de cero, releía la señal que seguía en localStorage y volvía a
//    anunciar un plan que ya estaba listo hacía rato.
//    *Cuando dos ramas atienden el MISMO estado, la diferencia entre ellas es la lista
//    de bugs que te espera.*
//
// 2. SE VEÍA BLANCO SOBRE LA APP OSCURA. El `<Toaster>` iba con `theme="system"`, que
//    sigue el modo del SISTEMA OPERATIVO — no el de la app. Con el iPhone en claro y
//    Bioboros en oscuro, salía una tarjeta blanca brillante. La app ya resuelve esa
//    pregunta en su propio selector de apariencia (que incluye su opción «Sistema»), y
//    contestarla dos veces era el defecto.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LEER = (...p) => fs.readFileSync(path.resolve(__dirname, '..', ...p), 'utf-8');

const REC = LEER('components', 'PendingPipelineRecovery.jsx');
const APP = LEER('App.jsx');

describe('[P1-PLAN-READY-TOAST-ONCE] el aviso no se repite al refrescar', () => {
    it('las dos ramas que atienden «complete» limpian la señal local', () => {
        // Se cuentan las apariciones en vez de mirar una sola: el defecto ERA que una
        // de las dos ramas no lo hacía, así que comprobar solo una lo dejaría pasar.
        const acks = (REC.match(/ackPendingStatus\(\)/g) || []).length;
        const limpias = (REC.match(/clearPendingFlag\(\)/g) || []).length;
        expect(acks, 'no se encontró el acuse al servidor').toBeGreaterThanOrEqual(2);
        expect(
            limpias,
            'hay ramas que acusan al servidor pero dejan la señal local puesta: en el '
            + 'siguiente refresco el aviso vuelve a salir',
        ).toBeGreaterThanOrEqual(acks);
    });

    it('la rama de arranque limpia ANTES de esperar la hidratación', () => {
        // Si el usuario recarga en mitad de ese await, la señal ya no debe estar.
        // Se ancla en el acuse al servidor de la rama de arranque: la limpieza local
        // tiene que ir pegada a él, no después de esperas que el usuario puede cortar
        // recargando.
        const iAck = REC.indexOf('await ackPendingStatus();');
        expect(iAck, 'desapareció el acuse de la rama de arranque').toBeGreaterThan(0);
        const antes = REC.slice(Math.max(0, iAck - 900), iAck);
        expect(
            antes,
            'la rama de arranque debe limpiar la señal local junto al acuse, antes de '
            + 'cualquier await que el usuario pueda interrumpir recargando',
        ).toMatch(/clearPendingFlag\(\)/);
    });
});

describe('[P1-TOAST-APP-THEME] los avisos siguen el tema de la app', () => {
    it('el Toaster no vuelve a preguntarle al sistema operativo', () => {
        // El ELEMENTO, no la primera aparición del texto: `<Toaster/>` se menciona
        // también dentro de un comentario del import, y anclar ahí mide el comentario.
        const m = APP.match(/<Toaster\s*\r?\n/);
        expect(m, 'desapareció el <Toaster> del árbol').toBeTruthy();
        const bloque = APP.slice(m.index, m.index + 500);
        expect(bloque, 'el Toaster volvió a seguir el tema del SO').not.toMatch(/theme="system"/);
        expect(bloque, 'el tema del Toaster debe ser una expresión, no un literal').toMatch(/theme=\{/);
    });

    it('el tema sale del data-theme del documento, que es donde ya está resuelto', () => {
        expect(APP).toMatch(/getAttribute\('data-theme'\)/);
        // El tema cambia en caliente desde Configuración: sin observar el atributo, un
        // aviso lanzado después del cambio se quedaría con el tema del montaje.
        expect(APP, 'falta observar el cambio de tema en caliente').toMatch(/MutationObserver/);
        expect(APP).toMatch(/attributeFilter:\s*\['data-theme'\]/);
    });
});
