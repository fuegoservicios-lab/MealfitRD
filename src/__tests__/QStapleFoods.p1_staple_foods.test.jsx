// [P1-STAPLE-FOODS · 2026-08-02] "Mis básicos" — paso OPCIONAL/skippeable del wizard. Cubre:
//   1. El NextButton NUNCA se deshabilita (a diferencia de QDislikes/QAllergies) — cero
//      selección es un estado válido.
//   2. Elegir un resultado del catálogo llama `updateData('stapleFoods', [...])` con el nombre
//      agregado.
//   3. Quitar un básico ya elegido llama `updateData` con el array sin ese ítem.
//   4. Tope de 8: con 8 ya elegidos, el buscador se deshabilita (no se puede agregar un 9º).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import { QStapleFoods } from '../components/assessment/questions/QStapleFoods';
import { fetchWithAuth } from '../config/api';
import { _resetPantryCacheForTests, setCachedMasterList } from '../utils/pantryCache';

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
}));

const CATALOG = [
    { id: 'p1', name: 'Pollo' },
    { id: 'p2', name: 'Pescado' },
    { id: 'h1', name: 'Huevos' },
    { id: 'a1', name: 'Arroz' },
];

describe('QStapleFoods — Mis básicos (P1-STAPLE-FOODS)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetPantryCacheForTests();
        setCachedMasterList(CATALOG);
    });

    it('NextButton nunca se deshabilita — el paso es opcional', () => {
        const updateData = vi.fn();
        render(<QStapleFoods onManualAdvance={vi.fn()} />, {
            customContext: { formData: { stapleFoods: [] }, updateData },
        });
        const btn = screen.getByRole('button', { name: /Siguiente/i });
        expect(btn).not.toBeDisabled();
    });

    it('seleccionar un resultado del catálogo agrega el básico vía updateData', async () => {
        const user = userEvent.setup();
        const updateData = vi.fn();
        render(<QStapleFoods onManualAdvance={vi.fn()} />, {
            customContext: { formData: { stapleFoods: [] }, updateData },
        });
        const input = screen.getByPlaceholderText(/Busca un alimento/i);
        await user.type(input, 'poll');
        const option = await screen.findByRole('option', { name: 'Pollo' });
        await user.click(option);
        expect(updateData).toHaveBeenCalledWith('stapleFoods', ['Pollo']);
    });

    it('no ofrece como resultado un alimento YA elegido', async () => {
        const user = userEvent.setup();
        render(<QStapleFoods onManualAdvance={vi.fn()} />, {
            customContext: { formData: { stapleFoods: ['Pollo'] }, updateData: vi.fn() },
        });
        const input = screen.getByPlaceholderText(/Busca un alimento/i);
        await user.type(input, 'poll');
        await waitFor(() => {
            expect(screen.queryByRole('option', { name: 'Pollo' })).not.toBeInTheDocument();
        });
    });

    it('quitar un básico ya elegido llama updateData sin ese ítem', async () => {
        const user = userEvent.setup();
        const updateData = vi.fn();
        render(<QStapleFoods onManualAdvance={vi.fn()} />, {
            customContext: { formData: { stapleFoods: ['Pollo', 'Huevos'] }, updateData },
        });
        const removeBtn = screen.getByRole('button', { name: /Quitar Pollo de tus básicos/i });
        await user.click(removeBtn);
        expect(updateData).toHaveBeenCalledWith('stapleFoods', ['Huevos']);
    });

    it('tope de 8: el buscador se deshabilita y no se puede agregar un 9º', () => {
        const eight = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        render(<QStapleFoods onManualAdvance={vi.fn()} />, {
            customContext: { formData: { stapleFoods: eight }, updateData: vi.fn() },
        });
        const input = screen.getByPlaceholderText(/Máximo 8 básicos/i);
        expect(input).toBeDisabled();
        expect(screen.getByText('8/8')).toBeInTheDocument();
    });
});
