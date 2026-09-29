/**
 * [P1-PLAN-LOTE-848 · 2026-09-29] En iPhone las fotos se eligen SIN pedir acceso a la fototeca.
 *
 * Auditoría App Store (fila 2.3, guía 5.1.1(iii), minimización): `Camera.pickImages` pedía acceso COMPLETO a Fotos
 * (`PHPhotoLibrary.requestAuthorization`) antes de abrir el selector, y con acceso limitado se caía a
 * `chooseFromGallery`, que pide lectura y escritura. En iOS la fototeca la abre ahora un `<input type="file"
 * accept="image/*">` oculto, que WKWebView sirve con `PHPickerViewController`, fuera de proceso y sin permiso.
 * Lo que no cambia: la forma de lo que se devuelve (File[] / File), el tope de 4 fotos, la reducción a 1.600 px
 * (calidad 0,85; la Nevera, 2.000 px a 0,9), hacer foto con la cámara (plugin), Android (plugin) y la web (null).
 *
 * El plugin de Capacitor está SIMULADO: lo que se prueba es que en iOS ya no se le pide la fototeca.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const plataforma = vi.hoisted(() => ({ nativa: true, nombre: 'ios' }));
// [848 · parte B] Estos casos son el RESPALDO: un binario sin el plugin `MfFotos` (el selector del binario va en
// lote848b.fotos.test.js).
vi.mock('../config/platform', () => ({
    isNativeApp: () => plataforma.nativa,
    nativePlatform: () => plataforma.nombre,
    nativePluginAvailable: () => false,
    registrarPluginNativo: () => { throw new Error('sin MfFotos no se registra nada'); },
}));

const marcas = vi.hoisted(() => []);
vi.mock('../utils/keyboardProbe', async (orig) => ({ ...(await orig()), marcarSondaTeclado: (n) => marcas.push(n) }));

const camara = vi.hoisted(() => ({ pickImages: null, chooseFromGallery: null, takePhoto: null }));
vi.mock('@capacitor/camera', () => ({
    MediaTypeSelection: { Photo: 'photo' },
    Camera: {
        pickImages: (o) => camara.pickImages(o),
        chooseFromGallery: (o) => camara.chooseFromGallery(o),
        takePhoto: (o) => camara.takePhoto(o),
    },
}));

const reduccion = vi.hoisted(() => ({ fallar: false, llamadas: [] }));
vi.mock('../utils/chatImageProcessing', async (orig) => ({
    ...(await orig()),
    reducirImagen: async (file, opciones) => {
        reduccion.llamadas.push({ file, opciones });
        if (reduccion.fallar) throw Object.assign(new Error('DECODE_FAILED'), { code: 'DECODE_FAILED' });
        return new Blob([`reducida:${file.name}`], { type: 'image/jpeg' });
    },
    precalentarWorkerDeImagen: () => {},
}));

import {
    FOTOS_POR_SELECCION,
    chooseNativeChatImages,
    chooseNativeGalleryImage,
    chooseNativeGalleryImages,
    isNativePickerCancellation,
    takeNativeChatPhoto,
} from '../utils/nativeChatImagePicker';

const foto = (nombre, tipo = 'image/jpeg') => new File([`original:${nombre}`], nombre, { type: tipo });
const inputs = () => Array.from(document.body.querySelectorAll('input[type="file"]'));
const elegir = (input, files) => {
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change'));
};
let clicks;

beforeEach(() => {
    plataforma.nativa = true;
    plataforma.nombre = 'ios';
    marcas.length = 0;
    reduccion.fallar = false;
    reduccion.llamadas = [];
    camara.pickImages = vi.fn(async () => ({ photos: [] }));
    camara.chooseFromGallery = vi.fn(async () => ({ results: [{ webPath: 'blob:x', metadata: { format: 'jpeg' } }] }));
    camara.takePhoto = vi.fn(async () => ({ webPath: 'blob:foto' }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) })));
    clicks = [];
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function registrar() {
        clicks.push(this);
        marcas.push('<click>');
    });
});
afterEach(() => {
    inputs().forEach((input) => input.remove());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('[848] iPhone: la fototeca por el selector del sistema, sin permiso', () => {
    it('el input se abre DENTRO del gesto: el click sale antes de que la función espere nada', async () => {
        const pendiente = chooseNativeChatImages(3);
        // Sin ningún `await` de por medio: WebKit solo abre el selector dentro del gesto del usuario.
        expect(clicks).toHaveLength(1);
        const [input] = inputs();
        expect(clicks[0]).toBe(input);
        expect(input.type).toBe('file');
        expect(input.accept).toBe('image/*');
        expect(input.multiple).toBe(true);
        expect(input.getAttribute('aria-hidden')).toBe('true');
        expect(input.style.display).not.toBe('none');
        elegir(input, [foto('a.jpg'), foto('b.png', 'image/png')]);
        const files = await pendiente;
        expect(files).toHaveLength(2);
        for (const [i, f] of files.entries()) {
            expect(f).toBeInstanceOf(File);
            expect(f.type).toBe('image/jpeg');
            expect(f.name).toMatch(new RegExp(`^imagen-\\d+-${i + 1}\\.jpg$`));
        }
        expect(await files[1].text()).toBe('reducida:b.png');
        expect(inputs()).toHaveLength(0);   // el input no se queda en el DOM
        expect(camara.pickImages).not.toHaveBeenCalled();
        expect(camara.chooseFromGallery).not.toHaveBeenCalled();
    });

    it('mismo tamaño y calidad que pedía al plugin: 1.600 px a 0,85 (chat y escáner)', async () => {
        const pendiente = chooseNativeGalleryImages(2);
        elegir(inputs()[0], [foto('plato.jpg')]);
        await pendiente;
        expect(reduccion.llamadas).toHaveLength(1);
        expect(reduccion.llamadas[0].opciones).toEqual({ maxSide: 1600, quality: 0.85 });
    });

    it('hasta 4: el selector del sistema no sabe limitar, así que se devuelven 4 y la pantalla recorta con su aviso', async () => {
        const pendiente = chooseNativeChatImages(2);
        const elegidas = Array.from({ length: 6 }, (_, i) => foto(`f${i}.jpg`));
        elegir(inputs()[0], elegidas);
        const files = await pendiente;
        expect(FOTOS_POR_SELECCION).toBe(4);
        expect(files).toHaveLength(4);
        // [848 · parte B] Solo se reducen las que caben (2): las otras dos van tal cual, para que la pantalla las cuente.
        expect(reduccion.llamadas.map((l) => l.file.name)).toEqual(['f0.jpg', 'f1.jpg']);
        expect(files[2]).toBe(elegidas[2]);
        expect(files[3]).toBe(elegidas[3]);
    });

    it('con sitio para una sola, el selector es de una sola', async () => {
        const pendiente = chooseNativeChatImages(1);
        expect(inputs()[0].multiple).toBe(false);
        elegir(inputs()[0], [foto('solo.jpg')]);
        expect(await pendiente).toHaveLength(1);
    });

    it('cancelar no es un error: se propaga como cancelación y el input desaparece', async () => {
        const pendiente = chooseNativeChatImages(4);
        inputs()[0].dispatchEvent(new Event('cancel'));
        const error = await pendiente.catch((e) => e);
        expect(isNativePickerCancellation(error)).toBe(true);
        expect(inputs()).toHaveLength(0);
        expect(reduccion.llamadas).toHaveLength(0);
    });

    it('un «change» sin archivos también es cancelar', async () => {
        const pendiente = chooseNativeChatImages(4);
        elegir(inputs()[0], []);
        expect(isNativePickerCancellation(await pendiente.catch((e) => e))).toBe(true);
    });

    it('la Nevera: UNA foto, sin «multiple», a 2.000 px y calidad 0,9, y devuelve un File', async () => {
        const pendiente = chooseNativeGalleryImage();
        const [input] = inputs();
        expect(input.multiple).toBe(false);
        elegir(input, [foto('nevera.heic', 'image/heic')]);
        const file = await pendiente;
        expect(file).toBeInstanceOf(File);
        expect(file.type).toBe('image/jpeg');
        expect(reduccion.llamadas[0].opciones).toEqual({ maxSide: 2000, quality: 0.9 });
    });

    it('si una foto no se deja reducir aquí, sigue tal cual: la pantalla la prepara con su propio camino', async () => {
        reduccion.fallar = true;
        const original = foto('rara.jpg');
        const pendiente = chooseNativeChatImages(4);
        elegir(inputs()[0], [original]);
        const [file] = await pendiente;
        expect(file).toBe(original);
    });

    it('una apertura que nunca contestó (iOS < 16.4 no emite «cancel») no deja inputs colgados', async () => {
        const primera = chooseNativeChatImages(4);
        const segunda = chooseNativeChatImages(4);
        expect(inputs()).toHaveLength(1);
        expect(clicks).toHaveLength(2);
        expect(inputs()[0]).toBe(clicks[1]);
        elegir(inputs()[0], [foto('x.jpg')]);
        expect(await segunda).toHaveLength(1);
        // La primera se suelta sin resolverse: rechazarla ejecutaría a destiempo el `finally` de quien la esperaba.
        const estado = await Promise.race([primera.then(() => 'resuelta', () => 'rechazada'), Promise.resolve('pendiente')]);
        expect(estado).toBe('pendiente');
    });

    it('marcas de la sonda: fSel → selector → fVuelve → fLeida', async () => {
        const pendiente = chooseNativeChatImages(2);
        elegir(inputs()[0], [foto('a.jpg')]);
        await pendiente;
        expect(marcas).toEqual(['fSel', '<click>', 'fVuelve', 'fLeida']);
    });

    it('hacer foto con la cámara sigue siendo el plugin, igual que antes', async () => {
        const files = await takeNativeChatPhoto();
        expect(files).toHaveLength(1);
        expect(inputs()).toHaveLength(0);
        expect(camara.takePhoto).toHaveBeenCalledWith(expect.objectContaining({
            quality: 85, targetWidth: 1600, targetHeight: 1600, correctOrientation: true, saveToGallery: false,
        }));
    });
});

describe('[848] lo que no cambia', () => {
    it('Android: el selector del plugin, sin input', async () => {
        plataforma.nombre = 'android';
        const files = await chooseNativeChatImages(3);
        expect(files).toHaveLength(1);
        expect(inputs()).toHaveLength(0);
        expect(clicks).toHaveLength(0);
        expect(camara.chooseFromGallery).toHaveBeenCalledWith(expect.objectContaining({
            limit: 3, allowMultipleSelection: true, quality: 85, targetWidth: 1600, targetHeight: 1600,
        }));
        await chooseNativeGalleryImage();
        expect(camara.chooseFromGallery).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1, quality: 90, targetWidth: 2000 }));
    });

    it('la web: null, ningún input y ningún plugin (cada pantalla sigue con su input de siempre)', async () => {
        plataforma.nativa = false;
        plataforma.nombre = 'web';
        expect(await chooseNativeChatImages(4)).toBeNull();
        expect(await chooseNativeGalleryImage()).toBeNull();
        expect(await takeNativeChatPhoto()).toBeNull();
        expect(inputs()).toHaveLength(0);
        expect(clicks).toHaveLength(0);
        expect(camara.chooseFromGallery).not.toHaveBeenCalled();
        expect(camara.pickImages).not.toHaveBeenCalled();
    });
});

// Las tres pantallas que eligen fotos en la app nativa llaman al selector SIN esperar nada antes (el gesto del usuario
// no sobrevive a un `await` en WebKit). Un refactor que meta una espera delante rompería la fototeca solo en iPhone.
describe('[848] los tres sitios que eligen fotos lo hacen dentro del gesto', () => {
    const leer = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');
    const antesDe = (src, desde, hasta) => {
        const i = src.indexOf(desde);
        expect(i).toBeGreaterThan(-1);
        const j = src.indexOf(hasta, i);
        expect(j).toBeGreaterThan(i);
        return src.slice(i, j);
    };

    it('chat (AgentPage): la hoja llama a runNativeImagePicker, que no espera antes de abrir la galería', () => {
        const src = leer('pages/AgentPage.jsx');
        expect(src).toContain("onGallery={() => runNativeImagePicker('gallery')}");
        const tramo = antesDe(src, 'const runNativeImagePicker = async (source) => {', 'chooseNativeChatImages(remaining)');
        expect(tramo.replace('await takeNativeChatPhoto()', '').replace(/await\s*$/, '')).not.toMatch(/\bawait\b/);
    });

    it('escáner de comida (ScanMealModal): openGallery no espera antes de abrir la galería', () => {
        const src = leer('components/dashboard/ScanMealModal.jsx');
        const tramo = antesDe(src, 'const openGallery = useCallback(async () => {', 'chooseNativeGalleryImages(');
        expect(tramo.replace(/await\s*$/, '')).not.toMatch(/\bawait\b/);
    });

    it('escáner de la Nevera (PantryScanButton): «Subir una foto» no espera antes de abrir la galería', () => {
        const src = leer('components/pantry/PantryScanButton.jsx');
        const tramo = antesDe(src, 'const handleFallbackToFile = async () => {', 'chooseNativeGalleryImage()');
        expect(tramo.replace(/await\s*$/, '')).not.toMatch(/\bawait\b/);
    });

    it('nadie más usa el plugin de cámara: todo pasa por nativeChatImagePicker', async () => {
        const { readdirSync, statSync } = await import('node:fs');
        const { join } = await import('node:path');
        const raiz = resolve(__dirname, '..');
        const encontrados = [];
        const recorrer = (dir) => {
            for (const nombre of readdirSync(dir)) {
                const ruta = join(dir, nombre);
                if (statSync(ruta).isDirectory()) { if (nombre !== '__tests__') recorrer(ruta); continue; }
                if (!/\.(jsx?|tsx?)$/.test(nombre)) continue;
                if (readFileSync(ruta, 'utf8').includes('@capacitor/camera')) encontrados.push(ruta.slice(raiz.length + 1).replace(/\\/g, '/'));
            }
        };
        recorrer(raiz);
        expect(encontrados).toEqual(['utils/nativeChatImagePicker.js']);
    });
});
