// [P1-PLAN-LOTE-367 · 2026-09-26] En iPhone, la fototeca se abre con el selector de APPLE, no con la cuadrícula del plugin.
//
// El dueño (captura): «a veces esto se buguea, no quieren aparecer las fotos y luego tengo que cerrar y abrir la app».
// La pantalla —«Photo Library», «Cancel»/«Done» en inglés, cuadros grises con rueda— NO es el selector de iOS: es la
// cuadrícula SwiftUI propia de `IONCameraLib` (la que usa `Camera.chooseFromGallery` del plugin 8), cuyas miniaturas
// pide a Fotos en alta calidad y con red, y cuyo servicio se crea (y se registra como observador de la fototeca) en
// CADA apertura sin desregistrarse nunca. Cuando se atasca, solo reiniciar la app lo cura.
// En iOS se usa `Camera.pickImages`, que presenta `PHPickerViewController`: el selector del sistema, fuera de proceso,
// en el idioma del teléfono y sin esa cuadrícula. Si el usuario dio acceso LIMITADO a sus fotos, `pickImages` lo trata
// como «denegado»: entonces se cae a la ruta anterior, que sí sabe con acceso limitado. Android no cambia.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const plataforma = vi.hoisted(() => ({ valor: 'ios' }));
vi.mock('../config/platform', () => ({ isNativeApp: () => true, nativePlatform: () => plataforma.valor }));
vi.mock('../utils/keyboardProbe', async (orig) => ({ ...(await orig()), marcarSondaTeclado: () => {} }));
const camara = vi.hoisted(() => ({ pick: null, choose: null }));
vi.mock('@capacitor/camera', () => ({
    MediaTypeSelection: { Photo: 'photo' },
    Camera: {
        pickImages: (o) => camara.pick(o),
        chooseFromGallery: (o) => camara.choose(o),
    },
}));

beforeEach(() => {
    plataforma.valor = 'ios';
    camara.pick = vi.fn(async () => ({ photos: [{ webPath: 'capacitor://a.jpeg', format: 'jpeg' }, { webPath: 'capacitor://b.jpeg', format: 'jpeg' }] }));
    camara.choose = vi.fn(async () => ({ results: [{ webPath: 'blob:x', metadata: { format: 'jpeg' } }] }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) })));
});

describe('[367] la fototeca en iPhone', () => {
    it('usa el selector de Apple (pickImages) con el mismo tamaño, calidad y límite', async () => {
        const { chooseNativeChatImages } = await import('../utils/nativeChatImagePicker');
        const files = await chooseNativeChatImages(3);
        expect(files).toHaveLength(2);
        expect(files[0].type).toBe('image/jpeg');
        expect(camara.choose).not.toHaveBeenCalled();
        expect(camara.pick).toHaveBeenCalledWith(expect.objectContaining({ limit: 3, quality: 85, width: 1600, height: 1600, correctOrientation: true }));
    });

    it('la de una sola foto (Nevera) también', async () => {
        const { chooseNativeGalleryImage } = await import('../utils/nativeChatImagePicker');
        const file = await chooseNativeGalleryImage();
        expect(file).toBeInstanceOf(File);
        expect(camara.pick).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
        expect(camara.choose).not.toHaveBeenCalled();
    });

    it('con acceso LIMITADO a las fotos (pickImages dice «denied»), cae a la ruta anterior', async () => {
        camara.pick = vi.fn(async () => { throw new Error('User denied access to photos'); });
        const { chooseNativeChatImages } = await import('../utils/nativeChatImagePicker');
        const files = await chooseNativeChatImages(2);
        expect(files).toHaveLength(1);
        expect(camara.choose).toHaveBeenCalled();
    });

    it('cancelar no abre otro selector: se propaga como cancelación', async () => {
        camara.pick = vi.fn(async () => { throw new Error('User cancelled photos app'); });
        const { chooseNativeChatImages, isNativePickerCancellation } = await import('../utils/nativeChatImagePicker');
        const err = await chooseNativeChatImages(2).catch((e) => e);
        expect(isNativePickerCancellation(err)).toBe(true);
        expect(camara.choose).not.toHaveBeenCalled();
    });

    it('Android sigue con chooseFromGallery', async () => {
        plataforma.valor = 'android';
        const { chooseNativeChatImages } = await import('../utils/nativeChatImagePicker');
        await chooseNativeChatImages(2);
        expect(camara.pick).not.toHaveBeenCalled();
        expect(camara.choose).toHaveBeenCalled();
    });
});
