/**
 * [P1-AGENT-MENU-SSOT · 2026-08-14] El menú de los 3 puntos del Agente sale de la
 * SSOT de navegación, no de un array escrito a mano.
 *
 * EL BUG. `AgentPage.jsx` llevaba su propia lista literal de destinos, con «Plan»
 * y «Recetas» fijos. En modo contador eso ofrece dos salidas que la nav real
 * oculta a propósito (`navItemsFor`, config/dashboardNav.js):
 *
 *   · «Recetas» no existe en contador — mientras el contador manda, las recetas
 *     viven en el Historial.
 *   · «Plan» se rotula «Hoy», porque tocar «Plan» y aterrizar en un diario es una
 *     promesa incumplida.
 *
 * En el teléfono ese menú ES la navegación del Agente, así que la contradicción no
 * era decorativa: era la vía por la que un usuario del contador entraba a
 * `/dashboard/recipes`, una ruta que además no tiene guard de modo propio (solo
 * `ProtectedRoute`), o sea que carga igual.
 *
 * Es el mismo pecado que el resto de la auditoría, en su forma más literal: una
 * copia a mano de una decisión que ya tenía dueño. Por eso el arreglo no es
 * añadirle un `if` al array — es borrarlo y consumir la SSOT.
 *
 * LO QUE LA SSOT NO CUBRE, y se añade aquí a propósito:
 *   · Se quita «Agente»: es la página en la que ya estás.
 *   · Se añade «Configuración» con `asDialog`, la única entrada que no cambia de
 *     página (P1-SETTINGS-DIALOG: se abre como ventana para que la conversación
 *     siga detrás y no se desmonte).
 */
import { describe, it, expect } from 'vitest';
import { menuItemsDelAgente } from '../pages/AgentPage';

const etiquetas = (items) => items.map((i) => i.label);
const rutas = (items) => items.map((i) => i.path);

describe('[P1-AGENT-MENU-SSOT] el menú respeta el modo', () => {
    it('en modo contador NO ofrece Recetas', () => {
        expect(rutas(menuItemsDelAgente(true))).not.toContain('/dashboard/recipes');
        expect(etiquetas(menuItemsDelAgente(true))).not.toContain('Recetas');
    });

    it('en modo contador «Plan» se llama «Hoy»', () => {
        const inicio = menuItemsDelAgente(true).find((i) => i.path === '/dashboard');
        expect(inicio?.label).toBe('Hoy');
    });

    it('con el plan activo conserva Recetas y el rótulo «Plan»', () => {
        const items = menuItemsDelAgente(false);
        expect(rutas(items)).toContain('/dashboard/recipes');
        expect(items.find((i) => i.path === '/dashboard')?.label).toBe('Plan');
    });
});

describe('[P1-AGENT-MENU-SSOT] lo que la SSOT no decide', () => {
    it('no se ofrece «Agente»: es la página en la que ya estás', () => {
        for (const modo of [true, false]) {
            expect(rutas(menuItemsDelAgente(modo))).not.toContain('/dashboard/agent');
        }
    });

    it('Configuración está en los dos modos y abre como ventana', () => {
        for (const modo of [true, false]) {
            const cfg = menuItemsDelAgente(modo).find((i) => i.path === '/dashboard/settings');
            expect(cfg).toBeTruthy();
            expect(cfg.asDialog).toBe(true);
        }
    });

    it('cada entrada trae icono: el menú se pinta, no solo se enumera', () => {
        for (const item of menuItemsDelAgente(true)) {
            expect(item.icon).toBeTruthy();
        }
    });

    it('la Nevera y el Historial siguen ahí en contador (son sus pantallas)', () => {
        const r = rutas(menuItemsDelAgente(true));
        expect(r).toContain('/dashboard/pantry');
        expect(r).toContain('/history');
    });
});
