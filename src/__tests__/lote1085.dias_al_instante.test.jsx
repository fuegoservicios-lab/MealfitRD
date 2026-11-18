// [P1-PLAN-LOTE-1085 · 2026-11-18] El dueño: «hay un poco de delay al cambiar los días y el compartir tarda en salir».
// El cajón guarda los días ya vistos y precarga el anterior y el siguiente: cambiar de día no espera a la red y
// «Compartir» se puede tocar al instante. Cualquier cambio del diario (version) lo olvida todo.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import DiaryHistory from '../components/dashboard/DiaryHistory';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../components/dashboard/ScanMealModal', () => ({ default: () => null }));
vi.mock('../utils/confirmToast', () => ({ confirmToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('framer-motion', async () => {
    const React = await import('react');
    const strip = (props) => {
        const out = { ...props };
        ['initial', 'animate', 'exit', 'transition', 'whileTap', 'whileHover', 'layout'].forEach((k) => delete out[k]);
        return out;
    };
    const tag = (T) => React.forwardRef((props, ref) => React.createElement(T, { ...strip(props), ref }));
    return {
        motion: { div: tag('div'), aside: tag('aside'), span: tag('span'), button: tag('button') },
        AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
    };
});

vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
{ const t = new Date(); t.setHours(14, 0, 0, 0); vi.setSystemTime(t); }

const iso = (desfase) => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + desfase);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });
const diaCon = (nombre) => ({
    meals: [{ id: nombre, meal_name: nombre, meal_type: 'almuerzo', calories: 500, protein: 20, carbs: 60, healthy_fats: 15, consumed_at: new Date().toISOString(), created_at: new Date().toISOString() }],
    totals: { calories: 500, protein: 20, carbs: 60, healthy_fats: 15 },
});
const NOMBRES = { [iso(0)]: 'Plato de hoy', [iso(-1)]: 'Plato de ayer', [iso(-2)]: 'Plato de antier' };

beforeEach(() => {
    fetchWithAuth.mockReset();
    fetchWithAuth.mockImplementation(async (url) => {
        const u = String(url);
        if (u.startsWith('/api/diary/consumed-range/')) return respuesta({ days: [] });
        const m = u.match(/date=(\d{4}-\d{2}-\d{2})/);
        if (u.startsWith('/api/diary/consumed/') && m) return respuesta(diaCon(NOMBRES[m[1]] || 'Otro plato'));
        return respuesta({});
    });
});

const pedidosDe = (d) => fetchWithAuth.mock.calls.filter(([u]) => String(u).includes(`?date=${d}&`)).length;

describe('[1085] los días al instante', () => {
    it('precarga ayer (no mañana, que no llega) y al pasar a ayer no lo vuelve a pedir', async () => {
        render(<DiaryHistory userId="u1" open onClose={() => {}} targetCalories={2000} />);
        await screen.findByText('Plato de hoy');
        await waitFor(() => expect(pedidosDe(iso(-1))).toBe(1));
        expect(pedidosDe(iso(1))).toBe(0);
        await act(async () => { await Promise.resolve(); });
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        expect(await screen.findByText('Plato de ayer')).toBeInTheDocument();
        expect(pedidosDe(iso(-1))).toBe(1);
        // y desde ayer, se precarga antier
        await waitFor(() => expect(pedidosDe(iso(-2))).toBe(1));
        // volver a hoy: ya visto, sin pedir otra vez
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(await screen.findByText('Plato de hoy')).toBeInTheDocument();
        expect(pedidosDe(iso(0))).toBe(1);
    });

    it('un cambio del diario lo olvida todo: el día se vuelve a pedir', async () => {
        render(<DiaryHistory userId="u1" open onClose={() => {}} targetCalories={2000} />);
        await screen.findByText('Plato de hoy');
        expect(pedidosDe(iso(0))).toBe(1);
        act(() => { window.dispatchEvent(new CustomEvent('mealfit:diary-changed', { detail: { source: 'tracking-progress' } })); });
        await waitFor(() => expect(pedidosDe(iso(0))).toBe(2));
    });
});
