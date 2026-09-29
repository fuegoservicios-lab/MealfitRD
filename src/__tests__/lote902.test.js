/**
 * [P1-PLAN-LOTE-902 · 2026-09-29] En la app de Android, el plugin nativo MANDA sobre la API del WebView.
 * «En android están teniendo problemas con el modo de voz y con el modo de micrófono normal»: los Android con la app
 * abrían el chat y ninguno llegaba a mandar un mensaje. El WebView expone `webkitSpeechRecognition` sin un servicio de
 * voz detrás, y `motorDeDictado` lo elegía antes que el plugin (el 683 lo probó con `win = {}`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const plataforma = vi.hoisted(() => ({ nombre: 'web', plugins: new Set() }));
vi.mock('../config/platform', async (orig) => ({
    ...(await orig()),
    nativePlatform: () => plataforma.nombre,
    nativePluginAvailable: (n) => plataforma.plugins.has(n),
    isNativeApp: () => plataforma.nombre !== 'web',
}));
const sintesisMock = vi.hoisted(() => ({ creada: 0 }));
vi.mock('../utils/vozNativa', async (orig) => {
    const real = await orig();
    return {
        ...real,
        sintesisNativa: () => {
            sintesisMock.creada += 1;
            return { speechSynthesis: { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [], addEventListener() {}, removeEventListener() {} }, SpeechSynthesisUtterance: class {} };
        },
    };
});

import { ReconocimientoNativo, reconocimientoNativoDisponible, sintesisNativaDisponible } from '../utils/vozNativa';
import { dictadoDisponible, motorDeDictado } from '../utils/dictado';
import { crearVozDelCoach, sintesisDisponible } from '../utils/vozDelCoach';

class ReconocimientoDelWebView {}
const webView = () => ({
    webkitSpeechRecognition: ReconocimientoDelWebView,
    speechSynthesis: { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [], addEventListener() {}, removeEventListener() {} },
    SpeechSynthesisUtterance: class {},
});

beforeEach(() => { plataforma.nombre = 'web'; plataforma.plugins = new Set(); sintesisMock.creada = 0; });

describe('Android con los plugins: el nativo gana aunque el WebView traiga la API', () => {
    it('el dictado usa el reconocedor de Android, no el `webkitSpeechRecognition` del WebView', () => {
        plataforma.nombre = 'android';
        plataforma.plugins = new Set(['SpeechRecognition', 'SpeechSynthesis']);
        expect(motorDeDictado(webView())).toBe(ReconocimientoNativo);
        expect(dictadoDisponible({ win: webView(), esNativa: true, userAgent: 'Mozilla/5.0 (Linux; Android 16; wv)' })).toBe(true);
    });

    it('la voz del teléfono es el TextToSpeech del plugin, no el `speechSynthesis` del WebView', () => {
        plataforma.nombre = 'android';
        plataforma.plugins = new Set(['SpeechRecognition', 'SpeechSynthesis']);
        const win = webView();
        crearVozDelCoach({ win }).encolar('Hola.');
        expect(sintesisMock.creada).toBe(1);
        expect(win.speechSynthesis.speak).not.toHaveBeenCalled();
        expect(sintesisDisponible(win)).toBe(true);
    });

    it('cada motor por separado: con solo el reconocedor, el dictado ya es nativo', () => {
        plataforma.nombre = 'android';
        plataforma.plugins = new Set(['SpeechRecognition']);
        expect(reconocimientoNativoDisponible()).toBe(true);
        expect(sintesisNativaDisponible()).toBe(false);
        expect(motorDeDictado(webView())).toBe(ReconocimientoNativo);
    });
});

describe('donde no hay plugin, nada cambia', () => {
    it('web e iOS usan la API del navegador', () => {
        expect(motorDeDictado(webView())).toBe(ReconocimientoDelWebView);
        plataforma.nombre = 'ios';
        plataforma.plugins = new Set(['SpeechRecognition', 'SpeechSynthesis']);
        expect(motorDeDictado(webView())).toBe(ReconocimientoDelWebView);
        const win = webView();
        crearVozDelCoach({ win }).encolar('Hola.');
        expect(sintesisMock.creada).toBe(0);
    });

    it('APK viejo sin plugins: la API del WebView (como antes) y sin dictado en la app nativa', () => {
        plataforma.nombre = 'android';
        expect(motorDeDictado(webView())).toBe(ReconocimientoDelWebView);
        expect(dictadoDisponible({ win: webView(), esNativa: true, userAgent: 'Mozilla/5.0 (Linux; Android 16; wv)' })).toBe(false);
    });
});
