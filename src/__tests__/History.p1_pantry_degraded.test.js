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
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const cssSrc = readFileSync(_CSS_PATH, 'utf8');


describe('[P1-HIST-PANTRY-DEGRADED] anchor', () => {
    // [removed: it('marker presente en History.jsx') tras refactor UI — el chip
    //  "Pantry degradada" de la card del Historial se eliminó de History.jsx
    //  (junto con su marker y la lectura de chunk_pantry_degraded_count/_reasons).
    //  La clase CSS .pantryDegradedBadge quedó huérfana pero PRESENTE en
    //  History.module.css (con su marker), por lo que el marker CSS + la paleta
    //  siguen verificándose abajo.]
    it('marker presente en History.module.css', () => {
        expect(cssSrc).toMatch(/\[P1-HIST-PANTRY-DEGRADED\s*·\s*2026-05-09\]/);
    });
});


// [removed: describe('[P1-HIST-PANTRY-DEGRADED] chip render') completo tras
//  refactor UI del Historial — el chip "Pantry degradada" ya NO se renderiza en
//  la card de History.jsx. Confirmado por grep whole-file: `pantryDegradedBadge`,
//  `chunk_pantry_degraded_count` y `chunk_pantry_degraded_reasons` NO aparecen en
//  History.jsx (la única mención superviviente es la key 'pantry_degraded_reason'
//  del catálogo _LM_DISPLAY_GROUPS del tab Métricas, que es otra feature). La
//  app está viva y correcta; el chip de la card se quitó deliberadamente. La CSS
//  .pantryDegradedBadge quedó huérfana pero presente (ver describe de paleta).]


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
