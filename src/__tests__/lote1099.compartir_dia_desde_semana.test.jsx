// [P1-PLAN-LOTE-1099 · 2026-11-18] «¿Cómo puedo compartir el día anterior?»: en «Tu semana», al tocar un día con
// registros, «Compartir este día» pide ESE día (como el Diario) y abre la hoja de compartir con su fecha.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('../components/dashboard/ShareDaySheet', () => ({
    default: ({ diario, fecha }) => (
        <div role="dialog" aria-label="hoja de compartir">{`${diario.meals.length} comidas · ${fecha.getDate()}`}</div>
    ),
}));

import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import SemanaEnProgreso from '../components/dashboard/SemanaEnProgreso';

const fila = (date, calories, extra = {}) => ({ date, calories, protein: 100, carbs: 200, healthy_fats: 60, meals_count: 3, ...extra });
const ok = (body) => ({ ok: true, json: async () => body });

describe('[1099] compartir un día desde «Tu semana»', () => {
    beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 18, 15, 0, 0)); });
    afterAll(() => { vi.useRealTimers(); });
    beforeEach(() => {
        window.localStorage.clear();
        fetchWithAuth.mockReset();
        fetchWithAuth.mockImplementation(async (url) => (url.includes('consumed-range')
            ? ok({ days: [fila('2026-11-17', 2000, { target_calories: 2000 })] })
            : ok({ meals: [{ id: 'a' }, { id: 'b' }], totals: { calories: 2000 } })));
    });
    const montar = () => render(<SemanaEnProgreso userId="u-1" hoy={{ calories: 0, mealsCount: 0 }} targetCalories={2000} targetMacros={{ protein: 150, carbs: 200, fats: 60 }} />);
    const dias = () => screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));

    it('pide ESE día y abre la hoja con sus comidas y su fecha', async () => {
        montar();
        await waitFor(() => expect(screen.getByText('1 de 7 días en meta')).toBeInTheDocument());
        fireEvent.click(dias()[2]);                                          // martes 17
        fireEvent.click(await screen.findByRole('button', { name: /Compartir este día/ }));
        expect(await screen.findByRole('dialog', { name: 'hoja de compartir' })).toHaveTextContent('2 comidas · 17');
        expect(fetchWithAuth).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/diary\/consumed\/u-1\?date=2026-11-17&tzOffset=/));
    });

    it('un día sin comidas no ofrece compartir; si el día no llega, avisa', async () => {
        montar();
        await waitFor(() => expect(screen.getByText('1 de 7 días en meta')).toBeInTheDocument());
        fireEvent.click(dias()[0]);                                          // domingo 15, vacío
        await screen.findByText('Ese día no anotaste comidas.');
        expect(screen.queryByRole('button', { name: /Compartir este día/ })).toBeNull();

        fetchWithAuth.mockImplementation(async () => ({ ok: false, json: async () => ({}) }));
        fireEvent.click(dias()[2]);
        fireEvent.click(await screen.findByRole('button', { name: /Compartir este día/ }));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(screen.queryByRole('dialog', { name: 'hoja de compartir' })).toBeNull();
    });
});
