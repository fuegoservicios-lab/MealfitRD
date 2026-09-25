/**
 * [P1-PLAN-LOTE-306 · 2026-09-25] La foto del chat se prepara FUERA del hilo principal.
 *
 * El dueño: «abrir una foto con el teclado abierto no es tan fluido como Gemini». Al volver del selector, el hilo
 * principal decodificaba la foto, la reducía a 1600 px y a 360 px en <canvas> y codificaba la miniatura con
 * `toDataURL` (SÍNCRONO) — justo mientras el teclado volvía a subir. Ahora lo hace un Web Worker con OffscreenCanvas;
 * el contrato de `prepareChatImage` no cambia ({ file, thumbDataUrl: 'data:…', width, height }) y, si el worker no
 * existe o no sabe decodificar (HEIC), cae al camino de siempre.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class FakeWorker {
    static instancias = [];
    static respuesta = null;          // (msg) => respuesta del worker, o null para no responder
    constructor(url, opts) {
        this.url = String(url);
        this.opts = opts;
        this.listeners = { message: [], error: [] };
        this.mensajes = [];
        FakeWorker.instancias.push(this);
    }
    addEventListener(tipo, fn) { this.listeners[tipo].push(fn); }
    removeEventListener(tipo, fn) { this.listeners[tipo] = this.listeners[tipo].filter((f) => f !== fn); }
    postMessage(msg) {
        this.mensajes.push(msg);
        const r = FakeWorker.respuesta?.(msg);
        if (r === 'crash') queueMicrotask(() => this.listeners.error.forEach((fn) => fn(new Event('error'))));
        else if (r) queueMicrotask(() => this.listeners.message.forEach((fn) => fn({ data: { id: msg.id, ...r } })));
    }
    terminate() {}
}

const jpeg = (txt) => new Blob([txt], { type: 'image/jpeg' });
const foto = () => new File(['x'.repeat(100)], 'IMG_0001.HEIC.jpg', { type: 'image/jpeg' });

let mod;
beforeEach(async () => {
    vi.resetModules();
    FakeWorker.instancias = [];
    FakeWorker.respuesta = null;
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    mod = await import('../utils/chatImageProcessing');
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('[306] la foto del chat se prepara en un Web Worker', () => {
    it('usa el worker y conserva el contrato (archivo .jpg + miniatura data: URL)', async () => {
        FakeWorker.respuesta = () => ({ ok: true, upload: jpeg('SUBIDA'), thumb: jpeg('MINI'), width: 4032, height: 3024 });
        const r = await mod.prepareChatImage(foto());
        expect(FakeWorker.instancias).toHaveLength(1);
        expect(FakeWorker.instancias[0].opts).toEqual({ type: 'module' });
        expect(FakeWorker.instancias[0].mensajes[0]).toMatchObject({ maxSide: 1600, thumbSide: 360 });
        expect(r.file).toBeInstanceOf(File);
        expect(r.file.name).toBe('IMG_0001.HEIC.jpg');
        expect(r.file.type).toBe('image/jpeg');
        expect(r.thumbDataUrl.startsWith('data:image/jpeg')).toBe(true);
        expect([r.width, r.height]).toEqual([4032, 3024]);
    });

    it('un solo worker para todas las fotos', async () => {
        FakeWorker.respuesta = () => ({ ok: true, upload: jpeg('a'), thumb: jpeg('b'), width: 10, height: 10 });
        await Promise.all([mod.prepareChatImage(foto()), mod.prepareChatImage(foto())]);
        expect(FakeWorker.instancias).toHaveLength(1);
        expect(FakeWorker.instancias[0].mensajes).toHaveLength(2);
    });

    it('una foto gigante sigue rechazándose con su código (no cae al hilo principal)', async () => {
        FakeWorker.respuesta = () => ({ ok: false, code: 'IMAGE_DIMENSIONS_TOO_LARGE' });
        await expect(mod.prepareChatImage(foto())).rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS_TOO_LARGE' });
    });

    it('si el worker no sabe decodificar (HEIC), cae al camino de siempre', async () => {
        FakeWorker.respuesta = () => ({ ok: false, code: 'DECODE_FAILED' });
        const principal = vi.spyOn(mod._internals, 'prepararEnHiloPrincipal')
            .mockResolvedValue({ file: foto(), thumbDataUrl: 'data:image/jpeg;base64,AA', width: 1, height: 1 });
        const r = await mod.prepareChatImage(foto());
        expect(principal).toHaveBeenCalledTimes(1);
        expect(r.thumbDataUrl).toBe('data:image/jpeg;base64,AA');
    });

    it('si el worker revienta, se desactiva y todo sigue por el hilo principal', async () => {
        FakeWorker.respuesta = () => 'crash';
        const principal = vi.spyOn(mod._internals, 'prepararEnHiloPrincipal')
            .mockResolvedValue({ file: foto(), thumbDataUrl: 'data:,', width: 1, height: 1 });
        await mod.prepareChatImage(foto());
        await mod.prepareChatImage(foto());
        expect(principal).toHaveBeenCalledTimes(2);
        expect(FakeWorker.instancias[0].mensajes).toHaveLength(1);   // la 2.ª ya no se le manda
    });

    it('sin OffscreenCanvas (Safari < 16.4) ni se crea el worker', async () => {
        vi.resetModules();
        vi.stubGlobal('OffscreenCanvas', undefined);
        mod = await import('../utils/chatImageProcessing');
        const principal = vi.spyOn(mod._internals, 'prepararEnHiloPrincipal')
            .mockResolvedValue({ file: foto(), thumbDataUrl: 'data:,', width: 1, height: 1 });
        await mod.prepareChatImage(foto());
        expect(FakeWorker.instancias).toHaveLength(0);
        expect(principal).toHaveBeenCalledTimes(1);
    });

    it('cancelar descarta la respuesta del worker', async () => {
        FakeWorker.respuesta = () => null;       // nunca responde
        const ctl = new AbortController();
        const p = mod.prepareChatImage(foto(), { signal: ctl.signal });
        ctl.abort();
        await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('precalentar arranca el worker sin mandarle trabajo (el «+» lo llama mientras eliges la foto)', () => {
        mod.precalentarWorkerDeImagen();
        mod.precalentarWorkerDeImagen();
        expect(FakeWorker.instancias).toHaveLength(1);
        expect(FakeWorker.instancias[0].mensajes).toHaveLength(0);
    });

    it('el «+» del chat precalienta el worker', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const src = readFileSync(resolve(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        const gesto = src.slice(src.indexOf('const prepareAttachmentPickerGesture'), src.indexOf('const waitForAttachmentKeyboardClose'));
        expect(gesto).toContain('precalentarWorkerDeImagen()');
    });
});
