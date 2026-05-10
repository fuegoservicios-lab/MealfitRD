// [P0-HIST-LEARN-1 · 2026-05-09] Render del snapshot
// `_last_chunk_learning` en el sub-bloque "Aprendizaje del usuario"
// del modal del Historial.
//
// Bug original (audit Historial 2026-05-09 · gap P0):
//   `_last_chunk_learning` es la semilla literal que el cron inyecta
//   al PRÓXIMO chunk (rolling_refill). El modal del Historial no lo
//   surfaceaba — diagnosticar "por qué chunk N+1 generó X" requería
//   SQL al jsonb. La data real del plan 98d902e3 confirma 18 sub-keys
//   ricas (learning_signal_strength, rebuilt_from_pipeline_failure,
//   rejected_meals_that_reappeared, …) invisibles.
//
// Cobertura (static analysis del source):
//   - Anchors del marker en History.jsx, api.js (no aplica) y CSS.
//   - Normalizer del fetch acepta last_chunk_learning con default null.
//   - Render block "Lo aprendido del último bloque" con su header.
//   - Chips de severity por key (warn/bad mapping).
//   - Guard `_hasAnyValue` evita render si todas las keys son null.
//   - Render condicionado a typeof === 'object' && !Array.isArray
//     (rechaza arrays/null/sentinels 'loading'/'error').
//   - Helper _listChip presente con cap top 5 + "+N más".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const cssSrc = readFileSync(_CSS_PATH, 'utf8');


describe('[P0-HIST-LEARN-1] anchor + estructura', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P0-HIST-LEARN-1\s*·\s*2026-05-09\]/);
    });

    it('marker presente en History.module.css', () => {
        expect(cssSrc).toMatch(/\[P0-HIST-LEARN-1\s*·\s*2026-05-09\]/);
    });
});


describe('[P0-HIST-LEARN-1] normalizer del _ensureLifetimeLessons', () => {
    it('normalizer acepta last_chunk_learning con default null', () => {
        // El normalizer del helper _ensureLifetimeLessons debe declarar
        // la nueva key con shape coherente: object → preservar, array/
        // null/string → null. Mismo guard que summary.
        const helperIdx = src.indexOf('_ensureLifetimeLessons');
        expect(helperIdx).toBeGreaterThan(-1);
        const block = src.slice(helperIdx, helperIdx + 4000);
        expect(block).toMatch(/last_chunk_learning:/);
        // Debe gatear por typeof === 'object' && !Array.isArray.
        expect(block).toMatch(/payload\.last_chunk_learning[\s\S]{0,200}typeof[\s\S]{0,40}===\s*['"]object['"]/);
        expect(block).toMatch(/payload\.last_chunk_learning[\s\S]{0,300}!Array\.isArray/);
    });
});


describe('[P0-HIST-LEARN-1] render del bloque', () => {
    it('header "Lo aprendido del último bloque" presente', () => {
        expect(src).toMatch(/Lo aprendido del último bloque/);
    });

    it('bloque vinculado a la clase lastChunkLearningBlock', () => {
        expect(src).toMatch(/styles\.lastChunkLearningBlock/);
    });

    it('header tiene clase dedicada para layout', () => {
        expect(src).toMatch(/styles\.lastChunkLearningHeader/);
        expect(src).toMatch(/styles\.lastChunkLearningMeta/);
    });

    it('guard _hasAnyValue evita render con payload todo-null', () => {
        // Sin esto, un chunk pre-pipeline (todas las keys null) renderizaría
        // el header sin chips — confuso. El guard vive en el preamble del
        // IIFE, ANTES del JSX. Anclamos al comentario único del IIFE
        // ("Snapshot del último chunk aprendido") que precede los helpers.
        const anchorIdx = src.indexOf('Snapshot del último chunk aprendido');
        expect(anchorIdx).toBeGreaterThan(-1);
        const block = src.slice(anchorIdx, anchorIdx + 8000);
        expect(block).toMatch(/_hasAnyValue\s*=/);
        expect(block).toMatch(/if\s*\(\s*!_hasAnyValue\s*\)\s*return\s+null/);
    });

    it('guard rechaza payload no-object (arrays / null / sentinels)', () => {
        // El IIFE debe gatear igual que el normalizer:
        // `_lcl && typeof _lcl === 'object' && !Array.isArray(_lcl)`.
        // Sin esto, un sentinel 'loading' del cache rompería el render.
        const anchorIdx = src.indexOf('Snapshot del último chunk aprendido');
        const block = src.slice(anchorIdx, anchorIdx + 8000);
        expect(block).toMatch(/_lcl\s*=/);
        expect(block).toMatch(/typeof\s+_lcl\s*!==\s*['"]object['"]/);
        expect(block).toMatch(/Array\.isArray\(_lcl\)/);
    });

    it('chips de severity para signal/confidence/T2/crash', () => {
        const anchorIdx = src.indexOf('Snapshot del último chunk aprendido');
        const block = src.slice(anchorIdx, anchorIdx + 30000);
        expect(block).toMatch(/Señal:\s*\{_signalLabel\}/);
        expect(block).toMatch(/Baja confianza/);
        expect(block).toMatch(/Sin métricas T2/);
        expect(block).toMatch(/Reconstruido tras crash/);
    });

    it('rebuild paths (queue / preflight / source_status)', () => {
        const anchorIdx = src.indexOf('Snapshot del último chunk aprendido');
        const block = src.slice(anchorIdx, anchorIdx + 30000);
        expect(block).toMatch(/Reconstruido \(queue\)/);
        expect(block).toMatch(/Reconstruido \(preflight\)/);
        expect(block).toMatch(/Origen:\s*\{/);
    });

    it('chips numéricos: repetición meals + bases con severity tiered', () => {
        const anchorIdx = src.indexOf('Snapshot del último chunk aprendido');
        const block = src.slice(anchorIdx, anchorIdx + 30000);
        expect(block).toMatch(/Repetición meals/);
        expect(block).toMatch(/Repetición bases/);
        // El _fmtRepPct helper aplica thresholds 60 (bad) / 20 (warn).
        expect(block).toMatch(/_pct\s*>\s*60/);
        expect(block).toMatch(/_pct\s*>\s*20/);
    });

    it('violation chips con severity (allergy=bad, rejection/fatigue=warn)', () => {
        const anchorIdx = src.indexOf('Snapshot del último chunk aprendido');
        const block = src.slice(anchorIdx, anchorIdx + 30000);
        // allergy_violations renderiza con tierBadgeBad.
        expect(block).toMatch(/allergy_violations[\s\S]{0,500}tierBadgeBad/);
        // rejection / fatigued renderizan con tierBadgeWarn.
        expect(block).toMatch(/rejection_violations[\s\S]{0,500}tierBadgeWarn/);
        expect(block).toMatch(/fatigued_violations[\s\S]{0,500}tierBadgeWarn/);
    });

    it('listas (rejected_meals_that_reappeared, repeated_*, allergy_hits)', () => {
        const anchorIdx = src.indexOf('Snapshot del último chunk aprendido');
        const block = src.slice(anchorIdx, anchorIdx + 30000);
        // _listChip helper local + 4 invocaciones.
        expect(block).toMatch(/_listChip\s*=\s*\(/);
        expect(block).toMatch(/_listChip\(\s*['"]Reaparecieron['"]/);
        expect(block).toMatch(/_listChip\(\s*['"]Meals repetidos['"]/);
        expect(block).toMatch(/_listChip\(\s*['"]Bases repetidas['"]/);
        expect(block).toMatch(/_listChip\(\s*['"]Alergias hit['"]/);
    });

    it('lista cap visual top 5 + "+N más" en title=', () => {
        const anchorIdx = src.indexOf('Snapshot del último chunk aprendido');
        const block = src.slice(anchorIdx, anchorIdx + 30000);
        // El helper _listChip slice(0, 5) + "+N más" + title=full.
        expect(block).toMatch(/items\.slice\(0,\s*5\)/);
        expect(block).toMatch(/\+\$\{_extra\}/);
    });
});


describe('[P0-HIST-LEARN-1] CSS del bloque', () => {
    it('clase .lastChunkLearningBlock declarada (con border-top dashed)', () => {
        // Mismo selector compuesto que critical/history (dash divider).
        expect(cssSrc).toMatch(/\.lastChunkLearningBlock[\s,]/);
    });

    it('clase .lastChunkLearningHeader con flex layout', () => {
        const headerMatch = cssSrc.match(/\.lastChunkLearningHeader\s*\{[\s\S]*?\}/);
        expect(headerMatch).toBeTruthy();
        expect(headerMatch[0]).toMatch(/display:\s*flex/);
    });

    it('clase .lastChunkLearningMeta declarada', () => {
        expect(cssSrc).toMatch(/\.lastChunkLearningMeta\s*\{/);
    });
});
