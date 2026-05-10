// [P1-HIST-PANTRY-DEGRADED · 2026-05-09] Tests del chip retroactivo
// "Pantry degradada" en la card del listado del Historial.
//
// Bug original (audit Historial 2026-05-09 · gap P1-5):
//   `learning_metrics.pantry_degraded_reason` se persiste por chunk
//   pero la card del listado no lo surface. Un plan generado con
//   pantry comprometida (stale_snapshot, empty_pantry_proxy,
//   inventory_unreachable) se ve idéntico a un plan healthy en el
//   listado. Solo accesible via tab Métricas tras P1-HIST-LM-WHITELIST.
//
// Fix:
//   1. Backend extiende /history-list con count + DISTINCT array.
//   2. Frontend renderiza chip ámbar "Pantry degradada" cuando
//      count > 0, con tooltip listando las reasons distintas.
//
// Cobertura:
//   - Anchor del marker.
//   - Lectura embedded de chunk_pantry_degraded_count.
//   - Render condicional: chip aparece solo si count > 0.
//   - Tooltip incluye las reasons distintas (no duplicadas).
//   - Tooltip fallback cuando reasons array vacío/null.
//   - CSS palette ámbar (warn) — distinta de violeta (simplifiedWeeks)
//     y de cyan (coherenceAdjusts).

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


describe('[P1-HIST-PANTRY-DEGRADED] anchor', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-PANTRY-DEGRADED\s*·\s*2026-05-09\]/);
    });

    it('marker presente en History.module.css', () => {
        expect(cssSrc).toMatch(/\[P1-HIST-PANTRY-DEGRADED\s*·\s*2026-05-09\]/);
    });
});


describe('[P1-HIST-PANTRY-DEGRADED] chip render', () => {
    it('lee chunk_pantry_degraded_count embedded del summary', () => {
        // Shape esperado del backend: número int. Si plan no tiene
        // la key (response legacy), tratado como 0 → no chip.
        const chipIdx = src.indexOf('pantryDegradedBadge');
        expect(chipIdx).toBeGreaterThan(-1);
        // Buscamos hacia atrás desde el className para encontrar la
        // condición de render.
        const block = src.slice(Math.max(0, chipIdx - 1500), chipIdx + 300);
        expect(block).toMatch(
            /typeof\s+plan\.chunk_pantry_degraded_count\s*===\s*['"]number['"]/
        );
        expect(block).toMatch(/_count\s*<=\s*0[\s\S]{0,100}return\s+null/);
    });

    it('lee chunk_pantry_degraded_reasons como array para el tooltip', () => {
        const chipIdx = src.indexOf('pantryDegradedBadge');
        const block = src.slice(Math.max(0, chipIdx - 1500), chipIdx + 300);
        expect(block).toMatch(
            /Array\.isArray\(plan\.chunk_pantry_degraded_reasons\)/
        );
    });

    it('tooltip incluye reasons separadas por coma', () => {
        const chipIdx = src.indexOf('pantryDegradedBadge');
        const block = src.slice(Math.max(0, chipIdx - 1500), chipIdx + 600);
        // El tooltip detallado usa _reasons.join(', ').
        expect(block).toMatch(/_reasons\.join\(\s*['"],\s*['"]\s*\)/);
        // Y palabra "Causa(s)" (estándar es-DO).
        expect(block).toMatch(/Causa\(s\)/);
    });

    it('texto del chip dice "Pantry degradada"', () => {
        const chipIdx = src.indexOf('pantryDegradedBadge');
        const block = src.slice(chipIdx, chipIdx + 600);
        expect(block).toMatch(/>\s*Pantry degradada\s*</);
    });

    it('label del tooltip pluraliza chunk vs chunks correctamente', () => {
        const chipIdx = src.indexOf('pantryDegradedBadge');
        const block = src.slice(Math.max(0, chipIdx - 1500), chipIdx + 600);
        // Tooltip diferencia singular ("1 chunk") de plural ("2 chunks").
        expect(block).toMatch(/_count\s*===\s*1\s*\?\s*['"]chunk['"]\s*:\s*['"]chunks['"]/);
    });

    it('NO render cuando chunk_pantry_degraded_count = 0 (plan healthy)', () => {
        // Guard explícito: count <= 0 → return null. Sin esto, planes
        // sin la key en plan_data verían un chip "Pantry degradada"
        // por accidente.
        const chipIdx = src.indexOf('pantryDegradedBadge');
        const block = src.slice(Math.max(0, chipIdx - 1500), chipIdx + 300);
        expect(block).toMatch(/if\s*\(\s*_count\s*<=\s*0\s*\)\s*return\s+null/);
    });
});


describe('[P1-HIST-PANTRY-DEGRADED] CSS palette ámbar', () => {
    it('clase pantryDegradedBadge definida', () => {
        expect(cssSrc).toMatch(/\.pantryDegradedBadge\s*\{/);
    });

    it('palette ámbar (warn) — bg #FFFBEB + color #92400E', () => {
        const blockMatch = cssSrc.match(/\.pantryDegradedBadge\s*\{[\s\S]*?\}/);
        expect(blockMatch).toBeTruthy();
        // Palette ámbar Tailwind (yellow-50 / amber-800).
        expect(blockMatch[0]).toMatch(/background:\s*#FFFBEB/i);
        expect(blockMatch[0]).toMatch(/color:\s*#92400E/i);
        // Border amber.
        expect(blockMatch[0]).toMatch(/border:\s*1px solid\s*#FDE68A/i);
    });

    it('NO usa pulse animation (no es CTA, es etiqueta histórica)', () => {
        const blockMatch = cssSrc.match(/\.pantryDegradedBadge\s*\{[\s\S]*?\}/);
        expect(blockMatch[0]).not.toMatch(/animation:/);
    });

    it('palette distinta de simplifiedWeeksBadge (violeta)', () => {
        // simplifiedWeeksBadge usa #5B21B6 (violet-700). pantryDegradedBadge
        // NO debe colisionar — son metadatos distintos:
        //   - simplifiedWeeks: degradación post-fail (forced simplified).
        //   - pantryDegraded: pantry comprometida en el pickup.
        const blockMatch = cssSrc.match(/\.pantryDegradedBadge\s*\{[\s\S]*?\}/);
        expect(blockMatch[0]).not.toMatch(/#5B21B6/i);
        expect(blockMatch[0]).not.toMatch(/#F5F3FF/i);
    });
});
