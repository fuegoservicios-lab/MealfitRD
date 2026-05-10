// [P1-AUDIT-HIST-4 · 2026-05-09] Tests del consumo client-side de los
// counters embebidos por plan en `/api/plans/history-list`.
//
// Bug original (audit Historial 2026-05-09):
//   Detectar drift queue↔plan_data requería DOS roundtrips
//   (history-list + history-status-summary de P0-AUDIT-HIST-2) y
//   reconciliación client-side. Race condition: un restore/delete
//   entre las 2 requests podía dejar el bucket desincronizado.
//
// Fix:
//   Backend `api_plans_history_list` ahora hace LEFT JOIN GROUP BY
//   y embebe `chunk_*_count` en cada plan del response.
//   `getStatusInfo` los prefiere sobre `chunkStatusSummary` (que
//   queda como fallback legacy durante deploy lag).
//
// Cobertura:
//   1. Anchor del marker.
//   2. getStatusInfo lee `plan.chunk_pending_user_action_count`.
//   3. getStatusInfo lee `plan.chunk_failed_count`.
//   4. Embedded counters > 0 elevan a `action_required`.
//   5. Embedded counters > 0 PRECEDEN al fallback `chunkStatusSummary`.
//   6. Si embedded counters están ausentes, fallback al summary.
//   7. Banner del modal lee embedded counters con misma precedencia.
//   8. Comentario load-bearing cita la motivación (race condition,
//      roundtrip extra).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P1-AUDIT-HIST-4] anchor + lectura embedded counters', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-AUDIT-HIST-4\s*·\s*2026-05-09\]/);
    });

    it('getStatusInfo lee plan.chunk_pending_user_action_count', () => {
        // El helper debe acceder a la key embedded del plan.
        expect(src).toMatch(/plan\.chunk_pending_user_action_count/);
    });

    it('getStatusInfo lee plan.chunk_failed_count', () => {
        expect(src).toMatch(/plan\.chunk_failed_count/);
    });

    it('embedded counters tipados como number antes de comparar', () => {
        // typeof check defensivo — si el plan viene de un backend
        // legacy (sin counters), el typeof !== 'number' cae al
        // fallback en lugar de tratar undefined como 0 implícito.
        expect(src).toMatch(
            /typeof\s+plan\.chunk_pending_user_action_count\s*===\s*['"]number['"]/
        );
        expect(src).toMatch(
            /typeof\s+plan\.chunk_failed_count\s*===\s*['"]number['"]/
        );
    });
});


describe('[P1-AUDIT-HIST-4] precedencia embedded > summary fallback', () => {
    it('flag _hasEmbedded indica si los counters vinieron en el plan', () => {
        // El helper define una variable que captura la presencia
        // de counters embedded para decidir si fallback al summary.
        const reconcileIdx = src.indexOf('_embeddedPuac');
        expect(reconcileIdx).toBeGreaterThan(-1);
        const block = src.slice(reconcileIdx, reconcileIdx + 2000);
        expect(block).toMatch(/_hasEmbedded/);
    });

    it('summary endpoint solo se consulta cuando NO hay embedded counters', () => {
        // Patrón: `(!_hasEmbedded && chunkStatusSummary && ...) ?
        // chunkStatusSummary[plan.id] : null`
        const reconcileIdx = src.indexOf('_embeddedPuac');
        const block = src.slice(reconcileIdx, reconcileIdx + 2500);
        expect(block).toMatch(
            /!_hasEmbedded\s*&&\s*chunkStatusSummary/
        );
    });

    it('embedded counter usa fallback ternario con summary', () => {
        // _puac = embedded !== null ? embedded : (summary ? ... : 0)
        const reconcileIdx = src.indexOf('const _puac');
        expect(reconcileIdx).toBeGreaterThan(-1);
        const block = src.slice(reconcileIdx, reconcileIdx + 800);
        // El ternario tiene 3 partes: embedded check, summary read,
        // fallback 0.
        expect(block).toMatch(/_embeddedPuac\s*!==\s*null/);
        expect(block).toMatch(/_summaryEntry/);
        expect(block).toMatch(/:\s*0/);
    });
});


describe('[P1-AUDIT-HIST-4] elevación a action_required', () => {
    it('eleva bucket a action_required si _puac > 0 || _fc > 0', () => {
        // La condición de elevación debe ser OR de los dos counters
        // (sea cual sea su origen — embedded o summary).
        expect(src).toMatch(
            /_puac\s*>\s*0\s*\|\|\s*_fc\s*>\s*0/
        );
    });

    it('NO eleva si bucket ya es failed o action_required (no degrada)', () => {
        // Guard: el bucket actual NO debe ser failed/action_required
        // antes de entrar a la rama de elevación.
        const reconcileIdx = src.indexOf('_embeddedPuac');
        const block = src.slice(
            Math.max(0, reconcileIdx - 800),
            reconcileIdx
        );
        expect(block).toMatch(/bucket\s*!==\s*['"]failed['"]/);
        expect(block).toMatch(/bucket\s*!==\s*['"]action_required['"]/);
    });
});


describe('[P1-AUDIT-HIST-4] banner del modal usa misma precedencia', () => {
    it('banner lee selectedPlan.chunk_pending_user_action_count', () => {
        // El banner del modal debe seguir la misma fuente preferida
        // (embedded > summary). Sin esto, drift entre el chip
        // (helper getStatusInfo) y el body del banner.
        expect(src).toMatch(
            /selectedPlan\.chunk_pending_user_action_count/
        );
        expect(src).toMatch(
            /selectedPlan\.chunk_failed_count/
        );
    });

    it('banner usa _hasEmbeddedCounters para decidir fallback', () => {
        // Variable distinta a la del helper (scope diferente: aquí
        // es selectedPlan, allá es plan), pero misma semántica.
        const bannerIdx = src.indexOf('_hasEmbeddedCounters');
        expect(bannerIdx).toBeGreaterThan(-1);
        const block = src.slice(bannerIdx, bannerIdx + 1500);
        expect(block).toMatch(
            /!_hasEmbeddedCounters\s*&&\s*chunkStatusSummary/
        );
    });
});


describe('[P1-AUDIT-HIST-4] comentario load-bearing cita motivación', () => {
    it('comentario explica race condition + roundtrip extra del summary', () => {
        // El comentario del fix debe explicar por qué los embedded
        // counters son preferidos. Sin esto, un refactor podría
        // simplificar a "siempre summary" perdiendo el avance.
        const reconcileIdx = src.indexOf('_embeddedPuac');
        const block = src.slice(
            Math.max(0, reconcileIdx - 1500),
            reconcileIdx
        );
        // Al menos uno de los conceptos clave.
        const motivations = [
            'race',
            'roundtrip',
            'LEFT JOIN',
            'mismo response',
            'sin race',
            'embedded',
        ];
        const matches = motivations.filter((m) =>
            block.toLowerCase().includes(m.toLowerCase())
        );
        expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('comentario marca summary endpoint como FALLBACK LEGACY', () => {
        // El comentario del fetch del summary debe marcarlo como
        // fallback (vivo durante deploy lag pero ignorado en feliz
        // path). Sin esto, futuro dev no sabe que se puede remover.
        const summaryFetchIdx = src.indexOf('getHistoryStatusSummary()');
        const block = src.slice(
            Math.max(0, summaryFetchIdx - 1500),
            summaryFetchIdx
        );
        expect(block).toMatch(/FALLBACK\s+LEGACY/i);
    });
});
