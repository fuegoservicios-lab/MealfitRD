/**
 * [P1-PLAN-LOTE-909 · 2026-09-30] Diagnóstico anónimo del dictado y el modo voz. El dueño: «en android todavía tienen
 * problemas», y el servidor no veía nada. Se prueba qué se avisa, con qué tope, y que el código original de Android
 * llega (el adaptador lo traducía y lo perdía).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const estado = vi.hoisted(() => ({ plataforma: 'android', plugins: new Set(['SpeechRecognition']), pedidas: [] }));
vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(async (url, opts) => { estado.pedidas.push({ url, cuerpo: JSON.parse(opts.body) }); return { ok: true }; }),
}));
vi.mock('../config/platform', () => ({
    nativePlatform: () => estado.plataforma,
    nativePluginAvailable: (n) => estado.plugins.has(n),
}));

import {
    avisarFalloDeVoz, avisarFalloDeVozEnVivo, avisarEstadoDeVozUnaVez, _reiniciarDiagnosticoVoz, DIAGNOSTICO_MAX_POR_ARRANQUE,
} from '../utils/diagnosticoVoz';
import { ReconocimientoNativo } from '../utils/vozNativa';

beforeEach(() => {
    _reiniciarDiagnosticoVoz();
    estado.pedidas = [];
    estado.plataforma = 'android';
    estado.plugins = new Set(['SpeechRecognition']);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('diagnosticoVoz', () => {
    it('Live identifica la etapa y el paquete con códigos permitidos, nunca mensajes ni datos arbitrarios', () => {
        vi.stubGlobal('__OTA_BUNDLE_ID__', '20261002-150000');
        avisarFalloDeVozEnVivo({ fase: 'microfono', codigo: 'TypeError', idioma: 'es-DO' });
        expect(estado.pedidas[0].cuerpo).toMatchObject({ codigo: 'live_microfono_TypeError', crudo: 'ota:20261002-150000' });
        avisarFalloDeVozEnVivo({ fase: 'private-text', codigo: 'secret-token' });
        expect(estado.pedidas[1].cuerpo).toMatchObject({ codigo: 'live_capacidad_Error' });
        expect(JSON.stringify(estado.pedidas)).not.toMatch(/private-text|secret-token/);
        avisarEstadoDeVozUnaVez({ dictadoDisponible: true });
        expect(estado.pedidas[2].cuerpo.crudo).toBe('ota:20261002-150000');
    });
    it('un fallo va con el código, el original de Android, el motor y la plataforma', () => {
        avisarFalloDeVoz({ donde: 'dictado', codigo: 'language-not-supported', crudo: 'UNKNOWN_12', idioma: 'es-DO' });
        expect(estado.pedidas).toEqual([{
            url: '/api/chat/diagnostico-voz',
            cuerpo: { plataforma: 'android', motor: 'plugin_android', donde: 'dictado', codigo: 'language-not-supported',
                crudo: 'UNKNOWN_12', idioma: 'es-DO' },
        }]);
    });

    it('el mismo aviso una vez por minuto, y un tope por arranque', () => {
        avisarFalloDeVoz({ donde: 'modo_voz', codigo: 'no-speech' });
        avisarFalloDeVoz({ donde: 'modo_voz', codigo: 'no-speech' });
        expect(estado.pedidas).toHaveLength(1);
        for (let i = 0; i < 50; i += 1) avisarFalloDeVoz({ donde: 'dictado', codigo: `c${i}` });
        expect(estado.pedidas).toHaveLength(DIAGNOSTICO_MAX_POR_ARRANQUE);
    });

    it('el estado de la voz: una vez por arranque, solo en la app nativa (cubre el micrófono que ni aparece)', () => {
        estado.plugins = new Set();
        avisarEstadoDeVozUnaVez({ dictadoDisponible: false });
        avisarEstadoDeVozUnaVez({ dictadoDisponible: false });
        expect(estado.pedidas).toHaveLength(1);
        expect(estado.pedidas[0].cuerpo).toMatchObject({
            donde: 'estado', plugin_reconocimiento: false, plugin_sintesis: false, dictado_disponible: false,
        });
        _reiniciarDiagnosticoVoz();
        estado.pedidas = [];
        estado.plataforma = 'web';
        avisarEstadoDeVozUnaVez({ dictadoDisponible: true });
        expect(estado.pedidas).toHaveLength(0);
    });
});

describe('el adaptador de Android conserva el código original', () => {
    it('un error del plugin llega con `crudo`', async () => {
        const oyentes = {};
        const plugin = {
            checkPermissions: async () => ({ speechRecognition: 'granted' }),
            addListener: async (ev, f) => { oyentes[ev] = f; return { remove() {} }; },
            start: async () => {},
        };
        const rec = new ReconocimientoNativo({ cargar: async () => ({ SpeechRecognition: plugin }) });
        const errores = [];
        rec.onerror = (e) => errores.push(e);
        rec.start();
        await vi.waitFor(() => expect(oyentes.error).toBeTypeOf('function'));
        oyentes.error({ code: 'UNKNOWN_13' });
        expect(errores).toEqual([{ error: 'language-not-supported', crudo: 'UNKNOWN_13' }]);
    });

    it('el permiso denegado dice cuál fue el estado', async () => {
        const plugin = {
            checkPermissions: async () => ({ speechRecognition: 'prompt' }),
            requestPermissions: async () => ({ speechRecognition: 'denied' }),
        };
        const rec = new ReconocimientoNativo({ cargar: async () => ({ SpeechRecognition: plugin }) });
        const errores = [];
        rec.onerror = (e) => errores.push(e);
        rec.start();
        await vi.waitFor(() => expect(errores).toEqual([{ error: 'not-allowed', crudo: 'permiso:denied' }]));
    });
});

describe('cableado', () => {
    const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');
    it('el dictado y el modo voz avisan de sus fallos; el dictado, del estado y de «arranca y no oye»', () => {
        const dictado = leer('hooks/useDictado.js');
        expect(dictado).toContain("avisarFalloDeVoz({ donde: 'dictado', codigo: code, crudo: evento?.crudo, idioma: rec.lang })");
        expect(dictado).toContain("codigo: 'sin_resultado'");
        expect(dictado).toContain('avisarEstadoDeVozUnaVez({ dictadoDisponible: disponible })');
        expect(leer('hooks/useConversacionPorVoz.js'))
            .toContain("avisarFalloDeVoz({ donde: 'modo_voz', codigo: code, crudo: evento?.crudo, idioma: rec.lang })");
    });
});
