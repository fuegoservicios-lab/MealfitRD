// [P1-PLAN-LOTE-306 · 2026-09-25] Prepara la foto del chat FUERA del hilo principal: decodificar, reducir a 1600 px
// para subirla y a 360 px para la miniatura, y codificar las dos en JPEG. Antes todo eso corría en el hilo principal
// —la miniatura con `toDataURL`, síncrono— justo cuando el teclado volvía a subir tras el selector de fotos.
// Mensaje: { id, file, maxSide, thumbSide }. Respuesta: { id, ok, upload, thumb, width, height } o { id, ok:false, code }.
// Cualquier `ok:false` que no sea de tamaño hace que `chatImageProcessing.js` repita en el hilo principal (HEIC, etc.).
const MAX_PIXELS = 40_000_000;   // espejo de CHAT_IMAGE_MAX_PIXELS

const escalar = (bitmap, w, h, lado) => {
    const k = Math.min(1, lado / Math.max(w, h));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
};

const decodificar = async (file) => {
    try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
        return createImageBitmap(file);
    }
};

// Trabajos cancelados por el hilo principal (quitó la foto): se abandonan entre pasos y sueltan su bitmap.
const cancelados = new Set();

self.addEventListener('message', async ({ data }) => {
    if (data && data.cancel != null) { cancelados.add(data.cancel); return; }
    const { id, file, maxSide = 1600, thumbSide = 360 } = data || {};
    let bitmap = null;
    const cancelado = () => cancelados.delete(id);
    try {
        try {
            bitmap = await decodificar(file);
        } catch {
            self.postMessage({ id, ok: false, code: 'DECODE_FAILED' });
            return;
        }
        const width = bitmap.width;
        const height = bitmap.height;
        if (!width || !height) {
            self.postMessage({ id, ok: false, code: 'DECODE_FAILED' });
            return;
        }
        if (width * height > MAX_PIXELS) {
            self.postMessage({ id, ok: false, code: 'IMAGE_DIMENSIONS_TOO_LARGE' });
            return;
        }
        if (cancelado()) return;
        const upload = await escalar(bitmap, width, height, maxSide).convertToBlob({ type: 'image/jpeg', quality: 0.82 });
        if (cancelado()) return;
        const thumb = await escalar(bitmap, width, height, thumbSide).convertToBlob({ type: 'image/jpeg', quality: 0.72 });
        self.postMessage({ id, ok: true, upload, thumb, width, height });
    } catch {
        self.postMessage({ id, ok: false, code: 'WORKER_FAILED' });
    } finally {
        try { bitmap?.close?.(); } catch { /* ya cerrado */ }
    }
});
