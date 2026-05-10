// [P1-AUDIT-HIST-6 · 2026-05-09] Tests del render del tier_breakdown
// en el modal del Historial.
//
// Bug original (audit Historial 2026-05-09):
//   El Historial mostraba el bucket de status pero NO la "calidad"
//   (quality_tier) con la que se generaron los chunks completed
//   del plan archivado. El endpoint chunk-status del plan ACTIVO
//   ya expone tier_breakdown (routers/plans.py:3349); el plan
//   archivado quedaba ciego — un plan con todos sus chunks en tier
//   `emergency` (degraded) se veía igual que uno con todos en `llm`.
//
// Fix:
//   Backend: LATERAL `jsonb_object_agg(quality_tier, count)` en
//   /history-list expone `chunk_tier_breakdown` por plan.
//   Frontend: render del tier breakdown en el modal con badges
//   coloreados según severity (llm=verde, shuffle/edge/emergency=
//   amber, failed/paused/error=rojo).
//
// Cobertura:
//   1. Anchor del marker.
//   2. Render lee `selectedPlan.chunk_tier_breakdown`.
//   3. Bloque omitido cuando breakdown es null/undefined.
//   4. Bloque omitido cuando breakdown es objeto vacío.
//   5. Tier `llm` mapea a clase Ok (verde).
//   6. Tier `shuffle/edge/emergency` mapea a clase Warn (amber).
//   7. Tier `failed/paused/error` mapea a clase Bad (rojo).
//   8. Orden estable: llm primero, luego degraded, luego errors.
//   9. Tier desconocido cae al fallback `tierBadgeNeutral`.
//   10. Entries con count=0 son filtrados antes del render.
//   11. CSS classes definidas en History.module.css.

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


describe('[P1-AUDIT-HIST-6] anchor + lectura de breakdown', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-AUDIT-HIST-6\s*·\s*2026-05-09\]/);
    });

    it('render lee selectedPlan.chunk_tier_breakdown', () => {
        expect(src).toMatch(/selectedPlan\.chunk_tier_breakdown/);
    });
});


describe('[P1-AUDIT-HIST-6] guards: omitir render cuando breakdown vacío', () => {
    it('guard chequea null/undefined', () => {
        const renderIdx = src.indexOf('selectedPlan.chunk_tier_breakdown');
        expect(renderIdx).toBeGreaterThan(-1);
        const block = src.slice(renderIdx, renderIdx + 1500);
        // Debe haber un guard: !_breakdown || ...
        expect(block).toMatch(/!_breakdown/);
    });

    it('guard chequea objeto vacío (Object.keys.length === 0)', () => {
        const renderIdx = src.indexOf('selectedPlan.chunk_tier_breakdown');
        const block = src.slice(renderIdx, renderIdx + 1500);
        expect(block).toMatch(/Object\.keys\(_breakdown\)\.length\s*===\s*0/);
    });

    it('guard rechaza tipo no-objeto', () => {
        const renderIdx = src.indexOf('selectedPlan.chunk_tier_breakdown');
        const block = src.slice(renderIdx, renderIdx + 1500);
        expect(block).toMatch(/typeof\s+_breakdown\s*!==\s*['"]object['"]/);
    });
});


describe('[P1-AUDIT-HIST-6] mapeo tier → label + clase de color', () => {
    it('tier `llm` mapea a label "Calidad LLM" + tierBadgeOk', () => {
        expect(src).toMatch(/llm:\s*['"]Calidad LLM['"]/);
        expect(src).toMatch(/llm:\s*styles\.tierBadgeOk/);
    });

    it('tiers degraded (shuffle/edge/emergency) mapean a tierBadgeWarn', () => {
        expect(src).toMatch(/shuffle:\s*styles\.tierBadgeWarn/);
        expect(src).toMatch(/edge:\s*styles\.tierBadgeWarn/);
        expect(src).toMatch(/emergency:\s*styles\.tierBadgeWarn/);
    });

    it('tiers de error (failed/paused/error) mapean a tierBadgeBad', () => {
        expect(src).toMatch(/failed:\s*styles\.tierBadgeBad/);
        expect(src).toMatch(/paused:\s*styles\.tierBadgeBad/);
        expect(src).toMatch(/error:\s*styles\.tierBadgeBad/);
    });

    it('tier desconocido cae a tierBadgeNeutral fallback', () => {
        const renderIdx = src.indexOf('_TIER_CLASSES');
        const block = src.slice(renderIdx, renderIdx + 2500);
        // Buscar el fallback `|| styles.tierBadgeNeutral`.
        expect(block).toMatch(/_TIER_CLASSES\[tier\]\s*\|\|\s*styles\.tierBadgeNeutral/);
    });
});


describe('[P1-AUDIT-HIST-6] orden estable + filtros', () => {
    it('orden _TIER_ORDER pone llm primero, luego degraded, luego errors', () => {
        const orderIdx = src.indexOf('_TIER_ORDER');
        expect(orderIdx).toBeGreaterThan(-1);
        const block = src.slice(orderIdx, orderIdx + 600);
        // Verificar el orden de aparición de los strings en el array.
        const llmIdx = block.indexOf("'llm'");
        const shuffleIdx = block.indexOf("'shuffle'");
        const failedIdx = block.indexOf("'failed'");
        expect(llmIdx).toBeGreaterThan(-1);
        expect(shuffleIdx).toBeGreaterThan(llmIdx);
        expect(failedIdx).toBeGreaterThan(shuffleIdx);
    });

    it('filtra entries con count=0 antes del render', () => {
        const renderIdx = src.indexOf('selectedPlan.chunk_tier_breakdown');
        const block = src.slice(renderIdx, renderIdx + 3000);
        // .filter(([_, count]) => ... count > 0). El regex relajado
        // permite paréntesis interiores del destructuring + arrow.
        expect(block).toMatch(/\.filter\([\s\S]*?count\s*>\s*0/);
    });

    it('coerción typeof number antes de comparar count', () => {
        const renderIdx = src.indexOf('selectedPlan.chunk_tier_breakdown');
        const block = src.slice(renderIdx, renderIdx + 3000);
        expect(block).toMatch(/typeof\s+count\s*===\s*['"]number['"]/);
    });
});


describe('[P1-AUDIT-HIST-6] CSS module classes', () => {
    it('tierBreakdownRow definido', () => {
        expect(cssSrc).toMatch(/\.tierBreakdownRow\s*\{/);
    });

    it('tierBadge base + variantes Ok/Warn/Bad/Neutral definidas', () => {
        expect(cssSrc).toMatch(/\.tierBadge\s*\{/);
        expect(cssSrc).toMatch(/\.tierBadgeOk\s*\{/);
        expect(cssSrc).toMatch(/\.tierBadgeWarn\s*\{/);
        expect(cssSrc).toMatch(/\.tierBadgeBad\s*\{/);
        expect(cssSrc).toMatch(/\.tierBadgeNeutral\s*\{/);
    });

    it('palette Ok usa verde-emerald (consistente con shoppingChip estable P3-C)', () => {
        // El comentario CSS cita la consistencia con P3-C y usa
        // background #ECFDF5 + color #065F46 (emerald palette de
        // tailwind).
        const okIdx = cssSrc.indexOf('.tierBadgeOk');
        const block = cssSrc.slice(okIdx, okIdx + 300);
        expect(block).toMatch(/#ECFDF5/i);
        expect(block).toMatch(/#065F46/i);
    });

    it('palette Bad usa rojo (alarma simétrica con statusFailed)', () => {
        const badIdx = cssSrc.indexOf('.tierBadgeBad');
        const block = cssSrc.slice(badIdx, badIdx + 300);
        expect(block).toMatch(/#FEF2F2/i);
        expect(block).toMatch(/#991B1B/i);
    });
});
