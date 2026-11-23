// [P1-PLAN-LOTE-1171 · 2026-11-23] Un usuario registró a las 5:30 p. m. su día de ayer entero y quedaron cuatro
// «meriendas»: la comida «por la hora» solo vale para HOY. Para otro día, la elige él antes de guardar.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LogMealModal from '../components/dashboard/LogMealModal';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import { _resetPantryCacheForTests, setCachedMasterList, setCachedDishes } from '../utils/pantryCache';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const FOODS = [
    { id: '11', name: 'Arroz blanco', aliases: [], kcal_per_100g: 358.6, protein_g_per_100g: 7, carbs_g_per_100g: 80.3, fats_g_per_100g: 1,
      portions: [{ unit: 'g', grams_per_qty: 1, label: 'g' }, { unit: 'taza', grams_per_qty: 185, label: 'taza', default: true }] },
];
const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });

describe('[1171] la comida de otro día no se adivina por la hora', () => {
    beforeEach(() => {
        _resetPantryCacheForTests();
        setCachedMasterList(FOODS);
        setCachedDishes([]);
        fetchWithAuth.mockReset();
        fetchWithAuth.mockImplementation(async () => respuesta({ items: [] }));
        toast.info.mockReset();
    });

    it('elegir «Ayer» sin comida: no guarda hasta elegirla, y luego manda la elegida', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 21, 17, 35));   // 5:35 p. m.: la hora diría «merienda»
        const user = userEvent.setup();
        render(<LogMealModal onClose={vi.fn()} />);
        vi.useRealTimers();
        await user.click(screen.getByRole('button', { name: /Cambiar/ }));
        await user.click(screen.getByRole('button', { name: 'Ayer' }));
        expect(screen.getByRole('button', { name: /Elige la comida · Ayer/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Merienda' })).toHaveAttribute('aria-pressed', 'false');
        await user.type(screen.getByLabelText('Buscar alimento'), 'arroz');
        await user.click(screen.getByText('Arroz blanco'));
        await user.click(screen.getByRole('button', { name: 'Registrar' }));
        expect(toast.info).toHaveBeenCalledWith('¿Qué comida fue? Elígela antes de guardar.');
        expect(fetchWithAuth.mock.calls.some((c) => c[0] === '/api/diary/consumed/manual')).toBe(false);

        await user.click(screen.getByRole('button', { name: 'Almuerzo' }));
        fetchWithAuth.mockImplementationOnce(async () => respuesta({ success: true, totals: { kcal: 663 } }));
        await user.click(screen.getByRole('button', { name: 'Registrar' }));
        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledWith('/api/diary/consumed/manual', expect.anything()));
        const body = JSON.parse(fetchWithAuth.mock.calls.find((c) => c[0] === '/api/diary/consumed/manual')[1].body);
        expect(body.meal_type).toBe('almuerzo');
        expect(body.days_ago).toBe(1);
    });

    it('si llega con la comida ya dicha (p. ej. desde el día de ayer con «Cena»), no pregunta', () => {
        render(<LogMealModal onClose={vi.fn()} initialMealType="cena" initialDaysAgo={1} />);
        expect(screen.getByRole('button', { name: /Cena · Ayer/ })).toBeInTheDocument();
    });
});
