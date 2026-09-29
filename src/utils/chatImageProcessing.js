import { marcarSondaTeclado } from './keyboardProbe';

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

const nombreJpg = (file) => `${String(file.name || 'imagen').replace(/\.[^.]+$/, '')}.jpg`;

const errorConCodigo = (code) => {
    const error = new Error(code);
    error.code = code;
    return error;
};

// ── [P1-PLAN-LOTE-306 · 2026-09-25] La foto se prepara en un Web Worker ─────────────────────────────────────────────
// Al volver del selector de fotos el teclado vuelve a subir; decodificar y reducir una foto de 12 MP en el hilo
// principal (con la miniatura en `toDataURL`, síncrono) le robaba los fotogramas a esa animación. El worker hace lo
// mismo con OffscreenCanvas. Sin Worker/OffscreenCanvas (Safari < 16.4), o si el worker no sabe decodificar el
// formato (HEIC en algunos WebKit) o revienta, se repite en el hilo principal: el contrato no cambia.
let workerCompartido = null;
let workerDesactivado = false;
let siguienteId = 0;
/** Plazo para que el worker responda. Si no carga (red, esquema del WebView) o se cuelga, la foto no puede quedarse
 *  «preparando» para siempre: pasado el plazo se da por muerto y todo sigue por el hilo principal. */
export const WORKER_IMAGEN_PLAZO_MS = 10_000;

const workerDisponible = () => !workerDesactivado
    && typeof Worker === 'function' && typeof OffscreenCanvas === 'function';

const obtenerWorker = () => {
    if (workerCompartido) return workerCompartido;
    const worker = new Worker(new URL('../workers/chatImage.worker.js', import.meta.url), { type: 'module' });
    // Oyente PERMANENTE: un fallo al cargar el script llega una sola vez, a menudo antes de que haya trabajo escuchando
    // (lo precalienta el «+»). Sin esto el worker quedaba «vivo» y la foto siguiente esperaba una respuesta que no llega.
    const alMorir = () => { if (workerCompartido === worker) desactivarWorker(); };
    worker.addEventListener('error', alMorir);
    worker.addEventListener('messageerror', alMorir);
    workerCompartido = worker;
    return worker;
};

/** Arranca el worker sin mandarle trabajo: su arranque (cargar y compilar el módulo) le costaba ~130 ms al hilo
 *  principal con la CPU de un teléfono, medido. El «+» lo llama mientras el usuario elige la foto. */
/** [P1-PLAN-LOTE-360] ¿La foto se preparará en el worker? (entonces no hace falta aplazarla por el teclado) */
export const workerDeImagenDisponible = () => workerDisponible();

export function precalentarWorkerDeImagen() {
    if (!workerDisponible()) return;
    try { obtenerWorker(); } catch { desactivarWorker(); }
}

const desactivarWorker = () => {
    workerDesactivado = true;
    try { workerCompartido?.terminate?.(); } catch { /* ya terminado */ }
    workerCompartido = null;
};

// [P1-PLAN-LOTE-848] `quality` y `thumbSide` opcionales: sin ellos el mensaje es el de siempre (0,82 y miniatura de 360).
const prepararEnWorker = (file, { signal, maxSide, quality, thumbSide = 360 }) => new Promise((resolve, reject) => {
    let worker;
    try { worker = obtenerWorker(); } catch (error) { desactivarWorker(); reject(errorConCodigo('WORKER_UNAVAILABLE')); return; }
    const id = ++siguienteId;
    const plazo = setTimeout(() => {
        limpiar();
        desactivarWorker();
        reject(errorConCodigo('WORKER_UNAVAILABLE'));
    }, WORKER_IMAGEN_PLAZO_MS);
    const limpiar = () => {
        clearTimeout(plazo);
        worker.removeEventListener('message', alMensaje);
        worker.removeEventListener('error', alError);
        worker.removeEventListener('messageerror', alError);
        signal?.removeEventListener('abort', alAbortar);
    };
    function alMensaje({ data }) {
        if (data?.id !== id) return;
        limpiar();
        if (data.ok) resolve(data);
        else reject(errorConCodigo(data.code || 'WORKER_FAILED'));
    }
    function alError() {
        limpiar();
        desactivarWorker();
        reject(errorConCodigo('WORKER_UNAVAILABLE'));
    }
    function alAbortar() {
        limpiar();
        // Que el worker suelte la foto (un bitmap de 12 MP son ~48 MB) en vez de terminar dos codificaciones que ya nadie quiere.
        try { worker.postMessage({ cancel: id }); } catch { /* worker ya muerto */ }
        reject(abortError());
    }
    worker.addEventListener('message', alMensaje);
    worker.addEventListener('error', alError);
    worker.addEventListener('messageerror', alError);
    signal?.addEventListener('abort', alAbortar, { once: true });
    try {
        worker.postMessage({ id, file, maxSide, thumbSide, ...(quality != null ? { quality } : {}) });
    } catch {
        limpiar();
        reject(errorConCodigo('WORKER_FAILED'));
    }
});

const blobADataUrl = (blob) => new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(lector.error || new Error('No se pudo leer la miniatura'));
    lector.readAsDataURL(blob);
});

/**
 * Decodifica una sola vez y deriva de esa decodificación tanto el archivo de
 * subida como la miniatura: en un Web Worker cuando se puede (lote 306), si no
 * en el hilo principal.
 */
export async function prepareChatImage(file, { signal, maxSide = 1600 } = {}) {
    if (!(file instanceof Blob) || !String(file.type || '').startsWith('image/')) {
        throw new TypeError('Formato de imagen no soportado');
    }
    if (file.size > CHAT_IMAGE_MAX_SOURCE_BYTES) throw errorConCodigo('IMAGE_TOO_LARGE');
    assertNotAborted(signal);

    if (workerDisponible()) {
        try {
            marcarSondaTeclado('prepW');   // [P1-PLAN-LOTE-346] la sonda dice por dónde se preparó la foto
            const r = await prepararEnWorker(file, { signal, maxSide });
            const thumbDataUrl = await blobADataUrl(r.thumb);
            assertNotAborted(signal);
            const uploadFile = new File([r.upload], nombreJpg(file), { type: 'image/jpeg', lastModified: Date.now() });
            marcarSondaTeclado('prepFin');
            return { file: uploadFile, thumbDataUrl, width: r.width, height: r.height };
        } catch (error) {
            if (error?.name === 'AbortError' || error?.code === 'IMAGE_DIMENSIONS_TOO_LARGE') throw error;
            // DECODE_FAILED / WORKER_FAILED / WORKER_UNAVAILABLE: el hilo principal lo intenta con su Image del sistema.
        }
    }
    marcarSondaTeclado('prepP');
    const r = await _internals.prepararEnHiloPrincipal(file, { signal, maxSide });
    marcarSondaTeclado('prepFin');
    return r;
}

async function prepararEnHiloPrincipal(file, { signal, maxSide = 1600 } = {}) {
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
        const uploadFile = new File([uploadBlob], nombreJpg(file), { type: 'image/jpeg', lastModified: Date.now() });
        return { file: uploadFile, thumbDataUrl, width, height };
    } finally {
        if (uploadCanvas) { uploadCanvas.width = 1; uploadCanvas.height = 1; }
        if (thumbCanvas) { thumbCanvas.width = 1; thumbCanvas.height = 1; }
        try { decoded.close?.(); } catch { /* ImageBitmap ya cerrado */ }
    }
}

// ── [P1-PLAN-LOTE-848 · 2026-09-29] Reducir una foto elegida, sin miniatura ────────────────────────────────────────
// En iPhone la fototeca ya no la abre el plugin de cámara (que pedía acceso a TODAS las fotos) sino el
// `<input type="file">` de WebKit, y la foto llega tal como está en Fotos (12-24 MP). El plugin la entregaba reducida
// (1.600 px a calidad 0,85; la de la Nevera, 2.000 px a 0,9): esto hace lo mismo, en el worker cuando se puede
// —el selector se cierra justo cuando el teclado vuelve a subir— y si no en el hilo principal. Devuelve un Blob JPEG.
export async function reducirImagen(file, { maxSide = 1600, quality = 0.82, signal } = {}) {
    if (!(file instanceof Blob) || !String(file.type || '').startsWith('image/')) {
        throw new TypeError('Formato de imagen no soportado');
    }
    assertNotAborted(signal);
    // [P1-PLAN-LOTE-848 · parte B] Una foto de más de 40 MP (HEIF Max, ProRAW de 48 MP) se rechaza por la CABECERA, sin
    // decodificarla: antes el worker la decodificaba entera (~190 MB) solo para descubrir que no cabía.
    const dimensiones = await dimensionesDeCabecera(file);
    assertNotAborted(signal);
    if (dimensiones && dimensiones.ancho * dimensiones.alto > CHAT_IMAGE_MAX_PIXELS) {
        throw errorConCodigo('IMAGE_DIMENSIONS_TOO_LARGE');
    }
    if (workerDisponible()) {
        try {
            const r = await prepararEnWorker(file, { signal, maxSide, quality, thumbSide: 0 });
            return r.upload;
        } catch (error) {
            if (error?.name === 'AbortError' || error?.code === 'IMAGE_DIMENSIONS_TOO_LARGE') throw error;
            // DECODE_FAILED / WORKER_FAILED / WORKER_UNAVAILABLE: lo intenta el hilo principal, como prepareChatImage.
        }
    }
    return _internals.reducirEnHiloPrincipal(file, { signal, maxSide, quality });
}

// [P1-PLAN-LOTE-848 · parte B] En el hilo principal la foto se abre con `<img>`, no con `createImageBitmap`: aquí solo
// llega sin OffscreenCanvas (Safari < 16.4), y el `createImageBitmap` de iOS 15 ignora la orientación EXIF (la foto hecha
// en vertical salía tumbada), mientras que `<img>` la respeta. Y `<img>` da las dimensiones al cargar sin decodificar los
// píxeles: una foto que no cabe se rechaza antes de dibujarla. Si `<img>` no puede, se intenta como antes.
const abrirParaReducir = async (file, signal) => {
    try {
        return await loadWithImageElement(file, signal);
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        return decodeImage(file, signal);
    }
};

async function reducirEnHiloPrincipal(file, { signal, maxSide = 1600, quality = 0.82 } = {}) {
    assertNotAborted(signal);
    const decoded = await abrirParaReducir(file, signal);
    let canvas = null;
    try {
        assertNotAborted(signal);
        const width = Number(decoded.naturalWidth || decoded.width) || 0;
        const height = Number(decoded.naturalHeight || decoded.height) || 0;
        if (!width || !height) throw new Error('Dimensiones de imagen inválidas');
        if (width * height > CHAT_IMAGE_MAX_PIXELS) throw errorConCodigo('IMAGE_DIMENSIONS_TOO_LARGE');
        canvas = drawScaled(decoded, width, height, maxSide);
        return await canvasToBlob(canvas, 'image/jpeg', quality);
    } finally {
        if (canvas) { canvas.width = 1; canvas.height = 1; }
        try { decoded.close?.(); } catch { /* ImageBitmap ya cerrado */ }
    }
}

// [P1-PLAN-LOTE-848 · parte B] Ancho y alto de un JPEG leídos de su cabecera (el marcador SOF), sin decodificar nada.
// `null` si no es un JPEG o la cabecera no se entiende: entonces decide la decodificación, como siempre. El `<input>` de
// iOS entrega JPEG (convierte las HEIC al elegirlas), así que es el caso que importa. Los segmentos APP (EXIF con su
// miniatura, ICC, MPF) se SALTAN por su longitud: el SOF de la miniatura EXIF no se confunde con el de la foto.
const CABECERA_MAX_BYTES = 512 * 1024;

const leerBytes = (blob) => (typeof blob.arrayBuffer === 'function'
    ? blob.arrayBuffer()
    : new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result);
        lector.onerror = () => reject(lector.error || new Error('No se pudo leer la cabecera'));
        lector.readAsArrayBuffer(blob);
    }));

export function dimensionesJpeg(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
    let i = 2;
    while (i + 3 < b.length) {
        if (b[i] !== 0xFF) return null;
        const marca = b[i + 1];
        if (marca === 0xFF) { i += 1; continue; }                                   // relleno
        if (marca === 0x01 || (marca >= 0xD0 && marca <= 0xD8)) { i += 2; continue; } // marcadores sin longitud
        if (marca === 0xD9 || marca === 0xDA) return null;                          // fin o datos antes del SOF
        const largo = (b[i + 2] << 8) | b[i + 3];
        if (largo < 2) return null;
        const esSof = marca >= 0xC0 && marca <= 0xCF && marca !== 0xC4 && marca !== 0xC8 && marca !== 0xCC;
        if (esSof) {
            if (i + 8 >= b.length) return null;
            const alto = (b[i + 5] << 8) | b[i + 6];
            const ancho = (b[i + 7] << 8) | b[i + 8];
            return alto && ancho ? { ancho, alto } : null;
        }
        i += 2 + largo;
    }
    return null;
}

async function dimensionesDeCabecera(file) {
    if (!/jpe?g/i.test(String(file.type || ''))) return null;
    try {
        return dimensionesJpeg(new Uint8Array(await leerBytes(file.slice(0, CABECERA_MAX_BYTES))));
    } catch {
        return null;
    }
}

/** Puntos de prueba (los tests espían el camino del hilo principal). */
export const _internals = { prepararEnHiloPrincipal, reducirEnHiloPrincipal };
