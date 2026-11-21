// [P1-PLAN-LOTE-1150 · 2026-11-21] «Se siente mejor, pero ahora cuando los cierro se siente raro». Al cerrar, la hoja
// empezaba a bajar y una medición tardía —el asiento del lote 1149, o un evento del visualViewport que iOS emite con
// la geometría de antes— la veía «abierta» y la volvía a subir un instante: bajaba, rebotaba y volvía a bajar.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const plataforma = vi.hoisted(() => ({ nativo: true, so: 'ios' }));
vi.mock('../config/platform', () => ({
    isNativeApp: () => plataforma.nativo,
    nativePlatform: () => plataforma.so,
}));

import { useTecladoDeHoja, ASIENTO_MS, MS_TECLADO_POR_DEFECTO } from '../hooks/useTecladoDeHoja';
import { _reiniciarAltoDeReferencia } from '../utils/keyboardViewport';

const fingir = () => {
    const oyentes = {};
    const vv = { height: 844, offsetTop: 0, addEventListener: (e, fn) => { oyentes[e] = fn; }, removeEventListener: vi.fn() };
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    window.matchMedia = vi.fn(() => ({ matches: true }));
    return { vv, oyentes };
};

let campo;
beforeEach(() => {
    _reiniciarAltoDeReferencia(); localStorage.clear(); vi.useFakeTimers();
    campo = document.createElement('input'); document.body.appendChild(campo);
});
afterEach(() => { vi.useRealTimers(); campo.remove(); });

const abrir = (vv, oyentes) => { act(() => { campo.focus(); vv.height = 441; oyentes.resize(); }); };

describe('lote 1150 · al cerrar el teclado la hoja baja UNA vez', () => {
    it('un evento con la geometría de antes no la vuelve a subir', () => {
        const { vv, oyentes } = fingir();
        const { result } = renderHook(() => useTecladoDeHoja(true));
        abrir(vv, oyentes);
        expect(result.current.abierto).toBe(true);
        act(() => { campo.blur(); });
        expect(result.current.abierto).toBe(false);
        act(() => { vv.offsetTop = 0; oyentes.scroll(); });   // iOS: aún 441 de alto
        expect(result.current.abierto).toBe(false);
        act(() => { vv.height = 844; oyentes.resize(); });
        act(() => { vi.advanceTimersByTime(MS_TECLADO_POR_DEFECTO + 300); });
        expect(result.current.abierto).toBe(false);
    });

    it('el asiento pendiente de antes del cierre no la resucita', () => {
        const { vv, oyentes } = fingir();
        const { result } = renderHook(() => useTecladoDeHoja(true));
        abrir(vv, oyentes);
        act(() => { vv.offsetTop = 10; oyentes.scroll(); });   // retoque pequeño → asiento pendiente
        act(() => { campo.blur(); });
        act(() => { vi.advanceTimersByTime(ASIENTO_MS + 1); });   // el teclado aún baja (vv sigue en 441)
        expect(result.current.abierto).toBe(false);
    });

    it('si el teclado de verdad sigue arriba, al terminar la bajada la hoja se recoloca', () => {
        const { vv, oyentes } = fingir();
        const { result } = renderHook(() => useTecladoDeHoja(true));
        abrir(vv, oyentes);
        act(() => { campo.blur(); });
        act(() => { vi.advanceTimersByTime(MS_TECLADO_POR_DEFECTO + 300); });   // vv sigue en 441: no se cerró
        expect(result.current.abierto).toBe(true);
    });

    it('enfocar otro campo durante la bajada la sube de nuevo en el acto', () => {
        const { vv, oyentes } = fingir();
        const { result } = renderHook(() => useTecladoDeHoja(true));
        abrir(vv, oyentes);
        act(() => { campo.blur(); });
        expect(result.current.abierto).toBe(false);
        act(() => { campo.focus(); });
        expect(result.current.abierto).toBe(true);
    });
});
