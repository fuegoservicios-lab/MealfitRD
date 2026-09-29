/**
 * [P1-PLAN-LOTE-901 · 2026-09-29] La voz del coach en streaming: el primer audio a ~0,65 s en vez de ~2 s.
 * `abrirVozEnLaNube` → `{ frecuencia, lector }`; la cola lee el flujo EN CUANTO se encola y lo toca trozo a trozo
 * mientras llega, pegado en la línea de tiempo del AudioContext. `'wav'` = el streaming está apagado en el servidor
 * (se pide el WAV de siempre); `null` = la voz del teléfono. Web Audio y la síntesis son FALSOS aquí.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { crearVozDelCoach, pcmAMuestras } from '../utils/vozDelCoach';
import { abrirVozEnLaNube } from '../utils/vozEnLaNube';

let habladas = [];
class LocucionFalsa { constructor(text) { this.text = text; } }
const sintesisFalsa = {
    speak(u) {
        if (u.text.trim()) habladas.push(u.text);
        setTimeout(() => { u.onstart?.(); setTimeout(() => u.onend?.(), 5); }, 0);
    },
    cancel: vi.fn(),
    getVoices: () => [],
    addEventListener() {},
    removeEventListener() {},
};

class FuenteFalsa {
    constructor(ctx) { this.ctx = ctx; this.buffer = null; this.onended = null; this.parada = false; }
    connect() {}
    start(cuando) { this.ctx.inicios.push({ cuando, muestras: this.buffer.datos.length, frase: this.ctx.frase }); this.ctx.fuentes.push(this); }
    stop() { this.parada = true; }
}
class ContextoFalso {
    constructor() {
        this.state = 'running'; this.destination = {}; this.currentTime = 10; this.inicios = []; this.fuentes = [];
        ContextoFalso.ultimo = this;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createBufferSource() { return new FuenteFalsa(this); }
    createAnalyser() { return { fftSize: 512, connect() {}, getByteTimeDomainData(d) { d.fill(128); } }; }
    createBuffer(_canales, n, frecuencia) {
        const datos = new Float32Array(n);
        return { datos, duration: n / frecuencia, getChannelData: () => datos };
    }
    decodeAudioData() { return Promise.resolve({ duration: 1, datos: new Float32Array(24000) }); }
    close() {}
}
const ventana = () => ({ speechSynthesis: sintesisFalsa, SpeechSynthesisUtterance: LocucionFalsa, AudioContext: ContextoFalso });
const tic = async (n = 12) => { for (let i = 0; i < n; i += 1) await Promise.resolve(); };

// Un lector de flujo que el test alimenta a mano.
function lectorControlado() {
    const cola = [];
    let esperando = null;
    return {
        read: () => new Promise((resolve) => {
            if (cola.length) resolve(cola.shift()); else esperando = resolve;
        }),
        dar(bytes) { const v = { done: false, value: new Uint8Array(bytes) }; if (esperando) { const r = esperando; esperando = null; r(v); } else cola.push(v); },
        cerrar() { const v = { done: true }; if (esperando) { const r = esperando; esperando = null; r(v); } else cola.push(v); },
    };
}
const pcm = (...muestras) => new Uint8Array(new Int16Array(muestras).buffer);

beforeEach(() => { habladas = []; ContextoFalso.ultimo = null; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('pcmAMuestras', () => {
    it('Int16 little-endian → Float32 en [-1, 1)', () => {
        const { muestras, suelto } = pcmAMuestras(pcm(0, 16384, -32768));
        expect(Array.from(muestras)).toEqual([0, 0.5, -1]);
        expect(suelto).toBeNull();
    });
    it('el byte suelto de un trozo de red se antepone al siguiente', () => {
        const b = pcm(1000, 2000);
        const a = pcmAMuestras(b.slice(0, 3));
        expect(a.muestras.length).toBe(1);
        expect(a.suelto.length).toBe(1);
        const c = pcmAMuestras(b.slice(3), a.suelto);
        expect(Math.round(c.muestras[0] * 32768)).toBe(2000);
        expect(c.suelto).toBeNull();
    });
});

describe('crearVozDelCoach con la voz en streaming', () => {
    function nubeDeFlujo() {
        const abiertos = [];
        return {
            abiertos,
            pedir: vi.fn(async () => null),
            abrir: vi.fn((texto, { signal } = {}) => {
                const lector = lectorControlado();
                abiertos.push({ texto, signal, lector });
                return Promise.resolve({ frecuencia: 24000, lector });
            }),
        };
    }

    it('empieza a sonar con el PRIMER trozo, antes de que acabe el flujo, y pega los siguientes sin hueco', async () => {
        const nube = nubeDeFlujo();
        const empezadas = [];
        const voz = crearVozDelCoach({ win: ventana(), nube, alEmpezarFrase: (f) => empezadas.push(f) });
        voz.encolar('Listo, anotado.');
        await tic();
        expect(nube.abrir).toHaveBeenCalledTimes(1);
        const { lector } = nube.abiertos[0];
        lector.dar(pcm(...new Array(2400).fill(100)));   // 0,1 s
        await tic();
        const ctx = ContextoFalso.ultimo;
        expect(empezadas).toEqual(['Listo, anotado.']);
        expect(ctx.inicios).toHaveLength(1);
        expect(ctx.inicios[0].cuando).toBeCloseTo(10.05, 5);
        lector.dar(pcm(...new Array(4800).fill(100)));   // 0,2 s más
        await tic();
        expect(ctx.inicios).toHaveLength(2);
        expect(ctx.inicios[1].cuando).toBeCloseTo(10.15, 5);   // justo detrás del primero
        expect(nube.pedir).not.toHaveBeenCalled();
        voz.destruir();
    });

    it('pide todas las frases a la vez y las toca en orden; la frase acaba cuando acaban flujo y audio', async () => {
        const nube = nubeDeFlujo();
        const alVaciarse = vi.fn();
        const empezadas = [];
        const voz = crearVozDelCoach({ win: ventana(), nube, alVaciarse, alEmpezarFrase: (f) => empezadas.push(f) });
        voz.encolar('Primera frase. Segunda frase.');
        await tic();
        expect(nube.abiertos.map((a) => a.texto)).toEqual(['Primera frase.', 'Segunda frase.']);
        nube.abiertos[1].lector.dar(pcm(5, 5));
        nube.abiertos[1].lector.cerrar();
        await tic();
        expect(empezadas).toEqual([]);   // la segunda espera a la primera
        nube.abiertos[0].lector.dar(pcm(1, 1));
        nube.abiertos[0].lector.cerrar();
        await tic();
        expect(empezadas).toEqual(['Primera frase.']);
        ContextoFalso.ultimo.fuentes.at(-1).onended();
        await tic();
        expect(empezadas).toEqual(['Primera frase.', 'Segunda frase.']);
        ContextoFalso.ultimo.fuentes.at(-1).onended();
        await tic();
        expect(alVaciarse).toHaveBeenCalled();
        voz.destruir();
    });

    it("'wav' (streaming apagado en el servidor): esa frase y las siguientes van por el WAV de siempre", async () => {
        const ctxs = [];
        const nube = {
            abrir: vi.fn(async () => 'wav'),
            pedir: vi.fn(async () => { ctxs.push(1); return new ArrayBuffer(100); }),
        };
        const voz = crearVozDelCoach({ win: ventana(), nube });
        voz.encolar('Hola.');
        await tic(20);
        expect(nube.pedir).toHaveBeenCalledTimes(1);
        voz.encolar('Otra.');
        await tic(20);
        expect(nube.abrir).toHaveBeenCalledTimes(1);   // ya no intenta el streaming en esta sesión
        expect(nube.pedir).toHaveBeenCalledTimes(2);
        voz.destruir();
    });

    it('sin audio (204/fallo) habla el teléfono y aborta lo abierto', async () => {
        const nube = { abrir: vi.fn(async () => null), pedir: vi.fn() };
        const voz = crearVozDelCoach({ win: ventana(), nube });
        voz.encolar('Primera. Segunda.');
        await tic(20);
        await vi.advanceTimersByTimeAsync(20);
        expect(habladas[0]).toBe('Primera.');
        voz.destruir();
    });

    it('cancelar para lo que suena y aborta los flujos', async () => {
        const nube = nubeDeFlujo();
        const voz = crearVozDelCoach({ win: ventana(), nube });
        voz.encolar('Primera. Segunda.');
        await tic();
        nube.abiertos[0].lector.dar(pcm(1, 2, 3));
        await tic();
        voz.cancelar();
        expect(ContextoFalso.ultimo.fuentes[0].parada).toBe(true);
        expect(nube.abiertos[1].signal?.aborted).toBe(true);
        voz.destruir();
    });
});

describe('abrirVozEnLaNube', () => {
    const respuesta = (status, headers = {}, cuerpo = true) => ({
        status,
        headers: { get: (k) => headers[k] ?? null },
        body: cuerpo ? { getReader: () => ({ read: async () => ({ done: true }) }) } : null,
    });

    it('manda frase e idioma a /api/chat/voz/flujo; 200 = lector con la frecuencia del servidor', async () => {
        const fetcher = vi.fn(async () => respuesta(200, { 'X-Voz-Frecuencia': '24000' }));
        const r = await abrirVozEnLaNube('Listo.', { locale: 'en-US', fetcher });
        expect(fetcher.mock.calls[0][0]).toBe('/api/chat/voz/flujo');
        expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ texto: 'Listo.', locale: 'en-US' });
        expect(r.frecuencia).toBe(24000);
        expect(typeof r.lector.read).toBe('function');
    });

    it("204 flujo_apagado = 'wav'; cualquier otro 204 o fallo = null", async () => {
        expect(await abrirVozEnLaNube('a', { fetcher: async () => respuesta(204, { 'X-Voz-Motivo': 'flujo_apagado' }) })).toBe('wav');
        expect(await abrirVozEnLaNube('a', { fetcher: async () => respuesta(204, { 'X-Voz-Motivo': 'presupuesto' }) })).toBeNull();
        expect(await abrirVozEnLaNube('a', { fetcher: async () => { throw new Error('red'); } })).toBeNull();
        expect(await abrirVozEnLaNube('   ', { fetcher: vi.fn() })).toBeNull();
    });
});

describe('cableado', () => {
    it('el modo voz abre el streaming primero y deja el WAV de respaldo', () => {
        const src = readFileSync(join(__dirname, '..', 'hooks', 'useConversacionPorVoz.js'), 'utf8');
        expect(src).toContain('abrir: (texto, opciones) => abrirVozEnLaNube(texto, { ...opciones, locale: localeRef.current }),');
        expect(src).toContain('pedir: (texto, opciones) => pedirVozEnLaNube(texto, { ...opciones, locale: localeRef.current }),');
    });
});
