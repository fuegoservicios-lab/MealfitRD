// [P1-PLAN-LOTE-430 · 2026-09-27] «Tu meta de peso» solo se pregunta cuando se usa: perder grasa o ganar músculo.
//
// Auditoría formulario→backend (otra sesión), verificada: con objetivo «mantenimiento» o «rendimiento» el paso pedía un
// peso («¿En qué peso te quieres mantener?», «¿Peso objetivo para rendir mejor?») que NADIE usa — el backend solo lo
// lee para el plazo estimado de perder/ganar (nutrition_calculator: `targetWeight` solo con lose_fat/gain_muscle) y
// ninguna pantalla lo muestra. Una pregunta que no cambia nada es fricción: el paso sale del formulario en esos dos
// objetivos, en el plan y en el contador. El backend ya tolera su ausencia (valida `targetWeight` solo si llega).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from './utils/test-utils';
import InteractiveAssessmentFlow from '../components/assessment/InteractiveAssessmentFlow';
import { metaDePesoAplica } from '../utils/metaDePeso';

const _api = vi.hoisted(() => ({ fetchWithAuth: vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })) }));
vi.mock('../config/api', async (importOriginal) => ({ ...(await importOriginal()), fetchWithAuth: _api.fetchWithAuth }));

const FORM = {
    gender: 'male', age: '34', height: '172', weight: '180', weightUnit: 'lb', activityLevel: 'moderate',
    dietType: 'balanced', allergies: ['Ninguna'], medicalConditions: ['Ninguna'], country: 'DO',
};

const montar = (formData, planMode) => render(<InteractiveAssessmentFlow />, {
    customContext: {
        currentStep: 0, maxReachedStep: 0, planData: null, formData,
        setCurrentStep: vi.fn(), setMaxReachedStep: vi.fn(), nextStep: vi.fn(), prevStep: vi.fn(),
        updateData: vi.fn(), resetApp: vi.fn(), exitGuestSession: vi.fn(),
        loadingSensitive: false, isGuest: false,
        userProfile: { plan_mode: planMode, health_profile: { gender: 'male' } },
    },
});
const totalDePasos = () => Number(/de (\d+)$/.exec(screen.getByText(/^Paso \d+ de \d+$/).textContent)[1]);

beforeEach(() => {
    localStorage.removeItem('mealfit_wizard_step_mode');
});

describe('[430] la meta de peso solo cuando se usa', () => {
    it('la regla: perder grasa y ganar músculo la usan; mantenimiento y rendimiento no; sin objetivo aún, se pregunta', () => {
        expect(metaDePesoAplica('lose_fat')).toBe(true);
        expect(metaDePesoAplica('gain_muscle')).toBe(true);
        expect(metaDePesoAplica('maintenance')).toBe(false);
        expect(metaDePesoAplica('performance')).toBe(false);
        expect(metaDePesoAplica(undefined)).toBe(true);
    });

    for (const [rama, appMode, planMode] of [['plan', 'plan', 'plan'], ['contador', 'tracking', 'tracking']]) {
        it(`en el ${rama}: con mantenimiento o rendimiento el formulario tiene un paso menos`, () => {
            const conMeta = montar({ ...FORM, appMode, mainGoal: 'lose_fat' }, planMode);
            const total = totalDePasos();
            conMeta.unmount();
            for (const mainGoal of ['maintenance', 'performance']) {
                const r = montar({ ...FORM, appMode, mainGoal }, planMode);
                expect(totalDePasos(), mainGoal).toBe(total - 1);
                r.unmount();
            }
        });
    }
});
