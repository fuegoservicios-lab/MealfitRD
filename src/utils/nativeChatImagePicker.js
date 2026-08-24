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
