import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TrackingProgress from '../components/dashboard/TrackingProgress';
import { fetchWithAuth } from '../config/api';
import { confirmToast } from '../utils/confirmToast';
import { toast } from 'sonner';

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
}));

vi.mock('../components/dashboard/ScanMealModal', () => ({
    default: () => null,
}));

vi.mock('../utils/confirmToast', () => ({
    confirmToast: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const _PLAN_DATA = {
    calories: 3350,
    macros: { protein: 157, carbs: 471, fats: 93 },
    created_at: '2026-11-01T00:00:00.000Z',
};

const _TODAY_MEALS = [
    {
        id: 'today-1',
        meal_name: 'New York steak y pechuga',
        calories: 975,
        protein: 80,
        carbs: 40,
        healthy_fats: 45,
        meal_type: 'almuerzo',
        consumed_at: '2026-11-18T16:46:00.000Z',
    },
];

const _YESTERDAY_MEALS = [
    {
        id: 'yest-1',
        meal_name: 'Sancocho de pollo de ayer',
        calories: 650,
        protein: 45,
        carbs: 60,
        healthy_fats: 20,
        meal_type: 'cena',
        consumed_at: '2026-11-17T20:00:00.000Z',
    },
];

const _jsonResponse = (body, ok = true) => ({
    ok,
    json: async () => body,
});

const _totalsOf = (meals) => ({
    calories: meals.reduce((s, m) => s + m.calories, 0),
    protein: meals.reduce((s, m) => s + m.protein, 0),
    carbs: meals.reduce((s, m) => s + m.carbs, 0),
    healthy_fats: meals.reduce((s, m) => s + m.healthy_fats, 0),
});

describe('[SEMANA-EN-PROGRESO] lista de comidas al seleccionar otro día', () => {
    const HOY = '2026-11-18';
    const AYER = '2026-11-17';

    beforeAll(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 18, 15, 0, 0));
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    beforeEach(() => {
        localStorage.clear();
        vi.mocked(fetchWithAuth).mockReset();
        vi.mocked(confirmToast).mockReset();
        vi.mocked(toast.success).mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('al tocar ayer en SemanaEnProgreso muestra las comidas de ayer (no las de hoy) y borra sin tocar hoy', async () => {
        let yesterdayMeals = [..._YESTERDAY_MEALS];
        vi.mocked(confirmToast).mockResolvedValue(true);
        vi.mocked(fetchWithAuth).mockImplementation((url, options) => {
            if (options?.method === 'DELETE' && url === '/api/diary/consumed/yest-1') {
                yesterdayMeals = [];
                return Promise.resolve(_jsonResponse({ success: true }));
            }
            if (url.startsWith('/api/diary/consumed-range/')) {
                return Promise.resolve(_jsonResponse({
                    days: [{
                        date: AYER, calories: 650, protein: 45, carbs: 60, healthy_fats: 20, meals_count: 1,
                    }],
                }));
            }
            if (url.includes(`date=${AYER}`)) {
                return Promise.resolve(_jsonResponse({ totals: _totalsOf(yesterdayMeals), meals: yesterdayMeals }));
            }
            if (url.includes(`date=${HOY}`)) {
                return Promise.resolve(_jsonResponse({ totals: _totalsOf(_TODAY_MEALS), meals: _TODAY_MEALS }));
            }
            return Promise.resolve(_jsonResponse({}));
        });

        render(<TrackingProgress userId="user-moises" planData={_PLAN_DATA} />);

        await waitFor(() => {
            expect(screen.getByText('New York steak y pechuga')).toBeInTheDocument();
        });
        expect(screen.getByText('Comidas de hoy')).toBeInTheDocument();

        const dayButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
        // Selecciona ayer (martes 17-nov)
        const ayerBtn = dayButtons.find((b) => b.getAttribute('aria-label')?.includes('17'));
        expect(ayerBtn).toBeTruthy();
        fireEvent.click(ayerBtn);

        await waitFor(() => {
            expect(screen.getByText('Sancocho de pollo de ayer')).toBeInTheDocument();
        });
        expect(screen.queryByText('New York steak y pechuga')).not.toBeInTheDocument();
        expect(screen.queryByText('Comidas de hoy')).not.toBeInTheDocument();
        expect(screen.getByText(/Comidas de /)).toBeInTheDocument();

        // Al eliminar la comida de ayer, desaparece de ayer y NO elimina la de hoy al deseleccionar ayer
        fireEvent.click(screen.getByRole('button', { name: 'Eliminar Sancocho de pollo de ayer del diario' }));
        await waitFor(() => {
            expect(screen.getByText('Sin comidas registradas este día')).toBeInTheDocument();
        });
        expect(screen.queryByText('New York steak y pechuga')).not.toBeInTheDocument();

        // Deseleccionar ayer -> vuelve a mostrar las comidas de hoy intactas
        fireEvent.click(ayerBtn);
        await waitFor(() => {
            expect(screen.getByText('New York steak y pechuga')).toBeInTheDocument();
        });
        expect(screen.getByText('Comidas de hoy')).toBeInTheDocument();
    });

    // [P1-DIA-EN-EL-CONTADOR · 2026-11-27] el día tocado manda sobre TODO el contador: las barras pintan sus cifras,
    // la cabecera dice qué día es y la acción es «Volver a hoy» (registrar anotaría en hoy)
    it('al tocar ayer las barras de macros son las de ayer, y «Volver a hoy» las devuelve', async () => {
        vi.mocked(fetchWithAuth).mockImplementation((url) => {
            if (url.startsWith('/api/diary/consumed-range/')) {
                return Promise.resolve(_jsonResponse({
                    days: [{ date: AYER, calories: 650, protein: 45, carbs: 60, healthy_fats: 20, meals_count: 1 }],
                }));
            }
            if (url.includes(`date=${AYER}`)) {
                return Promise.resolve(_jsonResponse({ totals: _totalsOf(_YESTERDAY_MEALS), meals: _YESTERDAY_MEALS }));
            }
            if (url.includes(`date=${HOY}`)) {
                return Promise.resolve(_jsonResponse({ totals: _totalsOf(_TODAY_MEALS), meals: _TODAY_MEALS }));
            }
            return Promise.resolve(_jsonResponse({}));
        });
        render(<TrackingProgress userId="user-moises" planData={_PLAN_DATA} />);
        const kcal = () => screen.getByRole('progressbar', { name: 'Calorías' }).getAttribute('aria-valuetext');
        await waitFor(() => expect(kcal()).toMatch(/^975 /));
        expect(screen.getByRole('heading', { name: 'Tus macros' })).toBeInTheDocument();

        const ayerBtn = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
            .find((b) => b.getAttribute('aria-label')?.includes('17'));
        fireEvent.click(ayerBtn);
        await waitFor(() => expect(kcal()).toMatch(/^650 /));
        expect(screen.getByRole('progressbar', { name: 'Proteína' }).getAttribute('aria-valuetext')).toMatch(/^45 /);
        expect(screen.queryByRole('button', { name: /Registrar comida/ })).toBeNull();
        expect(screen.getAllByText(/Faltaron .* para la meta/, { selector: 'span' }).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: /Volver a hoy/ }));
        await waitFor(() => expect(kcal()).toMatch(/^975 /));
        expect(screen.getByRole('button', { name: /Registrar comida/ })).toBeInTheDocument();
        expect(ayerBtn).toHaveAttribute('aria-pressed', 'false');
    });
});
