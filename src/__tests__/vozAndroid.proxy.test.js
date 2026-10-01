import { describe, it, expect, vi, beforeEach } from 'vitest';

const puente = vi.hoisted(() => ({ llamadas: [], oyentes: {}, then: vi.fn() }));
// Capacitor entrega un Proxy: incluso `.then` parece un método nativo.
// Una promesa que intente resolver con ese Proxy queda esperando ese método.
vi.mock('@capgo/capacitor-speech-recognition', () => ({
    SpeechRecognition: new Proxy({
        checkPermissions: async () => { puente.llamadas.push('permiso'); return { speechRecognition: 'granted' }; },
        addListener: async (nombre, f) => { puente.oyentes[nombre] = f; return { remove() {} }; },
        start: async () => { puente.llamadas.push('microfono'); puente.oyentes.listeningState({ state: 'started' }); },
        forceStop: async () => {},
    }, { get: (obj, key) => key === 'then' ? puente.then : obj[key] }),
}));
vi.mock('@capgo/capacitor-speech-synthesis', () => ({
    SpeechSynthesis: new Proxy({
        addListener: async (nombre, f) => { puente.oyentes[nombre] = f; return { remove() {} }; },
        speak: async () => { puente.llamadas.push('locucion'); return { utteranceId: 'voz-1' }; },
        getVoices: async () => ({ voices: [] }),
        cancel: async () => {},
    }, { get: (obj, key) => key === 'then' ? puente.then : obj[key] }),
}));

import { ReconocimientoNativo, crearSintesisNativa } from '../utils/vozNativa';

beforeEach(() => { puente.llamadas = []; puente.oyentes = {}; puente.then.mockClear(); });

describe('voz Android con los Proxy reales del puente', () => {
    it('llega al permiso y abre el micrófono sin invocar el método inexistente then', async () => {
        const rec = new ReconocimientoNativo();
        rec.onstart = vi.fn();
        rec.start();
        await vi.waitFor(() => expect(rec.onstart).toHaveBeenCalledOnce(), { timeout: 500 });
        expect(puente.llamadas).toEqual(['permiso', 'microfono']);
        expect(puente.then).not.toHaveBeenCalled();
        rec.abort();
    });

    it('la voz de respaldo habla y termina sin resolver promesas con el Proxy', async () => {
        const { speechSynthesis: synth, SpeechSynthesisUtterance: Loc } = crearSintesisNativa();
        const loc = new Loc('Listo, anoté tu comida.');
        loc.onend = vi.fn();
        synth.speak(loc);
        await vi.waitFor(() => expect(puente.llamadas).toContain('locucion'), { timeout: 500 });
        puente.oyentes.end({ utteranceId: 'voz-1' });
        expect(loc.onend).toHaveBeenCalledOnce();
        expect(puente.then).not.toHaveBeenCalled();
    });
});
