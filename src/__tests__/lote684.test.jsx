/**
 * [P1-PLAN-LOTE-684/685] El modo voz, más rápido y con voz de verdad.
 *  · 684: la primera frase sale en su primera coma; todas las frases completas salen a la vez del stream; 1,1 s de
 *    silencio (era 1,5 s) para dar el turno por terminado.
 *  · 685: la voz de Gemini (backend `/api/chat/voz`): cada frase se pide en cuanto llega (en paralelo) y suena en
 *    orden por Web Audio; sin audio (204, fallo), la sesión pasa a la voz del teléfono. Con la nube, abrir el modo voz
 *    no espera un saludo hablado: escucha al instante.
 * Web Audio, la síntesis del teléfono y el reconocimiento son FALSOS aquí (jsdom no trae ninguno).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const nubeMock = vi.hoisted(() => ({ pedir: null, abrir: null }));
vi.mock('../utils/vozEnLaNube', async (orig) => ({
    ...(await orig()),
    pedirVozEnLaNube: (...a) => (nubeMock.pedir ? nubeMock.pedir(...a) : Promise.resolve(null)),
    // [P1-PLAN-LOTE-901] el hook abre primero el streaming; aquí «apagado» ('wav') para probar el camino del WAV
    abrirVozEnLaNube: (...a) => (nubeMock.abrir ? nubeMock.abrir(...a) : Promise.resolve('wav')),
}));

import { crearVozDelCoach, siguienteTrozoParaVoz, textoParaHablar } from '../utils/vozDelCoach';
import { useConversacionPorVoz, VOZ_FIN_DE_FRASE_MS, VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS } from '../hooks/useConversacionPorVoz';

// ── dobles ──────────────────────────────────────────────────────────────────────────────────────────────────────
let habladas = [];
class LocucionFalsa { constructor(text) { this.text = text; } }
const sintesisFalsa = {
    speak(u) {
        if (u.text.trim()) habladas.push(u.text);
        setTimeout(() => { u.onstart?.(); setTimeout(() => u.onend?.(), 5); }, 0);
    },
    cancel: vi.fn(),
    getVoices: () => [{ lang: 'es-US', name: 'Google español de Estados Unidos' }],
    addEventListener() {},
    removeEventListener() {},
};

// Un «WAV» de mentira: 44 bytes de cabecera + el texto, para saber QUÉ frase suena.
const wavDe = (texto) => {
    const t = new TextEncoder().encode(texto);
    const b = new Uint8Array(44 + t.length);
    b.set(t, 44);
    return b.buffer;
};
class FuenteFalsa {
    constructor(ctx) { this.ctx = ctx; this.buffer = null; this.onended = null; this.parada = false; }
    connect() {}
    start() { this.ctx.sonadas.push(this.buffer?.etiqueta); ContextoFalso.fuente = this; }
    stop() { this.parada = true; }
}
class ContextoFalso {
    constructor() { this.state = 'suspended'; this.destination = {}; this.sonadas = []; ContextoFalso.ultimo = this; }
    decodeAudioData(buf) {
        const etiqueta = new TextDecoder().decode(new Uint8Array(buf).slice(44));
        return Promise.resolve({ duration: 1, etiqueta });
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createBufferSource() { return new FuenteFalsa(this); }
    createAnalyser() { return { fftSize: 512, connect() {}, getByteTimeDomainData(d) { d.fill(128); } }; }
    createBuffer() { return { etiqueta: '(muda)' }; }
    close() {}
}
const ventana = (conAudio = true) => ({
    speechSynthesis: sintesisFalsa,
    SpeechSynthesisUtterance: LocucionFalsa,
    ...(conAudio ? { AudioContext: ContextoFalso } : {}),
});
const tic = async (n = 8) => { for (let i = 0; i < n; i += 1) await Promise.resolve(); };

function nubeControlada() {
    const pedidos = [];
    return {
        pedidos,
        pedir: vi.fn((texto, { signal } = {}) => new Promise((resolve) => pedidos.push({ texto, signal, resolve }))),
    };
}

beforeEach(() => {
    habladas = [];
    sintesisFalsa.cancel.mockClear();
    ContextoFalso.ultimo = null;
    ContextoFalso.fuente = null;
    nubeMock.pedir = null;
    vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

// ── 684: el troceo del stream ───────────────────────────────────────────────────────────────────────────────────
describe('siguienteTrozoParaVoz', () => {
    const t = 'Te lo digo directo para no dar vueltas: hoy sigues en cero, y con 134 gramos por cubrir.';
    it('la primera frase sale en su primera coma o dos puntos, si ya es larga', () => {
        expect(t.slice(0, siguienteTrozoParaVoz(t, true))).toBe('Te lo digo directo para no dar vueltas:');
        expect(t.slice(0, siguienteTrozoParaVoz(t, false))).toBe(t);
        const corta = 'Bien, aquí atento. ¿Y tú?';
        expect(corta.slice(0, siguienteTrozoParaVoz(corta, true))).toBe('Bien, aquí atento.');   // «Bien,» es corta
    });
    it('sin oración completa todavía, nada', () => {
        expect(siguienteTrozoParaVoz('Hoy vas bien, pero', false)).toBe(0);
        expect(siguienteTrozoParaVoz('Primera frase. Segunda', false)).toBe('Primera frase.'.length);
        expect(siguienteTrozoParaVoz('', true)).toBe(0);
    });
    it('AgentPage lo usa para sacar TODAS las frases completas y la primera en su coma', () => {
        const ap = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        expect(ap).toMatch(/siguienteTrozoParaVoz\(fullText\.substring\(lastSpokenIndex\), lastSpokenIndex === 0\)/);
        expect(ap).toMatch(/while \(largo > 0\)/);
    });
    it('[686] el silencio que da el turno por terminado ya no es 1,1 s fijo (cortaba cada pausa)', () => {
        expect(VOZ_FIN_DE_FRASE_MS).toBe(1800);
    });
    it('sin espacio antes de la puntuación al quitar el formato', () => {
        expect(textoParaHablar('Listo, anoté **2 huevos**.')).toBe('Listo, anoté 2 huevos.');
        expect(textoParaHablar('Llevas **134 g** , bien')).toBe('Llevas 134 gramos, bien');
    });
});

// ── 685: la cola con la voz en la nube ──────────────────────────────────────────────────────────────────────────
describe('crearVozDelCoach con la nube', () => {
    it('pide todas las frases en paralelo y las toca EN ORDEN aunque lleguen desordenadas', async () => {
        const nube = nubeControlada();
        const empezadas = [];
        const alVaciarse = vi.fn();
        const voz = crearVozDelCoach({ win: ventana(), nube, alEmpezarFrase: (f) => empezadas.push(f), alVaciarse });
        expect(voz.enLaNube).toBe(true);
        voz.encolar('Primera frase. Segunda frase.');
        await tic();
        expect(nube.pedidos.map((p) => p.texto)).toEqual(['Primera frase.', 'Segunda frase.']);   // ya las dos
        nube.pedidos[1].resolve(wavDe('Segunda frase.'));
        await tic();
        expect(empezadas).toEqual([]);                        // la segunda espera a la primera
        nube.pedidos[0].resolve(wavDe('Primera frase.'));
        await tic();
        expect(ContextoFalso.ultimo.sonadas).toEqual(['Primera frase.']);
        expect(empezadas).toEqual(['Primera frase.']);
        ContextoFalso.fuente.onended();
        await tic();
        expect(ContextoFalso.ultimo.sonadas).toEqual(['Primera frase.', 'Segunda frase.']);
        ContextoFalso.fuente.onended();
        await tic();
        expect(alVaciarse).toHaveBeenCalled();
        expect(habladas).toEqual([]);                         // el teléfono no dijo nada
        expect(voz.ocupada).toBe(false);
    });

    it('sin audio de la nube (204/fallo) la sesión pasa a la voz del teléfono y corta lo pedido', async () => {
        const nube = nubeControlada();
        const voz = crearVozDelCoach({ win: ventana(), nube });
        voz.encolar('Primera frase. Segunda frase.');
        await tic();
        nube.pedidos[0].resolve(null);
        await tic();
        expect(voz.enLaNube).toBe(false);
        expect(nube.pedidos[1].signal?.aborted).toBe(true);   // no se paga la que ya no va a sonar
        await act(async () => { vi.advanceTimersByTime(30); });
        expect(habladas).toEqual(['Primera frase.', 'Segunda frase.']);
        voz.encolar('Tercera.');
        expect(nube.pedir).toHaveBeenCalledTimes(2);          // ya no vuelve a la nube en esta sesión
    });

    it('cancelar para lo que suena y aborta lo pedido', async () => {
        const nube = nubeControlada();
        const voz = crearVozDelCoach({ win: ventana(), nube });
        voz.encolar('Primera frase. Segunda frase.');
        await tic();
        nube.pedidos[0].resolve(wavDe('Primera frase.'));
        await tic();
        const sonando = ContextoFalso.fuente;
        voz.cancelar();
        expect(sonando.parada).toBe(true);
        expect(nube.pedidos[1].signal?.aborted).toBe(true);
        expect(voz.ocupada).toBe(false);
    });

    it('sin Web Audio no se usa la nube', () => {
        const nube = nubeControlada();
        const voz = crearVozDelCoach({ win: ventana(false), nube });
        expect(voz.enLaNube).toBe(false);
        voz.encolar('Hola.');
        expect(nube.pedir).not.toHaveBeenCalled();
    });

    it('desbloquear crea el AudioContext dentro del toque y lo abre con un sonido de una muestra', () => {
        const voz = crearVozDelCoach({ win: ventana(), nube: nubeControlada() });
        voz.desbloquear();
        expect(ContextoFalso.ultimo.state).toBe('running');
        expect(ContextoFalso.ultimo.sonadas).toEqual(['(muda)']);
    });
});

// ── 685: el cliente ─────────────────────────────────────────────────────────────────────────────────────────────
describe('pedirVozEnLaNube', () => {
    it('manda la frase y el idioma; 200 = el WAV, 204 o un fallo = null', async () => {
        const { pedirVozEnLaNube: pedirReal } = await vi.importActual('../utils/vozEnLaNube');
        const audio = wavDe('hola');
        const fetcher = vi.fn(async () => ({ status: 200, arrayBuffer: async () => audio }));
        expect(await pedirReal('  Hola.  ', { locale: 'es-DO', fetcher })).toBe(audio);
        const [url, init] = fetcher.mock.calls[0];
        expect(url).toBe('/api/chat/voz');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({ texto: 'Hola.', locale: 'es-DO' });
        expect(init.timeout).toBeGreaterThan(0);
        expect(await pedirReal('Hola.', { fetcher: async () => ({ status: 204 }) })).toBeNull();
        expect(await pedirReal('Hola.', { fetcher: async () => { throw new Error('red'); } })).toBeNull();
        expect(await pedirReal('   ', { fetcher })).toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});

// ── 685: el hook ────────────────────────────────────────────────────────────────────────────────────────────────
describe('useConversacionPorVoz con la voz en la nube', () => {
    class ReconocimientoFalso {
        constructor() { ReconocimientoFalso.ultimo = this; }
        start() { setTimeout(() => this.onstart?.(), 0); }
        stop() { setTimeout(() => this.onend?.(), 0); }
        abort() { setTimeout(() => this.onend?.(), 0); }
    }
    beforeEach(() => {
        window.speechSynthesis = sintesisFalsa;
        window.SpeechSynthesisUtterance = LocucionFalsa;
        window.webkitSpeechRecognition = ReconocimientoFalso;
        window.AudioContext = ContextoFalso;
    });
    afterEach(() => {
        delete window.speechSynthesis;
        delete window.SpeechSynthesisUtterance;
        delete window.webkitSpeechRecognition;
        delete window.AudioContext;
    });

    it('abrir no espera un saludo hablado: escucha al instante', async () => {
        const { result } = renderHook(() => useConversacionPorVoz({ locale: 'es-DO', enviar: vi.fn(), saludo: 'Te escucho.' }));
        act(() => result.current.abrir());
        await act(async () => { vi.advanceTimersByTime(20 + VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 10); });
        expect(habladas).toEqual([]);
        expect(result.current.estado).toBe('escuchando');
        act(() => result.current.cerrar());
    });

    it('lo que dice el coach pasa por la nube con el idioma del usuario', async () => {
        const pedidas = [];
        nubeMock.pedir = vi.fn(async (texto, opciones) => { pedidas.push([texto, opciones.locale]); return wavDe(texto); });
        const { result } = renderHook(() => useConversacionPorVoz({ locale: 'es-DO', enviar: vi.fn(), saludo: 'Te escucho.' }));
        act(() => result.current.abrir());
        act(() => result.current.hablar('Listo, anoté **2 huevos**.'));
        await act(async () => { await tic(); });
        expect(pedidas).toEqual([['Listo, anoté 2 huevos.', 'es-DO']]);
        act(() => result.current.cerrar());
    });
});
