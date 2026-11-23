// [P1-PLAN-LOTE-1170 · 2026-11-23] Una comida registrada junta (batido + plato en la misma cena) no se pinta pegada:
// la fila dice «primera + N más» y la ficha enseña el total y cada parte con su kcal y P/C/G.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('../hooks/useFotosDeComidas', () => ({
    useFotoDeComida: vi.fn(() => null), useFotosDeComida: vi.fn(() => []),
    useIdsConFoto: vi.fn(() => new Set()), useEnlazarFotosDelChat: vi.fn(), borrarFotoDeComidaEnSegundoPlano: vi.fn(),
}));
vi.mock('../context/AssessmentContext', () => ({ useAssessment: vi.fn(() => ({ planData: null })) }));

import { fetchWithAuth } from '../config/api';
import FichaDeComida from '../components/dashboard/FichaDeComida';
import { nombreDeFila } from '../utils/nombreDeRegistro';

const t = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const BATIDO = 'Mass gainer GNC Bulk 1340 (5 scoops con 1 L de agua)';
const PLATO = 'Bistec de res y pechuga de pollo a la plancha con puré de papa y moro de lentejas o guandules';
const MEAL = {
    id: 'm-1', meal_name: `${BATIDO} y ${PLATO}`, meal_type: 'cena', calories: 2164, protein: 140, carbs: 301,
    healthy_fats: 46, consumed_at: new Date().toISOString(), created_at: new Date().toISOString(), micros: null,
    partes: [BATIDO, PLATO],
};

describe('[1170] comida registrada junta', () => {
    it('la fila no pega los nombres: primera parte + cuántas más', () => {
        expect(nombreDeFila(MEAL, null, t)).toBe(`${BATIDO} + 1 más`);
        expect(nombreDeFila({ meal_name: 'Mangú' }, null, t)).toBe('Mangú');
    });

    it('la ficha: título que no pega, el total con su rótulo y cada parte con sus macros', async () => {
        fetchWithAuth.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, meal: {
            id: 'm-1', source: 'manual', ingredientes: { con_kcal: false, lineas: [] },
            partes: [
                { meal_name: BATIDO, calories: 1114, protein: 42, carbs: 233, healthy_fats: 4 },
                { meal_name: PLATO, calories: 1050, protein: 98, carbs: 68, healthy_fats: 42 },
            ],
        } }) });
        render(<FichaDeComida meal={MEAL} userId="u" metas={{ calories: 3350, protein: 150, carbs: 400, fats: 90 }} onClose={vi.fn()} />);
        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('2 cosas registradas juntas');
        expect(screen.getByText('Total')).toBeInTheDocument();
        const cada = await screen.findByRole('region', { name: 'Cada una' });
        const filas = within(cada).getAllByRole('listitem');
        expect(filas).toHaveLength(2);
        expect(filas[0].textContent).toContain(BATIDO);
        expect(filas[0].textContent).toContain('1,114');
        expect(filas[1].textContent).toContain(PLATO);
        expect(filas[1].textContent).toMatch(/98 g/);
    });
});
