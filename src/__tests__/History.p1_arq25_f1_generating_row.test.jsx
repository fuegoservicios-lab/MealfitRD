/**
 * [P1-ARQ25-F1-CLOSE · 2026-09-02] El placeholder de la cola se ve como «Generando» en el
 * Historial: spinner en el emblema, etiqueta junto al nombre, y sin renombrar ni borrar
 * mientras corre (borrarlo cancelaría la generación en marcha).
 *
 * Vivo: «Plan en preparación · 7:43 a.m.» salía como una fila más, con papelera, y el
 * plan anterior seguía como «PLAN ACTIVO» sin explicación.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const desktop = fs.readFileSync(path.resolve(_dir, '../components/history/HistoryDesktopPanel.jsx'), 'utf8');
const mobile = fs.readFileSync(path.resolve(_dir, '../components/history/HistoryMobilePanel.jsx'), 'utf8');

const GEN = "generating: raw.generation_status === 'generating'";

describe.each([
    ['escritorio', desktop],
    ['móvil', mobile],
])('P1-ARQ25-F1-CLOSE · Historial (%s) muestra el placeholder como Generando', (_n, src) => {
    it('normalizePlan deriva `generating` = generating && sin días (days_generated o plan_data.days)', () => {
        const i = src.indexOf(GEN);
        expect(i).toBeGreaterThan(-1);
        const win = src.slice(i, i + 400);
        expect(win).toContain('raw.days_generated');
        expect(win).toContain('raw.plan_data?.days');
        expect(win).toContain('=== 0');
    });

    it('emblema con spinner, etiqueta «Generando» y sin renombrar/borrar mientras corre', () => {
        expect(src).toContain('Loader2');
        expect(src).toContain('plan.generating ? <Loader2');
        expect(src).toContain('data-testid="history-generating-badge"');
        expect(src).toContain('{t("Generando")}');
        expect(src.match(/!plan\.generating/g).length).toBeGreaterThanOrEqual(1);
    });
});

describe('P1-ARQ25-F1-CLOSE · controles ocultos', () => {
    it('escritorio: pencil y trash gateados por !plan.generating', () => {
        expect(desktop).toContain('{!plan.generating && <IconButton name="pencil"');
        expect(desktop).toContain('{!plan.generating && <IconButton name="trash"');
    });
    it('móvil: la papelera exige !editing && !plan.generating', () => {
        expect(mobile).toContain('{!editing && !plan.generating && (');
    });
});

describe('P1-ARQ25-F1-CLOSE · el hero es el plan que se genera; el anterior queda «En uso»', () => {
    const history = fs.readFileSync(path.resolve(_dir, '../pages/History.jsx'), 'utf8');
    it('History.jsx elige el placeholder como activo y baja el vigente a inUsePlanId', () => {
        expect(history).toContain('const activePlanId = generatingPlanId || usablePlanId;');
        expect(history).toContain('const inUsePlanId = generatingPlanId ? usablePlanId : null;');
        expect(history.match(/inUsePlanId=\{inUsePlanId\}/g)).toHaveLength(2);
    });
    it.each([['escritorio', desktop], ['móvil', mobile]])('%s: etiqueta «En uso» y hero/badge «Generando»', (_n, src) => {
        expect(src).toContain('inUse: !!inUsePlanId && raw.id === inUsePlanId,');
        expect(src).toContain('data-testid="history-inuse-badge"');
        expect(src).toContain('{t("En uso")}');
    });
    it('escritorio: el hero generando no ofrece «Ver plan» ni lápiz y explica que sustituirá al plan en uso', () => {
        expect(desktop).toContain('{plan.generating ? t("Generando") : (paused ? t("Plan en pausa") : t("Plan activo"))}');
        expect(desktop).toContain('{!plan.generating && <PencilButton onEdit={onEdit} size={15} />}');
        expect(desktop).toContain('{!plan.generating && (<button type="button" className="mf-cta-solid"');
        expect(desktop).toContain('t("Sustituirá a tu plan en uso cuando esté listo.")');
    });
    it('móvil: activeBadge distingue generando', () => {
        expect(mobile).toContain('const activeBadge = (paused = false, generating = false) => (');
        expect(mobile).toContain('activeBadge(paused, plan.generating)');
    });
});

describe('P1-ARQ25-F1-CLOSE · el detalle del placeholder es una pantalla de carga', () => {
    const history = fs.readFileSync(path.resolve(_dir, '../pages/History.jsx'), 'utf8');
    it('cuerpo de carga con spinner y sin macros; el body normal queda en la otra rama del ternario', () => {
        const flag = history.indexOf('const _selectedIsPlaceholder = !!selectedPlan && !!generatingPlanId && selectedPlan.id === generatingPlanId;');
        const gen = history.indexOf('data-testid="history-modal-generating"');
        expect(flag).toBeGreaterThan(-1);
        expect(gen).toBeGreaterThan(flag);
        const win = history.slice(gen, gen + 1200);
        expect(win).toContain("t('Diseñando tu plan')");
        expect(win).toContain('className="spin-animation"');
        expect(history.slice(gen - 200, gen)).toContain('{_selectedIsPlaceholder ? (');
    });
    it('sin «Reactivar este Plan» para el placeholder', () => {
        expect(history).toContain('const _hideRestore = (!!currentPlanId && selectedPlan?.id === currentPlanId) || _selectedIsPlaceholder;');
    });
});
