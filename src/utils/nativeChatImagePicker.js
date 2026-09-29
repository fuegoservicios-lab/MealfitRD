import { isNativeApp, nativePlatform, nativePluginAvailable, registrarPluginNativo } from '../config/platform';
import { marcarSondaTeclado } from './keyboardProbe';
import { CHAT_IMAGE_MAX_COUNT, mapWithConcurrency, precalentarWorkerDeImagen, reducirImagen } from './chatImageProcessing';

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

/** Tope de fotos por selección, en las dos plataformas (el chat y el escáner admiten hasta 4). [P1-PLAN-LOTE-848] Es
 *  el MISMO número que el tope del chat: un alias, no una copia que pueda divergir. */
export const FOTOS_POR_SELECCION = CHAT_IMAGE_MAX_COUNT;

// [P1-PLAN-LOTE-367 · 2026-09-26] ANDROID: la fototeca del plugin (`chooseFromGallery`, el selector de fotos de
// Android, que no pide permiso). En iPhone el plugin ya no se usa para elegir fotos: ver `abrirSelectorDelSistema`.
// Devuelve `[{ webPath, metadata: { format } }]`, que es lo que lee `mediaResultToFile`.
async function elegirDeLaFototeca({ limit, quality, size }) {
    const { Camera, MediaTypeSelection } = await import('@capacitor/camera');
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

// ── [P1-PLAN-LOTE-848 · 2026-09-29] iPhone: las fotos, sin pedir acceso a la fototeca ─────────────────────────────────
// Auditoría App Store (fila 2.3, guía 5.1.1(iii)): `Camera.pickImages` pedía acceso COMPLETO a Fotos
// (`PHPhotoLibrary.requestAuthorization`) antes de abrir el selector, y con acceso limitado se caía a
// `chooseFromGallery`, que pide lectura y escritura. El `<input type="file">` de WebKit abre `PHPickerViewController`,
// fuera de proceso: la app solo recibe las fotos que la persona elige y iOS no pregunta nada.
// Lo que cuesta, a sabiendas (§A.7, sin Swift nuevo): antes del selector iOS enseña su menú de tres opciones
// (Fototeca / Hacer foto / Seleccionar archivo) —el que los lotes 105 y 110 habían quitado— y el selector no puede
// limitar cuántas se eligen: se devuelven hasta FOTOS_POR_SELECCION y cada pantalla recorta con su aviso, como en la web.
// [P1-PLAN-LOTE-848 · parte B] Por eso el `<input>` es ya solo el RESPALDO de los binarios sin `MfFotos` (abajo).
// Hacer foto con la cámara sigue yendo por el plugin (`takeNativeChatPhoto`), y Android no cambia.

const errorDeCancelacion = () => Object.assign(new Error('User cancelled photos app'), { code: 'NATIVE_PICKER_CANCELLED' });

// La apertura anterior que nunca contestó. En iOS < 16.4 WebKit no emite `cancel`: si la persona cerró el selector sin
// elegir, esa promesa se queda pendiente. La siguiente apertura retira su input y la suelta SIN resolverla —rechazarla
// ejecutaría a destiempo el `finally` de quien la esperaba (el chat repone el teclado mientras el nuevo selector sube)—.
let seleccionPendiente = null;

// ── [P1-PLAN-LOTE-848 · parte B] El selector del BINARIO: PHPicker directo, sin el menú de tres opciones ─────────────
// Los binarios nuevos traen el plugin local `MfFotos` (SceneDelegate.swift): abre `PHPickerViewController` sin pedir
// permiso y SIN el menú «Fototeca / Hacer foto / Seleccionar archivo» que enseña el `<input>` (el que los lotes 105 y 110
// habían quitado). Limita cuántas se eligen, endereza cada foto y la entrega reducida en JPEG, como data URL. Los
// binarios anteriores no lo traen y siguen con el `<input>` de abajo: la elección se hace SÍNCRONA, antes de cualquier
// `await`, porque el `<input>` necesita el gesto del usuario intacto.
const selectorDelBinario = () => nativePluginAvailable('MfFotos');

// Se registra al PRIMER uso y nunca sale de una función `async`: un plugin de Capacitor es un Proxy, el motor le leería
// `.then` y la promesa se colgaría (la trampa del lote 133). Perezoso para no tocar Capacitor al importar el módulo.
let pluginDeFotos = null;
const mfFotos = () => {
    if (!pluginDeFotos) pluginDeFotos = registrarPluginNativo('MfFotos');
    return pluginDeFotos;
};

const dataUrlAFile = (dataUrl, nombre) => {
    const binario = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    return new File([bytes], nombre, { type: 'image/jpeg', lastModified: Date.now() });
};

// Pide las fotos al binario. Devuelve las data URL (ya reducidas); una lista vacía es que la persona canceló.
async function pedirAlBinario({ limite, lado, calidad }) {
    const respuesta = await mfFotos().pick({ limit: limite, maxSide: lado, quality: calidad });
    const urls = (Array.isArray(respuesta?.images) ? respuesta.images : [])
        .filter((u) => typeof u === 'string' && u.startsWith('data:image/'));
    if (!urls.length) throw errorDeCancelacion();
    return urls.slice(0, limite);
}

const filesDelBinario = (urls) => {
    const marca = Date.now();
    return urls.map((url, indice) => dataUrlAFile(url, `imagen-${marca}-${indice + 1}.jpg`));
};

// Lo que va hasta `input.click()` es SÍNCRONO a propósito: WebKit solo abre el selector dentro del gesto del usuario,
// y un `await` antes de este punto lo perdería. Por eso las funciones públicas llaman aquí antes de esperar nada.
function abrirSelectorDelSistema({ varias }) {
    seleccionPendiente?.soltar();
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = Boolean(varias);
        input.tabIndex = -1;
        input.setAttribute('aria-hidden', 'true');
        // Fuera de la vista pero renderizado, sin depender de cómo trate cada WebKit un input con `display:none`.
        input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        let viva = true;
        const soltar = () => {
            if (!viva) return false;
            viva = false;
            input.removeEventListener('change', alElegir);
            input.removeEventListener('cancel', alCancelar);
            input.remove();
            if (seleccionPendiente?.input === input) seleccionPendiente = null;
            return true;
        };
        function alElegir() {
            const elegidas = Array.from(input.files || []);
            if (!soltar()) return;
            if (elegidas.length) resolve(elegidas);
            else reject(errorDeCancelacion());
        }
        function alCancelar() {
            if (soltar()) reject(errorDeCancelacion());
        }
        input.addEventListener('change', alElegir);
        input.addEventListener('cancel', alCancelar);
        seleccionPendiente = { input, soltar };
        document.body.appendChild(input);
        input.click();
        // El worker de imagen arranca mientras la persona elige (su arranque le cuesta ~130 ms al hilo principal).
        precalentarWorkerDeImagen();
    });
}

// Lo que hacía el plugin con cada foto: reducirla a `lado` px y recodificarla en JPEG. De dos en dos, como el chat (un
// bitmap de 12 MP son ~48 MB). Si esta foto no se deja reducir aquí, sigue tal cual: la pantalla que la recibe la prepara
// con su propio camino y, si tampoco puede, lo dice con su mensaje — como en la web.
// [P1-PLAN-LOTE-848 · parte B] Solo se reducen las que CABEN (`tope`): el `<input>` no sabe limitar, y las que sobran
// siguen tal cual para que la pantalla las cuente y recorte con su aviso, sin haber gastado una decodificación en ellas.
function reducirFotosElegidas(fotos, tope, { lado, calidad }) {
    const marca = Date.now();
    return mapWithConcurrency(fotos, 2, async (foto, indice) => {
        if (indice >= tope) return foto;
        try {
            const jpeg = await reducirImagen(foto, { maxSide: lado, quality: calidad });
            return new File([jpeg], `imagen-${marca}-${indice + 1}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
        } catch {
            return foto;
        }
    });
}

export async function chooseNativeChatImages(limit = 4) {
    if (!isNativeApp()) return null;
    // [P1-PLAN-LOTE-346] Marcas de la sonda alrededor del selector (¿el congelado es nativo o nuestro?) y la foto a
    // 1600 px / calidad 85: la web la reduce a 1600 igualmente, así que 2000 px a calidad 90 era trabajo tirado.
    marcarSondaTeclado('fSel');
    const tope = Math.max(1, Math.min(Number(limit) || 1, FOTOS_POR_SELECCION));
    if (nativePlatform() === 'ios') {
        if (selectorDelBinario()) {
            precalentarWorkerDeImagen();   // la pantalla preparará la foto (miniatura) al volver
            const urls = await pedirAlBinario({ limite: tope, lado: 1600, calidad: 0.85 });
            marcarSondaTeclado('fVuelve');
            const files = filesDelBinario(urls);
            marcarSondaTeclado('fLeida');
            return files;
        }
        const elegidas = await abrirSelectorDelSistema({ varias: tope > 1 });
        marcarSondaTeclado('fVuelve');
        const files = await reducirFotosElegidas(elegidas.slice(0, FOTOS_POR_SELECCION), tope, { lado: 1600, calidad: 0.85 });
        marcarSondaTeclado('fLeida');
        return files;
    }
    const results = await elegirDeLaFototeca({ limit: tope, quality: 85, size: 1600 });
    marcarSondaTeclado('fVuelve');
    const files = await Promise.all(results.slice(0, FOTOS_POR_SELECCION).map(mediaResultToFile));
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

// [P1-PLAN-LOTE-105 · 2026-09-18] UNA foto de la fototeca, para el escáner de la Nevera. En Android el plugin abre el
// selector de fotos del sistema directo. [P1-PLAN-LOTE-848] En iPhone, el selector del binario (`MfFotos`, directo y sin
// permiso) y, en un binario anterior, el input de WebKit (sin permiso, pero con el menú de tres opciones). En la web
// devuelve null y el escáner sigue con su input.
export async function chooseNativeGalleryImage() {
    if (!isNativeApp()) return null;
    if (nativePlatform() === 'ios') {
        if (selectorDelBinario()) {
            const [file] = filesDelBinario(await pedirAlBinario({ limite: 1, lado: 2000, calidad: 0.9 }));
            return file || null;
        }
        const elegidas = await abrirSelectorDelSistema({ varias: false });
        const [file] = await reducirFotosElegidas(elegidas.slice(0, 1), 1, { lado: 2000, calidad: 0.9 });
        return file || null;
    }
    const results = await elegirDeLaFototeca({ limit: 1, quality: 90, size: 2000 });
    if (!results.length) return null;
    return mediaResultToFile(results[0], 0);
}
