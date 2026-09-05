// [P1-ARQ25-F7-CULTURE · 2026-09-05] Fase 7 (subfase B): «Cocinas que te representan».
// La cocina va SEPARADA del país de compra (I16): el paso sugiere la cocina del país, no la siembra;
// una principal + hasta dos secundarias con intensidad; el panel de política resume la mezcla.
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as assessmentModule from '../context/AssessmentContext';
import { QCulture } from '../components/assessment/questions/QCulture';
import {
    CULTURES, cultureForCountry, normalizeCultureProfiles, cultureWeightsSummary, MAX_SECONDARY_CULTURES,
} from '../config/cultures';

vi.mock('../authClient', () => ({
    authClient: {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
            getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
            signOut: vi.fn().mockResolvedValue({ error: null }),
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const FLOW = read('src/components/assessment/InteractiveAssessmentFlow.jsx');
const CTX = read('src/context/AssessmentContext.jsx');
const VALID = read('src/config/formValidation.js');
const PANEL = read('src/components/dashboard/PlanPolicyPanel.jsx');

function Harness({ country, initial, onUpdate }) {
    const [cp, setCp] = useState(initial);
    vi.spyOn(assessmentModule, 'useAssessment').mockReturnValue({
        formData: { country, cultureProfiles: cp },
        updateData: (key, value) => {
            onUpdate?.(key, value);
            if (key === 'cultureProfiles') setCp(value);
        },
    });
    return <QCulture onManualAdvance={() => {}} />;
}

const checkedMain = (container) => container.querySelector('input[name="cultureMain"]:checked')?.value ?? null;

beforeEach(() => { vi.restoreAllMocks(); });

describe('wizard: el paso va detrás del país y no siembra nada', () => {
    it('se importa, va justo después de QCountry, es opcional (Siguiente interno) y está detrás de los dos knobs', () => {
        expect(FLOW).toContain("import { QCulture } from './questions/QCulture';");
        expect(FLOW).toContain("import { CULTURE_PROFILES_UI } from '../../config/cultures';");
        const country = FLOW.indexOf('<QCountry onAutoAdvance={handleAutoAdvance} />');
        const culture = FLOW.indexOf('<QCulture onManualAdvance={nextStep} />');
        const cycle = FLOW.indexOf("fields: ['groceryDuration'],");
        expect(country).toBeGreaterThan(0);
        expect(culture).toBeGreaterThan(country);
        expect(culture).toBeLessThan(cycle);
        const block = FLOW.slice(culture - 700, culture);
        expect(block).toContain('...(COUNTRY_SYSTEM_UI && CULTURE_PROFILES_UI ? [{');
        expect(block).toContain('hasInternalNext: true,');
        expect(block).not.toContain('fields:');
    });
    it('el campo nace null en initialFormData y tiene etiqueta traducible', () => {
        expect(CTX).toContain('cultureProfiles: null,');
        expect(VALID).toContain("cultureProfiles: 'Cocinas que te representan',");
        expect(VALID).toContain("cultureProfiles: t('Cocinas que te representan'),");
    });
    it('el panel «solicitaste / aplicamos» resume la mezcla y distingue la sugerida', () => {
        expect(PANEL).toContain('cultureWeightsSummary(t, effective.culture_weights)');
        expect(PANEL).toContain("t('Cocina: {resumen} (la de tu país de compra)', { resumen: cultureText })");
        expect(PANEL).toContain("t('Cocina: {resumen}', { resumen: cultureText })");
    });
});

describe('QCulture: sugerencia visible, elección explícita', () => {
    it('sin elección marca la cocina del país de compra como sugerida y NO escribe el campo', () => {
        const updates = [];
        const { container, getByText } = render(<Harness country="US" initial={null} onUpdate={(k, v) => updates.push([k, v])} />);
        expect(checkedMain(container)).toBe('us_everyday');
        expect(cultureForCountry('US')).toBe('us_everyday');
        expect(getByText(/Sugerida por tu país de compra/)).toBeTruthy();
        expect(updates).toEqual([]);
    });
    it('tocar otra principal escribe {main, secondary: []}', () => {
        const updates = [];
        const { container } = render(<Harness country="US" initial={null} onUpdate={(k, v) => updates.push([k, v])} />);
        fireEvent.click(container.querySelector('input[name="cultureMain"][value="dominican_criolla"]'));
        expect(updates.at(-1)).toEqual(['cultureProfiles', { main: 'dominican_criolla', secondary: [] }]);
        expect(checkedMain(container)).toBe('dominican_criolla');
    });
    it('las secundarias llevan intensidad, se topan en dos y la principal nunca se repite', () => {
        const updates = [];
        const initial = { main: 'dominican_criolla', secondary: [{ profile_id: 'us_everyday', intensity: 'frecuente' }] };
        const { container, getAllByRole, getByText } = render(<Harness country="US" initial={initial} onUpdate={(k, v) => updates.push([k, v])} />);
        // pill de intensidad
        fireEvent.click(getByText(/Predominante/));
        expect(updates.at(-1)[1].secondary[0]).toEqual({ profile_id: 'us_everyday', intensity: 'predominante' });
        // segunda secundaria
        // el chip (role=button), no la tarjeta principal que comparte el mismo texto
        fireEvent.click(getAllByRole('button').find((b) => b.textContent === 'Cocina española'));
        expect(updates.at(-1)[1].secondary.map((s) => s.profile_id)).toEqual(['us_everyday', 'spain_mediterranea']);
        // la tercera queda deshabilitada
        const chips = getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null);
        const disabled = chips.filter((b) => b.getAttribute('aria-disabled') === 'true');
        expect(disabled.length).toBe(CULTURES.length - 1 - MAX_SECONDARY_CULTURES);
        expect(container.querySelector('input[name="cultureMain"][value="dominican_criolla"]').checked).toBe(true);
        // volver a la sugerencia limpia el campo
        fireEvent.click(getByText('Volver a la sugerencia de mi país'));
        expect(updates.at(-1)).toEqual(['cultureProfiles', null]);
    });
});

describe('config/cultures: normalización y resumen', () => {
    it('normalizeCultureProfiles tira basura, duplicados y el exceso', () => {
        expect(normalizeCultureProfiles(null)).toBeNull();
        expect(normalizeCultureProfiles({ main: 'marte' })).toBeNull();
        expect(normalizeCultureProfiles({
            main: 'us_everyday',
            secondary: [{ profile_id: 'us_everyday' }, { profile_id: 'mexico_casera', intensity: 'x' }, { profile_id: 'mexico_casera' },
                { profile_id: 'colombia_casera', intensity: 'ocasional' }, { profile_id: 'spain_mediterranea' }],
        })).toEqual({ main: 'us_everyday', secondary: [{ profile_id: 'mexico_casera', intensity: 'frecuente' }, { profile_id: 'colombia_casera', intensity: 'ocasional' }] });
    });
    it('cultureWeightsSummary nombra la mezcla con porcentajes y una sola cocina sin ellos', () => {
        const t = (s) => s;
        expect(cultureWeightsSummary(t, [{ profile_id: 'dominican_criolla', weight: 0.7 }, { profile_id: 'spain_mediterranea', weight: 0.3 }]))
            .toBe('Cocina dominicana 70 % · Cocina española 30 %');
        expect(cultureWeightsSummary(t, [{ profile_id: 'mexico_casera', weight: 1 }])).toBe('Cocina mexicana');
        expect(cultureWeightsSummary(t, [])).toBe('');
    });
});
