// [P1-PLAN-LOTE-367 · 2026-09-26] En iPhone, la fototeca se abre con el selector de APPLE, no con la cuadrícula del plugin.
//
// El dueño (captura): «a veces esto se buguea, no quieren aparecer las fotos y luego tengo que cerrar y abrir la app».
// La pantalla —«Photo Library», «Cancel»/«Done» en inglés, cuadros grises con rueda— NO es el selector de iOS: es la
// cuadrícula SwiftUI propia de `IONCameraLib` (la que usa `Camera.chooseFromGallery` del plugin 8), cuyas miniaturas
// pide a Fotos en alta calidad y con red, y cuyo servicio se crea (y se registra como observador de la fototeca) en
// CADA apertura sin desregistrarse nunca. Cuando se atasca, solo reiniciar la app lo cura.
//
// [P1-PLAN-LOTE-848 · 2026-09-29] En iOS tampoco se usa ya `Camera.pickImages`: pedía acceso COMPLETO a Fotos antes de
// abrir el selector (auditoría App Store, fila 2.3). La fototeca la abre el `<input type="file">` de WebKit, que presenta
// el mismo `PHPickerViewController` sin pedir permiso (lote848.picker.test.js). Lo que este lote protegía sigue en pie:
// la cuadrícula de IONCameraLib no vuelve a iOS. La vuelta a `chooseFromGallery` con acceso limitado desapareció con el
// permiso. Android no cambia.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const inputsAbiertos = () => document.body.querySelectorAll('input[type="file"]');

beforeEach(() => {
    plataforma.valor = 'ios';
    camara.pick = vi.fn(async () => ({ photos: [{ webPath: 'capacitor://a.jpeg', format: 'jpeg' }] }));
    camara.choose = vi.fn(async () => ({ results: [{ webPath: 'blob:x', metadata: { format: 'jpeg' } }] }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) })));
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
    inputsAbiertos().forEach((input) => input.remove());   // red de seguridad: cada test cierra el suyo
    vi.restoreAllMocks();
});

describe('[367 → 848] la fototeca en iPhone', () => {
    it('ni pickImages ni chooseFromGallery: abre el selector del sistema (WebKit)', async () => {
        const { chooseNativeChatImages, isNativePickerCancellation } = await import('../utils/nativeChatImagePicker');
        const pendiente = chooseNativeChatImages(3);
        expect(inputsAbiertos()).toHaveLength(1);
        expect(camara.pick).not.toHaveBeenCalled();
        expect(camara.choose).not.toHaveBeenCalled();
        inputsAbiertos()[0].dispatchEvent(new Event('cancel'));
        expect(isNativePickerCancellation(await pendiente.catch((e) => e))).toBe(true);
    });

    it('la de una sola foto (Nevera) tampoco usa el plugin', async () => {
        const { chooseNativeGalleryImage } = await import('../utils/nativeChatImagePicker');
        const pendiente = chooseNativeGalleryImage();
        expect(inputsAbiertos()).toHaveLength(1);
        expect(inputsAbiertos()[0].multiple).toBe(false);
        expect(camara.pick).not.toHaveBeenCalled();
        expect(camara.choose).not.toHaveBeenCalled();
        inputsAbiertos()[0].dispatchEvent(new Event('cancel'));
        await pendiente.catch(() => {});
    });

    it('Android sigue con chooseFromGallery', async () => {
        plataforma.valor = 'android';
        const { chooseNativeChatImages } = await import('../utils/nativeChatImagePicker');
        await chooseNativeChatImages(2);
        expect(camara.pick).not.toHaveBeenCalled();
        expect(camara.choose).toHaveBeenCalled();
        expect(inputsAbiertos()).toHaveLength(0);
    });
});
