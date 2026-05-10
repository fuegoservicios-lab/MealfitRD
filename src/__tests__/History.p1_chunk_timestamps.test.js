// [P1-HIST-CHUNK-TIMESTAMPS · 2026-05-09] Tests del render de
// `escalated_at` y `learning_persisted_at` en el tab Métricas del
// modal del Historial.
//
// Bug original (audit Historial 2026-05-09 · gap P1-4):
//   El endpoint `/chunk-metrics` (P2-HIST-AUDIT-10) ya devuelve
//   `escalated_at` y `learning_persisted_at` (timestamps de
//   `plan_chunk_queue`), pero el frontend los descartaba en el
//   render. Para post-mortem ("¿cuándo escaló este chunk?",
//   "¿se commiteó learning antes del fail?") esa info quedaba
//   solo accesible por SQL.
//
// Fix:
//   1. Helper `_fmtRelTime(iso)` formatea ISO 8601 a relative
//      "hace Xh Ym" + ISO absoluto en tooltip (`title=`).
//   2. Chip "Escalado: hace 2h" con `tierBadgeWarn` cuando
//      `escalated_at` non-null.
//   3. Chip "Learning: hace 2h" neutral cuando
//      `learning_persisted_at` non-null.
//   4. Edge case: `status='completed'` con `learning_persisted_at=null`
//      → chip "Sin learning" warn (señala T2 commit fail — chunk
//      shippó días pero el commit final del learning crasheó).
//
// Cobertura:
//   - Anchor del marker.
//   - Helper `_fmtRelTime` cubre todos los rangos (s/m/h/d).
//   - Edge cases: ISO inválido / future timestamp / null.
//   - Render: chip Escalado solo si non-null, con title=ISO.
//   - Render: chip Learning solo si non-null, con title explicativo.
//   - Edge T2 fail: chip "Sin learning" warn cuando completed +
//     learning_persisted_at=null.
//   - Anti-falsos: NO render "Sin learning" para chunks failed/
//     pending/processing (esos legítimamente no commiteron T2).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P1-HIST-CHUNK-TIMESTAMPS] anchor + helper', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-CHUNK-TIMESTAMPS\s*·\s*2026-05-09\]/);
    });

    it('helper _fmtRelTime declarado', () => {
        expect(src).toMatch(/const\s+_fmtRelTime\s*=\s*\(\s*iso\s*\)\s*=>/);
    });

    it('_fmtRelTime devuelve null para input inválido', () => {
        const helperIdx = src.indexOf('const _fmtRelTime');
        const block = src.slice(helperIdx, helperIdx + 3000);
        // Guard 1: type check + truthy.
        expect(block).toMatch(/!iso\s*\|\|\s*typeof iso\s*!==\s*['"]string['"]/);
        // Guard 2: Date parse fail.
        expect(block).toMatch(/Number\.isNaN\(_d\.getTime\(\)\)/);
    });

    it('_fmtRelTime maneja future timestamps como "ahora"', () => {
        // Clock skew o backend bug puede emitir timestamp futuro.
        // No render "hace -5m" — visible-feo.
        const helperIdx = src.indexOf('const _fmtRelTime');
        const block = src.slice(helperIdx, helperIdx + 3000);
        expect(block).toMatch(/_diffMs\s*<\s*0/);
        expect(block).toMatch(/['"]ahora['"]/);
    });

    it('_fmtRelTime tiene branches para sec/min/hour/day', () => {
        const helperIdx = src.indexOf('const _fmtRelTime');
        const block = src.slice(helperIdx, helperIdx + 3000);
        // Cada granularidad: s (<1m), min (<60min), h (<24h), d.
        expect(block).toMatch(/_sec\s*<\s*60/);
        expect(block).toMatch(/_min\s*<\s*60/);
        expect(block).toMatch(/_h\s*<\s*24/);
        // Format con días + horas restantes.
        expect(block).toMatch(/hace \$\{_days\}d \$\{_remH\}h/);
    });

    it('_fmtRelTime devuelve {rel, iso} con ISO absoluto local', () => {
        const helperIdx = src.indexOf('const _fmtRelTime');
        const block = src.slice(helperIdx, helperIdx + 3000);
        // ISO absoluto via `Date.toLocaleString('es-DO')` (no UTC raw).
        expect(block).toMatch(/_d\.toLocaleString\(['"]es-DO['"]\)/);
        // Estructura del return.
        expect(block).toMatch(/rel:\s*_rel/);
        expect(block).toMatch(/iso:\s*_d\.toLocaleString/);
    });
});


describe('[P1-HIST-CHUNK-TIMESTAMPS] render escalated_at', () => {
    it('chip "Escalado: <rel>" cuando _fmtRelTime(c.escalated_at) returns non-null', () => {
        // Anchor: comentario [P1-HIST-CHUNK-TIMESTAMPS] dentro del
        // render del tab Métricas.
        const renderIdx = src.indexOf('Render de `escalated_at`');
        expect(renderIdx).toBeGreaterThan(-1);
        const block = src.slice(renderIdx, renderIdx + 10000);
        // El IIFE consume escalated_at via _fmtRelTime.
        expect(block).toMatch(/_fmtRelTime\(c\.escalated_at\)/);
        // Chip text "Escalado: <rel>".
        expect(block).toMatch(/Escalado:\s*\{_esc\.rel\}/);
        // tierBadgeWarn (amber) — no es error nuevo, marca histórica.
        expect(block).toMatch(/styles\.tierBadgeWarn/);
        // Tooltip con ISO completo.
        expect(block).toMatch(/title=[\s\S]{0,150}_esc\.iso/);
    });

    it('chip Escalado se omite si helper retorna null', () => {
        const renderIdx = src.indexOf('Render de `escalated_at`');
        const block = src.slice(renderIdx, renderIdx + 10000);
        // Guard: si _fmtRelTime devuelve null (escalated_at null o
        // ISO inválido), retornamos null (no chip).
        expect(block).toMatch(/if\s*\(\s*!_esc\s*\)\s*return\s+null/);
    });
});


describe('[P1-HIST-CHUNK-TIMESTAMPS] render learning_persisted_at', () => {
    it('chip "Learning: <rel>" neutral cuando learning_persisted_at non-null', () => {
        const renderIdx = src.indexOf('Render de `escalated_at`');
        const block = src.slice(renderIdx, renderIdx + 10000);
        expect(block).toMatch(/_fmtRelTime\(c\.learning_persisted_at\)/);
        expect(block).toMatch(/Learning:\s*\{_lp\.rel\}/);
        // Tooltip que explica el contexto.
        expect(block).toMatch(/Learning commiteado el \$\{_lp\.iso\}/);
    });

    it('edge case: status=completed pero learning_persisted_at=null → chip "Sin aprendizaje guardado" warn', () => {
        // Bug T2: chunk shippó días pero el commit final del learning
        // crasheó. Chunks N+1 empiezan sin señal del N — alerta
        // diagnóstica importante.
        // [P0-HIST-FIX-5 · 2026-05-09] Copy refinado: "Sin learning"
        // (jerga interna) → "Sin aprendizaje guardado" (es-DO claro).
        const renderIdx = src.indexOf('Render de `escalated_at`');
        const block = src.slice(renderIdx, renderIdx + 10000);
        expect(block).toMatch(/c\.status\s*===\s*['"]completed['"]/);
        expect(block).toMatch(/Sin\s+aprendizaje\s+guardado/);
        // Severity warn (no bad — el chunk completó, solo falta el commit).
        expect(block).toMatch(/tierBadgeWarn[\s\S]{0,400}?Sin\s+aprendizaje\s+guardado/);
    });

    it('NO renderiza "Sin aprendizaje guardado" para chunks NO completed', () => {
        // Para failed/pending/processing/stale, learning_persisted_at
        // null es esperado — no debe alarmar al usuario.
        // [P1-HIST-NEW-2 · 2026-05-09] Slice ampliado de 6000 → 10000.
        // [P0-HIST-FIX-5 · 2026-05-09] Texto cambió "Sin learning" →
        // "Sin aprendizaje guardado" — regex actualizado.
        const renderIdx = src.indexOf('Render de `escalated_at`');
        const block = src.slice(renderIdx, renderIdx + 10000);
        // El branch `Sin aprendizaje guardado` está SOLO dentro del
        // guard `c.status === 'completed'`. Slack ampliado a 800 cubre
        // el comentario actualizado del invariante T2.
        expect(block).toMatch(
            /c\.status\s*===\s*['"]completed['"][\s\S]{0,800}?Sin\s+aprendizaje\s+guardado/
        );
        // Y el último return null cubre el fall-through.
        expect(block).toMatch(/return\s+null;\s*\}\)\(\)\}/);
    });
});


describe('[P1-HIST-CHUNK-TIMESTAMPS] tooltip semantics', () => {
    it('tooltip de Escalado explica "no-recoverable"', () => {
        const renderIdx = src.indexOf('Render de `escalated_at`');
        const block = src.slice(renderIdx, renderIdx + 10000);
        expect(block).toMatch(/Escalado a no-recoverable el/);
    });

    it('tooltip de Sin learning explica T2 fail', () => {
        const renderIdx = src.indexOf('Render de `escalated_at`');
        const block = src.slice(renderIdx, renderIdx + 10000);
        // Copy menciona T2 (commit final) — diagnóstico claro.
        expect(block).toMatch(/T2/);
        expect(block).toMatch(/learning_persisted_at/);
    });
});
