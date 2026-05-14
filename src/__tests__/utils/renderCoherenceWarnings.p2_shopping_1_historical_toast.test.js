/**
 * [P2-SHOPPING-1 · 2026-05-14] Consumidor de `_shopping_coherence_block_history`
 * (telemetría visible al usuario en el flujo "abrir Dashboard → descargar PDF").
 *
 * Bug pre-fix:
 *   `emitCoherenceToast` solo se invocaba tras `/recalculate-shopping-list`
 *   o `modify_single_meal` (responses con `_coherence_warnings`). El handler
 *   PDF (`handleDownloadShoppingList`) no llamaba a recalc, así que el
 *   usuario que descarga PDF directo nunca veía las divergencias
 *   capturadas por chunk worker T2, cron diario, agent_tool, /recipe/expand,
 *   etc. — aunque esas fuentes SÍ persisten entries en
 *   `_shopping_coherence_block_history`.
 *
 * Fix:
 *   Nuevo helper `buildHistoricalCoherenceToast(history, opts)` +
 *   `emitHistoricalCoherenceToast(toast, history, opts)`. Filtra entries:
 *     - `action_taken ∈ {null, "not_applicable", "hydration_error"}` → skip.
 *     - Fuera de `windowHours` (default 48h) → skip.
 *   Severidad warning si AL MENOS UNO tiene `block_set=true` o `hypotheses`
 *   incluye {cap_swallowed_modifier, unit_mismatch}; resto = info.
 *
 *   `Dashboard.jsx::handleDownloadShoppingList` invoca el helper tras
 *   el prefetch P2-NEW-14 (efectivo `effectivePlanData`).
 *
 * Cobertura del test:
 *   1. Sin history o lista vacía → null.
 *   2. Solo `not_applicable`/`hydration_error`/null → null.
 *   3. Entry reciente con action_taken válido → descriptor non-null.
 *   4. Entry fuera de ventana (>48h) → skip.
 *   5. Severity warning cuando block_set=true.
 *   6. Severity warning cuando hypotheses incluye cap_swallowed_modifier.
 *   7. Severity info cuando solo warn_only_* sin block_set/hypotheses críticas.
 *   8. Pluralización del title (1 vs N revisiones).
 *   9. `emitHistoricalCoherenceToast` invoca `toast.warning`/`toast.info`
 *      según severity y retorna descriptor.
 *  10. Fallback defensivo si `toast.warning` no existe (sonner API distinta).
 */
import { describe, it, expect, vi } from 'vitest';

import {
    buildHistoricalCoherenceToast,
    emitHistoricalCoherenceToast,
} from '../../utils/renderCoherenceWarnings.js';


const _isoMinusHours = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();


describe('[P2-SHOPPING-1] buildHistoricalCoherenceToast — input vacío/inválido', () => {
    it('null → null', () => {
        expect(buildHistoricalCoherenceToast(null)).toBeNull();
    });
    it('undefined → null', () => {
        expect(buildHistoricalCoherenceToast(undefined)).toBeNull();
    });
    it('array vacío → null', () => {
        expect(buildHistoricalCoherenceToast([])).toBeNull();
    });
    it('non-array (string) → null', () => {
        expect(buildHistoricalCoherenceToast('not_an_array')).toBeNull();
    });
});


describe('[P2-SHOPPING-1] Filtrado por action_taken', () => {
    it('solo not_applicable → null', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'not_applicable', block_set: false },
            { ts: _isoMinusHours(2), action_taken: 'not_applicable', block_set: false },
        ];
        expect(buildHistoricalCoherenceToast(history)).toBeNull();
    });

    it('solo hydration_error → null (invariant violation interna)', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'hydration_error', block_set: true },
        ];
        expect(buildHistoricalCoherenceToast(history)).toBeNull();
    });

    it('action_taken null → null (entry pre-P2-2 sin hidratar)', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: null, block_set: true },
        ];
        expect(buildHistoricalCoherenceToast(history)).toBeNull();
    });

    it('mezcla: ignora not_applicable + null y procesa warn_only_recalc', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'not_applicable', block_set: false },
            { ts: _isoMinusHours(2), action_taken: null, block_set: false },
            { ts: _isoMinusHours(3), action_taken: 'warn_only_recalc', block_set: false, hypotheses: { unknown: 1 } },
        ];
        const out = buildHistoricalCoherenceToast(history);
        expect(out).not.toBeNull();
        expect(out.count).toBe(1);
    });
});


describe('[P2-SHOPPING-1] Filtrado por ventana temporal', () => {
    it('entry hace 72h con windowHours=48 → skip', () => {
        const history = [
            { ts: _isoMinusHours(72), action_taken: 'warn_only_recalc', block_set: false },
        ];
        expect(buildHistoricalCoherenceToast(history)).toBeNull();
    });

    it('entry hace 24h con windowHours=48 → incluido', () => {
        const history = [
            { ts: _isoMinusHours(24), action_taken: 'warn_only_recalc', block_set: false },
        ];
        expect(buildHistoricalCoherenceToast(history)).not.toBeNull();
    });

    it('windowHours=0 desactiva el filtro temporal (toda la historia válida)', () => {
        const history = [
            { ts: _isoMinusHours(300), action_taken: 'warn_only_recalc', block_set: false },
        ];
        expect(buildHistoricalCoherenceToast(history, { windowHours: 0 })).not.toBeNull();
    });

    it('windowHours custom (1) recorta entries > 1h', () => {
        const history = [
            { ts: _isoMinusHours(2), action_taken: 'warn_only_recalc', block_set: false },
            { ts: _isoMinusHours(0.5), action_taken: 'warn_only_recalc', block_set: false },
        ];
        const out = buildHistoricalCoherenceToast(history, { windowHours: 1 });
        expect(out.count).toBe(1);
    });

    it('entry sin ts (campo ausente o no-string) → no se filtra por tiempo (defensivo)', () => {
        const history = [
            { action_taken: 'warn_only_recalc', block_set: false },
        ];
        expect(buildHistoricalCoherenceToast(history)).not.toBeNull();
    });
});


describe('[P2-SHOPPING-1] Severity', () => {
    it('block_set=true → severity warning', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'degrade', block_set: true, hypotheses: {} },
        ];
        expect(buildHistoricalCoherenceToast(history).severity).toBe('warning');
    });

    it('hypotheses incluye cap_swallowed_modifier → severity warning', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_chunk_t2', block_set: false, hypotheses: { cap_swallowed_modifier: 2 } },
        ];
        expect(buildHistoricalCoherenceToast(history).severity).toBe('warning');
    });

    it('hypotheses incluye unit_mismatch → severity warning', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_recalc', block_set: false, hypotheses: { unit_mismatch: 1 } },
        ];
        expect(buildHistoricalCoherenceToast(history).severity).toBe('warning');
    });

    it('solo warn_only_* sin block_set ni hypotheses críticas → severity info', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_recalc', block_set: false, hypotheses: { unknown: 1 } },
        ];
        expect(buildHistoricalCoherenceToast(history).severity).toBe('info');
    });

    it('hypotheses ausente o no-object → info (no escala falsamente)', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_recalc', block_set: false },
        ];
        expect(buildHistoricalCoherenceToast(history).severity).toBe('info');
    });
});


describe('[P2-SHOPPING-1] Pluralización + count', () => {
    it('1 entry → "una revisión"', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_recalc', block_set: false },
        ];
        const out = buildHistoricalCoherenceToast(history);
        expect(out.title.toLowerCase()).toContain('una revisión');
        expect(out.count).toBe(1);
    });

    it('3 entries → "3 revisiones"', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_recalc', block_set: false },
            { ts: _isoMinusHours(2), action_taken: 'degrade', block_set: true },
            { ts: _isoMinusHours(3), action_taken: 'warn_only_chunk_t2', block_set: false },
        ];
        const out = buildHistoricalCoherenceToast(history);
        expect(out.title).toContain('3 revisiones');
        expect(out.count).toBe(3);
    });
});


describe('[P2-SHOPPING-1] emitHistoricalCoherenceToast — integración sonner', () => {
    it('invoca toast.warning cuando severity=warning', () => {
        const toast = { warning: vi.fn(), info: vi.fn() };
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'degrade', block_set: true },
        ];
        const descriptor = emitHistoricalCoherenceToast(toast, history);
        expect(descriptor).not.toBeNull();
        expect(descriptor.severity).toBe('warning');
        expect(toast.warning).toHaveBeenCalledTimes(1);
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('invoca toast.info cuando severity=info', () => {
        const toast = { warning: vi.fn(), info: vi.fn() };
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_recalc', block_set: false },
        ];
        emitHistoricalCoherenceToast(toast, history);
        expect(toast.info).toHaveBeenCalledTimes(1);
        expect(toast.warning).not.toHaveBeenCalled();
    });

    it('null history → no llama a toast', () => {
        const toast = { warning: vi.fn(), info: vi.fn() };
        expect(emitHistoricalCoherenceToast(toast, null)).toBeNull();
        expect(toast.warning).not.toHaveBeenCalled();
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('fallback defensivo si toast.warning no existe (sonner API distinta)', () => {
        const fnToast = vi.fn();
        // Object con keys distintas — no tiene `.warning` ni `.info`. Pero
        // el objeto callable per se NO se invoca acá; el fallback path
        // requiere que `toast` sea una función. Verificamos que no crashea.
        const descriptor = emitHistoricalCoherenceToast({}, [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_recalc', block_set: false },
        ]);
        expect(descriptor).not.toBeNull();
        // Y con toast=función, sí invoca callable.
        const descriptor2 = emitHistoricalCoherenceToast(fnToast, [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_recalc', block_set: false },
        ]);
        expect(descriptor2).not.toBeNull();
        expect(fnToast).toHaveBeenCalledTimes(1);
    });
});
