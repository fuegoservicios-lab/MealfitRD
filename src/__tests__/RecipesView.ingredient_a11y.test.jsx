/**
 * [P1-6 · a11y del checklist de ingredientes] El "marcar hecho" por ingrediente
 * era un <div onClick> sin role/aria-checked/tabIndex/teclado → usuarios de
 * teclado no podían togglearlo y los lectores de pantalla no anunciaban el estado
 * marcado. Contrato post-fix: role="checkbox" + aria-checked + tabIndex=0 +
 * Enter/Espacio togglean. Control core de cocina en móvil es-DO.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipesView } from '../components/recipes/RecipesView';

const baseProps = {
    days: [{ globalIdx: 0, label: 'Día 1' }],
    activeDayGlobalIdx: 0,
    onSelectDay: () => {},
    meals: [{ meal: 'Desayuno', name: 'Prueba', cals: 400 }],
    activeMealIndex: 0,
    onSelectMeal: () => {},
    meal: { meal: 'Desayuno', name: 'Prueba', ingredients: ['Huevo', 'Pan integral'] },
    steps: [],
    dayKcal: 400,
    checkedIngredients: {},
    onToggleIngredient: () => {},
    // [P-RECIPES-COOK-REMOVED · 2026-07-12] onCook/isExpanding retirados:
    // la única acción de la vista es onPDF.
    onPDF: () => {},
};

describe('RecipesView · a11y del checklist de ingredientes (P1-6)', () => {
    it('cada ingrediente es un checkbox accesible (role + aria-checked + tabIndex)', () => {
        render(<RecipesView {...baseProps} checkedIngredients={{ 0: true }} />);
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes).toHaveLength(2);
        expect(checkboxes[0]).toHaveAttribute('aria-checked', 'true');
        expect(checkboxes[1]).toHaveAttribute('aria-checked', 'false');
        expect(checkboxes[0]).toHaveAttribute('tabindex', '0');
    });

    it('Enter y Espacio togglean el ingrediente (teclado)', async () => {
        const onToggle = vi.fn();
        const user = userEvent.setup();
        render(<RecipesView {...baseProps} onToggleIngredient={onToggle} />);
        const checkboxes = screen.getAllByRole('checkbox');
        checkboxes[1].focus();
        await user.keyboard('{Enter}');
        expect(onToggle).toHaveBeenCalledWith(1);
        await user.keyboard(' ');
        expect(onToggle).toHaveBeenCalledTimes(2);
    });

    it('el checkbox toma su nombre accesible del ingrediente (lector de pantalla)', () => {
        render(<RecipesView {...baseProps} />);
        expect(screen.getByRole('checkbox', { name: /Huevo/i })).toBeInTheDocument();
    });
});
