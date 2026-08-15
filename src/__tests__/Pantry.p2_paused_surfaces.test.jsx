/**
 * [P2-PANTRY-PAUSED-SURFACES · 2026-08-15] Las dos superficies de la Nevera que
 * seguían hablando de un plan apagado.
 *
 * H13 · EL TOOLTIP DEL CHIP DE CADUCIDAD
 *   Cada alimento por vencer lleva `title="Tu plan priorizará este ingrediente"`.
 *   En modo contador no se genera nada: ese ingrediente se va a echar a perder y
 *   ninguna generación lo va a colocar en ningún plato. El chip tiene un hecho
 *   verificable que decir —«Caduca en N días»— y no necesita prestarle autoridad
 *   a un motor apagado. Es la misma disciplina que ya se aplicó al banner ámbar.
 *   Vive DUPLICADO en las dos vistas (:2281 y :2434), así que se arregla en las
 *   dos o no se arregla.
 *
 * H14 · EL RECALC (Y SU TOAST) DE LA LISTA DE COMPRAS
 *   Cada alta, baja o reposición en la Nevera dispara
 *   `POST /api/plans/recalculate-shopping-list` contra el plan PAUSADO, le
 *   reescribe `aggregated_shopping_list` y celebra con «Lista de compras
 *   actualizada 🛒». El usuario del contador ve toasts sobre una lista que su
 *   modo no expone en ninguna pantalla, de un plan que apagó.
 *
 *   Se corta el RECALC entero, no solo el toast: silenciar el aviso dejaría el
 *   efecto (escrituras a `meal_plans` de un plan pausado) sin el aviso, que es
 *   peor — un efecto invisible es más difícil de diagnosticar que uno ruidoso.
 *   Al reanudar, el propio resume recalcula: no se pierde nada.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tooltipCaducidad } from '../pages/pantryLowBannerCopy';

const SRC = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Pantry.jsx'), 'utf-8');
const CODIGO = SRC.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('[P2-PANTRY-PAUSED-SURFACES] H13 · el chip de caducidad', () => {
    it('en modo contador no promete que el plan lo priorizará', () => {
        const t = tooltipCaducidad('Caduca en 2 días', true);
        expect(t).not.toMatch(/plan/i);
        expect(t).not.toMatch(/prioriz/i);
    });

    it('pero sigue diciendo el hecho, que es lo único verificable', () => {
        const t = tooltipCaducidad('Caduca en 2 días', true);
        expect(t).toMatch(/Caduca en 2 días/);
        expect(t.length).toBeGreaterThan(12);
    });

    it('con el plan activo conserva la promesa, que ahí sí se cumple', () => {
        expect(tooltipCaducidad('Caduca en 2 días', false)).toMatch(/prioriz/i);
    });

    it('las DOS vistas usan el helper: la copia estaba duplicada', () => {
        expect(CODIGO).not.toMatch(/Tu plan priorizará este ingrediente/);
        expect((CODIGO.match(/tooltipCaducidad\(/g) || []).length).toBeGreaterThanOrEqual(2);
    });
});

describe('[P2-PANTRY-PAUSED-SURFACES] H14 · el recalc de la lista', () => {
    it('sale temprano en modo contador, antes de tocar la red', () => {
        const i = CODIGO.indexOf('const _recalcShoppingListAfterPantryChange');
        expect(i).toBeGreaterThan(-1);
        const cuerpo = CODIGO.slice(i, i + 2500);
        const iGate = cuerpo.search(/enModoContador|isTrackingMode/);
        const iFetch = cuerpo.search(/recalculate-shopping-list|fetchWithAuth|apiFetch/);
        expect(iGate).toBeGreaterThan(-1);
        if (iFetch > -1) expect(iGate).toBeLessThan(iFetch);
    });

    it('el toast no puede sobrevivir al recalc que lo produce', () => {
        // Si alguien "arregla" esto silenciando solo el toast, el efecto sigue:
        // escrituras a meal_plans de un plan pausado, ahora invisibles.
        const i = CODIGO.indexOf('const _recalcShoppingListAfterPantryChange');
        const cuerpo = CODIGO.slice(i, i + 2500);
        const iGate = cuerpo.search(/enModoContador|isTrackingMode/);
        const iToast = cuerpo.indexOf('Lista de compras actualizada');
        if (iToast > -1) expect(iGate).toBeLessThan(iToast);
    });
});
