export const CHAT_IMAGE_MAX_COUNT = 4;
export const CHAT_IMAGE_MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const CHAT_IMAGE_MAX_TOTAL_SOURCE_BYTES = 32 * 1024 * 1024;
export const CHAT_IMAGE_MAX_PIXELS = 40_000_000;

export async function mapWithConcurrency(items, concurrency, mapper) {
    const values = Array.from(items || []);
    if (!values.length) return [];
    const results = new Array(values.length);
    const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, values.length));
    let cursor = 0;
    let firstError = null;

    const worker = async () => {
        while (!firstError) {
            const index = cursor;
            cursor += 1;
            if (index >= values.length) return;
            try {
                results[index] = await mapper(values[index], index);
            } catch (error) {
                firstError = error;
                throw error;
            }
        }
    };
    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
}

const abortError = () => new DOMException('Preparación cancelada', 'AbortError');

const assertNotAborted = (signal) => {
    if (signal?.aborted) throw abortError();
};

const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo codificar la imagen'));
    }, type, quality);
});

const loadWithImageElement = (file, signal) => new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
        cleanup();
        image.src = '';
        reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error('La imagen no se pudo decodificar')); };
    image.src = objectUrl;
});

const decodeImage = async (file, signal) => {
    assertNotAborted(signal);
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (error) {
            if (signal?.aborted) throw abortError();
            // Safari antiguos aceptan createImageBitmap pero no sus opciones.
            try {
                return await createImageBitmap(file);
            } catch (_fallbackError) {
                if (signal?.aborted) throw abortError();
                // Ciertos HEIC solo los decodifica el elemento Image del sistema.
            }
        }
    }
    return loadWithImageElement(file, signal);
};

const drawScaled = (source, sourceWidth, sourceHeight, maxSide) => {
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas no disponible');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
};

/**
 * Decodifica una sola vez y deriva de esa decodificación tanto el archivo de
 * subida como la miniatura. createImageBitmap mueve la decodificación fuera del
 * camino principal en los navegadores que lo soportan.
 */
export async function prepareChatImage(file, { signal, maxSide = 1600 } = {}) {
    if (!(file instanceof Blob) || !String(file.type || '').startsWith('image/')) {
        throw new TypeError('Formato de imagen no soportado');
    }
    if (file.size > CHAT_IMAGE_MAX_SOURCE_BYTES) {
        const error = new Error('IMAGE_TOO_LARGE');
        error.code = 'IMAGE_TOO_LARGE';
        throw error;
    }

    const decoded = await decodeImage(file, signal);
    let uploadCanvas = null;
    let thumbCanvas = null;
    try {
        assertNotAborted(signal);
        const width = Number(decoded.naturalWidth || decoded.width) || 0;
        const height = Number(decoded.naturalHeight || decoded.height) || 0;
        if (!width || !height) throw new Error('Dimensiones de imagen inválidas');
        if (width * height > CHAT_IMAGE_MAX_PIXELS) {
            const error = new Error('IMAGE_DIMENSIONS_TOO_LARGE');
            error.code = 'IMAGE_DIMENSIONS_TOO_LARGE';
            throw error;
        }

        uploadCanvas = drawScaled(decoded, width, height, maxSide);
        const uploadBlob = await canvasToBlob(uploadCanvas, 'image/jpeg', 0.82);
        assertNotAborted(signal);

        thumbCanvas = drawScaled(decoded, width, height, 360);
        const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.72);
        const uploadFile = new File(
            [uploadBlob],
            `${String(file.name || 'imagen').replace(/\.[^.]+$/, '')}.jpg`,
            { type: 'image/jpeg', lastModified: Date.now() },
        );
        return { file: uploadFile, thumbDataUrl, width, height };
    } finally {
        if (uploadCanvas) { uploadCanvas.width = 1; uploadCanvas.height = 1; }
        if (thumbCanvas) { thumbCanvas.width = 1; thumbCanvas.height = 1; }
        try { decoded.close?.(); } catch { /* ImageBitmap ya cerrado */ }
    }
}
