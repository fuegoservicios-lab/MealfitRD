/**
 * [P1-PLAN-LOTE-300 · 2026-09-25] En la app nativa la IMAGEN del día se comparte de verdad: se escribe en la caché
 * (`@capacitor/filesystem`) y va a la hoja del sistema (`@capacitor/share`) con el texto. Sin plugins: la Web Share.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const plataforma = { nativa: true, plugins: true };
const escritos = [];
const compartidos = [];
let fallarShare = null;

vi.mock('../config/platform', () => ({
    isNativeApp: () => plataforma.nativa,
    nativePluginAvailable: () => plataforma.plugins,
}));
vi.mock('@capacitor/filesystem', () => ({
    Directory: { Cache: 'CACHE' },
    Filesystem: { writeFile: vi.fn(async (o) => { escritos.push(o); return { uri: 'file:///cache/mi-dia-bioboros.png' }; }) },
}));
vi.mock('@capacitor/share', () => ({
    Share: { share: vi.fn(async (o) => { if (fallarShare) throw fallarShare; compartidos.push(o); }) },
}));

import { compartir, puedeCompartirNativo, archivoDeImagen } from '../utils/compartirDia';

const png = () => archivoDeImagen(new Blob(['PNGDATA'], { type: 'image/png' }));

beforeEach(() => {
    escritos.length = 0;
    compartidos.length = 0;
    fallarShare = null;
    plataforma.nativa = true;
    plataforma.plugins = true;
});

describe('[300] compartir la imagen en la app nativa', () => {
    it('escribe el PNG en la caché y lo comparte con el texto', async () => {
        expect(puedeCompartirNativo()).toBe(true);
        expect(await compartir({ archivo: png(), texto: 'Mi día en Bioboros' })).toBe('compartido');
        expect(escritos[0]).toMatchObject({ path: 'mi-dia-bioboros.png', directory: 'CACHE' });
        expect(escritos[0].data.length).toBeGreaterThan(0);                      // base64, sin el prefijo data:
        expect(escritos[0].data.startsWith('data:')).toBe(false);
        expect(compartidos[0]).toMatchObject({ text: 'Mi día en Bioboros', files: ['file:///cache/mi-dia-bioboros.png'] });
    });

    it('si el usuario cierra la hoja, es «cancelado», no un error', async () => {
        fallarShare = new Error('Share canceled');
        expect(await compartir({ archivo: png(), texto: 'x' })).toBe('cancelado');
    });

    it('sin los plugins (APK anterior) no intenta la vía nativa', () => {
        plataforma.plugins = false;
        expect(puedeCompartirNativo()).toBe(false);
    });
});
