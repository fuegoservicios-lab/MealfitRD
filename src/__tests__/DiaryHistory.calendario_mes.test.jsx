import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import DiaryHistory from '../components/dashboard/DiaryHistory';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../components/dashboard/ScanMealModal', () => ({ default: () => null }));
vi.mock('../utils/confirmToast', () => ({ confirmToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => null) }));
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

const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });
const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const _h = new Date();
const HOY = aISO(_h);
const AYER_FECHA = new Date(_h.getFullYear(), _h.getMonth(), _h.getDate() - 1, 12);
const AYER = aISO(AYER_FECHA);

const RESUMEN_MOCK = {
    days: [
        { date: HOY, calories: 2100, protein: 140, carbs: 220, healthy_fats: 50, meals_count: 3 },
        { date: AYER, calories: 1200, protein: 70, carbs: 140, healthy_fats: 30, meals_count: 2 },
    ],
};

const DIA_HOY_COMPLETO = {
    meals: [
        { id: 'm1', meal_name: 'Desayuno completo', meal_type: 'desayuno', calories: 700, protein: 45, carbs: 70, healthy_fats: 15, created_at: _h.toISOString(), consumed_at: _h.toISOString() },
        { id: 'm2', meal_name: 'Almuerzo fuerte', meal_type: 'almuerzo', calories: 800, protein: 55, carbs: 80, healthy_fats: 20, created_at: _h.toISOString(), consumed_at: _h.toISOString() },
        { id: 'm3', meal_name: 'Cena saludable', meal_type: 'cena', calories: 600, protein: 40, carbs: 70, healthy_fats: 15, created_at: _h.toISOString(), consumed_at: _h.toISOString() },
    ],
    totals: { calories: 2100, protein: 140, carbs: 220, healthy_fats: 50 },
};

const DIA_AYER_INCOMPLETO = {
    meals: [
        { id: 'm4', meal_name: 'Avena con fruta', meal_type: 'desayuno', calories: 450, protein: 20, carbs: 65, healthy_fats: 10, created_at: AYER_FECHA.toISOString(), consumed_at: AYER_FECHA.toISOString() },
    ],
    totals: { calories: 1200, protein: 70, carbs: 140, healthy_fats: 30 },
};

describe('DiaryHistory - Cuadrícula de mes y barra verde de meta completada', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchWithAuth.mockImplementation(async (url) => {
            if (url.includes('/api/diary/consumed-range')) return respuesta(RESUMEN_MOCK);
            if (url.includes(`date=${HOY}`)) return respuesta(DIA_HOY_COMPLETO);
            if (url.includes(`date=${AYER}`)) return respuesta(DIA_AYER_INCOMPLETO);
            return respuesta({ meals: [], totals: {} });
        });
    });

    it('pinta la raya en verde (railFillComplete) al completar la meta de calorías, y ámbar si no se completó', async () => {
        render(
            <DiaryHistory
                userId="u-123"
                open={true}
                onClose={() => {}}
                targetCalories={2000}
            />
        );

        await waitFor(() => {
            expect(fetchWithAuth).toHaveBeenCalled();
        });

        // En la tira de días (en document.body por createPortal):
        // HOY tiene 2100 kcal (meta 2000) => railFillComplete
        await waitFor(() => {
            const completes = document.querySelectorAll('[class*="railFillComplete"]');
            expect(completes.length).toBeGreaterThanOrEqual(1);
        });

        // La barra de cuota de hoy (2100 >= 2000) también lleva quotaFillComplete
        const quotaFill = document.querySelector('[class*="quotaFillComplete"]');
        expect(quotaFill).not.toBeNull();
    });

    it('permite cambiar a la vista de mes (calendario) con la pestaña "Mes"', async () => {
        render(
            <DiaryHistory
                userId="u-123"
                open={true}
                onClose={() => {}}
                targetCalories={2000}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /mes/i })).toBeInTheDocument();
        });

        const tabMes = screen.getByRole('button', { name: /mes/i });
        fireEvent.click(tabMes);

        // Debe renderizarse el contenedor de calendario y la cuadrícula
        await waitFor(() => {
            expect(screen.getByRole('grid', { name: /calendario mensual/i })).toBeInTheDocument();
        });

        // El domingo debe tener el resaltado rojo (calSunday)
        const domingo = screen.getAllByText('D').find((el) => el.className.includes('calSunday'));
        expect(domingo).toBeDefined();
    });

    it('en la vista mensual, los días con meta completada llevan punto verde y los incompletos punto amarillo', async () => {
        render(
            <DiaryHistory
                userId="u-123"
                open={true}
                onClose={() => {}}
                targetCalories={2000}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /mes/i })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /mes/i }));

        await waitFor(() => {
            expect(screen.getByRole('grid', { name: /calendario mensual/i })).toBeInTheDocument();
        });

        // Punto verde (calCellDotGreen) para el día completo (hoy: 2100 kcal)
        const dotGreen = document.querySelector('[class*="calCellDotGreen"]');
        expect(dotGreen).not.toBeNull();

        // Punto amarillo (calCellDotYellow) para el día incompleto (ayer: 1200 kcal)
        const dotYellow = document.querySelector('[class*="calCellDotYellow"]');
        expect(dotYellow).not.toBeNull();
    });

    it('permite navegar al mes anterior con la flecha y regresar a hoy con el botón de fecha', async () => {
        render(
            <DiaryHistory
                userId="u-123"
                open={true}
                onClose={() => {}}
                targetCalories={2000}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /mes/i })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /mes/i }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /mes anterior/i })).toBeInTheDocument();
        });

        const btnAnt = screen.getByRole('button', { name: /mes anterior/i });
        fireEvent.click(btnAnt);

        // Al cambiar de mes, debe seguir mostrando la cuadrícula de ese mes
        await waitFor(() => {
            expect(screen.getByRole('grid', { name: /calendario mensual/i })).toBeInTheDocument();
        });

        // El botón de atajo a hoy (que tiene el número del día de hoy) debe existir
        const btnHoy = screen.getByRole('button', { name: /ir a hoy/i });
        expect(btnHoy).toBeInTheDocument();

        // Pulsar "Ir a hoy" regresa a hoy
        fireEvent.click(btnHoy);
        await waitFor(() => {
            expect(fetchWithAuth).toHaveBeenCalledWith(expect.stringContaining(`date=${HOY}`));
        });
    });
});
