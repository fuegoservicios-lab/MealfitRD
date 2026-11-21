// [P1-PLAN-LOTE-1148 · 2026-11-21] «Cada vez que quiero escribir el teclado no se me abre perfecto en cada cosita que
// abro» (el dueño, app del iPhone, hoja «Registrar comida»). La hoja seguía con la cuenta que el chat ya había
// descartado: el parpadeo de `innerHeight` la dejaba bajo el teclado, llegaba tarde y saltaba en seco.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderHook, act } from '@testing-library/react';

const plataforma = vi.hoisted(() => ({ nativo: true, so: 'ios' }));
vi.mock('../config/platform', () => ({
    isNativeApp: () => plataforma.nativo,
    nativePlatform: () => plataforma.so,
}));

import {
    useTecladoDeHoja, estilosDeHojaConTeclado, desplazamientoParaVerCampo, estadoDeHojaAnunciado,
    CLAVE_INSET_NATIVO, ANTICIPO_MAX_MS,
} from '../hooks/useTecladoDeHoja';
import { _reiniciarAltoDeReferencia } from '../utils/keyboardViewport';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

const fingir = ({ inner = 844, vvAlto = 844, top = 0 } = {}) => {
    const oyentes = {};
    const vv = {
        height: vvAlto, offsetTop: top,
        addEventListener: (e, fn) => { oyentes[e] = fn; },
        removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'innerHeight', { value: inner, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    window.matchMedia = vi.fn(() => ({ matches: true }));
    return { vv, oyentes };
};

beforeEach(() => { _reiniciarAltoDeReferencia(); localStorage.clear(); plataforma.nativo = true; plataforma.so = 'ios'; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('lote 1148 · la hoja y el teclado en la app del iPhone', () => {
    it('el parpadeo de innerHeight (lote 114) ya no deja la hoja bajo el teclado', () => {
        const { vv, oyentes } = fingir();
        const { result } = renderHook(() => useTecladoDeHoja(true));
        // iOS entrega la geometría final y `innerHeight` cae a 441 un instante: antes se leía «el documento encogió» → 0
        act(() => { vv.height = 441; window.innerHeight = 441; oyentes.resize(); });
        expect(result.current.abierto).toBe(true);
        expect(result.current.inset).toBe(403);
        expect(result.current.alto).toBe(441);
        // y se recuerda el alto firme del teclado para la próxima apertura (la misma clave que el chat)
        expect(localStorage.getItem(CLAVE_INSET_NATIVO)).toBe('403');
    });

    it('al enfocar un campo sube YA con el alto recordado, y un evento sin teclado no la baja antes de tiempo', () => {
        vi.useFakeTimers();
        localStorage.setItem(CLAVE_INSET_NATIVO, '336');
        const { oyentes } = fingir();
        const { result } = renderHook(() => useTecladoDeHoja(true));
        const campo = document.createElement('input');
        document.body.appendChild(campo);
        act(() => { campo.focus(); });
        expect(result.current).toMatchObject({ abierto: true, inset: 336, alto: 508 });
        act(() => { oyentes.scroll(); });   // el visualViewport aún no se enteró
        expect(result.current.abierto).toBe(true);
        // teclado físico: nunca llega → a los 900 ms manda la geometría
        act(() => { vi.advanceTimersByTime(ANTICIPO_MAX_MS + 1); });
        expect(result.current.abierto).toBe(false);
    });

    it('el aviso de UIKit la mueve antes de la animación, con su duración, y al cerrar baja animada', () => {
        fingir();
        const { result } = renderHook(() => useTecladoDeHoja(true));
        act(() => { window.dispatchEvent(new CustomEvent('mf:teclado-nativo', { detail: { tipo: 'abre', alto: 335, ms: 400 } })); });
        expect(result.current).toMatchObject({ abierto: true, inset: 335, ms: 400 });
        act(() => { window.dispatchEvent(new CustomEvent('mf:teclado-nativo', { detail: { tipo: 'cierra', alto: 0, ms: 400 } })); });
        expect(result.current).toMatchObject({ abierto: false, inset: 0, ms: 400 });
        const e = estilosDeHojaConTeclado(result.current);
        expect(e.fondo).toEqual({ paddingBottom: 0, transition: 'padding-bottom 400ms cubic-bezier(0.32, 0.72, 0, 1)' });
        expect(e.panel).toEqual({ '--hoja-kb-ms': '400ms' });
    });

    it('un aviso sin animación o con un alto no creíble se ignora', () => {
        fingir();
        const { result } = renderHook(() => useTecladoDeHoja(true));
        act(() => { window.dispatchEvent(new CustomEvent('mf:teclado-nativo', { detail: { tipo: 'abre', alto: 335, ms: 0 } })); });
        act(() => { window.dispatchEvent(new CustomEvent('mf:teclado-nativo', { detail: { tipo: 'abre', alto: 40, ms: 300 } })); });
        expect(result.current.abierto).toBe(false);
        expect(estadoDeHojaAnunciado(700, 844)).toBeNull();
        expect(estadoDeHojaAnunciado(300, 844)).toEqual({ inset: 300, abierto: true, alto: 544 });
    });

    it('con el teclado abierto, los estilos llevan la curva del teclado y el panel no pasa del alto visible', () => {
        const e = estilosDeHojaConTeclado({ inset: 403, abierto: true, alto: 441, ms: 380 });
        expect(e.fondo.paddingBottom).toBe(403);
        expect(e.panel).toEqual({ '--hoja-kb-ms': '380ms', maxHeight: 429 });
    });

    it('fuera del iPhone nativo no cambia nada: ni duración ni anticipo', () => {
        plataforma.so = 'android';
        localStorage.setItem(CLAVE_INSET_NATIVO, '336');
        fingir();
        const { result } = renderHook(() => useTecladoDeHoja(true));
        const campo = document.createElement('input');
        document.body.appendChild(campo);
        act(() => { campo.focus(); });
        expect(result.current).toEqual({ inset: 0, abierto: false, alto: null });
    });
});

describe('lote 1148 · el campo que se escribe se ve dentro de la hoja', () => {
    const cuerpo = { top: 100, bottom: 500 };
    it('ya visible → no se mueve', () => {
        expect(desplazamientoParaVerCampo({ top: 200, bottom: 250 }, cuerpo)).toBe(0);
    });
    it('debajo → baja lo justo, con margen', () => {
        expect(desplazamientoParaVerCampo({ top: 520, bottom: 570 }, cuerpo)).toBe(86);
    });
    it('encima → sube', () => {
        expect(desplazamientoParaVerCampo({ top: 60, bottom: 110 }, cuerpo)).toBe(-56);
    });
    it('un campo más alto que lo visible enseña su principio', () => {
        expect(desplazamientoParaVerCampo({ top: 150, bottom: 900 }, cuerpo)).toBe(34);
    });
});

describe('lote 1148 · cableado', () => {
    it('las dos hojas pasan su cuerpo y su CSS anima el alto con la duración del teclado', () => {
        expect(leer('src/components/dashboard/LogMealModal.jsx')).toContain('useTecladoDeHoja(true, { cuerpoRef: bodyRef })');
        expect(leer('src/components/dashboard/ScanMealModal.jsx')).toContain('useTecladoDeHoja(isOpen, { cuerpoRef: bodyRef })');
        for (const css of ['src/components/dashboard/LogMealModal.module.css', 'src/components/dashboard/ScanMealModal.module.css']) {
            expect(leer(css)).toContain('transition: max-height var(--hoja-kb-ms, 0ms) cubic-bezier(0.32, 0.72, 0, 1);');
        }
        // el gesto de arrastrar devuelve el panel a la transición del CSS
        expect(leer('src/hooks/useBottomSheet.js')).toContain("if (!animar) el.style.transition = '';");
    });
});
