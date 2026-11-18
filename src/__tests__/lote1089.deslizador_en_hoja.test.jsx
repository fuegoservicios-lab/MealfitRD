// [P1-PLAN-LOTE-1089 · 2026-11-18] «No puedo arrastrarlo con el dedo como si fuera un volumen»: el deslizador del pie de
// la hoja de compartir moría en iOS porque el bloqueo de la hoja cancelaba el `touchmove` que nace fuera del cuerpo.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBottomSheet } from '../hooks/useBottomSheet';

const onClose = vi.fn();
let cont, cuerpo, pie, hoja;

beforeEach(() => {
    onClose.mockReset();
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    cont = document.createElement('div');
    cuerpo = document.createElement('div');
    pie = document.createElement('div');
    cont.append(cuerpo, pie);
    document.body.appendChild(cont);
    hoja = renderHook(() => useBottomSheet({ containerRef: { current: cont }, bodyRef: { current: cuerpo }, onClose })).result.current;
});

const moverNativo = (objetivo, x, y) => {
    const ev = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'touches', { value: [{ clientX: x, clientY: y }] });
    objetivo.dispatchEvent(ev);
    return ev.defaultPrevented;
};

describe('[1089] un deslizador dentro de la hoja se arrastra', () => {
    it('el arrastre de un <input type=range> del pie NO se cancela (y no mueve la hoja)', () => {
        const rango = document.createElement('input');
        rango.type = 'range';
        pie.appendChild(rango);
        hoja.onTouchStart({ target: rango, touches: [{ clientY: 700 }], timeStamp: 0 });
        expect(moverNativo(rango, 120, 702)).toBe(false);
        hoja.onTouchMove({ target: rango, touches: [{ clientY: 900 }], timeStamp: 16 });
        hoja.onTouchEnd();
        expect(onClose).not.toHaveBeenCalled();
        expect(cont.style.transform || '').toBe('');
    });

    it('lo marcado con data-gesto-propio, igual; lo demás del pie sigue bloqueado (el fondo no se mueve)', () => {
        const propio = document.createElement('div');
        propio.setAttribute('data-gesto-propio', '');
        const dentro = document.createElement('span');
        propio.appendChild(dentro);
        pie.appendChild(propio);
        hoja.onTouchStart({ target: dentro, touches: [{ clientY: 700 }], timeStamp: 0 });
        expect(moverNativo(dentro, 100, 705)).toBe(false);
        hoja.onTouchEnd();

        const boton = document.createElement('button');
        pie.appendChild(boton);
        hoja.onTouchStart({ target: boton, touches: [{ clientY: 700 }], timeStamp: 0 });
        expect(moverNativo(boton, 100, 720)).toBe(true);
        hoja.onTouchEnd();
    });
});
