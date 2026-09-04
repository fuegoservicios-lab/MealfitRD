// [P1-EAT-PLAN-MEAL-TRUTH · 2026-09-04] «Me lo comí» pregunta cuando algo no cuadra (hora o Nevera)
// y registra directo cuando todo cuadra. Aquí: las reglas puras (ventanas, cobertura), la hoja y el
// cableado del Dashboard (vista previa → hoja → confirmación con days_ago / desvío → composedor).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mealTimingIssue, pantryCoverageIssue, normalizeSlot, MEAL_WINDOWS } from '../config/mealWindows';

vi.mock('../hooks/useModalAccessibility', () => ({ useModalAccessibility: () => ({ containerRef: { current: null } }) }));
vi.mock('../i18n', () => ({ useT: () => (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k])) : s) }));

const at = (h, m = 0) => { const d = new Date(2026, 8, 4, h, m); return d; };

describe('ventanas por slot', () => {
    it('almuerzo a las 9:04 es demasiado temprano; a las 12 no; desayuno a las 15 (tarde) no pregunta', () => {
        expect(mealTimingIssue('Almuerzo', at(9, 4))).toEqual({ slot: 'almuerzo', start: MEAL_WINDOWS.almuerzo.start });
        expect(mealTimingIssue('Almuerzo', at(12))).toBeNull();
        expect(mealTimingIssue('Desayuno', at(15))).toBeNull();
        expect(mealTimingIssue('Cena', at(16))).toEqual({ slot: 'cena', start: 17 });
        expect(mealTimingIssue('Merienda', at(14))).toBeNull();
    });
    it('normaliza los identificadores del motor y los slots en inglés; desconocido ⇒ sin pregunta', () => {
        expect(normalizeSlot('DESAYUNO')).toBe('desayuno');
        expect(normalizeSlot('lunch')).toBe('almuerzo');
        expect(normalizeSlot('Meriendas')).toBe('merienda');
        expect(mealTimingIssue('Postre', at(3))).toBeNull();
    });
});

describe('cobertura de la Nevera', () => {
    it('pregunta por debajo del 50 %; no pregunta si cubre o si no hay vista previa', () => {
        expect(pantryCoverageIssue({ total: 6, present: [], coverage: 0 })).toEqual({ present: 0, total: 6 });
        expect(pantryCoverageIssue({ total: 6, present: ['a', 'b'], coverage: 2 / 6 })).toEqual({ present: 2, total: 6 });
        expect(pantryCoverageIssue({ total: 6, present: ['a', 'b', 'c'], coverage: 0.5 })).toBeNull();
        expect(pantryCoverageIssue({ total: 0, present: [] })).toBeNull();
        expect(pantryCoverageIssue(null)).toBeNull();
    });
});

describe('EatPlanMealSheet', () => {
    it('con hora rara y Nevera vacía ofrece «ahora», «otra cosa» y «todavía no» — nunca «fue ayer»', async () => {
        const { default: Sheet } = await import('../components/dashboard/EatPlanMealSheet');
        const onConfirm = vi.fn(); const onAteOther = vi.fn(); const onNotYet = vi.fn();
        render(<Sheet mealName="Tortitas de calamar" timing={{ slot: 'almuerzo', start: 11 }} coverage={{ present: 0, total: 6 }} now={at(9, 4)}
            onConfirm={onConfirm} onAteOther={onAteOther} onNotYet={onNotYet} onClose={() => {}} />);
        expect(screen.getByRole('dialog').textContent).toContain('Son las 09:04 y esto es un almuerzo.');
        expect(screen.getByRole('dialog').textContent).toContain('Tu Nevera tiene 0 de 6 ingredientes');
        // el plato es el de HOY (el botón solo vive en esa pestaña): «ayer» sería mentirle al diario
        expect(screen.queryByText('Fue ayer')).toBeNull();
        // cada acción bloquea los botones mientras corre (pending): esperar a que suelte
        await act(async () => { fireEvent.click(screen.getByText('Lo comí ahora')); });
        expect(onConfirm).toHaveBeenCalledWith({ daysAgo: 0 });
        await act(async () => { fireEvent.click(screen.getByText('Comí otra cosa')); });
        expect(onAteOther).toHaveBeenCalled();
        await act(async () => { fireEvent.click(screen.getByText('Todavía no lo comí')); });
        expect(onNotYet).toHaveBeenCalled();
    });
    it('solo con hora rara: «lo comí ahora» y «todavía no», sin «otra cosa»', async () => {
        const { default: Sheet } = await import('../components/dashboard/EatPlanMealSheet');
        render(<Sheet mealName="X" timing={{ slot: 'cena', start: 17 }} coverage={null} now={at(10, 27)} onConfirm={() => {}} onAteOther={() => {}} onNotYet={() => {}} onClose={() => {}} />);
        expect(screen.getByText('Lo comí ahora')).toBeTruthy();
        expect(screen.getByText('Todavía no lo comí')).toBeTruthy();
        expect(screen.queryByText('Comí otra cosa')).toBeNull();
    });
    it('solo con Nevera vacía, el botón principal dice «lo cociné igual»', async () => {
        const { default: Sheet } = await import('../components/dashboard/EatPlanMealSheet');
        render(<Sheet mealName="X" timing={null} coverage={{ present: 1, total: 5 }} onConfirm={() => {}} onAteOther={() => {}} onNotYet={() => {}} onClose={() => {}} />);
        expect(screen.getByText('Lo cociné igual, regístralo')).toBeTruthy();
        expect(screen.getByText('Comí otra cosa')).toBeTruthy();
    });
});

describe('Dashboard: cableado', () => {
    const DASH = readFileSync(resolve(process.cwd(), 'src/pages/Dashboard.jsx'), 'utf8').split(String.fromCharCode(13)).join('');
    it('vista previa antes de registrar, hoja cuando algo no cuadra, days_ago en la confirmación y desvío con composedor', () => {
        expect(DASH).toContain("fetchWithAuth('/api/diary/consumed-from-plan/preview'");
        expect(DASH).toContain('const timing = mealTimingIssue(meal?.meal);');
        expect(DASH).toContain('coverage = pantryCoverageIssue(preview);');
        expect(DASH).toContain('if (timing || coverage) {');
        expect(DASH).toContain('days_ago: daysAgo,');
        expect(DASH).toContain("fetchWithAuth('/api/diary/plan-meal-deviation'");
        expect(DASH).toContain("if (reason === 'ate_other') {");
        expect(DASH).toContain('{logMealOpen && <LogMealModal onClose={() => setLogMealOpen(false)} />}');
        // sin vista previa (red caída) se registra como siempre: el catch deja coverage=null
        expect(DASH).toContain('coverage = null; // sin vista previa no se pregunta');
    });
});
