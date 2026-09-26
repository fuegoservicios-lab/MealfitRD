// [P1-PLAN-LOTE-348 · 2026-09-26] «¿Qué comiste?» para armar un plato desde cero.
//
// El dueño: «nadie pudiera crear un plato desde cero… si no le tiró foto y no quiere escribirle al coach». El
// componedor ya juntaba varios alimentos, pero no se veía: la pantalla solo enseñaba el buscador y «lo que más
// registras». Ahora: tres formas de empezar a la vista, «Descríbelo y lo calculo» (el texto separado en partes
// editables por `/consumed/estimate-plate`) y las líneas estimadas o a mano se pueden EDITAR.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import LogMealModal from '../components/dashboard/LogMealModal';
import { fetchWithAuth } from '../config/api';
import { _resetPantryCacheForTests, setCachedMasterList, setCachedDishes } from '../utils/pantryCache';
import { lineasDelPlatoDescrito } from '../utils/platoDescrito';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const MORO = { slug: 'moro', label: 'Moro de habichuelas', finished_g: 230, per_100g: { kcal: 172.6, protein: 5, carbs: 30, fats: 3.5 } };
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const API = {
    name: 'Moro con pollo guisado',
    estimated: true,
    lineas: [
        { ref: 'dish:moro', qty: 230, unit: 'g', name: 'Moro de habichuelas', grams: 230, macros: { kcal: 397, protein: 11.5, carbs: 69, fats: 8 }, estimated: false },
        { ref: 'custom', name: 'Pollo guisado', grams: 150, macros: { kcal: 260, protein: 30, carbs: 4, fats: 12 }, estimated: true },
    ],
};

beforeEach(() => {
    _resetPantryCacheForTests();
    setCachedMasterList([]);
    setCachedDishes([MORO]);
    fetchWithAuth.mockReset();
    fetchWithAuth.mockImplementation(async (url) => {
        if (String(url).includes('/consumed/estimate-plate')) return respuesta(API);
        return respuesta({ items: [] });
    });
});

describe('[348] de la respuesta del servidor a las líneas del plato', () => {
    it('un plato del catálogo entra como plato (en gramos); lo demás como estimado, con sus gramos', () => {
        const [moro, pollo] = lineasDelPlatoDescrito(API.lineas, [MORO]);
        expect(moro).toMatchObject({ ref: 'dish:moro', unit: 'g', qty: 230 });
        expect(moro.entry).toMatchObject({ kind: 'dish', label: 'Moro de habichuelas', item: MORO });
        expect(pollo).toMatchObject({ ref: 'custom', name: 'Pollo guisado', estimated: true, grams: 150 });
        expect(pollo.macros.kcal).toBe(260);
    });

    it('un plato que el cliente no conoce (catálogo viejo) entra como estimado con las macros del servidor', () => {
        const [moro] = lineasDelPlatoDescrito(API.lineas, []);
        expect(moro).toMatchObject({ ref: 'custom', name: 'Moro de habichuelas', estimated: true });
        expect(moro.macros.kcal).toBe(397);
    });
});

describe('[348] la hoja', () => {
    it('ofrece las tres formas de empezar a la vista', () => {
        render(<LogMealModal onClose={() => {}} />);
        expect(screen.getByLabelText('Buscar alimento')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Descríbelo y lo calculo/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Macros a mano/ })).toBeTruthy();
    });

    it('«Descríbelo y lo calculo»: el texto vuelve separado en partes, y el nombre del plato se propone', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={() => {}} />);
        await user.click(screen.getByRole('button', { name: /Descríbelo y lo calculo/ }));
        await user.type(screen.getByLabelText('Describe lo que comiste'), 'moro con pollo guisado');
        await user.click(screen.getByRole('button', { name: 'Calcular mi plato' }));
        await waitFor(() => expect(screen.getByText('Pollo guisado')).toBeTruthy());
        const llamada = fetchWithAuth.mock.calls.find(([u]) => String(u).includes('estimate-plate'));
        expect(JSON.parse(llamada[1].body)).toMatchObject({ text: 'moro con pollo guisado' });
        expect(screen.getByText('Moro de habichuelas')).toBeTruthy();
        expect(screen.getByText('~150 g · 260 kcal · estimado')).toBeTruthy();
        expect(screen.getByLabelText('Nombre de la comida')).toHaveValue('Moro con pollo guisado');
    });

    it('«Macros a mano»: nombre y macros propios; sin nombre no se añade', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={() => {}} />);
        await user.click(screen.getByRole('button', { name: /Macros a mano/ }));
        const anadir = screen.getByRole('button', { name: 'Añadir al plato' });
        expect(anadir.disabled).toBe(true);
        await user.type(screen.getByLabelText('Nombre del alimento'), 'Batida de lechosa');
        await user.clear(screen.getByLabelText(/^Calorías/));
        await user.type(screen.getByLabelText(/^Calorías/), '240');
        await user.click(anadir);
        const plato = screen.getByRole('list', { name: 'Tu plato' });
        expect(within(plato).getByText('Batida de lechosa')).toBeTruthy();
        expect(within(plato).getByText('240 kcal')).toBeTruthy();   // el total del pie también dice 240
    });

    it('una línea estimada o a mano se puede EDITAR después (antes no)', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={() => {}} />);
        await user.click(screen.getByRole('button', { name: /Descríbelo y lo calculo/ }));
        await user.type(screen.getByLabelText('Describe lo que comiste'), 'moro con pollo guisado');
        await user.click(screen.getByRole('button', { name: 'Calcular mi plato' }));
        await waitFor(() => expect(screen.getByText('Pollo guisado')).toBeTruthy());
        await user.click(screen.getByRole('button', { name: 'Editar Pollo guisado' }));
        await user.clear(screen.getByLabelText(/^Calorías/));
        await user.type(screen.getByLabelText(/^Calorías/), '300');
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
        const plato = screen.getByRole('list', { name: 'Tu plato' });
        expect(within(plato).getAllByRole('listitem')).toHaveLength(2);        // se reemplazó, no se duplicó
        expect(screen.getByText('~150 g · 300 kcal · estimado')).toBeTruthy();
    });
});
