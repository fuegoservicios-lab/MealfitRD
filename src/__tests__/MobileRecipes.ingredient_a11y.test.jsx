/**
 * [P1-6 · a11y del checklist de ingredientes — móvil] Espejo del contrato de
 * RecipesView para MobileRecipes: role="checkbox" + aria-checked + Enter/Espacio.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileRecipes } from '../components/recipes/MobileRecipes';

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
    onCook: () => {},
    onPDF: () => {},
    isExpanding: false,
};

describe('MobileRecipes · a11y del checklist de ingredientes (P1-6)', () => {
    it('ingredientes son checkboxes accesibles con aria-checked', () => {
        render(<MobileRecipes {...baseProps} checkedIngredients={{ 1: true }} />);
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes).toHaveLength(2);
        expect(checkboxes[1]).toHaveAttribute('aria-checked', 'true');
        expect(checkboxes[0]).toHaveAttribute('tabindex', '0');
    });

    it('Espacio togglea el ingrediente (teclado)', async () => {
        const onToggle = vi.fn();
        const user = userEvent.setup();
        render(<MobileRecipes {...baseProps} onToggleIngredient={onToggle} />);
        const checkboxes = screen.getAllByRole('checkbox');
        checkboxes[0].focus();
        await user.keyboard(' ');
        expect(onToggle).toHaveBeenCalledWith(0);
    });
});
