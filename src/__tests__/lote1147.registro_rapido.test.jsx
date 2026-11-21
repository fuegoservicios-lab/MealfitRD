// [P1-PLAN-LOTE-1147 · 2026-11-21] La hoja «Registrar comida» rehecha: una caja que hace las dos cosas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const contexto = { value: { userProfile: null, planData: null } };
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => contexto.value }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../consent/consentimientoIA', () => ({ faltaPermisoIA: () => false, asegurarConsentimientoIA: async () => true }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import LogMealModal from '../components/dashboard/LogMealModal';
import { fetchWithAuth } from '../config/api';
import { _resetPantryCacheForTests, setCachedMasterList, setCachedDishes } from '../utils/pantryCache';

const FOODS = [
    { id: '11', name: 'Arroz blanco', aliases: [], kcal_per_100g: 130, protein_g_per_100g: 2.7, carbs_g_per_100g: 28, fats_g_per_100g: 0.3,
      portions: [{ unit: 'g', grams_per_qty: 1, label: 'g' }, { unit: 'taza', grams_per_qty: 158, label: 'taza', default: true }] },
];
const FREQ = [{ last_meal_id: 'b', meal_name: 'Arroz con cerdo guisado', kcal: 630, protein: 32, carbs: 80, fats: 18, veces: 2 }];
const resp = (body) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
    _resetPantryCacheForTests();
    setCachedMasterList(FOODS);
    setCachedDishes([]);
    contexto.value = { userProfile: null, planData: null };
    fetchWithAuth.mockReset();
    fetchWithAuth.mockImplementation(async (url) => {
        if (String(url).includes('/foods/frequent')) return resp({ items: FREQ });
        if (String(url).includes('/estimate-plate')) return resp({ name: 'Arroz con pollo', lineas: [{ ref: 'custom', name: 'Pollo guisado', grams: 150, macros: { kcal: 280, protein: 30, carbs: 2, fats: 16 } }] });
        return resp({ items: [] });
    });
});
afterEach(() => vi.useRealTimers());

const aLas = (h) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 21, h, 10)); };

describe('[1147] la comida de la cabecera', () => {
    it('sin plan, a la 1 de la tarde es «Almuerzo · Hoy»', () => {
        aLas(13);
        render(<LogMealModal onClose={vi.fn()} />);
        expect(screen.getByRole('button', { name: /Almuerzo · Hoy/ })).toBeInTheDocument();
    });

    it('con plan sigue «Extra» (adivinar marcaría como comido el almuerzo del plan)', () => {
        aLas(13);
        contexto.value = { userProfile: null, planData: { days: [{ meals: [] }] } };
        render(<LogMealModal onClose={vi.fn()} />);
        expect(screen.getByRole('button', { name: /Extra · Hoy/ })).toBeInTheDocument();
    });
});

describe('[1147] la caja', () => {
    it('una frase ofrece «Calcular todo», que manda lo escrito y llena el plato', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={vi.fn()} />);
        await user.type(screen.getByLabelText('Buscar alimento'), 'arroz');
        expect(screen.queryByRole('button', { name: /Calcular todo/ })).toBeNull();
        await user.type(screen.getByLabelText('Buscar alimento'), ' con pollo');
        await user.click(screen.getByRole('button', { name: /Calcular todo/ }));
        await waitFor(() => expect(screen.getByRole('list', { name: 'Tu plato' })).toBeInTheDocument());
        const llamada = fetchWithAuth.mock.calls.find((c) => String(c[0]).includes('/estimate-plate'));
        expect(JSON.parse(llamada[1].body).text).toBe('arroz con pollo');
        expect(screen.getByLabelText('Buscar alimento')).toHaveValue('');
    });

    it('un habitual RELLENA el plato y no registra nada', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={vi.fn()} />);
        await user.click(await screen.findByRole('button', { name: /Arroz con cerdo guisado/ }));
        expect(screen.getByRole('list', { name: 'Tu plato' })).toBeInTheDocument();
        expect(fetchWithAuth.mock.calls.some((c) => String(c[0]).includes('/consumed/manual'))).toBe(false);
    });

    it('los − / + mueven la cantidad y el − no baja de su mínimo', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={vi.fn()} />);
        await user.type(screen.getByLabelText('Buscar alimento'), 'arroz');
        await user.click(screen.getByText('Arroz blanco'));
        const cantidad = screen.getByLabelText('Cantidad de Arroz blanco');
        expect(cantidad).toHaveValue('1');
        await user.click(screen.getByRole('button', { name: 'Más Arroz blanco' }));
        expect(cantidad).toHaveValue('1.5');
        for (let k = 0; k < 4; k += 1) await user.click(screen.getByRole('button', { name: 'Menos Arroz blanco' }));
        expect(cantidad).toHaveValue('0.5');
    });
});
