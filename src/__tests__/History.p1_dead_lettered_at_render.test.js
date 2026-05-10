// [P1-HIST-NEW-2 · 2026-05-09] Tests del render de `dead_lettered_at`
// en el tab Métricas del modal del Historial.
//
// Bug original (audit profundo Historial 2026-05-09):
//   El endpoint `/{plan_id}/chunk-metrics` (P2-HIST-AUDIT-10)
//   devuelve `dead_lettered_at` Y `escalated_at`. El frontend
//   renderizaba solo `escalated_at` — asimetría sin razón. Para
//   chunks terminales, `dead_lettered_at` es **el** timestamp
//   canónico (el punto en que el sistema aceptó la pérdida);
//   `escalated_at` es la marca de transición hacia ese estado.
//
// Fix:
//   Chip `Dead-letter: <rel>` justo después del chip `Escalado:` con
//   palette `tierBadgeBad` (rojo, vs amber del escalado). Mismo
//   helper `_fmtRelTime` para formato consistente. Tooltip explica
//   semántica terminal.
//
// Cobertura:
//   1. Anchor del marker.
//   2. Render condicional: solo si _fmtRelTime parsea.
//   3. Lee `c.dead_lettered_at` (no plan_data ni queue).
//   4. Palette tierBadgeBad (red), distinguible del escalated warn.
//   5. Label "Dead-letter:" + tiempo relativo.
//   6. Tooltip incluye ISO y semántica "estado terminal".
//   7. Orden visual: escalated_at antes que dead_lettered_at.
//   8. Independencia: dead_lettered_at se renderiza incluso sin
//      escalated_at presente (paths sin escalación explícita).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P1-HIST-NEW-2] anchor + render condicional', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-NEW-2\s*·\s*2026-05-09\]/);
    });

    it('lee c.dead_lettered_at del response del endpoint', () => {
        // Debe leer la key del payload del chunk-metrics, no plan_data.
        expect(src).toMatch(/c\.dead_lettered_at/);
    });

    it('usa _fmtRelTime helper para formato consistente', () => {
        // Mismo helper que el escalated_at chip — sin esto, el formato
        // de "hace 2h" / "hace 1d" diverge entre los chips de tiempo.
        const idx = src.indexOf('c.dead_lettered_at');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, idx - 200), idx + 600);
        expect(block).toMatch(/_fmtRelTime\(\s*c\.dead_lettered_at\s*\)/);
    });

    it('render condicional: skip si _fmtRelTime devuelve null', () => {
        // _dl falsy → return null. Sin esto, dead_lettered_at=null
        // podría romper el .iso/.rel access del template.
        const idx = src.indexOf('c.dead_lettered_at');
        const block = src.slice(idx, idx + 800);
        expect(block).toMatch(/if\s*\(\s*!_dl\s*\)\s*return\s+null/);
    });
});


describe('[P1-HIST-NEW-2] presentación visual', () => {
    it('palette tierBadgeBad (rojo, terminal)', () => {
        // Distinguible del escalated_at que usa tierBadgeWarn (amber).
        const idx = src.indexOf('c.dead_lettered_at');
        const block = src.slice(idx, idx + 1200);
        expect(block).toMatch(/styles\.tierBadgeBad/);
    });

    it('label "Dead-letter:" + tiempo relativo', () => {
        const idx = src.indexOf('c.dead_lettered_at');
        const block = src.slice(idx, idx + 1500);
        expect(block).toMatch(/Dead-letter:\s*\{_dl\.rel\}/);
    });

    it('tooltip incluye ISO completo + semántica terminal', () => {
        // El title= debe explicar al operator qué significa el estado
        // terminal — no solo mostrar el timestamp crudo.
        const idx = src.indexOf('c.dead_lettered_at');
        const block = src.slice(idx, idx + 1500);
        expect(block).toMatch(/title=\{`[^`]*\$\{_dl\.iso\}/);
        expect(block).toMatch(/estado\s+terminal/i);
    });
});


describe('[P1-HIST-NEW-2] orden e independencia', () => {
    it('escalated_at se renderiza ANTES que dead_lettered_at', () => {
        // Orden semántico: transición → estado terminal.
        const escIdx = src.indexOf('c.escalated_at');
        const dlIdx = src.indexOf('c.dead_lettered_at');
        expect(escIdx).toBeGreaterThan(-1);
        expect(dlIdx).toBeGreaterThan(-1);
        expect(dlIdx).toBeGreaterThan(escIdx);
    });

    it('dead_lettered_at NO depende de escalated_at en su condición', () => {
        // Cada chip tiene su propio early-return — un chunk con
        // dead_lettered_at sin escalated_at (paths sin escalación
        // explícita) debe renderizar el chip terminal igual.
        const idx = src.indexOf('c.dead_lettered_at');
        // Slice acotado al IIFE de dead_lettered_at.
        const iifeStart = src.lastIndexOf('(() => {', idx);
        const iifeEnd = src.indexOf('})()', idx);
        const iife = src.slice(iifeStart, iifeEnd);
        // El IIFE NO debe leer c.escalated_at — independencia plena.
        expect(iife).not.toMatch(/c\.escalated_at/);
    });
});
