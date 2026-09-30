/**
 * [P1-PLAN-LOTE-909 · 2026-09-30] El modo voz no se queda en «Pensando…» para siempre. El dueño: «se queda pensando en
 * android cuando abre el modo de voz». Si el reconocedor no llama a `onstart`, antes nada lo sacaba de ahí. Ahora, a
 * los VOZ_ARRANQUE_MS se corta, se avisa al diagnóstico y se ofrece el toque; el rato del permiso no cuenta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const avisos = vi.hoisted(() => []);
vi.mock('../utils/diagnosticoVoz', () => ({
    avisarFalloDeVoz: (a) => avisos.push(a),
    avisarEstadoDeVozUnaVez: () => {},
}));

import { useConversacionPorVoz, VOZ_ARRANQUE_MS, VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS } from '../hooks/useConversacionPorVoz';

class Locucion { constructor(text) { this.text = text; } }
const sintesis = {
    speak(u) { setTimeout(() => { u.onstart?.(); setTimeout(() => u.onend?.(), 5); }, 0); },
    cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {},
};
// Un reconocedor que «arranca» y nunca dice que oye: lo que hace el del WebView de Android sin servicio de voz.
class Mudo {
    constructor() { Mudo.ultimo = this; this.abortado = false; }
    start() {}
    stop() {}
    abort() { this.abortado = true; setTimeout(() => this.onend?.(), 0); }
}

beforeEach(() => {
    avisos.length = 0;
    window.speechSynthesis = sintesis;
    window.SpeechSynthesisUtterance = Locucion;
    window.webkitSpeechRecognition = Mudo;
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
    delete window.webkitSpeechRecognition;
});

const avanzar = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

describe('el vigía del arranque del micrófono', () => {
    it('sin `onstart`, a los VOZ_ARRANQUE_MS deja de «pensar», corta, avisa y pide el toque', async () => {
        const { result } = renderHook(() => useConversacionPorVoz({ locale: 'es-DO', enviar: vi.fn() }));
        act(() => result.current.abrir());
        await avanzar(VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 50);
        expect(result.current.estado).toBe('pensando');
        await avanzar(VOZ_ARRANQUE_MS - 100);
        expect(result.current.estado).toBe('pensando');
        await avanzar(200);
        expect(result.current.estado).toBe('pausa');
        expect(result.current.error).toBeTruthy();
        expect(Mudo.ultimo.abortado).toBe(true);
        expect(avisos).toContainEqual(expect.objectContaining({ donde: 'modo_voz', codigo: 'sin_arranque' }));
    });

    it('mientras el teléfono pide el permiso no corta; al contestar, vuelve a contar', async () => {
        const { result } = renderHook(() => useConversacionPorVoz({ locale: 'es-DO', enviar: vi.fn() }));
        act(() => result.current.abrir());
        await avanzar(VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 50);
        act(() => Mudo.ultimo.onesperandopermiso(true));
        await avanzar(VOZ_ARRANQUE_MS * 3);
        expect(result.current.estado).toBe('pensando');
        act(() => Mudo.ultimo.onesperandopermiso(false));
        await avanzar(VOZ_ARRANQUE_MS + 50);
        expect(result.current.estado).toBe('pausa');
    });

    it('con `onstart` a tiempo, escucha y el vigía no hace nada', async () => {
        const { result } = renderHook(() => useConversacionPorVoz({ locale: 'es-DO', enviar: vi.fn() }));
        act(() => result.current.abrir());
        await avanzar(VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 50);
        act(() => Mudo.ultimo.onstart());
        expect(result.current.estado).toBe('escuchando');
        await avanzar(VOZ_ARRANQUE_MS + 50);
        expect(avisos.some((a) => a.codigo === 'sin_arranque')).toBe(false);
    });
});
