// [P1-PLAN-LOTE-762 · 2026-09-28] La ficha del plato sin detalles innecesarios (el dueño, con la captura de un plato
// escaneado el 27-sep). Los micros quedan PLEGADOS: están, pero solo para quien los abre.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('../hooks/useFotosDeComidas', () => ({ useFotoDeComida: vi.fn(() => null) }));
vi.mock('../context/AssessmentContext', () => ({ useAssessment: vi.fn(() => ({ planData: null })) }));

import { fetchWithAuth } from '../config/api';
import FichaDeComida from '../components/dashboard/FichaDeComida';

const MEAL = {
    id: 'm-1', meal_name: 'Huevos hervidos con aguacate', meal_type: 'desayuno',
    calories: 255, protein: 14, carbs: 7, healthy_fats: 20,
    consumed_at: new Date().toISOString(), created_at: new Date().toISOString(),
    micros: { values: { fiber_g: 2.1, sodium_mg: 145, potassium_mg: 296 } },
};
const METAS = { calories: 2050, protein: 134, carbs: 251, fats: 57 };
const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
    vi.mocked(fetchWithAuth).mockReset();
    vi.mocked(fetchWithAuth).mockResolvedValue(respuesta({ success: true, meal: {
        id: 'm-1', source: 'photo', created_at: MEAL.created_at,
        ingredientes: { con_kcal: true, lineas: [{ texto: '2 unidad de huevo hervido', kcal: 139 }] },
    } }));
});

describe('[762] la ficha, solo con lo que importa', () => {
    it('sin porcentaje junto a cada macro (la barra ya lo dice), con el % del día en las kcal', async () => {
        render(<FichaDeComida meal={MEAL} userId="u" metas={METAS} onClose={vi.fn()} />);
        await screen.findByText(/unidades de huevo hervido/);
        expect(screen.getByText(/12\s?% de tu meta del día/)).toBeInTheDocument();
        // 14 / 134 = 10 %: antes salía junto a «14 g»
        expect(screen.queryByText(/^10\s?%$/)).not.toBeInTheDocument();
        expect(screen.getByText('14 g')).toBeInTheDocument();
    });

    it('los micros, plegados: cerrados al abrir la ficha, se abren al tocar', async () => {
        render(<FichaDeComida meal={MEAL} userId="u" metas={METAS} onClose={vi.fn()} />);
        await screen.findByText(/unidades de huevo hervido/);
        const resumen = screen.getByText('Micronutrientes');
        const plegable = resumen.closest('details');
        expect(plegable).not.toBeNull();
        expect(plegable.open).toBe(false);
        fireEvent.click(resumen);
        expect(plegable.open).toBe(true);
    });

    it('sin la línea de origen ni el «Lo anotaste el…»', async () => {
        const ayer = new Date(Date.now() - 86400000);
        render(<FichaDeComida meal={{ ...MEAL, consumed_at: ayer.toISOString() }} userId="u" metas={METAS} onClose={vi.fn()} />);
        await screen.findByText(/unidades de huevo hervido/);
        expect(screen.queryByText('Escaneada con foto')).not.toBeInTheDocument();
        expect(screen.queryByText(/Lo anotaste el/)).not.toBeInTheDocument();
    });
});
