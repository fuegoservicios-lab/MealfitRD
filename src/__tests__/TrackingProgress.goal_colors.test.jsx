import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrackingProgress from '../components/dashboard/TrackingProgress';
import MicrosList from '../components/dashboard/MicrosList';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../hooks/useNumeroAnimado', () => ({ useNumeroAnimado: (value) => value }));
vi.mock('../components/dashboard/ScanMealModal', () => ({ default: () => null }));

const plan = { calories: 2900, macros: { protein: 150, carbs: 394, fats: 81 } };

describe('Plan goals are not health ceilings', () => {
    beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

    it.each([
        [2850, 130, 397, 82], // Screenshot: only 3 g carbs and 1 g fat over goal.
        [2900, 150, 394, 81], // Exactly at goal.
        [4350, 225, 591, 122], // A larger deviation is still not a medical danger threshold.
        [0, 0, 0, 0],
    ])('preserves nutrient colors and honest percentages at %j kcal', async (calories, protein, carbs, fats) => {
        fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories, protein, carbs, fats } }) });
        render(<TrackingProgress userId="goal-colors" planData={plan} />);
        await screen.findByText('0 comidas registradas');
        expect(screen.getByText(/Calorías y macros: metas del plan/)).toBeInTheDocument();
        const rows = [
            ['Calorías', calories, 2900, 'rgb(245, 158, 11)'],
            ['Proteína', protein, 150, 'rgb(59, 130, 246)'],
            ['Carbohidratos', carbs, 394, 'rgb(16, 185, 129)'],
            ['Grasas', fats, 81, 'rgb(236, 72, 153)'],
        ];
        for (const [label, value, goal, color] of rows) {
            const track = screen.getByRole('progressbar', { name: label });
            const fill = track.firstElementChild;
            expect(fill.style.background).toContain(color);
            expect(track.style.borderColor).toBe('');
            expect(track.style.boxShadow).toBe('');
            expect(track.getAttribute('aria-valuetext')).toContain(`${Math.round(value / goal * 100)}%`);
            if (value > goal) {
                expect(fill.style.width).toBe('100%');
                expect(fill.style.boxShadow).toBe('none');
            }
        }
    });

    it.each([1999, 2000, 2001])('warns only above a supplied recommended maximum (%i mg sodium)', (sodium) => {
        render(<MicrosList micros={{ sodium_mg: sodium, vit_a_mcg: 1000, vit_d_mcg: 16 }}
            coverage={{ con_datos: 1, total: 1 }} metas={{
                sodium_mg: { kind: 'ceiling', target: 2000 },
                vit_a_mcg: { kind: 'floor', target: 900 },
                vit_d_mcg: { kind: 'floor', target: 15 },
            }} />);
        expect(screen.getByTitle('Máximo recomendado')).toBeInTheDocument();
        expect(Boolean(screen.queryByText('Sobre el máximo recomendado'))).toBe(sodium > 2000);
        expect(screen.getByRole('progressbar', { name: 'Sodio' }).firstElementChild.className.includes('over')).toBe(sodium > 2000);
        for (const name of ['Vitamina A', 'Vitamina D']) {
            expect(screen.getByRole('progressbar', { name }).firstElementChild.className).toContain('done');
            expect(screen.getByRole('progressbar', { name }).firstElementChild.className).not.toContain('over');
        }
    });
});
