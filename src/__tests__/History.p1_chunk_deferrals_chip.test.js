// [P1-HIST-NEW-6 · 2026-05-09] Tests del chip "Diferido N×" en cards
// del tab Métricas — surface de chunk_deferrals.
//
// Bug original (audit profundo Historial 2026-05-09):
//   `chunk_deferrals` registra cada vez que un gate del pipeline
//   LangGraph difirió un chunk (temporal_gate, learning_zero_logs,
//   missing_prior_lessons, etc.). Solo visible vía endpoint admin.
//   Para diagnosticar "por qué este plan tardó 3h en arrancar" no
//   había surface en Historial.
//
// Fix:
//   Backend agrega `deferrals_count` + `deferral_reasons` (DISTINCT)
//   per-chunk via LATERAL. Frontend renderiza chip "Diferido N×":
//     - 1–2 deferrals: chip neutro (ruido normal del scheduler).
//     - ≥3 deferrals: warn (amber) — chunk peleó contra los gates.
//   Tooltip lista las reasons DISTINCT para diagnóstico rápido.
//
// Cobertura:
//   1. Anchor del marker.
//   2. Render condicional: typeof number > 0.
//   3. Threshold severity: 1-2 neutro, ≥3 warn.
//   4. Label "Diferido N×".
//   5. Tooltip incluye count + reasons (o fallback "sin razón").
//   6. Posición: render entre chip ratio lag/SLA y chip kind drift.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P1-HIST-NEW-6] anchor + render condicional', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-NEW-6\s*·\s*2026-05-09\]/);
    });

    it('lee c.deferrals_count con typeof check defensivo', () => {
        // typeof === 'number' antes de leer — sin esto, payload con
        // count=null/undefined rompería el render del card.
        expect(src).toMatch(
            /typeof\s+c\.deferrals_count\s*===\s*['"]number['"]/
        );
    });

    it('skip si deferrals_count <= 0', () => {
        // Plan healthy con 0 deferrals → chip se omite (no ruido).
        const idx = src.indexOf('c.deferrals_count');
        const block = src.slice(idx, idx + 2000);
        expect(block).toMatch(/c\.deferrals_count\s*>\s*0/);
    });

    it('lee c.deferral_reasons con guard Array.isArray', () => {
        // Defensivo contra null/undefined (response shape preservó
        // None cuando el backend no encontró reasons).
        const idx = src.indexOf('c.deferrals_count');
        const block = src.slice(idx, idx + 2000);
        expect(block).toMatch(/Array\.isArray\(c\.deferral_reasons\)/);
    });
});


describe('[P1-HIST-NEW-6] severity por threshold', () => {
    it('threshold ≥3 dispara warn (tierBadgeWarn)', () => {
        const idx = src.indexOf('c.deferrals_count');
        const block = src.slice(idx, idx + 2000);
        expect(block).toMatch(/_warn\s*=\s*_n\s*>=\s*3/);
        expect(block).toMatch(/_warn\s*\?\s*styles\.tierBadgeWarn/);
    });

    it('1-2 deferrals: chip neutro (sin tier class)', () => {
        // El ternario asigna empty string cuando _warn es false —
        // solo `detailItemCounter` aplica (palette neutra).
        const idx = src.indexOf('c.deferrals_count');
        const block = src.slice(idx, idx + 2000);
        expect(block).toMatch(/_warn\s*\?\s*styles\.tierBadgeWarn\s*:\s*['"]['"]/);
    });
});


describe('[P1-HIST-NEW-6] label + tooltip', () => {
    it('label muestra "Diferido N×"', () => {
        const idx = src.indexOf('c.deferrals_count');
        const block = src.slice(idx, idx + 2000);
        expect(block).toMatch(/Diferido\s*\{_n\}×/);
    });

    it('tooltip incluye count + plural correcto', () => {
        // Singular "1 vez" vs plural "N veces" — copy es-DO natural.
        const idx = src.indexOf('c.deferrals_count');
        const block = src.slice(idx, idx + 2000);
        expect(block).toMatch(/_n\s*===\s*1\s*\?\s*['"]vez['"]/);
        expect(block).toMatch(/['"]veces['"]/);
    });

    it('tooltip incluye reasons o fallback "sin razón"', () => {
        // Si reasons está vacío o null, tooltip dice "sin razón
        // registrada" en lugar de string vacío después de "Razones:".
        const idx = src.indexOf('c.deferrals_count');
        const block = src.slice(idx, idx + 2000);
        expect(block).toMatch(/sin raz[oó]n registrada/i);
        expect(block).toMatch(/_reasons\.join\(/);
    });
});


describe('[P1-HIST-NEW-6] posición en el render', () => {
    it('chip se ubica entre Lag/SLA ratio chip y kind drift chip', () => {
        // Orden semántico: SLA → ratio anómalo → reservation → deferrals
        // → kind drift. Operador lee progresivamente las señales.
        const ratioIdx = src.indexOf('[P1-HIST-NEW-5');
        const deferralsIdx = src.indexOf('[P1-HIST-NEW-6');
        const kindDriftIdx = src.indexOf('Cross-check is_rolling_refill drift');
        expect(ratioIdx).toBeGreaterThan(-1);
        expect(deferralsIdx).toBeGreaterThan(-1);
        expect(kindDriftIdx).toBeGreaterThan(-1);
        expect(deferralsIdx).toBeGreaterThan(ratioIdx);
        expect(kindDriftIdx).toBeGreaterThan(deferralsIdx);
    });
});
