/**
 * [P2-14 · useMediaQuery SSOT] Tests conductuales del hook canónico de
 * viewport. Reemplaza a las 4 copias locales (Modal/History/Pantry/
 * MotivoActualizarModal) y a los useState+resize (Recipes/PaymentModal/
 * AgentPage/Dashboard).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery, useIsMobile } from '../../hooks/useMediaQuery';

// Stub controlable de matchMedia: permite fijar `matches` por query y
// disparar eventos 'change' manualmente.
const makeMatchMedia = () => {
    const listenersByQuery = new Map();
    const matchesByQuery = new Map();
    const impl = vi.fn((query) => ({
        get matches() { return matchesByQuery.get(query) ?? false; },
        media: query,
        addEventListener: (_type, cb) => {
            if (!listenersByQuery.has(query)) listenersByQuery.set(query, new Set());
            listenersByQuery.get(query).add(cb);
        },
        removeEventListener: (_type, cb) => {
            listenersByQuery.get(query)?.delete(cb);
        },
    }));
    const setMatches = (query, value) => {
        matchesByQuery.set(query, value);
        for (const cb of (listenersByQuery.get(query) ?? [])) {
            cb({ matches: value, media: query });
        }
    };
    return { impl, setMatches, listenersByQuery };
};

describe('useMediaQuery (P2-14)', () => {
    let mm;
    beforeEach(() => {
        mm = makeMatchMedia();
        vi.stubGlobal('matchMedia', mm.impl);
        window.matchMedia = mm.impl;
    });

    it('devuelve el estado inicial del query', () => {
        mm.setMatches('(max-width: 760px)', true);
        const { result } = renderHook(() => useMediaQuery('(max-width: 760px)'));
        expect(result.current).toBe(true);
    });

    it('reacciona a cambios del media query (change event)', () => {
        const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
        expect(result.current).toBe(false);
        act(() => { mm.setMatches('(max-width: 768px)', true); });
        expect(result.current).toBe(true);
        act(() => { mm.setMatches('(max-width: 768px)', false); });
        expect(result.current).toBe(false);
    });

    it('se des-suscribe al desmontar (no deja listeners colgados)', () => {
        const { unmount } = renderHook(() => useMediaQuery('(min-width: 641px)'));
        expect(mm.listenersByQuery.get('(min-width: 641px)').size).toBe(1);
        unmount();
        expect(mm.listenersByQuery.get('(min-width: 641px)').size).toBe(0);
    });

    it('re-suscribe cuando el query cambia', () => {
        const { result, rerender } = renderHook(({ q }) => useMediaQuery(q), {
            initialProps: { q: '(max-width: 760px)' },
        });
        mm.setMatches('(max-width: 1024px)', true);
        rerender({ q: '(max-width: 1024px)' });
        expect(result.current).toBe(true);
        // El listener del query viejo se limpió:
        expect(mm.listenersByQuery.get('(max-width: 760px)')?.size ?? 0).toBe(0);
    });

    it('useIsMobile usa el breakpoint 768 exclusivo (patrón 767.98px)', () => {
        mm.setMatches('(max-width: 767.98px)', true);
        const { result } = renderHook(() => useIsMobile());
        expect(result.current).toBe(true);
    });
});
