/**
 * [P3-NEW-1 · 2026-05-10] `getActiveShoppingList` defense-in-depth contra
 * `_shopping_coherence_block` no consumido por el backend.
 *
 * Bug temido (audit 2026-05-10):
 *   Si por bug del contrato `review_plan_node` no popea
 *   `_shopping_coherence_block` antes de devolver el plan al frontend, el
 *   PDF/UI render seguía adelante sin señal de que el plan tenía
 *   divergencias críticas detectadas.
 *
 * Fix:
 *   Antes de devolver la lista, `getActiveShoppingList` chequea si
 *   `planData._shopping_coherence_block` es un array no vacío. Si lo es,
 *   emite `console.warn('[P3-NEW-1/PDF-RENDER]')` con conteo de entries
 *   y CONTINÚA el render (NO degrada UX; backend es SSOT de visibilidad).
 *
 * Cobertura:
 *   1. Render normal (sin flag): no warn, devuelve la lista.
 *   2. Flag presente como array no vacío: emite warn, sigue devolviendo
 *      la lista (no early-return null).
 *   3. Flag presente pero array vacío `[]`: NO warn (cleared).
 *   4. Flag presente pero no-array (string, number): NO warn (defensivo
 *      contra tipos inesperados).
 *   5. planData sin flag: no warn.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getActiveShoppingList } from '../../utils/shoppingHelpers';


describe('[P3-NEW-1] getActiveShoppingList — defense-in-depth contra _shopping_coherence_block', () => {
    let warnSpy;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('no warn cuando planData no trae el flag', () => {
        const planData = {
            aggregated_shopping_list: [{ name: 'Pollo' }],
        };
        const list = getActiveShoppingList(planData, 'weekly');
        expect(list).toEqual([{ name: 'Pollo' }]);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('no warn cuando el flag es array vacío (popeado por review_plan_node)', () => {
        const planData = {
            aggregated_shopping_list: [{ name: 'Arroz' }],
            _shopping_coherence_block: [],
        };
        const list = getActiveShoppingList(planData, 'weekly');
        expect(list).toEqual([{ name: 'Arroz' }]);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('emite warn cuando flag es array no vacío + render continúa', () => {
        const planData = {
            aggregated_shopping_list: [{ name: 'Pollo' }, { name: 'Arroz' }],
            _shopping_coherence_block: [
                { food: 'Pollo', delta_pct: 0.5, magnitude: true },
            ],
        };
        const list = getActiveShoppingList(planData, 'weekly');
        // Render continúa — defensa, no degradación de UX.
        expect(list).toEqual([{ name: 'Pollo' }, { name: 'Arroz' }]);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const msg = warnSpy.mock.calls[0][0];
        expect(msg).toContain('[P3-NEW-1/PDF-RENDER]');
        expect(msg).toContain('Entries: 1');
    });

    it('no warn cuando flag es de tipo no-array (defensa)', () => {
        const planData = {
            aggregated_shopping_list: [{ name: 'Cebolla' }],
            _shopping_coherence_block: 'corrupted_string',
        };
        const list = getActiveShoppingList(planData, 'weekly');
        expect(list).toEqual([{ name: 'Cebolla' }]);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warn refleja conteo de entries (3 divergencias)', () => {
        const planData = {
            aggregated_shopping_list: [{ name: 'Pollo' }],
            _shopping_coherence_block: [
                { food: 'Pollo' },
                { food: 'Arroz' },
                { food: 'Pavo' },
            ],
        };
        getActiveShoppingList(planData, 'weekly');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain('Entries: 3');
    });

    it('prefiere key por duration sobre `aggregated_shopping_list` legacy', () => {
        const planData = {
            aggregated_shopping_list: [{ name: 'legacy' }],
            aggregated_shopping_list_weekly: [{ name: 'weekly' }],
        };
        const list = getActiveShoppingList(planData, 'weekly');
        expect(list).toEqual([{ name: 'weekly' }]);
    });
});
