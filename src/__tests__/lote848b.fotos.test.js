/**
 * [P1-PLAN-LOTE-848 · parte B · 2026-09-29] En iPhone, la fototeca por el plugin del binario `MfFotos` (PHPicker
 * directo, sin permiso y SIN el menú «Fototeca / Hacer foto / Seleccionar archivo» que enseña el `<input>`).
 *
 * Qué se fija:
 *  - con el plugin en el binario se le piden las fotos a él (tope, 1.600 px a 0,85; la Nevera, 2.000 px a 0,9) y
 *    no se crea ningún `<input>`; sin el plugin, el `<input>` de la parte A (lote848.picker.test.js);
 *  - la elección es SÍNCRONA: el plugin se consulta y se llama antes de cualquier `await` (el `<input>` de respaldo
 *    necesita el gesto intacto);
 *  - lo que devuelve el binario (data URL JPEG) se convierte en `File` con la forma de siempre; `images: []` = cancelar;
 *  - el Swift del plugin: PHPicker sin `requestAuthorization`, tope 4, orientación y reducción nativas, y el registro
 *    en el controlador propio, como `MfAppleSignIn`;
 *  - `FOTOS_POR_SELECCION` es un alias de `CHAT_IMAGE_MAX_COUNT`, y la salida del visor del escáner de comida abre la
 *    galería sin esperar nada antes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const plataforma = vi.hoisted(() => ({ nativa: true, nombre: 'ios', conPlugin: true, consultas: [], registros: [] }));
const binario = vi.hoisted(() => ({ pick: null }));
vi.mock('../config/platform', () => ({
    isNativeApp: () => plataforma.nativa,
    nativePlatform: () => plataforma.nombre,
    nativePluginAvailable: (nombre) => { plataforma.consultas.push(nombre); return plataforma.conPlugin && nombre === 'MfFotos'; },
    registrarPluginNativo: (nombre) => { plataforma.registros.push(nombre); return { pick: (o) => binario.pick(o) }; },
}));

const marcas = vi.hoisted(() => []);
vi.mock('../utils/keyboardProbe', async (orig) => ({ ...(await orig()), marcarSondaTeclado: (n) => marcas.push(n) }));

const camara = vi.hoisted(() => ({ chooseFromGallery: null }));
vi.mock('@capacitor/camera', () => ({
    MediaTypeSelection: { Photo: 'photo' },
    Camera: {
        pickImages: () => { throw new Error('pickImages no debe usarse'); },
        chooseFromGallery: (o) => camara.chooseFromGallery(o),
        takePhoto: () => ({ webPath: 'blob:foto' }),
    },
}));

const reduccion = vi.hoisted(() => ({ llamadas: [] }));
vi.mock('../utils/chatImageProcessing', async (orig) => ({
    ...(await orig()),
    reducirImagen: async (file, opciones) => {
        reduccion.llamadas.push({ file, opciones });
        return new Blob(['r'], { type: 'image/jpeg' });
    },
    precalentarWorkerDeImagen: () => {},
}));

import {
    FOTOS_POR_SELECCION,
    chooseNativeChatImages,
    chooseNativeGalleryImage,
    chooseNativeGalleryImages,
    isNativePickerCancellation,
} from '../utils/nativeChatImagePicker';
import { CHAT_IMAGE_MAX_COUNT } from '../utils/chatImageProcessing';

const JPEG_BYTES = [0xFF, 0xD8, 0xFF, 0xD9];
const dataUrl = (bytes = JPEG_BYTES) => `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`;
const inputs = () => Array.from(document.body.querySelectorAll('input[type="file"]'));
let clicks;

beforeEach(() => {
    plataforma.nativa = true;
    plataforma.nombre = 'ios';
    plataforma.conPlugin = true;
    plataforma.consultas = [];
    marcas.length = 0;
    reduccion.llamadas = [];
    binario.pick = vi.fn(async ({ limit }) => ({ images: Array.from({ length: limit }, () => dataUrl()) }));
    camara.chooseFromGallery = vi.fn(async () => ({ results: [{ webPath: 'blob:x', metadata: { format: 'jpeg' } }] }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) })));
    clicks = [];
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function registrar() { clicks.push(this); });
});
afterEach(() => {
    inputs().forEach((input) => input.remove());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('[848-B] iPhone con MfFotos: el selector del binario, sin <input> ni menú de tres opciones', () => {
    it('chat: pide al binario el tope, 1.600 px y 0,85, y devuelve Files JPEG con el nombre de siempre', async () => {
        const files = await chooseNativeChatImages(3);
        expect(binario.pick).toHaveBeenCalledWith({ limit: 3, maxSide: 1600, quality: 0.85 });
        expect(files).toHaveLength(3);
        for (const [i, f] of files.entries()) {
            expect(f).toBeInstanceOf(File);
            expect(f.type).toBe('image/jpeg');
            expect(f.name).toMatch(new RegExp(`^imagen-\\d+-${i + 1}\\.jpg$`));
            expect(Array.from(new Uint8Array(await f.arrayBuffer()))).toEqual(JPEG_BYTES);
        }
        expect(inputs()).toHaveLength(0);
        expect(clicks).toHaveLength(0);
        expect(reduccion.llamadas).toHaveLength(0);   // ya viene reducida por el binario
        expect(marcas).toEqual(['fSel', 'fVuelve', 'fLeida']);
    });

    it('la elección es SÍNCRONA: el binario ya recibió la petición antes del primer await', () => {
        const pendiente = chooseNativeChatImages(2);
        expect(plataforma.consultas).toContain('MfFotos');
        expect(binario.pick).toHaveBeenCalledTimes(1);
        expect(inputs()).toHaveLength(0);
        return pendiente;
    });

    it('el tope nunca pasa de 4, aunque el llamador pida más', async () => {
        await chooseNativeGalleryImages(9);
        expect(binario.pick).toHaveBeenCalledWith(expect.objectContaining({ limit: 4 }));
    });

    it('si el binario devolviera de más, se recorta al tope pedido', async () => {
        binario.pick = vi.fn(async () => ({ images: [dataUrl(), dataUrl(), dataUrl()] }));
        expect(await chooseNativeChatImages(1)).toHaveLength(1);
    });

    it('cancelar (images: []) se propaga como cancelación, no como error', async () => {
        binario.pick = vi.fn(async () => ({ images: [] }));
        const error = await chooseNativeChatImages(4).catch((e) => e);
        expect(isNativePickerCancellation(error)).toBe(true);
        binario.pick = vi.fn(async () => ({}));
        expect(isNativePickerCancellation(await chooseNativeGalleryImage().catch((e) => e))).toBe(true);
    });

    it('un error del binario llega tal cual a la pantalla (que lo reporta y ofrece su input)', async () => {
        binario.pick = vi.fn(async () => { throw Object.assign(new Error('no hay vista'), { code: 'SIN_VISTA' }); });
        const error = await chooseNativeChatImages(2).catch((e) => e);
        expect(error.code).toBe('SIN_VISTA');
        expect(isNativePickerCancellation(error)).toBe(false);
    });

    it('la Nevera: UNA foto a 2.000 px y 0,9, y devuelve un File', async () => {
        const file = await chooseNativeGalleryImage();
        expect(binario.pick).toHaveBeenCalledWith({ limit: 1, maxSide: 2000, quality: 0.9 });
        expect(file).toBeInstanceOf(File);
        expect(file.type).toBe('image/jpeg');
        expect(inputs()).toHaveLength(0);
    });

    it('lo que no es una data URL de imagen se descarta', async () => {
        binario.pick = vi.fn(async () => ({ images: ['javascript:alert(1)', 42, dataUrl()] }));
        expect(await chooseNativeChatImages(4)).toHaveLength(1);
    });

    it('el plugin se registra al primer uso, una sola vez, con su nombre', async () => {
        await chooseNativeChatImages(1);
        await chooseNativeGalleryImage();
        expect(plataforma.registros.filter((n) => n === 'MfFotos')).toHaveLength(1);
    });
});

describe('[848-B] lo que no cambia', () => {
    it('iPhone SIN el plugin (binario anterior): el <input> de respaldo, abierto dentro del gesto', () => {
        plataforma.conPlugin = false;
        const pendiente = chooseNativeChatImages(2);
        expect(clicks).toHaveLength(1);
        expect(binario.pick).not.toHaveBeenCalled();
        clicks[0].dispatchEvent(new Event('cancel'));
        return pendiente.catch((e) => expect(isNativePickerCancellation(e)).toBe(true));
    });

    it('Android: el plugin de cámara aunque existiera MfFotos', async () => {
        plataforma.nombre = 'android';
        await chooseNativeChatImages(2);
        expect(camara.chooseFromGallery).toHaveBeenCalled();
        expect(binario.pick).not.toHaveBeenCalled();
    });

    it('la web: null, sin plugin ni input', async () => {
        plataforma.nativa = false;
        expect(await chooseNativeChatImages(4)).toBeNull();
        expect(await chooseNativeGalleryImage()).toBeNull();
        expect(binario.pick).not.toHaveBeenCalled();
        expect(clicks).toHaveLength(0);
    });

    it('FOTOS_POR_SELECCION es el tope del chat (un alias, no una copia)', () => {
        expect(FOTOS_POR_SELECCION).toBe(CHAT_IMAGE_MAX_COUNT);
        const src = readFileSync(resolve(__dirname, '../utils/nativeChatImagePicker.js'), 'utf8');
        expect(src).toContain('export const FOTOS_POR_SELECCION = CHAT_IMAGE_MAX_COUNT;');
    });
});

const leer = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('[848-B] escáner de comida: la salida del visor abre la galería dentro del gesto', () => {
    it('handleViewfinderFallback no es async ni espera nada antes de openGallery', () => {
        const src = leer('components/dashboard/ScanMealModal.jsx');
        const i = src.indexOf('const handleViewfinderFallback = useCallback(() => {');
        expect(i).toBeGreaterThan(-1);
        const j = src.indexOf('openGallery()', i);
        expect(j).toBeGreaterThan(i);
        expect(src.slice(i, j)).not.toMatch(/\bawait\b|\basync\b|\.then\(/);
        expect(src).toContain('onFallbackToFile={handleViewfinderFallback}');
    });
});

describe('[848-B] el binario: MfFotos en SceneDelegate.swift', () => {
    const swift = readFileSync(resolve(__dirname, '../../ios/App/App/SceneDelegate.swift'), 'utf8').replace(/\r\n/g, '\n');
    const plugin = swift.slice(swift.indexOf('final class MfFotosPlugin'), swift.indexOf('private final class FotosRecogidas'));

    it('registrado por el controlador propio, como MfAppleSignIn, con su nombre JS', () => {
        expect(swift).toContain('bridge?.registerPluginInstance(MfFotosPlugin())');
        expect(swift).toContain('@objc(MfFotosPlugin)');
        expect(plugin).toContain('let jsName = "MfFotos"');
        expect(plugin).toContain('CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise)');
        expect(swift).toMatch(/^import PhotosUI$/m);
        expect(swift).toMatch(/^import UniformTypeIdentifiers$/m);
        expect(swift).toMatch(/^import ImageIO$/m);
    });

    it('PHPicker sin permiso: solo imágenes, tope 4, y jamás requestAuthorization ni la fototeca compartida', () => {
        expect(plugin).toContain('var configuracion = PHPickerConfiguration()');
        expect(plugin).toContain('configuracion.filter = .images');
        expect(plugin).toContain('configuracion.selectionLimit = limite');
        expect(plugin).toContain('let limite = max(1, min(call.getInt("limit") ?? 1, 4))');
        const codigo = swift.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');   // sin comentarios
        expect(codigo).not.toMatch(/requestAuthorization|PHPhotoLibrary|photoLibrary: \.shared/);
    });

    it('cada foto: sus bytes por loadDataRepresentation, derecha y reducida por ImageIO, en JPEG y como data URL', () => {
        expect(plugin).toContain('proveedor.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier)');
        expect(plugin).toContain('kCGImageSourceCreateThumbnailWithTransform: true');
        expect(plugin).toContain('kCGImageSourceThumbnailMaxPixelSize: Int(lado)');
        expect(plugin).toContain('.jpegData(compressionQuality: calidad)');
        expect(plugin).toContain('"data:image/jpeg;base64," + jpeg.base64EncodedString()');
    });

    it('cancelar resuelve una lista vacía y la llamada nunca se queda colgada', () => {
        expect(plugin).toContain('llamada.resolve(["images": [String]()])');
        expect(plugin).toContain('func presentationControllerDidDismiss(_ presentationController: UIPresentationController)');
        expect(plugin.match(/bridge\?\.releaseCall\(llamada\)/g).length).toBeGreaterThanOrEqual(4);
    });
});
