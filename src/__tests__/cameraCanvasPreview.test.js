import { describe, it, expect, vi, afterEach } from 'vitest';
import { cameraCoverCrop, startCameraCanvasPreview } from '../utils/cameraCanvasPreview';

afterEach(() => vi.restoreAllMocks());

function fixture({ width = 360, height = 480, sourceWidth = 1080, sourceHeight = 1920 } = {}) {
    const callbacks = new Map();
    let nextId = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { callbacks.set(++nextId, fn); return nextId; });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => callbacks.delete(id));
    const drawImage = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }) };
    const video = { readyState: 2, videoWidth: sourceWidth, videoHeight: sourceHeight };
    const frame = { getBoundingClientRect: () => ({ width, height }) };
    const onFirstFrame = vi.fn();
    const onError = vi.fn();
    const stop = startCameraCanvasPreview(video, canvas, frame, { onFirstFrame, onError, pixelRatio: 2 });
    const tick = (time) => {
        const [id, callback] = callbacks.entries().next().value;
        callbacks.delete(id);
        callback(time);
    };
    return { canvas, video, drawImage, stop, tick, callbacks, cancel, onFirstFrame, onError };
}

describe('camera canvas preview', () => {
    it('centra el recorte vertical y horizontal conservando su proporción', () => {
        expect(cameraCoverCrop(1080, 1920, 360, 480)).toEqual([0, 240, 1080, 1440]);
        expect(cameraCoverCrop(1920, 1080, 360, 480)).toEqual([555, 0, 810, 1080]);
    });

    it('pinta todo el visor desde el vídeo y anuncia solo el primer dibujo', () => {
        const f = fixture();
        f.tick(0);
        expect(f.canvas.width).toBe(720);
        expect(f.canvas.height).toBe(960);
        expect(f.drawImage).toHaveBeenCalledWith(f.video, 0, 240, 1080, 1440, 0, 0, 720, 960);
        f.tick(50);
        expect(f.onFirstFrame).toHaveBeenCalledTimes(1);
        f.stop();
        expect(f.callbacks.size).toBe(0);
        expect(f.cancel).toHaveBeenCalled();
        expect(f.canvas.width).toBe(1);
        expect(f.canvas.height).toBe(1);
    });

    it('limita resolución y frecuencia, y se adapta a la orientación de la fuente', () => {
        const f = fixture({ width: 1000, height: 1500 });
        f.tick(0);
        expect(f.canvas.height).toBe(960);
        expect(f.canvas.width).toBe(640);
        f.tick(16);
        expect(f.drawImage).toHaveBeenCalledTimes(1);
        f.video.videoWidth = 1920;
        f.video.videoHeight = 1080;
        f.tick(50);
        expect(f.drawImage).toHaveBeenLastCalledWith(f.video, 600, 0, 720, 1080, 0, 0, 640, 960);
        f.stop();
    });

    it('espera datos reales y no pinta después de cerrar', () => {
        const f = fixture();
        f.video.readyState = 1;
        f.tick(0);
        expect(f.drawImage).not.toHaveBeenCalled();
        expect(f.onFirstFrame).not.toHaveBeenCalled();
        f.stop();
        expect(f.callbacks.size).toBe(0);
    });

    it('detiene el loop y comunica un fallo de dibujo para activar la alternativa', () => {
        const f = fixture();
        f.drawImage.mockImplementation(() => { throw new Error('decode'); });
        f.tick(0);
        expect(f.onError).toHaveBeenCalledOnce();
        expect(f.onFirstFrame).not.toHaveBeenCalled();
        expect(f.callbacks.size).toBe(0);
        f.stop();
    });
});
