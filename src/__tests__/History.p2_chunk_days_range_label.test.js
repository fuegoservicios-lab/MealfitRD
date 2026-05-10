// [P2-HIST-NEW-3 · 2026-05-09] Tests del label "Días X–Y" en el badge
// de cada card del tab Métricas.
//
// Bug original (audit profundo Historial 2026-05-09):
//   El badge mostraba solo "Semana 1 · rolling_refill" — el rango de
//   días concretos cubierto por el chunk (e.g. days 4-6) ya viajaba
//   en el payload (`days_offset` + `days_count`) pero el frontend lo
//   descartaba. Operadores no podían correlacionar la card de
//   Métricas con el menú renderizado del tab Menú.
//
// Fix:
//   Compute `_daysLabel` desde `days_offset` (0-indexed → +1 para
//   user) + `days_count`. Render condicional:
//     - days_count === 1 → "Día N" (singular).
//     - days_count > 1   → "Días N–M" (en-dash).
//     - inputs inválidos (legacy/null) → label vacío (sin rango).
//
// Cobertura:
//   1. Anchor del marker.
//   2. Compute usa days_offset + days_count con typeof + >=0 / >=1.
//   3. Conversión 0-indexed → 1-indexed (start = offset + 1).
//   4. Singular vs plural label.
//   5. Render condicional: vacío cuando inputs inválidos.
//   6. Render se concatena al final del badge (Semana · kind · días).
//   7. En-dash (–) en lugar de hyphen-minus (-) para tipografía pulida.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P2-HIST-NEW-3] anchor + compute', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P2-HIST-NEW-3\s*·\s*2026-05-09\]/);
    });

    it('lee c.days_offset con typeof guard (en bloque de ajuste shift_plan)', () => {
        // [P0-HIST-FIX-6 · 2026-05-09] El typeof check sobre
        // `c.days_offset` ahora está en el bloque de ajuste por
        // _expiredDays (decide si aplicar el shift). El guard `>= 0`
        // se movió a `_adjustedOffset >= 0` (post-ajuste).
        const idx = src.indexOf('[P2-HIST-NEW-3');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(
            /typeof\s+c\.days_offset\s*===\s*['"]number['"]/
        );
        expect(block).toMatch(/_adjustedOffset\s*>=\s*0/);
    });

    it('lee c.days_count con typeof guard + _adjustedCount >= 1', () => {
        // [P0-HIST-FIX-6 · 2026-05-09] Mismo split que offset.
        const idx = src.indexOf('[P2-HIST-NEW-3');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(
            /typeof\s+c\.days_count\s*===\s*['"]number['"]/
        );
        expect(block).toMatch(/_adjustedCount\s*>=\s*1/);
    });
});


describe('[P2-HIST-NEW-3 + P0-HIST-FIX-6] conversión 1-indexed + label format', () => {
    // [P0-HIST-FIX-6 · 2026-05-09] Tras añadir el ajuste por
    // _expiredDays, el cómputo del start/end usa `_adjustedOffset` /
    // `_adjustedCount` (no `c.days_offset`/`c.days_count` directos).
    // Las variables ajustadas inicializan EN c.* y luego se modifican
    // si hay shift_plan — comportamiento equivalente cuando expired=0.
    it('start = _adjustedOffset + 1 (conversión 0-indexed → 1-indexed)', () => {
        const idx = src.indexOf('[P2-HIST-NEW-3');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/_start\s*=\s*_adjustedOffset\s*\+\s*1/);
    });

    it('end = _adjustedOffset + _adjustedCount (no -1, inclusive)', () => {
        // _end es el último día (1-indexed) cubierto por el chunk.
        // Como _start ya es offset+1, _end = offset+count cubre los
        // count días [offset+1 .. offset+count].
        const idx = src.indexOf('[P2-HIST-NEW-3');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(
            /_end\s*=\s*_adjustedOffset\s*\+\s*_adjustedCount/
        );
    });

    it('singular: "Día N" cuando _adjustedCount === 1', () => {
        const idx = src.indexOf('[P2-HIST-NEW-3');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/_adjustedCount\s*===\s*1/);
        expect(block).toMatch(/D[ií]a\s+\$\{_start\}/);
    });

    it('plural: "Días N–M" con en-dash (no hyphen-minus)', () => {
        // Tipografía: – (U+2013 EN DASH) entre rangos numéricos en
        // español es la convención correcta. Hyphen-minus (-) sería
        // OK pero en-dash es la forma editorial.
        // [P0-HIST-FIX-6 · 2026-05-09] Slice ampliado a 5000 tras
        // bloque de adjusted offset/count para shift_plan.
        const idx = src.indexOf('[P2-HIST-NEW-3');
        const block = src.slice(idx, idx + 8000);
        // El template literal incluye –.
        expect(block).toMatch(/D[ií]as\s+\$\{_start\}–\$\{_end\}/);
    });

    it('default _daysLabel = "" cuando inputs inválidos (legacy)', () => {
        // Row sin days_offset/days_count → label vacío. Sin esto, el
        // ternario no asigna y _daysLabel sería undefined → render
        // "undefined" en el badge.
        // [P0-HIST-FIX-6 · 2026-05-09] Slice ampliado a 5000 tras
        // bloque de adjusted offset/count para shift_plan.
        const idx = src.indexOf('[P2-HIST-NEW-3');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/let\s+_daysLabel\s*=\s*['"]['"]/);
    });
});


describe('[P0-HIST-FIX-6] ajuste por shift_plan (first_chunk count, otros offset)', () => {
    // El bug que motivó el fix: el primer chunk de un plan de 7 días
    // mostraba "Días 1-2" cuando user esperaba "Días 1-3" porque el
    // backend trimmó el día Vie expirado del days_count del chunk
    // (3 → 2). Para chunks posteriores, el days_offset también se
    // decrementa cuando el array se re-indexa.
    it('marker P0-HIST-FIX-6 presente en History.jsx', () => {
        expect(src).toMatch(/\[P0-HIST-FIX-6\s*·\s*2026-05-09\]/);
    });

    it('lee _expiredDays a nivel modal (selectedPlan)', () => {
        // El cómputo de expired requiere selectedPlan.plan_data —
        // se hace inline en el chunk render para no acoplar con el
        // missing-days block.
        const idx = src.indexOf('[P0-HIST-FIX-6');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 6000);
        expect(block).toMatch(/_planExpiredDays\s*=\s*Math\.max/);
    });

    it('detecta first_chunk vs initial_plan como variantes del kind inicial', () => {
        // Ambos chunk_kind son "el primer chunk" del plan — mismo
        // tratamiento. La heurística debe coincidir.
        const idx = src.indexOf('[P0-HIST-FIX-6');
        const block = src.slice(idx, idx + 6000);
        expect(block).toMatch(
            /_isFirstKind\s*=\s*c\.chunk_kind\s*===\s*['"]first_chunk['"]\s*\|\|\s*c\.chunk_kind\s*===\s*['"]initial_plan['"]/
        );
    });

    it('first_chunk: count += expired (offset stays 0)', () => {
        // El first_chunk perdió días por el trim. Sumamos los
        // expirados de vuelta para mostrar el conteo original.
        const idx = src.indexOf('[P0-HIST-FIX-6');
        const block = src.slice(idx, idx + 6000);
        expect(block).toMatch(
            /if\s*\(\s*_isFirstKind\s*\)[\s\S]{0,400}?_adjustedCount\s*=\s*c\.days_count\s*\+\s*_planExpiredDays/
        );
    });

    it('chunks NO first_kind: offset += expired (count stays)', () => {
        // Los demás chunks: su offset retrocedió cuando el array
        // se re-indexó. Sumamos los expirados al offset para
        // restaurar la numeración original.
        const idx = src.indexOf('[P0-HIST-FIX-6');
        const block = src.slice(idx, idx + 6000);
        expect(block).toMatch(
            /\}\s*else\s*\{[\s\S]{0,400}?_adjustedOffset\s*=\s*c\.days_offset\s*\+\s*_planExpiredDays/
        );
    });

    it('skip ajuste cuando _planExpiredDays === 0 (plan healthy)', () => {
        // Sin shift_plan, _expiredDays = 0 → no hay ajuste, valores
        // iniciales (= c.days_*) se preservan.
        const idx = src.indexOf('[P0-HIST-FIX-6');
        const block = src.slice(idx, idx + 6000);
        expect(block).toMatch(/_planExpiredDays\s*>\s*0/);
    });
});


describe('[P2-HIST-NEW-3] render en el badge', () => {
    it('badge concatena _wkLabel + _kindLabel + _daysLabel', () => {
        // Orden: Semana 1 · rolling_refill · Días 4–6.
        expect(src).toMatch(/\{_wkLabel\}\{_kindLabel\}\{_daysLabel\}/);
    });

    it('label arranca con " · " separador (consistente con _kindLabel)', () => {
        // Mismo patrón visual que kind: prefix " · " para bullet
        // separator. Sin esto, "Semana 1Días 4–6" sin separador.
        // [P0-HIST-FIX-6 · 2026-05-09] Slice ampliado a 5000 tras
        // bloque de adjusted offset/count para shift_plan.
        const idx = src.indexOf('[P2-HIST-NEW-3');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/['"`]\s+·\s+D[ií]a/);
        expect(block).toMatch(/['"`]\s+·\s+D[ií]as/);
    });
});
