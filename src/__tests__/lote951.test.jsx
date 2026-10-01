/**
 * [P1-PLAN-LOTE-951 · 2026-09-30] Android: el modo voz se quedaba en «Pensando…» porque el micrófono nunca arrancaba.
 *
 * El primer diagnóstico del 909 (Xiaomi 2312DRA50G, Android 16): plugins presentes, permiso concedido, y el
 * reconocedor sin «started» ni error en 8 s. Capacitor corre los métodos nativos de TODOS los plugins en un único hilo
 * (`HandlerThread("CapacitorPlugins")`), y el modo voz, ANTES de abrir el micrófono, le pedía al plugin de TTS la lista
 * de voces (`getVoices()`, llamada síncrona al motor de voz del teléfono) y un `cancel()`: si el motor tarda o se
 * cuelga, el `start()` del reconocedor nunca corre. El dictado normal no crea la voz del coach: por eso no lo sufría.
 *
 * Aquí los DOS plugins son falsos y anotan cada llamada nativa en un mismo registro: la prueba es el ORDEN.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const nativo = vi.hoisted(() => ({ registro: [], plataforma: 'android', plugins: new Set(['SpeechRecognition', 'SpeechSynthesis']) }));
vi.mock('../config/platform', async (orig) => ({
    ...(await orig()),
    nativePlatform: () => nativo.plataforma,
    nativePluginAvailable: (n) => nativo.plugins.has(n),
    isNativeApp: () => true,
}));
const avisos = vi.hoisted(() => []);
vi.mock('../utils/diagnosticoVoz', () => ({ avisarFalloDeVoz: (a) => avisos.push(a), avisarEstadoDeVozUnaVez: () => {} }));

// El reconocedor de Android, falso: por defecto arranca y dice «started»; con `mudo`, nunca.
const rec = vi.hoisted(() => ({ oyentes: {}, mudo: false }));
vi.mock('@capgo/capacitor-speech-recognition', () => ({
    SpeechRecognition: {
        checkPermissions: async () => { nativo.registro.push('rec.checkPermissions'); return { speechRecognition: 'granted' }; },
        requestPermissions: async () => ({ speechRecognition: 'granted' }),
        addListener: async (ev, f) => { nativo.registro.push('rec.addListener'); rec.oyentes[ev] = f; return { remove() {} }; },
        start: async () => {
            nativo.registro.push('rec.start');
            if (rec.mudo) return new Promise(() => {});
            rec.oyentes.listeningState?.({ state: 'startingListening' });
            rec.oyentes.listeningState?.({ state: 'started', status: 'started' });
        },
        stop: async () => { nativo.registro.push('rec.stop'); },
        forceStop: async () => { nativo.registro.push('rec.forceStop'); },
        getLastPartialResult: async () => ({ available: false }),
    },
}));
// El TextToSpeech del plugin, falso.
vi.mock('@capgo/capacitor-speech-synthesis', () => ({
    SpeechSynthesis: {
        addListener: async () => { nativo.registro.push('tts.addListener'); return { remove() {} }; },
        getVoices: async () => { nativo.registro.push('tts.getVoices'); return { voices: [{ id: 'v', name: 'v', language: 'es-US' }] }; },
        speak: async () => { nativo.registro.push('tts.speak'); return { utteranceId: 'u1' }; },
        cancel: async () => { nativo.registro.push('tts.cancel'); },
    },
}));

import { useConversacionPorVoz, VOZ_ARRANQUE_MS, VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS } from '../hooks/useConversacionPorVoz';
import { ReconocimientoNativo } from '../utils/vozNativa';

beforeEach(() => { nativo.registro.length = 0; avisos.length = 0; rec.oyentes = {}; rec.mudo = false; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const avanzar = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
const asentar = async (n = 8) => { for (let i = 0; i < n; i += 1) await act(async () => { await Promise.resolve(); }); };

describe('abrir el modo voz en Android', () => {
    it('el micrófono arranca sin que ninguna llamada al motor de voz (getVoices, cancel) se le ponga delante', async () => {
        const { result } = renderHook(() => useConversacionPorVoz({ locale: 'es-DO', esNativa: true, enviar: vi.fn() }));
        expect(result.current.disponible).toBe(true);
        act(() => result.current.abrir());
        await asentar();
        await avanzar(VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 50);
        await asentar();
        const i = nativo.registro.indexOf('rec.start');
        expect(i).toBeGreaterThan(-1);
        const antes = nativo.registro.slice(0, i);
        expect(antes).not.toContain('tts.getVoices');
        expect(antes).not.toContain('tts.cancel');
        expect(antes).not.toContain('tts.speak');
        expect(result.current.estado).toBe('escuchando');
    });

    it('si el reconocedor no arranca, el aviso dice en qué FASE se quedó', async () => {
        rec.mudo = true;
        const { result } = renderHook(() => useConversacionPorVoz({ locale: 'es-DO', esNativa: true, enviar: vi.fn() }));
        act(() => result.current.abrir());
        await asentar();
        await avanzar(VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 50);
        await asentar();
        await avanzar(VOZ_ARRANQUE_MS + 50);
        expect(result.current.estado).toBe('pausa');
        expect(avisos).toContainEqual(expect.objectContaining({ codigo: 'sin_arranque', crudo: 'fase:start' }));
        expect(nativo.registro).toContain('rec.forceStop');
    });
});

describe('las fases del reconocedor nativo', () => {
    it('cargando → permiso → oyentes → start → arrancando → oyendo → terminado', async () => {
        const oyentes = {};
        const plugin = {
            checkPermissions: async () => ({ speechRecognition: 'granted' }),
            addListener: async (ev, f) => { oyentes[ev] = f; return { remove() {} }; },
            start: async () => { oyentes.listeningState({ state: 'startingListening' }); oyentes.listeningState({ state: 'started' }); },
            stop: async () => { oyentes.listeningState({ state: 'stopped' }); },
            getLastPartialResult: async () => ({ available: false }),
        };
        const r = new ReconocimientoNativo({ cargar: async () => ({ SpeechRecognition: plugin }) });
        expect(r.fase).toBe('nuevo');
        const vistas = [];
        r.onstart = () => vistas.push(r.fase);
        r.onend = () => vistas.push(r.fase);
        r.start();
        await vi.waitFor(() => expect(r.fase).toBe('oyendo'));
        r.stop();
        await vi.waitFor(() => expect(r.fase).toBe('terminado'));
        expect(vistas).toEqual(['oyendo', 'terminado']);
    });

    it('start() resuelto sin «started» queda marcado: el evento se perdió por el camino', async () => {
        const plugin = {
            checkPermissions: async () => ({ speechRecognition: 'granted' }),
            addListener: async () => ({ remove() {} }),
            start: async () => {},
        };
        const r = new ReconocimientoNativo({ cargar: async () => ({ SpeechRecognition: plugin }) });
        r.start();
        await vi.waitFor(() => expect(r.fase).toBe('start_resuelto_sin_started'));
    });
});
