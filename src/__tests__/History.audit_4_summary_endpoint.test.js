// [P1-HIST-AUDIT-4 · 2026-05-09] Tests del fetch summary + lazy-load
// del modal en History.jsx.
//
// Bug original (audit historial 2026-05-08):
//   `fetchHistory` hacía `supabase.from('meal_plans').select('*')`,
//   descargando `plan_data` jsonb completo (30-80KB por plan). Tier
//   ultra con 50+ planes = 2-5MB por apertura del Historial.
//
// Fix:
//   - `fetchHistory` ahora llama al endpoint backend
//     `/api/plans/history-list` con projection mínima vía operadores
//     jsonb (`->`, `->>`, `jsonb_array_length`).
//   - El modal carga lazy `plan_data` solo del plan abierto via
//     `supabase.from('meal_plans').select('plan_data').eq('id', ...)`
//     en el handler onClick.
//
// Cobertura (static analysis del source — no runtime):
//   - Marker `[P1-HIST-AUDIT-4 · 2026-05-09]` presente.
//   - Import de `getHistoryList` desde `config/api`.
//   - `fetchHistory` invoca `getHistoryList()` y NO usa
//     `supabase.from('meal_plans').select('*')`.
//   - Helper `_loadPlanDataLazy` definido y selecciona solo
//     `plan_data` (no `*`).
//   - onClick del card invoca el helper antes de setSelectedPlan.
//   - Helpers de la card (`getStatusInfo`, `getCoherenceAdjustsCount`,
//     `getSimplifiedWeeksLabel`, `getSmartTags`, `renderMealPreview`)
//     leen las top-level keys del summary cuando están presentes.
//   - `_effectiveModifiedAt` acepta el summary shape
//     (`plan.plan_modified_at`) además del legacy
//     (`plan.plan_data._plan_modified_at`).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { _effectiveModifiedAt } from '../pages/History.jsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _API_PATH = join(__dirname, '..', 'config', 'api.js');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const apiSrc = readFileSync(_API_PATH, 'utf8');


describe('[P1-HIST-AUDIT-4] anchor + import', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-AUDIT-4\s*·\s*2026-05-09\]/);
    });

    it('import getHistoryList desde config/api', () => {
        expect(src).toMatch(/import\s*\{[^}]*getHistoryList[^}]*\}\s*from\s*['"]\.\.\/config\/api['"]/);
    });

    it('helper getHistoryList definido en config/api.js', () => {
        expect(apiSrc).toMatch(/export\s+const\s+getHistoryList\s*=/);
        expect(apiSrc).toMatch(/['"]\/api\/plans\/history-list['"]/);
    });
});


describe('[P1-HIST-AUDIT-4] fetchHistory usa endpoint backend, no select(*)', () => {
    const fetchIdx = src.indexOf('const fetchHistory = async');
    const fetchEnd = src.indexOf('};', fetchIdx);
    const fetchBlock = src.slice(fetchIdx, fetchEnd);

    it('fetchHistory invoca getHistoryList()', () => {
        expect(fetchBlock).toMatch(/getHistoryList\(\)/);
    });

    it('fetchHistory NO usa select("*") sobre meal_plans', () => {
        // Regression guard: si alguien revierte al fetch directo,
        // el bandwidth issue regresa. El select('*') sigue siendo
        // legítimo en otros paths (por ejemplo el lazy-load podría
        // usar select('plan_data')), pero NO en fetchHistory.
        expect(fetchBlock).not.toMatch(/\.select\(\s*['"]\*['"]\s*\)/);
    });

    it('fetchHistory lee body.plans y llama setPlans', () => {
        expect(fetchBlock).toMatch(/body\.plans/);
        expect(fetchBlock).toMatch(/setPlans\(/);
    });
});


describe('[P1-HIST-AUDIT-4] _loadPlanDataLazy: lazy-load del plan_data', () => {
    it('helper definido como const top-level del componente', () => {
        expect(src).toMatch(/const\s+_loadPlanDataLazy\s*=\s*async/);
    });

    it('selecciona SOLO la columna plan_data (no *)', () => {
        const helperIdx = src.indexOf('const _loadPlanDataLazy');
        const helperBlock = src.slice(helperIdx, helperIdx + 1500);
        expect(helperBlock).toMatch(/\.select\(\s*['"]plan_data['"]\s*\)/);
        // Defensive: el helper filtra por id Y user_id (defense-in-depth
        // contra leak de plan ajeno via id guessing).
        expect(helperBlock).toMatch(/\.eq\(\s*['"]id['"]\s*,\s*planSummary\.id/);
        expect(helperBlock).toMatch(/\.eq\(\s*['"]user_id['"]\s*,\s*user\.id/);
    });

    it('respeta el cache implícito si plan_data ya está presente', () => {
        // Si el plan summary ya trae plan_data (caso modal abierto
        // dos veces, o tests legacy), NO debe re-fetch.
        const helperIdx = src.indexOf('const _loadPlanDataLazy');
        const helperBlock = src.slice(helperIdx, helperIdx + 800);
        expect(helperBlock).toMatch(/planSummary\.plan_data/);
        expect(helperBlock).toMatch(/return\s+planSummary\.plan_data/);
    });
});


describe('[P1-HIST-AUDIT-4] onClick del card invoca _loadPlanDataLazy antes de setSelectedPlan', () => {
    it('handler async que await del lazy-load', () => {
        // Buscar el bloque del onClick del card.
        const onClickIdx = src.indexOf('onClick={async () => {');
        expect(onClickIdx).toBeGreaterThan(-1);
        // Ventana grande: el handler tiene comentarios docstring de
        // P1-HIST-1, P1-HIST-AUDIT-4 + lazy-load logic + condicional
        // antes del setSelectedPlan.
        const block = src.slice(onClickIdx, onClickIdx + 3500);
        // El handler llama _loadPlanDataLazy con await.
        expect(block).toMatch(/await\s+_loadPlanDataLazy\(plan\)/);
        // Y SOLO entonces setSelectedPlan con el plan_data fresh.
        expect(block).toMatch(/setSelectedPlan\(\s*\{\s*\.\.\.\s*plan\s*,\s*plan_data:\s*fullPlanData\s*\}\s*\)/);
    });
});


describe('[P1-HIST-AUDIT-4] _effectiveModifiedAt acepta shape summary y legacy', () => {
    it('summary: lee plan.plan_modified_at top-level', () => {
        const summary = {
            id: 'A',
            created_at: '2026-04-01T00:00:00Z',
            plan_modified_at: '2026-05-08T18:00:00Z',
        };
        expect(_effectiveModifiedAt(summary))
            .toBe(Date.parse('2026-05-08T18:00:00Z'));
    });

    it('legacy: cae a plan.plan_data._plan_modified_at', () => {
        const legacy = {
            id: 'A',
            created_at: '2026-04-01T00:00:00Z',
            plan_data: { _plan_modified_at: '2026-05-08T18:00:00Z' },
        };
        expect(_effectiveModifiedAt(legacy))
            .toBe(Date.parse('2026-05-08T18:00:00Z'));
    });

    it('summary toma precedencia si ambos shapes están', () => {
        // Caso patológico (no debería pasar en runtime, pero
        // defensa por construcción): si un row tiene ambos, summary
        // top-level gana. Esto refleja que el endpoint backend es
        // SSOT.
        const both = {
            id: 'A',
            created_at: '2026-04-01T00:00:00Z',
            plan_modified_at: '2026-05-08T18:00:00Z',
            plan_data: { _plan_modified_at: '2026-04-15T10:00:00Z' },
        };
        expect(_effectiveModifiedAt(both))
            .toBe(Date.parse('2026-05-08T18:00:00Z'));
    });

    it('summary con shape SOLO top-level (sin plan_data) sigue funcionando', () => {
        // Este es el caso REAL del summary del endpoint: no trae
        // plan_data. El helper debe ordenar correctamente sin tocar
        // plan_data.
        const summaryNoPlanData = {
            id: 'A',
            created_at: '2026-04-01T00:00:00Z',
            plan_modified_at: '2026-05-08T18:00:00Z',
        };
        expect(_effectiveModifiedAt(summaryNoPlanData))
            .toBeGreaterThan(Date.parse('2026-04-01T00:00:00Z'));
    });
});


describe('[P1-HIST-AUDIT-4] helpers de la card leen summary keys cuando están presentes', () => {
    it('getCoherenceAdjustsCount usa plan.coherence_adjusts_count si number', () => {
        const helperIdx = src.indexOf('const getCoherenceAdjustsCount');
        const block = src.slice(helperIdx, helperIdx + 1200);
        expect(block).toMatch(/plan\.coherence_adjusts_count/);
        expect(block).toMatch(/typeof\s+plan\.coherence_adjusts_count\s*===\s*['"]number['"]/);
    });

    it('renderMealPreview usa plan.preview_meals si Array', () => {
        const helperIdx = src.indexOf('const renderMealPreview');
        const block = src.slice(helperIdx, helperIdx + 1500);
        expect(block).toMatch(/plan\.preview_meals/);
        expect(block).toMatch(/Array\.isArray\(plan\.preview_meals\)/);
    });

    it('getSimplifiedWeeksLabel acepta plan.user_forced_simplified_weeks', () => {
        const helperIdx = src.indexOf('const getSimplifiedWeeksLabel');
        const block = src.slice(helperIdx, helperIdx + 1000);
        expect(block).toMatch(/plan\.user_forced_simplified_weeks/);
    });

    it('getStatusInfo acepta plan.days_generated, plan.recovery_exhausted_count, plan.user_action_required', () => {
        const helperIdx = src.indexOf('const getStatusInfo');
        const block = src.slice(helperIdx, helperIdx + 2000);
        expect(block).toMatch(/plan\.days_generated/);
        expect(block).toMatch(/plan\.recovery_exhausted_count/);
        expect(block).toMatch(/plan\.user_action_required/);
        expect(block).toMatch(/plan\.generation_status/);
    });

    it('getSmartTags acepta plan.goal, plan.diet_preference, plan.allergies', () => {
        const helperIdx = src.indexOf('const getSmartTags');
        const block = src.slice(helperIdx, helperIdx + 1500);
        expect(block).toMatch(/plan\.goal/);
        expect(block).toMatch(/plan\.diet_preference/);
        expect(block).toMatch(/plan\.allergies/);
    });
});
