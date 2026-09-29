/**
 * [P1-PLAN-LOTE-904 · 2026-09-29] Un «ah» suelto no es un mensaje. En el modo voz del dueño el reconocedor mandó «Ah»
 * y el coach le contestó sobre el agua (y encima la guarda del diario lo hizo responder dos veces). Ahora lo que es solo
 * ruido no se envía: se sigue escuchando, con el mismo tope de reaperturas que una frase cortada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
    useConversacionPorVoz,
    VOZ_FIN_A_MEDIAS_MS,
    VOZ_MAX_REAPERTURAS,
    VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS,
} from '../hooks/useConversacionPorVoz';

class LocucionFalsa { constructor(text) { this.text = text; } }
const sintesisFalsa = {
    speak(u) { setTimeout(() => { u.onstart?.(); setTimeout(() => u.onend?.(), 5); }, 0); },
    cancel: vi.fn(),
    getVoices: () => [{ lang: 'es-US', name: 'Google español de Estados Unidos' }],
    addEventListener() {},
    removeEventListener() {},
};
class ReconocimientoFalso {
    constructor() { ReconocimientoFalso.todos.push(this); }
    static get ultimo() { return ReconocimientoFalso.todos.at(-1); }
    start() {
        if (ReconocimientoFalso.fallarArranque) throw new Error('not-allowed');
        setTimeout(() => this.onstart?.(), 0);
    }
    stop() { this.parado = true; setTimeout(() => this.onend?.(), 0); }
    abort() { setTimeout(() => this.onend?.(), 0); }
    decir(texto) { const r = [[{ transcript: texto }]]; r[0].isFinal = false; this.onresult?.({ results: r }); }
    cortarseSolo() { this.onend?.(); }       // el reconocedor termina por su cuenta, sin stop()
}

beforeEach(() => {
    ReconocimientoFalso.todos = [];
    ReconocimientoFalso.fallarArranque = false;
    window.speechSynthesis = sintesisFalsa;
    window.SpeechSynthesisUtterance = LocucionFalsa;
    window.webkitSpeechRecognition = ReconocimientoFalso;
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
    delete window.webkitSpeechRecognition;
});

const avanzar = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

async function abrirYEscuchar(enviar) {
    const hook = renderHook(() => useConversacionPorVoz({ locale: 'es-DO', enviar }));   // sin saludo: escucha ya
    act(() => hook.result.current.abrir());
    await avanzar(VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 20);
    expect(hook.result.current.estado).toBe('escuchando');
    return hook;
}

import { esSoloRuido } from '../utils/dictado';

describe('esSoloRuido', () => {
    it('muletillas sueltas sí; una respuesta o una comida no', () => {
        for (const t of ['Ah', 'ah.', 'Mmm', 'eh eh', 'Ay']) expect(esSoloRuido(t)).toBe(true);
        for (const t of ['sí', 'no', 'ok', 'ajá', 'ah, me comí un mangú', 'pan', '']) expect(esSoloRuido(t)).toBe(false);
    });
});

describe('el modo voz no envía el ruido', () => {
    it('«Ah» → no se envía y se vuelve a escuchar; lo siguiente sí se envía', async () => {
        const enviar = vi.fn(async () => {});
        const hook = await abrirYEscuchar(enviar);
        const r1 = ReconocimientoFalso.ultimo;
        act(() => r1.decir('Ah'));
        await avanzar(VOZ_FIN_A_MEDIAS_MS + 50);
        expect(enviar).not.toHaveBeenCalled();
        expect(ReconocimientoFalso.todos.length).toBe(2);   // reabrió
        const r2 = ReconocimientoFalso.ultimo;
        await avanzar(20);
        act(() => r2.decir('me comí dos huevos revueltos'));
        await avanzar(VOZ_FIN_A_MEDIAS_MS + 50);
        expect(enviar).toHaveBeenCalledTimes(1);
        expect(enviar.mock.calls[0][0]).toBe('me comí dos huevos revueltos');
        act(() => hook.result.current.cerrar());
    });

    it('ruido sin fin: se para en el tope de reaperturas, sin enviar nada', async () => {
        const enviar = vi.fn(async () => {});
        const hook = await abrirYEscuchar(enviar);
        for (let i = 0; i <= VOZ_MAX_REAPERTURAS + 1; i += 1) {
            act(() => ReconocimientoFalso.ultimo.decir('mmm'));
            await avanzar(VOZ_FIN_A_MEDIAS_MS + 50);
        }
        expect(enviar).not.toHaveBeenCalled();
        expect(ReconocimientoFalso.todos.length).toBeLessThanOrEqual(VOZ_MAX_REAPERTURAS + 2);
        act(() => hook.result.current.cerrar());
    });
});
