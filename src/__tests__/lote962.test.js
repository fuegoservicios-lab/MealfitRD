/**
 * [P1-PLAN-LOTE-962] Sin el pitido del reconocedor de Android: el plugin local `MfSilencioVoz` silencia los canales
 * de notificación/sistema antes de cada escucha y los devuelve tras el pitido de cierre. Plugins FALSOS aquí.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReconocimientoNativo, SILENCIO_TRAS_FIN_MS } from '../utils/vozNativa';

const raiz = join(__dirname, '..', '..');
const leer = (...p) => readFileSync(join(raiz, ...p), 'utf8');

function pluginDeVoz() {
    const oyentes = {};
    const p = {
        checkPermissions: vi.fn(async () => ({ speechRecognition: 'granted' })),
        requestPermissions: vi.fn(),
        addListener: vi.fn(async (ev, fn) => { oyentes[ev] = fn; return { remove: vi.fn() }; }),
        start: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
        forceStop: vi.fn(async () => {}),
        getLastPartialResult: vi.fn(async () => ({ available: false })),
        emitir: (ev, e) => oyentes[ev]?.(e),
    };
    return p;
}
const silencioFalso = () => ({ silenciar: vi.fn(async () => ({ silenciado: true })), restaurar: vi.fn(async () => {}) });

async function escuchar(plugin, silencio) {
    const rec = new ReconocimientoNativo({ cargar: async () => plugin, silencio });
    rec.onend = vi.fn();
    rec.start();
    await vi.advanceTimersByTimeAsync(0);
    return rec;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('silencio del pitido de Android', () => {
    it('silencia ANTES de abrir el micrófono y el plugin de voz ya no toca volúmenes', async () => {
        const plugin = pluginDeVoz();
        const silencio = silencioFalso();
        await escuchar(plugin, silencio);
        expect(silencio.silenciar).toHaveBeenCalledTimes(1);
        expect(silencio.silenciar.mock.invocationCallOrder[0]).toBeLessThan(plugin.start.mock.invocationCallOrder[0]);
        expect(plugin.start.mock.calls[0][0].muteRecognizerBeep).toBe(false);
    });

    it('devuelve el volumen DESPUÉS del pitido de cierre, no al parar', async () => {
        const plugin = pluginDeVoz();
        const silencio = silencioFalso();
        await escuchar(plugin, silencio);
        await plugin.emitir('listeningState', { state: 'stopped' });
        await vi.advanceTimersByTimeAsync(0);
        expect(silencio.restaurar).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(SILENCIO_TRAS_FIN_MS);
        expect(silencio.restaurar).toHaveBeenCalledTimes(1);
    });

    it('entre turnos seguidos no se restaura: la escucha siguiente cancela la restauración pendiente', async () => {
        const plugin = pluginDeVoz();
        const silencio = silencioFalso();
        const rec = await escuchar(plugin, silencio);
        rec.abort();
        await vi.advanceTimersByTimeAsync(SILENCIO_TRAS_FIN_MS / 3);
        await escuchar(pluginDeVoz(), silencio);
        await vi.advanceTimersByTimeAsync(SILENCIO_TRAS_FIN_MS);
        expect(silencio.restaurar).not.toHaveBeenCalled();
        expect(silencio.silenciar).toHaveBeenCalledTimes(2);
    });

    it('si abortan antes de abrir el micrófono no silencia nada (ni queda nada que restaurar)', async () => {
        const plugin = pluginDeVoz();
        const silencio = silencioFalso();
        const rec = new ReconocimientoNativo({ cargar: async () => plugin, silencio });
        rec.start();
        rec.abort();
        await vi.advanceTimersByTimeAsync(SILENCIO_TRAS_FIN_MS * 2);
        expect(silencio.silenciar).not.toHaveBeenCalled();
        expect(silencio.restaurar).not.toHaveBeenCalled();
    });

    it('en un APK sin el plugin, como antes: el plugin de voz silencia su pitido de arranque', async () => {
        const plugin = pluginDeVoz();
        await escuchar(plugin, null);
        expect(plugin.start.mock.calls[0][0].muteRecognizerBeep).toBe(true);
    });

    it('el binario: plugin registrado, versionCode 107+, y las cuatro redes para no dejar el teléfono callado', () => {
        const main = leer('android', 'app', 'src', 'main', 'java', 'com', 'bioboros', 'app', 'MainActivity.java');
        expect(main).toContain('registerPlugin(MfSilencioVoz.class);');
        expect(main.indexOf('registerPlugin(MfSilencioVoz.class);')).toBeLessThan(main.lastIndexOf('super.onCreate(savedInstanceState)'));
        const gradle = leer('android', 'app', 'build.gradle');
        expect(Number(/versionCode\s+(\d+)/.exec(gradle)[1])).toBeGreaterThanOrEqual(107);
        const java = leer('android', 'app', 'src', 'main', 'java', 'com', 'bioboros', 'app', 'MfSilencioVoz.java');
        expect(java).toContain('@CapacitorPlugin(name = "MfSilencioVoz")');
        expect(java).toContain('AudioManager.ADJUST_MUTE');
        expect(java).toContain('AudioManager.ADJUST_UNMUTE');
        expect(java).not.toContain('setStreamVolume');          // nunca un número que restaurar mal
        expect(java).not.toContain('STREAM_MUSIC');             // la voz del coach y la señal propia no se tocan
        expect(java).toMatch(/handleOnPause\(\)\s*\{[\s\S]*?restaurarAhora\(\)/);
        expect(java).toMatch(/handleOnDestroy\(\)\s*\{[\s\S]*?restaurarAhora\(\)/);
        expect(java).toContain('handler.postDelayed(restaurarSolo, TOPE_MS)');
        expect(java).toMatch(/load\(\)\s*\{[\s\S]*?getBoolean\(MARCA, false\)[\s\S]*?restaurarAhora\(\)/);
    });
});
