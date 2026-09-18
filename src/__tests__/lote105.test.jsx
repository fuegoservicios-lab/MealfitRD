// [P1-PLAN-LOTE-105 · 2026-09-18] Macros y micros en UNA tarjeta, y el diario de días anteriores completo.
//
//  · «Tus macros y micros de hoy»: los micros salen del MISMO fetch del día y el borrado optimista los recalcula;
//  · el cajón de días anteriores: micros de ESE día, las comidas «extra» visibles (antes desaparecían), papelera
//    en cualquier día (avisa a la tarjeta), «Registrar en este día» con el componedor ya en ese día, «+14» días y la
//    media de la semana; se refresca cuando el diario cambia desde fuera;
//  · el componedor añade el chip del día pedido cuando es más atrás que «Antier».
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import TrackingProgress from '../components/dashboard/TrackingProgress';
import DiaryHistory from '../components/dashboard/DiaryHistory';
import LogMealModal from '../components/dashboard/LogMealModal';
import { fetchWithAuth } from '../config/api';
import { confirmToast } from '../utils/confirmToast';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../components/dashboard/ScanMealModal', () => ({ default: () => null }));
vi.mock('../utils/confirmToast', () => ({ confirmToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// framer-motion sin animaciones: lo que se prueba es qué se pinta, no cómo entra
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

const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const METAS = {
    fiber_g: { target: 38, kind: 'floor', unit: 'g' }, sodium_mg: { target: 2000, kind: 'ceiling', unit: 'mg' },
    potassium_mg: { target: 3400, kind: 'floor', unit: 'mg' }, calcium_mg: { target: 1000, kind: 'floor', unit: 'mg' },
    iron_mg: { target: 8, kind: 'floor', unit: 'mg' }, vit_c_mg: { target: 90, kind: 'floor', unit: 'mg' },
    vit_a_mcg: { target: 900, kind: 'floor', unit: 'mcg' }, vit_d_mcg: { target: 15, kind: 'floor', unit: 'mcg' },
};
const hoyISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ahora = () => new Date().toISOString();
const COMIDAS = [
    { id: 'm1', meal_name: 'Mangú con huevo', meal_type: 'desayuno', calories: 500, protein: 20, carbs: 60, healthy_fats: 15,
      consumed_at: ahora(), created_at: ahora(), micros: { values: { fiber_g: 10, sodium_mg: 600, potassium_mg: 900, calcium_mg: 100, iron_mg: 2, vit_c_mg: 30, vit_a_mcg: 50, vit_d_mcg: 1 }, resolved: 2, total: 2 } },
    { id: 'm2', meal_name: 'Galletas', meal_type: 'extra', calories: 200, protein: 3, carbs: 30, healthy_fats: 8,
      consumed_at: ahora(), created_at: ahora(), micros: null },
];
const DIA = {
    meals: COMIDAS,
    totals: { calories: 700, protein: 23, carbs: 90, healthy_fats: 23,
        micros: { fiber_g: 10, sodium_mg: 600, potassium_mg: 900, calcium_mg: 100, iron_mg: 2, vit_c_mg: 30, vit_a_mcg: 50, vit_d_mcg: 1 },
        micros_coverage: { con_datos: 1, total: 2 } },
};

const enrutar = (extra = {}) => vi.fn(async (url, opts) => {
    const u = String(url);
    if (opts?.method === 'DELETE') return respuesta({ success: true });
    if (u.startsWith('/api/diary/consumed-range/')) return respuesta({ days: [{ date: hoyISO(), calories: 700, meals_count: 2 }] });
    if (u.startsWith('/api/diary/consumed/')) return respuesta(extra.dia || DIA);
    if (u.startsWith('/api/diary/foods') || u.startsWith('/api/pantry')) return respuesta({ foods: [], dishes: [], items: [] });
    return respuesta({});
});

beforeEach(() => {
    fetchWithAuth.mockReset();
    confirmToast.mockReset();
    try { window.localStorage.clear(); } catch { /* jsdom */ }
});

describe('la tarjeta fusionada', () => {
    it('pinta los micros del mismo fetch y los recalcula al borrar una comida', async () => {
        fetchWithAuth.mockImplementation(enrutar());
        confirmToast.mockResolvedValue(true);
        render(<TrackingProgress planData={{ calories: 2000, macros: { protein: 150, carbs: 200, fats: 60 } }} userId="u1" microTargets={METAS} />);
        expect(screen.getByText('Tus macros y micros de hoy')).toBeInTheDocument();
        await screen.findByText('Con datos de 1 de 2 comidas');
        const fibra = screen.getByRole('progressbar', { name: 'Fibra' });
        expect(fibra.getAttribute('aria-valuenow')).toBe('10');
        expect(fibra.getAttribute('aria-valuemax')).toBe('38');
        expect(fibra.firstChild.style.width).toBe('26%');
        // borrar la única comida con micros → cobertura 0 de 1 y fibra a 0, sin volver a pedir el día
        const llamadas = fetchWithAuth.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: 'Eliminar Mangú con huevo del diario' }));
        await screen.findByText('Ninguna de estas comidas trae micros (foto o macros propias).');
        expect(screen.getByRole('progressbar', { name: 'Fibra' }).getAttribute('aria-valuenow')).toBe('0');
        const despues = fetchWithAuth.mock.calls.slice(llamadas).map((c) => String(c[0]));
        expect(despues.filter((u) => u.startsWith('/api/diary/consumed/') && !u.includes('?'))).toHaveLength(1); // solo el DELETE
    });

    it('vuelve a pedir el día cuando el cajón borra, pero no cuando borra ella misma', async () => {
        fetchWithAuth.mockImplementation(enrutar());
        render(<TrackingProgress planData={{ calories: 2000, macros: { protein: 150, carbs: 200, fats: 60 } }} userId="u1" />);
        await screen.findByText('Con datos de 1 de 2 comidas');
        const antes = fetchWithAuth.mock.calls.length;
        await act(async () => { window.dispatchEvent(new CustomEvent('mealfit:diary-changed', { detail: { source: 'tracking-progress' } })); });
        expect(fetchWithAuth.mock.calls.length).toBe(antes);
        await act(async () => { window.dispatchEvent(new CustomEvent('mealfit:diary-changed', { detail: { source: 'diary-history', date: hoyISO() } })); });
        await waitFor(() => expect(fetchWithAuth.mock.calls.length).toBe(antes + 1));
    });
});

describe('el diario de días anteriores', () => {
    const abrir = (props = {}) => render(
        <DiaryHistory userId="u1" open onClose={() => {}} targetCalories={2000} targetMacros={{ protein: 150, carbs: 200, fats: 60 }} targetMicros={METAS} {...props} />
    );

    it('muestra los micros del día, la comida «extra» y la media de la semana', async () => {
        fetchWithAuth.mockImplementation(enrutar());
        abrir();
        await screen.findByText('Mangú con huevo');
        // la comida «extra» (default del componedor) ya no desaparece
        expect(screen.getByText('Extras y snacks')).toBeInTheDocument();
        expect(screen.getByText('Galletas')).toBeInTheDocument();
        // micros de ESE día con la misma lista y la cobertura honesta
        expect(screen.getByText('Con datos de 1 de 2 comidas')).toBeInTheDocument();
        const sodio = screen.getByRole('progressbar', { name: 'Sodio' });
        expect(sodio.getAttribute('aria-valuenow')).toBe('600');
        expect(sodio.getAttribute('aria-valuemax')).toBe('2000');
        expect(screen.getByText('Últimos 7 días: media de 700 kcal en 1 día con registro')).toBeInTheDocument();
        // «+14» pide dos semanas más a la tira (hasta 90)
        const antes = fetchWithAuth.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: 'Ver 2 semanas más' }));
        await waitFor(() => {
            const urls = fetchWithAuth.mock.calls.slice(antes).map((c) => String(c[0]));
            expect(urls.some((u) => u.includes('/api/diary/consumed-range/u1?days=28'))).toBe(true);
        });
        expect(screen.getAllByRole('tab')).toHaveLength(28);
    });

    it('borra desde el cajón, vuelve a pedir el día y avisa a la tarjeta con su origen', async () => {
        fetchWithAuth.mockImplementation(enrutar());
        confirmToast.mockResolvedValue(true);
        const oido = vi.fn();
        window.addEventListener('mealfit:diary-changed', oido);
        abrir();
        await screen.findByText('Galletas');
        const antes = fetchWithAuth.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: 'Eliminar Galletas del diario' }));
        await waitFor(() => expect(oido).toHaveBeenCalledTimes(1));
        expect(oido.mock.calls[0][0].detail).toEqual({ source: 'diary-history', date: hoyISO() });
        await waitFor(() => {
            const urls = fetchWithAuth.mock.calls.slice(antes).map((c) => String(c[0]));
            expect(urls.filter((u) => u.startsWith('/api/diary/consumed/u1?date='))).toHaveLength(1);
            expect(urls.filter((u) => u.startsWith('/api/diary/consumed-range/'))).toHaveLength(1);
        });
        window.removeEventListener('mealfit:diary-changed', oido);
    });

    it('«Registrar comida» hoy abre el componedor en el día 0; se refresca al registrar desde fuera', async () => {
        fetchWithAuth.mockImplementation(enrutar());
        abrir();
        await screen.findByText('Galletas');
        fireEvent.click(screen.getByRole('button', { name: 'Registrar comida' }));
        // el componedor real, montado desde el cajón: su chip «Hoy» va marcado
        const hoy = await screen.findByRole('button', { name: 'Hoy', pressed: true });
        expect(hoy).toBeInTheDocument();
        // registrar desde el componedor/escáner/chat dispara refresh-inventory → el cajón vuelve a pedir el día
        const antes = fetchWithAuth.mock.calls.length;
        await act(async () => { window.dispatchEvent(new Event('mealfit:refresh-inventory')); });
        await waitFor(() => {
            const urls = fetchWithAuth.mock.calls.slice(antes).map((c) => String(c[0]));
            expect(urls.some((u) => u.startsWith('/api/diary/consumed/u1?date='))).toBe(true);
        });
    });
});

describe('el componedor en el día pedido', () => {
    it('añade el chip del día cuando es más atrás que «Antier» y lo deja marcado', async () => {
        fetchWithAuth.mockImplementation(enrutar());
        render(<LogMealModal onClose={() => {}} initialDaysAgo={5} />);
        const grupo = await screen.findByRole('group', { name: 'Día' });
        const chips = grupo.querySelectorAll('button');
        expect(chips).toHaveLength(4);
        expect(chips[3].getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Hoy' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('sin el día pedido (o hasta «Antier») no hay chip de más', async () => {
        fetchWithAuth.mockImplementation(enrutar());
        render(<LogMealModal onClose={() => {}} initialDaysAgo={1} />);
        const grupo = await screen.findByRole('group', { name: 'Día' });
        expect(grupo.querySelectorAll('button')).toHaveLength(3);
        expect(screen.getByRole('button', { name: 'Ayer' }).getAttribute('aria-pressed')).toBe('true');
    });
});
