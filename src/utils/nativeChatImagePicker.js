import { isNativeApp, nativePlatform } from '../config/platform';
import { marcarSondaTeclado } from './keyboardProbe';

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

// [P1-PLAN-LOTE-367 · 2026-09-26] La fototeca, según el sistema. En iOS, `chooseFromGallery` (plugin 8) NO abre el
// selector de Apple: pinta la cuadrícula SwiftUI propia de `IONCameraLib` («Photo Library», «Cancel»/«Done» en inglés),
// cuyas miniaturas se atascan en gris con su rueda hasta reiniciar la app (captura del dueño). `pickImages` presenta
// `PHPickerViewController`: el selector del sistema, fuera de proceso y en el idioma del teléfono. Con acceso LIMITADO a
// las fotos, `pickImages` responde «User denied access to photos» —ese plugin solo acepta acceso completo—: ahí se cae
// a la ruta anterior, que sí lo admite. Cancelar se propaga tal cual (no abre un segundo selector). Android no cambia.
// Devuelve la forma de `chooseFromGallery` (`[{ webPath, metadata: { format } }]`), que es la que lee `mediaResultToFile`.
async function elegirDeLaFototeca({ limit, quality, size }) {
    const { Camera, MediaTypeSelection } = await import('@capacitor/camera');
    if (nativePlatform() === 'ios') {
        try {
            const { photos = [] } = await Camera.pickImages({
                limit, quality, width: size, height: size, correctOrientation: true,
            });
            return photos.map((f) => ({ webPath: f.webPath, metadata: { format: f.format } }));
        } catch (err) {
            if (!/denied/i.test(String(err?.message || ''))) throw err;
        }
    }
    const { results = [] } = await Camera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: limit > 1,
        limit,
        quality,
        targetWidth: size,
        targetHeight: size,
        correctOrientation: true,
        includeMetadata: true,
    });
    return results;
}

export async function chooseNativeChatImages(limit = 4) {
    if (!isNativeApp()) return null;
    // [P1-PLAN-LOTE-346] Marcas de la sonda alrededor del plugin (¿el congelado es nativo o nuestro?) y la foto a
    // 1600 px / calidad 85: la web la reduce a 1600 igualmente, así que 2000 px a calidad 90 era trabajo nativo tirado.
    marcarSondaTeclado('fSel');
    const results = await elegirDeLaFototeca({ limit: Math.max(1, Math.min(Number(limit) || 1, 4)), quality: 85, size: 1600 });
    marcarSondaTeclado('fVuelve');
    const files = await Promise.all(results.slice(0, 4).map(mediaResultToFile));
    marcarSondaTeclado('fLeida');
    return files;
}

export async function takeNativeChatPhoto() {
    if (!isNativeApp()) return null;
    const { Camera } = await import('@capacitor/camera');
    marcarSondaTeclado('fSel');
    const result = await Camera.takePhoto({
        quality: 85,
        targetWidth: 1600,
        targetHeight: 1600,
        correctOrientation: true,
        includeMetadata: true,
        saveToGallery: false,
    });
    marcarSondaTeclado('fVuelve');
    const file = await mediaResultToFile(result, 0);
    marcarSondaTeclado('fLeida');
    return [file];
}

// [P1-PLAN-LOTE-224 · 2026-09-24] VARIAS fotos de la fototeca para el escáner de comida (un plato por foto, hasta 4,
// como el chat). Es el mismo selector del chat, que ya sabe elegir varias: un alias con el nombre del uso, no una copia.
export const chooseNativeGalleryImages = (limit = 4) => chooseNativeChatImages(limit);

// [P1-PLAN-LOTE-105 · 2026-09-18] UNA foto de la fototeca, para el escáner de comidas (hoy: el de la Nevera). En la app nativa el
// `<input type="file" accept="image/*">` de la web abre SIEMPRE la hoja de iOS con tres opciones (Fototeca /
// Tomar foto / Seleccionar archivo) — no hay forma de evitarla desde la web; el dueño la quería directa. El plugin
// abre el selector de fotos del sistema sin preguntar. En la web devuelve null y el escáner sigue con su input.
export async function chooseNativeGalleryImage() {
    if (!isNativeApp()) return null;
    const results = await elegirDeLaFototeca({ limit: 1, quality: 90, size: 2000 });
    if (!results.length) return null;
    return mediaResultToFile(results[0], 0);
}
