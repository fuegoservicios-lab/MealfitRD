/**
 * [P1-PLAN-LOTE-686] Que el modo voz te deje hablar. El dueño: «me corta rápido cuando dejo de hablar; quiero que me
 * deje hablar y que se corte de manera muy natural». El reconocedor le entregó «Yo me comí un plátano maduro con dos»:
 * 1,1 s fijo cortaba cada pausa para pensar.
 *  · El silencio depende de cómo queda la frase: colgando (5 s), corta (4,4 s) o completa (3,8 s).
 *  · Si el reconocedor se corta SOLO a media frase (Android en cada pausa), se reabre y se sigue sumando.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
    silencioParaTerminar,
    useConversacionPorVoz,
    VOZ_FIN_A_MEDIAS_MS,
    VOZ_FIN_CORTA_MS,
    VOZ_FIN_DE_FRASE_MS,
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

describe('silencioParaTerminar', () => {
    it('espera más si la frase quedó colgando, algo más si es cortísima, y lo normal si está completa', () => {
        expect(silencioParaTerminar('Yo me comí un plátano maduro con dos')).toBe(VOZ_FIN_A_MEDIAS_MS);   // el caso del dueño
        expect(silencioParaTerminar('comí arroz y')).toBe(VOZ_FIN_A_MEDIAS_MS);
        expect(silencioParaTerminar('me comí eh')).toBe(VOZ_FIN_A_MEDIAS_MS);
        expect(silencioParaTerminar('comí 2')).toBe(VOZ_FIN_A_MEDIAS_MS);
        expect(silencioParaTerminar('I had eggs and')).toBe(VOZ_FIN_A_MEDIAS_MS);
        expect(silencioParaTerminar('Hoy')).toBe(VOZ_FIN_CORTA_MS);
        expect(silencioParaTerminar('me comí dos huevos revueltos')).toBe(VOZ_FIN_DE_FRASE_MS);
        expect(silencioParaTerminar('')).toBe(VOZ_FIN_A_MEDIAS_MS);
        expect(VOZ_FIN_DE_FRASE_MS).toBeGreaterThan(1100);
    });
});

describe('dejar hablar', () => {
    it('deja pensar tres segundos y reinicia la espera al continuar, sin mandar dos mensajes', async () => {
        const enviar = vi.fn(() => new Promise(() => {}));
        await abrirYEscuchar(enviar);
        act(() => ReconocimientoFalso.ultimo.decir('me comí dos huevos revueltos'));
        await avanzar(3000);
        expect(enviar).not.toHaveBeenCalled();
        act(() => ReconocimientoFalso.ultimo.decir('me comí dos huevos revueltos y tostadas'));
        await avanzar(3000);
        expect(enviar).not.toHaveBeenCalled();
        await avanzar(810);
        expect(enviar).toHaveBeenCalledExactlyOnceWith('me comí dos huevos revueltos y tostadas');
    });
    it('una pausa tras «con dos» no corta: espera el resto y manda la frase entera', async () => {
        const enviar = vi.fn(() => new Promise(() => {}));
        await abrirYEscuchar(enviar);
        act(() => ReconocimientoFalso.ultimo.decir('Yo me comí un plátano maduro con dos'));
        await avanzar(VOZ_FIN_DE_FRASE_MS + 200);            // con 1,1 s fijo ya se habría ido
        expect(enviar).not.toHaveBeenCalled();
        act(() => ReconocimientoFalso.ultimo.decir('Yo me comí un plátano maduro con dos huevos revueltos'));
        await avanzar(VOZ_FIN_DE_FRASE_MS + 20);
        expect(enviar).toHaveBeenCalledWith('Yo me comí un plátano maduro con dos huevos revueltos');
    });

    it('si el reconocedor se corta solo a media frase, se reabre y SUMA lo que sigue', async () => {
        const enviar = vi.fn(() => new Promise(() => {}));
        const { result } = await abrirYEscuchar(enviar);
        const primero = ReconocimientoFalso.ultimo;
        act(() => primero.decir('me comí un plátano con'));
        await avanzar(300);
        act(() => primero.cortarseSolo());                   // Android: fin de sesión en la pausa
        await avanzar(20);
        expect(enviar).not.toHaveBeenCalled();
        expect(ReconocimientoFalso.todos).toHaveLength(2);   // reabierto
        expect(result.current.oido).toBe('me comí un plátano con');
        act(() => ReconocimientoFalso.ultimo.decir('dos huevos'));
        expect(result.current.oido).toBe('me comí un plátano con dos huevos');
        await avanzar(VOZ_FIN_DE_FRASE_MS + 20);
        expect(enviar).toHaveBeenCalledWith('me comí un plátano con dos huevos');
    });

    it('si se corta solo tras un silencio largo, manda sin reabrir', async () => {
        const enviar = vi.fn(() => new Promise(() => {}));
        await abrirYEscuchar(enviar);
        const rec = ReconocimientoFalso.ultimo;
        act(() => rec.decir('me comí dos huevos revueltos'));
        // el reconocedor se adelanta y corta, pero ya pasó el silencio de una frase completa
        vi.setSystemTime(Date.now() + VOZ_FIN_DE_FRASE_MS + 50);
        act(() => rec.cortarseSolo());
        await avanzar(20);
        expect(ReconocimientoFalso.todos).toHaveLength(1);
        expect(enviar).toHaveBeenCalledWith('me comí dos huevos revueltos');
    });

    it('no reabre sin fin: tras el tope de reaperturas, manda lo que tiene', async () => {
        const enviar = vi.fn(() => new Promise(() => {}));
        await abrirYEscuchar(enviar);
        act(() => ReconocimientoFalso.ultimo.decir('y'));
        for (let i = 0; i <= VOZ_MAX_REAPERTURAS; i += 1) {
            act(() => ReconocimientoFalso.ultimo.cortarseSolo());
            await avanzar(20);
        }
        expect(ReconocimientoFalso.todos.length).toBe(VOZ_MAX_REAPERTURAS + 1);
        expect(enviar).toHaveBeenCalledWith('y');
    });

    it('si la reapertura no puede arrancar (Safari sin toque), manda lo ya dicho en vez de perderlo', async () => {
        const enviar = vi.fn(() => new Promise(() => {}));
        await abrirYEscuchar(enviar);
        act(() => ReconocimientoFalso.ultimo.decir('me comí un mangú con'));
        ReconocimientoFalso.fallarArranque = true;
        act(() => ReconocimientoFalso.ultimo.cortarseSolo());
        await avanzar(20);
        expect(enviar).toHaveBeenCalledWith('me comí un mangú con');
    });

    it('tocar el círculo manda ya, sin esperar el silencio', async () => {
        const enviar = vi.fn(() => new Promise(() => {}));
        const { result } = await abrirYEscuchar(enviar);
        act(() => ReconocimientoFalso.ultimo.decir('me comí dos huevos con'));
        act(() => result.current.tocar());
        await avanzar(20);
        expect(enviar).toHaveBeenCalledWith('me comí dos huevos con');
    });
});
