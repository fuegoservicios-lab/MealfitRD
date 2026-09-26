// [P1-PLAN-LOTE-346 · 2026-09-26] ¿De dónde sale el segundo congelado al volver de la galería?
//
// La sonda del dueño (paquete 20260926-015804): al volver de la galería con el teclado abierto, `pausa 919ms` con la
// caja clavada a media subida. Puede ser el plugin nativo reduciendo/recodificando la foto en el hilo principal de la
// app (la web no pinta mientras) o algo nuestro en JS. Las marcas de la sonda lo separan: fSel (se abre el selector),
// fVuelve (el sistema devuelve la foto), fLeida (archivo listo), prepW/prepP (preparación en worker / hilo principal),
// prepFin, fKb (se repone el teclado). Además la foto se pide a 1600 px y calidad 85: se reducía a 1600 de todos modos,
// y 2000 px a calidad 90 era trabajo nativo tirado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const marcas = vi.hoisted(() => []);
vi.mock('../utils/keyboardProbe', async (orig) => ({ ...(await orig()), marcarSondaTeclado: (n) => marcas.push(n) }));
vi.mock('../config/platform', () => ({ isNativeApp: () => true }));
const opciones = vi.hoisted(() => ({}));
vi.mock('@capacitor/camera', () => ({
    MediaTypeSelection: { Photo: 'photo' },
    Camera: {
        chooseFromGallery: vi.fn(async (o) => { Object.assign(opciones, o); marcas.push('<nativo>'); return { results: [{ webPath: 'blob:x', metadata: { format: 'jpeg' } }] }; }),
        takePhoto: vi.fn(async (o) => { Object.assign(opciones, o); return { webPath: 'blob:x' }; }),
    },
}));

beforeEach(() => {
    marcas.length = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) })));
});

describe('[346] marcas del viaje de la foto', () => {
    it('selector → vuelve → leída, en ese orden y alrededor del plugin', async () => {
        const { chooseNativeChatImages } = await import('../utils/nativeChatImagePicker');
        const files = await chooseNativeChatImages(2);
        expect(files).toHaveLength(1);
        expect(marcas).toEqual(['fSel', '<nativo>', 'fVuelve', 'fLeida']);
    });

    it('la foto se pide a 1600 px y calidad 85 (se reduce a 1600 igualmente)', async () => {
        const { chooseNativeChatImages, takeNativeChatPhoto } = await import('../utils/nativeChatImagePicker');
        await chooseNativeChatImages(1);
        expect(opciones).toMatchObject({ targetWidth: 1600, targetHeight: 1600, quality: 85 });
        await takeNativeChatPhoto();
        expect(opciones).toMatchObject({ targetWidth: 1600, targetHeight: 1600, quality: 85 });
    });

    it('la preparación marca por dónde va (hilo principal en jsdom) y cuándo acaba', async () => {
        const m = await import('../utils/chatImageProcessing');
        vi.spyOn(m._internals, 'prepararEnHiloPrincipal').mockResolvedValue({ file: new File(['x'], 'a.jpg'), thumbDataUrl: 'data:,', width: 1, height: 1 });
        await m.prepareChatImage(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
        expect(marcas).toEqual(['prepP', 'prepFin']);
    });

    it('al reponer el teclado tras la foto también deja marca', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const ap = readFileSync(resolve(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        const k = ap.indexOf('const restoreChatKeyboardAfterAttachment = () => {');
        expect(ap.slice(k, k + 700)).toContain("marcarSondaTeclado('fKb')");
    });
});
