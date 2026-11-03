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
        [2850, 130, 397, 82, 'rgb(16, 185, 129)'], // [BB-024] 2850/2900 = 98.3% -> Green Zone (90-105%)
        [2900, 150, 394, 81, 'rgb(16, 185, 129)'], // [BB-024] 2900/2900 = 100% -> Green Zone (90-105%)
        [4350, 225, 591, 122, 'rgb(249, 115, 22)'], // [BB-024] 4350/2900 = 150% -> Exceso > 110% tono naranja cálido
        [0, 0, 0, 0, 'rgb(245, 158, 11)'], // 0% -> Amarillo ámbar en curso
    ])('preserves nutrient colors and honest percentages at %j kcal', async (calories, protein, carbs, fats, expectedCalColor) => {
        fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories, protein, carbs, fats } }) });
        render(<TrackingProgress userId="goal-colors" planData={plan} />);
        await screen.findByText('0 comidas registradas');
        expect(screen.getByText(/Calorías y macros: metas del plan/)).toBeInTheDocument();
        const rows = [
            ['Calorías', calories, 2900, expectedCalColor],
            ['Proteína', protein, 150, 'rgb(59, 130, 246)'],
            ['Carbohidratos', carbs, 394, 'rgb(16, 185, 129)'],
            ['Grasas', fats, 81, 'rgb(236, 72, 153)'],
        ];
        for (const [label, value, goal, color] of rows) {
            const track = screen.getByRole('progressbar', { name: label });
            const fill = track.firstElementChild;
            expect(fill.style.background).toContain(color);
            expect(track.style.borderColor).toBe('');
            expect(track.getAttribute('aria-valuetext')).toContain(`${Math.round(value / goal * 100)}%`);
            if (value > goal && label !== 'Calorías') {
                expect(fill.style.width).toBe('100%');
                expect(fill.style.boxShadow).toBe('none');
            }
        }
    });

    describe('[BB-024 / P1-CALORIE-BAR-GOAL-SEMANTICS] Banda de Éxito y Semántica de Calorías', () => {
        const deficitPlan = { calories: 2000, macros: { protein: 150, carbs: 200, fats: 60 } };

        it('enciende verde esmeralda y marca meta alcanzada en 1910 kcal (95.5% de deficit)', async () => {
            fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 1910, protein: 145, carbs: 190, fats: 58 } }) });
            render(<TrackingProgress userId="u-green-zone" planData={deficitPlan} referenceProfile={{ mainGoal: 'lose_fat' }} />);
            await screen.findByText('0 comidas registradas');

            const calTrack = screen.getByRole('progressbar', { name: 'Calorías' });
            expect(calTrack.firstElementChild.style.background).toContain('rgb(16, 185, 129)');
            expect(screen.getByText('Meta del día alcanzada')).toBeInTheDocument();
        });

        it('se mantiene en amarillo ámbar a 1500 kcal (75% - en curso)', async () => {
            fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 1500, protein: 110, carbs: 150, fats: 45 } }) });
            render(<TrackingProgress userId="u-in-progress" planData={deficitPlan} referenceProfile={{ mainGoal: 'lose_fat' }} />);
            await screen.findByText('0 comidas registradas');

            const calTrack = screen.getByRole('progressbar', { name: 'Calorías' });
            expect(calTrack.firstElementChild.style.background).toContain('rgb(245, 158, 11)');
            expect(screen.getByText('Faltan 500 kcal para la meta')).toBeInTheDocument();
        });

        it('pasa a naranja ámbar de exceso a 2600 kcal (>110% en modo deficit)', async () => {
            fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 2600, protein: 160, carbs: 280, fats: 80 } }) });
            render(<TrackingProgress userId="u-excess" planData={deficitPlan} referenceProfile={{ mainGoal: 'lose_fat' }} />);
            await screen.findByText('0 comidas registradas');

            const calTrack = screen.getByRole('progressbar', { name: 'Calorías' });
            expect(calTrack.firstElementChild.style.background).toContain('rgb(249, 115, 22)');
            expect(screen.getByText('600 kcal sobre la meta')).toBeInTheDocument();
            expect(screen.queryByText('Meta del día alcanzada')).toBeNull();
        });

        it('permite superavit hasta 115% en modo ganancia muscular antes de marcar exceso', async () => {
            fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 2240, protein: 150, carbs: 220, fats: 65 } }) }); // 112%
            render(<TrackingProgress userId="u-muscle" planData={deficitPlan} referenceProfile={{ mainGoal: 'gain_muscle' }} />);
            await screen.findByText('0 comidas registradas');

            const calTrack = screen.getByRole('progressbar', { name: 'Calorías' });
            expect(calTrack.firstElementChild.style.background).toContain('rgb(16, 185, 129)');
            expect(screen.getByText('Meta del día alcanzada')).toBeInTheDocument();
        });
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
