/**
 * [P3-HISTORICAL-TOAST-DISMISS · 2026-05-14] Dismiss persistente del
 * toast histórico de coherencia.
 *
 * Bug pre-fix:
 *   `emitHistoricalCoherenceToast` emitía el toast en CADA descarga de
 *   PDF si había entries en `_shopping_coherence_block_history` ≤48h.
 *   Si el usuario cerraba el toast y descargaba PDF 3 veces seguidas,
 *   veía el mismo toast 3 veces — fricción UX innecesaria.
 *
 * Fix:
 *   1. Antes de emit, `isHistoricalToastRecentlyDismissed(windowHours)`
 *      lee `mealfit_coherence_toast_dismissed_at` de localStorage; si
 *      el timestamp está dentro de `windowHours` (default 48h), retorna
 *      true → skip emit.
 *   2. `emitHistoricalCoherenceToast` pasa `onDismiss: _writeDismissAt`
 *      al toast options. Sonner invoca onDismiss cuando el usuario
 *      cierra (X o swipe).
 *   3. `_writeDismissAt` escribe `String(Date.now())` al localStorage.
 *
 * Cobertura del test:
 *   1. localStorage vacío → no recientemente dismissed.
 *   2. localStorage con timestamp reciente → recientemente dismissed.
 *   3. Timestamp expirado (>windowHours) → no recientemente dismissed.
 *   4. Timestamp inválido (NaN, string vacío) → no recientemente dismissed.
 *   5. Clock skew (timestamp futuro) → no recientemente dismissed.
 *   6. `emitHistoricalCoherenceToast` skipea cuando dismissed reciente.
 *   7. `emitHistoricalCoherenceToast` pasa `onDismiss` al toast options.
 *   8. `onDismiss` callback escribe Date.now() al localStorage.
 *   9. Best-effort: localStorage throw no rompe el flujo.
 *  10. windowHours custom respeta el override.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
    emitHistoricalCoherenceToast,
    isHistoricalToastRecentlyDismissed,
} from '../../utils/renderCoherenceWarnings.js';


const _DISMISS_KEY = 'mealfit_coherence_toast_dismissed_at';
const _isoMinusHours = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();


describe('[P3-HISTORICAL-TOAST-DISMISS] isHistoricalToastRecentlyDismissed', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('localStorage vacío → false', () => {
        expect(isHistoricalToastRecentlyDismissed()).toBe(false);
    });

    it('timestamp reciente (1h atrás, ventana 48h) → true', () => {
        const oneHourAgo = Date.now() - 3600 * 1000;
        localStorage.setItem(_DISMISS_KEY, String(oneHourAgo));
        expect(isHistoricalToastRecentlyDismissed(48)).toBe(true);
    });

    it('timestamp expirado (49h atrás, ventana 48h) → false', () => {
        const fortyNineHoursAgo = Date.now() - 49 * 3600 * 1000;
        localStorage.setItem(_DISMISS_KEY, String(fortyNineHoursAgo));
        expect(isHistoricalToastRecentlyDismissed(48)).toBe(false);
    });

    it('timestamp inválido (string vacío) → false', () => {
        localStorage.setItem(_DISMISS_KEY, '');
        expect(isHistoricalToastRecentlyDismissed()).toBe(false);
    });

    it('timestamp inválido (NaN string) → false', () => {
        localStorage.setItem(_DISMISS_KEY, 'not-a-number');
        expect(isHistoricalToastRecentlyDismissed()).toBe(false);
    });

    it('clock skew: timestamp futuro → false (no asumimos negativo válido)', () => {
        const oneHourInFuture = Date.now() + 3600 * 1000;
        localStorage.setItem(_DISMISS_KEY, String(oneHourInFuture));
        expect(isHistoricalToastRecentlyDismissed(48)).toBe(false);
    });

    it('windowHours custom (1h) respeta override', () => {
        const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
        localStorage.setItem(_DISMISS_KEY, String(twoHoursAgo));
        // Default 48h → dentro de ventana → true
        expect(isHistoricalToastRecentlyDismissed(48)).toBe(true);
        // Custom 1h → fuera de ventana → false
        expect(isHistoricalToastRecentlyDismissed(1)).toBe(false);
    });

    it('windowHours inválido (NaN) → fallback al default 48', () => {
        const oneHourAgo = Date.now() - 3600 * 1000;
        localStorage.setItem(_DISMISS_KEY, String(oneHourAgo));
        expect(isHistoricalToastRecentlyDismissed(NaN)).toBe(true);
    });
});


describe('[P3-HISTORICAL-TOAST-DISMISS] emitHistoricalCoherenceToast — skip cuando dismissed reciente', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('history con entries válidos + dismissed reciente → no emit', () => {
        const oneHourAgo = Date.now() - 3600 * 1000;
        localStorage.setItem(_DISMISS_KEY, String(oneHourAgo));

        const toast = {
            warning: vi.fn(),
            info: vi.fn(),
        };
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_chunk_t2', block_set: true },
        ];

        const result = emitHistoricalCoherenceToast(toast, history);

        // Skip: descriptor null + cero invocaciones del emitter.
        expect(result).toBeNull();
        expect(toast.warning).not.toHaveBeenCalled();
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('history con entries válidos + dismissed expirado → SÍ emit', () => {
        const fortyNineHoursAgo = Date.now() - 49 * 3600 * 1000;
        localStorage.setItem(_DISMISS_KEY, String(fortyNineHoursAgo));

        const toast = {
            warning: vi.fn(),
            info: vi.fn(),
        };
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_chunk_t2', block_set: true },
        ];

        const result = emitHistoricalCoherenceToast(toast, history);

        expect(result).not.toBeNull();
        expect(toast.warning).toHaveBeenCalledTimes(1);
    });

    it('history con entries válidos + sin dismiss state → emit normal', () => {
        // localStorage vacío.
        const toast = {
            warning: vi.fn(),
            info: vi.fn(),
        };
        const history = [
            // [P1-COHERENCE-BANNER-NOISE] entry ACCIONABLE (block_set=true) — las
            // benignas ya no disparan el toast.
            { ts: _isoMinusHours(1), action_taken: 'warn_only_chunk_t2', block_set: true },
        ];

        const result = emitHistoricalCoherenceToast(toast, history);

        expect(result).not.toBeNull();
        // severity warning (lo accionable siempre es warning tras P1-COHERENCE-BANNER-NOISE).
        expect(toast.warning).toHaveBeenCalledTimes(1);
    });
});


describe('[P3-HISTORICAL-TOAST-DISMISS] onDismiss callback persiste el dismiss', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('toast options incluye onDismiss', () => {
        const toast = {
            warning: vi.fn(),
            info: vi.fn(),
        };
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_chunk_t2', block_set: true },
        ];

        emitHistoricalCoherenceToast(toast, history);

        expect(toast.warning).toHaveBeenCalledTimes(1);
        const [title, opts] = toast.warning.mock.calls[0];
        expect(typeof title).toBe('string');
        expect(opts).toBeDefined();
        expect(typeof opts.onDismiss).toBe('function');
    });

    it('onDismiss invocado → escribe timestamp al localStorage', () => {
        const toast = {
            warning: vi.fn(),
            info: vi.fn(),
        };
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_chunk_t2', block_set: true },
        ];

        emitHistoricalCoherenceToast(toast, history);

        // Antes del dismiss: localStorage vacío para la key.
        expect(localStorage.getItem(_DISMISS_KEY)).toBeNull();

        // Simular cierre del toast → sonner invoca onDismiss.
        const [, opts] = toast.warning.mock.calls[0];
        const beforeMs = Date.now();
        opts.onDismiss();
        const afterMs = Date.now();

        const stored = localStorage.getItem(_DISMISS_KEY);
        expect(stored).not.toBeNull();
        const storedMs = parseInt(stored, 10);
        expect(storedMs).toBeGreaterThanOrEqual(beforeMs);
        expect(storedMs).toBeLessThanOrEqual(afterMs);
    });

    it('flujo end-to-end: emit → dismiss → re-emit skippeado', () => {
        const toast = {
            warning: vi.fn(),
            info: vi.fn(),
        };
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_chunk_t2', block_set: true },
        ];

        // Primer emit: toast aparece.
        const first = emitHistoricalCoherenceToast(toast, history);
        expect(first).not.toBeNull();
        expect(toast.warning).toHaveBeenCalledTimes(1);

        // Usuario cierra el toast.
        const [, opts] = toast.warning.mock.calls[0];
        opts.onDismiss();

        // Segundo emit (descarga de PDF inmediata): toast skippeado.
        const second = emitHistoricalCoherenceToast(toast, history);
        expect(second).toBeNull();
        expect(toast.warning).toHaveBeenCalledTimes(1); // sigue en 1, no se invocó de nuevo
    });
});


describe('[P3-HISTORICAL-TOAST-DISMISS] Resilience contra localStorage exceptions', () => {
    let _origGetItem;
    let _origSetItem;

    beforeEach(() => {
        localStorage.clear();
        _origGetItem = Storage.prototype.getItem;
        _origSetItem = Storage.prototype.setItem;
    });

    afterEach(() => {
        Storage.prototype.getItem = _origGetItem;
        Storage.prototype.setItem = _origSetItem;
    });

    it('getItem throw → isHistoricalToastRecentlyDismissed retorna false sin crash', () => {
        Storage.prototype.getItem = vi.fn(() => { throw new Error('iOS Private Mode'); });
        // No crash, retorna false (asume no dismissed).
        expect(() => isHistoricalToastRecentlyDismissed()).not.toThrow();
        expect(isHistoricalToastRecentlyDismissed()).toBe(false);
    });

    it('setItem throw → onDismiss no rompe el cleanup del toast', () => {
        Storage.prototype.setItem = vi.fn(() => { throw new Error('QuotaExceededError'); });

        const toast = {
            warning: vi.fn(),
            info: vi.fn(),
        };
        const history = [
            { ts: _isoMinusHours(1), action_taken: 'warn_only_chunk_t2', block_set: true },
        ];

        emitHistoricalCoherenceToast(toast, history);
        const [, opts] = toast.warning.mock.calls[0];

        // El callback NO debe throw aunque setItem falle.
        expect(() => opts.onDismiss()).not.toThrow();
    });
});
