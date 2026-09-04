// [P1-ARQ25-F4-FORM · 2026-09-03] Fase 4 del roadmap 2.5: formulario progresivo y UX de explicación.
// Parser sobre el wizard (los pasos nuevos, su obligatoriedad y el knob) + render real del panel
// «solicitaste / aplicamos / por qué» y de la telemetría del embudo.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const FLOW = read('src/components/assessment/InteractiveAssessmentFlow.jsx');
const CTX = read('src/context/AssessmentContext.jsx');
const VALID = read('src/config/formValidation.js');
const STAPLES = read('src/components/assessment/questions/QStapleFoods.jsx');
const DASH = read('src/pages/Dashboard.jsx');

describe('wizard: preguntas §6.7 detrás del knob', () => {
    it('la pregunta 1 es obligatoria, va antes de «Mis básicos» y las 4-6 son opcionales tras el ciclo', () => {
        expect(FLOW).toContain("import { QMealOrganization } from './questions/QMealOrganization';");
        expect(FLOW).toContain("import { QShoppingHabits } from './questions/QShoppingHabits';");
        const org = FLOW.indexOf("fields: ['mealOrganization'],");
        const staples = FLOW.indexOf("title: t('Tus básicos de siempre (Opcional)')");
        const cycle = FLOW.indexOf("fields: ['groceryDuration'],");
        const habits = FLOW.indexOf('<QShoppingHabits onManualAdvance={nextStep} />');
        expect(org).toBeGreaterThan(0);
        expect(org).toBeLessThan(staples);
        expect(cycle).toBeLessThan(habits);
        expect(FLOW.slice(habits - 400, habits)).toContain('hasInternalNext: true,');
        expect(FLOW.slice(habits - 400, habits)).not.toContain('fields:');
        expect(FLOW.split('...(PLAN_POLICY_FORM_UI ? [{').length - 1).toBe(2);
    });
    it('los campos nuevos nacen VACÍOS en initialFormData (nada sembrado) y persisten con el resto', () => {
        expect(CTX).toContain("mealOrganization: '', stapleAnchors: [], freshTopup: '', freezerMode: '', batchCooking: '',");
    });
    it('mealOrganization es obligatoria solo con el knob y tiene etiqueta para el salto', () => {
        expect(VALID).toContain("...(PLAN_POLICY_FORM_UI ? ['mealOrganization'] : []),");
        expect(VALID).toContain("mealOrganization: 'Cómo organizas tus comidas (rutina, equilibrio o exploración)',");
        expect(VALID).toContain("mealOrganization: t('Cómo organizas tus comidas (rutina, equilibrio o exploración)'),");
    });
    it('«Mis básicos» edita anclas y quitar un básico quita su ancla', () => {
        expect(STAPLES).toContain("updateData('stapleAnchors', next);");
        expect(STAPLES).toContain("if (anchors.some((a) => a && a.name === name)) updateData('stapleAnchors', anchors.filter((a) => a && a.name !== name));");
        expect(STAPLES).toContain('role="radiogroup"');
        expect(STAPLES).toContain('{PLAN_POLICY_FORM_UI && editing && staples.includes(editing) && anchorEditor(editing)}');
    });
    it('el embudo emite inicio/restauración una vez, un step_view por paso, submit y flush al ocultar', () => {
        expect(FLOW).toContain("trackWizard(currentStep > 0 ? 'wizard_restore' : 'wizard_start', meta);");
        expect(FLOW).toContain("trackWizard('step_view', meta);");
        expect(FLOW).toContain("trackWizard('wizard_submit', {");
        expect(FLOW).toContain("window.addEventListener('pagehide', onHide);");
    });
    it('el Dashboard monta el panel solo con política y knob', () => {
        expect(DASH).toContain('{PLAN_POLICY_FORM_UI && planData?._plan_policy && (');
        expect(DASH).toContain('fidelity={planData._fidelity_report}');
    });
});

describe('PlanPolicyPanel', () => {
    const policy = {
        requested: {
            recurrence: { global_mode: 'routine' },
            shopping: { main_cycle_days: 15, fresh_topup_days: 7, freezer_mode: 'limited', batch_cooking: 'sometimes' },
            food_anchors: [{ ingredient_id: 'huevo', name: 'Huevo', slots: ['breakfast'], min_per_7d: 7, max_per_7d: 7, preparation_mode: 'same_preparation' }],
        },
        effective: {
            recurrence: { global_mode: 'routine' },
            shopping: { main_cycle_days: 15, fresh_topup_days: 7, freezer_mode: 'limited', batch_cooking: 'sometimes' },
            food_anchors: [{ ingredient_id: 'huevo', name: 'Huevo', slots: ['breakfast'], min_per_7d: 5, max_per_7d: 7, preparation_mode: 'same_preparation' }],
        },
        relaxations: [
            { field: 'food_anchors.huevo.min_per_7d', requested: 7, applied: 5, reason_code: 'recurrence_clamped', rank: 5 },
            { field: 'budget.amount', requested: 3000, applied: 3000, reason_code: 'budget_below_floor', rank: 4, action: 'waiting_user', evidence: { amount_dop: 3000, floor_dop: 4200 } },
        ],
    };
    let PlanPolicyPanel;
    beforeEach(async () => {
        ({ default: PlanPolicyPanel } = await import('../components/dashboard/PlanPolicyPanel'));
    });
    it('sin política efectiva no pinta nada', () => {
        const { container } = render(<PlanPolicyPanel policy={{ requested: {}, effective: {} }} />);
        expect(container.firstChild).toBeNull();
    });
    it('en shadow dice «lo que pediste»; en enforce, «sigue tu política»', () => {
        const { rerender } = render(<PlanPolicyPanel policy={policy} fidelity={{ mode: 'shadow' }} />);
        expect(screen.getByText('Lo que pediste para tu plan')).toBeTruthy();
        rerender(<PlanPolicyPanel policy={policy} fidelity={{ mode: 'enforce' }} />);
        expect(screen.getByText('Tu plan sigue tu política')).toBeTruthy();
    });
    it('la relajación waiting_user es un aviso con CTA; el detalle muestra solicitado vs aplicado y los motivos', () => {
        const onEdit = vi.fn();
        render(<PlanPolicyPanel policy={policy} fidelity={{ mode: 'enforce' }} onEdit={onEdit} />);
        expect(screen.getByRole('alert').textContent).toContain('Necesitamos tu decisión');
        expect(screen.getByRole('alert').textContent).toContain('4,200');
        fireEvent.click(screen.getByText('Ajustar en el formulario'));
        expect(onEdit).toHaveBeenCalledWith('budget.amount');
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        expect(screen.getByText('Huevo')).toBeTruthy();
        expect(screen.getByText('Solicitaste 7-7; aplicamos 5-7.')).toBeTruthy();
        expect(screen.getByText('La frecuencia pedida se ajustó al rango posible (0–7 por semana).')).toBeTruthy();
        expect(screen.getByText('2 ajustes')).toBeTruthy();
    });
});

describe('wizardTelemetry', () => {
    it('encola, respeta el opt-out y envía en lote con el sid', async () => {
        vi.resetModules();
        const fetchWithAuth = vi.fn(() => Promise.resolve({ ok: true }));
        vi.doMock('../config/api', () => ({ fetchWithAuth }));
        vi.doMock('../utils/analytics', () => ({ isAnalyticsOptedOut: () => false }));
        const mod = await import('../utils/wizardTelemetry');
        mod._resetWizardTelemetryForTests();
        expect(mod.trackWizard('wizard_start', { index: 0 })).toBe(true);
        expect(mod._wizardTelemetryQueueForTests()).toHaveLength(1);
        expect(mod.flushWizardTelemetry()).toBe(true);
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        const [url, opts] = fetchWithAuth.mock.calls[0];
        expect(url).toBe('/api/plans/telemetry/wizard');
        const body = JSON.parse(opts.body);
        expect(body.sid).toBeTruthy();
        expect(body.events[0].event).toBe('wizard_start');
        expect(opts.keepalive).toBe(true);
        expect(mod.flushWizardTelemetry()).toBe(false);
        vi.doUnmock('../config/api');
        vi.doUnmock('../utils/analytics');
    });
    it('con opt-out no encola nada', async () => {
        vi.resetModules();
        vi.doMock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
        vi.doMock('../utils/analytics', () => ({ isAnalyticsOptedOut: () => true }));
        const mod = await import('../utils/wizardTelemetry');
        mod._resetWizardTelemetryForTests();
        expect(mod.trackWizard('step_view', { index: 1 })).toBe(false);
        expect(mod._wizardTelemetryQueueForTests()).toHaveLength(0);
        vi.doUnmock('../config/api');
        vi.doUnmock('../utils/analytics');
    });
});
