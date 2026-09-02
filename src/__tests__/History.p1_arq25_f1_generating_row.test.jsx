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
