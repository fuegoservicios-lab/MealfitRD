/**
 * [P1-8 · useStableCallback] Hook estilo "event callback" (el patrón que React
 * propone como useEffectEvent): devuelve una función con IDENTIDAD ESTABLE que
 * SIEMPRE invoca la versión más reciente del callback (vía ref actualizado en
 * layout effect). Base para memoizar el value de AssessmentContext sin el riesgo
 * de stale-closure que tendría useCallback con dep-arrays a mano sobre 11
 * funciones de la espina.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStableCallback } from '../../hooks/useStableCallback';

describe('useStableCallback (P1-8)', () => {
    it('mantiene identidad estable a través de renders', () => {
        const { result, rerender } = renderHook(({ fn }) => useStableCallback(fn), {
            initialProps: { fn: () => 'a' },
        });
        const first = result.current;
        rerender({ fn: () => 'b' });
        rerender({ fn: () => 'c' });
        expect(result.current).toBe(first);
    });

    it('siempre invoca la versión MÁS RECIENTE del callback (sin stale-closure)', () => {
        const { result, rerender } = renderHook(({ fn }) => useStableCallback(fn), {
            initialProps: { fn: () => 'a' },
        });
        expect(result.current()).toBe('a');
        rerender({ fn: () => 'b' });
        expect(result.current()).toBe('b');
    });

    it('pasa argumentos y retorna el valor del callback', () => {
        const spy = vi.fn((x, y) => x + y);
        const { result } = renderHook(() => useStableCallback(spy));
        expect(result.current(2, 3)).toBe(5);
        expect(spy).toHaveBeenCalledWith(2, 3);
    });
});
