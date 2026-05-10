// [P1-HIST-NEW-5 · 2026-05-09] Tests del chip "Lag X× SLA" en el tab
// Métricas cuando el ratio lag/SLA supera el threshold.
//
// Bug original (audit profundo Historial 2026-05-09):
//   El tab Métricas pintaba `Lag: 240s` y `SLA: 60s` como chips
//   independientes. Para diagnosticar "este chunk tomó 4× lo esperado"
//   (señal crítica de worker pool saturation o lock heredado) el
//   operator tenía que hacer math mental — la señal anómala se perdía
//   en el ruido de stats neutrales.
//
// Fix:
//   Chip dedicado que solo aparece cuando ratio >= 2:
//     - 2×–4× → warn (amber)
//     - ≥5×  → bad (rojo, anomalía severa)
//   Tooltip explica los dos valores + interpretación. Threshold
//   defensivo: si SLA es null/0 (chunks sin reserva) o lag no-positivo,
//   chip no se dibuja.
//
// Cobertura:
//   1. Anchor del marker.
//   2. Lectura de _lag (var existente) + c.expected_preemption_seconds.
//   3. Guards defensivos: null/0/<2 ratio → no render.
//   4. Threshold severo: ratio >= 5 usa tierBadgeBad.
//   5. Threshold normal: 2 <= ratio < 5 usa tierBadgeWarn.
//   6. Label formato: "X.Y×" para ratio < 10, "N×" entero para ≥10.
//   7. Tooltip incluye lag, SLA, ratio textual.
//   8. Posición: render entre chip SLA y chip reservation_status
//      (orden semántico: SLA → ratio → reservation_status).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P1-HIST-NEW-5] anchor + lectura de inputs', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-NEW-5\s*·\s*2026-05-09\]/);
    });

    it('lee SLA desde c.expected_preemption_seconds', () => {
        const idx = src.indexOf('[P1-HIST-NEW-5');
        const block = src.slice(idx, idx + 3500);
        expect(block).toMatch(/c\.expected_preemption_seconds/);
    });

    it('lee lag desde _lag (variable computed antes en el render)', () => {
        // _lag = c.metrics?.lag_seconds || c.lag_seconds_at_pickup
        // ya está calculado arriba en el map. El IIFE lo reusa.
        const idx = src.indexOf('[P1-HIST-NEW-5');
        const block = src.slice(idx, idx + 3500);
        expect(block).toMatch(/_lag/);
    });
});


describe('[P1-HIST-NEW-5] guards defensivos', () => {
    it('skip cuando expected_preemption_seconds no es number > 0', () => {
        // chunks sin reserva (SLA=0 o null) no deben disparar el chip —
        // no hay base contra la cual comparar.
        const idx = src.indexOf('[P1-HIST-NEW-5');
        const block = src.slice(idx, idx + 3500);
        expect(block).toMatch(
            /typeof\s+_sla\s*!==\s*['"]number['"]\s*\|\|\s*_sla\s*<=\s*0/
        );
    });

    it('skip cuando _lag no es number > 0', () => {
        // Chunks pending sin lag commiteado o lag=0 no son anómalos.
        const idx = src.indexOf('[P1-HIST-NEW-5');
        const block = src.slice(idx, idx + 3500);
        expect(block).toMatch(
            /typeof\s+_lag\s*!==\s*['"]number['"]\s*\|\|\s*_lag\s*<=\s*0/
        );
    });

    it('skip cuando ratio < 2 (dentro del SLA o solo ligero overshoot)', () => {
        // Threshold de "anomalía" arranca en 2× — chunks que tardan
        // un poco más del SLA esperado son ruido normal.
        const idx = src.indexOf('[P1-HIST-NEW-5');
        const block = src.slice(idx, idx + 3500);
        expect(block).toMatch(/_ratio\s*<\s*2/);
    });
});


describe('[P1-HIST-NEW-5] severity por threshold', () => {
    it('severe: ratio >= 5 usa tierBadgeBad (rojo)', () => {
        const idx = src.indexOf('[P1-HIST-NEW-5');
        const block = src.slice(idx, idx + 3500);
        expect(block).toMatch(/_severe\s*=\s*_ratio\s*>=\s*5/);
        // Severe → tierBadgeBad asignado a _cls.
        expect(block).toMatch(/_severe\s*\?\s*styles\.tierBadgeBad\s*:\s*styles\.tierBadgeWarn/);
    });

    it('normal warn: 2 <= ratio < 5 usa tierBadgeWarn (amber)', () => {
        // Por exclusión: si no es severe y pasó el guard de >= 2,
        // cae a warn. El ternario lo cubre.
        const idx = src.indexOf('[P1-HIST-NEW-5');
        const block = src.slice(idx, idx + 3500);
        expect(block).toMatch(/styles\.tierBadgeWarn/);
    });
});


describe('[P1-HIST-NEW-5] label format', () => {
    it('ratio < 10: formato "X.Y×" con un decimal', () => {
        const idx = src.indexOf('[P1-HIST-NEW-5');
        const block = src.slice(idx, idx + 3500);
        // _ratio.toFixed(1) + "×".
        expect(block).toMatch(/_ratio\.toFixed\(1\)/);
    });

    it('ratio >= 10: formato "N×" entero (Math.round)', () => {
        // Para anomalías muy grandes (ej. 47×) un decimal sería ruido —
        // entero comunica mejor.
        const idx = src.indexOf('[P1-HIST-NEW-5');
        const block = src.slice(idx, idx + 3500);
        expect(block).toMatch(/_ratio\s*>=\s*10/);
        expect(block).toMatch(/Math\.round\(_ratio\)/);
    });
});


describe('[P1-HIST-NEW-5] tooltip + posición', () => {
    it('tooltip incluye los dos valores + ratio + interpretación', () => {
        const idx = src.indexOf('[P1-HIST-NEW-5');
        const block = src.slice(idx, idx + 3500);
        // Template literal con _lag, _sla, _label, y copy interpretativa.
        expect(block).toMatch(/title=\{`[\s\S]*?_lag[\s\S]*?_sla[\s\S]*?_label/);
        // Copy diferenciada por severidad.
        expect(block).toMatch(/Anomal[ií]a severa/i);
    });

    it('chip text muestra "Lag X× SLA"', () => {
        const idx = src.indexOf('[P1-HIST-NEW-5');
        const block = src.slice(idx, idx + 3500);
        expect(block).toMatch(/Lag\s*\{_label\}\s*SLA/);
    });

    it('render se ubica entre chip SLA y chip reservation_status', () => {
        // Orden semántico: SLA esperado → ratio anómalo → fallback de
        // reserva. El operator lee top-to-bottom y entiende
        // progresivamente la causa.
        const slaIdx = src.indexOf('SLA: {c.expected_preemption_seconds}s');
        const ratioIdx = src.indexOf('[P1-HIST-NEW-5');
        const reserveIdx = src.indexOf("c.reservation_status === 'fallback'");
        expect(slaIdx).toBeGreaterThan(-1);
        expect(ratioIdx).toBeGreaterThan(-1);
        expect(reserveIdx).toBeGreaterThan(-1);
        expect(ratioIdx).toBeGreaterThan(slaIdx);
        expect(reserveIdx).toBeGreaterThan(ratioIdx);
    });
});
