/**
 * [P1-PLAN-LOTE-683] Voz en la app de Android: los plugins nativos con la forma de la Web Speech API.
 * Los plugins son FALSOS aquí; lo que se prueba es la traducción (eventos del plugin → onstart/onresult/onend, y
 * locuciones → speak con su id) y que la app los elige solo donde el binario los trae.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const plataforma = vi.hoisted(() => ({ nombre: 'web', plugins: new Set() }));
vi.mock('../config/platform', async (orig) => ({
    ...(await orig()),
    nativePlatform: () => plataforma.nombre,
    nativePluginAvailable: (n) => plataforma.plugins.has(n),
    isNativeApp: () => plataforma.nombre !== 'web',
}));

import { ReconocimientoNativo, crearSintesisNativa, errorWebDesdeAndroid, vozNativaDisponible } from '../utils/vozNativa';
import { dictadoDisponible, motorDeDictado } from '../utils/dictado';
import { sintesisDisponible } from '../utils/vozDelCoach';

const esperar = () => new Promise((r) => setTimeout(r, 0));

function reconocedorFalso({ permiso = 'granted' } = {}) {
    const oyentes = {};
    return {
        oyentes,
        checkPermissions: vi.fn(async () => ({ speechRecognition: permiso })),
        requestPermissions: vi.fn(async () => ({ speechRecognition: permiso })),
        addListener: vi.fn(async (ev, f) => { oyentes[ev] = f; return { remove: vi.fn() }; }),
        start: vi.fn(async () => ({})),
        stop: vi.fn(async () => {}),
        forceStop: vi.fn(async () => {}),
        getLastPartialResult: vi.fn(async () => ({ available: true, text: 'me comí dos huevos con pan' })),
    };
}

function sintesisFalsa() {
    const oyentes = {};
    let n = 0;
    return {
        oyentes,
        addListener: vi.fn(async (ev, f) => { oyentes[ev] = f; return { remove: vi.fn() }; }),
        getVoices: vi.fn(async () => ({ voices: [{ id: 'es-us-x-sfb-local', name: 'es-us-x-sfb-local', language: 'es-US' }] })),
        speak: vi.fn(async () => ({ utteranceId: `u${++n}` })),
        cancel: vi.fn(async () => {}),
    };
}

beforeEach(() => {
    plataforma.nombre = 'web';
    plataforma.plugins = new Set();
});

describe('elegir la voz nativa: solo en Android y solo si el binario trae los dos plugins', () => {
    it('web o iOS: no; Android con los plugins: sí; Android viejo (sin plugins): no', () => {
        expect(vozNativaDisponible()).toBe(false);
        plataforma.nombre = 'ios';
        plataforma.plugins = new Set(['SpeechRecognition', 'SpeechSynthesis']);
        expect(vozNativaDisponible()).toBe(false);
        plataforma.nombre = 'android';
        plataforma.plugins = new Set();
        expect(vozNativaDisponible()).toBe(false);
        plataforma.plugins = new Set(['SpeechRecognition', 'SpeechSynthesis']);
        expect(vozNativaDisponible()).toBe(true);
    });

    it('con los plugins, el dictado y la voz existen en Android sin la marca del user agent', () => {
        const win = {};   // el WebView de Android no trae SpeechRecognition ni speechSynthesis
        expect(dictadoDisponible({ win, esNativa: true, userAgent: 'Mozilla/5.0 (Linux; Android 14)' })).toBe(false);
        expect(sintesisDisponible(win)).toBe(false);
        plataforma.nombre = 'android';
        plataforma.plugins = new Set(['SpeechRecognition', 'SpeechSynthesis']);
        expect(motorDeDictado(win)).toBe(ReconocimientoNativo);
        expect(dictadoDisponible({ win, esNativa: true, userAgent: 'Mozilla/5.0 (Linux; Android 14)' })).toBe(true);
        expect(sintesisDisponible(win)).toBe(true);
    });
});

describe('ReconocimientoNativo', () => {
    it('traduce los eventos del plugin a los de la Web Speech API', async () => {
        const p = reconocedorFalso();
        const rec = new ReconocimientoNativo({ cargar: async () => p });
        rec.lang = 'es-DO';
        const ev = { start: vi.fn(), result: [], end: vi.fn() };
        rec.onstart = ev.start;
        rec.onresult = (e) => ev.result.push([e.results[0][0].transcript, e.results[0].isFinal]);
        rec.onend = ev.end;
        rec.start();
        await esperar(); await esperar(); await esperar();
        expect(p.start).toHaveBeenCalledWith(expect.objectContaining({ language: 'es-DO', partialResults: true, popup: false }));
        p.oyentes.listeningState({ state: 'started' });
        expect(ev.start).toHaveBeenCalledTimes(1);
        p.oyentes.partialResults({ matches: ['me comí dos huevos'] });
        expect(ev.result).toEqual([['me comí dos huevos', false]]);
        await p.oyentes.listeningState({ state: 'stopped', reason: 'silence' });
        expect(ev.result.at(-1)).toEqual(['me comí dos huevos con pan', true]);   // el último, pedido al cerrar
        expect(ev.end).toHaveBeenCalledTimes(1);
    });

    it('sin permiso de micrófono: not-allowed y fin, sin arrancar', async () => {
        const p = reconocedorFalso({ permiso: 'denied' });
        const rec = new ReconocimientoNativo({ cargar: async () => p });
        const errores = [];
        rec.onerror = (e) => errores.push(e.error);
        rec.onend = vi.fn();
        rec.start();
        await esperar(); await esperar();
        expect(errores).toEqual(['not-allowed']);
        expect(rec.onend).toHaveBeenCalledTimes(1);
        expect(p.start).not.toHaveBeenCalled();
    });

    it('los códigos de Android se traducen y abortar cierra al momento', async () => {
        expect(errorWebDesdeAndroid('NO_MATCH')).toBe('no-speech');
        expect(errorWebDesdeAndroid('INSUFFICIENT_PERMISSIONS')).toBe('not-allowed');
        expect(errorWebDesdeAndroid('NETWORK_TIMEOUT')).toBe('network');
        expect(errorWebDesdeAndroid('UNKNOWN_12')).toBe('language-not-supported');
        const p = reconocedorFalso();
        const rec = new ReconocimientoNativo({ cargar: async () => p });
        rec.onend = vi.fn();
        rec.start();
        await esperar(); await esperar(); await esperar();
        rec.abort();
        expect(p.forceStop).toHaveBeenCalled();
        expect(rec.onend).toHaveBeenCalledTimes(1);
    });
});

describe('crearSintesisNativa', () => {
    it('cada locución habla con su id y recibe su inicio, palabras y fin (aunque lleguen antes que el id)', async () => {
        const p = sintesisFalsa();
        const { speechSynthesis: synth, SpeechSynthesisUtterance: Loc } = crearSintesisNativa({ cargar: async () => p });
        const alCargarVoces = vi.fn();
        synth.addEventListener('voiceschanged', alCargarVoces);
        await esperar(); await esperar(); await esperar();
        expect(alCargarVoces).toHaveBeenCalled();
        expect(synth.getVoices()).toEqual([{ id: 'es-us-x-sfb-local', name: 'es-us-x-sfb-local', lang: 'es-US', default: false }]);

        const loc = new Loc('Listo, anoté dos huevos.');
        loc.lang = 'es-US';
        loc.voice = synth.getVoices()[0];
        const ev = { start: vi.fn(), palabra: vi.fn(), end: vi.fn() };
        loc.onstart = ev.start; loc.onboundary = ev.palabra; loc.onend = ev.end;
        p.speak.mockImplementationOnce(async () => {
            p.oyentes.start({ utteranceId: 'u9' });      // el puente adelanta el inicio al id
            return { utteranceId: 'u9' };
        });
        synth.speak(loc);
        await esperar(); await esperar();
        expect(p.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Listo, anoté dos huevos.', language: 'es-US', voiceId: 'es-us-x-sfb-local', queueStrategy: 'Add' }));
        expect(ev.start).toHaveBeenCalledTimes(1);
        p.oyentes.boundary({ utteranceId: 'u9', charIndex: 6 });
        p.oyentes.end({ utteranceId: 'u9' });
        expect(ev.palabra).toHaveBeenCalledTimes(1);
        expect(ev.end).toHaveBeenCalledTimes(1);

        const muda = new Loc(' ');
        muda.volume = 0;
        synth.speak(muda);                               // el desbloqueo de iOS no suena en Android
        await esperar();
        expect(p.speak).toHaveBeenCalledTimes(1);
        synth.cancel();
        expect(p.cancel).toHaveBeenCalled();
    });
});

describe('el binario Android', () => {
    const leer = (rel) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

    it('trae los dos plugins, ve los servicios de voz y sube de versión', () => {
        const pkg = JSON.parse(leer('package.json'));
        expect(pkg.dependencies['@capgo/capacitor-speech-recognition']).toBeTruthy();
        expect(pkg.dependencies['@capgo/capacitor-speech-synthesis']).toBeTruthy();
        const m = leer('android/app/src/main/AndroidManifest.xml').replace(/<!--[\s\S]*?-->/g, '');
        expect(m).toContain('<action android:name="android.speech.RecognitionService" />');
        expect(m).toContain('<action android:name="android.intent.action.TTS_SERVICE" />');
        expect(m).not.toContain('android.permission.RECORD_AUDIO');   // lo declara su plugin
        const code = Number(/versionCode\s+(\d+)/.exec(leer('android/app/build.gradle'))[1]);
        expect(code).toBeGreaterThanOrEqual(106);
        expect(leer('android/capacitor.settings.gradle')).toContain(":capgo-capacitor-speech-recognition");
        expect(leer('android/capacitor.settings.gradle')).toContain(":capgo-capacitor-speech-synthesis");
    });
});
