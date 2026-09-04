// [P2-REVIEW-ISSUES-CLARO · 2026-09-02] Las observaciones del plan se leen cortas, con el plato
// señalado, en el idioma del usuario, y en UN solo aviso.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { glossReviewIssue, CLAVES_REVIEW_ISSUE } from '../utils/clinicalNoteGloss.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
const es = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k])) : s);

describe('glossReviewIssue', () => {
    it('en español deja el texto igual (prefijo Día N, slot + copy)', () => {
        const txt = 'Día 2, almuerzo: el plato es más de otro momento del día. Si no te convence, cámbialo con «Cambiar Plato».';
        expect(glossReviewIssue(txt, es)).toBe(txt);
    });
    it('traduce el copy y compone el prefijo con claves propias', () => {
        const en = (s, vars) => {
            const map = {
                'el plato es más de otro momento del día. Si no te convence, cámbialo con «Cambiar Plato».': 'that dish belongs to another time of day.',
                'Día {n}': 'Day {n}', 'Almuerzo': 'Lunch', '{dia}, {slot}: ': '{dia}, {slot}: ',
            };
            return es(map[s] || s, vars);
        };
        const txt = 'Día 2, almuerzo: el plato es más de otro momento del día. Si no te convence, cámbialo con «Cambiar Plato».';
        expect(glossReviewIssue(txt, en)).toBe('Day 2, lunch: that dish belongs to another time of day.');
    });
    it('desconocido queda tal cual; fail-soft sin t', () => {
        expect(glossReviewIssue('ALGO NUEVO: detalle.', es)).toBe('ALGO NUEVO: detalle.');
        expect(glossReviewIssue('x', null)).toBe('x');
    });
    // [P1-ARQ25-F4-FORM · 2026-09-04] El backend es un repo hermano: en el CI del frontend no existe.
    // Igual que los tests del backend que leen el frontend, se salta (no falla) sin el hermano.
    it.skipIf(!existsSync(resolve(process.cwd(), '../backend/graph_orchestrator.py')))('todas las copies del backend están en la lista de glosa', () => {
        const go = read('../backend/graph_orchestrator.py');
        const missing = CLAVES_REVIEW_ISSUE.filter((c) => !go.includes(c));
        expect(missing).toEqual([]);
    });
});

describe('avisos del plan', () => {
    it('Plan.jsx: un solo aviso con el título del banner y la primera observación glosada', () => {
        const src = read('src/pages/Plan.jsx');
        expect(src).not.toContain('t("Plan generado con observaciones")');
        expect(src).toContain("toast.warning(t('Tu plan está listo, con un detalle por revisar')");
        expect(src).toContain('glossReviewIssue(_list[0], t)');
        expect(src).toContain("sessionStorage.setItem('mealfit_plan_ready_toast_at'");
    });
    it('PendingPipelineRecovery: sin toast «se está generando» en /plan y sin «listo» duplicado', () => {
        const src = read('src/components/PendingPipelineRecovery.jsx');
        expect(src).not.toContain("toast.info(t('Tu plan se está generando')");
        expect(src.match(/if \(!_planToastJustShown\(\)\) toast\.success/g)).toHaveLength(2);
    });
});
