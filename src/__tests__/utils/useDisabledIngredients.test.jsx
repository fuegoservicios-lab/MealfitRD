/**
 * [P2-15 · disabledIngredients single-source] El store compartido cierra dos
 * bugs de la versión de 3 copias:
 *   1. Drift same-tab Dashboard↔Pantry (el evento 'storage' no dispara en la
 *      pestaña que escribe).
 *   2. Fuga in-memory tras logout (clearDisabledIngredientsStore).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
    useDisabledIngredients,
    clearDisabledIngredientsStore,
    _resetDisabledIngredientsForTests,
} from '../../hooks/useDisabledIngredients';

const LS_KEY = 'mealfit_disabled_ingredients';

describe('useDisabledIngredients (P2-15)', () => {
    beforeEach(() => {
        localStorage.clear();
        _resetDisabledIngredientsForTests();
    });

    it('hidrata desde localStorage en la primera lectura', () => {
        localStorage.setItem(LS_KEY, JSON.stringify(['pollo', 'arroz']));
        const { result } = renderHook(() => useDisabledIngredients());
        expect(result.current[0]).toEqual(['pollo', 'arroz']);
    });

    it('degrada payload corrupto/no-strings a []', () => {
        localStorage.setItem(LS_KEY, JSON.stringify([{ evil: true }, 42]));
        const { result } = renderHook(() => useDisabledIngredients());
        expect(result.current[0]).toEqual([]);
    });

    it('dos consumidores de la MISMA pestaña ven el mismo valor (fix drift same-tab)', () => {
        const a = renderHook(() => useDisabledIngredients());
        const b = renderHook(() => useDisabledIngredients());
        act(() => { a.result.current[1](['yuca']); });
        expect(a.result.current[0]).toEqual(['yuca']);
        expect(b.result.current[0]).toEqual(['yuca']);
    });

    it('acepta updater funcional y persiste a localStorage; lista vacía borra la key', () => {
        const { result } = renderHook(() => useDisabledIngredients());
        act(() => { result.current[1](['res']); });
        act(() => { result.current[1]((prev) => [...prev, 'yautía']); });
        expect(JSON.parse(localStorage.getItem(LS_KEY))).toEqual(['res', 'yautía']);
        act(() => { result.current[1]([]); });
        expect(localStorage.getItem(LS_KEY)).toBeNull();
    });

    it('clearDisabledIngredientsStore vacía memoria y localStorage (teardown logout)', () => {
        const { result } = renderHook(() => useDisabledIngredients());
        act(() => { result.current[1](['pollo']); });
        act(() => { clearDisabledIngredientsStore(); });
        expect(result.current[0]).toEqual([]);
        expect(localStorage.getItem(LS_KEY)).toBeNull();
    });

    it('sincroniza cross-tab vía evento storage', () => {
        const { result } = renderHook(() => useDisabledIngredients());
        expect(result.current[0]).toEqual([]);
        act(() => {
            localStorage.setItem(LS_KEY, JSON.stringify(['plátano']));
            window.dispatchEvent(new StorageEvent('storage', { key: LS_KEY, newValue: JSON.stringify(['plátano']) }));
        });
        expect(result.current[0]).toEqual(['plátano']);
    });
});
