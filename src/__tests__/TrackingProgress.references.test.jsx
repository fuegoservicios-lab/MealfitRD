import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import TrackingProgress from '../components/dashboard/TrackingProgress';
import MicrosList from '../components/dashboard/MicrosList';
import { macroReferences } from '../utils/macroReferences';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../hooks/useNumeroAnimado', () => ({ useNumeroAnimado: value => value }));
vi.mock('../components/dashboard/ScanMealModal', () => ({ default: () => null }));

const plan = { calories: 2900, macros: { protein: 150, carbs: 394, fats: 81 } };
const profile = { age: 30, medicalConditions: ['Ninguna'] };

describe('General macro references, separate from personal goals', () => {
    beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
    it('derives gram references from energy rather than an arbitrary 140% goal multiplier', () => {
        const refs = macroReferences(plan, profile);
        expect(refs.protein).toBeCloseTo(253.75);
        expect(refs.carbs).toBeCloseTo(471.25);
        expect(refs.fats).toBeCloseTo(112.7778);
        expect(macroReferences({ ...plan, macros: { ...plan.macros, fats: 90 } }, profile).fats)
            .toBe(macroReferences(plan, profile).fats);
    });
    it.each([null, { age: 18 }, { age: 0 }, { age: 101 }, { age: 30, medicalConditions: ['Enfermedad Renal'] },
        { age: 30, medicalConditions: 'Embarazo' }, { age: 30, otherConditions: 'Pauta clínica' }, { age: 30, medications: ['Warfarina'] }])('omits general markers with an unsuitable or unknown profile (%j)', value => {
        expect(macroReferences(plan, value)).toEqual({});
    });
    it('does not invent references for missing targets or place a generic ceiling below a specialized goal', () => {
        expect(macroReferences({}, profile)).toEqual({});
        expect(macroReferences({ ...plan, macros: { fats: 140 } }, profile)).toEqual({});
    });
    it.each([82, 113, 250, 0])('shows the remaining distance, accurate geometry and real percentage at %i g fat', async fats => {
        fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 2850, protein: 130, carbs: 397, fats } }) });
        render(<TrackingProgress userId="references" planData={plan} referenceProfile={profile} />);
        await screen.findByText('0 comidas registradas');
        const track = screen.getByRole('progressbar', { name: 'Grasas' });
        const row = track.parentElement;
        expect(within(row).getByText('Referencia general 139%')).toBeInTheDocument();
        expect(within(row).getByText('Meta 100%')).toBeInTheDocument();
        const scale = Number(track.getAttribute('aria-valuemax'));
        expect(scale).toBeCloseTo((2900 * .35 / 9) / 81 * 100 * 1.08);
        expect(parseFloat(track.firstElementChild.style.width)).toBeCloseTo(Math.min(100, Math.round(fats / 81 * 100) / scale * 100));
        expect(track.getAttribute('aria-valuetext')).toContain(`${Math.round(fats / 81 * 100)}%`);
        expect(track.getAttribute('aria-valuetext')).toContain(fats > 2900 * .35 / 9 ? 'sobre la referencia' : 'de la referencia');
        expect(track.firstElementChild.style.background).toContain('rgb(236, 72, 153)');
        expect(track.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
        expect(within(row).queryByText(/peligro|seguro|límite de salud/i)).not.toBeInTheDocument();
    });
    it('shows the personal goal distance without a reference when the profile is unknown', async () => {
        fetchWithAuth.mockResolvedValue({ json: async () => ({ totals: { calories: 2500, protein: 130, carbs: 397, fats: 82 } }) });
        render(<TrackingProgress userId="unknown-profile" planData={plan} />);
        await screen.findByText('0 comidas registradas');
        const row = screen.getByRole('progressbar', { name: 'Grasas' }).parentElement;
        expect(within(row).getByText('1 g sobre la meta')).toBeInTheDocument();
        expect(within(row).queryByText(/Referencia general/)).not.toBeInTheDocument();
    });
    it('shows a sodium maximum distance only with actual data and a supplied ceiling', () => {
        const { rerender } = render(<MicrosList micros={{ sodium_mg: 1103 }} coverage={{ con_datos: 1, total: 2 }}
            metas={{ sodium_mg: { kind: 'ceiling', target: 2000 } }} />);
        expect(screen.getByText('A 897 mg del máximo recomendado')).toBeInTheDocument();
        rerender(<MicrosList micros={null} coverage={{ con_datos: 0, total: 2 }} metas={{ sodium_mg: { kind: 'ceiling', target: 2000 } }} />);
        expect(screen.queryByText(/del máximo recomendado/)).not.toBeInTheDocument();
    });
});
