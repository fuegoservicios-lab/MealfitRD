/**
 * [P1-PLAN-LOTE-848 · 2026-09-29] `reducirImagen`: lo que el plugin de cámara hacía con la foto elegida, ahora en JS.
 *
 * En iPhone la foto llega del `<input type="file">` de WebKit tal como está en Fotos (12-24 MP) y el plugin ya no la
 * entrega reducida. `reducirImagen` la baja a `maxSide` px en JPEG a `quality`, sin miniatura, en el MISMO worker del
 * lote 306 (con `thumbSide: 0`), y cae al hilo principal igual que `prepareChatImage`. El mensaje de `prepareChatImage`
 * al worker no cambia.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class FakeWorker {
    static instancias = [];
    static respuesta = null;
    constructor(url, opts) {
        this.url = String(url);
        this.opts = opts;
        this.listeners = { message: [], error: [] };
        this.mensajes = [];
        FakeWorker.instancias.push(this);
    }
    addEventListener(tipo, fn) { (this.listeners[tipo] ||= []).push(fn); }
    removeEventListener(tipo, fn) { this.listeners[tipo] = (this.listeners[tipo] || []).filter((f) => f !== fn); }
    postMessage(msg) {
        this.mensajes.push(msg);
        const r = FakeWorker.respuesta?.(msg);
        if (r) queueMicrotask(() => this.listeners.message.forEach((fn) => fn({ data: { id: msg.id, ...r } })));
    }
    terminate() {}
}

const jpeg = (txt) => new Blob([txt], { type: 'image/jpeg' });
const foto = () => new File(['x'.repeat(100)], 'IMG_0001.jpg', { type: 'image/jpeg' });

let mod;
beforeEach(async () => {
    vi.resetModules();
    FakeWorker.instancias = [];
    FakeWorker.respuesta = null;
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    mod = await import('../utils/chatImageProcessing');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('[848] reducirImagen', () => {
    it('en el worker, con el tamaño y la calidad pedidos y SIN miniatura', async () => {
        FakeWorker.respuesta = () => ({ ok: true, upload: jpeg('REDUCIDA'), thumb: null, width: 4032, height: 3024 });
        const blob = await mod.reducirImagen(foto(), { maxSide: 1600, quality: 0.85 });
        expect(await blob.text()).toBe('REDUCIDA');
        const [mensaje] = FakeWorker.instancias[0].mensajes;
        expect(mensaje).toMatchObject({ maxSide: 1600, quality: 0.85, thumbSide: 0 });
    });

    it('el mensaje de prepareChatImage no cambia (sin «quality», miniatura de 360)', async () => {
        FakeWorker.respuesta = () => ({ ok: true, upload: jpeg('a'), thumb: jpeg('b'), width: 10, height: 10 });
        await mod.prepareChatImage(foto());
        const { id, file, ...resto } = FakeWorker.instancias[0].mensajes[0];
        expect(id).toBeGreaterThan(0);
        expect(file).toBeInstanceOf(File);
        expect(resto).toEqual({ maxSide: 1600, thumbSide: 360 });
    });

    it('si el worker no sabe decodificar, lo intenta el hilo principal', async () => {
        FakeWorker.respuesta = () => ({ ok: false, code: 'DECODE_FAILED' });
        const principal = vi.spyOn(mod._internals, 'reducirEnHiloPrincipal').mockResolvedValue(jpeg('PRINCIPAL'));
        const blob = await mod.reducirImagen(foto(), { maxSide: 2000, quality: 0.9 });
        expect(await blob.text()).toBe('PRINCIPAL');
        expect(principal).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ maxSide: 2000, quality: 0.9 }));
    });

    it('una foto gigante se rechaza con su código (no se decodifica otra vez en el hilo principal)', async () => {
        FakeWorker.respuesta = () => ({ ok: false, code: 'IMAGE_DIMENSIONS_TOO_LARGE' });
        const principal = vi.spyOn(mod._internals, 'reducirEnHiloPrincipal');
        await expect(mod.reducirImagen(foto())).rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS_TOO_LARGE' });
        expect(principal).not.toHaveBeenCalled();
    });

    it('sin OffscreenCanvas (Safari < 16.4) va directo al hilo principal, sin crear el worker', async () => {
        vi.resetModules();
        vi.stubGlobal('OffscreenCanvas', undefined);
        mod = await import('../utils/chatImageProcessing');
        const principal = vi.spyOn(mod._internals, 'reducirEnHiloPrincipal').mockResolvedValue(jpeg('P'));
        await mod.reducirImagen(foto(), { maxSide: 1600, quality: 0.85 });
        expect(FakeWorker.instancias).toHaveLength(0);
        expect(principal).toHaveBeenCalledTimes(1);
    });

    it('lo que no es una imagen no se toca', async () => {
        await expect(mod.reducirImagen(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).rejects.toBeInstanceOf(TypeError);
    });
});

// El worker de verdad (src/workers/chatImage.worker.js) con `self`, `createImageBitmap` y `OffscreenCanvas` simulados.
describe('[848] el worker: calidad pedida y miniatura opcional', () => {
    let alMensaje;
    let respuestas;
    let codificaciones;

    beforeEach(async () => {
        vi.resetModules();
        respuestas = [];
        codificaciones = [];
        vi.stubGlobal('self', {
            addEventListener: (tipo, fn) => { if (tipo === 'message') alMensaje = fn; },
            postMessage: (m) => respuestas.push(m),
        });
        vi.stubGlobal('createImageBitmap', async () => ({ width: 4000, height: 3000, close() {} }));
        vi.stubGlobal('OffscreenCanvas', class {
            constructor(w, h) { this.width = w; this.height = h; }
            getContext() { return { drawImage() {} }; }
            async convertToBlob(opciones) {
                codificaciones.push({ ancho: this.width, alto: this.height, ...opciones });
                return new Blob(['j'], { type: 'image/jpeg' });
            }
        });
        await import('../workers/chatImage.worker.js');
    });

    it('`thumbSide: 0` y `quality`: una sola codificación, a esa calidad, y sin miniatura', async () => {
        await alMensaje({ data: { id: 7, file: foto(), maxSide: 1600, thumbSide: 0, quality: 0.85 } });
        expect(codificaciones).toEqual([{ ancho: 1600, alto: 1200, type: 'image/jpeg', quality: 0.85 }]);
        expect(respuestas).toHaveLength(1);
        expect(respuestas[0]).toMatchObject({ id: 7, ok: true, thumb: null, width: 4000, height: 3000 });
        expect(respuestas[0].upload).toBeInstanceOf(Blob);
    });

    it('el mensaje de siempre: subida a 0,82 y miniatura de 360 a 0,72', async () => {
        await alMensaje({ data: { id: 8, file: foto(), maxSide: 1600, thumbSide: 360 } });
        expect(codificaciones).toEqual([
            { ancho: 1600, alto: 1200, type: 'image/jpeg', quality: 0.82 },
            { ancho: 360, alto: 270, type: 'image/jpeg', quality: 0.72 },
        ]);
        expect(respuestas[0].thumb).toBeInstanceOf(Blob);
    });
});
