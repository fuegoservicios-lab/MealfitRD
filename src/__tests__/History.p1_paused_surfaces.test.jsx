/**
 * [P1-HIST-PAUSED-SURFACES · 2026-08-14] Las tres superficies del Historial que
 * seguían tratando un plan pausado como un plan roto, o inexistente.
 *
 * La insignia ya se arregló esta mañana (P1-HIST-PAUSED-BADGE). La auditoría del
 * modo contador encontró que el panel estaba bien y el resto de la pantalla no:
 *
 *   H8 · EL MODAL grita «Acción requerida» en rojo sobre el plan pausado y ofrece
 *        «reactívalo o regenéralo para que el sistema retome la generación». No
 *        hay nada que retomar: la pausa canceló la cola a propósito, y esos
 *        chunks `pending_user_action` son su RESULTADO, no una avería. Acusar al
 *        usuario de que su plan está roto cuando él mismo lo apagó es la peor
 *        versión de esta clase de bug.
 *
 *   H9 · EL ESTADO VACÍO ofrece «Crear mi primer plan» y manda al wizard, que en
 *        modo contador es la rama corta — el usuario aterriza en su último paso,
 *        no en un formulario de plan. La acción correcta es la que ya existe:
 *        encender el plan (`updateData('appMode','plan')`).
 *
 *   H10 · BORRAR el plan pausado lo quita de la lista pero deja `planData` vivo
 *         en el contexto, así que el contador sigue ofreciendo «Reanudar… retoma
 *         exactamente donde quedó» sobre un plan que ya no existe. Reanudar ahí
 *         es una promesa que la DB no puede cumplir.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/History.jsx'), 'utf-8');
/** Sin comentarios: la prosa que EXPLICA un guard no es el guard. */
const CODIGO = SRC.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('[P1-HIST-PAUSED-SURFACES] H8 · el modal no acusa de avería a un plan apagado', () => {
    it('el bloque de «acción requerida» sale temprano si el plan está pausado', () => {
        // El guard tiene que estar ANTES de que se calcule el título rojo: uno
        // que corra después ya pintó el banner.
        // Se ancla al INICIO del bloque (`_pd`), no a `_actionReq`: el guard debe
        // poder estar incluso antes de que se lea `_user_action_required`.
        const iInicio = CODIGO.indexOf('const _pd = selectedPlan.plan_data || {}');
        const iTitulo = CODIGO.indexOf("'Acción requerida'", iInicio);
        const iGuard = CODIGO.indexOf('paused_by_user', iInicio);
        expect(iInicio).toBeGreaterThan(-1);
        expect(iTitulo).toBeGreaterThan(-1);
        expect(iGuard).toBeGreaterThan(-1);
        expect(iGuard).toBeLessThan(iTitulo);
    });

    it('no le ofrece «retomar la generación» a un plan en pausa', () => {
        // La frase del queue-drift sigue existiendo para planes DE VERDAD rotos;
        // lo que no puede es alcanzarse con el plan pausado. Se comprueba que el
        // guard precede al copy.
        const iGuard = CODIGO.indexOf('paused_by_user');
        const iCopy = CODIGO.indexOf('retome la generación');
        if (iCopy > -1) expect(iGuard).toBeLessThan(iCopy);
    });
});

describe('[P1-HIST-PAUSED-SURFACES] H9 · el estado vacío ofrece la puerta correcta', () => {
    it('en modo contador no manda al wizard con «Crear mi primer plan»', () => {
        // El literal puede seguir existiendo para el modo plan, pero tiene que
        // estar bajo una rama de modo.
        expect(CODIGO).toMatch(/isTrackingMode|enModoContador/);
        const iVacio = CODIGO.indexOf('Crear mi primer plan');
        if (iVacio > -1) {
            const ventana = CODIGO.slice(Math.max(0, iVacio - 1200), iVacio);
            expect(ventana).toMatch(/enModoContador|isTrackingMode/);
        }
    });

    it('ofrece encender el plan, que es la acción que sí existe', () => {
        expect(CODIGO).toMatch(/appMode['"]?\s*,\s*['"]plan['"]|Encender el plan/);
    });
});

describe('[P1-HIST-PAUSED-SURFACES] H10 · borrar el plan cargado limpia el contexto', () => {
    it('handleDeleteConfirm limpia planData cuando borra el plan activo', () => {
        const i = CODIGO.indexOf('const handleDeleteConfirm');
        expect(i).toBeGreaterThan(-1);
        const cuerpo = CODIGO.slice(i, i + 3000);
        expect(cuerpo).toMatch(/setPlanData\(\s*null\s*\)/);
    });

    it('solo lo limpia si el borrado ES el plan cargado', () => {
        // Limpiar SIEMPRE tiraría el plan del contexto al borrar cualquier plan
        // viejo del historial — y con él la puerta de «Reanudar» de un plan que
        // sigue perfectamente vivo.
        const i = CODIGO.indexOf('const handleDeleteConfirm');
        const cuerpo = CODIGO.slice(i, i + 3000);
        const iLimpieza = cuerpo.search(/setPlanData\(\s*null\s*\)/);
        const ventana = cuerpo.slice(Math.max(0, iLimpieza - 600), iLimpieza);
        expect(ventana).toMatch(/planData\?\.id|currentPlanId|planData\.id/);
    });
});
