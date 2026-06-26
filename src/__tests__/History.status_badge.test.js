// [P1-HIST-2 · 2026-05-09] Tests estáticos del status badge derivado
// client-side en History.jsx.
//
// Bug original (audit historial 2026-05-08):
//   El historial mostraba todas las cards idénticas: un plan donde se
//   pidieron 30 días pero solo se generaron 12 (chunks dead-lettered o
//   abandono) aparecía igual que un plan completado. La card decía
//   "Plan Sintético 30 días" pero el modal solo tenía 12 días — el
//   usuario no tenía señal de que algo estaba incompleto.
//
// Fix:
//   Helper `getStatusInfo(plan)` deriva el bucket desde plan_data:
//     - 'failed' si generation_status==='failed' o
//       _recovery_exhausted_chunks no vacío.
//     - 'action_required' si _user_action_required presente.
//     - 'partial' si daysGenerated<totalDays o status raw partial-like.
//     - 'complete' default (no se renderiza chip).
//   Render: chip color-coded en cardActions (.statusPartial amber,
//   .statusFailed/.statusActionRequired red).
//
// Cobertura (regex sobre el source — sin JSDOM):
//   - Helper getStatusInfo definido en History.jsx.
//   - Lectura de los 4 campos de plan_data: total_days_requested,
//     totalDays, generation_status, _recovery_exhausted_chunks,
//     _user_action_required.
//   - 4 buckets devueltos exactamente como string literal.
//   - Render condicional con `bucket === 'complete'` → null.
//   - 3 CSS classes usadas (statusPartial, statusFailed,
//     statusActionRequired) coinciden con las del CSS module.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const css = readFileSync(_CSS_PATH, 'utf8');

describe('[P1-HIST-2] History.jsx — getStatusInfo helper', () => {
    it('marca el helper con el anchor [P1-HIST-2 · 2026-05-09]', () => {
        expect(src).toMatch(/\[P1-HIST-2\s*·\s*2026-05-09\]/);
    });

    it('define getStatusInfo como const arrow function', () => {
        expect(src).toMatch(/const\s+getStatusInfo\s*=\s*\(\s*plan\s*\)\s*=>/);
    });

    it('lee total_days_requested + fallback a totalDays + daysGenerated', () => {
        // total_days_requested es el SSOT del backend al crear el plan.
        // Si falta, fallback a totalDays (legacy field), y si tampoco
        // existe, daysGenerated (planes muy viejos sin metadata).
        expect(src).toMatch(/data\.total_days_requested/);
        expect(src).toMatch(/data\.totalDays/);
        expect(src).toMatch(/Number\.isFinite/);
    });

    it('detecta failed via generation_status==="failed" o _recovery_exhausted_chunks', () => {
        // Ambas señales indican plan irrecuperable; bucket 'failed'
        // pinta chip rojo con count.
        expect(src).toMatch(/rawStatus\s*===\s*['"]failed['"]/);
        expect(src).toMatch(/_recovery_exhausted_chunks/);
    });

    it('detecta action_required via data._user_action_required presente', () => {
        // Backend setea este flag cuando un chunk dead-letteró y el
        // usuario debe pulsar regen. != null Y != false (defensivo:
        // un valor truthy distinto a null/false cuenta).
        expect(src).toMatch(/_user_action_required/);
        expect(src).toMatch(/!=\s*null/);
    });

    it('detecta partial por count Y por rawStatus (rolling/partial/complete_partial)', () => {
        // Múltiples paths a 'partial': el backend puede setear
        // generation_status='rolling' (chunks aún corriendo) o
        // 'complete_partial' (algunos fallaron pero el resto sí), o
        // simplemente daysGenerated<totalDays sin status raw.
        expect(src).toMatch(/['"]rolling['"]/);
        expect(src).toMatch(/['"]complete_partial['"]/);
        expect(src).toMatch(/['"]partial['"]/);
        expect(src).toMatch(/daysGenerated\s*<\s*totalDays/);
    });

    it('retorna { bucket, daysGenerated, totalDays } con bucket ∈ 4 valores', () => {
        // El return debe ser un objeto con esas 3 keys; bucket debe
        // ser uno de los 4 strings literales (no enum, no número).
        expect(src).toMatch(
            /return\s*\{\s*bucket\s*,\s*daysGenerated\s*,\s*totalDays\s*\}/
        );
        for (const b of ['complete', 'partial', 'failed', 'action_required']) {
            const re = new RegExp(`bucket\\s*=\\s*['"]${b}['"]`);
            expect(src).toMatch(re);
        }
    });
});

describe('[P1-HIST-2] History.jsx — render del chip por card', () => {
    it('mantiene getStatusInfo(plan) invocado en render (no dead code)', () => {
        // [removed: tras refactor P3-HIST-DESKTOP-REDESIGN / P3-HIST-MOBILE-
        // REDESIGN · 2026-06-24] Los chips de status de la card
        // (statusPartial / statusFailed / statusActionRequired) se
        // eliminaron: la lista ahora la renderizan
        // components/history/HistoryDesktopPanel.jsx + HistoryMobilePanel.jsx
        // con un diseño sin esos badges. getStatusInfo NO es dead code:
        // sigue invocado como `getStatusInfo(plan)` dentro de
        // getTemporalStatus, que alimenta el cómputo de activePlanId.
        expect(src).toMatch(/getStatusInfo\(\s*plan\s*\)/);
    });

    // [removed: tras refactor] Se eliminaron los 5 it-blocks que
    // verificaban el render del chip de status en la card
    // (bucket==='complete' → return null; statusFailed "Falló X/Y";
    // statusActionRequired "Acción"; statusPartial "Parcial X/Y"; title
    // attribute accesible). Ese chip ya no existe en History.jsx — el
    // rendering se movió a los paneles del redesign, que no muestran
    // badges de estado de generación. La lógica de buckets sigue cubierta
    // por el describe 'getStatusInfo helper' y las paletas por el describe
    // 'CSS module' (ambos vigentes).
});

describe('[P1-HIST-2] CSS module — clases definidas y consistentes', () => {
    it('CSS define las 3 clases referenciadas por el JSX', () => {
        for (const cls of ['statusPartial', 'statusFailed', 'statusActionRequired']) {
            const re = new RegExp(`\\.${cls}\\b`);
            expect(css).toMatch(re);
        }
    });

    it('statusPartial usa palette amber (#FFFBEB / #92400E / #FDE68A)', () => {
        // Color coding consistente con tooltips/banners de partial en
        // Dashboard.jsx (mismo amber para "incompleto pero usable").
        // El selector específico `.statusPartial { ... }` (no el shared
        // combinado `.statusPartial, .statusFailed, ...`) define el color.
        const block = css.match(/\.statusPartial\s*\{[^}]+\}/g) || [];
        const blockWithColor = block.find(b => /#FFFBEB/.test(b));
        expect(blockWithColor).toBeTruthy();
        expect(blockWithColor).toMatch(/#92400E/);
    });

    it('statusFailed y statusActionRequired usan palette red', () => {
        const failedBlocks = css.match(/\.statusFailed\s*\{[^}]+\}/g) || [];
        const actionBlocks = css.match(/\.statusActionRequired\s*\{[^}]+\}/g) || [];
        const failedWithColor = failedBlocks.find(b => /#FEF2F2/.test(b));
        const actionWithColor = actionBlocks.find(b => /#FEF2F2/.test(b));
        expect(failedWithColor).toBeTruthy();
        expect(actionWithColor).toBeTruthy();
    });

    it('statusActionRequired tiene animation pulse (CTA visual)', () => {
        // Diferencia clave con statusFailed: action_required tiene un
        // CTA pendiente (regen). El pulse llama atención sutil.
        expect(css).toMatch(/animation:\s*statusPulse/);
        expect(css).toMatch(/@keyframes\s+statusPulse/);
    });
});
