/**
 * [P1-PLAN-LOTE-848 · parte B · 2026-09-29] La reducción del `<input>` de respaldo (binarios sin `MfFotos`).
 *
 * Tres arreglos que dejó la revisión de la parte A:
 *  - una foto de más de 40 MP se rechaza por la CABECERA del JPEG, sin decodificarla (antes el worker la decodificaba
 *    entera, ~190 MB, para descubrir que no cabía);
 *  - en el hilo principal (Safari < 16.4, sin OffscreenCanvas) la foto se abre con `<img>`: el `createImageBitmap` de
 *    iOS 15 ignora la orientación EXIF, `<img>` no;
 *  - y con `<img>` las dimensiones se leen antes de dibujar: la que no cabe no llega al canvas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class FakeWorker {
    static instancias = [];
    static respuesta = null;
    constructor() {
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

// Un JPEG mínimo: SOI, un APP1 (EXIF) que lleva DENTRO el SOF de su miniatura (160x120), y el SOF0 de la foto.
const segmento = (marca, cuerpo) => [0xFF, marca, ((cuerpo.length + 2) >> 8) & 0xFF, (cuerpo.length + 2) & 0xFF, ...cuerpo];
const sof = (ancho, alto) => segmento(0xC0, [8, (alto >> 8) & 0xFF, alto & 0xFF, (ancho >> 8) & 0xFF, ancho & 0xFF, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const jpegCon = (ancho, alto) => new Uint8Array([
    0xFF, 0xD8,
    ...segmento(0xE1, [0x45, 0x78, 0x69, 0x66, 0, 0, 0xFF, 0xD8, ...sof(160, 120), 0xFF, 0xD9]),
    ...segmento(0xDB, new Array(65).fill(1)),
    ...sof(ancho, alto),
    0xFF, 0xDA, 0, 2, 0xFF, 0xD9,
]);
const fotoJpeg = (ancho, alto) => new File([jpegCon(ancho, alto)], 'IMG_0001.jpg', { type: 'image/jpeg' });

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

describe('[848-B] dimensiones por la cabecera del JPEG', () => {
    it('lee el SOF de la foto y NO el de la miniatura EXIF', () => {
        expect(mod.dimensionesJpeg(jpegCon(8064, 6048))).toEqual({ ancho: 8064, alto: 6048 });
        expect(mod.dimensionesJpeg(jpegCon(4032, 3024))).toEqual({ ancho: 4032, alto: 3024 });
    });

    it('lo que no es un JPEG, o una cabecera cortada, no decide nada (null)', () => {
        expect(mod.dimensionesJpeg(new Uint8Array([0x89, 0x50, 0x4E, 0x47]))).toBeNull();
        expect(mod.dimensionesJpeg(jpegCon(4032, 3024).slice(0, 30))).toBeNull();
        expect(mod.dimensionesJpeg(new Uint8Array([]))).toBeNull();
    });

    it('una foto de 48 MP se rechaza SIN decodificarla: ni worker ni hilo principal', async () => {
        const principal = vi.spyOn(mod._internals, 'reducirEnHiloPrincipal');
        await expect(mod.reducirImagen(fotoJpeg(8064, 6048), { maxSide: 1600, quality: 0.85 }))
            .rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS_TOO_LARGE' });
        expect(FakeWorker.instancias.flatMap((w) => w.mensajes)).toHaveLength(0);
        expect(principal).not.toHaveBeenCalled();
    });

    it('una de 12 MP sigue su camino al worker', async () => {
        FakeWorker.respuesta = () => ({ ok: true, upload: new Blob(['R'], { type: 'image/jpeg' }), thumb: null });
        const blob = await mod.reducirImagen(fotoJpeg(4032, 3024), { maxSide: 1600, quality: 0.85 });
        expect(await blob.text()).toBe('R');
        expect(FakeWorker.instancias[0].mensajes).toHaveLength(1);
    });
});

describe('[848-B] el hilo principal abre la foto con <img> (iOS 15 y la orientación EXIF)', () => {
    let imagenes;
    let dibujos;
    let bitmap;

    const stubImagen = (ancho, alto, { falla = false } = {}) => {
        vi.stubGlobal('Image', class {
            constructor() { imagenes.push(this); }
            set src(v) {
                this._src = v;
                if (!v) return;
                queueMicrotask(() => {
                    if (falla) { this.onerror?.(); return; }
                    this.naturalWidth = ancho;
                    this.naturalHeight = alto;
                    this.onload?.();
                });
            }
            get src() { return this._src; }
        });
    };

    beforeEach(() => {
        imagenes = [];
        dibujos = [];
        bitmap = vi.fn(async () => ({ width: 3000, height: 4000, close() {} }));
        vi.stubGlobal('createImageBitmap', bitmap);
        vi.stubGlobal('OffscreenCanvas', undefined);
        URL.createObjectURL = vi.fn(() => 'blob:foto');
        URL.revokeObjectURL = vi.fn();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function contexto() {
            return { drawImage: (fuente, x, y, w, h) => dibujos.push({ fuente, w, h }) };
        });
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function codificar(cb, tipo, calidad) {
            cb(new Blob([`${this.width}x${this.height}@${calidad}`], { type: tipo }));
        });
    });

    it('decodifica con <img>, no con createImageBitmap, y reduce con el lado y la calidad pedidos', async () => {
        stubImagen(3024, 4032);
        const blob = await mod._internals.reducirEnHiloPrincipal(new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
            { maxSide: 1600, quality: 0.85 });
        expect(bitmap).not.toHaveBeenCalled();
        expect(imagenes).toHaveLength(1);
        expect(dibujos).toHaveLength(1);
        expect(dibujos[0].fuente).toBe(imagenes[0]);
        expect(await blob.text()).toBe('1200x1600@0.85');   // vertical: la orientación que da <img>
    });

    it('la que no cabe (más de 40 MP) se rechaza antes de dibujarla', async () => {
        stubImagen(8064, 6048);
        await expect(mod._internals.reducirEnHiloPrincipal(new File(['x'], 'b.jpg', { type: 'image/jpeg' })))
            .rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS_TOO_LARGE' });
        expect(dibujos).toHaveLength(0);
    });

    it('si <img> no sabe abrirla, se intenta como antes (createImageBitmap)', async () => {
        stubImagen(0, 0, { falla: true });
        const blob = await mod._internals.reducirEnHiloPrincipal(new File(['x'], 'c.heic', { type: 'image/heic' }),
            { maxSide: 2000, quality: 0.9 });
        expect(bitmap).toHaveBeenCalledTimes(1);
        expect(await blob.text()).toBe('1500x2000@0.9');
    });
});
