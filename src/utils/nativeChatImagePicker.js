import { isNativeApp } from '../config/platform';

const extensionFor = (type, format) => {
    const normalized = String(format || type?.split('/')[1] || 'jpg').toLowerCase();
    return normalized === 'jpeg' ? 'jpg' : normalized.replace(/[^a-z0-9]/g, '') || 'jpg';
};

const mediaResultToFile = async (result, index) => {
    const source = result?.webPath || result?.uri;
    if (!source) throw new Error('NATIVE_IMAGE_PATH_MISSING');
    const response = await fetch(source);
    if (!response.ok) throw new Error('NATIVE_IMAGE_READ_FAILED');
    const blob = await response.blob();
    const type = blob.type || `image/${result?.metadata?.format || 'jpeg'}`;
    return new File(
        [blob],
        `imagen-${Date.now()}-${index + 1}.${extensionFor(type, result?.metadata?.format)}`,
        { type, lastModified: Date.now() },
    );
};

export const isNativePickerCancellation = (error) => {
    const value = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
    return value.includes('cancel') || value.includes('canceled') || value.includes('cancelled');
};

export async function chooseNativeChatImages(limit = 4) {
    if (!isNativeApp()) return null;
    const { Camera, MediaTypeSelection } = await import('@capacitor/camera');
    const { results = [] } = await Camera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: true,
        limit: Math.max(1, Math.min(Number(limit) || 1, 4)),
        quality: 90,
        targetWidth: 2000,
        targetHeight: 2000,
        correctOrientation: true,
        includeMetadata: true,
    });
    return Promise.all(results.slice(0, 4).map(mediaResultToFile));
}

export async function takeNativeChatPhoto() {
    if (!isNativeApp()) return null;
    const { Camera } = await import('@capacitor/camera');
    const result = await Camera.takePhoto({
        quality: 90,
        targetWidth: 2000,
        targetHeight: 2000,
        correctOrientation: true,
        includeMetadata: true,
        saveToGallery: false,
    });
    return [await mediaResultToFile(result, 0)];
}

// [P1-PLAN-LOTE-221 · 2026-09-24] VARIAS fotos de la fototeca para el escáner de comida (un plato por foto, hasta 4,
// como el chat). Es el mismo selector del chat, que ya sabe elegir varias: un alias con el nombre del uso, no una copia.
export const chooseNativeGalleryImages = (limit = 4) => chooseNativeChatImages(limit);

// [P1-PLAN-LOTE-105 · 2026-09-18] UNA foto de la fototeca, para el escáner de comidas (hoy: el de la Nevera). En la app nativa el
// `<input type="file" accept="image/*">` de la web abre SIEMPRE la hoja de iOS con tres opciones (Fototeca /
// Tomar foto / Seleccionar archivo) — no hay forma de evitarla desde la web; el dueño la quería directa. El plugin
// abre el selector de fotos del sistema sin preguntar. En la web devuelve null y el escáner sigue con su input.
export async function chooseNativeGalleryImage() {
    if (!isNativeApp()) return null;
    const { Camera, MediaTypeSelection } = await import('@capacitor/camera');
    const { results = [] } = await Camera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: false,
        limit: 1,
        quality: 90,
        targetWidth: 2000,
        targetHeight: 2000,
        correctOrientation: true,
        includeMetadata: true,
    });
    if (!results.length) return null;
    return mediaResultToFile(results[0], 0);
}
