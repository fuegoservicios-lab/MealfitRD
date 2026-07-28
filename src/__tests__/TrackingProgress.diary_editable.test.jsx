// [P1-DIARY-EDITABLE · 2026-07-28] Frontend half: la card "Progreso en
// Tiempo Real" (TrackingProgress.jsx) ya recibía los objetos completos de
// `consumed.meals` (fetch a `/api/diary/consumed/{userId}`) pero solo
// exponía `.length` — el diario era write-only. Este test cubre la lista
// visible (nombre + kcal) y el DELETE por fila (`DELETE
// /api/diary/consumed/{meal_id}`, backend ya comiteado) que actualiza
// count/totales y el cache local sin resucitar la fila borrada.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    calories: 2100,
    macros: { protein: 125, carbs: 269, fats: 58 },
    created_at: '2026-07-27T00:00:00.000Z',
};

const _MEAL_1 = {
    id: 'meal-1',
    meal_name: 'Pollo con arroz',
    calories: 450,
    protein: 35,
    carbs: 40,
    healthy_fats: 12,
    meal_type: 'almuerzo',
    consumed_at: '2026-07-27T13:00:00.000Z',
};

const _MEAL_2 = {
    id: 'meal-2',
    meal_name: 'Batido de proteína',
    calories: 200,
    protein: 25,
    carbs: 10,
    healthy_fats: 3,
    meal_type: 'merienda',
    consumed_at: '2026-07-27T16:00:00.000Z',
};

const _jsonResponse = (body, ok = true) => ({
    ok,
    json: async () => body,
});

const _mockGetResponse = (meals) => _jsonResponse({
    totals: {
        calories: meals.reduce((s, m) => s + m.calories, 0),
        protein: meals.reduce((s, m) => s + m.protein, 0),
        carbs: meals.reduce((s, m) => s + m.carbs, 0),
        healthy_fats: meals.reduce((s, m) => s + m.healthy_fats, 0),
    },
    meals,
});

describe('[P1-DIARY-EDITABLE] TrackingProgress — lista + delete de comidas', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(fetchWithAuth).mockReset();
        vi.mocked(confirmToast).mockReset();
        vi.mocked(toast.success).mockReset();
        vi.mocked(toast.error).mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renderiza cada comida con su nombre y sus kcal', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(_mockGetResponse([_MEAL_1, _MEAL_2]));

        render(<TrackingProgress userId="user-1" planData={_PLAN_DATA} />);

        await waitFor(() => {
            expect(screen.getByText('Pollo con arroz')).toBeInTheDocument();
        });
        expect(screen.getByText('Batido de proteína')).toBeInTheDocument();
        // kcal por fila (no solo el total agregado del ProgressBar).
        expect(screen.getByText(/Almuerzo · 450 kcal/)).toBeInTheDocument();
        expect(screen.getByText(/Merienda · 200 kcal/)).toBeInTheDocument();
        expect(screen.getByText('2 comidas registradas hoy')).toBeInTheDocument();
    });

    it('pide confirmación y NO borra nada si el usuario cancela', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(_mockGetResponse([_MEAL_1, _MEAL_2]));
        vi.mocked(confirmToast).mockResolvedValue(false);

        render(<TrackingProgress userId="user-1" planData={_PLAN_DATA} />);
        await waitFor(() => screen.getByText('Pollo con arroz'));

        fireEvent.click(screen.getByRole('button', { name: 'Eliminar Pollo con arroz del diario' }));

        await waitFor(() => {
            expect(confirmToast).toHaveBeenCalledTimes(1);
        });
        // Solo el GET inicial se disparó — ningún DELETE.
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Pollo con arroz')).toBeInTheDocument();
        expect(screen.getByText('2 comidas registradas hoy')).toBeInTheDocument();
    });

    it('al confirmar, llama al DELETE con el id correcto y baja count + totales de inmediato', async () => {
        vi.mocked(confirmToast).mockResolvedValue(true);
        vi.mocked(fetchWithAuth).mockImplementation((url, options) => {
            if (options?.method === 'DELETE') {
                expect(url).toBe('/api/diary/consumed/meal-1');
                return Promise.resolve(_jsonResponse({ success: true, message: 'Comida eliminada del diario.' }));
            }
            return Promise.resolve(_mockGetResponse([_MEAL_1, _MEAL_2]));
        });

        const { container } = render(<TrackingProgress userId="user-1" planData={_PLAN_DATA} />);
        await waitFor(() => screen.getByText('Pollo con arroz'));
        // Total agregado ANTES de borrar: 450 + 200 = 650. La barra de
        // Calorías renderea "650" y "/ 2100 kcal" en <span> hermanos
        // distintos — `container.toHaveTextContent` concatena todo el
        // texto del subárbol (igual que TrackingProgress.plan_cycle_reset
        // .test.jsx), a diferencia de `getByText` que exige un único nodo.
        await waitFor(() => {
            expect(container).toHaveTextContent(/650\s*\/\s*2100 kcal/);
        });

        fireEvent.click(screen.getByRole('button', { name: 'Eliminar Pollo con arroz del diario' }));

        // La fila desaparece y el count/las macros bajan sin esperar un refetch.
        await waitFor(() => {
            expect(screen.queryByText('Pollo con arroz')).not.toBeInTheDocument();
        });
        expect(screen.getByText('1 comida registrada hoy')).toBeInTheDocument();
        expect(container).toHaveTextContent(/200\s*\/\s*2100 kcal/);
        expect(container).not.toHaveTextContent(/650\s*\/\s*2100 kcal/);
        expect(toast.success).toHaveBeenCalledTimes(1);

        // Contrato de cache (P1-TRACKING-CACHE-CONSUMED): la actualización debe
        // pasar por el mismo `setConsumed` que persiste a localStorage — si no,
        // el próximo mount resucitaría "Pollo con arroz" desde el cache viejo.
        const cacheKey = Object.keys(localStorage).find((k) => k.startsWith('mealfit_tracking_consumed_'));
        expect(cacheKey).toBeTruthy();
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        expect(cached.meals.some((m) => m.id === 'meal-1')).toBe(false);
        expect(cached.meals.some((m) => m.id === 'meal-2')).toBe(true);
        expect(cached.calories).toBe(200);
    });

    it('si el DELETE falla, la fila se queda y los totales no cambian', async () => {
        vi.mocked(confirmToast).mockResolvedValue(true);
        vi.mocked(fetchWithAuth).mockImplementation((url, options) => {
            if (options?.method === 'DELETE') {
                return Promise.resolve(_jsonResponse({ detail: 'Comida no encontrada (o ya fue eliminada).' }, false));
            }
            return Promise.resolve(_mockGetResponse([_MEAL_1, _MEAL_2]));
        });

        const { container } = render(<TrackingProgress userId="user-1" planData={_PLAN_DATA} />);
        await waitFor(() => screen.getByText('Pollo con arroz'));

        fireEvent.click(screen.getByRole('button', { name: 'Eliminar Pollo con arroz del diario' }));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledTimes(1);
        });
        // La fila y los totales quedan exactamente como antes del intento.
        expect(screen.getByText('Pollo con arroz')).toBeInTheDocument();
        expect(screen.getByText('2 comidas registradas hoy')).toBeInTheDocument();
        expect(container).toHaveTextContent(/650\s*\/\s*2100 kcal/);
    });

    it('muestra un estado vacío que invita a registrar cuando no hay comidas', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(_mockGetResponse([]));

        render(<TrackingProgress userId="user-1" planData={_PLAN_DATA} />);

        await waitFor(() => {
            expect(screen.getByText('0 comidas registradas hoy')).toBeInTheDocument();
        });
        expect(screen.getByText(/Aún no registras comidas hoy/)).toBeInTheDocument();
    });
});
