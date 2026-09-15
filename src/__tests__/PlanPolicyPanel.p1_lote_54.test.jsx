/**
 * [P1-PLAN-LOTE-54 · 2026-09-15] El panel «solicitaste / aplicamos / por qué» dice cuándo el plan pasa del tiempo de
 * cocina que marcaste. El dato ya lo medía el revisor (`_fidelity_report.issues`, `prep_time_over_budget`), pero el
 * panel sólo leía el `mode`. En las 5 pruebas del dueño con «Nada» (unos 10 min) salían de 6 a 10 comidas por plan de
 * hasta 70 min y la pantalla no lo decía.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../i18n', () => ({
    useT: () => (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v?.[k] ?? '')),
    i18nKey: (s) => s,
    t: (s) => s,
    formatNumber: (n) => String(n),
}));

import PlanPolicyPanel from '../components/dashboard/PlanPolicyPanel';
import { prepTimeFact, PREP_TIME_ISSUES_CAP } from '../config/planPolicy';

const POLICY = {
    effective: {
        recurrence: { global_mode: 'routine' },
        shopping: { main_cycle_days: 7, fresh_topup_days: null, freezer_mode: 'none', batch_cooking: 'never' },
        food_anchors: [],
    },
    requested: { food_anchors: [] },
    relaxations: [],
};
const tarde = (day, meal, minutes) => ({ code: 'prep_time_over_budget', severity: 'low', day, meal, minutes, budget: 10 });
const read = (p) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

const abrir = (fidelity) => {
    const r = render(<PlanPolicyPanel policy={POLICY} fidelity={fidelity} onEdit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    return r.container;
};

describe('[P1-PLAN-LOTE-54] el panel dice el tiempo de cocina', () => {
    it('siete comidas sobre el tiempo (el plan a059d7bb): un ajuste, con la cifra real y el botón que lo arregla', () => {
        const issues = [tarde(1, 'Almuerzo', 30), tarde(1, 'Cena', 15), tarde(2, 'Almuerzo', 30), tarde(2, 'Cena', 30),
            tarde(3, 'Almuerzo', 25), tarde(3, 'Cena', 20), tarde(3, 'Desayuno', 15)];
        const { container } = render(<PlanPolicyPanel policy={POLICY} fidelity={{ mode: 'enforce', issues }} onEdit={() => {}} />);
        expect(container.textContent).toContain('1 ajuste');
        expect(container.textContent).not.toContain('1 ajustes');
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        expect(container.textContent).toContain('Tiempo de cocina');
        expect(container.textContent).toContain('(unos 10 min por comida), 7 de las comidas revisadas piden más: hasta 30 min');
        expect(container.textContent).toContain('“Cambiar Plato”');
    });

    it('con el tope del backend dice «al menos»', () => {
        const issues = Array.from({ length: PREP_TIME_ISSUES_CAP }, (_, i) => tarde(1 + (i % 3), 'Cena', 40 + i));
        expect(abrir({ mode: 'enforce', issues }).textContent)
            .toContain(`al menos ${PREP_TIME_ISSUES_CAP} de las comidas revisadas piden más: hasta 49 min`);
    });

    it('una sola comida, en singular', () => {
        expect(abrir({ mode: 'shadow', issues: [tarde(2, 'Cena', 45)] }).textContent)
            .toContain('una de las comidas revisadas pide más: 45 min');
    });

    it('sin tiempo medido no hay motivo ni ajuste', () => {
        const { container } = render(<PlanPolicyPanel policy={POLICY} fidelity={{ mode: 'enforce', issues: [] }} onEdit={() => {}} />);
        expect(container.textContent).not.toMatch(/ajuste/);
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        expect(container.textContent).not.toContain('Tiempo de cocina');
    });

    it('sólo cuenta el código del tiempo, con minutos y presupuesto de verdad', () => {
        expect(prepTimeFact(null)).toBeNull();
        expect(prepTimeFact({ issues: [{ code: 'exact_repeat_exceeded', severity: 'low' }] })).toBeNull();
        expect(prepTimeFact({ issues: [{ code: 'prep_time_over_budget', minutes: 'x', budget: 10 }] })).toBeNull();
        expect(prepTimeFact({ issues: [{ code: 'prep_time_over_budget', minutes: 30 }] })).toBeNull();
        expect(prepTimeFact({ issues: [tarde(1, 'Cena', 30), tarde(2, 'Cena', 65)] }))
            .toEqual({ n: 2, capped: false, max: 65, budget: 10 });
    });

    it('las cadenas nuevas están en los cuatro catálogos', () => {
        const claves = ['Tiempo de cocina', '1 ajuste'];
        for (const loc of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            for (const k of claves) expect(cat[k], `${loc}: ${k}`).toBeTruthy();
            const tiempo = Object.keys(cat).filter((k) => k.startsWith('Con el tiempo que marcaste'));
            expect(tiempo, loc).toHaveLength(3);
        }
    });
});
