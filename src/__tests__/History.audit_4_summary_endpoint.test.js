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
//   - El modal carga lazy `plan_data` solo del plan abierto. [P1-NEON-DB-
//     MIGRATION · 2026-06-12] El select PostgREST original
//     (`supabase.from('meal_plans').select('plan_data').eq('id', ...)`) se
//     migró a `GET /api/plans-data/{plan_id}` (DB en Neon, ownership I2
//     server-side) — el handler `openPlanModal` lo dispara fire-and-forget.
//
// Cobertura (static analysis del source — no runtime):
//   - Marker `[P1-HIST-AUDIT-4 · 2026-05-09]` presente.
//   - Import de `getHistoryList` desde `config/api`.
//   - `fetchHistory` invoca `getHistoryList()` y NO usa
//     `supabase.from('meal_plans').select('*')`.
//   - Helper `_loadPlanDataLazy` definido y carga solo `plan_data` via
//     `GET /api/plans-data/{id}` (no select(*); ownership server-side I2).
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
const _API_PATH = join(__dirname, '..', 'config', 'api.ts');

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
        // [P1-HISTORY-ABORT · 2026-05-23] El call site ahora pasa
        // `{ signal }` desde el AbortController del mount. Regex
        // relajado: paréntesis permiten args (vacíos o no).
        expect(fetchBlock).toMatch(/getHistoryList\(\s*(?:\{[^}]*\})?\s*\)/);
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

    it('carga SOLO el plan_data via GET /api/plans-data/{id} (ownership server-side)', () => {
        const helperIdx = src.indexOf('const _loadPlanDataLazy');
        const helperBlock = src.slice(helperIdx, helperIdx + 1500);
        // [P1-NEON-DB-MIGRATION · 2026-06-12] El select directo de PostgREST
        // (`.select('plan_data').eq('id', planSummary.id).eq('user_id', uid)`)
        // fue reemplazado por `GET /api/plans-data/{plan_id}` — la DB vive en
        // Neon y el SDK PostgREST ya no la ve. El backend proyecta SOLO
        // `plan_data` (sigue siendo el ahorro de bandwidth del summary) y
        // ENFORCE ownership server-side (invariante I2: `AND user_id = %s`),
        // así que el filtro `user_id` ya no vive client-side.
        // Guard del mecanismo ACTUAL: la llamada al endpoint con el id en path.
        expect(helperBlock).toMatch(/fetchWithAuth\(\s*`\/api\/plans-data\/\$\{planSummary\.id\}`\s*\)/);
        // El id del plan viaja en el path (equivalente al `.eq('id', ...)` previo).
        expect(helperBlock).toMatch(/\/api\/plans-data\/\$\{planSummary\.id\}/);
        // Ownership client-side restante: pre-check barato que bail-outea sin
        // sesión (el `.eq('user_id', uid)` previo migró a I2 server-side). El
        // `uid` se lee de la sesión YA hidratada del contexto (lectura síncrona,
        // P6-SPEED-HIST-GETUSER · 2026-06-01) — sin roundtrip a auth.getUser().
        expect(helperBlock).toMatch(/if\s*\(\s*!uid\s*\)\s*return\s+null/);
        // `uid` DEBE derivar de la sesión hidratada del contexto.
        expect(helperBlock).toMatch(/const\s+uid\s*=\s*session\?\.user\?\.id/);
        // Anti-regresión: el waterfall de red NO debe volver al helper.
        expect(helperBlock).not.toMatch(/auth\.getUser\(/);
        // Anti-regresión: no revertir al select directo de PostgREST.
        expect(helperBlock).not.toMatch(/\.select\(\s*['"]\*['"]\s*\)/);
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


describe('[P1-HIST-AUDIT-4] onClick del card invoca _loadPlanDataLazy', () => {
    it('handler usa _loadPlanDataLazy en fire-and-forget post setSelectedPlan', () => {
        // [P3-HIST-FAST-OPEN · 2026-05-18] El handler ya NO usa
        // `onClick={async () => { await _loadPlanDataLazy(...) }`
        // (pattern legacy P1-HIST-AUDIT-4 original). Ahora hace
        // setSelectedPlan PRIMERO (modal abre instant con skeleton)
        // y dispara `_loadPlanDataLazy(plan).then(...)` en paralelo,
        // pisando `selectedPlan.plan_data` cuando resuelve.
        // Reason: roundtrip Supabase ~200-500ms causaba perceived
        // delay del click visible al usuario.
        // [P1-HISTORY-ABORT · 2026-05-23] Test actualizado para
        // reflejar el contract post-P3-HIST-FAST-OPEN.
        const fastOpenIdx = src.indexOf('_loadPlanDataLazy(plan).then');
        expect(fastOpenIdx).toBeGreaterThan(-1);
        // Back-slice 3500 cubre desde setSelectedPlan({...plan, plan_data: ...})
        // (~40 líneas antes) hasta el fire-and-forget — comentarios
        // load-bearing inflan la distancia.
        const block = src.slice(Math.max(0, fastOpenIdx - 3500), fastOpenIdx + 1000);
        // El setSelectedPlan ocurre ANTES del fire-and-forget.
        expect(block).toMatch(/setSelectedPlan\(\s*\{\s*\.\.\.\s*plan/);
        // El .then pisa el plan_data resuelto via callback que
        // valida `prev.id === plan.id` (no piso si el user cerró el
        // modal o abrió otro plan mientras tanto).
        expect(block).toMatch(/setSelectedPlan\(\(prev\)\s*=>/);
        expect(block).toMatch(/prev\.id\s*!==\s*plan\.id/);
        expect(block).toMatch(/plan_data:\s*fullPlanData/);
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
