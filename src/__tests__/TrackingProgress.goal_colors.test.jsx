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

    // [P1-MACRO-BARS-SEMAFORO · 2026-11-26] El color es el ESTADO (progress/done/over), ya no el nutriente.
    it.each([
        // kcal, prot, carb, grasa, estados esperados [kcal, prot, carb, grasa]
        [2850, 130, 397, 82, ['done', 'progress', 'done', 'done']], // 98 % kcal; prot 87 % aún en curso
        [2900, 150, 394, 81, ['done', 'done', 'done', 'done']],
        [4350, 225, 591, 122, ['over', 'over', 'over', 'over']], // 150 %: sin límite AMDR, >120 % de la meta es exceso
        [0, 0, 0, 0, ['progress', 'progress', 'progress', 'progress']],
    ])('colors bars by state and keeps honest percentages at %j kcal', async (calories, protein, carbs, fats, states) => {
        fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories, protein, carbs, fats } }) });
        render(<TrackingProgress userId="goal-colors" planData={plan} />);
        await screen.findByText('0 comidas registradas');
        const rows = [
            ['Calorías', calories, 2900],
            ['Proteína', protein, 150],
            ['Carbohidratos', carbs, 394],
            ['Grasas', fats, 81],
        ];
        rows.forEach(([label, value, goal], i) => {
            const track = screen.getByRole('progressbar', { name: label });
            const fill = track.firstElementChild;
            expect(fill.dataset.state).toBe(states[i]);
            expect(fill.style.background).toBe('');
            expect(track.getAttribute('aria-valuetext')).toContain(`${Math.round(value / goal * 100)}%`);
            if (value > goal && label !== 'Calorías') expect(fill.style.width).toBe('100%');
        });
    });

    describe('[BB-024 / P1-CALORIE-BAR-GOAL-SEMANTICS] Banda de Éxito y Semántica de Calorías', () => {
        const deficitPlan = { calories: 2000, macros: { protein: 150, carbs: 200, fats: 60 } };

        it('enciende verde esmeralda y marca meta alcanzada en 1910 kcal (95.5% de deficit)', async () => {
            fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 1910, protein: 145, carbs: 190, fats: 58 } }) });
            render(<TrackingProgress userId="u-green-zone" planData={deficitPlan} referenceProfile={{ mainGoal: 'lose_fat' }} />);
            await screen.findByText('0 comidas registradas');

            const calTrack = screen.getByRole('progressbar', { name: 'Calorías' });
            expect(calTrack.firstElementChild.dataset.state).toBe('done');
            expect(screen.getByText('Meta del día alcanzada')).toBeInTheDocument();
        });

        it('se mantiene en amarillo ámbar a 1500 kcal (75% - en curso)', async () => {
            fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 1500, protein: 110, carbs: 150, fats: 45 } }) });
            render(<TrackingProgress userId="u-in-progress" planData={deficitPlan} referenceProfile={{ mainGoal: 'lose_fat' }} />);
            await screen.findByText('0 comidas registradas');

            const calTrack = screen.getByRole('progressbar', { name: 'Calorías' });
            expect(calTrack.firstElementChild.dataset.state).toBe('progress');
            expect(screen.getByText('Faltan 500 kcal para la meta')).toBeInTheDocument();
        });

        it('pasa a naranja ámbar de exceso a 2600 kcal (>110% en modo deficit)', async () => {
            fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 2600, protein: 160, carbs: 280, fats: 80 } }) });
            render(<TrackingProgress userId="u-excess" planData={deficitPlan} referenceProfile={{ mainGoal: 'lose_fat' }} />);
            await screen.findByText('0 comidas registradas');

            const calTrack = screen.getByRole('progressbar', { name: 'Calorías' });
            expect(calTrack.firstElementChild.dataset.state).toBe('over');
            expect(screen.getByText('600 kcal sobre la meta')).toBeInTheDocument();
            expect(screen.queryByText('Meta del día alcanzada')).toBeNull();
        });

        it('acepta déficit moderado al 85% (1700 kcal) como verde en lose_fat', async () => {
            fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 1700, protein: 135, carbs: 170, fats: 50 } }) });
            render(<TrackingProgress userId="u-deficit-85" planData={deficitPlan} referenceProfile={{ mainGoal: 'lose_fat' }} />);
            await screen.findByText('0 comidas registradas');

            const calTrack = screen.getByRole('progressbar', { name: 'Calorías' });
            expect(calTrack.firstElementChild.dataset.state).toBe('done');
            expect(screen.getByText('Meta del día alcanzada')).toBeInTheDocument();
        });

        it('marca exceso en lose_fat al 108% (2160 kcal > 105%) pero verde en gain_muscle al 112%', async () => {
            fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 2160, protein: 150, carbs: 215, fats: 65 } }) }); // 108%
            render(<TrackingProgress userId="u-lose-108" planData={deficitPlan} referenceProfile={{ mainGoal: 'lose_fat' }} />);
            await screen.findByText('0 comidas registradas');

            const calTrack = screen.getByRole('progressbar', { name: 'Calorías' });
            expect(calTrack.firstElementChild.dataset.state).toBe('over');
            expect(screen.getByText('160 kcal sobre la meta')).toBeInTheDocument();
            expect(screen.queryByText('Meta del día alcanzada')).toBeNull();
        });

        it('permite superavit hasta 115% en modo ganancia muscular antes de marcar exceso', async () => {
            fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 2240, protein: 150, carbs: 220, fats: 65 } }) }); // 112%
            render(<TrackingProgress userId="u-muscle" planData={deficitPlan} referenceProfile={{ mainGoal: 'gain_muscle' }} />);
            await screen.findByText('0 comidas registradas');

            const calTrack = screen.getByRole('progressbar', { name: 'Calorías' });
            expect(calTrack.firstElementChild.dataset.state).toBe('done');
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
        expect(Boolean(screen.queryByText(/sobre el máximo recomendado/))).toBe(sodium > 2000);
        expect(screen.getByRole('progressbar', { name: 'Sodio' }).firstElementChild.className.includes('over')).toBe(sodium > 2000);
        for (const name of ['Vitamina A', 'Vitamina D']) {
            expect(screen.getByRole('progressbar', { name }).firstElementChild.className).toContain('done');
            expect(screen.getByRole('progressbar', { name }).firstElementChild.className).not.toContain('over');
        }
    });
});
