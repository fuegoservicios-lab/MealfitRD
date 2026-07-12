import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TrackingProgress from '../components/dashboard/TrackingProgress';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
}));

vi.mock('../components/dashboard/ScanMealModal', () => ({
    default: () => null,
}));

describe('TrackingProgress plan cycle reset', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(fetchWithAuth).mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('counts only meals registered after the current plan cycle started', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue({
            json: async () => ({
                totals: {
                    calories: 955,
                    protein: 33,
                    carbs: 92,
                    healthy_fats: 45,
                },
                meals: [
                    {
                        meal_name: 'Comida del plan anterior',
                        calories: 755,
                        protein: 25,
                        carbs: 70,
                        healthy_fats: 35,
                        consumed_at: '2026-07-12T10:00:00.000Z',
                    },
                    {
                        meal_name: 'Comida del plan nuevo',
                        calories: 200,
                        protein: 8,
                        carbs: 22,
                        healthy_fats: 10,
                        consumed_at: '2026-07-12T12:30:00.000Z',
                    },
                ],
            }),
        });

        const { container } = render(
            <TrackingProgress
                userId="user-1"
                planData={{
                    calories: 2100,
                    macros: { protein: 125, carbs: 269, fats: 58 },
                    cycle_start_date: '2026-07-12T12:00:00.000Z',
                }}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('1 comida registrada hoy')).toBeInTheDocument();
        });

        expect(container).toHaveTextContent(/200\s*\/\s*2100 kcal/);
        expect(container).not.toHaveTextContent(/955\s*\/\s*2100 kcal/);
    });

    it('starts at zero when every meal from today belongs to the previous plan', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue({
            json: async () => ({
                totals: {
                    calories: 955,
                    protein: 33,
                    carbs: 92,
                    healthy_fats: 45,
                },
                meals: [
                    {
                        meal_name: 'Comida del plan anterior',
                        calories: 955,
                        protein: 33,
                        carbs: 92,
                        healthy_fats: 45,
                        consumed_at: '2026-07-12T10:00:00.000Z',
                    },
                ],
            }),
        });

        const { container } = render(
            <TrackingProgress
                userId="user-1"
                planData={{
                    calories: 2100,
                    macros: { protein: 125, carbs: 269, fats: 58 },
                    created_at: '2026-07-12T12:00:00.000Z',
                }}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('0 comidas registradas hoy')).toBeInTheDocument();
        });

        expect(container).toHaveTextContent(/0\s*\/\s*2100 kcal/);
        expect(container).not.toHaveTextContent(/955\s*\/\s*2100 kcal/);
    });
});
