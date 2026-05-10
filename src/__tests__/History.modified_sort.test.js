// [P1-HIST-4 · 2026-05-09] Tests del sort por _plan_modified_at en
// History.jsx.
//
// Bug original (audit historial 2026-05-08):
//   El listado se ordenaba solo por `created_at` desc. Un plan
//   modificado por swap / post-swap revalidation / shift_plan /
//   restore (P0-HIST-1) / cualquiera de los ~6 paths del backend
//   que sellan `_plan_modified_at` NO saltaba arriba aunque su
//   contenido fuera más fresco que planes "más nuevos" pero sin
//   ediciones. La card de un plan editado quedaba enterrada — el
//   usuario buscaba "donde quedó mi plan reciente" y no lo
//   encontraba.
//
// Fix:
//   - Helper `_effectiveModifiedAt(plan)` exportado: epoch millis
//     del max(created_at, plan_data._plan_modified_at).
//   - `fetchHistory` re-ordena el array post-fetch usando el helper
//     (Supabase ya devuelve por created_at, el sort cliente solo
//     reordena planes con ediciones más recientes).
//
// Cobertura:
//   - Helper: toma el max de los dos timestamps.
//   - Helper: cae a created_at si _plan_modified_at falta o es no-string.
//   - Helper: devuelve 0 cuando ambos faltan/son inválidos.
//   - Helper: tolera ISO con/sin milliseconds, con/sin "Z".
//   - History.jsx: aplica el sort post-filter en fetchHistory.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { _effectiveModifiedAt } from '../pages/History.jsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');

describe('[P1-HIST-4] _effectiveModifiedAt — semantica del helper', () => {
    it('devuelve max cuando ambos timestamps están presentes', () => {
        // _plan_modified_at más reciente → debe primar.
        const planA = {
            created_at: '2026-04-01T10:00:00Z',
            plan_data: { _plan_modified_at: '2026-05-08T12:00:00Z' },
        };
        const ts = _effectiveModifiedAt(planA);
        expect(ts).toBe(Date.parse('2026-05-08T12:00:00Z'));

        // created_at más reciente que _plan_modified_at (raro pero
        // posible si created_at se backdatea o el sello falla) → max
        // toma created_at.
        const planB = {
            created_at: '2026-05-08T12:00:00Z',
            plan_data: { _plan_modified_at: '2026-04-01T10:00:00Z' },
        };
        expect(_effectiveModifiedAt(planB)).toBe(Date.parse('2026-05-08T12:00:00Z'));
    });

    it('cae a created_at si plan_data._plan_modified_at falta', () => {
        const plan = {
            created_at: '2026-05-01T08:30:00Z',
            plan_data: { name: 'Sin sello' },
        };
        expect(_effectiveModifiedAt(plan)).toBe(Date.parse('2026-05-01T08:30:00Z'));
    });

    it('cae a created_at si plan_data falta entero', () => {
        const plan = { created_at: '2026-05-01T08:30:00Z' };
        expect(_effectiveModifiedAt(plan)).toBe(Date.parse('2026-05-01T08:30:00Z'));
    });

    it('cae a created_at si _plan_modified_at es no-string (defensivo)', () => {
        // Un valor numérico, null, objeto — no debe crashear ni
        // contaminar el resultado.
        const cases = [
            { created_at: '2026-05-01T08:30:00Z', plan_data: { _plan_modified_at: 1736000000000 } },
            { created_at: '2026-05-01T08:30:00Z', plan_data: { _plan_modified_at: null } },
            { created_at: '2026-05-01T08:30:00Z', plan_data: { _plan_modified_at: { ts: 'x' } } },
            { created_at: '2026-05-01T08:30:00Z', plan_data: { _plan_modified_at: false } },
        ];
        for (const c of cases) {
            expect(_effectiveModifiedAt(c)).toBe(Date.parse('2026-05-01T08:30:00Z'));
        }
    });

    it('devuelve 0 cuando ambos faltan o son inválidos', () => {
        expect(_effectiveModifiedAt({})).toBe(0);
        expect(_effectiveModifiedAt({ created_at: '' })).toBe(0);
        expect(_effectiveModifiedAt({ created_at: 'no-es-fecha' })).toBe(0);
        expect(_effectiveModifiedAt(null)).toBe(0);
        expect(_effectiveModifiedAt(undefined)).toBe(0);
    });

    it('tolera ISO con y sin milliseconds + sin "Z" (UTC implícito)', () => {
        // Backend escribe con datetime.now(timezone.utc).isoformat()
        // que produce "2026-05-09T12:30:45.123456+00:00". Date.parse
        // tolera ambos formatos en V8 modernos.
        const variants = [
            '2026-05-09T12:30:45Z',
            '2026-05-09T12:30:45.123Z',
            '2026-05-09T12:30:45.123456+00:00',
        ];
        for (const v of variants) {
            const plan = { plan_data: { _plan_modified_at: v }, created_at: '' };
            const ts = _effectiveModifiedAt(plan);
            expect(Number.isFinite(ts)).toBe(true);
            expect(ts).toBeGreaterThan(0);
        }
    });

    it('comparable con < / > para sort correcto', () => {
        // Esta es la propiedad clave: el helper devuelve un número que
        // se puede usar con `(b) - (a)` para sort descending.
        const older = { created_at: '2026-04-01T10:00:00Z', plan_data: {} };
        const newer = {
            created_at: '2026-04-15T10:00:00Z',
            plan_data: { _plan_modified_at: '2026-05-08T18:00:00Z' },
        };
        expect(_effectiveModifiedAt(newer) - _effectiveModifiedAt(older)).toBeGreaterThan(0);
    });
});

describe('[P1-HIST-4] _effectiveModifiedAt sort — caso integración', () => {
    // Simula 4 planes representativos del audit:
    //   A) creado 2026-04-01, sin sello (plan viejo, nunca tocado)
    //   B) creado 2026-04-15, modificado 2026-05-08 (recién editado)
    //   C) creado 2026-04-20, sin sello (entre A y B por creación)
    //   D) creado 2026-05-01, sin sello (más nuevo por creación)
    // Orden esperado post-sort: B (5/8) → D (5/1) → C (4/20) → A (4/1).
    it('plan editado recientemente sube por encima del más nuevo sin ediciones', () => {
        const plans = [
            { id: 'A', created_at: '2026-04-01T10:00:00Z', plan_data: {} },
            { id: 'B', created_at: '2026-04-15T10:00:00Z', plan_data: { _plan_modified_at: '2026-05-08T18:00:00Z' } },
            { id: 'C', created_at: '2026-04-20T10:00:00Z', plan_data: {} },
            { id: 'D', created_at: '2026-05-01T10:00:00Z', plan_data: {} },
        ];
        plans.sort((a, b) => _effectiveModifiedAt(b) - _effectiveModifiedAt(a));
        expect(plans.map(p => p.id)).toEqual(['B', 'D', 'C', 'A']);
    });

    it('sort idempotente sobre listado ya ordenado', () => {
        // Patología: re-aplicar el sort no cambia el orden.
        const plans = [
            { id: 'X', created_at: '2026-05-08T10:00:00Z', plan_data: {} },
            { id: 'Y', created_at: '2026-05-01T10:00:00Z', plan_data: {} },
            { id: 'Z', created_at: '2026-04-01T10:00:00Z', plan_data: {} },
        ];
        plans.sort((a, b) => _effectiveModifiedAt(b) - _effectiveModifiedAt(a));
        const firstOrder = plans.map(p => p.id);
        plans.sort((a, b) => _effectiveModifiedAt(b) - _effectiveModifiedAt(a));
        expect(plans.map(p => p.id)).toEqual(firstOrder);
    });

    it('empates resuelven por orden de entrada (sort estable)', () => {
        // 2 planes con mismo timestamp efectivo: el sort estable
        // preserva el orden previo (que viene de Supabase ORDER BY
        // created_at desc).
        const sameTs = '2026-05-08T10:00:00Z';
        const plans = [
            { id: 'first', created_at: sameTs, plan_data: {} },
            { id: 'second', created_at: sameTs, plan_data: {} },
        ];
        plans.sort((a, b) => _effectiveModifiedAt(b) - _effectiveModifiedAt(a));
        expect(plans.map(p => p.id)).toEqual(['first', 'second']);
    });
});

describe('[P1-HIST-4] History.jsx — sort aplicado en fetchHistory', () => {
    it('export default importa _effectiveModifiedAt como const top-level', () => {
        expect(src).toMatch(
            /export\s+const\s+_effectiveModifiedAt\s*=/
        );
    });

    it('marca el cambio con anchor [P1-HIST-4 · 2026-05-09]', () => {
        expect(src).toMatch(/\[P1-HIST-4\s*·\s*2026-05-09\]/);
    });

    it('fetchHistory llama getHistoryList y pasa el array al setPlans', () => {
        // [P1-HIST-AUDIT-4 · 2026-05-09] Post-migración al endpoint
        // backend, el sort vive en SQL (`ORDER BY GREATEST(...)
        // DESC`). El frontend ya NO re-ordena client-side dentro de
        // fetchHistory — sería redundante y waste CPU. La regresión
        // que este test cubría (sort cliente sobre listado de
        // Supabase) ya no aplica; ahora cubre que el endpoint nuevo
        // se invoca y los plans del response llegan al setPlans.
        const fetchIdx = src.indexOf('const fetchHistory = async');
        expect(fetchIdx).toBeGreaterThan(-1);
        const setPlansIdx = src.indexOf('setPlans(plans)', fetchIdx);
        expect(setPlansIdx).toBeGreaterThan(-1);
        const block = src.slice(fetchIdx, setPlansIdx);
        expect(block).toMatch(/getHistoryList\(\)/);
        // El response shape es `{plans: [...]}`.
        expect(block).toMatch(/body\.plans/);
    });

    it('helper _effectiveModifiedAt sigue exportado (defensivo + reutilizable)', () => {
        // Aunque el sort principal vive en SQL, el helper sigue
        // export-able para defensa local (re-sort post-rename) y
        // para consumidores externos (Dashboard "recientes",
        // tests). No removerlo cuando el sort migra a backend.
        expect(src).toMatch(/export\s+const\s+_effectiveModifiedAt\s*=/);
    });
});
