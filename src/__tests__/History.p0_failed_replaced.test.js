// [P0-HIST-NEW-1 · 2026-05-09] Tests del consumo client-side de
// `chunk_failed_unreplaced_count` en getStatusInfo + action_banner.
//
// Bug original (audit profundo Historial 2026-05-09):
//   El índice parcial `ux_plan_chunk_queue_live_week` permite
//   coexistencia `completed` + `failed` para misma (plan, week) —
//   típicamente cuando un chunk completó días, fue re-encolado
//   (post-swap revalidation, manual retry) y el segundo intento
//   dead-letteró. La fila vieja sigue contribuyendo a
//   `chunk_failed_count` aunque los días YA están en plan_data.
//   Frontend `getStatusInfo` elevaba el bucket a `action_required`
//   por la regla `_fc > 0 → action_required` aunque el plan tenía
//   30/30 días. Chip rojo "Acción" persistente en planes sanos.
//
// Fix:
//   `getStatusInfo` y el queue-drift del `action_banner` prefieren
//   `chunk_failed_unreplaced_count` sobre `chunk_failed_count`. El
//   nuevo counter cuenta solo `failed` SIN sibling `completed` para
//   misma (plan, week). Cascada legacy preserva compat con backend
//   pre-fix durante deploy lag.
//
// Cobertura:
//   1. Anchor del marker.
//   2. getStatusInfo lee `chunk_failed_unreplaced_count`.
//   3. Cascada de fallback: embedded unreplaced → summary unreplaced
//      → embedded total → summary total → 0.
//   4. action_banner del modal usa la misma cascada.
//   5. Stuck-banner del modal usa la misma cascada.
//   6. Comentario load-bearing cita el bug del índice parcial.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P0-HIST-NEW-1] anchor + lectura unreplaced', () => {
    it('marker presente al menos una vez', () => {
        expect(src).toMatch(/\[P0-HIST-NEW-1\s*·\s*2026-05-09\]/);
    });

    it('marker presente en las 3 ramas que cambian (getStatusInfo + action_banner + stuck-banner)', () => {
        const matches = src.match(/\[P0-HIST-NEW-1\s*·\s*2026-05-09\]/g) || [];
        // 1× getStatusInfo, 1× action_banner queue drift, 1× stuck banner.
        expect(matches.length).toBeGreaterThanOrEqual(3);
    });

    it('getStatusInfo lee plan.chunk_failed_unreplaced_count', () => {
        expect(src).toMatch(/plan\.chunk_failed_unreplaced_count/);
    });

    it('action_banner lee selectedPlan.chunk_failed_unreplaced_count', () => {
        expect(src).toMatch(/selectedPlan\.chunk_failed_unreplaced_count/);
    });
});


describe('[P0-HIST-NEW-1] cascada de fallback con typeof guards', () => {
    it('typeof check defensivo en getStatusInfo', () => {
        // Pattern: typeof plan.chunk_failed_unreplaced_count === 'number'
        expect(src).toMatch(
            /typeof\s+plan\.chunk_failed_unreplaced_count\s*===\s*['"]number['"]/
        );
    });

    it('typeof check defensivo en action_banner', () => {
        expect(src).toMatch(
            /typeof\s+selectedPlan\.chunk_failed_unreplaced_count\s*===\s*['"]number['"]/
        );
    });

    it('cascada incluye summary failed_unreplaced_count para fallback legacy', () => {
        // Cuando los counters embebidos no están (deploy lag) pero el
        // summary endpoint sí los expone — debe haber lectura del
        // summary.failed_unreplaced_count antes de caer al failed_count
        // legacy.
        expect(src).toMatch(/_summaryEntry\.failed_unreplaced_count/);
    });
});


describe('[P0-HIST-NEW-1] action_banner reusa la nueva cascada', () => {
    it('action_banner declara _embeddedFailedUnreplaced', () => {
        const idx = src.indexOf('_embeddedFailedUnreplaced');
        expect(idx).toBeGreaterThan(-1);
    });

    it('_hasEmbeddedCounters incluye unreplaced en su disjunción', () => {
        // El flag de presencia ahora considera unreplaced O total O puac.
        const m = src.match(
            /_hasEmbeddedCounters\s*=\s*_embeddedPuac\s*!==\s*null[^;]+_embeddedFailedUnreplaced/
        );
        expect(m).not.toBeNull();
    });
});


describe('[P0-HIST-NEW-1] regla de elevación se preserva', () => {
    it('NO degrada si bucket ya es failed o action_required', () => {
        // Guard sigue intacto — el fix solo cambia la fuente del
        // counter, no la decisión de cuándo elevar.
        expect(src).toMatch(/bucket\s*!==\s*['"]failed['"]/);
        expect(src).toMatch(/bucket\s*!==\s*['"]action_required['"]/);
    });

    it('eleva bucket si _puac > 0 || _fc > 0 (con _fc=unreplaced)', () => {
        // La regla final es la misma — solo cambia qué llena `_fc`.
        expect(src).toMatch(/_puac\s*>\s*0\s*\|\|\s*_fc\s*>\s*0/);
    });
});


describe('[P0-HIST-NEW-1] stuck-banner reusa la nueva cascada', () => {
    it('stuck-banner usa unreplaced para evaluar suppression', () => {
        // El stuck-banner se suprime cuando hay otro banner activo
        // (action_banner). Ese check debe usar unreplaced para que
        // un plan con failed-replaced (residuos) NO suprima
        // erróneamente el stuck-banner.
        const idx = src.indexOf('_fc2');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 800);
        expect(block).toMatch(/chunk_failed_unreplaced_count/);
    });
});


describe('[P0-HIST-NEW-1] comentario load-bearing', () => {
    it('cita el contrato del índice parcial ux_plan_chunk_queue_live_week', () => {
        // El motivo del fix DEBE estar documentado in-line para que
        // un futuro refactor entienda por qué hay una segunda key
        // similar a chunk_failed_count.
        const idx = src.indexOf('ux_plan_chunk_queue_live_week');
        expect(idx).toBeGreaterThan(-1);
    });

    it('cita escenarios típicos (post-swap revalidation, manual retry)', () => {
        // El comentario debe explicar CUÁNDO el bug se manifiesta —
        // sin ejemplos, un revisor podría borrar la lógica creyendo
        // que es defensa contra un caso imposible.
        expect(src).toMatch(/post-swap\s+revalidation/i);
    });
});
