// [P1-PLAN-LOTE-1149 · 2026-11-21] «Cuando abro los teclados no lo siento 100% en rendimiento, cuando me redirige se
// siente brusco». Tres cosas del lote 1148 que pesaban: la hoja ENTERA se volvía a pintar en cada evento del
// visualViewport (iOS emite uno por fotograma al panear), el campo se traía a la vista con un salto seco, y el brillo
// de la caja repintaba en cada fotograma (`background-position`).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderHook, act } from '@testing-library/react';

const plataforma = vi.hoisted(() => ({ nativo: true, so: 'ios' }));
vi.mock('../config/platform', () => ({
    isNativeApp: () => plataforma.nativo,
    nativePlatform: () => plataforma.so,
}));

import { useTecladoDeHoja, cambioPequeno, ASIENTO_MS } from '../hooks/useTecladoDeHoja';
import { _reiniciarAltoDeReferencia } from '../utils/keyboardViewport';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

const fingir = () => {
    const oyentes = {};
    const vv = { height: 844, offsetTop: 0, addEventListener: (e, fn) => { oyentes[e] = fn; }, removeEventListener: vi.fn() };
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    window.matchMedia = vi.fn(() => ({ matches: true }));
    return { vv, oyentes };
};

beforeEach(() => { _reiniciarAltoDeReferencia(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

describe('lote 1149 · la hoja no se vuelve a pintar en cada fotograma del teclado', () => {
    it('cambioPequeno: solo con el teclado abierto antes y después, y por debajo de 24 px', () => {
        const a = { inset: 403, abierto: true, alto: 441 };
        expect(cambioPequeno(a, { inset: 390, abierto: true, alto: 441 })).toBe(true);
        expect(cambioPequeno(a, { inset: 300, abierto: true, alto: 441 })).toBe(false);
        expect(cambioPequeno(a, { inset: 0, abierto: false, alto: null })).toBe(false);
        expect(cambioPequeno({ inset: 0, abierto: false, alto: null }, a)).toBe(false);
    });

    it('el paneo pequeño espera al asiento y se aplica UNA vez', () => {
        vi.useFakeTimers();
        const { vv, oyentes } = fingir();
        let pintadas = 0;
        const { result } = renderHook(() => { pintadas += 1; return useTecladoDeHoja(true); });
        act(() => { vv.height = 441; oyentes.resize(); });
        expect(result.current.inset).toBe(403);
        const antes = pintadas;
        for (const top of [4, 9, 13, 17]) act(() => { vv.offsetTop = top; oyentes.scroll(); });
        expect(pintadas).toBe(antes);            // ningún repintado durante el paneo
        expect(result.current.inset).toBe(403);
        act(() => { vi.advanceTimersByTime(ASIENTO_MS + 1); });
        expect(result.current.inset).toBe(386);  // al asentarse, el valor exacto
        expect(pintadas).toBe(antes + 1);
    });

    it('un cambio grande (cerrar, otro teclado) pasa en el acto', () => {
        const { vv, oyentes } = fingir();
        const { result } = renderHook(() => useTecladoDeHoja(true));
        act(() => { vv.height = 441; oyentes.resize(); });
        act(() => { vv.height = 844; oyentes.resize(); });
        expect(result.current.abierto).toBe(false);
    });
});

describe('lote 1149 · sin saltos secos ni repintado continuo', () => {
    it('el campo se trae a la vista con desplazamiento suave', () => {
        expect(leer('src/hooks/useTecladoDeHoja.js')).toContain("cuerpo.scrollBy({ top: d, behavior: 'smooth' })");
    });
    it('el brillo de la caja se mueve con transform (GPU) y se detiene mientras escribes', () => {
        const css = leer('src/components/dashboard/LogMealModal.module.css');
        expect(css).toContain('@keyframes lmBrillo { to { transform: translateX(-50%); } }');
        expect(css).not.toContain('background-position: 300% 0');
        expect(css).toContain('.caja:focus-within::after { animation-play-state: paused; }');
        expect(css).toContain('flex-shrink: 0;   /* con `overflow: hidden`');
        expect(css).toContain('.caja::after, .calcularTodo, .bandeja,');   // reduced-motion la apaga
    });
});
