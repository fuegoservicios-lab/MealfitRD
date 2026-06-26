// [P2-HIST-4 · 2026-05-09] Tests del chip de ajustes de coherencia
// recetas↔lista en cards del Historial.
//
// Bug original (audit historial 2026-05-08):
//   `plan_data._shopping_coherence_block_history` (P3-NEW-C
//   append-only, cap 20) era invisible en el Historial. La telemetría
//   solo se consumía operacionalmente por el cron P3-B
//   (`_aggregate_coherence_block_history_metrics`); el usuario premium
//   no veía el diferenciador de calidad ("Mealfit corrigió X drift
//   en este plan").
//
// Fix:
//   - Helper `getCoherenceAdjustsCount(plan)` cuenta entries
//     "anomalous" en el history (action_taken ∈ {degrade,
//     reject_minor, reject_high, hydration_error}).
//   - Excluye `not_applicable` (warn-only, info pura) y
//     `post_swap_revalidation` (P2-B observability — el cron P3-B
//     EXPLÍCITAMENTE lo trata como NO anomalous).
//   - Render chip cyan/teal cuando count > 0.
//
// Cobertura (regex sobre source — sin JSDOM):
//   - Helper definido como const arrow function.
//   - Lee _shopping_coherence_block_history; valida Array.isArray.
//   - Iter del array con guard typeof object + entry.action_taken string.
//   - Whitelist de los 4 valores anomalous (no blacklist — defensivo
//     contra valores nuevos que el backend agregue).
//   - Excluye explícitamente not_applicable y post_swap_revalidation
//     (los más comunes que se podrían contar por error).
//   - Render condicional + className + title attribute.
//   - Singular/plural en label.
//   - CSS: palette cyan/teal exacta.

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

describe('[P2-HIST-4] History.jsx — getCoherenceAdjustsCount helper', () => {
    it('marca el helper con anchor [P2-HIST-4 · 2026-05-09]', () => {
        expect(src).toMatch(/\[P2-HIST-4\s*·\s*2026-05-09\]/);
    });

    it('define getCoherenceAdjustsCount como const arrow function', () => {
        expect(src).toMatch(
            /const\s+getCoherenceAdjustsCount\s*=\s*\(\s*plan\s*\)\s*=>/
        );
    });

    it('lee _shopping_coherence_block_history (key con underscore prefix)', () => {
        // Si alguien deletea el underscore, este test alerta.
        const helperIdx = src.indexOf('const getCoherenceAdjustsCount');
        expect(helperIdx).toBeGreaterThan(-1);
        const block = src.slice(helperIdx, helperIdx + 1500);
        expect(block).toMatch(/data\._shopping_coherence_block_history/);
    });

    it('valida Array.isArray antes de iterar', () => {
        const helperIdx = src.indexOf('const getCoherenceAdjustsCount');
        const block = src.slice(helperIdx, helperIdx + 1500);
        expect(block).toMatch(/Array\.isArray\(\s*history\s*\)/);
        // Guard early-return: 0 cuando no es array.
        expect(block).toMatch(/return\s+0/);
    });

    it('usa SSOT helper isAnomalousCoherenceAction (whitelist defensiva)', () => {
        // [P2-HIST-AUDIT-13 · 2026-05-09] Whitelist movida a SSOT
        // `frontend/src/utils/coherenceActions.js`. Antes este test
        // verificaba los 4 string literals inline en el helper —
        // ahora verifica que el helper llama al SSOT
        // `isAnomalousCoherenceAction`. Los 4 strings canónicos se
        // verifican en `coherenceActions.test.js` (más
        // drift-detection cross-language en
        // `test_p2_hist_audit_13_coherence_anomalous_ssot.py`).
        const helperIdx = src.indexOf('const getCoherenceAdjustsCount');
        const block = src.slice(helperIdx, helperIdx + 1500);
        expect(block).toMatch(/isAnomalousCoherenceAction\(/);
    });

    it('NO cuenta not_applicable ni post_swap_revalidation', () => {
        // not_applicable = warn-only (block_set=False). No es ajuste.
        // post_swap_revalidation = P2-B observability del cron P3-B,
        // EXPLÍCITAMENTE NO anomalous.
        // Si alguien añade estos a la whitelist por confusión, el
        // chip mostraría conteos inflados que no representan
        // intervención real del sistema.
        const helperIdx = src.indexOf('const getCoherenceAdjustsCount');
        const block = src.slice(helperIdx, helperIdx + 1500);
        // Estos valores NO deben aparecer dentro del condicional
        // que incrementa el count. Como las strings literales no
        // pueden aparecer en el bloque (no las menciona), un grep
        // sobre el block las debe rechazar.
        expect(block).not.toMatch(/['"]not_applicable['"]\s*\)\s*\{/);
        expect(block).not.toMatch(/['"]post_swap_revalidation['"]\s*\)\s*\{/);
    });

    it('valida entry.action_taken como string antes de comparar', () => {
        // [P2-HIST-AUDIT-13 · 2026-05-09] El typeof check del action
        // se movió al helper SSOT `isAnomalousCoherenceAction`
        // (utils/coherenceActions.js). El typeof check del entry sí
        // se mantiene inline aquí (`typeof entry !== 'object'`).
        // Para que un dev no remueva la guardia type-safety del
        // SSOT helper, ese check vive en `coherenceActions.test.js`.
        const helperIdx = src.indexOf('const getCoherenceAdjustsCount');
        const block = src.slice(helperIdx, helperIdx + 1500);
        // El guard de entry (tipo objeto) sigue inline.
        expect(block).toMatch(/typeof\s+entry\s*!==\s*['"]object['"]/);
        // continue (skip esta entry corrupta).
        expect(block).toMatch(/continue/);
    });
});

describe('[P2-HIST-4] integración: helper produce conteos esperados', () => {
    // Reproducimos la lógica del helper inline para tests semánticos.
    function _count(history) {
        const data = { _shopping_coherence_block_history: history };
        if (!Array.isArray(data._shopping_coherence_block_history)) return 0;
        let count = 0;
        for (const entry of data._shopping_coherence_block_history) {
            if (!entry || typeof entry !== 'object') continue;
            const action = entry.action_taken;
            if (typeof action !== 'string') continue;
            if (action === 'degrade' ||
                action === 'reject_minor' ||
                action === 'reject_high' ||
                action === 'hydration_error') {
                count++;
            }
        }
        return count;
    }

    it('history vacío → 0', () => {
        expect(_count([])).toBe(0);
    });

    it('history null/undefined/no-array → 0', () => {
        expect(_count(null)).toBe(0);
        expect(_count(undefined)).toBe(0);
        expect(_count('string')).toBe(0);
        expect(_count({})).toBe(0);
    });

    it('1 entry degrade → count 1', () => {
        expect(_count([{ action_taken: 'degrade' }])).toBe(1);
    });

    it('mix de 4 anomalous → count 4', () => {
        const history = [
            { action_taken: 'degrade' },
            { action_taken: 'reject_minor' },
            { action_taken: 'reject_high' },
            { action_taken: 'hydration_error' },
        ];
        expect(_count(history)).toBe(4);
    });

    it('not_applicable y post_swap_revalidation NO cuentan', () => {
        const history = [
            { action_taken: 'not_applicable' },
            { action_taken: 'post_swap_revalidation' },
            { action_taken: 'not_applicable' },
        ];
        expect(_count(history)).toBe(0);
    });

    it('mix realista: 2 degrade + 5 not_applicable + 1 post_swap → count 2', () => {
        // Caso típico: el plan se generó OK (5 warns) pero hubo 2
        // intervenciones reales del guard. El swap subsiguiente
        // emitió 1 entry observability.
        const history = [
            { action_taken: 'not_applicable' },
            { action_taken: 'not_applicable' },
            { action_taken: 'degrade' },
            { action_taken: 'not_applicable' },
            { action_taken: 'post_swap_revalidation' },
            { action_taken: 'not_applicable' },
            { action_taken: 'degrade' },
            { action_taken: 'not_applicable' },
        ];
        expect(_count(history)).toBe(2);
    });

    it('action_taken null/undefined/object → entry skipped (no error)', () => {
        const history = [
            { action_taken: null },
            { action_taken: undefined },
            { action_taken: { reason: 'x' } },
            { action_taken: 42 },
            { action_taken: 'degrade' },
        ];
        expect(_count(history)).toBe(1); // solo el último cuenta
    });

    it('entries malformadas (null/string/no-object) skipped', () => {
        const history = [
            null,
            'string',
            42,
            { action_taken: 'degrade' },
        ];
        expect(_count(history)).toBe(1);
    });

    it('cap 20: helper procesa array completo (no reusa heurística de cap)', () => {
        // El cap se aplica server-side; el helper no debe asumir
        // que todos los entries del client son <=20. Si por alguna
        // razón llegan más, los cuenta todos.
        const history = Array.from({ length: 25 }, () => ({ action_taken: 'reject_minor' }));
        expect(_count(history)).toBe(25);
    });
});

describe('[P2-HIST-4] History.jsx — render del chip', () => {
    it('mantiene getCoherenceAdjustsCount invocado en render (no dead code)', () => {
        // [removed: tras refactor P3-HIST-DESKTOP-REDESIGN / P3-HIST-MOBILE-
        // REDESIGN · 2026-06-24] El chip "X ajustes" de la card se eliminó:
        // la lista ahora la renderizan
        // components/history/HistoryDesktopPanel.jsx + HistoryMobilePanel.jsx
        // (diseño sin ese badge). El helper NO es dead code: el modal de
        // detalle lo invoca como `getCoherenceAdjustsCount(selectedPlan)`
        // para el tab "Ajustes (N)".
        expect(src).toMatch(/getCoherenceAdjustsCount\(\s*selectedPlan\s*\)/);
    });

    // [removed: tras refactor] Se eliminaron los 3 it-blocks que
    // verificaban el render del chip de ajustes en la card (guarda
    // _count<=0 → return null; span coherenceAdjustsBadge con title; label
    // singular/plural 'ajuste'/'ajustes'). Ese chip ya no existe en
    // History.jsx — el modal muestra el conteo como tab "Ajustes (N)"
    // (siempre plural, sin badge). El helper sigue cubierto por los
    // describes 'getCoherenceAdjustsCount helper' + 'integración', y la
    // paleta por 'CSS module — coherenceAdjustsBadge palette cyan/teal'.
});

describe('[P2-HIST-4] CSS module — coherenceAdjustsBadge palette cyan/teal', () => {
    it('CSS define .coherenceAdjustsBadge', () => {
        expect(css).toMatch(/\.coherenceAdjustsBadge\b/);
    });

    it('palette cyan/teal (#ECFEFF / #155E75 / #A5F3FC)', () => {
        // Cyan/teal es DELIBERADAMENTE distinto de status (amber/red
        // — alerta), simplifiedWeeks (violet — degradación), y
        // lessonsBadge (indigo — IA). El chip dice "el sistema te
        // ayudó", no "hay un problema".
        const block = css.match(/\.coherenceAdjustsBadge\s*\{[^}]+\}/);
        expect(block).toBeTruthy();
        expect(block[0]).toMatch(/#ECFEFF/);
        expect(block[0]).toMatch(/#155E75/);
        expect(block[0]).toMatch(/#A5F3FC/);
    });

    it('comparte shape con sibling chips (border-radius 99px, font-weight 800)', () => {
        const block = css.match(/\.coherenceAdjustsBadge\s*\{[^}]+\}/);
        expect(block[0]).toMatch(/border-radius:\s*99px/);
        expect(block[0]).toMatch(/font-weight:\s*800/);
    });
});
