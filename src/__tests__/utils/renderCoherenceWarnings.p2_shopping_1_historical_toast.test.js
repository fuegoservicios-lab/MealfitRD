/**
 * [P2-SHOPPING-1 · 2026-05-14 · refinado P1-COHERENCE-BANNER-NOISE 2026-06-22]
 * Consumidor de `_shopping_coherence_block_history` (telemetría visible al usuario
 * en el flujo "abrir Dashboard → descargar PDF").
 *
 * `buildHistoricalCoherenceToast(history, opts)` decide si mostrar el toast
 * "Tu lista de compras tuvo N revisiones automáticas recientes".
 *
 * [P1-COHERENCE-BANNER-NOISE · 2026-06-22] El toast ahora cuenta SOLO entries
 * ACCIONABLES — `block_set=true` o `hypotheses` con `cap_swallowed_modifier` /
 * `pantry_overdeduct`. Las entries benignas (cada recálculo de duración/household
 * appendea un `warn_only_recalc` con magnitudes unknown/unit_mismatch/yield sobre
 * alimentos que SÍ están en la lista) ya NO disparan el toast — eran falsos
 * positivos ("tu lista tuvo 2 revisiones" al cambiar a 15 y luego 7 días). Espejo
 * del filtro de `summarize_divergences_for_ui` en el backend. Severidad siempre
 * `warning` (lo que queda es accionable).
 *
 * Filtros previos preservados: action_taken ∈ {null, not_applicable,
 * hydration_error} → skip; fuera de windowHours (default 48h) → skip.
 */
import { describe, it, expect, vi } from 'vitest';

import {
    buildHistoricalCoherenceToast,
    emitHistoricalCoherenceToast,
} from '../../utils/renderCoherenceWarnings.js';


const _isoMinusHours = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

// Helpers de fixture: entry ACCIONABLE (cuenta) vs BENIGNA (no cuenta).
const _actionable = (h, extra = {}) => ({
    ts: _isoMinusHours(h), action_taken: 'warn_only_recalc', block_set: false,
    hypotheses: { cap_swallowed_modifier: 1 }, ...extra,
});
const _benign = (h, extra = {}) => ({
    ts: _isoMinusHours(h), action_taken: 'warn_only_recalc', block_set: false,
    hypotheses: { unknown: 3, unit_mismatch: 2 }, ...extra,
});


describe('[P2-SHOPPING-1] buildHistoricalCoherenceToast — input vacío/inválido', () => {
    it('null → null', () => expect(buildHistoricalCoherenceToast(null)).toBeNull());
    it('undefined → null', () => expect(buildHistoricalCoherenceToast(undefined)).toBeNull());
    it('array vacío → null', () => expect(buildHistoricalCoherenceToast([])).toBeNull());
    it('non-array (string) → null', () => expect(buildHistoricalCoherenceToast('not_an_array')).toBeNull());
});


describe('[P1-COHERENCE-BANNER-NOISE] Solo entries ACCIONABLES disparan el toast', () => {
    it('recálculos benignos (unknown/unit_mismatch, sin block) → null (EL FIX)', () => {
        const history = [_benign(1), _benign(2), _benign(3)];
        expect(buildHistoricalCoherenceToast(history)).toBeNull();
    });

    it('entry con cap_swallowed_modifier → cuenta', () => {
        const out = buildHistoricalCoherenceToast([_actionable(1)]);
        expect(out).not.toBeNull();
        expect(out.count).toBe(1);
    });

    it('entry con pantry_overdeduct → cuenta', () => {
        const out = buildHistoricalCoherenceToast([
            _benign(1, { hypotheses: { pantry_overdeduct: 1 } }),
        ]);
        expect(out).not.toBeNull();
    });

    it('entry con block_set=true (aunque hypotheses vacío) → cuenta', () => {
        const out = buildHistoricalCoherenceToast([
            { ts: _isoMinusHours(1), action_taken: 'degrade', block_set: true, hypotheses: {} },
        ]);
        expect(out).not.toBeNull();
    });

    it('mezcla benigno + accionable → cuenta solo el accionable', () => {
        const history = [_benign(1), _benign(2), _actionable(3)];
        const out = buildHistoricalCoherenceToast(history);
        expect(out.count).toBe(1);
    });
});


describe('[P2-SHOPPING-1] Filtrado por action_taken', () => {
    it('solo not_applicable → null', () => {
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'not_applicable', block_set: true, hypotheses: { cap_swallowed_modifier: 1 } },
        ];
        expect(buildHistoricalCoherenceToast(history)).toBeNull();
    });
    it('solo hydration_error → null', () => {
        const history = [{ ts: _isoMinusHours(1), action_taken: 'hydration_error', block_set: true }];
        expect(buildHistoricalCoherenceToast(history)).toBeNull();
    });
    it('action_taken null → null', () => {
        const history = [{ ts: _isoMinusHours(1), action_taken: null, block_set: true }];
        expect(buildHistoricalCoherenceToast(history)).toBeNull();
    });
});


describe('[P2-SHOPPING-1] Filtrado por ventana temporal (sobre entries accionables)', () => {
    it('entry accionable hace 72h con windowHours=48 → skip', () => {
        expect(buildHistoricalCoherenceToast([_actionable(72)])).toBeNull();
    });
    it('entry accionable hace 24h con windowHours=48 → incluido', () => {
        expect(buildHistoricalCoherenceToast([_actionable(24)])).not.toBeNull();
    });
    it('windowHours=0 desactiva el filtro temporal', () => {
        expect(buildHistoricalCoherenceToast([_actionable(300)], { windowHours: 0 })).not.toBeNull();
    });
    it('windowHours custom (1) recorta entries > 1h', () => {
        const out = buildHistoricalCoherenceToast([_actionable(2), _actionable(0.5)], { windowHours: 1 });
        expect(out.count).toBe(1);
    });
    it('entry accionable sin ts → no se filtra por tiempo (defensivo)', () => {
        expect(buildHistoricalCoherenceToast([_actionable(1, { ts: undefined })])).not.toBeNull();
    });
});


describe('[P2-SHOPPING-1] Severity (siempre warning para lo accionable)', () => {
    it('block_set=true → warning', () => {
        const out = buildHistoricalCoherenceToast([
            { ts: _isoMinusHours(1), action_taken: 'degrade', block_set: true, hypotheses: {} },
        ]);
        expect(out.severity).toBe('warning');
    });
    it('cap_swallowed_modifier → warning', () => {
        expect(buildHistoricalCoherenceToast([_actionable(1)]).severity).toBe('warning');
    });
});


describe('[P2-SHOPPING-1] Pluralización + count', () => {
    it('1 entry → "una revisión"', () => {
        const out = buildHistoricalCoherenceToast([_actionable(1)]);
        expect(out.title.toLowerCase()).toContain('una revisión');
        expect(out.count).toBe(1);
    });
    it('3 entries accionables → "3 revisiones"', () => {
        const out = buildHistoricalCoherenceToast([
            _actionable(1),
            { ts: _isoMinusHours(2), action_taken: 'degrade', block_set: true },
            _actionable(3, { hypotheses: { pantry_overdeduct: 1 } }),
        ]);
        expect(out.title).toContain('3 revisiones');
        expect(out.count).toBe(3);
    });
});


describe('[P2-SHOPPING-1] emitHistoricalCoherenceToast — integración sonner', () => {
    it('invoca toast.warning cuando hay entry accionable', () => {
        const toast = { warning: vi.fn(), info: vi.fn() };
        const descriptor = emitHistoricalCoherenceToast(toast, [
            { ts: _isoMinusHours(1), action_taken: 'degrade', block_set: true },
        ]);
        expect(descriptor).not.toBeNull();
        expect(descriptor.severity).toBe('warning');
        expect(toast.warning).toHaveBeenCalledTimes(1);
    });

    it('recálculos benignos → NO llama a toast (el fix)', () => {
        const toast = { warning: vi.fn(), info: vi.fn() };
        expect(emitHistoricalCoherenceToast(toast, [_benign(1), _benign(2)])).toBeNull();
        expect(toast.warning).not.toHaveBeenCalled();
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('null history → no llama a toast', () => {
        const toast = { warning: vi.fn(), info: vi.fn() };
        expect(emitHistoricalCoherenceToast(toast, null)).toBeNull();
        expect(toast.warning).not.toHaveBeenCalled();
    });

    it('fallback defensivo con toast=función', () => {
        const fnToast = vi.fn();
        const descriptor = emitHistoricalCoherenceToast(fnToast, [_actionable(1)]);
        expect(descriptor).not.toBeNull();
        expect(fnToast).toHaveBeenCalledTimes(1);
    });
});
